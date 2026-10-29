import React, { useMemo, useState } from 'react';
import {
  CaseLifecycleStatus,
  Currency,
  EstateAssetItem,
  EstateDeductionItem,
  HeirsInput,
  InheritanceCalculationResult,
  SavedInheritanceCase,
} from '../types/inheritance';
import {
  FairLandAllocationResult,
  GeneratedBlock,
  GeneratedPlot,
  LandSubdivisionState,
  SubdivisionComputationResult,
} from '../types/landSubdivision';
import { calculateComprehensiveEstateDistribution } from '../utils/estateAssetDistributionEngine';
import { getEditableGroupKeyForShareId, updateHeirPersonName } from '../utils/heirNameUtils';
import { CASE_STATUS_METADATA } from '../utils/caseManagementEngine';
import { CaseManagementView } from './CaseManagementView';
import { ExcelSpreadsheetView } from './ExcelSpreadsheetView';
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FolderCog,
  Grid,
  Layers,
  MapPin,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from 'lucide-react';

export type ListDataCategoryTab = 'cases' | 'blocks' | 'plots' | 'heirs' | 'excel';

interface ListDataViewProps {
  activeCategory: ListDataCategoryTab;
  onChangeCategory: (cat: ListDataCategoryTab) => void;
  savedCases: SavedInheritanceCase[];
  activeCase: SavedInheritanceCase | null;
  heirsInput: HeirsInput;
  assets: EstateAssetItem[];
  deductions: EstateDeductionItem[];
  result: InheritanceCalculationResult;
  currency: Currency;
  currentHasMap: boolean;
  subdivisionState: LandSubdivisionState;
  subdivisionResult: SubdivisionComputationResult | null;
  fairLandAllocation: FairLandAllocationResult | null;
  onUpdateHeirsInput: (updated: HeirsInput) => void;
  onOpenCase: (caseRecord: SavedInheritanceCase) => void;
  onCreateNewCase: (params: {
    caseName: string;
    referenceNumber: string;
    caseDate: string;
    description: string;
    status: CaseLifecycleStatus;
    deceasedName: string;
    explicitlyConfirmedSubdivision: {
      state: LandSubdivisionState;
      sourceLabel: string;
      blocksCount: number;
      fullPlotsCount: number;
      validHalfPlotsCount: number;
      clippedPlotsCount: number;
    } | null;
  }) => { ok: boolean; errorSomali?: string };
  onSaveActiveCaseUpdates: (params: {
    caseName: string;
    caseDate: string;
    description: string;
    status: CaseLifecycleStatus;
    changeReason?: string;
  }) => void;
  onCloseCaseStatus: (caseId: string, reason?: string) => void;
  onDeleteCaseSafely: (caseId: string) => void;
  onNavigateToCalculator: () => void;
  onNavigateToResults: () => void;
  onNavigateToLandDesigner: () => void;
  onOpenHeirsModal: () => void;
  onOpenAssetsModal: () => void;
  onStartNewBlankCase: () => void;
  onExportExcel: () => void;
  onExportCSV: () => void;
  onPrintCertificate: () => void;
  inspectedPlotIdFromMap?: string | null;
  onClearInspectedPlotFromMap?: () => void;
}

type BlockFilterMode = 'all' | 'divisible' | 'excluded' | 'full_inside' | 'clipped';
type BlockSortMode = 'id_asc' | 'area_desc' | 'plots_desc';

type PlotFilterMode = 'all' | 'full_plot' | 'valid_half' | 'excluded' | 'clipped_outside' | 'assigned';
type PlotSortMode = 'id_asc' | 'block_asc' | 'area_desc' | 'owner_asc';

type HeirFilterMode = 'all' | 'inheriting' | 'blocked';
type HeirSortMode = 'share_desc' | 'name_asc' | 'role_asc';

function getTierLabelSomali(tier?: string): string {
  if (tier === 'tier_2_standard') return 'Heerka 2aad (Dhexe)';
  if (tier === 'tier_3_basic') return 'Heerka 3aad (Hoose)';
  return 'Heerka 1aad (Fiican)';
}

export const ListDataView: React.FC<ListDataViewProps> = ({
  activeCategory,
  onChangeCategory,
  savedCases,
  activeCase,
  heirsInput,
  assets,
  deductions,
  result,
  currency,
  currentHasMap,
  subdivisionState,
  subdivisionResult,
  fairLandAllocation,
  onUpdateHeirsInput,
  onOpenCase,
  onCreateNewCase,
  onSaveActiveCaseUpdates,
  onCloseCaseStatus,
  onDeleteCaseSafely,
  onNavigateToCalculator,
  onNavigateToResults,
  onNavigateToLandDesigner,
  onOpenHeirsModal,
  onOpenAssetsModal,
  onStartNewBlankCase,
  onExportExcel,
  onExportCSV,
  onPrintCertificate,
  inspectedPlotIdFromMap,
  onClearInspectedPlotFromMap,
}) => {
  // Cases Screen 8 / Screen 7 Mode Controls
  const [casesSubView, setCasesSubView] = useState<'list' | 'case_details' | 'full_manager'>('list');
  const [caseDetailsTab, setCaseDetailsTab] = useState<'heirs' | 'land' | 'results'>('heirs');
  const [caseSearchQuery, setCaseSearchQuery] = useState<string>('');
  const [caseStatusFilter, setCaseStatusFilter] = useState<'all' | CaseLifecycleStatus>('all');

  // Blocks Controls
  const [blockSearch, setBlockSearch] = useState<string>('');
  const [blockFilter, setBlockFilter] = useState<BlockFilterMode>('all');
  const [blockSort, setBlockSort] = useState<BlockSortMode>('id_asc');
  const [inspectedBlockId, setInspectedBlockId] = useState<string | null>(null);

  // Plots Controls
  const [plotSearch, setPlotSearch] = useState<string>('');
  const [plotFilter, setPlotFilter] = useState<PlotFilterMode>('all');
  const [plotSort, setPlotSort] = useState<PlotSortMode>('id_asc');
  const [inspectedPlotId, setInspectedPlotId] = useState<string | null>(null);

  // Deep-link plot inspection when coming from InteractiveGisMapDashboard "View Details"
  React.useEffect(() => {
    if (inspectedPlotIdFromMap) {
      setInspectedPlotId(inspectedPlotIdFromMap);
      onClearInspectedPlotFromMap?.();
    }
  }, [inspectedPlotIdFromMap, onClearInspectedPlotFromMap]);

  // Heirs Controls
  const [heirSearch, setHeirSearch] = useState<string>('');
  const [heirFilter, setHeirFilter] = useState<HeirFilterMode>('all');
  const [heirSort, setHeirSort] = useState<HeirSortMode>('share_desc');
  const [inspectedHeirKey, setInspectedHeirKey] = useState<string | null>(null);

  const formatMoney = (val: number) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency === 'SLSH' ? 'SOS' : currency,
        maximumFractionDigits: 2,
      })
        .format(val)
        .replace('SOS', currency === 'SLSH' ? 'Sl.Sh' : 'Sh.So');
    } catch {
      return `$${val.toLocaleString()}`;
    }
  };

  // Comprehensive Estate Distribution (real engine output)
  const distribution = useMemo(
    () => calculateComprehensiveEstateDistribution(assets, result, heirsInput, currency),
    [assets, result, heirsInput, currency]
  );

  // Real Blocks Dataset
  const enrichedBlocks = useMemo(() => {
    if (!currentHasMap || !subdivisionResult) return [];
    return subdivisionResult.blocks.map((b: GeneratedBlock) => {
      const meta = subdivisionState.blockMetadata[b.id];
      const isExcluded = Boolean(meta?.isExcludedFromDivision);
      const specialName = meta?.excludedSpecialName || meta?.blockName || '';
      const zoneId = subdivisionState.blockZones[b.id] || meta?.zoneId || 'Zone A';
      const tier = subdivisionState.blockTiers[b.id] || 'tier_1_prime';
      const actualAreaSqM =
        b.insideBlockAreaSqM ??
        b.calculatedAreaSqM ??
        subdivisionResult.params.L * subdivisionResult.params.W;
      const validHalfCount = b.validHalfPlotsInBlock || 0;
      const clippedCount = b.clippedPlotsInBlock || 0;
      const boundaryStatus = b.boundaryStatus || (b.complete ? 'full_inside' : 'boundary_clipped');

      return {
        block: b,
        id: b.id,
        isExcluded,
        specialName,
        zoneId,
        tier,
        tierLabel: getTierLabelSomali(tier),
        actualAreaSqM: Math.round(actualAreaSqM * 100) / 100,
        fullPlotsCount: b.nf,
        validHalfCount,
        clippedCount,
        totalSlots: b.total,
        boundaryStatus,
        notes: meta?.notes || '',
      };
    });
  }, [currentHasMap, subdivisionResult, subdivisionState.blockMetadata, subdivisionState.blockZones, subdivisionState.blockTiers]);

  const filteredBlocks = useMemo(() => {
    const q = blockSearch.trim().toLowerCase();
    const list = enrichedBlocks.filter((item) => {
      if (blockFilter === 'divisible' && item.isExcluded) return false;
      if (blockFilter === 'excluded' && !item.isExcluded) return false;
      if (blockFilter === 'full_inside' && item.boundaryStatus !== 'full_inside') return false;
      if (blockFilter === 'clipped' && item.boundaryStatus === 'full_inside') return false;
      if (!q) return true;
      return (
        item.id.toLowerCase().includes(q) ||
        item.specialName.toLowerCase().includes(q) ||
        item.zoneId.toLowerCase().includes(q) ||
        item.tierLabel.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (blockSort === 'area_desc') return b.actualAreaSqM - a.actualAreaSqM;
      if (blockSort === 'plots_desc') return b.fullPlotsCount - a.fullPlotsCount;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  }, [enrichedBlocks, blockSearch, blockFilter, blockSort]);

  const blocksSummary = useMemo(() => {
    const totalAreaSqM = enrichedBlocks.reduce((s, b) => s + b.actualAreaSqM, 0);
    const divisibleBlocks = enrichedBlocks.filter((b) => !b.isExcluded).length;
    const excludedBlocks = enrichedBlocks.filter((b) => b.isExcluded).length;
    const fullInsideBlocks = enrichedBlocks.filter((b) => b.boundaryStatus === 'full_inside').length;
    return {
      totalBlocks: enrichedBlocks.length,
      divisibleBlocks,
      excludedBlocks,
      fullInsideBlocks,
      totalAreaSqM: Math.round(totalAreaSqM * 100) / 100,
    };
  }, [enrichedBlocks]);

  // Real Plots Dataset (including Full Plots, Valid Half Plots, Excluded Plots & Clipped/Outside Plots)
  const enrichedPlots = useMemo(() => {
    if (!currentHasMap || !subdivisionResult) return [];
    const rawPlots: GeneratedPlot[] =
      subdivisionResult.allEvaluatedPlots && subdivisionResult.allEvaluatedPlots.length > 0
        ? subdivisionResult.allEvaluatedPlots
        : subdivisionResult.plots;

    return rawPlots.map((p: GeneratedPlot) => {
      const pMeta = subdivisionState.plotMetadata[p.id];
      const bMeta = subdivisionState.blockMetadata[p.block];
      const assignment = fairLandAllocation?.plotAssignments[p.id];
      const isExcluded = Boolean(
        pMeta?.isExcludedFromDivision ||
          bMeta?.isExcludedFromDivision ||
          assignment?.isExcluded
      );
      const specialName =
        pMeta?.excludedSpecialName ||
        bMeta?.excludedSpecialName ||
        assignment?.excludedSpecialName ||
        pMeta?.parcelNumberOrName ||
        '';

      const hpVal = p.halfPlotValidation || subdivisionResult.plotValidations?.[p.id];
      const isValidHalf = hpVal?.validationStatus === 'half_plot_valid';
      const isFullInside = p.full || hpVal?.validationStatus === 'full_inside';

      const actualAreaSqM = isValidHalf
        ? hpVal?.expectedRule.targetAreaSqM || 216
        : isFullInside
        ? Math.round((p.calculatedAreaSqM ?? subdivisionResult.params.pw * subdivisionResult.params.pd) * 100) / 100
        : Math.round((hpVal?.insideAreaSqM ?? p.calculatedAreaSqM ?? 0) * 100) / 100;

      const zoneId =
        pMeta?.zoneOverride ||
        subdivisionState.blockZones[p.block] ||
        assignment?.zoneId ||
        'Zone A';

      const tier =
        subdivisionState.plotTierOverrides[p.id] ||
        subdivisionState.blockTiers[p.block] ||
        assignment?.tier ||
        'tier_1_prime';

      let ownerDisplay = 'Weli lama qoondayn';
      if (isExcluded) {
        ownerDisplay = specialName ? `Laga Reebay: ${specialName}` : 'Laga Reebay Qaybinta';
      } else if (assignment?.assignmentType === 'sole_heir' || assignment?.assignmentType === 'manual_override') {
        ownerDisplay = assignment.ownerPersonName || assignment.ownerRoleSomali || 'La qoondayey';
      } else if (assignment?.assignmentType === 'shared_fractional' && assignment.coOwners?.length) {
        ownerDisplay = `Wadaag (${assignment.coOwners.map((c) => c.personName).join(' & ')})`;
      } else if (!isFullInside && !isValidHalf) {
        ownerDisplay = hpVal?.statusLabelSomali || 'Xuduuddu goysay / Dibadda';
      }

      const geometryLabel = isFullInside
        ? `Plot Buuxa (${subdivisionResult.params.pw} × ${subdivisionResult.params.pd} m)`
        : isValidHalf
        ? `Half-Plot Sax ah (${hpVal?.expectedRule.label || '216 m²'})`
        : hpVal?.statusLabelSomali || 'Xuduuddu goysay';

      return {
        plot: p,
        id: p.id,
        blockId: p.block,
        plotNo: p.no,
        isFullInside,
        isValidHalf,
        isExcluded,
        specialName,
        actualAreaSqM,
        zoneId,
        tier,
        tierLabel: getTierLabelSomali(tier),
        ownerDisplay,
        isAssignedToHeir: Boolean(
          !isExcluded &&
            assignment &&
            (assignment.assignmentType === 'sole_heir' ||
              assignment.assignmentType === 'manual_override' ||
              assignment.assignmentType === 'shared_fractional')
        ),
        geometryLabel,
        halfPlotValidation: hpVal || null,
        assignment: assignment || null,
        metadata: pMeta || null,
      };
    });
  }, [
    currentHasMap,
    subdivisionResult,
    subdivisionState.plotMetadata,
    subdivisionState.blockMetadata,
    subdivisionState.blockZones,
    subdivisionState.plotTierOverrides,
    subdivisionState.blockTiers,
    fairLandAllocation,
  ]);

  const filteredPlots = useMemo(() => {
    const q = plotSearch.trim().toLowerCase();
    const list = enrichedPlots.filter((item) => {
      if (plotFilter === 'full_plot' && (!item.isFullInside || item.isExcluded)) return false;
      if (plotFilter === 'valid_half' && (!item.isValidHalf || item.isExcluded)) return false;
      if (plotFilter === 'excluded' && !item.isExcluded) return false;
      if (plotFilter === 'clipped_outside' && (item.isFullInside || item.isValidHalf)) return false;
      if (plotFilter === 'assigned' && !item.isAssignedToHeir) return false;

      if (!q) return true;
      return (
        item.id.toLowerCase().includes(q) ||
        item.blockId.toLowerCase().includes(q) ||
        item.ownerDisplay.toLowerCase().includes(q) ||
        item.specialName.toLowerCase().includes(q) ||
        item.zoneId.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (plotSort === 'area_desc') return b.actualAreaSqM - a.actualAreaSqM;
      if (plotSort === 'owner_asc') return a.ownerDisplay.localeCompare(b.ownerDisplay);
      if (plotSort === 'block_asc') {
        const cmp = a.blockId.localeCompare(b.blockId, undefined, { numeric: true });
        return cmp !== 0 ? cmp : a.plotNo - b.plotNo;
      }
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  }, [enrichedPlots, plotSearch, plotFilter, plotSort]);

  const plotsSummary = useMemo(() => {
    const divisibleFull = enrichedPlots.filter((p) => p.isFullInside && !p.isExcluded);
    const validHalf = enrichedPlots.filter((p) => p.isValidHalf && !p.isExcluded);
    const excluded = enrichedPlots.filter((p) => p.isExcluded);
    const divisibleAreaSqM = [...divisibleFull, ...validHalf].reduce(
      (s, p) => s + p.actualAreaSqM,
      0
    );
    return {
      totalEvaluated: enrichedPlots.length,
      divisibleFullCount: divisibleFull.length,
      validHalfCount: validHalf.length,
      excludedCount: excluded.length,
      divisibleAreaSqM: Math.round(divisibleAreaSqM * 100) / 100,
    };
  }, [enrichedPlots]);

  // Real Heirs Dataset (Inheriting Individuals + Blocked Groups)
  const enrichedHeirs = useMemo(() => {
    const inheritingRows = distribution.allIndividualHeirs.map((ind) => {
      const shareGroup = result.heirShares.find((s) => s.id === ind.heirGroupId);
      const gisAlloc = fairLandAllocation?.heirAllocations.find(
        (h) => h.heirGroupId === ind.heirGroupId && h.personIndex === ind.personIndex
      );
      const key = `${ind.heirGroupId}::${ind.personIndex}`;
      return {
        key,
        kind: 'inheriting' as const,
        heirGroupId: ind.heirGroupId,
        personIndex: ind.personIndex,
        personName: ind.personName,
        roleSomali: ind.roleTitleSomali,
        roleArabic: ind.roleTitleArabic,
        quranicFraction: shareGroup?.quranicFraction || 'Casabah',
        individualPercentage: ind.individualPercentage,
        tashihSharesPerPerson:
          shareGroup && shareGroup.count > 0
            ? Math.round((shareGroup.tashihShares / shareGroup.count) * 100) / 100
            : 0,
        moneyAmountUSD: ind.moneyAmountUSD,
        landDisplay: ind.landDisplay,
        livestockDisplay: ind.livestockDisplay,
        totalEstimatedValueUSD: ind.totalEstimatedValueUSD,
        gisAreaSqM: gisAlloc?.totalAreaSqM ?? null,
        gisBlocks: gisAlloc?.assignedBlockIds ?? [],
        gisPlots: gisAlloc?.allWholePlotIds ?? [],
        quranicProof: shareGroup?.quranicProof || '',
        notesSomali: shareGroup?.notesSomali || '',
        blockedBy: '',
        blockedRule: '',
      };
    });

    const blockedRows = result.blockedHeirs.map((bh, idx) => ({
      key: `blocked::${bh.nameSomali}::${idx}`,
      kind: 'blocked' as const,
      heirGroupId: `blocked_${idx}`,
      personIndex: 0,
      personName: `${bh.nameSomali} (${bh.count} qof)`,
      roleSomali: bh.nameSomali,
      roleArabic: bh.nameArabic,
      quranicFraction: 'Xajb (0)',
      individualPercentage: 0,
      tashihSharesPerPerson: 0,
      moneyAmountUSD: 0,
      landDisplay: '—',
      livestockDisplay: '—',
      totalEstimatedValueUSD: 0,
      gisAreaSqM: null as number | null,
      gisBlocks: [] as string[],
      gisPlots: [] as string[],
      quranicProof: '',
      notesSomali: '',
      blockedBy: bh.blockedBy,
      blockedRule: bh.rule,
    }));

    return [...inheritingRows, ...blockedRows];
  }, [distribution.allIndividualHeirs, result.heirShares, result.blockedHeirs, fairLandAllocation]);

  const filteredHeirs = useMemo(() => {
    const q = heirSearch.trim().toLowerCase();
    const list = enrichedHeirs.filter((h) => {
      if (heirFilter === 'inheriting' && h.kind !== 'inheriting') return false;
      if (heirFilter === 'blocked' && h.kind !== 'blocked') return false;
      if (!q) return true;
      return (
        h.personName.toLowerCase().includes(q) ||
        h.roleSomali.toLowerCase().includes(q) ||
        h.roleArabic.toLowerCase().includes(q) ||
        h.gisBlocks.some((b) => b.toLowerCase().includes(q)) ||
        h.gisPlots.some((p) => p.toLowerCase().includes(q))
      );
    });

    return [...list].sort((a, b) => {
      if (heirSort === 'name_asc') return a.personName.localeCompare(b.personName);
      if (heirSort === 'role_asc') return a.roleSomali.localeCompare(b.roleSomali);
      return b.individualPercentage - a.individualPercentage;
    });
  }, [enrichedHeirs, heirSearch, heirFilter, heirSort]);

  const handleRenameIndividual = (shareId: string, personIndex: number, newName: string) => {
    const groupKey = getEditableGroupKeyForShareId(shareId);
    const updated = updateHeirPersonName(heirsInput, groupKey, personIndex, newName);
    onUpdateHeirsInput(updated);
  };

  const inspectedBlock = useMemo(
    () => enrichedBlocks.find((b) => b.id === inspectedBlockId) || null,
    [enrichedBlocks, inspectedBlockId]
  );

  const inspectedPlot = useMemo(
    () => enrichedPlots.find((p) => p.id === inspectedPlotId) || null,
    [enrichedPlots, inspectedPlotId]
  );

  const inspectedHeir = useMemo(
    () => enrichedHeirs.find((h) => h.key === inspectedHeirKey) || null,
    [enrichedHeirs, inspectedHeirKey]
  );

  const currentHeirCount = result.heirShares.reduce((s, h) => s + h.count, 0);

  const filteredSavedCases = useMemo(() => {
    const q = caseSearchQuery.trim().toLowerCase();
    return savedCases.filter((c) => {
      if (caseStatusFilter !== 'all' && c.status !== caseStatusFilter) return false;
      if (!q) return true;
      return (
        c.caseName.toLowerCase().includes(q) ||
        c.referenceNumber.toLowerCase().includes(q) ||
        (c.deceasedName || '').toLowerCase().includes(q)
      );
    });
  }, [savedCases, caseSearchQuery, caseStatusFilter]);

  const activeCaseLandAreaSqM = useMemo(() => {
    if (currentHasMap && subdivisionResult) {
      return Math.round(subdivisionResult.barea);
    }
    if (plotsSummary.divisibleAreaSqM > 0) {
      return Math.round(plotsSummary.divisibleAreaSqM);
    }
    return 0;
  }, [currentHasMap, subdivisionResult, plotsSummary.divisibleAreaSqM]);

  return (
    <div className="space-y-4 text-[#F8FAFC]">
      {/* SCREEN 8 SEGMENTED CATEGORY TABS (Cases | Blocks | Plots | Heirs + Excel) */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-[#0F1B2D] border border-[#243449] rounded-xl p-1 grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => {
              onChangeCategory('cases');
              setCasesSubView('list');
            }}
            className={`min-h-[40px] flex items-center justify-center rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
              activeCategory === 'cases'
                ? 'bg-[#10B981] text-[#030712] shadow-sm'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            Cases
          </button>

          <button
            type="button"
            onClick={() => onChangeCategory('blocks')}
            className={`min-h-[40px] flex items-center justify-center rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
              activeCategory === 'blocks'
                ? 'bg-[#10B981] text-[#030712] shadow-sm'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            Blocks
          </button>

          <button
            type="button"
            onClick={() => onChangeCategory('plots')}
            className={`min-h-[40px] flex items-center justify-center rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
              activeCategory === 'plots'
                ? 'bg-[#10B981] text-[#030712] shadow-sm'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            Plots
          </button>

          <button
            type="button"
            onClick={() => onChangeCategory('heirs')}
            className={`min-h-[40px] flex items-center justify-center rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
              activeCategory === 'heirs'
                ? 'bg-[#10B981] text-[#030712] shadow-sm'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            Heirs
          </button>
        </div>

        <button
          type="button"
          onClick={() => onChangeCategory('excel')}
          title="Shaxda Excel"
          className={`min-h-[48px] px-3 rounded-xl border inline-flex items-center justify-center gap-1.5 text-xs font-extrabold transition-colors shrink-0 cursor-pointer ${
            activeCategory === 'excel'
              ? 'bg-[#10B981] border-[#10B981] text-[#030712]'
              : 'bg-[#0F1B2D] border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC]'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Excel</span>
        </button>
      </div>

      {/* TAB 1: INHERITANCE CASES (Screen 8 List + Screen 7 Case Details + Full Case Manager) */}
      {activeCategory === 'cases' && (
        <div className="space-y-4">
          {casesSubView === 'list' && (
            <>
              {/* Search + Filter + Full Manager Action Row (Screen 8) */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="flex-1 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      value={caseSearchQuery}
                      onChange={(e) => setCaseSearchQuery(e.target.value)}
                      placeholder="Search cases..."
                      className="w-full min-h-[46px] bg-[#0F1B2D] border border-[#243449] focus:border-[#10B981] rounded-xl pl-10 pr-3.5 py-2 text-sm text-[#F8FAFC] placeholder-[#94A3B8]/70 focus:outline-none"
                    />
                  </div>
                  <div className="relative">
                    <select
                      aria-label="Sifee xaaladda kiiska"
                      value={caseStatusFilter}
                      onChange={(e) =>
                        setCaseStatusFilter(e.target.value as 'all' | CaseLifecycleStatus)
                      }
                      className="min-h-[46px] bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981]/60 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-[#F8FAFC] focus:outline-none appearance-none cursor-pointer"
                    >
                      <option value="all" className="bg-[#0F1B2D]">All</option>
                      <option value="cusub" className="bg-[#0F1B2D]">Cusub</option>
                      <option value="socda" className="bg-[#0F1B2D]">Socda</option>
                      <option value="la_hubinayo" className="bg-[#0F1B2D]">Hubin</option>
                      <option value="la_ansixiyey" className="bg-[#0F1B2D]">Ansax</option>
                      <option value="la_xidhay" className="bg-[#0F1B2D]">Xidhan</option>
                    </select>
                    <SlidersHorizontal className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3.5 pointer-events-none" />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCasesSubView('full_manager')}
                    className="flex-1 sm:flex-initial min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] px-3.5 py-2 text-xs font-bold text-[#F8FAFC] cursor-pointer"
                  >
                    <FolderCog className="w-4 h-4 text-[#10B981]" />
                    <span>+ Kiis Cusub / Maamul</span>
                  </button>
                </div>
              </div>

              {/* Clean Case Cards List (Screen 8) */}
              {filteredSavedCases.length === 0 ? (
                <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-8 text-center space-y-3">
                  <p className="text-xs text-[#94A3B8]">
                    Lama helin kiis u dhigma raadintaada.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCasesSubView('full_manager')}
                    className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#10B981] text-[#030712] px-4 py-2 text-xs font-extrabold cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Abuur Kiis Cusub</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSavedCases.map((sc) => {
                    const isCurrent = activeCase?.id === sc.id;
                    const estPlotAreaSqM =
                      (sc.fullPlotsCount || 0) * 432 + (sc.validHalfPlotsCount || 0) * 216;
                    const statusMeta = CASE_STATUS_METADATA[sc.status];

                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => {
                          if (!isCurrent) {
                            onOpenCase(sc);
                          }
                          setCasesSubView('case_details');
                        }}
                        className={`w-full text-left bg-[#0F1B2D] hover:bg-[#132238] border rounded-2xl p-4 flex items-center justify-between gap-3 transition-all cursor-pointer ${
                          isCurrent
                            ? 'border-[#10B981]/70 shadow-lg shadow-[#10B981]/5'
                            : 'border-[#243449]'
                        }`}
                      >
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-extrabold text-[#F8FAFC] truncate">
                              {sc.referenceNumber} - {sc.caseName}
                            </h3>
                            {isCurrent && (
                              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#10B981]/15 text-[#10B981]">
                                Furan
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs font-mono-numbers tabular-nums">
                            <span className="text-[#10B981] font-bold">
                              {sc.heirCount} heirs
                            </span>
                            <span className="text-[#94A3B8]">·</span>
                            <span className="text-[#94A3B8]">
                              {sc.hasMapGeometry && estPlotAreaSqM > 0
                                ? `${estPlotAreaSqM.toLocaleString()} m²`
                                : sc.totalNetEstateUSD > 0
                                ? formatMoney(sc.totalNetEstateUSD)
                                : 'Bilaa khariidad'}
                            </span>
                            <span className="text-[#94A3B8]">·</span>
                            <span className="text-[11px] text-[#94A3B8]">
                              {statusMeta.labelSomali}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-xs text-[#94A3B8] font-mono-numbers tabular-nums">
                            {sc.caseDate}
                          </span>
                          <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* SCREEN 7: CASE DETAILS VIEW (Heirs | Land | Results) */}
          {casesSubView === 'case_details' && (
            <div className="space-y-4">
              {/* Inline Screen 7 Header */}
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setCasesSubView('list')}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] px-3.5 py-2 text-xs font-extrabold text-[#F8FAFC] cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-[#10B981]" />
                  <span>Case Details</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCasesSubView('full_manager')}
                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] px-3.5 py-2 text-xs font-bold text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                >
                  <FolderCog className="w-4 h-4 text-[#10B981]" />
                  <span>Wax ka beddel / Taariikhda</span>
                </button>
              </div>

              {/* Hero Case Summary Card (Screen 7) */}
              <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 sm:p-5 space-y-4">
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-[#F8FAFC]">
                    {activeCase
                      ? `${activeCase.referenceNumber} - ${activeCase.caseName}`
                      : 'Kiiska Hadda Furan'}
                  </h2>
                  {activeCase?.description && (
                    <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                      {activeCase.description}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-[#243449]">
                  <div>
                    <span className="text-[11px] text-[#94A3B8] block">Heirs</span>
                    <strong className="text-sm sm:text-base font-extrabold text-[#10B981] font-mono-numbers tabular-nums mt-0.5 block">
                      {currentHeirCount} Dhaxlaa
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#94A3B8] block">Land Area</span>
                    <strong className="text-sm sm:text-base font-extrabold text-[#F8FAFC] font-mono-numbers tabular-nums mt-0.5 block">
                      {activeCaseLandAreaSqM > 0
                        ? `${activeCaseLandAreaSqM.toLocaleString()} m²`
                        : '0 m²'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#94A3B8] block">Created</span>
                    <strong className="text-sm sm:text-base font-extrabold text-[#F8FAFC] font-mono-numbers tabular-nums mt-0.5 block">
                      {activeCase?.caseDate || new Date().toISOString().slice(0, 10)}
                    </strong>
                  </div>
                </div>
              </section>

              {/* Screen 7 Sub-Tabs: Heirs | Land | Results */}
              <div className="bg-[#0F1B2D] border border-[#243449] rounded-xl p-1 grid grid-cols-3 gap-1">
                {(
                  [
                    { id: 'heirs', label: 'Heirs' },
                    { id: 'land', label: 'Land' },
                    { id: 'results', label: 'Results' },
                  ] as const
                ).map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setCaseDetailsTab(sub.id)}
                    className={`min-h-[40px] rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                      caseDetailsTab === sub.id
                        ? 'bg-[#10B981] text-[#030712]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>

              {/* CASE DETAILS -> HEIRS (Screen 7 exact layout) */}
              {caseDetailsTab === 'heirs' && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-extrabold text-[#F8FAFC]">Heir List</h3>
                    <button
                      type="button"
                      onClick={onNavigateToCalculator}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-3.5 py-2 text-xs font-extrabold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Heir</span>
                    </button>
                  </div>

                  {distribution.allIndividualHeirs.length === 0 ? (
                    <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-6 text-center space-y-2.5">
                      <p className="text-xs text-[#94A3B8]">
                        Weli lama gelin dhaxal-sugayaal kiiskan.
                      </p>
                      <button
                        type="button"
                        onClick={onNavigateToCalculator}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-[#10B981] text-[#030712] text-xs font-extrabold cursor-pointer"
                      >
                        Fur Xisaabiyaha Dhaxalka
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {distribution.allIndividualHeirs.map((ind, idx) => {
                        const gisAlloc = fairLandAllocation?.heirAllocations.find(
                          (h) =>
                            h.heirGroupId === ind.heirGroupId &&
                            h.personIndex === ind.personIndex
                        );
                        return (
                          <div
                            key={`${ind.heirGroupId}_${ind.personIndex}`}
                            onClick={() =>
                              setInspectedHeirKey(`${ind.heirGroupId}::${ind.personIndex}`)
                            }
                            className="bg-[#0F1B2D] hover:bg-[#132238] border border-[#243449] rounded-2xl p-3.5 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-8 h-8 rounded-full bg-[#0B1220] border border-[#243449] text-xs font-mono-numbers tabular-nums font-extrabold text-[#10B981] flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="text-sm font-extrabold text-[#F8FAFC] truncate">
                                  {ind.personName}
                                </div>
                                <div className="text-xs text-[#94A3B8] truncate">
                                  {ind.roleTitleSomali}
                                  {gisAlloc && gisAlloc.totalAreaSqM > 0
                                    ? ` · ${Math.round(gisAlloc.totalAreaSqM).toLocaleString()} m²`
                                    : ''}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-sm font-mono-numbers tabular-nums font-extrabold text-[#10B981]">
                                {ind.individualPercentage.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* CASE DETAILS -> LAND */}
              {caseDetailsTab === 'land' && (
                <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 sm:p-5 space-y-4">
                  {!currentHasMap || !subdivisionResult ? (
                    <div className="text-center py-4 space-y-3">
                      <p className="text-xs text-[#94A3B8]">
                        Kiiskan weli khariidad dhul ah kuma xidhna.
                      </p>
                      <button
                        type="button"
                        onClick={onNavigateToLandDesigner}
                        className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#10B981] text-[#030712] px-4 py-2 text-xs font-extrabold cursor-pointer"
                      >
                        <MapPin className="w-4 h-4" />
                        <span>Fur Khariidadda GIS</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3">
                          <span className="text-[#94A3B8] block">Blocks</span>
                          <strong className="text-base font-mono-numbers tabular-nums text-[#F8FAFC] mt-0.5 block">
                            {blocksSummary.totalBlocks}
                          </strong>
                        </div>
                        <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3">
                          <span className="text-[#94A3B8] block">Plots Buuxa</span>
                          <strong className="text-base font-mono-numbers tabular-nums text-[#10B981] mt-0.5 block">
                            {plotsSummary.divisibleFullCount}
                          </strong>
                        </div>
                        <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3">
                          <span className="text-[#94A3B8] block">Half-Plots</span>
                          <strong className="text-base font-mono-numbers tabular-nums text-sky-400 mt-0.5 block">
                            {plotsSummary.validHalfCount}
                          </strong>
                        </div>
                        <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3">
                          <span className="text-[#94A3B8] block">Bedka La Qaybinayo</span>
                          <strong className="text-base font-mono-numbers tabular-nums text-[#F8FAFC] mt-0.5 block">
                            {plotsSummary.divisibleAreaSqM.toLocaleString()} m²
                          </strong>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={onNavigateToLandDesigner}
                          className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-4 py-2 text-xs font-extrabold cursor-pointer"
                        >
                          <MapPin className="w-4 h-4" />
                          <span>Ku Eeg Khariidadda (OSM / Satellite)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onChangeCategory('plots')}
                          className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#10B981] text-[#F8FAFC] px-4 py-2 text-xs font-bold cursor-pointer"
                        >
                          <Grid className="w-4 h-4 text-[#10B981]" />
                          <span>Liiska Plots-ka</span>
                        </button>
                      </div>
                    </>
                  )}
                </section>
              )}

              {/* CASE DETAILS -> RESULTS */}
              {caseDetailsTab === 'results' && (
                <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3">
                      <span className="text-[#94A3B8] block">Asalka &amp; Tashih</span>
                      <strong className="text-base font-mono-numbers tabular-nums text-[#F8FAFC] mt-0.5 block">
                        {result.aslAlMasalah} / {result.tashihBase}
                      </strong>
                    </div>
                    <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3">
                      <span className="text-[#94A3B8] block">Hantida Saafiga</span>
                      <strong className="text-base font-mono-numbers tabular-nums text-[#10B981] mt-0.5 block">
                        {formatMoney(result.netDistributableEstateUSD)}
                      </strong>
                    </div>
                    <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3 col-span-2 sm:col-span-1">
                      <span className="text-[#94A3B8] block">Nooca Mas&apos;alada</span>
                      <strong className="text-sm text-[#F8FAFC] mt-0.5 block">
                        {result.isAwl
                          ? 'Mas’alo Cawl ah'
                          : result.isRadd
                          ? 'Mas’alo Radd ah'
                          : 'Caadi / Casabah'}
                      </strong>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={onNavigateToResults}
                      className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-4 py-2 text-xs font-extrabold cursor-pointer"
                    >
                      <span>Arag Natiijada Buuxda</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={onPrintCertificate}
                      className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#10B981] text-[#F8FAFC] px-4 py-2 text-xs font-bold cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-[#10B981]" />
                      <span>Shahaadada PDF</span>
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* FULL CASE MANAGER (Create / Edit / Audit / Safe Delete) */}
          {casesSubView === 'full_manager' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCasesSubView('list')}
                  className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] px-3.5 py-2 text-xs font-extrabold text-[#F8FAFC] cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-[#10B981]" />
                  <span>Ku laabo Liiska Kiisaska</span>
                </button>
              </div>

              <CaseManagementView
                savedCases={savedCases}
                activeCase={activeCase}
                currency={currency}
                currentHeirCount={currentHeirCount}
                currentNetEstateUSD={result.netDistributableEstateUSD}
                currentHasMap={currentHasMap}
                currentMapLabel={
                  currentHasMap
                    ? subdivisionState.boundaryFileName || 'Khariidad ku xidhan'
                    : 'Khariidad ma laha'
                }
                currentBlocksCount={blocksSummary.totalBlocks}
                currentFullPlotsCount={plotsSummary.divisibleFullCount}
                currentValidHalfPlotsCount={plotsSummary.validHalfCount}
                onOpenCase={(c) => {
                  onOpenCase(c);
                  setCasesSubView('case_details');
                }}
                onCreateNewCase={onCreateNewCase}
                onSaveActiveCaseUpdates={onSaveActiveCaseUpdates}
                onCloseCaseStatus={onCloseCaseStatus}
                onDeleteCaseSafely={onDeleteCaseSafely}
                onNavigateToCalculator={onNavigateToCalculator}
                onNavigateToLandDesigner={onNavigateToLandDesigner}
              />
            </div>
          )}
        </div>
      )}

      {/* TAB 2: GIS BLOCKS */}
      {activeCategory === 'blocks' && (
        <div className="space-y-4">
          {!currentHasMap || !subdivisionResult ? (
            <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-8 text-center space-y-3">
              <Layers className="w-9 h-9 text-[#94A3B8] mx-auto" />
              <h2 className="text-base font-extrabold text-[#F8FAFC]">
                Kiiskan hadda furan wax khariidad Blocks ah kuma xidhna
              </h2>
              <p className="text-xs text-[#94A3B8] max-w-md mx-auto leading-relaxed">
                Si aad u aragto diiwaanka Blocks-ka iyo cabbirradooda dhabta ah, tag shaashadda Khariidadda oo adeegso badhanka &ldquo;+&rdquo; ee hoose dhexda.
              </p>
              <button
                type="button"
                onClick={onNavigateToLandDesigner}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-4 py-2.5 text-xs font-extrabold cursor-pointer"
              >
                <MapPin className="w-4 h-4" />
                <span>Tag Khariidadda</span>
              </button>
            </section>
          ) : (
            <>
              {/* Real Blocks Summary Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4">
                  <span className="text-xs text-[#94A3B8] block">Wadarta Blocks</span>
                  <strong className="text-xl font-mono-numbers tabular-nums font-extrabold text-[#F8FAFC] mt-1 block">
                    {blocksSummary.totalBlocks}
                  </strong>
                  <span className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                    {subdivisionResult.params.L} × {subdivisionResult.params.W} m halkii Block
                  </span>
                </div>
                <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4">
                  <span className="text-xs text-[#94A3B8] block">Blocks La Qaybinayo</span>
                  <strong className="text-xl font-mono-numbers tabular-nums font-extrabold text-[#10B981] mt-1 block">
                    {blocksSummary.divisibleBlocks}
                  </strong>
                  <span className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                    {blocksSummary.fullInsideBlocks} gudaha oo dhan
                  </span>
                </div>
                <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4">
                  <span className="text-xs text-[#94A3B8] block">Blocks Laga Reebay</span>
                  <strong className="text-xl font-mono-numbers tabular-nums font-extrabold text-rose-400 mt-1 block">
                    {blocksSummary.excludedBlocks}
                  </strong>
                  <span className="text-[11px] text-[#94A3B8]">Danta guud / Gaar ah</span>
                </div>
                <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4">
                  <span className="text-xs text-[#94A3B8] block">Wadarta Bedka Blocks</span>
                  <strong className="text-xl font-mono-numbers tabular-nums font-extrabold text-[#F8FAFC] mt-1 block">
                    {blocksSummary.totalAreaSqM.toLocaleString()} m²
                  </strong>
                  <span className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                    Beerta: {Math.round(subdivisionResult.barea).toLocaleString()} m²
                  </span>
                </div>
              </div>

              {/* Search, Filter & Sort Toolbar */}
              <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-[#243449] bg-[#0B1220] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0F1B2D] border border-[#243449] rounded-xl">
                    {(
                      [
                        { id: 'all', label: 'Dhammaan' },
                        { id: 'divisible', label: 'La Qaybinayo' },
                        { id: 'excluded', label: 'Laga Reebay' },
                        { id: 'full_inside', label: 'Gudaha' },
                        { id: 'clipped', label: 'Xuduuddu Goysay' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setBlockFilter(f.id)}
                        className={`min-h-[34px] px-2.5 py-1 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          blockFilter === f.id
                            ? 'bg-[#10B981] text-[#030712]'
                            : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 sm:w-56">
                      <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-3.5" />
                      <input
                        type="text"
                        value={blockSearch}
                        onChange={(e) => setBlockSearch(e.target.value)}
                        placeholder="Raadi Block ID, Zone, Magac..."
                        className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] focus:border-[#10B981] rounded-xl pl-8 pr-3 py-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none"
                      />
                    </div>

                    <div className="inline-flex items-center gap-1.5 bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 min-h-[42px]">
                      <ArrowUpDown className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                      <select
                        value={blockSort}
                        onChange={(e) => setBlockSort(e.target.value as BlockSortMode)}
                        className="bg-transparent text-xs font-bold text-[#F8FAFC] focus:outline-none py-1.5"
                      >
                        <option value="id_asc" className="bg-[#0F1B2D]">Kala horraysii: Block ID</option>
                        <option value="area_desc" className="bg-[#0F1B2D]">Bedka ugu weyn (m²)</option>
                        <option value="plots_desc" className="bg-[#0F1B2D]">Plots ugu badan</option>
                      </select>
                    </div>
                  </div>
                </div>

                {filteredBlocks.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#94A3B8]">
                    Lama helin Block u dhigma raadintaada ({filteredBlocks.length} natiijo).
                  </div>
                ) : (
                  <>
                    {/* Mobile Cards */}
                    <div className="md:hidden divide-y divide-[#243449]">
                      {filteredBlocks.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setInspectedBlockId(b.id)}
                          className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-[#0B1220]/70 transition-colors cursor-pointer"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="font-mono-numbers tabular-nums font-extrabold text-[#10B981]">
                                {b.id}
                              </span>
                              <span className="text-[#94A3B8]">·</span>
                              <span className="text-[#F8FAFC] font-semibold">{b.zoneId}</span>
                              <span className="text-[#94A3B8]">·</span>
                              <span
                                className={
                                  b.isExcluded
                                    ? 'text-rose-400 font-bold'
                                    : 'text-emerald-300 font-semibold'
                                }
                              >
                                {b.isExcluded
                                  ? `Laga Reebay${b.specialName ? `: ${b.specialName}` : ''}`
                                  : 'La Qaybinayo'}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                              {b.fullPlotsCount} Plot buuxa · {b.validHalfCount} Half Plot ·{' '}
                              {b.actualAreaSqM.toLocaleString()} m²
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
                        </button>
                      ))}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[#243449] bg-[#0B1220]/60 text-[#94A3B8] font-bold">
                            <th className="py-3 px-4">Block ID</th>
                            <th className="py-3 px-3">Zone &amp; Heerka</th>
                            <th className="py-3 px-3">Xaaladda Dhaxalka</th>
                            <th className="py-3 px-3">Xuduudda</th>
                            <th className="py-3 px-3 text-right">Plots (Buuxa / Half)</th>
                            <th className="py-3 px-4 text-right">Bedka Dhabta ah</th>
                            <th className="py-3 px-4 text-right">Faahfaahin</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#243449]/70">
                          {filteredBlocks.map((b) => (
                            <tr
                              key={b.id}
                              onClick={() => setInspectedBlockId(b.id)}
                              className="hover:bg-[#0B1220]/60 transition-colors cursor-pointer"
                            >
                              <td className="py-3 px-4 font-mono-numbers tabular-nums font-extrabold text-[#10B981]">
                                {b.id}
                              </td>
                              <td className="py-3 px-3">
                                <span className="font-bold text-[#F8FAFC]">{b.zoneId}</span>
                                <span className="text-[#94A3B8]"> · {b.tierLabel}</span>
                              </td>
                              <td className="py-3 px-3">
                                {b.isExcluded ? (
                                  <span className="font-bold text-rose-400">
                                    Laga Reebay{b.specialName ? ` (${b.specialName})` : ''}
                                  </span>
                                ) : (
                                  <span className="font-semibold text-[#10B981]">La Qaybinayo</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-[#94A3B8]">
                                {b.boundaryStatus === 'full_inside'
                                  ? 'Gudaha oo dhan'
                                  : 'Xuduuddu goysay'}
                              </td>
                              <td className="py-3 px-3 text-right font-mono-numbers tabular-nums text-[#F8FAFC]">
                                <strong>{b.fullPlotsCount}</strong> / {b.totalSlots}
                                {b.validHalfCount > 0 ? ` (+${b.validHalfCount} Half)` : ''}
                              </td>
                              <td className="py-3 px-4 text-right font-mono-numbers tabular-nums font-bold text-[#F8FAFC]">
                                {b.actualAreaSqM.toLocaleString()} m²
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className="inline-flex items-center gap-1 text-[#10B981] font-bold">
                                  <span>Eeg</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {/* TAB 3: GIS PLOTS & HALF-PLOTS */}
      {activeCategory === 'plots' && (
        <div className="space-y-4">
          {!currentHasMap || !subdivisionResult ? (
            <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-8 text-center space-y-3">
              <Grid className="w-9 h-9 text-[#94A3B8] mx-auto" />
              <h2 className="text-base font-extrabold text-[#F8FAFC]">
                Kiiskan hadda furan wax Plots ah kuma xidhna
              </h2>
              <p className="text-xs text-[#94A3B8] max-w-md mx-auto leading-relaxed">
                Si aad u kormeertaan Plots-ka dhammaystiran, Half-Plots-ka, iyo Plots-ka laga reebay dhaxalka, tag shaashadda Khariidadda.
              </p>
              <button
                type="button"
                onClick={onNavigateToLandDesigner}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-4 py-2.5 text-xs font-extrabold cursor-pointer"
              >
                <MapPin className="w-4 h-4" />
                <span>Tag Khariidadda</span>
              </button>
            </section>
          ) : (
            <>
              {/* Real Plots Summary Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4">
                  <span className="text-xs text-[#94A3B8] block">Plots Buuxa (La Qaybinayo)</span>
                  <strong className="text-xl font-mono-numbers tabular-nums font-extrabold text-[#10B981] mt-1 block">
                    {plotsSummary.divisibleFullCount}
                  </strong>
                  <span className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                    {subdivisionResult.params.pw} × {subdivisionResult.params.pd} m (
                    {subdivisionResult.params.pw * subdivisionResult.params.pd} m²)
                  </span>
                </div>
                <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4">
                  <span className="text-xs text-[#94A3B8] block">Half-Plots Sax ah</span>
                  <strong className="text-xl font-mono-numbers tabular-nums font-extrabold text-sky-400 mt-1 block">
                    {plotsSummary.validHalfCount}
                  </strong>
                  <span className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                    12×18m (1,5,6,10) · 9×24m (2-4,7-9)
                  </span>
                </div>
                <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4">
                  <span className="text-xs text-[#94A3B8] block">Plots Laga Reebay</span>
                  <strong className="text-xl font-mono-numbers tabular-nums font-extrabold text-rose-400 mt-1 block">
                    {plotsSummary.excludedCount}
                  </strong>
                  <span className="text-[11px] text-[#94A3B8]">Danta guud / Magac gaar ah</span>
                </div>
                <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4">
                  <span className="text-xs text-[#94A3B8] block">Bedka La Qaybinayo</span>
                  <strong className="text-xl font-mono-numbers tabular-nums font-extrabold text-[#F8FAFC] mt-1 block">
                    {plotsSummary.divisibleAreaSqM.toLocaleString()} m²
                  </strong>
                  <span className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                    La qiimeeyey: {plotsSummary.totalEvaluated} Plot
                  </span>
                </div>
              </div>

              {/* Search, Filter & Sort Toolbar */}
              <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-[#243449] bg-[#0B1220] flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0F1B2D] border border-[#243449] rounded-xl">
                    {(
                      [
                        { id: 'all', label: `Dhammaan (${enrichedPlots.length})` },
                        { id: 'full_plot', label: `Buuxa (${plotsSummary.divisibleFullCount})` },
                        { id: 'valid_half', label: `Half-Plot (${plotsSummary.validHalfCount})` },
                        { id: 'excluded', label: `Laga Reebay (${plotsSummary.excludedCount})` },
                        { id: 'assigned', label: 'La Qoondayey' },
                        { id: 'clipped_outside', label: 'Go’an / Dibadda' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setPlotFilter(f.id)}
                        className={`min-h-[34px] px-2.5 py-1 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          plotFilter === f.id
                            ? 'bg-[#10B981] text-[#030712]'
                            : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 sm:w-56">
                      <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-3.5" />
                      <input
                        type="text"
                        value={plotSearch}
                        onChange={(e) => setPlotSearch(e.target.value)}
                        placeholder="Raadi Plot ID, Mulkiilaha..."
                        className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] focus:border-[#10B981] rounded-xl pl-8 pr-3 py-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none"
                      />
                    </div>

                    <div className="inline-flex items-center gap-1.5 bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 min-h-[42px]">
                      <ArrowUpDown className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                      <select
                        value={plotSort}
                        onChange={(e) => setPlotSort(e.target.value as PlotSortMode)}
                        className="bg-transparent text-xs font-bold text-[#F8FAFC] focus:outline-none py-1.5"
                      >
                        <option value="id_asc" className="bg-[#0F1B2D]">Plot ID (A–Z)</option>
                        <option value="block_asc" className="bg-[#0F1B2D]">Block &amp; Booska (1–10)</option>
                        <option value="area_desc" className="bg-[#0F1B2D]">Bedka (m²)</option>
                        <option value="owner_asc" className="bg-[#0F1B2D]">Mulkiilaha / Xaaladda</option>
                      </select>
                    </div>
                  </div>
                </div>

                {filteredPlots.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#94A3B8]">
                    Lama helin Plot u dhigma raadintaada ama sifayntaada.
                  </div>
                ) : (
                  <>
                    {/* Mobile Tap List Rows */}
                    <div className="md:hidden divide-y divide-[#243449] max-h-[540px] overflow-y-auto">
                      {filteredPlots.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setInspectedPlotId(p.id)}
                          className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-[#0B1220]/70 transition-colors cursor-pointer"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="font-mono-numbers tabular-nums font-extrabold text-[#10B981]">
                                {p.id}
                              </span>
                              <span className="text-[#94A3B8]">·</span>
                              <span className="text-[#94A3B8] font-mono-numbers tabular-nums">
                                Booska #{p.plotNo}
                              </span>
                              <span className="text-[#94A3B8]">·</span>
                              <span className="font-mono-numbers tabular-nums font-bold text-[#F8FAFC]">
                                {p.actualAreaSqM.toLocaleString()} m²
                              </span>
                            </div>
                            <div className="text-xs font-semibold text-[#F8FAFC] truncate">
                              {p.ownerDisplay}
                            </div>
                            <div className="text-[11px] text-[#94A3B8]">
                              {p.geometryLabel} · {p.zoneId}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
                        </button>
                      ))}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto max-h-[560px] overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="sticky top-0 bg-[#0B1220] z-10">
                          <tr className="border-b border-[#243449] text-[#94A3B8] font-bold">
                            <th className="py-3 px-4">Plot ID</th>
                            <th className="py-3 px-3">Block · Booska</th>
                            <th className="py-3 px-3">Nooca &amp; Xaqiijinta</th>
                            <th className="py-3 px-3">Zone · Heerka</th>
                            <th className="py-3 px-3">Mulkiilaha / Xaaladda</th>
                            <th className="py-3 px-4 text-right">Bedka (m²)</th>
                            <th className="py-3 px-4 text-right">Eeg</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#243449]/70">
                          {filteredPlots.map((p) => (
                            <tr
                              key={p.id}
                              onClick={() => setInspectedPlotId(p.id)}
                              className="hover:bg-[#0B1220]/60 transition-colors cursor-pointer"
                            >
                              <td className="py-3 px-4 font-mono-numbers tabular-nums font-extrabold text-[#10B981]">
                                {p.id}
                              </td>
                              <td className="py-3 px-3 font-mono-numbers tabular-nums text-[#F8FAFC]">
                                {p.blockId} · #{p.plotNo}
                              </td>
                              <td className="py-3 px-3">
                                <span
                                  className={
                                    p.isFullInside
                                      ? 'text-[#F8FAFC] font-semibold'
                                      : p.isValidHalf
                                      ? 'text-sky-400 font-semibold'
                                      : 'text-[#94A3B8]'
                                  }
                                >
                                  {p.geometryLabel}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-[#94A3B8]">
                                <span className="text-[#F8FAFC] font-semibold">{p.zoneId}</span> ·{' '}
                                {p.tier === 'tier_1_prime'
                                  ? 'H1'
                                  : p.tier === 'tier_2_standard'
                                  ? 'H2'
                                  : 'H3'}
                              </td>
                              <td className="py-3 px-3">
                                <span
                                  className={
                                    p.isExcluded
                                      ? 'font-bold text-rose-400'
                                      : p.isAssignedToHeir
                                      ? 'font-bold text-emerald-300'
                                      : 'text-[#94A3B8]'
                                  }
                                >
                                  {p.ownerDisplay}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right font-mono-numbers tabular-nums font-bold text-[#F8FAFC]">
                                {p.actualAreaSqM.toLocaleString()} m²
                              </td>
                              <td className="py-3 px-4 text-right">
                                <ChevronRight className="w-4 h-4 text-[#10B981] inline" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {/* TAB 4: HEIRS & INHERITANCE SHARES */}
      {activeCategory === 'heirs' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4">
              <span className="text-xs text-[#94A3B8] block">Dhaxal-sugayaasha Dhaxlaya</span>
              <strong className="text-xl font-mono-numbers tabular-nums font-extrabold text-[#10B981] mt-1 block">
                {distribution.allIndividualHeirs.length} Qof
              </strong>
              <span className="text-[11px] text-[#94A3B8]">
                {distribution.heirAllocations.length} koox sharci ah
              </span>
            </div>
            <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4">
              <span className="text-xs text-[#94A3B8] block">Laga Xannibay (Al-Xajb)</span>
              <strong className="text-xl font-mono-numbers tabular-nums font-extrabold text-amber-400 mt-1 block">
                {result.blockedHeirs.length} Koox
              </strong>
              <span className="text-[11px] text-[#94A3B8]">Qawaaniinta Xajbiga</span>
            </div>
            <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4">
              <span className="text-xs text-[#94A3B8] block">Asalka &amp; Tashih</span>
              <strong className="text-xl font-mono-numbers tabular-nums font-extrabold text-[#F8FAFC] mt-1 block">
                {result.aslAlMasalah}
                {result.isAwl ? ` → ${result.awlValue}` : ''} / {result.tashihBase}
              </strong>
              <span className="text-[11px] text-[#94A3B8]">
                {result.isAwl ? 'Mas’alo Cawl ah' : result.isRadd ? 'Mas’alo Radd ah' : 'Caddilmi / Casabah'}
              </span>
            </div>
            <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4">
              <span className="text-xs text-[#94A3B8] block">Hantida Saafiga</span>
              <strong className="text-xl font-mono-numbers tabular-nums font-extrabold text-[#10B981] mt-1 block">
                {result.netDistributableEstateUSD > 0
                  ? formatMoney(result.netDistributableEstateUSD)
                  : `${distribution.totalLandPlots} Plot`}
              </strong>
              <button
                type="button"
                onClick={onNavigateToResults}
                className="text-[11px] font-bold text-[#10B981] hover:underline mt-0.5 cursor-pointer"
              >
                Arag natiijada buuxda →
              </button>
            </div>
          </div>

          <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-[#243449] bg-[#0B1220] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0F1B2D] border border-[#243449] rounded-xl">
                {(
                  [
                    { id: 'all', label: `Dhammaan (${enrichedHeirs.length})` },
                    { id: 'inheriting', label: `Wax Helaya (${distribution.allIndividualHeirs.length})` },
                    { id: 'blocked', label: `Xajb (${result.blockedHeirs.length})` },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setHeirFilter(f.id)}
                    className={`min-h-[34px] px-2.5 py-1 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      heirFilter === f.id
                        ? 'bg-[#10B981] text-[#030712]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:w-56">
                  <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-3.5" />
                  <input
                    type="text"
                    value={heirSearch}
                    onChange={(e) => setHeirSearch(e.target.value)}
                    placeholder="Raadi magaca, xiriirka, Plot..."
                    className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] focus:border-[#10B981] rounded-xl pl-8 pr-3 py-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none"
                  />
                </div>

                <div className="inline-flex items-center gap-1.5 bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 min-h-[42px]">
                  <ArrowUpDown className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                  <select
                    value={heirSort}
                    onChange={(e) => setHeirSort(e.target.value as HeirSortMode)}
                    className="bg-transparent text-xs font-bold text-[#F8FAFC] focus:outline-none py-1.5"
                  >
                    <option value="share_desc" className="bg-[#0F1B2D]">Saamiga ugu badan (%)</option>
                    <option value="name_asc" className="bg-[#0F1B2D]">Magaca (A–Z)</option>
                    <option value="role_asc" className="bg-[#0F1B2D]">Xiriirka Qoyska</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredHeirs.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs text-[#94A3B8]">
                  Lama helin dhaxal-suge u dhigma raadintaada.
                </p>
                <button
                  type="button"
                  onClick={onNavigateToCalculator}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#10B981] text-[#030712] text-xs font-extrabold cursor-pointer"
                >
                  Ku Dar Dhaxal-sugayaasha
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#243449]">
                {filteredHeirs.map((h) => (
                  <div
                    key={h.key}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#0B1220]/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-[#F8FAFC]">{h.roleSomali}</span>
                        <span className="font-arabic text-[#94A3B8]">({h.roleArabic})</span>
                        <span className="text-[#94A3B8]">·</span>
                        <span
                          className={
                            h.kind === 'blocked'
                              ? 'text-amber-400 font-bold'
                              : 'text-[#10B981] font-mono-numbers tabular-nums font-bold'
                          }
                        >
                          {h.kind === 'blocked'
                            ? `Xanniban — ${h.blockedBy}`
                            : `Saamiga: ${h.individualPercentage.toFixed(2)}% (${h.quranicFraction})`}
                        </span>
                      </div>

                      {h.kind === 'inheriting' ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <input
                            type="text"
                            value={h.personName}
                            onChange={(e) =>
                              handleRenameIndividual(h.heirGroupId, h.personIndex, e.target.value)
                            }
                            placeholder={`Qor magaca (${h.roleSomali})...`}
                            className="w-full sm:max-w-xs min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-1.5 text-xs font-bold text-[#F8FAFC] focus:outline-none"
                          />
                          <div className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                            {distribution.totalLandPlots > 0 && <span>Dhul: {h.landDisplay} · </span>}
                            {h.gisAreaSqM !== null && (
                              <span>GIS: {h.gisAreaSqM.toLocaleString()} m² · </span>
                            )}
                            {result.netDistributableEstateUSD > 0 && (
                              <strong className="text-[#10B981]">
                                {formatMoney(h.totalEstimatedValueUSD)}
                              </strong>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-[#94A3B8]">{h.blockedRule}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setInspectedHeirKey(h.key)}
                      className="min-h-[42px] self-start sm:self-center inline-flex items-center gap-1.5 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#10B981] px-3.5 py-2 text-xs font-bold text-[#F8FAFC] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Faahfaahin</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#10B981]" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 5: EXCEL SPREADSHEET LEDGER */}
      {activeCategory === 'excel' && (
        <div className="space-y-4">
          <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-[#F8FAFC]">
                Shaxda Faraa&apos;idka ee Excel &amp; Diiwaanka Xisaabta
              </h2>
              <p className="text-xs text-[#94A3B8] mt-0.5 font-mono-numbers tabular-nums">
                {activeCase?.referenceNumber || 'KIIS'} · {activeCase?.caseName || 'Kiiska Furan'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onExportCSV}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#10B981] text-[#F8FAFC] px-3.5 py-2 text-xs font-bold whitespace-nowrap cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#10B981]" />
                <span>CSV</span>
              </button>
              <button
                type="button"
                onClick={onExportExcel}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-4 py-2 text-xs font-extrabold whitespace-nowrap cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Soo Deji Excel (.xlsx)</span>
              </button>
            </div>
          </div>

          <div className="text-neutral-100 rounded-2xl overflow-hidden border border-[#243449]">
            <ExcelSpreadsheetView
              result={result}
              heirsInput={heirsInput}
              assets={assets}
              deductions={deductions}
              currency={currency}
              onExportExcel={onExportExcel}
              onExportCSV={onExportCSV}
              onPrint={onPrintCertificate}
              onOpenHeirs={onOpenHeirsModal}
              onOpenAssets={onOpenAssetsModal}
              onOpenNewCase={onStartNewBlankCase}
            />
          </div>
        </div>
      )}

      {/* DETAIL MODAL / BOTTOM SHEET: BLOCK */}
      {inspectedBlock && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setInspectedBlockId(null)}
        >
          <div
            className="w-full sm:max-w-lg bg-[#0F1B2D] border-t sm:border border-[#243449] rounded-t-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-[#243449] rounded-full mx-auto sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-[#10B981]">Faahfaahinta Block-ga</span>
                <h3 className="text-lg font-extrabold text-[#F8FAFC] font-mono-numbers tabular-nums">
                  Block {inspectedBlock.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedBlockId(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#0B1220] border border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3">
                <span className="text-[#94A3B8] block">Bedka Dhabta ah</span>
                <strong className="text-sm font-mono-numbers tabular-nums text-[#F8FAFC] mt-0.5 block">
                  {inspectedBlock.actualAreaSqM.toLocaleString()} m²
                </strong>
              </div>
              <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3">
                <span className="text-[#94A3B8] block">Zone &amp; Heerka</span>
                <strong className="text-sm text-[#F8FAFC] mt-0.5 block">
                  {inspectedBlock.zoneId} · {inspectedBlock.tierLabel}
                </strong>
              </div>
              <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3">
                <span className="text-[#94A3B8] block">Plots Buuxa / Half-Plot</span>
                <strong className="text-sm font-mono-numbers tabular-nums text-[#10B981] mt-0.5 block">
                  {inspectedBlock.fullPlotsCount} Plot · {inspectedBlock.validHalfCount} Half
                </strong>
              </div>
              <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3">
                <span className="text-[#94A3B8] block">Xaaladda Qaybinta</span>
                <strong
                  className={`text-sm mt-0.5 block ${
                    inspectedBlock.isExcluded ? 'text-rose-400' : 'text-emerald-300'
                  }`}
                >
                  {inspectedBlock.isExcluded
                    ? `Laga Reebay${inspectedBlock.specialName ? `: ${inspectedBlock.specialName}` : ''}`
                    : 'La Qaybinayo'}
                </strong>
              </div>
            </div>

            {inspectedBlock.notes && (
              <div className="rounded-xl bg-[#0B1220] border border-[#243449] p-3 text-xs text-[#94A3B8]">
                <strong className="text-[#F8FAFC] block mb-0.5">Faahfaahin:</strong>
                {inspectedBlock.notes}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setInspectedBlockId(null);
                  onNavigateToLandDesigner();
                }}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-4 py-2 text-xs font-extrabold cursor-pointer"
              >
                <MapPin className="w-4 h-4" />
                <span>Ku Eeg Khariidadda GIS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL / BOTTOM SHEET: PLOT */}
      {inspectedPlot && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setInspectedPlotId(null)}
        >
          <div
            className="w-full sm:max-w-lg bg-[#0F1B2D] border-t sm:border border-[#243449] rounded-t-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-[#243449] rounded-full mx-auto sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-[#10B981]">
                  Faahfaahinta Plot-ka · Block {inspectedPlot.blockId} (Booska #{inspectedPlot.plotNo})
                </span>
                <h3 className="text-lg font-extrabold text-[#F8FAFC] font-mono-numbers tabular-nums">
                  {inspectedPlot.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedPlotId(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#0B1220] border border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3">
                <span className="text-[#94A3B8] block">Bedka Dhabta ah</span>
                <strong className="text-sm font-mono-numbers tabular-nums text-[#F8FAFC] mt-0.5 block">
                  {inspectedPlot.actualAreaSqM.toLocaleString()} m²
                </strong>
              </div>
              <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3">
                <span className="text-[#94A3B8] block">Geometry &amp; Xeerka</span>
                <strong className="text-sm text-[#10B981] mt-0.5 block">
                  {inspectedPlot.geometryLabel}
                </strong>
              </div>
              <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3 col-span-2">
                <span className="text-[#94A3B8] block">Mulkiilaha / Xaaladda Qoondaynta</span>
                <strong
                  className={`text-sm mt-0.5 block ${
                    inspectedPlot.isExcluded ? 'text-rose-400' : 'text-[#F8FAFC]'
                  }`}
                >
                  {inspectedPlot.ownerDisplay}
                </strong>
              </div>
            </div>

            {inspectedPlot.halfPlotValidation && (
              <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3.5 text-xs space-y-1">
                <div className="font-bold text-[#F8FAFC]">
                  Xaqiijinta Half-Plot &amp; Xuduudda:
                </div>
                <div className="text-[#94A3B8] font-mono-numbers tabular-nums">
                  Xeerka booska #{inspectedPlot.plotNo}:{' '}
                  <strong className="text-[#10B981]">
                    {inspectedPlot.halfPlotValidation.expectedRule.label} (
                    {inspectedPlot.halfPlotValidation.expectedRule.targetAreaSqM} m²)
                  </strong>{' '}
                  · Gudaha: {inspectedPlot.halfPlotValidation.insideAreaSqM.toLocaleString()} m²
                </div>
                <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                  {inspectedPlot.halfPlotValidation.reasonSomali}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setInspectedPlotId(null);
                  onNavigateToLandDesigner();
                }}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-4 py-2 text-xs font-extrabold cursor-pointer"
              >
                <MapPin className="w-4 h-4" />
                <span>Ku Eeg Khariidadda GIS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL / BOTTOM SHEET: HEIR */}
      {inspectedHeir && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setInspectedHeirKey(null)}
        >
          <div
            className="w-full sm:max-w-lg bg-[#0F1B2D] border-t sm:border border-[#243449] rounded-t-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-[#243449] rounded-full mx-auto sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-[#10B981]">
                  {inspectedHeir.roleSomali} ({inspectedHeir.roleArabic})
                </span>
                <h3 className="text-lg font-extrabold text-[#F8FAFC]">
                  {inspectedHeir.personName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedHeirKey(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#0B1220] border border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {inspectedHeir.kind === 'blocked' ? (
              <div className="bg-amber-950/35 border border-amber-500/35 rounded-xl p-4 text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Waxaa xannibay: {inspectedHeir.blockedBy}</span>
                </div>
                <p className="text-[#F8FAFC] leading-relaxed">{inspectedHeir.blockedRule}</p>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3">
                    <span className="text-[#94A3B8] block">Saamiga Qofka</span>
                    <strong className="text-sm font-mono-numbers tabular-nums text-[#10B981] mt-0.5 block">
                      {inspectedHeir.individualPercentage.toFixed(2)}% ({inspectedHeir.quranicFraction})
                    </strong>
                  </div>
                  <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3">
                    <span className="text-[#94A3B8] block">Saamiyada Tashih</span>
                    <strong className="text-sm font-mono-numbers tabular-nums text-[#F8FAFC] mt-0.5 block">
                      {inspectedHeir.tashihSharesPerPerson} / {result.tashihBase}
                    </strong>
                  </div>
                </div>

                <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3.5 space-y-1.5 font-mono-numbers tabular-nums">
                  {result.netDistributableEstateUSD > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Qiimaha Guud:</span>
                      <strong className="text-[#10B981]">
                        {formatMoney(inspectedHeir.totalEstimatedValueUSD)}
                      </strong>
                    </div>
                  )}
                  {distribution.totalLandPlots > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Dhul (Plots):</span>
                      <strong className="text-[#F8FAFC]">{inspectedHeir.landDisplay}</strong>
                    </div>
                  )}
                  {inspectedHeir.gisAreaSqM !== null && (
                    <div className="flex justify-between">
                      <span className="text-[#94A3B8]">Bedka GIS:</span>
                      <strong className="text-[#F8FAFC]">
                        {inspectedHeir.gisAreaSqM.toLocaleString()} m²
                      </strong>
                    </div>
                  )}
                  {inspectedHeir.gisPlots.length > 0 && (
                    <div className="pt-1 border-t border-[#243449] text-[11px] text-[#94A3B8]">
                      <strong className="text-[#F8FAFC]">Plot IDs: </strong>
                      {inspectedHeir.gisPlots.join(', ')}
                    </div>
                  )}
                </div>

                {inspectedHeir.quranicProof && (
                  <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-3.5 space-y-1">
                    <span className="font-bold text-[#10B981] block">Daliilka Sharciga:</span>
                    <p className="text-[#F8FAFC]/90 leading-relaxed">{inspectedHeir.notesSomali}</p>
                    <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                      {inspectedHeir.quranicProof}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
