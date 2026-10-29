import React, { useState } from 'react';
import { AssetQualityTier, Currency } from '../types/inheritance';
import {
  BlockDetailedMetadata,
  FairLandAllocationResult,
  LandSubdivisionState,
  PlotDetailedMetadata,
  SiteQualityRating,
  SubdivisionComputationResult,
  WadiStatus,
} from '../types/landSubdivision';
import {
  SITE_QUALITY_METADATA,
  TIER_METADATA,
  createAuditEntry,
  downloadSampleBlocksAndPlotsCSV,
  downloadSubdivisionCSV,
  formatPlotQtyCompact,
  getEffectiveBlockExclusion,
  getEffectivePlotExclusion,
  getEffectivePlotMetadata,
  getEffectivePlotTier,
  getEffectivePlotZone,
  summarizePlotIdsCompact,
} from '../utils/landSubdivisionEngine';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  Layers,
  ShieldAlert,
  Tag,
} from 'lucide-react';

interface LandMetadataEditorPanelProps {
  subdivisionState: LandSubdivisionState;
  subdivisionResult: SubdivisionComputationResult | null;
  fairAllocation: FairLandAllocationResult | null;
  currency: Currency;
  selectedPlotId: string | null;
  onSelectPlotId: (plotId: string) => void;
  onUpdateSubdivisionState: (updater: (prev: LandSubdivisionState) => LandSubdivisionState) => void;
  onNotify: (title: string, message: string) => void;
}

export const LandMetadataEditorPanel: React.FC<LandMetadataEditorPanelProps> = ({
  subdivisionState,
  subdivisionResult,
  fairAllocation,
  currency,
  selectedPlotId,
  onSelectPlotId,
  onUpdateSubdivisionState,
  onNotify,
}) => {
  const [editScope, setEditScope] = useState<'plot' | 'block'>('plot');
  const [activeBlockId, setActiveBlockId] = useState<string>(
    subdivisionResult?.blocks[0]?.id || ''
  );

  if (!subdivisionResult || subdivisionResult.plots.length === 0) {
    return (
      <div className="p-6 space-y-3 text-center">
        <p className="text-xs text-[#94A3B8] max-w-xl mx-auto leading-relaxed">
          Weli nashqad beer laguma xidhin kiiskan. Tag bogga <strong className="text-[#F8FAFC]">Khariidad</strong> oo taabo badhanka <strong className="text-[#10B981]">&ldquo;+&rdquo;</strong> ee hoose dhexda si aad nashqad u samayso ama u soo geliso.
        </p>
      </div>
    );
  }

  const effectivePlotId =
    selectedPlotId && subdivisionResult.plots.some((p) => p.id === selectedPlotId)
      ? selectedPlotId
      : subdivisionResult.plots[0].id;

  const activePlot =
    subdivisionResult.plots.find((p) => p.id === effectivePlotId) || subdivisionResult.plots[0];

  const effectiveBlockId =
    activeBlockId && subdivisionResult.blocks.some((b) => b.id === activeBlockId)
      ? activeBlockId
      : activePlot.block;

  const activeBlock =
    subdivisionResult.blocks.find((b) => b.id === effectiveBlockId) || subdivisionResult.blocks[0];

  const plotMeta: PlotDetailedMetadata = getEffectivePlotMetadata(
    activePlot,
    subdivisionState.plotMetadata
  );
  const plotTier = getEffectivePlotTier(
    activePlot,
    subdivisionState.blockTiers,
    subdivisionState.plotTierOverrides
  );
  const plotZone = getEffectivePlotZone(
    activePlot,
    subdivisionState.blockZones,
    subdivisionState.plotMetadata,
    subdivisionState.blockMetadata
  );

  const blockMeta: BlockDetailedMetadata = subdivisionState.blockMetadata[activeBlock.id] || {
    blockId: activeBlock.id,
  };
  const blockZone = blockMeta.zoneId || subdivisionState.blockZones[activeBlock.id] || 'Zone A';

  const gisCalcArea =
    activePlot.calculatedAreaSqM ??
    +(subdivisionResult.params.pw * subdivisionResult.params.pd).toFixed(2);
  const areaDiff =
    plotMeta.verifiedAreaSqM != null ? +(plotMeta.verifiedAreaSqM - gisCalcArea).toFixed(2) : null;

  const updatePlotMetaField = <K extends keyof PlotDetailedMetadata>(
    key: K,
    value: PlotDetailedMetadata[K]
  ) => {
    onUpdateSubdivisionState((prev) => {
      const existing = prev.plotMetadata[activePlot.id] || {
        plotId: activePlot.id,
        blockId: activePlot.block,
        wadiStatus: 'unverified' as WadiStatus,
        siteQuality: 'unverified' as SiteQualityRating,
      };
      const updated: PlotDetailedMetadata = {
        ...existing,
        [key]: value,
        updatedAt: new Date().toISOString(),
      };
      return {
        ...prev,
        approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
        plotMetadata: {
          ...prev.plotMetadata,
          [activePlot.id]: updated,
        },
        auditHistory: [
          createAuditEntry(
            'metadata_update',
            `Plot ${activePlot.id}: waxaa la cusboonaysiiyey "${String(key)}".`
          ),
          ...prev.auditHistory.slice(0, 49),
        ],
      };
    });
  };

  const updateBlockMetaField = <K extends keyof BlockDetailedMetadata>(
    key: K,
    value: BlockDetailedMetadata[K]
  ) => {
    onUpdateSubdivisionState((prev) => {
      const existing = prev.blockMetadata[activeBlock.id] || { blockId: activeBlock.id };
      const nextBlockZones =
        key === 'zoneId' && typeof value === 'string' && value.trim()
          ? { ...prev.blockZones, [activeBlock.id]: value.trim() }
          : prev.blockZones;
      return {
        ...prev,
        approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
        blockZones: nextBlockZones,
        blockMetadata: {
          ...prev.blockMetadata,
          [activeBlock.id]: {
            ...existing,
            [key]: value,
            updatedAt: new Date().toISOString(),
          },
        },
        auditHistory: [
          createAuditEntry(
            'metadata_update',
            `Block ${activeBlock.id}: waxaa la cusboonaysiiyey "${String(key)}".`
          ),
          ...prev.auditHistory.slice(0, 49),
        ],
      };
    });
  };

  const plotExclInfo = getEffectivePlotExclusion(
    activePlot,
    subdivisionState.plotMetadata,
    subdivisionState.blockMetadata
  );
  const blockExclInfo = getEffectiveBlockExclusion(
    activeBlock.id,
    subdivisionState.blockMetadata
  );

  const toggleBlockExclusionWithPlots = (isExcluded: boolean, specialName?: string) => {
    onUpdateSubdivisionState((prev) => {
      const existingBlk = prev.blockMetadata[activeBlock.id] || { blockId: activeBlock.id };
      const cleanName =
        specialName !== undefined
          ? specialName
          : existingBlk.excludedSpecialName || existingBlk.blockName || '';

      const nextPlotMeta = { ...prev.plotMetadata };
      activeBlock.plots.forEach((pl) => {
        if (nextPlotMeta[pl.id] && nextPlotMeta[pl.id].isExcludedFromDivision !== undefined) {
          const copy = { ...nextPlotMeta[pl.id] };
          delete copy.isExcludedFromDivision;
          nextPlotMeta[pl.id] = copy;
        }
      });

      return {
        ...prev,
        approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
        plotMetadata: nextPlotMeta,
        blockMetadata: {
          ...prev.blockMetadata,
          [activeBlock.id]: {
            ...existingBlk,
            isExcludedFromDivision: isExcluded,
            excludedSpecialName: cleanName,
            ...(cleanName && !existingBlk.blockName ? { blockName: cleanName } : {}),
            updatedAt: new Date().toISOString(),
          },
        },
        auditHistory: [
          createAuditEntry(
            'exclusion_update',
            isExcluded
              ? `Block ${activeBlock.id} waa laga reebay qaybinta dhaxalka${
                  cleanName ? ` ("${cleanName}")` : ''
                }.`
              : `Block ${activeBlock.id} dib ayaa loogu daray dhulka la qaybinayo.`
          ),
          ...prev.auditHistory.slice(0, 49),
        ],
      };
    });
  };

  return (
    <div className="p-4 sm:p-5 space-y-5 text-[#F8FAFC]">
      {/* Top Toolbar: Template & Register CSV Export (Zero secondary upload inputs) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-[#243449]">
        <div>
          <h3 className="text-sm font-extrabold text-[#F8FAFC]">
            Xogta Dhulka &amp; Qiimaynta Plots
          </h3>
          <p className="text-xs text-[#94A3B8] mt-0.5 leading-relaxed">
            Xogtan waxay ku xidhan tahay <span className="font-mono-numbers font-bold text-[#F8FAFC]">Plot ID</span> iyo{' '}
            <span className="font-mono-numbers font-bold text-[#F8FAFC]">Block ID</span> joogto ah — ma beddelayso qaabka plots-ka asalka ah.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => downloadSampleBlocksAndPlotsCSV(subdivisionResult, subdivisionState)}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-950/30 hover:bg-amber-950/50 text-amber-200 px-3 py-2 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
            title="Soo saar jadwalka CSV ee La_Qaybin_Karo (Haa/Maya) iyo Magaca_Gaarka_Ah"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Tusaale CSV</span>
          </button>

          <button
            type="button"
            onClick={() =>
              downloadSubdivisionCSV(
                subdivisionResult,
                subdivisionState.blockTiers,
                subdivisionState.plotTierOverrides,
                fairAllocation,
                subdivisionState
              )
            }
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-[#243449] bg-[#0F1B2D] hover:bg-[#16263D] text-[#F8FAFC] px-3 py-2 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
            <span>Soo saar Diiwaanka CSV</span>
          </button>
        </div>
      </div>

      {/* Scope Switcher: Plot Editor vs Block Editor */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-[#030712] border border-[#243449] p-1 gap-1">
          <button
            type="button"
            onClick={() => setEditScope('plot')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
              editScope === 'plot'
                ? 'bg-[#10B981] text-[#030712]'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            Xogta Plot Kasta ({subdivisionResult.plots.length})
          </button>
          <button
            type="button"
            onClick={() => setEditScope('block')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
              editScope === 'block'
                ? 'bg-[#10B981] text-[#030712]'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            Xogta Block Kasta ({subdivisionResult.blocks.length})
          </button>
        </div>

        {editScope === 'plot' ? (
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-[#94A3B8]">Dooro Plot ID:</label>
            <select
              value={activePlot.id}
              onChange={(e) => onSelectPlotId(e.target.value)}
              className="min-h-[42px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-3 py-1.5 text-xs font-mono-numbers tabular-nums font-bold text-[#10B981] focus:outline-none focus:border-[#10B981]"
            >
              {subdivisionResult.plots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} (Block {p.block})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-[#94A3B8]">Dooro Block ID:</label>
            <select
              value={activeBlock.id}
              onChange={(e) => setActiveBlockId(e.target.value)}
              className="min-h-[42px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-3 py-1.5 text-xs font-mono-numbers tabular-nums font-bold text-[#10B981] focus:outline-none focus:border-[#10B981]"
            >
              {subdivisionResult.blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} ({b.nf} plot)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* PLOT DETAILED METADATA FORM */}
      {editScope === 'plot' ? (
        <div className="space-y-4">
          {/* Plot Division Exclusion & Special Name Banner */}
          <div
            className={`rounded-2xl border p-4 text-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
              plotExclInfo.isExcluded
                ? 'bg-rose-950/35 border-rose-500/45'
                : 'bg-[#0F1B2D] border-[#243449]'
            }`}
          >
            <div className="space-y-1">
              <div className="font-extrabold text-[#F8FAFC] flex items-center gap-2">
                {plotExclInfo.isExcluded ? (
                  <Ban className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                )}
                <span>
                  Xaaladda Qaybinta ee Plot <span className="font-mono-numbers tabular-nums">{activePlot.id}</span>:{' '}
                  {plotExclInfo.isExcluded ? (
                    <span className="text-rose-300">
                      Laga Reebay Qaybinta Dhaxalka
                      {plotExclInfo.scope === 'block' ? ` (Block ${activePlot.block} oo dhan)` : ''}
                    </span>
                  ) : (
                    <span className="text-[#10B981]">Wuxuu ku jiraa Dhulka La Qaybinayo</span>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-[#94A3B8]">
                Plots-ka laga reebo qaybinta laguma darayo xisaabta saamiyada dhaxlayaasha, khariiradana si gaar ah ayaa loogu calaamadinayaa.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl bg-[#030712] border border-[#243449] p-1 gap-1">
                <button
                  type="button"
                  onClick={() => updatePlotMetaField('isExcludedFromDivision', false)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
                    !plotExclInfo.isExcluded
                      ? 'bg-[#10B981] text-[#030712]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  La Qaybinayo
                </button>
                <button
                  type="button"
                  onClick={() => updatePlotMetaField('isExcludedFromDivision', true)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
                    plotExclInfo.isExcluded
                      ? 'bg-rose-600 text-white'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  Ka Reeb Dhaxalka
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
                <input
                  type="text"
                  value={plotMeta.excludedSpecialName ?? plotExclInfo.specialName ?? ''}
                  onChange={(e) => updatePlotMetaField('excludedSpecialName', e.target.value)}
                  placeholder="Magaca gaarka ah (Masjidka, Ceelka, Waqf...)"
                  className="min-w-[230px] min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#10B981]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 text-xs">
            {/* Identity & Area Verification */}
            <div className="space-y-3">
              <div className="font-extrabold text-[#10B981] uppercase tracking-wider text-[11px]">
                1. Aqoonsiga &amp; Bedka Plot-ka
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-2.5">
                  <span className="text-[10px] text-[#94A3B8] block">Plot ID</span>
                  <strong className="font-mono-numbers tabular-nums text-[#F8FAFC]">{activePlot.id}</strong>
                </div>
                <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-2.5">
                  <span className="text-[10px] text-[#94A3B8] block">Block ID</span>
                  <strong className="font-mono-numbers tabular-nums text-[#F8FAFC]">{activePlot.block}</strong>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                  Magaca ama Lambarka Dhulka (Ikhtiyaari)
                </label>
                <input
                  type="text"
                  value={plotMeta.parcelNumberOrName || ''}
                  onChange={(e) => updatePlotMetaField('parcelNumberOrName', e.target.value)}
                  placeholder="Tusaale: Dhul-Beereed #14..."
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs font-medium text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#10B981]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                  Zone / Aagga Plot-kan
                </label>
                <select
                  value={plotMeta.zoneOverride || ''}
                  onChange={(e) => updatePlotMetaField('zoneOverride', e.target.value || undefined)}
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                >
                  <option value="">Raac Zone-ka Block-ga ({plotZone})</option>
                  <option value="Zone A">Zone A (Waqooyi-Galbeed)</option>
                  <option value="Zone B">Zone B (Waqooyi-Bari)</option>
                  <option value="Zone C">Zone C (Koonfur-Galbeed)</option>
                  <option value="Zone D">Zone D (Koonfur-Bari)</option>
                  <option value="Zone E">Zone E (Bartamaha)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-2.5">
                  <span className="text-[10px] text-[#94A3B8] block">Bedka GIS Xisaabiyey</span>
                  <strong className="font-mono-numbers tabular-nums text-[#F8FAFC]">{gisCalcArea} m²</strong>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#94A3B8] mb-0.5">
                    Bedka La Xaqiijiyey (m²)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={plotMeta.verifiedAreaSqM ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      updatePlotMetaField('verifiedAreaSqM', raw === '' ? null : Number(raw));
                    }}
                    placeholder="Lama xaqiijin"
                    className="w-full min-h-[40px] bg-[#0B1220] border border-[#243449] rounded-xl px-2.5 py-1 text-xs font-mono-numbers tabular-nums font-bold text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#10B981]"
                  />
                </div>
              </div>

              {areaDiff !== null && Math.abs(areaDiff) > 0.1 && (
                <div className="rounded-lg bg-amber-950/40 border border-amber-500/40 px-2.5 py-1.5 text-[11px] font-mono-numbers tabular-nums text-amber-200">
                  Farqiga Bedka: GIS ({gisCalcArea} m²) vs Xaqiijiyey ({plotMeta.verifiedAreaSqM} m²) ={' '}
                  <strong>{areaDiff > 0 ? `+${areaDiff}` : areaDiff} m²</strong>
                </div>
              )}
            </div>

            {/* Wadi Status, Site Quality & Tier */}
            <div className="space-y-3">
              <div className="font-extrabold text-[#10B981] uppercase tracking-wider text-[11px]">
                2. Xaaladda Dooxa &amp; Tayada Dhulka
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                  Xaaladda Dooxa (Wadi Status)
                </label>
                <select
                  value={plotMeta.wadiStatus}
                  onChange={(e) => updatePlotMetaField('wadiStatus', e.target.value as WadiStatus)}
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                >
                  <option value="unverified">Xaaladda dooxa lama xaqiijin</option>
                  <option value="none">Plot-ku kuma jiro doox</option>
                  <option value="nearby">Plot-ku wuxuu ku dhow yahay doox</option>
                  <option value="partial">Dooxu qayb ayuu ka maraa plot-ka</option>
                  <option value="cuts_through">Dooxu wuxuu dhex maraa plot-ka</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                  Tayada Goobta / Ciidda (Site Quality)
                </label>
                <select
                  value={plotMeta.siteQuality}
                  onChange={(e) =>
                    updatePlotMetaField('siteQuality', e.target.value as SiteQualityRating)
                  }
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                >
                  <option value="unverified">Lama xaqiijin</option>
                  <option value="very_good">{SITE_QUALITY_METADATA.very_good.labelSomali}</option>
                  <option value="good">{SITE_QUALITY_METADATA.good.labelSomali}</option>
                  <option value="medium">{SITE_QUALITY_METADATA.medium.labelSomali}</option>
                  <option value="poor">{SITE_QUALITY_METADATA.poor.labelSomali}</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                  Heerka Qaybinta (H1 / H2 / H3)
                </label>
                <select
                  value={plotTier}
                  onChange={(e) => {
                    const nt = e.target.value as AssetQualityTier;
                    onUpdateSubdivisionState((prev) => ({
                      ...prev,
                      plotTierOverrides: { ...prev.plotTierOverrides, [activePlot.id]: nt },
                    }));
                  }}
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                >
                  <option value="tier_1_prime">{TIER_METADATA.tier_1_prime.shortSomali}</option>
                  <option value="tier_2_standard">{TIER_METADATA.tier_2_standard.shortSomali}</option>
                  <option value="tier_3_basic">{TIER_METADATA.tier_3_basic.shortSomali}</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                  Xaaladda Oogada Dhulka
                </label>
                <input
                  type="text"
                  value={plotMeta.surfaceCondition || ''}
                  onChange={(e) => updatePlotMetaField('surfaceCondition', e.target.value)}
                  placeholder="Siman, janjeedha, dhagax..."
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#10B981]"
                />
              </div>
            </div>

            {/* Valuation, Land Use, Restrictions & Notes */}
            <div className="space-y-3">
              <div className="font-extrabold text-[#10B981] uppercase tracking-wider text-[11px]">
                3. Qiimaha Sugan, Isticmaalka &amp; Xaddidaadaha
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                  Qiimaha Dhulka La Xaqiijiyey ({currency})
                </label>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={plotMeta.verifiedPrice ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    updatePlotMetaField('verifiedPrice', raw === '' ? null : Number(raw));
                  }}
                  placeholder="Lama xaqiijin (bannaan)"
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs font-mono-numbers tabular-nums font-bold text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#10B981]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                  Qaabka Plot-ka &amp; Isticmaalka Dhulka
                </label>
                <input
                  type="text"
                  value={plotMeta.shapeAndLandUse || ''}
                  onChange={(e) => updatePlotMetaField('shapeAndLandUse', e.target.value)}
                  placeholder="Deegaan, Beer, Ganacsi, Gees-laami..."
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#10B981]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                  Xaddidaadaha Isticmaalka / Dukumentiyo
                </label>
                <input
                  type="text"
                  value={plotMeta.usageRestrictions || ''}
                  onChange={(e) => updatePlotMetaField('usageRestrictions', e.target.value)}
                  placeholder="Marin biyo, serfiska waddada, dukumenti #..."
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#10B981]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                  Faahfaahin Dheeraad ah
                </label>
                <input
                  type="text"
                  value={plotMeta.notes || ''}
                  onChange={(e) => updatePlotMetaField('notes', e.target.value)}
                  placeholder="Qoraal kooban oo plot-kan gaar u ah..."
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#10B981]"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* BLOCK METADATA FORM */
        <div className="space-y-4">
          {/* Whole-Block Exclusion & Special Name Banner */}
          <div
            className={`rounded-2xl border p-4 text-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
              blockExclInfo.isExcluded
                ? 'bg-rose-950/35 border-rose-500/45'
                : 'bg-[#0F1B2D] border-[#243449]'
            }`}
          >
            <div className="space-y-1">
              <div className="font-extrabold text-[#F8FAFC] flex items-center gap-2">
                {blockExclInfo.isExcluded ? (
                  <Ban className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                )}
                <span>
                  Xaaladda Qaybinta ee Block <span className="font-mono-numbers tabular-nums">{activeBlock.id}</span> ({activeBlock.plots.length} Plot):{' '}
                  {blockExclInfo.isExcluded ? (
                    <span className="text-rose-300">Block oo Dhan Waa Laga Reebay Dhaxalka</span>
                  ) : (
                    <span className="text-[#10B981]">Wuxuu ku jiraa Dhulka La Qaybinayo</span>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-[#94A3B8]">
                Haddii aad Block-gan ka reebto dhaxalka, dhammaan {activeBlock.plots.length}-ka plot ee ku dhex jira waxaa loo calaamadinayaa kuwo aan la qaybinayn oo leh magaca gaarka ah.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl bg-[#030712] border border-[#243449] p-1 gap-1">
                <button
                  type="button"
                  onClick={() => toggleBlockExclusionWithPlots(false)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
                    !blockExclInfo.isExcluded
                      ? 'bg-[#10B981] text-[#030712]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  Block La Qaybinayo
                </button>
                <button
                  type="button"
                  onClick={() => toggleBlockExclusionWithPlots(true)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
                    blockExclInfo.isExcluded
                      ? 'bg-rose-600 text-white'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  Ka Reeb Block-ga oo Dhan
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
                <input
                  type="text"
                  value={blockMeta.excludedSpecialName ?? blockMeta.blockName ?? ''}
                  onChange={(e) => {
                    updateBlockMetaField('excludedSpecialName', e.target.value);
                    if (!blockMeta.blockName) {
                      updateBlockMetaField('blockName', e.target.value);
                    }
                  }}
                  placeholder="Magaca gaarka ah ee Block-ga (Masjidka, Dugsiga...)"
                  className="min-w-[240px] min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#10B981]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 text-xs">
            <div className="space-y-3">
              <div className="font-extrabold text-[#10B981] uppercase tracking-wider text-[11px]">
                Xogta Guud ee Block {activeBlock.id}
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                  Magaca Block-ga
                </label>
                <input
                  type="text"
                  value={blockMeta.blockName || ''}
                  onChange={(e) => updateBlockMetaField('blockName', e.target.value)}
                  placeholder={`Tusaale: Block ${activeBlock.id} - Dhinaca Waqooyi`}
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#10B981]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                  Aagga / Zone-ka Block-gan
                </label>
                <select
                  value={blockZone}
                  onChange={(e) => updateBlockMetaField('zoneId', e.target.value)}
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                >
                  <option value="Zone A">Zone A (Waqooyi-Galbeed)</option>
                  <option value="Zone B">Zone B (Waqooyi-Bari)</option>
                  <option value="Zone C">Zone C (Koonfur-Galbeed)</option>
                  <option value="Zone D">Zone D (Koonfur-Bari)</option>
                  <option value="Zone E">Zone E (Bartamaha)</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="font-extrabold text-[#10B981] uppercase tracking-wider text-[11px]">
                Xaaladda Guud &amp; Faahfaahinta Block-ga
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                  Xaaladda Guud ee Block-ga
                </label>
                <input
                  type="text"
                  value={blockMeta.generalCondition || ''}
                  onChange={(e) => updateBlockMetaField('generalCondition', e.target.value)}
                  placeholder="Dhul siman oo dhisme ku habboon..."
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#10B981]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                  Faahfaahin Dheeraad ah
                </label>
                <input
                  type="text"
                  value={blockMeta.notes || ''}
                  onChange={(e) => updateBlockMetaField('notes', e.target.value)}
                  placeholder="Faahfaahin ku saabsan waddooyinka ama adeegyada block-ga..."
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#10B981]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit History Strip */}
      {subdivisionState.auditHistory.length > 0 && (
        <details className="rounded-xl border border-[#243449] bg-[#0F1B2D] px-4 py-2.5 text-xs">
          <summary className="font-bold text-[#F8FAFC] cursor-pointer inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#10B981]" />
            <span>
              Taariikhda Isbeddellada, Xogta &amp; Ansixinta ({subdivisionState.auditHistory.length})
            </span>
          </summary>
          <div className="mt-2.5 max-h-36 overflow-y-auto divide-y divide-[#243449]/60">
            {subdivisionState.auditHistory.slice(0, 15).map((entry) => (
              <div key={entry.id} className="py-1.5 flex items-center justify-between gap-3 text-[11px]">
                <span className="text-[#CBD5E1]">{entry.summarySomali}</span>
                <span className="font-mono-numbers tabular-nums text-[#94A3B8] shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

/* ==================== PER-HEIR SPATIAL REPORT & APPROVAL PANEL ==================== */

interface HeirSpatialReportPanelProps {
  subdivisionState: LandSubdivisionState;
  fairAllocation: FairLandAllocationResult | null;
  currency: Currency;
  highlightedHeirKey: string | null;
  onHighlightHeirOnMap: (heirKey: string) => void;
  onUpdateSubdivisionState: (updater: (prev: LandSubdivisionState) => LandSubdivisionState) => void;
  onNotify: (title: string, message: string) => void;
}

export const HeirSpatialReportPanel: React.FC<HeirSpatialReportPanelProps> = ({
  subdivisionState,
  fairAllocation,
  currency,
  highlightedHeirKey,
  onHighlightHeirOnMap,
  onUpdateSubdivisionState,
  onNotify,
}) => {
  const [approverInput, setApproverInput] = useState<string>(
    subdivisionState.approvedBy || 'Guddiga Qoyska / Garsooraha'
  );

  if (!fairAllocation || fairAllocation.heirAllocations.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-[#94A3B8]">
        Dooro dhaxlayaasha si warbixinta dhaxal-suge kasta, saamiga Zone kasta, iyo ansixinta loo soo saaro.
      </div>
    );
  }

  const isApproved = subdivisionState.approvalStatus === 'approved';

  const handleToggleApproval = () => {
    if (isApproved) {
      onUpdateSubdivisionState((prev) => ({
        ...prev,
        approvalStatus: 'under_review',
        auditHistory: [
          createAuditEntry(
            'approval_change',
            'Ansixintii qoondaynta dib ayaa loo furay si wax looga beddelo.'
          ),
          ...prev.auditHistory.slice(0, 49),
        ],
      }));
      onNotify('Dib-u-eegis Waa La Furay', 'Qoondaynta waxaa lagu celiyey heerka soo-jeedinta.');
    } else {
      const nowIso = new Date().toISOString();
      onUpdateSubdivisionState((prev) => ({
        ...prev,
        approvalStatus: 'approved',
        approvedBy: approverInput.trim() || 'Wakiilka Qoyska',
        approvedAt: nowIso,
        auditHistory: [
          createAuditEntry(
            'approval_change',
            `Qoondaynta dhulka si rasmi ah ayaa loo ansixiyey (${approverInput.trim() || 'Wakiilka Qoyska'}).`
          ),
          ...prev.auditHistory.slice(0, 49),
        ],
      }));
      onNotify(
        'Qoondaynta Waa La Ansixiyey',
        'Soo-jeedintii qaybinta Blocks & Plots waxaa loo beddelay qoondayn la ansixiyey.'
      );
    }
  };

  return (
    <div className="p-4 sm:p-5 space-y-5 text-[#F8FAFC]">
      {/* 1. PROPOSAL VS FINAL APPROVAL WORKFLOW BAR */}
      <div
        className={`rounded-2xl border p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
          isApproved
            ? 'bg-[#10B981]/10 border-[#10B981]/40'
            : 'bg-amber-950/35 border-amber-500/40'
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-extrabold text-[#F8FAFC]">
            {isApproved ? (
              <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
            ) : (
              <ClipboardCheck className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span>
              Xaaladda Qoondaynta:{' '}
              {isApproved
                ? `Qoondayn Rasmi ah oo La Ansixiyey (${subdivisionState.approvedBy || 'La Ansixiyey'})`
                : 'Soo-jeedin Talo ah (Proposal — Weli Kama Dambays Ma Aha)'}
            </span>
          </div>
          <p className="text-[11px] text-[#94A3B8] leading-relaxed">
            Soo-jeedinta otomaatigga ahi ma aha xukun sharci oo kama dambays ah ilaa qoyska ama garsooruhu hubiyo xogta goobta oo uu ansixiyo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isApproved && (
            <input
              type="text"
              value={approverInput}
              onChange={(e) => setApproverInput(e.target.value)}
              placeholder="Magaca ansixiyaha..."
              className="min-h-[44px] bg-[#0B1220] border border-[#243449] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#10B981]"
            />
          )}
          <button
            type="button"
            onClick={handleToggleApproval}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer ${
              isApproved
                ? 'bg-[#0F1B2D] border border-[#243449] text-[#F8FAFC] hover:bg-[#16263D]'
                : 'bg-[#10B981] hover:bg-[#059669] text-[#030712]'
            }`}
          >
            {isApproved ? 'Dib u Fur Wax-ka-beddel' : 'Ansixi Qoondayntan'}
          </button>
        </div>
      </div>

      {/* 2. ZONE PROPORTIONALITY & NON-ADJACENT BLOCK MATRIX */}
      <div className="border border-[#243449] rounded-2xl overflow-hidden bg-[#0F1B2D]">
        <div className="bg-[#0B1220] px-4 py-3 border-b border-[#243449] flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-extrabold text-[#10B981] flex items-center gap-2">
            <Layers className="w-4 h-4 shrink-0" />
            <span>
              Hubinta Boqolleyda Zone Kasta ({fairAllocation.zones.map((z) => z.zoneId).join(', ')}) &amp; Block-yada Aan Is-xigin
            </span>
          </div>
          <span className="text-[11px] font-mono-numbers tabular-nums font-semibold text-[#94A3B8]">
            {fairAllocation.hasZeroAdjacentBlockViolations
              ? '✓ 0 Block oo is-xiga'
              : '⚠ Block is-xiga ayaa jira'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#243449] bg-[#0B1220]/70 text-[#94A3B8] font-bold">
                <th className="py-2.5 px-3">Dhaxal-sugaha</th>
                <th className="py-2.5 px-2.5 text-center">Xaqa Dhaxalka (%)</th>
                {fairAllocation.zones.map((z) => (
                  <th key={z.zoneId} className="py-2.5 px-3">
                    {z.zoneId} ({z.totalPlots} Plot)
                  </th>
                ))}
                <th className="py-2.5 px-3">Kala-fogaanta Blocks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#243449]/60">
              {fairAllocation.heirAllocations.map((h) => (
                <tr key={h.heirKey} className="hover:bg-[#16263D]/50">
                  <td className="py-2.5 px-3 font-bold text-[#F8FAFC]">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: h.colorHex }}
                      />
                      <span>{h.personName}</span>
                    </div>
                    <span className="text-[10px] text-[#94A3B8] pl-4 block">
                      {h.roleTitleSomali}
                    </span>
                  </td>
                  <td className="py-2.5 px-2.5 text-center font-mono-numbers tabular-nums font-extrabold text-[#10B981]">
                    {h.individualPercentage.toFixed(2)}%
                  </td>
                  {fairAllocation.zones.map((z) => {
                    const zb = h.byZone[z.zoneId];
                    if (!zb || zb.totalZonePlots === 0) {
                      return (
                        <td key={z.zoneId} className="py-2.5 px-3 text-[#64748B]">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={z.zoneId} className="py-2.5 px-3 font-mono-numbers tabular-nums">
                        <div className="font-bold text-[#F8FAFC]">
                          {zb.zonePercentageReceived.toFixed(2)}%{' '}
                          <span className="text-[11px] font-semibold text-[#10B981]">
                            ({formatPlotQtyCompact(zb.effectivePlotsInZone)} Plot)
                          </span>
                        </div>
                        <div className="text-[10px] text-[#94A3B8]">
                          Blocks: {zb.assignedBlockIdsInZone.join(', ') || '—'}
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-[11px]">
                    {h.adjacentBlockPairs.length === 0 ? (
                      <span className="text-[#10B981] font-bold">
                        ✓ Kala fog ({h.assignedBlockIds.join(', ') || '—'})
                      </span>
                    ) : (
                      <span className="text-amber-300 font-bold">
                        ⚠ Is-xiga: {h.adjacentBlockPairs.map(([a, b]) => `${a}&${b}`).join(', ')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. DATA COMPLETENESS WARNINGS */}
      {fairAllocation.dataCompletenessWarnings.length > 0 && (
        <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] px-4 py-3 text-xs text-[#CBD5E1] space-y-1">
          <div className="font-bold text-[#F8FAFC] flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#10B981]" />
            <span>Kala-saarista Xogta La Xaqiijiyey vs Xogta Aan Weli La Xaqiijin:</span>
          </div>
          {fairAllocation.dataCompletenessWarnings.map((w, idx) => (
            <div key={idx} className="text-[11px] text-[#94A3B8]">
              · {w}
            </div>
          ))}
        </div>
      )}

      {/* 4. DETAILED PER-HEIR REPORT CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {fairAllocation.heirAllocations.map((h) => {
          const wadiEncCount = +(
            h.wadiBreakdown.cuts_through + h.wadiBreakdown.partial
          ).toFixed(2);
          const isHighlighted = highlightedHeirKey === h.heirKey;

          return (
            <div
              key={h.heirKey}
              className={`rounded-2xl border p-4 space-y-3 text-xs ${
                isHighlighted
                  ? 'border-[#10B981] bg-[#10B981]/10'
                  : 'border-[#243449] bg-[#0F1B2D]'
              }`}
            >
              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[#243449]">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-xs shrink-0"
                      style={{ backgroundColor: h.colorHex }}
                    />
                    <span className="text-sm font-extrabold text-[#F8FAFC]">{h.personName}</span>
                  </div>
                  <div className="text-[11px] text-[#94A3B8] mt-0.5 pl-5">
                    {h.roleTitleSomali} · Saamiga Quraanka: <strong className="text-[#F8FAFC]">{h.quranicFractionGroup}</strong> (
                    <span className="font-mono-numbers tabular-nums font-bold text-[#10B981]">
                      {h.individualPercentage.toFixed(2)}%
                    </span>
                    )
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onHighlightHeirOnMap(h.heirKey)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0B1220] border border-[#243449] hover:border-[#10B981] text-[#F8FAFC] font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <Eye className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Khariidad</span>
                </button>
              </div>

              {/* Metrics Comparison: Allocated vs Sharia Entitlement */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono-numbers tabular-nums">
                <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-2.5">
                  <span className="text-[10px] font-sans text-[#94A3B8] block">
                    Plots (La Siiyey vs Xaq)
                  </span>
                  <strong className="text-[#F8FAFC]">
                    {formatPlotQtyCompact(h.effectiveTotalPlotsReceived)} /{' '}
                    {formatPlotQtyCompact(h.exactTotalPlotsQuota)}
                  </strong>
                  <span className="block text-[10px] text-[#94A3B8]">
                    {h.totalWholePlotsAssigned} gaar ah
                  </span>
                </div>

                <div className="bg-[#0B1220] border border-[#243449] rounded-xl p-2.5">
                  <span className="text-[10px] font-sans text-[#94A3B8] block">
                    Bedka (GIS vs Xaqiijiyey)
                  </span>
                  <strong className="text-[#F8FAFC]">{h.totalAreaSqM.toLocaleString()} m²</strong>
                  <span className="block text-[10px] text-[#94A3B8]">
                    {h.verifiedAreaTotalSqM != null
                      ? `Xaqiijiyey: ${h.verifiedAreaTotalSqM.toLocaleString()} m²`
                      : 'Bed sugan: Lama hayo'}
                  </span>
                </div>

                <div className="col-span-2 sm:col-span-1 bg-[#0B1220] border border-[#243449] rounded-xl p-2.5">
                  <span className="text-[10px] font-sans text-[#94A3B8] block">
                    Qiimaha ({currency})
                  </span>
                  {h.verifiedValueTotalUSD != null ? (
                    <>
                      <strong className="text-[#10B981]">
                        {h.verifiedValueTotalUSD.toLocaleString()} (Sugan)
                      </strong>
                      {h.exactVerifiedValueEntitlementUSD != null && (
                        <span className="block text-[10px] text-[#94A3B8]">
                          Xaq: {h.exactVerifiedValueEntitlementUSD.toLocaleString()}
                        </span>
                      )}
                    </>
                  ) : h.totalEstimatedValueUSD > 0 ? (
                    <>
                      <strong className="text-amber-300">
                        {h.totalEstimatedValueUSD.toLocaleString()} (Qiyaas)
                      </strong>
                      <span className="block text-[10px] text-[#94A3B8]">Qiime heerka ah</span>
                    </>
                  ) : (
                    <strong className="text-[#94A3B8] font-sans text-[11px]">
                      Lama qiimayn
                    </strong>
                  )}
                </div>
              </div>

              {/* Blocks, Zones & Plot IDs */}
              <div className="space-y-1 text-[11px]">
                <div>
                  <span className="text-[#94A3B8]">Blocks ({h.assignedBlockIds.length}): </span>
                  <strong className="font-mono-numbers tabular-nums text-[#10B981]">
                    {h.assignedBlockIds.join(', ') || '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-[#94A3B8]">Plot IDs Gaar ah: </span>
                  <span className="font-mono-numbers tabular-nums text-[#F8FAFC]">
                    {summarizePlotIdsCompact(h.allWholePlotIds, 6)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1 text-[#94A3B8]">
                  <span>
                    <strong className="text-[#F8FAFC]">Dooxa:</strong>{' '}
                    {wadiEncCount > 0 ? `${wadiEncCount} plot doox maro` : '0 doox dhex-mara'} ·{' '}
                    {h.wadiBreakdown.unverified > 0
                      ? `${formatPlotQtyCompact(h.wadiBreakdown.unverified)} lama xaqiijin`
                      : 'Waa la xaqiijiyey'}
                  </span>
                  <span>·</span>
                  <span>
                    <strong className="text-[#F8FAFC]">Ansixinta:</strong>{' '}
                    {isApproved ? 'La Ansixiyey' : 'Soo-jeedin'}
                  </span>
                </div>
              </div>

              {/* Per-Heir Warnings if any */}
              {h.heirWarnings.length > 0 && (
                <div className="rounded-xl bg-amber-950/35 border border-amber-500/40 px-3 py-2 text-[11px] text-amber-200 space-y-0.5">
                  {h.heirWarnings.map((hw, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>{hw}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
