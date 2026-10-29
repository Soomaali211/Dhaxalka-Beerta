import { EstateAssetItem, HeirsInput, QualityTierAllocationResult, AssetQualityTier } from '../types/inheritance';

export function getTierName(tier?: AssetQualityTier): string {
  switch (tier) {
    case 'tier_1_prime':
      return 'Heerka 1aad (Meel Fiican / Prime)';
    case 'tier_2_standard':
      return 'Heerka 2aad (Heer Dhexe / Standard)';
    case 'tier_3_basic':
      return 'Heerka 3aad (Heer Hoose / Duleed)';
    default:
      return 'Heerka 1aad (Meel Fiican / Prime)';
  }
}

/**
 * Calculates physical tier distribution for assets (plots, houses, livestock, farms).
 * Implements the Sharia 2:1 rule strictly within EACH quality tier:
 * "Haddii wiilku helo 2 plot oo meel fiican ah, gabadhuna waxay helaysaa 1 plot oo meel fiican ah."
 */
export function calculateQualityTierDistributions(
  assets: EstateAssetItem[],
  heirs: HeirsInput
): QualityTierAllocationResult[] {
  const sonsCount = heirs.sonsCount || 0;
  const daughtersCount = heirs.daughtersCount || 0;

  // Filter physical assets that have discrete units and tiers (real_estate, farm_land, livestock, or any asset with quantity)
  const physicalAssets = assets.filter(
    a => a.category === 'real_estate' || a.category === 'farm_land' || a.category === 'livestock' || (a.quantity && a.quantity > 0)
  );

  return physicalAssets.map(asset => {
    const qty = asset.quantity && asset.quantity > 0 ? asset.quantity : 1;
    const tier = asset.qualityTier || 'tier_1_prime';
    const tierLabel = asset.tierName || getTierName(tier);
    const unit = asset.unit || (asset.category === 'livestock' ? 'Neef' : asset.category === 'real_estate' ? 'Plot / Guri' : 'Qayb');
    const totalVal = asset.estimatedValueUSD || 0;
    const unitVal = qty > 0 ? totalVal / qty : totalVal;

    // Total child heads in 2:1 ratio: each son counts as 2 shares, each daughter as 1 share
    const totalChildShares = (sonsCount * 2) + (daughtersCount * 1);

    let sonShareUnits = 0;
    let daughterShareUnits = 0;
    let totalSonsUnits = 0;
    let totalDaughtersUnits = 0;
    let undivided = 0;
    let note = '';

    if (totalChildShares > 0) {
      if (sonsCount > 0 && daughtersCount > 0) {
        // Example: 1 son, 1 daughter -> ratio is 2 : 1
        // Per-share unit base:
        const unitPerShare = qty / totalChildShares;
        sonShareUnits = Math.floor(unitPerShare * 2 * 100) / 100;
        daughterShareUnits = Math.floor(unitPerShare * 1 * 100) / 100;

        totalSonsUnits = Math.floor(sonShareUnits * sonsCount * 100) / 100;
        totalDaughtersUnits = Math.floor(daughterShareUnits * daughtersCount * 100) / 100;
        undivided = Math.max(0, Math.round((qty - (totalSonsUnits + totalDaughtersUnits)) * 100) / 100);

        if (undivided === 0) {
          note = `Qayb siman oo 2:1 ah oo dhan: Wiilkiiba wuxuu helay ${sonShareUnits} ${unit}, gabadhiibana ${daughterShareUnits} ${unit} (Heerka: ${tierLabel}).`;
        } else {
          note = `Wiilkiiba: ${sonShareUnits} ${unit}, Gabadhiiba: ${daughterShareUnits} ${unit}. Waxaa dhiman ${undivided} ${unit} oo la wadaagi doono ama la isku magdhabi doono lacag ahaan.`;
        }
      } else if (sonsCount > 0 && daughtersCount === 0) {
        // Only sons
        sonShareUnits = Math.floor((qty / sonsCount) * 100) / 100;
        daughterShareUnits = 0;
        totalSonsUnits = qty;
        totalDaughtersUnits = 0;
        note = `Wiilasha oo kaliya: Wiilkiiba wuxuu helayaa ${sonShareUnits} ${unit} (Heerka: ${tierLabel}).`;
      } else if (sonsCount === 0 && daughtersCount > 0) {
        // Only daughters
        sonShareUnits = 0;
        daughterShareUnits = Math.floor((qty / daughtersCount) * 100) / 100;
        totalSonsUnits = 0;
        totalDaughtersUnits = qty;
        note = `Gabdhaha oo kaliya: Gabadhiiba waxay helaysaa ${daughterShareUnits} ${unit} (Heerka: ${tierLabel}).`;
      }
    } else {
      note = `Ma jiraan wiilal ama gabdho; hantida heerkan ah waxaa loo qaybinayaa sida ku cad saamiyada guud ee dhaxaleeyda kale.`;
    }

    return {
      assetId: asset.id,
      assetTitle: asset.title,
      category: asset.category,
      qualityTier: tier,
      tierName: tierLabel,
      location: asset.location || 'Meel Fiican',
      unit: unit,
      totalQuantity: qty,
      unitValueUSD: Math.round(unitVal * 100) / 100,
      totalValueUSD: totalVal,
      sonShareUnitsPerPerson: sonShareUnits,
      daughterShareUnitsPerPerson: daughterShareUnits,
      totalSonsUnits: totalSonsUnits,
      totalDaughtersUnits: totalDaughtersUnits,
      undividedUnits: undivided,
      undividedNote: note,
    };
  });
}
