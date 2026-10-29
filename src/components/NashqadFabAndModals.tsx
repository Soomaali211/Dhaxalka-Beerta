import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  FileJson,
  FolderOpen,
  Grid,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  LandSubdivisionState,
  NashqadFileRecognitionItem,
  NashqadFileRole,
  NashqadWorkflowSummary,
} from '../types/landSubdivision';
import {
  InspectedNashqadFile,
  buildNashqadBeerState,
  buildPlotsGeoJsonClipboardText,
  copyTextSafelyToClipboard,
  detectWidthBearingFromGeoJson,
  formatCompassDirectionSomali,
  inspectAndClassifyNashqadBeerFiles,
  parseGeoJsonPolygonsStrict,
  runSameeNashqadWorkflow,
  splitPairIntoBoundaryAndSampleBlock,
} from '../utils/nashqadWorkflowEngine';

interface NashqadFabAndModalsProps {
  subdivisionState: LandSubdivisionState;
  onApplyNashqadState: (
    nextState: LandSubdivisionState,
    summary: NashqadWorkflowSummary
  ) => void;
  onNotify: (title: string, message: string) => void;
}

function readFileAsTextPromise(file: File): Promise<{ fileName: string; fileText: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        fileName: file.name,
        fileText: typeof reader.result === 'string' ? reader.result : '',
      });
    };
    reader.onerror = () => {
      reject(new Error(`Faylka "${file.name}" waa la akhrin kari waayey.`));
    };
    reader.readAsText(file);
  });
}

function roleLabelSomali(role: NashqadFileRecognitionItem['role']): string {
  switch (role) {
    case 'boundary':
      return 'Xuduud';
    case 'blocks':
      return 'Blocks';
    case 'plots':
      return 'Plots';
    case 'wadis':
      return 'Dooxyada';
    case 'roads':
      return 'Waddooyin';
    case 'special_area':
      return 'Aag gaar ah';
    case 'extra_layer':
      return 'Lakab kale';
  }
}

export const NashqadSummaryCard: React.FC<{
  summary: NashqadWorkflowSummary;
  subdivisionState: LandSubdivisionState;
  onNotify: (title: string, message: string) => void;
  onClose?: () => void;
}> = ({ summary, subdivisionState, onNotify, onClose }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyGeoJson = async () => {
    const txt = buildPlotsGeoJsonClipboardText(subdivisionState);
    if (!txt) {
      onNotify('Xog Lama Helin', 'Ma jirto xog GeoJSON oo la koobiyeyn karo.');
      return;
    }
    const ok = await copyTextSafelyToClipboard(txt);
    if (ok) {
      setCopied(true);
      onNotify('Waa La Koobiyeeyey', 'Qoraalka GeoJSON ee nashqadda waa la koobiyeeyey.');
      window.setTimeout(() => setCopied(false), 2200);
    } else {
      onNotify('Koobiyeyntu Ma Shaqayn', 'Fadlan mar kale isku day koobiyeynta qoraalka.');
    }
  };

  return (
    <div className="rounded-2xl bg-[#0B1220] border border-[#243449] shadow-2xl text-[#F8FAFC] w-full max-w-[380px] overflow-hidden">
      <div className="px-4 py-3 bg-[#0F1B2D] border-b border-[#243449] flex items-center justify-between gap-2">
        <span className="text-xs font-extrabold truncate">
          {summary.mode === 'samee_nashqad'
            ? 'Warbixinta Nashqadda Cusub'
            : `Warbixinta Nashqadda (${summary.recognizedFiles.length} fayl)`}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyGeoJson}
            title="Koobiyee qoraalka GeoJSON"
            className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[#0B1220] hover:bg-[#16263D] border border-[#243449] text-[11px] font-bold text-[#F8FAFC] inline-flex items-center gap-1 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-[#22C55E]" />
                <span>La koobiyeeyey</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-[#22C55E]" />
                <span>Koobiyee</span>
              </>
            )}
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Xidh warbixinta nashqadda"
              className="min-h-[30px] min-w-[30px] rounded-lg hover:bg-[#0B1220] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCollapsed((p) => !p)}
              aria-label={collapsed ? 'Fur kaarka tirooyinka' : 'Yaree kaarka tirooyinka'}
              className="min-h-[30px] min-w-[30px] rounded-lg hover:bg-[#0B1220] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
            >
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-2.5 text-xs">
          {/* 4 Core KPI Metrics */}
          <div className="grid grid-cols-2 gap-2 tabular-nums">
            <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] px-2.5 py-2">
              <div className="text-[10.5px] text-[#94A3B8]">Blocks</div>
              <div className="text-sm font-extrabold text-[#38BDF8] mt-0.5">
                {summary.blocksCount.toLocaleString()}
              </div>
            </div>

            <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] px-2.5 py-2">
              <div className="text-[10.5px] text-[#94A3B8] flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#10B981] shrink-0" />
                <span>Plots dhammaystiran</span>
              </div>
              <div className="text-sm font-extrabold text-[#10B981] mt-0.5">
                {summary.fullPlotsCount.toLocaleString()}
              </div>
            </div>

            <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] px-2.5 py-2">
              <div className="text-[10.5px] text-[#94A3B8] flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#F59E0B] shrink-0" />
                <span>Half plots</span>
              </div>
              <div className="text-sm font-extrabold text-[#F59E0B] mt-0.5">
                {summary.halfPlotsCount.toLocaleString()}
              </div>
            </div>

            <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] px-2.5 py-2">
              <div className="text-[10.5px] text-[#94A3B8]">Wadarta m²</div>
              <div className="text-sm font-extrabold text-[#F8FAFC] mt-0.5">
                {Math.round(summary.totalPlotsAreaSqM).toLocaleString()} m²
              </div>
            </div>
          </div>

          {/* Bearing Degree Line when generated via "Samee nashqad" */}
          {summary.widthBearingDeg !== undefined && (
            <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-[#94A3B8] tabular-nums">
              <span>Jihada Ballaca Block-ga:</span>
              <strong className="text-[#22C55E]">
                {summary.widthBearingDeg}° · {formatCompassDirectionSomali(summary.widthBearingDeg)}
              </strong>
            </div>
          )}

          {/* 90×48m Standard Rule Summary Line */}
          {Math.round(summary.standardPlotAreaSqM) === 432 && (
            <div className="rounded-xl bg-[#0F1B2D]/85 border border-[#22C55E]/30 px-2.5 py-1.5 text-[10.5px] text-[#E2E8F0] leading-snug tabular-nums">
              <strong className="text-[#22C55E]">Xeerka 90×48 m:</strong> Waddo 15 m (4 dhinac) · Plot 18×24 m · Half 1,5,6,10 = 18×12 m · Half 2,3,4,7,8,9 = 9×24 m
            </div>
          )}

          {/* Recognized Files Breakdown (scrollable for 20+ files, textContent-safe JSX nodes) */}
          {summary.recognizedFiles.length > 0 && (
            <div className="rounded-xl bg-[#0F1B2D]/75 border border-[#243449]/80 px-2.5 py-2 space-y-1">
              <div className="text-[10.5px] font-bold text-[#94A3B8]">
                Faylasha la aqoonsaday ({summary.recognizedFiles.length}):
              </div>
              <div className="max-h-28 overflow-y-auto pr-1 space-y-1">
                {summary.recognizedFiles.map((rf, idx) => (
                  <div
                    key={`${rf.fileName}-${idx}`}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="truncate text-[#F8FAFC] font-medium">{rf.fileName}</span>
                    <span className="shrink-0 text-[#94A3B8] tabular-nums">
                      {roleLabelSomali(rf.role)} ({rf.featureCount})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing File Notices (e.g. "blocks.geojson lama helin") */}
          {summary.missingFileMessages.length > 0 && (
            <div className="rounded-xl bg-amber-950/45 border border-amber-500/40 px-2.5 py-1.5 space-y-0.5 text-[11px] text-amber-200 font-semibold">
              {summary.missingFileMessages.map((msg, i) => (
                <div key={i}>{msg}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const COMPASS_BEARING_PRESETS: { label: string; deg: number }[] = [
  { label: '0° Waqooyi', deg: 0 },
  { label: '45° WB', deg: 45 },
  { label: '90° Bari', deg: 90 },
  { label: '135° KB', deg: 135 },
  { label: '180° Koonfur', deg: 180 },
  { label: '270° Galbeed', deg: 270 },
];

export const NashqadFabAndModals: React.FC<NashqadFabAndModalsProps> = ({
  subdivisionState,
  onApplyNashqadState,
  onNotify,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'none' | 'samee_nashqad' | 'soo_geli_nashqad'>(
    'none'
  );

  // --- Modal 1 ("Samee nashqad") State ---
  const pairGeoJsonInputRef = useRef<HTMLInputElement | null>(null);
  const boundarySingleInputRef = useRef<HTMLInputElement | null>(null);
  const sampleBlockInputRef = useRef<HTMLInputElement | null>(null);

  const [boundaryFileData, setBoundaryFileData] = useState<{
    fileName: string;
    fileText: string;
    polygonCount: number;
    detectedBearingDeg: number | null;
  } | null>(null);
  const [sampleBlockMode, setSampleBlockMode] = useState<'dimensions' | 'file'>('file');
  const [sampleBlockFileData, setSampleBlockFileData] = useState<{
    fileName: string;
    fileText: string;
    polygonCount: number;
    detectedBearingDeg: number | null;
  } | null>(null);
  const [blockWidthM, setBlockWidthM] = useState<string>('48');
  const [blockLengthM, setBlockLengthM] = useState<string>('90');
  const [widthBearingDeg, setWidthBearingDeg] = useState<string>('90');
  const [userEditedBearing, setUserEditedBearing] = useState<boolean>(false);
  const [plotWidthM, setPlotWidthM] = useState<string>('18');
  const [plotDepthM, setPlotDepthM] = useState<string>('24');
  const [roadWidthM, setRoadWidthM] = useState<string>('15');
  const [sameeError, setSameeError] = useState<string | null>(null);

  // --- Modal 2 ("Soo geli nashqad beer" — supports 2, 3, or 20+ GeoJSON files at once) State ---
  const multiBeerInputRef = useRef<HTMLInputElement | null>(null);
  const [inspectedFiles, setInspectedFiles] = useState<InspectedNashqadFile[]>([]);
  const [reviewFilesBeforeImport, setReviewFilesBeforeImport] = useState<boolean>(false);
  const [sooGeliError, setSooGeliError] = useState<string | null>(null);
  const [isReadingFiles, setIsReadingFiles] = useState(false);

  // Close menu or modal on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeModal !== 'none') {
          setActiveModal('none');
        } else if (isMenuOpen) {
          setIsMenuOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMenuOpen, activeModal]);

  const handleOpenSameeNashqad = () => {
    setIsMenuOpen(false);
    setSameeError(null);
    setActiveModal('samee_nashqad');
  };

  const handleOpenSooGeliNashqad = () => {
    setIsMenuOpen(false);
    setSooGeliError(null);
    setInspectedFiles([]);
    setActiveModal('soo_geli_nashqad');
  };

  const executeAutoSampleGeoJsonSubdivision = (
    bnd: { fileName: string; fileText: string },
    smp?: { fileName: string; fileText: string } | null
  ): boolean => {
    const res = runSameeNashqadWorkflow({
      boundaryFileName: bnd.fileName,
      boundaryFileText: bnd.fileText,
      sampleBlockMode: 'file',
      sampleBlockFileName: smp?.fileName,
      sampleBlockFileText: smp?.fileText,
      previousState: subdivisionState,
    });

    if (!res.ok) {
      setSameeError(res.errorSomali);
      return false;
    }

    onApplyNashqadState(res.nextState, res.summary);
    setActiveModal('none');
    const is90x48 = Math.round(res.summary.standardPlotAreaSqM) === 432;
    onNotify(
      is90x48 ? 'Nashqad 90×48 m Waa Diyaar' : 'Nashqad Cusub Waa Diyaar',
      is90x48
        ? `Waddo 15m (4 dhinac) · ${res.summary.blocksCount} Block · ${res.summary.fullPlotsCount} Plot (18×24m) · ${res.summary.halfPlotsCount} Half plot (18×12m & 9×24m) · ${Math.round(res.summary.totalPlotsAreaSqM).toLocaleString()} m².`
        : `Bearing ${res.summary.widthBearingDeg ?? 0}° · ${res.summary.blocksCount} Block · ${res.summary.fullPlotsCount} Plot dhammaystiran · ${res.summary.halfPlotsCount} Half plot (${Math.round(res.summary.totalPlotsAreaSqM).toLocaleString()} m²).`
    );
    return true;
  };

  const handleSelectPairGeoJsonFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    const files = fileList ? Array.from(fileList) : [];
    e.target.value = '';
    if (files.length === 0) return;

    setSameeError(null);
    try {
      const loadedList = await Promise.all(files.slice(0, 2).map(readFileAsTextPromise));
      if (loadedList.length === 1) {
        const only = loadedList[0];
        const check = parseGeoJsonPolygonsStrict(only.fileText, only.fileName);
        if (!check.ok) {
          setSameeError(check.errorSomali);
          return;
        }
        const detected = detectWidthBearingFromGeoJson(only.fileText, only.fileName);
        // Combined single GeoJSON containing both Xuduudka Beerta + Block Tusaale
        if (check.polygons.length >= 2) {
          setBoundaryFileData({
            fileName: only.fileName,
            fileText: only.fileText,
            polygonCount: check.polygons.length,
            detectedBearingDeg: detected,
          });
          executeAutoSampleGeoJsonSubdivision(only, null);
          return;
        }

        // Single file selected: detect if it looks like sample block or boundary
        const isLikelyBlock = /block|bulook|blk|tusaale|sample/i.test(only.fileName);
        if (isLikelyBlock) {
          const nextSmp = {
            fileName: only.fileName,
            fileText: only.fileText,
            polygonCount: check.polygons.length,
            detectedBearingDeg: detected,
          };
          setSampleBlockFileData(nextSmp);
          if (boundaryFileData) {
            executeAutoSampleGeoJsonSubdivision(boundaryFileData, nextSmp);
          }
        } else {
          const nextBnd = {
            fileName: only.fileName,
            fileText: only.fileText,
            polygonCount: check.polygons.length,
            detectedBearingDeg: detected,
          };
          setBoundaryFileData(nextBnd);
          if (sampleBlockFileData) {
            executeAutoSampleGeoJsonSubdivision(nextBnd, sampleBlockFileData);
          }
        }
        return;
      }

      // Two GeoJSON files selected together -> auto-split into Xuduudka Beerta & Block Tusaale and run immediately!
      const pair = splitPairIntoBoundaryAndSampleBlock(loadedList);
      if (!pair.ok) {
        setSameeError(pair.errorSomali);
        return;
      }

      setBoundaryFileData({
        fileName: pair.boundaryFile.fileName,
        fileText: pair.boundaryFile.fileText,
        polygonCount: pair.boundaryFile.polygonCount,
        detectedBearingDeg: detectWidthBearingFromGeoJson(
          pair.boundaryFile.fileText,
          pair.boundaryFile.fileName
        ),
      });
      if (pair.sampleBlockFile) {
        setSampleBlockFileData({
          fileName: pair.sampleBlockFile.fileName,
          fileText: pair.sampleBlockFile.fileText,
          polygonCount: pair.sampleBlockFile.polygonCount,
          detectedBearingDeg: detectWidthBearingFromGeoJson(
            pair.sampleBlockFile.fileText,
            pair.sampleBlockFile.fileName
          ),
        });
      }

      if (pair.hasBothReady) {
        executeAutoSampleGeoJsonSubdivision(pair.boundaryFile, pair.sampleBlockFile);
      }
    } catch (err) {
      setSameeError(
        err instanceof Error ? err.message : 'Faylasha GeoJSON waa la akhrin kari waayey.'
      );
    }
  };

  const handleSelectBoundaryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSameeError(null);
    try {
      const loaded = await readFileAsTextPromise(file);
      const check = parseGeoJsonPolygonsStrict(loaded.fileText, loaded.fileName);
      if (!check.ok) {
        setSameeError(check.errorSomali);
        setBoundaryFileData(null);
        return;
      }
      const detected = detectWidthBearingFromGeoJson(loaded.fileText, loaded.fileName);
      const nextBnd = {
        fileName: loaded.fileName,
        fileText: loaded.fileText,
        polygonCount: check.polygons.length,
        detectedBearingDeg: detected,
      };
      setBoundaryFileData(nextBnd);
      if (!userEditedBearing && detected !== null && sampleBlockMode === 'dimensions') {
        setWidthBearingDeg(String(detected));
      }

      // In GeoJSON file mode: if both boundary + sample block are now ready (or combined >=2 polygons), calculate immediately!
      if (sampleBlockMode === 'file') {
        if (sampleBlockFileData) {
          executeAutoSampleGeoJsonSubdivision(nextBnd, sampleBlockFileData);
        } else if (check.polygons.length >= 2) {
          executeAutoSampleGeoJsonSubdivision(nextBnd, null);
        }
      }
    } catch (err) {
      setSameeError(
        err instanceof Error ? err.message : 'Faylka xuduudka waa la akhrin kari waayey.'
      );
    }
  };

  const handleSelectSampleBlockFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSameeError(null);
    try {
      const loaded = await readFileAsTextPromise(file);
      const check = parseGeoJsonPolygonsStrict(loaded.fileText, loaded.fileName);
      if (!check.ok) {
        setSameeError(check.errorSomali);
        setSampleBlockFileData(null);
        return;
      }
      const detected = detectWidthBearingFromGeoJson(loaded.fileText, loaded.fileName);
      const nextSmp = {
        fileName: loaded.fileName,
        fileText: loaded.fileText,
        polygonCount: check.polygons.length,
        detectedBearingDeg: detected,
      };
      setSampleBlockFileData(nextSmp);
      if (detected !== null) {
        setWidthBearingDeg(String(detected));
        setUserEditedBearing(false);
      }

      // If Xuduudka Beerta was already selected, calculate immediately with zero extra inputs!
      if (sampleBlockMode === 'file' && boundaryFileData) {
        executeAutoSampleGeoJsonSubdivision(boundaryFileData, nextSmp);
      }
    } catch (err) {
      setSameeError(
        err instanceof Error ? err.message : 'Faylka block-ga tusaalaha waa la akhrin kari waayey.'
      );
    }
  };

  const handleAutoDetectBearingClick = () => {
    if (sampleBlockMode === 'file' && sampleBlockFileData?.detectedBearingDeg != null) {
      setWidthBearingDeg(String(sampleBlockFileData.detectedBearingDeg));
      setUserEditedBearing(false);
      return;
    }
    if (boundaryFileData?.detectedBearingDeg != null) {
      setWidthBearingDeg(String(boundaryFileData.detectedBearingDeg));
      setUserEditedBearing(false);
    }
  };

  const handleSubmitSameeNashqad = (e: React.FormEvent) => {
    e.preventDefault();
    setSameeError(null);

    if (!boundaryFileData) {
      setSameeError('Fadlan marka hore soo geli faylka GeoJSON ee xuduudka beerta (Polygon).');
      return;
    }

    if (sampleBlockMode === 'file') {
      if (!sampleBlockFileData && boundaryFileData.polygonCount < 2) {
        setSameeError('Fadlan soo geli faylka GeoJSON ee block-ga tusaalaha ah.');
        return;
      }
      executeAutoSampleGeoJsonSubdivision(boundaryFileData, sampleBlockFileData);
      return;
    }

    const parsedBearing = parseFloat(widthBearingDeg);
    if (!Number.isFinite(parsedBearing)) {
      setSameeError('Fadlan geli Bearing Degree oo tiro sax ah (0° ilaa 360°).');
      return;
    }

    const res = runSameeNashqadWorkflow({
      boundaryFileName: boundaryFileData.fileName,
      boundaryFileText: boundaryFileData.fileText,
      sampleBlockMode: 'dimensions',
      blockWidthM: parseFloat(blockWidthM),
      blockLengthM: parseFloat(blockLengthM),
      widthBearingDeg: parsedBearing,
      plotWidthM: parseFloat(plotWidthM),
      plotDepthM: parseFloat(plotDepthM),
      roadWidthM: parseFloat(roadWidthM),
      previousState: subdivisionState,
    });

    if (!res.ok) {
      setSameeError(res.errorSomali);
      return;
    }

    onApplyNashqadState(res.nextState, res.summary);
    setActiveModal('none');
    onNotify(
      'Nashqad Cusub Waa Diyaar',
      `Bearing ${res.summary.widthBearingDeg ?? parsedBearing}° · ${res.summary.blocksCount} Block · ${res.summary.fullPlotsCount} Plot dhammaystiran · ${res.summary.halfPlotsCount} Half plot (${Math.round(res.summary.totalPlotsAreaSqM).toLocaleString()} m²).`
    );
  };

  const handleSelectMultiNashqadBeerFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    const files = fileList ? Array.from(fileList) : [];
    e.target.value = '';
    if (files.length === 0) return;

    setSooGeliError(null);
    setIsReadingFiles(true);
    try {
      const texts = await Promise.all(files.map(readFileAsTextPromise));
      const inspection = inspectAndClassifyNashqadBeerFiles(texts);
      if (!inspection.ok) {
        setSooGeliError(inspection.errorSomali);
        setInspectedFiles([]);
        setIsReadingFiles(false);
        return;
      }

      if (!inspection.needsManualSelection && !reviewFilesBeforeImport) {
        const built = buildNashqadBeerState(inspection.files, subdivisionState);
        if (!built.ok) {
          setSooGeliError(built.errorSomali);
          setInspectedFiles(inspection.files);
          setIsReadingFiles(false);
          return;
        }
        onApplyNashqadState(built.nextState, built.summary);
        setActiveModal('none');
        setInspectedFiles([]);
        const missingNote =
          built.summary.missingFileMessages.length > 0
            ? ` (${built.summary.missingFileMessages.join(', ')})`
            : '';
        onNotify(
          `Nashqadda Beerta (${built.summary.recognizedFiles.length} Fayl)`,
          `${built.summary.blocksCount} Block · ${built.summary.fullPlotsCount} Plot dhammaystiran · ${built.summary.halfPlotsCount} Half plot${missingNote}.`
        );
      } else {
        setInspectedFiles(inspection.files);
      }
    } catch (err) {
      setSooGeliError(
        err instanceof Error ? err.message : 'Faylasha GeoJSON waa la akhrin kari waayey.'
      );
    } finally {
      setIsReadingFiles(false);
    }
  };

  const handleChangeManualRole = (fileId: string, role: NashqadFileRole) => {
    setInspectedFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? {
              ...f,
              detectedRole: role,
              recognizedBy: 'manual',
            }
          : f
      )
    );
  };

  const handleConfirmManualNashqadBeer = () => {
    setSooGeliError(null);
    const hasUnassigned = inspectedFiles.some((f) => f.detectedRole === 'unknown');
    if (hasUnassigned) {
      setSooGeliError('Fadlan fayl kasta oo aan la aqoonsan u dooro noociisa liiska hoose.');
      return;
    }

    const built = buildNashqadBeerState(inspectedFiles, subdivisionState);
    if (!built.ok) {
      setSooGeliError(built.errorSomali);
      return;
    }

    onApplyNashqadState(built.nextState, built.summary);
    setActiveModal('none');
    setInspectedFiles([]);
    const missingNote =
      built.summary.missingFileMessages.length > 0
        ? ` (${built.summary.missingFileMessages.join(', ')})`
        : '';
    onNotify(
      `Nashqadda Beerta (${built.summary.recognizedFiles.length} Fayl)`,
      `${built.summary.blocksCount} Block · ${built.summary.fullPlotsCount} Plot dhammaystiran · ${built.summary.halfPlotsCount} Half plot${missingNote}.`
    );
  };

  const plotPreviewArea =
    Math.max(0, parseFloat(plotWidthM) || 0) * Math.max(0, parseFloat(plotDepthM) || 0);
  const liveBearingNum = Number.isFinite(parseFloat(widthBearingDeg))
    ? ((parseFloat(widthBearingDeg) % 360) + 360) % 360
    : 0;
  const canAutoDetectBearing = Boolean(
    (sampleBlockMode === 'file' && sampleBlockFileData?.detectedBearingDeg != null) ||
      boundaryFileData?.detectedBearingDeg != null
  );

  return (
    <>
      {/* Backdrop when "+" menu is open so outside tap closes it */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-[1040] bg-black/25"
          onClick={() => setIsMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* BOTTOM-CENTER CIRCULAR "+" FLOATING ACTION BUTTON (SOLE UPLOAD ENTRY POINT) */}
      <div className="fixed bottom-[76px] lg:bottom-5 left-1/2 -translate-x-1/2 z-[1050] flex flex-col items-center">
        {/* Upward Popover Menu: ONLY TWO CHOICES */}
        {isMenuOpen && (
          <div
            role="menu"
            aria-label="Xulashooyinka nashqadda beerta"
            className="mb-3 w-64 rounded-2xl bg-[#0B1220] border border-[#243449] shadow-2xl p-1.5 space-y-1 text-[#F8FAFC]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleOpenSameeNashqad}
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl bg-[#0F1B2D] hover:bg-[#16263D] border border-transparent hover:border-[#22C55E]/60 flex items-center gap-3 text-left transition-colors cursor-pointer"
            >
              <span className="w-8 h-8 rounded-lg bg-[#22C55E]/15 border border-[#22C55E]/35 text-[#22C55E] flex items-center justify-center shrink-0">
                <Grid className="w-4 h-4" />
              </span>
              <span className="text-xs font-extrabold text-[#F8FAFC]">Samee nashqad</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={handleOpenSooGeliNashqad}
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl bg-[#0F1B2D] hover:bg-[#16263D] border border-transparent hover:border-[#38BDF8]/60 flex items-center gap-3 text-left transition-colors cursor-pointer"
            >
              <span className="w-8 h-8 rounded-lg bg-[#38BDF8]/15 border border-[#38BDF8]/35 text-[#38BDF8] flex items-center justify-center shrink-0">
                <FolderOpen className="w-4 h-4" />
              </span>
              <span className="text-xs font-extrabold text-[#F8FAFC]">
                Soo geli nashqad beer
              </span>
            </button>
          </div>
        )}

        {/* Circular "+" Button that rotates 45° into "×" */}
        <button
          type="button"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? 'Xidh liiska' : 'Fur liiska nashqadda'}
          className="w-14 h-14 rounded-full bg-[#22C55E] hover:bg-[#16A34A] text-[#030712] shadow-2xl border-2 border-[#0B1220] flex items-center justify-center transition-colors cursor-pointer"
        >
          <Plus
            className={`w-7 h-7 stroke-[2.75] transition-transform duration-200 ${
              isMenuOpen ? 'rotate-45' : 'rotate-0'
            }`}
          />
        </button>
      </div>

      {/* ========================================================================== */}
      {/* MODAL 1: "Samee nashqad" (with Bearing Degree in BOTH block modes!)        */}
      {/* ========================================================================== */}
      {activeModal === 'samee_nashqad' && (
        <div
          className="fixed inset-0 z-[1100] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setActiveModal('none')}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-[#0B1220] border border-[#243449] shadow-2xl text-[#F8FAFC] overflow-hidden max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-[#0F1B2D] border-b border-[#243449] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/35 text-[#22C55E] flex items-center justify-center shrink-0">
                  <Grid className="w-4 h-4" />
                </span>
                <div>
                  <h2 className="text-sm font-extrabold text-[#F8FAFC]">Samee nashqad</h2>
                  <p className="text-[11px] text-[#94A3B8]">
                    Si toos ah uga dhis blocks, plots dhammaystiran iyo half plots gudaha xuduudka
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal('none')}
                aria-label="Xidh daaqadda"
                className="min-h-[38px] min-w-[38px] rounded-xl hover:bg-[#0B1220] text-[#94A3B8] hover:text-[#F8FAFC] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitSameeNashqad}
              className="p-5 space-y-4 overflow-y-auto text-xs"
            >
              {/* Hidden inputs with value reset on click & change */}
              <input
                ref={pairGeoJsonInputRef}
                type="file"
                multiple
                accept=".geojson,.json"
                className="hidden"
                onClick={(e) => {
                  e.currentTarget.value = '';
                }}
                onChange={handleSelectPairGeoJsonFiles}
              />
              <input
                ref={boundarySingleInputRef}
                type="file"
                accept=".geojson,.json"
                className="hidden"
                onClick={(e) => {
                  e.currentTarget.value = '';
                }}
                onChange={handleSelectBoundaryFile}
              />
              <input
                ref={sampleBlockInputRef}
                type="file"
                accept=".geojson,.json"
                className="hidden"
                onClick={(e) => {
                  e.currentTarget.value = '';
                }}
                onChange={handleSelectSampleBlockFile}
              />

              {/* Mode Switch: GeoJSON (Xuduud + Block Tusaale — Automatic, zero extra inputs!) vs Cabbirka Block-ga (m) */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#0F1B2D] border border-[#243449]">
                <button
                  type="button"
                  onClick={() => setSampleBlockMode('file')}
                  className={`min-h-[38px] rounded-lg px-2.5 py-1.5 font-bold transition-colors cursor-pointer ${
                    sampleBlockMode === 'file'
                      ? 'bg-[#22C55E] text-[#030712]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  Xuduud + Block Tusaale
                </button>
                <button
                  type="button"
                  onClick={() => setSampleBlockMode('dimensions')}
                  className={`min-h-[38px] rounded-lg px-2.5 py-1.5 font-bold transition-colors cursor-pointer ${
                    sampleBlockMode === 'dimensions'
                      ? 'bg-[#22C55E] text-[#030712]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  Cabbirka Block-ga (m)
                </button>
              </div>

              {sampleBlockMode === 'file' ? (
                <div className="space-y-3">
                  {/* One-click Multi-File Picker: Select BOTH Xuduudka Beerta + Block Tusaale at once! */}
                  <button
                    type="button"
                    onClick={() => pairGeoJsonInputRef.current?.click()}
                    className="w-full min-h-[60px] rounded-2xl bg-[#0F1B2D] hover:bg-[#16263D] border-2 border-dashed border-[#22C55E]/70 px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-10 h-10 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#22C55E] flex items-center justify-center shrink-0">
                        <FolderOpen className="w-5 h-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-extrabold text-[#F8FAFC] truncate">
                          Wada dooro Xuduudka Beerta + Block Tusaale
                        </div>
                        <div className="text-[11px] text-[#94A3B8] truncate">
                          Dooro 2-da fayl GeoJSON mar keliya — si toos ah ayuu u xisaabinayaa
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-extrabold text-[#22C55E] shrink-0">
                      Dooro
                    </span>
                  </button>

                  {/* Or select each file one-by-one */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => boundarySingleInputRef.current?.click()}
                      className="min-h-[46px] rounded-xl bg-[#0F1B2D] hover:bg-[#16263D] border border-[#243449] hover:border-[#22C55E]/60 px-3 py-2 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileJson className="w-4 h-4 text-[#22C55E] shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[10px] text-[#94A3B8]">1. Xuduudka Beerta</div>
                          <div className="truncate font-bold text-[#F8FAFC]">
                            {boundaryFileData ? boundaryFileData.fileName : 'Dooro GeoJSON'}
                          </div>
                        </div>
                      </div>
                      {boundaryFileData && (
                        <Check className="w-4 h-4 text-[#22C55E] shrink-0" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => sampleBlockInputRef.current?.click()}
                      className="min-h-[46px] rounded-xl bg-[#0F1B2D] hover:bg-[#16263D] border border-[#243449] hover:border-[#38BDF8]/60 px-3 py-2 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileJson className="w-4 h-4 text-[#38BDF8] shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[10px] text-[#94A3B8]">2. Block Tusaale</div>
                          <div className="truncate font-bold text-[#F8FAFC]">
                            {sampleBlockFileData ? sampleBlockFileData.fileName : 'Dooro GeoJSON'}
                          </div>
                        </div>
                      </div>
                      {sampleBlockFileData && (
                        <Check className="w-4 h-4 text-[#38BDF8] shrink-0" />
                      )}
                    </button>
                  </div>

                  {/* Automatic 90×48m Rule Explanation — Zero Extra Inputs Needed */}
                  <div className="rounded-xl bg-[#0F1B2D]/85 border border-[#243449] px-3.5 py-2.5 space-y-1 text-[11px] text-[#94A3B8] leading-relaxed">
                    <div className="font-bold text-[#22C55E]">
                      Xisaabin toos ah (wax kale looma baahna):
                    </div>
                    <div>
                      • Block <strong className="text-[#F8FAFC]">90×48 m</strong>: afarta dhinacba waddo{' '}
                      <strong className="text-[#F8FAFC]">15 m</strong>, plot kasta{' '}
                      <strong className="text-[#F8FAFC]">18×24 m</strong>.
                    </div>
                    <div>
                      • Half plot <strong className="text-[#F59E0B]">1, 5, 6, 10</strong> ={' '}
                      <strong className="text-[#F8FAFC]">18×12 m</strong> · Half plot{' '}
                      <strong className="text-[#F59E0B]">2, 3, 4, 7, 8, 9</strong> ={' '}
                      <strong className="text-[#F8FAFC]">9×24 m</strong>.
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* 1) Fayl GeoJSON ah oo xuduudka beerta ah (Polygon) */}
                  <div className="space-y-1.5">
                    <label className="block font-bold text-[#F8FAFC]">
                      1. Xuduudka beerta (Polygon GeoJSON) <span className="text-rose-400">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => boundarySingleInputRef.current?.click()}
                      className="w-full min-h-[46px] rounded-xl bg-[#0F1B2D] hover:bg-[#16263D] border border-dashed border-[#22C55E]/60 px-3.5 py-2.5 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileJson className="w-4 h-4 text-[#22C55E] shrink-0" />
                        <span className="truncate font-semibold text-[#F8FAFC]">
                          {boundaryFileData
                            ? boundaryFileData.fileName
                            : 'Dooro faylka GeoJSON ee xuduudka beerta'}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-[#22C55E] shrink-0">
                        {boundaryFileData ? `${boundaryFileData.polygonCount} Polygon` : 'Dooro fayl'}
                      </span>
                    </button>
                  </div>

                  {/* 2) Cabbirka Block-ga & Bearing-ka Jihada Ballaca */}
                  <div className="space-y-2.5">
                    <label className="block font-bold text-[#F8FAFC]">
                      2. Cabbirka Block-ga &amp; Bearing-ka Jihada Ballaca
                    </label>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-[#94A3B8] mb-1">
                          Ballaca Block-ga (mitir)
                        </label>
                        <input
                          type="number"
                          min={1}
                          step="any"
                          required
                          value={blockWidthM}
                          onChange={(e) => setBlockWidthM(e.target.value)}
                          className="w-full min-h-[42px] rounded-xl bg-[#0F1B2D] border border-[#243449] focus:border-[#22C55E] px-3 py-1.5 font-bold text-[#F8FAFC] tabular-nums focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#94A3B8] mb-1">
                          Dhererka Block-ga (mitir)
                        </label>
                        <input
                          type="number"
                          min={1}
                          step="any"
                          required
                          value={blockLengthM}
                          onChange={(e) => setBlockLengthM(e.target.value)}
                          className="w-full min-h-[42px] rounded-xl bg-[#0F1B2D] border border-[#243449] focus:border-[#22C55E] px-3 py-1.5 font-bold text-[#F8FAFC] tabular-nums focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* BEARING DEGREE FOR BLOCK WIDTH DIRECTION */}
                    <div className="rounded-xl bg-[#0F1B2D]/85 border border-[#243449] p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Compass className="w-4 h-4 text-[#22C55E] shrink-0" />
                          <label
                            htmlFor="samee-width-bearing"
                            className="font-bold text-[#F8FAFC] truncate"
                          >
                            Bearing Degree (°) — Jihada Ballaca Block-ga
                          </label>
                        </div>
                        {canAutoDetectBearing && (
                          <button
                            type="button"
                            onClick={handleAutoDetectBearingClick}
                            title="Si toos ah uga cabbir jihada faylka GeoJSON"
                            className="min-h-[28px] px-2 py-0.5 rounded-lg bg-[#0B1220] hover:bg-[#16263D] border border-[#243449] text-[10.5px] font-bold text-[#22C55E] inline-flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Ka qaado faylka</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-xl bg-[#0B1220] border border-[#243449] flex items-center justify-center shrink-0"
                          title={`Jihada Ballaca Block-ga: ${liveBearingNum}°`}
                        >
                          <svg width="38" height="38" viewBox="0 0 40 40" aria-hidden="true">
                            <circle
                              cx="20"
                              cy="20"
                              r="16"
                              fill="none"
                              stroke="#243449"
                              strokeWidth="1.2"
                            />
                            <text
                              x="20"
                              y="7.5"
                              textAnchor="middle"
                              fontSize="6.5"
                              fontWeight="800"
                              fill="#94A3B8"
                            >
                              N
                            </text>
                            <g transform={`rotate(${liveBearingNum} 20 20)`}>
                              <line
                                x1="9"
                                y1="20"
                                x2="31"
                                y2="20"
                                stroke="#38BDF8"
                                strokeWidth="1.6"
                                strokeDasharray="2.5 2"
                              />
                              <line
                                x1="20"
                                y1="29"
                                x2="20"
                                y2="9"
                                stroke="#22C55E"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                              />
                              <polygon points="20,6 16.5,12 23.5,12" fill="#22C55E" />
                            </g>
                          </svg>
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <input
                              id="samee-width-bearing"
                              type="number"
                              min={0}
                              max={360}
                              step="any"
                              required
                              value={widthBearingDeg}
                              onChange={(e) => {
                                setWidthBearingDeg(e.target.value);
                                setUserEditedBearing(true);
                              }}
                              className="w-28 min-h-[40px] rounded-xl bg-[#0B1220] border border-[#243449] focus:border-[#22C55E] px-3 py-1 font-extrabold text-[#F8FAFC] tabular-nums focus:outline-none"
                            />
                            <span className="text-[11px] font-bold text-[#22C55E] truncate tabular-nums">
                              {liveBearingNum.toFixed(1)}° · {formatCompassDirectionSomali(liveBearingNum)}
                            </span>
                          </div>
                          <p className="text-[10.5px] text-[#94A3B8] leading-snug">
                            0° = Waqooyi · 90° = Bari · 180° = Koonfur · 270° = Galbeed
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {COMPASS_BEARING_PRESETS.map((preset) => {
                          const isPresetActive = Math.abs(liveBearingNum - preset.deg) < 0.05;
                          return (
                            <button
                              key={preset.deg}
                              type="button"
                              onClick={() => {
                                setWidthBearingDeg(String(preset.deg));
                                setUserEditedBearing(true);
                              }}
                              className={`min-h-[26px] px-2 py-0.5 rounded-lg text-[10.5px] font-bold tabular-nums transition-colors cursor-pointer ${
                                isPresetActive
                                  ? 'bg-[#22C55E] text-[#030712]'
                                  : 'bg-[#0B1220] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#243449]'
                              }`}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 3) Cabbirka Plot-ka & Waddooyinka */}
                  <div className="rounded-xl bg-[#0F1B2D]/75 border border-[#243449] p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#F8FAFC]">
                        3. Cabbirka Plots-ka &amp; Waddooyinka
                      </span>
                      <span className="text-[11px] text-[#22C55E] font-bold tabular-nums">
                        {Math.round(plotPreviewArea).toLocaleString()} m² / plot
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10.5px] text-[#94A3B8] mb-1">
                          Plot ballac (m)
                        </label>
                        <input
                          type="number"
                          min={1}
                          step="any"
                          required
                          value={plotWidthM}
                          onChange={(e) => setPlotWidthM(e.target.value)}
                          className="w-full min-h-[40px] rounded-xl bg-[#0B1220] border border-[#243449] focus:border-[#22C55E] px-2.5 py-1 font-bold text-[#F8FAFC] tabular-nums focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] text-[#94A3B8] mb-1">
                          Plot dherer (m)
                        </label>
                        <input
                          type="number"
                          min={1}
                          step="any"
                          required
                          value={plotDepthM}
                          onChange={(e) => setPlotDepthM(e.target.value)}
                          className="w-full min-h-[40px] rounded-xl bg-[#0B1220] border border-[#243449] focus:border-[#22C55E] px-2.5 py-1 font-bold text-[#F8FAFC] tabular-nums focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] text-[#94A3B8] mb-1">
                          Waddada (m)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          required
                          value={roadWidthM}
                          onChange={(e) => setRoadWidthM(e.target.value)}
                          className="w-full min-h-[40px] rounded-xl bg-[#0B1220] border border-[#243449] focus:border-[#22C55E] px-2.5 py-1 font-bold text-[#F8FAFC] tabular-nums focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {sameeError && (
                <div className="rounded-xl bg-rose-950/50 border border-rose-500/45 px-3.5 py-2.5 text-xs font-medium text-rose-200">
                  {sameeError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveModal('none')}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#94A3B8] font-bold text-[#F8FAFC] cursor-pointer"
                >
                  Xidh
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#22C55E] hover:bg-[#16A34A] text-[#030712] font-extrabold cursor-pointer"
                >
                  Samee nashqad
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================== */}
      {/* MODAL 2: "Soo geli nashqad beer" (Supports 2, 3, or 20+ GeoJSON files!)     */}
      {/* ========================================================================== */}
      {activeModal === 'soo_geli_nashqad' && (
        <div
          className="fixed inset-0 z-[1100] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setActiveModal('none')}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-[#0B1220] border border-[#243449] shadow-2xl text-[#F8FAFC] overflow-hidden max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-[#0F1B2D] border-b border-[#243449] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-[#38BDF8]/15 border border-[#38BDF8]/35 text-[#38BDF8] flex items-center justify-center shrink-0">
                  <FolderOpen className="w-4 h-4" />
                </span>
                <div>
                  <h2 className="text-sm font-extrabold text-[#F8FAFC]">Soo geli nashqad beer</h2>
                  <p className="text-[11px] text-[#94A3B8]">
                    Hal mar wada dooro 2, 3 ama 20+ fayl oo GeoJSON ah (xuduud, blocks, plots, dooxyada iwm.)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal('none')}
                aria-label="Xidh daaqadda"
                className="min-h-[38px] min-w-[38px] rounded-xl hover:bg-[#0B1220] text-[#94A3B8] hover:text-[#F8FAFC] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              <input
                ref={multiBeerInputRef}
                type="file"
                multiple
                accept=".geojson,.json"
                className="hidden"
                onClick={(e) => {
                  e.currentTarget.value = '';
                }}
                onChange={handleSelectMultiNashqadBeerFiles}
              />

              <button
                type="button"
                disabled={isReadingFiles}
                onClick={() => multiBeerInputRef.current?.click()}
                className="w-full min-h-[64px] rounded-2xl bg-[#0F1B2D] hover:bg-[#16263D] border-2 border-dashed border-[#38BDF8]/65 px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FolderOpen className="w-5 h-5 text-[#38BDF8] shrink-0" />
                  <div className="min-w-0">
                    <div className="font-extrabold text-[#F8FAFC] truncate">
                      {isReadingFiles
                        ? 'Waa la akhrinayaa dhammaan faylasha...'
                        : 'Dooro faylasha GeoJSON (ilaa 20+ fayl hal mar)'}
                    </div>
                    <div className="text-[11px] text-[#94A3B8] truncate">
                      xuduudaha · blocks · plots · dooxyada · waddooyinka · aagagga gaarka ah
                    </div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-[#38BDF8]/15 text-[#38BDF8] font-bold shrink-0">
                  Dooro
                </span>
              </button>

              {/* Optional toggle to inspect/review file roles before auto-applying */}
              <label className="flex items-center gap-2 text-[11px] text-[#94A3B8] cursor-pointer select-none px-1">
                <input
                  type="checkbox"
                  checked={reviewFilesBeforeImport}
                  onChange={(e) => setReviewFilesBeforeImport(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-[#22C55E] cursor-pointer shrink-0"
                />
                <span>Dib u eeg liiska faylasha la doortay ka hor inta aan khariidadda lagu darin</span>
              </label>

              {/* File list & `<select>` role picker (shown automatically if any file is unknown OR if review is checked) */}
              {inspectedFiles.length > 0 && (
                <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#F8FAFC]">
                      Faylasha la doortay ({inspectedFiles.length} fayl):
                    </span>
                    <span className="text-[11px] text-[#94A3B8] tabular-nums">
                      {inspectedFiles.filter((f) => f.detectedRole !== 'unknown').length}/
                      {inspectedFiles.length} la aqoonsaday
                    </span>
                  </div>

                  <div className="max-h-60 overflow-y-auto pr-1 space-y-2">
                    {inspectedFiles.map((f) => (
                      <div
                        key={f.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-[#0B1220] border border-[#243449] p-2.5"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[#F8FAFC] truncate">{f.fileName}</div>
                          <div className="text-[11px] text-[#94A3B8] tabular-nums">
                            {f.featureCount} xog (features)
                          </div>
                        </div>

                        <select
                          value={f.detectedRole}
                          onChange={(e) =>
                            handleChangeManualRole(f.id, e.target.value as NashqadFileRole)
                          }
                          aria-label={`Nooca faylka ${f.fileName}`}
                          className="min-h-[36px] rounded-lg bg-[#0F1B2D] border border-[#243449] focus:border-[#22C55E] px-2.5 py-1 text-xs font-bold text-[#F8FAFC] focus:outline-none cursor-pointer shrink-0"
                        >
                          <option value="unknown">-- Dooro nooca --</option>
                          <option value="boundary">Xuduudka beerta (xuduudaha)</option>
                          <option value="blocks">Blocks (blocks.geojson)</option>
                          <option value="plots">Plots / Half Plots (plots.geojson)</option>
                          <option value="wadis">Dooxyada / Togagga</option>
                          <option value="roads">Waddooyinka / Jidadka</option>
                          <option value="special_area">Aag gaar ah (Masjid / Ceel / Danguud)</option>
                          <option value="extra_layer">Lakab dheeraad ah (Dhibco / Kale)</option>
                          <option value="ignore">Iska dhaaf faylkan</option>
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleConfirmManualNashqadBeer}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[#22C55E] hover:bg-[#16A34A] text-[#030712] font-extrabold cursor-pointer"
                    >
                      Muuji Khariidadda ({inspectedFiles.length} fayl)
                    </button>
                  </div>
                </div>
              )}

              {sooGeliError && (
                <div className="rounded-xl bg-rose-950/50 border border-rose-500/45 px-3.5 py-2.5 text-xs font-medium text-rose-200">
                  {sooGeliError}
                </div>
              )}

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setActiveModal('none')}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#94A3B8] font-bold text-[#F8FAFC] cursor-pointer"
                >
                  Xidh
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
