import {
  GeneratedPlot,
  LandSubdivisionState,
  PlotDetailedMetadata,
  SiteQualityRating,
  SubdivisionComputationResult,
  WadiStatus,
} from '../types/landSubdivision';
import {
  createAuditEntry,
  getDistinctHeirColor,
} from './landSubdivisionEngine';

export interface PdfPositionedTextToken {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfExtractedAssignmentDraft {
  rowId: string;
  rawPlotLabel: string;
  matchedPlotId: string | null;
  assigneeType: 'heir' | 'excluded_custom';
  matchedHeirKey: string;
  assigneeName: string;
  colorHex: string;
  confidencePct: number;
  needsReview: boolean;
  sourceMethod: 'vector_text' | 'vector_spatial' | 'ai_vision' | 'manual_added';
  noteSomali: string;
}

export interface PdfImportHeirOption {
  heirKey: string;
  personName: string;
  roleTitleSomali: string;
  colorHex: string;
}

const EXCLUDED_KEYWORDS_RE =
  /\b(danguud|dan guud|waddo|jidad|masaajid|masjid|reeban|laga reebay|goob guud|ceel|dugsi|madrasa)\b/i;

const SPECIAL_COLOR_PALETTE = [
  '#94A3B8',
  '#F43F5E',
  '#F97316',
  '#EAB308',
  '#8B5CF6',
  '#14B8A6',
];

function normalizeAlphaNumKey(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeNameWords(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves any PDF / OCR Plot string (e.g. `R01-C01-P03`, `R1-C1-P3`, `B2-P4`, `B2 P4`, `P07`, `Plot #7`)
 * to the exact `GeneratedPlot.id` inside CAD Studio, optionally scoped by `blockContextHint`.
 */
export function matchPlotTokenToCadPlotId(
  rawToken: string,
  cadPlots: GeneratedPlot[],
  blockContextHint?: string | null
): { plotId: string | null; exact: boolean } {
  const clean = rawToken.trim();
  if (!clean || cadPlots.length === 0) return { plotId: null, exact: false };

  const upperClean = clean.toUpperCase().replace(/\s+/g, '');

  // 1. Exact case-insensitive ID match
  for (const p of cadPlots) {
    if (p.id.toUpperCase() === upperClean) {
      return { plotId: p.id, exact: true };
    }
  }

  // 2. Normalized zero-padded pattern match: R01-C02-P03 vs R1-C2-P3 or B01-P05 vs B1-P5 or B1 P5
  const stripZeros = (v: string) =>
    normalizeAlphaNumKey(v).replace(/([A-Z])0+(\d+)/g, '$1$2');
  const normTarget = stripZeros(clean);
  for (const p of cadPlots) {
    if (stripZeros(p.id) === normTarget) {
      return { plotId: p.id, exact: true };
    }
  }

  // 2B. If block context hint is active (e.g. block heading "R1-C2" or "B1") and token is a short plot ref ("P03", "Plot 3", "3")
  const shortPlotNum = /^(?:PLOT|PLT|P|#|-)*0*(\d{1,3})(?:[-_]?H([12]))?$/i.exec(upperClean);
  if (blockContextHint && shortPlotNum) {
    const num = Number(shortPlotNum[1]);
    const halfTag = shortPlotNum[2] ? `H${shortPlotNum[2]}` : '';
    const normBlockHint = stripZeros(blockContextHint);
    const inBlock = cadPlots.filter((p) => stripZeros(p.block) === normBlockHint);
    const scoped = inBlock.find((p) => {
      if (halfTag) return stripZeros(p.id).endsWith(`P${num}${halfTag}`);
      return p.no === num || stripZeros(p.id).endsWith(`P${num}`);
    });
    if (scoped) {
      return { plotId: scoped.id, exact: true };
    }
  }

  // 3. Suffix half-plot or plot match
  const partialMatches = cadPlots.filter((p) => {
    const pKey = stripZeros(p.id);
    return pKey.endsWith(normTarget) && normTarget.length >= 2;
  });
  if (partialMatches.length === 1) {
    return { plotId: partialMatches[0].id, exact: false };
  }

  // 4. Plain plot number (`Plot 12`, `#12`, `P-12`, `P12`) only when unambiguous across all blocks
  const numMatch = /^(?:PLOT|PLT|P|#|-)*0*(\d{1,4})$/i.exec(upperClean);
  if (numMatch) {
    const n = Number(numMatch[1]);
    const byPlotNo = cadPlots.filter((p) => p.no === n);
    if (byPlotNo.length === 1) {
      return { plotId: byPlotNo[0].id, exact: false };
    }
  }

  return { plotId: null, exact: false };
}

/**
 * Resolves an heir or special non-inheritance label (`Danguud`, `Waddo`, `Axmed`, etc.)
 * cleanly against active heirs.
 */
export function matchAssigneeNameToHeirOrSpecial(
  rawName: string,
  heirs: PdfImportHeirOption[],
  isExcludedHint = false
): {
  assigneeType: 'heir' | 'excluded_custom';
  matchedHeirKey: string;
  assigneeName: string;
  colorHex: string;
  matchedCleanly: boolean;
} {
  const cleaned = rawName.trim();
  if (!cleaned) {
    return {
      assigneeType: heirs.length > 0 ? 'heir' : 'excluded_custom',
      matchedHeirKey: heirs[0]?.heirKey || '',
      assigneeName: heirs[0]?.personName || '',
      colorHex: heirs[0]?.colorHex || '#94A3B8',
      matchedCleanly: false,
    };
  }

  if (isExcludedHint || EXCLUDED_KEYWORDS_RE.test(cleaned)) {
    const label = /danguud|dan guud/i.test(cleaned) ? 'Danguud' : cleaned;
    return {
      assigneeType: 'excluded_custom',
      matchedHeirKey: '',
      assigneeName: label,
      colorHex: '#F43F5E',
      matchedCleanly: true,
    };
  }

  const targetNorm = normalizeNameWords(cleaned);
  if (!targetNorm) {
    return {
      assigneeType: 'excluded_custom',
      matchedHeirKey: '',
      assigneeName: cleaned,
      colorHex: '#94A3B8',
      matchedCleanly: false,
    };
  }

  // Exact normalized full-name match
  for (const h of heirs) {
    if (normalizeNameWords(h.personName) === targetNorm) {
      return {
        assigneeType: 'heir',
        matchedHeirKey: h.heirKey,
        assigneeName: h.personName,
        colorHex: h.colorHex,
        matchedCleanly: true,
      };
    }
  }

  // Role title or unique first-name / prefix match
  const targetTokens = targetNorm.split(' ').filter((w) => w.length >= 2);
  const scored = heirs
    .map((h) => {
      const hNameNorm = normalizeNameWords(h.personName);
      const hRoleNorm = normalizeNameWords(h.roleTitleSomali);
      let score = 0;
      if (hNameNorm.includes(targetNorm) || targetNorm.includes(hNameNorm)) {
        score += 4;
      }
      if (hRoleNorm && (hRoleNorm === targetNorm || hRoleNorm.includes(targetNorm))) {
        score += 2;
      }
      const hWords = hNameNorm.split(' ');
      for (const tw of targetTokens) {
        if (hWords.includes(tw)) score += 2;
        else if (hWords.some((hw) => hw.startsWith(tw) && tw.length >= 3)) score += 1;
      }
      return { heir: h, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0 && (scored.length === 1 || scored[0].score > scored[1].score)) {
    const best = scored[0].heir;
    return {
      assigneeType: 'heir',
      matchedHeirKey: best.heirKey,
      assigneeName: best.personName,
      colorHex: best.colorHex,
      matchedCleanly: scored[0].score >= 2,
    };
  }

  // Unrecognized name -> custom/unlinked label marked needsReview in caller
  return {
    assigneeType: 'excluded_custom',
    matchedHeirKey: '',
    assigneeName: cleaned,
    colorHex: SPECIAL_COLOR_PALETTE[0],
    matchedCleanly: false,
  };
}

const PLOT_ID_SCAN_REGEX =
  /\b(R\d{1,3}[-_\s]?C\d{1,3}[-_\s]?P\d{1,3}(?:[-_\s]?H[12])?|B\d{1,3}[-_\s]?P\d{1,3}(?:[-_\s]?H[12])?|PLOT\s*#?\s*\d{1,3}|P[-_]?\d{1,3})\b/gi;

const BLOCK_HEADING_REGEX = /\b(?:BLOCK|BLK)\s*[:#-]?\s*(R\d{1,3}[-_]C\d{1,3}|B\d{1,3})\b/i;

function cleanStrippedAssigneeText(raw: string): string {
  return raw
    .replace(/[\t|,;:→\-–—=()\[\]#•·]+/g, ' ')
    .replace(
      /\b(plot|plots|block|blk|heer|heerka|h1|h2|h3|ha|m2|m²|qty|la siiyay|saami|exact|wadarta|qaybo|isku xidhan|dooxa|m)\b/gi,
      ' '
    )
    .replace(/\b\d+(?:\.\d+)?%?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitCellWithMultiplePlotMatches(
  cell: string,
  matches: RegExpMatchArray[]
): Array<{ plotToken: string; localLabel: string }> {
  if (matches.length <= 1) {
    const tok = matches[0]?.[1] || '';
    const stripped = cleanStrippedAssigneeText(cell.replace(tok, ' '));
    return [{ plotToken: tok, localLabel: stripped }];
  }

  // Check gaps between consecutive Plot IDs: if ONLY delimiters/whitespace sit between plots, it's ONE grouped list
  let allGrouped = true;
  for (let i = 0; i < matches.length - 1; i++) {
    const endIdx = (matches[i].index || 0) + matches[i][0].length;
    const nextIdx = matches[i + 1].index || 0;
    const between = cell.slice(endIdx, nextIdx).replace(/[\s,;&/+-]+/g, '');
    if (between.length > 0) {
      allGrouped = false;
      break;
    }
  }

  if (allGrouped) {
    let stripped = cell;
    for (const m of matches) {
      stripped = stripped.replace(m[0], ' ');
    }
    const label = cleanStrippedAssigneeText(stripped);
    return matches.map((m) => ({ plotToken: m[1].replace(/\s+/g, '-'), localLabel: label }));
  }

  // Otherwise each plot has adjacent name/text nearby: slice nearest non-overlapping window per plot
  return matches.map((m, idx) => {
    const start = m.index || 0;
    const end = start + m[0].length;
    const prevEnd = idx > 0 ? (matches[idx - 1].index || 0) + matches[idx - 1][0].length : 0;
    const nextStart =
      idx + 1 < matches.length ? (matches[idx + 1].index ?? cell.length) : cell.length;

    const rightText = cleanStrippedAssigneeText(cell.slice(end, nextStart));
    const leftText = cleanStrippedAssigneeText(cell.slice(prevEnd, start));
    const localLabel = rightText.length >= 2 ? rightText : leftText;
    return { plotToken: m[1].replace(/\s+/g, '-'), localLabel };
  });
}

/**
 * Deterministic Vector PDF & Table Text Parser:
 * Supports:
 * 1) Grouped Heir lines: `Axmed Cali: B1-P1, B1-P2, B1-P3` or `Danguud -> R01-C01-P05`
 * 2) Per-Plot table lines & multi-column rows: `R01-C01-P01 | Faadumo Xasan` or `R01-C01-P01 Axmed  |  R01-C01-P02 Faadumo`
 * 3) Section/Page Heir headings (e.g. `Dhaxale: Axmed Cali` followed by `Heer 1: R1-C1-P01, R1-C1-P02`)
 * 4) Spatial Vector Map tokens (`PdfPositionedTextToken[]`): matches Plot ID tokens near Heir Name tokens on the PDF canvas!
 */
export function parseVectorPdfTokensToDrafts(
  plainText: string,
  positionedTokens: PdfPositionedTextToken[],
  cadPlots: GeneratedPlot[],
  heirs: PdfImportHeirOption[]
): PdfExtractedAssignmentDraft[] {
  const byMatchedPlot = new Map<string, PdfExtractedAssignmentDraft>();
  const rowCounterStart = { n: 1 };

  const upsertRow = (
    rawPlotLabel: string,
    rawAssignee: string,
    sourceMethod: PdfExtractedAssignmentDraft['sourceMethod'],
    baseConfidence: number,
    blockContextHint?: string | null,
    noteSomali = ''
  ) => {
    const plotMatch = matchPlotTokenToCadPlotId(rawPlotLabel, cadPlots, blockContextHint);
    const assigneeMatch = matchAssigneeNameToHeirOrSpecial(rawAssignee, heirs);
    const needsReview = !plotMatch.plotId || !assigneeMatch.matchedCleanly;
    const confidencePct = Math.min(
      100,
      Math.max(
        35,
        baseConfidence - (plotMatch.exact ? 0 : 12) - (assigneeMatch.matchedCleanly ? 0 : 18)
      )
    );
    const key = plotMatch.plotId || `RAW::${rawPlotLabel.toUpperCase()}::${rowCounterStart.n}`;
    const existing = byMatchedPlot.get(key);
    if (existing) {
      // Do not overwrite an already cleanly matched row with a weaker spatial or partial guess
      if (sourceMethod === 'vector_spatial' && !existing.needsReview) {
        return;
      }
      if (!existing.needsReview && needsReview) {
        return;
      }
      if (existing.confidencePct >= confidencePct && !existing.needsReview) {
        return;
      }
    }
    byMatchedPlot.set(key, {
      rowId: `pdf-row-${rowCounterStart.n++}`,
      rawPlotLabel,
      matchedPlotId: plotMatch.plotId,
      assigneeType: assigneeMatch.assigneeType,
      matchedHeirKey: assigneeMatch.matchedHeirKey,
      assigneeName: assigneeMatch.assigneeName,
      colorHex: assigneeMatch.colorHex,
      confidencePct,
      needsReview,
      sourceMethod,
      noteSomali:
        noteSomali ||
        (!plotMatch.plotId
          ? 'Plot ID lama mid aha plots-ka CAD Studio — gacanta ka dooro.'
          : !assigneeMatch.matchedCleanly
          ? 'Magacan toos looguma xidhin liiska dhaxlayaasha — hubi.'
          : ''),
    });
  };

  // Pass 1: Line-by-line, multi-column cell parsing + Section Heir & Block heading tracking
  const lines = plainText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let activeSectionAssignee: string | null = null;
  let activeBlockHint: string | null = null;

  for (const line of lines) {
    // Track Block headings like "Block R1-C1" or "Block B2"
    const blkMatch = line.match(BLOCK_HEADING_REGEX);
    if (blkMatch) {
      activeBlockHint = blkMatch[1].replace(/_/g, '-').toUpperCase();
    }

    // Split on pipe / tabs / wide 4+ spaces ONLY if line represents multi-column cells where multiple cells contain plots
    const rawCells = line
      .split(/\t|\s+\|\s+|\s{4,}/)
      .map((c) => c.trim())
      .filter(Boolean);
    const cellsWithPlots = rawCells.filter((c) => {
      PLOT_ID_SCAN_REGEX.lastIndex = 0;
      return PLOT_ID_SCAN_REGEX.test(c);
    });

    // If only 1 (or 0) cells contain Plot IDs, keep the whole line intact so `R1-C1-P01 | Axmed Cali` stays paired!
    const segments = cellsWithPlots.length >= 2 ? rawCells : [line];

    let lineHadPlots = false;
    for (const seg of segments) {
      PLOT_ID_SCAN_REGEX.lastIndex = 0;
      const matches = Array.from(seg.matchAll(PLOT_ID_SCAN_REGEX));
      if (matches.length === 0) continue;
      lineHadPlots = true;

      const pairs = splitCellWithMultiplePlotMatches(seg, matches);
      for (const pair of pairs) {
        const candidateAssignee =
          pair.localLabel.length >= 2 && !/^\d+$/.test(pair.localLabel)
            ? pair.localLabel
            : activeSectionAssignee || '';

        if (candidateAssignee.length >= 2 && !/^\d+$/.test(candidateAssignee)) {
          upsertRow(
            pair.plotToken,
            candidateAssignee,
            'vector_text',
            pair.localLabel.length >= 2 ? 96 : 90,
            activeBlockHint
          );
        }
      }
    }

    // Check if a non-plot heading line identifies an Heir Section (e.g., "#1 Axmed Cali · Wiil" or "Dhaxale: Faadumo Xasan")
    if (!lineHadPlots) {
      if (/\b(legend|astaamaha|dhaxlayaasha|qaybinta dhaxalka)\b/i.test(line)) {
        // Legend / Master title resets per-heir page context so legend rows don't pollute later text
        activeSectionAssignee = null;
        continue;
      }

      const cleanedLineHeading = cleanStrippedAssigneeText(
        line.replace(/\b(dhaxale|dhaxalaha|heir|dhulka)\b/gi, ' ')
      );
      if (cleanedLineHeading.length >= 3 && !/^\d+$/.test(cleanedLineHeading)) {
        const probe = matchAssigneeNameToHeirOrSpecial(cleanedLineHeading, heirs);
        if (probe.matchedCleanly) {
          activeSectionAssignee = probe.assigneeName;
        }
      }
    }
  }

  // Pass 2: Spatial Vector Map proximity pairing (Plot ID token near an Heir Name token on PDF page)
  if (positionedTokens.length > 0 && (heirs.length > 0 || EXCLUDED_KEYWORDS_RE.test(plainText))) {
    const plotTokens: { token: PdfPositionedTextToken; plotLabel: string }[] = [];
    const nameTokens: { token: PdfPositionedTextToken; label: string }[] = [];

    for (const tk of positionedTokens) {
      const txt = tk.text.trim();
      if (!txt) continue;
      PLOT_ID_SCAN_REGEX.lastIndex = 0;
      const plotMatch = txt.match(PLOT_ID_SCAN_REGEX);
      if (plotMatch && plotMatch.length > 0) {
        plotMatch.forEach((lbl) =>
          plotTokens.push({ token: tk, plotLabel: lbl.replace(/\s+/g, '-') })
        );
        continue;
      }
      if (
        EXCLUDED_KEYWORDS_RE.test(txt) ||
        heirs.some((h) => {
          const nw = normalizeNameWords(txt);
          const hn = normalizeNameWords(h.personName);
          return nw.length >= 3 && (hn.includes(nw) || nw.includes(hn.split(' ')[0] || '___'));
        })
      ) {
        nameTokens.push({ token: tk, label: txt });
      }
    }

    for (const pt of plotTokens) {
      const px = pt.token.x + pt.token.width * 0.5;
      const py = pt.token.y + pt.token.height * 0.5;
      let bestName: { label: string; dist: number } | null = null;
      for (const nt of nameTokens) {
        const nx = nt.token.x + nt.token.width * 0.5;
        const ny = nt.token.y + nt.token.height * 0.5;
        const dist = Math.hypot(px - nx, py - ny);
        if (dist <= 105 && (!bestName || dist < bestName.dist)) {
          bestName = { label: nt.label, dist };
        }
      }
      if (bestName) {
        upsertRow(
          pt.plotLabel,
          bestName.label,
          'vector_spatial',
          bestName.dist < 42 ? 94 : 84,
          activeBlockHint
        );
      }
    }
  }

  return Array.from(byMatchedPlot.values());
}

/**
 * Generates a compact North->South, West->East CAD spatial summary so Gemini Vision can
 * match colored map polygons or unlabelled grid plots to exact CAD Studio Plot IDs.
 */
export function buildCadSpatialLayoutPromptSummary(
  cadPlots: GeneratedPlot[]
): string {
  if (cadPlots.length === 0) return '';

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  cadPlots.forEach((p) => {
    const [x, y] = p.centerUtm;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);

  const byBlock = new Map<string, GeneratedPlot[]>();
  cadPlots.forEach((p) => {
    const arr = byBlock.get(p.block) || [];
    arr.push(p);
    byBlock.set(p.block, arr);
  });

  const blockEntries = Array.from(byBlock.entries()).map(([blockId, pls]) => {
    const sorted = pls.slice().sort((a, b) => a.r - b.r || a.c - b.c || a.no - b.no);
    const avgX = sorted.reduce((s, p) => s + p.centerUtm[0], 0) / sorted.length;
    const avgY = sorted.reduce((s, p) => s + p.centerUtm[1], 0) / sorted.length;
    const xPct = Math.round(((avgX - minX) / spanX) * 100);
    const yTopPct = Math.round(((maxY - avgY) / spanY) * 100); // 0% = North/Top, 100% = South/Bottom
    const ids = sorted.map((p) => p.id);
    const rangeLabel =
      ids.length <= 4 ? ids.join(',') : `${ids[0]}..${ids[ids.length - 1]} (${ids.length} plot)`;
    return {
      blockId,
      xPct,
      yTopPct,
      line: `Block ${blockId} [Bidix->Bari=${xPct}%, Sare->Hoos=${yTopPct}%]: ${rangeLabel}`,
    };
  });

  blockEntries.sort((a, b) => a.yTopPct - b.yTopPct || a.xPct - b.xPct);
  return blockEntries.slice(0, 90).map((b) => b.line).join('\n');
}

/**
 * Assesses whether deterministic Vector PDF text parsing captured meaningful plot assignments
 * or if the Vector PDF is a visual/color-coded map needing AI Vision fallback.
 */
export function evaluateVectorExtractionCompleteness(
  drafts: PdfExtractedAssignmentDraft[],
  cadPlots: GeneratedPlot[]
): {
  cleanMatchedCount: number;
  shouldFallbackToAiVision: boolean;
} {
  const cleanMatchedCount = drafts.filter((d) => Boolean(d.matchedPlotId) && !d.needsReview).length;
  const anyMatchedCount = drafts.filter((d) => Boolean(d.matchedPlotId)).length;

  if (drafts.length === 0 || anyMatchedCount === 0) {
    return { cleanMatchedCount, shouldFallbackToAiVision: true };
  }

  // If farm has >= 8 plots and vector parser only accidentally grabbed 1-2 plots cleanly, treat as map needing AI Vision
  if (cadPlots.length >= 8 && cleanMatchedCount < 2 && anyMatchedCount < 3) {
    return { cleanMatchedCount, shouldFallbackToAiVision: true };
  }

  return { cleanMatchedCount, shouldFallbackToAiVision: false };
}

export function normalizeAiPdfAssignmentsToDrafts(
  aiAssignments: Array<{
    rawPlotLabel: string;
    normalizedPlotId?: string;
    assigneeName: string;
    isExcludedOrDanguud?: boolean;
    colorHexHint?: string;
    confidencePct?: number;
    needsReview?: boolean;
    noteSomali?: string;
  }>,
  cadPlots: GeneratedPlot[],
  heirs: PdfImportHeirOption[]
): PdfExtractedAssignmentDraft[] {
  const out: PdfExtractedAssignmentDraft[] = [];
  const seenPlotIds = new Set<string>();

  aiAssignments.forEach((item, idx) => {
    const candidateId =
      item.normalizedPlotId && item.normalizedPlotId.trim()
        ? item.normalizedPlotId.trim()
        : item.rawPlotLabel;
    const candMatch = matchPlotTokenToCadPlotId(candidateId, cadPlots);
    const plotMatch = candMatch.plotId
      ? candMatch
      : matchPlotTokenToCadPlotId(item.rawPlotLabel, cadPlots);

    if (plotMatch.plotId && seenPlotIds.has(plotMatch.plotId)) {
      return;
    }
    if (plotMatch.plotId) {
      seenPlotIds.add(plotMatch.plotId);
    }

    const assigneeMatch = matchAssigneeNameToHeirOrSpecial(
      item.assigneeName,
      heirs,
      Boolean(item.isExcludedOrDanguud)
    );
    const aiConf = Math.min(100, Math.max(20, Math.round(item.confidencePct ?? 85)));
    const needsReview =
      Boolean(item.needsReview) ||
      !plotMatch.plotId ||
      (!assigneeMatch.matchedCleanly && assigneeMatch.assigneeType !== 'excluded_custom') ||
      aiConf < 85;

    out.push({
      rowId: `ai-row-${idx + 1}`,
      rawPlotLabel: item.rawPlotLabel || candidateId,
      matchedPlotId: plotMatch.plotId,
      assigneeType: assigneeMatch.assigneeType,
      matchedHeirKey: assigneeMatch.matchedHeirKey,
      assigneeName: assigneeMatch.assigneeName || item.assigneeName,
      colorHex:
        assigneeMatch.assigneeType === 'excluded_custom' &&
        /^#[0-9a-f]{6}$/i.test(item.colorHexHint || '')
          ? (item.colorHexHint as string)
          : assigneeMatch.colorHex,
      confidencePct: aiConf,
      needsReview,
      sourceMethod: 'ai_vision',
      noteSomali:
        item.noteSomali ||
        (!plotMatch.plotId
          ? 'Plot ID si toos ah loogama helin CAD Studio — gacanta ka dooro.'
          : needsReview
          ? 'Fadlan hal mar hubi qoraalka/lambarka.'
          : ''),
    });
  });

  return out;
}

/**
 * Pure State Applier: Takes verified PDF/Scan assignment rows and commits them cleanly into
 * `LandSubdivisionState` (`manualPlotHeirOverrides` + `plotMetadata` exclusions for Danguud/Reeban)
 * so CAD Studio & Dashboard Map immediately match 100%.
 */
export function applyVerifiedPdfImportToSubdivisionState(
  prevState: LandSubdivisionState,
  verifiedRows: PdfExtractedAssignmentDraft[],
  cadSubdivision: SubdivisionComputationResult | null,
  heirs: PdfImportHeirOption[],
  sourceFileName: string,
  options?: { replaceExistingOverrides?: boolean }
): {
  nextState: LandSubdivisionState;
  appliedHeirPlotsCount: number;
  appliedExcludedPlotsCount: number;
  skippedUnmatchedCount: number;
} {
  const validPlotMap = new Map<string, GeneratedPlot>();
  const pool =
    cadSubdivision?.allEvaluatedPlots && cadSubdivision.allEvaluatedPlots.length > 0
      ? cadSubdivision.allEvaluatedPlots
      : cadSubdivision?.plots || [];
  pool.forEach((p) => validPlotMap.set(p.id, p));

  const validHeirKeys = new Set(heirs.map((h) => h.heirKey));
  const usedHeirHexes = new Set(heirs.map((h) => h.colorHex.toUpperCase()));

  const nextManual = options?.replaceExistingOverrides
    ? {}
    : { ...prevState.manualPlotHeirOverrides };
  const nextPlotMeta = { ...prevState.plotMetadata };

  let appliedHeirPlotsCount = 0;
  let appliedExcludedPlotsCount = 0;
  let skippedUnmatchedCount = 0;

  verifiedRows.forEach((row, idx) => {
    const plotId = row.matchedPlotId?.trim();
    if (!plotId || !validPlotMap.has(plotId)) {
      skippedUnmatchedCount++;
      return;
    }
    const plotObj = validPlotMap.get(plotId)!;
    const existingMeta: PlotDetailedMetadata = nextPlotMeta[plotId] || {
      plotId,
      blockId: plotObj.block,
      wadiStatus: 'unverified' as WadiStatus,
      siteQuality: 'unverified' as SiteQualityRating,
    };

    if (row.assigneeType === 'excluded_custom') {
      delete nextManual[plotId];
      const chosenColor =
        row.colorHex && !usedHeirHexes.has(row.colorHex.toUpperCase())
          ? row.colorHex
          : SPECIAL_COLOR_PALETTE.find((c) => !usedHeirHexes.has(c.toUpperCase())) ||
            getDistinctHeirColor(90 + idx, usedHeirHexes);
      const specName = row.assigneeName.trim();
      nextPlotMeta[plotId] = {
        ...existingMeta,
        isExcludedFromDivision: true,
        excludedSpecialName: specName,
        excludedColorHex: chosenColor,
        ...(specName && !existingMeta.parcelNumberOrName
          ? { parcelNumberOrName: specName }
          : {}),
        updatedAt: new Date().toISOString(),
      };
      appliedExcludedPlotsCount++;
    } else if (row.matchedHeirKey && (validHeirKeys.size === 0 || validHeirKeys.has(row.matchedHeirKey))) {
      nextManual[plotId] = row.matchedHeirKey;
      if (existingMeta.isExcludedFromDivision) {
        nextPlotMeta[plotId] = {
          ...existingMeta,
          isExcludedFromDivision: false,
          updatedAt: new Date().toISOString(),
        };
      }
      appliedHeirPlotsCount++;
    } else {
      skippedUnmatchedCount++;
    }
  });

  const nextState: LandSubdivisionState = {
    ...prevState,
    approvalStatus:
      prevState.approvalStatus === 'approved' ? 'under_review' : prevState.approvalStatus,
    manualPlotHeirOverrides: nextManual,
    plotMetadata: nextPlotMeta,
    auditHistory: [
      createAuditEntry(
        'manual_allocation',
        `Waafajinta PDF/Scan (${sourceFileName}): ${appliedHeirPlotsCount} plot dhaxale + ${appliedExcludedPlotsCount} plot gaar ah (Danguud/Reeban) ayaa lagu xidhay CAD Studio.`
      ),
      ...(prevState.auditHistory || []).slice(0, 49),
    ],
  };

  return {
    nextState,
    appliedHeirPlotsCount,
    appliedExcludedPlotsCount,
    skippedUnmatchedCount,
  };
}
