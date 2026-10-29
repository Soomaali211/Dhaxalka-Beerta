import { InheritanceCalculationResult, HeirsInput, Currency } from '../types/inheritance';
import { 
  Users, 
  Settings2, 
  Scale, 
  BookOpen, 
  HelpCircle,
  ShieldAlert
} from 'lucide-react';

interface HeirTableViewProps {
  result: InheritanceCalculationResult;
  heirsInput: HeirsInput;
  currency: Currency;
  onOpenHeirConfig: () => void;
  onOpenQuranicRules: () => void;
}

export function HeirTableView({
  result,
  heirsInput,
  currency,
  onOpenHeirConfig,
  onOpenQuranicRules,
}: HeirTableViewProps) {
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

  return (
    <div className="space-y-6">
      
      {/* Top Banner with Action */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            <span>Diiwaanka Dhaxaleeyda Sharciga ah & Saamiyadooda</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Xisaabinta saamiyada qofkiiba iyo wadarta guud iyadoo la raacayo cilmiga Faraa'idka
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenQuranicRules}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Daliilada Quraanka</span>
          </button>
          <button
            onClick={onOpenHeirConfig}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Beddel Dhaxaleeyda</span>
          </button>
        </div>
      </div>

      {/* Primary Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-950/80 border-b border-neutral-800 text-neutral-400 uppercase text-[11px] font-semibold tracking-wider">
                <th className="py-3 px-4">Dhaxalaha (Heir)</th>
                <th className="py-3 px-3 text-center">Tirada</th>
                <th className="py-3 px-3 text-center">Saamiga Sharciga</th>
                <th className="py-3 px-3 text-center">Saamiga Saxitaanka</th>
                <th className="py-3 px-3 text-right">Boqolkiiba (%)</th>
                <th className="py-3 px-4 text-right">Wadarta Qaybta</th>
                <th className="py-3 px-4 text-right">Qofkiiba</th>
                <th className="py-3 px-4">Xeerka & Daliilka</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/80">
              {result.heirShares.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-neutral-400">
                    <Users className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                    <p className="font-semibold text-white">Dhaxaleey wali lama gelin (Foomku waa bannaan yahay).</p>
                    <p className="text-xs text-neutral-500 mt-1">Guji "Beddel Dhaxaleeyda" si aad u geliso ehelka dhaxlaya.</p>
                    <button 
                      onClick={onOpenHeirConfig} 
                      className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      + Gali Dhaxaleeyda Hadda
                    </button>
                  </td>
                </tr>
              ) : (
                result.heirShares.map((share, idx) => (
                  <tr key={idx} className="hover:bg-neutral-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{share.nameSomali}</div>
                      <div className="text-[11px] text-neutral-400 font-arabic">{share.nameArabic}</div>
                      {share.individualNames && share.individualNames.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {share.individualNames.map((pName, pIdx) => (
                            <span
                              key={pIdx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-[10px] font-medium text-emerald-300"
                            >
                              <span>👤 {pName}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-3 text-center font-mono-numbers text-neutral-300">
                      {share.count}
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      <span className="font-bold text-amber-400 bg-amber-950/40 border border-amber-500/20 px-2 py-0.5 rounded text-xs">
                        {share.quranicFraction}
                      </span>
                    </td>

                    <td className="py-3.5 px-3 text-center font-mono-numbers text-emerald-400 font-semibold">
                      {share.tashihShares} / {result.tashihBase}
                    </td>

                    <td className="py-3.5 px-3 text-right font-mono-numbers font-medium text-neutral-200">
                      {share.percentage.toFixed(2)}%
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono-numbers font-bold text-emerald-300 text-sm">
                      {formatMoney(share.totalAmountUSD)}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono-numbers text-neutral-300">
                      {formatMoney(share.perPersonAmountUSD)}
                    </td>

                    <td className="py-3.5 px-4 text-neutral-400 max-w-xs text-[11px]">
                      <p className="line-clamp-2" title={share.quranicProof}>
                        {share.quranicProof}
                      </p>
                    </td>
                  </tr>
                ))
              )}

              {/* Total row */}
              {result.heirShares.length > 0 && (
                <tr className="bg-neutral-950/90 font-bold border-t-2 border-emerald-500/40">
                  <td className="py-3.5 px-4 text-emerald-400">
                    WADARTA GUUD (TOTAL)
                  </td>
                  <td className="py-3.5 px-3 text-center font-mono-numbers text-white">
                    {result.heirShares.reduce((s, h) => s + h.count, 0)}
                  </td>
                  <td className="py-3.5 px-3 text-center text-amber-400 font-mono-numbers">
                    {result.isAwl ? `Cawl (${result.awlValue})` : '100%'}
                  </td>
                  <td className="py-3.5 px-3 text-center text-emerald-400 font-mono-numbers">
                    {result.tashihBase} / {result.tashihBase}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono-numbers text-white">
                    100.00%
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-numbers text-emerald-300 text-base">
                    {formatMoney(result.netDistributableEstateUSD)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-neutral-500">-</td>
                  <td className="py-3.5 px-4 text-neutral-400 text-[11px]">
                    Qaybta 100% ee hantida saafiga ah
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Blocked Heirs Detailed Section */}
      {result.blockedHeirs.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>Dhaxaleeyda la xannibay (Al-Hujub / باب الحجب):</span>
          </h3>
          <p className="text-xs text-neutral-400">
            Cilmiga dhaxalka, qaraabada qaarkood waxay xannibaan kuwa kale haddii ay nool yihiin (tusaale: wiilku wuxuu xannibaa wiilka uu dhalay iyo walaalaha; aabbuhu wuxuu xannibaa awoowaha iyo walaalaha).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {result.blockedHeirs.map((bh, idx) => (
              <div key={idx} className="bg-neutral-950 border border-rose-900/30 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-xs">{bh.nameSomali}</span>
                  <span className="text-[10px] text-rose-400 font-arabic">{bh.nameArabic}</span>
                </div>
                <div className="text-xs text-neutral-300 mt-1">
                  Waxaa xannibay: <strong className="text-emerald-400">{bh.blockedBy}</strong>
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5 italic">
                  {bh.rule}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
