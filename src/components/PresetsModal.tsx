import { useState } from 'react';
import { PRESET_SCENARIOS, PresetScenario } from '../utils/presets';
import { FolderDown, X, ArrowRight, AlertTriangle } from 'lucide-react';

interface PresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: PresetScenario) => void;
}

function getCategoryLabelSomali(category: string): string {
  switch (category) {
    case 'standard':
      return 'Qoys Caadi ah';
    case 'historical':
      return 'Kiis Fiqhi Taariikhi ah';
    case 'special':
      return 'Xaalad Gaar ah';
    default:
      return 'Tusaale Diyaarsan';
  }
}

export function PresetsModal({
  isOpen,
  onClose,
  onSelectPreset,
}: PresetsModalProps) {
  const [pendingPreset, setPendingPreset] = useState<PresetScenario | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setPendingPreset(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Tusaalooyin iyo Xaalado Dhaxal oo Diyaarsan"
    >
      <div className="bg-[#0B1220] border border-[#243449] text-[#F8FAFC] rounded-t-3xl sm:rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        <div className="w-10 h-1.5 bg-[#243449] rounded-full mx-auto mt-3 sm:hidden shrink-0" />

        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#243449] flex items-center justify-between gap-3 bg-[#0F1B2D]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
              <FolderDown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#F8FAFC] truncate">
                Tusaalooyin &amp; Xaalado Dhaxal oo Diyaarsan
              </h2>
              <p className="text-xs text-[#94A3B8] truncate">
                Dooro kiis fiqhi ah ama xaalad qoys si aad u hubiso xisaabinta saamiyada
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] rounded-xl hover:bg-[#0B1220] transition-colors cursor-pointer"
            aria-label="Xir daaqadda"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Overwrite Confirmation Strip */}
        {pendingPreset && (
          <div className="px-5 sm:px-6 py-3.5 bg-amber-950/60 border-b border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5 text-amber-100">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">
                  Ma lagu raraa kiiska hadda furan: &ldquo;{pendingPreset.titleSomali}&rdquo;?
                </span>
                <span className="text-[11px] text-amber-200/85">
                  Xogta ehelka iyo hantida kiiska hadda furan ayaa lagu beddelayaa tusaalahan (Undo waad ku soo celin kartaa).
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPendingPreset(null)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0F1B2D] border border-[#243449] text-[#F8FAFC] font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Jooji
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectPreset(pendingPreset);
                  setPendingPreset(null);
                  onClose();
                }}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-[#030712] font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Xaqiiji &amp; Daji
              </button>
            </div>
          </div>
        )}

        {/* Preset List */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-3">
          {PRESET_SCENARIOS.map((preset) => {
            const totalValue = preset.assets.reduce((s, a) => s + a.estimatedValueUSD, 0);
            const isSelectedPending = pendingPreset?.id === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => setPendingPreset(preset)}
                className={`group p-4 rounded-2xl border cursor-pointer transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  isSelectedPending
                    ? 'bg-[#0F1B2D] border-[#10B981]'
                    : 'bg-[#0F1B2D]/80 hover:bg-[#0F1B2D] border-[#243449] hover:border-[#10B981]/50'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[#F8FAFC] group-hover:text-[#10B981] transition-colors">
                      {preset.titleSomali}
                    </span>
                    <span className="text-xs text-[#94A3B8] font-arabic">
                      {preset.titleArabic}
                    </span>
                  </div>
                  <p className="text-xs text-[#94A3B8] leading-relaxed max-w-xl">
                    {preset.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#94A3B8] pt-1 font-mono tabular-nums">
                    <span className="text-[#10B981] font-semibold">
                      {totalValue > 0 ? `$${totalValue.toLocaleString()}` : 'Plots Sidooda ah ($0)'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{getCategoryLabelSomali(preset.category)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingPreset(preset);
                  }}
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#10B981] bg-[#0B1220] border border-[#243449] group-hover:bg-[#10B981] group-hover:text-[#030712] group-hover:border-[#10B981] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Dooro Tusaalahan</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 pb-safe border-t border-[#243449] bg-[#0F1B2D] flex items-center justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[44px] px-5 py-2 text-xs font-bold text-[#F8FAFC] bg-[#0B1220] border border-[#243449] hover:border-[#94A3B8] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Xir
          </button>
        </div>
      </div>
    </div>
  );
}
