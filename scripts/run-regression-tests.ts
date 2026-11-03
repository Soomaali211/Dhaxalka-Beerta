import fs from 'node:fs';
import path from 'node:path';
import {
  EMPTY_HEIRS_INPUT,
  EstateAssetItem,
  EstateDeductionItem,
  HeirsInput,
  InheritanceCalculationResult,
} from '../src/types/inheritance';
import { PlotDetailedMetadata } from '../src/types/landSubdivision';
import { calculateInheritance } from '../src/utils/faraidCalculator';
import { calculateComprehensiveEstateDistribution } from '../src/utils/estateAssetDistributionEngine';
import { PRESET_SCENARIOS } from '../src/utils/presets';
import {
  DEFAULT_SUBDIVISION_PARAMS,
  LAND_ALLOCATION_MODE_METADATA,
  allocatePlotsFairlyToHeirs,
  applyHtmlBoundarySelectionChange,
  applyHtmlGeoJsonSlotImport,
  applyHtmlUseSample,
  buildExportLayers,
  buildPlotRegisterCSV,
  computeLandSubdivision,
  computeStandalonePlotModeAllocation,
  createInitialSampleSubdivisionState,
  getDistinctHeirColor,
  inspectMultipleGeoJsonUploads,
  prepareBulkMetadataImportFromCSV,
  syncSubdivisionToEstateAssets,
} from '../src/utils/landSubdivisionEngine';
import { SAMPLE_FARM_GEOJSON } from '../src/utils/sampleGeojson';
import { computeFarmCartographicReport } from '../src/utils/pdfCartographyEngine';
import {
  CORNER_HALF_PLOT_NUMBERS,
  MIDDLE_HALF_PLOT_NUMBERS,
  TARGET_HALF_PLOT_AREA_SQM,
  getExpectedHalfPlotRuleForPlotNumber,
} from '../src/utils/halfPlotGeometryEngine';
import {
  createEmptyLandSubdivisionState,
  createNewManagedCase,
  doesSubdivisionHaveGeometry,
} from '../src/utils/caseManagementEngine';
import {
  computeSavedCaseUnifiedMetrics,
  computeUnifiedFarmMetrics,
  countEnteredHeirs,
} from '../src/utils/unifiedMetrics';
import {
  createUndoRedoHistory,
  performRedo,
  performUndo,
  pushUndoSnapshot,
} from '../src/utils/undoRedoEngine';
import {
  createApplicationBackupPayload,
  validateApplicationBackupJSON,
} from '../src/utils/backupRestoreEngine';
import {
  applyManualTierByBlock,
  applyManualTierByFreehandLasso,
  applyManualTierByPlot,
  applyManualTierToSelectedFeatures,
  computeAutomaticDemAndRoadTiers,
  importSimultaneousFarmGeoJsonFiles,
  selectMapFeaturesByFreehandUtm,
  selectMapFeaturesByPolygonUtm,
  selectMapFeaturesByRadiusUtm,
} from '../src/utils/demAndRoadTierEngine';
import {
  alignAllBlocksToSampleBlock,
  buildNashqadBeerState,
  buildPlotsGeoJsonClipboardText,
  detectWidthBearingFromGeoJson,
  inspectAndClassifyNashqadBeerFiles,
  inspectSampleBlockMetricsFromGeoJson,
  parseGeoJsonPolygonsStrict,
  runSameeNashqadWorkflow,
  splitPairIntoBoundaryAndSampleBlock,
} from '../src/utils/nashqadWorkflowEngine';
import {
  convertKmlTextToGeoJsonObject,
  isLikelyKmlString,
} from '../src/utils/kmlAndGeoJsonParser';
import {
  audit15mAnd90x48mCompliance,
  autoFixToStandard15m90x48,
  buildSurveyBoundaryGeoJsonFromCenter,
  computeOfflineClimatology10Yr,
  runSahankaAiSurvey,
} from '../src/utils/sahankaAiEngine';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, description: string, detail?: string): void {
  if (condition) {
    passedCount++;
    console.log(`  [PASS] ${description}`);
  } else {
    failedCount++;
    console.error(`  [FAIL] ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

function approxEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

console.log('===================================================================');
console.log(' GIS DHAXALKA — PROTECTED ENGINE & GEOMETRY REGRESSION TEST SUITE');
console.log('===================================================================\n');

/* ------------------------------------------------------------------ */
/* 1. INHERITANCE ENGINE REGRESSION TESTS (ALL PRESETS + EDGE CASES)  */
/* ------------------------------------------------------------------ */
console.log('1. Matoorka Xisaabinta Dhaxalka (Faraid Calculation Engine)');

const presetResultsSnapshot: Record<string, InheritanceCalculationResult> = {};

for (const preset of PRESET_SCENARIOS) {
  const res = calculateInheritance(preset.heirs, preset.assets, preset.deductions);
  presetResultsSnapshot[preset.id] = res;

  const sumPct = res.heirShares.reduce((s, h) => s + h.percentage, 0);
  const sumAmount = res.heirShares.reduce((s, h) => s + h.totalAmountUSD, 0);

  assert(
    res.heirShares.length > 0,
    `Preset [${preset.id}] produces active heir shares (${res.heirShares.length} groups)`
  );
  assert(
    approxEqual(sumPct, 100, 1e-3),
    `Preset [${preset.id}] total share percentages sum to 100% (got ${sumPct.toFixed(4)}%)`
  );
  assert(
    approxEqual(sumAmount, res.netDistributableEstateUSD, 1e-2),
    `Preset [${preset.id}] distributed USD matches netDistributableEstateUSD ($${res.netDistributableEstateUSD})`
  );
}

// Compare or record golden baseline of all preset calculation outputs
const baselinePath = path.resolve(process.cwd(), 'scripts', 'regression-baseline.json');
if (!fs.existsSync(baselinePath)) {
  fs.writeFileSync(baselinePath, JSON.stringify(presetResultsSnapshot, null, 2), 'utf-8');
  assert(true, 'Recorded golden baseline snapshot in scripts/regression-baseline.json');
} else {
  const savedBaseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
  assert(
    JSON.stringify(savedBaseline) === JSON.stringify(presetResultsSnapshot),
    'Golden baseline comparison: 100% identical inheritance outputs across all preset cases'
  );
}

// Specific mathematical verification on classic Shariah cases:
// A) Al-Minbariyyah (Awl 24 -> 27): Wife (3/27), 2 Daughters (16/27), Father (4/27), Mother (4/27)
const minbariyyah = PRESET_SCENARIOS.find((p) => p.id === 'masalah_minbariyyah')!;
const minbRes = presetResultsSnapshot['masalah_minbariyyah'];
assert(
  minbRes.aslAlMasalah === 24 && minbRes.isAwl === true && minbRes.awlValue === 27,
  'Al-Minbariyyah exact Awl invariant: aslAlMasalah=24, isAwl=true, awlValue=27',
  `Got asl=${minbRes.aslAlMasalah}, isAwl=${minbRes.isAwl}, awl=${minbRes.awlValue}`
);
const minbWife = minbRes.heirShares.find((h) => h.category === 'spouse');
assert(
  Boolean(minbWife && approxEqual(minbWife.totalAmountUSD, 6000, 1e-2)),
  'Al-Minbariyyah Wife receives exact 3/27 of $54,000 = $6,000',
  `Got ${minbWife?.totalAmountUSD}`
);

// B) Al-Umariyatan / Gharrawayn: Husband (1/2 = $30k), Mother (1/3 of remainder = $10k), Father (2/3 of remainder = $20k)
const umarRes = presetResultsSnapshot['masalah_umariyatan'];
const umarMother = umarRes.heirShares.find((h) => h.id === 'mother');
const umarFather = umarRes.heirShares.find((h) => h.id === 'father_pure_asabah' || h.id === 'father');
assert(
  Boolean(
    umarMother &&
      umarFather &&
      approxEqual(umarMother.totalAmountUSD, 10000, 1e-2) &&
      approxEqual(umarFather.totalAmountUSD, 20000, 1e-2)
  ),
  'Al-Umariyatan exact 1/3 remainder rule: Mother=$10,000, Father=$20,000 of $60,000',
  `Got mother=${umarMother?.totalAmountUSD}, father=${umarFather?.totalAmountUSD}`
);

// C) Al-Radd: 1 Daughter + Mother -> 3:1 ratio ($30,000 and $10,000 of $40,000)
const raddRes = presetResultsSnapshot['case_radd'];
const raddDaughter = raddRes.heirShares.find((h) => h.id === 'daughters');
const raddMother = raddRes.heirShares.find((h) => h.id === 'mother');
assert(
  Boolean(
    raddRes.isRadd &&
      raddDaughter &&
      raddMother &&
      approxEqual(raddDaughter.totalAmountUSD, 30000, 1e-2) &&
      approxEqual(raddMother.totalAmountUSD, 10000, 1e-2)
  ),
  'Al-Radd exact proportional return: Daughter=$30,000 (75%), Mother=$10,000 (25%)'
);

// D) Wasiyyah 1/3 Cap & Debt Order: Gross $100k - Funeral $2k - Debt $8k = $90k -> Max Wasiyyah = $30k
const capHeirs: HeirsInput = {
  ...EMPTY_HEIRS_INPUT,
  deceasedGender: 'male',
  sonsCount: 1,
};
const capAssets: EstateAssetItem[] = [
  { id: 'c1', category: 'cash', title: 'Cash', estimatedValueUSD: 100000 },
];
const capDeductions: EstateDeductionItem[] = [
  { id: 'd1', category: 'funeral', title: 'Funeral', amountUSD: 2000 },
  { id: 'd2', category: 'debt_human', title: 'Debt', amountUSD: 8000 },
  { id: 'd3', category: 'will_wasiyyah', title: 'Excessive Will', amountUSD: 50000 },
];
const capRes = calculateInheritance(capHeirs, capAssets, capDeductions);
assert(
  capRes.wasiyyahExceededCap === true &&
    approxEqual(capRes.maxAllowableWasiyyahUSD, 30000, 1e-2) &&
    approxEqual(capRes.totalWasiyyahUSD, 30000, 1e-2) &&
    approxEqual(capRes.netDistributableEstateUSD, 60000, 1e-2),
  'Wasiyyah 1/3 cap strictly enforced after funeral & debts ($90k -> max $30k will, $60k net)'
);

// E) Unvalued ($0) 24-Plot Estate Distribution preserves exact plot counts
const unpricedPreset = PRESET_SCENARIOS.find((p) => p.id === 'unpriced_land_plots')!;
const unpricedCalc = presetResultsSnapshot['unpriced_land_plots'];
const compDist = calculateComprehensiveEstateDistribution(
  unpricedPreset.assets,
  unpricedCalc,
  unpricedPreset.heirs
);
const wifeComp = compDist.heirAllocations.find((h) => h.heirId === 'wives');
const motherComp = compDist.heirAllocations.find((h) => h.heirId === 'mother');
assert(
  Boolean(
    wifeComp &&
      motherComp &&
      approxEqual(wifeComp.land.totalPlotsForGroup, 3, 1e-4) &&
      approxEqual(motherComp.land.totalPlotsForGroup, 4, 1e-4)
  ),
  'Unvalued 24-plot land distribution preserves exact physical plot shares (Wife=3 plots, Mother=4 plots)'
);

/* ------------------------------------------------------------------ */
/* 2. GIS BLOCK, PLOT & HALF-PLOT GEOMETRY RULES                      */
/* ------------------------------------------------------------------ */
console.log('\n2. Xeerarka GIS, Blocks (48×90m), Plots (18×24m) & Half-Plots');

assert(
  DEFAULT_SUBDIVISION_PARAMS.W === 48 &&
    DEFAULT_SUBDIVISION_PARAMS.L === 90 &&
    DEFAULT_SUBDIVISION_PARAMS.pw === 18 &&
    DEFAULT_SUBDIVISION_PARAMS.pd === 24,
  'Approved block & plot dimensions preserved: Block 48×90m, Full Plot 18×24m'
);

assert(
  JSON.stringify(CORNER_HALF_PLOT_NUMBERS) === JSON.stringify([1, 5, 6, 10]) &&
    JSON.stringify(MIDDLE_HALF_PLOT_NUMBERS) === JSON.stringify([2, 3, 4, 7, 8, 9]) &&
    TARGET_HALF_PLOT_AREA_SQM === 216,
  'Half-plot positional sets preserved: [1,5,6,10] corner & [2,3,4,7,8,9] middle (216 m²)'
);

for (const pos of [1, 5, 6, 10]) {
  const rule = getExpectedHalfPlotRuleForPlotNumber(pos, 10);
  assert(
    rule.ruleCode === '12x18' && rule.targetAreaSqM === 216,
    `Half-plot position ${pos} enforces exact 12 × 18 m rule (got ${rule.label})`
  );
}

for (const pos of [2, 3, 4, 7, 8, 9]) {
  const rule = getExpectedHalfPlotRuleForPlotNumber(pos, 10);
  assert(
    rule.ruleCode === '9x24' && rule.targetAreaSqM === 216,
    `Half-plot position ${pos} enforces exact 9 × 24 m rule (got ${rule.label})`
  );
}

// Compute actual subdivision on sample farm boundary
const sampleSubState = createInitialSampleSubdivisionState();
const sampleBoundary = sampleSubState.boundaryItems[sampleSubState.selectedBoundaryIndex] || null;
const sampleCand =
  sampleSubState.selectedSampleIndex >= 0
    ? sampleSubState.sampleCandidates[sampleSubState.selectedSampleIndex] || null
    : null;
const sampleSubResult = computeLandSubdivision(
  sampleBoundary,
  sampleCand,
  sampleSubState.params,
  sampleSubState.prebuiltSubdivision
);

assert(
  Boolean(sampleSubResult && sampleSubResult.blocks.length > 0 && sampleSubResult.plots.length > 0),
  `Sample GIS Farm subdivision generates real blocks (${sampleSubResult?.blocks.length}) & inside plots (${sampleSubResult?.plots.length})`
);

if (sampleSubResult) {
  const firstBlock = sampleSubResult.blocks[0];
  assert(
    firstBlock.total === 10,
    `Each block contains 10 evaluated plot positions (got ${firstBlock.total})`
  );

  const firstFullPlot = sampleSubResult.plots[0];
  const measuredArea =
    firstFullPlot.calculatedAreaSqM ??
    sampleSubResult.params.pw * sampleSubResult.params.pd;
  assert(
    approxEqual(measuredArea, 432, 1),
    `Generated full plot area is 18×24 = 432 m² (got ${measuredArea.toFixed(2)} m²)`
  );

  // Test excluding a plot with a special name ("Masjidka") without deleting its GIS record
  const excludedPlotId = firstFullPlot.id;
  const plotMetadata: Record<string, PlotDetailedMetadata> = {
    [excludedPlotId]: {
      plotId: excludedPlotId,
      blockId: firstFullPlot.block,
      wadiStatus: 'unverified',
      siteQuality: 'unverified',
      isExcludedFromDivision: true,
      excludedSpecialName: 'Masjidka',
    },
  };

  const baselineAlloc = allocatePlotsFairlyToHeirs(
    sampleSubResult,
    sampleSubState.blockTiers,
    sampleSubState.plotTierOverrides,
    {},
    sampleSubState.tierUnitPrices,
    'exact_shared',
    minbRes,
    minbariyyah.heirs,
    { plotMetadata: {}, blockMetadata: {} }
  );

  const excludedAlloc = allocatePlotsFairlyToHeirs(
    sampleSubResult,
    sampleSubState.blockTiers,
    sampleSubState.plotTierOverrides,
    {},
    sampleSubState.tierUnitPrices,
    'exact_shared',
    minbRes,
    minbariyyah.heirs,
    { plotMetadata, blockMetadata: {} }
  );

  assert(
    Boolean(
      baselineAlloc &&
        excludedAlloc &&
        excludedAlloc.totalFullPlots === baselineAlloc.totalFullPlots - 1 &&
        excludedAlloc.excludedPlotsCount === 1 &&
        excludedAlloc.excludedPlots?.[0]?.specialName === 'Masjidka' &&
        sampleSubResult.plots.some((p) => p.id === excludedPlotId)
    ),
    'Excluded plot ("Masjidka") is withheld from inheritance division while preserving original GIS plot geometry'
  );

  const syncedAssets = syncSubdivisionToEstateAssets(
    [],
    sampleSubResult,
    sampleSubState.blockTiers,
    sampleSubState.plotTierOverrides,
    sampleSubState.tierUnitPrices,
    plotMetadata,
    {}
  );
  const syncedPlotsSum = syncedAssets.reduce((s, a) => s + (a.quantity || 0), 0);
  assert(
    syncedPlotsSum === sampleSubResult.plots.length - 1,
    `Synced estate assets reflect divisible plots only (${syncedPlotsSum} divisible of ${sampleSubResult.plots.length} total)`
  );
}

// Test CSV import parsing with divisible vs excluded special names
const csvSample = [
  'Block_ID,Plot_ID,Divisible,Special_Name,Zone,Tier',
  'B1,B1-P1,Haa,,Zone A,H1',
  'B1,B1-P2,Maya,Ceelka Biyaha,Zone A,H1',
].join('\n');
const csvParsed = prepareBulkMetadataImportFromCSV(
  csvSample,
  'test_blocks_plots.csv',
  null,
  createEmptyLandSubdivisionState()
);
assert(
  Boolean(csvParsed.synthesizedPrebuiltFromCsv && csvParsed.excludedPlotsInImportCount === 1),
  'CSV Blocks & Plots importer parses divisible and excluded special-name ("Ceelka Biyaha") rows cleanly'
);

/* ------------------------------------------------------------------ */
/* 3. CASE ISOLATION, UNDO/REDO & FULL APP BACKUP/RESTORE             */
/* ------------------------------------------------------------------ */
console.log('\n3. Kala-Madax-Bannaanida Kiisaska, Undo/Redo & Backup/Restore');

const newBlankCaseRes = createNewManagedCase({
  caseName: 'Kiis Tijaabo Madax-bannaan',
  referenceNumber: 'KIIS-2026-9901',
  caseDate: '2026-10-25',
  existingCases: [],
  explicitlyConfirmedSubdivision: null,
});
assert(
  newBlankCaseRes.ok === true &&
    newBlankCaseRes.caseRecord.hasMapGeometry === false &&
    !doesSubdivisionHaveGeometry(
      newBlankCaseRes.caseRecord.landSubdivisionSnapshot as ReturnType<
        typeof createInitialSampleSubdivisionState
      >
    ),
  'New inheritance case is strictly isolated & mapless by default (no geometry leakage)'
);

const dupRefRes = createNewManagedCase({
  caseName: 'Kiis Labaad',
  referenceNumber: 'KIIS-2026-9901',
  caseDate: '2026-10-25',
  existingCases: newBlankCaseRes.ok ? [newBlankCaseRes.caseRecord] : [],
});
assert(
  dupRefRes.ok === false,
  'Duplicate case reference numbers are strictly rejected'
);

// Undo / Redo round-trip
let history = createUndoRedoHistory({ count: 1, label: 'a' }, 'Bilow');
history = pushUndoSnapshot(history, { count: 2, label: 'b' }, 'Ku dar wiil');
history = pushUndoSnapshot(history, { count: 2, label: 'b' }, 'Duplicate'); // ignored
assert(history.past.length === 1, 'Undo stack ignores identical consecutive snapshots');
const undoStep = performUndo(history);
assert(
  undoStep.ok && undoStep.restoredState?.count === 1,
  'Undo restores exact previous snapshot'
);
const redoStep = performRedo(undoStep.nextHistory);
assert(
  redoStep.ok && redoStep.restoredState?.count === 2,
  'Redo restores exact forward snapshot'
);

// Backup & Validated Restore round-trip + GeoJSON rejection guard
if (newBlankCaseRes.ok) {
  const backupEnvelope = createApplicationBackupPayload({
    savedCases: [newBlankCaseRes.caseRecord],
    activeCaseId: newBlankCaseRes.caseRecord.id,
    currency: 'USD',
  });
  const validated = validateApplicationBackupJSON(JSON.stringify(backupEnvelope));
  assert(
    validated.ok === true &&
      validated.preview.casesCount === 1 &&
      validated.preview.activeCaseReference === 'KIIS-2026-9901',
    'Application backup envelope validates and hydrates saved cases accurately'
  );

  const geojsonRejected = validateApplicationBackupJSON(
    JSON.stringify({ type: 'FeatureCollection', features: [] })
  );
  assert(
    geojsonRejected.ok === false && geojsonRejected.errorSomali.includes('GeoJSON'),
    'Backup restore validator rejects GIS GeoJSON files with clear Somali guidance'
  );
}

/* ------------------------------------------------------------------ */
/* 4. PDF CARTOGRAPHY ENGINE (AUTOMATIC_LAYOUT11 & WARBIXINTA 523)    */
/* ------------------------------------------------------------------ */
console.log('\n4. Khariidadda PDF (Automatic_Layout11 & Warbixinta Heerarka 523 Plots)');

// Exact 62-block structure from Pages 3–4 of Warbixinta_Heerarka_Beerta.pdf:
// 523 total plots = 483 Buuxa (364 unlabelled + 30 Doox + 89 Kale) + 40 Qayb (21 unlabelled + 16 Doox + 3 Kale)
const REF_BLOCK_SPECS: {
  id: string;
  R: number;
  C: number;
  heer: 1 | 2 | 3;
  distM: number;
  plots: number;
  qayb: number;
  doox: number;
  qaybDoox?: number;
}[] = [
  // Heer 3 (25 blocks, 198 plots, 177 Buuxa, 21 Qayb, 46 Doox [30 Buuxa + 16 Qayb], 14 Kale)
  { id: 'R01-C06', R: 1, C: 6, heer: 3, distM: 0, plots: 4, qayb: 1, doox: 1, qaybDoox: 1 },
  { id: 'R02-C04', R: 2, C: 4, heer: 3, distM: 15, plots: 10, qayb: 0, doox: 0 },
  { id: 'R02-C05', R: 2, C: 5, heer: 3, distM: 11, plots: 10, qayb: 0, doox: 0 },
  { id: 'R02-C06', R: 2, C: 6, heer: 3, distM: 0, plots: 5, qayb: 2, doox: 2, qaybDoox: 2 },
  { id: 'R03-C04', R: 3, C: 4, heer: 3, distM: 0, plots: 10, qayb: 0, doox: 2 },
  { id: 'R03-C05', R: 3, C: 5, heer: 3, distM: 0, plots: 10, qayb: 0, doox: 7 },
  { id: 'R03-C06', R: 3, C: 6, heer: 3, distM: 0, plots: 4, qayb: 2, doox: 4, qaybDoox: 2 },
  { id: 'DG2', R: 4, C: 3, heer: 3, distM: 2, plots: 10, qayb: 0, doox: 0 },
  { id: 'R04-C04', R: 4, C: 4, heer: 3, distM: 0, plots: 10, qayb: 0, doox: 10 },
  { id: 'R04-C05', R: 4, C: 5, heer: 3, distM: 0, plots: 10, qayb: 0, doox: 5 },
  { id: 'R04-C06', R: 4, C: 6, heer: 3, distM: 0, plots: 6, qayb: 2, doox: 2, qaybDoox: 2 },
  { id: 'R05-C03', R: 5, C: 3, heer: 3, distM: 0, plots: 10, qayb: 0, doox: 2 },
  { id: 'R05-C04', R: 5, C: 4, heer: 3, distM: 19, plots: 10, qayb: 0, doox: 0 },
  { id: 'R05-C05', R: 5, C: 5, heer: 3, distM: 16, plots: 10, qayb: 0, doox: 0 },
  { id: 'R05-C06', R: 5, C: 6, heer: 3, distM: 0, plots: 2, qayb: 1, doox: 2, qaybDoox: 1 },
  { id: 'R06-C05', R: 6, C: 5, heer: 3, distM: 29, plots: 10, qayb: 0, doox: 0 },
  { id: 'R06-C06', R: 6, C: 6, heer: 3, distM: 0, plots: 2, qayb: 2, doox: 2, qaybDoox: 2 },
  { id: 'R07-C05', R: 7, C: 5, heer: 3, distM: 18, plots: 10, qayb: 0, doox: 0 },
  { id: 'R08-C05', R: 8, C: 5, heer: 3, distM: 7, plots: 10, qayb: 0, doox: 0 },
  { id: 'R09-C05', R: 9, C: 5, heer: 3, distM: 11, plots: 10, qayb: 0, doox: 0 },
  { id: 'R10-C05', R: 10, C: 5, heer: 3, distM: 0, plots: 9, qayb: 1, doox: 0 },
  { id: 'R11-C05', R: 11, C: 5, heer: 3, distM: 0, plots: 8, qayb: 2, doox: 2, qaybDoox: 2 },
  { id: 'R12-C05', R: 12, C: 5, heer: 3, distM: 0, plots: 8, qayb: 2, doox: 3, qaybDoox: 2 },
  { id: 'R13-C04', R: 13, C: 4, heer: 3, distM: 18, plots: 7, qayb: 4, doox: 0 },
  { id: 'R13-C05', R: 13, C: 5, heer: 3, distM: 0, plots: 3, qayb: 2, doox: 2, qaybDoox: 2 },
  // Heer 2 (13 blocks, 121 plots, 117 Buuxa, 4 Qayb, 0 Doox, 20 Kale)
  { id: 'R01-C05', R: 1, C: 5, heer: 2, distM: 74, plots: 5, qayb: 3, doox: 0 },
  { id: 'R02-C03', R: 2, C: 3, heer: 2, distM: 88, plots: 6, qayb: 1, doox: 0 },
  { id: 'R03-C03', R: 3, C: 3, heer: 2, distM: 50, plots: 10, qayb: 0, doox: 0 },
  { id: 'DG1', R: 4, C: 2, heer: 2, distM: 83, plots: 10, qayb: 0, doox: 0 },
  { id: 'R05-C02', R: 5, C: 2, heer: 2, distM: 80, plots: 10, qayb: 0, doox: 0 },
  { id: 'R06-C03', R: 6, C: 3, heer: 2, distM: 58, plots: 10, qayb: 0, doox: 0 },
  { id: 'R06-C04', R: 6, C: 4, heer: 2, distM: 70, plots: 10, qayb: 0, doox: 0 },
  { id: 'R07-C04', R: 7, C: 4, heer: 2, distM: 118, plots: 10, qayb: 0, doox: 0 },
  { id: 'R08-C04', R: 8, C: 4, heer: 2, distM: 112, plots: 10, qayb: 0, doox: 0 },
  { id: 'R09-C04', R: 9, C: 4, heer: 2, distM: 115, plots: 10, qayb: 0, doox: 0 },
  { id: 'R10-C04', R: 10, C: 4, heer: 2, distM: 93, plots: 10, qayb: 0, doox: 0 },
  { id: 'R11-C04', R: 11, C: 4, heer: 2, distM: 84, plots: 10, qayb: 0, doox: 0 },
  { id: 'R12-C04', R: 12, C: 4, heer: 2, distM: 56, plots: 10, qayb: 0, doox: 0 },
  // Heer 1 (24 blocks, 204 plots, 189 Buuxa, 15 Qayb, 0 Doox, 58 Kale)
  { id: 'R02-C02', R: 2, C: 2, heer: 1, distM: 164, plots: 4, qayb: 3, doox: 0 },
  { id: 'R03-C01', R: 3, C: 1, heer: 1, distM: 203, plots: 7, qayb: 1, doox: 0 },
  { id: 'R03-C02', R: 3, C: 2, heer: 1, distM: 115, plots: 10, qayb: 0, doox: 0 },
  { id: 'DG?', R: 4, C: 1, heer: 1, distM: 186, plots: 10, qayb: 2, doox: 0 },
  { id: 'R05-C01', R: 5, C: 1, heer: 1, distM: 185, plots: 10, qayb: 1, doox: 0 },
  { id: 'R06-C01', R: 6, C: 1, heer: 1, distM: 194, plots: 10, qayb: 0, doox: 0 },
  { id: 'R06-C02', R: 6, C: 2, heer: 1, distM: 99, plots: 10, qayb: 0, doox: 0 },
  { id: 'R07-C01', R: 7, C: 1, heer: 1, distM: 221, plots: 10, qayb: 1, doox: 0 },
  { id: 'R07-C02', R: 7, C: 2, heer: 1, distM: 145, plots: 10, qayb: 0, doox: 0 },
  { id: 'R07-C03', R: 7, C: 3, heer: 1, distM: 121, plots: 10, qayb: 0, doox: 0 },
  { id: 'R08-C01', R: 8, C: 1, heer: 1, distM: 261, plots: 9, qayb: 1, doox: 0 },
  { id: 'R08-C02', R: 8, C: 2, heer: 1, distM: 201, plots: 10, qayb: 0, doox: 0 },
  { id: 'R08-C03', R: 8, C: 3, heer: 1, distM: 184, plots: 10, qayb: 0, doox: 0 },
  { id: 'R09-C01', R: 9, C: 1, heer: 1, distM: 309, plots: 8, qayb: 2, doox: 0 },
  { id: 'R09-C02', R: 9, C: 2, heer: 1, distM: 260, plots: 10, qayb: 0, doox: 0 },
  { id: 'R09-C03', R: 9, C: 3, heer: 1, distM: 213, plots: 10, qayb: 0, doox: 0 },
  { id: 'R10-C01', R: 10, C: 1, heer: 1, distM: 361, plots: 6, qayb: 0, doox: 0 },
  { id: 'R10-C02', R: 10, C: 2, heer: 1, distM: 298, plots: 10, qayb: 0, doox: 0 },
  { id: 'R10-C03', R: 10, C: 3, heer: 1, distM: 195, plots: 10, qayb: 0, doox: 0 },
  { id: 'R11-C01', R: 11, C: 1, heer: 1, distM: 334, plots: 1, qayb: 1, doox: 0 },
  { id: 'R11-C02', R: 11, C: 2, heer: 1, distM: 256, plots: 9, qayb: 1, doox: 0 },
  { id: 'R11-C03', R: 11, C: 3, heer: 1, distM: 178, plots: 10, qayb: 0, doox: 0 },
  { id: 'R12-C02', R: 12, C: 2, heer: 1, distM: 213, plots: 1, qayb: 1, doox: 0 },
  { id: 'R12-C03', R: 12, C: 3, heer: 1, distM: 138, plots: 9, qayb: 1, doox: 0 },
];

const utmOriginX = 396000; // UTM Zone 38N Somaliland/Somalia Easting
const utmOriginY = 1063000; // UTM Zone 38N Northing

const synthPlotFeatures: unknown[] = [];
for (const bSpec of REF_BLOCK_SPECS) {
  const bx = utmOriginX + bSpec.C * 102;
  const by = utmOriginY - bSpec.R * 58;
  const qaybDooxCount = bSpec.qaybDoox || 0;
  const buuxaDooxCount = bSpec.doox - qaybDooxCount;

  // Arrange plots in 2 sub-rows (upper north row, lower south row) West-to-East
  const upperLen =
    bSpec.id === 'R03-C01' ? 3 : Math.min(5, Math.ceil(bSpec.plots / 2));
  for (let idx = 0; idx < bSpec.plots; idx++) {
    const inLower = idx >= upperLen;
    const colInSubRow = inLower ? idx - upperLen : idx;
    // Place partial `qayb` plots on the outer boundary edge
    let isQayb = false;
    if (bSpec.id === 'R11-C02') {
      isQayb = idx === upperLen; // lowerRow[0] is the 1 partial unlabelled plot
    } else {
      isQayb = idx < bSpec.qayb;
    }

    let isDoox = false;
    if (isQayb && idx < qaybDooxCount) {
      isDoox = true;
    } else if (!isQayb && bSpec.id === 'R03-C04') {
      // Put the 2 Doox plots of R03-C04 on the eastern side (away from the 4 western Milgo plots!)
      isDoox = colInSubRow >= 4 || (inLower && colInSubRow >= 3);
      if (bSpec.id === 'R03-C04') {
        isDoox = idx === upperLen - 1 || idx === bSpec.plots - 1;
      }
    } else if (!isQayb && idx >= bSpec.qayb && idx < bSpec.qayb + buuxaDooxCount) {
      isDoox = true;
    }

    const px = bx + colInSubRow * 18;
    const py = by + (inLower ? 0 : 24);
    synthPlotFeatures.push({
      type: 'Feature',
      properties: {
        block: bSpec.id,
        Plot_No: idx + 1,
        goostay: isQayb ? 1 : 0,
        pct_gudaha: isQayb ? 68.5 : 100,
        doox: isDoox ? 1 : 0,
        heer: bSpec.heer,
        masaafo_dooxa_m: bSpec.distM,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [px, py],
            [px + 18, py],
            [px + 18, py + 24],
            [px, py + 24],
            [px, py],
          ],
        ],
      },
    });
  }
}

const utmPlotsGeoJson = {
  type: 'FeatureCollection',
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::32638' } },
  features: synthPlotFeatures,
};

const utmBoundaryGeoJson = {
  type: 'FeatureCollection',
  crs: { type: 'name', properties: { name: 'EPSG:32638' } },
  features: [
    {
      type: 'Feature',
      properties: { layer: '01_xuduudka_beerta', bedka_ha: 34.38 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [utmOriginX + 50, utmOriginY - 820],
            [utmOriginX + 780, utmOriginY - 820],
            [utmOriginX + 780, utmOriginY - 20],
            [utmOriginX + 50, utmOriginY - 20],
            [utmOriginX + 50, utmOriginY - 820],
          ],
        ],
      },
    },
  ],
};

// 2-point LineString wadi (testing the 2-point LineString parser fix!)
const utmWadiGeoJson = {
  type: 'FeatureCollection',
  crs: { type: 'name', properties: { name: 'EPSG:32638' } },
  features: [
    {
      type: 'Feature',
      properties: { layer: '05_dooxyada' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [utmOriginX + 680, utmOriginY - 40],
          [utmOriginX + 520, utmOriginY - 800],
        ],
      },
    },
  ],
};

const multiClassified = inspectMultipleGeoJsonUploads([
  { fileName: '01_xuduudka_beerta.geojson', rawJson: utmBoundaryGeoJson },
  { fileName: '03_plots.geojson', rawJson: utmPlotsGeoJson },
  { fileName: '05_dooxyada.geojson', rawJson: utmWadiGeoJson },
]);

assert(
  multiClassified.wasReprojectedFromUtm === true &&
    multiClassified.isProjectedMetersLikely === false &&
    multiClassified.wadiItems.length === 1 &&
    multiClassified.prebuiltSubdivision?.plots.length === 523 &&
    multiClassified.prebuiltSubdivision?.blocks.length === 62,
  'Multi-layer EPSG:32638 GeoJSON reprojects to WGS84 and classifies 523 plots, 62 blocks & 2-pt 05_dooxyada stream'
);

const prebuiltSubRes = computeLandSubdivision(
  multiClassified.boundaryItem,
  null,
  DEFAULT_SUBDIVISION_PARAMS,
  multiClassified.prebuiltSubdivision
);

assert(
  Boolean(
    prebuiltSubRes &&
      prebuiltSubRes.allEvaluatedPlots?.length === 523 &&
      prebuiltSubRes.plots.length === 483 &&
      prebuiltSubRes.halfPlotSummary?.boundaryClippedPlotsCount === 40
  ),
  `goostay=0/1 fidelity preserved 100%: 523 total, 483 Buuxa, 40 Qayb go'an (got ${prebuiltSubRes?.plots.length} / ${prebuiltSubRes?.halfPlotSummary?.boundaryClippedPlotsCount})`
);

if (prebuiltSubRes) {
  const cartoRep = computeFarmCartographicReport(
    prebuiltSubRes,
    multiClassified.wadiItems,
    multiClassified.prebuiltSubdivision
  );

  assert(Boolean(cartoRep), 'computeFarmCartographicReport returns non-null report');

  if (cartoRep) {
    const lc = cartoRep.layout11LegendCounts;
    assert(
      lc.Danguud === 30 &&
        lc.Tacab === 15 &&
        lc.Milgo === 14 &&
        lc['Ina Muuse'] === 10 &&
        lc.CWAHAAB === 10 &&
        lc.Shafool === 5 &&
        lc['Xamse Mubaarig'] === 4 &&
        lc.Culimo === 3 &&
        lc.Xaq === 1 &&
        lc.Doox === 46 &&
        lc.partial_40 === 40,
      'Automatic_Layout11 legend counts match PDF 100% (Danguud 30, Tacab 15, Milgo 14, Ina Muuse 10, CWAHAAB 10, Shafool 5, Xamse Mubaarig 4, Culimo 3, Xaq 1, Doox 46, [40])',
      JSON.stringify(lc)
    );

    assert(
      cartoRep.buuxaUnlabelledCount === 364 &&
        cartoRep.buuxaDooxCount === 30 &&
        cartoRep.buuxaKaleCount === 89 &&
        cartoRep.totalBuuxaCount === 483 &&
        cartoRep.qaybUnlabelledCount === 21 &&
        cartoRep.qaybDooxCount === 16 &&
        cartoRep.qaybKaleCount === 3 &&
        cartoRep.totalQaybCount === 40 &&
        cartoRep.totalPlots === 523,
      'Warbixinta Heerarka Beerta Page 1 Section 1 table matches PDF 100% (364+30+89=483 Buuxa, 21+16+3=40 Qayb, 523 Wadar)',
      `Got Buuxa=${cartoRep.buuxaUnlabelledCount}/${cartoRep.buuxaDooxCount}/${cartoRep.buuxaKaleCount}, Qayb=${cartoRep.qaybUnlabelledCount}/${cartoRep.qaybDooxCount}/${cartoRep.qaybKaleCount}`
    );

    const t3 = cartoRep.tierSummaries[3];
    const t2 = cartoRep.tierSummaries[2];
    const t1 = cartoRep.tierSummaries[1];
    assert(
      t3.blocksCount === 25 &&
        t3.plotsCount === 198 &&
        t3.buuxaCount === 177 &&
        t3.qaybCount === 21 &&
        t3.unlabelledBuuxaCount === 133 &&
        t3.dooxCount === 46 &&
        t3.kaleCount === 14 &&
        t2.blocksCount === 13 &&
        t2.plotsCount === 121 &&
        t2.kaleCount === 20 &&
        t1.blocksCount === 24 &&
        t1.plotsCount === 204 &&
        t1.kaleCount === 58,
      'Warbixinta Heerarka Beerta Page 1 Section 2 tier table matches PDF 100% (Heer 3: 25/198, Heer 2: 13/121, Heer 1: 24/204)'
    );
  }
}

/* ------------------------------------------------------------------ */
/* 5. HTML GEOJSON IMPORT & COMPUTE PARITY (v2 HTML 3-SLOT WORKFLOW)  */
/* ------------------------------------------------------------------ */
console.log('\n5. Habka Soo Gelinta GeoJSON ee HTML (Xuduudka, Block Tusaale & Aag Gaar Ah)');

const htmlSampleState = applyHtmlUseSample(createEmptyLandSubdivisionState());
assert(
  htmlSampleState.boundaryItems.length === 2 &&
    htmlSampleState.boundaryItems[htmlSampleState.selectedBoundaryIndex]?.type === 'Line' &&
    htmlSampleState.sampleCandidates.length === 2 &&
    htmlSampleState.sampleCustom === false,
  `HTML useSample() picks LineString boundary (88 pts) & splits 12-pt compound sample into 2 sub-rings (got ${htmlSampleState.sampleCandidates.length})`
);

// Switching selB to index 1 (Polygon) when !sampleCustom rebuilds sampleCandidates excluding index 1
const switchedSelB = applyHtmlBoundarySelectionChange(htmlSampleState, 1);
assert(
  switchedSelB.selectedBoundaryIndex === 1 &&
    switchedSelB.sampleCandidates.every((c) => !c.label.includes('Block tusaale')),
  'HTML selB onchange rebuilds sampleCandidates excluding newly selected boundary item when !sampleCustom'
);

// Slot 'S' custom sample upload sets sampleCustom=true and preserves boundaryItems
const customSampleSlot = applyHtmlGeoJsonSlotImport(
  htmlSampleState,
  {
    type: 'FeatureCollection',
    features: [SAMPLE_FARM_GEOJSON.features[1]],
  },
  'custom_sample_block.geojson',
  'S'
);
assert(
  customSampleSlot.ok === true &&
    customSampleSlot.nextState.sampleCustom === true &&
    customSampleSlot.nextState.sampleCandidates.length === 2 &&
    customSampleSlot.nextState.boundaryItems.length === 2,
  'HTML Slot S (Block tusaale ah) sets sampleCustom=true, splits subRings, and preserves boundaryItems'
);

// Slot 'A' special area upload counts full plots & counted half-plots inside the special area
const sampleCompBase = computeLandSubdivision(
  htmlSampleState.boundaryItems[htmlSampleState.selectedBoundaryIndex],
  htmlSampleState.sampleCandidates[0],
  htmlSampleState.params,
  null,
  []
);

assert(
  Boolean(
    sampleCompBase &&
      sampleCompBase.blocks.every((b) => /^R\d+-C\d+$/.test(b.id) && b.nf + (b.nh || 0) > 0) &&
      (sampleCompBase.htmlHalvesCounted?.length || 0) > 0 &&
      sampleCompBase.htmlHalvesCounted?.every(
        (h) => approxEqual(h.area, 216, 0.5) && ((h.hl === 18 && h.hw === 12) || (h.hl === 9 && h.hw === 24))
      )
  ),
  `HTML compute() generates R#-C# non-empty blocks (${sampleCompBase?.blocks.length}), full plots (${sampleCompBase?.plots.length}), and 216 m² counted half-plots (${sampleCompBase?.htmlHalvesCounted?.length})`
);

if (sampleCompBase && sampleCompBase.blocks.length > 0) {
  // Build a Special Area GeoJSON polygon around the first complete block (buffered by 5m in UTM -> WGS84)
  const targetBlk = sampleCompBase.blocks.find((b) => b.nf >= 6) || sampleCompBase.blocks[0];
  const xs = targetBlk.rect.map((q) => q[0]);
  const ys = targetBlk.rect.map((q) => q[1]);
  const specialUtm: [number, number][] = [
    [Math.min(...xs) - 5, Math.min(...ys) - 5],
    [Math.max(...xs) + 5, Math.min(...ys) - 5],
    [Math.max(...xs) + 5, Math.max(...ys) + 5],
    [Math.min(...xs) - 5, Math.max(...ys) + 5],
  ];
  const specialLonLat = specialUtm.map((pt) => sampleCompBase.inv(pt));
  specialLonLat.push(specialLonLat[0]);

  const slotARes = applyHtmlGeoJsonSlotImport(
    htmlSampleState,
    {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Aagga Ceelka' },
          geometry: { type: 'Polygon', coordinates: [specialLonLat] },
        },
      ],
    },
    'aag_gaar_ah.geojson',
    'A'
  );

  assert(
    slotARes.ok === true && (slotARes.nextState.specialAreaItems?.length || 0) === 1,
    'HTML Slot A (Aag gaar ah) imports special area polygon cleanly'
  );

  if (slotARes.ok) {
    const withSpecialComp = computeLandSubdivision(
      slotARes.nextState.boundaryItems[slotARes.nextState.selectedBoundaryIndex],
      slotARes.nextState.sampleCandidates[0],
      slotARes.nextState.params,
      null,
      slotARes.nextState.specialAreaItems
    );

    const saSummary = withSpecialComp?.specialAreas?.[0];
    assert(
      Boolean(
        withSpecialComp &&
          saSummary &&
          saSummary.name === 'Aagga Ceelka' &&
          saSummary.nP >= targetBlk.nf &&
          approxEqual(saSummary.aP, saSummary.nP * 432, 1)
      ),
      `Special Area ("Aagga Ceelka") counts inside plots (${saSummary?.nP} plots + ${saSummary?.nH} half = ${saSummary ? saSummary.aP + saSummary.aH : 0} m²)`
    );

    if (withSpecialComp) {
      const expLayers = buildExportLayers(withSpecialComp, {}, {}, null);
      const csvOut = buildPlotRegisterCSV(withSpecialComp, {}, {}, null);
      assert(
        Boolean(
          expLayers.Half_Plots &&
            expLayers.Special_Areas &&
            expLayers.Special_Areas.length === 1 &&
            csvOut.includes('Special_Area') &&
            csvOut.includes('Aagga Ceelka')
        ),
        'GIS Export includes Half_Plots layer, Special_Areas layer, and Special_Area CSV column'
      );
    }
  }
}

/* ============================================================================
 * SECTION 6: SIMULTANEOUS MULTI-FILE GEOJSON, AUTO DEM+ROAD TIERS & MANUAL LASSO
 * ============================================================================ */
console.log('\n[SECTION 6] Simultaneous GeoJSON Batch, Auto DEM+Road Tiers & Manual Selection');
{
  const emptyInit = createEmptyLandSubdivisionState();
  const sampleBase = createInitialSampleSubdivisionState();
  const bPolyCoords = sampleBase.boundaryItems[sampleBase.selectedBoundaryIndex].coords;
  const sBlk = sampleBase.sampleCandidates[0];
  const sampleLoopLonLat = [...sBlk.ring];
  if (sampleLoopLonLat.length > 0) {
    sampleLoopLonLat.push(sampleLoopLonLat[0]);
  }

  // Construct a synthetic wadi cutting across the eastern part of the sample farm
  const sampleCompRef = computeLandSubdivision(
    sampleBase.boundaryItems[sampleBase.selectedBoundaryIndex],
    sampleBase.sampleCandidates[0],
    sampleBase.params
  );

  assert(Boolean(sampleCompRef && sampleCompRef.plots.length > 20), 'Sample subdivision computes valid plots for Section 6');

  if (sampleCompRef) {
    const [xMin, yMin, xMax, yMax] = sampleCompRef.bb;
    const wadiUtmA: [number, number] = [xMin + (xMax - xMin) * 0.82, yMin - 10];
    const wadiUtmB: [number, number] = [xMin + (xMax - xMin) * 0.85, yMax + 10];
    const wadiLonLat = [sampleCompRef.inv(wadiUtmA), sampleCompRef.inv(wadiUtmB)];

    // City road running along the western edge (xMin - 25m)
    const roadUtmA: [number, number] = [xMin - 25, yMin - 30];
    const roadUtmB: [number, number] = [xMin - 25, yMax + 30];
    const roadLonLat = [sampleCompRef.inv(roadUtmA), sampleCompRef.inv(roadUtmB)];

    const boundaryGeoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Xuduudka Beerta Weyn' },
          geometry: { type: 'Polygon', coordinates: [bPolyCoords] },
        },
      ],
    };

    const sampleBlockGeoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Block Tusaale' },
          geometry: { type: 'Polygon', coordinates: [sampleLoopLonLat] },
        },
      ],
    };

    const dooxyadaGeoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Dooxa Bari' },
          geometry: { type: 'LineString', coordinates: wadiLonLat },
        },
      ],
    };

    const batchRes = importSimultaneousFarmGeoJsonFiles(emptyInit, [
      { fileName: 'xuduudka_beerta.geojson', rawJson: boundaryGeoJson },
      { fileName: 'block_tusaale.geojson', rawJson: sampleBlockGeoJson },
      { fileName: 'dooxyada.geojson', rawJson: dooxyadaGeoJson },
    ]);

    assert(
      Boolean(
        batchRes &&
          !batchRes.isPrebuiltPackage &&
          batchRes.nextState.boundaryItems.length === 1 &&
          batchRes.nextState.sampleCustom === true &&
          batchRes.nextState.sampleCandidates.length === 1 &&
          (batchRes.nextState.wadiItems?.length || 0) === 1
      ),
      'Simultaneous upload imports Xuduudka Beerta + Block Tusaale + Dooxyada in one atomic batch'
    );

    if (batchRes) {
      // Synthetic DEM: flat plain (450m, 0% slope) on the western half near the city road,
      // steep gullied escarpment (>8% slope + local incision) on the eastern side.
      const xSplit = xMin + (xMax - xMin) * 0.55;
      const syntheticDem = {
        sourceLabel: 'Synthetic Test DEM (Flat West / Steep Gullied East)',
        hasRealElevation: true,
        sampleLonLat: (lon: number, lat: number): number | null => {
          const [ux, uy] = sampleCompRef.fwd([lon, lat]);
          if (ux <= xSplit) {
            return 450.0; // Perfectly flat plain (`Dhul isku siman`)
          }
          const dx = ux - xSplit;
          const gullyWave = Math.sin(uy * 0.25) * 1.4;
          return 450.0 + dx * 0.095 + gullyWave; // Steep & gullied (`Dhul jeexjeex ah`)
        },
      };

      const autoOut = computeAutomaticDemAndRoadTiers({
        subdivision: sampleCompRef,
        demSampler: syntheticDem,
        cityRoad: {
          sourceLabel: 'OSM: Waddada Magaalada (Test)',
          roadLinesLonLat: [roadLonLat],
        },
        wadiItems: batchRes.nextState.wadiItems,
      });

      // Verify western flat plot near road becomes Heer 1 (`tier_1_prime`)
      const westFlatPlots = sampleCompRef.plots.filter(
        (q) => q.centerUtm[0] < xMin + (xMax - xMin) * 0.28
      );
      const eastGulliedPlots = sampleCompRef.plots.filter(
        (q) => q.centerUtm[0] > xMin + (xMax - xMin) * 0.78
      );

      const getEffTier = (plotId: string, blockId: string) =>
        autoOut.plotTierOverrides[plotId] || autoOut.blockTiers[blockId] || 'tier_1_prime';

      const westTier1Count = westFlatPlots.filter(
        (q) => getEffTier(q.id, q.block) === 'tier_1_prime'
      ).length;
      const eastNonTier1Count = eastGulliedPlots.filter(
        (q) => getEffTier(q.id, q.block) !== 'tier_1_prime'
      ).length;

      assert(
        westFlatPlots.length > 0 && westTier1Count === westFlatPlots.length,
        `Automatic DEM + Road assigns flat road-accessible plots to Heer 1 (${westTier1Count}/${westFlatPlots.length})`
      );
      assert(
        eastGulliedPlots.length > 0 && eastNonTier1Count === eastGulliedPlots.length && autoOut.summary.tier3PlotsCount > 0,
        `Automatic DEM + Wadi assigns steep/gullied plots to Heer 2 & Heer 3 (${eastNonTier1Count}/${eastGulliedPlots.length}, Heer 3=${autoOut.summary.tier3PlotsCount})`
      );
      assert(
        autoOut.summary.nearestRoadDistanceM !== null && autoOut.summary.nearestRoadDistanceM > 0,
        `Automatic summary records nearest city road distance (${autoOut.summary.nearestRoadDistanceM} m)`
      );

      // Verify Manual Mode: Select by Plot, Select by Block, Select by Freehand Lasso
      const targetPlot = sampleCompRef.plots[0];
      const targetBlock = sampleCompRef.blocks[0];

      const afterPlotSel = applyManualTierByPlot(batchRes.nextState, targetPlot.id, 'tier_3_basic');
      assert(
        afterPlotSel.plotTierOverrides[targetPlot.id] === 'tier_3_basic',
        `Manual Select by Plot assigns ${targetPlot.id} to tier_3_basic`
      );

      const afterBlockSel = applyManualTierByBlock(
        afterPlotSel,
        targetBlock.id,
        sampleCompRef,
        'tier_2_standard'
      );
      assert(
        afterBlockSel.blockTiers[targetBlock.id] === 'tier_2_standard' &&
          afterBlockSel.plotTierOverrides[targetPlot.id] === undefined,
        `Manual Select by Block assigns ${targetBlock.id} to tier_2_standard and clears child plot override`
      );

      // Freehand Lasso around targetBlock's bounding box
      const bxCoords = targetBlock.rect.map((p) => p[0]);
      const byCoords = targetBlock.rect.map((p) => p[1]);
      const lassoUtm: [number, number][] = [
        [Math.min(...bxCoords) - 1, Math.min(...byCoords) - 1],
        [Math.max(...bxCoords) + 1, Math.min(...byCoords) - 1],
        [Math.max(...bxCoords) + 1, Math.max(...byCoords) + 1],
        [Math.min(...bxCoords) - 1, Math.max(...byCoords) + 1],
      ];

      const lassoRes = applyManualTierByFreehandLasso(
        afterBlockSel,
        sampleCompRef,
        lassoUtm,
        'tier_1_prime'
      );
      assert(
        lassoRes.matchedPlotsCount >= targetBlock.plots.length &&
          lassoRes.nextState.plotTierOverrides[targetPlot.id] === 'tier_1_prime',
        `Manual Select by Freehand Lasso captures ${lassoRes.matchedPlotsCount} plots inside polygon`
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* 7. NASHQAD WORKFLOWS ("+" FAB: SAMEE NASHQAD & SOO GELI NASHQAD)   */
/* ------------------------------------------------------------------ */
console.log('\n7. Badhanka "+" — Samee Nashqad & Soo Geli Nashqad Beer');

// 7A. Bad JSON & unsupported geometry return clean Somali errors without throwing
const badJsonCheck = parseGeoJsonPolygonsStrict('{bad json', 'khalad.geojson');
assert(
  badJsonCheck.ok === false && badJsonCheck.errorSomali.length > 0,
  `Invalid JSON returns concise Somali error without crashing ("${badJsonCheck.ok === false ? badJsonCheck.errorSomali : ''}")`
);

const pointOnlyCheck = parseGeoJsonPolygonsStrict(
  JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [44.06, 9.56] } }],
  }),
  'dhibic.geojson'
);
assert(
  pointOnlyCheck.ok === false && pointOnlyCheck.errorSomali.includes('Polygon'),
  `Unsupported Point-only GeoJSON returns concise Somali error ("${pointOnlyCheck.ok === false ? pointOnlyCheck.errorSomali : ''}")`
);

// 7B. Choice 1: "Samee nashqad" with farm boundary Polygon (planar meters) + numeric block dimensions & 20m × 25m = 500 m² plots
// Use a slanted trapezoid boundary so some boundary-crossing plots are clipped into "half" plots while interior plots are "dhammaystiran"
const trapezoidBoundaryGeoJson = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Xuduudka Tijaabada' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [500000, 1050000],
            [500220, 1050000],
            [500175, 1050160],
            [500000, 1050160],
            [500000, 1050000],
          ],
        ],
      },
    },
  ],
});

const sameeDimRes = runSameeNashqadWorkflow({
  boundaryFileName: 'xuduudka_beerta.geojson',
  boundaryFileText: trapezoidBoundaryGeoJson,
  sampleBlockMode: 'dimensions',
  blockWidthM: 50,
  blockLengthM: 100,
  plotWidthM: 20,
  plotDepthM: 25,
  roadWidthM: 6,
});

assert(
  sameeDimRes.ok === true,
  'Choice 1 ("Samee nashqad" via form dimensions 50×100m, plots 20×25m=500m²) succeeds cleanly'
);

if (sameeDimRes.ok) {
  const { summary, nextState } = sameeDimRes;
  const prebuilt = nextState.prebuiltSubdivision!;
  const hasR01 = prebuilt.blocks.some((b) => b.id === 'R01');
  const fullPlots = prebuilt.plots.filter((p) => p.rawProperties?.nooca === 'dhammaystiran');
  const halfPlots = prebuilt.plots.filter((p) => p.rawProperties?.nooca === 'half');

  assert(
    hasR01 &&
      summary.blocksCount === prebuilt.blocks.length &&
      summary.fullPlotsCount === fullPlots.length &&
      summary.halfPlotsCount === halfPlots.length &&
      fullPlots.length > 0 &&
      halfPlots.length > 0,
    `Samee nashqad generates R01.. blocks (${summary.blocksCount}), full plots (${fullPlots.length}), and clipped boundary half plots (${halfPlots.length})`
  );

  const sampleFullArea = Number(fullPlots[0]?.rawProperties?.area_m2 || 0);
  assert(
    approxEqual(sampleFullArea, 500, 2.0),
    `Full plot area in 20m × 25m grid equals ~500 m² via Shoelace (got ${sampleFullArea} m²)`
  );

  // Also verify computeLandSubdivision renders the generated state immediately
  const compSamee = computeLandSubdivision(
    nextState.boundaryItems[0] || null,
    null,
    nextState.params,
    nextState.prebuiltSubdivision
  );
  assert(
    Boolean(
      compSamee &&
        compSamee.plots.length === fullPlots.length &&
        (compSamee.allEvaluatedPlots?.filter((p) => !p.full).length || 0) === halfPlots.length &&
        compSamee.halfPlotSummary?.boundaryClippedPlotsCount === halfPlots.length
    ),
    `Computed GIS map layer immediately reflects ${fullPlots.length} dhammaystiran & ${halfPlots.length} half plots`
  );

  // Verify clipboard GeoJSON text helper works
  const clipTxt = buildPlotsGeoJsonClipboardText(nextState, compSamee);
  assert(
    clipTxt.includes('"FeatureCollection"') && clipTxt.includes('"dhammaystiran"') && clipTxt.includes('"half"'),
    'Clipboard GeoJSON fallback produces valid FeatureCollection with nooca properties'
  );
}

// 7C. Choice 1 ("Samee nashqad") with a sample block Polygon GeoJSON file
const sampleBlockGeoJson = JSON.stringify({
  type: 'Feature',
  properties: { id: 'Sample_R01' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [500010, 1050010],
        [500110, 1050010],
        [500110, 1050060],
        [500010, 1050060],
        [500010, 1050010],
      ],
    ],
  },
});

const sameeFileRes = runSameeNashqadWorkflow({
  boundaryFileName: 'xuduudka.geojson',
  boundaryFileText: trapezoidBoundaryGeoJson,
  sampleBlockMode: 'file',
  sampleBlockFileName: 'block_tusaale.geojson',
  sampleBlockFileText: sampleBlockGeoJson,
  plotWidthM: 20,
  plotDepthM: 25,
  roadWidthM: 6,
});
assert(
  sameeFileRes.ok === true && sameeFileRes.summary.blocksCount > 0,
  `Choice 1 ("Samee nashqad" via sample block Polygon GeoJSON) generates ${sameeFileRes.ok ? sameeFileRes.summary.blocksCount : 0} blocks`
);

// 7D. Choice 2: "Soo geli nashqad beer" — Case-insensitive filename recognition, Geometry fallback, Missing file continuation ("blocks.geojson lama helin")
const mockBoundaryGeo = trapezoidBoundaryGeoJson;
const mockBlocksGeo = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { block: 'R01' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [500010, 1050010],
            [500090, 1050010],
            [500090, 1050060],
            [500010, 1050060],
            [500010, 1050010],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { block: 'R02' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [500100, 1050010],
            [500180, 1050010],
            [500180, 1050060],
            [500100, 1050060],
            [500100, 1050010],
          ],
        ],
      },
    },
  ],
});
const mockPlotsGeo = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    // 3 standard 20x25 = 500 m² plots + 1 smaller 200 m² (<90% of 500m²) auto-detected as "half"
    {
      type: 'Feature',
      properties: { plot_no: 1, block: 'R01' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[500010, 1050010], [500030, 1050010], [500030, 1050035], [500010, 1050035], [500010, 1050010]]],
      },
    },
    {
      type: 'Feature',
      properties: { plot_no: 2, block: 'R01' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[500030, 1050010], [500050, 1050010], [500050, 1050035], [500030, 1050035], [500030, 1050010]]],
      },
    },
    {
      type: 'Feature',
      properties: { plot_no: 3, block: 'R02' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[500100, 1050010], [500120, 1050010], [500120, 1050035], [500100, 1050035], [500100, 1050010]]],
      },
    },
    {
      type: 'Feature',
      properties: { plot_no: 4, block: 'R02' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[500120, 1050010], [500130, 1050010], [500130, 1050030], [500120, 1050030], [500120, 1050010]]],
      },
    },
  ],
});

// Test geometry fallback when filenames are generic (f1.geojson, f2.geojson, f3.geojson)
const genericInspect = inspectAndClassifyNashqadBeerFiles([
  { fileName: 'f_a.geojson', fileText: mockPlotsGeo },
  { fileName: 'f_b.geojson', fileText: mockBoundaryGeo },
  { fileName: 'f_c.geojson', fileText: mockBlocksGeo },
]);
assert(
  genericInspect.ok === true &&
    genericInspect.needsManualSelection === false &&
    genericInspect.files.find((f) => f.fileName === 'f_b.geojson')?.detectedRole === 'boundary' &&
    genericInspect.files.find((f) => f.fileName === 'f_c.geojson')?.detectedRole === 'blocks' &&
    genericInspect.files.find((f) => f.fileName === 'f_a.geojson')?.detectedRole === 'plots',
  'Choice 2 geometry fallback accurately classifies generic filenames into boundary (1 largest), blocks (2), and plots (4 most features)'
);

if (genericInspect.ok) {
  const built3 = buildNashqadBeerState(genericInspect.files);
  assert(
    built3.ok === true &&
      built3.summary.blocksCount === 2 &&
      built3.summary.fullPlotsCount === 3 &&
      built3.summary.halfPlotsCount === 1 &&
      built3.summary.missingFileMessages.length === 0,
    `Choice 2 classifies <90% standard area plot as "half" (got full=${built3.ok ? built3.summary.fullPlotsCount : -1}, half=${built3.ok ? built3.summary.halfPlotsCount : -1})`
  );
}

// Test missing blocks.geojson -> continues cleanly and reports "blocks.geojson lama helin"
const missingBlocksInspect = inspectAndClassifyNashqadBeerFiles([
  { fileName: 'XUDUUDAHA.geojson', fileText: mockBoundaryGeo },
  { fileName: 'Plots.geojson', fileText: mockPlotsGeo },
]);
if (missingBlocksInspect.ok) {
  const builtPartial = buildNashqadBeerState(missingBlocksInspect.files);
  assert(
    builtPartial.ok === true &&
      builtPartial.summary.missingFileMessages.includes('blocks.geojson lama helin') &&
      builtPartial.summary.fullPlotsCount === 3 &&
      builtPartial.summary.halfPlotsCount === 1,
    'Choice 2 continues gracefully when blocks.geojson is omitted and displays "blocks.geojson lama helin"'
  );
}

// 7E. Bearing Degree (Jihada Ballaca Block-ga) in BOTH "Samee nashqad" options (Dimensions & Sample Polygon File)
const bearing0Res = runSameeNashqadWorkflow({
  boundaryFileName: 'xuduudka.geojson',
  boundaryFileText: trapezoidBoundaryGeoJson,
  sampleBlockMode: 'dimensions',
  blockWidthM: 50,
  blockLengthM: 100,
  widthBearingDeg: 0, // Ballaca (50m) points North (0°), Dhererka (100m) points East (90°)
  plotWidthM: 20,
  plotDepthM: 25,
  roadWidthM: 6,
});
const bearing90Res = runSameeNashqadWorkflow({
  boundaryFileName: 'xuduudka.geojson',
  boundaryFileText: trapezoidBoundaryGeoJson,
  sampleBlockMode: 'dimensions',
  blockWidthM: 50,
  blockLengthM: 100,
  widthBearingDeg: 90, // Ballaca (50m) points East (90°), Dhererka (100m) points South (180°)
  plotWidthM: 20,
  plotDepthM: 25,
  roadWidthM: 6,
});
assert(
  bearing0Res.ok === true &&
    bearing90Res.ok === true &&
    bearing0Res.summary.widthBearingDeg === 0 &&
    bearing90Res.summary.widthBearingDeg === 90,
  'Choice 1 ("Samee nashqad" Cabbirka Block-ga) records and applies widthBearingDeg (0° vs 90°)'
);
if (bearing0Res.ok && bearing90Res.ok) {
  const getRingSpan = (ring: [number, number][]) => {
    const lons = ring.map((c) => c[0]);
    const lats = ring.map((c) => c[1]);
    return {
      lonSpan: Math.max(...lons) - Math.min(...lons),
      latSpan: Math.max(...lats) - Math.min(...lats),
    };
  };
  // Compare unclipped interior blocks: at 0° (W=50 N-S, L=100 E-W) lonSpan > latSpan; at 90° (W=50 E-W, L=100 N-S) latSpan > lonSpan
  const fullBlk0 = bearing0Res.nextState.prebuiltSubdivision?.blocks.find(
    (b) =>
      b.ringLonLat.length === 4 &&
      getRingSpan(b.ringLonLat).lonSpan > getRingSpan(b.ringLonLat).latSpan * 1.5
  );
  const fullBlk90 = bearing90Res.nextState.prebuiltSubdivision?.blocks.find(
    (b) =>
      b.ringLonLat.length === 4 &&
      getRingSpan(b.ringLonLat).latSpan > getRingSpan(b.ringLonLat).lonSpan * 1.5
  );
  assert(
    Boolean(fullBlk0 && fullBlk90),
    'Changing widthBearingDeg from 0° to 90° rotates generated 50m × 100m block geometry orientation by 90°'
  );
}

const detectedSampleBearing = detectWidthBearingFromGeoJson(
  sampleBlockGeoJson,
  'block_tusaale.geojson'
);
assert(
  detectedSampleBearing !== null && (detectedSampleBearing === 0 || detectedSampleBearing === 180),
  `detectWidthBearingFromGeoJson detects short-side (50m N-S) width bearing = ${detectedSampleBearing}°`
);

const sameeFileRotatedRes = runSameeNashqadWorkflow({
  boundaryFileName: 'xuduudka.geojson',
  boundaryFileText: trapezoidBoundaryGeoJson,
  sampleBlockMode: 'file',
  sampleBlockFileName: 'block_tusaale.geojson',
  sampleBlockFileText: sampleBlockGeoJson,
  widthBearingDeg: 45, // Rotate sample block width to 45° Waqooyi-Bari
  plotWidthM: 20,
  plotDepthM: 25,
  roadWidthM: 6,
});
assert(
  sameeFileRotatedRes.ok === true &&
    sameeFileRotatedRes.summary.widthBearingDeg === 45 &&
    sameeFileRotatedRes.summary.blocksCount > 0,
  'Choice 1 ("Samee nashqad" Fayl Polygon GeoJSON) supports custom widthBearingDeg (45° NE)'
);

// 7F. Choice 2 ("Soo geli nashqad beer") — Simultaneous 22 GeoJSON Files Upload (Multi-file & Multi-geometry)
const batch22Inputs: { fileName: string; fileText: string }[] = [
  { fileName: '01_xuduudka_beerta.geojson', fileText: mockBoundaryGeo },
  {
    fileName: '02_blocks_waqooyi.geojson',
    fileText: JSON.stringify({
      type: 'FeatureCollection',
      features: [JSON.parse(mockBlocksGeo).features[0]],
    }),
  },
  {
    fileName: '02_blocks_koonfur.geojson',
    fileText: JSON.stringify({
      type: 'FeatureCollection',
      features: [JSON.parse(mockBlocksGeo).features[1]],
    }),
  },
];

// Add 15 separate plot sector GeoJSON files (14 full 20x25m plots + 1 half 10x20m plot)
for (let sIdx = 0; sIdx < 15; sIdx++) {
  const baseX = 500010 + (sIdx % 5) * 32;
  const baseY = 1050010 + Math.floor(sIdx / 5) * 38;
  const isHalfSector = sIdx === 14;
  const w = isHalfSector ? 10 : 20;
  const h = isHalfSector ? 20 : 25;
  batch22Inputs.push({
    fileName: `03_plots_waaxda_${String(sIdx + 1).padStart(2, '0')}.geojson`,
    fileText: JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            plot_no: sIdx + 1,
            block: sIdx < 8 ? 'R01' : 'R02',
            nooca: isHalfSector ? 'half' : 'dhammaystiran',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [baseX, baseY],
                [baseX + w, baseY],
                [baseX + w, baseY + h],
                [baseX, baseY + h],
                [baseX, baseY],
              ],
            ],
          },
        },
      ],
    }),
  });
}

// Add Wadi LineString, Road LineString, Special Area Polygon, and Landmark Point GeoJSON files (total = 3 + 15 + 4 = 22 files!)
batch22Inputs.push({
  fileName: '05_dooxyada_biyaha.geojson',
  fileText: JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { magaca: 'Dooxa Weyn' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [500005, 1050005],
            [500190, 1050140],
          ],
        },
      },
    ],
  }),
});
batch22Inputs.push({
  fileName: '06_waddooyinka_gudaha.geojson',
  fileText: JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { magaca: 'Jidka Dhexe' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [500000, 1050070],
            [500200, 1050070],
          ],
        },
      },
    ],
  }),
});
batch22Inputs.push({
  fileName: '07_aag_masjid.geojson',
  fileText: JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { magaca: 'Masjidka Beerta' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [500150, 1050110],
              [500180, 1050110],
              [500180, 1050135],
              [500150, 1050135],
              [500150, 1050110],
            ],
          ],
        },
      },
    ],
  }),
});
batch22Inputs.push({
  fileName: '08_dhibic_landmark.geojson',
  fileText: JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Barta Astaanta' },
        geometry: {
          type: 'Point',
          coordinates: [500080, 1050080],
        },
      },
    ],
  }),
});

const inspect22 = inspectAndClassifyNashqadBeerFiles(batch22Inputs);
assert(
  inspect22.ok === true &&
    inspect22.files.length === 22 &&
    inspect22.needsManualSelection === false,
  `Simultaneous 22-file GeoJSON upload auto-recognizes all 22 files without error (got ${inspect22.ok ? inspect22.files.length : 0})`
);
if (inspect22.ok) {
  const built22 = buildNashqadBeerState(inspect22.files);
  assert(
    built22.ok === true &&
      built22.summary.recognizedFiles.length === 22 &&
      built22.summary.blocksCount === 2 &&
      built22.summary.fullPlotsCount === 14 &&
      built22.summary.halfPlotsCount === 1 &&
      (built22.nextState.wadiItems?.length || 0) === 1 &&
      (built22.nextState.roadItems?.length || 0) === 1 &&
      (built22.nextState.specialAreaItems?.length || 0) === 1 &&
      (built22.nextState.extraOverlayLayers?.length || 0) === 1,
    'Simultaneous 22-file GeoJSON build merges 2 block files, 15 plot files (14 full + 1 half), wadis, roads, special area & extra point layer into unified GIS state',
    built22.ok
      ? JSON.stringify({
          rec: built22.summary.recognizedFiles.length,
          blk: built22.summary.blocksCount,
          full: built22.summary.fullPlotsCount,
          half: built22.summary.halfPlotsCount,
          wadi: built22.nextState.wadiItems?.length,
          road: built22.nextState.roadItems?.length,
          sa: built22.nextState.specialAreaItems?.length,
          extra: built22.nextState.extraOverlayLayers?.length,
          roles: inspect22.files.map((f) => `${f.fileName}:${f.detectedRole}`),
        })
      : built22.errorSomali
  );
}

// 7G. Automatic 90×48 m Sample Block + Boundary GeoJSON (Zero Extra Inputs: 15m 4-sided roads, 18×24m plots, 1,5,6,10=18×12m, 2,3,4,7,8,9=9×24m)
{
  // Build a slanted farm boundary in UTM (EPSG:32638) that cuts across both top/bottom rows (exposing 2,3,4 / 7,8,9)
  // and left/right columns (exposing 1,5,6,10) so BOTH 18×12m and 9×24m half-plots are exercised!
  const auto90x48BoundaryGeo = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Xuduudka Beerta 90x48' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [500008, 1050016],
              [500365, 1050016],
              [500395, 1050225],
              [500008, 1050205],
              [500008, 1050016],
            ],
          ],
        },
      },
    ],
  });

  // 90m × 48m sample block GeoJSON inside the boundary (90m E-W, 48m N-S)
  const auto90x48SampleBlockGeo = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Block Tusaale 90x48' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [500080, 1050060],
              [500170, 1050060],
              [500170, 1050108],
              [500080, 1050108],
              [500080, 1050060],
            ],
          ],
        },
      },
    ],
  });

  // Order-agnostic pair splitter check
  const splitSwapped = splitPairIntoBoundaryAndSampleBlock([
    { fileName: 'f_small.geojson', fileText: auto90x48SampleBlockGeo },
    { fileName: 'f_large.geojson', fileText: auto90x48BoundaryGeo },
  ]);
  assert(
    Boolean(
      splitSwapped.ok &&
        splitSwapped.hasBothReady &&
        splitSwapped.boundaryFile.fileName === 'f_large.geojson' &&
        splitSwapped.sampleBlockFile?.fileName === 'f_small.geojson'
    ),
    'splitPairIntoBoundaryAndSampleBlock automatically distinguishes larger farm boundary from 90×48m sample block regardless of selection order'
  );

  // Call runSameeNashqadWorkflow with ONLY boundary + 90×48m sample block GeoJSON (NO plotWidthM, plotDepthM, roadWidthM, or widthBearingDeg!)
  const auto90x48Res = runSameeNashqadWorkflow({
    boundaryFileName: 'xuduudka_beerta.geojson',
    boundaryFileText: auto90x48BoundaryGeo,
    sampleBlockMode: 'file',
    sampleBlockFileName: 'block_tusaale_90x48.geojson',
    sampleBlockFileText: auto90x48SampleBlockGeo,
  });

  assert(
    auto90x48Res.ok === true &&
      auto90x48Res.nextState.params.L === 90 &&
      auto90x48Res.nextState.params.W === 48 &&
      auto90x48Res.nextState.params.pw === 18 &&
      auto90x48Res.nextState.params.pd === 24 &&
      auto90x48Res.nextState.params.rU === 15 &&
      auto90x48Res.nextState.params.rV === 15 &&
      auto90x48Res.summary.standardPlotAreaSqM === 432,
    'Uploading ONLY boundary + 90×48m sample block GeoJSON auto-sets 15m 4-sided roads (rU=15, rV=15) and 18×24m (432 m²) plots with zero extra inputs'
  );

  if (auto90x48Res.ok && auto90x48Res.nextState.prebuiltSubdivision) {
    const genPlots = auto90x48Res.nextState.prebuiltSubdivision.plots;
    const fullGen = genPlots.filter((p) => p.rawProperties?.nooca === 'dhammaystiran');
    const halfGen = genPlots.filter((p) => p.rawProperties?.nooca === 'half');
    const cornerHalves = halfGen.filter((p) =>
      [1, 5, 6, 10].includes(Number(p.rawProperties?.booska_block))
    );
    const middleHalves = halfGen.filter((p) =>
      [2, 3, 4, 7, 8, 9].includes(Number(p.rawProperties?.booska_block))
    );

    assert(
      fullGen.length > 0 &&
        fullGen.every(
          (p) =>
            p.rawProperties?.cabbirka === '18×24 m' &&
            approxEqual(Number(p.rawProperties?.area_m2), 432, 1.0)
        ),
      `All ${fullGen.length} full plots in 90×48m automatic mode are 18×24 m (432 m²)`
    );

    assert(
      halfGen.length > 0 &&
        cornerHalves.every(
          (p) =>
            p.rawProperties?.cabbirka === '18×12 m' &&
            approxEqual(Number(p.rawProperties?.area_m2), 216, 1.0)
        ) &&
        middleHalves.every(
          (p) =>
            p.rawProperties?.cabbirka === '9×24 m' &&
            approxEqual(Number(p.rawProperties?.area_m2), 216, 1.0)
        ) &&
        cornerHalves.length + middleHalves.length === halfGen.length,
      `Half plots in 90×48m automatic mode strictly apply 1,5,6,10 = 18×12 m (${cornerHalves.length}) and 2,3,4,7,8,9 = 9×24 m (${middleHalves.length}), each 216 m²`
    );
  }

  // Also verify Choice 2 ("Soo geli nashqad beer") when user uploads ONLY [xuduudka, block_tusaale_90x48]
  const pairInspect = inspectAndClassifyNashqadBeerFiles([
    { fileName: 'a_beerta.geojson', fileText: auto90x48BoundaryGeo },
    { fileName: 'b_tusaale.geojson', fileText: auto90x48SampleBlockGeo },
  ]);
  assert(
    pairInspect.ok === true && pairInspect.needsManualSelection === false,
    'Choice 2 auto-classifies generic [boundary, 90×48m sample block] GeoJSON pair without manual dropdowns'
  );
  if (pairInspect.ok) {
    const pairBuilt = buildNashqadBeerState(pairInspect.files);
    assert(
      pairBuilt.ok === true &&
        pairBuilt.summary.missingFileMessages.length === 0 &&
        pairBuilt.summary.standardPlotAreaSqM === 432 &&
        pairBuilt.summary.blocksCount > 1 &&
        pairBuilt.summary.fullPlotsCount > 0,
      'Choice 2 ("Soo geli nashqad beer") auto-computes full 90×48m subdivision when only boundary + sample block GeoJSON are uploaded'
    );
  }
}

/* ------------------------------------------------------------------ */
/* 8. MAP SELECTION TOOLS (POLYGON, FREEHAND, RADIUS FOR PLOTS/BLOCKS) */
/* ------------------------------------------------------------------ */
console.log('\n8. Map Selection Tools (Polygon, Freehand, Radius — Plots & Blocks)');
{
  const selSampleState = createInitialSampleSubdivisionState();
  const selSubRes = computeLandSubdivision(
    selSampleState.boundaryItems[selSampleState.selectedBoundaryIndex],
    selSampleState.sampleCandidates[0],
    selSampleState.params
  );
  assert(
    selSubRes !== null && selSubRes.plots.length > 0 && selSubRes.blocks.length > 0,
    'Sample subdivision computed for Map Selection Tools verification'
  );

  if (selSubRes && selSubRes.plots.length >= 2 && selSubRes.blocks.length >= 1) {
    const firstBlock = selSubRes.blocks[0];
    const firstPlot = selSubRes.plots[0];

    // 1. Polygon Selection on Plots & Blocks using first block's exact UTM rectangle
    const polyPlotsRes = selectMapFeaturesByPolygonUtm(
      selSubRes,
      firstBlock.rect,
      'plots'
    );
    const polyBlocksRes = selectMapFeaturesByPolygonUtm(
      selSubRes,
      firstBlock.rect,
      'blocks'
    );
    assert(
      polyPlotsRes.selectedFeaturesCount >= firstBlock.plots.length &&
        polyPlotsRes.selectedPlotIds.includes(firstBlock.plots[0].id) &&
        polyPlotsRes.totalAreaSqM > 0,
      `Polygon tool selects plots inside drawn polygon (${polyPlotsRes.selectedFeaturesCount} plots, ${polyPlotsRes.totalAreaSqM} m²)`
    );
    assert(
      polyBlocksRes.selectedFeaturesCount >= 1 &&
        polyBlocksRes.selectedBlockIds.includes(firstBlock.id),
      `Polygon tool selects blocks inside drawn polygon (${polyBlocksRes.selectedFeaturesCount} blocks)`
    );

    // 2. Freehand Selection on Plots & Blocks using a hand-traced loop around firstPlot center
    const [cx, cy] = firstPlot.centerUtm;
    const freehandLoop: [number, number][] = [
      [cx - 12, cy - 12],
      [cx + 14, cy - 10],
      [cx + 15, cy + 11],
      [cx + 2, cy + 16],
      [cx - 13, cy + 9],
    ];
    const freehandPlotsRes = selectMapFeaturesByFreehandUtm(
      selSubRes,
      freehandLoop,
      'plots'
    );
    const freehandBlocksRes = selectMapFeaturesByFreehandUtm(
      selSubRes,
      freehandLoop,
      'blocks'
    );
    assert(
      freehandPlotsRes.selectedFeaturesCount >= 1 &&
        freehandPlotsRes.selectedPlotIds.includes(firstPlot.id),
      `Freehand tool selects plots intersecting freehand loop (${freehandPlotsRes.selectedFeaturesCount} plots)`
    );
    assert(
      freehandBlocksRes.selectedFeaturesCount >= 1 &&
        freehandBlocksRes.selectedBlockIds.includes(firstPlot.block),
      `Freehand tool selects blocks intersecting freehand loop (${freehandBlocksRes.selectedFeaturesCount} blocks)`
    );

    // 3. Radius Selection on Plots & Blocks (circular buffer around firstPlot center)
    const radiusSmallPlots = selectMapFeaturesByRadiusUtm(
      selSubRes,
      firstPlot.centerUtm,
      5,
      'plots'
    );
    const radiusWiderPlots = selectMapFeaturesByRadiusUtm(
      selSubRes,
      firstPlot.centerUtm,
      45,
      'plots'
    );
    const radiusBlocks = selectMapFeaturesByRadiusUtm(
      selSubRes,
      firstPlot.centerUtm,
      20,
      'blocks'
    );
    assert(
      radiusSmallPlots.selectedFeaturesCount === 1 &&
        radiusSmallPlots.selectedPlotIds[0] === firstPlot.id &&
        radiusWiderPlots.selectedFeaturesCount > radiusSmallPlots.selectedFeaturesCount,
      `Radius tool accurately selects 1 plot at 5m radius and ${radiusWiderPlots.selectedFeaturesCount} plots at 45m radius`
    );
    assert(
      radiusBlocks.selectedFeaturesCount >= 1 &&
        radiusBlocks.selectedBlockIds.includes(firstPlot.block),
      `Radius tool selects intersecting blocks (${radiusBlocks.selectedFeaturesCount} blocks at 20m radius)`
    );

    // 4. Applying manual tier to selected features
    const updatedTierState = applyManualTierToSelectedFeatures(
      selSampleState,
      selSubRes,
      radiusSmallPlots.selectedPlotIds,
      polyBlocksRes.selectedBlockIds,
      'tier_3_basic'
    );
    assert(
      updatedTierState.plotTierOverrides[firstPlot.id] === 'tier_3_basic' &&
        updatedTierState.blockTiers[firstBlock.id] === 'tier_3_basic',
      'applyManualTierToSelectedFeatures assigns chosen manual tier cleanly to selected plots and blocks'
    );
  }
}

/* ------------------------------------------------------------------ */
/* 11. UNIQUE HEIR COLORS & 3 INHERITANCE ALLOCATION MODES            */
/* ------------------------------------------------------------------ */
console.log('\n11. Midab Gaar ah Dhaxle Kasta & 3-da Hab ee Qaybinta Plots-ka (Wadaag La\'aan & Tiro Siman)');
{
  // 11A. Unique per-heir color generator (0..59 = 60 heirs) & zero collision with reserved map status colors
  const reservedStatusColors = new Set([
    '#F43F5E',
    '#FDA4AF',
    '#FB7185',
    '#F59E0B',
    '#64748B',
    '#CBD5E1',
    '#94A3B8',
    '#E2E8F0',
    '#475569',
    '#F8FAFC',
  ]);
  const generated60 = Array.from({ length: 60 }, (_, idx) => getDistinctHeirColor(idx).toUpperCase());
  const unique60Set = new Set(generated60);
  const collidesWithReserved = generated60.some((hex) => reservedStatusColors.has(hex));

  assert(
    unique60Set.size === 60 && !collidesWithReserved,
    `getDistinctHeirColor generates 60/60 100% unique hex colors with zero collisions against reserved status colors (got ${unique60Set.size} unique)`
  );

  assert(
    Boolean(
      LAND_ALLOCATION_MODE_METADATA.exact_shared &&
        LAND_ALLOCATION_MODE_METADATA.whole_balanced &&
        LAND_ALLOCATION_MODE_METADATA.clean_equal_no_half_no_fraction
    ),
    'LAND_ALLOCATION_MODE_METADATA defines Somali metadata for all 3 land allocation modes'
  );

  // 11B. Large 28-heir family in GIS allocation gets 28 strictly unique colors
  if (prebuiltSubRes) {
    const defaultPrices = { tier_1_prime: 1000, tier_2_standard: 1000, tier_3_basic: 1000 };
    const bigFamilyHeirs: HeirsInput = {
      ...EMPTY_HEIRS_INPUT,
      deceasedGender: 'male',
      wivesCount: 4,
      fatherAlive: true,
      motherAlive: true,
      sonsCount: 12,
      daughtersCount: 10,
    };
    const bigFamilyAssets: EstateAssetItem[] = [
      {
        id: 'test_farm_483',
        category: 'farm_land',
        title: 'Beerta 483 Plot',
        quantity: 483,
        unit: 'Plot',
        estimatedValueUSD: 483000,
      },
    ];
    const bigFamilyCalc = calculateInheritance(bigFamilyHeirs, bigFamilyAssets, []);
    const bigFamilyAlloc = allocatePlotsFairlyToHeirs(
      prebuiltSubRes,
      {},
      {},
      {},
      defaultPrices,
      'whole_balanced',
      bigFamilyCalc,
      bigFamilyHeirs
    );
    assert(Boolean(bigFamilyAlloc), 'allocatePlotsFairlyToHeirs succeeds for 28-heir family');
    if (bigFamilyAlloc) {
      const heirColorSet = new Set(bigFamilyAlloc.heirAllocations.map((h) => h.colorHex.toUpperCase()));
      assert(
        bigFamilyAlloc.heirAllocations.length === 28 && heirColorSet.size === 28,
        `All 28 individual heirs receive 28 distinct unique hex colors (got ${heirColorSet.size}/${bigFamilyAlloc.heirAllocations.length})`
      );
      assert(
        bigFamilyAlloc.sharedPlots.length === 0 &&
          bigFamilyAlloc.withheldJajabPlotsCount === 0 &&
          bigFamilyAlloc.allocatedFullPlotsCount === bigFamilyAlloc.totalFullPlots,
        `Mode 2 (whole_balanced) assigns all ${bigFamilyAlloc.totalFullPlots} divisible full plots to sole heirs with 0 shared plots`
      );
    }

    // 11C. Mode 3 ('clean_equal_no_half_no_fraction'): Tiro Siman, Laga Reebo Half-Plots & Jajabka on 523-plot farm (483 full + 40 half)
    const equalTestHeirs: HeirsInput = {
      ...EMPTY_HEIRS_INPUT,
      deceasedGender: 'male',
      wivesCount: 2,
      sonsCount: 3,
      daughtersCount: 2,
    };

    // First verify all 483 full plots (2*30 + 3*105 + 2*52 = 479 allocated, 4 withheld Jajab, 40 half-plots excluded)
    const equal483Calc = calculateInheritance(equalTestHeirs, bigFamilyAssets, []);
    const cleanEqual483 = allocatePlotsFairlyToHeirs(
      prebuiltSubRes,
      {},
      {},
      {},
      defaultPrices,
      'clean_equal_no_half_no_fraction',
      equal483Calc,
      equalTestHeirs
    );
    assert(
      Boolean(
        cleanEqual483 &&
          cleanEqual483.sharedPlots.length === 0 &&
          cleanEqual483.withheldHalfPlotsCount === 40 &&
          cleanEqual483.allocatedFullPlotsCount === 479 &&
          cleanEqual483.withheldJajabPlotsCount === 4 &&
          cleanEqual483.heirAllocations
            .filter((h) => h.heirGroupId === 'wives')
            .every((w) => w.totalWholePlotsAssigned === 30) &&
          cleanEqual483.heirAllocations
            .filter((h) => h.heirGroupId === 'sons')
            .every((s) => s.totalWholePlotsAssigned === 105) &&
          cleanEqual483.heirAllocations
            .filter((h) => h.heirGroupId === 'daughters')
            .every((d) => d.totalWholePlotsAssigned === 52)
      ),
      'Mode 3 (Tiro Siman) on 483 full + 40 half plots excludes 40 half-plots, gives equal integer plots (Wives=30, Sons=105, Daughters=52), 0 shared, and withholds 4 Jajab plots'
    );

    // Next mark 30 full plots as Danguud excluded (453 divisible full plots -> 2*28 + 3*99 + 2*49 = 451 allocated, 2 withheld Jajab)
    const danguudMeta: Record<string, PlotDetailedMetadata> = {};
    for (const p of prebuiltSubRes.plots.slice(0, 30)) {
      danguudMeta[p.id] = {
        plotId: p.id,
        blockId: p.block,
        isExcludedFromDivision: true,
        excludedSpecialName: 'Danguud',
        wadiStatus: 'unverified',
        siteQuality: 'unverified',
      };
    }
    const equalAssets: EstateAssetItem[] = [
      {
        id: 'test_farm_453',
        category: 'farm_land',
        title: 'Beerta 453 Plot',
        quantity: 453,
        unit: 'Plot',
        estimatedValueUSD: 453000,
      },
    ];
    const equalCalc = calculateInheritance(equalTestHeirs, equalAssets, []);
    const cleanEqualAlloc = allocatePlotsFairlyToHeirs(
      prebuiltSubRes,
      {},
      {},
      {},
      defaultPrices,
      'clean_equal_no_half_no_fraction',
      equalCalc,
      equalTestHeirs,
      { plotMetadata: danguudMeta, blockMetadata: {} }
    );
    assert(Boolean(cleanEqualAlloc), 'clean_equal_no_half_no_fraction produces valid allocation result with 30 Danguud exclusions');
    if (cleanEqualAlloc) {
      const wivesAlloc = cleanEqualAlloc.heirAllocations.filter((h) => h.heirGroupId === 'wives');
      const sonsAlloc = cleanEqualAlloc.heirAllocations.filter((h) => h.heirGroupId === 'sons');
      const daughtersAlloc = cleanEqualAlloc.heirAllocations.filter(
        (h) => h.heirGroupId === 'daughters'
      );

      const allWivesEqual =
        wivesAlloc.length === 2 &&
        wivesAlloc.every((w) => w.totalWholePlotsAssigned === wivesAlloc[0].totalWholePlotsAssigned);
      const allSonsEqual =
        sonsAlloc.length === 3 &&
        sonsAlloc.every((s) => s.totalWholePlotsAssigned === sonsAlloc[0].totalWholePlotsAssigned);
      const allDaughtersEqual =
        daughtersAlloc.length === 2 &&
        daughtersAlloc.every(
          (d) => d.totalWholePlotsAssigned === daughtersAlloc[0].totalWholePlotsAssigned
        );
      const noFractionsAnywhere = cleanEqualAlloc.heirAllocations.every(
        (h) =>
          Math.abs(h.effectiveTotalPlotsReceived - h.totalWholePlotsAssigned) < 1e-9 &&
          Number.isInteger(h.totalWholePlotsAssigned)
      );

      const withheldIds = cleanEqualAlloc.withheldJajabPlotIds || [];
      assert(
        cleanEqualAlloc.sharedPlots.length === 0 &&
          cleanEqualAlloc.excludedPlotsCount === 30 &&
          cleanEqualAlloc.withheldHalfPlotsCount === 40 &&
          allWivesEqual &&
          wivesAlloc[0].totalWholePlotsAssigned === 28 &&
          allSonsEqual &&
          sonsAlloc[0].totalWholePlotsAssigned === 99 &&
          allDaughtersEqual &&
          daughtersAlloc[0].totalWholePlotsAssigned === 49 &&
          noFractionsAnywhere &&
          cleanEqualAlloc.allocatedFullPlotsCount === 451 &&
          cleanEqualAlloc.withheldJajabPlotsCount === 2 &&
          withheldIds.length === 2,
        `Mode 3 (Tiro Siman) with 30 Danguud exclusions gives equal integer plots per role (Wives=28, Sons=99, Daughters=49), 0 shared plots, and withholds 2 Jajab plots`,
        JSON.stringify({
          shared: cleanEqualAlloc.sharedPlots.length,
          halfExcluded: cleanEqualAlloc.withheldHalfPlotsCount,
          wives: wivesAlloc.map((w) => w.totalWholePlotsAssigned),
          sons: sonsAlloc.map((s) => s.totalWholePlotsAssigned),
          daughters: daughtersAlloc.map((d) => d.totalWholePlotsAssigned),
          allocated: cleanEqualAlloc.allocatedFullPlotsCount,
          withheldJajab: cleanEqualAlloc.withheldJajabPlotsCount,
        })
      );

      // Verify withheld Jajab plots carry unassignedReason === 'withheld_jajab' and appear cleanly in CSV/GeoJSON export
      const allMarkedJajab = withheldIds.every(
        (pid) =>
          cleanEqualAlloc.plotAssignments[pid]?.assignmentType === 'unassigned' &&
          cleanEqualAlloc.plotAssignments[pid]?.unassignedReason === 'withheld_jajab'
      );
      const csvReg = buildPlotRegisterCSV(prebuiltSubRes, {}, {}, cleanEqualAlloc, {
        plotMetadata: danguudMeta,
      });
      const expLayers = buildExportLayers(prebuiltSubRes, {}, {}, cleanEqualAlloc, {
        plotMetadata: danguudMeta,
      });
      assert(
        allMarkedJajab &&
          csvReg.includes('Jajab Laga Reebay (Tiro Siman)') &&
          (expLayers.Plots || []).some(
            (f) => f.props.Heir_Name === 'Jajab Laga Reebay (Tiro Siman)' && f.props.Alloc_Type === 'Withheld_Jajab'
          ),
        'Withheld Jajab plots are tagged with unassignedReason=withheld_jajab and labeled clearly in CSV & GeoJSON exports'
      );
    }
  }

  // 11D. Standalone Plot Mode Allocation (mapless estate with 25.5 plots across 2 Sons)
  const twoSonsIndividuals = [
    { heirGroupId: 'sons', personIndex: 0, individualPercentage: 50 },
    { heirGroupId: 'sons', personIndex: 1, individualPercentage: 50 },
  ];
  const standaloneWhole = computeStandalonePlotModeAllocation(
    25.5,
    twoSonsIndividuals,
    'whole_balanced'
  );
  const standaloneClean = computeStandalonePlotModeAllocation(
    25.5,
    twoSonsIndividuals,
    'clean_equal_no_half_no_fraction'
  );
  assert(
    standaloneWhole.withheldHalfPlotsUnits === 0.5 &&
      standaloneWhole.allocatedWholePlots === 25 &&
      standaloneWhole.withheldJajabPlotsCount === 0 &&
      standaloneWhole.perHeirPlots['sons::0'] + standaloneWhole.perHeirPlots['sons::1'] === 25 &&
      standaloneClean.withheldHalfPlotsUnits === 0.5 &&
      standaloneClean.allocatedWholePlots === 24 &&
      standaloneClean.withheldJajabPlotsCount === 1 &&
      standaloneClean.perHeirPlots['sons::0'] === 12 &&
      standaloneClean.perHeirPlots['sons::1'] === 12,
    'computeStandalonePlotModeAllocation handles mapless 25.5 plots accurately across whole_balanced (13+12) and clean_equal_no_half_no_fraction (12+12 equal, 0.5 half + 1 jajab withheld)'
  );
}

/* ============================================================================
 * SECTION 12: KML/KMZ PARSER & HALF-PLOTS INCLUDE/EXCLUDE TOGGLE (v1.3.0)
 * ============================================================================ */
console.log('\n12. Soo Gelinta Faylasha KML (APK) & Toggle-ka Half-Plots (Ku Dar / Ka Reeb)');
{
  const sampleKmlBoundary = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Xuduudka Beerta KML</name>
    <Placemark>
      <name>Xuduudka Weyn</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              44.0600,9.5600,0 44.0622,9.5600,0 44.0622,9.5618,0 44.0600,9.5618,0 44.0600,9.5600,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

  const sampleKmlPlotsAndWadi = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Folder>
      <name>Plots KML</name>
      <Placemark>
        <name>Plot 1</name>
        <ExtendedData>
          <SimpleData name="block">R01</SimpleData>
          <SimpleData name="plot_no">1</SimpleData>
          <SimpleData name="nooca">dhammaystiran</SimpleData>
        </ExtendedData>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>
                44.0602,9.5602,0 44.0604,9.5602,0 44.0604,9.5605,0 44.0602,9.5605,0 44.0602,9.5602,0
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>
      <Placemark>
        <name>Plot 2 Half</name>
        <ExtendedData>
          <SimpleData name="block">R01</SimpleData>
          <SimpleData name="plot_no">2</SimpleData>
          <SimpleData name="nooca">half</SimpleData>
        </ExtendedData>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>
                44.0604,9.5602,0 44.0605,9.5602,0 44.0605,9.5605,0 44.0604,9.5605,0 44.0604,9.5602,0
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

  const sampleKmlDoox = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Placemark>
    <name>Dooxa Biyaha</name>
    <LineString>
      <coordinates>44.0601,9.5601,0 44.0620,9.5616,0</coordinates>
    </LineString>
  </Placemark>
</kml>`;

  assert(
    isLikelyKmlString(sampleKmlBoundary) === true &&
      isLikelyKmlString('{"type":"FeatureCollection","features":[]}') === false,
    'isLikelyKmlString accurately distinguishes XML KML documents from GeoJSON'
  );

  const kmlConv = convertKmlTextToGeoJsonObject(sampleKmlPlotsAndWadi, 'plots.kml');
  assert(
    kmlConv.ok === true &&
      kmlConv.featureCount === 2 &&
      kmlConv.geoJson.features[0]?.properties?.block === 'R01' &&
      kmlConv.geoJson.features[1]?.properties?.nooca === 'half',
    'convertKmlTextToGeoJsonObject converts KML Placemarks + ExtendedData/SimpleData into GeoJSON FeatureCollection'
  );

  const kmlNashqadInspect = inspectAndClassifyNashqadBeerFiles([
    { fileName: '01_xuduudka.kml', fileText: sampleKmlBoundary },
    { fileName: '03_plots.kml', fileText: sampleKmlPlotsAndWadi },
    { fileName: '05_dooxyada.kml', fileText: sampleKmlDoox },
  ]);
  assert(
    kmlNashqadInspect.ok === true &&
      kmlNashqadInspect.files.length === 3 &&
      buildNashqadBeerState(kmlNashqadInspect.files).ok === true,
    'Nashqad workflow seamlessly classifies and builds farm state directly from raw .kml files'
  );

  // Test Half-Plot Inclusion vs Exclusion in GIS Spatial Allocation
  const hpSampleState = createInitialSampleSubdivisionState();
  const hpSubRes = computeLandSubdivision(
    hpSampleState.boundaryItems[hpSampleState.selectedBoundaryIndex],
    hpSampleState.sampleCandidates[0],
    hpSampleState.params
  );
  const hpHeirs: HeirsInput = {
    ...EMPTY_HEIRS_INPUT,
    sonsCount: 2,
    daughtersCount: 2,
  };
  const hpAssets: EstateAssetItem[] = [
    {
      id: 'hp_test_farm',
      category: 'farm_land',
      title: 'Beerta Tijaabada Half-Plots',
      quantity: 118,
      unit: 'Plot',
      estimatedValueUSD: 600000,
    },
  ];
  const hpCalc = calculateInheritance(hpHeirs, hpAssets, []);
  const hpPrices = {
    tier_1_prime: 2000,
    tier_2_standard: 1500,
    tier_3_basic: 1000,
  };

  if (hpSubRes) {
    const validHalfCountOnMap = hpSubRes.halfPlotSummary?.validHalfPlotsCount || 0;
    assert(validHalfCountOnMap > 0, `Sample farm contains ${validHalfCountOnMap} valid 216 m² half-plots for toggle test`);

    const allocExcluded = allocatePlotsFairlyToHeirs(
      hpSubRes,
      {},
      {},
      {},
      hpPrices,
      'exact_shared',
      hpCalc,
      hpHeirs,
      { includeValidHalfPlots: false }
    );
    const allocIncludedExact = allocatePlotsFairlyToHeirs(
      hpSubRes,
      {},
      {},
      {},
      hpPrices,
      'exact_shared',
      hpCalc,
      hpHeirs,
      { includeValidHalfPlots: true }
    );
    const allocIncludedWhole = allocatePlotsFairlyToHeirs(
      hpSubRes,
      {},
      {},
      {},
      hpPrices,
      'whole_balanced',
      hpCalc,
      hpHeirs,
      { includeValidHalfPlots: true }
    );

    assert(
      Boolean(
        allocExcluded &&
          allocExcluded.includeValidHalfPlots === false &&
          allocExcluded.validHalfPlotsIncludedCount === 0 &&
          (allocExcluded.withheldHalfPlotsCount ?? 0) >= validHalfCountOnMap &&
          Math.abs((allocExcluded.effectivePoolPlotUnits ?? 0) - allocExcluded.totalFullPlots) < 1e-6
      ),
      'When includeValidHalfPlots=false, all half-plots are withheld and effectivePoolPlotUnits equals full plots only'
    );

    if (allocIncludedExact && allocExcluded) {
      const sumExactReceived = allocIncludedExact.heirAllocations.reduce(
        (s, h) => s + h.effectiveTotalPlotsReceived,
        0
      );
      const inclPool = allocIncludedExact.effectivePoolPlotUnits ?? 0;
      assert(
        allocIncludedExact.includeValidHalfPlots === true &&
          allocIncludedExact.validHalfPlotsIncludedCount === validHalfCountOnMap &&
          allocIncludedExact.withheldHalfPlotsCount === 0 &&
          Math.abs(inclPool - (allocExcluded.totalFullPlots + validHalfCountOnMap * 0.5)) < 1e-6 &&
          Math.abs(sumExactReceived - inclPool) < 1e-4,
        `When includeValidHalfPlots=true (exact_shared), ${validHalfCountOnMap} half-plots (+${
          validHalfCountOnMap * 0.5
        } plot units) enter inheritance pool (${inclPool} total units)`
      );
    }

    if (allocIncludedWhole) {
      const sumWholeReceived = allocIncludedWhole.heirAllocations.reduce(
        (s, h) => s + h.effectiveTotalPlotsReceived,
        0
      );
      const wholePool = allocIncludedWhole.effectivePoolPlotUnits ?? 0;
      assert(
        allocIncludedWhole.sharedPlots.length === 0 &&
          Math.abs(sumWholeReceived - wholePool) <= 0.5 + 1e-6,
        `When includeValidHalfPlots=true (whole_balanced), 0 plots are shared and quantum 0.5-plot allocation balances cleanly (allocated ${sumWholeReceived}/${wholePool})`
      );
    }

    // Verify syncSubdivisionToEstateAssets respects includeValidHalfPlots
    const syncedExcl = syncSubdivisionToEstateAssets(
      [],
      hpSubRes,
      {},
      {},
      hpPrices,
      {},
      {},
      false
    );
    const syncedIncl = syncSubdivisionToEstateAssets(
      [],
      hpSubRes,
      {},
      {},
      hpPrices,
      {},
      {},
      true
    );
    const qtyExcl = syncedExcl.reduce((s, a) => s + (a.quantity || 0), 0);
    const qtyIncl = syncedIncl.reduce((s, a) => s + (a.quantity || 0), 0);
    assert(
      Math.abs(qtyIncl - (qtyExcl + validHalfCountOnMap * 0.5)) < 1e-6,
      `syncSubdivisionToEstateAssets adds +${validHalfCountOnMap * 0.5} plot units when includeValidHalfPlots=true (${qtyExcl} -> ${qtyIncl})`
    );
  }

  // Standalone mapless Half-Plot Include vs Exclude (10.5 plots across 2 Sons)
  const twoSons = [
    { heirGroupId: 'sons', personIndex: 0, individualPercentage: 50 },
    { heirGroupId: 'sons', personIndex: 1, individualPercentage: 50 },
  ];
  const standExcl = computeStandalonePlotModeAllocation(10.5, twoSons, 'whole_balanced', false);
  const standIncl = computeStandalonePlotModeAllocation(10.5, twoSons, 'whole_balanced', true);
  assert(
    standExcl.withheldHalfPlotsUnits === 0.5 &&
      standExcl.allocatedWholePlots === 10 &&
      standIncl.withheldHalfPlotsUnits === 0 &&
      standIncl.allocatedWholePlots === 10.5 &&
      standIncl.perHeirPlots['sons::0'] + standIncl.perHeirPlots['sons::1'] === 10.5,
    'computeStandalonePlotModeAllocation toggles 0.5 Half-Plot between Ka Reeb (10 allocated, 0.5 withheld) and Ku Dar (10.5 allocated)'
  );
}

// =========================================================================
// SECTION 13: Falanqaynta E10, E11 & E13 — Unified Farm Metrics & 0-Heir Guard
// =========================================================================
console.log('\n13. Falanqaynta E10, E11 & E13 — Hal Isha Xisaabeed (Unified Metrics & 0-Heir Guard)');
{
  const sampleState = createInitialSampleSubdivisionState();
  const bItem = sampleState.boundaryItems[sampleState.selectedBoundaryIndex] || null;
  const sCand =
    sampleState.selectedSampleIndex >= 0
      ? sampleState.sampleCandidates[sampleState.selectedSampleIndex] || null
      : null;
  const subRes = computeLandSubdivision(
    bItem,
    sCand,
    sampleState.params,
    sampleState.prebuiltSubdivision,
    sampleState.specialAreaItems
  );

  const mExcl = computeUnifiedFarmMetrics(
    { ...sampleState, includeValidHalfPlotsInAllocation: false },
    subRes,
    true
  );
  const mIncl = computeUnifiedFarmMetrics(
    { ...sampleState, includeValidHalfPlotsInAllocation: true },
    subRes,
    true
  );

  assert(
    mExcl.hasMap &&
      mExcl.boundaryAreaSqM > mExcl.allPlotsAreaSqM &&
      mExcl.halfPlotsCount > 0 &&
      mExcl.allPlotsAreaSqM > mExcl.divisiblePlotsAreaSqM &&
      mIncl.divisiblePlotsAreaSqM === mIncl.allPlotsAreaSqM,
    `E10/E11: computeUnifiedFarmMetrics separates Boundary (${mExcl.boundaryAreaSqM} m²), All Plots (${mExcl.allPlotsAreaSqM} m²), Divisible Plots (${mExcl.divisiblePlotsAreaSqM} m² vs ${mIncl.divisiblePlotsAreaSqM} m²), and preserves ${mExcl.halfPlotsCount} Half Plots`
  );

  // Exact PDF audit scenario reconciliation: 95,700 m² boundary, 118 Full (50,976 m²) + 11 Half (2,376 m²) = 53,352 m²
  const createdRes = createNewManagedCase({
    existingCases: [],
    caseName: 'Kiiska Tusaalaha Koowaad',
    referenceNumber: 'KIIS-2026-0099',
    caseDate: '2026-10-31',
    deceasedName: 'Marxuum Tusaale',
  });
  assert(createdRes.ok, 'E10/E11: createNewManagedCase creates test case cleanly');
  if (createdRes.ok) {
    const mockAuditCase = createdRes.caseRecord;
    mockAuditCase.hasMapGeometry = true;
    mockAuditCase.blocksCount = 18;
    mockAuditCase.fullPlotsCount = 118;
    mockAuditCase.validHalfPlotsCount = 11;
    mockAuditCase.landSubdivisionSnapshot = {
      ...createEmptyLandSubdivisionState(),
      includeValidHalfPlotsInAllocation: false,
      nashqadSummary: {
        workflowMode: 'import_nashqad',
        blocksCount: 18,
        fullPlotsCount: 118,
        halfPlotsCount: 11,
        totalPlotsAreaSqM: 53352,
        boundaryAreaSqM: 95700,
        hasBlocksFile: true,
      },
    };
    const savedAuditMetrics = computeSavedCaseUnifiedMetrics(mockAuditCase);
    assert(
      savedAuditMetrics.boundaryAreaSqM === 95700 &&
        savedAuditMetrics.boundaryAreaHa === 9.57 &&
        savedAuditMetrics.allPlotsAreaSqM === 53352 &&
        savedAuditMetrics.divisiblePlotsAreaSqM === 50976 &&
        savedAuditMetrics.halfPlotsCount === 11,
      'E10/E11: computeSavedCaseUnifiedMetrics reconciles 95,700 m² (9.57 ha) boundary, 53,352 m² all plots, 50,976 m² divisible full plots, and 11 Half Plots'
    );
  }

  // E13: 0-heir validation guard
  assert(
    countEnteredHeirs(EMPTY_HEIRS_INPUT) === 0,
    'E13: countEnteredHeirs returns 0 for EMPTY_HEIRS_INPUT'
  );
  assert(
    countEnteredHeirs({
      ...EMPTY_HEIRS_INPUT,
      deceasedGender: 'male',
      husbandAlive: true,
    }) === 0,
    'E13: countEnteredHeirs ignores husbandAlive when deceasedGender is male'
  );
  assert(
    countEnteredHeirs({
      ...EMPTY_HEIRS_INPUT,
      deceasedGender: 'male',
      wivesCount: 1,
      sonsCount: 2,
      daughtersCount: 3,
    }) === 6,
    'E13: countEnteredHeirs accurately sums entered heirs (1 wife + 2 sons + 3 daughters = 6)'
  );
}

/* ------------------------------------------------------------------ */
/* 14. SAMPLE BLOCK BEARING, LENGTH & WIDTH ALIGNMENT                 */
/* ------------------------------------------------------------------ */
console.log('\n14. Waafajinta Bearing-ka, Dhererka & Ballaca ee Block Tusaale');
{
  // 14A. North-South (~0°/90°) 4-vertex sample block with tiny +dx on both opposite long edges
  // Previously frameFromRing cancelled opposite N-S edges when both had tiny dx > 0!
  const nsSampleGeoJson = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'NS Sample Block' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              // Long edge (88m) runs almost due North-South; short edge (44m) runs East-West (~90° bearing)
              [500010.0, 1050010.0],
              [500010.08, 1050098.0],
              [500054.08, 1050097.96],
              [500054.0, 1050009.96],
              [500010.0, 1050010.0],
            ],
          ],
        },
      },
    ],
  });

  const nsMetrics = inspectSampleBlockMetricsFromGeoJson(nsSampleGeoJson, 'ns_sample.geojson');
  assert(
    Boolean(
      nsMetrics &&
        approxEqual(nsMetrics.lengthM, 88, 0.25) &&
        approxEqual(nsMetrics.widthM, 44, 0.25) &&
        (Math.abs(nsMetrics.widthBearingDeg - 90) < 1.0 ||
          Math.abs(nsMetrics.widthBearingDeg - 270) < 1.0)
    ),
    `14A: North-South 4-vertex sample block preserves exact 88×44m & ~90° width bearing without opposite-edge cancellation (got ${nsMetrics?.lengthM}×${nsMetrics?.widthM}m @ ${nsMetrics?.widthBearingDeg}°)`
  );

  // 14B. Rotated sample block (28° width bearing, 91.6m × 47.0m -> auto-snaps to 90×48m by default -> detects mismatch -> 1-click aligns to exact 91.6×47.0m & 28°)
  const makeRotatedRectCoords = (
    cx: number,
    cy: number,
    lengthM: number,
    widthM: number,
    widthBearingDeg: number
  ): [number, number][] => {
    const wRad = (widthBearingDeg * Math.PI) / 180;
    const vx = Math.sin(wRad);
    const vy = Math.cos(wRad);
    // Long axis u perpendicular (+90° compass)
    const lRad = ((widthBearingDeg + 90) * Math.PI) / 180;
    const ux = Math.sin(lRad);
    const uy = Math.cos(lRad);
    const hl = lengthM / 2;
    const hw = widthM / 2;
    const c0: [number, number] = [cx - ux * hl - vx * hw, cy - uy * hl - vy * hw];
    const c1: [number, number] = [cx + ux * hl - vx * hw, cy + uy * hl - vy * hw];
    const c2: [number, number] = [cx + ux * hl + vx * hw, cy + uy * hl + vy * hw];
    const c3: [number, number] = [cx - ux * hl + vx * hw, cy - uy * hl + vy * hw];
    return [c0, c1, c2, c3, c0];
  };

  const farmBoundaryLarge = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Xuduudka Beerta Tijaabada' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [500000, 1050000],
              [500360, 1050000],
              [500360, 1050280],
              [500000, 1050280],
              [500000, 1050000],
            ],
          ],
        },
      },
    ],
  });

  const rotatedSample91x47 = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Block Tusaale 28deg' },
        geometry: {
          type: 'Polygon',
          coordinates: [makeRotatedRectCoords(500120, 1050110, 91.6, 47.0, 28)],
        },
      },
    ],
  });

  // Default runSameeNashqadWorkflow (uploading Xuduud + Block Tusaale) snaps 91.6×47.0 to 90×48m -> triggers hasMismatch === true!
  const defaultSamee = runSameeNashqadWorkflow({
    boundaryFileName: 'xuduudka_beerta.geojson',
    boundaryFileText: farmBoundaryLarge,
    sampleBlockMode: 'file',
    sampleBlockFileName: 'block_tusaale.geojson',
    sampleBlockFileText: rotatedSample91x47,
  });

  assert(
    Boolean(
      defaultSamee.ok &&
        defaultSamee.summary.sampleBlockAlignment &&
        defaultSamee.summary.sampleBlockAlignment.hasMismatch === true &&
        approxEqual(defaultSamee.summary.sampleBlockAlignment.sampleLengthM, 91.6, 0.2) &&
        approxEqual(defaultSamee.summary.sampleBlockAlignment.sampleWidthM, 47.0, 0.2) &&
        defaultSamee.summary.sampleBlockAlignment.appliedLengthM === 90 &&
        defaultSamee.summary.sampleBlockAlignment.appliedWidthM === 48
    ),
    '14B: Default Samee Nashqad detects dimension discrepancy when 91.6×47.0m sample block snaps to 90×48m'
  );

  if (defaultSamee.ok) {
    // Now click "Waafaji Dherer & Ballac" -> alignAllBlocksToSampleBlock
    const alignedRes = alignAllBlocksToSampleBlock(defaultSamee.nextState, {
      exactDimensions: true,
      swapAxes: false,
    });
    assert(
      Boolean(
        alignedRes.ok &&
          alignedRes.summary.sampleBlockAlignment &&
          alignedRes.summary.sampleBlockAlignment.hasMismatch === false &&
          alignedRes.summary.sampleBlockAlignment.bearingDiffDeg <= 0.25 &&
          approxEqual(alignedRes.summary.sampleBlockAlignment.appliedLengthM, 91.6, 0.2) &&
          approxEqual(alignedRes.summary.sampleBlockAlignment.appliedWidthM, 47.0, 0.2) &&
          alignedRes.summary.blocksCount > 0
      ),
      `14C: alignAllBlocksToSampleBlock aligns all ${alignedRes.ok ? alignedRes.summary.blocksCount : 0} prebuilt blocks to exact sample bearing (28°) & dimensions (91.6×47.0m)`
    );

    // Also test 90° axis swap (rotates block orientation by 90° from 28° -> 118° while preserving 91.6×47.0m block size)
    if (alignedRes.ok) {
      const swappedRes = alignAllBlocksToSampleBlock(alignedRes.nextState, {
        exactDimensions: true,
        swapAxes: true,
      });
      assert(
        Boolean(
          swappedRes.ok &&
            swappedRes.summary.sampleBlockAlignment &&
            swappedRes.summary.sampleBlockAlignment.axesSwapped === true &&
            swappedRes.summary.sampleBlockAlignment.hasMismatch === false &&
            approxEqual(swappedRes.summary.sampleBlockAlignment.appliedWidthBearingDeg, 118.0, 0.5) &&
            approxEqual(swappedRes.summary.sampleBlockAlignment.appliedLengthM, 91.6, 0.2) &&
            approxEqual(swappedRes.summary.sampleBlockAlignment.appliedWidthM, 47.0, 0.2)
        ),
        '14D: alignAllBlocksToSampleBlock with swapAxes=true rotates block orientation by 90° (28° -> 118°)'
      );
    }
  }

  // 12E. Multi-file upload ("Soo geli nashqad beer"): Boundary + mismatched Blocks (0°, 80×50m) + Sample Block (28°, 91.6×47.0m)
  const mismatchedMultiBlocks = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { block: 'R01' },
        geometry: {
          type: 'Polygon',
          coordinates: [makeRotatedRectCoords(500080, 1050060, 80, 50, 0)],
        },
      },
      {
        type: 'Feature',
        properties: { block: 'R02' },
        geometry: {
          type: 'Polygon',
          coordinates: [makeRotatedRectCoords(500180, 1050060, 80, 50, 0)],
        },
      },
    ],
  });

  const multiInspect = inspectAndClassifyNashqadBeerFiles([
    { fileName: 'xuduudka_beerta.geojson', fileText: farmBoundaryLarge },
    { fileName: 'blocks.geojson', fileText: mismatchedMultiBlocks },
    { fileName: 'block_tusaale.geojson', fileText: rotatedSample91x47 },
  ]);

  assert(multiInspect.ok === true, '12E.1: Multi-file upload with xuduudka + blocks + block_tusaale parses cleanly');
  if (multiInspect.ok) {
    const multiBuilt = buildNashqadBeerState(multiInspect.files);
    assert(
      Boolean(
        multiBuilt.ok &&
          multiBuilt.summary.sampleBlockAlignment &&
          multiBuilt.summary.sampleBlockAlignment.hasMismatch === true &&
          multiBuilt.summary.sampleBlockAlignment.bearingDiffDeg > 20
      ),
      `12E.2: buildNashqadBeerState detects bearing mismatch (${multiBuilt.ok ? multiBuilt.summary.sampleBlockAlignment?.bearingDiffDeg : -1}°) between blocks.geojson (0°) and block_tusaale.geojson (28°)`
    );

    if (multiBuilt.ok) {
      const multiAligned = alignAllBlocksToSampleBlock(multiBuilt.nextState, {
        exactDimensions: true,
        swapAxes: false,
      });
      assert(
        Boolean(
          multiAligned.ok &&
            multiAligned.summary.blocksCount > 2 &&
            multiAligned.summary.sampleBlockAlignment?.hasMismatch === false
        ),
        `12E.3: alignAllBlocksToSampleBlock regenerates all ${multiAligned.ok ? multiAligned.summary.blocksCount : 0} farm blocks to match block_tusaale.geojson`
      );
    }
  }

  // 12F. Parametric CAD mode alignment (when prebuiltSubdivision is null and params.rot or L/W differ from sampleCandidates[0])
  const cadBase = importSimultaneousFarmGeoJsonFiles(createEmptyLandSubdivisionState(), [
    { fileName: 'xuduudka_beerta.geojson', rawJson: JSON.parse(farmBoundaryLarge) },
    { fileName: 'block_tusaale.geojson', rawJson: JSON.parse(rotatedSample91x47) },
  ]);
  assert(Boolean(cadBase && !cadBase.nextState.prebuiltSubdivision), '12F.1: Simultaneous upload creates parametric CAD state with sampleCandidates');
  if (cadBase) {
    const skewedCadState = {
      ...cadBase.nextState,
      params: {
        ...cadBase.nextState.params,
        L: 110,
        W: 60,
        rot: 17,
      },
    };
    const skewedComp = computeLandSubdivision(
      skewedCadState.boundaryItems[0],
      skewedCadState.sampleCandidates[0],
      skewedCadState.params,
      null
    );
    assert(
      Boolean(
        skewedComp?.sampleBlockAlignment &&
          skewedComp.sampleBlockAlignment.hasMismatch === true &&
          skewedComp.sampleBlockAlignment.bearingDiffDeg > 15
      ),
      '12F.2: Parametric CAD computeLandSubdivision detects bearing & dimension mismatch against sampleCandidates[0]'
    );

    const fixedCad = alignAllBlocksToSampleBlock(skewedCadState, {
      exactDimensions: true,
      swapAxes: false,
    });
    assert(
      Boolean(
        fixedCad.ok &&
          !fixedCad.nextState.prebuiltSubdivision &&
          fixedCad.nextState.params.rot === 0 &&
          fixedCad.summary.sampleBlockAlignment?.hasMismatch === false &&
          approxEqual(fixedCad.nextState.params.L, 91.6, 0.2) &&
          approxEqual(fixedCad.nextState.params.W, 47.0, 0.2)
      ),
      '12F.3: alignAllBlocksToSampleBlock in Parametric CAD mode resets rot=0 and matches exact L=91.6m, W=47.0m'
    );
  }
}

/* ------------------------------------------------------------------ */
/* 15. INDEPENDENT DHERER & BALLAC SEATING + MANUAL BEARING DEGREE    */
/* ------------------------------------------------------------------ */
console.log('\n15. Fadhiisinta Gooni-goonida ah ee Dhererka & Ballaca + Bearing Degree Gacanta');
{
  const makeObliqueSamplePolygon = (
    cx: number,
    cy: number,
    lengthM: number,
    lengthBearingDeg: number,
    widthM: number,
    widthBearingDeg: number
  ): [number, number][] => {
    const lRad = (lengthBearingDeg * Math.PI) / 180;
    const ux = Math.sin(lRad);
    const uy = Math.cos(lRad);
    const wRad = (widthBearingDeg * Math.PI) / 180;
    const vx = Math.sin(wRad);
    const vy = Math.cos(wRad);
    const hl = lengthM / 2;
    const hw = widthM / 2;
    const c0: [number, number] = [cx - ux * hl - vx * hw, cy - uy * hl - vy * hw];
    const c1: [number, number] = [cx + ux * hl - vx * hw, cy + uy * hl - vy * hw];
    const c2: [number, number] = [cx + ux * hl + vx * hw, cy + uy * hl + vy * hw];
    const c3: [number, number] = [cx - ux * hl + vx * hw, cy - uy * hl + vy * hw];
    return [c0, c1, c2, c3, c0];
  };

  const farmBndOblique = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Beerta Skewed Test' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [500000, 1050000],
              [500450, 1050000],
              [500450, 1050380],
              [500000, 1050380],
              [500000, 1050000],
            ],
          ],
        },
      },
    ],
  });

  // 15A. Skewed / Parallelogram Block Tusaale: Dherer = 92.0m @ 95° bearing, Ballac = 46.0m @ 14° bearing (81° oblique angle, NOT 90°!)
  const skewedSampleGeoJson = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Block Tusaale Oblique' },
        geometry: {
          type: 'Polygon',
          coordinates: [makeObliqueSamplePolygon(500160, 1050140, 92.0, 95.0, 46.0, 14.0)],
        },
      },
    ],
  });

  const obliqueMetrics = inspectSampleBlockMetricsFromGeoJson(
    skewedSampleGeoJson,
    'oblique_sample.geojson'
  );
  assert(
    Boolean(
      obliqueMetrics &&
        approxEqual(obliqueMetrics.lengthM, 92.0, 0.25) &&
        approxEqual(obliqueMetrics.widthM, 46.0, 0.25) &&
        approxEqual(obliqueMetrics.lengthBearingDeg % 180, 95.0, 0.3) &&
        approxEqual(obliqueMetrics.widthBearingDeg % 180, 14.0, 0.3)
    ),
    `15A: Parallelogram Block Tusaale extracts true opposite-edge bearings independently (Dherer=${obliqueMetrics?.lengthM}m @ ${obliqueMetrics?.lengthBearingDeg}°, Ballac=${obliqueMetrics?.widthM}m @ ${obliqueMetrics?.widthBearingDeg}°)`
  );

  // 15B. Start with misaligned blocks (L=100m @ 112°, W=52m @ 22°) + skewed Block Tusaale -> test independent 'length_only'
  const misalignedBlocks = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { block_id: 'B1' },
        geometry: {
          type: 'Polygon',
          coordinates: [makeObliqueSamplePolygon(500140, 1050120, 100.0, 112.0, 52.0, 22.0)],
        },
      },
      {
        type: 'Feature',
        properties: { block_id: 'B2' },
        geometry: {
          type: 'Polygon',
          coordinates: [makeObliqueSamplePolygon(500260, 1050120, 100.0, 112.0, 52.0, 22.0)],
        },
      },
    ],
  });

  const inspectedOblique = inspectAndClassifyNashqadBeerFiles([
    { fileName: 'xuduudka_beerta.geojson', fileText: farmBndOblique },
    { fileName: 'blocks.geojson', fileText: misalignedBlocks },
    { fileName: 'block_tusaale.geojson', fileText: skewedSampleGeoJson },
  ]);
  assert(Boolean(inspectedOblique.ok), '15B.1: Multi-file upload with skewed Block Tusaale parses cleanly');

  if (inspectedOblique.ok) {
    const builtInit = buildNashqadBeerState(
      inspectedOblique.files,
      createEmptyLandSubdivisionState()
    );
    assert(
      Boolean(
        builtInit.ok &&
          builtInit.summary.sampleBlockAlignment?.hasLengthMismatch === true &&
          builtInit.summary.sampleBlockAlignment?.hasWidthMismatch === true
      ),
      '15B.2: Initial state detects BOTH Dherer mismatch and Ballac mismatch independently'
    );

    if (builtInit.ok) {
      // Step 1: Seat ONLY Dherer ('length_only') -> Dherer matches 92.0m @ 95°, while Ballac stays at 52.0m @ 22°!
      const lengthSeated = alignAllBlocksToSampleBlock(builtInit.nextState, {
        mode: 'length_only',
      });
      const lenAlign = lengthSeated.ok ? lengthSeated.summary.sampleBlockAlignment : null;
      assert(
        Boolean(
          lengthSeated.ok &&
            lenAlign &&
            lenAlign.isLengthAligned === true &&
            lenAlign.hasLengthMismatch === false &&
            approxEqual(lenAlign.appliedLengthM, 92.0, 0.25) &&
            approxEqual(lenAlign.appliedLengthBearingDeg, 95.0, 0.3) &&
            lenAlign.hasWidthMismatch === true &&
            approxEqual(lenAlign.appliedWidthM, 52.0, 0.25) &&
            approxEqual(lenAlign.appliedWidthBearingDeg, 22.0, 0.3)
        ),
        `15B.3: mode='length_only' seats Dherer onto Block Tusaale (${lenAlign?.appliedLengthM}m @ ${lenAlign?.appliedLengthBearingDeg}°) while leaving Ballac untouched (${lenAlign?.appliedWidthM}m @ ${lenAlign?.appliedWidthBearingDeg}°)`
      );

      // Step 2: Now Dherer matches Block Tusaale! Manually nudge Ballaca bearing degree (22° -> 18° -> 14°) via 'manual_bearing' WITHOUT disturbing Dherer!
      if (lengthSeated.ok) {
        const manualStep1 = alignAllBlocksToSampleBlock(lengthSeated.nextState, {
          mode: 'manual_bearing',
          manualWidthBearingDeg: 18.0,
          manualWidthM: 46.0,
        });
        const m1 = manualStep1.ok ? manualStep1.summary.sampleBlockAlignment : null;
        assert(
          Boolean(
            manualStep1.ok &&
              m1 &&
              m1.isLengthAligned === true &&
              approxEqual(m1.appliedLengthBearingDeg, 95.0, 0.3) &&
              approxEqual(m1.appliedWidthBearingDeg, 18.0, 0.3) &&
              m1.hasWidthMismatch === true
          ),
          `15C.1: Manual Ballaca bearing 18.0° keeps Dherer locked at ${m1?.appliedLengthBearingDeg}° (${m1?.appliedLengthM}m) while tilting Ballac to ${m1?.appliedWidthBearingDeg}°`
        );

        if (manualStep1.ok) {
          const manualStep2 = alignAllBlocksToSampleBlock(manualStep1.nextState, {
            mode: 'manual_bearing',
            manualWidthBearingDeg: 14.0,
            manualWidthM: 46.0,
          });
          const m2 = manualStep2.ok ? manualStep2.summary.sampleBlockAlignment : null;
          assert(
            Boolean(
              manualStep2.ok &&
                m2 &&
                m2.isLengthAligned === true &&
                m2.isWidthAligned === true &&
                m2.hasMismatch === false &&
                approxEqual(m2.appliedLengthBearingDeg, 95.0, 0.3) &&
                approxEqual(m2.appliedWidthBearingDeg, 14.0, 0.3)
            ),
            `15C.2: Manual Ballaca bearing 14.0° achieves 100% full sample alignment (Dherer=${m2?.appliedLengthBearingDeg}°, Ballac=${m2?.appliedWidthBearingDeg}°, hasMismatch=${m2?.hasMismatch})`
          );
        }

        // Step 3: Also verify 1-click 'width_only' from lengthSeated
        const widthSeated = alignAllBlocksToSampleBlock(lengthSeated.nextState, {
          mode: 'width_only',
        });
        const wAlign = widthSeated.ok ? widthSeated.summary.sampleBlockAlignment : null;
        assert(
          Boolean(
            widthSeated.ok &&
              wAlign &&
              wAlign.isLengthAligned === true &&
              wAlign.isWidthAligned === true &&
              wAlign.hasMismatch === false
          ),
          '15D: mode="width_only" seats Ballac onto Block Tusaale while keeping Dherer locked'
        );

        // Step 4: Guard against collinear Dherer & Ballac bearings (< 10° apart)
        const collinearAttempt = alignAllBlocksToSampleBlock(lengthSeated.nextState, {
          mode: 'manual_bearing',
          manualWidthBearingDeg: 93.0, // within 2° of Dherer 95°!
        });
        assert(
          collinearAttempt.ok === false,
          '15E: Collinear manual bearing (< 10° from locked Dherer) is cleanly rejected with Somali guidance'
        );
      }
    }
  }

  // 15F. Parametric CAD mode: independent Dherer lock + manual Ballaca bearing degree
  const cadOblique = importSimultaneousFarmGeoJsonFiles(createEmptyLandSubdivisionState(), [
    { fileName: 'xuduudka_beerta.geojson', rawJson: JSON.parse(farmBndOblique) },
    { fileName: 'block_tusaale.geojson', rawJson: JSON.parse(skewedSampleGeoJson) },
  ]);
  if (cadOblique) {
    // Tilt Ballaca manually to 22° while Dherer stays locked at 95°
    const cadTiltedWidth = alignAllBlocksToSampleBlock(cadOblique.nextState, {
      mode: 'manual_bearing',
      manualLengthBearingDeg: 95.0,
      manualWidthBearingDeg: 22.0,
      manualLengthM: 92.0,
      manualWidthM: 46.0,
    });
    const cadComp =
      cadTiltedWidth.ok
        ? computeLandSubdivision(
            cadTiltedWidth.nextState.boundaryItems[0],
            cadTiltedWidth.nextState.sampleCandidates[0],
            cadTiltedWidth.nextState.params,
            null
          )
        : null;
    assert(
      Boolean(
        cadTiltedWidth.ok &&
          cadComp?.sampleBlockAlignment &&
          cadComp.sampleBlockAlignment.isLengthAligned === true &&
          approxEqual(cadComp.sampleBlockAlignment.appliedLengthBearingDeg, 95.0, 0.3) &&
          approxEqual(cadComp.sampleBlockAlignment.appliedWidthBearingDeg, 22.0, 0.3) &&
          cadComp.sampleBlockAlignment.hasWidthMismatch === true
      ),
      '15F.1: Parametric CAD mode supports independent customLengthBearingDeg (95°) + manual customWidthBearingDeg (22°)'
    );

    if (cadTiltedWidth.ok) {
      const cadFixedWidth = alignAllBlocksToSampleBlock(cadTiltedWidth.nextState, {
        mode: 'manual_bearing',
        manualWidthBearingDeg: 14.0,
        manualWidthM: 46.0,
      });
      assert(
        Boolean(
          cadFixedWidth.ok &&
            cadFixedWidth.summary.sampleBlockAlignment?.isLengthAligned === true &&
            cadFixedWidth.summary.sampleBlockAlignment?.isWidthAligned === true &&
            cadFixedWidth.summary.sampleBlockAlignment?.hasMismatch === false
        ),
        '15F.2: Parametric CAD manual Ballaca bearing seating to 14° aligns Ballac while preserving Dherer 95°'
      );
    }
  }
}

/* ============================================================================
 * SECTION 16: SAHANKA AI v2 — 10-YEAR ARCHIVE & HUBINTA 15m / 90x48m (v1.6.0)
 * ============================================================================ */
async function runSection16SahankaTests(): Promise<void> {
  console.log('\n16. Sahanka AI v2 — Raadinta 10 Sano, Hubinta 15m/90×48m & Toosinta Halbeegga');

  // 16A. Deterministic 10-Year Climatology Baseline (10 full years, valid peak & flood risk)
  const hydro10 = computeOfflineClimatology10Yr(9.56, 44.06);
  assert(
    hydro10.yearsAnalyzed === 10 &&
      hydro10.yearlyBreakdown.length === 10 &&
      hydro10.avgAnnualRainfallMm > 100 &&
      hydro10.maxDailyRainfallMm > 15,
    `16A: 10-year hydrology archive produces 10 full years (${hydro10.startYear}–${hydro10.endYear}, avg ${hydro10.avgAnnualRainfallMm}mm)`
  );

  // 16B. Non-compliant layout (100×50m blocks + 8m road) is flagged by audit15mAnd90x48mCompliance
  const synthBnd = buildSurveyBoundaryGeoJsonFromCenter({
    centerLat: 9.56,
    centerLon: 44.06,
    eastWestM: 360,
    northSouthM: 260,
    bearingDeg: 0,
  });
  const nonCompliantRes = runSameeNashqadWorkflow({
    boundaryFileName: synthBnd.fileName,
    boundaryFileText: synthBnd.boundaryGeoJsonText,
    sampleBlockMode: 'dimensions',
    blockLengthM: 100,
    blockWidthM: 50,
    roadWidthM: 8,
    plotWidthM: 20,
    plotDepthM: 25,
    widthBearingDeg: 0,
  });
  assert(nonCompliantRes.ok === true, '16B.1: Built non-standard 100×50m (8m road) test layout');

  if (nonCompliantRes.ok) {
    const badAudit = audit15mAnd90x48mCompliance(nonCompliantRes.nextState);
    const blkChk = badAudit.checks.find((c) => c.id === 'block_90x48');
    const rdChk = badAudit.checks.find((c) => c.id === 'road_15m');
    const pltChk = badAudit.checks.find((c) => c.id === 'full_plot_432');
    assert(
      badAudit.isFullyCompliant === false &&
        blkChk?.passed === false &&
        rdChk?.passed === false &&
        pltChk?.passed === false,
      `16B.2: audit15mAnd90x48mCompliance accurately flags non-compliant 100×50m / 8m road (${badAudit.passedCount}/${badAudit.totalChecks} passed)`
    );

    // 16C. 1-Click Auto-Fix (`autoFixToStandard15m90x48`) restores 100% 90×48m + 15m 4-sided road compliance!
    const fixed = await autoFixToStandard15m90x48(nonCompliantRes.nextState, 0);
    assert(
      Boolean(
        fixed.ok &&
          fixed.complianceAudit.isFullyCompliant === true &&
          fixed.complianceAudit.passedCount === 5 &&
          fixed.complianceAudit.minMeasuredBlockGapM !== null &&
          approxEqual(fixed.complianceAudit.minMeasuredBlockGapM, 15.0, 0.4)
      ),
      `16C: autoFixToStandard15m90x48 achieves 5/5 compliance (90×48m blocks, ${
        fixed.ok ? fixed.complianceAudit.minMeasuredBlockGapM : null
      }m road gap, 432 m² plots)`
    );
  }

  // 16D. Full Sahanka AI Survey with Wadi <= 30m automatically assigns Heer 3 (`tier_3_basic`)
  const wadiAcrossCenterGeoJson = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Dooxa Dhexe' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [44.0585, 9.5600],
            [44.0615, 9.5600],
          ],
        },
      },
    ],
  });

  const sahanRes = await runSahankaAiSurvey({
    mode: 'auto_10yr',
    currentState: createEmptyLandSubdivisionState(),
    coordinateArea: {
      centerLat: 9.56,
      centerLon: 44.06,
      eastWestM: 350,
      northSouthM: 250,
    },
    wadiFile: {
      fileName: 'dooxa_dhexe.geojson',
      fileText: wadiAcrossCenterGeoJson,
    },
    skipGeminiCall: true,
  });

  assert(
    Boolean(
      sahanRes.ok &&
        sahanRes.complianceAudit.isFullyCompliant === true &&
        sahanRes.complianceAudit.wadiRiskPlotsCount > 0 &&
        sahanRes.complianceAudit.checks.find((c) => c.id === 'wadi_30m_tier3')?.passed === true
    ),
    `16D: runSahankaAiSurvey auto_10yr builds 90×48m + 15m layout and assigns Heer 3 to all ${
      sahanRes.ok ? sahanRes.complianceAudit.wadiRiskPlotsCount : 0
    } plots within ≤ 30m of Dooxa`
  );
}

runSection16SahankaTests()
  .then(() => {
    console.log('\n-------------------------------------------------------------------');
    console.log(` REGRESSION SUMMARY: ${passedCount} passed, ${failedCount} failed`);
    console.log('-------------------------------------------------------------------');

    if (failedCount > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Unhandled error in Section 16 tests:', err);
    process.exit(1);
  });

