import React, { useState } from 'react';
import {
  InheritanceCalculationResult,
  HeirsInput,
  EstateAssetItem,
  Currency,
  ComprehensiveHeirAssetAllocation,
  IndividualNamedHeirAllocation,
} from '../types/inheritance';
import {
  FairLandAllocationResult,
  LandAllocationMode,
} from '../types/landSubdivision';
import { calculateComprehensiveEstateDistribution } from '../utils/estateAssetDistributionEngine';
import { updateHeirPersonName, getEditableGroupKeyForShareId } from '../utils/heirNameUtils';
import {
  LAND_ALLOCATION_MODE_METADATA,
  computeStandalonePlotModeAllocation,
  formatPlotQtyCompact,
  getDistinctHeirColor,
  summarizePlotIdsCompact,
} from '../utils/landSubdivisionEngine';
import {
  ArrowLeft,
  Check,
  Printer,
  Download,
  BookmarkCheck,
  CheckCircle2,
  ShieldAlert,
  BookOpen,
  UserCheck,
  Users,
  Grid,
  MapPin,
} from 'lucide-react';

interface ApkResultsAndNamesViewProps {
  assets: EstateAssetItem[];
  result: InheritanceCalculationResult;
  heirsInput: HeirsInput;
  currency: Currency;
  linkedLandAllocation?: FairLandAllocationResult | null;
  allocationMode?: LandAllocationMode;
  onChangeAllocationMode?: (mode: LandAllocationMode) => void;
  includeValidHalfPlots?: boolean;
  onToggleIncludeHalfPlots?: (include: boolean) => void;
  onUpdateHeirsInput: (updated: HeirsInput) => void;
  onBackToCalculator: () => void;
  onOpenAssetsModal: () => void;
  onOpenLandDesigner: () => void;
  onSaveCaseRecord: () => void;
  onPrintCertificate: () => void;
  onPrintInheritanceMapPdf?: () => void;
  onExportExcel: () => void;
}

export const ApkResultsAndNamesView: React.FC<ApkResultsAndNamesViewProps> = ({
  assets,
  result,
  heirsInput,
  currency,
  linkedLandAllocation,
  allocationMode: propAllocationMode,
  onChangeAllocationMode,
  includeValidHalfPlots = false,
  onToggleIncludeHalfPlots,
  onUpdateHeirsInput,
  onBackToCalculator,
  onOpenAssetsModal,
  onOpenLandDesigner,
  onSaveCaseRecord,
  onPrintCertificate,
  onPrintInheritanceMapPdf,
  onExportExcel,
}) => {
  const [assetFilter, setAssetFilter] = useState<'all' | 'land' | 'money' | 'livestock'>('all');

  const activeAllocationMode: LandAllocationMode =
    linkedLandAllocation?.allocationMode || propAllocationMode || 'exact_shared';

  const distribution = calculateComprehensiveEstateDistribution(assets, result, heirsInput, currency);

  // Compute standalone mode plot counts when GIS map is not linked
  const standalonePlotMode = computeStandalonePlotModeAllocation(
    distribution.totalLandPlots,
    distribution.allIndividualHeirs,
    activeAllocationMode,
    includeValidHalfPlots
  );

  // Guaranteed unique hex color for every individual heir (0 collisions)
  const individualColorByKey: Record<string, string> = {};
  const groupRepresentativeColorById: Record<string, string> = {};
  distribution.allIndividualHeirs.forEach((ind, idx) => {
    const key = `${ind.heirGroupId}::${ind.personIndex}`;
    const gisHeir = linkedLandAllocation?.heirAllocations.find(
      (h) => h.heirGroupId === ind.heirGroupId && h.personIndex === ind.personIndex
    );
    const resolvedColor = gisHeir?.colorHex || getDistinctHeirColor(idx);
    individualColorByKey[key] = resolvedColor;
    if (!groupRepresentativeColorById[ind.heirGroupId]) {
      groupRepresentativeColorById[ind.heirGroupId] = resolvedColor;
    }
  });

  const getIndividualLandDisplay = (ind: IndividualNamedHeirAllocation): string => {
    const gisHeir = linkedLandAllocation?.heirAllocations.find(
      (h) => h.heirGroupId === ind.heirGroupId && h.personIndex === ind.personIndex
    );
    if (gisHeir) {
      return `${formatPlotQtyCompact(gisHeir.effectiveTotalPlotsReceived)} Plot`;
    }
    if (activeAllocationMode === 'exact_shared') {
      return ind.landDisplay;
    }
    const k = `${ind.heirGroupId}::${ind.personIndex}`;
    const wholeCnt = standalonePlotMode.perHeirPlots[k] ?? 0;
    return `${wholeCnt} Plot oo buuxa`;
  };

  const getGroupLandSummary = (h: ComprehensiveHeirAssetAllocation): {
    perPersonLabel: string;
    groupTotalPlots: number;
  } => {
    if (linkedLandAllocation) {
      const members = linkedLandAllocation.heirAllocations.filter(
        (gh) => gh.heirGroupId === h.heirId
      );
      if (members.length > 0) {
        const sumPlots = +(
          members.reduce((s, m) => s + m.effectiveTotalPlotsReceived, 0)
        ).toFixed(2);
        const minP = Math.min(...members.map((m) => m.effectiveTotalPlotsReceived));
        const maxP = Math.max(...members.map((m) => m.effectiveTotalPlotsReceived));
        const perPersonLabel =
          Math.abs(maxP - minP) < 0.01
            ? `${formatPlotQtyCompact(minP)} Plot`
            : `${formatPlotQtyCompact(minP)}–${formatPlotQtyCompact(maxP)} Plot`;
        return { perPersonLabel, groupTotalPlots: sumPlots };
      }
    }
    if (activeAllocationMode !== 'exact_shared') {
      const vals = Array.from({ length: h.count }).map(
        (_, i) => standalonePlotMode.perHeirPlots[`${h.heirId}::${i}`] ?? 0
      );
      const sumPlots = vals.reduce((s, v) => s + v, 0);
      const minP = vals.length > 0 ? Math.min(...vals) : 0;
      const maxP = vals.length > 0 ? Math.max(...vals) : 0;
      const perPersonLabel =
        minP === maxP ? `${minP} Plot oo buuxa` : `${minP}–${maxP} Plot`;
      return { perPersonLabel, groupTotalPlots: sumPlots };
    }
    return {
      perPersonLabel: h.land.displayPerPerson,
      groupTotalPlots: h.land.totalPlotsForGroup,
    };
  };

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

  const hasCashValuation = result.netDistributableEstateUSD > 0;

  // Smart summary for group total when cash value is $0 (e.g., 100 unvalued Plots or Livestock)
  const formatGroupPrimaryTotal = (h: ComprehensiveHeirAssetAllocation) => {
    if (hasCashValuation) {
      return formatMoney(h.totalEstimatedValueUSD);
    }
    const parts: string[] = [];
    if (distribution.totalLandPlots > 0 || linkedLandAllocation) {
      const grpLand = getGroupLandSummary(h);
      parts.push(`${formatPlotQtyCompact(grpLand.groupTotalPlots)} Plot`);
    }
    if (distribution.totalLivestockHeads > 0) {
      parts.push(`${h.livestock.totalHeadsForGroup} Neef`);
    }
    return parts.length > 0 ? parts.join(' + ') : `${h.percentage.toFixed(2)}%`;
  };

  // Smart summary for single person total when cash value is $0
  const formatIndividualPrimaryTotal = (ind: IndividualNamedHeirAllocation) => {
    if (hasCashValuation) {
      return formatMoney(ind.totalEstimatedValueUSD);
    }
    const parts: string[] = [];
    if (distribution.totalLandPlots > 0 || linkedLandAllocation) {
      parts.push(getIndividualLandDisplay(ind));
    }
    if (distribution.totalLivestockHeads > 0) {
      parts.push(ind.livestockDisplay);
    }
    return parts.length > 0 ? parts.join(' + ') : `${ind.individualPercentage.toFixed(2)}%`;
  };

  const handleRenameIndividual = (shareId: string, personIndex: number, newName: string) => {
    const groupKey = getEditableGroupKeyForShareId(shareId);
    const updated = updateHeirPersonName(heirsInput, groupKey, personIndex, newName);
    onUpdateHeirsInput(updated);
  };

  const totalDeductions = result.totalFuneralUSD + result.totalDebtsUSD + result.totalWasiyyahUSD;
  const totalInheritingPeople = distribution.heirAllocations.reduce((s, h) => s + h.count, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-4 text-[#e8eef7]">
      {/* STEP 3 STEPPER: ✓ Hantida — ✓ Dhaxlayaasha — ③ Natiijada (E6) */}
      <div className="bg-[#111b2e] border border-[#223250] rounded-2xl px-4 py-3.5 no-print">
        <div className="flex items-center justify-between gap-2 max-w-md mx-auto">
          <button
            type="button"
            onClick={onBackToCalculator}
            className="flex items-center gap-2 cursor-pointer"
          >
            <span className="w-7 h-7 rounded-full bg-[#22c55e] text-[#060d18] text-xs font-extrabold flex items-center justify-center">
              <Check className="w-4 h-4 stroke-[3]" />
            </span>
            <span className="text-xs font-bold text-[#e8eef7]">Hantida</span>
          </button>

          <div className="flex-1 h-0.5 bg-[#22c55e] rounded-full mx-1" />

          <button
            type="button"
            onClick={onBackToCalculator}
            className="flex items-center gap-2 cursor-pointer"
          >
            <span className="w-7 h-7 rounded-full bg-[#22c55e] text-[#060d18] text-xs font-extrabold flex items-center justify-center">
              <Check className="w-4 h-4 stroke-[3]" />
            </span>
            <span className="text-xs font-bold text-[#e8eef7]">Dhaxlayaasha</span>
          </button>

          <div className="flex-1 h-0.5 bg-[#22c55e] rounded-full mx-1" />

          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-[#111b2e] border-2 border-[#22c55e] text-[#22c55e] text-xs font-extrabold flex items-center justify-center">
              3
            </span>
            <span className="text-xs font-extrabold text-[#22c55e]">Natiijada</span>
          </div>
        </div>
      </div>

      {/* TOP BAR: BACK TO CALCULATOR + SAVE / PRINT / JADWAL */}
      <div className="bg-[#111b2e] border border-[#223250] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToCalculator}
            className="min-h-[48px] inline-flex items-center gap-1.5 rounded-xl bg-[#0a1220] border border-[#223250] hover:border-[#22c55e] px-3.5 py-2 text-xs font-bold text-[#e8eef7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-[#22c55e]" />
            <span>Wax Ka Beddel</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-extrabold text-[#e8eef7] tracking-tight line-clamp-2">
              Natiijada Dhaxalka &amp; Qaybinta Hantida
            </h1>
            <p className="text-xs text-[#a9b8d0] truncate">
              Dhammaan dhaxlayaasha iyo qofkasta wuxuu helay (Dhul, Lacag, Xoolo &amp; Heerka)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onSaveCaseRecord}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#0a1220] border border-[#223250] hover:border-[#22c55e] text-[#e8eef7] px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookmarkCheck className="w-4 h-4 text-[#22c55e]" />
            <span>Keydi</span>
          </button>
          {onPrintInheritanceMapPdf && (
            <button
              type="button"
              onClick={onPrintInheritanceMapPdf}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#0a1220] border border-[#22c55e]/60 hover:border-[#22c55e] text-[#22c55e] px-3.5 py-2 text-xs font-extrabold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MapPin className="w-4 h-4" />
              <span>Khariidadda Dhaxalka PDF</span>
            </button>
          )}
          <button
            type="button"
            onClick={onPrintCertificate}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-[#060d18] px-4 py-2 text-xs font-extrabold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Shahaadada PDF</span>
          </button>
          <button
            type="button"
            onClick={onExportExcel}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#0a1220] border border-[#223250] hover:border-[#22c55e] text-[#e8eef7] px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#22c55e]" />
            <span>Jadwal (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* CARD 1: XOGTA DHAXALKA (CASE OVERVIEW) */}
      <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden">
        <div className="bg-[#0B1220] border-b border-[#243449] px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold text-[#F8FAFC]">01. Xogta Dhaxalka</h2>
          <span className="text-xs font-mono-numbers tabular-nums text-[#10B981] font-semibold">
            Asalka Mas&apos;alada: {result.aslAlMasalah}
            {result.isAwl ? ` → Cawl ${result.awlValue}` : ''}
            {result.tashihBase !== result.aslAlMasalah ? ` · Saxidda (Tashih): ${result.tashihBase}` : ''}
          </span>
        </div>

        <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-[#94A3B8] block">Qofka Dhintay</span>
            <strong className="text-sm text-[#F8FAFC] mt-0.5 block">
              {heirsInput.deceasedName || 'Marxuumka'}
            </strong>
            <span className="text-[11px] text-[#94A3B8]">
              {heirsInput.deceasedGender === 'male' ? 'Nin (Lab)' : 'Naag (Dheddig)'}
              {heirsInput.dateOfDeath ? ` · ${heirsInput.dateOfDeath}` : ''}
            </span>
          </div>

          <div>
            <span className="text-[#94A3B8] block">Wadarta Hantida Saafiga</span>
            <strong className="text-sm font-mono-numbers tabular-nums text-[#10B981] mt-0.5 block">
              {hasCashValuation
                ? formatMoney(result.netDistributableEstateUSD)
                : distribution.totalLandPlots > 0 || distribution.totalLivestockHeads > 0
                ? `${distribution.totalLandPlots > 0 ? `${distribution.totalLandPlots} Plot` : ''}${
                    distribution.totalLandPlots > 0 && distribution.totalLivestockHeads > 0 ? ' · ' : ''
                  }${distribution.totalLivestockHeads > 0 ? `${distribution.totalLivestockHeads} Neef` : ''}`
                : formatMoney(0)}
            </strong>
            {totalDeductions > 0 ? (
              <span className="text-[11px] text-rose-400 font-mono-numbers tabular-nums">
                Deyn/Aas laga jaray: -{formatMoney(totalDeductions)}
              </span>
            ) : !hasCashValuation && (distribution.totalLandPlots > 0 || distribution.totalLivestockHeads > 0) ? (
              <span className="text-[11px] text-[#94A3B8]">Hanti sidooda loo qaybinayo</span>
            ) : null}
          </div>

          <div>
            <span className="text-[#94A3B8] block">Qaybaha Hantida</span>
            <strong className="text-sm text-[#F8FAFC] mt-0.5 block font-mono-numbers tabular-nums">
              {distribution.totalLandPlots} Plot · {distribution.totalLivestockHeads} Neef
            </strong>
            <button
              type="button"
              onClick={onOpenAssetsModal}
              className="text-[11px] font-bold text-[#10B981] hover:underline mt-0.5 cursor-pointer"
            >
              + Wax ka beddel hantida
            </button>
          </div>

          <div>
            <span className="text-[#94A3B8] block">Dhaxlayaasha Dhaxlaya</span>
            <strong className="text-sm text-[#10B981] mt-0.5 block font-mono-numbers tabular-nums">
              {totalInheritingPeople} Qof ({distribution.heirAllocations.length} koox)
            </strong>
            <span className="text-[11px] text-[#94A3B8]">
              {result.isAwl
                ? 'Mas’alo Cawl ah'
                : result.isRadd
                ? 'Mas’alo Radd ah'
                : 'Mas’alo Caddilmi / Casabah ah'}
            </span>
          </div>
        </div>
      </section>

      {/* CARD 2: QAYBINTA KOOXAHA DHAXLAYAASHA (ALL INHERITING HEIR GROUPS) */}
      <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden">
        <div className="bg-[#0B1220] border-b border-[#243449] px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#10B981] shrink-0" />
            <h2 className="text-sm font-extrabold text-[#F8FAFC]">
              02. Qaybinta Saamiyada &amp; Hantida Dhaxlayaasha ({totalInheritingPeople} Qof)
            </h2>
          </div>

          <div className="flex items-center gap-1 bg-[#0F1B2D] border border-[#243449] rounded-xl p-1 self-start sm:self-auto">
            {(
              [
                { id: 'all', label: 'Dhammaan' },
                { id: 'land', label: 'Dhul' },
                { id: 'money', label: 'Lacag' },
                { id: 'livestock', label: 'Xoolo' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setAssetFilter(f.id)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  assetFilter === f.id
                    ? 'bg-[#10B981] text-[#030712]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Visual 100% Proportional Share Strip — Unique Color per Individual Heir */}
        {distribution.allIndividualHeirs.length > 0 && (
          <div className="px-5 py-3.5 bg-[#0B1220]/70 border-b border-[#243449]">
            <div className="h-3 w-full rounded-lg overflow-hidden flex bg-[#1E293B]">
              {distribution.allIndividualHeirs.map((ind, idx) => {
                const cHex =
                  individualColorByKey[`${ind.heirGroupId}::${ind.personIndex}`] ||
                  getDistinctHeirColor(idx);
                return (
                  <div
                    key={`${ind.heirGroupId}-${ind.personIndex}-${idx}`}
                    style={{
                      width: `${Math.max(ind.individualPercentage, 1.5)}%`,
                      backgroundColor: cHex,
                    }}
                    className="h-full border-r border-[#030712]/60 last:border-r-0"
                    title={`${ind.personName} (${ind.roleTitleSomali}): ${ind.individualPercentage.toFixed(2)}%`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 mt-2.5 text-xs text-[#94A3B8]">
              {distribution.allIndividualHeirs.map((ind, idx) => {
                const cHex =
                  individualColorByKey[`${ind.heirGroupId}::${ind.personIndex}`] ||
                  getDistinctHeirColor(idx);
                return (
                  <div
                    key={`sw-${ind.heirGroupId}-${ind.personIndex}-${idx}`}
                    className="inline-flex items-center gap-1.5"
                  >
                    <span
                      style={{ backgroundColor: cHex }}
                      className="w-2.5 h-2.5 rounded-xs shrink-0 border border-white/15"
                    />
                    <span className="font-bold text-[#F8FAFC]">
                      {ind.personName || ind.roleTitleSomali}
                    </span>
                    <span className="font-mono-numbers tabular-nums text-[11px] font-bold text-[#10B981]">
                      {ind.individualPercentage.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* MOBILE VIEW (< md): ZERO-OVERFLOW CARDS SHOWING EVERY GROUP & PER-PERSON SHARE */}
        <div className="md:hidden divide-y divide-[#243449]">
          {distribution.heirAllocations.map((h) => {
            const rawShareObj = result.heirShares.find((s) => s.id === h.heirId);
            const perPersonTashih =
              rawShareObj && h.count > 0 ? Math.round((rawShareObj.tashihShares / h.count) * 100) / 100 : null;

            return (
              <div key={h.heirId} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold text-[#F8FAFC]">
                      {h.nameSomali}
                      <span className="ml-1.5 text-xs font-arabic font-normal text-[#94A3B8]">
                        ({h.nameArabic})
                      </span>
                    </div>
                    <div className="text-[11px] text-[#94A3B8] mt-0.5 font-mono-numbers tabular-nums">
                      Tirada: <strong className="text-[#F8FAFC]">{h.count} qof</strong> · Saamiga:{' '}
                      <strong className="text-[#10B981]">{h.quranicFraction}</strong>
                      {rawShareObj && (
                        <>
                          {' '}
                          · Saamiyo: <strong className="text-[#F8FAFC]">{rawShareObj.tashihShares}</strong>
                          {h.count > 1 && perPersonTashih !== null ? ` (${perPersonTashih} qofkiiba)` : ''}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono-numbers tabular-nums font-extrabold text-[#10B981]">
                      {h.percentage.toFixed(2)}%
                    </div>
                    {h.count > 1 && (
                      <div className="text-[11px] font-mono-numbers tabular-nums text-[#94A3B8]">
                        {(h.percentage / h.count).toFixed(2)}% qofkiiba
                      </div>
                    )}
                  </div>
                </div>

                {/* Per-person & Group Asset Breakdown */}
                <div className="grid grid-cols-2 gap-2.5 pt-2.5 border-t border-[#243449]/70 text-xs">
                  {(assetFilter === 'all' || assetFilter === 'land') &&
                    (distribution.totalLandPlots > 0 || Boolean(linkedLandAllocation)) && (() => {
                      const grpLand = getGroupLandSummary(h);
                      return (
                        <div className="bg-[#0B1220] rounded-xl px-3 py-2">
                          <span className="text-[11px] text-[#94A3B8] block">Dhul (Qofkiiba)</span>
                          <strong className="text-[#F8FAFC] font-bold block font-mono-numbers tabular-nums">
                            {grpLand.perPersonLabel}
                          </strong>
                          {h.count > 1 && (
                            <span className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                              Kooxda ({h.count}): {formatPlotQtyCompact(grpLand.groupTotalPlots)} Plot
                            </span>
                          )}
                        </div>
                      );
                    })()}

                  {(assetFilter === 'all' || assetFilter === 'money') && distribution.totalMoneyUSD > 0 && (
                    <div className="bg-[#0B1220] rounded-xl px-3 py-2">
                      <span className="text-[11px] text-[#94A3B8] block">Lacag (Qofkiiba)</span>
                      <strong className="text-[#F8FAFC] font-mono-numbers tabular-nums font-bold block">
                        {formatMoney(h.money.moneyPerPersonUSD)}
                      </strong>
                      {h.count > 1 && (
                        <span className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                          Kooxda: {formatMoney(h.money.totalMoneyForGroupUSD)}
                        </span>
                      )}
                    </div>
                  )}

                  {(assetFilter === 'all' || assetFilter === 'livestock') && distribution.totalLivestockHeads > 0 && (
                    <div className="bg-[#0B1220] rounded-xl px-3 py-2">
                      <span className="text-[11px] text-[#94A3B8] block">Xoolo (Qofkiiba)</span>
                      <strong className="text-[#F8FAFC] font-bold block font-mono-numbers tabular-nums">
                        {h.livestock.displayPerPerson}
                      </strong>
                      {h.count > 1 && (
                        <span className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                          Kooxda: {h.livestock.totalHeadsForGroup} Neef
                        </span>
                      )}
                    </div>
                  )}

                  <div className="bg-[#10B981]/10 rounded-xl px-3 py-2">
                    <span className="text-[11px] text-[#94A3B8] block">Wadarta Kooxda</span>
                    <strong className="text-[#10B981] font-mono-numbers tabular-nums font-extrabold block">
                      {formatGroupPrimaryTotal(h)}
                    </strong>
                    {hasCashValuation && h.count > 1 && (
                      <span className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                        Qofkiiba: {formatMoney(h.perPersonEstimatedValueUSD)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* DESKTOP VIEW (md+): FULL TABULAR TABLE WITH FOOTER TOTAL */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#243449] bg-[#0B1220] text-[#94A3B8] font-bold">
                <th className="py-3 px-4">Nooca Dhaxalaha</th>
                <th className="py-3 px-2.5 text-center">Tiro</th>
                <th className="py-3 px-3 text-center">Saamiga</th>
                <th className="py-3 px-2.5 text-center">Saamiyo</th>
                {(assetFilter === 'all' || assetFilter === 'land') && (
                  <th className="py-3 px-3.5">Dhul (Qofkiiba)</th>
                )}
                {(assetFilter === 'all' || assetFilter === 'money') && (
                  <th className="py-3 px-3.5">Lacag (Qofkiiba)</th>
                )}
                {(assetFilter === 'all' || assetFilter === 'livestock') && (
                  <th className="py-3 px-3.5">Xoolo (Qofkiiba)</th>
                )}
                {assetFilter === 'all' && <th className="py-3 px-3.5">Heerka Hantida</th>}
                <th className="py-3 px-4 text-right">Wadarta Kooxda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#243449]/70">
              {distribution.heirAllocations.map((h) => {
                const rawShareObj = result.heirShares.find((s) => s.id === h.heirId);
                return (
                  <tr key={h.heirId} className="hover:bg-[#0B1220]/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-[#F8FAFC]">{h.nameSomali}</div>
                      <div className="text-[11px] font-arabic text-[#94A3B8]">{h.nameArabic}</div>
                    </td>
                    <td className="py-3.5 px-2.5 text-center font-mono-numbers tabular-nums font-bold text-[#F8FAFC]">
                      {h.count}
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      <span className="font-bold text-[#10B981] font-mono-numbers tabular-nums">
                        {h.quranicFraction}
                      </span>
                      <span className="block text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                        {h.percentage.toFixed(2)}%
                        {h.count > 1 ? ` (${(h.percentage / h.count).toFixed(2)}% qofkiiba)` : ''}
                      </span>
                    </td>
                    <td className="py-3.5 px-2.5 text-center font-mono-numbers tabular-nums text-[#F8FAFC]">
                      {rawShareObj ? (
                        <div>
                          <span className="font-bold">{rawShareObj.tashihShares}</span>
                          {h.count > 1 && (
                            <span className="block text-[10px] text-[#94A3B8]">
                              {Math.round((rawShareObj.tashihShares / h.count) * 100) / 100}/qof
                            </span>
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>

                    {(assetFilter === 'all' || assetFilter === 'land') && (
                      <td className="py-3.5 px-3.5 font-mono-numbers tabular-nums">
                        {distribution.totalLandPlots > 0 || linkedLandAllocation ? (() => {
                          const grpLand = getGroupLandSummary(h);
                          return (
                            <div>
                              <span className="font-bold text-[#F8FAFC]">{grpLand.perPersonLabel}</span>
                              {h.count > 1 && (
                                <span className="block text-[11px] text-[#94A3B8]">
                                  Kooxda: {formatPlotQtyCompact(grpLand.groupTotalPlots)} Plot
                                </span>
                              )}
                              {h.land.sqMPerPerson && activeAllocationMode === 'exact_shared' && (
                                <span className="block text-[11px] text-[#94A3B8]">
                                  ~{h.land.sqMPerPerson.toLocaleString()} m²
                                </span>
                              )}
                            </div>
                          );
                        })() : (
                          <span className="text-[#94A3B8]">—</span>
                        )}
                      </td>
                    )}

                    {(assetFilter === 'all' || assetFilter === 'money') && (
                      <td className="py-3.5 px-3.5 font-mono-numbers tabular-nums font-semibold text-[#F8FAFC]">
                        {distribution.totalMoneyUSD > 0
                          ? formatMoney(h.money.moneyPerPersonUSD)
                          : '—'}
                      </td>
                    )}

                    {(assetFilter === 'all' || assetFilter === 'livestock') && (
                      <td className="py-3.5 px-3.5 font-mono-numbers tabular-nums font-medium text-[#F8FAFC]">
                        {distribution.totalLivestockHeads > 0 ? h.livestock.displayPerPerson : '—'}
                      </td>
                    )}

                    {assetFilter === 'all' && (
                      <td className="py-3.5 px-3.5 text-[11px] text-[#94A3B8]">
                        {h.tierBreakdown.tier1Prime.descriptionSomali !== 'Qayb kuma laha heerkan' && (
                          <div>
                            <strong className="text-[#F8FAFC]">H1:</strong>{' '}
                            {h.tierBreakdown.tier1Prime.descriptionSomali}
                          </div>
                        )}
                        {h.tierBreakdown.tier2Standard.descriptionSomali !== 'Qayb kuma laha heerkan' && (
                          <div>
                            <strong className="text-[#F8FAFC]">H2:</strong>{' '}
                            {h.tierBreakdown.tier2Standard.descriptionSomali}
                          </div>
                        )}
                        {h.tierBreakdown.tier1Prime.descriptionSomali === 'Qayb kuma laha heerkan' &&
                          h.tierBreakdown.tier2Standard.descriptionSomali === 'Qayb kuma laha heerkan' && (
                            <span className="text-[#94A3B8]">Saami siman</span>
                          )}
                      </td>
                    )}

                    <td className="py-3.5 px-4 text-right font-mono-numbers tabular-nums">
                      <div className="font-extrabold text-[#10B981]">
                        {formatGroupPrimaryTotal(h)}
                      </div>
                      {hasCashValuation && h.count > 1 && (
                        <div className="text-[11px] text-[#94A3B8]">
                          Qofkiiba: {formatMoney(h.perPersonEstimatedValueUSD)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* 100% Total Verification Row */}
              {distribution.heirAllocations.length > 0 && (
                <tr className="bg-[#0B1220] border-t-2 border-[#243449] font-bold text-[#F8FAFC]">
                  <td className="py-3 px-4">Wadarta Guud (100%)</td>
                  <td className="py-3 px-2.5 text-center font-mono-numbers tabular-nums">
                    {totalInheritingPeople}
                  </td>
                  <td className="py-3 px-3 text-center text-[#10B981] font-mono-numbers tabular-nums">
                    100.00%
                  </td>
                  <td className="py-3 px-2.5 text-center font-mono-numbers tabular-nums">
                    {result.tashihBase}
                  </td>
                  {(assetFilter === 'all' || assetFilter === 'land') && (
                    <td className="py-3 px-3.5 font-mono-numbers tabular-nums">
                      {distribution.totalLandPlots > 0 ? `${distribution.totalLandPlots} Baloodh` : '—'}
                    </td>
                  )}
                  {(assetFilter === 'all' || assetFilter === 'money') && (
                    <td className="py-3 px-3.5 font-mono-numbers tabular-nums">
                      {distribution.totalMoneyUSD > 0 ? formatMoney(distribution.totalMoneyUSD) : '—'}
                    </td>
                  )}
                  {(assetFilter === 'all' || assetFilter === 'livestock') && (
                    <td className="py-3 px-3.5 font-mono-numbers tabular-nums">
                      {distribution.totalLivestockHeads > 0 ? `${distribution.totalLivestockHeads} Neef` : '—'}
                    </td>
                  )}
                  {assetFilter === 'all' && <td className="py-3 px-3.5 text-[11px] text-[#94A3B8]">Kaamil</td>}
                  <td className="py-3 px-4 text-right font-mono-numbers tabular-nums text-[#10B981]">
                    {hasCashValuation
                      ? formatMoney(result.netDistributableEstateUSD)
                      : distribution.totalLandPlots > 0
                      ? `${distribution.totalLandPlots} Baloodh`
                      : distribution.totalLivestockHeads > 0
                      ? `${distribution.totalLivestockHeads} Neef`
                      : '100%'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* CARD 3: QOFKASTA MAGACIISA & WAXA UU HELAY */}
      <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden">
        <div className="bg-[#0B1220] border-b border-[#243449] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-[#F8FAFC] flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#10B981] shrink-0" />
              <span>
                03. Qofkasta Waxa Uu Helay &amp; Magaciisa ({distribution.allIndividualHeirs.length} Qof)
              </span>
            </h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Halkan ka arag dhaxale kasta gaarkiisa wuxuu u helay — kuna qor magaciisa buuxa si uu ugu soo baxo Shahaadada &amp; Excel-ka
            </p>
          </div>
          <span className="text-xs font-mono-numbers tabular-nums font-bold text-[#10B981] shrink-0">
            Wadarta: {distribution.allIndividualHeirs.length} Qof
          </span>
        </div>

        {/* 3-Mode Land Allocation Switcher & Withheld Half/Jajab Summary */}
        {(Boolean(linkedLandAllocation) || distribution.totalLandPlots > 0) && (
          <div className="px-5 py-3.5 bg-[#0B1220]/85 border-b border-[#243449] space-y-2.5 text-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
              <span className="font-extrabold text-[#F8FAFC]">
                Habka Qaybinta Plots-ka Dhaxalka:
              </span>
              {onChangeAllocationMode && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {(
                    [
                      'exact_shared',
                      'whole_balanced',
                      'clean_equal_no_half_no_fraction',
                    ] as LandAllocationMode[]
                  ).map((modeId) => {
                    const meta = LAND_ALLOCATION_MODE_METADATA[modeId];
                    const active = activeAllocationMode === modeId;
                    return (
                      <button
                        key={modeId}
                        type="button"
                        onClick={() => onChangeAllocationMode(modeId)}
                        className={`min-h-[36px] rounded-xl border px-3 py-1.5 text-[11px] font-bold flex items-center justify-between gap-1.5 transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                            : 'bg-[#0F1B2D] text-[#CBD5E1] border-[#243449] hover:border-[#10B981]/60'
                        }`}
                      >
                        <span className="truncate">{meta.shortSomali}</span>
                        {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {onToggleIncludeHalfPlots && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-[#243449]/60">
                <span className="text-[11px] font-bold text-[#CBD5E1]">
                  Half-Plots (0.5 Plot):{' '}
                  <span className="font-normal text-[#94A3B8]">
                    {includeValidHalfPlots
                      ? 'Waa lagu daray dhaxalka (0.5 plot = 1 half-plot)'
                      : 'Waa laga reebay qaybinta dhaxalka'}
                  </span>
                </span>
                <div className="inline-flex items-center gap-1 p-0.5 rounded-xl bg-[#0F1B2D] border border-[#243449]">
                  <button
                    type="button"
                    onClick={() => onToggleIncludeHalfPlots(true)}
                    className={`min-h-[32px] px-3 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      includeValidHalfPlots
                        ? 'bg-[#10B981] text-[#030712]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Ku Dar Dhaxalka
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleIncludeHalfPlots(false)}
                    className={`min-h-[32px] px-3 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      !includeValidHalfPlots
                        ? 'bg-[#1E293B] text-[#F8FAFC]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Ka Reeb Dhaxalka
                  </button>
                </div>
              </div>
            )}

            <p className="text-[11px] text-[#94A3B8] leading-relaxed">
              {LAND_ALLOCATION_MODE_METADATA[activeAllocationMode].descriptionSomali}
            </p>

            {/* Mode-Specific Summary Counters for Withheld Half-Plots & Jajab */}
            {!linkedLandAllocation && activeAllocationMode !== 'exact_shared' && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono-numbers tabular-nums text-[#CBD5E1]">
                <span>
                  Plots La Qaybiyey:{' '}
                  <strong className="text-[#10B981]">{standalonePlotMode.allocatedWholePlots} Plot</strong>
                </span>
                <span>
                  Plots Wadaag ah: <strong className="text-[#F8FAFC]">0 Plot</strong>
                </span>
                {standalonePlotMode.withheldJajabPlotsCount > 0 && (
                  <span>
                    Jajabka Laga Reebay:{' '}
                    <strong className="text-amber-300">
                      {standalonePlotMode.withheldJajabPlotsCount} Plot
                    </strong>
                  </span>
                )}
                {standalonePlotMode.withheldHalfPlotsUnits > 0 && (
                  <span>
                    Half-Plots Laga Reebay:{' '}
                    <strong className="text-slate-300">
                      {standalonePlotMode.withheldHalfPlotsUnits} Plot
                    </strong>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Approval, Spatial Fairness & Excluded Land Banner when GIS Land Allocation is Linked */}
        {linkedLandAllocation && (() => {
          const exclBlocks = linkedLandAllocation.excludedBlocks ?? [];
          const exclPlots = linkedLandAllocation.excludedPlots ?? [];
          const exclPlotsCount = linkedLandAllocation.excludedPlotsCount ?? exclPlots.length;
          const allocCount =
            linkedLandAllocation.allocatedFullPlotsCount ?? linkedLandAllocation.totalFullPlots;
          const jajabWithheld = linkedLandAllocation.withheldJajabPlotsCount ?? 0;
          const halfWithheld = linkedLandAllocation.withheldHalfPlotsCount ?? 0;
          const halfIncluded = linkedLandAllocation.validHalfPlotsIncludedCount ?? 0;
          return (
            <div className="px-5 py-3.5 bg-[#0B1220]/70 border-b border-[#243449] space-y-2 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-[#94A3B8] leading-relaxed">
                  <strong className="text-[#10B981]">
                    {linkedLandAllocation.approvalStatus === 'approved'
                      ? 'Qoondayn La Ansixiyey'
                      : 'Soo-jeedin Talo ah (Weli Lama Ansixin)'}
                  </strong>
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono-numbers tabular-nums font-semibold text-[#F8FAFC]">
                    {allocCount} / {linkedLandAllocation.totalFullPlots} Plot Buuxa
                  </span>
                  {halfIncluded > 0 && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono-numbers tabular-nums font-bold text-[#10B981]">
                        +{halfIncluded} Half-Plot Lagu Daray ({(halfIncluded * 0.5).toFixed(1)} Plot)
                      </span>
                    </>
                  )}
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono-numbers tabular-nums font-semibold text-[#F8FAFC]">
                    {linkedLandAllocation.sharedPlots.length} Plot Wadaag ah
                  </span>
                  {jajabWithheld > 0 && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono-numbers tabular-nums font-bold text-amber-300">
                        {jajabWithheld} Plot Jajab Laga Reebay
                      </span>
                    </>
                  )}
                  {halfWithheld > 0 && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono-numbers tabular-nums font-semibold text-slate-300">
                        {halfWithheld} Half-Plot Laga Reebay
                      </span>
                    </>
                  )}
                  {exclPlotsCount > 0 && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono-numbers tabular-nums font-bold text-rose-400">
                        {exclPlotsCount} Plot Danguud Laga Reebay
                      </span>
                    </>
                  )}
                  <span aria-hidden="true"> · </span>
                  <span>
                    {linkedLandAllocation.zones.length} Zone (
                    {linkedLandAllocation.zones.map((z) => z.zoneId).join(', ')})
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span
                    className={
                      linkedLandAllocation.hasZeroAdjacentBlockViolations
                        ? 'text-emerald-300 font-semibold'
                        : 'text-amber-400 font-semibold'
                    }
                  >
                    {linkedLandAllocation.hasZeroAdjacentBlockViolations
                      ? '0 Laba Block oo Is-xiga (Blocks kala fog)'
                      : 'Dib-u-eeg Blocks is-xiga'}
                  </span>
                </div>
                {linkedLandAllocation.approvedBy && linkedLandAllocation.approvalStatus === 'approved' && (
                  <div className="text-[11px] text-[#94A3B8] shrink-0">
                    Ansixiyey: <strong className="text-[#F8FAFC]">{linkedLandAllocation.approvedBy}</strong>
                  </div>
                )}
              </div>

              {(exclBlocks.length > 0 || exclPlots.length > 0) && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-950/35 px-3.5 py-2 text-[11px] text-rose-200 leading-relaxed">
                  <strong className="font-bold text-rose-300">
                    Laga Reebay Qaybinta Dhaxalka (Magacyo Gaar ah):{' '}
                  </strong>
                  {[
                    ...exclBlocks.map(
                      (eb) => `Block ${eb.blockId}: ${eb.specialName} (${eb.plotsCount} Plot)`
                    ),
                    ...exclPlots
                      .filter((ep) => ep.excludedScope === 'plot')
                      .map((ep) => `${ep.plotId}: ${ep.specialName}`),
                  ].join(' · ')}
                </div>
              )}
            </div>
          );
        })()}

        {/* MOBILE VIEW (< md): INDIVIDUAL PERSON CARDS — NO HORIZONTAL SCROLLING */}
        <div className="md:hidden divide-y divide-[#243449]">
          {distribution.allIndividualHeirs.map((ind, idx) => {
            const heirColor =
              individualColorByKey[`${ind.heirGroupId}::${ind.personIndex}`] ||
              getDistinctHeirColor(idx);
            const gisHeir = linkedLandAllocation?.heirAllocations.find(
              (h) => h.heirGroupId === ind.heirGroupId && h.personIndex === ind.personIndex
            );
            const activeZones = gisHeir
              ? Object.values(gisHeir.byZone).filter((zb) => zb.totalZonePlots > 0)
              : [];
            const encumberedWadiPlots = gisHeir
              ? +(gisHeir.wadiBreakdown.cuts_through + gisHeir.wadiBreakdown.partial).toFixed(2)
              : 0;

            return (
              <div key={`${ind.heirGroupId}-${ind.personIndex}-${idx}`} className="p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      style={{ backgroundColor: heirColor }}
                      className="w-6 h-6 rounded-lg text-white font-mono-numbers tabular-nums text-xs font-extrabold flex items-center justify-center shrink-0 shadow-xs"
                      title={`Midabka gaarka ah: ${heirColor}`}
                    >
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-[#F8FAFC] truncate">
                      {ind.roleTitleSomali}{' '}
                      <span className="font-arabic font-normal text-[#94A3B8]">({ind.roleTitleArabic})</span>
                    </span>
                  </div>
                  <span className="text-xs font-mono-numbers tabular-nums font-extrabold text-[#10B981] shrink-0">
                    {ind.individualPercentage.toFixed(2)}%
                  </span>
                </div>

                <input
                  type="text"
                  value={ind.personName}
                  onChange={(e) =>
                    handleRenameIndividual(ind.heirGroupId, ind.personIndex, e.target.value)
                  }
                  placeholder={`Qor magaca (${ind.roleTitleSomali})...`}
                  className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3.5 py-2 text-xs font-bold text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none transition-colors"
                />

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#94A3B8] font-mono-numbers tabular-nums">
                    {(distribution.totalLandPlots > 0 || linkedLandAllocation) && (
                      <span>
                        Dhul:{' '}
                        <strong className="text-[#F8FAFC]">
                          {getIndividualLandDisplay(ind)}
                        </strong>
                      </span>
                    )}
                    {distribution.totalMoneyUSD > 0 && (
                      <span>
                        Lacag: <strong className="text-[#F8FAFC]">{formatMoney(ind.moneyAmountUSD)}</strong>
                      </span>
                    )}
                    {distribution.totalLivestockHeads > 0 && (
                      <span>
                        Xoolo: <strong className="text-[#F8FAFC]">{ind.livestockDisplay}</strong>
                      </span>
                    )}
                  </div>
                  <div className="font-mono-numbers tabular-nums font-extrabold text-[#10B981]">
                    {formatIndividualPrimaryTotal(ind)}
                  </div>
                </div>

                {gisHeir && (
                  <div className="rounded-xl bg-[#0B1220] border border-[#243449] px-3 py-2.5 text-[11px] space-y-1">
                    <div className="font-bold text-[#10B981] font-mono-numbers tabular-nums">
                      Blocks: {gisHeir.assignedBlockIds.join(', ') || '—'} · {gisHeir.totalAreaSqM.toLocaleString()} m² (GIS)
                      {gisHeir.verifiedAreaTotalSqM !== null
                        ? ` · Xaqiijiyey: ${gisHeir.verifiedAreaTotalSqM.toLocaleString()} m²`
                        : ''}
                    </div>
                    <div className={gisHeir.adjacentBlockPairs.length === 0 ? 'text-emerald-300 font-semibold' : 'text-amber-400 font-semibold'}>
                      {gisHeir.adjacentBlockPairs.length === 0
                        ? 'Blocks kala fog (Lama siin laba block oo is-xiga)'
                        : `Digniin: Blocks is-xiga (${gisHeir.adjacentBlockPairs.map(([a, b]) => `${a}&${b}`).join(', ')})`}
                    </div>
                    {activeZones.length > 0 && (
                      <div className="text-[#94A3B8] font-mono-numbers tabular-nums">
                        <strong className="text-[#F8FAFC]">Zones:</strong>{' '}
                        {activeZones
                          .map(
                            (zb) =>
                              `${zb.zoneId}: ${formatPlotQtyCompact(zb.effectivePlotsInZone)} Plot (${zb.zonePercentageReceived.toFixed(1)}%)`
                          )
                          .join(' · ')}
                      </div>
                    )}
                    {gisHeir.byTier.tier_1_prime.totalTierPlots > 0 && (
                      <div className="text-[#94A3B8] font-mono-numbers tabular-nums">
                        <strong className="text-[#F8FAFC]">H1 (Fiican):</strong>{' '}
                        {formatPlotQtyCompact(gisHeir.byTier.tier_1_prime.effectiveTotalPlots)} Plot —{' '}
                        {summarizePlotIdsCompact(gisHeir.byTier.tier_1_prime.assignedWholePlotIds, 3)}
                      </div>
                    )}
                    {gisHeir.byTier.tier_2_standard.totalTierPlots > 0 && (
                      <div className="text-[#94A3B8] font-mono-numbers tabular-nums">
                        <strong className="text-[#F8FAFC]">H2 (Dhexe):</strong>{' '}
                        {formatPlotQtyCompact(gisHeir.byTier.tier_2_standard.effectiveTotalPlots)} Plot —{' '}
                        {summarizePlotIdsCompact(gisHeir.byTier.tier_2_standard.assignedWholePlotIds, 3)}
                      </div>
                    )}
                    {gisHeir.byTier.tier_3_basic.totalTierPlots > 0 && (
                      <div className="text-[#94A3B8] font-mono-numbers tabular-nums">
                        <strong className="text-[#F8FAFC]">H3 (Hoose):</strong>{' '}
                        {formatPlotQtyCompact(gisHeir.byTier.tier_3_basic.effectiveTotalPlots)} Plot —{' '}
                        {summarizePlotIdsCompact(gisHeir.byTier.tier_3_basic.assignedWholePlotIds, 3)}
                      </div>
                    )}
                    {(encumberedWadiPlots > 0 || gisHeir.verifiedValueTotalUSD !== null) && (
                      <div className="text-[#94A3B8] font-mono-numbers tabular-nums pt-1 border-t border-[#243449]">
                        {encumberedWadiPlots > 0 && <span>Doox mara: {encumberedWadiPlots} Plot</span>}
                        {encumberedWadiPlots > 0 && gisHeir.verifiedValueTotalUSD !== null && <span> · </span>}
                        {gisHeir.verifiedValueTotalUSD !== null && (
                          <span>Qiime Xaqiijiyey: {formatMoney(gisHeir.verifiedValueTotalUSD)}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* DESKTOP VIEW (md+): CLEAN INDIVIDUAL HEIRS TABLE */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#243449] bg-[#0B1220] text-[#94A3B8] font-bold">
                <th className="py-3 px-3 text-center w-10">#</th>
                <th className="py-3 px-4 min-w-[210px]">Magaca Qofka Dhaxlaya (Qor Magaca)</th>
                <th className="py-3 px-3">Xiriirka</th>
                <th className="py-3 px-3 text-center">Saamiga (%)</th>
                <th className="py-3 px-3">Dhul (Plots)</th>
                {linkedLandAllocation && (
                  <th className="py-3 px-3 min-w-[290px]">Zones (A–D) · Blocks · Plot IDs (H1–H3)</th>
                )}
                <th className="py-3 px-3">Lacag</th>
                <th className="py-3 px-3">Xoolo</th>
                <th className="py-3 px-4 text-right">Waxa Uu Helay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#243449]/70">
              {distribution.allIndividualHeirs.map((ind, idx) => {
                const heirColor =
                  individualColorByKey[`${ind.heirGroupId}::${ind.personIndex}`] ||
                  getDistinctHeirColor(idx);
                const gisHeir = linkedLandAllocation?.heirAllocations.find(
                  (h) => h.heirGroupId === ind.heirGroupId && h.personIndex === ind.personIndex
                );
                const activeZones = gisHeir
                  ? Object.values(gisHeir.byZone).filter((zb) => zb.totalZonePlots > 0)
                  : [];

                return (
                  <tr
                    key={`${ind.heirGroupId}-${ind.personIndex}-${idx}`}
                    className="hover:bg-[#0B1220]/60 transition-colors"
                  >
                    <td className="py-3 px-3 text-center">
                      <span
                        style={{ backgroundColor: heirColor }}
                        className="inline-flex w-6 h-6 rounded-lg text-white font-mono-numbers tabular-nums text-[11px] font-extrabold items-center justify-center shadow-xs"
                        title={`Midabka gaarka ah: ${heirColor}`}
                      >
                        {idx + 1}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          style={{ backgroundColor: heirColor }}
                          className="w-3 h-3 rounded-xs shrink-0 border border-white/20"
                          title={`Midabka khariidadda: ${heirColor}`}
                        />
                        <input
                          type="text"
                          value={ind.personName}
                          onChange={(e) =>
                            handleRenameIndividual(ind.heirGroupId, ind.personIndex, e.target.value)
                          }
                          placeholder={`Magaca (${ind.roleTitleSomali})...`}
                          className="w-full min-h-[40px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-1.5 text-xs font-bold text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none transition-colors"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-[#F8FAFC] block">{ind.roleTitleSomali}</span>
                      <span className="text-[11px] font-arabic text-[#94A3B8]">{ind.roleTitleArabic}</span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono-numbers tabular-nums font-bold text-[#10B981]">
                      {ind.individualPercentage.toFixed(2)}%
                    </td>
                    <td className="py-3 px-3 font-mono-numbers tabular-nums text-[#F8FAFC] font-semibold">
                      {distribution.totalLandPlots > 0 || linkedLandAllocation
                        ? getIndividualLandDisplay(ind)
                        : '—'}
                    </td>
                    {linkedLandAllocation && (
                      <td className="py-3 px-3 text-[11px] font-mono-numbers tabular-nums space-y-0.5">
                        {gisHeir ? (
                          <>
                            <div className="font-bold text-[#10B981]">
                              Blocks: {gisHeir.assignedBlockIds.join(', ') || '—'}
                              <span className="text-[#94A3B8] font-normal"> · </span>
                              <span
                                className={
                                  gisHeir.adjacentBlockPairs.length === 0
                                    ? 'text-emerald-300 font-semibold'
                                    : 'text-amber-400 font-semibold'
                                }
                              >
                                {gisHeir.adjacentBlockPairs.length === 0
                                  ? 'Kala fog'
                                  : `Is-xiga (${gisHeir.adjacentBlockPairs.map(([a, b]) => `${a}&${b}`).join(',')})`}
                              </span>
                            </div>
                            {activeZones.length > 0 && (
                              <div className="text-[#94A3B8]">
                                <strong className="text-[#F8FAFC]">Zones:</strong>{' '}
                                {activeZones
                                  .map(
                                    (zb) =>
                                      `${zb.zoneId}: ${formatPlotQtyCompact(zb.effectivePlotsInZone)} (${zb.zonePercentageReceived.toFixed(1)}%)`
                                  )
                                  .join(' · ')}
                              </div>
                            )}
                            {gisHeir.byTier.tier_1_prime.totalTierPlots > 0 && (
                              <div className="text-[#94A3B8]">
                                <strong className="text-[#F8FAFC]">H1:</strong>{' '}
                                {summarizePlotIdsCompact(
                                  gisHeir.byTier.tier_1_prime.assignedWholePlotIds,
                                  3
                                )}
                                {gisHeir.byTier.tier_1_prime.sharedPlotSlices.map((s) => (
                                  <span key={s.plotId} className="text-amber-300">
                                    {' '}
                                    +{s.plotId}({s.percentageOfPlot}%)
                                  </span>
                                ))}
                              </div>
                            )}
                            {gisHeir.byTier.tier_2_standard.totalTierPlots > 0 && (
                              <div className="text-[#94A3B8]">
                                <strong className="text-[#F8FAFC]">H2:</strong>{' '}
                                {summarizePlotIdsCompact(
                                  gisHeir.byTier.tier_2_standard.assignedWholePlotIds,
                                  3
                                )}
                                {gisHeir.byTier.tier_2_standard.sharedPlotSlices.map((s) => (
                                  <span key={s.plotId} className="text-amber-300">
                                    {' '}
                                    +{s.plotId}({s.percentageOfPlot}%)
                                  </span>
                                ))}
                              </div>
                            )}
                            {gisHeir.byTier.tier_3_basic.totalTierPlots > 0 && (
                              <div className="text-[#94A3B8]">
                                <strong className="text-[#F8FAFC]">H3:</strong>{' '}
                                {summarizePlotIdsCompact(
                                  gisHeir.byTier.tier_3_basic.assignedWholePlotIds,
                                  3
                                )}
                                {gisHeir.byTier.tier_3_basic.sharedPlotSlices.map((s) => (
                                  <span key={s.plotId} className="text-amber-300">
                                    {' '}
                                    +{s.plotId}({s.percentageOfPlot}%)
                                  </span>
                                ))}
                              </div>
                            )}
                            {gisHeir.verifiedValueTotalUSD !== null && (
                              <div className="text-emerald-300">
                                Qiime Xaqiijiyey: {formatMoney(gisHeir.verifiedValueTotalUSD)}
                              </div>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    <td className="py-3 px-3 font-mono-numbers tabular-nums font-semibold text-[#F8FAFC]">
                      {distribution.totalMoneyUSD > 0 ? formatMoney(ind.moneyAmountUSD) : '—'}
                    </td>
                    <td className="py-3 px-3 font-mono-numbers tabular-nums text-[#F8FAFC] font-medium">
                      {distribution.totalLivestockHeads > 0 ? ind.livestockDisplay : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-numbers tabular-nums font-extrabold text-[#10B981]">
                      {formatIndividualPrimaryTotal(ind)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Quick Link Footer to GIS Map Designer */}
        <div className="px-5 py-3.5 bg-[#0B1220] border-t border-[#243449] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 text-[#94A3B8]">
            <MapPin className="w-4 h-4 text-[#10B981] shrink-0" />
            <span>
              {linkedLandAllocation
                ? `Khariidadda Beerta waa ku xidhan tahay (${linkedLandAllocation.totalFullPlots} Plot · ${linkedLandAllocation.zones.length} Zone · H1/H2/H3 si cadaalad ah loogu firdhiyey).`
                : 'Ma doonaysaa inaad xuduudka beerta u qaybiso Blocks & Plots oo dhaxale kasta khariidad loogu calaamadiyo?'}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenLandDesigner}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-4 py-2 text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Grid className="w-3.5 h-3.5" />
            <span>
              {linkedLandAllocation
                ? 'Ku Arag Khariidadda Blocks & Plots'
                : 'Fur Naqshadeeyaha Blocks & Plots'}
            </span>
          </button>
        </div>
      </section>

      {/* CARD 4: DHAXLAYAASHA LAGA XANNIBAY DHAXALKA (AL-XAJB) */}
      <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden">
        <div className="bg-[#0B1220] border-b border-[#243449] px-5 py-3.5 flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2 min-w-0">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>04. Dhaxlayaasha Laga Xannibay Dhaxalka (Al-Xajb)</span>
          </h2>
          <span className="text-xs font-semibold text-[#94A3B8] font-mono-numbers tabular-nums shrink-0 whitespace-nowrap">
            {result.blockedHeirs.length} Kooxood
          </span>
        </div>

        {result.blockedHeirs.length === 0 ? (
          <div className="p-5 text-xs text-[#94A3B8] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
            <span>Ma jiraan dhaxlayaal la doortay oo dhaxalka laga xannibay kiiskan.</span>
          </div>
        ) : (
          <div className="divide-y divide-[#243449]/70">
            {result.blockedHeirs.map((bh, i) => (
              <div
                key={i}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <div className="text-xs sm:text-sm font-bold text-[#F8FAFC]">
                    {bh.nameSomali}{' '}
                    <span className="text-xs font-arabic text-[#94A3B8] font-normal">
                      ({bh.nameArabic})
                    </span>
                  </div>
                  <p className="text-xs text-[#94A3B8] mt-0.5">{bh.rule}</p>
                </div>
                <div className="text-xs font-semibold text-amber-300 shrink-0">
                  Waxaa xannibay: <strong className="text-[#F8FAFC]">{bh.blockedBy}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CARD 5: FAAHFAAHIN SAAMIYADA & DALIILKA SHARCIGA */}
      <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden">
        <div className="bg-[#0B1220] border-b border-[#243449] px-5 py-3.5 flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#10B981] shrink-0" />
            <span>05. Faahfaahin Saamiyada &amp; Daliilka Sharciga</span>
          </h2>
        </div>

        <div className="p-5 space-y-3">
          {result.explanationSomali.map((exp, idx) => (
            <div
              key={idx}
              className="rounded-xl bg-amber-950/30 border border-amber-500/30 px-4 py-2.5 text-xs text-amber-200 font-medium leading-relaxed"
            >
              {exp}
            </div>
          ))}

          <div className="divide-y divide-[#243449]/70">
            {result.heirShares.map((s) => (
              <div key={s.id} className="py-3 first:pt-1 last:pb-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-bold text-[#F8FAFC]">
                    {s.nameSomali} —{' '}
                    <span className="text-[#10B981] font-mono-numbers tabular-nums">
                      {s.quranicFraction}
                    </span>
                  </span>
                  <span className="text-xs font-mono-numbers tabular-nums font-bold text-[#10B981] shrink-0">
                    {s.percentage.toFixed(2)}%
                  </span>
                </div>
                <p className="text-xs text-[#F8FAFC]/90 leading-relaxed">{s.notesSomali}</p>
                <p className="text-[11px] text-[#94A3B8] leading-relaxed">{s.quranicProof}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
