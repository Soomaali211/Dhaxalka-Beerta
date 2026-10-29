import { useState } from 'react';
import {
  InheritanceCalculationResult,
  HeirsInput,
  EstateAssetItem,
  EstateDeductionItem,
  Currency,
} from '../types/inheritance';
import { calculateQualityTierDistributions } from '../utils/tierAssetDistributor';
import { calculateTotalUnvaluedPlotSummary } from '../utils/plotDistributor';
import {
  Bold,
  DollarSign,
  Percent,
  Download,
  Printer,
  Plus,
  Info,
  Table,
  MapPin,
  Coins,
  Layers,
  BookOpen,
  ShieldAlert,
} from 'lucide-react';

interface ExcelSpreadsheetViewProps {
  result: InheritanceCalculationResult;
  heirsInput: HeirsInput;
  assets: EstateAssetItem[];
  deductions: EstateDeductionItem[];
  currency: Currency;
  onExportExcel: () => void;
  onExportCSV: () => void;
  onPrint: () => void;
  onOpenHeirs: () => void;
  onOpenAssets: () => void;
  onOpenNewCase?: () => void;
}

type SheetKey =
  | 'distribution'
  | 'estate_ledger'
  | 'quality_tiers'
  | 'plots_distribution'
  | 'livestock'
  | 'quranic_proofs';

function getCategoryLabelSomali(category: string): string {
  switch (category) {
    case 'real_estate':
      return 'Dhul / Guri';
    case 'farm_land':
      return 'Beer';
    case 'livestock':
      return 'Xoolo';
    case 'bank':
      return 'Bangi';
    case 'cash':
      return 'Lacag Cadaan';
    case 'gold_jewelry':
      return 'Dahab';
    case 'business':
      return 'Ganacsi';
    case 'receivables':
      return 'Deyn Maqan';
    default:
      return 'Hanti Kale';
  }
}

export function ExcelSpreadsheetView({
  result,
  heirsInput,
  assets,
  deductions,
  currency,
  onExportExcel,
  onExportCSV,
  onPrint,
  onOpenHeirs,
  onOpenAssets,
  onOpenNewCase,
}: ExcelSpreadsheetViewProps) {
  const [activeSheet, setActiveSheet] = useState<SheetKey>('distribution');
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [isBold, setIsBold] = useState(false);

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

  const getColLetter = (index: number) => String.fromCharCode(65 + index);

  // Generate grid rows based on activeSheet
  let gridHeaders: string[] = [];
  let gridRows: Array<
    Array<{
      val: string | number;
      formula?: string;
      isHeader?: boolean;
      isBold?: boolean;
      align?: 'left' | 'center' | 'right';
      color?: string;
    }>
  > = [];

  if (activeSheet === 'distribution') {
    gridHeaders = [
      'A: Dhaxalaha',
      'B: Magaca Carabiga',
      'C: Tirada',
      'D: Saamiga Quraanka',
      'E: Saamiga Saxitaanka (Tashih)',
      'F: Boqolkiiba (%)',
      `G: Wadarta Qaybta (${currency})`,
      `H: Qofkiiba (${currency})`,
      'I: Daliilka & Xeerka Sharciga ah',
    ];

    result.heirShares.forEach((share, idx) => {
      gridRows.push([
        { val: share.nameSomali, formula: share.nameSomali, align: 'left', isBold: true },
        {
          val: share.nameArabic,
          formula: share.nameArabic,
          align: 'center',
          color: 'text-[#94A3B8] font-arabic',
        },
        { val: share.count, formula: `${share.count}`, align: 'center' },
        {
          val: share.quranicFraction,
          formula: share.quranicFraction,
          align: 'center',
          color: 'text-amber-300 font-semibold',
        },
        {
          val: share.tashihShares,
          formula: `=${result.tashihBase}*${(share.percentage / 100).toFixed(4)}`,
          align: 'center',
          color: 'text-[#10B981]',
        },
        {
          val: `${share.percentage.toFixed(2)}%`,
          formula: `=(G${idx + 2}/$G$${result.heirShares.length + 3})*100`,
          align: 'right',
        },
        {
          val: formatMoney(share.totalAmountUSD),
          formula: `=$G$1*F${idx + 2}`,
          align: 'right',
          isBold: true,
          color: 'text-[#10B981]',
        },
        {
          val: formatMoney(share.perPersonAmountUSD),
          formula: `=G${idx + 2}/C${idx + 2}`,
          align: 'right',
        },
        {
          val: share.quranicProof,
          formula: share.quranicProof,
          align: 'left',
          color: 'text-[#94A3B8]',
        },
      ]);
    });

    // Summary Total Row
    gridRows.push([
      {
        val: 'Wadarta Guud',
        formula: '=SUM(A2:A' + (result.heirShares.length + 1) + ')',
        align: 'left',
        isBold: true,
        color: 'text-[#10B981]',
      },
      { val: 'المجموع الكلي', formula: '', align: 'center', isBold: true, color: 'font-arabic' },
      {
        val: result.heirShares.reduce((s, h) => s + h.count, 0),
        formula: `=SUM(C2:C${result.heirShares.length + 1})`,
        align: 'center',
        isBold: true,
      },
      {
        val: result.isAwl ? `Cawl (${result.awlValue})` : '100% (Kaamil)',
        formula: '',
        align: 'center',
        isBold: true,
        color: 'text-amber-300',
      },
      {
        val: result.tashihBase,
        formula: `=${result.tashihBase}`,
        align: 'center',
        isBold: true,
        color: 'text-[#10B981]',
      },
      {
        val: '100.00%',
        formula: `=SUM(F2:F${result.heirShares.length + 1})`,
        align: 'right',
        isBold: true,
      },
      {
        val: formatMoney(result.netDistributableEstateUSD),
        formula: `=SUM(G2:G${result.heirShares.length + 1})`,
        align: 'right',
        isBold: true,
        color: 'text-[#10B981]',
      },
      { val: '-', formula: '', align: 'center' },
      {
        val: 'Dhammaan hantida waxaa loo qaybiyey si waafaqsan shareecada Islaamka',
        formula: '',
        align: 'left',
        color: 'text-[#94A3B8]',
      },
    ]);
  } else if (activeSheet === 'estate_ledger') {
    gridHeaders = [
      'A: Qeybta Hantida / Deynta',
      'B: Faahfaahinta Shayga',
      'C: Cadadka / Tirada',
      'D: Halbeegga',
      `E: Qiimaha Guud (${currency})`,
      'F: Saamaynta Xisaabeed',
      'G: Xaaladda Sharciga ah',
    ];

    assets.forEach((item) => {
      gridRows.push([
        {
          val: `Hanti: ${getCategoryLabelSomali(item.category)}`,
          formula: item.category,
          align: 'left',
          isBold: true,
        },
        { val: item.title, formula: item.title, align: 'left' },
        { val: item.quantity || 1, formula: `${item.quantity || 1}`, align: 'center' },
        { val: item.unit || 'Xabbo', formula: item.unit || 'Xabbo', align: 'center' },
        {
          val: formatMoney(item.estimatedValueUSD),
          formula: `=${item.estimatedValueUSD}`,
          align: 'right',
          color: 'text-[#10B981]',
        },
        {
          val: '+ Dakhli Hantiyeed',
          formula: '+Asset',
          align: 'center',
          color: 'text-[#10B981]',
        },
        {
          val: 'Hanti uu marxuumku ka tagay',
          formula: '',
          align: 'left',
          color: 'text-[#94A3B8]',
        },
      ]);
    });

    deductions.forEach((d) => {
      gridRows.push([
        {
          val:
            d.category === 'funeral'
              ? 'Kharash: Aaska'
              : d.category === 'will_wasiyyah'
              ? 'Kharash: Dardaaran'
              : 'Kharash: Deyn',
          formula: d.category,
          align: 'left',
          isBold: true,
        },
        { val: d.title, formula: d.title, align: 'left' },
        { val: 1, formula: '1', align: 'center' },
        { val: 'Qaan', formula: 'Deduction', align: 'center' },
        {
          val: `-${formatMoney(d.amountUSD)}`,
          formula: `=-${d.amountUSD}`,
          align: 'right',
          color: 'text-rose-400',
        },
        {
          val: '- Dhimis Hantiyeed',
          formula: '-Deduction',
          align: 'center',
          color: 'text-rose-400',
        },
        {
          val:
            d.category === 'will_wasiyyah'
              ? 'Dardaaran (Xaddidan ugu badnaan 1/3)'
              : 'Xuquuq ka horreysa dhaxalka',
          formula: '',
          align: 'left',
          color: 'text-[#94A3B8]',
        },
      ]);
    });

    gridRows.push([
      {
        val: 'Hantida Saafiga ah ee Dhaxalka (Tarkah)',
        formula: '=SUM(E2:E' + (assets.length + deductions.length + 1) + ')',
        align: 'left',
        isBold: true,
        color: 'text-[#10B981]',
      },
      {
        val: 'Wadarta hantida u hartay qaybinta dhaxaleeyda',
        formula: '',
        align: 'left',
        isBold: true,
      },
      { val: '-', formula: '', align: 'center' },
      { val: '-', formula: '', align: 'center' },
      {
        val: formatMoney(result.netDistributableEstateUSD),
        formula: `=${result.netDistributableEstateUSD}`,
        align: 'right',
        isBold: true,
        color: 'text-[#10B981]',
      },
      {
        val: 'Saafiga Qaybta',
        formula: '',
        align: 'center',
        color: 'text-[#10B981]',
        isBold: true,
      },
      {
        val: "Diyaar u ah qaybinta Faraa'idka",
        formula: '',
        align: 'left',
        color: 'text-[#94A3B8]',
      },
    ]);
  } else if (activeSheet === 'quality_tiers') {
    gridHeaders = [
      'A: Hantida',
      'B: Nooca',
      'C: Heerka / Tayada',
      'D: Goobta',
      'E: Tirada Guud',
      'F: Wiilkiiba (2:1)',
      'G: Gabadhiiba (2:1)',
      `H: Qiimaha Guud (${currency})`,
      'I: Xeerka Sharciga & Islaaxa',
    ];

    const tierAllocations = calculateQualityTierDistributions(assets, heirsInput);
    tierAllocations.forEach((t) => {
      gridRows.push([
        { val: t.assetTitle, formula: t.assetTitle, align: 'left', isBold: true },
        {
          val: getCategoryLabelSomali(t.category),
          formula: t.category,
          align: 'center',
          color: 'text-[#94A3B8]',
        },
        {
          val: t.tierName,
          formula: t.qualityTier,
          align: 'center',
          isBold: true,
          color: t.qualityTier === 'tier_1_prime' ? 'text-amber-300 font-semibold' : 'text-sky-400',
        },
        { val: t.location || 'Meel Fiican', formula: t.location || '', align: 'left' },
        {
          val: `${t.totalQuantity} ${t.unit}`,
          formula: `${t.totalQuantity}`,
          align: 'center',
          isBold: true,
        },
        {
          val: t.sonShareUnitsPerPerson > 0 ? `${t.sonShareUnitsPerPerson} ${t.unit}` : '-',
          formula: `=${t.sonShareUnitsPerPerson}`,
          align: 'center',
          isBold: true,
          color: 'text-[#10B981]',
        },
        {
          val: t.daughterShareUnitsPerPerson > 0 ? `${t.daughterShareUnitsPerPerson} ${t.unit}` : '-',
          formula: `=${t.daughterShareUnitsPerPerson}`,
          align: 'center',
          isBold: true,
          color: 'text-amber-300',
        },
        {
          val: formatMoney(t.totalValueUSD),
          formula: `=${t.totalValueUSD}`,
          align: 'right',
          isBold: true,
          color: 'text-[#10B981]',
        },
        {
          val: t.undividedNote,
          formula: '',
          align: 'left',
          color: t.undividedUnits === 0 ? 'text-[#10B981]' : 'text-amber-300',
        },
      ]);
    });
  } else if (activeSheet === 'plots_distribution') {
    const plotSummary = calculateTotalUnvaluedPlotSummary(assets, result, heirsInput);
    gridHeaders = [
      'A: Dhaxalaha',
      'B: Tirada Ehelka',
      'C: Saamiga Sharciga',
      'D: Boqolkiiba (%)',
      'E: Wadarta Baloodhada Qaybta',
      'F: Qofkiiba Inta Baloodh ee uu Helay',
      'G: Faahfaahinta Qaybinta',
    ];

    plotSummary.summaryPerHeir.forEach((heir, idx) => {
      gridRows.push([
        { val: heir.nameSomali, formula: heir.nameSomali, align: 'left', isBold: true },
        { val: heir.count, formula: `${heir.count}`, align: 'center' },
        {
          val: heir.quranicFraction,
          formula: heir.quranicFraction,
          align: 'center',
          color: 'text-amber-300 font-semibold',
        },
        {
          val: `${heir.percentage.toFixed(2)}%`,
          formula: `=(E${idx + 2}/$E$${plotSummary.summaryPerHeir.length + 3})*100`,
          align: 'right',
        },
        {
          val: `${heir.totalPlotsReceived} Baloodh`,
          formula: `=${plotSummary.totalPlotsCount}*(D${idx + 2}/100)`,
          align: 'center',
          color: 'text-[#F8FAFC] font-bold',
        },
        {
          val: heir.displayPerPerson,
          formula: `=E${idx + 2}/B${idx + 2}`,
          align: 'left',
          isBold: true,
          color: 'text-[#10B981] font-extrabold',
        },
        {
          val:
            heir.count > 1
              ? `${heir.count} qof waxay qaybsanayaan ${heir.totalPlotsReceived} baloodh.`
              : `Wuxuu/waxay leedahay ${heir.displayPerPerson}.`,
          formula: '',
          align: 'left',
          color: 'text-[#94A3B8]',
        },
      ]);
    });

    gridRows.push([
      { val: 'Wadarta Guud ee Baloodhada', align: 'left', isBold: true },
      { val: result.heirShares.reduce((s, h) => s + h.count, 0), align: 'center', isBold: true },
      { val: '100%', align: 'center', isBold: true },
      { val: '100.00%', align: 'right', isBold: true },
      {
        val: `${plotSummary.totalPlotsCount} Baloodh`,
        align: 'center',
        isBold: true,
        color: 'text-[#10B981]',
      },
      { val: 'Qof kasta saamigiisa buuxa', align: 'left', isBold: true },
      {
        val: 'Dhul aan lacag ku qiimaysnayn (Plots sidooda ah)',
        align: 'left',
        color: 'text-amber-300',
      },
    ]);
  } else if (activeSheet === 'livestock') {
    gridHeaders = [
      'A: Dhaxalaha',
      'B: Boqolkiiba (%)',
      'C: Geel (Neef)',
      "D: Lo' (Neef)",
      'E: Ari (Neef)',
      'F: Dhul / Guryo (Qiime)',
      `G: Wadarta Guud (${currency})`,
    ];

    const camelAsset = assets.find(
      (a) => a.category === 'livestock' && a.title.toLowerCase().includes('geel')
    );
    const cowAsset = assets.find(
      (a) =>
        a.category === 'livestock' &&
        (a.title.toLowerCase().includes('lo') || a.title.toLowerCase().includes('sac'))
    );
    const goatAsset = assets.find(
      (a) =>
        a.category === 'livestock' &&
        (a.title.toLowerCase().includes('ari') || a.title.toLowerCase().includes('adhi'))
    );
    const landAsset = assets.find((a) => a.category === 'real_estate');

    const totalCamels = camelAsset?.quantity || 0;
    const totalCows = cowAsset?.quantity || 0;
    const totalGoats = goatAsset?.quantity || 0;
    const totalLandValue = landAsset?.estimatedValueUSD || 0;

    result.heirShares.forEach((share, idx) => {
      const p = share.percentage / 100;
      const camelsShare = totalCamels > 0 ? (totalCamels * p).toFixed(1) : '-';
      const cowsShare = totalCows > 0 ? (totalCows * p).toFixed(1) : '-';
      const goatsShare = totalGoats > 0 ? (totalGoats * p).toFixed(1) : '-';
      const landShare = totalLandValue > 0 ? formatMoney(totalLandValue * p) : '-';

      gridRows.push([
        { val: share.nameSomali, formula: share.nameSomali, align: 'left', isBold: true },
        { val: `${share.percentage.toFixed(2)}%`, formula: `=F${idx + 2}`, align: 'right' },
        {
          val: camelsShare,
          formula: totalCamels > 0 ? `=${totalCamels}*B${idx + 2}` : '',
          align: 'center',
          color: 'text-amber-300',
        },
        {
          val: cowsShare,
          formula: totalCows > 0 ? `=${totalCows}*B${idx + 2}` : '',
          align: 'center',
          color: 'text-[#10B981]',
        },
        {
          val: goatsShare,
          formula: totalGoats > 0 ? `=${totalGoats}*B${idx + 2}` : '',
          align: 'center',
          color: 'text-sky-400',
        },
        {
          val: landShare,
          formula: totalLandValue > 0 ? `=${totalLandValue}*B${idx + 2}` : '',
          align: 'right',
        },
        {
          val: formatMoney(share.totalAmountUSD),
          formula: `=G${idx + 2}`,
          align: 'right',
          isBold: true,
          color: 'text-[#10B981]',
        },
      ]);
    });
  } else if (activeSheet === 'quranic_proofs') {
    gridHeaders = [
      'A: Suuradda & Aayadda',
      "B: Qoraalka Carabiga (Al-Qur'an Al-Kareem)",
      'C: Micnaha & Fasiraadda Af-Soomaaliga',
      'D: Xeerka Sharciga ah ee laga qaato',
    ];

    gridRows = [
      [
        { val: 'Suuradda An-Nisaa (11)', formula: 'An-Nisaa 4:11', align: 'left', isBold: true },
        {
          val: 'يُوصِيكُمُ اللَّهُ فِي أَوْلَادِكُمْ ۖ لِلذَّكَرِ مِثْلُ حَظِّ الْأُنثَيَيْنِ ۚ فَإِن كُنَّ نِسَاءً فَوْقَ اثْنَتَيْنِ فَلَهُنَّ ثُلُثَا مَا تَرَكَ ۖ وَإِن كَانَتْ وَاحِدَةً فَلَهَا النِّصْفُ',
          formula: '',
          align: 'left',
          color: 'text-amber-200 font-arabic',
        },
        {
          val: 'Eebbe wuxuu idiinku dardaarayaa carruurtiinna: Wiilku wuxuu leeyahay saamiga laba gabdhood. Haddii ay yihiin gabdho laba ama ka badan waxay leeyihiin 2/3, hadday mid kaliya tahayna 1/2.',
          formula: '',
          align: 'left',
        },
        {
          val: 'Qaybinta Carruurta tooska ah & Saamiga Gabdhaha',
          formula: '',
          align: 'left',
          color: 'text-[#10B981]',
        },
      ],
      [
        { val: 'Suuradda An-Nisaa (11)', formula: 'An-Nisaa 4:11', align: 'left', isBold: true },
        {
          val: 'وَلِأَبَوَيْهِ لِكُلِّ وَاحِدٍ مِّنْهُمَا السُّدُسُ مِمَّا تَرَكَ إِن كَانَ لَهُ وَلَدٌ ۚ فَإِن لَّمْ يَكُن لَّهُ وَلَدٌ وَوَرِثَهُ أَبَوَاهُ فَلِأُمِّهِ الثُّلُثُ',
          formula: '',
          align: 'left',
          color: 'text-amber-200 font-arabic',
        },
        {
          val: 'Labada waalid midkiiba wuxuu leeyahay 1/6 haddii uu marxuumku carruur leeyahay. Haddii uusan carruur lahayn oo ay waalidiintu dhaxlayaan, hooyadu waxay leedahay 1/3.',
          formula: '',
          align: 'left',
        },
        {
          val: 'Saamiga Hooyada iyo Aabbaha',
          formula: '',
          align: 'left',
          color: 'text-[#10B981]',
        },
      ],
      [
        { val: 'Suuradda An-Nisaa (12)', formula: 'An-Nisaa 4:12', align: 'left', isBold: true },
        {
          val: 'وَلَكُمْ نِصْفُ مَا تَرَكَ أَزْوَاجُكُمْ إِن لَّمْ يَكُن لَّهُنَّ وَلَدٌ ۚ فَإِن كَانَ لَهُنَّ وَلَدٌ فَلَكُمُ الرُّبُعُ مِمَّا تَرَكْنَ',
          formula: '',
          align: 'left',
          color: 'text-amber-200 font-arabic',
        },
        {
          val: 'Waxaad leedihiin 1/2 waxa ay ka tageen xaasaskaagu haddaynaan carruur lahayn. Hadday carruur leeyihiinna 1/4.',
          formula: '',
          align: 'left',
        },
        {
          val: 'Saamiga Sayga (Ninka xaaskiisu dhimatay)',
          formula: '',
          align: 'left',
          color: 'text-[#10B981]',
        },
      ],
      [
        { val: 'Suuradda An-Nisaa (12)', formula: 'An-Nisaa 4:12', align: 'left', isBold: true },
        {
          val: 'وَلَهُنَّ الرُّبُعُ مِمَّا تَرَكْتُمْ إِن لَّمْ يَكُن لَّكُمْ وَلَدٌ ۚ فَإِن كَانَ لَكُمْ وَلَدٌ فَلَهُنَّ الثُّمُنُ مِمَّا تَرَكْتُم',
          formula: '',
          align: 'left',
          color: 'text-amber-200 font-arabic',
        },
        {
          val: 'Xaasasku waxay leeyihiin 1/4 waxaad ka tagteen haddaydnaan carruur lahayn. Haddii aad carruur leedihiinna waxay leeyihiin 1/8.',
          formula: '',
          align: 'left',
        },
        {
          val: 'Saamiga Xaaska ama Xaasaska',
          formula: '',
          align: 'left',
          color: 'text-[#10B981]',
        },
      ],
      [
        { val: 'Suuradda An-Nisaa (176)', formula: 'An-Nisaa 4:176', align: 'left', isBold: true },
        {
          val: 'يَسْتَفْتُونَكَ قُلِ اللَّهُ يُفْتِيكُمْ فِي الْكَلَالَةِ ۚ إِنِ امْرُؤٌ هَلَكَ لَيْسَ لَهُ وَلَدٌ وَلَهُ أُخْتٌ فَلَهَا نِصْفُ مَا تَرَكَ',
          formula: '',
          align: 'left',
          color: 'text-amber-200 font-arabic',
        },
        {
          val: 'Haddii qofku dhinto isagoon carruur iyo waalid lahayn (Kalaalah) oo uu leeyahay walaashiis, waxay leedahay 1/2 waxa uu ka tagay.',
          formula: '',
          align: 'left',
        },
        {
          val: 'Xeerka Kalaalah & Walaalaha Dhashay/Aabbaha',
          formula: '',
          align: 'left',
          color: 'text-[#10B981]',
        },
      ],
    ];
  }

  const safeRow = Math.min(selectedCell.row, Math.max(0, gridRows.length - 1));
  const safeCol = Math.min(selectedCell.col, Math.max(0, gridHeaders.length - 1));
  const activeCellCoord = `${getColLetter(safeCol)}${safeRow + 2}`;
  const currentCellContent = gridRows[safeRow]?.[safeCol];
  const formulaValue = currentCellContent?.formula || currentCellContent?.val || '';

  return (
    <div className="flex flex-col h-full bg-[#030712] border border-[#243449] rounded-2xl overflow-hidden shadow-xl">
      {/* 1. SPREADSHEET TOOLBAR */}
      <div className="bg-[#0B1220] border-b border-[#243449] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsBold(!isBold)}
            className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border transition-colors text-xs font-bold cursor-pointer ${
              isBold
                ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                : 'bg-[#0F1B2D] border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
            title="Qoraal Culus (Bold)"
            aria-label="Qoraal Culus"
          >
            <Bold className="w-4 h-4" />
          </button>

          <div className="hidden sm:flex items-center gap-2 text-xs text-[#94A3B8] px-2 font-mono tabular-nums">
            <span className="inline-flex items-center gap-1 text-[#10B981] font-semibold">
              <DollarSign className="w-3.5 h-3.5 shrink-0" />
              <span>{currency}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Percent className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Saami %</span>
            </span>
          </div>

          {onOpenNewCase && (
            <button
              type="button"
              onClick={onOpenNewCase}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#10B981] bg-[#0F1B2D] hover:border-[#10B981] border border-[#243449] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Kiis Cusub</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenHeirs}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#F8FAFC] bg-[#0F1B2D] hover:border-[#10B981]/60 border border-[#243449] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
            <span>Habee Dhaxaleey</span>
          </button>

          <button
            type="button"
            onClick={onOpenAssets}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#F8FAFC] bg-[#0F1B2D] hover:border-[#10B981]/60 border border-[#243449] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
            <span>Habee Hanti / Deymo</span>
          </button>
        </div>

        {/* Export & Print Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/Faraid_Shafii_Inheritance_System.xlsx"
            download="Faraid_Shafii_Inheritance_System.xlsx"
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F1B2D] hover:border-amber-400/60 border border-[#243449] text-amber-200 text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0"
            title="Soo degso Nidaamka Guud ee 21-ka Sheet ee Mad-habka Shaafici (.xlsx)"
          >
            <Download className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Master Excel (21 Sheet)</span>
          </a>

          <button
            type="button"
            onClick={onExportExcel}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#10B981] hover:bg-[#059669] text-[#030712] text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>Dhoofi Kiiskan (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={onExportCSV}
            className="min-h-[38px] inline-flex items-center gap-1 px-3 py-1.5 bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981]/60 text-[#F8FAFC] text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={onPrint}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981]/60 text-[#F8FAFC] text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
            <span>Daabac</span>
          </button>
        </div>
      </div>

      {/* 2. FORMULA BAR (fx Bar) */}
      <div className="bg-[#0F1B2D] border-b border-[#243449] px-3.5 py-2 flex items-center gap-3">
        <div className="w-16 px-2 py-1 bg-[#0B1220] border border-[#243449] rounded-lg text-center text-xs font-mono tabular-nums font-bold text-[#10B981] shrink-0">
          {activeCellCoord}
        </div>

        <div className="text-xs font-bold font-serif text-[#94A3B8] italic select-none shrink-0">
          fx
        </div>

        <div className="flex-1 bg-[#0B1220] border border-[#243449] rounded-lg px-3 py-1.5 text-xs text-[#F8FAFC] font-mono tabular-nums flex items-center overflow-x-auto whitespace-nowrap">
          <span>{formulaValue}</span>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-[11px] text-[#94A3B8] font-mono tabular-nums shrink-0">
          <span>
            {gridRows.length} saf × {gridHeaders.length} tiir
          </span>
        </div>
      </div>

      {/* 3. SPREADSHEET MATRIX */}
      <div className="flex-1 overflow-auto bg-[#030712] min-h-[360px]">
        <table className="w-full border-collapse border-spacing-0 text-xs font-sans">
          <thead>
            <tr className="bg-[#0B1220] border-b border-[#243449] text-[#94A3B8] font-semibold select-none sticky top-0 z-10">
              <th className="w-12 px-2 py-2 text-center border-r border-[#243449] text-[11px] bg-[#0B1220] text-[#94A3B8] font-mono tabular-nums">
                #
              </th>
              {gridHeaders.map((hdr, cIdx) => (
                <th
                  key={cIdx}
                  className={`px-3 py-2 text-left border-r border-[#243449] whitespace-nowrap text-[11px] ${
                    safeCol === cIdx ? 'bg-[#0F1B2D] text-[#10B981]' : ''
                  }`}
                >
                  {hdr}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {gridRows.map((rowCells, rIdx) => {
              const isSelectedRow = safeRow === rIdx;
              const isLastRow = rIdx === gridRows.length - 1 && activeSheet === 'distribution';

              return (
                <tr
                  key={rIdx}
                  className={`border-b border-[#243449]/70 transition-colors ${
                    isLastRow
                      ? 'bg-[#0F1B2D] font-bold border-t-2 border-[#10B981]/50'
                      : isSelectedRow
                      ? 'bg-[#0F1B2D]/70'
                      : 'hover:bg-[#0B1220]'
                  }`}
                >
                  <td
                    className={`w-12 px-2 py-2 text-center border-r border-[#243449] text-[11px] font-mono tabular-nums select-none ${
                      isSelectedRow ? 'bg-[#0F1B2D] text-[#10B981] font-bold' : 'text-[#94A3B8]'
                    }`}
                  >
                    {rIdx + 1}
                  </td>

                  {rowCells.map((cell, cIdx) => {
                    const isCellSelected = safeRow === rIdx && safeCol === cIdx;

                    return (
                      <td
                        key={cIdx}
                        onClick={() => setSelectedCell({ row: rIdx, col: cIdx })}
                        className={`px-3 py-2.5 border-r border-[#243449]/60 whitespace-nowrap text-xs cursor-pointer select-text transition-colors tabular-nums ${
                          cell.align === 'right'
                            ? 'text-right font-mono-numbers'
                            : cell.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                        } ${
                          isCellSelected
                            ? 'ring-2 ring-[#10B981] ring-inset bg-[#10B981]/10'
                            : ''
                        } ${cell.color || 'text-[#F8FAFC]'} ${
                          cell.isBold || isBold ? 'font-semibold' : ''
                        }`}
                      >
                        {cell.val}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 4. SHEET TABS */}
      <div className="bg-[#0B1220] border-t border-[#243449] px-3 py-2 flex items-center justify-between gap-3 text-xs overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1.5">
          {(
            [
              { id: 'distribution', label: 'Qaybinta Dhaxalka', icon: Table },
              { id: 'estate_ledger', label: 'Hantida & Deymaha', icon: Coins },
              { id: 'quality_tiers', label: 'Heerarka Hantida (2:1)', icon: Layers },
              { id: 'plots_distribution', label: 'Qaybinta Dhulka (Plots)', icon: MapPin },
              { id: 'livestock', label: 'Xoolaha & Ma-guurtada', icon: Table },
              { id: 'quranic_proofs', label: 'Daliilada Quraanka', icon: BookOpen },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeSheet === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveSheet(tab.id);
                  setSelectedCell({ row: 0, col: 0 });
                }}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#10B981] text-[#030712]'
                    : 'bg-[#0F1B2D] border border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Explanatory Notes Below Grid */}
      {result.explanationSomali.length > 0 && (
        <div className="bg-[#0B1220] border-t border-[#243449] px-4 py-3">
          <div className="text-xs font-bold text-[#F8FAFC] flex items-center gap-1.5 mb-1.5">
            <Info className="w-4 h-4 text-[#10B981] shrink-0" />
            <span>Faallada Xisaabeed &amp; Sharciga ah ee Mas&apos;aladan:</span>
          </div>
          <div className="space-y-1">
            {result.explanationSomali.map((exp, idx) => (
              <p key={idx} className="text-xs text-[#94A3B8] leading-relaxed">
                • {exp}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Blocked Heirs Section */}
      {result.blockedHeirs.length > 0 && (
        <div className="bg-[#0F1B2D] border-t border-[#243449] px-4 py-3.5">
          <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5 mb-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Qaraabada Xanniban (Al-Xajb / الحجب) Mas&apos;aladan:</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {result.blockedHeirs.map((bh, idx) => (
              <div
                key={idx}
                className="bg-[#0B1220] border border-[#243449] rounded-xl p-3 text-xs"
              >
                <div className="font-bold text-[#F8FAFC] flex items-center justify-between gap-2">
                  <span>{bh.nameSomali}</span>
                  <span className="text-rose-400 text-[11px] font-semibold">Xanniban</span>
                </div>
                <div className="text-[11px] text-[#94A3B8] mt-1">
                  Waxaa xannibay: <strong className="text-[#F8FAFC]">{bh.blockedBy}</strong>
                </div>
                <div className="text-[11px] text-[#94A3B8]/80 mt-1">{bh.rule}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
