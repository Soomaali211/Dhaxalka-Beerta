import { HeirsInput } from '../types/inheritance';

/**
 * Maps an internal CalculatedHeirShare.id to the canonical key(s) in HeirsInput.heirNames
 * and provides a singular Somali role label for each individual in that group.
 */
export function resolveIndividualHeirNames(
  shareId: string,
  count: number,
  heirsInput: HeirsInput
): {
  individualNames: string[];
  singularRoleSomali: string;
  singularRoleArabic: string;
} {
  const namesMap = heirsInput.heirNames || {};

  const getCustomOrDefault = (key: string, defaultPrefix: string, singleLabel: string): string[] => {
    const customList = namesMap[key] || [];
    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      const custom = customList[i]?.trim();
      if (custom) {
        result.push(custom);
      } else {
        if (count === 1) {
          result.push(singleLabel);
        } else {
          result.push(`${defaultPrefix} ${i + 1}aad`);
        }
      }
    }
    return result;
  };

  switch (shareId) {
    case 'wives':
      return {
        individualNames: getCustomOrDefault('wives', 'Xaaska', 'Xaaska'),
        singularRoleSomali: 'Xaaska',
        singularRoleArabic: 'الزوجة',
      };
    case 'husband':
      return {
        individualNames: getCustomOrDefault('husband', 'Sayga (Ninka)', 'Sayga (Ninka)'),
        singularRoleSomali: 'Sayga (Ninka)',
        singularRoleArabic: 'الزوج',
      };
    case 'sons':
    case 'sons_and_daughters':
      return {
        individualNames: getCustomOrDefault('sons', 'Wiilka', 'Wiilka'),
        singularRoleSomali: 'Wiilka',
        singularRoleArabic: 'الابن',
      };
    case 'daughters':
      return {
        individualNames: getCustomOrDefault('daughters', 'Gabadha', 'Gabadha'),
        singularRoleSomali: 'Gabadha',
        singularRoleArabic: 'البنت',
      };
    case 'father':
    case 'father_pure_asabah':
      return {
        individualNames: getCustomOrDefault('father', 'Aabbaha', 'Aabbaha'),
        singularRoleSomali: 'Aabbaha',
        singularRoleArabic: 'الأب',
      };
    case 'mother':
      return {
        individualNames: getCustomOrDefault('mother', 'Hooyada', 'Hooyada'),
        singularRoleSomali: 'Hooyada',
        singularRoleArabic: 'الأم',
      };
    case 'paternal_grandfather':
    case 'grandfather_pure_asabah':
      return {
        individualNames: getCustomOrDefault('paternalGrandfather', 'Awoowaha', 'Awoowaha (Aabbaha Aabbihiis)'),
        singularRoleSomali: 'Awoowaha',
        singularRoleArabic: 'الجد الصحيح',
      };
    case 'grandmothers': {
      const gmNames: string[] = [];
      if (heirsInput.maternalGrandmotherAlive && !heirsInput.motherAlive) {
        const customM = namesMap['maternalGrandmother']?.[0]?.trim();
        gmNames.push(customM || 'Ayeeyada Hooyo');
      }
      if (heirsInput.paternalGrandmotherAlive && !heirsInput.motherAlive && !heirsInput.fatherAlive) {
        const customP = namesMap['paternalGrandmother']?.[0]?.trim();
        gmNames.push(customP || 'Ayeeyada Aabbe');
      }
      return {
        individualNames: gmNames.length === count ? gmNames : getCustomOrDefault('grandmothers', 'Ayeeyada', 'Ayeeyada'),
        singularRoleSomali: 'Ayeeyada',
        singularRoleArabic: 'الجدة',
      };
    }
    case 'grandsons':
    case 'grandsons_and_granddaughters':
      return {
        individualNames: getCustomOrDefault('grandsons', 'Wiilka Wiilka', 'Wiilka Wiilka'),
        singularRoleSomali: 'Wiilka Wiilka',
        singularRoleArabic: 'ابن الابن',
      };
    case 'granddaughters':
      return {
        individualNames: getCustomOrDefault('granddaughters', 'Gabadha Wiilka', 'Gabadha Wiilka'),
        singularRoleSomali: 'Gabadha Wiilka',
        singularRoleArabic: 'بنت الابن',
      };
    case 'full_brothers':
    case 'full_brothers_asabah':
    case 'full_siblings_asabah':
      return {
        individualNames: getCustomOrDefault('fullBrothers', 'Walaalka Dhashay', 'Walaalka Dhashay'),
        singularRoleSomali: 'Walaalka Dhashay',
        singularRoleArabic: 'الأخ الشقيق',
      };
    case 'full_sisters':
    case 'full_sisters_asabah':
    case 'full_sisters_asabah_maal_ghayr':
      return {
        individualNames: getCustomOrDefault('fullSisters', 'Walaasha Dhalatay', 'Walaasha Dhalatay'),
        singularRoleSomali: 'Walaasha Dhalatay',
        singularRoleArabic: 'الأخت الشقيقة',
      };
    case 'paternal_brothers':
    case 'paternal_brothers_asabah':
    case 'paternal_siblings_asabah':
      return {
        individualNames: getCustomOrDefault('paternalBrothers', 'Walaalka Aabbe', 'Walaalka Aabbe'),
        singularRoleSomali: 'Walaalka Aabbe',
        singularRoleArabic: 'الأخ لأب',
      };
    case 'paternal_sisters':
    case 'paternal_sisters_asabah':
      return {
        individualNames: getCustomOrDefault('paternalSisters', 'Walaasha Aabbe', 'Walaasha Aabbe'),
        singularRoleSomali: 'Walaasha Aabbe',
        singularRoleArabic: 'الأخت لأب',
      };
    case 'maternal_siblings': {
      const mList: string[] = [];
      const bNames = namesMap['maternalBrothers'] || [];
      const sNames = namesMap['maternalSisters'] || [];
      for (let i = 0; i < heirsInput.maternalBrothersCount; i++) {
        mList.push(bNames[i]?.trim() || `Walaalka Hooyo ${i + 1}aad`);
      }
      for (let i = 0; i < heirsInput.maternalSistersCount; i++) {
        mList.push(sNames[i]?.trim() || `Walaasha Hooyo ${i + 1}aad`);
      }
      return {
        individualNames: mList.length === count ? mList : getCustomOrDefault('maternalSiblings', 'Walaalka/Walaasha Hooyo', 'Walaalka/Walaasha Hooyo'),
        singularRoleSomali: 'Walaalka/Walaasha Hooyo',
        singularRoleArabic: 'الأخ/الأخت لأم',
      };
    }
    case 'full_nephews':
      return {
        individualNames: getCustomOrDefault('fullNephews', 'Wiilka Walaalka', 'Wiilka Walaalka Dhashay'),
        singularRoleSomali: 'Wiilka Walaalka',
        singularRoleArabic: 'ابن الأخ الشقيق',
      };
    case 'paternal_nephews':
      return {
        individualNames: getCustomOrDefault('paternalNephews', 'Wiilka Walaalka Aabbe', 'Wiilka Walaalka Aabbe'),
        singularRoleSomali: 'Wiilka Walaalka Aabbe',
        singularRoleArabic: 'ابن الأخ لأب',
      };
    case 'full_uncles':
      return {
        individualNames: getCustomOrDefault('fullPaternalUncles', 'Adeerka Dhashay', 'Adeerka Dhashay'),
        singularRoleSomali: 'Adeerka Dhashay',
        singularRoleArabic: 'العم الشقيق',
      };
    case 'paternal_uncles':
      return {
        individualNames: getCustomOrDefault('paternalPaternalUncles', 'Adeerka Aabbe', 'Adeerka Aabbe'),
        singularRoleSomali: 'Adeerka Aabbe',
        singularRoleArabic: 'العم لأب',
      };
    case 'full_cousins':
      return {
        individualNames: getCustomOrDefault('fullCousins', 'Ilma-adeerka', 'Wiilka Adeerka Dhashay'),
        singularRoleSomali: 'Ilma-adeerka',
        singularRoleArabic: 'ابن العم الشقيق',
      };
    case 'paternal_cousins':
      return {
        individualNames: getCustomOrDefault('paternalCousins', 'Ilma-adeerka Aabbe', 'Wiilka Adeerka Aabbe'),
        singularRoleSomali: 'Ilma-adeerka Aabbe',
        singularRoleArabic: 'ابن العم لأب',
      };
    default:
      return {
        individualNames: getCustomOrDefault(shareId, 'Dhaxalaha', 'Dhaxalaha'),
        singularRoleSomali: 'Dhaxalaha',
        singularRoleArabic: 'الوارث',
      };
  }
}

/**
 * Helper to update a single person's name inside HeirsInput.heirNames
 */
export function updateHeirPersonName(
  heirsInput: HeirsInput,
  groupKey: string,
  personIndex: number,
  newName: string
): HeirsInput {
  const existingNames = heirsInput.heirNames || {};
  const currentGroupList = [...(existingNames[groupKey] || [])];
  currentGroupList[personIndex] = newName;
  return {
    ...heirsInput,
    heirNames: {
      ...existingNames,
      [groupKey]: currentGroupList,
    },
  };
}

/**
 * Maps a CalculatedHeirShare.id back to the primary groupKey used in HeirsInput.heirNames
 */
export function getEditableGroupKeyForShareId(shareId: string): string {
  switch (shareId) {
    case 'wives': return 'wives';
    case 'husband': return 'husband';
    case 'sons':
    case 'sons_and_daughters': return 'sons';
    case 'daughters': return 'daughters';
    case 'father':
    case 'father_pure_asabah': return 'father';
    case 'mother': return 'mother';
    case 'paternal_grandfather':
    case 'grandfather_pure_asabah': return 'paternalGrandfather';
    case 'grandsons':
    case 'grandsons_and_granddaughters': return 'grandsons';
    case 'granddaughters': return 'granddaughters';
    case 'full_brothers':
    case 'full_brothers_asabah':
    case 'full_siblings_asabah': return 'fullBrothers';
    case 'full_sisters':
    case 'full_sisters_asabah':
    case 'full_sisters_asabah_maal_ghayr': return 'fullSisters';
    case 'paternal_brothers':
    case 'paternal_brothers_asabah':
    case 'paternal_siblings_asabah': return 'paternalBrothers';
    case 'paternal_sisters':
    case 'paternal_sisters_asabah': return 'paternalSisters';
    case 'full_nephews': return 'fullNephews';
    case 'paternal_nephews': return 'paternalNephews';
    case 'full_uncles': return 'fullPaternalUncles';
    case 'paternal_uncles': return 'paternalPaternalUncles';
    case 'full_cousins': return 'fullCousins';
    case 'paternal_cousins': return 'paternalCousins';
    default: return shareId;
  }
}
