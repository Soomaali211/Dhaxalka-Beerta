import { 
  HeirsInput, 
  CalculatedHeirShare, 
  InheritanceCalculationResult, 
  EstateAssetItem, 
  EstateDeductionItem 
} from '../types/inheritance';
import { resolveIndividualHeirNames } from './heirNameUtils';

// Helper: Greatest Common Divisor
function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

// Helper: Least Common Multiple
function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(Math.round((a * b) / gcd(a, b)));
}

function lcmArray(arr: number[]): number {
  if (!arr.length) return 1;
  return arr.reduce((acc, val) => lcm(acc, val), arr[0]);
}

interface IntermediateFractionShare {
  id: string;
  nameSomali: string;
  nameArabic: string;
  count: number;
  category: 'spouse' | 'ascendant' | 'descendant' | 'sibling' | 'collateral';
  reason: 'fard' | 'tasib' | 'tasib_bil_ghayr' | 'tasib_maal_ghayr' | 'fard_and_tasib' | 'mahjub';
  fractionStr: string;
  numerator: number;
  denominator: number;
  proof: string;
  notes: string;
  isEligibleForRadd: boolean;
}

export function calculateInheritance(
  input: HeirsInput,
  assets: EstateAssetItem[],
  deductions: EstateDeductionItem[]
): InheritanceCalculationResult {
  // 1. Calculate Gross Estate & Deductions
  const grossEstateUSD = assets.reduce((sum, item) => sum + (item.estimatedValueUSD || 0), 0);
  
  const funeralDeductions = deductions
    .filter(d => d.category === 'funeral')
    .reduce((sum, d) => sum + (d.amountUSD || 0), 0);

  const debtDeductions = deductions
    .filter(d => d.category === 'debt_divine' || d.category === 'debt_human')
    .reduce((sum, d) => sum + (d.amountUSD || 0), 0);

  const requestedWasiyyah = deductions
    .filter(d => d.category === 'will_wasiyyah')
    .reduce((sum, d) => sum + (d.amountUSD || 0), 0);

  // Remainder before wasiyyah
  const remainderBeforeWasiyyah = Math.max(0, grossEstateUSD - funeralDeductions - debtDeductions);
  // Wasiyyah cannot exceed 1/3 (thuluth) of remaining estate after debts
  const maxAllowableWasiyyahUSD = remainderBeforeWasiyyah / 3;
  const wasiyyahExceededCap = requestedWasiyyah > maxAllowableWasiyyahUSD;
  const effectiveWasiyyahUSD = Math.min(requestedWasiyyah, maxAllowableWasiyyahUSD);

  const netDistributableEstateUSD = Math.max(0, remainderBeforeWasiyyah - effectiveWasiyyahUSD);

  // 2. Identify Blocking & Kinship conditions
  const explanations: string[] = [];
  const blockedHeirs: {
    nameSomali: string;
    nameArabic: string;
    count: number;
    blockedBy: string;
    rule: string;
  }[] = [];

  const hasSons = input.sonsCount > 0;
  const hasDaughters = input.daughtersCount > 0;
  const hasGrandsons = input.grandsonsCount > 0;
  const hasGranddaughters = input.granddaughtersCount > 0;
  
  const hasChildren = hasSons || hasDaughters;
  const hasGrandchildren = hasGrandsons || hasGranddaughters;
  const hasDescendants = hasChildren || hasGrandchildren;
  const hasMaleDescendant = hasSons || hasGrandsons;
  const hasFemaleDescendantOnly = hasDescendants && !hasMaleDescendant;

  const totalSiblingsCount = 
    input.fullBrothersCount + input.fullSistersCount +
    input.paternalBrothersCount + input.paternalSistersCount +
    input.maternalBrothersCount + input.maternalSistersCount;

  const intermediateList: IntermediateFractionShare[] = [];

  // ==================== SPOUSE ====================
  if (input.deceasedGender === 'male' && input.wivesCount > 0) {
    const fraction = hasDescendants ? { num: 1, den: 8, str: '1/8' } : { num: 1, den: 4, str: '1/4' };
    intermediateList.push({
      id: 'wives',
      nameSomali: input.wivesCount === 1 ? 'Xaas' : `Xasaska (${input.wivesCount})`,
      nameArabic: input.wivesCount === 1 ? 'الزوجة' : `الزوجات (${input.wivesCount})`,
      count: input.wivesCount,
      category: 'spouse',
      reason: 'fard',
      fractionStr: fraction.str,
      numerator: fraction.num,
      denominator: fraction.den,
      proof: 'Suuradda An-Nisaa (Aayadda 12): "Haddii aad carruur leedihiin waxay leeyihiin 1/8, haddii aydnaan carruur lahaynna 1/4"',
      notes: input.wivesCount > 1 
        ? `Waxay si siman ugu qaybsanayaan saamiga ${fraction.str} ee guud.` 
        : `Waxay qaadanaysaa ${fraction.str} hantida saafiga ah.`,
      isEligibleForRadd: false,
    });
  } else if (input.deceasedGender === 'female' && input.husbandAlive) {
    const fraction = hasDescendants ? { num: 1, den: 4, str: '1/4' } : { num: 1, den: 2, str: '1/2' };
    intermediateList.push({
      id: 'husband',
      nameSomali: 'Sayga (Ninka)',
      nameArabic: 'الزوج',
      count: 1,
      category: 'spouse',
      reason: 'fard',
      fractionStr: fraction.str,
      numerator: fraction.num,
      denominator: fraction.den,
      proof: 'Suuradda An-Nisaa (Aayadda 12): "Waxaad leedihiin 1/2 waxa ay ka tageen xaasaskaagu haddaynaan carruur lahayn, hadday carruur leeyihiinna 1/4"',
      notes: hasDescendants ? 'Carruur ayaa jirta awgeed wuxuu qaadanayaa 1/4.' : 'Carruur ma jirto awgeed wuxuu qaadanayaa 1/2.',
      isEligibleForRadd: false,
    });
  }

  // ==================== MOTHER ====================
  if (input.motherAlive) {
    // Check Umariyatan (Gharrawayn) condition:
    // Spouse + Mother + Father, and NO children, and NOT 2+ siblings
    const isUmariyatan = !hasDescendants && totalSiblingsCount < 2 && input.fatherAlive && 
      ((input.deceasedGender === 'male' && input.wivesCount > 0) || (input.deceasedGender === 'female' && input.husbandAlive));

    if (hasDescendants || totalSiblingsCount >= 2) {
      intermediateList.push({
        id: 'mother',
        nameSomali: 'Hooyada',
        nameArabic: 'الأم',
        count: 1,
        category: 'ascendant',
        reason: 'fard',
        fractionStr: '1/6',
        numerator: 1,
        denominator: 6,
        proof: 'Suuradda An-Nisaa (Aayadda 11): "Labada waalid mid kasta wuxuu leeyahay 1/6 haddii uu marxuumku ka tagay carruur ama walaalo badan"',
        notes: hasDescendants 
          ? 'Carruur ayaa jirta awgeed waxay qaadanaysaa 1/6.' 
          : 'Waxaa jira 2 ama wax ka badan oo walaalo ah awgeed waxay qaadanaysaa 1/6.',
        isEligibleForRadd: true,
      });
    } else if (isUmariyatan) {
      // In Umariyatan, Mother takes 1/3 of remainder after spouse (Thuluth al-baaqi)
      // Spouse takes 1/2 (husband) or 1/4 (wife).
      // If Husband (1/2): Remainder = 1/2. Mother gets 1/3 of 1/2 = 1/6. Father gets 2/6 = 1/3.
      // If Wife (1/4): Remainder = 3/4. Mother gets 1/3 of 3/4 = 1/4. Father gets 2/4 = 1/2.
      const spouseDen = input.deceasedGender === 'female' ? 2 : 4;
      const motherShare = spouseDen === 2 
        ? { num: 1, den: 6, str: '1/6 (1/3 ka soo haray Sayga)' }
        : { num: 1, den: 4, str: '1/4 (1/3 ka soo haray Xaaska)' };

      intermediateList.push({
        id: 'mother',
        nameSomali: 'Hooyada (Mas\'alada Cumariga ah)',
        nameArabic: 'الأم (المسألة العمرية)',
        count: 1,
        category: 'ascendant',
        reason: 'fard',
        fractionStr: motherShare.str,
        numerator: motherShare.num,
        denominator: motherShare.den,
        proof: 'Xukunkii Saxaabada (Sayidna Cumar, Sayidna Cali, Sayidna Cismaan iyo Zayd bin Thaabit): Hooyadu waxay qaadanaysaa 1/3 ka soo hara xaaska/sayga si aabbuhu labanlaabkeeda u helo.',
        notes: 'Mas\'alatu al-Gharrawayn / Umariyatan: 1/3 ka soo haray qaybta xaaska ama sayga.',
        isEligibleForRadd: true,
      });
    } else {
      intermediateList.push({
        id: 'mother',
        nameSomali: 'Hooyada',
        nameArabic: 'الأم',
        count: 1,
        category: 'ascendant',
        reason: 'fard',
        fractionStr: '1/3',
        numerator: 1,
        denominator: 3,
        proof: 'Suuradda An-Nisaa (Aayadda 11): "Haddii uusan carruur lahayn oo ay waalidiintu dhaxlayaan, hooyadu waxay leedahay 1/3"',
        notes: 'Carruur ma jirto, walaalo badanina ma jiraan; waxay qaadanaysaa 1/3 hantida guud.',
        isEligibleForRadd: true,
      });
    }
  }

  // ==================== FATHER ====================
  // Father:
  // - If male descendants: gets 1/6 as Fard.
  // - If female descendants only: gets 1/6 as Fard + Asabah (takes remainder).
  // - If NO descendants: gets Asabah (takes all remainder).
  let fatherTakesFard = false;
  let fatherTakesAsabah = false;

  if (input.fatherAlive) {
    if (hasMaleDescendant) {
      fatherTakesFard = true;
      intermediateList.push({
        id: 'father',
        nameSomali: 'Aabbaha',
        nameArabic: 'الأب',
        count: 1,
        category: 'ascendant',
        reason: 'fard',
        fractionStr: '1/6',
        numerator: 1,
        denominator: 6,
        proof: 'Suuradda An-Nisaa (Aayadda 11): "Labada waalid mid kasta wuxuu leeyahay 1/6 haddii uu marxuumku ka tagay carruur"',
        notes: 'Wiilal ama wiilasha carruurtooda ayaa jira awgeed wuxuu leeyahay 1/6 go\'an.',
        isEligibleForRadd: false,
      });
    } else if (hasFemaleDescendantOnly) {
      fatherTakesFard = true;
      fatherTakesAsabah = true;
      intermediateList.push({
        id: 'father',
        nameSomali: 'Aabbaha',
        nameArabic: 'الأب',
        count: 1,
        category: 'ascendant',
        reason: 'fard_and_tasib',
        fractionStr: '1/6 + Casabah',
        numerator: 1,
        denominator: 6,
        proof: 'Shareecada Islaamka: Aabbuhu wuxuu leeyahay 1/6 fardi ah iyo wixii haraaga ah ee ka soo hara gabdhaha (Casabah).',
        notes: 'Gabdhaha ka dib wuxuu leeyahay 1/6 go\'an oo lagu daray wixii hanti ah ee soo harta.',
        isEligibleForRadd: false,
      });
    } else {
      fatherTakesAsabah = true;
      // He is pure Asabah; we will compute his remainder later!
    }
  }

  // ==================== GRANDPARENTS ====================
  // Paternal Grandfather (Awoowaha):
  if (input.paternalGrandfatherAlive) {
    if (input.fatherAlive) {
      blockedHeirs.push({
        nameSomali: 'Awoowaha (Aabbaha aabbihiis)',
        nameArabic: 'الجد الصحيح (أبو الأب)',
        count: 1,
        blockedBy: 'Aabbaha',
        rule: 'Aabbaha nool ayaa awoowaha xannibaya (Xeerka: Qofka ku xiran marxuumka qof kale ma dhaxlo inta qofkaasi nool yahay).',
      });
    } else {
      // Grandfather stands in place of Father
      if (hasMaleDescendant) {
        intermediateList.push({
          id: 'paternal_grandfather',
          nameSomali: 'Awoowaha (Aabbaha aabbihiis)',
          nameArabic: 'الجد الصحيح',
          count: 1,
          category: 'ascendant',
          reason: 'fard',
          fractionStr: '1/6',
          numerator: 1,
          denominator: 6,
          proof: 'Ijmaaca Saxaabada: Awoowuhu wuxuu galaa kaalinta aabbaha marka aabbuhu maqan yahay.',
          notes: 'Aabbuhu ma noola, carruur lab ahina way jirtaa awgeed wuxuu leeyahay 1/6.',
          isEligibleForRadd: false,
        });
      } else if (hasFemaleDescendantOnly) {
        intermediateList.push({
          id: 'paternal_grandfather',
          nameSomali: 'Awoowaha (Aabbaha aabbihiis)',
          nameArabic: 'الجد الصحيح',
          count: 1,
          category: 'ascendant',
          reason: 'fard_and_tasib',
          fractionStr: '1/6 + Casabah',
          numerator: 1,
          denominator: 6,
          proof: 'Ijmaaca Saxaabada: Wuxuu leeyahay 1/6 fardi ah iyo haraaga (Casabah).',
          notes: 'Wuxuu leeyahay 1/6 iyo wixii ka soo hara gabdhaha.',
          isEligibleForRadd: false,
        });
      } else {
        // Asabah
      }
    }
  }

  // Grandmothers (Ayeeyooyinka):
  const grandmothersEligible: string[] = [];
  if (input.maternalGrandmotherAlive) {
    if (input.motherAlive) {
      blockedHeirs.push({
        nameSomali: 'Ayeeyada Hooyo',
        nameArabic: 'الجدة لأم',
        count: 1,
        blockedBy: 'Hooyada',
        rule: 'Hooyada nool ayaa xannibaysa ayeeyada hooyo.',
      });
    } else {
      grandmothersEligible.push('Ayeeyada Hooyo (أم الأم)');
    }
  }

  if (input.paternalGrandmotherAlive) {
    if (input.motherAlive) {
      blockedHeirs.push({
        nameSomali: 'Ayeeyada Aabbe',
        nameArabic: 'الجدة لأب',
        count: 1,
        blockedBy: 'Hooyada',
        rule: 'Hooyada nool ayaa xannibaysa dhammaan ayeeyooyinka (hooyo iyo aabbeba).',
      });
    } else if (input.fatherAlive) {
      blockedHeirs.push({
        nameSomali: 'Ayeeyada Aabbe',
        nameArabic: 'الجدة لأب',
        count: 1,
        blockedBy: 'Aabbaha',
        rule: 'Aabbaha nool ayaa xannibaya hooyadiis (ayeeyada aabbe).',
      });
    } else {
      grandmothersEligible.push('Ayeeyada Aabbe (أم الأب)');
    }
  }

  if (grandmothersEligible.length > 0) {
    intermediateList.push({
      id: 'grandmothers',
      nameSomali: grandmothersEligible.length === 1 ? grandmothersEligible[0] : `Ayeeyooyinka (${grandmothersEligible.length})`,
      nameArabic: grandmothersEligible.length === 1 ? 'الجدة الصحيحة' : 'الجدات',
      count: grandmothersEligible.length,
      category: 'ascendant',
      reason: 'fard',
      fractionStr: '1/6',
      numerator: 1,
      denominator: 6,
      proof: 'Sunnada Nabiga (NNKH): Ayeeyadu waxay leedahay 1/6 haddii aysan hooyadu joogin.',
      notes: grandmothersEligible.length > 1 ? 'Waxay si siman ugu qaybsanayaan 1/6.' : 'Waxay qaadanaysaa 1/6.',
      isEligibleForRadd: true,
    });
  }

  // ==================== DAUGHTERS & SONS ====================
  // If Sons exist: Daughters are 'Asabah bil-ghayr with Sons (2:1).
  // If NO Sons:
  //   1 Daughter = 1/2
  //   2+ Daughters = 2/3
  if (hasDaughters && !hasSons) {
    const fraction = input.daughtersCount === 1 
      ? { num: 1, den: 2, str: '1/2' }
      : { num: 2, den: 3, str: '2/3' };

    intermediateList.push({
      id: 'daughters',
      nameSomali: input.daughtersCount === 1 ? 'Gabadha' : `Gabdhaha (${input.daughtersCount})`,
      nameArabic: input.daughtersCount === 1 ? 'البنت' : `البنات (${input.daughtersCount})`,
      count: input.daughtersCount,
      category: 'descendant',
      reason: 'fard',
      fractionStr: fraction.str,
      numerator: fraction.num,
      denominator: fraction.den,
      proof: 'Suuradda An-Nisaa (Aayadda 11): "Haddii ay dumar yihiin laba ama wax ka badan waxay leeyihiin 2/3, hadday mid kaliya tahayna waxay leedahay 1/2"',
      notes: input.daughtersCount === 1 
        ? 'Hal gabadh oo aan walaal wiil lahayn waxay leedahay 1/2.' 
        : `${input.daughtersCount} gabdhood waxay si siman ugu qaybsanayaan 2/3.`,
      isEligibleForRadd: true,
    });
  }

  // ==================== GRANDCHILDREN ====================
  if (input.grandsonsCount > 0 || input.granddaughtersCount > 0) {
    if (hasSons) {
      if (input.grandsonsCount > 0) {
        blockedHeirs.push({
          nameSomali: `Wiilasha wiilka (${input.grandsonsCount})`,
          nameArabic: `أبناء الابن (${input.grandsonsCount})`,
          count: input.grandsonsCount,
          blockedBy: 'Wiilka (Wiilasha tooska ah ee marxuumka)',
          rule: 'Wiilka tooska ah ee marxuumka wuxuu xannibaa wiilasha wiilkiisa.',
        });
      }
      if (input.granddaughtersCount > 0) {
        blockedHeirs.push({
          nameSomali: `Gabdhaha wiilka (${input.granddaughtersCount})`,
          nameArabic: `بنات الابن (${input.granddaughtersCount})`,
          count: input.granddaughtersCount,
          blockedBy: 'Wiilka tooska ah ee marxuumka',
          rule: 'Wiilka tooska ah ee marxuumka wuxuu xannibaa gabdhaha wiilkiisa.',
        });
      }
    } else {
      // No direct sons.
      if (input.daughtersCount >= 2 && input.grandsonsCount === 0) {
        // Blocked because 2+ daughters already exhausted the 2/3 maximum share for daughters!
        blockedHeirs.push({
          nameSomali: `Gabdhaha wiilka (${input.granddaughtersCount})`,
          nameArabic: `بنات الابن (${input.granddaughtersCount})`,
          count: input.granddaughtersCount,
          blockedBy: 'Gabdhaha tooska ah oo dhammaystiray 2/3',
          rule: 'Gabdhaha tooska ah oo laba ama ka badan ahi waxay dhammaystireen 2/3 oo ah saamiga ugu sarreeya ee gabdhaha.',
        });
      } else if (input.daughtersCount === 1 && input.grandsonsCount === 0) {
        // Daughter took 1/2; granddaughter takes 1/6 (Takmilat al-thuluthayn - to complete 2/3)
        intermediateList.push({
          id: 'granddaughters',
          nameSomali: input.granddaughtersCount === 1 ? 'Gabadha wiilka' : `Gabdhaha wiilka (${input.granddaughtersCount})`,
          nameArabic: input.granddaughtersCount === 1 ? 'بنت الابن' : `بنات الابن (${input.granddaughtersCount})`,
          count: input.granddaughtersCount,
          category: 'descendant',
          reason: 'fard',
          fractionStr: '1/6',
          numerator: 1,
          denominator: 6,
          proof: 'Xadiiskii Cabdullaahi bin Mascuud (RC) ee Bukhaari: Gabadhu waxay leedahay 1/2, gabadha wiilkuna 1/6 (dhammaystirka 2/3).',
          notes: 'Waxay dhammaystirayaan 2/3 ee saamiga gabdhaha iyaga oo la socda hal gabadh oo toos ah.',
          isEligibleForRadd: true,
        });
      } else if (input.daughtersCount === 0 && input.grandsonsCount === 0) {
        // No daughters, no grandsons: Granddaughters take same as daughters!
        const fraction = input.granddaughtersCount === 1 
          ? { num: 1, den: 2, str: '1/2' }
          : { num: 2, den: 3, str: '2/3' };

        intermediateList.push({
          id: 'granddaughters',
          nameSomali: input.granddaughtersCount === 1 ? 'Gabadha wiilka' : `Gabdhaha wiilka (${input.granddaughtersCount})`,
          nameArabic: input.granddaughtersCount === 1 ? 'بنت الابن' : `بنات الابن (${input.granddaughtersCount})`,
          count: input.granddaughtersCount,
          category: 'descendant',
          reason: 'fard',
          fractionStr: fraction.str,
          numerator: fraction.num,
          denominator: fraction.den,
          proof: 'Ijmaaca Culimada: Gabdhaha wiilku waxay galaan kaalinta gabdhaha tooska ah marka aysan jirin carruur toos ahi.',
          notes: input.granddaughtersCount === 1 ? 'Waxay qaadanaysaa 1/2.' : 'Waxay si siman ugu qaybsanayaan 2/3.',
          isEligibleForRadd: true,
        });
      }
    }
  }

  // ==================== MATERNAL SIBLINGS (Akh/Ukht li-Umm) ====================
  // Maternal siblings are blocked by: Descendants (male or female) OR Ascendants (father, grandfather).
  // If not blocked: 1 sibling gets 1/6; 2+ get 1/3 (divided equally between males and females!).
  const maternalSiblingsCount = input.maternalBrothersCount + input.maternalSistersCount;
  if (maternalSiblingsCount > 0) {
    if (hasDescendants || input.fatherAlive || (input.paternalGrandfatherAlive && !input.fatherAlive)) {
      blockedHeirs.push({
        nameSomali: `Walaalaha hooyada (${maternalSiblingsCount})`,
        nameArabic: `الإخوة والأخوات لأم (${maternalSiblingsCount})`,
        count: maternalSiblingsCount,
        blockedBy: hasDescendants ? 'Carruurta ama carruurta carruurtooda' : 'Aabbaha / Awoowaha',
        rule: 'Walaalaha hooyada waxaa xannibaya faraca dhaxalka (carruurta) iyo asalka labka ah (aabbaha/awoowaha).',
      });
    } else {
      const fraction = maternalSiblingsCount === 1 
        ? { num: 1, den: 6, str: '1/6' }
        : { num: 1, den: 3, str: '1/3' };

      intermediateList.push({
        id: 'maternal_siblings',
        nameSomali: maternalSiblingsCount === 1 ? 'Walaalka/Walaasha Hooyo' : `Walaalaha Hooyo (${maternalSiblingsCount})`,
        nameArabic: 'الإخوة لأم',
        count: maternalSiblingsCount,
        category: 'sibling',
        reason: 'fard',
        fractionStr: fraction.str,
        numerator: fraction.num,
        denominator: fraction.den,
        proof: 'Suuradda An-Nisaa (Aayadda 12): "Haddii marxuumku yahay Kalaalah (aan lahayn waalid iyo carruur) oo uu leeyahay walaal ama walaashii hooyo midkiiba wuxuu leeyahay 1/6, hadday ka badan yihiinna waxay ku shirkoobayaan 1/3 si siman"',
        notes: maternalSiblingsCount > 1 
          ? 'Labka iyo dheddigu si siman ayey ugu qaybsanayaan 1/3 (ma jiro 2:1 xagga walaalaha hooyada).' 
          : 'Wuxuu/Waxay leedahay 1/6.',
        isEligibleForRadd: true,
      });
    }
  }

  // ==================== FULL SIBLINGS & PATERNAL SIBLINGS ====================
  // Blocked by: Son, Grandson, Father (and Paternal Grandfather under Hanafi).
  const isSiblingsBlocked = hasMaleDescendant || input.fatherAlive;

  if (isSiblingsBlocked) {
    if (input.fullBrothersCount > 0 || input.fullSistersCount > 0) {
      blockedHeirs.push({
        nameSomali: `Walaalaha dhashay (${input.fullBrothersCount} lab, ${input.fullSistersCount} dheddig)`,
        nameArabic: 'الإخوة والأخوات الأشقاء',
        count: input.fullBrothersCount + input.fullSistersCount,
        blockedBy: hasMaleDescendant ? 'Wiilasha' : 'Aabbaha',
        rule: 'Wiilasha iyo aabbuhu waxay gebi ahaanba xannibaan walaalaha dhashay.',
      });
    }
    if (input.paternalBrothersCount > 0 || input.paternalSistersCount > 0) {
      blockedHeirs.push({
        nameSomali: `Walaalaha aabbaha (${input.paternalBrothersCount} lab, ${input.paternalSistersCount} dheddig)`,
        nameArabic: 'الإخوة والأخوات لأب',
        count: input.paternalBrothersCount + input.paternalSistersCount,
        blockedBy: hasMaleDescendant ? 'Wiilasha' : 'Aabbaha',
        rule: 'Wiilasha iyo aabbuhu waxay xannibaan walaalaha aabbaha.',
      });
    }
  } else {
    // Siblings are not blocked by male descendants or father.
    // Check if Full Sisters have a Fard (when NO full brothers and NO female descendants):
    if (input.fullBrothersCount === 0 && !hasFemaleDescendantOnly && input.fullSistersCount > 0) {
      const fraction = input.fullSistersCount === 1 
        ? { num: 1, den: 2, str: '1/2' }
        : { num: 2, den: 3, str: '2/3' };

      intermediateList.push({
        id: 'full_sisters',
        nameSomali: input.fullSistersCount === 1 ? 'Walaasha dhalatay' : `Walaalaha dhashay dheddig (${input.fullSistersCount})`,
        nameArabic: input.fullSistersCount === 1 ? 'الأخت الشقيقة' : `الأخوات الشقائق (${input.fullSistersCount})`,
        count: input.fullSistersCount,
        category: 'sibling',
        reason: 'fard',
        fractionStr: fraction.str,
        numerator: fraction.num,
        denominator: fraction.den,
        proof: 'Suuradda An-Nisaa (Aayadda 176 - Aayadda Kalaalah): "Haddii qofku dhinto isagoon carruur lahayn oo uu leeyahay walaashii waxay leedahay 1/2, hadday laba yihiinna waxay leeyihiin 2/3"',
        notes: input.fullSistersCount === 1 ? 'Waxay qaadanaysaa 1/2.' : 'Waxay si siman ugu qaybsanayaan 2/3.',
        isEligibleForRadd: true,
      });
    }
  }

  // ==================== ASABAH (RESIDUAL HEIRS) ====================
  // Check who qualifies as Asabah:
  // Hierarchy of Asabah bi nafsihi:
  // 1. Sons (with daughters as 'Asabah bil-ghayr)
  // 2. Grandsons (with granddaughters)
  // 3. Father (pure Asabah if no descendants)
  // 4. Paternal Grandfather (if no father and no descendants)
  // 5. Full Brothers (with full sisters as Asabah bil-ghayr)
  // 6. Full Sisters with daughters/granddaughters (Asabah ma'al-ghayr)
  // 7. Paternal Brothers (with paternal sisters)
  // 8. Nephews (sons of full brothers)
  // 9. Nephews (sons of paternal brothers)
  // 10. Paternal Uncles (full)
  // 11. Paternal Uncles (paternal)
  // 12. Cousins (sons of full uncles)
  // 13. Cousins (sons of paternal uncles)

  let asabahGroup: {
    id: string;
    nameSomali: string;
    nameArabic: string;
    maleCount: number;
    femaleCount: number;
    proof: string;
    notes: string;
  } | null = null;

  if (hasSons) {
    asabahGroup = {
      id: 'sons_and_daughters',
      nameSomali: input.daughtersCount > 0 
        ? `Wiilasha (${input.sonsCount}) iyo Gabdhaha (${input.daughtersCount})` 
        : `Wiilasha (${input.sonsCount})`,
      nameArabic: input.daughtersCount > 0 ? 'الأبناء والبنات' : 'الأبناء عصبة',
      maleCount: input.sonsCount,
      femaleCount: input.daughtersCount,
      proof: 'Suuradda An-Nisaa (Aayadda 11): "Eebbe wuxuu idiinku dardaarayaa carruurtiinna: Labku wuxuu leeyahay saamiga laba dheddig (للذكر مثل حظ الأنثيين)"',
      notes: 'Casabah bil-ghayr: Wiilku wuxuu qaadanayaa labanlaabka gabadha (2:1).',
    };
  } else if (!hasSons && input.grandsonsCount > 0) {
    asabahGroup = {
      id: 'grandsons_and_granddaughters',
      nameSomali: input.granddaughtersCount > 0 
        ? `Wiilasha wiilka (${input.grandsonsCount}) iyo Gabdhaha wiilka (${input.granddaughtersCount})` 
        : `Wiilasha wiilka (${input.grandsonsCount})`,
      nameArabic: 'أبناء وبنات الابن عصبة',
      maleCount: input.grandsonsCount,
      femaleCount: input.granddaughtersCount,
      proof: 'Shareecada Islaamka: Wiilasha wiilku waxay galaan kaalinta wiilasha tooska ah marka aysan jirin wiilal toos ahi.',
      notes: 'Casabah bil-ghayr: Labku wuxuu qaadanayaa labanlaabka dheddiga (2:1).',
    };
  } else if (!hasDescendants && input.fatherAlive) {
    // Pure Asabah Father
    asabahGroup = {
      id: 'father_pure_asabah',
      nameSomali: 'Aabbaha (Casabah kali)',
      nameArabic: 'الأب (عصبة بالنفس)',
      maleCount: 1,
      femaleCount: 0,
      proof: 'Xadiiska Nabiga (NNKH): "U dhiiba saamiyada ehelkooda, wixii soo harana waxaa leh ninka ugu xiga marxuumka"',
      notes: 'Marxuumku ma laha carruur, aabbuhuna wuxuu qaadanayaa dhammaan hantida ka soo harta saamiyada go\'an.',
    };
  } else if (!hasDescendants && !input.fatherAlive && input.paternalGrandfatherAlive) {
    asabahGroup = {
      id: 'grandfather_pure_asabah',
      nameSomali: 'Awoowaha (Casabah kali)',
      nameArabic: 'الجد الصحيح (عصبة بالنفس)',
      maleCount: 1,
      femaleCount: 0,
      proof: 'Ijmaaca: Awoowuhu wuxuu galaa kaalinta aabbaha marka uusan aabbuhu joogin.',
      notes: 'Dhammaan haraaga hantida ayuu qaadanayaa.',
    };
  } else if (!isSiblingsBlocked && input.fullBrothersCount > 0) {
    asabahGroup = {
      id: 'full_siblings_asabah',
      nameSomali: input.fullSistersCount > 0 
        ? `Walaalaha dhashay: Lab (${input.fullBrothersCount}) iyo Dheddig (${input.fullSistersCount})` 
        : `Walaalaha dhashay lab (${input.fullBrothersCount})`,
      nameArabic: 'الإخوة والأخوات الأشقاء عصبة',
      maleCount: input.fullBrothersCount,
      femaleCount: input.fullSistersCount,
      proof: 'Suuradda An-Nisaa (Aayadda 176): "Hadday yihiin walaalo rag iyo dumar ah, labku wuxuu leeyahay saamiga laba dheddig"',
      notes: 'Casabah bil-ghayr: Walaalka dhashay wuxuu walaashiis ka dhigayaa casabah (2:1).',
    };
  } else if (!isSiblingsBlocked && input.fullBrothersCount === 0 && hasFemaleDescendantOnly && input.fullSistersCount > 0) {
    // Full sister becomes Asabah ma'al ghayr with daughters!
    asabahGroup = {
      id: 'full_sisters_asabah_maal_ghayr',
      nameSomali: input.fullSistersCount === 1 ? 'Walaasha dhalatay (Casabah ma\'al Ghayr)' : `Walaalaha dhashay dheddig (${input.fullSistersCount}) (Casabah)`,
      nameArabic: 'الأخوات الشقائق عصبة مع الغير',
      maleCount: 0,
      femaleCount: input.fullSistersCount,
      proof: 'Xadiiskii Cabdullaahi bin Mascuud: "Walaalaha dheddig ka dhiga casabah marka ay la socdaan gabdhaha"',
      notes: 'Casabah ma\'al ghayr: Waxay qaadanayaan haraaga ka dib markay gabdhuhu qaataan saamigooda.',
    };
  } else if (!isSiblingsBlocked && input.fullBrothersCount === 0 && input.fullSistersCount === 0 && input.paternalBrothersCount > 0) {
    asabahGroup = {
      id: 'paternal_siblings_asabah',
      nameSomali: input.paternalSistersCount > 0 
        ? `Walaalaha aabbaha: Lab (${input.paternalBrothersCount}) iyo Dheddig (${input.paternalSistersCount})` 
        : `Walaalaha aabbaha lab (${input.paternalBrothersCount})`,
      nameArabic: 'الإخوة والأخوات لأب عصبة',
      maleCount: input.paternalBrothersCount,
      femaleCount: input.paternalSistersCount,
      proof: 'Shareecada Islaamka: Walaalaha aabbuhu waxay galaan kaalinta walaalaha dhashay marka aysan jirin walaalo dhashay.',
      notes: 'Casabah bil-ghayr: Labku labanlaabka dheddiga (2:1).',
    };
  } else if (input.fullNephewsCount > 0) {
    asabahGroup = {
      id: 'full_nephews',
      nameSomali: `Wiilasha walaalka dhashay (${input.fullNephewsCount})`,
      nameArabic: `أبناء الأخ الشقيق (${input.fullNephewsCount})`,
      maleCount: input.fullNephewsCount,
      femaleCount: 0,
      proof: 'Shareecada: Wiilasha walaalka dhashay waa casabah bi nafsihi.',
      notes: 'Si siman ayey u qaybsanayaan haraaga.',
    };
  } else if (input.paternalNephewsCount > 0) {
    asabahGroup = {
      id: 'paternal_nephews',
      nameSomali: `Wiilasha walaalka aabbaha (${input.paternalNephewsCount})`,
      nameArabic: `أبناء الأخ لأب (${input.paternalNephewsCount})`,
      maleCount: input.paternalNephewsCount,
      femaleCount: 0,
      proof: 'Shareecada: Wiilasha walaalka aabbaha waa casabah bi nafsihi.',
      notes: 'Si siman ayey u qaybsanayaan haraaga.',
    };
  } else if (input.fullPaternalUnclesCount > 0) {
    asabahGroup = {
      id: 'full_uncles',
      nameSomali: `Adeerrada dhashay (${input.fullPaternalUnclesCount})`,
      nameArabic: `الأعمام الأشقاء (${input.fullPaternalUnclesCount})`,
      maleCount: input.fullPaternalUnclesCount,
      femaleCount: 0,
      proof: 'Shareecada: Adeerrada dhashay waa casabah bi nafsihi.',
      notes: 'Si siman ayey u qaybsanayaan haraaga.',
    };
  } else if (input.paternalPaternalUnclesCount > 0) {
    asabahGroup = {
      id: 'paternal_uncles',
      nameSomali: `Adeerrada aabbaha (${input.paternalPaternalUnclesCount})`,
      nameArabic: `الأعمام لأب (${input.paternalPaternalUnclesCount})`,
      maleCount: input.paternalPaternalUnclesCount,
      femaleCount: 0,
      proof: 'Shareecada: Adeerrada aabbaha ka dhaxeeyo waa casabah.',
      notes: 'Si siman ayey u qaybsanayaan haraaga.',
    };
  } else if (input.fullCousinsCount > 0) {
    asabahGroup = {
      id: 'full_cousins',
      nameSomali: `Wiilasha adeerka dhashay (${input.fullCousinsCount})`,
      nameArabic: `أبناء العم الشقيق (${input.fullCousinsCount})`,
      maleCount: input.fullCousinsCount,
      femaleCount: 0,
      proof: 'Shareecada: Ilma adeerka dhashay waa casabah.',
      notes: 'Si siman ayey u qaybsanayaan haraaga.',
    };
  } else if (input.paternalCousinsCount > 0) {
    asabahGroup = {
      id: 'paternal_cousins',
      nameSomali: `Wiilasha adeerka aabbaha (${input.paternalCousinsCount})`,
      nameArabic: `أبناء العم لأب (${input.paternalCousinsCount})`,
      maleCount: input.paternalCousinsCount,
      femaleCount: 0,
      proof: 'Shareecada: Ilma adeerka aabbaha waa casabah.',
      notes: 'Si siman ayey u qaybsanayaan haraaga.',
    };
  }

  // Also check if Father in 1/6 + Asabah case qualifies as Asabah receiver for remainder
  const fatherNeedsResidualAsWell = fatherTakesAsabah && intermediateList.some(item => item.id === 'father');

  // ==================== ASL AL-MAS'ALAH (BASE DENOMINATOR) ====================
  const denominators = intermediateList.map(item => item.denominator);
  const baseAsl = denominators.length > 0 ? lcmArray(denominators) : 1;

  // Compute raw shares for fard heirs
  let sumFardShares = 0;
  const rawSharesMap: Record<string, number> = {};

  intermediateList.forEach(item => {
    const share = (baseAsl / item.denominator) * item.numerator;
    rawSharesMap[item.id] = share;
    sumFardShares += share;
  });

  let finalBase = baseAsl;
  let isAwl = false;
  let isRadd = false;
  let awlValue: number | undefined;

  // Check Al-'Awl: sum of fard shares > baseAsl
  if (sumFardShares > baseAsl) {
    isAwl = true;
    awlValue = sumFardShares;
    finalBase = sumFardShares;
    explanations.push(
      `Xaalad Cawl ah (العول): Saamiyada go'an wadartoodu (${sumFardShares}) waxay ka badatay asalka mas'alada (${baseAsl}). Sidaa darteed, asalka mas'aladu wuxuu isu beddelayaa ${sumFardShares}, si qof walba saamigiisu ugu yaraado si caddaalad ah oo saami-dhig ah.`
    );
  } else if (sumFardShares < baseAsl) {
    // There is a remainder: (baseAsl - sumFardShares)
    const remainderShares = baseAsl - sumFardShares;

    if (asabahGroup) {
      explanations.push(
        `Casabah (العصبة): Haraaga mas'alada oo dhan ${remainderShares}/${baseAsl} waxaa qaadanaya ${asabahGroup.nameSomali}.`
      );
    } else if (fatherNeedsResidualAsWell) {
      explanations.push(
        `Aabbaha (Casabah): Maadaama marxuumku ka tagay gabdho kaliya, aabbuhu wuxuu leeyahay 1/6 fardi ah iyo haraaga ${remainderShares}/${baseAsl} oo casabah ah.`
      );
    } else {
      // No Asabah exists!
      // This is Al-Radd (الرد) - Return surplus to eligible Ashab al-Furud (excluding spouse under majority view)
      const raddEligibleItems = intermediateList.filter(item => item.isEligibleForRadd);
      if (raddEligibleItems.length > 0) {
        isRadd = true;
        explanations.push(
          `Xaalad Radd ah (الرد): Hantidu waxay ka badatay saamiyada go'an (${sumFardShares} ka mid ah ${baseAsl}), mana jiro qof Casabah ah. Waxaa dheeraadka si saami-dhig ah loogu celinayaa dhaxaleeyda xaqqa u leh radd-ka.`
        );
      }
    }
  } else {
    explanations.push(`Mas'aladu waa mid caddilmi ah (العادلة): Saamiyada go'an waxay si sax ah u leeyihiin 100% (${sumFardShares}/${baseAsl}).`);
  }

  // ==================== TASHIH (INTEGER NORMALIZATION) & SHARES ====================
  // Track exact rational fraction (exactNum / exactDen) of the estate for each group
  // so percentages and Tashih integer shares are 100% accurate even when netDistributableEstateUSD === 0.
  const finalHeirShares: CalculatedHeirShare[] = [];
  const exactGroupFractions: Array<{ num: number; den: number }> = [];

  const pushHeirShareWithExactFraction = (
    share: CalculatedHeirShare,
    exactNum: number,
    exactDen: number
  ) => {
    const safeDen = exactDen > 0 ? exactDen : 1;
    const g = exactNum > 0 ? gcd(exactNum, safeDen) : 1;
    finalHeirShares.push(share);
    exactGroupFractions.push({
      num: Math.round(exactNum / g),
      den: Math.round(safeDen / g),
    });
  };

  if (isAwl) {
    // Under Awl, each fard heir gets rawShares / finalBase (where finalBase === sumFardShares)
    intermediateList.forEach(item => {
      const shares = rawSharesMap[item.id];
      const fractionValue = shares / finalBase;
      const fractionPercent = fractionValue * 100;
      const totalAmount = fractionValue * netDistributableEstateUSD;
      const perPerson = totalAmount / item.count;

      pushHeirShareWithExactFraction(
        {
          id: item.id,
          nameSomali: item.nameSomali,
          nameArabic: item.nameArabic,
          count: item.count,
          category: item.category,
          reason: item.reason,
          quranicFraction: `${shares}/${finalBase} (Cawl ka yimid ${item.fractionStr})`,
          quranicFractionValue: fractionValue,
          rawShares: shares,
          tashihShares: shares,
          percentage: fractionPercent,
          totalAmountUSD: totalAmount,
          perPersonAmountUSD: perPerson,
          quranicProof: item.proof,
          notesSomali: item.notes,
          isBlocked: false,
        },
        shares,
        finalBase
      );
    });
  } else if (isRadd) {
    // Check if spouse exists in Radd case
    const spouseItem = intermediateList.find(i => !i.isEligibleForRadd);
    const nonSpouseItems = intermediateList.filter(i => i.isEligibleForRadd);

    let spouseRawNum = 0;
    const spouseDen = baseAsl;

    if (spouseItem) {
      spouseRawNum = rawSharesMap[spouseItem.id];
      const spouseShareOfEstate = spouseRawNum / spouseDen;
      const spouseTotalUSD = spouseShareOfEstate * netDistributableEstateUSD;

      pushHeirShareWithExactFraction(
        {
          id: spouseItem.id,
          nameSomali: spouseItem.nameSomali,
          nameArabic: spouseItem.nameArabic,
          count: spouseItem.count,
          category: spouseItem.category,
          reason: spouseItem.reason,
          quranicFraction: spouseItem.fractionStr,
          quranicFractionValue: spouseShareOfEstate,
          rawShares: spouseRawNum,
          tashihShares: spouseRawNum,
          percentage: spouseShareOfEstate * 100,
          totalAmountUSD: spouseTotalUSD,
          perPersonAmountUSD: spouseTotalUSD / spouseItem.count,
          quranicProof: spouseItem.proof,
          notesSomali: spouseItem.notes + ' (Sayga/Xaasku ma qaato Radd marka ay ehel kale jiraan).',
          isBlocked: false,
        },
        spouseRawNum,
        spouseDen
      );
    }

    const remainingNum = spouseDen - spouseRawNum; // (1 - spouseShare) = remainingNum / baseAsl
    const sumNonSpouseShares = nonSpouseItems.reduce((s, item) => s + rawSharesMap[item.id], 0);

    nonSpouseItems.forEach(item => {
      const itemRaw = rawSharesMap[item.id];
      // Exact fraction of total estate = (itemRaw / sumNonSpouseShares) * (remainingNum / baseAsl)
      const exactNum = itemRaw * remainingNum;
      const exactDen = (sumNonSpouseShares || 1) * spouseDen;
      const totalFractionValue = exactNum / exactDen;
      const totalAmount = totalFractionValue * netDistributableEstateUSD;
      const totalPercentage = totalFractionValue * 100;

      pushHeirShareWithExactFraction(
        {
          id: item.id,
          nameSomali: item.nameSomali,
          nameArabic: item.nameArabic,
          count: item.count,
          category: item.category,
          reason: item.reason,
          quranicFraction: `${item.fractionStr} + Radd`,
          quranicFractionValue: totalFractionValue,
          rawShares: totalFractionValue * baseAsl,
          tashihShares: itemRaw,
          percentage: totalPercentage,
          totalAmountUSD: totalAmount,
          perPersonAmountUSD: totalAmount / item.count,
          quranicProof: item.proof,
          notesSomali: item.notes + ' (Waxaa lagu daray qayb ka mid ah dheeraadka Radd-ka).',
          isBlocked: false,
        },
        exactNum,
        exactDen
      );
    });
  } else {
    // Standard or Asabah case
    // First push all fard heirs
    intermediateList.forEach(item => {
      if (item.id === 'father' && fatherNeedsResidualAsWell) {
        // Father will have 1/6 + residual combined below
        return;
      }
      const shares = rawSharesMap[item.id];
      const fractionValue = shares / baseAsl;
      const fractionPercent = fractionValue * 100;
      const totalAmount = fractionValue * netDistributableEstateUSD;
      const perPerson = totalAmount / item.count;

      pushHeirShareWithExactFraction(
        {
          id: item.id,
          nameSomali: item.nameSomali,
          nameArabic: item.nameArabic,
          count: item.count,
          category: item.category,
          reason: item.reason,
          quranicFraction: item.fractionStr,
          quranicFractionValue: fractionValue,
          rawShares: shares,
          tashihShares: shares,
          percentage: fractionPercent,
          totalAmountUSD: totalAmount,
          perPersonAmountUSD: perPerson,
          quranicProof: item.proof,
          notesSomali: item.notes,
          isBlocked: false,
        },
        shares,
        baseAsl
      );
    });

    const remainderShares = baseAsl - sumFardShares;
    const remainderUSD = (remainderShares / baseAsl) * netDistributableEstateUSD;

    if (fatherNeedsResidualAsWell) {
      const fatherFardShares = rawSharesMap['father'] || (baseAsl / 6);
      const totalFatherShares = fatherFardShares + remainderShares;
      const fatherFractionValue = totalFatherShares / baseAsl;
      const totalFatherUSD = fatherFractionValue * netDistributableEstateUSD;

      pushHeirShareWithExactFraction(
        {
          id: 'father',
          nameSomali: 'Aabbaha',
          nameArabic: 'الأب',
          count: 1,
          category: 'ascendant',
          reason: 'fard_and_tasib',
          quranicFraction: remainderShares > 0
            ? `1/6 (${fatherFardShares}/${baseAsl}) + Casabah (${remainderShares}/${baseAsl})`
            : '1/6',
          quranicFractionValue: fatherFractionValue,
          rawShares: totalFatherShares,
          tashihShares: totalFatherShares,
          percentage: fatherFractionValue * 100,
          totalAmountUSD: totalFatherUSD,
          perPersonAmountUSD: totalFatherUSD,
          quranicProof: 'Aabbuhu wuxuu leeyahay 1/6 fardi ah marka ay gabdho kaliya joogaan, wixii soo harana isagaa casabah ahaan u qaadanaya.',
          notesSomali: remainderShares > 0
            ? `Wuxuu qaatay 1/6 go'an oo lagu daray dhammaan haraagii hantida (${remainderShares} saami).`
            : `Wuxuu qaatay 1/6 go'an maadaama saamiyada go'an ay dhammaystireen hantida.`,
          isBlocked: false,
        },
        totalFatherShares,
        baseAsl
      );
    } else if (asabahGroup && remainderShares > 0) {
      if (asabahGroup.femaleCount === 0) {
        // Pure males: split remainder equally
        const fractionValue = remainderShares / baseAsl;
        const perPersonUSD = remainderUSD / (asabahGroup.maleCount || 1);
        const category =
          asabahGroup.id === 'sons_and_daughters' || asabahGroup.id === 'grandsons_and_granddaughters'
            ? ('descendant' as const)
            : asabahGroup.id === 'father_pure_asabah' || asabahGroup.id === 'grandfather_pure_asabah'
            ? ('ascendant' as const)
            : asabahGroup.id.includes('siblings')
            ? ('sibling' as const)
            : ('collateral' as const);

        pushHeirShareWithExactFraction(
          {
            id: asabahGroup.id,
            nameSomali: asabahGroup.nameSomali,
            nameArabic: asabahGroup.nameArabic,
            count: asabahGroup.maleCount,
            category,
            reason: 'tasib',
            quranicFraction: `Casabah (${remainderShares}/${baseAsl})`,
            quranicFractionValue: fractionValue,
            rawShares: remainderShares,
            tashihShares: remainderShares,
            percentage: fractionValue * 100,
            totalAmountUSD: remainderUSD,
            perPersonAmountUSD: perPersonUSD,
            quranicProof: asabahGroup.proof,
            notesSomali: asabahGroup.notes,
            isBlocked: false,
          },
          remainderShares,
          baseAsl
        );
      } else if (asabahGroup.maleCount === 0) {
        // Pure females (e.g. Asabah ma'al-ghayr with daughters)
        const fractionValue = remainderShares / baseAsl;
        const perPersonUSD = remainderUSD / (asabahGroup.femaleCount || 1);

        pushHeirShareWithExactFraction(
          {
            id: asabahGroup.id,
            nameSomali: asabahGroup.nameSomali,
            nameArabic: asabahGroup.nameArabic,
            count: asabahGroup.femaleCount,
            category: 'sibling',
            reason: 'tasib_maal_ghayr',
            quranicFraction: `Casabah (${remainderShares}/${baseAsl})`,
            quranicFractionValue: fractionValue,
            rawShares: remainderShares,
            tashihShares: remainderShares,
            percentage: fractionValue * 100,
            totalAmountUSD: remainderUSD,
            perPersonAmountUSD: perPersonUSD,
            quranicProof: asabahGroup.proof,
            notesSomali: asabahGroup.notes,
            isBlocked: false,
          },
          remainderShares,
          baseAsl
        );
      } else {
        // Mixed male and female: 2 shares per male, 1 share per female (Surah An-Nisa 4:11 / 4:176)
        // Compute fractions purely from mathematical Fara'id units so $0 unvalued land/livestock works 100%!
        const maleUnits = asabahGroup.maleCount * 2;
        const femaleUnits = asabahGroup.femaleCount * 1;
        const totalUnits = maleUnits + femaleUnits;

        const maleExactNum = remainderShares * maleUnits;
        const femaleExactNum = remainderShares * femaleUnits;
        const mixedExactDen = baseAsl * totalUnits;

        const maleFractionValue = maleExactNum / mixedExactDen;
        const femaleFractionValue = femaleExactNum / mixedExactDen;

        const maleTotalUSD = maleFractionValue * netDistributableEstateUSD;
        const femaleTotalUSD = femaleFractionValue * netDistributableEstateUSD;

        const isChildren = asabahGroup.id === 'sons_and_daughters';
        const isGrandchildren = asabahGroup.id === 'grandsons_and_granddaughters';
        const isPaternalSiblings = asabahGroup.id === 'paternal_siblings_asabah';

        // Add Males (2 units per male)
        pushHeirShareWithExactFraction(
          {
            id: isChildren
              ? 'sons'
              : isGrandchildren
              ? 'grandsons'
              : isPaternalSiblings
              ? 'paternal_brothers_asabah'
              : 'full_brothers_asabah',
            nameSomali: isChildren
              ? `Wiilasha (${asabahGroup.maleCount})`
              : isGrandchildren
              ? `Wiilasha wiilka (${asabahGroup.maleCount})`
              : isPaternalSiblings
              ? `Walaalaha aabbaha lab (${asabahGroup.maleCount})`
              : `Walaalaha dhashay lab (${asabahGroup.maleCount})`,
            nameArabic: isChildren
              ? `الأبناء (${asabahGroup.maleCount})`
              : isGrandchildren
              ? `أبناء الابن (${asabahGroup.maleCount})`
              : isPaternalSiblings
              ? `الإخوة لأب (${asabahGroup.maleCount})`
              : `الإخوة الأشقاء (${asabahGroup.maleCount})`,
            count: asabahGroup.maleCount,
            category: isChildren || isGrandchildren ? 'descendant' : 'sibling',
            reason: 'tasib_bil_ghayr',
            quranicFraction: 'Casabah (2:1 — Labanlaab)',
            quranicFractionValue: maleFractionValue,
            rawShares: (remainderShares * maleUnits) / totalUnits,
            tashihShares: 0,
            percentage: maleFractionValue * 100,
            totalAmountUSD: maleTotalUSD,
            perPersonAmountUSD: maleTotalUSD / asabahGroup.maleCount,
            quranicProof: asabahGroup.proof,
            notesSomali: 'Casabah bil-ghayr: Qof kasta oo lab ah wuxuu qaadanayaa 2 saami (labanlaabka gabadha).',
            isBlocked: false,
          },
          maleExactNum,
          mixedExactDen
        );

        // Add Females (1 unit per female)
        pushHeirShareWithExactFraction(
          {
            id: isChildren
              ? 'daughters'
              : isGrandchildren
              ? 'granddaughters'
              : isPaternalSiblings
              ? 'paternal_sisters_asabah'
              : 'full_sisters_asabah',
            nameSomali: isChildren
              ? `Gabdhaha (${asabahGroup.femaleCount})`
              : isGrandchildren
              ? `Gabdhaha wiilka (${asabahGroup.femaleCount})`
              : isPaternalSiblings
              ? `Walaalaha aabbaha dheddig (${asabahGroup.femaleCount})`
              : `Walaalaha dhashay dheddig (${asabahGroup.femaleCount})`,
            nameArabic: isChildren
              ? `البنات (${asabahGroup.femaleCount})`
              : isGrandchildren
              ? `بنات الابن (${asabahGroup.femaleCount})`
              : isPaternalSiblings
              ? `الأخوات لأب (${asabahGroup.femaleCount})`
              : `الأخوات الشقائق (${asabahGroup.femaleCount})`,
            count: asabahGroup.femaleCount,
            category: isChildren || isGrandchildren ? 'descendant' : 'sibling',
            reason: 'tasib_bil_ghayr',
            quranicFraction: 'Casabah (2:1 — Hal saami)',
            quranicFractionValue: femaleFractionValue,
            rawShares: (remainderShares * femaleUnits) / totalUnits,
            tashihShares: 0,
            percentage: femaleFractionValue * 100,
            totalAmountUSD: femaleTotalUSD,
            perPersonAmountUSD: femaleTotalUSD / asabahGroup.femaleCount,
            quranicProof: asabahGroup.proof,
            notesSomali: 'Casabah bil-ghayr: Qof kasta oo dheddig ahi waxay qaadanaysaa 1 saami (kala bar labka).',
            isBlocked: false,
          },
          femaleExactNum,
          mixedExactDen
        );
      }
    } else if (asabahGroup && remainderShares === 0) {
      // Saturated fard shares (Istighraq al-Furud) left zero remainder for distant Asabah
      blockedHeirs.push({
        nameSomali: asabahGroup.nameSomali,
        nameArabic: asabahGroup.nameArabic,
        count: asabahGroup.maleCount + asabahGroup.femaleCount,
        blockedBy: "Dhammaystirka Saamiyada Go'an (استغراق الفروض)",
        rule: "Saamiyada go'an ee Quraanka ayaa dhammeeyey 100% hantida, wax haraa ahna uma soo harin casabada.",
      });
    }
  }

  // Exact Rational Tashih Base (مصحح المسألة) so every individual heir receives a whole integer number of shares
  const perPersonDenominators: number[] = isRadd ? [] : [finalBase];
  finalHeirShares.forEach((share, idx) => {
    const frac = exactGroupFractions[idx];
    if (frac && frac.num > 0 && share.count > 0) {
      const personNum = frac.num;
      const personDen = frac.den * share.count;
      const g = gcd(personNum, personDen);
      perPersonDenominators.push(Math.round(personDen / g));
    }
  });

  const tashihBase = perPersonDenominators.length > 0 ? lcmArray(perPersonDenominators) : finalBase;

  finalHeirShares.forEach((share, idx) => {
    const frac = exactGroupFractions[idx];
    if (frac) {
      share.tashihShares = Math.round((tashihBase * frac.num) / frac.den);
    } else {
      share.tashihShares = Math.round(share.quranicFractionValue * tashihBase);
    }
    const resolved = resolveIndividualHeirNames(share.id, share.count, input);
    share.individualNames = resolved.individualNames;
  });

  return {
    aslAlMasalah: baseAsl,
    awlValue,
    isAwl,
    isRadd,
    tashihBase,
    grossEstateUSD,
    totalFuneralUSD: funeralDeductions,
    totalDebtsUSD: debtDeductions,
    totalWasiyyahUSD: effectiveWasiyyahUSD,
    maxAllowableWasiyyahUSD,
    wasiyyahExceededCap,
    netDistributableEstateUSD,
    heirShares: finalHeirShares,
    blockedHeirs,
    explanationSomali: explanations,
  };
}
