import {
  GeneratedBlock,
  GeneratedPlot,
  HalfPlotAffectedChangeItem,
  HalfPlotExpectedRule,
  HalfPlotValidationHistorySnapshot,
  HalfPlotValidationStatus,
  HalfPlotValidationSummary,
  PlotHalfValidationRecord,
  Point2D,
} from '../types/landSubdivision';

/* ==================== STATUS LABELS & COLORS ==================== */

export const HALF_PLOT_STATUS_METADATA: Record<
  HalfPlotValidationStatus,
  {
    labelSomali: string;
    shortSomali: string;
    fillHex: string;
    strokeHex: string;
    textHex: string;
  }
> = {
  full_inside: {
    labelSomali: 'Gudaha oo dhan',
    shortSomali: 'Gudaha oo dhan',
    fillHex: '#0d9488',
    strokeHex: '#0f766e',
    textHex: '#0f766e',
  },
  full_outside: {
    labelSomali: 'Dibadda oo dhan',
    shortSomali: 'Dibadda oo dhan',
    fillHex: '#e2e8f0',
    strokeHex: '#94a3b8',
    textHex: '#64748b',
  },
  boundary_clipped: {
    labelSomali: 'Xuduuddu goysay',
    shortSomali: 'Xuduuddu goysay',
    fillHex: '#6366f1',
    strokeHex: '#4338ca',
    textHex: '#4338ca',
  },
  half_plot_valid: {
    labelSomali: 'Half Plot wuu buuxiyey shuruudaha',
    shortSomali: 'Half Plot sax ah',
    fillHex: '#16a34a',
    strokeHex: '#15803d',
    textHex: '#15803d',
  },
  half_plot_invalid: {
    labelSomali: 'Half Plot ma buuxin shuruudaha',
    shortSomali: 'Ma buuxin Half Plot',
    fillHex: '#dc2626',
    strokeHex: '#b91c1c',
    textHex: '#b91c1c',
  },
  needs_review: {
    labelSomali: 'Dib-u-eegis ayaa loo baahan yahay',
    shortSomali: 'Dib-u-eegis',
    fillHex: '#d97706',
    strokeHex: '#b45309',
    textHex: '#b45309',
  },
  insufficient_data: {
    labelSomali: 'Xog aan ku filnayn',
    shortSomali: 'Xog aan ku filnayn',
    fillHex: '#64748b',
    strokeHex: '#475569',
    textHex: '#475569',
  },
};

export const CORNER_HALF_PLOT_NUMBERS = [1, 5, 6, 10];
export const MIDDLE_HALF_PLOT_NUMBERS = [2, 3, 4, 7, 8, 9];
export const TARGET_HALF_PLOT_AREA_SQM = 216;

/**
 * Section 2.1: 10-Plot Block Half Plot Dimension Rules
 * - Plots 1, 5, 6, 10 -> 12 × 18 m (216 m²)
 * - Plots 2, 3, 4, 7, 8, 9 -> 9 × 24 m (216 m²)
 * Never swaps 12×18m with 9×24m across plot numbers.
 */
export function getExpectedHalfPlotRuleForPlotNumber(
  plotNumber: number,
  blockTotalPlots = 10
): HalfPlotExpectedRule {
  if (blockTotalPlots === 10 && CORNER_HALF_PLOT_NUMBERS.includes(plotNumber)) {
    return {
      ruleCode: '12x18',
      label: '12 × 18 m',
      targetAreaSqM: TARGET_HALF_PLOT_AREA_SQM,
      canonicalSpanU: 18,
      canonicalSpanV: 12,
      appliesToPlotNumbers: CORNER_HALF_PLOT_NUMBERS,
    };
  }
  if (blockTotalPlots === 10 && MIDDLE_HALF_PLOT_NUMBERS.includes(plotNumber)) {
    return {
      ruleCode: '9x24',
      label: '9 × 24 m',
      targetAreaSqM: TARGET_HALF_PLOT_AREA_SQM,
      canonicalSpanU: 9,
      canonicalSpanV: 24,
      appliesToPlotNumbers: MIDDLE_HALF_PLOT_NUMBERS,
    };
  }
  return {
    ruleCode: 'unknown',
    label: 'Xeerka 10-Plot lama dabaqi karo',
    targetAreaSqM: TARGET_HALF_PLOT_AREA_SQM,
    canonicalSpanU: 0,
    canonicalSpanV: 0,
    appliesToPlotNumbers: [],
  };
}

/* ==================== CORE 2D POLYGON GEOMETRY (UTM METERS) ==================== */

export function signedRingArea(ring: Point2D[]): number {
  let a = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function cross2D(a: Point2D, b: Point2D, c: Point2D): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function dist2D(a: Point2D, b: Point2D): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pointOnSegment(pt: Point2D, a: Point2D, b: Point2D, eps = 1e-6): boolean {
  const c = Math.abs(cross2D(a, b, pt));
  const segLen = dist2D(a, b);
  if (segLen < eps) return dist2D(pt, a) <= eps;
  if (c / segLen > eps) return false;
  const dot = (pt[0] - a[0]) * (b[0] - a[0]) + (pt[1] - a[1]) * (b[1] - a[1]);
  if (dot < -eps * segLen) return false;
  if (dot > segLen * segLen + eps * segLen) return false;
  return true;
}

function segmentsCrossNonAdjacent(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): boolean {
  const d1 = cross2D(p3, p4, p1);
  const d2 = cross2D(p3, p4, p2);
  const d3 = cross2D(p1, p2, p3);
  const d4 = cross2D(p1, p2, p4);

  if (((d1 > 1e-7 && d2 < -1e-7) || (d1 < -1e-7 && d2 > 1e-7)) &&
      ((d3 > 1e-7 && d4 < -1e-7) || (d3 < -1e-7 && d4 > 1e-7))) {
    return true;
  }

  if (pointOnSegment(p1, p3, p4, 1e-5)) return true;
  if (pointOnSegment(p2, p3, p4, 1e-5)) return true;
  if (pointOnSegment(p3, p1, p2, 1e-5)) return true;
  if (pointOnSegment(p4, p1, p2, 1e-5)) return true;
  return false;
}

export interface GeometryValidityCheck {
  valid: boolean;
  cleanRingCCW: Point2D[];
  areaSqM: number;
  isSelfIntersecting: boolean;
  errorSomali?: string;
}

/**
 * Validates polygon coordinates, removes duplicate/collinear degeneracies,
 * checks self-intersections, and normalizes orientation to Counter-Clockwise (CCW).
 */
export function validateAndNormalizePolygonUtm(rawRing: Point2D[] | null | undefined): GeometryValidityCheck {
  if (!Array.isArray(rawRing) || rawRing.length < 3) {
    return {
      valid: false,
      cleanRingCCW: [],
      areaSqM: 0,
      isSelfIntersecting: false,
      errorSomali: 'Geometry-gu ma laha ugu yaraan 3 geesood oo sax ah.',
    };
  }

  const pts: Point2D[] = [];
  for (const c of rawRing) {
    if (!Array.isArray(c) || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) {
      return {
        valid: false,
        cleanRingCCW: [],
        areaSqM: 0,
        isSelfIntersecting: false,
        errorSomali: 'Isuduwaha geometry-ga waxaa ku jira tirooyin khaldan (NaN/Infinity).',
      };
    }
    if (pts.length === 0 || dist2D(pts[pts.length - 1], c) > 1e-4) {
      pts.push([c[0], c[1]]);
    }
  }

  if (pts.length > 1 && dist2D(pts[0], pts[pts.length - 1]) <= 1e-4) {
    pts.pop();
  }

  // Remove strictly collinear intermediate vertices (180° straight angle or zero-area spike)
  let simplified = pts.slice();
  let changed = true;
  while (changed && simplified.length >= 3) {
    changed = false;
    const next: Point2D[] = [];
    const m = simplified.length;
    for (let i = 0; i < m; i++) {
      const prev = simplified[(i - 1 + m) % m];
      const curr = simplified[i];
      const nxt = simplified[(i + 1) % m];
      const l1 = dist2D(prev, curr);
      const l2 = dist2D(curr, nxt);
      if (l1 < 1e-4 || l2 < 1e-4) {
        changed = true;
        continue;
      }
      const cr = Math.abs(cross2D(prev, curr, nxt)) / (l1 * l2);
      const dot = (curr[0] - prev[0]) * (nxt[0] - curr[0]) + (curr[1] - prev[1]) * (nxt[1] - curr[1]);
      // Collinear along same direction or exact fold-back spike
      if (cr < 1e-6 && dot > 0) {
        changed = true;
        continue;
      }
      next.push(curr);
    }
    simplified = next;
  }

  if (simplified.length < 3) {
    return {
      valid: false,
      cleanRingCCW: [],
      areaSqM: 0,
      isSelfIntersecting: false,
      errorSomali: 'Geometry-gu waa xariiq isku toosan oo aan bed lahayn (degenerate polygon).',
    };
  }

  const sArea = signedRingArea(simplified);
  const absArea = Math.abs(sArea);

  // Check non-adjacent edge self-intersection FIRST (symmetric figure-8 / bowtie has signedArea = 0!)
  const n = simplified.length;
  for (let i = 0; i < n; i++) {
    const a1 = simplified[i];
    const a2 = simplified[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent wrap-around
      const b1 = simplified[j];
      const b2 = simplified[(j + 1) % n];
      if (segmentsCrossNonAdjacent(a1, a2, b1, b2)) {
        return {
          valid: false,
          cleanRingCCW: sArea < 0 ? simplified.slice().reverse() : simplified,
          areaSqM: absArea,
          isSelfIntersecting: true,
          errorSomali: 'Geometry-gu isaga laftiisa ayaa is-jaraya (self-intersecting polygon).',
        };
      }
    }
  }

  if (absArea < 0.05) {
    return {
      valid: false,
      cleanRingCCW: [],
      areaSqM: absArea,
      isSelfIntersecting: false,
      errorSomali: `Bedka polygon-ku aad ayuu u yar yahay (${absArea.toFixed(3)} m²) ama waa eber.`,
    };
  }

  const ccw = sArea < 0 ? simplified.slice().reverse() : simplified;
  return {
    valid: true,
    cleanRingCCW: ccw,
    areaSqM: absArea,
    isSelfIntersecting: false,
  };
}

export interface TriangleWithBBox {
  pts: [Point2D, Point2D, Point2D];
  bb: [number, number, number, number];
}

function pointStrictlyOrOnTriangle(p: Point2D, a: Point2D, b: Point2D, c: Point2D): boolean {
  const c1 = cross2D(a, b, p);
  const c2 = cross2D(b, c, p);
  const c3 = cross2D(c, a, p);
  return c1 >= -1e-7 && c2 >= -1e-7 && c3 >= -1e-7;
}

/**
 * Ear-clipping triangulation of any valid CCW simple polygon (convex or concave)
 * into exact disjoint triangles.
 */
export function triangulateSimplePolygonCCW(ccwRing: Point2D[]): TriangleWithBBox[] {
  const tris: TriangleWithBBox[] = [];
  if (ccwRing.length < 3) return tris;

  const idxs = ccwRing.map((_, i) => i);
  let guard = 0;
  const maxIter = ccwRing.length * ccwRing.length + 20;

  while (idxs.length > 3 && guard < maxIter) {
    guard++;
    let earFound = false;
    const m = idxs.length;

    for (let k = 0; k < m; k++) {
      const iPrev = idxs[(k - 1 + m) % m];
      const iCurr = idxs[k];
      const iNext = idxs[(k + 1) % m];
      const a = ccwRing[iPrev];
      const b = ccwRing[iCurr];
      const c = ccwRing[iNext];

      if (cross2D(a, b, c) <= 1e-7) continue; // reflex or collinear

      let hasPointInside = false;
      for (let j = 0; j < m; j++) {
        const idx = idxs[j];
        if (idx === iPrev || idx === iCurr || idx === iNext) continue;
        if (pointStrictlyOrOnTriangle(ccwRing[idx], a, b, c)) {
          hasPointInside = true;
          break;
        }
      }

      if (!hasPointInside) {
        tris.push({
          pts: [a, b, c],
          bb: [
            Math.min(a[0], b[0], c[0]),
            Math.min(a[1], b[1], c[1]),
            Math.max(a[0], b[0], c[0]),
            Math.max(a[1], b[1], c[1]),
          ],
        });
        idxs.splice(k, 1);
        earFound = true;
        break;
      }
    }

    if (!earFound) {
      // Relaxed fallback for near-degenerate vertices
      const a = ccwRing[idxs[0]];
      const b = ccwRing[idxs[1]];
      const c = ccwRing[idxs[2]];
      if (Math.abs(cross2D(a, b, c)) > 1e-6) {
        const orient: [Point2D, Point2D, Point2D] = cross2D(a, b, c) > 0 ? [a, b, c] : [a, c, b];
        tris.push({
          pts: orient,
          bb: [
            Math.min(a[0], b[0], c[0]),
            Math.min(a[1], b[1], c[1]),
            Math.max(a[0], b[0], c[0]),
            Math.max(a[1], b[1], c[1]),
          ],
        });
      }
      idxs.splice(1, 1);
    }
  }

  if (idxs.length === 3) {
    const a = ccwRing[idxs[0]];
    const b = ccwRing[idxs[1]];
    const c = ccwRing[idxs[2]];
    if (Math.abs(cross2D(a, b, c)) > 1e-6) {
      const orient: [Point2D, Point2D, Point2D] = cross2D(a, b, c) > 0 ? [a, b, c] : [a, c, b];
      tris.push({
        pts: orient,
        bb: [
          Math.min(a[0], b[0], c[0]),
          Math.min(a[1], b[1], c[1]),
          Math.max(a[0], b[0], c[0]),
          Math.max(a[1], b[1], c[1]),
        ],
      });
    }
  }

  return tris;
}

/**
 * Sutherland-Hodgman exact clipping of a convex subject polygon against a CCW convex clip polygon.
 */
function clipConvexByConvexCCW(subjectCCW: Point2D[], clipCCW: Point2D[]): Point2D[] {
  let output = subjectCCW.slice();
  const cn = clipCCW.length;

  for (let i = 0; i < cn; i++) {
    if (output.length === 0) break;
    const edgeA = clipCCW[i];
    const edgeB = clipCCW[(i + 1) % cn];
    const input = output;
    output = [];

    const isInside = (p: Point2D) => cross2D(edgeA, edgeB, p) >= -1e-9;

    const intersectEdge = (s: Point2D, e: Point2D): Point2D => {
      const dx1 = e[0] - s[0];
      const dy1 = e[1] - s[1];
      const dx2 = edgeB[0] - edgeA[0];
      const dy2 = edgeB[1] - edgeA[1];
      const denom = dx1 * dy2 - dy1 * dx2;
      if (Math.abs(denom) < 1e-12) return e;
      const t = ((edgeA[0] - s[0]) * dy2 - (edgeA[1] - s[1]) * dx2) / denom;
      const tc = Math.max(0, Math.min(1, t));
      return [s[0] + tc * dx1, s[1] + tc * dy1];
    };

    for (let j = 0; j < input.length; j++) {
      const curr = input[j];
      const prev = input[(j - 1 + input.length) % input.length];
      const currIn = isInside(curr);
      const prevIn = isInside(prev);

      if (currIn) {
        if (!prevIn) {
          output.push(intersectEdge(prev, curr));
        }
        output.push(curr);
      } else if (prevIn) {
        output.push(intersectEdge(prev, curr));
      }
    }
  }

  // Deduplicate tiny adjacent vertices
  const clean: Point2D[] = [];
  for (const p of output) {
    if (clean.length === 0 || dist2D(clean[clean.length - 1], p) > 1e-5) {
      clean.push(p);
    }
  }
  if (clean.length > 1 && dist2D(clean[0], clean[clean.length - 1]) <= 1e-5) {
    clean.pop();
  }
  return clean.length >= 3 ? clean : [];
}

function snapKey(p: Point2D): string {
  return `${Math.round(p[0] * 10000)},${Math.round(p[1] * 10000)}`;
}

/**
 * Merges a set of non-overlapping CCW convex pieces that share triangulation diagonals
 * into clean outer polygon ring(s) by canceling opposite half-edges.
 */
function mergePiecesIntoCleanRings(piecesCCW: Point2D[][]): Point2D[][] {
  if (piecesCCW.length === 0) return [];
  if (piecesCCW.length === 1) return [simplifyCollinearRing(piecesCCW[0])];

  interface HalfEdge {
    a: Point2D;
    b: Point2D;
    ka: string;
    kb: string;
    used: boolean;
  }

  const edgeMap = new Map<string, HalfEdge>();

  for (const piece of piecesCCW) {
    const n = piece.length;
    for (let i = 0; i < n; i++) {
      const a = piece[i];
      const b = piece[(i + 1) % n];
      const ka = snapKey(a);
      const kb = snapKey(b);
      if (ka === kb) continue;
      const revKey = `${kb}->${ka}`;
      if (edgeMap.has(revKey)) {
        edgeMap.delete(revKey); // Cancel shared internal diagonal!
      } else {
        edgeMap.set(`${ka}->${kb}`, { a, b, ka, kb, used: false });
      }
    }
  }

  const adj = new Map<string, HalfEdge[]>();
  edgeMap.forEach((he) => {
    const list = adj.get(he.ka) || [];
    list.push(he);
    adj.set(he.ka, list);
  });

  const rings: Point2D[][] = [];
  edgeMap.forEach((startEdge) => {
    if (startEdge.used) return;
    const ring: Point2D[] = [];
    let cur: HalfEdge | undefined = startEdge;
    let steps = 0;
    while (cur && !cur.used && steps < 2000) {
      cur.used = true;
      ring.push(cur.a);
      if (cur.kb === startEdge.ka) break;
      const candidates: HalfEdge[] = (adj.get(cur.kb) || []).filter((e) => !e.used);
      if (candidates.length === 0) break;
      cur = candidates[0];
      steps++;
    }
    if (ring.length >= 3) {
      const simp = simplifyCollinearRing(ring);
      if (simp.length >= 3 && Math.abs(signedRingArea(simp)) > 0.01) {
        rings.push(simp);
      }
    }
  });

  rings.sort((r1, r2) => Math.abs(signedRingArea(r2)) - Math.abs(signedRingArea(r1)));
  return rings.length > 0 ? rings : piecesCCW;
}

function simplifyCollinearRing(ring: Point2D[]): Point2D[] {
  if (ring.length <= 3) return ring;
  const out: Point2D[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n];
    const curr = ring[i];
    const next = ring[(i + 1) % n];
    const l1 = dist2D(prev, curr);
    const l2 = dist2D(curr, next);
    if (l1 < 1e-4 || l2 < 1e-4) continue;
    const cr = Math.abs(cross2D(prev, curr, next)) / (l1 * l2);
    if (cr < 1e-4) continue;
    out.push(curr);
  }
  return out.length >= 3 ? out : ring;
}

/**
 * Computes exact polygon difference `Plot \ (Plot ∩ Boundary)` along the plot's boundary edges
 * so the outside portion of a boundary-clipped plot can be rendered distinctly on the map!
 */
function computePlotOutsideRings(plotCCW: Point2D[], insideRingsCCW: Point2D[][]): Point2D[][] {
  if (insideRingsCCW.length === 0) return [plotCCW];

  interface DirSeg {
    a: Point2D;
    b: Point2D;
  }

  const outSegs: DirSeg[] = [];
  const nP = plotCCW.length;

  // 1. Subtract collinear segments of insideRingsCCW that lie on each edge of plotCCW
  for (let i = 0; i < nP; i++) {
    const A = plotCCW[i];
    const B = plotCCW[(i + 1) % nP];
    const len = dist2D(A, B);
    if (len < 1e-5) continue;
    const ux = (B[0] - A[0]) / len;
    const uy = (B[1] - A[1]) / len;

    const coveredIntervals: [number, number][] = [];
    for (const ir of insideRingsCCW) {
      const m = ir.length;
      for (let j = 0; j < m; j++) {
        const p = ir[j];
        const q = ir[(j + 1) % m];
        // Check if segment p->q lies on line A->B
        const dP = Math.abs((p[0] - A[0]) * -uy + (p[1] - A[1]) * ux);
        const dQ = Math.abs((q[0] - A[0]) * -uy + (q[1] - A[1]) * ux);
        if (dP < 1e-2 && dQ < 1e-2) {
          const t1 = (p[0] - A[0]) * ux + (p[1] - A[1]) * uy;
          const t2 = (q[0] - A[0]) * ux + (q[1] - A[1]) * uy;
          const lo = Math.max(0, Math.min(t1, t2));
          const hi = Math.min(len, Math.max(t1, t2));
          if (hi - lo > 1e-3) {
            coveredIntervals.push([lo, hi]);
          }
        }
      }
    }

    coveredIntervals.sort((x, y) => x[0] - y[0]);
    let cursor = 0;
    for (const [lo, hi] of coveredIntervals) {
      if (lo > cursor + 1e-3) {
        outSegs.push({
          a: [A[0] + cursor * ux, A[1] + cursor * uy],
          b: [A[0] + lo * ux, A[1] + lo * uy],
        });
      }
      cursor = Math.max(cursor, hi);
    }
    if (len > cursor + 1e-3) {
      outSegs.push({
        a: [A[0] + cursor * ux, A[1] + cursor * uy],
        b: B,
      });
    }
  }

  // 2. Add reversed interior cut edges of insideRingsCCW (those NOT lying on plotCCW's outer boundary)
  for (const ir of insideRingsCCW) {
    const m = ir.length;
    for (let j = 0; j < m; j++) {
      const p = ir[j];
      const q = ir[(j + 1) % m];
      let onPlotEdge = false;
      for (let i = 0; i < nP; i++) {
        const A = plotCCW[i];
        const B = plotCCW[(i + 1) % nP];
        if (pointOnSegment(p, A, B, 1e-2) && pointOnSegment(q, A, B, 1e-2)) {
          onPlotEdge = true;
          break;
        }
      }
      if (!onPlotEdge && dist2D(p, q) > 1e-3) {
        // Reversed direction (q -> p) bounds the outside portion!
        outSegs.push({ a: q, b: p });
      }
    }
  }

  if (outSegs.length < 3) return [];

  // Chain segments into rings by proximity (within 2 cm)
  const used = new Array(outSegs.length).fill(false);
  const rings: Point2D[][] = [];

  for (let s = 0; s < outSegs.length; s++) {
    if (used[s]) continue;
    const ring: Point2D[] = [outSegs[s].a];
    used[s] = true;
    let curEnd = outSegs[s].b;
    let steps = 0;

    while (steps < outSegs.length + 5) {
      steps++;
      if (dist2D(curEnd, ring[0]) < 0.03 && ring.length >= 3) {
        break;
      }
      let bestIdx = -1;
      let bestDist = 0.05;
      for (let k = 0; k < outSegs.length; k++) {
        if (used[k]) continue;
        const d = dist2D(curEnd, outSegs[k].a);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = k;
        }
      }
      if (bestIdx < 0) break;
      used[bestIdx] = true;
      ring.push(outSegs[bestIdx].a);
      curEnd = outSegs[bestIdx].b;
    }

    if (ring.length >= 3 && Math.abs(signedRingArea(ring)) > 0.05) {
      rings.push(simplifyCollinearRing(ring));
    }
  }

  return rings;
}

/**
 * Exact intersection area & clipped rings of any simple polygon against a triangulated boundary.
 */
export function intersectPolygonWithTriangulatedBoundary(
  polyCCW: Point2D[],
  boundaryTris: TriangleWithBBox[]
): { insideAreaSqM: number; insideRingsUtm: Point2D[][] } {
  const polyTris =
    polyCCW.length === 4 && isConvexQuad(polyCCW)
      ? [
          {
            pts: polyCCW as unknown as [Point2D, Point2D, Point2D],
            bb: computeBBox(polyCCW),
          },
        ]
      : triangulateSimplePolygonCCW(polyCCW);

  let totalArea = 0;
  const pieces: Point2D[][] = [];

  for (const pt of polyTris) {
    const pRing = pt.pts as unknown as Point2D[];
    const pbb = pt.bb;
    for (const bt of boundaryTris) {
      if (
        pbb[2] < bt.bb[0] - 1e-6 ||
        pbb[0] > bt.bb[2] + 1e-6 ||
        pbb[3] < bt.bb[1] - 1e-6 ||
        pbb[1] > bt.bb[3] + 1e-6
      ) {
        continue;
      }
      const clipped = clipConvexByConvexCCW(pRing, bt.pts);
      if (clipped.length >= 3) {
        const a = Math.abs(signedRingArea(clipped));
        if (a > 1e-5) {
          totalArea += a;
          pieces.push(clipped);
        }
      }
    }
  }

  const insideRingsUtm = mergePiecesIntoCleanRings(pieces);
  return {
    insideAreaSqM: totalArea,
    insideRingsUtm,
  };
}

function computeBBox(ring: Point2D[]): [number, number, number, number] {
  let x0 = 1e18;
  let y0 = 1e18;
  let x1 = -1e18;
  let y1 = -1e18;
  for (const p of ring) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  return [x0, y0, x1, y1];
}

function isConvexQuad(ring: Point2D[]): boolean {
  if (ring.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    if (cross2D(ring[i], ring[(i + 1) % 4], ring[(i + 2) % 4]) <= 0) return false;
  }
  return true;
}

/* ==================== PAIRWISE PLOT OVERLAP DETECTOR ==================== */

export function detectPairwisePlotOverlaps(
  plots: { id: string; rectCCW: Point2D[]; bb: [number, number, number, number] }[]
): Record<string, string[]> {
  const overlaps: Record<string, string[]> = {};
  for (let i = 0; i < plots.length; i++) {
    for (let j = i + 1; j < plots.length; j++) {
      const A = plots[i];
      const B = plots[j];
      if (
        A.bb[2] <= B.bb[0] + 0.02 ||
        A.bb[0] >= B.bb[2] - 0.02 ||
        A.bb[3] <= B.bb[1] + 0.02 ||
        A.bb[1] >= B.bb[3] - 0.02
      ) {
        continue;
      }
      const trisB = triangulateSimplePolygonCCW(B.rectCCW);
      const inter = intersectPolygonWithTriangulatedBoundary(A.rectCCW, trisB);
      if (inter.insideAreaSqM > 0.15) {
        if (!overlaps[A.id]) overlaps[A.id] = [];
        if (!overlaps[B.id]) overlaps[B.id] = [];
        overlaps[A.id].push(B.id);
        overlaps[B.id].push(A.id);
      }
    }
  }
  return overlaps;
}

/* ==================== INSCRIBED HALF-PLOT RECTANGLE SOLVER ==================== */

interface LocalFrame {
  originUtm: Point2D;
  uAxis: Point2D; // unit vector along plot width (18m)
  vAxis: Point2D; // unit vector along plot depth (24m)
  spanU: number;
  spanV: number;
}

function buildPlotLocalFrame(
  plotRectCCW: Point2D[],
  gridU?: Point2D,
  gridV?: Point2D
): LocalFrame {
  let ux = gridU ? gridU[0] : 1;
  let uy = gridU ? gridU[1] : 0;
  let vx = gridV ? gridV[0] : 0;
  let vy = gridV ? gridV[1] : 1;

  if (!gridU || !gridV || (Math.abs(ux - 1) < 1e-9 && Math.abs(vy - 1) < 1e-9 && plotRectCCW.length >= 4)) {
    // Derive from longest/shortest edges if prebuilt polygon is rotated
    if (!gridU && plotRectCCW.length >= 4) {
      const e0: Point2D = [plotRectCCW[1][0] - plotRectCCW[0][0], plotRectCCW[1][1] - plotRectCCW[0][1]];
      const len0 = Math.hypot(e0[0], e0[1]) || 1;
      ux = e0[0] / len0;
      uy = e0[1] / len0;
      vx = -uy;
      vy = ux;
    }
  }

  let uMin = 1e18;
  let uMax = -1e18;
  let vMin = 1e18;
  let vMax = -1e18;
  for (const p of plotRectCCW) {
    const pu = p[0] * ux + p[1] * uy;
    const pv = p[0] * vx + p[1] * vy;
    uMin = Math.min(uMin, pu);
    uMax = Math.max(uMax, pu);
    vMin = Math.min(vMin, pv);
    vMax = Math.max(vMax, pv);
  }

  const originUtm: Point2D = [uMin * ux + vMin * vx, uMin * uy + vMin * vy];
  return {
    originUtm,
    uAxis: [ux, uy],
    vAxis: [vx, vy],
    spanU: Math.max(0, uMax - uMin),
    spanV: Math.max(0, vMax - vMin),
  };
}

function uvRectToUtmCCW(frame: LocalFrame, u0: number, v0: number, wU: number, dV: number): Point2D[] {
  const toUtm = (u: number, v: number): Point2D => [
    frame.originUtm[0] + u * frame.uAxis[0] + v * frame.vAxis[0],
    frame.originUtm[1] + u * frame.uAxis[1] + v * frame.vAxis[1],
  ];
  const raw = [
    toUtm(u0, v0),
    toUtm(u0 + wU, v0),
    toUtm(u0 + wU, v0 + dV),
    toUtm(u0, v0 + dV),
  ];
  return signedRingArea(raw) < 0 ? raw.reverse() : raw;
}

/**
 * Checks whether an exact rectangle of size `reqU × reqV` (in meters along block axes U, V)
 * fits 100% inside BOTH the Plot AND the Triangulated Boundary (within 0.06m survey precision),
 * preferring placements anchored on the block's road frontage!
 */
function findExactInscribedHalfPlotRect(
  frame: LocalFrame,
  insideRingsUtm: Point2D[][],
  plotTris: TriangleWithBBox[],
  boundaryTris: TriangleWithBBox[],
  reqU: number,
  reqV: number,
  roadEdges: { uZeroRoad: boolean; uMaxRoad: boolean; vZeroRoad: boolean; vMaxRoad: boolean }
): {
  fits: boolean;
  rectUtm: Point2D[] | null;
  touchesRoad: boolean;
} {
  const DIM_EPS = 0.06; // 6 cm tolerance for WGS84 <-> UTM projection round-trips
  const effU = Math.min(reqU, frame.spanU + DIM_EPS) >= reqU ? Math.min(reqU, frame.spanU) : -1;
  const effV = Math.min(reqV, frame.spanV + DIM_EPS) >= reqV ? Math.min(reqV, frame.spanV) : -1;

  if (effU <= 0 || effV <= 0 || reqU - frame.spanU > DIM_EPS || reqV - frame.spanV > DIM_EPS) {
    return { fits: false, rectUtm: null, touchesRoad: false };
  }

  // Project inside vertices to local UV to generate critical candidate anchors
  const uCands = new Set<number>([0, Math.max(0, frame.spanU - effU)]);
  const vCands = new Set<number>([0, Math.max(0, frame.spanV - effV)]);

  for (const ir of insideRingsUtm) {
    for (const p of ir) {
      const du = p[0] - frame.originUtm[0];
      const dv = p[1] - frame.originUtm[1];
      const pu = du * frame.uAxis[0] + dv * frame.uAxis[1];
      const pv = du * frame.vAxis[0] + dv * frame.vAxis[1];
      if (pu >= -0.05 && pu <= frame.spanU - effU + 0.05) {
        uCands.add(Math.max(0, Math.min(frame.spanU - effU, pu)));
      }
      if (pu - effU >= -0.05 && pu - effU <= frame.spanU - effU + 0.05) {
        uCands.add(Math.max(0, Math.min(frame.spanU - effU, pu - effU)));
      }
      if (pv >= -0.05 && pv <= frame.spanV - effV + 0.05) {
        vCands.add(Math.max(0, Math.min(frame.spanV - effV, pv)));
      }
      if (pv - effV >= -0.05 && pv - effV <= frame.spanV - effV + 0.05) {
        vCands.add(Math.max(0, Math.min(frame.spanV - effV, pv - effV)));
      }
    }
  }

  // Also add uniform 0.5m scan grid so interior placements in angled cuts are never missed
  for (let u = 0; u <= frame.spanU - effU + 1e-6; u += 0.5) {
    uCands.add(+u.toFixed(4));
  }
  for (let v = 0; v <= frame.spanV - effV + 1e-6; v += 0.5) {
    vCands.add(+v.toFixed(4));
  }

  const checkTouchesRoad = (u0: number, v0: number): boolean => {
    if (roadEdges.uZeroRoad && u0 <= 0.15) return true;
    if (roadEdges.uMaxRoad && u0 + effU >= frame.spanU - 0.15) return true;
    if (roadEdges.vZeroRoad && v0 <= 0.15) return true;
    if (roadEdges.vMaxRoad && v0 + effV >= frame.spanV - 0.15) return true;
    return false;
  };

  const targetRectArea = effU * effV;
  const requiredContainedArea = targetRectArea - Math.max(0.12, targetRectArea * 0.0012);

  const pairs: { u0: number; v0: number; road: boolean }[] = [];
  uCands.forEach((u0) => {
    vCands.forEach((v0) => {
      pairs.push({ u0, v0, road: checkTouchesRoad(u0, v0) });
    });
  });

  // Prioritize placements touching the street!
  pairs.sort((a, b) => Number(b.road) - Number(a.road));

  for (const cand of pairs) {
    const rectCCW = uvRectToUtmCCW(frame, cand.u0, cand.v0, effU, effV);
    const inPlot = intersectPolygonWithTriangulatedBoundary(rectCCW, plotTris);
    if (inPlot.insideAreaSqM < requiredContainedArea) continue;
    const inBound = intersectPolygonWithTriangulatedBoundary(rectCCW, boundaryTris);
    if (inBound.insideAreaSqM >= requiredContainedArea) {
      return {
        fits: true,
        rectUtm: rectCCW,
        touchesRoad: cand.road,
      };
    }
  }

  return { fits: false, rectUtm: null, touchesRoad: false };
}

/**
 * Estimates the largest axis-aligned rectangular fit (uSpan × vSpan) inside `insideRingsUtm`
 * for clear diagnostic display when a plot fails Half Plot dimensions.
 */
function measureBestAxisAlignedFitUV(frame: LocalFrame, insideRingsUtm: Point2D[][]): {
  bestU: number;
  bestV: number;
} {
  if (insideRingsUtm.length === 0) return { bestU: 0, bestV: 0 };
  // Sample a 16×16 binary grid in local UV
  const NU = 18;
  const NV = 24;
  const cellU = frame.spanU / NU;
  const cellV = frame.spanV / NV;
  if (cellU <= 0 || cellV <= 0) return { bestU: 0, bestV: 0 };

  const insideTris = insideRingsUtm.flatMap((r) => {
    const v = validateAndNormalizePolygonUtm(r);
    return v.valid ? triangulateSimplePolygonCCW(v.cleanRingCCW) : [];
  });
  if (insideTris.length === 0) {
    // Fallback to UV bounding box of insideRingsUtm
    let u0 = 1e18;
    let u1 = -1e18;
    let v0 = 1e18;
    let v1 = -1e18;
    insideRingsUtm[0].forEach((p) => {
      const du = p[0] - frame.originUtm[0];
      const dv = p[1] - frame.originUtm[1];
      const pu = du * frame.uAxis[0] + dv * frame.uAxis[1];
      const pv = du * frame.vAxis[0] + dv * frame.vAxis[1];
      u0 = Math.min(u0, pu);
      u1 = Math.max(u1, pu);
      v0 = Math.min(v0, pv);
      v1 = Math.max(v1, pv);
    });
    return { bestU: Math.max(0, +(u1 - u0).toFixed(2)), bestV: Math.max(0, +(v1 - v0).toFixed(2)) };
  }

  // Largest rectangle in binary grid via histogram DP
  const heights = new Array(NU).fill(0);
  let maxArea = 0;
  let bestCols = 0;
  let bestRows = 0;

  for (let r = 0; r < NV; r++) {
    for (let c = 0; c < NU; c++) {
      const cx = (c + 0.5) * cellU;
      const cy = (r + 0.5) * cellV;
      const ptUtm: Point2D = [
        frame.originUtm[0] + cx * frame.uAxis[0] + cy * frame.vAxis[0],
        frame.originUtm[1] + cx * frame.uAxis[1] + cy * frame.vAxis[1],
      ];
      let ptIn = false;
      for (const t of insideTris) {
        if (
          ptUtm[0] >= t.bb[0] - 1e-5 &&
          ptUtm[0] <= t.bb[2] + 1e-5 &&
          ptUtm[1] >= t.bb[1] - 1e-5 &&
          ptUtm[1] <= t.bb[3] + 1e-5 &&
          pointStrictlyOrOnTriangle(ptUtm, t.pts[0], t.pts[1], t.pts[2])
        ) {
          ptIn = true;
          break;
        }
      }
      heights[c] = ptIn ? heights[c] + 1 : 0;
    }

    for (let c1 = 0; c1 < NU; c1++) {
      let minH = heights[c1];
      for (let c2 = c1; c2 < NU; c2++) {
        minH = Math.min(minH, heights[c2]);
        if (minH === 0) break;
        const w = (c2 - c1 + 1) * cellU;
        const h = minH * cellV;
        if (w * h > maxArea) {
          maxArea = w * h;
          bestCols = w;
          bestRows = h;
        }
      }
    }
  }

  // Refine exact bounding span if the entire inside polygon is already a clean axis-aligned rectangle!
  if (insideRingsUtm.length === 1 && insideRingsUtm[0].length === 4) {
    let u0 = 1e18;
    let u1 = -1e18;
    let v0 = 1e18;
    let v1 = -1e18;
    insideRingsUtm[0].forEach((p) => {
      const du = p[0] - frame.originUtm[0];
      const dv = p[1] - frame.originUtm[1];
      const pu = du * frame.uAxis[0] + dv * frame.uAxis[1];
      const pv = du * frame.vAxis[0] + dv * frame.vAxis[1];
      u0 = Math.min(u0, pu);
      u1 = Math.max(u1, pu);
      v0 = Math.min(v0, pv);
      v1 = Math.max(v1, pv);
    });
    const bboxArea = (u1 - u0) * (v1 - v0);
    const polyArea = Math.abs(signedRingArea(insideRingsUtm[0]));
    if (Math.abs(bboxArea - polyArea) < 0.25) {
      return {
        bestU: +Math.max(0, u1 - u0).toFixed(2),
        bestV: +Math.max(0, v1 - v0).toFixed(2),
      };
    }
  }

  return {
    bestU: +bestCols.toFixed(2),
    bestV: +bestRows.toFixed(2),
  };
}

/* ==================== FULL SUBDIVISION HALF-PLOT EVALUATOR ==================== */

export function evaluateBlocksAndHalfPlots(params: {
  blocks: GeneratedBlock[];
  boundaryRingUtm: Point2D[];
  gridU?: Point2D;
  gridV?: Point2D;
  nR?: number;
  nC?: number;
  isPrebuiltGeometry?: boolean;
  externalWarnings?: string[];
}): {
  blocks: GeneratedBlock[];
  fullPlots: GeneratedPlot[];
  allEvaluatedPlots: GeneratedPlot[];
  validHalfPlots: GeneratedPlot[];
  plotValidations: Record<string, PlotHalfValidationRecord>;
  summary: HalfPlotValidationSummary;
} {
  const {
    blocks,
    boundaryRingUtm,
    gridU,
    gridV,
    nR = 2,
    nC = 5,
    isPrebuiltGeometry = false,
    externalWarnings = [],
  } = params;

  const boundaryCheck = validateAndNormalizePolygonUtm(boundaryRingUtm);
  const boundaryWarnings: string[] = [...externalWarnings];
  if (!boundaryCheck.valid && boundaryCheck.errorSomali) {
    boundaryWarnings.push(`Xuduudda dhulka: ${boundaryCheck.errorSomali}`);
  }

  const boundaryTris = boundaryCheck.valid
    ? triangulateSimplePolygonCCW(boundaryCheck.cleanRingCCW)
    : [];

  // Check pairwise overlaps across all candidate plots (critical for prebuilt/custom geometry!)
  const validPlotPolyList: { id: string; rectCCW: Point2D[]; bb: [number, number, number, number] }[] = [];
  blocks.forEach((b) => {
    b.plots.forEach((q) => {
      const chk = validateAndNormalizePolygonUtm(q.rect);
      if (chk.valid) {
        validPlotPolyList.push({
          id: q.id,
          rectCCW: chk.cleanRingCCW,
          bb: computeBBox(chk.cleanRingCCW),
        });
      }
    });
  });

  const overlapMap = isPrebuiltGeometry ? detectPairwisePlotOverlaps(validPlotPolyList) : {};
  const hasCrsWarning = externalWarnings.some((w) => w.toLowerCase().includes('crs'));

  let fullInsideBlocksCount = 0;
  let boundaryClippedBlocksCount = 0;
  let fullInsidePlotsCount = 0;
  let fullOutsidePlotsCount = 0;
  let boundaryClippedPlotsCount = 0;
  let validHalfPlotsCount = 0;
  let invalidHalfPlotsCount = 0;
  let needsReviewPlotsCount = 0;
  let insufficientDataPlotsCount = 0;
  let overlappingPlotsCount = 0;

  const plotValidations: Record<string, PlotHalfValidationRecord> = {};
  const fullPlots: GeneratedPlot[] = [];
  const allEvaluatedPlots: GeneratedPlot[] = [];
  const validHalfPlots: GeneratedPlot[] = [];

  const updatedBlocks = blocks.map((blk) => {
    const blkCheck = validateAndNormalizePolygonUtm(blk.rect);
    const blkNominalArea = blkCheck.valid ? blkCheck.areaSqM : blk.calculatedAreaSqM || 0;
    const blkInter =
      boundaryCheck.valid && blkCheck.valid
        ? intersectPolygonWithTriangulatedBoundary(blkCheck.cleanRingCCW, boundaryTris)
        : { insideAreaSqM: 0, insideRingsUtm: [] };

    let blkValidHalfCount = 0;
    let blkClippedCount = 0;
    let blkOutsideCount = 0;
    let blkFullCount = 0;

    const evaluatedPlots = blk.plots.map((q) => {
      const expectedRule = getExpectedHalfPlotRuleForPlotNumber(q.no, blk.total);
      const pCheck = validateAndNormalizePolygonUtm(q.rect);
      const overlappingIds = overlapMap[q.id] || [];
      const hasOverlap = overlappingIds.length > 0;
      if (hasOverlap) overlappingPlotsCount++;

      // 1. Handle invalid/corrupted boundary or plot geometry (Mandatory Test #10)
      if (!boundaryCheck.valid || !pCheck.valid) {
        const status: HalfPlotValidationStatus =
          boundaryCheck.isSelfIntersecting || pCheck.isSelfIntersecting
            ? 'needs_review'
            : 'insufficient_data';
        if (status === 'needs_review') needsReviewPlotsCount++;
        else insufficientDataPlotsCount++;

        const errReason = !boundaryCheck.valid
          ? `Xuduudda dhulka lama xaqiijin karo: ${boundaryCheck.errorSomali}`
          : `Geometry-ga Plot ${q.id} ma saxna: ${pCheck.errorSomali}`;

        const rec: PlotHalfValidationRecord = {
          plotId: q.id,
          blockId: blk.id,
          plotNumber: q.no,
          blockTotalPlots: blk.total,
          boundaryRelation: 'insufficient_data',
          validationStatus: status,
          statusLabelSomali: HALF_PLOT_STATUS_METADATA[status].labelSomali,
          expectedRule,
          nominalPlotAreaSqM: +(pCheck.areaSqM || 0).toFixed(2),
          insideAreaSqM: 0,
          outsideAreaSqM: 0,
          insidePercentage: 0,
          insideRingsUtm: [],
          outsideRingsUtm: [],
          inscribedHalfPlotRectUtm: null,
          measuredBestSpanU: 0,
          measuredBestSpanV: 0,
          measuredDisplayDimensions: 'Lama xisaabin karo',
          touchesRoadFrontage: false,
          isFullyContainedInBoundary: false,
          hasUnauthorizedOverlap: hasOverlap,
          overlappingPlotIds: overlappingIds,
          orientationCanonical: false,
          reasonSomali: errReason,
          warningsSomali: [errReason],
        };
        plotValidations[q.id] = rec;
        const nextP: GeneratedPlot = { ...q, full: false, halfPlotValidation: rec };
        allEvaluatedPlots.push(nextP);
        return nextP;
      }

      const nominalArea = pCheck.areaSqM;
      const inter = intersectPolygonWithTriangulatedBoundary(pCheck.cleanRingCCW, boundaryTris);
      const insideArea = Math.min(nominalArea, inter.insideAreaSqM);
      const outsideArea = Math.max(0, nominalArea - insideArea);
      const insidePct = nominalArea > 0 ? +((insideArea / nominalArea) * 100).toFixed(2) : 0;

      const frame = buildPlotLocalFrame(pCheck.cleanRingCCW, gridU, gridV);

      // Determine road frontage edges for this plot inside the block
      const plotRow = q.r || (q.no <= 5 ? 1 : 2);
      const plotCol = q.c || ((q.no - 1) % Math.max(1, nC)) + 1;
      const roadEdges = {
        uZeroRoad: plotCol === 1,
        uMaxRoad: plotCol === nC,
        vMaxRoad: plotRow === 1,
        vZeroRoad: plotRow === nR,
      };

      // 2. FULL OUTSIDE (Dibadda oo dhan)
      if (insideArea <= 0.05) {
        fullOutsidePlotsCount++;
        blkOutsideCount++;
        const rec: PlotHalfValidationRecord = {
          plotId: q.id,
          blockId: blk.id,
          plotNumber: q.no,
          blockTotalPlots: blk.total,
          boundaryRelation: 'full_outside',
          validationStatus: 'full_outside',
          statusLabelSomali: HALF_PLOT_STATUS_METADATA.full_outside.labelSomali,
          expectedRule,
          nominalPlotAreaSqM: +nominalArea.toFixed(2),
          insideAreaSqM: 0,
          outsideAreaSqM: +nominalArea.toFixed(2),
          insidePercentage: 0,
          insideRingsUtm: [],
          outsideRingsUtm: [pCheck.cleanRingCCW],
          inscribedHalfPlotRectUtm: null,
          measuredBestSpanU: 0,
          measuredBestSpanV: 0,
          measuredDisplayDimensions: '0 × 0 m',
          touchesRoadFrontage: false,
          isFullyContainedInBoundary: false,
          hasUnauthorizedOverlap: hasOverlap,
          overlappingPlotIds: overlappingIds,
          orientationCanonical: false,
          reasonSomali: `Plot ${q.no} (${q.id}) gebi ahaanba wuxuu ku dhacay dibadda xuduudda dhulka (0 m² gudaha).`,
          warningsSomali: [],
        };
        plotValidations[q.id] = rec;
        const nextP: GeneratedPlot = { ...q, full: false, halfPlotValidation: rec };
        allEvaluatedPlots.push(nextP);
        return nextP;
      }

      // 3. FULL INSIDE (Gudaha oo dhan)
      if (outsideArea <= 0.05 && insideArea >= nominalArea - 0.05) {
        if (hasOverlap || hasCrsWarning) {
          // Flag overlapping or unverified CRS prebuilt plot for review instead of blind trust!
          needsReviewPlotsCount++;
          const warnMsg = hasOverlap
            ? `Is-dul-saar aan la oggolayn ayaa lagala kulmay: ${overlappingIds.join(', ')}.`
            : 'Isuduwaha CRS ee faylka lama xaqiijin — dib-u-eegis ayaa loo baahan yahay.';
          const rec: PlotHalfValidationRecord = {
            plotId: q.id,
            blockId: blk.id,
            plotNumber: q.no,
            blockTotalPlots: blk.total,
            boundaryRelation: 'full_inside',
            validationStatus: 'needs_review',
            statusLabelSomali: HALF_PLOT_STATUS_METADATA.needs_review.labelSomali,
            expectedRule,
            nominalPlotAreaSqM: +nominalArea.toFixed(2),
            insideAreaSqM: +nominalArea.toFixed(2),
            outsideAreaSqM: 0,
            insidePercentage: 100,
            insideRingsUtm: [pCheck.cleanRingCCW],
            outsideRingsUtm: [],
            inscribedHalfPlotRectUtm: null,
            measuredBestSpanU: +frame.spanU.toFixed(2),
            measuredBestSpanV: +frame.spanV.toFixed(2),
            measuredDisplayDimensions: `${frame.spanU.toFixed(1)} × ${frame.spanV.toFixed(1)} m`,
            touchesRoadFrontage: true,
            isFullyContainedInBoundary: true,
            hasUnauthorizedOverlap: hasOverlap,
            overlappingPlotIds: overlappingIds,
            orientationCanonical: true,
            reasonSomali: warnMsg,
            warningsSomali: [warnMsg],
          };
          plotValidations[q.id] = rec;
          const nextP: GeneratedPlot = { ...q, full: false, halfPlotValidation: rec };
          allEvaluatedPlots.push(nextP);
          return nextP;
        }

        fullInsidePlotsCount++;
        blkFullCount++;
        const rec: PlotHalfValidationRecord = {
          plotId: q.id,
          blockId: blk.id,
          plotNumber: q.no,
          blockTotalPlots: blk.total,
          boundaryRelation: 'full_inside',
          validationStatus: 'full_inside',
          statusLabelSomali: HALF_PLOT_STATUS_METADATA.full_inside.labelSomali,
          expectedRule,
          nominalPlotAreaSqM: +nominalArea.toFixed(2),
          insideAreaSqM: +nominalArea.toFixed(2),
          outsideAreaSqM: 0,
          insidePercentage: 100,
          insideRingsUtm: [pCheck.cleanRingCCW],
          outsideRingsUtm: [],
          inscribedHalfPlotRectUtm: null,
          measuredBestSpanU: +frame.spanU.toFixed(2),
          measuredBestSpanV: +frame.spanV.toFixed(2),
          measuredDisplayDimensions: `${frame.spanU.toFixed(1)} × ${frame.spanV.toFixed(1)} m`,
          touchesRoadFrontage: true,
          isFullyContainedInBoundary: true,
          hasUnauthorizedOverlap: false,
          overlappingPlotIds: [],
          orientationCanonical: true,
          reasonSomali: `Plot buuxa oo 100% gudaha xuduudda dhulka ku jira (${nominalArea.toFixed(1)} m²).`,
          warningsSomali: [],
        };
        plotValidations[q.id] = rec;
        const nextP: GeneratedPlot = {
          ...q,
          full: true,
          calculatedAreaSqM: +nominalArea.toFixed(2),
          halfPlotValidation: rec,
        };
        fullPlots.push(nextP);
        allEvaluatedPlots.push(nextP);
        return nextP;
      }

      // 4. BOUNDARY CLIPPED PLOT (Xuduuddu goysay — Section 2.3, 2.4, 2.5)
      boundaryClippedPlotsCount++;
      blkClippedCount++;

      const outsideRings = computePlotOutsideRings(pCheck.cleanRingCCW, inter.insideRingsUtm);
      const measuredFit = measureBestAxisAlignedFitUV(frame, inter.insideRingsUtm);
      const measuredDisplay = `${measuredFit.bestU.toFixed(1)} × ${measuredFit.bestV.toFixed(1)} m`;
      const plotTris = triangulateSimplePolygonCCW(pCheck.cleanRingCCW);

      // Overlap check on clipped plot
      if (hasOverlap) {
        invalidHalfPlotsCount++;
        const msg = `Is-dul-saar aan la oggolayn ayaa lagala kulmay Plot ${overlappingIds.join(', ')} — Half Plot lama aqbali karo.`;
        const rec: PlotHalfValidationRecord = {
          plotId: q.id,
          blockId: blk.id,
          plotNumber: q.no,
          blockTotalPlots: blk.total,
          boundaryRelation: 'boundary_clipped',
          validationStatus: 'half_plot_invalid',
          statusLabelSomali: HALF_PLOT_STATUS_METADATA.half_plot_invalid.labelSomali,
          expectedRule,
          nominalPlotAreaSqM: +nominalArea.toFixed(2),
          insideAreaSqM: +insideArea.toFixed(2),
          outsideAreaSqM: +outsideArea.toFixed(2),
          insidePercentage: insidePct,
          insideRingsUtm: inter.insideRingsUtm,
          outsideRingsUtm: outsideRings,
          inscribedHalfPlotRectUtm: null,
          measuredBestSpanU: measuredFit.bestU,
          measuredBestSpanV: measuredFit.bestV,
          measuredDisplayDimensions: measuredDisplay,
          touchesRoadFrontage: false,
          isFullyContainedInBoundary: true,
          hasUnauthorizedOverlap: true,
          overlappingPlotIds: overlappingIds,
          orientationCanonical: false,
          reasonSomali: msg,
          warningsSomali: [msg],
        };
        plotValidations[q.id] = rec;
        const nextP: GeneratedPlot = { ...q, full: false, halfPlotValidation: rec };
        allEvaluatedPlots.push(nextP);
        return nextP;
      }

      // Non-10-plot block or missing plot number rule -> insufficient_data
      if (expectedRule.ruleCode === 'unknown') {
        insufficientDataPlotsCount++;
        const msg = `Block ${blk.id} wuxuu ka kooban yahay ${blk.total} Plot (ma aha 10-Plot caadi ah) ama lambarka Plot ${q.no} ma laha xeer Half Plot oo la ansixiyey.`;
        const rec: PlotHalfValidationRecord = {
          plotId: q.id,
          blockId: blk.id,
          plotNumber: q.no,
          blockTotalPlots: blk.total,
          boundaryRelation: 'boundary_clipped',
          validationStatus: 'insufficient_data',
          statusLabelSomali: HALF_PLOT_STATUS_METADATA.insufficient_data.labelSomali,
          expectedRule,
          nominalPlotAreaSqM: +nominalArea.toFixed(2),
          insideAreaSqM: +insideArea.toFixed(2),
          outsideAreaSqM: +outsideArea.toFixed(2),
          insidePercentage: insidePct,
          insideRingsUtm: inter.insideRingsUtm,
          outsideRingsUtm: outsideRings,
          inscribedHalfPlotRectUtm: null,
          measuredBestSpanU: measuredFit.bestU,
          measuredBestSpanV: measuredFit.bestV,
          measuredDisplayDimensions: measuredDisplay,
          touchesRoadFrontage: false,
          isFullyContainedInBoundary: true,
          hasUnauthorizedOverlap: false,
          overlappingPlotIds: [],
          orientationCanonical: false,
          reasonSomali: msg,
          warningsSomali: [msg],
        };
        plotValidations[q.id] = rec;
        const nextP: GeneratedPlot = { ...q, full: false, halfPlotValidation: rec };
        allEvaluatedPlots.push(nextP);
        return nextP;
      }

      // Area strictly less than 216 m² (Mandatory Test #9)
      if (insideArea < TARGET_HALF_PLOT_AREA_SQM - 0.12) {
        invalidHalfPlotsCount++;
        const msg = `Bedka gudaha ku hadhay (${insideArea.toFixed(2)} m²) wuu ka yar yahay bedka bartilmaameedka Half Plot-ka ee 216 m² (xeerka Plot ${q.no}: ${expectedRule.label}).`;
        const rec: PlotHalfValidationRecord = {
          plotId: q.id,
          blockId: blk.id,
          plotNumber: q.no,
          blockTotalPlots: blk.total,
          boundaryRelation: 'boundary_clipped',
          validationStatus: 'half_plot_invalid',
          statusLabelSomali: HALF_PLOT_STATUS_METADATA.half_plot_invalid.labelSomali,
          expectedRule,
          nominalPlotAreaSqM: +nominalArea.toFixed(2),
          insideAreaSqM: +insideArea.toFixed(2),
          outsideAreaSqM: +outsideArea.toFixed(2),
          insidePercentage: insidePct,
          insideRingsUtm: inter.insideRingsUtm,
          outsideRingsUtm: outsideRings,
          inscribedHalfPlotRectUtm: null,
          measuredBestSpanU: measuredFit.bestU,
          measuredBestSpanV: measuredFit.bestV,
          measuredDisplayDimensions: measuredDisplay,
          touchesRoadFrontage: false,
          isFullyContainedInBoundary: true,
          hasUnauthorizedOverlap: false,
          overlappingPlotIds: [],
          orientationCanonical: false,
          reasonSomali: msg,
          warningsSomali: [],
        };
        plotValidations[q.id] = rec;
        const nextP: GeneratedPlot = { ...q, full: false, halfPlotValidation: rec };
        allEvaluatedPlots.push(nextP);
        return nextP;
      }

      // Area >= 216 m² -> Now check EXACT Half Plot Dimensions, Shape, Orientation & Road Position!
      const canonicalFit = findExactInscribedHalfPlotRect(
        frame,
        inter.insideRingsUtm,
        plotTris,
        boundaryTris,
        expectedRule.canonicalSpanU,
        expectedRule.canonicalSpanV,
        roadEdges
      );

      if (canonicalFit.fits && canonicalFit.rectUtm) {
        const fragmented = inter.insideRingsUtm.length > 1;
        // Check if road frontage is accessible and geometry isn't fragmented or unverified CRS
        if (!canonicalFit.touchesRoad || fragmented || hasCrsWarning) {
          needsReviewPlotsCount++;
          const revReasons: string[] = [];
          if (!canonicalFit.touchesRoad) {
            revReasons.push(
              `Cabbirka ${expectedRule.label} (216 m²) wuu ku jiraa gudaha, laakiin boosku ma taabanayo waddada Block-ka.`
            );
          }
          if (fragmented) {
            revReasons.push(
              `Xuduuddu waxay Plot-ka u kala qaybisay ${inter.insideRingsUtm.length} cad oo kala go'an.`
            );
          }
          if (hasCrsWarning) {
            revReasons.push('CRS-ka faylka la soo geliyey wuxuu u baahan yahay xaqiijin.');
          }
          const msg = `${revReasons.join(' ')} Dib-u-eegis ayaa loo baahan yahay.`;
          const rec: PlotHalfValidationRecord = {
            plotId: q.id,
            blockId: blk.id,
            plotNumber: q.no,
            blockTotalPlots: blk.total,
            boundaryRelation: 'boundary_clipped',
            validationStatus: 'needs_review',
            statusLabelSomali: HALF_PLOT_STATUS_METADATA.needs_review.labelSomali,
            expectedRule,
            nominalPlotAreaSqM: +nominalArea.toFixed(2),
            insideAreaSqM: +insideArea.toFixed(2),
            outsideAreaSqM: +outsideArea.toFixed(2),
            insidePercentage: insidePct,
            insideRingsUtm: inter.insideRingsUtm,
            outsideRingsUtm: outsideRings,
            inscribedHalfPlotRectUtm: canonicalFit.rectUtm,
            measuredBestSpanU: Math.max(measuredFit.bestU, expectedRule.canonicalSpanU),
            measuredBestSpanV: Math.max(measuredFit.bestV, expectedRule.canonicalSpanV),
            measuredDisplayDimensions: `${Math.max(measuredFit.bestU, expectedRule.canonicalSpanU).toFixed(1)} × ${Math.max(measuredFit.bestV, expectedRule.canonicalSpanV).toFixed(1)} m`,
            touchesRoadFrontage: canonicalFit.touchesRoad,
            isFullyContainedInBoundary: true,
            hasUnauthorizedOverlap: false,
            overlappingPlotIds: [],
            orientationCanonical: true,
            reasonSomali: msg,
            warningsSomali: revReasons,
          };
          plotValidations[q.id] = rec;
          const nextP: GeneratedPlot = { ...q, full: false, halfPlotValidation: rec };
          allEvaluatedPlots.push(nextP);
          return nextP;
        }

        // VALID HALF PLOT! (Section 2.4 & 2.5: Half Plot wuu buuxiyey shuruudaha)
        validHalfPlotsCount++;
        blkValidHalfCount++;
        const msg = `Plot ${q.no} (${q.id}) wuu buuxiyey xeerka Half Plot-ka ee ${expectedRule.label} (216 m²): bedka gudaha ku hadhay waa ${insideArea.toFixed(2)} m², qaabka leydi ah, jihada saxda ah iyo marin-waddo oo dhammaystiran.`;
        const rec: PlotHalfValidationRecord = {
          plotId: q.id,
          blockId: blk.id,
          plotNumber: q.no,
          blockTotalPlots: blk.total,
          boundaryRelation: 'boundary_clipped',
          validationStatus: 'half_plot_valid',
          statusLabelSomali: HALF_PLOT_STATUS_METADATA.half_plot_valid.labelSomali,
          expectedRule,
          nominalPlotAreaSqM: +nominalArea.toFixed(2),
          insideAreaSqM: +insideArea.toFixed(2),
          outsideAreaSqM: +outsideArea.toFixed(2),
          insidePercentage: insidePct,
          insideRingsUtm: inter.insideRingsUtm,
          outsideRingsUtm: outsideRings,
          inscribedHalfPlotRectUtm: canonicalFit.rectUtm,
          measuredBestSpanU: Math.max(measuredFit.bestU, expectedRule.canonicalSpanU),
          measuredBestSpanV: Math.max(measuredFit.bestV, expectedRule.canonicalSpanV),
          measuredDisplayDimensions: `${Math.max(measuredFit.bestU, expectedRule.canonicalSpanU).toFixed(1)} × ${Math.max(measuredFit.bestV, expectedRule.canonicalSpanV).toFixed(1)} m`,
          touchesRoadFrontage: true,
          isFullyContainedInBoundary: true,
          hasUnauthorizedOverlap: false,
          overlappingPlotIds: [],
          orientationCanonical: true,
          reasonSomali: msg,
          warningsSomali: [],
        };
        plotValidations[q.id] = rec;
        const nextP: GeneratedPlot = {
          ...q,
          full: false,
          calculatedAreaSqM: TARGET_HALF_PLOT_AREA_SQM,
          halfPlotValidation: rec,
        };
        validHalfPlots.push(nextP);
        allEvaluatedPlots.push(nextP);
        return nextP;
      }

      // Canonical orientation did NOT fit!
      // Check if rotated orientation of the SAME rule (e.g. 12m × 18m instead of 18m × 12m on Plot 1/5/6/10) fits -> needs_review!
      // NOTE: Never swap 12×18 with 9×24 across plot numbers!
      const rotatedSameRuleFit = findExactInscribedHalfPlotRect(
        frame,
        inter.insideRingsUtm,
        plotTris,
        boundaryTris,
        expectedRule.canonicalSpanV,
        expectedRule.canonicalSpanU,
        roadEdges
      );

      if (rotatedSameRuleFit.fits && rotatedSameRuleFit.rectUtm) {
        needsReviewPlotsCount++;
        const msg = `Plot ${q.no} (${q.id}) wuxuu gudaha ku haystaa ${insideArea.toFixed(2)} m² oo qaadaysa ${expectedRule.label}, laakiin jihadeedu waa mid wareegsan (${expectedRule.canonicalSpanV}m ballac × ${expectedRule.canonicalSpanU}m qoto beddelkii ${expectedRule.canonicalSpanU}m × ${expectedRule.canonicalSpanV}m) — dib-u-eegis ayaa loo baahan yahay.`;
        const rec: PlotHalfValidationRecord = {
          plotId: q.id,
          blockId: blk.id,
          plotNumber: q.no,
          blockTotalPlots: blk.total,
          boundaryRelation: 'boundary_clipped',
          validationStatus: 'needs_review',
          statusLabelSomali: HALF_PLOT_STATUS_METADATA.needs_review.labelSomali,
          expectedRule,
          nominalPlotAreaSqM: +nominalArea.toFixed(2),
          insideAreaSqM: +insideArea.toFixed(2),
          outsideAreaSqM: +outsideArea.toFixed(2),
          insidePercentage: insidePct,
          insideRingsUtm: inter.insideRingsUtm,
          outsideRingsUtm: outsideRings,
          inscribedHalfPlotRectUtm: rotatedSameRuleFit.rectUtm,
          measuredBestSpanU: measuredFit.bestU,
          measuredBestSpanV: measuredFit.bestV,
          measuredDisplayDimensions: measuredDisplay,
          touchesRoadFrontage: rotatedSameRuleFit.touchesRoad,
          isFullyContainedInBoundary: true,
          hasUnauthorizedOverlap: false,
          overlappingPlotIds: [],
          orientationCanonical: false,
          reasonSomali: msg,
          warningsSomali: [msg],
        };
        plotValidations[q.id] = rec;
        const nextP: GeneratedPlot = { ...q, full: false, halfPlotValidation: rec };
        allEvaluatedPlots.push(nextP);
        return nextP;
      }

      // Check specifically if the OTHER plot group's dimension (9×24 vs 12×18) would have fit, to give an ultra-clear rejection message!
      const otherSpanU = expectedRule.ruleCode === '12x18' ? 9 : 18;
      const otherSpanV = expectedRule.ruleCode === '12x18' ? 24 : 12;
      const wrongRuleFit = findExactInscribedHalfPlotRect(
        frame,
        inter.insideRingsUtm,
        plotTris,
        boundaryTris,
        otherSpanU,
        otherSpanV,
        roadEdges
      );

      invalidHalfPlotsCount++;
      const wrongRuleNote = wrongRuleFit.fits
        ? ` Qaabka soo baxay (${otherSpanU} × ${otherSpanV} m) waa xeerka Plot kale — lama oggola in cabbirka 12 × 18 m lagu beddelo 9 × 24 m ama lidkeeda.`
        : '';

      const msg = `Inkasta oo bedka gudaha ku hadhay uu yahay ${insideArea.toFixed(2)} m² (≥ 216 m²), qaabka iyo cabbirka la helay (${measuredDisplay}) ma buuxin shuruudda Plot ${q.no} ee ${expectedRule.label}.${wrongRuleNote}`;

      const rec: PlotHalfValidationRecord = {
        plotId: q.id,
        blockId: blk.id,
        plotNumber: q.no,
        blockTotalPlots: blk.total,
        boundaryRelation: 'boundary_clipped',
        validationStatus: 'half_plot_invalid',
        statusLabelSomali: HALF_PLOT_STATUS_METADATA.half_plot_invalid.labelSomali,
        expectedRule,
        nominalPlotAreaSqM: +nominalArea.toFixed(2),
        insideAreaSqM: +insideArea.toFixed(2),
        outsideAreaSqM: +outsideArea.toFixed(2),
        insidePercentage: insidePct,
        insideRingsUtm: inter.insideRingsUtm,
        outsideRingsUtm: outsideRings,
        inscribedHalfPlotRectUtm: null,
        measuredBestSpanU: measuredFit.bestU,
        measuredBestSpanV: measuredFit.bestV,
        measuredDisplayDimensions: measuredDisplay,
        touchesRoadFrontage: false,
        isFullyContainedInBoundary: true,
        hasUnauthorizedOverlap: false,
        overlappingPlotIds: [],
        orientationCanonical: false,
        reasonSomali: msg,
        warningsSomali: wrongRuleNote ? [wrongRuleNote.trim()] : [],
      };
      plotValidations[q.id] = rec;
      const nextP: GeneratedPlot = { ...q, full: false, halfPlotValidation: rec };
      allEvaluatedPlots.push(nextP);
      return nextP;
    });

    const isFullInsideBlk =
      blkFullCount === blk.total &&
      blkClippedCount === 0 &&
      blkOutsideCount === 0 &&
      Math.abs(blkInter.insideAreaSqM - blkNominalArea) <= 0.25;

    if (isFullInsideBlk) fullInsideBlocksCount++;
    else boundaryClippedBlocksCount++;

    return {
      ...blk,
      nf: blkFullCount,
      complete: isFullInsideBlk,
      boundaryStatus: isFullInsideBlk
        ? ('full_inside' as const)
        : ('boundary_clipped' as const),
      insideBlockAreaSqM: +blkInter.insideAreaSqM.toFixed(2),
      validHalfPlotsInBlock: blkValidHalfCount,
      clippedPlotsInBlock: blkClippedCount,
      outsidePlotsInBlock: blkOutsideCount,
      plots: evaluatedPlots,
    };
  });

  const summary: HalfPlotValidationSummary = {
    totalEvaluatedBlocks: updatedBlocks.length,
    fullInsideBlocksCount,
    boundaryClippedBlocksCount,
    totalEvaluatedPlots: allEvaluatedPlots.length,
    fullInsidePlotsCount,
    fullOutsidePlotsCount,
    boundaryClippedPlotsCount,
    validHalfPlotsCount,
    invalidHalfPlotsCount,
    needsReviewPlotsCount,
    insufficientDataPlotsCount,
    overlappingPlotsCount,
    boundaryGeometryValid: boundaryCheck.valid,
    boundaryValidationWarnings: boundaryWarnings,
  };

  return {
    blocks: updatedBlocks,
    fullPlots,
    allEvaluatedPlots,
    validHalfPlots,
    plotValidations,
    summary,
  };
}

/**
 * Section 2.6 & Mandatory Test #11:
 * Builds a validation history snapshot comparing previous Plot validation outcomes
 * against newly recomputed outcomes when the land boundary or geometry changes,
 * preserving prior validation results for audit/review.
 */
export function buildHalfPlotValidationSnapshot(
  plotValidations: Record<string, PlotHalfValidationRecord>,
  summary: HalfPlotValidationSummary,
  boundaryLabel: string,
  boundaryAreaSqM: number,
  triggerReasonSomali: string,
  previousSnapshot?: HalfPlotValidationHistorySnapshot | null
): HalfPlotValidationHistorySnapshot {
  const plotStatusMap: HalfPlotValidationHistorySnapshot['plotStatusMap'] = {};
  const affectedPlotChanges: HalfPlotAffectedChangeItem[] = [];

  Object.values(plotValidations).forEach((rec) => {
    plotStatusMap[rec.plotId] = {
      status: rec.validationStatus,
      insideAreaSqM: rec.insideAreaSqM,
      expectedLabel: rec.expectedRule.label,
      reasonSomali: rec.reasonSomali,
    };

    if (previousSnapshot && previousSnapshot.plotStatusMap[rec.plotId]) {
      const prev = previousSnapshot.plotStatusMap[rec.plotId];
      if (
        prev.status !== rec.validationStatus ||
        Math.abs(prev.insideAreaSqM - rec.insideAreaSqM) > 0.1
      ) {
        affectedPlotChanges.push({
          plotId: rec.plotId,
          blockId: rec.blockId,
          plotNumber: rec.plotNumber,
          previousStatus: prev.status,
          newStatus: rec.validationStatus,
          previousInsideAreaSqM: prev.insideAreaSqM,
          newInsideAreaSqM: rec.insideAreaSqM,
          reasonSomali: rec.reasonSomali,
        });
      }
    }
  });

  // Also record plots that existed in previousSnapshot and dropped completely outside grid
  if (previousSnapshot) {
    Object.entries(previousSnapshot.plotStatusMap).forEach(([pid, prev]) => {
      if (!plotStatusMap[pid] && prev.status !== 'full_outside') {
        const m = /^(.+)-P(\d+)$/i.exec(pid);
        affectedPlotChanges.push({
          plotId: pid,
          blockId: m ? m[1] : '',
          plotNumber: m ? Number(m[2]) : 0,
          previousStatus: prev.status,
          newStatus: 'full_outside',
          previousInsideAreaSqM: prev.insideAreaSqM,
          newInsideAreaSqM: 0,
          reasonSomali: 'Xuduudda cusub darteed Plot-kani wuxuu u baxay dibadda.',
        });
      }
    });
  }

  return {
    id: `hp_snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    boundaryLabel,
    boundaryAreaSqM: +boundaryAreaSqM.toFixed(2),
    triggerReasonSomali,
    summary,
    affectedPlotChanges,
    plotStatusMap,
  };
}
