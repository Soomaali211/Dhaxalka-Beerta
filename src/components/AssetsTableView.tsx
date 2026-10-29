import { EstateAssetItem, EstateDeductionItem, InheritanceCalculationResult, Currency, HeirsInput } from '../types/inheritance';
import { calculateQualityTierDistributions } from '../utils/tierAssetDistributor';
import { calculateLandPlotDistributions, calculateTotalUnvaluedPlotSummary } from '../utils/plotDistributor';
import { 
  Coins, 
  Receipt, 
  Building, 
  Settings2,
  MapPin,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  Grid3X3,
  ArrowRight
} from 'lucide-react';

interface AssetsTableViewProps {
  assets: EstateAssetItem[];
  deductions: EstateDeductionItem[];
  result: InheritanceCalculationResult;
  heirsInput: HeirsInput;
  currency: Currency;
  onOpenAssetsConfig: () => void;
  onNavigateToPlots?: () => void;
}

export function AssetsTableView({
  assets,
  deductions,
  result,
  heirsInput,
  currency,
  onOpenAssetsConfig,
  onNavigateToPlots,
}: AssetsTableViewProps) {
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
      return `${currency} ${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'bank': return 'Bangi / Xisaab';
      case 'cash': return 'Lacag Cadaan';
      case 'real_estate': return 'Guri / Dhul / Plots';
      case 'farm_land': return 'Beer / Dhul Beereed';
      case 'livestock': return 'Xoolo Nool';
      case 'gold_jewelry': return 'Dahab / Qurux';
      case 'business': return 'Ganacsi / Saamiyo';
      case 'receivables': return 'Deymo Ka Maqan';
      default: return 'Hanti Kale';
    }
  };

  const getDeductionLabel = (cat: string) => {
    switch (cat) {
      case 'funeral': return 'Aaska & Diyaarinta Meydka (Tajheez)';
      case 'debt_divine': return 'Deynta Eebbe (Sako/Kafaaro)';
      case 'debt_human': return 'Deynta Addoomaha';
      case 'will_wasiyyah': return 'Dardaaran Shariici ah (Wasiyyah ≤ 1/3)';
      default: return 'Kharash Kale';
    }
  };

  const getTierBadge = (tier?: string) => {
    switch (tier) {
      case 'tier_1_prime':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            ⭐ Heerka 1aad: Meel Fiican / Prime
          </span>
        );
      case 'tier_2_standard':
        return (
          <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
            🔹 Heerka 2aad: Heer Dhexe
          </span>
        );
      case 'tier_3_basic':
        return (
          <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">
            🔸 Heerka 3aad: Duleed / Hoose
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            ⭐ Heerka 1aad: Meel Fiican
          </span>
        );
    }
  };

  // Compute Quality Tier Distribution matrix
  const tierAllocations = calculateQualityTierDistributions(assets, heirsInput);
  
  // Compute Land Plot Distributions (unpriced plots)
  const landParcels = calculateLandPlotDistributions(assets, result, heirsInput);
  const plotSummary = calculateTotalUnvaluedPlotSummary(assets, result, heirsInput);

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-emerald-400" />
            <span>Xisaab-xidhka Hantida Guud, Dhulka & Deymaha</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Diiwaanka hantida ma-guurtada ah, dhulka aan lacag ku qiimaysnayn (plots), iyo qaybinta heerarka tayada (2:1).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateToPlots && (
            <button
              onClick={onNavigateToPlots}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-200 bg-amber-950/70 hover:bg-amber-900/80 border border-amber-500/40 rounded-lg transition-colors cursor-pointer"
            >
              <Grid3X3 className="w-3.5 h-3.5 text-amber-400" />
              <span>Fur Bogga Qaybinta Dhulka</span>
              <ArrowRight className="w-3 h-3 text-amber-400" />
            </button>
          )}
          <button
            onClick={onOpenAssetsConfig}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Habee Hantida & Dhulka</span>
          </button>
        </div>
      </div>

      {/* SPECIAL FEATURE CARD: UNPRICED LAND PLOT DISTRIBUTION */}
      {landParcels.length > 0 && (
        <div className="bg-gradient-to-r from-neutral-900 via-neutral-950 to-neutral-900 border border-emerald-500/30 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <span>Qaybinta Dhulka & Baloodhada (Aan Lacag ku Qiimaysnayn)</span>
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Plots Sidooda ah ({plotSummary.totalPlotsCount} Baloodh)
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Dhulka laguma xidhin lacag; plots-ka waxaa si toos ah loogu qaybiyey dhaxaleeyda iyadoo qof kasta la siinayo inta baloodh ee uu helay.
                </p>
              </div>
            </div>

            {onNavigateToPlots && (
              <button
                onClick={onNavigateToPlots}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <span>Faahfaahin Buuxda & Kaadhadh</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Per-Person Plot Table */}
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-950 border-b border-neutral-800 text-neutral-400 text-[11px] font-semibold">
                  <th className="py-2.5 px-3">Dhaxalaha</th>
                  <th className="py-2.5 px-3 text-center">Tirada</th>
                  <th className="py-2.5 px-3 text-center">Saamiga Sharciga</th>
                  <th className="py-2.5 px-3 text-right">Boqolkiiba</th>
                  <th className="py-2.5 px-3 text-center">Wadarta Baloodhada</th>
                  <th className="py-2.5 px-3 text-left font-bold text-emerald-400 bg-emerald-950/20">
                    Qofkiiba Inta Baloodh ee uu Helay
                  </th>
                  <th className="py-2.5 px-3">Xeerka & Faahfaahinta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 bg-neutral-950/30">
                {plotSummary.summaryPerHeir.map((h) => (
                  <tr key={h.heirId} className="hover:bg-neutral-850/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-white">
                      <div>{h.nameSomali}</div>
                      <div className="text-[10px] text-neutral-500 font-arabic">{h.nameArabic}</div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-white">{h.count}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300">
                        {h.quranicFraction}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-neutral-300">{h.percentage.toFixed(2)}%</td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-white">
                      {h.totalPlotsReceived} Baloodh
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-400 bg-emerald-950/20 text-sm">
                      {h.displayPerPerson}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-neutral-300">
                      {h.count > 1 
                        ? `${h.count} qof waxay qaybsanayaan ${h.totalPlotsReceived} baloodh.`
                        : `Wuxuu/waxay leedahay ${h.displayPerPerson} oo dhan.`
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SPECIAL SHARIA PRINCIPLE CARD: 2:1 ALLOCATION PER QUALITY TIER */}
      <div className="bg-gradient-to-r from-neutral-900 via-amber-950/20 to-neutral-900 border border-amber-500/30 rounded-xl p-5 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-amber-500/20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Qaybinta Heerarka Hantida (Dhulka, Guryaha, Xoolaha & Beeraha)</span>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                  2:1 Sharia Parity
                </span>
              </h3>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Xeerka Cadaaladda Tayada: <strong className="text-white">"Haddii wiilku uu helo 2 plot oo meel fiican ku yaala, gabadhuna waxay helaysaa 1 plot oo meel fiican ku yaala."</strong>
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-xs">
            <div className="bg-neutral-950/80 px-3 py-1.5 rounded-lg border border-neutral-800">
              <span className="text-neutral-400 mr-1.5">Wiilasha:</span>
              <strong className="text-emerald-400 font-mono font-bold">{heirsInput.sonsCount || 0}</strong>
            </div>
            <div className="bg-neutral-950/80 px-3 py-1.5 rounded-lg border border-neutral-800">
              <span className="text-neutral-400 mr-1.5">Gabdhaha:</span>
              <strong className="text-emerald-400 font-mono font-bold">{heirsInput.daughtersCount || 0}</strong>
            </div>
          </div>
        </div>

        {/* Tier Distribution Table */}
        {tierAllocations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 text-[11px] font-semibold bg-neutral-950/60">
                  <th className="py-2.5 px-3">Hantida (Asset)</th>
                  <th className="py-2.5 px-3">Heerka / Tayada</th>
                  <th className="py-2.5 px-3">Goobta (Location)</th>
                  <th className="py-2.5 px-3 text-center">Tirada Guud</th>
                  <th className="py-2.5 px-3 text-center text-amber-300">Wiilkiiba (Sons)</th>
                  <th className="py-2.5 px-3 text-center text-amber-300">Gabadhiiba (Daughters)</th>
                  <th className="py-2.5 px-3 text-right">Wadarta Qiimaha</th>
                  <th className="py-2.5 px-3">Xaaladda Qaybinta & Xeerka</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {tierAllocations.map((t, idx) => (
                  <tr key={idx} className="hover:bg-neutral-850/50 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-white">
                      {t.assetTitle}
                      <span className="block text-[10px] text-neutral-500 font-normal capitalize">
                        {t.category.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {getTierBadge(t.qualityTier)}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-300 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-neutral-500" />
                      <span>{t.location || 'Meel Fiican'}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-white">
                      {t.totalQuantity} <span className="text-neutral-500 text-[10px]">{t.unit}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-extrabold text-emerald-400 bg-emerald-950/20">
                      {t.sonShareUnitsPerPerson > 0 ? (
                        <span>{t.sonShareUnitsPerPerson} <span className="text-[10px] font-normal">{t.unit}</span></span>
                      ) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-extrabold text-amber-400 bg-amber-950/20">
                      {t.daughterShareUnitsPerPerson > 0 ? (
                        <span>{t.daughterShareUnitsPerPerson} <span className="text-[10px] font-normal">{t.unit}</span></span>
                      ) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-400">
                      {formatMoney(t.totalValueUSD)}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-neutral-300">
                      {t.undividedUnits === 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Qayb 2:1 oo buuxda</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{t.undividedNote}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-4 text-xs text-neutral-500">
            Hanti ma-guurto ah (plots, guryo, beero, xoolo) weli laguma darin. Guji "Habee Hantida & Heerarka" si aad u geliso.
          </div>
        )}
      </div>

      {/* Grid of Assets & Deductions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Assets Section */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4 shadow-md">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                1. Diiwaanka Hantida Guud (Gross Estate)
              </h3>
            </div>
            <span className="text-xs font-mono-numbers font-bold text-emerald-400">
              {formatMoney(result.grossEstateUSD)}
            </span>
          </div>

          <div className="divide-y divide-neutral-800/60">
            {assets.map((item) => (
              <div key={item.id} className="py-3 flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{item.title}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded font-medium">
                      {getCategoryLabel(item.category)}
                    </span>
                    {getTierBadge(item.qualityTier)}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                    {item.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-neutral-500" />
                        {item.location}
                      </span>
                    )}
                    <span>Tirada: <strong className="text-neutral-200">{item.quantity || 1} {item.unit || 'Xabbo'}</strong></span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-mono-numbers font-bold text-emerald-400 block">
                    {formatMoney(item.estimatedValueUSD)}
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    {((item.estimatedValueUSD / (result.grossEstateUSD || 1)) * 100).toFixed(1)}% Hantida Guud
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Deductions & Liabilities Section */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4 shadow-md">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-rose-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                2. Xuquuqda Ka Horreysa Dhaxalka (Deductions)
              </h3>
            </div>
            <span className="text-xs font-mono-numbers font-bold text-rose-400">
              -{formatMoney(result.totalFuneralUSD + result.totalDebtsUSD + result.totalWasiyyahUSD)}
            </span>
          </div>

          <div className="divide-y divide-neutral-800/60">
            {deductions.map((item) => (
              <div key={item.id} className="py-3 flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{item.title}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded font-medium">
                      {getDeductionLabel(item.category)}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    {item.category === 'funeral' && 'Kafanka iyo aaska waxaa la bixiyaa marka hore.'}
                    {item.category === 'debt_divine' && 'Deymaha Eebbe sida Sakada iyo Xajka.'}
                    {item.category === 'debt_human' && 'Deymaha ganacsiga iyo dadku ku lahaayeen.'}
                    {item.category === 'will_wasiyyah' && 'Dardaaranka wax ka badan 1/3 lagama bixin karo.'}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs font-mono-numbers font-bold text-rose-400 block">
                    -{formatMoney(item.amountUSD)}
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    Xuquuq Shariici ah
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Net Tarkah Summary Bar */}
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between mt-4">
            <div>
              <span className="text-xs font-semibold text-emerald-300 block">
                Hantida Saafiga ah ee Qaybta (Net Tarkah):
              </span>
              <span className="text-[11px] text-emerald-400/80">
                Wadarta hantida u hartay ashab al-furudka iyo casabada
              </span>
            </div>
            <span className="text-base font-extrabold text-emerald-400 font-mono">
              {formatMoney(result.netDistributableEstateUSD)}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
