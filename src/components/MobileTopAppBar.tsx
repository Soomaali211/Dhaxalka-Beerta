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

export type PrimaryDestination = 'dashboard' | 'calculate' | 'list_data' | 'export';

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
    <header className="sticky top-0 z-30 bg-[#0a1220]/95 backdrop-blur-md border-b border-[#223250] pt-safe no-print">
      <div className="h-14 px-3 sm:px-5 lg:px-7 flex items-center justify-between gap-2">
        {/* Left Zone: Back or Hamburger Menu + Brand Cube + Title/Subtitle */}
        <div className="flex items-center gap-2 min-w-0">
          {showBackButton && onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="min-h-[48px] min-w-[48px] -ml-1 px-2.5 rounded-2xl bg-[#111b2e] border border-[#223250] flex items-center justify-center gap-1 text-[#e8eef7] hover:border-[#22c55e]/60 active:scale-95 transition-all cursor-pointer shrink-0"
              aria-label="Dib u noqo"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenDrawer}
              className="lg:hidden min-h-[48px] min-w-[48px] -ml-1 rounded-2xl bg-[#111b2e] border border-[#223250] flex flex-col items-center justify-center gap-0.5 text-[#e8eef7] hover:border-[#22c55e]/60 active:scale-95 transition-all cursor-pointer shrink-0"
              aria-label="Fur liiska Fadhiga iyo Kiisaska"
            >
              <Menu className="w-4 h-4" />
              <span className="text-[9px] font-bold leading-none text-[#a9b8d0]">Fadhi</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenWelcomeSplash}
            title="Beerta & Dhaxalka"
            className="hidden sm:inline-flex items-center justify-center rounded-xl focus:outline-none cursor-pointer shrink-0"
          >
            <BrandCubeLogo size="sm" />
          </button>

          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold text-[#e8eef7] tracking-tight truncate leading-tight">
              {sectionTitle}
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] text-[#a9b8d0] truncate leading-tight mt-0.5">
              <span className="truncate">{sectionSubtitle}</span>
              <span className="hidden sm:inline" aria-hidden="true">
                ·
              </span>
              <span className="hidden sm:inline font-mono-numbers tabular-nums font-semibold text-[#22c55e] shrink-0">
                {caseReference}
              </span>
            </div>
          </div>
        </div>

        {/* Right Zone: Labeled Undo/Redo + Currency (Desktop) + Drive + Desktop Export */}
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
            className={`min-h-[48px] min-w-[48px] px-2 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
              canUndo
                ? 'text-[#e8eef7] hover:bg-[#111b2e] hover:text-[#22c55e] cursor-pointer'
                : 'text-[#a9b8d0]/35 cursor-not-allowed'
            }`}
          >
            <Undo2 className="w-4 h-4" />
            <span className="text-[9px] font-bold leading-none">Dib</span>
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
            className={`hidden sm:flex min-h-[48px] min-w-[48px] px-2 rounded-xl flex-col items-center justify-center gap-0.5 transition-colors ${
              canRedo
                ? 'text-[#e8eef7] hover:bg-[#111b2e] hover:text-[#22c55e] cursor-pointer'
                : 'text-[#a9b8d0]/35 cursor-not-allowed'
            }`}
          >
            <Redo2 className="w-4 h-4" />
            <span className="text-[9px] font-bold leading-none">Hore</span>
          </button>

          <select
            value={currency}
            onChange={(e) => onChangeCurrency(e.target.value as Currency)}
            aria-label="Dooro Lacagta"
            className="hidden md:block min-h-[42px] bg-[#111b2e] border border-[#223250] rounded-xl px-2.5 py-1.5 text-xs font-semibold text-[#e8eef7] focus:outline-none focus:border-[#22c55e] cursor-pointer"
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
            className="min-h-[48px] min-w-[48px] px-2.5 sm:px-3 inline-flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 rounded-2xl bg-[#111b2e] hover:bg-[#16243d] border border-[#223250] hover:border-[#22c55e]/70 text-xs font-bold text-[#e8eef7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Cloud className="w-4 h-4 text-[#22c55e]" />
            <span className="text-[9px] sm:text-xs font-bold leading-none text-[#a9b8d0] sm:text-[#e8eef7]">
              Drive
            </span>
          </button>

          {/* Desktop Export Trigger (Mobile uses 4th Bottom Nav tab "Soo saar") */}
          <button
            type="button"
            onClick={onOpenExportModal}
            title="Soo saar (GeoJSON, PDF, CSV, Excel)"
            aria-label="Doorashooyinka Soo-saarista"
            className="hidden lg:flex min-h-[44px] px-3.5 rounded-2xl bg-[#111b2e] hover:bg-[#16243d] border border-[#223250] hover:border-[#22c55e]/70 items-center justify-center gap-1.5 text-xs font-bold text-[#e8eef7] transition-colors shrink-0 cursor-pointer"
          >
            <Share className="w-4 h-4 text-[#22c55e]" />
            <span>Soo saar</span>
          </button>
        </div>
      </div>
    </header>
  );
};
