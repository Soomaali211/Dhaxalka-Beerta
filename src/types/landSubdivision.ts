import { AssetQualityTier } from './inheritance';

export type Point2D = [number, number];

export interface ParsedGeoItem {
  name: string;
  type: 'Polygon' | 'Line';
  coords: Point2D[];
  rawGeometryType?: string;
  rawProperties?: Record<string, unknown>;
}

export interface SampleBlockCandidate {
  label: string;
  ring: Point2D[];
}

export interface SampleBlockAlignmentInfo {
  sampleFileName: string;
  /** Exact uploaded sample block polygon in WGS84 [lon, lat] for map overlay & re-alignment */
  sampleRingLonLat: Point2D[];
  /** Surveyed long side (Dherer) of the uploaded sample block in meters */
  sampleLengthM: number;
  /** Surveyed short side (Ballac) of the uploaded sample block in meters */
  sampleWidthM: number;
  /** Natural compass bearing (0°–180°) of the sample block's short/width axis */
  sampleWidthBearingDeg: number;
  /** Natural compass bearing (0°–180°) of the sample block's long/length axis */
  sampleLengthBearingDeg: number;
  /** Currently applied block length (Dherer) of generated blocks in meters */
  appliedLengthM: number;
  /** Currently applied block width (Ballac) of generated blocks in meters */
  appliedWidthM: number;
  /** Currently applied compass bearing (0°–180°) of generated blocks' width axis */
  appliedWidthBearingDeg: number;
  /** Currently applied compass bearing (0°–180°) of generated blocks' length axis */
  appliedLengthBearingDeg: number;
  /** Maximum angular discrepancy (0°–90°) across length & width axes */
  bearingDiffDeg: number;
  /** Angular discrepancy (0°–90°) between generated blocks' Dherer axis and sample block's Dherer axis */
  lengthBearingDiffDeg: number;
  /** Angular discrepancy (0°–90°) between generated blocks' Ballac axis and sample block's Ballac axis */
  widthBearingDiffDeg: number;
  /** Absolute difference |appliedLengthM - targetSampleLengthM| in meters */
  lengthDiffM: number;
  /** Absolute difference |appliedWidthM - targetSampleWidthM| in meters */
  widthDiffM: number;
  /** True when Dherer bearing (>0.25°) or Dherer length (>0.15m) differs from sample block */
  hasLengthMismatch: boolean;
  /** True when Ballac bearing (>0.25°) or Ballac width (>0.15m) differs from sample block */
  hasWidthMismatch: boolean;
  /** True when Dherer length and bearing match sample block */
  isLengthAligned: boolean;
  /** True when Ballac width and bearing match sample block */
  isWidthAligned: boolean;
  /** True when either Dherer or Ballac has a bearing or dimension mismatch */
  hasMismatch: boolean;
  /** True when explicitly aligned to match exact sample block bearing, dherer & ballac */
  isAlignedToExactSample: boolean;
  /** True when Dherer <-> Ballac axes were swapped by 90° relative to sample block */
  axesSwapped: boolean;
}

export interface SubdivisionParams {
  L: number;      // Block length (m)
  W: number;      // Block width (m)
  pw: number;     // Plot width (m)
  pd: number;     // Plot depth (m)
  rU: number;     // Road between columns/blocks along U (m)
  rV: number;     // Road between rows/blocks along V (m)
  linkRoads: boolean;
  rot: number;    // Rotation adjustment (degrees)
  minP: number;   // Minimum full plots to keep a block
  su: number;     // U-offset (m)
  sv: number;     // V-offset (m)
  swap: boolean;  // Align block length along short side of sample
  /** Optional independent compass bearing (0°–180°) for Block Length (Dhererka) */
  customLengthBearingDeg?: number | null;
  /** Optional independent compass bearing (0°–180°) for Block Width (Ballaca) */
  customWidthBearingDeg?: number | null;
}

export type HalfPlotValidationStatus =
  | 'full_inside'
  | 'full_outside'
  | 'boundary_clipped'
  | 'half_plot_valid'
  | 'half_plot_invalid'
  | 'needs_review'
  | 'insufficient_data';

export type BlockBoundaryStatus = 'full_inside' | 'boundary_clipped' | 'full_outside';

export type HalfPlotRuleCode = '12x18' | '9x24' | 'unknown';

export interface HalfPlotExpectedRule {
  ruleCode: HalfPlotRuleCode;
  label: string;               // "12 × 18 m" or "9 × 24 m"
  targetAreaSqM: number;       // 216
  canonicalSpanU: number;      // e.g. 18 for Plot 1,5,6,10; 9 for Plot 2,3,4,7,8,9
  canonicalSpanV: number;      // e.g. 12 for Plot 1,5,6,10; 24 for Plot 2,3,4,7,8,9
  appliesToPlotNumbers: number[];
}

export interface PlotHalfValidationRecord {
  plotId: string;
  blockId: string;
  plotNumber: number;
  blockTotalPlots: number;
  boundaryRelation: 'full_inside' | 'full_outside' | 'boundary_clipped' | 'insufficient_data';
  validationStatus: HalfPlotValidationStatus;
  statusLabelSomali: string;
  expectedRule: HalfPlotExpectedRule;
  nominalPlotAreaSqM: number;
  insideAreaSqM: number;
  outsideAreaSqM: number;
  insidePercentage: number;
  /** Exact clipped polygon ring(s) inside the verified farm boundary (UTM meters) */
  insideRingsUtm: Point2D[][];
  /** Exact clipped polygon ring(s) outside the verified farm boundary (UTM meters) */
  outsideRingsUtm: Point2D[][];
  /** Best inscribed axis-aligned Half Plot rectangle (UTM meters) if valid/fitting */
  inscribedHalfPlotRectUtm: Point2D[] | null;
  /** Measured best rectangular fit inside the clipped polygon (along U × along V in m) */
  measuredBestSpanU: number;
  measuredBestSpanV: number;
  measuredDisplayDimensions: string;
  touchesRoadFrontage: boolean;
  isFullyContainedInBoundary: boolean;
  hasUnauthorizedOverlap: boolean;
  overlappingPlotIds: string[];
  orientationCanonical: boolean;
  reasonSomali: string;
  warningsSomali: string[];
}

export interface HalfPlotValidationSummary {
  totalEvaluatedBlocks: number;
  fullInsideBlocksCount: number;
  boundaryClippedBlocksCount: number;
  totalEvaluatedPlots: number;
  fullInsidePlotsCount: number;
  fullOutsidePlotsCount: number;
  boundaryClippedPlotsCount: number;
  validHalfPlotsCount: number;
  invalidHalfPlotsCount: number;
  needsReviewPlotsCount: number;
  insufficientDataPlotsCount: number;
  overlappingPlotsCount: number;
  boundaryGeometryValid: boolean;
  boundaryValidationWarnings: string[];
}

export interface HalfPlotAffectedChangeItem {
  plotId: string;
  blockId: string;
  plotNumber: number;
  previousStatus: HalfPlotValidationStatus;
  newStatus: HalfPlotValidationStatus;
  previousInsideAreaSqM: number;
  newInsideAreaSqM: number;
  reasonSomali: string;
}

export interface HalfPlotValidationHistorySnapshot {
  id: string;
  timestamp: string;
  boundaryLabel: string;
  boundaryAreaSqM: number;
  triggerReasonSomali: string;
  summary: HalfPlotValidationSummary;
  affectedPlotChanges: HalfPlotAffectedChangeItem[];
  /** Compact map of PlotID -> status & insideAreaSqM at this snapshot for future diffs */
  plotStatusMap: Record<
    string,
    {
      status: HalfPlotValidationStatus;
      insideAreaSqM: number;
      expectedLabel: string;
      reasonSomali: string;
    }
  >;
}

export interface HtmlHalfPlotRecord {
  id: string;        // e.g. "R1-C1-P01-H1"
  block: string;     // e.g. "R1-C1"
  parent: string;    // e.g. "R1-C1-P01"
  plotId: string;    // alias for parent ("R1-C1-P01")
  pno: number;       // 1..10
  n: 1 | 2;          // 1 or 2
  rect: Point2D[];   // 4 UTM corners
  centerUtm: Point2D;// centroid in UTM meters
  w: number;         // 18 (corner) or 9 (middle)
  d: number;         // 12 (corner) or 24 (middle)
  hl: number;        // HTML half-length along U (18 or 9)
  hw: number;        // HTML half-width along V (12 or 24)
  area: number;      // w * d (e.g. 216 m²)
  status: 'full' | 'partial' | 'outside';
  counted: boolean;  // status === 'full' (HALF_FULL)
  reason: string;
  specialAreaName?: string;
}

export interface ComputedSpecialAreaSummary {
  name: string;
  ring: Point2D[];    // projected UTM ring
  ringUtm: Point2D[]; // alias for projected UTM ring
  area: number;       // polygon area (m²)
  nP: number;         // full plots completely inside this special area
  nH: number;         // counted half-plots completely inside this special area
  aP: number;         // total full-plot area (m²)
  aH: number;         // total counted half-plot area (m²)
}

export interface GeneratedPlot {
  id: string;     // e.g. "R1-C1-P01"
  block: string;  // e.g. "R1-C1"
  no: number;     // 1-based number inside block
  r: number;      // row inside block (1..nR)
  c: number;      // col inside block (1..nC)
  rect: Point2D[]; // 4+ projected UTM corners
  centerUtm: Point2D;
  centerLonLat: Point2D;
  full: boolean;  // strictly inside farm boundary
  calculatedAreaSqM?: number; // exact polygon shoelace area in UTM m²
  preservedProps?: Record<string, unknown>;
  /** Exact HTML classifier status ('full' | 'partial' | 'outside') */
  htmlStatus?: 'full' | 'partial' | 'outside';
  /** Two deterministic half-plots (-H1, -H2) for partial plots matching Naqshadeeyaha_Blocks_Plots_v2 */
  htmlHalves?: HtmlHalfPlotRecord[];
  /** Number of counted (HALF_FULL) half-plots inside this plot (0, 1, or 2) */
  nHalfCounted?: number;
  /** Somali classification reason matching Naqshadeeyaha_Blocks_Plots_v2 */
  htmlReason?: string;
  /** Matched Special Area (Aag gaar ah) name if plot lies completely inside one */
  specialAreaName?: string;
  /** Detailed Half Plot & boundary clipping validation result */
  halfPlotValidation?: PlotHalfValidationRecord;
}

export interface GeneratedBlock {
  id: string;     // e.g. "R1-C1"
  ci: number;
  rj: number;
  R: number;      // 1-based row index (top to bottom)
  C: number;      // 1-based col index (left to right)
  rect: Point2D[]; // projected UTM corners
  centerUtm: Point2D;
  plots: GeneratedPlot[];
  nf: number;     // count of full plots inside boundary
  /** Count of counted (HALF_FULL) half-plots inside this block */
  nh?: number;
  total: number;  // nC * nR
  complete: boolean;
  isSample: boolean;
  htmlStatus?: 'full' | 'partial' | 'outside';
  calculatedAreaSqM?: number;
  preservedProps?: Record<string, unknown>;
  /** Boundary status for the block itself (Section 2.2) */
  boundaryStatus?: BlockBoundaryStatus;
  insideBlockAreaSqM?: number;
  validHalfPlotsInBlock?: number;
  clippedPlotsInBlock?: number;
  outsidePlotsInBlock?: number;
}

/** Pre-existing Blocks & Plots imported from a rich GeoJSON without regenerating geometry */
export interface PrebuiltGeoJsonSubdivision {
  sourceFileName: string;
  detectedCrs: string;
  boundaryRingLonLat: Point2D[] | null;
  boundaryAreaReportedHa?: number | null;
  wadiLinesLonLat?: {
    name: string;
    coords: Point2D[];
    rawProperties?: Record<string, unknown>;
  }[];
  blocks: {
    id: string;
    R: number;
    C: number;
    ringLonLat: Point2D[];
    rawProperties: Record<string, unknown>;
  }[];
  plots: {
    id: string;
    blockId: string;
    no: number;
    ringLonLat: Point2D[];
    rawProperties: Record<string, unknown>;
  }[];
  validationWarnings: string[];
  /** Sample block bearing, dherer & ballac comparison when generated or uploaded alongside a sample block */
  sampleBlockAlignment?: SampleBlockAlignmentInfo | null;
}

export interface SubdivisionComputationResult {
  zone: number;
  south: boolean;
  epsg: number;
  projDef: string;
  bring: Point2D[]; // projected boundary ring
  barea: number;    // boundary area (m²)
  bperim: number;   // boundary perimeter (m)
  bb: [number, number, number, number]; // [minX, minY, maxX, maxY]
  params: SubdivisionParams;
  u: Point2D;
  v: Point2D;
  c0: Point2D;
  angle: number;
  nR: number;
  nC: number;
  pad: number;
  blocks: GeneratedBlock[];
  plots: GeneratedPlot[]; // ONLY full valid plots (Gudaha oo dhan)
  /** All evaluated plots across all inside & boundary-clipped blocks (1..10 per block) */
  allEvaluatedPlots?: GeneratedPlot[];
  /** Clipped plots that passed strict 12×18m or 9×24m Half Plot validation (216 m²) */
  validHalfPlots?: GeneratedPlot[];
  /** All generated HTML half-plots (-H1, -H2) for kept partial plots */
  htmlHalves?: HtmlHalfPlotRecord[];
  /** Counted HTML half-plots (status === 'full' / HALF_FULL) */
  htmlHalvesCounted?: HtmlHalfPlotRecord[];
  /** Computed Special Areas (Aag gaar ah — S.areas) with plot & half-plot counts */
  specialAreas?: ComputedSpecialAreaSummary[];
  /** Count of plots completely outside farm boundary */
  nOutPlots?: number;
  /** Lookup of Plot ID -> PlotHalfValidationRecord */
  plotValidations?: Record<string, PlotHalfValidationRecord>;
  /** Summary counts of full, outside, clipped, valid Half Plot, invalid, review & insufficient */
  halfPlotSummary?: HalfPlotValidationSummary;
  sample: {
    ring: Point2D[];
    long: number;
    short: number;
    isAutoDerived: boolean;
  } | null;
  sampleRect: Point2D[] | null;
  sampleNote: { dL: number; dW: number } | null;
  sampleBlockAlignment?: SampleBlockAlignmentInfo | null;
  warnings: string[];
  isPrebuiltGeometry?: boolean;
  inv: (utm: Point2D) => Point2D;
  fwd: (lonLat: Point2D) => Point2D;
}

export type LandAllocationMode =
  | 'exact_shared'
  | 'whole_balanced'
  | 'clean_equal_no_half_no_fraction';

/** Section 5: Wadi / Seasonal Stream Status */
export type WadiStatus =
  | 'cuts_through'
  | 'partial'
  | 'nearby'
  | 'none'
  | 'unverified';

/** Section 5: Site / Soil Quality Rating */
export type SiteQualityRating =
  | 'very_good'
  | 'good'
  | 'medium'
  | 'poor'
  | 'unverified';

/** Spatial Zone Preset Mode */
export type ZonePresetMode = 'quadrants_4' | 'columns_4' | 'rows_4' | 'custom';

/** Approval lifecycle state (Section 6, 7.C, 9, 10) */
export type AllocationApprovalStatus = 'draft_proposal' | 'under_review' | 'approved';

/** Section 4: Detailed Post-Subdivision Plot Metadata (never mutates plot geometry) */
export interface PlotDetailedMetadata {
  plotId: string;
  blockId: string;
  parcelNumberOrName?: string;
  /** Whether this plot is excluded from inheritance division (laga reebay qaybinta dhaxalka) */
  isExcludedFromDivision?: boolean;
  /** Special/custom name for excluded or designated plot (e.g. Masjidka, Ceelka, Waqf, Dugsiga) */
  excludedSpecialName?: string;
  zoneOverride?: string;
  verifiedAreaSqM?: number | null;
  wadiStatus: WadiStatus;
  siteQuality: SiteQualityRating;
  surfaceCondition?: string;
  shapeAndLandUse?: string;
  verifiedPrice?: number | null;
  usageRestrictions?: string;
  notes?: string;
  supportingDocsRef?: string;
  preservedExternalProps?: Record<string, unknown>;
  updatedAt?: string;
}

/** Section 4: Detailed Block-Level Metadata */
export interface BlockDetailedMetadata {
  blockId: string;
  blockName?: string;
  /** Whether this entire block is excluded from inheritance division */
  isExcludedFromDivision?: boolean;
  /** Special/custom name for excluded or designated block */
  excludedSpecialName?: string;
  zoneId?: string;
  generalCondition?: string;
  notes?: string;
  preservedExternalProps?: Record<string, unknown>;
  updatedAt?: string;
}

export interface SubdivisionAuditEntry {
  id: string;
  timestamp: string;
  actionType:
    | 'geojson_import'
    | 'metadata_update'
    | 'bulk_import'
    | 'wadi_detection'
    | 'manual_allocation'
    | 'auto_proposal'
    | 'approval_change'
    | 'half_plot_validation'
    | 'exclusion_update'
    | 'tier_change';
  summarySomali: string;
}

export interface MetadataConflictItem {
  targetType: 'plot' | 'block';
  id: string;
  field: string;
  existingValue: string;
  incomingValue: string;
}

export interface PendingBulkMetadataImport {
  sourceName: string;
  matchedPlotCount: number;
  matchedBlockCount: number;
  excludedPlotsInImportCount?: number;
  excludedBlocksInImportCount?: number;
  unmatchedIds: string[];
  duplicateIdsInFile: string[];
  conflicts: MetadataConflictItem[];
  incomingPlotMetadata: Record<string, Partial<PlotDetailedMetadata>>;
  incomingBlockMetadata: Record<string, Partial<BlockDetailedMetadata>>;
  incomingPlotTiers: Record<string, AssetQualityTier>;
  incomingBlockTiers?: Record<string, AssetQualityTier>;
  incomingBlockZones: Record<string, string>;
  /** Populated when CSV rows can construct a standalone Blocks & Plots layout (e.g. mapless case or custom IDs) */
  synthesizedPrebuiltFromCsv?: PrebuiltGeoJsonSubdivision | null;
}

export interface TierPricingConfig {
  tier_1_prime: number;    // Value per plot (0 = unvalued land)
  tier_2_standard: number;
  tier_3_basic: number;
}

export interface CaseExportMetadata {
  caseId?: string;
  caseName: string;
  referenceNumber: string;
  caseDate?: string;
  caseStatus?: string;
}

export interface AutoTierEvaluationSummary {
  generatedAt: string;
  demSourceLabel: string;
  roadSourceLabel: string;
  minElevationM: number | null;
  maxElevationM: number | null;
  avgSlopePercent: number;
  nearestRoadDistanceM: number | null;
  nearestRoadPointLonLat?: Point2D | null;
  nearestFarmPointLonLat?: Point2D | null;
  detectedRoadLineLonLat?: Point2D[] | null;
  tier1BlocksCount: number;
  tier2BlocksCount: number;
  tier3BlocksCount: number;
  tier1PlotsCount: number;
  tier2PlotsCount: number;
  tier3PlotsCount: number;
  gulliedPlotsCount: number;
}

export type NashqadFileRole =
  | 'boundary'
  | 'blocks'
  | 'plots'
  | 'wadis'
  | 'roads'
  | 'special_area'
  | 'extra_layer'
  | 'ignore'
  | 'unknown';

export interface NashqadFileRecognitionItem {
  fileName: string;
  role:
    | 'boundary'
    | 'blocks'
    | 'plots'
    | 'wadis'
    | 'roads'
    | 'special_area'
    | 'extra_layer';
  featureCount: number;
  recognizedBy: 'filename' | 'geometry' | 'manual';
}

export interface ExtraGeoJsonOverlayLayer {
  id: string;
  name: string;
  colorHex: string;
  featureCount: number;
  polygonsLonLat: { ring: Point2D[]; label?: string }[];
  linesLonLat: { coords: Point2D[]; label?: string }[];
  pointsLonLat: { coord: Point2D; label?: string }[];
}

export interface NashqadWorkflowSummary {
  mode: 'samee_nashqad' | 'soo_geli_nashqad';
  createdAt: string;
  recognizedFiles: NashqadFileRecognitionItem[];
  missingFileMessages: string[];
  blocksCount: number;
  fullPlotsCount: number;
  halfPlotsCount: number;
  totalPlotsAreaSqM: number;
  boundaryAreaSqM: number;
  standardPlotAreaSqM: number;
  /** Compass bearing in degrees (0°–360° clockwise from North) for the direction of Block Width (W) */
  widthBearingDeg?: number;
  /** Sample block bearing, dherer & ballac comparison metadata */
  sampleBlockAlignment?: SampleBlockAlignmentInfo | null;
}

export interface LandSubdivisionState {
  boundaryItems: ParsedGeoItem[];
  boundaryFileName: string;
  selectedBoundaryIndex: number;
  sampleCustom: boolean;
  sampleCandidates: SampleBlockCandidate[];
  sampleFileName: string;
  selectedSampleIndex: number;
  /** Optional Special Area polygons (Aag gaar ah — Slot A in Naqshadeeyaha_Blocks_Plots_v2) */
  specialAreaItems?: ParsedGeoItem[];
  specialAreaFileName?: string;
  params: SubdivisionParams;
  /** Optional pre-designed Blocks & Plots imported directly from rich GeoJSON or CSV */
  prebuiltSubdivision?: PrebuiltGeoJsonSubdivision | null;
  /** Summary card metadata from "+" FAB workflows ("Samee nashqad" & "Soo geli nashqad beer") */
  nashqadSummary?: NashqadWorkflowSummary | null;
  /** Optional extra GIS GeoJSON layers imported during 20+ multi-file farm uploads */
  extraOverlayLayers?: ExtraGeoJsonOverlayLayer[];
  /** Optional GIS Wadi / Stream layer items (LineString / Polygon) */
  wadiItems?: ParsedGeoItem[];
  wadiFileName?: string;
  /** Optional City-Connecting Road layer items & manual/detected anchor point */
  roadItems?: ParsedGeoItem[];
  roadFileName?: string;
  cityRoadAnchorLonLat?: Point2D | null;
  /** Latest Automatic Tier Generator summary (DEM + City Road + Flatness/Gullies) */
  autoTierSummary?: AutoTierEvaluationSummary | null;
  /** Block ID -> Spatial Zone ID (e.g., "Zone A", "Zone B", "Zone C", "Zone D") */
  blockZones: Record<string, string>;
  zonePresetMode: ZonePresetMode;
  /** Enforce non-adjacent block rule during automatic allocation */
  enforceNonAdjacentBlocks: boolean;
  /** Block ID -> Quality Tier (default tier_1_prime if unset, or auto-graded) */
  blockTiers: Record<string, AssetQualityTier>;
  /** Optional individual Plot ID -> Quality Tier override */
  plotTierOverrides: Record<string, AssetQualityTier>;
  /** Detailed post-subdivision per-plot metadata keyed by stable Plot ID */
  plotMetadata: Record<string, PlotDetailedMetadata>;
  /** Detailed post-subdivision per-block metadata keyed by stable Block ID */
  blockMetadata: Record<string, BlockDetailedMetadata>;
  /** Optional manual Plot ID -> heirKey ("heirGroupId::personIndex") override */
  manualPlotHeirOverrides: Record<string, string>;
  /** Per-plot value per tier (0 = unvalued in-kind distribution) */
  tierUnitPrices: TierPricingConfig;
  /** Whether this GIS subdivision is actively linked into Estate Assets */
  isLinkedToEstate: boolean;
  /** Whether verified Half Plots (0.5 Plot = 216 m²) are included in Sharia plot distribution */
  includeValidHalfPlotsInAllocation?: boolean;
  /** Optional surveyor review notes/flags on Half Plots without fabricating invalid geometry */
  halfPlotReviewNotes?: Record<string, string>;
  /** Preserved history of Half Plot validations across boundary/geometry updates (Section 2.6) */
  halfPlotValidationHistory?: HalfPlotValidationHistorySnapshot[];
  /** Allocation mode for fractional remainders within each stratum */
  allocationMode: LandAllocationMode;
  /** Approval workflow status (automatic allocation is a proposal until approved) */
  approvalStatus: AllocationApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  /** Change & approval history */
  auditHistory: SubdivisionAuditEntry[];
}

export interface SharedPlotCoOwner {
  heirKey: string;
  personName: string;
  roleTitleSomali: string;
  shareFractionOfPlot: number; // e.g. 0.5 = 50% of this single plot
  sharePercentageOfPlot: number; // 0..100
  areaSqM: number;
}

export interface PlotAssignmentRecord {
  plotId: string;
  blockId: string;
  zoneId: string;
  zoneLabelSomali: string;
  tier: AssetQualityTier;
  tierLabelSomali: string;
  wadiStatus: WadiStatus;
  wadiLabelSomali: string;
  siteQuality: SiteQualityRating;
  siteQualityLabelSomali: string;
  areaSqM: number;              // GIS calculated area (432 m² full or 216 m² valid half plot)
  isHalfPlot?: boolean;
  plotUnitWeight?: number;      // 1.0 for full plot, 0.5 for valid Half Plot
  verifiedAreaSqM: number | null;
  verifiedPrice: number | null;
  estimatedTierPrice: number;
  widthM: number;
  depthM: number;
  lon: number;
  lat: number;
  assignmentType: 'sole_heir' | 'shared_fractional' | 'manual_override' | 'unassigned' | 'excluded';
  allocationLifecycleStatus: 'approved' | 'pending_proposal' | 'available' | 'excluded';
  /** Reason a plot was intentionally left unassigned (e.g., withheld jajab remainder or half-plot) */
  unassignedReason?: 'withheld_jajab' | 'withheld_half_plot' | 'no_heirs';
  /** True when excluded from inheritance division */
  isExcluded?: boolean;
  excludedScope?: 'block' | 'plot';
  excludedSpecialName?: string;
  /** Present when sole_heir or manual_override */
  ownerHeirKey?: string;
  ownerPersonName?: string;
  ownerRoleSomali?: string;
  ownerColorHex?: string;
  /** Present when shared_fractional */
  coOwners?: SharedPlotCoOwner[];
}

export interface ExcludedBlockSummary {
  blockId: string;
  specialName: string;
  zoneId: string;
  plotsCount: number;
  areaSqM: number;
  notes?: string;
}

export interface ExcludedPlotSummary {
  plotId: string;
  blockId: string;
  zoneId: string;
  specialName: string;
  excludedScope: 'block' | 'plot';
  areaSqM: number;
  notes?: string;
}

export interface HeirTierPlotBreakdown {
  tier: AssetQualityTier;
  tierLabelSomali: string;
  totalTierPlots: number;
  exactQuotaPlots: number;     // exact mathematical Sharia share in this tier
  assignedWholePlotIds: string[];
  sharedPlotSlices: {
    plotId: string;
    blockId: string;
    zoneId: string;
    fractionOfPlot: number;
    percentageOfPlot: number;
    areaSqM: number;
  }[];
  effectiveTotalPlots: number; // whole + sum(shared fractions)
  deviationFromQuota: number;  // effectiveTotalPlots - exactQuotaPlots
}

export interface HeirZonePlotBreakdown {
  zoneId: string;
  zoneLabelSomali: string;
  totalZonePlots: number;
  exactZoneQuotaPlots: number;
  assignedWholePlotIds: string[];
  assignedBlockIdsInZone: string[];
  sharedPlotSlices: {
    plotId: string;
    blockId: string;
    fractionOfPlot: number;
    percentageOfPlot: number;
    areaSqM: number;
  }[];
  effectivePlotsInZone: number;
  /** Percentage of this Zone received by this heir (matches Sharia individualPercentage!) */
  zonePercentageReceived: number;
  deviationFromZoneQuota: number;
}

export interface IndividualHeirPlotAllocation {
  heirKey: string; // `${heirGroupId}::${personIndex}`
  heirGroupId: string;
  personIndex: number;
  personName: string;
  roleTitleSomali: string;
  roleTitleArabic: string;
  quranicFractionGroup: string;
  individualPercentage: number;
  colorHex: string;

  /** Exact total plot entitlement across all tiers & zones */
  exactTotalPlotsQuota: number;
  /** Total whole plots exclusively assigned to this person */
  totalWholePlotsAssigned: number;
  /** Effective plots including fractional co-owned slices */
  effectiveTotalPlotsReceived: number;
  /** GIS calculated area (m²) */
  totalAreaSqM: number;
  /** Sum of verified plot areas if all/any assigned plots have verifiedAreaSqM */
  verifiedAreaTotalSqM: number | null;
  verifiedAreaPlotCount: number;
  /** Sum of verified plot prices (strictly separated from estimated tier prices) */
  verifiedValueTotalUSD: number | null;
  verifiedValuePlotCount: number;
  exactVerifiedValueEntitlementUSD: number | null;
  /** Estimated value from tier unit prices (when tier prices > 0) */
  totalEstimatedValueUSD: number;

  /** Unique Block IDs where this heir holds plots */
  assignedBlockIds: string[];
  /** Orthogonal adjacent block pairs held by this heir (empty = 100% dispersed!) */
  adjacentBlockPairs: [string, string][];
  /** All exclusive Plot IDs across all tiers */
  allWholePlotIds: string[];
  /** Compact summary string of plots, zones & blocks */
  compactSummarySomali: string;

  /** Breakdown by Quality Tier */
  byTier: {
    tier_1_prime: HeirTierPlotBreakdown;
    tier_2_standard: HeirTierPlotBreakdown;
    tier_3_basic: HeirTierPlotBreakdown;
  };

  /** Breakdown by Spatial Zone (Zone A, Zone B, Zone C, Zone D...) */
  byZone: Record<string, HeirZonePlotBreakdown>;

  /** Breakdown by Wadi & Site Quality for Per-Heir Report (Section 9) */
  wadiBreakdown: Record<WadiStatus, number>;
  siteQualityBreakdown: Record<SiteQualityRating, number>;
  unverifiedMetadataPlotCount: number;
  heirWarnings: string[];
}

export interface ZoneOverviewSummary {
  zoneId: string;
  zoneLabelSomali: string;
  colorHex: string;
  totalPlots: number;
  blockIds: string[];
}

export interface FairLandAllocationResult {
  /** Number of divisible full plots included in inheritance division */
  totalFullPlots: number;
  /** Total full plots inside boundary on map (divisible + excluded) */
  totalAllFullPlotsOnMap?: number;
  /** Count of full plots excluded from inheritance division */
  excludedPlotsCount?: number;
  /** Count of blocks marked as excluded from inheritance division */
  excludedBlocksCount?: number;
  /** Detailed list of excluded blocks */
  excludedBlocks?: ExcludedBlockSummary[];
  /** Detailed list of excluded plots */
  excludedPlots?: ExcludedPlotSummary[];
  includeValidHalfPlots?: boolean;
  validHalfPlotsIncludedCount?: number;
  effectivePoolPlotUnits?: number;
  /** Count of full plots actually distributed to heirs */
  allocatedFullPlotsCount?: number;
  /** Count of full plots withheld to avoid fractional/shared remainders (Jajabka laga reebay) */
  withheldJajabPlotsCount?: number;
  /** IDs of full plots withheld as Jajab remainders */
  withheldJajabPlotIds?: string[];
  /** Count of half/partial plots excluded from inheritance division */
  withheldHalfPlotsCount?: number;
  plotWidthM: number;
  plotDepthM: number;
  plotAreaSqM: number;
  allocationMode: LandAllocationMode;
  approvalStatus: AllocationApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  tierCounts: {
    tier_1_prime: number;
    tier_2_standard: number;
    tier_3_basic: number;
  };
  zones: ZoneOverviewSummary[];
  totalVerifiedValuePoolUSD: number | null;
  verifiedPricedPlotsCount: number;
  plotAssignments: Record<string, PlotAssignmentRecord>;
  sharedPlots: PlotAssignmentRecord[];
  heirAllocations: IndividualHeirPlotAllocation[];
  /** Fairness verification across Tiers, Zones, Verified Value, and Non-Adjacent Blocks */
  isFairAcrossAllTiers: boolean;
  isFairAcrossAllZones: boolean;
  hasZeroAdjacentBlockViolations: boolean;
  fairnessWarnings: string[];
  dataCompletenessWarnings: string[];
  fairnessSummarySomali: string;
}

