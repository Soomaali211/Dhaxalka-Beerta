import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  AssetQualityTier,
  Currency,
  HeirsInput,
  InheritanceCalculationResult,
  SavedInheritanceCase,
} from '../types/inheritance';
import {
  CaseExportMetadata,
  FairLandAllocationResult,
  GeneratedPlot,
  HalfPlotValidationStatus,
  LandAllocationMode,
  LandSubdivisionState,
  PendingBulkMetadataImport,
  PlotDetailedMetadata,
  PrebuiltGeoJsonSubdivision,
  SiteQualityRating,
  SubdivisionComputationResult,
  SubdivisionParams,
  WadiStatus,
  ZonePresetMode,
} from '../types/landSubdivision';
import {
  HALF_PLOT_STATUS_METADATA,
  buildHalfPlotValidationSnapshot,
} from '../utils/halfPlotGeometryEngine';
import {
  HtmlGeoJsonSlot,
  LAND_ALLOCATION_MODE_METADATA,
  SITE_QUALITY_METADATA,
  TIER_METADATA,
  WADI_STATUS_METADATA,
  applyHtmlBoundarySelectionChange,
  applyHtmlGeoJsonSlotImport,
  applyHtmlUseSample,
  buildAutoBlockZones,
  buildRowBasedBlockTiers,
  createAuditEntry,
  downloadAllGisPackageZip,
  downloadSampleBlocksAndPlotsCSV,
  downloadSubdivisionCSV,
  downloadSubdivisionGeoJSON,
  downloadSubdivisionShapefileZip,
  formatPlotQtyCompact,
  getDistinctHeirColor,
  getEffectiveBlockExclusion,
  getEffectivePlotExclusion,
  getEffectivePlotMetadata,
  getEffectivePlotTier,
  getEffectivePlotZone,
  getZoneDisplayMeta,
  parseGeoJsonItems,
  pickBestBoundaryIndex,
  prepareBulkMetadataImportFromCSV,
  prepareBulkMetadataImportFromRecords,
} from '../utils/landSubdivisionEngine';
import { getEditableGroupKeyForShareId, updateHeirPersonName } from '../utils/heirNameUtils';
import {
  BottomTableTab,
  GisBottomRegistersSection,
} from './GisBottomRegistersSection';
import { CartographicPdfDocMode } from './FarmCartographicPdfModal';
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Download,
  FileJson,
  FileSpreadsheet,
  FolderArchive,
  Grid,
  Info,
  Layers,
  Link2,
  MapPin,
  Maximize2,
  MousePointerClick,
  Paintbrush,
  Printer,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Eye,
  EyeOff,
  GripHorizontal,
  Lasso,
  Loader2,
  Mountain,
  Tag,
  Upload,
  UserCheck,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  applyManualTierByFreehandLasso,
  buildDemSamplerForSubdivision,
  computeAutomaticDemAndRoadTiers,
  resolveNearestCityConnectingRoad,
} from '../utils/demAndRoadTierEngine';
import {
  alignAllBlocksToSampleBlock,
  buildPlotsGeoJsonClipboardText,
  copyTextSafelyToClipboard,
} from '../utils/nashqadWorkflowEngine';
import { SampleBlockAxisControlCard } from './SampleBlockAxisControlCard';

interface BlocksAndPlotsDesignerViewProps {
  subdivisionState: LandSubdivisionState;
  subdivisionResult: SubdivisionComputationResult | null;
  fairAllocation: FairLandAllocationResult | null;
  inheritanceResult: InheritanceCalculationResult;
  heirsInput: HeirsInput;
  currency: Currency;
  activeCaseMeta?: CaseExportMetadata;
  savedCasesForGeometryLink?: SavedInheritanceCase[];
  onExplicitLinkGeometryFromCase?: (sourceCase: SavedInheritanceCase) => void;
  onUploadGeoJsonFiles?: (files: File[]) => void;
  onUploadHtmlGeoJsonSlot?: (file: File, slot: HtmlGeoJsonSlot) => void;
  onSelectBoundaryIndex?: (idx: number) => void;
  onSelectSampleIndex?: (idx: number) => void;
  onOpenCartographicPdfModal?: (mode: CartographicPdfDocMode) => void;
  onBackToInteractiveMap?: () => void;
  onUpdateSubdivisionState: (updater: (prev: LandSubdivisionState) => LandSubdivisionState) => void;
  onSyncAndLinkToEstate: () => void;
  onUpdateHeirsInput: (updated: HeirsInput) => void;
  onNavigateToResults: () => void;
  onNavigateToCalculator: () => void;
  onNotify: (title: string, message: string) => void;
}

type MapColorMode = 'heirs' | 'zones' | 'tiers' | 'excluded' | 'half_plots';
type MapInteractionTool =
  | 'inspect'
  | 'mark_exclusion'
  | 'mark_tier'
  | 'mark_zone'
  | 'assign_heir';

const SPECIAL_EXCLUSION_PRESETS = [
  'Masjidka',
  'Ceelka Biyaha',
  'Dugsiga',
  'Dhul Waqf ah',
  'Waddo / Marin Guud',
  'Guri Gaar ah',
];

interface ViewBoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const BlocksAndPlotsDesignerView: React.FC<BlocksAndPlotsDesignerViewProps> = ({
  subdivisionState,
  subdivisionResult,
  fairAllocation,
  heirsInput,
  currency,
  activeCaseMeta,
  savedCasesForGeometryLink = [],
  onExplicitLinkGeometryFromCase,
  onSelectBoundaryIndex,
  onSelectSampleIndex,
  onOpenCartographicPdfModal,
  onBackToInteractiveMap,
  onUpdateSubdivisionState,
  onSyncAndLinkToEstate,
  onUpdateHeirsInput,
  onNavigateToResults,
  onNavigateToCalculator,
  onNotify,
}) => {
  const [mapColorMode, setMapColorMode] = useState<MapColorMode>('heirs');
  const [interactionTool, setInteractionTool] = useState<MapInteractionTool>('inspect');
  const [activeTierBrush, setActiveTierBrush] = useState<AssetQualityTier>('tier_1_prime');
  const [tierBrushScope, setTierBrushScope] = useState<'block' | 'plot' | 'freehand'>('block');
  const [tierEvalMode, setTierEvalMode] = useState<'automatic' | 'manual'>('automatic');
  const [isRunningAutoDem, setIsRunningAutoDem] = useState<boolean>(false);
  const [cadLassoSvgPts, setCadLassoSvgPts] = useState<[number, number][]>([]);
  const cadLassoSvgRef = useRef<[number, number][]>([]);
  const isDrawingCadLassoRef = useRef<boolean>(false);
  const [activeZoneBrush, setActiveZoneBrush] = useState<string>('Zone A');
  const [selectedHeirKeyForBrush, setSelectedHeirKeyForBrush] = useState<string>('');
  const [highlightedHeirKey, setHighlightedHeirKey] = useState<string | null>(null);

  // Exclusion marking brush state
  const [exclusionBrushScope, setExclusionBrushScope] = useState<'plot' | 'block'>('plot');
  const [exclusionBrushMode, setExclusionBrushMode] = useState<'exclude' | 'include'>('exclude');
  const [exclusionBrushSpecialName, setExclusionBrushSpecialName] = useState<string>('Masjidka');

  const [showBlockLabels, setShowBlockLabels] = useState<boolean>(true);
  const [showAllPlotLabels, setShowAllPlotLabels] = useState<boolean>(false);
  const [showHeirLabelsOnPlots, setShowHeirLabelsOnPlots] = useState<boolean>(false);
  const [showExcludedSpecialNames, setShowExcludedSpecialNames] = useState<boolean>(true);
  const [showWadiOverlay, setShowWadiOverlay] = useState<boolean>(true);
  const [showQualityDots, setShowQualityDots] = useState<boolean>(false);
  const [showOutsidePlotsOverlay, setShowOutsidePlotsOverlay] = useState<boolean>(true);

  // Mobile-first UX drawer/popover toggles
  const [showMobileControls, setShowMobileControls] = useState<boolean>(false);
  const [showMapLayerPopover, setShowMapLayerPopover] = useState<boolean>(false);
  const [isCadLegendsExpanded, setIsCadLegendsExpanded] = useState<boolean>(true);
  const [cadHiddenHeirKeys, setCadHiddenHeirKeys] = useState<Record<string, boolean>>({});
  const [cadLegendPos, setCadLegendPos] = useState<{ x: number; y: number }>({ x: 12, y: 12 });
  const cadLegendDragRef = useRef<{
    active: boolean;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  const [inspectedPlotId, setInspectedPlotId] = useState<string | null>(null);
  const [exportCrs, setExportCrs] = useState<'wgs' | 'utm'>('wgs');
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);
  const [copiedGeoJson, setCopiedGeoJson] = useState<boolean>(false);

  const [bottomTab, setBottomTab] = useState<BottomTableTab>('heirs_plots');
  const [plotSearchQuery, setPlotSearchQuery] = useState<string>('');
  const [plotTierFilter, setPlotTierFilter] = useState<AssetQualityTier | 'all'>('all');
  const [plotZoneFilter, setPlotZoneFilter] = useState<string>('all');
  const [plotDivisionFilter, setPlotDivisionFilter] = useState<'all' | 'divisible' | 'excluded'>(
    'all'
  );
  const [halfPlotStatusFilter, setHalfPlotStatusFilter] = useState<
    HalfPlotValidationStatus | 'all_clipped' | 'all'
  >('all_clipped');

  // Mapless case explicit geometry link confirmation state
  const [selectedSourceCaseId, setSelectedSourceCaseId] = useState<string>('');
  const [confirmExplicitCaseGeometryCopy, setConfirmExplicitCaseGeometryCopy] =
    useState<boolean>(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Ensure brush heir defaults to first active heir
  useEffect(() => {
    if (
      fairAllocation &&
      fairAllocation.heirAllocations.length > 0 &&
      (!selectedHeirKeyForBrush ||
        !fairAllocation.heirAllocations.some((h) => h.heirKey === selectedHeirKeyForBrush))
    ) {
      setSelectedHeirKeyForBrush(fairAllocation.heirAllocations[0].heirKey);
    }
  }, [fairAllocation, selectedHeirKeyForBrush]);

  // Legends checkbox items for CAD Studio map
  const cadLegendItems = useMemo(() => {
    if (!subdivisionResult) return [];
    const counts: Record<string, number> = {};
    let clippedOrHalfCount = 0;

    subdivisionResult.blocks.forEach((b) => {
      b.plots.forEach((q) => {
        if (!q.full) {
          const rel =
            (q.halfPlotValidation || subdivisionResult.plotValidations?.[q.id])?.boundaryRelation;
          if (rel !== 'full_outside') {
            clippedOrHalfCount++;
          }
          return;
        }
        const pExcl = getEffectivePlotExclusion(
          q,
          subdivisionState.plotMetadata,
          subdivisionState.blockMetadata
        );
        if (pExcl.isExcluded) {
          counts['__excluded__'] = (counts['__excluded__'] || 0) + 1;
          return;
        }
        const assign = fairAllocation?.plotAssignments[q.id];
        if (
          assign &&
          (assign.assignmentType === 'sole_heir' || assign.assignmentType === 'manual_override') &&
          assign.ownerHeirKey
        ) {
          counts[assign.ownerHeirKey] = (counts[assign.ownerHeirKey] || 0) + 1;
        } else if (
          assign &&
          assign.assignmentType === 'shared_fractional' &&
          assign.coOwners?.length
        ) {
          counts['__shared__'] = (counts['__shared__'] || 0) + 1;
        } else if (assign?.unassignedReason === 'withheld_jajab') {
          counts['__withheld_jajab__'] = (counts['__withheld_jajab__'] || 0) + 1;
        } else {
          counts['__unassigned__'] = (counts['__unassigned__'] || 0) + 1;
        }
      });
    });

    const items: { key: string; label: string; color: string; count: number }[] = [];
    (fairAllocation?.heirAllocations || []).forEach((h, idx) => {
      items.push({
        key: h.heirKey,
        label: h.personName || h.roleTitleSomali,
        color: h.colorHex || getDistinctHeirColor(idx),
        count: counts[h.heirKey] || 0,
      });
    });

    if ((counts['__shared__'] || 0) > 0) {
      items.push({
        key: '__shared__',
        label: 'Plots Wadaag ah',
        color: '#F59E0B',
        count: counts['__shared__'] || 0,
      });
    }

    if ((counts['__excluded__'] || 0) > 0) {
      items.push({
        key: '__excluded__',
        label: 'Laga Reebay',
        color: '#FB7185',
        count: counts['__excluded__'] || 0,
      });
    }

    if ((counts['__withheld_jajab__'] || 0) > 0) {
      items.push({
        key: '__withheld_jajab__',
        label: 'Jajabka Laga Reebay',
        color: '#64748B',
        count: counts['__withheld_jajab__'] || 0,
      });
    }

    if ((counts['__unassigned__'] || 0) > 0) {
      items.push({
        key: '__unassigned__',
        label:
          (fairAllocation?.heirAllocations.length || 0) > 0
            ? 'Aan la qaybin'
            : 'Plots Buuxa',
        color: '#475569',
        count: counts['__unassigned__'] || 0,
      });
    }

    if (clippedOrHalfCount > 0) {
      items.push({
        key: '__half_or_clipped__',
        label: 'Half-Plots Laga Reebay',
        color: '#94A3B8',
        count: clippedOrHalfCount,
      });
    }

    return items;
  }, [
    subdivisionResult,
    subdivisionState.plotMetadata,
    subdivisionState.blockMetadata,
    fairAllocation,
  ]);

  const isPlotVisibleInCadLegends = (q: GeneratedPlot): boolean => {
    if (!q.full) {
      return !cadHiddenHeirKeys['__half_or_clipped__'];
    }
    const pExcl = getEffectivePlotExclusion(
      q,
      subdivisionState.plotMetadata,
      subdivisionState.blockMetadata
    );
    if (pExcl.isExcluded) {
      return !cadHiddenHeirKeys['__excluded__'];
    }
    const assign = fairAllocation?.plotAssignments[q.id];
    if (
      assign &&
      (assign.assignmentType === 'sole_heir' || assign.assignmentType === 'manual_override') &&
      assign.ownerHeirKey
    ) {
      return !cadHiddenHeirKeys[assign.ownerHeirKey];
    }
    if (assign && assign.assignmentType === 'shared_fractional' && assign.coOwners?.length) {
      return !cadHiddenHeirKeys['__shared__'];
    }
    if (assign?.unassignedReason === 'withheld_jajab') {
      return !cadHiddenHeirKeys['__withheld_jajab__'];
    }
    return !cadHiddenHeirKeys['__unassigned__'];
  };

  // SVG Coordinate projection centered at bounding box midpoint
  const mapGeometry = useMemo(() => {
    if (!subdivisionResult) return null;
    const r = subdivisionResult;
    const ox = (r.bb[0] + r.bb[2]) / 2;
    const oy = (r.bb[1] + r.bb[3]) / 2;
    const toX = (pt: [number, number]) => +(pt[0] - ox).toFixed(2);
    const toY = (pt: [number, number]) => +(-(pt[1] - oy)).toFixed(2);
    const toPtsStr = (ring: [number, number][]) =>
      ring.map((q) => `${toX(q)},${toY(q)}`).join(' ');

    const allPts = [
      ...r.bring,
      ...(r.sample ? r.sample.ring : []),
      ...(r.sampleRect ? r.sampleRect : []),
      ...(r.specialAreas ? r.specialAreas.flatMap((sa) => sa.ringUtm) : []),
    ];
    let x0 = 1e18;
    let y0 = 1e18;
    let x1 = -1e18;
    let y1 = -1e18;
    allPts.forEach((q) => {
      const x = toX(q);
      const y = toY(q);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    });
    const padm = Math.max(x1 - x0, y1 - y0, 10) * 0.06;
    const fitBox: ViewBoxRect = {
      x: x0 - padm,
      y: y0 - padm,
      w: Math.max(20, x1 - x0 + 2 * padm),
      h: Math.max(20, y1 - y0 + 2 * padm),
    };

    const projectedWadis = (subdivisionState.wadiItems || []).map((w) => ({
      type: w.type,
      name: w.name,
      ptsUtm: w.coords.map((c) => r.fwd(c)),
    }));

    return { ox, oy, toX, toY, toPtsStr, fitBox, projectedWadis };
  }, [subdivisionResult, subdivisionState.wadiItems]);

  const [viewBox, setViewBox] = useState<ViewBoxRect | null>(null);

  useEffect(() => {
    if (mapGeometry) {
      setViewBox(mapGeometry.fitBox);
    } else {
      setViewBox(null);
    }
  }, [
    subdivisionState.boundaryFileName,
    subdivisionState.selectedBoundaryIndex,
    subdivisionState.prebuiltSubdivision?.sourceFileName,
    mapGeometry?.fitBox.x,
    mapGeometry?.fitBox.y,
    mapGeometry?.fitBox.w,
    mapGeometry?.fitBox.h,
  ]);

  const activeVb = viewBox || mapGeometry?.fitBox || { x: -200, y: -200, w: 400, h: 400 };

  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    startVb: ViewBoxRect;
    moved: boolean;
    pointers: Record<number, [number, number]>;
    prevPinchDist: number | null;
  }>({
    startX: 0,
    startY: 0,
    startVb: activeVb,
    moved: false,
    pointers: {},
    prevPinchDist: null,
  });

  const handleZoom = (factor: number, clientX?: number, clientY?: number) => {
    if (!svgRef.current || !mapGeometry) return;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = clientX ?? rect.left + rect.width / 2;
    const cy = clientY ?? rect.top + rect.height / 2;

    setViewBox((prev) => {
      const v = prev || mapGeometry.fitBox;
      const sc = Math.min(rect.width / v.w, rect.height / v.h) || 1;
      const offX = (rect.width - v.w * sc) / 2;
      const offY = (rect.height - v.h * sc) / 2;
      const svgX = v.x + (cx - rect.left - offX) / sc;
      const svgY = v.y + (cy - rect.top - offY) / sc;

      const nw = v.w / factor;
      const nh = v.h / factor;
      if (nw < 8 || nw > mapGeometry.fitBox.w * 8) return v;

      return {
        x: svgX - (svgX - v.x) / factor,
        y: svgY - (svgY - v.y) / factor,
        w: nw,
        h: nh,
      };
    });
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      handleZoom(e.deltaY < 0 ? 1.22 : 1 / 1.22, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const clientToSvgCoord = (clientX: number, clientY: number): [number, number] | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const v = activeVb;
    const sc = Math.min(rect.width / v.w, rect.height / v.h) || 1;
    const offX = (rect.width - v.w * sc) / 2;
    const offY = (rect.height - v.h * sc) / 2;
    return [
      v.x + (clientX - rect.left - offX) / sc,
      v.y + (clientY - rect.top - offY) / sc,
    ];
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    svgRef.current.setPointerCapture(e.pointerId);

    if (interactionTool === 'mark_tier' && tierBrushScope === 'freehand') {
      const pt = clientToSvgCoord(e.clientX, e.clientY);
      if (pt) {
        isDrawingCadLassoRef.current = true;
        cadLassoSvgRef.current = [pt];
        setCadLassoSvgPts([pt]);
      }
      return;
    }

    dragStateRef.current.pointers[e.pointerId] = [e.clientX, e.clientY];
    dragStateRef.current.startX = e.clientX;
    dragStateRef.current.startY = e.clientY;
    dragStateRef.current.startVb = { ...activeVb };
    dragStateRef.current.moved = false;
    dragStateRef.current.prevPinchDist = null;
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDrawingCadLassoRef.current && interactionTool === 'mark_tier' && tierBrushScope === 'freehand') {
      const pt = clientToSvgCoord(e.clientX, e.clientY);
      if (pt) {
        cadLassoSvgRef.current.push(pt);
        setCadLassoSvgPts([...cadLassoSvgRef.current]);
      }
      return;
    }

    const st = dragStateRef.current;
    if (!(e.pointerId in st.pointers) || !svgRef.current) return;
    st.pointers[e.pointerId] = [e.clientX, e.clientY];
    const keys = Object.keys(st.pointers).map(Number);

    if (keys.length === 2) {
      const a = st.pointers[keys[0]];
      const b = st.pointers[keys[1]];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (st.prevPinchDist && st.prevPinchDist > 0) {
        handleZoom(dist / st.prevPinchDist, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      }
      st.prevPinchDist = dist;
      st.moved = true;
      return;
    }

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      st.moved = true;
    }
    if (st.moved) {
      const rect = svgRef.current.getBoundingClientRect();
      const v = st.startVb;
      const sc = Math.min(rect.width / v.w, rect.height / v.h) || 1;
      setViewBox({
        x: v.x - dx / sc,
        y: v.y - dy / sc,
        w: v.w,
        h: v.h,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDrawingCadLassoRef.current) {
      isDrawingCadLassoRef.current = false;
      const ptsSvg = cadLassoSvgRef.current;
      cadLassoSvgRef.current = [];
      setCadLassoSvgPts([]);
      if (ptsSvg.length >= 3 && subdivisionResult && mapGeometry) {
        const ringUtm: [number, number][] = ptsSvg.map(([sx, sy]) => [
          sx + mapGeometry.ox,
          mapGeometry.oy - sy,
        ]);
        const check = applyManualTierByFreehandLasso(
          subdivisionState,
          subdivisionResult,
          ringUtm,
          activeTierBrush
        );
        if (check.matchedPlotsCount > 0) {
          onUpdateSubdivisionState((prev) =>
            applyManualTierByFreehandLasso(prev, subdivisionResult, ringUtm, activeTierBrush)
              .nextState
          );
          setMapColorMode('tiers');
          onNotify(
            'Freehand Xulashada Gacanta',
            `${check.matchedPlotsCount} plot ayaa loo beddelay ${TIER_METADATA[activeTierBrush].shortSomali}.`
          );
        }
      }
      return;
    }

    const st = dragStateRef.current;
    const wasMoved = st.moved;
    delete st.pointers[e.pointerId];
    st.prevPinchDist = null;

    if (!wasMoved) {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const plotId = target?.getAttribute('data-plot-id');
      const blockId = target?.getAttribute('data-block-id');
      if (plotId && blockId) {
        handlePlotMapClick(plotId, blockId);
      } else {
        setInspectedPlotId(null);
      }
    }
  };

  const setPlotExclusionState = (
    plotId: string,
    blockId: string,
    isExcluded: boolean,
    specialName?: string
  ) => {
    onUpdateSubdivisionState((prev) => {
      const existing: PlotDetailedMetadata = prev.plotMetadata[plotId] || {
        plotId,
        blockId,
        wadiStatus: 'unverified' as WadiStatus,
        siteQuality: 'unverified' as SiteQualityRating,
      };
      const resolvedName =
        specialName !== undefined
          ? specialName
          : existing.excludedSpecialName || existing.parcelNumberOrName || '';
      const nextManual = { ...prev.manualPlotHeirOverrides };
      if (isExcluded) {
        delete nextManual[plotId];
      }
      return {
        ...prev,
        approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
        manualPlotHeirOverrides: nextManual,
        plotMetadata: {
          ...prev.plotMetadata,
          [plotId]: {
            ...existing,
            isExcludedFromDivision: isExcluded,
            excludedSpecialName: resolvedName,
            ...(resolvedName && !existing.parcelNumberOrName
              ? { parcelNumberOrName: resolvedName }
              : {}),
            updatedAt: new Date().toISOString(),
          },
        },
        auditHistory: [
          createAuditEntry(
            'exclusion_update',
            isExcluded
              ? `Plot ${plotId} waa laga reebay qaybinta dhaxalka${
                  resolvedName ? ` ("${resolvedName}")` : ''
                }.`
              : `Plot ${plotId} dib ayaa loogu daray dhulka la qaybinayo.`
          ),
          ...prev.auditHistory.slice(0, 49),
        ],
      };
    });
  };

  const setBlockExclusionState = (
    blockId: string,
    isExcluded: boolean,
    specialName?: string
  ) => {
    onUpdateSubdivisionState((prev) => {
      const existingBlk = prev.blockMetadata[blockId] || { blockId };
      const resolvedName =
        specialName !== undefined
          ? specialName
          : existingBlk.excludedSpecialName || existingBlk.blockName || '';

      const nextPlotMeta = { ...prev.plotMetadata };
      const nextManual = { ...prev.manualPlotHeirOverrides };
      const blkObj = subdivisionResult?.blocks.find((b) => b.id === blockId);
      blkObj?.plots.forEach((pl) => {
        if (isExcluded) {
          delete nextManual[pl.id];
        }
        if (nextPlotMeta[pl.id] && nextPlotMeta[pl.id].isExcludedFromDivision !== undefined) {
          const copy = { ...nextPlotMeta[pl.id] };
          delete copy.isExcludedFromDivision;
          nextPlotMeta[pl.id] = copy;
        }
      });

      return {
        ...prev,
        approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
        manualPlotHeirOverrides: nextManual,
        plotMetadata: nextPlotMeta,
        blockMetadata: {
          ...prev.blockMetadata,
          [blockId]: {
            ...existingBlk,
            isExcludedFromDivision: isExcluded,
            excludedSpecialName: resolvedName,
            ...(resolvedName && !existingBlk.blockName ? { blockName: resolvedName } : {}),
            updatedAt: new Date().toISOString(),
          },
        },
        auditHistory: [
          createAuditEntry(
            'exclusion_update',
            isExcluded
              ? `Block ${blockId} oo dhan waa laga reebay qaybinta dhaxalka${
                  resolvedName ? ` ("${resolvedName}")` : ''
                }.`
              : `Block ${blockId} dib ayaa loogu daray dhulka la qaybinayo.`
          ),
          ...prev.auditHistory.slice(0, 49),
        ],
      };
    });
  };

  const handlePlotMapClick = (plotId: string, blockId: string) => {
    if (interactionTool === 'inspect') {
      setInspectedPlotId(plotId);
      return;
    }

    if (interactionTool === 'mark_exclusion') {
      const targetExclude = exclusionBrushMode === 'exclude';
      const brushName =
        exclusionBrushSpecialName.trim() ||
        (exclusionBrushScope === 'block' ? 'Block Laga Reebay' : 'Plot Laga Reebay');

      if (exclusionBrushScope === 'block') {
        const curBlkExcl = getEffectiveBlockExclusion(blockId, subdivisionState.blockMetadata);
        if (targetExclude && curBlkExcl.isExcluded && curBlkExcl.specialName === brushName) {
          setBlockExclusionState(blockId, false);
        } else {
          setBlockExclusionState(blockId, targetExclude, targetExclude ? brushName : '');
        }
      } else {
        const curPlotExcl = getEffectivePlotExclusion(
          { id: plotId, block: blockId },
          subdivisionState.plotMetadata,
          subdivisionState.blockMetadata
        );
        if (
          targetExclude &&
          curPlotExcl.isExcluded &&
          curPlotExcl.scope === 'plot' &&
          curPlotExcl.specialName === brushName
        ) {
          setPlotExclusionState(plotId, blockId, false);
        } else {
          setPlotExclusionState(plotId, blockId, targetExclude, targetExclude ? brushName : '');
        }
        setInspectedPlotId(plotId);
      }
      return;
    }

    if (interactionTool === 'mark_zone') {
      onUpdateSubdivisionState((prev) => ({
        ...prev,
        zonePresetMode: 'custom',
        approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
        blockZones: {
          ...prev.blockZones,
          [blockId]: activeZoneBrush,
        },
        auditHistory: [
          createAuditEntry(
            'metadata_update',
            `Block ${blockId} waxaa lagu calaamadiyey ${activeZoneBrush}.`
          ),
          ...prev.auditHistory.slice(0, 49),
        ],
      }));
      setMapColorMode('zones');
      return;
    }

    if (interactionTool === 'mark_tier') {
      if (tierBrushScope === 'block') {
        onUpdateSubdivisionState((prev) => {
          const nextPlotOverrides = { ...prev.plotTierOverrides };
          subdivisionResult?.blocks
            .find((b) => b.id === blockId)
            ?.plots.forEach((q) => {
              delete nextPlotOverrides[q.id];
            });
          return {
            ...prev,
            approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
            blockTiers: {
              ...prev.blockTiers,
              [blockId]: activeTierBrush,
            },
            plotTierOverrides: nextPlotOverrides,
          };
        });
      } else {
        onUpdateSubdivisionState((prev) => ({
          ...prev,
          approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
          plotTierOverrides: {
            ...prev.plotTierOverrides,
            [plotId]: activeTierBrush,
          },
        }));
      }
      setMapColorMode('tiers');
      return;
    }

    if (interactionTool === 'assign_heir' && selectedHeirKeyForBrush) {
      const plotExcl = getEffectivePlotExclusion(
        { id: plotId, block: blockId },
        subdivisionState.plotMetadata,
        subdivisionState.blockMetadata
      );
      if (plotExcl.isExcluded) {
        onNotify(
          'Plot-kan Waa Laga Reebay Dhaxalka',
          `${plotId} (${plotExcl.specialName}) waxaa laga reebay qaybinta dhaxalka — marka hore dib ugu dar qaybinta haddii aad rabto in dhaxale la siiyo.`
        );
        setInspectedPlotId(plotId);
        return;
      }
      setInspectedPlotId(plotId);
      onUpdateSubdivisionState((prev) => {
        const nextManual = { ...prev.manualPlotHeirOverrides };
        const wasSame = nextManual[plotId] === selectedHeirKeyForBrush;
        if (wasSame) {
          delete nextManual[plotId];
        } else {
          nextManual[plotId] = selectedHeirKeyForBrush;
        }
        return {
          ...prev,
          approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
          manualPlotHeirOverrides: nextManual,
          auditHistory: [
            createAuditEntry(
              'manual_allocation',
              wasSame
                ? `Plot ${plotId}: dib ayaa loogu celiyey qaybinta otomaatigga ah.`
                : `Plot ${plotId}: gacanta ayaa loogu qoondeeyey dhaxale.`
            ),
            ...prev.auditHistory.slice(0, 49),
          ],
        };
      });
      setMapColorMode('heirs');
    }
  };

  // Auto-apply row-based tiers AND 4-quadrant Zones whenever blocks first appear
  useEffect(() => {
    if (!subdivisionResult || subdivisionResult.blocks.length === 0) return;

    const needsTiers = Object.keys(subdivisionState.blockTiers).length === 0;
    const needsZones = Object.keys(subdivisionState.blockZones).length === 0;
    if (!needsTiers && !needsZones) return;

    onUpdateSubdivisionState((prev) => ({
      ...prev,
      blockTiers: needsTiers ? buildRowBasedBlockTiers(subdivisionResult.blocks) : prev.blockTiers,
      blockZones: needsZones
        ? buildAutoBlockZones(subdivisionResult.blocks, prev.zonePresetMode || 'quadrants_4')
        : prev.blockZones,
    }));
  }, [
    subdivisionResult,
    subdivisionState.blockTiers,
    subdivisionState.blockZones,
    onUpdateSubdivisionState,
  ]);

  // Automatically record Half Plot validation snapshots whenever boundary/geometry changes
  useEffect(() => {
    if (
      !subdivisionResult ||
      !subdivisionResult.plotValidations ||
      !subdivisionResult.halfPlotSummary
    ) {
      return;
    }

    const plotValidations = subdivisionResult.plotValidations;
    const summary = subdivisionResult.halfPlotSummary;
    const existingHistory = subdivisionState.halfPlotValidationHistory || [];
    const latestSnap = existingHistory[0] || null;

    let hasDiff = !latestSnap;
    if (latestSnap) {
      if (Math.abs(latestSnap.boundaryAreaSqM - subdivisionResult.barea) > 0.5) {
        hasDiff = true;
      } else {
        const curKeys = Object.keys(plotValidations);
        const prevKeys = Object.keys(latestSnap.plotStatusMap);
        if (curKeys.length !== prevKeys.length) {
          hasDiff = true;
        } else {
          for (const pid of curKeys) {
            const cur = plotValidations[pid];
            const prev = latestSnap.plotStatusMap[pid];
            if (
              !prev ||
              prev.status !== cur.validationStatus ||
              Math.abs(prev.insideAreaSqM - cur.insideAreaSqM) > 0.2
            ) {
              hasDiff = true;
              break;
            }
          }
        }
      }
    }

    if (!hasDiff) return;

    const snap = buildHalfPlotValidationSnapshot(
      plotValidations,
      summary,
      subdivisionState.boundaryFileName || 'Xuduudda Beerta',
      subdivisionResult.barea,
      latestSnap
        ? 'Dib-u-xisaabinta plots-ka markii xuduudda ama shabakadda wax laga beddelay'
        : 'Hubinta koowaad ee xuduudda iyo Half Plots-ka',
      latestSnap
    );

    onUpdateSubdivisionState((prev) => ({
      ...prev,
      halfPlotValidationHistory: [snap, ...(prev.halfPlotValidationHistory || []).slice(0, 24)],
    }));
  }, [
    subdivisionResult,
    subdivisionState.boundaryFileName,
    subdivisionState.halfPlotValidationHistory,
    onUpdateSubdivisionState,
  ]);

  const updateParam = <K extends keyof SubdivisionParams>(key: K, val: SubdivisionParams[K]) => {
    onUpdateSubdivisionState((prev) => {
      const nextParams = { ...prev.params, [key]: val };
      if (nextParams.linkRoads && (key === 'rU' || key === 'rV')) {
        nextParams.rU = Number(val);
        nextParams.rV = Number(val);
      }
      return {
        ...prev,
        prebuiltSubdivision: null,
        approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
        params: nextParams,
      };
    });
  };

  const handleApplyZonePreset = (mode: ZonePresetMode) => {
    if (!subdivisionResult) return;
    const zoned = buildAutoBlockZones(subdivisionResult.blocks, mode);
    onUpdateSubdivisionState((prev) => ({
      ...prev,
      zonePresetMode: mode,
      blockZones: zoned,
      approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
      auditHistory: [
        createAuditEntry(
          'auto_proposal',
          `Blocks-ka waxaa loo qaybiyey Zones (${mode}) si qofna aanu dhinac keliya dhulka uga wada helin.`
        ),
        ...prev.auditHistory.slice(0, 49),
      ],
    }));
    setMapColorMode('zones');
    onNotify(
      'Zones Waa La Calaamadiyey',
      'Dhaxale kasta wuxuu Zone kasta (Zone A, B, C, D) ka helayaa boqolleyda saamigiisa dhaxalka.'
    );
  };

  const handleRunCadAutomaticDemTiers = async () => {
    if (!subdivisionResult) return;
    setIsRunningAutoDem(true);
    try {
      const demSampler = await buildDemSamplerForSubdivision(subdivisionResult);
      const cityRoad = await resolveNearestCityConnectingRoad(
        subdivisionResult,
        subdivisionState.roadItems,
        subdivisionState.cityRoadAnchorLonLat
      );
      const computed = computeAutomaticDemAndRoadTiers({
        subdivision: subdivisionResult,
        demSampler,
        cityRoad,
        wadiItems: subdivisionState.wadiItems,
        existingPlotMetadata: subdivisionState.plotMetadata,
        existingBlockMetadata: subdivisionState.blockMetadata,
      });

      onUpdateSubdivisionState((prev) => ({
        ...prev,
        blockTiers: computed.blockTiers,
        plotTierOverrides: computed.plotTierOverrides,
        plotMetadata: computed.updatedPlotMetadata,
        blockMetadata: computed.updatedBlockMetadata,
        autoTierSummary: computed.summary,
        approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
        auditHistory: [
          createAuditEntry(
            'tier_change',
            `Automatic DEM & Waddo: H1=${computed.summary.tier1PlotsCount}, H2=${computed.summary.tier2PlotsCount}, H3=${computed.summary.tier3PlotsCount}.`
          ),
          ...(prev.auditHistory || []).slice(0, 49),
        ],
      }));
      setMapColorMode('tiers');
      onNotify(
        'Heerarka Automatic (DEM + Waddo)',
        `H1 Siman: ${computed.summary.tier1PlotsCount} · H2: ${computed.summary.tier2PlotsCount} · H3 Jeexjeex: ${computed.summary.tier3PlotsCount} plot.`
      );
    } finally {
      setIsRunningAutoDem(false);
    }
  };

  const handleApplyRowTierPreset = () => {
    if (!subdivisionResult) return;
    const graded = buildRowBasedBlockTiers(subdivisionResult.blocks);
    onUpdateSubdivisionState((prev) => ({
      ...prev,
      blockTiers: graded,
      plotTierOverrides: {},
    }));
    setMapColorMode('tiers');
    onNotify(
      'Heerarka Safafka Waa La Calaamadiyey',
      'Safafka hore: Heerka 1aad · Dhexe: Heerka 2aad · Dambe: Heerka 3aad.'
    );
  };

  const handleSetAllBlocksTier = (tier: AssetQualityTier) => {
    if (!subdivisionResult) return;
    const all: Record<string, AssetQualityTier> = {};
    subdivisionResult.blocks.forEach((b) => {
      all[b.id] = tier;
    });
    onUpdateSubdivisionState((prev) => ({
      ...prev,
      blockTiers: all,
      plotTierOverrides: {},
    }));
    setMapColorMode('tiers');
  };

  const handleRenameIndividual = (shareId: string, personIndex: number, newName: string) => {
    const groupKey = getEditableGroupKeyForShareId(shareId);
    const updated = updateHeirPersonName(heirsInput, groupKey, personIndex, newName);
    onUpdateHeirsInput(updated);
  };

  const inspectedPlot: GeneratedPlot | undefined = useMemo(() => {
    if (!inspectedPlotId || !subdivisionResult) return undefined;
    const pool =
      subdivisionResult.allEvaluatedPlots && subdivisionResult.allEvaluatedPlots.length > 0
        ? subdivisionResult.allEvaluatedPlots
        : subdivisionResult.plots;
    return pool.find((q) => q.id === inspectedPlotId);
  }, [inspectedPlotId, subdivisionResult]);

  const filteredEvaluatedPlots = useMemo(() => {
    if (!subdivisionResult) return [];
    const pool = subdivisionResult.allEvaluatedPlots || subdivisionResult.plots;
    const q = plotSearchQuery.trim().toLowerCase();
    return pool.filter((p) => {
      const hp = p.halfPlotValidation || subdivisionResult.plotValidations?.[p.id];
      if (!hp) return false;
      if (halfPlotStatusFilter === 'all_clipped') {
        if (hp.boundaryRelation !== 'boundary_clipped' && hp.validationStatus === 'full_inside') {
          return false;
        }
        if (hp.validationStatus === 'full_outside') {
          return false;
        }
      } else if (halfPlotStatusFilter !== 'all') {
        if (hp.validationStatus !== halfPlotStatusFilter) return false;
      }

      if (!q) return true;
      return (
        p.id.toLowerCase().includes(q) ||
        p.block.toLowerCase().includes(q) ||
        hp.statusLabelSomali.toLowerCase().includes(q) ||
        hp.expectedRule.label.toLowerCase().includes(q)
      );
    });
  }, [subdivisionResult, halfPlotStatusFilter, plotSearchQuery]);

  const manualOverrideCount = Object.keys(subdivisionState.manualPlotHeirOverrides).length;

  const filteredPlots = useMemo(() => {
    if (!subdivisionResult) return [];
    const q = plotSearchQuery.trim().toLowerCase();
    return subdivisionResult.plots.filter((p) => {
      const pExcl = getEffectivePlotExclusion(
        p,
        subdivisionState.plotMetadata,
        subdivisionState.blockMetadata
      );
      if (plotDivisionFilter === 'divisible' && pExcl.isExcluded) return false;
      if (plotDivisionFilter === 'excluded' && !pExcl.isExcluded) return false;

      const pTier = getEffectivePlotTier(
        p,
        subdivisionState.blockTiers,
        subdivisionState.plotTierOverrides
      );
      if (plotTierFilter !== 'all' && pTier !== plotTierFilter) return false;

      const pZone = getEffectivePlotZone(
        p,
        subdivisionState.blockZones,
        subdivisionState.plotMetadata,
        subdivisionState.blockMetadata
      );
      if (plotZoneFilter !== 'all' && pZone !== plotZoneFilter) return false;

      const assign = fairAllocation?.plotAssignments[p.id];
      if (highlightedHeirKey) {
        const matchesSole = assign?.ownerHeirKey === highlightedHeirKey;
        const matchesShared = assign?.coOwners?.some((c) => c.heirKey === highlightedHeirKey);
        if (!matchesSole && !matchesShared) return false;
      }
      if (!q) return true;
      const ownerStr = pExcl.isExcluded
        ? `laga reebay ${pExcl.specialName}`
        : assign?.ownerPersonName ||
          assign?.coOwners?.map((c) => c.personName).join(' ') ||
          '';
      return (
        p.id.toLowerCase().includes(q) ||
        p.block.toLowerCase().includes(q) ||
        pZone.toLowerCase().includes(q) ||
        pExcl.specialName.toLowerCase().includes(q) ||
        ownerStr.toLowerCase().includes(q)
      );
    });
  }, [
    subdivisionResult,
    subdivisionState.blockTiers,
    subdivisionState.plotTierOverrides,
    subdivisionState.blockZones,
    subdivisionState.plotMetadata,
    subdivisionState.blockMetadata,
    plotDivisionFilter,
    plotTierFilter,
    plotZoneFilter,
    highlightedHeirKey,
    plotSearchQuery,
    fairAllocation,
  ]);

  const completeBlocksCount = subdivisionResult
    ? subdivisionResult.blocks.filter((b) => b.complete).length
    : 0;
  const totalPlotAreaSqM = subdivisionResult
    ? subdivisionResult.plots.reduce(
        (sum, q) =>
          sum + (q.calculatedAreaSqM ?? subdivisionResult.params.pw * subdivisionResult.params.pd),
        0
      )
    : 0;

  return (
    <div className="space-y-4 text-[#F8FAFC]">
      {/* 1. UNIFIED WORKFLOW HEADER */}
      <section className="bg-[#0B1220] border border-[#243449] rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#10B981]">
            <span>Khariiradda GIS &amp; Qaybinta Cadaaladda Dhulka</span>
            <span className="text-[#64748B]" aria-hidden="true">·</span>
            <span className="text-[#94A3B8] font-medium">
              {subdivisionState.approvalStatus === 'approved'
                ? 'Qoondayn La Ansixiyey'
                : 'Soo-jeedin Talo ah (Proposal)'}
            </span>
          </div>
          <h1 className="text-lg sm:text-xl font-extrabold text-[#F8FAFC] tracking-tight">
            Naqshadeeyaha Blocks &amp; Plots, Zones-ka &amp; Dhulka Laga Reebay
          </h1>
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            Dhaxale kasta wuxuu boqolleyda saamigiisa sharciga ah ka helayaa{' '}
            <strong className="text-[#F8FAFC]">Zone kasta (A–D)</strong> iyo{' '}
            <strong className="text-[#F8FAFC]">Heer kasta</strong>, iyadoo dhulka laga reebay (Masjid, Ceel, Waqf) sidiisa loo ilaalinayo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onSyncAndLinkToEstate}
            disabled={!subdivisionResult || subdivisionResult.plots.length === 0}
            className={`min-h-[44px] inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 ${
              subdivisionState.isLinkedToEstate
                ? 'bg-[#10B981] hover:bg-[#059669] text-[#030712]'
                : 'bg-[#10B981] hover:bg-[#059669] text-[#030712]'
            }`}
          >
            {subdivisionState.isLinkedToEstate ? (
              <>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Waa Ku Xidhan Yahay ({subdivisionResult?.plots.length || 0} Plot)</span>
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4 shrink-0" />
                <span>Ku Xidh Hantida &amp; Qaybi</span>
              </>
            )}
          </button>

          {subdivisionResult && onOpenCartographicPdfModal && (
            <button
              type="button"
              onClick={() => onOpenCartographicPdfModal('layout11')}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#243449] bg-[#0F1B2D] hover:border-[#10B981] hover:bg-[#16263D] px-3.5 py-2 text-xs font-bold text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Fur Khariidadda PDF (Automatic_Layout11) & Warbixinta Heerarka Beerta (4 Bog)"
            >
              <Printer className="w-4 h-4 text-[#10B981] shrink-0" />
              <span>PDF &amp; Warbixin</span>
            </button>
          )}

          <button
            type="button"
            onClick={onNavigateToResults}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#243449] bg-[#0F1B2D] hover:bg-[#16263D] px-3.5 py-2 text-xs font-bold text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Users className="w-4 h-4 text-[#10B981] shrink-0" />
            <span>Natiijada &amp; Shahaadada</span>
          </button>

          {/* Mobile/Tablet GIS Tools & Export Drawer Toggle */}
          <button
            type="button"
            onClick={() => setShowMobileControls((prev) => !prev)}
            className="xl:hidden min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#243449] bg-[#0F1B2D] hover:bg-[#16263D] px-3.5 py-2 text-xs font-bold text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#10B981] shrink-0" />
            <span>Dejinta GIS &amp; Dhoofinta</span>
            {showMobileControls ? (
              <ChevronUp className="w-4 h-4 text-[#94A3B8] shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#94A3B8] shrink-0" />
            )}
          </button>
        </div>
      </section>

      {/* 2. MAIN WORKSPACE: MOBILE MAP-FIRST (order-1) + DESKTOP 2-COLUMN (4 + 8 COLS) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* ==================== LEFT CONTROL RAIL (Desktop always visible; Mobile collapsible) ==================== */}
        <div
          className={`order-2 xl:order-1 xl:col-span-4 space-y-4 min-w-0 ${
            showMobileControls ? 'block' : 'hidden xl:block'
          }`}
        >
          {/* STEP 1: XOGTA NASHQADDA HADA FURAN (Single-entry rule: uploads occur only via '+' on Khariidad) */}
          <section className="bg-[#0B1220] border border-[#243449] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#10B981] flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-[#10B981] text-[#030712] text-[11px] font-mono-numbers tabular-nums flex items-center justify-center">
                  1
                </span>
                <span>Nashqadda Beerta Hadda Furan</span>
              </h2>
            </div>

            <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-3 space-y-1.5 text-xs">
              <div className="font-bold text-[#F8FAFC] truncate">
                {subdivisionState.boundaryFileName || 'Weli nashqad laguma xidhin'}
              </div>
              {subdivisionState.nashqadSummary ? (
                <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px] font-mono-numbers tabular-nums text-[#CBD5E1]">
                  <span>Blocks: <strong className="text-[#F8FAFC]">{subdivisionState.nashqadSummary.blocksCount}</strong></span>
                  <span>Dhammaystiran: <strong className="text-[#10B981]">{subdivisionState.nashqadSummary.fullPlotsCount}</strong></span>
                  <span>Half plots: <strong className="text-amber-400">{subdivisionState.nashqadSummary.halfPlotsCount}</strong></span>
                  <span>Wadarta: <strong className="text-[#F8FAFC]">{subdivisionState.nashqadSummary.totalPlotsAreaSqM.toLocaleString()} m²</strong></span>
                </div>
              ) : (
                <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                  Si aad u samayso nashqad cusub ama u soo geliso nashqad beer, u laabo <strong className="text-[#F8FAFC]">Khariidad</strong> oo riix badhanka <strong className="text-[#10B981]">&ldquo;+&rdquo;</strong> ee hoose dhexda.
                </p>
              )}
            </div>

            {/* Live Selectors: selB (Xuduudka) & selS (Block-ka tusaalaha) for parametric grids */}
            {!subdivisionState.prebuiltSubdivision && subdivisionState.boundaryItems.length > 0 && (
              <div className="space-y-2.5 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                    Xuduudka
                  </label>
                  <select
                    value={subdivisionState.selectedBoundaryIndex}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      if (onSelectBoundaryIndex) {
                        onSelectBoundaryIndex(idx);
                      } else {
                        onUpdateSubdivisionState((prev) =>
                          applyHtmlBoundarySelectionChange(prev, idx)
                        );
                      }
                    }}
                    className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 py-1.5 text-xs font-medium text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                  >
                    {subdivisionState.boundaryItems.map((it, i) => (
                      <option key={i} value={i}>
                        {it.name} — {it.type === 'Line' ? 'xariiq' : 'polygon'} ({it.coords.length}{' '}
                        dhibcood)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                    Block-ka tusaalaha (jihada iyo meesha shabakadda)
                  </label>
                  <select
                    value={subdivisionState.selectedSampleIndex}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      if (onSelectSampleIndex) {
                        onSelectSampleIndex(idx);
                      } else {
                        onUpdateSubdivisionState((prev) => ({
                          ...prev,
                          prebuiltSubdivision: null,
                          selectedSampleIndex: idx,
                        }));
                      }
                    }}
                    className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 py-1.5 text-xs font-medium text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                  >
                    {subdivisionState.sampleCandidates.length === 0 ? (
                      <option value={-1}>Otomaatig (xuduudka beerta)</option>
                    ) : (
                      subdivisionState.sampleCandidates.map((c, i) => (
                        <option key={i} value={i}>
                          {c.label}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            )}

            {/* Sample Block Independent Dherer & Ballac + Manual Bearing Degree Card (Prebuilt & Parametric CAD) */}
            {(() => {
              const sampleAlign =
                subdivisionResult?.sampleBlockAlignment ||
                subdivisionState.prebuiltSubdivision?.sampleBlockAlignment ||
                subdivisionState.nashqadSummary?.sampleBlockAlignment ||
                null;
              if (!sampleAlign) return null;
              return (
                <SampleBlockAxisControlCard
                  alignment={sampleAlign}
                  onAlign={(opts) => {
                    onUpdateSubdivisionState((prev) => {
                      const res = alignAllBlocksToSampleBlock(prev, opts);
                      return res.ok ? res.nextState : prev;
                    });
                  }}
                />
              );
            })()}

            {onBackToInteractiveMap && (
              <button
                type="button"
                onClick={onBackToInteractiveMap}
                className="w-full min-h-[40px] rounded-xl border border-[#10B981]/45 bg-[#0F1B2D] hover:border-[#10B981] hover:bg-[#16263D] px-3 py-1.5 text-xs font-bold text-[#10B981] transition-colors cursor-pointer"
              >
                Ku Laabo Khariidadda (+)
              </button>
            )}

            {/* Geometry / Gap / Self-intersection warnings */}
            {subdivisionResult && subdivisionResult.warnings.length > 0 && (
              <div className="rounded-xl bg-amber-950/40 border border-amber-500/40 px-3 py-2 text-[11px] text-amber-200 space-y-1 leading-relaxed">
                {subdivisionResult.warnings.map((w, wi) => (
                  <div key={wi}>{w}</div>
                ))}
              </div>
            )}
          </section>

          {/* STEP 2: CABBIRRADA SHABAKADDA (MITIR) */}
          {!subdivisionState.prebuiltSubdivision && (
            <section className="bg-[#0B1220] border border-[#243449] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#10B981] flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-md bg-[#10B981] text-[#030712] text-[11px] font-mono-numbers tabular-nums flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span className="truncate">Cabbirrada Blocks, Plots &amp; Waddooyinka (m)</span>
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateSubdivisionState((prev) => ({
                      ...prev,
                      prebuiltSubdivision: null,
                      approvalStatus:
                        prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
                      params: {
                        ...prev.params,
                        L: 90,
                        W: 48,
                        pw: 18,
                        pd: 24,
                        rU: 15,
                        rV: 15,
                        linkRoads: true,
                        rot: 0,
                        su: 0,
                        sv: 0,
                      },
                    }));
                    onNotify(
                      'Halbeegga 48×90m & Waddo 15m',
                      'Block kasta waxaa lagu fadhiisiyey Ballac = 48 m, Dherer = 90 m, iyo Waddo = 15 m.'
                    );
                  }}
                  className="min-h-[28px] px-2 py-0.5 rounded-lg bg-[#0F1B2D] hover:bg-[#16263D] border border-[#10B981]/50 text-[10px] font-extrabold text-[#10B981] shrink-0 cursor-pointer tabular-nums"
                >
                  48×90m · 15m
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-[#94A3B8] mb-1">
                    Block: dherer (m)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    value={subdivisionState.params.L}
                    onChange={(e) => updateParam('L', parseFloat(e.target.value) || 0)}
                    className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 py-1.5 text-xs font-mono-numbers tabular-nums font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#94A3B8] mb-1">
                    Block: ballac (m)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    value={subdivisionState.params.W}
                    onChange={(e) => updateParam('W', parseFloat(e.target.value) || 0)}
                    className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 py-1.5 text-xs font-mono-numbers tabular-nums font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#94A3B8] mb-1">
                    Plot: ballac (m)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    value={subdivisionState.params.pw}
                    onChange={(e) => updateParam('pw', parseFloat(e.target.value) || 0)}
                    className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 py-1.5 text-xs font-mono-numbers tabular-nums font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#94A3B8] mb-1">
                    Plot: dherer (m)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    value={subdivisionState.params.pd}
                    onChange={(e) => updateParam('pd', parseFloat(e.target.value) || 0)}
                    className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 py-1.5 text-xs font-mono-numbers tabular-nums font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#94A3B8] mb-1">
                    Waddo safafka (m)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={subdivisionState.params.rU}
                    onChange={(e) => updateParam('rU', Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 py-1.5 text-xs font-mono-numbers tabular-nums font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#94A3B8] mb-1">
                    Waddo columns (m)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={subdivisionState.params.rV}
                    onChange={(e) => updateParam('rV', Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 py-1.5 text-xs font-mono-numbers tabular-nums font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer select-none min-h-[36px]">
                <input
                  type="checkbox"
                  checked={subdivisionState.params.linkRoads}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    onUpdateSubdivisionState((prev) => ({
                      ...prev,
                      params: {
                        ...prev.params,
                        linkRoads: checked,
                        rV: checked ? prev.params.rU : prev.params.rV,
                      },
                    }));
                  }}
                  className="rounded border-[#243449] bg-[#0F1B2D] accent-[#10B981]"
                />
                <span>Labada waddo isku cabbir ha ahaadaan</span>
              </label>

              {subdivisionResult && subdivisionResult.nC > 0 && (
                <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] px-3 py-2 text-[11px] font-mono-numbers tabular-nums text-[#CBD5E1] space-y-0.5">
                  <div>
                    Plots/block: <strong className="text-[#F8FAFC]">{subdivisionResult.nC}</strong> ×{' '}
                    <strong className="text-[#F8FAFC]">{subdivisionResult.nR}</strong> ={' '}
                    <strong className="text-[#10B981]">
                      {subdivisionResult.nC * subdivisionResult.nR} plot
                    </strong>
                  </div>
                  <div>
                    Block: {(subdivisionState.params.L * subdivisionState.params.W).toFixed(0)} m² ·
                    Plot:{' '}
                    <strong className="text-[#F8FAFC]">
                      {(subdivisionState.params.pw * subdivisionState.params.pd).toFixed(1)} m²
                    </strong>
                  </div>
                </div>
              )}

              <details className="pt-1">
                <summary className="text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer select-none">
                  Hagaajin dheeraad ah (Jiheyn &amp; U-dhaaf)
                </summary>
                <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                  <div>
                    <label className="block text-[11px] text-[#94A3B8] mb-1">Jiheyn (°)</label>
                    <input
                      type="number"
                      step={0.5}
                      value={subdivisionState.params.rot}
                      onChange={(e) => updateParam('rot', parseFloat(e.target.value) || 0)}
                      className="w-full min-h-[38px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2.5 py-1.5 text-xs font-mono-numbers tabular-nums text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#94A3B8] mb-1">
                      Ugu yaraan plots/block
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      step={1}
                      value={subdivisionState.params.minP}
                      onChange={(e) =>
                        updateParam('minP', Math.max(1, Math.round(parseFloat(e.target.value) || 1)))
                      }
                      className="w-full min-h-[38px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2.5 py-1.5 text-xs font-mono-numbers tabular-nums text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#94A3B8] mb-1">
                      U-dhaaf dherer (m)
                    </label>
                    <input
                      type="number"
                      step={0.5}
                      value={subdivisionState.params.su}
                      onChange={(e) => updateParam('su', parseFloat(e.target.value) || 0)}
                      className="w-full min-h-[38px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2.5 py-1.5 text-xs font-mono-numbers tabular-nums text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#94A3B8] mb-1">
                      U-dhaaf ballac (m)
                    </label>
                    <input
                      type="number"
                      step={0.5}
                      value={subdivisionState.params.sv}
                      onChange={(e) => updateParam('sv', parseFloat(e.target.value) || 0)}
                      className="w-full min-h-[38px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2.5 py-1.5 text-xs font-mono-numbers tabular-nums text-[#F8FAFC]"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={subdivisionState.params.swap}
                        onChange={(e) => updateParam('swap', e.target.checked)}
                        className="rounded border-[#243449] bg-[#0F1B2D] accent-[#10B981]"
                      />
                      <span>Dhererka block-ka ha raacdo dhinaca gaaban ee tusaalaha</span>
                    </label>
                  </div>
                </div>
              </details>
            </section>
          )}

          {/* STEP 3: ZONES (ZONE A, B, C, D) & NON-ADJACENT BLOCKS DISPERSION */}
          <section className="bg-[#0B1220] border border-[#243449] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#10B981] flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-[#10B981] text-[#030712] text-[11px] font-mono-numbers tabular-nums flex items-center justify-center">
                  3
                </span>
                <span>Aagga (Zones A–D) &amp; Firdhinta Blocks</span>
              </h2>
              <Compass className="w-4 h-4 text-[#10B981] shrink-0" />
            </div>

            <p className="text-[11px] text-[#94A3B8] leading-relaxed">
              Zone kasta dhaxlayaashu waxay u kala helayaan boqolleyda saxda ah ee saamigooda dhaxalka, iyadoon qofna dhinac keliya ama laba block oo is-xiga la siin.
            </p>

            {/* Auto Zone Presets */}
            <div className="grid grid-cols-3 gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => handleApplyZonePreset('quadrants_4')}
                className={`min-h-[38px] py-1.5 px-2 rounded-lg border font-bold cursor-pointer transition-colors ${
                  subdivisionState.zonePresetMode === 'quadrants_4'
                    ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                    : 'bg-[#0F1B2D] text-[#CBD5E1] border-[#243449] hover:border-[#10B981]'
                }`}
              >
                4-Dhinac (A–D)
              </button>
              <button
                type="button"
                onClick={() => handleApplyZonePreset('columns_4')}
                className={`min-h-[38px] py-1.5 px-2 rounded-lg border font-bold cursor-pointer transition-colors ${
                  subdivisionState.zonePresetMode === 'columns_4'
                    ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                    : 'bg-[#0F1B2D] text-[#CBD5E1] border-[#243449] hover:border-[#10B981]'
                }`}
              >
                Bari–Galbeed
              </button>
              <button
                type="button"
                onClick={() => handleApplyZonePreset('rows_4')}
                className={`min-h-[38px] py-1.5 px-2 rounded-lg border font-bold cursor-pointer transition-colors ${
                  subdivisionState.zonePresetMode === 'rows_4'
                    ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                    : 'bg-[#0F1B2D] text-[#CBD5E1] border-[#243449] hover:border-[#10B981]'
                }`}
              >
                Waqooyi–Koonfur
              </button>
            </div>

            {/* Active Zone Summary & Brush */}
            {fairAllocation && fairAllocation.zones.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5">
                {fairAllocation.zones.map((z) => {
                  const active =
                    interactionTool === 'mark_zone' && activeZoneBrush === z.zoneId;
                  return (
                    <button
                      key={z.zoneId}
                      type="button"
                      onClick={() => {
                        setActiveZoneBrush(z.zoneId);
                        setInteractionTool('mark_zone');
                        setMapColorMode('zones');
                      }}
                      className={`text-left rounded-xl border px-2.5 py-2 transition-colors cursor-pointer ${
                        active
                          ? 'border-[#10B981] bg-[#10B981]/15'
                          : 'border-[#243449] bg-[#0F1B2D] hover:border-[#10B981]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F8FAFC]">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: z.colorHex }}
                          />
                          <span>{z.zoneId}</span>
                        </span>
                        <span className="text-[11px] font-mono-numbers tabular-nums font-bold text-[#10B981]">
                          {z.totalPlots} Plot
                        </span>
                      </div>
                      <div className="text-[10px] font-mono-numbers tabular-nums text-[#94A3B8] truncate mt-0.5">
                        Blocks: {z.blockIds.join(', ')}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Enforce Non-Adjacent Blocks Toggle */}
            <label className="flex items-start gap-2.5 rounded-xl bg-[#10B981]/10 border border-[#10B981]/35 p-2.5 text-xs text-[#F8FAFC] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={subdivisionState.enforceNonAdjacentBlocks}
                onChange={(e) => {
                  const checked = e.target.checked;
                  onUpdateSubdivisionState((prev) => ({
                    ...prev,
                    enforceNonAdjacentBlocks: checked,
                  }));
                }}
                className="mt-0.5 rounded border-[#10B981] accent-[#10B981]"
              />
              <div>
                <span className="font-bold block text-[#F8FAFC]">
                  Ka Ilaali Laba Block oo Is-xiga (Anti-Adjacent Blocks)
                </span>
                <span className="text-[11px] text-[#94A3B8]">
                  Qofna laba block oo isku dhow lama wada siinayo marka blocks kala fog ay jiraan.
                </span>
              </div>
            </label>
          </section>

          {/* STEP 4: CALAAMADI HEERKA DHULKA (1. AUTOMATIC DEM+WADDO | 2. MANUAL PLOT/BLOCK/FREEHAND) */}
          <section className="bg-[#0B1220] border border-[#243449] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#10B981] flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-[#10B981] text-[#030712] text-[11px] font-mono-numbers tabular-nums flex items-center justify-center">
                  4
                </span>
                <span>Heerka Dhulka (H1, H2, H3)</span>
              </h2>
            </div>

            {/* Two Explicit Modes: 1. Automatic Generator vs 2. Manual */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#030712] border border-[#243449] text-[11px] font-bold">
              <button
                type="button"
                onClick={() => {
                  setTierEvalMode('automatic');
                  if (interactionTool === 'mark_tier') setInteractionTool('inspect');
                }}
                className={`min-h-[34px] rounded-lg transition-colors cursor-pointer ${
                  tierEvalMode === 'automatic'
                    ? 'bg-[#10B981] text-[#030712] font-extrabold'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                1. Automatic
              </button>
              <button
                type="button"
                onClick={() => {
                  setTierEvalMode('manual');
                  setInteractionTool('mark_tier');
                  setMapColorMode('tiers');
                }}
                className={`min-h-[34px] rounded-lg transition-colors cursor-pointer ${
                  tierEvalMode === 'manual'
                    ? 'bg-[#10B981] text-[#030712] font-extrabold'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                2. Manual
              </button>
            </div>

            {tierEvalMode === 'automatic' ? (
              <div className="space-y-2.5 text-xs">
                <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                  Ku xidhan <strong>DEM joogga dhulka</strong>, <strong>waddada magaalada</strong>,
                  iyo <strong>simnaanta vs. jeexjeexa</strong> (Dhul siman = Heer 1, Jeexjeex =
                  Heer 2 &amp; 3).
                </p>
                <button
                  type="button"
                  disabled={!subdivisionResult || isRunningAutoDem}
                  onClick={() => void handleRunCadAutomaticDemTiers()}
                  className="w-full min-h-[42px] rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-45 text-[#030712] px-3 py-2 text-xs font-extrabold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {isRunningAutoDem ? (
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
                <button
                  type="button"
                  onClick={handleApplyRowTierPreset}
                  className="w-full min-h-[34px] rounded-lg border border-[#243449] bg-[#0F1B2D] hover:border-[#10B981] text-[11px] font-semibold text-[#CBD5E1] cursor-pointer"
                >
                  Safafka H1 / H2 / H3 (Fudud)
                </button>
                {subdivisionState.autoTierSummary && (
                  <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-2.5 space-y-1 text-[11px] tabular-nums text-[#CBD5E1]">
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">DEM / Slope:</span>
                      <strong>
                        {subdivisionState.autoTierSummary.avgSlopePercent}% ·{' '}
                        {subdivisionState.autoTierSummary.gulliedPlotsCount} jeexjeex
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Waddada:</span>
                      <strong>
                        {subdivisionState.autoTierSummary.nearestRoadDistanceM !== null
                          ? `${subdivisionState.autoTierSummary.nearestRoadDistanceM} m`
                          : 'Auto'}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#030712] border border-[#243449] text-[10.5px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setTierBrushScope('plot');
                      setInteractionTool('mark_tier');
                      setMapColorMode('tiers');
                    }}
                    className={`py-1.5 rounded-md cursor-pointer ${
                      tierBrushScope === 'plot' && interactionTool === 'mark_tier'
                        ? 'bg-[#10B981] text-[#030712]'
                        : 'text-[#94A3B8]'
                    }`}
                  >
                    By Plot
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTierBrushScope('block');
                      setInteractionTool('mark_tier');
                      setMapColorMode('tiers');
                    }}
                    className={`py-1.5 rounded-md cursor-pointer ${
                      tierBrushScope === 'block' && interactionTool === 'mark_tier'
                        ? 'bg-[#10B981] text-[#030712]'
                        : 'text-[#94A3B8]'
                    }`}
                  >
                    By Block
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTierBrushScope('freehand');
                      setInteractionTool('mark_tier');
                      setMapColorMode('tiers');
                    }}
                    className={`py-1.5 rounded-md inline-flex items-center justify-center gap-1 cursor-pointer ${
                      tierBrushScope === 'freehand' && interactionTool === 'mark_tier'
                        ? 'bg-[#10B981] text-[#030712]'
                        : 'text-[#94A3B8]'
                    }`}
                  >
                    <Lasso className="w-3 h-3 shrink-0" />
                    <span>Freehand</span>
                  </button>
                </div>

                <div className="flex items-center justify-end gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleSetAllBlocksTier('tier_1_prime')}
                    className="px-2 py-1 rounded border border-[#243449] bg-[#0F1B2D] hover:border-[#10B981] text-[#CBD5E1] font-semibold cursor-pointer"
                  >
                    Wada H1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllBlocksTier('tier_2_standard')}
                    className="px-2 py-1 rounded border border-[#243449] bg-[#0F1B2D] hover:border-[#10B981] text-[#CBD5E1] font-semibold cursor-pointer"
                  >
                    Wada H2
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllBlocksTier('tier_3_basic')}
                    className="px-2 py-1 rounded border border-[#243449] bg-[#0F1B2D] hover:border-[#10B981] text-[#CBD5E1] font-semibold cursor-pointer"
                  >
                    Wada H3
                  </button>
                </div>
              </div>
            )}

            {/* Tier Counts & Optional Unit Prices */}
            <div className="space-y-2 pt-1">
              {(
                ['tier_1_prime', 'tier_2_standard', 'tier_3_basic'] as AssetQualityTier[]
              ).map((tierKey) => {
                const meta = TIER_METADATA[tierKey];
                const count = fairAllocation?.tierCounts[tierKey] ?? 0;
                const isBrushActive =
                  interactionTool === 'mark_tier' && activeTierBrush === tierKey;

                return (
                  <div
                    key={tierKey}
                    className={`rounded-xl border p-2.5 transition-colors ${
                      isBrushActive
                        ? 'border-[#10B981] bg-[#10B981]/10'
                        : 'border-[#243449] bg-[#0F1B2D]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTierEvalMode('manual');
                          setActiveTierBrush(tierKey);
                          setInteractionTool('mark_tier');
                          setMapColorMode('tiers');
                        }}
                        className="flex items-center gap-2 text-left flex-1 min-w-0 cursor-pointer"
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-xs shrink-0"
                          style={{ backgroundColor: meta.fillHex }}
                        />
                        <span className="text-xs font-bold text-[#F8FAFC] truncate">
                          {meta.shortSomali}
                        </span>
                      </button>

                      <span className="text-xs font-mono-numbers tabular-nums font-extrabold text-[#10B981] shrink-0">
                        {count} Plot
                      </span>
                    </div>

                    <div className="mt-2 pt-2 border-t border-[#243449] flex items-center justify-between gap-2">
                      <label className="text-[11px] text-[#94A3B8]">
                        Qiimaha 1 Plot ({currency}, 0 = qiime la&apos;aan):
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={subdivisionState.tierUnitPrices[tierKey] || ''}
                        placeholder="0"
                        onChange={(e) => {
                          const price = Math.max(0, parseFloat(e.target.value) || 0);
                          onUpdateSubdivisionState((prev) => ({
                            ...prev,
                            tierUnitPrices: {
                              ...prev.tierUnitPrices,
                              [tierKey]: price,
                            },
                          }));
                        }}
                        className="w-24 min-h-[34px] bg-[#0B1220] border border-[#243449] rounded-lg px-2 py-1 text-right text-xs font-mono-numbers tabular-nums font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* STEP 5: HABKA QAYBINTA & SOO DEJINTA GIS */}
          <section className="bg-[#0B1220] border border-[#243449] rounded-2xl p-4 space-y-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#10B981] flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-[#10B981] text-[#030712] text-[11px] font-mono-numbers tabular-nums flex items-center justify-center">
                5
              </span>
              <span>Habka Qaybinta &amp; Dhoofinta GIS</span>
            </h2>

            <div className="space-y-2">
              {(
                [
                  'exact_shared',
                  'whole_balanced',
                  'clean_equal_no_half_no_fraction',
                ] as LandAllocationMode[]
              ).map((modeId) => {
                const meta = LAND_ALLOCATION_MODE_METADATA[modeId];
                const isActive = subdivisionState.allocationMode === modeId;
                return (
                  <button
                    key={modeId}
                    type="button"
                    onClick={() =>
                      onUpdateSubdivisionState((prev) => ({
                        ...prev,
                        allocationMode: modeId,
                        approvalStatus:
                          prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
                      }))
                    }
                    className={`w-full text-left rounded-xl border p-3 transition-colors cursor-pointer ${
                      isActive
                        ? 'border-[#10B981] bg-[#10B981]/10'
                        : 'border-[#243449] bg-[#0F1B2D] hover:border-[#10B981]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#F8FAFC]">{meta.titleSomali}</span>
                      {isActive && <Check className="w-4 h-4 text-[#10B981] shrink-0" />}
                    </div>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5 leading-relaxed">
                      {meta.descriptionSomali}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#F8FAFC]">Half-Plots (0.5 Plot)</div>
                <div className="text-[11px] text-[#94A3B8]">
                  {subdivisionState.includeValidHalfPlotsInAllocation
                    ? 'Waa lagu daray qaybinta dhaxalka'
                    : 'Waa laga reebay qaybinta dhaxalka'}
                </div>
              </div>
              <div className="inline-flex items-center gap-1 p-0.5 rounded-xl bg-[#0B1220] border border-[#243449] shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSubdivisionState((prev) => ({
                      ...prev,
                      includeValidHalfPlotsInAllocation: true,
                      approvalStatus:
                        prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
                    }))
                  }
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    subdivisionState.includeValidHalfPlotsInAllocation
                      ? 'bg-[#10B981] text-[#030712]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  Ku Dar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSubdivisionState((prev) => ({
                      ...prev,
                      includeValidHalfPlotsInAllocation: false,
                      approvalStatus:
                        prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
                    }))
                  }
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    !subdivisionState.includeValidHalfPlotsInAllocation
                      ? 'bg-[#1E293B] text-[#F8FAFC]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  Ka Reeb
                </button>
              </div>
            </div>

            {fairAllocation && (
              <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-3 text-[11px] space-y-1 tabular-nums">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#94A3B8]">Plots Buuxa oo La Qaybiyey:</span>
                  <strong className="text-[#10B981] font-bold">
                    {fairAllocation.allocatedFullPlotsCount ?? fairAllocation.totalFullPlots} /{' '}
                    {fairAllocation.totalFullPlots} Plot
                  </strong>
                </div>
                {(fairAllocation.validHalfPlotsIncludedCount ?? 0) > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#94A3B8]">Half-Plots Lagu Daray (0.5):</span>
                    <strong className="text-[#10B981] font-bold">
                      {fairAllocation.validHalfPlotsIncludedCount} Half-Plot (
                      {((fairAllocation.validHalfPlotsIncludedCount || 0) * 0.5).toFixed(1)} Plot)
                    </strong>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#94A3B8]">Plots Wadaag ah:</span>
                  <strong className="text-[#F8FAFC] font-bold">
                    {fairAllocation.sharedPlots.length} Plot
                  </strong>
                </div>
                {(fairAllocation.withheldJajabPlotsCount ?? 0) > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#94A3B8]">Jajabka Laga Reebay:</span>
                    <strong className="text-amber-300 font-bold">
                      {fairAllocation.withheldJajabPlotsCount} Plot
                    </strong>
                  </div>
                )}
                {(fairAllocation.withheldHalfPlotsCount ?? 0) > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#94A3B8]">Half-Plots Laga Reebay:</span>
                    <strong className="text-slate-300 font-bold">
                      {fairAllocation.withheldHalfPlotsCount} Half-Plot
                    </strong>
                  </div>
                )}
              </div>
            )}

            {manualOverrideCount > 0 && (
              <div className="rounded-xl bg-amber-950/35 border border-amber-500/40 p-3 flex items-center justify-between gap-2">
                <span className="text-xs text-amber-200 font-medium">
                  {manualOverrideCount} plot ayaa gacanta lagu qoondeeyey.
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSubdivisionState((prev) => ({
                      ...prev,
                      manualPlotHeirOverrides: {},
                      approvalStatus: 'draft_proposal',
                    }))
                  }
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#10B981] hover:underline shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Soo-jeedin Toos ah</span>
                </button>
              </div>
            )}

            <div className="pt-2 border-t border-[#243449] space-y-2">
              <select
                value={exportCrs}
                onChange={(e) => setExportCrs(e.target.value as 'wgs' | 'utm')}
                className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 py-1 text-xs font-medium text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
              >
                <option value="wgs">CRS: WGS84 Lat/Lon (EPSG:4326)</option>
                <option value="utm">
                  CRS: UTM Mitir (Zone{' '}
                  {subdivisionResult
                    ? `${subdivisionResult.zone}${subdivisionResult.south ? 'S' : 'N'} · EPSG:${subdivisionResult.epsg}`
                    : 'Auto'}
                  )
                </option>
              </select>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={
                    !subdivisionResult ||
                    (subdivisionResult.plots.length === 0 &&
                      (subdivisionResult.validHalfPlots?.length || 0) === 0) ||
                    isExportingZip
                  }
                  onClick={async () => {
                    if (!subdivisionResult) return;
                    setIsExportingZip(true);
                    try {
                      await downloadSubdivisionShapefileZip(
                        subdivisionResult,
                        subdivisionState.blockTiers,
                        subdivisionState.plotTierOverrides,
                        fairAllocation,
                        exportCrs,
                        { ...subdivisionState, caseMeta: activeCaseMeta }
                      );
                      onNotify(
                        'Shapefile (.zip)',
                        'Faylka Shapefile oo wata Magaca Kiiska, Ref No & Half Plots waa diyaar.'
                      );
                    } finally {
                      setIsExportingZip(false);
                    }
                  }}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-3 py-1.5 text-xs font-extrabold whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>Shapefile (.zip)</span>
                </button>

                <button
                  type="button"
                  disabled={
                    !subdivisionResult ||
                    (subdivisionResult.plots.length === 0 &&
                      (subdivisionResult.allEvaluatedPlots?.length || 0) === 0)
                  }
                  onClick={() => {
                    if (!subdivisionResult) return;
                    downloadSubdivisionGeoJSON(
                      subdivisionResult,
                      subdivisionState.blockTiers,
                      subdivisionState.plotTierOverrides,
                      fairAllocation,
                      { ...subdivisionState, caseMeta: activeCaseMeta }
                    );
                  }}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#243449] bg-[#0F1B2D] hover:bg-[#16263D] text-[#F8FAFC] px-3 py-1.5 text-xs font-bold whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  <FileJson className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                  <span>GeoJSON (.json)</span>
                </button>

                <button
                  type="button"
                  disabled={
                    !subdivisionResult ||
                    (subdivisionResult.plots.length === 0 &&
                      (subdivisionResult.allEvaluatedPlots?.length || 0) === 0)
                  }
                  onClick={() => {
                    if (!subdivisionResult) return;
                    downloadSubdivisionCSV(
                      subdivisionResult,
                      subdivisionState.blockTiers,
                      subdivisionState.plotTierOverrides,
                      fairAllocation,
                      { ...subdivisionState, caseMeta: activeCaseMeta }
                    );
                  }}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#243449] bg-[#0F1B2D] hover:bg-[#16263D] text-[#F8FAFC] px-3 py-1.5 text-xs font-bold whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>CSV Liiska</span>
                </button>

                <button
                  type="button"
                  disabled={
                    !subdivisionResult ||
                    (subdivisionResult.plots.length === 0 &&
                      (subdivisionResult.allEvaluatedPlots?.length || 0) === 0) ||
                    isExportingZip
                  }
                  onClick={async () => {
                    if (!subdivisionResult) return;
                    setIsExportingZip(true);
                    try {
                      await downloadAllGisPackageZip(
                        subdivisionResult,
                        subdivisionState.blockTiers,
                        subdivisionState.plotTierOverrides,
                        fairAllocation,
                        { ...subdivisionState, caseMeta: activeCaseMeta }
                      );
                    } finally {
                      setIsExportingZip(false);
                    }
                  }}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#243449] bg-[#0F1B2D] hover:bg-[#16263D] text-[#F8FAFC] px-3 py-1.5 text-xs font-bold whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  <FolderArchive className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                  <span>Dhammaan (.zip)</span>
                </button>

                <button
                  type="button"
                  disabled={
                    !subdivisionResult ||
                    (subdivisionResult.plots.length === 0 &&
                      (subdivisionResult.allEvaluatedPlots?.length || 0) === 0)
                  }
                  onClick={async () => {
                    const txt = buildPlotsGeoJsonClipboardText(subdivisionState, subdivisionResult);
                    if (!txt) return;
                    const ok = await copyTextSafelyToClipboard(txt);
                    if (ok) {
                      setCopiedGeoJson(true);
                      onNotify('Waa La Koobiyeeyey', 'Qoraalka GeoJSON waa lagu koobiyeeyey clipboard-ka.');
                      window.setTimeout(() => setCopiedGeoJson(false), 2200);
                    }
                  }}
                  className="col-span-2 min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#10B981]/40 bg-[#0F1B2D] hover:border-[#10B981] text-[#10B981] px-3 py-1.5 text-xs font-bold whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  {copiedGeoJson ? (
                    <>
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>GeoJSON Waa La Koobiyeeyey</span>
                    </>
                  ) : (
                    <>
                      <FileJson className="w-3.5 h-3.5 shrink-0" />
                      <span>Koobiyee Qoraalka GeoJSON</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* ==================== RIGHT LIVE MAP & FAIR ALLOCATION WORKSPACE (First on mobile!) ==================== */}
        <div className="order-1 xl:order-2 xl:col-span-8 space-y-4 min-w-0">
          {/* TOP KPI METRICS STRIP */}
          {subdivisionResult && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-[#0B1220] border border-[#243449] rounded-2xl p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Aagga Beerta
                </div>
                <div className="text-lg font-mono-numbers font-extrabold text-[#F8FAFC] mt-0.5 tabular-nums">
                  {(subdivisionResult.barea / 1e4).toFixed(2)} ha
                </div>
                <div className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                  {Math.round(subdivisionResult.barea).toLocaleString()} m²
                </div>
              </div>

              <div className="bg-[#0B1220] border border-[#243449] rounded-2xl p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Blocks &amp; Xuduudda
                </div>
                <div className="text-lg font-mono-numbers font-extrabold text-[#F8FAFC] mt-0.5 tabular-nums">
                  {subdivisionResult.blocks.length} Blk
                </div>
                <div className="text-[11px] text-[#94A3B8] tabular-nums font-mono-numbers">
                  {(fairAllocation?.excludedBlocksCount ?? 0) > 0
                    ? `${subdivisionResult.blocks.length - (fairAllocation?.excludedBlocksCount ?? 0)} qaybin · ${fairAllocation?.excludedBlocksCount} reeban`
                    : `${completeBlocksCount} buuxa · ${
                        subdivisionResult.halfPlotSummary?.boundaryClippedBlocksCount ?? 0
                      } go'an`}
                </div>
              </div>

              <div className="bg-[#0B1220] border border-[#243449] rounded-2xl p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Plots La Qaybinayo
                </div>
                <div className="text-lg font-mono-numbers font-extrabold text-[#10B981] mt-0.5 tabular-nums">
                  {fairAllocation?.totalFullPlots ?? subdivisionResult.plots.length}
                </div>
                <div className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                  {(fairAllocation?.excludedPlotsCount ?? 0) > 0
                    ? `${fairAllocation?.excludedPlotsCount} reeban (${Math.round(totalPlotAreaSqM).toLocaleString()} m²)`
                    : `H1:${fairAllocation?.tierCounts.tier_1_prime ?? 0} · H2:${
                        fairAllocation?.tierCounts.tier_2_standard ?? 0
                      } · H3:${fairAllocation?.tierCounts.tier_3_basic ?? 0}`}
                </div>
              </div>

              <div className="bg-[#0B1220] border border-[#243449] rounded-2xl p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  {(fairAllocation?.excludedPlotsCount ?? 0) > 0
                    ? 'Laga Reebay Dhaxalka'
                    : 'Half Plots (216 m²)'}
                </div>
                {(fairAllocation?.excludedPlotsCount ?? 0) > 0 ? (
                  <>
                    <div className="text-lg font-mono-numbers font-extrabold text-rose-400 mt-0.5 tabular-nums">
                      {fairAllocation?.excludedPlotsCount ?? 0} Plot
                    </div>
                    <div className="text-[11px] text-rose-300/80 font-mono-numbers tabular-nums">
                      {fairAllocation?.excludedBlocksCount ?? 0} Blk · Magacyo gaar ah
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-lg font-mono-numbers font-extrabold text-[#10B981] mt-0.5 tabular-nums">
                      {subdivisionResult.htmlHalvesCounted?.length ??
                        subdivisionResult.halfPlotSummary?.validHalfPlotsCount ??
                        0}{' '}
                      Half
                    </div>
                    <div className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                      18×12 / 9×24 ·{' '}
                      {(
                        (subdivisionResult.htmlHalvesCounted?.length ??
                          subdivisionResult.halfPlotSummary?.validHalfPlotsCount ??
                          0) *
                        ((subdivisionResult.params.pw * subdivisionResult.params.pd) / 2)
                      ).toFixed(0)}{' '}
                      m²
                    </div>
                  </>
                )}
              </div>

              <div className="col-span-2 sm:col-span-1 bg-[#0B1220] border border-[#243449] rounded-2xl p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Dhaxlayaasha
                </div>
                <div className="text-lg font-mono-numbers font-extrabold text-[#10B981] mt-0.5 tabular-nums">
                  {fairAllocation?.heirAllocations.length ?? 0} Qof
                </div>
                <div className="text-[11px] text-[#94A3B8] font-semibold">
                  {fairAllocation?.hasZeroAdjacentBlockViolations ? '0 Blk is-xiga' : 'Eeg digniinta'}
                </div>
              </div>
            </div>
          )}

          {/* SPECIAL AREA SUMMARY CARDS (`Aag gaar ah` — exact HTML stat cards) */}
          {subdivisionResult &&
            subdivisionResult.specialAreas &&
            subdivisionResult.specialAreas.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {subdivisionResult.specialAreas.map((sa, idx) => (
                  <div
                    key={`sa-stat-${idx}`}
                    className="bg-[#0B1220] border border-[#7c3aed]/55 rounded-2xl p-3.5"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#c4b5fd] truncate">
                      Aag: {sa.name}
                    </div>
                    <div className="text-base font-mono-numbers font-extrabold text-[#F8FAFC] mt-0.5 tabular-nums">
                      {sa.nP} plots + {sa.nH} half
                    </div>
                    <div className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                      {Math.round(sa.aP + sa.aH).toLocaleString()} m² · gudaha:{' '}
                      {(sa.area / 1e4).toFixed(2)} ha
                    </div>
                  </div>
                ))}
              </div>
            )}

          {/* FAIRNESS & ZONE / BLOCK DISPERSION AUDIT BANNER */}
          {fairAllocation && (
            <div
              className={`rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                fairAllocation.heirAllocations.length === 0
                  ? 'bg-amber-950/35 border-amber-500/40 text-amber-100'
                  : fairAllocation.isFairAcrossAllTiers &&
                    fairAllocation.isFairAcrossAllZones &&
                    fairAllocation.hasZeroAdjacentBlockViolations
                  ? 'bg-[#10B981]/10 border-[#10B981]/35 text-[#F8FAFC]'
                  : 'bg-amber-950/40 border-amber-500/45 text-amber-100'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {fairAllocation.heirAllocations.length === 0 ? (
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                ) : fairAllocation.isFairAcrossAllTiers &&
                  fairAllocation.isFairAcrossAllZones &&
                  fairAllocation.hasZeroAdjacentBlockViolations ? (
                  <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="leading-relaxed">
                  <span className="font-bold">{fairAllocation.fairnessSummarySomali}</span>
                  {fairAllocation.fairnessWarnings.length > 0 &&
                    fairAllocation.heirAllocations.length > 0 && (
                      <div className="mt-1 text-[11px] text-amber-200/90">
                        {fairAllocation.fairnessWarnings.slice(0, 2).join(' · ')}
                      </div>
                    )}
                </div>
              </div>

              {fairAllocation.heirAllocations.length === 0 ? (
                <button
                  type="button"
                  onClick={onNavigateToCalculator}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] font-extrabold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Dooro Dhaxlayaasha
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setBottomTab('heir_reports')}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] text-[#F8FAFC] font-bold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Warbixinta &amp; Ansixinta
                </button>
              )}
            </div>
          )}

          {/* INTERACTIVE CAD / GIS MAP CARD */}
          <section className="bg-[#0B1220] border border-[#243449] rounded-2xl overflow-hidden">
            {/* Map Primary Controls Row: Compact Icon-Only Toolbars + Active Tool Label */}
            <div className="px-3 py-2 border-b border-[#243449] flex flex-wrap items-center justify-between gap-2 bg-[#0F1B2D]/70">
              {/* Color Mode Icons: Heirs | Zones | Tiers | Excluded | Half Plots */}
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#030712]/65 border border-[#243449]">
                <button
                  type="button"
                  onClick={() => setMapColorMode('heirs')}
                  title="Midabka: Dhaxlayaasha"
                  aria-label="Midabka: Dhaxlayaasha"
                  className={`h-9 w-9 rounded-lg inline-flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                    mapColorMode === 'heirs'
                      ? 'bg-[#10B981] text-[#030712]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0F1B2D]'
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => setMapColorMode('zones')}
                  title="Midabka: Zones (A–D)"
                  aria-label="Midabka: Zones (A–D)"
                  className={`h-9 w-9 rounded-lg inline-flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                    mapColorMode === 'zones'
                      ? 'bg-[#10B981] text-[#030712]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0F1B2D]'
                  }`}
                >
                  <Compass className="w-4 h-4 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => setMapColorMode('tiers')}
                  title="Midabka: Heerka (H1–H3)"
                  aria-label="Midabka: Heerka (H1–H3)"
                  className={`h-9 w-9 rounded-lg inline-flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                    mapColorMode === 'tiers'
                      ? 'bg-[#10B981] text-[#030712]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0F1B2D]'
                  }`}
                >
                  <Layers className="w-4 h-4 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => setMapColorMode('excluded')}
                  title={`Midabka: Laga Reebay (${fairAllocation?.excludedPlotsCount ?? 0})`}
                  aria-label={`Midabka: Laga Reebay (${fairAllocation?.excludedPlotsCount ?? 0})`}
                  className={`relative h-9 w-9 rounded-lg inline-flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                    mapColorMode === 'excluded'
                      ? 'bg-rose-600 text-white'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0F1B2D]'
                  }`}
                >
                  <Ban className="w-4 h-4 shrink-0" />
                  {(fairAllocation?.excludedPlotsCount ?? 0) > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-md bg-rose-500 text-white text-[9px] font-black leading-4 text-center tabular-nums">
                      {fairAllocation?.excludedPlotsCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMapColorMode('half_plots');
                    setInteractionTool('inspect');
                  }}
                  title={`Midabka: Half Plots (${subdivisionResult?.halfPlotSummary?.validHalfPlotsCount ?? 0})`}
                  aria-label={`Midabka: Half Plots (${subdivisionResult?.halfPlotSummary?.validHalfPlotsCount ?? 0})`}
                  className={`relative h-9 w-9 rounded-lg inline-flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                    mapColorMode === 'half_plots'
                      ? 'bg-[#10B981] text-[#030712]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0F1B2D]'
                  }`}
                >
                  <Grid className="w-4 h-4 shrink-0" />
                  {(subdivisionResult?.halfPlotSummary?.validHalfPlotsCount ?? 0) > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-md bg-emerald-500 text-[#030712] text-[9px] font-black leading-4 text-center tabular-nums">
                      {subdivisionResult?.halfPlotSummary?.validHalfPlotsCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Active Mode & Tool Compact Status */}
              <div className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold text-[#94A3B8]">
                <span className="text-[#F8FAFC]">
                  {mapColorMode === 'heirs'
                    ? 'Dhaxlayaasha'
                    : mapColorMode === 'zones'
                    ? 'Zones (A–D)'
                    : mapColorMode === 'tiers'
                    ? 'Heerka (H1–H3)'
                    : mapColorMode === 'excluded'
                    ? 'Laga Reebay'
                    : 'Half Plots'}
                </span>
                <span>·</span>
                <span className="text-[#10B981]">
                  {interactionTool === 'inspect'
                    ? 'Kormeer'
                    : interactionTool === 'mark_exclusion'
                    ? 'Ka Reeb Dhaxalka'
                    : interactionTool === 'mark_zone'
                    ? 'Calaamadi Zone'
                    : interactionTool === 'mark_tier'
                    ? 'Calaamadi Heer'
                    : 'Qoondayn Gacan'}
                </span>
              </div>

              {/* Click Interaction Tool Icons */}
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#030712]/65 border border-[#243449]">
                <button
                  type="button"
                  onClick={() => setInteractionTool('inspect')}
                  title="Qalabka: Kormeer Plot-ka"
                  aria-label="Qalabka: Kormeer Plot-ka"
                  className={`h-9 w-9 rounded-lg inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                    interactionTool === 'inspect'
                      ? 'bg-[#F8FAFC] text-[#030712]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0F1B2D]'
                  }`}
                >
                  <MousePointerClick
                    className={`w-4 h-4 shrink-0 ${
                      interactionTool === 'inspect' ? 'text-[#030712]' : 'text-[#10B981]'
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInteractionTool('mark_exclusion');
                    setMapColorMode('excluded');
                  }}
                  title="Qalabka: Ka Reeb Dhaxalka"
                  aria-label="Qalabka: Ka Reeb Dhaxalka"
                  className={`h-9 w-9 rounded-lg inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                    interactionTool === 'mark_exclusion'
                      ? 'bg-rose-600 text-white'
                      : 'text-rose-300 hover:bg-rose-950/50'
                  }`}
                >
                  <Ban className="w-4 h-4 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInteractionTool('mark_zone');
                    setMapColorMode('zones');
                  }}
                  title="Qalabka: Calaamadi Zone"
                  aria-label="Qalabka: Calaamadi Zone"
                  className={`h-9 w-9 rounded-lg inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                    interactionTool === 'mark_zone'
                      ? 'bg-[#F8FAFC] text-[#030712]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0F1B2D]'
                  }`}
                >
                  <Compass
                    className={`w-4 h-4 shrink-0 ${
                      interactionTool === 'mark_zone' ? 'text-[#030712]' : 'text-sky-400'
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInteractionTool('mark_tier');
                    setMapColorMode('tiers');
                  }}
                  title="Qalabka: Calaamadi Heerka"
                  aria-label="Qalabka: Calaamadi Heerka"
                  className={`h-9 w-9 rounded-lg inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                    interactionTool === 'mark_tier'
                      ? 'bg-[#F8FAFC] text-[#030712]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0F1B2D]'
                  }`}
                >
                  <Paintbrush
                    className={`w-4 h-4 shrink-0 ${
                      interactionTool === 'mark_tier' ? 'text-[#030712]' : 'text-[#10B981]'
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInteractionTool('assign_heir');
                    setMapColorMode('heirs');
                  }}
                  title="Qalabka: Qoondayn Gacan"
                  aria-label="Qalabka: Qoondayn Gacan"
                  className={`h-9 w-9 rounded-lg inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                    interactionTool === 'assign_heir'
                      ? 'bg-[#F8FAFC] text-[#030712]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0F1B2D]'
                  }`}
                >
                  <UserCheck
                    className={`w-4 h-4 shrink-0 ${
                      interactionTool === 'assign_heir' ? 'text-[#030712]' : 'text-amber-400'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Contextual Exclusion Marking Bar (Blocks & Plots + Special Name) */}
            {interactionTool === 'mark_exclusion' && (
              <div className="px-4 py-3 bg-rose-950/35 border-b border-rose-500/40 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-rose-200 flex items-center gap-1.5">
                      <Ban className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>Calaamadi Dhulka Laga Reebayo Qaybinta:</span>
                    </span>

                    <div className="inline-flex rounded-lg bg-[#0B1220] border border-[#243449] p-0.5 font-bold">
                      <button
                        type="button"
                        onClick={() => setExclusionBrushScope('plot')}
                        className={`min-h-[34px] px-2.5 py-1 rounded-md cursor-pointer ${
                          exclusionBrushScope === 'plot'
                            ? 'bg-rose-600 text-white'
                            : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        Plot Keliya
                      </button>
                      <button
                        type="button"
                        onClick={() => setExclusionBrushScope('block')}
                        className={`min-h-[34px] px-2.5 py-1 rounded-md cursor-pointer ${
                          exclusionBrushScope === 'block'
                            ? 'bg-rose-600 text-white'
                            : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        Block oo Dhan
                      </button>
                    </div>

                    <div className="inline-flex rounded-lg bg-[#0B1220] border border-[#243449] p-0.5 font-bold">
                      <button
                        type="button"
                        onClick={() => setExclusionBrushMode('exclude')}
                        className={`min-h-[34px] px-2.5 py-1 rounded-md cursor-pointer ${
                          exclusionBrushMode === 'exclude'
                            ? 'bg-rose-600 text-white'
                            : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        Ka Reeb Dhaxalka
                      </button>
                      <button
                        type="button"
                        onClick={() => setExclusionBrushMode('include')}
                        className={`min-h-[34px] px-2.5 py-1 rounded-md cursor-pointer ${
                          exclusionBrushMode === 'include'
                            ? 'bg-[#10B981] text-[#030712]'
                            : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        Dib ugu Dar Qaybinta
                      </button>
                    </div>
                  </div>

                  <span className="text-[11px] font-semibold text-rose-200">
                    Taabo {exclusionBrushScope === 'block' ? 'Block kasta' : 'Plot kasta'} oo khariirada ku yaal
                  </span>
                </div>

                {exclusionBrushMode === 'exclude' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="font-bold text-[#F8FAFC] inline-flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-rose-400" />
                      <span>Magaca Gaarka ah:</span>
                    </label>
                    <input
                      type="text"
                      value={exclusionBrushSpecialName}
                      onChange={(e) => setExclusionBrushSpecialName(e.target.value)}
                      placeholder="Qor magaca gaarka ah (Masjidka, Ceelka, Waqf...)"
                      className="min-w-[220px] min-h-[38px] bg-[#0B1220] border border-rose-500/45 rounded-lg px-2.5 py-1 text-xs font-bold text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-rose-400"
                    />
                    <div className="flex flex-wrap items-center gap-1">
                      {SPECIAL_EXCLUSION_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setExclusionBrushSpecialName(preset)}
                          className={`min-h-[32px] px-2.5 py-1 rounded-md border text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                            exclusionBrushSpecialName === preset
                              ? 'bg-rose-600 text-white border-rose-500'
                              : 'bg-[#0B1220] text-[#CBD5E1] border-[#243449] hover:border-rose-400'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Contextual Zone Brush Bar */}
            {interactionTool === 'mark_zone' && (
              <div className="px-4 py-2.5 bg-[#0F1B2D] border-b border-[#243449] flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-[#10B981]">
                  Taabo Block kasta si aad ugu beddesho Zone:
                </span>
                {['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E'].map((z) => {
                  const zm = getZoneDisplayMeta(z);
                  return (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setActiveZoneBrush(z)}
                      className={`min-h-[34px] px-2.5 py-1 rounded-lg font-bold inline-flex items-center gap-1.5 border cursor-pointer ${
                        activeZoneBrush === z
                          ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                          : 'bg-[#0B1220] text-[#F8FAFC] border-[#243449]'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-xs"
                        style={{ backgroundColor: zm.colorHex }}
                      />
                      <span>{z}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Contextual Tier Brush Bar (Xulo Plot | Xulo Block | Sawir Gacanta) */}
            {interactionTool === 'mark_tier' && (
              <div className="px-4 py-2.5 bg-[#0F1B2D] border-b border-[#243449] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[#10B981]">
                    {tierBrushScope === 'freehand'
                      ? 'Ku sawir wareeg gacanta plots-ka:'
                      : `Taabo khariidadda (${
                          tierBrushScope === 'block' ? 'Xulo Block' : 'Xulo Plot'
                        }):`}
                  </span>
                  {(['tier_1_prime', 'tier_2_standard', 'tier_3_basic'] as AssetQualityTier[]).map(
                    (t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setActiveTierBrush(t)}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg font-bold inline-flex items-center gap-1.5 border cursor-pointer ${
                          activeTierBrush === t
                            ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                            : 'bg-[#0B1220] text-[#F8FAFC] border-[#243449]'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-xs"
                          style={{ backgroundColor: TIER_METADATA[t].fillHex }}
                        />
                        <span>{TIER_METADATA[t].code}</span>
                      </button>
                    )
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {(
                    [
                      { id: 'plot', label: 'Xulo Plot' },
                      { id: 'block', label: 'Xulo Block' },
                      { id: 'freehand', label: 'Sawir Gacanta' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTierBrushScope(opt.id)}
                      className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                        tierBrushScope === opt.id
                          ? 'bg-[#F8FAFC] text-[#030712] border-[#F8FAFC]'
                          : 'bg-[#0B1220] text-[#CBD5E1] border-[#243449]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Heir Spotlight / Manual Allocation Selector */}
            {(mapColorMode === 'heirs' || interactionTool === 'assign_heir') &&
              fairAllocation &&
              fairAllocation.heirAllocations.length > 0 && (
                <div className="px-4 py-2.5 bg-[#0B1220] border-b border-[#243449] flex items-center gap-1.5 overflow-x-auto">
                  <span className="text-[11px] font-bold text-[#94A3B8] mr-1 whitespace-nowrap shrink-0">
                    {interactionTool === 'assign_heir'
                      ? 'Dooro dhaxalaha:'
                      : 'Iftiimi dhaxalaha:'}
                  </span>

                  {interactionTool !== 'assign_heir' && (
                    <button
                      type="button"
                      onClick={() => setHighlightedHeirKey(null)}
                      className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        highlightedHeirKey === null
                          ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                          : 'bg-[#0F1B2D] text-[#CBD5E1] border-[#243449] hover:border-[#10B981]'
                      }`}
                    >
                      Dhammaan ({fairAllocation.totalFullPlots})
                    </button>
                  )}

                  {fairAllocation.heirAllocations.map((h) => {
                    const isSelected =
                      interactionTool === 'assign_heir'
                        ? selectedHeirKeyForBrush === h.heirKey
                        : highlightedHeirKey === h.heirKey;
                    return (
                      <button
                        key={h.heirKey}
                        type="button"
                        onClick={() => {
                          if (interactionTool === 'assign_heir') {
                            setSelectedHeirKeyForBrush(h.heirKey);
                          } else {
                            setHighlightedHeirKey(
                              highlightedHeirKey === h.heirKey ? null : h.heirKey
                            );
                          }
                        }}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          isSelected
                            ? 'bg-[#F8FAFC] text-[#030712] border-[#F8FAFC]'
                            : 'bg-[#0F1B2D] text-[#F8FAFC] border-[#243449] hover:border-[#10B981]'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: h.colorHex }}
                        />
                        <span className="truncate max-w-[130px]">{h.personName}</span>
                        <span className="font-mono-numbers tabular-nums opacity-80">
                          ({formatPlotQtyCompact(h.effectiveTotalPlotsReceived)})
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

            {/* Interactive Dark Cadastral SVG Map Box */}
            <div className="relative bg-[#07101E] h-[440px] sm:h-[560px] touch-none select-none overflow-hidden">
              {/* DRAGGABLE HIDE/SHOW LEGENDS CARD ON CAD CANVAS */}
              {subdivisionResult && mapGeometry && cadLegendItems.length > 0 && (
                <div
                  style={{ left: `${cadLegendPos.x}px`, top: `${cadLegendPos.y}px` }}
                  className="absolute z-20 rounded-xl bg-[#0B1220]/94 backdrop-blur-md border border-[#243449] p-2.5 shadow-xl min-w-[168px] max-w-[235px] text-[#F8FAFC]"
                >
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      cadLegendDragRef.current = {
                        active: true,
                        pointerId: e.pointerId,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        startX: cadLegendPos.x,
                        startY: cadLegendPos.y,
                        moved: false,
                      };
                    }}
                    onPointerMove={(e) => {
                      const st = cadLegendDragRef.current;
                      if (!st || !st.active || st.pointerId !== e.pointerId) return;
                      const dx = e.clientX - st.startClientX;
                      const dy = e.clientY - st.startClientY;
                      if (Math.hypot(dx, dy) > 5) st.moved = true;
                      if (st.moved) {
                        setCadLegendPos({
                          x: Math.max(8, st.startX + dx),
                          y: Math.max(8, st.startY + dy),
                        });
                      }
                    }}
                    onPointerUp={(e) => {
                      const st = cadLegendDragRef.current;
                      if (!st || st.pointerId !== e.pointerId) return;
                      cadLegendDragRef.current = null;
                      try {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      } catch {
                        // Ignore
                      }
                      if (!st.moved) {
                        setIsCadLegendsExpanded((prev) => !prev);
                      }
                    }}
                    title="Jiid meel kasta ama taabo si aad u qariso / u muujiso Sumadaha"
                    className="w-full flex items-center justify-between gap-2 text-xs font-extrabold touch-none select-none cursor-grab active:cursor-grabbing"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <GripHorizontal className="w-3.5 h-3.5 text-[#10B981]" />
                      <span>Sumadaha</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-[#94A3B8] tabular-nums">
                        {cadLegendItems.filter((it) => !cadHiddenHeirKeys[it.key]).length}/
                        {cadLegendItems.length}
                      </span>
                      {isCadLegendsExpanded ? (
                        <EyeOff className="w-3.5 h-3.5 text-[#94A3B8]" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-[#10B981]" />
                      )}
                    </span>
                  </button>

                  {isCadLegendsExpanded && (
                    <div className="mt-2 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between gap-2 pb-1 border-b border-[#243449] text-[10px]">
                        <button
                          type="button"
                          onClick={() => setCadHiddenHeirKeys({})}
                          className="font-bold text-[#10B981] hover:underline cursor-pointer"
                        >
                          Dooro Dhammaan
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next: Record<string, boolean> = {};
                            cadLegendItems.forEach((it) => {
                              next[it.key] = true;
                            });
                            setCadHiddenHeirKeys(next);
                          }}
                          className="font-semibold text-[#94A3B8] hover:text-[#F8FAFC] hover:underline cursor-pointer"
                        >
                          Ka Saar
                        </button>
                      </div>

                      <div className="max-h-[185px] sm:max-h-[225px] overflow-y-auto pr-0.5 space-y-1">
                        {cadLegendItems.map((it) => {
                          const isChecked = !cadHiddenHeirKeys[it.key];
                          return (
                            <label
                              key={it.key}
                              className="w-full flex items-center justify-between gap-2 font-semibold rounded-md px-1 py-0.5 cursor-pointer select-none hover:bg-white/5"
                            >
                              <span className="inline-flex items-center gap-1.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    setCadHiddenHeirKeys((prev) => ({
                                      ...prev,
                                      [it.key]: !prev[it.key],
                                    }));
                                    if (mapColorMode !== 'heirs' && !it.key.startsWith('__')) {
                                      setMapColorMode('heirs');
                                    }
                                  }}
                                  className="w-3.5 h-3.5 rounded accent-[#10B981] cursor-pointer shrink-0"
                                />
                                <span
                                  style={{ backgroundColor: it.color }}
                                  className="w-3 h-2.5 rounded-xs border border-black/40 shrink-0"
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
                              <span className="text-[10px] text-[#94A3B8] tabular-nums shrink-0">
                                {it.count}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* FLOATING THUMB-ZONE MAP ACTION CONTROLS (44x44px hitboxes) */}
              {subdivisionResult && mapGeometry && (
                <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
                  <div className="flex flex-col bg-[#0B1220]/92 backdrop-blur-md border border-[#243449] rounded-2xl p-1 shadow-xl gap-1">
                    <button
                      type="button"
                      onClick={() => handleZoom(1.35)}
                      className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-[#0F1B2D] flex items-center justify-center text-[#F8FAFC] cursor-pointer"
                      aria-label="Weyneey khariirada"
                      title="Weyneey (+)"
                    >
                      <ZoomIn className="w-4 h-4 text-[#10B981]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleZoom(1 / 1.35)}
                      className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-[#0F1B2D] flex items-center justify-center text-[#F8FAFC] cursor-pointer"
                      aria-label="Yaree khariirada"
                      title="Yaree (-)"
                    >
                      <ZoomOut className="w-4 h-4 text-[#F8FAFC]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => mapGeometry && setViewBox(mapGeometry.fitBox)}
                      className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-[#0F1B2D] flex items-center justify-center text-[#F8FAFC] cursor-pointer"
                      aria-label="Muuji dhammaan khariirada"
                      title="Muuji Dhammaan"
                    >
                      <Maximize2 className="w-4 h-4 text-[#10B981]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMapLayerPopover((prev) => !prev)}
                      className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
                        showMapLayerPopover
                          ? 'bg-[#10B981] text-[#030712]'
                          : 'hover:bg-[#0F1B2D] text-[#F8FAFC]'
                      }`}
                      aria-label="Lakabyada khariirada"
                      title="Lakabyada & Qoraallada Khariirada"
                    >
                      <Layers className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Floating Map Overlays Popover */}
                  {showMapLayerPopover && (
                    <div className="bg-[#0B1220]/96 backdrop-blur-md border border-[#243449] rounded-2xl p-3.5 shadow-2xl w-64 space-y-2.5 text-xs text-[#F8FAFC]">
                      <div className="flex items-center justify-between pb-1.5 border-b border-[#243449]">
                        <span className="font-extrabold text-[#10B981]">Lakabyada Khariirada</span>
                        <button
                          type="button"
                          onClick={() => setShowMapLayerPopover(false)}
                          className="text-[#94A3B8] hover:text-[#F8FAFC] p-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showBlockLabels}
                          onChange={(e) => setShowBlockLabels(e.target.checked)}
                          className="accent-[#10B981]"
                        />
                        <span>Block &amp; Zone IDs</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showAllPlotLabels}
                          onChange={(e) => setShowAllPlotLabels(e.target.checked)}
                          className="accent-[#10B981]"
                        />
                        <span>Plot IDs</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showHeirLabelsOnPlots}
                          onChange={(e) => setShowHeirLabelsOnPlots(e.target.checked)}
                          className="accent-[#10B981]"
                        />
                        <span>Magaca Dhaxalaha</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none text-rose-300 font-semibold">
                        <input
                          type="checkbox"
                          checked={showExcludedSpecialNames}
                          onChange={(e) => setShowExcludedSpecialNames(e.target.checked)}
                          className="accent-rose-500"
                        />
                        <span>Magacyada Gaarka ah (Reeban)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none text-sky-300 font-semibold">
                        <input
                          type="checkbox"
                          checked={showWadiOverlay}
                          onChange={(e) => setShowWadiOverlay(e.target.checked)}
                          className="accent-sky-400"
                        />
                        <span>Muuji Dooxa (Wadi)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showQualityDots}
                          onChange={(e) => setShowQualityDots(e.target.checked)}
                          className="accent-[#10B981]"
                        />
                        <span>Calaamadda Tayada</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none text-[#10B981] font-semibold">
                        <input
                          type="checkbox"
                          checked={showOutsidePlotsOverlay}
                          onChange={(e) => setShowOutsidePlotsOverlay(e.target.checked)}
                          className="accent-[#10B981]"
                        />
                        <span>Muuji Qaybta Go&apos;an &amp; Dibadda</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {!subdivisionResult || !mapGeometry ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 sm:p-6 text-center bg-[#07101E] overflow-y-auto">
                  <div className="max-w-lg w-full bg-[#0B1220] border border-[#243449] rounded-2xl p-5 sm:p-6 space-y-4 text-left shadow-xl">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-xl bg-[#10B981]/15 border border-[#10B981]/30 text-[#10B981] flex items-center justify-center shrink-0">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-mono-numbers tabular-nums font-bold text-[#10B981]">
                          {activeCaseMeta
                            ? `${activeCaseMeta.referenceNumber} · ${activeCaseMeta.caseName}`
                            : 'Kiis Bilaa Khariidad ah'}
                        </div>
                        <h3 className="text-sm sm:text-base font-extrabold text-[#F8FAFC] mt-0.5">
                          Kiiskan Weli Khariidad Dhul Laguma Xidhin
                        </h3>
                        <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                          Xogta nashqadda beerta waxaa laga sameeyaa ama laga soo geliyaa oo keliya badhanka <strong className="text-[#10B981]">&ldquo;+&rdquo;</strong> ee bogga <strong className="text-[#F8FAFC]">Khariidad</strong>.
                        </p>
                      </div>
                    </div>

                    {onBackToInteractiveMap && (
                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={onBackToInteractiveMap}
                          className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-4 py-2 text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <MapPin className="w-4 h-4 shrink-0" />
                          <span>Tag Khariidadda (+)</span>
                        </button>
                      </div>
                    )}

                    {onExplicitLinkGeometryFromCase &&
                      savedCasesForGeometryLink.filter(
                        (c) =>
                          c.hasMapGeometry &&
                          c.landSubdivisionSnapshot &&
                          c.id !== activeCaseMeta?.caseId
                      ).length > 0 && (
                        <div className="pt-3 border-t border-[#243449] space-y-2.5 text-xs">
                          <label className="block font-bold text-[#F8FAFC]">
                            Ama ka koobiyeey geometry kiis kale (iyadoo la xaqiijinayo):
                          </label>
                          <select
                            value={selectedSourceCaseId}
                            onChange={(e) => {
                              setSelectedSourceCaseId(e.target.value);
                              setConfirmExplicitCaseGeometryCopy(false);
                            }}
                            className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                          >
                            <option value="">— Dooro kiis leh khariidad —</option>
                            {savedCasesForGeometryLink
                              .filter(
                                (c) =>
                                  c.hasMapGeometry &&
                                  c.landSubdivisionSnapshot &&
                                  c.id !== activeCaseMeta?.caseId
                              )
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.referenceNumber} — {c.caseName} ({c.blocksCount || 0} Blk ·{' '}
                                  {c.fullPlotsCount || 0} Plot)
                                </option>
                              ))}
                          </select>

                          {selectedSourceCaseId && (
                            <div className="space-y-2.5 pt-1">
                              <label className="flex items-start gap-2 text-[11px] text-[#CBD5E1] cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={confirmExplicitCaseGeometryCopy}
                                  onChange={(e) =>
                                    setConfirmExplicitCaseGeometryCopy(e.target.checked)
                                  }
                                  className="mt-0.5 rounded border-[#243449] accent-[#10B981]"
                                />
                                <span>
                                  Waxaan xaqiijinayaa in nuqul madax-bannaan oo geometry-gan ah lagu xidho kiiskan hadda furan.
                                </span>
                              </label>
                              <button
                                type="button"
                                disabled={!confirmExplicitCaseGeometryCopy}
                                onClick={() => {
                                  const src = savedCasesForGeometryLink.find(
                                    (c) => c.id === selectedSourceCaseId
                                  );
                                  if (src) {
                                    onExplicitLinkGeometryFromCase(src);
                                    setSelectedSourceCaseId('');
                                    setConfirmExplicitCaseGeometryCopy(false);
                                  }
                                }}
                                className="min-h-[42px] px-4 py-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] font-extrabold disabled:opacity-40 cursor-pointer"
                              >
                                Ku Xidh Geometry-ga La Xaqiijiyey
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              ) : (
                <svg
                  ref={svgRef}
                  viewBox={`${activeVb.x} ${activeVb.y} ${activeVb.w} ${activeVb.h}`}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className={`w-full h-full block ${
                    interactionTool === 'inspect'
                      ? 'cursor-grab active:cursor-grabbing'
                      : 'cursor-crosshair'
                  }`}
                  role="img"
                  aria-label="Khariidadda Blocks, Plots, Half Plots, Zones iyo Saamiyada Dhaxlayaasha"
                >
                  <defs>
                    <clipPath id="farmBoundaryClip">
                      <polygon points={mapGeometry.toPtsStr(subdivisionResult.bring)} />
                    </clipPath>
                    <pattern
                      id="partialHatchPattern"
                      width="3.2"
                      height="3.2"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(45)"
                    >
                      <line
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="3.2"
                        stroke="#fb7185"
                        strokeWidth="0.7"
                      />
                    </pattern>
                    <pattern
                      id="validHalfPlotPattern"
                      width="3.5"
                      height="3.5"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(-45)"
                    >
                      <rect width="3.5" height="3.5" fill="#065f46" />
                      <line
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="3.5"
                        stroke="#34d399"
                        strokeWidth="1.2"
                      />
                    </pattern>
                    <pattern
                      id="sharedPlotPattern"
                      width="4"
                      height="4"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(-45)"
                    >
                      <rect width="4" height="4" fill="#fef3c7" />
                      <line
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="4"
                        stroke="#059669"
                        strokeWidth="1.4"
                      />
                    </pattern>
                    <pattern
                      id="wadiCrossPattern"
                      width="5"
                      height="5"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(30)"
                    >
                      <line
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="5"
                        stroke="#38bdf8"
                        strokeWidth="1.35"
                      />
                    </pattern>
                    <pattern
                      id="excludedPlotHatchPattern"
                      width="4.2"
                      height="4.2"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(45)"
                    >
                      <rect width="4.2" height="4.2" fill="#4c0519" />
                      <line
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="4.2"
                        stroke="#fb7185"
                        strokeWidth="1.45"
                      />
                    </pattern>
                  </defs>

                  {/* Road / Open Farm Interior Fill (Dark Slate Cadastral Terrain) */}
                  <polygon
                    points={mapGeometry.toPtsStr(subdivisionResult.bring)}
                    fill="#111E33"
                    stroke="none"
                  />

                  {/* Blocks & Plots */}
                  {subdivisionResult.blocks.map((b) => {
                    const bTier = subdivisionState.blockTiers[b.id] || 'tier_1_prime';
                    const bZone =
                      subdivisionState.blockMetadata[b.id]?.zoneId ||
                      subdivisionState.blockZones[b.id] ||
                      'Zone A';
                    const bZoneMeta = getZoneDisplayMeta(bZone);
                    const bExcl = getEffectiveBlockExclusion(b.id, subdivisionState.blockMetadata);
                    const bCx = mapGeometry.toX(b.centerUtm);
                    const bCy = mapGeometry.toY(b.centerUtm);

                    return (
                      <g key={b.id}>
                        {b.plots.map((q) => {
                          if (!isPlotVisibleInCadLegends(q)) {
                            return null;
                          }
                          const hp =
                            q.halfPlotValidation || subdivisionResult.plotValidations?.[q.id];
                          const isSelectedPlot = inspectedPlotId === q.id;
                          const px = mapGeometry.toX(q.centerUtm);
                          const py = mapGeometry.toY(q.centerUtm);

                          // 1. NON-FULL PLOTS: Outside OR Boundary-Clipped (Half Plot Valid / Invalid / Review / Insufficient)
                          if (!q.full) {
                            const valStatus = hp?.validationStatus || 'half_plot_invalid';
                            const statusMeta = HALF_PLOT_STATUS_METADATA[valStatus];

                            if (valStatus === 'full_outside') {
                              if (!showOutsidePlotsOverlay && mapColorMode !== 'half_plots') {
                                return null;
                              }
                              return (
                                <polygon
                                  key={q.id}
                                  data-plot-id={q.id}
                                  data-block-id={b.id}
                                  points={mapGeometry.toPtsStr(q.rect)}
                                  fill="#1e293b"
                                  fillOpacity={mapColorMode === 'half_plots' ? 0.5 : 0.28}
                                  stroke={isSelectedPlot ? '#fbbf24' : '#475569'}
                                  strokeWidth={isSelectedPlot ? 2.2 : 0.6}
                                  strokeDasharray="2.5 2"
                                  vectorEffect="non-scaling-stroke"
                                >
                                  <title>{`${q.id} (Plot #${q.no}) · Dibadda oo dhan · Half Plot la filayey: ${hp?.expectedRule.label || '-'}`}</title>
                                </polygon>
                              );
                            }

                            const insideRings =
                              hp && hp.insideRingsUtm.length > 0 ? hp.insideRingsUtm : [];
                            const outsideRings =
                              hp && hp.outsideRingsUtm.length > 0 ? hp.outsideRingsUtm : [];

                            return (
                              <g key={q.id}>
                                {/* Outside Portion */}
                                {(showOutsidePlotsOverlay || mapColorMode === 'half_plots') &&
                                  (outsideRings.length > 0 ? (
                                    outsideRings.map((oring, oi) => (
                                      <polygon
                                        key={`out-${q.id}-${oi}`}
                                        data-plot-id={q.id}
                                        data-block-id={b.id}
                                        points={mapGeometry.toPtsStr(oring)}
                                        fill="url(#partialHatchPattern)"
                                        fillOpacity={0.65}
                                        stroke="#fb7185"
                                        strokeWidth={0.5}
                                        strokeDasharray="2 1.5"
                                        vectorEffect="non-scaling-stroke"
                                      >
                                        <title>{`${q.id} · Qaybta dibadda ku dhacday (${hp?.outsideAreaSqM.toFixed(1)} m²)`}</title>
                                      </polygon>
                                    ))
                                  ) : (
                                    <polygon
                                      data-plot-id={q.id}
                                      data-block-id={b.id}
                                      points={mapGeometry.toPtsStr(q.rect)}
                                      fill="url(#partialHatchPattern)"
                                      fillOpacity={0.35}
                                      stroke="#64748b"
                                      strokeWidth={0.45}
                                      strokeDasharray="2 2"
                                      vectorEffect="non-scaling-stroke"
                                    />
                                  ))}

                                {/* Inside Clipped Portion */}
                                {insideRings.length > 0 ? (
                                  insideRings.map((iring, ii) => (
                                    <polygon
                                      key={`in-${q.id}-${ii}`}
                                      data-plot-id={q.id}
                                      data-block-id={b.id}
                                      points={mapGeometry.toPtsStr(iring)}
                                      fill={
                                        valStatus === 'half_plot_valid'
                                          ? 'url(#validHalfPlotPattern)'
                                          : statusMeta.fillHex
                                      }
                                      fillOpacity={
                                        mapColorMode === 'half_plots'
                                          ? 0.9
                                          : valStatus === 'half_plot_valid'
                                          ? 0.86
                                          : 0.6
                                      }
                                      stroke={isSelectedPlot ? '#fbbf24' : statusMeta.strokeHex}
                                      strokeWidth={isSelectedPlot ? 2.4 : 1.1}
                                      vectorEffect="non-scaling-stroke"
                                    >
                                      <title>{`${q.id} (Plot #${q.no}) · ${statusMeta.labelSomali} · La filayey: ${hp?.expectedRule.label} · Gudaha: ${hp?.insideAreaSqM.toFixed(1)} m² · ${hp?.reasonSomali}`}</title>
                                    </polygon>
                                  ))
                                ) : (
                                  <polygon
                                    clipPath="url(#farmBoundaryClip)"
                                    data-plot-id={q.id}
                                    data-block-id={b.id}
                                    points={mapGeometry.toPtsStr(q.rect)}
                                    fill={statusMeta.fillHex}
                                    fillOpacity={0.65}
                                    stroke={isSelectedPlot ? '#fbbf24' : statusMeta.strokeHex}
                                    strokeWidth={isSelectedPlot ? 2.2 : 0.95}
                                    vectorEffect="non-scaling-stroke"
                                  >
                                    <title>{`${q.id} · ${statusMeta.labelSomali}`}</title>
                                  </polygon>
                                )}

                                {/* Exact HTML Half-Plots (`-H1`, `-H2` · 18×12m or 9×24m · HALF_FULL) */}
                                {q.htmlHalves && q.htmlHalves.length > 0 ? (
                                  q.htmlHalves.map((h) => {
                                    const hCx = mapGeometry.toX(h.centerUtm);
                                    const hCy = mapGeometry.toY(h.centerUtm);
                                    const hShort = h.id.split('-').slice(-2).join('-');
                                    return (
                                      <g key={h.id}>
                                        <polygon
                                          data-plot-id={q.id}
                                          data-block-id={b.id}
                                          points={mapGeometry.toPtsStr(h.rect)}
                                          fill={h.counted ? '#0d9488' : 'none'}
                                          fillOpacity={h.counted ? 0.85 : 0}
                                          stroke={
                                            isSelectedPlot
                                              ? '#fbbf24'
                                              : h.counted
                                              ? '#5eead4'
                                              : '#f59e0b'
                                          }
                                          strokeWidth={isSelectedPlot ? 2.2 : h.counted ? 1.1 : 0.65}
                                          strokeDasharray={h.counted ? undefined : '2.2 1.8'}
                                          vectorEffect="non-scaling-stroke"
                                        >
                                          <title>{`${h.id} · ${
                                            h.counted ? 'HALF_FULL (La tiriyey)' : h.status
                                          } · ${h.hl}×${h.hw} m (${h.area.toFixed(1)} m²)${
                                            h.specialAreaName ? ` · Aag: ${h.specialAreaName}` : ''
                                          }`}</title>
                                        </polygon>
                                        {h.counted &&
                                          (mapColorMode === 'half_plots' || activeVb.w < 260) && (
                                            <text
                                              x={hCx}
                                              y={hCy}
                                              fontSize={2.3}
                                              fontWeight={800}
                                              textAnchor="middle"
                                              dominantBaseline="central"
                                              fill="#ffffff"
                                              stroke="#030712"
                                              strokeWidth={0.5}
                                              paintOrder="stroke"
                                              pointerEvents="none"
                                            >
                                              {hShort}
                                            </text>
                                          )}
                                      </g>
                                    );
                                  })
                                ) : (
                                  <>
                                    {hp?.inscribedHalfPlotRectUtm &&
                                      valStatus === 'half_plot_valid' && (
                                        <polygon
                                          data-plot-id={q.id}
                                          data-block-id={b.id}
                                          points={mapGeometry.toPtsStr(hp.inscribedHalfPlotRectUtm)}
                                          fill="#10B981"
                                          fillOpacity={0.35}
                                          stroke="#6ee7b7"
                                          strokeWidth={1.4}
                                          vectorEffect="non-scaling-stroke"
                                        >
                                          <title>{`${q.id} · Half Plot Sax ah: ${hp.expectedRule.label} (216 m²)`}</title>
                                        </polygon>
                                      )}

                                    {(mapColorMode === 'half_plots' || activeVb.w < 240) && (
                                      <text
                                        x={px}
                                        y={py}
                                        fontSize={2.45}
                                        fontWeight={800}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        fill="#ffffff"
                                        stroke="#030712"
                                        strokeWidth={0.55}
                                        paintOrder="stroke"
                                        pointerEvents="none"
                                      >
                                        {valStatus === 'half_plot_valid'
                                          ? `P${q.no}·½(${hp?.expectedRule.ruleCode})`
                                          : `P${q.no}·${hp ? Math.round(hp.insideAreaSqM) : 0}m²`}
                                      </text>
                                    )}
                                  </>
                                )}
                              </g>
                            );
                          }

                          // 2. FULL INSIDE PLOTS (Divisible OR Excluded from Division)
                          const pTier = getEffectivePlotTier(
                            q,
                            subdivisionState.blockTiers,
                            subdivisionState.plotTierOverrides
                          );
                          const pZone = getEffectivePlotZone(
                            q,
                            subdivisionState.blockZones,
                            subdivisionState.plotMetadata,
                            subdivisionState.blockMetadata
                          );
                          const pZoneMeta = getZoneDisplayMeta(pZone);
                          const pMeta = getEffectivePlotMetadata(q, subdivisionState.plotMetadata);
                          const pExcl = getEffectivePlotExclusion(
                            q,
                            subdivisionState.plotMetadata,
                            subdivisionState.blockMetadata
                          );
                          const assign = fairAllocation?.plotAssignments[q.id];

                          let fillStyle = '#1e293b';
                          let fillOpacity = 0.88;
                          let strokeColor = '#475569';
                          let strokeW = 0.7;
                          let strokeDash: string | undefined = undefined;

                          if (pExcl.isExcluded && mapColorMode !== 'half_plots') {
                            fillStyle = 'url(#excludedPlotHatchPattern)';
                            fillOpacity = mapColorMode === 'excluded' ? 0.98 : 0.92;
                            strokeColor = '#fb7185';
                            strokeW = 1.3;
                            strokeDash = '2.6 1.4';
                          } else if (mapColorMode === 'excluded') {
                            fillStyle = '#1e293b';
                            fillOpacity = 0.35;
                            strokeColor = '#334155';
                            strokeW = 0.5;
                          } else if (mapColorMode === 'half_plots') {
                            fillStyle = HALF_PLOT_STATUS_METADATA.full_inside.fillHex;
                            fillOpacity = 0.8;
                            strokeColor = '#030712';
                          } else if (mapColorMode === 'zones') {
                            fillStyle = pZoneMeta.colorHex;
                            fillOpacity = 0.82;
                            strokeColor = '#030712';
                          } else if (mapColorMode === 'tiers') {
                            fillStyle = TIER_METADATA[pTier].fillHex;
                            fillOpacity = 0.82;
                            strokeColor = '#030712';
                          } else if (assign) {
                            if (assign.assignmentType === 'shared_fractional') {
                              fillStyle = 'url(#sharedPlotPattern)';
                              fillOpacity = 0.95;
                              strokeColor = '#f59e0b';
                              strokeW = 1.15;
                            } else if (assign.ownerColorHex) {
                              fillStyle = assign.ownerColorHex;
                              fillOpacity = 0.86;
                              strokeColor = '#030712';
                            } else if (assign.unassignedReason === 'withheld_jajab') {
                              fillStyle = '#475569';
                              fillOpacity = 0.72;
                              strokeColor = '#94a3b8';
                              strokeDash = '2 1.5';
                            }
                          }

                          if (highlightedHeirKey && mapColorMode === 'heirs') {
                            const matchesSole = assign?.ownerHeirKey === highlightedHeirKey;
                            const matchesShared = assign?.coOwners?.some(
                              (c) => c.heirKey === highlightedHeirKey
                            );
                            if (!matchesSole && !matchesShared) {
                              fillOpacity = pExcl.isExcluded ? 0.35 : 0.16;
                              strokeColor = '#334155';
                            } else {
                              fillOpacity = 0.96;
                              strokeColor = '#ffffff';
                              strokeW = 1.5;
                            }
                          }

                          if (isSelectedPlot) {
                            strokeColor = '#fbbf24';
                            strokeW = 2.5;
                            strokeDash = undefined;
                          }

                          const ownerSummary = pExcl.isExcluded
                            ? `LAGA REEBAY QAYBINTA: ${pExcl.specialName}`
                            : assign?.assignmentType === 'shared_fractional'
                            ? `Wadaag: ${assign.coOwners
                                ?.map((c) => `${c.personName} (${c.sharePercentageOfPlot}%)`)
                                .join(' + ')}`
                            : assign?.ownerPersonName
                            ? `${assign.ownerPersonName} (${assign.ownerRoleSomali})`
                            : 'Bannaan';

                          const hasWadiMark =
                            showWadiOverlay &&
                            (pMeta.wadiStatus === 'cuts_through' ||
                              pMeta.wadiStatus === 'partial' ||
                              pMeta.wadiStatus === 'nearby');

                          return (
                            <g key={q.id}>
                              <polygon
                                data-plot-id={q.id}
                                data-block-id={b.id}
                                points={mapGeometry.toPtsStr(q.rect)}
                                fill={fillStyle}
                                fillOpacity={fillOpacity}
                                stroke={strokeColor}
                                strokeWidth={strokeW}
                                strokeDasharray={strokeDash}
                                vectorEffect="non-scaling-stroke"
                              >
                                <title>{`${q.id} (Plot #${q.no}) · ${
                                  pExcl.isExcluded ? 'Laga Reebay Dhaxalka' : 'La Qaybinayo'
                                } · ${pZone} · ${TIER_METADATA[pTier].shortSomali} · ${ownerSummary}`}</title>
                              </polygon>

                              {/* Wadi Overlay on Affected Plots */}
                              {hasWadiMark && (
                                <polygon
                                  points={mapGeometry.toPtsStr(q.rect)}
                                  fill={
                                    pMeta.wadiStatus === 'nearby'
                                      ? 'none'
                                      : 'url(#wadiCrossPattern)'
                                  }
                                  stroke="#38bdf8"
                                  strokeWidth={pMeta.wadiStatus === 'cuts_through' ? 1.6 : 1.05}
                                  strokeDasharray={
                                    pMeta.wadiStatus === 'nearby' ? '2 2' : undefined
                                  }
                                  vectorEffect="non-scaling-stroke"
                                  pointerEvents="none"
                                />
                              )}

                              {/* Site Quality Indicator Dot */}
                              {showQualityDots && pMeta.siteQuality !== 'unverified' && (
                                <circle
                                  cx={px}
                                  cy={py}
                                  r={2.1}
                                  fill={SITE_QUALITY_METADATA[pMeta.siteQuality].colorHex}
                                  stroke="#030712"
                                  strokeWidth={0.55}
                                  pointerEvents="none"
                                />
                              )}
                            </g>
                          );
                        })}

                        {/* Block Outline */}
                        <polygon
                          points={mapGeometry.toPtsStr(b.rect)}
                          clipPath={
                            b.complete || mapColorMode === 'half_plots'
                              ? undefined
                              : 'url(#farmBoundaryClip)'
                          }
                          fill="none"
                          stroke={
                            bExcl.isExcluded
                              ? '#fb7185'
                              : mapColorMode === 'zones'
                              ? bZoneMeta.colorHex
                              : mapColorMode === 'tiers'
                              ? TIER_METADATA[bTier].strokeHex
                              : b.complete
                              ? '#e2e8f0'
                              : '#f87171'
                          }
                          strokeWidth={bExcl.isExcluded ? 2.2 : 1.4}
                          strokeDasharray={
                            bExcl.isExcluded
                              ? '6 2.5'
                              : b.complete
                              ? undefined
                              : '5 3'
                          }
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="none"
                        />

                        {/* Plot Labels & Excluded Plot Special Name Callouts */}
                        {b.plots
                          .filter((q) => q.full && isPlotVisibleInCadLegends(q))
                          .map((q) => {
                            const pExcl = getEffectivePlotExclusion(
                              q,
                              subdivisionState.plotMetadata,
                              subdivisionState.blockMetadata
                            );
                            const shouldRenderIndividualExcludedLabel =
                              showExcludedSpecialNames &&
                              pExcl.isExcluded &&
                              (pExcl.scope === 'plot' || !showBlockLabels || activeVb.w < 210);
                            const shouldRenderStandardLabel =
                              showAllPlotLabels || showHeirLabelsOnPlots || activeVb.w < 190;

                            if (!shouldRenderIndividualExcludedLabel && !shouldRenderStandardLabel) {
                              return null;
                            }

                            const px = mapGeometry.toX(q.centerUtm);
                            const py = mapGeometry.toY(q.centerUtm);
                            const shortPlotCode = q.id.startsWith(`${q.block}-`)
                              ? q.id.slice(q.block.length + 1)
                              : q.id;
                            const assign = fairAllocation?.plotAssignments[q.id];

                            if (pExcl.isExcluded && showExcludedSpecialNames) {
                              const specLabel =
                                pExcl.specialName.length > 18
                                  ? `${pExcl.specialName.slice(0, 17)}…`
                                  : pExcl.specialName;
                              return (
                                <g key={`lbl-excl-${q.id}`} pointerEvents="none">
                                  <text
                                    x={px}
                                    y={py - 1.6}
                                    fontSize={2.5}
                                    fontWeight={800}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fill="#fda4af"
                                    stroke="#030712"
                                    strokeWidth={0.7}
                                    paintOrder="stroke"
                                  >
                                    {shortPlotCode} · REEBAN
                                  </text>
                                  <text
                                    x={px}
                                    y={py + 2.0}
                                    fontSize={2.6}
                                    fontWeight={800}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fill="#ffffff"
                                    stroke="#881337"
                                    strokeWidth={0.75}
                                    paintOrder="stroke"
                                  >
                                    {specLabel}
                                  </text>
                                </g>
                              );
                            }

                            const shortOwner =
                              assign?.assignmentType === 'shared_fractional'
                                ? 'Wadaag'
                                : assign?.ownerPersonName
                                ? assign.ownerPersonName.split(' ')[0]
                                : '';

                            return (
                              <g key={`lbl-${q.id}`} pointerEvents="none">
                                <text
                                  x={px}
                                  y={showHeirLabelsOnPlots && shortOwner ? py - 1.8 : py}
                                  fontSize={2.8}
                                  fontWeight={700}
                                  textAnchor="middle"
                                  dominantBaseline="central"
                                  fill="#ffffff"
                                  stroke="#030712"
                                  strokeWidth={0.5}
                                  paintOrder="stroke"
                                >
                                  {shortPlotCode}
                                </text>
                                {showHeirLabelsOnPlots && shortOwner && (
                                  <text
                                    x={px}
                                    y={py + 2.2}
                                    fontSize={2.4}
                                    fontWeight={600}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fill="#fde047"
                                    stroke="#030712"
                                    strokeWidth={0.45}
                                    paintOrder="stroke"
                                  >
                                    {shortOwner}
                                  </text>
                                )}
                              </g>
                            );
                          })}

                        {/* Block + Zone / Excluded Special Name Center Label */}
                        {(showBlockLabels || (bExcl.isExcluded && showExcludedSpecialNames)) && (
                          <g pointerEvents="none">
                            {bExcl.isExcluded ? (
                              <>
                                <text
                                  x={bCx}
                                  y={bCy - Math.max(2.2, Math.min(4.8, activeVb.w * 0.011))}
                                  fontSize={Math.max(3.6, Math.min(8.2, activeVb.w * 0.019))}
                                  fontWeight={900}
                                  textAnchor="middle"
                                  dominantBaseline="central"
                                  fill="#fda4af"
                                  stroke="#030712"
                                  strokeWidth={1.3}
                                  paintOrder="stroke"
                                >
                                  {`${b.id} — LAGA REEBAY`}
                                </text>
                                <text
                                  x={bCx}
                                  y={bCy + Math.max(2.6, Math.min(5.4, activeVb.w * 0.013))}
                                  fontSize={Math.max(3.8, Math.min(8.6, activeVb.w * 0.02))}
                                  fontWeight={900}
                                  textAnchor="middle"
                                  dominantBaseline="central"
                                  fill="#ffffff"
                                  stroke="#881337"
                                  strokeWidth={1.2}
                                  paintOrder="stroke"
                                >
                                  {bExcl.specialName}
                                </text>
                              </>
                            ) : (
                              <text
                                x={bCx}
                                y={bCy}
                                fontSize={Math.max(4, Math.min(9.2, activeVb.w * 0.021))}
                                fontWeight={800}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fill="#F8FAFC"
                                stroke="#030712"
                                strokeWidth={1.25}
                                paintOrder="stroke"
                              >
                                {mapColorMode === 'half_plots'
                                  ? `${b.id} (${b.nf}F/${b.validHalfPlotsInBlock || 0}½)`
                                  : `${b.id} · ${bZone.replace('Zone ', 'Z-')}`}
                              </text>
                            )}
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Uploaded GIS Wadi Stream / Polygon Layer */}
                  {showWadiOverlay &&
                    mapGeometry.projectedWadis.map((w, idx) =>
                      w.type === 'Polygon' ? (
                        <polygon
                          key={`wadi-poly-${idx}`}
                          points={mapGeometry.toPtsStr(w.ptsUtm)}
                          fill="#0284c7"
                          fillOpacity={0.3}
                          stroke="#38bdf8"
                          strokeWidth={1.8}
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="none"
                        />
                      ) : (
                        <polyline
                          key={`wadi-line-${idx}`}
                          points={mapGeometry.toPtsStr(w.ptsUtm)}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth={2.6}
                          strokeDasharray="6 3"
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="none"
                        />
                      )
                    )}

                  {/* Sample Reference Block Overlay */}
                  {subdivisionResult.sample && !subdivisionResult.sample.isAutoDerived && (
                    <polygon
                      points={mapGeometry.toPtsStr(subdivisionResult.sample.ring)}
                      fill="#f97316"
                      fillOpacity={0.18}
                      stroke="#fb923c"
                      strokeWidth={1.6}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  )}

                  {/* Special Areas (`Aag gaar ah` — purple `#7c3aed` overlay & centered label matching HTML) */}
                  {subdivisionResult.specialAreas &&
                    subdivisionResult.specialAreas.map((sa, idx) => {
                      const cx =
                        sa.ringUtm.reduce((s, q) => s + mapGeometry.toX(q), 0) /
                        Math.max(1, sa.ringUtm.length);
                      const cy =
                        sa.ringUtm.reduce((s, q) => s + mapGeometry.toY(q), 0) /
                        Math.max(1, sa.ringUtm.length);
                      return (
                        <g key={`special-area-${idx}`} pointerEvents="none">
                          <polygon
                            points={mapGeometry.toPtsStr(sa.ringUtm)}
                            fill="#7c3aed"
                            fillOpacity={0.18}
                            stroke="#a78bfa"
                            strokeWidth={2}
                            vectorEffect="non-scaling-stroke"
                          />
                          <text
                            x={cx}
                            y={cy}
                            fontSize={Math.max(4.5, Math.min(10, activeVb.w * 0.022))}
                            fontWeight={800}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="#e9d5ff"
                            stroke="#2e1065"
                            strokeWidth={1.3}
                            paintOrder="stroke"
                          >
                            {`${sa.name} (${sa.nP}P + ${sa.nH}½)`}
                          </text>
                        </g>
                      );
                    })}

                  {/* Outer Farm Boundary */}
                  <polygon
                    points={mapGeometry.toPtsStr(subdivisionResult.bring)}
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth={2.0}
                    strokeDasharray="6 3"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />

                  {/* Live Freehand Lasso Selection Polygon */}
                  {cadLassoSvgPts.length >= 2 && (
                    <polygon
                      points={cadLassoSvgPts.map((pt) => `${pt[0]},${pt[1]}`).join(' ')}
                      fill={TIER_METADATA[activeTierBrush].fillHex}
                      fillOpacity={0.28}
                      stroke={TIER_METADATA[activeTierBrush].fillHex}
                      strokeWidth={2.4}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  )}
                </svg>
              )}

              {/* MOBILE SLIDE-UP BOTTOM SHEET + DESKTOP FLOATING PLOT INSPECTOR */}
              {inspectedPlot && subdivisionResult && (
                <>
                  {/* Mobile Backdrop */}
                  <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
                    onClick={() => setInspectedPlotId(null)}
                  />

                  <div
                    role="dialog"
                    aria-label={`Kormeerka Plot ${inspectedPlot.id}`}
                    className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl md:rounded-2xl md:absolute md:inset-x-auto md:left-3 md:bottom-3 md:z-20 w-full md:w-[415px] max-h-[82vh] md:max-h-[88%] flex flex-col bg-[#0B1220]/98 backdrop-blur-md border-t md:border border-[#243449] shadow-2xl text-xs text-[#F8FAFC]"
                  >
                    {/* Mobile Drag Handle */}
                    <div className="w-10 h-1.5 bg-[#243449] rounded-full mx-auto mt-2.5 mb-1 shrink-0 md:hidden" />

                    {(() => {
                      const pMeta = getEffectivePlotMetadata(
                        inspectedPlot,
                        subdivisionState.plotMetadata
                      );
                      const pZone = getEffectivePlotZone(
                        inspectedPlot,
                        subdivisionState.blockZones,
                        subdivisionState.plotMetadata,
                        subdivisionState.blockMetadata
                      );
                      const pTier = getEffectivePlotTier(
                        inspectedPlot,
                        subdivisionState.blockTiers,
                        subdivisionState.plotTierOverrides
                      );
                      const hp =
                        inspectedPlot.halfPlotValidation ||
                        subdivisionResult.plotValidations?.[inspectedPlot.id];
                      const assign = fairAllocation?.plotAssignments[inspectedPlot.id];
                      const calcArea =
                        inspectedPlot.calculatedAreaSqM ??
                        +(subdivisionResult.params.pw * subdivisionResult.params.pd).toFixed(1);

                      return (
                        <>
                          {/* Sticky Sheet Header */}
                          <div className="px-4 py-2.5 border-b border-[#243449] flex items-center justify-between gap-2 shrink-0">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono-numbers tabular-nums font-extrabold text-sm text-[#10B981]">
                                  {inspectedPlot.id}
                                </span>
                                <span className="text-[11px] text-[#94A3B8]">
                                  Block {inspectedPlot.block} · #{inspectedPlot.no} · {pZone} ·{' '}
                                  {TIER_METADATA[pTier].code}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setInspectedPlotId(null)}
                              className="min-h-[38px] min-w-[38px] rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                              aria-label="Xidh kormeeraha"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Scrollable Sheet Body */}
                          <div className="p-4 overflow-y-auto space-y-3">
                            {/* Half Plot & Boundary Clipping Details */}
                            {hp && (
                              <div className="rounded-xl border border-[#243449] bg-[#0F1B2D] p-3 space-y-1.5 text-[11px]">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[#94A3B8]">Xaaladda Geometry-ga:</span>
                                  <strong
                                    className={
                                      hp.validationStatus === 'half_plot_valid' ||
                                      hp.validationStatus === 'full_inside'
                                        ? 'text-[#10B981]'
                                        : hp.validationStatus === 'half_plot_invalid'
                                        ? 'text-rose-400'
                                        : 'text-amber-300'
                                    }
                                  >
                                    {hp.statusLabelSomali}
                                  </strong>
                                </div>
                                <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-[#243449]">
                                  <div>
                                    <span className="text-[#94A3B8] block">Half Plot la filayey:</span>
                                    <strong className="font-mono-numbers tabular-nums text-[#F8FAFC]">
                                      {hp.expectedRule.label} (216 m²)
                                    </strong>
                                  </div>
                                  <div>
                                    <span className="text-[#94A3B8] block">Gudaha ku hadhay:</span>
                                    <strong className="font-mono-numbers tabular-nums text-[#10B981]">
                                      {hp.insideAreaSqM.toFixed(2)} m² ({hp.insidePercentage.toFixed(0)}%)
                                    </strong>
                                  </div>
                                  <div>
                                    <span className="text-[#94A3B8] block">Leydiga gudaha:</span>
                                    <strong className="font-mono-numbers tabular-nums text-[#F8FAFC]">
                                      {hp.measuredDisplayDimensions}
                                    </strong>
                                  </div>
                                  <div>
                                    <span className="text-[#94A3B8] block">Dibadda ka baxay:</span>
                                    <strong className="font-mono-numbers tabular-nums text-[#CBD5E1]">
                                      {hp.outsideAreaSqM.toFixed(2)} m²
                                    </strong>
                                  </div>
                                </div>
                                <p className="text-[11px] text-[#94A3B8] leading-relaxed pt-1.5 border-t border-[#243449]">
                                  {hp.reasonSomali}
                                </p>
                              </div>
                            )}

                            {inspectedPlot.full &&
                              (() => {
                                const pExcl = getEffectivePlotExclusion(
                                  inspectedPlot,
                                  subdivisionState.plotMetadata,
                                  subdivisionState.blockMetadata
                                );
                                const bExcl = getEffectiveBlockExclusion(
                                  inspectedPlot.block,
                                  subdivisionState.blockMetadata
                                );

                                return (
                                  <>
                                    {/* Division Inclusion / Exclusion + Special Name Presets */}
                                    <div
                                      className={`rounded-xl border p-3 space-y-2.5 text-[11px] ${
                                        pExcl.isExcluded
                                          ? 'bg-rose-950/35 border-rose-500/45'
                                          : 'bg-[#0F1B2D] border-[#243449]'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-extrabold text-[#F8FAFC] flex items-center gap-1.5">
                                          {pExcl.isExcluded ? (
                                            <Ban className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                          ) : (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                                          )}
                                          <span>
                                            {pExcl.isExcluded
                                              ? pExcl.scope === 'block'
                                                ? `Block ${inspectedPlot.block} Waa Laga Reebay`
                                                : 'Plot Laga Reebay Dhaxalka'
                                              : 'Wuxuu Ku Jiraa Qaybinta Dhaxalka'}
                                          </span>
                                        </span>
                                      </div>

                                      <div className="flex flex-wrap gap-1.5">
                                        {!pExcl.isExcluded ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setPlotExclusionState(
                                                  inspectedPlot.id,
                                                  inspectedPlot.block,
                                                  true,
                                                  pMeta.excludedSpecialName ||
                                                    pMeta.parcelNumberOrName ||
                                                    exclusionBrushSpecialName ||
                                                    'Plot Laga Reebay'
                                                )
                                              }
                                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold whitespace-nowrap cursor-pointer"
                                            >
                                              Ka Reeb Plot-kan
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setBlockExclusionState(
                                                  inspectedPlot.block,
                                                  true,
                                                  subdivisionState.blockMetadata[inspectedPlot.block]
                                                    ?.excludedSpecialName ||
                                                    exclusionBrushSpecialName ||
                                                    'Block Laga Reebay'
                                                )
                                              }
                                              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-rose-500/45 bg-[#0B1220] hover:bg-rose-950/40 text-rose-200 font-bold whitespace-nowrap cursor-pointer"
                                            >
                                              Ka Reeb Block {inspectedPlot.block}
                                            </button>
                                          </>
                                        ) : (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setPlotExclusionState(
                                                  inspectedPlot.id,
                                                  inspectedPlot.block,
                                                  false
                                                )
                                              }
                                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-[#030712] font-extrabold whitespace-nowrap cursor-pointer"
                                            >
                                              Dib ugu Dar Plot-kan
                                            </button>
                                            {bExcl.isExcluded && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setBlockExclusionState(inspectedPlot.block, false)
                                                }
                                                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#10B981]/50 bg-[#0B1220] text-[#10B981] font-bold whitespace-nowrap cursor-pointer"
                                              >
                                                Dib ugu Dar Block {inspectedPlot.block}
                                              </button>
                                            )}
                                          </>
                                        )}
                                      </div>

                                      {pExcl.isExcluded && (
                                        <div className="space-y-1.5">
                                          <label className="block text-[10px] font-bold text-rose-200">
                                            Magaca Gaarka ah (
                                            {pExcl.scope === 'block'
                                              ? `Block ${inspectedPlot.block}`
                                              : inspectedPlot.id}
                                            ):
                                          </label>
                                          <input
                                            type="text"
                                            value={
                                              pExcl.scope === 'block'
                                                ? subdivisionState.blockMetadata[
                                                    inspectedPlot.block
                                                  ]?.excludedSpecialName ?? bExcl.specialName
                                                : pMeta.excludedSpecialName ?? pExcl.specialName
                                            }
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              if (pExcl.scope === 'block') {
                                                setBlockExclusionState(
                                                  inspectedPlot.block,
                                                  true,
                                                  val
                                                );
                                              } else {
                                                setPlotExclusionState(
                                                  inspectedPlot.id,
                                                  inspectedPlot.block,
                                                  true,
                                                  val
                                                );
                                              }
                                            }}
                                            placeholder="Tusaale: Masjidka, Ceelka Biyaha, Waqf..."
                                            className="w-full min-h-[38px] bg-[#0B1220] border border-rose-500/45 rounded-lg px-2.5 py-1 text-xs font-bold text-[#F8FAFC] focus:outline-none focus:border-rose-400"
                                          />
                                          <div className="flex flex-wrap gap-1">
                                            {SPECIAL_EXCLUSION_PRESETS.map((preset) => (
                                              <button
                                                key={preset}
                                                type="button"
                                                onClick={() => {
                                                  if (pExcl.scope === 'block') {
                                                    setBlockExclusionState(
                                                      inspectedPlot.block,
                                                      true,
                                                      preset
                                                    );
                                                  } else {
                                                    setPlotExclusionState(
                                                      inspectedPlot.id,
                                                      inspectedPlot.block,
                                                      true,
                                                      preset
                                                    );
                                                  }
                                                }}
                                                className="px-2 py-1 rounded bg-[#0B1220] border border-[#243449] hover:border-rose-400 text-[10px] font-semibold text-[#CBD5E1] cursor-pointer"
                                              >
                                                {preset}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 bg-[#0F1B2D] border border-[#243449] rounded-xl p-2.5 text-[11px]">
                                      <div>
                                        <span className="text-[#94A3B8] block">Bedka (GIS / Sugan):</span>
                                        <strong className="font-mono-numbers tabular-nums text-[#F8FAFC]">
                                          {calcArea} m²
                                          {pMeta.verifiedAreaSqM != null
                                            ? ` / ${pMeta.verifiedAreaSqM} m²`
                                            : ''}
                                        </strong>
                                      </div>
                                      <div>
                                        <span className="text-[#94A3B8] block">Qiimaha Sugan:</span>
                                        <strong className="font-mono-numbers tabular-nums text-[#F8FAFC]">
                                          {pMeta.verifiedPrice != null
                                            ? `${pMeta.verifiedPrice.toLocaleString()} ${currency}`
                                            : 'Lama xaqiijin'}
                                        </strong>
                                      </div>
                                      <div>
                                        <span className="text-[#94A3B8] block">Xaaladda Dooxa:</span>
                                        <strong className="text-[#CBD5E1]">
                                          {WADI_STATUS_METADATA[pMeta.wadiStatus].shortSomali}
                                        </strong>
                                      </div>
                                      <div>
                                        <span className="text-[#94A3B8] block">Tayada Goobta:</span>
                                        <strong className="text-[#CBD5E1]">
                                          {SITE_QUALITY_METADATA[pMeta.siteQuality].labelSomali}
                                        </strong>
                                      </div>
                                    </div>

                                    {assign && !pExcl.isExcluded && (
                                      <div className="text-[11px] text-[#CBD5E1] bg-[#10B981]/10 border border-[#10B981]/30 rounded-xl px-3 py-2">
                                        <span className="text-[#94A3B8]">Xaaladda Hadda: </span>
                                        <strong className="text-[#10B981]">
                                          {assign.assignmentType === 'shared_fractional'
                                            ? `Plot Wadaag ah (${assign.coOwners
                                                ?.map(
                                                  (c) =>
                                                    `${c.personName} ${c.sharePercentageOfPlot}%`
                                                )
                                                .join(' + ')})`
                                            : assign.ownerPersonName
                                            ? `${assign.ownerPersonName} (${
                                                assign.assignmentType === 'manual_override'
                                                  ? 'Gacan lagu xidhay'
                                                  : 'Soo-jeedin'
                                              })`
                                            : 'Waa Bannaan Yahay'}
                                        </strong>
                                      </div>
                                    )}

                                    {!pExcl.isExcluded &&
                                      fairAllocation &&
                                      fairAllocation.heirAllocations.length > 0 && (
                                        <div>
                                          <label className="block text-[10px] font-bold uppercase text-[#94A3B8] mb-1">
                                            U Qoondee Dhaxal-Suge (Qoondayn Gacanta ah)
                                          </label>
                                          <select
                                            value={
                                              subdivisionState.manualPlotHeirOverrides[
                                                inspectedPlot.id
                                              ] || '__auto__'
                                            }
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              onUpdateSubdivisionState((prev) => {
                                                const next = { ...prev.manualPlotHeirOverrides };
                                                if (val === '__auto__') {
                                                  delete next[inspectedPlot.id];
                                                } else {
                                                  next[inspectedPlot.id] = val;
                                                }
                                                return {
                                                  ...prev,
                                                  approvalStatus:
                                                    prev.approvalStatus === 'approved'
                                                      ? 'under_review'
                                                      : prev.approvalStatus,
                                                  manualPlotHeirOverrides: next,
                                                };
                                              });
                                            }}
                                            className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 py-1.5 text-xs font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                                          >
                                            <option value="__auto__">
                                              Soo-jeedinta Otomaatigga ah (Cadaaladda Zone &amp; Heer)
                                            </option>
                                            {fairAllocation.heirAllocations.map((h) => (
                                              <option key={h.heirKey} value={h.heirKey}>
                                                {h.personName} ({h.roleTitleSomali} · hadda:{' '}
                                                {formatPlotQtyCompact(
                                                  h.effectiveTotalPlotsReceived
                                                )}
                                                /{formatPlotQtyCompact(h.exactTotalPlotsQuota)} plot)
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      )}
                                  </>
                                );
                              })()}

                            <div className="flex items-center justify-between pt-2 border-t border-[#243449]">
                              <button
                                type="button"
                                onClick={() => {
                                  setBottomTab(
                                    inspectedPlot.full ? 'plot_metadata' : 'half_plots_validation'
                                  );
                                }}
                                className="min-h-[38px] text-xs font-bold text-[#10B981] hover:underline cursor-pointer"
                              >
                                {inspectedPlot.full
                                  ? 'Buuxi Xogta & Dooxa Plot-kan →'
                                  : 'Arag Jadwalka Half Plots →'}
                              </button>
                              <span className="text-[10px] font-mono-numbers tabular-nums text-[#94A3B8]">
                                {inspectedPlot.centerLonLat[1].toFixed(5)},{' '}
                                {inspectedPlot.centerLonLat[0].toFixed(5)}
                              </span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>

            {/* Map Legend */}
            <div className="px-4 py-2.5 border-t border-[#243449] bg-[#0B1220] flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#94A3B8]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-2.5 border border-dashed border-rose-500 inline-block" />
                <span>Xuduudka Beerta</span>
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-rose-300">
                <span className="w-3.5 h-3 rounded-xs border border-dashed border-rose-400 bg-rose-950 inline-block" />
                <span>Laga Reebay Dhaxalka (Magac Gaar ah)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-xs inline-block"
                  style={{ backgroundColor: HALF_PLOT_STATUS_METADATA.full_inside.fillHex }}
                />
                <span>Gudaha oo dhan (La Qaybinayo)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs border border-emerald-400 bg-emerald-800 inline-block" />
                <span>Half Plot sax ah (12×18m / 9×24m)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-xs inline-block"
                  style={{ backgroundColor: HALF_PLOT_STATUS_METADATA.half_plot_invalid.fillHex }}
                />
                <span>Ma buuxin Half Plot</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-xs inline-block"
                  style={{ backgroundColor: HALF_PLOT_STATUS_METADATA.needs_review.fillHex }}
                />
                <span>Dib-u-eegis</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs border border-dashed border-slate-500 bg-slate-800 inline-block" />
                <span>Dibadda oo dhan</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs border border-sky-400 bg-sky-900/60 inline-block" />
                <span>Doox (Wadi)</span>
              </span>
            </div>

            {subdivisionResult && subdivisionResult.warnings.length > 0 && (
              <div className="px-4 py-2.5 bg-amber-950/35 border-t border-amber-500/40 text-xs text-amber-200">
                {subdivisionResult.warnings.join(' · ')}
              </div>
            )}
          </section>

          {/* BOTTOM TABBED REGISTERS & METADATA / REPORT / HALF PLOTS PANELS */}
          <GisBottomRegistersSection
            bottomTab={bottomTab}
            onSelectBottomTab={setBottomTab}
            subdivisionState={subdivisionState}
            subdivisionResult={subdivisionResult}
            fairAllocation={fairAllocation}
            currency={currency}
            inspectedPlotId={inspectedPlotId}
            onSelectPlotId={setInspectedPlotId}
            highlightedHeirKey={highlightedHeirKey}
            onHighlightHeirOnMap={(hk) => {
              setMapColorMode('heirs');
              setHighlightedHeirKey(highlightedHeirKey === hk ? null : hk);
            }}
            onSwitchToExcludedMapMode={() => setMapColorMode('excluded')}
            onSwitchToHalfPlotsMapMode={() => setMapColorMode('half_plots')}
            onActivateExclusionBrush={() => {
              setInteractionTool('mark_exclusion');
              setMapColorMode('excluded');
            }}
            onFocusPlotOnMap={(q) => {
              setMapColorMode('half_plots');
              setInspectedPlotId(q.id);
              if (mapGeometry) {
                const cx = mapGeometry.toX(q.centerUtm);
                const cy = mapGeometry.toY(q.centerUtm);
                setViewBox({
                  x: cx - 75,
                  y: cy - 60,
                  w: 150,
                  h: 120,
                });
              }
            }}
            onRenameIndividual={handleRenameIndividual}
            onSetPlotExclusionState={setPlotExclusionState}
            onSetBlockExclusionState={setBlockExclusionState}
            onUpdateSubdivisionState={onUpdateSubdivisionState}
            onNotify={onNotify}
            plotSearchQuery={plotSearchQuery}
            onChangePlotSearchQuery={setPlotSearchQuery}
            plotDivisionFilter={plotDivisionFilter}
            onChangePlotDivisionFilter={setPlotDivisionFilter}
            plotZoneFilter={plotZoneFilter}
            onChangePlotZoneFilter={setPlotZoneFilter}
            plotTierFilter={plotTierFilter}
            onChangePlotTierFilter={setPlotTierFilter}
            halfPlotStatusFilter={halfPlotStatusFilter}
            onChangeHalfPlotStatusFilter={setHalfPlotStatusFilter}
            filteredPlots={filteredPlots}
            filteredEvaluatedPlots={filteredEvaluatedPlots}
          />
        </div>
      </div>
    </div>
  );
};
