import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Compass,
  FolderOpen,
  Loader2,
  LocateFixed,
  RefreshCw,
  Ruler,
  X,
} from 'lucide-react';
import {
  LandSubdivisionState,
  NashqadWorkflowSummary,
} from '../types/landSubdivision';
import {
  ANDROID_SAFE_GIS_ACCEPT,
  readAndNormalizeGisFile,
} from '../utils/kmlAndGeoJsonParser';
import {
  ComplianceAudit15m90x48,
  SahankaAiSurveyOutput,
  SahankaSurveyMode,
  audit15mAnd90x48mCompliance,
  autoFixToStandard15m90x48,
  extractBoundaryGeoJsonAndCenterFromState,
  runSahankaAiSurvey,
} from '../utils/sahankaAiEngine';

interface SahankaAiModalProps {
  subdivisionState: LandSubdivisionState;
  onClose: () => void;
  onApplyNashqadState: (
    nextState: LandSubdivisionState,
    summary: NashqadWorkflowSummary
  ) => void;
  onNotify: (title: string, message: string) => void;
}

export const SahankaAiModal: React.FC<SahankaAiModalProps> = ({
  subdivisionState,
  onClose,
  onApplyNashqadState,
  onNotify,
}) => {
  const existingBoundaryInfo = useMemo(
    () => extractBoundaryGeoJsonAndCenterFromState(subdivisionState),
    [subdivisionState]
  );

  const liveCurrentAudit = useMemo<ComplianceAudit15m90x48>(
    () => audit15mAnd90x48mCompliance(subdivisionState),
    [subdivisionState]
  );

  const [mode, setMode] = useState<SahankaSurveyMode>('auto_10yr');
  const [sourceChoice, setSourceChoice] = useState<'current_or_file' | 'coords'>(
    existingBoundaryInfo ? 'current_or_file' : 'coords'
  );

  // Optional file uploads
  const bndInputRef = useRef<HTMLInputElement | null>(null);
  const wadiInputRef = useRef<HTMLInputElement | null>(null);
  const sampleInputRef = useRef<HTMLInputElement | null>(null);

  const [boundaryFile, setBoundaryFile] = useState<{
    fileName: string;
    fileText: string;
  } | null>(null);
  const [wadiFile, setWadiFile] = useState<{
    fileName: string;
    fileText: string;
  } | null>(null);
  const [sampleBlockFile, setSampleBlockFile] = useState<{
    fileName: string;
    fileText: string;
  } | null>(null);

  // Coordinate survey inputs when no boundary is loaded or user selects GPS/Coords
  const [latStr, setLatStr] = useState<string>(
    existingBoundaryInfo ? String(existingBoundaryInfo.centerLat) : '9.5600'
  );
  const [lonStr, setLonStr] = useState<string>(
    existingBoundaryInfo ? String(existingBoundaryInfo.centerLon) : '44.0600'
  );
  const [eastWestMStr, setEastWestMStr] = useState<string>('340');
  const [northSouthMStr, setNorthSouthMStr] = useState<string>('240');
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);

  // Manual mode parameters
  const [auditExistingOnly, setAuditExistingOnly] = useState<boolean>(
    Boolean(existingBoundaryInfo)
  );
  const [manualBlockL, setManualBlockL] = useState<string>('90');
  const [manualBlockW, setManualBlockW] = useState<string>('48');
  const [manualRoadW, setManualRoadW] = useState<string>('15');
  const [manualBearing, setManualBearing] = useState<string>(
    subdivisionState.nashqadSummary?.widthBearingDeg != null
      ? String(subdivisionState.nashqadSummary.widthBearingDeg)
      : ''
  );
  const [userNotes, setUserNotes] = useState<string>('');

  // Execution & Results state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isAutoFixing, setIsAutoFixing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [surveyOutput, setSurveyOutput] = useState<SahankaAiSurveyOutput | null>(null);
  const [showYearlyTable, setShowYearlyTable] = useState<boolean>(false);

  const handlePickGisFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'boundary' | 'wadi' | 'sample'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    const norm = await readAndNormalizeGisFile(file);
    if (norm.ok === false) {
      setErrorMsg(norm.errorSomali);
      return;
    }
    const item = { fileName: norm.fileName, fileText: norm.fileText };
    if (target === 'boundary') {
      setBoundaryFile(item);
      setAuditExistingOnly(false);
    } else if (target === 'wadi') {
      setWadiFile(item);
    } else {
      setSampleBlockFile(item);
      setAuditExistingOnly(false);
    }
  };

  const handleUseCurrentGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMsg('Qalabkani ma taageerayo GPS toos ah.');
      return;
    }
    setIsLocatingGps(true);
    setErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatStr(pos.coords.latitude.toFixed(6));
        setLonStr(pos.coords.longitude.toFixed(6));
        setIsLocatingGps(false);
      },
      () => {
        setIsLocatingGps(false);
        setErrorMsg('Goobta GPS-ka lama helin. Fadlan geli Latitude & Longitude.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleRunSurvey = async () => {
    setErrorMsg(null);
    setIsRunning(true);
    try {
      const useCoords =
        sourceChoice === 'coords' && !boundaryFile;
      const parsedBearing =
        manualBearing.trim() !== '' ? Number(manualBearing) : null;

      const res = await runSahankaAiSurvey({
        mode,
        currentState: subdivisionState,
        boundaryFile,
        sampleBlockFile: mode === 'manual' ? sampleBlockFile : null,
        wadiFile,
        coordinateArea: useCoords
          ? {
              centerLat: Number(latStr),
              centerLon: Number(lonStr),
              eastWestM: Number(eastWestMStr) || 340,
              northSouthM: Number(northSouthMStr) || 240,
            }
          : null,
        manualParams: {
          auditCurrentWithoutRebuild:
            mode === 'manual' &&
            auditExistingOnly &&
            !boundaryFile &&
            !sampleBlockFile &&
            !useCoords,
          blockLengthM: Number(manualBlockL) || 90,
          blockWidthM: Number(manualBlockW) || 48,
          roadWidthM: Number(manualRoadW) || 15,
          plotWidthM: 18,
          plotDepthM: 24,
          widthBearingDeg: Number.isFinite(parsedBearing as number)
            ? parsedBearing
            : null,
        },
        userNotes: userNotes.trim() || undefined,
      });

      if (res.ok === false) {
        setErrorMsg(res.errorSomali);
      } else {
        setSurveyOutput(res);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Sahanka waa la dhammaystiri kari waayey.'
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleAutoFixStandard = async () => {
    setErrorMsg(null);
    setIsAutoFixing(true);
    try {
      const targetState = surveyOutput ? surveyOutput.nextState : subdivisionState;
      const parsedBearing =
        manualBearing.trim() !== '' && Number.isFinite(Number(manualBearing))
          ? Number(manualBearing)
          : null;
      const fixed = await autoFixToStandard15m90x48(targetState, parsedBearing);
      if (fixed.ok === false) {
        setErrorMsg(fixed.errorSomali);
        return;
      }

      if (surveyOutput) {
        setSurveyOutput({
          ...surveyOutput,
          nextState: fixed.nextState,
          nashqadSummary: fixed.summary,
          complianceAudit: fixed.complianceAudit,
        });
      } else {
        onApplyNashqadState(fixed.nextState, fixed.summary);
        onNotify(
          '90×48m & Waddo 15m Waa La Toosiyey',
          `${fixed.summary.blocksCount} Block · ${fixed.summary.fullPlotsCount} Plot (432 m²) · ${fixed.summary.halfPlotsCount} Half-plot (216 m²) & Heerarka 1–3.`
        );
        onClose();
      }
    } finally {
      setIsAutoFixing(false);
    }
  };

  const handleApplyToMap = () => {
    if (!surveyOutput) return;
    onApplyNashqadState(surveyOutput.nextState, surveyOutput.nashqadSummary);
    onNotify(
      'Sahanka AI Waa Lagu Dabaqay Khariidadda',
      `${surveyOutput.nashqadSummary.blocksCount} Block · ${surveyOutput.nashqadSummary.fullPlotsCount} Plot · Hubinta ${surveyOutput.complianceAudit.passedCount}/${surveyOutput.complianceAudit.totalChecks}.`
    );
    onClose();
  };

  const activeAudit = surveyOutput ? surveyOutput.complianceAudit : liveCurrentAudit;

  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/75 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#0B1220] border border-[#243449] shadow-2xl text-[#F8FAFC] overflow-hidden max-h-[calc(100dvh-1.5rem)] sm:max-h-[85dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3.5 py-2.5 bg-[#0F1B2D] border-b border-[#243449] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/35 text-[#22C55E] flex items-center justify-center shrink-0">
              <Compass className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold text-[#F8FAFC] truncate">
                Sahanka AI &amp; Hubinta 15m / 90×48m
              </h2>
              <p className="text-[11px] text-[#94A3B8] truncate">
                10 sano roob &amp; doox · Heerarka 1–3 · Halbeegga 90×48m
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Xidh daaqadda Sahanka AI"
            className="w-8 h-8 rounded-lg bg-[#0B1220] border border-[#243449] hover:border-[#94A3B8] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Hidden GIS File Inputs */}
        <input
          ref={bndInputRef}
          type="file"
          accept={ANDROID_SAFE_GIS_ACCEPT}
          onChange={(e) => handlePickGisFile(e, 'boundary')}
          className="hidden"
        />
        <input
          ref={wadiInputRef}
          type="file"
          accept={ANDROID_SAFE_GIS_ACCEPT}
          onChange={(e) => handlePickGisFile(e, 'wadi')}
          className="hidden"
        />
        <input
          ref={sampleInputRef}
          type="file"
          accept={ANDROID_SAFE_GIS_ACCEPT}
          onChange={(e) => handlePickGisFile(e, 'sample')}
          className="hidden"
        />

        {/* Scrollable Body */}
        <div className="p-3.5 space-y-3 overflow-y-auto flex-1 min-h-0 text-xs">
          {/* Segmented Mode Control (Interactive Buttons) */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0F1B2D] border border-[#243449]">
            <button
              type="button"
              onClick={() => {
                setMode('auto_10yr');
                setErrorMsg(null);
              }}
              className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold transition-colors cursor-pointer ${
                mode === 'auto_10yr'
                  ? 'bg-[#22C55E] text-[#05130B]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              1. Raadinta 10 Sano
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('manual');
                setErrorMsg(null);
              }}
              className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold transition-colors cursor-pointer ${
                mode === 'manual'
                  ? 'bg-[#22C55E] text-[#05130B]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              2. Gacanta &amp; Hubinta
            </button>
          </div>

          {/* ================================================================ */}
          {/* MODE 1: RAADINTA TOOSKA AH EE 10 SANO                            */}
          {/* ================================================================ */}
          {mode === 'auto_10yr' && (
            <div className="space-y-2.5 rounded-xl bg-[#0F1B2D] border border-[#243449] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[#F8FAFC]">Isha Xuduudka Beerta</span>
                <div className="flex items-center gap-1 bg-[#0B1220] p-0.5 rounded-lg border border-[#243449]">
                  <button
                    type="button"
                    onClick={() => setSourceChoice('current_or_file')}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      sourceChoice === 'current_or_file'
                        ? 'bg-[#1E293B] text-[#F8FAFC]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Fayl / Khariidad
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceChoice('coords')}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      sourceChoice === 'coords'
                        ? 'bg-[#1E293B] text-[#F8FAFC]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Goobta GPS
                  </button>
                </div>
              </div>

              {sourceChoice === 'current_or_file' ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-[#94A3B8] tabular-nums">
                    {boundaryFile ? (
                      <span>
                        Fayl cusub: <strong className="text-[#F8FAFC]">{boundaryFile.fileName}</strong>
                      </span>
                    ) : existingBoundaryInfo ? (
                      <span>
                        Xuduudka furan: <strong className="text-[#F8FAFC]">{existingBoundaryInfo.boundaryAreaHa} ha</strong>
                        {' · '}
                        {existingBoundaryInfo.centerLat.toFixed(4)}, {existingBoundaryInfo.centerLon.toFixed(4)}
                      </span>
                    ) : (
                      <span>Khariidaddu waa faaruq — dooro faylka xuduudka ama taabo Goobta GPS.</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => bndInputRef.current?.click()}
                      className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#0B1220] hover:bg-[#162235] border border-[#243449] font-semibold text-[#F8FAFC] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-[#22C55E] shrink-0" />
                      <span className="truncate">
                        {boundaryFile ? 'Beddel Xuduudka' : 'Xuduud GeoJSON/KML'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => wadiInputRef.current?.click()}
                      className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#0B1220] hover:bg-[#162235] border border-[#243449] font-semibold text-[#F8FAFC] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CloudRain className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                      <span className="truncate">
                        {wadiFile ? wadiFile.fileName : 'Doox (Ikhtiyaari)'}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#94A3B8]">
                      Geli barta bartamaha beerta (WGS84):
                    </span>
                    <button
                      type="button"
                      onClick={handleUseCurrentGps}
                      disabled={isLocatingGps}
                      className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[#0B1220] hover:bg-[#162235] border border-[#243449] text-[11px] font-semibold text-[#22C55E] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <LocateFixed className="w-3.5 h-3.5 shrink-0" />
                      <span>{isLocatingGps ? 'Waa la raadinayaa...' : 'Goobtayda GPS'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="block text-[10.5px] text-[#94A3B8]">Latitude</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={latStr}
                        onChange={(e) => setLatStr(e.target.value)}
                        className="w-full min-h-[36px] rounded-lg bg-[#0B1220] border border-[#243449] px-2.5 py-1 text-xs font-semibold tabular-nums text-[#F8FAFC]"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10.5px] text-[#94A3B8]">Longitude</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={lonStr}
                        onChange={(e) => setLonStr(e.target.value)}
                        className="w-full min-h-[36px] rounded-lg bg-[#0B1220] border border-[#243449] px-2.5 py-1 text-xs font-semibold tabular-nums text-[#F8FAFC]"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10.5px] text-[#94A3B8]">Bari–Galbeed (m)</span>
                      <input
                        type="number"
                        min={90}
                        max={4000}
                        value={eastWestMStr}
                        onChange={(e) => setEastWestMStr(e.target.value)}
                        className="w-full min-h-[36px] rounded-lg bg-[#0B1220] border border-[#243449] px-2.5 py-1 text-xs font-semibold tabular-nums text-[#F8FAFC]"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10.5px] text-[#94A3B8]">Waqooyi–Koonfur (m)</span>
                      <input
                        type="number"
                        min={60}
                        max={4000}
                        value={northSouthMStr}
                        onChange={(e) => setNorthSouthMStr(e.target.value)}
                        className="w-full min-h-[36px] rounded-lg bg-[#0B1220] border border-[#243449] px-2.5 py-1 text-xs font-semibold tabular-nums text-[#F8FAFC]"
                      />
                    </label>
                  </div>
                </div>
              )}

              <label className="block space-y-1">
                <span className="text-[10.5px] text-[#94A3B8]">
                  Xusuusin kooban oo sahanka ku saabsan (ikhtiyaari)
                </span>
                <input
                  type="text"
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder="Tusaale: dhinaca galbeed biyo-mareen ayaa mara..."
                  className="w-full min-h-[36px] rounded-lg bg-[#0B1220] border border-[#243449] px-2.5 py-1 text-xs text-[#F8FAFC] placeholder:text-[#64748B]"
                />
              </label>

              <button
                type="button"
                onClick={handleRunSurvey}
                disabled={isRunning}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-60 text-[#05130B] font-extrabold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Waa la baadhayaa 10-ka sano &amp; DEM...</span>
                  </>
                ) : (
                  <span>Bilow Sahanka 10 Sano &amp; 90×48m</span>
                )}
              </button>
            </div>
          )}

          {/* ================================================================ */}
          {/* MODE 2: GACANTA & HUBINTA 15m / 90x48m                           */}
          {/* ================================================================ */}
          {mode === 'manual' && (
            <div className="space-y-2.5 rounded-xl bg-[#0F1B2D] border border-[#243449] p-3">
              {existingBoundaryInfo && (
                <label className="flex items-center justify-between gap-2 pb-2 border-b border-[#243449] cursor-pointer">
                  <span className="text-[11.5px] font-semibold text-[#F8FAFC]">
                    Hubi nashqadda hadda khariidadda saaran oo keliya
                  </span>
                  <input
                    type="checkbox"
                    checked={auditExistingOnly}
                    onChange={(e) => setAuditExistingOnly(e.target.checked)}
                    className="w-4 h-4 accent-[#22C55E]"
                  />
                </label>
              )}

              {!auditExistingOnly && (
                <>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => bndInputRef.current?.click()}
                      className="min-h-[36px] px-2 py-1 rounded-lg bg-[#0B1220] hover:bg-[#162235] border border-[#243449] text-[11px] font-semibold truncate cursor-pointer"
                    >
                      {boundaryFile ? boundaryFile.fileName : '+ Xuduud'}
                    </button>
                    <button
                      type="button"
                      onClick={() => sampleInputRef.current?.click()}
                      className="min-h-[36px] px-2 py-1 rounded-lg bg-[#0B1220] hover:bg-[#162235] border border-[#243449] text-[11px] font-semibold truncate cursor-pointer"
                    >
                      {sampleBlockFile ? sampleBlockFile.fileName : '+ Block Tusaale'}
                    </button>
                    <button
                      type="button"
                      onClick={() => wadiInputRef.current?.click()}
                      className="min-h-[36px] px-2 py-1 rounded-lg bg-[#0B1220] hover:bg-[#162235] border border-[#243449] text-[11px] font-semibold truncate cursor-pointer"
                    >
                      {wadiFile ? wadiFile.fileName : '+ Dooxa'}
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    <label className="space-y-1">
                      <span className="block text-[10px] text-[#94A3B8]">Dherer (m)</span>
                      <input
                        type="number"
                        value={manualBlockL}
                        onChange={(e) => setManualBlockL(e.target.value)}
                        className="w-full min-h-[34px] rounded-lg bg-[#0B1220] border border-[#243449] px-2 py-1 text-xs font-semibold tabular-nums"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10px] text-[#94A3B8]">Ballac (m)</span>
                      <input
                        type="number"
                        value={manualBlockW}
                        onChange={(e) => setManualBlockW(e.target.value)}
                        className="w-full min-h-[34px] rounded-lg bg-[#0B1220] border border-[#243449] px-2 py-1 text-xs font-semibold tabular-nums"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10px] text-[#94A3B8]">Waddo (m)</span>
                      <input
                        type="number"
                        value={manualRoadW}
                        onChange={(e) => setManualRoadW(e.target.value)}
                        className="w-full min-h-[34px] rounded-lg bg-[#0B1220] border border-[#243449] px-2 py-1 text-xs font-semibold tabular-nums"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-[10px] text-[#94A3B8]">Bearing (°)</span>
                      <input
                        type="number"
                        placeholder="Toos"
                        value={manualBearing}
                        onChange={(e) => setManualBearing(e.target.value)}
                        className="w-full min-h-[34px] rounded-lg bg-[#0B1220] border border-[#243449] px-2 py-1 text-xs font-semibold tabular-nums"
                      />
                    </label>
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={handleRunSurvey}
                disabled={isRunning}
                className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-60 text-[#05130B] font-extrabold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Waa la hubinayaa cabbirrada &amp; dooxa...</span>
                  </>
                ) : (
                  <>
                    <Ruler className="w-4 h-4 shrink-0" />
                    <span>Hubi 15m / 90×48m &amp; Falanqee</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Error Notice */}
          {errorMsg && (
            <div className="rounded-xl bg-rose-950/50 border border-rose-500/45 px-3 py-2 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          {/* ================================================================ */}
          {/* DETERMINISTIC 5-POINT SCORECARD: HUBINTA 15m / 90×48m            */}
          {/* ================================================================ */}
          {(surveyOutput || (mode === 'manual' && activeAudit.blocksCount > 0)) && (
            <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] overflow-hidden">
              <div className="px-3 py-2 border-b border-[#243449] flex items-center justify-between gap-2">
                <span className="font-extrabold text-[#F8FAFC]">
                  Hubinta Halbeegga 15m / 90×48m
                </span>
                <span className="text-[11px] text-[#94A3B8] tabular-nums">
                  {activeAudit.passedCount}/{activeAudit.totalChecks} gudbay
                  {' · '}
                  <strong
                    className={
                      activeAudit.isFullyCompliant ? 'text-[#22C55E]' : 'text-amber-300'
                    }
                  >
                    {activeAudit.isFullyCompliant ? 'Waafaqsan' : 'U baahan toosin'}
                  </strong>
                </span>
              </div>

              <div className="divide-y divide-[#243449]/75">
                {activeAudit.checks.map((chk) => (
                  <div key={chk.id} className="px-3 py-2 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#F8FAFC]">{chk.titleSomali}</span>
                      <span
                        className={`text-[11px] font-bold tabular-nums ${
                          chk.passed ? 'text-[#22C55E]' : 'text-amber-300'
                        }`}
                      >
                        {chk.measuredLabelSomali}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#94A3B8] leading-snug">{chk.detailSomali}</p>
                  </div>
                ))}
              </div>

              {!activeAudit.isFullyCompliant && activeAudit.blocksCount > 0 && (
                <div className="px-3 py-2.5 bg-[#0B1220] border-t border-[#243449]">
                  <button
                    type="button"
                    onClick={handleAutoFixStandard}
                    disabled={isAutoFixing}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0B1220] font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 shrink-0 ${isAutoFixing ? 'animate-spin' : ''}`}
                    />
                    <span>Toosi 90×48m &amp; Waddo 15m</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* 10-YEAR RAINFALL / WADI ARCHIVE + GEMINI SURVEYOR REPORT         */}
          {/* ================================================================ */}
          {surveyOutput && (
            <div className="space-y-3">
              {/* 10-Year Hydrology Card */}
              <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-[#F8FAFC]">
                    Roobka &amp; Daadka 10 Sano ({surveyOutput.hydrology10Yr.startYear}–
                    {surveyOutput.hydrology10Yr.endYear})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowYearlyTable((p) => !p)}
                    className="text-[11px] font-semibold text-[#38BDF8] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Sanadaha</span>
                    {showYearlyTable ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                <div className="text-[11px] text-[#94A3B8]">
                  <span>{surveyOutput.hydrology10Yr.floodRiskLabelSomali}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="tabular-nums">{surveyOutput.detectedWadiCount} doox</span>
                  <span aria-hidden="true"> · </span>
                  <span className="tabular-nums">{surveyOutput.boundaryAreaHa} ha</span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#243449]/70 tabular-nums">
                  <div>
                    <span className="block text-[10px] text-[#94A3B8]">Celcelis / Sano</span>
                    <span className="text-sm font-extrabold text-[#F8FAFC]">
                      {surveyOutput.hydrology10Yr.avgAnnualRainfallMm} mm
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#94A3B8]">Maalin Ugu Badan</span>
                    <span className="text-sm font-extrabold text-[#38BDF8]">
                      {surveyOutput.hydrology10Yr.maxDailyRainfallMm} mm
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#94A3B8]">Maalmaha ≥25mm</span>
                    <span className="text-sm font-extrabold text-amber-300">
                      {surveyOutput.hydrology10Yr.heavyRainDays25mm}
                    </span>
                  </div>
                </div>

                {showYearlyTable && (
                  <div className="pt-2 border-t border-[#243449]/70 max-h-40 overflow-y-auto">
                    <table className="w-full text-[11px] tabular-nums">
                      <thead>
                        <tr className="text-left text-[#94A3B8] border-b border-[#243449]">
                          <th className="py-1 font-semibold">Sanadka</th>
                          <th className="py-1 font-semibold text-right">Wadarta (mm)</th>
                          <th className="py-1 font-semibold text-right">Ugu Badan (mm)</th>
                          <th className="py-1 font-semibold text-right">≥25mm</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#243449]/50">
                        {surveyOutput.hydrology10Yr.yearlyBreakdown.map((yr) => (
                          <tr key={yr.year}>
                            <td className="py-1 font-semibold">{yr.year}</td>
                            <td className="py-1 text-right">{yr.totalRainfallMm}</td>
                            <td className="py-1 text-right">{yr.maxDailyMm}</td>
                            <td className="py-1 text-right">{yr.floodDays25mm}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Gemini Surveyor Analysis */}
              <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-[#F8FAFC]">
                    Warbixinta Falanqaynta Sahanka
                  </span>
                  <span className="text-[10.5px] text-[#94A3B8]">
                    {surveyOutput.geminiReport.source === 'gemini-3.8-flash'
                      ? 'Falanqaynta AI'
                      : 'Xogta Sahanka'}
                  </span>
                </div>

                <p className="text-[11.5px] text-[#E2E8F0] leading-relaxed">
                  {surveyOutput.geminiReport.dulmarGuud}
                </p>
                <p className="text-[11.5px] text-[#94A3B8] leading-relaxed">
                  {surveyOutput.geminiReport.falanqaynta10SanoDooxa}
                </p>
                <p className="text-[11.5px] text-[#94A3B8] leading-relaxed">
                  {surveyOutput.geminiReport.hubinta15mIyo90x48}
                </p>

                {surveyOutput.geminiReport.talooyinkaHeerarkaDhaxalka.length > 0 && (
                  <div className="pt-2 border-t border-[#243449]/70 space-y-1">
                    <span className="block font-bold text-[#F8FAFC]">
                      Talooyinka Heerarka &amp; Qaybinta Dhaxalka
                    </span>
                    <ol className="space-y-1 text-[11px] text-[#CBD5E1] list-decimal list-inside">
                      {surveyOutput.geminiReport.talooyinkaHeerarkaDhaxalka.map((item, idx) => (
                        <li key={idx} className="leading-snug">
                          {item}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {surveyOutput.geminiReport.digniinahaMuhiimka.length > 0 && (
                  <div className="pt-2 border-t border-[#243449]/70 space-y-1 text-[11px] text-amber-200">
                    {surveyOutput.geminiReport.digniinahaMuhiimka.map((warn, idx) => (
                      <p key={idx} className="leading-snug">
                        {warn}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="px-3.5 py-2.5 bg-[#0F1B2D] border-t border-[#243449] flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#94A3B8] text-xs font-bold text-[#F8FAFC] cursor-pointer"
          >
            Xidh
          </button>

          {surveyOutput && (
            <button
              type="button"
              onClick={handleApplyToMap}
              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#22C55E] hover:bg-[#16A34A] text-[#05130B] text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[2.5] shrink-0" />
              <span>Ku Dabaq Khariidadda ({surveyOutput.nashqadSummary.blocksCount} Block)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
