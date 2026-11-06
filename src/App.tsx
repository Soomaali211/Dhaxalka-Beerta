import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  CaseLifecycleStatus,
  HeirsInput,
  EstateAssetItem,
  EstateDeductionItem,
  Currency,
  EMPTY_HEIRS_INPUT,
  SavedInheritanceCase,
} from './types/inheritance';
import { calculateInheritance } from './utils/faraidCalculator';
import { exportInheritanceToExcel, exportInheritanceToCSV } from './utils/excelExporter';
import { PRESET_SCENARIOS, PresetScenario } from './utils/presets';

import { DashboardView } from './components/DashboardView';
import { SimpleApkCalculatorView } from './components/SimpleApkCalculatorView';
import { ApkResultsAndNamesView } from './components/ApkResultsAndNamesView';
import { BlocksAndPlotsDesignerView } from './components/BlocksAndPlotsDesignerView';
import { InteractiveGisMapDashboard } from './components/InteractiveGisMapDashboard';
import { ListDataView, ListDataCategoryTab } from './components/ListDataView';
import { WelcomeSplashView } from './components/WelcomeSplashView';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ExportOptionsModal } from './components/ExportOptionsModal';
import { ExportHubView } from './components/ExportHubView';
import {
  CartographicPdfDocMode,
  FarmCartographicPdfModal,
} from './components/FarmCartographicPdfModal';
import { OfflineIndicator } from './components/PWAInstallButton';

import { MobileTopAppBar, PrimaryDestination } from './components/MobileTopAppBar';
import { NavigationDrawer } from './components/NavigationDrawer';
import { BackupRestoreModal, BackupRestoreMode } from './components/BackupRestoreModal';
import { readAndNormalizeGisFile } from './utils/kmlAndGeoJsonParser';

import { HeirConfigModal } from './components/HeirConfigModal';
import { AssetsConfigModal } from './components/AssetsConfigModal';
import { PresetsModal } from './components/PresetsModal';
import { OfficialCertificateModal } from './components/OfficialCertificateModal';
import { QuranicProofsModal } from './components/QuranicProofsModal';
import { SavedCasesModal } from './components/SavedCasesModal';

import {
  CaseExportMetadata,
  LandAllocationMode,
  LandSubdivisionState,
} from './types/landSubdivision';
import {
  HtmlGeoJsonSlot,
  LAND_ALLOCATION_MODE_METADATA,
  allocatePlotsFairlyToHeirs,
  applyHtmlBoundarySelectionChange,
  applyHtmlGeoJsonSlotImport,
  applyHtmlUseSample,
  computeLandSubdivision,
  createAuditEntry,
  createInitialSampleSubdivisionState,
  hydrateLandSubdivisionState,
  inspectMultipleGeoJsonUploads,
  syncSubdivisionToEstateAssets,
} from './utils/landSubdivisionEngine';
import {
  computeFarmCartographicReport,
  mergeCoLocatedPrebuiltLayers,
} from './utils/pdfCartographyEngine';
import { importSimultaneousFarmGeoJsonFiles } from './utils/demAndRoadTierEngine';
import {
  CASE_STATUS_METADATA,
  buildCaseChangeEntries,
  cloneSubdivisionStateIsolated,
  createEmptyLandSubdivisionState,
  createNewManagedCase,
  doesSubdivisionHaveGeometry,
  generateUniqueCaseReference,
  hydrateCaseSubdivisionSnapshot,
  hydrateSavedCasesArray,
} from './utils/caseManagementEngine';
import {
  CaseWorkspaceSnapshot,
  UndoRedoState,
  createUndoRedoHistory,
  performRedo,
  performUndo,
  pushUndoSnapshot,
} from './utils/undoRedoEngine';
import { ValidatedBackupPreview } from './utils/backupRestoreEngine';
import { computeUnifiedFarmMetrics, countEnteredHeirs } from './utils/unifiedMetrics';
import { safePersistJsonToLocalStorage } from './utils/androidApkBridge';

import {
  CheckCircle2,
  X,
  Map,
  Wrench,
  LayoutDashboard,
} from 'lucide-react';

const SAVED_CASES_STORAGE_KEY = 'faraid_saved_inheritance_cases';
const GIS_SUBDIVISION_STORAGE_KEY = 'faraid_gis_subdivision_state_v2';
const ACTIVE_CASE_ID_STORAGE_KEY = 'faraid_active_case_id_v1';
const WELCOME_SPLASH_SESSION_KEY = 'beerta_welcome_seen_v1';

type LegacyTab =
  | 'dashboard'
  | 'cases'
  | 'calculator'
  | 'land_designer'
  | 'results'
  | 'records';

type DashboardSubMode = 'interactive_map' | 'cad_designer' | 'overview';
type CalculateSubMode = 'calculator' | 'results';

interface InitialBootstrapState {
  cases: SavedInheritanceCase[];
  activeCase: SavedInheritanceCase;
}

function loadInitialManagedWorkspace(): InitialBootstrapState {
  const defaultScenario = PRESET_SCENARIOS[0];
  let loadedCases: SavedInheritanceCase[] = [];

  try {
    const rawCases = localStorage.getItem(SAVED_CASES_STORAGE_KEY);
    if (rawCases) {
      loadedCases = hydrateSavedCasesArray(JSON.parse(rawCases));
    }
  } catch {
    loadedCases = [];
  }

  if (loadedCases.length === 0) {
    let initialSubdivision: LandSubdivisionState;
    try {
      const rawGis = localStorage.getItem(GIS_SUBDIVISION_STORAGE_KEY);
      initialSubdivision = rawGis
        ? hydrateLandSubdivisionState(JSON.parse(rawGis))
        : createInitialSampleSubdivisionState();
    } catch {
      initialSubdivision = createInitialSampleSubdivisionState();
    }

    const nowIso = new Date().toISOString();
    const initCalc = calculateInheritance(
      defaultScenario.heirs,
      defaultScenario.assets,
      defaultScenario.deductions
    );
    const bItem = initialSubdivision.boundaryItems[initialSubdivision.selectedBoundaryIndex] || null;
    const sCand =
      initialSubdivision.selectedSampleIndex >= 0
        ? initialSubdivision.sampleCandidates[initialSubdivision.selectedSampleIndex] || null
        : null;
    const initSubRes = computeLandSubdivision(
      bItem,
      sCand,
      initialSubdivision.params,
      initialSubdivision.prebuiltSubdivision,
      initialSubdivision.specialAreaItems
    );
    const hasMap = doesSubdivisionHaveGeometry(initialSubdivision);

    const bootstrapCase: SavedInheritanceCase = {
      id: 'case_default_initial',
      caseName: defaultScenario.heirs.deceasedName
        ? `Kiiska ${defaultScenario.heirs.deceasedName}`
        : 'Kiiska Tusaalaha Koowaad',
      referenceNumber: generateUniqueCaseReference([], nowIso.slice(0, 10)),
      caseDate: nowIso.slice(0, 10),
      description: "Kiiska bilowga ah ee tusaalaha nidaamka Faraa'idka & Naqshadda Dhulka.",
      status: 'socda',
      savedAt: nowIso,
      updatedAt: nowIso,
      deceasedName: defaultScenario.heirs.deceasedName || '',
      deceasedGender: defaultScenario.heirs.deceasedGender,
      heirsInput: JSON.parse(JSON.stringify(defaultScenario.heirs)),
      assets: JSON.parse(JSON.stringify(defaultScenario.assets)),
      deductions: JSON.parse(JSON.stringify(defaultScenario.deductions)),
      currency: 'USD',
      totalGrossEstateUSD: initCalc.grossEstateUSD,
      totalNetEstateUSD: initCalc.netDistributableEstateUSD,
      heirCount: initCalc.heirShares.reduce((s, h) => s + h.count, 0),
      hasMapGeometry: hasMap,
      linkedGeometrySourceLabel: hasMap
        ? initialSubdivision.boundaryFileName || 'Beerta Tusaalaha'
        : 'Khariidad ma laha',
      blocksCount: initSubRes ? initSubRes.blocks.length : 0,
      fullPlotsCount: computeUnifiedFarmMetrics(initialSubdivision, initSubRes, hasMap).fullPlotsCount,
      validHalfPlotsCount: computeUnifiedFarmMetrics(initialSubdivision, initSubRes, hasMap).halfPlotsCount,
      clippedPlotsCount: initSubRes?.halfPlotSummary?.boundaryClippedPlotsCount || 0,
      landSubdivisionSnapshot: cloneSubdivisionStateIsolated(initialSubdivision),
      changeHistory: [
        {
          id: 'chg_bootstrap_1',
          changedAt: nowIso,
          fieldSomali: 'Abuurista Kiiska',
          previousValue: '—',
          newValue: 'Kiiska Tusaalaha Koowaad (KIIS-2026-0001)',
          reason: 'Kiiska tusaalaha bilowga ah ee nidaamka.',
          caseStatus: 'socda',
        },
      ],
    };

    loadedCases = [bootstrapCase];
  }

  let selectedCase = loadedCases[0];
  try {
    const savedActiveId = localStorage.getItem(ACTIVE_CASE_ID_STORAGE_KEY);
    if (savedActiveId) {
      const found = loadedCases.find((c) => c.id === savedActiveId);
      if (found) selectedCase = found;
    }
  } catch {
    // ignore storage errors
  }

  return {
    cases: loadedCases,
    activeCase: selectedCase,
  };
}

export default function App() {
  const initialWorkspace = useMemo(() => loadInitialManagedWorkspace(), []);

  const [savedCases, setSavedCases] = useState<SavedInheritanceCase[]>(initialWorkspace.cases);
  const [activeCaseId, setActiveCaseId] = useState<string>(initialWorkspace.activeCase.id);

  const [heirsInput, setHeirsInput] = useState<HeirsInput>(() =>
    JSON.parse(JSON.stringify(initialWorkspace.activeCase.heirsInput))
  );
  const [assets, setAssets] = useState<EstateAssetItem[]>(() =>
    JSON.parse(JSON.stringify(initialWorkspace.activeCase.assets))
  );
  const [deductions, setDeductions] = useState<EstateDeductionItem[]>(() =>
    JSON.parse(JSON.stringify(initialWorkspace.activeCase.deductions))
  );
  const [currency, setCurrency] = useState<Currency>(
    initialWorkspace.activeCase.currency || 'USD'
  );
  const [subdivisionState, setSubdivisionState] = useState<LandSubdivisionState>(() =>
    hydrateCaseSubdivisionSnapshot(
      initialWorkspace.activeCase.landSubdivisionSnapshot,
      initialWorkspace.activeCase.hasMapGeometry
    )
  );

  // Open directly on the last active case's map (reopenable anytime from drawer)
  const [showWelcomeSplash, setShowWelcomeSplash] = useState<boolean>(false);

  // 3 Primary Destinations + Contextual Sub-Modes
  const [activeDestination, setActiveDestination] = useState<PrimaryDestination>('dashboard');
  const [dashboardMode, setDashboardMode] = useState<DashboardSubMode>('interactive_map');
  const [calculateMode, setCalculateMode] = useState<CalculateSubMode>('calculator');
  const [listDataMode, setListDataMode] = useState<ListDataCategoryTab>('cases');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Selected GIS Scope (Plot / Block / All Farm) synced between Map (Screen 6) & Calculator (Screen 5)
  const [selectedTargetScope, setSelectedTargetScope] = useState<string>('all_farm');
  const [mapInspectedPlotId, setMapInspectedPlotId] = useState<string | null>(null);
  const [mapVisibleStats, setMapVisibleStats] = useState<{
    visibleCount: number;
    totalCount: number;
    visibleIds: Set<string> | null;
  }>({
    visibleCount: 0,
    totalCount: 0,
    visibleIds: null,
  });

  // Per-Case Isolated Undo / Redo History Engine
  const [undoHistoriesByCaseId, setUndoHistoriesByCaseId] = useState<
    Record<string, UndoRedoState<CaseWorkspaceSnapshot>>
  >(() => {
    const initSub = hydrateCaseSubdivisionSnapshot(
      initialWorkspace.activeCase.landSubdivisionSnapshot,
      initialWorkspace.activeCase.hasMapGeometry
    );
    const initSnap: CaseWorkspaceSnapshot = {
      caseId: initialWorkspace.activeCase.id,
      heirsInput: JSON.parse(JSON.stringify(initialWorkspace.activeCase.heirsInput)),
      assets: JSON.parse(JSON.stringify(initialWorkspace.activeCase.assets)),
      deductions: JSON.parse(JSON.stringify(initialWorkspace.activeCase.deductions)),
      currency: initialWorkspace.activeCase.currency || 'USD',
      subdivisionState: initSub,
    };
    return {
      [initialWorkspace.activeCase.id]: createUndoRedoHistory(initSnap, 'Bilowga Kiiska'),
    };
  });

  const skipUndoPushRef = useRef<boolean>(false);

  // Record workspace edits per active case (debounced to group rapid keystrokes cleanly)
  useEffect(() => {
    if (!activeCaseId) return;

    if (skipUndoPushRef.current) {
      skipUndoPushRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      const nextSnap: CaseWorkspaceSnapshot = {
        caseId: activeCaseId,
        heirsInput,
        assets,
        deductions,
        currency,
        subdivisionState,
      };

      setUndoHistoriesByCaseId((prev) => {
        const existing = prev[activeCaseId];
        if (!existing) {
          return {
            ...prev,
            [activeCaseId]: createUndoRedoHistory(nextSnap, 'Bilowga Kiiska'),
          };
        }
        const updated = pushUndoSnapshot(existing, nextSnap, 'Wax-ka-beddelka Kiiska');
        if (updated === existing) return prev;
        return {
          ...prev,
          [activeCaseId]: updated,
        };
      });
    }, 260);

    return () => window.clearTimeout(timer);
  }, [activeCaseId, heirsInput, assets, deductions, currency, subdivisionState]);

  // Persist activeCaseId, GIS snapshot & savedCases
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_CASE_ID_STORAGE_KEY, activeCaseId);
    } catch {
      // ignore storage errors
    }
  }, [activeCaseId]);

  useEffect(() => {
    safePersistJsonToLocalStorage(GIS_SUBDIVISION_STORAGE_KEY, subdivisionState);
  }, [subdivisionState]);

  useEffect(() => {
    safePersistJsonToLocalStorage(SAVED_CASES_STORAGE_KEY, savedCases);
  }, [savedCases]);

  // Modals
  const [isHeirConfigOpen, setIsHeirConfigOpen] = useState<boolean>(false);
  const [isAssetsConfigOpen, setIsAssetsConfigOpen] = useState<boolean>(false);
  const [isPresetsOpen, setIsPresetsOpen] = useState<boolean>(false);
  const [isCertificateOpen, setIsCertificateOpen] = useState<boolean>(false);
  const [isQuranicOpen, setIsQuranicOpen] = useState<boolean>(false);
  const [isSavedCasesOpen, setIsSavedCasesOpen] = useState<boolean>(false);
  const [isBackupRestoreOpen, setIsBackupRestoreOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [cartoPdfModal, setCartoPdfModal] = useState<{
    isOpen: boolean;
    mode: CartographicPdfDocMode;
  }>({ isOpen: false, mode: 'layout11' });

  // Toast notification
  const [notification, setNotification] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const showToast = useCallback((title: string, message: string) => {
    setNotification({ title, message });
    window.setTimeout(() => {
      setNotification(null);
    }, 4500);
  }, []);

  const handleDismissWelcomeSplash = useCallback((target?: PrimaryDestination) => {
    try {
      sessionStorage.setItem(WELCOME_SPLASH_SESSION_KEY, '1');
    } catch {
      // ignore storage errors
    }
    setShowWelcomeSplash(false);
    if (target) {
      setActiveDestination(target);
      if (target === 'dashboard') setDashboardMode('interactive_map');
      if (target === 'calculate') setCalculateMode('calculator');
    }
  }, []);

  const handleVisiblePlotsChange = useCallback(
    (visibleCount: number, totalCount: number, visibleIds: Set<string>) => {
      setMapVisibleStats({ visibleCount, totalCount, visibleIds });
    },
    []
  );

  // Bridge legacy child navigation callbacks cleanly into the 4 Primary Destinations
  const navigateLegacyTab = useCallback(
    (tab: LegacyTab) => {
      switch (tab) {
        case 'land_designer':
          setActiveDestination('dashboard');
          setDashboardMode('interactive_map');
          break;
        case 'dashboard':
          setActiveDestination('dashboard');
          setDashboardMode('overview');
          break;
        case 'calculator':
          setActiveDestination('calculate');
          setCalculateMode('calculator');
          break;
        case 'results':
          if (countEnteredHeirs(heirsInput) === 0) {
            showToast(
              'Geli Dhaxlayaasha Marka Hore',
              'Fadlan geli ugu yaraan hal dhaxle ka hor inta aanad eegin natiijada.'
            );
            setActiveDestination('calculate');
            setCalculateMode('calculator');
            break;
          }
          setActiveDestination('calculate');
          setCalculateMode('results');
          break;
        case 'cases':
          setActiveDestination('list_data');
          setListDataMode('cases');
          break;
        case 'records':
          setActiveDestination('list_data');
          setListDataMode('excel');
          break;
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [heirsInput, showToast]
  );

  // Real-time Shariah Faraid calculation (Single Source of Truth)
  const calculationResult = useMemo(() => {
    return calculateInheritance(heirsInput, assets, deductions);
  }, [heirsInput, assets, deductions]);

  // Real-time GIS Blocks, Plots & Half Plot Validation computation
  const subdivisionResult = useMemo(() => {
    const bItem = subdivisionState.boundaryItems[subdivisionState.selectedBoundaryIndex] || null;
    const sCand =
      subdivisionState.selectedSampleIndex >= 0
        ? subdivisionState.sampleCandidates[subdivisionState.selectedSampleIndex] || null
        : null;
    return computeLandSubdivision(
      bItem,
      sCand,
      subdivisionState.params,
      subdivisionState.prebuiltSubdivision,
      subdivisionState.specialAreaItems
    );
  }, [
    subdivisionState.boundaryItems,
    subdivisionState.selectedBoundaryIndex,
    subdivisionState.sampleCandidates,
    subdivisionState.selectedSampleIndex,
    subdivisionState.params,
    subdivisionState.prebuiltSubdivision,
    subdivisionState.specialAreaItems,
  ]);

  // Real-time Fair Multi-Zone, Multi-Tier & Non-Adjacent-Block Sharia Plot Allocation
  const fairLandAllocation = useMemo(() => {
    return allocatePlotsFairlyToHeirs(
      subdivisionResult,
      subdivisionState.blockTiers,
      subdivisionState.plotTierOverrides,
      subdivisionState.manualPlotHeirOverrides,
      subdivisionState.tierUnitPrices,
      subdivisionState.allocationMode,
      calculationResult,
      heirsInput,
      {
        blockZones: subdivisionState.blockZones,
        plotMetadata: subdivisionState.plotMetadata,
        blockMetadata: subdivisionState.blockMetadata,
        enforceNonAdjacentBlocks: subdivisionState.enforceNonAdjacentBlocks,
        includeValidHalfPlots: Boolean(subdivisionState.includeValidHalfPlotsInAllocation),
        approvalStatus: subdivisionState.approvalStatus,
        approvedBy: subdivisionState.approvedBy,
        approvedAt: subdivisionState.approvedAt,
      }
    );
  }, [
    subdivisionResult,
    subdivisionState.blockTiers,
    subdivisionState.plotTierOverrides,
    subdivisionState.manualPlotHeirOverrides,
    subdivisionState.tierUnitPrices,
    subdivisionState.allocationMode,
    subdivisionState.blockZones,
    subdivisionState.plotMetadata,
    subdivisionState.blockMetadata,
    subdivisionState.enforceNonAdjacentBlocks,
    subdivisionState.includeValidHalfPlotsInAllocation,
    subdivisionState.approvalStatus,
    subdivisionState.approvedBy,
    subdivisionState.approvedAt,
    calculationResult,
    heirsInput,
  ]);

  // Keep Estate Assets automatically synchronized whenever GIS Subdivision is linked
  useEffect(() => {
    if (!subdivisionState.isLinkedToEstate || !subdivisionResult) return;
    setAssets((prevAssets) =>
      syncSubdivisionToEstateAssets(
        prevAssets,
        subdivisionResult,
        subdivisionState.blockTiers,
        subdivisionState.plotTierOverrides,
        subdivisionState.tierUnitPrices,
        subdivisionState.plotMetadata,
        subdivisionState.blockMetadata,
        Boolean(subdivisionState.includeValidHalfPlotsInAllocation)
      )
    );
  }, [
    subdivisionState.isLinkedToEstate,
    subdivisionResult,
    subdivisionState.blockTiers,
    subdivisionState.plotTierOverrides,
    subdivisionState.tierUnitPrices,
    subdivisionState.plotMetadata,
    subdivisionState.blockMetadata,
    subdivisionState.includeValidHalfPlotsInAllocation,
  ]);

  const currentHasMap = useMemo(
    () => doesSubdivisionHaveGeometry(subdivisionState),
    [subdivisionState]
  );

  // Automatically keep the active case's isolated snapshot synchronized in `savedCases` (E10, E11)
  useEffect(() => {
    if (!activeCaseId) return;
    const heirCountNow = calculationResult.heirShares.reduce((sum, h) => sum + h.count, 0);
    const hasMapNow = doesSubdivisionHaveGeometry(subdivisionState);
    const unifiedNow = computeUnifiedFarmMetrics(subdivisionState, subdivisionResult, hasMapNow);
    const blocksCountNow = unifiedNow.blocksCount;
    const fullPlotsCountNow = unifiedNow.fullPlotsCount;
    const validHalfPlotsCountNow = unifiedNow.halfPlotsCount;
    const clippedPlotsCountNow = unifiedNow.clippedPlotsCount;

    setSavedCases((prev) =>
      prev.map((c) => {
        if (c.id !== activeCaseId) return c;
        return {
          ...c,
          deceasedName: heirsInput.deceasedName || c.deceasedName,
          deceasedGender: heirsInput.deceasedGender,
          heirsInput: JSON.parse(JSON.stringify(heirsInput)),
          assets: JSON.parse(JSON.stringify(assets)),
          deductions: JSON.parse(JSON.stringify(deductions)),
          currency,
          totalGrossEstateUSD: calculationResult.grossEstateUSD,
          totalNetEstateUSD: calculationResult.netDistributableEstateUSD,
          heirCount: heirCountNow,
          hasMapGeometry: hasMapNow,
          linkedGeometrySourceLabel: hasMapNow
            ? subdivisionState.boundaryFileName ||
              c.linkedGeometrySourceLabel ||
              'Khariidad ku xidhan'
            : 'Khariidad ma laha',
          blocksCount: blocksCountNow,
          fullPlotsCount: fullPlotsCountNow,
          validHalfPlotsCount: validHalfPlotsCountNow,
          clippedPlotsCount: clippedPlotsCountNow,
          landSubdivisionSnapshot: hasMapNow
            ? cloneSubdivisionStateIsolated(subdivisionState)
            : createEmptyLandSubdivisionState(),
        };
      })
    );
  }, [
    activeCaseId,
    heirsInput,
    assets,
    deductions,
    currency,
    calculationResult.grossEstateUSD,
    calculationResult.netDistributableEstateUSD,
    calculationResult.heirShares,
    subdivisionState,
    subdivisionResult,
  ]);

  const activeCase = useMemo(
    () => savedCases.find((c) => c.id === activeCaseId) || null,
    [savedCases, activeCaseId]
  );

  const activeCaseMeta: CaseExportMetadata = useMemo(
    () => ({
      caseName:
        activeCase?.caseName ||
        (heirsInput.deceasedName ? `Kiiska ${heirsInput.deceasedName}` : 'Kiis Dhaxal'),
      referenceNumber: activeCase?.referenceNumber || 'KIIS-REF-0001',
      caseDate: activeCase?.caseDate || new Date().toISOString().slice(0, 10),
      caseStatus: activeCase
        ? CASE_STATUS_METADATA[activeCase.status].labelSomali
        : 'Socda',
    }),
    [activeCase, heirsInput.deceasedName]
  );

  // Per-case Undo & Redo handlers
  const activeUndoHistory = undoHistoriesByCaseId[activeCaseId];
  const canUndo = Boolean(activeUndoHistory && activeUndoHistory.past.length > 0);
  const canRedo = Boolean(activeUndoHistory && activeUndoHistory.future.length > 0);

  const handleUndo = useCallback(() => {
    const history = undoHistoriesByCaseId[activeCaseId];
    if (!history) return;
    const res = performUndo(history);
    if (!res.ok || !res.restoredState || res.restoredState.caseId !== activeCaseId) return;

    skipUndoPushRef.current = true;
    setUndoHistoriesByCaseId((prev) => ({
      ...prev,
      [activeCaseId]: res.nextHistory,
    }));
    setHeirsInput(res.restoredState.heirsInput);
    setAssets(res.restoredState.assets);
    setDeductions(res.restoredState.deductions);
    setCurrency(res.restoredState.currency);
    setSubdivisionState(res.restoredState.subdivisionState);

    showToast(
      `Dib Waa Loo Celiyey · ${activeCaseMeta.referenceNumber}`,
      'Tallaabadii u dambaysay ee kiiskan dib ayaa loo soo celiyey.'
    );
  }, [activeCaseId, activeCaseMeta.referenceNumber, showToast, undoHistoriesByCaseId]);

  const handleRedo = useCallback(() => {
    const history = undoHistoriesByCaseId[activeCaseId];
    if (!history) return;
    const res = performRedo(history);
    if (!res.ok || !res.restoredState || res.restoredState.caseId !== activeCaseId) return;

    skipUndoPushRef.current = true;
    setUndoHistoriesByCaseId((prev) => ({
      ...prev,
      [activeCaseId]: res.nextHistory,
    }));
    setHeirsInput(res.restoredState.heirsInput);
    setAssets(res.restoredState.assets);
    setDeductions(res.restoredState.deductions);
    setCurrency(res.restoredState.currency);
    setSubdivisionState(res.restoredState.subdivisionState);

    showToast(
      `Horay Waa Loo Celiyey · ${activeCaseMeta.referenceNumber}`,
      'Isbeddelkii kiiskan dib ayaa loo fuliyey.'
    );
  }, [activeCaseId, activeCaseMeta.referenceNumber, showToast, undoHistoriesByCaseId]);

  // Keyboard shortcuts for Undo (Ctrl/Cmd+Z) and Redo (Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (canUndo) {
          e.preventDefault();
          handleUndo();
        }
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        if (canRedo) {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canRedo, canUndo, handleRedo, handleUndo]);

  const linkedLandAllocation = subdivisionState.isLinkedToEstate ? fairLandAllocation : null;

  const handleSyncAndLinkSubdivisionToEstate = () => {
    if (!subdivisionResult || subdivisionResult.plots.length === 0) return;
    setSubdivisionState((prev) => ({ ...prev, isLinkedToEstate: true }));
    setAssets((prevAssets) =>
      syncSubdivisionToEstateAssets(
        prevAssets,
        subdivisionResult,
        subdivisionState.blockTiers,
        subdivisionState.plotTierOverrides,
        subdivisionState.tierUnitPrices,
        subdivisionState.plotMetadata,
        subdivisionState.blockMetadata,
        Boolean(subdivisionState.includeValidHalfPlotsInAllocation)
      )
    );
    const divCount = fairLandAllocation?.totalFullPlots ?? subdivisionResult.plots.length;
    const exclCount = fairLandAllocation?.excludedPlotsCount ?? 0;
    showToast(
      'Naqshadda Dhulka Waa Lagu Xidhay Kiiska',
      exclCount > 0
        ? `${divCount} Plot oo la qaybinayo ayaa lagu xidhay ${activeCaseMeta.referenceNumber} (${exclCount} plot waa laga reebay qaybinta).`
        : `${divCount} Plot oo ku firdhisan Zones (A–D) iyo Heerarka (H1–H3) ayaa lagu xidhay ${activeCaseMeta.referenceNumber}.`
    );
  };

  const handleChangeLandAllocationMode = useCallback(
    (mode: LandAllocationMode) => {
      const shouldAutoLinkGis =
        currentHasMap &&
        Boolean(subdivisionResult && subdivisionResult.plots.length > 0) &&
        selectedTargetScope === 'all_farm' &&
        !subdivisionState.isLinkedToEstate;

      setSubdivisionState((prev) => ({
        ...prev,
        allocationMode: mode,
        isLinkedToEstate: shouldAutoLinkGis ? true : prev.isLinkedToEstate,
        approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
        auditHistory: [
          ...prev.auditHistory,
          createAuditEntry(
            'auto_proposal',
            `Habka Qaybinta Dhaxalka waa loo beddelay: ${LAND_ALLOCATION_MODE_METADATA[mode].titleSomali}.`
          ),
        ],
      }));

      if (shouldAutoLinkGis && subdivisionResult) {
        setAssets((prevAssets) =>
          syncSubdivisionToEstateAssets(
            prevAssets,
            subdivisionResult,
            subdivisionState.blockTiers,
            subdivisionState.plotTierOverrides,
            subdivisionState.tierUnitPrices,
            subdivisionState.plotMetadata,
            subdivisionState.blockMetadata,
            Boolean(subdivisionState.includeValidHalfPlotsInAllocation)
          )
        );
      }
    },
    [
      currentHasMap,
      selectedTargetScope,
      subdivisionResult,
      subdivisionState.blockMetadata,
      subdivisionState.blockTiers,
      subdivisionState.includeValidHalfPlotsInAllocation,
      subdivisionState.isLinkedToEstate,
      subdivisionState.plotMetadata,
      subdivisionState.plotTierOverrides,
      subdivisionState.tierUnitPrices,
    ]
  );

  const handleToggleIncludeHalfPlots = useCallback(
    (include: boolean) => {
      const shouldAutoLinkGis =
        currentHasMap &&
        Boolean(subdivisionResult && subdivisionResult.plots.length > 0) &&
        selectedTargetScope === 'all_farm' &&
        !subdivisionState.isLinkedToEstate;

      setSubdivisionState((prev) => ({
        ...prev,
        includeValidHalfPlotsInAllocation: include,
        isLinkedToEstate: shouldAutoLinkGis ? true : prev.isLinkedToEstate,
        approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
        auditHistory: [
          ...prev.auditHistory,
          createAuditEntry(
            'auto_proposal',
            include
              ? 'Half-Plots (0.5 Plot) waa lagu daray qaybinta dhaxalka.'
              : 'Half-Plots (0.5 Plot) waa laga reebay qaybinta dhaxalka.'
          ),
        ],
      }));

      if (shouldAutoLinkGis && subdivisionResult) {
        setAssets((prevAssets) =>
          syncSubdivisionToEstateAssets(
            prevAssets,
            subdivisionResult,
            subdivisionState.blockTiers,
            subdivisionState.plotTierOverrides,
            subdivisionState.tierUnitPrices,
            subdivisionState.plotMetadata,
            subdivisionState.blockMetadata,
            include
          )
        );
      }
    },
    [
      currentHasMap,
      selectedTargetScope,
      subdivisionResult,
      subdivisionState.blockMetadata,
      subdivisionState.blockTiers,
      subdivisionState.isLinkedToEstate,
      subdivisionState.plotMetadata,
      subdivisionState.plotTierOverrides,
      subdivisionState.tierUnitPrices,
    ]
  );

  const handleExportExcel = () => {
    exportInheritanceToExcel(
      calculationResult,
      heirsInput,
      assets,
      deductions,
      currency,
      linkedLandAllocation,
      currentHasMap ? subdivisionResult : null,
      activeCaseMeta
    );
  };

  const handleExportCSV = () => {
    exportInheritanceToCSV(calculationResult, currency);
  };

  const handlePrint = () => {
    setIsCertificateOpen(true);
    window.setTimeout(() => {
      window.print();
    }, 300);
  };

  const handleSelectPreset = (preset: PresetScenario) => {
    setSubdivisionState((prev) => ({ ...prev, isLinkedToEstate: false }));
    setHeirsInput(JSON.parse(JSON.stringify(preset.heirs)));
    setAssets(JSON.parse(JSON.stringify(preset.assets)));
    setDeductions(JSON.parse(JSON.stringify(preset.deductions)));
    showToast(
      'Tusaale Diyaarsan',
      `Waxaa lagu raray kiiska ${activeCaseMeta.referenceNumber}: ${preset.titleSomali}`
    );
  };

  // Switch cleanly to an existing isolated case (preserving per-case Undo isolation)
  const handleSelectSavedCase = (sc: SavedInheritanceCase) => {
    const isolatedSnap = hydrateCaseSubdivisionSnapshot(
      sc.landSubdivisionSnapshot,
      sc.hasMapGeometry
    );
    const nextHeirs = JSON.parse(JSON.stringify(sc.heirsInput)) as HeirsInput;
    const nextAssets = JSON.parse(JSON.stringify(sc.assets)) as EstateAssetItem[];
    const nextDeductions = JSON.parse(JSON.stringify(sc.deductions)) as EstateDeductionItem[];
    const nextCurrency: Currency = sc.currency || currency;

    skipUndoPushRef.current = true;
    setUndoHistoriesByCaseId((prev) => {
      if (prev[sc.id]) return prev;
      return {
        ...prev,
        [sc.id]: createUndoRedoHistory(
          {
            caseId: sc.id,
            heirsInput: nextHeirs,
            assets: nextAssets,
            deductions: nextDeductions,
            currency: nextCurrency,
            subdivisionState: isolatedSnap,
          },
          'Furitaanka Kiiska'
        ),
      };
    });

    setActiveCaseId(sc.id);
    setHeirsInput(nextHeirs);
    setAssets(nextAssets);
    setDeductions(nextDeductions);
    setCurrency(nextCurrency);
    setSubdivisionState(isolatedSnap);
    setActiveDestination('dashboard');
    setDashboardMode('interactive_map');
    showToast(
      `Kiis La Furay · ${sc.referenceNumber}`,
      `Waxaa la furay "${sc.caseName}" (${sc.hasMapGeometry ? 'Khariidad leh' : 'Bilaa khariidad'}).`
    );
  };

  // Create a brand-new isolated case (Mapless by default unless explicitly confirmed!)
  const handleCreateManagedCase = (params: {
    caseName: string;
    referenceNumber: string;
    caseDate: string;
    description: string;
    status: CaseLifecycleStatus;
    deceasedName: string;
    explicitlyConfirmedSubdivision: {
      state: LandSubdivisionState;
      sourceLabel: string;
      blocksCount: number;
      fullPlotsCount: number;
      validHalfPlotsCount: number;
      clippedPlotsCount: number;
    } | null;
  }): { ok: boolean; errorSomali?: string } => {
    const created = createNewManagedCase({
      caseName: params.caseName,
      referenceNumber: params.referenceNumber,
      caseDate: params.caseDate,
      description: params.description,
      status: params.status,
      deceasedName: params.deceasedName,
      currency,
      existingCases: savedCases,
      explicitlyConfirmedSubdivision: params.explicitlyConfirmedSubdivision,
    });

    if (created.ok === false) {
      return { ok: false, errorSomali: created.errorSomali };
    }

    const rec = created.caseRecord;
    const isolatedSub = hydrateCaseSubdivisionSnapshot(
      rec.landSubdivisionSnapshot,
      rec.hasMapGeometry
    );
    const nextHeirs = JSON.parse(JSON.stringify(rec.heirsInput)) as HeirsInput;
    const nextAssets = JSON.parse(JSON.stringify(rec.assets)) as EstateAssetItem[];
    const nextDeductions = JSON.parse(JSON.stringify(rec.deductions)) as EstateDeductionItem[];

    skipUndoPushRef.current = true;
    setUndoHistoriesByCaseId((prev) => ({
      ...prev,
      [rec.id]: createUndoRedoHistory(
        {
          caseId: rec.id,
          heirsInput: nextHeirs,
          assets: nextAssets,
          deductions: nextDeductions,
          currency,
          subdivisionState: isolatedSub,
        },
        'Abuurista Kiiska Cusub'
      ),
    }));

    setSavedCases((prev) => [rec, ...prev]);
    setActiveCaseId(rec.id);
    setHeirsInput(nextHeirs);
    setAssets(nextAssets);
    setDeductions(nextDeductions);
    setSubdivisionState(isolatedSub);

    showToast(
      `Kiis Cusub · ${rec.referenceNumber}`,
      `Kiiska "${rec.caseName}" waa la abuuray (${
        rec.hasMapGeometry ? 'Khariidad la xaqiijiyey' : 'Bilaa khariidad — madax-bannaan'
      }).`
    );
    return { ok: true };
  };

  // Quick "Kiis Cusub" action from child views: creates a clean isolated mapless case
  const handleStartNewIsolatedBlankCase = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const nextRef = generateUniqueCaseReference(savedCases, todayStr);
    const seqNum = savedCases.length + 1;
    handleCreateManagedCase({
      caseName: `Kiis Dhaxal Cusub #${seqNum}`,
      referenceNumber: nextRef,
      caseDate: todayStr,
      description: '',
      status: 'cusub',
      deceasedName: '',
      explicitlyConfirmedSubdivision: null,
    });
    setActiveDestination('list_data');
    setListDataMode('cases');
  };

  // Validated Full App Backup Restore handler (supports Merge & Replace modes)
  const handleConfirmBackupRestore = (payload: {
    hydratedCases: SavedInheritanceCase[];
    activeCaseId: string;
    currency: Currency;
    preview: ValidatedBackupPreview;
    mode?: BackupRestoreMode;
  }) => {
    const restoreMode: BackupRestoreMode = payload.mode || 'replace';
    const nextSavedCases =
      restoreMode === 'merge'
        ? (() => {
            const byIdOrRef = new globalThis.Map<string, SavedInheritanceCase>();
            savedCases.forEach((existing) => {
              byIdOrRef.set(existing.id, existing);
            });
            payload.hydratedCases.forEach((incoming) => {
              const existingMatch = Array.from(byIdOrRef.values()).find(
                (ex) =>
                  ex.id === incoming.id ||
                  (ex.referenceNumber &&
                    incoming.referenceNumber &&
                    ex.referenceNumber.toLowerCase() === incoming.referenceNumber.toLowerCase())
              );
              if (existingMatch && existingMatch.id !== incoming.id) {
                byIdOrRef.delete(existingMatch.id);
              }
              byIdOrRef.set(incoming.id, incoming);
            });
            return Array.from(byIdOrRef.values());
          })()
        : payload.hydratedCases;

    const targetCase =
      nextSavedCases.find((c) => c.id === payload.activeCaseId) ||
      payload.hydratedCases[0] ||
      nextSavedCases[0];
    if (!targetCase) return;

    const restoredSub = hydrateCaseSubdivisionSnapshot(
      targetCase.landSubdivisionSnapshot,
      targetCase.hasMapGeometry
    );
    const nextHeirs = JSON.parse(JSON.stringify(targetCase.heirsInput)) as HeirsInput;
    const nextAssets = JSON.parse(JSON.stringify(targetCase.assets)) as EstateAssetItem[];
    const nextDeductions = JSON.parse(
      JSON.stringify(targetCase.deductions)
    ) as EstateDeductionItem[];
    const nextCurrency: Currency = targetCase.currency || payload.currency;

    skipUndoPushRef.current = true;
    setUndoHistoriesByCaseId((prev) => ({
      ...(restoreMode === 'merge' ? prev : {}),
      [targetCase.id]: createUndoRedoHistory(
        {
          caseId: targetCase.id,
          heirsInput: nextHeirs,
          assets: nextAssets,
          deductions: nextDeductions,
          currency: nextCurrency,
          subdivisionState: restoredSub,
        },
        'Soo-celinta Backup-ka'
      ),
    }));

    setSavedCases(nextSavedCases);
    setActiveCaseId(targetCase.id);
    setHeirsInput(nextHeirs);
    setAssets(nextAssets);
    setDeductions(nextDeductions);
    setCurrency(nextCurrency);
    setSubdivisionState(restoredSub);
    setActiveDestination('dashboard');
    setDashboardMode('interactive_map');

    showToast(
      restoreMode === 'merge'
        ? 'Kiisaskii Waa Lagu Biiriyey'
        : 'Backup-kii Waa La Soo Celiyey',
      restoreMode === 'merge'
        ? `${payload.preview.casesCount} kiis ayaa lagu daray diiwaankaaga (Wadarta hadda: ${nextSavedCases.length} kiis).`
        : `Waxaa si ammaan ah loo soo celiyey ${payload.preview.casesCount} kiis (Kiiska firfircoon: ${targetCase.referenceNumber}).`
    );
  };

  // Save/checkpoint active case & record structured change history
  const handleSaveCurrentCase = () => {
    if (!activeCase) {
      handleStartNewIsolatedBlankCase();
      return;
    }
    const nowIso = new Date().toISOString();
    const heirCountNow = calculationResult.heirShares.reduce((sum, h) => sum + h.count, 0);
    const mapLabelNow = currentHasMap
      ? subdivisionState.boundaryFileName ||
        activeCase.linkedGeometrySourceLabel ||
        'Khariidad ku xidhan'
      : 'Khariidad ma laha';

    const logEntries = buildCaseChangeEntries({
      prevCase: activeCase,
      nextMeta: {
        caseName: activeCase.caseName,
        caseDate: activeCase.caseDate,
        description: activeCase.description || '',
        status: activeCase.status,
      },
      nextHeirCount: heirCountNow,
      nextNetEstateUSD: calculationResult.netDistributableEstateUSD,
      nextHasMap: currentHasMap,
      nextMapLabel: mapLabelNow,
      subdivisionResult: currentHasMap ? subdivisionResult : null,
      reason: 'Kaydin toos ah oo xogta kiiska ah',
    });

    setSavedCases((prev) =>
      prev.map((c) =>
        c.id === activeCase.id
          ? {
              ...c,
              updatedAt: nowIso,
              changeHistory: [...logEntries, ...(c.changeHistory || [])].slice(0, 100),
            }
          : c
      )
    );

    showToast(
      `Kiiska Waa La Kaydiyey · ${activeCase.referenceNumber}`,
      `Isbeddellada kiiska "${activeCase.caseName}" waa la diiwaangeliyey.`
    );
  };

  const handleSaveActiveCaseMetadataUpdates = (params: {
    caseName: string;
    caseDate: string;
    description: string;
    status: CaseLifecycleStatus;
    changeReason?: string;
  }) => {
    if (!activeCase) return;
    const nowIso = new Date().toISOString();
    const heirCountNow = calculationResult.heirShares.reduce((sum, h) => sum + h.count, 0);
    const mapLabelNow = currentHasMap
      ? subdivisionState.boundaryFileName ||
        activeCase.linkedGeometrySourceLabel ||
        'Khariidad ku xidhan'
      : 'Khariidad ma laha';

    const logEntries = buildCaseChangeEntries({
      prevCase: activeCase,
      nextMeta: {
        caseName: params.caseName,
        caseDate: params.caseDate,
        description: params.description,
        status: params.status,
      },
      nextHeirCount: heirCountNow,
      nextNetEstateUSD: calculationResult.netDistributableEstateUSD,
      nextHasMap: currentHasMap,
      nextMapLabel: mapLabelNow,
      subdivisionResult: currentHasMap ? subdivisionResult : null,
      reason: params.changeReason,
    });

    setSavedCases((prev) =>
      prev.map((c) =>
        c.id === activeCase.id
          ? {
              ...c,
              caseName: params.caseName,
              caseDate: params.caseDate,
              description: params.description,
              status: params.status,
              updatedAt: nowIso,
              changeHistory: [...logEntries, ...(c.changeHistory || [])].slice(0, 100),
            }
          : c
      )
    );

    showToast(
      'Xogta Kiiska Waa La Cusbooneysiiyey',
      `${activeCase.referenceNumber} · ${params.caseName} (${CASE_STATUS_METADATA[params.status].labelSomali}).`
    );
  };

  const handleCloseCaseStatus = (caseId: string, reason?: string) => {
    const nowIso = new Date().toISOString();
    setSavedCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;
        const closeEntry = {
          id: `chg_${Date.now()}_close`,
          changedAt: nowIso,
          fieldSomali: 'Xaaladda Kiiska',
          previousValue: CASE_STATUS_METADATA[c.status].labelSomali,
          newValue: CASE_STATUS_METADATA.la_xidhay.labelSomali,
          reason: reason || 'Kiiska si rasmi ah ayaa loo xidhay.',
          caseStatus: 'la_xidhay' as CaseLifecycleStatus,
        };
        return {
          ...c,
          status: 'la_xidhay',
          updatedAt: nowIso,
          changeHistory: [closeEntry, ...(c.changeHistory || [])].slice(0, 100),
        };
      })
    );
    showToast('Kiiska Waa La Xidhay', 'Xaaladda kiisku hadda waa "La xidhay".');
  };

  // Safe per-case delete: never deletes another case's geometry or data
  const handleDeleteSavedCase = (id: string) => {
    setUndoHistoriesByCaseId((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    const remaining = savedCases.filter((c) => c.id !== id);
    if (remaining.length === 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const fallback = createNewManagedCase({
        caseName: 'Kiis Dhaxal Cusub #1',
        referenceNumber: generateUniqueCaseReference([], todayStr),
        caseDate: todayStr,
        status: 'cusub',
        currency,
        existingCases: [],
        explicitlyConfirmedSubdivision: null,
      });
      if (fallback.ok) {
        const emptySub = createEmptyLandSubdivisionState();
        skipUndoPushRef.current = true;
        setUndoHistoriesByCaseId({
          [fallback.caseRecord.id]: createUndoRedoHistory(
            {
              caseId: fallback.caseRecord.id,
              heirsInput: JSON.parse(JSON.stringify(fallback.caseRecord.heirsInput)),
              assets: JSON.parse(JSON.stringify(fallback.caseRecord.assets)),
              deductions: JSON.parse(JSON.stringify(fallback.caseRecord.deductions)),
              currency,
              subdivisionState: emptySub,
            },
            'Bilowga Kiiska'
          ),
        });
        setSavedCases([fallback.caseRecord]);
        setActiveCaseId(fallback.caseRecord.id);
        setHeirsInput(JSON.parse(JSON.stringify(fallback.caseRecord.heirsInput)));
        setAssets(JSON.parse(JSON.stringify(fallback.caseRecord.assets)));
        setDeductions(JSON.parse(JSON.stringify(fallback.caseRecord.deductions)));
        setSubdivisionState(emptySub);
      }
    } else {
      setSavedCases(remaining);
      if (id === activeCaseId) {
        const nextActive = remaining[0];
        const nextSub = hydrateCaseSubdivisionSnapshot(
          nextActive.landSubdivisionSnapshot,
          nextActive.hasMapGeometry
        );
        skipUndoPushRef.current = true;
        setActiveCaseId(nextActive.id);
        setHeirsInput(JSON.parse(JSON.stringify(nextActive.heirsInput)));
        setAssets(JSON.parse(JSON.stringify(nextActive.assets)));
        setDeductions(JSON.parse(JSON.stringify(nextActive.deductions)));
        if (nextActive.currency) setCurrency(nextActive.currency);
        setSubdivisionState(nextSub);
      }
    }
    showToast(
      'Kiiska Waa La Tirtiray',
      'Kiiskii la doortay oo keliya ayaa si ammaan ah loo saaray.'
    );
  };

  // Explicit user-confirmed reuse of geometry from another saved case
  const handleExplicitLinkGeometryFromCase = (sourceCase: SavedInheritanceCase) => {
    if (!sourceCase.landSubdivisionSnapshot || !sourceCase.hasMapGeometry) return;
    const cloned = cloneSubdivisionStateIsolated(
      hydrateCaseSubdivisionSnapshot(sourceCase.landSubdivisionSnapshot, sourceCase.hasMapGeometry)
    );
    cloned.manualPlotHeirOverrides = {};
    cloned.isLinkedToEstate = false;
    cloned.approvalStatus = 'draft_proposal';
    cloned.approvedBy = undefined;
    cloned.approvedAt = undefined;
    cloned.boundaryFileName = `${
      sourceCase.linkedGeometrySourceLabel || cloned.boundaryFileName || 'Khariidad'
    } (Nuqul ka yimid ${sourceCase.referenceNumber})`;
    cloned.auditHistory = [
      createAuditEntry(
        'geojson_import',
        `Geometry si cad loo xaqiijiyey ayaa laga soo nuqulay kiiska ${sourceCase.referenceNumber} (${sourceCase.caseName}).`
      ),
      ...(cloned.auditHistory || []),
    ];

    setSubdivisionState(cloned);

    if (activeCase) {
      const nowIso = new Date().toISOString();
      setSavedCases((prev) =>
        prev.map((c) =>
          c.id === activeCase.id
            ? {
                ...c,
                updatedAt: nowIso,
                changeHistory: [
                  {
                    id: `chg_${Date.now()}_geom`,
                    changedAt: nowIso,
                    fieldSomali: 'Khariidadda Ku Xidhan',
                    previousValue: c.hasMapGeometry
                      ? c.linkedGeometrySourceLabel || 'Khariidad'
                      : 'Khariidad ma laha',
                    newValue: `Nuqul madax-bannaan oo laga soo qaatay ${sourceCase.referenceNumber}`,
                    reason:
                      'Isticmaaluhu si cad ayuu u doortay una xaqiijiyey dib-u-adeegsiga geometry-ga.',
                    caseStatus: c.status,
                  },
                  ...(c.changeHistory || []),
                ].slice(0, 100),
              }
            : c
        )
      );
    }

    showToast(
      'Geometry Si Cad Loo Xaqiijiyey Waa La Xidhay',
      `Nuqul madax-bannaan oo ka yimid ${sourceCase.referenceNumber} ayaa lagu xidhay ${activeCaseMeta.referenceNumber}.`
    );
  };

  // Reset only current case's calculator inputs (preserving case identity & reference number)
  const handleResetCurrentCaseInputs = () => {
    setSubdivisionState((prev) => ({
      ...prev,
      isLinkedToEstate: false,
      manualPlotHeirOverrides: {},
      approvalStatus: 'draft_proposal',
      approvedBy: undefined,
      approvedAt: undefined,
    }));
    setHeirsInput({ ...EMPTY_HEIRS_INPUT, heirNames: {} });
    setAssets([
      {
        id: 'quick_money_1',
        category: 'cash',
        title: 'Wadarta Lacagta Dhaxalka',
        quantity: 1,
        unit: currency,
        estimatedValueUSD: 0,
      },
    ]);
    setDeductions([]);
    showToast(
      'Xogta Kiiska Hadda Waa La Nadiifiyey',
      `Foomka kiiska ${activeCaseMeta.referenceNumber} dib ayaa loo bilaabay.`
    );
  };

  // Explicit user-confirmed Sample Farm load (mirrors `useSample()` in Naqshadeeyaha_Blocks_Plots_v2.html)
  const handleLoadSampleFarmForActiveCase = () => {
    setSubdivisionState((prev) => {
      const next = applyHtmlUseSample(prev);
      next.isLinkedToEstate = false;
      next.auditHistory = [
        createAuditEntry(
          'geojson_import',
          `Xogta tusaalaha (Beerta xuduudka + Block tusaale) ayaa lagu raray kiiska ${activeCaseMeta.referenceNumber}.`
        ),
        ...(next.auditHistory || []).slice(0, 49),
      ];
      return next;
    });
    showToast(
      'Xogta Tusaalaha Waa La Furay',
      'Xuduudka beerta iyo block-ka tusaalaha waa la soo raray (48×90m Blocks & 18×24m Plots).'
    );
  };

  // Direct HTML-style 3-slot GeoJSON / KML import (`Slot 'B'` = Xuduudka, `Slot 'S'` = Block tusaale, `Slot 'A'` = Aag gaar ah)
  const handleHtmlGeoJsonSlotUpload = async (file: File, slot: HtmlGeoJsonSlot) => {
    if (!file) return;
    try {
      const normalized = await readAndNormalizeGisFile(file);
      if (normalized.ok === false) {
        showToast('Khalad Faylka GeoJSON / KML', normalized.errorSomali);
        return;
      }
      const parsed = normalized.rawJson;
      const fileName = normalized.fileName;
      const preview = applyHtmlGeoJsonSlotImport(subdivisionState, parsed, fileName, slot);
      if (preview.ok === false) {
        showToast('Khalad Faylka GeoJSON / KML', preview.errorSomali);
        return;
      }

      setSubdivisionState((prev) => {
        const applied = applyHtmlGeoJsonSlotImport(prev, parsed, fileName, slot);
        return applied.ok ? applied.nextState : prev;
      });

      const slotTitle =
        slot === 'B'
          ? 'Xuduudka Beerta Waa La Soo Geliyey'
          : slot === 'S'
          ? 'Block Tusaale Ah Waa La Soo Geliyey'
          : slot === 'W'
          ? 'Dooxyada Waa La Soo Geliyey'
          : slot === 'R'
          ? 'Waddada Magaalada Waa La Soo Geliyey'
          : 'Aag Gaar Ah Waa La Soo Geliyey';
      showToast(slotTitle, preview.summarySomali);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Khalad Faylka GIS';
      showToast(
        'Khalad Faylka GeoJSON / KML',
        `File-ka lama akhrin karo: ${msg}. Isticmaal GeoJSON (.geojson) ama KML (.kml/.kmz) sax ah.`
      );
    }
  };

  const handleSelectBoundaryIndex = (idx: number) => {
    setSubdivisionState((prev) => applyHtmlBoundarySelectionChange(prev, idx));
  };

  const handleSelectSampleIndex = (idx: number) => {
    setSubdivisionState((prev) => ({
      ...prev,
      prebuiltSubdivision: null,
      selectedSampleIndex: idx,
      approvalStatus: prev.approvalStatus === 'approved' ? 'under_review' : prev.approvalStatus,
    }));
  };

  // Multi-file or single-file GeoJSON / KML / KMZ upload from Dashboard / Dropzone:
  const handleGeoJsonFilesUploadFromDashboard = async (files: File[]) => {
    if (!files || files.length === 0) return;

    try {
      const sources: { fileName: string; rawJson: unknown }[] = [];
      for (const f of files) {
        const normalized = await readAndNormalizeGisFile(f);
        if (normalized.ok === false) {
          showToast('Khalad Faylka GeoJSON / KML', normalized.errorSomali);
          return;
        }
        sources.push({ fileName: normalized.fileName, rawJson: normalized.rawJson });
      }

      const isCoLocatedQgisOverlay =
        Boolean(subdivisionState.prebuiltSubdivision) &&
        files.every((f) => /^(01|02|03|05)[_-]|blocks|plots/i.test(f.name));

      if (!isCoLocatedQgisOverlay) {
        const batchRes = importSimultaneousFarmGeoJsonFiles(subdivisionState, sources);
        if (batchRes && !batchRes.isPrebuiltPackage) {
          setSubdivisionState((prev) => {
            const applied = importSimultaneousFarmGeoJsonFiles(prev, sources);
            return applied && !applied.isPrebuiltPackage ? applied.nextState : prev;
          });
          showToast('Faylasha GIS (GeoJSON/KML) Waa La Soo Geliyey', batchRes.summarySomali);
          return;
        }
      }

      const multiCheck = inspectMultipleGeoJsonUploads(sources);
      if (multiCheck.allItems.length === 0) {
        showToast(
          'GeoJSON Lama Akhrin Karo',
          'File-ka lama akhrin karo: Geometry ma jirto. Isticmaal GeoJSON sax ah.'
        );
        return;
      }

      const fileLabel =
        files.length === 1
          ? files[0].name
          : `${files[0].name} (+${files.length - 1} fayl)`;

      setSubdivisionState((prev) => {
        const merged = mergeCoLocatedPrebuiltLayers(
          prev.prebuiltSubdivision,
          prev.wadiItems,
          multiCheck
        );

        if (merged.mergedPrebuilt && merged.mergedPrebuilt.plots.length > 0) {
          const prebuilt = merged.mergedPrebuilt;
          const tempSub = computeLandSubdivision(null, null, prev.params, prebuilt);
          const nextBlockTiers: LandSubdivisionState['blockTiers'] = {};
          const nextPlotMeta: LandSubdivisionState['plotMetadata'] = {
            ...(merged.wasLayerMerged ? prev.plotMetadata : {}),
          };

          if (tempSub) {
            const carto = computeFarmCartographicReport(
              tempSub,
              merged.mergedWadiItems,
              prebuilt
            );
            if (carto) {
              Object.entries(carto.blockHeerById).forEach(([bid, heer]) => {
                nextBlockTiers[bid] =
                  heer === 3
                    ? 'tier_1_prime'
                    : heer === 2
                    ? 'tier_2_standard'
                    : 'tier_3_basic';
              });
              Object.values(carto.plotProfilesById).forEach((prof) => {
                if (prof.isDoox || prof.namedCategory) {
                  nextPlotMeta[prof.plotId] = {
                    ...(nextPlotMeta[prof.plotId] || {}),
                    plotId: prof.plotId,
                    blockId: prof.blockId,
                    wadiStatus: prof.isDoox ? 'cuts_through' : 'none',
                    siteQuality:
                      prof.blockHeer === 3
                        ? 'good'
                        : prof.blockHeer === 2
                        ? 'medium'
                        : 'poor',
                    ...(prof.namedCategory === 'Danguud'
                      ? {
                          isExcludedFromDivision: true,
                          excludedSpecialName: 'Danguud',
                        }
                      : prof.namedCategory
                      ? {
                          parcelNumberOrName: prof.namedCategory,
                        }
                      : {}),
                  };
                }
              });
            }
          }

          const nextBoundaryItems = multiCheck.boundaryItem
            ? [multiCheck.boundaryItem]
            : prev.boundaryItems.length > 0 && merged.wasLayerMerged
            ? prev.boundaryItems
            : multiCheck.allItems;

          return {
            ...prev,
            prebuiltSubdivision: prebuilt,
            boundaryItems: nextBoundaryItems,
            wadiItems: merged.mergedWadiItems,
            boundaryFileName: `${prebuilt.sourceFileName} (${prebuilt.plots.length} Plots · ${prebuilt.blocks.length} Blocks)`,
            selectedBoundaryIndex: 0,
            blockTiers:
              Object.keys(nextBlockTiers).length > 0 ? nextBlockTiers : prev.blockTiers,
            plotMetadata: nextPlotMeta,
            manualPlotHeirOverrides: merged.wasLayerMerged
              ? prev.manualPlotHeirOverrides
              : {},
            approvalStatus: 'draft_proposal',
            auditHistory: [
              createAuditEntry(
                'geojson_import',
                `GeoJSON waa la soo galiyey (${fileLabel}): ${prebuilt.plots.length} Plot, ${prebuilt.blocks.length} Block${
                  multiCheck.wasReprojectedFromUtm ? ' [EPSG:32638 -> WGS84]' : ''
                }.`
              ),
              ...(prev.auditHistory || []).slice(0, 49),
            ],
          };
        }

        const htmlFallback = applyHtmlGeoJsonSlotImport(
          prev,
          sources[0].rawJson,
          fileLabel,
          'B'
        );
        return htmlFallback.ok ? htmlFallback.nextState : prev;
      });

      showToast(
        'Khariidadda GeoJSON Waa La Furay',
        multiCheck.prebuiltSubdivision
          ? `${multiCheck.prebuiltSubdivision.plots.length} Plot & ${multiCheck.prebuiltSubdivision.blocks.length} Block (${multiCheck.detectedCrs}) si sax ah ayaa loo furay.`
          : `Lakabka "${fileLabel}" si guul leh ayaa loogu daray khariidadda.`
      );
    } catch {
      showToast(
        'Khalad Faylka GeoJSON',
        'Faylka lama akhrin karo — hubi inuu yahay GeoJSON sax ah.'
      );
    }
  };

  const handleQuickGeoJsonUploadFromDashboard = (file: File) => {
    void handleHtmlGeoJsonSlotUpload(file, 'B');
  };

  const currentHeirCount = calculationResult.heirShares.reduce((s, h) => s + h.count, 0);
  const unifiedFarmMetrics = useMemo(
    () => computeUnifiedFarmMetrics(subdivisionState, subdivisionResult, currentHasMap),
    [subdivisionState, subdivisionResult, currentHasMap]
  );
  const currentPlotsCount = unifiedFarmMetrics.fullPlotsCount;
  const currentHalfPlotsCount = unifiedFarmMetrics.halfPlotsCount;

  const sectionTitle =
    activeDestination === 'dashboard'
      ? 'Beerta & Dhaxalka'
      : activeDestination === 'calculate'
      ? 'Xisaabi Dhaxalka'
      : activeDestination === 'list_data'
      ? 'Xogta & Kiisaska'
      : 'Soo saar & Daabacaad';

  const sectionSubtitle =
    activeDestination === 'dashboard'
      ? 'Maaraynta Beerta & GIS'
      : activeDestination === 'calculate'
      ? `${activeCaseMeta.referenceNumber} · Faraa'idka`
      : activeDestination === 'list_data'
      ? `${savedCases.length} Kiis · ${currentPlotsCount} Buuxa`
      : `${currentPlotsCount} Buuxa · ${currentHalfPlotsCount} Half`;

  // SCREEN 1: FULL-SCREEN WELCOME / SPLASH VIEW
  if (showWelcomeSplash) {
    return (
      <WelcomeSplashView
        savedCasesCount={savedCases.length}
        plotsCount={currentPlotsCount}
        onStart={() => handleDismissWelcomeSplash('dashboard')}
        onOpenCalculatorDirectly={() => handleDismissWelcomeSplash('calculate')}
      />
    );
  }

  const isFullBleedMapActive =
    activeDestination === 'dashboard' && dashboardMode === 'interactive_map';

  return (
    <div className="w-full min-w-0 max-w-full min-h-screen bg-[#060d18] text-[#e8eef7] flex flex-col lg:flex-row font-sans selection:bg-[#22c55e]/30 overflow-x-clip">
      {/* OFFLINE STATUS BANNER */}
      <OfflineIndicator />

      {/* TOAST NOTIFICATION (Dark Navy & Emerald) */}
      {notification && (
        <div className="fixed top-16 lg:top-5 right-4 z-50 max-w-sm w-[calc(100%-2rem)] bg-[#111b2e] border border-[#223250] rounded-2xl shadow-2xl p-3.5 flex items-start gap-3 no-print">
          <div className="w-8 h-8 rounded-xl bg-[#22c55e]/15 text-[#22c55e] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-[#e8eef7]">{notification.title}</h4>
            <p className="text-xs text-[#a9b8d0] mt-0.5 leading-relaxed">{notification.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-[#a9b8d0] hover:text-[#e8eef7] p-1 cursor-pointer"
            aria-label="Xidh ogeysiiska"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SCREEN 3: SLIDE-OVER MOBILE DRAWER + DESKTOP RAIL */}
      <NavigationDrawer
        isOpen={isDrawerOpen}
        activeDestination={activeDestination}
        dashboardSubMode={dashboardMode}
        activeCase={activeCase}
        savedCasesCount={savedCases.length}
        currentPlotsCount={currentPlotsCount}
        currentHalfPlotsCount={currentHalfPlotsCount}
        currentBoundaryAreaSqM={unifiedFarmMetrics.boundaryAreaSqM}
        currentAllPlotsAreaSqM={unifiedFarmMetrics.allPlotsAreaSqM}
        currentHasMap={currentHasMap}
        currency={currency}
        onClose={() => setIsDrawerOpen(false)}
        onSelectDestination={(dest) => {
          setActiveDestination(dest);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onSelectDashboardSubMode={(mode) => {
          setDashboardMode(mode);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onChangeCurrency={setCurrency}
        onOpenQuickCasesModal={() => setIsSavedCasesOpen(true)}
        onOpenPresetsModal={() => setIsPresetsOpen(true)}
        onOpenQuranicModal={() => setIsQuranicOpen(true)}
        onOpenBackupRestoreModal={() => setIsBackupRestoreOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenWelcomeSplash={() => setShowWelcomeSplash(true)}
      />

      {/* MAIN WORKSPACE COLUMN */}
      <div
        className={`flex-1 flex flex-col min-w-0 ${
          isCertificateOpen || cartoPdfModal.isOpen ? 'no-print' : ''
        }`}
      >
        <MobileTopAppBar
          activeDestination={activeDestination}
          sectionTitle={sectionTitle}
          sectionSubtitle={sectionSubtitle}
          caseReference={activeCaseMeta.referenceNumber}
          caseName={activeCaseMeta.caseName}
          caseStatusLabel={activeCaseMeta.caseStatus || 'Socda'}
          canUndo={canUndo}
          canRedo={canRedo}
          undoLabel={activeUndoHistory?.present.actionLabelSomali}
          redoLabel={activeUndoHistory?.future[0]?.actionLabelSomali}
          currency={currency}
          showBackButton={activeDestination === 'calculate' && calculateMode === 'results'}
          onBack={() => setCalculateMode('calculator')}
          onOpenDrawer={() => setIsDrawerOpen(true)}
          onOpenWelcomeSplash={() => setShowWelcomeSplash(true)}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onChangeCurrency={setCurrency}
          onOpenExportModal={() => setIsExportModalOpen(true)}
          onOpenBackupRestore={() => setIsBackupRestoreOpen(true)}
        />

        {/* Contextual Workspace Mode Bar (Dashboard sub-modes only — E14 removes duplicate Calculate sub-header) */}
        {activeDestination === 'dashboard' && (
          <div
            className={`border-b border-[#223250] bg-[#0a1220]/90 px-4 sm:px-6 lg:px-8 py-2 no-print ${
              isFullBleedMapActive ? 'hidden lg:block' : ''
            }`}
          >
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#111b2e] border border-[#223250] overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setDashboardMode('interactive_map')}
                  className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    dashboardMode === 'interactive_map'
                      ? 'bg-[#22c55e] text-[#060d18]'
                      : 'text-[#a9b8d0] hover:text-[#e8eef7]'
                  }`}
                >
                  <Map className="w-3.5 h-3.5 shrink-0" />
                  <span>Khariidad</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardMode('cad_designer')}
                  className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    dashboardMode === 'cad_designer'
                      ? 'bg-[#22c55e] text-[#060d18]'
                      : 'text-[#a9b8d0] hover:text-[#e8eef7]'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5 shrink-0" />
                  <span>Naqshadeeyaha</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardMode('overview')}
                  className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    dashboardMode === 'overview'
                      ? 'bg-[#22c55e] text-[#060d18]'
                      : 'text-[#a9b8d0] hover:text-[#e8eef7]'
                  }`}
                >
                  <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
                  <span>Dulmarka</span>
                </button>
              </div>

              {/* Inline Contextual Summary Metadata */}
              <div className="hidden md:flex items-center gap-2 text-xs text-[#a9b8d0] font-mono tabular-nums">
                <span>{currentHeirCount} Dhaxle</span>
                <span aria-hidden="true">·</span>
                <span>
                  {currentHasMap
                    ? `${currentPlotsCount} Buuxa · ${currentHalfPlotsCount} Half · ${Math.round(
                        unifiedFarmMetrics.allPlotsAreaSqM
                      ).toLocaleString()} m²`
                    : 'Bilaa khariidad'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace Content */}
        <main
          className={
            isFullBleedMapActive
              ? 'flex-1 w-full min-w-0 max-w-full relative pb-16 lg:pb-0'
              : 'flex-1 w-full min-w-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 pb-24 lg:pb-10'
          }
        >
          {/* 1A. SCREEN 2 & SCREEN 6: INTERACTIVE GIS MAP DASHBOARD (OSM + SATELLITE + OFFLINE) */}
          {activeDestination === 'dashboard' && dashboardMode === 'interactive_map' && (
            <InteractiveGisMapDashboard
              currentHasMap={currentHasMap}
              subdivisionState={subdivisionState}
              subdivisionResult={subdivisionResult}
              fairAllocation={fairLandAllocation}
              savedCases={savedCases}
              selectedTargetScope={selectedTargetScope}
              onSelectTargetScope={setSelectedTargetScope}
              onSelectSavedCase={handleSelectSavedCase}
              onLoadSampleFarmForActiveCase={handleLoadSampleFarmForActiveCase}
              onUploadGeoJsonFile={handleQuickGeoJsonUploadFromDashboard}
              onUploadGeoJsonFiles={handleGeoJsonFilesUploadFromDashboard}
              onUploadHtmlGeoJsonSlot={handleHtmlGeoJsonSlotUpload}
              onSelectBoundaryIndex={handleSelectBoundaryIndex}
              onSelectSampleIndex={handleSelectSampleIndex}
              onUpdateSubdivisionState={setSubdivisionState}
              onOpenCartographicPdfModal={(mode) =>
                setCartoPdfModal({ isOpen: true, mode })
              }
              onOpenAdvancedCadStudio={() => setDashboardMode('cad_designer')}
              onOpenPlotInListData={(plotId) => {
                setMapInspectedPlotId(plotId);
                setActiveDestination('list_data');
                setListDataMode('plots');
              }}
              onProceedToCalculateWithSelection={(scope) => {
                setSelectedTargetScope(scope);
                if (
                  !subdivisionState.isLinkedToEstate &&
                  subdivisionResult &&
                  subdivisionResult.plots.length > 0
                ) {
                  handleSyncAndLinkSubdivisionToEstate();
                }
                setActiveDestination('calculate');
                setCalculateMode('calculator');
              }}
              onVisiblePlotsChange={handleVisiblePlotsChange}
              hasExternalOverlayOpen={Boolean(
                isDrawerOpen ||
                  isExportModalOpen ||
                  cartoPdfModal.isOpen ||
                  isBackupRestoreOpen ||
                  isHeirConfigOpen ||
                  isAssetsConfigOpen ||
                  isPresetsOpen ||
                  isCertificateOpen ||
                  isQuranicOpen ||
                  isSavedCasesOpen
              )}
              onNotify={showToast}
            />
          )}

          {/* 1B. ENGINEERING CAD STUDIO & SUBDIVISION PARAMETERS */}
          {activeDestination === 'dashboard' && dashboardMode === 'cad_designer' && (
            <BlocksAndPlotsDesignerView
              subdivisionState={subdivisionState}
              subdivisionResult={subdivisionResult}
              fairAllocation={fairLandAllocation}
              inheritanceResult={calculationResult}
              heirsInput={heirsInput}
              currency={currency}
              activeCaseMeta={activeCaseMeta}
              savedCasesForGeometryLink={savedCases.filter(
                (c) => c.id !== activeCaseId && c.hasMapGeometry
              )}
              onExplicitLinkGeometryFromCase={handleExplicitLinkGeometryFromCase}
              onUploadGeoJsonFiles={handleGeoJsonFilesUploadFromDashboard}
              onUploadHtmlGeoJsonSlot={handleHtmlGeoJsonSlotUpload}
              onSelectBoundaryIndex={handleSelectBoundaryIndex}
              onSelectSampleIndex={handleSelectSampleIndex}
              onOpenCartographicPdfModal={(mode) =>
                setCartoPdfModal({ isOpen: true, mode })
              }
              onUpdateSubdivisionState={setSubdivisionState}
              onSyncAndLinkToEstate={handleSyncAndLinkSubdivisionToEstate}
              onUpdateHeirsInput={setHeirsInput}
              onNavigateToResults={() => {
                if (
                  !subdivisionState.isLinkedToEstate &&
                  subdivisionResult &&
                  subdivisionResult.plots.length > 0
                ) {
                  handleSyncAndLinkSubdivisionToEstate();
                }
                navigateLegacyTab('results');
              }}
              onNavigateToCalculator={() => navigateLegacyTab('calculator')}
              onBackToInteractiveMap={() => setDashboardMode('interactive_map')}
              onNotify={showToast}
            />
          )}

          {/* 1C. CASE OVERVIEW DASHBOARD */}
          {activeDestination === 'dashboard' && dashboardMode === 'overview' && (
            <DashboardView
              assets={assets}
              result={calculationResult}
              heirsInput={heirsInput}
              currency={currency}
              savedCases={savedCases}
              activeCase={activeCase}
              linkedLandAllocation={linkedLandAllocation}
              onUpdateHeirsInput={setHeirsInput}
              onNavigateTab={(tab) => navigateLegacyTab(tab as LegacyTab)}
              onStartNewBlankCase={handleStartNewIsolatedBlankCase}
              onOpenAssetsModal={() => setIsAssetsConfigOpen(true)}
              onOpenPresetsModal={() => setIsPresetsOpen(true)}
              onOpenQuranicModal={() => setIsQuranicOpen(true)}
              onPrintCertificate={() => setIsCertificateOpen(true)}
              onExportExcel={handleExportExcel}
              onSelectSavedCase={handleSelectSavedCase}
              onDeleteSavedCase={handleDeleteSavedCase}
            />
          )}

          {/* 2. SCREEN 5: CALCULATE DHAXALKA DESTINATION */}
          {activeDestination === 'calculate' && calculateMode === 'calculator' && (
            <SimpleApkCalculatorView
              heirsInput={heirsInput}
              assets={assets}
              deductions={deductions}
              currency={currency}
              linkedLandAllocation={linkedLandAllocation}
              allocationMode={subdivisionState.allocationMode}
              onChangeAllocationMode={handleChangeLandAllocationMode}
              includeValidHalfPlots={Boolean(subdivisionState.includeValidHalfPlotsInAllocation)}
              onToggleIncludeHalfPlots={handleToggleIncludeHalfPlots}
              subdivisionResult={currentHasMap ? subdivisionResult : null}
              currentHasMap={currentHasMap}
              selectedTargetScope={selectedTargetScope}
              onSelectTargetScope={setSelectedTargetScope}
              onSyncFullFarmGis={handleSyncAndLinkSubdivisionToEstate}
              onChangeCurrency={setCurrency}
              onUpdateHeirs={setHeirsInput}
              onUpdateAssets={(nextAssets) => {
                const stillHasGis = nextAssets.some((a) => a.id.startsWith('gis_subdivision_'));
                if (!stillHasGis && subdivisionState.isLinkedToEstate) {
                  setSubdivisionState((prev) => ({ ...prev, isLinkedToEstate: false }));
                }
                setAssets(nextAssets);
              }}
              onUpdateDeductions={setDeductions}
              onOpenDetailedAssetsModal={() => setIsAssetsConfigOpen(true)}
              onOpenLandDesigner={() => navigateLegacyTab('land_designer')}
              onCalculateAndViewResults={() => navigateLegacyTab('results')}
              onSaveCaseRecord={handleSaveCurrentCase}
              onClearCase={handleResetCurrentCaseInputs}
            />
          )}

          {activeDestination === 'calculate' && calculateMode === 'results' && (
            <ApkResultsAndNamesView
              assets={assets}
              result={calculationResult}
              heirsInput={heirsInput}
              currency={currency}
              linkedLandAllocation={linkedLandAllocation}
              allocationMode={subdivisionState.allocationMode}
              onChangeAllocationMode={handleChangeLandAllocationMode}
              includeValidHalfPlots={Boolean(subdivisionState.includeValidHalfPlotsInAllocation)}
              onToggleIncludeHalfPlots={handleToggleIncludeHalfPlots}
              onUpdateHeirsInput={setHeirsInput}
              onBackToCalculator={() => navigateLegacyTab('calculator')}
              onOpenAssetsModal={() => setIsAssetsConfigOpen(true)}
              onOpenLandDesigner={() => navigateLegacyTab('land_designer')}
              onSaveCaseRecord={handleSaveCurrentCase}
              onPrintCertificate={() => setIsCertificateOpen(true)}
              onPrintInheritanceMapPdf={
                currentHasMap && subdivisionResult
                  ? () => setCartoPdfModal({ isOpen: true, mode: 'inheritance_map' })
                  : undefined
              }
              onExportExcel={handleExportExcel}
            />
          )}

          {/* 3. SCREEN 7 & SCREEN 8: LIST DATA DESTINATION */}
          {activeDestination === 'list_data' && (
            <ListDataView
              activeCategory={listDataMode}
              onChangeCategory={setListDataMode}
              savedCases={savedCases}
              activeCase={activeCase}
              heirsInput={heirsInput}
              assets={assets}
              deductions={deductions}
              result={calculationResult}
              currency={currency}
              currentHasMap={currentHasMap}
              subdivisionState={subdivisionState}
              subdivisionResult={subdivisionResult}
              fairLandAllocation={fairLandAllocation}
              onUpdateHeirsInput={setHeirsInput}
              onOpenCase={handleSelectSavedCase}
              onCreateNewCase={handleCreateManagedCase}
              onSaveActiveCaseUpdates={handleSaveActiveCaseMetadataUpdates}
              onCloseCaseStatus={handleCloseCaseStatus}
              onDeleteCaseSafely={handleDeleteSavedCase}
              onNavigateToCalculator={() => navigateLegacyTab('calculator')}
              onNavigateToResults={() => navigateLegacyTab('results')}
              onNavigateToLandDesigner={() => navigateLegacyTab('land_designer')}
              onOpenHeirsModal={() => setIsHeirConfigOpen(true)}
              onOpenAssetsModal={() => setIsAssetsConfigOpen(true)}
              onStartNewBlankCase={handleStartNewIsolatedBlankCase}
              onExportExcel={handleExportExcel}
              onExportCSV={handleExportCSV}
              onPrintCertificate={() => setIsCertificateOpen(true)}
              inspectedPlotIdFromMap={mapInspectedPlotId}
              onClearInspectedPlotFromMap={() => setMapInspectedPlotId(null)}
            />
          )}

          {/* 4. DEDICATED EXPORT & PRINT LAYOUT HUB (④ Soo saar — E17, E8, E10, E11) */}
          {activeDestination === 'export' && (
            <ExportHubView
              visibleCount={
                mapVisibleStats.totalCount > 0 ? mapVisibleStats.visibleCount : currentPlotsCount
              }
              totalCount={
                mapVisibleStats.totalCount > 0 ? mapVisibleStats.totalCount : currentPlotsCount
              }
              visiblePlotIds={mapVisibleStats.visibleIds}
              subdivisionState={subdivisionState}
              subdivisionResult={currentHasMap ? subdivisionResult : null}
              fairAllocation={fairLandAllocation}
              activeCaseMeta={activeCaseMeta}
              onExportLayoutPdf={() => setIsCertificateOpen(true)}
              onOpenCartographicPdfModal={(mode) =>
                setCartoPdfModal({ isOpen: true, mode })
              }
              onExportExcelWorkbook={handleExportExcel}
              onExportInheritanceCsv={handleExportCSV}
              onOpenBackupRestore={() => setIsBackupRestoreOpen(true)}
              onNotify={showToast}
            />
          )}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR (Khariidad | Xisaabi | Xogta) */}
      <MobileBottomNav
        activeDestination={activeDestination}
        onSelectDestination={(dest) => {
          setActiveDestination(dest);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* SCREEN 4: UNIFIED EXPORT OPTIONS SHEET / MODAL */}
      <ExportOptionsModal
        isOpen={isExportModalOpen}
        visibleCount={
          mapVisibleStats.totalCount > 0 ? mapVisibleStats.visibleCount : currentPlotsCount
        }
        totalCount={mapVisibleStats.totalCount > 0 ? mapVisibleStats.totalCount : currentPlotsCount}
        visiblePlotIds={mapVisibleStats.visibleIds}
        subdivisionState={subdivisionState}
        subdivisionResult={currentHasMap ? subdivisionResult : null}
        fairAllocation={fairLandAllocation}
        activeCaseMeta={activeCaseMeta}
        onClose={() => setIsExportModalOpen(false)}
        onExportLayoutPdf={() => setIsCertificateOpen(true)}
        onOpenCartographicPdfModal={(mode) =>
          setCartoPdfModal({ isOpen: true, mode })
        }
        onExportExcelWorkbook={handleExportExcel}
        onExportInheritanceCsv={handleExportCSV}
        onNotify={showToast}
      />

      {/* CARTOGRAPHIC PDF MODAL (Khariidadda Dhaxalka PDF, Automatic_Layout11 & 4-Page Warbixinta Heerarka Beerta) */}
      {currentHasMap && subdivisionResult && (
        <FarmCartographicPdfModal
          isOpen={cartoPdfModal.isOpen}
          initialMode={cartoPdfModal.mode}
          onClose={() => setCartoPdfModal((prev) => ({ ...prev, isOpen: false }))}
          subdivisionResult={subdivisionResult}
          subdivisionState={subdivisionState}
          fairAllocation={fairLandAllocation}
          activeCaseMeta={activeCaseMeta}
          deceasedName={heirsInput.deceasedName}
          prebuiltSubdivision={subdivisionState.prebuiltSubdivision}
          wadiLinesLonLat={
            subdivisionState.prebuiltSubdivision?.wadiLinesLonLat &&
            subdivisionState.prebuiltSubdivision.wadiLinesLonLat.length > 0
              ? subdivisionState.prebuiltSubdivision.wadiLinesLonLat
              : (subdivisionState.wadiItems || []).map((w) => ({
                  name: w.name,
                  coords: w.coords,
                }))
          }
        />
      )}

      {/* SHARED MODALS */}
      <BackupRestoreModal
        isOpen={isBackupRestoreOpen}
        savedCases={savedCases}
        activeCaseId={activeCaseId}
        currency={currency}
        onClose={() => setIsBackupRestoreOpen(false)}
        onConfirmRestore={handleConfirmBackupRestore}
      />

      <HeirConfigModal
        isOpen={isHeirConfigOpen}
        onClose={() => setIsHeirConfigOpen(false)}
        input={heirsInput}
        onSave={(updated) => {
          setHeirsInput(updated);
          showToast('Dhaxlayaasha Waa La Keydiyey', 'Xogta ehelka waa la cusbooneysiiyey.');
        }}
      />

      <AssetsConfigModal
        isOpen={isAssetsConfigOpen}
        onClose={() => setIsAssetsConfigOpen(false)}
        assets={assets}
        deductions={deductions}
        currency={currency}
        onOpenLandDesigner={() => navigateLegacyTab('land_designer')}
        onSave={(updatedAssets, updatedDeductions) => {
          const stillHasGis = updatedAssets.some((a) => a.id.startsWith('gis_subdivision_'));
          if (!stillHasGis && subdivisionState.isLinkedToEstate) {
            setSubdivisionState((prev) => ({ ...prev, isLinkedToEstate: false }));
          }
          setAssets(updatedAssets);
          setDeductions(updatedDeductions);
          showToast(
            'Hantida Waa La Keydiyey',
            'Diiwaanka hantida & deymaha waa la cusbooneysiiyey.'
          );
        }}
      />

      <PresetsModal
        isOpen={isPresetsOpen}
        onClose={() => setIsPresetsOpen(false)}
        onSelectPreset={handleSelectPreset}
      />

      <OfficialCertificateModal
        isOpen={isCertificateOpen}
        onClose={() => setIsCertificateOpen(false)}
        result={calculationResult}
        heirsInput={heirsInput}
        assets={assets}
        deductions={deductions}
        currency={currency}
        linkedLandAllocation={linkedLandAllocation}
        subdivisionResult={currentHasMap ? subdivisionResult : null}
        caseMeta={activeCaseMeta}
        onPrint={handlePrint}
        onExportExcel={handleExportExcel}
      />

      <QuranicProofsModal
        isOpen={isQuranicOpen}
        onClose={() => setIsQuranicOpen(false)}
      />

      <SavedCasesModal
        isOpen={isSavedCasesOpen}
        onClose={() => setIsSavedCasesOpen(false)}
        savedCases={savedCases}
        activeCaseId={activeCaseId}
        onSelectCase={handleSelectSavedCase}
        onDeleteCase={handleDeleteSavedCase}
        onOpenCaseManager={() => {
          setIsSavedCasesOpen(false);
          navigateLegacyTab('cases');
        }}
        onOpenCloudBackup={() => setIsBackupRestoreOpen(true)}
        currency={currency}
      />
    </div>
  );
}
