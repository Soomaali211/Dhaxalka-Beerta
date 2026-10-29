import { 
  EstateAssetItem, 
  InheritanceCalculationResult, 
  HeirsInput,
  Currency,
  ComprehensiveHeirAssetAllocation,
  ComprehensiveEstateDistributionSummary,
  HeirAssetItemAllocation,
  IndividualNamedHeirAllocation,
  AssetQualityTier
} from '../types/inheritance';
import { formatPlotFractionSomali, parsePlotAreaSqM } from './plotDistributor';
import { getTierName } from './tierAssetDistributor';
import { resolveIndividualHeirNames } from './heirNameUtils';

/**
 * Natural Somali formatting for livestock unit shares.
 * e.g. 10 -> "10 Neef oo buuxa"
 * e.g. 5.5 -> "5 Neef iyo Bar (5.5)"
 * e.g. 0.5 -> "Nus Neef (1/2)"
 */
export function formatLivestockFractionSomali(count: number, unit: string = 'Neef'): string {
  if (count === 0) return `0 ${unit}`;
  const rounded = Math.round(count * 100) / 100;
  const whole = Math.floor(rounded);
  const frac = Math.round((rounded - whole) * 100) / 100;

  if (frac === 0) {
    return `${whole} ${unit} oo buuxa`;
  }

  if (whole === 0) {
    if (Math.abs(frac - 0.5) < 0.02) return `Nus ${unit} (1/2)`;
    if (Math.abs(frac - 0.25) < 0.02) return `Rubuc ${unit} (1/4)`;
    if (Math.abs(frac - 0.75) < 0.02) return `Sadex Rubuc ${unit} (3/4)`;
    if (Math.abs(frac - 0.33) < 0.03) return `1/3 ${unit} (Sadex-meelood)`;
    if (Math.abs(frac - 0.67) < 0.03) return `2/3 ${unit} (Laba-sadexaad)`;
    if (Math.abs(frac - 0.125) < 0.02) return `1/8 ${unit} (Sideed-meelood)`;
    return `${rounded} ${unit}`;
  }

  if (Math.abs(frac - 0.5) < 0.02) return `${whole} ${unit} iyo Bar (${rounded})`;
  if (Math.abs(frac - 0.25) < 0.02) return `${whole} ${unit} iyo Rubuc (${rounded})`;
  if (Math.abs(frac - 0.75) < 0.02) return `${whole} ${unit} iyo Sadex Rubuc (${rounded})`;
  if (Math.abs(frac - 0.33) < 0.03) return `${whole} ${unit} iyo 1/3 (${rounded})`;
  if (Math.abs(frac - 0.67) < 0.03) return `${whole} ${unit} iyo 2/3 (${rounded})`;

  return `${rounded} ${unit}`;
}

/**
 * Checks whether an asset belongs to the Land & Real Estate category.
 */
export function isLandAsset(asset: EstateAssetItem): boolean {
  if (asset.isUnvaluedLand) return true;
  if (asset.category === 'real_estate' || asset.category === 'farm_land') return true;
  if (asset.unit && (
    asset.unit.toLowerCase().includes('plot') || 
    asset.unit.toLowerCase().includes('baloodh') ||
    asset.unit.toLowerCase().includes('hektar') ||
    asset.unit.toLowerCase().includes('boos')
  )) {
    return true;
  }
  return false;
}

/**
 * Checks whether an asset belongs to the Livestock category.
 */
export function isLivestockAsset(asset: EstateAssetItem): boolean {
  if (asset.category === 'livestock') return true;
  const titleLower = asset.title.toLowerCase();
  if (
    titleLower.includes('geel') || 
    titleLower.includes('ari') || 
    titleLower.includes('lo\'') || 
    titleLower.includes('adhi') || 
    titleLower.includes('xoolo') ||
    asset.unit?.toLowerCase().includes('neef')
  ) {
    return true;
  }
  return false;
}

/**
 * Checks whether an asset belongs to the Money / Cash / Liquid category.
 */
export function isMoneyAsset(asset: EstateAssetItem): boolean {
  if (isLandAsset(asset) || isLivestockAsset(asset)) return false;
  return true;
}

/**
 * Computes comprehensive asset distribution for all heirs:
 * - Dhul (Plots, dimensions, locations, m²)
 * - Lacag (Cash, bank, liquid valuations)
 * - Xoolo (Camel, cattle, goats, sheep - heads & shares)
 * - Heerka Hantida (Tier 1 Prime, Tier 2 Standard, Tier 3 Basic)
 */
export function calculateComprehensiveEstateDistribution(
  assets: EstateAssetItem[],
  result: InheritanceCalculationResult,
  heirs: HeirsInput,
  currency: Currency = 'USD'
): ComprehensiveEstateDistributionSummary {
  const activeHeirShares = result.heirShares.filter(
    h => h.count > 0 && (h.percentage > 0 || h.quranicFractionValue > 0)
  );

  // Segregate assets by domain
  const landAssets = assets.filter(isLandAsset);
  const livestockAssets = assets.filter(isLivestockAsset);
  const moneyAssets = assets.filter(isMoneyAsset);

  // Overall totals
  let totalLandPlots = 0;
  let unvaluedPlotsCount = 0;
  landAssets.forEach(a => {
    const q = a.quantity && a.quantity > 0 ? a.quantity : 1;
    totalLandPlots += q;
    if (a.isUnvaluedLand || a.estimatedValueUSD === 0) {
      unvaluedPlotsCount += q;
    }
  });

  let totalLivestockHeads = 0;
  livestockAssets.forEach(a => {
    const q = a.quantity && a.quantity > 0 ? a.quantity : 1;
    totalLivestockHeads += q;
  });

  let totalMoneyUSD = 0;
  moneyAssets.forEach(a => {
    totalMoneyUSD += a.estimatedValueUSD || 0;
  });

  // Tiers tally
  let tier1Count = 0;
  let tier2Count = 0;
  let tier3Count = 0;
  assets.forEach(a => {
    const t = a.qualityTier || 'tier_1_prime';
    if (t === 'tier_1_prime') tier1Count++;
    else if (t === 'tier_2_standard') tier2Count++;
    else if (t === 'tier_3_basic') tier3Count++;
  });

  let estateTierLevelDesc = 'Heerar Kala Duwan (Mixed Tiers)';
  if (tier1Count > 0 && tier2Count === 0 && tier3Count === 0) {
    estateTierLevelDesc = 'Heerka 1aad oo Kaliya (Prime Only)';
  } else if (tier1Count > 0 && tier2Count > 0 && tier3Count === 0) {
    estateTierLevelDesc = 'Heerka 1aad (Prime) & Heerka 2aad (Standard)';
  } else if (tier3Count > 0) {
    estateTierLevelDesc = 'Heerarka 1aad, 2aad & 3aad (Dhammaan Heerarka)';
  }

  // Calculate per heir
  const heirAllocations: ComprehensiveHeirAssetAllocation[] = activeHeirShares.map(share => {
    const pDecimal = share.percentage / 100;
    const heirCount = share.count;

    // 1. DHUL (Land & Plots)
    let rawTotalPlotsForGroup = 0;
    let totalSqMForGroup = 0;
    const landParcels: HeirAssetItemAllocation[] = landAssets.map(asset => {
      const assetQty = asset.quantity && asset.quantity > 0 ? asset.quantity : 1;
      const rawGroupQty = pDecimal * assetQty;
      const groupQty = Math.round(rawGroupQty * 100) / 100;
      const qtyPerPerson = heirCount > 0 ? Math.round((rawGroupQty / heirCount) * 100) / 100 : 0;
      const unit = asset.unit || 'Baloodh';
      const disp = formatPlotFractionSomali(qtyPerPerson, unit);
      
      const sqM = parsePlotAreaSqM(asset.plotSize);
      const approxSqMPerPerson = sqM ? Math.round((rawGroupQty / Math.max(1, heirCount)) * sqM) : undefined;
      
      rawTotalPlotsForGroup += rawGroupQty;
      if (approxSqMPerPerson) {
        totalSqMForGroup += approxSqMPerPerson * heirCount;
      }

      const assetVal = asset.estimatedValueUSD || 0;
      const rawGroupValUSD = pDecimal * assetVal;
      const groupValUSD = Math.round(rawGroupValUSD * 100) / 100;
      const valPerPersonUSD = heirCount > 0 ? Math.round((rawGroupValUSD / heirCount) * 100) / 100 : 0;

      return {
        assetId: asset.id,
        title: asset.title,
        category: asset.category,
        qualityTier: asset.qualityTier,
        tierName: asset.tierName || getTierName(asset.qualityTier),
        location: asset.location || 'Meel Cayiman',
        totalQuantity: assetQty,
        unit: unit,
        groupQuantity: groupQty,
        quantityPerPerson: qtyPerPerson,
        displayPerPerson: disp,
        groupValueUSD: groupValUSD,
        valuePerPersonUSD: valPerPersonUSD,
        approxSqMPerPerson: approxSqMPerPerson,
        isUnvalued: asset.isUnvaluedLand ?? (assetVal === 0),
      };
    });

    const totalPlotsForGroup = Math.round(rawTotalPlotsForGroup * 100) / 100;
    const plotsPerPerson = heirCount > 0 ? Math.round((rawTotalPlotsForGroup / heirCount) * 100) / 100 : 0;
    const landDisplayPerPerson = formatPlotFractionSomali(plotsPerPerson, 'Baloodh');
    const landSqMPerPerson = totalSqMForGroup > 0 && heirCount > 0 ? Math.round(totalSqMForGroup / heirCount) : undefined;

    let landSummaryText = '';
    if (landAssets.length === 0) {
      landSummaryText = 'Kuma jirto hantida dhul';
    } else {
      landSummaryText = `Qofkiiba: ${landDisplayPerPerson}${landSqMPerPerson ? ` (${landSqMPerPerson.toLocaleString()} m²)` : ''} · Wadarta kooxda: ${totalPlotsForGroup} Baloodh`;
    }

    // 2. LACAG (Cash & Bank)
    let totalMoneyForGroupUSD = 0;
    const moneyItems: HeirAssetItemAllocation[] = moneyAssets.map(asset => {
      const assetVal = asset.estimatedValueUSD || 0;
      const groupVal = Math.round((pDecimal * assetVal) * 100) / 100;
      const valPerPerson = heirCount > 0 ? Math.round((groupVal / heirCount) * 100) / 100 : 0;
      totalMoneyForGroupUSD += groupVal;

      return {
        assetId: asset.id,
        title: asset.title,
        category: asset.category,
        qualityTier: asset.qualityTier,
        tierName: asset.tierName || getTierName(asset.qualityTier),
        groupQuantity: 1,
        quantityPerPerson: 1,
        displayPerPerson: `$${valPerPerson.toLocaleString()}`,
        groupValueUSD: groupVal,
        valuePerPersonUSD: valPerPerson,
      };
    });

    totalMoneyForGroupUSD = Math.round(totalMoneyForGroupUSD * 100) / 100;
    const moneyPerPersonUSD = heirCount > 0 ? Math.round((totalMoneyForGroupUSD / heirCount) * 100) / 100 : 0;
    let moneySummaryText = '';
    if (moneyAssets.length === 0) {
      moneySummaryText = 'Kuma jirto lacag caddaan ama bangi';
    } else {
      moneySummaryText = `Qofkiiba: $${moneyPerPersonUSD.toLocaleString()} USD · Wadarta kooxda: $${totalMoneyForGroupUSD.toLocaleString()} USD`;
    }

    // 3. XOOLO (Livestock)
    let rawTotalHeadsForGroup = 0;
    const livestockAnimals: HeirAssetItemAllocation[] = livestockAssets.map(asset => {
      const assetQty = asset.quantity && asset.quantity > 0 ? asset.quantity : 1;
      const rawGroupQty = pDecimal * assetQty;
      const groupQty = Math.round(rawGroupQty * 100) / 100;
      const qtyPerPerson = heirCount > 0 ? Math.round((rawGroupQty / heirCount) * 100) / 100 : 0;
      const unit = asset.unit || 'Neef';
      const disp = formatLivestockFractionSomali(qtyPerPerson, unit);
      rawTotalHeadsForGroup += rawGroupQty;

      const assetVal = asset.estimatedValueUSD || 0;
      const rawGroupValUSD = pDecimal * assetVal;
      const groupValUSD = Math.round(rawGroupValUSD * 100) / 100;
      const valPerPersonUSD = heirCount > 0 ? Math.round((rawGroupValUSD / heirCount) * 100) / 100 : 0;

      return {
        assetId: asset.id,
        title: asset.title,
        category: asset.category,
        qualityTier: asset.qualityTier,
        tierName: asset.tierName || getTierName(asset.qualityTier),
        location: asset.location || 'Meel Xoolo Dhaqasho',
        totalQuantity: assetQty,
        unit: unit,
        groupQuantity: groupQty,
        quantityPerPerson: qtyPerPerson,
        displayPerPerson: disp,
        groupValueUSD: groupValUSD,
        valuePerPersonUSD: valPerPersonUSD,
      };
    });

    const totalHeadsForGroup = Math.round(rawTotalHeadsForGroup * 100) / 100;
    const headsPerPerson = heirCount > 0 ? Math.round((rawTotalHeadsForGroup / heirCount) * 100) / 100 : 0;
    const livestockDisplayPerPerson = formatLivestockFractionSomali(headsPerPerson, 'Neef');

    let livestockSummaryText = '';
    if (livestockAssets.length === 0) {
      livestockSummaryText = 'Kuma jiraan xoolo nool';
    } else {
      livestockSummaryText = `Qofkiiba: ${livestockDisplayPerPerson} · Wadarta kooxda: ${totalHeadsForGroup} Neef`;
    }

    // 4. HEERKA HANTIDA (Tier 1 Prime, Tier 2 Standard, Tier 3 Basic)
    const computeTierStats = (tier: AssetQualityTier) => {
      let plotsP = 0;
      let livestockP = 0;
      let valP = 0;
      let countItems = 0;

      assets.forEach(a => {
        const itemTier = a.qualityTier || 'tier_1_prime';
        if (itemTier === tier) {
          countItems++;
          const itemVal = a.estimatedValueUSD || 0;
          const groupVal = (pDecimal * itemVal);
          valP += heirCount > 0 ? groupVal / heirCount : 0;

          const itemQty = a.quantity && a.quantity > 0 ? a.quantity : 1;
          const groupQty = (pDecimal * itemQty);
          const perPersonQty = heirCount > 0 ? groupQty / heirCount : 0;

          if (isLandAsset(a)) {
            plotsP += perPersonQty;
          } else if (isLivestockAsset(a)) {
            livestockP += perPersonQty;
          }
        }
      });

      plotsP = Math.round(plotsP * 100) / 100;
      livestockP = Math.round(livestockP * 100) / 100;
      valP = Math.round(valP * 100) / 100;

      const descParts: string[] = [];
      if (plotsP > 0) descParts.push(`${formatPlotFractionSomali(plotsP, 'Plot')}`);
      if (livestockP > 0) descParts.push(`${formatLivestockFractionSomali(livestockP, 'Neef')}`);
      if (valP > 0) descParts.push(`$${valP.toLocaleString()}`);

      const desc = descParts.length > 0 ? descParts.join(' + ') : 'Qayb kuma laha heerkan';

      return {
        plotsPerPerson: plotsP,
        livestockPerPerson: livestockP,
        valuePerPersonUSD: valP,
        itemsCount: countItems,
        descriptionSomali: desc,
      };
    };

    const tier1Stats = computeTierStats('tier_1_prime');
    const tier2Stats = computeTierStats('tier_2_standard');
    const tier3Stats = computeTierStats('tier_3_basic');

    // Sharia Rule Explanation
    let shariaRuleExplanation = '';
    if (share.category === 'spouse') {
      shariaRuleExplanation = `Saamiga Quraanka ee ${share.nameSomali} waa ${share.quranicFraction} (${share.percentage.toFixed(1)}%). Wuxuu/Waxay helaysaa ${share.quranicFraction} dhammaan qaybaha hantida: Dhulka, Lacagta, Xoolaha iyo Heer kasta.`;
    } else if (share.id === 'sons') {
      shariaRuleExplanation = `Wiilasha (Casabah): Wiilkiiba wuxuu helayaa labanlaabka saamiga gabadha (Xeerka 2:1) xagga Dhulka, Xoolaha, Lacagta iyo Heerarka tayada (Heerka 1aad & Heerka 2aad).`;
    } else if (share.id === 'daughters') {
      shariaRuleExplanation = `Gabdhaha: Gabadhiiba waxay helaysaa nuska saamiga wiilka (Xeerka 2:1) iyadoo si siman looga qaybiyey Dhulka, Xoolaha, Lacagta iyo Heer kasta oo hantida ah.`;
    } else if (share.category === 'ascendant') {
      shariaRuleExplanation = `${share.nameSomali}: Saamiga Quraanka ee go'an waa ${share.quranicFraction} (${share.percentage.toFixed(1)}%). Wuxuu/Waxay toos u helaysaa saamigan dhanka Dhulka, Lacagta iyo Xoolaha.`;
    } else {
      shariaRuleExplanation = `${share.nameSomali}: Saamiga sharciga ah ee Faraa'idka waa ${share.quranicFraction} (${share.percentage.toFixed(1)}%).`;
    }

    const resolvedNames = resolveIndividualHeirNames(share.id, heirCount, heirs);
    const individualNames = share.individualNames && share.individualNames.length === heirCount
      ? share.individualNames
      : resolvedNames.individualNames;

    const individuals: IndividualNamedHeirAllocation[] = individualNames.map((personName, idx) => ({
      personIndex: idx,
      personName: personName,
      roleTitleSomali: resolvedNames.singularRoleSomali,
      roleTitleArabic: resolvedNames.singularRoleArabic,
      heirGroupId: share.id,
      category: share.category,
      quranicFractionGroup: share.quranicFraction,
      individualPercentage: heirCount > 0 ? share.percentage / heirCount : 0,
      landDisplay: landDisplayPerPerson,
      landPlotsCount: plotsPerPerson,
      landSqM: landSqMPerPerson,
      moneyAmountUSD: moneyPerPersonUSD,
      livestockDisplay: livestockDisplayPerPerson,
      livestockHeadsCount: headsPerPerson,
      tier1Description: tier1Stats.descriptionSomali,
      tier2Description: tier2Stats.descriptionSomali,
      tier3Description: tier3Stats.descriptionSomali,
      totalEstimatedValueUSD: share.perPersonAmountUSD,
      shariaExplanation: shariaRuleExplanation,
    }));

    return {
      heirId: share.id,
      nameSomali: share.nameSomali,
      nameArabic: share.nameArabic,
      count: heirCount,
      individualNames: individualNames,
      category: share.category,
      quranicFraction: share.quranicFraction,
      percentage: share.percentage,
      land: {
        totalPlotsForGroup: totalPlotsForGroup,
        plotsPerPerson: plotsPerPerson,
        displayPerPerson: landDisplayPerPerson,
        totalSqMForGroup: totalSqMForGroup > 0 ? totalSqMForGroup : undefined,
        sqMPerPerson: landSqMPerPerson,
        parcels: landParcels,
        summaryText: landSummaryText,
      },
      money: {
        totalMoneyForGroupUSD: totalMoneyForGroupUSD,
        moneyPerPersonUSD: moneyPerPersonUSD,
        items: moneyItems,
        summaryText: moneySummaryText,
      },
      livestock: {
        totalHeadsForGroup: totalHeadsForGroup,
        headsPerPerson: headsPerPerson,
        displayPerPerson: livestockDisplayPerPerson,
        animals: livestockAnimals,
        summaryText: livestockSummaryText,
      },
      tierBreakdown: {
        tier1Prime: tier1Stats,
        tier2Standard: tier2Stats,
        tier3Basic: tier3Stats,
      },
      totalEstimatedValueUSD: share.totalAmountUSD,
      perPersonEstimatedValueUSD: share.perPersonAmountUSD,
      shariaRuleExplanation: shariaRuleExplanation,
      individuals: individuals,
    };
  });

  const allIndividualHeirs: IndividualNamedHeirAllocation[] = [];
  heirAllocations.forEach(group => {
    group.individuals.forEach(ind => {
      allIndividualHeirs.push(ind);
    });
  });

  return {
    totalLandPlots: Math.round(totalLandPlots * 100) / 100,
    totalLandParcelsCount: landAssets.length,
    unvaluedPlotsCount: Math.round(unvaluedPlotsCount * 100) / 100,
    totalMoneyUSD: Math.round(totalMoneyUSD * 100) / 100,
    totalLivestockHeads: Math.round(totalLivestockHeads * 100) / 100,
    totalEstateValueUSD: result.netDistributableEstateUSD,
    tier1ItemsCount: tier1Count,
    tier2ItemsCount: tier2Count,
    tier3ItemsCount: tier3Count,
    estateTierLevelDescription: estateTierLevelDesc,
    heirAllocations: heirAllocations,
    allIndividualHeirs: allIndividualHeirs,
  };
}
