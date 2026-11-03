import React, { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Compass,
  Lock,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { SampleBlockAlignmentInfo } from '../types/landSubdivision';
import { SampleBlockAxisAlignOptions } from '../utils/nashqadWorkflowEngine';

interface SampleBlockAxisControlCardProps {
  alignment: SampleBlockAlignmentInfo;
  onAlign: (options: SampleBlockAxisAlignOptions) => void;
  onDismiss?: () => void;
  isPaperMode?: boolean;
  compactBanner?: boolean;
}

function wrapDeg180(val: number): number {
  const n = ((val % 180) + 180) % 180;
  return +n.toFixed(1);
}

export const SampleBlockAxisControlCard: React.FC<SampleBlockAxisControlCardProps> = ({
  alignment,
  onAlign,
  onDismiss,
  isPaperMode = false,
  compactBanner = false,
}) => {
  // Default manual bearing target to Ballaca ('width') whenever Dherer is already aligned or Ballac has mismatch
  const defaultTargetAxis: 'width' | 'length' =
    alignment.hasLengthMismatch && !alignment.hasWidthMismatch ? 'length' : 'width';

  const [manualAxis, setManualAxis] = useState<'width' | 'length'>(defaultTargetAxis);
  const [manualDegText, setManualDegText] = useState<string>(() =>
    String(
      defaultTargetAxis === 'width'
        ? alignment.appliedWidthBearingDeg
        : alignment.appliedLengthBearingDeg
    )
  );
  const [syncAxisDimension, setSyncAxisDimension] = useState<boolean>(true);
  const [showManualPanel, setShowManualPanel] = useState<boolean>(
    () => !compactBanner || (alignment.isLengthAligned && alignment.hasWidthMismatch)
  );

  // Sync manual degree input when applied bearings or selected axis change
  useEffect(() => {
    setManualDegText(
      String(
        manualAxis === 'width'
          ? alignment.appliedWidthBearingDeg
          : alignment.appliedLengthBearingDeg
      )
    );
  }, [manualAxis, alignment.appliedWidthBearingDeg, alignment.appliedLengthBearingDeg]);

  // Auto-open manual bearing controls if Dherer matches sample block while Ballac does not
  useEffect(() => {
    if (alignment.isLengthAligned && alignment.hasWidthMismatch) {
      setManualAxis('width');
      setShowManualPanel(true);
    }
  }, [alignment.isLengthAligned, alignment.hasWidthMismatch]);

  const applyManualBearingValue = (nextDegRaw: number) => {
    if (!Number.isFinite(nextDegRaw)) return;
    const wrapped = wrapDeg180(nextDegRaw);
    setManualDegText(String(wrapped));
    if (manualAxis === 'width') {
      onAlign({
        mode: 'manual_bearing',
        manualWidthBearingDeg: wrapped,
        manualLengthBearingDeg: alignment.appliedLengthBearingDeg,
        manualWidthM: syncAxisDimension ? alignment.sampleWidthM : alignment.appliedWidthM,
        manualLengthM: alignment.appliedLengthM,
      });
    } else {
      onAlign({
        mode: 'manual_bearing',
        manualLengthBearingDeg: wrapped,
        manualWidthBearingDeg: alignment.appliedWidthBearingDeg,
        manualLengthM: syncAxisDimension ? alignment.sampleLengthM : alignment.appliedLengthM,
        manualWidthM: alignment.appliedWidthM,
      });
    }
  };

  const handleNudgeManualDeg = (delta: number) => {
    const base = parseFloat(manualDegText);
    const current = Number.isFinite(base)
      ? base
      : manualAxis === 'width'
      ? alignment.appliedWidthBearingDeg
      : alignment.appliedLengthBearingDeg;
    applyManualBearingValue(current + delta);
  };

  const headerTitle = !alignment.hasMismatch
    ? 'Blocks & Block Tusaale Waa Is-waafaqsan Yihiin'
    : alignment.isLengthAligned && alignment.hasWidthMismatch
    ? 'Dhererku Waa Sax — Fadhiisi Ballaca (°)'
    : alignment.isWidthAligned && alignment.hasLengthMismatch
    ? 'Ballacu Waa Sax — Fadhiisi Dhererka (°)'
    : "Is-waafaqid La'aan: Block Tusaale";

  return (
    <div
      className={`rounded-xl border p-2.5 space-y-2 text-[11px] tabular-nums ${
        isPaperMode
          ? alignment.hasMismatch
            ? 'bg-white/96 border-amber-500/75 text-slate-900 shadow-lg'
            : 'bg-white/96 border-emerald-500/60 text-slate-900 shadow-md'
          : alignment.hasMismatch
          ? 'bg-[#0a1220]/95 border-amber-500/55 text-[#F8FAFC] backdrop-blur-md shadow-xl'
          : 'bg-[#0F1B2D]/95 border-[#22C55E]/40 text-[#F8FAFC] shadow-md'
      }`}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className={`font-extrabold flex items-center gap-1.5 ${
              alignment.hasMismatch
                ? isPaperMode
                  ? 'text-amber-700'
                  : 'text-amber-300'
                : isPaperMode
                ? 'text-emerald-700'
                : 'text-[#22C55E]'
            }`}
          >
            <Compass className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{headerTitle}</span>
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Qari daaqadda waafajinta Block Tusaale"
            className="w-6 h-6 rounded-lg inline-flex items-center justify-center opacity-70 hover:opacity-100 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Independent Axis 1: DHERERKA */}
      <div
        className={`rounded-lg border px-2 py-1.5 space-y-1 ${
          isPaperMode
            ? 'bg-slate-50 border-slate-200'
            : 'bg-[#060d18]/85 border-[#223250]'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10.5px]">
              <strong className="font-extrabold">1. Dherer:</strong>
              <span
                className={
                  alignment.isLengthAligned
                    ? isPaperMode
                      ? 'text-emerald-700 font-bold'
                      : 'text-[#22C55E] font-bold'
                    : isPaperMode
                    ? 'text-amber-700 font-bold'
                    : 'text-amber-300 font-bold'
                }
              >
                {alignment.isLengthAligned ? 'Waafaqsan' : 'Is-khilaafsan'}
              </span>
            </div>
            <div className="text-[10px] opacity-85 truncate">
              Tusaale: <strong>{alignment.sampleLengthM}m</strong> ·{' '}
              <strong>{alignment.sampleLengthBearingDeg}°</strong>
              {' · '}
              Hadda: <strong>{alignment.appliedLengthM}m</strong> ·{' '}
              <strong>{alignment.appliedLengthBearingDeg}°</strong>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onAlign({ mode: 'length_only' })}
            className={`min-h-[28px] px-2 py-0.5 rounded-lg text-[10px] font-extrabold shrink-0 transition-colors cursor-pointer ${
              alignment.hasLengthMismatch
                ? 'bg-[#22C55E] hover:bg-[#16A34A] text-[#05130B]'
                : isPaperMode
                ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                : 'bg-[#111b2e] hover:bg-[#192842] border border-[#243449] text-[#E2E8F0]'
            }`}
          >
            Fadhiisi Dherer
          </button>
        </div>
      </div>

      {/* Independent Axis 2: BALLACA */}
      <div
        className={`rounded-lg border px-2 py-1.5 space-y-1 ${
          isPaperMode
            ? 'bg-slate-50 border-slate-200'
            : 'bg-[#060d18]/85 border-[#223250]'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10.5px]">
              <strong className="font-extrabold">2. Ballac:</strong>
              <span
                className={
                  alignment.isWidthAligned
                    ? isPaperMode
                      ? 'text-emerald-700 font-bold'
                      : 'text-[#22C55E] font-bold'
                    : isPaperMode
                    ? 'text-amber-700 font-bold'
                    : 'text-amber-300 font-bold'
                }
              >
                {alignment.isWidthAligned ? 'Waafaqsan' : 'Is-khilaafsan'}
              </span>
            </div>
            <div className="text-[10px] opacity-85 truncate">
              Tusaale: <strong>{alignment.sampleWidthM}m</strong> ·{' '}
              <strong>{alignment.sampleWidthBearingDeg}°</strong>
              {' · '}
              Hadda: <strong>{alignment.appliedWidthM}m</strong> ·{' '}
              <strong>{alignment.appliedWidthBearingDeg}°</strong>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onAlign({ mode: 'width_only' })}
            className={`min-h-[28px] px-2 py-0.5 rounded-lg text-[10px] font-extrabold shrink-0 transition-colors cursor-pointer ${
              alignment.hasWidthMismatch
                ? 'bg-[#22C55E] hover:bg-[#16A34A] text-[#05130B]'
                : isPaperMode
                ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                : 'bg-[#111b2e] hover:bg-[#192842] border border-[#243449] text-[#E2E8F0]'
            }`}
          >
            Fadhiisi Ballac
          </button>
        </div>
      </div>

      {/* Toggle / Section for Manual Bearing Degree Seating (`Gacanta ku fadhiisi Bearing °`) */}
      {compactBanner && !showManualPanel ? (
        <button
          type="button"
          onClick={() => setShowManualPanel(true)}
          className={`w-full min-h-[28px] rounded-lg border px-2 py-1 text-[10px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            isPaperMode
              ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
              : 'bg-[#0F1B2D] border-[#243449] text-[#CBD5E1] hover:border-amber-400 hover:text-white'
          }`}
        >
          <SlidersHorizontal className="w-3 h-3 shrink-0" />
          <span>Gacanta ku fadhiisi Bearing (°)</span>
        </button>
      ) : (
        <div
          className={`rounded-lg border p-2 space-y-1.5 ${
            isPaperMode
              ? 'bg-amber-50/70 border-amber-300/80'
              : 'bg-[#060d18]/90 border-[#243449]'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-extrabold opacity-90">
              Bearing Gacanta (°):
            </span>
            <div
              className={`inline-flex rounded-md p-0.5 border ${
                isPaperMode
                  ? 'bg-white border-slate-300'
                  : 'bg-[#0F1B2D] border-[#223250]'
              }`}
            >
              <button
                type="button"
                onClick={() => setManualAxis('width')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  manualAxis === 'width'
                    ? 'bg-[#22C55E] text-[#05130B]'
                    : 'opacity-75 hover:opacity-100'
                }`}
              >
                Ballaca (°)
              </button>
              <button
                type="button"
                onClick={() => setManualAxis('length')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  manualAxis === 'length'
                    ? 'bg-[#22C55E] text-[#05130B]'
                    : 'opacity-75 hover:opacity-100'
                }`}
              >
                Dhererka (°)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 text-[9.5px] opacity-80">
            <Lock className="w-2.5 h-2.5 shrink-0 text-[#22C55E]" />
            <span className="truncate">
              {manualAxis === 'width'
                ? `Dhererku wuu xidhan yahay (${alignment.appliedLengthM}m · ${alignment.appliedLengthBearingDeg}°)`
                : `Ballacu wuu xidhan yahay (${alignment.appliedWidthM}m · ${alignment.appliedWidthBearingDeg}°)`}
            </span>
          </div>

          {/* Live Nudge + Direct Degree Input */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleNudgeManualDeg(-1)}
              title="Yaree 1°"
              className={`min-h-[30px] px-1.5 rounded-md border text-[10px] font-extrabold cursor-pointer ${
                isPaperMode
                  ? 'bg-white border-slate-300 hover:bg-slate-100'
                  : 'bg-[#0F1B2D] border-[#243449] hover:border-[#22C55E]'
              }`}
            >
              −1°
            </button>
            <button
              type="button"
              onClick={() => handleNudgeManualDeg(-0.1)}
              title="Yaree 0.1°"
              className={`min-h-[30px] px-1.5 rounded-md border text-[10px] font-extrabold cursor-pointer ${
                isPaperMode
                  ? 'bg-white border-slate-300 hover:bg-slate-100'
                  : 'bg-[#0F1B2D] border-[#243449] hover:border-[#22C55E]'
              }`}
            >
              −.1
            </button>
            <input
              type="number"
              step={0.1}
              min={0}
              max={360}
              value={manualDegText}
              onChange={(e) => setManualDegText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyManualBearingValue(parseFloat(manualDegText));
                }
              }}
              aria-label="Bearing degree gacanta"
              className={`w-16 min-h-[30px] flex-1 rounded-md border px-1.5 py-0.5 text-center text-[11px] font-extrabold tabular-nums focus:outline-none ${
                isPaperMode
                  ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                  : 'bg-[#0B1220] border-[#243449] text-[#F8FAFC] focus:border-[#22C55E]'
              }`}
            />
            <button
              type="button"
              onClick={() => handleNudgeManualDeg(0.1)}
              title="Kordhi 0.1°"
              className={`min-h-[30px] px-1.5 rounded-md border text-[10px] font-extrabold cursor-pointer ${
                isPaperMode
                  ? 'bg-white border-slate-300 hover:bg-slate-100'
                  : 'bg-[#0F1B2D] border-[#243449] hover:border-[#22C55E]'
              }`}
            >
              +.1
            </button>
            <button
              type="button"
              onClick={() => handleNudgeManualDeg(1)}
              title="Kordhi 1°"
              className={`min-h-[30px] px-1.5 rounded-md border text-[10px] font-extrabold cursor-pointer ${
                isPaperMode
                  ? 'bg-white border-slate-300 hover:bg-slate-100'
                  : 'bg-[#0F1B2D] border-[#243449] hover:border-[#22C55E]'
              }`}
            >
              +1°
            </button>
            <button
              type="button"
              onClick={() => applyManualBearingValue(parseFloat(manualDegText))}
              className="min-h-[30px] px-2 rounded-md bg-[#22C55E] hover:bg-[#16A34A] text-[#05130B] text-[10px] font-black cursor-pointer shrink-0"
            >
              OK
            </button>
          </div>

          <label className="flex items-center justify-between gap-2 text-[10px] opacity-85 cursor-pointer select-none pt-0.5">
            <span className="truncate">
              {manualAxis === 'width'
                ? `Ballaca ku fadhiisi ${alignment.sampleWidthM} m`
                : `Dhererka ku fadhiisi ${alignment.sampleLengthM} m`}
            </span>
            <input
              type="checkbox"
              checked={syncAxisDimension}
              onChange={(e) => setSyncAxisDimension(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-[#22C55E] cursor-pointer shrink-0"
            />
          </label>
        </div>
      )}

      {/* Bottom Action Row: Align Both + 90° Swap + Canonical 48×90m + 15m Standard */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              onAlign({ mode: 'both', exactDimensions: true, swapAxes: false })
            }
            className="flex-1 min-h-[31px] rounded-lg bg-[#22C55E] hover:bg-[#16A34A] text-[#05130B] px-2.5 py-1 text-[10.5px] font-black inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Waafaji Labadaba</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onAlign({
                mode: 'both',
                exactDimensions: true,
                swapAxes: !alignment.axesSwapped,
              })
            }
            title="Wareeji 90° (Dherer ↔ Ballac)"
            className={`min-h-[31px] rounded-lg border px-2 py-1 text-[10.5px] font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0 ${
              isPaperMode
                ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                : 'bg-[#0F1B2D] border-[#243449] text-[#E2E8F0] hover:border-amber-400'
            }`}
          >
            <ArrowLeftRight className="w-3 h-3 shrink-0" />
            <span>90°</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            onAlign({ mode: 'standard_90x48_15m', swapAxes: alignment.axesSwapped })
          }
          className={`w-full min-h-[30px] rounded-lg border px-2.5 py-1 text-[10px] font-extrabold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer ${
            isPaperMode
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
              : 'bg-[#0F1B2D] border-[#22C55E]/45 text-[#22C55E] hover:bg-[#16263D]'
          }`}
        >
          <span>Halbeegga: Ballac 48m × Dherer 90m · Waddo 15m</span>
        </button>
      </div>
    </div>
  );
};
