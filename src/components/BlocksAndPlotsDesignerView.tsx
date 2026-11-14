import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AssetQualityTier, Currency, SavedInheritanceCase } from '../types/inheritance';
import {
  CaseExportMetadata,
  FairLandAllocationResult,
  GeneratedPlot,
  LandAllocationMode,
  LandSubdivisionState,
  PlotDetailedMetadata,
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
  LAND_ALLOCATION_MODE_METADATA,
  SITE_QUALITY_METADATA,
  TIER_METADATA,
  WADI_STATUS_METADATA,
  applyHtmlBoundarySelectionChange,
  buildAutoBlockZones,
  buildRowBasedBlockTiers,
  checkHeirPlotQuotaStatus,
  HeirPlotQuotaStatus,
  createAuditEntry,
  formatPlotQtyCompact,
  getDistinctHeirColor,
  getEffectiveBlockExclusion,
  getEffectivePlotExclusion,
  getEffectivePlotMetadata,
  getEffectivePlotTier,
  getEffectivePlotZone,
  getZoneDisplayMeta,
} from '../utils/landSubdivisionEngine';
import {
  Ban,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Compass,
  Eye,
  EyeOff,
  FileText,
  Grid,
  GripHorizontal,
  Layers,
  Link2,
  Loader2,
  MapPin,
  Maximize2,
  MousePointerClick,
  Mountain,
  Paintbrush,
  RotateCcw,
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
import { alignAllBlocksToSampleBlock } from '../utils/nashqadWorkflowEngine';
import { SampleBlockAxisControlCard } from './SampleBlockAxisControlCard';
import { CadQuotaPermissionModal } from './CadQuotaPermissionModal';
import { SimpleInheritancePdfModal } from './SimpleInheritancePdfModal';

interface BlocksAndPlotsDesignerViewProps {
  subdivisionState: LandSubdivisionState;
  subdivisionResult: SubdivisionComputationResult | null;
  fairAllocation: FairLandAllocationResult | null;
  currency: Currency;
  activeCaseMeta?: CaseExportMetadata;
  savedCasesForGeometryLink?: SavedInheritanceCase[];
  onExplicitLinkGeometryFromCase?: (sourceCase: SavedInheritanceCase) => void;
  onSelectBoundaryIndex?: (idx: number) => void;
  onSelectSampleIndex?: (idx: number) => void;
  onBackToInteractiveMap?: () => void;
  onUpdateSubdivisionState: (updater: (prev: LandSubdivisionState) => LandSubdivisionState) => void;
  onSyncAndLinkToEstate: () => void;
  onNavigateToCalculator: () => void;
  onNotify: (title: string, message: string) => void;
  isApkMobileMode?: boolean;
}

type StudioDockStep = 'shabakad' | 'heer_aag' | 'qaybi' | 'pdf_xidh';
type MapColorMode = 'heirs' | 'zones' | 'tiers' | 'excluded' | 'half_plots';
type MapInteractionTool =
  | 'inspect'
  | 'mark_exclusion'
  | 'mark_tier'
  | 'mark_zone'
  | 'assign_heir';

const SPECIAL_EXCLUSION_PRESETS = ['Danguud'];

const CUSTOM_EXCLUDED_COLOR_CHOICES = [
  '#94A3B8',
  '#64748B',
  '#F43F5E',
  '#F97316',
  '#EAB308',
  '#8B5CF6',
  '#14B8A6',
  '#EC4899',
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
  currency,
  activeCaseMeta,
  savedCasesForGeometryLink = [],
  onExplicitLinkGeometryFromCase,
  onSelectBoundaryIndex,
  onSelectSampleIndex,
  onBackToInteractiveMap,
  onUpdateSubdivisionState,
  onSyncAndLinkToEstate,
  onNavigateToCalculator,
  onNotify,
  isApkMobileMode = false,
}) => {
  const [mapColorMode, setMapColorMode] = useState<MapColorMode>('heirs');
  const [interactionTool, setInteractionTool] = useState<MapInteractionTool>('inspect');
  const [activeStudioSheet, setActiveStudioSheet] = useState<StudioDockStep | null>(null);
  const [showViewModePopover, setShowViewModePopover] = useState<boolean>(false);
  const [qaybiPaintMode, setQaybiPaintMode] = useState<'heir' | 'custom_name'>('heir');
  const [multiSelectMode, setMultiSelectMode] = useState<boolean>(false);
  const [selectedBatchPlotIds, setSelectedBatchPlotIds] = useState<string[]>([]);
  const [showSimplePdfModal, setShowSimplePdfModal] = useState<boolean>(false);

  const [activeTierBrush, setActiveTierBrush] = useState<AssetQualityTier>('tier_1_prime');
  const [tierBrushScope, setTierBrushScope] = useState<'block' | 'plot' | 'freehand'>('plot');
  const [tierEvalMode, setTierEvalMode] = useState<'automatic' | 'manual'>('automatic');
  const [isRunningAutoDem, setIsRunningAutoDem] = useState<boolean>(false);
  const [cadLassoSvgPts, setCadLassoSvgPts] = useState<[number, number][]>([]);
  const cadLassoSvgRef = useRef<[number, number][]>([]);
  const isDrawingCadLassoRef = useRef<boolean>(false);
  const [activeZoneBrush, setActiveZoneBrush] = useState<string>('Zone A');
  const [selectedHeirKeyForBrush, setSelectedHeirKeyForBrush] = useState<string>('');
  const [highlightedHeirKey, setHighlightedHeirKey] = useState<string | null>(null);

  // Clean Default Exclusion Brush (empty name unless user types or taps Danguud)
  const [exclusionBrushScope, setExclusionBrushScope] = useState<'plot' | 'block'>('plot');
  const [exclusionBrushMode, setExclusionBrushMode] = useState<'exclude' | 'include'>('exclude');
  const [exclusionBrushSpecialName, setExclusionBrushSpecialName] = useState<string>('');
  const [exclusionBrushColorHex, setExclusionBrushColorHex] = useState<string>('#94A3B8');

  // Unified Inspector Card & Quota Permission State
  const [inspectorScope, setInspectorScope] = useState<'plot' | 'block'>('plot');
  const [inspectorAssignMode, setInspectorAssignMode] = useState<'heir' | 'custom_name'>('heir');
  const [customNameDraft, setCustomNameDraft] = useState<string>('');
  const [customColorDraft, setCustomColorDraft] = useState<string>('#94A3B8');
  const [pendingQuotaAction, setPendingQuotaAction] = useState<{
    targetDescription: string;
    heirKey: string;
    quotaStatus: HeirPlotQuotaStatus;
    applyFn: () => void;
  } | null>(null);

  const [showBlockLabels, setShowBlockLabels] = useState<boolean>(true);
  const [showAllPlotLabels, setShowAllPlotLabels] = useState<boolean>(false);
  const [showHeirLabelsOnPlots, setShowHeirLabelsOnPlots] = useState<boolean>(false);
  const [showExcludedSpecialNames, setShowExcludedSpecialNames] = useState<boolean>(true);
  const [showWadiOverlay, setShowWadiOverlay] = useState<boolean>(true);
  const [showQualityDots, setShowQualityDots] = useState<boolean>(false);
  const [showOutsidePlotsOverlay, setShowOutsidePlotsOverlay] = useState<boolean>(true);

  // Canvas-First UX overlays
  const [showMapLayerPopover, setShowMapLayerPopover] = useState<boolean>(false);
  const [isCadLegendsExpanded, setIsCadLegendsExpanded] = useState<boolean>(false);
  const [cadHiddenHeirKeys, setCadHiddenHeirKeys] = useState<Record<string, boolean>>({});
  const [cadLegendPos, setCadLegendPos] = useState<{ x: number; y: number }>({ x: 12, y: 58 });
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

  const pickDistinctExcludedColor = (preferredHex?: string): string => {
    const usedHeirHexes = new Set(
      (fairAllocation?.heirAllocations || []).map((h) => h.colorHex.toUpperCase())
    );
    if (preferredHex && !usedHeirHexes.has(preferredHex.toUpperCase())) {
      return preferredHex;
    }
    const candidate = CUSTOM_EXCLUDED_COLOR_CHOICES.find((c) => !usedHeirHexes.has(c.toUpperCase()));
    return candidate || getDistinctHeirColor(99, usedHeirHexes);
  };

  const setPlotExclusionState = (
    plotId: string,
    blockId: string,
    isExcluded: boolean,
    specialName?: string,
    customColorHex?: string
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
      const resolvedColor = isExcluded
        ? pickDistinctExcludedColor(customColorHex || existing.excludedColorHex)
        : existing.excludedColorHex;
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
            excludedColorHex: resolvedColor,
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
    specialName?: string,
    customColorHex?: string
  ) => {
    onUpdateSubdivisionState((prev) => {
      const existingBlk = prev.blockMetadata[blockId] || { blockId };
      const resolvedName =
        specialName !== undefined
          ? specialName
          : existingBlk.excludedSpecialName || existingBlk.blockName || '';
      const resolvedColor = isExcluded
        ? pickDistinctExcludedColor(customColorHex || existingBlk.excludedColorHex)
        : existingBlk.excludedColorHex;

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
            excludedColorHex: resolvedColor,
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

  const requestHeirAssignmentWithQuotaGuard = (
    heirKey: string,
    addingPlotUnits: number,
    targetDescription: string,
    applyFn: () => void
  ) => {
    const heir = fairAllocation?.heirAllocations.find((h) => h.heirKey === heirKey);
    if (!heir) {
      applyFn();
      return;
    }
    const status = checkHeirPlotQuotaStatus(heir, addingPlotUnits);
    if (status.isAlreadyFull || status.willExceedQuota) {
      setPendingQuotaAction({
        targetDescription,
        heirKey,
        quotaStatus: status,
        applyFn,
      });
      return;
    }
    applyFn();
  };

  const applyManualHeirToPlotIds = (plotIds: string[], heirKey: string, labelDesc: string) => {
    onUpdateSubdivisionState((prev) => {
      const nextManual = { ...prev.manualPlotHeirOverrides };
      const nextPlotMeta = { ...prev.plotMetadata };
      plotIds.forEach((pid) => {
        if (heirKey === '__auto__') {
          delete nextManual[pid];
        } else {
          nextManual[pid] = heirKey;
          if (nextPlotMeta[pid]?.isExcludedFromDivision) {
            nextPlotMeta[pid] = { ...nextPlotMeta[pid], isExcludedFromDivision: false };
          }
        }
      });
      return {
        ...prev,
        approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
        manualPlotHeirOverrides: nextManual,
        plotMetadata: nextPlotMeta,
        auditHistory: [
          createAuditEntry(
            'manual_allocation',
            heirKey === '__auto__'
              ? `${labelDesc}: dib ayaa loogu celiyey qaybinta otomaatigga ah.`
              : `${labelDesc}: gacanta ayaa loogu qoondeeyey dhaxale.`
          ),
          ...(prev.auditHistory || []).slice(0, 49),
        ],
      };
    });
    setMapColorMode('heirs');
  };

  const toggleBatchPlotSelection = (plotId: string, blockId: string) => {
    const scope =
      interactionTool === 'mark_exclusion'
        ? exclusionBrushScope
        : interactionTool === 'mark_tier' && tierBrushScope === 'block'
        ? 'block'
        : 'plot';

    const idsToToggle =
      scope === 'block'
        ? (
            subdivisionResult?.blocks.find((b) => b.id === blockId)?.plots.map((p) => p.id) || [
              plotId,
            ]
          )
        : [plotId];

    setSelectedBatchPlotIds((prev) => {
      const prevSet = new Set(prev);
      const allPresent = idsToToggle.every((id) => prevSet.has(id));
      if (allPresent) {
        idsToToggle.forEach((id) => prevSet.delete(id));
      } else {
        idsToToggle.forEach((id) => prevSet.add(id));
      }
      return Array.from(prevSet);
    });
  };

  const applyBatchSelectionAction = () => {
    if (selectedBatchPlotIds.length === 0) return;
    const batchIds = [...selectedBatchPlotIds];
    const plotPool =
      subdivisionResult?.allEvaluatedPlots && subdivisionResult.allEvaluatedPlots.length > 0
        ? subdivisionResult.allEvaluatedPlots
        : subdivisionResult?.plots || [];

    if (interactionTool === 'mark_exclusion') {
      const targetExclude = exclusionBrushMode === 'exclude';
      const brushName = exclusionBrushSpecialName.trim();
      const resolvedColor = targetExclude
        ? pickDistinctExcludedColor(exclusionBrushColorHex)
        : undefined;

      onUpdateSubdivisionState((prev) => {
        const nextPlotMeta = { ...prev.plotMetadata };
        const nextManual = { ...prev.manualPlotHeirOverrides };
        batchIds.forEach((pid) => {
          const found = plotPool.find((p) => p.id === pid);
          const blkId = found?.block || pid.split('-')[0] || 'B1';
          const existing: PlotDetailedMetadata = nextPlotMeta[pid] || {
            plotId: pid,
            blockId: blkId,
            wadiStatus: 'unverified' as WadiStatus,
            siteQuality: 'unverified' as SiteQualityRating,
          };
          if (targetExclude) {
            delete nextManual[pid];
          }
          nextPlotMeta[pid] = {
            ...existing,
            isExcludedFromDivision: targetExclude,
            excludedSpecialName: targetExclude ? brushName : '',
            excludedColorHex: targetExclude ? resolvedColor : existing.excludedColorHex,
            ...(targetExclude && brushName && !existing.parcelNumberOrName
              ? { parcelNumberOrName: brushName }
              : {}),
            updatedAt: new Date().toISOString(),
          };
        });
        return {
          ...prev,
          approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
          manualPlotHeirOverrides: nextManual,
          plotMetadata: nextPlotMeta,
          auditHistory: [
            createAuditEntry(
              'exclusion_update',
              targetExclude
                ? `${batchIds.length} Plot/Jajab ayaa laga reebay dhaxalka${brushName ? ` ("${brushName}")` : ''}.`
                : `${batchIds.length} Plot/Jajab dib ayaa loogu daray dhaxalka.`
            ),
            ...(prev.auditHistory || []).slice(0, 49),
          ],
        };
      });
      setMapColorMode('excluded');
      setSelectedBatchPlotIds([]);
      return;
    }

    if (interactionTool === 'mark_tier') {
      onUpdateSubdivisionState((prev) => {
        const nextOverrides = { ...prev.plotTierOverrides };
        batchIds.forEach((pid) => {
          nextOverrides[pid] = activeTierBrush;
        });
        return {
          ...prev,
          approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
          plotTierOverrides: nextOverrides,
        };
      });
      setMapColorMode('tiers');
      setSelectedBatchPlotIds([]);
      return;
    }

    if (interactionTool === 'mark_zone') {
      const blkSet = new Set<string>();
      batchIds.forEach((pid) => {
        const found = plotPool.find((p) => p.id === pid);
        if (found?.block) blkSet.add(found.block);
      });
      onUpdateSubdivisionState((prev) => {
        const nextZones = { ...prev.blockZones };
        blkSet.forEach((bid) => {
          nextZones[bid] = activeZoneBrush;
        });
        return {
          ...prev,
          zonePresetMode: 'custom',
          approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
          blockZones: nextZones,
        };
      });
      setMapColorMode('zones');
      setSelectedBatchPlotIds([]);
      return;
    }

    if (selectedHeirKeyForBrush) {
      const totalUnits = batchIds.reduce((sum, pid) => {
        const found = plotPool.find((p) => p.id === pid);
        return sum + (found && !found.full ? 0.5 : 1);
      }, 0);
      requestHeirAssignmentWithQuotaGuard(
        selectedHeirKeyForBrush,
        totalUnits,
        `${batchIds.length} Plot/Jajab`,
        () => {
          applyManualHeirToPlotIds(
            batchIds,
            selectedHeirKeyForBrush,
            `${batchIds.length} Plot/Jajab`
          );
          setSelectedBatchPlotIds([]);
        }
      );
    }
  };

  const handlePlotMapClick = (plotId: string, blockId: string) => {
    if (multiSelectMode && interactionTool !== 'inspect') {
      toggleBatchPlotSelection(plotId, blockId);
      return;
    }

    if (interactionTool === 'inspect') {
      setInspectedPlotId(plotId);
      const curExcl = getEffectivePlotExclusion(
        { id: plotId, block: blockId },
        subdivisionState.plotMetadata,
        subdivisionState.blockMetadata
      );
      setInspectorScope(curExcl.scope === 'block' ? 'block' : 'plot');
      setInspectorAssignMode(curExcl.isExcluded ? 'custom_name' : 'heir');
      setCustomNameDraft(curExcl.specialName || '');
      setCustomColorDraft(curExcl.colorHex || pickDistinctExcludedColor());
      return;
    }

    if (interactionTool === 'mark_exclusion') {
      const targetExclude = exclusionBrushMode === 'exclude';
      const brushName = exclusionBrushSpecialName.trim();

      if (exclusionBrushScope === 'block') {
        const curBlkExcl = getEffectiveBlockExclusion(blockId, subdivisionState.blockMetadata);
        if (targetExclude && curBlkExcl.isExcluded && curBlkExcl.specialName === brushName) {
          setBlockExclusionState(blockId, false);
        } else {
          setBlockExclusionState(
            blockId,
            targetExclude,
            targetExclude ? brushName : '',
            exclusionBrushColorHex
          );
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
          setPlotExclusionState(
            plotId,
            blockId,
            targetExclude,
            targetExclude ? brushName : '',
            exclusionBrushColorHex
          );
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
          `${plotId}${plotExcl.specialName ? ` (${plotExcl.specialName})` : ''} waxaa laga reebay qaybinta dhaxalka — marka hore dib ugu dar qaybinta.`
        );
        setInspectedPlotId(plotId);
        return;
      }
      setInspectedPlotId(plotId);
      const isAlreadySame =
        subdivisionState.manualPlotHeirOverrides[plotId] === selectedHeirKeyForBrush;
      if (isAlreadySame) {
        applyManualHeirToPlotIds([plotId], '__auto__', `Plot ${plotId}`);
        return;
      }
      const clickedPlot = (
        subdivisionResult?.allEvaluatedPlots ||
        subdivisionResult?.plots ||
        []
      ).find((x) => x.id === plotId);
      const unitW = clickedPlot && !clickedPlot.full ? 0.5 : 1;
      requestHeirAssignmentWithQuotaGuard(
        selectedHeirKeyForBrush,
        unitW,
        `Plot ${plotId}`,
        () => applyManualHeirToPlotIds([plotId], selectedHeirKeyForBrush, `Plot ${plotId}`)
      );
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

  const inspectedPlot: GeneratedPlot | undefined = useMemo(() => {
    if (!inspectedPlotId || !subdivisionResult) return undefined;
    const pool =
      subdivisionResult.allEvaluatedPlots && subdivisionResult.allEvaluatedPlots.length > 0
        ? subdivisionResult.allEvaluatedPlots
        : subdivisionResult.plots;
    return pool.find((q) => q.id === inspectedPlotId);
  }, [inspectedPlotId, subdivisionResult]);

  const manualOverrideCount = Object.keys(subdivisionState.manualPlotHeirOverrides).length;

  return (
    <div className="space-y-3 text-[#F8FAFC]">
      {/* 1. COMPACT SINGLE-ROW STUDIO HEADER */}
      <section className="bg-[#0B1220] border border-[#243449] rounded-2xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-sm sm:text-base font-extrabold text-[#F8FAFC] tracking-tight whitespace-nowrap">
              CAD Studio
            </h1>
            {subdivisionResult && (
              <span className="text-[11px] sm:text-xs text-[#94A3B8] tabular-nums truncate">
                {(subdivisionResult.barea / 1e4).toFixed(2)} ha · {subdivisionResult.blocks.length}{' '}
                Blk ·{' '}
                <strong className="text-[#10B981]">
                  {fairAllocation?.totalFullPlots ?? subdivisionResult.plots.length}
                </strong>{' '}
                Plot · {fairAllocation?.heirAllocations.length ?? 0} Dhaxle
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {fairAllocation && fairAllocation.heirAllocations.length === 0 && (
            <button
              type="button"
              onClick={onNavigateToCalculator}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-amber-500/50 bg-amber-950/35 hover:border-amber-400 text-xs font-bold text-amber-200 whitespace-nowrap cursor-pointer"
            >
              Dooro Dhaxlayaasha
            </button>
          )}

          <button
            type="button"
            onClick={onSyncAndLinkToEstate}
            disabled={!subdivisionResult || subdivisionResult.plots.length === 0}
            className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-3 py-1.5 text-xs font-extrabold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40"
          >
            {subdivisionState.isLinkedToEstate ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Ku Xidhan ({subdivisionResult?.plots.length || 0})</span>
              </>
            ) : (
              <>
                <Link2 className="w-3.5 h-3.5 shrink-0" />
                <span>Ku Xidh &amp; Qaybi</span>
              </>
            )}
          </button>

          {subdivisionResult && fairAllocation && (
            <button
              type="button"
              onClick={() => setShowSimplePdfModal(true)}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[#10B981]/50 bg-[#0F1B2D] hover:border-[#10B981] px-3 py-1.5 text-xs font-extrabold text-[#10B981] transition-colors whitespace-nowrap cursor-pointer"
              title="Simple PDF (Master + Boggaga Dhaxlayaasha)"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>PDF</span>
            </button>
          )}
        </div>
      </section>

      {/* 2. CANVAS-FIRST INTERACTIVE STUDIO SHELL */}
      <section className="bg-[#0B1220] border border-[#243449] rounded-2xl overflow-hidden flex flex-col">
        {/* INTERACTIVE CADASTRAL CANVAS */}
        <div
          className={`relative bg-[#07101E] transition-all touch-none select-none overflow-hidden ${
            activeStudioSheet
              ? isApkMobileMode
                ? 'h-[310px] sm:h-[360px]'
                : 'h-[340px] sm:h-[430px]'
              : isApkMobileMode
              ? 'h-[430px] sm:h-[500px]'
              : 'h-[460px] sm:h-[580px]'
          }`}
        >
          {/* TOP-LEFT VIEW MODE PILL (1-Tap Layer Switcher) */}
          {subdivisionResult && mapGeometry && (
            <div className="absolute left-3 top-3 z-20">
              <button
                type="button"
                onClick={() => {
                  setShowViewModePopover((prev) => !prev);
                  setShowMapLayerPopover(false);
                }}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0B1220]/94 backdrop-blur-md border border-[#243449] hover:border-[#10B981] shadow-xl inline-flex items-center gap-1.5 text-xs font-extrabold text-[#F8FAFC] cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                <span>
                  {mapColorMode === 'heirs'
                    ? 'Muuqaal: Dhaxlayaal'
                    : mapColorMode === 'zones'
                    ? 'Muuqaal: Aag A–D'
                    : mapColorMode === 'tiers'
                    ? 'Muuqaal: Heer H1–H3'
                    : mapColorMode === 'excluded'
                    ? `Muuqaal: Reeban (${fairAllocation?.excludedPlotsCount ?? 0})`
                    : `Muuqaal: Half (${subdivisionResult?.halfPlotSummary?.validHalfPlotsCount ?? 0})`}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#94A3B8]" />
              </button>

              {showViewModePopover && (
                <div className="mt-1.5 w-52 rounded-2xl bg-[#0B1220]/96 backdrop-blur-md border border-[#243449] p-1.5 shadow-2xl space-y-1 text-xs">
                  {(
                    [
                      { id: 'heirs', label: 'Dhaxlayaasha', icon: Users },
                      { id: 'tiers', label: 'Heerarka (H1–H3)', icon: Layers },
                      { id: 'zones', label: 'Aagga (Zones A–D)', icon: Compass },
                      {
                        id: 'excluded',
                        label: `Dhul Reeban (${fairAllocation?.excludedPlotsCount ?? 0})`,
                        icon: Ban,
                      },
                      {
                        id: 'half_plots',
                        label: `Half Plots (${subdivisionResult?.halfPlotSummary?.validHalfPlotsCount ?? 0})`,
                        icon: Grid,
                      },
                    ] as const
                  ).map((vm) => {
                    const Icon = vm.icon;
                    const active = mapColorMode === vm.id;
                    return (
                      <button
                        key={vm.id}
                        type="button"
                        onClick={() => {
                          setMapColorMode(vm.id);
                          setShowViewModePopover(false);
                        }}
                        className={`w-full min-h-[36px] px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 font-bold cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#10B981] text-[#030712]'
                            : 'text-[#F8FAFC] hover:bg-[#0F1B2D]'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span>{vm.label}</span>
                        </span>
                        {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* DRAGGABLE COMPACT SUMADAHA (LEGENDS) MINI PILL */}
          {subdivisionResult && mapGeometry && cadLegendItems.length > 0 && (
            <div
              style={{ left: `${cadLegendPos.x}px`, top: `${cadLegendPos.y}px` }}
              className="absolute z-20 rounded-xl bg-[#0B1220]/94 backdrop-blur-md border border-[#243449] p-2 shadow-xl min-w-[145px] max-w-[225px] text-[#F8FAFC]"
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
                title="Jiid meel kasta ama taabo si aad u furto / u qariso Sumadaha"
                className="w-full flex items-center justify-between gap-2 text-[11px] font-extrabold touch-none select-none cursor-grab active:cursor-grabbing"
              >
                <span className="inline-flex items-center gap-1.5">
                  <GripHorizontal className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Sumadaha</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="text-[10px] font-semibold text-[#94A3B8] tabular-nums">
                    {cadLegendItems.filter((it) => !cadHiddenHeirKeys[it.key]).length}/
                    {cadLegendItems.length}
                  </span>
                  {isCadLegendsExpanded ? (
                    <EyeOff className="w-3 h-3 text-[#94A3B8]" />
                  ) : (
                    <Eye className="w-3 h-3 text-[#10B981]" />
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

                  <div className="max-h-[165px] overflow-y-auto pr-0.5 space-y-1">
                    {cadLegendItems.map((it) => {
                      const isChecked = !cadHiddenHeirKeys[it.key];
                      const isSpotlighted = highlightedHeirKey === it.key;
                      const canSpotlight = !it.key.startsWith('__');
                      return (
                        <div
                          key={it.key}
                          className={`w-full flex items-center justify-between gap-1.5 font-semibold rounded-md px-1 py-0.5 select-none hover:bg-white/5 ${
                            isSpotlighted ? 'bg-[#10B981]/15 ring-1 ring-[#10B981]/50' : ''
                          }`}
                        >
                          <label className="inline-flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer">
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
                          </label>
                          <div className="inline-flex items-center gap-1 shrink-0">
                            {canSpotlight && (
                              <button
                                type="button"
                                onClick={() => {
                                  setMapColorMode('heirs');
                                  setHighlightedHeirKey((prev) =>
                                    prev === it.key ? null : it.key
                                  );
                                }}
                                title={
                                  isSpotlighted
                                    ? 'Ka qaad iftiiminta dhaxlahan'
                                    : 'Iftiimi plots-ka dhaxlahan oo keliya'
                                }
                                className={`p-0.5 rounded cursor-pointer ${
                                  isSpotlighted
                                    ? 'text-[#10B981]'
                                    : 'text-[#64748B] hover:text-[#F8FAFC]'
                                }`}
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                            )}
                            <span className="text-[10px] text-[#94A3B8] tabular-nums">
                              {it.count}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {highlightedHeirKey && (
                    <button
                      type="button"
                      onClick={() => setHighlightedHeirKey(null)}
                      className="w-full py-1 rounded-lg bg-[#0F1B2D] border border-[#243449] text-[10px] font-bold text-[#10B981] hover:border-[#10B981] cursor-pointer"
                    >
                      Muuji Dhammaan (Ka Qaad Diiradda)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ACTIVE BRUSH INDICATOR + MULTI-TAP BATCH COMMIT PILL (Bottom-Center of Canvas) */}
          {subdivisionResult && mapGeometry && (interactionTool !== 'inspect' || selectedBatchPlotIds.length > 0) && (
            <div className="absolute inset-x-3 bottom-3 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#0B1220]/95 backdrop-blur-md border border-[#10B981]/50 px-3 py-2 shadow-2xl text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse shrink-0" />
                <span className="font-bold text-[#F8FAFC] truncate">
                  {selectedBatchPlotIds.length > 0
                    ? `${selectedBatchPlotIds.length} la xulay (${
                        interactionTool === 'mark_exclusion'
                          ? exclusionBrushSpecialName.trim() || 'Ka Reeb'
                          : interactionTool === 'mark_tier'
                          ? TIER_METADATA[activeTierBrush].code
                          : interactionTool === 'mark_zone'
                          ? activeZoneBrush
                          : fairAllocation?.heirAllocations.find(
                              (h) => h.heirKey === selectedHeirKeyForBrush
                            )?.personName || 'Dhaxle'
                      })`
                    : interactionTool === 'assign_heir'
                    ? `Taabo Plot/Jajab → ${
                        fairAllocation?.heirAllocations.find(
                          (h) => h.heirKey === selectedHeirKeyForBrush
                        )?.personName || 'Dhaxle'
                      }`
                    : interactionTool === 'mark_exclusion'
                    ? `Taabo Plot/Jajab → ${exclusionBrushSpecialName.trim() || 'Magac Gaar ah / Reeb'}`
                    : interactionTool === 'mark_tier'
                    ? tierBrushScope === 'freehand'
                      ? `Ku sawir wareeg → ${TIER_METADATA[activeTierBrush].code}`
                      : `Taabo → ${TIER_METADATA[activeTierBrush].code}`
                    : `Taabo Block → ${activeZoneBrush}`}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {selectedBatchPlotIds.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={applyBatchSelectionAction}
                      className="min-h-[34px] px-3 py-1 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] font-extrabold cursor-pointer"
                    >
                      Ku Qor ({selectedBatchPlotIds.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedBatchPlotIds([])}
                      className="min-h-[34px] px-2.5 py-1 rounded-xl bg-[#0F1B2D] border border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC] font-bold cursor-pointer"
                    >
                      Nadiifi
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setInteractionTool('inspect');
                    setMultiSelectMode(false);
                    setSelectedBatchPlotIds([]);
                  }}
                  className="min-h-[34px] px-2.5 py-1 rounded-xl bg-[#0F1B2D] border border-[#243449] text-[#CBD5E1] hover:text-[#F8FAFC] font-bold cursor-pointer"
                >
                  Kormeer
                </button>
              </div>
            </div>
          )}

          {/* FLOATING THUMB-ZONE MAP ACTION CONTROLS (44x44px hitboxes) */}
          {subdivisionResult && mapGeometry && (
            <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
              <div className="flex flex-col bg-[#0B1220]/92 backdrop-blur-md border border-[#243449] rounded-2xl p-1 shadow-xl gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setInteractionTool('inspect');
                    setMultiSelectMode(false);
                    setSelectedBatchPlotIds([]);
                  }}
                  className={`min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
                    interactionTool === 'inspect'
                      ? 'bg-[#10B981] text-[#030712]'
                      : 'hover:bg-[#0F1B2D] text-[#F8FAFC]'
                  }`}
                  aria-label="Habka Kormeerka"
                  title="Kormeer Plot-ka (Inspect)"
                >
                  <MousePointerClick className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleZoom(1.35)}
                  className="min-h-[42px] min-w-[42px] rounded-xl hover:bg-[#0F1B2D] flex items-center justify-center text-[#F8FAFC] cursor-pointer"
                  aria-label="Weyneey khariirada"
                  title="Weyneey (+)"
                >
                  <ZoomIn className="w-4 h-4 text-[#10B981]" />
                </button>
                <button
                  type="button"
                  onClick={() => handleZoom(1 / 1.35)}
                  className="min-h-[42px] min-w-[42px] rounded-xl hover:bg-[#0F1B2D] flex items-center justify-center text-[#F8FAFC] cursor-pointer"
                  aria-label="Yaree khariirada"
                  title="Yaree (-)"
                >
                  <ZoomOut className="w-4 h-4 text-[#F8FAFC]" />
                </button>
                <button
                  type="button"
                  onClick={() => mapGeometry && setViewBox(mapGeometry.fitBox)}
                  className="min-h-[42px] min-w-[42px] rounded-xl hover:bg-[#0F1B2D] flex items-center justify-center text-[#F8FAFC] cursor-pointer"
                  aria-label="Muuji dhammaan khariirada"
                  title="Muuji Dhammaan"
                >
                  <Maximize2 className="w-4 h-4 text-[#10B981]" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMapLayerPopover((prev) => !prev);
                    setShowViewModePopover(false);
                  }}
                  className={`min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
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
                          const isBatchSelected = selectedBatchPlotIds.includes(q.id);
                          const isSelectedPlot = inspectedPlotId === q.id || isBatchSelected;
                          const px = mapGeometry.toX(q.centerUtm);
                          const py = mapGeometry.toY(q.centerUtm);

                          // 1. NON-FULL PLOTS: Outside OR Boundary-Clipped (Half Plot Valid / Jajab Manual / Invalid)
                          if (!q.full) {
                            const valStatus = hp?.validationStatus || 'half_plot_invalid';
                            const statusMeta = HALF_PLOT_STATUS_METADATA[valStatus];
                            const partialExcl = getEffectivePlotExclusion(
                              q,
                              subdivisionState.plotMetadata,
                              subdivisionState.blockMetadata
                            );
                            const partialAssign = fairAllocation?.plotAssignments[q.id];

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
                            const partialCustomFill = partialExcl.isExcluded
                              ? partialExcl.colorHex || 'url(#excludedPlotHatchPattern)'
                              : partialAssign?.ownerColorHex
                              ? partialAssign.ownerColorHex
                              : valStatus === 'half_plot_valid'
                              ? 'url(#validHalfPlotPattern)'
                              : statusMeta.fillHex;

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
                                      fill={partialCustomFill}
                                      fillOpacity={
                                        partialAssign?.ownerColorHex || partialExcl.isExcluded
                                          ? 0.92
                                          : mapColorMode === 'half_plots'
                                          ? 0.9
                                          : valStatus === 'half_plot_valid'
                                          ? 0.86
                                          : 0.6
                                      }
                                      stroke={
                                        isBatchSelected
                                          ? '#38BDF8'
                                          : isSelectedPlot
                                          ? '#fbbf24'
                                          : partialAssign?.ownerColorHex
                                          ? '#F8FAFC'
                                          : partialExcl.isExcluded
                                          ? '#FB7185'
                                          : statusMeta.strokeHex
                                      }
                                      strokeWidth={
                                        isBatchSelected ? 2.7 : isSelectedPlot ? 2.4 : 1.1
                                      }
                                      vectorEffect="non-scaling-stroke"
                                    >
                                      <title>{`${q.id} (Jajab/Half #${q.no}) · ${
                                        partialAssign?.ownerPersonName
                                          ? `Dhaxale: ${partialAssign.ownerPersonName}`
                                          : partialExcl.isExcluded
                                          ? partialExcl.specialName || 'Laga Reebay'
                                          : statusMeta.labelSomali
                                      }`}</title>
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
                                    stroke={
                                      isBatchSelected
                                        ? '#38BDF8'
                                        : isSelectedPlot
                                        ? '#fbbf24'
                                        : statusMeta.strokeHex
                                    }
                                    strokeWidth={
                                      isBatchSelected ? 2.6 : isSelectedPlot ? 2.2 : 0.95
                                    }
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
                            fillStyle =
                              pExcl.colorHex ||
                              pMeta.excludedColorHex ||
                              subdivisionState.blockMetadata[b.id]?.excludedColorHex ||
                              'url(#excludedPlotHatchPattern)';
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
                              strokeColor = assign.isWithinDooxa90m ? '#DC2626' : '#030712';
                              if (assign.isWithinDooxa90m) strokeW = 1.8;
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

                          if (isBatchSelected) {
                            strokeColor = '#38BDF8';
                            strokeW = 2.7;
                            strokeDash = undefined;
                          } else if (isSelectedPlot) {
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

              {/* MOBILE SLIDE-UP BOTTOM SHEET (always bottom sheet in APK Mobile Mode) + DESKTOP FLOATING PLOT INSPECTOR */}
              {inspectedPlot && subdivisionResult && (
                <>
                  {/* Mobile Backdrop */}
                  <div
                    className={`${
                      isApkMobileMode ? '' : 'md:hidden '
                    }fixed inset-0 z-40 bg-black/60 backdrop-blur-xs`}
                    onClick={() => setInspectedPlotId(null)}
                  />

                  <div
                    role="dialog"
                    aria-label={`Kormeerka Plot ${inspectedPlot.id}`}
                    className={
                      isApkMobileMode
                        ? 'fixed inset-x-0 bottom-0 z-50 rounded-t-3xl w-full max-h-[82vh] pb-safe flex flex-col bg-[#0B1220]/98 backdrop-blur-md border-t border-[#243449] shadow-2xl text-xs text-[#F8FAFC]'
                        : 'fixed inset-x-0 bottom-0 z-50 rounded-t-3xl md:rounded-2xl md:absolute md:inset-x-auto md:left-3 md:bottom-3 md:z-20 w-full md:w-[415px] max-h-[82vh] md:max-h-[88%] flex flex-col bg-[#0B1220]/98 backdrop-blur-md border-t md:border border-[#243449] shadow-2xl text-xs text-[#F8FAFC]'
                    }
                  >
                    {/* Mobile Drag Handle */}
                    <div
                      className={`${
                        isApkMobileMode ? '' : 'md:hidden '
                      }w-10 h-1.5 bg-[#243449] rounded-full mx-auto mt-2.5 mb-1 shrink-0`}
                    />

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

                            {/* UNIFIED MANUAL EDIT CARD (Plot, Jajab Plot & Block) */}
                            {(() => {
                              const pExcl = getEffectivePlotExclusion(
                                inspectedPlot,
                                subdivisionState.plotMetadata,
                                subdivisionState.blockMetadata
                              );
                              const bExcl = getEffectiveBlockExclusion(
                                inspectedPlot.block,
                                subdivisionState.blockMetadata
                              );
                              const activeBlock = subdivisionResult.blocks.find(
                                (b) => b.id === inspectedPlot.block
                              );
                              const blockPlotIds = activeBlock?.plots.map((pl) => pl.id) || [
                                inspectedPlot.id,
                              ];
                              const activeTargetIsExcluded =
                                inspectorScope === 'block' ? bExcl.isExcluded : pExcl.isExcluded;

                              return (
                                <div className="space-y-3 text-xs">
                                  {/* Scope Toggle: Plot Keliya vs Block oo Dhan */}
                                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#030712] border border-[#243449] font-bold text-[11px]">
                                    <button
                                      type="button"
                                      onClick={() => setInspectorScope('plot')}
                                      className={`min-h-[34px] rounded-lg px-2 cursor-pointer ${
                                        inspectorScope === 'plot'
                                          ? 'bg-[#10B981] text-[#030712] font-extrabold'
                                          : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                                      }`}
                                    >
                                      {inspectedPlot.full
                                        ? `Plot (${inspectedPlot.id})`
                                        : `Jajab (${inspectedPlot.id})`}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setInspectorScope('block')}
                                      className={`min-h-[34px] rounded-lg px-2 cursor-pointer ${
                                        inspectorScope === 'block'
                                          ? 'bg-[#10B981] text-[#030712] font-extrabold'
                                          : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                                      }`}
                                    >
                                      Block oo Dhan ({inspectedPlot.block} · {blockPlotIds.length})
                                    </button>
                                  </div>

                                  {/* Quick Stats Row */}
                                  <div className="grid grid-cols-2 gap-2 bg-[#0F1B2D] border border-[#243449] rounded-xl p-2.5 text-[11px] tabular-nums">
                                    <div>
                                      <span className="text-[#94A3B8] block">Bedka / Qiime:</span>
                                      <strong className="text-[#F8FAFC]">
                                        {calcArea} m²
                                        {pMeta.verifiedPrice != null
                                          ? ` · ${pMeta.verifiedPrice.toLocaleString()} ${currency}`
                                          : ''}
                                      </strong>
                                    </div>
                                    <div>
                                      <span className="text-[#94A3B8] block">Xaaladda Dooxa:</span>
                                      <strong
                                        className={
                                          assign?.isWithinDooxa90m
                                            ? 'text-red-400'
                                            : 'text-[#CBD5E1]'
                                        }
                                      >
                                        {assign?.isWithinDooxa90m
                                          ? '≤90m Dooxa (H3 · Giraan Cas)'
                                          : WADI_STATUS_METADATA[pMeta.wadiStatus].shortSomali}
                                      </strong>
                                    </div>
                                  </div>

                                  {/* Two Clean Modes: Pick Heir vs Custom Non-Inheritance Name */}
                                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#030712] border border-[#243449] text-[11px] font-bold">
                                    <button
                                      type="button"
                                      onClick={() => setInspectorAssignMode('heir')}
                                      className={`min-h-[34px] rounded-lg px-2 cursor-pointer ${
                                        inspectorAssignMode === 'heir'
                                          ? 'bg-[#F8FAFC] text-[#030712] font-extrabold'
                                          : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                                      }`}
                                    >
                                      1. Liiska Dhaxlayaasha
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setInspectorAssignMode('custom_name')}
                                      className={`min-h-[34px] rounded-lg px-2 cursor-pointer ${
                                        inspectorAssignMode === 'custom_name'
                                          ? 'bg-rose-600 text-white font-extrabold'
                                          : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                                      }`}
                                    >
                                      2. Magac Gaar ah (Danguud)
                                    </button>
                                  </div>

                                  {inspectorAssignMode === 'heir' ? (
                                    <div className="space-y-2 rounded-xl border border-[#243449] bg-[#0F1B2D] p-3">
                                      <div className="flex items-center justify-between gap-2 text-[11px]">
                                        <span className="font-bold text-[#F8FAFC]">
                                          {assign?.ownerPersonName
                                            ? `Hadda: ${assign.ownerPersonName}`
                                            : activeTargetIsExcluded
                                            ? `Laga reebay: ${pExcl.specialName || 'Gaar ah'}`
                                            : 'Waa bannaan yahay / Jajab'}
                                        </span>
                                        {subdivisionState.manualPlotHeirOverrides[
                                          inspectedPlot.id
                                        ] && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              applyManualHeirToPlotIds(
                                                inspectorScope === 'block'
                                                  ? blockPlotIds
                                                  : [inspectedPlot.id],
                                                '__auto__',
                                                inspectorScope === 'block'
                                                  ? `Block ${inspectedPlot.block}`
                                                  : `Plot ${inspectedPlot.id}`
                                              )
                                            }
                                            className="text-[10.5px] font-bold text-amber-300 hover:underline cursor-pointer"
                                          >
                                            Celi Otomaatig
                                          </button>
                                        )}
                                      </div>

                                      {fairAllocation && fairAllocation.heirAllocations.length > 0 ? (
                                        <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
                                          {fairAllocation.heirAllocations.map((h) => {
                                            const isOwner =
                                              subdivisionState.manualPlotHeirOverrides[
                                                inspectedPlot.id
                                              ] === h.heirKey || assign?.ownerHeirKey === h.heirKey;
                                            const qStatus = checkHeirPlotQuotaStatus(
                                              h,
                                              inspectorScope === 'block'
                                                ? blockPlotIds.length
                                                : inspectedPlot.full
                                                ? 1
                                                : 0.5
                                            );
                                            return (
                                              <button
                                                key={h.heirKey}
                                                type="button"
                                                onClick={() => {
                                                  const targetIds =
                                                    inspectorScope === 'block'
                                                      ? blockPlotIds
                                                      : [inspectedPlot.id];
                                                  const addUnits =
                                                    inspectorScope === 'block'
                                                      ? blockPlotIds.length
                                                      : inspectedPlot.full
                                                      ? 1
                                                      : 0.5;
                                                  const desc =
                                                    inspectorScope === 'block'
                                                      ? `Block ${inspectedPlot.block} (${blockPlotIds.length} plot)`
                                                      : `${inspectedPlot.full ? 'Plot' : 'Jajab'} ${inspectedPlot.id}`;
                                                  requestHeirAssignmentWithQuotaGuard(
                                                    h.heirKey,
                                                    addUnits,
                                                    desc,
                                                    () =>
                                                      applyManualHeirToPlotIds(
                                                        targetIds,
                                                        h.heirKey,
                                                        desc
                                                      )
                                                  );
                                                }}
                                                className={`w-full flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                                                  isOwner
                                                    ? 'border-[#10B981] bg-[#10B981]/15'
                                                    : 'border-[#243449] bg-[#0B1220] hover:border-[#10B981]/60'
                                                }`}
                                              >
                                                <span className="flex items-center gap-2 min-w-0">
                                                  <span
                                                    className="w-3 h-3 rounded-xs shrink-0 border border-white/25"
                                                    style={{ backgroundColor: h.colorHex }}
                                                  />
                                                  <span className="truncate font-bold text-[#F8FAFC] text-[11.5px]">
                                                    {h.personName}
                                                  </span>
                                                </span>
                                                <span
                                                  className={`shrink-0 font-mono-numbers tabular-nums text-[10.5px] font-bold ${
                                                    qStatus.isAlreadyFull
                                                      ? 'text-amber-300'
                                                      : 'text-[#10B981]'
                                                  }`}
                                                >
                                                  {formatPlotQtyCompact(
                                                    h.effectiveTotalPlotsReceived
                                                  )}
                                                  /{qStatus.roundedTarget}
                                                </span>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <p className="text-[11px] text-[#94A3B8]">
                                          Marka hore xisaabi dhaxlayaasha bogga{' '}
                                          <strong className="text-[#F8FAFC]">
                                            Dhaxal Xisaabinta
                                          </strong>
                                          .
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="space-y-2.5 rounded-xl border border-rose-500/40 bg-rose-950/25 p-3">
                                      <div>
                                        <label className="block text-[10.5px] font-bold text-rose-200 mb-1">
                                          Magac Gaar ah (Dhul aan ku jirin dhaxalka):
                                        </label>
                                        <input
                                          type="text"
                                          value={customNameDraft}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setCustomNameDraft(v);
                                            if (activeTargetIsExcluded) {
                                              if (inspectorScope === 'block') {
                                                setBlockExclusionState(
                                                  inspectedPlot.block,
                                                  true,
                                                  v,
                                                  customColorDraft
                                                );
                                              } else {
                                                setPlotExclusionState(
                                                  inspectedPlot.id,
                                                  inspectedPlot.block,
                                                  true,
                                                  v,
                                                  customColorDraft
                                                );
                                              }
                                            }
                                          }}
                                          placeholder="Qor magac gaar ah (ama ka tag banaan)..."
                                          className="w-full min-h-[36px] bg-[#0B1220] border border-rose-500/45 rounded-lg px-2.5 py-1 text-xs font-bold text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-rose-400"
                                        />
                                      </div>

                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        {SPECIAL_EXCLUSION_PRESETS.map((preset) => (
                                          <button
                                            key={preset}
                                            type="button"
                                            onClick={() => {
                                              setCustomNameDraft(preset);
                                              if (inspectorScope === 'block') {
                                                setBlockExclusionState(
                                                  inspectedPlot.block,
                                                  true,
                                                  preset,
                                                  customColorDraft
                                                );
                                              } else {
                                                setPlotExclusionState(
                                                  inspectedPlot.id,
                                                  inspectedPlot.block,
                                                  true,
                                                  preset,
                                                  customColorDraft
                                                );
                                              }
                                            }}
                                            className={`px-2.5 py-1 rounded-md border text-[11px] font-bold cursor-pointer ${
                                              customNameDraft === preset
                                                ? 'bg-rose-600 text-white border-rose-500'
                                                : 'bg-[#0B1220] text-[#F8FAFC] border-[#243449] hover:border-rose-400'
                                            }`}
                                          >
                                            {preset}
                                          </button>
                                        ))}

                                        <div className="flex items-center gap-1">
                                          {CUSTOM_EXCLUDED_COLOR_CHOICES.slice(0, 6).map((cHex) => (
                                            <button
                                              key={cHex}
                                              type="button"
                                              onClick={() => {
                                                setCustomColorDraft(cHex);
                                                if (activeTargetIsExcluded) {
                                                  if (inspectorScope === 'block') {
                                                    setBlockExclusionState(
                                                      inspectedPlot.block,
                                                      true,
                                                      customNameDraft,
                                                      cHex
                                                    );
                                                  } else {
                                                    setPlotExclusionState(
                                                      inspectedPlot.id,
                                                      inspectedPlot.block,
                                                      true,
                                                      customNameDraft,
                                                      cHex
                                                    );
                                                  }
                                                }
                                              }}
                                              className={`w-5 h-5 rounded border cursor-pointer ${
                                                customColorDraft === cHex
                                                  ? 'border-white scale-110'
                                                  : 'border-white/25 opacity-80'
                                              }`}
                                              style={{ backgroundColor: cHex }}
                                              title={`Midabka: ${cHex}`}
                                            />
                                          ))}
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap gap-1.5 pt-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (inspectorScope === 'block') {
                                              setBlockExclusionState(
                                                inspectedPlot.block,
                                                true,
                                                customNameDraft.trim(),
                                                customColorDraft
                                              );
                                            } else {
                                              setPlotExclusionState(
                                                inspectedPlot.id,
                                                inspectedPlot.block,
                                                true,
                                                customNameDraft.trim(),
                                                customColorDraft
                                              );
                                            }
                                          }}
                                          className="flex-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                                        >
                                          Ku Xidh (Ka Reeb Dhaxalka)
                                        </button>
                                        {activeTargetIsExcluded && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (inspectorScope === 'block') {
                                                setBlockExclusionState(inspectedPlot.block, false);
                                              } else {
                                                setPlotExclusionState(
                                                  inspectedPlot.id,
                                                  inspectedPlot.block,
                                                  false
                                                );
                                              }
                                            }}
                                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-[#030712] font-extrabold cursor-pointer"
                                          >
                                            Dib ugu Dar
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Quick Tier Override Buttons */}
                                  <div className="flex items-center justify-between gap-2 pt-1">
                                    <span className="text-[11px] font-semibold text-[#94A3B8]">
                                      Beddel Heerka:
                                    </span>
                                    <div className="inline-flex gap-1">
                                      {(
                                        [
                                          'tier_1_prime',
                                          'tier_2_standard',
                                          'tier_3_basic',
                                        ] as AssetQualityTier[]
                                      ).map((tk, idx) => (
                                        <button
                                          key={tk}
                                          type="button"
                                          onClick={() => {
                                            onUpdateSubdivisionState((prev) => {
                                              if (inspectorScope === 'block') {
                                                return {
                                                  ...prev,
                                                  blockTiers: {
                                                    ...prev.blockTiers,
                                                    [inspectedPlot.block]: tk,
                                                  },
                                                };
                                              }
                                              return {
                                                ...prev,
                                                plotTierOverrides: {
                                                  ...prev.plotTierOverrides,
                                                  [inspectedPlot.id]: tk,
                                                },
                                              };
                                            });
                                          }}
                                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                                            pTier === tk
                                              ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                                              : 'bg-[#0F1B2D] text-[#CBD5E1] border-[#243449]'
                                          }`}
                                        >
                                          H{idx + 1}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="flex items-center justify-end pt-2 border-t border-[#243449]">
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

            {/* CONTEXTUAL STUDIO WORKBENCH SHEET (Slides open right above 4-Step Dock) */}
            {activeStudioSheet && (
              <div className="border-t border-[#243449] bg-[#0B1220] p-3.5 sm:p-4 max-h-[46vh] overflow-y-auto space-y-3">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#243449]">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[#10B981]">
                    {activeStudioSheet === 'shabakad'
                      ? '1. Shabakadda & Jiheynta'
                      : activeStudioSheet === 'heer_aag'
                      ? '2. Heerarka (≤90m) & Aagga (A–D)'
                      : activeStudioSheet === 'qaybi'
                      ? '3. Qaybi Gacanta (Dhaxlayaal · Jajab · Danguud)'
                      : '4. Qaybinta & Simple PDF'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveStudioSheet(null)}
                    className="min-h-[32px] min-w-[32px] rounded-lg bg-[#0F1B2D] border border-[#243449] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                    aria-label="Xir sanduuqa qalabka"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* SHEET 1: SHABAKAD */}
                {activeStudioSheet === 'shabakad' && (
                  <div className="space-y-3 text-xs">
                    {!subdivisionState.prebuiltSubdivision &&
                      subdivisionState.boundaryItems.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                              Xuduudka Beerta
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
                              className="w-full min-h-[40px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 py-1.5 text-xs font-medium text-[#F8FAFC]"
                            >
                              {subdivisionState.boundaryItems.map((it, i) => (
                                <option key={i} value={i}>
                                  {it.name} ({it.coords.length} dhibcood)
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                              Block Tusaale (Jihada Shabakadda)
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
                              className="w-full min-h-[40px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 py-1.5 text-xs font-medium text-[#F8FAFC]"
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

                    {!subdivisionState.prebuiltSubdivision && (
                      <div className="space-y-2.5 pt-2 border-t border-[#243449]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-[#CBD5E1]">
                            Halbeegga Rasmiga ah
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateSubdivisionState((prev) => ({
                                ...prev,
                                prebuiltSubdivision: null,
                                approvalStatus:
                                  prev.approvalStatus === 'approved'
                                    ? 'under_review'
                                    : prev.approvalStatus,
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
                                'Block kasta waxaa lagu fadhiisiyey 48×90m · Waddo 15m · Plot 18×24m.'
                              );
                            }}
                            className="min-h-[34px] px-3 py-1 rounded-xl bg-[#10B981]/15 border border-[#10B981]/50 text-xs font-extrabold text-[#10B981] cursor-pointer tabular-nums"
                          >
                            Ku Celi 48×90m · 15m
                          </button>
                        </div>

                        <details>
                          <summary className="text-[11px] font-bold text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer select-none">
                            Tifatir Sare (Cabbirrada Mitir &amp; Jiheynta)
                          </summary>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                            <div>
                              <label className="block text-[10px] text-[#94A3B8] mb-0.5">
                                Block Dherer (m)
                              </label>
                              <input
                                type="number"
                                min={1}
                                step={0.5}
                                value={subdivisionState.params.L}
                                onChange={(e) => updateParam('L', parseFloat(e.target.value) || 0)}
                                className="w-full min-h-[36px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2 py-1 text-xs font-mono-numbers tabular-nums text-[#F8FAFC]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#94A3B8] mb-0.5">
                                Block Ballac (m)
                              </label>
                              <input
                                type="number"
                                min={1}
                                step={0.5}
                                value={subdivisionState.params.W}
                                onChange={(e) => updateParam('W', parseFloat(e.target.value) || 0)}
                                className="w-full min-h-[36px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2 py-1 text-xs font-mono-numbers tabular-nums text-[#F8FAFC]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#94A3B8] mb-0.5">
                                Plot Ballac (m)
                              </label>
                              <input
                                type="number"
                                min={1}
                                step={0.5}
                                value={subdivisionState.params.pw}
                                onChange={(e) => updateParam('pw', parseFloat(e.target.value) || 0)}
                                className="w-full min-h-[36px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2 py-1 text-xs font-mono-numbers tabular-nums text-[#F8FAFC]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#94A3B8] mb-0.5">
                                Plot Dherer (m)
                              </label>
                              <input
                                type="number"
                                min={1}
                                step={0.5}
                                value={subdivisionState.params.pd}
                                onChange={(e) => updateParam('pd', parseFloat(e.target.value) || 0)}
                                className="w-full min-h-[36px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2 py-1 text-xs font-mono-numbers tabular-nums text-[#F8FAFC]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#94A3B8] mb-0.5">
                                Waddo U (m)
                              </label>
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                value={subdivisionState.params.rU}
                                onChange={(e) =>
                                  updateParam('rU', Math.max(0, parseFloat(e.target.value) || 0))
                                }
                                className="w-full min-h-[36px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2 py-1 text-xs font-mono-numbers tabular-nums text-[#F8FAFC]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#94A3B8] mb-0.5">
                                Waddo V (m)
                              </label>
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                value={subdivisionState.params.rV}
                                onChange={(e) =>
                                  updateParam('rV', Math.max(0, parseFloat(e.target.value) || 0))
                                }
                                className="w-full min-h-[36px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2 py-1 text-xs font-mono-numbers tabular-nums text-[#F8FAFC]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#94A3B8] mb-0.5">
                                Jiheyn (°)
                              </label>
                              <input
                                type="number"
                                step={0.5}
                                value={subdivisionState.params.rot}
                                onChange={(e) =>
                                  updateParam('rot', parseFloat(e.target.value) || 0)
                                }
                                className="w-full min-h-[36px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2 py-1 text-xs font-mono-numbers tabular-nums text-[#F8FAFC]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#94A3B8] mb-0.5">
                                U-dhaaf U (m)
                              </label>
                              <input
                                type="number"
                                step={0.5}
                                value={subdivisionState.params.su}
                                onChange={(e) => updateParam('su', parseFloat(e.target.value) || 0)}
                                className="w-full min-h-[36px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2 py-1 text-xs font-mono-numbers tabular-nums text-[#F8FAFC]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#94A3B8] mb-0.5">
                                U-dhaaf V (m)
                              </label>
                              <input
                                type="number"
                                step={0.5}
                                value={subdivisionState.params.sv}
                                onChange={(e) => updateParam('sv', parseFloat(e.target.value) || 0)}
                                className="w-full min-h-[36px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2 py-1 text-xs font-mono-numbers tabular-nums text-[#F8FAFC]"
                              />
                            </div>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                )}

                {/* SHEET 2: HEER & AAG */}
                {activeStudioSheet === 'heer_aag' && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#030712] border border-[#243449] font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setTierEvalMode('automatic');
                          if (interactionTool === 'mark_tier') setInteractionTool('inspect');
                        }}
                        className={`min-h-[34px] rounded-lg cursor-pointer ${
                          tierEvalMode === 'automatic'
                            ? 'bg-[#10B981] text-[#030712] font-extrabold'
                            : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        1. Auto DEM + ≤90m
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTierEvalMode('manual');
                          setInteractionTool('mark_tier');
                          setMapColorMode('tiers');
                        }}
                        className={`min-h-[34px] rounded-lg cursor-pointer ${
                          tierEvalMode === 'manual'
                            ? 'bg-[#10B981] text-[#030712] font-extrabold'
                            : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        2. Rinjiyeyn Gacan
                      </button>
                    </div>

                    {tierEvalMode === 'automatic' ? (
                      <button
                        type="button"
                        disabled={!subdivisionResult || isRunningAutoDem}
                        onClick={() => void handleRunCadAutomaticDemTiers()}
                        className="w-full min-h-[42px] rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-45 text-[#030712] px-3 py-2 text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isRunningAutoDem ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            <span>Waa la xisaabinayaa DEM &amp; Dooxa ≤90m...</span>
                          </>
                        ) : (
                          <>
                            <Mountain className="w-4 h-4 shrink-0" />
                            <span>Dhali Heerarka (DEM + Waddo + ≤90m Dooxa)</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#030712] border border-[#243449] font-bold text-[11px]">
                          {(
                            [
                              { id: 'plot', label: 'Plot' },
                              { id: 'block', label: 'Block' },
                              { id: 'freehand', label: 'Sawir Gacan' },
                            ] as const
                          ).map((sc) => (
                            <button
                              key={sc.id}
                              type="button"
                              onClick={() => {
                                setTierBrushScope(sc.id);
                                setInteractionTool('mark_tier');
                                setMapColorMode('tiers');
                              }}
                              className={`min-h-[32px] rounded-lg cursor-pointer ${
                                tierBrushScope === sc.id && interactionTool === 'mark_tier'
                                  ? 'bg-[#F8FAFC] text-[#030712]'
                                  : 'text-[#94A3B8]'
                              }`}
                            >
                              {sc.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Compact 3-Tier Cards (Tap to paint + unit price) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(
                        ['tier_1_prime', 'tier_2_standard', 'tier_3_basic'] as AssetQualityTier[]
                      ).map((tierKey) => {
                        const meta = TIER_METADATA[tierKey];
                        const count = fairAllocation?.tierCounts[tierKey] ?? 0;
                        const active =
                          interactionTool === 'mark_tier' && activeTierBrush === tierKey;
                        return (
                          <div
                            key={tierKey}
                            className={`rounded-xl border p-2.5 flex items-center justify-between gap-2 ${
                              active
                                ? 'border-[#10B981] bg-[#10B981]/15'
                                : 'border-[#243449] bg-[#0F1B2D]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setTierEvalMode('manual');
                                setActiveTierBrush(tierKey);
                                setInteractionTool('mark_tier');
                                setMapColorMode('tiers');
                              }}
                              className="flex items-center gap-2 min-w-0 text-left cursor-pointer"
                            >
                              <span
                                className="w-3 h-3 rounded-xs shrink-0"
                                style={{ backgroundColor: meta.fillHex }}
                              />
                              <div className="min-w-0">
                                <div className="font-extrabold text-[#F8FAFC]">{meta.code}</div>
                                <div className="text-[10px] text-[#10B981] tabular-nums">
                                  {count} Plot
                                </div>
                              </div>
                            </button>
                            <input
                              type="number"
                              min={0}
                              step={100}
                              value={subdivisionState.tierUnitPrices[tierKey] || ''}
                              placeholder={currency}
                              onChange={(e) => {
                                const price = Math.max(0, parseFloat(e.target.value) || 0);
                                onUpdateSubdivisionState((prev) => ({
                                  ...prev,
                                  tierUnitPrices: { ...prev.tierUnitPrices, [tierKey]: price },
                                }));
                              }}
                              className="w-20 min-h-[32px] bg-[#0B1220] border border-[#243449] rounded-lg px-2 py-1 text-right text-xs font-mono-numbers tabular-nums text-[#F8FAFC]"
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Zones A-D + Anti-Adjacent */}
                    <div className="pt-2 border-t border-[#243449] space-y-2">
                      <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => handleApplyZonePreset('quadrants_4')}
                          className={`min-h-[34px] py-1 px-2 rounded-xl border font-bold cursor-pointer ${
                            subdivisionState.zonePresetMode === 'quadrants_4'
                              ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                              : 'bg-[#0F1B2D] text-[#CBD5E1] border-[#243449]'
                          }`}
                        >
                          4-Dhinac
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyZonePreset('columns_4')}
                          className={`min-h-[34px] py-1 px-2 rounded-xl border font-bold cursor-pointer ${
                            subdivisionState.zonePresetMode === 'columns_4'
                              ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                              : 'bg-[#0F1B2D] text-[#CBD5E1] border-[#243449]'
                          }`}
                        >
                          Bari–Galbeed
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyZonePreset('rows_4')}
                          className={`min-h-[34px] py-1 px-2 rounded-xl border font-bold cursor-pointer ${
                            subdivisionState.zonePresetMode === 'rows_4'
                              ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                              : 'bg-[#0F1B2D] text-[#CBD5E1] border-[#243449]'
                          }`}
                        >
                          Waqooyi–Koonfur
                        </button>
                      </div>

                      {fairAllocation && fairAllocation.zones.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
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
                                className={`min-h-[34px] px-2.5 py-1 rounded-xl border inline-flex items-center gap-1.5 font-bold cursor-pointer ${
                                  active
                                    ? 'border-[#10B981] bg-[#10B981]/18 text-[#F8FAFC]'
                                    : 'border-[#243449] bg-[#0F1B2D] text-[#CBD5E1]'
                                }`}
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-xs"
                                  style={{ backgroundColor: z.colorHex }}
                                />
                                <span>{z.zoneId}</span>
                                <span className="text-[10px] text-[#10B981] tabular-nums">
                                  ({z.totalPlots})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <label className="flex items-center gap-2 rounded-xl bg-[#10B981]/10 border border-[#10B981]/35 p-2.5 text-xs text-[#F8FAFC] cursor-pointer select-none">
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
                          className="rounded border-[#10B981] accent-[#10B981]"
                        />
                        <span className="font-bold">
                          Ka Ilaali Laba Block oo Is-xiga (Firdhi Zones &amp; Heerarka)
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* SHEET 3: QAYBI GACANTA (Heirs + Jajab + Multi-Tap + Custom Name / Danguud) */}
                {activeStudioSheet === 'qaybi' && (
                  <div className="space-y-2.5 text-xs">
                    {/* Top Row: Painter Mode (Dhaxlayaal vs Danguud) + Multi-Tap Switch */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex rounded-xl bg-[#030712] border border-[#243449] p-1 font-bold text-[11px]">
                        <button
                          type="button"
                          onClick={() => {
                            setQaybiPaintMode('heir');
                            setInteractionTool('assign_heir');
                            setMapColorMode('heirs');
                          }}
                          className={`min-h-[32px] px-3 rounded-lg cursor-pointer ${
                            qaybiPaintMode === 'heir'
                              ? 'bg-[#10B981] text-[#030712] font-extrabold'
                              : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                          }`}
                        >
                          1. Sii Dhaxle (Jajab/Plot)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setQaybiPaintMode('custom_name');
                            setInteractionTool('mark_exclusion');
                            setMapColorMode('excluded');
                          }}
                          className={`min-h-[32px] px-3 rounded-lg cursor-pointer ${
                            qaybiPaintMode === 'custom_name'
                              ? 'bg-rose-600 text-white font-extrabold'
                              : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                          }`}
                        >
                          2. Magac Gaar ah (Danguud)
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const next = !multiSelectMode;
                          setMultiSelectMode(next);
                          if (!next) setSelectedBatchPlotIds([]);
                          if (interactionTool === 'inspect') {
                            setInteractionTool(
                              qaybiPaintMode === 'custom_name' ? 'mark_exclusion' : 'assign_heir'
                            );
                          }
                        }}
                        className={`min-h-[34px] px-3 py-1 rounded-xl border inline-flex items-center gap-1.5 font-extrabold cursor-pointer transition-colors ${
                          multiSelectMode
                            ? 'bg-sky-500 text-[#030712] border-sky-400'
                            : 'bg-[#0F1B2D] text-[#CBD5E1] border-[#243449] hover:border-sky-400'
                        }`}
                      >
                        <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                        <span>Xulo Badan (Multi-Tap)</span>
                      </button>
                    </div>

                    {qaybiPaintMode === 'heir' ? (
                      <div className="space-y-2">
                        {fairAllocation && fairAllocation.heirAllocations.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {fairAllocation.heirAllocations.map((h) => {
                              const active =
                                interactionTool === 'assign_heir' &&
                                selectedHeirKeyForBrush === h.heirKey;
                              const qStatus = checkHeirPlotQuotaStatus(h, 1);
                              return (
                                <button
                                  key={h.heirKey}
                                  type="button"
                                  onClick={() => {
                                    setSelectedHeirKeyForBrush(h.heirKey);
                                    setInteractionTool('assign_heir');
                                    setMapColorMode('heirs');
                                  }}
                                  className={`min-h-[42px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-left cursor-pointer transition-colors ${
                                    active
                                      ? 'border-[#10B981] bg-[#10B981]/15'
                                      : 'border-[#243449] bg-[#0F1B2D] hover:border-[#10B981]/60'
                                  }`}
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <span
                                      className="w-3.5 h-3.5 rounded-xs shrink-0 border border-white/25"
                                      style={{ backgroundColor: h.colorHex }}
                                    />
                                    <span className="font-bold text-[#F8FAFC] truncate">
                                      {h.personName}
                                    </span>
                                  </span>
                                  <span
                                    className={`font-mono-numbers tabular-nums text-[11px] font-extrabold shrink-0 ${
                                      qStatus.isAlreadyFull ? 'text-amber-300' : 'text-[#10B981]'
                                    }`}
                                  >
                                    {formatPlotQtyCompact(h.effectiveTotalPlotsReceived)}/
                                    {qStatus.roundedTarget}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-3 flex items-center justify-between gap-2">
                            <span className="text-[#94A3B8]">
                              Marka hore dooro dhaxlayaasha bogga Xisaabinta.
                            </span>
                            <button
                              type="button"
                              onClick={onNavigateToCalculator}
                              className="px-3 py-1.5 rounded-lg bg-[#10B981] text-[#030712] font-extrabold cursor-pointer"
                            >
                              Tag Xisaabinta
                            </button>
                          </div>
                        )}
                        <p className="text-[11px] text-[#94A3B8]">
                          Taabo magaca dhaxlaha kadibna taabo <strong>Plot</strong>,{' '}
                          <strong>Jajab/Half</strong>, ama shid <strong>Xulo Badan</strong> si aad hal mar dhowr plot u wada siiso.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5 rounded-xl bg-rose-950/25 border border-rose-500/40 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="inline-flex rounded-lg bg-[#0B1220] border border-[#243449] p-0.5 font-bold text-[11px]">
                            <button
                              type="button"
                              onClick={() => setExclusionBrushScope('plot')}
                              className={`min-h-[30px] px-2.5 rounded-md cursor-pointer ${
                                exclusionBrushScope === 'plot'
                                  ? 'bg-rose-600 text-white'
                                  : 'text-[#94A3B8]'
                              }`}
                            >
                              Plot / Jajab
                            </button>
                            <button
                              type="button"
                              onClick={() => setExclusionBrushScope('block')}
                              className={`min-h-[30px] px-2.5 rounded-md cursor-pointer ${
                                exclusionBrushScope === 'block'
                                  ? 'bg-rose-600 text-white'
                                  : 'text-[#94A3B8]'
                              }`}
                            >
                              Block oo Dhan
                            </button>
                          </div>

                          <div className="inline-flex rounded-lg bg-[#0B1220] border border-[#243449] p-0.5 font-bold text-[11px]">
                            <button
                              type="button"
                              onClick={() => {
                                setExclusionBrushMode('exclude');
                                setInteractionTool('mark_exclusion');
                              }}
                              className={`min-h-[30px] px-2.5 rounded-md cursor-pointer ${
                                exclusionBrushMode === 'exclude'
                                  ? 'bg-rose-600 text-white'
                                  : 'text-[#94A3B8]'
                              }`}
                            >
                              Ka Reeb
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setExclusionBrushMode('include');
                                setInteractionTool('mark_exclusion');
                              }}
                              className={`min-h-[30px] px-2.5 rounded-md cursor-pointer ${
                                exclusionBrushMode === 'include'
                                  ? 'bg-[#10B981] text-[#030712]'
                                  : 'text-[#94A3B8]'
                              }`}
                            >
                              Dib ugu Dar
                            </button>
                          </div>
                        </div>

                        {exclusionBrushMode === 'exclude' && (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={exclusionBrushSpecialName}
                              onChange={(e) => {
                                setExclusionBrushSpecialName(e.target.value);
                                setInteractionTool('mark_exclusion');
                              }}
                              placeholder="Magac gaar ah (ama ka tag banaan)..."
                              className="flex-1 min-w-[175px] min-h-[38px] bg-[#0B1220] border border-rose-500/45 rounded-xl px-3 py-1.5 text-xs font-bold text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-rose-400"
                            />
                            {SPECIAL_EXCLUSION_PRESETS.map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  setExclusionBrushSpecialName(preset);
                                  setInteractionTool('mark_exclusion');
                                }}
                                className={`min-h-[36px] px-3 py-1 rounded-xl border text-xs font-extrabold cursor-pointer ${
                                  exclusionBrushSpecialName === preset
                                    ? 'bg-rose-600 text-white border-rose-500'
                                    : 'bg-[#0B1220] text-[#F8FAFC] border-[#243449]'
                                }`}
                              >
                                {preset}
                              </button>
                            ))}
                            <div className="flex items-center gap-1">
                              {CUSTOM_EXCLUDED_COLOR_CHOICES.slice(0, 6).map((cHex) => (
                                <button
                                  key={cHex}
                                  type="button"
                                  onClick={() => {
                                    setExclusionBrushColorHex(cHex);
                                    setInteractionTool('mark_exclusion');
                                  }}
                                  className={`w-6 h-6 rounded-md border cursor-pointer ${
                                    exclusionBrushColorHex === cHex
                                      ? 'border-white scale-110'
                                      : 'border-white/25 opacity-80'
                                  }`}
                                  style={{ backgroundColor: cHex }}
                                  title={`Midabka: ${cHex}`}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* SHEET 4: PDF & XIDH */}
                {activeStudioSheet === 'pdf_xidh' && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                      {(
                        [
                          'clean_equal_no_half_no_fraction',
                          'whole_balanced',
                          'exact_shared',
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
                              }))
                            }
                            className={`text-left rounded-xl border p-2.5 cursor-pointer transition-colors ${
                              isActive
                                ? 'border-[#10B981] bg-[#10B981]/12'
                                : 'border-[#243449] bg-[#0F1B2D]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 font-bold text-[#F8FAFC]">
                              <span className="truncate">{meta.shortSomali}</span>
                              {isActive && <Check className="w-3.5 h-3.5 text-[#10B981] shrink-0" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-2.5 flex items-center justify-between gap-2">
                      <span className="font-bold text-[#F8FAFC]">Half-Plots Otomaatig (0.5 Plot)</span>
                      <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[#0B1220] border border-[#243449]">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSubdivisionState((prev) => ({
                              ...prev,
                              includeValidHalfPlotsInAllocation: true,
                            }))
                          }
                          className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                            subdivisionState.includeValidHalfPlotsInAllocation
                              ? 'bg-[#10B981] text-[#030712]'
                              : 'text-[#94A3B8]'
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
                            }))
                          }
                          className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                            !subdivisionState.includeValidHalfPlotsInAllocation
                              ? 'bg-[#1E293B] text-[#F8FAFC]'
                              : 'text-[#94A3B8]'
                          }`}
                        >
                          Ka Reeb
                        </button>
                      </div>
                    </div>

                    {fairAllocation && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#0F1B2D] border border-[#243449] px-3 py-2 text-[11px] tabular-nums">
                        <span>
                          La qaybiyey:{' '}
                          <strong className="text-[#10B981]">
                            {fairAllocation.allocatedFullPlotsCount ?? fairAllocation.totalFullPlots}/
                            {fairAllocation.totalFullPlots}
                          </strong>
                        </span>
                        {(fairAllocation.withheldJajabPlotsCount ?? 0) > 0 && (
                          <span className="text-amber-300">
                            Jajab: <strong>{fairAllocation.withheldJajabPlotsCount}</strong>
                          </span>
                        )}
                        {(fairAllocation.excludedPlotsCount ?? 0) > 0 && (
                          <span className="text-rose-300">
                            Reeban: <strong>{fairAllocation.excludedPlotsCount}</strong>
                          </span>
                        )}
                        {manualOverrideCount > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSubdivisionState((prev) => ({
                                ...prev,
                                manualPlotHeirOverrides: {},
                                approvalStatus: 'draft_proposal',
                              }))
                            }
                            className="inline-flex items-center gap-1 font-bold text-[#10B981] hover:underline cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Celi Gacanta ({manualOverrideCount})</span>
                          </button>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={onSyncAndLinkToEstate}
                        disabled={!subdivisionResult || subdivisionResult.plots.length === 0}
                        className="min-h-[44px] rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] text-[#F8FAFC] font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                      >
                        <Link2 className="w-4 h-4 text-[#10B981]" />
                        <span>Ku Xidh Xisaabta</span>
                      </button>
                      {subdivisionResult && fairAllocation && (
                        <button
                          type="button"
                          onClick={() => setShowSimplePdfModal(true)}
                          className="min-h-[44px] rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <FileText className="w-4 h-4" />
                          <span>Simple PDF</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4-STEP FLOATING THUMB-ZONE ACTION DOCK */}
            <div className="border-t border-[#243449] bg-[#0F1B2D]/95 p-1.5 grid grid-cols-4 gap-1">
              {(
                [
                  { id: 'shabakad', label: '1. Shabakad', icon: Grid },
                  { id: 'heer_aag', label: '2. Heer & Aag', icon: Mountain },
                  { id: 'qaybi', label: '3. Qaybi', icon: Paintbrush },
                  { id: 'pdf_xidh', label: '4. PDF & Xidh', icon: FileText },
                ] as const
              ).map((step) => {
                const Icon = step.icon;
                const active = activeStudioSheet === step.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      setShowViewModePopover(false);
                      setShowMapLayerPopover(false);
                      setActiveStudioSheet((prev) => (prev === step.id ? null : step.id));
                    }}
                    className={`min-h-[48px] px-1.5 py-1.5 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#10B981] text-[#030712] font-extrabold shadow'
                        : 'text-[#CBD5E1] hover:bg-[#0B1220] hover:text-[#F8FAFC]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-[10.5px] sm:text-xs font-bold leading-none truncate max-w-full">
                      {step.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {subdivisionResult && subdivisionResult.warnings.length > 0 && (
              <div className="px-4 py-2 bg-amber-950/35 border-t border-amber-500/40 text-xs text-amber-200">
                {subdivisionResult.warnings.join(' · ')}
              </div>
            )}
            {fairAllocation &&
              fairAllocation.fairnessWarnings.length > 0 &&
              fairAllocation.heirAllocations.length > 0 && (
                <div className="px-4 py-2 bg-[#0F1B2D] border-t border-[#243449] text-xs text-amber-200">
                  {fairAllocation.fairnessWarnings[0]}
                </div>
              )}
          </section>

      {/* Quota Guard Permission Modal */}
      <CadQuotaPermissionModal
        isOpen={Boolean(pendingQuotaAction)}
        targetDescription={pendingQuotaAction?.targetDescription || ''}
        heir={
          pendingQuotaAction
            ? fairAllocation?.heirAllocations.find(
                (h) => h.heirKey === pendingQuotaAction.heirKey
              ) || null
            : null
        }
        quotaStatus={pendingQuotaAction?.quotaStatus || null}
        onConfirm={() => {
          const fn = pendingQuotaAction?.applyFn;
          setPendingQuotaAction(null);
          fn?.();
        }}
        onCancel={() => setPendingQuotaAction(null)}
      />

      {/* Simple Ilma Cige Style PDF Export Modal */}
      {subdivisionResult && fairAllocation && (
        <SimpleInheritancePdfModal
          isOpen={showSimplePdfModal}
          onClose={() => setShowSimplePdfModal(false)}
          subdivisionResult={subdivisionResult}
          subdivisionState={subdivisionState}
          fairAllocation={fairAllocation}
          activeCaseMeta={activeCaseMeta}
        />
      )}
    </div>
  );
};
