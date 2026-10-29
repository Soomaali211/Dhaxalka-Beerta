import React, { useState } from 'react';
import {
  InheritanceCalculationResult,
  HeirsInput,
  EstateAssetItem,
  Currency,
  SavedInheritanceCase,
} from '../types/inheritance';
import { FairLandAllocationResult } from '../types/landSubdivision';
import { calculateComprehensiveEstateDistribution } from '../utils/estateAssetDistributionEngine';
import { updateHeirPersonName, getEditableGroupKeyForShareId } from '../utils/heirNameUtils';
import { PWAInstallButton } from './PWAInstallButton';
import {
  Calculator,
  Printer,
  Download,
  FolderOpen,
  BookOpen,
  Plus,
  Search,
  ArrowRight,
  MapPin,
  Coins,
  Scale,
  Users,
  Sparkles,
  Map,
  RotateCcw,
} from 'lucide-react';

interface DashboardViewProps {
  assets: EstateAssetItem[];
  result: InheritanceCalculationResult;
  heirsInput: HeirsInput;
  currency: Currency;
  savedCases: SavedInheritanceCase[];
  activeCase?: SavedInheritanceCase | null;
  linkedLandAllocation?: FairLandAllocationResult | null;
  onUpdateHeirsInput: (updated: HeirsInput) => void;
  onNavigateTab: (tab: string) => void;
  onStartNewBlankCase: () => void;
  onOpenAssetsModal: () => void;
  onOpenPresetsModal: () => void;
  onOpenQuranicModal: () => void;
  onPrintCertificate: () => void;
  onExportExcel: () => void;
  onSelectSavedCase: (sc: SavedInheritanceCase) => void;
  onDeleteSavedCase: (id: string) => void;
}

const SHARE_BAR_COLORS = [
  'bg-[#10B981]',
  'bg-teal-400',
  'bg-amber-400',
  'bg-sky-400',
  'bg-indigo-400',
  'bg-slate-400',
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  assets,
  result,
  heirsInput,
  currency,
  savedCases,
  activeCase,
  linkedLandAllocation,
  onUpdateHeirsInput,
  onNavigateTab,
  onStartNewBlankCase,
  onOpenAssetsModal,
  onOpenPresetsModal,
  onOpenQuranicModal,
  onPrintCertificate,
  onExportExcel,
  onSelectSavedCase,
}) => {
  const [caseSearch, setCaseSearch] = useState('');

  const distribution = calculateComprehensiveEstateDistribution(
    assets,
    result,
    heirsInput,
    currency
  );

  const formatMoney = (val: number) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency === 'SLSH' ? 'SOS' : currency,
        maximumFractionDigits: 0,
      })
        .format(val)
        .replace('SOS', currency === 'SLSH' ? 'Sl.Sh' : 'Sh.So');
    } catch {
      return `$${val.toLocaleString()}`;
    }
  };

  const totalHeirsCount = distribution.heirAllocations.reduce((s, h) => s + h.count, 0);
  const totalDeductions =
    result.totalFuneralUSD + result.totalDebtsUSD + result.totalWasiyyahUSD;

  const filteredSavedCases = savedCases.filter((c) => {
    const q = caseSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      c.caseName.toLowerCase().includes(q) ||
      c.referenceNumber.toLowerCase().includes(q) ||
      (c.deceasedName || '').toLowerCase().includes(q)
    );
  });

  const handleRenameIndividual = (shareId: string, personIndex: number, newName: string) => {
    const groupKey = getEditableGroupKeyForShareId(shareId);
    const updated = updateHeirPersonName(heirsInput, groupKey, personIndex, newName);
    onUpdateHeirsInput(updated);
  };

  return (
    <div className="space-y-5 text-[#F8FAFC]">
      {/* 1. HERO EXECUTIVE ACTION BANNER */}
      <section className="rounded-2xl bg-[#0F1B2D] border border-[#243449] p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#94A3B8] font-mono tabular-nums">
              <span className="font-semibold text-[#10B981]">
                {activeCase ? activeCase.referenceNumber : 'GIS DHAXALKA'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {activeCase
                  ? activeCase.hasMapGeometry
                    ? 'Khariidad GIS ku xidhan'
                    : 'Bilaa khariidad'
                  : 'Xisaabinta Faraa’idka & GIS'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F8FAFC]">
              {activeCase
                ? activeCase.caseName
                : heirsInput.deceasedName
                ? `Kiiska Hadda Furan: ${heirsInput.deceasedName}`
                : 'Dulmarka Xisaabinta & Qaybinta Dhaxalka'}
            </h2>
            <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
              Si sugan u hubi saamiyada Faraa&apos;idka, Half Plots-ka xuduuddu goysay (12×18 m
              iyo 9×24 m), iyo qoondaynta dhulka ee kiis kasta.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigateTab('land_designer')}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-4 py-2.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer"
            >
              <Map className="w-4 h-4 shrink-0" />
              <span>Fur Khariidadda GIS</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('calculator')}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#0B1220] hover:bg-[#16263f] border border-[#243449] hover:border-[#10B981]/60 text-[#F8FAFC] px-4 py-2.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer"
            >
              <Calculator className="w-4 h-4 text-[#10B981] shrink-0" />
              <span>Xisaabi Dhaxalka</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('cases')}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#0B1220] hover:bg-[#16263f] border border-[#243449] text-[#F8FAFC] px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#10B981] shrink-0" />
              <span>Liiska Xogta</span>
            </button>
            <PWAInstallButton variant="header" />
          </div>
        </div>
      </section>

      {/* 2. TOP KPI SUMMARY STRIP */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#94A3B8] text-xs font-medium">
            <span>Hantida Saafiga (Tarkah)</span>
            <Coins className="w-4 h-4 text-[#10B981]" />
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-bold text-[#F8FAFC] tabular-nums tracking-tight">
              {result.netDistributableEstateUSD > 0
                ? formatMoney(result.netDistributableEstateUSD)
                : distribution.totalLandPlots > 0
                ? `${distribution.totalLandPlots} Plot`
                : distribution.totalLivestockHeads > 0
                ? `${distribution.totalLivestockHeads} Neef`
                : formatMoney(0)}
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-1 tabular-nums">
              {result.netDistributableEstateUSD > 0
                ? `Guud: ${formatMoney(result.grossEstateUSD)} · Deyn: -${formatMoney(
                    totalDeductions
                  )}`
                : 'Hanti ma-guurto / xoolo sidooda loo qaybinayo'}
            </p>
          </div>
        </div>

        <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#94A3B8] text-xs font-medium">
            <span>Dhulka &amp; Xoolaha</span>
            <MapPin className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-bold text-[#F8FAFC] tabular-nums tracking-tight">
              {distribution.totalLandPlots}{' '}
              <span className="text-xs font-semibold text-[#94A3B8]">Plot</span>
              <span className="mx-1.5 text-[#243449]">·</span>
              {distribution.totalLivestockHeads}{' '}
              <span className="text-xs font-semibold text-[#94A3B8]">Neef</span>
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-1 truncate">
              {distribution.estateTierLevelDescription}
            </p>
          </div>
        </div>

        <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#94A3B8] text-xs font-medium">
            <span>Dhaxlayaasha Xaqa Leh</span>
            <Users className="w-4 h-4 text-[#10B981]" />
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-bold text-[#F8FAFC] tabular-nums tracking-tight">
              {totalHeirsCount}{' '}
              <span className="text-xs font-semibold text-[#94A3B8]">Qof</span>
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-1 tabular-nums">
              Asalka: {result.aslAlMasalah} ·{' '}
              {result.isAwl
                ? `Cawl (${result.awlValue})`
                : result.isRadd
                ? 'Radd'
                : 'Caddilmi'}
              {result.blockedHeirs.length > 0
                ? ` · ${result.blockedHeirs.length} Xanniban`
                : ''}
            </p>
          </div>
        </div>

        <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#94A3B8] text-xs font-medium">
            <span>Shahaadada &amp; Kaydka</span>
            <Scale className="w-4 h-4 text-[#10B981]" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onPrintCertificate}
              className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0B1220] hover:bg-[#16263f] border border-[#243449] text-[#F8FAFC] px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-[#10B981]" />
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={onExportExcel}
              className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-2.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
          </div>
          <p className="text-[11px] text-[#94A3B8] mt-1.5 tabular-nums">
            {savedCases.length} kiis oo kuugu keydsan app-ka
          </p>
        </div>
      </section>

      {/* 3. IMMEDIATE ASSET DISTRIBUTION OVERVIEW */}
      <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#243449] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#F8FAFC]">
              Qaybinta Hantida ee Dhaxlayaasha: Dhul, Lacag &amp; Xoolo
            </h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Saami-qaybsiga sharciga ah iyo waxa qof kasta uu toos u helayo
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenAssetsModal}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#10B981]/60 px-3 py-1.5 text-xs font-semibold text-[#F8FAFC] transition-colors whitespace-nowrap cursor-pointer"
            >
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>Hantida &amp; Deymaha</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('results')}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] px-3.5 py-1.5 text-xs font-bold text-[#030712] transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>Faahfaahin Buuxda</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {distribution.heirAllocations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-[#F8FAFC]">
              Weli lama dooran dhaxlayaal kiiskan.
            </p>
            <p className="text-xs text-[#94A3B8] mt-1">
              Tag qaybta Xisaabi Dhaxalka si aad u doorato ehelka marxuumka iyo hantida.
            </p>
            <button
              type="button"
              onClick={() => onNavigateTab('calculator')}
              className="mt-4 min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-5 py-2.5 text-xs font-bold cursor-pointer"
            >
              <Calculator className="w-4 h-4" />
              <span>Bilow Xisaabinta Hadda</span>
            </button>
          </div>
        ) : (
          <>
            {/* Proportional Share Visual Bar */}
            <div className="px-5 pt-4 pb-3 bg-[#0B1220]/70 border-b border-[#243449]">
              <div className="h-2.5 w-full rounded-lg overflow-hidden flex bg-[#030712]">
                {distribution.heirAllocations.map((h, i) => (
                  <div
                    key={h.heirId}
                    style={{ width: `${Math.max(h.percentage, 2)}%` }}
                    className={`${
                      SHARE_BAR_COLORS[i % SHARE_BAR_COLORS.length]
                    } h-full border-r border-[#030712] last:border-r-0`}
                    title={`${h.nameSomali}: ${h.percentage.toFixed(1)}%`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 text-xs text-[#94A3B8]">
                {distribution.heirAllocations.map((h, i) => (
                  <div key={h.heirId} className="inline-flex items-center gap-1.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-xs ${
                        SHARE_BAR_COLORS[i % SHARE_BAR_COLORS.length]
                      }`}
                    />
                    <span className="font-semibold text-[#F8FAFC]">{h.nameSomali}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums font-mono-numbers text-[11px] text-[#10B981] font-bold">
                      {h.quranicFraction} ({h.percentage.toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile Cards (< md) */}
            <div className="md:hidden divide-y divide-[#243449]">
              {distribution.heirAllocations.map((heir) => (
                <div key={heir.heirId} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[#F8FAFC]">
                        {heir.nameSomali}{' '}
                        <span className="text-xs font-normal text-[#94A3B8] tabular-nums">
                          ({heir.count} qof)
                        </span>
                      </div>
                      <div className="text-[11px] text-[#94A3B8] truncate max-w-[230px]">
                        {heir.individualNames.join(' · ')}
                      </div>
                    </div>
                    <div className="text-right font-mono-numbers tabular-nums">
                      <span className="text-xs font-bold text-[#10B981]">
                        {heir.quranicFraction}
                      </span>
                      <span className="block text-[11px] text-[#94A3B8]">
                        {heir.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-[#243449]/60 text-xs tabular-nums">
                    <span className="text-[#94A3B8]">
                      Qofkiiba:{' '}
                      <strong className="text-[#F8FAFC]">
                        {result.netDistributableEstateUSD > 0
                          ? formatMoney(heir.perPersonEstimatedValueUSD)
                          : distribution.totalLandPlots > 0
                          ? heir.land.displayPerPerson
                          : distribution.totalLivestockHeads > 0
                          ? heir.livestock.displayPerPerson
                          : `${(heir.percentage / Math.max(1, heir.count)).toFixed(2)}%`}
                      </strong>
                    </span>
                    {distribution.totalLandPlots > 0 && (
                      <span className="text-[#10B981] font-mono-numbers font-semibold">
                        {heir.land.displayPerPerson}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop High-Density Table (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#243449] bg-[#0B1220] text-[#94A3B8] font-semibold">
                    <th className="py-3 px-4">Dhaxalaha</th>
                    <th className="py-3 px-3 text-center">Tirada</th>
                    <th className="py-3 px-3 text-center">Saamiga</th>
                    <th className="py-3 px-4">Dhul (Plots)</th>
                    <th className="py-3 px-4">Lacag (Qofkiiba)</th>
                    <th className="py-3 px-4">Xoolo (Qofkiiba)</th>
                    <th className="py-3 px-4">Heerka Hantida</th>
                    <th className="py-3 px-4 text-right">Wadarta Qofka</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#243449]/70">
                  {distribution.heirAllocations.map((heir) => (
                    <tr
                      key={heir.heirId}
                      className="hover:bg-[#0B1220]/60 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-[#F8FAFC] text-xs sm:text-sm">
                          {heir.nameSomali}
                        </div>
                        <div className="text-[11px] text-[#94A3B8] truncate max-w-[210px]">
                          {heir.individualNames.join(' · ')}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center tabular-nums font-semibold text-[#F8FAFC]">
                        {heir.count}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="font-bold text-[#10B981] tabular-nums">
                          {heir.quranicFraction}
                        </span>
                        <span className="block text-[11px] text-[#94A3B8] tabular-nums">
                          {heir.percentage.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#F8FAFC] font-medium tabular-nums">
                        {distribution.totalLandPlots > 0 ? (
                          <div>
                            <span className="font-bold">{heir.land.displayPerPerson}</span>
                            {heir.land.sqMPerPerson && (
                              <span className="block text-[11px] text-[#94A3B8]">
                                ~{heir.land.sqMPerPerson.toLocaleString()} m²
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#94A3B8]/50">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono-numbers font-semibold text-[#F8FAFC]">
                        {distribution.totalMoneyUSD > 0
                          ? formatMoney(heir.money.moneyPerPersonUSD)
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-[#F8FAFC] font-medium tabular-nums">
                        {distribution.totalLivestockHeads > 0
                          ? heir.livestock.displayPerPerson
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-[#94A3B8]">
                        {heir.tierBreakdown.tier1Prime.descriptionSomali !==
                        'Qayb kuma laha heerkan' ? (
                          <div className="truncate max-w-[180px]">
                            <strong className="text-[#F8FAFC]">H1:</strong>{' '}
                            {heir.tierBreakdown.tier1Prime.descriptionSomali}
                          </div>
                        ) : null}
                        {heir.tierBreakdown.tier2Standard.descriptionSomali !==
                        'Qayb kuma laha heerkan' ? (
                          <div className="truncate max-w-[180px]">
                            <strong className="text-[#F8FAFC]">H2:</strong>{' '}
                            {heir.tierBreakdown.tier2Standard.descriptionSomali}
                          </div>
                        ) : null}
                        {heir.tierBreakdown.tier1Prime.descriptionSomali ===
                          'Qayb kuma laha heerkan' &&
                          heir.tierBreakdown.tier2Standard.descriptionSomali ===
                            'Qayb kuma laha heerkan' && (
                            <span className="text-[#94A3B8]/70">Saami siman</span>
                          )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-numbers font-bold text-[#10B981]">
                        {result.netDistributableEstateUSD > 0
                          ? formatMoney(heir.perPersonEstimatedValueUSD)
                          : distribution.totalLandPlots > 0
                          ? heir.land.displayPerPerson
                          : distribution.totalLivestockHeads > 0
                          ? heir.livestock.displayPerPerson
                          : `${(heir.percentage / Math.max(1, heir.count)).toFixed(2)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* 4. TWO-COLUMN BOTTOM GRID: QUICK NAMED HEIRS EDITOR + SAVED CASES & TOOLS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 7 cols: Quick Individual Heir Naming */}
        <section className="lg:col-span-7 bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-[#243449] flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#F8FAFC]">
                Qofkasta Magaciisa &amp; Saamigiisa ({distribution.allIndividualHeirs.length} Qof)
              </h3>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Ku qor magaca saddexan ee dhaxale kasta si uu ugu soo baxo Shahaadada &amp; Excel-ka
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('results')}
              className="text-xs font-bold text-[#10B981] hover:underline whitespace-nowrap cursor-pointer"
            >
              Arag Dhammaan →
            </button>
          </div>

          <div className="divide-y divide-[#243449]/70 max-h-[360px] overflow-y-auto">
            {distribution.allIndividualHeirs.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#94A3B8]">
                Marka aad doorato dhaxlayaasha, halkan ayaad qof kasta ugu qori kartaa magaciisa.
              </div>
            ) : (
              distribution.allIndividualHeirs.map((ind, idx) => {
                const gisHeir = linkedLandAllocation?.heirAllocations.find(
                  (h) => h.heirGroupId === ind.heirGroupId && h.personIndex === ind.personIndex
                );

                return (
                  <div
                    key={`${ind.heirGroupId}-${ind.personIndex}-${idx}`}
                    className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-[#0B1220]/50"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="w-7 h-7 rounded-lg bg-[#0B1220] border border-[#243449] text-[#10B981] font-mono-numbers text-xs font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={ind.personName}
                          onChange={(e) =>
                            handleRenameIndividual(
                              ind.heirGroupId,
                              ind.personIndex,
                              e.target.value
                            )
                          }
                          placeholder={`Qor magaca (${ind.roleTitleSomali})...`}
                          className="w-full min-h-[40px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none transition-colors"
                        />
                        {gisHeir && (
                          <div className="text-[11px] font-mono-numbers text-[#94A3B8] mt-1 truncate">
                            {gisHeir.compactSummarySomali}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 pl-10 sm:pl-0 text-xs shrink-0">
                      <span className="text-[#94A3B8] font-medium">{ind.roleTitleSomali}</span>
                      <span className="text-[#243449]">·</span>
                      <span className="font-mono-numbers font-bold text-[#10B981]">
                        {result.netDistributableEstateUSD > 0
                          ? formatMoney(ind.totalEstimatedValueUSD)
                          : distribution.totalLandPlots > 0
                          ? ind.landDisplay
                          : distribution.totalLivestockHeads > 0
                          ? ind.livestockDisplay
                          : `${ind.individualPercentage.toFixed(2)}%`}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right 5 cols: Saved Cases & Fiqh Quick Tools */}
        <section className="lg:col-span-5 space-y-5">
          {/* Quick Fiqh & Preset Actions */}
          <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#F8FAFC]">Qalabka Degdegga ah</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onOpenPresetsModal}
                className="min-h-[52px] flex items-center gap-2.5 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#10B981]/60 p-3 text-left transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#F8FAFC] truncate">Tusaalooyin</div>
                  <div className="text-[11px] text-[#94A3B8] truncate">Kiisas diyaarsan</div>
                </div>
              </button>

              <button
                type="button"
                onClick={onOpenQuranicModal}
                className="min-h-[52px] flex items-center gap-2.5 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#10B981]/60 p-3 text-left transition-colors cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-[#10B981] shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#F8FAFC] truncate">Aayadaha</div>
                  <div className="text-[11px] text-[#94A3B8] truncate">
                    Daliilka Faraa&apos;idka
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('records')}
                className="min-h-[52px] flex items-center gap-2.5 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#10B981]/60 p-3 text-left transition-colors cursor-pointer"
              >
                <FolderOpen className="w-4 h-4 text-[#10B981] shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#F8FAFC] truncate">Shaxda Excel</div>
                  <div className="text-[11px] text-[#94A3B8] truncate">Diiwaanka xisaabta</div>
                </div>
              </button>

              <button
                type="button"
                onClick={onStartNewBlankCase}
                className="min-h-[52px] flex items-center gap-2.5 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#10B981]/60 p-3 text-left transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-[#94A3B8] shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#F8FAFC] truncate">Kiis Cusub</div>
                  <div className="text-[11px] text-[#94A3B8] truncate">Eber ka bilow</div>
                </div>
              </button>
            </div>
          </div>

          {/* Saved Cases Ledger */}
          <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#243449] flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#F8FAFC]">
                Kiisaska Keydsan ({savedCases.length})
              </h3>
              {savedCases.length > 0 && (
                <div className="relative w-40">
                  <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={caseSearch}
                    onChange={(e) => setCaseSearch(e.target.value)}
                    placeholder="Raadi kiis..."
                    className="w-full min-h-[34px] bg-[#0B1220] border border-[#243449] rounded-lg pl-8 pr-2.5 py-1 text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none focus:border-[#10B981]"
                  />
                </div>
              )}
            </div>

            {filteredSavedCases.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs font-semibold text-[#F8FAFC]">
                  {savedCases.length === 0
                    ? 'Weli ma jiro kiis kuu keydsan.'
                    : 'Lama helin kiis u dhigma raadintaada.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#243449]/70 max-h-[220px] overflow-y-auto">
                {filteredSavedCases.slice(0, 6).map((sc) => (
                  <div
                    key={sc.id}
                    className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#0B1220]/50 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectSavedCase(sc)}
                      className="flex-1 text-left min-w-0 cursor-pointer"
                    >
                      <div className="text-xs font-bold text-[#F8FAFC] truncate">
                        <span className="font-mono-numbers text-[#10B981] mr-1.5">
                          {sc.referenceNumber}
                        </span>
                        {sc.caseName}
                      </div>
                      <div className="text-[11px] text-[#94A3B8] tabular-nums mt-0.5">
                        {sc.heirCount} dhaxale · {formatMoney(sc.totalNetEstateUSD)} ·{' '}
                        {sc.hasMapGeometry ? `${sc.fullPlotsCount || 0} Plot` : 'Bilaa khariidad'}
                      </div>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSelectSavedCase(sc)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0B1220] border border-[#243449] hover:border-[#10B981] text-[#10B981] text-[11px] font-bold cursor-pointer"
                      >
                        Fur
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateTab('cases')}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0B1220] cursor-pointer"
                        title="Maaree kiisaska"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
