import { Currency } from '../types/inheritance';
import { 
  FileSpreadsheet, 
  FileDown, 
  Printer, 
  BookOpen, 
  FolderDown, 
  Settings2,
  PlusCircle,
  FolderClock,
  RotateCcw,
  MapPin,
  Layers
} from 'lucide-react';

interface HeaderProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  currency: Currency;
  onCurrencyChange: (c: Currency) => void;
  onExportExcel: () => void;
  onOpenPresets: () => void;
  onOpenCertificate: () => void;
  onOpenQuranicRules: () => void;
  onOpenHeirConfig: () => void;
  onOpenNewCase: () => void;
  onClearCase: () => void;
  onOpenSavedCases: () => void;
  savedCasesCount: number;
}

export function Header({
  currentTab,
  onTabChange,
  currency,
  onCurrencyChange,
  onExportExcel,
  onOpenPresets,
  onOpenCertificate,
  onOpenQuranicRules,
  onOpenHeirConfig,
  onOpenNewCase,
  onClearCase,
  onOpenSavedCases,
  savedCasesCount,
}: HeaderProps) {
  return (
    <header className="border-b border-neutral-800 bg-neutral-900/90 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Zone 1: Single text element wordmark with brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-white block">
              Xisaabiyaha Dhaxalka
            </span>
            <span className="text-xs text-neutral-400 block -mt-0.5">
              Nidaamka Excel ee Cilmiga Faraa'idka
            </span>
          </div>
        </div>

        {/* Zone 2: Clean navigation links */}
        <nav className="hidden lg:flex items-center gap-1 bg-neutral-950/60 p-1 rounded-lg border border-neutral-800">
          <button
            onClick={() => onTabChange('asset_distribution')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              currentTab === 'asset_distribution'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-emerald-400 hover:text-emerald-200 hover:bg-neutral-850'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Qaybinta Hantida (Dhul, Lacag, Xoolo)</span>
          </button>
          <button
            onClick={() => onTabChange('spreadsheet')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              currentTab === 'spreadsheet'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Jadwalka Excel
          </button>
          <button
            onClick={() => onTabChange('heirs')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              currentTab === 'heirs'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Dhaxaleeyda & Saamiyada
          </button>
          <button
            onClick={() => onTabChange('assets')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              currentTab === 'assets'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Hantida & Deymaha
          </button>
          <button
            onClick={() => onTabChange('plots')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              currentTab === 'plots'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>Qaybinta Dhulka (Plots)</span>
          </button>
          <button
            onClick={onOpenQuranicRules}
            className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200 transition-colors flex items-center gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400/80" />
            <span>Aayadaha & Xeerarka</span>
          </button>
          <button
            onClick={onOpenPresets}
            className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200 transition-colors flex items-center gap-1.5"
          >
            <FolderDown className="w-3.5 h-3.5 text-emerald-400/80" />
            <span>Tusaalooyin Diyaarsan</span>
          </button>
        </nav>

        {/* Zone 3: Currency selector & Primary Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Currency Switcher */}
          <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1">
            <span className="text-[11px] text-neutral-400 mr-1.5 font-medium">Lacagta:</span>
            <select
              value={currency}
              onChange={(e) => onCurrencyChange(e.target.value as Currency)}
              aria-label="Dooro lacagta"
              className="bg-transparent text-xs font-semibold text-emerald-400 focus:outline-none cursor-pointer"
            >
              <option value="USD" className="bg-neutral-900 text-white">USD ($)</option>
              <option value="SOS" className="bg-neutral-900 text-white">SOS (Shilin Soomaali)</option>
              <option value="SLSH" className="bg-neutral-900 text-white">SLSH (Somaliland)</option>
              <option value="SAR" className="bg-neutral-900 text-white">SAR (Riyal)</option>
              <option value="AED" className="bg-neutral-900 text-white">AED (Dirham)</option>
              <option value="EUR" className="bg-neutral-900 text-white">EUR (€)</option>
            </select>
          </div>

          {/* New Case Button */}
          <button
            onClick={onOpenNewCase}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-300 bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/40 rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer"
            title="Gal Kiis Cusub oo dhameystiran (Marxuum + Dhaxleey + Hanti)"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Kiis Cusub</span>
          </button>

          {/* Quick Clear Case Button */}
          <button
            onClick={onClearCase}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-400 hover:text-white bg-neutral-800/60 hover:bg-neutral-800 rounded-lg border border-neutral-700/60 transition-colors cursor-pointer"
            title="Nadiifi xogta shaashadda si aad u bilaawdo foom bannaan"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Nadiifi</span>
          </button>

          {/* Saved Cases History Button */}
          <button
            onClick={onOpenSavedCases}
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 transition-colors cursor-pointer relative"
            title="Eeg kiisaskii aad hore u keydisay"
          >
            <FolderClock className="w-3.5 h-3.5 text-neutral-400" />
            <span>Kiisaska</span>
            {savedCasesCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {savedCasesCount}
              </span>
            )}
          </button>

          {/* Quick Edit Config button */}
          <button
            onClick={onOpenHeirConfig}
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5 text-neutral-400" />
            <span>Habee Dhaxaleeyda</span>
          </button>

          {/* Official Certificate */}
          <button
            onClick={onOpenCertificate}
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 transition-colors"
            title="Daabac Shahaadada Dhaxalka"
          >
            <Printer className="w-3.5 h-3.5 text-neutral-400" />
            <span>Warqadda Shahaadada</span>
          </button>

          {/* Download 21-Sheet Master Excel */}
          <a
            href="/Faraid_Shafii_Inheritance_System.xlsx"
            download="Faraid_Shafii_Inheritance_System.xlsx"
            className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-200 bg-amber-950/70 hover:bg-amber-900 border border-amber-600/40 rounded-lg shadow-sm transition-colors whitespace-nowrap"
            title="Soo degso Nidaamka Guud ee 21-ka Sheet ee Mad-habka Shaafici (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
            <span>Master Excel</span>
          </a>

          {/* Primary Action: Dynamic Case Excel Export */}
          <button
            onClick={onExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors whitespace-nowrap cursor-pointer"
            title="Dhoofi Xogta Kiiskan oo Excel ah"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Dhoofi (.xlsx)</span>
          </button>
        </div>

      </div>

      {/* Mobile/Tablet Sub-Navigation */}
      <div className="lg:hidden border-t border-neutral-800 bg-neutral-950 px-4 py-2 overflow-x-auto flex items-center gap-1.5 scrollbar-none">
        <button
          onClick={() => onTabChange('asset_distribution')}
          className={`px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap flex items-center gap-1.5 ${
            currentTab === 'asset_distribution'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-emerald-400 hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Qaybinta Hantida</span>
        </button>
        <button
          onClick={() => onTabChange('spreadsheet')}
          className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
            currentTab === 'spreadsheet'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Jadwalka Excel
        </button>
        <button
          onClick={() => onTabChange('heirs')}
          className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
            currentTab === 'heirs'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Dhaxaleeyda
        </button>
        <button
          onClick={() => onTabChange('assets')}
          className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
            currentTab === 'assets'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Hantida
        </button>
        <button
          onClick={() => onTabChange('plots')}
          className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap flex items-center gap-1 ${
            currentTab === 'plots'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <MapPin className="w-3 h-3 text-emerald-400" />
          <span>Dhulka (Plots)</span>
        </button>
      </div>
    </header>
  );
}
