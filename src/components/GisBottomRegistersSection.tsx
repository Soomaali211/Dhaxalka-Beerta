import React from 'react';
import { AssetQualityTier, Currency } from '../types/inheritance';
import {
  FairLandAllocationResult,
  GeneratedPlot,
  HalfPlotValidationStatus,
  LandSubdivisionState,
  SubdivisionComputationResult,
} from '../types/landSubdivision';
import { HALF_PLOT_STATUS_METADATA } from '../utils/halfPlotGeometryEngine';
import {
  TIER_METADATA,
  downloadSampleBlocksAndPlotsCSV,
  formatPlotQtyCompact,
  getEffectiveBlockExclusion,
  getEffectivePlotExclusion,
  getEffectivePlotMetadata,
  getEffectivePlotTier,
  getEffectivePlotZone,
  summarizePlotIdsCompact,
} from '../utils/landSubdivisionEngine';
import {
  HeirSpatialReportPanel,
  LandMetadataEditorPanel,
} from './LandMetadataAndReportTabs';
import { Ban, Download, Eye, Search } from 'lucide-react';

export type BottomTableTab =
  | 'heirs_plots'
  | 'excluded_register'
  | 'half_plots_validation'
  | 'plot_metadata'
  | 'heir_reports'
  | 'blocks_tiers'
  | 'all_plots';

interface GisBottomRegistersSectionProps {
  bottomTab: BottomTableTab;
  onSelectBottomTab: (tab: BottomTableTab) => void;
  subdivisionState: LandSubdivisionState;
  subdivisionResult: SubdivisionComputationResult | null;
  fairAllocation: FairLandAllocationResult | null;
  currency: Currency;
  inspectedPlotId: string | null;
  onSelectPlotId: (plotId: string | null) => void;
  highlightedHeirKey: string | null;
  onHighlightHeirOnMap: (heirKey: string) => void;
  onSwitchToExcludedMapMode: () => void;
  onSwitchToHalfPlotsMapMode: () => void;
  onActivateExclusionBrush: () => void;
  onFocusPlotOnMap: (plot: GeneratedPlot) => void;
  onRenameIndividual: (shareId: string, personIndex: number, newName: string) => void;
  onSetPlotExclusionState: (
    plotId: string,
    blockId: string,
    isExcluded: boolean,
    specialName?: string
  ) => void;
  onSetBlockExclusionState: (
    blockId: string,
    isExcluded: boolean,
    specialName?: string
  ) => void;
  onUpdateSubdivisionState: (
    updater: (prev: LandSubdivisionState) => LandSubdivisionState
  ) => void;
  onNotify: (title: string, message: string) => void;
  plotSearchQuery: string;
  onChangePlotSearchQuery: (q: string) => void;
  plotDivisionFilter: 'all' | 'divisible' | 'excluded';
  onChangePlotDivisionFilter: (f: 'all' | 'divisible' | 'excluded') => void;
  plotZoneFilter: string;
  onChangePlotZoneFilter: (z: string) => void;
  plotTierFilter: AssetQualityTier | 'all';
  onChangePlotTierFilter: (t: AssetQualityTier | 'all') => void;
  halfPlotStatusFilter: HalfPlotValidationStatus | 'all_clipped' | 'all';
  onChangeHalfPlotStatusFilter: (
    s: HalfPlotValidationStatus | 'all_clipped' | 'all'
  ) => void;
  filteredPlots: GeneratedPlot[];
  filteredEvaluatedPlots: GeneratedPlot[];
}

export const GisBottomRegistersSection: React.FC<GisBottomRegistersSectionProps> = ({
  bottomTab,
  onSelectBottomTab,
  subdivisionState,
  subdivisionResult,
  fairAllocation,
  currency,
  inspectedPlotId,
  onSelectPlotId,
  highlightedHeirKey,
  onHighlightHeirOnMap,
  onSwitchToExcludedMapMode,
  onSwitchToHalfPlotsMapMode,
  onActivateExclusionBrush,
  onFocusPlotOnMap,
  onRenameIndividual,
  onSetPlotExclusionState,
  onSetBlockExclusionState,
  onUpdateSubdivisionState,
  onNotify,
  plotSearchQuery,
  onChangePlotSearchQuery,
  plotDivisionFilter,
  onChangePlotDivisionFilter,
  plotZoneFilter,
  onChangePlotZoneFilter,
  plotTierFilter,
  onChangePlotTierFilter,
  halfPlotStatusFilter,
  onChangeHalfPlotStatusFilter,
  filteredPlots,
  filteredEvaluatedPlots,
}) => {
  return (
    <section className="bg-[#0B1220] border border-[#243449] rounded-2xl overflow-hidden text-[#F8FAFC]">
      {/* Scrollable Tab Bar + Contextual Search/Filters */}
      <div className="px-4 py-3 border-b border-[#243449] bg-[#0F1B2D]/70 flex flex-col gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          <button
            type="button"
            onClick={() => onSelectBottomTab('heirs_plots')}
            className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              bottomTab === 'heirs_plots'
                ? 'bg-[#10B981] text-[#030712]'
                : 'bg-[#030712]/70 text-[#94A3B8] hover:text-[#F8FAFC] border border-[#243449]'
            }`}
          >
            Dhaxlayaasha: Zones &amp; Plots ({fairAllocation?.heirAllocations.length ?? 0})
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectBottomTab('excluded_register');
              onSwitchToExcludedMapMode();
            }}
            className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 transition-colors ${
              bottomTab === 'excluded_register'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-950/30 text-rose-300 hover:bg-rose-950/50 border border-rose-500/35'
            }`}
          >
            <Ban className="w-3.5 h-3.5 shrink-0" />
            <span>Laga Reebay ({fairAllocation?.excludedPlotsCount ?? 0})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectBottomTab('half_plots_validation');
              onSwitchToHalfPlotsMapMode();
            }}
            className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              bottomTab === 'half_plots_validation'
                ? 'bg-[#10B981] text-[#030712]'
                : 'bg-[#030712]/70 text-[#94A3B8] hover:text-[#F8FAFC] border border-[#243449]'
            }`}
          >
            Half Plots &amp; Hubinta (
            {subdivisionResult?.halfPlotSummary?.boundaryClippedPlotsCount ?? 0} go&apos;an ·{' '}
            {subdivisionResult?.halfPlotSummary?.validHalfPlotsCount ?? 0} sax ah)
          </button>

          <button
            type="button"
            onClick={() => onSelectBottomTab('plot_metadata')}
            className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              bottomTab === 'plot_metadata'
                ? 'bg-[#10B981] text-[#030712]'
                : 'bg-[#030712]/70 text-[#94A3B8] hover:text-[#F8FAFC] border border-[#243449]'
            }`}
          >
            Xogta Dhulka &amp; Qiimaynta
          </button>

          <button
            type="button"
            onClick={() => onSelectBottomTab('heir_reports')}
            className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              bottomTab === 'heir_reports'
                ? 'bg-[#10B981] text-[#030712]'
                : 'bg-[#030712]/70 text-[#94A3B8] hover:text-[#F8FAFC] border border-[#243449]'
            }`}
          >
            Warbixinta &amp; Ansixinta
          </button>

          <button
            type="button"
            onClick={() => onSelectBottomTab('blocks_tiers')}
            className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              bottomTab === 'blocks_tiers'
                ? 'bg-[#10B981] text-[#030712]'
                : 'bg-[#030712]/70 text-[#94A3B8] hover:text-[#F8FAFC] border border-[#243449]'
            }`}
          >
            Blocks &amp; Zones ({subdivisionResult?.blocks.length ?? 0})
          </button>

          <button
            type="button"
            onClick={() => onSelectBottomTab('all_plots')}
            className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              bottomTab === 'all_plots'
                ? 'bg-[#10B981] text-[#030712]'
                : 'bg-[#030712]/70 text-[#94A3B8] hover:text-[#F8FAFC] border border-[#243449]'
            }`}
          >
            Diiwaanka Plots ({subdivisionResult?.plots.length ?? 0})
          </button>
        </div>

        {(bottomTab === 'all_plots' || bottomTab === 'half_plots_validation') && (
          <div className="flex flex-wrap items-center gap-2">
            {bottomTab === 'all_plots' && (
              <>
                <select
                  value={plotDivisionFilter}
                  onChange={(e) =>
                    onChangePlotDivisionFilter(
                      e.target.value as 'all' | 'divisible' | 'excluded'
                    )
                  }
                  className="min-h-[40px] bg-[#0B1220] border border-[#243449] rounded-xl px-2.5 text-xs font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                >
                  <option value="all">Dhammaan (Qaybin + Reeban)</option>
                  <option value="divisible">Kuwa La Qaybinayo Keliya</option>
                  <option value="excluded">Kuwa Laga Reebay Keliya</option>
                </select>
                <select
                  value={plotZoneFilter}
                  onChange={(e) => onChangePlotZoneFilter(e.target.value)}
                  className="min-h-[40px] bg-[#0B1220] border border-[#243449] rounded-xl px-2.5 text-xs font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                >
                  <option value="all">Dhammaan Zones</option>
                  {fairAllocation?.zones.map((z) => (
                    <option key={z.zoneId} value={z.zoneId}>
                      {z.zoneId}
                    </option>
                  ))}
                </select>
                <select
                  value={plotTierFilter}
                  onChange={(e) =>
                    onChangePlotTierFilter(e.target.value as AssetQualityTier | 'all')
                  }
                  className="min-h-[40px] bg-[#0B1220] border border-[#243449] rounded-xl px-2.5 text-xs font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                >
                  <option value="all">Dhammaan Heerarka</option>
                  <option value="tier_1_prime">H1: Fiican</option>
                  <option value="tier_2_standard">H2: Dhexe</option>
                  <option value="tier_3_basic">H3: Hoose</option>
                </select>
              </>
            )}
            <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-3" />
              <input
                type="text"
                value={plotSearchQuery}
                onChange={(e) => onChangePlotSearchQuery(e.target.value)}
                placeholder="Raadi Plot, Block ama Magaca..."
                className="w-full min-h-[40px] bg-[#0B1220] border border-[#243449] rounded-xl pl-8 pr-3 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#10B981]"
              />
            </div>
          </div>
        )}
      </div>

      {/* TAB 1: EVERY INDIVIDUAL HEIR'S ASSIGNED ZONES, BLOCKS & PLOTS */}
      {bottomTab === 'heirs_plots' && (
        <div>
          {!fairAllocation || fairAllocation.heirAllocations.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#94A3B8]">
              Dooro dhaxlayaasha qaybta Xisaabi Dhaxalka si halkan loogu muujiyo qof kasta plots-ka, Zones-ka iyo blocks-ka uu helay.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#243449] bg-[#0F1B2D] text-[#94A3B8] font-bold">
                    <th className="py-3 px-3">Dhaxalaha (Qor Magaca)</th>
                    <th className="py-3 px-2.5 text-center">Saamiga (%)</th>
                    <th className="py-3 px-3">Qaybta Zone Kasta (Zone %)</th>
                    <th className="py-3 px-3">Blocks (Aan Is-xigin)</th>
                    <th className="py-3 px-3">Heerarka (H1 / H2 / H3)</th>
                    <th className="py-3 px-3 text-right">Wadarta Plots &amp; m²</th>
                    <th className="py-3 px-2.5 text-center">Khariidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#243449]/60">
                  {fairAllocation.heirAllocations.map((h) => (
                    <tr
                      key={h.heirKey}
                      className={`hover:bg-[#0F1B2D]/80 ${
                        highlightedHeirKey === h.heirKey ? 'bg-[#10B981]/10' : ''
                      }`}
                    >
                      <td className="py-3 px-3 min-w-[200px]">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-xs shrink-0"
                            style={{ backgroundColor: h.colorHex }}
                          />
                          <input
                            type="text"
                            value={h.personName}
                            onChange={(e) =>
                              onRenameIndividual(
                                h.heirGroupId,
                                h.personIndex,
                                e.target.value
                              )
                            }
                            className="w-full min-h-[38px] bg-[#0F1B2D] focus:bg-[#030712] border border-[#243449] focus:border-[#10B981] rounded-lg px-2.5 py-1 text-xs font-bold text-[#F8FAFC] focus:outline-none"
                          />
                        </div>
                        <div className="text-[11px] text-[#94A3B8] pl-5 mt-0.5">
                          {h.roleTitleSomali}
                        </div>
                      </td>

                      <td className="py-3 px-2.5 text-center font-mono-numbers tabular-nums">
                        <span className="font-bold text-[#10B981] block">
                          {h.individualPercentage.toFixed(2)}%
                        </span>
                        <span className="text-[10px] text-[#94A3B8]">
                          {h.quranicFractionGroup}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono-numbers tabular-nums text-[11px] space-y-0.5">
                        {fairAllocation.zones.map((z) => {
                          const zb = h.byZone[z.zoneId];
                          if (!zb || zb.totalZonePlots === 0) return null;
                          return (
                            <div key={z.zoneId} className="text-[#CBD5E1]">
                              <strong className="text-[#10B981]">{z.zoneId}:</strong>{' '}
                              {formatPlotQtyCompact(zb.effectivePlotsInZone)} Plot (
                              {zb.zonePercentageReceived.toFixed(1)}%)
                            </div>
                          );
                        })}
                      </td>

                      <td className="py-3 px-3 font-mono-numbers tabular-nums text-[11px]">
                        <div className="font-bold text-[#F8FAFC]">
                          {h.assignedBlockIds.length > 0
                            ? h.assignedBlockIds.join(', ')
                            : '—'}
                        </div>
                        {h.adjacentBlockPairs.length === 0 ? (
                          <span className="text-[10px] font-sans text-[#10B981] font-semibold">
                            ✓ 0 block oo is-xiga
                          </span>
                        ) : (
                          <span className="text-[10px] font-sans text-amber-300 font-semibold">
                            ⚠ Is-xiga: {h.adjacentBlockPairs.map(([a, b]) => `${a}&${b}`).join(', ')}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono-numbers tabular-nums text-[11px] space-y-0.5">
                        {(['tier_1_prime', 'tier_2_standard', 'tier_3_basic'] as AssetQualityTier[]).map(
                          (tk) => {
                            const tb = h.byTier[tk];
                            if (tb.totalTierPlots === 0) return null;
                            return (
                              <div key={tk} className="text-[#CBD5E1]">
                                <strong className="text-[#F8FAFC]">{TIER_METADATA[tk].code}:</strong>{' '}
                                {formatPlotQtyCompact(tb.effectiveTotalPlots)} Plot (
                                {summarizePlotIdsCompact(tb.assignedWholePlotIds, 2)})
                              </div>
                            );
                          }
                        )}
                      </td>

                      <td className="py-3 px-3 text-right font-mono-numbers tabular-nums">
                        <div className="font-extrabold text-[#10B981]">
                          {formatPlotQtyCompact(h.effectiveTotalPlotsReceived)} Plot
                        </div>
                        <div className="text-[11px] text-[#94A3B8]">
                          {h.totalAreaSqM.toLocaleString()} m²
                        </div>
                      </td>

                      <td className="py-3 px-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => onHighlightHeirOnMap(h.heirKey)}
                          className={`min-h-[38px] px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                            highlightedHeirKey === h.heirKey
                              ? 'bg-[#10B981] text-[#030712]'
                              : 'bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] text-[#F8FAFC]'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5 shrink-0" />
                          <span>Arag</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {fairAllocation.sharedPlots.length > 0 && (
                <div className="p-4 bg-amber-950/25 border-t border-[#243449] space-y-2 text-xs">
                  <div className="font-bold text-amber-200">
                    Faahfaahinta Plots-ka Wadaagga ah ({fairAllocation.sharedPlots.length}{' '}
                    Plot oo jajabka saamiga Zone kasta lagu simay):
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {fairAllocation.sharedPlots.map((sp) => (
                      <div
                        key={sp.plotId}
                        className="bg-[#0F1B2D] border border-amber-500/30 rounded-xl px-3 py-2"
                      >
                        <span className="font-mono-numbers tabular-nums font-extrabold text-[#10B981]">
                          {sp.plotId}
                        </span>{' '}
                        <span className="text-[11px] text-[#94A3B8]">
                          ({sp.zoneId} · {TIER_METADATA[sp.tier].code})
                        </span>
                        <div className="text-[11px] text-[#CBD5E1] mt-0.5 font-mono-numbers tabular-nums">
                          {sp.coOwners
                            ?.map(
                              (c) =>
                                `${c.personName}: ${c.sharePercentageOfPlot}% (${c.areaSqM} m²)`
                            )
                            .join(' · ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 1B: HALF PLOTS & BOUNDARY CLIPPING VALIDATION + HISTORY */}
      {bottomTab === 'half_plots_validation' && (
        <div className="p-4 sm:p-5 space-y-5">
          {!subdivisionResult || !subdivisionResult.halfPlotSummary ? (
            <div className="p-6 text-center text-xs text-[#94A3B8]">
              Soo geli xuduudda beerta si nidaamku u baadho dhammaan Blocks-ka iyo Plots-ka xuduuddu goysay.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                <div className="lg:col-span-5 border border-[#243449] rounded-xl p-4 bg-[#0F1B2D] space-y-2 text-xs">
                  <div className="font-extrabold text-[#10B981]">
                    Xeerka Rasmiga ah ee Half Plot (Block 10 Plot = 90 × 48 m)
                  </div>
                  <div className="space-y-1 text-[#CBD5E1] leading-relaxed">
                    <div>
                      <strong className="font-mono-numbers tabular-nums text-[#F8FAFC]">
                        Plots 1, 5, 6, 10 (Geesaha):
                      </strong>{' '}
                      Cabbirka Half Plot waa{' '}
                      <strong className="font-mono-numbers tabular-nums text-[#10B981]">
                        12 × 18 m (216 m²)
                      </strong>
                    </div>
                    <div>
                      <strong className="font-mono-numbers tabular-nums text-[#F8FAFC]">
                        Plots 2, 3, 4, 7, 8, 9 (Dhexe):
                      </strong>{' '}
                      Cabbirka Half Plot waa{' '}
                      <strong className="font-mono-numbers tabular-nums text-[#10B981]">
                        9 × 24 m (216 m²)
                      </strong>
                    </div>
                    <p className="text-[11px] text-[#94A3B8] pt-1">
                      216 m² oo keliya kuma filna — waa in cabbirka saxda ah, qaabka leydiga, jihada waddada, iyo ku-jiritaanka xuduudda la xaqiijiyo, iyadoon la isku beddelin 12×18 m iyo 9×24 m.
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="border border-[#243449] rounded-xl p-3 bg-[#0F1B2D]">
                    <div className="text-[11px] text-[#94A3B8]">Gudaha oo dhan</div>
                    <div className="text-lg font-mono-numbers tabular-nums font-extrabold text-teal-400 mt-0.5">
                      {subdivisionResult.halfPlotSummary.fullInsidePlotsCount}
                    </div>
                    <div className="text-[10px] font-mono-numbers tabular-nums text-[#94A3B8]">
                      {subdivisionResult.halfPlotSummary.fullInsideBlocksCount} Block oo buuxa
                    </div>
                  </div>

                  <div className="border border-[#243449] rounded-xl p-3 bg-[#0F1B2D]">
                    <div className="text-[11px] text-[#94A3B8]">Half Plot Sax ah</div>
                    <div className="text-lg font-mono-numbers tabular-nums font-extrabold text-[#10B981] mt-0.5">
                      {subdivisionResult.halfPlotSummary.validHalfPlotsCount}
                    </div>
                    <div className="text-[10px] text-[#94A3B8]">
                      Buuxiyey 12×18 ama 9×24
                    </div>
                  </div>

                  <div className="border border-[#243449] rounded-xl p-3 bg-[#0F1B2D]">
                    <div className="text-[11px] text-[#94A3B8]">Ma Buuxin Half Plot</div>
                    <div className="text-lg font-mono-numbers tabular-nums font-extrabold text-rose-400 mt-0.5">
                      {subdivisionResult.halfPlotSummary.invalidHalfPlotsCount}
                    </div>
                    <div className="text-[10px] text-[#94A3B8]">
                      Bed ama qaab dhiman
                    </div>
                  </div>

                  <div className="border border-[#243449] rounded-xl p-3 bg-[#0F1B2D]">
                    <div className="text-[11px] text-[#94A3B8]">Dib-u-eegis / Dibadda</div>
                    <div className="text-lg font-mono-numbers tabular-nums font-extrabold text-amber-400 mt-0.5">
                      {subdivisionResult.halfPlotSummary.needsReviewPlotsCount +
                        subdivisionResult.halfPlotSummary.insufficientDataPlotsCount}
                    </div>
                    <div className="text-[10px] font-mono-numbers tabular-nums text-[#94A3B8]">
                      {subdivisionResult.halfPlotSummary.fullOutsidePlotsCount} dibadda oo dhan
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1.5 p-1 bg-[#030712] border border-[#243449] rounded-xl text-xs overflow-x-auto">
                {(
                  [
                    { id: 'all_clipped', label: 'Xuduuddu Goysay oo Dhami' },
                    { id: 'half_plot_valid', label: 'Half Plot Sax ah' },
                    { id: 'half_plot_invalid', label: 'Ma Buuxin Shuruudaha' },
                    { id: 'needs_review', label: 'Dib-u-eegis' },
                    { id: 'insufficient_data', label: 'Xog Dhiman' },
                    { id: 'full_inside', label: 'Gudaha oo Dhan' },
                    { id: 'full_outside', label: 'Dibadda oo Dhan' },
                    { id: 'all', label: 'Dhammaan (1–10)' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onChangeHalfPlotStatusFilter(f.id)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      halfPlotStatusFilter === f.id
                        ? 'bg-[#10B981] text-[#030712]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Evaluated Plots Table */}
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-[#243449] rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-[#0F1B2D] z-10">
                    <tr className="border-b border-[#243449] text-[#94A3B8] font-bold">
                      <th className="py-2.5 px-3">Plot ID</th>
                      <th className="py-2.5 px-2.5">Block</th>
                      <th className="py-2.5 px-2 text-center">Plot #</th>
                      <th className="py-2.5 px-3">Half Plot La Filayey</th>
                      <th className="py-2.5 px-3 text-right">Gudaha (m²)</th>
                      <th className="py-2.5 px-3 text-right">Dibadda (m²)</th>
                      <th className="py-2.5 px-3">Leydiga Gudaha</th>
                      <th className="py-2.5 px-3">Natiijada Validation-ka</th>
                      <th className="py-2.5 px-3">Sababta</th>
                      <th className="py-2.5 px-3 text-center">Khariidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#243449]/60">
                    {filteredEvaluatedPlots.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 px-4 text-center text-[#94A3B8]">
                          Ma jiro plot u dhigma sifayntan hadda la doortay.
                        </td>
                      </tr>
                    ) : (
                      filteredEvaluatedPlots.map((q) => {
                        const hp =
                          q.halfPlotValidation || subdivisionResult.plotValidations?.[q.id];
                        if (!hp) return null;
                        const statusColorClass =
                          hp.validationStatus === 'half_plot_valid' ||
                          hp.validationStatus === 'full_inside'
                            ? 'text-[#10B981]'
                            : hp.validationStatus === 'half_plot_invalid'
                            ? 'text-rose-400'
                            : hp.validationStatus === 'needs_review'
                            ? 'text-amber-300'
                            : 'text-[#94A3B8]';
                        return (
                          <tr key={q.id} className="hover:bg-[#0F1B2D]/70">
                            <td className="py-2.5 px-3 font-mono-numbers tabular-nums font-extrabold text-[#10B981] whitespace-nowrap">
                              {q.id}
                            </td>
                            <td className="py-2.5 px-2.5 font-mono-numbers tabular-nums text-[#CBD5E1] whitespace-nowrap">
                              {q.block}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono-numbers tabular-nums font-bold text-[#F8FAFC]">
                              {q.no}
                            </td>
                            <td className="py-2.5 px-3 font-mono-numbers tabular-nums font-semibold text-[#F8FAFC] whitespace-nowrap">
                              {hp.expectedRule.label}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono-numbers tabular-nums font-bold text-[#F8FAFC] whitespace-nowrap">
                              {hp.insideAreaSqM.toFixed(2)} m²
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono-numbers tabular-nums text-[#94A3B8] whitespace-nowrap">
                              {hp.outsideAreaSqM.toFixed(2)} m²
                            </td>
                            <td className="py-2.5 px-3 font-mono-numbers tabular-nums text-[#CBD5E1] whitespace-nowrap">
                              {hp.measuredDisplayDimensions}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className={`font-bold ${statusColorClass}`}>
                                {hp.statusLabelSomali}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-[11px] text-[#94A3B8] max-w-[280px]">
                              {hp.reasonSomali}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => onFocusPlotOnMap(q)}
                                className="min-h-[36px] px-3 py-1 rounded-lg bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] text-[#10B981] font-bold whitespace-nowrap cursor-pointer"
                              >
                                Kormeer
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Boundary Update & Validation History Log */}
              {subdivisionState.halfPlotValidationHistory &&
                subdivisionState.halfPlotValidationHistory.length > 0 && (
                  <div className="border border-[#243449] rounded-xl overflow-hidden bg-[#0F1B2D]">
                    <div className="px-4 py-2.5 bg-[#0B1220] border-b border-[#243449] flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-extrabold text-[#F8FAFC]">
                        Taariikhda Hubinta Xuduudda &amp; Half Plots (
                        {subdivisionState.halfPlotValidationHistory.length} nuqul oo la ilaaliyey)
                      </span>
                      <span className="text-[11px] text-[#94A3B8]">
                        Marka xuduuddu isbeddesho, natiijadii hore waa la kaydiyaa
                      </span>
                    </div>
                    <div className="divide-y divide-[#243449]/60 max-h-[220px] overflow-y-auto text-xs">
                      {subdivisionState.halfPlotValidationHistory.map((snap) => (
                        <div key={snap.id} className="px-4 py-2.5 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-[#F8FAFC]">
                              {snap.triggerReasonSomali}
                            </span>
                            <span className="font-mono-numbers tabular-nums text-[11px] text-[#94A3B8]">
                              {new Date(snap.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <div className="font-mono-numbers tabular-nums text-[11px] text-[#94A3B8]">
                            Bedka xuduudda: {Math.round(snap.boundaryAreaSqM).toLocaleString()} m² ·{' '}
                            Buuxa: {snap.summary.fullInsidePlotsCount} · Half Plot sax ah:{' '}
                            {snap.summary.validHalfPlotsCount} · Ma buuxin:{' '}
                            {snap.summary.invalidHalfPlotsCount}
                          </div>
                          {snap.affectedPlotChanges.length > 0 && (
                            <div className="text-[11px] text-[#10B981] font-mono-numbers tabular-nums">
                              Plots isbeddelay ({snap.affectedPlotChanges.length}):{' '}
                              {snap.affectedPlotChanges
                                .slice(0, 6)
                                .map(
                                  (chg) =>
                                    `${chg.plotId} (${HALF_PLOT_STATUS_METADATA[chg.previousStatus].shortSomali} → ${HALF_PLOT_STATUS_METADATA[chg.newStatus].shortSomali})`
                                )
                                .join(' · ')}
                              {snap.affectedPlotChanges.length > 6 ? ' ...' : ''}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      )}

      {/* TAB 2: POST-SUBDIVISION PLOT & BLOCK METADATA EDITOR */}
      {bottomTab === 'plot_metadata' && (
        <LandMetadataEditorPanel
          subdivisionState={subdivisionState}
          subdivisionResult={subdivisionResult}
          fairAllocation={fairAllocation}
          currency={currency}
          selectedPlotId={inspectedPlotId}
          onSelectPlotId={(pid) => onSelectPlotId(pid)}
          onUpdateSubdivisionState={onUpdateSubdivisionState}
          onNotify={onNotify}
        />
      )}

      {/* TAB 3: PER-HEIR SPATIAL REPORT & APPROVAL WORKFLOW */}
      {bottomTab === 'heir_reports' && (
        <HeirSpatialReportPanel
          subdivisionState={subdivisionState}
          fairAllocation={fairAllocation}
          currency={currency}
          highlightedHeirKey={highlightedHeirKey}
          onHighlightHeirOnMap={onHighlightHeirOnMap}
          onUpdateSubdivisionState={onUpdateSubdivisionState}
          onNotify={onNotify}
        />
      )}

      {/* TAB 1A: EXCLUDED BLOCKS & PLOTS REGISTER + CSV UPLOAD */}
      {bottomTab === 'excluded_register' && (
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#243449]">
            <div>
              <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
                <Ban className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Diiwaanka Blocks &amp; Plots-ka Laga Reebay Qaybinta Dhaxalka</span>
              </h3>
              <p className="text-xs text-[#94A3B8] mt-0.5 leading-relaxed">
                Blocks-ka iyo Plots-ka halkan ku qoran <strong className="text-[#F8FAFC]">laguma darayo</strong> saamiyada dhaxlayaasha, mid kastana wuxuu leeyahay magac gaar ah oo khariirada iyo warbixinaha ka muuqda.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onActivateExclusionBrush}
                className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5 shrink-0" />
                <span>Ka Calaamadi Khariirada</span>
              </button>
              <button
                type="button"
                onClick={() => downloadSampleBlocksAndPlotsCSV(subdivisionResult, subdivisionState)}
                className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-[#243449] bg-[#0F1B2D] hover:bg-[#16263D] text-[#F8FAFC] px-3.5 py-2 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                <span>Soo Saar CSV Qaab-dhismeedka</span>
              </button>
            </div>
          </div>

          {!fairAllocation ||
          ((fairAllocation.excludedBlocks?.length ?? 0) === 0 &&
            (fairAllocation.excludedPlots?.length ?? 0) === 0) ? (
            <div className="rounded-xl border border-dashed border-[#243449] bg-[#0F1B2D]/60 p-6 text-center space-y-2 text-xs">
              <div className="font-bold text-[#F8FAFC]">
                Weli ma jiro Block ama Plot laga reebay qaybinta dhaxalka.
              </div>
              <p className="text-[#94A3B8] max-w-lg mx-auto leading-relaxed">
                Taabo badhanka <strong className="text-[#F8FAFC]">&ldquo;Ka Reeb Dhaxalka&rdquo;</strong> ee khariirada dushiisa si aad u taabato Block ama Plot una qorto magaciisa gaarka ah.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {(fairAllocation.excludedBlocks?.length ?? 0) > 0 && (
                <div className="border border-rose-500/40 rounded-xl overflow-hidden bg-[#0F1B2D]">
                  <div className="px-4 py-2.5 bg-rose-950/40 border-b border-rose-500/35 text-xs font-extrabold text-rose-200">
                    Blocks oo Dhan oo Laga Reebay ({fairAllocation.excludedBlocks?.length})
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#243449] bg-[#0B1220] text-[#94A3B8] font-bold">
                          <th className="py-2.5 px-3">Block ID</th>
                          <th className="py-2.5 px-3">Zone</th>
                          <th className="py-2.5 px-3">Tirada Plots</th>
                          <th className="py-2.5 px-3">Bedka (m²)</th>
                          <th className="py-2.5 px-3">Magaca Gaarka ah (Wax ka beddel)</th>
                          <th className="py-2.5 px-3 text-right">Ficil</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#243449]/60">
                        {fairAllocation.excludedBlocks?.map((eb) => (
                          <tr key={eb.blockId} className="hover:bg-[#16263D]/50">
                            <td className="py-2.5 px-3 font-mono-numbers tabular-nums font-extrabold text-rose-300">
                              {eb.blockId}
                            </td>
                            <td className="py-2.5 px-3 font-mono-numbers tabular-nums text-[#CBD5E1]">
                              {eb.zoneId}
                            </td>
                            <td className="py-2.5 px-3 font-mono-numbers tabular-nums font-bold text-[#F8FAFC]">
                              {eb.plotsCount} Plot
                            </td>
                            <td className="py-2.5 px-3 font-mono-numbers tabular-nums text-[#CBD5E1]">
                              {eb.areaSqM.toLocaleString()} m²
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={
                                  subdivisionState.blockMetadata[eb.blockId]
                                    ?.excludedSpecialName ?? eb.specialName
                                }
                                onChange={(e) =>
                                  onSetBlockExclusionState(eb.blockId, true, e.target.value)
                                }
                                className="w-full max-w-[260px] min-h-[38px] bg-[#0B1220] border border-rose-500/40 rounded-lg px-2.5 py-1 text-xs font-bold text-[#F8FAFC] focus:outline-none focus:border-rose-400"
                              />
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => onSetBlockExclusionState(eb.blockId, false)}
                                className="min-h-[36px] px-3 py-1 rounded-lg bg-[#10B981]/15 hover:bg-[#10B981]/25 border border-[#10B981]/40 text-[#10B981] font-bold whitespace-nowrap cursor-pointer"
                              >
                                Dib ugu dar qaybinta
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(fairAllocation.excludedPlots?.length ?? 0) > 0 && (
                <div className="border border-[#243449] rounded-xl overflow-hidden bg-[#0F1B2D]">
                  <div className="px-4 py-2.5 bg-[#0B1220] border-b border-[#243449] text-xs font-extrabold text-[#F8FAFC]">
                    Dhammaan Plots-ka Laga Reebay Qaybinta ({fairAllocation.excludedPlots?.length} Plot)
                  </div>
                  <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-[#0F1B2D] z-10">
                        <tr className="border-b border-[#243449] text-[#94A3B8] font-bold">
                          <th className="py-2.5 px-3">Plot ID</th>
                          <th className="py-2.5 px-3">Block / Zone</th>
                          <th className="py-2.5 px-3">Heerka Reebista</th>
                          <th className="py-2.5 px-3">Magaca Gaarka ah</th>
                          <th className="py-2.5 px-3 text-right">Bedka (m²)</th>
                          <th className="py-2.5 px-3 text-right">Ficil</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#243449]/60">
                        {fairAllocation.excludedPlots?.map((ep) => (
                          <tr key={ep.plotId} className="hover:bg-[#16263D]/50">
                            <td className="py-2.5 px-3 font-mono-numbers tabular-nums font-extrabold text-rose-300">
                              {ep.plotId}
                            </td>
                            <td className="py-2.5 px-3 font-mono-numbers tabular-nums text-[#CBD5E1]">
                              {ep.blockId} · {ep.zoneId}
                            </td>
                            <td className="py-2.5 px-3 text-[11px] font-semibold text-[#94A3B8]">
                              {ep.excludedScope === 'block'
                                ? `Block ${ep.blockId} oo dhan`
                                : 'Plot gaar ah'}
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={
                                  ep.excludedScope === 'block'
                                    ? subdivisionState.blockMetadata[ep.blockId]
                                        ?.excludedSpecialName ?? ep.specialName
                                    : subdivisionState.plotMetadata[ep.plotId]
                                        ?.excludedSpecialName ?? ep.specialName
                                }
                                onChange={(e) => {
                                  if (ep.excludedScope === 'block') {
                                    onSetBlockExclusionState(ep.blockId, true, e.target.value);
                                  } else {
                                    onSetPlotExclusionState(
                                      ep.plotId,
                                      ep.blockId,
                                      true,
                                      e.target.value
                                    );
                                  }
                                }}
                                className="w-full max-w-[250px] min-h-[38px] bg-[#0B1220] border border-[#243449] rounded-lg px-2.5 py-1 text-xs font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono-numbers tabular-nums text-[#CBD5E1]">
                              {ep.areaSqM} m²
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  ep.excludedScope === 'block'
                                    ? onSetBlockExclusionState(ep.blockId, false)
                                    : onSetPlotExclusionState(ep.plotId, ep.blockId, false)
                                }
                                className="min-h-[36px] px-3 py-1 rounded-lg bg-[#0B1220] border border-[#243449] hover:border-[#10B981] text-[#10B981] font-bold whitespace-nowrap cursor-pointer"
                              >
                                Dib ugu dar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: BLOCKS, ZONES & QUALITY TIER SELECTOR TABLE */}
      {bottomTab === 'blocks_tiers' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#243449] bg-[#0F1B2D] text-[#94A3B8] font-bold">
                <th className="py-3 px-4">Block ID</th>
                <th className="py-3 px-3">Qaybinta Dhaxalka &amp; Magaca Gaarka ah</th>
                <th className="py-3 px-3">Zone (Beddel)</th>
                <th className="py-3 px-3">Plots Buuxa</th>
                <th className="py-3 px-3">Heerka Dhulka (Beddel)</th>
                <th className="py-3 px-4">Dhaxlayaasha Ku Leh Block-kan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#243449]/60">
              {subdivisionResult?.blocks.map((b) => {
                const fullInBlk = b.plots.filter((q) => q.full);
                const bTier = subdivisionState.blockTiers[b.id] || 'tier_1_prime';
                const bZone =
                  subdivisionState.blockMetadata[b.id]?.zoneId ||
                  subdivisionState.blockZones[b.id] ||
                  'Zone A';
                const bExcl = getEffectiveBlockExclusion(b.id, subdivisionState.blockMetadata);
                const ownersInBlk = Array.from(
                  new Set(
                    fullInBlk.flatMap((q) => {
                      const a = fairAllocation?.plotAssignments[q.id];
                      if (!a || a.assignmentType === 'excluded') return [];
                      if (a.ownerPersonName) return [a.ownerPersonName];
                      if (a.coOwners) return a.coOwners.map((c) => c.personName);
                      return [];
                    })
                  )
                );

                return (
                  <tr
                    key={b.id}
                    className={`hover:bg-[#0F1B2D]/70 ${
                      bExcl.isExcluded ? 'bg-rose-950/20' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono-numbers tabular-nums font-extrabold text-[#10B981]">
                      {b.id}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            onSetBlockExclusionState(
                              b.id,
                              !bExcl.isExcluded,
                              !bExcl.isExcluded
                                ? bExcl.specialName || 'Block Laga Reebay'
                                : ''
                            )
                          }
                          className={`min-h-[36px] px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                            bExcl.isExcluded
                              ? 'bg-rose-600 text-white'
                              : 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/35'
                          }`}
                        >
                          {bExcl.isExcluded ? 'Laga Reebay' : 'La Qaybinayo'}
                        </button>
                        {bExcl.isExcluded && (
                          <input
                            type="text"
                            value={
                              subdivisionState.blockMetadata[b.id]?.excludedSpecialName ??
                              bExcl.specialName
                            }
                            onChange={(e) =>
                              onSetBlockExclusionState(b.id, true, e.target.value)
                            }
                            placeholder="Magaca gaarka ah..."
                            className="w-40 min-h-[36px] bg-[#0F1B2D] border border-rose-500/40 rounded-lg px-2.5 py-1 text-[11px] font-bold text-[#F8FAFC] focus:outline-none"
                          />
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        value={bZone}
                        onChange={(e) => {
                          const newZ = e.target.value;
                          onUpdateSubdivisionState((prev) => ({
                            ...prev,
                            zonePresetMode: 'custom',
                            blockZones: { ...prev.blockZones, [b.id]: newZ },
                          }));
                        }}
                        className="min-h-[38px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2.5 py-1 text-xs font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                      >
                        <option value="Zone A">Zone A</option>
                        <option value="Zone B">Zone B</option>
                        <option value="Zone C">Zone C</option>
                        <option value="Zone D">Zone D</option>
                        <option value="Zone E">Zone E</option>
                      </select>
                    </td>
                    <td className="py-3 px-3 font-mono-numbers tabular-nums font-bold text-[#F8FAFC]">
                      {b.nf} / {b.total}
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        value={bTier}
                        onChange={(e) => {
                          const newTier = e.target.value as AssetQualityTier;
                          onUpdateSubdivisionState((prev) => {
                            const nextOverrides = { ...prev.plotTierOverrides };
                            b.plots.forEach((q) => {
                              delete nextOverrides[q.id];
                            });
                            return {
                              ...prev,
                              blockTiers: { ...prev.blockTiers, [b.id]: newTier },
                              plotTierOverrides: nextOverrides,
                            };
                          });
                        }}
                        className="min-h-[38px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2.5 py-1 text-xs font-bold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                      >
                        <option value="tier_1_prime">H1: Heerka 1aad (Fiican)</option>
                        <option value="tier_2_standard">H2: Heerka 2aad (Dhexe)</option>
                        <option value="tier_3_basic">H3: Heerka 3aad (Hoose)</option>
                      </select>
                    </td>
                    <td className="py-3 px-4 text-[#CBD5E1]">
                      {bExcl.isExcluded ? (
                        <span className="font-bold text-rose-300">
                          Laga Reebay: {bExcl.specialName}
                        </span>
                      ) : ownersInBlk.length > 0 ? (
                        ownersInBlk.join(' · ')
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: COMPLETE PLOT REGISTER */}
      {bottomTab === 'all_plots' && (
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-[#0F1B2D] z-10">
              <tr className="border-b border-[#243449] text-[#94A3B8] font-bold">
                <th className="py-2.5 px-4">Plot ID</th>
                <th className="py-2.5 px-3">Zone / Block</th>
                <th className="py-2.5 px-3">Qaybinta &amp; Magaca Gaarka ah</th>
                <th className="py-2.5 px-3">Heerka</th>
                <th className="py-2.5 px-3">Dhaxalaha Helay (Beddel)</th>
                <th className="py-2.5 px-4 text-right">Bedka (m²)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#243449]/60">
              {filteredPlots.map((q) => {
                const pTier = getEffectivePlotTier(
                  q,
                  subdivisionState.blockTiers,
                  subdivisionState.plotTierOverrides
                );
                const pZone = getEffectivePlotZone(
                  q,
                  subdivisionState.blockZones,
                  subdivisionState.plotMetadata,
                  subdivisionState.blockMetadata
                );
                const pMeta = getEffectivePlotMetadata(q, subdivisionState.plotMetadata);
                const pExcl = getEffectivePlotExclusion(
                  q,
                  subdivisionState.plotMetadata,
                  subdivisionState.blockMetadata
                );
                const assign = fairAllocation?.plotAssignments[q.id];
                const manualOwner = subdivisionState.manualPlotHeirOverrides[q.id];

                return (
                  <tr
                    key={q.id}
                    className={`hover:bg-[#0F1B2D]/70 ${
                      pExcl.isExcluded ? 'bg-rose-950/20' : ''
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono-numbers tabular-nums font-bold text-[#10B981]">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectPlotId(q.id);
                          onSelectBottomTab('plot_metadata');
                        }}
                        className="hover:underline cursor-pointer"
                      >
                        {q.id}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 font-mono-numbers tabular-nums text-[#CBD5E1]">
                      <span className="font-bold text-[#10B981]">{pZone}</span> · {q.block}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            onSetPlotExclusionState(
                              q.id,
                              q.block,
                              !pExcl.isExcluded,
                              !pExcl.isExcluded
                                ? pMeta.excludedSpecialName ||
                                    pMeta.parcelNumberOrName ||
                                    'Plot Laga Reebay'
                                : ''
                            )
                          }
                          className={`min-h-[32px] px-2.5 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                            pExcl.isExcluded
                              ? 'bg-rose-600 text-white'
                              : 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/35'
                          }`}
                        >
                          {pExcl.isExcluded ? 'Laga Reebay' : 'La Qaybinayo'}
                        </button>
                        {pExcl.isExcluded && (
                          <input
                            type="text"
                            value={pMeta.excludedSpecialName ?? pExcl.specialName}
                            onChange={(e) =>
                              onSetPlotExclusionState(q.id, q.block, true, e.target.value)
                            }
                            placeholder="Magaca gaarka ah..."
                            className="w-36 min-h-[32px] bg-[#0F1B2D] border border-rose-500/40 rounded-md px-2 py-0.5 text-[11px] font-bold text-[#F8FAFC] focus:outline-none"
                          />
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={pTier}
                        onChange={(e) => {
                          const nt = e.target.value as AssetQualityTier;
                          onUpdateSubdivisionState((prev) => ({
                            ...prev,
                            plotTierOverrides: {
                              ...prev.plotTierOverrides,
                              [q.id]: nt,
                            },
                          }));
                        }}
                        className="min-h-[34px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2 py-1 text-[11px] font-semibold text-[#F8FAFC] focus:outline-none focus:border-[#10B981]"
                      >
                        <option value="tier_1_prime">H1: Fiican</option>
                        <option value="tier_2_standard">H2: Dhexe</option>
                        <option value="tier_3_basic">H3: Hoose</option>
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      {pExcl.isExcluded ? (
                        <span className="font-bold text-rose-300 text-[11px]">
                          Laga Reebay ({pExcl.specialName})
                        </span>
                      ) : fairAllocation && fairAllocation.heirAllocations.length > 0 ? (
                        <select
                          value={manualOwner || '__auto__'}
                          onChange={(e) => {
                            const val = e.target.value;
                            onUpdateSubdivisionState((prev) => {
                              const next = { ...prev.manualPlotHeirOverrides };
                              if (val === '__auto__') delete next[q.id];
                              else next[q.id] = val;
                              return {
                                ...prev,
                                approvalStatus:
                                  prev.approvalStatus === 'approved'
                                    ? 'under_review'
                                    : prev.approvalStatus,
                                manualPlotHeirOverrides: next,
                              };
                            });
                          }}
                          className="min-h-[34px] bg-[#0F1B2D] border border-[#243449] rounded-lg px-2 py-1 text-[11px] font-semibold text-[#F8FAFC] max-w-[230px] focus:outline-none focus:border-[#10B981]"
                        >
                          <option value="__auto__">
                            {assign?.assignmentType === 'shared_fractional'
                              ? `Wadaag: ${assign.coOwners
                                  ?.map((c) => `${c.personName} (${c.sharePercentageOfPlot}%)`)
                                  .join(' + ')}`
                              : `Toos: ${assign?.ownerPersonName || 'Dhaxale'}`}
                          </option>
                          {fairAllocation.heirAllocations.map((h) => (
                            <option key={h.heirKey} value={h.heirKey}>
                              U xidh: {h.personName} ({h.roleTitleSomali})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[#64748B]">Lama dooran dhaxale</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-numbers tabular-nums text-[11px] text-[#CBD5E1]">
                      {q.calculatedAreaSqM ??
                        +(
                          (subdivisionResult?.params.pw || 0) *
                          (subdivisionResult?.params.pd || 0)
                        ).toFixed(1)}{' '}
                      m²
                      {pMeta.verifiedAreaSqM != null && (
                        <span className="block text-[10px] text-[#10B981]">
                          Sugan: {pMeta.verifiedAreaSqM} m²
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
