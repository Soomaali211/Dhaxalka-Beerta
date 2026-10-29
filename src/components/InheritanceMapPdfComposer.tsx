import React, { useEffect, useMemo, useState } from 'react';
import {
  Compass,
  Eye,
  EyeOff,
  FileCheck2,
  Info,
  LayoutTemplate,
  Plus,
  Ruler,
  Trash2,
  Users,
} from 'lucide-react';
import {
  CaseExportMetadata,
  FairLandAllocationResult,
  GeneratedPlot,
  LandSubdivisionState,
  Point2D,
  PrebuiltGeoJsonSubdivision,
  SubdivisionComputationResult,
} from '../types/landSubdivision';
import {
  FarmCartographicReport,
  LAYOUT11_PALETTE,
} from '../utils/pdfCartographyEngine';
import {
  getDistinctHeirColor,
  summarizePlotIdsCompact,
} from '../utils/landSubdivisionEngine';

export type PdfPaperSize = 'A4' | 'A3';
export type PdfPageOrientation = 'landscape' | 'portrait';
export type PdfSheetLayoutStyle = 'sidebar_titleblock' | 'fullmap_bottom_legend';
export type PdfNorthArrowStyle = 'qgis_classic' | 'compass_rose';
export type PdfCornerPosition = 'top_right' | 'top_left';
export type PdfScaleUnitMode = 'auto' | 'meters' | 'kilometers';
export type PdfPlotLabelMode = 'plot_and_heir' | 'plot_only' | 'heir_only' | 'none';

interface CustomLegendItem {
  id: string;
  label: string;
  detail: string;
  colorHex: string;
  visible: boolean;
}

interface InheritanceMapPdfComposerProps {
  subdivisionResult: SubdivisionComputationResult;
  subdivisionState?: LandSubdivisionState | null;
  fairAllocation?: FairLandAllocationResult | null;
  prebuiltSubdivision?: PrebuiltGeoJsonSubdivision | null;
  activeCaseMeta?: CaseExportMetadata | null;
  deceasedName?: string;
  report: FarmCartographicReport;
  previewZoom: number;
  svgRef: React.MutableRefObject<SVGSVGElement | null>;
}

const DEFAULT_HEIR_PALETTE = [
  '#16A34A', // Green
  '#2563EB', // Blue
  '#9333EA', // Purple
  '#D97706', // Amber
  '#0D9488', // Teal
  '#DB2777', // Pink
  '#4F46E5', // Indigo
  '#65A30D', // Lime
  '#EA580C', // Orange
  '#0284C7', // Sky
];

function formatPointsAttr(
  ringUtm: Point2D[],
  toSvg: (pt: Point2D) => [number, number]
): string {
  return ringUtm
    .map((pt) => {
      const [sx, sy] = toSvg(pt);
      return `${sx.toFixed(2)},${sy.toFixed(2)}`;
    })
    .join(' ');
}

function wrapSvgLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  const words = cleaned.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w.length > maxCharsPerLine ? `${w.slice(0, maxCharsPerLine - 1)}…` : w;
      if (lines.length >= maxLines - 1) {
        break;
      }
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}

function computeNiceScaleStepMeters(maxMeters: number): number {
  const candidates = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  let chosen = 50;
  for (const c of candidates) {
    if (c * 2 <= maxMeters * 0.36) {
      chosen = c;
    }
  }
  return chosen;
}

function getAbbreviatedHeirTag(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 6);
  return `${parts[0].slice(0, 5)} ${parts[1][0]}.`;
}

export const InheritanceMapPdfComposer: React.FC<InheritanceMapPdfComposerProps> = ({
  subdivisionResult,
  subdivisionState,
  fairAllocation,
  prebuiltSubdivision,
  activeCaseMeta,
  deceasedName,
  report,
  previewZoom,
  svgRef,
}) => {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Composer Sidebar Section Tabs
  const [activeConfigTab, setActiveConfigTab] = useState<
    'layout' | 'legend' | 'compass_scale' | 'source'
  >('layout');

  // 1. Page Layout State
  const [paperSize, setPaperSize] = useState<PdfPaperSize>('A4');
  const [orientation, setOrientation] = useState<PdfPageOrientation>('landscape');
  const [layoutStyle, setLayoutStyle] = useState<PdfSheetLayoutStyle>('sidebar_titleblock');
  const [includeSchedulePage2, setIncludeSchedulePage2] = useState<boolean>(false);

  // 2. Title & Header State
  const defaultTitle = useMemo(() => {
    if (activeCaseMeta?.caseName && activeCaseMeta.caseName.trim()) {
      return `Khariidadda Qaybinta Dhaxalka — ${activeCaseMeta.caseName.trim()}`;
    }
    return 'Khariidadda Muuqaalka Dhaxalka — Sida Loo Kala Helay';
  }, [activeCaseMeta?.caseName]);

  const defaultSubtitle = useMemo(() => {
    const parts: string[] = [];
    if (deceasedName && deceasedName.trim()) {
      parts.push(`Marxuum: ${deceasedName.trim()}`);
    }
    parts.push(
      `${report.totalPlots} Plot (${report.totalBuuxaCount} Buuxa · ${report.totalQaybCount} Half) · ${report.boundaryAreaDisplayHa.toFixed(2)} ha`
    );
    return parts.join(' · ');
  }, [deceasedName, report.totalPlots, report.totalBuuxaCount, report.totalQaybCount, report.boundaryAreaDisplayHa]);

  const [mapTitle, setMapTitle] = useState<string>(defaultTitle);
  const [mapSubtitle, setMapSubtitle] = useState<string>(defaultSubtitle);
  const [headerKicker, setHeaderKicker] = useState<string>(
    'DOKUMENTIGA RASMIGA AH EE QAYBINTA DHULKA & DHAXALKA'
  );

  // Sync defaults when active case changes if untouched
  useEffect(() => {
    setMapTitle(defaultTitle);
  }, [defaultTitle]);

  useEffect(() => {
    setMapSubtitle(defaultSubtitle);
  }, [defaultSubtitle]);

  // 3. Legends with Dhaxlaha State
  const [legendTitle, setLegendTitle] = useState<string>(
    'Sumadaha Dhaxlayaasha (Sida Loo Kala Helay)'
  );
  const [heirNameOverrides, setHeirNameOverrides] = useState<Record<string, string>>({});
  const [heirColorOverrides, setHeirColorOverrides] = useState<Record<string, string>>({});
  const [hiddenLegendKeys, setHiddenLegendKeys] = useState<Record<string, boolean>>({});
  const [showHeirAreaInLegend, setShowHeirAreaInLegend] = useState<boolean>(true);
  const [showHeirPercentInLegend, setShowHeirPercentInLegend] = useState<boolean>(true);
  const [customLegendItems, setCustomLegendItems] = useState<CustomLegendItem[]>([]);
  const [newCustomLabel, setNewCustomLabel] = useState<string>('');
  const [newCustomDetail, setNewCustomDetail] = useState<string>('');
  const [newCustomColor, setNewCustomColor] = useState<string>('#0EA5E9');

  // Map Layer & Plot Label Toggles
  const [plotLabelMode, setPlotLabelMode] = useState<PdfPlotLabelMode>('plot_only');
  const [showBlockLabels, setShowBlockLabels] = useState<boolean>(true);
  const [showBoundaryLayer, setShowBoundaryLayer] = useState<boolean>(true);
  const [showWadiLayer, setShowWadiLayer] = useState<boolean>(true);
  const [showBlocksOutline, setShowBlocksOutline] = useState<boolean>(true);
  const [showUtmGridTicks, setShowUtmGridTicks] = useState<boolean>(true);

  // 4. North Arrow & Scale State
  const [showNorthArrow, setShowNorthArrow] = useState<boolean>(true);
  const [northArrowStyle, setNorthArrowStyle] = useState<PdfNorthArrowStyle>('qgis_classic');
  const [northArrowPos, setNorthArrowPos] = useState<PdfCornerPosition>('top_right');
  const [northLabel, setNorthLabel] = useState<string>('N');
  const [northRotationDeg, setNorthRotationDeg] = useState<number>(0);

  const [showScaleBar, setShowScaleBar] = useState<boolean>(true);
  const [scaleUnitMode, setScaleUnitMode] = useState<PdfScaleUnitMode>('auto');
  const [customScaleText, setCustomScaleText] = useState<string>('');

  // 5. Source Information State
  const defaultSourceName = useMemo(() => {
    const fileLabel =
      prebuiltSubdivision?.sourceFileName ||
      subdivisionState?.boundaryFileName ||
      'GeoJSON Xogta Cabirka Beerta';
    return `Xogta GIS & Cabirka Goobta (${fileLabel})`;
  }, [prebuiltSubdivision?.sourceFileName, subdivisionState?.boundaryFileName]);

  const defaultCrsText = useMemo(() => {
    const hemi = subdivisionResult.south ? 'S' : 'N';
    return `WGS 84 / UTM Zone ${subdivisionResult.zone}${hemi} (EPSG:${subdivisionResult.epsg})`;
  }, [subdivisionResult.zone, subdivisionResult.south, subdivisionResult.epsg]);

  const defaultRefAndDate = useMemo(() => {
    const ref = activeCaseMeta?.referenceNumber || 'REF-GIS-01';
    const dt = activeCaseMeta?.caseDate || todayIso;
    return `${ref} · ${dt}`;
  }, [activeCaseMeta?.referenceNumber, activeCaseMeta?.caseDate, todayIso]);

  const [sourceDataText, setSourceDataText] = useState<string>(defaultSourceName);
  const [sourceCrsText, setSourceCrsText] = useState<string>(defaultCrsText);
  const [preparedByText, setPreparedByText] = useState<string>(
    'Guddiga Qaybinta Dhaxalka & Injineerka GIS'
  );
  const [sourceRefDateText, setSourceRefDateText] = useState<string>(defaultRefAndDate);
  const [sourceNotesText, setSourceNotesText] = useState<string>(
    "Qaybintan waxaa lagu saleeyey saamiyada Shareecada Islaamka (Faraa'idka) iyo cabirka saxda ah ee plots-ka beerta."
  );

  useEffect(() => {
    setSourceDataText(defaultSourceName);
  }, [defaultSourceName]);

  useEffect(() => {
    setSourceCrsText(defaultCrsText);
  }, [defaultCrsText]);

  useEffect(() => {
    setSourceRefDateText(defaultRefAndDate);
  }, [defaultRefAndDate]);

  // Collect all plots inside/clipped on the farm
  const evaluatedPlots: GeneratedPlot[] = useMemo(() => {
    const list: GeneratedPlot[] = [];
    const seen = new Set<string>();
    if (
      subdivisionResult.allEvaluatedPlots &&
      subdivisionResult.allEvaluatedPlots.length > 0
    ) {
      for (const p of subdivisionResult.allEvaluatedPlots) {
        const rel = p.halfPlotValidation?.boundaryRelation;
        if (!subdivisionResult.isPrebuiltGeometry && rel === 'full_outside') continue;
        if (!seen.has(p.id)) {
          seen.add(p.id);
          list.push(p);
        }
      }
    } else {
      for (const p of subdivisionResult.plots || []) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          list.push(p);
        }
      }
      for (const hp of subdivisionResult.validHalfPlots || []) {
        if (!seen.has(hp.id)) {
          seen.add(hp.id);
          list.push(hp);
        }
      }
    }
    return list;
  }, [subdivisionResult]);

  // Effective Heir Color & Name maps
  const heirAllocations = useMemo(
    () => fairAllocation?.heirAllocations || [],
    [fairAllocation]
  );

  const effectiveHeirColorByKey = useMemo(() => {
    const map: Record<string, string> = {};
    heirAllocations.forEach((h, idx) => {
      map[h.heirKey] =
        heirColorOverrides[h.heirKey] ||
        h.colorHex ||
        getDistinctHeirColor(idx);
    });
    return map;
  }, [heirAllocations, heirColorOverrides]);

  const effectiveHeirNameByKey = useMemo(() => {
    const map: Record<string, string> = {};
    heirAllocations.forEach((h) => {
      const ov = heirNameOverrides[h.heirKey];
      map[h.heirKey] = ov !== undefined && ov.trim() !== '' ? ov.trim() : h.personName;
    });
    return map;
  }, [heirAllocations, heirNameOverrides]);

  // Plot visual classification for Inheritance Map
  const classifiedPlots = useMemo(() => {
    const hasFaraidHeirs = heirAllocations.length > 0;
    return evaluatedPlots.map((p) => {
      const assign = fairAllocation?.plotAssignments?.[p.id];
      const pMeta = subdivisionState?.plotMetadata?.[p.id];
      const bMeta = subdivisionState?.blockMetadata?.[p.block];
      const cartoProfile = report.plotProfilesById[p.id];
      const hpVal = p.halfPlotValidation || subdivisionResult.plotValidations?.[p.id];
      const isValidHalf = hpVal?.validationStatus === 'half_plot_valid' && !p.full;
      const isPartial = cartoProfile ? cartoProfile.isPartialQayb : !p.full;

      const polyUtm =
        !subdivisionResult.isPrebuiltGeometry &&
        isValidHalf &&
        hpVal?.inscribedHalfPlotRectUtm &&
        hpVal.inscribedHalfPlotRectUtm.length >= 3
          ? hpVal.inscribedHalfPlotRectUtm
          : p.rect;

      const isExcluded = Boolean(
        pMeta?.isExcludedFromDivision ||
          bMeta?.isExcludedFromDivision ||
          assign?.isExcluded ||
          cartoProfile?.namedCategory === 'Danguud'
      );

      let fillHex = '#F8FAFC';
      let strokeHex = '#475569';
      let categoryKey = '__unassigned__';
      let heirLabel = '';
      let isShared = false;

      if (
        assign &&
        (assign.assignmentType === 'sole_heir' || assign.assignmentType === 'manual_override') &&
        assign.ownerHeirKey
      ) {
        categoryKey = assign.ownerHeirKey;
        fillHex =
          effectiveHeirColorByKey[assign.ownerHeirKey] ||
          assign.ownerColorHex ||
          '#16A34A';
        strokeHex = '#0F172A';
        heirLabel =
          effectiveHeirNameByKey[assign.ownerHeirKey] ||
          assign.ownerPersonName ||
          '';
      } else if (
        assign &&
        assign.assignmentType === 'shared_fractional' &&
        assign.coOwners &&
        assign.coOwners.length > 0
      ) {
        categoryKey = '__shared__';
        fillHex = '#F59E0B';
        strokeHex = '#0F172A';
        isShared = true;
        heirLabel = assign.coOwners
          .map((c) => effectiveHeirNameByKey[c.heirKey] || c.personName)
          .join(' & ');
      } else if (isExcluded) {
        categoryKey = '__excluded__';
        fillHex = '#FDA4AF';
        strokeHex = '#BE123C';
        heirLabel =
          pMeta?.excludedSpecialName ||
          bMeta?.excludedSpecialName ||
          assign?.excludedSpecialName ||
          'Danguud';
      } else if (!hasFaraidHeirs && cartoProfile?.namedCategory) {
        const cat = cartoProfile.namedCategory;
        categoryKey = `named:${cat}`;
        fillHex = LAYOUT11_PALETTE[cat]?.fillHex || '#CBD5E1';
        strokeHex = '#1E293B';
        heirLabel = cat;
      } else if (assign?.unassignedReason === 'withheld_jajab') {
        categoryKey = '__withheld_jajab__';
        fillHex = '#CBD5E1';
        strokeHex = '#475569';
        heirLabel = 'Jajab Reeban';
      } else if (isPartial || isValidHalf) {
        categoryKey = '__half_unassigned__';
        fillHex = '#E2E8F0';
        strokeHex = '#64748B';
      } else {
        categoryKey = '__unassigned__';
        fillHex = '#F8FAFC';
        strokeHex = '#64748B';
      }

      const shortPlotNo = p.no ? `P${String(p.no).padStart(2, '0')}` : p.id;
      const areaSqM =
        assign?.areaSqM ||
        cartoProfile?.areaSqM ||
        Math.round(p.calculatedAreaSqM || subdivisionResult.params.pw * subdivisionResult.params.pd);

      return {
        plot: p,
        polyUtm,
        fillHex,
        strokeHex,
        categoryKey,
        heirLabel,
        shortPlotNo,
        isPartial: isPartial || isValidHalf,
        isShared,
        isExcluded,
        areaSqM,
      };
    });
  }, [
    evaluatedPlots,
    heirAllocations.length,
    fairAllocation?.plotAssignments,
    subdivisionState?.plotMetadata,
    subdivisionState?.blockMetadata,
    report.plotProfilesById,
    subdivisionResult,
    effectiveHeirColorByKey,
    effectiveHeirNameByKey,
  ]);

  // Build unified Legend Rows (Heirs + Named Owners + Custom + Map Symbols)
  const legendEntries = useMemo(() => {
    const countsByKey: Record<string, { count: number; areaSqM: number }> = {};
    for (const cp of classifiedPlots) {
      if (!countsByKey[cp.categoryKey]) {
        countsByKey[cp.categoryKey] = { count: 0, areaSqM: 0 };
      }
      countsByKey[cp.categoryKey].count += 1;
      countsByKey[cp.categoryKey].areaSqM += cp.areaSqM;
    }

    const rows: {
      key: string;
      kind: 'heir' | 'named' | 'custom' | 'symbol_box' | 'symbol_line';
      label: string;
      subDetail: string;
      colorHex: string;
      strokeHex?: string;
      dashed?: boolean;
      hatch?: boolean;
      visible: boolean;
    }[] = [];

    // 1. Fara'id Heirs (Dhaxlayaasha)
    heirAllocations.forEach((h) => {
      const displayName = effectiveHeirNameByKey[h.heirKey] || h.personName;
      const color = effectiveHeirColorByKey[h.heirKey];
      const plotsStr = Number.isInteger(h.effectiveTotalPlotsReceived)
        ? `${h.effectiveTotalPlotsReceived} Plot`
        : `${h.effectiveTotalPlotsReceived.toFixed(2)} Plot`;
      const detailParts: string[] = [plotsStr];
      if (showHeirAreaInLegend) {
        detailParts.push(`${Math.round(h.totalAreaSqM).toLocaleString()} m²`);
      }
      if (showHeirPercentInLegend) {
        detailParts.push(`${h.individualPercentage.toFixed(1)}%`);
      }
      rows.push({
        key: h.heirKey,
        kind: 'heir',
        label: `${displayName} (${h.roleTitleSomali})`,
        subDetail: detailParts.join(' · '),
        colorHex: color,
        strokeHex: '#0F172A',
        visible: !hiddenLegendKeys[h.heirKey],
      });
    });

    // 2. If no Fara'id heirs yet, surface prebuilt named owner categories if present
    if (heirAllocations.length === 0) {
      Object.entries(countsByKey).forEach(([k, stat]) => {
        if (k.startsWith('named:') && stat.count > 0) {
          const catName = k.slice('named:'.length);
          const customLabel = heirNameOverrides[k] || catName;
          const color =
            heirColorOverrides[k] ||
            LAYOUT11_PALETTE[catName as keyof typeof LAYOUT11_PALETTE]?.fillHex ||
            '#94A3B8';
          rows.push({
            key: k,
            kind: 'named',
            label: customLabel,
            subDetail: `${stat.count} Plot · ${Math.round(stat.areaSqM).toLocaleString()} m²`,
            colorHex: color,
            strokeHex: '#0F172A',
            visible: !hiddenLegendKeys[k],
          });
        }
      });
    }

    // 3. User-added Custom Legend rows
    customLegendItems.forEach((ci) => {
      rows.push({
        key: ci.id,
        kind: 'custom',
        label: ci.label,
        subDetail: ci.detail,
        colorHex: ci.colorHex,
        strokeHex: '#0F172A',
        visible: ci.visible && !hiddenLegendKeys[ci.id],
      });
    });

    // 4. Shared / Excluded / Unassigned Plot Categories (only when count > 0)
    if ((countsByKey['__shared__']?.count || 0) > 0) {
      rows.push({
        key: '__shared__',
        kind: 'symbol_box',
        label: 'Plots Wadaag ah (Dhaxlayaal badan)',
        subDetail: `${countsByKey['__shared__'].count} Plot`,
        colorHex: '#F59E0B',
        strokeHex: '#0F172A',
        hatch: true,
        visible: !hiddenLegendKeys['__shared__'],
      });
    }

    if ((countsByKey['__excluded__']?.count || 0) > 0) {
      rows.push({
        key: '__excluded__',
        kind: 'symbol_box',
        label: 'Danguud / Laga Reebay Qaybinta',
        subDetail: `${countsByKey['__excluded__'].count} Plot`,
        colorHex: '#FDA4AF',
        strokeHex: '#BE123C',
        visible: !hiddenLegendKeys['__excluded__'],
      });
    }

    if ((countsByKey['__withheld_jajab__']?.count || 0) > 0) {
      rows.push({
        key: '__withheld_jajab__',
        kind: 'symbol_box',
        label: 'Jajabka Laga Reebay (Tiro Siman)',
        subDetail: `${countsByKey['__withheld_jajab__'].count} Plot`,
        colorHex: '#CBD5E1',
        strokeHex: '#475569',
        visible: !hiddenLegendKeys['__withheld_jajab__'],
      });
    }

    if ((countsByKey['__half_unassigned__']?.count || 0) > 0) {
      rows.push({
        key: '__half_unassigned__',
        kind: 'symbol_box',
        label: 'Half-Plots Laga Reebay',
        subDetail: `${countsByKey['__half_unassigned__'].count} Half-Plot`,
        colorHex: '#E2E8F0',
        strokeHex: '#64748B',
        dashed: true,
        visible: !hiddenLegendKeys['__half_unassigned__'],
      });
    }

    const unassignedFullOnly = countsByKey['__unassigned__']?.count || 0;
    if (unassignedFullOnly > 0) {
      rows.push({
        key: '__unassigned__',
        kind: 'symbol_box',
        label:
          heirAllocations.length > 0
            ? 'Plots Aan Weli La Qoondayn'
            : 'Plots Gudaha Beerta',
        subDetail: `${unassignedFullOnly} Plot`,
        colorHex: '#F8FAFC',
        strokeHex: '#64748B',
        visible: !hiddenLegendKeys['__unassigned__'],
      });
    }

    // 5. Boundary, Blocks & Wadi Linear Symbols
    if (showBoundaryLayer) {
      rows.push({
        key: '__sym_boundary__',
        kind: 'symbol_line',
        label: 'Xuduudka Rasmiga ah ee Beerta',
        subDetail: `${report.boundaryAreaDisplayHa.toFixed(2)} ha`,
        colorHex: '#DC2626',
        visible: !hiddenLegendKeys['__sym_boundary__'],
      });
    }

    if (showWadiLayer && report.projectedWadiLinesUtm.length > 0) {
      rows.push({
        key: '__sym_wadi__',
        kind: 'symbol_line',
        label: 'Dooxa / Biyo-mareenka Dabiiciga ah',
        subDetail: `${report.projectedWadiLinesUtm.length} Jid`,
        colorHex: '#2563EB',
        visible: !hiddenLegendKeys['__sym_wadi__'],
      });
    }

    if (showBlocksOutline) {
      rows.push({
        key: '__sym_blocks__',
        kind: 'symbol_box',
        label: 'Blocks-ka & Waddooyinka u Dhexeeya',
        subDetail: `${report.totalBlocks} Block`,
        colorHex: '#FFFFFF',
        strokeHex: '#1E293B',
        dashed: true,
        visible: !hiddenLegendKeys['__sym_blocks__'],
      });
    }

    return rows;
  }, [
    classifiedPlots,
    heirAllocations,
    effectiveHeirNameByKey,
    effectiveHeirColorByKey,
    showHeirAreaInLegend,
    showHeirPercentInLegend,
    hiddenLegendKeys,
    heirNameOverrides,
    heirColorOverrides,
    customLegendItems,
    showBoundaryLayer,
    showWadiLayer,
    showBlocksOutline,
    report.boundaryAreaDisplayHa,
    report.projectedWadiLinesUtm.length,
    report.totalBlocks,
  ]);

  const visibleLegendEntries = useMemo(
    () => legendEntries.filter((r) => r.visible),
    [legendEntries]
  );

  // Compute UTM bounding box across boundary, plots, blocks, and wadis
  const utmExtents = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const visit = (pt: Point2D) => {
      if (pt[0] < minX) minX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] > maxY) maxY = pt[1];
    };

    subdivisionResult.bring.forEach(visit);
    evaluatedPlots.forEach((p) => p.rect.forEach(visit));
    report.projectedWadiLinesUtm.forEach((ln) => ln.forEach(visit));

    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 500;
      maxY = 500;
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      widthM: Math.max(10, maxX - minX),
      heightM: Math.max(10, maxY - minY),
    };
  }, [subdivisionResult.bring, evaluatedPlots, report.projectedWadiLinesUtm]);

  // Paper dimensions in SVG px (96 DPI equivalent) & physical millimeters
  const pageMetrics = useMemo(() => {
    const baseMm =
      paperSize === 'A3'
        ? { shortMm: 297, longMm: 420, shortPx: 1122, longPx: 1587 }
        : { shortMm: 210, longMm: 297, shortPx: 794, longPx: 1122 };

    const widthMm = orientation === 'landscape' ? baseMm.longMm : baseMm.shortMm;
    const heightMm = orientation === 'landscape' ? baseMm.shortMm : baseMm.longMm;
    const svgW = orientation === 'landscape' ? baseMm.longPx : baseMm.shortPx;
    const svgH = orientation === 'landscape' ? baseMm.shortPx : baseMm.longPx;

    return { widthMm, heightMm, svgW, svgH };
  }, [paperSize, orientation]);

  // Layout Regions inside SVG
  const regions = useMemo(() => {
    const { svgW, svgH } = pageMetrics;
    const outerPad = 18;
    const innerX = outerPad;
    const innerY = outerPad;
    const innerW = svgW - outerPad * 2;
    const innerH = svgH - outerPad * 2;

    if (layoutStyle === 'sidebar_titleblock') {
      const sideW =
        orientation === 'landscape'
          ? Math.round(innerW * 0.31)
          : Math.round(innerW * 0.35);
      const mapW = innerW - sideW - 12;
      return {
        outer: { x: innerX, y: innerY, w: innerW, h: innerH },
        headerBanner: null,
        mapFrame: { x: innerX + 6, y: innerY + 6, w: mapW - 6, h: innerH - 12 },
        sidebar: { x: innerX + mapW + 6, y: innerY + 6, w: sideW - 12, h: innerH - 12 },
        bottomPanel: null,
      };
    }

    // fullmap_bottom_legend
    const headerH = 78;
    const bottomH = orientation === 'landscape' ? 176 : 230;
    const mapH = innerH - headerH - bottomH - 18;
    return {
      outer: { x: innerX, y: innerY, w: innerW, h: innerH },
      headerBanner: { x: innerX + 6, y: innerY + 6, w: innerW - 12, h: headerH },
      mapFrame: {
        x: innerX + 6,
        y: innerY + headerH + 12,
        w: innerW - 12,
        h: mapH,
      },
      sidebar: null,
      bottomPanel: {
        x: innerX + 6,
        y: innerY + headerH + mapH + 18,
        w: innerW - 12,
        h: bottomH - 6,
      },
    };
  }, [pageMetrics, layoutStyle, orientation]);

  // Map coordinate transform + True Cartographic Scale Calculation
  const mapTransform = useMemo(() => {
    const mf = regions.mapFrame;
    const padX = showUtmGridTicks ? 38 : 24;
    const padTop = 36;
    const padBottom = showScaleBar ? 54 : 28;
    const availW = Math.max(80, mf.w - padX * 2);
    const availH = Math.max(80, mf.h - padTop - padBottom);

    const pxPerMeter = Math.min(availW / utmExtents.widthM, availH / utmExtents.heightM);
    const offsetX = mf.x + padX + (availW - utmExtents.widthM * pxPerMeter) / 2;
    const offsetY = mf.y + padTop + (availH - utmExtents.heightM * pxPerMeter) / 2;

    const toSvg = (pt: Point2D): [number, number] => [
      offsetX + (pt[0] - utmExtents.minX) * pxPerMeter,
      offsetY + (utmExtents.maxY - pt[1]) * pxPerMeter,
    ];

    // Physical mm per SVG pixel (accounting for ~14mm print margin)
    const printableWidthMm = Math.max(100, pageMetrics.widthMm - 14);
    const mmPerSvgPx = printableWidthMm / pageMetrics.svgW;
    const metersPerPrintedMm = 1 / (pxPerMeter * mmPerSvgPx);
    // 1 mm on paper = metersPerPrintedMm * 1000 mm on ground
    const rawScaleDenominator = Math.round((metersPerPrintedMm * 1000) / 50) * 50;
    const scaleDenominator = Math.max(100, rawScaleDenominator);

    const stepMeters = computeNiceScaleStepMeters(utmExtents.widthM);
    const stepPx = stepMeters * pxPerMeter;
    const useKm =
      scaleUnitMode === 'kilometers' ||
      (scaleUnitMode === 'auto' && stepMeters * 2 >= 1000);

    return {
      pxPerMeter,
      offsetX,
      offsetY,
      toSvg,
      scaleDenominator,
      stepMeters,
      stepPx,
      useKm,
    };
  }, [regions.mapFrame, showUtmGridTicks, showScaleBar, utmExtents, pageMetrics, scaleUnitMode]);

  // UTM Grid Ticks along map frame
  const utmGridTicks = useMemo(() => {
    if (!showUtmGridTicks) return { xTicks: [], yTicks: [] };
    const mf = regions.mapFrame;
    const rawStep = Math.max(50, Math.round(utmExtents.widthM / 4 / 50) * 50);
    const xTicks: { sx: number; label: string }[] = [];
    const yTicks: { sy: number; label: string }[] = [];

    const firstE = Math.ceil(utmExtents.minX / rawStep) * rawStep;
    for (let e = firstE; e <= utmExtents.maxX; e += rawStep) {
      const [sx] = mapTransform.toSvg([e, utmExtents.minY]);
      if (sx > mf.x + 36 && sx < mf.x + mf.w - 36) {
        xTicks.push({ sx, label: `${Math.round(e)}E` });
      }
    }

    const rawStepY = Math.max(50, Math.round(utmExtents.heightM / 4 / 50) * 50);
    const firstN = Math.ceil(utmExtents.minY / rawStepY) * rawStepY;
    for (let n = firstN; n <= utmExtents.maxY; n += rawStepY) {
      const [, sy] = mapTransform.toSvg([utmExtents.minX, n]);
      if (sy > mf.y + 32 && sy < mf.y + mf.h - 32) {
        yTicks.push({ sy, label: `${Math.round(n)}N` });
      }
    }

    return { xTicks, yTicks };
  }, [showUtmGridTicks, regions.mapFrame, utmExtents, mapTransform]);

  const handleToggleLegendRow = (key: string) => {
    setHiddenLegendKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddCustomLegendItem = () => {
    if (!newCustomLabel.trim()) return;
    const item: CustomLegendItem = {
      id: `custom_${Date.now()}`,
      label: newCustomLabel.trim(),
      detail: newCustomDetail.trim(),
      colorHex: newCustomColor,
      visible: true,
    };
    setCustomLegendItems((prev) => [...prev, item]);
    setNewCustomLabel('');
    setNewCustomDetail('');
  };

  const handleRemoveCustomLegendItem = (id: string) => {
    setCustomLegendItems((prev) => prev.filter((item) => item.id !== id));
  };

  const formattedScaleRatio =
    customScaleText.trim() !== ''
      ? customScaleText.trim()
      : `1 : ${mapTransform.scaleDenominator.toLocaleString()}`;

  // Reusable North Arrow SVG Group
  const renderNorthArrowSvg = () => {
    if (!showNorthArrow) return null;
    const mf = regions.mapFrame;
    const boxW = 54;
    const boxH = 66;
    const nx =
      northArrowPos === 'top_right' ? mf.x + mf.w - boxW - 14 : mf.x + 14;
    const ny = mf.y + 14;

    return (
      <g id="inheritance_north_arrow" transform={`translate(${nx}, ${ny})`}>
        <rect
          x="0"
          y="0"
          width={boxW}
          height={boxH}
          rx="4"
          fill="#FFFFFF"
          fillOpacity="0.94"
          stroke="#CBD5E1"
          strokeWidth="0.9"
        />
        <text
          x={boxW / 2}
          y="14"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          fontFamily="Plus Jakarta Sans, Arial, sans-serif"
          fill="#0F172A"
        >
          {northLabel || 'N'}
        </text>
        <g transform={`translate(${boxW / 2}, 41) rotate(${northRotationDeg})`}>
          {northArrowStyle === 'qgis_classic' ? (
            <>
              <polygon
                points="0,-20 -11,14 0,7"
                fill="#0F172A"
                stroke="#0F172A"
                strokeWidth="0.8"
                strokeLinejoin="round"
              />
              <polygon
                points="0,-20 11,14 0,7"
                fill="#FFFFFF"
                stroke="#0F172A"
                strokeWidth="0.8"
                strokeLinejoin="round"
              />
            </>
          ) : (
            <>
              <circle
                cx="0"
                cy="0"
                r="16"
                fill="none"
                stroke="#94A3B8"
                strokeWidth="0.8"
              />
              <polygon points="0,-19 -4,0 0,-3" fill="#0F172A" />
              <polygon points="0,-19 4,0 0,-3" fill="#64748B" />
              <polygon points="0,19 -4,0 0,3" fill="#CBD5E1" stroke="#475569" strokeWidth="0.5" />
              <polygon points="0,19 4,0 0,3" fill="#94A3B8" stroke="#475569" strokeWidth="0.5" />
              <polygon points="-19,0 0,-4 -3,0" fill="#94A3B8" />
              <polygon points="19,0 0,-4 3,0" fill="#0F172A" />
            </>
          )}
        </g>
      </g>
    );
  };

  // Reusable Scale Bar SVG Group
  const renderScaleBarSvg = () => {
    if (!showScaleBar) return null;
    const mf = regions.mapFrame;
    const { stepMeters, stepPx, useKm } = mapTransform;
    const totalBarPx = stepPx * 2;
    const boxW = Math.max(168, totalBarPx + 42);
    const boxH = 44;
    const sx = mf.x + 14;
    const sy = mf.y + mf.h - boxH - 12;

    const formatTick = (meters: number) => {
      if (useKm) {
        const km = meters / 1000;
        return Number.isInteger(km) ? `${km}` : km.toFixed(2).replace(/0$/, '');
      }
      return `${meters}`;
    };
    const unitSuffix = useKm ? 'km' : 'm';

    return (
      <g id="inheritance_scale_bar" transform={`translate(${sx}, ${sy})`}>
        <rect
          x="0"
          y="0"
          width={boxW}
          height={boxH}
          rx="4"
          fill="#FFFFFF"
          fillOpacity="0.95"
          stroke="#CBD5E1"
          strokeWidth="0.9"
        />
        <text
          x="10"
          y="13"
          fontSize="8.5"
          fontWeight="700"
          fontFamily="Plus Jakarta Sans, Arial, sans-serif"
          fill="#334155"
        >
          Cabirka (Scale): {formattedScaleRatio}
        </text>

        <g transform="translate(10, 27)">
          {/* 4-segment alternatingGIS bar: first step split in half for fine reading */}
          <rect
            x={0}
            y={0}
            width={stepPx / 2}
            height={5.5}
            fill="#0F172A"
            stroke="#0F172A"
            strokeWidth="0.6"
          />
          <rect
            x={stepPx / 2}
            y={0}
            width={stepPx / 2}
            height={5.5}
            fill="#FFFFFF"
            stroke="#0F172A"
            strokeWidth="0.6"
          />
          <rect
            x={stepPx}
            y={0}
            width={stepPx}
            height={5.5}
            fill="#0F172A"
            stroke="#0F172A"
            strokeWidth="0.6"
          />

          <text
            x={0}
            y={13.5}
            fontSize="7.8"
            fontFamily="JetBrains Mono, monospace"
            fill="#0F172A"
          >
            0
          </text>
          <text
            x={stepPx}
            y={13.5}
            textAnchor="middle"
            fontSize="7.8"
            fontFamily="JetBrains Mono, monospace"
            fill="#0F172A"
          >
            {formatTick(stepMeters)}
          </text>
          <text
            x={totalBarPx}
            y={13.5}
            textAnchor="middle"
            fontSize="7.8"
            fontFamily="JetBrains Mono, monospace"
            fill="#0F172A"
          >
            {formatTick(stepMeters * 2)} {unitSuffix}
          </text>
        </g>
      </g>
    );
  };

  // Render Sidebar Title-Block (Layout Style A)
  const renderSidebarTitleBlockSvg = () => {
    const sb = regions.sidebar;
    if (!sb) return null;

    const titleLines = wrapSvgLines(mapTitle, 32, 3);
    const subtitleLines = wrapSvgLines(mapSubtitle, 42, 2);
    const noteLines = wrapSvgLines(sourceNotesText, 44, 3);

    const headerBoxH = 16 + 14 + titleLines.length * 16 + subtitleLines.length * 12 + 34;
    const sourceBoxH = 108 + noteLines.length * 11;
    const legendBoxY = sb.y + headerBoxH + 8;
    const legendBoxH = Math.max(120, sb.h - headerBoxH - sourceBoxH - 16);
    const sourceBoxY = legendBoxY + legendBoxH + 8;

    const availRowsH = Math.max(60, legendBoxH - 36);
    const rowCount = Math.max(1, visibleLegendEntries.length);
    const rowStep = Math.min(22, Math.max(11.5, availRowsH / rowCount));
    const fontSizeLabel = rowStep < 14 ? 7.4 : rowStep < 17 ? 8.2 : 9;
    const swatchH = Math.min(10.5, Math.max(6.5, rowStep - 4));

    return (
      <g id="inheritance_sidebar_titleblock">
        {/* 1. TITLE & CASE SUMMARY BOX */}
        <rect
          x={sb.x}
          y={sb.y}
          width={sb.w}
          height={headerBoxH}
          fill="#FFFFFF"
          stroke="#0F172A"
          strokeWidth="1.1"
        />
        <rect
          x={sb.x}
          y={sb.y}
          width={sb.w}
          height="20"
          fill="#0F172A"
        />
        <text
          x={sb.x + 10}
          y={sb.y + 13.5}
          fontSize="7.6"
          fontWeight="700"
          fontFamily="Plus Jakarta Sans, Arial, sans-serif"
          fill="#F8FAFC"
          letterSpacing="0.4"
        >
          {headerKicker.slice(0, 48)}
        </text>

        {titleLines.map((ln, idx) => (
          <text
            key={`t-${idx}`}
            x={sb.x + 10}
            y={sb.y + 37 + idx * 15.5}
            fontSize="12.5"
            fontWeight="800"
            fontFamily="Plus Jakarta Sans, Arial, sans-serif"
            fill="#0F172A"
          >
            {ln}
          </text>
        ))}

        {subtitleLines.map((ln, idx) => (
          <text
            key={`st-${idx}`}
            x={sb.x + 10}
            y={sb.y + 39 + titleLines.length * 15.5 + idx * 12}
            fontSize="8.6"
            fontFamily="Plus Jakarta Sans, Arial, sans-serif"
            fill="#475569"
          >
            {ln}
          </text>
        ))}

        {/* Quick KPI Strip inside Title Box */}
        <line
          x1={sb.x + 10}
          y1={sb.y + headerBoxH - 26}
          x2={sb.x + sb.w - 10}
          y2={sb.y + headerBoxH - 26}
          stroke="#E2E8F0"
          strokeWidth="0.9"
        />
        <text
          x={sb.x + 10}
          y={sb.y + headerBoxH - 10}
          fontSize="8.2"
          fontWeight="700"
          fontFamily="JetBrains Mono, monospace"
          fill="#1E293B"
        >
          Dhaxlayaasha: {heirAllocations.length} · Blocks: {report.totalBlocks} · Plots:{' '}
          {report.totalPlots}
        </text>

        {/* 2. LEGENDS WITH DHAXLAHA BOX */}
        <rect
          x={sb.x}
          y={legendBoxY}
          width={sb.w}
          height={legendBoxH}
          fill="#FFFFFF"
          stroke="#0F172A"
          strokeWidth="1.1"
        />
        <rect
          x={sb.x}
          y={legendBoxY}
          width={sb.w}
          height="22"
          fill="#F1F5F9"
          stroke="#CBD5E1"
          strokeWidth="0.7"
        />
        <text
          x={sb.x + 10}
          y={legendBoxY + 14.5}
          fontSize="9.2"
          fontWeight="800"
          fontFamily="Plus Jakarta Sans, Arial, sans-serif"
          fill="#0F172A"
        >
          {legendTitle.slice(0, 44)}
        </text>

        {visibleLegendEntries.length === 0 ? (
          <text
            x={sb.x + 10}
            y={legendBoxY + 42}
            fontSize="8.5"
            fontFamily="Plus Jakarta Sans, Arial, sans-serif"
            fill="#64748B"
          >
            Sumadaha waa la qariyey — ka shid dhinaca bidix.
          </text>
        ) : (
          visibleLegendEntries.map((row, idx) => {
            const ry = legendBoxY + 30 + idx * rowStep;
            if (ry + swatchH > legendBoxY + legendBoxH - 4) return null;
            return (
              <g key={row.key} transform={`translate(${sb.x + 10}, ${ry})`}>
                {row.kind === 'symbol_line' ? (
                  <line
                    x1="0"
                    y1={swatchH / 2}
                    x2="15"
                    y2={swatchH / 2}
                    stroke={row.colorHex}
                    strokeWidth="2.4"
                  />
                ) : (
                  <rect
                    x="0"
                    y="0"
                    width="15"
                    height={swatchH}
                    rx="1.5"
                    fill={row.hatch ? 'url(#inhSharedHatch)' : row.colorHex}
                    stroke={row.strokeHex || '#0F172A'}
                    strokeWidth="0.75"
                    strokeDasharray={row.dashed ? '2.5,1.5' : undefined}
                  />
                )}
                <text
                  x="21"
                  y={swatchH - 1.2}
                  fontSize={fontSizeLabel}
                  fontWeight={row.kind === 'heir' || row.kind === 'custom' ? '700' : '500'}
                  fontFamily="Plus Jakarta Sans, Arial, sans-serif"
                  fill="#0F172A"
                >
                  {row.label.length > 27 ? `${row.label.slice(0, 26)}…` : row.label}
                </text>
                {row.subDetail && (
                  <text
                    x={sb.w - 20}
                    y={swatchH - 1.2}
                    textAnchor="end"
                    fontSize={Math.max(6.8, fontSizeLabel - 0.8)}
                    fontFamily="JetBrains Mono, monospace"
                    fill="#475569"
                  >
                    {row.subDetail}
                  </text>
                )}
              </g>
            );
          })
        )}

        {/* 3. SOURCE INFORMATION & METADATA BOX */}
        <rect
          x={sb.x}
          y={sourceBoxY}
          width={sb.w}
          height={sourceBoxH}
          fill="#F8FAFC"
          stroke="#0F172A"
          strokeWidth="1.1"
        />
        <rect
          x={sb.x}
          y={sourceBoxY}
          width={sb.w}
          height="20"
          fill="#E2E8F0"
        />
        <text
          x={sb.x + 10}
          y={sourceBoxY + 13.5}
          fontSize="8.5"
          fontWeight="800"
          fontFamily="Plus Jakarta Sans, Arial, sans-serif"
          fill="#0F172A"
        >
          XOGTA XIGASHADA (SOURCE INFORMATION)
        </text>

        <g
          transform={`translate(${sb.x + 10}, ${sourceBoxY + 33})`}
          fontFamily="Plus Jakarta Sans, Arial, sans-serif"
          fontSize="8"
          fill="#1E293B"
        >
          <text x="0" y="0">
            <tspan fontWeight="700" fill="#0F172A">
              Xigashada:{' '}
            </tspan>
            {sourceDataText.slice(0, 42)}
          </text>
          <text x="0" y="14">
            <tspan fontWeight="700" fill="#0F172A">
              CRS / Zone:{' '}
            </tspan>
            {sourceCrsText.slice(0, 42)}
          </text>
          <text x="0" y="28">
            <tspan fontWeight="700" fill="#0F172A">
              Cabirka (Scale):{' '}
            </tspan>
            {formattedScaleRatio} · Bogga: {paperSize}{' '}
            {orientation === 'landscape' ? 'Landscape' : 'Portrait'}
          </text>
          <text x="0" y="42">
            <tspan fontWeight="700" fill="#0F172A">
              Diyaariyey:{' '}
            </tspan>
            {preparedByText.slice(0, 42)}
          </text>
          <text x="0" y="56">
            <tspan fontWeight="700" fill="#0F172A">
              Tixraac &amp; Taariikh:{' '}
            </tspan>
            {sourceRefDateText.slice(0, 40)}
          </text>

          {noteLines.length > 0 && (
            <g transform="translate(0, 70)">
              <line
                x1="0"
                y1="-6"
                x2={sb.w - 20}
                y2="-6"
                stroke="#CBD5E1"
                strokeWidth="0.7"
              />
              {noteLines.map((nl, idx) => (
                <text
                  key={`sn-${idx}`}
                  x="0"
                  y={4 + idx * 10.5}
                  fontSize="7.4"
                  fill="#475569"
                >
                  {nl}
                </text>
              ))}
            </g>
          )}
        </g>
      </g>
    );
  };

  // Render Top Banner + Bottom Multi-Column Legend & Source (Layout Style B)
  const renderFullMapBannerAndFooterSvg = () => {
    const hb = regions.headerBanner;
    const bp = regions.bottomPanel;
    if (!hb || !bp) return null;

    const legendW = Math.round(bp.w * 0.64);
    const sourceW = bp.w - legendW - 10;
    const colCount = visibleLegendEntries.length > 6 ? 2 : 1;
    const rowsPerCol = Math.max(1, Math.ceil(visibleLegendEntries.length / colCount));
    const colW = (legendW - 20) / colCount;
    const rowStep = Math.min(20, Math.max(12, (bp.h - 34) / rowsPerCol));
    const noteLines = wrapSvgLines(sourceNotesText, 44, 2);

    return (
      <g id="inheritance_fullmap_header_footer">
        {/* TOP HEADER BANNER */}
        <rect
          x={hb.x}
          y={hb.y}
          width={hb.w}
          height={hb.h}
          fill="#FFFFFF"
          stroke="#0F172A"
          strokeWidth="1.1"
        />
        <rect x={hb.x} y={hb.y} width={hb.w} height="18" fill="#0F172A" />
        <text
          x={hb.x + 12}
          y={hb.y + 12.5}
          fontSize="7.6"
          fontWeight="700"
          fontFamily="Plus Jakarta Sans, Arial, sans-serif"
          fill="#F8FAFC"
          letterSpacing="0.4"
        >
          {headerKicker}
        </text>
        <text
          x={hb.x + hb.w - 12}
          y={hb.y + 12.5}
          textAnchor="end"
          fontSize="7.6"
          fontFamily="JetBrains Mono, monospace"
          fill="#E2E8F0"
        >
          {sourceRefDateText}
        </text>

        <text
          x={hb.x + 12}
          y={hb.y + 42}
          fontSize="15"
          fontWeight="800"
          fontFamily="Plus Jakarta Sans, Arial, sans-serif"
          fill="#0F172A"
        >
          {mapTitle.slice(0, 74)}
        </text>
        <text
          x={hb.x + 12}
          y={hb.y + 61}
          fontSize="9.5"
          fontFamily="Plus Jakarta Sans, Arial, sans-serif"
          fill="#475569"
        >
          {mapSubtitle.slice(0, 96)}
        </text>

        <text
          x={hb.x + hb.w - 12}
          y={hb.y + 44}
          textAnchor="end"
          fontSize="9.5"
          fontWeight="700"
          fontFamily="JetBrains Mono, monospace"
          fill="#0F172A"
        >
          Scale {formattedScaleRatio}
        </text>
        <text
          x={hb.x + hb.w - 12}
          y={hb.y + 61}
          textAnchor="end"
          fontSize="8.5"
          fontFamily="JetBrains Mono, monospace"
          fill="#475569"
        >
          {heirAllocations.length} Dhaxale · {report.totalPlots} Plot ·{' '}
          {report.boundaryAreaDisplayHa.toFixed(2)} ha
        </text>

        {/* BOTTOM LEFT: LEGENDS WITH DHAXLAHA */}
        <rect
          x={bp.x}
          y={bp.y}
          width={legendW}
          height={bp.h}
          fill="#FFFFFF"
          stroke="#0F172A"
          strokeWidth="1.1"
        />
        <rect x={bp.x} y={bp.y} width={legendW} height="21" fill="#F1F5F9" />
        <text
          x={bp.x + 10}
          y={bp.y + 14}
          fontSize="9"
          fontWeight="800"
          fontFamily="Plus Jakarta Sans, Arial, sans-serif"
          fill="#0F172A"
        >
          {legendTitle}
        </text>

        {visibleLegendEntries.map((row, idx) => {
          const colIdx = Math.floor(idx / rowsPerCol);
          const rowIdx = idx % rowsPerCol;
          if (colIdx >= colCount) return null;
          const rx = bp.x + 10 + colIdx * colW;
          const ry = bp.y + 28 + rowIdx * rowStep;
          if (ry + 9 > bp.y + bp.h - 4) return null;

          return (
            <g key={row.key} transform={`translate(${rx}, ${ry})`}>
              {row.kind === 'symbol_line' ? (
                <line
                  x1="0"
                  y1="4.5"
                  x2="14"
                  y2="4.5"
                  stroke={row.colorHex}
                  strokeWidth="2.3"
                />
              ) : (
                <rect
                  x="0"
                  y="0"
                  width="14"
                  height="9"
                  rx="1.5"
                  fill={row.hatch ? 'url(#inhSharedHatch)' : row.colorHex}
                  stroke={row.strokeHex || '#0F172A'}
                  strokeWidth="0.7"
                  strokeDasharray={row.dashed ? '2.5,1.5' : undefined}
                />
              )}
              <text
                x="19"
                y="8"
                fontSize="8"
                fontWeight={row.kind === 'heir' || row.kind === 'custom' ? '700' : '500'}
                fontFamily="Plus Jakarta Sans, Arial, sans-serif"
                fill="#0F172A"
              >
                {row.label.length > 26 ? `${row.label.slice(0, 25)}…` : row.label}
              </text>
              {row.subDetail && (
                <text
                  x={colW - 10}
                  y="8"
                  textAnchor="end"
                  fontSize="7.3"
                  fontFamily="JetBrains Mono, monospace"
                  fill="#475569"
                >
                  {row.subDetail}
                </text>
              )}
            </g>
          );
        })}

        {/* BOTTOM RIGHT: SOURCE INFORMATION */}
        <rect
          x={bp.x + legendW + 10}
          y={bp.y}
          width={sourceW}
          height={bp.h}
          fill="#F8FAFC"
          stroke="#0F172A"
          strokeWidth="1.1"
        />
        <rect
          x={bp.x + legendW + 10}
          y={bp.y}
          width={sourceW}
          height="21"
          fill="#E2E8F0"
        />
        <text
          x={bp.x + legendW + 20}
          y={bp.y + 14}
          fontSize="8.5"
          fontWeight="800"
          fontFamily="Plus Jakarta Sans, Arial, sans-serif"
          fill="#0F172A"
        >
          XOGTA XIGASHADA (SOURCE INFORMATION)
        </text>

        <g
          transform={`translate(${bp.x + legendW + 20}, ${bp.y + 34})`}
          fontFamily="Plus Jakarta Sans, Arial, sans-serif"
          fontSize="8"
          fill="#1E293B"
        >
          <text x="0" y="0">
            <tspan fontWeight="700" fill="#0F172A">
              Xigashada:{' '}
            </tspan>
            {sourceDataText.slice(0, 42)}
          </text>
          <text x="0" y="14">
            <tspan fontWeight="700" fill="#0F172A">
              CRS:{' '}
            </tspan>
            {sourceCrsText.slice(0, 44)}
          </text>
          <text x="0" y="28">
            <tspan fontWeight="700" fill="#0F172A">
              Diyaariyey:{' '}
            </tspan>
            {preparedByText.slice(0, 42)}
          </text>
          <text x="0" y="42">
            <tspan fontWeight="700" fill="#0F172A">
              Tixraac:{' '}
            </tspan>
            {sourceRefDateText.slice(0, 42)}
          </text>
          {noteLines.map((nl, idx) => (
            <text
              key={`fn-${idx}`}
              x="0"
              y={58 + idx * 10.5}
              fontSize="7.3"
              fill="#475569"
            >
              {nl}
            </text>
          ))}
        </g>
      </g>
    );
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden print:block print:overflow-visible">
      {/* Dynamic @page CSS rule matching selected Paper Size & Orientation */}
      <style>{`
        @media print {
          @page {
            size: ${paperSize} ${orientation};
            margin: 7mm;
          }
        }
      `}</style>

      {/* LEFT SIDEBAR: INTERACTIVE PRINT COMPOSER CONTROLS (Hidden on Print) */}
      <aside className="w-full lg:w-[370px] xl:w-[395px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900 text-slate-100 flex flex-col max-h-[42vh] lg:max-h-none overflow-hidden print:hidden no-print">
        {/* Composer Section Switcher */}
        <div className="grid grid-cols-4 gap-1 p-2.5 bg-slate-950/70 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setActiveConfigTab('layout')}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition cursor-pointer ${
              activeConfigTab === 'layout'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            <span>Bogga &amp; Cinwaan</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveConfigTab('legend')}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition cursor-pointer ${
              activeConfigTab === 'legend'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Dhaxlaha</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveConfigTab('compass_scale')}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition cursor-pointer ${
              activeConfigTab === 'compass_scale'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Waqooyi &amp; Scale</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveConfigTab('source')}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition cursor-pointer ${
              activeConfigTab === 'source'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            <Info className="h-3.5 w-3.5" />
            <span>Xigashada</span>
          </button>
        </div>

        {/* Scrollable Config Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* TAB 1: TITLE & PAGE LAYOUT */}
          {activeConfigTab === 'layout' && (
            <>
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-200">
                  1. Cinwaanka Khariidadda (Title)
                </h3>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Cinwaanka Weyn (Map Title)
                  </label>
                  <input
                    type="text"
                    value={mapTitle}
                    onChange={(e) => setMapTitle(e.target.value)}
                    placeholder="Khariidadda Qaybinta Dhaxalka Beerta..."
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Cinwaan-hoosaad (Subtitle / Marxuumka)
                  </label>
                  <input
                    type="text"
                    value={mapSubtitle}
                    onChange={(e) => setMapSubtitle(e.target.value)}
                    placeholder="Marxuum: ... · Wadarta Plots & Bedka"
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Qoraalka Madaxa Sare (Header Kicker)
                  </label>
                  <input
                    type="text"
                    value={headerKicker}
                    onChange={(e) => setHeaderKicker(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 space-y-3">
                <h3 className="text-xs font-bold text-slate-200">
                  2. Qaabka Bogga (Page Layout)
                </h3>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Cabbirka Warqadda
                    </label>
                    <select
                      value={paperSize}
                      onChange={(e) => setPaperSize(e.target.value as PdfPaperSize)}
                      className="w-full rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 px-2.5 py-2 text-xs text-white focus:outline-none cursor-pointer"
                    >
                      <option value="A4">A4 (210 × 297 mm)</option>
                      <option value="A3">A3 (297 × 420 mm)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Jihada Warqadda
                    </label>
                    <select
                      value={orientation}
                      onChange={(e) => setOrientation(e.target.value as PdfPageOrientation)}
                      className="w-full rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 px-2.5 py-2 text-xs text-white focus:outline-none cursor-pointer"
                    >
                      <option value="landscape">Landscape (Ballac)</option>
                      <option value="portrait">Portrait (Dherer)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Naqshadda Qaab-dhismeedka Bogga
                  </label>
                  <div className="grid grid-cols-1 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLayoutStyle('sidebar_titleblock')}
                      className={`text-left rounded-lg border px-3 py-2 transition cursor-pointer ${
                        layoutStyle === 'sidebar_titleblock'
                          ? 'border-emerald-500 bg-emerald-500/10 text-white'
                          : 'border-slate-700 bg-slate-800/70 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="font-semibold text-xs">
                        Tiirka Xogta Dhinaca (GIS Standard Title-Block)
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Khariidadda bidix · Cinwaanka, Dhaxlayaasha &amp; Xigashada midig
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setLayoutStyle('fullmap_bottom_legend')}
                      className={`text-left rounded-lg border px-3 py-2 transition cursor-pointer ${
                        layoutStyle === 'fullmap_bottom_legend'
                          ? 'border-emerald-500 bg-emerald-500/10 text-white'
                          : 'border-slate-700 bg-slate-800/70 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="font-semibold text-xs">
                        Khariidad Ballaadhan + Sumadaha Hoose
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Cinwaanka sare · Khariidad weyn dhexe · Dhaxlayaasha &amp; Xigashada hoos
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Qoraalka Gudaha Plots-ka Khariidadda
                  </label>
                  <select
                    value={plotLabelMode}
                    onChange={(e) => setPlotLabelMode(e.target.value as PdfPlotLabelMode)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 px-2.5 py-2 text-xs text-white focus:outline-none cursor-pointer"
                  >
                    <option value="plot_only">Lambarka Plot-ka (tusaale P01)</option>
                    <option value="plot_and_heir">Lambarka + Magaca Kooban ee Dhaxlaha</option>
                    <option value="heir_only">Magaca Kooban ee Dhaxlaha oo keliya</option>
                    <option value="none">Ha ku qorin gudaha plot-ka (Nadiif)</option>
                  </select>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="text-slate-300">Muuji Magacyada Blocks-ka (R01-C02)</span>
                    <input
                      type="checkbox"
                      checked={showBlockLabels}
                      onChange={(e) => setShowBlockLabels(e.target.checked)}
                      className="h-4 w-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="text-slate-300">
                      Ku dar Bogga 2aad: Jadwalka Plots-ka &amp; Saxiixa
                    </span>
                    <input
                      type="checkbox"
                      checked={includeSchedulePage2}
                      onChange={(e) => setIncludeSchedulePage2(e.target.checked)}
                      className="h-4 w-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: LEGENDS WITH DHAXLAHA */}
          {activeConfigTab === 'legend' && (
            <>
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-200">
                  Sumadaha &amp; Dhaxlayaasha (Legends with Dhaxlaha)
                </h3>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Cinwaanka Sanduuqa Sumadaha
                  </label>
                  <input
                    type="text"
                    value={legendTitle}
                    onChange={(e) => setLegendTitle(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showHeirAreaInLegend}
                      onChange={(e) => setShowHeirAreaInLegend(e.target.checked)}
                      className="h-3.5 w-3.5 accent-emerald-500"
                    />
                    <span>Muuji Bedka (m²)</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showHeirPercentInLegend}
                      onChange={(e) => setShowHeirPercentInLegend(e.target.checked)}
                      className="h-3.5 w-3.5 accent-emerald-500"
                    />
                    <span>Muuji Saamiga (%)</span>
                  </label>
                </div>

                {heirAllocations.length === 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200 leading-relaxed">
                    Weli dhaxlayaal laguma xisaabin qaybta <strong>Xisaabi</strong>. Waxaad
                    hoos ku qori kartaa dhaxlayaal/sumado gaar ah ama ka buuxi qaybta Xisaabi
                    si plots-ka si toos ah loogu midabeeyo dhaxale kasta.
                  </div>
                )}

                {/* Editable Heirs List */}
                {heirAllocations.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-slate-400">
                       wax ka beddel magaca ama midabka dhaxale kasta marka la daabacayo:
                    </div>
                    {heirAllocations.map((h) => {
                      const isHidden = Boolean(hiddenLegendKeys[h.heirKey]);
                      const currentColor = effectiveHeirColorByKey[h.heirKey];
                      const currentName =
                        heirNameOverrides[h.heirKey] !== undefined
                          ? heirNameOverrides[h.heirKey]
                          : h.personName;

                      return (
                        <div
                          key={h.heirKey}
                          className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/60 p-2"
                        >
                          <input
                            type="color"
                            value={currentColor}
                            onChange={(e) =>
                              setHeirColorOverrides((prev) => ({
                                ...prev,
                                [h.heirKey]: e.target.value,
                              }))
                            }
                            title="Beddel midabka dhaxlahan"
                            className="h-7 w-7 shrink-0 rounded border border-slate-600 bg-transparent cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={currentName}
                              onChange={(e) =>
                                setHeirNameOverrides((prev) => ({
                                  ...prev,
                                  [h.heirKey]: e.target.value,
                                }))
                              }
                              className="w-full rounded bg-slate-900 border border-slate-700 focus:border-emerald-500 px-2 py-1 text-xs text-white focus:outline-none"
                            />
                            <div className="mt-0.5 text-[10.5px] text-slate-400 tabular-nums truncate">
                              {h.roleTitleSomali} · {h.effectiveTotalPlotsReceived} Plot ·{' '}
                              {Math.round(h.totalAreaSqM).toLocaleString()} m² (
                              {h.individualPercentage.toFixed(1)}%)
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleLegendRow(h.heirKey)}
                            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer"
                            title={isHidden ? 'Muuji sumadda' : 'Qari sumadda'}
                          >
                            {isHidden ? (
                              <EyeOff className="h-3.5 w-3.5 text-rose-400" />
                            ) : (
                              <Eye className="h-3.5 w-3.5 text-emerald-400" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add Custom Legend Item */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-300">
                    Ku dar Sumad ama Dhaxale Dheeraad ah (Custom Legend Row)
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newCustomColor}
                      onChange={(e) => setNewCustomColor(e.target.value)}
                      className="h-8 w-8 shrink-0 rounded border border-slate-700 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={newCustomLabel}
                      onChange={(e) => setNewCustomLabel(e.target.value)}
                      placeholder="Magaca dhaxlaha / sumadda..."
                      className="flex-1 rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newCustomDetail}
                      onChange={(e) => setNewCustomDetail(e.target.value)}
                      placeholder="Tirada / Faahfaahin (tusaale: 6 Plot · Waqf)"
                      className="flex-1 rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomLegendItem}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Ku dar</span>
                    </button>
                  </div>

                  {customLegendItems.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {customLegendItems.map((ci) => (
                        <div
                          key={ci.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-800/50 px-2.5 py-1.5"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-3 w-4 rounded-xs shrink-0 border border-white/20"
                              style={{ backgroundColor: ci.colorHex }}
                            />
                            <span className="truncate text-xs font-medium text-white">
                              {ci.label}
                            </span>
                            {ci.detail && (
                              <span className="text-[11px] text-slate-400 truncate">
                                · {ci.detail}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomLegendItem(ci.id)}
                            className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                            title="Tirtir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Map Feature Layers Toggle */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-300">
                    Lakabyada Khariidadda &amp; Sumadaha Guud
                  </div>
                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="text-slate-300">Xuduudka Beerta (Red Perimeter)</span>
                    <input
                      type="checkbox"
                      checked={showBoundaryLayer}
                      onChange={(e) => setShowBoundaryLayer(e.target.checked)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="text-slate-300">Dooxa / Biyo-mareenka</span>
                    <input
                      type="checkbox"
                      checked={showWadiLayer}
                      onChange={(e) => setShowWadiLayer(e.target.checked)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="text-slate-300">Xuduudaha Blocks-ka &amp; Waddooyinka</span>
                    <input
                      type="checkbox"
                      checked={showBlocksOutline}
                      onChange={(e) => setShowBlocksOutline(e.target.checked)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                  </label>
                </div>
              </div>
            </>
          )}

          {/* TAB 3: NORTH ARROW & SCALE */}
          {activeConfigTab === 'compass_scale' && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Compass className="h-3.5 w-3.5 text-emerald-400" />
                    <span>1. Calaamadda Waqooyiga (North Arrow)</span>
                  </h3>
                  <input
                    type="checkbox"
                    checked={showNorthArrow}
                    onChange={(e) => setShowNorthArrow(e.target.checked)}
                    className="h-4 w-4 accent-emerald-500 cursor-pointer"
                  />
                </div>

                {showNorthArrow && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Qaabka Falladhka
                        </label>
                        <select
                          value={northArrowStyle}
                          onChange={(e) =>
                            setNorthArrowStyle(e.target.value as PdfNorthArrowStyle)
                          }
                          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-2 text-xs text-white focus:outline-none cursor-pointer"
                        >
                          <option value="qgis_classic">QGIS Laba-Midab</option>
                          <option value="compass_rose">Xiddigta Jihooyinka</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Goobta uu ka muuqanayo
                        </label>
                        <select
                          value={northArrowPos}
                          onChange={(e) =>
                            setNorthArrowPos(e.target.value as PdfCornerPosition)
                          }
                          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-2 text-xs text-white focus:outline-none cursor-pointer"
                        >
                          <option value="top_right">Midig-Sare (Top-Right)</option>
                          <option value="top_left">Bidix-Sare (Top-Left)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Qoraalka Waqooyi
                        </label>
                        <input
                          type="text"
                          value={northLabel}
                          onChange={(e) => setNorthLabel(e.target.value)}
                          placeholder="N ama Wq"
                          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs text-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Wareegga (Degrees °)
                        </label>
                        <input
                          type="number"
                          value={northRotationDeg}
                          onChange={(e) =>
                            setNorthRotationDeg(Number(e.target.value) || 0)
                          }
                          min={-180}
                          max={180}
                          className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs text-white tabular-nums focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Ruler className="h-3.5 w-3.5 text-emerald-400" />
                    <span>2. Cabirka Masaafada (Scale Bar &amp; Ratio)</span>
                  </h3>
                  <input
                    type="checkbox"
                    checked={showScaleBar}
                    onChange={(e) => setShowScaleBar(e.target.checked)}
                    className="h-4 w-4 accent-emerald-500 cursor-pointer"
                  />
                </div>

                {showScaleBar && (
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Halbeegga Scale Bar-ka
                      </label>
                      <select
                        value={scaleUnitMode}
                        onChange={(e) =>
                          setScaleUnitMode(e.target.value as PdfScaleUnitMode)
                        }
                        className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-2 text-xs text-white focus:outline-none cursor-pointer"
                      >
                        <option value="auto">Toos u dooro (Auto m / km)</option>
                        <option value="meters">Mitir (m)</option>
                        <option value="kilometers">Kilomitir (km)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Saamiga Cabirka (Auto: 1 :{' '}
                        {mapTransform.scaleDenominator.toLocaleString()}) — ama qor mid gaar ah
                      </label>
                      <input
                        type="text"
                        value={customScaleText}
                        onChange={(e) => setCustomScaleText(e.target.value)}
                        placeholder={`1 : ${mapTransform.scaleDenominator.toLocaleString()}`}
                        className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white tabular-nums focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <label className="flex items-center justify-between gap-2 pt-1 cursor-pointer">
                  <span className="text-slate-300">
                    Muuji Isuduwaha UTM ee Xاشiyaha Khariidadda
                  </span>
                  <input
                    type="checkbox"
                    checked={showUtmGridTicks}
                    onChange={(e) => setShowUtmGridTicks(e.target.checked)}
                    className="h-4 w-4 accent-emerald-500 cursor-pointer"
                  />
                </label>
              </div>
            </>
          )}

          {/* TAB 4: SOURCE INFORMATION */}
          {activeConfigTab === 'source' && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-200">
                Xogta Xigashada (Source Information)
              </h3>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Xigashada Xogta (Data / Survey Source)
                </label>
                <input
                  type="text"
                  value={sourceDataText}
                  onChange={(e) => setSourceDataText(e.target.value)}
                  placeholder="Tusaale: Cabirka GPS & GeoJSON Beerta..."
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Nidaamka Isuduwaha (CRS / Projection)
                </label>
                <input
                  type="text"
                  value={sourceCrsText}
                  onChange={(e) => setSourceCrsText(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Diyaariyey / Guddiga ama Injineerka
                </label>
                <input
                  type="text"
                  value={preparedByText}
                  onChange={(e) => setPreparedByText(e.target.value)}
                  placeholder="Magaca xafiiska, injineerka ama guddiga..."
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Lambarka Tixraaca &amp; Taariikhda Daabacaadda
                </label>
                <input
                  type="text"
                  value={sourceRefDateText}
                  onChange={(e) => setSourceRefDateText(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Fiiro Gaar ah / Qoraal Xigasho Dheeraad ah
                </label>
                <textarea
                  rows={3}
                  value={sourceNotesText}
                  onChange={(e) => setSourceNotesText(e.target.value)}
                  placeholder="Faahfaahin dheeraad ah oo ku saabsan xuduudka, saxiixa ama habka qaybinta..."
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 px-3 py-2 text-xs text-white focus:outline-none resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Helpful Print Footer Hint */}
        <div className="border-t border-slate-800 bg-slate-950/60 px-4 py-2.5 text-[11px] text-slate-400 flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>
            Bogga: <strong className="text-slate-200">{paperSize}</strong> ·{' '}
            <strong className="text-slate-200">
              {orientation === 'landscape' ? 'Landscape' : 'Portrait'}
            </strong>{' '}
            — Riix <strong>Daabac / Kaydi PDF</strong> sare.
          </span>
        </div>
      </aside>

      {/* RIGHT MAIN PREVIEW & PRINTABLE CARTOGRAPHIC SHEET(S) */}
      <div className="flex-1 overflow-auto bg-slate-200 p-4 sm:p-6 print:overflow-visible print:bg-white print:p-0">
        <div className="mx-auto flex flex-col items-center gap-6 print:block">
          {/* PAGE 1: VECTOR CARTOGRAPHIC INHERITANCE MAP SHEET */}
          <section
            className={`bg-white shadow-2xl ring-1 ring-slate-300 print:shadow-none print:ring-0 ${
              includeSchedulePage2 ? 'pdf-report-page' : ''
            }`}
            style={{
              width:
                previewZoom !== 1
                  ? `${Math.round(pageMetrics.svgW * previewZoom)}px`
                  : undefined,
            }}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${pageMetrics.svgW} ${pageMetrics.svgH}`}
              className="block w-full h-auto max-w-full print:w-full print:h-auto"
              role="img"
              aria-label={mapTitle}
            >
              <defs>
                {/* Diagonal multi-color hatch for Shared Plots */}
                <pattern
                  id="inhSharedHatch"
                  width="8"
                  height="8"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="8" height="8" fill="#FEF3C7" />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="8"
                    stroke="#D97706"
                    strokeWidth="3"
                  />
                </pattern>

                {/* Subtle diagonal stipple for Half-Plots */}
                <pattern
                  id="inhHalfOverlay"
                  width="6"
                  height="6"
                  patternTransform="rotate(-45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke="#0F172A"
                    strokeOpacity="0.18"
                    strokeWidth="1.2"
                  />
                </pattern>

                <clipPath id="inhMapViewportClip">
                  <rect
                    x={regions.mapFrame.x}
                    y={regions.mapFrame.y}
                    width={regions.mapFrame.w}
                    height={regions.mapFrame.h}
                  />
                </clipPath>
              </defs>

              {/* Sheet Paper Background & Double Neatline */}
              <rect
                x="0"
                y="0"
                width={pageMetrics.svgW}
                height={pageMetrics.svgH}
                fill="#FFFFFF"
              />
              <rect
                x={regions.outer.x}
                y={regions.outer.y}
                width={regions.outer.w}
                height={regions.outer.h}
                fill="none"
                stroke="#0F172A"
                strokeWidth="1.6"
              />
              <rect
                x={regions.outer.x + 3}
                y={regions.outer.y + 3}
                width={regions.outer.w - 6}
                height={regions.outer.h - 6}
                fill="none"
                stroke="#94A3B8"
                strokeWidth="0.6"
              />

              {/* MAP VIEWPORT CANVAS */}
              <rect
                x={regions.mapFrame.x}
                y={regions.mapFrame.y}
                width={regions.mapFrame.w}
                height={regions.mapFrame.h}
                fill="#FCFDFE"
                stroke="#0F172A"
                strokeWidth="1.1"
              />

              {/* Optional Faint UTM Grid Lines + Frame Ticks */}
              {showUtmGridTicks && (
                <g id="inh_utm_grid">
                  {utmGridTicks.xTicks.map((tk) => (
                    <g key={`xt-${tk.label}`}>
                      <line
                        x1={tk.sx}
                        y1={regions.mapFrame.y}
                        x2={tk.sx}
                        y2={regions.mapFrame.y + regions.mapFrame.h}
                        stroke="#E2E8F0"
                        strokeWidth="0.6"
                        strokeDasharray="3,3"
                      />
                      <line
                        x1={tk.sx}
                        y1={regions.mapFrame.y}
                        x2={tk.sx}
                        y2={regions.mapFrame.y + 5}
                        stroke="#0F172A"
                        strokeWidth="0.9"
                      />
                      <text
                        x={tk.sx}
                        y={regions.mapFrame.y + 13}
                        textAnchor="middle"
                        fontSize="7"
                        fontFamily="JetBrains Mono, monospace"
                        fill="#64748B"
                      >
                        {tk.label}
                      </text>
                    </g>
                  ))}

                  {utmGridTicks.yTicks.map((tk) => (
                    <g key={`yt-${tk.label}`}>
                      <line
                        x1={regions.mapFrame.x}
                        y1={tk.sy}
                        x2={regions.mapFrame.x + regions.mapFrame.w}
                        y2={tk.sy}
                        stroke="#E2E8F0"
                        strokeWidth="0.6"
                        strokeDasharray="3,3"
                      />
                      <line
                        x1={regions.mapFrame.x}
                        y1={tk.sy}
                        x2={regions.mapFrame.x + 5}
                        y2={tk.sy}
                        stroke="#0F172A"
                        strokeWidth="0.9"
                      />
                      <text
                        x={regions.mapFrame.x + 8}
                        y={tk.sy + 2.5}
                        fontSize="7"
                        fontFamily="JetBrains Mono, monospace"
                        fill="#64748B"
                      >
                        {tk.label}
                      </text>
                    </g>
                  ))}
                </g>
              )}

              {/* Clipped Geographic Content */}
              <g clipPath="url(#inhMapViewportClip)">
                {/* 1. Plots Colored by Assigned Heir (Dhaxlaha) */}
                <g id="inh_plots_layer">
                  {classifiedPlots.map((cp) => {
                    if (hiddenLegendKeys[cp.categoryKey]) return null;
                    const pts = formatPointsAttr(cp.polyUtm, mapTransform.toSvg);
                    const [cx, cy] = mapTransform.toSvg(cp.plot.centerUtm);
                    const approxPlotPxW =
                      subdivisionResult.params.pw * mapTransform.pxPerMeter;
                    const canFitPlotText =
                      plotLabelMode !== 'none' && approxPlotPxW >= 11;

                    let primaryLabel = '';
                    let secondaryLabel = '';
                    if (plotLabelMode === 'plot_only') {
                      primaryLabel = cp.shortPlotNo;
                    } else if (plotLabelMode === 'heir_only') {
                      primaryLabel = getAbbreviatedHeirTag(cp.heirLabel);
                    } else if (plotLabelMode === 'plot_and_heir') {
                      primaryLabel = cp.shortPlotNo;
                      secondaryLabel =
                        approxPlotPxW >= 18
                          ? getAbbreviatedHeirTag(cp.heirLabel)
                          : '';
                    }

                    const lblFontSize = Math.min(
                      7.2,
                      Math.max(4.4, approxPlotPxW * 0.24)
                    );

                    return (
                      <g key={cp.plot.id}>
                        <polygon
                          points={pts}
                          fill={cp.isShared ? 'url(#inhSharedHatch)' : cp.fillHex}
                          stroke={cp.strokeHex}
                          strokeWidth="0.55"
                          strokeLinejoin="round"
                        />
                        {cp.isPartial && (
                          <polygon
                            points={pts}
                            fill="url(#inhHalfOverlay)"
                            stroke="none"
                          />
                        )}
                        {canFitPlotText && primaryLabel && (
                          <text
                            x={cx.toFixed(1)}
                            y={(secondaryLabel ? cy - 1 : cy + 1.6).toFixed(1)}
                            textAnchor="middle"
                            fontSize={lblFontSize.toFixed(1)}
                            fontWeight="700"
                            fontFamily="Plus Jakarta Sans, Arial, sans-serif"
                            fill="#0F172A"
                            stroke="#FFFFFF"
                            strokeWidth="1.2"
                            paintOrder="stroke"
                          >
                            {primaryLabel}
                          </text>
                        )}
                        {canFitPlotText && secondaryLabel && (
                          <text
                            x={cx.toFixed(1)}
                            y={(cy + lblFontSize).toFixed(1)}
                            textAnchor="middle"
                            fontSize={Math.max(4, lblFontSize - 0.8).toFixed(1)}
                            fontWeight="600"
                            fontFamily="Plus Jakarta Sans, Arial, sans-serif"
                            fill="#1E293B"
                            stroke="#FFFFFF"
                            strokeWidth="1.1"
                            paintOrder="stroke"
                          >
                            {secondaryLabel}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* 2. Blocks Outlines */}
                {showBlocksOutline && (
                  <g id="inh_blocks_outline">
                    {subdivisionResult.blocks.map((blk) => (
                      <polygon
                        key={`blk-${blk.id}`}
                        points={formatPointsAttr(blk.rect, mapTransform.toSvg)}
                        fill="none"
                        stroke="#0F172A"
                        strokeWidth="1.05"
                        strokeLinejoin="round"
                      />
                    ))}
                  </g>
                )}

                {/* 3. Special Areas (Aag gaar ah) if any */}
                {(subdivisionResult.specialAreas || []).map((sa, idx) => (
                  <polygon
                    key={`sa-${idx}`}
                    points={formatPointsAttr(sa.ringUtm, mapTransform.toSvg)}
                    fill="#FDE68A"
                    fillOpacity="0.28"
                    stroke="#B45309"
                    strokeWidth="1.2"
                    strokeDasharray="4,2"
                  />
                ))}

                {/* 4. Wadi / Dooxa Hydrography */}
                {showWadiLayer && (
                  <g id="inh_wadi_lines">
                    {report.projectedWadiLinesUtm.map((lineUtm, idx) => (
                      <polyline
                        key={`wadi-${idx}`}
                        points={formatPointsAttr(lineUtm, mapTransform.toSvg)}
                        fill="none"
                        stroke="#2563EB"
                        strokeWidth="2.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                  </g>
                )}

                {/* 5. Farm Boundary Red Perimeter */}
                {showBoundaryLayer && (
                  <polygon
                    points={formatPointsAttr(
                      subdivisionResult.bring,
                      mapTransform.toSvg
                    )}
                    fill="none"
                    stroke="#DC2626"
                    strokeWidth="2.1"
                    strokeLinejoin="round"
                  />
                )}

                {/* 6. Block Labels */}
                {showBlockLabels && (
                  <g id="inh_block_labels">
                    {subdivisionResult.blocks.map((blk) => {
                      const [bx, by] = mapTransform.toSvg(blk.centerUtm);
                      const customBlockName =
                        subdivisionState?.blockMetadata?.[blk.id]?.blockName || blk.id;
                      return (
                        <text
                          key={`blbl-${blk.id}`}
                          x={bx.toFixed(1)}
                          y={(by + 2.8).toFixed(1)}
                          textAnchor="middle"
                          fontSize="7.8"
                          fontWeight="800"
                          fontFamily="Plus Jakarta Sans, Arial, sans-serif"
                          fill="#0F172A"
                          stroke="#FFFFFF"
                          strokeWidth="2.1"
                          paintOrder="stroke"
                        >
                          {customBlockName}
                        </text>
                      );
                    })}
                  </g>
                )}
              </g>

              {/* Map Overlays: North Arrow & Scale Bar */}
              {renderNorthArrowSvg()}
              {renderScaleBarSvg()}

              {/* Sheet Surrounding Layout (Sidebar Title-Block OR Top Banner + Bottom Panel) */}
              {layoutStyle === 'sidebar_titleblock'
                ? renderSidebarTitleBlockSvg()
                : renderFullMapBannerAndFooterSvg()}
            </svg>
          </section>

          {/* OPTIONAL PAGE 2: HEIR PLOTS SCHEDULE & SIGNATURES TABLE */}
          {includeSchedulePage2 && (
            <section className="pdf-report-page w-full max-w-[1040px] bg-white p-8 sm:p-10 shadow-2xl ring-1 ring-slate-300 text-slate-900 print:max-w-none print:shadow-none print:ring-0 print:p-6">
              <div className="border-b-2 border-slate-900 pb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold tracking-wider text-slate-500">
                    LIFAAQA KHARIIDADDA · JADWALKA FAAHFAAHSAN EE DHAXLAYAASHA
                  </div>
                  <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
                    {mapTitle}
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">{mapSubtitle}</p>
                </div>
                <div className="text-right text-xs font-mono tabular-nums text-slate-600">
                  <div>{sourceRefDateText}</div>
                  <div>Scale {formattedScaleRatio}</div>
                </div>
              </div>

              {heirAllocations.length > 0 ? (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="border border-slate-300 px-3 py-2 text-left font-semibold">
                          Midab
                        </th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-semibold">
                          Magaca Dhaxlaha &amp; Xiriirka
                        </th>
                        <th className="border border-slate-300 px-2.5 py-2 text-center font-semibold">
                          Saamiga (%)
                        </th>
                        <th className="border border-slate-300 px-2.5 py-2 text-center font-semibold">
                          Wadarta Plots
                        </th>
                        <th className="border border-slate-300 px-2.5 py-2 text-right font-semibold">
                          Bedka Dhulka (m²)
                        </th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-semibold">
                          Blocks &amp; Lambarrada Plots-ka uu Helay
                        </th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {heirAllocations.map((h, idx) => {
                        const displayName =
                          effectiveHeirNameByKey[h.heirKey] || h.personName;
                        const color = effectiveHeirColorByKey[h.heirKey];
                        const sharedIds = [
                          ...h.byTier.tier_1_prime.sharedPlotSlices,
                          ...h.byTier.tier_2_standard.sharedPlotSlices,
                          ...h.byTier.tier_3_basic.sharedPlotSlices,
                        ].map((s) => `${s.plotId} (${s.percentageOfPlot.toFixed(0)}%)`);

                        const plotSummary =
                          h.allWholePlotIds.length > 0
                            ? summarizePlotIdsCompact(h.allWholePlotIds, 14)
                            : '—';

                        return (
                          <tr
                            key={h.heirKey}
                            className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}
                          >
                            <td className="border border-slate-300 px-3 py-2">
                              <span
                                className="inline-block h-4 w-6 rounded-xs border border-slate-900"
                                style={{ backgroundColor: color }}
                              />
                            </td>
                            <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-900">
                              {displayName}{' '}
                              <span className="font-normal text-slate-500">
                                ({h.roleTitleSomali})
                              </span>
                            </td>
                            <td className="border border-slate-300 px-2.5 py-2 text-center font-mono">
                              {h.individualPercentage.toFixed(2)}%
                            </td>
                            <td className="border border-slate-300 px-2.5 py-2 text-center font-bold">
                              {Number.isInteger(h.effectiveTotalPlotsReceived)
                                ? h.effectiveTotalPlotsReceived
                                : h.effectiveTotalPlotsReceived.toFixed(2)}
                            </td>
                            <td className="border border-slate-300 px-2.5 py-2 text-right font-mono">
                              {Math.round(h.totalAreaSqM).toLocaleString()} m²
                            </td>
                            <td className="border border-slate-300 px-3 py-2 text-[11px] text-slate-700 leading-relaxed">
                              <div>{plotSummary}</div>
                              {sharedIds.length > 0 && (
                                <div className="text-amber-800 mt-0.5">
                                  Wadaag: {sharedIds.join(', ')}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-5 text-xs text-slate-600">
                  Jadwalka faahfaahsan ee plots-ka dhaxlayaasha wuxuu soo baxayaa marka la
                  galiyo dhaxlayaasha qaybta Xisaabi.
                </p>
              )}

              {/* Source & Verification Signatures Block */}
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6 pt-5 border-t border-slate-300 text-xs">
                <div>
                  <div className="font-bold text-slate-900">Diyaariyey (GIS / Cabirka):</div>
                  <div className="text-slate-600 mt-1">{preparedByText}</div>
                  <div className="mt-6 border-b border-slate-400 w-48" />
                  <div className="text-[11px] text-slate-500 mt-1">Saxiixa &amp; Shaambadda</div>
                </div>

                <div>
                  <div className="font-bold text-slate-900">Guddoomiyaha Guddiga / Qaadiga:</div>
                  <div className="text-slate-600 mt-1">Hubinta Saamiyada Faraa&apos;idka</div>
                  <div className="mt-6 border-b border-slate-400 w-48" />
                  <div className="text-[11px] text-slate-500 mt-1">Saxiixa &amp; Taariikhda</div>
                </div>

                <div>
                  <div className="font-bold text-slate-900">Wakiilka Dhaxlayaasha:</div>
                  <div className="text-slate-600 mt-1">Oggolaanshaha Qaybinta Beerta</div>
                  <div className="mt-6 border-b border-slate-400 w-48" />
                  <div className="text-[11px] text-slate-500 mt-1">Magaca &amp; Saxiixa</div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between text-[10.5px] text-slate-400">
                <span>
                  Xigashada: {sourceDataText} · {sourceCrsText}
                </span>
                <span>Bogga 2</span>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
