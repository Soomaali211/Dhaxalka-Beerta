import React from 'react';
import {
  Home,
  Calculator,
  TableProperties,
  X,
  DatabaseBackup,
  BookOpen,
  Sparkles,
  FolderOpen,
  Wrench,
  LayoutDashboard,
  Map,
  Info,
  Download,
} from 'lucide-react';
import { Currency, SavedInheritanceCase } from '../types/inheritance';
import { CASE_STATUS_METADATA } from '../utils/caseManagementEngine';
import { PWAInstallButton } from './PWAInstallButton';
import { PrimaryDestination } from './MobileTopAppBar';
import { BrandCubeLogo } from './BrandCubeLogo';

interface NavigationDrawerProps {
  isOpen: boolean;
  activeDestination: PrimaryDestination;
  dashboardSubMode?: 'interactive_map' | 'cad_designer' | 'overview';
  activeCase: SavedInheritanceCase | null;
  savedCasesCount: number;
  currentPlotsCount: number;
  currentHalfPlotsCount: number;
  currentBoundaryAreaSqM?: number;
  currentAllPlotsAreaSqM?: number;
  currentHasMap: boolean;
  currency: Currency;
  onClose: () => void;
  onSelectDestination: (destination: PrimaryDestination) => void;
  onSelectDashboardSubMode?: (mode: 'interactive_map' | 'cad_designer' | 'overview') => void;
  onChangeCurrency: (currency: Currency) => void;
  onOpenQuickCasesModal: () => void;
  onOpenPresetsModal: () => void;
  onOpenQuranicModal: () => void;
  onOpenBackupRestoreModal: () => void;
  onOpenExportModal: () => void;
  onOpenWelcomeSplash?: () => void;
}

const PRIMARY_DESTINATIONS: {
  id: PrimaryDestination;
  label: string;
  icon: typeof Home;
}[] = [
  {
    id: 'dashboard',
    label: 'Khariidad',
    icon: Home,
  },
  {
    id: 'calculate',
    label: 'Xisaabi Dhaxalka',
    icon: Calculator,
  },
  {
    id: 'list_data',
    label: 'Xogta & Kiisaska',
    icon: TableProperties,
  },
  {
    id: 'export',
    label: 'Soo saar & PDF',
    icon: Download,
  },
];

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  activeDestination,
  dashboardSubMode = 'interactive_map',
  activeCase,
  savedCasesCount,
  currentPlotsCount,
  currentHalfPlotsCount,
  currentBoundaryAreaSqM,
  currentAllPlotsAreaSqM,
  currentHasMap,
  currency,
  onClose,
  onSelectDestination,
  onSelectDashboardSubMode,
  onChangeCurrency,
  onOpenQuickCasesModal,
  onOpenPresetsModal,
  onOpenQuranicModal,
  onOpenBackupRestoreModal,
  onOpenWelcomeSplash,
}) => {
  const handleNavigate = (dest: PrimaryDestination) => {
    onSelectDestination(dest);
    onClose();
  };

  const renderDrawerContent = (isMobileDrawer: boolean) => (
    <div className="flex flex-col h-full bg-[#0a1220] text-[#e8eef7]">
      {/* Brand Header */}
      <div className="px-5 py-4 border-b border-[#223250] flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            onOpenWelcomeSplash?.();
            onClose();
          }}
          className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
        >
          <BrandCubeLogo size="md" />
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-[#e8eef7] tracking-tight truncate">
              Beerta &amp; Dhaxalka
            </div>
            <div className="text-xs text-[#a9b8d0] truncate">Maaraynta Beerta &amp; GIS</div>
          </div>
        </button>

        {isMobileDrawer && (
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] -mr-2 rounded-xl flex items-center justify-center text-[#a9b8d0] hover:text-[#e8eef7] hover:bg-[#111b2e] cursor-pointer"
            aria-label="Xir liiska"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Primary 4 Destinations */}
      <nav className="p-4 space-y-1.5 flex-1 overflow-y-auto" aria-label="Qaybaha Waaweyn">
        {PRIMARY_DESTINATIONS.map((item) => {
          const Icon = item.icon;
          const isSelected = activeDestination === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              className={`w-full min-h-[48px] flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl text-left transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[#22c55e]/18 border border-[#22c55e]/40 text-[#22c55e]'
                  : 'text-[#e8eef7] hover:bg-[#111b2e] border border-transparent'
              }`}
            >
              <span className="flex items-center gap-3.5 min-w-0">
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    isSelected ? 'text-[#22c55e]' : 'text-[#a9b8d0]'
                  }`}
                />
                <span className="text-sm font-bold truncate">{item.label}</span>
              </span>

              {item.id === 'list_data' && (
                <span className="font-mono-numbers tabular-nums text-xs font-bold text-[#a9b8d0]">
                  {savedCasesCount}
                </span>
              )}
            </button>
          );
        })}

        {/* Dashboard Sub-Views Switcher */}
        {onSelectDashboardSubMode && (
          <div className="pt-2 pl-3 space-y-1">
            <button
              type="button"
              onClick={() => {
                onSelectDestination('dashboard');
                onSelectDashboardSubMode('interactive_map');
                onClose();
              }}
              className={`w-full min-h-[42px] flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                activeDestination === 'dashboard' && dashboardSubMode === 'interactive_map'
                  ? 'text-[#22c55e] bg-[#111b2e]'
                  : 'text-[#a9b8d0] hover:text-[#e8eef7] hover:bg-[#111b2e]/60'
              }`}
            >
              <Map className="w-4 h-4 shrink-0" />
              <span>Khariidadda &amp; Dayax-gacmeedka</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectDestination('dashboard');
                onSelectDashboardSubMode('cad_designer');
                onClose();
              }}
              className={`w-full min-h-[42px] flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                activeDestination === 'dashboard' && dashboardSubMode === 'cad_designer'
                  ? 'text-[#22c55e] bg-[#111b2e]'
                  : 'text-[#a9b8d0] hover:text-[#e8eef7] hover:bg-[#111b2e]/60'
              }`}
            >
              <Wrench className="w-4 h-4 shrink-0" />
              <span>Naqshadeeyaha &amp; Half-Plots</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectDestination('dashboard');
                onSelectDashboardSubMode('overview');
                onClose();
              }}
              className={`w-full min-h-[42px] flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                activeDestination === 'dashboard' && dashboardSubMode === 'overview'
                  ? 'text-[#22c55e] bg-[#111b2e]'
                  : 'text-[#a9b8d0] hover:text-[#e8eef7] hover:bg-[#111b2e]/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span>Dulmarka Hantida &amp; Kiisaska</span>
            </button>
          </div>
        )}

        {/* Fadhi & Active Case Status Callout with Unified Metrics (E10 & E11) */}
        {activeCase && (
          <div className="mt-4 rounded-2xl bg-[#111b2e] border border-[#223250] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono-numbers text-[#a9b8d0]">
              <span className="font-bold text-[#22c55e] truncate">
                {activeCase.referenceNumber}
              </span>
              <span>{CASE_STATUS_METADATA[activeCase.status].labelSomali}</span>
            </div>
            <div className="text-xs font-bold text-[#e8eef7] line-clamp-2">{activeCase.caseName}</div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-[#a9b8d0] pt-1">
              <span className="font-mono-numbers tabular-nums">
                {currentHasMap
                  ? `${currentPlotsCount} Buuxa · ${currentHalfPlotsCount} Half`
                  : 'Bilaa khariidad'}
              </span>
              <button
                type="button"
                onClick={() => {
                  onOpenQuickCasesModal();
                  onClose();
                }}
                className="font-bold text-[#22c55e] hover:underline cursor-pointer"
              >
                Beddel
              </button>
            </div>
            {currentHasMap &&
              ((currentAllPlotsAreaSqM && currentAllPlotsAreaSqM > 0) ||
                (currentBoundaryAreaSqM && currentBoundaryAreaSqM > 0)) && (
                <div className="pt-1.5 border-t border-[#223250]/80 grid grid-cols-2 gap-1.5 text-[10px] font-mono-numbers tabular-nums text-[#a9b8d0]">
                  <div>
                    Plots: <span className="text-[#e8eef7] font-bold">{(currentAllPlotsAreaSqM || 0).toLocaleString()} m²</span>
                  </div>
                  <div>
                    Xuduud: <span className="text-[#e8eef7] font-bold">{(currentBoundaryAreaSqM || 0).toLocaleString()} m²</span>
                  </div>
                </div>
              )}
          </div>
        )}

        {/* Info Callout Box */}
        <div className="mt-3 rounded-2xl bg-[#111b2e]/80 border border-[#223250] p-3.5 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-[#22c55e] shrink-0 mt-0.5" />
          <p className="text-xs text-[#a9b8d0] leading-relaxed">
            Nashqadaynta beerta (GeoJSON/KML) iyo xisaabinta Faraa&apos;idka waa diyaar — Khad Leh (Dayax-gacmeed/OSM) iyo Bilaa Khad.
          </p>
        </div>

        {/* Fadhi & Kaydka Section */}
        <div className="pt-3 border-t border-[#223250]/70 space-y-1">
          <button
            type="button"
            onClick={() => {
              onOpenBackupRestoreModal();
              onClose();
            }}
            className="w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#e8eef7] hover:bg-[#111b2e] transition-colors cursor-pointer"
          >
            <DatabaseBackup className="w-4 h-4 text-[#22c55e] shrink-0" />
            <span className="truncate">Google Drive &amp; Kaydka Guud</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenQuickCasesModal();
              onClose();
            }}
            className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#F8FAFC] hover:bg-[#0F1B2D] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-3 min-w-0">
              <FolderOpen className="w-4 h-4 text-[#94A3B8] shrink-0" />
              <span className="truncate">Fur Kiis Kaydsan</span>
            </span>
            <span className="font-mono-numbers text-xs text-[#94A3B8]">{savedCasesCount}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenPresetsModal();
              onClose();
            }}
            className="w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#F8FAFC] hover:bg-[#0F1B2D] transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">Tusaalooyin Diyaarsan</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenQuranicModal();
              onClose();
            }}
            className="w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#F8FAFC] hover:bg-[#0F1B2D] transition-colors cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-[#22C55E] shrink-0" />
            <span className="truncate">Aayadaha Faraa&apos;idka</span>
          </button>

          <div className="md:hidden px-3.5 pt-2 flex items-center justify-between gap-2">
            <label htmlFor="drawer-currency-select" className="text-xs text-[#94A3B8]">
              Lacagta
            </label>
            <select
              id="drawer-currency-select"
              value={currency}
              onChange={(e) => onChangeCurrency(e.target.value as Currency)}
              className="min-h-[38px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-2.5 py-1 text-xs font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#22C55E]"
            >
              <option value="USD">USD ($)</option>
              <option value="SOS">Sh.So</option>
              <option value="SLSH">Sl.Sh</option>
              <option value="EUR">EUR (€)</option>
              <option value="SAR">SAR</option>
              <option value="AED">AED</option>
            </select>
          </div>
        </div>
      </nav>

      {/* Bottom Install & Sharia Reference */}
      <div className="p-4 border-t border-[#243449] space-y-2.5 bg-[#060D18]/60 pb-safe">
        <PWAInstallButton variant="sidebar" />
        <p className="text-[11px] text-center text-[#94A3B8]">
          Suuradda An-Nisaa (11, 12, 176) · Khad Leh &amp; Bilaa Khad
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar (lg+) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-68 lg:shrink-0 border-r border-[#243449] sticky top-0 h-screen no-print">
        {renderDrawerContent(false)}
      </aside>

      {/* Mobile Slide-Over Drawer (< lg) */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex no-print"
          role="dialog"
          aria-modal="true"
          aria-label="Liiska Hagidda"
        >
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={onClose}
          />
          <div className="relative z-10 w-[84vw] max-w-[320px] h-full border-r border-[#243449] shadow-2xl">
            {renderDrawerContent(true)}
          </div>
        </div>
      )}
    </>
  );
};
