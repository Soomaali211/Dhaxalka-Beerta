import { HeirsInput, SavedInheritanceCase } from '../types/inheritance';
import {
  GeneratedBlock,
  GeneratedPlot,
  LandSubdivisionState,
  SubdivisionComputationResult,
} from '../types/landSubdivision';

export interface UnifiedFarmMetrics {
  hasMap: boolean;
  /** Bedka Xuduudka Beerta (m²) — entire farm polygon including 15m roads & margins */
  boundaryAreaSqM: number;
  /** Bedka Xuduudka Beerta (ha) */
  boundaryAreaHa: number;
  /** Non-synthetic blocks count */
  blocksCount: number;
  /** Plots Buuxa (18×24m = 432 m² nominal) */
  fullPlotsCount: number;
  /** Plots Nus ah / Half Plots (18×12m or 9×24m = 216 m² nominal) — never falsely 0 when present */
  halfPlotsCount: number;
  /** Whether verified Half Plots are included in inheritance division ("Ku jira" vs "Laga reebay") */
  halfPlotsIncluded: boolean;
  /** Wadarta Bedka Plots-ka (m²) — exact sum of Full Plots + Half Plots inside boundary */
  allPlotsAreaSqM: number;
  /** Bedka Plots-ka Dhaxalka (m²) — area of non-excluded plots participating in inheritance */
  divisiblePlotsAreaSqM: number;
  /** Count of full plots excluded from division */
  excludedPlotsCount: number;
  /** Count of boundary-clipped irregular fragments excluded as non-standard */
  clippedPlotsCount: number;
  /** Standard full plot area (default 432 m²) */
  standardPlotAreaSqM: number;
}

function isSyntheticBlock(b: GeneratedBlock): boolean {
  return b.id === '__IMPORTED_PLOTS__' || Boolean(b.preservedProps?.__syntheticContainer);
}

function isHalfPlotFeature(p: GeneratedPlot): boolean {
  const rawNooca = String(
    p.preservedProps?.nooca ?? p.preservedProps?.type ?? p.preservedProps?.plot_type ?? ''
  )
    .trim()
    .toLowerCase();
  if (rawNooca === 'half' || rawNooca === 'half_plot' || rawNooca === 'nus') {
    return true;
  }
  if (!p.full && p.htmlStatus === 'partial') {
    return true;
  }
  return false;
}

/**
 * Single-Source-of-Truth farm & plot metrics (Fixes Audit E10 & E11).
 * Reconciles Boundary Area (e.g. 95,700 m² / 9.57 ha), Total Plots Area (e.g. 53,352 m²),
 * Divisible Plots Area (e.g. 50,976 m² when half plots are excluded), and Half Plots Count (e.g. 11 Half).
 */
export function computeUnifiedFarmMetrics(
  subdivisionState: LandSubdivisionState | null | undefined,
  subdivisionResult: SubdivisionComputationResult | null | undefined,
  hasMapOverride?: boolean
): UnifiedFarmMetrics {
  const nashqad = subdivisionState?.nashqadSummary ?? null;
  const standardPlotAreaSqM = Math.round(
    (subdivisionState?.params?.pw || 18) * (subdivisionState?.params?.pd || 24)
  ) || 432;
  const nominalHalfAreaSqM = Math.round(standardPlotAreaSqM / 2);

  const hasMap =
    hasMapOverride !== undefined
      ? hasMapOverride
      : Boolean(
          subdivisionResult &&
            (subdivisionResult.bring.length >= 3 ||
              subdivisionResult.plots.length > 0 ||
              (subdivisionResult.allEvaluatedPlots?.length || 0) > 0)
        );

  if (!hasMap || (!subdivisionResult && !nashqad)) {
    return {
      hasMap: false,
      boundaryAreaSqM: 0,
      boundaryAreaHa: 0,
      blocksCount: 0,
      fullPlotsCount: 0,
      halfPlotsCount: 0,
      halfPlotsIncluded: Boolean(subdivisionState?.includeValidHalfPlotsInAllocation),
      allPlotsAreaSqM: 0,
      divisiblePlotsAreaSqM: 0,
      excludedPlotsCount: 0,
      clippedPlotsCount: 0,
      standardPlotAreaSqM,
    };
  }

  const realBlocks = subdivisionResult
    ? subdivisionResult.blocks.filter((b) => !isSyntheticBlock(b))
    : [];
  const blocksCount =
    realBlocks.length > 0 ? realBlocks.length : nashqad?.blocksCount ?? 0;

  const fullPlotsCount = subdivisionResult
    ? subdivisionResult.plots.length
    : nashqad?.fullPlotsCount ?? 0;

  // Unify Half-Plots count across all 4 engines/sources so it never drops to 0 when half plots exist
  const htmlCountedHalves = subdivisionResult?.htmlHalvesCounted?.length ?? 0;
  const validatedHalves = subdivisionResult?.halfPlotSummary?.validHalfPlotsCount ?? 0;
  const validHalfPlotsArr = subdivisionResult?.validHalfPlots?.length ?? 0;
  const prebuiltEvaluatedHalves = subdivisionResult?.allEvaluatedPlots
    ? subdivisionResult.allEvaluatedPlots.filter(
        (p) => !p.full && isHalfPlotFeature(p)
      ).length
    : 0;
  const nashqadHalves = nashqad?.halfPlotsCount ?? 0;

  const halfPlotsCount = Math.max(
    htmlCountedHalves,
    validatedHalves,
    validHalfPlotsArr,
    prebuiltEvaluatedHalves,
    nashqadHalves
  );

  const rawBoundaryArea =
    (subdivisionResult?.barea && subdivisionResult.barea > 0
      ? subdivisionResult.barea
      : nashqad?.boundaryAreaSqM) || 0;
  const boundaryAreaSqM = Math.round(rawBoundaryArea);
  const boundaryAreaHa = Number((boundaryAreaSqM / 10000).toFixed(2));

  // Compute exact full-plots area
  let fullPlotsAreaSqM = 0;
  let excludedFullPlotsAreaSqM = 0;
  let excludedPlotsCount = 0;

  if (subdivisionResult && subdivisionResult.plots.length > 0) {
    for (const p of subdivisionResult.plots) {
      const pArea =
        p.calculatedAreaSqM && p.calculatedAreaSqM > 0
          ? p.calculatedAreaSqM
          : standardPlotAreaSqM;
      fullPlotsAreaSqM += pArea;

      const blockExcluded = Boolean(
        subdivisionState?.blockMetadata?.[p.block]?.isExcludedFromDivision
      );
      const plotExcluded = Boolean(
        subdivisionState?.plotMetadata?.[p.id]?.isExcludedFromDivision
      );
      if (blockExcluded || plotExcluded) {
        excludedPlotsCount += 1;
        excludedFullPlotsAreaSqM += pArea;
      }
    }
  } else {
    fullPlotsAreaSqM = fullPlotsCount * standardPlotAreaSqM;
  }

  // Compute half-plots area
  let halfPlotsAreaSqM = 0;
  if (subdivisionResult?.htmlHalvesCounted && subdivisionResult.htmlHalvesCounted.length > 0) {
    halfPlotsAreaSqM = subdivisionResult.htmlHalvesCounted.reduce(
      (acc, h) => acc + (h.area > 0 ? h.area : nominalHalfAreaSqM),
      0
    );
  } else if (subdivisionResult?.allEvaluatedPlots && prebuiltEvaluatedHalves > 0) {
    halfPlotsAreaSqM = subdivisionResult.allEvaluatedPlots
      .filter((p) => !p.full && isHalfPlotFeature(p))
      .reduce(
        (acc, p) =>
          acc +
          (p.calculatedAreaSqM && p.calculatedAreaSqM > 0
            ? p.calculatedAreaSqM
            : nominalHalfAreaSqM),
        0
      );
  } else if (halfPlotsCount > 0) {
    halfPlotsAreaSqM = halfPlotsCount * nominalHalfAreaSqM;
  }

  const computedAllPlotsArea = Math.round(fullPlotsAreaSqM + halfPlotsAreaSqM);
  const allPlotsAreaSqM =
    nashqad?.totalPlotsAreaSqM && nashqad.totalPlotsAreaSqM >= computedAllPlotsArea
      ? Math.round(nashqad.totalPlotsAreaSqM)
      : computedAllPlotsArea;

  const halfPlotsIncluded = Boolean(subdivisionState?.includeValidHalfPlotsInAllocation);
  const divisiblePlotsAreaSqM = Math.max(
    0,
    Math.round(
      fullPlotsAreaSqM -
        excludedFullPlotsAreaSqM +
        (halfPlotsIncluded ? halfPlotsAreaSqM : 0)
    )
  );

  const clippedPlotsCount =
    subdivisionResult?.halfPlotSummary?.boundaryClippedPlotsCount ?? 0;

  return {
    hasMap: true,
    boundaryAreaSqM,
    boundaryAreaHa,
    blocksCount,
    fullPlotsCount,
    halfPlotsCount,
    halfPlotsIncluded,
    allPlotsAreaSqM,
    divisiblePlotsAreaSqM,
    excludedPlotsCount,
    clippedPlotsCount,
    standardPlotAreaSqM,
  };
}

/**
 * Extracts consistent unified farm metrics from a SavedInheritanceCase snapshot (for Xogta / Case Cards & Details).
 */
export function computeSavedCaseUnifiedMetrics(
  savedCase: SavedInheritanceCase,
  fallbackLiveMetrics?: UnifiedFarmMetrics | null
): UnifiedFarmMetrics {
  if (!savedCase.hasMapGeometry) {
    return {
      hasMap: false,
      boundaryAreaSqM: 0,
      boundaryAreaHa: 0,
      blocksCount: 0,
      fullPlotsCount: 0,
      halfPlotsCount: 0,
      halfPlotsIncluded: false,
      allPlotsAreaSqM: 0,
      divisiblePlotsAreaSqM: 0,
      excludedPlotsCount: 0,
      clippedPlotsCount: 0,
      standardPlotAreaSqM: 432,
    };
  }

  const snap = (savedCase.landSubdivisionSnapshot ?? null) as Partial<LandSubdivisionState> | null;
  const nashqad = snap?.nashqadSummary ?? null;
  const pw = snap?.params?.pw || 18;
  const pd = snap?.params?.pd || 24;
  const standardPlotAreaSqM = Math.round(pw * pd) || 432;
  const nominalHalfAreaSqM = Math.round(standardPlotAreaSqM / 2);

  const blocksCount =
    savedCase.blocksCount ?? nashqad?.blocksCount ?? fallbackLiveMetrics?.blocksCount ?? 0;
  const fullPlotsCount =
    savedCase.fullPlotsCount ??
    nashqad?.fullPlotsCount ??
    fallbackLiveMetrics?.fullPlotsCount ??
    0;
  const halfPlotsCount = Math.max(
    savedCase.validHalfPlotsCount ?? 0,
    nashqad?.halfPlotsCount ?? 0,
    fallbackLiveMetrics?.halfPlotsCount ?? 0
  );

  const boundaryAreaSqM = Math.round(
    nashqad?.boundaryAreaSqM || fallbackLiveMetrics?.boundaryAreaSqM || 0
  );
  const boundaryAreaHa = Number((boundaryAreaSqM / 10000).toFixed(2));

  const computedPlotsArea =
    fullPlotsCount * standardPlotAreaSqM + halfPlotsCount * nominalHalfAreaSqM;
  const allPlotsAreaSqM = Math.round(
    nashqad?.totalPlotsAreaSqM && nashqad.totalPlotsAreaSqM >= computedPlotsArea
      ? nashqad.totalPlotsAreaSqM
      : computedPlotsArea
  );

  const halfPlotsIncluded = Boolean(snap?.includeValidHalfPlotsInAllocation);
  const divisiblePlotsAreaSqM = Math.round(
    fullPlotsCount * standardPlotAreaSqM +
      (halfPlotsIncluded ? halfPlotsCount * nominalHalfAreaSqM : 0)
  );

  return {
    hasMap: true,
    boundaryAreaSqM,
    boundaryAreaHa,
    blocksCount,
    fullPlotsCount,
    halfPlotsCount,
    halfPlotsIncluded,
    allPlotsAreaSqM,
    divisiblePlotsAreaSqM,
    excludedPlotsCount: 0,
    clippedPlotsCount: savedCase.clippedPlotsCount ?? 0,
    standardPlotAreaSqM,
  };
}

/**
 * Counts total entered heirs across all Shafi'i Faraa'id categories (Fixes Audit E13).
 * Respects deceasedGender (ignores husbandAlive when male; ignores wivesCount when female).
 */
export function countEnteredHeirs(heirs: HeirsInput | null | undefined): number {
  if (!heirs) return 0;

  const spouseCount =
    heirs.deceasedGender === 'male'
      ? Math.max(0, heirs.wivesCount || 0)
      : heirs.husbandAlive
      ? 1
      : 0;

  const ascendantsCount =
    (heirs.fatherAlive ? 1 : 0) +
    (heirs.motherAlive ? 1 : 0) +
    (heirs.paternalGrandfatherAlive ? 1 : 0) +
    (heirs.paternalGrandmotherAlive ? 1 : 0) +
    (heirs.maternalGrandmotherAlive ? 1 : 0);

  const descendantsCount =
    Math.max(0, heirs.sonsCount || 0) +
    Math.max(0, heirs.daughtersCount || 0) +
    Math.max(0, heirs.grandsonsCount || 0) +
    Math.max(0, heirs.granddaughtersCount || 0);

  const siblingsCount =
    Math.max(0, heirs.fullBrothersCount || 0) +
    Math.max(0, heirs.fullSistersCount || 0) +
    Math.max(0, heirs.paternalBrothersCount || 0) +
    Math.max(0, heirs.paternalSistersCount || 0) +
    Math.max(0, heirs.maternalBrothersCount || 0) +
    Math.max(0, heirs.maternalSistersCount || 0);

  const collateralsCount =
    Math.max(0, heirs.fullNephewsCount || 0) +
    Math.max(0, heirs.paternalNephewsCount || 0) +
    Math.max(0, heirs.fullPaternalUnclesCount || 0) +
    Math.max(0, heirs.paternalPaternalUnclesCount || 0) +
    Math.max(0, heirs.fullCousinsCount || 0) +
    Math.max(0, heirs.paternalCousinsCount || 0);

  return (
    spouseCount +
    ascendantsCount +
    descendantsCount +
    siblingsCount +
    collateralsCount
  );
}
