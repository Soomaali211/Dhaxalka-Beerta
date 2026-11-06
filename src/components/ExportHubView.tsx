import React, { useState } from 'react';
import {
  Download,
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
  Cloud,
  LayoutTemplate,
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

interface ExportHubViewProps {
  visibleCount: number;
  totalCount: number;
  visiblePlotIds?: Set<string> | null;
  subdivisionState: LandSubdivisionState;
  subdivisionResult: SubdivisionComputationResult | null;
  fairAllocation: FairLandAllocationResult | null;
  activeCaseMeta?: CaseExportMetadata;
  onExportLayoutPdf: () => void;
  onOpenCartographicPdfModal: (
    mode: 'layout11' | 'heerarka_report' | 'inheritance_map'
  ) => void;
  onExportExcelWorkbook: () => void;
  onExportInheritanceCsv: () => void;
  onOpenBackupRestore: () => void;
  onNotify: (title: string, message: string) => void;
}

export const ExportHubView: React.FC<ExportHubViewProps> = ({
  visibleCount,
  totalCount,
  visiblePlotIds,
  subdivisionState,
  subdivisionResult,
  fairAllocation,
  activeCaseMeta,
  onExportLayoutPdf,
  onOpenCartographicPdfModal,
  onExportExcelWorkbook,
  onExportInheritanceCsv,
  onOpenBackupRestore,
  onNotify,
}) => {
  const [onlyVisible, setOnlyVisible] = useState<boolean>(true);
  const [isExportingShp, setIsExportingShp] = useState<boolean>(false);
  const [copiedMode, setCopiedMode] = useState<'geojson' | 'csv' | null>(null);
  const [selectedExportType, setSelectedExportType] = useState<
    'map_pdf' | 'heerarka_pdf' | 'excel' | 'geojson' | 'csv'
  >('map_pdf');

  const metrics = computeUnifiedFarmMetrics(subdivisionState, subdivisionResult);
  const hasGisPlots = metrics.hasMap && (metrics.fullPlotsCount > 0 || metrics.halfPlotsCount > 0);

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
    onNotify('Jadwalka CSV Waa La Dhoofiyey', 'Shaxda xogta CSV waa la soo dejiyey.');
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
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 pb-24 space-y-4">
      {/* Unified Farm & Case Metrics Summary Card (E10 & E11) */}
      <section className="rounded-2xl bg-[#111b2e] border border-[#223250] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-[#22c55e] shrink-0" />
              <span className="text-xs font-mono-numbers font-bold text-[#22c55e]">
                {activeCaseMeta?.referenceNumber || 'KIIS'}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#e8eef7] line-clamp-2 mt-0.5">
              {activeCaseMeta?.caseName || 'Xarunta Soo-saarista & Daabacaadda'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onOpenBackupRestore}
            className="min-h-[44px] px-3 rounded-xl bg-[#0a1220] hover:bg-[#16243d] border border-[#223250] hover:border-[#22c55e]/60 inline-flex items-center gap-2 text-xs font-bold text-[#e8eef7] transition-colors shrink-0 cursor-pointer"
          >
            <Cloud className="w-4 h-4 text-[#22c55e]" />
            <span>Google Drive</span>
          </button>
        </div>

        {metrics.hasMap ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="rounded-xl bg-[#0a1220] border border-[#223250] px-3 py-2">
              <div className="text-[11px] text-[#a9b8d0]">Bedka Xuduudka Beerta</div>
              <div className="text-sm font-extrabold font-mono-numbers tabular-nums text-[#e8eef7] mt-0.5">
                {metrics.boundaryAreaSqM.toLocaleString()} m²
              </div>
              <div className="text-[11px] font-mono-numbers tabular-nums text-[#a9b8d0]">
                {metrics.boundaryAreaHa} ha · {metrics.blocksCount} Blocks
              </div>
            </div>

            <div className="rounded-xl bg-[#0a1220] border border-[#223250] px-3 py-2">
              <div className="text-[11px] text-[#a9b8d0]">Wadarta Bedka Plots-ka</div>
              <div className="text-sm font-extrabold font-mono-numbers tabular-nums text-[#22c55e] mt-0.5">
                {metrics.allPlotsAreaSqM.toLocaleString()} m²
              </div>
              <div className="text-[11px] font-mono-numbers tabular-nums text-[#a9b8d0]">
                Dhaxalka: {metrics.divisiblePlotsAreaSqM.toLocaleString()} m²
              </div>
            </div>

            <div className="rounded-xl bg-[#0a1220] border border-[#223250] px-3 py-2">
              <div className="text-[11px] text-[#a9b8d0]">Plots Buuxa</div>
              <div className="text-sm font-extrabold font-mono-numbers tabular-nums text-[#e8eef7] mt-0.5">
                {metrics.fullPlotsCount} Plot
              </div>
              <div className="text-[11px] text-[#a9b8d0]">
                {metrics.standardPlotAreaSqM} m² halkii plot
              </div>
            </div>

            <div className="rounded-xl bg-[#0a1220] border border-[#223250] px-3 py-2">
              <div className="text-[11px] text-[#a9b8d0]">Plots Nus ah (Half)</div>
              <div className="text-sm font-extrabold font-mono-numbers tabular-nums text-[#38bdf8] mt-0.5">
                {metrics.halfPlotsCount} Half
              </div>
              <div className="text-[11px] text-[#a9b8d0]">
                {metrics.halfPlotsIncluded ? 'Ku jira qaybinta' : 'Laga reebay qaybinta'}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#a9b8d0]">
            Weli khariidad GIS lama xirin kiiskan. Waxaad soo saari kartaa Shahaadada Dhaxalka PDF, CSV iyo Excel, ama ku noqo Khariidad si aad u furto GeoJSON/KML.
          </p>
        )}
      </section>

      {/* Filter Toggle Row */}
      {hasGisPlots && (
        <div className="rounded-2xl bg-[#111b2e] border border-[#223250] px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <SlidersHorizontal className="w-4 h-4 text-[#22c55e] shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#e8eef7] truncate">
                Kuwa Muuqda Keliya ({displayedCount} Plot)
              </div>
              <div className="text-xs text-[#a9b8d0] truncate">
                Dhoofi oo keliya plots-ka hadda ka muuqda shaandhaynta khariidadda
              </div>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={onlyVisible}
            onClick={() => setOnlyVisible((prev) => !prev)}
            className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer shrink-0 ${
              onlyVisible ? 'bg-[#22c55e]' : 'bg-[#223250]'
            }`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                onlyVisible ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )}

      {/* Compact Export Format Selector (Dropdown + Single Primary Action) */}
      <section className="rounded-2xl bg-[#111b2e] border border-[#223250] p-4 space-y-3">
        <label
          htmlFor="compact-export-select"
          className="block text-xs font-extrabold uppercase tracking-wider text-[#a9b8d0]"
        >
          Dooro Nooca Loo Export Garaynayo
        </label>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <select
            id="compact-export-select"
            value={selectedExportType}
            onChange={(e) =>
              setSelectedExportType(
                e.target.value as 'map_pdf' | 'heerarka_pdf' | 'excel' | 'geojson' | 'csv'
              )
            }
            className="flex-1 min-h-[48px] rounded-xl bg-[#0a1220] border border-[#223250] focus:border-[#22c55e] px-3.5 text-sm font-bold text-[#e8eef7] focus:outline-none cursor-pointer"
          >
            {hasGisPlots && (
              <option value="map_pdf">Khariidadda Muuqaalka (PDF)</option>
            )}
            {hasGisPlots && (
              <option value="heerarka_pdf">Warbixinta Heerarka Beerta (PDF)</option>
            )}
            <option value="excel">Jadwal Excel (.xlsx)</option>
            {hasGisPlots && (
              <option value="geojson">Faylka GeoJSON (.geojson)</option>
            )}
            <option value="csv">Jadwalka CSV (.csv)</option>
          </select>

          <button
            type="button"
            onClick={() => {
              if (selectedExportType === 'map_pdf' && hasGisPlots) {
                onOpenCartographicPdfModal('layout11');
              } else if (selectedExportType === 'heerarka_pdf' && hasGisPlots) {
                onOpenCartographicPdfModal('heerarka_report');
              } else if (selectedExportType === 'excel') {
                onExportExcelWorkbook();
              } else if (selectedExportType === 'geojson' && hasGisPlots) {
                handleExportGeoJson();
              } else {
                handleExportCsvTable();
              }
            }}
            className="min-h-[48px] px-6 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-[#060d18] text-sm font-extrabold transition-colors cursor-pointer shrink-0"
          >
            Soo saar
          </button>
        </div>
      </section>

      {/* Section 1: QGIS-Style PDF Print Layouts & Shariah Certificate */}
      <section className="space-y-2.5">
        <div className="flex items-center gap-2 px-1">
          <LayoutTemplate className="w-4 h-4 text-[#22c55e]" />
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#a9b8d0]">
            Naqshadda PDF &amp; Warbixinnada Rasmiga ah (QGIS Print Layout)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {hasGisPlots && (
            <button
              type="button"
              onClick={() => onOpenCartographicPdfModal('inheritance_map')}
              className="w-full min-h-[72px] rounded-2xl bg-[#111b2e] hover:bg-[#16243d] border border-[#22c55e]/50 hover:border-[#22c55e] px-4 py-3.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/30 text-[#22c55e] flex items-center justify-center shrink-0">
                  <Printer className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#e8eef7]">
                    Khariidadda Muuqaalka Dhaxalka (PDF)
                  </div>
                  <div className="text-xs text-[#a9b8d0] line-clamp-2">
                    Bog · Cabir · Legend · Gacanta ku jiid dhan walba &amp; Zoom In/Out
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#a9b8d0] shrink-0" />
            </button>
          )}

          {hasGisPlots && (
            <button
              type="button"
              onClick={() => onOpenCartographicPdfModal('layout11')}
              className="w-full min-h-[72px] rounded-2xl bg-[#111b2e] hover:bg-[#16243d] border border-[#223250] hover:border-[#22c55e]/70 px-4 py-3.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/30 text-[#22c55e] flex items-center justify-center shrink-0">
                  <MapIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#e8eef7]">
                    Khariidadda Beerta PDF (Automatic_Layout11)
                  </div>
                  <div className="text-xs text-[#a9b8d0] line-clamp-2">
                    Naqshadda QGIS · Xuduudka, Blocks, Plots, Dooxyada &amp; Cabirka
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#a9b8d0] shrink-0" />
            </button>
          )}

          {hasGisPlots && (
            <button
              type="button"
              onClick={() => onOpenCartographicPdfModal('heerarka_report')}
              className="w-full min-h-[72px] rounded-2xl bg-[#111b2e] hover:bg-[#16243d] border border-[#223250] hover:border-[#38bdf8]/70 px-4 py-3.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[#38bdf8]/15 border border-[#38bdf8]/30 text-[#38bdf8] flex items-center justify-center shrink-0">
                  <Printer className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#e8eef7]">
                    Warbixinta Heerarka Beerta PDF (4 Bog)
                  </div>
                  <div className="text-xs text-[#a9b8d0] line-clamp-2">
                    Heerka 1aad / 2aad / 3aad · Khariidadda Heerarka &amp; Jadwalka Blocks-ka
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#a9b8d0] shrink-0" />
            </button>
          )}

          <button
            type="button"
            onClick={onExportLayoutPdf}
            className="w-full min-h-[72px] rounded-2xl bg-[#111b2e] hover:bg-[#16243d] border border-[#223250] hover:border-[#f87171]/70 px-4 py-3.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-[#f87171]/15 border border-[#f87171]/30 text-[#f87171] flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#e8eef7]">
                  Shahaadada Dhaxalka PDF
                </div>
                <div className="text-xs text-[#a9b8d0] line-clamp-2">
                  Warqadda rasmiga ah ee Faraa&apos;idka, Daliillada Qur&apos;aanka &amp; Saamiyada
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#a9b8d0] shrink-0" />
          </button>
        </div>
      </section>

      {/* Section 2: GIS Vector & Tabular Data Exports */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 px-1">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#a9b8d0]">
            Faylasha GIS &amp; Jadwallada Xogta
          </h3>
          {hasGisPlots && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyGeoJsonText}
                className="min-h-[38px] px-3 rounded-xl bg-[#111b2e] hover:bg-[#16243d] border border-[#223250] inline-flex items-center gap-1.5 text-xs font-bold text-[#e8eef7] cursor-pointer"
              >
                {copiedMode === 'geojson' ? (
                  <Check className="w-3.5 h-3.5 text-[#22c55e]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[#22c55e]" />
                )}
                <span>Koobiyee GeoJSON</span>
              </button>

              <button
                type="button"
                onClick={handleCopyCsvText}
                className="min-h-[38px] px-3 rounded-xl bg-[#111b2e] hover:bg-[#16243d] border border-[#223250] inline-flex items-center gap-1.5 text-xs font-bold text-[#e8eef7] cursor-pointer"
              >
                {copiedMode === 'csv' ? (
                  <Check className="w-3.5 h-3.5 text-[#38bdf8]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[#38bdf8]" />
                )}
                <span>Koobiyee CSV</span>
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={!hasGisPlots}
            onClick={handleExportGeoJson}
            className="w-full min-h-[68px] rounded-2xl bg-[#111b2e] hover:bg-[#16243d] border border-[#223250] hover:border-[#22c55e]/60 px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/30 text-[#22c55e] flex items-center justify-center shrink-0">
                <FileCode2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#e8eef7] truncate">
                  Faylka GeoJSON (.geojson)
                </div>
                <div className="text-xs text-[#a9b8d0] truncate">
                  Lakabyada khariidadda (xuduud, blocks &amp; plots)
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#a9b8d0] shrink-0" />
          </button>

          <button
            type="button"
            disabled={!hasGisPlots || isExportingShp}
            onClick={handleExportShapefile}
            className="w-full min-h-[68px] rounded-2xl bg-[#111b2e] hover:bg-[#16243d] border border-[#223250] hover:border-[#facc15]/60 px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-[#facc15]/15 border border-[#facc15]/30 text-[#facc15] flex items-center justify-center shrink-0">
                <FolderArchive className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#e8eef7] truncate">
                  {isExportingShp ? 'Dhoofinaya Shapefile...' : 'Xogta GIS Shapefile (.zip)'}
                </div>
                <div className="text-xs text-[#a9b8d0] truncate">
                  QGIS &amp; ArcGIS (.shp, .dbf, .prj)
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#a9b8d0] shrink-0" />
          </button>

          <button
            type="button"
            onClick={handleExportCsvTable}
            className="w-full min-h-[68px] rounded-2xl bg-[#111b2e] hover:bg-[#16243d] border border-[#223250] hover:border-[#38bdf8]/60 px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-[#38bdf8]/15 border border-[#38bdf8]/30 text-[#38bdf8] flex items-center justify-center shrink-0">
                <Table2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#e8eef7] truncate">
                  Jadwalka Xogta CSV (.csv)
                </div>
                <div className="text-xs text-[#a9b8d0] truncate">
                  Diiwaanka cabbirrada plots-ka &amp; saamiyada dhaxalka
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#a9b8d0] shrink-0" />
          </button>

          <button
            type="button"
            onClick={onExportExcelWorkbook}
            className="w-full min-h-[68px] rounded-2xl bg-[#111b2e] hover:bg-[#16243d] border border-[#223250] hover:border-[#22c55e]/60 px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/30 text-[#22c55e] flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#e8eef7] truncate">
                  Buugga Xogta Excel (.xlsx)
                </div>
                <div className="text-xs text-[#a9b8d0] truncate">
                  Warbixinta buuxda ee Faraa&apos;idka, Dhaxlayaasha &amp; GIS
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#a9b8d0] shrink-0" />
          </button>
        </div>
      </section>
    </div>
  );
};
