import { Currency, SavedInheritanceCase } from '../types/inheritance';
import { hydrateSavedCasesArray } from './caseManagementEngine';

export const APP_BACKUP_SCHEMA_VERSION = 'gis-dhaxalka-backup-v1';

export interface ApplicationBackupEnvelope {
  schemaVersion: typeof APP_BACKUP_SCHEMA_VERSION;
  applicationName: string;
  exportedAt: string;
  activeCaseId: string;
  currency: Currency;
  summary: {
    casesCount: number;
    casesWithMapCount: number;
    totalBlocksCount: number;
    totalFullPlotsCount: number;
  };
  cases: SavedInheritanceCase[];
}

export interface ValidatedBackupPreview {
  schemaVersion: string;
  exportedAt: string;
  casesCount: number;
  casesWithMapCount: number;
  totalBlocksCount: number;
  totalFullPlotsCount: number;
  activeCaseId: string;
  activeCaseReference: string;
  activeCaseName: string;
  currency: Currency;
  caseReferences: string[];
}

const VALID_CURRENCIES: Currency[] = ['USD', 'SOS', 'SLSH', 'SAR', 'AED', 'EUR'];

/**
 * Builds a complete, isolated JSON backup envelope of all saved inheritance cases,
 * linked per-case GIS snapshots, active case selection, and currency settings.
 * Kept strictly separate from GIS layer exports (GeoJSON / CSV / Shapefile).
 */
export function createApplicationBackupPayload(params: {
  savedCases: SavedInheritanceCase[];
  activeCaseId: string;
  currency: Currency;
}): ApplicationBackupEnvelope {
  const clonedCases: SavedInheritanceCase[] = JSON.parse(
    JSON.stringify(params.savedCases)
  );

  const casesWithMapCount = clonedCases.filter((c) => c.hasMapGeometry).length;
  const totalBlocksCount = clonedCases.reduce((sum, c) => sum + (c.blocksCount || 0), 0);
  const totalFullPlotsCount = clonedCases.reduce(
    (sum, c) => sum + (c.fullPlotsCount || 0),
    0
  );

  return {
    schemaVersion: APP_BACKUP_SCHEMA_VERSION,
    applicationName: 'GIS Dhaxalka / Beerta & Dhaxalka',
    exportedAt: new Date().toISOString(),
    activeCaseId: params.activeCaseId,
    currency: VALID_CURRENCIES.includes(params.currency) ? params.currency : 'USD',
    summary: {
      casesCount: clonedCases.length,
      casesWithMapCount,
      totalBlocksCount,
      totalFullPlotsCount,
    },
    cases: clonedCases,
  };
}

/**
 * Downloads the full application backup file and reports success only after completion.
 */
export function downloadApplicationBackupJSON(params: {
  savedCases: SavedInheritanceCase[];
  activeCaseId: string;
  currency: Currency;
}): { ok: true; fileName: string; casesCount: number } | { ok: false; errorSomali: string } {
  try {
    if (!Array.isArray(params.savedCases) || params.savedCases.length === 0) {
      return {
        ok: false,
        errorSomali: 'Ma jiro wax kiis ah oo kaydsan oo laga samayn karo Backup.',
      };
    }

    const payload = createApplicationBackupPayload(params);
    const jsonText = JSON.stringify(payload, null, 2);
    const dateStamp = payload.exportedAt.slice(0, 10);
    const fileName = `GIS_Dhaxalka_Backup_${dateStamp}.json`;

    const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    return {
      ok: true,
      fileName,
      casesCount: payload.cases.length,
    };
  } catch (err) {
    return {
      ok: false,
      errorSomali:
        err instanceof Error
          ? `Kaydinta Backup-ka way fashilantay: ${err.message}`
          : 'Kaydinta Backup-ka way fashilantay.',
    };
  }
}

/**
 * Validates an incoming backup JSON string BEFORE any existing user data is modified,
 * returning hydrated cases + preview metadata so the user can explicitly confirm restore.
 */
export function validateApplicationBackupJSON(
  rawText: string
):
  | {
      ok: true;
      preview: ValidatedBackupPreview;
      hydratedCases: SavedInheritanceCase[];
      activeCaseId: string;
      currency: Currency;
    }
  | {
      ok: false;
      errorSomali: string;
    } {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      errorSomali: 'Faylka Backup-ka waa madhan yahay. Fadlan dooro fayl JSON sax ah.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      errorSomali:
        'Faylkan ma aha JSON sax ah. Hubi inaad dooratay faylka Backup-ka (.json) ee nidaamka.',
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      errorSomali: 'Qaab-dhismeedka faylka Backup-ka ma saxna.',
    };
  }

  const obj = parsed as Record<string, unknown>;

  // Guard against accidentally uploading a GeoJSON file into Full Backup Restore
  if (
    obj.type === 'FeatureCollection' ||
    obj.type === 'Feature' ||
    obj.type === 'Polygon' ||
    obj.type === 'MultiPolygon'
  ) {
    return {
      ok: false,
      errorSomali:
        'Faylkani waa khariidad GeoJSON ah, ma aha Backup-ka guud ee App-ka. Fadlan u isticmaal qaybta "Soo Geli GIS (GeoJSON)".',
    };
  }

  // Support both envelope format ({ schemaVersion, cases: [...] }) and legacy raw SavedInheritanceCase[] array
  let rawCasesArray: unknown[] | null = null;
  let schemaVersion = APP_BACKUP_SCHEMA_VERSION;
  let exportedAt = new Date().toISOString();
  let requestedActiveId = '';
  let requestedCurrency: Currency = 'USD';

  if (Array.isArray(parsed)) {
    rawCasesArray = parsed;
    schemaVersion = 'legacy-cases-array';
  } else if (Array.isArray(obj.cases)) {
    rawCasesArray = obj.cases;
    if (typeof obj.schemaVersion === 'string') {
      schemaVersion = obj.schemaVersion;
    }
    if (typeof obj.exportedAt === 'string') {
      exportedAt = obj.exportedAt;
    }
    if (typeof obj.activeCaseId === 'string') {
      requestedActiveId = obj.activeCaseId;
    }
    if (
      typeof obj.currency === 'string' &&
      VALID_CURRENCIES.includes(obj.currency as Currency)
    ) {
      requestedCurrency = obj.currency as Currency;
    }
  }

  if (!rawCasesArray || rawCasesArray.length === 0) {
    return {
      ok: false,
      errorSomali:
        'Faylka Backup-ka kuma jiraan wax kiisas dhaxal ah oo la soo celin karo.',
    };
  }

  // Verify at least the first record resembles an inheritance case
  const hasValidCaseShape = rawCasesArray.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const rec = item as Record<string, unknown>;
    return (
      typeof rec.caseName === 'string' ||
      typeof rec.referenceNumber === 'string' ||
      (rec.heirsInput && typeof rec.heirsInput === 'object')
    );
  });

  if (!hasValidCaseShape) {
    return {
      ok: false,
      errorSomali:
        'Xogta ku jirta faylkan ma waafaqsana qaabka Kiisaska Dhaxalka. Soo-celinta waa la joojiyey si aan xogtaada loo dhaawicin.',
    };
  }

  const hydratedCases = hydrateSavedCasesArray(rawCasesArray);
  if (hydratedCases.length === 0) {
    return {
      ok: false,
      errorSomali: 'Ma suurtagelin in xogta kiisaska laga akhriyo faylka Backup-ka.',
    };
  }

  const matchedActive =
    hydratedCases.find((c) => c.id === requestedActiveId) || hydratedCases[0];

  const casesWithMapCount = hydratedCases.filter((c) => c.hasMapGeometry).length;
  const totalBlocksCount = hydratedCases.reduce((sum, c) => sum + (c.blocksCount || 0), 0);
  const totalFullPlotsCount = hydratedCases.reduce(
    (sum, c) => sum + (c.fullPlotsCount || 0),
    0
  );

  return {
    ok: true,
    hydratedCases,
    activeCaseId: matchedActive.id,
    currency: matchedActive.currency || requestedCurrency,
    preview: {
      schemaVersion,
      exportedAt,
      casesCount: hydratedCases.length,
      casesWithMapCount,
      totalBlocksCount,
      totalFullPlotsCount,
      activeCaseId: matchedActive.id,
      activeCaseReference: matchedActive.referenceNumber,
      activeCaseName: matchedActive.caseName,
      currency: matchedActive.currency || requestedCurrency,
      caseReferences: hydratedCases.map((c) => `${c.referenceNumber} (${c.caseName})`),
    },
  };
}
