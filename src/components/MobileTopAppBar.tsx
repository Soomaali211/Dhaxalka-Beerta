import React from 'react';
import {
  Menu,
  Undo2,
  Redo2,
  Share,
  Cloud,
  ArrowLeft,
} from 'lucide-react';
import { Currency } from '../types/inheritance';
import { BrandCubeLogo } from './BrandCubeLogo';

export type PrimaryDestination = 'dashboard' | 'calculate' | 'list_data';

interface MobileTopAppBarProps {
  activeDestination: PrimaryDestination;
  sectionTitle: string;
  sectionSubtitle: string;
  caseReference: string;
  caseName: string;
  caseStatusLabel: string;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  currency: Currency;
  showBackButton?: boolean;
  onBack?: () => void;
  onOpenDrawer: () => void;
  onOpenWelcomeSplash?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onChangeCurrency: (currency: Currency) => void;
  onOpenExportModal: () => void;
  onOpenBackupRestore: () => void;
}

export const MobileTopAppBar: React.FC<MobileTopAppBarProps> = ({
  sectionTitle,
  sectionSubtitle,
  caseReference,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  currency,
  showBackButton = false,
  onBack,
  onOpenDrawer,
  onOpenWelcomeSplash,
  onUndo,
  onRedo,
  onChangeCurrency,
  onOpenExportModal,
  onOpenBackupRestore,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#0B1220]/95 backdrop-blur-md border-b border-[#243449] pt-safe no-print">
      <div className="h-14 px-3 sm:px-5 lg:px-7 flex items-center justify-between gap-2.5">
        {/* Left Zone: Back or Hamburger Menu + Brand Cube + Title/Subtitle */}
        <div className="flex items-center gap-2.5 min-w-0">
          {showBackButton && onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="min-h-[44px] min-w-[44px] -ml-1 rounded-2xl bg-[#0F1B2D] border border-[#243449] flex items-center justify-center text-[#F8FAFC] hover:border-[#22C55E]/60 active:scale-95 transition-all cursor-pointer shrink-0"
              aria-label="Dib u noqo"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenDrawer}
              className="lg:hidden min-h-[44px] min-w-[44px] -ml-1 rounded-2xl bg-[#0F1B2D] border border-[#243449] flex items-center justify-center text-[#F8FAFC] hover:border-[#22C55E]/60 active:scale-95 transition-all cursor-pointer shrink-0"
              aria-label="Fur liiska hagidda"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenWelcomeSplash}
            title="Beerta & Dhaxalka"
            className="hidden xs:inline-flex sm:inline-flex items-center justify-center rounded-xl focus:outline-none cursor-pointer shrink-0"
          >
            <BrandCubeLogo size="sm" />
          </button>

          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold text-[#F8FAFC] tracking-tight truncate leading-tight">
              {sectionTitle}
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] text-[#94A3B8] truncate leading-tight mt-0.5">
              <span className="truncate">{sectionSubtitle}</span>
              <span className="hidden sm:inline" aria-hidden="true">
                ·
              </span>
              <span className="hidden sm:inline font-mono-numbers tabular-nums font-semibold text-[#22C55E] shrink-0">
                {caseReference}
              </span>
            </div>
          </div>
        </div>

        {/* Right Zone: Undo/Redo + Currency (Desktop) + Export Action Box (Screen 2 Match) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title={
              canUndo
                ? `Dib u celi: ${undoLabel || 'Tallaabadii hore'}`
                : 'Ma jiro wax dib loo celiyo kiiskan'
            }
            aria-label="Dib u celi"
            className={`min-h-[44px] min-w-[40px] rounded-xl flex items-center justify-center transition-colors ${
              canUndo
                ? 'text-[#F8FAFC] hover:bg-[#0F1B2D] hover:text-[#22C55E] cursor-pointer'
                : 'text-[#94A3B8]/30 cursor-not-allowed'
            }`}
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title={
              canRedo
                ? `Horay u soco: ${redoLabel || 'Tallaabada xigta'}`
                : 'Ma jiro wax horay loo celiyo kiiskan'
            }
            aria-label="Horay u soco"
            className={`hidden sm:flex min-h-[44px] min-w-[40px] rounded-xl items-center justify-center transition-colors ${
              canRedo
                ? 'text-[#F8FAFC] hover:bg-[#0F1B2D] hover:text-[#22C55E] cursor-pointer'
                : 'text-[#94A3B8]/30 cursor-not-allowed'
            }`}
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <select
            value={currency}
            onChange={(e) => onChangeCurrency(e.target.value as Currency)}
            aria-label="Dooro Lacagta"
            className="hidden md:block min-h-[40px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 py-1.5 text-xs font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#22C55E] cursor-pointer"
          >
            <option value="USD">USD ($)</option>
            <option value="SOS">Sh.So</option>
            <option value="SLSH">Sl.Sh</option>
            <option value="EUR">EUR (€)</option>
            <option value="SAR">SAR</option>
            <option value="AED">AED</option>
          </select>

          <button
            type="button"
            onClick={onOpenBackupRestore}
            title="Google Drive & Kaydka Xogta"
            aria-label="Google Drive & Kaydka Xogta"
            className="min-h-[44px] min-w-[44px] sm:px-3 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#0F1B2D] hover:bg-[#16263D] border border-[#243449] hover:border-[#22C55E]/70 text-xs font-bold text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Cloud className="w-4 h-4 text-[#22C55E]" />
            <span className="hidden md:inline">Drive</span>
          </button>

          {/* Rounded Square Export Trigger Button */}
          <button
            type="button"
            onClick={onOpenExportModal}
            title="Soo saar (GeoJSON, PDF, CSV, Excel)"
            aria-label="Doorashooyinka Soo-saarista"
            className="min-h-[44px] min-w-[44px] sm:px-3.5 rounded-2xl bg-[#0F1B2D] hover:bg-[#16263D] border border-[#243449] hover:border-[#22C55E]/70 flex items-center justify-center gap-1.5 text-xs font-bold text-[#F8FAFC] transition-colors shrink-0 cursor-pointer"
          >
            <Share className="w-4 h-4 text-[#22C55E]" />
            <span className="hidden sm:inline">Soo saar</span>
          </button>
        </div>
      </div>
    </header>
  );
};
