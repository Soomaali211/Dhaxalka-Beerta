import React, { useState } from 'react';
import {
  Download,
  X,
  SlidersHorizontal,
  FileCode2,
  FileText,
  Table2,
  FileSpreadsheet,
  FolderArchive,
  ChevronRight,
  Map as MapIcon,
  Printer,
  Copy,
  Check,
} from 'lucide-react';
import {
  CaseExportMetadata,
  FairLandAllocationResult,
  LandSubdivisionState,
  SubdivisionComputationResult,
} from '../types/landSubdivision';
import {
  buildPlotRegisterCSV,
  downloadSubdivisionCSV,
  downloadSubdivisionGeoJSON,
  downloadSubdivisionShapefileZip,
} from '../utils/landSubdivisionEngine';
import {
  buildPlotsGeoJsonClipboardText,
  copyTextSafelyToClipboard,
} from '../utils/nashqadWorkflowEngine';
import { computeUnifiedFarmMetrics } from '../utils/unifiedMetrics';

interface ExportOptionsModalProps {
  isOpen: boolean;
  visibleCount: number;
  totalCount: number;
  visiblePlotIds?: Set<string> | null;
  subdivisionState: LandSubdivisionState;
  subdivisionResult: SubdivisionComputationResult | null;
  fairAllocation: FairLandAllocationResult | null;
  activeCaseMeta?: CaseExportMetadata;
  onClose: () => void;
  onExportLayoutPdf: () => void;
  onOpenCartographicPdfModal?: (
    mode: 'layout11' | 'heerarka_report' | 'inheritance_map'
  ) => void;
  onExportExcelWorkbook: () => void;
  onExportInheritanceCsv: () => void;
  onNotify: (title: string, message: string) => void;
}

export const ExportOptionsModal: React.FC<ExportOptionsModalProps> = ({
  isOpen,
  visibleCount,
  totalCount,
  visiblePlotIds,
  subdivisionState,
  subdivisionResult,
  fairAllocation,
  activeCaseMeta,
  onClose,
  onExportLayoutPdf,
  onOpenCartographicPdfModal,
  onExportExcelWorkbook,
  onExportInheritanceCsv,
  onNotify,
}) => {
  const [onlyVisible, setOnlyVisible] = useState<boolean>(true);
  const [isExportingShp, setIsExportingShp] = useState<boolean>(false);
  const [copiedMode, setCopiedMode] = useState<'geojson' | 'csv' | null>(null);

  if (!isOpen) return null;

  const unifiedMetrics = computeUnifiedFarmMetrics(subdivisionState, subdivisionResult);
  const hasGisPlots = Boolean(
    subdivisionResult &&
      (subdivisionResult.plots.length > 0 ||
        (subdivisionResult.allEvaluatedPlots?.length || 0) > 0)
  );

  // Build filtered SubdivisionComputationResult if `onlyVisible` is active and a subset filter is applied
  const getTargetSubdivisionResult = (): SubdivisionComputationResult | null => {
    if (!subdivisionResult) return null;
    if (!onlyVisible || !visiblePlotIds || visiblePlotIds.size === 0) {
      return subdivisionResult;
    }
    const filteredFullPlots = subdivisionResult.plots.filter((p) => visiblePlotIds.has(p.id));
    const filteredEvalPlots = subdivisionResult.allEvaluatedPlots
      ? subdivisionResult.allEvaluatedPlots.filter((p) => visiblePlotIds.has(p.id))
      : undefined;
    if (filteredFullPlots.length === 0 && (!filteredEvalPlots || filteredEvalPlots.length === 0)) {
      return subdivisionResult;
    }
    const activeBlockIds = new Set<string>([
      ...filteredFullPlots.map((p) => p.block),
      ...(filteredEvalPlots || []).map((p) => p.block),
    ]);
    return {
      ...subdivisionResult,
      plots: filteredFullPlots,
      allEvaluatedPlots: filteredEvalPlots,
      blocks: subdivisionResult.blocks.filter((b) => activeBlockIds.has(b.id)),
    };
  };

  const handleExportGeoJson = () => {
    const targetRes = getTargetSubdivisionResult();
    if (!targetRes) {
      onNotify(
        'Khariidad GIS Ma Jirto',
        'Marka hore fur ama soo geli xogta GIS si aad u dhoofiso GeoJSON.'
      );
      return;
    }
    downloadSubdivisionGeoJSON(
      targetRes,
      subdivisionState.blockTiers,
      subdivisionState.plotTierOverrides,
      fairAllocation,
      { ...subdivisionState, caseMeta: activeCaseMeta }
    );
    onNotify('GeoJSON Waa La Dhoofiyey', 'Faylka vector-ka ee lakabyada GIS waa la soo dejiyey.');
    onClose();
  };

  const handleExportCsvTable = () => {
    const targetRes = getTargetSubdivisionResult();
    if (hasGisPlots && targetRes) {
      downloadSubdivisionCSV(
        targetRes,
        subdivisionState.blockTiers,
        subdivisionState.plotTierOverrides,
        fairAllocation,
        { ...subdivisionState, caseMeta: activeCaseMeta }
      );
    } else {
      onExportInheritanceCsv();
    }
    onNotify('CSV Data Table Waa La Dhoofiyey', 'Shaxda xogta CSV waa la soo dejiyey.');
    onClose();
  };

  const handleExportShapefile = async () => {
    const targetRes = getTargetSubdivisionResult();
    if (!targetRes) return;
    setIsExportingShp(true);
    try {
      await downloadSubdivisionShapefileZip(
        targetRes,
        subdivisionState.blockTiers,
        subdivisionState.plotTierOverrides,
        fairAllocation,
        'wgs',
        { ...subdivisionState, caseMeta: activeCaseMeta }
      );
      onNotify('Shapefile (.zip) Waa La Dhoofiyey', 'Xirmada QGIS / ArcGIS waa la soo dejiyey.');
      onClose();
    } finally {
      setIsExportingShp(false);
    }
  };

  const handleCopyGeoJsonText = async () => {
    const txt = buildPlotsGeoJsonClipboardText(subdivisionState, getTargetSubdivisionResult());
    if (!txt) {
      onNotify('Xog Lama Helin', 'Marka hore samee ama soo geli nashqad beer.');
      return;
    }
    const ok = await copyTextSafelyToClipboard(txt);
    if (ok) {
      setCopiedMode('geojson');
      onNotify('GeoJSON Waa La Koobiyeeyey', 'Qoraalka GeoJSON waa lagu koobiyeeyey clipboard-ka.');
      window.setTimeout(() => setCopiedMode(null), 2200);
    } else {
      onNotify('Koobiyeyntu Ma Shaqayn', 'Fadlan mar kale isku day koobiyeynta qoraalka.');
    }
  };

  const handleCopyCsvText = async () => {
    const targetRes = getTargetSubdivisionResult();
    if (!targetRes) {
      onNotify('Xog Lama Helin', 'Marka hore samee ama soo geli nashqad beer.');
      return;
    }
    const csvTxt = buildPlotRegisterCSV(
      targetRes,
      subdivisionState.blockTiers,
      subdivisionState.plotTierOverrides,
      fairAllocation,
      { ...subdivisionState, caseMeta: activeCaseMeta }
    );
    const ok = await copyTextSafelyToClipboard(csvTxt);
    if (ok) {
      setCopiedMode('csv');
      onNotify('CSV Waa La Koobiyeeyey', 'Qoraalka jadwalka CSV waa lagu koobiyeeyey clipboard-ka.');
      window.setTimeout(() => setCopiedMode(null), 2200);
    } else {
      onNotify('Koobiyeyntu Ma Shaqayn', 'Fadlan mar kale isku day koobiyeynta qoraalka.');
    }
  };

  const displayedCount = onlyVisible ? visibleCount : totalCount;

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/75 backdrop-blur-xs p-2.5 sm:p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Doorashooyinka Soo-saarista"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[84dvh] flex flex-col overflow-hidden rounded-2xl bg-[#0B1220] border border-[#243449] text-[#F8FAFC] shadow-2xl"
      >
        {/* Sticky Compact Modal Header */}
        <div className="px-3.5 py-2.5 bg-[#0F1B2D] border-b border-[#243449] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#22C55E]/15 text-[#22C55E] flex items-center justify-center shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold text-[#F8FAFC] tracking-tight truncate">
                Soo saar
              </h2>
              <span className="text-[11px] font-mono-numbers tabular-nums font-semibold text-[#a9b8d0]">
                {displayedCount} Muuqda
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Xir"
            className="h-9 w-9 rounded-xl flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0B1220] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Compact Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-2">
          {unifiedMetrics.hasMap && (
            <div className="rounded-xl bg-[#111b2e] border border-[#223250] px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10.5px] font-mono-numbers tabular-nums text-[#a9b8d0]">
              <span>
                Buuxa: <strong className="text-[#e8eef7]">{unifiedMetrics.fullPlotsCount}</strong> · Half:{' '}
                <strong className="text-[#38bdf8]">{unifiedMetrics.halfPlotsCount}</strong>
              </span>
              <span>
                Plots: <strong className="text-[#22c55e]">{unifiedMetrics.allPlotsAreaSqM.toLocaleString()} m²</strong> · Xuduud:{' '}
                <strong className="text-[#e8eef7]">{unifiedMetrics.boundaryAreaHa} ha</strong>
              </span>
            </div>
          )}

          {/* "Kuwa Muuqda Keliya" Switch Card */}
          <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] px-3 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#22C55E] shrink-0" />
              <span className="text-xs font-semibold text-[#F8FAFC] truncate">
                Kuwa Muuqda Keliya
              </span>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={onlyVisible}
              onClick={() => setOnlyVisible((prev) => !prev)}
              className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
                onlyVisible ? 'bg-[#22C55E]' : 'bg-[#243449]'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  onlyVisible ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Quick Copy Text Fallback Row */}
          {hasGisPlots && (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={handleCopyGeoJsonText}
                className="min-h-[38px] rounded-xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#22C55E]/40 hover:border-[#22C55E] px-2.5 py-1.5 flex items-center justify-center gap-1.5 text-[11px] font-extrabold text-[#F8FAFC] transition-colors cursor-pointer"
              >
                {copiedMode === 'geojson' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#22C55E] shrink-0" />
                    <span>La koobiyeeyey</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#22C55E] shrink-0" />
                    <span>Koobiyee GeoJSON</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyCsvText}
                className="min-h-[38px] rounded-xl bg-[#0F1B2D] hover:bg-[#15243B] border border-sky-400/40 hover:border-sky-400 px-2.5 py-1.5 flex items-center justify-center gap-1.5 text-[11px] font-extrabold text-[#F8FAFC] transition-colors cursor-pointer"
              >
                {copiedMode === 'csv' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>La koobiyeeyey</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>Koobiyee CSV</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* 1. Soo saar GeoJSON */}
          <button
            type="button"
            disabled={!hasGisPlots}
            onClick={handleExportGeoJson}
            className="w-full min-h-[50px] rounded-xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#243449] hover:border-[#22C55E]/60 px-3 py-2 flex items-center justify-between gap-2.5 text-left transition-colors disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#22C55E] flex items-center justify-center shrink-0">
                <FileCode2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#F8FAFC] truncate">
                  Faylka GeoJSON (.geojson)
                </div>
                <div className="text-[11px] text-[#94A3B8] truncate">
                  Lakabyada khariidadda (xuduud, blocks &amp; plots)
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
          </button>

          {/* 1A-0. Export Khariidadda Muuqaalka Dhaxalka PDF */}
          {hasGisPlots && onOpenCartographicPdfModal && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCartographicPdfModal('inheritance_map');
              }}
              className="w-full min-h-[50px] rounded-xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#22C55E]/45 hover:border-[#22C55E] px-3 py-2 flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#22C55E] flex items-center justify-center shrink-0">
                  <Printer className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#F8FAFC] truncate">
                    Khariidadda Muuqaalka Dhaxalka (PDF)
                  </div>
                  <div className="text-[11px] text-[#94A3B8] truncate">
                    Sumadaha Dhaxlayaasha, North Arrow, Scale &amp; Qaabka Bogga
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
            </button>
          )}

          {/* 1A. Export Khariidadda Beerta PDF (Automatic_Layout11) */}
          {hasGisPlots && onOpenCartographicPdfModal && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCartographicPdfModal('layout11');
              }}
              className="w-full min-h-[50px] rounded-xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#243449] hover:border-[#22C55E]/70 px-3 py-2 flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#22C55E] flex items-center justify-center shrink-0">
                  <MapIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#F8FAFC] truncate">
                    Khariidadda Beerta PDF (Automatic_Layout11)
                  </div>
                  <div className="text-[11px] text-[#94A3B8] truncate">
                    100% QGIS Layout · Xuduudka, Dooxyada &amp; Sumadaha
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
            </button>
          )}

          {/* 1B. Export Warbixinta Heerarka Beerta PDF (4 Pages) */}
          {hasGisPlots && onOpenCartographicPdfModal && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCartographicPdfModal('heerarka_report');
              }}
              className="w-full min-h-[50px] rounded-xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#243449] hover:border-teal-400/60 px-3 py-2 flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-300 flex items-center justify-center shrink-0">
                  <Printer className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#F8FAFC] truncate">
                    Warbixinta Heerarka Beerta PDF (4 Bog)
                  </div>
                  <div className="text-[11px] text-[#94A3B8] truncate">
                    Heer 3 / 2 / 1 · Khariidadda Heerarka &amp; Jadwalka Blocks-ka
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
            </button>
          )}

          {/* 2. Shahaadada Dhaxalka PDF */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onExportLayoutPdf();
            }}
            className="w-full min-h-[50px] rounded-xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#243449] hover:border-rose-400/60 px-3 py-2 flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#F8FAFC] truncate">
                  Shahaadada Dhaxalka PDF
                </div>
                <div className="text-[11px] text-[#94A3B8] truncate">
                  Warqadda rasmiga ah ee Faraa&apos;idka &amp; Saamiyada
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
          </button>

          {/* 3. Jadwalka Xogta CSV */}
          <button
            type="button"
            onClick={handleExportCsvTable}
            className="w-full min-h-[50px] rounded-xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#243449] hover:border-sky-400/60 px-3 py-2 flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
                <Table2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#F8FAFC] truncate">
                  Jadwalka Xogta CSV
                </div>
                <div className="text-[11px] text-[#94A3B8] truncate">
                  Diiwaanka cabbirrada plots-ka &amp; saamiyada
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
          </button>

          {/* 4. Buugga Xogta Excel (.xlsx) */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onExportExcelWorkbook();
            }}
            className="w-full min-h-[50px] rounded-xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#243449] hover:border-emerald-400/60 px-3 py-2 flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#F8FAFC] truncate">
                  Buugga Xogta Excel (.xlsx)
                </div>
                <div className="text-[11px] text-[#94A3B8] truncate">
                  Warbixinta buuxda ee Faraa&apos;idka &amp; GIS
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
          </button>

          {/* 5. Xogta GIS Shapefile (.zip) */}
          {hasGisPlots && (
            <button
              type="button"
              disabled={isExportingShp}
              onClick={handleExportShapefile}
              className="w-full min-h-[50px] rounded-xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#243449] hover:border-amber-400/60 px-3 py-2 flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <FolderArchive className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#F8FAFC] truncate">
                    {isExportingShp ? 'Dhoofinaya Shapefile...' : 'Xogta GIS Shapefile (.zip)'}
                  </div>
                  <div className="text-[11px] text-[#94A3B8] truncate">
                    QGIS &amp; ArcGIS (.shp, .dbf, .prj)
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
