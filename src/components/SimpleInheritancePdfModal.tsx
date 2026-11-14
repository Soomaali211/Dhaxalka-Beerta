import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  FileText,
  Layers,
  Printer,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import {
  CaseExportMetadata,
  FairLandAllocationResult,
  LandSubdivisionState,
  Point2D,
  SubdivisionComputationResult,
} from '../types/landSubdivision';
import {
  computeSimpleHeirPdfData,
  SimplePdfPerHeirSheetData,
  summarizePlotIdsCompact,
} from '../utils/landSubdivisionEngine';

interface SimpleInheritancePdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  subdivisionResult: SubdivisionComputationResult;
  subdivisionState: LandSubdivisionState;
  fairAllocation: FairLandAllocationResult;
  activeCaseMeta?: CaseExportMetadata | null;
}

interface ViewportTransform {
  toSvg: (utm: Point2D) => [number, number];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function buildSvgViewport(
  subdivision: SubdivisionComputationResult,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
): ViewportTransform {
  let minX = subdivision.bb[0];
  let minY = subdivision.bb[1];
  let maxX = subdivision.bb[2];
  let maxY = subdivision.bb[3];

  subdivision.bring.forEach(([x, y]) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });

  const dx = Math.max(10, maxX - minX);
  const dy = Math.max(10, maxY - minY);
  const padX = dx * 0.04;
  const padY = dy * 0.06;
  const spanX = dx + padX * 2;
  const spanY = dy + padY * 2;
  const scale = Math.min(boxW / spanX, boxH / spanY);
  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const offsetX = boxX + (boxW - drawnW) / 2;
  const offsetY = boxY + (boxH - drawnH) / 2;

  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minY: minY - padY,
    maxY: maxY + padY,
    toSvg: ([ux, uy]: Point2D): [number, number] => [
      offsetX + (ux - (minX - padX)) * scale,
      offsetY + ((maxY + padY) - uy) * scale,
    ],
  };
}

function pointsAttr(ring: Point2D[], toSvg: (pt: Point2D) => [number, number]): string {
  return ring
    .map((pt) => {
      const [x, y] = toSvg(pt);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function getContrastText(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#FFFFFF';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.63 ? '#0F172A' : '#FFFFFF';
}

export const SimpleInheritancePdfModal: React.FC<SimpleInheritancePdfModalProps> = ({
  isOpen,
  onClose,
  subdivisionResult,
  subdivisionState,
  fairAllocation,
  activeCaseMeta,
}) => {
  const [includePerHeirPages, setIncludePerHeirPages] = useState<boolean>(true);
  const [showDooxa90mRing, setShowDooxa90mRing] = useState<boolean>(true);
  const [showColumnLetters, setShowColumnLetters] = useState<boolean>(true);
  const masterSvgRef = useRef<SVGSVGElement | null>(null);

  const pdfData = useMemo(
    () => computeSimpleHeirPdfData(subdivisionResult, fairAllocation, subdivisionState),
    [subdivisionResult, fairAllocation, subdivisionState]
  );

  const caseTitle = activeCaseMeta?.caseName?.trim() || 'Qaybinta Dhaxalka Beerta';
  const refNo = activeCaseMeta?.referenceNumber?.trim() || '';

  // Collect all drawable plots (full + valid/assigned partials)
  const drawablePlots = useMemo(() => {
    const map = new Map<string, (typeof subdivisionResult.plots)[number]>();
    subdivisionResult.plots.forEach((p) => map.set(p.id, p));
    (subdivisionResult.validHalfPlots || []).forEach((hp) => {
      if (!map.has(hp.id)) map.set(hp.id, hp);
    });
    (subdivisionResult.allEvaluatedPlots || []).forEach((ep) => {
      if (map.has(ep.id)) return;
      if (fairAllocation.plotAssignments[ep.id]) {
        map.set(ep.id, ep);
      }
    });
    return Array.from(map.values());
  }, [subdivisionResult, fairAllocation]);

  const wadiLinesUtm = useMemo(() => {
    return (subdivisionState.wadiItems || []).map((w) =>
      w.coords.map((ll) => subdivisionResult.fwd(ll))
    );
  }, [subdivisionState.wadiItems, subdivisionResult]);

  const roadLinesUtm = useMemo(() => {
    return (subdivisionState.roadItems || []).map((r) =>
      r.coords.map((ll) => subdivisionResult.fwd(ll))
    );
  }, [subdivisionState.roadItems, subdivisionResult]);

  if (!isOpen) return null;

  const masterVp = buildSvgViewport(subdivisionResult, 24, 34, 744, 520);

  const handleDownloadMasterSvg = () => {
    if (!masterSvgRef.current) return;
    const xml = new XMLSerializer().serializeToString(masterSvgRef.current);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${refNo ? `${refNo}_` : ''}Qaybinta_Dhaxalka_Simple_Map.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const renderMapFeatures = (
    vp: ViewportTransform,
    patternId: string,
    focusedHeirKey?: string
  ) => {
    const [, topFarmY] = vp.toSvg([subdivisionResult.bb[0], subdivisionResult.bb[3]]);
    const labelColY = Math.max(16, topFarmY - 12);

    return (
      <>
        <defs>
          <pattern
            id={patternId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="#E2E8F0" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#64748B" strokeWidth="1.6" />
          </pattern>
        </defs>

        {/* Farm Boundary */}
        <polygon
          points={pointsAttr(subdivisionResult.bring, vp.toSvg)}
          fill="#FFFFFF"
          stroke="#0F172A"
          strokeWidth="1.4"
        />

        {/* Subtle Block Outlines */}
        {subdivisionResult.blocks.map((b) => (
          <polygon
            key={`blk-${b.id}`}
            points={pointsAttr(b.rect, vp.toSvg)}
            fill="none"
            stroke="#CBD5E1"
            strokeWidth="0.6"
          />
        ))}

        {/* Column Letters A-H at Top */}
        {showColumnLetters &&
          pdfData.columns.map((col) => {
            const [cx] = vp.toSvg([col.utmX, subdivisionResult.bb[3]]);
            return (
              <text
                key={`col-${col.columnLetter}`}
                x={cx}
                y={labelColY}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#0F172A"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {col.columnLetter}
              </text>
            );
          })}

        {/* Plots */}
        {drawablePlots.map((q) => {
          const rec = fairAllocation.plotAssignments[q.id];
          const [cx, cy] = vp.toSvg(q.centerUtm);
          const isExcluded = rec?.assignmentType === 'excluded' || rec?.isExcluded;
          const isJajab =
            rec?.assignmentType === 'unassigned' &&
            (rec.unassignedReason === 'withheld_jajab' ||
              rec.unassignedReason === 'withheld_half_plot');
          const ownerKey = rec?.ownerHeirKey;
          const ownerIdx = ownerKey ? pdfData.heirIndexByKey[ownerKey] : undefined;
          const isDooxa90 = Boolean(rec?.isWithinDooxa90m);

          let fill = '#F8FAFC';
          let stroke = '#94A3B8';
          let strokeW = 0.5;
          let labelText = '';
          let labelColor = '#0F172A';

          if (focusedHeirKey) {
            // Per-heir page map styling
            if (ownerKey === focusedHeirKey && rec?.ownerColorHex) {
              fill = rec.ownerColorHex;
              stroke = '#0F172A';
              strokeW = 0.9;
              labelText = String(ownerIdx || '');
              labelColor = getContrastText(fill);
            } else if (isJajab) {
              fill = `url(#${patternId})`;
              stroke = '#94A3B8';
              strokeW = 0.45;
            } else if (isExcluded) {
              fill = '#E2E8F0';
              stroke = '#CBD5E1';
              strokeW = 0.45;
            } else {
              fill = '#F1F5F9';
              stroke = '#CBD5E1';
              strokeW = 0.45;
            }
          } else {
            // Master map styling
            if (isExcluded) {
              fill = rec?.excludedColorHex || '#94A3B8';
              stroke = '#475569';
              strokeW = 0.7;
              const nm = rec?.excludedSpecialName?.trim() || '';
              labelText = nm ? nm.slice(0, 3).toUpperCase() : '';
              labelColor = getContrastText(fill);
            } else if (isJajab) {
              fill = `url(#${patternId})`;
              stroke = '#64748B';
              strokeW = 0.6;
            } else if (ownerKey && rec?.ownerColorHex) {
              fill = rec.ownerColorHex;
              stroke = '#1E293B';
              strokeW = 0.55;
              labelText = String(ownerIdx || '');
              labelColor = getContrastText(fill);
            } else if (rec?.assignmentType === 'shared_fractional') {
              fill = '#64748B';
              stroke = '#1E293B';
              strokeW = 0.6;
              labelText = 'W';
              labelColor = '#FFFFFF';
            }
          }

          const showRedRing =
            showDooxa90mRing &&
            isDooxa90 &&
            (!focusedHeirKey || ownerKey === focusedHeirKey);

          return (
            <g key={`p-${q.id}`}>
              <polygon
                points={pointsAttr(q.rect, vp.toSvg)}
                fill={fill}
                stroke={showRedRing ? '#DC2626' : stroke}
                strokeWidth={showRedRing ? 1.85 : strokeW}
              />
              {labelText && (
                <text
                  x={cx}
                  y={cy + 3.2}
                  textAnchor="middle"
                  fontSize="8.5"
                  fontWeight="700"
                  fill={labelColor}
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  {labelText}
                </text>
              )}
            </g>
          );
        })}

        {/* Wadi / Dooxa dashed line overlay */}
        {wadiLinesUtm.map((line, idx) => (
          <polyline
            key={`wadi-${idx}`}
            points={pointsAttr(line, vp.toSvg)}
            fill="none"
            stroke="#0284C7"
            strokeWidth="1.5"
            strokeDasharray="4,3"
            opacity="0.85"
          />
        ))}

        {/* Road overlay */}
        {roadLinesUtm.map((line, idx) => (
          <polyline
            key={`road-${idx}`}
            points={pointsAttr(line, vp.toSvg)}
            fill="none"
            stroke="#D97706"
            strokeWidth="1.6"
            opacity="0.75"
          />
        ))}
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-slate-900/90 backdrop-blur-xs">
      {/* Print Stylesheet — strips app chrome and prints each .simple-pdf-sheet cleanly as A4 portrait */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .simple-pdf-print-root,
          .simple-pdf-print-root * {
            visibility: visible !important;
          }
          .simple-pdf-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #FFFFFF !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          .simple-pdf-no-print {
            display: none !important;
          }
          .simple-pdf-sheet {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            page-break-after: always !important;
            break-after: page !important;
            width: 100% !important;
          }
          .simple-pdf-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
        }
      `}</style>

      {/* Top Toolbar */}
      <div className="simple-pdf-no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-slate-950 px-5 py-3 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">
              Simple PDF — Qaybinta Dhaxalka (Qaabka Ilma Cige)
            </div>
            <div className="text-[11px] text-slate-400 tabular-nums">
              {caseTitle} · {fairAllocation.allocatedFullPlotsCount ?? 0} plot la qaybiyey ·{' '}
              {pdfData.heirSheets.length} dhaxlayaal ·{' '}
              {includePerHeirPages ? `${1 + pdfData.heirSheets.length} bog (A4)` : '1 bog (Master)'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Master vs Master + Per-Heir Toggle */}
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setIncludePerHeirPages(true)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold whitespace-nowrap transition-colors ${
                includePerHeirPages
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Master + Dhaxlayaal ({pdfData.heirSheets.length + 1} bog)
            </button>
            <button
              type="button"
              onClick={() => setIncludePerHeirPages(false)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold whitespace-nowrap transition-colors ${
                !includePerHeirPages
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Bogga Guud Keliya
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowDooxa90mRing((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              showDooxa90mRing
                ? 'border-red-500/70 bg-red-950/60 text-red-200'
                : 'border-slate-700 bg-slate-900 text-slate-300'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Giraan Cas (≤90m dooxa)
          </button>

          <button
            type="button"
            onClick={() => setShowColumnLetters((v) => !v)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              showColumnLetters
                ? 'border-sky-500/60 bg-sky-950/60 text-sky-200'
                : 'border-slate-700 bg-slate-900 text-slate-300'
            }`}
          >
            Safaf A–{pdfData.columns[pdfData.columns.length - 1]?.columnLetter || 'H'}
          </button>

          <button
            type="button"
            onClick={handleDownloadMasterSvg}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 whitespace-nowrap transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            SVG Map
          </button>

          <button
            type="button"
            onClick={handlePrintPdf}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 whitespace-nowrap transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            Daabac / Save PDF
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            aria-label="Xidh"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* White Paper Pages Scroll Viewport */}
      <div className="simple-pdf-print-root flex-1 overflow-y-auto px-4 py-6 space-y-8">
        {/* PAGE 1: MASTER SHEET (Qaybinta Dhaxalka) */}
        <section className="simple-pdf-sheet mx-auto w-full max-w-[820px] rounded-md border border-slate-300 bg-white p-7 text-slate-900 shadow-2xl">
          {/* Title Block */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-3">
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-950">
                Qaybinta Dhaxalka — {caseTitle}
              </h1>
              <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
                {fairAllocation.allocatedFullPlotsCount ?? 0} plot la qaybiyey ·{' '}
                {pdfData.heirSheets.length} dhaxlayaal · H1 ({fairAllocation.tierCounts.tier_1_prime}
                ) + H2 ({fairAllocation.tierCounts.tier_2_standard}) + H3 (dooxa ≤90m:{' '}
                {fairAllocation.tierCounts.tier_3_basic})
                {refNo ? ` · Ref: ${refNo}` : ''}
              </p>
            </div>
            {/* Compact North Compass */}
            <div className="flex flex-col items-center justify-center rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <span className="text-[10px] font-extrabold text-slate-900 leading-none">N</span>
              <svg width="16" height="18" viewBox="0 0 16 18" className="mt-0.5">
                <polygon points="8,1 13,15 8,11 3,15" fill="#0F172A" />
              </svg>
            </div>
          </div>

          {/* Vector Map SVG */}
          <div className="mt-3 rounded border border-slate-200 bg-white">
            <svg
              ref={masterSvgRef}
              viewBox="0 0 792 566"
              className="w-full h-auto block"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="792" height="566" fill="#FFFFFF" />
              {renderMapFeatures(masterVp, 'simple-jajab-master')}
            </svg>
          </div>

          {/* Legend Block matching Ilma Cige PDF */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-200 pt-3 text-xs">
            {/* Heirs #1..N Legend */}
            <div className="md:col-span-2">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700">
                Dhaxlayaasha (Midab & Tirada Heerarka)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 tabular-nums">
                {pdfData.heirSheets.map((hs) => (
                  <div
                    key={hs.heir.heirKey}
                    className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold border border-black/15"
                        style={{
                          backgroundColor: hs.heir.colorHex,
                          color: getContrastText(hs.heir.colorHex),
                        }}
                      >
                        {hs.heirIndex}
                      </span>
                      <span className="truncate font-semibold text-slate-900">
                        {hs.heir.personName}
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-600">
                      {hs.assignedByTier.tier_1_prime}+{hs.assignedByTier.tier_2_standard}+
                      {hs.assignedByTier.tier_3_basic} ={' '}
                      <strong className="text-slate-950">{hs.assignedByTier.total}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Special Symbols & Custom Exclusions Legend */}
            <div className="space-y-1.5">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700">
                Astaamaha Khariirada
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-700">
                <svg width="16" height="16" className="shrink-0 border border-slate-400">
                  <defs>
                    <pattern
                      id="leg-hatch"
                      width="4"
                      height="4"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(45)"
                    >
                      <rect width="4" height="4" fill="#E2E8F0" />
                      <line x1="0" y1="0" x2="0" y2="4" stroke="#64748B" strokeWidth="1.2" />
                    </pattern>
                  </defs>
                  <rect width="16" height="16" fill="url(#leg-hatch)" />
                </svg>
                <span>
                  Plot aan la qaybin (jajab:{' '}
                  <strong className="tabular-nums">{pdfData.jajabPlotIds.length}</strong>)
                </span>
              </div>

              {pdfData.customExcludedGroups.length > 0 ? (
                pdfData.customExcludedGroups.map((cg) => (
                  <div
                    key={`${cg.name}-${cg.colorHex}`}
                    className="flex items-center gap-2 text-[11px] text-slate-700"
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-xs border border-slate-500"
                      style={{ backgroundColor: cg.colorHex }}
                    />
                    <span className="truncate">
                      {cg.name} (<strong className="tabular-nums">{cg.plotIds.length}</strong>)
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-slate-700">
                  <span className="h-4 w-4 shrink-0 rounded-xs border border-slate-400 bg-slate-300" />
                  <span>Aan ku jirin qaybinta</span>
                </div>
              )}

              {showDooxa90mRing && (
                <div className="flex items-center gap-2 text-[11px] text-slate-700">
                  <span className="h-4 w-4 shrink-0 rounded-xs border-2 border-red-600 bg-white" />
                  <span>Giraan cas = plot ≤90m dooxa (si siman loo qaybiyay)</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* PAGES 2..N+1: PER-HEIR INDIVIDUAL SHEETS */}
        {includePerHeirPages &&
          pdfData.heirSheets.map((hs: SimplePdfPerHeirSheetData) => {
            const heirVp = buildSvgViewport(subdivisionResult, 24, 30, 744, 470);
            const t1Text = summarizePlotIdsCompact(hs.plotIdsByTier.tier_1_prime) || '-';
            const t2Text = summarizePlotIdsCompact(hs.plotIdsByTier.tier_2_standard) || '-';
            const t3Text = summarizePlotIdsCompact(hs.plotIdsByTier.tier_3_basic) || '-';

            return (
              <section
                key={hs.heir.heirKey}
                className="simple-pdf-sheet mx-auto w-full max-w-[820px] rounded-md border border-slate-300 bg-white p-7 text-slate-900 shadow-2xl"
              >
                {/* Heir Page Header */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-extrabold border border-black/15 tabular-nums"
                      style={{
                        backgroundColor: hs.heir.colorHex,
                        color: getContrastText(hs.heir.colorHex),
                      }}
                    >
                      #{hs.heirIndex}
                    </span>
                    <div>
                      <h2 className="text-lg font-extrabold tracking-tight text-slate-950">
                        {hs.heir.personName}{' '}
                        <span className="font-semibold text-slate-500 text-sm">
                          · {hs.heir.roleTitleSomali} ({hs.heir.individualPercentage.toFixed(2)}%)
                        </span>
                      </h2>
                      <p className="text-xs text-slate-600 tabular-nums">
                        {caseTitle} · {hs.clustersCount} qaybood isku xidhan ·{' '}
                        {hs.blocksTouchedCount} blocks ·{' '}
                        {hs.heir.totalAreaSqM.toLocaleString()} m²
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500 tabular-nums">
                    <div>Bogga {hs.heirIndex + 1} / {pdfData.heirSheets.length + 1}</div>
                    {refNo && <div className="font-mono text-[11px]">{refNo}</div>}
                  </div>
                </div>

                {/* Tier Breakdown Table */}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-xs tabular-nums">
                    <thead>
                      <tr className="border-b border-slate-300 bg-slate-100 text-slate-700">
                        <th className="px-3 py-2 text-left font-bold">Qaybta</th>
                        <th className="px-3 py-2 text-center font-bold">Heer 1</th>
                        <th className="px-3 py-2 text-center font-bold">Heer 2</th>
                        <th className="px-3 py-2 text-center font-bold">
                          Heer 3 (dooxa ≤90m)
                        </th>
                        <th className="px-3 py-2 text-center font-bold">Wadarta</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-200 text-slate-600">
                        <td className="px-3 py-1.5 font-medium">Saami (Exact)</td>
                        <td className="px-3 py-1.5 text-center">
                          {hs.exactByTier.tier_1_prime.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {hs.exactByTier.tier_2_standard.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {hs.exactByTier.tier_3_basic.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-center font-semibold text-slate-900">
                          {hs.exactByTier.total.toFixed(2)}
                        </td>
                      </tr>
                      <tr className="bg-slate-50/70 font-bold text-slate-950">
                        <td className="px-3 py-2">La siiyay</td>
                        <td className="px-3 py-2 text-center">{hs.assignedByTier.tier_1_prime}</td>
                        <td className="px-3 py-2 text-center">
                          {hs.assignedByTier.tier_2_standard}
                        </td>
                        <td className="px-3 py-2 text-center">{hs.assignedByTier.tier_3_basic}</td>
                        <td className="px-3 py-2 text-center text-emerald-700">
                          {hs.assignedByTier.total}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Plot IDs & Clusters Summary */}
                <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-700 space-y-1">
                  <div>
                    <strong className="text-slate-900">
                      Qaybo isku xidhan ({hs.clustersCount}, max 5/saf)
                    </strong>{' '}
                    · <strong className="text-slate-900">Blocks ({hs.blocksTouchedCount}):</strong>{' '}
                    {hs.heir.assignedBlockIds.join(', ') || '-'}
                  </div>
                  <div className="grid grid-cols-1 gap-0.5">
                    <div>
                      <span className="font-semibold text-emerald-800">Heer 1:</span>{' '}
                      <span className="font-mono text-[10.5px]">{t1Text}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-amber-800">Heer 2:</span>{' '}
                      <span className="font-mono text-[10.5px]">{t2Text}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-red-700">Heer 3 (≤90m dooxa):</span>{' '}
                      <span className="font-mono text-[10.5px]">{t3Text}</span>
                    </div>
                  </div>
                </div>

                {/* Individual Heir White Map */}
                <div className="mt-3 rounded border border-slate-200 bg-white">
                  <svg
                    viewBox="0 0 792 510"
                    className="w-full h-auto block"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect width="792" height="510" fill="#FFFFFF" />
                    {renderMapFeatures(
                      heirVp,
                      `simple-jajab-heir-${hs.heirIndex}`,
                      hs.heir.heirKey
                    )}
                  </svg>
                </div>

                {/* Per-Heir Footer Legend */}
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-3.5 w-3.5 rounded-xs border border-black/20"
                        style={{ backgroundColor: hs.heir.colorHex }}
                      />
                      Dhulka {hs.heir.personName}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-3.5 w-3.5 rounded-xs border border-slate-300 bg-slate-100" />
                      Dhaxlayaal kale / aan ku jirin
                    </span>
                    {showDooxa90mRing && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-3.5 w-3.5 rounded-xs border-2 border-red-600 bg-white" />
                        Plot ≤90m dooxa
                      </span>
                    )}
                  </div>
                  <span>Cadeyn Qaybinta Dhaxalka</span>
                </div>
              </section>
            );
          })}
      </div>
    </div>
  );
};
