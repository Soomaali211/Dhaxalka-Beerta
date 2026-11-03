import { useMemo } from 'react';
import {
  InheritanceCalculationResult,
  HeirsInput,
  EstateAssetItem,
  EstateDeductionItem,
  Currency,
} from '../types/inheritance';
import {
  CaseExportMetadata,
  FairLandAllocationResult,
  SubdivisionComputationResult,
} from '../types/landSubdivision';
import { HALF_PLOT_STATUS_METADATA } from '../utils/halfPlotGeometryEngine';
import { calculateTotalUnvaluedPlotSummary } from '../utils/plotDistributor';
import { calculateComprehensiveEstateDistribution } from '../utils/estateAssetDistributionEngine';
import { formatPlotQtyCompact, summarizePlotIdsCompact } from '../utils/landSubdivisionEngine';
import {
  Printer,
  X,
  FileCheck,
  Download,
} from 'lucide-react';
import { InteractivePanZoomViewport } from './InteractivePanZoomViewport';

interface OfficialCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: InheritanceCalculationResult;
  heirsInput: HeirsInput;
  assets: EstateAssetItem[];
  deductions: EstateDeductionItem[];
  currency: Currency;
  linkedLandAllocation?: FairLandAllocationResult | null;
  subdivisionResult?: SubdivisionComputationResult | null;
  caseMeta?: CaseExportMetadata;
  onPrint: () => void;
  onExportExcel: () => void;
}

export function OfficialCertificateModal({
  isOpen,
  onClose,
  result,
  heirsInput,
  assets,
  currency,
  linkedLandAllocation,
  subdivisionResult,
  caseMeta,
  onPrint,
  onExportExcel,
}: OfficialCertificateModalProps) {
  const printableMapProjection = useMemo(() => {
    if (!subdivisionResult) return null;
    const hasBoundary = subdivisionResult.bring.length > 0;
    const hasBlocks = subdivisionResult.blocks.length > 0;
    if (!hasBoundary && !hasBlocks) return null;

    let minE = Infinity;
    let maxE = -Infinity;
    let minN = Infinity;
    let maxN = -Infinity;

    const visitPt = (pt: [number, number]) => {
      if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return;
      if (pt[0] < minE) minE = pt[0];
      if (pt[0] > maxE) maxE = pt[0];
      if (pt[1] < minN) minN = pt[1];
      if (pt[1] > maxN) maxN = pt[1];
    };

    subdivisionResult.bring.forEach(visitPt);
    subdivisionResult.blocks.forEach((blk) => blk.rect.forEach(visitPt));

    if (!Number.isFinite(minE) || !Number.isFinite(minN)) return null;

    const spanE = Math.max(maxE - minE, 10);
    const spanN = Math.max(maxN - minN, 10);
    const svgW = 780;
    const svgH = 360;
    const pad = 24;
    const scale = Math.min((svgW - pad * 2) / spanE, (svgH - pad * 2) / spanN);
    const offsetX = (svgW - spanE * scale) / 2;
    const offsetY = (svgH - spanN * scale) / 2;

    const toSvg = (pt: [number, number]): [number, number] => [
      +(offsetX + (pt[0] - minE) * scale).toFixed(2),
      +(svgH - offsetY - (pt[1] - minN) * scale).toFixed(2),
    ];

    const ringToPointsAttr = (ring: [number, number][]) =>
      ring
        .map((pt) => {
          const [sx, sy] = toSvg(pt);
          return `${sx},${sy}`;
        })
        .join(' ');

    return {
      svgW,
      svgH,
      toSvg,
      ringToPointsAttr,
      spanE: Math.round(spanE),
      spanN: Math.round(spanN),
    };
  }, [subdivisionResult]);

  if (!isOpen) return null;

  const formatMoney = (amount: number) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency === 'SLSH' ? 'SOS' : currency,
        maximumFractionDigits: 2,
      })
        .format(amount)
        .replace('SOS', currency === 'SLSH' ? 'Sl.Sh' : 'Sh.So');
    } catch {
      return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
  };

  let currentDate = new Date().toISOString().slice(0, 10);
  try {
    currentDate = new Date().toLocaleDateString('so-SO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    // keep ISO fallback
  }

  const plotSummary = calculateTotalUnvaluedPlotSummary(assets, result, heirsInput);
  const comprehensiveDist = calculateComprehensiveEstateDistribution(assets, result, heirsInput, currency);

  const halfSummary = subdivisionResult?.halfPlotSummary || null;
  const clippedAndEvaluatedPlots = (subdivisionResult?.allEvaluatedPlots || []).filter(
    (p) =>
      p.halfPlotValidation &&
      p.halfPlotValidation.validationStatus !== 'full_inside' &&
      p.halfPlotValidation.validationStatus !== 'full_outside'
  );

  const caseNameDisplay =
    caseMeta?.caseName ||
    (heirsInput.deceasedName ? `Kiiska ${heirsInput.deceasedName}` : 'Kiis Dhaxal oo Rasmi ah');
  const referenceNumberDisplay = caseMeta?.referenceNumber || 'KIIS-REF-0001';
  const caseDateDisplay = caseMeta?.caseDate || currentDate;
  const caseStatusDisplay = caseMeta?.caseStatus || 'Socda';

  let sectionNum = 1;

  return (
    <div
      className="print-certificate-overlay fixed inset-0 z-[1100] flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Shahaadada Rasmiga ah ee Dhaxalka"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="print-certificate-container bg-[#0B1220] border border-[#243449] rounded-2xl w-full max-w-4xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[88dvh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Sticky Compact Modal Controls Bar (Hidden during print) */}
        <div className="px-4 py-2.5 border-b border-[#243449] flex items-center justify-between gap-2.5 bg-[#0F1B2D] shrink-0 no-print">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
              <FileCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-bold text-[#F8FAFC] truncate">
                Shahaadada Rasmiga ah · {referenceNumberDisplay}
              </span>
              <span className="block text-[11px] text-[#94A3B8] truncate">
                {caseNameDisplay}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onPrint}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#030712] bg-[#10B981] hover:bg-[#059669] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span>Daabac / PDF</span>
            </button>
            <button
              type="button"
              onClick={onExportExcel}
              title="Soo dejiso Excel"
              aria-label="Soo dejiso Excel"
              className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#F8FAFC] bg-[#0B1220] border border-[#243449] hover:border-[#10B981]/60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
              <span className="hidden sm:inline">Excel</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] rounded-xl hover:bg-[#0B1220] transition-colors cursor-pointer"
              aria-label="Xidh"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Document Body (Crisp white A4 paper layout) */}
        <div className="print-certificate-body p-4 sm:p-7 overflow-y-auto overscroll-contain flex-1 min-h-0 bg-white text-neutral-900 font-sans print:p-0">
          {/* Document Header */}
          <div className="text-center border-b-2 border-neutral-900 pb-5 mb-5">
            <div className="text-xl font-bold font-arabic text-neutral-800 my-1">
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-neutral-900 mt-1.5">
              SHAHUURADA &amp; BAAQA QAYBINTA DHAXALKA SHARCIGA AH
            </h1>
            <p className="text-xs text-neutral-600 font-arabic mt-0.5">
              وثيقة حصر الإرث وتوزيع التركة الشرعية وتقسيم الأراضي طبقاً لأحكام الشريعة الإسلامية
            </p>
            <div className="mt-2.5 text-xs text-neutral-700 font-mono tabular-nums">
              <span>Tixraaca Kiiska: <strong>{referenceNumberDisplay}</strong></span>
              <span className="mx-2">·</span>
              <span>Magaca Kiiska: <strong>{caseNameDisplay}</strong></span>
              <span className="mx-2">·</span>
              <span>Xaaladda: <strong>{caseStatusDisplay}</strong></span>
            </div>
          </div>

          {/* Case & Deceased Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-neutral-50 border border-neutral-200 rounded-lg p-4 mb-6 text-xs">
            <div>
              <div className="text-neutral-500 font-medium">Aqoonsiga Kiiska:</div>
              <div className="font-bold text-sm text-neutral-900 mt-0.5">
                {caseNameDisplay}
              </div>
              <div className="text-neutral-600 mt-1 font-mono tabular-nums">
                Ref: <strong>{referenceNumberDisplay}</strong> · {caseStatusDisplay}
              </div>
            </div>

            <div>
              <div className="text-neutral-500 font-medium">Magaca Marxuumka:</div>
              <div className="font-bold text-sm text-neutral-900 mt-0.5">
                {heirsInput.deceasedName || 'Marxuumka'}
              </div>
              <div className="text-neutral-600 mt-1">
                Jinsiga:{' '}
                <strong>
                  {heirsInput.deceasedGender === 'male' ? 'Lab (Rag)' : 'Dheddig (Dumar)'}
                </strong>
              </div>
            </div>

            <div className="sm:text-right">
              <div className="text-neutral-500 font-medium">Taariikhda Kiiska &amp; Warbixinta:</div>
              <div className="font-bold text-sm text-neutral-900 mt-0.5 font-mono tabular-nums">
                {caseDateDisplay}
              </div>
              <div className="text-neutral-600 mt-1">
                Lacagta Qiyaasta: <strong>{currency}</strong>
              </div>
            </div>
          </div>

          {/* Section 1: Financial Summary */}
          <div className="mb-6">
            <h2 className="text-xs font-bold tracking-wider text-neutral-800 border-b border-neutral-300 pb-1 mb-3">
              {sectionNum++}. Xisaab-xidhka Hantida &amp; Xuquuqda ka horreysa Dhaxalka
            </h2>
            <div className="grid grid-cols-4 gap-3 text-xs text-center">
              <div className="p-2.5 bg-neutral-50 border border-neutral-200 rounded">
                <div className="text-neutral-500 text-[11px]">Hantida Guud (Gross)</div>
                <div className="font-bold font-mono tabular-nums text-neutral-900 text-sm mt-0.5">
                  {formatMoney(result.grossEstateUSD)}
                </div>
              </div>
              <div className="p-2.5 bg-neutral-50 border border-neutral-200 rounded">
                <div className="text-neutral-500 text-[11px]">Aaska &amp; Deymaha</div>
                <div className="font-bold font-mono tabular-nums text-neutral-900 text-sm mt-0.5">
                  -{formatMoney(result.totalFuneralUSD + result.totalDebtsUSD)}
                </div>
              </div>
              <div className="p-2.5 bg-neutral-50 border border-neutral-200 rounded">
                <div className="text-neutral-500 text-[11px]">Dardaaranka (Wasiyyah)</div>
                <div className="font-bold font-mono tabular-nums text-neutral-900 text-sm mt-0.5">
                  -{formatMoney(result.totalWasiyyahUSD)}
                </div>
              </div>
              <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded">
                <div className="text-emerald-800 font-bold text-[11px]">Hantida Saafiga ah (Tarkah)</div>
                <div className="font-bold font-mono tabular-nums text-emerald-900 text-sm mt-0.5">
                  {formatMoney(result.netDistributableEstateUSD)}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Heirs Shares Table */}
          <div className="mb-6">
            <h2 className="text-xs font-bold tracking-wider text-neutral-800 border-b border-neutral-300 pb-1 mb-3 flex items-center justify-between">
              <span>{sectionNum++}. Shaxda Saami-Qaybsiga Dhaxaleeyda Sharciga ah</span>
              <span className="text-[11px] font-normal text-neutral-600 font-mono tabular-nums">
                Asalka: <strong>{result.aslAlMasalah}</strong> · Saxidda (Tashih):{' '}
                <strong>{result.tashihBase}</strong>
              </span>
            </h2>

            <table className="w-full border-collapse border border-neutral-300 text-xs">
              <thead>
                <tr className="bg-neutral-100 text-neutral-700">
                  <th className="border border-neutral-300 px-3 py-2 text-left">Dhaxalaha</th>
                  <th className="border border-neutral-300 px-2 py-2 text-center">Tirada</th>
                  <th className="border border-neutral-300 px-2 py-2 text-center">Saamiga Sharciga</th>
                  <th className="border border-neutral-300 px-2 py-2 text-center">Tashih</th>
                  <th className="border border-neutral-300 px-2 py-2 text-right">Boqolkiiba</th>
                  <th className="border border-neutral-300 px-3 py-2 text-right">Wadarta Qaybta</th>
                  <th className="border border-neutral-300 px-3 py-2 text-right">Qofkiiba</th>
                </tr>
              </thead>
              <tbody>
                {result.heirShares.map((share, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50">
                    <td className="border border-neutral-300 px-3 py-2 font-medium">
                      <div>{share.nameSomali}</div>
                      <div className="text-[10px] text-neutral-500 font-arabic">{share.nameArabic}</div>
                    </td>
                    <td className="border border-neutral-300 px-2 py-2 text-center font-mono tabular-nums">
                      {share.count}
                    </td>
                    <td className="border border-neutral-300 px-2 py-2 text-center font-bold font-mono tabular-nums text-neutral-800">
                      {share.quranicFraction}
                    </td>
                    <td className="border border-neutral-300 px-2 py-2 text-center font-mono tabular-nums">
                      {share.tashihShares}
                    </td>
                    <td className="border border-neutral-300 px-2 py-2 text-right font-mono tabular-nums">
                      {share.percentage.toFixed(2)}%
                    </td>
                    <td className="border border-neutral-300 px-3 py-2 text-right font-bold font-mono tabular-nums">
                      {formatMoney(share.totalAmountUSD)}
                    </td>
                    <td className="border border-neutral-300 px-3 py-2 text-right font-mono tabular-nums">
                      {formatMoney(share.perPersonAmountUSD)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-neutral-100 font-bold">
                  <td className="border border-neutral-300 px-3 py-2">WADARTA GUUD (100%)</td>
                  <td className="border border-neutral-300 px-2 py-2 text-center font-mono tabular-nums">
                    {result.heirShares.reduce((s, h) => s + h.count, 0)}
                  </td>
                  <td className="border border-neutral-300 px-2 py-2 text-center font-mono tabular-nums">
                    {result.isAwl ? `Cawl (${result.awlValue})` : 'Kaamil'}
                  </td>
                  <td className="border border-neutral-300 px-2 py-2 text-center font-mono tabular-nums">
                    {result.tashihBase}
                  </td>
                  <td className="border border-neutral-300 px-2 py-2 text-right font-mono tabular-nums">
                    100.00%
                  </td>
                  <td className="border border-neutral-300 px-3 py-2 text-right font-mono tabular-nums text-emerald-800">
                    {formatMoney(result.netDistributableEstateUSD)}
                  </td>
                  <td className="border border-neutral-300 px-3 py-2 text-right">-</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section: Unvalued Land Plot Distribution */}
          {plotSummary.totalPlotsCount > 0 && (
            <div className="mb-6">
              <h2 className="text-xs font-bold tracking-wider text-neutral-800 border-b border-neutral-300 pb-1 mb-3 flex items-center justify-between">
                <span>{sectionNum++}. Qaybinta Dhulka &amp; Baloodhada (Aan Lacag ku Qiimaysnayn)</span>
                <span className="text-[11px] font-normal text-neutral-600 font-mono tabular-nums">
                  Wadarta: <strong>{plotSummary.totalPlotsCount} Baloodh</strong> (
                  {plotSummary.totalUnvaluedPlotsCount} Plots Sidooda ah)
                </span>
              </h2>

              <table className="w-full border-collapse border border-neutral-300 text-xs">
                <thead>
                  <tr className="bg-neutral-100 text-neutral-700">
                    <th className="border border-neutral-300 px-3 py-2 text-left">Dhaxalaha</th>
                    <th className="border border-neutral-300 px-2 py-2 text-center">Tirada</th>
                    <th className="border border-neutral-300 px-2 py-2 text-center">Saamiga Quraanka</th>
                    <th className="border border-neutral-300 px-2 py-2 text-right">Boqolkiiba</th>
                    <th className="border border-neutral-300 px-3 py-2 text-center">Wadarta Baloodhada</th>
                    <th className="border border-neutral-300 px-3 py-2 text-left font-bold text-emerald-800 bg-emerald-50">
                      Qofkiiba Inta Baloodh ee uu Helay
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plotSummary.summaryPerHeir.map((h, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50">
                      <td className="border border-neutral-300 px-3 py-2 font-medium">
                        <div>{h.nameSomali}</div>
                        <div className="text-[10px] text-neutral-500 font-arabic">{h.nameArabic}</div>
                      </td>
                      <td className="border border-neutral-300 px-2 py-2 text-center font-mono tabular-nums">
                        {h.count}
                      </td>
                      <td className="border border-neutral-300 px-2 py-2 text-center font-bold font-mono tabular-nums">
                        {h.quranicFraction}
                      </td>
                      <td className="border border-neutral-300 px-2 py-2 text-right font-mono tabular-nums">
                        {h.percentage.toFixed(2)}%
                      </td>
                      <td className="border border-neutral-300 px-3 py-2 text-center font-bold font-mono tabular-nums">
                        {h.totalPlotsReceived} Baloodh
                      </td>
                      <td className="border border-neutral-300 px-3 py-2 font-bold font-mono tabular-nums text-emerald-900 bg-emerald-50">
                        {h.displayPerPerson}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Section: Comprehensive Asset Distribution */}
          <div className="mb-6">
            <h2 className="text-xs font-bold tracking-wider text-neutral-800 border-b border-neutral-300 pb-1 mb-3 flex items-center justify-between">
              <span>{sectionNum++}. Qaybinta Tooska ah: Dhul, Lacag, Xoolo &amp; Heerarka Hantida</span>
              <span className="text-[11px] font-normal text-neutral-600">
                {comprehensiveDist.estateTierLevelDescription}
              </span>
            </h2>

            <table className="w-full border-collapse border border-neutral-300 text-xs">
              <thead>
                <tr className="bg-neutral-100 text-neutral-700">
                  <th className="border border-neutral-300 px-3 py-2 text-left">Dhaxalaha</th>
                  <th className="border border-neutral-300 px-2 py-2 text-center">Saamiga</th>
                  <th className="border border-neutral-300 px-3 py-2 text-left bg-blue-50/50">Dhulka (Plots)</th>
                  <th className="border border-neutral-300 px-3 py-2 text-left bg-emerald-50/50">Lacagta</th>
                  <th className="border border-neutral-300 px-3 py-2 text-left bg-amber-50/50">Xoolaha</th>
                  <th className="border border-neutral-300 px-3 py-2 text-left bg-purple-50/50">Heerka Hantida</th>
                </tr>
              </thead>
              <tbody>
                {comprehensiveDist.heirAllocations.map((h, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50">
                    <td className="border border-neutral-300 px-3 py-2 font-medium">
                      <div>
                        {h.nameSomali} ({h.count})
                      </div>
                    </td>
                    <td className="border border-neutral-300 px-2 py-2 text-center font-bold font-mono tabular-nums text-neutral-800">
                      {h.quranicFraction}
                    </td>
                    <td className="border border-neutral-300 px-3 py-2 bg-blue-50/20 font-mono tabular-nums">
                      {comprehensiveDist.totalLandPlots > 0 ? (
                        <div>
                          <strong className="text-neutral-900">{h.land.displayPerPerson}</strong>
                          {h.land.sqMPerPerson && (
                            <div className="text-[10px] text-neutral-500">
                              ~{h.land.sqMPerPerson.toLocaleString()} m²
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-neutral-400 italic text-[11px]">-</span>
                      )}
                    </td>
                    <td className="border border-neutral-300 px-3 py-2 bg-emerald-50/20 font-mono tabular-nums">
                      {comprehensiveDist.totalMoneyUSD > 0 ? (
                        <div>
                          <strong className="text-neutral-900">
                            {formatMoney(h.money.moneyPerPersonUSD)}
                          </strong>
                          <div className="text-[10px] text-neutral-500">Qofkiiba</div>
                        </div>
                      ) : (
                        <span className="text-neutral-400 italic text-[11px]">-</span>
                      )}
                    </td>
                    <td className="border border-neutral-300 px-3 py-2 bg-amber-50/20 font-mono tabular-nums">
                      {comprehensiveDist.totalLivestockHeads > 0 ? (
                        <div>
                          <strong className="text-neutral-900">{h.livestock.displayPerPerson}</strong>
                          <div className="text-[10px] text-neutral-500">
                            Kooxda: {h.livestock.totalHeadsForGroup} Neef
                          </div>
                        </div>
                      ) : (
                        <span className="text-neutral-400 italic text-[11px]">-</span>
                      )}
                    </td>
                    <td className="border border-neutral-300 px-3 py-2 bg-purple-50/20 text-[11px]">
                      {h.tierBreakdown.tier1Prime.descriptionSomali !== 'Qayb kuma laha heerkan' && (
                        <div>H1: {h.tierBreakdown.tier1Prime.descriptionSomali}</div>
                      )}
                      {h.tierBreakdown.tier2Standard.descriptionSomali !== 'Qayb kuma laha heerkan' && (
                        <div>H2: {h.tierBreakdown.tier2Standard.descriptionSomali}</div>
                      )}
                      {!h.tierBreakdown.tier1Prime.plotsPerPerson &&
                        !h.tierBreakdown.tier2Standard.plotsPerPerson && (
                          <span className="text-neutral-500 italic">
                            Saamiga guud ee {h.quranicFraction}
                          </span>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section: Individual Named Heirs */}
          <div className="mb-6">
            <h2 className="text-xs font-bold tracking-wider text-neutral-800 border-b border-neutral-300 pb-1 mb-3 flex items-center justify-between">
              <span>
                {sectionNum++}. Diiwaanka Ugu Dambeeya ee Qofkasta Magaciisa &amp; Saamigiisa
              </span>
              <span className="text-[11px] font-normal text-neutral-600 font-mono tabular-nums">
                Wadarta: <strong>{comprehensiveDist.allIndividualHeirs.length} Qof</strong>
              </span>
            </h2>

            <table className="w-full border-collapse border border-neutral-300 text-xs">
              <thead>
                <tr className="bg-neutral-100 text-neutral-700">
                  <th className="border border-neutral-300 px-2 py-2 text-center w-8">#</th>
                  <th className="border border-neutral-300 px-3 py-2 text-left">Magaca Qofka Dhaxlaya</th>
                  <th className="border border-neutral-300 px-2 py-2 text-left">Xiriirka / Doorka</th>
                  <th className="border border-neutral-300 px-2 py-2 text-center">Saamiga (%)</th>
                  <th className="border border-neutral-300 px-2.5 py-2 text-left bg-blue-50/50">
                    Dhulka (Plots)
                  </th>
                  <th className="border border-neutral-300 px-2.5 py-2 text-left bg-emerald-50/50">
                    Lacagta
                  </th>
                  <th className="border border-neutral-300 px-2.5 py-2 text-left bg-amber-50/50">
                    Xoolaha
                  </th>
                  <th className="border border-neutral-300 px-2.5 py-2 text-right font-bold">
                    Qiimaha Qofka
                  </th>
                </tr>
              </thead>
              <tbody>
                {comprehensiveDist.allIndividualHeirs.map((ind, i) => (
                  <tr key={`${ind.heirGroupId}-${ind.personIndex}-${i}`} className="hover:bg-neutral-50">
                    <td className="border border-neutral-300 px-2 py-2 text-center font-mono tabular-nums text-neutral-500">
                      {i + 1}
                    </td>
                    <td className="border border-neutral-300 px-3 py-2 font-bold text-neutral-900">
                      {ind.personName}
                    </td>
                    <td className="border border-neutral-300 px-2 py-2 text-neutral-700">
                      <div>{ind.roleTitleSomali}</div>
                      <div className="text-[10px] text-neutral-500 font-arabic">{ind.roleTitleArabic}</div>
                    </td>
                    <td className="border border-neutral-300 px-2 py-2 text-center font-mono tabular-nums">
                      {ind.individualPercentage.toFixed(2)}%
                    </td>
                    <td className="border border-neutral-300 px-2.5 py-2 bg-blue-50/20 font-medium font-mono tabular-nums">
                      {comprehensiveDist.totalLandPlots > 0 ? ind.landDisplay : '-'}
                    </td>
                    <td className="border border-neutral-300 px-2.5 py-2 bg-emerald-50/20 font-mono tabular-nums font-semibold">
                      {comprehensiveDist.totalMoneyUSD > 0 ? formatMoney(ind.moneyAmountUSD) : '-'}
                    </td>
                    <td className="border border-neutral-300 px-2.5 py-2 bg-amber-50/20 font-medium font-mono tabular-nums">
                      {comprehensiveDist.totalLivestockHeads > 0 ? ind.livestockDisplay : '-'}
                    </td>
                    <td className="border border-neutral-300 px-2.5 py-2 text-right font-mono tabular-nums font-bold text-emerald-900">
                      {result.netDistributableEstateUSD > 0
                        ? formatMoney(ind.totalEstimatedValueUSD)
                        : comprehensiveDist.totalLandPlots > 0
                        ? ind.landDisplay
                        : comprehensiveDist.totalLivestockHeads > 0
                        ? ind.livestockDisplay
                        : `${ind.individualPercentage.toFixed(2)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section: Printable Vector GIS Map, Legend & Block/Plot/Half-Plot Dimensions */}
          {subdivisionResult && printableMapProjection && (
            <div className="mb-6 break-inside-avoid">
              <h2 className="text-xs font-bold tracking-wider text-neutral-800 border-b border-neutral-300 pb-1 mb-2.5 flex items-center justify-between gap-2">
                <span>
                  {sectionNum++}. Khariidadda Rasmiga ah ee Naqshadda Beerta, Blocks, Plots &amp; Half Plots
                </span>
                  <span className="text-[11px] font-normal text-neutral-600 font-mono tabular-nums">
                    UTM Zone {subdivisionResult.zone}
                    {subdivisionResult.south ? 'S' : 'N'} · {subdivisionResult.blocks.length} Block ·{' '}
                    {linkedLandAllocation
                      ? `${linkedLandAllocation.totalFullPlots} Plot La Qaybinayo${
                          (linkedLandAllocation.excludedPlotsCount ?? 0) > 0
                            ? ` · ${linkedLandAllocation.excludedPlotsCount} Plot Laga Reebay`
                            : ''
                        }`
                      : `${subdivisionResult.plots.length} Plot Buuxa`}{' '}
                    · {halfSummary?.validHalfPlotsCount || 0} Half Plot Sax ah
                  </span>
                </h2>

              <div className="border border-neutral-300 rounded-lg overflow-hidden bg-slate-50">
                <InteractivePanZoomViewport
                  initialAlign="center"
                  className="h-[300px] sm:h-[380px] bg-slate-100 print:h-auto print:bg-white"
                >
                  <div className="w-[min(740px,calc(100vw-3rem))] sm:w-[740px] print:!w-full bg-white shadow-xs print:shadow-none">
                <svg
                  viewBox={`0 0 ${printableMapProjection.svgW} ${printableMapProjection.svgH}`}
                  className="w-full h-auto block bg-white"
                  role="img"
                  aria-label="Khariidadda Naqshadda Blocks, Plots iyo Half Plots"
                >
                  <defs>
                    <pattern
                      id="cert-outside-hatch"
                      width="6"
                      height="6"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(45)"
                    >
                      <line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" strokeWidth="1.5" />
                    </pattern>
                    <pattern
                      id="cert-excluded-hatch"
                      width="6"
                      height="6"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(-45)"
                    >
                      <rect width="6" height="6" fill="#ffe4e6" />
                      <line x1="0" y1="0" x2="0" y2="6" stroke="#be123c" strokeWidth="1.8" />
                    </pattern>
                  </defs>

                  {/* Farm Boundary Background */}
                  {subdivisionResult.bring.length >= 3 && (
                    <polygon
                      points={printableMapProjection.ringToPointsAttr(subdivisionResult.bring)}
                      fill="#f8fafc"
                      stroke="none"
                    />
                  )}

                  {/* All Evaluated Plots (Full Inside, Excluded, Clipped Inside/Outside, Half Plots) */}
                  {(subdivisionResult.allEvaluatedPlots || subdivisionResult.plots).map((plot) => {
                    const hv = plot.halfPlotValidation;
                    const status = hv?.validationStatus || (plot.full ? 'full_inside' : 'full_outside');

                    if (status === 'full_outside') {
                      return (
                        <polygon
                          key={`cert-p-out-${plot.id}`}
                          points={printableMapProjection.ringToPointsAttr(plot.rect)}
                          fill="url(#cert-outside-hatch)"
                          fillOpacity={0.35}
                          stroke="#cbd5e1"
                          strokeWidth={0.45}
                        />
                      );
                    }

                    const assign = linkedLandAllocation?.plotAssignments[plot.id];
                    const isExcludedPlot =
                      status === 'full_inside' &&
                      (assign?.assignmentType === 'excluded' || Boolean(assign?.isExcluded));

                    const statusMeta = HALF_PLOT_STATUS_METADATA[status];
                    const insideRings =
                      hv && hv.insideRingsUtm.length > 0 ? hv.insideRingsUtm : [plot.rect];
                    const outsideRings = hv?.outsideRingsUtm || [];
                    const [px, py] = printableMapProjection.toSvg(plot.centerUtm);

                    return (
                      <g key={`cert-p-${plot.id}`}>
                        {/* Outside clipped portion */}
                        {outsideRings.map((oRing, oi) => (
                          <polygon
                            key={`cert-po-${plot.id}-${oi}`}
                            points={printableMapProjection.ringToPointsAttr(oRing)}
                            fill="url(#cert-outside-hatch)"
                            fillOpacity={0.55}
                            stroke="#94a3b8"
                            strokeWidth={0.5}
                            strokeDasharray="2 1.5"
                          />
                        ))}

                        {/* Inside portion */}
                        {insideRings.map((iRing, ii) => (
                          <polygon
                            key={`cert-pi-${plot.id}-${ii}`}
                            points={printableMapProjection.ringToPointsAttr(iRing)}
                            fill={isExcludedPlot ? 'url(#cert-excluded-hatch)' : statusMeta.fillHex}
                            fillOpacity={isExcludedPlot ? 0.95 : status === 'full_inside' ? 0.55 : 0.78}
                            stroke={isExcludedPlot ? '#9f1239' : statusMeta.strokeHex}
                            strokeWidth={isExcludedPlot ? 1.05 : status === 'full_inside' ? 0.55 : 0.95}
                            strokeDasharray={isExcludedPlot ? '2.5 1.5' : undefined}
                          />
                        ))}

                        {/* Individual Excluded Plot Special Name Callout */}
                        {isExcludedPlot && assign?.excludedScope === 'plot' && assign?.excludedSpecialName && (
                          <text
                            x={px}
                            y={py}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize="5.2"
                            fontWeight="800"
                            fill="#881337"
                            stroke="#ffffff"
                            strokeWidth="1.6"
                            paintOrder="stroke"
                          >
                            {assign.excludedSpecialName}
                          </text>
                        )}

                        {/* Exact Verified Half Plot Rectangle (12x18m or 9x24m) */}
                        {hv?.inscribedHalfPlotRectUtm && hv.inscribedHalfPlotRectUtm.length >= 3 && (
                          <polygon
                            points={printableMapProjection.ringToPointsAttr(hv.inscribedHalfPlotRectUtm)}
                            fill="none"
                            stroke="#0369a1"
                            strokeWidth={1.15}
                            strokeDasharray="2.5 1.5"
                          />
                        )}
                      </g>
                    );
                  })}

                  {/* Block Outlines & Centered Block / Excluded Special Name Labels */}
                  {subdivisionResult.blocks.map((blk) => {
                    const [cx, cy] = printableMapProjection.toSvg(blk.centerUtm);
                    const exclBlk = (linkedLandAllocation?.excludedBlocks ?? []).find(
                      (eb) => eb.blockId === blk.id
                    );
                    return (
                      <g key={`cert-blk-${blk.id}`}>
                        <polygon
                          points={printableMapProjection.ringToPointsAttr(blk.rect)}
                          fill="none"
                          stroke={exclBlk ? '#881337' : blk.complete ? '#0f172a' : '#b45309'}
                          strokeWidth={exclBlk ? 1.7 : 1.1}
                          strokeDasharray={exclBlk ? '4 2' : blk.complete ? undefined : '3 2'}
                        />
                        {exclBlk ? (
                          <>
                            <text
                              x={cx}
                              y={cy - 4.5}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize="6.5"
                              fontWeight="800"
                              fill="#881337"
                              stroke="#ffffff"
                              strokeWidth="2"
                              paintOrder="stroke"
                            >
                              {`${blk.id} · REEBAN`}
                            </text>
                            <text
                              x={cx}
                              y={cy + 4.5}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize="7"
                              fontWeight="800"
                              fill="#881337"
                              stroke="#ffffff"
                              strokeWidth="2"
                              paintOrder="stroke"
                            >
                              {exclBlk.specialName}
                            </text>
                          </>
                        ) : (
                          <text
                            x={cx}
                            y={cy}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize="7.5"
                            fontWeight="700"
                            fill="#0f172a"
                            stroke="#ffffff"
                            strokeWidth="2"
                            paintOrder="stroke"
                          >
                            {blk.id}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Verified Farm Boundary (Top Layer) */}
                  {subdivisionResult.bring.length >= 3 && (
                    <polygon
                      points={printableMapProjection.ringToPointsAttr(subdivisionResult.bring)}
                      fill="none"
                      stroke="#b91c1c"
                      strokeWidth={1.8}
                      strokeDasharray="6 3"
                    />
                  )}
                </svg>
                  </div>
                </InteractivePanZoomViewport>

                {/* Dimensions & Map Legend Bar */}
                <div className="px-3.5 py-2.5 bg-neutral-50 border-t border-neutral-300 text-[10.5px] space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono tabular-nums text-neutral-800">
                    <span>
                      <strong>Cabbirrada Rasmiga ah:</strong> Block ={' '}
                      {subdivisionResult.params.L}×{subdivisionResult.params.W} m (
                      {subdivisionResult.nC * subdivisionResult.nR} Plots)
                    </span>
                    <span>
                      Plot Buuxa = {subdivisionResult.params.pw}×{subdivisionResult.params.pd} m (
                      {subdivisionResult.params.pw * subdivisionResult.params.pd} m²)
                    </span>
                    <span>Half Plot Darafyada (1,5,6,10) = 12×18 m (216 m²)</span>
                    <span>Half Plot Dhexe (2,3,4,7,8,9) = 9×24 m (216 m²)</span>
                    <span>Jidka = {subdivisionResult.params.rU} m</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-neutral-700 pt-1 border-t border-neutral-200">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-3.5 h-0.5 border-t-2 border-dashed border-red-700" />
                      <span>Xuduudda Beerta ({(subdivisionResult.barea / 10000).toFixed(2)} ha)</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block w-2.5 h-2.5 border"
                        style={{
                          backgroundColor: HALF_PLOT_STATUS_METADATA.full_inside.fillHex,
                          borderColor: HALF_PLOT_STATUS_METADATA.full_inside.strokeHex,
                        }}
                      />
                      <span>
                        La Qaybinayo (
                        {linkedLandAllocation
                          ? linkedLandAllocation.totalFullPlots
                          : halfSummary?.fullInsidePlotsCount || subdivisionResult.plots.length}
                        )
                      </span>
                    </span>
                    {(linkedLandAllocation?.excludedPlotsCount ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-rose-900">
                        <span className="inline-block w-2.5 h-2.5 border border-dashed border-rose-800 bg-rose-200" />
                        <span>
                          Laga Reebay Dhaxalka ({linkedLandAllocation?.excludedPlotsCount ?? 0} Plot
                          {(linkedLandAllocation?.excludedBlocksCount ?? 0) > 0
                            ? ` / ${linkedLandAllocation?.excludedBlocksCount} Block`
                            : ''}
                          )
                        </span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block w-2.5 h-2.5 border"
                        style={{
                          backgroundColor: HALF_PLOT_STATUS_METADATA.half_plot_valid.fillHex,
                          borderColor: HALF_PLOT_STATUS_METADATA.half_plot_valid.strokeHex,
                        }}
                      />
                      <span>Half Plot Buuxiyey Shuruudaha ({halfSummary?.validHalfPlotsCount || 0})</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block w-2.5 h-2.5 border"
                        style={{
                          backgroundColor: HALF_PLOT_STATUS_METADATA.half_plot_invalid.fillHex,
                          borderColor: HALF_PLOT_STATUS_METADATA.half_plot_invalid.strokeHex,
                        }}
                      />
                      <span>Half Plot Ma Buuxin ({halfSummary?.invalidHalfPlotsCount || 0})</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 border border-slate-400 bg-slate-200" />
                      <span>Qaybta Dibadda Xuduudda (La jaray)</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section: Half Plot & Clipped Plots Validation Table */}
          {halfSummary && clippedAndEvaluatedPlots.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xs font-bold tracking-wider text-neutral-800 border-b border-neutral-300 pb-1 mb-2.5 flex items-center justify-between gap-2">
                <span>
                  {sectionNum++}. Jadwalka Hubinta Half Plots &amp; Plots-ka Xuduuddu Goysay
                </span>
                <span className="text-[11px] font-normal text-neutral-700 font-mono tabular-nums">
                  Blocks Go&apos;an: <strong>{halfSummary.boundaryClippedBlocksCount}</strong> · Plots Go&apos;an:{' '}
                  <strong>{halfSummary.boundaryClippedPlotsCount}</strong> · Half Plots Sax ah:{' '}
                  <strong>{halfSummary.validHalfPlotsCount}</strong>
                </span>
              </h2>

              <table className="w-full border-collapse border border-neutral-300 text-[11px]">
                <thead>
                  <tr className="bg-neutral-100 text-neutral-700">
                    <th className="border border-neutral-300 px-2 py-1.5 text-left">Block</th>
                    <th className="border border-neutral-300 px-2 py-1.5 text-left">Plot ID</th>
                    <th className="border border-neutral-300 px-2 py-1.5 text-left">
                      Cabbirka Half Plot ee La Rabo
                    </th>
                    <th className="border border-neutral-300 px-2 py-1.5 text-right">
                      Bedka Gudaha (m²)
                    </th>
                    <th className="border border-neutral-300 px-2 py-1.5 text-left">
                      Natiijada Hubinta
                    </th>
                    <th className="border border-neutral-300 px-2.5 py-1.5 text-left">
                      Sababta &amp; Faahfaahinta
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clippedAndEvaluatedPlots.map((p) => {
                    const hv = p.halfPlotValidation!;
                    return (
                      <tr key={`cert-hp-${p.id}`} className="hover:bg-neutral-50">
                        <td className="border border-neutral-300 px-2 py-1.5 font-mono tabular-nums font-semibold">
                          {p.block}
                        </td>
                        <td className="border border-neutral-300 px-2 py-1.5 font-mono tabular-nums font-bold text-neutral-900">
                          {p.id} (#{p.no})
                        </td>
                        <td className="border border-neutral-300 px-2 py-1.5 font-mono tabular-nums">
                          {hv.expectedRule.label} (216 m²)
                        </td>
                        <td className="border border-neutral-300 px-2 py-1.5 text-right font-mono tabular-nums font-semibold">
                          {hv.insideAreaSqM.toFixed(2)} m²
                        </td>
                        <td className="border border-neutral-300 px-2 py-1.5 font-bold text-neutral-900">
                          {hv.statusLabelSomali}
                        </td>
                        <td className="border border-neutral-300 px-2.5 py-1.5 text-neutral-700">
                          {hv.reasonSomali}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Section: Excluded Blocks & Plots with Special Names */}
          {linkedLandAllocation &&
            ((linkedLandAllocation.excludedBlocks?.length ?? 0) > 0 ||
              (linkedLandAllocation.excludedPlots?.length ?? 0) > 0) && (
              <div className="mb-6 break-inside-avoid">
                <h2 className="text-xs font-bold tracking-wider text-rose-900 border-b border-rose-300 pb-1 mb-2.5 flex items-center justify-between gap-2">
                  <span>
                    {sectionNum++}. Diiwaanka Blocks &amp; Plots-ka Laga Reebay Qaybinta Dhaxalka (Magacyo Gaar ah)
                  </span>
                  <span className="text-[11px] font-normal text-rose-800 font-mono tabular-nums">
                    Blocks Reeban: <strong>{linkedLandAllocation.excludedBlocksCount ?? 0}</strong> · Plots Reeban:{' '}
                    <strong>{linkedLandAllocation.excludedPlotsCount ?? 0}</strong>
                  </span>
                </h2>

                <table className="w-full border-collapse border border-neutral-300 text-xs">
                  <thead>
                    <tr className="bg-rose-50 text-rose-950">
                      <th className="border border-neutral-300 px-2.5 py-1.5 text-left">Nooca</th>
                      <th className="border border-neutral-300 px-2.5 py-1.5 text-left">Aqoonsiga (ID)</th>
                      <th className="border border-neutral-300 px-2.5 py-1.5 text-left">Zone</th>
                      <th className="border border-neutral-300 px-2.5 py-1.5 text-left">
                        Magaca Gaarka ah / Sababta Reebista
                      </th>
                      <th className="border border-neutral-300 px-2.5 py-1.5 text-right">
                        Tirada / Bedka (m²)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(linkedLandAllocation.excludedBlocks ?? []).map((eb) => (
                      <tr key={`cert-excl-blk-${eb.blockId}`} className="bg-rose-50/40">
                        <td className="border border-neutral-300 px-2.5 py-1.5 font-bold text-rose-900">
                          Block Dhammaystiran
                        </td>
                        <td className="border border-neutral-300 px-2.5 py-1.5 font-mono tabular-nums font-bold">
                          {eb.blockId}
                        </td>
                        <td className="border border-neutral-300 px-2.5 py-1.5 font-mono tabular-nums">
                          {eb.zoneId}
                        </td>
                        <td className="border border-neutral-300 px-2.5 py-1.5 font-bold text-neutral-900">
                          {eb.specialName}
                        </td>
                        <td className="border border-neutral-300 px-2.5 py-1.5 text-right font-mono tabular-nums">
                          {eb.plotsCount} Plot ({eb.areaSqM.toLocaleString()} m²)
                        </td>
                      </tr>
                    ))}
                    {(linkedLandAllocation.excludedPlots ?? [])
                      .filter((ep) => ep.excludedScope === 'plot')
                      .map((ep) => (
                        <tr key={`cert-excl-plt-${ep.plotId}`}>
                          <td className="border border-neutral-300 px-2.5 py-1.5 font-semibold text-neutral-800">
                            Plot Gaar ah
                          </td>
                          <td className="border border-neutral-300 px-2.5 py-1.5 font-mono tabular-nums font-bold">
                            {ep.plotId} (Block {ep.blockId})
                          </td>
                          <td className="border border-neutral-300 px-2.5 py-1.5 font-mono tabular-nums">
                            {ep.zoneId}
                          </td>
                          <td className="border border-neutral-300 px-2.5 py-1.5 font-bold text-neutral-900">
                            {ep.specialName}
                          </td>
                          <td className="border border-neutral-300 px-2.5 py-1.5 text-right font-mono tabular-nums">
                            1 Plot ({ep.areaSqM.toLocaleString()} m²)
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

          {/* Section: GIS Spatial Blocks & Plots Schedule per Heir */}
          {linkedLandAllocation && linkedLandAllocation.heirAllocations.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xs font-bold tracking-wider text-neutral-800 border-b border-neutral-300 pb-1 mb-2 flex items-center justify-between gap-2">
                <span>
                  {sectionNum++}. Diiwaanka Naqshadda Zones, Blocks &amp; Plots ee Dhaxale Kasta
                </span>
                <span className="text-[11px] font-normal text-neutral-700 font-mono tabular-nums">
                  {linkedLandAllocation.approvalStatus === 'approved'
                    ? `Qoondayn La Ansixiyey${
                        linkedLandAllocation.approvedBy ? ` (${linkedLandAllocation.approvedBy})` : ''
                      }`
                    : 'Soo-jeedin Talo ah (Weli Lama Ansixin)'}
                  {' · '}
                  {linkedLandAllocation.totalFullPlots} Plot ({linkedLandAllocation.plotWidthM}×
                  {linkedLandAllocation.plotDepthM} m)
                </span>
              </h2>

              <div className="text-[11px] text-neutral-600 mb-2.5">
                {linkedLandAllocation.fairnessSummarySomali}
              </div>

              <table className="w-full border-collapse border border-neutral-300 text-xs">
                <thead>
                  <tr className="bg-neutral-100 text-neutral-700">
                    <th className="border border-neutral-300 px-2.5 py-2 text-left">Dhaxalaha</th>
                    <th className="border border-neutral-300 px-2 py-2 text-left">
                      Zones &amp; Boqolleyda (%)
                    </th>
                    <th className="border border-neutral-300 px-2 py-2 text-left">
                      Blocks &amp; Firdhinta
                    </th>
                    <th className="border border-neutral-300 px-2.5 py-2 text-left">
                      Heerarka (H1 · H2 · H3)
                    </th>
                    <th className="border border-neutral-300 px-2 py-2 text-left">Dooxa &amp; Xogta</th>
                    <th className="border border-neutral-300 px-2.5 py-2 text-right">Wadarta (m²)</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedLandAllocation.heirAllocations.map((h) => {
                    const activeZones = Object.values(h.byZone).filter((zb) => zb.totalZonePlots > 0);
                    const wadiEnc = +(h.wadiBreakdown.cuts_through + h.wadiBreakdown.partial).toFixed(2);
                    return (
                      <tr key={h.heirKey}>
                        <td className="border border-neutral-300 px-2.5 py-2 font-bold text-neutral-900">
                          <div>{h.personName}</div>
                          <div className="text-[10px] font-normal text-neutral-500 font-mono tabular-nums">
                            {h.roleTitleSomali} ({h.individualPercentage.toFixed(2)}%)
                          </div>
                        </td>
                        <td className="border border-neutral-300 px-2 py-2 font-mono tabular-nums text-[10px] leading-relaxed">
                          {activeZones.length > 0
                            ? activeZones
                                .map(
                                  (zb) =>
                                    `${zb.zoneId}: ${formatPlotQtyCompact(
                                      zb.effectivePlotsInZone
                                    )} (${zb.zonePercentageReceived.toFixed(1)}%)`
                                )
                                .join(' · ')
                            : '-'}
                        </td>
                        <td className="border border-neutral-300 px-2 py-2 font-mono tabular-nums text-[10px]">
                          <div className="font-semibold text-neutral-800">
                            {h.assignedBlockIds.join(', ') || '-'}
                          </div>
                          <div className="text-neutral-500">
                            {h.adjacentBlockPairs.length === 0
                              ? 'Blocks kala fog'
                              : `Is-xiga: ${h.adjacentBlockPairs
                                  .map(([a, b]) => `${a}&${b}`)
                                  .join(', ')}`}
                          </div>
                        </td>
                        <td className="border border-neutral-300 px-2.5 py-2 font-mono tabular-nums text-[10px] space-y-0.5">
                          {h.byTier.tier_1_prime.totalTierPlots > 0 && (
                            <div>
                              <strong>H1:</strong>{' '}
                              {formatPlotQtyCompact(h.byTier.tier_1_prime.effectiveTotalPlots)} (
                              {summarizePlotIdsCompact(
                                h.byTier.tier_1_prime.assignedWholePlotIds,
                                3
                              )}
                              )
                            </div>
                          )}
                          {h.byTier.tier_2_standard.totalTierPlots > 0 && (
                            <div>
                              <strong>H2:</strong>{' '}
                              {formatPlotQtyCompact(h.byTier.tier_2_standard.effectiveTotalPlots)} (
                              {summarizePlotIdsCompact(
                                h.byTier.tier_2_standard.assignedWholePlotIds,
                                3
                              )}
                              )
                            </div>
                          )}
                          {h.byTier.tier_3_basic.totalTierPlots > 0 && (
                            <div>
                              <strong>H3:</strong>{' '}
                              {formatPlotQtyCompact(h.byTier.tier_3_basic.effectiveTotalPlots)} (
                              {summarizePlotIdsCompact(
                                h.byTier.tier_3_basic.assignedWholePlotIds,
                                3
                              )}
                              )
                            </div>
                          )}
                        </td>
                        <td className="border border-neutral-300 px-2 py-2 text-[10px] text-neutral-700">
                          <div>
                            {wadiEnc > 0
                              ? `Doox: ${wadiEnc} Plot`
                              : h.unverifiedMetadataPlotCount > 0
                              ? 'Doox: Lama xaqiijin'
                              : 'Kuma jiro doox'}
                          </div>
                          {h.verifiedValueTotalUSD !== null && (
                            <div className="font-mono tabular-nums font-semibold text-emerald-800">
                              Qiime: {formatMoney(h.verifiedValueTotalUSD)}
                            </div>
                          )}
                        </td>
                        <td className="border border-neutral-300 px-2.5 py-2 text-right font-mono tabular-nums font-bold text-[11px]">
                          <div>
                            {formatPlotQtyCompact(h.effectiveTotalPlotsReceived)} Plot (
                            {h.totalAreaSqM.toLocaleString()} m²)
                          </div>
                          {h.verifiedAreaTotalSqM !== null && (
                            <div className="text-[10px] font-normal text-neutral-600">
                              Xaqiijiyey: {h.verifiedAreaTotalSqM.toLocaleString()} m²
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Section: Legal Declarations & Signatures */}
          <div className="pt-4 border-t border-neutral-300 text-xs text-neutral-700 break-inside-avoid">
            <p className="leading-relaxed mb-6">
              Waxaa la caddaynayaa in xisaabintan iyo hubinta xuduudaha kiiska{' '}
              <strong className="font-mono">{referenceNumberDisplay}</strong> ({caseNameDisplay}) loo
              fuliyey si waafaqsan aayadaha quraanka kariimka ah (Suuradda An-Nisaa: 11, 12, 176) iyo
              sunnada Nabigeenna Muxammad ah (NNKH), iyadoo la raacay qawaacidda cilmiga Faraa&apos;idka
              iyo xeerarka cabbirka dhulka.
            </p>

            <div className="grid grid-cols-3 gap-6 pt-6 text-center">
              <div>
                <div className="h-12 border-b border-neutral-400"></div>
                <div className="font-bold mt-2">Wakiilka Qoyska / Dhaxaleeyda</div>
                <div className="text-[11px] text-neutral-500">Saxeexa &amp; Taariikhda</div>
              </div>
              <div>
                <div className="h-12 border-b border-neutral-400"></div>
                <div className="font-bold mt-2">Garsooraha / Qaaddiga Maxkamadda</div>
                <div className="text-[11px] text-neutral-500">Shaabadda Maxkamadda</div>
              </div>
              <div>
                <div className="h-12 border-b border-neutral-400"></div>
                <div className="font-bold mt-2">Markhaatiyaasha Sharciga ah</div>
                <div className="text-[11px] text-neutral-500">Laba Markhaati</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
