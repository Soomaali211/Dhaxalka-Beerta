import { InheritanceCalculationResult, Currency, HeirsInput } from '../types/inheritance';
import { 
  Building2, 
  Receipt, 
  Scale, 
  Coins, 
  AlertTriangle,
  ArrowRight
} from 'lucide-react';

interface EstateSummaryBarProps {
  result: InheritanceCalculationResult;
  currency: Currency;
  heirsInput: HeirsInput;
  onOpenAssets: () => void;
  onOpenHeirs: () => void;
}

export function EstateSummaryBar({
  result,
  currency,
  heirsInput,
  onOpenAssets,
  onOpenHeirs,
}: EstateSummaryBarProps) {
  const formatMoney = (amount: number) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency === 'SLSH' ? 'SOS' : currency,
        maximumFractionDigits: 0,
      })
        .format(amount)
        .replace('SOS', currency === 'SLSH' ? 'Sl.Sh' : 'Sh.So');
    } catch {
      return `${currency} ${Math.round(amount).toLocaleString()}`;
    }
  };

  const totalDeductions = result.totalFuneralUSD + result.totalDebtsUSD + result.totalWasiyyahUSD;

  return (
    <div className="bg-neutral-900 border-b border-neutral-800 py-3.5 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        
        {/* Estate breakdown flow */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
          
          {/* Gross Estate */}
          <div className="cursor-pointer group" onClick={onOpenAssets}>
            <div className="text-[11px] text-neutral-400 font-medium flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-neutral-500 group-hover:text-emerald-400 transition-colors" />
              <span>Hantida Guud</span>
            </div>
            <div className="text-base sm:text-lg font-bold text-white font-mono-numbers tracking-tight mt-0.5 group-hover:text-emerald-300 transition-colors">
              {formatMoney(result.grossEstateUSD)}
            </div>
            <div className="text-[10px] text-neutral-500">
              Guryo, Bangi, Xoolo & Dahab
            </div>
          </div>

          {/* Deductions */}
          <div className="cursor-pointer group" onClick={onOpenAssets}>
            <div className="text-[11px] text-neutral-400 font-medium flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-rose-400/80" />
              <span>Kharash & Deymo</span>
            </div>
            <div className="text-base sm:text-lg font-bold text-rose-400 font-mono-numbers tracking-tight mt-0.5">
              -{formatMoney(totalDeductions)}
            </div>
            <div className="text-[10px] text-neutral-500">
              Aaska, Deynta & Dardaaranka
            </div>
          </div>

          {/* Net Distributable Tarkah */}
          <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-lg p-2 sm:col-span-1">
            <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Hantida Saafiga ah</span>
            </div>
            <div className="text-base sm:text-lg font-extrabold text-emerald-300 font-mono-numbers tracking-tight mt-0.5">
              {formatMoney(result.netDistributableEstateUSD)}
            </div>
            <div className="text-[10px] text-emerald-500/80">
              Tarkada la qaybinayo
            </div>
          </div>

          {/* Shariah Base Calculation */}
          <div className="cursor-pointer group" onClick={onOpenHeirs}>
            <div className="text-[11px] text-neutral-400 font-medium flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-amber-400/80" />
              <span>Asalka Mas'alada</span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base sm:text-lg font-bold text-amber-400 font-mono-numbers">
                {result.isAwl ? `${result.aslAlMasalah} → ${result.awlValue}` : result.aslAlMasalah}
              </span>
              <span className="text-xs text-neutral-400 font-mono-numbers">
                (Saxid: {result.tashihBase})
              </span>
            </div>
            <div className="text-[10px] text-neutral-500">
              {result.isAwl ? 'Xaalad Cawl ah' : result.isRadd ? 'Xaalad Radd ah' : 'Xaalad Caadil ah'}
            </div>
          </div>

        </div>

        {/* Deceased info & Heirs count summary */}
        <div className="flex items-center justify-between lg:justify-end gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-neutral-800">
          <div className="text-right">
            <div className="text-xs text-white font-medium">
              {heirsInput.deceasedName || 'Marxuumka'}
            </div>
            <div className="text-[11px] text-neutral-400 flex items-center gap-1 justify-end">
              <span>{heirsInput.deceasedGender === 'male' ? 'Ninka dhintay' : 'Haweeneyda dhimatay'}</span>
              <span>·</span>
              <span className="text-emerald-400 font-medium">
                {result.heirShares.length} koox oo dhaxlaya
              </span>
            </div>
          </div>

          <button
            onClick={onOpenHeirs}
            className="p-1.5 text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
            title="Wax ka beddel dhaxaleeyda"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* Warning if wasiyyah exceeded 1/3 cap */}
      {result.wasiyyahExceededCap && (
        <div className="max-w-7xl mx-auto mt-2 bg-amber-950/40 border border-amber-600/30 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>Ogeysiis Shariici ah:</strong> Dardaaranka la codsaday wuxuu ka batay saddex meelood hal meel (1/3) hantida ka soo hartay deymaha. Sida ku cad shareecada Islaamka (Xadiiskii Sacad bin Abii Waqaas), dardaaranka waxaa lagu soo koobay xadkiisa ugu sarreeya ee sharciga ah ({formatMoney(result.maxAllowableWasiyyahUSD)}).
          </span>
        </div>
      )}
    </div>
  );
}
