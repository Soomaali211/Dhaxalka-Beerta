import { useState } from 'react';
import { 
  InheritanceCalculationResult, 
  HeirsInput, 
  EstateAssetItem, 
  EstateDeductionItem,
  Currency,
  AssetQualityTier
} from '../types/inheritance';
import { 
  calculateComprehensiveEstateDistribution 
} from '../utils/estateAssetDistributionEngine';
import {
  updateHeirPersonName,
  getEditableGroupKeyForShareId
} from '../utils/heirNameUtils';
import { 
  MapPin, 
  Coins, 
  Sparkles, 
  Printer, 
  Download, 
  PlusCircle, 
  CheckCircle2, 
  Users, 
  HelpCircle,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  TrendingUp,
  Tag,
  UserCheck,
  Edit3
} from 'lucide-react';

interface ComprehensiveAssetDistributionViewProps {
  assets: EstateAssetItem[];
  result: InheritanceCalculationResult;
  heirsInput: HeirsInput;
  currency: Currency;
  onUpdateHeirsInput?: (updated: HeirsInput) => void;
  onOpenAssetsConfig: () => void;
  onOpenHeirsConfig: () => void;
  onOpenNewCase: () => void;
  onPrint: () => void;
  onExportExcel: () => void;
}

type FilterCategory = 'all' | 'land' | 'money' | 'livestock' | 'tiers';

export function ComprehensiveAssetDistributionView({
  assets,
  result,
  heirsInput,
  currency,
  onUpdateHeirsInput,
  onOpenAssetsConfig,
  onOpenHeirsConfig,
  onOpenNewCase,
  onPrint,
  onExportExcel,
}: ComprehensiveAssetDistributionViewProps) {
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [selectedHeirId, setSelectedHeirId] = useState<string | null>(null);

  const distribution = calculateComprehensiveEstateDistribution(assets, result, heirsInput, currency);

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
      return `${currency} ${Math.round(val).toLocaleString()}`;
    }
  };

  const deceasedName = heirsInput.deceasedName || 'Marxuumka';

  const handleRenameIndividual = (shareId: string, personIndex: number, newName: string) => {
    if (!onUpdateHeirsInput) return;
    const groupKey = getEditableGroupKeyForShareId(shareId);
    const updated = updateHeirPersonName(heirsInput, groupKey, personIndex, newName);
    onUpdateHeirsInput(updated);
  };

  return (
    <div className="space-y-6">
      
      {/* 1. TOP HEADER BANNER */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-7 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Qaybinta Hantida ee Tooska ah (Asset Distribution)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Qaybinta Hantida: Dhul, Lacag, Xoolo & Heerarka
            </h1>
            <p className="text-sm text-neutral-400 mt-1.5 max-w-2xl leading-relaxed">
              Xisaabinta tooska ah ee hantida <span className="text-emerald-400 font-semibold">{deceasedName}</span> oo loo qaybiyey dhaxaleeyda midkasta waxa uu helayo dhanka Dhulka (Plots), Lacagta caddaanka ah/bangiga, Xoolaha (Neefaf) iyo Heerka tayada hantida sida uu dhigayo sharciga Faraa'idka.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={onPrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>Daabac Shahaadada</span>
            </button>
            <button
              onClick={onExportExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Dhoofi Excel</span>
            </button>
            <button
              onClick={onOpenAssetsConfig}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-md shadow-emerald-950/40"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Wax Ka Beddel Hantida</span>
            </button>
          </div>
        </div>

        {/* 2. FOUR PILLAR STATS BAR (DHUL, LACAG, XOOLO, HEERKA) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-6 pt-6 border-t border-neutral-800/80">
          
          {/* Pillar 1: DHUL (Land & Plots) */}
          <div className="bg-neutral-950/70 border border-blue-500/20 rounded-xl p-4 flex flex-col justify-between hover:border-blue-500/40 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span>Dhulka & Plots-ka</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 font-medium">
                {distribution.totalLandParcelsCount} Goobood
              </span>
            </div>
            <div className="mt-2.5">
              <div className="text-2xl font-black text-white tracking-tight">
                {distribution.totalLandPlots} <span className="text-sm font-semibold text-neutral-400">Baloodh</span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-1">
                {distribution.unvaluedPlotsCount > 0 
                  ? `${distribution.unvaluedPlotsCount} baloodh oo plots sidooda ah`
                  : 'Dhul loo qaybiyey baloodh ahaan'}
              </p>
            </div>
          </div>

          {/* Pillar 2: LACAG (Cash & Bank) */}
          <div className="bg-neutral-950/70 border border-emerald-500/20 rounded-xl p-4 flex flex-col justify-between hover:border-emerald-500/40 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5" />
                <span>Lacagta & Bangiga</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-medium">
                Caddaan & Kayd
              </span>
            </div>
            <div className="mt-2.5">
              <div className="text-2xl font-black text-white tracking-tight">
                {formatMoney(distribution.totalMoneyUSD)}
              </div>
              <p className="text-[11px] text-neutral-400 mt-1">
                Lacagta bangiga, caddaanka iyo ganacsiga
              </p>
            </div>
          </div>

          {/* Pillar 3: XOOLO (Livestock) */}
          <div className="bg-neutral-950/70 border border-amber-500/20 rounded-xl p-4 flex flex-col justify-between hover:border-amber-500/40 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Xoolaha Nool</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-medium">
                Geel, Lo', Ari
              </span>
            </div>
            <div className="mt-2.5">
              <div className="text-2xl font-black text-white tracking-tight">
                {distribution.totalLivestockHeads} <span className="text-sm font-semibold text-neutral-400">Neef</span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-1">
                Neefaf toos ah oo loo qaybiyey dhaxaleeyda
              </p>
            </div>
          </div>

          {/* Pillar 4: HEERKA HANTIDA (Quality Tiers) */}
          <div className="bg-neutral-950/70 border border-purple-500/20 rounded-xl p-4 flex flex-col justify-between hover:border-purple-500/40 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-400 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                <span>Heerarka Hantida</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 font-medium">
                1aad / 2aad / 3aad
              </span>
            </div>
            <div className="mt-2.5">
              <div className="text-sm font-bold text-white line-clamp-1">
                {distribution.estateTierLevelDescription}
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[11px] text-neutral-400">
                <span className="text-emerald-400">H1: {distribution.tier1ItemsCount}</span>
                <span>·</span>
                <span className="text-amber-400">H2: {distribution.tier2ItemsCount}</span>
                <span>·</span>
                <span className="text-neutral-400">H3: {distribution.tier3ItemsCount}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 3. CATEGORY FILTER TABS & SEARCH */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-900/80 p-2 rounded-xl border border-neutral-800">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeFilter === 'all'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Dhammaan Qaybaha (All)</span>
          </button>

          <button
            onClick={() => setActiveFilter('land')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeFilter === 'land'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>📍 Dhulka (Plots Kaliya)</span>
          </button>

          <button
            onClick={() => setActiveFilter('money')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeFilter === 'money'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>💵 Lacagta & Bangiga</span>
          </button>

          <button
            onClick={() => setActiveFilter('livestock')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeFilter === 'livestock'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>🐪 Xoolaha Nool</span>
          </button>

          <button
            onClick={() => setActiveFilter('tiers')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeFilter === 'tiers'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>🏷️ Heerarka Hantida (Tiers)</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-neutral-400 px-2">
          <span>Dhaxaleeyda xaqa u leh:</span>
          <span className="font-bold text-white bg-neutral-800 px-2 py-0.5 rounded-md border border-neutral-700">
            {distribution.heirAllocations.reduce((sum, h) => sum + h.count, 0)} Qof
          </span>
        </div>
      </div>

      {/* 4. MASTER ASSET DISTRIBUTION MATRIX TABLE */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-neutral-800 bg-neutral-950/60 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Jadwalka Qaybinta Hantida ee Dhaxaleeyda</span>
              <span className="text-xs font-normal text-neutral-400">(Qof Kastaaba Wuxuu Helayo)</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Muujinta tooska ah ee Dhulka, Lacagta, Xoolaha iyo Heerka hantida ee qof walba uu helay.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Xeerka 2:1 & Faraa'idka waa la ilaaliyey</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-950 text-neutral-400 font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4 w-48">Dhaxalaha (Heir)</th>
                <th className="py-3.5 px-3 text-center w-24">Tirada</th>
                <th className="py-3.5 px-3 text-center w-28">Saamiga Faraa'idka</th>
                
                {/* Dynamic Columns based on activeFilter */}
                {(activeFilter === 'all' || activeFilter === 'land') && (
                  <th className="py-3.5 px-4 bg-blue-950/20 text-blue-300 border-x border-neutral-800">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-400" />
                      <span>📍 Dhul (Plots / Baloodho)</span>
                    </div>
                  </th>
                )}

                {(activeFilter === 'all' || activeFilter === 'money') && (
                  <th className="py-3.5 px-4 bg-emerald-950/20 text-emerald-300 border-r border-neutral-800">
                    <div className="flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-emerald-400" />
                      <span>💵 Lacagta (Cash/Bangi)</span>
                    </div>
                  </th>
                )}

                {(activeFilter === 'all' || activeFilter === 'livestock') && (
                  <th className="py-3.5 px-4 bg-amber-950/20 text-amber-300 border-r border-neutral-800">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                      <span>🐪 Xoolaha (Neefaf)</span>
                    </div>
                  </th>
                )}

                {(activeFilter === 'all' || activeFilter === 'tiers') && (
                  <th className="py-3.5 px-4 bg-purple-950/20 text-purple-300 border-r border-neutral-800">
                    <div className="flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-purple-400" />
                      <span>🏷️ Heerka Hantida (Tiers)</span>
                    </div>
                  </th>
                )}

                <th className="py-3.5 px-4 text-right">Wadarta Qiimaha ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/80">
              {distribution.heirAllocations.map((heir) => (
                <tr 
                  key={heir.heirId}
                  onClick={() => setSelectedHeirId(selectedHeirId === heir.heirId ? null : heir.heirId)}
                  className={`hover:bg-neutral-800/50 transition-colors cursor-pointer ${
                    selectedHeirId === heir.heirId ? 'bg-neutral-800/70 ring-1 ring-emerald-500/40' : ''
                  }`}
                >
                  {/* Heir name */}
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-white text-sm flex items-center gap-2">
                      <span>{heir.nameSomali}</span>
                    </div>
                    <div className="text-[11px] text-neutral-400 font-arabic">
                      {heir.nameArabic}
                    </div>
                    {heir.individualNames && heir.individualNames.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {heir.individualNames.map((pName, pIdx) => (
                          <span
                            key={pIdx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/30 text-[10px] font-medium text-emerald-300"
                          >
                            <span>👤 {pName}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Count */}
                  <td className="py-3.5 px-3 text-center">
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-200 font-semibold text-xs border border-neutral-700">
                      {heir.count} {heir.count === 1 ? 'qof' : 'qofood'}
                    </span>
                  </td>

                  {/* Sharia fraction & % */}
                  <td className="py-3.5 px-3 text-center">
                    <div className="font-bold text-emerald-400 text-xs">
                      {heir.quranicFraction}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      {heir.percentage.toFixed(1)}%
                    </div>
                  </td>

                  {/* 1. DHUL */}
                  {(activeFilter === 'all' || activeFilter === 'land') && (
                    <td className="py-3.5 px-4 bg-blue-950/10 border-x border-neutral-800">
                      {distribution.totalLandPlots === 0 ? (
                        <span className="text-neutral-500 italic text-[11px]">Kuma jirto hantida dhul</span>
                      ) : (
                        <div>
                          <div className="font-bold text-blue-300 text-xs flex items-center gap-1.5">
                            <span>Qofkiiba: {heir.land.displayPerPerson}</span>
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-2">
                            <span>Wadarta kooxda: <strong className="text-neutral-200">{heir.land.totalPlotsForGroup}</strong> Baloodh</span>
                            {heir.land.sqMPerPerson && (
                              <span className="text-blue-400 font-medium">({heir.land.sqMPerPerson.toLocaleString()} m²)</span>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  )}

                  {/* 2. LACAG */}
                  {(activeFilter === 'all' || activeFilter === 'money') && (
                    <td className="py-3.5 px-4 bg-emerald-950/10 border-r border-neutral-800">
                      {distribution.totalMoneyUSD === 0 ? (
                        <span className="text-neutral-500 italic text-[11px]">Kuma jirto lacag caddaan</span>
                      ) : (
                        <div>
                          <div className="font-bold text-emerald-300 text-xs">
                            Qofkiiba: {formatMoney(heir.money.moneyPerPersonUSD)}
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-0.5">
                            Wadarta: {formatMoney(heir.money.totalMoneyForGroupUSD)}
                          </div>
                        </div>
                      )}
                    </td>
                  )}

                  {/* 3. XOOLO */}
                  {(activeFilter === 'all' || activeFilter === 'livestock') && (
                    <td className="py-3.5 px-4 bg-amber-950/10 border-r border-neutral-800">
                      {distribution.totalLivestockHeads === 0 ? (
                        <span className="text-neutral-500 italic text-[11px]">Kuma jiraan xoolo</span>
                      ) : (
                        <div>
                          <div className="font-bold text-amber-300 text-xs">
                            Qofkiiba: {heir.livestock.displayPerPerson}
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-0.5">
                            Wadarta kooxda: <strong className="text-neutral-200">{heir.livestock.totalHeadsForGroup}</strong> Neef
                          </div>
                        </div>
                      )}
                    </td>
                  )}

                  {/* 4. HEERKA HANTIDA */}
                  {(activeFilter === 'all' || activeFilter === 'tiers') && (
                    <td className="py-3.5 px-4 bg-purple-950/10 border-r border-neutral-800">
                      <div className="space-y-1 text-[11px]">
                        {heir.tierBreakdown.tier1Prime.plotsPerPerson > 0 || heir.tierBreakdown.tier1Prime.livestockPerPerson > 0 || heir.tierBreakdown.tier1Prime.valuePerPersonUSD > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">H1</span>
                            <span className="text-neutral-300">{heir.tierBreakdown.tier1Prime.descriptionSomali}</span>
                          </div>
                        ) : null}

                        {heir.tierBreakdown.tier2Standard.plotsPerPerson > 0 || heir.tierBreakdown.tier2Standard.livestockPerPerson > 0 || heir.tierBreakdown.tier2Standard.valuePerPersonUSD > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">H2</span>
                            <span className="text-neutral-300">{heir.tierBreakdown.tier2Standard.descriptionSomali}</span>
                          </div>
                        ) : null}

                        {heir.tierBreakdown.tier3Basic.plotsPerPerson > 0 || heir.tierBreakdown.tier3Basic.livestockPerPerson > 0 || heir.tierBreakdown.tier3Basic.valuePerPersonUSD > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.2 rounded bg-neutral-700 text-neutral-300 font-bold text-[10px]">H3</span>
                            <span className="text-neutral-400">{heir.tierBreakdown.tier3Basic.descriptionSomali}</span>
                          </div>
                        ) : null}

                        {!heir.tierBreakdown.tier1Prime.descriptionSomali && !heir.tierBreakdown.tier2Standard.descriptionSomali && (
                          <span className="text-neutral-500 italic">Heerka Guud ee Faraa'idka</span>
                        )}
                      </div>
                    </td>
                  )}

                  {/* Total Value */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="font-bold text-white text-xs">
                      {formatMoney(heir.perPersonEstimatedValueUSD)}
                    </div>
                    {heir.count > 1 && (
                      <div className="text-[11px] text-neutral-400">
                        Kooxda: {formatMoney(heir.totalEstimatedValueUSD)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. INDIVIDUAL HEIR CARDS: DEEP DIVE (DHUL, LACAG, XOOLO, HEERARKA) */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">
              Faahfaahinta Gaarka ah ee Dhaxaleeyda (Heir Individual Allocations)
            </h3>
            <p className="text-xs text-neutral-400">
              Qof kastaaba waxa uu hanti helayo: Dhul, lacag, xoolo iyo heerka tayada hantida oo faahfaahsan.
            </p>
          </div>
          <span className="text-xs text-neutral-400 hidden sm:inline">
            Guji kaadh kasta si aad u aragto xukunka sharciga ah
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {distribution.heirAllocations.map((heir) => (
            <div 
              key={heir.heirId}
              className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition-all"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between pb-3.5 border-b border-neutral-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-bold text-white">{heir.nameSomali}</h4>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[11px] font-bold border border-emerald-500/20">
                      {heir.quranicFraction}
                    </span>
                  </div>
                  <span className="text-xs text-neutral-400 font-arabic block mt-0.5">
                    {heir.nameArabic} · {heir.count} {heir.count === 1 ? 'qof' : 'qofood'} ({heir.percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-neutral-400 block">Qofkiiba wuxuu helay</span>
                  <span className="text-base font-black text-emerald-400">
                    {formatMoney(heir.perPersonEstimatedValueUSD)}
                  </span>
                </div>
              </div>

              {/* 4 Quadrants: DHUL, LACAG, XOOLO, HEERKA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-3.5">
                
                {/* 1. DHUL BOX */}
                <div className="bg-neutral-950/60 border border-blue-500/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400 mb-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>📍 Dhul & Plots</span>
                  </div>
                  {distribution.totalLandPlots > 0 ? (
                    <div>
                      <div className="text-sm font-black text-white">
                        {heir.land.displayPerPerson}
                      </div>
                      {heir.land.sqMPerPerson && (
                        <div className="text-xs text-blue-300 font-medium mt-0.5">
                          Cabirka: ~{heir.land.sqMPerPerson.toLocaleString()} m²
                        </div>
                      )}
                      <div className="text-[11px] text-neutral-400 mt-1">
                        Wadarta kooxda: {heir.land.totalPlotsForGroup} Baloodh
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-neutral-500 italic">
                      Hantida kuma jiro dhul
                    </div>
                  )}
                </div>

                {/* 2. LACAG BOX */}
                <div className="bg-neutral-950/60 border border-emerald-500/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-1.5">
                    <Coins className="w-3.5 h-3.5" />
                    <span>💵 Lacag & Bangi</span>
                  </div>
                  {distribution.totalMoneyUSD > 0 ? (
                    <div>
                      <div className="text-sm font-black text-white">
                        {formatMoney(heir.money.moneyPerPersonUSD)}
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-1">
                        Wadarta kooxda: {formatMoney(heir.money.totalMoneyForGroupUSD)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-neutral-500 italic">
                      Hantida kuma jirto lacag
                    </div>
                  )}
                </div>

                {/* 3. XOOLO BOX */}
                <div className="bg-neutral-950/60 border border-amber-500/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 mb-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>🐪 Xoolo Nool</span>
                  </div>
                  {distribution.totalLivestockHeads > 0 ? (
                    <div>
                      <div className="text-sm font-black text-white">
                        {heir.livestock.displayPerPerson}
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-1">
                        Wadarta kooxda: {heir.livestock.totalHeadsForGroup} Neef
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-neutral-500 italic">
                      Hantida kuma jiraan xoolo
                    </div>
                  )}
                </div>

                {/* 4. HEERKA HANTIDA BOX */}
                <div className="bg-neutral-950/60 border border-purple-500/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-400 mb-1.5">
                    <Tag className="w-3.5 h-3.5" />
                    <span>🏷️ Heerka Hantida</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    {heir.tierBreakdown.tier1Prime.plotsPerPerson > 0 || heir.tierBreakdown.tier1Prime.livestockPerPerson > 0 ? (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-emerald-400 font-semibold">Heerka 1aad:</span>
                        <span className="text-white font-medium">{heir.tierBreakdown.tier1Prime.descriptionSomali}</span>
                      </div>
                    ) : null}

                    {heir.tierBreakdown.tier2Standard.plotsPerPerson > 0 || heir.tierBreakdown.tier2Standard.livestockPerPerson > 0 ? (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-amber-400 font-semibold">Heerka 2aad:</span>
                        <span className="text-white font-medium">{heir.tierBreakdown.tier2Standard.descriptionSomali}</span>
                      </div>
                    ) : null}

                    {!heir.tierBreakdown.tier1Prime.plotsPerPerson && !heir.tierBreakdown.tier2Standard.plotsPerPerson && (
                      <div className="text-[11px] text-neutral-400">
                        Saami toos ah oo buuxa ({heir.quranicFraction})
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Sharia Proof Footer */}
              <div className="bg-neutral-950/90 rounded-xl p-3 border border-neutral-800 text-[11px] text-neutral-300 leading-relaxed mt-1 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white">Xeerka Faraa'idka: </span>
                  <span>{heir.shariaRuleExplanation}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6. FINAL SECTION: QOFKASTA MAGACIISA IYO SAAMIGIISA GAARKA AH (INDIVIDUAL NAMED HEIRS LEDGER) */}
      <div className="bg-neutral-900 border border-emerald-500/30 rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-5 border-b border-neutral-800 bg-gradient-to-r from-emerald-950/50 via-neutral-950 to-neutral-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold mb-1.5">
              <UserCheck className="w-3.5 h-3.5" />
              <span>Qaybta Ugu Dambaysa: Diiwaanka Magacyada Dhaxlayaasha</span>
            </div>
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
              <span>Liiska Ugu Dambeeya: Qofkasta Magaciisa & Waxa Uu Helay</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Halkan waxaad si toos ah ugu qori kartaa ama uga beddeli kartaa <strong>dhaxlayaasha qofkasta magaciisa</strong>, iyadoo qof walba hortiisa ay ku qoran tahay Dhulka, Lacagta, Xoolaha iyo Heerka hantida uu helay.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onOpenHeirsConfig}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Maamul Magacyada & Ehelka</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-950 text-neutral-400 font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-3 text-center w-12">#</th>
                <th className="py-3.5 px-4 min-w-[230px]">Magaca Qofka Dhaxlaya (Qor Magaca)</th>
                <th className="py-3.5 px-3">Doorka / Xiriirka</th>
                <th className="py-3.5 px-3 text-center">Saamiga Qofka</th>
                <th className="py-3.5 px-4 bg-blue-950/20 text-blue-300 border-x border-neutral-800">
                  📍 Dhul (Plots)
                </th>
                <th className="py-3.5 px-4 bg-emerald-950/20 text-emerald-300 border-r border-neutral-800">
                  💵 Lacag (Cash/Bangi)
                </th>
                <th className="py-3.5 px-4 bg-amber-950/20 text-amber-300 border-r border-neutral-800">
                  🐪 Xoolo (Neefaf)
                </th>
                <th className="py-3.5 px-4 bg-purple-950/20 text-purple-300 border-r border-neutral-800">
                  🏷️ Heerka Hantida
                </th>
                <th className="py-3.5 px-4 text-right">Wadarta Qofka ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/80">
              {distribution.allIndividualHeirs.map((ind, idx) => (
                <tr key={`${ind.heirGroupId}-${ind.personIndex}-${idx}`} className="hover:bg-neutral-800/40 transition-colors">
                  <td className="py-3 px-3 text-center font-mono text-neutral-500 font-bold">
                    {idx + 1}
                  </td>

                  {/* Editable Individual Name Input */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={ind.personName}
                        onChange={(e) => handleRenameIndividual(ind.heirGroupId, ind.personIndex, e.target.value)}
                        placeholder={`Magaca ${ind.roleTitleSomali}...`}
                        className="w-full bg-neutral-950 border border-neutral-700 hover:border-emerald-500/60 focus:border-emerald-500 rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none transition-colors"
                      />
                    </div>
                  </td>

                  {/* Role */}
                  <td className="py-3 px-3">
                    <span className="font-semibold text-neutral-200 block">{ind.roleTitleSomali}</span>
                    <span className="text-[10px] text-neutral-500 font-arabic">{ind.roleTitleArabic}</span>
                  </td>

                  {/* Individual Share % */}
                  <td className="py-3 px-3 text-center">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono font-bold text-xs border border-emerald-500/20">
                      {ind.individualPercentage.toFixed(2)}%
                    </span>
                  </td>

                  {/* Land */}
                  <td className="py-3 px-4 bg-blue-950/10 border-x border-neutral-800">
                    {distribution.totalLandPlots > 0 ? (
                      <div>
                        <span className="font-bold text-blue-300">{ind.landDisplay}</span>
                        {ind.landSqM && (
                          <span className="block text-[10px] text-neutral-400">~{ind.landSqM.toLocaleString()} m²</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-neutral-500 italic">-</span>
                    )}
                  </td>

                  {/* Money */}
                  <td className="py-3 px-4 bg-emerald-950/10 border-r border-neutral-800 font-mono font-bold text-emerald-300">
                    {distribution.totalMoneyUSD > 0 ? formatMoney(ind.moneyAmountUSD) : '-'}
                  </td>

                  {/* Livestock */}
                  <td className="py-3 px-4 bg-amber-950/10 border-r border-neutral-800 font-bold text-amber-300">
                    {distribution.totalLivestockHeads > 0 ? ind.livestockDisplay : '-'}
                  </td>

                  {/* Quality Tiers */}
                  <td className="py-3 px-4 bg-purple-950/10 border-r border-neutral-800 text-[11px]">
                    <div className="space-y-0.5">
                      {ind.tier1Description !== 'Qayb kuma laha heerkan' && (
                        <div className="text-emerald-300">H1: {ind.tier1Description}</div>
                      )}
                      {ind.tier2Description !== 'Qayb kuma laha heerkan' && (
                        <div className="text-amber-300">H2: {ind.tier2Description}</div>
                      )}
                    </div>
                  </td>

                  {/* Total Estimated Value */}
                  <td className="py-3 px-4 text-right font-mono font-black text-white text-xs">
                    {formatMoney(ind.totalEstimatedValueUSD)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. CALL TO ACTION & QUICK CONTROLS BANNER */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-neutral-900 to-neutral-900 border border-emerald-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <span>Ma doonaysaa inaad wax ka beddesho Hantida ama Dhaxaleeyda?</span>
          </h4>
          <p className="text-xs text-neutral-400 mt-1">
            Waxaad ku dari kartaa dhul cusub oo baloodho ah, lacago bangi/caddaan ah, xoolo nool ama dardaaran iyo deymo.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenAssetsConfig}
            className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition-colors"
          >
            + Ku Dar Hanti (Dhul, Lacag, Xoolo)
          </button>
          <button
            onClick={onOpenNewCase}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-sm"
          >
            Foomka Kiis Cusub
          </button>
        </div>
      </div>

    </div>
  );
}
