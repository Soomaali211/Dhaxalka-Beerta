import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Cloud,
  Compass,
  FolderPlus,
  HardDrive,
  Lock,
  RotateCcw,
  Sliders,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Currency, SavedInheritanceCase } from '../types/inheritance';
import { LandAllocationMode, LandSubdivisionState } from '../types/landSubdivision';
import {
  DEFAULT_SUBDIVISION_PARAMS,
  LAND_ALLOCATION_MODE_METADATA,
} from '../utils/landSubdivisionEngine';

interface SystemSettingsPanelProps {
  currency: Currency;
  activeCase: SavedInheritanceCase | null;
  savedCasesCount: number;
  currentHasMap: boolean;
  subdivisionState: LandSubdivisionState;
  onChangeCurrency: (currency: Currency) => void;
  onChangeAllocationMode: (mode: LandAllocationMode) => void;
  onToggleIncludeHalfPlots: (include: boolean) => void;
  onToggleNonAdjacentBlocks: (enforce: boolean) => void;
  onRestoreCanonicalDimensions: () => void;
  onOpenBackupRestore: () => void;
  onOpenPresetsModal: () => void;
  onOpenQuranicModal: () => void;
  onStartNewBlankCase: () => void;
  onResetCurrentCaseInputs: () => void;
  onCompactAuditLogs: () => void;
  isApkMobileMode?: boolean;
  isNativeApk?: boolean;
  onToggleApkMobileModePref?: (nextPref: boolean | null) => void;
}

const CURRENCIES: { code: Currency; label: string }[] = [
  { code: 'USD', label: 'USD ($)' },
  { code: 'SOS', label: 'Sh.So (SOS)' },
  { code: 'SLSH', label: 'Sl.Sh (SLSH)' },
  { code: 'EUR', label: 'EUR (€)' },
  { code: 'SAR', label: 'SAR' },
  { code: 'AED', label: 'AED' },
];

export const SystemSettingsPanel: React.FC<SystemSettingsPanelProps> = ({
  currency,
  activeCase,
  savedCasesCount,
  currentHasMap,
  subdivisionState,
  onChangeCurrency,
  onChangeAllocationMode,
  onToggleIncludeHalfPlots,
  onToggleNonAdjacentBlocks,
  onRestoreCanonicalDimensions,
  onOpenBackupRestore,
  onOpenPresetsModal,
  onOpenQuranicModal,
  onStartNewBlankCase,
  onResetCurrentCaseInputs,
  onCompactAuditLogs,
  isApkMobileMode = false,
  isNativeApk = false,
  onToggleApkMobileModePref,
}) => {
  const [confirmClearStep, setConfirmClearStep] = useState<boolean>(false);

  const storageSummary = useMemo(() => {
    try {
      let totalBytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const val = localStorage.getItem(key) || '';
        totalBytes += (key.length + val.length) * 2;
      }
      return {
        kb: Math.round((totalBytes / 1024) * 10) / 10,
        auditEntries: subdivisionState.auditHistory?.length || 0,
      };
    } catch {
      return {
        kb: 0,
        auditEntries: subdivisionState.auditHistory?.length || 0,
      };
    }
  }, [subdivisionState.auditHistory, savedCasesCount]);

  const params = subdivisionState.params;
  const isCanonicalDims =
    Math.abs(params.L - DEFAULT_SUBDIVISION_PARAMS.L) < 0.05 &&
    Math.abs(params.W - DEFAULT_SUBDIVISION_PARAMS.W) < 0.05 &&
    Math.abs(params.rU - DEFAULT_SUBDIVISION_PARAMS.rU) < 0.05 &&
    Math.abs(params.rV - DEFAULT_SUBDIVISION_PARAMS.rV) < 0.05 &&
    Math.abs(params.pw - DEFAULT_SUBDIVISION_PARAMS.pw) < 0.05 &&
    Math.abs(params.pd - DEFAULT_SUBDIVISION_PARAMS.pd) < 0.05;

  return (
    <div className="space-y-6 text-[#e8eef7]">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#223250] pb-4">
        <div>
          <h2 className="text-base sm:text-lg font-extrabold text-[#e8eef7] tracking-tight">
            Dejinta Nidaamka &amp; Halbeegga
          </h2>
          <p className="text-xs text-[#a9b8d0] mt-0.5 tabular-nums">
            {activeCase ? `${activeCase.referenceNumber} · ${activeCase.caseName}` : 'Kiis Firfircoon'} ·{' '}
            {savedCasesCount} Kiis
          </p>
        </div>
      </div>

      {/* 0. Qaabka Shaashadda APK / Mobile Layout */}
      <section className="rounded-2xl bg-[#111b2e] border border-[#223250] p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#e8eef7]">
            <Smartphone className="w-4 h-4 text-[#22c55e] shrink-0" />
            <span>Qaabka Shaashadda (Mobile / APK Layout)</span>
          </div>
          {isNativeApk && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#22c55e]">
              <Lock className="w-3.5 h-3.5" />
              <span>APK Mobile Mode (Joogto)</span>
            </span>
          )}
        </div>

        {isNativeApk ? (
          <p className="text-xs text-[#a9b8d0] leading-relaxed">
            App-ka Android APK waxa uu had iyo jeer ku shaqeeyaa{' '}
            <strong className="text-[#e8eef7]">Mobile Layout</strong> (hal tiir, hagidda hoose, iyo liiska dhinaca ka soo baxa) si cabbir kasta oo taleefan ama tablet ah u ahaado mid degdeg ah oo gacanta ku habboon.
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-[#a9b8d0] leading-relaxed">
              Ku xidh shaashadda qaabka <strong className="text-[#e8eef7]">APK Mobile Mode</strong> xitaa haddii aad ku eegayso shaashad weyn.
            </p>
            <div className="inline-flex rounded-xl bg-[#0a1220] border border-[#223250] p-1 gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onToggleApkMobileModePref?.(null)}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  !isApkMobileMode
                    ? 'bg-[#22c55e] text-[#060d18]'
                    : 'text-[#a9b8d0] hover:text-[#e8eef7]'
                }`}
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => onToggleApkMobileModePref?.(true)}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  isApkMobileMode
                    ? 'bg-[#22c55e] text-[#060d18]'
                    : 'text-[#a9b8d0] hover:text-[#e8eef7]'
                }`}
              >
                Mobile / APK
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 1. Lacagta & Qaabka Qaybinta Dhaxalka */}
      <section className="rounded-2xl bg-[#111b2e] border border-[#223250] p-4 sm:p-5 space-y-5">
        <div className="flex items-center gap-2 text-sm font-extrabold text-[#e8eef7]">
          <Sliders className="w-4 h-4 text-[#22c55e] shrink-0" />
          <span>01. Lacagta &amp; Qawaaniinta Qaybinta Dhulka</span>
        </div>

        {/* Currency Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-[#a9b8d0]">
            Lacagta Qiimaynta Hantida
          </label>
          <div className="flex flex-wrap gap-2">
            {CURRENCIES.map((c) => {
              const active = currency === c.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => onChangeCurrency(c.code)}
                  className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#22c55e] border-[#22c55e] text-[#060d18]'
                      : 'bg-[#0a1220] border-[#223250] text-[#e8eef7] hover:border-[#22c55e]/60'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Allocation Mode */}
        <div className="space-y-2 pt-3 border-t border-[#223250]/80">
          <label className="block text-xs font-bold text-[#a9b8d0]">
            Habka Qaybinta Plots-ka ee Dhaxlayaasha
          </label>
          <div
            className={`grid grid-cols-1 ${
              isApkMobileMode ? '' : 'md:grid-cols-3 '
            }gap-2.5`}
          >
            {(
              [
                'clean_equal_no_half_no_fraction',
                'whole_balanced',
                'exact_shared',
              ] as LandAllocationMode[]
            ).map((modeKey) => {
              const meta = LAND_ALLOCATION_MODE_METADATA[modeKey];
              const isSelected = subdivisionState.allocationMode === modeKey;
              return (
                <button
                  key={modeKey}
                  type="button"
                  onClick={() => onChangeAllocationMode(modeKey)}
                  className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer space-y-1 ${
                    isSelected
                      ? 'bg-[#22c55e]/12 border-[#22c55e] text-[#e8eef7]'
                      : 'bg-[#0a1220] border-[#223250] text-[#a9b8d0] hover:border-[#22c55e]/50 hover:text-[#e8eef7]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-[#e8eef7]">
                      {meta.shortSomali}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-[#22c55e] shrink-0" />}
                  </div>
                  <p className="text-[11px] leading-relaxed text-[#a9b8d0]">
                    {meta.descriptionSomali}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Half Plots & Non-Adjacent Block Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#223250]/80">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-[#0a1220] border border-[#223250] px-3.5 py-3">
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#e8eef7]">
                Ku Dar Half-Plots (216 m²)
              </div>
              <div className="text-[11px] text-[#a9b8d0] leading-snug mt-0.5">
                {subdivisionState.includeValidHalfPlotsInAllocation
                  ? 'Half-plots-ka saxda ahi way ku jiraan qaybinta'
                  : 'Half-plots-ka waa laga reebay qaybinta tooska ah'}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(subdivisionState.includeValidHalfPlotsInAllocation)}
              onClick={() =>
                onToggleIncludeHalfPlots(!subdivisionState.includeValidHalfPlotsInAllocation)
              }
              className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer shrink-0 ${
                subdivisionState.includeValidHalfPlotsInAllocation
                  ? 'bg-[#22c55e]'
                  : 'bg-[#223250]'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  subdivisionState.includeValidHalfPlotsInAllocation
                    ? 'translate-x-6'
                    : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-[#0a1220] border border-[#223250] px-3.5 py-3">
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#e8eef7]">
                Kala-fogaynta Block-yada (Non-Adjacent)
              </div>
              <div className="text-[11px] text-[#a9b8d0] leading-snug mt-0.5">
                {subdivisionState.enforceNonAdjacentBlocks
                  ? 'Hal dhaxle ma qaadanayo laba block oo isku dheggan'
                  : 'Block-yada isku dhow waa la wada qaadan karaa'}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={subdivisionState.enforceNonAdjacentBlocks}
              onClick={() =>
                onToggleNonAdjacentBlocks(!subdivisionState.enforceNonAdjacentBlocks)
              }
              className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer shrink-0 ${
                subdivisionState.enforceNonAdjacentBlocks ? 'bg-[#22c55e]' : 'bg-[#223250]'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  subdivisionState.enforceNonAdjacentBlocks ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* 2. Halbeegga Cabbirrada Rasmiga ah (90×48m · 15m Waddo · 18×24m Plot) */}
      <section className="rounded-2xl bg-[#111b2e] border border-[#223250] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#e8eef7]">
            <Compass className="w-4 h-4 text-[#22c55e] shrink-0" />
            <span>02. Halbeegga Cabbirrada Beerta &amp; Dooxa</span>
          </div>

          {!isCanonicalDims && currentHasMap && (
            <button
              type="button"
              onClick={onRestoreCanonicalDimensions}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-[#060d18] text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Ku celi 90×48m · Waddo 15m</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
          <div className="rounded-xl bg-[#0a1220] border border-[#223250] p-3">
            <span className="text-[#a9b8d0] block">Block (Dherer × Ballac)</span>
            <strong className="text-sm font-mono font-bold text-[#e8eef7] mt-1 block">
              {params.L}m × {params.W}m
            </strong>
          </div>
          <div className="rounded-xl bg-[#0a1220] border border-[#223250] p-3">
            <span className="text-[#a9b8d0] block">Plot (Ballac × Dherer)</span>
            <strong className="text-sm font-mono font-bold text-[#e8eef7] mt-1 block">
              {params.pw}m × {params.pd}m
            </strong>
          </div>
          <div className="rounded-xl bg-[#0a1220] border border-[#223250] p-3">
            <span className="text-[#a9b8d0] block">Waddooyinka (U / V)</span>
            <strong className="text-sm font-mono font-bold text-[#e8eef7] mt-1 block">
              {params.rU}m / {params.rV}m
            </strong>
          </div>
          <div className="rounded-xl bg-[#0a1220] border border-[#223250] p-3">
            <span className="text-[#a9b8d0] block">Xadka Dooxa (Heer 3)</span>
            <strong className="text-sm font-mono font-bold text-[#22c55e] mt-1 block">
              ≤ 90m (Giraan Cas)
            </strong>
          </div>
        </div>
      </section>

      {/* 3. Kaydka Google Drive, Tusaalooyinka & Sharciga */}
      <section className="rounded-2xl bg-[#111b2e] border border-[#223250] p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-extrabold text-[#e8eef7]">
          <HardDrive className="w-4 h-4 text-[#22c55e] shrink-0" />
          <span>03. Kaydka, Tusaalooyinka &amp; Maamulka Xogta</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={onOpenBackupRestore}
            className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#0a1220] hover:bg-[#16243d] border border-[#223250] hover:border-[#22c55e]/60 flex items-center justify-center gap-2 text-xs font-bold text-[#e8eef7] whitespace-nowrap cursor-pointer"
          >
            <Cloud className="w-4 h-4 text-[#22c55e] shrink-0" />
            <span>Google Drive &amp; Backup</span>
          </button>

          <button
            type="button"
            onClick={onOpenPresetsModal}
            className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#0a1220] hover:bg-[#16243d] border border-[#223250] hover:border-[#22c55e]/60 flex items-center justify-center gap-2 text-xs font-bold text-[#e8eef7] whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Tusaalooyin Diyaarsan</span>
          </button>

          <button
            type="button"
            onClick={onOpenQuranicModal}
            className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#0a1220] hover:bg-[#16243d] border border-[#223250] hover:border-[#22c55e]/60 flex items-center justify-center gap-2 text-xs font-bold text-[#e8eef7] whitespace-nowrap cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-[#22c55e] shrink-0" />
            <span>Aayadaha Faraa&apos;idka</span>
          </button>
        </div>

        <div className="pt-3 border-t border-[#223250]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-[#a9b8d0] tabular-nums">
            Kaydka gudaha: <strong className="font-mono text-[#e8eef7]">{storageSummary.kb} KB</strong> ·
            Diiwaanka isbeddellada: <strong className="font-mono text-[#e8eef7]">{storageSummary.auditEntries}</strong>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {storageSummary.auditEntries > 12 && (
              <button
                type="button"
                onClick={onCompactAuditLogs}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#0a1220] border border-[#223250] hover:border-sky-400/60 text-xs font-bold text-sky-300 whitespace-nowrap cursor-pointer"
              >
                Koob Taariikhda Hore
              </button>
            )}

            <button
              type="button"
              onClick={onStartNewBlankCase}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#0a1220] border border-[#223250] hover:border-[#22c55e] text-xs font-bold text-[#e8eef7] inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5 text-[#22c55e]" />
              <span>Abuur Kiis Cusub</span>
            </button>

            {!confirmClearStep ? (
              <button
                type="button"
                onClick={() => setConfirmClearStep(true)}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-rose-950/40 border border-rose-500/40 hover:border-rose-400 text-xs font-bold text-rose-300 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Nadiifi Kiiska Hadda</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-rose-950/60 border border-rose-500/60 px-3 py-1.5">
                <span className="text-[11px] font-bold text-rose-200">Ma hubtaa?</span>
                <button
                  type="button"
                  onClick={() => {
                    onResetCurrentCaseInputs();
                    setConfirmClearStep(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-extrabold cursor-pointer"
                >
                  Haa, Nadiifi
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearStep(false)}
                  className="px-2 py-1 rounded-lg bg-[#0a1220] text-[#a9b8d0] text-xs font-bold cursor-pointer"
                >
                  Ka noqo
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
