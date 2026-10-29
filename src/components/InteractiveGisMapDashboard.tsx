import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Check,
  CircleDot,
  FileText,
  Globe,
  Layers,
  Lasso,
  Loader2,
  LocateFixed,
  MapPin,
  Maximize2,
  Minus,
  Mountain,
  MousePointerClick,
  Pentagon,
  Plus,
  Printer,
  Route,
  Satellite,
  Search,
  Trash2,
  Users,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';
import { AssetQualityTier, SavedInheritanceCase } from '../types/inheritance';
import {
  FairLandAllocationResult,
  GeneratedBlock,
  GeneratedPlot,
  LandAllocationMode,
  LandSubdivisionState,
  NashqadWorkflowSummary,
  Point2D,
  SubdivisionComputationResult,
} from '../types/landSubdivision';
import {
  HtmlGeoJsonSlot,
  LAND_ALLOCATION_MODE_METADATA,
  TIER_METADATA,
  createAuditEntry,
  formatPlotQtyCompact,
  getDistinctHeirColor,
  getEffectivePlotTier,
} from '../utils/landSubdivisionEngine';
import {
  MapSelectionTarget,
  MapSpatialSelectionResult,
  applyManualTierByBlock,
  applyManualTierByPlot,
  applyManualTierToSelectedFeatures,
  buildDemSamplerForSubdivision,
  computeAutomaticDemAndRoadTiers,
  resolveNearestCityConnectingRoad,
  selectMapFeaturesByFreehandUtm,
  selectMapFeaturesByPolygonUtm,
  selectMapFeaturesByRadiusUtm,
} from '../utils/demAndRoadTierEngine';
import { useOnlineStatus } from '../utils/usePWAInstall';
import {
  FarmCartographicReport,
  HEERARKA_MAP_COLORS,
  LAYOUT11_PALETTE,
  Layout11CategoryKey,
  PlotCartographicProfile,
  computeFarmCartographicReport,
} from '../utils/pdfCartographyEngine';
import { CartographicPdfDocMode } from './FarmCartographicPdfModal';
import { NashqadFabAndModals, NashqadSummaryCard } from './NashqadFabAndModals';

export type BasemapMode = 'paper_pdf' | 'satellite' | 'osm' | 'offline_vector';
export type MapCartographicStyle = 'nashqad' | 'layout11' | 'heerarka' | 'inheritance';
export type MapQuickPlotFilter =
  | 'all'
  | 'buuxa'
  | 'partial_qayb'
  | 'doox'
  | 'kale_named'
  | 'available'
  | 'assigned';

type RightRailPanelId = 'selection' | 'layers' | 'tiers' | 'legends' | null;
type TierDeterminationMode = 'automatic' | 'manual';
type ActiveMapPointerTool =
  | 'inspect'
  | 'map_select_polygon'
  | 'map_select_freehand'
  | 'map_select_radius'
  | 'select_plot'
  | 'select_block'
  | 'pick_road_anchor';

interface InteractiveGisMapDashboardProps {
  currentHasMap: boolean;
  subdivisionState: LandSubdivisionState;
  subdivisionResult: SubdivisionComputationResult | null;
  fairAllocation: FairLandAllocationResult | null;
  savedCases: SavedInheritanceCase[];
  selectedTargetScope: string;
  onSelectTargetScope: (scope: string) => void;
  onSelectSavedCase: (sc: SavedInheritanceCase) => void;
  onLoadSampleFarmForActiveCase?: () => void;
  onUploadGeoJsonFile?: (file: File) => void;
  onUploadGeoJsonFiles?: (files: File[]) => void;
  onUploadHtmlGeoJsonSlot?: (file: File, slot: HtmlGeoJsonSlot) => void;
  onSelectBoundaryIndex?: (idx: number) => void;
  onSelectSampleIndex?: (idx: number) => void;
  onUpdateSubdivisionState?: React.Dispatch<React.SetStateAction<LandSubdivisionState>>;
  onOpenCartographicPdfModal?: (mode: CartographicPdfDocMode) => void;
  onOpenAdvancedCadStudio: () => void;
  onOpenPlotInListData: (plotId: string) => void;
  onProceedToCalculateWithSelection: (scope: string) => void;
  onVisiblePlotsChange?: (
    visibleCount: number,
    totalCount: number,
    visibleIds: Set<string>
  ) => void;
  onNotify: (title: string, message: string) => void;
}

const HEIR_MAP_PALETTE = [
  '#22C55E', // Emerald
  '#3B82F6', // Blue
  '#A855F7', // Purple
  '#F59E0B', // Amber
  '#14B8A6', // Teal
  '#EC4899', // Pink
  '#6366F1', // Indigo
  '#84CC16', // Lime
];

const SOMALI_MAP_LOCATIONS: { label: string; lat: number; lng: number; zoom: number }[] = [
  { label: 'Hargeysa', lat: 9.56, lng: 44.065, zoom: 14 },
  { label: 'Gabiley (Beeraha)', lat: 9.696, lng: 43.624, zoom: 14 },
  { label: 'Muqdisho', lat: 2.0469, lng: 45.3182, zoom: 13 },
  { label: 'Afgooye (Beeraha)', lat: 2.1381, lng: 45.1219, zoom: 14 },
  { label: 'Jowhar (Shabeelle)', lat: 2.7808, lng: 45.5005, zoom: 14 },
  { label: 'Boorama', lat: 9.9361, lng: 43.1828, zoom: 14 },
  { label: 'Burco', lat: 9.5221, lng: 45.5336, zoom: 14 },
  { label: 'Garoowe', lat: 8.402, lng: 48.4828, zoom: 14 },
  { label: 'Baydhabo', lat: 3.1138, lng: 43.6498, zoom: 14 },
  { label: 'Kismaayo', lat: -0.3582, lng: 42.5454, zoom: 14 },
];

interface EnrichedMapPlot {
  plot: GeneratedPlot;
  id: string;
  shortLabel: string;
  blockId: string;
  blockDisplayName: string;
  areaSqM: number;
  pctGudaha: number;
  isFullBuuxa: boolean;
  isPartialQayb: boolean;
  isDoox: boolean;
  namedCategory: Layout11CategoryKey | null;
  blockHeer: 1 | 2 | 3;
  effectiveQualityTier: AssetQualityTier;
  effectiveTierNumber: 1 | 2 | 3;
  isExcluded: boolean;
  specialName: string;
  isAssigned: boolean;
  isValidHalf: boolean;
  ownerDisplay: string;
  statusText: string;
  geometryTypeLabel: string;
  inheritanceFillColor: string;
  heirLegendKeys: string[];
  pdfLegendKey: string;
  tierLegendKey: string;
  cartoProfile?: PlotCartographicProfile;
  latLngRing: [number, number][];
  centerLatLng: [number, number];
}

function toLatLngRing(
  utmRing: Point2D[],
  inv: (pt: Point2D) => Point2D
): [number, number][] {
  const pts: [number, number][] = [];
  for (const pt of utmRing) {
    const [lon, lat] = inv(pt);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    ) {
      pts.push([lat, lon]);
    }
  }
  return pts;
}

function ensureLeafletHatchPattern(map: L.Map): void {
  const pane = map.getPanes().overlayPane;
  if (!pane) return;
  const svg = pane.querySelector('svg');
  if (!svg) return;
  if (svg.querySelector('#leaflet-qgis-layout11-hatch')) return;

  const ns = 'http://www.w3.org/2000/svg';
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(ns, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  const pattern = document.createElementNS(ns, 'pattern');
  pattern.setAttribute('id', 'leaflet-qgis-layout11-hatch');
  pattern.setAttribute('width', '6');
  pattern.setAttribute('height', '6');
  pattern.setAttribute('patternTransform', 'rotate(45)');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');

  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', '0');
  line.setAttribute('y1', '0');
  line.setAttribute('x2', '0');
  line.setAttribute('y2', '6');
  line.setAttribute('stroke', '#111827');
  line.setAttribute('stroke-width', '1.35');

  pattern.appendChild(line);
  defs.appendChild(pattern);
}

/**
 * Safe DOM element builders using `.textContent` (never `innerHTML`) for Leaflet tooltips & divIcons.
 */
function makeSafeTooltipEl(text: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  return el;
}

function makeSafeMultiLineTooltipEl(lines: string[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-0.5 leading-snug';
  lines.forEach((line, idx) => {
    const row = document.createElement('div');
    if (idx === 0) {
      row.className = 'font-extrabold text-[11.5px]';
    } else {
      row.className = 'text-[10.5px] opacity-90 tabular-nums';
    }
    row.textContent = line;
    wrap.appendChild(row);
  });
  return wrap;
}

function isLatLngInsideRing(lat: number, lng: number, ringLatLng: [number, number][]): boolean {
  if (ringLatLng.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ringLatLng.length - 1; i < ringLatLng.length; j = i++) {
    const yi = ringLatLng[i][0];
    const xi = ringLatLng[i][1];
    const yj = ringLatLng[j][0];
    const xj = ringLatLng[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function makeSafeBlockBadgeEl(
  lines: string[],
  variant: 'heerarka' | 'dark' | 'purple'
): HTMLElement {
  const el = document.createElement('div');
  if (variant === 'heerarka') {
    el.className =
      '-translate-x-1/2 -translate-y-1/2 bg-white/90 text-slate-900 text-[9px] leading-tight font-extrabold px-1 py-0.5 rounded shadow-xs text-center whitespace-nowrap pointer-events-none';
  } else if (variant === 'purple') {
    el.className =
      '-translate-x-1/2 -translate-y-1/2 bg-violet-950/90 border border-violet-400 text-violet-100 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md whitespace-nowrap pointer-events-none shadow-md';
  } else {
    el.className =
      '-translate-x-1/2 -translate-y-1/2 bg-[#0B1220]/85 border border-sky-400/60 text-slate-200 text-[9.5px] font-extrabold px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none';
  }
  lines.forEach((line, idx) => {
    if (idx > 0) {
      el.appendChild(document.createElement('br'));
    }
    el.appendChild(document.createTextNode(line));
  });
  return el;
}

export const InteractiveGisMapDashboard: React.FC<InteractiveGisMapDashboardProps> = ({
  currentHasMap,
  subdivisionState,
  subdivisionResult,
  fairAllocation,
  savedCases,
  onSelectTargetScope,
  onSelectSavedCase,
  onUpdateSubdivisionState,
  onOpenCartographicPdfModal,
  onOpenAdvancedCadStudio,
  onOpenPlotInListData,
  onProceedToCalculateWithSelection,
  onVisiblePlotsChange,
  onNotify,
}) => {
  const isOnline = useOnlineStatus();

  const [basemapMode, setBasemapMode] = useState<BasemapMode>(() => {
    if (subdivisionResult?.isPrebuiltGeometry && !subdivisionState.nashqadSummary) {
      return 'paper_pdf';
    }
    return typeof navigator !== 'undefined' && !navigator.onLine
      ? 'offline_vector'
      : 'satellite';
  });

  const [cartoStyle, setCartoStyle] = useState<MapCartographicStyle>(() =>
    subdivisionState.nashqadSummary
      ? 'nashqad'
      : subdivisionResult?.isPrebuiltGeometry
      ? 'layout11'
      : (fairAllocation?.heirAllocations.length || 0) > 0
      ? 'inheritance'
      : 'heerarka'
  );

  const [showHybridLabels, setShowHybridLabels] = useState<boolean>(true);
  const [tileOfflineFallbackNotice, setTileOfflineFallbackNotice] = useState<boolean>(false);

  // Individual Right-Side Controls Below Zoom Buttons: Lakabyada | Heerarka | Sumadaha (one active popover at a time)
  const [openRightPanel, setOpenRightPanel] = useState<RightRailPanelId>(null);
  const [isNashqadReportOpen, setIsNashqadReportOpen] = useState<boolean>(false);

  // Land Quality Tier Determination state: 1. Automatic Generator vs 2. Manual
  const [tierMode, setTierMode] = useState<TierDeterminationMode>('automatic');
  const [isComputingAutoTiers, setIsComputingAutoTiers] = useState<boolean>(false);
  const [targetManualTier, setTargetManualTier] = useState<AssetQualityTier>('tier_1_prime');
  const [activeMapTool, setActiveMapTool] = useState<ActiveMapPointerTool>('inspect');
  const [hasUserEditedTiersInSession, setHasUserEditedTiersInSession] =
    useState<boolean>(false);

  // Map Selection Tools state (Polygon, Freehand, Radius for Plots & Blocks + Selected Count + Clear Selection)
  const [selectionTarget, setSelectionTarget] = useState<MapSelectionTarget>('plots');
  const [selectedPlotIds, setSelectedPlotIds] = useState<Set<string>>(() => new Set());
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(() => new Set());
  const [selectedFeaturesAreaSqM, setSelectedFeaturesAreaSqM] = useState<number>(0);
  const [defaultRadiusM, setDefaultRadiusM] = useState<string>('50');
  const totalSelectedFeaturesCount = selectedPlotIds.size + selectedBlockIds.size;

  // Polygon, Freehand & Radius live drawing state (screen points + LatLngs)
  const [lassoScreenPts, setLassoScreenPts] = useState<[number, number][]>([]);
  const lassoLatLngsRef = useRef<[number, number][]>([]);
  const isDrawingLassoRef = useRef<boolean>(false);

  const [polyScreenPts, setPolyScreenPts] = useState<[number, number][]>([]);
  const [polyCursorPt, setPolyCursorPt] = useState<[number, number] | null>(null);
  const polyLatLngsRef = useRef<[number, number][]>([]);
  const polyPointerDownPtRef = useRef<[number, number] | null>(null);

  const [radiusPreview, setRadiusPreview] = useState<{
    centerPx: [number, number];
    cursorPx: [number, number];
    ringScreenPts: [number, number][];
    radiusM: number;
  } | null>(null);
  const radiusCenterLatLngRef = useRef<[number, number] | null>(null);
  const isDrawingRadiusRef = useRef<boolean>(false);

  // Layer visibility toggles ("Lakabyada") + Active Layer target for Zoom Active Layer
  const [layersVisible, setLayersVisible] = useState({
    plots: true,
    blocks: true,
    roads: true,
    cityRoad: true,
    specialAreas: true,
    extraLayers: true,
    boundary: true,
  });
  const [hiddenExtraLayerIds, setHiddenExtraLayerIds] = useState<Record<string, boolean>>({});
  const [activeZoomLayer, setActiveZoomLayer] = useState<string>('all_visible');

  // Real-time High-Accuracy GPS Current Location state & watch refs
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);
  const [userGpsInfo, setUserGpsInfo] = useState<{
    lat: number;
    lng: number;
    accuracyM: number;
    placeLabel: string;
    farmRelationLabel: string;
  } | null>(null);
  const gpsWatchIdRef = useRef<number | null>(null);
  const gpsWatchTimerRef = useRef<number | null>(null);
  const gpsReverseAbortRef = useRef<AbortController | null>(null);

  // Unified Legends Checkboxes state (no duplicate legend boxes!)
  const [hiddenHeirKeys, setHiddenHeirKeys] = useState<Record<string, boolean>>({});
  const [hiddenPdfLegendKeys, setHiddenPdfLegendKeys] = useState<Record<string, boolean>>({});
  const [hiddenTierLegendKeys, setHiddenTierLegendKeys] = useState<Record<string, boolean>>({});
  const [hiddenNashqadLegendKeys, setHiddenNashqadLegendKeys] = useState<
    Record<string, boolean>
  >({});

  // Dynamic metric scale bar width in pixels for live Leaflet zoom
  const [scaleBarInfo, setScaleBarInfo] = useState<{ stepPx: number; useKm: boolean }>({
    stepPx: 64,
    useKm: true,
  });

  // Search & Filter (inline in single top bar — no duplicate modal)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [quickPlotFilter, setQuickPlotFilter] = useState<MapQuickPlotFilter>('all');

  // Selected plot & bottom sheet
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null);
  const [isPlotSheetOpen, setIsPlotSheetOpen] = useState<boolean>(false);

  const mapWrapperRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const tileLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const gisOverlayGroupRef = useRef<L.LayerGroup | null>(null);
  const userLocationMarkerRef = useRef<L.LayerGroup | null>(null);
  const lastFittedSignatureRef = useRef<string>('');
  const lastAutoStyledSourceRef = useRef<string>('');

  // Keep latest manual interaction tool in a ref so Leaflet polygon click listeners never go stale
  const interactionStateRef = useRef({
    activeMapTool,
    targetManualTier,
    subdivisionResult,
    onUpdateSubdivisionState,
  });
  interactionStateRef.current = {
    activeMapTool,
    targetManualTier,
    subdivisionResult,
    onUpdateSubdivisionState,
  };

  // When a prebuilt GeoJSON is newly uploaded, select appropriate cartography style
  useEffect(() => {
    const srcName = subdivisionState.prebuiltSubdivision?.sourceFileName || '';
    const nashqadTs = subdivisionState.nashqadSummary?.createdAt || '';
    const sig = `${srcName}::${nashqadTs}`;
    if (
      subdivisionResult?.isPrebuiltGeometry &&
      srcName &&
      lastAutoStyledSourceRef.current !== sig
    ) {
      lastAutoStyledSourceRef.current = sig;
      if (subdivisionState.nashqadSummary) {
        setCartoStyle('nashqad');
        if (basemapMode === 'paper_pdf') {
          setBasemapMode(isOnline ? 'satellite' : 'offline_vector');
        }
      } else {
        setCartoStyle('layout11');
        setBasemapMode('paper_pdf');
      }
      setQuickPlotFilter('all');
      setHiddenHeirKeys({});
      setHiddenPdfLegendKeys({});
      setHiddenTierLegendKeys({});
      setHiddenNashqadLegendKeys({});
      setHasUserEditedTiersInSession(false);
      setSelectedPlotIds(new Set());
      setSelectedBlockIds(new Set());
      setSelectedFeaturesAreaSqM(0);
    }
  }, [
    subdivisionResult?.isPrebuiltGeometry,
    subdivisionState.prebuiltSubdivision?.sourceFileName,
    subdivisionState.nashqadSummary,
    basemapMode,
    isOnline,
  ]);

  useEffect(() => {
    if (!isOnline) {
      setTileOfflineFallbackNotice(true);
    } else {
      setTileOfflineFallbackNotice(false);
    }
  }, [isOnline]);

  // Determine whether `Heerarka` style renders dynamic DEM/Manual tiers (`Heer 1` Prime Emerald, `Heer 2` Blue, `Heer 3` Amber)
  // vs untouched static 523-plot PDF inspection colors
  const useDynamicQualityTiers = Boolean(
    !subdivisionResult?.isPrebuiltGeometry ||
      subdivisionState.autoTierSummary ||
      hasUserEditedTiersInSession ||
      Object.keys(subdivisionState.plotTierOverrides || {}).length > 0
  );

  // Compute exact cartographic report (Layout 11 + Heerarka 1..3 + Dooxyada)
  const cartoReport: FarmCartographicReport | null = useMemo(() => {
    if (!currentHasMap || !subdivisionResult) return null;
    const wadiItemsForEngine =
      subdivisionState.prebuiltSubdivision?.wadiLinesLonLat &&
      subdivisionState.prebuiltSubdivision.wadiLinesLonLat.length > 0
        ? subdivisionState.prebuiltSubdivision.wadiLinesLonLat.map((w) => ({
            name: w.name,
            type: 'Line' as const,
            coords: w.coords,
          }))
        : subdivisionState.wadiItems || [];
    return computeFarmCartographicReport(
      subdivisionResult,
      wadiItemsForEngine,
      subdivisionState.prebuiltSubdivision
    );
  }, [
    currentHasMap,
    subdivisionResult,
    subdivisionState.prebuiltSubdivision,
    subdivisionState.wadiItems,
  ]);

  // Build guaranteed unique heir color lookup (0 collisions across all heirs)
  const heirColorByKey = useMemo(() => {
    const map: Record<string, string> = {};
    (fairAllocation?.heirAllocations || []).forEach((h, idx) => {
      map[h.heirKey] = h.colorHex || getDistinctHeirColor(idx);
    });
    return map;
  }, [fairAllocation]);

  // Enrich ALL evaluated plots
  const enrichedPlots: EnrichedMapPlot[] = useMemo(() => {
    if (!currentHasMap || !subdivisionResult) return [];

    const combined: GeneratedPlot[] = [];
    const seenIds = new Set<string>();

    if (
      subdivisionResult.allEvaluatedPlots &&
      subdivisionResult.allEvaluatedPlots.length > 0
    ) {
      for (const p of subdivisionResult.allEvaluatedPlots) {
        const rel = p.halfPlotValidation?.boundaryRelation;
        if (!subdivisionResult.isPrebuiltGeometry && rel === 'full_outside') {
          continue;
        }
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          combined.push(p);
        }
      }
    } else {
      for (const p of subdivisionResult.plots || []) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          combined.push(p);
        }
      }
      for (const hp of subdivisionResult.validHalfPlots || []) {
        if (!seenIds.has(hp.id)) {
          seenIds.add(hp.id);
          combined.push(hp);
        }
      }
    }

    return combined
      .map((p, index): EnrichedMapPlot | null => {
        const pMeta = subdivisionState.plotMetadata[p.id];
        const bMeta = subdivisionState.blockMetadata[p.block];
        const assign = fairAllocation?.plotAssignments[p.id];
        const cartoProfile = cartoReport?.plotProfilesById[p.id];

        const hpVal = p.halfPlotValidation || subdivisionResult.plotValidations?.[p.id];
        const isValidHalf = hpVal?.validationStatus === 'half_plot_valid' && !p.full;

        const utmPoly =
          !subdivisionResult.isPrebuiltGeometry &&
          isValidHalf &&
          hpVal?.inscribedHalfPlotRectUtm &&
          hpVal.inscribedHalfPlotRectUtm.length >= 3
            ? hpVal.inscribedHalfPlotRectUtm
            : p.rect;

        const latLngRing = toLatLngRing(utmPoly, subdivisionResult.inv);
        if (latLngRing.length < 3) return null;

        const [cLon, cLat] = subdivisionResult.inv(p.centerUtm);
        const centerLatLng: [number, number] = [cLat, cLon];

        const explicitNoocaRaw = p.preservedProps?.nooca;
        const explicitNooca =
          typeof explicitNoocaRaw === 'string' ? explicitNoocaRaw.toLowerCase() : '';

        const areaSqM = explicitNooca
          ? Math.round((p.calculatedAreaSqM ?? 0) * 10) / 10
          : cartoProfile
          ? cartoProfile.areaSqM
          : isValidHalf
          ? hpVal?.expectedRule.targetAreaSqM || 216
          : Math.round(
              (p.calculatedAreaSqM ??
                subdivisionResult.params.pw * subdivisionResult.params.pd) * 10
            ) / 10;

        const isFullBuuxa = explicitNooca
          ? explicitNooca === 'dhammaystiran'
          : cartoProfile
          ? cartoProfile.isFullBuuxa
          : p.full;
        const isPartialQayb = explicitNooca
          ? explicitNooca === 'half'
          : cartoProfile
          ? cartoProfile.isPartialQayb
          : !p.full;
        const isDoox =
          pMeta?.wadiStatus === 'cuts_through' || Boolean(cartoProfile?.isDoox);
        const namedCategory = cartoProfile?.namedCategory || null;
        const blockHeer: 1 | 2 | 3 = cartoProfile?.blockHeer || 1;

        const effectiveQualityTier = getEffectivePlotTier(
          p,
          subdivisionState.blockTiers,
          subdivisionState.plotTierOverrides
        );
        const effectiveTierNumber: 1 | 2 | 3 =
          effectiveQualityTier === 'tier_1_prime'
            ? 1
            : effectiveQualityTier === 'tier_2_standard'
            ? 2
            : 3;

        const displayHeerNumber: 1 | 2 | 3 = useDynamicQualityTiers
          ? effectiveTierNumber
          : blockHeer;

        const pctGudaha = cartoProfile ? cartoProfile.pctGudaha : p.full ? 100 : 50;

        const isExcluded = Boolean(
          pMeta?.isExcludedFromDivision ||
            bMeta?.isExcludedFromDivision ||
            assign?.isExcluded ||
            namedCategory === 'Danguud'
        );
        const specialName =
          namedCategory ||
          pMeta?.excludedSpecialName ||
          bMeta?.excludedSpecialName ||
          assign?.excludedSpecialName ||
          pMeta?.parcelNumberOrName ||
          '';

        let ownerDisplay = namedCategory || (isDoox ? 'Plot Doox' : 'Aan calaamad lahayn');
        let isAssigned = false;
        let inheritanceFillColor = '#64748B';
        let heirLegendKeys: string[] = ['__unassigned__'];

        if (
          assign &&
          (assign.assignmentType === 'sole_heir' || assign.assignmentType === 'manual_override')
        ) {
          ownerDisplay = assign.ownerPersonName || assign.ownerRoleSomali || 'La Qoondayey';
          isAssigned = true;
          inheritanceFillColor =
            (assign.ownerHeirKey && heirColorByKey[assign.ownerHeirKey]) ||
            assign.ownerColorHex ||
            '#16A34A';
          heirLegendKeys = assign.ownerHeirKey ? [assign.ownerHeirKey] : ['__unassigned__'];
        } else if (
          assign &&
          assign.assignmentType === 'shared_fractional' &&
          assign.coOwners?.length
        ) {
          ownerDisplay = `Wadaag: ${assign.coOwners.map((c) => c.personName).join(' & ')}`;
          isAssigned = true;
          inheritanceFillColor = '#F59E0B';
          heirLegendKeys = ['__shared__'];
        } else if (isExcluded) {
          inheritanceFillColor = '#F43F5E';
          heirLegendKeys = ['__excluded__'];
        } else if (assign?.unassignedReason === 'withheld_jajab') {
          ownerDisplay = 'Jajabka Laga Reebay (Tiro Siman)';
          inheritanceFillColor = '#64748B';
          heirLegendKeys = ['__withheld_jajab__'];
        } else if (isValidHalf || isPartialQayb) {
          ownerDisplay = 'Half-Plot Laga Reebay';
          inheritanceFillColor = '#94A3B8';
          heirLegendKeys = ['__withheld_half__'];
        } else {
          inheritanceFillColor = '#475569';
          heirLegendKeys = ['__unassigned__'];
        }

        const pdfLegendKey = namedCategory
          ? namedCategory
          : isDoox
          ? 'Doox'
          : isPartialQayb
          ? 'partial_40'
          : 'unlabelled';

        const tierLegendKey = useDynamicQualityTiers
          ? effectiveQualityTier
          : isDoox
          ? 'pdf_doox'
          : isPartialQayb
          ? 'pdf_partial'
          : `pdf_heer_${blockHeer}`;

        const preservedCabbirka =
          typeof p.preservedProps?.cabbirka === 'string' && p.preservedProps.cabbirka.trim() !== ''
            ? p.preservedProps.cabbirka.trim()
            : '';
        const preservedBooska =
          typeof p.preservedProps?.booska_block === 'number' ? p.preservedProps.booska_block : null;

        const statusText =
          cartoStyle === 'nashqad' || explicitNooca
            ? isPartialQayb
              ? `Nooca: half${preservedBooska ? ` (#${preservedBooska})` : ''}${preservedCabbirka ? ` · ${preservedCabbirka}` : ''}`
              : `Nooca: dhammaystiran${preservedCabbirka ? ` · ${preservedCabbirka}` : ''}`
            : cartoStyle === 'inheritance' && assign?.unassignedReason === 'withheld_jajab'
            ? 'Jajabka Laga Reebay (Tiro Siman)'
            : cartoStyle === 'inheritance' && (isValidHalf || isPartialQayb)
            ? 'Half-Plot Laga Reebay'
            : namedCategory
            ? `${namedCategory}${isPartialQayb ? " · Qayb go'an" : ' · Buuxa'}`
            : isDoox && !useDynamicQualityTiers
            ? 'Plot Doox (doox=1)'
            : isPartialQayb && !useDynamicQualityTiers
            ? `Qayb xuduudku jarayo (${pctGudaha.toFixed(0)}%)`
            : isAssigned && cartoStyle === 'inheritance'
            ? `La Siiyey (${ownerDisplay})`
            : `Heer ${displayHeerNumber}${isDoox ? ' · Doox/Jeexjeex' : ''}`;

        const blockDisplayName = bMeta?.blockName || bMeta?.excludedSpecialName || p.block;
        const shortNum = String(index + 1).padStart(3, '0');
        const shortLabel = p.id.includes('-P') ? p.id : `Plot #${shortNum}`;

        const geometryTypeLabel = isPartialQayb
          ? `Half plot${preservedBooska ? ` #${preservedBooska}` : ''} (${preservedCabbirka ? `${preservedCabbirka} · ` : ''}${areaSqM} m² · Heer ${displayHeerNumber})`
          : `Dhammaystiran (${preservedCabbirka ? `${preservedCabbirka} · ` : ''}${Math.round(areaSqM)} m² · Heer ${displayHeerNumber})`;

        return {
          plot: p,
          id: p.id,
          shortLabel,
          blockId: p.block,
          blockDisplayName,
          areaSqM,
          pctGudaha,
          isFullBuuxa,
          isPartialQayb,
          isDoox,
          namedCategory,
          blockHeer: displayHeerNumber,
          effectiveQualityTier,
          effectiveTierNumber,
          isExcluded,
          specialName,
          isAssigned,
          isValidHalf,
          ownerDisplay,
          statusText,
          geometryTypeLabel,
          inheritanceFillColor,
          heirLegendKeys,
          pdfLegendKey,
          tierLegendKey,
          cartoProfile,
          latLngRing,
          centerLatLng,
        };
      })
      .filter((item): item is EnrichedMapPlot => item !== null);
  }, [
    currentHasMap,
    subdivisionResult,
    subdivisionState.plotMetadata,
    subdivisionState.blockMetadata,
    subdivisionState.blockTiers,
    subdivisionState.plotTierOverrides,
    useDynamicQualityTiers,
    cartoStyle,
    fairAllocation,
    heirColorByKey,
    cartoReport,
  ]);

  // Unified Legend Rows depending on active `cartoStyle` (ONE single Legends group — zero duplicate legend boxes!)
  const liveL11LegendRows = useMemo(() => {
    if (!cartoReport) return [];
    const c = cartoReport.layout11LegendCounts;
    const allRows = [
      { key: 'unlabelled', label: `Plots Caadi ah`, fill: '#FFFFFF', hatch: false, count: cartoReport.totalPlots },
      { key: 'Xaq', label: 'Xaq', fill: LAYOUT11_PALETTE.Xaq.fillHex, hatch: false, count: c.Xaq },
      { key: 'partial_40', label: "Qayb Go'an", fill: LAYOUT11_PALETTE.partial_40.fillHex, hatch: true, count: c.partial_40 },
      { key: 'Doox', label: 'Doox', fill: LAYOUT11_PALETTE.Doox.fillHex, hatch: false, count: c.Doox },
      { key: 'Danguud', label: 'Danguud', fill: LAYOUT11_PALETTE.Danguud.fillHex, hatch: false, count: c.Danguud },
      { key: 'Xamse Mubaarig', label: 'Xamse Mubaarig', fill: LAYOUT11_PALETTE['Xamse Mubaarig'].fillHex, hatch: false, count: c['Xamse Mubaarig'] },
      { key: 'Shafool', label: 'Shafool', fill: LAYOUT11_PALETTE.Shafool.fillHex, hatch: false, count: c.Shafool },
      { key: 'Tacab', label: 'Tacab', fill: LAYOUT11_PALETTE.Tacab.fillHex, hatch: false, count: c.Tacab },
      { key: 'CWAHAAB', label: 'CWAHAAB', fill: LAYOUT11_PALETTE.CWAHAAB.fillHex, hatch: false, count: c.CWAHAAB },
      { key: 'Milgo', label: 'Milgo', fill: LAYOUT11_PALETTE.Milgo.fillHex, hatch: false, count: c.Milgo },
      { key: 'Ina Muuse', label: 'Ina Muuse', fill: LAYOUT11_PALETTE['Ina Muuse'].fillHex, hatch: false, count: c['Ina Muuse'] },
      { key: 'Culimo', label: 'Culimo', fill: LAYOUT11_PALETTE.Culimo.fillHex, hatch: false, count: c.Culimo },
    ];
    const hasKale = cartoReport.buuxaKaleCount + cartoReport.qaybKaleCount > 0;
    return hasKale
      ? allRows
      : allRows.filter(
          (r) => r.key === 'unlabelled' || r.key === 'partial_40' || r.count > 0
        );
  }, [cartoReport]);

  const heirLegendItems = useMemo(() => {
    const countsByKey: Record<string, number> = {};
    for (const p of enrichedPlots) {
      for (const k of p.heirLegendKeys) {
        countsByKey[k] = (countsByKey[k] || 0) + 1;
      }
    }

    const items: {
      key: string;
      label: string;
      color: string;
      count: number;
      hatch?: boolean;
    }[] = [];

    (fairAllocation?.heirAllocations || []).forEach((h, idx) => {
      const hasSharedPart = Math.abs(h.effectiveTotalPlotsReceived - h.totalWholePlotsAssigned) > 0.01;
      const baseName = h.personName || h.roleTitleSomali;
      items.push({
        key: h.heirKey,
        label: hasSharedPart
          ? `${baseName} (${formatPlotQtyCompact(h.effectiveTotalPlotsReceived)})`
          : baseName,
        color: heirColorByKey[h.heirKey] || getDistinctHeirColor(idx),
        count: countsByKey[h.heirKey] || 0,
      });
    });

    if ((countsByKey['__shared__'] || 0) > 0) {
      items.push({
        key: '__shared__',
        label: 'Plots Wadaag ah',
        color: '#F59E0B',
        hatch: true,
        count: countsByKey['__shared__'] || 0,
      });
    }

    if ((countsByKey['__excluded__'] || 0) > 0) {
      items.push({
        key: '__excluded__',
        label: 'Laga Reebay (Danguud)',
        color: '#F43F5E',
        count: countsByKey['__excluded__'] || 0,
      });
    }

    if ((countsByKey['__withheld_jajab__'] || 0) > 0) {
      items.push({
        key: '__withheld_jajab__',
        label: 'Jajabka Laga Reebay',
        color: '#64748B',
        count: countsByKey['__withheld_jajab__'] || 0,
      });
    }

    if ((countsByKey['__withheld_half__'] || 0) > 0) {
      items.push({
        key: '__withheld_half__',
        label: 'Half-Plots Laga Reebay',
        color: '#94A3B8',
        count: countsByKey['__withheld_half__'] || 0,
      });
    }

    if ((countsByKey['__unassigned__'] || 0) > 0) {
      items.push({
        key: '__unassigned__',
        label:
          (fairAllocation?.heirAllocations.length || 0) > 0
            ? 'Plots Aan La Qaybin'
            : 'Plots-ka Beerta',
        color: '#475569',
        count: countsByKey['__unassigned__'] || 0,
      });
    }

    const halfCount =
      !subdivisionResult?.isPrebuiltGeometry && subdivisionResult?.htmlHalvesCounted
        ? subdivisionResult.htmlHalvesCounted.length
        : 0;
    if (halfCount > 0 && (countsByKey['__withheld_half__'] || 0) === 0) {
      items.push({
        key: '__half_plots__',
        label: 'Half-Plots Laga Reebay (½)',
        color: '#94A3B8',
        count: halfCount,
      });
    }

    return items;
  }, [enrichedPlots, fairAllocation, heirColorByKey, subdivisionResult]);

  const tierLegendItems = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of enrichedPlots) {
      counts[p.tierLegendKey] = (counts[p.tierLegendKey] || 0) + 1;
    }

    if (useDynamicQualityTiers) {
      return [
        {
          key: 'tier_1_prime',
          label: 'Heerka 1aad (Dhul Siman / Fiican)',
          color: TIER_METADATA.tier_1_prime.fillHex,
          count: counts.tier_1_prime || 0,
          hatch: false,
        },
        {
          key: 'tier_2_standard',
          label: 'Heerka 2aad (Dhexdhexaad)',
          color: TIER_METADATA.tier_2_standard.fillHex,
          count: counts.tier_2_standard || 0,
          hatch: false,
        },
        {
          key: 'tier_3_basic',
          label: 'Heerka 3aad (Jeexjeex / Foorar)',
          color: TIER_METADATA.tier_3_basic.fillHex,
          count: counts.tier_3_basic || 0,
          hatch: false,
        },
      ];
    }

    return [
      {
        key: 'pdf_heer_3',
        label: 'Heer 3 (ugu dhow dooxa)',
        color: HEERARKA_MAP_COLORS.heer3Fill,
        count: counts.pdf_heer_3 || 0,
        hatch: false,
      },
      {
        key: 'pdf_heer_2',
        label: 'Heer 2 (dhexdhexaad)',
        color: HEERARKA_MAP_COLORS.heer2Fill,
        count: counts.pdf_heer_2 || 0,
        hatch: false,
      },
      {
        key: 'pdf_heer_1',
        label: 'Heer 1 (ka fog dooxa)',
        color: HEERARKA_MAP_COLORS.heer1Fill,
        count: counts.pdf_heer_1 || 0,
        hatch: false,
      },
      {
        key: 'pdf_partial',
        label: "Qayb xuduudka go'an",
        color: HEERARKA_MAP_COLORS.partialPlotFill,
        count: counts.pdf_partial || 0,
        hatch: false,
      },
      {
        key: 'pdf_doox',
        label: 'Plot Doox',
        color: HEERARKA_MAP_COLORS.dooxPlotFill,
        count: counts.pdf_doox || 0,
        hatch: false,
      },
    ];
  }, [enrichedPlots, useDynamicQualityTiers]);

  const nashqadLegendItems = useMemo(() => {
    let fullCnt = 0;
    let halfCnt = 0;
    for (const p of enrichedPlots) {
      if (p.isPartialQayb) halfCnt += 1;
      else fullCnt += 1;
    }
    return [
      {
        key: 'dhammaystiran',
        label: 'Plots dhammaystiran',
        color: '#10B981',
        count: fullCnt,
        hatch: false,
      },
      {
        key: 'half',
        label: 'Half plots',
        color: '#F59E0B',
        count: halfCnt,
        hatch: false,
      },
    ];
  }, [enrichedPlots]);

  // Filter plots by searchQuery, quickPlotFilter, AND active Legends checkboxes
  const visiblePlots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return enrichedPlots.filter((p) => {
      if (cartoStyle === 'nashqad') {
        const nk = p.isPartialQayb ? 'half' : 'dhammaystiran';
        if (hiddenNashqadLegendKeys[nk]) return false;
      } else if (cartoStyle === 'layout11') {
        if (hiddenPdfLegendKeys[p.pdfLegendKey]) return false;
      } else if (cartoStyle === 'heerarka') {
        if (hiddenTierLegendKeys[p.tierLegendKey]) return false;
      } else {
        const anyChecked = p.heirLegendKeys.some((k) => !hiddenHeirKeys[k]);
        if (!anyChecked) return false;
      }

      if (quickPlotFilter === 'buuxa' && !p.isFullBuuxa) return false;
      if (quickPlotFilter === 'partial_qayb' && !p.isPartialQayb) return false;
      if (quickPlotFilter === 'doox' && !p.isDoox) return false;
      if (quickPlotFilter === 'kale_named' && !p.namedCategory) return false;
      if (quickPlotFilter === 'available' && (p.isExcluded || p.isAssigned)) return false;
      if (quickPlotFilter === 'assigned' && !p.isAssigned) return false;

      if (!q) return true;
      return (
        p.id.toLowerCase().includes(q) ||
        p.shortLabel.toLowerCase().includes(q) ||
        p.blockId.toLowerCase().includes(q) ||
        p.blockDisplayName.toLowerCase().includes(q) ||
        p.ownerDisplay.toLowerCase().includes(q) ||
        p.specialName.toLowerCase().includes(q) ||
        (p.namedCategory || '').toLowerCase().includes(q) ||
        `heer ${p.blockHeer}`.includes(q)
      );
    });
  }, [
    enrichedPlots,
    quickPlotFilter,
    searchQuery,
    cartoStyle,
    hiddenNashqadLegendKeys,
    hiddenPdfLegendKeys,
    hiddenTierLegendKeys,
    hiddenHeirKeys,
  ]);

  const matchingCases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return savedCases
      .filter(
        (c) =>
          c.caseName.toLowerCase().includes(q) ||
          c.referenceNumber.toLowerCase().includes(q) ||
          (c.deceasedName || '').toLowerCase().includes(q)
      )
      .slice(0, 3);
  }, [savedCases, searchQuery]);

  useEffect(() => {
    if (!onVisiblePlotsChange) return;
    onVisiblePlotsChange(
      visiblePlots.length,
      enrichedPlots.length,
      new Set(visiblePlots.map((p) => p.id))
    );
  }, [visiblePlots, enrichedPlots.length, onVisiblePlotsChange]);

  const activeSelectedPlot = useMemo(() => {
    if (!selectedPlotId) return null;
    return enrichedPlots.find((p) => p.id === selectedPlotId) || null;
  }, [enrichedPlots, selectedPlotId]);

  useEffect(() => {
    if (enrichedPlots.length === 0) {
      setSelectedPlotId(null);
      setIsPlotSheetOpen(false);
    }
  }, [enrichedPlots.length]);

  // Run 1. Automatic Generator (DEM elevation + Nearest City-Connecting Road + Flatness vs Gullying)
  const runAutomaticTierGenerator = useCallback(
    async (overrideRoadAnchorLonLat?: Point2D | null) => {
      if (!subdivisionResult || !onUpdateSubdivisionState) return;
      setIsComputingAutoTiers(true);
      try {
        const demSampler = await buildDemSamplerForSubdivision(subdivisionResult);
        const effectiveAnchor =
          overrideRoadAnchorLonLat !== undefined
            ? overrideRoadAnchorLonLat
            : subdivisionState.cityRoadAnchorLonLat;
        const cityRoad = await resolveNearestCityConnectingRoad(
          subdivisionResult,
          subdivisionState.roadItems,
          effectiveAnchor
        );

        const computed = computeAutomaticDemAndRoadTiers({
          subdivision: subdivisionResult,
          demSampler,
          cityRoad,
          wadiItems: subdivisionState.wadiItems,
          existingPlotMetadata: subdivisionState.plotMetadata,
          existingBlockMetadata: subdivisionState.blockMetadata,
        });

        setHasUserEditedTiersInSession(true);
        setCartoStyle('heerarka');
        setHiddenTierLegendKeys({});

        onUpdateSubdivisionState((prev) => ({
          ...prev,
          ...(overrideRoadAnchorLonLat !== undefined
            ? { cityRoadAnchorLonLat: overrideRoadAnchorLonLat }
            : {}),
          blockTiers: computed.blockTiers,
          plotTierOverrides: computed.plotTierOverrides,
          plotMetadata: computed.updatedPlotMetadata,
          blockMetadata: computed.updatedBlockMetadata,
          autoTierSummary: computed.summary,
          approvalStatus:
            prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
          auditHistory: [
            createAuditEntry(
              'tier_change',
              `Automatic DEM & Waddo: H1=${computed.summary.tier1PlotsCount}, H2=${computed.summary.tier2PlotsCount}, H3=${computed.summary.tier3PlotsCount} (${computed.summary.demSourceLabel} · ${computed.summary.roadSourceLabel}).`
            ),
            ...(prev.auditHistory || []).slice(0, 49),
          ],
        }));

        onNotify(
          'Heerarka Dhulka (Automatic DEM + Waddo)',
          `Heer 1 (Siman): ${computed.summary.tier1PlotsCount} · Heer 2: ${computed.summary.tier2PlotsCount} · Heer 3 (Jeexjeex): ${computed.summary.tier3PlotsCount} plot.`
        );
      } catch {
        onNotify(
          'Khalad Xisaabinta DEM',
          'Xisaabinta otomaatigga ah ma dhammaystirmin — hubi xogta beerta.'
        );
      } finally {
        setIsComputingAutoTiers(false);
      }
    },
    [
      subdivisionResult,
      onUpdateSubdivisionState,
      subdivisionState.cityRoadAnchorLonLat,
      subdivisionState.roadItems,
      subdivisionState.wadiItems,
      subdivisionState.plotMetadata,
      subdivisionState.blockMetadata,
      onNotify,
    ]
  );

  // Initialize Leaflet Map Instance once
  useEffect(() => {
    if (!mapContainerRef.current || leafletMapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [9.621, 44.0585],
      zoom: 17,
      minZoom: 4,
      maxZoom: 22,
      zoomControl: false,
      attributionControl: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
    });

    const tileGroup = L.layerGroup().addTo(map);
    const overlayGroup = L.layerGroup().addTo(map);
    const gpsGroup = L.layerGroup().addTo(map);

    leafletMapRef.current = map;
    tileLayerGroupRef.current = tileGroup;
    gisOverlayGroupRef.current = overlayGroup;
    userLocationMarkerRef.current = gpsGroup;

    const updateScaleBar = () => {
      try {
        const size = map.getSize();
        if (size.x <= 0) return;
        const p1 = map.containerPointToLatLng([size.x / 2, size.y / 2]);
        const p2 = map.containerPointToLatLng([size.x / 2 + 100, size.y / 2]);
        const dist100Px = map.distance(p1, p2);
        if (dist100Px > 0) {
          const pxPerMeter = 100 / dist100Px;
          if (pxPerMeter * 100 >= 28 && pxPerMeter * 200 <= 260) {
            setScaleBarInfo({ stepPx: Math.round(pxPerMeter * 100), useKm: true });
          } else {
            setScaleBarInfo({
              stepPx: Math.max(28, Math.min(130, Math.round(pxPerMeter * 50))),
              useKm: false,
            });
          }
        }
      } catch {
        // Ignore transient map state before layout
      }
    };

    map.on('zoomend moveend resize', updateScaleBar);

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
      updateScaleBar();
    }, 120);

    return () => {
      window.clearTimeout(resizeTimer);
      map.off('zoomend moveend resize', updateScaleBar);
      map.remove();
      leafletMapRef.current = null;
      tileLayerGroupRef.current = null;
      gisOverlayGroupRef.current = null;
      userLocationMarkerRef.current = null;
    };
  }, []);

  // Synchronize Basemap Tile Layers (Paper PDF White | Free Satellite | Free OpenStreetMap | Offline Vector)
  useEffect(() => {
    const map = leafletMapRef.current;
    const tileGroup = tileLayerGroupRef.current;
    if (!map || !tileGroup) return;

    tileGroup.clearLayers();

    if (basemapMode === 'offline_vector' || basemapMode === 'paper_pdf') {
      return;
    }

    const handleTileError = (e: L.TileErrorEvent) => {
      if (e.tile) {
        e.tile.style.opacity = '0';
      }
      if (!navigator.onLine) {
        setTileOfflineFallbackNotice(true);
      }
    };

    if (basemapMode === 'osm') {
      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxNativeZoom: 19,
        maxZoom: 22,
        crossOrigin: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      });
      osmLayer.on('tileerror', handleTileError);
      tileGroup.addLayer(osmLayer);
    } else if (basemapMode === 'satellite') {
      const esriSat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxNativeZoom: 19,
          maxZoom: 22,
          crossOrigin: true,
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
        }
      );
      esriSat.on('tileerror', handleTileError);
      tileGroup.addLayer(esriSat);

      if (showHybridLabels) {
        const labelsLayer = L.tileLayer(
          'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          {
            maxNativeZoom: 19,
            maxZoom: 22,
            opacity: 0.9,
            crossOrigin: true,
          }
        );
        labelsLayer.on('tileerror', handleTileError);
        tileGroup.addLayer(labelsLayer);
      }
    }
  }, [basemapMode, showHybridLabels]);

  // Render GIS Vector Layers (Plots, Blocks, Wadis/Dooxyada, City Road Connection, Special Areas, Boundary)
  useEffect(() => {
    const map = leafletMapRef.current;
    const overlayGroup = gisOverlayGroupRef.current;
    if (!map || !overlayGroup) return;

    overlayGroup.clearLayers();

    if (!currentHasMap || !subdivisionResult) return;

    const allBoundsLatLngs: [number, number][] = [];
    const isPaper = basemapMode === 'paper_pdf';

    // 1. PLOTS LAYER
    if (layersVisible.plots) {
      visiblePlots.forEach((item) => {
        item.latLngRing.forEach((pt) => allBoundsLatLngs.push(pt));
        const isMultiSelectedPlot = selectedPlotIds.has(item.id);
        const isSelected = item.id === selectedPlotId || isMultiSelectedPlot;

        let fillColor = item.inheritanceFillColor;
        let strokeColor = isPaper ? '#111827' : '#F8FAFC';
        let strokeWeight = 0.9;
        let fillOpacity = isPaper ? 0.98 : basemapMode === 'offline_vector' ? 0.82 : 0.78;
        let showDiagonalHatch = false;

        if (cartoStyle === 'nashqad') {
          fillColor = item.isPartialQayb ? '#F59E0B' : '#10B981';
          strokeColor = isPaper ? '#0F172A' : '#06111F';
          strokeWeight = 1.0;
          fillOpacity = isPaper ? 0.9 : 0.78;
        } else if (cartoStyle === 'layout11' && item.cartoProfile) {
          fillColor = item.cartoProfile.layout11FillHex;
          strokeColor = '#111827';
          strokeWeight = 0.85;
          showDiagonalHatch = item.cartoProfile.layout11ShowHatch;
          if (!isPaper && fillColor === '#FFFFFF') {
            fillOpacity = basemapMode === 'satellite' ? 0.82 : 0.9;
          }
        } else if (cartoStyle === 'heerarka') {
          if (useDynamicQualityTiers) {
            const tm = TIER_METADATA[item.effectiveQualityTier];
            fillColor = tm.fillHex;
            strokeColor = isPaper ? '#0F172A' : '#0B1220';
            strokeWeight = 0.85;
            fillOpacity = isPaper ? 0.88 : 0.78;
          } else if (item.cartoProfile) {
            fillColor = item.cartoProfile.heerarkaFillHex;
            strokeColor = item.cartoProfile.heerarkaStrokeHex;
            strokeWeight = 0.75;
            fillOpacity = isPaper ? 0.96 : 0.82;
          }
        } else {
          fillOpacity = 0.58;
        }

        if (isMultiSelectedPlot) {
          fillColor = '#FACC15';
          fillOpacity = isPaper ? 0.92 : 0.86;
          strokeColor = isPaper ? '#B45309' : '#FEF08A';
          strokeWeight = 2.8;
        } else if (isSelected) {
          strokeColor = '#059669';
          strokeWeight = 2.8;
        }

        const poly = L.polygon(item.latLngRing, {
          color: strokeColor,
          weight: strokeWeight,
          opacity: 1,
          fillColor,
          fillOpacity,
        });

        poly.bindTooltip(
          makeSafeTooltipEl(`${item.id} · ${item.areaSqM} m² · ${item.statusText}`),
          {
            direction: 'top',
            className: 'gis-plot-tooltip',
            sticky: true,
          }
        );

        poly.on('click', () => {
          const {
            activeMapTool: tool,
            targetManualTier: tier,
            subdivisionResult: subRes,
            onUpdateSubdivisionState: updateFn,
          } = interactionStateRef.current;

          if (tool === 'select_plot' && updateFn) {
            setHasUserEditedTiersInSession(true);
            setCartoStyle('heerarka');
            updateFn((prev) => applyManualTierByPlot(prev, item.id, tier));
            return;
          }
          if (tool === 'select_block' && updateFn) {
            setHasUserEditedTiersInSession(true);
            setCartoStyle('heerarka');
            updateFn((prev) => applyManualTierByBlock(prev, item.blockId, subRes, tier));
            return;
          }

          setSelectedPlotId(item.id);
          setIsPlotSheetOpen(true);
        });

        poly.addTo(overlayGroup);

        if (showDiagonalHatch) {
          L.polygon(item.latLngRing, {
            stroke: true,
            color: strokeColor,
            weight: strokeWeight,
            fill: true,
            fillColor: 'url(#leaflet-qgis-layout11-hatch)',
            fillOpacity: 1,
            interactive: false,
          }).addTo(overlayGroup);
        }
      });

      ensureLeafletHatchPattern(map);

      // 1B. HTML COUNTED HALF-PLOTS (`HALF_FULL` — 18×12m / 9×24m = 216 m²)
      if (
        !subdivisionResult.isPrebuiltGeometry &&
        !hiddenHeirKeys['__half_plots__'] &&
        subdivisionResult.htmlHalvesCounted &&
        subdivisionResult.htmlHalvesCounted.length > 0
      ) {
        subdivisionResult.htmlHalvesCounted.forEach((h) => {
          const hRing = toLatLngRing(h.rect, subdivisionResult.inv);
          if (hRing.length < 3) return;
          const isHalfSelected = selectedPlotIds.has(h.plotId);
          const hPoly = L.polygon(hRing, {
            color: isHalfSelected ? (isPaper ? '#B45309' : '#FEF08A') : '#0A6A6A',
            weight: isHalfSelected ? 2.8 : 1.25,
            opacity: 1,
            fillColor: isHalfSelected ? '#FACC15' : '#14B8A6',
            fillOpacity: isPaper ? 0.92 : 0.85,
          });
          hPoly.bindTooltip(
            makeSafeTooltipEl(
              `${h.id} · Half Plot · ${h.hl}×${h.hw} m (${h.area.toFixed(1)} m²)${
                h.specialAreaName ? ` · Aag: ${h.specialAreaName}` : ''
              }`
            ),
            {
              direction: 'top',
              className: 'gis-plot-tooltip',
              sticky: true,
            }
          );
          hPoly.on('click', () => {
            const {
              activeMapTool: tool,
              targetManualTier: tier,
              subdivisionResult: subRes,
              onUpdateSubdivisionState: updateFn,
            } = interactionStateRef.current;

            if (tool === 'select_plot' && updateFn) {
              setHasUserEditedTiersInSession(true);
              setCartoStyle('heerarka');
              updateFn((prev) => applyManualTierByPlot(prev, h.plotId, tier));
              return;
            }
            if (tool === 'select_block' && updateFn) {
              const blkId = h.plotId.split('-P')[0];
              setHasUserEditedTiersInSession(true);
              setCartoStyle('heerarka');
              updateFn((prev) => applyManualTierByBlock(prev, blkId, subRes, tier));
              return;
            }
            setSelectedPlotId(h.plotId);
            setIsPlotSheetOpen(true);
          });
          hPoly.addTo(overlayGroup);
        });
      }
    }

    // 2. BLOCKS LAYER (also always render selected blocks with gold highlight)
    if (
      layersVisible.blocks &&
      (cartoStyle !== 'layout11' || !layersVisible.plots || selectedBlockIds.size > 0)
    ) {
      subdivisionResult.blocks.forEach((b: GeneratedBlock) => {
        if ((b.preservedProps as Record<string, unknown> | undefined)?.syntheticBlock) {
          return;
        }
        const isBlockSelected = selectedBlockIds.has(b.id);
        if (cartoStyle === 'layout11' && layersVisible.plots && !isBlockSelected) {
          return;
        }
        const ring = toLatLngRing(b.rect, subdivisionResult.inv);
        if (ring.length < 3) return;
        ring.forEach((pt) => allBoundsLatLngs.push(pt));

        const isHeerarka = cartoStyle === 'heerarka';
        const blkTier = subdivisionState.blockTiers[b.id] || 'tier_1_prime';
        const blkFill = isBlockSelected
          ? '#FACC15'
          : useDynamicQualityTiers
          ? TIER_METADATA[blkTier].fillHex
          : '#3B82F6';

        const bPoly = L.polygon(ring, {
          color: isBlockSelected
            ? isPaper
              ? '#B45309'
              : '#FACC15'
            : isHeerarka
            ? useDynamicQualityTiers
              ? '#0F172A'
              : HEERARKA_MAP_COLORS.blockStroke
            : '#38BDF8',
          weight: isBlockSelected ? 3.4 : isHeerarka ? 1.55 : 2.0,
          opacity: 1,
          fillColor: blkFill,
          fillOpacity: isBlockSelected ? 0.3 : layersVisible.plots ? 0 : 0.45,
          interactive: !layersVisible.plots || activeMapTool === 'select_block',
        });

        if (!layersVisible.plots || activeMapTool === 'select_block') {
          bPoly.on('click', () => {
            const {
              activeMapTool: tool,
              targetManualTier: tier,
              subdivisionResult: subRes,
              onUpdateSubdivisionState: updateFn,
            } = interactionStateRef.current;
            if (tool === 'select_block' && updateFn) {
              setHasUserEditedTiersInSession(true);
              setCartoStyle('heerarka');
              updateFn((prev) => applyManualTierByBlock(prev, b.id, subRes, tier));
            }
          });
        }
        bPoly.addTo(overlayGroup);

        const [bLon, bLat] = subdivisionResult.inv(b.centerUtm);
        if (Number.isFinite(bLat) && Number.isFinite(bLon)) {
          const m = /^(R\d+)[-_](C\d+)$/i.exec(b.id.trim());
          const badgeEl = isHeerarka
            ? m
              ? makeSafeBlockBadgeEl([m[1].toUpperCase(), m[2].toUpperCase()], 'heerarka')
              : makeSafeBlockBadgeEl([b.id], 'heerarka')
            : makeSafeBlockBadgeEl([b.id], 'dark');

          const blockLabel = L.divIcon({
            className: 'gis-block-label-icon',
            html: badgeEl,
            iconSize: [0, 0],
          });
          L.marker([bLat, bLon], { icon: blockLabel, interactive: false }).addTo(overlayGroup);
        }
      });
    }

    // 3. DOOXYADA & INTERNAL SUBDIVISION ROADS LAYER
    if (layersVisible.roads) {
      if (!subdivisionResult.isPrebuiltGeometry && cartoStyle === 'inheritance') {
        const { u, v, params } = subdivisionResult;
        const rV = params.rV || 0;
        const rU = params.rU || 0;
        subdivisionResult.blocks.forEach((b: GeneratedBlock) => {
          if (!b.rect || b.rect.length < 4) return;
          const [c0, c1, , c3] = b.rect;
          if (rV > 0) {
            const roadH: Point2D[] = [
              c3,
              [c3[0] + u[0] * params.L, c3[1] + u[1] * params.L],
              [
                c3[0] + u[0] * params.L + v[0] * rV,
                c3[1] + u[1] * params.L + v[1] * rV,
              ],
              [c3[0] + v[0] * rV, c3[1] + v[1] * rV],
            ];
            const ring = toLatLngRing(roadH, subdivisionResult.inv);
            if (ring.length >= 3) {
              L.polygon(ring, {
                color: '#F97316',
                weight: 1,
                opacity: 0.7,
                fillColor: '#F97316',
                fillOpacity: 0.24,
                interactive: false,
              }).addTo(overlayGroup);
            }
          }
          if (rU > 0) {
            const roadV: Point2D[] = [
              c1,
              [c1[0] + u[0] * rU, c1[1] + u[1] * rU],
              [
                c1[0] + u[0] * rU + v[0] * params.W,
                c1[1] + u[1] * rU + v[1] * params.W,
              ],
              [
                c0[0] + u[0] * params.L + v[0] * params.W,
                c0[1] + u[1] * params.L + v[1] * params.W,
              ],
            ];
            const ring = toLatLngRing(roadV, subdivisionResult.inv);
            if (ring.length >= 3) {
              L.polygon(ring, {
                color: '#F97316',
                weight: 1,
                opacity: 0.7,
                fillColor: '#F97316',
                fillOpacity: 0.24,
                interactive: false,
              }).addTo(overlayGroup);
            }
          }
        });
      }

      if (cartoReport && cartoReport.projectedWadiLinesUtm.length > 0) {
        cartoReport.projectedWadiLinesUtm.forEach((lineUtm) => {
          const lineLatLngs = toLatLngRing(lineUtm, subdivisionResult.inv);
          if (lineLatLngs.length >= 2) {
            L.polyline(lineLatLngs, {
              color:
                cartoStyle === 'heerarka'
                  ? HEERARKA_MAP_COLORS.dooxaLine
                  : '#3CE7F7',
              weight: cartoStyle === 'heerarka' ? 3 : 2.6,
              opacity: 1,
              interactive: false,
            }).addTo(overlayGroup);
          }
        });
      }
    }

    // 3B. CITY-CONNECTING ROAD & NEAREST LINK OVERLAY (`Waddada Magaalada`)
    if (layersVisible.cityRoad) {
      // Uploaded custom road GeoJSON
      if (subdivisionState.roadItems && subdivisionState.roadItems.length > 0) {
        subdivisionState.roadItems.forEach((ri) => {
          const pts: [number, number][] = ri.coords
            .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]))
            .map(([lon, lat]) => [lat, lon]);
          if (pts.length >= 2) {
            L.polyline(pts, {
              color: '#F59E0B',
              weight: 3.5,
              opacity: 0.95,
            })
              .bindTooltip(makeSafeTooltipEl(`Waddada Magaalada: ${ri.name}`), {
                className: 'gis-plot-tooltip',
                sticky: true,
              })
              .addTo(overlayGroup);
          }
        });
      }

      // Detected OSM highway polyline from Automatic Generator
      const detectedLine = subdivisionState.autoTierSummary?.detectedRoadLineLonLat;
      if (detectedLine && detectedLine.length >= 2) {
        const pts: [number, number][] = detectedLine
          .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]))
          .map(([lon, lat]) => [lat, lon]);
        if (pts.length >= 2) {
          L.polyline(pts, {
            color: '#F59E0B',
            weight: 3.4,
            opacity: 0.9,
          })
            .bindTooltip(
              makeSafeTooltipEl(
                subdivisionState.autoTierSummary?.roadSourceLabel || 'Waddada Magaalada'
              ),
              { className: 'gis-plot-tooltip', sticky: true }
            )
            .addTo(overlayGroup);
        }
      }

      // Shortest connection line from Farm to City Road
      const fPt = subdivisionState.autoTierSummary?.nearestFarmPointLonLat;
      const rPt = subdivisionState.autoTierSummary?.nearestRoadPointLonLat;
      const rDist = subdivisionState.autoTierSummary?.nearestRoadDistanceM;
      if (fPt && rPt && rDist !== null && rDist !== undefined) {
        L.polyline(
          [
            [fPt[1], fPt[0]],
            [rPt[1], rPt[0]],
          ],
          {
            color: '#10B981',
            weight: 2.2,
            dashArray: '6 5',
            opacity: 0.95,
          }
        )
          .bindTooltip(
            makeSafeTooltipEl(`Masaafada ugu dhow waddada magaalada: ${rDist} m`),
            {
              className: 'gis-plot-tooltip',
              sticky: true,
            }
          )
          .addTo(overlayGroup);
      }

      // User-pinned City Road Anchor
      if (subdivisionState.cityRoadAnchorLonLat) {
        const [aLon, aLat] = subdivisionState.cityRoadAnchorLonLat;
        L.circleMarker([aLat, aLon], {
          radius: 7,
          color: '#FFFFFF',
          weight: 2,
          fillColor: '#F59E0B',
          fillOpacity: 1,
        })
          .bindTooltip(makeSafeTooltipEl('Barta Waddada Magaalada (La Calaamadeeyey)'), {
            className: 'gis-plot-tooltip',
          })
          .addTo(overlayGroup);
      }
    }

    // 3C. SPECIAL AREAS LAYER (`Aag gaar ah`)
    if (
      layersVisible.specialAreas &&
      subdivisionResult.specialAreas &&
      subdivisionResult.specialAreas.length > 0
    ) {
      subdivisionResult.specialAreas.forEach((sa) => {
        const saRing = toLatLngRing(sa.ringUtm, subdivisionResult.inv);
        if (saRing.length < 3) return;
        saRing.forEach((pt) => allBoundsLatLngs.push(pt));

        const saPoly = L.polygon(saRing, {
          color: '#7C3AED',
          weight: 2.4,
          opacity: 0.95,
          fillColor: '#7C3AED',
          fillOpacity: 0.16,
        });
        saPoly.bindTooltip(
          makeSafeTooltipEl(
            `Aag: ${sa.name} · ${sa.nP} plots + ${sa.nH} half (${Math.round(sa.aP + sa.aH)} m²)`
          ),
          {
            direction: 'top',
            className: 'gis-plot-tooltip',
            sticky: true,
          }
        );
        saPoly.addTo(overlayGroup);

        const cUtm: Point2D = [
          sa.ringUtm.reduce((s, q) => s + q[0], 0) / sa.ringUtm.length,
          sa.ringUtm.reduce((s, q) => s + q[1], 0) / sa.ringUtm.length,
        ];
        const [sLon, sLat] = subdivisionResult.inv(cUtm);
        if (Number.isFinite(sLat) && Number.isFinite(sLon)) {
          const saBadge = makeSafeBlockBadgeEl([`${sa.name} (${sa.nP}P + ${sa.nH}½)`], 'purple');
          const saLabel = L.divIcon({
            className: 'gis-block-label-icon',
            html: saBadge,
            iconSize: [0, 0],
          });
          L.marker([sLat, sLon], { icon: saLabel, interactive: false }).addTo(overlayGroup);
        }
      });
    }

    // 3D. EXTRA IMPORTED GEOJSON OVERLAY LAYERS (from 20+ simultaneous GeoJSON imports)
    if (
      layersVisible.extraLayers &&
      subdivisionState.extraOverlayLayers &&
      subdivisionState.extraOverlayLayers.length > 0
    ) {
      subdivisionState.extraOverlayLayers.forEach((exLayer) => {
        if (hiddenExtraLayerIds[exLayer.id]) return;

        exLayer.polygonsLonLat.forEach((polyItem) => {
          const latLngs: [number, number][] = polyItem.ring
            .filter(
              (pt) =>
                Number.isFinite(pt[1]) &&
                Number.isFinite(pt[0]) &&
                Math.abs(pt[1]) <= 90 &&
                Math.abs(pt[0]) <= 180
            )
            .map((pt) => [pt[1], pt[0]]);
          if (latLngs.length < 3) return;
          latLngs.forEach((ll) => allBoundsLatLngs.push(ll));

          L.polygon(latLngs, {
            color: exLayer.colorHex,
            weight: 2,
            opacity: 0.9,
            fillColor: exLayer.colorHex,
            fillOpacity: 0.18,
          })
            .bindTooltip(
              makeSafeTooltipEl(
                polyItem.label ? `${exLayer.name} · ${polyItem.label}` : exLayer.name
              ),
              {
                direction: 'top',
                className: 'gis-plot-tooltip',
                sticky: true,
              }
            )
            .addTo(overlayGroup);
        });

        exLayer.linesLonLat.forEach((lineItem) => {
          const latLngs: [number, number][] = lineItem.coords
            .filter(
              (pt: Point2D) =>
                Number.isFinite(pt[1]) &&
                Number.isFinite(pt[0]) &&
                Math.abs(pt[1]) <= 90 &&
                Math.abs(pt[0]) <= 180
            )
            .map((pt: Point2D) => [pt[1], pt[0]]);
          if (latLngs.length < 2) return;
          latLngs.forEach((ll) => allBoundsLatLngs.push(ll));

          L.polyline(latLngs, {
            color: exLayer.colorHex,
            weight: 2.6,
            opacity: 0.92,
          })
            .bindTooltip(
              makeSafeTooltipEl(
                lineItem.label ? `${exLayer.name} · ${lineItem.label}` : exLayer.name
              ),
              {
                className: 'gis-plot-tooltip',
                sticky: true,
              }
            )
            .addTo(overlayGroup);
        });

        exLayer.pointsLonLat.forEach((ptItem) => {
          const [lon, lat] = ptItem.coord;
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
          if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
          allBoundsLatLngs.push([lat, lon]);

          L.circleMarker([lat, lon], {
            radius: 5.5,
            color: '#FFFFFF',
            weight: 1.8,
            fillColor: exLayer.colorHex,
            fillOpacity: 0.95,
          })
            .bindTooltip(
              makeSafeTooltipEl(
                ptItem.label ? `${exLayer.name} · ${ptItem.label}` : exLayer.name
              ),
              {
                direction: 'top',
                className: 'gis-plot-tooltip',
              }
            )
            .addTo(overlayGroup);
        });
      });
    }

    // 4. FARM BOUNDARY LAYER (`01_xuduudka_beerta`)
    const hasExplicitBoundaryLayer =
      !subdivisionState.prebuiltSubdivision ||
      Boolean(
        subdivisionState.prebuiltSubdivision.boundaryRingLonLat &&
          subdivisionState.prebuiltSubdivision.boundaryRingLonLat.length >= 3
      );
    if (subdivisionResult.bring && subdivisionResult.bring.length >= 3) {
      const boundaryLatLngs = toLatLngRing(subdivisionResult.bring, subdivisionResult.inv);
      boundaryLatLngs.forEach((pt) => allBoundsLatLngs.push(pt));

      if (hasExplicitBoundaryLayer && layersVisible.boundary && boundaryLatLngs.length >= 3) {
        L.polygon(boundaryLatLngs, {
          color:
            cartoStyle === 'nashqad' || cartoStyle === 'layout11'
              ? '#E31A1C'
              : cartoStyle === 'heerarka'
              ? HEERARKA_MAP_COLORS.boundaryLine
              : '#F8FAFC',
          weight: 2.6,
          opacity: 1,
          fill: false,
          interactive: false,
        }).addTo(overlayGroup);
      }
    }

    // Fit map bounds automatically when geometry source changes
    const fitSignature = `${subdivisionState.boundaryFileName}::${
      subdivisionState.prebuiltSubdivision?.sourceFileName || ''
    }::${subdivisionState.selectedBoundaryIndex}::${subdivisionState.selectedSampleIndex}::${
      subdivisionState.specialAreaFileName || ''
    }::${enrichedPlots.length}::${subdivisionState.extraOverlayLayers?.length || 0}`;
    if (allBoundsLatLngs.length >= 3 && lastFittedSignatureRef.current !== fitSignature) {
      lastFittedSignatureRef.current = fitSignature;
      const bounds = L.latLngBounds(allBoundsLatLngs);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 18 });
      }
    }
  }, [
    currentHasMap,
    subdivisionResult,
    subdivisionState.boundaryFileName,
    subdivisionState.prebuiltSubdivision?.sourceFileName,
    subdivisionState.selectedBoundaryIndex,
    subdivisionState.selectedSampleIndex,
    subdivisionState.specialAreaFileName,
    subdivisionState.blockTiers,
    subdivisionState.roadItems,
    subdivisionState.cityRoadAnchorLonLat,
    subdivisionState.autoTierSummary,
    subdivisionState.extraOverlayLayers,
    layersVisible,
    hiddenExtraLayerIds,
    visiblePlots,
    enrichedPlots.length,
    selectedPlotId,
    selectedPlotIds,
    selectedBlockIds,
    basemapMode,
    cartoStyle,
    useDynamicQualityTiers,
    activeMapTool,
    cartoReport,
    hiddenHeirKeys,
  ]);

  const clearGpsWatchers = useCallback(() => {
    if (
      gpsWatchIdRef.current !== null &&
      typeof navigator !== 'undefined' &&
      'geolocation' in navigator
    ) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    if (gpsWatchTimerRef.current !== null) {
      window.clearTimeout(gpsWatchTimerRef.current);
      gpsWatchTimerRef.current = null;
    }
    if (gpsReverseAbortRef.current) {
      gpsReverseAbortRef.current.abort();
      gpsReverseAbortRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearGpsWatchers();
    };
  }, [clearGpsWatchers]);

  const computeLayerBoundsLatLngs = useCallback(
    (
      targetKey: string
    ): { pts: [number, number][]; labelSomali: string } => {
      if (!subdivisionResult || !currentHasMap) {
        return { pts: [], labelSomali: 'Lakabka Firfircoon' };
      }

      const pushLonLatRing = (ringLonLat: Point2D[], out: [number, number][]) => {
        for (const [lon, lat] of ringLonLat) {
          if (
            Number.isFinite(lat) &&
            Number.isFinite(lon) &&
            Math.abs(lat) <= 90 &&
            Math.abs(lon) <= 180
          ) {
            out.push([lat, lon]);
          }
        }
      };

      if (targetKey === 'selected_features') {
        const pts: [number, number][] = [];
        if (selectedPlotIds.size > 0) {
          enrichedPlots.forEach((p) => {
            if (selectedPlotIds.has(p.id)) {
              p.latLngRing.forEach((ll) => pts.push(ll));
            }
          });
        }
        if (selectedBlockIds.size > 0) {
          subdivisionResult.blocks.forEach((b) => {
            if (selectedBlockIds.has(b.id)) {
              toLatLngRing(b.rect, subdivisionResult.inv).forEach((ll) => pts.push(ll));
            }
          });
        }
        return { pts, labelSomali: `Xulashada (${totalSelectedFeaturesCount})` };
      }

      if (targetKey === 'boundary') {
        return {
          pts: toLatLngRing(subdivisionResult.bring, subdivisionResult.inv),
          labelSomali: 'Xuduudka Beerta',
        };
      }

      if (targetKey === 'plots') {
        const pts: [number, number][] = [];
        const sourcePlots = visiblePlots.length > 0 ? visiblePlots : enrichedPlots;
        sourcePlots.forEach((p) => p.latLngRing.forEach((ll) => pts.push(ll)));
        return { pts, labelSomali: `Plots (${sourcePlots.length})` };
      }

      if (targetKey === 'blocks') {
        const pts: [number, number][] = [];
        subdivisionResult.blocks.forEach((b) => {
          if (b.preservedProps && b.preservedProps.syntheticBlock === true) return;
          toLatLngRing(b.rect, subdivisionResult.inv).forEach((ll) => pts.push(ll));
        });
        return { pts, labelSomali: 'Blocks' };
      }

      if (targetKey === 'roads') {
        const pts: [number, number][] = [];
        (subdivisionState.roadItems || []).forEach((rd) =>
          pushLonLatRing(rd.coords, pts)
        );
        if (pts.length === 0) {
          subdivisionResult.blocks.forEach((b) => {
            toLatLngRing(b.rect, subdivisionResult.inv).forEach((ll) => pts.push(ll));
          });
        }
        return { pts, labelSomali: 'Dooxyada & Jidadka Gudaha' };
      }

      if (targetKey === 'cityRoad') {
        const pts: [number, number][] = [];
        if (subdivisionState.autoTierSummary?.detectedRoadLineLonLat) {
          pushLonLatRing(subdivisionState.autoTierSummary.detectedRoadLineLonLat, pts);
        }
        if (subdivisionState.autoTierSummary?.nearestRoadPointLonLat) {
          pushLonLatRing([subdivisionState.autoTierSummary.nearestRoadPointLonLat], pts);
        }
        if (subdivisionState.autoTierSummary?.nearestFarmPointLonLat) {
          pushLonLatRing([subdivisionState.autoTierSummary.nearestFarmPointLonLat], pts);
        }
        if (subdivisionState.cityRoadAnchorLonLat) {
          pushLonLatRing([subdivisionState.cityRoadAnchorLonLat], pts);
        }
        return { pts, labelSomali: 'Waddada Magaalada' };
      }

      if (targetKey === 'specialAreas') {
        const pts: [number, number][] = [];
        (subdivisionResult.specialAreas || []).forEach((sa) => {
          toLatLngRing(sa.ring, subdivisionResult.inv).forEach((ll) => pts.push(ll));
        });
        return { pts, labelSomali: 'Aagagga Gaarka ah' };
      }

      if (targetKey.startsWith('extra:')) {
        const exId = targetKey.slice(6);
        const ex = (subdivisionState.extraOverlayLayers || []).find((l) => l.id === exId);
        const pts: [number, number][] = [];
        if (ex) {
          ex.polygonsLonLat.forEach((r) => pushLonLatRing(r.ring, pts));
          ex.linesLonLat.forEach((ln) => pushLonLatRing(ln.coords, pts));
          ex.pointsLonLat.forEach((ptItem) => pushLonLatRing([ptItem.coord], pts));
          return { pts, labelSomali: ex.name };
        }
      }

      // Default: 'all_visible' -> exact extent of all currently active/checked layers
      const pts: [number, number][] = [];
      if (layersVisible.plots && visiblePlots.length > 0) {
        visiblePlots.forEach((p) => p.latLngRing.forEach((ll) => pts.push(ll)));
      }
      if (layersVisible.blocks) {
        subdivisionResult.blocks.forEach((b) => {
          if (b.preservedProps && b.preservedProps.syntheticBlock === true) return;
          toLatLngRing(b.rect, subdivisionResult.inv).forEach((ll) => pts.push(ll));
        });
      }
      if (layersVisible.roads) {
        (subdivisionState.roadItems || []).forEach((rd) =>
          pushLonLatRing(rd.coords, pts)
        );
      }
      if (layersVisible.cityRoad) {
        if (subdivisionState.autoTierSummary?.detectedRoadLineLonLat) {
          pushLonLatRing(subdivisionState.autoTierSummary.detectedRoadLineLonLat, pts);
        }
        if (subdivisionState.cityRoadAnchorLonLat) {
          pushLonLatRing([subdivisionState.cityRoadAnchorLonLat], pts);
        }
      }
      if (layersVisible.specialAreas) {
        (subdivisionResult.specialAreas || []).forEach((sa) => {
          toLatLngRing(sa.ring, subdivisionResult.inv).forEach((ll) => pts.push(ll));
        });
      }
      if (layersVisible.extraLayers && subdivisionState.extraOverlayLayers) {
        subdivisionState.extraOverlayLayers.forEach((ex) => {
          if (hiddenExtraLayerIds[ex.id]) return;
          ex.polygonsLonLat.forEach((r) => pushLonLatRing(r.ring, pts));
          ex.linesLonLat.forEach((ln) => pushLonLatRing(ln.coords, pts));
          ex.pointsLonLat.forEach((ptItem) => pushLonLatRing([ptItem.coord], pts));
        });
      }
      if (layersVisible.boundary || pts.length === 0) {
        toLatLngRing(subdivisionResult.bring, subdivisionResult.inv).forEach((ll) =>
          pts.push(ll)
        );
      }

      return { pts, labelSomali: 'Lakabyada Firfircoon' };
    },
    [
      currentHasMap,
      enrichedPlots,
      hiddenExtraLayerIds,
      layersVisible,
      selectedBlockIds,
      selectedPlotIds,
      subdivisionResult,
      subdivisionState.autoTierSummary,
      subdivisionState.cityRoadAnchorLonLat,
      subdivisionState.extraOverlayLayers,
      subdivisionState.roadItems,
      selectedPlotIds.size,
      selectedBlockIds.size,
      visiblePlots,
    ]
  );

  const zoomToTargetLayerKey = useCallback(
    (targetKey: string) => {
      const map = leafletMapRef.current;
      if (!map) return;

      // Ensure targeted layer is visible when explicitly zooming to it
      if (targetKey === 'boundary' && !layersVisible.boundary) {
        setLayersVisible((p) => ({ ...p, boundary: true }));
      } else if (targetKey === 'plots' && !layersVisible.plots) {
        setLayersVisible((p) => ({ ...p, plots: true }));
      } else if (targetKey === 'blocks' && !layersVisible.blocks) {
        setLayersVisible((p) => ({ ...p, blocks: true }));
      } else if (targetKey === 'roads' && !layersVisible.roads) {
        setLayersVisible((p) => ({ ...p, roads: true }));
      } else if (targetKey === 'cityRoad' && !layersVisible.cityRoad) {
        setLayersVisible((p) => ({ ...p, cityRoad: true }));
      } else if (targetKey === 'specialAreas' && !layersVisible.specialAreas) {
        setLayersVisible((p) => ({ ...p, specialAreas: true }));
      } else if (targetKey.startsWith('extra:')) {
        const exId = targetKey.slice(6);
        if (!layersVisible.extraLayers) {
          setLayersVisible((p) => ({ ...p, extraLayers: true }));
        }
        if (hiddenExtraLayerIds[exId]) {
          setHiddenExtraLayerIds((p) => ({ ...p, [exId]: false }));
        }
      }

      if (!currentHasMap || !subdivisionResult) {
        if (userGpsInfo) {
          map.flyTo([userGpsInfo.lat, userGpsInfo.lng], 18, { duration: 0.6 });
        }
        return;
      }

      let { pts } = computeLayerBoundsLatLngs(targetKey);
      if (pts.length === 0) {
        pts = computeLayerBoundsLatLngs('all_visible').pts;
      }
      if (pts.length === 1) {
        map.flyTo(pts[0], 18, { duration: 0.55 });
        return;
      }
      if (pts.length >= 2) {
        const bounds = L.latLngBounds(pts);
        if (bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [36, 36], maxZoom: 19, duration: 0.55 });
        }
      }
    },
    [
      computeLayerBoundsLatLngs,
      currentHasMap,
      hiddenExtraLayerIds,
      layersVisible,
      subdivisionResult,
      userGpsInfo,
    ]
  );

  const handleZoomToActiveLayer = useCallback(() => {
    const effectiveKey =
      activeZoomLayer === 'selected_features' &&
      selectedPlotIds.size + selectedBlockIds.size === 0
        ? 'all_visible'
        : activeZoomLayer;
    zoomToTargetLayerKey(effectiveKey);
  }, [activeZoomLayer, selectedBlockIds.size, selectedPlotIds.size, zoomToTargetLayerKey]);

  const activeLayerDisplayLabel = useMemo(() => {
    if (!currentHasMap || !subdivisionResult) return 'Lakabka Firfircoon';
    return computeLayerBoundsLatLngs(activeZoomLayer).labelSomali;
  }, [activeZoomLayer, computeLayerBoundsLatLngs, currentHasMap, subdivisionResult]);

  const describeGpsRelationToFarm = useCallback(
    (lat: number, lng: number): string => {
      if (!currentHasMap || !subdivisionResult) return '';
      for (const p of enrichedPlots) {
        if (isLatLngInsideRing(lat, lng, p.latLngRing)) {
          return `Gudaha Beerta · Plot ${p.id} (Block ${p.blockDisplayName})`;
        }
      }
      const farmRing = toLatLngRing(subdivisionResult.bring, subdivisionResult.inv);
      if (farmRing.length >= 3) {
        if (isLatLngInsideRing(lat, lng, farmRing)) {
          return 'Gudaha Xuduudka Beerta';
        }
        let sLat = 0;
        let sLng = 0;
        for (const [rLat, rLng] of farmRing) {
          sLat += rLat;
          sLng += rLng;
        }
        const distM = haversineMeters(
          lat,
          lng,
          sLat / farmRing.length,
          sLng / farmRing.length
        );
        return distM >= 1000
          ? `${(distM / 1000).toFixed(2)} km u jirta beerta`
          : `${Math.round(distM)} m u jirta beerta`;
      }
      return '';
    },
    [currentHasMap, enrichedPlots, subdivisionResult]
  );

  const handleClearUserGps = useCallback(() => {
    clearGpsWatchers();
    setIsLocatingGps(false);
    setUserGpsInfo(null);
    userLocationMarkerRef.current?.clearLayers();
  }, [clearGpsWatchers]);

  const handleLocateMeGps = () => {
    const map = leafletMapRef.current;
    const gpsGroup = userLocationMarkerRef.current;
    if (!map || !gpsGroup) return;

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      onNotify('GPS Lama Helin', 'Qalabkaagu ama browser-kaagu ma taageerayo GPS location.');
      return;
    }

    clearGpsWatchers();
    setIsLocatingGps(true);

    // Switch out of blank white Paper PDF mode so real streets/satellite imagery of user's exact location appear
    if (basemapMode === 'paper_pdf') {
      setBasemapMode(isOnline ? 'satellite' : 'offline_vector');
      setShowHybridLabels(true);
    }

    let bestAccuracySeen = Infinity;
    let lastPlaceLabel = 'Goobtaada Saxda ah (GPS)';
    let hasFlownInitial = false;

    const renderGpsMarkerAndTooltip = (
      lat: number,
      lng: number,
      accuracyM: number,
      placeText: string,
      farmRelText: string,
      shouldOpenTooltip: boolean
    ): L.CircleMarker => {
      gpsGroup.clearLayers();

      // 1. Metric GPS accuracy circle
      L.circle([lat, lng], {
        radius: Math.max(4, accuracyM),
        color: '#38BDF8',
        weight: 1.5,
        opacity: 0.75,
        fillColor: '#38BDF8',
        fillOpacity: 0.14,
        interactive: false,
      }).addTo(gpsGroup);

      // 2. Soft outer halo
      L.circleMarker([lat, lng], {
        radius: 13,
        color: '#0EA5E9',
        weight: 1.5,
        fillColor: '#0EA5E9',
        fillOpacity: 0.25,
        interactive: false,
      }).addTo(gpsGroup);

      // 3. Exact center GPS pinpoint
      const tooltipLines = [
        placeText,
        `Lat ${lat.toFixed(6)}°, Lng ${lng.toFixed(6)}° (±${accuracyM} m)`,
      ];
      if (farmRelText) {
        tooltipLines.push(farmRelText);
      }

      const centerDot = L.circleMarker([lat, lng], {
        radius: 7,
        color: '#FFFFFF',
        weight: 2.6,
        fillColor: '#0284C7',
        fillOpacity: 1,
      })
        .bindTooltip(makeSafeMultiLineTooltipEl(tooltipLines), {
          direction: 'top',
          offset: [0, -8],
          className: 'gis-plot-tooltip',
        })
        .addTo(gpsGroup);

      if (shouldOpenTooltip) {
        centerDot.openTooltip();
      }
      return centerDot;
    };

    const reverseGeocodeExactPlace = async (
      lat: number,
      lng: number,
      accuracyM: number,
      farmRelText: string
    ) => {
      if (!isOnline) return;
      const controller = new AbortController();
      gpsReverseAbortRef.current = controller;
      const timer = window.setTimeout(() => controller.abort(), 6500);
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
          lat.toFixed(6)
        )}&lon=${encodeURIComponent(lng.toFixed(6))}&zoom=18&accept-language=so,en`;
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as {
          name?: string;
          display_name?: string;
          address?: Record<string, string | undefined>;
        };
        const addr = data?.address || {};
        const primaryParts = [
          data?.name ||
            addr.road ||
            addr.pedestrian ||
            addr.Residential ||
            addr.Path ||
            '',
          addr.neighbourhood ||
            addr.suburb ||
            addr.quarter ||
            addr.city_district ||
            addr.hamlet ||
            '',
          addr.city ||
            addr.town ||
            addr.village ||
            addr.municipality ||
            addr.county ||
            addr.state ||
            '',
        ]
          .map((s) => (s || '').trim())
          .filter(Boolean);

        const deduped: string[] = [];
        for (const p of primaryParts) {
          if (!deduped.some((existing) => existing.toLowerCase() === p.toLowerCase())) {
            deduped.push(p);
          }
        }

        const resolvedLabel =
          deduped.length > 0
            ? deduped.join(', ')
            : data?.display_name
            ? data.display_name.split(',').slice(0, 3).join(',').trim()
            : '';

        if (resolvedLabel) {
          lastPlaceLabel = resolvedLabel;
          setUserGpsInfo((prev) =>
            prev ? { ...prev, placeLabel: resolvedLabel } : prev
          );
          renderGpsMarkerAndTooltip(
            lat,
            lng,
            accuracyM,
            resolvedLabel,
            farmRelText,
            true
          );
          onNotify(
            'Goobtaada Saxda ah (GPS)',
            `${resolvedLabel} — Lat ${lat.toFixed(5)}°, Lng ${lng.toFixed(5)}° (±${accuracyM} m)${
              farmRelText ? ` · ${farmRelText}` : ''
            }`
          );
        }
      } catch {
        // Ignore network/abort errors; coordinates & map marker remain visible
      } finally {
        window.clearTimeout(timer);
      }
    };

    const applyGpsPosition = (pos: GeolocationPosition, isInitialFix: boolean) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracyM = Math.max(3, Math.round(pos.coords.accuracy || 15));

      if (!isInitialFix && accuracyM >= bestAccuracySeen) {
        return;
      }
      bestAccuracySeen = accuracyM;

      const farmRel = describeGpsRelationToFarm(lat, lng);
      setIsLocatingGps(false);
      setUserGpsInfo({
        lat,
        lng,
        accuracyM,
        placeLabel: lastPlaceLabel,
        farmRelationLabel: farmRel,
      });

      renderGpsMarkerAndTooltip(
        lat,
        lng,
        accuracyM,
        lastPlaceLabel,
        farmRel,
        isInitialFix
      );

      if (!hasFlownInitial) {
        hasFlownInitial = true;
        const targetZoom = accuracyM <= 45 ? 18 : accuracyM <= 180 ? 17 : 16;
        map.flyTo([lat, lng], targetZoom, { duration: 0.85 });

        onNotify(
          'Goobtaada GPS Waa La Helay',
          `Lat ${lat.toFixed(6)}°, Lng ${lng.toFixed(6)}° (±${accuracyM} m)${
            farmRel ? ` · ${farmRel}` : ''
          }`
        );
        void reverseGeocodeExactPlace(lat, lng, accuracyM, farmRel);
      } else {
        map.panTo([lat, lng], { animate: true });
      }
    };

    const handleGpsError = (err: GeolocationPositionError, usedHighAccuracy: boolean) => {
      // If high-accuracy GPS timed out or was temporarily unavailable indoors, fallback to standard network/Wi-Fi location
      if (usedHighAccuracy && (err.code === 2 || err.code === 3)) {
        navigator.geolocation.getCurrentPosition(
          (posFallback) => {
            applyGpsPosition(posFallback, true);
          },
          (err2) => {
            setIsLocatingGps(false);
            if (err2.code === 1) {
              onNotify(
                'GPS Lama Ogolaan',
                'Fadlan browser-ka u oggolow Location/GPS si uu u muujiyo goobta saxda ah ee aad joogto.'
              );
            } else {
              onNotify(
                'Calaamadda GPS Waa Daciif',
                'Goobta GPS hadda lama xaqiijin karin. Hubi in Location-ka qalabkaagu shidan yahay.'
              );
            }
          },
          { enableHighAccuracy: false, maximumAge: 0, timeout: 12000 }
        );
        return;
      }

      setIsLocatingGps(false);
      if (err.code === 1) {
        onNotify(
          'GPS Lama Ogolaan',
          'Fadlan browser-ka u oggolow Location/GPS si uu u muujiyo goobta saxda ah ee aad joogto.'
        );
      } else {
        onNotify(
          'Calaamadda GPS Waa Daciif',
          'Goobta GPS hadda lama xaqiijin karin. Hubi in Location-ka qalabkaagu shidan yahay.'
        );
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyGpsPosition(pos, true);

        // Refine GPS accuracy for up to 10s if initial fix was coarser than 18m
        if ((pos.coords.accuracy || 999) > 18) {
          gpsWatchIdRef.current = navigator.geolocation.watchPosition(
            (refinedPos) => {
              applyGpsPosition(refinedPos, false);
              if ((refinedPos.coords.accuracy || 999) <= 12) {
                clearGpsWatchers();
              }
            },
            () => {
              // Keep initial fix if refinement watch errors
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
          );
          gpsWatchTimerRef.current = window.setTimeout(() => {
            if (gpsWatchIdRef.current !== null && 'geolocation' in navigator) {
              navigator.geolocation.clearWatch(gpsWatchIdRef.current);
              gpsWatchIdRef.current = null;
            }
          }, 10000);
        }
      },
      (err) => handleGpsError(err, true),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  };

  const handleFocusPlotFromSearch = (p: EnrichedMapPlot) => {
    setSelectedPlotId(p.id);
    setIsPlotSheetOpen(true);
    setSearchQuery('');
    const map = leafletMapRef.current;
    if (map && p.latLngRing.length >= 3) {
      const bounds = L.latLngBounds(p.latLngRing);
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 19, duration: 0.5 });
      }
    }
  };

  const handleApplyNashqadFromFab = useCallback(
    (nextState: LandSubdivisionState, _summary: NashqadWorkflowSummary) => {
      if (onUpdateSubdivisionState) {
        onUpdateSubdivisionState(nextState);
      }
      setCartoStyle('nashqad');
      setQuickPlotFilter('all');
      setHiddenNashqadLegendKeys({});
      setHiddenExtraLayerIds({});
      setActiveZoomLayer('all_visible');
      setLayersVisible({
        plots: true,
        blocks: true,
        roads: true,
        cityRoad: true,
        specialAreas: true,
        extraLayers: true,
        boundary: true,
      });
    },
    [onUpdateSubdivisionState]
  );

  const toggleLayer = (key: keyof typeof layersVisible) => {
    setLayersVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetActiveDrawingShapes = useCallback(() => {
    isDrawingLassoRef.current = false;
    lassoLatLngsRef.current = [];
    setLassoScreenPts([]);

    polyLatLngsRef.current = [];
    polyPointerDownPtRef.current = null;
    setPolyScreenPts([]);
    setPolyCursorPt(null);

    isDrawingRadiusRef.current = false;
    radiusCenterLatLngRef.current = null;
    setRadiusPreview(null);
  }, []);

  const handleClearSelection = useCallback(() => {
    resetActiveDrawingShapes();
    setSelectedPlotIds(new Set());
    setSelectedBlockIds(new Set());
    setSelectedFeaturesAreaSqM(0);
    setSelectedPlotId(null);
    setIsPlotSheetOpen(false);
  }, [resetActiveDrawingShapes]);

  // Keep in-progress polygon vertices aligned if user clicks +/- zoom while drawing
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    const syncPolyVertices = () => {
      if (polyLatLngsRef.current.length === 0) return;
      const nextPts: [number, number][] = polyLatLngsRef.current.map(([lat, lng]) => {
        const pt = map.latLngToContainerPoint([lat, lng]);
        return [pt.x, pt.y];
      });
      setPolyScreenPts(nextPts);
    };
    map.on('zoom move', syncPolyVertices);
    return () => {
      map.off('zoom move', syncPolyVertices);
    };
  }, []);

  const applySpatialSelectionResult = useCallback(
    (res: MapSpatialSelectionResult, additive: boolean, toolLabel: string) => {
      if (selectionTarget === 'blocks') {
        setLayersVisible((prev) => (prev.blocks ? prev : { ...prev, blocks: true }));
      } else {
        setLayersVisible((prev) => (prev.plots ? prev : { ...prev, plots: true }));
      }

      if (additive) {
        setSelectedPlotIds((prev) => {
          const next = new Set(prev);
          res.selectedPlotIds.forEach((id) => next.add(id));
          return next;
        });
        setSelectedBlockIds((prev) => {
          const next = new Set(prev);
          res.selectedBlockIds.forEach((id) => next.add(id));
          return next;
        });
        setSelectedFeaturesAreaSqM((prev) => +(prev + res.totalAreaSqM).toFixed(1));
      } else {
        setSelectedPlotIds(new Set(res.selectedPlotIds));
        setSelectedBlockIds(new Set(res.selectedBlockIds));
        setSelectedFeaturesAreaSqM(res.totalAreaSqM);
      }

      const targetWord = selectionTarget === 'blocks' ? 'blocks' : 'plots';
      if (res.selectedFeaturesCount > 0) {
        onNotify(
          `Map Selection (${toolLabel})`,
          `${res.selectedFeaturesCount} ${targetWord} ayaa la doortay (${Math.round(
            res.totalAreaSqM
          ).toLocaleString()} m²).`
        );
      } else {
        onNotify(
          `Waxba Laguma Qaban (${toolLabel})`,
          `Aagga aad sawirtay kuma jiraan wax ${targetWord} ah.`
        );
      }
    },
    [onNotify, selectionTarget]
  );

  const finishPolygonSelection = useCallback(
    (additive = false) => {
      const ptsLatLng = polyLatLngsRef.current;
      polyLatLngsRef.current = [];
      polyPointerDownPtRef.current = null;
      setPolyScreenPts([]);
      setPolyCursorPt(null);

      if (ptsLatLng.length < 3 || !subdivisionResult) return;
      const ringUtm: Point2D[] = ptsLatLng.map(([lat, lng]) =>
        subdivisionResult.fwd([lng, lat])
      );
      const res = selectMapFeaturesByPolygonUtm(
        subdivisionResult,
        ringUtm,
        selectionTarget
      );
      applySpatialSelectionResult(res, additive, 'Polygon');
    },
    [applySpatialSelectionResult, selectionTarget, subdivisionResult]
  );

  // Keyboard shortcuts while drawing on map: Escape cancels active shape, Enter finishes polygon
  useEffect(() => {
    if (
      activeMapTool !== 'map_select_polygon' &&
      activeMapTool !== 'map_select_freehand' &&
      activeMapTool !== 'map_select_radius'
    ) {
      return;
    }
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        resetActiveDrawingShapes();
        setActiveMapTool('inspect');
      } else if (
        ev.key === 'Enter' &&
        activeMapTool === 'map_select_polygon' &&
        polyLatLngsRef.current.length >= 3
      ) {
        ev.preventDefault();
        finishPolygonSelection(ev.shiftKey);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeMapTool, finishPolygonSelection, resetActiveDrawingShapes]);

  const computeUtmCircleScreenRing = useCallback(
    (centerLatLng: [number, number], radiusM: number): [number, number][] => {
      const map = leafletMapRef.current;
      if (!map || !subdivisionResult || radiusM <= 0) return [];
      const centerUtm = subdivisionResult.fwd([centerLatLng[1], centerLatLng[0]]);
      const steps = 64;
      const pts: [number, number][] = [];
      for (let i = 0; i < steps; i++) {
        const theta = (2 * Math.PI * i) / steps;
        const ux = centerUtm[0] + radiusM * Math.cos(theta);
        const uy = centerUtm[1] + radiusM * Math.sin(theta);
        const [lon, lat] = subdivisionResult.inv([ux, uy]);
        const cp = map.latLngToContainerPoint([lat, lon]);
        pts.push([cp.x, cp.y]);
      }
      return pts;
    },
    [subdivisionResult]
  );

  // Map Selection Tools (Polygon, Freehand, Radius) & Road Anchor Pin Overlay Handlers
  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const map = leafletMapRef.current;
    const wrap = mapWrapperRef.current;
    if (!map || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const ll = map.containerPointToLatLng([px, py]);

    if (activeMapTool === 'pick_road_anchor') {
      const anchorLonLat: Point2D = [ll.lng, ll.lat];
      setActiveMapTool('inspect');
      void runAutomaticTierGenerator(anchorLonLat);
      return;
    }

    if (activeMapTool === 'map_select_polygon') {
      polyPointerDownPtRef.current = [px, py];
      return;
    }

    if (activeMapTool === 'map_select_freehand') {
      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawingLassoRef.current = true;
      lassoLatLngsRef.current = [[ll.lat, ll.lng]];
      setLassoScreenPts([[px, py]]);
      return;
    }

    if (activeMapTool === 'map_select_radius') {
      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawingRadiusRef.current = true;
      radiusCenterLatLngRef.current = [ll.lat, ll.lng];
      setRadiusPreview({
        centerPx: [px, py],
        cursorPx: [px, py],
        ringScreenPts: [],
        radiusM: 0,
      });
    }
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const map = leafletMapRef.current;
    const wrap = mapWrapperRef.current;
    if (!map || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (activeMapTool === 'map_select_polygon') {
      if (polyLatLngsRef.current.length > 0) {
        setPolyCursorPt([px, py]);
      }
      return;
    }

    if (isDrawingLassoRef.current && activeMapTool === 'map_select_freehand') {
      setLassoScreenPts((prev) => {
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          if (Math.hypot(px - last[0], py - last[1]) < 4) return prev;
        }
        const ll = map.containerPointToLatLng([px, py]);
        lassoLatLngsRef.current.push([ll.lat, ll.lng]);
        return [...prev, [px, py]];
      });
      return;
    }

    if (
      isDrawingRadiusRef.current &&
      activeMapTool === 'map_select_radius' &&
      radiusCenterLatLngRef.current &&
      subdivisionResult
    ) {
      const centerLatLng = radiusCenterLatLngRef.current;
      const curLl = map.containerPointToLatLng([px, py]);
      const cUtm = subdivisionResult.fwd([centerLatLng[1], centerLatLng[0]]);
      const eUtm = subdivisionResult.fwd([curLl.lng, curLl.lat]);
      const radiusM = Math.hypot(eUtm[0] - cUtm[0], eUtm[1] - cUtm[1]);
      const cPx = map.latLngToContainerPoint(centerLatLng);
      const ringScreenPts = computeUtmCircleScreenRing(centerLatLng, radiusM);
      setRadiusPreview({
        centerPx: [cPx.x, cPx.y],
        cursorPx: [px, py],
        ringScreenPts,
        radiusM,
      });
    }
  };

  const handleOverlayPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const map = leafletMapRef.current;
    const wrap = mapWrapperRef.current;
    if (!map || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (activeMapTool === 'map_select_polygon') {
      const downPt = polyPointerDownPtRef.current;
      polyPointerDownPtRef.current = null;
      if (!downPt || Math.hypot(px - downPt[0], py - downPt[1]) > 10) return;

      // Check if clicking near the first vertex to close & execute polygon selection
      if (polyScreenPts.length >= 3) {
        const first = polyScreenPts[0];
        if (Math.hypot(px - first[0], py - first[1]) <= 18) {
          finishPolygonSelection(e.shiftKey);
          return;
        }
      }

      const ll = map.containerPointToLatLng([px, py]);
      polyLatLngsRef.current = [...polyLatLngsRef.current, [ll.lat, ll.lng]];
      setPolyScreenPts((prev) => [...prev, [px, py]]);
      setPolyCursorPt([px, py]);
      return;
    }

    if (isDrawingLassoRef.current && activeMapTool === 'map_select_freehand') {
      isDrawingLassoRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer already released
      }

      const ptsLatLng = lassoLatLngsRef.current;
      lassoLatLngsRef.current = [];
      setLassoScreenPts([]);

      if (ptsLatLng.length < 3 || !subdivisionResult) return;

      const ringUtm: Point2D[] = ptsLatLng.map(([lat, lng]) =>
        subdivisionResult.fwd([lng, lat])
      );
      const res = selectMapFeaturesByFreehandUtm(
        subdivisionResult,
        ringUtm,
        selectionTarget
      );
      applySpatialSelectionResult(res, e.shiftKey, 'Freehand');
      return;
    }

    if (isDrawingRadiusRef.current && activeMapTool === 'map_select_radius') {
      isDrawingRadiusRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer already released
      }

      const centerLatLng = radiusCenterLatLngRef.current;
      const prevPreview = radiusPreview;
      radiusCenterLatLngRef.current = null;
      setRadiusPreview(null);

      if (!centerLatLng || !subdivisionResult) return;

      const dragPx = prevPreview
        ? Math.hypot(
            px - prevPreview.centerPx[0],
            py - prevPreview.centerPx[1]
          )
        : 0;
      const fallbackR = Math.max(1, parseFloat(defaultRadiusM) || 50);
      const effectiveRadiusM =
        dragPx >= 6 && prevPreview && prevPreview.radiusM > 0.5
          ? prevPreview.radiusM
          : fallbackR;

      const centerUtm = subdivisionResult.fwd([centerLatLng[1], centerLatLng[0]]);
      const res = selectMapFeaturesByRadiusUtm(
        subdivisionResult,
        centerUtm,
        effectiveRadiusM,
        selectionTarget
      );
      applySpatialSelectionResult(
        res,
        e.shiftKey,
        `Radius ${Math.round(effectiveRadiusM)}m`
      );
    }
  };

  const handleOverlayDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeMapTool === 'map_select_polygon' && polyLatLngsRef.current.length >= 3) {
      e.preventDefault();
      e.stopPropagation();
      finishPolygonSelection(e.shiftKey);
    }
  };

  const isPaperMode = basemapMode === 'paper_pdf';

  // Compute active legend items & hidden map for the unified Legends tab
  const activeLegendConfig = useMemo(() => {
    if (cartoStyle === 'nashqad') {
      return {
        title: 'Plots Dhammaystiran & Half',
        items: nashqadLegendItems,
        hiddenMap: hiddenNashqadLegendKeys,
        setHiddenMap: setHiddenNashqadLegendKeys,
      };
    }
    if (cartoStyle === 'layout11') {
      return {
        title: 'Sumadaha PDF (Khariidadda)',
        items: liveL11LegendRows.map((r) => ({
          key: r.key,
          label: r.label,
          color: r.fill,
          count: r.count,
          hatch: r.hatch,
        })),
        hiddenMap: hiddenPdfLegendKeys,
        setHiddenMap: setHiddenPdfLegendKeys,
      };
    }
    if (cartoStyle === 'heerarka') {
      return {
        title: 'Heerarka Dhulka (1–3)',
        items: tierLegendItems,
        hiddenMap: hiddenTierLegendKeys,
        setHiddenMap: setHiddenTierLegendKeys,
      };
    }
    return {
      title: 'Dhaxlayaasha & Qaybinta',
      items: heirLegendItems,
      hiddenMap: hiddenHeirKeys,
      setHiddenMap: setHiddenHeirKeys,
    };
  }, [
    cartoStyle,
    nashqadLegendItems,
    liveL11LegendRows,
    tierLegendItems,
    heirLegendItems,
    hiddenNashqadLegendKeys,
    hiddenPdfLegendKeys,
    hiddenTierLegendKeys,
    hiddenHeirKeys,
  ]);

  const autoSummary = subdivisionState.autoTierSummary;

  return (
    <div className="relative flex flex-col gap-2 text-[#F8FAFC]">
      {/* 1. SINGLE UNIFIED TOP BAR (Search + Quick Filter + Map Color Mode + Single PDF & Habaynta Actions — ZERO UPLOAD INPUTS) */}
      <div className="relative z-20 flex flex-wrap items-center gap-2">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[190px]">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Raadi plot, block (R01-C04), Heer 1–3..."
            className="w-full min-h-[42px] rounded-xl bg-[#0F1B2D] border border-[#243449] focus:border-[#22C55E] pl-9 pr-8 py-1.5 text-xs sm:text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/70 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Nadiifi raadinta"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[32px] min-w-[32px] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Quick Live Search Results Dropdown */}
          {searchQuery.trim().length > 0 &&
            (visiblePlots.length > 0 || matchingCases.length > 0) && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] rounded-xl bg-[#0B1220] border border-[#243449] shadow-2xl overflow-hidden max-h-64 overflow-y-auto z-40 divide-y divide-[#243449]/70">
                {matchingCases.map((sc) => (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      onSelectSavedCase(sc);
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-[#0F1B2D] flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#F8FAFC] truncate">
                        {sc.caseName}
                      </div>
                      <div className="text-[11px] text-[#94A3B8] tabular-nums">
                        {sc.referenceNumber} · {sc.heirCount} dhaxale
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-[#22C55E] shrink-0">Kiis</span>
                  </button>
                ))}

                {visiblePlots.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleFocusPlotFromSearch(p)}
                    className="w-full px-4 py-2.5 text-left hover:bg-[#0F1B2D] flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#F8FAFC] truncate">
                        {p.id}{' '}
                        <span className="text-[#94A3B8] font-normal">
                          · Block {p.blockDisplayName} · Heer {p.blockHeer}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#94A3B8] tabular-nums truncate">
                        {p.areaSqM} m² · {p.statusText}
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-[#22C55E] shrink-0">
                      {p.isPartialQayb ? 'Qayb' : 'Buuxa'}
                    </span>
                  </button>
                ))}
              </div>
            )}
        </div>

        {/* Inline Plot Filter Select */}
        {currentHasMap && (
          <select
            value={quickPlotFilter}
            onChange={(e) => setQuickPlotFilter(e.target.value as MapQuickPlotFilter)}
            aria-label="Sifee Plots-ka"
            className="min-h-[42px] rounded-xl bg-[#0F1B2D] border border-[#243449] focus:border-[#22C55E] px-2.5 text-xs font-semibold text-[#F8FAFC] focus:outline-none cursor-pointer tabular-nums"
          >
            <option value="all">Dhammaan ({enrichedPlots.length})</option>
            <option value="buuxa">
              Plots dhammaystiran ({enrichedPlots.filter((p) => p.isFullBuuxa).length})
            </option>
            <option value="partial_qayb">
              Half plots ({enrichedPlots.filter((p) => p.isPartialQayb).length})
            </option>
            <option value="doox">
              Doox / Jeexjeex ({enrichedPlots.filter((p) => p.isDoox).length})
            </option>
            <option value="assigned">La Siiyey Dhaxal</option>
          </select>
        )}

        {/* Map Color Style Switcher (Nashqad | Heerarka | Dhaxalka | PDF) */}
        {currentHasMap && (
          <div className="inline-flex items-center p-1 rounded-xl bg-[#0F1B2D] border border-[#243449] text-xs font-bold">
            <button
              type="button"
              onClick={() => setCartoStyle('nashqad')}
              className={`min-h-[32px] px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                cartoStyle === 'nashqad'
                  ? 'bg-[#22C55E] text-[#05130B]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              Nashqad
            </button>
            <button
              type="button"
              onClick={() => setCartoStyle('heerarka')}
              className={`min-h-[32px] px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                cartoStyle === 'heerarka'
                  ? 'bg-[#22C55E] text-[#05130B]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              Heerarka (1–3)
            </button>
            <button
              type="button"
              onClick={() => setCartoStyle('inheritance')}
              className={`min-h-[32px] px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                cartoStyle === 'inheritance'
                  ? 'bg-[#22C55E] text-[#05130B]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              Dhaxalka
            </button>
            <button
              type="button"
              onClick={() => setCartoStyle('layout11')}
              className={`min-h-[32px] px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                cartoStyle === 'layout11'
                  ? 'bg-[#22C55E] text-[#05130B]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              Khariidad PDF
            </button>
          </div>
        )}

        {/* Single Printable PDF & Report Button */}
        {currentHasMap && subdivisionResult && onOpenCartographicPdfModal && (
          <button
            type="button"
            onClick={() =>
              onOpenCartographicPdfModal(
                cartoStyle === 'inheritance'
                  ? 'inheritance_map'
                  : cartoStyle === 'heerarka'
                  ? 'heerarka_report'
                  : 'layout11'
              )
            }
            className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#22C55E] px-3 text-xs font-bold text-[#F8FAFC] transition-colors shrink-0 cursor-pointer"
            title="Daabac Khariidadda Dhaxalka PDF, Automatic_Layout11 ama Warbixinta Heerarka"
          >
            <Printer className="w-4 h-4 text-[#22C55E]" />
            <span className="hidden sm:inline">PDF &amp; Warbixin</span>
          </button>
        )}

        {/* Mobile Subdivision Designer Shortcut (hidden on lg where workspace tab bar already shows Naqshadeeyaha) */}
        <button
          type="button"
          onClick={onOpenAdvancedCadStudio}
          className="lg:hidden min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#22C55E]/70 px-3 text-xs font-bold text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="Naqshadeeyaha"
        >
          <Wrench className="w-4 h-4 text-[#22C55E]" />
          <span className="hidden sm:inline">Naqshadeeyaha</span>
        </button>
      </div>

      {((currentHasMap &&
        (subdivisionState.nashqadSummary ||
          cartoReport ||
          totalSelectedFeaturesCount > 0 ||
          activeMapTool !== 'inspect')) ||
        userGpsInfo !== null) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#94A3B8] tabular-nums">
          {subdivisionState.nashqadSummary ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                Blocks:{' '}
                <strong className="text-[#38BDF8]">
                  {subdivisionState.nashqadSummary.blocksCount.toLocaleString()}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Dhammaystiran:{' '}
                <strong className="text-[#10B981]">
                  {subdivisionState.nashqadSummary.fullPlotsCount.toLocaleString()}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Half:{' '}
                <strong className="text-[#F59E0B]">
                  {subdivisionState.nashqadSummary.halfPlotsCount.toLocaleString()}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Wadarta:{' '}
                <strong className="text-[#F8FAFC]">
                  {Math.round(subdivisionState.nashqadSummary.totalPlotsAreaSqM).toLocaleString()} m²
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setIsNashqadReportOpen(true)}
                className="ml-1 inline-flex items-center gap-1 rounded-lg bg-[#0F1B2D] hover:bg-[#16263D] border border-[#243449] hover:border-[#22C55E] px-2 py-0.5 text-[11px] font-bold text-[#22C55E] transition-colors cursor-pointer"
              >
                <FileText className="w-3 h-3 shrink-0" />
                <span>Warbixin</span>
              </button>
            </div>
          ) : cartoReport ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Plots:{' '}
                <strong className="text-[#F8FAFC]">
                  {subdivisionResult?.plots.length ?? cartoReport.totalPlots}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Blocks: <strong className="text-[#F8FAFC]">{cartoReport.totalBlocks}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Bedka:{' '}
                <strong className="text-[#F8FAFC]">
                  {cartoReport.boundaryAreaDisplayHa.toFixed(2)} ha
                </strong>
              </span>
              {!subdivisionResult?.isPrebuiltGeometry &&
                (subdivisionResult?.htmlHalvesCounted?.length ?? 0) > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      Half:{' '}
                      <strong className="text-teal-300">
                        {subdivisionResult?.htmlHalvesCounted?.length}
                      </strong>
                    </span>
                  </>
                )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2.5 ml-auto">
            {userGpsInfo && (
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/15 border border-sky-400/50 px-2.5 py-0.5 text-sky-200 font-semibold max-w-full">
                <LocateFixed className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate max-w-[240px] sm:max-w-[360px]">
                  <strong className="text-[#F8FAFC]">{userGpsInfo.placeLabel}</strong>
                  {' · '}
                  {userGpsInfo.lat.toFixed(5)}°, {userGpsInfo.lng.toFixed(5)}° (±
                  {userGpsInfo.accuracyM}m)
                  {userGpsInfo.farmRelationLabel
                    ? ` · ${userGpsInfo.farmRelationLabel}`
                    : ''}
                </span>
                <button
                  type="button"
                  onClick={handleClearUserGps}
                  aria-label="Xir calaamadda GPS"
                  title="Qari calaamadda GPS"
                  className="ml-0.5 rounded hover:bg-sky-400/20 p-0.5 text-sky-300 hover:text-white cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {totalSelectedFeaturesCount > 0 && openRightPanel !== 'selection' && (
              <div className="inline-flex items-center gap-2 rounded-lg bg-amber-400/15 border border-amber-400/50 px-2.5 py-0.5 text-amber-300 font-bold">
                <span>
                  Features la doortay:{' '}
                  <strong className="text-[#FACC15]">{totalSelectedFeaturesCount}</strong>
                  {selectedPlotIds.size > 0 && selectedBlockIds.size === 0
                    ? ' plots'
                    : selectedBlockIds.size > 0 && selectedPlotIds.size === 0
                    ? ' blocks'
                    : ` (${selectedPlotIds.size}p, ${selectedBlockIds.size}b)`}
                </span>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="inline-flex items-center gap-1 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 px-1.5 py-0.5 text-[10.5px] font-extrabold text-rose-200 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Selection</span>
                </button>
              </div>
            )}

            {activeMapTool !== 'inspect' && (
              <div className="flex flex-wrap items-center gap-2 text-[#22C55E] font-semibold">
                <span>
                  {activeMapTool === 'map_select_polygon'
                    ? `Polygon (${selectionTarget === 'blocks' ? 'Blocks' : 'Plots'}): Taabo geesaha aagga (${polyScreenPts.length} gees)`
                    : activeMapTool === 'map_select_freehand'
                    ? `Freehand (${selectionTarget === 'blocks' ? 'Blocks' : 'Plots'}): Gacanta ku wareeji aagga`
                    : activeMapTool === 'map_select_radius'
                    ? `Radius (${selectionTarget === 'blocks' ? 'Blocks' : 'Plots'}): Jiid aag wareegsan ama taabo (${defaultRadiusM}m)`
                    : activeMapTool === 'select_plot'
                    ? `Xulo Plot (${TIER_METADATA[targetManualTier].code}): Taabo plot kasta`
                    : activeMapTool === 'select_block'
                    ? `Xulo Block (${TIER_METADATA[targetManualTier].code}): Taabo block kasta`
                    : 'Calaamadee Waddada: Taabo barta ay waddadu ka marayso khariidadda'}
                </span>
                {activeMapTool === 'map_select_polygon' && polyScreenPts.length >= 3 && (
                  <button
                    type="button"
                    onClick={() => finishPolygonSelection(false)}
                    className="rounded-md bg-[#FACC15] text-[#05130B] px-2 py-0.5 text-[10.5px] font-extrabold hover:bg-amber-300 cursor-pointer"
                  >
                    Dhammaystir ({polyScreenPts.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    resetActiveDrawingShapes();
                    setActiveMapTool('inspect');
                  }}
                  className="underline text-[#F8FAFC] hover:text-[#22C55E] cursor-pointer"
                >
                  Jooji
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. INTERACTIVE FULL-BLEED MAP CANVAS (NO DROPZONE — "+" FAB IS THE SOLE UPLOAD ENTRY POINT) */}
      <div
        ref={mapWrapperRef}
        className={`relative w-full h-[calc(100dvh-230px)] min-h-[460px] lg:h-[calc(100dvh-195px)] rounded-2xl overflow-hidden shadow-2xl transition-colors ${
          isPaperMode
            ? 'border-2 border-[#111827] bg-white'
            : 'border border-[#243449] bg-[#07101E]'
        }`}
      >
        {/* Leaflet Container */}
        <div
          ref={mapContainerRef}
          className={`${
            isPaperMode ? 'paper-pdf-leaflet-map' : 'gis-leaflet-map'
          } w-full h-full z-0`}
        />

        {/* DEDICATED TRANSPARENT POINTER CANVAS FOR MAP SELECTION TOOLS (POLYGON, FREEHAND, RADIUS) & ROAD ANCHOR */}
        {(activeMapTool === 'map_select_polygon' ||
          activeMapTool === 'map_select_freehand' ||
          activeMapTool === 'map_select_radius' ||
          activeMapTool === 'pick_road_anchor') && (
          <div
            onPointerDown={handleOverlayPointerDown}
            onPointerMove={handleOverlayPointerMove}
            onPointerUp={handleOverlayPointerUp}
            onPointerCancel={handleOverlayPointerUp}
            onDoubleClick={handleOverlayDoubleClick}
            className="absolute inset-0 z-10 cursor-crosshair touch-none select-none"
          >
            <svg className="w-full h-full pointer-events-none">
              {/* 1. Freehand Selection Preview */}
              {activeMapTool === 'map_select_freehand' && lassoScreenPts.length >= 2 && (
                <polygon
                  points={lassoScreenPts.map((pt) => `${pt[0]},${pt[1]}`).join(' ')}
                  fill="#FACC15"
                  fillOpacity={0.25}
                  stroke="#FACC15"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                />
              )}

              {/* 2. Polygon Selection Preview (Vertices + Rubber-band Closing Preview) */}
              {activeMapTool === 'map_select_polygon' && polyScreenPts.length >= 1 && (
                <g>
                  <polygon
                    points={(polyCursorPt
                      ? [...polyScreenPts, polyCursorPt]
                      : polyScreenPts
                    )
                      .map((pt) => `${pt[0]},${pt[1]}`)
                      .join(' ')}
                    fill="#FACC15"
                    fillOpacity={0.22}
                    stroke="#FACC15"
                    strokeWidth={2.4}
                    strokeDasharray="6 4"
                  />
                  {polyScreenPts.map((pt, idx) => (
                    <circle
                      key={idx}
                      cx={pt[0]}
                      cy={pt[1]}
                      r={idx === 0 && polyScreenPts.length >= 3 ? 6 : 4}
                      fill={idx === 0 && polyScreenPts.length >= 3 ? '#22C55E' : '#FACC15'}
                      stroke="#0B1220"
                      strokeWidth={1.8}
                    />
                  ))}
                </g>
              )}

              {/* 3. Radius Selection Preview (True UTM Ground Circle + Radius Line) */}
              {activeMapTool === 'map_select_radius' && radiusPreview && (
                <g>
                  {radiusPreview.ringScreenPts.length >= 3 && (
                    <polygon
                      points={radiusPreview.ringScreenPts
                        .map((pt) => `${pt[0]},${pt[1]}`)
                        .join(' ')}
                      fill="#FACC15"
                      fillOpacity={0.22}
                      stroke="#FACC15"
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                    />
                  )}
                  <line
                    x1={radiusPreview.centerPx[0]}
                    y1={radiusPreview.centerPx[1]}
                    x2={radiusPreview.cursorPx[0]}
                    y2={radiusPreview.cursorPx[1]}
                    stroke="#FACC15"
                    strokeWidth={2}
                  />
                  <circle
                    cx={radiusPreview.centerPx[0]}
                    cy={radiusPreview.centerPx[1]}
                    r={4.5}
                    fill="#FACC15"
                    stroke="#0B1220"
                    strokeWidth={1.8}
                  />
                </g>
              )}
            </svg>

            {/* Live Metric Radius Badge */}
            {activeMapTool === 'map_select_radius' &&
              radiusPreview &&
              radiusPreview.radiusM > 0.5 && (
                <div
                  style={{
                    left: `${Math.min(
                      Math.max(radiusPreview.cursorPx[0] + 12, 12),
                      (mapWrapperRef.current?.clientWidth || 320) - 110
                    )}px`,
                    top: `${Math.max(radiusPreview.cursorPx[1] - 32, 12)}px`,
                  }}
                  className="absolute pointer-events-none rounded-lg bg-[#0B1220]/95 border border-[#FACC15] px-2 py-0.5 text-[11px] font-extrabold text-[#FACC15] shadow-lg"
                >
                  {Math.round(radiusPreview.radiusM).toLocaleString()} m
                </div>
              )}
          </div>
        )}

        {/* OFFLINE CACHED TILE NOTICE (only when offline & tiles fail) */}
        {!isOnline &&
          basemapMode !== 'offline_vector' &&
          basemapMode !== 'paper_pdf' &&
          tileOfflineFallbackNotice && (
            <div className="absolute top-3 left-3 z-20 max-w-[240px] rounded-xl bg-[#0B1220]/92 border border-amber-500/40 px-3 py-2 text-[11px] text-amber-200 shadow-lg flex items-center justify-between gap-2">
              <span>Khad ma jiro: Khariidadda Offline waa diyaar</span>
              <button
                type="button"
                onClick={() => setBasemapMode('offline_vector')}
                className="font-bold text-[#22C55E] underline shrink-0 cursor-pointer"
              >
                Fur
              </button>
            </div>
          )}

        {/* RIGHT-SIDE FLOATING MAP NAVIGATION (+, −, Fit Farm, GPS) + INDIVIDUAL SELECTION, LAKABYADA, HEERARKA & SUMADAHA BELOW */}
        <div className="absolute right-3 top-3 z-30 flex flex-col items-end gap-1.5">
          {/* Zoom In (+) */}
          <button
            type="button"
            onClick={() => leafletMapRef.current?.zoomIn()}
            aria-label="Soo dhowee (+)"
            title="Soo dhowee (+)"
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer ${
              isPaperMode
                ? 'bg-white/95 border-slate-300 text-slate-900 hover:bg-slate-100'
                : 'bg-[#0B1220]/90 hover:bg-[#0F1B2D] border-[#243449] text-[#F8FAFC]'
            }`}
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Zoom Out (−) */}
          <button
            type="button"
            onClick={() => leafletMapRef.current?.zoomOut()}
            aria-label="Fogee (−)"
            title="Fogee (−)"
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer ${
              isPaperMode
                ? 'bg-white/95 border-slate-300 text-slate-900 hover:bg-slate-100'
                : 'bg-[#0B1220]/90 hover:bg-[#0F1B2D] border-[#243449] text-[#F8FAFC]'
            }`}
          >
            <Minus className="w-4 h-4" />
          </button>

          {/* Zoom Active Layer (Dedicated GIS Extent Button — separate from GPS!) */}
          {(currentHasMap || userGpsInfo !== null) && (
            <button
              type="button"
              onClick={handleZoomToActiveLayer}
              aria-label={`Zoom Active Layer (${activeLayerDisplayLabel})`}
              title={`Zoom Active Layer: ${activeLayerDisplayLabel}`}
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer ${
                isPaperMode
                  ? 'bg-white/95 border-slate-300 text-emerald-700 hover:bg-slate-100'
                  : 'bg-[#0B1220]/90 hover:bg-[#0F1B2D] border-[#243449] text-[#22C55E] hover:border-[#22C55E]'
              }`}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}

          {/* GPS Current Location (True Crosshair Icon — finds & tells exact user location) */}
          <button
            type="button"
            onClick={handleLocateMeGps}
            aria-label="Goobtaada saxda ah ee GPS"
            title="Goobtaada saxda ah ee GPS (Current Location)"
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer ${
              isLocatingGps || userGpsInfo
                ? 'bg-sky-500 border-sky-400 text-[#04111D]'
                : isPaperMode
                ? 'bg-white/95 border-slate-300 text-sky-600 hover:bg-slate-100'
                : 'bg-[#0B1220]/90 hover:bg-[#0F1B2D] border-[#243449] text-sky-400 hover:border-sky-400'
            }`}
          >
            {isLocatingGps ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LocateFixed className="w-4 h-4" />
            )}
          </button>

          {/* Divider separating Zoom/Nav buttons and Individual GIS Tools */}
          <div
            className={`w-9 h-px my-0.5 ${
              isPaperMode ? 'bg-slate-300' : 'bg-[#243449]'
            }`}
          />

          {/* 0. SELECTION (Map Selection Tools: Polygon, Freehand, Radius + Clear Selection) */}
          {currentHasMap && (
            <button
              type="button"
              onClick={() =>
                setOpenRightPanel((prev) =>
                  prev === 'selection' ? null : 'selection'
                )
              }
              aria-expanded={openRightPanel === 'selection'}
              title="Map Selection Tools (Polygon, Freehand, Radius)"
              className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border shadow-md inline-flex items-center gap-1.5 text-[11px] font-extrabold active:scale-95 transition-all cursor-pointer ${
                openRightPanel === 'selection' ||
                activeMapTool === 'map_select_polygon' ||
                activeMapTool === 'map_select_freehand' ||
                activeMapTool === 'map_select_radius'
                  ? 'bg-[#FACC15] border-[#FACC15] text-[#05130B]'
                  : totalSelectedFeaturesCount > 0
                  ? 'bg-[#0B1220]/95 border-[#FACC15] text-[#FACC15]'
                  : isPaperMode
                  ? 'bg-white/95 border-slate-300 text-slate-900 hover:border-amber-500'
                  : 'bg-[#0B1220]/92 hover:bg-[#0F1B2D] border-[#243449] text-[#F8FAFC] hover:border-[#FACC15]'
              }`}
            >
              <MousePointerClick className="w-3.5 h-3.5 shrink-0" />
              <span>Selection</span>
              {totalSelectedFeaturesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-md bg-[#05130B]/85 text-[#FACC15] text-[10px] font-black">
                  {totalSelectedFeaturesCount}
                </span>
              )}
            </button>
          )}

          {/* 1. LAKABYADA (Individual Button Below Selection) */}
          <button
            type="button"
            onClick={() =>
              setOpenRightPanel((prev) => (prev === 'layers' ? null : 'layers'))
            }
            aria-expanded={openRightPanel === 'layers'}
            title="Lakabyada Khariidadda"
            className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border shadow-md inline-flex items-center gap-1.5 text-[11px] font-extrabold active:scale-95 transition-all cursor-pointer ${
              openRightPanel === 'layers'
                ? 'bg-[#22C55E] border-[#22C55E] text-[#05130B]'
                : isPaperMode
                ? 'bg-white/95 border-slate-300 text-slate-900 hover:border-emerald-600'
                : 'bg-[#0B1220]/92 hover:bg-[#0F1B2D] border-[#243449] text-[#F8FAFC] hover:border-[#22C55E]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>Lakabyada</span>
          </button>

          {/* 2. HEERARKA (Individual Button Below Lakabyada) */}
          <button
            type="button"
            onClick={() =>
              setOpenRightPanel((prev) => (prev === 'tiers' ? null : 'tiers'))
            }
            aria-expanded={openRightPanel === 'tiers'}
            title="Heerarka Dhulka (DEM & Gacanta)"
            className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border shadow-md inline-flex items-center gap-1.5 text-[11px] font-extrabold active:scale-95 transition-all cursor-pointer ${
              openRightPanel === 'tiers'
                ? 'bg-[#22C55E] border-[#22C55E] text-[#05130B]'
                : isPaperMode
                ? 'bg-white/95 border-slate-300 text-slate-900 hover:border-emerald-600'
                : 'bg-[#0B1220]/92 hover:bg-[#0F1B2D] border-[#243449] text-[#F8FAFC] hover:border-[#22C55E]'
            }`}
          >
            <Mountain className="w-3.5 h-3.5 shrink-0" />
            <span>Heerarka</span>
          </button>

          {/* 3. SUMADAHA (Individual Button Below Heerarka) */}
          <button
            type="button"
            onClick={() =>
              setOpenRightPanel((prev) => (prev === 'legends' ? null : 'legends'))
            }
            aria-expanded={openRightPanel === 'legends'}
            title="Sumadaha Khariidadda (Legends)"
            className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border shadow-md inline-flex items-center gap-1.5 text-[11px] font-extrabold active:scale-95 transition-all cursor-pointer ${
              openRightPanel === 'legends'
                ? 'bg-[#22C55E] border-[#22C55E] text-[#05130B]'
                : isPaperMode
                ? 'bg-white/95 border-slate-300 text-slate-900 hover:border-emerald-600'
                : 'bg-[#0B1220]/92 hover:bg-[#0F1B2D] border-[#243449] text-[#F8FAFC] hover:border-[#22C55E]'
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>Sumadaha</span>
          </button>

          {/* DEDICATED FLOATING PANEL FOR THE SELECTED INDIVIDUAL RIGHT-RAIL BUTTON */}
          {openRightPanel !== null && (
            <div
              className={`absolute right-[calc(100%+10px)] top-0 w-[288px] sm:w-[324px] max-h-[calc(100dvh-235px)] overflow-y-auto rounded-2xl border shadow-2xl p-3.5 space-y-3 ${
                isPaperMode
                  ? 'bg-white/98 border-slate-300 text-slate-900'
                  : 'bg-[#0B1220]/96 backdrop-blur-md border-[#243449] text-[#F8FAFC]'
              }`}
            >
              {/* Panel Header + Close Button */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-current/10">
                <div className="inline-flex items-center gap-2 text-xs font-extrabold">
                  {openRightPanel === 'selection' && (
                    <>
                      <MousePointerClick className="w-3.5 h-3.5 text-[#FACC15]" />
                      <span>Map Selection Tools</span>
                    </>
                  )}
                  {openRightPanel === 'layers' && (
                    <>
                      <Layers className="w-3.5 h-3.5 text-[#22C55E]" />
                      <span>Lakabyada Khariidadda</span>
                    </>
                  )}
                  {openRightPanel === 'tiers' && (
                    <>
                      <Mountain className="w-3.5 h-3.5 text-[#22C55E]" />
                      <span>Heerarka Dhulka</span>
                    </>
                  )}
                  {openRightPanel === 'legends' && (
                    <>
                      <Users className="w-3.5 h-3.5 text-[#22C55E]" />
                      <span>Sumadaha (Legends)</span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setOpenRightPanel(null)}
                  aria-label="Xir daaqadda"
                  className="w-7 h-7 rounded-lg flex items-center justify-center opacity-75 hover:opacity-100 hover:bg-current/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* ==================== PANEL 0: MAP SELECTION TOOLS ==================== */}
              {openRightPanel === 'selection' && (
                <div className="space-y-3 text-xs">
                  {/* Target Layer Selector: Plots vs Blocks */}
                  <div className="space-y-1.5">
                    <span className="block text-[10.5px] font-bold opacity-75">
                      Nooca la xulayo:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectionTarget('plots')}
                        className={`min-h-[34px] rounded-xl border px-2.5 py-1 text-[11px] font-extrabold transition-colors cursor-pointer ${
                          selectionTarget === 'plots'
                            ? 'bg-[#FACC15] border-[#FACC15] text-[#05130B]'
                            : isPaperMode
                            ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                            : 'bg-[#0F1B2D] border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        Plots
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectionTarget('blocks')}
                        className={`min-h-[34px] rounded-xl border px-2.5 py-1 text-[11px] font-extrabold transition-colors cursor-pointer ${
                          selectionTarget === 'blocks'
                            ? 'bg-[#FACC15] border-[#FACC15] text-[#05130B]'
                            : isPaperMode
                            ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                            : 'bg-[#0F1B2D] border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        Blocks
                      </button>
                    </div>
                  </div>

                  {/* 3 Selection Tools: Polygon, Freehand, Radius */}
                  <div className="space-y-1.5">
                    {/* 1. Polygon */}
                    <button
                      type="button"
                      onClick={() => {
                        resetActiveDrawingShapes();
                        setActiveMapTool((prev) =>
                          prev === 'map_select_polygon'
                            ? 'inspect'
                            : 'map_select_polygon'
                        );
                        setOpenRightPanel(null);
                      }}
                      className={`w-full rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                        activeMapTool === 'map_select_polygon'
                          ? 'bg-[#FACC15]/20 border-[#FACC15]'
                          : isPaperMode
                          ? 'bg-white border-slate-300 hover:border-amber-500'
                          : 'bg-[#0F1B2D] border-[#243449] hover:border-[#FACC15]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-extrabold text-[11.5px]">
                        <span className="inline-flex items-center gap-2">
                          <Pentagon className="w-4 h-4 text-[#FACC15] shrink-0" />
                          <span>Polygon</span>
                        </span>
                        {activeMapTool === 'map_select_polygon' && (
                          <span className="text-[10px] font-black text-[#FACC15]">
                            Shaqaynaya
                          </span>
                        )}
                      </div>
                      <p className="text-[10.5px] opacity-80 mt-1 leading-snug">
                        Dooro plots ama blocks adigoo sawiraya aag geeso leh.
                      </p>
                    </button>

                    {/* 2. Freehand */}
                    <button
                      type="button"
                      onClick={() => {
                        resetActiveDrawingShapes();
                        setActiveMapTool((prev) =>
                          prev === 'map_select_freehand'
                            ? 'inspect'
                            : 'map_select_freehand'
                        );
                        setOpenRightPanel(null);
                      }}
                      className={`w-full rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                        activeMapTool === 'map_select_freehand'
                          ? 'bg-[#FACC15]/20 border-[#FACC15]'
                          : isPaperMode
                          ? 'bg-white border-slate-300 hover:border-amber-500'
                          : 'bg-[#0F1B2D] border-[#243449] hover:border-[#FACC15]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-extrabold text-[11.5px]">
                        <span className="inline-flex items-center gap-2">
                          <Lasso className="w-4 h-4 text-[#FACC15] shrink-0" />
                          <span>Freehand</span>
                        </span>
                        {activeMapTool === 'map_select_freehand' && (
                          <span className="text-[10px] font-black text-[#FACC15]">
                            Shaqaynaya
                          </span>
                        )}
                      </div>
                      <p className="text-[10.5px] opacity-80 mt-1 leading-snug">
                        Dooro plots ama blocks adigoo gacanta ku wareejinaya.
                      </p>
                    </button>

                    {/* 3. Radius */}
                    <div
                      className={`rounded-xl border p-2.5 transition-colors ${
                        activeMapTool === 'map_select_radius'
                          ? 'bg-[#FACC15]/20 border-[#FACC15]'
                          : isPaperMode
                          ? 'bg-white border-slate-300'
                          : 'bg-[#0F1B2D] border-[#243449]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          resetActiveDrawingShapes();
                          setActiveMapTool((prev) =>
                            prev === 'map_select_radius'
                              ? 'inspect'
                              : 'map_select_radius'
                          );
                          setOpenRightPanel(null);
                        }}
                        className="w-full text-left cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2 font-extrabold text-[11.5px]">
                          <span className="inline-flex items-center gap-2">
                            <CircleDot className="w-4 h-4 text-[#FACC15] shrink-0" />
                            <span>Radius</span>
                          </span>
                          {activeMapTool === 'map_select_radius' && (
                            <span className="text-[10px] font-black text-[#FACC15]">
                              Shaqaynaya
                            </span>
                          )}
                        </div>
                        <p className="text-[10.5px] opacity-80 mt-1 leading-snug">
                          Dooro plots ama blocks ku jira aag wareegsan.
                        </p>
                      </button>

                      <div className="mt-2 pt-2 border-t border-current/10 flex items-center justify-between gap-2">
                        <span className="text-[10px] opacity-75">
                          Cabbirka Radius (jiid ama mitir):
                        </span>
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min={5}
                            max={5000}
                            step={5}
                            value={defaultRadiusM}
                            onChange={(ev) => setDefaultRadiusM(ev.target.value)}
                            aria-label="Radius mitir"
                            className={`w-16 rounded-lg border px-2 py-0.5 text-[11px] font-bold text-right ${
                              isPaperMode
                                ? 'bg-slate-50 border-slate-300 text-slate-900'
                                : 'bg-[#0B1220] border-[#243449] text-[#F8FAFC]'
                            }`}
                          />
                          <span className="text-[10.5px] font-bold opacity-80">m</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Selected Features Count Summary + Clear Selection */}
                  <div
                    className={`rounded-xl border p-2.5 space-y-2 ${
                      isPaperMode
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-[#08101D] border-[#243449]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold opacity-85">
                        Features la doortay:
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-[#FACC15]/20 border border-[#FACC15]/50 text-[#FACC15] font-black text-xs">
                        {totalSelectedFeaturesCount}
                      </span>
                    </div>

                    {totalSelectedFeaturesCount > 0 && (
                      <div className="flex items-center justify-between text-[10.5px] opacity-80">
                        <span>
                          {selectedPlotIds.size > 0
                            ? `Plots: ${selectedPlotIds.size}`
                            : ''}
                          {selectedPlotIds.size > 0 && selectedBlockIds.size > 0
                            ? ' • '
                            : ''}
                          {selectedBlockIds.size > 0
                            ? `Blocks: ${selectedBlockIds.size}`
                            : ''}
                        </span>
                        {selectedFeaturesAreaSqM > 0 && (
                          <span className="font-bold">
                            {Math.round(selectedFeaturesAreaSqM).toLocaleString()} m²
                          </span>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={
                        totalSelectedFeaturesCount === 0 &&
                        activeMapTool !== 'map_select_polygon' &&
                        activeMapTool !== 'map_select_freehand' &&
                        activeMapTool !== 'map_select_radius'
                      }
                      onClick={() => {
                        handleClearSelection();
                        if (
                          activeMapTool === 'map_select_polygon' ||
                          activeMapTool === 'map_select_freehand' ||
                          activeMapTool === 'map_select_radius'
                        ) {
                          setActiveMapTool('inspect');
                        }
                      }}
                      className={`w-full min-h-[36px] rounded-xl border px-3 py-1.5 font-extrabold text-[11px] inline-flex items-center justify-center gap-1.5 transition-colors ${
                        totalSelectedFeaturesCount > 0 ||
                        activeMapTool === 'map_select_polygon' ||
                        activeMapTool === 'map_select_freehand' ||
                        activeMapTool === 'map_select_radius'
                          ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400/50 text-rose-300 cursor-pointer'
                          : 'opacity-40 border-current/15 cursor-not-allowed'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Clear Selection</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ==================== PANEL 1: LAKABYADA ==================== */}
              {openRightPanel === 'layers' && (
                <div className="space-y-3 text-xs">
                  {/* Basemap Switcher integrated inside Lakabyada (keeps top of map canvas clean) */}
                  <div className="pb-2.5 border-b border-current/10 space-y-1.5">
                    <span className="block text-[10.5px] font-bold opacity-75">
                      Nooca Khariidadda:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setBasemapMode('satellite')}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                          basemapMode === 'satellite'
                            ? 'bg-[#22C55E] text-[#05130B]'
                            : isPaperMode
                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            : 'bg-[#0F1B2D] border border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        <Satellite className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Dayax-gacmeed</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBasemapMode('osm')}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                          basemapMode === 'osm'
                            ? 'bg-[#22C55E] text-[#05130B]'
                            : isPaperMode
                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            : 'bg-[#0F1B2D] border border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Waddooyin</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBasemapMode('paper_pdf')}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                          basemapMode === 'paper_pdf'
                            ? 'bg-[#111827] text-white'
                            : isPaperMode
                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            : 'bg-[#0F1B2D] border border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Warqad</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBasemapMode('offline_vector')}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                          basemapMode === 'offline_vector'
                            ? 'bg-[#22C55E] text-[#05130B]'
                            : isPaperMode
                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            : 'bg-[#0F1B2D] border border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        <WifiOff className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Bilaa Khad</span>
                      </button>
                    </div>
                  </div>

                  {/* Active Layer Selector for "Zoom Active Layer" */}
                  {currentHasMap && subdivisionResult && (
                    <div className="pb-2.5 border-b border-current/10 space-y-1">
                      <label className="block text-[10.5px] font-bold opacity-75">
                        Lakabka Firfircoon (Zoom Active Layer):
                      </label>
                      <select
                        value={activeZoomLayer}
                        onChange={(e) => {
                          const nextKey = e.target.value;
                          setActiveZoomLayer(nextKey);
                          zoomToTargetLayerKey(nextKey);
                        }}
                        aria-label="Dooro lakabka firfircoon ee lagu dhowaanayo"
                        className={`w-full min-h-[34px] rounded-lg border px-2 text-[11px] font-bold focus:outline-none cursor-pointer ${
                          isPaperMode
                            ? 'bg-slate-50 border-slate-300 text-slate-900'
                            : 'bg-[#0F1B2D] border-[#243449] text-[#F8FAFC] focus:border-[#22C55E]'
                        }`}
                      >
                        <option value="all_visible">Dhammaan Lakabyada Muuqda</option>
                        {totalSelectedFeaturesCount > 0 && (
                          <option value="selected_features">
                            Features-ka La Doortay ({totalSelectedFeaturesCount})
                          </option>
                        )}
                        <option value="boundary">Xuduudka Beerta</option>
                        <option value="plots">Plots ({visiblePlots.length})</option>
                        <option value="blocks">Blocks</option>
                        <option value="roads">Dooxyada &amp; Jidadka Gudaha</option>
                        {(subdivisionState.autoTierSummary?.detectedRoadLineLonLat ||
                          subdivisionState.cityRoadAnchorLonLat) && (
                          <option value="cityRoad">Waddada Magaalada</option>
                        )}
                        {(subdivisionResult.specialAreas?.length || 0) > 0 && (
                          <option value="specialAreas">Aagagga Gaarka ah</option>
                        )}
                        {(subdivisionState.extraOverlayLayers || []).map((ex) => (
                          <option key={ex.id} value={`extra:${ex.id}`}>
                            {ex.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="w-full flex items-center justify-between gap-2 font-semibold rounded-md px-1 py-0.5 cursor-pointer select-none">
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={layersVisible.boundary}
                          onChange={() => toggleLayer('boundary')}
                          className="w-3.5 h-3.5 rounded accent-[#16A34A] cursor-pointer shrink-0"
                        />
                        <span className="w-3.5 h-2.5 border-2 border-[#E31A1C] bg-transparent shrink-0" />
                        <span>Xuduudka Beerta</span>
                      </span>
                    </label>

                    <label className="w-full flex items-center justify-between gap-2 font-semibold rounded-md px-1 py-0.5 cursor-pointer select-none">
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={layersVisible.roads}
                          onChange={() => toggleLayer('roads')}
                          className="w-3.5 h-3.5 rounded accent-[#16A34A] cursor-pointer shrink-0"
                        />
                        <span className="w-3.5 h-0.5 bg-[#0284C7] shrink-0" />
                        <span>Dooxyada &amp; Jidadka Gudaha</span>
                      </span>
                    </label>

                    <label className="w-full flex items-center justify-between gap-2 font-semibold rounded-md px-1 py-0.5 cursor-pointer select-none">
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={layersVisible.cityRoad}
                          onChange={() => toggleLayer('cityRoad')}
                          className="w-3.5 h-3.5 rounded accent-[#16A34A] cursor-pointer shrink-0"
                        />
                        <span className="w-3.5 h-0.5 bg-[#F59E0B] shrink-0" />
                        <span>Waddada Magaalada</span>
                      </span>
                    </label>

                    <label className="w-full flex items-center justify-between gap-2 font-semibold rounded-md px-1 py-0.5 cursor-pointer select-none">
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={layersVisible.plots}
                          onChange={() => toggleLayer('plots')}
                          className="w-3.5 h-3.5 rounded accent-[#16A34A] cursor-pointer shrink-0"
                        />
                        <span className="w-3.5 h-2.5 border border-slate-700 bg-white shrink-0" />
                        <span>Plots</span>
                      </span>
                      <span className="text-[10.5px] opacity-75 tabular-nums">
                        {visiblePlots.length}
                      </span>
                    </label>

                    <label className="w-full flex items-center justify-between gap-2 font-semibold rounded-md px-1 py-0.5 cursor-pointer select-none">
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={layersVisible.blocks}
                          onChange={() => toggleLayer('blocks')}
                          className="w-3.5 h-3.5 rounded accent-[#16A34A] cursor-pointer shrink-0"
                        />
                        <span className="w-3.5 h-2.5 rounded-xs bg-[#1D6F42] shrink-0" />
                        <span>Blocks</span>
                      </span>
                      <span className="text-[10.5px] opacity-75 tabular-nums">
                        {currentHasMap && subdivisionResult
                          ? subdivisionResult.blocks.filter(
                              (b) => !(b.preservedProps && b.preservedProps.syntheticBlock === true)
                            ).length
                          : 0}
                      </span>
                    </label>

                    {(subdivisionResult?.specialAreas?.length || 0) > 0 && (
                      <label className="w-full flex items-center justify-between gap-2 font-semibold rounded-md px-1 py-0.5 cursor-pointer select-none">
                        <span className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={layersVisible.specialAreas}
                            onChange={() => toggleLayer('specialAreas')}
                            className="w-3.5 h-3.5 rounded accent-[#16A34A] cursor-pointer shrink-0"
                          />
                          <span className="w-3.5 h-2.5 rounded-xs bg-[#7C3AED] shrink-0" />
                          <span>Aagagga Gaarka ah</span>
                        </span>
                        <span className="text-[10.5px] opacity-75 tabular-nums">
                          {subdivisionResult?.specialAreas?.length || 0}
                        </span>
                      </label>
                    )}

                    {/* Extra GeoJSON Overlay Layers from 20+ simultaneous files */}
                    {subdivisionState.extraOverlayLayers &&
                      subdivisionState.extraOverlayLayers.length > 0 && (
                        <div className="pt-1.5 mt-1 border-t border-current/10 space-y-1">
                          <label className="w-full flex items-center justify-between gap-2 font-bold rounded-md px-1 py-0.5 cursor-pointer select-none">
                            <span className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={layersVisible.extraLayers}
                                onChange={() => toggleLayer('extraLayers')}
                                className="w-3.5 h-3.5 rounded accent-[#16A34A] cursor-pointer shrink-0"
                              />
                              <span>Lakabyada Dheeraadka ah</span>
                            </span>
                            <span className="text-[10.5px] opacity-75 tabular-nums">
                              {subdivisionState.extraOverlayLayers.length}
                            </span>
                          </label>
                          {layersVisible.extraLayers && (
                            <div className="max-h-32 overflow-y-auto pl-3 space-y-1">
                              {subdivisionState.extraOverlayLayers.map((ex) => {
                                const checked = !hiddenExtraLayerIds[ex.id];
                                const totalFeats =
                                  ex.polygonsLonLat.length +
                                  ex.linesLonLat.length +
                                  ex.pointsLonLat.length;
                                return (
                                  <label
                                    key={ex.id}
                                    className="w-full flex items-center justify-between gap-2 text-[11px] font-medium rounded px-1 py-0.5 cursor-pointer select-none hover:bg-current/5"
                                  >
                                    <span className="inline-flex items-center gap-1.5 min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          setHiddenExtraLayerIds((prev) => ({
                                            ...prev,
                                            [ex.id]: !prev[ex.id],
                                          }))
                                        }
                                        className="w-3 h-3 rounded accent-[#16A34A] cursor-pointer shrink-0"
                                      />
                                      <span
                                        style={{ backgroundColor: ex.colorHex }}
                                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                                      />
                                      <span className="truncate">{ex.name}</span>
                                    </span>
                                    <span className="text-[10px] opacity-70 tabular-nums shrink-0">
                                      {totalFeats}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                    {basemapMode === 'satellite' && (
                      <label className="w-full flex items-center justify-between gap-2 font-semibold rounded-md px-1 py-0.5 cursor-pointer select-none">
                        <span className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={showHybridLabels}
                            onChange={() => setShowHybridLabels((p) => !p)}
                            className="w-3.5 h-3.5 rounded accent-[#16A34A] cursor-pointer shrink-0"
                          />
                          <span>Magacyada Magaalooyinka (Satellite)</span>
                        </span>
                      </label>
                    )}
                  </div>

                  {/* Quick Jump to Region / City */}
                  <div className="pt-2 border-t border-current/10">
                    <label className="block text-[10.5px] font-semibold opacity-75 mb-1">
                      U Bood Gobol / Deegaan:
                    </label>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        const loc = SOMALI_MAP_LOCATIONS[idx];
                        if (loc) {
                          if (basemapMode === 'paper_pdf') setBasemapMode('satellite');
                          leafletMapRef.current?.flyTo([loc.lat, loc.lng], loc.zoom, {
                            duration: 0.7,
                          });
                        }
                      }}
                      className={`w-full min-h-[36px] rounded-lg border px-2 text-[11px] font-medium ${
                        isPaperMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-[#0F1B2D] border-[#243449] text-[#F8FAFC]'
                      }`}
                    >
                      <option value="" disabled>
                        Dooro magaalo ama gobol...
                      </option>
                      {SOMALI_MAP_LOCATIONS.map((loc, idx) => (
                        <option key={loc.label} value={idx}>
                          {loc.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* ==================== PANEL 2: HEERARKA (1. TOOS DEM | 2. GACANTA) ==================== */}
              {openRightPanel === 'tiers' && (
                <div className="space-y-3 text-xs">
                  <div
                    className={`grid grid-cols-2 gap-1 p-1 rounded-xl text-[11px] font-bold ${
                      isPaperMode ? 'bg-slate-100' : 'bg-[#0F1B2D]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setTierMode('automatic');
                        if (activeMapTool !== 'pick_road_anchor') {
                          setActiveMapTool('inspect');
                        }
                      }}
                      className={`min-h-[34px] px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        tierMode === 'automatic'
                          ? 'bg-[#22C55E] text-[#05130B] font-extrabold'
                          : 'opacity-75 hover:opacity-100'
                      }`}
                    >
                      1. Toos (DEM)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTierMode('manual');
                        setCartoStyle('heerarka');
                        if (
                          activeMapTool === 'inspect' ||
                          activeMapTool === 'pick_road_anchor'
                        ) {
                          setActiveMapTool('select_plot');
                        }
                      }}
                      className={`min-h-[34px] px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        tierMode === 'manual'
                          ? 'bg-[#22C55E] text-[#05130B] font-extrabold'
                          : 'opacity-75 hover:opacity-100'
                      }`}
                    >
                      2. Gacanta
                    </button>
                  </div>

                  {tierMode === 'automatic' && (
                    <div className="space-y-2.5">
                      <p
                        className={`text-[11px] leading-relaxed ${
                          isPaperMode ? 'text-slate-600' : 'text-[#94A3B8]'
                        }`}
                      >
                        Wuxuu ku xidhan yahay <strong>DEM joogga dhulka</strong>,{' '}
                        <strong>waddada magaalada ugu dhow</strong>, iyo{' '}
                        <strong>simnaanta vs. jeexjeexa</strong>: dhulka isku siman wuxuu
                        noqonayaa <strong>Heerka 1</strong>, dhulka jeexjeexa ahna{' '}
                        <strong>Heerka 2 &amp; 3</strong>.
                      </p>

                      <button
                        type="button"
                        disabled={!currentHasMap || !subdivisionResult || isComputingAutoTiers}
                        onClick={() => void runAutomaticTierGenerator()}
                        className="w-full min-h-[42px] rounded-xl bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-45 text-[#05130B] px-3 py-2 text-xs font-extrabold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        {isComputingAutoTiers ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            <span>Waa la xisaabinayaa DEM &amp; Waddada...</span>
                          </>
                        ) : (
                          <>
                            <Mountain className="w-4 h-4 shrink-0" />
                            <span>Dhali Heerarka (DEM + Waddo)</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={!currentHasMap}
                          onClick={() =>
                            setActiveMapTool((prev) =>
                              prev === 'pick_road_anchor' ? 'inspect' : 'pick_road_anchor'
                            )
                          }
                          className={`flex-1 min-h-[36px] rounded-xl border px-2.5 py-1.5 text-[11px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 ${
                            activeMapTool === 'pick_road_anchor'
                              ? 'bg-amber-500 text-slate-950 border-amber-500'
                              : isPaperMode
                              ? 'bg-white border-slate-300 text-slate-800 hover:border-amber-500'
                              : 'bg-[#0F1B2D] border-[#243449] text-[#F8FAFC] hover:border-amber-400'
                          }`}
                        >
                          <Route className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {activeMapTool === 'pick_road_anchor'
                              ? 'Taabo Waddada Khariidadda...'
                              : 'Calaamadee Waddada Magaalada'}
                          </span>
                        </button>

                        {subdivisionState.cityRoadAnchorLonLat && onUpdateSubdivisionState && (
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateSubdivisionState((prev) => ({
                                ...prev,
                                cityRoadAnchorLonLat: null,
                              }));
                            }}
                            title="Tirtir barta waddada ee gacanta lagu calaamadeeyey"
                            className="min-h-[36px] px-2.5 rounded-xl border border-rose-500/40 text-[11px] font-bold text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                          >
                            Xir
                          </button>
                        )}
                      </div>

                      {autoSummary && (
                        <div
                          className={`rounded-xl border p-2.5 space-y-1.5 text-[11px] tabular-nums ${
                            isPaperMode
                              ? 'bg-slate-50 border-slate-200 text-slate-800'
                              : 'bg-[#0F1B2D]/80 border-[#243449] text-[#CBD5E1]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="opacity-75">Joogga DEM:</span>
                            <strong className="font-bold">
                              {autoSummary.minElevationM !== null &&
                              autoSummary.maxElevationM !== null
                                ? `${autoSummary.minElevationM}m – ${autoSummary.maxElevationM}m`
                                : autoSummary.demSourceLabel}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="opacity-75">Simnaanta (Slope):</span>
                            <strong className="font-bold">
                              {autoSummary.avgSlopePercent}% · {autoSummary.gulliedPlotsCount} jeexjeex
                            </strong>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="opacity-75">Waddada Magaalada:</span>
                            <strong className="font-bold truncate max-w-[165px]">
                              {autoSummary.nearestRoadDistanceM !== null
                                ? `${autoSummary.nearestRoadDistanceM} m`
                                : 'Auto'}
                            </strong>
                          </div>
                          <div className="pt-1 border-t border-current/10 flex items-center justify-between text-[10.5px]">
                            <span>
                              H1 Siman: <strong>{autoSummary.tier1PlotsCount}</strong>
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              H2: <strong>{autoSummary.tier2PlotsCount}</strong>
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              H3 Jeexjeex: <strong>{autoSummary.tier3PlotsCount}</strong>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {tierMode === 'manual' && (
                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <div className="text-[10.5px] font-semibold opacity-75">
                          1. Dooro Heerka aad ku qorayso:
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              {
                                key: 'tier_1_prime' as AssetQualityTier,
                                title: 'Heer 1',
                                sub: 'Fiican',
                              },
                              {
                                key: 'tier_2_standard' as AssetQualityTier,
                                title: 'Heer 2',
                                sub: 'Dhexe',
                              },
                              {
                                key: 'tier_3_basic' as AssetQualityTier,
                                title: 'Heer 3',
                                sub: 'Jeexjeex',
                              },
                            ] as const
                          ).map((t) => {
                            const active = targetManualTier === t.key;
                            const color = TIER_METADATA[t.key].fillHex;
                            return (
                              <button
                                key={t.key}
                                type="button"
                                onClick={() => {
                                  setTargetManualTier(t.key);
                                  setCartoStyle('heerarka');
                                }}
                                className={`rounded-xl border p-2 text-left transition-colors cursor-pointer ${
                                  active
                                    ? 'border-[#22C55E] bg-[#22C55E]/15'
                                    : isPaperMode
                                    ? 'border-slate-300 bg-white'
                                    : 'border-[#243449] bg-[#0F1B2D]'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 font-extrabold text-[11px]">
                                  <span
                                    style={{ backgroundColor: color }}
                                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                                  />
                                  <span>{t.title}</span>
                                </div>
                                <div className="text-[10px] opacity-75 mt-0.5">{t.sub}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[10.5px] font-semibold opacity-75">
                          2. Habka Xulashada Gacanta:
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMapTool('select_plot');
                              setCartoStyle('heerarka');
                            }}
                            className={`min-h-[38px] rounded-xl border px-3 py-1.5 text-left font-bold flex items-center justify-between cursor-pointer transition-colors ${
                              activeMapTool === 'select_plot'
                                ? 'bg-[#22C55E] text-[#05130B] border-[#22C55E]'
                                : isPaperMode
                                ? 'bg-white border-slate-300 hover:border-emerald-600'
                                : 'bg-[#0F1B2D] border-[#243449] hover:border-[#22C55E]'
                            }`}
                          >
                            <span className="inline-flex items-center gap-2">
                              <MousePointerClick className="w-3.5 h-3.5 shrink-0" />
                              <span>Xulo Plot</span>
                            </span>
                            <span className="text-[10px] opacity-80">Plot keliya</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveMapTool('select_block');
                              setCartoStyle('heerarka');
                            }}
                            className={`min-h-[38px] rounded-xl border px-3 py-1.5 text-left font-bold flex items-center justify-between cursor-pointer transition-colors ${
                              activeMapTool === 'select_block'
                                ? 'bg-[#22C55E] text-[#05130B] border-[#22C55E]'
                                : isPaperMode
                                ? 'bg-white border-slate-300 hover:border-emerald-600'
                                : 'bg-[#0F1B2D] border-[#243449] hover:border-[#22C55E]'
                            }`}
                          >
                            <span className="inline-flex items-center gap-2">
                              <Layers className="w-3.5 h-3.5 shrink-0" />
                              <span>Xulo Block</span>
                            </span>
                            <span className="text-[10px] opacity-80">Block dhan</span>
                          </button>

                          {totalSelectedFeaturesCount > 0 && onUpdateSubdivisionState && (
                            <button
                              type="button"
                              onClick={() => {
                                setHasUserEditedTiersInSession(true);
                                setCartoStyle('heerarka');
                                onUpdateSubdivisionState((prev) =>
                                  applyManualTierToSelectedFeatures(
                                    prev,
                                    subdivisionResult,
                                    selectedPlotIds,
                                    selectedBlockIds,
                                    targetManualTier
                                  )
                                );
                                onNotify(
                                  'Heerka Xulashada Waa La Kaydiyey',
                                  `${totalSelectedFeaturesCount} feature oo la doortay ayaa loo calaamadeeyey ${TIER_METADATA[targetManualTier].shortSomali}.`
                                );
                              }}
                              className="min-h-[38px] rounded-xl border border-[#FACC15] bg-[#FACC15]/15 hover:bg-[#FACC15]/25 px-3 py-1.5 text-left font-extrabold text-[#FACC15] flex items-center justify-between cursor-pointer transition-colors"
                            >
                              <span className="inline-flex items-center gap-2">
                                <Check className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  Ku dabaq Xulashada ({totalSelectedFeaturesCount})
                                </span>
                              </span>
                              <span className="text-[10px]">
                                {TIER_METADATA[targetManualTier].code}
                              </span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setOpenRightPanel('selection')}
                            className={`min-h-[38px] rounded-xl border px-3 py-1.5 text-left font-bold flex items-center justify-between cursor-pointer transition-colors ${
                              isPaperMode
                                ? 'bg-white border-slate-300 hover:border-amber-500'
                                : 'bg-[#0F1B2D] border-[#243449] hover:border-[#FACC15]'
                            }`}
                          >
                            <span className="inline-flex items-center gap-2">
                              <Pentagon className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
                              <span>Map Selection Tools</span>
                            </span>
                            <span className="text-[10px] opacity-80">
                              Polygon / Freehand / Radius
                            </span>
                          </button>
                        </div>
                      </div>

                      {activeMapTool !== 'inspect' && (
                        <button
                          type="button"
                          onClick={() => setActiveMapTool('inspect')}
                          className="w-full min-h-[34px] rounded-lg border border-current/20 text-[11px] font-semibold opacity-80 hover:opacity-100 cursor-pointer"
                        >
                          Ku noqo Kormeerka Caadiga ah
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ==================== PANEL 3: SUMADAHA (LEGENDS) ==================== */}
              {openRightPanel === 'legends' && (
                <div className="space-y-2.5 text-xs">
                  {/* Live 3-Mode Inheritance Allocation Selector when viewing Dhaxalka */}
                  {cartoStyle === 'inheritance' && onUpdateSubdivisionState && (
                    <div className="pb-2 border-b border-current/10 space-y-1.5">
                      <span className="block text-[10.5px] font-bold opacity-80">
                        Habka Qaybinta Dhaxalka:
                      </span>
                      <div className="grid grid-cols-1 gap-1">
                        {(
                          [
                            'exact_shared',
                            'whole_balanced',
                            'clean_equal_no_half_no_fraction',
                          ] as LandAllocationMode[]
                        ).map((modeKey) => {
                          const active = subdivisionState.allocationMode === modeKey;
                          const meta = LAND_ALLOCATION_MODE_METADATA[modeKey];
                          return (
                            <button
                              key={modeKey}
                              type="button"
                              onClick={() =>
                                onUpdateSubdivisionState((prev) => ({
                                  ...prev,
                                  allocationMode: modeKey,
                                  approvalStatus:
                                    prev.approvalStatus === 'approved'
                                      ? 'under_review'
                                      : prev.approvalStatus,
                                }))
                              }
                              className={`w-full text-left rounded-lg border px-2 py-1.5 text-[11px] font-bold flex items-center justify-between gap-1.5 transition-colors cursor-pointer ${
                                active
                                  ? 'bg-[#22C55E] text-[#05130B] border-[#22C55E]'
                                  : isPaperMode
                                  ? 'bg-slate-50 border-slate-300 text-slate-800 hover:border-emerald-600'
                                  : 'bg-[#0F1B2D] border-[#243449] text-[#F8FAFC] hover:border-[#22C55E]/60'
                              }`}
                            >
                              <span className="truncate">{meta.shortSomali}</span>
                              {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold truncate">{activeLegendConfig.title}</span>
                    <span className="text-[10.5px] opacity-75 tabular-nums shrink-0">
                      {
                        activeLegendConfig.items.filter(
                          (it) => !activeLegendConfig.hiddenMap[it.key]
                        ).length
                      }
                      /{activeLegendConfig.items.length}
                    </span>
                  </div>

                  {activeLegendConfig.items.length === 0 ? (
                    <p className="text-[11px] opacity-70 py-1">
                      Riix badhanka &ldquo;+&rdquo; ee hoose dhexda si aad nashqad u samayso ama u soo geliso.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2 pb-1 border-b border-current/10 text-[10.5px]">
                        <button
                          type="button"
                          onClick={() => activeLegendConfig.setHiddenMap({})}
                          className="font-bold text-[#16A34A] hover:underline cursor-pointer"
                        >
                          Dooro Dhammaan
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next: Record<string, boolean> = {};
                            activeLegendConfig.items.forEach((it) => {
                              next[it.key] = true;
                            });
                            activeLegendConfig.setHiddenMap(next);
                          }}
                          className="font-semibold opacity-75 hover:opacity-100 hover:underline cursor-pointer"
                        >
                          Ka Saar
                        </button>
                      </div>

                      <div className="max-h-[210px] overflow-y-auto pr-0.5 space-y-1">
                        {activeLegendConfig.items.map((it) => {
                          const isChecked = !activeLegendConfig.hiddenMap[it.key];
                          return (
                            <label
                              key={it.key}
                              className="w-full flex items-center justify-between gap-2 font-semibold rounded-md px-1 py-0.5 cursor-pointer select-none hover:bg-current/5"
                            >
                              <span className="inline-flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    activeLegendConfig.setHiddenMap((prev) => ({
                                      ...prev,
                                      [it.key]: !prev[it.key],
                                    }));
                                    if (!layersVisible.plots) {
                                      setLayersVisible((prev) => ({
                                        ...prev,
                                        plots: true,
                                      }));
                                    }
                                  }}
                                  className="w-3.5 h-3.5 rounded accent-[#16A34A] cursor-pointer shrink-0"
                                />
                                <span
                                  style={{
                                    backgroundColor: it.color,
                                    backgroundImage: it.hatch
                                      ? 'repeating-linear-gradient(-45deg, #111827 0px, #111827 1.1px, transparent 1.1px, transparent 4.2px)'
                                      : undefined,
                                  }}
                                  className="w-3.5 h-2.5 rounded-xs border border-slate-700/60 shrink-0"
                                />
                                <span
                                  className={`truncate ${
                                    isChecked ? '' : 'opacity-45 line-through'
                                  }`}
                                  title={it.label}
                                >
                                  {it.label}
                                </span>
                              </span>
                              <span className="text-[10.5px] opacity-75 tabular-nums shrink-0">
                                {it.count}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* BOTTOM-LEFT: NORTH ARROW + DYNAMIC METRIC SCALE BAR + COMPACT SELECTED PLOT PREVIEW */}
        <div className="absolute bottom-3 left-3 z-20 flex flex-col items-start gap-2 pointer-events-none">
          {currentHasMap && activeSelectedPlot && !isPlotSheetOpen && (
            <button
              type="button"
              onClick={() => setIsPlotSheetOpen(true)}
              className={`pointer-events-auto w-[235px] sm:w-[265px] rounded-xl border p-3 text-left shadow-xl transition-all cursor-pointer ${
                isPaperMode
                  ? 'bg-white/96 border-slate-300 text-slate-900 hover:border-emerald-600'
                  : 'bg-[#0B1220]/94 hover:bg-[#0F1B2D] border-[#243449] text-[#F8FAFC]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold truncate">{activeSelectedPlot.id}</span>
                <span className="text-[10.5px] font-bold text-emerald-500 shrink-0">
                  Heer {activeSelectedPlot.blockHeer}
                </span>
              </div>
              <div className="mt-1.5 space-y-0.5 text-[11px] opacity-85 tabular-nums">
                <div className="flex items-center justify-between gap-2">
                  <span>Block / Bedka:</span>
                  <strong>
                    {activeSelectedPlot.blockDisplayName} · {activeSelectedPlot.areaSqM} m²
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>Qaybta:</span>
                  <strong className="truncate max-w-[145px]">
                    {activeSelectedPlot.statusText}
                  </strong>
                </div>
              </div>
            </button>
          )}

          <div className="flex items-end gap-2">
            {/* Compact North Arrow */}
            <div
              className={`flex flex-col items-center justify-center rounded-md px-1.5 py-1 ${
                isPaperMode
                  ? 'bg-white/92 text-[#111827]'
                  : 'bg-[#0B1220]/88 border border-[#243449] text-[#F8FAFC]'
              }`}
            >
              <svg width="18" height="30" viewBox="0 0 28 48" aria-label="Waqooyi (North)">
                <polygon
                  points="14,1 3,33 14,26"
                  fill={isPaperMode ? '#111827' : '#F8FAFC'}
                  stroke={isPaperMode ? '#111827' : '#F8FAFC'}
                  strokeWidth="1"
                />
                <polygon
                  points="14,1 25,33 14,26"
                  fill={isPaperMode ? '#FFFFFF' : '#0B1220'}
                  stroke={isPaperMode ? '#111827' : '#F8FAFC'}
                  strokeWidth="1"
                />
                <text
                  x="14"
                  y="45"
                  textAnchor="middle"
                  fontSize="12.5"
                  fontWeight="800"
                  fill={isPaperMode ? '#111827' : '#F8FAFC'}
                >
                  N
                </text>
              </svg>
            </div>

            {/* QGIS Alternating Scale Bar */}
            <div
              className={`rounded-md px-2.5 py-1.5 text-[10.5px] font-semibold tabular-nums ${
                isPaperMode
                  ? 'bg-white/95 text-[#111827]'
                  : 'bg-[#0B1220]/88 text-[#F8FAFC] border border-[#243449]'
              }`}
            >
              <div
                className="flex items-center justify-between mb-0.5"
                style={{ width: `${scaleBarInfo.stepPx * 2}px` }}
              >
                <span>0</span>
                <span>{scaleBarInfo.useKm ? '0.1' : '50'}</span>
                <span>{scaleBarInfo.useKm ? '0.2 km' : '100 m'}</span>
              </div>
              <div className="flex items-center">
                <div
                  style={{ width: `${scaleBarInfo.stepPx}px` }}
                  className="h-1.5 bg-[#111827] border border-[#111827]"
                />
                <div
                  style={{ width: `${scaleBarInfo.stepPx}px` }}
                  className="h-1.5 bg-white border border-[#111827]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SLIDE-UP PLOT DETAILS BOTTOM SHEET */}
        {currentHasMap && activeSelectedPlot && isPlotSheetOpen && (
          <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-3xl bg-[#0B1220]/98 backdrop-blur-md border-t border-[#243449] p-5 shadow-[0_-12px_36px_rgba(0,0,0,0.65)] text-[#F8FAFC]">
            <div className="w-10 h-1.5 bg-[#243449] rounded-full mx-auto mb-3" />

            <div className="max-w-lg mx-auto">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#22C55E] shrink-0" />
                    <span>{activeSelectedPlot.id}</span>
                  </h3>
                  <span className="text-xs font-bold text-[#22C55E]">
                    {activeSelectedPlot.statusText}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPlotSheetOpen(false)}
                  aria-label="Xir faahfaahinta plot-ka"
                  className="min-h-[40px] min-w-[40px] -mr-2 -mt-1 rounded-xl flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0F1B2D] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-3.5 rounded-2xl bg-[#0F1B2D] border border-[#243449] divide-y divide-[#243449]/70 text-xs">
                <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <span className="text-[#94A3B8]">Block &amp; Heerka</span>
                  <span className="font-bold">
                    {activeSelectedPlot.blockDisplayName} · Heer {activeSelectedPlot.blockHeer}
                  </span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <span className="text-[#94A3B8]">Bedka (Area)</span>
                  <span className="tabular-nums font-bold">
                    {activeSelectedPlot.areaSqM.toLocaleString()} m²
                  </span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <span className="text-[#94A3B8]">Calaamadda / Mulkiilaha</span>
                  <span className="font-bold truncate max-w-[210px]">
                    {activeSelectedPlot.ownerDisplay}
                  </span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <span className="text-[#94A3B8]">Xaaladda Xuduudka</span>
                  <span className="tabular-nums">{activeSelectedPlot.geometryTypeLabel}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onOpenPlotInListData(activeSelectedPlot.id)}
                  className="min-h-[44px] rounded-xl bg-[#0F1B2D] hover:bg-[#16263D] border border-[#243449] text-xs font-bold transition-colors cursor-pointer"
                >
                  Faahfaahinta Plot-ka
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const scope = `plot:${activeSelectedPlot.id}`;
                    onSelectTargetScope(scope);
                    onProceedToCalculateWithSelection(scope);
                  }}
                  className="min-h-[44px] rounded-xl bg-[#22C55E] hover:bg-[#16A34A] text-[#05130B] text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Dooro Plot-kan</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ON-DEMAND NASHQAD SUMMARY MODAL (opens only when user clicks "Warbixin" — never blocks map automatically) */}
      {isNashqadReportOpen && subdivisionState.nashqadSummary && (
        <div
          className="fixed inset-0 z-[1090] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsNashqadReportOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[380px] flex justify-center">
            <NashqadSummaryCard
              summary={subdivisionState.nashqadSummary}
              subdivisionState={subdivisionState}
              onNotify={onNotify}
              onClose={() => setIsNashqadReportOpen(false)}
            />
          </div>
        </div>
      )}

      {/* SOLE DATA ENTRY POINT: BOTTOM-CENTER "+" FLOATING ACTION BUTTON & MODALS */}
      <NashqadFabAndModals
        subdivisionState={subdivisionState}
        onApplyNashqadState={handleApplyNashqadFromFab}
        onNotify={onNotify}
      />
    </div>
  );
};
