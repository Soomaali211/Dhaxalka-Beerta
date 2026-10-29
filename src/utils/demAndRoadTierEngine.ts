import { AssetQualityTier } from '../types/inheritance';
import {
  AutoTierEvaluationSummary,
  BlockDetailedMetadata,
  GeneratedBlock,
  GeneratedPlot,
  LandSubdivisionState,
  ParsedGeoItem,
  PlotDetailedMetadata,
  Point2D,
  SiteQualityRating,
  SubdivisionComputationResult,
  WadiStatus,
} from '../types/landSubdivision';
import {
  buildSampleBlockCandidates,
  createAuditEntry,
  parseGeoJsonItems,
  pickBestBoundaryIndex,
} from './landSubdivisionEngine';
import { normalizeGeoJsonCrsToWgs84 } from './pdfCartographyEngine';

/* ============================================================================
 * 1. GEOMETRY & POINT-TO-POLYLINE / LASSO HELPERS
 * ============================================================================ */

export function pointToSegmentDistanceUtm(p: Point2D, a: Point2D, b: Point2D): {
  dist: number;
  closest: Point2D;
} {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) {
    return { dist: Math.hypot(p[0] - a[0], p[1] - a[1]), closest: a };
  }
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + t * dx;
  const cy = a[1] + t * dy;
  return { dist: Math.hypot(p[0] - cx, p[1] - cy), closest: [cx, cy] };
}

export function pointToPolylineDistanceUtm(
  p: Point2D,
  line: Point2D[]
): { dist: number; closest: Point2D } {
  if (line.length === 0) return { dist: Infinity, closest: p };
  if (line.length === 1) {
    return {
      dist: Math.hypot(p[0] - line[0][0], p[1] - line[0][1]),
      closest: line[0],
    };
  }
  let bestDist = Infinity;
  let bestPt: Point2D = line[0];
  for (let i = 0; i < line.length - 1; i++) {
    const res = pointToSegmentDistanceUtm(p, line[i], line[i + 1]);
    if (res.dist < bestDist) {
      bestDist = res.dist;
      bestPt = res.closest;
    }
  }
  return { dist: bestDist, closest: bestPt };
}

function segmentsCross2D(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
  const orient = (p: Point2D, q: Point2D, r: Point2D) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 <= 0 && o3 * o4 <= 0;
}

export function pointInPolygon2D(pt: Point2D, ring: Point2D[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonToPolylineDistanceUtm(poly: Point2D[], line: Point2D[]): number {
  if (poly.length === 0 || line.length === 0) return Infinity;
  // Check if any vertex of line is inside poly
  for (const lp of line) {
    if (pointInPolygon2D(lp, poly)) return 0;
  }
  // Check segment intersections
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    for (let j = 0; j < line.length - 1; j++) {
      if (segmentsCross2D(a, b, line[j], line[j + 1])) return 0;
    }
  }
  // Otherwise min vertex-to-segment distance both ways
  let minD = Infinity;
  for (const p of poly) {
    const d = pointToPolylineDistanceUtm(p, line).dist;
    if (d < minD) minD = d;
  }
  for (const lp of line) {
    for (let i = 0; i < poly.length; i++) {
      const d = pointToSegmentDistanceUtm(lp, poly[i], poly[(i + 1) % poly.length]).dist;
      if (d < minD) minD = d;
    }
  }
  return minD;
}

/* ============================================================================
 * 2. ONLINE + OFFLINE DEM ELEVATION SAMPLER (TERRARIUM TILES + OPEN-METEO + 3D Z)
 * ============================================================================ */

export interface DemSampler {
  sourceLabel: string;
  hasRealElevation: boolean;
  sampleLonLat: (lon: number, lat: number) => number | null;
}

function lonLatToTileFraction(lon: number, lat: number, z: number): { fx: number; fy: number } {
  const n = Math.pow(2, z);
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const fx = ((lon + 180) / 360) * n;
  const fy =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { fx, fy };
}

async function fetchTerrariumTileImageData(
  z: number,
  tx: number,
  ty: number,
  timeoutMs = 5500
): Promise<Uint8ClampedArray | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => {
      img.src = '';
      resolve(null);
    }, timeoutMs);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, 256, 256);
        const data = ctx.getImageData(0, 0, 256, 256).data;
        resolve(data);
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };

    img.src = url;
  });
}

function decodeTerrariumPixel(data: Uint8ClampedArray, px: number, py: number): number {
  const x = Math.max(0, Math.min(255, px));
  const y = Math.max(0, Math.min(255, py));
  const idx = (y * 256 + x) * 4;
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  return r * 256 + g + b / 256 - 32768;
}

/**
 * Attempts to build a high-resolution (~5m–10m) global DEM sampler over the farm's
 * WGS84 bounding box using AWS OpenData Terrarium PNG tiles, with Open-Meteo 30m DEM
 * fallback and 3D GeoJSON Z-coordinate fallback.
 */
export async function buildDemSamplerForSubdivision(
  subdivision: SubdivisionComputationResult,
  rawZPointsLonLatElev?: [number, number, number][]
): Promise<DemSampler> {
  const boundaryLonLat = subdivision.bring.map((pt) => subdivision.inv(pt));
  const lons = boundaryLonLat.map((p) => p[0]);
  const lats = boundaryLonLat.map((p) => p[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  // 1. Try AWS OpenData Terrarium Tiles (Zoom 15 if <= 6 tiles, else Zoom 14)
  if (typeof window !== 'undefined' && navigator.onLine !== false) {
    let zoom = 15;
    let tMin = lonLatToTileFraction(minLon, maxLat, zoom);
    let tMax = lonLatToTileFraction(maxLon, minLat, zoom);
    let tx0 = Math.floor(tMin.fx);
    let tx1 = Math.floor(tMax.fx);
    let ty0 = Math.floor(tMin.fy);
    let ty1 = Math.floor(tMax.fy);

    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 6) {
      zoom = 14;
      tMin = lonLatToTileFraction(minLon, maxLat, zoom);
      tMax = lonLatToTileFraction(maxLon, minLat, zoom);
      tx0 = Math.floor(tMin.fx);
      tx1 = Math.floor(tMax.fx);
      ty0 = Math.floor(tMin.fy);
      ty1 = Math.floor(tMax.fy);
    }

    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 9) {
      const tileMap = new Map<string, Uint8ClampedArray>();
      const jobs: Promise<void>[] = [];
      for (let tx = tx0; tx <= tx1; tx++) {
        for (let ty = ty0; ty <= ty1; ty++) {
          jobs.push(
            fetchTerrariumTileImageData(zoom, tx, ty).then((buf) => {
              if (buf) tileMap.set(`${tx}_${ty}`, buf);
            })
          );
        }
      }
      await Promise.all(jobs);

      if (tileMap.size > 0) {
        return {
          sourceLabel: `DEM Caalami ah (Terrarium Z${zoom})`,
          hasRealElevation: true,
          sampleLonLat: (lon: number, lat: number) => {
            const { fx, fy } = lonLatToTileFraction(lon, lat, zoom);
            const tx = Math.floor(fx);
            const ty = Math.floor(fy);
            const buf = tileMap.get(`${tx}_${ty}`);
            if (!buf) return null;
            const subX = (fx - tx) * 256 - 0.5;
            const subY = (fy - ty) * 256 - 0.5;
            const x0 = Math.floor(subX);
            const y0 = Math.floor(subY);
            const wx = subX - x0;
            const wy = subY - y0;
            const z00 = decodeTerrariumPixel(buf, x0, y0);
            const z10 = decodeTerrariumPixel(buf, x0 + 1, y0);
            const z01 = decodeTerrariumPixel(buf, x0, y0 + 1);
            const z11 = decodeTerrariumPixel(buf, x0 + 1, y0 + 1);
            const top = z00 * (1 - wx) + z10 * wx;
            const bot = z01 * (1 - wx) + z11 * wx;
            const elev = top * (1 - wy) + bot * wy;
            return Number.isFinite(elev) && elev > -500 && elev < 9000 ? elev : null;
          },
        };
      }
    }

    // 2. Fallback: Open-Meteo 30m Global DEM Grid (9x9 = 81 sample grid over farm bbox + bilinear interp)
    try {
      const gridN = 9;
      const latPad = Math.max(0.0005, (maxLat - minLat) * 0.08);
      const lonPad = Math.max(0.0005, (maxLon - minLon) * 0.08);
      const gLat0 = minLat - latPad;
      const gLat1 = maxLat + latPad;
      const gLon0 = minLon - lonPad;
      const gLon1 = maxLon + lonPad;

      const reqLats: number[] = [];
      const reqLons: number[] = [];
      for (let r = 0; r < gridN; r++) {
        const lat = gLat0 + (r / (gridN - 1)) * (gLat1 - gLat0);
        for (let c = 0; c < gridN; c++) {
          const lon = gLon0 + (c / (gridN - 1)) * (gLon1 - gLon0);
          reqLats.push(+lat.toFixed(6));
          reqLons.push(+lon.toFixed(6));
        }
      }

      const ctrl = new AbortController();
      const tId = window.setTimeout(() => ctrl.abort(), 4500);
      const resp = await fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${reqLats.join(',')}&longitude=${reqLons.join(',')}`,
        { signal: ctrl.signal }
      );
      window.clearTimeout(tId);

      if (resp.ok) {
        const json = (await resp.json()) as { elevation?: number[] };
        if (Array.isArray(json.elevation) && json.elevation.length === gridN * gridN) {
          const grid = json.elevation;
          return {
            sourceLabel: 'DEM Caalami ah (SRTM 30m)',
            hasRealElevation: true,
            sampleLonLat: (lon: number, lat: number) => {
              const u = Math.max(0, Math.min(1, (lon - gLon0) / Math.max(1e-9, gLon1 - gLon0))) * (gridN - 1);
              const v = Math.max(0, Math.min(1, (lat - gLat0) / Math.max(1e-9, gLat1 - gLat0))) * (gridN - 1);
              const c0 = Math.min(gridN - 2, Math.floor(u));
              const r0 = Math.min(gridN - 2, Math.floor(v));
              const wu = u - c0;
              const wv = v - r0;
              const z00 = grid[r0 * gridN + c0];
              const z10 = grid[r0 * gridN + c0 + 1];
              const z01 = grid[(r0 + 1) * gridN + c0];
              const z11 = grid[(r0 + 1) * gridN + c0 + 1];
              return (z00 * (1 - wu) + z10 * wu) * (1 - wv) + (z01 * (1 - wu) + z11 * wu) * wv;
            },
          };
        }
      }
    } catch {
      // Proceed cleanly to 3D Z / offline fallback
    }
  }

  // 3. Offline / 3D GeoJSON Z-coordinate IDW interpolation fallback
  if (rawZPointsLonLatElev && rawZPointsLonLatElev.length >= 3) {
    return {
      sourceLabel: 'Xogta Joogga 3D ee GeoJSON',
      hasRealElevation: true,
      sampleLonLat: (lon: number, lat: number) => {
        let num = 0;
        let den = 0;
        for (const [plon, plat, pz] of rawZPointsLonLatElev) {
          const dSq = (lon - plon) * (lon - plon) + (lat - plat) * (lat - plat);
          if (dSq < 1e-14) return pz;
          const w = 1 / dSq;
          num += w * pz;
          den += w;
        }
        return den > 0 ? num / den : null;
      },
    };
  }

  return {
    sourceLabel: 'Dooxyada & Qaabka Dhulka (Offline)',
    hasRealElevation: false,
    sampleLonLat: () => null,
  };
}

/* ============================================================================
 * 3. NEAREST CITY-CONNECTING ROAD DETECTOR (OPENSTREETMAP OVERPASS + MANUAL/GEOJSON)
 * ============================================================================ */

export interface DetectedCityRoad {
  sourceLabel: string;
  roadLinesLonLat: Point2D[][];
}

const HIGHWAY_RANK_WEIGHT: Record<string, { rank: number; somaliType: string }> = {
  motorway: { rank: 1, somaliType: 'Jidka Weyn (Motorway)' },
  trunk: { rank: 1, somaliType: 'Laamiga Magaalada (Trunk)' },
  primary: { rank: 1, somaliType: 'Waddada Weyn ee Magaalada (Primary)' },
  secondary: { rank: 2, somaliType: 'Waddada Magaalada (Secondary)' },
  tertiary: { rank: 2, somaliType: 'Jidka Isku-xidhka Magaalada (Tertiary)' },
  unclassified: { rank: 3, somaliType: 'Jidka Deegaanka' },
  residential: { rank: 4, somaliType: 'Waddo Xaafadeed' },
};

/**
 * Resolves the nearest city-connecting road using:
 * 1) Explicit user-placed City Road pin (`cityRoadAnchorLonLat`) or uploaded `roadItems` if provided, OR
 * 2) Live OpenStreetMap Overpass highway query around the farm boundary.
 */
export async function resolveNearestCityConnectingRoad(
  subdivision: SubdivisionComputationResult,
  roadItems?: ParsedGeoItem[],
  cityRoadAnchorLonLat?: Point2D | null
): Promise<DetectedCityRoad | null> {
  // 1. User-uploaded road GeoJSON + optional manual road pin
  const customLines: Point2D[][] = [];
  if (roadItems && roadItems.length > 0) {
    roadItems.forEach((it) => {
      if (it.coords && it.coords.length >= 2) {
        customLines.push(it.coords);
      }
    });
  }
  if (cityRoadAnchorLonLat && Number.isFinite(cityRoadAnchorLonLat[0])) {
    customLines.push([cityRoadAnchorLonLat, cityRoadAnchorLonLat]);
  }
  if (customLines.length > 0) {
    return {
      sourceLabel:
        cityRoadAnchorLonLat && (!roadItems || roadItems.length === 0)
          ? 'Barta Waddada Magaalada (La Calaamadeeyey)'
          : 'Waddada Magaalada (GeoJSON)',
      roadLinesLonLat: customLines,
    };
  }

  // 2. Online OpenStreetMap Overpass API query
  if (typeof window === 'undefined' || navigator.onLine === false) {
    return null;
  }

  const farmCenterUtm: Point2D = [
    (subdivision.bb[0] + subdivision.bb[2]) / 2,
    (subdivision.bb[1] + subdivision.bb[3]) / 2,
  ];
  const [cLon, cLat] = subdivision.inv(farmCenterUtm);

  const query = `[out:json][timeout:6];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$"](around:6000,${cLat.toFixed(
    5
  )},${cLon.toFixed(5)}););out geom;`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  for (const endpoint of endpoints) {
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 5500);
      const res = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        signal: ctrl.signal,
      });
      window.clearTimeout(timer);
      if (!res.ok) continue;

      const data = (await res.json()) as {
        elements?: Array<{
          type?: string;
          tags?: Record<string, string>;
          geometry?: Array<{ lat: number; lon: number }>;
        }>;
      };
      const ways = (data.elements || []).filter(
        (el) => el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2
      );
      if (ways.length === 0) return null;

      // Score each way by proximity to farm + city-connecting highway importance
      let bestScore = Infinity;
      let bestWay = ways[0];
      let bestLineLonLat: Point2D[] = [];

      for (const w of ways) {
        const hw = w.tags?.highway || 'unclassified';
        const meta = HIGHWAY_RANK_WEIGHT[hw] || { rank: 4, somaliType: 'Waddo' };
        const ptsLonLat: Point2D[] = (w.geometry || []).map((g) => [g.lon, g.lat]);
        const ptsUtm = ptsLonLat.map((ll) => subdivision.fwd(ll));
        const dUtm = pointToPolylineDistanceUtm(farmCenterUtm, ptsUtm).dist;
        // Prefer major city-connecting highways (rank 1–2) unless a local connecting road is dramatically closer
        const effectiveScore = dUtm + (meta.rank - 1) * 450;
        if (effectiveScore < bestScore) {
          bestScore = effectiveScore;
          bestWay = w;
          bestLineLonLat = ptsLonLat;
        }
      }

      if (bestLineLonLat.length >= 2) {
        const hw = bestWay.tags?.highway || 'unclassified';
        const meta = HIGHWAY_RANK_WEIGHT[hw] || { rank: 3, somaliType: 'Waddada Magaalada' };
        const nameTag = bestWay.tags?.name || bestWay.tags?.ref || '';
        return {
          sourceLabel: nameTag ? `OSM: ${nameTag} (${hw})` : `OSM: ${meta.somaliType}`,
          roadLinesLonLat: [bestLineLonLat],
        };
      }
    } catch {
      // Try next Overpass mirror
    }
  }

  return null;
}

/* ============================================================================
 * 4. AUTOMATIC TIER GENERATOR (DEM ELEVATION + FLATNESS/GULLIES + CITY ROAD)
 * ============================================================================ */

export interface AutomaticTierComputationOutput {
  blockTiers: Record<string, AssetQualityTier>;
  plotTierOverrides: Record<string, AssetQualityTier>;
  updatedPlotMetadata: Record<string, PlotDetailedMetadata>;
  updatedBlockMetadata: Record<string, BlockDetailedMetadata>;
  summary: AutoTierEvaluationSummary;
}

/**
 * Pure deterministic calculation of Block & Plot tiers (`Heer 1`, `Heer 2`, `Heer 3`) from:
 * 1) DEM Elevation, Slope % & Micro-Relief Roughness (`Dhul isku siman` -> Heer 1; `Dhul jeexjeex / aan simnayn` -> Heer 2 & 3)
 * 2) Wadis / Gullies (`Dooxyada`) cutting through or bordering blocks & plots
 * 3) Proximity to the nearest road connecting the land to the city (`Waddada Magaalada`)
 */
export function computeAutomaticDemAndRoadTiers(params: {
  subdivision: SubdivisionComputationResult;
  demSampler: DemSampler;
  cityRoad: DetectedCityRoad | null;
  wadiItems?: ParsedGeoItem[];
  existingPlotMetadata?: Record<string, PlotDetailedMetadata>;
  existingBlockMetadata?: Record<string, BlockDetailedMetadata>;
}): AutomaticTierComputationOutput {
  const {
    subdivision,
    demSampler,
    cityRoad,
    wadiItems = [],
    existingPlotMetadata = {},
    existingBlockMetadata = {},
  } = params;

  // Project wadi polylines to UTM
  const wadiLinesUtm: Point2D[][] = [];
  wadiItems.forEach((w) => {
    if (w.coords && w.coords.length >= 2) {
      wadiLinesUtm.push(w.coords.map((ll) => subdivision.fwd(ll)));
    }
  });

  // Project road polylines to UTM
  const roadLinesUtm: Point2D[][] = (cityRoad?.roadLinesLonLat || [])
    .filter((l) => l.length >= 1)
    .map((l) => l.map((ll) => subdivision.fwd(ll)));

  interface PlotTerrainRecord {
    plot: GeneratedPlot;
    elevMean: number | null;
    slopePct: number;
    roughnessM: number;
    wadiDistM: number;
    wadiStatus: WadiStatus;
    roadDistM: number;
    terrainRawPenalty: number; // 0 = perfectly flat/uniform, 1+ = gullied/steep
  }

  const plotRecords: PlotTerrainRecord[] = [];
  let minElev = Infinity;
  let maxElev = -Infinity;
  let nearestRoadDist = Infinity;
  let nearestFarmPtUtm: Point2D | null = null;
  let nearestRoadPtUtm: Point2D | null = null;

  const allSourcePlots =
    subdivision.allEvaluatedPlots && subdivision.allEvaluatedPlots.length > 0
      ? subdivision.allEvaluatedPlots.filter(
          (q) => q.halfPlotValidation?.boundaryRelation !== 'full_outside'
        )
      : subdivision.plots;

  for (const q of allSourcePlots) {
    // 1. Sample 4 corners + center on DEM
    const samplePtsUtm: Point2D[] =
      q.rect.length >= 4
        ? [q.rect[0], q.rect[1], q.rect[2], q.rect[3], q.centerUtm]
        : [...q.rect, q.centerUtm];

    const zs: number[] = [];
    for (const ptUtm of samplePtsUtm) {
      const [lon, lat] = subdivision.inv(ptUtm);
      const z = demSampler.sampleLonLat(lon, lat);
      if (z !== null && Number.isFinite(z)) {
        zs.push(z);
        if (z < minElev) minElev = z;
        if (z > maxElev) maxElev = z;
      }
    }

    let elevMean: number | null = null;
    let slopePct = 0;
    let roughnessM = 0;

    if (zs.length >= 5 && q.rect.length >= 4) {
      elevMean = zs.reduce((s, v) => s + v, 0) / zs.length;
      const d01 = Math.max(1, Math.hypot(q.rect[1][0] - q.rect[0][0], q.rect[1][1] - q.rect[0][1]));
      const d03 = Math.max(1, Math.hypot(q.rect[3][0] - q.rect[0][0], q.rect[3][1] - q.rect[0][1]));
      const s1 = Math.abs(zs[1] - zs[0]) / d01;
      const s2 = Math.abs(zs[3] - zs[0]) / d03;
      const sDiag =
        Math.abs(zs[2] - zs[0]) /
        Math.max(1, Math.hypot(q.rect[2][0] - q.rect[0][0], q.rect[2][1] - q.rect[0][1]));
      slopePct = Math.max(Math.hypot(s1, s2), sDiag) * 100;

      // Curvature / non-planarity (gully / ridge incision across plot)
      const planarCenter = (zs[0] + zs[1] + zs[2] + zs[3]) / 4;
      const centerDev = Math.abs(zs[4] - planarCenter);
      const variance = zs.slice(0, 4).reduce((s, v) => s + (v - planarCenter) ** 2, 0) / 4;
      roughnessM = centerDev * 2.2 + Math.sqrt(variance) * 0.45;
    } else if (zs.length > 0) {
      elevMean = zs.reduce((s, v) => s + v, 0) / zs.length;
    }

    // 2. Wadi / Gully (`Dooxyada` / `Jeexjeexa`) intersection & proximity
    let wadiDistM = Infinity;
    for (const wl of wadiLinesUtm) {
      const d = polygonToPolylineDistanceUtm(q.rect, wl);
      if (d < wadiDistM) wadiDistM = d;
    }

    const existingWadi = existingPlotMetadata[q.id]?.wadiStatus;
    let wadiStatus: WadiStatus = 'none';
    if (wadiLinesUtm.length > 0) {
      if (wadiDistM <= 0.5) wadiStatus = 'cuts_through';
      else if (wadiDistM <= 10) wadiStatus = 'partial';
      else if (wadiDistM <= 28) wadiStatus = 'nearby';
      else wadiStatus = 'none';
    } else if (existingWadi && existingWadi !== 'unverified') {
      wadiStatus = existingWadi;
      if (existingWadi === 'cuts_through') wadiDistM = 0;
      else if (existingWadi === 'partial') wadiDistM = 6;
      else if (existingWadi === 'nearby') wadiDistM = 20;
    }

    // 3. Nearest City-Connecting Road distance
    let roadDistM = 0;
    if (roadLinesUtm.length > 0) {
      let bestR = Infinity;
      for (const rl of roadLinesUtm) {
        const res = pointToPolylineDistanceUtm(q.centerUtm, rl);
        if (res.dist < bestR) {
          bestR = res.dist;
          if (res.dist < nearestRoadDist) {
            nearestRoadDist = res.dist;
            nearestFarmPtUtm = q.centerUtm;
            nearestRoadPtUtm = res.closest;
          }
        }
      }
      roadDistM = Number.isFinite(bestR) ? bestR : 0;
    }

    // Combine DEM slope + micro-roughness + gully/wadi into Terrain Unevenness Penalty
    const slopePen = Math.min(1, slopePct / 5.5); // 0% -> 0, 2.2% -> 0.40, >=5.5% -> 1.0
    const roughPen = Math.min(1, roughnessM / 1.2); // >=1.2m local incision -> 1.0
    const wadiPen =
      wadiStatus === 'cuts_through'
        ? 0.95
        : wadiStatus === 'partial'
        ? 0.62
        : wadiStatus === 'nearby'
        ? 0.25
        : 0;

    const terrainRawPenalty = Math.min(1.25, Math.max(slopePen * 0.72 + roughPen * 0.48, wadiPen));

    plotRecords.push({
      plot: q,
      elevMean,
      slopePct,
      roughnessM,
      wadiDistM,
      wadiStatus,
      roadDistM,
      terrainRawPenalty,
    });
  }

  // Normalize road distance across the farm [0 .. 1]
  const roadDists = plotRecords.map((r) => r.roadDistM);
  const minRoadD = roadDists.length > 0 ? Math.min(...roadDists) : 0;
  const maxRoadD = roadDists.length > 0 ? Math.max(...roadDists) : 0;
  const roadSpan = Math.max(50, maxRoadD - minRoadD);
  const hasMeaningfulRoadGradient = roadLinesUtm.length > 0 && maxRoadD - minRoadD >= 25;

  const plotScoreById: Record<string, number> = {};
  const recordByPlotId: Record<string, PlotTerrainRecord> = {};

  for (const rec of plotRecords) {
    recordByPlotId[rec.plot.id] = rec;
    const roadNorm = hasMeaningfulRoadGradient ? (rec.roadDistM - minRoadD) / roadSpan : 0;
    // Composite Penalty (lower = better! 0 = flattest + closest to city road -> Heer 1)
    const compositePenalty = hasMeaningfulRoadGradient
      ? rec.terrainRawPenalty * 0.65 + roadNorm * 0.35
      : rec.terrainRawPenalty;
    plotScoreById[rec.plot.id] = compositePenalty;
  }

  // Helper to classify a penalty + terrain flatness/gullying into Heer 1 / Heer 2 / Heer 3
  const classifyIntoTier = (
    compositePen: number,
    terrainPen: number,
    isCutByWadi: boolean,
    isPartialWadi: boolean,
    adaptiveT1Max: number,
    adaptiveT2Max: number
  ): AssetQualityTier => {
    // Hard domain rule: gullied / jeexjeex / steep land becomes Heer 3 (or Heer 2 if mild), NEVER Heer 1!
    if (isCutByWadi || terrainPen >= 0.68) {
      return 'tier_3_basic';
    }
    if (isPartialWadi || terrainPen >= 0.36) {
      return compositePen >= adaptiveT2Max ? 'tier_3_basic' : 'tier_2_standard';
    }
    // Flat, uniform terrain (`Dhul isku siman`): Heer 1 if near/well-connected to road, Heer 2/3 if very remote
    if (compositePen <= adaptiveT1Max) return 'tier_1_prime';
    if (compositePen <= adaptiveT2Max) return 'tier_2_standard';
    return 'tier_3_basic';
  };

  // Compute adaptive thresholds so farms with real road/DEM variation distribute cleanly while genuinely flat-all-over farms stay Heer 1!
  const sortedPenalties = Object.values(plotScoreById).slice().sort((a, b) => a - b);
  const penSpread =
    sortedPenalties.length > 1
      ? sortedPenalties[sortedPenalties.length - 1] - sortedPenalties[0]
      : 0;

  // If the entire farm has negligible terrain roughness AND no road gradient, flat plots are Heer 1!
  const adaptiveT1Max =
    penSpread >= 0.14
      ? Math.max(0.22, Math.min(0.42, sortedPenalties[Math.floor(sortedPenalties.length * 0.42)] || 0.3))
      : 0.32;
  const adaptiveT2Max =
    penSpread >= 0.14
      ? Math.max(adaptiveT1Max + 0.12, Math.min(0.72, sortedPenalties[Math.floor(sortedPenalties.length * 0.76)] || 0.58))
      : 0.62;

  const blockTiers: Record<string, AssetQualityTier> = {};
  const plotTierOverrides: Record<string, AssetQualityTier> = {};
  const updatedPlotMetadata: Record<string, PlotDetailedMetadata> = { ...existingPlotMetadata };
  const updatedBlockMetadata: Record<string, BlockDetailedMetadata> = { ...existingBlockMetadata };

  let t1Blocks = 0;
  let t2Blocks = 0;
  let t3Blocks = 0;

  for (const b of subdivision.blocks) {
    const bPlots = b.plots
      .map((q) => recordByPlotId[q.id])
      .filter((x): x is PlotTerrainRecord => Boolean(x));

    if (bPlots.length === 0) {
      blockTiers[b.id] = 'tier_1_prime';
      t1Blocks++;
      continue;
    }

    const avgComp =
      bPlots.reduce((s, r) => s + (plotScoreById[r.plot.id] || 0), 0) / bPlots.length;
    const avgTerr = bPlots.reduce((s, r) => s + r.terrainRawPenalty, 0) / bPlots.length;
    const cutCount = bPlots.filter((r) => r.wadiStatus === 'cuts_through').length;
    const partCount = bPlots.filter((r) => r.wadiStatus === 'partial').length;
    const avgSlope = bPlots.reduce((s, r) => s + r.slopePct, 0) / bPlots.length;
    const avgRoad = bPlots.reduce((s, r) => s + r.roadDistM, 0) / bPlots.length;

    const bTier = classifyIntoTier(
      avgComp,
      avgTerr,
      cutCount >= Math.max(2, Math.ceil(bPlots.length * 0.35)),
      cutCount > 0 || partCount >= 2,
      adaptiveT1Max,
      adaptiveT2Max
    );
    blockTiers[b.id] = bTier;
    if (bTier === 'tier_1_prime') t1Blocks++;
    else if (bTier === 'tier_2_standard') t2Blocks++;
    else t3Blocks++;

    updatedBlockMetadata[b.id] = {
      ...(updatedBlockMetadata[b.id] || {}),
      blockId: b.id,
      generalCondition:
        bTier === 'tier_1_prime'
          ? `Dhul isku siman (${avgSlope.toFixed(1)}% slope)${roadLinesUtm.length > 0 ? ` · ${Math.round(avgRoad)}m u jira waddada` : ''}`
          : bTier === 'tier_2_standard'
          ? `Dhul dhexdhexaad ah (${avgSlope.toFixed(1)}% slope)${roadLinesUtm.length > 0 ? ` · ${Math.round(avgRoad)}m waddada` : ''}`
          : `Dhul jeexjeex / foorar leh (${avgSlope.toFixed(1)}% slope)`,
    };

    // Per-plot precision: override plots inside the block whose flatness/gullying differs from block average
    for (const rec of bPlots) {
      const pTier = classifyIntoTier(
        plotScoreById[rec.plot.id] || 0,
        rec.terrainRawPenalty,
        rec.wadiStatus === 'cuts_through',
        rec.wadiStatus === 'partial',
        adaptiveT1Max,
        adaptiveT2Max
      );
      if (pTier !== bTier) {
        plotTierOverrides[rec.plot.id] = pTier;
      }

      const siteQuality: SiteQualityRating =
        pTier === 'tier_1_prime'
          ? rec.slopePct <= 1.2
            ? 'very_good'
            : 'good'
          : pTier === 'tier_2_standard'
          ? 'medium'
          : 'poor';

      updatedPlotMetadata[rec.plot.id] = {
        ...(updatedPlotMetadata[rec.plot.id] || {
          plotId: rec.plot.id,
          blockId: rec.plot.block,
          verifiedAreaSqM: null,
          verifiedPrice: null,
        }),
        plotId: rec.plot.id,
        blockId: rec.plot.block,
        wadiStatus:
          wadiLinesUtm.length > 0
            ? rec.wadiStatus
            : updatedPlotMetadata[rec.plot.id]?.wadiStatus || 'none',
        siteQuality,
      };
    }
  }

  let t1Plots = 0;
  let t2Plots = 0;
  let t3Plots = 0;
  let gulliedPlots = 0;

  for (const rec of plotRecords) {
    const effTier = plotTierOverrides[rec.plot.id] || blockTiers[rec.plot.block] || 'tier_1_prime';
    if (effTier === 'tier_1_prime') t1Plots++;
    else if (effTier === 'tier_2_standard') t2Plots++;
    else t3Plots++;
    if (rec.wadiStatus === 'cuts_through' || rec.wadiStatus === 'partial' || rec.terrainRawPenalty >= 0.55) {
      gulliedPlots++;
    }
  }

  const avgSlopeAll =
    plotRecords.length > 0
      ? +(plotRecords.reduce((s, r) => s + r.slopePct, 0) / plotRecords.length).toFixed(2)
      : 0;

  const detectedRoadLineLonLat =
    cityRoad && cityRoad.roadLinesLonLat.length > 0 ? cityRoad.roadLinesLonLat[0] : null;

  return {
    blockTiers,
    plotTierOverrides,
    updatedPlotMetadata,
    updatedBlockMetadata,
    summary: {
      generatedAt: new Date().toISOString(),
      demSourceLabel: demSampler.sourceLabel,
      roadSourceLabel: cityRoad ? cityRoad.sourceLabel : 'Waddo lama helin (Calaamadee barta waddada)',
      minElevationM: Number.isFinite(minElev) ? +minElev.toFixed(1) : null,
      maxElevationM: Number.isFinite(maxElev) ? +maxElev.toFixed(1) : null,
      avgSlopePercent: avgSlopeAll,
      nearestRoadDistanceM: Number.isFinite(nearestRoadDist) ? Math.round(nearestRoadDist) : null,
      nearestFarmPointLonLat: nearestFarmPtUtm ? subdivision.inv(nearestFarmPtUtm) : null,
      nearestRoadPointLonLat: nearestRoadPtUtm ? subdivision.inv(nearestRoadPtUtm) : null,
      detectedRoadLineLonLat,
      tier1BlocksCount: t1Blocks,
      tier2BlocksCount: t2Blocks,
      tier3BlocksCount: t3Blocks,
      tier1PlotsCount: t1Plots,
      tier2PlotsCount: t2Plots,
      tier3PlotsCount: t3Plots,
      gulliedPlotsCount: gulliedPlots,
    },
  };
}

/* ============================================================================
 * 5. MANUAL TIER SELECTION HELPERS (SELECT BY PLOT, BLOCK, FREEHAND LASSO)
 * ============================================================================ */

export function applyManualTierByPlot(
  prev: LandSubdivisionState,
  plotId: string,
  targetTier: AssetQualityTier
): LandSubdivisionState {
  return {
    ...prev,
    plotTierOverrides: {
      ...prev.plotTierOverrides,
      [plotId]: targetTier,
    },
    approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
  };
}

export function applyManualTierByBlock(
  prev: LandSubdivisionState,
  blockId: string,
  subdivision: SubdivisionComputationResult | null,
  targetTier: AssetQualityTier
): LandSubdivisionState {
  const nextPlotOverrides = { ...prev.plotTierOverrides };
  const blk = subdivision?.blocks.find((b) => b.id === blockId);
  if (blk) {
    blk.plots.forEach((q) => {
      delete nextPlotOverrides[q.id];
    });
  }
  return {
    ...prev,
    blockTiers: {
      ...prev.blockTiers,
      [blockId]: targetTier,
    },
    plotTierOverrides: nextPlotOverrides,
    approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
  };
}

/**
 * Applies `targetTier` to all plots (or blocks) whose centers or vertices lie inside
 * a user-drawn Freehand Lasso polygon (in WGS84 `[lon, lat][]` or UTM `[x, y][]`).
 */
export function applyManualTierByFreehandLasso(
  prev: LandSubdivisionState,
  subdivision: SubdivisionComputationResult,
  lassoRingUtm: Point2D[],
  targetTier: AssetQualityTier
): { nextState: LandSubdivisionState; matchedPlotsCount: number } {
  if (lassoRingUtm.length < 3) {
    return { nextState: prev, matchedPlotsCount: 0 };
  }

  const nextPlotOverrides = { ...prev.plotTierOverrides };
  let matched = 0;

  const allPlots =
    subdivision.allEvaluatedPlots && subdivision.allEvaluatedPlots.length > 0
      ? subdivision.allEvaluatedPlots.filter(
          (q) => q.halfPlotValidation?.boundaryRelation !== 'full_outside'
        )
      : subdivision.plots;

  for (const q of allPlots) {
    const centerIn = pointInPolygon2D(q.centerUtm, lassoRingUtm);
    const cornerIn = !centerIn && q.rect.some((pt) => pointInPolygon2D(pt, lassoRingUtm));
    if (centerIn || cornerIn) {
      nextPlotOverrides[q.id] = targetTier;
      matched++;
    }
  }

  if (matched === 0) {
    return { nextState: prev, matchedPlotsCount: 0 };
  }

  return {
    matchedPlotsCount: matched,
    nextState: {
      ...prev,
      plotTierOverrides: nextPlotOverrides,
      approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
      auditHistory: [
        createAuditEntry(
          'tier_change',
          `Freehand gacanta: ${matched} plot ayaa loo beddelay ${
            targetTier === 'tier_1_prime'
              ? 'Heerka 1aad'
              : targetTier === 'tier_2_standard'
              ? 'Heerka 2aad'
              : 'Heerka 3aad'
          }.`
        ),
        ...(prev.auditHistory || []).slice(0, 49),
      ],
    },
  };
}

/* ============================================================================
 * 5B. MAP SELECTION TOOLS ENGINE (POLYGON, FREEHAND & RADIUS FOR PLOTS/BLOCKS)
 * ============================================================================ */

export type MapSelectionTarget = 'plots' | 'blocks';

export interface MapSpatialSelectionResult {
  selectedPlotIds: string[];
  selectedBlockIds: string[];
  selectedFeaturesCount: number;
  totalAreaSqM: number;
}

function ringCentroid2D(ring: Point2D[]): Point2D {
  if (ring.length === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const pt of ring) {
    sx += pt[0];
    sy += pt[1];
  }
  return [sx / ring.length, sy / ring.length];
}

function polygonAreaUtm(ring: Point2D[]): number {
  if (ring.length < 3) return 0;
  let area2 = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area2) / 2;
}

export function polygonsIntersect2D(ringA: Point2D[], ringB: Point2D[]): boolean {
  if (ringA.length < 3 || ringB.length < 3) return false;

  if (pointInPolygon2D(ringCentroid2D(ringA), ringB)) return true;
  if (pointInPolygon2D(ringCentroid2D(ringB), ringA)) return true;

  for (const pt of ringA) {
    if (pointInPolygon2D(pt, ringB)) return true;
  }
  for (const pt of ringB) {
    if (pointInPolygon2D(pt, ringA)) return true;
  }

  for (let i = 0; i < ringA.length; i++) {
    const a1 = ringA[i];
    const a2 = ringA[(i + 1) % ringA.length];
    for (let j = 0; j < ringB.length; j++) {
      const b1 = ringB[j];
      const b2 = ringB[(j + 1) % ringB.length];
      if (segmentsCross2D(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

export function polygonIntersectsCircleUtm(
  ring: Point2D[],
  centerUtm: Point2D,
  radiusM: number
): boolean {
  if (ring.length < 3 || !Number.isFinite(radiusM) || radiusM < 0) return false;
  if (pointInPolygon2D(centerUtm, ring)) return true;

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (pointToSegmentDistanceUtm(centerUtm, a, b).dist <= radiusM) {
      return true;
    }
  }
  return false;
}

function collectSelectablePlotsAndBlocks(subdivision: SubdivisionComputationResult): {
  plots: { id: string; ringUtm: Point2D[]; areaSqM: number }[];
  blocks: { id: string; ringUtm: Point2D[]; areaSqM: number }[];
} {
  const seenPlotIds = new Set<string>();
  const plots: { id: string; ringUtm: Point2D[]; areaSqM: number }[] = [];

  const evalPlots =
    subdivision.allEvaluatedPlots && subdivision.allEvaluatedPlots.length > 0
      ? subdivision.allEvaluatedPlots.filter((p) => {
          if (subdivision.isPrebuiltGeometry) return true;
          const rel = p.halfPlotValidation?.boundaryRelation;
          if (!rel) return p.full;
          if (rel === 'full_inside') return true;
          if (rel === 'boundary_clipped') {
            return Boolean(
              p.halfPlotValidation?.insideRingsUtm &&
                p.halfPlotValidation.insideRingsUtm.length > 0 &&
                p.halfPlotValidation.insideRingsUtm[0].length >= 3
            );
          }
          return false;
        })
      : subdivision.plots;

  for (const p of evalPlots) {
    const hpVal = p.halfPlotValidation;
    const isValidHalf = Boolean(!p.full && hpVal?.validationStatus === 'half_plot_valid');
    const ringUtm =
      !subdivision.isPrebuiltGeometry &&
      !p.full &&
      hpVal?.insideRingsUtm &&
      hpVal.insideRingsUtm.length > 0 &&
      hpVal.insideRingsUtm[0].length >= 3
        ? hpVal.insideRingsUtm[0]
        : !subdivision.isPrebuiltGeometry &&
          isValidHalf &&
          hpVal?.inscribedHalfPlotRectUtm &&
          hpVal.inscribedHalfPlotRectUtm.length >= 3
        ? hpVal.inscribedHalfPlotRectUtm
        : p.rect;

    if (!ringUtm || ringUtm.length < 3) continue;
    const areaSqM =
      p.calculatedAreaSqM ??
      (ringUtm.length >= 3
        ? polygonAreaUtm(ringUtm)
        : subdivision.params.pw * subdivision.params.pd);
    seenPlotIds.add(p.id);
    plots.push({ id: p.id, ringUtm, areaSqM });
  }

  if (!subdivision.isPrebuiltGeometry && subdivision.htmlHalvesCounted) {
    for (const h of subdivision.htmlHalvesCounted) {
      if (seenPlotIds.has(h.plotId) || !h.rect || h.rect.length < 3) continue;
      seenPlotIds.add(h.plotId);
      plots.push({ id: h.plotId, ringUtm: h.rect, areaSqM: h.area });
    }
  }

  const blocks: { id: string; ringUtm: Point2D[]; areaSqM: number }[] = [];
  for (const b of subdivision.blocks) {
    if ((b.preservedProps as Record<string, unknown> | undefined)?.syntheticBlock === true) {
      continue;
    }
    if (!b.rect || b.rect.length < 3) continue;
    blocks.push({
      id: b.id,
      ringUtm: b.rect,
      areaSqM: polygonAreaUtm(b.rect),
    });
  }

  return { plots, blocks };
}

export function selectMapFeaturesByPolygonUtm(
  subdivision: SubdivisionComputationResult,
  polygonRingUtm: Point2D[],
  target: MapSelectionTarget = 'plots'
): MapSpatialSelectionResult {
  if (!polygonRingUtm || polygonRingUtm.length < 3) {
    return {
      selectedPlotIds: [],
      selectedBlockIds: [],
      selectedFeaturesCount: 0,
      totalAreaSqM: 0,
    };
  }

  const { plots, blocks } = collectSelectablePlotsAndBlocks(subdivision);
  if (target === 'blocks') {
    const matchedBlocks = blocks.filter((b) => polygonsIntersect2D(b.ringUtm, polygonRingUtm));
    const totalArea = matchedBlocks.reduce((s, b) => s + b.areaSqM, 0);
    return {
      selectedPlotIds: [],
      selectedBlockIds: matchedBlocks.map((b) => b.id),
      selectedFeaturesCount: matchedBlocks.length,
      totalAreaSqM: +totalArea.toFixed(1),
    };
  }

  const matchedPlots = plots.filter((p) => polygonsIntersect2D(p.ringUtm, polygonRingUtm));
  const totalArea = matchedPlots.reduce((s, p) => s + p.areaSqM, 0);
  return {
    selectedPlotIds: matchedPlots.map((p) => p.id),
    selectedBlockIds: [],
    selectedFeaturesCount: matchedPlots.length,
    totalAreaSqM: +totalArea.toFixed(1),
  };
}

export function selectMapFeaturesByFreehandUtm(
  subdivision: SubdivisionComputationResult,
  freehandRingUtm: Point2D[],
  target: MapSelectionTarget = 'plots'
): MapSpatialSelectionResult {
  return selectMapFeaturesByPolygonUtm(subdivision, freehandRingUtm, target);
}

export function selectMapFeaturesByRadiusUtm(
  subdivision: SubdivisionComputationResult,
  centerUtm: Point2D,
  radiusM: number,
  target: MapSelectionTarget = 'plots'
): MapSpatialSelectionResult {
  if (!Number.isFinite(radiusM) || radiusM < 0) {
    return {
      selectedPlotIds: [],
      selectedBlockIds: [],
      selectedFeaturesCount: 0,
      totalAreaSqM: 0,
    };
  }

  const { plots, blocks } = collectSelectablePlotsAndBlocks(subdivision);
  if (target === 'blocks') {
    const matchedBlocks = blocks.filter((b) =>
      polygonIntersectsCircleUtm(b.ringUtm, centerUtm, radiusM)
    );
    const totalArea = matchedBlocks.reduce((s, b) => s + b.areaSqM, 0);
    return {
      selectedPlotIds: [],
      selectedBlockIds: matchedBlocks.map((b) => b.id),
      selectedFeaturesCount: matchedBlocks.length,
      totalAreaSqM: +totalArea.toFixed(1),
    };
  }

  const matchedPlots = plots.filter((p) =>
    polygonIntersectsCircleUtm(p.ringUtm, centerUtm, radiusM)
  );
  const totalArea = matchedPlots.reduce((s, p) => s + p.areaSqM, 0);
  return {
    selectedPlotIds: matchedPlots.map((p) => p.id),
    selectedBlockIds: [],
    selectedFeaturesCount: matchedPlots.length,
    totalAreaSqM: +totalArea.toFixed(1),
  };
}

export function applyManualTierToSelectedFeatures(
  prev: LandSubdivisionState,
  subdivision: SubdivisionComputationResult | null,
  selectedPlotIds: Iterable<string>,
  selectedBlockIds: Iterable<string>,
  targetTier: AssetQualityTier
): LandSubdivisionState {
  const plotList = Array.from(selectedPlotIds);
  const blockList = Array.from(selectedBlockIds);
  if (plotList.length === 0 && blockList.length === 0) return prev;

  const nextBlockTiers = { ...prev.blockTiers };
  const nextPlotOverrides = { ...prev.plotTierOverrides };

  for (const bId of blockList) {
    nextBlockTiers[bId] = targetTier;
    const blk = subdivision?.blocks.find((b) => b.id === bId);
    if (blk) {
      blk.plots.forEach((q) => {
        delete nextPlotOverrides[q.id];
      });
    }
  }

  for (const pId of plotList) {
    nextPlotOverrides[pId] = targetTier;
  }

  return {
    ...prev,
    blockTiers: nextBlockTiers,
    plotTierOverrides: nextPlotOverrides,
    approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
    auditHistory: [
      createAuditEntry(
        'tier_change',
        `Xulashada Khariidadda (${plotList.length} plot, ${blockList.length} block) ayaa loo beddelay ${
          targetTier === 'tier_1_prime'
            ? 'Heerka 1aad'
            : targetTier === 'tier_2_standard'
            ? 'Heerka 2aad'
            : 'Heerka 3aad'
        }.`
      ),
      ...(prev.auditHistory || []).slice(0, 49),
    ],
  };
}

/* ============================================================================
 * 6. SIMULTANEOUS MULTI-FILE GEOJSON IMPORTER
 *    (Xuduudka Beerta + Block Tusaale ah + Dooxyada + Waddada + Aag Gaar ah)
 * ============================================================================ */

function approxMetricAreaAndClosure(coords: Point2D[]): {
  areaSqM: number;
  lengthM: number;
  endGapM: number;
} {
  if (coords.length < 2) return { areaSqM: 0, lengthM: 0, endGapM: 0 };
  const refLat = (coords[0][1] * Math.PI) / 180;
  const kx = Math.cos(refLat) * 111320;
  const ky = 110540;
  let len = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    len += Math.hypot(
      (coords[i + 1][0] - coords[i][0]) * kx,
      (coords[i + 1][1] - coords[i][1]) * ky
    );
  }
  const endGapM = Math.hypot(
    (coords[coords.length - 1][0] - coords[0][0]) * kx,
    (coords[coords.length - 1][1] - coords[0][1]) * ky
  );
  let area2 = 0;
  for (let i = 0; i < coords.length; i++) {
    const a = coords[i];
    const b = coords[(i + 1) % coords.length];
    area2 += a[0] * kx * (b[1] * ky) - b[0] * kx * (a[1] * ky);
  }
  return { areaSqM: Math.abs(area2) / 2, lengthM: len, endGapM };
}

export interface SimultaneousGeoJsonBatchResult {
  isPrebuiltPackage: boolean;
  nextState: LandSubdivisionState;
  summarySomali: string;
  extracted3dPointsLonLatElev: [number, number, number][];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collect3dElevationPointsFromGeoJson(rawJson: any, out: [number, number, number][]): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walkCoords = (arr: any) => {
    if (!Array.isArray(arr)) return;
    if (
      arr.length >= 3 &&
      typeof arr[0] === 'number' &&
      typeof arr[1] === 'number' &&
      typeof arr[2] === 'number' &&
      Number.isFinite(arr[2]) &&
      arr[2] !== 0
    ) {
      out.push([arr[0], arr[1], arr[2]]);
      return;
    }
    for (const child of arr) walkCoords(child);
  };
  if (!rawJson || typeof rawJson !== 'object') return;
  if (Array.isArray(rawJson.features)) {
    for (const f of rawJson.features) {
      if (f?.geometry?.coordinates) walkCoords(f.geometry.coordinates);
    }
  } else if (rawJson.coordinates) {
    walkCoords(rawJson.coordinates);
  }
}

/**
 * Classifies and imports 1 or multiple GeoJSON files uploaded simultaneously:
 * - Xuduudka Beerta (Boundary)
 * - Block Tusaale ah (Sample Block)
 * - Dooxyada (Wadis / Streams / Gullies)
 * - Waddada Magaalada (Road)
 * - Aag Gaar ah (Special Areas)
 * While preserving 100% compatibility if the batch is a prebuilt 523-plot QGIS package!
 */
export function importSimultaneousFarmGeoJsonFiles(
  prev: LandSubdivisionState,
  sources: { fileName: string; rawJson: unknown }[]
): SimultaneousGeoJsonBatchResult | null {
  if (!sources || sources.length === 0) return null;

  const extracted3dPointsLonLatElev: [number, number, number][] = [];
  let totalPrebuiltPlotTaggedFeatures = 0;
  let hasBlocksFile = false;
  let hasPlotsFile = false;

  interface TaggedItem {
    fileName: string;
    item: ParsedGeoItem;
    areaSqM: number;
    lengthM: number;
    endGapM: number;
    explicitRole: 'boundary' | 'sample' | 'wadi' | 'road' | 'special' | null;
  }

  const taggedItems: TaggedItem[] = [];

  for (const src of sources) {
    const norm = normalizeGeoJsonCrsToWgs84(src.rawJson);
    collect3dElevationPointsFromGeoJson(norm.normalizedJson, extracted3dPointsLonLatElev);

    const fLower = src.fileName.toLowerCase();
    if (/02[_-]?block|blocks\.geojson/i.test(fLower)) hasBlocksFile = true;
    if (/03[_-]?plot|plots\.geojson/i.test(fLower)) hasPlotsFile = true;

    // Count explicit prebuilt plot attributes (`Plot_ID`, `goostay`, `pct_gudaha`)
    const rawObj = norm.normalizedJson as {
      features?: Array<{ properties?: Record<string, unknown> | null }>;
    } | null;
    const feats = Array.isArray(rawObj?.features) ? rawObj.features : [];
    totalPrebuiltPlotTaggedFeatures += feats.filter((ft) => {
      const p = ft?.properties;
      if (!p) return false;
      return (
        p.Plot_ID !== undefined ||
        p.plot_id !== undefined ||
        p.goostay !== undefined ||
        p.Goostay !== undefined ||
        p.pct_gudaha !== undefined
      );
    }).length;

    const items = parseGeoJsonItems(norm.normalizedJson).filter((it) => it.coords.length >= 2);
    for (const it of items) {
      const { areaSqM, lengthM, endGapM } = approxMetricAreaAndClosure(it.coords);
      const combinedName = `${src.fileName} ${it.name} ${JSON.stringify(
        it.rawProperties || {}
      )}`.toLowerCase();

      let explicitRole: TaggedItem['explicitRole'] = null;
      if (/doox|wadi|tog|stream|river|jeex|gully|canal|^05[_-]/i.test(combinedName)) {
        explicitRole = 'wadi';
      } else if (/waddo|wadada|jidka|road|highway|laami|^04[_-]/i.test(combinedName)) {
        explicitRole = 'road';
      } else if (/aag|special|masjid|ceel|xabaal/i.test(combinedName)) {
        explicitRole = 'special';
      } else if (/tusaale|sample|template/i.test(combinedName)) {
        explicitRole = 'sample';
      } else if (/xuduud|boundary|perimeter|beerta|farm|^01[_-]/i.test(combinedName)) {
        explicitRole = 'boundary';
      }

      taggedItems.push({
        fileName: src.fileName,
        item: it,
        areaSqM,
        lengthM,
        endGapM,
        explicitRole,
      });
    }
  }

  // Delegate to prebuilt 523-plot QGIS pipeline if explicit prebuilt plots exist
  if (totalPrebuiltPlotTaggedFeatures >= 10 || (hasBlocksFile && hasPlotsFile)) {
    return {
      isPrebuiltPackage: true,
      nextState: prev,
      summarySomali: '',
      extracted3dPointsLonLatElev,
    };
  }

  if (taggedItems.length === 0) return null;

  const boundaryBucket: ParsedGeoItem[] = [];
  const sampleBucket: ParsedGeoItem[] = [];
  const wadiBucket: ParsedGeoItem[] = [];
  const roadBucket: ParsedGeoItem[] = [];
  const specialBucket: ParsedGeoItem[] = [];
  const untagged: TaggedItem[] = [];

  for (const t of taggedItems) {
    if (t.explicitRole === 'wadi') wadiBucket.push(t.item);
    else if (t.explicitRole === 'road') roadBucket.push(t.item);
    else if (t.explicitRole === 'special') specialBucket.push(t.item);
    else if (t.explicitRole === 'sample') sampleBucket.push(t.item);
    else if (t.explicitRole === 'boundary') boundaryBucket.push(t.item);
    else untagged.push(t);
  }

  // Classify untagged items geometrically when multiple files/features are uploaded
  if (untagged.length > 0) {
    // Check if there is at least one closed/loop candidate for boundary
    const loopCandidates = untagged.filter(
      (t) =>
        t.item.type === 'Polygon' ||
        (t.item.coords.length >= 4 && t.endGapM <= Math.max(25, t.lengthM * 0.2))
    );
    const openLines = untagged.filter((t) => !loopCandidates.includes(t));

    if (boundaryBucket.length > 0 || loopCandidates.length > 0) {
      // Open lines that aren't closed boundaries -> Dooxyada (`wadiItems`)!
      openLines.forEach((ol) => wadiBucket.push(ol.item));

      if (boundaryBucket.length === 0 && loopCandidates.length > 0) {
        // Largest area loop is Farm Boundary; smaller loops (~400m²..25,000m²) are Sample Blocks!
        const sortedLoops = loopCandidates.slice().sort((a, b) => b.areaSqM - a.areaSqM);
        const largest = sortedLoops[0];
        boundaryBucket.push(largest.item);

        for (let i = 1; i < sortedLoops.length; i++) {
          const cand = sortedLoops[i];
          if (cand.areaSqM >= 200 && cand.areaSqM < largest.areaSqM * 0.45) {
            sampleBucket.push(cand.item);
          } else {
            boundaryBucket.push(cand.item);
          }
        }
      } else {
        // Boundary was already explicitly tagged -> remaining small loops become Sample Blocks!
        loopCandidates.forEach((lc) => sampleBucket.push(lc.item));
      }
    } else {
      // Only open lines were uploaded (e.g. unclosed boundary polyline or wadi file)
      openLines.forEach((ol) => boundaryBucket.push(ol.item));
    }
  }

  let nextState: LandSubdivisionState = {
    ...prev,
    approvalStatus: 'draft_proposal',
  };

  const partsLoaded: string[] = [];

  if (boundaryBucket.length > 0) {
    const bi = pickBestBoundaryIndex(boundaryBucket);
    const bItem = boundaryBucket[bi];
    const autoSamplesFromBoundary =
      sampleBucket.length === 0
        ? buildSampleBlockCandidates(boundaryBucket.filter((it) => it !== bItem))
        : [];

    nextState = {
      ...nextState,
      prebuiltSubdivision: null,
      boundaryItems: boundaryBucket,
      boundaryFileName:
        sources.length === 1
          ? `${sources[0].fileName} · ${boundaryBucket.length} shay`
          : `Xuduudka Beerta (${boundaryBucket.length} shay)`,
      selectedBoundaryIndex: bi,
      ...(sampleBucket.length === 0 && !prev.sampleCustom
        ? {
            sampleCandidates: autoSamplesFromBoundary,
            selectedSampleIndex: autoSamplesFromBoundary.length > 0 ? 0 : -1,
            sampleFileName:
              autoSamplesFromBoundary.length > 0
                ? 'Isla faylka xuduudka'
                : 'Auto (xuduudka beerta)',
          }
        : {}),
      blockZones: {},
      blockTiers: {},
      plotTierOverrides: {},
      manualPlotHeirOverrides: {},
    };
    partsLoaded.push('Xuduudka Beerta');
  }

  if (sampleBucket.length > 0) {
    const sampleCands = buildSampleBlockCandidates(sampleBucket);
    nextState = {
      ...nextState,
      prebuiltSubdivision: null,
      sampleCustom: true,
      sampleCandidates: sampleCands,
      sampleFileName: `Block Tusaale · ${sampleCands.length} block`,
      selectedSampleIndex: sampleCands.length > 0 ? 0 : -1,
    };
    partsLoaded.push(`Block Tusaale (${sampleCands.length})`);
  }

  if (wadiBucket.length > 0) {
    nextState = {
      ...nextState,
      wadiItems: wadiBucket,
      wadiFileName: `Dooxyada · ${wadiBucket.length} xariiq`,
    };
    partsLoaded.push(`Dooxyada (${wadiBucket.length})`);
  }

  if (roadBucket.length > 0) {
    nextState = {
      ...nextState,
      roadItems: roadBucket,
      roadFileName: `Waddada · ${roadBucket.length} xariiq`,
    };
    partsLoaded.push(`Waddada (${roadBucket.length})`);
  }

  if (specialBucket.length > 0) {
    nextState = {
      ...nextState,
      specialAreaItems: specialBucket,
      specialAreaFileName: `Aag Gaar ah · ${specialBucket.length} aag`,
    };
    partsLoaded.push(`Aag Gaar ah (${specialBucket.length})`);
  }

  const summarySomali =
    partsLoaded.length > 0
      ? `Si wada-jir ah ayaa loo soo geliyey: ${partsLoaded.join(' + ')}`
      : `${sources.length} fayl GeoJSON waa la soo geliyey`;

  nextState.auditHistory = [
    createAuditEntry('geojson_import', summarySomali),
    ...(prev.auditHistory || []).slice(0, 49),
  ];

  return {
    isPrebuiltPackage: false,
    nextState,
    summarySomali,
    extracted3dPointsLonLatElev,
  };
}
