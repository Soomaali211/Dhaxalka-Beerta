import {
  CaseChangeLogEntry,
  CaseLifecycleStatus,
  Currency,
  EMPTY_HEIRS_INPUT,
  EstateAssetItem,
  EstateDeductionItem,
  HeirsInput,
  SavedInheritanceCase,
} from '../types/inheritance';
import { LandSubdivisionState, SubdivisionComputationResult } from '../types/landSubdivision';
import { DEFAULT_SUBDIVISION_PARAMS, createAuditEntry } from './landSubdivisionEngine';

export const CASE_STATUS_METADATA: Record<
  CaseLifecycleStatus,
  {
    labelSomali: string;
    descriptionSomali: string;
    textClass: string;
    dotHex: string;
  }
> = {
  cusub: {
    labelSomali: 'Cusub',
    descriptionSomali: 'Kiis cusub oo hadda la diiwaangeliyey',
    textClass: 'text-sky-700',
    dotHex: '#0369a1',
  },
  socda: {
    labelSomali: 'Socda',
    descriptionSomali: 'Kiis xisaabintiisa iyo hubintiisu socoto',
    textClass: 'text-amber-700',
    dotHex: '#b45309',
  },
  la_xaqiijiyey: {
    labelSomali: 'La xaqiijiyey',
    descriptionSomali: 'Kiis la hubiyey oo diyaar u ah fulin/shahaado',
    textClass: 'text-emerald-700',
    dotHex: '#15803d',
  },
  la_xidhay: {
    labelSomali: 'La xidhay',
    descriptionSomali: 'Kiis la soo gabagabeeyey oo la xidhay',
    textClass: 'text-slate-600',
    dotHex: '#475569',
  },
};

/**
 * Generates a unique, permanent Reference Number (e.g. KIIS-2026-0001)
 * guaranteed not to collide with any existing case.
 */
export function generateUniqueCaseReference(
  existingCases: Pick<SavedInheritanceCase, 'referenceNumber'>[],
  dateStr?: string
): string {
  const year = (dateStr && /^\d{4}/.test(dateStr) ? dateStr.slice(0, 4) : String(new Date().getFullYear()));
  const used = new Set(
    existingCases
      .map((c) => (c.referenceNumber || '').trim().toUpperCase())
      .filter(Boolean)
  );
  let seq = existingCases.length + 1;
  while (seq < 999999) {
    const candidate = `KIIS-${year}-${String(seq).padStart(4, '0')}`;
    if (!used.has(candidate)) return candidate;
    seq++;
  }
  return `KIIS-${year}-${Date.now().toString().slice(-6)}`;
}

/**
 * Enforces strict Reference Number uniqueness across all cases (Section 1.1).
 */
export function isReferenceNumberUnique(
  candidateRef: string,
  existingCases: Pick<SavedInheritanceCase, 'id' | 'referenceNumber'>[],
  excludeCaseId?: string
): boolean {
  const clean = candidateRef.trim().toUpperCase();
  if (!clean) return false;
  return !existingCases.some(
    (c) => c.id !== excludeCaseId && (c.referenceNumber || '').trim().toUpperCase() === clean
  );
}

/**
 * Section 1.2: Creates a strictly EMPTY (mapless) LandSubdivisionState.
 * Never attaches previous case geometry or sample geometry automatically!
 */
export function createEmptyLandSubdivisionState(): LandSubdivisionState {
  return {
    boundaryItems: [],
    boundaryFileName: 'Khariidad lama xidhin',
    selectedBoundaryIndex: -1,
    sampleCustom: false,
    sampleCandidates: [],
    sampleFileName: 'Isla file-ka xuduudka ayaa laga qaadan karaa',
    selectedSampleIndex: -1,
    specialAreaItems: [],
    specialAreaFileName: 'GeoJSON polygon — plots iyo half-plots ku jira ayaa la tirinayaa',
    params: { ...DEFAULT_SUBDIVISION_PARAMS },
    prebuiltSubdivision: null,
    nashqadSummary: null,
    extraOverlayLayers: [],
    wadiItems: [],
    wadiFileName: '',
    roadItems: [],
    roadFileName: '',
    cityRoadAnchorLonLat: null,
    autoTierSummary: null,
    blockZones: {},
    zonePresetMode: 'quadrants_4',
    enforceNonAdjacentBlocks: true,
    blockTiers: {},
    plotTierOverrides: {},
    plotMetadata: {},
    blockMetadata: {},
    manualPlotHeirOverrides: {},
    tierUnitPrices: {
      tier_1_prime: 0,
      tier_2_standard: 0,
      tier_3_basic: 0,
    },
    isLinkedToEstate: false,
    includeValidHalfPlotsInAllocation: false,
    halfPlotReviewNotes: {},
    halfPlotValidationHistory: [],
    allocationMode: 'exact_shared',
    approvalStatus: 'draft_proposal',
    auditHistory: [],
  };
}

/**
 * Deep-clones a LandSubdivisionState so two cases NEVER share mutable object references.
 */
export function cloneSubdivisionStateIsolated(state: LandSubdivisionState): LandSubdivisionState {
  return JSON.parse(JSON.stringify(state)) as LandSubdivisionState;
}

/**
 * Checks whether a LandSubdivisionState actually contains map/boundary geometry.
 */
export function doesSubdivisionHaveGeometry(state: LandSubdivisionState | null | undefined): boolean {
  if (!state) return false;
  if (
    state.prebuiltSubdivision &&
    (state.prebuiltSubdivision.plots.length > 0 ||
      state.prebuiltSubdivision.blocks.length > 0 ||
      (state.prebuiltSubdivision.boundaryRingLonLat?.length || 0) >= 3)
  ) {
    return true;
  }
  if (Array.isArray(state.boundaryItems) && state.boundaryItems.length > 0 && state.selectedBoundaryIndex >= 0) {
    return true;
  }
  return false;
}

/**
 * Safely hydrates a per-case LandSubdivisionState WITHOUT injecting sample geometry
 * when the case is mapless!
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hydrateCaseSubdivisionSnapshot(raw: any, hasMapFlag?: boolean): LandSubdivisionState {
  const empty = createEmptyLandSubdivisionState();
  if (!raw || typeof raw !== 'object') {
    return empty;
  }
  if (hasMapFlag === false) {
    return empty;
  }
  const bItems = Array.isArray(raw.boundaryItems) ? raw.boundaryItems : [];
  const prebuilt = raw.prebuiltSubdivision || null;
  return {
    ...empty,
    ...raw,
    boundaryItems: bItems,
    selectedBoundaryIndex:
      typeof raw.selectedBoundaryIndex === 'number'
        ? raw.selectedBoundaryIndex
        : bItems.length > 0
        ? 0
        : -1,
    specialAreaItems: Array.isArray(raw.specialAreaItems) ? raw.specialAreaItems : [],
    specialAreaFileName:
      typeof raw.specialAreaFileName === 'string'
        ? raw.specialAreaFileName
        : empty.specialAreaFileName,
    wadiItems: Array.isArray(raw.wadiItems) ? raw.wadiItems : [],
    wadiFileName: typeof raw.wadiFileName === 'string' ? raw.wadiFileName : '',
    roadItems: Array.isArray(raw.roadItems) ? raw.roadItems : [],
    roadFileName: typeof raw.roadFileName === 'string' ? raw.roadFileName : '',
    cityRoadAnchorLonLat: Array.isArray(raw.cityRoadAnchorLonLat)
      ? raw.cityRoadAnchorLonLat
      : null,
    autoTierSummary: raw.autoTierSummary || null,
    nashqadSummary: raw.nashqadSummary || null,
    extraOverlayLayers: Array.isArray(raw.extraOverlayLayers) ? raw.extraOverlayLayers : [],
    prebuiltSubdivision: prebuilt,
    params: { ...empty.params, ...(raw.params || {}) },
    tierUnitPrices: { ...empty.tierUnitPrices, ...(raw.tierUnitPrices || {}) },
    blockZones: raw.blockZones && typeof raw.blockZones === 'object' ? raw.blockZones : {},
    blockTiers: raw.blockTiers && typeof raw.blockTiers === 'object' ? raw.blockTiers : {},
    plotTierOverrides: raw.plotTierOverrides || {},
    plotMetadata: raw.plotMetadata || {},
    blockMetadata: raw.blockMetadata || {},
    manualPlotHeirOverrides: raw.manualPlotHeirOverrides || {},
    halfPlotReviewNotes: raw.halfPlotReviewNotes || {},
    halfPlotValidationHistory: Array.isArray(raw.halfPlotValidationHistory)
      ? raw.halfPlotValidationHistory
      : [],
    auditHistory: Array.isArray(raw.auditHistory) ? raw.auditHistory : [],
  };
}

/**
 * Migrates/hydrates saved cases from localStorage (`faraid_saved_inheritance_cases`)
 * preserving 100% of existing data while guaranteeing unique Reference Numbers & schema fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hydrateSavedCasesArray(rawList: any): SavedInheritanceCase[] {
  if (!Array.isArray(rawList)) return [];
  const hydrated: SavedInheritanceCase[] = [];

  rawList.forEach((raw, idx) => {
    if (!raw || typeof raw !== 'object') return;
    const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString();
    const caseDate =
      typeof raw.caseDate === 'string' && raw.caseDate.trim()
        ? raw.caseDate
        : savedAt.slice(0, 10);

    let ref = typeof raw.referenceNumber === 'string' ? raw.referenceNumber.trim() : '';
    if (!ref || !isReferenceNumberUnique(ref, hydrated)) {
      ref = generateUniqueCaseReference(hydrated, caseDate);
    }

    const snap = raw.landSubdivisionSnapshot
      ? hydrateCaseSubdivisionSnapshot(raw.landSubdivisionSnapshot, raw.hasMapGeometry)
      : createEmptyLandSubdivisionState();

    const hasMap =
      typeof raw.hasMapGeometry === 'boolean'
        ? raw.hasMapGeometry && doesSubdivisionHaveGeometry(snap)
        : doesSubdivisionHaveGeometry(snap);

    const status: CaseLifecycleStatus =
      raw.status === 'cusub' ||
      raw.status === 'socda' ||
      raw.status === 'la_xaqiijiyey' ||
      raw.status === 'la_xidhay'
        ? raw.status
        : 'socda';

    const deceasedName = String(raw.deceasedName || raw.heirsInput?.deceasedName || '');
    const caseName =
      typeof raw.caseName === 'string' && raw.caseName.trim()
        ? raw.caseName.trim()
        : deceasedName
        ? `Kiiska ${deceasedName}`
        : `Kiiska Dhaxalka #${idx + 1}`;

    hydrated.push({
      id: String(raw.id || `case_${Date.now()}_${idx}`),
      caseName,
      referenceNumber: ref,
      caseDate,
      description: typeof raw.description === 'string' ? raw.description : '',
      status,
      savedAt,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : savedAt,
      deceasedName,
      deceasedGender: raw.deceasedGender === 'female' ? 'female' : 'male',
      heirsInput: raw.heirsInput ? JSON.parse(JSON.stringify(raw.heirsInput)) : { ...EMPTY_HEIRS_INPUT },
      assets: Array.isArray(raw.assets) ? JSON.parse(JSON.stringify(raw.assets)) : [],
      deductions: Array.isArray(raw.deductions) ? JSON.parse(JSON.stringify(raw.deductions)) : [],
      currency: raw.currency || 'USD',
      totalGrossEstateUSD: Number(raw.totalGrossEstateUSD || 0),
      totalNetEstateUSD: Number(raw.totalNetEstateUSD || 0),
      heirCount: Number(raw.heirCount || 0),
      hasMapGeometry: hasMap,
      linkedGeometrySourceLabel: hasMap
        ? String(raw.linkedGeometrySourceLabel || snap.boundaryFileName || 'Khariidad ku xidhan')
        : 'Khariidad ma laha',
      blocksCount: Number(raw.blocksCount || 0),
      fullPlotsCount: Number(raw.fullPlotsCount || 0),
      validHalfPlotsCount: Number(raw.validHalfPlotsCount || 0),
      clippedPlotsCount: Number(raw.clippedPlotsCount || 0),
      landSubdivisionSnapshot: hasMap ? snap : createEmptyLandSubdivisionState(),
      changeHistory: Array.isArray(raw.changeHistory) ? raw.changeHistory : [],
    });
  });

  return hydrated;
}

/**
 * Creates a brand-new isolated Case record.
 * By default (`linkedSubdivision = null`), NO map or sample geometry is attached!
 */
export function createNewManagedCase(params: {
  caseName: string;
  referenceNumber: string;
  caseDate: string;
  description?: string;
  status?: CaseLifecycleStatus;
  deceasedName?: string;
  currency?: Currency;
  existingCases: Pick<SavedInheritanceCase, 'id' | 'referenceNumber'>[];
  explicitlyConfirmedSubdivision?: {
    state: LandSubdivisionState;
    sourceLabel: string;
    blocksCount?: number;
    fullPlotsCount?: number;
    validHalfPlotsCount?: number;
    clippedPlotsCount?: number;
  } | null;
}): { ok: true; caseRecord: SavedInheritanceCase } | { ok: false; errorSomali: string } {
  const cleanName = params.caseName.trim();
  if (!cleanName) {
    return { ok: false, errorSomali: 'Fadlan geli magaca kiiska.' };
  }

  const cleanRef = params.referenceNumber.trim().toUpperCase();
  if (!cleanRef) {
    return { ok: false, errorSomali: 'Fadlan geli Reference Number gaar ah.' };
  }
  if (!isReferenceNumberUnique(cleanRef, params.existingCases)) {
    return {
      ok: false,
      errorSomali: `Reference Number-ka "${cleanRef}" hore ayaa loogu isticmaalay kiis kale. Kiis kasta waa inuu lahaadaa tixraac gaar ah.`,
    };
  }

  const nowIso = new Date().toISOString();
  const status: CaseLifecycleStatus = params.status || 'cusub';
  const currency = params.currency || 'USD';

  const hasExplicitMap = Boolean(
    params.explicitlyConfirmedSubdivision &&
      doesSubdivisionHaveGeometry(params.explicitlyConfirmedSubdivision.state)
  );

  // Isolated deep copy if explicitly confirmed; otherwise strictly mapless!
  const isolatedSubState =
    hasExplicitMap && params.explicitlyConfirmedSubdivision
      ? (() => {
          const cloned = cloneSubdivisionStateIsolated(params.explicitlyConfirmedSubdivision.state);
          // Reset case-specific manual heir overrides & estate link so previous case allocations never leak!
          cloned.manualPlotHeirOverrides = {};
          cloned.isLinkedToEstate = false;
          cloned.approvalStatus = 'draft_proposal';
          cloned.approvedBy = undefined;
          cloned.approvedAt = undefined;
          cloned.auditHistory = [
            createAuditEntry(
              'geojson_import',
              `Geometry si cad loo xaqiijiyey ayaa lagu xidhay kiiska ${cleanRef}: ${params.explicitlyConfirmedSubdivision.sourceLabel}.`
            ),
          ];
          return cloned;
        })()
      : createEmptyLandSubdivisionState();

  const blankHeirs: HeirsInput = {
    ...EMPTY_HEIRS_INPUT,
    deceasedName: params.deceasedName?.trim() || '',
    heirNames: {},
  };

  const initialAssets: EstateAssetItem[] = [
    {
      id: 'quick_money_1',
      category: 'cash',
      title: 'Wadarta Lacagta Dhaxalka',
      quantity: 1,
      unit: currency,
      estimatedValueUSD: 0,
    },
  ];
  const initialDeductions: EstateDeductionItem[] = [];

  const initialLog: CaseChangeLogEntry = {
    id: `chg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    changedAt: nowIso,
    fieldSomali: 'Abuurista Kiiska',
    previousValue: '—',
    newValue: `${cleanName} (${cleanRef}) · ${
      hasExplicitMap
        ? `Khariidad: ${params.explicitlyConfirmedSubdivision?.sourceLabel}`
        : 'Bilaa khariidad'
    }`,
    reason: 'Kiis cusub oo madax-bannaan ayaa la diiwaangeliyey.',
    caseStatus: status,
  };

  const record: SavedInheritanceCase = {
    id: `case_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    caseName: cleanName,
    referenceNumber: cleanRef,
    caseDate: params.caseDate || nowIso.slice(0, 10),
    description: params.description?.trim() || '',
    status,
    savedAt: nowIso,
    updatedAt: nowIso,
    deceasedName: blankHeirs.deceasedName,
    deceasedGender: blankHeirs.deceasedGender,
    heirsInput: blankHeirs,
    assets: initialAssets,
    deductions: initialDeductions,
    currency,
    totalGrossEstateUSD: 0,
    totalNetEstateUSD: 0,
    heirCount: 0,
    hasMapGeometry: hasExplicitMap,
    linkedGeometrySourceLabel: hasExplicitMap
      ? params.explicitlyConfirmedSubdivision?.sourceLabel || isolatedSubState.boundaryFileName
      : 'Khariidad ma laha',
    blocksCount: hasExplicitMap ? params.explicitlyConfirmedSubdivision?.blocksCount || 0 : 0,
    fullPlotsCount: hasExplicitMap ? params.explicitlyConfirmedSubdivision?.fullPlotsCount || 0 : 0,
    validHalfPlotsCount: hasExplicitMap
      ? params.explicitlyConfirmedSubdivision?.validHalfPlotsCount || 0
      : 0,
    clippedPlotsCount: hasExplicitMap
      ? params.explicitlyConfirmedSubdivision?.clippedPlotsCount || 0
      : 0,
    landSubdivisionSnapshot: isolatedSubState,
    changeHistory: [initialLog],
  };

  return { ok: true, caseRecord: record };
}

/**
 * Section 1.4: Computes structured audit/change log entries comparing the previous saved state
 * of a case against the updated values (old value, new value, timestamp, optional reason, status).
 */
export function buildCaseChangeEntries(params: {
  prevCase: SavedInheritanceCase;
  nextMeta: {
    caseName: string;
    caseDate: string;
    description: string;
    status: CaseLifecycleStatus;
  };
  nextHeirCount: number;
  nextNetEstateUSD: number;
  nextHasMap: boolean;
  nextMapLabel: string;
  subdivisionResult: SubdivisionComputationResult | null;
  reason?: string;
}): CaseChangeLogEntry[] {
  const {
    prevCase,
    nextMeta,
    nextHeirCount,
    nextNetEstateUSD,
    nextHasMap,
    nextMapLabel,
    subdivisionResult,
    reason,
  } = params;

  const entries: CaseChangeLogEntry[] = [];
  const nowIso = new Date().toISOString();
  const cleanReason = reason?.trim() || undefined;

  const pushDiff = (fieldSomali: string, prevVal: string, newVal: string) => {
    if (prevVal === newVal) return;
    entries.push({
      id: `chg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      changedAt: nowIso,
      fieldSomali,
      previousValue: prevVal,
      newValue: newVal,
      reason: cleanReason,
      caseStatus: nextMeta.status,
    });
  };

  pushDiff('Magaca Kiiska', prevCase.caseName, nextMeta.caseName);
  pushDiff('Taariikhda Kiiska', prevCase.caseDate, nextMeta.caseDate);
  pushDiff(
    'Xaaladda Kiiska',
    CASE_STATUS_METADATA[prevCase.status].labelSomali,
    CASE_STATUS_METADATA[nextMeta.status].labelSomali
  );
  pushDiff('Faahfaahinta Kiiska', prevCase.description || '—', nextMeta.description || '—');
  pushDiff('Tirada Dhaxlayaasha', `${prevCase.heirCount} qof`, `${nextHeirCount} qof`);
  pushDiff(
    'Hantida Saafiga ah',
    `$${prevCase.totalNetEstateUSD.toLocaleString()}`,
    `$${nextNetEstateUSD.toLocaleString()}`
  );
  pushDiff(
    'Khariidadda Ku Xidhan',
    prevCase.hasMapGeometry ? prevCase.linkedGeometrySourceLabel || 'Khariidad' : 'Khariidad ma laha',
    nextHasMap ? nextMapLabel : 'Khariidad ma laha'
  );

  const nextBlk = nextHasMap && subdivisionResult ? subdivisionResult.blocks.length : 0;
  const nextFull = nextHasMap && subdivisionResult ? subdivisionResult.plots.length : 0;
  const nextHalf =
    nextHasMap && subdivisionResult ? subdivisionResult.halfPlotSummary?.validHalfPlotsCount || 0 : 0;

  pushDiff(
    'Blocks & Plots / Half Plots',
    `${prevCase.blocksCount || 0} Blk · ${prevCase.fullPlotsCount || 0} Plot · ${prevCase.validHalfPlotsCount || 0} Half Plot`,
    `${nextBlk} Blk · ${nextFull} Plot · ${nextHalf} Half Plot`
  );

  if (entries.length === 0 && cleanReason) {
    entries.push({
      id: `chg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      changedAt: nowIso,
      fieldSomali: 'Kaydinta Kiiska',
      previousValue: 'Xogtii hore',
      newValue: 'Waa la xaqiijiyey / la kaydiyey',
      reason: cleanReason,
      caseStatus: nextMeta.status,
    });
  }

  return entries;
}

/**
 * Checks whether a case holds significant data warranting an explicit safety warning before deletion (Section 1.3).
 */
export function doesCaseHoldImportantData(c: SavedInheritanceCase): boolean {
  return (
    c.hasMapGeometry ||
    (c.blocksCount || 0) > 0 ||
    (c.fullPlotsCount || 0) > 0 ||
    c.heirCount > 0 ||
    c.totalGrossEstateUSD > 0 ||
    c.status === 'la_xaqiijiyey' ||
    c.status === 'la_xidhay'
  );
}
