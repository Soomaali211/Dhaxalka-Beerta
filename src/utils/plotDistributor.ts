import { 
  EstateAssetItem, 
  InheritanceCalculationResult, 
  HeirsInput,
  LandParcelPlotDistribution, 
  HeirPlotShareAllocation,
  TotalPlotSummaryResult,
  AssetQualityTier
} from '../types/inheritance';
import { getTierName } from './tierAssetDistributor';

/**
 * Extracts approximate square meter area from a plot size string.
 * e.g. "20x20 m²" -> 400, "15x20" -> 300, "400 m²" -> 400, "500 sq m" -> 500
 */
export function parsePlotAreaSqM(plotSizeStr?: string): number | undefined {
  if (!plotSizeStr) return undefined;
  const cleaned = plotSizeStr.trim().toLowerCase();

  // Pattern: NUM x NUM (e.g. "20x20", "15 x 20 m")
  const dimensionMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/);
  if (dimensionMatch) {
    const w = parseFloat(dimensionMatch[1]);
    const l = parseFloat(dimensionMatch[2]);
    if (!isNaN(w) && !isNaN(l)) {
      return Math.round(w * l);
    }
  }

  // Pattern: single number followed by m² or sqm (e.g. "400 m²", "500 sq m")
  const areaMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|mitir)/);
  if (areaMatch) {
    const area = parseFloat(areaMatch[1]);
    if (!isNaN(area)) return Math.round(area);
  }

  return undefined;
}

/**
 * Formats a fractional plot number into a natural Somali description.
 * e.g. 3 -> "3 Baloodh oo dhan"
 * e.g. 1.5 -> "1 Baloodh iyo Bar (1.5)"
 * e.g. 0.5 -> "Nus Baloodh (0.5 / 1/2)"
 * e.g. 2.25 -> "2 Baloodh iyo Rubuc (2.25)"
 * e.g. 2.33 -> "2 Baloodh iyo Sadex-meelood (2.33 / 2⅓)"
 * e.g. 2.67 -> "2 Baloodh iyo 2/3 (2.67)"
 */
export function formatPlotFractionSomali(plots: number, unit: string = 'Baloodh'): string {
  if (plots === 0) return `0 ${unit}`;
  const rounded = Math.round(plots * 100) / 100;
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
 * Calculates distribution for unvalued land and discrete plot assets according to Islamic Fara'id shares.
 * Every eligible heir receives their exact Sharia portion of the plots.
 */
export function calculateLandPlotDistributions(
  assets: EstateAssetItem[],
  result: InheritanceCalculationResult,
  heirs: HeirsInput
): LandParcelPlotDistribution[] {
  // Find all land assets: assets explicitly marked as isUnvaluedLand OR category is real_estate / farm_land with plot units
  const landAssets = assets.filter(a => 
    a.isUnvaluedLand || 
    a.category === 'real_estate' || 
    a.category === 'farm_land' || 
    (a.unit && (a.unit.toLowerCase().includes('plot') || a.unit.toLowerCase().includes('baloodh')))
  );

  const activeHeirShares = result.heirShares.filter(h => h.count > 0 && h.percentage > 0);

  return landAssets.map(asset => {
    const totalPlots = asset.quantity && asset.quantity > 0 ? asset.quantity : 1;
    const unit = asset.unit || 'Baloodh';
    const areaSqM = parsePlotAreaSqM(asset.plotSize);
    const tier = asset.qualityTier || 'tier_1_prime';
    const tierName = asset.tierName || getTierName(tier);
    const isUnvalued = asset.isUnvaluedLand ?? (asset.estimatedValueUSD === 0);

    let distributedTotalPlots = 0;

    const heirAllocations: HeirPlotShareAllocation[] = activeHeirShares.map(share => {
      // Group share in plots based on Sharia percentage
      const rawGroupPlots = (share.percentage / 100) * totalPlots;
      const groupPlots = Math.round(rawGroupPlots * 100) / 100;
      distributedTotalPlots += groupPlots;

      // Per-person share
      const rawPlotsPerPerson = share.count > 0 ? rawGroupPlots / share.count : 0;
      const plotsPerPerson = Math.round(rawPlotsPerPerson * 100) / 100;
      const wholePlots = Math.floor(plotsPerPerson);
      const frac = Math.round((plotsPerPerson - wholePlots) * 100) / 100;

      const fractionalDisplay = formatPlotFractionSomali(plotsPerPerson, unit);
      const sqMPerPerson = areaSqM ? Math.round(plotsPerPerson * areaSqM) : undefined;

      // Somali explanation text
      let explanation = '';
      if (share.category === 'spouse') {
        explanation = `Saamiga sharciga ah ee xaaska/sayga waa ${share.quranicFraction} (${share.percentage.toFixed(1)}%). Waxaa loo qoondeeyey ${groupPlots} ${unit}. Qofkiiba wuxuu helay ${fractionalDisplay}.`;
      } else if (share.id === 'sons') {
        explanation = `Wiilasha (Casabah): Wiilkiiba wuxuu helay ${fractionalDisplay}, waana labanlaabka gabadha (2:1).`;
      } else if (share.id === 'daughters') {
        explanation = `Gabdhaha: Gabadhiiba waxay heshay ${fractionalDisplay}, waana nuska saamiga wiilka (2:1).`;
      } else if (share.category === 'ascendant') {
        explanation = `${share.nameSomali}: Saamiga sharciga waa ${share.quranicFraction} (${share.percentage.toFixed(1)}%). Wuxuu/waxay heshay ${fractionalDisplay}.`;
      } else {
        explanation = `${share.nameSomali}: Saamiga sharciga waa ${share.quranicFraction} (${share.percentage.toFixed(1)}%). Qofkiiba wuxuu helay ${fractionalDisplay}.`;
      }

      return {
        heirId: share.id,
        nameSomali: share.nameSomali,
        nameArabic: share.nameArabic,
        count: share.count,
        category: share.category,
        quranicFraction: share.quranicFraction,
        percentage: share.percentage,
        totalPlotsForGroup: groupPlots,
        plotsPerPerson: plotsPerPerson,
        wholePlotsPerPerson: wholePlots,
        fractionalSharePerPerson: frac,
        fractionalDisplay: fractionalDisplay,
        approxSquareMetersPerPerson: sqMPerPerson,
        explanationSomali: explanation,
      };
    });

    const diff = Math.round((totalPlots - distributedTotalPlots) * 100) / 100;
    const undivided = Math.abs(diff) < 0.05 ? 0 : Math.max(0, diff);

    let note = '';
    if (undivided === 0) {
      note = `Dhammaan ${totalPlots} ${unit} waxaa si buuxda oo caddaalad ah loogu qaybiyey dhaxaleeyda sida ku cad shareecada Islaamka (100%).`;
    } else {
      note = `Waxaa jira ${undivided} ${unit} oo ah saami wadaag dhiman (fractional remainder), dhaxaleeydu way wadaagi karaan ama way isku magdhabi karaan.`;
    }

    return {
      assetId: asset.id,
      assetTitle: asset.title,
      location: asset.location || 'Meel Cayiman',
      qualityTier: tier,
      tierName: tierName,
      totalPlots: totalPlots,
      plotSize: asset.plotSize,
      plotAreaSqM: areaSqM,
      isUnvaluedLand: isUnvalued,
      unit: unit,
      heirAllocations: heirAllocations,
      undividedPlots: undivided,
      undividedNote: note,
    };
  });
}

/**
 * Computes an aggregated summary of all unpriced land plots across all parcels per heir.
 */
export function calculateTotalUnvaluedPlotSummary(
  assets: EstateAssetItem[],
  result: InheritanceCalculationResult,
  heirs: HeirsInput
): TotalPlotSummaryResult {
  const parcels = calculateLandPlotDistributions(assets, result, heirs);
  const totalPlotsCount = parcels.reduce((sum, p) => sum + p.totalPlots, 0);
  const totalUnvaluedPlotsCount = parcels
    .filter(p => p.isUnvaluedLand)
    .reduce((sum, p) => sum + p.totalPlots, 0);

  const activeHeirShares = result.heirShares.filter(h => h.count > 0 && h.percentage > 0);

  const summaryPerHeir = activeHeirShares.map(share => {
    // Sum across all parcels
    let totalPlotsReceived = 0;
    parcels.forEach(p => {
      const alloc = p.heirAllocations.find(a => a.heirId === share.id);
      if (alloc) {
        totalPlotsReceived += alloc.totalPlotsForGroup;
      }
    });

    totalPlotsReceived = Math.round(totalPlotsReceived * 100) / 100;
    const plotsPerPerson = share.count > 0 ? Math.round((totalPlotsReceived / share.count) * 100) / 100 : 0;
    const display = formatPlotFractionSomali(plotsPerPerson, 'Baloodh');

    return {
      heirId: share.id,
      nameSomali: share.nameSomali,
      nameArabic: share.nameArabic,
      count: share.count,
      quranicFraction: share.quranicFraction,
      percentage: share.percentage,
      totalPlotsReceived: totalPlotsReceived,
      plotsPerPerson: plotsPerPerson,
      displayPerPerson: display,
    };
  });

  return {
    totalParcelsCount: parcels.length,
    totalPlotsCount: totalPlotsCount,
    totalUnvaluedPlotsCount: totalUnvaluedPlotsCount,
    parcels: parcels,
    summaryPerHeir: summaryPerHeir,
  };
}
