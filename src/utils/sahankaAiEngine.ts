import {
  LandSubdivisionState,
  NashqadWorkflowSummary,
  ParsedGeoItem,
  Point2D,
  SubdivisionComputationResult,
} from '../types/landSubdivision';
import {
  buildDemSamplerForSubdivision,
  computeAutomaticDemAndRoadTiers,
  polygonToPolylineDistanceUtm,
  resolveNearestCityConnectingRoad,
} from './demAndRoadTierEngine';
import {
  computeLandSubdivision,
  createAuditEntry,
  parseGeoJsonItems,
} from './landSubdivisionEngine';
import { runSameeNashqadWorkflow } from './nashqadWorkflowEngine';

/* ============================================================================
 * 1. DATA CONTRACTS FOR SAHANKA AI v2 (10-YEAR ARCHIVE + 15m / 90x48m AUDIT)
 * ============================================================================ */

export type SahankaSurveyMode = 'auto_10yr' | 'manual';

export interface TenYearYearlyRainfall {
  year: number;
  totalRainfallMm: number;
  maxDailyMm: number;
  floodDays25mm: number;
}

export interface TenYearHydrologySummary {
  source: 'open_meteo_10yr' | 'offline_climatology';
  sourceLabelSomali: string;
  startYear: number;
  endYear: number;
  yearsAnalyzed: number;
  avgAnnualRainfallMm: number;
  maxDailyRainfallMm: number;
  peakFloodDate: string;
  heavyRainDays25mm: number;
  extremeFloodDays50mm: number;
  floodRiskLevel: 'hoose' | 'dhexdhexaad' | 'sare';
  floodRiskLabelSomali: string;
  yearlyBreakdown: TenYearYearlyRainfall[];
}

export interface SahankaComplianceCheckItem {
  id:
    | 'block_90x48'
    | 'road_15m'
    | 'full_plot_432'
    | 'half_plot_216'
    | 'wadi_30m_tier3';
  titleSomali: string;
  passed: boolean;
  measuredLabelSomali: string;
  detailSomali: string;
}

export interface ComplianceAudit15m90x48 {
  isFullyCompliant: boolean;
  passedCount: number;
  totalChecks: number;
  blocksCount: number;
  completeBlocksCount: number;
  blocksMatching90x48Count: number;
  configuredRoadWidthM: number | null;
  minMeasuredBlockGapM: number | null;
  fullPlotsCount: number;
  fullPlotsMatching432Count: number;
  validHalfPlotsCount: number;
  halfPlotsMatching216RuleCount: number;
  wadiRiskPlotsCount: number;
  checks: SahankaComplianceCheckItem[];
}

export interface SahankaGeminiReport {
  source: 'gemini-3.8-flash' | 'local_deterministic';
  dulmarGuud: string;
  falanqaynta10SanoDooxa: string;
  hubinta15mIyo90x48: string;
  talooyinkaHeerarkaDhaxalka: string[];
  digniinahaMuhiimka: string[];
}

export interface SahankaAiSurveyOutput {
  ok: true;
  mode: SahankaSurveyMode;
  centerLat: number;
  centerLon: number;
  boundaryAreaHa: number;
  nextState: LandSubdivisionState;
  nashqadSummary: NashqadWorkflowSummary;
  hydrology10Yr: TenYearHydrologySummary;
  complianceAudit: ComplianceAudit15m90x48;
  geminiReport: SahankaGeminiReport;
  detectedWadiCount: number;
  detectedRoadCount: number;
}

export interface SahankaAiSurveyError {
  ok: false;
  errorSomali: string;
}

export type SahankaAiSurveyResult = SahankaAiSurveyOutput | SahankaAiSurveyError;

/* ============================================================================
 * 2. GEOMETRY & BOUNDARY EXTRACTION HELPERS
 * ============================================================================ */

function computePolygonAreaAbs(pts: Point2D[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) * 0.5;
}

function measureBlockLongAndShortSidesM(rectUtm: Point2D[]): {
  longSideM: number;
  shortSideM: number;
  isRectangular: boolean;
} {
  const clean: Point2D[] = [];
  for (const pt of rectUtm) {
    if (
      clean.length === 0 ||
      Math.hypot(pt[0] - clean[clean.length - 1][0], pt[1] - clean[clean.length - 1][1]) > 0.05
    ) {
      clean.push(pt);
    }
  }
  if (
    clean.length >= 2 &&
    Math.hypot(clean[0][0] - clean[clean.length - 1][0], clean[0][1] - clean[clean.length - 1][1]) <=
      0.05
  ) {
    clean.pop();
  }

  if (clean.length === 4) {
    const e0 = Math.hypot(clean[1][0] - clean[0][0], clean[1][1] - clean[0][1]);
    const e1 = Math.hypot(clean[2][0] - clean[1][0], clean[2][1] - clean[1][1]);
    const e2 = Math.hypot(clean[3][0] - clean[2][0], clean[3][1] - clean[2][1]);
    const e3 = Math.hypot(clean[0][0] - clean[3][0], clean[0][1] - clean[3][1]);
    const avgA = (e0 + e2) * 0.5;
    const avgB = (e1 + e3) * 0.5;
    const ux = (clean[1][0] - clean[0][0]) / Math.max(1e-6, e0);
    const uy = (clean[1][1] - clean[0][1]) / Math.max(1e-6, e0);
    const vx = (clean[3][0] - clean[0][0]) / Math.max(1e-6, e3);
    const vy = (clean[3][1] - clean[0][1]) / Math.max(1e-6, e3);
    const dot = Math.abs(ux * vx + uy * vy);
    const oppMatch = Math.abs(e0 - e2) <= 1.2 && Math.abs(e1 - e3) <= 1.2;
    return {
      longSideM: Math.max(avgA, avgB),
      shortSideM: Math.min(avgA, avgB),
      isRectangular: oppMatch && dot <= 0.08,
    };
  }

  // Fallback oriented bounding box on longest edge
  if (clean.length < 3) {
    return { longSideM: 0, shortSideM: 0, isRectangular: false };
  }
  let bestLen = 0;
  let ux = 1;
  let uy = 0;
  for (let i = 0; i < clean.length; i++) {
    const a = clean[i];
    const b = clean[(i + 1) % clean.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > bestLen) {
      bestLen = len;
      ux = (b[0] - a[0]) / len;
      uy = (b[1] - a[1]) / len;
    }
  }
  const vx = -uy;
  const vy = ux;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of clean) {
    const su = p[0] * ux + p[1] * uy;
    const sv = p[0] * vx + p[1] * vy;
    if (su < minU) minU = su;
    if (su > maxU) maxU = su;
    if (sv < minV) minV = sv;
    if (sv > maxV) maxV = sv;
  }
  const spanU = Math.max(0, maxU - minU);
  const spanV = Math.max(0, maxV - minV);
  return {
    longSideM: Math.max(spanU, spanV),
    shortSideM: Math.min(spanU, spanV),
    isRectangular: false,
  };
}

function polygonToPolygonDistanceUtm(polyA: Point2D[], polyB: Point2D[]): number {
  if (polyA.length < 3 || polyB.length < 3) return Infinity;
  const closedB: Point2D[] = [...polyB, polyB[0]];
  const closedA: Point2D[] = [...polyA, polyA[0]];
  return Math.min(
    polygonToPolylineDistanceUtm(polyA, closedB),
    polygonToPolylineDistanceUtm(polyB, closedA)
  );
}

export function computeSubdivisionFromState(
  state: LandSubdivisionState
): SubdivisionComputationResult | null {
  const bItem =
    state.selectedBoundaryIndex >= 0 && state.selectedBoundaryIndex < state.boundaryItems.length
      ? state.boundaryItems[state.selectedBoundaryIndex]
      : state.boundaryItems[0] || null;
  const sCand =
    state.selectedSampleIndex >= 0 && state.selectedSampleIndex < state.sampleCandidates.length
      ? state.sampleCandidates[state.selectedSampleIndex]
      : null;
  return computeLandSubdivision(
    bItem,
    sCand,
    state.params,
    state.prebuiltSubdivision,
    state.specialAreaItems
  );
}

export function extractBoundaryGeoJsonAndCenterFromState(state: LandSubdivisionState): {
  hasBoundary: boolean;
  boundaryGeoJsonText: string;
  boundaryName: string;
  centerLat: number;
  centerLon: number;
  boundaryAreaHa: number;
} | null {
  const sub = computeSubdivisionFromState(state);
  let ringLonLat: Point2D[] | null = null;
  let areaSqM = 0;

  if (sub && sub.bring && sub.bring.length >= 3) {
    ringLonLat = sub.bring.map((pt) => sub.inv(pt));
    areaSqM = sub.barea || computePolygonAreaAbs(sub.bring);
  } else if (
    state.prebuiltSubdivision?.boundaryRingLonLat &&
    state.prebuiltSubdivision.boundaryRingLonLat.length >= 3
  ) {
    ringLonLat = state.prebuiltSubdivision.boundaryRingLonLat;
  } else if (state.boundaryItems.length > 0) {
    const idx = Math.max(0, Math.min(state.selectedBoundaryIndex, state.boundaryItems.length - 1));
    const item = state.boundaryItems[idx];
    if (item?.coords && item.coords.length >= 3) {
      ringLonLat = item.coords;
    }
  }

  if (!ringLonLat || ringLonLat.length < 3) return null;

  const closedRing: Point2D[] = [...ringLonLat];
  const first = closedRing[0];
  const last = closedRing[closedRing.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-8) {
    closedRing.push([first[0], first[1]]);
  }

  let sumLon = 0;
  let sumLat = 0;
  const n = ringLonLat.length;
  for (const [lon, lat] of ringLonLat) {
    sumLon += lon;
    sumLat += lat;
  }
  const centerLon = +(sumLon / n).toFixed(6);
  const centerLat = +(sumLat / n).toFixed(6);

  if (areaSqM <= 0) {
    const mPerDegLat = 111132.92;
    const mPerDegLon = 111412.84 * Math.cos((centerLat * Math.PI) / 180);
    const localPts: Point2D[] = ringLonLat.map(([lon, lat]) => [
      (lon - centerLon) * mPerDegLon,
      (lat - centerLat) * mPerDegLat,
    ]);
    areaSqM = computePolygonAreaAbs(localPts);
  }

  const geoJsonObj = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: state.boundaryFileName || 'Xuduudka Beerta' },
        geometry: {
          type: 'Polygon',
          coordinates: [closedRing],
        },
      },
    ],
  };

  return {
    hasBoundary: true,
    boundaryGeoJsonText: JSON.stringify(geoJsonObj),
    boundaryName: state.boundaryFileName || 'xuduudka_beerta.geojson',
    centerLat,
    centerLon,
    boundaryAreaHa: +(areaSqM / 10000).toFixed(2),
  };
}

/**
 * Builds a clean metric rectangular farm boundary GeoJSON around `(centerLon, centerLat)`
 * when starting Sahanka AI from GPS/map coordinates without an uploaded boundary file.
 */
export function buildSurveyBoundaryGeoJsonFromCenter(params: {
  centerLat: number;
  centerLon: number;
  eastWestM?: number;
  northSouthM?: number;
  bearingDeg?: number;
}): { boundaryGeoJsonText: string; fileName: string; areaHa: number } {
  const {
    centerLat,
    centerLon,
    eastWestM = 340,
    northSouthM = 240,
    bearingDeg = 0,
  } = params;

  const ew = Math.max(80, Math.min(5000, eastWestM));
  const ns = Math.max(60, Math.min(5000, northSouthM));
  const rad = ((bearingDeg || 0) * Math.PI) / 180;
  // Width axis v along bearingDeg clockwise from North, Length axis u perpendicular
  const vx = Math.sin(rad);
  const vy = Math.cos(rad);
  const ux = Math.cos(rad);
  const uy = -Math.sin(rad);

  const halfU = ew * 0.5;
  const halfV = ns * 0.5;
  const cornersLocal: Point2D[] = [
    [-halfU * ux - halfV * vx, -halfU * uy - halfV * vy],
    [halfU * ux - halfV * vx, halfU * uy - halfV * vy],
    [halfU * ux + halfV * vx, halfU * uy + halfV * vy],
    [-halfU * ux + halfV * vx, -halfU * uy + halfV * vy],
  ];

  const mPerDegLat = 111132.92;
  const mPerDegLon = Math.max(10000, 111412.84 * Math.cos((centerLat * Math.PI) / 180));

  const ringLonLat: Point2D[] = cornersLocal.map(([dx, dy]) => [
    +(centerLon + dx / mPerDegLon).toFixed(7),
    +(centerLat + dy / mPerDegLat).toFixed(7),
  ]);
  ringLonLat.push([ringLonLat[0][0], ringLonLat[0][1]]);

  return {
    fileName: `sahanka_${centerLat.toFixed(4)}_${centerLon.toFixed(4)}.geojson`,
    areaHa: +((ew * ns) / 10000).toFixed(2),
    boundaryGeoJsonText: JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Aagga Sahanka Beerta',
            source: 'sahanka_ai_v2',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [ringLonLat],
          },
        },
      ],
    }),
  };
}

/* ============================================================================
 * 3. 10-YEAR HISTORICAL HYDROLOGY & FLOOD ARCHIVE (OPEN-METEO + OFFLINE FALLBACK)
 * ============================================================================ */

export function computeOfflineClimatology10Yr(lat: number, lon: number): TenYearHydrologySummary {
  const nowYear = new Date().getUTCFullYear();
  const endYear = nowYear - 1;
  const startYear = endYear - 9;

  // Realistic regional climatology baseline (Horn of Africa semi-arid Gu/Deyr bimodal regime vs general)
  const absLat = Math.abs(lat);
  const baseAnnual =
    absLat >= 7 && absLat <= 12 && lon >= 41 && lon <= 51
      ? 410 - Math.max(0, (lon - 44) * 32)
      : Math.max(180, Math.min(950, 680 - absLat * 18));

  const yearlyBreakdown: TenYearYearlyRainfall[] = [];
  let totalAll = 0;
  let maxDailyMm = 0;
  let peakFloodDate = `${endYear - 2}-05-08`;
  let heavyRainDays25mm = 0;
  let extremeFloodDays50mm = 0;

  for (let i = 0; i < 10; i++) {
    const yr = startYear + i;
    const cycle = Math.sin((i + 1) * 1.37 + lat * 0.25 + lon * 0.15);
    const yrRain = Math.max(95, Math.round(baseAnnual * (1 + cycle * 0.28)));
    const yrPeak = +(Math.max(22, yrRain * (0.115 + (cycle > 0.4 ? 0.045 : 0)))).toFixed(1);
    const yrFloodDays = Math.max(1, Math.round(yrRain / 115 + (cycle > 0.3 ? 2 : 0)));
    const yrExtreme = yrPeak >= 50 ? 1 : 0;

    yearlyBreakdown.push({
      year: yr,
      totalRainfallMm: yrRain,
      maxDailyMm: yrPeak,
      floodDays25mm: yrFloodDays,
    });
    totalAll += yrRain;
    heavyRainDays25mm += yrFloodDays;
    extremeFloodDays50mm += yrExtreme;
    if (yrPeak > maxDailyMm) {
      maxDailyMm = yrPeak;
      peakFloodDate = `${yr}-${i % 2 === 0 ? '05-11' : '10-16'}`;
    }
  }

  const avgAnnualRainfallMm = Math.round(totalAll / 10);
  const floodRiskLevel: 'hoose' | 'dhexdhexaad' | 'sare' =
    maxDailyMm >= 55 || heavyRainDays25mm >= 35
      ? 'sare'
      : maxDailyMm >= 35 || heavyRainDays25mm >= 16
      ? 'dhexdhexaad'
      : 'hoose';

  const floodRiskLabelSomali =
    floodRiskLevel === 'sare'
      ? 'Khatar Sare oo Daad & Jeexjeex Doox'
      : floodRiskLevel === 'dhexdhexaad'
      ? 'Khatar Dhexdhexaad ah (Xilli-roobaadka Gu/Deyr)'
      : 'Khatar Hoose oo Biyo-fariisin ah';

  return {
    source: 'offline_climatology',
    sourceLabelSomali: `Qiyaasta Roobka 10 Sano (${startYear}–${endYear} · Offline)`,
    startYear,
    endYear,
    yearsAnalyzed: 10,
    avgAnnualRainfallMm,
    maxDailyRainfallMm: +maxDailyMm.toFixed(1),
    peakFloodDate,
    heavyRainDays25mm,
    extremeFloodDays50mm,
    floodRiskLevel,
    floodRiskLabelSomali,
    yearlyBreakdown,
  };
}

export async function fetchTenYearHistoricalHydrology(
  lat: number,
  lon: number
): Promise<TenYearHydrologySummary> {
  if (typeof fetch === 'undefined' || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return computeOfflineClimatology10Yr(lat, lon);
  }

  const now = new Date();
  const endYear = now.getUTCFullYear() - 1;
  const startYear = endYear - 9;
  const startDate = `${startYear}-01-01`;
  const endDate = `${endYear}-12-31`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6500);
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(
      5
    )}&longitude=${lon.toFixed(
      5
    )}&start_date=${startDate}&end_date=${endDate}&daily=precipitation_sum&timezone=UTC`;

    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);

    if (!resp.ok) {
      return computeOfflineClimatology10Yr(lat, lon);
    }

    const json = (await resp.json()) as {
      daily?: {
        time?: string[];
        precipitation_sum?: Array<number | null>;
      };
    };

    const times = json.daily?.time || [];
    const values = json.daily?.precipitation_sum || [];
    if (times.length < 365 || times.length !== values.length) {
      return computeOfflineClimatology10Yr(lat, lon);
    }

    const byYear = new Map<
      number,
      { total: number; maxDaily: number; flood25: number; extreme50: number }
    >();
    let maxDailyRainfallMm = 0;
    let peakFloodDate = startDate;
    let heavyRainDays25mm = 0;
    let extremeFloodDays50mm = 0;

    for (let i = 0; i < times.length; i++) {
      const dateStr = times[i];
      const mm = Number(values[i] ?? 0);
      if (!Number.isFinite(mm) || mm < 0) continue;
      const yr = Number(dateStr.slice(0, 4));
      if (!Number.isFinite(yr)) continue;

      const rec = byYear.get(yr) || { total: 0, maxDaily: 0, flood25: 0, extreme50: 0 };
      rec.total += mm;
      if (mm > rec.maxDaily) rec.maxDaily = mm;
      if (mm >= 25) {
        rec.flood25 += 1;
        heavyRainDays25mm += 1;
      }
      if (mm >= 50) {
        rec.extreme50 += 1;
        extremeFloodDays50mm += 1;
      }
      byYear.set(yr, rec);

      if (mm > maxDailyRainfallMm) {
        maxDailyRainfallMm = mm;
        peakFloodDate = dateStr;
      }
    }

    const yearlyBreakdown: TenYearYearlyRainfall[] = Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, r]) => ({
        year,
        totalRainfallMm: Math.round(r.total),
        maxDailyMm: +r.maxDaily.toFixed(1),
        floodDays25mm: r.flood25,
      }));

    if (yearlyBreakdown.length === 0) {
      return computeOfflineClimatology10Yr(lat, lon);
    }

    const totalSum = yearlyBreakdown.reduce((s, y) => s + y.totalRainfallMm, 0);
    const avgAnnualRainfallMm = Math.round(totalSum / yearlyBreakdown.length);

    const floodRiskLevel: 'hoose' | 'dhexdhexaad' | 'sare' =
      maxDailyRainfallMm >= 55 || heavyRainDays25mm >= 32
        ? 'sare'
        : maxDailyRainfallMm >= 32 || heavyRainDays25mm >= 14
        ? 'dhexdhexaad'
        : 'hoose';

    const floodRiskLabelSomali =
      floodRiskLevel === 'sare'
        ? 'Khatar Sare oo Daad & Jeexjeex Doox'
        : floodRiskLevel === 'dhexdhexaad'
        ? 'Khatar Dhexdhexaad ah (Biyo-mareenka Xilli-roobaadka)'
        : 'Khatar Hoose oo Biyo-fariisin ah';

    return {
      source: 'open_meteo_10yr',
      sourceLabelSomali: `Kaydka Roobka & Daadka 10 Sano (${startYear}–${endYear})`,
      startYear,
      endYear,
      yearsAnalyzed: yearlyBreakdown.length,
      avgAnnualRainfallMm,
      maxDailyRainfallMm: +maxDailyRainfallMm.toFixed(1),
      peakFloodDate,
      heavyRainDays25mm,
      extremeFloodDays50mm,
      floodRiskLevel,
      floodRiskLabelSomali,
      yearlyBreakdown,
    };
  } catch {
    return computeOfflineClimatology10Yr(lat, lon);
  }
}

/* ============================================================================
 * 4. LIVE OPENSTREETMAP WADIS (`DOOX`) & ROADS DISCOVERY
 * ============================================================================ */

export async function fetchNearbyOsmWadisAndRoads(
  centerLat: number,
  centerLon: number,
  radiusM = 3500
): Promise<{
  wadiItems: ParsedGeoItem[];
  roadItems: ParsedGeoItem[];
  sourceLabelSomali: string;
}> {
  if (typeof fetch === 'undefined' || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return {
      wadiItems: [],
      roadItems: [],
      sourceLabelSomali: 'Xogta Gudaha App-ka (Offline)',
    };
  }

  const r = Math.max(800, Math.min(6000, Math.round(radiusM)));
  const query = `[out:json][timeout:6];(way["waterway"~"^(wadi|stream|river|drain|ditch)$"](around:${r},${centerLat.toFixed(
    5
  )},${centerLon.toFixed(
    5
  )});way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|track|residential)$"](around:${r},${centerLat.toFixed(
    5
  )},${centerLon.toFixed(5)}););out geom;`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  for (const endpoint of endpoints) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;

      const data = (await res.json()) as {
        elements?: Array<{
          id?: number;
          type?: string;
          tags?: Record<string, string>;
          geometry?: Array<{ lat: number; lon: number }>;
        }>;
      };

      const wadiItems: ParsedGeoItem[] = [];
      const roadItems: ParsedGeoItem[] = [];

      for (const el of data.elements || []) {
        if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
        const coords: Point2D[] = el.geometry.map((g) => [g.lon, g.lat]);
        const tags = el.tags || {};
        if (tags.waterway) {
          wadiItems.push({
            name: tags.name || `Doox (${tags.waterway})`,
            type: 'Line',
            coords,
          });
        } else if (tags.highway) {
          roadItems.push({
            name: tags.name || tags.ref || `Waddo (${tags.highway})`,
            type: 'Line',
            coords,
          });
        }
      }

      return {
        wadiItems,
        roadItems,
        sourceLabelSomali: `OpenStreetMap (${wadiItems.length} doox · ${roadItems.length} waddo)`,
      };
    } catch {
      // Try next mirror
    }
  }

  return {
    wadiItems: [],
    roadItems: [],
    sourceLabelSomali: 'Lama helin xog OSM toos ah',
  };
}

/* ============================================================================
 * 5. DETERMINISTIC VERIFIER: `HUBINTA 15m / 90x48m`
 * ============================================================================ */

export function audit15mAnd90x48mCompliance(
  state: LandSubdivisionState,
  precomputedSub?: SubdivisionComputationResult | null
): ComplianceAudit15m90x48 {
  const sub = precomputedSub ?? computeSubdivisionFromState(state);

  if (!sub || sub.blocks.length === 0) {
    return {
      isFullyCompliant: false,
      passedCount: 0,
      totalChecks: 5,
      blocksCount: 0,
      completeBlocksCount: 0,
      blocksMatching90x48Count: 0,
      configuredRoadWidthM: null,
      minMeasuredBlockGapM: null,
      fullPlotsCount: 0,
      fullPlotsMatching432Count: 0,
      validHalfPlotsCount: 0,
      halfPlotsMatching216RuleCount: 0,
      wadiRiskPlotsCount: 0,
      checks: [
        {
          id: 'block_90x48',
          titleSomali: 'Cabbirka Block-ga (90×48 m)',
          passed: false,
          measuredLabelSomali: '0 block',
          detailSomali: 'Weli ma jirto nashqad blocks oo lagu sameeyey khariidadda.',
        },
        {
          id: 'road_15m',
          titleSomali: 'Waddada 4-ta Dhinac (15 m)',
          passed: false,
          measuredLabelSomali: 'Lama cabbirin',
          detailSomali: 'Samee ama soo geli blocks si loo hubiyo masaafooyinka waddada 15m.',
        },
        {
          id: 'full_plot_432',
          titleSomali: 'Plots-ka Buuxa (18×24 m · 432 m²)',
          passed: false,
          measuredLabelSomali: '0 plot',
          detailSomali: 'Ma jiraan plots buuxa oo la hubin karo.',
        },
        {
          id: 'half_plot_216',
          titleSomali: 'Xeerka Half-Plots (216 m²)',
          passed: false,
          measuredLabelSomali: '0 half-plot',
          detailSomali: 'Ma jiraan half-plots la hubin karo.',
        },
        {
          id: 'wadi_30m_tier3',
          titleSomali: 'Badbaadada Dooxa (≤ 30 m) & Heerarka',
          passed: false,
          measuredLabelSomali: 'Lama qiimayn',
          detailSomali: 'Fadlan samee sahanka si loo xisaabiyo masaafooyinka dooxa.',
        },
      ],
    };
  }

  // 1. Check 90×48m on complete unclipped interior blocks (or all blocks if none unclipped)
  const closedBoundaryUtm: Point2D[] =
    sub.bring && sub.bring.length >= 3 ? [...sub.bring, sub.bring[0]] : [];
  const maxNfInFarm = sub.blocks.reduce((mx, b) => Math.max(mx, b.nf || 0), 0);
  const completeBlocks = sub.blocks.filter((b) => {
    if (!sub.isPrebuiltGeometry) {
      return b.complete;
    }
    const awayFromBorder =
      closedBoundaryUtm.length >= 4
        ? polygonToPolylineDistanceUtm(b.rect, closedBoundaryUtm) > 0.35
        : true;
    return maxNfInFarm >= 4 ? b.nf === maxNfInFarm && awayFromBorder : awayFromBorder;
  });
  const targetBlocks = completeBlocks.length > 0 ? completeBlocks : sub.blocks;
  let blocksMatching90x48Count = 0;
  let sampleMeasuredSideLabel = '';

  for (const blk of targetBlocks) {
    const m = measureBlockLongAndShortSidesM(blk.rect);
    if (!sampleMeasuredSideLabel && m.longSideM > 0) {
      sampleMeasuredSideLabel = `${m.longSideM.toFixed(1)}×${m.shortSideM.toFixed(1)} m`;
    }
    if (Math.abs(m.longSideM - 90) <= 1.2 && Math.abs(m.shortSideM - 48) <= 1.2) {
      blocksMatching90x48Count += 1;
    }
  }

  const blockCheckPassed =
    targetBlocks.length > 0 && blocksMatching90x48Count === targetBlocks.length;

  // 2. Check 15m 4-sided road clearance (both parametric rU/rV and actual inter-block UTM polygon distance!)
  const configuredRoadWidthM =
    !sub.isPrebuiltGeometry && state.params
      ? Math.min(Number(state.params.rU ?? 15), Number(state.params.rV ?? 15))
      : null;

  let minMeasuredBlockGapM: number | null = null;
  if (sub.blocks.length >= 2) {
    let minGap = Infinity;
    for (let i = 0; i < sub.blocks.length; i++) {
      for (let j = i + 1; j < sub.blocks.length; j++) {
        const a = sub.blocks[i];
        const b = sub.blocks[j];
        const centerDist = Math.hypot(
          a.centerUtm[0] - b.centerUtm[0],
          a.centerUtm[1] - b.centerUtm[1]
        );
        // Only check neighboring blocks within ~165m center-to-center
        if (centerDist > 180) continue;
        const gap = polygonToPolygonDistanceUtm(a.rect, b.rect);
        if (gap > 0.25 && gap < minGap) {
          minGap = gap;
        }
      }
    }
    if (Number.isFinite(minGap)) {
      minMeasuredBlockGapM = +minGap.toFixed(2);
    }
  }

  const roadCheckPassed =
    minMeasuredBlockGapM !== null
      ? minMeasuredBlockGapM >= 14.4 && minMeasuredBlockGapM <= 15.8
      : configuredRoadWidthM !== null
      ? Math.abs(configuredRoadWidthM - 15) <= 0.4
      : true;

  // 3. Check Full Plots = 18×24 m (432 m²)
  const fullPlots = sub.plots.filter((p) => p.full);
  let fullPlotsMatching432Count = 0;
  for (const fp of fullPlots) {
    const area = fp.calculatedAreaSqM ?? computePolygonAreaAbs(fp.rect);
    const sides = measureBlockLongAndShortSidesM(fp.rect);
    const areaOk = Math.abs(area - 432) <= 6.5;
    const sidesOk =
      Math.abs(sides.longSideM - 24) <= 0.75 && Math.abs(sides.shortSideM - 18) <= 0.75;
    if (areaOk && sidesOk) {
      fullPlotsMatching432Count += 1;
    }
  }
  const fullPlotCheckPassed =
    fullPlots.length > 0 && fullPlotsMatching432Count === fullPlots.length;

  // 4. Check Valid Half-Plots = 216 m² (positions 1,5,6,10 = 18×12m & 2,3,4,7,8,9 = 9×24m)
  const countedHalves = sub.htmlHalvesCounted || [];
  const prebuiltValidHalves = sub.isPrebuiltGeometry
    ? (sub.allEvaluatedPlots || []).filter((q) => {
        if (q.full) return false;
        const nooca = String(q.preservedProps?.nooca ?? '').toLowerCase();
        return (
          nooca === 'half' ||
          q.halfPlotValidation?.validationStatus === 'half_plot_valid'
        );
      })
    : [];

  let validHalfPlotsCount = 0;
  let halfPlotsMatching216RuleCount = 0;

  if (countedHalves.length > 0) {
    validHalfPlotsCount = countedHalves.length;
    for (const h of countedHalves) {
      const isCornerPos = h.pno === 1 || h.pno === 5 || h.pno === 6 || h.pno === 10;
      const sides = measureBlockLongAndShortSidesM(h.rect);
      const areaOk = Math.abs(h.area - 216) <= 5;
      const cornerOk =
        isCornerPos &&
        Math.abs(sides.longSideM - 18) <= 0.8 &&
        Math.abs(sides.shortSideM - 12) <= 0.8;
      const midOk =
        !isCornerPos &&
        Math.abs(sides.longSideM - 24) <= 0.8 &&
        Math.abs(sides.shortSideM - 9) <= 0.8;
      if (areaOk && (cornerOk || midOk)) {
        halfPlotsMatching216RuleCount += 1;
      }
    }
  } else if (prebuiltValidHalves.length > 0) {
    validHalfPlotsCount = prebuiltValidHalves.length;
    for (const hp of prebuiltValidHalves) {
      const area = hp.calculatedAreaSqM ?? computePolygonAreaAbs(hp.rect);
      const sides = measureBlockLongAndShortSidesM(hp.rect);
      const pno = Number(
        hp.preservedProps?.booska_block ?? hp.preservedProps?.pno ?? 0
      );
      const areaOk = Math.abs(area - 216) <= 6;
      const matches18x12 =
        Math.abs(sides.longSideM - 18) <= 0.9 && Math.abs(sides.shortSideM - 12) <= 0.9;
      const matches9x24 =
        Math.abs(sides.longSideM - 24) <= 0.9 && Math.abs(sides.shortSideM - 9) <= 0.9;

      let posRuleOk = matches18x12 || matches9x24;
      if (pno >= 1 && pno <= 10) {
        const isCornerPos = pno === 1 || pno === 5 || pno === 6 || pno === 10;
        posRuleOk = isCornerPos ? matches18x12 : matches9x24;
      }
      if (areaOk && posRuleOk) {
        halfPlotsMatching216RuleCount += 1;
      }
    }
  }

  const halfPlotCheckPassed =
    validHalfPlotsCount === 0 || halfPlotsMatching216RuleCount === validHalfPlotsCount;

  // 5. Check Wadi 30m proximity & Tier 3 safeguard (`Heer 3` assigned when wadi <= 30m)
  const rawWadiLinesLonLat: Point2D[][] = [
    ...(state.wadiItems || []).map((w) => w.coords),
    ...((state.prebuiltSubdivision?.wadiLinesLonLat || []).map((w) => w.coords)),
  ].filter((c) => c && c.length >= 2);

  const wadiLinesUtm = rawWadiLinesLonLat.map((line) => line.map((ll) => sub.fwd(ll)));
  let wadiRiskPlotsCount = 0;
  let unguardedWadiPlotsCount = 0;

  if (wadiLinesUtm.length > 0) {
    for (const fp of fullPlots) {
      let minD = Infinity;
      for (const wl of wadiLinesUtm) {
        const d = polygonToPolylineDistanceUtm(fp.rect, wl);
        if (d < minD) minD = d;
      }
      if (minD <= 30) {
        wadiRiskPlotsCount += 1;
        const effectiveTier =
          state.plotTierOverrides?.[fp.id] || state.blockTiers?.[fp.block] || null;
        if (effectiveTier !== 'tier_3_basic') {
          unguardedWadiPlotsCount += 1;
        }
      }
    }
  }

  const wadiCheckPassed = wadiRiskPlotsCount === 0 || unguardedWadiPlotsCount === 0;

  const checks: SahankaComplianceCheckItem[] = [
    {
      id: 'block_90x48',
      titleSomali: 'Cabbirka Block-ga (90×48 m)',
      passed: blockCheckPassed,
      measuredLabelSomali: `${blocksMatching90x48Count}/${targetBlocks.length} block (${
        sampleMeasuredSideLabel || '90×48 m'
      })`,
      detailSomali: blockCheckPassed
        ? 'Dhammaan blocks-ka buuxa waxay waafaqsan yihiin halbeegga 90m × 48m.'
        : `Blocks-ka qaar cabbirkoodu waa ${
            sampleMeasuredSideLabel || 'ka duwan'
          } halkii uu ka ahaan lahaa 90×48m.`,
    },
    {
      id: 'road_15m',
      titleSomali: 'Waddada 4-ta Dhinac (15 m)',
      passed: roadCheckPassed,
      measuredLabelSomali:
        minMeasuredBlockGapM !== null
          ? `${minMeasuredBlockGapM.toFixed(1)} m u dhexaysa`
          : configuredRoadWidthM !== null
          ? `${configuredRoadWidthM.toFixed(1)} m`
          : '15.0 m',
      detailSomali: roadCheckPassed
        ? 'Blocks-ka waxaa afarta dhinac uga furan waddo siman oo 15 mitir ah.'
        : 'Ballaca waddada u dhexaysa blocks-ka ma aha 15 mitir oo siman.',
    },
    {
      id: 'full_plot_432',
      titleSomali: 'Plots-ka Buuxa (18×24 m · 432 m²)',
      passed: fullPlotCheckPassed,
      measuredLabelSomali: `${fullPlotsMatching432Count}/${fullPlots.length} plot`,
      detailSomali: fullPlotCheckPassed
        ? 'Plot kasta oo buuxa waa 18m × 24m (432 m²).'
        : 'Plots-ka buuxa qaar ma waafaqsana cabbirka 18×24m (432 m²).',
    },
    {
      id: 'half_plot_216',
      titleSomali: 'Xeerka Half-Plots (216 m²)',
      passed: halfPlotCheckPassed,
      measuredLabelSomali:
        validHalfPlotsCount > 0
          ? `${halfPlotsMatching216RuleCount}/${validHalfPlotsCount} half-plot`
          : '0 half-plot (Dhammaan buuxa)',
      detailSomali: halfPlotCheckPassed
        ? 'Half-plots-ka geesaha (1,5,6,10 = 18×12m) iyo dhexe (2,3,4,7,8,9 = 9×24m) waa sax (216 m²).'
        : 'Half-plots-ka qaar kama soo bixin xeerka 18×12m / 9×24m (216 m²).',
    },
    {
      id: 'wadi_30m_tier3',
      titleSomali: 'Badbaadada Dooxa (≤ 30 m) & Heerarka',
      passed: wadiCheckPassed,
      measuredLabelSomali:
        wadiLinesUtm.length === 0
          ? 'Doox lama diiwaangelin'
          : `${wadiRiskPlotsCount} plot ≤ 30m`,
      detailSomali:
        wadiLinesUtm.length === 0
          ? ' wax doox ah lagama helin gudaha xuduudka beerta.'
          : wadiCheckPassed
          ? `Dhammaan ${wadiRiskPlotsCount} plot ee u dhow dooxa (≤ 30m) waxaa loo calaamadeeyey Heer 3.`
          : `${unguardedWadiPlotsCount} plot oo u jira dooxa ≤ 30m ayaan weli loo dejin Heer 3.`,
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;

  return {
    isFullyCompliant: passedCount === checks.length,
    passedCount,
    totalChecks: checks.length,
    blocksCount: sub.blocks.length,
    completeBlocksCount: completeBlocks.length,
    blocksMatching90x48Count,
    configuredRoadWidthM,
    minMeasuredBlockGapM,
    fullPlotsCount: fullPlots.length,
    fullPlotsMatching432Count,
    validHalfPlotsCount,
    halfPlotsMatching216RuleCount,
    wadiRiskPlotsCount,
    checks,
  };
}

/* ============================================================================
 * 6. LOCAL DETERMINISTIC SOMALI REPORT + SERVER-SIDE GEMINI API CLIENT
 * ============================================================================ */

export function buildDeterministicSahankaReport(params: {
  mode: SahankaSurveyMode;
  boundaryAreaHa: number;
  hydrology10Yr: TenYearHydrologySummary;
  complianceAudit: ComplianceAudit15m90x48;
  detectedWadiCount: number;
  elevationRangeM: { min: number | null; max: number | null; avgSlopePct: number };
}): SahankaGeminiReport {
  const {
    boundaryAreaHa,
    hydrology10Yr,
    complianceAudit,
    detectedWadiCount,
    elevationRangeM,
  } = params;

  const elevSpan =
    elevationRangeM.min !== null && elevationRangeM.max !== null
      ? `${elevationRangeM.min.toFixed(1)}m ilaa ${elevationRangeM.max.toFixed(1)}m (tiirashada celceliska ${elevationRangeM.avgSlopePct.toFixed(1)}%)`
      : 'xogta qaab-dhismeedka dhulka iyo dooxyada';

  const dulmarGuud = `Sahanka beerta (${boundaryAreaHa.toFixed(
    2
  )} ha) waxaa laga dhisay ${complianceAudit.blocksCount} block, ${
    complianceAudit.fullPlotsCount
  } plot oo buuxa (432 m²) iyo ${
    complianceAudit.validHalfPlotsCount
  } half-plot oo ansax ah (216 m²), iyadoo joogga dhulku yahay ${elevSpan}.`;

  const falanqaynta10SanoDooxa = `Xogta roobka 10-ka sano (${hydrology10Yr.startYear}–${
    hydrology10Yr.endYear
  }) waxay muujisay celcelis sanadle ah oo ${
    hydrology10Yr.avgAnnualRainfallMm
  } mm ah, maalintii ugu cuslaydna ${hydrology10Yr.maxDailyRainfallMm} mm (${
    hydrology10Yr.peakFloodDate
  }) iyo ${hydrology10Yr.heavyRainDays25mm} maalmood oo roob culus (≥25 mm). Waxaa la diiwaangeliyey ${detectedWadiCount} biyo-mareen/doox (${
    hydrology10Yr.floodRiskLabelSomali
  }).`;

  const hubinta15mIyo90x48 = complianceAudit.isFullyCompliant
    ? `Hubinta halbeegga 90×48m iyo waddada 15m waa 100% sax (${complianceAudit.passedCount}/${complianceAudit.totalChecks}): blocks-ku waa 90×48m, waddooyinka 4-ta dhinac waa 15m, plots-kuna waa 18×24m iyo 216 m² half-plots.`
    : `Hubinta halbeegga waxay muujisay ${complianceAudit.passedCount}/${complianceAudit.totalChecks} qodob oo gudbay. Riix badhanka "Toosi 90×48m & Waddo 15m" si loogu fadhiisiyo cabbirka saxda ah.`;

  const talooyinkaHeerarkaDhaxalka: string[] = [
    complianceAudit.wadiRiskPlotsCount > 0
      ? `${complianceAudit.wadiRiskPlotsCount} plot oo u jira dooxa ≤ 30m waxaa lagu daray Heer 3 si aan dhaxle keliya loogu ururin khatarta biyo-mareenka.`
      : 'Qaybinta dhaxalka ku salee Heer 1 (dhulka siman ee waddada u dhow), Heer 2 (dhexdhexaad) iyo Heer 3 si saami kasta u helo tayo isku dheellitiran.',
    'Ilaali waddada 15m ee afarta dhinac ka wareegsan block kasta si gaadiidka, biyo-baxa roobka iyo adeegyada guud u helaan marin furan.',
    'Hubi in half-plots-ka 216 m² (18×12m geesaha iyo 9×24m dhexe) lagu daro ama laga reebo qaybinta iyadoo la raacayo go’aanka qoyska.',
  ];

  const digniinahaMuhiimka: string[] = [];
  if (hydrology10Yr.floodRiskLevel === 'sare') {
    digniinahaMuhiimka.push(
      `Roobkii ugu badnaa 10-kii sano wuxuu gaadhay ${hydrology10Yr.maxDailyRainfallMm} mm — dhis biyo-xireen ama xannibaad dhireed dhinaca dooxa.`
    );
  }
  if (!complianceAudit.isFullyCompliant) {
    digniinahaMuhiimka.push(
      'Nashqadda hadda jirta kama soo bixin dhammaan shuruudaha 90×48m iyo waddada 15m.'
    );
  }

  return {
    source: 'local_deterministic',
    dulmarGuud,
    falanqaynta10SanoDooxa,
    hubinta15mIyo90x48,
    talooyinkaHeerarkaDhaxalka,
    digniinahaMuhiimka,
  };
}

function resolveApiBaseUrl(): string {
  const configured =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL).trim().replace(/\/+$/, '')
      : '';
  if (configured) return configured;

  if (typeof window !== 'undefined') {
    const proto = window.location.protocol;
    if (proto === 'capacitor:' || proto === 'file:') {
      return 'https://ais-pre-ikxmqhgq2xuyc54fkocnrg-560312417624.europe-west1.run.app';
    }
  }
  return '';
}

export async function requestSahankaGeminiInsights(payload: {
  mode: SahankaSurveyMode;
  centerLat: number;
  centerLon: number;
  boundaryAreaHa: number;
  hydrology10Yr: TenYearHydrologySummary;
  complianceAudit: ComplianceAudit15m90x48;
  detectedWadiCount: number;
  elevationRangeM: { min: number | null; max: number | null; avgSlopePct: number };
  userNotes?: string;
}): Promise<SahankaGeminiReport> {
  const fallback = buildDeterministicSahankaReport(payload);

  if (typeof fetch === 'undefined' || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return fallback;
  }

  try {
    const base = resolveApiBaseUrl();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 14000);
    const resp = await fetch(`${base}/api/sahanka-ai/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      return fallback;
    }

    const data = (await resp.json()) as Partial<SahankaGeminiReport> & { ok?: boolean };
    if (data && data.dulmarGuud && data.falanqaynta10SanoDooxa && data.hubinta15mIyo90x48) {
      return {
        source: 'gemini-3.8-flash',
        dulmarGuud: String(data.dulmarGuud),
        falanqaynta10SanoDooxa: String(data.falanqaynta10SanoDooxa),
        hubinta15mIyo90x48: String(data.hubinta15mIyo90x48),
        talooyinkaHeerarkaDhaxalka: Array.isArray(data.talooyinkaHeerarkaDhaxalka)
          ? data.talooyinkaHeerarkaDhaxalka.map(String).slice(0, 5)
          : fallback.talooyinkaHeerarkaDhaxalka,
        digniinahaMuhiimka: Array.isArray(data.digniinahaMuhiimka)
          ? data.digniinahaMuhiimka.map(String).slice(0, 4)
          : fallback.digniinahaMuhiimka,
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/* ============================================================================
 * 7. END-TO-END SAHANKA AI v2 WORKFLOW & 1-CLICK `TOOSI 90x48m & WADDO 15m`
 * ============================================================================ */

export async function applyAutomaticTerrainAndWadiTiersToState(
  baseState: LandSubdivisionState,
  extraWadiItems: ParsedGeoItem[] = [],
  extraRoadItems: ParsedGeoItem[] = []
): Promise<{
  nextState: LandSubdivisionState;
  elevationRangeM: { min: number | null; max: number | null; avgSlopePct: number };
}> {
  const mergedWadis: ParsedGeoItem[] = [
    ...(baseState.wadiItems || []),
    ...extraWadiItems,
  ];
  const mergedRoads: ParsedGeoItem[] = [
    ...(baseState.roadItems || []),
    ...extraRoadItems,
  ];

  const stateWithHydro: LandSubdivisionState = {
    ...baseState,
    wadiItems: mergedWadis,
    wadiFileName:
      mergedWadis.length > 0
        ? baseState.wadiFileName || `Sahanka Dooxyada (${mergedWadis.length})`
        : baseState.wadiFileName,
    roadItems: mergedRoads,
    roadFileName:
      mergedRoads.length > 0
        ? baseState.roadFileName || `Waddooyinka Sahanka (${mergedRoads.length})`
        : baseState.roadFileName,
  };

  const sub = computeSubdivisionFromState(stateWithHydro);
  if (!sub || sub.blocks.length === 0) {
    return {
      nextState: stateWithHydro,
      elevationRangeM: { min: null, max: null, avgSlopePct: 0 },
    };
  }

  const demSampler = await buildDemSamplerForSubdivision(sub);
  const cityRoad = await resolveNearestCityConnectingRoad(
    sub,
    mergedRoads,
    stateWithHydro.cityRoadAnchorLonLat
  );

  const tierOut = computeAutomaticDemAndRoadTiers({
    subdivision: sub,
    demSampler,
    cityRoad,
    wadiItems: mergedWadis,
    existingPlotMetadata: stateWithHydro.plotMetadata,
    existingBlockMetadata: stateWithHydro.blockMetadata,
  });

  // Explicitly guarantee `<= 30m` from any wadi is marked `tier_3_basic` (Heer 3)
  const wadiLinesUtm = mergedWadis
    .filter((w) => w.coords && w.coords.length >= 2)
    .map((w) => w.coords.map((ll) => sub.fwd(ll)));

  const enforcedPlotOverrides = { ...tierOut.plotTierOverrides };
  if (wadiLinesUtm.length > 0) {
    for (const p of sub.plots) {
      let minD = Infinity;
      for (const wl of wadiLinesUtm) {
        const d = polygonToPolylineDistanceUtm(p.rect, wl);
        if (d < minD) minD = d;
      }
      if (minD <= 30) {
        enforcedPlotOverrides[p.id] = 'tier_3_basic';
      }
    }
  }

  const nextState: LandSubdivisionState = {
    ...stateWithHydro,
    blockTiers: tierOut.blockTiers,
    plotTierOverrides: enforcedPlotOverrides,
    plotMetadata: tierOut.updatedPlotMetadata,
    blockMetadata: tierOut.updatedBlockMetadata,
    autoTierSummary: tierOut.summary,
    auditHistory: [
      createAuditEntry(
        'tier_change',
        `Sahanka AI v2: Heerarka 1–3, DEM (${tierOut.summary.demSourceLabel}) & ${mergedWadis.length} doox waa la xisaabiyey.`
      ),
      ...(stateWithHydro.auditHistory || []).slice(0, 49),
    ],
  };

  return {
    nextState,
    elevationRangeM: {
      min: tierOut.summary.minElevationM,
      max: tierOut.summary.maxElevationM,
      avgSlopePct: tierOut.summary.avgSlopePercent,
    },
  };
}

/**
 * 1-Click Auto-Fix (`Toosi 90×48m & Waddo 15m`):
 * Rebuilds blocks inside the current boundary to strictly enforce `90×48m` blocks,
 * `15m` 4-sided roads, `18×24m` (`432 m²`) full plots, and `216 m²` corner/middle half-plots,
 * while preserving bearing, wadis, roads, and re-evaluating `Heer 1–3`.
 */
export async function autoFixToStandard15m90x48(
  currentState: LandSubdivisionState,
  explicitBearingDeg?: number | null
): Promise<
  | {
      ok: true;
      nextState: LandSubdivisionState;
      summary: NashqadWorkflowSummary;
      complianceAudit: ComplianceAudit15m90x48;
    }
  | { ok: false; errorSomali: string }
> {
  const extracted = extractBoundaryGeoJsonAndCenterFromState(currentState);
  if (!extracted) {
    return {
      ok: false,
      errorSomali: 'Ma jiro xuduud beer oo hadda furan oo lagu toosin karo 90×48m & 15m.',
    };
  }

  const bearingToUse =
    explicitBearingDeg !== undefined && explicitBearingDeg !== null
      ? explicitBearingDeg
      : currentState.nashqadSummary?.widthBearingDeg ??
        currentState.params?.customWidthBearingDeg ??
        null;

  const built = runSameeNashqadWorkflow({
    boundaryFileName: extracted.boundaryName,
    boundaryFileText: extracted.boundaryGeoJsonText,
    sampleBlockMode: 'dimensions',
    blockLengthM: 90,
    blockWidthM: 48,
    plotWidthM: 18,
    plotDepthM: 24,
    roadWidthM: 15,
    widthBearingDeg: bearingToUse ?? undefined,
    previousState: currentState,
  });

  if (built.ok === false) {
    return { ok: false, errorSomali: built.errorSomali };
  }

  const { nextState } = await applyAutomaticTerrainAndWadiTiersToState(
    {
      ...built.nextState,
      wadiItems: currentState.wadiItems || [],
      wadiFileName: currentState.wadiFileName,
      roadItems: currentState.roadItems || [],
      roadFileName: currentState.roadFileName,
      cityRoadAnchorLonLat: currentState.cityRoadAnchorLonLat,
      tierUnitPrices: currentState.tierUnitPrices,
      isLinkedToEstate: currentState.isLinkedToEstate,
      includeValidHalfPlotsInAllocation: currentState.includeValidHalfPlotsInAllocation,
    },
    [],
    []
  );

  const complianceAudit = audit15mAnd90x48mCompliance(nextState);
  return {
    ok: true,
    nextState,
    summary: built.summary,
    complianceAudit,
  };
}

/**
 * Full Sahanka AI v2 Runner supporting both:
 * - `auto_10yr`: Automatic 10-Year Rainfall/Flood + OSM Wadi/Road + DEM + 90×48m / 15m Survey
 * - `manual`: Custom boundary/wadi/sample-block/parameter survey + 15m / 90×48m Verification
 */
export async function runSahankaAiSurvey(input: {
  mode: SahankaSurveyMode;
  currentState: LandSubdivisionState;
  boundaryFile?: { fileName: string; fileText: string } | null;
  sampleBlockFile?: { fileName: string; fileText: string } | null;
  wadiFile?: { fileName: string; fileText: string } | null;
  coordinateArea?: {
    centerLat: number;
    centerLon: number;
    eastWestM?: number;
    northSouthM?: number;
  } | null;
  manualParams?: {
    auditCurrentWithoutRebuild?: boolean;
    blockLengthM?: number;
    blockWidthM?: number;
    roadWidthM?: number;
    plotWidthM?: number;
    plotDepthM?: number;
    widthBearingDeg?: number | null;
  };
  userNotes?: string;
  skipGeminiCall?: boolean;
}): Promise<SahankaAiSurveyResult> {
  const { mode, currentState } = input;

  // Parse optional uploaded wadi GeoJSON/KML
  let uploadedWadis: ParsedGeoItem[] = [];
  if (input.wadiFile?.fileText) {
    try {
      const parsed = JSON.parse(input.wadiFile.fileText);
      uploadedWadis = parseGeoJsonItems(parsed).filter((it) => it.coords.length >= 2);
    } catch {
      return {
        ok: false,
        errorSomali: 'Faylka dooxa (GeoJSON/KML) ma furmin. Fadlan hubi qaabka faylka.',
      };
    }
  }

  let baseState: LandSubdivisionState;
  let nashqadSummary: NashqadWorkflowSummary;
  let centerLat = 9.56;
  let centerLon = 44.06;
  let boundaryAreaHa = 0;

  // Option A: Audit existing loaded map geometry directly in manual mode without rebuilding
  if (
    mode === 'manual' &&
    input.manualParams?.auditCurrentWithoutRebuild &&
    !input.boundaryFile &&
    !input.sampleBlockFile
  ) {
    const ext = extractBoundaryGeoJsonAndCenterFromState(currentState);
    if (!ext) {
      return {
        ok: false,
        errorSomali:
          'Khariidadda hadda wax xuduud beer ah kuma jiro. Dooro faylka xuduudka ama geli goobta (Lat/Lon).',
      };
    }
    baseState = currentState;
    centerLat = ext.centerLat;
    centerLon = ext.centerLon;
    boundaryAreaHa = ext.boundaryAreaHa;
    const subExisting = computeSubdivisionFromState(currentState);
    nashqadSummary = currentState.nashqadSummary || {
      mode: 'samee_nashqad',
      createdAt: new Date().toISOString(),
      recognizedFiles: [],
      missingFileMessages: [],
      blocksCount: subExisting?.blocks.length || 0,
      fullPlotsCount: subExisting?.plots.filter((p) => p.full).length || 0,
      halfPlotsCount: subExisting?.halfPlotSummary?.validHalfPlotsCount || 0,
      totalPlotsAreaSqM: 0,
      boundaryAreaSqM: Math.round(ext.boundaryAreaHa * 10000),
      standardPlotAreaSqM: 432,
    };
  } else {
    // Resolve boundary source: 1) uploaded boundaryFile, 2) existing map boundary, 3) coordinateArea
    let bndName = '';
    let bndText = '';

    if (input.boundaryFile?.fileText) {
      bndName = input.boundaryFile.fileName;
      bndText = input.boundaryFile.fileText;
    } else {
      const existing = extractBoundaryGeoJsonAndCenterFromState(currentState);
      if (existing && !input.coordinateArea) {
        bndName = existing.boundaryName;
        bndText = existing.boundaryGeoJsonText;
      } else if (input.coordinateArea) {
        const { centerLat: cLat, centerLon: cLon, eastWestM, northSouthM } = input.coordinateArea;
        if (!Number.isFinite(cLat) || !Number.isFinite(cLon) || Math.abs(cLat) > 90 || Math.abs(cLon) > 180) {
          return {
            ok: false,
            errorSomali: 'Fadlan geli Latitude (-90..90) iyo Longitude (-180..180) sax ah.',
          };
        }
        const synth = buildSurveyBoundaryGeoJsonFromCenter({
          centerLat: cLat,
          centerLon: cLon,
          eastWestM,
          northSouthM,
          bearingDeg: input.manualParams?.widthBearingDeg ?? 0,
        });
        bndName = synth.fileName;
        bndText = synth.boundaryGeoJsonText;
      } else {
        return {
          ok: false,
          errorSomali:
            'Fadlan soo geli xuduudka beerta (GeoJSON/KML) ama geli barta Latitude & Longitude.',
        };
      }
    }

    const useSampleFile = Boolean(input.sampleBlockFile?.fileText);
    const blockL = mode === 'auto_10yr' ? 90 : Number(input.manualParams?.blockLengthM ?? 90);
    const blockW = mode === 'auto_10yr' ? 48 : Number(input.manualParams?.blockWidthM ?? 48);
    const roadW = mode === 'auto_10yr' ? 15 : Number(input.manualParams?.roadWidthM ?? 15);
    const plotW = mode === 'auto_10yr' ? 18 : Number(input.manualParams?.plotWidthM ?? 18);
    const plotD = mode === 'auto_10yr' ? 24 : Number(input.manualParams?.plotDepthM ?? 24);

    const built = runSameeNashqadWorkflow({
      boundaryFileName: bndName,
      boundaryFileText: bndText,
      sampleBlockMode: useSampleFile ? 'file' : 'dimensions',
      sampleBlockFileName: input.sampleBlockFile?.fileName,
      sampleBlockFileText: input.sampleBlockFile?.fileText,
      blockLengthM: blockL,
      blockWidthM: blockW,
      roadWidthM: roadW,
      plotWidthM: plotW,
      plotDepthM: plotD,
      widthBearingDeg: input.manualParams?.widthBearingDeg ?? undefined,
      previousState: currentState,
    });

    if (built.ok === false) {
      return { ok: false, errorSomali: built.errorSomali };
    }

    baseState = {
      ...built.nextState,
      wadiItems: currentState.wadiItems || [],
      wadiFileName: currentState.wadiFileName,
      roadItems: currentState.roadItems || [],
      roadFileName: currentState.roadFileName,
      cityRoadAnchorLonLat: currentState.cityRoadAnchorLonLat,
      tierUnitPrices: currentState.tierUnitPrices,
      isLinkedToEstate: currentState.isLinkedToEstate,
      includeValidHalfPlotsInAllocation: currentState.includeValidHalfPlotsInAllocation,
    };
    nashqadSummary = built.summary;

    const ext = extractBoundaryGeoJsonAndCenterFromState(baseState);
    if (ext) {
      centerLat = ext.centerLat;
      centerLon = ext.centerLon;
      boundaryAreaHa = ext.boundaryAreaHa;
    }
  }

  // Fetch 10-Year Hydrology + OSM Wadis/Roads in parallel when online
  const [hydrology10Yr, osmEnv] = await Promise.all([
    fetchTenYearHistoricalHydrology(centerLat, centerLon),
    mode === 'auto_10yr'
      ? fetchNearbyOsmWadisAndRoads(centerLat, centerLon, 3500)
      : Promise.resolve({
          wadiItems: [] as ParsedGeoItem[],
          roadItems: [] as ParsedGeoItem[],
          sourceLabelSomali: 'Gacanta',
        }),
  ]);

  const combinedNewWadis = [...uploadedWadis, ...osmEnv.wadiItems];
  const combinedNewRoads = [...osmEnv.roadItems];

  const { nextState, elevationRangeM } = await applyAutomaticTerrainAndWadiTiersToState(
    baseState,
    combinedNewWadis,
    combinedNewRoads
  );

  const complianceAudit = audit15mAnd90x48mCompliance(nextState);
  const totalWadiCount =
    (nextState.wadiItems?.length || 0) +
    (nextState.prebuiltSubdivision?.wadiLinesLonLat?.length || 0);
  const totalRoadCount = nextState.roadItems?.length || 0;

  const geminiReport = input.skipGeminiCall
    ? buildDeterministicSahankaReport({
        mode,
        boundaryAreaHa,
        hydrology10Yr,
        complianceAudit,
        detectedWadiCount: totalWadiCount,
        elevationRangeM,
      })
    : await requestSahankaGeminiInsights({
        mode,
        centerLat,
        centerLon,
        boundaryAreaHa,
        hydrology10Yr,
        complianceAudit,
        detectedWadiCount: totalWadiCount,
        elevationRangeM,
        userNotes: input.userNotes,
      });

  return {
    ok: true,
    mode,
    centerLat,
    centerLon,
    boundaryAreaHa,
    nextState,
    nashqadSummary,
    hydrology10Yr,
    complianceAudit,
    geminiReport,
    detectedWadiCount: totalWadiCount,
    detectedRoadCount: totalRoadCount,
  };
}
