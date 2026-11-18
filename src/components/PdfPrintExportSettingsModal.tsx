import React, { useState } from 'react';
import {
  Check,
  Compass,
  FileText,
  Grid,
  Layers,
  LayoutTemplate,
  Printer,
  SlidersHorizontal,
  X,
} from 'lucide-react';

export interface PdfPrintExportSettingsState {
  layerVisibility: 'boundary_only' | 'blocks_and_plots' | 'full_gis';
  paperSize: 'a4' | 'a3' | 'letter' | 'legal';
  orientation: 'portrait' | 'landscape';
  legendPosition: 'bottom' | 'side';
  legendLayout: 'vertical' | 'horizontal';
  showLegend: boolean;
  legendIncludedCategories: {
    heirs: boolean;
    tiers: boolean;
    excluded: boolean;
    roads: boolean;
    wadis: boolean;
  };
  coordinateSystem: 'utm' | 'wgs84';
  showGridLines: boolean;
  showBorderTicks: boolean;
  coordinateTicksCount: number;
  dataSourceText: string;
  watermarkText: string;
  includeQrCode: boolean;
  cartographyStyle: 'nashqad' | 'layout11' | 'heerarka' | 'inheritance';
}

interface PdfPrintExportSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSettings?: Partial<PdfPrintExportSettingsState>;
  onApplyPrintSettings: (settings: PdfPrintExportSettingsState) => void;
  onNotify: (title: string, message: string) => void;
}

export const DEFAULT_PDF_PRINT_SETTINGS: PdfPrintExportSettingsState = {
  layerVisibility: 'full_gis',
  paperSize: 'a4',
  orientation: 'landscape',
  legendPosition: 'side',
  legendLayout: 'vertical',
  showLegend: true,
  legendIncludedCategories: {
    heirs: true,
    tiers: true,
    excluded: true,
    roads: true,
    wadis: true,
  },
  coordinateSystem: 'utm',
  showGridLines: true,
  showBorderTicks: true,
  coordinateTicksCount: 5,
  dataSourceText: "GIS Survey & Fara'id Calculations",
  watermarkText: 'Nuqul Rasmiga ah / Official Copy',
  includeQrCode: true,
  cartographyStyle: 'inheritance',
};

export const PdfPrintExportSettingsModal: React.FC<PdfPrintExportSettingsModalProps> = ({
  isOpen,
  onClose,
  initialSettings,
  onApplyPrintSettings,
  onNotify,
}) => {
  if (!isOpen) return null;

  const [settings, setSettings] = useState<PdfPrintExportSettingsState>({
    ...DEFAULT_PDF_PRINT_SETTINGS,
    ...(initialSettings || {}),
  });

  const handleSaveAndPrint = () => {
    onApplyPrintSettings(settings);
    onNotify('Print / Export Settings', 'Hagaajintii daabacaadda iyo PDF-ka waa la keydiyey waana la bilaabayaa.');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[1300] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[620px] max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl bg-[#0B1220] border border-[#243449] shadow-2xl text-[#F8FAFC] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-[#243449] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
              <Printer className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold tracking-tight truncate">
                Dejinta PDF Export &amp; Print Settings
              </h2>
              <span className="text-[11px] text-[#94A3B8]">
                Maamul sida khariiradu u muuqan doonto, Legend-ka, Paper Size, iyo Grid Lines
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#16263D] text-[#94A3B8] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-xs">
          {/* 1. Map Layer Visibility */}
          <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-3 space-y-2">
            <div className="font-extrabold text-emerald-400 flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              <span>1. Muujinta Lakabyada Khariirada (Map Layers)</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, layerVisibility: 'boundary_only' }))}
                className={`min-h-[36px] rounded-lg border px-2 py-1.5 text-center font-bold transition-colors cursor-pointer ${
                  settings.layerVisibility === 'boundary_only'
                    ? 'bg-emerald-500 border-emerald-400 text-[#030712]'
                    : 'bg-[#07101E] border-[#243449] text-[#94A3B8] hover:text-white'
                }`}
              >
                Xuduudda oo Kaliya
              </button>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, layerVisibility: 'blocks_and_plots' }))}
                className={`min-h-[36px] rounded-lg border px-2 py-1.5 text-center font-bold transition-colors cursor-pointer ${
                  settings.layerVisibility === 'blocks_and_plots'
                    ? 'bg-emerald-500 border-emerald-400 text-[#030712]'
                    : 'bg-[#07101E] border-[#243449] text-[#94A3B8] hover:text-white'
                }`}
              >
                Block &amp; Plots
              </button>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, layerVisibility: 'full_gis' }))}
                className={`min-h-[36px] rounded-lg border px-2 py-1.5 text-center font-bold transition-colors cursor-pointer ${
                  settings.layerVisibility === 'full_gis'
                    ? 'bg-emerald-500 border-emerald-400 text-[#030712]'
                    : 'bg-[#07101E] border-[#243449] text-[#94A3B8] hover:text-white'
                }`}
              >
                GIS Dhammaystiran
              </button>
            </div>
          </div>

          {/* 2. Paper Size & Orientation */}
          <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-3 space-y-2">
            <div className="font-extrabold text-emerald-400 flex items-center gap-1.5">
              <LayoutTemplate className="w-4 h-4" />
              <span>2. Cabbirka Waraaqda (Paper Size &amp; Orientation)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10.5px] font-bold text-[#94A3B8] mb-1">Paper Size</label>
                <select
                  value={settings.paperSize}
                  onChange={(e) => setSettings((s) => ({ ...s, paperSize: e.target.value as any }))}
                  className="w-full rounded-lg bg-[#07101E] border border-[#243449] px-2.5 py-1.5 font-bold text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="a4">A4 (210 × 297 mm)</option>
                  <option value="a3">A3 (297 × 420 mm)</option>
                  <option value="letter">Letter (8.5 × 11 in)</option>
                  <option value="legal">Legal (8.5 × 14 in)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] font-bold text-[#94A3B8] mb-1">Orientation</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, orientation: 'landscape' }))}
                    className={`min-h-[34px] rounded-lg border font-bold transition-colors cursor-pointer ${
                      settings.orientation === 'landscape'
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-[#07101E] border-[#243449] text-[#94A3B8]'
                    }`}
                  >
                    Landscape
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, orientation: 'portrait' }))}
                    className={`min-h-[34px] rounded-lg border font-bold transition-colors cursor-pointer ${
                      settings.orientation === 'portrait'
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-[#07101E] border-[#243449] text-[#94A3B8]'
                    }`}
                  >
                    Portrait
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 3, 4, 5. Legend Management */}
          <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-extrabold text-emerald-400 flex items-center gap-1.5">
                <Compass className="w-4 h-4" />
                <span>3, 4, 5. Maamulka Legend-ka</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-[11px] font-bold text-[#94A3B8]">Muuji Legend</span>
                <input
                  type="checkbox"
                  checked={settings.showLegend}
                  onChange={(e) => setSettings((s) => ({ ...s, showLegend: e.target.checked }))}
                  className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                />
              </label>
            </div>

            {settings.showLegend && (
              <div className="space-y-3 pt-1 border-t border-[#243449]/70">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10.5px] font-bold text-[#94A3B8] mb-1">Meesha uu Yaallo</label>
                    <select
                      value={settings.legendPosition}
                      onChange={(e) => setSettings((s) => ({ ...s, legendPosition: e.target.value as any }))}
                      className="w-full rounded-lg bg-[#07101E] border border-[#243449] px-2.5 py-1.5 font-bold text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="bottom">Hoosta Khariirada (Bottom)</option>
                      <option value="side">Dhinaca Khariirada (Side)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10.5px] font-bold text-[#94A3B8] mb-1">Habka Tiirarka (Layout)</label>
                    <select
                      value={settings.legendLayout}
                      onChange={(e) => setSettings((s) => ({ ...s, legendLayout: e.target.value as any }))}
                      className="w-full rounded-lg bg-[#07101E] border border-[#243449] px-2.5 py-1.5 font-bold text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="vertical">Vertical (Hal tiir oo isku hoos raaca)</option>
                      <option value="horizontal">Horizontal (Saf toosan)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-[#94A3B8] mb-1.5">Qaybaha ku jira Legend-ka:</label>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.legendIncludedCategories.heirs}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            legendIncludedCategories: { ...s.legendIncludedCategories, heirs: e.target.checked },
                          }))
                        }
                        className="rounded accent-emerald-500 cursor-pointer"
                      />
                      <span>Dhaxlayaasha</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.legendIncludedCategories.tiers}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            legendIncludedCategories: { ...s.legendIncludedCategories, tiers: e.target.checked },
                          }))
                        }
                        className="rounded accent-emerald-500 cursor-pointer"
                      />
                      <span>Heerarka (Tiers)</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.legendIncludedCategories.excluded}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            legendIncludedCategories: { ...s.legendIncludedCategories, excluded: e.target.checked },
                          }))
                        }
                        className="rounded accent-emerald-500 cursor-pointer"
                      />
                      <span>Danguud / Reeban</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 6, 7, 8. Border Coordinates, Grid Lines, Ticks & Cartography */}
          <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-3 space-y-3">
            <div className="font-extrabold text-emerald-400 flex items-center gap-1.5">
              <Grid className="w-4 h-4" />
              <span>6, 7, 8. Coordinates, Grid Lines &amp; Border Ticks</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10.5px] font-bold text-[#94A3B8] mb-1">Nidaamka Coordinates</label>
                <select
                  value={settings.coordinateSystem}
                  onChange={(e) => setSettings((s) => ({ ...s, coordinateSystem: e.target.value as any }))}
                  className="w-full rounded-lg bg-[#07101E] border border-[#243449] px-2.5 py-1.5 font-bold text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="utm">UTM Meters (Easting / Northing)</option>
                  <option value="wgs84">WGS84 Degrees (Lat / Lng)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] font-bold text-[#94A3B8] mb-1">Tirada Calaamadaha Ticks</label>
                <select
                  value={settings.coordinateTicksCount}
                  onChange={(e) => setSettings((s) => ({ ...s, coordinateTicksCount: parseInt(e.target.value) || 5 }))}
                  className="w-full rounded-lg bg-[#07101E] border border-[#243449] px-2.5 py-1.5 font-bold text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="3">3 Calaamadood</option>
                  <option value="5">5 Calaamadood (Dhexdhexaad)</option>
                  <option value="8">8 Calaamadood (Cufan)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#243449]/70">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showGridLines}
                  onChange={(e) => setSettings((s) => ({ ...s, showGridLines: e.target.checked }))}
                  className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                />
                <span className="font-bold text-[#94A3B8]">Muuji Grid Lines</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showBorderTicks}
                  onChange={(e) => setSettings((s) => ({ ...s, showBorderTicks: e.target.checked }))}
                  className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                />
                <span className="font-bold text-[#94A3B8]">Muuji Border Ticks</span>
              </label>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#243449]/70">
              <div>
                <label className="block text-[10.5px] font-bold text-[#94A3B8] mb-1">Source / Xigashada Xogta</label>
                <input
                  type="text"
                  value={settings.dataSourceText}
                  onChange={(e) => setSettings((s) => ({ ...s, dataSourceText: e.target.value }))}
                  className="w-full rounded-lg bg-[#07101E] border border-[#243449] px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold text-[#94A3B8] mb-1">Watermark Text</label>
                <input
                  type="text"
                  value={settings.watermarkText}
                  onChange={(e) => setSettings((s) => ({ ...s, watermarkText: e.target.value }))}
                  className="w-full rounded-lg bg-[#07101E] border border-[#243449] px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 border-t border-[#243449] flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] px-4 rounded-xl bg-[#0F1B2D] hover:bg-[#16263D] border border-[#243449] text-xs font-bold cursor-pointer"
          >
            Jooji
          </button>
          <button
            type="button"
            onClick={handleSaveAndPrint}
            className="min-h-[36px] px-5 rounded-xl bg-[#22C55E] hover:bg-emerald-600 text-[#05130B] text-xs font-extrabold flex items-center gap-1.5 shadow-lg cursor-pointer"
          >
            <Printer className="w-4 h-4 stroke-[2.5]" />
            <span>Keydi oo Daabaco / PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
