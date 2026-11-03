import React, { useState } from 'react';
import {
  HeirsInput,
  EstateAssetItem,
  EstateDeductionItem,
  Currency,
} from '../types/inheritance';
import {
  FairLandAllocationResult,
  LandAllocationMode,
  SubdivisionComputationResult,
} from '../types/landSubdivision';
import { LAND_ALLOCATION_MODE_METADATA } from '../utils/landSubdivisionEngine';
import { updateHeirPersonName } from '../utils/heirNameUtils';
import { countEnteredHeirs } from '../utils/unifiedMetrics';
import {
  Check,
  Plus,
  Minus,
  Lock,
  RotateCcw,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  MapPin,
  SlidersHorizontal,
  UserCheck,
  Grid,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';

interface SimpleApkCalculatorViewProps {
  heirsInput: HeirsInput;
  assets: EstateAssetItem[];
  deductions: EstateDeductionItem[];
  currency: Currency;
  linkedLandAllocation?: FairLandAllocationResult | null;
  subdivisionResult?: SubdivisionComputationResult | null;
  currentHasMap?: boolean;
  selectedTargetScope?: string;
  onSelectTargetScope?: (scope: string) => void;
  allocationMode?: LandAllocationMode;
  onChangeAllocationMode?: (mode: LandAllocationMode) => void;
  includeValidHalfPlots?: boolean;
  onToggleIncludeHalfPlots?: (include: boolean) => void;
  onSyncFullFarmGis?: () => void;
  onChangeCurrency: (c: Currency) => void;
  onUpdateHeirs: (updated: HeirsInput) => void;
  onUpdateAssets: (updated: EstateAssetItem[]) => void;
  onUpdateDeductions: (updated: EstateDeductionItem[]) => void;
  onOpenDetailedAssetsModal: () => void;
  onOpenLandDesigner: () => void;
  onCalculateAndViewResults: () => void;
  onSaveCaseRecord: () => void;
  onClearCase: () => void;
}

const APK_STEPS = [
  { id: 1, label: 'Marxuumka', anchor: 'step-deceased' },
  { id: 2, label: 'Lammaane', anchor: 'step-spouse' },
  { id: 3, label: 'Farac', anchor: 'step-descendants' },
  { id: 4, label: 'Waalid', anchor: 'step-parents' },
  { id: 5, label: 'Awoowe', anchor: 'step-grandparents' },
  { id: 6, label: 'Walaalo', anchor: 'step-siblings' },
  { id: 7, label: 'Qaraabo', anchor: 'step-relatives' },
  { id: 8, label: 'Natiijada', anchor: 'step-actions' },
];

type QuickEstateMode = 'money' | 'other_asset' | 'multi_asset' | 'gis_blocks';

export const SimpleApkCalculatorView: React.FC<SimpleApkCalculatorViewProps> = ({
  heirsInput,
  assets,
  deductions,
  currency,
  linkedLandAllocation,
  subdivisionResult,
  currentHasMap = false,
  selectedTargetScope = 'all_farm',
  onSelectTargetScope,
  allocationMode = 'exact_shared',
  onChangeAllocationMode,
  includeValidHalfPlots = false,
  onToggleIncludeHalfPlots,
  onSyncFullFarmGis,
  onChangeCurrency,
  onUpdateHeirs,
  onUpdateAssets,
  onUpdateDeductions,
  onOpenDetailedAssetsModal,
  onOpenLandDesigner,
  onCalculateAndViewResults,
  onSaveCaseRecord,
  onClearCase,
}) => {
  const [activeStepFilter, setActiveStepFilter] = useState<number | 'all'>('all');
  const [wizardStep, setWizardStep] = useState<1 | 2>(2);
  const [showExtendedShariaSections, setShowExtendedShariaSections] = useState<boolean>(false);
  const [estateMode, setEstateMode] = useState<QuickEstateMode>(() => {
    if (assets.some((a) => a.id.startsWith('gis_subdivision_'))) return 'gis_blocks';
    if (assets.length > 1) return 'multi_asset';
    if (assets.length === 1 && assets[0].category !== 'cash') return 'other_asset';
    return 'money';
  });
  const [otherAssetType, setOtherAssetType] = useState<string>(() => {
    if (assets.length === 1 && assets[0].category !== 'cash' && assets[0].unit) {
      return assets[0].unit;
    }
    return 'Plot';
  });
  const [expandedNameKey, setExpandedNameKey] = useState<string | null>(null);
  const [hideBlockedRows, setHideBlockedRows] = useState<boolean>(false);

  const totalEstateValue = assets.reduce((s, a) => s + (a.estimatedValueUSD || 0), 0);
  const totalQuickQuantity = assets[0]?.quantity || 1;
  const totalDeductionsUSD = deductions.reduce((s, d) => s + (d.amountUSD || 0), 0);
  const enteredHeirsCount = countEnteredHeirs(heirsInput);

  const handleQuickMoneyChange = (valStr: string) => {
    const amount = Math.max(0, parseFloat(valStr) || 0);
    const updatedAsset: EstateAssetItem = {
      id: 'quick_money_1',
      category: 'cash',
      title: `Wadarta Lacagta Dhaxalka (${currency})`,
      quantity: 1,
      unit: currency,
      estimatedValueUSD: amount,
      qualityTier: 'tier_1_prime',
      tierName: 'Heerka 1aad (Lacag Caddaan / Bangi)',
    };
    onUpdateAssets([updatedAsset]);
  };

  const handleQuickOtherAssetChange = (qtyStr: string, unitType: string, estValStr?: string) => {
    const qty = Math.max(0, parseFloat(qtyStr) || 0);
    const currentEst =
      estValStr !== undefined
        ? Math.max(0, parseFloat(estValStr) || 0)
        : assets[0]?.estimatedValueUSD || 0;
    const isLand = unitType === 'Plot' || unitType === 'Guri' || unitType === 'Hektar';
    const isLivestock = unitType === 'Neef';

    const updatedAsset: EstateAssetItem = {
      id: 'quick_other_1',
      category: isLivestock ? 'livestock' : isLand ? 'real_estate' : 'gold_jewelry',
      title: `${qty} ${unitType} oo Hanti Dhaxal ah`,
      quantity: qty || 1,
      unit: unitType,
      isUnvaluedLand: isLand && currentEst === 0,
      estimatedValueUSD: currentEst,
      qualityTier: 'tier_1_prime',
      tierName: 'Heerka 1aad (Meel Fiican / Prime)',
    };
    onUpdateAssets([updatedAsset]);
  };

  const handleQuickDebtChange = (valStr: string) => {
    const amount = Math.max(0, parseFloat(valStr) || 0);
    if (amount === 0) {
      onUpdateDeductions([]);
    } else {
      onUpdateDeductions([
        {
          id: 'quick_debt_1',
          category: 'debt_human',
          title: 'Deymaha & Kharashka Aaska',
          amountUSD: amount,
        },
      ]);
    }
  };

  const handleGenderChange = (gender: 'male' | 'female') => {
    if (gender === 'male') {
      onUpdateHeirs({
        ...heirsInput,
        deceasedGender: 'male',
        husbandAlive: false,
      });
    } else {
      onUpdateHeirs({
        ...heirsInput,
        deceasedGender: 'female',
        wivesCount: 0,
      });
    }
  };

  // Real-time Shariah Xajb (Blocking) conditions matching faraidCalculator
  const hasSons = heirsInput.sonsCount > 0;
  const hasGrandsons = heirsInput.grandsonsCount > 0;
  const hasMaleDescendant = hasSons || hasGrandsons;
  const hasAnyDescendant =
    hasSons ||
    heirsInput.daughtersCount > 0 ||
    hasGrandsons ||
    heirsInput.granddaughtersCount > 0;
  const hasTwoOrMoreDaughtersNoGrandson =
    heirsInput.daughtersCount >= 2 && heirsInput.grandsonsCount === 0;

  const fatherAlive = heirsInput.fatherAlive;
  const motherAlive = heirsInput.motherAlive;
  const grandfatherAlive = heirsInput.paternalGrandfatherAlive;

  const fullBrothersExist = heirsInput.fullBrothersCount > 0;
  const paternalBrothersExist = heirsInput.paternalBrothersCount > 0;
  const fullSistersWithDescendantAsabah =
    heirsInput.fullSistersCount > 0 &&
    !hasMaleDescendant &&
    (heirsInput.daughtersCount > 0 || heirsInput.granddaughtersCount > 0);
  const twoFullSistersNoPaternalBro =
    heirsInput.fullSistersCount >= 2 && heirsInput.paternalBrothersCount === 0;

  const fullNephewsExist = heirsInput.fullNephewsCount > 0;
  const paternalNephewsExist = heirsInput.paternalNephewsCount > 0;
  const fullUnclesExist = heirsInput.fullPaternalUnclesCount > 0;
  const paternalUnclesExist = heirsInput.paternalPaternalUnclesCount > 0;
  const fullCousinsExist = heirsInput.fullCousinsCount > 0;

  const renderInlineNamesEditor = (nameKey: string, count: number, roleLabel: string) => {
    if (count <= 0) return null;
    const isExpanded = expandedNameKey === nameKey;
    const currentNames = heirsInput.heirNames?.[nameKey] || [];
    const filledCount = currentNames
      .slice(0, count)
      .filter((n) => n && n.trim().length > 0).length;

    return (
      <div className="px-4 pb-3 bg-[#0B1220]/70 border-t border-[#243449]/70">
        <button
          type="button"
          onClick={() => setExpandedNameKey(isExpanded ? null : nameKey)}
          className="min-h-[38px] inline-flex items-center gap-1.5 text-xs font-semibold text-[#10B981] hover:underline cursor-pointer"
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>
            {filledCount > 0
              ? `Magacyada la qoray (${filledCount}/${count}) — Wax ka beddel`
              : `Ku qor magaca ${count === 1 ? roleLabel : `${count}-da ${roleLabel}`} (Ikhtiyaari)`}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {isExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {Array.from({ length: count }).map((_, idx) => (
              <input
                key={idx}
                type="text"
                value={currentNames[idx] || ''}
                onChange={(e) => {
                  const updated = updateHeirPersonName(heirsInput, nameKey, idx, e.target.value);
                  onUpdateHeirs(updated);
                }}
                placeholder={`${roleLabel} ${count > 1 ? `${idx + 1}aad` : ''} — Magaca saddexan...`}
                className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-xs font-medium text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none"
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderBooleanHeirRow = (opts: {
    label: string;
    arabic: string;
    checked: boolean;
    onChange: (val: boolean) => void;
    blockedReason?: string | null;
    nameKey: string;
  }) => {
    if (hideBlockedRows && opts.blockedReason && !opts.checked) return null;
    const isBlocked = !!opts.blockedReason;

    return (
      <div
        className={`border-b border-[#243449]/70 last:border-b-0 transition-colors ${
          isBlocked
            ? 'bg-[#0B1220]/50 opacity-60'
            : opts.checked
            ? 'bg-[#10B981]/[0.06]'
            : 'bg-[#0F1B2D]'
        }`}
      >
        <div
          onClick={() => {
            if (!isBlocked || opts.checked) {
              opts.onChange(!opts.checked);
            }
          }}
          className={`min-h-[60px] px-4 py-2.5 flex items-center justify-between gap-3 ${
            isBlocked && !opts.checked
              ? 'cursor-not-allowed'
              : 'cursor-pointer hover:bg-[#0B1220]/40'
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#F8FAFC]">{opts.label}</span>
              <span className="text-xs font-arabic text-[#94A3B8]">{opts.arabic}</span>
            </div>
            {opts.blockedReason && (
              <p className="text-[11px] text-amber-400 font-medium mt-0.5 flex items-center gap-1">
                <Lock className="w-3 h-3 shrink-0" />
                <span>Xanniban: {opts.blockedReason}</span>
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={isBlocked && !opts.checked}
            onClick={(e) => {
              e.stopPropagation();
              if (!isBlocked || opts.checked) {
                opts.onChange(!opts.checked);
              }
            }}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors shrink-0 ${
              opts.checked
                ? 'bg-[#10B981] text-[#030712]'
                : isBlocked
                ? 'bg-[#0B1220] text-[#94A3B8]/30 border border-[#243449]'
                : 'bg-[#0B1220] hover:border-[#10B981]/60 text-[#94A3B8] border border-[#243449]'
            }`}
            aria-label={opts.label}
          >
            {opts.checked ? (
              <Check className="w-5 h-5 stroke-[2.5]" />
            ) : (
              <span className="w-4 h-4 rounded border border-[#94A3B8]/50" />
            )}
          </button>
        </div>

        {opts.checked && !isBlocked && renderInlineNamesEditor(opts.nameKey, 1, opts.label)}
      </div>
    );
  };

  const renderCountHeirRow = (opts: {
    label: string;
    arabic: string;
    count: number;
    max?: number;
    onChange: (val: number) => void;
    blockedReason?: string | null;
    nameKey: string;
  }) => {
    if (hideBlockedRows && opts.blockedReason && opts.count === 0) return null;
    const isBlocked = !!opts.blockedReason;
    const maxVal = opts.max ?? 30;

    return (
      <div
        className={`border-b border-[#243449]/70 last:border-b-0 transition-colors ${
          isBlocked
            ? 'bg-[#0B1220]/50 opacity-60'
            : opts.count > 0
            ? 'bg-[#10B981]/[0.06]'
            : 'bg-[#0F1B2D]'
        }`}
      >
        <div className="min-h-[60px] px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#F8FAFC]">{opts.label}</span>
              <span className="text-xs font-arabic text-[#94A3B8]">{opts.arabic}</span>
            </div>
            {opts.blockedReason && (
              <p className="text-[11px] text-amber-400 font-medium mt-0.5 flex items-center gap-1">
                <Lock className="w-3 h-3 shrink-0" />
                <span>Xanniban: {opts.blockedReason}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={opts.count <= 0}
              onClick={() => opts.onChange(Math.max(0, opts.count - 1))}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#243449] bg-[#0B1220] hover:border-[#94A3B8] disabled:opacity-30 text-[#F8FAFC] transition-colors cursor-pointer disabled:cursor-not-allowed"
              aria-label={`Yaree ${opts.label}`}
            >
              <Minus className="w-4 h-4" />
            </button>

            <span
              className={`min-w-[38px] text-center font-mono-numbers text-sm font-bold tabular-nums ${
                opts.count > 0 ? 'text-[#10B981]' : 'text-[#94A3B8]'
              }`}
            >
              {opts.count}
            </span>

            <button
              type="button"
              disabled={(isBlocked && opts.count === 0) || opts.count >= maxVal}
              onClick={() => opts.onChange(Math.min(maxVal, opts.count + 1))}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:bg-[#0B1220] disabled:border disabled:border-[#243449] disabled:text-[#94A3B8]/30 text-[#030712] transition-colors cursor-pointer disabled:cursor-not-allowed"
              aria-label={`Kordhi ${opts.label}`}
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {opts.count > 0 &&
          !isBlocked &&
          renderInlineNamesEditor(opts.nameKey, opts.count, opts.label)}
      </div>
    );
  };

  const shouldShowSection = (stepNum: number) =>
    activeStepFilter === 'all' || activeStepFilter === stepNum;

  const parentsSelectValue =
    heirsInput.fatherAlive && heirsInput.motherAlive
      ? 'both'
      : heirsInput.fatherAlive
      ? 'father_only'
      : heirsInput.motherAlive
      ? 'mother_only'
      : 'none';

  const handleParentsDropdownChange = (val: string) => {
    if (val === 'both') {
      onUpdateHeirs({ ...heirsInput, fatherAlive: true, motherAlive: true });
    } else if (val === 'father_only') {
      onUpdateHeirs({ ...heirsInput, fatherAlive: true, motherAlive: false });
    } else if (val === 'mother_only') {
      onUpdateHeirs({ ...heirsInput, fatherAlive: false, motherAlive: true });
    } else {
      onUpdateHeirs({ ...heirsInput, fatherAlive: false, motherAlive: false });
    }
  };

  const handleScopeSelectionChange = (scopeVal: string) => {
    onSelectTargetScope?.(scopeVal);
    if (scopeVal === 'all_farm') {
      setEstateMode('gis_blocks');
      onSyncFullFarmGis?.();
      return;
    }
    if (scopeVal.startsWith('block:') && subdivisionResult) {
      const blkId = scopeVal.slice('block:'.length);
      const blk = subdivisionResult.blocks.find((b) => b.id === blkId);
      if (blk) {
        setEstateMode('other_asset');
        setOtherAssetType('Plot');
        onUpdateAssets([
          {
            id: `gis_block_${blk.id}`,
            category: 'real_estate',
            title: `Block ${blk.id} (${blk.nf} Plot)`,
            quantity: Math.max(1, blk.nf),
            unit: 'Plot',
            isUnvaluedLand: true,
            estimatedValueUSD: 0,
            qualityTier: 'tier_1_prime',
            tierName: `Block ${blk.id}`,
          },
        ]);
      }
      return;
    }
    if (scopeVal.startsWith('plot:') && subdivisionResult) {
      const plotId = scopeVal.slice('plot:'.length);
      const allPool = subdivisionResult.allEvaluatedPlots || subdivisionResult.plots;
      const pl = allPool.find((p) => p.id === plotId);
      const areaM2 = pl
        ? Math.round(pl.calculatedAreaSqM ?? subdivisionResult.params.pw * subdivisionResult.params.pd)
        : 432;
      setEstateMode('other_asset');
      setOtherAssetType('m²');
      onUpdateAssets([
        {
          id: `gis_plot_${plotId}`,
          category: 'real_estate',
          title: `Plot ${plotId} (${areaM2} m²)`,
          quantity: areaM2,
          unit: 'm²',
          isUnvaluedLand: true,
          estimatedValueUSD: 0,
          qualityTier: 'tier_1_prime',
          tierName: `Plot ${plotId}`,
        },
      ]);
      return;
    }
    if (scopeVal === 'money_custom') {
      setEstateMode('money');
      setShowExtendedShariaSections(true);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-6 text-[#e8eef7]">
      {/* 3-STEP HORIZONTAL STEPPER WITH DISTINCT COMPLETED (✓), CURRENT (RING), UPCOMING STATES (E6) */}
      <div className="bg-[#111b2e] border border-[#223250] rounded-2xl px-4 py-3.5">
        <div className="flex items-center justify-between gap-2 max-w-md mx-auto">
          {/* Step 1: Hantida */}
          <button
            type="button"
            onClick={() => setWizardStep(1)}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <span
              className={`w-7 h-7 rounded-full text-xs font-extrabold flex items-center justify-center transition-colors ${
                wizardStep > 1
                  ? 'bg-[#22c55e] text-[#060d18]'
                  : 'bg-[#111b2e] border-2 border-[#22c55e] text-[#22c55e]'
              }`}
            >
              {wizardStep > 1 ? <Check className="w-4 h-4 stroke-[3]" /> : '1'}
            </span>
            <span
              className={`text-xs font-bold ${
                wizardStep === 1 ? 'text-[#22c55e]' : 'text-[#e8eef7]'
              }`}
            >
              Hantida
            </span>
          </button>

          <div
            className={`flex-1 h-0.5 rounded-full mx-1 ${
              wizardStep > 1 ? 'bg-[#22c55e]' : 'bg-[#223250]'
            }`}
          />

          {/* Step 2: Dhaxlayaasha */}
          <button
            type="button"
            onClick={() => setWizardStep(2)}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <span
              className={`w-7 h-7 rounded-full text-xs font-extrabold flex items-center justify-center transition-colors ${
                wizardStep === 2
                  ? 'bg-[#111b2e] border-2 border-[#22c55e] text-[#22c55e]'
                  : 'bg-[#0a1220] border border-[#223250] text-[#a9b8d0]'
              }`}
            >
              2
            </span>
            <span
              className={`text-xs font-bold ${
                wizardStep === 2 ? 'text-[#22c55e]' : 'text-[#a9b8d0]'
              }`}
            >
              Dhaxlayaasha
            </span>
          </button>

          <div className="flex-1 h-0.5 bg-[#223250] rounded-full mx-1" />

          {/* Step 3: Natiijada (Disabled when 0 heirs entered — E13) */}
          <button
            type="button"
            disabled={enteredHeirsCount === 0}
            onClick={() => {
              if (enteredHeirsCount > 0) {
                onCalculateAndViewResults();
              }
            }}
            className="flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-55 group"
          >
            <span className="w-7 h-7 rounded-full bg-[#0a1220] border border-[#223250] group-hover:border-[#22c55e] text-xs font-extrabold text-[#a9b8d0] flex items-center justify-center transition-colors">
              3
            </span>
            <span className="text-xs font-semibold text-[#a9b8d0]">
              Natiijada
            </span>
          </button>
        </div>
      </div>

      {/* STEP 1 CARD: "1. Hantida & Dhulka" */}
      <section
        className={`bg-[#111b2e] border rounded-2xl p-4 sm:p-5 space-y-3 transition-colors ${
          wizardStep === 1 ? 'border-[#22c55e]/65' : 'border-[#223250]'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-extrabold text-[#e8eef7]">
            1. Hantida &amp; Dhulka (Booska ama Block-ga)
          </h2>
          <button
            type="button"
            onClick={onOpenLandDesigner}
            className="text-xs font-bold text-[#22C55E] hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Khariidadda</span>
          </button>
        </div>

        <div className="relative">
          <select
            value={selectedTargetScope}
            onChange={(e) => handleScopeSelectionChange(e.target.value)}
            aria-label="Dooro Booska ama Block-ga"
            className="w-full min-h-[48px] rounded-xl bg-[#0B1220] border border-[#243449] focus:border-[#22C55E] px-4 py-2.5 text-sm font-semibold text-[#F8FAFC] focus:outline-none cursor-pointer"
          >
            <option value="all_farm">
              {currentHasMap && subdivisionResult
                ? `Dhammaan Beerta (${subdivisionResult.plots.length} Plot · ${subdivisionResult.blocks.length} Block)`
                : 'Dhammaan Beerta'}
            </option>
            {currentHasMap &&
              subdivisionResult &&
              subdivisionResult.blocks.map((b) => (
                <option key={`blk_${b.id}`} value={`block:${b.id}`}>
                  Block {b.id} ({b.nf} Plot)
                </option>
              ))}
            {currentHasMap &&
              subdivisionResult &&
              subdivisionResult.plots.slice(0, 60).map((p) => (
                <option key={`plt_${p.id}`} value={`plot:${p.id}`}>
                  Plot {p.id} (
                  {Math.round(
                    p.calculatedAreaSqM ?? subdivisionResult.params.pw * subdivisionResult.params.pd
                  )}{' '}
                  m²)
                </option>
              ))}
            <option value="money_custom">Lacag, Xoolo ama Hanti Kale</option>
          </select>
        </div>

        {/* 3-Mode Land Allocation Selector when dividing Land / Farm Plots */}
        {onChangeAllocationMode &&
          (selectedTargetScope !== 'money_custom' ||
            estateMode === 'gis_blocks' ||
            (estateMode === 'other_asset' && otherAssetType === 'Plot')) && (
            <div className="pt-2 border-t border-[#243449]/70 space-y-2">
              <span className="block text-xs font-bold text-[#94A3B8]">
                Nooca Qaybinta Plots-ka Dhaxalka:
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {(
                  [
                    'exact_shared',
                    'whole_balanced',
                    'clean_equal_no_half_no_fraction',
                  ] as LandAllocationMode[]
                ).map((modeId) => {
                  const meta = LAND_ALLOCATION_MODE_METADATA[modeId];
                  const active = allocationMode === modeId;
                  return (
                    <button
                      key={modeId}
                      type="button"
                      onClick={() => onChangeAllocationMode(modeId)}
                      className={`w-full text-left rounded-xl border px-3.5 py-2.5 transition-colors cursor-pointer ${
                        active
                          ? 'border-[#22C55E] bg-[#22C55E]/10'
                          : 'border-[#243449] bg-[#0B1220] hover:border-[#22C55E]/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-[#F8FAFC]">
                          {meta.titleSomali}
                        </span>
                        {active && <Check className="w-4 h-4 text-[#22C55E] shrink-0" />}
                      </div>
                      <p className="text-[11px] text-[#94A3B8] mt-0.5 leading-relaxed">
                        {meta.descriptionSomali}
                      </p>
                    </button>
                  );
                })}
              </div>

              {onToggleIncludeHalfPlots && (
                <div className="pt-2 border-t border-[#243449]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-extrabold text-[#F8FAFC] block">
                      Half-Plots (0.5 Plot):
                    </span>
                    <span className="text-[11px] text-[#94A3B8]">
                      Ku dar ama ka reeb half-plots-ka xuduudka beerta ee dhaxalka
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0B1220] border border-[#243449] shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleIncludeHalfPlots(true)}
                      className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        includeValidHalfPlots
                          ? 'bg-[#22C55E] text-[#05130B]'
                          : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                      }`}
                    >
                      Ku Dar (0.5)
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleIncludeHalfPlots(false)}
                      className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        !includeValidHalfPlots
                          ? 'bg-[#16263D] text-[#F8FAFC] border border-[#243449]'
                          : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                      }`}
                    >
                      Ka Reeb
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
      </section>

      {/* STEP 2 CARD: "2. Dhaxlayaasha" */}
      <section
        className={`bg-[#111b2e] border rounded-2xl p-4 sm:p-5 space-y-3.5 transition-colors ${
          wizardStep === 2 ? 'border-[#22c55e]/65' : 'border-[#223250]'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-extrabold text-[#e8eef7]">
              2. Dhaxlayaasha
            </h2>
            <span
              className={`px-2 py-0.5 rounded-lg text-[11px] font-mono-numbers tabular-nums font-bold ${
                enteredHeirsCount > 0
                  ? 'bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30'
                  : 'bg-[#facc15]/15 text-[#facc15] border border-[#facc15]/30'
              }`}
            >
              {enteredHeirsCount} Dhaxle
            </span>
          </div>

          {/* Compact Deceased Gender Selector */}
          <div className="inline-flex items-center rounded-xl bg-[#0a1220] border border-[#223250] p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setWizardStep(2);
                handleGenderChange('male');
              }}
              className={`min-h-[36px] px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                heirsInput.deceasedGender === 'male'
                  ? 'bg-[#22c55e] text-[#060d18]'
                  : 'text-[#a9b8d0] hover:text-[#e8eef7]'
              }`}
            >
              Marxuum (Nin)
            </button>
            <button
              type="button"
              onClick={() => {
                setWizardStep(2);
                handleGenderChange('female');
              }}
              className={`min-h-[36px] px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                heirsInput.deceasedGender === 'female'
                  ? 'bg-[#22c55e] text-[#060d18]'
                  : 'text-[#a9b8d0] hover:text-[#e8eef7]'
              }`}
            >
              Marxuumad (Naag)
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          {/* Wiilal (Pure Somali — E15) */}
          <div className="min-h-[58px] rounded-xl bg-[#0a1220] border border-[#223250] px-4 py-2.5 flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-[#e8eef7]">Wiilal</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={heirsInput.sonsCount <= 0}
                onClick={() => {
                  setWizardStep(2);
                  onUpdateHeirs({
                    ...heirsInput,
                    sonsCount: Math.max(0, heirsInput.sonsCount - 1),
                  });
                }}
                aria-label="Yaree Wiilal"
                className="w-11 h-11 rounded-xl bg-[#111b2e] border border-[#223250] hover:border-[#a9b8d0] disabled:opacity-35 flex items-center justify-center text-[#e8eef7] cursor-pointer disabled:cursor-not-allowed"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="min-w-[34px] text-center font-mono-numbers tabular-nums text-base font-extrabold text-[#e8eef7]">
                {heirsInput.sonsCount}
              </span>
              <button
                type="button"
                onClick={() => {
                  setWizardStep(2);
                  onUpdateHeirs({
                    ...heirsInput,
                    sonsCount: Math.min(30, heirsInput.sonsCount + 1),
                  });
                }}
                aria-label="Kordhi Wiilal"
                className="w-11 h-11 rounded-xl bg-[#111b2e] border border-[#223250] hover:border-[#22c55e] flex items-center justify-center text-[#e8eef7] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Gabdho (Pure Somali — E15) */}
          <div className="min-h-[58px] rounded-xl bg-[#0a1220] border border-[#223250] px-4 py-2.5 flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-[#e8eef7]">Gabdho</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={heirsInput.daughtersCount <= 0}
                onClick={() =>
                  onUpdateHeirs({
                    ...heirsInput,
                    daughtersCount: Math.max(0, heirsInput.daughtersCount - 1),
                  })
                }
                aria-label="Yaree Gabdho"
                className="w-11 h-11 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#94A3B8] disabled:opacity-35 flex items-center justify-center text-[#F8FAFC] cursor-pointer disabled:cursor-not-allowed"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="min-w-[34px] text-center font-mono-numbers tabular-nums text-base font-extrabold text-[#F8FAFC]">
                {heirsInput.daughtersCount}
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateHeirs({
                    ...heirsInput,
                    daughtersCount: Math.min(30, heirsInput.daughtersCount + 1),
                  })
                }
                aria-label="Kordhi Gabdho"
                className="w-11 h-11 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#22C55E] flex items-center justify-center text-[#F8FAFC] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Xaaska/Haweenka OR Sayga */}
          {heirsInput.deceasedGender === 'male' ? (
            <div className="min-h-[58px] rounded-xl bg-[#0B1220] border border-[#243449] px-4 py-2.5 flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-[#F8FAFC]">Xaaska/Haweenka</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={heirsInput.wivesCount <= 0}
                  onClick={() =>
                    onUpdateHeirs({
                      ...heirsInput,
                      wivesCount: Math.max(0, heirsInput.wivesCount - 1),
                    })
                  }
                  aria-label="Yaree Xaaska"
                  className="w-11 h-11 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#94A3B8] disabled:opacity-35 flex items-center justify-center text-[#F8FAFC] cursor-pointer disabled:cursor-not-allowed"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="min-w-[34px] text-center font-mono-numbers tabular-nums text-base font-extrabold text-[#F8FAFC]">
                  {heirsInput.wivesCount}
                </span>
                <button
                  type="button"
                  disabled={heirsInput.wivesCount >= 4}
                  onClick={() =>
                    onUpdateHeirs({
                      ...heirsInput,
                      wivesCount: Math.min(4, heirsInput.wivesCount + 1),
                    })
                  }
                  aria-label="Kordhi Xaaska"
                  className="w-11 h-11 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#22C55E] disabled:opacity-35 flex items-center justify-center text-[#F8FAFC] cursor-pointer disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="min-h-[58px] rounded-xl bg-[#0B1220] border border-[#243449] px-4 py-2.5 flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-[#F8FAFC]">Sayga (Ninka)</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!heirsInput.husbandAlive}
                  onClick={() => onUpdateHeirs({ ...heirsInput, husbandAlive: false })}
                  aria-label="Ka saar Sayga"
                  className="w-11 h-11 rounded-xl bg-[#0F1B2D] border border-[#243449] disabled:opacity-35 flex items-center justify-center text-[#F8FAFC] cursor-pointer disabled:cursor-not-allowed"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="min-w-[34px] text-center font-mono-numbers tabular-nums text-base font-extrabold text-[#F8FAFC]">
                  {heirsInput.husbandAlive ? 1 : 0}
                </span>
                <button
                  type="button"
                  disabled={heirsInput.husbandAlive}
                  onClick={() => onUpdateHeirs({ ...heirsInput, husbandAlive: true })}
                  aria-label="Ku dar Sayga"
                  className="w-11 h-11 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#22C55E] disabled:opacity-35 flex items-center justify-center text-[#F8FAFC] cursor-pointer disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Waalidka Dropdown (Exact Screen 5 Match) */}
          <div className="pt-1 space-y-1.5">
            <label className="block text-xs font-bold text-[#94A3B8]">Waalidka</label>
            <select
              value={parentsSelectValue}
              onChange={(e) => handleParentsDropdownChange(e.target.value)}
              aria-label="Waalidka"
              className="w-full min-h-[48px] rounded-xl bg-[#0B1220] border border-[#243449] focus:border-[#22C55E] px-4 py-2.5 text-sm font-semibold text-[#F8FAFC] focus:outline-none cursor-pointer"
            >
              <option value="both">Aabo iyo Hooyo</option>
              <option value="father_only">Aabo Keliya</option>
              <option value="mother_only">Hooyo Keliya</option>
              <option value="none">Midna (Waalid nool ma jiro)</option>
            </select>
          </div>
        </div>

        {/* Toggle for Extended Heirs (Grandparents, Siblings, Uncles), Individual Names & Detailed Assets */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#243449]/70">
          <button
            type="button"
            onClick={() => setShowExtendedShariaSections((prev) => !prev)}
            className="min-h-[42px] inline-flex items-center gap-1.5 text-xs font-bold text-[#22C55E] hover:underline cursor-pointer"
          >
            {showExtendedShariaSections ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            <span>
              {showExtendedShariaSections
                ? 'Qari Ehelka Kale, Magacyada & Hantida Faahfaahsan'
                : 'Ehelka Kale (Walaalo/Awoowe), Magacyada & Lacagta/Deymaha'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenDetailedAssetsModal}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#0a1220] border border-[#223250] hover:border-[#22c55e] text-xs font-semibold text-[#e8eef7] cursor-pointer"
          >
            Deymaha &amp; Hantida
          </button>
        </div>

        {/* 0-Heir Inline Validation Guidance (E13) */}
        {enteredHeirsCount === 0 && (
          <div className="rounded-xl bg-[#facc15]/10 border border-[#facc15]/35 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-[#facc15]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Geli ugu yaraan hal dhaxle (Wiil, Gabadh, Lammaane, Waalid ama Ehel kale) si aad ugu gudubto Natiijada.
            </span>
          </div>
        )}
      </section>

      {/* EXPANDABLE EXTENDED SHAFI'I SECTIONS (All 8 Steps, Individual Heir Names, Cash/Livestock/Debts) */}
      {showExtendedShariaSections && (
        <div className="space-y-5 pt-1">
          {/* 1. 8-STEP PROGRESS FILTER BAR */}
          <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="text-xs font-bold text-[#F8FAFC]">
                Dhammaan Qaybaha Faraa&apos;idka (Shaaficiya)
              </div>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#94A3B8] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideBlockedRows}
                    onChange={(e) => setHideBlockedRows(e.target.checked)}
                    className="rounded border-[#243449] bg-[#0B1220] text-[#10B981] focus:ring-[#10B981]"
                  />
                  <span>Qari kuwa xanniban (Xajb)</span>
                </label>
                {activeStepFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setActiveStepFilter('all')}
                    className="text-xs font-bold text-[#10B981] hover:underline whitespace-nowrap cursor-pointer"
                  >
                    Muuji Dhammaan
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
              {APK_STEPS.map((st) => {
                const isSelected = activeStepFilter === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      if (st.id === 8) {
                        onCalculateAndViewResults();
                      } else {
                        setActiveStepFilter(activeStepFilter === st.id ? 'all' : st.id);
                      }
                    }}
                    className={`min-h-[54px] rounded-xl p-1.5 flex flex-col items-center justify-center text-center border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#10B981] border-[#10B981] text-[#030712]'
                        : 'bg-[#0B1220] border-[#243449] hover:border-[#10B981]/50 text-[#F8FAFC]'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-lg text-[11px] font-mono-numbers font-bold flex items-center justify-center mb-1 ${
                        isSelected
                          ? 'bg-[#030712] text-[#10B981]'
                          : 'bg-[#0F1B2D] text-[#10B981]'
                      }`}
                    >
                      {st.id}
                    </span>
                    <span className="text-[10px] font-semibold leading-tight line-clamp-1">
                      {st.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

      {/* STEP 1: MARXUUMKA & HANTIDA DHAXALKA */}
      {shouldShowSection(1) && (
        <section
          id="step-deceased"
          className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden"
        >
          <div className="bg-[#0B1220] border-b border-[#243449] px-4 sm:px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#F8FAFC]">
              1. Qofka Dhintay (Marxuumka) &amp; Hantida Dhaxalka
            </h2>
            <span className="text-xs font-arabic text-[#10B981]">المتوفى والتركة</span>
          </div>

          <div className="p-4 sm:p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                  Magaca Qofka Dhintay (Marxuumka)
                </label>
                <input
                  type="text"
                  value={heirsInput.deceasedName}
                  onChange={(e) =>
                    onUpdateHeirs({ ...heirsInput, deceasedName: e.target.value })
                  }
                  placeholder="Tusaale: Marxuum Xaaji Maxamed Nuur"
                  className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                  Taariikhda Dhimashada (Ikhtiyaari)
                </label>
                <input
                  type="date"
                  value={heirsInput.dateOfDeath || ''}
                  onChange={(e) =>
                    onUpdateHeirs({ ...heirsInput, dateOfDeath: e.target.value })
                  }
                  className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#F8FAFC] focus:outline-none tabular-nums"
                />
              </div>
            </div>

            {/* Gender Selection */}
            <div>
              <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                Jinsiga Qofka Dhintay
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleGenderChange('male')}
                  className={`min-h-[48px] rounded-xl border px-4 py-2.5 flex items-center justify-between text-sm font-bold transition-colors cursor-pointer ${
                    heirsInput.deceasedGender === 'male'
                      ? 'bg-[#10B981] border-[#10B981] text-[#030712]'
                      : 'bg-[#0B1220] border-[#243449] text-[#F8FAFC] hover:border-[#10B981]/50'
                  }`}
                >
                  <span>Nin (Lab)</span>
                  <span
                    className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                      heirsInput.deceasedGender === 'male'
                        ? 'border-[#030712] bg-[#030712] text-[#10B981]'
                        : 'border-[#94A3B8]/50'
                    }`}
                  >
                    {heirsInput.deceasedGender === 'male' && <Check className="w-3.5 h-3.5" />}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleGenderChange('female')}
                  className={`min-h-[48px] rounded-xl border px-4 py-2.5 flex items-center justify-between text-sm font-bold transition-colors cursor-pointer ${
                    heirsInput.deceasedGender === 'female'
                      ? 'bg-[#10B981] border-[#10B981] text-[#030712]'
                      : 'bg-[#0B1220] border-[#243449] text-[#F8FAFC] hover:border-[#10B981]/50'
                  }`}
                >
                  <span>Naag (Dheddig)</span>
                  <span
                    className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                      heirsInput.deceasedGender === 'female'
                        ? 'border-[#030712] bg-[#030712] text-[#10B981]'
                        : 'border-[#94A3B8]/50'
                    }`}
                  >
                    {heirsInput.deceasedGender === 'female' && <Check className="w-3.5 h-3.5" />}
                  </span>
                </button>
              </div>
            </div>

            {/* Wadarta Hantida Dhaxalka */}
            <div className="pt-4 border-t border-[#243449] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-[#F8FAFC]">
                  Wadarta Hantida Dhaxalka
                </label>

                <div className="flex flex-wrap rounded-xl bg-[#0B1220] border border-[#243449] p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setEstateMode('money')}
                    className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                      estateMode === 'money'
                        ? 'bg-[#10B981] text-[#030712]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Lacag
                  </button>
                  <button
                    type="button"
                    onClick={() => setEstateMode('other_asset')}
                    className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                      estateMode === 'other_asset'
                        ? 'bg-[#10B981] text-[#030712]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Hanti Kale
                  </button>
                  <button
                    type="button"
                    onClick={() => setEstateMode('multi_asset')}
                    className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                      estateMode === 'multi_asset'
                        ? 'bg-[#10B981] text-[#030712]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Dhul + Lacag + Xoolo
                  </button>
                  <button
                    type="button"
                    onClick={() => setEstateMode('gis_blocks')}
                    className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                      estateMode === 'gis_blocks'
                        ? 'bg-[#10B981] text-[#030712]'
                        : 'text-[#10B981] hover:bg-[#0F1B2D]'
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" />
                    <span>Blocks &amp; Plots (GIS)</span>
                  </button>
                </div>
              </div>

              {estateMode === 'money' && (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                      Nooca Lacagta
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => onChangeCurrency(e.target.value as Currency)}
                      className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-2 text-sm font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                    >
                      <option value="USD">USD ($) — Doolar</option>
                      <option value="SOS">Sh.So — Shilin Soomaali</option>
                      <option value="SLSH">Sl.Sh — Shilin Somaliland</option>
                      <option value="EUR">EUR (€) — Yuuro</option>
                      <option value="SAR">SAR — Riyaal</option>
                      <option value="AED">AED — Dirham</option>
                    </select>
                  </div>

                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                      Cadadka Lacagta Dhaxalka
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={totalEstateValue || ''}
                      onChange={(e) => handleQuickMoneyChange(e.target.value)}
                      placeholder="Geli wadarta lacagta (tusaale: 120000)"
                      className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3.5 py-2 text-sm font-mono-numbers font-bold text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                      Deyn / Aas (Ikhtiyaari)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={totalDeductionsUSD || ''}
                      onChange={(e) => handleQuickDebtChange(e.target.value)}
                      placeholder="0"
                      className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-sm font-mono-numbers font-semibold text-red-400 placeholder:text-[#94A3B8]/60 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {estateMode === 'other_asset' && (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                      Nooca Hantida
                    </label>
                    <select
                      value={otherAssetType}
                      onChange={(e) => {
                        setOtherAssetType(e.target.value);
                        handleQuickOtherAssetChange(
                          String(totalQuickQuantity),
                          e.target.value
                        );
                      }}
                      className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-2 text-sm font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                    >
                      <option value="Plot">Dhul / Baloodh (Plots)</option>
                      <option value="Guri">Guri / Dhisme</option>
                      <option value="Hektar">Beer (Hektar)</option>
                      <option value="Neef">Xoolo Nool (Neefaf)</option>
                      <option value="Gram Dahab">Dahab (Gram)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                      Tirada ({otherAssetType})
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={totalQuickQuantity}
                      onChange={(e) =>
                        handleQuickOtherAssetChange(e.target.value, otherAssetType)
                      }
                      placeholder="Tusaale: 12"
                      className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3.5 py-2 text-sm font-mono-numbers font-bold text-[#F8FAFC] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                      Qiimaha Guud ({currency} — Ikhtiyaari)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={totalEstateValue || ''}
                      onChange={(e) =>
                        handleQuickOtherAssetChange(
                          String(totalQuickQuantity),
                          otherAssetType,
                          e.target.value
                        )
                      }
                      placeholder="0 haddii plots sidooda loo qaybinayo"
                      className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3.5 py-2 text-sm font-mono-numbers font-semibold text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {estateMode === 'multi_asset' && (
                <div className="rounded-xl bg-[#0B1220] border border-[#243449] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-[#F8FAFC] flex items-center gap-2">
                      <span>Hanti Iskudhaf ah ({assets.length} shay)</span>
                      <span className="text-[#94A3B8]">·</span>
                      <span className="font-mono-numbers text-[#10B981]">
                        Wadarta: ${totalEstateValue.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-[#94A3B8]">
                      Ku maamul baloodho kala meel ah (Heerka 1aad/2aad), lacag bangi, geel/ari,
                      deymo iyo dardaaran.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenDetailedAssetsModal}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-4 py-2 text-xs font-bold whitespace-nowrap cursor-pointer shrink-0"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>Maamul Dhulka, Lacagta &amp; Xoolaha</span>
                  </button>
                </div>
              )}

              {estateMode === 'gis_blocks' && (
                <div className="rounded-xl bg-[#0B1220] border border-[#10B981]/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    {linkedLandAllocation ? (
                      <>
                        <div className="text-xs font-bold text-[#10B981] flex flex-wrap items-center gap-2 tabular-nums">
                          <span>
                            Waa Ku Xidhan Yahay: {linkedLandAllocation.totalFullPlots} Plot (
                            {linkedLandAllocation.plotWidthM}×{linkedLandAllocation.plotDepthM} m)
                          </span>
                          <span className="text-[#94A3B8]">·</span>
                          <span className="text-[#F8FAFC]">
                            H1: {linkedLandAllocation.tierCounts.tier_1_prime} · H2:{' '}
                            {linkedLandAllocation.tierCounts.tier_2_standard} · H3:{' '}
                            {linkedLandAllocation.tierCounts.tier_3_basic}
                          </span>
                        </div>
                        <p className="text-xs text-[#94A3B8]">
                          Calculator-ku wuxuu si cadaalad ah ugu qaybinayaa dhaxale kasta heerarka
                          dhulka (H1, H2, H3) oo leh Block ID iyo Plot ID gaar ah.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="text-xs font-bold text-[#F8FAFC] flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#10B981]" />
                          <span>Ku Xidh Naqshadda Blocks &amp; Plots ee Beerta / Dhulka</span>
                        </div>
                        <p className="text-xs text-[#94A3B8]">
                          Soo geli xuduudka beerta, calaamadi heerka dhulka (H1, H2, H3) ama plots-ka
                          laga reebayo, kadibna ku xidh hantida.
                        </p>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onOpenLandDesigner}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-4 py-2 text-xs font-bold whitespace-nowrap cursor-pointer shrink-0"
                  >
                    <Grid className="w-4 h-4" />
                    <span>
                      {linkedLandAllocation
                        ? 'Wax Ka Beddel Khariidadda GIS'
                        : 'Fur Khariidadda GIS'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* STEP 2: LAMMAANE (SPOUSE) */}
      {shouldShowSection(2) && (
        <section
          id="step-spouse"
          className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden"
        >
          <div className="bg-[#0B1220] border-b border-[#243449] px-4 sm:px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#F8FAFC]">2. Lammaane (Sayga / Xaaska)</h2>
            <span className="text-xs font-arabic text-[#10B981]">الزوجية</span>
          </div>
          <div>
            {renderBooleanHeirRow({
              label: 'Sayga (Ninka)',
              arabic: 'الزوج',
              checked: heirsInput.husbandAlive,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, husbandAlive: val }),
              blockedReason:
                heirsInput.deceasedGender === 'male'
                  ? 'Marxuumku waa Nin (Xaaska kaliya ayaa furan)'
                  : null,
              nameKey: 'husband',
            })}
            {renderCountHeirRow({
              label: 'Xaaska (1 ilaa 4)',
              arabic: 'الزوجة',
              count: heirsInput.wivesCount,
              max: 4,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, wivesCount: val }),
              blockedReason:
                heirsInput.deceasedGender === 'female'
                  ? 'Marxuumaddu waa Naag (Sayga kaliya ayaa furan)'
                  : null,
              nameKey: 'wives',
            })}
          </div>
        </section>
      )}

      {/* STEP 3: FARAC (CHILDREN & GRANDCHILDREN) */}
      {shouldShowSection(3) && (
        <section
          id="step-descendants"
          className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden"
        >
          <div className="bg-[#0B1220] border-b border-[#243449] px-4 sm:px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#F8FAFC]">
              3. Farac (Carruurta &amp; Carruurta Wiilka)
            </h2>
            <span className="text-xs font-arabic text-[#10B981]">الفروع</span>
          </div>
          <div>
            {renderCountHeirRow({
              label: 'Wiilka',
              arabic: 'الابن',
              count: heirsInput.sonsCount,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, sonsCount: val }),
              nameKey: 'sons',
            })}
            {renderCountHeirRow({
              label: 'Gabadha',
              arabic: 'البنت',
              count: heirsInput.daughtersCount,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, daughtersCount: val }),
              nameKey: 'daughters',
            })}
            {renderCountHeirRow({
              label: 'Wiilka wiilka',
              arabic: 'ابن الابن',
              count: heirsInput.grandsonsCount,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, grandsonsCount: val }),
              blockedReason: hasSons ? 'Waxaa xannibay Wiilka tooska ah' : null,
              nameKey: 'grandsons',
            })}
            {renderCountHeirRow({
              label: 'Gabadha wiilka',
              arabic: 'بنت الابن',
              count: heirsInput.granddaughtersCount,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, granddaughtersCount: val }),
              blockedReason: hasSons
                ? 'Waxaa xannibay Wiilka tooska ah'
                : hasTwoOrMoreDaughtersNoGrandson
                ? '2+ Gabdhood oo dhammaystiray 2/3 (iyadoon wiil-wiil jirin)'
                : null,
              nameKey: 'granddaughters',
            })}
          </div>
        </section>
      )}

      {/* STEP 4: WAALID (PARENTS) */}
      {shouldShowSection(4) && (
        <section
          id="step-parents"
          className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden"
        >
          <div className="bg-[#0B1220] border-b border-[#243449] px-4 sm:px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#F8FAFC]">4. Waalid (Aabbe &amp; Hooyo)</h2>
            <span className="text-xs font-arabic text-[#10B981]">الأبوان</span>
          </div>
          <div>
            {renderBooleanHeirRow({
              label: 'Aabbe',
              arabic: 'الأب',
              checked: heirsInput.fatherAlive,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, fatherAlive: val }),
              nameKey: 'father',
            })}
            {renderBooleanHeirRow({
              label: 'Hooyo',
              arabic: 'الأم',
              checked: heirsInput.motherAlive,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, motherAlive: val }),
              nameKey: 'mother',
            })}
          </div>
        </section>
      )}

      {/* STEP 5: AWOOWE & AYEEYO (GRANDPARENTS) */}
      {shouldShowSection(5) && (
        <section
          id="step-grandparents"
          className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden"
        >
          <div className="bg-[#0B1220] border-b border-[#243449] px-4 sm:px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#F8FAFC]">5. Awoowe &amp; Ayeeyo</h2>
            <span className="text-xs font-arabic text-[#10B981]">الأجداد والجدات</span>
          </div>
          <div>
            {renderBooleanHeirRow({
              label: 'Awoowe (Aabbaha Aabbihiis)',
              arabic: 'الجد الصحيح',
              checked: heirsInput.paternalGrandfatherAlive,
              onChange: (val) =>
                onUpdateHeirs({ ...heirsInput, paternalGrandfatherAlive: val }),
              blockedReason: fatherAlive ? 'Waxaa xannibay Aabbaha' : null,
              nameKey: 'paternalGrandfather',
            })}
            {renderBooleanHeirRow({
              label: 'Ayeeyo Aabbe (Hooyada Aabbaha)',
              arabic: 'الجدة لأب',
              checked: heirsInput.paternalGrandmotherAlive,
              onChange: (val) =>
                onUpdateHeirs({ ...heirsInput, paternalGrandmotherAlive: val }),
              blockedReason: motherAlive
                ? 'Waxaa xannibay Hooyada'
                : fatherAlive
                ? 'Waxaa xannibay Aabbaha'
                : null,
              nameKey: 'paternalGrandmother',
            })}
            {renderBooleanHeirRow({
              label: 'Ayeeyo Hooyo (Hooyada Hooyada)',
              arabic: 'الجدة لأم',
              checked: heirsInput.maternalGrandmotherAlive,
              onChange: (val) =>
                onUpdateHeirs({ ...heirsInput, maternalGrandmotherAlive: val }),
              blockedReason: motherAlive ? 'Waxaa xannibay Hooyada' : null,
              nameKey: 'maternalGrandmother',
            })}
          </div>
        </section>
      )}

      {/* STEP 6: WALAALO (SIBLINGS) */}
      {shouldShowSection(6) && (
        <section
          id="step-siblings"
          className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden"
        >
          <div className="bg-[#0B1220] border-b border-[#243449] px-4 sm:px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#F8FAFC]">
              6. Walaalo (Buuxa, Aabbe &amp; Hooyo)
            </h2>
            <span className="text-xs font-arabic text-[#10B981]">الإخوة والأخوات</span>
          </div>
          <div>
            {renderCountHeirRow({
              label: 'Walaalka buuxa (Hooyo & Aabbe)',
              arabic: 'الأخ الشقيق',
              count: heirsInput.fullBrothersCount,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, fullBrothersCount: val }),
              blockedReason: hasMaleDescendant
                ? 'Waxaa xannibay Wiilka / Wiilka wiilka'
                : fatherAlive
                ? 'Waxaa xannibay Aabbaha'
                : null,
              nameKey: 'fullBrothers',
            })}
            {renderCountHeirRow({
              label: 'Walaasha buuxda (Hooyo & Aabbe)',
              arabic: 'الأخت الشقيقة',
              count: heirsInput.fullSistersCount,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, fullSistersCount: val }),
              blockedReason: hasMaleDescendant
                ? 'Waxaa xannibay Wiilka / Wiilka wiilka'
                : fatherAlive
                ? 'Waxaa xannibay Aabbaha'
                : null,
              nameKey: 'fullSisters',
            })}
            {renderCountHeirRow({
              label: 'Walaalka isku aabbe',
              arabic: 'الأخ لأب',
              count: heirsInput.paternalBrothersCount,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, paternalBrothersCount: val }),
              blockedReason: hasMaleDescendant
                ? 'Waxaa xannibay Wiilka / Wiilka wiilka'
                : fatherAlive
                ? 'Waxaa xannibay Aabbaha'
                : fullBrothersExist
                ? 'Waxaa xannibay Walaalka buuxa'
                : fullSistersWithDescendantAsabah
                ? 'Walaasha buuxda oo Casabah la noqotay Gabadha'
                : null,
              nameKey: 'paternalBrothers',
            })}
            {renderCountHeirRow({
              label: 'Walaasha isku aabbe',
              arabic: 'الأخت لأب',
              count: heirsInput.paternalSistersCount,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, paternalSistersCount: val }),
              blockedReason: hasMaleDescendant
                ? 'Waxaa xannibay Wiilka / Wiilka wiilka'
                : fatherAlive
                ? 'Waxaa xannibay Aabbaha'
                : fullBrothersExist
                ? 'Waxaa xannibay Walaalka buuxa'
                : fullSistersWithDescendantAsabah
                ? 'Walaasha buuxda oo Casabah la noqotay Gabadha'
                : twoFullSistersNoPaternalBro
                ? '2+ Walaalo buuxa oo dhammaystiray 2/3'
                : null,
              nameKey: 'paternalSisters',
            })}
            {renderCountHeirRow({
              label: 'Walaalka isku hooyo',
              arabic: 'الأخ لأم',
              count: heirsInput.maternalBrothersCount,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, maternalBrothersCount: val }),
              blockedReason: hasAnyDescendant
                ? 'Waxaa xannibay Faraca (Carruurta)'
                : fatherAlive || grandfatherAlive
                ? 'Waxaa xannibay Aabbaha / Awoowaha'
                : null,
              nameKey: 'maternalBrothers',
            })}
            {renderCountHeirRow({
              label: 'Walaasha isku hooyo',
              arabic: 'الأخت لأم',
              count: heirsInput.maternalSistersCount,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, maternalSistersCount: val }),
              blockedReason: hasAnyDescendant
                ? 'Waxaa xannibay Faraca (Carruurta)'
                : fatherAlive || grandfatherAlive
                ? 'Waxaa xannibay Aabbaha / Awoowaha'
                : null,
              nameKey: 'maternalSisters',
            })}
          </div>
        </section>
      )}

      {/* STEP 7: QARAABO KALE */}
      {shouldShowSection(7) && (
        <section
          id="step-relatives"
          className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden"
        >
          <div className="bg-[#0B1220] border-b border-[#243449] px-4 sm:px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#F8FAFC]">
              7. Qaraabo Kale (Adeerro &amp; Ilma-Walaal)
            </h2>
            <span className="text-xs font-arabic text-[#10B981]">الحواشي</span>
          </div>
          <div>
            {renderCountHeirRow({
              label: 'Wiilka walaalka buuxa',
              arabic: 'ابن الأخ الشقيق',
              count: heirsInput.fullNephewsCount,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, fullNephewsCount: val }),
              blockedReason:
                hasMaleDescendant ||
                fatherAlive ||
                grandfatherAlive ||
                fullBrothersExist ||
                paternalBrothersExist
                  ? 'Waxaa xannibay dhaxale ka dhow (Wiil / Aabbe / Walaal)'
                  : null,
              nameKey: 'fullNephews',
            })}
            {renderCountHeirRow({
              label: 'Wiilka walaalka aabbe',
              arabic: 'ابن الأخ لأب',
              count: heirsInput.paternalNephewsCount,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, paternalNephewsCount: val }),
              blockedReason:
                hasMaleDescendant ||
                fatherAlive ||
                grandfatherAlive ||
                fullBrothersExist ||
                paternalBrothersExist ||
                fullNephewsExist
                  ? 'Waxaa xannibay dhaxale ka dhow'
                  : null,
              nameKey: 'paternalNephews',
            })}
            {renderCountHeirRow({
              label: 'Adeerka buuxa (Aabbaha walaalkiis)',
              arabic: 'العم الشقيق',
              count: heirsInput.fullPaternalUnclesCount,
              onChange: (val) =>
                onUpdateHeirs({ ...heirsInput, fullPaternalUnclesCount: val }),
              blockedReason:
                hasMaleDescendant ||
                fatherAlive ||
                grandfatherAlive ||
                fullBrothersExist ||
                paternalBrothersExist ||
                fullNephewsExist ||
                paternalNephewsExist
                  ? 'Waxaa xannibay dhaxale ka dhow'
                  : null,
              nameKey: 'fullPaternalUncles',
            })}
            {renderCountHeirRow({
              label: 'Adeerka isku aabbe',
              arabic: 'العم لأب',
              count: heirsInput.paternalPaternalUnclesCount,
              onChange: (val) =>
                onUpdateHeirs({ ...heirsInput, paternalPaternalUnclesCount: val }),
              blockedReason:
                hasMaleDescendant ||
                fatherAlive ||
                grandfatherAlive ||
                fullBrothersExist ||
                paternalBrothersExist ||
                fullNephewsExist ||
                paternalNephewsExist ||
                fullUnclesExist
                  ? 'Waxaa xannibay dhaxale ka dhow'
                  : null,
              nameKey: 'paternalPaternalUncles',
            })}
            {renderCountHeirRow({
              label: 'Wiilka adeerka buuxa (Ilma-adeer)',
              arabic: 'ابن العم الشقيق',
              count: heirsInput.fullCousinsCount,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, fullCousinsCount: val }),
              blockedReason:
                hasMaleDescendant ||
                fatherAlive ||
                grandfatherAlive ||
                fullBrothersExist ||
                paternalBrothersExist ||
                fullNephewsExist ||
                paternalNephewsExist ||
                fullUnclesExist ||
                paternalUnclesExist
                  ? 'Waxaa xannibay dhaxale ka dhow'
                  : null,
              nameKey: 'fullCousins',
            })}
            {renderCountHeirRow({
              label: 'Wiilka adeerka aabbe',
              arabic: 'ابن العم لأب',
              count: heirsInput.paternalCousinsCount,
              onChange: (val) => onUpdateHeirs({ ...heirsInput, paternalCousinsCount: val }),
              blockedReason:
                hasMaleDescendant ||
                fatherAlive ||
                grandfatherAlive ||
                fullBrothersExist ||
                paternalBrothersExist ||
                fullNephewsExist ||
                paternalNephewsExist ||
                fullUnclesExist ||
                paternalUnclesExist ||
                fullCousinsExist
                  ? 'Waxaa xannibay dhaxale ka dhow'
                  : null,
              nameKey: 'paternalCousins',
            })}
          </div>
        </section>
      )}
        </div>
      )}

      {/* SINGLE STICKY BOTTOM ACTION BAR (Eliminates Duplicate Next / Arag Natiijada — E13 & E14) */}
      <section
        id="step-actions"
        className="sticky bottom-16 lg:bottom-3 z-20 bg-[#0a1220]/95 backdrop-blur-md border border-[#223250] rounded-2xl p-3 sm:p-3.5 shadow-2xl flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex items-center gap-1.5 sm:gap-2">
          {wizardStep === 2 && (
            <button
              type="button"
              onClick={() => setWizardStep(1)}
              className="min-h-[48px] px-3 rounded-xl bg-[#111b2e] border border-[#223250] hover:border-[#a9b8d0] inline-flex items-center gap-1.5 text-xs font-bold text-[#e8eef7] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-[#a9b8d0]" />
              <span>Dib</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClearCase}
            className="min-h-[48px] px-3 rounded-xl bg-[#111b2e] border border-[#223250] hover:border-[#a9b8d0] inline-flex items-center gap-1.5 text-xs font-bold text-[#e8eef7] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#a9b8d0]" />
            <span>Nadiifi</span>
          </button>

          <button
            type="button"
            onClick={onSaveCaseRecord}
            className="min-h-[48px] px-3 rounded-xl bg-[#111b2e] border border-[#223250] hover:border-[#22c55e] text-[#22c55e] inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer"
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            <span>Keydi</span>
          </button>
        </div>

        {wizardStep === 1 ? (
          <button
            type="button"
            onClick={() => setWizardStep(2)}
            className="min-h-[48px] px-5 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-[#060d18] font-extrabold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Xiga: Dhaxlayaasha</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        ) : (
          <button
            type="button"
            disabled={enteredHeirsCount === 0}
            onClick={() => {
              if (enteredHeirsCount > 0) {
                onCalculateAndViewResults();
              }
            }}
            className="min-h-[48px] px-5 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] disabled:bg-[#223250] disabled:text-[#a9b8d0] text-[#060d18] font-extrabold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <span>Xiga: Natiijada</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        )}
      </section>
    </div>
  );
};
