import './pdfPolyfills';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfPositionedTextToken } from './pdfInheritanceImportEngine';

let workerConfigured = false;
function ensurePdfWorkerConfigured() {
  if (!workerConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    workerConfigured = true;
  }
}

async function enableMainThreadPdfWorkerFallback(): Promise<void> {
  const g = globalThis as unknown as { pdfjsWorker?: unknown };
  if (!g.pdfjsWorker) {
    const mod = await import('pdfjs-dist/build/pdf.worker.min.mjs');
    g.pdfjsWorker = mod;
  }
}

async function isPdfMagicBytes(file: File): Promise<boolean> {
  try {
    const headerBuf = await file.slice(0, 16).arrayBuffer();
    const bytes = new Uint8Array(headerBuf);
    // Allow optional leading whitespace/BOM before %PDF-
    for (let i = 0; i <= Math.min(8, bytes.length - 5); i++) {
      if (
        bytes[i] === 0x25 && // %
        bytes[i + 1] === 0x50 && // P
        bytes[i + 2] === 0x44 && // D
        bytes[i + 3] === 0x46 && // F
        bytes[i + 4] === 0x2d // -
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function openPdfDocumentWithFallback(rawBuffer: ArrayBuffer) {
  ensurePdfWorkerConfigured();

  const loadWithBytes = async (bytes: Uint8Array) => {
    const task = pdfjsLib.getDocument({
      data: bytes,
      isOffscreenCanvasSupported: false,
      useSystemFonts: true,
      stopAtErrors: false,
    });
    return task.promise;
  };

  // Load bundled worker module first so sandboxed iframes, CSP, PWA SW, or Android WebView
  // never poison PDFWorker._setupFakeWorkerGlobal with a failed external worker URL import.
  try {
    await enableMainThreadPdfWorkerFallback();
  } catch {
    // Fall back to GlobalWorkerOptions.workerSrc if dynamic chunk import fails
  }

  try {
    // Pass a cloned buffer so if transfer occurs and fails, rawBuffer stays intact
    const firstCopy = new Uint8Array(rawBuffer.slice(0));
    return await loadWithBytes(firstCopy);
  } catch (primaryErr) {
    const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    if (/password/i.test(msg)) {
      throw new Error('Faylka PDF-ku wuxuu ku xidhan yahay Password/Furaha sirta ah.');
    }
    if (/invalid pdf/i.test(msg)) {
      throw new Error('Faylkani ma aha PDF sax ah ama wuu xumaaday.');
    }

    try {
      await enableMainThreadPdfWorkerFallback();
      const secondCopy = new Uint8Array(rawBuffer.slice(0));
      return await loadWithBytes(secondCopy);
    } catch (fallbackErr) {
      const fMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(`Faylka PDF lama furin karin: ${fMsg || msg}`);
    }
  }
}

export interface ExtractedPdfPageData {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  previewDataUrl: string;
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg';
  plainText: string;
  positionedTokens: PdfPositionedTextToken[];
  hasSelectableVectorText: boolean;
}

export interface ExtractedDocumentBundle {
  fileName: string;
  kind: 'vector_pdf' | 'scanned_pdf' | 'scanned_image';
  totalPages: number;
  pages: ExtractedPdfPageData[];
}

export async function extractPdfOrImageForInheritanceImport(
  file: File,
  maxPagesToRender = 15
): Promise<ExtractedDocumentBundle> {
  const lower = file.name.toLowerCase();
  const hasPdfHeader = await isPdfMagicBytes(file);

  // 1. Direct Raster Scan Image (.png, .jpg, .jpeg, .webp) — never intercept real %PDF files
  if (
    !hasPdfHeader &&
    (/\.(png|jpe?g|webp|bmp)$/i.test(lower) ||
      (file.type.startsWith('image/') && !lower.endsWith('.pdf')))
  ) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Sawirka lama akhrin karin.'));
      reader.readAsDataURL(file);
    });

    // Resize oversized phone camera scans nicely to max 2200px so Gemini reads crisp text fast
    const normalized = await new Promise<{
      dataUrl: string;
      base64: string;
      mimeType: 'image/png' | 'image/jpeg';
      width: number;
      height: number;
    }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 2200;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context lama helin.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const outUrl = canvas.toDataURL('image/jpeg', 0.92);
        const comma = outUrl.indexOf(',');
        resolve({
          dataUrl: outUrl,
          base64: comma >= 0 ? outUrl.slice(comma + 1) : outUrl,
          mimeType: 'image/jpeg',
          width: w,
          height: h,
        });
      };
      img.onerror = () => reject(new Error('Sawirka lama furin.'));
      img.src = dataUrl;
    });

    return {
      fileName: file.name,
      kind: 'scanned_image',
      totalPages: 1,
      pages: [
        {
          pageNumber: 1,
          widthPx: normalized.width,
          heightPx: normalized.height,
          previewDataUrl: normalized.dataUrl,
          imageBase64: normalized.base64,
          imageMimeType: normalized.mimeType,
          plainText: '',
          positionedTokens: [],
          hasSelectableVectorText: false,
        },
      ],
    };
  }

  // 2. Vector or Scanned PDF via pdfjs-dist (with Worker + Main-Thread fallback)
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error('Faylka PDF-ku waa eber (0 bytes).');
  }
  const pdfDoc = await openPdfDocumentWithFallback(buffer);
  const totalPages = pdfDoc.numPages;
  const pageCountToProcess = Math.min(totalPages, maxPagesToRender);

  const pages: ExtractedPdfPageData[] = [];
  let vectorPagesCount = 0;

  for (let pNum = 1; pNum <= pageCountToProcess; pNum++) {
    const page = await pdfDoc.getPage(pNum);
    const baseVp = page.getViewport({ scale: 1 });
    const targetScale = Math.min(2.8, Math.max(1.25, 2100 / Math.max(baseVp.width, baseVp.height, 1)));
    const viewport = page.getViewport({ scale: targetScale });

    // Extract Vector Text + Normalized Page Coordinates
    const positionedTokens: PdfPositionedTextToken[] = [];
    const textLinesByY = new Map<number, { x: number; width: number; height: number; text: string }[]>();

    try {
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if (!('str' in item)) continue;
        const str = String(item.str || '').trim();
        if (!str) continue;
        const tx = item.transform || [1, 0, 0, 1, 0, 0];
        const [vx, vy] = viewport.convertToViewportPoint(tx[4], tx[5]);
        const itemW = Math.max(4, (item.width || 8) * targetScale);
        const itemH = Math.max(6, (item.height || 10) * targetScale);
        positionedTokens.push({
          text: str,
          x: Math.round(vx),
          y: Math.round(vy),
          width: Math.round(itemW),
          height: Math.round(itemH),
        });

        const yBucket = Math.round(vy / 10) * 10;
        const list = textLinesByY.get(yBucket) || [];
        list.push({ x: vx, width: itemW, height: itemH, text: str });
        textLinesByY.set(yBucket, list);
      }
    } catch {
      // Keep positionedTokens empty and allow visual rendering + AI Vision fallback
    }

    const sortedYKeys = Array.from(textLinesByY.keys()).sort((a, b) => a - b);
    const plainText = sortedYKeys
      .map((yk) => {
        const sortedRow = (textLinesByY.get(yk) || []).sort((a, b) => a.x - b.x);
        if (sortedRow.length === 0) return '';
        let lineOut = sortedRow[0].text;
        for (let i = 1; i < sortedRow.length; i++) {
          const prev = sortedRow[i - 1];
          const cur = sortedRow[i];
          const gap = cur.x - (prev.x + prev.width);
          const colThreshold = Math.max(30, prev.height * 2.4);
          lineOut += gap > colThreshold ? '  |  ' + cur.text : ' ' + cur.text;
        }
        return lineOut;
      })
      .filter(Boolean)
      .join('\n');

    const hasSelectableVectorText = positionedTokens.length >= 4 && plainText.length >= 16;
    if (hasSelectableVectorText) {
      vectorPagesCount++;
    }

    // Render crisp JPEG preview for UI + AI Vision backup
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas-ka ma suurtagalin in la sawiro bogga PDF.');
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    try {
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    } catch {
      // Draw crisp fallback page summary if an embedded PDF font/pattern fails to rasterize
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(`Bogga ${pNum} — ${file.name}`, 48, 72);
      ctx.font = '18px monospace';
      plainText
        .split('\n')
        .slice(0, 24)
        .forEach((ln, idx) => {
          ctx.fillText(ln.slice(0, 95), 48, 125 + idx * 28);
        });
    }

    const previewDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const commaIdx = previewDataUrl.indexOf(',');

    pages.push({
      pageNumber: pNum,
      widthPx: canvas.width,
      heightPx: canvas.height,
      previewDataUrl,
      imageBase64: commaIdx >= 0 ? previewDataUrl.slice(commaIdx + 1) : previewDataUrl,
      imageMimeType: 'image/jpeg',
      plainText,
      positionedTokens,
      hasSelectableVectorText,
    });
  }

  return {
    fileName: file.name,
    kind: vectorPagesCount > 0 ? 'vector_pdf' : 'scanned_pdf',
    totalPages,
    pages,
  };
}
