import React, { useState } from 'react';
import {
  InheritanceCalculationResult,
  HeirsInput,
  EstateAssetItem,
  Currency,
  ComprehensiveHeirAssetAllocation,
  IndividualNamedHeirAllocation,
} from '../types/inheritance';
import { calculateComprehensiveEstateDistribution } from '../utils/estateAssetDistributionEngine';
import { updateHeirPersonName, getEditableGroupKeyForShareId } from '../utils/heirNameUtils';
import { getDistinctHeirColor } from '../utils/landSubdivisionEngine';
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
} from 'lucide-react';

interface ApkResultsAndNamesViewProps {
  assets: EstateAssetItem[];
  result: InheritanceCalculationResult;
  heirsInput: HeirsInput;
  currency: Currency;
  onUpdateHeirsInput: (updated: HeirsInput) => void;
  onBackToCalculator: () => void;
  onOpenAssetsModal: () => void;
  onSaveCaseRecord: () => void;
  onPrintCertificate: () => void;
  onExportExcel: () => void;
}

export const ApkResultsAndNamesView: React.FC<ApkResultsAndNamesViewProps> = ({
  assets,
  result,
  heirsInput,
  currency,
  onUpdateHeirsInput,
  onBackToCalculator,
  onOpenAssetsModal,
  onSaveCaseRecord,
  onPrintCertificate,
  onExportExcel,
}) => {
  const [assetFilter, setAssetFilter] = useState<'all' | 'land' | 'money' | 'livestock'>('all');

  const distribution = calculateComprehensiveEstateDistribution(assets, result, heirsInput, currency);

  // Guaranteed unique hex color for every individual heir (0 collisions)
  const individualColorByKey: Record<string, string> = {};
  const groupRepresentativeColorById: Record<string, string> = {};
  distribution.allIndividualHeirs.forEach((ind, idx) => {
    const key = `${ind.heirGroupId}::${ind.personIndex}`;
    const resolvedColor = getDistinctHeirColor(idx);
    individualColorByKey[key] = resolvedColor;
    if (!groupRepresentativeColorById[ind.heirGroupId]) {
      groupRepresentativeColorById[ind.heirGroupId] = resolvedColor;
    }
  });

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

  // Smart summary for group total when cash value is $0 (e.g., unvalued Plots or Livestock)
  const formatGroupPrimaryTotal = (h: ComprehensiveHeirAssetAllocation) => {
    if (hasCashValuation) {
      return formatMoney(h.totalEstimatedValueUSD);
    }
    const parts: string[] = [];
    if (distribution.totalLandPlots > 0) {
      parts.push(`${h.land.totalPlotsForGroup} Plot`);
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
    if (distribution.totalLandPlots > 0) {
      parts.push(ind.landDisplay);
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
                    distribution.totalLandPlots > 0 && (
                      <div className="bg-[#0B1220] rounded-xl px-3 py-2">
                        <span className="text-[11px] text-[#94A3B8] block">Dhul (Qofkiiba)</span>
                        <strong className="text-[#F8FAFC] font-bold block font-mono-numbers tabular-nums">
                          {h.land.displayPerPerson}
                        </strong>
                        {h.count > 1 && (
                          <span className="text-[11px] text-[#94A3B8] font-mono-numbers tabular-nums">
                            Kooxda ({h.count}): {h.land.totalPlotsForGroup} Plot
                          </span>
                        )}
                      </div>
                    )}

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
                        {distribution.totalLandPlots > 0 ? (
                          <div>
                            <span className="font-bold text-[#F8FAFC]">{h.land.displayPerPerson}</span>
                            {h.count > 1 && (
                              <span className="block text-[11px] text-[#94A3B8]">
                                Kooxda: {h.land.totalPlotsForGroup} Plot
                              </span>
                            )}
                            {h.land.sqMPerPerson && (
                              <span className="block text-[11px] text-[#94A3B8]">
                                ~{h.land.sqMPerPerson.toLocaleString()} m²
                              </span>
                            )}
                          </div>
                        ) : (
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

        {/* MOBILE VIEW (< md): INDIVIDUAL PERSON CARDS — NO HORIZONTAL SCROLLING */}
        <div className="md:hidden divide-y divide-[#243449]">
          {distribution.allIndividualHeirs.map((ind, idx) => {
            const heirColor =
              individualColorByKey[`${ind.heirGroupId}::${ind.personIndex}`] ||
              getDistinctHeirColor(idx);

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
                    {distribution.totalLandPlots > 0 && (
                      <span>
                        Dhul:{' '}
                        <strong className="text-[#F8FAFC]">{ind.landDisplay}</strong>
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
                          title={`Midabka dhaxlaha: ${heirColor}`}
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
                      {distribution.totalLandPlots > 0 ? ind.landDisplay : '—'}
                    </td>
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
