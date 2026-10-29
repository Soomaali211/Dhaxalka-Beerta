import React, { useState, useMemo } from 'react';
import {
  CaseLifecycleStatus,
  Currency,
  SavedInheritanceCase,
} from '../types/inheritance';
import { LandSubdivisionState } from '../types/landSubdivision';
import {
  CASE_STATUS_METADATA,
  cloneSubdivisionStateIsolated,
  doesCaseHoldImportantData,
  generateUniqueCaseReference,
  hydrateCaseSubdivisionSnapshot,
  isReferenceNumberUnique,
} from '../utils/caseManagementEngine';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  FilePlus2,
  FolderOpen,
  History,
  Lock,
  MapPin,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';

interface CaseManagementViewProps {
  savedCases: SavedInheritanceCase[];
  activeCase: SavedInheritanceCase | null;
  currency: Currency;
  currentHeirCount: number;
  currentNetEstateUSD: number;
  currentHasMap: boolean;
  currentMapLabel: string;
  currentBlocksCount: number;
  currentFullPlotsCount: number;
  currentValidHalfPlotsCount: number;
  onOpenCase: (caseRecord: SavedInheritanceCase) => void;
  onCreateNewCase: (params: {
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
  }) => { ok: boolean; errorSomali?: string };
  onSaveActiveCaseUpdates: (params: {
    caseName: string;
    caseDate: string;
    description: string;
    status: CaseLifecycleStatus;
    changeReason?: string;
  }) => void;
  onCloseCaseStatus: (caseId: string, reason?: string) => void;
  onDeleteCaseSafely: (caseId: string) => void;
  onNavigateToCalculator: () => void;
  onNavigateToLandDesigner: () => void;
}

type NewCaseMapOption = 'none_mapless' | 'copy_existing_case';

function getDarkStatusTextClass(status: CaseLifecycleStatus): string {
  switch (status) {
    case 'cusub':
      return 'text-sky-400';
    case 'socda':
      return 'text-[#10B981]';
    case 'la_xaqiijiyey':
      return 'text-emerald-300';
    case 'la_xidhay':
      return 'text-amber-400';
    default:
      return 'text-[#94A3B8]';
  }
}

export const CaseManagementView: React.FC<CaseManagementViewProps> = ({
  savedCases,
  activeCase,
  currency,
  currentHeirCount,
  currentNetEstateUSD,
  currentHasMap,
  currentMapLabel,
  currentBlocksCount,
  currentFullPlotsCount,
  currentValidHalfPlotsCount,
  onOpenCase,
  onCreateNewCase,
  onSaveActiveCaseUpdates,
  onCloseCaseStatus,
  onDeleteCaseSafely,
  onNavigateToCalculator,
  onNavigateToLandDesigner,
}) => {
  // Search & Status Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<CaseLifecycleStatus | 'all'>('all');

  // Active Case Edit Form State
  const [editName, setEditName] = useState<string>(activeCase?.caseName || '');
  const [editDate, setEditDate] = useState<string>(
    activeCase?.caseDate || new Date().toISOString().slice(0, 10)
  );
  const [editStatus, setEditStatus] = useState<CaseLifecycleStatus>(
    activeCase?.status || 'socda'
  );
  const [editDescription, setEditDescription] = useState<string>(activeCase?.description || '');
  const [editReason, setEditReason] = useState<string>('');

  // Sync local form state when activeCase switches
  React.useEffect(() => {
    if (activeCase) {
      setEditName(activeCase.caseName);
      setEditDate(activeCase.caseDate);
      setEditStatus(activeCase.status);
      setEditDescription(activeCase.description || '');
      setEditReason('');
    }
  }, [activeCase?.id, activeCase?.updatedAt]);

  // Create New Case Modal/Drawer State
  const [isNewCaseFormOpen, setIsNewCaseFormOpen] = useState<boolean>(false);
  const todayIso = new Date().toISOString().slice(0, 10);
  const [newCaseName, setNewCaseName] = useState<string>('');
  const [newCaseRef, setNewCaseRef] = useState<string>(() =>
    generateUniqueCaseReference(savedCases, todayIso)
  );
  const [newCaseDate, setNewCaseDate] = useState<string>(todayIso);
  const [newDeceasedName, setNewDeceasedName] = useState<string>('');
  const [newCaseStatus, setNewCaseStatus] = useState<CaseLifecycleStatus>('cusub');
  const [newCaseDesc, setNewCaseDesc] = useState<string>('');
  const [newMapOption, setNewMapOption] = useState<NewCaseMapOption>('none_mapless');
  const [sourceCaseIdForGeometry, setSourceCaseIdForGeometry] = useState<string>('');
  const [confirmGeometryReuse, setConfirmGeometryReuse] = useState<boolean>(false);
  const [newCaseError, setNewCaseError] = useState<string | null>(null);

  // History viewer & Delete safety modal
  const [historyInspectCaseId, setHistoryInspectCaseId] = useState<string | null>(null);
  const [pendingDeleteCase, setPendingDeleteCase] = useState<SavedInheritanceCase | null>(null);

  const openNewCaseDrawer = () => {
    const d = new Date().toISOString().slice(0, 10);
    setNewCaseName('');
    setNewCaseRef(generateUniqueCaseReference(savedCases, d));
    setNewCaseDate(d);
    setNewDeceasedName('');
    setNewCaseStatus('cusub');
    setNewCaseDesc('');
    setNewMapOption('none_mapless');
    setSourceCaseIdForGeometry('');
    setConfirmGeometryReuse(false);
    setNewCaseError(null);
    setIsNewCaseFormOpen(true);
  };

  const refIsUnique = useMemo(
    () => isReferenceNumberUnique(newCaseRef, savedCases),
    [newCaseRef, savedCases]
  );

  const casesWithGeometry = useMemo(
    () => savedCases.filter((c) => c.hasMapGeometry && c.landSubdivisionSnapshot),
    [savedCases]
  );

  const filteredCases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return savedCases.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.caseName.toLowerCase().includes(q) ||
        c.referenceNumber.toLowerCase().includes(q) ||
        (c.deceasedName || '').toLowerCase().includes(q)
      );
    });
  }, [savedCases, searchQuery, statusFilter]);

  const inspectedHistoryCase = useMemo(
    () =>
      savedCases.find((c) => c.id === (historyInspectCaseId || activeCase?.id)) || activeCase,
    [savedCases, historyInspectCaseId, activeCase]
  );

  const formatMoney = (val: number) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency === 'SLSH' ? 'SOS' : currency,
        maximumFractionDigits: 0,
      })
        .format(val)
        .replace('SOS', currency === 'SLSH' ? 'Sl.Sh' : 'Sh.So');
    } catch {
      return `$${val.toLocaleString()}`;
    }
  };

  const handleSubmitNewCase = (e: React.FormEvent) => {
    e.preventDefault();
    setNewCaseError(null);

    if (!newCaseName.trim()) {
      setNewCaseError('Fadlan qor magaca kiiska.');
      return;
    }
    if (!newCaseRef.trim()) {
      setNewCaseError('Fadlan qor Lambarka Tixraaca gaarka u ah kiiska.');
      return;
    }
    if (!refIsUnique) {
      setNewCaseError(
        `Lambarka Tixraaca "${newCaseRef.trim().toUpperCase()}" hore ayaa loo isticmaalay. Fadlan dooro mid gaar ah.`
      );
      return;
    }

    let explicitSub: {
      state: LandSubdivisionState;
      sourceLabel: string;
      blocksCount: number;
      fullPlotsCount: number;
      validHalfPlotsCount: number;
      clippedPlotsCount: number;
    } | null = null;

    if (newMapOption === 'copy_existing_case') {
      const srcCase = casesWithGeometry.find((c) => c.id === sourceCaseIdForGeometry);
      if (!srcCase) {
        setNewCaseError('Fadlan dooro kiiska aad rabto in khariidaddiisa laga koobiyeeyo.');
        return;
      }
      if (!confirmGeometryReuse) {
        setNewCaseError(
          'Si looga hortago isku-dhexyaac kiisaska ah, fadlan calaamadi sanduuqa xaqiijinta.'
        );
        return;
      }
      const hydrated = hydrateCaseSubdivisionSnapshot(srcCase.landSubdivisionSnapshot, true);
      explicitSub = {
        state: cloneSubdivisionStateIsolated(hydrated),
        sourceLabel: `Koobi: ${srcCase.referenceNumber} (${srcCase.caseName})`,
        blocksCount: srcCase.blocksCount || 0,
        fullPlotsCount: srcCase.fullPlotsCount || 0,
        validHalfPlotsCount: srcCase.validHalfPlotsCount || 0,
        clippedPlotsCount: srcCase.clippedPlotsCount || 0,
      };
    }

    const res = onCreateNewCase({
      caseName: newCaseName,
      referenceNumber: newCaseRef,
      caseDate: newCaseDate,
      description: newCaseDesc,
      status: newCaseStatus,
      deceasedName: newDeceasedName,
      explicitlyConfirmedSubdivision: explicitSub,
    });

    if (!res.ok) {
      setNewCaseError(res.errorSomali || 'Kiiska lama abuuri karin.');
      return;
    }

    setIsNewCaseFormOpen(false);
  };

  return (
    <div className="space-y-5 text-[#F8FAFC]">
      {/* 1. PAGE HEADER & PRIMARY ACTION */}
      <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
            <span className="font-semibold text-[#10B981]">Maaraynta Kiisaska Dhaxalka</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-numbers tabular-nums">{savedCases.length} kiis oo diiwaangashan</span>
            <span aria-hidden="true">·</span>
            <span>Kayd kiis kasta gaar u yahay</span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-[#F8FAFC] tracking-tight">
            Diiwaanka Kiisaska, Tixraaca Joogtada ah &amp; Taariikhda Isbeddellada
          </h2>
          <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
            Kiis kasta wuxuu leeyahay <strong className="text-[#F8FAFC]">Reference Number</strong> u gaar ah, dhaxlayaal u gaar ah, hanti u gaar ah, iyo khariidad Blocks/Plots/Half Plots oo madax-bannaan. Kiis cusub si toos ah uma qaadanayo khariidad kiis hore.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={openNewCaseDrawer}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-4 py-2.5 text-xs font-extrabold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Abuur Kiis Cusub</span>
          </button>
        </div>
      </section>

      {/* 2. CREATE NEW CASE EXPANDED PANEL */}
      {isNewCaseFormOpen && (
        <section className="bg-[#0F1B2D] border border-[#10B981]/50 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 bg-[#0B1220] border-b border-[#243449] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <FilePlus2 className="w-5 h-5 text-[#10B981]" />
              <div>
                <h2 className="text-sm font-extrabold text-[#F8FAFC]">
                  Diiwaangeli Kiis Cusub oo Madax-bannaan
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  Kiiskani wuxuu yeelanayaa kayd u gaar ah oo aan saamayn ku yeelan kiisaska kale
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsNewCaseFormOpen(false)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] rounded-xl cursor-pointer"
              aria-label="Xidh foomka"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmitNewCase} className="p-5 sm:p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#F8FAFC] mb-1.5">
                  Magaca Kiiska <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newCaseName}
                  onChange={(e) => setNewCaseName(e.target.value)}
                  placeholder="Tusaale: Dhaxalka Reer Xaaji Axmed"
                  className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3.5 py-2 text-xs font-semibold text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#F8FAFC] mb-1.5">
                  Reference Number (Joogto &amp; Gaar ah) <span className="text-rose-400">*</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    required
                    value={newCaseRef}
                    onChange={(e) => setNewCaseRef(e.target.value.toUpperCase())}
                    placeholder="KIIS-2026-0001"
                    className={`w-full min-h-[44px] bg-[#0B1220] border rounded-xl px-3.5 py-2 text-xs font-mono-numbers tabular-nums font-extrabold uppercase focus:outline-none ${
                      newCaseRef.trim() && !refIsUnique
                        ? 'border-rose-500 text-rose-300 bg-rose-950/30'
                        : 'border-[#243449] focus:border-[#10B981] text-[#F8FAFC]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setNewCaseRef(generateUniqueCaseReference(savedCases, newCaseDate))
                    }
                    className="min-h-[44px] px-3 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#10B981] text-[11px] font-bold text-[#F8FAFC] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Cusboonaysii
                  </button>
                </div>
                <p
                  className={`text-[11px] mt-1 ${
                    !newCaseRef.trim()
                      ? 'text-[#94A3B8]'
                      : refIsUnique
                      ? 'text-[#10B981] font-medium'
                      : 'text-rose-400 font-semibold'
                  }`}
                >
                  {!newCaseRef.trim()
                    ? 'Geli tixraac gaar ah'
                    : refIsUnique
                    ? 'Reference Number-kani waa mid u gaar ah kiiskan'
                    : 'Tixraacan hore ayaa loo isticmaalay kiis kale'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#F8FAFC] mb-1.5">
                  Taariikhda Kiiska <span className="text-rose-400">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={newCaseDate}
                  onChange={(e) => setNewCaseDate(e.target.value)}
                  className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3.5 py-2 text-xs font-mono-numbers tabular-nums font-semibold text-[#F8FAFC] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#F8FAFC] mb-1.5">
                  Magaca Marxuumka (Ikhtiyaari)
                </label>
                <input
                  type="text"
                  value={newDeceasedName}
                  onChange={(e) => setNewDeceasedName(e.target.value)}
                  placeholder="Tusaale: Marxuum Xaaji Axmed"
                  className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3.5 py-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#F8FAFC] mb-1.5">
                  Xaaladda Kiiska
                </label>
                <select
                  value={newCaseStatus}
                  onChange={(e) => setNewCaseStatus(e.target.value as CaseLifecycleStatus)}
                  className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3.5 py-2 text-xs font-bold text-[#F8FAFC] focus:outline-none"
                >
                  <option value="cusub">Cusub</option>
                  <option value="socda">Socda</option>
                  <option value="la_xaqiijiyey">La xaqiijiyey</option>
                  <option value="la_xidhay">La xidhay</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#F8FAFC] mb-1.5">
                  Faahfaahin Dheeraad ah (Ikhtiyaari)
                </label>
                <input
                  type="text"
                  value={newCaseDesc}
                  onChange={(e) => setNewCaseDesc(e.target.value)}
                  placeholder="Goobta dhulka, tixraaca maxkamadda, iwm..."
                  className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3.5 py-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none"
                />
              </div>
            </div>

            {/* EXPLICIT LAND / MAP GEOMETRY SELECTION (NO FILE UPLOAD — USE DASHBOARD '+' AFTER OPENING CASE) */}
            <div className="border border-[#243449] rounded-xl p-4 bg-[#0B1220] space-y-3">
              <div>
                <h3 className="text-xs font-extrabold text-[#F8FAFC]">
                  Khariidadda Dhulka ee Kiiskan (Ikhtiyaari)
                </h3>
                <p className="text-[11px] text-[#94A3B8] mt-0.5">
                  Kiiska cusub si caadi ah wuxuu ku bilowdaa <strong className="text-[#F8FAFC]">bilaa khariidad</strong>. Marka kiiska la furo, nashqadda beerta waxaad ka samayn kartaa ama ka soo gelin kartaa badhanka <strong className="text-[#10B981]">&ldquo;+&rdquo;</strong> ee bogga Khariidadda.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setNewMapOption('none_mapless');
                    setConfirmGeometryReuse(false);
                  }}
                  className={`text-left rounded-xl border p-3.5 transition-colors cursor-pointer ${
                    newMapOption === 'none_mapless'
                      ? 'border-[#10B981] bg-[#10B981]/10 font-bold text-[#F8FAFC]'
                      : 'border-[#243449] bg-[#0F1B2D] text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">Bilaa Khariidad</span>
                    {newMapOption === 'none_mapless' && (
                      <Check className="w-4 h-4 text-[#10B981]" />
                    )}
                  </div>
                  <p className="text-[11px] font-normal text-[#94A3B8] mt-1">
                    Kiis madax-bannaan (nashqadda beerta hadhow ka fur badhanka &ldquo;+&rdquo; ee Khariidadda).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setNewMapOption('copy_existing_case');
                    setConfirmGeometryReuse(false);
                    if (!sourceCaseIdForGeometry && casesWithGeometry[0]) {
                      setSourceCaseIdForGeometry(casesWithGeometry[0].id);
                    }
                  }}
                  className={`text-left rounded-xl border p-3.5 transition-colors cursor-pointer ${
                    newMapOption === 'copy_existing_case'
                      ? 'border-[#10B981] bg-[#10B981]/10 font-bold text-[#F8FAFC]'
                      : 'border-[#243449] bg-[#0F1B2D] text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">Koobiyeey Khariidad Kiis Hore</span>
                    {newMapOption === 'copy_existing_case' && (
                      <Check className="w-4 h-4 text-[#10B981]" />
                    )}
                  </div>
                  <p className="text-[11px] font-normal text-[#94A3B8] mt-1">
                    Si cad u dooro oo u xaqiiji nuqul khariidad kiis hore u jiray.
                  </p>
                </button>
              </div>

              {newMapOption === 'copy_existing_case' && (
                <div className="pt-1 space-y-2.5">
                  {casesWithGeometry.length === 0 ? (
                    <p className="text-xs text-amber-300">
                      Ma jiro kiis hore oo leh khariidad la koobiyeyn karo. Dooro &ldquo;Bilaa Khariidad&rdquo;.
                    </p>
                  ) : (
                    <>
                      <select
                        value={sourceCaseIdForGeometry}
                        onChange={(e) => setSourceCaseIdForGeometry(e.target.value)}
                        className="w-full max-w-md min-h-[44px] bg-[#0F1B2D] border border-[#243449] rounded-xl px-3.5 py-2 text-xs font-semibold text-[#F8FAFC]"
                      >
                        {casesWithGeometry.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.referenceNumber} — {c.caseName} ({c.blocksCount || 0} Blk ·{' '}
                            {c.fullPlotsCount || 0} Plot)
                          </option>
                        ))}
                      </select>
                      <label className="flex items-start gap-2.5 text-xs text-[#F8FAFC] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={confirmGeometryReuse}
                          onChange={(e) => setConfirmGeometryReuse(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded border-[#243449] accent-[#10B981]"
                        />
                        <span>
                          Waxaan si cad u xaqiijinayaa in nuqul madax-bannaan oo khariidaddaas ah lagu xidho kiiskan cusub.
                        </span>
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>

            {newCaseError && (
              <div className="rounded-xl bg-rose-950/40 border border-rose-500/40 px-3.5 py-2.5 text-xs font-medium text-rose-300">
                {newCaseError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setIsNewCaseFormOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#94A3B8] text-xs font-bold text-[#F8FAFC] cursor-pointer"
              >
                Jooji
              </button>
              <button
                type="submit"
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] text-xs font-extrabold cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Abuur &amp; Fur Kiiska Cusub</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 3. CURRENTLY ACTIVE CASE METADATA & STATUS EDITOR */}
      {activeCase && (
        <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#243449] bg-[#0B1220] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
                <span className="font-semibold">Kiiska Hadda Furan</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-numbers tabular-nums font-extrabold text-[#10B981]">
                  {activeCase.referenceNumber}
                </span>
                <span aria-hidden="true">·</span>
                <span className={`font-bold ${getDarkStatusTextClass(activeCase.status)}`}>
                  {CASE_STATUS_METADATA[activeCase.status].labelSomali}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-numbers tabular-nums">
                  {currentHasMap
                    ? `${currentBlocksCount} Blk · ${currentFullPlotsCount} Plot · ${currentValidHalfPlotsCount} Half Plot`
                    : 'Khariidad ma laha'}
                </span>
              </div>
              <h2 className="text-base font-extrabold text-[#F8FAFC] mt-0.5">
                {activeCase.caseName}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onNavigateToCalculator}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] text-xs font-bold text-[#F8FAFC] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Xisaabi Dhaxalka ({currentHeirCount} qof)
              </button>
              <button
                type="button"
                onClick={onNavigateToLandDesigner}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] text-xs font-bold text-[#10B981] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {currentHasMap ? 'Khariidadda & Half Plots' : 'Ku Xidh Khariidad'}
              </button>
            </div>
          </div>

          <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-3">
              <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                Magaca Kiiska
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-xs font-bold text-[#F8FAFC] focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                Reference Number (Joogto)
              </label>
              <input
                type="text"
                readOnly
                value={activeCase.referenceNumber}
                title="Reference Number-ka kiisku waa joogto si tixraaca rasmiga ahi uusan u lumin"
                className="w-full min-h-[42px] bg-[#030712]/70 border border-[#243449] rounded-xl px-3 py-2 text-xs font-mono-numbers tabular-nums font-extrabold text-[#94A3B8] cursor-not-allowed"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                Taariikhda Kiiska
              </label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-2.5 py-2 text-xs font-mono-numbers tabular-nums font-semibold text-[#F8FAFC] focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                Xaaladda Kiiska
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as CaseLifecycleStatus)}
                className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-2.5 py-2 text-xs font-bold text-[#F8FAFC] focus:outline-none"
              >
                <option value="cusub">Cusub</option>
                <option value="socda">Socda</option>
                <option value="la_xaqiijiyey">La xaqiijiyey</option>
                <option value="la_xidhay">La xidhay</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                Sababta Wax-ka-beddelka (Ikhtiyaari)
              </label>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Tusaale: Hubinta xuduudda cusub..."
                className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none"
              />
            </div>

            <div className="md:col-span-8">
              <label className="block text-[11px] font-semibold text-[#94A3B8] mb-1">
                Faahfaahin Dheeraad ah
              </label>
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Faahfaahin ku saabsan kiiska, maxkamadda, ama xuduudda..."
                className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none"
              />
            </div>

            <div className="md:col-span-4 flex flex-wrap items-center justify-end gap-2">
              {activeCase.status !== 'la_xidhay' && (
                <button
                  type="button"
                  onClick={() => onCloseCaseStatus(activeCase.id, editReason || 'Kiiska waa la xidhay.')}
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-amber-400 text-xs font-bold text-[#F8FAFC] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Xidh Kiiska</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onSaveActiveCaseUpdates({
                    caseName: editName.trim() || activeCase.caseName,
                    caseDate: editDate || activeCase.caseDate,
                    description: editDescription,
                    status: editStatus,
                    changeReason: editReason,
                  });
                  setEditReason('');
                }}
                className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Keydi Kiiska</span>
              </button>
            </div>
          </div>

          <div className="px-5 py-2.5 bg-[#0B1220] border-t border-[#243449] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#94A3B8]">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Hantida Saafiga:{' '}
                <strong className="font-mono-numbers tabular-nums text-[#F8FAFC]">
                  {formatMoney(currentNetEstateUSD)}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Khariidad:{' '}
                <strong className="text-[#F8FAFC]">
                  {currentHasMap ? currentMapLabel : 'Khariidad ma laha'}
                </strong>
              </span>
            </div>
            <span className="font-mono-numbers tabular-nums text-[#94A3B8]">
              Ugu dambayn la keydiyey: {new Date(activeCase.updatedAt).toLocaleString()}
            </span>
          </div>
        </section>
      )}

      {/* 4. ALL SAVED CASES REGISTRY WITH SEARCH & STATUS FILTER */}
      <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#243449] bg-[#0B1220] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-[#F8FAFC]">
              Liiska Kiisaska ({filteredCases.length})
            </h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Ku raadi magaca kiiska ama Reference Number, ama ku sifeey xaaladda kiiska
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Interactive Status Filter Segmented Controls */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0F1B2D] border border-[#243449] rounded-xl">
              {(
                [
                  { id: 'all', label: 'Dhammaan' },
                  { id: 'cusub', label: 'Cusub' },
                  { id: 'socda', label: 'Socda' },
                  { id: 'la_xaqiijiyey', label: 'La xaqiijiyey' },
                  { id: 'la_xidhay', label: 'La xidhay' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`min-h-[34px] px-2.5 py-1 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-[#10B981] text-[#030712]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Raadi magaca ama Ref No..."
                className="w-full min-h-[42px] bg-[#0F1B2D] border border-[#243449] focus:border-[#10B981] rounded-xl pl-8 pr-3 py-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {filteredCases.length === 0 ? (
          <div className="p-10 text-center space-y-2.5">
            <FolderOpen className="w-8 h-8 text-[#94A3B8] mx-auto" />
            <p className="text-sm font-bold text-[#F8FAFC]">
              {savedCases.length === 0
                ? 'Weli wax kiis ah lama abuurin.'
                : 'Lama helin kiis u dhigma raadintaada ama sifayntaada.'}
            </p>
            <button
              type="button"
              onClick={openNewCaseDrawer}
              className="mt-2 min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] px-4 py-2 text-xs font-extrabold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Abuur Kiis Cusub</span>
            </button>
          </div>
        ) : (
          <>
            {/* MOBILE VIEW (< md): RESPONSIVE CASE CARDS */}
            <div className="md:hidden divide-y divide-[#243449]">
              {filteredCases.map((c) => {
                const isCurrent = activeCase?.id === c.id;
                const stMeta = CASE_STATUS_METADATA[c.status];
                return (
                  <div
                    key={c.id}
                    className={`p-4 space-y-3 ${isCurrent ? 'bg-[#10B981]/5' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#94A3B8]">
                          <span className="font-mono-numbers tabular-nums font-extrabold text-[#10B981]">
                            {c.referenceNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className={`font-bold ${getDarkStatusTextClass(c.status)}`}>
                            {stMeta.labelSomali}
                          </span>
                          {isCurrent && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-bold text-emerald-300">Hadda furan</span>
                            </>
                          )}
                        </div>
                        <div className="text-sm font-extrabold text-[#F8FAFC] mt-0.5 truncate">
                          {c.caseName}
                        </div>
                        <div className="text-[11px] text-[#94A3B8] mt-0.5">
                          {c.deceasedName ? `Marxuum: ${c.deceasedName}` : 'Marxuum aan la magacaabin'}
                          {' · '}
                          <span className="font-mono-numbers tabular-nums">{c.caseDate}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 font-mono-numbers tabular-nums">
                        <div className="text-sm font-extrabold text-[#F8FAFC]">
                          {formatMoney(c.totalNetEstateUSD)}
                        </div>
                        <div className="text-[11px] text-[#94A3B8]">{c.heirCount} dhaxale</div>
                      </div>
                    </div>

                    <div className="text-xs text-[#94A3B8] font-mono-numbers tabular-nums">
                      {c.hasMapGeometry
                        ? `${c.blocksCount || 0} Blk · ${c.fullPlotsCount || 0} Plot buuxa · ${c.validHalfPlotsCount || 0} Half Plot`
                        : 'Khariidad ma laha'}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onOpenCase(c)}
                        className={`flex-1 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${
                          isCurrent
                            ? 'bg-[#10B981]/20 border border-[#10B981]/50 text-[#10B981]'
                            : 'bg-[#10B981] hover:bg-[#059669] text-[#030712]'
                        }`}
                      >
                        {isCurrent ? 'Waa Furan Yahay' : 'Fur Kiiskan'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistoryInspectCaseId(c.id)}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#10B981] text-[#F8FAFC] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        title="Taariikhda wax-ka-beddelka"
                      >
                        <History className="w-4 h-4 text-[#10B981]" />
                        <span className="font-mono-numbers tabular-nums">
                          {c.changeHistory?.length || 0}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteCase(c)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#0B1220] border border-[#243449] text-[#94A3B8] hover:text-rose-400 hover:border-rose-500/50 cursor-pointer"
                        title="Tirtir kiiskan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP VIEW (md+): FULL TABULAR REGISTRY */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#243449] bg-[#0B1220]/70 text-[#94A3B8] font-semibold">
                    <th className="py-3 px-4">Reference No.</th>
                    <th className="py-3 px-4">Magaca Kiiska &amp; Marxuumka</th>
                    <th className="py-3 px-3">Taariikhda</th>
                    <th className="py-3 px-3">Xaaladda</th>
                    <th className="py-3 px-4">Khariidadda &amp; Plots / Half Plots</th>
                    <th className="py-3 px-3 text-right">Dhaxalka &amp; Ehelka</th>
                    <th className="py-3 px-4 text-right">Ficillo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#243449]/70">
                  {filteredCases.map((c) => {
                    const isCurrent = activeCase?.id === c.id;
                    const stMeta = CASE_STATUS_METADATA[c.status];
                    return (
                      <tr
                        key={c.id}
                        className={`hover:bg-[#0B1220]/60 transition-colors ${
                          isCurrent ? 'bg-[#10B981]/5' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-mono-numbers tabular-nums font-extrabold text-[#10B981] whitespace-nowrap">
                          {c.referenceNumber}
                          {isCurrent && (
                            <span className="block text-[10px] font-sans font-semibold text-emerald-300">
                              Hadda furan
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-[#F8FAFC]">{c.caseName}</div>
                          <div className="text-[11px] text-[#94A3B8] mt-0.5">
                            {c.deceasedName ? `Marxuum: ${c.deceasedName}` : 'Marxuum aan la magacaabin'}
                            {c.description ? ` · ${c.description}` : ''}
                          </div>
                        </td>

                        <td className="py-3 px-3 font-mono-numbers tabular-nums text-[#F8FAFC] whitespace-nowrap">
                          {c.caseDate}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`font-bold ${getDarkStatusTextClass(c.status)}`}>
                            {stMeta.labelSomali}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          {c.hasMapGeometry ? (
                            <div>
                              <div className="font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                                <span className="truncate max-w-[200px]">
                                  {c.linkedGeometrySourceLabel || 'Khariidad ku xidhan'}
                                </span>
                              </div>
                              <div className="text-[11px] font-mono-numbers tabular-nums text-[#94A3B8] mt-0.5">
                                {c.blocksCount || 0} Blk · {c.fullPlotsCount || 0} Plot buuxa ·{' '}
                                {c.validHalfPlotsCount || 0} Half Plot
                              </div>
                            </div>
                          ) : (
                            <span className="text-[#94A3B8]">Khariidad ma laha</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-mono-numbers tabular-nums whitespace-nowrap">
                          <div className="font-bold text-[#F8FAFC]">
                            {formatMoney(c.totalNetEstateUSD)}
                          </div>
                          <div className="text-[11px] text-[#94A3B8]">{c.heirCount} dhaxale</div>
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenCase(c)}
                              className={`min-h-[38px] px-3 py-1.5 rounded-lg font-extrabold cursor-pointer transition-colors ${
                                isCurrent
                                  ? 'bg-[#10B981]/20 border border-[#10B981]/50 text-[#10B981]'
                                  : 'bg-[#10B981] hover:bg-[#059669] text-[#030712]'
                              }`}
                            >
                              {isCurrent ? 'Waa Furan Yahay' : 'Fur'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setHistoryInspectCaseId(c.id)}
                              className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#0B1220] border border-[#243449] hover:border-[#10B981] text-[#F8FAFC] font-semibold inline-flex items-center gap-1 cursor-pointer"
                              title="Taariikhda wax-ka-beddelka"
                            >
                              <History className="w-3.5 h-3.5 text-[#10B981]" />
                              <span className="font-mono-numbers tabular-nums">
                                {c.changeHistory?.length || 0}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteCase(c)}
                              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-rose-400 hover:bg-rose-950/40 cursor-pointer"
                              title="Tirtir kiiskan"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* 5. CASE CHANGE HISTORY LOG */}
      {inspectedHistoryCase && (
        <section className="bg-[#0F1B2D] border border-[#243449] rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#243449] bg-[#0B1220] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 text-[#10B981] shrink-0" />
              <h3 className="text-sm font-extrabold text-[#F8FAFC] truncate">
                Taariikhda Wax-ka-beddelka Kiiska: {inspectedHistoryCase.caseName} (
                <span className="font-mono-numbers tabular-nums text-[#10B981]">
                  {inspectedHistoryCase.referenceNumber}
                </span>
                )
              </h3>
            </div>
            <span className="text-xs font-mono-numbers tabular-nums text-[#94A3B8] shrink-0">
              {inspectedHistoryCase.changeHistory?.length || 0} diiwaan
            </span>
          </div>

          {!inspectedHistoryCase.changeHistory ||
          inspectedHistoryCase.changeHistory.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#94A3B8]">
              Weli isbeddel dheeraad ah laguma samayn kiiskan.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-[#0B1220]">
                  <tr className="border-b border-[#243449] text-[#94A3B8] font-semibold">
                    <th className="py-2.5 px-4">Taariikhda &amp; Saacadda</th>
                    <th className="py-2.5 px-3">Qaybta la Beddelay</th>
                    <th className="py-2.5 px-3">Qiimihii Hore</th>
                    <th className="py-2.5 px-3">Qiimaha Cusub</th>
                    <th className="py-2.5 px-3">Xaaladda</th>
                    <th className="py-2.5 px-4">Sababta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#243449]/70">
                  {inspectedHistoryCase.changeHistory.map((log) => (
                    <tr key={log.id} className="hover:bg-[#0B1220]/60">
                      <td className="py-2.5 px-4 font-mono-numbers tabular-nums text-[11px] text-[#94A3B8] whitespace-nowrap">
                        {new Date(log.changedAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-[#F8FAFC]">{log.fieldSomali}</td>
                      <td className="py-2.5 px-3 font-mono-numbers tabular-nums text-[11px] text-[#94A3B8]">
                        {log.previousValue}
                      </td>
                      <td className="py-2.5 px-3 font-mono-numbers tabular-nums text-[11px] font-semibold text-[#F8FAFC]">
                        {log.newValue}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`font-semibold ${getDarkStatusTextClass(log.caseStatus)}`}>
                          {CASE_STATUS_METADATA[log.caseStatus].labelSomali}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-[#94A3B8]">{log.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 6. SAFE DELETE CONFIRMATION DIALOG */}
      {pendingDeleteCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-[#F8FAFC]">
                  Ma hubtaa inaad tirtirto kiiskan?
                </h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Waxaad tirtiraysaa kiiska{' '}
                  <strong className="text-[#F8FAFC]">{pendingDeleteCase.caseName}</strong> (
                  <span className="font-mono-numbers tabular-nums font-bold text-[#10B981]">
                    {pendingDeleteCase.referenceNumber}
                  </span>
                  ).
                </p>
              </div>
            </div>

            {doesCaseHoldImportantData(pendingDeleteCase) && (
              <div className="rounded-xl bg-amber-950/35 border border-amber-500/35 p-3.5 text-xs text-amber-200 space-y-1">
                <div className="font-extrabold text-amber-300">
                  Digniin: Kiiskani wuxuu xambaarsan yahay xog muhiim ah:
                </div>
                <div className="font-mono-numbers tabular-nums text-[11px] text-amber-200">
                  Ehel: {pendingDeleteCase.heirCount} qof · Hanti:{' '}
                  {formatMoney(pendingDeleteCase.totalNetEstateUSD)} ·{' '}
                  {pendingDeleteCase.hasMapGeometry
                    ? `${pendingDeleteCase.blocksCount || 0} Block & ${
                        pendingDeleteCase.fullPlotsCount || 0
                      } Plot`
                    : 'Bilaa khariidad'}
                </div>
                <p className="text-[11px] text-[#94A3B8] pt-1">
                  Tirtiridda kiiskani waxay tirtiraysaa oo keliya kaydka u gaarka ah kiiskan; ma taabanayso geometry-ga ama xogta kiis kale.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setPendingDeleteCase(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#94A3B8] text-xs font-bold text-[#F8FAFC] cursor-pointer"
              >
                Jooji
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteCaseSafely(pendingDeleteCase.id);
                  setPendingDeleteCase(null);
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold cursor-pointer"
              >
                Xaqiiji Tirtiridda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
