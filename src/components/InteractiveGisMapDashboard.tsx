import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  ArrowLeftRight,
  Check,
  CircleDot,
  Compass,
  FileText,
  Globe,
  Grid,
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
import {
  SampleBlockAxisAlignOptions,
  alignAllBlocksToSampleBlock,
} from '../utils/nashqadWorkflowEngine';
import { SampleBlockAxisControlCard } from './SampleBlockAxisControlCard';
import { computeUnifiedFarmMetrics } from '../utils/unifiedMetrics';
import {
  GoogleSatelliteUnderlay,
  GoogleUnderlayStatus,
} from './GoogleSatelliteUnderlay';

export type BasemapMode =
  | 'google_satellite'
  | 'satellite'
  | 'osm'
  | 'paper_pdf'
  | 'offline_vector';
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
  hasExternalOverlayOpen?: boolean;
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

function makeSafePlotBadgeEl(text: string, isPaper: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = isPaper
    ? '-translate-x-1/2 -translate-y-1/2 text-[8.5px] font-bold text-slate-900 bg-white/80 px-1 rounded pointer-events-none whitespace-nowrap tabular-nums'
    : '-translate-x-1/2 -translate-y-1/2 text-[8.5px] font-bold text-[#e8eef7] bg-[#060d18]/75 px-1 rounded pointer-events-none whitespace-nowrap tabular-nums';
  el.textContent = text;
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
  hasExternalOverlayOpen = false,
  onNotify,
}) => {
  const isOnline = useOnlineStatus();

  const googleApiKey = ((import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '').trim();

  const [basemapMode, setBasemapMode] = useState<BasemapMode>(() => {
    if (subdivisionResult?.isPrebuiltGeometry && !subdivisionState.nashqadSummary) {
      return 'paper_pdf';
    }
    return typeof navigator !== 'undefined' && !navigator.onLine
      ? 'offline_vector'
      : 'google_satellite';
  });

  const [googleUnderlayStatus, setGoogleUnderlayStatus] = useState<GoogleUnderlayStatus>(() =>
    googleApiKey ? 'loading' : 'fallback'
  );
  const [googleMapCam, setGoogleMapCam] = useState<{
    center: { lat: number; lng: number };
    zoom: number;
  }>({
    center: { lat: 9.621, lng: 44.0585 },
    zoom: 17,
  });

  const isGoogleUnderlayMounted =
    basemapMode === 'google_satellite' &&
    Boolean(googleApiKey) &&
    googleUnderlayStatus !== 'fallback';
  const isGoogleUnderlayLive =
    isGoogleUnderlayMounted && googleUnderlayStatus === 'ready';

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
  const [isLoadingTiles, setIsLoadingTiles] = useState<boolean>(false);
  const [currentZoom, setCurrentZoom] = useState<number>(17);

  const unifiedMetrics = useMemo(
    () => computeUnifiedFarmMetrics(subdivisionState, subdivisionResult, currentHasMap),
    [subdivisionState, subdivisionResult, currentHasMap]
  );

  // Individual Right-Side Controls Below Zoom Buttons: Xulo | Lakabyo | Heerar | Furaha (one active bottom-sheet / popover at a time)
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

  const activeSampleAlignment = useMemo(
    () =>
      subdivisionResult?.sampleBlockAlignment ||
      subdivisionState.prebuiltSubdivision?.sampleBlockAlignment ||
      subdivisionState.nashqadSummary?.sampleBlockAlignment ||
      null,
    [
      subdivisionResult?.sampleBlockAlignment,
      subdivisionState.prebuiltSubdivision?.sampleBlockAlignment,
      subdivisionState.nashqadSummary?.sampleBlockAlignment,
    ]
  );

  const currentMismatchSig = activeSampleAlignment
    ? `${activeSampleAlignment.sampleFileName || 'sample'}::L${activeSampleAlignment.appliedLengthM}@${activeSampleAlignment.appliedLengthBearingDeg}::W${activeSampleAlignment.appliedWidthM}@${activeSampleAlignment.appliedWidthBearingDeg}`
    : '';
  const [dismissedMismatchSig, setDismissedMismatchSig] = useState<string>('');
  const [keepAlignmentBannerPinned, setKeepAlignmentBannerPinned] = useState<boolean>(false);

  // Reset manual banner pin when sample block file changes
  useEffect(() => {
    setKeepAlignmentBannerPinned(false);
  }, [activeSampleAlignment?.sampleFileName]);

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
