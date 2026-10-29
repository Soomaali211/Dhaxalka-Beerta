import proj4 from 'proj4';
import {
  ExtraGeoJsonOverlayLayer,
  LandSubdivisionState,
  NashqadFileRecognitionItem,
  NashqadFileRole,
  NashqadWorkflowSummary,
  ParsedGeoItem,
  Point2D,
  PrebuiltGeoJsonSubdivision,
  SubdivisionComputationResult,
  SubdivisionParams,
} from '../types/landSubdivision';
import { createEmptyLandSubdivisionState } from './caseManagementEngine';
import {
  intersectPolygonWithTriangulatedBoundary,
  signedRingArea,
  triangulateSimplePolygonCCW,
} from './halfPlotGeometryEngine';
import {
  DEFAULT_SUBDIVISION_PARAMS,
  createAuditEntry,
  frameFromRing,
  pointInPolygon,
  segmentsIntersect,
  shoelaceArea,
} from './landSubdivisionEngine';
import { normalizeGeoJsonCrsToWgs84 } from './pdfCartographyEngine';
import {
  convertKmlTextToGeoJsonObject,
  isLikelyKmlString,
} from './kmlAndGeoJsonParser';

const EXTRA_LAYER_PALETTE = [
  '#A855F7',
  '#EC4899',
  '#14B8A6',
  '#6366F1',
  '#84CC16',
  '#F97316',
  '#06B6D4',
  '#EAB308',
];

function cleanPolygonVertices(ring: Point2D[]): Point2D[] {
  const out: Point2D[] = [];
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2 || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) {
      continue;
    }
    if (
      out.length === 0 ||
      Math.hypot(out[out.length - 1][0] - pt[0], out[out.length - 1][1] - pt[1]) > 1e-4
    ) {
      out.push([pt[0], pt[1]]);
    }
  }
  if (
    out.length > 1 &&
    Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-4
  ) {
    out.pop();
  }
  return out;
}

function ensureCCW(ring: Point2D[]): Point2D[] {
  if (ring.length < 3) return ring.slice();
  return signedRingArea(ring) < 0 ? ring.slice().reverse() : ring.slice();
}

function convexHull(pts: Point2D[]): Point2D[] {
  if (pts.length <= 3) return pts.slice();
  const sorted = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point2D[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point2D[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export interface ExtractedPolygonFeature {
  ringRaw: Point2D[];
  properties: Record<string, unknown>;
}

export interface ExtractedLineFeature {
  coordsRaw: Point2D[];
  properties: Record<string, unknown>;
}

export interface ExtractedPointFeature {
  coordRaw: Point2D;
  properties: Record<string, unknown>;
}

export interface InspectedNashqadFile {
  id: string;
  fileName: string;
  rawJson: unknown;
  polygons: ExtractedPolygonFeature[];
  lines: ExtractedLineFeature[];
  points: ExtractedPointFeature[];
  featureCount: number;
  rawAvgArea: number;
  rawMaxArea: number;
  detectedRole: NashqadFileRole;
  recognizedBy: 'filename' | 'geometry' | 'manual';
}

export interface SameeNashqadInput {
  boundaryFileName: string;
  boundaryFileText: string;
  sampleBlockMode: 'file' | 'dimensions';
  sampleBlockFileName?: string;
  sampleBlockFileText?: string;
  blockWidthM?: number;
  blockLengthM?: number;
  /** Compass bearing degree (0°–360° clockwise from North) defining the direction of Block Width (W) */
  widthBearingDeg?: number;
  plotWidthM?: number;
  plotDepthM?: number;
  roadWidthM?: number;
  previousState?: LandSubdivisionState;
}

export type SameeNashqadResult =
  | {
      ok: true;
      nextState: LandSubdivisionState;
      summary: NashqadWorkflowSummary;
    }
  | {
      ok: false;
      errorSomali: string;
    };

export type InspectNashqadFilesResult =
  | {
      ok: true;
      files: InspectedNashqadFile[];
      needsManualSelection: boolean;
    }
  | {
      ok: false;
      errorSomali: string;
    };

export type BuildNashqadBeerResult =
  | {
      ok: true;
      nextState: LandSubdivisionState;
      summary: NashqadWorkflowSummary;
    }
  | {
      ok: false;
      errorSomali: string;
    };

function stripClosingDuplicate(ring: Point2D[]): Point2D[] {
  if (ring.length > 3) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-8) {
      return ring.slice(0, -1);
    }
  }
  return ring;
}

function parseCoordPair(pt: unknown): Point2D | null {
  if (!Array.isArray(pt) || pt.length < 2) return null;
  const x = Number(pt[0]);
  const y = Number(pt[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

/**
 * Formats a compass bearing degree (0°–360°) into a readable Somali compass label.
 */
export function formatCompassDirectionSomali(deg: number): string {
  if (!Number.isFinite(deg)) return 'Waqooyi';
  const norm = ((deg % 360) + 360) % 360;
  const dirs = [
    'Waqooyi (N)',
    'Waqooyi-Bari (NE)',
    'Bari (E)',
    'Koonfur-Bari (SE)',
    'Koonfur (S)',
    'Koonfur-Galbeed (SW)',
    'Galbeed (W)',
    'Waqooyi-Galbeed (NW)',
  ];
  const idx = Math.round(norm / 45) % 8;
  return dirs[idx];
}

/**
 * Safely parses JSON text and extracts all Polygon / MultiPolygon outer rings.
 * Returns concise Somali error messages if JSON is invalid or geometry is unsupported.
 */
export function parseGeoJsonPolygonsStrict(
  fileText: string,
  fileName: string
):
  | { ok: true; rawJson: unknown; polygons: ExtractedPolygonFeature[] }
  | { ok: false; errorSomali: string } {
  if (!fileText || !fileText.trim()) {
    return {
      ok: false,
      errorSomali: `Faylka "${fileName}" waa madhan yahay.`,
    };
  }

  let parsed: unknown;
  if (isLikelyKmlString(fileText)) {
    const kmlRes = convertKmlTextToGeoJsonObject(fileText, fileName);
    if (kmlRes.ok === false) {
      return kmlRes;
    }
    parsed = kmlRes.geoJson;
  } else {
    try {
      parsed = JSON.parse(fileText);
    } catch {
      return {
        ok: false,
        errorSomali: `Faylka "${fileName}" ma aha GeoJSON ama KML sax ah. Fadlan hubi qaabka faylka.`,
      };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      errorSomali: `Faylka "${fileName}" malaha qaab GeoJSON la aqoonsan karo.`,
    };
  }

  const polygons: ExtractedPolygonFeature[] = [];
  let sawUnsupportedGeometry = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collectGeometry = (geom: any, props: Record<string, unknown>) => {
    if (!geom || typeof geom !== 'object') return;
    const gType = String(geom.type || '');

    if (gType === 'Polygon' && Array.isArray(geom.coordinates)) {
      const outer = Array.isArray(geom.coordinates[0]) ? geom.coordinates[0] : [];
      const pts = stripClosingDuplicate(
        outer.map(parseCoordPair).filter((p: Point2D | null): p is Point2D => p !== null)
      );
      if (pts.length >= 3) {
        polygons.push({ ringRaw: pts, properties: { ...props } });
      }
      return;
    }

    if (gType === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      for (const polyCoords of geom.coordinates) {
        const outer = Array.isArray(polyCoords?.[0]) ? polyCoords[0] : [];
        const pts = stripClosingDuplicate(
          outer.map(parseCoordPair).filter((p: Point2D | null): p is Point2D => p !== null)
        );
        if (pts.length >= 3) {
          polygons.push({ ringRaw: pts, properties: { ...props } });
        }
      }
      return;
    }

    if (gType === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      for (const sub of geom.geometries) {
        collectGeometry(sub, props);
      }
      return;
    }

    // Closed LineString perimeter support for farm boundary files exported from CAD/QGIS
    if (gType === 'LineString' && Array.isArray(geom.coordinates)) {
      const rawPts = geom.coordinates
        .map(parseCoordPair)
        .filter((p: Point2D | null): p is Point2D => p !== null);
      if (rawPts.length >= 4) {
        const first = rawPts[0];
        const last = rawPts[rawPts.length - 1];
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-3) {
          const pts = stripClosingDuplicate(rawPts);
          if (pts.length >= 3) {
            polygons.push({ ringRaw: pts, properties: { ...props } });
            return;
          }
        }
      }
    }

    if (gType) {
      sawUnsupportedGeometry = true;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root = parsed as any;
  if (root.type === 'FeatureCollection' && Array.isArray(root.features)) {
    for (const feat of root.features) {
      if (!feat || typeof feat !== 'object') continue;
      const props =
        feat.properties && typeof feat.properties === 'object'
          ? (feat.properties as Record<string, unknown>)
          : {};
      collectGeometry(feat.geometry, props);
    }
  } else if (root.type === 'Feature') {
    const props =
      root.properties && typeof root.properties === 'object'
        ? (root.properties as Record<string, unknown>)
        : {};
    collectGeometry(root.geometry, props);
  } else if (typeof root.type === 'string') {
    collectGeometry(root, {});
  }

  if (polygons.length === 0) {
    return {
      ok: false,
      errorSomali: sawUnsupportedGeometry
        ? `Faylka "${fileName}" wuxuu leeyahay geometry aan la taageerin. Fadlan isticmaal Polygon GeoJSON.`
        : `Faylka "${fileName}" lagama helin wax Polygon sax ah.`,
    };
  }

  return { ok: true, rawJson: parsed, polygons };
}

/**
 * Flexible multi-geometry GeoJSON parser for "Soo geli nashqad beer" (supports 20+ simultaneous files
 * containing Polygons, MultiPolygons, LineStrings, MultiLineStrings, Points, and MultiPoints).
 */
export function parseGeoJsonMultiGeometry(
  fileText: string,
  fileName: string
):
  | {
      ok: true;
      rawJson: unknown;
      polygons: ExtractedPolygonFeature[];
      lines: ExtractedLineFeature[];
      points: ExtractedPointFeature[];
    }
  | { ok: false; errorSomali: string } {
  if (!fileText || !fileText.trim()) {
    return {
      ok: false,
      errorSomali: `Faylka "${fileName}" waa madhan yahay.`,
    };
  }

  let parsed: unknown;
  if (isLikelyKmlString(fileText)) {
    const kmlRes = convertKmlTextToGeoJsonObject(fileText, fileName);
    if (kmlRes.ok === false) {
      return kmlRes;
    }
    parsed = kmlRes.geoJson;
  } else {
    try {
      parsed = JSON.parse(fileText);
    } catch {
      return {
        ok: false,
        errorSomali: `Faylka "${fileName}" ma aha GeoJSON ama KML sax ah. Fadlan hubi qaabka faylka.`,
      };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      errorSomali: `Faylka "${fileName}" malaha qaab GeoJSON la aqoonsan karo.`,
    };
  }

  const polygons: ExtractedPolygonFeature[] = [];
  const lines: ExtractedLineFeature[] = [];
  const points: ExtractedPointFeature[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collectGeometry = (geom: any, props: Record<string, unknown>) => {
    if (!geom || typeof geom !== 'object') return;
    const gType = String(geom.type || '');

    if (gType === 'Polygon' && Array.isArray(geom.coordinates)) {
      const outer = Array.isArray(geom.coordinates[0]) ? geom.coordinates[0] : [];
      const pts = stripClosingDuplicate(
        outer.map(parseCoordPair).filter((p: Point2D | null): p is Point2D => p !== null)
      );
      if (pts.length >= 3) {
        polygons.push({ ringRaw: pts, properties: { ...props } });
      }
      return;
    }

    if (gType === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      for (const polyCoords of geom.coordinates) {
        const outer = Array.isArray(polyCoords?.[0]) ? polyCoords[0] : [];
        const pts = stripClosingDuplicate(
          outer.map(parseCoordPair).filter((p: Point2D | null): p is Point2D => p !== null)
        );
        if (pts.length >= 3) {
          polygons.push({ ringRaw: pts, properties: { ...props } });
        }
      }
      return;
    }

    if (gType === 'LineString' && Array.isArray(geom.coordinates)) {
      const pts = geom.coordinates
        .map(parseCoordPair)
        .filter((p: Point2D | null): p is Point2D => p !== null);
      if (pts.length >= 2) {
        lines.push({ coordsRaw: pts, properties: { ...props } });
      }
      return;
    }

    if (gType === 'MultiLineString' && Array.isArray(geom.coordinates)) {
      for (const lineCoords of geom.coordinates) {
        if (!Array.isArray(lineCoords)) continue;
        const pts = lineCoords
          .map(parseCoordPair)
          .filter((p: Point2D | null): p is Point2D => p !== null);
        if (pts.length >= 2) {
          lines.push({ coordsRaw: pts, properties: { ...props } });
        }
      }
      return;
    }

    if (gType === 'Point' && Array.isArray(geom.coordinates)) {
      const pt = parseCoordPair(geom.coordinates);
      if (pt) {
        points.push({ coordRaw: pt, properties: { ...props } });
      }
      return;
    }

    if (gType === 'MultiPoint' && Array.isArray(geom.coordinates)) {
      for (const c of geom.coordinates) {
        const pt = parseCoordPair(c);
        if (pt) {
          points.push({ coordRaw: pt, properties: { ...props } });
        }
      }
      return;
    }

    if (gType === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      for (const sub of geom.geometries) {
        collectGeometry(sub, props);
      }
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root = parsed as any;
  if (root.type === 'FeatureCollection' && Array.isArray(root.features)) {
    for (const feat of root.features) {
      if (!feat || typeof feat !== 'object') continue;
      const props =
        feat.properties && typeof feat.properties === 'object'
          ? (feat.properties as Record<string, unknown>)
          : {};
      collectGeometry(feat.geometry, props);
    }
  } else if (root.type === 'Feature') {
    const props =
      root.properties && typeof root.properties === 'object'
        ? (root.properties as Record<string, unknown>)
        : {};
    collectGeometry(root.geometry, props);
  } else if (typeof root.type === 'string') {
    collectGeometry(root, {});
  }

  return { ok: true, rawJson: parsed, polygons, lines, points };
}

/**
 * Unifies coordinate systems across one or multiple GeoJSON files (including 20+ simultaneous files)
 * using their combined bounding box so all Polygons, Lines, and Points share an identical WGS84 reference frame.
 */
function unifyMultiGeoJsonCollectionsToWgs84(
  fileEntries: {
    rawJson: unknown;
    polygons: ExtractedPolygonFeature[];
    lines: ExtractedLineFeature[];
    points: ExtractedPointFeature[];
  }[]
): {
  polygons: ExtractedPolygonFeature[];
  lines: ExtractedLineFeature[];
  points: ExtractedPointFeature[];
}[] {
  if (fileEntries.length === 0) return [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasExplicitCrs = false;
  let explicitCrsTag = '';

  const visitPt = ([x, y]: Point2D) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const entry of fileEntries) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = entry.rawJson as any;
    const crsName = String(r?.crs?.properties?.name || '').trim();
    if (crsName) {
      hasExplicitCrs = true;
      if (!explicitCrsTag) explicitCrsTag = crsName;
    }
    for (const poly of entry.polygons) poly.ringRaw.forEach(visitPt);
    for (const ln of entry.lines) ln.coordsRaw.forEach(visitPt);
    for (const pt of entry.points) visitPt(pt.coordRaw);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return fileEntries.map((e) => ({
      polygons: e.polygons,
      lines: e.lines,
      points: e.points,
    }));
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const maxAbsX = Math.max(Math.abs(minX), Math.abs(maxX));
  const maxAbsY = Math.max(Math.abs(minY), Math.abs(maxY));

  const looksLikeStandardUtm =
    minX >= 100000 && maxX <= 900000 && minY >= -10000000 && maxY <= 10000000 && maxY > 1000;

  const looksLikeWgs84Degrees =
    !hasExplicitCrs && maxAbsX <= 180 && maxAbsY <= 90 && spanX <= 2.5 && spanY <= 2.5;

  if (looksLikeWgs84Degrees) {
    // Check if coordinates are swapped [lat, lon] (unlikely in Somalia/Somaliland since lon ~41..51 > lat ~-1..12,
    // unless x < y and x <= 15 && y >= 40)
    const looksSwappedLatLon = minX >= -2 && maxX <= 15 && minY >= 39 && maxY <= 52;
    const fixPt = (c: Point2D): Point2D => (looksSwappedLatLon ? [c[1], c[0]] : [c[0], c[1]]);

    return fileEntries.map((entry) => ({
      polygons: entry.polygons.map((p) => ({
        ringRaw: p.ringRaw.map(fixPt),
        properties: p.properties,
      })),
      lines: entry.lines.map((l) => ({
        coordsRaw: l.coordsRaw.map(fixPt),
        properties: l.properties,
      })),
      points: entry.points.map((pt) => ({
        coordRaw: fixPt(pt.coordRaw),
        properties: pt.properties,
      })),
    }));
  }

  if (hasExplicitCrs || looksLikeStandardUtm) {
    return fileEntries.map((entry) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entryCrs = (entry.rawJson as any)?.crs || (explicitCrsTag
        ? { type: 'name', properties: { name: explicitCrsTag } }
        : undefined);

      const combinedFeatures: unknown[] = [];
      entry.polygons.forEach((p, idx) => {
        combinedFeatures.push({
          type: 'Feature',
          properties: { __kind: 'poly', __idx: idx },
          geometry: { type: 'Polygon', coordinates: [[...p.ringRaw, p.ringRaw[0]]] },
        });
      });
      entry.lines.forEach((l, idx) => {
        combinedFeatures.push({
          type: 'Feature',
          properties: { __kind: 'line', __idx: idx },
          geometry: { type: 'LineString', coordinates: l.coordsRaw },
        });
      });
      entry.points.forEach((pt, idx) => {
        combinedFeatures.push({
          type: 'Feature',
          properties: { __kind: 'point', __idx: idx },
          geometry: { type: 'Point', coordinates: pt.coordRaw },
        });
      });

      if (combinedFeatures.length === 0) {
        return { polygons: [], lines: [], points: [] };
      }

      const fc = {
        type: 'FeatureCollection',
        ...(entryCrs ? { crs: entryCrs } : {}),
        features: combinedFeatures,
      };
      const norm = normalizeGeoJsonCrsToWgs84(fc).normalizedJson as {
        features: {
          properties: { __kind: 'poly' | 'line' | 'point'; __idx: number };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          geometry: { coordinates: any };
        }[];
      };

      const outPolys = entry.polygons.map((p) => ({ ...p }));
      const outLines = entry.lines.map((l) => ({ ...l }));
      const outPoints = entry.points.map((pt) => ({ ...pt }));

      for (const feat of norm.features || []) {
        const { __kind, __idx } = feat.properties;
        if (__kind === 'poly') {
          const ring = stripClosingDuplicate(feat.geometry?.coordinates?.[0] || []);
          if (ring.length >= 3 && outPolys[__idx]) {
            outPolys[__idx] = { ringRaw: ring, properties: outPolys[__idx].properties };
          }
        } else if (__kind === 'line') {
          const coords = (feat.geometry?.coordinates || []) as Point2D[];
          if (coords.length >= 2 && outLines[__idx]) {
            outLines[__idx] = { coordsRaw: coords, properties: outLines[__idx].properties };
          }
        } else if (__kind === 'point') {
          const c = parseCoordPair(feat.geometry?.coordinates);
          if (c && outPoints[__idx]) {
            outPoints[__idx] = { coordRaw: c, properties: outPoints[__idx].properties };
          }
        }
      }

      return { polygons: outPolys, lines: outLines, points: outPoints };
    });
  }

  // Fallback for local planar meter coordinates (e.g. CAD [0..1000, 0..800]m):
  // Anchor using the COMBINED bbox of all uploaded files so all 20+ layers stay 100% locked together!
  const anchorProj = '+proj=utm +zone=38 +datum=WGS84 +units=m +no_defs';
  const baseEast = 400000;
  const baseNorth = 1056000;
  const toWgsFromPlanar = ([x, y]: Point2D): Point2D => {
    const east = baseEast + (x - minX);
    const north = baseNorth + (y - minY);
    const ll = proj4(anchorProj, 'EPSG:4326', [east, north]);
    return [ll[0], ll[1]];
  };

  return fileEntries.map((entry) => ({
    polygons: entry.polygons.map((p) => ({
      ringRaw: p.ringRaw.map(toWgsFromPlanar),
      properties: p.properties,
    })),
    lines: entry.lines.map((l) => ({
      coordsRaw: l.coordsRaw.map(toWgsFromPlanar),
      properties: l.properties,
    })),
    points: entry.points.map((pt) => ({
      coordRaw: toWgsFromPlanar(pt.coordRaw),
      properties: pt.properties,
    })),
  }));
}

function unifyPolygonCollectionsToWgs84(
  fileEntries: { rawJson: unknown; polygons: ExtractedPolygonFeature[] }[]
): ExtractedPolygonFeature[][] {
  return unifyMultiGeoJsonCollectionsToWgs84(
    fileEntries.map((e) => ({
      rawJson: e.rawJson,
      polygons: e.polygons,
      lines: [],
      points: [],
    }))
  ).map((u) => u.polygons);
}

function buildUtmProjectorsFromLonLat(ptsLonLat: Point2D[]) {
  let cLon = 0;
  let cLat = 0;
  ptsLonLat.forEach(([lon, lat]) => {
    cLon += lon;
    cLat += lat;
  });
  cLon /= ptsLonLat.length || 1;
  cLat /= ptsLonLat.length || 1;

  const zone = Math.max(1, Math.min(60, Math.floor((cLon + 180) / 6) + 1));
  const south = cLat < 0;
  const epsg = 32600 + (south ? 100 : 0) + zone;
  const projDef = `+proj=utm +zone=${zone}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;

  const fwd = (ll: Point2D): Point2D => {
    const out = proj4('EPSG:4326', projDef, [ll[0], ll[1]]);
    return [out[0], out[1]];
  };
  const inv = (utm: Point2D): Point2D => {
    const out = proj4(projDef, 'EPSG:4326', [utm[0], utm[1]]);
    return [out[0], out[1]];
  };

  return { zone, south, epsg, projDef, fwd, inv };
}

/**
 * Auto-detects the natural compass bearing degree (0°–180°) of the short/width axis
 * from a Polygon GeoJSON file (either sample block or farm boundary) so the UI can pre-fill Bearing (°).
 */
export function detectWidthBearingFromGeoJson(
  fileText: string,
  fileName: string
): number | null {
  const parsed = parseGeoJsonPolygonsStrict(fileText, fileName);
  if (!parsed.ok || parsed.polygons.length === 0) return null;

  const unified = unifyPolygonCollectionsToWgs84([
    { rawJson: parsed.rawJson, polygons: parsed.polygons },
  ]);
  const polysWgs = unified[0];
  if (!polysWgs || polysWgs.length === 0) return null;

  const { fwd } = buildUtmProjectorsFromLonLat(polysWgs.flatMap((p) => p.ringRaw));
  let bestPoly = polysWgs[0].ringRaw;
  let bestArea = 0;
  for (const poly of polysWgs) {
    const a = Math.abs(shoelaceArea(poly.ringRaw.map(fwd)));
    if (a > bestArea) {
      bestArea = a;
      bestPoly = poly.ringRaw;
    }
  }

  const ringUtm = cleanPolygonVertices(bestPoly.map(fwd));
  if (ringUtm.length < 3) return null;

  const fr = frameFromRing(ringUtm);
  // fr.u points along fr.long (Dhererka L); vShort points along fr.short (Ballaca W)
  const vShort: Point2D = [-fr.u[1], fr.u[0]];
  let deg = (Math.atan2(vShort[0], vShort[1]) * 180) / Math.PI;
  deg = ((deg % 180) + 180) % 180;
  return +deg.toFixed(1);
}

function extractFirstCleanSampleRingUtm(rawRingUtm: Point2D[]): Point2D[] {
  const cleaned = cleanPolygonVertices(rawRingUtm);
  if (cleaned.length <= 6) return cleaned;
  // Handle compound CAD/HTML sample rings where multiple sub-rings share a single coordinate array
  for (let j = 3; j < cleaned.length; j++) {
    if (Math.hypot(cleaned[j][0] - cleaned[0][0], cleaned[j][1] - cleaned[0][1]) < 2.5) {
      const firstSub = cleaned.slice(0, j);
      if (firstSub.length >= 4) return firstSub;
      break;
    }
  }
  return cleaned;
}

function classifyRectInsideBoundaryUtm(
  rc: Point2D[],
  rg: Point2D[]
): 'full' | 'partial' | 'outside' {
  const n = rg.length;
  if (n < 3) return 'outside';
  const EPS = 1e-4;
  let cx = 0;
  let cy = 0;
  for (const q of rc) {
    cx += q[0] / rc.length;
    cy += q[1] / rc.length;
  }
  const s: Point2D[] = rc.map((q) => {
    const dx = cx - q[0];
    const dy = cy - q[1];
    const l = Math.hypot(dx, dy) || 1;
    return [q[0] + (dx / l) * EPS, q[1] + (dy / l) * EPS];
  });

  let allIn = true;
  let anyIn = false;
  let crossed = false;
  let vin = false;

  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const q of s) {
    if (q[0] < x0) x0 = q[0];
    if (q[0] > x1) x1 = q[0];
    if (q[1] < y0) y0 = q[1];
    if (q[1] > y1) y1 = q[1];
  }

  for (let i = 0; i < s.length; i++) {
    if (pointInPolygon(s[i], rg)) anyIn = true;
    else allIn = false;
  }

  for (let e = 0; e < n; e++) {
    const a = rg[e];
    const b = rg[(e + 1) % n];
    if (
      Math.max(a[0], b[0]) < x0 ||
      Math.min(a[0], b[0]) > x1 ||
      Math.max(a[1], b[1]) < y0 ||
      Math.min(a[1], b[1]) > y1
    ) {
      continue;
    }
    if (pointInPolygon(a, s)) vin = true;
    for (let i = 0; i < s.length; i++) {
      if (segmentsIntersect(s[i], s[(i + 1) % s.length], a, b)) crossed = true;
    }
  }

  return allIn && !crossed && !vin ? 'full' : anyIn || crossed || vin ? 'partial' : 'outside';
}

/**
 * Inspects 1 or 2 uploaded GeoJSON files to automatically distinguish `Xuduudka Beerta` (larger farm boundary)
 * from `Block Tusaale` (smaller sample block polygon) — or detect if a single combined GeoJSON already contains both!
 */
export function splitPairIntoBoundaryAndSampleBlock(
  rawFiles: { fileName: string; fileText: string }[]
):
  | {
      ok: true;
      boundaryFile: { fileName: string; fileText: string; polygonCount: number };
      sampleBlockFile: { fileName: string; fileText: string; polygonCount: number } | null;
      hasBothReady: boolean;
    }
  | { ok: false; errorSomali: string } {
  if (!rawFiles || rawFiles.length === 0) {
    return { ok: false, errorSomali: 'Fadlan dooro faylka GeoJSON.' };
  }

  if (rawFiles.length === 1) {
    const f = rawFiles[0];
    const p = parseGeoJsonPolygonsStrict(f.fileText, f.fileName);
    if (!p.ok) return p;

    if (p.polygons.length >= 2) {
      const unified = unifyPolygonCollectionsToWgs84([{ rawJson: p.rawJson, polygons: p.polygons }])[0];
      const { fwd } = buildUtmProjectorsFromLonLat(unified.flatMap((u) => u.ringRaw));
      const areas = unified.map((u) => Math.abs(shoelaceArea(u.ringRaw.map(fwd))));
      const maxA = Math.max(...areas);
      const hasEmbeddedSample = areas.some((a) => a >= 200 && a <= maxA * 0.35);
      if (hasEmbeddedSample) {
        return {
          ok: true,
          boundaryFile: { fileName: f.fileName, fileText: f.fileText, polygonCount: p.polygons.length },
          sampleBlockFile: { fileName: f.fileName, fileText: f.fileText, polygonCount: 1 },
          hasBothReady: true,
        };
      }
    }

    return {
      ok: true,
      boundaryFile: { fileName: f.fileName, fileText: f.fileText, polygonCount: p.polygons.length },
      sampleBlockFile: null,
      hasBothReady: false,
    };
  }

  const f0 = rawFiles[0];
  const f1 = rawFiles[1];
  const p0 = parseGeoJsonPolygonsStrict(f0.fileText, f0.fileName);
  if (!p0.ok) return p0;
  const p1 = parseGeoJsonPolygonsStrict(f1.fileText, f1.fileName);
  if (!p1.ok) return p1;

  const unified = unifyPolygonCollectionsToWgs84([
    { rawJson: p0.rawJson, polygons: p0.polygons },
    { rawJson: p1.rawJson, polygons: p1.polygons },
  ]);
  const allPts = [...unified[0].flatMap((x) => x.ringRaw), ...unified[1].flatMap((x) => x.ringRaw)];
  const { fwd } = buildUtmProjectorsFromLonLat(allPts);

  const maxArea0 = Math.max(0, ...unified[0].map((u) => Math.abs(shoelaceArea(u.ringRaw.map(fwd)))));
  const maxArea1 = Math.max(0, ...unified[1].map((u) => Math.abs(shoelaceArea(u.ringRaw.map(fwd)))));

  const f0LooksBnd = /xuduud|boundary|perimeter|soohdin/i.test(f0.fileName);
  const f1LooksBnd = /xuduud|boundary|perimeter|soohdin/i.test(f1.fileName);
  const f0LooksBlk = /block|tusaale|sample|blk/i.test(f0.fileName);
  const f1LooksBlk = /block|tusaale|sample|blk/i.test(f1.fileName);

  let firstIsBoundary = maxArea0 >= maxArea1;
  if (f0LooksBnd && !f1LooksBnd && maxArea0 > maxArea1 * 0.5) firstIsBoundary = true;
  else if (f1LooksBnd && !f0LooksBnd && maxArea1 > maxArea0 * 0.5) firstIsBoundary = false;
  else if (f0LooksBlk && !f1LooksBlk && maxArea1 >= maxArea0) firstIsBoundary = false;
  else if (f1LooksBlk && !f0LooksBlk && maxArea0 >= maxArea1) firstIsBoundary = true;

  const bnd = firstIsBoundary
    ? { fileName: f0.fileName, fileText: f0.fileText, polygonCount: p0.polygons.length }
    : { fileName: f1.fileName, fileText: f1.fileText, polygonCount: p1.polygons.length };
  const smp = firstIsBoundary
    ? { fileName: f1.fileName, fileText: f1.fileText, polygonCount: p1.polygons.length }
    : { fileName: f0.fileName, fileText: f0.fileText, polygonCount: p0.polygons.length };

  return {
    ok: true,
    boundaryFile: bnd,
    sampleBlockFile: smp,
    hasBothReady: true,
  };
}

/**
 * WORKFLOW 1: "Samee nashqad"
 * - When `Xuduudka Beerta` + `Block Tusaale` GeoJSON are provided, NO extra parameters are needed!
 * - If the block is `90 × 48 m` (or `48 × 90 m`), automatically enforces:
 *   1) `15 m` road on ALL 4 SIDES of every block (`rU = 15 m, rV = 15 m`)
 *   2) Full plots = `18 × 24 m` (`432 m²`, 10 positions `1..10` per block)
 *   3) Half plots at positions `1, 5, 6, 10` = `18 × 12 m` (`216 m²`)
 *   4) Half plots at positions `2, 3, 4, 7, 8, 9` = `9 × 24 m` (`216 m²`)
 * - For custom block dimensions/parameters, repeats blocks with `roadWidthM` and clips boundary-crossing plots cleanly.
 */
export function runSameeNashqadWorkflow(input: SameeNashqadInput): SameeNashqadResult {
  const bndParsed = parseGeoJsonPolygonsStrict(input.boundaryFileText, input.boundaryFileName);
  if (!bndParsed.ok) {
    return bndParsed;
  }

  const hasCallerPlotW = input.plotWidthM !== undefined && input.plotWidthM !== null;
  const hasCallerPlotD = input.plotDepthM !== undefined && input.plotDepthM !== null;
  const hasCallerRoad = input.roadWidthM !== undefined && input.roadWidthM !== null;

  const pwInput = hasCallerPlotW ? Number(input.plotWidthM) : 18;
  const pdInput = hasCallerPlotD ? Number(input.plotDepthM) : 24;
  const roadInput = hasCallerRoad ? Number(input.roadWidthM) : 15;

  if (!Number.isFinite(pwInput) || pwInput <= 0 || !Number.isFinite(pdInput) || pdInput <= 0) {
    return {
      ok: false,
      errorSomali: 'Fadlan geli cabbirka plot-ka oo sax ah (ballac iyo dherer ka weyn 0 mitir).',
    };
  }
  if (!Number.isFinite(roadInput) || roadInput < 0) {
    return {
      ok: false,
      errorSomali: 'Ballaca waddada u dhexaysa blocks-ka ma noqon karo tiro taban.',
    };
  }

  const hasExplicitBearing =
    input.widthBearingDeg !== undefined &&
    input.widthBearingDeg !== null &&
    String(input.widthBearingDeg).trim() !== '';

  let parsedBearingDeg = 0;
  if (hasExplicitBearing) {
    const rawB = Number(input.widthBearingDeg);
    if (!Number.isFinite(rawB)) {
      return {
        ok: false,
        errorSomali: 'Fadlan geli Bearing Degree oo tiro sax ah (0° ilaa 360°).',
      };
    }
    parsedBearingDeg = ((rawB % 360) + 360) % 360;
  }

  let sampleParsed: { rawJson: unknown; polygons: ExtractedPolygonFeature[] } | null = null;
  if (input.sampleBlockMode === 'file') {
    if (input.sampleBlockFileText && input.sampleBlockFileName) {
      const sp = parseGeoJsonPolygonsStrict(input.sampleBlockFileText, input.sampleBlockFileName);
      if (!sp.ok) return sp;
      sampleParsed = { rawJson: sp.rawJson, polygons: sp.polygons };
    } else if (bndParsed.polygons.length < 2) {
      return {
        ok: false,
        errorSomali: 'Fadlan dooro faylka GeoJSON ee block-ga tusaalaha ah.',
      };
    }
  } else {
    const bw = Number(input.blockWidthM);
    const bl = Number(input.blockLengthM);
    if (!Number.isFinite(bw) || bw <= 0 || !Number.isFinite(bl) || bl <= 0) {
      return {
        ok: false,
        errorSomali: 'Fadlan geli ballaca iyo dhererka block-ga (mitir ka weyn 0).',
      };
    }
    if (bw < Math.min(pwInput, pdInput) * 0.5 || bl < Math.min(pwInput, pdInput) * 0.5) {
      return {
        ok: false,
        errorSomali: 'Cabbirka block-gu waa inuu ka weynaadaa cabbirka hal plot.',
      };
    }
  }

  // Unify boundary (+ optional sample block file) into WGS84 together
  const entriesToUnify = sampleParsed
    ? [{ rawJson: bndParsed.rawJson, polygons: bndParsed.polygons }, sampleParsed]
    : [{ rawJson: bndParsed.rawJson, polygons: bndParsed.polygons }];

  const unified = unifyPolygonCollectionsToWgs84(entriesToUnify);
  const bndPolysWgs = unified[0];
  let samplePolysWgs = sampleParsed ? unified[1] : null;

  // Pick largest polygon in boundary file as farm boundary
  const { fwd, inv, epsg } = buildUtmProjectorsFromLonLat(
    [
      ...bndPolysWgs.flatMap((p) => p.ringRaw),
      ...(samplePolysWgs ? samplePolysWgs.flatMap((p) => p.ringRaw) : []),
    ]
  );

  let bestBoundaryIdx = 0;
  let bestBoundaryWgs = bndPolysWgs[0].ringRaw;
  let bestBoundaryArea = 0;
  bndPolysWgs.forEach((poly, idx) => {
    const utm = poly.ringRaw.map(fwd);
    const a = Math.abs(shoelaceArea(utm));
    if (a > bestBoundaryArea) {
      bestBoundaryArea = a;
      bestBoundaryWgs = poly.ringRaw;
      bestBoundaryIdx = idx;
    }
  });

  // Support embedded sample block inside a combined single GeoJSON file (when boundary & sample block are in 1 file)
  if (input.sampleBlockMode === 'file') {
    const sameSingleFile =
      !samplePolysWgs ||
      (input.sampleBlockFileText === input.boundaryFileText && bndPolysWgs.length >= 2);
    if (sameSingleFile && bndPolysWgs.length >= 2) {
      const otherPolys = bndPolysWgs
        .filter((_, idx) => idx !== bestBoundaryIdx)
        .map((p) => ({
          poly: p,
          area: Math.abs(shoelaceArea(extractFirstCleanSampleRingUtm(p.ringRaw.map(fwd)))),
        }))
        .filter((x) => x.area >= 150 && x.area <= bestBoundaryArea * 0.45)
        .sort((a, b) => Math.abs(a.area - 4320) - Math.abs(b.area - 4320));

      if (otherPolys.length > 0) {
        samplePolysWgs = [otherPolys[0].poly];
      } else if (!samplePolysWgs) {
        return {
          ok: false,
          errorSomali: 'Fadlan dooro faylka GeoJSON ee block-ga tusaalaha ah.',
        };
      }
    }
  }

  const boundaryUtmRaw = cleanPolygonVertices(bestBoundaryWgs.map(fwd));
  if (boundaryUtmRaw.length < 3 || bestBoundaryArea < 10) {
    return {
      ok: false,
      errorSomali: 'Xuduudka beerta cabbirkiisu aad ayuu u yar yahay ama iskuma xidhna.',
    };
  }

  const boundaryCCW = ensureCCW(boundaryUtmRaw);
  const boundaryTriangles = triangulateSimplePolygonCCW(boundaryCCW);
  if (boundaryTriangles.length === 0) {
    return {
      ok: false,
      errorSomali: 'Xuduudka beerta wuxuu leeyahay xariiqo is-goynaya oo aan la jari karin.',
    };
  }

  // Determine block frame:
  // `v` = unit vector along Ballaca Block-ga (W)
  // `u` = unit vector along Dhererka Block-ga (L)
  let u: Point2D;
  let v: Point2D;
  let c0: Point2D;
  let L: number;
  let W: number;
  let appliedBearingDeg: number;
  let naturalSampleFr: { u: Point2D; c: Point2D; long: number; short: number } | null = null;

  if (samplePolysWgs && samplePolysWgs.length > 0) {
    const sampleRingUtm = extractFirstCleanSampleRingUtm(samplePolysWgs[0].ringRaw.map(fwd));
    if (sampleRingUtm.length < 3) {
      return {
        ok: false,
        errorSomali: 'Block-ga tusaalaha ah malaha xaglo Polygon oo ku filan.',
      };
    }
    const fr = frameFromRing(sampleRingUtm);
    naturalSampleFr = fr;
    c0 = fr.c;

    if (hasExplicitBearing) {
      const rad = (parsedBearingDeg * Math.PI) / 180;
      v = [Math.sin(rad), Math.cos(rad)];
      u = [Math.cos(rad), -Math.sin(rad)];
      appliedBearingDeg = parsedBearingDeg;

      let hasAlignedEdge = false;
      for (let i = 0; i < sampleRingUtm.length; i++) {
        const a = sampleRingUtm[i];
        const b = sampleRingUtm[(i + 1) % sampleRingUtm.length];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy);
        if (len < 0.5) continue;
        const dotAbs = Math.abs((dx * v[0] + dy * v[1]) / len);
        if (dotAbs >= Math.cos((6 * Math.PI) / 180)) {
          hasAlignedEdge = true;
          break;
        }
      }

      if (hasAlignedEdge) {
        let minSU = Infinity,
          maxSU = -Infinity,
          minSV = Infinity,
          maxSV = -Infinity;
        for (const p of sampleRingUtm) {
          const su = p[0] * u[0] + p[1] * u[1];
          const sv = p[0] * v[0] + p[1] * v[1];
          if (su < minSU) minSU = su;
          if (su > maxSU) maxSU = su;
          if (sv < minSV) minSV = sv;
          if (sv > maxSV) maxSV = sv;
        }
        L = +Math.max(1, maxSU - minSU).toFixed(3);
        W = +Math.max(1, maxSV - minSV).toFixed(3);
      } else {
        L = +fr.long.toFixed(3);
        W = +fr.short.toFixed(3);
      }
    } else {
      u = fr.u;
      v = [-u[1], u[0]];
      L = +fr.long.toFixed(3);
      W = +fr.short.toFixed(3);
      const rawDeg = (Math.atan2(v[0], v[1]) * 180) / Math.PI;
      appliedBearingDeg = +(((rawDeg % 360) + 360) % 360).toFixed(1);
    }
  } else {
    const fr = frameFromRing(boundaryCCW);
    c0 = fr.c;
    L = Number(input.blockLengthM);
    W = Number(input.blockWidthM);

    if (hasExplicitBearing) {
      const rad = (parsedBearingDeg * Math.PI) / 180;
      v = [Math.sin(rad), Math.cos(rad)];
      u = [Math.cos(rad), -Math.sin(rad)];
      appliedBearingDeg = parsedBearingDeg;
    } else {
      u = fr.u;
      v = [-u[1], u[0]];
      const rawDeg = (Math.atan2(v[0], v[1]) * 180) / Math.PI;
      appliedBearingDeg = +(((rawDeg % 360) + 360) % 360).toFixed(1);
    }
  }

  // Check if block is 90×48 m (or 48×90 m within survey tolerance ±2.5 m)
  const rawLongSide = Math.max(L, W);
  const rawShortSide = Math.min(L, W);
  const is90x48Block =
    Math.abs(rawLongSide - 90) <= 2.5 && Math.abs(rawShortSide - 48) <= 2.5;

  const hasCustomNonStandardOverride =
    (hasCallerPlotW || hasCallerPlotD || hasCallerRoad) &&
    !(
      ((Math.abs(pwInput - 18) <= 0.5 && Math.abs(pdInput - 24) <= 0.5) ||
        (Math.abs(pwInput - 24) <= 0.5 && Math.abs(pdInput - 18) <= 0.5)) &&
      Math.abs(roadInput - 15) <= 0.5
    );

  // Automatic 90×48 m rule:
  // - 4-sided 15 m roads around every block (SU = 90 + 15 = 105 m, SV = 48 + 15 = 63 m)
  // - Full plots = 18 × 24 m (432 m², 10 plot slots 1..10 per block)
  // - Half plots 1, 5, 6, 10 = 18 × 12 m (216 m²)
  // - Half plots 2, 3, 4, 7, 8, 9 = 9 × 24 m (216 m²)
  const useAuto90x48Rule = is90x48Block && !hasCustomNonStandardOverride;

  interface CandidateGeneratedBlock {
    ci: number;
    rj: number;
    centerNorth: number;
    centerEast: number;
    blockRingUtm: Point2D[];
    clippedPlots: {
      ic: number;
      ir: number;
      pno?: number;
      cabbirka?: string;
      ringUtm: Point2D[];
      areaSqM: number;
      nooca: 'dhammaystiran' | 'half';
    }[];
  }

  const rawBlocks: CandidateGeneratedBlock[] = [];
  let roadM = roadInput;
  let actualPlotW = pwInput;
  let actualPlotD = pdInput;
  let nominalPlotArea = actualPlotW * actualPlotD;

  let bMinX = Infinity,
    bMaxX = -Infinity,
    bMinY = Infinity,
    bMaxY = -Infinity;
  for (const pt of boundaryCCW) {
    if (pt[0] < bMinX) bMinX = pt[0];
    if (pt[0] > bMaxX) bMaxX = pt[0];
    if (pt[1] < bMinY) bMinY = pt[1];
    if (pt[1] > bMaxY) bMaxY = pt[1];
  }

  if (useAuto90x48Rule) {
    L = 90;
    W = 48;
    roadM = 15;
    actualPlotW = 18;
    actualPlotD = 24;
    nominalPlotArea = 432;

    // Canonical 90m (u90) and 48m (v48) orthogonal unit axes
    let ux: number;
    let uy: number;
    let vx: number;
    let vy: number;

    if (naturalSampleFr && !hasExplicitBearing) {
      ux = naturalSampleFr.u[0];
      uy = naturalSampleFr.u[1];
      if (ux < 0 || (Math.abs(ux) < 1e-12 && uy < 0)) {
        ux = -ux;
        uy = -uy;
      }
      vx = -uy;
      vy = ux;
      if (vy < 0) {
        vx = -vx;
        vy = -vy;
      }
      const rawDeg = (Math.atan2(vx, vy) * 180) / Math.PI;
      appliedBearingDeg = +(((rawDeg % 360) + 360) % 360).toFixed(1);
    } else {
      // Respect explicit bearing: if user entered W=90, L=48 then `v` is the 90m axis; otherwise `u` is the 90m axis
      const vWasLonger =
        input.sampleBlockMode === 'dimensions' &&
        Number(input.blockWidthM) > Number(input.blockLengthM);
      const axis90 = vWasLonger ? v : u;
      ux = axis90[0];
      uy = axis90[1];
      if (ux < 0 || (Math.abs(ux) < 1e-12 && uy < 0)) {
        ux = -ux;
        uy = -uy;
      }
      vx = -uy;
      vy = ux;
      if (vy < 0) {
        vx = -vx;
        vy = -vy;
      }
    }

    const SU = 90 + 15; // 105 m (90 m block + 15 m road on East & West)
    const SV = 48 + 15; // 63 m  (48 m block + 15 m road on North & South)

    const P90 = (cu: number, cv: number): Point2D => [
      c0[0] + cu * ux + cv * vx,
      c0[1] + cu * uy + cv * vy,
    ];
    const makeRect90 = (cu: number, cv: number, l: number, w: number): Point2D[] =>
      ensureCCW([
        P90(cu - l / 2, cv - w / 2),
        P90(cu + l / 2, cv - w / 2),
        P90(cu + l / 2, cv + w / 2),
        P90(cu - l / 2, cv + w / 2),
      ]);

    let minCU = Infinity,
      maxCU = -Infinity,
      minCV = Infinity,
      maxCV = -Infinity;
    for (const q of boundaryCCW) {
      const du = q[0] - c0[0];
      const dv = q[1] - c0[1];
      const pu = du * ux + dv * uy;
      const pv = du * vx + dv * vy;
      if (pu < minCU) minCU = pu;
      if (pu > maxCU) maxCU = pu;
      if (pv < minCV) minCV = pv;
      if (pv > maxCV) maxCV = pv;
    }

    const ci0 = Math.floor(minCU / SU) - 1;
    const ci1 = Math.ceil(maxCU / SU) + 1;
    const rj0 = Math.floor(minCV / SV) - 1;
    const rj1 = Math.ceil(maxCV / SV) + 1;

    for (let rj = rj0; rj <= rj1; rj++) {
      for (let ci = ci0; ci <= ci1; ci++) {
        const cu = ci * SU;
        const cv = rj * SV;
        const blockRectUtm = makeRect90(cu, cv, 90, 48);

        let blkMinX = Infinity,
          blkMaxX = -Infinity,
          blkMinY = Infinity,
          blkMaxY = -Infinity;
        for (const q of blockRectUtm) {
          if (q[0] < blkMinX) blkMinX = q[0];
          if (q[0] > blkMaxX) blkMaxX = q[0];
          if (q[1] < blkMinY) blkMinY = q[1];
          if (q[1] > blkMaxY) blkMaxY = q[1];
        }
        if (blkMaxX < bMinX || blkMinX > bMaxX || blkMaxY < bMinY || blkMinY > bMaxY) {
          continue;
        }

        const survivingPlots: CandidateGeneratedBlock['clippedPlots'] = [];

        // 10 plots per 90×48 m block:
        // rr=0 (top row):    pno = 1, 2, 3, 4, 5
        // rr=1 (bottom row): pno = 6, 7, 8, 9, 10
        for (let rr = 0; rr < 2; rr++) {
          for (let cc = 0; cc < 5; cc++) {
            const pno = rr * 5 + cc + 1;
            const pcu = cu - 45 + 18 * (cc + 0.5);
            const pcv = cv + 24 - 24 * (rr + 0.5);
            const plotRectUtm = makeRect90(pcu, pcv, 18, 24);
            const st = classifyRectInsideBoundaryUtm(plotRectUtm, boundaryCCW);

            if (st === 'full') {
              survivingPlots.push({
                ic: cc,
                ir: 1 - rr,
                pno,
                cabbirka: '18×24 m',
                ringUtm: plotRectUtm,
                areaSqM: 432,
                nooca: 'dhammaystiran',
              });
            } else if (st === 'partial') {
              // Exact positional half-plot rule:
              // - Plots 1, 5, 6, 10 (cc === 0 || cc === 4) -> 18 × 12 m (216 m²)
              // - Plots 2, 3, 4, 7, 8, 9 (cc === 1, 2, 3)   ->  9 × 24 m (216 m²)
              const isCorner15610 = cc === 0 || cc === 4;
              const hl = isCorner15610 ? 18 : 9;
              const hw = isCorner15610 ? 12 : 24;
              const dimLabel = isCorner15610 ? '18×12 m' : '9×24 m';

              for (let k = 0; k < 2; k++) {
                const sg = k === 0 ? 1 : -1;
                const hr = isCorner15610
                  ? makeRect90(pcu, pcv + (sg * hw) / 2, hl, hw)
                  : makeRect90(pcu - (sg * hl) / 2, pcv, hl, hw);
                if (classifyRectInsideBoundaryUtm(hr, boundaryCCW) === 'full') {
                  survivingPlots.push({
                    ic: cc * 2 + k,
                    ir: 1 - rr,
                    pno,
                    cabbirka: dimLabel,
                    ringUtm: hr,
                    areaSqM: 216,
                    nooca: 'half',
                  });
                }
              }
            }
          }
        }

        if (survivingPlots.length === 0) continue;

        let bestBlockRing = blockRectUtm;
        if (classifyRectInsideBoundaryUtm(blockRectUtm, boundaryCCW) !== 'full') {
          const blockClipOut = intersectPolygonWithTriangulatedBoundary(
            blockRectUtm,
            boundaryTriangles
          );
          if (blockClipOut.insideRingsUtm.length > 0) {
            let maxBA = 0;
            for (const bp of blockClipOut.insideRingsUtm) {
              const ba = Math.abs(shoelaceArea(bp));
              if (ba > maxBA && bp.length >= 3) {
                maxBA = ba;
                bestBlockRing = bp;
              }
            }
          }
        }

        const centerPt = P90(cu, cv);
        rawBlocks.push({
          ci,
          rj,
          centerEast: centerPt[0],
          centerNorth: centerPt[1],
          blockRingUtm: bestBlockRing,
          clippedPlots: survivingPlots,
        });
      }
    }
  } else {
    // Generic custom dimensions / non-90×48 block polygon clipping workflow
    let effPw = pwInput;
    let effPd = pdInput;
    const countDirect = Math.floor((L + 1e-5) / pwInput) * Math.floor((W + 1e-5) / pdInput);
    const countSwapped = Math.floor((L + 1e-5) / pdInput) * Math.floor((W + 1e-5) / pwInput);
    if (countDirect === 0 && countSwapped > 0) {
      effPw = pdInput;
      effPd = pwInput;
    }

    const nC = Math.max(1, Math.floor((L + 1e-5) / effPw));
    const nR = Math.max(1, Math.floor((W + 1e-5) / effPd));
    actualPlotW = nC * effPw <= L + 0.05 ? effPw : L / nC;
    actualPlotD = nR * effPd <= W + 0.05 ? effPd : W / nR;
    nominalPlotArea = actualPlotW * actualPlotD;

    const originUtm: Point2D = [
      c0[0] - u[0] * (L / 2) - v[0] * (W / 2),
      c0[1] - u[1] * (L / 2) - v[1] * (W / 2),
    ];

    const toUV = (pt: Point2D): Point2D => {
      const dx = pt[0] - originUtm[0];
      const dy = pt[1] - originUtm[1];
      return [dx * u[0] + dy * u[1], dx * v[0] + dy * v[1]];
    };

    const fromUV = (uu: number, vv: number): Point2D => [
      originUtm[0] + u[0] * uu + v[0] * vv,
      originUtm[1] + u[1] * uu + v[1] * vv,
    ];

    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;

    for (const pt of boundaryCCW) {
      const [pu, pv] = toUV(pt);
      if (pu < minU) minU = pu;
      if (pu > maxU) maxU = pu;
      if (pv < minV) minV = pv;
      if (pv > maxV) maxV = pv;
    }

    const stepU = L + roadM;
    const stepV = W + roadM;
    const iStart = Math.floor(minU / stepU) - 1;
    const iEnd = Math.ceil(maxU / stepU) + 1;
    const jStart = Math.floor(minV / stepV) - 1;
    const jEnd = Math.ceil(maxV / stepV) + 1;

    for (let rj = jStart; rj <= jEnd; rj++) {
      for (let ci = iStart; ci <= iEnd; ci++) {
        const bU0 = ci * stepU;
        const bV0 = rj * stepV;
        const blockRectUtm: Point2D[] = [
          fromUV(bU0, bV0),
          fromUV(bU0 + L, bV0),
          fromUV(bU0 + L, bV0 + W),
          fromUV(bU0, bV0 + W),
        ];

        let blkMinX = Infinity,
          blkMaxX = -Infinity,
          blkMinY = Infinity,
          blkMaxY = -Infinity;
        for (const q of blockRectUtm) {
          if (q[0] < blkMinX) blkMinX = q[0];
          if (q[0] > blkMaxX) blkMaxX = q[0];
          if (q[1] < blkMinY) blkMinY = q[1];
          if (q[1] > blkMaxY) blkMaxY = q[1];
        }
        if (blkMaxX < bMinX || blkMinX > bMaxX || blkMaxY < bMinY || blkMinY > bMaxY) {
          continue;
        }

        const survivingPlots: CandidateGeneratedBlock['clippedPlots'] = [];

        for (let ir = 0; ir < nR; ir++) {
          for (let ic = 0; ic < nC; ic++) {
            const pU0 = bU0 + ic * actualPlotW;
            const pV0 = bV0 + ir * actualPlotD;
            const plotRectUtm: Point2D[] = [
              fromUV(pU0, pV0),
              fromUV(pU0 + actualPlotW, pV0),
              fromUV(pU0 + actualPlotW, pV0 + actualPlotD),
              fromUV(pU0, pV0 + actualPlotD),
            ];

            let pMinX = Infinity,
              pMaxX = -Infinity,
              pMinY = Infinity,
              pMaxY = -Infinity;
            for (const q of plotRectUtm) {
              if (q[0] < pMinX) pMinX = q[0];
              if (q[0] > pMaxX) pMaxX = q[0];
              if (q[1] < pMinY) pMinY = q[1];
              if (q[1] > pMaxY) pMaxY = q[1];
            }
            if (pMaxX < bMinX || pMinX > bMaxX || pMaxY < bMinY || pMaxY > bMaxY) {
              continue;
            }

            const clipOut = intersectPolygonWithTriangulatedBoundary(
              ensureCCW(plotRectUtm),
              boundaryTriangles
            );
            const clippedPieces = clipOut.insideRingsUtm;
            if (clippedPieces.length === 0) continue;

            let bestPiece = clippedPieces[0];
            let bestPieceArea = 0;
            const totalInsideArea = clipOut.insideAreaSqM;
            for (const piece of clippedPieces) {
              const a = Math.abs(shoelaceArea(piece));
              if (a > bestPieceArea) {
                bestPieceArea = a;
                bestPiece = piece;
              }
            }

            if (bestPieceArea < 1.0 || bestPiece.length < 3) {
              continue;
            }

            const isFullPlot = totalInsideArea >= nominalPlotArea * 0.985;
            const finalRingUtm = isFullPlot ? plotRectUtm : bestPiece;
            const finalAreaSqM = +(
              isFullPlot ? Math.abs(shoelaceArea(plotRectUtm)) : bestPieceArea
            ).toFixed(2);

            survivingPlots.push({
              ic,
              ir,
              ringUtm: finalRingUtm,
              areaSqM: finalAreaSqM,
              nooca: isFullPlot ? 'dhammaystiran' : 'half',
            });
          }
        }

        if (survivingPlots.length === 0) continue;

        const blockClipOut = intersectPolygonWithTriangulatedBoundary(
          ensureCCW(blockRectUtm),
          boundaryTriangles
        );
        const blockPieces = blockClipOut.insideRingsUtm;
        let bestBlockRing = blockRectUtm;
        if (blockPieces.length > 0) {
          let maxBA = 0;
          for (const bp of blockPieces) {
            const ba = Math.abs(shoelaceArea(bp));
            if (ba > maxBA && bp.length >= 3) {
              maxBA = ba;
              bestBlockRing = bp;
            }
          }
        }

        const centerPt = fromUV(bU0 + L / 2, bV0 + W / 2);
        rawBlocks.push({
          ci,
          rj,
          centerEast: centerPt[0],
          centerNorth: centerPt[1],
          blockRingUtm: bestBlockRing,
          clippedPlots: survivingPlots,
        });
      }
    }
  }

  if (rawBlocks.length === 0) {
    return {
      ok: false,
      errorSomali:
        'Gudaha xuduudka beerta lagama samayn karin wax plots ah. Fadlan hubi cabbirka xuduudka iyo cabbirka plot-ka.',
    };
  }

  // Sort blocks North -> South then West -> East for clean sequential naming
  rawBlocks.sort((a, b) => b.centerNorth - a.centerNorth || a.centerEast - b.centerEast);

  const prebuiltBlocks: PrebuiltGeoJsonSubdivision['blocks'] = [];
  const prebuiltPlots: PrebuiltGeoJsonSubdivision['plots'] = [];

  let globalPlotNumber = 0;
  let fullPlotsCount = 0;
  let halfPlotsCount = 0;
  let totalPlotsAreaSqM = 0;

  rawBlocks.forEach((blk, bIdx) => {
    const blockSeqName = `R${String(bIdx + 1).padStart(2, '0')}`;
    const blockRingLonLat = blk.blockRingUtm.map(inv);
    const blockAreaSqM = +Math.abs(shoelaceArea(blk.blockRingUtm)).toFixed(2);

    prebuiltBlocks.push({
      id: blockSeqName,
      R: bIdx + 1,
      C: 1,
      ringLonLat: blockRingLonLat,
      rawProperties: {
        block: blockSeqName,
        area_m2: blockAreaSqM,
        bearing_deg: appliedBearingDeg,
        waddo_m: roadM,
      },
    });

    const sortedPlots = [...blk.clippedPlots].sort(
      (a, b) => (a.pno && b.pno ? a.pno - b.pno : b.ir - a.ir || a.ic - b.ic)
    );
    const usedIdsInBlock = new Set<string>();

    for (const pl of sortedPlots) {
      globalPlotNumber += 1;
      let plotId = pl.pno
        ? `${blockSeqName}-P${String(pl.pno).padStart(2, '0')}`
        : `${blockSeqName}-P${String(globalPlotNumber).padStart(3, '0')}`;
      if (usedIdsInBlock.has(plotId)) {
        plotId = `${plotId}B`;
      }
      usedIdsInBlock.add(plotId);

      const pctInside = Math.min(100, +((pl.areaSqM / nominalPlotArea) * 100).toFixed(1));

      if (pl.nooca === 'dhammaystiran') {
        fullPlotsCount += 1;
      } else {
        halfPlotsCount += 1;
      }
      totalPlotsAreaSqM += pl.areaSqM;

      prebuiltPlots.push({
        id: plotId,
        blockId: blockSeqName,
        no: globalPlotNumber,
        ringLonLat: pl.ringUtm.map(inv),
        rawProperties: {
          plot_no: globalPlotNumber,
          ...(pl.pno !== undefined ? { booska_block: pl.pno } : {}),
          ...(pl.cabbirka ? { cabbirka: pl.cabbirka } : {}),
          block: blockSeqName,
          nooca: pl.nooca,
          area_m2: pl.areaSqM,
          goostay: pl.nooca === 'half' ? 1 : 0,
          pct_gudaha: pl.nooca === 'dhammaystiran' ? 100 : pctInside,
          waddo_m: roadM,
          bearing_deg: appliedBearingDeg,
        },
      });
    }
  });

  totalPlotsAreaSqM = +totalPlotsAreaSqM.toFixed(2);
  const boundaryAreaSqM = +Math.abs(shoelaceArea(boundaryCCW)).toFixed(2);

  const recognizedFiles: NashqadFileRecognitionItem[] = [
    {
      fileName: input.boundaryFileName,
      role: 'boundary',
      featureCount: bndPolysWgs.length,
      recognizedBy: 'manual',
    },
  ];
  if (
    input.sampleBlockMode === 'file' &&
    input.sampleBlockFileName &&
    input.sampleBlockFileName !== input.boundaryFileName &&
    samplePolysWgs
  ) {
    recognizedFiles.push({
      fileName: input.sampleBlockFileName,
      role: 'blocks',
      featureCount: samplePolysWgs.length,
      recognizedBy: 'manual',
    });
  }

  const summary: NashqadWorkflowSummary = {
    mode: 'samee_nashqad',
    createdAt: new Date().toISOString(),
    recognizedFiles,
    missingFileMessages: [],
    blocksCount: prebuiltBlocks.length,
    fullPlotsCount,
    halfPlotsCount,
    totalPlotsAreaSqM,
    boundaryAreaSqM,
    standardPlotAreaSqM: +nominalPlotArea.toFixed(2),
    widthBearingDeg: +appliedBearingDeg.toFixed(1),
  };

  const boundaryLonLat = boundaryCCW.map(inv);
  const boundaryItem: ParsedGeoItem = {
    name: input.boundaryFileName.replace(/\.(geo)?json$/i, '') || 'Xuduudka Beerta',
    type: 'Polygon',
    coords: boundaryLonLat,
  };

  const nextParams: SubdivisionParams = {
    ...(input.previousState?.params || DEFAULT_SUBDIVISION_PARAMS),
    L: +L.toFixed(2),
    W: +W.toFixed(2),
    pw: +actualPlotW.toFixed(2),
    pd: +actualPlotD.toFixed(2),
    rU: roadM,
    rV: roadM,
  };

  const base = createEmptyLandSubdivisionState();
  const nextState: LandSubdivisionState = {
    ...base,
    boundaryItems: [boundaryItem],
    boundaryFileName: input.boundaryFileName,
    selectedBoundaryIndex: 0,
    sampleCustom: input.sampleBlockMode === 'file',
    sampleFileName:
      input.sampleBlockMode === 'file' && input.sampleBlockFileName
        ? `${input.sampleBlockFileName} (${appliedBearingDeg}°)`
        : `${W.toFixed(1)}m × ${L.toFixed(1)}m (${appliedBearingDeg}°)`,
    params: nextParams,
    prebuiltSubdivision: {
      sourceFileName: input.boundaryFileName,
      detectedCrs: `EPSG:${epsg}`,
      boundaryRingLonLat: boundaryLonLat,
      blocks: prebuiltBlocks,
      plots: prebuiltPlots,
      validationWarnings: [],
    },
    nashqadSummary: summary,
    auditHistory: [
      createAuditEntry(
        'geojson_import',
        useAuto90x48Rule
          ? `Nashqad toos ah 90×48m (Waddo 15m afarta dhinac, Plot 18×24m, Half 18×12m & 9×24m): ${prebuiltBlocks.length} Block, ${fullPlotsCount} Plot dhammaystiran, ${halfPlotsCount} Half plot (${totalPlotsAreaSqM.toLocaleString()} m²).`
          : `Nashqad toos ah waa la sameeyey (Bearing ${appliedBearingDeg}°): ${prebuiltBlocks.length} Block, ${fullPlotsCount} Plot dhammaystiran, ${halfPlotsCount} Half plot (${totalPlotsAreaSqM.toLocaleString()} m²).`
      ),
      ...(input.previousState?.auditHistory || []).slice(0, 49),
    ],
  };

  return { ok: true, nextState, summary };
}

function inferNamedCategoryFromFileName(fileName: string): string | null {
  const clean = fileName.replace(/\.(geo)?json$|\.(kml|kmz)$/i, '').toLowerCase();
  if (clean.includes('danguud')) return 'Danguud';
  if (clean.includes('tacab')) return 'Tacab';
  if (clean.includes('milgo')) return 'Milgo';
  if (clean.includes('ina_muuse') || clean.includes('inamuuse') || clean.includes('ina muuse')) {
    return 'Ina Muuse';
  }
  if (clean.includes('cwahaab') || clean.includes('cabdiwahaab')) return 'CWAHAAB';
  if (clean.includes('shafool')) return 'Shafool';
  if (clean.includes('xamse')) return 'Xamse Mubaarig';
  if (clean.includes('culimo')) return 'Culimo';
  if (/\bxaq\b|_xaq|xaq_/.test(clean) || clean === 'xaq') return 'Xaq';
  return null;
}

function classifyRoleFromFileNameAndProps(
  fileName: string,
  polygons: ExtractedPolygonFeature[],
  lines: ExtractedLineFeature[],
  points: ExtractedPointFeature[]
): Exclude<NashqadFileRole, 'ignore' | 'unknown'> | null {
  const lower = fileName.toLowerCase();

  // 1. Explicit filename keywords (supports 20+ separate QGIS layer files cleanly!)
  if (/xuduud|boundary|perimeter|beer_xuduud|soohdin|01_xuduud/.test(lower)) {
    return 'boundary';
  }
  if (/doox|wadi|stream|river|tog|kanaal|canal|05_doox/.test(lower) && !/plot/.test(lower)) {
    return 'wadis';
  }
  if (
    (/aag|special_area|masjid|ceel|dugsi|xabaal|waqf|wakf/.test(lower) && !/plot/.test(lower)) &&
    polygons.length > 0
  ) {
    return 'special_area';
  }
  if (/waddo|wado|road|(?:^|[^a-z])jid(?:ka|adka|$|[^a-z])|street|highway|04_waddo/.test(lower)) {
    return 'roads';
  }
  if (
    (/plot|parcel|kood|half|qayb|03_plot/.test(lower) ||
      inferNamedCategoryFromFileName(fileName) !== null) &&
    !/block_only/.test(lower) &&
    polygons.length > 0
  ) {
    return 'plots';
  }
  if (/block|bulook|blk|02_block/.test(lower) && polygons.length > 0) {
    return 'blocks';
  }
  if (
    /dhibic|point|landmark|contour|elevation|tree|geed|gate|albaab|tuulo|magaalo/.test(lower) ||
    (polygons.length === 0 && lines.length === 0 && points.length > 0)
  ) {
    return 'extra_layer';
  }

  // 2. Inspect feature properties when filename is generic (e.g. export_12.geojson)
  if (polygons.length > 0) {
    const sampleProps = polygons[0].properties || {};
    const keysLower = Object.keys(sampleProps).map((k) => k.toLowerCase());
    if (
      keysLower.some((k) =>
        ['plot_id', 'plot_no', 'plotno', 'goostay', 'pct_gudaha', 'nooca', 'calaamad'].includes(k)
      )
    ) {
      return 'plots';
    }
    if (
      keysLower.some((k) => ['block_id', 'blk_id'].includes(k)) &&
      !keysLower.some((k) => k.includes('plot'))
    ) {
      return 'blocks';
    }
  }

  return null;
}

/**
 * WORKFLOW 2 STEP A: Inspect & classify 1, 2, 3, or 20+ simultaneous GeoJSON files!
 * 1) Case-insensitive filename & attribute recognition (allows multiple plot/block/wadi/road/special/extra files!)
 * 2) Geometry & metric area heuristics (single/largest polygon = boundary, intermediate = blocks, small/numerous = plots, lines = wadis/roads, points = extra_layer)
 * 3) Marks any remaining truly ambiguous files as `'unknown'` so UI displays `<select>` manual picker.
 */
export function inspectAndClassifyNashqadBeerFiles(
  rawFiles: { fileName: string; fileText: string }[]
): InspectNashqadFilesResult {
  if (!rawFiles || rawFiles.length === 0) {
    return {
      ok: false,
      errorSomali: 'Fadlan dooro ugu yaraan hal fayl oo GeoJSON ah.',
    };
  }

  const parsedEntries: {
    fileName: string;
    rawJson: unknown;
    polygons: ExtractedPolygonFeature[];
    lines: ExtractedLineFeature[];
    points: ExtractedPointFeature[];
  }[] = [];

  for (const rf of rawFiles) {
    const p = parseGeoJsonMultiGeometry(rf.fileText, rf.fileName);
    if (!p.ok) return p;

    const totalGeom = p.polygons.length + p.lines.length + p.points.length;
    if (totalGeom === 0 && rawFiles.length === 1) {
      return {
        ok: false,
        errorSomali: `Faylka "${rf.fileName}" lagama helin wax geometry GeoJSON sax ah.`,
      };
    }

    parsedEntries.push({
      fileName: rf.fileName,
      rawJson: p.rawJson,
      polygons: p.polygons,
      lines: p.lines,
      points: p.points,
    });
  }

  // Unify ALL uploaded files (even 20+ files!) into shared WGS84 + UTM reference frame
  const unifiedWgs = unifyMultiGeoJsonCollectionsToWgs84(parsedEntries);
  const allPts: Point2D[] = [];
  for (const u of unifiedWgs) {
    u.polygons.forEach((p) => p.ringRaw.forEach((pt) => allPts.push(pt)));
    u.lines.forEach((l) => l.coordsRaw.forEach((pt) => allPts.push(pt)));
    u.points.forEach((pt) => allPts.push(pt.coordRaw));
  }

  if (allPts.length === 0) {
    return {
      ok: false,
      errorSomali: 'Faylasha la doortay lagama helin wax coordinate GeoJSON sax ah.',
    };
  }

  const { fwd } = buildUtmProjectorsFromLonLat(allPts);

  const inspected: InspectedNashqadFile[] = parsedEntries.map((entry, idx) => {
    const u = unifiedWgs[idx];
    const polysWgs = u.polygons.slice();
    const linesWgs = u.lines.slice();
    const pointsWgs = u.points.slice();

    // If a file has no polygons but has a closed LineString (first == last, >= 4 pts), also treat as candidate polygon if needed
    if (polysWgs.length === 0 && linesWgs.length === 1 && linesWgs[0].coordsRaw.length >= 4) {
      const lc = linesWgs[0].coordsRaw;
      const dClose = Math.hypot(
        fwd(lc[0])[0] - fwd(lc[lc.length - 1])[0],
        fwd(lc[0])[1] - fwd(lc[lc.length - 1])[1]
      );
      if (dClose < 5) {
        const ring = stripClosingDuplicate(lc);
        if (ring.length >= 3) {
          polysWgs.push({ ringRaw: ring, properties: linesWgs[0].properties });
        }
      }
    }

    let sumArea = 0;
    let maxArea = 0;
    for (const poly of polysWgs) {
      const a = Math.abs(shoelaceArea(poly.ringRaw.map(fwd)));
      sumArea += a;
      if (a > maxArea) maxArea = a;
    }
    const avgArea = polysWgs.length > 0 ? sumArea / polysWgs.length : 0;
    const totalCount = u.polygons.length + u.lines.length + u.points.length;

    return {
      id: `file_${idx}_${entry.fileName}`,
      fileName: entry.fileName,
      rawJson: entry.rawJson,
      polygons: polysWgs,
      lines: linesWgs,
      points: pointsWgs,
      featureCount: Math.max(totalCount, polysWgs.length),
      rawAvgArea: avgArea,
      rawMaxArea: maxArea,
      detectedRole: totalCount === 0 && polysWgs.length === 0 ? 'ignore' : 'unknown',
      recognizedBy: 'filename',
    };
  });

  // Pass 1: Filename & attribute recognition (supports UNLIMITED files per role for 20+ file batches!)
  for (const item of inspected) {
    if (item.detectedRole === 'ignore') continue;
    const byNameOrProp = classifyRoleFromFileNameAndProps(
      item.fileName,
      item.polygons,
      item.lines,
      item.points
    );
    if (byNameOrProp) {
      item.detectedRole = byNameOrProp;
      item.recognizedBy = 'filename';
    }
  }

  const hasRole = (r: NashqadFileRole) => inspected.some((it) => it.detectedRole === r);

  // Pass 2: Geometry & metric-scale heuristics for files whose names were unclear
  const remaining = inspected.filter((it) => it.detectedRole === 'unknown');
  if (remaining.length > 0) {
    // 2a. Pure Line or Point files without explicit names
    for (const item of remaining) {
      if (item.polygons.length === 0 && item.lines.length > 0) {
        item.detectedRole = 'wadis';
        item.recognizedBy = 'geometry';
      } else if (item.polygons.length === 0 && item.points.length > 0) {
        item.detectedRole = 'extra_layer';
        item.recognizedBy = 'geometry';
      }
    }

    const polyRemaining = inspected.filter(
      (it) => it.detectedRole === 'unknown' && it.polygons.length > 0
    );

    // 2b. Boundary: single polygon OR largest outer polygon when boundary not yet assigned
    if (!hasRole('boundary') && polyRemaining.length > 0) {
      const singlePolyFiles = polyRemaining
        .filter((it) => it.polygons.length === 1)
        .sort((a, b) => b.rawMaxArea - a.rawMaxArea);

      if (
        (singlePolyFiles.length === 1 &&
          (polyRemaining.length >= 2 || singlePolyFiles[0].rawMaxArea > 12000)) ||
        (singlePolyFiles.length > 1 &&
          polyRemaining.length >= 2 &&
          singlePolyFiles[0].rawMaxArea > singlePolyFiles[1].rawMaxArea * 2.0)
      ) {
        singlePolyFiles[0].detectedRole = 'boundary';
        singlePolyFiles[0].recognizedBy = 'geometry';
      } else if (polyRemaining.length >= 2) {
        const byLargestArea = [...polyRemaining].sort((a, b) => b.rawAvgArea - a.rawAvgArea);
        if (byLargestArea[0].rawAvgArea > byLargestArea[1].rawAvgArea * 2.2) {
          byLargestArea[0].detectedRole = 'boundary';
          byLargestArea[0].recognizedBy = 'geometry';
        }
      }
    }

    // 2c. Re-check unassigned polygon files
    const stillUnassigned = inspected.filter(
      (it) => it.detectedRole === 'unknown' && it.polygons.length > 0
    );

    if (
      stillUnassigned.length === 2 &&
      !hasRole('blocks') &&
      !hasRole('plots') &&
      inspected.length <= 4
    ) {
      // Classic 2-or-3 generic file upload: fewer features / larger area = blocks; most features = plots
      const sorted = [...stillUnassigned].sort(
        (a, b) => a.featureCount - b.featureCount || b.rawAvgArea - a.rawAvgArea
      );
      if (
        sorted[1].featureCount > sorted[0].featureCount ||
        sorted[0].rawAvgArea > sorted[1].rawAvgArea * 1.4
      ) {
        sorted[0].detectedRole = 'blocks';
        sorted[0].recognizedBy = 'geometry';
        sorted[1].detectedRole = 'plots';
        sorted[1].recognizedBy = 'geometry';
      }
    } else if (stillUnassigned.length === 1 && inspected.length <= 3) {
      const only = stillUnassigned[0];
      if (!hasRole('plots') && hasRole('boundary') && hasRole('blocks')) {
        only.detectedRole = 'plots';
        only.recognizedBy = 'geometry';
      } else if (!hasRole('blocks') && hasRole('boundary') && hasRole('plots')) {
        only.detectedRole = 'blocks';
        only.recognizedBy = 'geometry';
      } else if (!hasRole('boundary') && hasRole('blocks') && hasRole('plots')) {
        only.detectedRole = 'boundary';
        only.recognizedBy = 'geometry';
      } else if (!hasRole('plots') && only.featureCount >= 20 && only.rawAvgArea < 2500) {
        only.detectedRole = 'plots';
        only.recognizedBy = 'geometry';
      } else if (
        !hasRole('blocks') &&
        !hasRole('plots') &&
        hasRole('boundary') &&
        only.polygons.length >= 1 &&
        only.polygons.length <= 5 &&
        only.rawAvgArea >= 400
      ) {
        only.detectedRole = 'blocks';
        only.recognizedBy = 'geometry';
      }
    } else if (stillUnassigned.length > 0 && inspected.length >= 4) {
      // Multi-file (4 to 50+ GeoJSON files!) metric area classification so 20+ file batches auto-classify seamlessly
      for (const item of stillUnassigned) {
        if (item.rawAvgArea >= 35 && item.rawAvgArea <= 1400) {
          item.detectedRole = 'plots';
          item.recognizedBy = 'geometry';
        } else if (item.rawAvgArea > 1400 && item.rawAvgArea <= 30000) {
          item.detectedRole = 'blocks';
          item.recognizedBy = 'geometry';
        } else if (!hasRole('boundary') && item.rawMaxArea > 30000) {
          item.detectedRole = 'boundary';
          item.recognizedBy = 'geometry';
        } else {
          item.detectedRole = 'extra_layer';
          item.recognizedBy = 'geometry';
        }
      }
    }
  }

  const needsManualSelection = inspected.some((it) => it.detectedRole === 'unknown');
  return {
    ok: true,
    files: inspected,
    needsManualSelection,
  };
}

function detectExplicitPlotNooca(props: Record<string, unknown>): 'dhammaystiran' | 'half' | null {
  const noocaVal =
    props.nooca ??
    props.Nooca ??
    props.NOOCA ??
    props.type ??
    props.Type ??
    props.TYPE ??
    props.status ??
    props.Status;

  if (noocaVal !== undefined && noocaVal !== null && String(noocaVal).trim() !== '') {
    const s = String(noocaVal).trim().toLowerCase();
    if (
      s === 'half' ||
      s.includes('half') ||
      s.includes('qayb') ||
      s.includes('partial') ||
      s.includes("go'an")
    ) {
      return 'half';
    }
    if (
      s === 'dhammaystiran' ||
      s === 'dhamaystiran' ||
      s === 'buuxa' ||
      s === 'full' ||
      s === 'complete'
    ) {
      return 'dhammaystiran';
    }
  }

  const halfFlag = props.half ?? props.Half ?? props.is_half ?? props.goostay ?? props.Goostay;
  if (halfFlag !== undefined && halfFlag !== null && String(halfFlag).trim() !== '') {
    const hs = String(halfFlag).trim().toLowerCase();
    if (
      halfFlag === true ||
      Number(halfFlag) === 1 ||
      hs === 'true' ||
      hs === 'yes' ||
      hs === 'haa'
    ) {
      return 'half';
    }
    if (
      halfFlag === false ||
      Number(halfFlag) === 0 ||
      hs === 'false' ||
      hs === 'no' ||
      hs === 'maya'
    ) {
      return 'dhammaystiran';
    }
  }

  return null;
}

/**
 * WORKFLOW 2 STEP B: Builds unified `LandSubdivisionState` & report summary from 1 to 20+ classified files.
 * Merges boundary, blocks, plots, wadis/streams, roads, special areas, and extra GIS overlay layers cleanly.
 * Gracefully handles missing core layers (e.g., `"blocks.geojson lama helin"`).
 */
export function buildNashqadBeerState(
  inspectedFiles: InspectedNashqadFile[],
  previousState?: LandSubdivisionState
): BuildNashqadBeerResult {
  const activeFiles = inspectedFiles.filter(
    (f) => f.detectedRole !== 'ignore' && f.detectedRole !== 'unknown'
  );

  if (activeFiles.length === 0) {
    return {
      ok: false,
      errorSomali: 'Fadlan u dooro ugu yaraan hal fayl noociisa (Xuduudka, Blocks, ama Plots).',
    };
  }

  const boundaryFiles = activeFiles.filter((f) => f.detectedRole === 'boundary');
  const blocksFiles = activeFiles.filter((f) => f.detectedRole === 'blocks');
  const plotsFiles = activeFiles.filter((f) => f.detectedRole === 'plots');
  const wadisFiles = activeFiles.filter((f) => f.detectedRole === 'wadis');
  const roadsFiles = activeFiles.filter((f) => f.detectedRole === 'roads');
  const specialAreaFiles = activeFiles.filter((f) => f.detectedRole === 'special_area');
  const extraLayerFiles = activeFiles.filter((f) => f.detectedRole === 'extra_layer');

  // AUTOMATIC SUBDIVISION WHEN ONLY BOUNDARY + SAMPLE BLOCK GEOJSON ARE UPLOADED (NO PLOTS FILE NEEDED!)
  const hasBoundaryPlusSampleBlockPair =
    plotsFiles.length === 0 &&
    boundaryFiles.length >= 1 &&
    ((blocksFiles.length === 1 &&
      blocksFiles[0].polygons.length >= 1 &&
      blocksFiles[0].polygons.length <= 2) ||
      (blocksFiles.length === 0 && boundaryFiles[0].polygons.length >= 2));

  if (hasBoundaryPlusSampleBlockPair) {
    const toWgsFeatureCollectionText = (polys: ExtractedPolygonFeature[]): string =>
      JSON.stringify({
        type: 'FeatureCollection',
        features: polys.map((p) => {
          const closedRing =
            p.ringRaw.length >= 3 ? [...p.ringRaw, p.ringRaw[0]] : p.ringRaw;
          return {
            type: 'Feature',
            properties: p.properties || {},
            geometry: {
              type: 'Polygon',
              coordinates: [closedRing],
            },
          };
        }),
      });

    const bndFile = boundaryFiles[0];
    const smpFile = blocksFiles.length === 1 ? blocksFiles[0] : null;
    const autoSamee = runSameeNashqadWorkflow({
      boundaryFileName: bndFile.fileName,
      boundaryFileText: toWgsFeatureCollectionText(bndFile.polygons),
      sampleBlockMode: 'file',
      sampleBlockFileName: smpFile?.fileName,
      sampleBlockFileText: smpFile ? toWgsFeatureCollectionText(smpFile.polygons) : undefined,
      previousState,
    });

    if (autoSamee.ok) {
      // Preserve any accompanying wadis, roads, special areas, or extra overlay layers uploaded alongside!
      const wadiItems: ParsedGeoItem[] = [];
      const wadiLinesLonLat: NonNullable<PrebuiltGeoJsonSubdivision['wadiLinesLonLat']> = [];
      wadisFiles.forEach((wf) => {
        const baseName = wf.fileName.replace(/\.(geo)?json$|\.(kml|kmz)$/i, '') || 'Dooxa';
        wf.lines.forEach((ln, idx) => {
          const label = String(ln.properties?.name ?? ln.properties?.Name ?? `${baseName} ${idx + 1}`);
          wadiItems.push({ name: label, type: 'Line', coords: ln.coordsRaw, rawProperties: ln.properties });
          wadiLinesLonLat.push({ name: label, coords: ln.coordsRaw, rawProperties: ln.properties });
        });
        wf.polygons.forEach((poly, idx) => {
          const label = String(poly.properties?.name ?? poly.properties?.Name ?? `${baseName} ${idx + 1}`);
          wadiItems.push({ name: label, type: 'Polygon', coords: poly.ringRaw, rawProperties: poly.properties });
          wadiLinesLonLat.push({
            name: label,
            coords: [...poly.ringRaw, poly.ringRaw[0]],
            rawProperties: poly.properties,
          });
        });
      });

      const roadItems: ParsedGeoItem[] = [];
      roadsFiles.forEach((rf) => {
        const baseName = rf.fileName.replace(/\.(geo)?json$|\.(kml|kmz)$/i, '') || 'Waddo';
        rf.lines.forEach((ln, idx) => {
          roadItems.push({
            name: String(ln.properties?.name ?? ln.properties?.Name ?? `${baseName} ${idx + 1}`),
            type: 'Line',
            coords: ln.coordsRaw,
            rawProperties: ln.properties,
          });
        });
        rf.polygons.forEach((poly, idx) => {
          roadItems.push({
            name: String(poly.properties?.name ?? poly.properties?.Name ?? `${baseName} ${idx + 1}`),
            type: 'Polygon',
            coords: poly.ringRaw,
            rawProperties: poly.properties,
          });
        });
      });

      const specialAreaItems: ParsedGeoItem[] = [];
      specialAreaFiles.forEach((sf) => {
        const baseName = sf.fileName.replace(/\.(geo)?json$|\.(kml|kmz)$/i, '') || 'Aag Gaar Ah';
        sf.polygons.forEach((poly, idx) => {
          specialAreaItems.push({
            name: String(
              poly.properties?.name ??
                poly.properties?.Name ??
                poly.properties?.magaca ??
                (sf.polygons.length === 1 ? baseName : `${baseName} ${idx + 1}`)
            ),
            type: 'Polygon',
            coords: poly.ringRaw,
            rawProperties: poly.properties,
          });
        });
      });

      const extraOverlayLayers: ExtraGeoJsonOverlayLayer[] = extraLayerFiles.map((ef, idx) => {
        const cleanTitle = ef.fileName.replace(/\.(geo)?json$|\.(kml|kmz)$/i, '') || `Lakab ${idx + 1}`;
        const getFeatLabel = (props: Record<string, unknown>) => {
          const v = props.name ?? props.Name ?? props.magaca ?? props.label ?? props.id ?? props.ID;
          return v !== undefined && v !== null && String(v).trim() !== ''
            ? `${cleanTitle}: ${String(v).trim()}`
            : cleanTitle;
        };
        return {
          id: ef.id,
          name: cleanTitle,
          colorHex: EXTRA_LAYER_PALETTE[idx % EXTRA_LAYER_PALETTE.length],
          featureCount: ef.featureCount,
          polygonsLonLat: ef.polygons.map((p) => ({ ring: p.ringRaw, label: getFeatLabel(p.properties) })),
          linesLonLat: ef.lines.map((l) => ({ coords: l.coordsRaw, label: getFeatLabel(l.properties) })),
          pointsLonLat: ef.points.map((pt) => ({ coord: pt.coordRaw, label: getFeatLabel(pt.properties) })),
        };
      });

      const allRecognized: NashqadFileRecognitionItem[] = activeFiles.map((f) => ({
        fileName: f.fileName,
        role: f.detectedRole as NashqadFileRecognitionItem['role'],
        featureCount: f.featureCount,
        recognizedBy: f.recognizedBy,
      }));

      const mergedSummary: NashqadWorkflowSummary = {
        ...autoSamee.summary,
        recognizedFiles: allRecognized,
        missingFileMessages: [],
      };

      const mergedNextState: LandSubdivisionState = {
        ...autoSamee.nextState,
        specialAreaItems:
          specialAreaItems.length > 0 ? specialAreaItems : autoSamee.nextState.specialAreaItems,
        specialAreaFileName:
          specialAreaFiles.length > 0
            ? specialAreaFiles.map((f) => f.fileName).join(', ')
            : autoSamee.nextState.specialAreaFileName,
        wadiItems: wadiItems.length > 0 ? wadiItems : autoSamee.nextState.wadiItems,
        wadiFileName:
          wadisFiles.length > 0
            ? wadisFiles.map((f) => f.fileName).join(', ')
            : autoSamee.nextState.wadiFileName,
        roadItems: roadItems.length > 0 ? roadItems : autoSamee.nextState.roadItems,
        roadFileName:
          roadsFiles.length > 0
            ? roadsFiles.map((f) => f.fileName).join(', ')
            : autoSamee.nextState.roadFileName,
        extraOverlayLayers:
          extraOverlayLayers.length > 0
            ? extraOverlayLayers
            : autoSamee.nextState.extraOverlayLayers,
        prebuiltSubdivision: autoSamee.nextState.prebuiltSubdivision
          ? {
              ...autoSamee.nextState.prebuiltSubdivision,
              wadiLinesLonLat:
                wadiLinesLonLat.length > 0
                  ? wadiLinesLonLat
                  : autoSamee.nextState.prebuiltSubdivision.wadiLinesLonLat,
            }
          : autoSamee.nextState.prebuiltSubdivision,
        nashqadSummary: mergedSummary,
      };

      return { ok: true, nextState: mergedNextState, summary: mergedSummary };
    }
  }

  const missingFileMessages: string[] = [];
  if (boundaryFiles.length === 0) missingFileMessages.push('xuduudaha.geojson lama helin');
  if (blocksFiles.length === 0) missingFileMessages.push('blocks.geojson lama helin');
  if (plotsFiles.length === 0) missingFileMessages.push('plots.geojson lama helin');

  // Collect all WGS84 coordinates across ALL active files for shared UTM projection
  const allPtsLonLat: Point2D[] = [];
  for (const f of activeFiles) {
    f.polygons.forEach((p) => p.ringRaw.forEach((pt) => allPtsLonLat.push(pt)));
    f.lines.forEach((l) => l.coordsRaw.forEach((pt) => allPtsLonLat.push(pt)));
    f.points.forEach((pt) => allPtsLonLat.push(pt.coordRaw));
  }

  if (allPtsLonLat.length < 3) {
    return {
      ok: false,
      errorSomali: 'Xogta coordinate-ka ee faylashu kuma filna samaynta khariidad.',
    };
  }

  const { fwd, epsg } = buildUtmProjectorsFromLonLat(allPtsLonLat);

  // 1. Boundary Ring
  let boundaryRingLonLat: Point2D[] | null = null;
  let boundaryAreaSqM = 0;

  if (boundaryFiles.length > 0) {
    let bestRing: Point2D[] | null = null;
    let bestArea = 0;
    for (const bf of boundaryFiles) {
      for (const poly of bf.polygons) {
        const a = Math.abs(shoelaceArea(poly.ringRaw.map(fwd)));
        if (a > bestArea) {
          bestArea = a;
          bestRing = poly.ringRaw;
        }
      }
      if (!bestRing && bf.lines.length > 0) {
        for (const ln of bf.lines) {
          const ring = stripClosingDuplicate(ln.coordsRaw);
          if (ring.length >= 3) {
            const a = Math.abs(shoelaceArea(ring.map(fwd)));
            if (a > bestArea) {
              bestArea = a;
              bestRing = ring;
            }
          }
        }
      }
    }
    if (bestRing && bestRing.length >= 3) {
      boundaryRingLonLat = bestRing;
      boundaryAreaSqM = +bestArea.toFixed(2);
    }
  }

  if (!boundaryRingLonLat) {
    const hullWgs = convexHull(allPtsLonLat);
    boundaryRingLonLat = hullWgs;
    boundaryAreaSqM = +Math.abs(shoelaceArea(hullWgs.map(fwd))).toFixed(2);
  }

  // 2. Blocks Layer (merged across 1 or multiple block GeoJSON files, deduplicating identical centroids)
  const prebuiltBlocks: PrebuiltGeoJsonSubdivision['blocks'] = [];
  const blockUtmRingsForLookup: { id: string; ringUtm: Point2D[]; centerUtm: Point2D }[] = [];

  blocksFiles.forEach((bf) => {
    bf.polygons.forEach((poly) => {
      const ringUtm = poly.ringRaw.map(fwd);
      if (ringUtm.length < 3) return;
      const cx = ringUtm.reduce((s, q) => s + q[0], 0) / ringUtm.length;
      const cy = ringUtm.reduce((s, q) => s + q[1], 0) / ringUtm.length;

      const dup = blockUtmRingsForLookup.find(
        (b) => Math.hypot(b.centerUtm[0] - cx, b.centerUtm[1] - cy) < 0.5
      );
      if (dup) return;

      const p = poly.properties || {};
      const rawId =
        p.block ?? p.Block ?? p.BLOCK ?? p.block_id ?? p.name ?? p.Name ?? p.id ?? p.ID;
      let blockId =
        rawId !== undefined && rawId !== null && String(rawId).trim() !== ''
          ? String(rawId).trim()
          : `R${String(prebuiltBlocks.length + 1).padStart(2, '0')}`;

      if (prebuiltBlocks.some((b) => b.id === blockId)) {
        blockId = `${blockId}_${prebuiltBlocks.length + 1}`;
      }

      prebuiltBlocks.push({
        id: blockId,
        R: prebuiltBlocks.length + 1,
        C: 1,
        ringLonLat: poly.ringRaw,
        rawProperties: {
          ...p,
          block: blockId,
        },
      });
      blockUtmRingsForLookup.push({
        id: blockId,
        ringUtm,
        centerUtm: [cx, cy],
      });
    });
  });

  // 3. Plots Layer (merged across 1 to 20+ plot/category/half-plot files!)
  const rawPlotRecords: {
    ringLonLat: Point2D[];
    ringUtm: Point2D[];
    centerUtm: Point2D;
    areaSqM: number;
    props: Record<string, unknown>;
    explicitNooca: 'dhammaystiran' | 'half' | null;
  }[] = [];

  plotsFiles.forEach((pf) => {
    const fileCategory = inferNamedCategoryFromFileName(pf.fileName);
    const isFileExplicitHalf = /half|qayb[_ -]?go|partial/i.test(pf.fileName);

    pf.polygons.forEach((poly) => {
      const ringUtm = poly.ringRaw.map(fwd);
      const areaSqM = +Math.abs(shoelaceArea(ringUtm)).toFixed(2);
      if (areaSqM < 0.2) return;
      const cx = ringUtm.reduce((s, q) => s + q[0], 0) / (ringUtm.length || 1);
      const cy = ringUtm.reduce((s, q) => s + q[1], 0) / (ringUtm.length || 1);

      const enrichedProps: Record<string, unknown> = { ...(poly.properties || {}) };
      if (fileCategory && !enrichedProps.calaamad && !enrichedProps.Calaamad) {
        enrichedProps.calaamad = fileCategory;
      }
      if (isFileExplicitHalf && !enrichedProps.nooca) {
        enrichedProps.nooca = 'half';
      }

      const explicitNooca = detectExplicitPlotNooca(enrichedProps);

      // If this exact same physical plot already came in from a master plots.geojson file,
      // merge enriched attributes (e.g. calaamad / nooca) instead of double-counting it!
      const coLocated = rawPlotRecords.find(
        (existing) =>
          Math.hypot(existing.centerUtm[0] - cx, existing.centerUtm[1] - cy) < 0.35 &&
          Math.abs(existing.areaSqM - areaSqM) < 2.0
      );
      if (coLocated) {
        coLocated.props = { ...coLocated.props, ...enrichedProps };
        if (explicitNooca) {
          coLocated.explicitNooca = explicitNooca;
        }
        return;
      }

      rawPlotRecords.push({
        ringLonLat: poly.ringRaw,
        ringUtm,
        centerUtm: [cx, cy],
        areaSqM,
        props: enrichedProps,
        explicitNooca,
      });
    });
  });

  // Compute standard (typical full) plot area using 75th percentile of plot areas
  let standardPlotAreaSqM = 500;
  if (rawPlotRecords.length > 0) {
    const sortedAreas = rawPlotRecords.map((r) => r.areaSqM).sort((a, b) => a - b);
    const p75Idx = Math.min(sortedAreas.length - 1, Math.floor(sortedAreas.length * 0.75));
    standardPlotAreaSqM = +sortedAreas[p75Idx].toFixed(2);
  }

  const pointInRing = (pt: Point2D, ring: Point2D[]): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0],
        yi = ring[i][1];
      const xj = ring[j][0],
        yj = ring[j][1];
      const intersect =
        yi > pt[1] !== yj > pt[1] &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi || 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  let fullPlotsCount = 0;
  let halfPlotsCount = 0;
  let totalPlotsAreaSqM = 0;
  const usedPlotIds = new Set<string>();

  const prebuiltPlots: PrebuiltGeoJsonSubdivision['plots'] = rawPlotRecords.map((rec, idx) => {
    const seqNo = idx + 1;
    const nooca: 'dhammaystiran' | 'half' =
      rec.explicitNooca ??
      (rec.areaSqM < standardPlotAreaSqM * 0.9 ? 'half' : 'dhammaystiran');

    if (nooca === 'dhammaystiran') {
      fullPlotsCount += 1;
    } else {
      halfPlotsCount += 1;
    }
    totalPlotsAreaSqM += rec.areaSqM;

    const propBlk =
      rec.props.block ??
      rec.props.Block ??
      rec.props.BLOCK ??
      rec.props.block_id ??
      rec.props.Block_ID;

    let blockId =
      propBlk !== undefined && propBlk !== null && String(propBlk).trim() !== ''
        ? String(propBlk).trim()
        : '';

    if (!blockId && blockUtmRingsForLookup.length > 0) {
      const containing = blockUtmRingsForLookup.find((b) =>
        pointInRing(rec.centerUtm, b.ringUtm)
      );
      if (containing) {
        blockId = containing.id;
      } else {
        let bestDist = Infinity;
        let bestId = blockUtmRingsForLookup[0].id;
        for (const b of blockUtmRingsForLookup) {
          const d = Math.hypot(
            rec.centerUtm[0] - b.centerUtm[0],
            rec.centerUtm[1] - b.centerUtm[1]
          );
          if (d < bestDist) {
            bestDist = d;
            bestId = b.id;
          }
        }
        blockId = bestId;
      }
    }

    if (!blockId) {
      blockId = 'R01';
    }

    const propPlotId =
      rec.props.plot_id ??
      rec.props.Plot_ID ??
      rec.props.id ??
      rec.props.ID ??
      rec.props.plot_no ??
      rec.props.Plot_No ??
      rec.props.name ??
      rec.props.Name;

    let plotId =
      propPlotId !== undefined && propPlotId !== null && String(propPlotId).trim() !== ''
        ? String(propPlotId).trim()
        : `${blockId}-P${String(seqNo).padStart(3, '0')}`;

    if (usedPlotIds.has(plotId)) {
      plotId = `${blockId}-P${String(seqNo).padStart(3, '0')}`;
    }
    usedPlotIds.add(plotId);

    const pctInside =
      standardPlotAreaSqM > 0
        ? Math.min(100, +((rec.areaSqM / standardPlotAreaSqM) * 100).toFixed(1))
        : nooca === 'dhammaystiran'
        ? 100
        : 50;

    return {
      id: plotId,
      blockId,
      no: seqNo,
      ringLonLat: rec.ringLonLat,
      rawProperties: {
        ...rec.props,
        plot_no: seqNo,
        block: blockId,
        nooca,
        area_m2: rec.areaSqM,
        goostay: nooca === 'half' ? 1 : 0,
        pct_gudaha: nooca === 'dhammaystiran' ? 100 : pctInside,
      },
    };
  });

  // 4. Wadis / Dooxyada Layer
  const wadiItems: ParsedGeoItem[] = [];
  const wadiLinesLonLat: NonNullable<PrebuiltGeoJsonSubdivision['wadiLinesLonLat']> = [];
  wadisFiles.forEach((wf) => {
    const baseName = wf.fileName.replace(/\.(geo)?json$|\.(kml|kmz)$/i, '') || 'Dooxa';
    wf.lines.forEach((ln, idx) => {
      const label = String(ln.properties?.name ?? ln.properties?.Name ?? `${baseName} ${idx + 1}`);
      wadiItems.push({
        name: label,
        type: 'Line',
        coords: ln.coordsRaw,
        rawProperties: ln.properties,
      });
      wadiLinesLonLat.push({
        name: label,
        coords: ln.coordsRaw,
        rawProperties: ln.properties,
      });
    });
    wf.polygons.forEach((poly, idx) => {
      const label = String(
        poly.properties?.name ?? poly.properties?.Name ?? `${baseName} ${idx + 1}`
      );
      wadiItems.push({
        name: label,
        type: 'Polygon',
        coords: poly.ringRaw,
        rawProperties: poly.properties,
      });
      wadiLinesLonLat.push({
        name: label,
        coords: [...poly.ringRaw, poly.ringRaw[0]],
        rawProperties: poly.properties,
      });
    });
  });

  // 5. Roads / Waddooyinka Layer
  const roadItems: ParsedGeoItem[] = [];
  roadsFiles.forEach((rf) => {
    const baseName = rf.fileName.replace(/\.(geo)?json$|\.(kml|kmz)$/i, '') || 'Waddo';
    rf.lines.forEach((ln, idx) => {
      roadItems.push({
        name: String(ln.properties?.name ?? ln.properties?.Name ?? `${baseName} ${idx + 1}`),
        type: 'Line',
        coords: ln.coordsRaw,
        rawProperties: ln.properties,
      });
    });
    rf.polygons.forEach((poly, idx) => {
      roadItems.push({
        name: String(poly.properties?.name ?? poly.properties?.Name ?? `${baseName} ${idx + 1}`),
        type: 'Polygon',
        coords: poly.ringRaw,
        rawProperties: poly.properties,
      });
    });
  });

  // 6. Special Areas (`Aag gaar ah`) Layer
  const specialAreaItems: ParsedGeoItem[] = [];
  specialAreaFiles.forEach((sf) => {
    const baseName = sf.fileName.replace(/\.(geo)?json$|\.(kml|kmz)$/i, '') || 'Aag Gaar Ah';
    sf.polygons.forEach((poly, idx) => {
      specialAreaItems.push({
        name: String(
          poly.properties?.name ??
            poly.properties?.Name ??
            poly.properties?.magaca ??
            (sf.polygons.length === 1 ? baseName : `${baseName} ${idx + 1}`)
        ),
        type: 'Polygon',
        coords: poly.ringRaw,
        rawProperties: poly.properties,
      });
    });
  });

  // 7. Extra GIS Overlay Layers (Points, Contours, Infrastructure, Additional Polygons in 20+ file batches)
  const extraOverlayLayers: ExtraGeoJsonOverlayLayer[] = extraLayerFiles.map((ef, idx) => {
    const cleanTitle = ef.fileName.replace(/\.(geo)?json$|\.(kml|kmz)$/i, '') || `Lakab ${idx + 1}`;
    const getFeatLabel = (props: Record<string, unknown>) => {
      const v = props.name ?? props.Name ?? props.magaca ?? props.label ?? props.id ?? props.ID;
      return v !== undefined && v !== null && String(v).trim() !== ''
        ? `${cleanTitle}: ${String(v).trim()}`
        : cleanTitle;
    };
    return {
      id: ef.id,
      name: cleanTitle,
      colorHex: EXTRA_LAYER_PALETTE[idx % EXTRA_LAYER_PALETTE.length],
      featureCount: ef.featureCount,
      polygonsLonLat: ef.polygons.map((p) => ({
        ring: p.ringRaw,
        label: getFeatLabel(p.properties),
      })),
      linesLonLat: ef.lines.map((l) => ({
        coords: l.coordsRaw,
        label: getFeatLabel(l.properties),
      })),
      pointsLonLat: ef.points.map((pt) => ({
        coord: pt.coordRaw,
        label: getFeatLabel(pt.properties),
      })),
    };
  });

  totalPlotsAreaSqM = +totalPlotsAreaSqM.toFixed(2);

  const recognizedFiles: NashqadFileRecognitionItem[] = activeFiles.map((f) => ({
    fileName: f.fileName,
    role: f.detectedRole as NashqadFileRecognitionItem['role'],
    featureCount: f.featureCount,
    recognizedBy: f.recognizedBy,
  }));

  const summary: NashqadWorkflowSummary = {
    mode: 'soo_geli_nashqad',
    createdAt: new Date().toISOString(),
    recognizedFiles,
    missingFileMessages,
    blocksCount: prebuiltBlocks.length,
    fullPlotsCount,
    halfPlotsCount,
    totalPlotsAreaSqM,
    boundaryAreaSqM,
    standardPlotAreaSqM,
  };

  const base = createEmptyLandSubdivisionState();
  const boundaryItems: ParsedGeoItem[] =
    boundaryFiles.length > 0 && boundaryRingLonLat
      ? [
          {
            name: boundaryFiles[0].fileName.replace(/\.(geo)?json$|\.(kml|kmz)$/i, '') || 'Xuduudka Beerta',
            type: 'Polygon',
            coords: boundaryRingLonLat,
          },
        ]
      : [];

  const sourceLabel =
    activeFiles.length <= 4
      ? activeFiles.map((f) => f.fileName).join(', ')
      : `${activeFiles.length} fayl oo GeoJSON ah (${activeFiles[0].fileName} + ${activeFiles.length - 1} kale)`;
  const sideEst = Math.max(10, Math.round(Math.sqrt(standardPlotAreaSqM)));

  const nextState: LandSubdivisionState = {
    ...base,
    boundaryItems,
    boundaryFileName:
      boundaryFiles.length > 0 ? boundaryFiles[0].fileName : 'xuduudaha.geojson lama helin',
    selectedBoundaryIndex: boundaryItems.length > 0 ? 0 : -1,
    specialAreaItems,
    specialAreaFileName:
      specialAreaFiles.length > 0
        ? specialAreaFiles.map((f) => f.fileName).join(', ')
        : base.specialAreaFileName,
    wadiItems,
    wadiFileName: wadisFiles.map((f) => f.fileName).join(', '),
    roadItems,
    roadFileName: roadsFiles.map((f) => f.fileName).join(', '),
    extraOverlayLayers,
    params: {
      ...(previousState?.params || DEFAULT_SUBDIVISION_PARAMS),
      pw: sideEst,
      pd: Math.max(10, Math.round(standardPlotAreaSqM / sideEst)),
    },
    prebuiltSubdivision: {
      sourceFileName: sourceLabel,
      detectedCrs: `EPSG:${epsg}`,
      boundaryRingLonLat: boundaryFiles.length > 0 ? boundaryRingLonLat : null,
      wadiLinesLonLat: wadiLinesLonLat.length > 0 ? wadiLinesLonLat : undefined,
      blocks: prebuiltBlocks,
      plots: prebuiltPlots,
      validationWarnings: missingFileMessages,
    },
    nashqadSummary: summary,
    auditHistory: [
      createAuditEntry(
        'geojson_import',
        `Nashqad beer waa la soo geliyey (${activeFiles.length} fayl): ${prebuiltBlocks.length} Block, ${fullPlotsCount} Plot dhammaystiran, ${halfPlotsCount} Half plot.`
      ),
      ...(previousState?.auditHistory || []).slice(0, 49),
    ],
  };

  return { ok: true, nextState, summary };
}

/**
 * Generates clean GeoJSON text for clipboard copy fallback (when artifact file downloads are restricted).
 */
export function buildPlotsGeoJsonClipboardText(
  state: LandSubdivisionState,
  subdivisionResult?: SubdivisionComputationResult | null
): string {
  const prebuilt = state.prebuiltSubdivision;
  if (prebuilt) {
    const features: unknown[] = [];

    if (prebuilt.boundaryRingLonLat && prebuilt.boundaryRingLonLat.length >= 3) {
      const ring = [...prebuilt.boundaryRingLonLat, prebuilt.boundaryRingLonLat[0]];
      features.push({
        type: 'Feature',
        properties: { lakabka: 'xuduud', magaca: state.boundaryFileName || 'Xuduudka Beerta' },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    }

    for (const blk of prebuilt.blocks) {
      if (blk.ringLonLat.length < 3 || blk.rawProperties?.syntheticBlock === true) continue;
      const ring = [...blk.ringLonLat, blk.ringLonLat[0]];
      features.push({
        type: 'Feature',
        properties: { lakabka: 'block', block: blk.id, ...blk.rawProperties },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    }

    for (const pl of prebuilt.plots) {
      if (pl.ringLonLat.length < 3) continue;
      const ring = [...pl.ringLonLat, pl.ringLonLat[0]];
      features.push({
        type: 'Feature',
        properties: {
          lakabka: 'plot',
          id: pl.id,
          block: pl.blockId,
          plot_no: pl.no,
          ...pl.rawProperties,
        },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    }

    for (const wl of prebuilt.wadiLinesLonLat || []) {
      if (wl.coords.length < 2) continue;
      features.push({
        type: 'Feature',
        properties: { lakabka: 'doox', magaca: wl.name },
        geometry: { type: 'LineString', coordinates: wl.coords },
      });
    }

    return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
  }

  if (subdivisionResult) {
    const features: unknown[] = [];
    if (subdivisionResult.bring && subdivisionResult.bring.length >= 3) {
      const bLonLat = subdivisionResult.bring.map((pt: Point2D) => subdivisionResult.inv(pt));
      bLonLat.push(bLonLat[0]);
      features.push({
        type: 'Feature',
        properties: { lakabka: 'xuduud', magaca: state.boundaryFileName || 'Xuduudka Beerta' },
        geometry: { type: 'Polygon', coordinates: [bLonLat] },
      });
    }
    for (const blk of subdivisionResult.blocks) {
      if (blk.rect.length < 3) continue;
      const rLonLat = blk.rect.map((pt: Point2D) => subdivisionResult.inv(pt));
      rLonLat.push(rLonLat[0]);
      features.push({
        type: 'Feature',
        properties: { lakabka: 'block', block: blk.id },
        geometry: { type: 'Polygon', coordinates: [rLonLat] },
      });
    }
    const evalPlots =
      subdivisionResult.allEvaluatedPlots && subdivisionResult.allEvaluatedPlots.length > 0
        ? subdivisionResult.allEvaluatedPlots.filter(
            (p) =>
              p.full ||
              (p.halfPlotValidation?.insideRingsUtm &&
                p.halfPlotValidation.insideRingsUtm.length > 0 &&
                p.halfPlotValidation.insideRingsUtm[0].length >= 3)
          )
        : subdivisionResult.plots;
    for (const pl of evalPlots) {
      const insideClipped = pl.halfPlotValidation?.insideRingsUtm?.[0];
      const utmRing =
        !pl.full && insideClipped && insideClipped.length >= 3 ? insideClipped : pl.rect;
      if (utmRing.length < 3) continue;
      const pLonLat = utmRing.map((pt: Point2D) => subdivisionResult.inv(pt));
      pLonLat.push(pLonLat[0]);
      features.push({
        type: 'Feature',
        properties: {
          lakabka: 'plot',
          id: pl.id,
          block: pl.block,
          plot_no: pl.no,
          nooca: pl.full ? 'dhammaystiran' : 'half',
          area_m2:
            pl.calculatedAreaSqM ??
            +(subdivisionResult.params.pw * subdivisionResult.params.pd).toFixed(2),
        },
        geometry: { type: 'Polygon', coordinates: [pLonLat] },
      });
    }
    return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
  }

  return '';
}

/**
 * Copies text safely to clipboard with textarea fallback for sandboxed iframes.
 */
export async function copyTextSafelyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
