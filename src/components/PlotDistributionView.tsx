import { useState } from 'react';
import { 
  EstateAssetItem, 
  InheritanceCalculationResult, 
  HeirsInput, 
  Currency,
  LandParcelPlotDistribution 
} from '../types/inheritance';
import { calculateLandPlotDistributions, calculateTotalUnvaluedPlotSummary } from '../utils/plotDistributor';
import { 
  MapPin, 
  Plus, 
  Settings2, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Grid3X3, 
  Table, 
  Sparkles,
  Info,
  Maximize2,
  Printer,
  FileSpreadsheet,
  UserCheck
} from 'lucide-react';

interface PlotDistributionViewProps {
  assets: EstateAssetItem[];
  result: InheritanceCalculationResult;
  heirsInput: HeirsInput;
  currency: Currency;
  onOpenAssetsConfig: () => void;
  onOpenNewCase?: () => void;
  onPrint?: () => void;
  onExportExcel?: () => void;
}

export function PlotDistributionView({
  assets,
  result,
  heirsInput,
  currency,
  onOpenAssetsConfig,
  onOpenNewCase,
  onPrint,
  onExportExcel,
}: PlotDistributionViewProps) {
  const [viewMode, setViewMode] = useState<'cards' | 'grid' | 'table'>('cards');
  const [selectedParcelId, setSelectedParcelId] = useState<string>('all');

  const parcels = calculateLandPlotDistributions(assets, result, heirsInput);
  const totalSummary = calculateTotalUnvaluedPlotSummary(assets, result, heirsInput);

  const sonsCount = heirsInput.sonsCount || 0;
  const daughtersCount = heirsInput.daughtersCount || 0;
  const hasBothGenders = sonsCount > 0 && daughtersCount > 0;

  // Filter parcels if user selected one
  const displayedParcels = selectedParcelId === 'all' 
    ? parcels 
    : parcels.filter(p => p.assetId === selectedParcelId);

  // Helper colors for heir badges in visual plot grid
  const getHeirColor = (heirId: string) => {
    switch (heirId) {
      case 'wives': return 'bg-rose-500/20 text-rose-300 border-rose-500/40 ring-rose-500/20';
      case 'husband': return 'bg-blue-500/20 text-blue-300 border-blue-500/40 ring-blue-500/20';
      case 'mother': return 'bg-amber-500/20 text-amber-300 border-amber-500/40 ring-amber-500/20';
      case 'father': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ring-emerald-500/20';
      case 'sons': return 'bg-teal-500/20 text-teal-300 border-teal-500/40 ring-teal-500/20';
      case 'daughters': return 'bg-purple-500/20 text-purple-300 border-purple-500/40 ring-purple-500/20';
      default: return 'bg-neutral-800 text-neutral-300 border-neutral-700 ring-neutral-700/20';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Banner */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span>Qaybinta Dhulka (Land & Plot Fara'id)</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Aan Lacag ku Qiimaysnayn (Plots Sidooda ah)
              </span>
            </div>
            
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>Qaybinta Dhulka & Baloodhada (Qofkastaaba Inta Baloodh ee uu Helay)</span>
            </h1>
            
            <p className="text-xs text-neutral-400 mt-1 max-w-3xl leading-relaxed">
              Halkan waxaa si toos ah loogu qaybinayaa dhulka aan lacag lagu qiimayn. Qof kasta oo dhaxalka xaq u leh wuxuu helayaa tirada baloodhada (plots) ee u dhiganta saamigiisa shareecada Islaamka, iyadoo la raacayo xeerka <strong>Wiil 2 : Gabadh 1</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {onPrint && (
              <button
                onClick={onPrint}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-750 hover:text-white rounded-lg border border-neutral-700 transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-neutral-400" />
                <span>Daabac</span>
              </button>
            )}
            {onExportExcel && (
              <button
                onClick={onExportExcel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-750 hover:text-white rounded-lg border border-neutral-700 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Excel</span>
              </button>
            )}
            <button
              onClick={onOpenAssetsConfig}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Habee / Ku dar Dhul Cusub</span>
            </button>
          </div>
        </div>

        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-neutral-800/80">
          <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/60">
            <span className="text-[11px] text-neutral-400 block mb-0.5">Wadarta Baloodhada:</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-emerald-400">
                {totalSummary.totalPlotsCount}
              </span>
              <span className="text-xs text-neutral-500">Baloodh</span>
            </div>
          </div>

          <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/60">
            <span className="text-[11px] text-neutral-400 block mb-0.5">Dhulka aan Lacagta Lahayn:</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-amber-300">
                {totalSummary.totalUnvaluedPlotsCount}
              </span>
              <span className="text-xs text-neutral-500">Plots Toos ah</span>
            </div>
          </div>

          <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/60">
            <span className="text-[11px] text-neutral-400 block mb-0.5">Tirada Goobaha Dhulka:</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-white">
                {parcels.length}
              </span>
              <span className="text-xs text-neutral-500">Qaybood</span>
            </div>
          </div>

          <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/60">
            <span className="text-[11px] text-neutral-400 block mb-0.5">Xeerka Qaybinta:</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-bold text-white">
                Fara'id (2:1 Wiil/Gabadh)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* NO LAND PARCELS EMPTY STATE */}
      {parcels.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <MapPin className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Wali laguma darin dhul ama baloodho la qaybinayo
            </h3>
            <p className="text-xs text-neutral-400 max-w-md mx-auto mt-1">
              Guji badhanka hoose si aad ugu darto dhul aan lacag ku qiimaysnayn (sida 8, 12, ama 24 baloodh) si loogu qaybiyo dhaxaleeyda.
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={onOpenAssetsConfig}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>+ Ku dar Dhul / Baloodho Toos ah</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* SECTION 1: PER-PERSON PLOT SUMMARY SHOWCASE ("Qofkastaaba Inta Baloodh ee uu Helay") */}
          <div className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Qofkastaaba Inta Baloodh ee uu Helay (Individual Plot Shares)
                  </h2>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Wadarta guud ee baloodhada uu qof kasta ka helay dhammaan dhulka marxuumka laga tagay
                </p>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'cards' 
                      ? 'bg-neutral-800 text-white shadow-sm' 
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Kaadhadhka Qofkiiba</span>
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'grid' 
                      ? 'bg-neutral-800 text-white shadow-sm' 
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                  <span>Shaxda Baloodhada</span>
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'table' 
                      ? 'bg-neutral-800 text-white shadow-sm' 
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Table className="w-3.5 h-3.5" />
                  <span>Jadwal Buuxa</span>
                </button>
              </div>
            </div>

            {/* Sharia Parity Banner if sons and daughters exist */}
            {hasBothGenders && (
              <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200/90 leading-relaxed">
                  <strong className="text-amber-300 font-semibold">
                    Caddaynta Xeerka Shareecada (2 kow ah):
                  </strong>{' '}
                  Dhulka waxaa loo qaybiyey si waafaqsan aayadda 11 ee Suuradda An-Nisaa (
                  <em>لِلذَّكَرِ مِثْلُ حَظِّ الْأُنثَيَيْنِ</em>). Wiil kasta wuxuu helayaa labanlaabka inta ay hesho gabadh kasta.
                </div>
              </div>
            )}

            {/* 1A. CARDS VIEW */}
            {viewMode === 'cards' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                {totalSummary.summaryPerHeir.map((heir) => {
                  const badgeColor = getHeirColor(heir.heirId);
                  return (
                    <div 
                      key={heir.heirId}
                      className="bg-neutral-950/80 border border-neutral-800/90 hover:border-neutral-700 rounded-xl p-4.5 space-y-3.5 shadow-md transition-all relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-white">{heir.nameSomali}</h3>
                            <span className="text-[10px] text-neutral-400 font-arabic">
                              {heir.nameArabic}
                            </span>
                          </div>
                          <span className="text-[11px] text-neutral-400 block mt-0.5">
                            Tirada: <strong className="text-neutral-200">{heir.count} qof</strong>
                          </span>
                        </div>

                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${badgeColor}`}>
                          {heir.quranicFraction} ({heir.percentage.toFixed(1)}%)
                        </span>
                      </div>

                      {/* MAIN STAT: PLOTS PER PERSON */}
                      <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 block">
                            Qofkiiba Wuxuu Helay:
                          </span>
                          <span className="text-base font-extrabold text-emerald-400 font-mono">
                            {heir.displayPerPerson}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-neutral-500 block">Wadarta Qaybta:</span>
                          <span className="text-xs font-bold text-neutral-200 font-mono">
                            {heir.totalPlotsReceived} Baloodh
                          </span>
                        </div>
                      </div>

                      {/* Visual Plot representation indicator */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-neutral-400">
                          <span>Heerka Saamiga:</span>
                          <span className="font-mono font-medium text-emerald-400">{heir.percentage.toFixed(2)}%</span>
                        </div>
                        <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
                          <div 
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(5, heir.percentage))}%` }}
                          />
                        </div>
                      </div>

                      {/* Explanation */}
                      <p className="text-[11px] text-neutral-400/90 leading-relaxed border-t border-neutral-850 pt-2">
                        {heir.count > 1 ? (
                          <>
                            {heir.count} qof waxay si siman u qaadanayaan <strong>{heir.totalPlotsReceived} baloodh</strong>, qofkiibana wuxuu helayaa <strong>{heir.displayPerPerson}</strong>.
                          </>
                        ) : (
                          <>
                            Wuxuu/waxay heshay <strong>{heir.displayPerPerson}</strong> oo toos ah.
                          </>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 1B. FULL TABLE VIEW */}
            {viewMode === 'table' && (
              <div className="overflow-x-auto rounded-xl border border-neutral-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-neutral-950 border-b border-neutral-800 text-neutral-400 text-[11px] font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Dhaxalaha (Heir)</th>
                      <th className="py-3 px-3 text-center">Tirada</th>
                      <th className="py-3 px-3 text-center">Saamiga Sharciga</th>
                      <th className="py-3 px-3 text-right">Boqolkiiba (%)</th>
                      <th className="py-3 px-4 text-center">Wadarta Baloodhada</th>
                      <th className="py-3 px-4 text-left font-bold text-emerald-400 bg-emerald-950/20">
                        Qofkiiba Inta Baloodh ee uu Helay
                      </th>
                      <th className="py-3 px-4">Faahfaahinta Sharciga ah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/70 bg-neutral-950/40">
                    {totalSummary.summaryPerHeir.map((heir) => (
                      <tr key={heir.heirId} className="hover:bg-neutral-900/60 transition-colors">
                        <td className="py-3 px-4 font-semibold text-white">
                          <div>{heir.nameSomali}</div>
                          <div className="text-[10px] text-neutral-500 font-arabic">{heir.nameArabic}</div>
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-white">
                          {heir.count}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            {heir.quranicFraction}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-neutral-200">
                          {heir.percentage.toFixed(2)}%
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-white">
                          {heir.totalPlotsReceived} <span className="text-[10px] text-neutral-500 font-normal">Baloodh</span>
                        </td>
                        <td className="py-3 px-4 font-mono font-extrabold text-sm text-emerald-400 bg-emerald-950/20">
                          {heir.displayPerPerson}
                        </td>
                        <td className="py-3 px-4 text-[11px] text-neutral-300">
                          {heir.count > 1 
                            ? `Si siman ayey ugu qaybsanayaan ${heir.totalPlotsReceived} baloodh.`
                            : `Wuxuu/waxay leedahay ${heir.displayPerPerson} oo buuxa.`
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 1C. VISUAL PLOTS GRID */}
            {viewMode === 'grid' && (
              <div className="space-y-4 pt-2">
                <div className="p-4 bg-neutral-950/70 border border-neutral-800 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Grid3X3 className="w-4 h-4 text-emerald-400" />
                      <span>Shaxda Muuqaalka ee Baloodhada ({totalSummary.totalPlotsCount} Baloodh):</span>
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      Midab kastaa wuxuu muujinayaa dhaxalaha loo qoondeeyey
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
                    {Array.from({ length: totalSummary.totalPlotsCount }).map((_, idx) => {
                      // Determine which heir this plot nominally falls under by cumulative percentage
                      let cumSum = 0;
                      let assignedHeir = totalSummary.summaryPerHeir[0];
                      for (const h of totalSummary.summaryPerHeir) {
                        cumSum += h.totalPlotsReceived;
                        if (idx < Math.ceil(cumSum)) {
                          assignedHeir = h;
                          break;
                        }
                      }

                      const badgeStyle = getHeirColor(assignedHeir?.heirId || '');

                      return (
                        <div 
                          key={idx}
                          className="bg-neutral-900 border border-neutral-800 hover:border-emerald-500/50 p-2.5 rounded-xl flex flex-col justify-between h-24 transition-all group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold text-neutral-400 group-hover:text-white">
                              Plot #{idx + 1}
                            </span>
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          </div>

                          <div className="my-auto">
                            <span className={`block px-1.5 py-0.5 rounded text-[10px] font-semibold text-center truncate ${badgeStyle}`}>
                              {assignedHeir?.nameSomali || 'Dhaxal'}
                            </span>
                          </div>

                          <span className="text-[9px] text-neutral-500 text-center block">
                            Saamiga: {assignedHeir?.quranicFraction}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: PER-PARCEL DETAILED BREAKDOWN */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Faahfaahinta Goob Kasta oo Dhul ah ({parcels.length} Goobood)</span>
              </h3>
              
              {parcels.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400">Shaandhee Goobta:</span>
                  <select
                    value={selectedParcelId}
                    onChange={(e) => setSelectedParcelId(e.target.value)}
                    className="bg-neutral-900 border border-neutral-700 text-xs text-white rounded-lg px-2.5 py-1"
                  >
                    <option value="all">Dhammaan Goobaha ({parcels.length})</option>
                    {parcels.map(p => (
                      <option key={p.assetId} value={p.assetId}>
                        {p.assetTitle} ({p.totalPlots} {p.unit})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {displayedParcels.map((parcel) => (
              <div 
                key={parcel.assetId}
                className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg space-y-4"
              >
                {/* Parcel Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base font-bold text-white">{parcel.assetTitle}</h4>
                        {parcel.isUnvaluedLand && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Bilaa Qiimeyn Lacageed (Plots Kaliya)
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-800 text-neutral-300">
                          {parcel.tierName}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-neutral-400 mt-1">
                        <span>Goobta: <strong className="text-neutral-200">{parcel.location}</strong></span>
                        {parcel.plotSize && (
                          <span>Cabbirka: <strong className="text-neutral-200">{parcel.plotSize}</strong></span>
                        )}
                        {parcel.plotAreaSqM && (
                          <span>Muuqaalka: <strong className="text-emerald-400">{parcel.plotAreaSqM} m² / plot</strong></span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 bg-neutral-950 px-4 py-2 rounded-xl border border-neutral-800 text-right">
                    <div>
                      <span className="text-[10px] text-neutral-500 block">Wadarta Baloodhada:</span>
                      <span className="text-lg font-bold text-white font-mono">
                        {parcel.totalPlots} <span className="text-xs text-emerald-400 font-normal">{parcel.unit}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Parcel Allocation Table */}
                <div className="overflow-x-auto rounded-xl border border-neutral-800/80">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-neutral-950/80 border-b border-neutral-800 text-neutral-400 text-[11px] font-semibold">
                        <th className="py-2.5 px-3">Dhaxalaha</th>
                        <th className="py-2.5 px-3 text-center">Tirada</th>
                        <th className="py-2.5 px-3 text-center">Saamiga Sharciga</th>
                        <th className="py-2.5 px-3 text-right">Boqolkiiba</th>
                        <th className="py-2.5 px-3 text-center">Wadarta Goobtan</th>
                        <th className="py-2.5 px-3 text-left font-bold text-emerald-400 bg-emerald-950/20">
                          Qofkiiba Inta Baloodh ee uu Helay
                        </th>
                        {parcel.plotAreaSqM && (
                          <th className="py-2.5 px-3 text-right">Cabbirka m² Qofkiiba</th>
                        )}
                        <th className="py-2.5 px-3">Faahfaahinta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60 bg-neutral-950/30">
                      {parcel.heirAllocations.map((alloc) => (
                        <tr key={alloc.heirId} className="hover:bg-neutral-850/40 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-white">
                            <div>{alloc.nameSomali}</div>
                            <div className="text-[10px] text-neutral-500 font-arabic">{alloc.nameArabic}</div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-white">
                            {alloc.count}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300">
                              {alloc.quranicFraction}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-neutral-300">
                            {alloc.percentage.toFixed(2)}%
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-white">
                            {alloc.totalPlotsForGroup} {parcel.unit}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-400 bg-emerald-950/20">
                            {alloc.fractionalDisplay}
                          </td>
                          {parcel.plotAreaSqM && (
                            <td className="py-2.5 px-3 text-right font-mono text-neutral-200">
                              {alloc.approxSquareMetersPerPerson ? `${alloc.approxSquareMetersPerPerson.toLocaleString()} m²` : '-'}
                            </td>
                          )}
                          <td className="py-2.5 px-3 text-[11px] text-neutral-400">
                            {alloc.explanationSomali}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Parcel Note / Undivided Status */}
                <div className="flex items-center gap-2 text-xs text-neutral-300 bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/60">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{parcel.undividedNote}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  );
}
