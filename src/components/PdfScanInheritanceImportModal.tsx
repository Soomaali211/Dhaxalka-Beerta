import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardPaste,
  FileSearch,
  FileText,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  FairLandAllocationResult,
  GeneratedPlot,
  LandSubdivisionState,
  SubdivisionComputationResult,
} from '../types/landSubdivision';
import {
  PdfExtractedAssignmentDraft,
  PdfImportHeirOption,
  applyVerifiedPdfImportToSubdivisionState,
  buildCadSpatialLayoutPromptSummary,
  evaluateVectorExtractionCompleteness,
  normalizeAiPdfAssignmentsToDrafts,
  parseVectorPdfTokensToDrafts,
} from '../utils/pdfInheritanceImportEngine';
import {
  ExtractedDocumentBundle,
  extractPdfOrImageForInheritanceImport,
} from '../utils/pdfBrowserExtractor';
import {
  ColorMapAnalysisResult,
  DetectedColorPlotGroup,
  analyzeColorMapFromVectorGeometry,
  analyzeColoredMapDataUrl,
  expandColorGroupsToAssignmentDrafts,
  mergeAiLegendLabelsIntoColorGroups,
} from '../utils/pdfColorMapAnalyzer';

interface PdfScanInheritanceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  subdivisionResult: SubdivisionComputationResult | null;
  subdivisionState: LandSubdivisionState;
  fairAllocation: FairLandAllocationResult | null;
  isApkMobileMode?: boolean;
  onApplyImportedState: (
    nextState: LandSubdivisionState,
    summary: {
      appliedHeirPlotsCount: number;
      appliedExcludedPlotsCount: number;
      skippedUnmatchedCount: number;
      fileName: string;
    }
  ) => void;
}

const EXCLUDED_COLOR_CHOICES = ['#F43F5E', '#94A3B8', '#F97316', '#EAB308', '#8B5CF6', '#14B8A6'];

export const PdfScanInheritanceImportModal: React.FC<PdfScanInheritanceImportModalProps> = ({
  isOpen,
  onClose,
  subdivisionResult,
  subdivisionState,
  fairAllocation,
  isApkMobileMode = false,
  onApplyImportedState,
}) => {
  const [docBundle, setDocBundle] = useState<ExtractedDocumentBundle | null>(null);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [sourceFileName, setSourceFileName] = useState<string>('PDF / Scan Dhaxal');
  const [drafts, setDrafts] = useState<PdfExtractedAssignmentDraft[]>([]);
  const [isExtractingFile, setIsExtractingFile] = useState<boolean>(false);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showPasteBox, setShowPasteBox] = useState<boolean>(false);
  const [pastedText, setPastedText] = useState<string>('');
  const [rowFilter, setRowFilter] = useState<'all' | 'needs_review' | 'unmatched'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mobilePane, setMobilePane] = useState<'table' | 'preview'>('table');
  const [replaceExistingOverrides, setReplaceExistingOverrides] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [colorAnalysis, setColorAnalysis] = useState<ColorMapAnalysisResult | null>(null);
  const [colorGroups, setColorGroups] = useState<DetectedColorPlotGroup[]>([]);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<'colors' | 'plots'>('colors');
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const cadPlots: GeneratedPlot[] = useMemo(() => {
    if (!subdivisionResult) return [];
    const pool =
      subdivisionResult.allEvaluatedPlots && subdivisionResult.allEvaluatedPlots.length > 0
        ? subdivisionResult.allEvaluatedPlots
        : subdivisionResult.plots || [];
    const insideOnly = pool.filter(
      (p) => p.full || (p.htmlStatus !== 'outside' && p.halfPlotValidation?.boundaryRelation !== 'full_outside')
    );
    return insideOnly.length > 0 ? insideOnly : subdivisionResult.plots || [];
  }, [subdivisionResult]);

  const cadSpatialSummary = useMemo(
    () => buildCadSpatialLayoutPromptSummary(cadPlots),
    [cadPlots]
  );

  const heirOptions: PdfImportHeirOption[] = useMemo(() => {
    if (!fairAllocation?.heirAllocations) return [];
    return fairAllocation.heirAllocations.map((h) => ({
      heirKey: h.heirKey,
      personName: h.personName,
      roleTitleSomali: h.roleTitleSomali,
      colorHex: h.colorHex,
    }));
  }, [fairAllocation]);

  const filteredDrafts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return drafts.filter((d) => {
      if (rowFilter === 'needs_review' && !d.needsReview) return false;
      if (rowFilter === 'unmatched' && Boolean(d.matchedPlotId)) return false;
      if (q) {
        const hay = `${d.rawPlotLabel} ${d.matchedPlotId || ''} ${d.assigneeName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [drafts, rowFilter, searchQuery]);

  const effectiveDraftsForCommit = useMemo(() => {
    if (drafts.length > 0) return drafts;
    if (colorGroups.length > 0) {
      return expandColorGroupsToAssignmentDrafts(colorGroups, heirOptions);
    }
    return [];
  }, [drafts, colorGroups, heirOptions]);

  const counts = useMemo(() => {
    const src = effectiveDraftsForCommit;
    const readyHeirs = src.filter(
      (d) => d.matchedPlotId && d.assigneeType === 'heir' && d.matchedHeirKey
    ).length;
    const readyExcluded = src.filter(
      (d) => d.matchedPlotId && d.assigneeType === 'excluded_custom'
    ).length;
    const needsReviewCount = drafts.filter((d) => d.needsReview).length;
    const unmatchedCount = drafts.filter((d) => !d.matchedPlotId).length;
    return { readyHeirs, readyExcluded, needsReviewCount, unmatchedCount };
  }, [effectiveDraftsForCommit, drafts]);

  if (!isOpen) return null;

  const activePage = docBundle?.pages[activePageIndex] || null;

  const analyzePageWithAiVision = async (
    pageIndex: number,
    bundleOverride?: ExtractedDocumentBundle
  ): Promise<PdfExtractedAssignmentDraft[]> => {
    const targetBundle = bundleOverride || docBundle;
    const page = targetBundle?.pages[pageIndex];
    if (!page) return [];

    setIsAnalyzingAi(true);
    setErrorMessage('');
    try {
      const resp = await fetch('/api/pdf-inheritance-import/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: targetBundle.fileName,
          pageNumber: page.pageNumber,
          imageBase64: page.imageBase64,
          mimeType: page.imageMimeType,
          vectorTextTokens: page.plainText,
          cadSpatialSummary,
          validPlotIds: cadPlots.map((p) => p.id),
          activeHeirs: heirOptions.map((h, idx) => ({
            heirKey: h.heirKey,
            heirIndex: idx + 1,
            personName: h.personName,
            roleTitleSomali: h.roleTitleSomali,
            colorHex: h.colorHex,
          })),
        }),
      });

      const payload = (await resp.json().catch(() => ({}))) as {
        error?: string;
        summarySomali?: string;
        assignments?: Array<{
          rawPlotLabel: string;
          normalizedPlotId?: string;
          assigneeName: string;
          isExcludedOrDanguud?: boolean;
          colorHexHint?: string;
          confidencePct?: number;
          needsReview?: boolean;
          noteSomali?: string;
        }>;
      };

      if (!resp.ok) {
        throw new Error(
          payload.error ||
            'Falanqaynta AI Vision ma suurtagalin hadda — waxaad weli si toos ah u sixi kartaa ama ugu dari kartaa gacanta.'
        );
      }

      const aiDrafts = normalizeAiPdfAssignmentsToDrafts(
        payload.assignments || [],
        cadPlots,
        heirOptions
      );
      if (payload.summarySomali) {
        setStatusMessage(`Bogga ${page.pageNumber}: ${payload.summarySomali}`);
      }
      return aiDrafts;
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  const mergeDraftList = (
    base: PdfExtractedAssignmentDraft[],
    incoming: PdfExtractedAssignmentDraft[]
  ): PdfExtractedAssignmentDraft[] => {
    const map = new Map<string, PdfExtractedAssignmentDraft>();
    const upsertSafe = (row: PdfExtractedAssignmentDraft) => {
      const key = row.matchedPlotId || row.rowId;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, row);
        return;
      }
      // Keep clean higher-confidence match unless incoming is explicitly cleaner
      if (!existing.needsReview && row.needsReview) return;
      if (existing.needsReview && !row.needsReview) {
        map.set(key, row);
        return;
      }
      if (row.confidencePct >= existing.confidencePct) {
        map.set(key, row);
      }
    };
    base.forEach(upsertSafe);
    incoming.forEach(upsertSafe);
    return Array.from(map.values());
  };

  const mergeDraftRows = (incoming: PdfExtractedAssignmentDraft[]) => {
    setDrafts((prev) => mergeDraftList(prev, incoming));
  };

  const analyzePagesSequentiallyWithAi = async (
    targetBundle: ExtractedDocumentBundle,
    pageIndices: number[],
    seedRows: PdfExtractedAssignmentDraft[]
  ): Promise<PdfExtractedAssignmentDraft[]> => {
    let accumulated = [...seedRows];
    for (let i = 0; i < pageIndices.length; i++) {
      const pIdx = pageIndices[i];
      const pg = targetBundle.pages[pIdx];
      if (!pg) continue;
      setStatusMessage(
        `AI Vision wuxuu akhrinayaa bogga ${pg.pageNumber}/${targetBundle.pages.length}...`
      );
      const aiRows = await analyzePageWithAiVision(pIdx, targetBundle);
      accumulated = mergeDraftList(accumulated, aiRows);
      setDrafts(accumulated);
    }
    return accumulated;
  };

  const analyzeColorMapAndLegendForPage = async (
    pageIndex: number,
    bundleOverride?: ExtractedDocumentBundle
  ): Promise<ColorMapAnalysisResult | null> => {
    const targetBundle = bundleOverride || docBundle;
    const page = targetBundle?.pages[pageIndex];
    if (!page) return null;

    // 1. Exact Vector PDF Polygon analysis (when GIS PDF layers exist) or instant offline Canvas fallback
    const localColorRes =
      page.vectorMapGeometry && page.vectorMapGeometry.plots.length >= 4
        ? analyzeColorMapFromVectorGeometry(page.vectorMapGeometry, cadPlots, heirOptions)
        : await analyzeColoredMapDataUrl(page.previewDataUrl, cadPlots, heirOptions);
    setColorAnalysis(localColorRes);
    setColorGroups(localColorRes.colorGroups);
    if (localColorRes.colorGroups.length > 0) {
      setActiveWorkflowTab('colors');
    }

    setStatusMessage(
      `Bogga ${page.pageNumber}: Waxaa la helay ${localColorRes.detectedBlocksCount} Block iyo ${localColorRes.detectedPlotsCount} Plot (${localColorRes.colorGroups.length} midab). Waxaa la akhrinayaa Legend-ka...`
    );

    // 2. Fast Legend AI call (~2-4s) to attach legend names & non-heir hints onto color groups
    if (localColorRes.colorGroups.length > 0) {
      setIsAnalyzingAi(true);
      try {
        const resp = await fetch('/api/pdf-inheritance-import/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysisMode: 'color_legend_summary',
            fileName: targetBundle.fileName,
            pageNumber: page.pageNumber,
            imageBase64: page.imageBase64,
            mimeType: page.imageMimeType,
            detectedColorSwatches: localColorRes.colorGroups.map((g) => ({
              colorId: g.colorId,
              hex: g.hex,
              colorNameSomali: g.colorNameSomali,
              detectedPlotCount: g.detectedPlotCount,
            })),
            activeHeirs: heirOptions.map((h, idx) => ({
              heirKey: h.heirKey,
              heirIndex: idx + 1,
              personName: h.personName,
              roleTitleSomali: h.roleTitleSomali,
              colorHex: h.colorHex,
            })),
          }),
        });

        const payload = (await resp.json().catch(() => ({}))) as {
          error?: string;
          totalBlocksEstimate?: number;
          totalPlotsEstimate?: number;
          summarySomali?: string;
          legendItems?: Array<{
            legendLabel: string;
            colorHex?: string;
            colorNameSomali?: string;
            estimatedPlotsCount?: number;
            looksLikeNonHeir?: boolean;
          }>;
        };

        if (resp.ok && Array.isArray(payload.legendItems) && payload.legendItems.length > 0) {
          setColorGroups((prev) =>
            mergeAiLegendLabelsIntoColorGroups(prev, payload.legendItems || [], heirOptions)
          );
          setStatusMessage(
            `Waxaa la akhriyey ${localColorRes.detectedBlocksCount} Block · ${localColorRes.detectedPlotsCount} Plot · ${localColorRes.colorGroups.length} Midab. ${
              payload.summarySomali || 'Calaamadi midabada aan dhaxlayaasha ahayn.'
            }`
          );
        } else {
          setStatusMessage(
            `Waxaa la helay ${localColorRes.detectedBlocksCount} Block, ${localColorRes.detectedPlotsCount} Plot iyo ${localColorRes.colorGroups.length} midab. Hoos ka dooro midab kasta dhaxalihiisa ama ka reeb kuwa aan dhaxalka ahayn.`
          );
        }
      } catch {
        setStatusMessage(
          `Waxaa la helay ${localColorRes.detectedBlocksCount} Block, ${localColorRes.detectedPlotsCount} Plot iyo ${localColorRes.colorGroups.length} midab. Hoos ka xulo midabada dhaxlayaasha iyo kuwa aan ahayn.`
        );
      } finally {
        setIsAnalyzingAi(false);
      }
    }

    return localColorRes;
  };

  const processSelectedFile = async (file: File) => {
    setIsExtractingFile(true);
    setErrorMessage('');
    setStatusMessage('');
    setSourceFileName(file.name);
    setActivePageIndex(0);
    setSearchQuery('');
    setColorAnalysis(null);
    setColorGroups([]);
    setDrafts([]);

    try {
      const bundle = await extractPdfOrImageForInheritanceImport(file);
      setDocBundle(bundle);

      if (bundle.kind === 'vector_pdf') {
        let combinedRows: PdfExtractedAssignmentDraft[] = [];
        bundle.pages.forEach((pg) => {
          const parsed = parseVectorPdfTokensToDrafts(
            pg.plainText,
            pg.positionedTokens,
            cadPlots,
            heirOptions
          );
          combinedRows = mergeDraftList(combinedRows, parsed);
        });

        setDrafts(combinedRows);
        const completeness = evaluateVectorExtractionCompleteness(combinedRows, cadPlots);

        if (!completeness.shouldFallbackToAiVision) {
          setActiveWorkflowTab('plots');
          setStatusMessage(
            `Vector PDF waa la akhriyey (${bundle.pages.length} bog): ${combinedRows.length} plot ayaa toos looga soo saaray.`
          );
        } else {
          await analyzeColorMapAndLegendForPage(0, bundle);
        }
      } else {
        await analyzeColorMapAndLegendForPage(0, bundle);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Faylka lama furin karin.');
    } finally {
      setIsExtractingFile(false);
    }
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file) return;
    try {
      await processSelectedFile(file);
    } finally {
      inputEl.value = '';
    }
  };

  const handleAnalyzeActivePageClick = async () => {
    if (!docBundle || !activePage) return;
    try {
      const colorRes = await analyzeColorMapAndLegendForPage(activePageIndex);
      if (!colorRes || colorRes.colorGroups.length === 0) {
        const rows = await analyzePageWithAiVision(activePageIndex);
        mergeDraftRows(rows);
        setActiveWorkflowTab('plots');
        if (rows.length === 0) {
          setStatusMessage('Boggan xog cusub lagama helin — waxaad gacanta ka dari kartaa sadarro.');
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Falanqaynta boggan way fashilantay.');
    }
  };

  const handleAnalyzeAllPagesClick = async () => {
    if (!docBundle || docBundle.pages.length <= 1) return;
    try {
      const allIndices = docBundle.pages.map((_, idx) => idx);
      const finalRows = await analyzePagesSequentiallyWithAi(docBundle, allIndices, drafts);
      setActiveWorkflowTab('plots');
      setStatusMessage(
        `Dhammaan ${docBundle.pages.length} bog waa la falanqeeyey: ${finalRows.length} plot wadar ah.`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Falanqaynta dhammaan boggaga way fashilantay.');
    }
  };

  const updateColorGroup = (
    colorId: string,
    updater: (grp: DetectedColorPlotGroup) => DetectedColorPlotGroup
  ) => {
    setColorGroups((prev) => prev.map((g) => (g.colorId === colorId ? updater(g) : g)));
  };

  const handleMaterializeColorGroupsToPlotTable = () => {
    const generated = expandColorGroupsToAssignmentDrafts(colorGroups, heirOptions);
    setDrafts(generated);
    setActiveWorkflowTab('plots');
    setStatusMessage(
      `${generated.length} plot ayaa laga diyaariyay ${colorGroups.filter((g) => g.role !== 'ignore').length} midab — hubi ama toos u dabaq CAD Studio.`
    );
  };

  const handleParsePastedText = () => {
    if (!pastedText.trim()) return;
    const parsed = parseVectorPdfTokensToDrafts(pastedText, [], cadPlots, heirOptions);
    if (parsed.length === 0) {
      setErrorMessage(
        'Qoraalkan laga ma helin Plot IDs (tusaale R01-C01-P01 ama B1-P2). Waxaad gacanta ka dari kartaa sadarrada.'
      );
      return;
    }
    setErrorMessage('');
    mergeDraftRows(parsed);
    setShowPasteBox(false);
    setStatusMessage(`${parsed.length} plot ayaa laga soo saaray qoraalka aad ku dhejisay.`);
  };

  const handleAddManualRow = () => {
    const firstUnassignedPlot = cadPlots.find(
      (p) => !drafts.some((d) => d.matchedPlotId === p.id)
    );
    const defaultHeir = heirOptions[0];
    setDrafts((prev) => [
      {
        rowId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        rawPlotLabel: firstUnassignedPlot?.id || 'Gacanta',
        matchedPlotId: firstUnassignedPlot?.id || null,
        assigneeType: defaultHeir ? 'heir' : 'excluded_custom',
        matchedHeirKey: defaultHeir?.heirKey || '',
        assigneeName: defaultHeir?.personName || 'Danguud',
        colorHex: defaultHeir?.colorHex || '#F43F5E',
        confidencePct: 100,
        needsReview: !firstUnassignedPlot,
        sourceMethod: 'manual_added',
        noteSomali: 'Sadar gacanta lagu daray',
      },
      ...prev,
    ]);
  };

  const updateDraftRow = (
    rowId: string,
    updater: (row: PdfExtractedAssignmentDraft) => PdfExtractedAssignmentDraft
  ) => {
    setDrafts((prev) => prev.map((r) => (r.rowId === rowId ? updater(r) : r)));
  };

  const deleteDraftRow = (rowId: string) => {
    setDrafts((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  const handleCommitToCadStudio = () => {
    const rowsToApply =
      effectiveDraftsForCommit.length > 0
        ? effectiveDraftsForCommit
        : expandColorGroupsToAssignmentDrafts(colorGroups, heirOptions);
    const res = applyVerifiedPdfImportToSubdivisionState(
      subdivisionState,
      rowsToApply,
      subdivisionResult,
      heirOptions,
      sourceFileName,
      { replaceExistingOverrides }
    );
    onApplyImportedState(res.nextState, {
      appliedHeirPlotsCount: res.appliedHeirPlotsCount,
      appliedExcludedPlotsCount: res.appliedExcludedPlotsCount,
      skippedUnmatchedCount: res.skippedUnmatchedCount,
      fileName: sourceFileName,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl max-h-[94dvh] flex flex-col rounded-2xl bg-[#0B1220] border border-[#243449] shadow-2xl text-[#F8FAFC] overflow-hidden"
      >
        {/* TOP MODAL HEADER */}
        <div className="px-3.5 sm:px-5 py-3 border-b border-[#243449] flex items-center justify-between gap-3 shrink-0 bg-[#0F1B2D]">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-extrabold flex items-center gap-2 truncate">
              <FileSearch className="w-4 h-4 text-[#10B981] shrink-0" />
              <span className="truncate">
                Waafaji PDF / Scan Dhaxal Qaybsan (100% Hubin Gacan)
              </span>
            </h2>
            <p className="text-[11px] text-[#94A3B8] truncate">
              Soo geli Vector PDF, Scanned PDF, ama Sawir Scan ah — kadib sax wixii khaldan kahor intaanad ku xidhin CAD Studio.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Xir daaqadda soo gelinta PDF/Scan"
            className="min-h-[38px] min-w-[38px] rounded-xl bg-[#0B1220] border border-[#243449] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* UPLOAD & ACTION BAR */}
        <div className="px-3.5 sm:px-5 py-2.5 border-b border-[#243449] flex flex-wrap items-center justify-between gap-2 shrink-0 bg-[#0B1220]">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf,application/pdf,application/x-pdf,application/octet-stream,*/*"
              onChange={(e) => void handleFilePicked(e)}
              className="hidden"
            />
            <input
              ref={imageInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/*"
              onChange={(e) => void handleFilePicked(e)}
              className="hidden"
            />

            <button
              type="button"
              disabled={isExtractingFile}
              onClick={() => pdfInputRef.current?.click()}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-60 text-[#030712] text-xs font-extrabold cursor-pointer transition-colors"
            >
              {isExtractingFile ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <FileText className="w-4 h-4 shrink-0" />
              )}
              <span>
                {isExtractingFile
                  ? 'Waa la furayaa...'
                  : docBundle
                  ? 'Beddel PDF'
                  : 'Soo Geli PDF (.pdf)'}
              </span>
            </button>

            <button
              type="button"
              disabled={isExtractingFile}
              onClick={() => imageInputRef.current?.click()}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] disabled:opacity-60 text-xs font-bold text-[#F8FAFC] cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Sawir Scan</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPasteBox((v) => !v)}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] text-xs font-bold text-[#F8FAFC] cursor-pointer"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Ku Dheji Qoraal</span>
            </button>

            {docBundle && activePage && (
              <>
                <button
                  type="button"
                  disabled={isAnalyzingAi}
                  onClick={() => void handleAnalyzeActivePageClick()}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/15 border border-sky-400/50 hover:border-sky-400 text-xs font-extrabold text-sky-200 cursor-pointer disabled:opacity-45"
                >
                  {isAnalyzingAi ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    {isAnalyzingAi
                      ? 'AI Vision wuu akhrinayaa...'
                      : `AI Falanqee Bogga ${activePage.pageNumber}`}
                  </span>
                </button>
                {docBundle.pages.length > 1 && (
                  <button
                    type="button"
                    disabled={isAnalyzingAi}
                    onClick={() => void handleAnalyzeAllPagesClick()}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/15 border border-indigo-400/50 hover:border-indigo-400 text-xs font-extrabold text-indigo-200 cursor-pointer disabled:opacity-45"
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>AI Falanqee Dhammaan ({docBundle.pages.length})</span>
                  </button>
                )}
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleAddManualRow}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] text-xs font-extrabold text-[#10B981] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ku Dar Sadar Gacanta</span>
          </button>
        </div>

        {/* OPTIONAL PASTE TEXT BOX */}
        {showPasteBox && (
          <div className="px-4 py-3 border-b border-[#243449] bg-[#0F1B2D] space-y-2 shrink-0">
            <label className="block text-xs font-bold text-[#CBD5E1]">
              Ku dheji qoraal ama jadwal PDF ah (tusaale: <span className="font-mono text-[#10B981]">R01-C01-P01 | Axmed Cali</span> ama <span className="font-mono text-[#10B981]">Axmed: B1-P1, B1-P2</span>):
            </label>
            <textarea
              rows={3}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="R01-C01-P01 | Axmed Cali&#10;R01-C01-P02 | Faadumo Xasan&#10;R01-C01-P03 | Danguud"
              className="w-full rounded-xl bg-[#0B1220] border border-[#243449] p-2.5 text-xs font-mono text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteBox(false)}
                className="px-3 py-1.5 rounded-lg border border-[#243449] text-xs font-bold text-[#94A3B8] cursor-pointer"
              >
                Iska Dhaaf
              </button>
              <button
                type="button"
                onClick={handleParsePastedText}
                className="px-3.5 py-1.5 rounded-lg bg-[#10B981] text-[#030712] text-xs font-extrabold cursor-pointer"
              >
                Ka Soo Saar Plots-ka
              </button>
            </div>
          </div>
        )}

        {/* STATUS / ERROR BANNERS */}
        {(statusMessage || errorMessage) && (
          <div className="px-4 py-2 border-b border-[#243449] space-y-1 shrink-0 bg-[#0B1220]">
            {statusMessage && (
              <div className="text-xs text-[#10B981] font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}
            {errorMessage && (
              <div className="text-xs text-amber-300 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* MOBILE/APK VIEW SWITCHER */}
        {docBundle && (
          <div
            className={`px-3.5 py-2 border-b border-[#243449] bg-[#0F1B2D] ${
              isApkMobileMode ? 'flex' : 'flex lg:hidden'
            } items-center justify-between gap-2 shrink-0`}
          >
            <div className="grid grid-cols-2 gap-1 p-0.5 rounded-xl bg-[#030712] border border-[#243449] flex-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setMobilePane('table')}
                className={`min-h-[34px] rounded-lg cursor-pointer ${
                  mobilePane === 'table'
                    ? 'bg-[#10B981] text-[#030712] font-extrabold'
                    : 'text-[#94A3B8]'
                }`}
              >
                {colorGroups.length > 0
                  ? `1. Midabada (${colorGroups.length}) & Miiska`
                  : `1. Miiska Sixidda (${drafts.length})`}
              </button>
              <button
                type="button"
                onClick={() => setMobilePane('preview')}
                className={`min-h-[34px] rounded-lg cursor-pointer ${
                  mobilePane === 'preview'
                    ? 'bg-[#10B981] text-[#030712] font-extrabold'
                    : 'text-[#94A3B8]'
                }`}
              >
                2. Sawirka Bogga ({activePageIndex + 1}/{docBundle.pages.length})
              </button>
            </div>
          </div>
        )}

        {/* MAIN BODY: PREVIEW + VERIFICATION / MANUAL CORRECTION TABLE */}
        <div
          className={`flex-1 min-h-0 grid ${
            docBundle && !isApkMobileMode ? 'lg:grid-cols-12' : 'grid-cols-1'
          } overflow-hidden`}
        >
          {/* LEFT: PAGE PREVIEW */}
          {docBundle && activePage && (
            <div
              className={`lg:col-span-5 border-b lg:border-b-0 lg:border-r border-[#243449] bg-[#07101E] flex flex-col min-h-0 ${
                mobilePane === 'preview' ? 'flex' : isApkMobileMode ? 'hidden' : 'hidden lg:flex'
              }`}
            >
              <div className="px-3 py-2 border-b border-[#243449] flex items-center justify-between gap-2 text-xs shrink-0">
                <span className="font-bold text-[#CBD5E1] truncate">
                  {docBundle.kind === 'vector_pdf'
                    ? 'Vector PDF'
                    : docBundle.kind === 'scanned_pdf'
                    ? 'Scanned PDF'
                    : 'Scan Sawir'}{' '}
                  · {docBundle.fileName}
                </span>
                {docBundle.pages.length > 1 && (
                  <div className="inline-flex items-center gap-1 shrink-0">
                    {docBundle.pages.map((p, idx) => (
                      <button
                        key={p.pageNumber}
                        type="button"
                        onClick={() => setActivePageIndex(idx)}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer ${
                          activePageIndex === idx
                            ? 'bg-[#10B981] text-[#030712]'
                            : 'bg-[#0F1B2D] text-[#94A3B8] border border-[#243449]'
                        }`}
                      >
                        {p.pageNumber}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-auto p-2.5 flex items-start justify-center">
                <img
                  src={activePage.previewDataUrl}
                  alt={`Bogga ${activePage.pageNumber} ee ${docBundle.fileName}`}
                  className="max-w-full rounded-lg border border-[#243449] shadow-lg"
                />
              </div>
            </div>
          )}

          {/* RIGHT: MANUAL VERIFICATION & CORRECTION TABLE */}
          <div
            className={`${
              docBundle && !isApkMobileMode ? 'lg:col-span-7' : 'col-span-1'
            } flex flex-col min-h-0 ${
              docBundle && mobilePane === 'preview'
                ? isApkMobileMode
                  ? 'hidden'
                  : 'hidden lg:flex'
                : 'flex'
            }`}
          >
            {/* TOP WORKFLOW TAB BAR & FILTER CHIPS */}
            <div className="px-3.5 py-2 border-b border-[#243449] flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0 bg-[#0B1220]">
              <div className="flex flex-wrap items-center gap-1.5">
                {colorGroups.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveWorkflowTab('colors')}
                    className={`px-2.5 py-1 rounded-lg font-extrabold cursor-pointer ${
                      activeWorkflowTab === 'colors'
                        ? 'bg-[#10B981] text-[#030712]'
                        : 'bg-[#0F1B2D] text-[#CBD5E1] border border-[#243449]'
                    }`}
                  >
                    Midabada & Tirada ({colorGroups.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveWorkflowTab('plots')}
                  className={`px-2.5 py-1 rounded-lg font-extrabold cursor-pointer ${
                    activeWorkflowTab === 'plots' || colorGroups.length === 0
                      ? 'bg-[#10B981] text-[#030712]'
                      : 'bg-[#0F1B2D] text-[#CBD5E1] border border-[#243449]'
                  }`}
                >
                  Miiska Plots-ka ({effectiveDraftsForCommit.length})
                </button>

                {(activeWorkflowTab === 'plots' || colorGroups.length === 0) && (
                  <>
                    <button
                      type="button"
                      onClick={() => setRowFilter('all')}
                      className={`px-2 py-1 rounded-lg font-bold cursor-pointer ${
                        rowFilter === 'all'
                          ? 'bg-sky-400 text-[#030712]'
                          : 'bg-[#0F1B2D] text-[#CBD5E1] border border-[#243449]'
                      }`}
                    >
                      Dhammaan ({drafts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRowFilter('needs_review')}
                      className={`px-2 py-1 rounded-lg font-bold cursor-pointer ${
                        rowFilter === 'needs_review'
                          ? 'bg-amber-400 text-[#030712]'
                          : 'bg-[#0F1B2D] text-amber-200 border border-[#243449]'
                      }`}
                    >
                      Hubi ({counts.needsReviewCount})
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {(activeWorkflowTab === 'plots' || colorGroups.length === 0) && drafts.length > 0 && (
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Raadi Plot / Dhaxale..."
                    className="w-36 sm:w-44 min-h-[30px] rounded-lg bg-[#0F1B2D] border border-[#243449] px-2.5 text-[11px] text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#10B981]"
                  />
                )}
                <span className="text-[#94A3B8] tabular-nums shrink-0">
                  CAD Plots: <strong className="text-[#F8FAFC]">{cadPlots.length}</strong>
                </span>
              </div>
            </div>

            {/* ROWS LIST */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
              {cadPlots.length === 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/25 p-3 text-xs text-amber-200">
                  Fadlan marka hore ku shub Xuduudda / Nashqadda Beerta si plots-ka CAD Studio u soo baxaan.
                </div>
              )}

              {cadPlots.length > 0 && heirOptions.length === 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/25 p-3 text-xs text-amber-200">
                  <strong>Fiiro gaar ah:</strong> Liiska dhaxlayaashu hadda waa maran yahay — marka hore dhaxlayaasha ku dar qaybta <strong>Xisaabiyaha Dhaxalka</strong> si PDF-ka loogu xidho magac kasta. Hadda waxaad weli arki kartaa Blocks-ka, Plots-ka iyo tirada midab kasta.
                </div>
              )}

              {/* VIEW A: DETECTED BLOCKS, PLOTS & COLOR-GROUP TABLE (WITH NON-HEIR EXCLUSION) */}
              {colorGroups.length > 0 && activeWorkflowTab === 'colors' ? (
                <div className="space-y-3">
                  {/* 3 SUMMARY STAT CARDS */}
                  {colorAnalysis && (
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-xl border border-[#243449] bg-[#0F1B2D] p-2.5">
                        <div className="text-[10px] text-[#94A3B8] font-semibold">Blocks La Akhriyey</div>
                        <div className="text-base font-extrabold text-[#F8FAFC] tabular-nums">
                          {colorAnalysis.detectedBlocksCount}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#243449] bg-[#0F1B2D] p-2.5">
                        <div className="text-[10px] text-[#94A3B8] font-semibold">Plots La Akhriyey</div>
                        <div className="text-base font-extrabold text-[#10B981] tabular-nums">
                          {colorAnalysis.detectedPlotsCount}{' '}
                          <span className="text-[10px] font-semibold text-[#94A3B8]">
                            / {cadPlots.length} CAD
                          </span>
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#243449] bg-[#0F1B2D] p-2.5">
                        <div className="text-[10px] text-[#94A3B8] font-semibold">Midabada vs Dhaxlayaal</div>
                        <div className="text-base font-extrabold text-amber-300 tabular-nums">
                          {colorGroups.length}{' '}
                          <span className="text-[10px] font-semibold text-[#94A3B8]">
                            vs {heirOptions.length} qof
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* EXPLICIT EXTRA-COLORS ALERT WHEN DETECTED COLORS > HEIR COUNT */}
                  {heirOptions.length > 0 && colorGroups.length > heirOptions.length && (
                    <div className="rounded-xl border border-amber-400/50 bg-amber-950/25 p-3 text-xs text-amber-200">
                      <strong>Midabada ayaa ka badan tirada dhaxlayaasha:</strong> Waxaa la helay{' '}
                      <strong>{colorGroups.length} midab</strong>, tirada dhaxlayaashuna waa{' '}
                      <strong>{heirOptions.length} qof</strong> ({colorGroups.length - heirOptions.length}{' '}
                      midab ayaa dheeraad ah). Hoos ka dooro midabada aan dhaxlayaasha ahayn adigoo gujinaya{' '}
                      <strong>Ma Aha Dhaxale</strong> ama <strong>Iska Dhaaf</strong>.
                    </div>
                  )}

                  {/* COLOR GROUP ROWS */}
                  <div className="space-y-2">
                    {colorGroups.map((grp) => (
                      <div
                        key={grp.colorId}
                        className={`rounded-xl border p-2.5 space-y-2 text-xs ${
                          grp.role === 'ignore'
                            ? 'border-[#243449]/60 bg-[#0B1220] opacity-60'
                            : grp.role === 'excluded_non_heir'
                            ? 'border-rose-500/55 bg-rose-950/15'
                            : grp.matchedHeirKey
                            ? 'border-[#10B981]/50 bg-[#0F1B2D]'
                            : 'border-amber-500/45 bg-amber-950/10'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-7 h-7 rounded-lg shrink-0 border border-white/30 shadow-xs"
                              style={{ backgroundColor: grp.hex }}
                            />
                            <div className="min-w-0">
                              <div className="font-extrabold text-[#F8FAFC] truncate">
                                {grp.legendLabel}
                              </div>
                              <div className="text-[10px] text-[#94A3B8] font-mono">
                                {grp.colorNameSomali} · {grp.hex} · {grp.detectedBlockCount} Blocks
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="px-2.5 py-1 rounded-lg bg-[#0B1220] border border-[#243449] font-extrabold text-[#10B981] tabular-nums">
                              {grp.detectedPlotCount} Plots (PDF)
                            </span>
                            {grp.matchedCadPlotIds.length > 0 && (
                              <span className="px-2 py-1 rounded-lg bg-sky-500/15 border border-sky-400/35 font-bold text-sky-200 tabular-nums text-[10px]">
                                {grp.matchedCadPlotIds.length} CAD
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                          <div className="sm:col-span-6">
                            <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-[#0B1220] border border-[#243449] text-[10.5px] font-bold">
                              <button
                                type="button"
                                onClick={() =>
                                  updateColorGroup(grp.colorId, (cur) => ({
                                    ...cur,
                                    role: 'heir',
                                  }))
                                }
                                className={`min-h-[32px] rounded-md cursor-pointer ${
                                  grp.role === 'heir'
                                    ? 'bg-[#10B981] text-[#030712] font-extrabold'
                                    : 'text-[#94A3B8]'
                                }`}
                              >
                                Waa Dhaxale
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateColorGroup(grp.colorId, (cur) => ({
                                    ...cur,
                                    role: 'excluded_non_heir',
                                    matchedHeirKey: '',
                                    excludedLabel:
                                      cur.excludedLabel ||
                                      `Danguud (${cur.legendLabel})`,
                                  }))
                                }
                                className={`min-h-[32px] rounded-md cursor-pointer ${
                                  grp.role === 'excluded_non_heir'
                                    ? 'bg-rose-600 text-white font-extrabold'
                                    : 'text-[#94A3B8]'
                                }`}
                              >
                                Ma Aha Dhaxale
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateColorGroup(grp.colorId, (cur) => ({
                                    ...cur,
                                    role: 'ignore',
                                    matchedHeirKey: '',
                                  }))
                                }
                                className={`min-h-[32px] rounded-md cursor-pointer ${
                                  grp.role === 'ignore'
                                    ? 'bg-slate-600 text-white font-extrabold'
                                    : 'text-[#94A3B8]'
                                }`}
                              >
                                Iska Dhaaf
                              </button>
                            </div>
                          </div>

                          <div className="sm:col-span-6">
                            {grp.role === 'heir' ? (
                              <select
                                value={grp.matchedHeirKey}
                                onChange={(e) => {
                                  const hKey = e.target.value;
                                  updateColorGroup(grp.colorId, (cur) => ({
                                    ...cur,
                                    matchedHeirKey: hKey,
                                  }));
                                }}
                                className="w-full min-h-[36px] rounded-lg bg-[#0B1220] border border-[#243449] px-2 text-xs font-bold text-[#F8FAFC]"
                              >
                                <option value="">-- Dooro Dhaxale ({heirOptions.length}) --</option>
                                {heirOptions.map((h) => (
                                  <option key={h.heirKey} value={h.heirKey}>
                                    {h.personName} ({h.roleTitleSomali})
                                  </option>
                                ))}
                              </select>
                            ) : grp.role === 'excluded_non_heir' ? (
                              <input
                                type="text"
                                value={grp.excludedLabel}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateColorGroup(grp.colorId, (cur) => ({
                                    ...cur,
                                    excludedLabel: v,
                                  }));
                                }}
                                placeholder="Danguud / Waddo / Reeban..."
                                className="w-full min-h-[36px] rounded-lg bg-[#0B1220] border border-rose-500/45 px-2.5 text-xs font-bold text-[#F8FAFC]"
                              />
                            ) : (
                              <div className="text-[11px] text-[#94A3B8] italic px-1">
                                Midabkan laguma dari doono CAD Studio.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleMaterializeColorGroupsToPlotTable}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#0F1B2D] border border-[#10B981]/60 hover:border-[#10B981] text-xs font-extrabold text-[#10B981] cursor-pointer"
                    >
                      <span>Eeg / Wax Ka Beddel Plots-ka Midabada</span>
                    </button>
                  </div>
                </div>
              ) : filteredDrafts.length === 0 ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void processSelectedFile(f);
                  }}
                  className={`rounded-xl border-2 border-dashed p-6 text-center space-y-3 transition-colors ${
                    isDragOver
                      ? 'border-[#10B981] bg-[#10B981]/10'
                      : 'border-[#243449] bg-[#0F1B2D]'
                  }`}
                >
                  <p className="text-xs font-bold text-[#CBD5E1]">
                    {drafts.length === 0
                      ? 'Halkan ku tuur faylka PDF / Sawirka Scan-ka, ama riix badhamada hoose:'
                      : 'Sadar ku jira miirkan ma jiro.'}
                  </p>
                  {drafts.length === 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        disabled={isExtractingFile}
                        onClick={() => pdfInputRef.current?.click()}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] text-xs font-extrabold cursor-pointer"
                      >
                        <FileUp className="w-3.5 h-3.5" />
                        <span>Dooro Fayl PDF ah</span>
                      </button>
                      <button
                        type="button"
                        disabled={isExtractingFile}
                        onClick={() => imageInputRef.current?.click()}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-sky-400 text-xs font-bold text-sky-200 cursor-pointer"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Dooro Sawir Scan</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                filteredDrafts.map((row) => (
                  <div
                    key={row.rowId}
                    className={`rounded-xl border p-2.5 space-y-2 text-xs ${
                      !row.matchedPlotId || row.needsReview
                        ? 'border-amber-500/55 bg-amber-950/15'
                        : 'border-[#243449] bg-[#0F1B2D]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-xs shrink-0 border border-white/25"
                          style={{ backgroundColor: row.colorHex }}
                        />
                        <span className="font-mono text-[11px] font-bold text-[#94A3B8] truncate">
                          PDF/Scan: <strong className="text-[#F8FAFC]">{row.rawPlotLabel}</strong>
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold tabular-nums ${
                            row.matchedPlotId && !row.needsReview
                              ? 'bg-[#10B981]/20 text-[#10B981]'
                              : 'bg-amber-500/20 text-amber-200'
                          }`}
                        >
                          {row.matchedPlotId && !row.needsReview
                            ? `Sax (${row.confidencePct}%)`
                            : `Hubi (${row.confidencePct}%)`}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteDraftRow(row.rowId)}
                        aria-label={`Tirtir sadarka ${row.rawPlotLabel}`}
                        className="p-1.5 rounded-lg text-[#94A3B8] hover:text-rose-400 hover:bg-rose-950/30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      {/* 1. CAD PLOT SELECTOR */}
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] text-[#94A3B8] mb-0.5">
                          CAD Studio Plot ID
                        </label>
                        <select
                          value={row.matchedPlotId || ''}
                          onChange={(e) => {
                            const val = e.target.value || null;
                            updateDraftRow(row.rowId, (cur) => ({
                              ...cur,
                              matchedPlotId: val,
                              needsReview: !val || (cur.assigneeType === 'heir' && !cur.matchedHeirKey),
                              confidencePct: val ? 100 : cur.confidencePct,
                            }));
                          }}
                          className="w-full min-h-[38px] rounded-lg bg-[#0B1220] border border-[#243449] px-2 text-xs font-bold text-[#F8FAFC]"
                        >
                          <option value="">-- Dooro Plot CAD --</option>
                          {cadPlots.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.id} ({p.block} · {p.full ? 'Buuxa' : 'Half'})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 2. TYPE SWITCH */}
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] text-[#94A3B8] mb-0.5">
                          Nooca Mulkiyadda
                        </label>
                        <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[#0B1220] border border-[#243449] text-[11px] font-bold">
                          <button
                            type="button"
                            onClick={() => {
                              const firstHeir = heirOptions[0];
                              updateDraftRow(row.rowId, (cur) => ({
                                ...cur,
                                assigneeType: 'heir',
                                matchedHeirKey: cur.matchedHeirKey || firstHeir?.heirKey || '',
                                assigneeName:
                                  (cur.matchedHeirKey
                                    ? heirOptions.find((h) => h.heirKey === cur.matchedHeirKey)
                                        ?.personName
                                    : firstHeir?.personName) || cur.assigneeName,
                                colorHex:
                                  (cur.matchedHeirKey
                                    ? heirOptions.find((h) => h.heirKey === cur.matchedHeirKey)
                                        ?.colorHex
                                    : firstHeir?.colorHex) || cur.colorHex,
                                needsReview: !cur.matchedPlotId,
                              }));
                            }}
                            className={`min-h-[32px] rounded-md cursor-pointer ${
                              row.assigneeType === 'heir'
                                ? 'bg-[#10B981] text-[#030712] font-extrabold'
                                : 'text-[#94A3B8]'
                            }`}
                          >
                            Dhaxale
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateDraftRow(row.rowId, (cur) => ({
                                ...cur,
                                assigneeType: 'excluded_custom',
                                matchedHeirKey: '',
                                assigneeName: cur.assigneeName || 'Danguud',
                                colorHex: '#F43F5E',
                                needsReview: !cur.matchedPlotId,
                              }));
                            }}
                            className={`min-h-[32px] rounded-md cursor-pointer ${
                              row.assigneeType === 'excluded_custom'
                                ? 'bg-rose-600 text-white font-extrabold'
                                : 'text-[#94A3B8]'
                            }`}
                          >
                            Danguud
                          </button>
                        </div>
                      </div>

                      {/* 3. HEIR SELECTOR OR CUSTOM DANGUUD INPUT */}
                      <div className="sm:col-span-5">
                        {row.assigneeType === 'heir' ? (
                          <>
                            <label className="block text-[10px] text-[#94A3B8] mb-0.5">
                              Dhaxlaha Helay
                            </label>
                            <select
                              value={row.matchedHeirKey}
                              onChange={(e) => {
                                const hKey = e.target.value;
                                const hObj = heirOptions.find((h) => h.heirKey === hKey);
                                updateDraftRow(row.rowId, (cur) => ({
                                  ...cur,
                                  matchedHeirKey: hKey,
                                  assigneeName: hObj?.personName || cur.assigneeName,
                                  colorHex: hObj?.colorHex || cur.colorHex,
                                  needsReview: !cur.matchedPlotId || !hKey,
                                  confidencePct: cur.matchedPlotId && hKey ? 100 : cur.confidencePct,
                                }));
                              }}
                              className="w-full min-h-[38px] rounded-lg bg-[#0B1220] border border-[#243449] px-2 text-xs font-bold text-[#F8FAFC]"
                            >
                              <option value="">-- Dooro Dhaxale --</option>
                              {heirOptions.map((h) => (
                                <option key={h.heirKey} value={h.heirKey}>
                                  {h.personName} ({h.roleTitleSomali})
                                </option>
                              ))}
                            </select>
                          </>
                        ) : (
                          <>
                            <label className="block text-[10px] text-[#94A3B8] mb-0.5">
                              Magac Gaar ah (Danguud / Waddo / Reeban)
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={row.assigneeName}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateDraftRow(row.rowId, (cur) => ({
                                    ...cur,
                                    assigneeName: v,
                                    needsReview: !cur.matchedPlotId,
                                  }));
                                }}
                                placeholder="Danguud..."
                                className="flex-1 min-h-[38px] rounded-lg bg-[#0B1220] border border-rose-500/45 px-2.5 text-xs font-bold text-[#F8FAFC]"
                              />
                              <select
                                value={row.colorHex}
                                onChange={(e) => {
                                  const c = e.target.value;
                                  updateDraftRow(row.rowId, (cur) => ({ ...cur, colorHex: c }));
                                }}
                                aria-label="Midabka Danguud"
                                className="min-h-[38px] rounded-lg bg-[#0B1220] border border-[#243449] px-1 text-xs"
                              >
                                {EXCLUDED_COLOR_CHOICES.map((hex) => (
                                  <option key={hex} value={hex}>
                                    {hex}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {row.noteSomali && (
                      <p className="text-[10.5px] text-[#94A3B8]">{row.noteSomali}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* MODAL FOOTER: REPLACE/MERGE OPTION + APPLY 100% */}
        <div className="px-3.5 sm:px-5 py-3 border-t border-[#243449] bg-[#0F1B2D] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none font-semibold text-[#CBD5E1]">
              <input
                type="checkbox"
                checked={replaceExistingOverrides}
                onChange={(e) => setReplaceExistingOverrides(e.target.checked)}
                className="w-4 h-4 rounded accent-[#10B981]"
              />
              <span>Ku beddel qoondayntii gacanta ee hore</span>
            </label>
            <span className="text-[11px] text-[#94A3B8] tabular-nums">
              Diyaar: <strong className="text-[#10B981]">{counts.readyHeirs}</strong> Dhaxale ·{' '}
              <strong className="text-rose-300">{counts.readyExcluded}</strong> Danguud/Reeban
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 rounded-xl border border-[#243449] bg-[#0B1220] text-xs font-bold text-[#CBD5E1] cursor-pointer"
            >
              Xir
            </button>
            <button
              type="button"
              disabled={counts.readyHeirs + counts.readyExcluded === 0}
              onClick={handleCommitToCadStudio}
              className="min-h-[42px] px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-40 text-[#030712] text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>
                Ku Dabaq CAD Studio ({counts.readyHeirs + counts.readyExcluded})
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
