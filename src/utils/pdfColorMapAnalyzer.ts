import { GeneratedPlot } from '../types/landSubdivision';
import {
  PdfExtractedAssignmentDraft,
  PdfImportHeirOption,
  matchAssigneeNameToHeirOrSpecial,
} from './pdfInheritanceImportEngine';

export interface RgbaImageInput {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface VectorMapPlotPolygon {
  id: number;
  cx: number;
  cy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  area: number;
  hex: string;
  rgb: [number, number, number];
}

export interface VectorMapPageGeometry {
  pageWidth: number;
  pageHeight: number;
  detectedBlocksCount: number;
  plots: VectorMapPlotPolygon[];
}

export interface DetectedColorPlotGroup {
  colorId: string;
  hex: string;
  rgb: [number, number, number];
  colorNameSomali: string;
  legendLabel: string;
  detectedPlotCount: number;
  detectedBlockCount: number;
  matchedCadPlotIds: string[];
  role: 'heir' | 'excluded_non_heir' | 'ignore';
  matchedHeirKey: string;
  excludedLabel: string;
  notesSomali?: string;
}

export interface ColorMapAnalysisResult {
  detectedBlocksCount: number;
  detectedPlotsCount: number;
  cadPlotsCount: number;
  colorGroups: DetectedColorPlotGroup[];
  alignmentScorePct: number;
}

interface PlotBlob {
  id: number;
  areaPx: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
  rgb: [number, number, number];
  hex: string;
  estimatedPlots: number;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function describeRgbColorSomali([r, g, b]: [number, number, number]): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 510;

  if (max < 48 && delta < 28) return 'Madow (Black)';
  if (min > 215 && delta < 24) return 'Caddaan (White)';
  if (delta < 28) {
    if (lightness < 0.45) return 'Cawlan Madow (Dark Gray)';
    return 'Cawlan / Buluug-Cawlan (Gray-Blue)';
  }

  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  if (hue < 18 || hue >= 342) {
    if (max < 155) return 'Bunni / Maroon';
    if (min > 130) return 'Basali (Pink)';
    return 'Guduud (Red)';
  }
  if (hue < 44) return 'Liimi (Orange)';
  if (hue < 72) return 'Jaalle (Yellow)';
  if (hue < 165) return 'Cagaar (Green)';
  if (hue < 200) return 'Buluug-Cagaar (Cyan)';
  if (hue < 252) {
    if (min > 140) return 'Buluug Furan (Light Blue)';
    return 'Buluug (Blue)';
  }
  if (hue < 298) return 'Guduud-Buluug (Purple)';
  return 'Basali / Magenta (Pink)';
}

function colorDistancePerceptual(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  const satA = Math.max(...a) - Math.min(...a);
  const satB = Math.max(...b) - Math.min(...b);
  const lumA = (a[0] + a[1] + a[2]) / 3;
  const lumB = (b[0] + b[1] + b[2]) / 3;
  return Math.sqrt(2 * dr * dr + 3 * dg * dg + 2 * db * db) + 0.55 * Math.abs(satA - satB) + 0.35 * Math.abs(lumA - lumB);
}

/**
 * Pure RGBA Image Analyzer:
 * Detects solid-filled plot blobs (including solid Black plots while discarding thin 1-2px borders,
 * text labels, scale bars, and vertical Legend swatches), estimates Block count & per-color Plot count,
 * and spatially maps CAD Studio `cadPlots` onto detected PDF plot positions.
 */
export function analyzeColorMapFromRgba(
  image: RgbaImageInput,
  cadPlots: GeneratedPlot[],
  heirs: PdfImportHeirOption[]
): ColorMapAnalysisResult {
  const { width, height, data } = image;
  const totalPixels = width * height;
  if (width < 20 || height < 20 || data.length < totalPixels * 4) {
    return {
      detectedBlocksCount: 0,
      detectedPlotsCount: 0,
      cadPlotsCount: cadPlots.length,
      colorGroups: [],
      alignmentScorePct: 0,
    };
  }

  const isPaperOrEmpty = (idx4: number): boolean => {
    const a = data[idx4 + 3];
    if (a < 180) return true;
    const r = data[idx4];
    const g = data[idx4 + 1];
    const b = data[idx4 + 2];
    return r > 232 && g > 232 && b > 232;
  };

  // Mark interior pixels whose 4 cardinal neighbors (+/- 1px) share the same solid fill color.
  // This removes thin 1-2px plot borders, road outlines, legend text, and cyan streams,
  // while preserving solid plot interiors (including solid Black plots).
  const validMask = new Uint8Array(totalPixels);
  for (let y = 1; y < height - 1; y++) {
    const rowOff = y * width;
    for (let x = 1; x < width - 1; x++) {
      const p = rowOff + x;
      const i4 = p * 4;
      if (isPaperOrEmpty(i4)) continue;

      const r = data[i4];
      const g = data[i4 + 1];
      const b = data[i4 + 2];

      const n1 = (p - 1) * 4;
      const n2 = (p + 1) * 4;
      const n3 = (p - width) * 4;
      const n4 = (p + width) * 4;

      if (
        isPaperOrEmpty(n1) ||
        isPaperOrEmpty(n2) ||
        isPaperOrEmpty(n3) ||
        isPaperOrEmpty(n4)
      ) {
        continue;
      }

      const dMax = (o: number) =>
        Math.max(Math.abs(r - data[o]), Math.abs(g - data[o + 1]), Math.abs(b - data[o + 2]));

      if (dMax(n1) <= 30 && dMax(n2) <= 30 && dMax(n3) <= 30 && dMax(n4) <= 30) {
        validMask[p] = 1;
      }
    }
  }

  // BFS Connected Components on validMask, keeping uniform-color plot blobs separate
  const visited = new Uint8Array(totalPixels);
  const rawBlobs: PlotBlob[] = [];
  const queue = new Int32Array(totalPixels);
  let nextBlobId = 1;

  for (let start = 0; start < totalPixels; start++) {
    if (validMask[start] !== 1 || visited[start] === 1) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    const s4 = start * 4;
    const seedR = data[s4];
    const seedG = data[s4 + 1];
    const seedB = data[s4 + 2];

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumX = 0;
    let sumY = 0;
    let areaPx = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % width;
      const cy = (cur - cx) / width;
      const c4 = cur * 4;

      areaPx++;
      sumR += data[c4];
      sumG += data[c4 + 1];
      sumB += data[c4 + 2];
      sumX += cx;
      sumY += cy;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      const neighbors = [
        cx > 0 ? cur - 1 : -1,
        cx + 1 < width ? cur + 1 : -1,
        cy > 0 ? cur - width : -1,
        cy + 1 < height ? cur + width : -1,
      ];

      for (let k = 0; k < 4; k++) {
        const nb = neighbors[k];
        if (nb < 0 || validMask[nb] !== 1 || visited[nb] === 1) continue;
        const nb4 = nb * 4;
        const diff =
          Math.abs(data[nb4] - seedR) +
          Math.abs(data[nb4 + 1] - seedG) +
          Math.abs(data[nb4 + 2] - seedB);
        if (diff <= 54) {
          visited[nb] = 1;
          queue[tail++] = nb;
        }
      }
    }

    if (areaPx >= 10 && areaPx <= totalPixels * 0.06) {
      const rgb: [number, number, number] = [
        Math.round(sumR / areaPx),
        Math.round(sumG / areaPx),
        Math.round(sumB / areaPx),
      ];
      rawBlobs.push({
        id: nextBlobId++,
        areaPx,
        minX,
        maxX,
        minY,
        maxY,
        cx: sumX / areaPx,
        cy: sumY / areaPx,
        rgb,
        hex: rgbToHex(rgb[0], rgb[1], rgb[2]),
        estimatedPlots: 1,
      });
    }
  }

  if (rawBlobs.length === 0) {
    return {
      detectedBlocksCount: 0,
      detectedPlotsCount: 0,
      cadPlotsCount: cadPlots.length,
      colorGroups: [],
      alignmentScorePct: 0,
    };
  }

  // Determine typical plot area (65th percentile of blobs >= 16px²)
  const sortedAreas = rawBlobs
    .map((b) => b.areaPx)
    .filter((a) => a >= 16)
    .sort((a, b) => a - b);
  const refArea =
    sortedAreas.length > 0
      ? sortedAreas[Math.min(sortedAreas.length - 1, Math.floor(sortedAreas.length * 0.65))]
      : rawBlobs[0].areaPx;

  // Filter speckles and huge page-frame boxes
  let plotBlobs = rawBlobs.filter(
    (b) => b.areaPx >= Math.max(10, refArea * 0.14) && b.areaPx <= Math.max(400, refArea * 8.5)
  );

  // Filter out vertical corner Legend swatches (tightly stacked 1-column rectangles in bottom/top corner)
  const cornerBlobs = plotBlobs.filter(
    (b) =>
      (b.cx < width * 0.28 || b.cx > width * 0.72) &&
      (b.cy > height * 0.56 || b.cy < height * 0.24)
  );
  if (cornerBlobs.length >= 4) {
    const colBuckets = new Map<number, PlotBlob[]>();
    cornerBlobs.forEach((b) => {
      const xKey = Math.round(b.cx / 12) * 12;
      const arr = colBuckets.get(xKey) || [];
      arr.push(b);
      colBuckets.set(xKey, arr);
    });
    const legendIds = new Set<number>();
    colBuckets.forEach((col) => {
      if (col.length < 4) return;
      const sortedY = col.slice().sort((a, b) => a.cy - b.cy);
      const avgW = sortedY.reduce((s, b) => s + (b.maxX - b.minX + 1), 0) / sortedY.length;
      const avgH = sortedY.reduce((s, b) => s + (b.maxY - b.minY + 1), 0) / sortedY.length;
      // Legend boxes are compact horizontal bars stacked vertically at even spacing
      let tightSteps = 0;
      for (let i = 1; i < sortedY.length; i++) {
        const dy = sortedY[i].cy - sortedY[i - 1].cy;
        if (dy > 4 && dy <= Math.max(28, avgH * 3.2)) tightSteps++;
      }
      if (tightSteps >= 3 && avgW <= Math.max(36, Math.sqrt(refArea) * 1.45)) {
        // Confirm isolation from dense 2D plot grid (no wide neighbor at same Y inside column)
        const hasAdjacentFarmPlot = sortedY.some((lb) =>
          plotBlobs.some(
            (other) =>
              !sortedY.includes(other) &&
              Math.abs(other.cy - lb.cy) <= avgH * 1.2 &&
              Math.abs(other.cx - lb.cx) <= avgW * 2.1
          )
        );
        if (!hasAdjacentFarmPlot) {
          sortedY.forEach((lb) => legendIds.add(lb.id));
        }
      }
    });
    if (legendIds.size > 0 && plotBlobs.length - legendIds.size >= 4) {
      plotBlobs = plotBlobs.filter((b) => !legendIds.has(b.id));
    }
  }

  // Estimate merged adjacent plots if any blob exceeds ~1.7x typical full plot area
  plotBlobs.forEach((b) => {
    if (refArea > 20 && b.areaPx >= refArea * 1.68) {
      b.estimatedPlots = Math.max(2, Math.round(b.areaPx / refArea));
    } else {
      b.estimatedPlots = 1;
    }
  });

  // Cluster blobs spatially into Blocks using proximity threshold (~38% of plot pitch bridges 1-3px borders without crossing 15m roads)
  const plotPitch = Math.max(8, Math.sqrt(refArea));
  const blockGapTol = Math.max(4, plotPitch * 0.42);
  const blockIdOfBlob = new Int32Array(plotBlobs.length);
  let detectedBlocksCount = 0;
  for (let i = 0; i < plotBlobs.length; i++) {
    if (blockIdOfBlob[i] !== 0) continue;
    detectedBlocksCount++;
    const stack = [i];
    blockIdOfBlob[i] = detectedBlocksCount;
    while (stack.length > 0) {
      const u = stack.pop()!;
      const bu = plotBlobs[u];
      for (let v = 0; v < plotBlobs.length; v++) {
        if (blockIdOfBlob[v] !== 0) continue;
        const bv = plotBlobs[v];
        const dx = Math.max(0, bu.minX - bv.maxX, bv.minX - bu.maxX);
        const dy = Math.max(0, bu.minY - bv.maxY, bv.minY - bu.maxY);
        if (Math.hypot(dx, dy) <= blockGapTol) {
          blockIdOfBlob[v] = detectedBlocksCount;
          stack.push(v);
        }
      }
    }
  }

  // Cluster plot blobs into distinct Color Groups
  interface InternalCluster {
    sumR: number;
    sumG: number;
    sumB: number;
    weight: number;
    avgRgb: [number, number, number];
    blobs: Array<{ blob: PlotBlob; blockNum: number }>;
  }
  const clusters: InternalCluster[] = [];

  // Process largest-area blobs first so pure plot colors form stable cluster centroids
  const blobsByWeight = plotBlobs
    .map((blob, idx) => ({ blob, blockNum: blockIdOfBlob[idx] }))
    .sort((a, b) => b.blob.areaPx - a.blob.areaPx);

  for (const item of blobsByWeight) {
    let bestCluster: InternalCluster | null = null;
    let bestDist = Infinity;
    for (const cl of clusters) {
      const d = colorDistancePerceptual(item.blob.rgb, cl.avgRgb);
      if (d < 85 && d < bestDist) {
        bestDist = d;
        bestCluster = cl;
      }
    }
    if (bestCluster) {
      const w = item.blob.areaPx;
      bestCluster.sumR += item.blob.rgb[0] * w;
      bestCluster.sumG += item.blob.rgb[1] * w;
      bestCluster.sumB += item.blob.rgb[2] * w;
      bestCluster.weight += w;
      bestCluster.avgRgb = [
        Math.round(bestCluster.sumR / bestCluster.weight),
        Math.round(bestCluster.sumG / bestCluster.weight),
        Math.round(bestCluster.sumB / bestCluster.weight),
      ];
      bestCluster.blobs.push(item);
    } else {
      const w = item.blob.areaPx;
      clusters.push({
        sumR: item.blob.rgb[0] * w,
        sumG: item.blob.rgb[1] * w,
        sumB: item.blob.rgb[2] * w,
        weight: w,
        avgRgb: [...item.blob.rgb],
        blobs: [item],
      });
    }
  }

  // Build initial ColorGroups sorted by plot count descending
  const blobIdToColorIndex = new Map<number, number>();
  const colorGroups: DetectedColorPlotGroup[] = clusters
    .map((cl) => {
      const detectedPlotCount = cl.blobs.reduce((s, x) => s + x.blob.estimatedPlots, 0);
      const blockSet = new Set(cl.blobs.map((x) => x.blockNum));
      const hex = rgbToHex(cl.avgRgb[0], cl.avgRgb[1], cl.avgRgb[2]);
      const nameSo = describeRgbColorSomali(cl.avgRgb);
      return {
        cl,
        detectedPlotCount,
        detectedBlockCount: blockSet.size,
        hex,
        nameSo,
      };
    })
    .sort((a, b) => b.detectedPlotCount - a.detectedPlotCount)
    .map((entry, idx) => {
      entry.cl.blobs.forEach((b) => blobIdToColorIndex.set(b.blob.id, idx));
      const isDarkBlack =
        entry.cl.avgRgb[0] < 42 && entry.cl.avgRgb[1] < 42 && entry.cl.avgRgb[2] < 42;
      return {
        colorId: `color-${idx + 1}`,
        hex: entry.hex,
        rgb: entry.cl.avgRgb,
        colorNameSomali: entry.nameSo,
        legendLabel: entry.nameSo,
        detectedPlotCount: entry.detectedPlotCount,
        detectedBlockCount: entry.detectedBlockCount,
        matchedCadPlotIds: [],
        role: isDarkBlack ? 'excluded_non_heir' : 'heir',
        matchedHeirKey: '',
        excludedLabel: isDarkBlack ? 'Danguud / Reeban (Madow)' : 'Danguud / Reeban',
      };
    });

  // Match CAD Studio plots spatially onto detected PDF plot blobs
  let alignmentScorePct = 0;
  if (cadPlots.length > 0 && plotBlobs.length > 0) {
    let pxMin = Infinity;
    let pxMax = -Infinity;
    let pyMin = Infinity;
    let pyMax = -Infinity;
    plotBlobs.forEach((b) => {
      if (b.minX < pxMin) pxMin = b.minX;
      if (b.maxX > pxMax) pxMax = b.maxX;
      if (b.minY < pyMin) pyMin = b.minY;
      if (b.maxY > pyMax) pyMax = b.maxY;
    });
    const pSpanX = Math.max(1, pxMax - pxMin);
    const pSpanY = Math.max(1, pyMax - pyMin);

    let uxMin = Infinity;
    let uxMax = -Infinity;
    let uyMin = Infinity;
    let uyMax = -Infinity;
    cadPlots.forEach((p) => {
      const [ux, uy] = p.centerUtm;
      if (ux < uxMin) uxMin = ux;
      if (ux > uxMax) uxMax = ux;
      if (uy < uyMin) uyMin = uy;
      if (uy > uyMax) uyMax = uy;
    });
    const uSpanX = Math.max(1, uxMax - uxMin);
    const uSpanY = Math.max(1, uyMax - uyMin);

    // Build fast pixel lookup from interior mask + blob id? Even simpler: direct nearest-blob lookup + slight shift calibration
    const shifts = [-0.025, 0, 0.025];
    let bestOffset: { dx: number; dy: number; hits: number } = { dx: 0, dy: 0, hits: -1 };
    const snapRadius = Math.max(10, plotPitch * 0.95);

    const sampleBlobForCoord = (ix: number, iy: number): PlotBlob | null => {
      // First prefer blob whose bounding box strictly contains (ix, iy)
      let bestCont: PlotBlob | null = null;
      let bestContDist = Infinity;
      for (const b of plotBlobs) {
        if (ix >= b.minX - 2 && ix <= b.maxX + 2 && iy >= b.minY - 2 && iy <= b.maxY + 2) {
          const d = Math.hypot(ix - b.cx, iy - b.cy);
          if (d < bestContDist) {
            bestContDist = d;
            bestCont = b;
          }
        }
      }
      if (bestCont) return bestCont;

      // Nearest blob centroid within snapRadius
      let nearest: PlotBlob | null = null;
      let nearestD = snapRadius;
      for (const b of plotBlobs) {
        const d = Math.hypot(ix - b.cx, iy - b.cy);
        if (d < nearestD) {
          nearestD = d;
          nearest = b;
        }
      }
      return nearest;
    };

    // Subsample up to 140 CAD plots to calibrate any slight 2.5% margin offset rapidly
    const stride = Math.max(1, Math.floor(cadPlots.length / 140));
    for (const dx of shifts) {
      for (const dy of shifts) {
        let hits = 0;
        for (let i = 0; i < cadPlots.length; i += stride) {
          const p = cadPlots[i];
          const nx = (p.centerUtm[0] - uxMin) / uSpanX + dx;
          const ny = (uyMax - p.centerUtm[1]) / uSpanY + dy;
          const ix = pxMin + nx * pSpanX;
          const iy = pyMin + ny * pSpanY;
          if (sampleBlobForCoord(ix, iy)) hits++;
        }
        if (hits > bestOffset.hits) {
          bestOffset = { dx, dy, hits };
        }
      }
    }

    let matchedTotal = 0;
    cadPlots.forEach((p) => {
      const nx = (p.centerUtm[0] - uxMin) / uSpanX + bestOffset.dx;
      const ny = (uyMax - p.centerUtm[1]) / uSpanY + bestOffset.dy;
      const ix = pxMin + nx * pSpanX;
      const iy = pyMin + ny * pSpanY;
      const hitBlob = sampleBlobForCoord(ix, iy);
      if (hitBlob) {
        const grpIdx = blobIdToColorIndex.get(hitBlob.id);
        if (grpIdx !== undefined && colorGroups[grpIdx]) {
          colorGroups[grpIdx].matchedCadPlotIds.push(p.id);
          matchedTotal++;
        }
      }
    });

    alignmentScorePct = Math.round((matchedTotal / Math.max(1, cadPlots.length)) * 100);
  }

  // Try matching color hex against existing heirs if no legend text matched yet
  colorGroups.forEach((cg) => {
    if (cg.role !== 'heir' || heirs.length === 0) return;
    let bestHeir: PdfImportHeirOption | null = null;
    let bestDist = 70;
    heirs.forEach((h) => {
      const hRgb = hexToRgb(h.colorHex);
      if (!hRgb) return;
      const d = colorDistancePerceptual(cg.rgb, hRgb);
      if (d < bestDist) {
        bestDist = d;
        bestHeir = h;
      }
    });
    if (bestHeir) {
      cg.matchedHeirKey = (bestHeir as PdfImportHeirOption).heirKey;
    }
  });

  const detectedPlotsCount = plotBlobs.reduce((s, b) => s + b.estimatedPlots, 0);

  return {
    detectedBlocksCount,
    detectedPlotsCount,
    cadPlotsCount: cadPlots.length,
    colorGroups,
    alignmentScorePct,
  };
}

export interface PdfOperatorListLike {
  fnArray: number[] | ArrayLike<number>;
  argsArray: unknown[] | ArrayLike<unknown>;
}

export interface PdfViewportLike {
  width: number;
  height: number;
  transform: number[];
}

export interface PdfOpsLike {
  save: number;
  restore: number;
  transform: number;
  setFillRGBColor: number;
  setFillGray?: number;
  constructPath: number;
  eoFillStroke: number;
  fillStroke: number;
  fill: number;
  eoFill: number;
}

function mulAffine2D(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function parsePdfFillColorToRgb(
  args: unknown[],
  isGray = false
): { hex: string; rgb: [number, number, number] } | null {
  const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (rgb: [number, number, number]) =>
    '#' + rgb.map((n) => clampByte(n).toString(16).padStart(2, '0')).join('').toUpperCase();

  if (isGray) {
    const raw = Number(args?.[0]);
    if (!Number.isFinite(raw)) return null;
    const g = raw <= 1 ? clampByte(raw * 255) : clampByte(raw);
    const rgb: [number, number, number] = [g, g, g];
    return { hex: toHex(rgb), rgb };
  }

  if (typeof args?.[0] === 'string') {
    const clean = args[0].trim().replace('#', '');
    if (/^[0-9a-fA-F]{6}$/.test(clean)) {
      const rgb: [number, number, number] = [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16),
      ];
      return { hex: `#${clean.toUpperCase()}`, rgb };
    }
  }

  const vals: number[] =
    args.length >= 3
      ? [Number(args[0]), Number(args[1]), Number(args[2])]
      : Array.isArray(args[0]) && args[0].length >= 3
      ? [Number(args[0][0]), Number(args[0][1]), Number(args[0][2])]
      : args[0] &&
        typeof args[0] === 'object' &&
        'length' in (args[0] as ArrayLike<number>) &&
        (args[0] as ArrayLike<number>).length >= 3
      ? [
          Number((args[0] as ArrayLike<number>)[0]),
          Number((args[0] as ArrayLike<number>)[1]),
          Number((args[0] as ArrayLike<number>)[2]),
        ]
      : [];

  if (vals.length === 3 && vals.every((n) => Number.isFinite(n))) {
    const maxV = Math.max(...vals);
    const rgb: [number, number, number] =
      maxV <= 1
        ? [clampByte(vals[0] * 255), clampByte(vals[1] * 255), clampByte(vals[2] * 255)]
        : [clampByte(vals[0]), clampByte(vals[1]), clampByte(vals[2])];
    return { hex: toHex(rgb), rgb };
  }
  return null;
}

/**
 * Extracts exact vector Block and Plot polygons (and their painted fill colors) directly
 * from a PDF page's `getOperatorList()`. Immune to stream lines, dashed overlays, or
 * diagonal cross-hatching because GIS CAD layers emit clean closed `constructPath` bboxes
 * under nested CTM transforms and painter's order.
 */
export function extractVectorMapGeometryFromOperatorList(
  opList: PdfOperatorListLike,
  viewport: PdfViewportLike,
  OPS: PdfOpsLike
): VectorMapPageGeometry {
  const vpW = Math.max(1, viewport.width);
  const vpH = Math.max(1, viewport.height);
  const pageArea = vpW * vpH;
  const minPolyArea = Math.max(4, pageArea * 0.00001);

  interface RawVectorPoly {
    cx: number;
    cy: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
    area: number;
    hex: string;
    rgb: [number, number, number];
  }

  const stack: Array<{ ctm: number[]; hex: string; rgb: [number, number, number] }> = [];
  let ctm = [...viewport.transform];
  let fillHex = '#000000';
  let fillRgb: [number, number, number] = [0, 0, 0];

  const strokedPolys: RawVectorPoly[] = [];
  const unstrokedPolys: RawVectorPoly[] = [];

  const fnLen = opList.fnArray.length;
  for (let i = 0; i < fnLen; i++) {
    const fn = opList.fnArray[i];
    const args = (opList.argsArray[i] as unknown[]) || [];

    if (fn === OPS.save) {
      stack.push({ ctm: [...ctm], hex: fillHex, rgb: [...fillRgb] });
    } else if (fn === OPS.restore) {
      const prev = stack.pop();
      if (prev) {
        ctm = prev.ctm;
        fillHex = prev.hex;
        fillRgb = prev.rgb;
      }
    } else if (fn === OPS.transform && args.length >= 6) {
      ctm = mulAffine2D(ctm, args.slice(0, 6).map(Number));
    } else if (fn === OPS.setFillRGBColor) {
      const parsed = parsePdfFillColorToRgb(args, false);
      if (parsed) {
        fillHex = parsed.hex;
        fillRgb = parsed.rgb;
      }
    } else if (OPS.setFillGray !== undefined && fn === OPS.setFillGray) {
      const parsed = parsePdfFillColorToRgb(args, true);
      if (parsed) {
        fillHex = parsed.hex;
        fillRgb = parsed.rgb;
      }
    } else if (fn === OPS.constructPath && args.length >= 3) {
      const drawOp = Number(args[0]);
      const isStrokedFill = drawOp === OPS.eoFillStroke || drawOp === OPS.fillStroke;
      const isUnstrokedFill = drawOp === OPS.fill || drawOp === OPS.eoFill;
      if (!isStrokedFill && !isUnstrokedFill) continue;

      const bbox = args[2] as ArrayLike<number> | null | undefined;
      if (!bbox || bbox.length < 4) continue;
      const x0 = Number(bbox[0]);
      const y0 = Number(bbox[1]);
      const x1 = Number(bbox[2]);
      const y1 = Number(bbox[3]);
      if (![x0, y0, x1, y1].every(Number.isFinite)) continue;

      const corners: Array<[number, number]> = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ];
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let c = 0; c < 4; c++) {
        const tx = ctm[0] * corners[c][0] + ctm[2] * corners[c][1] + ctm[4];
        const ty = ctm[1] * corners[c][0] + ctm[3] * corners[c][1] + ctm[5];
        if (tx < minX) minX = tx;
        if (tx > maxX) maxX = tx;
        if (ty < minY) minY = ty;
        if (ty > maxY) maxY = ty;
      }
      const w = maxX - minX;
      const h = maxY - minY;
      const area = w * h;
      if (area <= minPolyArea || area >= pageArea * 0.25) continue;

      const poly: RawVectorPoly = {
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
        minX,
        maxX,
        minY,
        maxY,
        width: w,
        height: h,
        area,
        hex: fillHex,
        rgb: [...fillRgb],
      };

      if (isStrokedFill) {
        strokedPolys.push(poly);
      } else {
        unstrokedPolys.push(poly);
      }
    }
  }

  // GIS CAD plots nearly always use filled+stroked paths; vector glyph text uses unstroked fill.
  const sourcePolys =
    strokedPolys.length >= 8 ? strokedPolys : strokedPolys.length > 0 ? strokedPolys : unstrokedPolys;
  if (sourcePolys.length === 0) {
    return { pageWidth: vpW, pageHeight: vpH, detectedBlocksCount: 0, plots: [] };
  }

  const sortedAreas = sourcePolys.map((p) => p.area).sort((a, b) => a - b);
  const medianArea = sortedAreas[Math.floor(sortedAreas.length * 0.5)] || 100;
  const plotPitch = Math.max(4, Math.sqrt(medianArea));

  // Separate Blocks (> 3x plot median area) vs Plots (<= 3x plot median area)
  const rawBlocks = sourcePolys.filter((p) => p.area > medianArea * 3.0);
  const blockDedupTol = plotPitch * 0.6;
  const dedupBlocks: RawVectorPoly[] = [];
  for (const b of rawBlocks) {
    const dupIdx = dedupBlocks.findIndex((u) => Math.hypot(u.cx - b.cx, u.cy - b.cy) < blockDedupTol);
    if (dupIdx >= 0) dedupBlocks[dupIdx] = b;
    else dedupBlocks.push(b);
  }

  const rawPlots = sourcePolys.filter(
    (p) => p.area <= medianArea * 3.0 && p.area >= medianArea * 0.05
  );

  // Painter's order deduplication on plots (last painted color wins when base gray + colored layer overlap)
  const dedupTol = Math.max(2, plotPitch * 0.35);
  const uniquePlots: RawVectorPoly[] = [];
  for (const p of rawPlots) {
    const dupIdx = uniquePlots.findIndex((u) => Math.hypot(u.cx - p.cx, u.cy - p.cy) < dedupTol);
    if (dupIdx >= 0) uniquePlots[dupIdx] = p;
    else uniquePlots.push(p);
  }

  // Filter out vertical corner Legend swatches (tightly stacked distinct-color rectangles in page margins)
  const cornerPolys = uniquePlots.filter(
    (p) =>
      (p.cx < vpW * 0.26 || p.cx > vpW * 0.74) &&
      (p.cy < vpH * 0.30 || p.cy > vpH * 0.65)
  );
  const legendSet = new Set<RawVectorPoly>();
  if (cornerPolys.length >= 4) {
    const colBuckets = new Map<string, RawVectorPoly[]>();
    for (const p of cornerPolys) {
      const key = `${Math.round((p.cx / vpW) * 200)}:${Math.round((p.width / vpW) * 250)}:${Math.round(
        (p.height / vpH) * 250
      )}`;
      const arr = colBuckets.get(key) || [];
      arr.push(p);
      colBuckets.set(key, arr);
    }
    colBuckets.forEach((arr) => {
      if (arr.length < 4 || arr.length > 30) return;
      const uniqColors = new Set(arr.map((x) => x.hex));
      if (uniqColors.size < Math.ceil(arr.length * 0.65)) return;

      const sortedY = arr.slice().sort((a, b) => a.cy - b.cy);
      const avgW = sortedY.reduce((s, x) => s + x.width, 0) / sortedY.length;
      const avgH = sortedY.reduce((s, x) => s + x.height, 0) / sortedY.length;
      let tightSteps = 0;
      for (let i = 1; i < sortedY.length; i++) {
        const dy = sortedY[i].cy - sortedY[i - 1].cy;
        if (dy > avgH * 0.4 && dy <= Math.max(vpH * 0.028, avgH * 3.8)) {
          tightSteps++;
        }
      }
      const hasAdjacentPlot = sortedY.some((lb) =>
        uniquePlots.some(
          (other) =>
            !sortedY.includes(other) &&
            Math.abs(other.cy - lb.cy) <= avgH * 1.1 &&
            Math.abs(other.cx - lb.cx) <= avgW * 2.1
        )
      );
      if (tightSteps >= sortedY.length - 2 && !hasAdjacentPlot) {
        sortedY.forEach((lb) => legendSet.add(lb));
      }
    });
  }

  const finalPlots: VectorMapPlotPolygon[] = uniquePlots
    .filter((p) => !legendSet.has(p))
    .map((p, idx) => ({
      id: idx + 1,
      cx: p.cx,
      cy: p.cy,
      minX: p.minX,
      maxX: p.maxX,
      minY: p.minY,
      maxY: p.maxY,
      width: p.width,
      height: p.height,
      area: p.area,
      hex: p.hex,
      rgb: p.rgb,
    }));

  return {
    pageWidth: vpW,
    pageHeight: vpH,
    detectedBlocksCount: dedupBlocks.length,
    plots: finalPlots,
  };
}

/**
 * Exact Vector PDF Map Analyzer:
 * Consumes deduplicated plot polygons extracted directly from PDF `constructPath` + `setFillRGBColor`
 * operator streams (immune to stream lines, cross-hatching, and thin borders), clusters plots into
 * Blocks & distinct ColorGroups, and maps every plot onto CAD Studio `cadPlots`.
 */
export function analyzeColorMapFromVectorGeometry(
  vectorGeom: VectorMapPageGeometry,
  cadPlots: GeneratedPlot[],
  heirs: PdfImportHeirOption[]
): ColorMapAnalysisResult {
  const plots = vectorGeom.plots || [];
  if (plots.length === 0) {
    return {
      detectedBlocksCount: vectorGeom.detectedBlocksCount || 0,
      detectedPlotsCount: 0,
      cadPlotsCount: cadPlots.length,
      colorGroups: [],
      alignmentScorePct: 0,
    };
  }

  const areas = plots.map((p) => p.area).sort((a, b) => a - b);
  const medianArea = areas[Math.floor(areas.length * 0.5)] || 100;
  const plotPitch = Math.max(4, Math.sqrt(medianArea));

  // Cluster contiguous vector plots into Blocks using rotation-invariant centroid distance (bridging touching plots inside a block, never crossing 15m roads)
  const blockCentroidTol = plotPitch * 1.25;
  const blockIdOfPlot = new Int32Array(plots.length);
  let clusteredBlocksCount = 0;
  for (let i = 0; i < plots.length; i++) {
    if (blockIdOfPlot[i] !== 0) continue;
    clusteredBlocksCount++;
    const stack = [i];
    blockIdOfPlot[i] = clusteredBlocksCount;
    while (stack.length > 0) {
      const u = stack.pop()!;
      const pu = plots[u];
      for (let v = 0; v < plots.length; v++) {
        if (blockIdOfPlot[v] !== 0) continue;
        const pv = plots[v];
        if (Math.hypot(pu.cx - pv.cx, pu.cy - pv.cy) <= blockCentroidTol) {
          blockIdOfPlot[v] = clusteredBlocksCount;
          stack.push(v);
        }
      }
    }
  }
  const detectedBlocksCount =
    vectorGeom.detectedBlocksCount > 0 ? vectorGeom.detectedBlocksCount : clusteredBlocksCount;

  // Group vector plots by exact/tight Color cluster (dist < 22 keeps exact vector shades cleanly distinct)
  interface VectorColorCluster {
    hex: string;
    rgb: [number, number, number];
    items: Array<{ plot: VectorMapPlotPolygon; blockNum: number }>;
  }
  const clusters: VectorColorCluster[] = [];
  plots.forEach((plot, idx) => {
    const blockNum = blockIdOfPlot[idx];
    const existing = clusters.find(
      (c) => c.hex === plot.hex || colorDistancePerceptual(c.rgb, plot.rgb) < 22
    );
    if (existing) {
      existing.items.push({ plot, blockNum });
    } else {
      clusters.push({
        hex: plot.hex,
        rgb: [...plot.rgb],
        items: [{ plot, blockNum }],
      });
    }
  });

  const plotIdToColorIndex = new Map<number, number>();
  const colorGroups: DetectedColorPlotGroup[] = clusters
    .map((cl) => ({
      cl,
      detectedPlotCount: cl.items.length,
      detectedBlockCount: new Set(cl.items.map((x) => x.blockNum)).size,
      nameSo: describeRgbColorSomali(cl.rgb),
    }))
    .sort((a, b) => b.detectedPlotCount - a.detectedPlotCount)
    .map((entry, idx) => {
      entry.cl.items.forEach((it) => plotIdToColorIndex.set(it.plot.id, idx));
      const [r, g, b] = entry.cl.rgb;
      const isPaperWhite = r > 240 && g > 240 && b > 240;
      const isDarkBlack = r < 35 && g < 35 && b < 35;
      return {
        colorId: `color-${idx + 1}`,
        hex: entry.cl.hex,
        rgb: entry.cl.rgb,
        colorNameSomali: entry.nameSo,
        legendLabel: isPaperWhite ? 'Caddaan (Banaan)' : entry.nameSo,
        detectedPlotCount: entry.detectedPlotCount,
        detectedBlockCount: entry.detectedBlockCount,
        matchedCadPlotIds: [],
        role: isPaperWhite ? 'ignore' : 'heir',
        matchedHeirKey: '',
        excludedLabel: isDarkBlack ? 'Danguud / Reeban (Madow)' : 'Danguud / Reeban',
      };
    });

  // Spatially align vector plots onto CAD Studio `cadPlots`
  let alignmentScorePct = 0;
  if (cadPlots.length > 0 && plots.length > 0) {
    let pxMin = Infinity;
    let pxMax = -Infinity;
    let pyMin = Infinity;
    let pyMax = -Infinity;
    plots.forEach((p) => {
      if (p.minX < pxMin) pxMin = p.minX;
      if (p.maxX > pxMax) pxMax = p.maxX;
      if (p.minY < pyMin) pyMin = p.minY;
      if (p.maxY > pyMax) pyMax = p.maxY;
    });
    const pSpanX = Math.max(1, pxMax - pxMin);
    const pSpanY = Math.max(1, pyMax - pyMin);

    let uxMin = Infinity;
    let uxMax = -Infinity;
    let uyMin = Infinity;
    let uyMax = -Infinity;
    cadPlots.forEach((p) => {
      const [ux, uy] = p.centerUtm;
      if (ux < uxMin) uxMin = ux;
      if (ux > uxMax) uxMax = ux;
      if (uy < uyMin) uyMin = uy;
      if (uy > uyMax) uyMax = uy;
    });
    const uSpanX = Math.max(1, uxMax - uxMin);
    const uSpanY = Math.max(1, uyMax - uyMin);

    const snapRadius = Math.max(6, plotPitch * 0.95);
    const samplePoly = (ix: number, iy: number): VectorMapPlotPolygon | null => {
      let bestCont: VectorMapPlotPolygon | null = null;
      let bestDist = Infinity;
      for (const vp of plots) {
        if (ix >= vp.minX - 1 && ix <= vp.maxX + 1 && iy >= vp.minY - 1 && iy <= vp.maxY + 1) {
          const d = Math.hypot(ix - vp.cx, iy - vp.cy);
          if (d < bestDist) {
            bestDist = d;
            bestCont = vp;
          }
        }
      }
      if (bestCont) return bestCont;

      let nearest: VectorMapPlotPolygon | null = null;
      let nearestD = snapRadius;
      for (const vp of plots) {
        const d = Math.hypot(ix - vp.cx, iy - vp.cy);
        if (d < nearestD) {
          nearestD = d;
          nearest = vp;
        }
      }
      return nearest;
    };

    const shifts = [-0.02, 0, 0.02];
    let bestOffset = { dx: 0, dy: 0, hits: -1 };
    const stride = Math.max(1, Math.floor(cadPlots.length / 150));
    for (const dx of shifts) {
      for (const dy of shifts) {
        let hits = 0;
        for (let i = 0; i < cadPlots.length; i += stride) {
          const p = cadPlots[i];
          const nx = (p.centerUtm[0] - uxMin) / uSpanX + dx;
          const ny = (uyMax - p.centerUtm[1]) / uSpanY + dy;
          if (samplePoly(pxMin + nx * pSpanX, pyMin + ny * pSpanY)) hits++;
        }
        if (hits > bestOffset.hits) {
          bestOffset = { dx, dy, hits };
        }
      }
    }

    let matchedTotal = 0;
    cadPlots.forEach((p) => {
      const nx = (p.centerUtm[0] - uxMin) / uSpanX + bestOffset.dx;
      const ny = (uyMax - p.centerUtm[1]) / uSpanY + bestOffset.dy;
      const hitPoly = samplePoly(pxMin + nx * pSpanX, pyMin + ny * pSpanY);
      if (hitPoly) {
        const grpIdx = plotIdToColorIndex.get(hitPoly.id);
        if (grpIdx !== undefined && colorGroups[grpIdx]) {
          colorGroups[grpIdx].matchedCadPlotIds.push(p.id);
          matchedTotal++;
        }
      }
    });
    alignmentScorePct = Math.round((matchedTotal / Math.max(1, cadPlots.length)) * 100);
  }

  // Try matching color hex against existing heirs
  colorGroups.forEach((cg) => {
    if (cg.role !== 'heir' || heirs.length === 0) return;
    let bestHeir: PdfImportHeirOption | null = null;
    let bestDist = 70;
    heirs.forEach((h) => {
      const hRgb = hexToRgb(h.colorHex);
      if (!hRgb) return;
      const d = colorDistancePerceptual(cg.rgb, hRgb);
      if (d < bestDist) {
        bestDist = d;
        bestHeir = h;
      }
    });
    if (bestHeir) {
      cg.matchedHeirKey = (bestHeir as PdfImportHeirOption).heirKey;
    }
  });

  return {
    detectedBlocksCount,
    detectedPlotsCount: plots.length,
    cadPlotsCount: cadPlots.length,
    colorGroups,
    alignmentScorePct,
  };
}

/**
 * Browser helper: decodes a rendered PDF/Scan dataUrl onto an offscreen canvas (max 960px)
 * and runs `analyzeColorMapFromRgba`.
 */
export async function analyzeColoredMapDataUrl(
  previewDataUrl: string,
  cadPlots: GeneratedPlot[],
  heirs: PdfImportHeirOption[]
): Promise<ColorMapAnalysisResult> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Sawirka lama akhrin karin.'));
    el.src = previewDataUrl;
  });

  const maxSide = 960;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context lama helin.');
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  return analyzeColorMapFromRgba(
    { width: w, height: h, data: imgData.data },
    cadPlots,
    heirs
  );
}

/**
 * Merges Gemini Vision's fast Legend labels onto the pixel-detected ColorGroups
 * and auto-links Legend heir names (e.g. Shamis, Xassan Cige, Cabdi Cige, Xaliimo)
 * + suggested non-heir colors.
 */
export function mergeAiLegendLabelsIntoColorGroups(
  groups: DetectedColorPlotGroup[],
  legendItems: Array<{
    legendLabel: string;
    colorHex?: string;
    colorNameSomali?: string;
    estimatedPlotsCount?: number;
    looksLikeNonHeir?: boolean;
  }>,
  heirs: PdfImportHeirOption[]
): DetectedColorPlotGroup[] {
  if (!legendItems || legendItems.length === 0) return groups;

  return groups.map((grp) => {
    let bestLegend: (typeof legendItems)[number] | null = null;
    let bestScore = Infinity;

    legendItems.forEach((li) => {
      const liRgb = li.colorHex ? hexToRgb(li.colorHex) : null;
      if (liRgb) {
        const d = colorDistancePerceptual(grp.rgb, liRgb);
        if (d < 125 && d < bestScore) {
          bestScore = d;
          bestLegend = li;
        }
      }
    });

    if (!bestLegend) return grp;
    const label = (bestLegend as { legendLabel: string }).legendLabel?.trim() || grp.legendLabel;
    const looksNonHeir = Boolean((bestLegend as { looksLikeNonHeir?: boolean }).looksLikeNonHeir);
    const nameMatch = matchAssigneeNameToHeirOrSpecial(label, heirs, looksNonHeir);

    if (looksNonHeir || nameMatch.assigneeType === 'excluded_custom' && nameMatch.matchedCleanly) {
      return {
        ...grp,
        legendLabel: label,
        role: 'excluded_non_heir',
        matchedHeirKey: '',
        excludedLabel: nameMatch.assigneeName || label || 'Danguud / Reeban',
      };
    }

    return {
      ...grp,
      legendLabel: label,
      colorNameSomali:
        (bestLegend as { colorNameSomali?: string }).colorNameSomali || grp.colorNameSomali,
      role:
        nameMatch.assigneeType === 'heir' && nameMatch.matchedHeirKey
          ? 'heir'
          : grp.role,
      matchedHeirKey:
        nameMatch.assigneeType === 'heir' && nameMatch.matchedHeirKey
          ? nameMatch.matchedHeirKey
          : grp.matchedHeirKey,
    };
  });
}

/**
 * Converts verified Color Groups (after the user marked non-heir colors and assigned heirs)
 * into plot-level `PdfExtractedAssignmentDraft[]` rows ready for CAD Studio commit.
 */
export function expandColorGroupsToAssignmentDrafts(
  colorGroups: DetectedColorPlotGroup[],
  heirs: PdfImportHeirOption[]
): PdfExtractedAssignmentDraft[] {
  const heirMap = new Map(heirs.map((h) => [h.heirKey, h]));
  const rows: PdfExtractedAssignmentDraft[] = [];
  let rowNum = 1;

  colorGroups.forEach((grp) => {
    if (grp.role === 'ignore') return;
    const targetPlotIds = grp.matchedCadPlotIds;
    if (targetPlotIds.length === 0) return;

    if (grp.role === 'excluded_non_heir') {
      const label = grp.excludedLabel.trim() || grp.legendLabel || 'Danguud';
      targetPlotIds.forEach((pid) => {
        rows.push({
          rowId: `color-row-${rowNum++}`,
          rawPlotLabel: `${pid} (${grp.legendLabel})`,
          matchedPlotId: pid,
          assigneeType: 'excluded_custom',
          matchedHeirKey: '',
          assigneeName: label,
          colorHex: grp.hex,
          confidencePct: 95,
          needsReview: false,
          sourceMethod: 'ai_vision',
          noteSomali: `Midabka ${grp.legendLabel} — aan dhaxale ahayn`,
        });
      });
      return;
    }

    const heirObj = grp.matchedHeirKey ? heirMap.get(grp.matchedHeirKey) : undefined;
    targetPlotIds.forEach((pid) => {
      rows.push({
        rowId: `color-row-${rowNum++}`,
        rawPlotLabel: `${pid} (${grp.legendLabel})`,
        matchedPlotId: pid,
        assigneeType: 'heir',
        matchedHeirKey: heirObj?.heirKey || '',
        assigneeName: heirObj?.personName || grp.legendLabel,
        colorHex: heirObj?.colorHex || grp.hex,
        confidencePct: heirObj ? 96 : 75,
        needsReview: !heirObj,
        sourceMethod: 'ai_vision',
        noteSomali: heirObj
          ? `Midabka ${grp.legendLabel} → ${heirObj.personName}`
          : `Fadlan dooro dhaxalaha midabka "${grp.legendLabel}"`,
      });
    });
  });

  return rows;
}
