import proj4 from 'proj4';
import JSZip from 'jszip';
import {
  AssetQualityTier,
  EstateAssetItem,
  HeirsInput,
  InheritanceCalculationResult,
} from '../types/inheritance';
import {
  AllocationApprovalStatus,
  BlockDetailedMetadata,
  CaseExportMetadata,
  ComputedSpecialAreaSummary,
  ExcludedBlockSummary,
  ExcludedPlotSummary,
  FairLandAllocationResult,
  GeneratedBlock,
  GeneratedPlot,
  HeirTierPlotBreakdown,
  HeirZonePlotBreakdown,
  HtmlHalfPlotRecord,
  IndividualHeirPlotAllocation,
  LandAllocationMode,
  LandSubdivisionState,
  MetadataConflictItem,
  ParsedGeoItem,
  PendingBulkMetadataImport,
  PlotAssignmentRecord,
  PlotDetailedMetadata,
  Point2D,
  PrebuiltGeoJsonSubdivision,
  SampleBlockCandidate,
  SharedPlotCoOwner,
  SiteQualityRating,
  SubdivisionAuditEntry,
  SubdivisionComputationResult,
  SubdivisionParams,
  TierPricingConfig,
  WadiStatus,
  ZoneOverviewSummary,
  ZonePresetMode,
} from '../types/landSubdivision';
import { SAMPLE_FARM_GEOJSON } from './sampleGeojson';
import { calculateComprehensiveEstateDistribution } from './estateAssetDistributionEngine';
import {
  evaluateBlocksAndHalfPlots,
  intersectPolygonWithTriangulatedBoundary,
  signedRingArea,
  triangulateSimplePolygonCCW,
  validateAndNormalizePolygonUtm,
} from './halfPlotGeometryEngine';
import {
  ClassifiedFarmGeoJsonLayers,
  classifyFarmGeoJsonSources,
  normalizeGeoJsonCrsToWgs84,
} from './pdfCartographyEngine';


/* ==================== METADATA CONSTANTS ==================== */

export const TIER_METADATA: Record<
  AssetQualityTier,
  {
    code: 'H1' | 'H2' | 'H3';
    shortSomali: string;
    fullSomali: string;
    fillHex: string;
    strokeHex: string;
    softHex: string;
  }
> = {
  tier_1_prime: {
    code: 'H1',
    shortSomali: 'Heerka 1aad (Meel Fiican)',
    fullSomali: 'Heerka 1aad — Meel Fiican / Laamiga (Prime)',
    fillHex: '#0d9488',
    strokeHex: '#0f766e',
    softHex: '#ccfbf1',
  },
  tier_2_standard: {
    code: 'H2',
    shortSomali: 'Heerka 2aad (Meel Dhexe)',
    fullSomali: 'Heerka 2aad — Meel Dhexe (Standard)',
    fillHex: '#2563eb',
    strokeHex: '#1d4ed8',
    softHex: '#dbeafe',
  },
  tier_3_basic: {
    code: 'H3',
    shortSomali: 'Heerka 3aad (Meel Hoose)',
    fullSomali: 'Heerka 3aad — Meel Hoose / Duleed (Basic)',
    fillHex: '#d97706',
    strokeHex: '#b45309',
    softHex: '#fef3c7',
  },
};

export const WADI_STATUS_METADATA: Record<
  WadiStatus,
  {
    code: string;
    labelSomali: string;
    shortSomali: string;
    strokeHex: string;
    isEncumbered: boolean;
  }
> = {
  cuts_through: {
    code: 'DOOX_DHEX',
    labelSomali: 'Dooxu wuxuu dhex maraa plot-ka',
    shortSomali: 'Doox dhex mara',
    strokeHex: '#0284c7',
    isEncumbered: true,
  },
  partial: {
    code: 'DOOX_QAYB',
    labelSomali: 'Dooxu qayb ayuu ka maraa plot-ka',
    shortSomali: 'Doox qayb mara',
    strokeHex: '#0ea5e9',
    isEncumbered: true,
  },
  nearby: {
    code: 'DOOX_DHOW',
    labelSomali: 'Plot-ku wuxuu ku dhow yahay doox',
    shortSomali: 'Ku dhow doox',
    strokeHex: '#38bdf8',
    isEncumbered: false,
  },
  none: {
    code: 'DOOX_MAYA',
    labelSomali: 'Plot-ku kuma jiro doox',
    shortSomali: 'Kuma jiro doox',
    strokeHex: '#16a34a',
    isEncumbered: false,
  },
  unverified: {
    code: 'LAMA_XAQIIJIN',
    labelSomali: 'Xaaladda dooxa lama xaqiijin',
    shortSomali: 'Lama xaqiijin',
    strokeHex: '#94a3b8',
    isEncumbered: false,
  },
};

export const SITE_QUALITY_METADATA: Record<
  SiteQualityRating,
  {
    code: string;
    labelSomali: string;
    colorHex: string;
  }
> = {
  very_good: {
    code: 'AAD_WANAAGSAN',
    labelSomali: 'Aad u wanaagsan',
    colorHex: '#059669',
  },
  good: {
    code: 'WANAAGSAN',
    labelSomali: 'Wanaagsan',
    colorHex: '#0d9488',
  },
  medium: {
    code: 'DHEXDHEXAAD',
    labelSomali: 'Dhexdhexaad',
    colorHex: '#2563eb',
  },
  poor: {
    code: 'LIIDATA',
    labelSomali: 'Liidata',
    colorHex: '#dc2626',
  },
  unverified: {
    code: 'LAMA_XAQIIJIN',
    labelSomali: 'Lama xaqiijin',
    colorHex: '#64748b',
  },
};

export const ZONE_METADATA_PRESETS: Record<
  string,
  { labelSomali: string; colorHex: string }
> = {
  'Zone A': { labelSomali: 'Zone A (Waqooyi-Galbeed)', colorHex: '#0f766e' },
  'Zone B': { labelSomali: 'Zone B (Waqooyi-Bari)', colorHex: '#1d4ed8' },
  'Zone C': { labelSomali: 'Zone C (Koonfur-Galbeed)', colorHex: '#b45309' },
  'Zone D': { labelSomali: 'Zone D (Koonfur-Bari)', colorHex: '#7c3aed' },
  'Zone E': { labelSomali: 'Zone E (Bartamaha)', colorHex: '#be123c' },
  'Zone F': { labelSomali: 'Zone F (Duleedka)', colorHex: '#3f6212' },
};

const EXTRA_ZONE_COLORS = ['#0e7490', '#4338ca', '#9d174d', '#15803d', '#a16207'];

export function getZoneDisplayMeta(zoneId: string): { labelSomali: string; colorHex: string } {
  if (ZONE_METADATA_PRESETS[zoneId]) return ZONE_METADATA_PRESETS[zoneId];
  let hash = 0;
  for (let i = 0; i < zoneId.length; i++) {
    hash = (hash * 31 + zoneId.charCodeAt(i)) >>> 0;
  }
  return {
    labelSomali: zoneId,
    colorHex: EXTRA_ZONE_COLORS[hash % EXTRA_ZONE_COLORS.length],
  };
}

/**
 * 24 curated, maximally contrasting cartographic colors for individual heirs.
 * Explicitly avoids status colors:
 * - Excluded plots: #F43F5E / #FDA4AF / #FB7185 (crimson/rose)
 * - Shared plots: #F59E0B (amber hatch)
 * - Unassigned / Half / Jajab: #64748B / #94A3B8 / #CBD5E1 / #E2E8F0 (neutral slates)
 */
export const HEIR_PALETTE_HEX = [
  '#16A34A', // 1. Vivid Forest Green
  '#2563EB', // 2. Royal Cobalt Blue
  '#9333EA', // 3. Amethyst Purple
  '#0D9488', // 4. Deep Teal
  '#EA580C', // 5. Burnt Tangerine
  '#4F46E5', // 6. Indigo
  '#65A30D', // 7. Olive Lime
  '#0284C7', // 8. Cerulean Sky
  '#C026D3', // 9. Fuchsia Orchid
  '#CA8A04', // 10. Ochre Gold
  '#059669', // 11. Jade Emerald
  '#7C3AED', // 12. Violet
  '#0891B2', // 13. Cyan Lagoon
  '#D97706', // 14. Warm Bronze
  '#1D4ED8', // 15. Deep Sapphire
  '#15803D', // 16. Meadow Green
  '#A21CAF', // 17. Plum Magenta
  '#B45309', // 18. Copper Sienna
  '#0F766E', // 19. Pine Teal
  '#4338CA', // 20. Ultramarine
  '#4D7C0F', // 21. Moss Green
  '#0369A1', // 22. Ocean Blue
  '#6D28D9', // 23. Royal Grape
  '#C2410C', // 24. Terracotta Rust
];

function hslToHexColor(hDeg: number, sPct: number, lPct: number): string {
  const h = ((hDeg % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, sPct)) / 100;
  const l = Math.max(0, Math.min(100, lPct)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h < 60) {
    r1 = c;
    g1 = x;
  } else if (h < 120) {
    r1 = x;
    g1 = c;
  } else if (h < 180) {
    g1 = c;
    b1 = x;
  } else if (h < 240) {
    g1 = x;
    b1 = c;
  } else if (h < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

/**
 * Guarantees a 100% unique hex color for every individual heir index (0..N),
 * even for families with 30–60+ heirs, without colliding with Excluded/Unassigned colors.
 */
export function getDistinctHeirColor(index: number): string {
  const safeIdx = Math.max(0, Math.floor(index));
  if (safeIdx < HEIR_PALETTE_HEX.length) {
    return HEIR_PALETTE_HEX[safeIdx];
  }
  const used = new Set(HEIR_PALETTE_HEX.map((c) => c.toUpperCase()));
  for (let i = HEIR_PALETTE_HEX.length; i <= safeIdx; i++) {
    const extraStep = i - HEIR_PALETTE_HEX.length;
    const lightnessBands = [44, 34, 52, 39];
    const saturationBands = [76, 68, 82, 72];
    let attempt = 0;
    let candidate = '#16A34A';
    while (attempt < 50) {
      // Golden-angle progression mapped onto safe hue arc [22°..326°] (avoids red/rose 327°..360°, 0°..21°)
      const rawUnit = ((extraStep + attempt * 0.37) * 0.61803398875) % 1;
      const safeHue = 22 + rawUnit * 304;
      const sat = saturationBands[(extraStep + attempt) % saturationBands.length];
      const light = lightnessBands[Math.floor(extraStep / 3 + attempt) % lightnessBands.length];
      candidate = hslToHexColor(safeHue, sat, light);
      if (!used.has(candidate)) {
        break;
      }
      attempt++;
    }
    if (i === safeIdx) return candidate;
    used.add(candidate);
  }
  return HEIR_PALETTE_HEX[0];
}

export const LAND_ALLOCATION_MODE_METADATA: Record<
  LandAllocationMode,
  {
    shortSomali: string;
    titleSomali: string;
    descriptionSomali: string;
  }
> = {
  exact_shared: {
    shortSomali: '1. Saami Sax ah + Wadaag',
    titleSomali: '1. Saami Sax ah + Plots Wadaag ah',
    descriptionSomali:
      "Dhaxle kasta wuxuu helaa saamigiisa saxda ah ee Faraa'idka; jajabka soo hadha waxaa lagu wadaagaa hal plot.",
  },
  whole_balanced: {
    shortSomali: '2. Plots Aan La Wadaagin',
    titleSomali: '2. Inaanay Dhaxlayaashu Plots Wadaagin (Plot kasta 1 Qof)',
    descriptionSomali:
      'Ma jiro wax plot ah oo laba dhaxle wadaagaan (0 Plot Wadaag ah) — plot kasta oo buuxa hal dhaxle oo keliya ayaa qaadanaya.',
  },
  clean_equal_no_half_no_fraction: {
    shortSomali: '3. Tiro Siman (Reeb Half & Jajab)',
    titleSomali: '3. Tiro Siman — Laga Reebo Half-Plots & Jajabka',
    descriptionSomali:
      'Half-plots-ka iyo plots-ka jajabka keena waa laga reebayaa qaybinta; dhaxlayaasha isku saamiga ah waxay helayaan tiro plots buuxa oo siman (0 wadaag, 0 jajab).',
  },
};

export const DEFAULT_SUBDIVISION_PARAMS: SubdivisionParams = {
  L: 90,
  W: 48,
  pw: 18,
  pd: 24,
  rU: 15,
  rV: 15,
  linkRoads: true,
  rot: 0,
  minP: 1,
  su: 0,
  sv: 0,
  swap: false,
};

export function createAuditEntry(
  actionType: SubdivisionAuditEntry['actionType'],
  summarySomali: string
): SubdivisionAuditEntry {
  return {
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    actionType,
    summarySomali,
  };
}

/* ==================== 1. GEOJSON PARSING (PLAIN & RICH) ==================== */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseGeoJsonItems(json: any): ParsedGeoItem[] {
  const out: ParsedGeoItem[] = [];
  if (!json || typeof json !== 'object') return out;

  // Automatically reproject UTM (e.g. EPSG:32638 Somaliland/Somalia) to WGS84 Lon/Lat
  const normalized = normalizeGeoJsonCrsToWgs84(json).normalizedJson;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srcJson: any = normalized && typeof normalized === 'object' ? normalized : json;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let feats: any[] = [];
  if (srcJson.type === 'FeatureCollection') {
    feats = Array.isArray(srcJson.features) ? srcJson.features : [];
  } else if (srcJson.type === 'Feature') {
    feats = [srcJson];
  } else if (srcJson.type) {
    feats = [{ type: 'Feature', properties: {}, geometry: srcJson }];
  }

  feats.forEach((f, i) => {
    const g = f?.geometry;
    if (!g) return;
    const rawProps: Record<string, unknown> =
      f.properties && typeof f.properties === 'object' ? { ...f.properties } : {};
    const nm = String(
      rawProps.Name ??
        rawProps.name ??
        rawProps.Plot_ID ??
        rawProps.plot_id ??
        rawProps.Block_ID ??
        rawProps.block_id ??
        rawProps.block ??
        rawProps.koodh ??
        (rawProps.fid !== undefined ? `FID-${rawProps.fid}` : undefined) ??
        (rawProps.id !== undefined ? `ID-${rawProps.id}` : undefined) ??
        `Feature ${i + 1}`
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const add = (type: 'Polygon' | 'Line', coords: any[], gType: string, suffix?: string) => {
      const minPts = type === 'Line' ? 2 : 3;
      if (Array.isArray(coords) && coords.length >= minPts) {
        const cleanPts: Point2D[] = [];
        for (const c of coords) {
          if (Array.isArray(c) && c.length >= 2) {
            const x = Number(c[0]);
            const y = Number(c[1]);
            if (Number.isFinite(x) && Number.isFinite(y)) {
              cleanPts.push([x, y]);
            }
          }
        }
        if (cleanPts.length >= minPts) {
          out.push({
            name: nm + (suffix || ''),
            type,
            coords: cleanPts,
            rawGeometryType: gType,
            rawProperties: rawProps,
          });
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractGeom = (geom: any, prefix = '') => {
      if (!geom || typeof geom !== 'object') return;
      const gType = String(geom.type || '');
      if (gType === 'Polygon' && Array.isArray(geom.coordinates)) {
        add('Polygon', geom.coordinates[0], gType, prefix);
      } else if (gType === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        geom.coordinates.forEach((p: any, k: number) => {
          if (Array.isArray(p) && p[0]) {
            add('Polygon', p[0], gType, geom.coordinates.length > 1 ? `${prefix} #${k + 1}` : prefix);
          }
        });
      } else if (gType === 'LineString' && Array.isArray(geom.coordinates)) {
        add('Line', geom.coordinates, gType, prefix);
      } else if (gType === 'MultiLineString' && Array.isArray(geom.coordinates)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        geom.coordinates.forEach((l: any, k: number) =>
          add('Line', l, gType, geom.coordinates.length > 1 ? `${prefix} #${k + 1}` : prefix)
        );
      } else if (gType === 'GeometryCollection' && Array.isArray(geom.geometries)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        geom.geometries.forEach((sub: any, k: number) => extractGeom(sub, `${prefix} G${k + 1}`));
      }
    };

    extractGeom(g);
  });

  return out;
}

/**
 * Inspects one or multiple uploaded GeoJSON files (`01_xuduudka_beerta`, `02_blocks`, `03_plots`, `05_dooxyada`
 * or a single combined GeoJSON) with automatic UTM (`EPSG:32638`) -> WGS84 (`EPSG:4326`) reprojection.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function inspectMultipleGeoJsonUploads(sources: { fileName: string; rawJson: any }[]): ClassifiedFarmGeoJsonLayers & {
  isProjectedMetersLikely: boolean;
  geometrySummarySomali: string;
  hasRichPlotAttributes: boolean;
  validationWarnings: string[];
} {
  const classified = classifyFarmGeoJsonSources(sources, parseGeoJsonItems);

  let remainingOutOfBounds = 0;
  classified.allItems.forEach((it) => {
    it.coords.forEach((pt) => {
      if (Math.abs(pt[0]) > 180 || Math.abs(pt[1]) > 90) {
        remainingOutOfBounds++;
      }
    });
  });

  const isProjectedMetersLikely = remainingOutOfBounds > 0;
  const warnings = [...classified.warnings];
  if (isProjectedMetersLikely) {
    warnings.push(
      `Digniin CRS (${classified.detectedCrs}): Isuduwaha qaarkood weli waxay ka baxsan yihiin xadka Lat/Lon (±180°/±90°).`
    );
  }

  const polyCount = classified.allItems.filter((x) => x.type === 'Polygon').length;
  const lineCount = classified.allItems.filter((x) => x.type === 'Line').length;
  const geometrySummarySomali = `${polyCount} Polygon · ${lineCount} LineString (${classified.detectedCrs})`;

  return {
    ...classified,
    isProjectedMetersLikely,
    geometrySummarySomali,
    hasRichPlotAttributes: Boolean(
      classified.prebuiltSubdivision && classified.prebuiltSubdivision.plots.length > 0
    ),
    validationWarnings: warnings,
  };
}

/**
 * Inspects a single uploaded GeoJSON to detect CRS, pre-built Plots/Blocks/Dooxyada/Boundary layers,
 * and rich QGIS attributes (`goostay`, `pct_gudaha`, `doox`, `heer`, `calaamad`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function inspectRichGeoJsonUpload(json: any, fileName: string): {
  detectedCrs: string;
  wasReprojectedFromUtm: boolean;
  isProjectedMetersLikely: boolean;
  geometrySummarySomali: string;
  prebuiltSubdivision: PrebuiltGeoJsonSubdivision | null;
  boundaryItem: ParsedGeoItem | null;
  wadiItems: ParsedGeoItem[];
  allItems: ParsedGeoItem[];
  hasRichPlotAttributes: boolean;
  validationWarnings: string[];
} {
  const res = inspectMultipleGeoJsonUploads([{ fileName, rawJson: json }]);
  return {
    detectedCrs: res.detectedCrs,
    wasReprojectedFromUtm: res.wasReprojectedFromUtm,
    isProjectedMetersLikely: res.isProjectedMetersLikely,
    geometrySummarySomali: res.geometrySummarySomali,
    prebuiltSubdivision: res.prebuiltSubdivision,
    boundaryItem: res.boundaryItem,
    wadiItems: res.wadiItems,
    allItems: res.allItems,
    hasRichPlotAttributes: res.hasRichPlotAttributes,
    validationWarnings: res.validationWarnings,
  };
}


function mdist(a: Point2D, b: Point2D): number {
  const dx = (a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180);
  const dy = (a[1] - b[1]) * 110574;
  return Math.hypot(dx, dy);
}

function subRings(c: Point2D[]): Point2D[][] {
  const rings: Point2D[][] = [];
  let s = 0;
  const n = c.length;
  while (s < n - 2) {
    let k = -1;
    for (let j = s + 3; j < n; j++) {
      if (mdist(c[j], c[s]) < 2.5) {
        k = j;
        break;
      }
    }
    if (k < 0) {
      if (n - s >= 4) rings.push(c.slice(s));
      break;
    }
    rings.push(c.slice(s, k));
    s = k + 1;
  }
  return rings;
}

export function buildSampleBlockCandidates(items: ParsedGeoItem[]): SampleBlockCandidate[] {
  const cands: SampleBlockCandidate[] = [];
  items.forEach((it) => {
    if (it.type !== 'Polygon') return;
    const rs = subRings(it.coords);
    rs.forEach((r, i) => {
      if (r.length >= 4) {
        cands.push({
          label: `${it.name}${rs.length > 1 ? ` · qayb ${i + 1}` : ''} (${r.length} geesood)`,
          ring: r,
        });
      }
    });
  });
  return cands;
}

export function pickBestBoundaryIndex(items: ParsedGeoItem[]): number {
  let bi = 0;
  let bestScore = -1;
  items.forEach((it, i) => {
    const score = (it.type === 'Line' ? 1e6 : 0) + it.coords.length;
    if (score > bestScore) {
      bestScore = score;
      bi = i;
    }
  });
  return bi;
}

export type HtmlGeoJsonSlot = 'B' | 'S' | 'A' | 'W' | 'R';

/**
 * Exact `toItems(json)` equivalent from Naqshadeeyaha_Blocks_Plots_v2.html (with automatic UTM->WGS84 normalization):
 * keeps Polygon, MultiPolygon, LineString, MultiLineString features with `coords.length >= 3`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toHtmlGeoJsonItems(json: any): ParsedGeoItem[] {
  return parseGeoJsonItems(json).filter((it) => it.coords.length >= 3);
}

/**
 * Directly mirrors `loadFile(file, which)` in Naqshadeeyaha_Blocks_Plots_v2.html, extended with 'W' (Dooxyada) & 'R' (Waddada):
 * - Slot 'B': Xuduudka beerta (`S.items = items`, `bestB`, if `!S.sCustom` builds `cands` excluding `bestB`)
 * - Slot 'S': Block tusaale ah (`S.sCustom = true`, `S.cands = buildCandidates(items)`, keeps `bestB`)
 * - Slot 'A': Aag gaar ah (`S.areas = items.filter(it => it.coords.length >= 3)`)
 * - Slot 'W': Dooxyada (`wadiItems` — lines/polygons with `coords.length >= 2`)
 * - Slot 'R': Waddada Magaalada (`roadItems` — lines with `coords.length >= 2`)
 */
export function applyHtmlGeoJsonSlotImport(
  prev: LandSubdivisionState,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawJson: any,
  fileName: string,
  slot: HtmlGeoJsonSlot
):
  | { ok: true; nextState: LandSubdivisionState; summarySomali: string }
  | { ok: false; errorSomali: string } {
  if (slot === 'W' || slot === 'R') {
    const lineItems = parseGeoJsonItems(rawJson).filter((it) => it.coords.length >= 2);
    if (!lineItems.length) {
      return {
        ok: false,
        errorSomali: 'File-ka lama akhrin karo: Geometry ma jirto. Isticmaal GeoJSON sax ah.',
      };
    }
    if (slot === 'W') {
      const label = `${fileName} · ${lineItems.length} doox`;
      return {
        ok: true,
        summarySomali: label,
        nextState: {
          ...prev,
          wadiItems: lineItems,
          wadiFileName: label,
          auditHistory: [
            createAuditEntry('geojson_import', `Dooxyada waa la soo geliyey: ${label}.`),
            ...(prev.auditHistory || []).slice(0, 49),
          ],
        },
      };
    }
    const label = `${fileName} · ${lineItems.length} waddo`;
    return {
      ok: true,
      summarySomali: label,
      nextState: {
        ...prev,
        roadItems: lineItems,
        roadFileName: label,
        auditHistory: [
          createAuditEntry('geojson_import', `Waddada magaalada waa la soo geliyey: ${label}.`),
          ...(prev.auditHistory || []).slice(0, 49),
        ],
      },
    };
  }

  const items = toHtmlGeoJsonItems(rawJson);
  if (!items.length) {
    return {
      ok: false,
      errorSomali: 'File-ka lama akhrin karo: Geometry ma jirto. Isticmaal GeoJSON sax ah.',
    };
  }

  if (slot === 'A') {
    const areas = items.filter((it) => it.coords.length >= 3);
    const label = `${fileName} · ${areas.length} aag`;
    return {
      ok: true,
      summarySomali: label,
      nextState: {
        ...prev,
        specialAreaItems: areas,
        specialAreaFileName: label,
        auditHistory: [
          createAuditEntry('geojson_import', `Aag gaar ah waa la soo geliyey: ${label}.`),
          ...(prev.auditHistory || []).slice(0, 49),
        ],
      },
    };
  }

  if (slot === 'B') {
    const bi = pickBestBoundaryIndex(items);
    const bItem = items[bi];
    const cands = prev.sampleCustom
      ? prev.sampleCandidates
      : buildSampleBlockCandidates(items.filter((it) => it !== bItem));
    const nextSampleIdx = prev.sampleCustom
      ? prev.selectedSampleIndex
      : cands.length > 0
      ? 0
      : -1;
    const nextSampleFileName = prev.sampleCustom
      ? prev.sampleFileName
      : cands.length > 0
      ? `${fileName} · ${cands.length} block (isla file-ka xuduudka)`
      : 'Isla file-ka xuduudka ayaa laga qaadan karaa';
    const label = `${fileName} · ${items.length} shay`;

    return {
      ok: true,
      summarySomali: label,
      nextState: {
        ...prev,
        prebuiltSubdivision: null,
        boundaryItems: items,
        boundaryFileName: label,
        selectedBoundaryIndex: bi,
        sampleCandidates: cands,
        sampleFileName: nextSampleFileName,
        selectedSampleIndex: nextSampleIdx,
        blockZones: {},
        blockTiers: {},
        plotTierOverrides: {},
        plotMetadata: {},
        blockMetadata: {},
        manualPlotHeirOverrides: {},
        approvalStatus: 'draft_proposal',
        auditHistory: [
          createAuditEntry('geojson_import', `Xuduudka beerta waa la soo geliyey: ${label}.`),
          ...(prev.auditHistory || []).slice(0, 49),
        ],
      },
    };
  }

  // slot === 'S' (Block tusaale ah)
  const cands = buildSampleBlockCandidates(items);
  const label = `${fileName} · ${cands.length} block`;
  const nextBi =
    prev.boundaryItems.length > 0
      ? pickBestBoundaryIndex(prev.boundaryItems)
      : prev.selectedBoundaryIndex;

  return {
    ok: true,
    summarySomali: label,
    nextState: {
      ...prev,
      prebuiltSubdivision: null,
      sampleCustom: true,
      sampleCandidates: cands,
      sampleFileName: label,
      selectedSampleIndex: cands.length > 0 ? 0 : -1,
      selectedBoundaryIndex: nextBi,
      blockZones: {},
      blockTiers: {},
      manualPlotHeirOverrides: {},
      approvalStatus: 'draft_proposal',
      auditHistory: [
        createAuditEntry('geojson_import', `Block tusaale ah waa la soo geliyey: ${label}.`),
        ...(prev.auditHistory || []).slice(0, 49),
      ],
    },
  };
}

/**
 * Directly mirrors `$('selB').onchange` in Naqshadeeyaha_Blocks_Plots_v2.html:
 * when `!sampleCustom`, rebuilds `sampleCandidates` excluding the newly chosen boundary feature.
 */
export function applyHtmlBoundarySelectionChange(
  prev: LandSubdivisionState,
  newBoundaryIdx: number
): LandSubdivisionState {
  const bItem = prev.boundaryItems[newBoundaryIdx];
  const cands = prev.sampleCustom
    ? prev.sampleCandidates
    : buildSampleBlockCandidates(prev.boundaryItems.filter((it) => it !== bItem));
  return {
    ...prev,
    prebuiltSubdivision: null,
    selectedBoundaryIndex: newBoundaryIdx,
    sampleCandidates: cands,
    selectedSampleIndex: prev.sampleCustom
      ? prev.selectedSampleIndex
      : cands.length > 0
      ? 0
      : -1,
    blockZones: {},
    blockTiers: {},
    plotTierOverrides: {},
    manualPlotHeirOverrides: {},
    approvalStatus: 'draft_proposal',
  };
}

/**
 * Directly mirrors `useSample()` in Naqshadeeyaha_Blocks_Plots_v2.html.
 */
export function applyHtmlUseSample(prev: LandSubdivisionState): LandSubdivisionState {
  const items = toHtmlGeoJsonItems(SAMPLE_FARM_GEOJSON);
  const bi = pickBestBoundaryIndex(items);
  const cands = buildSampleBlockCandidates(items.filter((_, idx) => idx !== bi));
  return {
    ...prev,
    prebuiltSubdivision: null,
    sampleCustom: false,
    specialAreaItems: [],
    specialAreaFileName: 'GeoJSON polygon — plots iyo half-plots ku jira ayaa la tirinayaa',
    boundaryItems: items,
    boundaryFileName: `Xogta tusaalaha · ${items.length} shay`,
    selectedBoundaryIndex: bi,
    sampleCandidates: cands,
    sampleFileName: 'Xogta tusaalaha (block tusaale)',
    selectedSampleIndex: cands.length > 0 ? 0 : -1,
    wadiItems: [],
    wadiFileName: '',
    blockZones: {},
    blockTiers: {},
    plotTierOverrides: {},
    plotMetadata: {},
    blockMetadata: {},
    manualPlotHeirOverrides: {},
    approvalStatus: 'draft_proposal',
    auditHistory: [
      createAuditEntry('geojson_import', 'Isticmaal xogta tusaalaha (Beerta xuduudka + Block tusaale).'),
      ...(prev.auditHistory || []).slice(0, 49),
    ],
  };
}

export function createInitialSampleSubdivisionState(): LandSubdivisionState {
  const items = toHtmlGeoJsonItems(SAMPLE_FARM_GEOJSON);
  const bestIdx = pickBestBoundaryIndex(items);
  const cands = buildSampleBlockCandidates(items.filter((_, idx) => idx !== bestIdx));
  const initialParams = { ...DEFAULT_SUBDIVISION_PARAMS };

  const tempRes = computeLandSubdivision(items[bestIdx], cands[0] || null, initialParams);
  const autoBlockTiers = tempRes ? buildRowBasedBlockTiers(tempRes.blocks) : {};
  const autoBlockZones = tempRes ? buildAutoBlockZones(tempRes.blocks, 'quadrants_4') : {};

  return {
    boundaryItems: items,
    boundaryFileName: `Xogta tusaalaha · ${items.length} shay`,
    selectedBoundaryIndex: bestIdx,
    sampleCustom: false,
    sampleCandidates: cands,
    sampleFileName: 'Xogta tusaalaha (block tusaale)',
    selectedSampleIndex: cands.length > 0 ? 0 : -1,
    specialAreaItems: [],
    specialAreaFileName: 'GeoJSON polygon — plots iyo half-plots ku jira ayaa la tirinayaa',
    params: initialParams,
    prebuiltSubdivision: null,
    wadiItems: [],
    wadiFileName: '',
    blockZones: autoBlockZones,
    zonePresetMode: 'quadrants_4',
    enforceNonAdjacentBlocks: true,
    blockTiers: autoBlockTiers,
    plotTierOverrides: {},
    plotMetadata: {},
    blockMetadata: {},
    manualPlotHeirOverrides: {},
    tierUnitPrices: {
      tier_1_prime: 0,
      tier_2_standard: 0,
      tier_3_basic: 0,
    },
    isLinkedToEstate: false,
    allocationMode: 'exact_shared',
    approvalStatus: 'draft_proposal',
    auditHistory: [
      createAuditEntry(
        'geojson_import',
        'Xogta tusaalaha ee beerta waa la diyaariyey (Blocks, Plots, Zones A–D & Heerarka H1–H3).'
      ),
    ],
  };
}

/** Safely normalizes persisted localStorage / saved-case snapshots from earlier versions */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hydrateLandSubdivisionState(raw: any): LandSubdivisionState {
  const fallback = createInitialSampleSubdivisionState();
  if (!raw || typeof raw !== 'object') return fallback;
  const isExplicitlyMapless =
    Array.isArray(raw.boundaryItems) &&
    raw.boundaryItems.length === 0 &&
    !raw.prebuiltSubdivision;

  return {
    ...fallback,
    ...raw,
    specialAreaItems: Array.isArray(raw.specialAreaItems) ? raw.specialAreaItems : [],
    specialAreaFileName:
      typeof raw.specialAreaFileName === 'string'
        ? raw.specialAreaFileName
        : fallback.specialAreaFileName,
    params: { ...fallback.params, ...(raw.params || {}) },
    tierUnitPrices: { ...fallback.tierUnitPrices, ...(raw.tierUnitPrices || {}) },
    blockZones:
      raw.blockZones && typeof raw.blockZones === 'object'
        ? raw.blockZones
        : isExplicitlyMapless
        ? {}
        : fallback.blockZones,
    zonePresetMode: raw.zonePresetMode || 'quadrants_4',
    enforceNonAdjacentBlocks:
      typeof raw.enforceNonAdjacentBlocks === 'boolean' ? raw.enforceNonAdjacentBlocks : true,
    blockTiers:
      raw.blockTiers && typeof raw.blockTiers === 'object'
        ? raw.blockTiers
        : isExplicitlyMapless
        ? {}
        : fallback.blockTiers,
    plotTierOverrides: raw.plotTierOverrides || {},
    plotMetadata: raw.plotMetadata || {},
    blockMetadata: raw.blockMetadata || {},
    manualPlotHeirOverrides: raw.manualPlotHeirOverrides || {},
    includeValidHalfPlotsInAllocation: Boolean(raw.includeValidHalfPlotsInAllocation),
    halfPlotReviewNotes: raw.halfPlotReviewNotes || {},
    halfPlotValidationHistory: Array.isArray(raw.halfPlotValidationHistory)
      ? raw.halfPlotValidationHistory
      : [],
    allocationMode:
      raw.allocationMode === 'whole_balanced' ||
      raw.allocationMode === 'clean_equal_no_half_no_fraction'
        ? raw.allocationMode
        : 'exact_shared',
    approvalStatus: (raw.approvalStatus as AllocationApprovalStatus) || 'draft_proposal',
    auditHistory: Array.isArray(raw.auditHistory)
      ? raw.auditHistory
      : isExplicitlyMapless
      ? []
      : fallback.auditHistory,
  };
}

/* ==================== 2. PROJECTED GEOMETRY & SUBDIVISION ENGINE ==================== */

export function shoelaceArea(ring: Point2D[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function cross(a: Point2D, b: Point2D, c: Point2D): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

export function pointInPolygon(pt: Point2D, ring: Point2D[]): boolean {
  const x = pt[0];
  const y = pt[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

export function segmentsIntersect(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function pointToSegmentDist(pt: Point2D, a: Point2D, b: Point2D): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(pt[0] - a[0], pt[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq));
  return Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy));
}

function isRectInsideRing(
  rect: Point2D[],
  ring: Point2D[],
  bb: [number, number, number, number]
): boolean {
  for (let i = 0; i < 4; i++) {
    if (!pointInPolygon(rect[i], ring)) return false;
  }
  for (let e = 0; e < ring.length; e++) {
    const a = ring[e];
    const b = ring[(e + 1) % ring.length];
    if (
      Math.max(a[0], b[0]) < bb[0] ||
      Math.min(a[0], b[0]) > bb[2] ||
      Math.max(a[1], b[1]) < bb[1] ||
      Math.min(a[1], b[1]) > bb[3]
    ) {
      continue;
    }
    for (let i = 0; i < 4; i++) {
      if (segmentsIntersect(rect[i], rect[(i + 1) % 4], a, b)) return false;
    }
  }
  return true;
}

function convexHull(pts: Point2D[]): Point2D[] {
  const sorted = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length <= 2) return sorted;
  const lo: Point2D[] = [];
  const up: Point2D[] = [];
  for (let i = 0; i < sorted.length; i++) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], sorted[i]) <= 0) {
      lo.pop();
    }
    lo.push(sorted[i]);
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], sorted[i]) <= 0) {
      up.pop();
    }
    up.push(sorted[i]);
  }
  up.pop();
  lo.pop();
  return lo.concat(up);
}

function minAreaRect(pts: Point2D[]): {
  u: Point2D;
  c: Point2D;
  long: number;
  short: number;
} {
  const h = convexHull(pts);
  let best: {
    A: number;
    dx: number;
    dy: number;
    w: number;
    h: number;
    c: Point2D;
  } | null = null;

  for (let i = 0; i < h.length; i++) {
    const a = h[i];
    const b = h[(i + 1) % h.length];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (!len) continue;
    dx /= len;
    dy /= len;
    let u0 = 1e18;
    let u1 = -1e18;
    let v0 = 1e18;
    let v1 = -1e18;
    h.forEach((p) => {
      const u = p[0] * dx + p[1] * dy;
      const v = -p[0] * dy + p[1] * dx;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    });
    const A = (u1 - u0) * (v1 - v0);
    if (!best || A < best.A) {
      const cu = (u0 + u1) / 2;
      const cv = (v0 + v1) / 2;
      best = {
        A,
        dx,
        dy,
        w: u1 - u0,
        h: v1 - v0,
        c: [cu * dx - cv * dy, cu * dy + cv * dx],
      };
    }
  }

  if (!best) {
    return { u: [1, 0], c: pts[0] || [0, 0], long: 90, short: 48 };
  }

  const d: Point2D = best.w >= best.h ? [best.dx, best.dy] : [-best.dy, best.dx];
  return {
    u: d,
    c: best.c,
    long: Math.max(best.w, best.h),
    short: Math.min(best.w, best.h),
  };
}

export function frameFromRing(P: Point2D[]): {
  u: Point2D;
  c: Point2D;
  long: number;
  short: number;
} {
  const n = P.length;
  if (n === 4) {
    const e = [0, 1, 2, 3].map((i) => {
      const q = P[(i + 1) % 4];
      const p = P[i];
      return [q[0] - p[0], q[1] - p[1]] as Point2D;
    });
    const L = e.map((v) => Math.hypot(v[0], v[1]));
    const idx = [0, 1, 2, 3].sort((a, b) => L[b] - L[a]).slice(0, 2);
    const s = [0, 0];
    idx.forEach((i) => {
      let x = e[i][0] / (L[i] || 1);
      let y = e[i][1] / (L[i] || 1);
      if (x < 0 || (x === 0 && y < 0)) {
        x = -x;
        y = -y;
      }
      s[0] += x;
      s[1] += y;
    });
    const m = Math.hypot(s[0], s[1]) || 1;
    const sides = L.slice().sort((a, b) => b - a);
    return {
      u: [s[0] / m, s[1] / m],
      c: [
        (P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4,
        (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4,
      ],
      long: (sides[0] + sides[1]) / 2,
      short: (sides[2] + sides[3]) / 2,
    };
  }
  return minAreaRect(P);
}

export function isValidSubdivisionParams(p: SubdivisionParams): boolean {
  return (
    [p.L, p.W, p.pw, p.pd].every((x) => x > 0 && Number.isFinite(x)) &&
    p.rU >= 0 &&
    p.rV >= 0 &&
    Number.isFinite(p.rU) &&
    Number.isFinite(p.rV)
  );
}

/**
 * Computes projected UTM geometry from a pre-designed GeoJSON containing Blocks & Plots
 * WITHOUT regenerating or altering any polygon coordinates (Section 3.A / 3.B / 10).
 */
export function computePrebuiltSubdivisionResult(
  prebuilt: PrebuiltGeoJsonSubdivision,
  fallbackParams: SubdivisionParams
): SubdivisionComputationResult | null {
  const plotPts = prebuilt.plots.flatMap((pl) => pl.ringLonLat);
  const blockPts = prebuilt.blocks.flatMap((bl) => bl.ringLonLat);
  const bndPts = prebuilt.boundaryRingLonLat || [];
  const allLonLat = plotPts.length >= 3 ? plotPts : blockPts.length >= 3 ? blockPts : bndPts;
  if (allLonLat.length < 3) return null;

  let cLon = 0;
  let cLat = 0;
  allLonLat.forEach((q) => {
    cLon += q[0];
    cLat += q[1];
  });
  cLon /= allLonLat.length;
  cLat /= allLonLat.length;

  const zone = Math.max(1, Math.min(60, Math.floor((cLon + 180) / 6) + 1));
  const south = cLat < 0;
  const epsg = 32600 + (south ? 100 : 0) + zone;
  const projDef = `+proj=utm +zone=${zone}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;

  const fwd = (c: Point2D): Point2D => {
    const out = proj4('EPSG:4326', projDef, [c[0], c[1]]);
    return [out[0], out[1]];
  };
  const inv = (x: Point2D): Point2D => {
    const out = proj4(projDef, 'EPSG:4326', [x[0], x[1]]);
    return [out[0], out[1]];
  };

  const stripDuplicateClose = (ring: Point2D[]): Point2D[] => {
    if (ring.length > 3) {
      const a = ring[0];
      const b = ring[ring.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7) {
        return ring.slice(0, -1);
      }
    }
    return ring;
  };

  const rawBring = stripDuplicateClose(
    prebuilt.boundaryRingLonLat && prebuilt.boundaryRingLonLat.length >= 3
      ? prebuilt.boundaryRingLonLat
      : convexHull(allLonLat)
  );
  const bring = rawBring.map(fwd);
  const barea = Math.abs(shoelaceArea(bring));
  let bperim = 0;
  for (let i = 0; i < bring.length; i++) {
    const nxt = bring[(i + 1) % bring.length];
    bperim += Math.hypot(bring[i][0] - nxt[0], bring[i][1] - nxt[1]);
  }

  const bb: [number, number, number, number] = [1e18, 1e18, -1e18, -1e18];
  bring.forEach((q) => {
    bb[0] = Math.min(bb[0], q[0]);
    bb[1] = Math.min(bb[1], q[1]);
    bb[2] = Math.max(bb[2], q[0]);
    bb[3] = Math.max(bb[3], q[1]);
  });

  const plotsByBlockId: Record<string, GeneratedPlot[]> = {};
  const allGeneratedPlots: GeneratedPlot[] = [];

  prebuilt.plots.forEach((pl, idx) => {
    const ringClean = stripDuplicateClose(pl.ringLonLat);
    const rectUtm = ringClean.map(fwd);
    let cx = 0;
    let cy = 0;
    rectUtm.forEach((q) => {
      cx += q[0];
      cy += q[1];
      bb[0] = Math.min(bb[0], q[0]);
      bb[1] = Math.min(bb[1], q[1]);
      bb[2] = Math.max(bb[2], q[0]);
      bb[3] = Math.max(bb[3], q[1]);
    });
    cx /= rectUtm.length || 1;
    cy /= rectUtm.length || 1;
    const centerUtm: Point2D = [cx, cy];
    const calcArea = +Math.abs(shoelaceArea(rectUtm)).toFixed(2);

    const gp: GeneratedPlot = {
      id: pl.id,
      block: pl.blockId,
      no: pl.no || idx + 1,
      r: 1,
      c: idx + 1,
      rect: rectUtm,
      centerUtm,
      centerLonLat: inv(centerUtm),
      full: true,
      calculatedAreaSqM: calcArea,
      preservedProps: pl.rawProperties,
    };
    if (!plotsByBlockId[pl.blockId]) plotsByBlockId[pl.blockId] = [];
    plotsByBlockId[pl.blockId].push(gp);
    allGeneratedPlots.push(gp);
  });

  const blocks: GeneratedBlock[] = prebuilt.blocks.map((blk) => {
    const ringClean = stripDuplicateClose(blk.ringLonLat);
    const rectUtm = ringClean.map(fwd);
    let cx = 0;
    let cy = 0;
    rectUtm.forEach((q) => {
      cx += q[0];
      cy += q[1];
      bb[0] = Math.min(bb[0], q[0]);
      bb[1] = Math.min(bb[1], q[1]);
      bb[2] = Math.max(bb[2], q[0]);
      bb[3] = Math.max(bb[3], q[1]);
    });
    cx /= rectUtm.length || 1;
    cy /= rectUtm.length || 1;
    const bPlots = plotsByBlockId[blk.id] || [];
    return {
      id: blk.id,
      ci: blk.C,
      rj: blk.R,
      R: blk.R,
      C: blk.C,
      rect: rectUtm,
      centerUtm: [cx, cy],
      plots: bPlots,
      nf: bPlots.length,
      total: bPlots.length,
      complete: true,
      isSample: false,
      calculatedAreaSqM: +Math.abs(shoelaceArea(rectUtm)).toFixed(2),
      preservedProps: blk.rawProperties,
    };
  });

  // Ensure plots without matching block entries still belong to synthetic blocks so evaluateBlocksAndHalfPlots evaluates them!
  const knownBlockIds = new Set(blocks.map((b) => b.id));
  Object.entries(plotsByBlockId).forEach(([bId, bPlots], idx) => {
    if (knownBlockIds.has(bId) || bPlots.length === 0) return;
    const pts = bPlots.flatMap((p) => p.rect);
    let minX = 1e18, minY = 1e18, maxX = -1e18, maxY = -1e18;
    pts.forEach((q) => {
      minX = Math.min(minX, q[0]);
      minY = Math.min(minY, q[1]);
      maxX = Math.max(maxX, q[0]);
      maxY = Math.max(maxY, q[1]);
    });
    const rectUtm: Point2D[] = [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ];
    blocks.push({
      id: bId,
      ci: idx + 1,
      rj: 1,
      R: 1,
      C: idx + 1,
      rect: rectUtm,
      centerUtm: [(minX + maxX) / 2, (minY + maxY) / 2],
      plots: bPlots,
      nf: bPlots.length,
      total: bPlots.length,
      complete: true,
      isSample: false,
      calculatedAreaSqM: +Math.abs(shoelaceArea(rectUtm)).toFixed(2),
      preservedProps: { syntheticBlock: true },
    });
  });

  blocks.sort((a, b) => a.R - b.R || a.C - b.C);

  const nCEst = Math.max(1, Math.round(allGeneratedPlots.length / Math.max(1, blocks.length)));
  const evalRes = evaluateBlocksAndHalfPlots({
    blocks,
    boundaryRingUtm: bring,
    nR: 2,
    nC: 5,
    isPrebuiltGeometry: true,
    externalWarnings: prebuilt.validationWarnings.filter(
      (w) => !w.toLowerCase().includes('crs')
    ),
  });

  // Honor explicit `nooca` ("dhammaystiran" | "half"), QGIS `goostay` (0 = Buuxa, 1 = Qayb go'an), and `pct_gudaha`
  let hasExplicitGoostayOrPct = false;
  evalRes.allEvaluatedPlots.forEach((pl) => {
    const p = pl.preservedProps || {};
    const noocaRaw = p.nooca ?? p.Nooca ?? p.NOOCA;
    const goostayRaw =
      p.goostay ?? p.Goostay ?? p.GOOSTAY ?? p.go_an ?? p.clipped;
    const pctRaw = p.pct_gudaha ?? p.PCT_GUDAHA ?? p.inside_pct;

    if (noocaRaw !== undefined && noocaRaw !== null && String(noocaRaw).trim() !== '') {
      hasExplicitGoostayOrPct = true;
      const ns = String(noocaRaw).trim().toLowerCase();
      const isHalfNooca = ns === 'half' || ns.includes('half') || ns.includes('qayb');
      pl.full = !isHalfNooca;
      if (pl.halfPlotValidation) {
        pl.halfPlotValidation.boundaryRelation = isHalfNooca
          ? 'boundary_clipped'
          : 'full_inside';
        pl.halfPlotValidation.validationStatus = isHalfNooca
          ? 'boundary_clipped'
          : 'full_inside';
        if (pctRaw !== undefined && pctRaw !== null && Number.isFinite(Number(pctRaw))) {
          pl.halfPlotValidation.insidePercentage = Math.max(0, Math.min(100, Number(pctRaw)));
        } else {
          pl.halfPlotValidation.insidePercentage = isHalfNooca ? 50 : 100;
        }
        evalRes.plotValidations[pl.id] = pl.halfPlotValidation;
      }
    } else if (goostayRaw !== undefined && goostayRaw !== null && goostayRaw !== '') {
      hasExplicitGoostayOrPct = true;
      const s = String(goostayRaw).trim().toLowerCase();
      const isClippedAttr =
        Number(goostayRaw) === 1 || s === 'true' || s === 'qayb' || s === 'ha';
      pl.full = !isClippedAttr;
      if (pl.halfPlotValidation) {
        pl.halfPlotValidation.boundaryRelation = isClippedAttr
          ? 'boundary_clipped'
          : 'full_inside';
        pl.halfPlotValidation.validationStatus = isClippedAttr
          ? 'boundary_clipped'
          : 'full_inside';
        if (pctRaw !== undefined && pctRaw !== null && Number.isFinite(Number(pctRaw))) {
          pl.halfPlotValidation.insidePercentage = Math.max(0, Math.min(100, Number(pctRaw)));
        } else if (!isClippedAttr) {
          pl.halfPlotValidation.insidePercentage = 100;
        }
        evalRes.plotValidations[pl.id] = pl.halfPlotValidation;
      }
    } else if (pctRaw !== undefined && pctRaw !== null && Number.isFinite(Number(pctRaw))) {
      hasExplicitGoostayOrPct = true;
      const pctNum = Number(pctRaw);
      const isFullAttr = pctNum >= 99.5;
      pl.full = isFullAttr;
      if (pl.halfPlotValidation) {
        pl.halfPlotValidation.boundaryRelation = isFullAttr
          ? 'full_inside'
          : 'boundary_clipped';
        pl.halfPlotValidation.validationStatus = isFullAttr
          ? 'full_inside'
          : 'boundary_clipped';
        pl.halfPlotValidation.insidePercentage = Math.max(0, Math.min(100, pctNum));
        evalRes.plotValidations[pl.id] = pl.halfPlotValidation;
      }
    }
  });

  let finalFullPlots = evalRes.fullPlots;
  if (hasExplicitGoostayOrPct) {
    finalFullPlots = evalRes.allEvaluatedPlots.filter((pl) => pl.full);
    evalRes.blocks.forEach((blk) => {
      blk.nf = blk.plots.filter((pl) => pl.full).length;
      blk.complete = blk.nf === blk.total;
    });
    evalRes.summary.fullInsidePlotsCount = finalFullPlots.length;
    evalRes.summary.boundaryClippedPlotsCount = evalRes.allEvaluatedPlots.filter(
      (pl) => !pl.full
    ).length;
    evalRes.summary.fullOutsidePlotsCount = 0;
  }

  return {
    zone,
    south,
    epsg,
    projDef,
    bring,
    barea,
    bperim,
    bb,
    params: fallbackParams,
    u: [1, 0],
    v: [0, 1],
    c0: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2],
    angle: 0,
    nR: 1,
    nC: nCEst,
    pad: 2,
    blocks: evalRes.blocks,
    plots: finalFullPlots,
    allEvaluatedPlots: evalRes.allEvaluatedPlots,
    validHalfPlots: evalRes.validHalfPlots,
    plotValidations: evalRes.plotValidations,
    halfPlotSummary: evalRes.summary,
    sample: null,
    sampleRect: null,
    sampleNote: null,
    warnings: [
      ...evalRes.summary.boundaryValidationWarnings,
      `Lakabyada Blocks (${evalRes.blocks.length}) & Plots (${evalRes.allEvaluatedPlots.length} guud · ${finalFullPlots.length} buuxa · ${evalRes.summary.boundaryClippedPlotsCount} qayb go'an) si toos ah ayaa looga akhriyey GeoJSON-ka iyadoon geometry-ga asalka ah la beddelin.`,
    ],
    isPrebuiltGeometry: true,
    inv,
    fwd,
  };
}

export function computeLandSubdivision(
  boundaryItem: ParsedGeoItem | null | undefined,
  sampleCandidate: SampleBlockCandidate | null | undefined,
  p: SubdivisionParams,
  prebuiltSubdivision?: PrebuiltGeoJsonSubdivision | null,
  specialAreaItems?: ParsedGeoItem[]
): SubdivisionComputationResult | null {
  if (prebuiltSubdivision && prebuiltSubdivision.plots.length > 0) {
    return computePrebuiltSubdivisionResult(prebuiltSubdivision, p);
  }

  if (!boundaryItem || boundaryItem.coords.length < 3) return null;

  const ring = boundaryItem.coords.slice();
  if (
    ring.some(
      (c) =>
        !Number.isFinite(c[0]) ||
        !Number.isFinite(c[1]) ||
        Math.abs(c[0]) > 180 ||
        Math.abs(c[1]) > 90
    )
  ) {
    return null;
  }

  const last = ring[ring.length - 1];
  const first = ring[0];
  if (last[0] === first[0] && last[1] === first[1]) {
    ring.pop();
  }
  if (ring.length < 3) return null;

  let cLon = 0;
  let cLat = 0;
  ring.forEach((q) => {
    cLon += q[0];
    cLat += q[1];
  });
  cLon /= ring.length;
  cLat /= ring.length;

  const zone = Math.max(1, Math.min(60, Math.floor((cLon + 180) / 6) + 1));
  const south = cLat < 0;
  const epsg = 32600 + (south ? 100 : 0) + zone;
  const projDef = `+proj=utm +zone=${zone}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;

  const fwd = (c: Point2D): Point2D => {
    const out = proj4('EPSG:4326', projDef, [c[0], c[1]]);
    return [out[0], out[1]];
  };
  const inv = (x: Point2D): Point2D => {
    const out = proj4(projDef, 'EPSG:4326', [x[0], x[1]]);
    return [out[0], out[1]];
  };

  const bring = ring.map(fwd);
  const barea = Math.abs(shoelaceArea(bring));
  let bperim = 0;
  for (let i = 0; i < bring.length; i++) {
    const nxt = bring[(i + 1) % bring.length];
    bperim += Math.hypot(bring[i][0] - nxt[0], bring[i][1] - nxt[1]);
  }

  const bb: [number, number, number, number] = [1e18, 1e18, -1e18, -1e18];
  bring.forEach((q) => {
    bb[0] = Math.min(bb[0], q[0]);
    bb[1] = Math.min(bb[1], q[1]);
    bb[2] = Math.max(bb[2], q[0]);
    bb[3] = Math.max(bb[3], q[1]);
  });

  const warnings: string[] = [];

  // Exact HTML unclosed boundary gap check (lines 306-307)
  const gap = mdist(
    boundaryItem.coords[0],
    boundaryItem.coords[boundaryItem.coords.length - 1]
  );
  if (gap > 0.5) {
    warnings.push(
      `Xuduudka lama xirin: bilowga iyo dhammaadka waxay u dhexeeyaan ${gap.toFixed(
        1
      )} m; waxaa loo xiray xariiq toosan, tirakoobkuna wuxuu ku salaysan yahay xiridaas.`
    );
  }

  // Exact HTML boundary self-intersection count (lines 308-309)
  let selfIntersections = 0;
  const nb = bring.length;
  for (let ia = 0; ia < nb; ia++) {
    for (let ja = ia + 2; ja < nb; ja++) {
      if (ia === 0 && ja === nb - 1) continue;
      if (segmentsIntersect(bring[ia], bring[(ia + 1) % nb], bring[ja], bring[(ja + 1) % nb])) {
        selfIntersections++;
      }
    }
  }
  if (selfIntersections > 0) {
    warnings.push(
      `Xuduudka wuu is-goynayaa (${selfIntersections} meelood); tirakoobka laga yaabaa inuusan sax ahayn.`
    );
  }

  if (!isValidSubdivisionParams(p)) {
    return {
      zone,
      south,
      epsg,
      projDef,
      bring,
      barea,
      bperim,
      bb,
      params: p,
      u: [1, 0],
      v: [0, 1],
      c0: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2],
      angle: 0,
      nR: 0,
      nC: 0,
      pad: 2,
      blocks: [],
      plots: [],
      htmlHalves: [],
      htmlHalvesCounted: [],
      specialAreas: [],
      nOutPlots: 0,
      sample: null,
      sampleRect: null,
      sampleNote: null,
      warnings: [...warnings, 'Fadlan geli cabbirro sax ah oo ka weyn eber (0).'],
      inv,
      fwd,
    };
  }

  let sring: Point2D[];
  let isAutoDerived = false;
  if (sampleCandidate && sampleCandidate.ring.length >= 4) {
    sring = sampleCandidate.ring.map(fwd);
    if (
      sring.length > 3 &&
      Math.hypot(sring[0][0] - sring[sring.length - 1][0], sring[0][1] - sring[sring.length - 1][1]) < 2.5
    ) {
      sring.pop();
    }
  } else {
    isAutoDerived = true;
    const autoFr = minAreaRect(bring);
    const ux0 = autoFr.u[0];
    const uy0 = autoFr.u[1];
    const vx0 = -uy0;
    const vy0 = ux0;
    const Pt = (cu: number, cv: number): Point2D => [
      autoFr.c[0] + cu * ux0 + cv * vx0,
      autoFr.c[1] + cu * uy0 + cv * vy0,
    ];
    sring = [
      Pt(-p.L / 2, -p.W / 2),
      Pt(p.L / 2, -p.W / 2),
      Pt(p.L / 2, p.W / 2),
      Pt(-p.L / 2, p.W / 2),
    ];
    warnings.push(
      'Block tusaale gaar ah lama dooran — jihada shabakadda si toos ah ayaa looga xisaabiyey qaabka xuduudka beerta.'
    );
  }

  const fr = frameFromRing(sring);
  let ux = fr.u[0];
  let uy = fr.u[1];
  const rad = (p.rot * Math.PI) / 180;
  const ca = Math.cos(rad);
  const sa = Math.sin(rad);
  const nx = ux * ca - uy * sa;
  const ny = ux * sa + uy * ca;
  ux = nx;
  uy = ny;

  if (p.swap) {
    const tmp = ux;
    ux = -uy;
    uy = tmp;
  }
  if (ux < 0 || (Math.abs(ux) < 1e-12 && uy < 0)) {
    ux = -ux;
    uy = -uy;
  }
  let vx = -uy;
  let vy = ux;
  if (vy < 0) {
    vx = -vx;
    vy = -vy;
  }

  const c0: Point2D = [fr.c[0] + p.su * ux + p.sv * vx, fr.c[1] + p.su * uy + p.sv * vy];
  const angle = (Math.atan2(uy, ux) * 180) / Math.PI;

  const SU = p.L + p.rU;
  const SV = p.W + p.rV;
  const P = (cu: number, cv: number): Point2D => [c0[0] + cu * ux + cv * vx, c0[1] + cu * uy + cv * vy];
  const makeRect = (cu: number, cv: number, l: number, w: number): Point2D[] => [
    P(cu - l / 2, cv - w / 2),
    P(cu + l / 2, cv - w / 2),
    P(cu + l / 2, cv + w / 2),
    P(cu - l / 2, cv + w / 2),
  ];

  let us: [number, number] = [1e18, -1e18];
  let vs: [number, number] = [1e18, -1e18];
  bring.forEach((q) => {
    const du = q[0] - c0[0];
    const dv = q[1] - c0[1];
    const pu = du * ux + dv * uy;
    const pv = du * vx + dv * vy;
    us = [Math.min(us[0], pu), Math.max(us[1], pu)];
    vs = [Math.min(vs[0], pv), Math.max(vs[1], pv)];
  });

  const ci0 = Math.floor(us[0] / SU) - 1;
  const ci1 = Math.ceil(us[1] / SU) + 1;
  const rj0 = Math.floor(vs[0] / SV) - 1;
  const rj1 = Math.ceil(vs[1] / SV) + 1;

  const nC = Math.floor(p.L / p.pw + 1e-9);
  const nR = Math.floor(p.W / p.pd + 1e-9);

  if (nC < 1 || nR < 1) {
    warnings.push('Plot-ku wuu ka weyn yahay block-ka. Fadlan yaree cabbirka plot-ka ama weyneey block-ka.');
    return {
      zone,
      south,
      epsg,
      projDef,
      bring,
      barea,
      bperim,
      bb,
      params: p,
      u: [ux, uy],
      v: [vx, vy],
      c0,
      angle,
      nR,
      nC,
      pad: 2,
      blocks: [],
      plots: [],
      htmlHalves: [],
      htmlHalvesCounted: [],
      specialAreas: [],
      nOutPlots: 0,
      sample: { ring: sring, long: fr.long, short: fr.short, isAutoDerived },
      sampleRect: makeRect(0, 0, p.L, p.W),
      sampleNote: isAutoDerived ? null : { dL: fr.long - p.L, dW: fr.short - p.W },
      warnings,
      inv,
      fwd,
    };
  }

  if (Math.abs(p.L - nC * p.pw) > 0.05 || Math.abs(p.W - nR * p.pd) > 0.05) {
    warnings.push(
      `Cabbirka block-ka kuma qaybsamo plots-ka si sax ah: ${(p.L - nC * p.pw).toFixed(1)} m (dherer) iyo ${(
        p.W -
        nR * p.pd
      ).toFixed(1)} m (ballac) ayaa harsan.`
    );
  }

  // Exact HTML `shrink` + `classify(rc, rg)` (lines 334-348 of Naqshadeeyaha_Blocks_Plots_v2.html)
  const EPS = 1e-4;
  const shrinkRect = (rc: Point2D[], eps: number): Point2D[] => {
    let cx = 0;
    let cy = 0;
    rc.forEach((q) => {
      cx += q[0] / rc.length;
      cy += q[1] / rc.length;
    });
    return rc.map((q) => {
      const dx = cx - q[0];
      const dy = cy - q[1];
      const l = Math.hypot(dx, dy) || 1;
      return [q[0] + (dx / l) * eps, q[1] + (dy / l) * eps];
    });
  };

  const classifyRectUtm = (
    rc: Point2D[],
    rg: Point2D[] = bring
  ): 'full' | 'partial' | 'outside' => {
    const n = rg.length;
    if (n < 3) return 'outside';
    const s = shrinkRect(rc, EPS);
    let allIn = true;
    let anyIn = false;
    let crossed = false;
    let vin = false;
    const xs = s.map((q) => q[0]);
    const ys = s.map((q) => q[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);

    for (let i = 0; i < 4; i++) {
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
      for (let i = 0; i < 4; i++) {
        if (segmentsIntersect(s[i], s[(i + 1) % 4], a, b)) crossed = true;
      }
    }
    return allIn && !crossed && !vin ? 'full' : anyIn || crossed || vin ? 'partial' : 'outside';
  };

  const plotNominalArea = +(p.pw * p.pd).toFixed(2);
  const blockNominalArea = +(p.L * p.W).toFixed(2);

  let pad = String(nR * nC).length > 1 ? 2 : 1;
  if (nR * nC >= 100) pad = 3;

  const rawBlocks: Omit<GeneratedBlock, 'id' | 'R' | 'C'>[] = [];
  for (let ci = ci0; ci <= ci1; ci++) {
    for (let rj = rj0; rj <= rj1; rj++) {
      const cu = ci * SU;
      const cv = rj * SV;
      const blk = makeRect(cu, cv, p.L, p.W);
      const bx = blk.map((q) => q[0]);
      const by = blk.map((q) => q[1]);
      if (
        Math.max(...bx) < bb[0] ||
        Math.min(...bx) > bb[2] ||
        Math.max(...by) < bb[1] ||
        Math.min(...by) > bb[3]
      ) {
        continue;
      }

      const bPlots: GeneratedPlot[] = [];
      let nf = 0;
      let nh = 0;
      let nOutInBlock = 0;

      for (let rr = 0; rr < nR; rr++) {
        for (let cc = 0; cc < nC; cc++) {
          const pcu = cu - p.L / 2 + p.pw * (cc + 0.5);
          const pcv = cv + p.W / 2 - p.pd * (rr + 0.5);
          const pr = makeRect(pcu, pcv, p.pw, p.pd);
          const st = classifyRectUtm(pr, bring);
          const full = st === 'full';
          const pno = rr * nC + cc + 1;
          const halves: HtmlHalfPlotRecord[] = [];
          let nHalf = 0;
          let reason = '';

          if (st === 'full') {
            nf++;
          } else if (st === 'outside') {
            nOutInBlock++;
            reason = 'Plot-ku gebi ahaanba xuduudka ka baxay';
          } else {
            // Exact HTML rule (lines 362-369):
            // plots 1,5,6,10 (first/last column) -> two 18x12 halves (cut across depth)
            // plots 2,3,4,7,8,9 -> two 9x24 halves (cut across length)
            const side = cc === 0 || cc === nC - 1;
            const hl = side ? p.pw : p.pw / 2;
            const hw = side ? p.pd / 2 : p.pd;
            for (let k = 0; k < 2; k++) {
              const sg = k === 0 ? 1 : -1;
              const hr = side
                ? makeRect(pcu, pcv + (sg * hw) / 2, hl, hw)
                : makeRect(pcu - (sg * hl) / 2, pcv, hl, hw);
              const hs = classifyRectUtm(hr, bring);
              const counted = hs === 'full';
              const hCenterUtm: Point2D = [
                (hr[0][0] + hr[1][0] + hr[2][0] + hr[3][0]) / 4,
                (hr[0][1] + hr[1][1] + hr[2][1] + hr[3][1]) / 4,
              ];
              halves.push({
                id: '',
                block: '',
                parent: '',
                plotId: '',
                pno,
                n: (k + 1) as 1 | 2,
                rect: hr,
                centerUtm: hCenterUtm,
                w: hl,
                d: hw,
                hl,
                hw,
                area: +(hl * hw).toFixed(2),
                status: hs,
                counted,
                reason:
                  hs === 'full'
                    ? ''
                    : hs === 'outside'
                    ? 'Half-plot gebi ahaanba dibadda ayuu ka baxay'
                    : 'Half-plot xuduudka wuu dhaafay',
              });
            }
            nHalf = halves.filter((z) => z.counted).length;
            nh += nHalf;
            reason = nHalf
              ? `Plot-ka asalka ah lama tiriyo; waxaa la tiriyay ${nHalf} half-plot oo buuxa`
              : 'Qayb ahaan gudaha ayuu yahay, laakiin half-plot buuxa gudaha ma jiro';
          }

          const cUtm: Point2D = [
            (pr[0][0] + pr[1][0] + pr[2][0] + pr[3][0]) / 4,
            (pr[0][1] + pr[1][1] + pr[2][1] + pr[3][1]) / 4,
          ];
          bPlots.push({
            id: '',
            block: '',
            no: pno,
            r: rr + 1,
            c: cc + 1,
            rect: pr,
            centerUtm: cUtm,
            centerLonLat: inv(cUtm),
            full,
            calculatedAreaSqM: plotNominalArea,
            htmlStatus: st,
            htmlHalves: halves,
            nHalfCounted: nHalf,
            htmlReason: reason,
          });
        }
      }

      const blkCenter: Point2D = [
        (blk[0][0] + blk[1][0] + blk[2][0] + blk[3][0]) / 4,
        (blk[0][1] + blk[1][1] + blk[2][1] + blk[3][1]) / 4,
      ];
      const total = nC * nR;
      const htmlStatus: 'full' | 'partial' | 'outside' =
        nf === total ? 'full' : nOutInBlock === total ? 'outside' : 'partial';

      rawBlocks.push({
        ci,
        rj,
        rect: blk,
        centerUtm: blkCenter,
        plots: bPlots,
        nf,
        nh,
        total,
        complete: nf === total,
        isSample: ci === 0 && rj === 0,
        htmlStatus,
        calculatedAreaSqM: blockNominalArea,
      });
    }
  }

  // Exact HTML canonical R#-C# block numbering (lines 376-386):
  // blocks with `nf >= minP` anchor R1..Rn and C1..Cm; edge blocks with only counted half-plots map cleanly relative to them
  const minPThreshold = Math.max(1, Math.round(p.minP || 1));
  let baseBlocks = rawBlocks.filter((b) => b.nf >= minPThreshold);
  if (baseBlocks.length === 0) {
    baseBlocks = rawBlocks.filter((b) => b.nf > 0 || (b.nh || 0) > 0);
  }
  if (baseBlocks.length === 0) {
    baseBlocks = rawBlocks;
  }

  const rjs: number[] = [];
  const cis: number[] = [];
  baseBlocks.forEach((b) => {
    if (!rjs.includes(b.rj)) rjs.push(b.rj);
    if (!cis.includes(b.ci)) cis.push(b.ci);
  });
  rjs.sort((x, y) => y - x);
  cis.sort((x, y) => x - y);

  const mapIdx = (v: number, arr: number[], desc: boolean): number => {
    if (arr.length === 0) return 1;
    const i = arr.indexOf(v);
    if (i >= 0) return i + 1;
    const f = arr[0];
    const l = arr[arr.length - 1];
    if (desc ? v > f : v < f) return 1 - Math.abs(v - f);
    if (desc ? v < l : v > l) return arr.length + Math.abs(v - l);
    return 1 + Math.abs(v - f);
  };

  let nOutPlots = 0;
  rawBlocks.forEach((b) => {
    b.plots.forEach((q) => {
      if (q.htmlStatus === 'outside') nOutPlots++;
    });
  });

  // Keep only blocks that contain at least 1 full plot or 1 counted half-plot (exact HTML lines 389-390)
  const keptRawBlocks = rawBlocks.filter((b) => b.nf > 0 || (b.nh || 0) > 0);

  const numberedBlocks: GeneratedBlock[] = keptRawBlocks.map((b) => {
    const R = mapIdx(b.rj, rjs, true);
    const C = mapIdx(b.ci, cis, false);
    const id = `R${R}-C${C}`;
    const numberedPlots = b.plots.map((q) => {
      const pid = `${id}-P${String(q.no).padStart(pad, '0')}`;
      const numberedHalves = (q.htmlHalves || []).map((x) => ({
        ...x,
        id: `${pid}-H${x.n}`,
        block: id,
        parent: pid,
        plotId: pid,
        pno: q.no,
      }));
      return {
        ...q,
        id: pid,
        block: id,
        htmlHalves: numberedHalves,
      };
    });
    return {
      ...b,
      R,
      C,
      id,
      plots: numberedPlots,
    };
  });

  numberedBlocks.sort((x, y) => x.R - y.R || x.C - y.C);

  // Collect HTML halves (`res.halves` & `res.halvesCounted`) from plots that have `full || nHalfCounted > 0` (exact HTML lines 389-393)
  const htmlHalves: HtmlHalfPlotRecord[] = [];
  const htmlHalvesCounted: HtmlHalfPlotRecord[] = [];
  numberedBlocks.forEach((b) => {
    b.plots.forEach((q) => {
      if (q.full || (q.nHalfCounted || 0) > 0) {
        (q.htmlHalves || []).forEach((x) => {
          htmlHalves.push(x);
          if (x.counted) htmlHalvesCounted.push(x);
        });
      }
    });
  });

  // Evaluate detailed Half Plot geometry records for CAD Studio & validation tables
  const evalRes = evaluateBlocksAndHalfPlots({
    blocks: numberedBlocks,
    boundaryRingUtm: bring,
    gridU: [ux, uy],
    gridV: [vx, vy],
    nR,
    nC,
    isPrebuiltGeometry: false,
    externalWarnings: warnings,
  });

  const fullPlots =
    minPThreshold > 1
      ? evalRes.blocks
          .filter((b) => b.nf >= minPThreshold)
          .flatMap((b) => b.plots.filter((q) => q.full))
      : evalRes.fullPlots;

  // Special areas (`S.areas` in HTML lines 394-399): count FULL plots and counted half-plots lying fully inside each area (first matching area wins)
  const specialAreas: ComputedSpecialAreaSummary[] = (specialAreaItems || [])
    .filter((a) => a.coords && a.coords.length >= 3)
    .map((a) => {
      const ar = a.coords.map(fwd);
      if (
        ar.length > 3 &&
        Math.hypot(ar[0][0] - ar[ar.length - 1][0], ar[0][1] - ar[ar.length - 1][1]) < 0.01
      ) {
        ar.pop();
      }
      return {
        name: a.name,
        ring: ar,
        ringUtm: ar,
        area: Math.abs(shoelaceArea(ar)),
        nP: 0,
        nH: 0,
        aP: 0,
        aH: 0,
      };
    });

  if (specialAreas.length > 0) {
    const findMatchingSpecialArea = (rc: Point2D[]): ComputedSpecialAreaSummary | null => {
      for (let k = 0; k < specialAreas.length; k++) {
        if (classifyRectUtm(rc, specialAreas[k].ring) === 'full') {
          return specialAreas[k];
        }
      }
      return null;
    };

    fullPlots.forEach((q) => {
      const matched = findMatchingSpecialArea(q.rect);
      if (matched) {
        q.specialAreaName = matched.name;
        matched.nP++;
        matched.aP += p.pw * p.pd;
      }
    });

    htmlHalvesCounted.forEach((x) => {
      const matched = findMatchingSpecialArea(x.rect);
      if (matched) {
        x.specialAreaName = matched.name;
        matched.nH++;
        matched.aH += x.area;
      }
    });
  }

  const finalWarnings = [...evalRes.summary.boundaryValidationWarnings];
  const sampleNote = isAutoDerived ? null : { dL: fr.long - p.L, dW: fr.short - p.W };
  if (sampleNote && (Math.abs(sampleNote.dL) > 0.5 || Math.abs(sampleNote.dW) > 0.5)) {
    finalWarnings.push(
      `Block-ka tusaalaha wuxuu ahaa ~${fr.long.toFixed(1)}×${fr.short.toFixed(
        1
      )} m; waxaa loo sixay ${p.L.toFixed(1)}×${p.W.toFixed(1)} m (xudunta waa isku mid).`
    );
  }
  if (
    fullPlots.length === 0 &&
    htmlHalvesCounted.length === 0 &&
    evalRes.validHalfPlots.length === 0
  ) {
    finalWarnings.push(
      'Midna plot buuxa gudaha xuduudka kuma dhicin. Hubi cabbirrada ama block-ka tusaalaha.'
    );
  }

  return {
    zone,
    south,
    epsg,
    projDef,
    bring,
    barea,
    bperim,
    bb,
    params: p,
    u: [ux, uy],
    v: [vx, vy],
    c0,
    angle,
    nR,
    nC,
    pad,
    blocks: evalRes.blocks,
    plots: fullPlots,
    allEvaluatedPlots: evalRes.allEvaluatedPlots,
    validHalfPlots: evalRes.validHalfPlots,
    htmlHalves,
    htmlHalvesCounted,
    specialAreas,
    nOutPlots,
    plotValidations: evalRes.plotValidations,
    halfPlotSummary: evalRes.summary,
    sample: { ring: sring, long: fr.long, short: fr.short, isAutoDerived },
    sampleRect: makeRect(0, 0, p.L, p.W),
    sampleNote,
    warnings: finalWarnings,
    inv,
    fwd,
  };
}

/* ==================== 3. TIERS, ZONES, WADI & METADATA HELPERS ==================== */

export function getEffectivePlotTier(
  plot: { id: string; block: string },
  blockTiers: Record<string, AssetQualityTier>,
  plotTierOverrides: Record<string, AssetQualityTier>
): AssetQualityTier {
  if (plotTierOverrides[plot.id]) return plotTierOverrides[plot.id];
  if (blockTiers[plot.block]) return blockTiers[plot.block];
  return 'tier_1_prime';
}

export function getEffectivePlotZone(
  plot: { id: string; block: string },
  blockZones: Record<string, string>,
  plotMetadata: Record<string, PlotDetailedMetadata>,
  blockMetadata: Record<string, BlockDetailedMetadata>
): string {
  const pm = plotMetadata[plot.id];
  if (pm?.zoneOverride && pm.zoneOverride.trim()) return pm.zoneOverride.trim();
  const bm = blockMetadata[plot.block];
  if (bm?.zoneId && bm.zoneId.trim()) return bm.zoneId.trim();
  if (blockZones[plot.block]) return blockZones[plot.block];
  return 'Zone A';
}

export function getEffectivePlotMetadata(
  plot: GeneratedPlot,
  plotMetadata: Record<string, PlotDetailedMetadata>
): PlotDetailedMetadata {
  const existing = plotMetadata[plot.id];
  if (existing) return existing;
  return {
    plotId: plot.id,
    blockId: plot.block,
    wadiStatus: 'unverified',
    siteQuality: 'unverified',
    verifiedAreaSqM: null,
    verifiedPrice: null,
  };
}

export function getEffectiveBlockExclusion(
  blockId: string,
  blockMetadata: Record<string, BlockDetailedMetadata>
): { isExcluded: boolean; specialName: string } {
  const bm = blockMetadata[blockId];
  const isExcluded = Boolean(bm?.isExcludedFromDivision);
  const specialName =
    bm?.excludedSpecialName?.trim() ||
    bm?.blockName?.trim() ||
    (isExcluded ? 'Block Laga Reebay' : '');
  return { isExcluded, specialName };
}

export function getEffectivePlotExclusion(
  plot: { id: string; block: string },
  plotMetadata: Record<string, PlotDetailedMetadata>,
  blockMetadata: Record<string, BlockDetailedMetadata>
): { isExcluded: boolean; scope: 'block' | 'plot'; specialName: string } {
  const pm = plotMetadata[plot.id];
  const bm = blockMetadata[plot.block];

  if (pm?.isExcludedFromDivision === true) {
    return {
      isExcluded: true,
      scope: 'plot',
      specialName:
        pm.excludedSpecialName?.trim() ||
        pm.parcelNumberOrName?.trim() ||
        bm?.excludedSpecialName?.trim() ||
        bm?.blockName?.trim() ||
        'Plot Laga Reebay',
    };
  }

  if (pm?.isExcludedFromDivision === false) {
    return {
      isExcluded: false,
      scope: 'plot',
      specialName: pm.excludedSpecialName?.trim() || pm.parcelNumberOrName?.trim() || '',
    };
  }

  if (bm?.isExcludedFromDivision === true) {
    return {
      isExcluded: true,
      scope: 'block',
      specialName:
        pm?.excludedSpecialName?.trim() ||
        pm?.parcelNumberOrName?.trim() ||
        bm.excludedSpecialName?.trim() ||
        bm.blockName?.trim() ||
        'Block Laga Reebay',
    };
  }

  return {
    isExcluded: false,
    scope: 'plot',
    specialName: pm?.excludedSpecialName?.trim() || pm?.parcelNumberOrName?.trim() || '',
  };
}

export function buildRowBasedBlockTiers(blocks: GeneratedBlock[]): Record<string, AssetQualityTier> {
  const out: Record<string, AssetQualityTier> = {};
  if (blocks.length === 0) return out;
  const uniqueRows = Array.from(new Set(blocks.map((b) => b.R))).sort((a, b) => a - b);
  const rowCount = uniqueRows.length;

  blocks.forEach((b) => {
    const rIdx = uniqueRows.indexOf(b.R);
    if (rowCount === 1) {
      const uniqueCols = Array.from(new Set(blocks.map((x) => x.C))).sort((a, c) => a - c);
      const cIdx = uniqueCols.indexOf(b.C);
      const ratio = uniqueCols.length > 1 ? cIdx / uniqueCols.length : 0;
      out[b.id] =
        ratio < 0.34 ? 'tier_1_prime' : ratio < 0.68 ? 'tier_2_standard' : 'tier_3_basic';
    } else if (rowCount === 2) {
      out[b.id] = rIdx === 0 ? 'tier_1_prime' : 'tier_2_standard';
    } else {
      const ratio = rIdx / rowCount;
      out[b.id] =
        ratio < 0.34 ? 'tier_1_prime' : ratio < 0.68 ? 'tier_2_standard' : 'tier_3_basic';
    }
  });
  return out;
}

/**
 * Automatically partitions Blocks into Spatial Zones (Zone A, Zone B, Zone C, Zone D)
 * so no heir can monopolize one side/corner of the land.
 */
export function buildAutoBlockZones(
  blocks: GeneratedBlock[],
  mode: ZonePresetMode = 'quadrants_4'
): Record<string, string> {
  const out: Record<string, string> = {};
  if (blocks.length === 0) return out;

  const uniqueRows = Array.from(new Set(blocks.map((b) => b.R))).sort((a, b) => a - b);
  const uniqueCols = Array.from(new Set(blocks.map((b) => b.C))).sort((a, b) => a - b);
  const zoneNames = ['Zone A', 'Zone B', 'Zone C', 'Zone D'];

  if (mode === 'columns_4' || (mode === 'quadrants_4' && uniqueRows.length === 1)) {
    const n = uniqueCols.length;
    blocks.forEach((b) => {
      const cIdx = uniqueCols.indexOf(b.C);
      const bucket = Math.min(3, Math.floor((cIdx / Math.max(1, n)) * Math.min(4, n)));
      out[b.id] = zoneNames[bucket];
    });
    return out;
  }

  if (mode === 'rows_4' || (mode === 'quadrants_4' && uniqueCols.length === 1)) {
    const n = uniqueRows.length;
    blocks.forEach((b) => {
      const rIdx = uniqueRows.indexOf(b.R);
      const bucket = Math.min(3, Math.floor((rIdx / Math.max(1, n)) * Math.min(4, n)));
      out[b.id] = zoneNames[bucket];
    });
    return out;
  }

  // Default: 4-Quadrant Geographic Split (NW = Zone A, NE = Zone B, SW = Zone C, SE = Zone D)
  const midRow = uniqueRows.length / 2;
  const midCol = uniqueCols.length / 2;
  blocks.forEach((b) => {
    const rIdx = uniqueRows.indexOf(b.R);
    const cIdx = uniqueCols.indexOf(b.C);
    const isBottom = rIdx >= midRow;
    const isRight = cIdx >= midCol;
    if (!isBottom && !isRight) out[b.id] = 'Zone A';
    else if (!isBottom && isRight) out[b.id] = 'Zone B';
    else if (isBottom && !isRight) out[b.id] = 'Zone C';
    else out[b.id] = 'Zone D';
  });

  return out;
}

/**
 * Geometric Wadi (Doox) Analyzer (Section 5):
 * Uses uploaded GIS Wadi LineString/Polygon items to classify each plot's Wadi relationship
 * WITHOUT mutating geometry or automatically assuming poor soil quality.
 */
export function detectWadiStatusFromGeoItems(
  subdivision: SubdivisionComputationResult,
  wadiItems: ParsedGeoItem[],
  nearbyThresholdMeters = 28
): Record<string, WadiStatus> {
  const result: Record<string, WadiStatus> = {};
  if (!wadiItems || wadiItems.length === 0) return result;

  const projectedWadis = wadiItems.map((it) => ({
    type: it.type,
    pts: it.coords.map((c) => subdivision.fwd(c)),
  }));

  subdivision.plots.forEach((plot) => {
    let intersectedEdges = 0;
    let centerInsideWadiPoly = false;
    let vertexInsideWadiPoly = 0;
    let minDist = 1e18;

    const pRect = plot.rect;
    const nP = pRect.length;

    projectedWadis.forEach((w) => {
      const wPts = w.pts;
      if (wPts.length < 2) return;

      if (w.type === 'Polygon' && wPts.length >= 3) {
        if (pointInPolygon(plot.centerUtm, wPts)) {
          centerInsideWadiPoly = true;
        }
        pRect.forEach((v) => {
          if (pointInPolygon(v, wPts)) vertexInsideWadiPoly++;
        });
      }

      const segCount = w.type === 'Polygon' ? wPts.length : wPts.length - 1;
      for (let i = 0; i < segCount; i++) {
        const a = wPts[i];
        const b = wPts[(i + 1) % wPts.length];

        for (let e = 0; e < nP; e++) {
          const p1 = pRect[e];
          const p2 = pRect[(e + 1) % nP];
          if (segmentsIntersect(p1, p2, a, b)) {
            intersectedEdges++;
          }
          minDist = Math.min(minDist, pointToSegmentDist(p1, a, b));
        }
        minDist = Math.min(minDist, pointToSegmentDist(a, pRect[0], pRect[1]));
        minDist = Math.min(minDist, pointToSegmentDist(plot.centerUtm, a, b));
      }

      wPts.forEach((wp) => {
        if (pointInPolygon(wp, pRect)) {
          intersectedEdges++;
        }
      });
    });

    if (centerInsideWadiPoly || intersectedEdges >= 2 || vertexInsideWadiPoly >= 2) {
      result[plot.id] = 'cuts_through';
    } else if (intersectedEdges === 1 || vertexInsideWadiPoly === 1) {
      result[plot.id] = 'partial';
    } else if (minDist <= nearbyThresholdMeters) {
      result[plot.id] = 'nearby';
    } else {
      result[plot.id] = 'none';
    }
  });

  return result;
}

/* ==================== 4. BULK CSV & GEOJSON METADATA IMPORT WITH CONFLICT DETECTION ==================== */

function normalizeWadiCode(val: unknown): WadiStatus | undefined {
  if (val == null || val === '') return undefined;
  const s = String(val).trim().toLowerCase();
  if (s.includes('dhex') || s === 'cuts_through' || s === 'doox_dhex' || s === 'through') {
    return 'cuts_through';
  }
  if (s.includes('qayb') || s === 'partial' || s === 'doox_qayb') return 'partial';
  if (s.includes('dhow') || s === 'nearby' || s === 'near' || s === 'doox_dhow') return 'nearby';
  if (s.includes('kuma') || s === 'none' || s === 'no' || s === 'maya' || s === 'doox_maya') {
    return 'none';
  }
  if (s.includes('lama') || s === 'unverified') return 'unverified';
  return undefined;
}

function normalizeSiteQualityCode(val: unknown): SiteQualityRating | undefined {
  if (val == null || val === '') return undefined;
  const s = String(val).trim().toLowerCase();
  if (s.includes('aad') || s === 'very_good' || s === 'excellent') return 'very_good';
  if (s.includes('wanaag') || s === 'good') return 'good';
  if (s.includes('dhex') || s === 'medium' || s === 'average' || s === 'standard') return 'medium';
  if (s.includes('liid') || s === 'poor' || s === 'low' || s === 'bad') return 'poor';
  if (s.includes('lama') || s === 'unverified') return 'unverified';
  return undefined;
}

function normalizeTierCode(val: unknown): AssetQualityTier | undefined {
  if (val == null || val === '') return undefined;
  const s = String(val).trim().toLowerCase();
  if (s === 'h1' || s.includes('1aad') || s.includes('prime') || s.includes('fiican')) {
    return 'tier_1_prime';
  }
  if (s === 'h2' || s.includes('2aad') || s.includes('standard') || s.includes('dhexe')) {
    return 'tier_2_standard';
  }
  if (s === 'h3' || s.includes('3aad') || s.includes('basic') || s.includes('hoose')) {
    return 'tier_3_basic';
  }
  return undefined;
}

function detectCsvDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;
  candidates.forEach((delim) => {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < headerLine.length; i++) {
      const ch = headerLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === delim && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = delim;
    }
  });
  return best;
}

function parseCsvLine(line: string, delimiter = ','): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function getCsvRowField(row: Record<string, unknown>, ...keys: string[]): unknown {
  const rowKeys = Object.keys(row);
  for (const k of keys) {
    const normTarget = k.toLowerCase().replace(/[\s_-]+/g, '');
    const matchKey = rowKeys.find(
      (rk) => rk.toLowerCase().replace(/[\s_-]+/g, '') === normTarget
    );
    if (matchKey && row[matchKey] !== undefined && String(row[matchKey]).trim() !== '') {
      return row[matchKey];
    }
  }
  return undefined;
}

/**
 * Parses CSV divisibility / exclusion fields in Somali or English.
 * Returns `true` if EXCLUDED from inheritance division, `false` if DIVISIBLE, or `undefined` if not specified.
 */
function parseDivisionExclusionFromRow(row: Record<string, unknown>): boolean | undefined {
  const divisibleRaw = getCsvRowField(
    row,
    'La_Qaybin_Karo',
    'La_Qaybinayo',
    'Qaybinta_Dhaxalka',
    'Qaybinta',
    'Divisible',
    'Is_Divisible',
    'Include_In_Division',
    'Included',
    'For_Division',
    'Xaaladda_Qaybinta',
    'Nooca_Qaybinta',
    'Division_Status'
  );

  if (divisibleRaw !== undefined) {
    const s = String(divisibleRaw).trim().toLowerCase();
    if (
      s === 'maya' ||
      s === 'no' ||
      s === 'false' ||
      s === '0' ||
      s === 'n' ||
      s === 'f' ||
      s.includes('reeb') ||
      s.includes('exclud') ||
      s.includes('aan la qaybin') ||
      s.includes('lama qaybinayo') ||
      s.includes('non-divisible') ||
      s.includes('not_divisible') ||
      s.includes('waqf') ||
      s.includes('danguud') ||
      s.includes('reserved')
    ) {
      return true;
    }
    if (
      s === 'haa' ||
      s === 'yes' ||
      s === 'true' ||
      s === '1' ||
      s === 'y' ||
      s === 't' ||
      s.includes('la qaybin') ||
      s.includes('la_qaybin') ||
      s.includes('divisible') ||
      s.includes('included') ||
      s.includes('dhaxal')
    ) {
      return false;
    }
  }

  const excludedRaw = getCsvRowField(
    row,
    'Laga_Reebay',
    'Reeban',
    'Excluded',
    'Is_Excluded',
    'Exclude_From_Division',
    'Ka_Reeb'
  );

  if (excludedRaw !== undefined) {
    const s = String(excludedRaw).trim().toLowerCase();
    if (
      s === 'haa' ||
      s === 'yes' ||
      s === 'true' ||
      s === '1' ||
      s === 'y' ||
      s === 't' ||
      s.includes('reeb') ||
      s.includes('exclud')
    ) {
      return true;
    }
    if (
      s === 'maya' ||
      s === 'no' ||
      s === 'false' ||
      s === '0' ||
      s === 'n' ||
      s === 'f' ||
      s.includes('divisible') ||
      s.includes('la qaybin')
    ) {
      return false;
    }
  }

  // Also check generic Status / Alloc_Type if exported from our own register
  const allocOrStatus = getCsvRowField(row, 'Allocation_Type', 'Alloc_Type', 'Status');
  if (allocOrStatus !== undefined) {
    const s = String(allocOrStatus).trim().toLowerCase();
    if (s === 'excluded' || s.includes('reeb')) return true;
  }

  return undefined;
}

/**
 * Synthesizes a clean GIS Blocks & Plots layout (`PrebuiltGeoJsonSubdivision`) directly from CSV rows
 * when the case has no map geometry yet or when importing custom Block/Plot IDs.
 */
export function buildPrebuiltSubdivisionFromCsvRecords(
  rawRows: Record<string, unknown>[],
  sourceName: string,
  params: SubdivisionParams
): PrebuiltGeoJsonSubdivision | null {
  if (!rawRows || rawRows.length === 0) return null;

  interface TempPlotSpec {
    id: string;
    blockId: string;
    no: number;
    widthM: number;
    depthM: number;
    rawProps: Record<string, unknown>;
  }

  interface TempBlockSpec {
    id: string;
    R?: number;
    C?: number;
    plotsCountHint?: number;
    rawProps: Record<string, unknown>;
    plots: TempPlotSpec[];
  }

  const blocksMap = new Map<string, TempBlockSpec>();
  const seenPlotIds = new Set<string>();

  const defaultPw = params.pw > 0 ? params.pw : 18;
  const defaultPd = params.pd > 0 ? params.pd : 24;

  rawRows.forEach((row) => {
    const recTypeRaw = String(
      getCsvRowField(row, 'Nooca_Diiwaanka', 'Record_Type', 'Nooca', 'Type', 'Feature_Type') || ''
    )
      .trim()
      .toLowerCase();

    const rawPlotId = String(getCsvRowField(row, 'Plot_ID', 'PlotId', 'Parcel_ID') || '').trim();
    let rawBlockId = String(
      getCsvRowField(row, 'Block_ID', 'BlockId', 'Block', 'Blk_ID') || ''
    ).trim();
    const rawPlotNoVal = getCsvRowField(row, 'Plot_No', 'PlotNumber', 'Tirada_Plot', 'No');
    const parsedPlotNo = rawPlotNoVal !== undefined ? Number(rawPlotNoVal) : NaN;

    const isExplicitBlock =
      recTypeRaw === 'block' ||
      recTypeRaw === 'baloog' ||
      (!rawPlotId && Boolean(rawBlockId) && !Number.isFinite(parsedPlotNo));

    if (isExplicitBlock && rawBlockId) {
      const existing = blocksMap.get(rawBlockId) || {
        id: rawBlockId,
        rawProps: { ...row },
        plots: [],
      };
      existing.rawProps = { ...existing.rawProps, ...row };
      const rVal = Number(getCsvRowField(row, 'Row', 'Saf'));
      const cVal = Number(getCsvRowField(row, 'Col', 'Column', 'Tiir'));
      const pCountVal = Number(
        getCsvRowField(row, 'Plots_Count', 'Plots_full', 'Plots_tot', 'Tirada_Plots')
      );
      if (Number.isFinite(rVal) && rVal > 0) existing.R = Math.round(rVal);
      if (Number.isFinite(cVal) && cVal > 0) existing.C = Math.round(cVal);
      if (Number.isFinite(pCountVal) && pCountVal > 0) {
        existing.plotsCountHint = Math.min(40, Math.max(1, Math.round(pCountVal)));
      }
      blocksMap.set(rawBlockId, existing);
      return;
    }

    // Plot row
    if (!rawPlotId && !rawBlockId) return;
    if (!rawBlockId && rawPlotId) {
      const m = rawPlotId.match(/^(.+)-P\d+$/i);
      rawBlockId = m ? m[1] : 'B-01';
    }
    const blkSpec = blocksMap.get(rawBlockId) || {
      id: rawBlockId,
      rawProps: {},
      plots: [],
    };
    blocksMap.set(rawBlockId, blkSpec);

    const pNo =
      Number.isFinite(parsedPlotNo) && parsedPlotNo > 0
        ? Math.round(parsedPlotNo)
        : blkSpec.plots.length + 1;
    const plotId =
      rawPlotId || `${rawBlockId}-P${String(pNo).padStart(2, '0')}`;
    if (seenPlotIds.has(plotId)) return;
    seenPlotIds.add(plotId);

    const wVal = Number(getCsvRowField(row, 'Width_m', 'W_m', 'Ballaca_m'));
    const dVal = Number(getCsvRowField(row, 'Depth_m', 'D_m', 'Dhererka_m'));

    blkSpec.plots.push({
      id: plotId,
      blockId: rawBlockId,
      no: pNo,
      widthM: Number.isFinite(wVal) && wVal > 2 ? wVal : defaultPw,
      depthM: Number.isFinite(dVal) && dVal > 2 ? dVal : defaultPd,
      rawProps: { ...row },
    });
  });

  // If a block was declared as a Block row without explicit Plot rows, synthesize plots inside it
  blocksMap.forEach((blk) => {
    if (blk.plots.length === 0) {
      const count = blk.plotsCountHint || Math.max(1, Math.round((params.L / defaultPw) * (params.W / defaultPd)) || 10);
      for (let k = 1; k <= count; k++) {
        const pid = `${blk.id}-P${String(k).padStart(2, '0')}`;
        if (!seenPlotIds.has(pid)) {
          seenPlotIds.add(pid);
          blk.plots.push({
            id: pid,
            blockId: blk.id,
            no: k,
            widthM: defaultPw,
            depthM: defaultPd,
            rawProps: {},
          });
        }
      }
    }
  });

  const blockList = Array.from(blocksMap.values()).filter((b) => b.plots.length > 0);
  if (blockList.length === 0) return null;

  // Determine grid R, C for each block (parse R1-C2 if present, otherwise neat grid)
  const colsPerGridRow = Math.max(1, Math.ceil(Math.sqrt(blockList.length)));
  blockList.forEach((blk, idx) => {
    if (!blk.R || !blk.C) {
      const rcMatch = blk.id.match(/R(\d+)\D+C(\d+)/i);
      if (rcMatch) {
        blk.R = Number(rcMatch[1]);
        blk.C = Number(rcMatch[2]);
      } else {
        blk.R = Math.floor(idx / colsPerGridRow) + 1;
        blk.C = (idx % colsPerGridRow) + 1;
      }
    }
  });

  blockList.sort((a, b) => (a.R || 1) - (b.R || 1) || (a.C || 1) - (b.C || 1));

  // Project around Hargeisa UTM Zone 38N (EPSG:32638) so meters map cleanly to WGS84 Lon/Lat
  const baseLon = 44.065;
  const baseLat = 9.56;
  const zone = 38;
  const projDef = `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`;
  const originUtm = proj4('EPSG:4326', projDef, [baseLon, baseLat]) as [number, number];
  const invToWgs = (x: number, y: number): Point2D => {
    const out = proj4(projDef, 'EPSG:4326', [x, y]);
    return [+out[0].toFixed(8), +out[1].toFixed(8)];
  };

  const roadU = params.rU > 0 ? params.rU : 10;
  const roadV = params.rV > 0 ? params.rV : 8;

  const uniqueRows = Array.from(new Set(blockList.map((b) => b.R || 1))).sort((a, b) => a - b);
  const uniqueCols = Array.from(new Set(blockList.map((b) => b.C || 1))).sort((a, b) => a - b);

  // Determine max block footprint so grid cells never overlap
  let maxPlotsInAnyBlock = 1;
  blockList.forEach((b) => {
    maxPlotsInAnyBlock = Math.max(maxPlotsInAnyBlock, b.plots.length);
  });
  const plotsPerBlockRow = Math.max(1, Math.ceil(maxPlotsInAnyBlock / 2));
  const blockSpanX = plotsPerBlockRow * defaultPw;
  const blockSpanY = (maxPlotsInAnyBlock > 1 ? 2 : 1) * defaultPd;

  const builtBlocks: PrebuiltGeoJsonSubdivision['blocks'] = [];
  const builtPlots: PrebuiltGeoJsonSubdivision['plots'] = [];

  let minX = 1e18;
  let minY = 1e18;
  let maxX = -1e18;
  let maxY = -1e18;

  blockList.forEach((blk) => {
    const rIdx = uniqueRows.indexOf(blk.R || 1);
    const cIdx = uniqueCols.indexOf(blk.C || 1);

    const bx0 = originUtm[0] + cIdx * (blockSpanX + roadU);
    // Top-to-bottom rows: higher R goes south (smaller Y in UTM)
    const byTop = originUtm[1] - rIdx * (blockSpanY + roadV);

    const nPlots = blk.plots.length;
    const colsInThisBlk = nPlots > 1 ? Math.ceil(nPlots / 2) : 1;
    const rowsInThisBlk = nPlots > 1 ? 2 : 1;
    const actualBlkW = colsInThisBlk * defaultPw;
    const actualBlkH = rowsInThisBlk * defaultPd;
    const by0 = byTop - actualBlkH;

    minX = Math.min(minX, bx0);
    minY = Math.min(minY, by0);
    maxX = Math.max(maxX, bx0 + actualBlkW);
    maxY = Math.max(maxY, byTop);

    const blkRingUtm: [number, number][] = [
      [bx0, by0],
      [bx0 + actualBlkW, by0],
      [bx0 + actualBlkW, byTop],
      [bx0, byTop],
    ];

    builtBlocks.push({
      id: blk.id,
      R: blk.R || rIdx + 1,
      C: blk.C || cIdx + 1,
      ringLonLat: blkRingUtm.map(([x, y]) => invToWgs(x, y)),
      rawProperties: blk.rawProps,
    });

    blk.plots
      .slice()
      .sort((a, b) => a.no - b.no)
      .forEach((pl, pIdx) => {
        const pr = Math.floor(pIdx / colsInThisBlk); // 0 = top row, 1 = bottom row
        const pc = pIdx % colsInThisBlk;
        const px0 = bx0 + pc * defaultPw;
        const pyTop = byTop - pr * defaultPd;
        const py0 = pyTop - defaultPd;

        const plRingUtm: [number, number][] = [
          [px0, py0],
          [px0 + defaultPw, py0],
          [px0 + defaultPw, pyTop],
          [px0, pyTop],
        ];

        builtPlots.push({
          id: pl.id,
          blockId: blk.id,
          no: pl.no,
          ringLonLat: plRingUtm.map(([x, y]) => invToWgs(x, y)),
          rawProperties: pl.rawProps,
        });
      });
  });

  const padM = 14;
  const boundaryRingLonLat: Point2D[] = [
    invToWgs(minX - padM, minY - padM),
    invToWgs(maxX + padM, minY - padM),
    invToWgs(maxX + padM, maxY + padM),
    invToWgs(minX - padM, maxY + padM),
  ];

  return {
    sourceFileName: sourceName,
    detectedCrs: 'CSV Synthesized Grid (WGS84 / UTM 38N)',
    boundaryRingLonLat,
    blocks: builtBlocks,
    plots: builtPlots,
    validationWarnings: [],
  };
}

export function prepareBulkMetadataImportFromRecords(
  rawRows: Record<string, unknown>[],
  sourceName: string,
  subdivision: SubdivisionComputationResult | null,
  currentState: LandSubdivisionState
): PendingBulkMetadataImport {
  // Synthesize fallback layout from CSV in case map is empty OR none of the CSV IDs match current map
  const candidateSynthesized = buildPrebuiltSubdivisionFromCsvRecords(
    rawRows,
    sourceName,
    currentState.params
  );

  // Build ID lookup tables from existing subdivision (or from synthesized layout if map is empty)
  const useSynthesizedAsPrimary = !subdivision || subdivision.plots.length === 0;
  const activePlotsList: { id: string; block: string; no: number }[] = useSynthesizedAsPrimary
    ? (candidateSynthesized?.plots || []).map((p) => ({
        id: p.id,
        block: p.blockId,
        no: p.no,
      }))
    : [
        ...subdivision.plots.map((p) => ({ id: p.id, block: p.block, no: p.no })),
        ...(subdivision.allEvaluatedPlots || []).map((p) => ({
          id: p.id,
          block: p.block,
          no: p.no,
        })),
      ];

  const activeBlocksList: string[] = useSynthesizedAsPrimary
    ? (candidateSynthesized?.blocks || []).map((b) => b.id)
    : subdivision.blocks.map((b) => b.id);

  const canonicalPlotIdByLower = new Map<string, string>();
  const plotBlockLookup: Record<string, string> = {};
  const plotByBlockAndNo = new Map<string, string>();

  activePlotsList.forEach((p) => {
    canonicalPlotIdByLower.set(p.id.toLowerCase(), p.id);
    plotBlockLookup[p.id] = p.block;
    plotByBlockAndNo.set(`${p.block.toLowerCase()}::${p.no}`, p.id);
    // Also index unpadded variant e.g. R1-C1-P01 -> r1-c1-p1
    const unpadded = p.id.replace(/-P0+(\d+)$/i, '-P$1').toLowerCase();
    if (!canonicalPlotIdByLower.has(unpadded)) {
      canonicalPlotIdByLower.set(unpadded, p.id);
    }
  });

  const canonicalBlockIdByLower = new Map<string, string>();
  activeBlocksList.forEach((bid) => {
    canonicalBlockIdByLower.set(bid.toLowerCase(), bid);
  });

  const resolvePlotId = (rawPid: string, rawBid: string, rawNo: unknown): string | null => {
    if (rawPid) {
      const direct = canonicalPlotIdByLower.get(rawPid.toLowerCase());
      if (direct) return direct;
    }
    if (rawBid && rawNo !== undefined && String(rawNo).trim() !== '') {
      const n = Number(rawNo);
      if (Number.isFinite(n)) {
        const byNo = plotByBlockAndNo.get(`${rawBid.toLowerCase()}::${Math.round(n)}`);
        if (byNo) return byNo;
      }
    }
    return null;
  };

  const resolveBlockId = (rawBid: string): string | null => {
    if (!rawBid) return null;
    return canonicalBlockIdByLower.get(rawBid.toLowerCase()) || null;
  };

  const extractAgainstTarget = (
    plotResolver: (rawPid: string, rawBid: string, rawNo: unknown) => string | null,
    blockResolver: (rawBid: string) => string | null,
    plotToBlk: Record<string, string>
  ) => {
    const seenIds = new Set<string>();
    const duplicateIdsInFile: string[] = [];
    const unmatchedIds: string[] = [];
    const conflicts: MetadataConflictItem[] = [];

    const incomingPlotMetadata: Record<string, Partial<PlotDetailedMetadata>> = {};
    const incomingBlockMetadata: Record<string, Partial<BlockDetailedMetadata>> = {};
    const incomingPlotTiers: Record<string, AssetQualityTier> = {};
    const incomingBlockTiers: Record<string, AssetQualityTier> = {};
    const incomingBlockZones: Record<string, string> = {};

    let excludedPlotsCount = 0;
    let excludedBlocksCount = 0;

    rawRows.forEach((row) => {
      const getField = (...keys: string[]) => getCsvRowField(row, ...keys);

      const recTypeRaw = String(
        getField('Nooca_Diiwaanka', 'Record_Type', 'Nooca', 'Type', 'Feature_Type') || ''
      )
        .trim()
        .toLowerCase();

      const rawPlotId = String(getField('Plot_ID', 'PlotId', 'Parcel_ID', 'ID') || '').trim();
      const rawBlockId = String(
        getField('Block_ID', 'BlockId', 'Block', 'Blk_ID') || ''
      ).trim();
      const rawPlotNo = getField('Plot_No', 'PlotNumber', 'Tirada_Plot', 'No');

      const exclusionFlag = parseDivisionExclusionFromRow(row);
      const specialNameRaw = getField(
        'Magaca_Gaarka_Ah',
        'Magaca_Gaarka',
        'Special_Name',
        'Custom_Name',
        'Excluded_Name',
        'Magaca'
      );

      const isBlockRow =
        recTypeRaw === 'block' ||
        recTypeRaw === 'baloog' ||
        (!rawPlotId && Boolean(rawBlockId) && (rawPlotNo === undefined || String(rawPlotNo).trim() === ''));

      if (!isBlockRow && (rawPlotId || (rawBlockId && rawPlotNo !== undefined))) {
        const dedupeKey = rawPlotId || `${rawBlockId}#${rawPlotNo}`;
        if (seenIds.has(`P::${dedupeKey}`)) {
          duplicateIdsInFile.push(dedupeKey);
        }
        seenIds.add(`P::${dedupeKey}`);

        const matchedPlotId = plotResolver(rawPlotId, rawBlockId, rawPlotNo);
        if (!matchedPlotId) {
          unmatchedIds.push(dedupeKey);
          return;
        }

        const patch: Partial<PlotDetailedMetadata> = {
          plotId: matchedPlotId,
          blockId: plotToBlk[matchedPlotId] || rawBlockId,
        };

        if (exclusionFlag !== undefined) {
          patch.isExcludedFromDivision = exclusionFlag;
          if (exclusionFlag) excludedPlotsCount++;
        }

        const parcelName = getField('Parcel_Name', 'Magaca_Dhulka', 'Label');
        if (specialNameRaw !== undefined) {
          const cleanSpec = String(specialNameRaw).trim();
          patch.excludedSpecialName = cleanSpec;
          if (!parcelName && cleanSpec) patch.parcelNumberOrName = cleanSpec;
        }
        if (parcelName !== undefined) {
          patch.parcelNumberOrName = String(parcelName).trim();
          if (patch.excludedSpecialName === undefined && exclusionFlag === true) {
            patch.excludedSpecialName = String(parcelName).trim();
          }
        }

        const wadi = normalizeWadiCode(
          getField('Wadi_Status', 'Wadi_Stat', 'Dooxa', 'Xaaladda_Dooxa')
        );
        if (wadi) patch.wadiStatus = wadi;

        const qual = normalizeSiteQualityCode(
          getField('Site_Quality', 'Site_Qual', 'Tayada', 'Tayada_Goobta')
        );
        if (qual) patch.siteQuality = qual;

        const verAreaRaw = getField('Verified_Area_m2', 'Verif_m2', 'Bedka_Xaqiijiyey');
        if (verAreaRaw !== undefined && Number(verAreaRaw) > 0) {
          const num = Number(verAreaRaw);
          if (Number.isFinite(num) && num > 0) patch.verifiedAreaSqM = num;
        }

        const verPriceRaw = getField('Verified_Price', 'Verif_Val', 'Price', 'Qiimaha');
        if (verPriceRaw !== undefined && Number(verPriceRaw) >= 0) {
          const num = Number(verPriceRaw);
          if (Number.isFinite(num) && num >= 0) patch.verifiedPrice = num;
        }

        const zoneVal = getField('Zone_ID', 'Zone', 'Aagga');
        if (zoneVal !== undefined) patch.zoneOverride = String(zoneVal).trim();

        const surf = getField('Surface', 'Oogada', 'Surface_Condition');
        if (surf !== undefined) patch.surfaceCondition = String(surf).trim();

        const landUse = getField('Land_Use', 'Isticmaalka', 'Shape_Use');
        if (landUse !== undefined) patch.shapeAndLandUse = String(landUse).trim();

        const restr = getField('Restrictions', 'Xaddidaadaha');
        if (restr !== undefined) patch.usageRestrictions = String(restr).trim();

        const notes = getField('Notes', 'Faahfaahin', 'Description');
        if (notes !== undefined) patch.notes = String(notes).trim();

        const tierVal = normalizeTierCode(getField('Tier_Code', 'Tier', 'Heerka'));
        if (tierVal) {
          incomingPlotTiers[matchedPlotId] = tierVal;
        }

        const prev = currentState.plotMetadata[matchedPlotId];
        if (prev) {
          if (
            patch.isExcludedFromDivision !== undefined &&
            prev.isExcludedFromDivision !== undefined &&
            prev.isExcludedFromDivision !== patch.isExcludedFromDivision
          ) {
            conflicts.push({
              targetType: 'plot',
              id: matchedPlotId,
              field: 'Qaybinta Dhaxalka',
              existingValue: prev.isExcludedFromDivision ? 'Laga Reebay' : 'La Qaybinayo',
              incomingValue: patch.isExcludedFromDivision ? 'Laga Reebay' : 'La Qaybinayo',
            });
          }
          if (
            patch.wadiStatus &&
            prev.wadiStatus !== 'unverified' &&
            prev.wadiStatus !== patch.wadiStatus
          ) {
            conflicts.push({
              targetType: 'plot',
              id: matchedPlotId,
              field: 'Xaaladda Dooxa',
              existingValue: WADI_STATUS_METADATA[prev.wadiStatus].shortSomali,
              incomingValue: WADI_STATUS_METADATA[patch.wadiStatus].shortSomali,
            });
          }
          if (
            patch.verifiedPrice != null &&
            prev.verifiedPrice != null &&
            Math.abs(prev.verifiedPrice - patch.verifiedPrice) > 0.01
          ) {
            conflicts.push({
              targetType: 'plot',
              id: matchedPlotId,
              field: 'Qiimaha La Xaqiijiyey',
              existingValue: String(prev.verifiedPrice),
              incomingValue: String(patch.verifiedPrice),
            });
          }
          if (
            patch.verifiedAreaSqM != null &&
            prev.verifiedAreaSqM != null &&
            Math.abs(prev.verifiedAreaSqM - patch.verifiedAreaSqM) > 0.05
          ) {
            conflicts.push({
              targetType: 'plot',
              id: matchedPlotId,
              field: 'Bedka La Xaqiijiyey (m²)',
              existingValue: String(prev.verifiedAreaSqM),
              incomingValue: String(patch.verifiedAreaSqM),
            });
          }
        }

        incomingPlotMetadata[matchedPlotId] = patch;
      } else if (rawBlockId) {
        if (seenIds.has(`B::${rawBlockId}`)) {
          duplicateIdsInFile.push(rawBlockId);
        }
        seenIds.add(`B::${rawBlockId}`);

        const matchedBlockId = blockResolver(rawBlockId);
        if (!matchedBlockId) {
          unmatchedIds.push(rawBlockId);
          return;
        }

        const zoneVal = getField('Zone_ID', 'Zone', 'Aagga');
        const bNotes = getField('Notes', 'Faahfaahin', 'Description');
        const bCond = getField('Condition', 'Xaaladda_Guud');
        const bName = getField('Block_Name', 'Magaca_Block', 'Label');
        const bTier = normalizeTierCode(getField('Tier_Code', 'Tier', 'Heerka'));

        if (zoneVal) incomingBlockZones[matchedBlockId] = String(zoneVal).trim();
        if (bTier) incomingBlockTiers[matchedBlockId] = bTier;
        if (exclusionFlag) excludedBlocksCount++;

        const resolvedSpecialName =
          specialNameRaw !== undefined
            ? String(specialNameRaw).trim()
            : bName !== undefined && exclusionFlag === true
            ? String(bName).trim()
            : undefined;

        const prevBlk = currentState.blockMetadata[matchedBlockId];
        if (
          prevBlk &&
          exclusionFlag !== undefined &&
          prevBlk.isExcludedFromDivision !== undefined &&
          prevBlk.isExcludedFromDivision !== exclusionFlag
        ) {
          conflicts.push({
            targetType: 'block',
            id: matchedBlockId,
            field: 'Qaybinta Block-ga',
            existingValue: prevBlk.isExcludedFromDivision ? 'Laga Reebay' : 'La Qaybinayo',
            incomingValue: exclusionFlag ? 'Laga Reebay' : 'La Qaybinayo',
          });
        }

        incomingBlockMetadata[matchedBlockId] = {
          blockId: matchedBlockId,
          ...(bName !== undefined
            ? { blockName: String(bName).trim() }
            : resolvedSpecialName
            ? { blockName: resolvedSpecialName }
            : {}),
          ...(exclusionFlag !== undefined ? { isExcludedFromDivision: exclusionFlag } : {}),
          ...(resolvedSpecialName !== undefined ? { excludedSpecialName: resolvedSpecialName } : {}),
          ...(zoneVal ? { zoneId: String(zoneVal).trim() } : {}),
          ...(bCond ? { generalCondition: String(bCond).trim() } : {}),
          ...(bNotes ? { notes: String(bNotes).trim() } : {}),
        };
      }
    });

    return {
      matchedPlotCount: Object.keys(incomingPlotMetadata).length,
      matchedBlockCount: Object.keys(incomingBlockMetadata).length,
      excludedPlotsInImportCount: excludedPlotsCount,
      excludedBlocksInImportCount: excludedBlocksCount,
      unmatchedIds,
      duplicateIdsInFile,
      conflicts,
      incomingPlotMetadata,
      incomingBlockMetadata,
      incomingPlotTiers,
      incomingBlockTiers,
      incomingBlockZones,
    };
  };

  const primaryRes = extractAgainstTarget(resolvePlotId, resolveBlockId, plotBlockLookup);

  // If existing map had 0 matches AND CSV can synthesize its own Blocks & Plots layout, extract against synthesized IDs!
  if (
    !useSynthesizedAsPrimary &&
    primaryRes.matchedPlotCount === 0 &&
    primaryRes.matchedBlockCount === 0 &&
    candidateSynthesized &&
    candidateSynthesized.plots.length > 0
  ) {
    const synthPlotByLower = new Map<string, string>();
    const synthPlotToBlk: Record<string, string> = {};
    const synthPlotByBlkNo = new Map<string, string>();
    candidateSynthesized.plots.forEach((p) => {
      synthPlotByLower.set(p.id.toLowerCase(), p.id);
      synthPlotToBlk[p.id] = p.blockId;
      synthPlotByBlkNo.set(`${p.blockId.toLowerCase()}::${p.no}`, p.id);
    });
    const synthBlkByLower = new Map<string, string>();
    candidateSynthesized.blocks.forEach((b) => synthBlkByLower.set(b.id.toLowerCase(), b.id));

    const synthRes = extractAgainstTarget(
      (rawPid, rawBid, rawNo) => {
        if (rawPid && synthPlotByLower.has(rawPid.toLowerCase())) {
          return synthPlotByLower.get(rawPid.toLowerCase()) || null;
        }
        if (rawBid && rawNo !== undefined && Number.isFinite(Number(rawNo))) {
          return synthPlotByBlkNo.get(`${rawBid.toLowerCase()}::${Math.round(Number(rawNo))}`) || null;
        }
        return null;
      },
      (rawBid) => synthBlkByLower.get(rawBid.toLowerCase()) || null,
      synthPlotToBlk
    );

    return {
      sourceName,
      ...synthRes,
      synthesizedPrebuiltFromCsv: candidateSynthesized,
    };
  }

  return {
    sourceName,
    ...primaryRes,
    synthesizedPrebuiltFromCsv: useSynthesizedAsPrimary ? candidateSynthesized : null,
  };
}

export function prepareBulkMetadataImportFromCSV(
  csvText: string,
  fileName: string,
  subdivision: SubdivisionComputationResult | null,
  currentState: LandSubdivisionState
): PendingBulkMetadataImport {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const lines = cleanText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  if (lines.length < 2) {
    return {
      sourceName: fileName,
      matchedPlotCount: 0,
      matchedBlockCount: 0,
      excludedPlotsInImportCount: 0,
      excludedBlocksInImportCount: 0,
      unmatchedIds: [],
      duplicateIdsInFile: [],
      conflicts: [],
      incomingPlotMetadata: {},
      incomingBlockMetadata: {},
      incomingPlotTiers: {},
      incomingBlockTiers: {},
      incomingBlockZones: {},
      synthesizedPrebuiltFromCsv: null,
    };
  }
  const delimiter = detectCsvDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter);
  const records: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i], delimiter);
    const rec: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      if (h) rec[h] = vals[idx] ?? '';
    });
    records.push(rec);
  }
  return prepareBulkMetadataImportFromRecords(records, fileName, subdivision, currentState);
}

/**
 * Generates a ready-to-edit CSV template for Blocks & Plots with `La_Qaybin_Karo` (Haa/Maya)
 * and `Magaca_Gaarka_Ah` (special names for excluded blocks/plots).
 */
export function buildSampleBlocksAndPlotsCSV(
  subdivision?: SubdivisionComputationResult | null,
  state?: Partial<
    Pick<
      LandSubdivisionState,
      'blockTiers' | 'plotTierOverrides' | 'blockZones' | 'plotMetadata' | 'blockMetadata'
    >
  >
): string {
  const header = [
    'Nooca_Diiwaanka',
    'Block_ID',
    'Plot_ID',
    'Plot_No',
    'La_Qaybin_Karo',
    'Magaca_Gaarka_Ah',
    'Zone_ID',
    'Tier_Code',
    'Wadi_Status',
    'Site_Quality',
    'Verified_Area_m2',
    'Verified_Price',
    'Notes',
  ];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows: string[] = [header.join(',')];

  if (subdivision && subdivision.blocks.length > 0 && subdivision.plots.length > 0) {
    const bTiers = state?.blockTiers || {};
    const pTiers = state?.plotTierOverrides || {};
    const bZones = state?.blockZones || buildAutoBlockZones(subdivision.blocks, 'quadrants_4');
    const pMeta = state?.plotMetadata || {};
    const bMeta = state?.blockMetadata || {};

    // 1. Export Block rows first
    subdivision.blocks.forEach((b) => {
      const bExcl = getEffectiveBlockExclusion(b.id, bMeta);
      const bZone = bMeta[b.id]?.zoneId || bZones[b.id] || 'Zone A';
      const bTier = bTiers[b.id] || 'tier_1_prime';
      rows.push(
        [
          'Block',
          b.id,
          '',
          '',
          bExcl.isExcluded ? 'Maya' : 'Haa',
          esc(bExcl.specialName || bMeta[b.id]?.blockName || ''),
          esc(bZone),
          TIER_METADATA[bTier].code,
          '',
          '',
          '',
          '',
          esc(bMeta[b.id]?.notes || (bExcl.isExcluded ? 'Block laga reebay dhaxalka' : '')),
        ].join(',')
      );
    });

    // 2. Export Plot rows
    subdivision.plots.forEach((p) => {
      const pExcl = getEffectivePlotExclusion(p, pMeta, bMeta);
      const pm = getEffectivePlotMetadata(p, pMeta);
      const pZone = getEffectivePlotZone(p, bZones, pMeta, bMeta);
      const pTier = getEffectivePlotTier(p, bTiers, pTiers);
      rows.push(
        [
          'Plot',
          p.block,
          p.id,
          p.no,
          pExcl.isExcluded ? 'Maya' : 'Haa',
          esc(pExcl.specialName || pm.parcelNumberOrName || ''),
          esc(pZone),
          TIER_METADATA[pTier].code,
          esc(WADI_STATUS_METADATA[pm.wadiStatus].shortSomali),
          esc(SITE_QUALITY_METADATA[pm.siteQuality].labelSomali),
          pm.verifiedAreaSqM != null ? String(pm.verifiedAreaSqM) : '',
          pm.verifiedPrice != null ? String(pm.verifiedPrice) : '',
          esc(pm.notes || ''),
        ].join(',')
      );
    });

    return '\uFEFF' + rows.join('\n');
  }

  // Standalone illustrative example CSV (4 Blocks, including 1 excluded Block + 2 excluded Plots with special names)
  const sampleBlocks = [
    { id: 'R1-C1', div: 'Haa', spec: '', zone: 'Zone A', tier: 'H1', note: 'Block la qaybinayo' },
    {
      id: 'R1-C2',
      div: 'Maya',
      spec: 'Masjidka Jaamaca & Dugsiga',
      zone: 'Zone B',
      tier: 'H1',
      note: 'Block dhan oo Waqf ah — laga reebay qaybinta dhaxalka',
    },
    { id: 'R2-C1', div: 'Haa', spec: '', zone: 'Zone C', tier: 'H2', note: 'Block la qaybinayo' },
    { id: 'R2-C2', div: 'Haa', spec: '', zone: 'Zone D', tier: 'H2', note: 'Block la qaybinayo' },
  ];

  sampleBlocks.forEach((b) => {
    rows.push(
      ['Block', b.id, '', '', b.div, esc(b.spec), esc(b.zone), b.tier, '', '', '', '', esc(b.note)].join(',')
    );
  });

  sampleBlocks.forEach((b) => {
    for (let no = 1; no <= 6; no++) {
      const pid = `${b.id}-P${String(no).padStart(2, '0')}`;
      let div = b.div;
      let spec = b.div === 'Maya' ? b.spec : '';
      let note = '';

      if (b.id === 'R1-C1' && no === 1) {
        div = 'Maya';
        spec = 'Ceelka Biyaha Guud';
        note = 'Plot gaar ah oo laga reebay qaybinta';
      } else if (b.id === 'R2-C2' && no === 6) {
        div = 'Maya';
        spec = 'Guri Waalid / Xarun Danguud';
        note = 'Laga reebay dhaxalka la qaybinayo';
      }

      rows.push(
        [
          'Plot',
          b.id,
          pid,
          no,
          div,
          esc(spec),
          esc(b.zone),
          b.tier,
          'Kuma jiro',
          'Wanaagsan',
          '432',
          '',
          esc(note),
        ].join(',')
      );
    }
  });

  return '\uFEFF' + rows.join('\n');
}

export function downloadSampleBlocksAndPlotsCSV(
  subdivision?: SubdivisionComputationResult | null,
  state?: Partial<
    Pick<
      LandSubdivisionState,
      'blockTiers' | 'plotTierOverrides' | 'blockZones' | 'plotMetadata' | 'blockMetadata'
    >
  >
) {
  const csv = buildSampleBlocksAndPlotsCSV(subdivision, state);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const filename =
    subdivision && subdivision.plots.length > 0
      ? 'Blocks_iyo_Plots_Qaybinta_iyo_Reebista_Template.csv'
      : 'Tusaale_Blocks_iyo_Plots_CSV_Template.csv';
  triggerBrowserDownload(filename, blob);
}

/* ==================== 5. ZONE-PROPORTIONAL & ANTI-ADJACENT-BLOCK FAIR SHARIA ALLOCATOR ==================== */

const TIER_ORDER: AssetQualityTier[] = ['tier_1_prime', 'tier_2_standard', 'tier_3_basic'];

export function areBlocksOrthogonallyAdjacent(b1: GeneratedBlock, b2: GeneratedBlock): boolean {
  if (b1.id === b2.id) return false;
  return Math.abs(b1.R - b2.R) + Math.abs(b1.C - b2.C) === 1;
}

export function areBlocksDiagonallyTouching(b1: GeneratedBlock, b2: GeneratedBlock): boolean {
  if (b1.id === b2.id) return false;
  return Math.abs(b1.R - b2.R) === 1 && Math.abs(b1.C - b2.C) === 1;
}

export function allocatePlotsFairlyToHeirs(
  subdivision: SubdivisionComputationResult | null,
  blockTiers: Record<string, AssetQualityTier>,
  plotTierOverrides: Record<string, AssetQualityTier>,
  manualPlotHeirOverrides: Record<string, string>,
  tierUnitPrices: TierPricingConfig,
  allocationMode: LandAllocationMode,
  inheritanceResult: InheritanceCalculationResult,
  heirsInput: HeirsInput,
  options?: {
    blockZones?: Record<string, string>;
    plotMetadata?: Record<string, PlotDetailedMetadata>;
    blockMetadata?: Record<string, BlockDetailedMetadata>;
    enforceNonAdjacentBlocks?: boolean;
    includeValidHalfPlots?: boolean;
    approvalStatus?: AllocationApprovalStatus;
    approvedBy?: string;
    approvedAt?: string;
  }
): FairLandAllocationResult | null {
  if (!subdivision || subdivision.plots.length === 0) return null;

  const blockZones =
    options?.blockZones && Object.keys(options.blockZones).length > 0
      ? options.blockZones
      : buildAutoBlockZones(subdivision.blocks, 'quadrants_4');
  const plotMetadata = options?.plotMetadata || {};
  const blockMetadata = options?.blockMetadata || {};
  const enforceNonAdjacent = options?.enforceNonAdjacentBlocks ?? true;
  const includeHalfPlots = Boolean(options?.includeValidHalfPlots);
  const approvalStatus: AllocationApprovalStatus = options?.approvalStatus || 'draft_proposal';

  const getPlotUnitWeight = (p: GeneratedPlot): number => (p.full ? 1.0 : 0.5);
  const sumPlotUnits = (arr: GeneratedPlot[]): number =>
    +arr.reduce((s, p) => s + getPlotUnitWeight(p), 0).toFixed(4);

  const defaultPlotAreaSqM = +(subdivision.params.pw * subdivision.params.pd).toFixed(2);
  const blockById: Record<string, GeneratedBlock> = {};
  subdivision.blocks.forEach((b) => {
    blockById[b.id] = b;
  });

  const compDist = calculateComprehensiveEstateDistribution(
    [],
    inheritanceResult,
    heirsInput,
    'USD'
  );
  const individuals = compDist.allIndividualHeirs;

  // Identify excluded Blocks & Plots (laga reebay qaybinta dhaxalka)
  const excludedBlocks: ExcludedBlockSummary[] = [];
  subdivision.blocks.forEach((b) => {
    const bExcl = getEffectiveBlockExclusion(b.id, blockMetadata);
    if (bExcl.isExcluded) {
      const bZone = blockMetadata[b.id]?.zoneId || blockZones[b.id] || 'Zone A';
      const bArea = b.plots.reduce(
        (sum, pl) => sum + (pl.calculatedAreaSqM ?? defaultPlotAreaSqM),
        0
      );
      excludedBlocks.push({
        blockId: b.id,
        specialName: bExcl.specialName,
        zoneId: bZone,
        plotsCount: b.plots.length,
        areaSqM: +bArea.toFixed(1),
        notes: blockMetadata[b.id]?.notes,
      });
    }
  });

  const divisiblePlots: GeneratedPlot[] = [];
  const excludedPlots: ExcludedPlotSummary[] = [];
  const excludedPlotMetaById: Record<
    string,
    { scope: 'block' | 'plot'; specialName: string }
  > = {};

  subdivision.plots.forEach((p) => {
    const pExcl = getEffectivePlotExclusion(p, plotMetadata, blockMetadata);
    if (pExcl.isExcluded) {
      const z = getEffectivePlotZone(p, blockZones, plotMetadata, blockMetadata);
      const calcArea = p.calculatedAreaSqM ?? defaultPlotAreaSqM;
      excludedPlotMetaById[p.id] = {
        scope: pExcl.scope,
        specialName: pExcl.specialName,
      };
      excludedPlots.push({
        plotId: p.id,
        blockId: p.block,
        zoneId: z,
        specialName: pExcl.specialName,
        excludedScope: pExcl.scope,
        areaSqM: +calcArea.toFixed(1),
        notes: plotMetadata[p.id]?.notes || blockMetadata[p.block]?.notes,
      });
    } else {
      divisiblePlots.push(p);
    }
  });

  // Collect eligible Half-Plots (0.5 Plot) on the map
  const fullPlotIdsSet = new Set(subdivision.plots.map((p) => p.id));
  const rawHalfPlotsOnMap: GeneratedPlot[] = [];
  const seenHalfIds = new Set<string>();

  if (subdivision.allEvaluatedPlots && subdivision.allEvaluatedPlots.length > 0) {
    for (const ep of subdivision.allEvaluatedPlots) {
      if (ep.full || fullPlotIdsSet.has(ep.id) || seenHalfIds.has(ep.id)) continue;
      const hpVal = ep.halfPlotValidation || subdivision.plotValidations?.[ep.id];
      const isEligibleHalf = subdivision.isPrebuiltGeometry
        ? hpVal?.boundaryRelation !== 'full_outside'
        : hpVal?.validationStatus === 'half_plot_valid' || (ep.nHalfCounted || 0) > 0;
      if (isEligibleHalf) {
        seenHalfIds.add(ep.id);
        rawHalfPlotsOnMap.push(ep);
      }
    }
  } else if (subdivision.validHalfPlots && subdivision.validHalfPlots.length > 0) {
    for (const hp of subdivision.validHalfPlots) {
      if (hp.full || fullPlotIdsSet.has(hp.id) || seenHalfIds.has(hp.id)) continue;
      seenHalfIds.add(hp.id);
      rawHalfPlotsOnMap.push(hp);
    }
  }

  const divisibleHalfPlotsCandidate: GeneratedPlot[] = [];
  rawHalfPlotsOnMap.forEach((hp) => {
    const pExcl = getEffectivePlotExclusion(hp, plotMetadata, blockMetadata);
    if (pExcl.isExcluded) {
      const z = getEffectivePlotZone(hp, blockZones, plotMetadata, blockMetadata);
      const calcArea =
        hp.calculatedAreaSqM ??
        hp.halfPlotValidation?.expectedRule.targetAreaSqM ??
        +(defaultPlotAreaSqM * 0.5).toFixed(2);
      excludedPlotMetaById[hp.id] = {
        scope: pExcl.scope,
        specialName: pExcl.specialName,
      };
      excludedPlots.push({
        plotId: hp.id,
        blockId: hp.block,
        zoneId: z,
        specialName: pExcl.specialName,
        excludedScope: pExcl.scope,
        areaSqM: +calcArea.toFixed(1),
        notes: plotMetadata[hp.id]?.notes || blockMetadata[hp.block]?.notes,
      });
    } else {
      divisibleHalfPlotsCandidate.push(hp);
    }
  });

  const divisibleHalfPlots: GeneratedPlot[] = includeHalfPlots ? divisibleHalfPlotsCandidate : [];
  const divisiblePoolPlots: GeneratedPlot[] = [...divisiblePlots, ...divisibleHalfPlots];
  const effectivePoolPlotUnits = sumPlotUnits(divisiblePoolPlots);

  // Gather Zone & Tier statistics strictly over DIVISIBLE pool plots (full + included half-plots)
  const plotsByTier: Record<AssetQualityTier, GeneratedPlot[]> = {
    tier_1_prime: [],
    tier_2_standard: [],
    tier_3_basic: [],
  };
  const plotsByZone: Record<string, GeneratedPlot[]> = {};
  const blocksInZoneSet: Record<string, Set<string>> = {};

  let verifiedPricedPlotsCount = 0;
  let totalVerifiedValuePool = 0;
  let unverifiedWadiCount = 0;
  let unverifiedQualityCount = 0;

  divisiblePoolPlots.forEach((p) => {
    const t = getEffectivePlotTier(p, blockTiers, plotTierOverrides);
    const z = getEffectivePlotZone(p, blockZones, plotMetadata, blockMetadata);
    const meta = getEffectivePlotMetadata(p, plotMetadata);

    plotsByTier[t].push(p);
    if (!plotsByZone[z]) plotsByZone[z] = [];
    plotsByZone[z].push(p);
    if (!blocksInZoneSet[z]) blocksInZoneSet[z] = new Set();
    blocksInZoneSet[z].add(p.block);

    if (meta.verifiedPrice != null && meta.verifiedPrice > 0) {
      verifiedPricedPlotsCount++;
      totalVerifiedValuePool += meta.verifiedPrice;
    }
    if (meta.wadiStatus === 'unverified') unverifiedWadiCount++;
    if (meta.siteQuality === 'unverified') unverifiedQualityCount++;
  });

  const orderedZoneIds = Object.keys(plotsByZone).sort((a, b) => a.localeCompare(b));
  const zonesOverview: ZoneOverviewSummary[] = orderedZoneIds.map((zid) => {
    const zm = getZoneDisplayMeta(zid);
    return {
      zoneId: zid,
      zoneLabelSomali: zm.labelSomali,
      colorHex: zm.colorHex,
      totalPlots: sumPlotUnits(plotsByZone[zid]),
      blockIds: Array.from(blocksInZoneSet[zid] || []).sort(),
    };
  });

  const tierCounts = {
    tier_1_prime: sumPlotUnits(plotsByTier.tier_1_prime),
    tier_2_standard: sumPlotUnits(plotsByTier.tier_2_standard),
    tier_3_basic: sumPlotUnits(plotsByTier.tier_3_basic),
  };

  const dataCompletenessWarnings: string[] = [];
  if (divisiblePlots.length > 0 && unverifiedWadiCount > 0) {
    dataCompletenessWarnings.push(
      `Xaaladda dooxa: ${unverifiedWadiCount} ka mid ah ${divisiblePoolPlots.length} plot oo la qaybinayo weli lama xaqiijin.`
    );
  }
  if (divisiblePlots.length > 0 && unverifiedQualityCount > 0) {
    dataCompletenessWarnings.push(
      `Tayada dhulka: ${unverifiedQualityCount} ka mid ah ${divisiblePoolPlots.length} plot oo la qaybinayo weli lama xaqiijin.`
    );
  }
  if (verifiedPricedPlotsCount > 0 && verifiedPricedPlotsCount < divisiblePoolPlots.length) {
    dataCompletenessWarnings.push(
      `Qiimaha la xaqiijiyey: ${verifiedPricedPlotsCount}/${divisiblePoolPlots.length} plot oo keliya ayaa qiime sugan leh (${divisiblePoolPlots.length - verifiedPricedPlotsCount} plot qiime lagama hayo).`
    );
  }

  const plotAssignments: Record<string, PlotAssignmentRecord> = {};
  const sharedPlots: PlotAssignmentRecord[] = [];

  const buildPlotRecordBase = (p: GeneratedPlot) => {
    const t = getEffectivePlotTier(p, blockTiers, plotTierOverrides);
    const z = getEffectivePlotZone(p, blockZones, plotMetadata, blockMetadata);
    const zm = getZoneDisplayMeta(z);
    const meta = getEffectivePlotMetadata(p, plotMetadata);
    const unitWeight = getPlotUnitWeight(p);
    const calcArea =
      p.calculatedAreaSqM ??
      (!p.full
        ? p.halfPlotValidation?.expectedRule.targetAreaSqM ?? +(defaultPlotAreaSqM * 0.5).toFixed(2)
        : defaultPlotAreaSqM);

    return {
      plotId: p.id,
      blockId: p.block,
      zoneId: z,
      zoneLabelSomali: zm.labelSomali,
      tier: t,
      tierLabelSomali: TIER_METADATA[t].shortSomali,
      wadiStatus: meta.wadiStatus,
      wadiLabelSomali: WADI_STATUS_METADATA[meta.wadiStatus].shortSomali,
      siteQuality: meta.siteQuality,
      siteQualityLabelSomali: SITE_QUALITY_METADATA[meta.siteQuality].labelSomali,
      areaSqM: calcArea,
      isHalfPlot: !p.full,
      plotUnitWeight: unitWeight,
      verifiedAreaSqM: meta.verifiedAreaSqM ?? null,
      verifiedPrice: meta.verifiedPrice ?? null,
      estimatedTierPrice: +((tierUnitPrices[t] || 0) * unitWeight).toFixed(2),
      widthM: subdivision.params.pw,
      depthM: subdivision.params.pd,
      lon: p.centerLonLat[0],
      lat: p.centerLonLat[1],
    };
  };

  // Record all EXCLUDED plots (full + half) into plotAssignments so map & tables display their special names clearly
  [...subdivision.plots, ...rawHalfPlotsOnMap].forEach((p) => {
    const exMeta = excludedPlotMetaById[p.id];
    if (exMeta) {
      plotAssignments[p.id] = {
        ...buildPlotRecordBase(p),
        assignmentType: 'excluded',
        allocationLifecycleStatus: 'excluded',
        isExcluded: true,
        excludedScope: exMeta.scope,
        excludedSpecialName: exMeta.specialName,
      };
    }
  });

  // When Half-Plots are excluded from inheritance division, record them explicitly as withheld_half_plot
  if (!includeHalfPlots) {
    divisibleHalfPlotsCandidate.forEach((hp) => {
      plotAssignments[hp.id] = {
        ...buildPlotRecordBase(hp),
        assignmentType: 'unassigned',
        allocationLifecycleStatus: 'available',
        unassignedReason: 'withheld_half_plot',
      };
    });
  }

  const validHalfPlotsIncludedCount = includeHalfPlots ? divisibleHalfPlots.length : 0;

  // Count half-plots / boundary-clipped partial plots excluded from division
  const withheldHalfPlotsCount = includeHalfPlots
    ? 0
    : (() => {
        if (divisibleHalfPlotsCandidate.length > 0) {
          return divisibleHalfPlotsCandidate.length;
        }
        if (subdivision.htmlHalvesCounted && subdivision.htmlHalvesCounted.length > 0) {
          return subdivision.htmlHalvesCounted.length;
        }
        return subdivision.halfPlotSummary?.validHalfPlotsCount || 0;
      })();

  if (individuals.length === 0 || divisiblePoolPlots.length === 0) {
    divisiblePoolPlots.forEach((p) => {
      plotAssignments[p.id] = {
        ...buildPlotRecordBase(p),
        assignmentType: 'unassigned',
        allocationLifecycleStatus: 'available',
        unassignedReason: 'no_heirs',
      };
    });

    const emptyHeirAllocations: IndividualHeirPlotAllocation[] =
      divisiblePlots.length === 0
        ? individuals.map((ind, idx) => ({
            heirKey: `${ind.heirGroupId}::${ind.personIndex}`,
            heirGroupId: ind.heirGroupId,
            personIndex: ind.personIndex,
            personName: ind.personName,
            roleTitleSomali: ind.roleTitleSomali,
            roleTitleArabic: ind.roleTitleArabic,
            quranicFractionGroup: ind.quranicFractionGroup,
            individualPercentage: ind.individualPercentage,
            colorHex: getDistinctHeirColor(idx),
            exactTotalPlotsQuota: 0,
            totalWholePlotsAssigned: 0,
            effectiveTotalPlotsReceived: 0,
            totalAreaSqM: 0,
            verifiedAreaTotalSqM: null,
            verifiedAreaPlotCount: 0,
            verifiedValueTotalUSD: null,
            verifiedValuePlotCount: 0,
            exactVerifiedValueEntitlementUSD: null,
            totalEstimatedValueUSD: 0,
            assignedBlockIds: [],
            adjacentBlockPairs: [],
            allWholePlotIds: [],
            compactSummarySomali: '0 Plot (Dhammaan plots-ka waa laga reebay qaybinta)',
            byTier: {
              tier_1_prime: {
                tier: 'tier_1_prime',
                tierLabelSomali: TIER_METADATA.tier_1_prime.shortSomali,
                totalTierPlots: 0,
                exactQuotaPlots: 0,
                assignedWholePlotIds: [],
                sharedPlotSlices: [],
                effectiveTotalPlots: 0,
                deviationFromQuota: 0,
              },
              tier_2_standard: {
                tier: 'tier_2_standard',
                tierLabelSomali: TIER_METADATA.tier_2_standard.shortSomali,
                totalTierPlots: 0,
                exactQuotaPlots: 0,
                assignedWholePlotIds: [],
                sharedPlotSlices: [],
                effectiveTotalPlots: 0,
                deviationFromQuota: 0,
              },
              tier_3_basic: {
                tier: 'tier_3_basic',
                tierLabelSomali: TIER_METADATA.tier_3_basic.shortSomali,
                totalTierPlots: 0,
                exactQuotaPlots: 0,
                assignedWholePlotIds: [],
                sharedPlotSlices: [],
                effectiveTotalPlots: 0,
                deviationFromQuota: 0,
              },
            },
            byZone: {},
            wadiBreakdown: {
              cuts_through: 0,
              partial: 0,
              nearby: 0,
              none: 0,
              unverified: 0,
            },
            siteQualityBreakdown: {
              very_good: 0,
              good: 0,
              medium: 0,
              poor: 0,
              unverified: 0,
            },
            unverifiedMetadataPlotCount: 0,
            heirWarnings: [],
          }))
        : [];

    return {
      totalFullPlots: divisiblePlots.length,
      totalAllFullPlotsOnMap: subdivision.plots.length,
      excludedPlotsCount: excludedPlots.length,
      excludedBlocksCount: excludedBlocks.length,
      excludedBlocks,
      excludedPlots,
      includeValidHalfPlots: includeHalfPlots,
      validHalfPlotsIncludedCount,
      effectivePoolPlotUnits,
      allocatedFullPlotsCount: 0,
      withheldJajabPlotsCount: 0,
      withheldJajabPlotIds: [],
      withheldHalfPlotsCount,
      plotWidthM: subdivision.params.pw,
      plotDepthM: subdivision.params.pd,
      plotAreaSqM: defaultPlotAreaSqM,
      allocationMode,
      approvalStatus,
      approvedBy: options?.approvedBy,
      approvedAt: options?.approvedAt,
      tierCounts,
      zones: zonesOverview,
      totalVerifiedValuePoolUSD: verifiedPricedPlotsCount > 0 ? +totalVerifiedValuePool.toFixed(2) : null,
      verifiedPricedPlotsCount,
      plotAssignments,
      sharedPlots: [],
      heirAllocations: emptyHeirAllocations,
      isFairAcrossAllTiers: true,
      isFairAcrossAllZones: true,
      hasZeroAdjacentBlockViolations: true,
      fairnessWarnings:
        divisiblePlots.length === 0
          ? ['Dhammaan plots-ka khariirada waa laga reebay qaybinta dhaxalka — ma jiro plot u haray in la qaybiyo.']
          : ['Weli lama dooran dhaxlayaal — dooro ehelka si plots-ka loogu qaybiyo.'],
      dataCompletenessWarnings,
      fairnessSummarySomali:
        divisiblePlots.length === 0
          ? `Dhammaan ${excludedPlots.length} plot waa laga reebay qaybinta dhaxalka.`
          : 'Dooro dhaxlayaasha si nidaamku ugu qaybiyo Zone kasta iyo Heer kasta si cadaalad ah.',
    };
  }

  const heirKeys = individuals.map((ind) => `${ind.heirGroupId}::${ind.personIndex}`);
  const heirColors: Record<string, string> = {};
  individuals.forEach((ind, idx) => {
    const k = `${ind.heirGroupId}::${ind.personIndex}`;
    heirColors[k] = getDistinctHeirColor(idx);
  });

  const makeEmptyTierBreakdown = (tier: AssetQualityTier): HeirTierPlotBreakdown => ({
    tier,
    tierLabelSomali: TIER_METADATA[tier].shortSomali,
    totalTierPlots: sumPlotUnits(plotsByTier[tier]),
    exactQuotaPlots: 0,
    assignedWholePlotIds: [],
    sharedPlotSlices: [],
    effectiveTotalPlots: 0,
    deviationFromQuota: 0,
  });

  const makeEmptyZoneBreakdown = (zid: string): HeirZonePlotBreakdown => ({
    zoneId: zid,
    zoneLabelSomali: getZoneDisplayMeta(zid).labelSomali,
    totalZonePlots: sumPlotUnits(plotsByZone[zid] || []),
    exactZoneQuotaPlots: 0,
    assignedWholePlotIds: [],
    assignedBlockIdsInZone: [],
    sharedPlotSlices: [],
    effectivePlotsInZone: 0,
    zonePercentageReceived: 0,
    deviationFromZoneQuota: 0,
  });

  const heirTierMap: Record<string, Record<AssetQualityTier, HeirTierPlotBreakdown>> = {};
  const heirZoneMap: Record<string, Record<string, HeirZonePlotBreakdown>> = {};
  const heirWholeBlocksSet: Record<string, Set<string>> = {};
  const cumulativeRoundingDeficit: Record<string, number> = {};
  const cumulativeVerifiedValueAssigned: Record<string, number> = {};

  const totalPctSum =
    individuals.reduce((s, ind) => s + ind.individualPercentage, 0) || 100;

  heirKeys.forEach((k, idx) => {
    const w = individuals[idx].individualPercentage / totalPctSum;
    heirTierMap[k] = {
      tier_1_prime: {
        ...makeEmptyTierBreakdown('tier_1_prime'),
        exactQuotaPlots: +(w * sumPlotUnits(plotsByTier.tier_1_prime)).toFixed(4),
      },
      tier_2_standard: {
        ...makeEmptyTierBreakdown('tier_2_standard'),
        exactQuotaPlots: +(w * sumPlotUnits(plotsByTier.tier_2_standard)).toFixed(4),
      },
      tier_3_basic: {
        ...makeEmptyTierBreakdown('tier_3_basic'),
        exactQuotaPlots: +(w * sumPlotUnits(plotsByTier.tier_3_basic)).toFixed(4),
      },
    };
    heirZoneMap[k] = {};
    orderedZoneIds.forEach((zid) => {
      heirZoneMap[k][zid] = {
        ...makeEmptyZoneBreakdown(zid),
        exactZoneQuotaPlots: +(w * sumPlotUnits(plotsByZone[zid] || [])).toFixed(4),
      };
    });
    heirWholeBlocksSet[k] = new Set();
    cumulativeRoundingDeficit[k] = 0;
    cumulativeVerifiedValueAssigned[k] = 0;
  });

  const lifecycleTag: 'approved' | 'pending_proposal' =
    approvalStatus === 'approved' ? 'approved' : 'pending_proposal';

  // Pre-seed manual overrides strictly on DIVISIBLE pool plots so excluded plots are never assigned to any heir
  const manuallyAssignedPlotIds = new Set<string>();
  divisiblePoolPlots.forEach((p) => {
    const overrideHeirKey = manualPlotHeirOverrides[p.id];
    if (overrideHeirKey && heirTierMap[overrideHeirKey]) {
      manuallyAssignedPlotIds.add(p.id);
      const hIdx = heirKeys.indexOf(overrideHeirKey);
      const ind = individuals[hIdx];
      const base = buildPlotRecordBase(p);

      heirTierMap[overrideHeirKey][base.tier].assignedWholePlotIds.push(p.id);
      heirZoneMap[overrideHeirKey][base.zoneId].assignedWholePlotIds.push(p.id);
      heirWholeBlocksSet[overrideHeirKey].add(p.block);
      if (base.verifiedPrice != null) {
        cumulativeVerifiedValueAssigned[overrideHeirKey] += base.verifiedPrice;
      }

      plotAssignments[p.id] = {
        ...base,
        assignmentType: 'manual_override',
        allocationLifecycleStatus: lifecycleTag,
        ownerHeirKey: overrideHeirKey,
        ownerPersonName: ind.personName,
        ownerRoleSomali: ind.roleTitleSomali,
        ownerColorHex: heirColors[overrideHeirKey],
      };
    }
  });

  /**
   * Build Fine Strata: (ZoneId × Tier × WadiEncumbranceBucket)
   * Every heir receives their exact Sharia percentage inside EVERY Zone AND EVERY Quality Tier,
   * while separating wadi-encumbered plots from clear plots if both exist in a Zone+Tier.
   */
  interface AllocationStratum {
    key: string;
    zoneId: string;
    tier: AssetQualityTier;
    allPlots: GeneratedPlot[];
  }

  const strataList: AllocationStratum[] = [];
  orderedZoneIds.forEach((zid) => {
    const zPlots = plotsByZone[zid] || [];
    TIER_ORDER.forEach((tier) => {
      const ztPlots = zPlots.filter(
        (p) => getEffectivePlotTier(p, blockTiers, plotTierOverrides) === tier
      );
      if (ztPlots.length === 0) return;

      const wadiEncPlots = ztPlots.filter((p) => {
        const ws = getEffectivePlotMetadata(p, plotMetadata).wadiStatus;
        return WADI_STATUS_METADATA[ws].isEncumbered;
      });
      const clearPlots = ztPlots.filter((p) => {
        const ws = getEffectivePlotMetadata(p, plotMetadata).wadiStatus;
        return !WADI_STATUS_METADATA[ws].isEncumbered;
      });

      if (wadiEncPlots.length > 0 && clearPlots.length > 0) {
        strataList.push({
          key: `${zid}::${tier}::clear`,
          zoneId: zid,
          tier,
          allPlots: clearPlots,
        });
        strataList.push({
          key: `${zid}::${tier}::wadi`,
          zoneId: zid,
          tier,
          allPlots: wadiEncPlots,
        });
      } else {
        strataList.push({
          key: `${zid}::${tier}::all`,
          zoneId: zid,
          tier,
          allPlots: ztPlots,
        });
      }
    });
  });

  const withheldJajabPlotIds: string[] = [];
  const hasIncludedHalfPlotsInPool = includeHalfPlots && divisibleHalfPlots.length > 0;

  // Pre-compute farm-wide exact targets & stratum apportionment for 'clean_equal_no_half_no_fraction'
  // - When Half-Plots are excluded: works in whole plots (1.0)
  // - When Half-Plots are included: works in half-plot quanta (1 quantum = 0.5 plot)
  const cleanStratumWholeMatrix: Record<string, Record<string, number>> = {};
  if (allocationMode === 'clean_equal_no_half_no_fraction') {
    const quantumScale = hasIncludedHalfPlotsInPool ? 2 : 1;
    const manualTotalByHeir: Record<string, number> = {};
    heirKeys.forEach((k) => {
      manualTotalByHeir[k] = 0;
    });
    divisiblePoolPlots.forEach((p) => {
      if (manuallyAssignedPlotIds.has(p.id)) {
        const ok = manualPlotHeirOverrides[p.id];
        if (ok && manualTotalByHeir[ok] !== undefined) {
          manualTotalByHeir[ok] += Math.round(getPlotUnitWeight(p) * quantumScale);
        }
      }
    });

    const freeCapacityByStratum: Record<string, number> = {};
    let totalFreeFarmUnits = 0;
    strataList.forEach((st) => {
      let fc = 0;
      st.allPlots.forEach((p) => {
        if (!manuallyAssignedPlotIds.has(p.id)) {
          fc += Math.round(getPlotUnitWeight(p) * quantumScale);
        }
      });
      freeCapacityByStratum[st.key] = fc;
      totalFreeFarmUnits += fc;
    });

    const totalPoolUnitsScaled = Math.round(effectivePoolPlotUnits * quantumScale);
    const autoTargetByHeir: Record<string, number> = {};
    let totalAutoTarget = 0;
    heirKeys.forEach((k, idx) => {
      const w = individuals[idx].individualPercentage / totalPctSum;
      const cleanWholeTotal = Math.floor(w * totalPoolUnitsScaled + 1e-9);
      const remAuto = Math.max(0, cleanWholeTotal - manualTotalByHeir[k]);
      autoTargetByHeir[k] = remAuto;
      totalAutoTarget += remAuto;
    });

    while (totalAutoTarget > totalFreeFarmUnits && totalAutoTarget > 0) {
      let maxK = heirKeys[0];
      heirKeys.forEach((k) => {
        if (autoTargetByHeir[k] > autoTargetByHeir[maxK]) maxK = k;
      });
      if (autoTargetByHeir[maxK] <= 0) break;
      autoTargetByHeir[maxK] -= 1;
      totalAutoTarget -= 1;
    }

    const stratumTotalToAllocate: Record<string, number> = {};
    let sumStratumBase = 0;
    const stratumRems: { key: string; rem: number; cap: number }[] = [];
    strataList.forEach((st) => {
      const cap = freeCapacityByStratum[st.key] || 0;
      if (cap === 0 || totalFreeFarmUnits === 0 || totalAutoTarget === 0) {
        stratumTotalToAllocate[st.key] = 0;
        return;
      }
      const exactSt = (cap * totalAutoTarget) / totalFreeFarmUnits;
      const baseSt = Math.min(cap, Math.floor(exactSt + 1e-9));
      stratumTotalToAllocate[st.key] = baseSt;
      sumStratumBase += baseSt;
      stratumRems.push({ key: st.key, rem: Math.max(0, exactSt - baseSt), cap });
    });

    let remStratumUnits = Math.max(0, totalAutoTarget - sumStratumBase);
    stratumRems.sort((a, b) => b.rem - a.rem || b.cap - a.cap);
    for (let i = 0; i < stratumRems.length && remStratumUnits > 0; i++) {
      const item = stratumRems[i];
      if (stratumTotalToAllocate[item.key] < item.cap) {
        stratumTotalToAllocate[item.key] += 1;
        remStratumUnits -= 1;
      }
    }

    const remRow: Record<string, number> = {};
    const remCol: Record<string, number> = { ...autoTargetByHeir };
    const cellFracs: { sKey: string; hKey: string; frac: number }[] = [];

    strataList.forEach((st) => {
      cleanStratumWholeMatrix[st.key] = {};
      const rowTotal = stratumTotalToAllocate[st.key] || 0;
      let rowUsed = 0;
      heirKeys.forEach((hKey) => {
        const ideal =
          totalAutoTarget > 0 ? (rowTotal * autoTargetByHeir[hKey]) / totalAutoTarget : 0;
        const fl = Math.min(remCol[hKey], Math.floor(ideal + 1e-9));
        cleanStratumWholeMatrix[st.key][hKey] = fl;
        rowUsed += fl;
        remCol[hKey] -= fl;
        cellFracs.push({
          sKey: st.key,
          hKey,
          frac: Math.max(0, ideal - fl),
        });
      });
      remRow[st.key] = Math.max(0, rowTotal - rowUsed);
    });

    cellFracs.sort((a, b) => b.frac - a.frac);
    for (const cell of cellFracs) {
      const rRem = remRow[cell.sKey] || 0;
      const cRem = remCol[cell.hKey] || 0;
      if (rRem > 0 && cRem > 0) {
        const add = Math.min(rRem, cRem);
        cleanStratumWholeMatrix[cell.sKey][cell.hKey] += add;
        remRow[cell.sKey] -= add;
        remCol[cell.hKey] -= add;
      }
    }
  }

  // Helper to assign a plot exclusively to a chosen heir
  const assignExclusivePlotToHeir = (
    p: GeneratedPlot,
    chosenHeir: string,
    stratum: AllocationStratum,
    stratumBlocksPickedByHeir: Record<string, Set<string>>
  ) => {
    const hIdx = heirKeys.indexOf(chosenHeir);
    const ind = individuals[hIdx];
    const base = buildPlotRecordBase(p);
    heirTierMap[chosenHeir][stratum.tier].assignedWholePlotIds.push(p.id);
    heirZoneMap[chosenHeir][stratum.zoneId].assignedWholePlotIds.push(p.id);
    heirWholeBlocksSet[chosenHeir].add(p.block);
    stratumBlocksPickedByHeir[chosenHeir].add(p.block);
    if (base.verifiedPrice != null) {
      cumulativeVerifiedValueAssigned[chosenHeir] += base.verifiedPrice;
    }

    plotAssignments[p.id] = {
      ...base,
      assignmentType: 'sole_heir',
      allocationLifecycleStatus: lifecycleTag,
      ownerHeirKey: chosenHeir,
      ownerPersonName: ind.personName,
      ownerRoleSomali: ind.roleTitleSomali,
      ownerColorHex: heirColors[chosenHeir],
    };
  };

  // Allocate each (Zone, Tier, Wadi) stratum proportionally with Anti-Adjacent-Block Spatial Solver
  strataList.forEach((stratum) => {
    const N_units = sumPlotUnits(stratum.allPlots);
    if (N_units <= 0) return;

    const exactStratumQuota: Record<string, number> = {};
    const manualInStratum: Record<string, number> = {};
    heirKeys.forEach((k, idx) => {
      const w = individuals[idx].individualPercentage / totalPctSum;
      exactStratumQuota[k] = w * N_units;
      manualInStratum[k] = 0;
    });

    const freePlots: GeneratedPlot[] = [];
    stratum.allPlots.forEach((p) => {
      if (manuallyAssignedPlotIds.has(p.id)) {
        const ok = manualPlotHeirOverrides[p.id];
        if (ok && manualInStratum[ok] !== undefined) {
          manualInStratum[ok] += getPlotUnitWeight(p);
        }
      } else {
        freePlots.push(p);
      }
    });

    if (freePlots.length === 0) return;

    const freeFullPlots = freePlots.filter((p) => p.full);
    const freeHalfPlots = freePlots.filter((p) => !p.full);
    const freeUnitsTotal = sumPlotUnits(freePlots);

    const remainingNeed: Record<string, number> = {};
    let positiveNeedSum = 0;
    heirKeys.forEach((k) => {
      const rem = Math.max(0, exactStratumQuota[k] - manualInStratum[k]);
      remainingNeed[k] = rem;
      positiveNeedSum += rem;
    });

    const normalizedNeed: Record<string, number> = {};
    heirKeys.forEach((k) => {
      normalizedNeed[k] =
        positiveNeedSum > 1e-9
          ? (remainingNeed[k] / positiveNeedSum) * freeUnitsTotal
          : freeUnitsTotal / heirKeys.length;
    });

    const stratumBlocksPickedByHeir: Record<string, Set<string>> = {};
    heirKeys.forEach((k) => {
      stratumBlocksPickedByHeir[k] = new Set();
    });

    // Quantum scale: 1 when no half-plots are in this stratum/pool, 2 when half-plots are active (1 quantum = 0.5 plot)
    const useHalfPlotQuanta = hasIncludedHalfPlotsInPool && freeHalfPlots.length > 0;
    const qScale = useHalfPlotQuanta ? 2 : 1;
    const totalFreeQuanta = freeFullPlots.length * qScale + (useHalfPlotQuanta ? freeHalfPlots.length : 0);

    const quantaToAssign: Record<string, number> = {};
    const qRemainders: { heirKey: string; rem: number }[] = [];
    let sumQuanta = 0;

    if (allocationMode === 'clean_equal_no_half_no_fraction') {
      const rowMap = cleanStratumWholeMatrix[stratum.key] || {};
      heirKeys.forEach((k) => {
        const rawVal = rowMap[k] || 0;
        // If cleanStratumWholeMatrix was computed in quanta (2x) but this specific stratum has 0 half-plots, convert cleanly
        const qVal =
          hasIncludedHalfPlotsInPool && !useHalfPlotQuanta ? Math.floor(rawVal / 2) : rawVal;
        quantaToAssign[k] = qVal;
        sumQuanta += qVal;
        qRemainders.push({ heirKey: k, rem: 0 });
      });
    } else {
      heirKeys.forEach((k) => {
        const exactQ = normalizedNeed[k] * qScale;
        const baseQ = Math.floor(exactQ + 1e-9);
        quantaToAssign[k] = baseQ;
        sumQuanta += baseQ;
        qRemainders.push({
          heirKey: k,
          rem: Math.max(0, exactQ - baseQ),
        });
      });
    }

    const leftoverQuanta = Math.max(0, totalFreeQuanta - sumQuanta);

    if (allocationMode === 'whole_balanced' && leftoverQuanta > 0) {
      const ranked = qRemainders
        .slice()
        .sort((a, b) => {
          const scoreA = a.rem + cumulativeRoundingDeficit[a.heirKey] * 0.45;
          const scoreB = b.rem + cumulativeRoundingDeficit[b.heirKey] * 0.45;
          if (Math.abs(scoreB - scoreA) > 1e-6) return scoreB - scoreA;
          return b.rem - a.rem;
        });

      const winners = new Set<string>();
      for (let m = 0; m < leftoverQuanta; m++) {
        const wHeir = ranked[m % ranked.length].heirKey;
        quantaToAssign[wHeir] += 1;
        winners.add(wHeir);
      }

      qRemainders.forEach(({ heirKey, rem }) => {
        const unitFactor = 1 / qScale;
        if (winners.has(heirKey)) {
          cumulativeRoundingDeficit[heirKey] += (rem - 1) * unitFactor;
        } else {
          cumulativeRoundingDeficit[heirKey] += rem * unitFactor;
        }
      });
    }

    // Parity feasibility when half-plot quanta (qScale === 2) are active:
    // Each heir with an odd quantum count needs 1 physical half-plot (0.5).
    if (useHalfPlotQuanta) {
      let oddHeirs = heirKeys.filter((k) => quantaToAssign[k] % 2 === 1);
      if (allocationMode === 'whole_balanced') {
        while (oddHeirs.length > freeHalfPlots.length && oddHeirs.length >= 2) {
          oddHeirs.sort((a, b) => {
            const remA = qRemainders.find((x) => x.heirKey === a)?.rem ?? 0;
            const remB = qRemainders.find((x) => x.heirKey === b)?.rem ?? 0;
            const scA = remA + cumulativeRoundingDeficit[a] * 0.45;
            const scB = remB + cumulativeRoundingDeficit[b] * 0.45;
            return scB - scA;
          });
          const promoteKey = oddHeirs[0];
          const demoteKey = oddHeirs[oddHeirs.length - 1];
          quantaToAssign[promoteKey] += 1;
          quantaToAssign[demoteKey] = Math.max(0, quantaToAssign[demoteKey] - 1);
          cumulativeRoundingDeficit[promoteKey] -= 0.5;
          cumulativeRoundingDeficit[demoteKey] += 0.5;
          oddHeirs = heirKeys.filter((k) => quantaToAssign[k] % 2 === 1);
        }
      } else {
        while (oddHeirs.length > freeHalfPlots.length && oddHeirs.length > 0) {
          oddHeirs.sort((a, b) => {
            const remA = qRemainders.find((x) => x.heirKey === a)?.rem ?? 0;
            const remB = qRemainders.find((x) => x.heirKey === b)?.rem ?? 0;
            return remA - remB;
          });
          const dropKey = oddHeirs[0];
          quantaToAssign[dropKey] = Math.max(0, quantaToAssign[dropKey] - 1);
          oddHeirs = heirKeys.filter((k) => quantaToAssign[k] % 2 === 1);
        }
      }
    }

    const remQuantaByHeir: Record<string, number> = { ...quantaToAssign };
    const halfPoolAvailable = freeHalfPlots.slice().sort((a, b) => a.no - b.no);

    // Step 1: If useHalfPlotQuanta, assign 1 physical Half-Plot to each heir with an odd quantum target
    if (useHalfPlotQuanta) {
      const oddRecipients = heirKeys.filter((k) => remQuantaByHeir[k] % 2 === 1);
      oddRecipients.forEach((hKey) => {
        if (halfPoolAvailable.length === 0) return;
        const ownedBlocks = heirWholeBlocksSet[hKey];
        let bestIdx = 0;
        let bestScore = -1e18;
        for (let i = 0; i < halfPoolAvailable.length; i++) {
          const candPlot = halfPoolAvailable[i];
          const candBlk = blockById[candPlot.block];
          let score = 0;
          if (enforceNonAdjacent && candBlk && ownedBlocks.size > 0) {
            for (const prevId of ownedBlocks) {
              if (prevId === candPlot.block) continue;
              const prevBlk = blockById[prevId];
              if (!prevBlk) continue;
              if (areBlocksOrthogonallyAdjacent(candBlk, prevBlk)) score -= 100000;
              else if (areBlocksDiagonallyTouching(candBlk, prevBlk)) score -= 18000;
            }
          }
          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }
        const [pickedHalf] = halfPoolAvailable.splice(bestIdx, 1);
        assignExclusivePlotToHeir(pickedHalf, hKey, stratum, stratumBlocksPickedByHeir);
        remQuantaByHeir[hKey] -= 1;
      });
    }

    // Step 2: Convert remaining quanta into whole-plot equivalents (each full plot = qScale quanta)
    const remWholeByHeir: Record<string, number> = {};
    heirKeys.forEach((k) => {
      remWholeByHeir[k] = useHalfPlotQuanta
        ? Math.floor(remQuantaByHeir[k] / 2)
        : remQuantaByHeir[k];
    });

    // Group freeFullPlots by Block ID for Constrained-First Non-Adjacent Block Assignment
    const blockBucketsMap = new Map<string, GeneratedPlot[]>();
    freeFullPlots.forEach((p) => {
      const arr = blockBucketsMap.get(p.block) || [];
      arr.push(p);
      blockBucketsMap.set(p.block, arr);
    });
    blockBucketsMap.forEach((arr) => arr.sort((a, b) => a.no - b.no));

    const hasAvailableWholePlots = () => {
      for (const arr of blockBucketsMap.values()) {
        if (arr.length > 0) return true;
      }
      return false;
    };

    const countSafeBlocksForHeir = (hKey: string): number => {
      let safe = 0;
      const owned = heirWholeBlocksSet[hKey];
      for (const [bid, arr] of blockBucketsMap.entries()) {
        if (arr.length === 0) continue;
        const candBlk = blockById[bid];
        if (!candBlk) {
          safe++;
          continue;
        }
        let isAdj = false;
        for (const prevId of owned) {
          if (prevId === bid) continue;
          const prevBlk = blockById[prevId];
          if (prevBlk && areBlocksOrthogonallyAdjacent(candBlk, prevBlk)) {
            isAdj = true;
            break;
          }
        }
        if (!isAdj) safe++;
      }
      return safe;
    };

    let safetyIter = 0;
    const maxIter = freeFullPlots.length * 2 + heirKeys.length * 6 + 20;

    while (safetyIter++ < maxIter && hasAvailableWholePlots()) {
      const activeHeirs = heirKeys.filter((k) => remWholeByHeir[k] > 0);
      if (activeHeirs.length === 0) break;

      activeHeirs.sort((a, b) => {
        if (enforceNonAdjacent) {
          const safeA = countSafeBlocksForHeir(a);
          const safeB = countSafeBlocksForHeir(b);
          if (safeA !== safeB) return safeA - safeB;
        }
        return remWholeByHeir[b] - remWholeByHeir[a];
      });

      const chosenHeir = activeHeirs[0];
      const needed = remWholeByHeir[chosenHeir];
      const ownedBlocks = heirWholeBlocksSet[chosenHeir];

      let bestBlockId: string | null = null;
      let bestBlockScore = -1e18;

      for (const [bid, arr] of blockBucketsMap.entries()) {
        if (arr.length === 0) continue;
        const candBlk = blockById[bid];
        let orthAdjCount = 0;
        let diagAdjCount = 0;
        let minUtmDist = 0;

        if (candBlk && ownedBlocks.size > 0) {
          let minDistCalc = 1e18;
          for (const prevId of ownedBlocks) {
            if (prevId === bid) continue;
            const prevBlk = blockById[prevId];
            if (!prevBlk) continue;
            if (areBlocksOrthogonallyAdjacent(candBlk, prevBlk)) orthAdjCount++;
            else if (areBlocksDiagonallyTouching(candBlk, prevBlk)) diagAdjCount++;

            const d = Math.hypot(
              candBlk.centerUtm[0] - prevBlk.centerUtm[0],
              candBlk.centerUtm[1] - prevBlk.centerUtm[1]
            );
            minDistCalc = Math.min(minDistCalc, d);
          }
          if (minDistCalc < 1e17) minUtmDist = minDistCalc;
        }

        const alreadyUsedInThisStratum = stratumBlocksPickedByHeir[chosenHeir].has(bid);
        const fitsAllNeeded = arr.length >= needed;

        let score = 0;
        if (enforceNonAdjacent) {
          score -= orthAdjCount * 100000;
          score -= diagAdjCount * 18000;
          score += Math.min(minUtmDist, 2000) * 1.5;
        }
        if (alreadyUsedInThisStratum) score += 7000;
        if (fitsAllNeeded) score += 2500;
        score -= Math.abs(arr.length - needed) * 8;

        if (score > bestBlockScore) {
          bestBlockScore = score;
          bestBlockId = bid;
        }
      }

      if (!bestBlockId) break;
      const bucket = blockBucketsMap.get(bestBlockId)!;
      const takeCount = Math.min(needed, bucket.length);

      if (verifiedPricedPlotsCount > 0) {
        const targetPerPlotVal = totalVerifiedValuePool / Math.max(1, effectivePoolPlotUnits);
        bucket.sort((pA, pB) => {
          const vA = plotMetadata[pA.id]?.verifiedPrice ?? targetPerPlotVal;
          const vB = plotMetadata[pB.id]?.verifiedPrice ?? targetPerPlotVal;
          return Math.abs(vA - targetPerPlotVal) - Math.abs(vB - targetPerPlotVal);
        });
      }

      const takenPlots = bucket.splice(0, takeCount);
      takenPlots.forEach((p) => {
        assignExclusivePlotToHeir(p, chosenHeir, stratum, stratumBlocksPickedByHeir);
      });

      remWholeByHeir[chosenHeir] -= takenPlots.length;
    }

    // Step 3: If heirs still have whole-plot equivalents needed and pairs of Half-Plots remain (0.5 + 0.5 = 1.0), assign pairs
    if (useHalfPlotQuanta && halfPoolAvailable.length >= 2) {
      for (const hKey of heirKeys) {
        while (remWholeByHeir[hKey] > 0 && halfPoolAvailable.length >= 2) {
          const hp1 = halfPoolAvailable.shift()!;
          const hp2 = halfPoolAvailable.shift()!;
          assignExclusivePlotToHeir(hp1, hKey, stratum, stratumBlocksPickedByHeir);
          assignExclusivePlotToHeir(hp2, hKey, stratum, stratumBlocksPickedByHeir);
          remWholeByHeir[hKey] -= 1;
        }
      }
    }

    // Remaining plots in blockBucketsMap + any remaining halfPoolAvailable
    const remainingSharedPool: GeneratedPlot[] = [];
    for (const arr of blockBucketsMap.values()) {
      remainingSharedPool.push(...arr);
    }
    remainingSharedPool.push(...halfPoolAvailable);

    if (allocationMode === 'whole_balanced' && remainingSharedPool.length > 0) {
      remainingSharedPool.forEach((p, rIdx) => {
        const candidateHeir =
          heirKeys.find((k) => remWholeByHeir[k] > 0) || heirKeys[rIdx % heirKeys.length];
        assignExclusivePlotToHeir(p, candidateHeir, stratum, stratumBlocksPickedByHeir);
        if (remWholeByHeir[candidateHeir] > 0) remWholeByHeir[candidateHeir] -= getPlotUnitWeight(p);
      });
    } else if (
      allocationMode === 'clean_equal_no_half_no_fraction' &&
      remainingSharedPool.length > 0
    ) {
      remainingSharedPool.forEach((p) => {
        const base = buildPlotRecordBase(p);
        if (p.full) {
          withheldJajabPlotIds.push(p.id);
        }
        plotAssignments[p.id] = {
          ...base,
          assignmentType: 'unassigned',
          allocationLifecycleStatus: 'available',
          unassignedReason: 'withheld_jajab',
        };
      });
    } else if (allocationMode === 'exact_shared' && remainingSharedPool.length > 0) {
      // Compute exact remaining plot-unit need after exclusive full + half assignments in this stratum
      const assignedAutoUnitsInStratum: Record<string, number> = {};
      heirKeys.forEach((k) => {
        assignedAutoUnitsInStratum[k] = 0;
      });
      stratum.allPlots.forEach((p) => {
        if (manuallyAssignedPlotIds.has(p.id)) return;
        const rec = plotAssignments[p.id];
        if (rec && rec.assignmentType === 'sole_heir' && rec.ownerHeirKey) {
          assignedAutoUnitsInStratum[rec.ownerHeirKey] =
            (assignedAutoUnitsInStratum[rec.ownerHeirKey] || 0) + getPlotUnitWeight(p);
        }
      });

      const queue = heirKeys
        .map((k) => ({
          heirKey: k,
          rem: Math.max(0, normalizedNeed[k] - (assignedAutoUnitsInStratum[k] || 0)),
        }))
        .filter((f) => f.rem > 1e-5);
      let qIdx = 0;

      remainingSharedPool.forEach((p) => {
        const base = buildPlotRecordBase(p);
        const plotUnitCap = getPlotUnitWeight(p);
        let capacity = plotUnitCap;
        const coOwners: SharedPlotCoOwner[] = [];

        while (capacity > 1e-5 && qIdx < queue.length) {
          const item = queue[qIdx];
          if (item.rem <= 1e-5) {
            qIdx++;
            continue;
          }
          const sliceUnits = Math.min(capacity, item.rem);
          const pctOfThisPlot = +((sliceUnits / plotUnitCap) * 100).toFixed(2);
          const sliceAreaSqM = +((sliceUnits / plotUnitCap) * base.areaSqM).toFixed(1);
          const hIdx = heirKeys.indexOf(item.heirKey);
          const ind = individuals[hIdx];

          coOwners.push({
            heirKey: item.heirKey,
            personName: ind.personName,
            roleTitleSomali: ind.roleTitleSomali,
            shareFractionOfPlot: +sliceUnits.toFixed(4),
            sharePercentageOfPlot: pctOfThisPlot,
            areaSqM: sliceAreaSqM,
          });

          heirTierMap[item.heirKey][stratum.tier].sharedPlotSlices.push({
            plotId: p.id,
            blockId: p.block,
            zoneId: stratum.zoneId,
            fractionOfPlot: +sliceUnits.toFixed(4),
            percentageOfPlot: pctOfThisPlot,
            areaSqM: sliceAreaSqM,
          });

          heirZoneMap[item.heirKey][stratum.zoneId].sharedPlotSlices.push({
            plotId: p.id,
            blockId: p.block,
            fractionOfPlot: +sliceUnits.toFixed(4),
            percentageOfPlot: pctOfThisPlot,
            areaSqM: sliceAreaSqM,
          });

          if (base.verifiedPrice != null) {
            cumulativeVerifiedValueAssigned[item.heirKey] +=
              (sliceUnits / plotUnitCap) * base.verifiedPrice;
          }

          item.rem -= sliceUnits;
          capacity -= sliceUnits;
          if (item.rem <= 1e-5) {
            qIdx++;
          }
        }

        if (coOwners.length === 1 && coOwners[0].sharePercentageOfPlot >= 99.9) {
          const sole = coOwners[0];
          heirTierMap[sole.heirKey][stratum.tier].sharedPlotSlices.pop();
          heirTierMap[sole.heirKey][stratum.tier].assignedWholePlotIds.push(p.id);
          heirZoneMap[sole.heirKey][stratum.zoneId].sharedPlotSlices.pop();
          heirZoneMap[sole.heirKey][stratum.zoneId].assignedWholePlotIds.push(p.id);
          heirWholeBlocksSet[sole.heirKey].add(p.block);

          plotAssignments[p.id] = {
            ...base,
            assignmentType: 'sole_heir',
            allocationLifecycleStatus: lifecycleTag,
            ownerHeirKey: sole.heirKey,
            ownerPersonName: sole.personName,
            ownerRoleSomali: sole.roleTitleSomali,
            ownerColorHex: heirColors[sole.heirKey],
          };
        } else {
          const rec: PlotAssignmentRecord = {
            ...base,
            assignmentType: coOwners.length > 0 ? 'shared_fractional' : 'unassigned',
            allocationLifecycleStatus: coOwners.length > 0 ? lifecycleTag : 'available',
            coOwners: coOwners.length > 0 ? coOwners : undefined,
          };
          plotAssignments[p.id] = rec;
          if (coOwners.length > 0) sharedPlots.push(rec);
        }
      });
    }
  });

  const allocatedFullPlotsCount = Math.max(0, divisiblePlots.length - withheldJajabPlotIds.length);
  const allocatedEffectiveUnits = Object.values(plotAssignments).reduce((s, rec) => {
    if (
      rec.assignmentType === 'sole_heir' ||
      rec.assignmentType === 'manual_override' ||
      rec.assignmentType === 'shared_fractional'
    ) {
      return s + (rec.plotUnitWeight ?? 1);
    }
    return s;
  }, 0);
  const cleanScaleRatio =
    allocationMode === 'clean_equal_no_half_no_fraction' && effectivePoolPlotUnits > 0
      ? allocatedEffectiveUnits / effectivePoolPlotUnits
      : 1;
  const fairnessTol = allocationMode === 'clean_equal_no_half_no_fraction' ? 1.05 : 0.99;

  // Finalize Per-Heir Summaries, Zone Percentages, Adjacent Block Checks & Fairness Audit
  const fairnessWarnings: string[] = [];
  let isFairAcrossAllTiers = true;
  let isFairAcrossAllZones = true;
  let hasZeroAdjacentBlockViolations = true;

  const heirAllocations: IndividualHeirPlotAllocation[] = individuals.map((ind, idx) => {
    const k = heirKeys[idx];
    const tMap = heirTierMap[k];
    const zMap = heirZoneMap[k];
    const heirWarnings: string[] = [];

    // 1. Finalize Tier breakdowns
    TIER_ORDER.forEach((t) => {
      const tb = tMap[t];
      const sharedSum = tb.sharedPlotSlices.reduce((s, x) => s + x.fractionOfPlot, 0);
      const assignedUnits = tb.assignedWholePlotIds.reduce(
        (s, pid) => s + (plotAssignments[pid]?.plotUnitWeight ?? 1),
        0
      );
      tb.effectiveTotalPlots = +(assignedUnits + sharedSum).toFixed(4);
      tb.deviationFromQuota = +(tb.effectiveTotalPlots - tb.exactQuotaPlots).toFixed(4);

      const expectedInMode = tb.exactQuotaPlots * cleanScaleRatio;
      if (Math.abs(tb.effectiveTotalPlots - expectedInMode) > fairnessTol) {
        isFairAcrossAllTiers = false;
        const msg = `${ind.personName} (${ind.roleTitleSomali}): ${TIER_METADATA[t].shortSomali} xaq=${expectedInMode.toFixed(
          2
        )} plot, laakiin waxaa u qoran ${tb.effectiveTotalPlots.toFixed(2)} plot.`;
        heirWarnings.push(msg);
        fairnessWarnings.push(msg);
      }
    });

    // 2. Finalize Spatial Zone breakdowns (proving each heir receives exact Sharia % in each Zone!)
    orderedZoneIds.forEach((zid) => {
      const zb = zMap[zid];
      const sharedSum = zb.sharedPlotSlices.reduce((s, x) => s + x.fractionOfPlot, 0);
      const assignedZoneUnits = zb.assignedWholePlotIds.reduce(
        (s, pid) => s + (plotAssignments[pid]?.plotUnitWeight ?? 1),
        0
      );
      zb.effectivePlotsInZone = +(assignedZoneUnits + sharedSum).toFixed(4);
      zb.deviationFromZoneQuota = +(zb.effectivePlotsInZone - zb.exactZoneQuotaPlots).toFixed(4);
      zb.zonePercentageReceived =
        zb.totalZonePlots > 0
          ? +((zb.effectivePlotsInZone / zb.totalZonePlots) * 100).toFixed(2)
          : 0;

      const zBlocks = new Set<string>();
      zb.assignedWholePlotIds.forEach((pid) => {
        const b = plotAssignments[pid]?.blockId;
        if (b) zBlocks.add(b);
      });
      zb.sharedPlotSlices.forEach((s) => zBlocks.add(s.blockId));
      zb.assignedBlockIdsInZone = Array.from(zBlocks).sort();

      const expectedZoneInMode = zb.exactZoneQuotaPlots * cleanScaleRatio;
      if (Math.abs(zb.effectivePlotsInZone - expectedZoneInMode) > fairnessTol) {
        isFairAcrossAllZones = false;
        const msg = `${ind.personName}: ${zid} wuxuu ku leeyahay ${ind.individualPercentage.toFixed(
          2
        )}% (${expectedZoneInMode.toFixed(2)} plot), balse waxaa u qoran ${zb.zonePercentageReceived.toFixed(
          2
        )}% (${zb.effectivePlotsInZone.toFixed(2)} plot).`;
        heirWarnings.push(msg);
        fairnessWarnings.push(msg);
      }
    });

    const allWholePlotIds = [
      ...tMap.tier_1_prime.assignedWholePlotIds,
      ...tMap.tier_2_standard.assignedWholePlotIds,
      ...tMap.tier_3_basic.assignedWholePlotIds,
    ];

    const allSharedSlices = [
      ...tMap.tier_1_prime.sharedPlotSlices,
      ...tMap.tier_2_standard.sharedPlotSlices,
      ...tMap.tier_3_basic.sharedPlotSlices,
    ];

    const wholeBlockIds = Array.from(
      new Set(allWholePlotIds.map((pid) => plotAssignments[pid]?.blockId).filter(Boolean) as string[])
    ).sort();
    const sharedBlockIds = allSharedSlices.map((s) => s.blockId);
    const assignedBlockIds = Array.from(new Set([...wholeBlockIds, ...sharedBlockIds])).sort();

    // 3. Check Orthogonal Adjacent Block Pairs among whole-plot blocks
    const adjacentBlockPairs: [string, string][] = [];
    for (let i = 0; i < wholeBlockIds.length; i++) {
      for (let j = i + 1; j < wholeBlockIds.length; j++) {
        const bA = blockById[wholeBlockIds[i]];
        const bB = blockById[wholeBlockIds[j]];
        if (bA && bB && areBlocksOrthogonallyAdjacent(bA, bB)) {
          adjacentBlockPairs.push([bA.id, bB.id]);
        }
      }
    }

    if (adjacentBlockPairs.length > 0) {
      hasZeroAdjacentBlockViolations = false;
      const pairsText = adjacentBlockPairs.map(([a, b]) => `${a} & ${b}`).join(', ');
      const msg = `${ind.personName}: Wuxuu plots ku leeyahay laba block oo is-xiga (${pairsText}).`;
      heirWarnings.push(msg);
      fairnessWarnings.push(msg);
    }

    // 4. Calculate GIS Area, Verified Area, Verified Value, Wadi & Site Quality Breakdowns
    let calcAreaSum = 0;
    let verAreaSum = 0;
    let verAreaCount = 0;
    let verValSum = 0;
    let verValCount = 0;
    let unverifiedMetaPlots = 0;

    const wadiBreakdown: Record<WadiStatus, number> = {
      cuts_through: 0,
      partial: 0,
      nearby: 0,
      none: 0,
      unverified: 0,
    };
    const siteQualityBreakdown: Record<SiteQualityRating, number> = {
      very_good: 0,
      good: 0,
      medium: 0,
      poor: 0,
      unverified: 0,
    };

    allWholePlotIds.forEach((pid) => {
      const rec = plotAssignments[pid];
      if (!rec) return;
      calcAreaSum += rec.areaSqM;
      if (rec.verifiedAreaSqM != null) {
        verAreaSum += rec.verifiedAreaSqM;
        verAreaCount++;
      }
      if (rec.verifiedPrice != null) {
        verValSum += rec.verifiedPrice;
        verValCount++;
      }
      const wUnit = rec.plotUnitWeight ?? 1;
      wadiBreakdown[rec.wadiStatus] = +(wadiBreakdown[rec.wadiStatus] + wUnit).toFixed(3);
      siteQualityBreakdown[rec.siteQuality] = +(siteQualityBreakdown[rec.siteQuality] + wUnit).toFixed(3);
      if (rec.wadiStatus === 'unverified' || rec.siteQuality === 'unverified') {
        unverifiedMetaPlots++;
      }
    });

    allSharedSlices.forEach((sl) => {
      const rec = plotAssignments[sl.plotId];
      if (!rec) return;
      calcAreaSum += sl.areaSqM;
      if (rec.verifiedAreaSqM != null) {
        verAreaSum += rec.verifiedAreaSqM * sl.fractionOfPlot;
        verAreaCount++;
      }
      if (rec.verifiedPrice != null) {
        verValSum += rec.verifiedPrice * sl.fractionOfPlot;
        verValCount++;
      }
      wadiBreakdown[rec.wadiStatus] = +(wadiBreakdown[rec.wadiStatus] + sl.fractionOfPlot).toFixed(3);
      siteQualityBreakdown[rec.siteQuality] = +(
        siteQualityBreakdown[rec.siteQuality] + sl.fractionOfPlot
      ).toFixed(3);
      if (rec.wadiStatus === 'unverified' || rec.siteQuality === 'unverified') {
        unverifiedMetaPlots++;
      }
    });

    const effectiveTotalPlotsReceived = +(
      tMap.tier_1_prime.effectiveTotalPlots +
      tMap.tier_2_standard.effectiveTotalPlots +
      tMap.tier_3_basic.effectiveTotalPlots
    ).toFixed(3);

    const exactTotalPlotsQuota = +(
      tMap.tier_1_prime.exactQuotaPlots +
      tMap.tier_2_standard.exactQuotaPlots +
      tMap.tier_3_basic.exactQuotaPlots
    ).toFixed(3);

    const totalAreaSqM = +calcAreaSum.toFixed(1);
    const totalEstimatedValueUSD = +(
      tMap.tier_1_prime.effectiveTotalPlots * (tierUnitPrices.tier_1_prime || 0) +
      tMap.tier_2_standard.effectiveTotalPlots * (tierUnitPrices.tier_2_standard || 0) +
      tMap.tier_3_basic.effectiveTotalPlots * (tierUnitPrices.tier_3_basic || 0)
    ).toFixed(2);

    const w = ind.individualPercentage / totalPctSum;
    const exactVerifiedValueEntitlementUSD =
      verifiedPricedPlotsCount > 0 ? +(w * totalVerifiedValuePool).toFixed(2) : null;

    const zoneShortParts = orderedZoneIds
      .filter((zid) => zMap[zid].effectivePlotsInZone > 0)
      .map(
        (zid) =>
          `${zid}: ${formatPlotQtyCompact(zMap[zid].effectivePlotsInZone)} (${zMap[zid].zonePercentageReceived.toFixed(1)}%)`
      );

    const compactSummarySomali = `${formatPlotQtyCompact(
      effectiveTotalPlotsReceived
    )} Plot · ${zoneShortParts.join(' · ')}${
      assignedBlockIds.length > 0 ? ` · Blocks: ${assignedBlockIds.join(', ')}` : ''
    }`;

    return {
      heirKey: k,
      heirGroupId: ind.heirGroupId,
      personIndex: ind.personIndex,
      personName: ind.personName,
      roleTitleSomali: ind.roleTitleSomali,
      roleTitleArabic: ind.roleTitleArabic,
      quranicFractionGroup: ind.quranicFractionGroup,
      individualPercentage: ind.individualPercentage,
      colorHex: heirColors[k],
      exactTotalPlotsQuota,
      totalWholePlotsAssigned: allWholePlotIds.length,
      effectiveTotalPlotsReceived,
      totalAreaSqM,
      verifiedAreaTotalSqM: verAreaCount > 0 ? +verAreaSum.toFixed(1) : null,
      verifiedAreaPlotCount: verAreaCount,
      verifiedValueTotalUSD: verValCount > 0 ? +verValSum.toFixed(2) : null,
      verifiedValuePlotCount: verValCount,
      exactVerifiedValueEntitlementUSD,
      totalEstimatedValueUSD,
      assignedBlockIds,
      adjacentBlockPairs,
      allWholePlotIds,
      compactSummarySomali,
      byTier: tMap,
      byZone: zMap,
      wadiBreakdown,
      siteQualityBreakdown,
      unverifiedMetadataPlotCount: unverifiedMetaPlots,
      heirWarnings,
    };
  });

  const activeTiersCount = TIER_ORDER.filter((t) => tierCounts[t] > 0).length;
  const statusPrefix =
    approvalStatus === 'approved' ? 'Qoondayn La Ansixiyey' : 'Soo-jeedin Talo ah (Weli Lama Ansixin)';
  const excludedNote =
    excludedPlots.length > 0
      ? ` (${excludedPlots.length} plot${
          excludedBlocks.length > 0 ? ` oo ay ku jiraan ${excludedBlocks.length} block` : ''
        } ayaa si gaar ah looga reebay qaybinta dhaxalka)`
      : '';

  const halfPlotsNote =
    validHalfPlotsIncludedCount > 0
      ? ` (waxaa ku jira ${validHalfPlotsIncludedCount} half-plot oo u dhigma ${(
          validHalfPlotsIncludedCount * 0.5
        ).toFixed(1)} plot)`
      : withheldHalfPlotsCount > 0
      ? ` (${withheldHalfPlotsCount} half-plot waa laga reebay dhaxalka)`
      : '';

  const modeNote =
    allocationMode === 'whole_balanced'
      ? ` — Habka 2aad (0 Plot Wadaag ah: plot kasta hal dhaxle oo keliya ayaa leh)${halfPlotsNote}`
      : allocationMode === 'clean_equal_no_half_no_fraction'
      ? ` — Habka 3aad (Tiro Siman: ${allocatedFullPlotsCount} plot oo buuxa ayaa la qaybiyey; waxaa laga reebay ${withheldJajabPlotIds.length} plot oo jajab ah)${halfPlotsNote}`
      : halfPlotsNote;

  const fairnessSummarySomali =
    isFairAcrossAllTiers && isFairAcrossAllZones && hasZeroAdjacentBlockViolations
      ? `${statusPrefix}: Dhammaan ${individuals.length}-da dhaxale mid kasta wuxuu helay midab u gaar ah iyo saamigiisa sharciga ah (${allocatedFullPlotsCount}/${divisiblePlots.length} plot, ${orderedZoneIds.join(
          ', '
        )}, ${activeTiersCount} heer), iyadoo qofna aanu dhinac keliya wada qaadan ama laba block oo is-xiga la siin${modeNote}${excludedNote}.`
      : `${statusPrefix} — Digniin: Waxaa jira ${fairnessWarnings.length} qodob oo u baahan dib-u-eegis (kala duwanaansho Zone/Heer ama laba block oo is-xiga)${modeNote}${excludedNote}.`;

  return {
    totalFullPlots: divisiblePlots.length,
    totalAllFullPlotsOnMap: subdivision.plots.length,
    excludedPlotsCount: excludedPlots.length,
    excludedBlocksCount: excludedBlocks.length,
    excludedBlocks,
    excludedPlots,
    includeValidHalfPlots: includeHalfPlots,
    validHalfPlotsIncludedCount,
    effectivePoolPlotUnits,
    allocatedFullPlotsCount,
    withheldJajabPlotsCount: withheldJajabPlotIds.length,
    withheldJajabPlotIds,
    withheldHalfPlotsCount,
    plotWidthM: subdivision.params.pw,
    plotDepthM: subdivision.params.pd,
    plotAreaSqM: defaultPlotAreaSqM,
    allocationMode,
    approvalStatus,
    approvedBy: options?.approvedBy,
    approvedAt: options?.approvedAt,
    tierCounts,
    zones: zonesOverview,
    totalVerifiedValuePoolUSD: verifiedPricedPlotsCount > 0 ? +totalVerifiedValuePool.toFixed(2) : null,
    verifiedPricedPlotsCount,
    plotAssignments,
    sharedPlots,
    heirAllocations,
    isFairAcrossAllTiers,
    isFairAcrossAllZones,
    hasZeroAdjacentBlockViolations,
    fairnessWarnings,
    dataCompletenessWarnings,
    fairnessSummarySomali,
  };
}

/**
 * Computes clean whole-plot counts for unmapped Plot estates (when GIS map is not linked)
 * so all 3 LandAllocationMode options work consistently even in standalone Xisaabi/Natiijada mode.
 */
export function computeStandalonePlotModeAllocation(
  totalRawLandPlots: number,
  individuals: { heirGroupId: string; personIndex: number; individualPercentage: number }[],
  allocationMode: LandAllocationMode,
  includeHalfPlots = false
): {
  perHeirPlots: Record<string, number>;
  allocatedWholePlots: number;
  withheldHalfPlotsUnits: number;
  withheldJajabPlotsCount: number;
} {
  const perHeirPlots: Record<string, number> = {};
  if (totalRawLandPlots <= 0 || individuals.length === 0) {
    return {
      perHeirPlots,
      allocatedWholePlots: 0,
      withheldHalfPlotsUnits: 0,
      withheldJajabPlotsCount: 0,
    };
  }

  const totalPct = individuals.reduce((s, x) => s + x.individualPercentage, 0) || 100;
  const effectiveRawPool = includeHalfPlots
    ? Math.floor(totalRawLandPlots * 2 + 1e-9) * 0.5
    : Math.max(0, Math.floor(totalRawLandPlots + 1e-9));
  const withheldHalfPlotsUnits = Math.max(0, +(totalRawLandPlots - effectiveRawPool).toFixed(2));

  if (allocationMode === 'exact_shared') {
    const poolForExact = includeHalfPlots ? totalRawLandPlots : effectiveRawPool;
    individuals.forEach((ind) => {
      const k = `${ind.heirGroupId}::${ind.personIndex}`;
      perHeirPlots[k] = +((ind.individualPercentage / totalPct) * poolForExact).toFixed(4);
    });
    return {
      perHeirPlots,
      allocatedWholePlots: +poolForExact.toFixed(2),
      withheldHalfPlotsUnits: includeHalfPlots ? 0 : withheldHalfPlotsUnits,
      withheldJajabPlotsCount: 0,
    };
  }

  const qScale = includeHalfPlots ? 2 : 1;
  const poolQuanta = Math.round(effectiveRawPool * qScale);

  let sumBaseQuanta = 0;
  const rems: { key: string; rem: number }[] = [];
  const quantaByHeir: Record<string, number> = {};

  individuals.forEach((ind) => {
    const k = `${ind.heirGroupId}::${ind.personIndex}`;
    const exactQ = (ind.individualPercentage / totalPct) * poolQuanta;
    const baseQ = Math.floor(exactQ + 1e-9);
    quantaByHeir[k] = baseQ;
    sumBaseQuanta += baseQ;
    rems.push({ key: k, rem: Math.max(0, exactQ - baseQ) });
  });

  if (allocationMode === 'whole_balanced') {
    const leftoverQ = Math.max(0, poolQuanta - sumBaseQuanta);
    rems.sort((a, b) => b.rem - a.rem);
    for (let i = 0; i < leftoverQ; i++) {
      const wKey = rems[i % rems.length].key;
      quantaByHeir[wKey] += 1;
    }
    Object.keys(quantaByHeir).forEach((k) => {
      perHeirPlots[k] = +(quantaByHeir[k] / qScale).toFixed(2);
    });
    return {
      perHeirPlots,
      allocatedWholePlots: +(poolQuanta / qScale).toFixed(2),
      withheldHalfPlotsUnits,
      withheldJajabPlotsCount: 0,
    };
  }

  // 'clean_equal_no_half_no_fraction'
  Object.keys(quantaByHeir).forEach((k) => {
    perHeirPlots[k] = +(quantaByHeir[k] / qScale).toFixed(2);
  });
  return {
    perHeirPlots,
    allocatedWholePlots: +(sumBaseQuanta / qScale).toFixed(2),
    withheldHalfPlotsUnits,
    withheldJajabPlotsCount: Math.max(0, +((poolQuanta - sumBaseQuanta) / qScale).toFixed(2)),
  };
}

export function formatPlotQtyCompact(val: number): string {
  const rounded = Math.round(val * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 0.005) {
    return String(Math.round(rounded));
  }
  return rounded.toFixed(2);
}

export function summarizePlotIdsCompact(plotIds: string[], maxItems = 4): string {
  if (plotIds.length === 0) return '—';
  if (plotIds.length <= maxItems) return plotIds.join(', ');
  return `${plotIds.slice(0, maxItems).join(', ')} (+${plotIds.length - maxItems} kale)`;
}

/* ==================== 6. SYNC SUBDIVISION TO ESTATE ASSETS ==================== */

export const GIS_ASSET_ID_PREFIX = 'gis_subdivision_';

export function syncSubdivisionToEstateAssets(
  currentAssets: EstateAssetItem[],
  subdivision: SubdivisionComputationResult | null,
  blockTiers: Record<string, AssetQualityTier>,
  plotTierOverrides: Record<string, AssetQualityTier>,
  tierUnitPrices: TierPricingConfig,
  plotMetadata?: Record<string, PlotDetailedMetadata>,
  blockMetadata?: Record<string, BlockDetailedMetadata>,
  includeValidHalfPlots = false
): EstateAssetItem[] {
  const preservedAssets = currentAssets.filter((a) => {
    if (a.id.startsWith(GIS_ASSET_ID_PREFIX)) return false;
    if ((a.id === 'quick_money_1' || a.id === 'quick_other_1') && (a.estimatedValueUSD || 0) === 0) {
      return false;
    }
    return true;
  });

  if (!subdivision || subdivision.plots.length === 0) {
    return preservedAssets;
  }

  const pMeta = plotMetadata || {};
  const bMeta = blockMetadata || {};

  const plotsByTier: Record<AssetQualityTier, GeneratedPlot[]> = {
    tier_1_prime: [],
    tier_2_standard: [],
    tier_3_basic: [],
  };

  const fullIds = new Set(subdivision.plots.map((p) => p.id));
  const poolToSync: GeneratedPlot[] = [...subdivision.plots];

  if (includeValidHalfPlots) {
    const seenHalf = new Set<string>();
    if (subdivision.allEvaluatedPlots && subdivision.allEvaluatedPlots.length > 0) {
      for (const ep of subdivision.allEvaluatedPlots) {
        if (ep.full || fullIds.has(ep.id) || seenHalf.has(ep.id)) continue;
        const hpVal = ep.halfPlotValidation || subdivision.plotValidations?.[ep.id];
        const okHalf = subdivision.isPrebuiltGeometry
          ? hpVal?.boundaryRelation !== 'full_outside'
          : hpVal?.validationStatus === 'half_plot_valid' || (ep.nHalfCounted || 0) > 0;
        if (okHalf) {
          seenHalf.add(ep.id);
          poolToSync.push(ep);
        }
      }
    } else if (subdivision.validHalfPlots) {
      for (const hp of subdivision.validHalfPlots) {
        if (hp.full || fullIds.has(hp.id) || seenHalf.has(hp.id)) continue;
        seenHalf.add(hp.id);
        poolToSync.push(hp);
      }
    }
  }

  poolToSync.forEach((p) => {
    if (getEffectivePlotExclusion(p, pMeta, bMeta).isExcluded) {
      return;
    }
    const t = getEffectivePlotTier(p, blockTiers, plotTierOverrides);
    plotsByTier[t].push(p);
  });

  const gisAssets: EstateAssetItem[] = [];
  const sizeLabel = `${subdivision.params.pw}×${subdivision.params.pd} m² (${(
    subdivision.params.pw * subdivision.params.pd
  ).toFixed(0)} m²)`;

  TIER_ORDER.forEach((tier) => {
    const list = plotsByTier[tier];
    if (list.length === 0) return;

    const unitPrice = Math.max(0, tierUnitPrices[tier] || 0);
    const totalUnits = +list.reduce((s, p) => s + (p.full ? 1.0 : 0.5), 0).toFixed(2);
    let verifiedSum = 0;
    let verifiedCount = 0;
    if (plotMetadata) {
      list.forEach((p) => {
        const vp = plotMetadata[p.id]?.verifiedPrice;
        if (vp != null && vp > 0) {
          verifiedSum += vp;
          verifiedCount++;
        }
      });
    }

    const totalVal =
      verifiedCount === list.length && verifiedSum > 0
        ? +verifiedSum.toFixed(2)
        : +(totalUnits * unitPrice).toFixed(2);
    const blocksInTier = Array.from(new Set(list.map((p) => p.block)));

    gisAssets.push({
      id: `${GIS_ASSET_ID_PREFIX}${tier}`,
      category: 'real_estate',
      title: `Naqshadda Beerta — ${TIER_METADATA[tier].shortSomali} (${formatPlotQtyCompact(totalUnits)} Plot)`,
      description: `Blocks: ${blocksInTier.join(', ')}`,
      quantity: totalUnits,
      unit: 'Plot',
      estimatedValueUSD: totalVal,
      isUnvaluedLand: totalVal === 0,
      qualityTier: tier,
      tierName: TIER_METADATA[tier].fullSomali,
      location: `Blocks: ${blocksInTier.slice(0, 6).join(', ')}${blocksInTier.length > 6 ? '...' : ''}`,
      plotSize: sizeLabel,
      plotNumbers: `${list[0].id} … ${list[list.length - 1].id}`,
    });
  });

  return [...gisAssets, ...preservedAssets];
}

/* ==================== 7. GIS SHAPEFILE, GEOJSON & CSV EXPORTERS ==================== */

interface ExportLayerFeature {
  ring: Point2D[];
  props: Record<string, string | number>;
}

type ExportExtraState = Partial<
  Pick<LandSubdivisionState, 'blockZones' | 'plotMetadata' | 'blockMetadata' | 'approvalStatus'>
> & {
  caseMeta?: CaseExportMetadata;
};

export function buildExportLayers(
  r: SubdivisionComputationResult,
  blockTiers: Record<string, AssetQualityTier>,
  plotTierOverrides: Record<string, AssetQualityTier>,
  allocation: FairLandAllocationResult | null,
  extraState?: ExportExtraState
): Record<string, ExportLayerFeature[]> {
  const p = r.params;
  const layers: Record<string, ExportLayerFeature[]> = {};
  const bZones = extraState?.blockZones || buildAutoBlockZones(r.blocks, 'quadrants_4');
  const pMeta = extraState?.plotMetadata || {};
  const bMeta = extraState?.blockMetadata || {};
  const caseName = extraState?.caseMeta?.caseName || 'Kiis aan magac lahayn';
  const refNo = extraState?.caseMeta?.referenceNumber || 'REF-N/A';

  layers.Boundary_Beerta = [
    {
      ring: r.bring,
      props: {
        Case_Name: caseName,
        Ref_No: refNo,
        Name: 'Beerta - xuduudka',
        Area_m2: +r.barea.toFixed(1),
        Area_ha: +(r.barea / 1e4).toFixed(3),
        Perim_m: +r.bperim.toFixed(1),
      },
    },
  ];

  layers.Blocks = r.blocks.map((b) => {
    const bTier = blockTiers[b.id] || 'tier_1_prime';
    const bZone = bMeta[b.id]?.zoneId || bZones[b.id] || 'Zone A';
    const bExcl = getEffectiveBlockExclusion(b.id, bMeta);
    return {
      ring: b.rect,
      props: {
        Case_Name: caseName,
        Ref_No: refNo,
        Block_ID: b.id,
        Divisible: bExcl.isExcluded ? 'Maya' : 'Haa',
        Spec_Name: bExcl.specialName || bMeta[b.id]?.blockName || '',
        Zone_ID: bZone,
        Row: b.R,
        Col: b.C,
        Tier_Code: TIER_METADATA[bTier].code,
        Tier_Name: TIER_METADATA[bTier].shortSomali,
        Plots_full: b.nf,
        Half_valid: b.validHalfPlotsInBlock ?? 0,
        Plots_clip: b.clippedPlotsInBlock ?? 0,
        Plots_tot: b.total,
        Status: bExcl.isExcluded
          ? `Laga Reebay (${bExcl.specialName})`
          : b.complete
          ? 'Gudaha oo dhan'
          : 'Xuduuddu goysay',
        L_m: p.L,
        W_m: p.W,
        Area_m2: b.calculatedAreaSqM ?? +(p.L * p.W).toFixed(1),
        Inside_m2: b.insideBlockAreaSqM ?? +(p.L * p.W).toFixed(1),
        Notes: bMeta[b.id]?.notes || '',
      },
    };
  });

  layers.Plots = r.plots.map((q) => {
    const pTier = getEffectivePlotTier(q, blockTiers, plotTierOverrides);
    const pZone = getEffectivePlotZone(q, bZones, pMeta, bMeta);
    const meta = getEffectivePlotMetadata(q, pMeta);
    const pExcl = getEffectivePlotExclusion(q, pMeta, bMeta);
    const hp = q.halfPlotValidation || r.plotValidations?.[q.id];
    const assign = allocation?.plotAssignments?.[q.id];
    let heirLabel = 'Lama qaybin';
    let roleLabel = '-';
    let assignKind = 'Unassigned';

    if (pExcl.isExcluded || assign?.assignmentType === 'excluded') {
      const spName = assign?.excludedSpecialName || pExcl.specialName;
      heirLabel = spName ? `Laga Reebay: ${spName}` : 'Laga Reebay Dhaxalka';
      roleLabel = pExcl.scope === 'block' ? 'Block Laga Reebay' : 'Plot Laga Reebay';
      assignKind = 'Excluded';
    } else if (assign) {
      if (assign.assignmentType === 'sole_heir' || assign.assignmentType === 'manual_override') {
        heirLabel = assign.ownerPersonName || 'Dhaxale';
        roleLabel = assign.ownerRoleSomali || '-';
        assignKind = assign.assignmentType === 'manual_override' ? 'Manual' : 'Sole_Sharia';
      } else if (assign.assignmentType === 'shared_fractional' && assign.coOwners) {
        heirLabel = assign.coOwners
          .map((c) => `${c.personName} (${c.sharePercentageOfPlot}%)`)
          .join(' + ');
        roleLabel = 'Plot Wadaag ah';
        assignKind = 'Shared_Sharia';
      } else if (assign.unassignedReason === 'withheld_jajab') {
        heirLabel = 'Jajab Laga Reebay (Tiro Siman)';
        roleLabel = 'Jajab Laga Reebay';
        assignKind = 'Withheld_Jajab';
      }
    }

    return {
      ring: q.rect,
      props: {
        Case_Name: caseName,
        Ref_No: refNo,
        Plot_ID: q.id,
        Block_ID: q.block,
        Divisible: pExcl.isExcluded ? 'Maya' : 'Haa',
        Spec_Name: pExcl.specialName || meta.parcelNumberOrName || '',
        Special: q.specialAreaName || '',
        Zone_ID: pZone,
        Plot_No: q.no,
        Exp_Half: hp?.expectedRule.label || '-',
        Inside_m2: hp?.insideAreaSqM ?? (q.calculatedAreaSqM ?? +(p.pw * p.pd).toFixed(1)),
        Val_Stat: hp?.statusLabelSomali || 'Gudaha oo dhan',
        Val_Note: hp?.reasonSomali || '',
        Tier_Code: TIER_METADATA[pTier].code,
        Tier_Name: TIER_METADATA[pTier].shortSomali,
        Wadi_Stat: WADI_STATUS_METADATA[meta.wadiStatus].shortSomali,
        Site_Qual: SITE_QUALITY_METADATA[meta.siteQuality].labelSomali,
        Heir_Name: heirLabel,
        Heir_Role: roleLabel,
        Alloc_Type: assignKind,
        Appr_Stat: pExcl.isExcluded
          ? 'Excluded'
          : allocation?.approvalStatus === 'approved'
          ? 'Approved'
          : 'Proposal',
        W_m: p.pw,
        D_m: p.pd,
        Area_m2: q.calculatedAreaSqM ?? +(p.pw * p.pd).toFixed(1),
        Verif_m2: meta.verifiedAreaSqM != null ? meta.verifiedAreaSqM : -1,
        Verif_Val: meta.verifiedPrice != null ? meta.verifiedPrice : -1,
      },
    };
  });

  // Export exact HTML `Half_Plots` layer (-H1, -H2) when present
  if (r.htmlHalves && r.htmlHalves.length > 0) {
    const hst: Record<'full' | 'partial' | 'outside', string> = {
      full: 'HALF_FULL',
      partial: 'PARTIALLY_OUTSIDE',
      outside: 'OUTSIDE',
    };
    layers.Half_Plots = r.htmlHalves.map((x) => ({
      ring: x.rect,
      props: {
        Half_ID: x.id,
        Parent_ID: x.parent,
        Plot_ID: x.parent,
        Block_ID: x.block,
        Half_No: x.n,
        W_m: x.w,
        D_m: x.d,
        Area_m2: +x.area.toFixed(1),
        Status: hst[x.status],
        Counted: x.counted ? 'YES' : 'NO',
        Reason: x.reason,
        Special: x.specialAreaName || '',
      },
    }));
  }

  // Export exact HTML `Special_Areas` layer (`Aag gaar ah`) when present
  if (r.specialAreas && r.specialAreas.length > 0) {
    layers.Special_Areas = r.specialAreas.map((a) => ({
      ring: a.ring,
      props: {
        Name: a.name,
        Plots_full: a.nP,
        Half_cnt: a.nH,
        Area_m2: +a.area.toFixed(1),
        Cnt_m2: +(a.aP + a.aH).toFixed(1),
      },
    }));
  }

  // Section 2.8: Export Half Plot Validation layer for boundary-clipped & evaluated plots
  const allEval = r.allEvaluatedPlots || [];
  const clippedAndHalfFeatures: ExportLayerFeature[] = [];
  allEval.forEach((q) => {
    const hp = q.halfPlotValidation || r.plotValidations?.[q.id];
    if (!hp || hp.boundaryRelation === 'full_inside') return;
    const geomRing =
      hp.inscribedHalfPlotRectUtm && hp.validationStatus === 'half_plot_valid'
        ? hp.inscribedHalfPlotRectUtm
        : hp.insideRingsUtm[0] && hp.insideRingsUtm[0].length >= 3
        ? hp.insideRingsUtm[0]
        : q.rect;

    clippedAndHalfFeatures.push({
      ring: geomRing,
      props: {
        Case_Name: caseName,
        Ref_No: refNo,
        Block_ID: q.block,
        Plot_ID: q.id,
        Plot_No: q.no,
        Exp_Half: hp.expectedRule.label,
        Inside_m2: hp.insideAreaSqM,
        Out_m2: hp.outsideAreaSqM,
        Fit_Dim: hp.measuredDisplayDimensions,
        Val_Stat: hp.statusLabelSomali,
        Reason: hp.reasonSomali.slice(0, 108),
      },
    });
  });

  if (clippedAndHalfFeatures.length > 0) {
    layers.Half_Plots_Validation = clippedAndHalfFeatures;
  }

  if (r.sample && r.sampleRect) {
    layers.Reference_Blocks = [
      {
        ring: r.sample.ring,
        props: {
          Name: 'Block tusaale (sida la sawiray)',
          Status: 'Original',
          Area_m2: +Math.abs(shoelaceArea(r.sample.ring)).toFixed(1),
        },
      },
      {
        ring: r.sampleRect,
        props: {
          Name: 'Block tusaale la sixay',
          Status: `Corrected ${p.L}x${p.W}`,
          Area_m2: +(p.L * p.W).toFixed(1),
        },
      },
    ];
  }

  return layers;
}

export function buildGeoJsonCollections(
  r: SubdivisionComputationResult,
  layers: Record<string, ExportLayerFeature[]>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perLayer: Record<string, any> = {};

  Object.keys(layers).forEach((k) => {
    const feats = layers[k].map((f) => {
      const ring = f.ring.map((q) => {
        const c = r.inv(q);
        return [+c[0].toFixed(8), +c[1].toFixed(8)];
      });
      ring.push(ring[0]);
      return {
        type: 'Feature',
        properties: { Layer: k, ...f.props },
        geometry: { type: 'Polygon', coordinates: [ring] },
      };
    });
    perLayer[k] = { type: 'FeatureCollection', name: k, features: feats };
    all = all.concat(feats);
  });

  return {
    all: { type: 'FeatureCollection', name: 'Beerta_Dhaxalka_All_Layers', features: all },
    perLayer,
  };
}

function writeDbf(
  fields: { name: string; type: 'C' | 'N'; len: number; dec?: number }[],
  rows: (string | number | undefined)[][]
): Uint8Array {
  const enc = new TextEncoder();
  const nf = fields.length;
  const hl = 32 + 32 * nf + 1;
  const rl = 1 + fields.reduce((a, f) => a + f.len, 0);
  const buf = new Uint8Array(hl + rl * rows.length + 1);
  const dv = new DataView(buf.buffer);
  const d = new Date();

  buf[0] = 3;
  buf[1] = d.getFullYear() - 1900;
  buf[2] = d.getMonth() + 1;
  buf[3] = d.getDate();
  dv.setUint32(4, rows.length, true);
  dv.setUint16(8, hl, true);
  dv.setUint16(10, rl, true);

  fields.forEach((f, i) => {
    const o = 32 + 32 * i;
    enc.encode(f.name.slice(0, 10)).forEach((b, k) => {
      buf[o + k] = b;
    });
    buf[o + 11] = f.type.charCodeAt(0);
    buf[o + 16] = f.len;
    buf[o + 17] = f.dec || 0;
  });
  buf[32 + 32 * nf] = 0x0d;

  rows.forEach((row, ri) => {
    let o = hl + ri * rl;
    buf[o] = 0x20;
    o++;
    fields.forEach((f, i) => {
      const v = row[i];
      let bytes: Uint8Array;
      if (f.type === 'N') {
        const s = (v == null ? '' : Number(v).toFixed(f.dec || 0))
          .padStart(f.len, ' ')
          .slice(-f.len);
        bytes = enc.encode(s);
      } else {
        bytes = enc.encode(String(v == null ? '' : v)).slice(0, f.len);
      }
      buf.set(bytes, o);
      if (f.type !== 'N') {
        for (let k = bytes.length; k < f.len; k++) buf[o + k] = 0x20;
      }
      o += f.len;
    });
  });

  buf[buf.length - 1] = 0x1a;
  return buf;
}

function writeShpAndShx(rings: Point2D[][]): { shp: Uint8Array; shx: Uint8Array } {
  const recs = rings.map((rg) => {
    const r = rg.slice();
    if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) {
      r.push(r[0]);
    }
    let a = 0;
    for (let i = 0; i < r.length - 1; i++) {
      a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    }
    if (a > 0) r.reverse();
    return r;
  });

  let total = 100;
  const bbox: [number, number, number, number] = [1e18, 1e18, -1e18, -1e18];
  recs.forEach((r) => {
    total += 8 + 44 + 4 + 16 * r.length;
    r.forEach((q) => {
      bbox[0] = Math.min(bbox[0], q[0]);
      bbox[1] = Math.min(bbox[1], q[1]);
      bbox[2] = Math.max(bbox[2], q[0]);
      bbox[3] = Math.max(bbox[3], q[1]);
    });
  });

  const sb = new ArrayBuffer(total);
  const sv = new DataView(sb);
  const xb = new ArrayBuffer(100 + 8 * recs.length);
  const xv = new DataView(xb);

  [
    [sv, total] as const,
    [xv, 100 + 8 * recs.length] as const,
  ].forEach(([v, byteLen]) => {
    v.setInt32(0, 9994);
    v.setInt32(24, byteLen / 2);
    v.setInt32(28, 1000, true);
    v.setInt32(32, 5, true);
    v.setFloat64(36, bbox[0], true);
    v.setFloat64(44, bbox[1], true);
    v.setFloat64(52, bbox[2], true);
    v.setFloat64(60, bbox[3], true);
  });

  let o = 100;
  recs.forEach((r, i) => {
    const cl = 44 + 4 + 16 * r.length;
    const bx: [number, number, number, number] = [1e18, 1e18, -1e18, -1e18];
    r.forEach((q) => {
      bx[0] = Math.min(bx[0], q[0]);
      bx[1] = Math.min(bx[1], q[1]);
      bx[2] = Math.max(bx[2], q[0]);
      bx[3] = Math.max(bx[3], q[1]);
    });
    xv.setInt32(100 + 8 * i, o / 2);
    xv.setInt32(104 + 8 * i, cl / 2);
    sv.setInt32(o, i + 1);
    sv.setInt32(o + 4, cl / 2);
    o += 8;
    sv.setInt32(o, 5, true);
    sv.setFloat64(o + 4, bx[0], true);
    sv.setFloat64(o + 12, bx[1], true);
    sv.setFloat64(o + 20, bx[2], true);
    sv.setFloat64(o + 28, bx[3], true);
    sv.setInt32(o + 36, 1, true);
    sv.setInt32(o + 40, r.length, true);
    sv.setInt32(o + 44, 0, true);
    o += 48;
    r.forEach((q) => {
      sv.setFloat64(o, q[0], true);
      sv.setFloat64(o + 8, q[1], true);
      o += 16;
    });
  });

  return { shp: new Uint8Array(sb), shx: new Uint8Array(xb) };
}

const PRJ_WGS84 =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

function buildUtmPrj(r: SubdivisionComputationResult): string {
  return `PROJCS["WGS_1984_UTM_Zone_${r.zone}${
    r.south ? 'S' : 'N'
  }",${PRJ_WGS84},PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",${
    r.south ? '10000000.0' : '0.0'
  }],PARAMETER["Central_Meridian",${
    r.zone * 6 - 183
  }.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]`;
}

function addShapefileLayersToZip(
  r: SubdivisionComputationResult,
  layers: Record<string, ExportLayerFeature[]>,
  crs: 'wgs' | 'utm',
  zip: JSZip,
  folderName: string | null
) {
  const target = folderName ? zip.folder(folderName) || zip : zip;
  Object.keys(layers).forEach((k) => {
    const feats = layers[k];
    if (!feats.length) return;
    const sampleProps = feats[0].props;
    const keys = Object.keys(sampleProps);
    const fields = keys.map((n) => {
      const v = sampleProps[n];
      return typeof v === 'number'
        ? { name: n, type: 'N' as const, len: 16, dec: 3 }
        : { name: n, type: 'C' as const, len: 110 };
    });
    const rings = feats.map((ft) => (crs === 'wgs' ? ft.ring.map((q) => r.inv(q)) : ft.ring));
    const s = writeShpAndShx(rings);
    const rows = feats.map((ft) => keys.map((n) => ft.props[n]));
    target.file(`${k}.shp`, s.shp);
    target.file(`${k}.shx`, s.shx);
    target.file(`${k}.dbf`, writeDbf(fields, rows));
    target.file(`${k}.prj`, crs === 'wgs' ? PRJ_WGS84 : buildUtmPrj(r));
    target.file(`${k}.cpg`, 'UTF-8');
  });
}

export function buildPlotRegisterCSV(
  r: SubdivisionComputationResult,
  blockTiers: Record<string, AssetQualityTier>,
  plotTierOverrides: Record<string, AssetQualityTier>,
  allocation: FairLandAllocationResult | null,
  extraState?: ExportExtraState
): string {
  const bZones = extraState?.blockZones || buildAutoBlockZones(r.blocks, 'quadrants_4');
  const pMeta = extraState?.plotMetadata || {};
  const bMeta = extraState?.blockMetadata || {};
  const caseName = extraState?.caseMeta?.caseName || 'Kiis aan magac lahayn';
  const refNo = extraState?.caseMeta?.referenceNumber || 'REF-N/A';

  const header = [
    'Case_Name',
    'Reference_Number',
    'Nooca_Diiwaanka',
    'Plot_ID',
    'Block_ID',
    'Plot_No',
    'La_Qaybin_Karo',
    'Magaca_Gaarka_Ah',
    'Special_Area',
    'Zone_ID',
    'Expected_Half_Plot_Size',
    'Inside_Area_m2',
    'Outside_Area_m2',
    'Validation_Status',
    'Validation_Reason',
    'Tier_Code',
    'Tier_Somali',
    'Wadi_Status',
    'Site_Quality',
    'Heir_Name',
    'Heir_Role',
    'Allocation_Type',
    'Approval_Status',
    'Width_m',
    'Depth_m',
    'Area_m2',
    'Verified_Area_m2',
    'Verified_Price',
    'Land_Use',
    'Restrictions',
    'Notes',
    'Lon',
    'Lat',
  ];
  const rows = [header.join(',')];
  const escCsv = (s: string) => `"${String(s).replace(/"/g, '""')}"`;

  // Include Block-level rows first so block exclusions & special names round-trip in CSV
  r.blocks.forEach((b) => {
    const bTier = blockTiers[b.id] || 'tier_1_prime';
    const bZone = bMeta[b.id]?.zoneId || bZones[b.id] || 'Zone A';
    const bExcl = getEffectiveBlockExclusion(b.id, bMeta);
    const centerWgs = r.inv(b.centerUtm);
    rows.push(
      [
        escCsv(caseName),
        escCsv(refNo),
        'Block',
        '',
        b.id,
        '',
        bExcl.isExcluded ? 'Maya' : 'Haa',
        escCsv(bExcl.specialName || bMeta[b.id]?.blockName || ''),
        '',
        escCsv(bZone),
        '-',
        (b.insideBlockAreaSqM ?? b.calculatedAreaSqM ?? r.params.L * r.params.W).toFixed(2),
        '0.00',
        escCsv(b.complete ? 'Gudaha oo dhan' : 'Xuduuddu goysay'),
        '',
        TIER_METADATA[bTier].code,
        escCsv(TIER_METADATA[bTier].shortSomali),
        '',
        '',
        escCsv(bExcl.isExcluded ? `Laga Reebay: ${bExcl.specialName}` : 'Block La Qaybinayo'),
        bExcl.isExcluded ? 'Block Laga Reebay' : '-',
        bExcl.isExcluded ? 'Excluded' : 'Block',
        bExcl.isExcluded
          ? 'Laga_Reebay'
          : allocation?.approvalStatus === 'approved'
          ? 'La_Ansixiyey'
          : 'Soo_Jeedin',
        r.params.L,
        r.params.W,
        (b.calculatedAreaSqM ?? r.params.L * r.params.W).toFixed(1),
        '',
        '',
        '',
        '',
        escCsv(bMeta[b.id]?.notes || ''),
        centerWgs[0].toFixed(7),
        centerWgs[1].toFixed(7),
      ].join(',')
    );
  });

  const sourcePlots =
    r.allEvaluatedPlots && r.allEvaluatedPlots.length > 0 ? r.allEvaluatedPlots : r.plots;

  sourcePlots.forEach((q) => {
    const tier = getEffectivePlotTier(q, blockTiers, plotTierOverrides);
    const zone = getEffectivePlotZone(q, bZones, pMeta, bMeta);
    const meta = getEffectivePlotMetadata(q, pMeta);
    const pExcl = getEffectivePlotExclusion(q, pMeta, bMeta);
    const hp = q.halfPlotValidation || r.plotValidations?.[q.id];
    const assign = allocation?.plotAssignments[q.id];
    let heirName = q.full ? 'Lama qaybin' : 'Ka baxsan / Half Plot hubin';
    let heirRole = '-';
    let allocType = q.full ? 'Unassigned' : hp?.validationStatus || 'Clipped';

    if (pExcl.isExcluded || assign?.assignmentType === 'excluded') {
      const spName = assign?.excludedSpecialName || pExcl.specialName;
      heirName = spName ? `Laga Reebay: ${spName}` : 'Laga Reebay Dhaxalka';
      heirRole = pExcl.scope === 'block' ? 'Block Laga Reebay' : 'Plot Laga Reebay';
      allocType = 'excluded';
    } else if (assign) {
      if (assign.assignmentType === 'sole_heir' || assign.assignmentType === 'manual_override') {
        heirName = assign.ownerPersonName || 'Dhaxale';
        heirRole = assign.ownerRoleSomali || '-';
        allocType = assign.assignmentType;
      } else if (assign.assignmentType === 'shared_fractional' && assign.coOwners) {
        heirName = assign.coOwners
          .map((c) => `${c.personName} (${c.sharePercentageOfPlot}%)`)
          .join(' + ');
        heirRole = 'Plot Wadaag ah';
        allocType = 'shared_fractional';
      } else if (assign.unassignedReason === 'withheld_jajab') {
        heirName = 'Jajab Laga Reebay (Tiro Siman)';
        heirRole = 'Jajab Laga Reebay';
        allocType = 'withheld_jajab';
      }
    }

    rows.push(
      [
        escCsv(caseName),
        escCsv(refNo),
        'Plot',
        q.id,
        q.block,
        q.no,
        pExcl.isExcluded ? 'Maya' : 'Haa',
        escCsv(pExcl.specialName || meta.parcelNumberOrName || ''),
        escCsv(q.specialAreaName || ''),
        escCsv(zone),
        escCsv(hp?.expectedRule.label || '-'),
        hp ? hp.insideAreaSqM.toFixed(2) : (q.calculatedAreaSqM ?? r.params.pw * r.params.pd).toFixed(2),
        hp ? hp.outsideAreaSqM.toFixed(2) : '0.00',
        escCsv(hp?.statusLabelSomali || 'Gudaha oo dhan'),
        escCsv(hp?.reasonSomali || ''),
        TIER_METADATA[tier].code,
        escCsv(TIER_METADATA[tier].shortSomali),
        escCsv(WADI_STATUS_METADATA[meta.wadiStatus].shortSomali),
        escCsv(SITE_QUALITY_METADATA[meta.siteQuality].labelSomali),
        escCsv(heirName),
        escCsv(heirRole),
        allocType,
        pExcl.isExcluded
          ? 'Laga_Reebay'
          : allocation?.approvalStatus === 'approved'
          ? 'La_Ansixiyey'
          : 'Soo_Jeedin',
        r.params.pw,
        r.params.pd,
        (q.calculatedAreaSqM ?? r.params.pw * r.params.pd).toFixed(1),
        meta.verifiedAreaSqM != null ? String(meta.verifiedAreaSqM) : '',
        meta.verifiedPrice != null ? String(meta.verifiedPrice) : '',
        escCsv(meta.shapeAndLandUse || ''),
        escCsv(meta.usageRestrictions || ''),
        escCsv(meta.notes || ''),
        q.centerLonLat[0].toFixed(7),
        q.centerLonLat[1].toFixed(7),
      ].join(',')
    );
  });

  // Also include HTML Half-Plots (`HALF` records) in CSV register matching Naqshadeeyaha_Blocks_Plots_v2
  if (r.htmlHalves && r.htmlHalves.length > 0) {
    const hst: Record<'full' | 'partial' | 'outside', string> = {
      full: 'HALF_FULL',
      partial: 'PARTIALLY_OUTSIDE',
      outside: 'OUTSIDE',
    };
    r.htmlHalves.forEach((x) => {
      const cx = (x.rect[0][0] + x.rect[1][0] + x.rect[2][0] + x.rect[3][0]) / 4;
      const cy = (x.rect[0][1] + x.rect[1][1] + x.rect[2][1] + x.rect[3][1]) / 4;
      const ll = r.inv([cx, cy]);
      rows.push(
        [
          escCsv(caseName),
          escCsv(refNo),
          'HALF',
          x.id,
          x.block,
          x.pno,
          x.counted ? 'Haa' : 'Maya',
          '',
          escCsv(x.specialAreaName || ''),
          escCsv(bZones[x.block] || 'Zone A'),
          escCsv(`${x.w} × ${x.d} m`),
          x.counted ? x.area.toFixed(2) : '0.00',
          x.counted ? '0.00' : x.area.toFixed(2),
          hst[x.status],
          escCsv(x.reason),
          TIER_METADATA[blockTiers[x.block] || 'tier_1_prime'].code,
          escCsv(TIER_METADATA[blockTiers[x.block] || 'tier_1_prime'].shortSomali),
          '',
          '',
          escCsv(x.counted ? 'HALF_FULL (la tiriyey)' : 'Laga reebay tirinta'),
          '-',
          x.counted ? 'HALF_FULL' : x.status,
          'Soo_Jeedin',
          x.w,
          x.d,
          x.area.toFixed(1),
          '',
          '',
          '',
          '',
          '',
          ll[0].toFixed(7),
          ll[1].toFixed(7),
        ].join(',')
      );
    });
  }

  return '\uFEFF' + rows.join('\n');
}

function triggerBrowserDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadSubdivisionGeoJSON(
  r: SubdivisionComputationResult,
  blockTiers: Record<string, AssetQualityTier>,
  plotTierOverrides: Record<string, AssetQualityTier>,
  allocation: FairLandAllocationResult | null,
  extraState?: ExportExtraState
) {
  const layers = buildExportLayers(r, blockTiers, plotTierOverrides, allocation, extraState);
  const geo = buildGeoJsonCollections(r, layers);
  const blob = new Blob([JSON.stringify(geo.all, null, 2)], {
    type: 'application/geo+json;charset=utf-8',
  });
  const refPrefix = extraState?.caseMeta?.referenceNumber
    ? `${extraState.caseMeta.referenceNumber}_`
    : '';
  triggerBrowserDownload(`${refPrefix}Beerta_Dhaxalka_Blocks_Plots.json`, blob);
}

export function downloadSubdivisionCSV(
  r: SubdivisionComputationResult,
  blockTiers: Record<string, AssetQualityTier>,
  plotTierOverrides: Record<string, AssetQualityTier>,
  allocation: FairLandAllocationResult | null,
  extraState?: ExportExtraState
) {
  const csv = buildPlotRegisterCSV(r, blockTiers, plotTierOverrides, allocation, extraState);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const refPrefix = extraState?.caseMeta?.referenceNumber
    ? `${extraState.caseMeta.referenceNumber}_`
    : '';
  triggerBrowserDownload(`${refPrefix}Diiwaanka_Plots_iyo_HalfPlots.csv`, blob);
}

export async function downloadSubdivisionShapefileZip(
  r: SubdivisionComputationResult,
  blockTiers: Record<string, AssetQualityTier>,
  plotTierOverrides: Record<string, AssetQualityTier>,
  allocation: FairLandAllocationResult | null,
  crs: 'wgs' | 'utm',
  extraState?: ExportExtraState
) {
  const layers = buildExportLayers(r, blockTiers, plotTierOverrides, allocation, extraState);
  const zip = new JSZip();
  addShapefileLayersToZip(r, layers, crs, zip, null);
  const content = await zip.generateAsync({ type: 'blob' });
  const suffix = crs === 'wgs' ? 'WGS84' : `UTM${r.zone}${r.south ? 'S' : 'N'}`;
  const refPrefix = extraState?.caseMeta?.referenceNumber
    ? `${extraState.caseMeta.referenceNumber}_`
    : '';
  triggerBrowserDownload(`${refPrefix}Beerta_Dhaxalka_Shapefile_${suffix}.zip`, content);
}

export async function downloadAllGisPackageZip(
  r: SubdivisionComputationResult,
  blockTiers: Record<string, AssetQualityTier>,
  plotTierOverrides: Record<string, AssetQualityTier>,
  allocation: FairLandAllocationResult | null,
  extraState?: ExportExtraState
) {
  const layers = buildExportLayers(r, blockTiers, plotTierOverrides, allocation, extraState);
  const geo = buildGeoJsonCollections(r, layers);
  const zip = new JSZip();

  addShapefileLayersToZip(r, layers, 'wgs', zip, 'Shapefile_WGS84_EPSG4326');
  addShapefileLayersToZip(
    r,
    layers,
    'utm',
    zip,
    `Shapefile_UTM${r.zone}${r.south ? 'S' : 'N'}`
  );

  zip.file('GeoJSON/Beerta_all_layers.json', JSON.stringify(geo.all, null, 2));
  Object.keys(geo.perLayer).forEach((k) => {
    zip.file(`GeoJSON/${k}.json`, JSON.stringify(geo.perLayer[k], null, 2));
  });

  zip.file(
    'Diiwaanka_Plots_iyo_HalfPlots.csv',
    buildPlotRegisterCSV(r, blockTiers, plotTierOverrides, allocation, extraState)
  );

  const content = await zip.generateAsync({ type: 'blob' });
  const refPrefix = extraState?.caseMeta?.referenceNumber
    ? `${extraState.caseMeta.referenceNumber}_`
    : '';
  triggerBrowserDownload(`${refPrefix}Beerta_Dhaxalka_GIS_Package.zip`, content);
}
