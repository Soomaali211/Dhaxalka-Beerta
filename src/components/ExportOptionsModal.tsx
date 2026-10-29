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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Doorashooyinka Soo-saarista"
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#0B1220] border border-[#243449] text-[#F8FAFC] p-5 pb-safe shadow-2xl">
        <div className="w-10 h-1.5 bg-[#243449] rounded-full mx-auto mb-3 sm:hidden" />

        {/* Modal Top Header */}
        <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-[#243449]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#22C55E]/15 text-[#22C55E] flex items-center justify-center shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-extrabold text-[#F8FAFC] tracking-tight">Soo saar</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Xir"
            className="min-h-[44px] min-w-[44px] -mr-2 rounded-xl flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0F1B2D] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Subtitle + Visible Count */}
        <div className="flex items-center justify-between mt-4 mb-2.5 px-0.5">
          <span className="text-sm font-bold text-[#F8FAFC]">Doorashooyinka Soo-saarista</span>
          <span className="text-xs font-mono-numbers tabular-nums font-semibold text-[#94A3B8]">
            {displayedCount} Muuqda
          </span>
        </div>

        {/* "Kuwa Muuqda Keliya" Switch Card */}
        <div className="rounded-2xl bg-[#0F1B2D] border border-[#243449] px-4 py-3 mb-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <SlidersHorizontal className="w-4 h-4 text-[#22C55E] shrink-0" />
            <span className="text-sm font-semibold text-[#F8FAFC] truncate">
              Kuwa Muuqda Keliya
            </span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={onlyVisible}
            onClick={() => setOnlyVisible((prev) => !prev)}
            className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer shrink-0 ${
              onlyVisible ? 'bg-[#22C55E]' : 'bg-[#243449]'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                onlyVisible ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Export Option Action Cards (Screen 4 Match + Preserved Excel/Shapefile) */}
        <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-0.5">
          {/* Quick Copy Text Fallback Row (for environments where file download is blocked) */}
          {hasGisPlots && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyGeoJsonText}
                className="min-h-[44px] rounded-2xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#22C55E]/40 hover:border-[#22C55E] px-3 py-2 flex items-center justify-center gap-2 text-xs font-extrabold text-[#F8FAFC] transition-colors cursor-pointer"
              >
                {copiedMode === 'geojson' ? (
                  <>
                    <Check className="w-4 h-4 text-[#22C55E] shrink-0" />
                    <span>La koobiyeeyey</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-[#22C55E] shrink-0" />
                    <span>Koobiyee GeoJSON</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyCsvText}
                className="min-h-[44px] rounded-2xl bg-[#0F1B2D] hover:bg-[#15243B] border border-sky-400/40 hover:border-sky-400 px-3 py-2 flex items-center justify-center gap-2 text-xs font-extrabold text-[#F8FAFC] transition-colors cursor-pointer"
              >
                {copiedMode === 'csv' ? (
                  <>
                    <Check className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>La koobiyeeyey</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-sky-400 shrink-0" />
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
            className="w-full min-h-[64px] rounded-2xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#243449] hover:border-[#22C55E]/60 px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#22C55E] flex items-center justify-center shrink-0">
                <FileCode2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#F8FAFC] truncate">
                  Faylka GeoJSON (.geojson)
                </div>
                <div className="text-xs text-[#94A3B8] truncate">
                  Lakabyada khariidadda (xuduud, blocks &amp; plots)
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#94A3B8] shrink-0" />
          </button>

          {/* 1A-0. Export Khariidadda Muuqaalka Dhaxalka PDF */}
          {hasGisPlots && onOpenCartographicPdfModal && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCartographicPdfModal('inheritance_map');
              }}
              className="w-full min-h-[64px] rounded-2xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#22C55E]/45 hover:border-[#22C55E] px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#22C55E] flex items-center justify-center shrink-0">
                  <Printer className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#F8FAFC] truncate">
                    Khariidadda Muuqaalka Dhaxalka (PDF)
                  </div>
                  <div className="text-xs text-[#94A3B8] truncate">
                    Cinwaanka, Sumadaha Dhaxlayaasha, North Arrow, Scale, Xigashada &amp; Qaabka Bogga
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#94A3B8] shrink-0" />
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
              className="w-full min-h-[64px] rounded-2xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#243449] hover:border-[#22C55E]/70 px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#22C55E] flex items-center justify-center shrink-0">
                  <MapIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#F8FAFC] truncate">
                    Khariidadda Beerta PDF (Automatic_Layout11)
                  </div>
                  <div className="text-xs text-[#94A3B8] truncate">
                    100% QGIS Layout · Xuduudka, Dooxyada &amp; Sumadaha
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#94A3B8] shrink-0" />
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
              className="w-full min-h-[64px] rounded-2xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#243449] hover:border-teal-400/60 px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-300 flex items-center justify-center shrink-0">
                  <Printer className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#F8FAFC] truncate">
                    Warbixinta Heerarka Beerta PDF (4 Bog)
                  </div>
                  <div className="text-xs text-[#94A3B8] truncate">
                    Heer 3 / 2 / 1 · Khariidadda Heerarka &amp; Jadwalka Blocks-ka
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#94A3B8] shrink-0" />
            </button>
          )}

          {/* 2. Shahaadada Dhaxalka PDF */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onExportLayoutPdf();
            }}
            className="w-full min-h-[64px] rounded-2xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#243449] hover:border-rose-400/60 px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#F8FAFC] truncate">
                  Shahaadada Dhaxalka PDF
                </div>
                <div className="text-xs text-[#94A3B8] truncate">
                  Warqadda rasmiga ah ee Faraa&apos;idka &amp; Saamiyada
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#94A3B8] shrink-0" />
          </button>

          {/* 3. Jadwalka Xogta CSV */}
          <button
            type="button"
            onClick={handleExportCsvTable}
            className="w-full min-h-[64px] rounded-2xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#243449] hover:border-sky-400/60 px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
                <Table2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#F8FAFC] truncate">
                  Jadwalka Xogta CSV
                </div>
                <div className="text-xs text-[#94A3B8] truncate">
                  Diiwaanka cabbirrada plots-ka &amp; saamiyada
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#94A3B8] shrink-0" />
          </button>

          {/* 4. Buugga Xogta Excel (.xlsx) */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onExportExcelWorkbook();
            }}
            className="w-full min-h-[60px] rounded-2xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#243449] hover:border-emerald-400/60 px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#F8FAFC] truncate">
                  Buugga Xogta Excel (.xlsx)
                </div>
                <div className="text-xs text-[#94A3B8] truncate">
                  Warbixinta buuxda ee Faraa&apos;idka &amp; GIS
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#94A3B8] shrink-0" />
          </button>

          {/* 5. Xogta GIS Shapefile (.zip) */}
          {hasGisPlots && (
            <button
              type="button"
              disabled={isExportingShp}
              onClick={handleExportShapefile}
              className="w-full min-h-[60px] rounded-2xl bg-[#0F1B2D] hover:bg-[#15243B] border border-[#243449] hover:border-amber-400/60 px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <FolderArchive className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#F8FAFC] truncate">
                    {isExportingShp ? 'Dhoofinaya Shapefile...' : 'Xogta GIS Shapefile (.zip)'}
                  </div>
                  <div className="text-xs text-[#94A3B8] truncate">
                    QGIS &amp; ArcGIS (.shp, .dbf, .prj)
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#94A3B8] shrink-0" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
