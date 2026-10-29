import * as XLSX from 'xlsx';
import { 
  InheritanceCalculationResult, 
  HeirsInput, 
  EstateAssetItem, 
  EstateDeductionItem,
  Currency 
} from '../types/inheritance';
import { calculateQualityTierDistributions } from './tierAssetDistributor';
import { calculateTotalUnvaluedPlotSummary } from './plotDistributor';
import { calculateComprehensiveEstateDistribution } from './estateAssetDistributionEngine';
import {
  CaseExportMetadata,
  FairLandAllocationResult,
  SubdivisionComputationResult,
} from '../types/landSubdivision';
import { formatPlotQtyCompact } from './landSubdivisionEngine';

export function exportInheritanceToExcel(
  result: InheritanceCalculationResult,
  input: HeirsInput,
  assets: EstateAssetItem[],
  deductions: EstateDeductionItem[],
  currency: Currency = 'USD',
  linkedLandAllocation?: FairLandAllocationResult | null,
  subdivisionResult?: SubdivisionComputationResult | null,
  caseMeta?: CaseExportMetadata
) {
  const wb = XLSX.utils.book_new();
  const caseNameLabel = caseMeta?.caseName || (input.deceasedName ? `Kiiska ${input.deceasedName}` : 'Kiis aan magac lahayn');
  const refLabel = caseMeta?.referenceNumber || 'REF-N/A';

  // ==================== SHEET 1: Qaybinta Dhaxalka ====================
  const sheet1Data = [
    ['NIDAAMKA XISAABINTA DHAXALKA (ISLAMIC INHERITANCE SPREADSHEET)'],
    ['Baaqa Qaybinta Dhaxalka ee Sharciga ah (Faraa\'idka)'],
    [''],
    ['Macluumaadka Kiiska & Marxuumka:'],
    ['Magaca Kiiska (Case Name)', caseNameLabel],
    ['Tixraaca Kiiska (Reference Number)', refLabel],
    ['Magaca Marxuumka', input.deceasedName || 'Marxuum aan magaciisa la cayimin'],
    ['Jinsiga', input.deceasedGender === 'male' ? 'Lab (Rag)' : 'Dheddig (Dumar)'],
    ['Taariikhda Xisaabinta', caseMeta?.caseDate || new Date().toLocaleDateString('so-SO')],
    ['Xaaladda Kiiska', caseMeta?.caseStatus || 'Socda'],
    ['Lacagta La Isticmaalay', currency],
    [''],
    ['KOOBANTA HANTIDA SAFIGA AH:'],
    ['Hantida Guud (Gross Estate)', result.grossEstateUSD],
    ['Kharashka Diyaarinta & Aaska', -result.totalFuneralUSD],
    ['Deymaha Guud (Eebbe & Addoomaha)', -result.totalDebtsUSD],
    ['Dardaaranka Sharciga ah (Wasiyyah)', -result.totalWasiyyahUSD],
    ['HANTIDA SAAFIGA AH EE LA QAYBINAYO (Tarkah)', result.netDistributableEstateUSD],
    [''],
    ['XOGTA FARA\'IDKA EE XISAABTA:'],
    ['Asalka Mas\'alada (Base Asl)', result.aslAlMasalah],
    ['Xaaladda Mas\'alada', result.isAwl ? `Cawl (${result.awlValue})` : result.isRadd ? 'Radd (Celinta Dheeraadka)' : 'Caddilmi (Standard)'],
    ['Asalka Saxitaanka (Tashih Base)', result.tashihBase],
    [''],
    ['JADWALKA SAAMI-QAYBSIGA DHAXALEEYDA:'],
    ['Dhaxalaha (Somali)', 'Magaca Carabiga', 'Tirada', 'Saamiga Quraanka', 'Saamiga Saxitaanka', 'Boqolkiiba (%)', `Wadarta Lacagta (${currency})`, `Qofkiiba (${currency})`, 'Daliilka Sharciga ah']
  ];

  result.heirShares.forEach(share => {
    sheet1Data.push([
      share.nameSomali,
      share.nameArabic,
      share.count.toString(),
      share.quranicFraction,
      share.tashihShares.toString(),
      `${share.percentage.toFixed(2)}%`,
      share.totalAmountUSD.toFixed(2),
      share.perPersonAmountUSD.toFixed(2),
      share.quranicProof
    ]);
  });

  sheet1Data.push(
    [''],
    ['WADARTA GUUD', '', '', '100%', result.tashihBase.toString(), '100.00%', result.netDistributableEstateUSD.toFixed(2), '', '']
  );

  if (result.blockedHeirs.length > 0) {
    sheet1Data.push(
      [''],
      ['DHAXALEEYDA LA XANNIBAAY (AL-HUJUB):'],
      ['Qofka la xannibay', 'Magaca Carabiga', 'Tirada', 'Qofka xannibay', 'Sababta & Xeerka Sharciga ah']
    );
    result.blockedHeirs.forEach(bh => {
      sheet1Data.push([
        bh.nameSomali,
        bh.nameArabic,
        bh.count.toString(),
        bh.blockedBy,
        bh.rule
      ]);
    });
  }

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  // Column widths
  ws1['!cols'] = [
    { wch: 32 },
    { wch: 24 },
    { wch: 10 },
    { wch: 22 },
    { wch: 18 },
    { wch: 16 },
    { wch: 22 },
    { wch: 20 },
    { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Qaybinta Dhaxalka');

  // ==================== SHEET 2: Hantida & Deymaha ====================
  const sheet2Data = [
    ['DIIWAANKA HANTIDA GUUD & DEYMAHA (ESTATE LEDGER)'],
    [''],
    ['1. HANTIDA GUUD EE MARXUUMKU KA TAGAY (ASSETS):'],
    ['Nooca Hantida', 'Faahfaahinta', 'Cadadka/Tirada', 'Halbeegga', `Qiimaha Lagu Qiyaasay (${currency})`]
  ];

  assets.forEach(asset => {
    sheet2Data.push([
      asset.category.toUpperCase(),
      asset.title,
      (asset.quantity || 1).toString(),
      asset.unit || 'Xabbo',
      asset.estimatedValueUSD.toFixed(2)
    ]);
  });

  sheet2Data.push(
    ['WADARTA HANTIDA GUUD', '', '', '', result.grossEstateUSD.toFixed(2)],
    [''],
    ['2. DEYMAHA & XUQUUQDA KA HORREEYA DHAXALKA (DEDUCTIONS):'],
    ['Nooca Kharashka/Deynta', 'Faahfaahinta', `Cadadka (${currency})`]
  );

  deductions.forEach(d => {
    sheet2Data.push([
      d.category.toUpperCase(),
      d.title,
      d.amountUSD.toFixed(2)
    ]);
  });

  sheet2Data.push(
    ['WADARTA KHARASHAADKA & DEYMAHA', '', (result.totalFuneralUSD + result.totalDebtsUSD + result.totalWasiyyahUSD).toFixed(2)],
    ['HANTIDA SAAFIGA AH EE DHAXALKA', '', result.netDistributableEstateUSD.toFixed(2)]
  );

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!cols'] = [
    { wch: 25 },
    { wch: 35 },
    { wch: 15 },
    { wch: 15 },
    { wch: 25 }
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Hantida & Deymaha');

  // ==================== SHEET 3: Xeerarka Fara'idka ====================
  const sheet3Data = [
    ['XEERARKA IYO DALIILADA CILMIGA DHAXALKA (FARA\'ID)'],
    [''],
    ['Aayadda 11 - Suuradda An-Nisaa (Carruurta iyo Waalidiinta):'],
    ['يُوصِيكُمُ اللَّهُ فِي أَوْلَادِكُمْ ۖ لِلذَّكَرِ مِثْلُ حَظِّ الْأُنثَيَيْنِ'],
    ['Dheddiga iyo Labka: Wiilku wuxuu qaadanayaa labanlaabka gabadha (2:1).'],
    ['Haddii ay yihiin gabdho laba ama ka badan waxay leeyihiin 2/3.'],
    ['Haddii ay tahay hal gabadh waxay leedahay 1/2.'],
    ['Labada waalid midkiiba wuxuu leeyahay 1/6 haddii uu marxuumku carruur ka tagay.'],
    [''],
    ['Aayadda 12 - Suuradda An-Nisaa (Sayga iyo Xaaska iyo Walaalaha Hooyo):'],
    ['وَلَكُمْ نِصْفُ مَا تَرَكَ أَزْوَاجُكُمْ إِن لَّمْ يَكُن لَّهُنَّ وَلَدٌ'],
    ['Sayga: 1/2 haddii aysan carruur jirin; 1/4 haddii carruur jirto.'],
    ['Xaaska: 1/4 haddii aysan carruur jirin; 1/8 haddii carruur jirto.'],
    ['Walaalaha Hooyo (Kalaalah): 1/6 haddii uu hal yahay; 1/3 haddii ay laba ama ka badan yihiin (si siman ayey u qaybsanayaan).'],
    [''],
    ['Aayadda 176 - Suuradda An-Nisaa (Walaalaha Dhashay iyo Kuwa Aabbaha):'],
    ['يَسْتَفْتُونَكَ قُلِ اللَّهُ يُفْتِيكُمْ فِي الْكَلَالَةِ'],
    ['Walaasha dhalatay: 1/2 haddii ay mid tahay; 2/3 haddii ay laba ama ka badan yihiin; Casabah haddii ay rag la socdaan.']
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
  ws3['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Daliilada Sharciga ah');

  // ==================== SHEET 4: Heerarka Hantida (2:1 Tiers) ====================
  const tierAllocations = calculateQualityTierDistributions(assets, input);
  const sheet4Data = [
    ['QAYBINTA HEERARKA TAYADA EE HANTIDA MA-GUURTADA AH (QUALITY TIERS)'],
    ['XEERKA: Haddii wiilku helo 2 plot oo meel fiican ah, gabadhuna waxay helaysaa 1 plot oo meel fiican ah (2:1)'],
    [''],
    ['Hantida (Asset)', 'Nooca', 'Heerka / Tayada', 'Goobta (Location)', 'Tirada Guud', 'Wiilkiiba (Sons 2:1)', 'Gabadhiiba (Daughters 2:1)', `Qiimaha Guud (${currency})`, 'Xeerka Sharciga & Xaaladda']
  ];

  tierAllocations.forEach(t => {
    sheet4Data.push([
      t.assetTitle,
      t.category,
      t.tierName,
      t.location || 'Meel Fiican',
      `${t.totalQuantity} ${t.unit}`,
      t.sonShareUnitsPerPerson > 0 ? `${t.sonShareUnitsPerPerson} ${t.unit}` : '-',
      t.daughterShareUnitsPerPerson > 0 ? `${t.daughterShareUnitsPerPerson} ${t.unit}` : '-',
      t.totalValueUSD.toFixed(2),
      t.undividedNote
    ]);
  });

  const ws4 = XLSX.utils.aoa_to_sheet(sheet4Data);
  ws4['!cols'] = [
    { wch: 30 },
    { wch: 15 },
    { wch: 28 },
    { wch: 22 },
    { wch: 15 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 50 }
  ];
  XLSX.utils.book_append_sheet(wb, ws4, 'Heerarka Hantida (2-1 Tiers)');

  // ==================== SHEET 5: Qaybinta Dhulka (Plots) ====================
  const plotSummary = calculateTotalUnvaluedPlotSummary(assets, result, input);
  if (plotSummary.totalPlotsCount > 0) {
    const sheet5Data = [
      ['QAYBINTA DHULKA & BALOODHADA AAN LACAG KU QIIMAYSNAYN (PLOTS DISTRIBUTION)'],
      ['XEERKA: Qofkastaaba inta baloodh ee uu helay sida ku cad shareecada Islaamka (Faraa\'id)'],
      ['Wadarta Guud ee Baloodhada', plotSummary.totalPlotsCount.toString()],
      ['Dhulka aan Lacagta Lahayn', plotSummary.totalUnvaluedPlotsCount.toString()],
      [''],
      ['Dhaxalaha (Heir)', 'Tirada Ehelka', 'Saamiga Quraanka', 'Boqolkiiba (%)', 'Wadarta Baloodhada Qaybta', 'Qofkiiba Inta Baloodh ee uu Helay', 'Faahfaahinta Qaybinta']
    ];

    plotSummary.summaryPerHeir.forEach(h => {
      sheet5Data.push([
        h.nameSomali,
        h.count.toString(),
        h.quranicFraction,
        `${h.percentage.toFixed(2)}%`,
        `${h.totalPlotsReceived} Baloodh`,
        h.displayPerPerson,
        h.count > 1 ? `${h.count} qof waxay qaybsanayaan ${h.totalPlotsReceived} baloodh.` : `Wuxuu leeyahay ${h.displayPerPerson}.`
      ]);
    });

    const ws5 = XLSX.utils.aoa_to_sheet(sheet5Data);
    ws5['!cols'] = [
      { wch: 30 },
      { wch: 14 },
      { wch: 18 },
      { wch: 16 },
      { wch: 25 },
      { wch: 30 },
      { wch: 45 }
    ];
    XLSX.utils.book_append_sheet(wb, ws5, 'Qaybinta Dhulka (Plots)');
  }

  // ==================== SHEET 6: Qaybinta Hantida (Dhul, Lacag, Xoolo & Heerarka) ====================
  const compDist = calculateComprehensiveEstateDistribution(assets, result, input, currency);
  const sheet6Data = [
    ['QAYBINTA TOOSKA AH EE HANTIDA: DHUL, LACAG, XOOLO & HEERARKA'],
    [`Marxuum: ${input.deceasedName || 'Marxuum'} · Heerka Hantida: ${compDist.estateTierLevelDescription}`],
    [''],
    [
      'Dhaxalaha (Heir)',
      'Tirada',
      'Saamiga Quraanka',
      'Boqolkiiba (%)',
      'Dhulka (Plots / Baloodho)',
      'Lacagta (Cash / Bangi USD)',
      'Xoolaha (Neefaf)',
      'Heerka Hantida (Tiers 1 & 2)',
      'Wadarta Qiimaha ($ USD)',
      'Qofkiiba ($ USD)'
    ]
  ];

  compDist.heirAllocations.forEach(h => {
    sheet6Data.push([
      h.nameSomali,
      h.count.toString(),
      h.quranicFraction,
      `${h.percentage.toFixed(2)}%`,
      h.land.displayPerPerson + (h.land.sqMPerPerson ? ` (${h.land.sqMPerPerson} m²)` : ''),
      h.money.moneyPerPersonUSD > 0 ? `$${h.money.moneyPerPersonUSD.toFixed(2)}` : '-',
      h.livestock.displayPerPerson,
      h.tierBreakdown.tier1Prime.descriptionSomali !== 'Qayb kuma laha heerkan' 
        ? `H1: ${h.tierBreakdown.tier1Prime.descriptionSomali}` 
        : `H2: ${h.tierBreakdown.tier2Standard.descriptionSomali}`,
      h.totalEstimatedValueUSD.toFixed(2),
      h.perPersonEstimatedValueUSD.toFixed(2)
    ]);
  });

  const ws6 = XLSX.utils.aoa_to_sheet(sheet6Data);
  ws6['!cols'] = [
    { wch: 28 },
    { wch: 10 },
    { wch: 18 },
    { wch: 16 },
    { wch: 30 },
    { wch: 24 },
    { wch: 24 },
    { wch: 35 },
    { wch: 20 },
    { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(wb, ws6, 'Dhul, Lacag & Xoolo');

  // ==================== SHEET 7: Qofkasta Magaciisa (Individual Named Heirs) ====================
  const sheet7Data = [
    ['DIIWAANKA UGU DAMBEEYA EE DHAXLAYAASHA: QOFKASTA MAGACIISA IYO WAXA UU HELAY'],
    [`Marxuum: ${input.deceasedName || 'Marxuum'} · Wadarta Dhaxlayaasha: ${compDist.allIndividualHeirs.length} Qof`],
    [''],
    [
      'Tirsiga (#)',
      'Magaca Qofka Dhaxlaya (Full Name)',
      'Xiriirka / Doorka (Role)',
      'Doorka Carabiga',
      'Saamiga Qofka (%)',
      'Dhulka (Plots / Baloodho)',
      'Cabirka Dhulka (m²)',
      `Lacagta Caddaan/Bangi (${currency})`,
      'Xoolaha Nool (Neefaf)',
      'Heerka 1aad (Prime)',
      'Heerka 2aad (Standard)',
      `Wadarta Qiimaha Qofka (${currency})`
    ]
  ];

  compDist.allIndividualHeirs.forEach((ind, index) => {
    sheet7Data.push([
      (index + 1).toString(),
      ind.personName,
      ind.roleTitleSomali,
      ind.roleTitleArabic,
      `${ind.individualPercentage.toFixed(2)}%`,
      ind.landDisplay,
      ind.landSqM ? `${ind.landSqM} m²` : '-',
      ind.moneyAmountUSD.toFixed(2),
      ind.livestockDisplay,
      ind.tier1Description,
      ind.tier2Description,
      ind.totalEstimatedValueUSD.toFixed(2)
    ]);
  });

  const ws7 = XLSX.utils.aoa_to_sheet(sheet7Data);
  ws7['!cols'] = [
    { wch: 12 },
    { wch: 30 },
    { wch: 22 },
    { wch: 18 },
    { wch: 16 },
    { wch: 26 },
    { wch: 18 },
    { wch: 22 },
    { wch: 24 },
    { wch: 28 },
    { wch: 28 },
    { wch: 24 }
  ];
  XLSX.utils.book_append_sheet(wb, ws7, 'Qofkasta Magaciisa');

  // ==================== SHEET 8: GIS Zones, Blocks & Plots Dhaxlayaasha ====================
  if (
    linkedLandAllocation &&
    (linkedLandAllocation.heirAllocations.length > 0 || (linkedLandAllocation.excludedPlotsCount ?? 0) > 0)
  ) {
    const exclBlocks = linkedLandAllocation.excludedBlocks ?? [];
    const exclPlots = linkedLandAllocation.excludedPlots ?? [];
    const exclPlotsCount = linkedLandAllocation.excludedPlotsCount ?? exclPlots.length;
    const exclBlocksCount = linkedLandAllocation.excludedBlocksCount ?? exclBlocks.length;

    const approvalHeaderLabel =
      linkedLandAllocation.approvalStatus === 'approved'
        ? `Qoondayn La Ansixiyey${linkedLandAllocation.approvedBy ? ` — Ansixiyey: ${linkedLandAllocation.approvedBy}` : ''}`
        : 'Soo-jeedin Talo ah (Weli Lama Ansixin)';

    const sheet8Data: string[][] = [
      ['NAQSHADDA ZONES, BLOCKS & PLOTS EE BEERTA IYO QAYBINTA CADAALADDA GOOBTA & HEERARKA'],
      [
        `Xaaladda Ansixinta: ${approvalHeaderLabel} · Plots La Qaybinayo: ${linkedLandAllocation.totalFullPlots} Plot · Plots Laga Reebay: ${exclPlotsCount} Plot (${exclBlocksCount} Block) · Cabirka: ${linkedLandAllocation.plotWidthM}x${linkedLandAllocation.plotDepthM} m = ${linkedLandAllocation.plotAreaSqM} m² · Zones: ${linkedLandAllocation.zones.map((z) => `${z.zoneId} (${z.totalPlots})`).join(', ')} · H1: ${linkedLandAllocation.tierCounts.tier_1_prime} · H2: ${linkedLandAllocation.tierCounts.tier_2_standard} · H3: ${linkedLandAllocation.tierCounts.tier_3_basic}`,
      ],
      [linkedLandAllocation.fairnessSummarySomali],
      [''],
      ['1. KOOBANTA DHAXALE KASTA: ZONES (%), BLOCKS KALA FOG, HEERARKA & XOGTA LA XAQIIJIYEY:'],
      [
        'Magaca Dhaxalaha',
        'Xiriirka',
        'Saamiga Sharciga (%)',
        'Qaybta Zone Kasta (%)',
        'Blocks Uu Helay',
        'Firdhinta Blocks (Is-xiga)',
        'Heerka 1aad (Meel Fiican)',
        'Heerka 2aad (Meel Dhexe)',
        'Heerka 3aad (Meel Hoose)',
        'Dooxa & Tayada',
        'Wadarta Plots',
        'Bedka GIS (m²)',
        'Bedka La Xaqiijiyey (m²)',
        `Qiimaha La Xaqiijiyey (${currency})`,
      ],
    ];

    linkedLandAllocation.heirAllocations.forEach((h) => {
      const fmtTier = (tb: typeof h.byTier.tier_1_prime) => {
        if (tb.totalTierPlots === 0) return '-';
        const wholeStr = tb.assignedWholePlotIds.join(', ');
        const sharedStr = tb.sharedPlotSlices
          .map((s) => `${s.plotId} (${s.percentageOfPlot}% wadaag)`)
          .join(', ');
        return `${formatPlotQtyCompact(tb.effectiveTotalPlots)} Plot: ${[wholeStr, sharedStr]
          .filter(Boolean)
          .join(' + ')}`;
      };

      const zoneSummary = Object.values(h.byZone)
        .filter((zb) => zb.totalZonePlots > 0)
        .map(
          (zb) =>
            `${zb.zoneId}: ${formatPlotQtyCompact(zb.effectivePlotsInZone)} Plot (${zb.zonePercentageReceived.toFixed(2)}%)`
        )
        .join(' | ');

      const adjLabel =
        h.adjacentBlockPairs.length === 0
          ? 'Blocks kala fog (0 is-xiga)'
          : `Is-xiga: ${h.adjacentBlockPairs.map(([a, b]) => `${a}&${b}`).join(', ')}`;

      const wadiEnc = +(h.wadiBreakdown.cuts_through + h.wadiBreakdown.partial).toFixed(2);
      const wadiSummary =
        wadiEnc > 0
          ? `Doox mara: ${wadiEnc} Plot`
          : h.unverifiedMetadataPlotCount > 0
          ? 'Lama xaqiijin'
          : 'Kuma jiro doox';

      sheet8Data.push([
        h.personName,
        h.roleTitleSomali,
        `${h.individualPercentage.toFixed(2)}%`,
        zoneSummary || '-',
        h.assignedBlockIds.join(', ') || '-',
        adjLabel,
        fmtTier(h.byTier.tier_1_prime),
        fmtTier(h.byTier.tier_2_standard),
        fmtTier(h.byTier.tier_3_basic),
        wadiSummary,
        formatPlotQtyCompact(h.effectiveTotalPlotsReceived),
        `${h.totalAreaSqM} m²`,
        h.verifiedAreaTotalSqM !== null ? `${h.verifiedAreaTotalSqM} m²` : 'Lama xaqiijin',
        h.verifiedValueTotalUSD !== null ? h.verifiedValueTotalUSD.toFixed(2) : 'Lama xaqiijin',
      ]);
    });

    if (exclBlocks.length > 0 || exclPlots.length > 0) {
      sheet8Data.push(
        [''],
        ['2. BLOCKS & PLOTS LAGA REEBAY QAYBINTA DHAXALKA (MAGACYO GAAR AH):'],
        ['Nooca Diiwaanka', 'Aqoonsiga (ID)', 'Block ID', 'Zone ID', 'Magaca Gaarka ah / Sababta', 'Tirada Plots', 'Bedka (m²)']
      );

      exclBlocks.forEach((eb) => {
        sheet8Data.push([
          'BLOCK REEBAN',
          eb.blockId,
          eb.blockId,
          eb.zoneId,
          eb.specialName,
          eb.plotsCount.toString(),
          eb.areaSqM.toString(),
        ]);
      });

      exclPlots
        .filter((ep) => ep.excludedScope === 'plot')
        .forEach((ep) => {
          sheet8Data.push([
            'PLOT REEBAN',
            ep.plotId,
            ep.blockId,
            ep.zoneId,
            ep.specialName,
            '1',
            ep.areaSqM.toString(),
          ]);
        });
    }

    sheet8Data.push(
      [''],
      ['3. DIIWAANKA BUUXA EE PLOT KASTA, QAYBINTA/REEBISTA, ZONE, DOOXA & DHAXALAHA ISKA LEH (PLOT REGISTER):'],
      [
        'Plot ID',
        'Block ID',
        'Zone ID',
        'La Qaybin Karo',
        'Magaca Gaarka ah',
        'Heerka Dhulka',
        'Xaaladda Dooxa',
        'Tayada Goobta',
        'Cabbirka (m)',
        'Bedka GIS (m²)',
        'Bedka La Xaqiijiyey (m²)',
        `Qiimaha La Xaqiijiyey (${currency})`,
        'Dhaxalaha Helay / Xaaladda',
        'Xaaladda Ansixinta',
        'GPS Lat',
        'GPS Lon',
      ]
    );

    Object.values(linkedLandAllocation.plotAssignments).forEach((rec) => {
      const isExcluded = rec.assignmentType === 'excluded' || Boolean(rec.isExcluded);
      const ownerLabel = isExcluded
        ? `LAGA REEBAY DHAXALKA: ${rec.excludedSpecialName || 'Laga Reebay'}`
        : rec.assignmentType === 'shared_fractional' && rec.coOwners
        ? `Wadaag: ${rec.coOwners.map((c) => `${c.personName} (${c.sharePercentageOfPlot}%)`).join(' + ')}`
        : `${rec.ownerPersonName || '-'} (${rec.ownerRoleSomali || '-'})`;

      sheet8Data.push([
        rec.plotId,
        rec.blockId,
        rec.zoneId,
        isExcluded ? 'Maya (Laga Reebay)' : 'Haa',
        rec.excludedSpecialName || '-',
        rec.tierLabelSomali,
        rec.wadiLabelSomali,
        rec.siteQualityLabelSomali,
        `${rec.widthM}x${rec.depthM}`,
        rec.areaSqM.toString(),
        rec.verifiedAreaSqM !== null ? rec.verifiedAreaSqM.toString() : 'Lama xaqiijin',
        rec.verifiedPrice !== null ? rec.verifiedPrice.toFixed(2) : 'Lama xaqiijin',
        ownerLabel,
        isExcluded
          ? 'Laga Reebay Qaybinta'
          : rec.allocationLifecycleStatus === 'approved'
          ? 'La Ansixiyey'
          : 'Soo-jeedin Talo ah',
        rec.lat.toFixed(6),
        rec.lon.toFixed(6),
      ]);
    });

    const ws8 = XLSX.utils.aoa_to_sheet(sheet8Data);
    ws8['!cols'] = [
      { wch: 24 },
      { wch: 16 },
      { wch: 16 },
      { wch: 20 },
      { wch: 28 },
      { wch: 24 },
      { wch: 22 },
      { wch: 22 },
      { wch: 16 },
      { wch: 16 },
      { wch: 20 },
      { wch: 22 },
      { wch: 36 },
      { wch: 20 },
      { wch: 14 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, ws8, 'Blocks & Plots GIS');
  }

  // ==================== SHEET 9: Half Plot Management & Validation (Section 2.8) ====================
  if (subdivisionResult && subdivisionResult.allEvaluatedPlots && subdivisionResult.allEvaluatedPlots.length > 0) {
    const hpSum = subdivisionResult.halfPlotSummary;
    const sheet9Data: string[][] = [
      ['HUBINTA HALF PLOTS & PLOTS-KA XUDUUDDU GOYSAY (HALF PLOT VALIDATION REGISTER)'],
      [
        `Kiiska: ${caseNameLabel} · Reference Number: ${refLabel} · Blocks: ${hpSum?.totalEvaluatedBlocks ?? subdivisionResult.blocks.length} (${hpSum?.boundaryClippedBlocksCount ?? 0} la jaray) · Half Plots Sax ah: ${hpSum?.validHalfPlotsCount ?? 0} · Ma buuxin: ${hpSum?.invalidHalfPlotsCount ?? 0} · Dib-u-eegis: ${hpSum?.needsReviewPlotsCount ?? 0}`,
      ],
      ['Xeerka 10-Plot: Plot 1, 5, 6, 10 = 12 × 18 m (216 m²) | Plot 2, 3, 4, 7, 8, 9 = 9 × 24 m (216 m²)'],
      [''],
      [
        'Case Name',
        'Reference Number',
        'Block ID',
        'Plot ID',
        'Plot No',
        'Cabbirka Half Plot La Filayey',
        'Bedka Asalka ah (m²)',
        'Bedka Gudaha Ku Hadhay (m²)',
        'Bedka Dibadda (m²)',
        'Cabbirka Gudaha Lagu Qiyaasay',
        'Xaaladda Validation-ka',
        'Sababta Digniinta ama Go\'aanka',
      ],
    ];

    subdivisionResult.allEvaluatedPlots.forEach((p) => {
      const hp = p.halfPlotValidation || subdivisionResult.plotValidations?.[p.id];
      if (!hp) return;
      sheet9Data.push([
        caseNameLabel,
        refLabel,
        hp.blockId,
        hp.plotId,
        String(hp.plotNumber),
        hp.expectedRule.label,
        hp.nominalPlotAreaSqM.toFixed(2),
        hp.insideAreaSqM.toFixed(2),
        hp.outsideAreaSqM.toFixed(2),
        hp.measuredDisplayDimensions,
        hp.statusLabelSomali,
        hp.reasonSomali,
      ]);
    });

    const ws9 = XLSX.utils.aoa_to_sheet(sheet9Data);
    ws9['!cols'] = [
      { wch: 28 },
      { wch: 20 },
      { wch: 12 },
      { wch: 16 },
      { wch: 10 },
      { wch: 24 },
      { wch: 18 },
      { wch: 22 },
      { wch: 18 },
      { wch: 22 },
      { wch: 30 },
      { wch: 64 },
    ];
    XLSX.utils.book_append_sheet(wb, ws9, 'Half Plots & Hubinta');
  }

  // Save workbook file
  const refPrefix = caseMeta?.referenceNumber ? `${caseMeta.referenceNumber}_` : '';
  const filename = `${refPrefix}Qaybinta_Dhaxalka_${(input.deceasedName || caseNameLabel || 'Marxuum').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportInheritanceToCSV(
  result: InheritanceCalculationResult,
  currency: Currency = 'USD',
  caseMeta?: CaseExportMetadata
): void {
  const rows = [
    ['Dhaxalaha', 'Magaca Carabiga', 'Tirada', 'Saamiga', 'Boqolkiiba', `Wadarta (${currency})`, `Qofkiiba (${currency})`, 'Daliilka']
  ];

  result.heirShares.forEach(s => {
    rows.push([
      `"${s.nameSomali}"`,
      `"${s.nameArabic}"`,
      s.count.toString(),
      `"${s.quranicFraction}"`,
      `"${s.percentage.toFixed(2)}%"`,
      s.totalAmountUSD.toFixed(2),
      s.perPersonAmountUSD.toFixed(2),
      `"${s.quranicProof.replace(/"/g, '""')}"`
    ]);
  });

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(e => e.join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Qaybinta_Dhaxalka_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
