import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  FileText,
  Layers,
  Map as MapIcon,
  Printer,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Users,
} from 'lucide-react';
import {
  CaseExportMetadata,
  FairLandAllocationResult,
  LandSubdivisionState,
  ParsedGeoItem,
  PrebuiltGeoJsonSubdivision,
  SubdivisionComputationResult,
} from '../types/landSubdivision';
import {
  FarmCartographicReport,
  HEERARKA_MAP_COLORS,
  LAYOUT11_PALETTE,
  Layout11CategoryKey,
  computeFarmCartographicReport,
} from '../utils/pdfCartographyEngine';
import { InheritanceMapPdfComposer } from './InheritanceMapPdfComposer';

export type CartographicPdfDocMode = 'layout11' | 'heerarka_report' | 'inheritance_map';

interface FarmCartographicPdfModalProps {
  isOpen: boolean;
  initialMode?: CartographicPdfDocMode;
  onClose: () => void;
  subdivisionResult: SubdivisionComputationResult;
  subdivisionState?: LandSubdivisionState | null;
  fairAllocation?: FairLandAllocationResult | null;
  activeCaseMeta?: CaseExportMetadata | null;
  deceasedName?: string;
  prebuiltSubdivision?: PrebuiltGeoJsonSubdivision | null;
  wadiLinesLonLat?: { name: string; coords: [number, number][] }[];
}

function formatPointsAttr(
  ringUtm: [number, number][],
  toSvg: (pt: [number, number]) => [number, number]
): string {
  return ringUtm
    .map((pt) => {
      const [sx, sy] = toSvg(pt);
      return `${sx.toFixed(2)},${sy.toFixed(2)}`;
    })
    .join(' ');
}

function formatBlockTwoLineLabel(blockId: string): { line1: string; line2?: string } {
  const m = /^(R\d+)[-_](C\d+)$/i.exec(blockId.trim());
  if (m) {
    return { line1: m[1].toUpperCase(), line2: m[2].toUpperCase() };
  }
  return { line1: blockId };
}

export const FarmCartographicPdfModal: React.FC<FarmCartographicPdfModalProps> = ({
  isOpen,
  initialMode = 'layout11',
  onClose,
  subdivisionResult,
  subdivisionState,
  fairAllocation,
  activeCaseMeta,
  deceasedName,
  prebuiltSubdivision,
  wadiLinesLonLat,
}) => {
  const [docMode, setDocMode] = useState<CartographicPdfDocMode>(initialMode);
  const [previewZoom, setPreviewZoom] = useState<number>(1);
  const layout11SvgRef = useRef<SVGSVGElement | null>(null);
  const heerarkaSvgRef = useRef<SVGSVGElement | null>(null);
  const inheritanceSvgRef = useRef<SVGSVGElement | null>(null);

  React.useEffect(() => {
    setDocMode(initialMode);
    setPreviewZoom(1);
  }, [initialMode, isOpen]);

  const wadiItemsForEngine: ParsedGeoItem[] = useMemo(
    () =>
      (wadiLinesLonLat || []).map((w) => ({
        name: w.name,
        type: 'Line' as const,
        coords: w.coords,
      })),
    [wadiLinesLonLat]
  );

  const report: FarmCartographicReport | null = useMemo(
    () =>
      computeFarmCartographicReport(
        subdivisionResult,
        wadiItemsForEngine,
        prebuiltSubdivision
      ),
    [subdivisionResult, wadiItemsForEngine, prebuiltSubdivision]
  );

  const allPlots = useMemo(
    () =>
      subdivisionResult.allEvaluatedPlots && subdivisionResult.allEvaluatedPlots.length > 0
        ? subdivisionResult.allEvaluatedPlots
        : subdivisionResult.plots,
    [subdivisionResult]
  );

  // Compute unified UTM bounding box across boundary, plots, and wadis
  const utmExtents = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const visit = (pt: [number, number]) => {
      if (pt[0] < minX) minX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] > maxY) maxY = pt[1];
    };

    subdivisionResult.bring.forEach(visit);
    allPlots.forEach((p) => p.rect.forEach(visit));
    (report?.projectedWadiLinesUtm || []).forEach((line) => line.forEach(visit));

    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 500;
      maxY = 500;
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      widthM: Math.max(10, maxX - minX),
      heightM: Math.max(10, maxY - minY),
    };
  }, [subdivisionResult.bring, allPlots, report?.projectedWadiLinesUtm]);

  if (!isOpen || !report) return null;

  // --- SVG Coordinate Transform for Automatic_Layout11 (A4 Portrait 794 x 1122 matching PDF 100%) ---
  const L11_W = 794;
  const L11_H = 1122;
  const L11_FRAME = { x: 16, y: 16, w: L11_W - 32, h: L11_H - 32 };
  const l11PadLeft = 36;
  const l11PadRight = 32;
  const l11PadTop = 58;
  const l11PadBottom = 64;
  const l11AvailW = L11_FRAME.w - l11PadLeft - l11PadRight;
  const l11AvailH = L11_FRAME.h - l11PadTop - l11PadBottom;
  const l11Scale = Math.min(l11AvailW / utmExtents.widthM, l11AvailH / utmExtents.heightM);
  const l11OffsetX =
    L11_FRAME.x + l11PadLeft + (l11AvailW - utmExtents.widthM * l11Scale) / 2;
  const l11OffsetY =
    L11_FRAME.y + l11PadTop + (l11AvailH - utmExtents.heightM * l11Scale) / 2;

  const toL11Svg = (pt: [number, number]): [number, number] => [
    l11OffsetX + (pt[0] - utmExtents.minX) * l11Scale,
    l11OffsetY + (utmExtents.maxY - pt[1]) * l11Scale,
  ];

  // Scale bar for Layout 11: 0 — 0.1 — 0.2 km (100m + 100m = 200m) when farm >= 220m, else 0 — 50 — 100 m
  const useKmBar = utmExtents.widthM >= 220;
  const l11StepMeters = useKmBar ? 100 : 50;
  const l11StepPx = l11StepMeters * l11Scale;

  // --- SVG Coordinate Transform for Khariidadda Heerarka (Page 2 Portrait: 720 x 920) ---
  const HR_W = 720;
  const HR_H = 920;
  const hrPadX = 36;
  const hrPadTop = 36;
  const hrPadBottom = 64;
  const hrAvailW = HR_W - hrPadX * 2;
  const hrAvailH = HR_H - hrPadTop - hrPadBottom;
  const hrScale = Math.min(hrAvailW / utmExtents.widthM, hrAvailH / utmExtents.heightM);
  const hrOffsetX = hrPadX + (hrAvailW - utmExtents.widthM * hrScale) / 2;
  const hrOffsetY = hrPadTop + (hrAvailH - utmExtents.heightM * hrScale) / 2;

  const toHrSvg = (pt: [number, number]): [number, number] => [
    hrOffsetX + (pt[0] - utmExtents.minX) * hrScale,
    hrOffsetY + (utmExtents.maxY - pt[1]) * hrScale,
  ];
  const hr200mMeters = utmExtents.widthM >= 220 ? 200 : 100;
  const hr200mPx = hr200mMeters * hrScale;

  // Legend rows for Automatic_Layout11 in exact PDF order
  const layout11CategoryRows: {
    key: Layout11CategoryKey;
    label: string;
    count: number;
    fillHex: string;
    hatch?: boolean;
  }[] = [
    {
      key: 'unlabelled',
      label: `[${report.totalPlots}]`,
      count: report.totalPlots,
      fillHex: '#FFFFFF',
    },
    {
      key: 'Xaq',
      label: `Xaq [${report.layout11LegendCounts.Xaq}]`,
      count: report.layout11LegendCounts.Xaq,
      fillHex: LAYOUT11_PALETTE.Xaq.fillHex,
    },
    {
      key: 'partial_40',
      label: `[${report.layout11LegendCounts.partial_40}]`,
      count: report.layout11LegendCounts.partial_40,
      fillHex: LAYOUT11_PALETTE.partial_40.fillHex,
      hatch: true,
    },
    {
      key: 'Doox',
      label: `Doox [${report.layout11LegendCounts.Doox}]`,
      count: report.layout11LegendCounts.Doox,
      fillHex: LAYOUT11_PALETTE.Doox.fillHex,
    },
    {
      key: 'Danguud',
      label: `Danguud [${report.layout11LegendCounts.Danguud}]`,
      count: report.layout11LegendCounts.Danguud,
      fillHex: LAYOUT11_PALETTE.Danguud.fillHex,
    },
    {
      key: 'Xamse Mubaarig',
      label: `Xamse Mubaarig [${report.layout11LegendCounts['Xamse Mubaarig']}]`,
      count: report.layout11LegendCounts['Xamse Mubaarig'],
      fillHex: LAYOUT11_PALETTE['Xamse Mubaarig'].fillHex,
    },
    {
      key: 'Shafool',
      label: `Shafool [${report.layout11LegendCounts.Shafool}]`,
      count: report.layout11LegendCounts.Shafool,
      fillHex: LAYOUT11_PALETTE.Shafool.fillHex,
    },
    {
      key: 'Tacab',
      label: `Tacab [${report.layout11LegendCounts.Tacab}]`,
      count: report.layout11LegendCounts.Tacab,
      fillHex: LAYOUT11_PALETTE.Tacab.fillHex,
    },
    {
      key: 'CWAHAAB',
      label: `CWAHAAB [${report.layout11LegendCounts.CWAHAAB}]`,
      count: report.layout11LegendCounts.CWAHAAB,
      fillHex: LAYOUT11_PALETTE.CWAHAAB.fillHex,
    },
    {
      key: 'Milgo',
      label: `Milgo [${report.layout11LegendCounts.Milgo}]`,
      count: report.layout11LegendCounts.Milgo,
      fillHex: LAYOUT11_PALETTE.Milgo.fillHex,
    },
    {
      key: 'Ina Muuse',
      label: `Ina Muuse [${report.layout11LegendCounts['Ina Muuse']}]`,
      count: report.layout11LegendCounts['Ina Muuse'],
      fillHex: LAYOUT11_PALETTE['Ina Muuse'].fillHex,
    },
    {
      key: 'Culimo',
      label: `Culimo [${report.layout11LegendCounts.Culimo}]`,
      count: report.layout11LegendCounts.Culimo,
      fillHex: LAYOUT11_PALETTE.Culimo.fillHex,
    },
  ];

  const hasAnyNamedCategory = report.buuxaKaleCount + report.qaybKaleCount > 0;
  const visibleL11LegendRows = hasAnyNamedCategory
    ? layout11CategoryRows
    : layout11CategoryRows.filter(
        (r) => r.key === 'unlabelled' || r.key === 'partial_40' || r.count > 0
      );

  // Split blockRows across Page 3 (first 39 rows) and Page 4 (remaining 23 rows) matching Warbixinta PDF!
  const page3BlockRows = report.blockRows.slice(0, 39);
  const page4BlockRows = report.blockRows.slice(39);

  const handlePrintPdf = () => {
    window.print();
  };

  const handleDownloadSvg = () => {
    const svgEl =
      docMode === 'layout11'
        ? layout11SvgRef.current
        : docMode === 'inheritance_map'
        ? inheritanceSvgRef.current
        : heerarkaSvgRef.current;
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgEl);
    if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
      source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${source}`], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      docMode === 'layout11'
        ? 'Automatic_Layout11_Khariidadda_Beerta.svg'
        : docMode === 'inheritance_map'
        ? 'Khariidadda_Muuqaalka_Dhaxalka_Beerta.svg'
        : 'Khariidadda_Heerarka_Beerta.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const L11_LEGEND_ROW_H = 22;
  const l11LegendHeight = 76 + visibleL11LegendRows.length * L11_LEGEND_ROW_H;
  const l11LegendX = L11_FRAME.x + L11_FRAME.w - 196;
  const l11LegendY = L11_FRAME.y + L11_FRAME.h - l11LegendHeight - 16;

  const getHeerBadgeClass = (heer: 1 | 2 | 3) =>
    heer === 3
      ? 'bg-[#1D6F42] text-white font-semibold'
      : heer === 2
      ? 'bg-[#74B868] text-slate-900 font-semibold'
      : 'bg-[#D9F0D3] text-slate-900 font-semibold';

  return (
    <div className="cartographic-pdf-modal-root fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-xs print:static print:bg-white print:backdrop-blur-none">
      {/* Compact Single-Row Top Toolbar (Hidden when printing) */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-950 px-2.5 sm:px-4 py-1.5 text-white overflow-x-auto print:hidden">
        {/* Left: Compact Document Switcher */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-0.5 border border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setDocMode('inheritance_map')}
            className={`min-h-[34px] inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              docMode === 'inheritance_map'
                ? 'bg-emerald-500 text-slate-950 shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>Khariidadda Dhaxalka</span>
          </button>
          <button
            type="button"
            onClick={() => setDocMode('layout11')}
            className={`min-h-[34px] inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              docMode === 'layout11'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5 shrink-0" />
            <span>Layout 11</span>
          </button>
          <button
            type="button"
            onClick={() => setDocMode('heerarka_report')}
            className={`min-h-[34px] inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              docMode === 'heerarka_report'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span>Warbixin (4 Bog)</span>
          </button>
        </div>

        {/* Center Info (Desktop only, quiet inline text) */}
        <div className="hidden xl:flex items-center gap-1.5 text-xs text-slate-400 tabular-nums truncate">
          <span>{report.totalPlots} Plot</span>
          <span aria-hidden="true">·</span>
          <span>{report.totalBlocks} Block</span>
          <span aria-hidden="true">·</span>
          <span>{report.boundaryAreaDisplayHa.toFixed(2)} ha</span>
        </div>

        {/* Right: Zoom (Mobile + Desktop) & Export Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900 px-1 py-0.5">
            <button
              type="button"
              onClick={() => setPreviewZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))}
              className="min-h-[32px] min-w-[30px] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
              title="Yaree Preview-ga"
              aria-label="Yaree Preview-ga"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPreviewZoom(1)}
              className="min-h-[32px] px-1.5 text-[11px] font-bold text-slate-200 hover:text-emerald-400 tabular-nums cursor-pointer"
              title="Ku-habbee Shaashadda (100%)"
            >
              {Math.round(previewZoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setPreviewZoom((z) => Math.min(2.6, +(z + 0.2).toFixed(2)))}
              className="min-h-[32px] min-w-[30px] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
              title="Weynee Preview-ga"
              aria-label="Weynee Preview-ga"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            {previewZoom !== 1 && (
              <button
                type="button"
                onClick={() => setPreviewZoom(1)}
                className="min-h-[32px] min-w-[28px] flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
                title="Ku celi 100%"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleDownloadSvg}
            className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition cursor-pointer whitespace-nowrap"
            title="Soo dejiso Vector SVG"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">SVG</span>
          </button>

          <button
            type="button"
            onClick={handlePrintPdf}
            className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-xs cursor-pointer whitespace-nowrap"
          >
            <Printer className="h-3.5 w-3.5 shrink-0" />
            <span>Daabac / PDF</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer"
            title="Xidh"
            aria-label="Xidh"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Print/Preview Canvas */}
      {docMode === 'inheritance_map' ? (
        <InheritanceMapPdfComposer
          subdivisionResult={subdivisionResult}
          subdivisionState={subdivisionState}
          fairAllocation={fairAllocation}
          prebuiltSubdivision={prebuiltSubdivision}
          activeCaseMeta={activeCaseMeta}
          deceasedName={deceasedName}
          report={report}
          previewZoom={previewZoom}
          svgRef={inheritanceSvgRef}
        />
      ) : (
      <div className="flex-1 overflow-auto bg-slate-200/90 p-4 sm:p-8 print:overflow-visible print:bg-white print:p-0">
        {docMode === 'layout11' ? (
          /* =====================================================================
           * DOCUMENT 1: AUTOMATIC_LAYOUT11 (A4 PORTRAIT 100% QGIS REPLICA)
           * ===================================================================== */
          <div className="mx-auto flex justify-center print:block">
            <div
              style={{
                width: `${Math.round(L11_W * previewZoom)}px`,
              }}
              className="bg-white shadow-xl ring-1 ring-slate-300 print:!w-full print:shadow-none print:ring-0"
            >
              <svg
                ref={layout11SvgRef}
                viewBox={`0 0 ${L11_W} ${L11_H}`}
                className="block h-auto w-full bg-white"
              >
                <defs>
                  {/* 45° Diagonal Black Hatch (`/`) for [40] partial boundary plots */}
                  <pattern
                    id="qgis-layout11-hatch"
                    width="5.5"
                    height="5.5"
                    patternTransform="rotate(45)"
                    patternUnits="userSpaceOnUse"
                  >
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="5.5"
                      stroke="#111827"
                      strokeWidth="1.2"
                    />
                  </pattern>
                  <pattern
                    id="qgis-layout11-hatch-legend"
                    width="4.5"
                    height="4.5"
                    patternTransform="rotate(45)"
                    patternUnits="userSpaceOnUse"
                  >
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="4.5"
                      stroke="#111827"
                      strokeWidth="1.1"
                    />
                  </pattern>
                </defs>

                {/* White Sheet + Outer Neatline Frame */}
                <rect x="0" y="0" width={L11_W} height={L11_H} fill="#FFFFFF" />
                <rect
                  x={L11_FRAME.x}
                  y={L11_FRAME.y}
                  width={L11_FRAME.w}
                  height={L11_FRAME.h}
                  fill="#FFFFFF"
                  stroke="#111827"
                  strokeWidth="1.4"
                />

                {/* Top-Left QGIS Two-Tone North Arrow + "N" (Left half white, Right half black like Automatic_Layout11!) */}
                <g transform={`translate(${L11_FRAME.x + 56}, ${L11_FRAME.y + 48})`}>
                  <polygon
                    points="22,0 0,52 22,38"
                    fill="#FFFFFF"
                    stroke="#111827"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                  <polygon
                    points="22,0 44,52 22,38"
                    fill="#111827"
                    stroke="#111827"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                  <text
                    x="22"
                    y="72"
                    textAnchor="middle"
                    fontSize="24"
                    fontWeight="600"
                    fontFamily="Inter, Arial, sans-serif"
                    fill="#111827"
                  >
                    N
                  </text>
                </g>

                {/* Layer 03_plots [523] */}
                <g id="layer_03_plots">
                  {allPlots.map((pl) => {
                    const prof = report.plotProfilesById[pl.id];
                    const fillHex = prof ? prof.layout11FillHex : '#FFFFFF';
                    const showHatch = prof ? prof.layout11ShowHatch : !pl.full;
                    const ptsStr = formatPointsAttr(pl.rect, toL11Svg);
                    return (
                      <g key={pl.id}>
                        <polygon
                          points={ptsStr}
                          fill={fillHex}
                          stroke="#111827"
                          strokeWidth="0.7"
                          strokeLinejoin="round"
                        />
                        {showHatch && (
                          <polygon
                            points={ptsStr}
                            fill="url(#qgis-layout11-hatch)"
                            stroke="#111827"
                            strokeWidth="0.65"
                            strokeLinejoin="round"
                          />
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* Layer 05_dooxyada (Bright Cyan Stream Line) */}
                <g id="layer_05_dooxyada">
                  {report.projectedWadiLinesUtm.map((lineUtm, idx) => (
                    <polyline
                      key={`wadi-${idx}`}
                      points={formatPointsAttr(lineUtm, toL11Svg)}
                      fill="none"
                      stroke={HEERARKA_MAP_COLORS.layout11DooxyadaLine}
                      strokeWidth="4.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </g>

                {/* Layer 01_xuduudka_beerta (Vivid Red Farm Perimeter) */}
                <g id="layer_01_xuduudka_beerta">
                  <polygon
                    points={formatPointsAttr(subdivisionResult.bring, toL11Svg)}
                    fill="none"
                    stroke={HEERARKA_MAP_COLORS.layout11BoundaryLine}
                    strokeWidth="1.9"
                    strokeLinejoin="round"
                  />
                </g>

                {/* Bottom-Left QGIS Alternating Scale Bar (0 — 0.1 — 0.2 km) */}
                <g
                  transform={`translate(${L11_FRAME.x + 18}, ${
                    L11_FRAME.y + L11_FRAME.h - 46
                  })`}
                >
                  <text
                    x="0"
                    y="-10"
                    textAnchor="middle"
                    fontSize="14"
                    fontFamily="Inter, Arial, sans-serif"
                    fill="#111827"
                  >
                    0
                  </text>
                  <text
                    x={l11StepPx}
                    y="-10"
                    textAnchor="middle"
                    fontSize="14"
                    fontFamily="Inter, Arial, sans-serif"
                    fill="#111827"
                  >
                    {useKmBar ? '0.1' : '50'}
                  </text>
                  <text
                    x={l11StepPx * 2}
                    y="-10"
                    textAnchor="middle"
                    dx="12"
                    fontSize="14"
                    fontFamily="Inter, Arial, sans-serif"
                    fill="#111827"
                  >
                    {useKmBar ? '0.2 km' : '100 m'}
                  </text>
                  <rect
                    x="0"
                    y="0"
                    width={l11StepPx}
                    height="11"
                    fill="#111827"
                    stroke="#111827"
                    strokeWidth="1.1"
                  />
                  <rect
                    x={l11StepPx}
                    y="0"
                    width={l11StepPx}
                    height="11"
                    fill="#FFFFFF"
                    stroke="#111827"
                    strokeWidth="1.1"
                  />
                </g>

                {/* Bottom-Right QGIS Legend (`01_xuduudka_beerta`, `05_dooxyada`, `03_plots [523]`, + categories) */}
                <g transform={`translate(${l11LegendX}, ${l11LegendY})`}>
                  <rect
                    x="-8"
                    y="-8"
                    width="192"
                    height={l11LegendHeight + 12}
                    fill="#FFFFFF"
                    fillOpacity="0.96"
                  />

                  {/* 01_xuduudka_beerta */}
                  <rect
                    x="0"
                    y="2"
                    width="24"
                    height="13"
                    fill="#FFFFFF"
                    stroke={HEERARKA_MAP_COLORS.layout11BoundaryLine}
                    strokeWidth="1.9"
                  />
                  <text
                    x="32"
                    y="13"
                    fontSize="13"
                    fontFamily="Inter, Arial, sans-serif"
                    fill="#111827"
                  >
                    01_xuduudka_beerta
                  </text>

                  {/* 05_dooxyada */}
                  <line
                    x1="0"
                    y1="32"
                    x2="24"
                    y2="32"
                    stroke={HEERARKA_MAP_COLORS.layout11DooxyadaLine}
                    strokeWidth="4.2"
                  />
                  <text
                    x="32"
                    y="36.5"
                    fontSize="13"
                    fontFamily="Inter, Arial, sans-serif"
                    fill="#111827"
                  >
                    05_dooxyada
                  </text>

                  {/* 03_plots [523] heading */}
                  <text
                    x="0"
                    y="60"
                    fontSize="13"
                    fontFamily="Inter, Arial, sans-serif"
                    fill="#111827"
                  >
                    03_plots [{report.totalPlots}]
                  </text>

                  {/* Category Swatches */}
                  {visibleL11LegendRows.map((item, idx) => {
                    const ry = 70 + idx * L11_LEGEND_ROW_H;
                    return (
                      <g key={item.key} transform={`translate(0, ${ry})`}>
                        <rect
                          x="0"
                          y="0"
                          width="24"
                          height="13.5"
                          fill={item.fillHex}
                          stroke="#111827"
                          strokeWidth="0.9"
                        />
                        {item.hatch && (
                          <rect
                            x="0"
                            y="0"
                            width="24"
                            height="13.5"
                            fill="url(#qgis-layout11-hatch-legend)"
                            stroke="#111827"
                            strokeWidth="0.9"
                          />
                        )}
                        <text
                          x="32"
                          y="11.5"
                          fontSize="12.8"
                          fontFamily="Inter, Arial, sans-serif"
                          fill="#111827"
                        >
                          {item.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
          </div>
        ) : (
          /* =====================================================================
           * DOCUMENT 2: WARBIXINTA PLOTS-KA IYO HEERARKA BEERTA (EXACT 4 PAGES)
           * ===================================================================== */
          <div
            style={{
              width: `${Math.round(794 * previewZoom)}px`,
            }}
            className="mx-auto space-y-8 print:!w-full print:space-y-0"
          >
            {/* ------------------------- PAGE 1 ------------------------- */}
            <section className="pdf-report-page flex flex-col justify-between min-h-[1080px] bg-white p-8 sm:p-12 shadow-xl ring-1 ring-slate-300 text-slate-900 print:min-h-0 print:shadow-none print:ring-0 print:p-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Warbixinta Plots-ka iyo Heerarka Beerta
                </h1>
                <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
                  Wareega Beerta - Xuduudka: {report.boundaryAreaDisplayHa.toFixed(2)} ha (xarunta
                  GeoJSON) - Taariikh: 25 Oktoobar 2026
                </p>

                {/* Section 1: Soo koobid */}
                <h2 className="mt-7 text-base font-bold text-slate-900">1. Soo koobid</h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-800 tabular-nums">
                  Beertu waxay leedahay <strong>{report.totalPlots} plot</strong> iyo{' '}
                  <strong>{report.totalBlocks} block</strong>. Plots-ka buuxa ku jira xuduudka waa{' '}
                  <strong>{report.totalBuuxaCount}</strong>, kuwa qayb ka baxsan xuduudka waa{' '}
                  <strong>{report.totalQaybCount}</strong>. Plots-ka buuxa ee aan wax calaamad ah
                  loo samayn (Doox ma aha, midab kale ma laha) waa{' '}
                  <strong>{report.buuxaUnlabelledCount}</strong>.
                </p>

                <div className="mt-4 max-w-xl mx-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#1B4332] text-white">
                        <th className="border border-slate-300 px-3.5 py-2 text-left font-semibold">
                          Xaaladda plot-ka
                        </th>
                        <th className="border border-slate-300 px-3.5 py-2 text-center font-semibold w-28">
                          Tirada
                        </th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      <tr className="bg-white">
                        <td className="border border-slate-300 px-3.5 py-1.5">
                          Buuxa ku jira xuduudka - aan la calaamadin
                        </td>
                        <td className="border border-slate-300 px-3.5 py-1.5 text-center">
                          {report.buuxaUnlabelledCount}
                        </td>
                      </tr>
                      <tr className="bg-slate-50/70">
                        <td className="border border-slate-300 px-3.5 py-1.5">
                          Buuxa ku jira - Doox
                        </td>
                        <td className="border border-slate-300 px-3.5 py-1.5 text-center">
                          {report.buuxaDooxCount}
                        </td>
                      </tr>
                      <tr className="bg-white">
                        <td className="border border-slate-300 px-3.5 py-1.5">
                          Buuxa ku jira - calaamad kale (midab PDF)
                        </td>
                        <td className="border border-slate-300 px-3.5 py-1.5 text-center">
                          {report.buuxaKaleCount}
                        </td>
                      </tr>
                      <tr className="bg-slate-100 font-bold">
                        <td className="border border-slate-300 px-3.5 py-2">
                          Wadarta plots buuxa
                        </td>
                        <td className="border border-slate-300 px-3.5 py-2 text-center">
                          {report.totalBuuxaCount}
                        </td>
                      </tr>
                      <tr className="bg-white">
                        <td className="border border-slate-300 px-3.5 py-1.5">
                          Qayb xuduudka ku jirta/qayb ka baxsan - aan la calaamadin
                        </td>
                        <td className="border border-slate-300 px-3.5 py-1.5 text-center">
                          {report.qaybUnlabelledCount}
                        </td>
                      </tr>
                      <tr className="bg-slate-50/70">
                        <td className="border border-slate-300 px-3.5 py-1.5">
                          Qayb xuduud - Doox
                        </td>
                        <td className="border border-slate-300 px-3.5 py-1.5 text-center">
                          {report.qaybDooxCount}
                        </td>
                      </tr>
                      <tr className="bg-white">
                        <td className="border border-slate-300 px-3.5 py-1.5">
                          Qayb xuduud - calaamad kale
                        </td>
                        <td className="border border-slate-300 px-3.5 py-1.5 text-center">
                          {report.qaybKaleCount}
                        </td>
                      </tr>
                      <tr className="bg-slate-100 font-bold">
                        <td className="border border-slate-300 px-3.5 py-2">
                          Wadarta plots qayb xuduud
                        </td>
                        <td className="border border-slate-300 px-3.5 py-2 text-center">
                          {report.totalQaybCount}
                        </td>
                      </tr>
                      <tr className="bg-slate-50 font-bold">
                        <td className="border border-slate-300 px-3.5 py-2">Wadarta guud</td>
                        <td className="border border-slate-300 px-3.5 py-2 text-center">
                          {report.totalPlots}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="mt-3 text-[11px] text-slate-600 tabular-nums">
                  Aagga plots-ka oo dhan: {report.totalPlotsAreaHa.toFixed(2)} ha; qaybta xuduudka
                  gudaha ah (pct_gudaha): {report.insidePlotsAreaHa.toFixed(2)} ha. Plot kasta waa
                  ~{report.nominalPlotAreaSqM} m2.
                </p>

                {/* Section 2: Heerarka blocks-ka */}
                <h2 className="mt-7 text-base font-bold text-slate-900">
                  2. Heerarka blocks-ka
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-800">
                  <strong>Heer 3:</strong> blocks-ka dooxa u dhow (ugu badnaan 30 m ilaa dooxa, ama
                  plot Doox ah leh) - waxaa ku jira R05, R06, R07 iyo blocks kale oo dooxa ku dhow.{' '}
                  <strong>Heer 2:</strong> blocks-ka si toos ah ugu xiga heer 3 (dhinac wadada ku
                  wada leh). <strong>Heer 1:</strong> blocks-ka fog dooxa, dhanka galbeed.
                </p>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#1B4332] text-white">
                        <th className="border border-slate-300 px-2.5 py-2 text-left font-semibold">
                          Heerka
                        </th>
                        <th className="border border-slate-300 px-2 py-2 text-center font-semibold">
                          Blocks
                        </th>
                        <th className="border border-slate-300 px-2 py-2 text-center font-semibold">
                          Plots
                        </th>
                        <th className="border border-slate-300 px-2 py-2 text-center font-semibold">
                          Buuxa
                        </th>
                        <th className="border border-slate-300 px-2 py-2 text-center font-semibold">
                          Qayb xuduud
                        </th>
                        <th className="border border-slate-300 px-2 py-2 text-center font-semibold">
                          Buuxa aan cal.
                        </th>
                        <th className="border border-slate-300 px-2 py-2 text-center font-semibold">
                          Plots Doox
                        </th>
                        <th className="border border-slate-300 px-2 py-2 text-center font-semibold">
                          Calaamad kale
                        </th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {([3, 2, 1] as const).map((h) => {
                        const ts = report.tierSummaries[h];
                        return (
                          <tr key={h} className="bg-white">
                            <td
                              className={`border border-slate-300 px-2.5 py-2 ${getHeerBadgeClass(
                                h
                              )}`}
                            >
                              {ts.label}
                            </td>
                            <td className="border border-slate-300 px-2 py-2 text-center">
                              {ts.blocksCount}
                            </td>
                            <td className="border border-slate-300 px-2 py-2 text-center">
                              {ts.plotsCount}
                            </td>
                            <td className="border border-slate-300 px-2 py-2 text-center">
                              {ts.buuxaCount}
                            </td>
                            <td className="border border-slate-300 px-2 py-2 text-center">
                              {ts.qaybCount}
                            </td>
                            <td className="border border-slate-300 px-2 py-2 text-center">
                              {ts.unlabelledBuuxaCount}
                            </td>
                            <td className="border border-slate-300 px-2 py-2 text-center">
                              {ts.dooxCount}
                            </td>
                            <td className="border border-slate-300 px-2 py-2 text-center">
                              {ts.kaleCount}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-100 font-bold">
                        <td className="border border-slate-300 px-2.5 py-2">Wadar</td>
                        <td className="border border-slate-300 px-2 py-2 text-center">
                          {report.totalBlocks}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center">
                          {report.totalPlots}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center">
                          {report.totalBuuxaCount}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center">
                          {report.totalQaybCount}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center">
                          {report.buuxaUnlabelledCount}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center">
                          {report.buuxaDooxCount + report.qaybDooxCount}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center">
                          {report.buuxaKaleCount + report.qaybKaleCount}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between text-[10.5px] text-slate-400">
                <span>Wareega Beerta - Warbixinta plots-ka iyo heerarka - 25 Oktoobar 2026</span>
                <span>Bogga 1</span>
              </div>
            </section>

            {/* ------------------------- PAGE 2: KHARIIDADDA HEERARKA ------------------------- */}
            <section className="pdf-report-page flex flex-col justify-between min-h-[1080px] bg-white p-8 sm:p-12 shadow-xl ring-1 ring-slate-300 text-slate-900 print:min-h-0 print:shadow-none print:ring-0 print:p-6">
              <div>
                <h2 className="text-base font-bold text-slate-900">3. Khariidadda heerarka</h2>

                <div className="mt-3 bg-white">
                  <svg
                    ref={heerarkaSvgRef}
                    viewBox={`0 0 ${HR_W} ${HR_H}`}
                    className="block h-auto w-full bg-white"
                  >
                    <rect x="0" y="0" width={HR_W} height={HR_H} fill="#FFFFFF" />

                    {/* Top-Left North Arrow (`↑ N`) */}
                    <g transform="translate(52, 26)">
                      <line
                        x1="8"
                        y1="26"
                        x2="8"
                        y2="4"
                        stroke="#111827"
                        strokeWidth="2.2"
                      />
                      <polygon points="8,0 3,9 13,9" fill="#111827" />
                      <text
                        x="8"
                        y="42"
                        textAnchor="middle"
                        fontSize="14"
                        fontWeight="800"
                        fontFamily="Inter, Arial, sans-serif"
                        fill="#111827"
                      >
                        N
                      </text>
                    </g>

                    {/* Plots colored by Heerarka / Yellow Partial / Cyan Doox */}
                    <g id="heerarka_plots">
                      {allPlots.map((pl) => {
                        const prof = report.plotProfilesById[pl.id];
                        const fillHex = prof
                          ? prof.heerarkaFillHex
                          : HEERARKA_MAP_COLORS.heer1Fill;
                        const strokeHex = prof ? prof.heerarkaStrokeHex : '#4B5563';
                        return (
                          <polygon
                            key={pl.id}
                            points={formatPointsAttr(pl.rect, toHrSvg)}
                            fill={fillHex}
                            stroke={strokeHex}
                            strokeWidth="0.45"
                            strokeLinejoin="round"
                          />
                        );
                      })}
                    </g>

                    {/* Block Outlines */}
                    <g id="heerarka_blocks">
                      {subdivisionResult.blocks.map((blk) => (
                        <polygon
                          key={blk.id}
                          points={formatPointsAttr(blk.rect, toHrSvg)}
                          fill="none"
                          stroke={HEERARKA_MAP_COLORS.blockStroke}
                          strokeWidth="0.85"
                          strokeLinejoin="round"
                        />
                      ))}
                    </g>

                    {/* Dooxa Stream Polyline */}
                    <g id="heerarka_dooxa">
                      {report.projectedWadiLinesUtm.map((lineUtm, idx) => (
                        <polyline
                          key={`hr-wadi-${idx}`}
                          points={formatPointsAttr(lineUtm, toHrSvg)}
                          fill="none"
                          stroke={HEERARKA_MAP_COLORS.dooxaLine}
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </g>

                    {/* Xuduudka Beerta Red Perimeter */}
                    <polygon
                      points={formatPointsAttr(subdivisionResult.bring, toHrSvg)}
                      fill="none"
                      stroke={HEERARKA_MAP_COLORS.boundaryLine}
                      strokeWidth="1.9"
                      strokeLinejoin="round"
                    />

                    {/* Centered Block Labels (`R02\nC04` or `DG1`) */}
                    <g id="heerarka_block_labels">
                      {subdivisionResult.blocks.map((blk) => {
                        const [cx, cy] = toHrSvg(blk.centerUtm);
                        const bHeer = report.blockHeerById[blk.id] || 1;
                        const lbl = formatBlockTwoLineLabel(blk.id);
                        const textFill = bHeer === 3 ? '#FFFFFF' : '#111827';
                        return (
                          <g
                            key={`lbl-${blk.id}`}
                            transform={`translate(${cx.toFixed(1)}, ${cy.toFixed(1)})`}
                          >
                            {lbl.line2 ? (
                              <>
                                <text
                                  x="0"
                                  y="-1.5"
                                  textAnchor="middle"
                                  fontSize="7.8"
                                  fontWeight="700"
                                  fontFamily="Inter, Arial, sans-serif"
                                  fill={textFill}
                                  stroke={bHeer === 3 ? '#111827' : '#FFFFFF'}
                                  strokeWidth="1.6"
                                  paintOrder="stroke"
                                >
                                  {lbl.line1}
                                </text>
                                <text
                                  x="0"
                                  y="7"
                                  textAnchor="middle"
                                  fontSize="7.8"
                                  fontWeight="700"
                                  fontFamily="Inter, Arial, sans-serif"
                                  fill={textFill}
                                  stroke={bHeer === 3 ? '#111827' : '#FFFFFF'}
                                  strokeWidth="1.6"
                                  paintOrder="stroke"
                                >
                                  {lbl.line2}
                                </text>
                              </>
                            ) : (
                              <text
                                x="0"
                                y="2.8"
                                textAnchor="middle"
                                fontSize="8"
                                fontWeight="700"
                                fontFamily="Inter, Arial, sans-serif"
                                fill={textFill}
                                stroke={bHeer === 3 ? '#111827' : '#FFFFFF'}
                                strokeWidth="1.6"
                                paintOrder="stroke"
                              >
                                {lbl.line1}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>

                    {/* Bottom-Left 200 m Scale Bar */}
                    <g transform={`translate(48, ${HR_H - 36})`}>
                      <text
                        x={hr200mPx / 2}
                        y="-7"
                        textAnchor="middle"
                        fontSize="11"
                        fontFamily="Inter, Arial, sans-serif"
                        fill="#111827"
                      >
                        {hr200mMeters} m
                      </text>
                      <line
                        x1="0"
                        y1="0"
                        x2={hr200mPx}
                        y2="0"
                        stroke="#111827"
                        strokeWidth="3.5"
                      />
                    </g>

                    {/* Bottom-Right Rounded Legend Box */}
                    <g transform={`translate(${HR_W - 236}, ${HR_H - 166})`}>
                      <rect
                        x="0"
                        y="0"
                        width="224"
                        height="152"
                        rx="4"
                        fill="#FFFFFF"
                        fillOpacity="0.96"
                        stroke="#CBD5E1"
                        strokeWidth="1"
                      />
                      {[
                        {
                          type: 'box',
                          fill: HEERARKA_MAP_COLORS.heer3Fill,
                          stroke: 'none',
                          label: 'Heer 3 - dooxa u dhow',
                        },
                        {
                          type: 'box',
                          fill: HEERARKA_MAP_COLORS.heer2Fill,
                          stroke: 'none',
                          label: 'Heer 2 - ku xiga',
                        },
                        {
                          type: 'box',
                          fill: HEERARKA_MAP_COLORS.heer1Fill,
                          stroke: 'none',
                          label: 'Heer 1 - fog (galbeed)',
                        },
                        {
                          type: 'box',
                          fill: HEERARKA_MAP_COLORS.partialPlotFill,
                          stroke: HEERARKA_MAP_COLORS.partialPlotStroke,
                          label: 'Plot qayb xuduudka ka baxsan',
                        },
                        {
                          type: 'box',
                          fill: HEERARKA_MAP_COLORS.dooxPlotFill,
                          stroke: HEERARKA_MAP_COLORS.dooxPlotStroke,
                          label: 'Plot Doox',
                        },
                        {
                          type: 'line',
                          stroke: HEERARKA_MAP_COLORS.dooxaLine,
                          label: 'Dooxa',
                        },
                        {
                          type: 'line',
                          stroke: HEERARKA_MAP_COLORS.boundaryLine,
                          label: 'Xuduudka beerta',
                        },
                      ].map((row, i) => {
                        const ry = 12 + i * 19.5;
                        return (
                          <g key={row.label} transform={`translate(10, ${ry})`}>
                            {row.type === 'box' ? (
                              <rect
                                x="0"
                                y="0"
                                width="18"
                                height="10"
                                fill={row.fill}
                                stroke={row.stroke}
                                strokeWidth={row.stroke === 'none' ? '0' : '0.9'}
                              />
                            ) : (
                              <line
                                x1="0"
                                y1="5"
                                x2="18"
                                y2="5"
                                stroke={row.stroke}
                                strokeWidth="2.4"
                              />
                            )}
                            <text
                              x="25"
                              y="8.8"
                              fontSize="10"
                              fontFamily="Inter, Arial, sans-serif"
                              fill="#111827"
                            >
                              {row.label}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-[10.5px] text-slate-400">
                <span>Wareega Beerta - Warbixinta plots-ka iyo heerarka - 25 Oktoobar 2026</span>
                <span>Bogga 2</span>
              </div>
            </section>

            {/* ------------------------- PAGE 3: LIISKA BLOCKS-KA (PART 1) ------------------------- */}
            <section className="pdf-report-page flex flex-col justify-between min-h-[1080px] bg-white p-8 sm:p-12 shadow-xl ring-1 ring-slate-300 text-slate-900 print:min-h-0 print:shadow-none print:ring-0 print:p-6">
              <div>
                <h2 className="text-base font-bold text-slate-900 tabular-nums">
                  4. Liiska blocks-ka ({report.totalBlocks})
                </h2>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-[#1B4332] text-white">
                        <th className="border border-slate-300 px-2.5 py-1.5 text-left font-semibold">
                          Block
                        </th>
                        <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                          Heer
                        </th>
                        <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                          Masaafo dooxa (m)
                        </th>
                        <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                          Plots
                        </th>
                        <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                          Buuxa
                        </th>
                        <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                          Qayb
                        </th>
                        <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                          Aan cal. (buuxa)
                        </th>
                        <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                          Doox
                        </th>
                        <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                          Kale
                        </th>
                        <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                          R05-R07
                        </th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {page3BlockRows.map((row, idx) => (
                        <tr
                          key={row.blockId}
                          className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}
                        >
                          <td className="border border-slate-300 px-2.5 py-1 text-left font-medium">
                            {row.blockId}
                          </td>
                          <td
                            className={`border border-slate-300 px-2 py-1 text-center ${getHeerBadgeClass(
                              row.heer
                            )}`}
                          >
                            {row.heer}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center">
                            {Math.round(row.distanceToDooxM)}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center">
                            {row.plotsTotal}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center">
                            {row.buuxaCount}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center">
                            {row.qaybCount}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center">
                            {row.unlabelledBuuxaCount}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center">
                            {row.dooxCount}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center">
                            {row.kaleCount}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center">
                            {row.safR05R07}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between text-[10.5px] text-slate-400">
                <span>Wareega Beerta - Warbixinta plots-ka iyo heerarka - 25 Oktoobar 2026</span>
                <span>Bogga 3</span>
              </div>
            </section>

            {/* ------------------------- PAGE 4: LIISKA BLOCKS-KA (PART 2) + HABKA ------------------------- */}
            <section className="pdf-report-page flex flex-col justify-between min-h-[1080px] bg-white p-8 sm:p-12 shadow-xl ring-1 ring-slate-300 text-slate-900 print:min-h-0 print:shadow-none print:ring-0 print:p-6">
              <div>
                {page4BlockRows.length > 0 && (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-[#1B4332] text-white">
                            <th className="border border-slate-300 px-2.5 py-1.5 text-left font-semibold">
                              Block
                            </th>
                            <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                              Heer
                            </th>
                            <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                              Masaafo dooxa (m)
                            </th>
                            <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                              Plots
                            </th>
                            <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                              Buuxa
                            </th>
                            <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                              Qayb
                            </th>
                            <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                              Aan cal. (buuxa)
                            </th>
                            <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                              Doox
                            </th>
                            <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                              Kale
                            </th>
                            <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                              R05-R07
                            </th>
                          </tr>
                        </thead>
                        <tbody className="tabular-nums">
                          {page4BlockRows.map((row, idx) => (
                            <tr
                              key={row.blockId}
                              className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}
                            >
                              <td className="border border-slate-300 px-2.5 py-1 text-left font-medium">
                                {row.blockId}
                              </td>
                              <td
                                className={`border border-slate-300 px-2 py-1 text-center ${getHeerBadgeClass(
                                  row.heer
                                )}`}
                              >
                                {row.heer}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-center">
                                {Math.round(row.distanceToDooxM)}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-center">
                                {row.plotsTotal}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-center">
                                {row.buuxaCount}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-center">
                                {row.qaybCount}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-center">
                                {row.unlabelledBuuxaCount}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-center">
                                {row.dooxCount}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-center">
                                {row.kaleCount}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-center">
                                {row.safR05R07}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-[10.5px] text-slate-600 leading-relaxed">
                      &apos;ha&apos; = block heer 3 ah oo ku jira safka R05, R06 ama R07 (ee aad
                      magacawday). Haddii aad rabto heer 3 oo ah safafkaas oo keliya, tiirkan
                      (saf_R05_R07) ayaa kala saaraya GeoJSON-ka.
                    </p>
                  </>
                )}

                {/* Section 5: Habka iyo hubinta */}
                <h2 className="mt-6 text-base font-bold text-slate-900">
                  5. Habka iyo hubinta
                </h2>
                <div className="mt-2.5 space-y-2 text-[11.5px] leading-relaxed text-slate-800 tabular-nums">
                  <p>
                    <strong>- Xogta:</strong> 03_plots ({report.totalPlots}), 02_blocks (
                    {report.totalBlocks}), 01_xuduudka_beerta, 05_dooxyada (dooxa) iyo
                    Automatic_Layout11.pdf. Masaafada waxaa lagu xisaabiyey EPSG:32638 (UTM 38N).
                  </p>
                  <p>
                    <strong>- Buuxa vs qayb:</strong> waxaa loo adeegsaday tiirarka plots-ka ee
                    jira: goostay=0 / pct_gudaha=100 waa buuxa ({report.totalBuuxaCount});
                    goostay=1 waa qayb xuduud ({report.totalQaybCount}, pct_gudaha 52-96%).
                  </p>
                  <p>
                    <strong>- Calaamad:</strong> Doox = tiirka doox (
                    {report.buuxaDooxCount + report.qaybDooxCount}). &apos;Calaamad kale&apos; =
                    midabada PDF-ka (Danguud {report.layout11LegendCounts.Danguud}, Tacab{' '}
                    {report.layout11LegendCounts.Tacab}, Milgo {report.layout11LegendCounts.Milgo},
                    Ina Muuse {report.layout11LegendCounts['Ina Muuse']}, CWAHAAB{' '}
                    {report.layout11LegendCounts.CWAHAAB}, Shafool{' '}
                    {report.layout11LegendCounts.Shafool}, Xamse Mubaarig{' '}
                    {report.layout11LegendCounts['Xamse Mubaarig']}, Culimo{' '}
                    {report.layout11LegendCounts.Culimo}, Xaq {report.layout11LegendCounts.Xaq} ={' '}
                    {report.buuxaKaleCount + report.qaybKaleCount}); kuwaas waxaa PDF-ka laga soo
                    wareejiyey plots-ka GeoJSON iyadoo la isticmaalay xuduudka beerta (xiriirka{' '}
                    {report.totalPlots}/{report.totalPlots}, Doox{' '}
                    {report.buuxaDooxCount + report.qaybDooxCount}/
                    {report.buuxaDooxCount + report.qaybDooxCount} iyo goostay{' '}
                    {report.totalQaybCount}/{report.totalQaybCount} si buuxda ayay isku waafaqeen).
                    Midabadan GeoJSON-ka asalka ah kuma jiraan.
                  </p>
                  <p>
                    <strong>- Hubinta joomatari:</strong> marka pct_gudaha dib looga xisaabiyo
                    xuduudka GeoJSON-ka, 5 plot oo 100% ahaa ayaa noqda 97-99% (xuduudka kala
                    duwanaansho yar: {report.boundaryAreaComputedHa.toFixed(2)} ha oo la xisaabiyey
                    vs {report.boundaryAreaDisplayHa.toFixed(2)} ha oo ku qoran xarunta). Waxaan ku
                    kalsoonaaday tiirarka asalka ah.
                  </p>
                  <p>
                    <strong>- Heerarka:</strong> heer 3 = masaafo &lt;= 30 m ama plot Doox ah; heer
                    2 = block ku xiga heer 3 (afar dhinac); heer 1 = inta kale. Tilmaamaha
                    &apos;R07, R06, R05&apos; waxaa loo fahmay safaf (saf); blocks-ka kale ee dooxa
                    ku dhow (R01-R04, R08-R13) sidoo kale waxay heer 3 ka mid yihiin sababtoo ah
                    masaafadooda dooxa.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between text-[10.5px] text-slate-400">
                <span>Wareega Beerta - Warbixinta plots-ka iyo heerarka - 25 Oktoobar 2026</span>
                <span>Bogga 4</span>
              </div>
            </section>
          </div>
        )}
      </div>
      )}
    </div>
  );
};
