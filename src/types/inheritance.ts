export type Gender = 'male' | 'female';

export type Currency = 'USD' | 'SOS' | 'SLSH' | 'SAR' | 'AED' | 'EUR';

export interface CurrencyConfig {
  code: Currency;
  symbol: string;
  nameSomali: string;
  rateToUSD: number;
}

export type AssetQualityTier = 'tier_1_prime' | 'tier_2_standard' | 'tier_3_basic';

export interface EstateAssetItem {
  id: string;
  category: 'cash' | 'bank' | 'real_estate' | 'livestock' | 'farm_land' | 'gold_jewelry' | 'business' | 'receivables' | 'other';
  title: string;
  description?: string;
  quantity?: number;
  unit?: string;
  estimatedValueUSD: number;
  qualityTier?: AssetQualityTier;
  tierName?: string; // e.g. "Heerka 1aad (Meel Fiican / Prime)", "Heerka 2aad (Dhexe)", "Heerka 3aad (Hoose)"
  location?: string; // e.g. "Wadada Laamiga ah", "Bartamaha Magaalada", "Duleedka"
  isUnvaluedLand?: boolean; // Dhul aan lacag ku qiimaysnayn (Plots kaliya oo sidooda loo qaybinayo)
  plotSize?: string; // e.g. "20x20 m²", "400 m²", "15x20 m²"
  plotNumbers?: string; // e.g. "Plot 1 - 12", "Block B (1-8)"
}

export interface HeirPlotShareAllocation {
  heirId: string;
  nameSomali: string;
  nameArabic: string;
  count: number;
  category: HeirCategory;
  quranicFraction: string;
  percentage: number;
  totalPlotsForGroup: number;
  plotsPerPerson: number;
  wholePlotsPerPerson: number;
  fractionalSharePerPerson: number;
  fractionalDisplay: string;
  approxSquareMetersPerPerson?: number;
  explanationSomali: string;
}

export interface LandParcelPlotDistribution {
  assetId: string;
  assetTitle: string;
  location: string;
  qualityTier?: AssetQualityTier;
  tierName?: string;
  totalPlots: number;
  plotSize?: string;
  plotAreaSqM?: number;
  isUnvaluedLand: boolean;
  unit: string;
  heirAllocations: HeirPlotShareAllocation[];
  undividedPlots: number;
  undividedNote: string;
}

export interface TotalPlotSummaryResult {
  totalParcelsCount: number;
  totalPlotsCount: number;
  totalUnvaluedPlotsCount: number;
  parcels: LandParcelPlotDistribution[];
  summaryPerHeir: {
    heirId: string;
    nameSomali: string;
    nameArabic: string;
    count: number;
    quranicFraction: string;
    percentage: number;
    totalPlotsReceived: number;
    plotsPerPerson: number;
    displayPerPerson: string;
  }[];
}

export interface HeirAssetItemAllocation {
  assetId: string;
  title: string;
  category: string;
  qualityTier?: AssetQualityTier;
  tierName?: string;
  location?: string;
  totalQuantity?: number;
  unit?: string;
  groupQuantity: number;
  quantityPerPerson: number;
  displayPerPerson: string;
  groupValueUSD: number;
  valuePerPersonUSD: number;
  approxSqMPerPerson?: number;
  isUnvalued?: boolean;
}

export interface IndividualNamedHeirAllocation {
  personIndex: number;
  personName: string;
  roleTitleSomali: string;
  roleTitleArabic: string;
  heirGroupId: string;
  category: HeirCategory;
  quranicFractionGroup: string;
  individualPercentage: number;
  landDisplay: string;
  landPlotsCount: number;
  landSqM?: number;
  moneyAmountUSD: number;
  livestockDisplay: string;
  livestockHeadsCount: number;
  tier1Description: string;
  tier2Description: string;
  tier3Description: string;
  totalEstimatedValueUSD: number;
  shariaExplanation: string;
}

export interface ComprehensiveHeirAssetAllocation {
  heirId: string;
  nameSomali: string;
  nameArabic: string;
  count: number;
  individualNames: string[];
  category: HeirCategory;
  quranicFraction: string;
  percentage: number;
  
  // 1. Dhul (Land & Plots)
  land: {
    totalPlotsForGroup: number;
    plotsPerPerson: number;
    displayPerPerson: string;
    totalSqMForGroup?: number;
    sqMPerPerson?: number;
    parcels: HeirAssetItemAllocation[];
    summaryText: string;
  };

  // 2. Lacag (Cash, Bank & Monetary Assets)
  money: {
    totalMoneyForGroupUSD: number;
    moneyPerPersonUSD: number;
    items: HeirAssetItemAllocation[];
    summaryText: string;
  };

  // 3. Xoolo (Livestock - Geel, Lo', Ari)
  livestock: {
    totalHeadsForGroup: number;
    headsPerPerson: number;
    displayPerPerson: string;
    animals: HeirAssetItemAllocation[];
    summaryText: string;
  };

  // 4. Heerka Hantida (Asset Quality Tier Breakdown)
  tierBreakdown: {
    tier1Prime: {
      plotsPerPerson: number;
      livestockPerPerson: number;
      valuePerPersonUSD: number;
      itemsCount: number;
      descriptionSomali: string;
    };
    tier2Standard: {
      plotsPerPerson: number;
      livestockPerPerson: number;
      valuePerPersonUSD: number;
      itemsCount: number;
      descriptionSomali: string;
    };
    tier3Basic: {
      plotsPerPerson: number;
      livestockPerPerson: number;
      valuePerPersonUSD: number;
      itemsCount: number;
      descriptionSomali: string;
    };
  };

  totalEstimatedValueUSD: number;
  perPersonEstimatedValueUSD: number;
  shariaRuleExplanation: string;
  individuals: IndividualNamedHeirAllocation[];
}

export interface ComprehensiveEstateDistributionSummary {
  totalLandPlots: number;
  totalLandParcelsCount: number;
  unvaluedPlotsCount: number;
  totalMoneyUSD: number;
  totalLivestockHeads: number;
  totalEstateValueUSD: number;
  
  tier1ItemsCount: number;
  tier2ItemsCount: number;
  tier3ItemsCount: number;
  estateTierLevelDescription: string;
  
  heirAllocations: ComprehensiveHeirAssetAllocation[];
  allIndividualHeirs: IndividualNamedHeirAllocation[];
}

export interface QualityTierAllocationResult {
  assetId: string;
  assetTitle: string;
  category: string;
  qualityTier: AssetQualityTier;
  tierName: string;
  location?: string;
  unit: string;
  totalQuantity: number;
  unitValueUSD: number;
  totalValueUSD: number;
  // Allocation per son & daughter based on 2:1 rule
  sonShareUnitsPerPerson: number;
  daughterShareUnitsPerPerson: number;
  totalSonsUnits: number;
  totalDaughtersUnits: number;
  undividedUnits: number;
  undividedNote: string;
}

export interface EstateDeductionItem {
  id: string;
  category: 'funeral' | 'debt_divine' | 'debt_human' | 'will_wasiyyah';
  title: string;
  description?: string;
  amountUSD: number;
  isCustom?: boolean;
}

export interface HeirsInput {
  deceasedGender: Gender;
  deceasedName: string;
  dateOfDeath?: string;
  
  // Spouses
  wivesCount: number; // 0 to 4 (if male deceased)
  husbandAlive: boolean; // if female deceased
  
  // Children
  sonsCount: number;
  daughtersCount: number;
  
  // Grandchildren (through sons)
  grandsonsCount: number;
  granddaughtersCount: number;
  
  // Parents
  fatherAlive: boolean;
  motherAlive: boolean;
  
  // Grandparents
  paternalGrandfatherAlive: boolean;
  maternalGrandmotherAlive: boolean;
  paternalGrandmotherAlive: boolean;
  
  // Siblings
  fullBrothersCount: number;
  fullSistersCount: number;
  paternalBrothersCount: number;
  paternalSistersCount: number;
  maternalBrothersCount: number; // Akh li-Umm
  maternalSistersCount: number;  // Ukht li-Umm
  
  // Uncles & Nephews
  fullNephewsCount: number; // Wiilasha walaalka dhashay
  paternalNephewsCount: number; // Wiilasha walaalka aabbaha
  fullPaternalUnclesCount: number; // Adeerrada dhashay
  paternalPaternalUnclesCount: number; // Adeerrada aabbaha
  fullCousinsCount: number; // Wiilasha adeerrada dhashay
  paternalCousinsCount: number; // Wiilasha adeerrada aabbaha

  // Optional individual names for each heir role/group
  // e.g. { sons: ['Maxamed Axmed', 'Cali Axmed'], daughters: ['Faadumo Axmed'], wives: ['Xaliimo Cali'], father: ['Xaaji Nuur'] }
  heirNames?: Record<string, string[]>;
}

export type HeirCategory = 'spouse' | 'ascendant' | 'descendant' | 'sibling' | 'collateral';

export type InheritanceReason = 
  | 'fard'          // Saami go'an (Ashab al-Furud)
  | 'tasib'         // Hantida harkaaga/Asabah bi nafsihi
  | 'tasib_bil_ghayr' // Asabah la socota mid kale (wiil & gabadh)
  | 'tasib_maal_ghayr' // Asabah la socota gabadh kale (walaal dheddig la socota gabadh)
  | 'fard_and_tasib' // Saami go'an + Asabah (sida aabbaha marka ay gabadh kaliya joogto)
  | 'mahjub';       // Xanniban (Al-Hujub)

export interface CalculatedHeirShare {
  id: string;
  nameSomali: string;
  nameArabic: string;
  count: number;
  individualNames?: string[];
  category: HeirCategory;
  reason: InheritanceReason;
  quranicFraction: string; // e.g. "1/8", "1/4", "1/2", "2/3", "1/6", "1/3", "Casabah"
  quranicFractionValue: number; // decimal equivalent before awl/radd
  rawShares: number; // Saamiga asalka ah
  tashihShares: number; // Saamiga saxitaanka kadib (Integer shares)
  percentage: number; // 0 to 100
  totalAmountUSD: number;
  perPersonAmountUSD: number;
  quranicProof: string;
  notesSomali: string;
  isBlocked: boolean;
  blockedBy?: string;
}

export interface InheritanceCalculationResult {
  aslAlMasalah: number; // Asalka Mas'alada (e.g. 6, 8, 12, 24)
  awlValue?: number; // Haddii uu cawl jiro (e.g. 13, 15, 17, 27)
  isAwl: boolean;
  isRadd: boolean;
  tashihBase: number; // Asalka saxitaanka kadib
  grossEstateUSD: number;
  totalFuneralUSD: number;
  totalDebtsUSD: number;
  totalWasiyyahUSD: number;
  maxAllowableWasiyyahUSD: number;
  wasiyyahExceededCap: boolean;
  netDistributableEstateUSD: number;
  heirShares: CalculatedHeirShare[];
  blockedHeirs: {
    nameSomali: string;
    nameArabic: string;
    count: number;
    blockedBy: string;
    rule: string;
  }[];
  explanationSomali: string[];
}

export interface SpreadsheetCell {
  row: number;
  col: number; // 0 for A, 1 for B...
  value: string | number;
  formula?: string;
  readOnly?: boolean;
  isHeader?: boolean;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  format?: 'currency' | 'percent' | 'number' | 'text' | 'fraction';
  bg?: string;
}

export interface SpreadsheetSheet {
  id: string;
  name: string;
  rows: number;
  cols: number;
  cells: Record<string, SpreadsheetCell>; // key "R{row}C{col}"
}

export const EMPTY_HEIRS_INPUT: HeirsInput = {
  deceasedGender: 'male',
  deceasedName: '',
  dateOfDeath: '',
  wivesCount: 0,
  husbandAlive: false,
  sonsCount: 0,
  daughtersCount: 0,
  grandsonsCount: 0,
  granddaughtersCount: 0,
  fatherAlive: false,
  motherAlive: false,
  paternalGrandfatherAlive: false,
  maternalGrandmotherAlive: false,
  paternalGrandmotherAlive: false,
  fullBrothersCount: 0,
  fullSistersCount: 0,
  paternalBrothersCount: 0,
  paternalSistersCount: 0,
  maternalBrothersCount: 0,
  maternalSistersCount: 0,
  fullNephewsCount: 0,
  paternalNephewsCount: 0,
  fullPaternalUnclesCount: 0,
  paternalPaternalUnclesCount: 0,
  fullCousinsCount: 0,
  paternalCousinsCount: 0,
  heirNames: {},
};

export type CaseLifecycleStatus = 'cusub' | 'socda' | 'la_xaqiijiyey' | 'la_xidhay';

export interface CaseChangeLogEntry {
  id: string;
  changedAt: string;
  fieldSomali: string;
  previousValue: string;
  newValue: string;
  reason?: string;
  caseStatus: CaseLifecycleStatus;
}

export interface CaseContextMeta {
  caseId?: string;
  caseName: string;
  referenceNumber: string;
  caseDate: string;
  status: CaseLifecycleStatus;
  description?: string;
}

export interface SavedInheritanceCase {
  id: string;
  /** Magaca kiiska (Case Management 1.1) */
  caseName: string;
  /** Reference Number gaar ah oo joogto ah (unique across all cases) */
  referenceNumber: string;
  /** Taariikhda kiiska (YYYY-MM-DD) */
  caseDate: string;
  /** Faahfaahin dheeraad ah (optional) */
  description?: string;
  /** Xaaladda kiiska: Cusub, Socda, La xaqiijiyey, La xidhay */
  status: CaseLifecycleStatus;
  savedAt: string;
  updatedAt: string;
  deceasedName: string;
  deceasedGender: Gender;
  heirsInput: HeirsInput;
  assets: EstateAssetItem[];
  deductions: EstateDeductionItem[];
  currency?: Currency;
  totalGrossEstateUSD: number;
  totalNetEstateUSD: number;
  heirCount: number;
  /** True only when this case explicitly owns/links map geometry */
  hasMapGeometry: boolean;
  /** Human-readable label of linked map source (or "Khariidad ma laha") */
  linkedGeometrySourceLabel?: string;
  blocksCount?: number;
  fullPlotsCount?: number;
  validHalfPlotsCount?: number;
  clippedPlotsCount?: number;
  /** Strictly isolated per-case GIS subdivision & Half Plot validation state */
  landSubdivisionSnapshot?: unknown;
  /** Taariikhda isbeddellada muhiimka ah ee kiiska (Section 1.4) */
  changeHistory: CaseChangeLogEntry[];
}

