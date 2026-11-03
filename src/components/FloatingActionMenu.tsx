import React, { useState } from 'react';
import {
  Plus,
  X,
  FolderPlus,
  MapPin,
  Calculator,
  Coins,
  DatabaseBackup,
  AlertCircle,
} from 'lucide-react';
import { CaseLifecycleStatus, SavedInheritanceCase } from '../types/inheritance';
import { LandSubdivisionState } from '../types/landSubdivision';
import { generateUniqueCaseReference } from '../utils/caseManagementEngine';

interface FloatingActionMenuProps {
  savedCases: SavedInheritanceCase[];
  activeCaseReference: string;
  onCreateValidatedCase: (params: {
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
  onOpenGisWorkspace: () => void;
  onOpenCalculatorWorkspace: () => void;
  onOpenAssetsModal: () => void;
  onOpenBackupRestoreModal: () => void;
}

export const FloatingActionMenu: React.FC<FloatingActionMenuProps> = ({
  savedCases,
  activeCaseReference,
  onCreateValidatedCase,
  onOpenGisWorkspace,
  onOpenCalculatorWorkspace,
  onOpenAssetsModal,
  onOpenBackupRestoreModal,
}) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [showNewCaseForm, setShowNewCaseForm] = useState(false);

  const todayIso = new Date().toISOString().slice(0, 10);
  const [caseName, setCaseName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [deceasedName, setDeceasedName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleOpenNewCaseSubform = () => {
    const suggestedRef = generateUniqueCaseReference(savedCases, todayIso);
    setCaseName('');
    setReferenceNumber(suggestedRef);
    setDeceasedName('');
    setFormError(null);
    setShowNewCaseForm(true);
  };

  const handleCloseAll = () => {
    setIsSheetOpen(false);
    setShowNewCaseForm(false);
    setFormError(null);
  };

  const handleSubmitNewCase = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = caseName.trim();
    if (!trimmedName) {
      setFormError('Fadlan geli magaca kiiska cusub si aan kiis madhan loo abuurin.');
      return;
    }

    const res = onCreateValidatedCase({
      caseName: trimmedName,
      referenceNumber: referenceNumber.trim(),
      caseDate: todayIso,
      description: '',
      status: 'cusub',
      deceasedName: deceasedName.trim(),
      explicitlyConfirmedSubdivision: null,
    });

    if (!res.ok) {
      setFormError(res.errorSomali || 'Kiiska lama abuuri karin. Hubi xogta aad gelisay.');
      return;
    }

    handleCloseAll();
  };

  return (
    <>
      {/* Floating Emerald "+" Circular FAB (Positioned cleanly above MobileBottomNav) */}
      <div className="fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-30 pb-safe no-print">
        <button
          type="button"
          onClick={() => {
            setIsSheetOpen(true);
            setShowNewCaseForm(false);
            setFormError(null);
          }}
          aria-label="Ficil Degdeg ah (+)"
          className="w-14 h-14 rounded-full bg-[#22C55E] hover:bg-[#16A34A] text-[#05130B] shadow-[0_8px_24px_rgba(34,197,94,0.4)] flex items-center justify-center active:scale-[0.96] transition-all cursor-pointer"
        >
          <Plus className="w-6 h-6 stroke-[2.7]" />
        </button>
      </div>

      {/* Compact Action Modal */}
      {isSheetOpen && (
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 backdrop-blur-xs p-2.5 sm:p-4 no-print"
          role="dialog"
          aria-modal="true"
          aria-label="Ficillada Degdegga ah"
          onClick={handleCloseAll}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[84dvh] flex flex-col overflow-hidden rounded-2xl bg-[#0B1220] border border-[#243449] text-[#F8FAFC] shadow-2xl"
          >
            <div className="px-3.5 py-2.5 bg-[#0F1B2D] border-b border-[#243449] flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[#F8FAFC] truncate">
                  {showNewCaseForm ? 'Abuur Kiis Dhaxal Cusub' : 'Ficillada Degdegga ah'}
                </h2>
                <p className="text-[11px] text-[#94A3B8] font-mono tabular-nums truncate">
                  Kiiska: {activeCaseReference}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseAll}
                className="h-9 w-9 rounded-xl flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0B1220] cursor-pointer shrink-0"
                aria-label="Xir"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3">
              {!showNewCaseForm ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleOpenNewCaseSubform}
                    className="w-full min-h-[48px] flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] text-left transition-colors cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
                      <FolderPlus className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#F8FAFC] truncate">
                        Abuur Kiis Dhaxal Cusub
                      </div>
                      <div className="text-[11px] text-[#94A3B8] truncate">
                        Kiis madax-bannaan oo leh tixraac u gaar ah
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleCloseAll();
                      onOpenGisWorkspace();
                    }}
                    className="w-full min-h-[48px] flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] text-left transition-colors cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#F8FAFC] truncate">
                        Soo Geli Xogta GIS (GeoJSON / CSV)
                      </div>
                      <div className="text-[11px] text-[#94A3B8] truncate">
                        Fur khariidadda si aad u maamusho Blocks &amp; Plots
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleCloseAll();
                      onOpenCalculatorWorkspace();
                    }}
                    className="w-full min-h-[48px] flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] text-left transition-colors cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#F8FAFC] truncate">
                        Xisaabi Dhaxalka Kiiska Hadda
                      </div>
                      <div className="text-[11px] text-[#94A3B8] truncate">
                        Geli dhaxal-sugayaasha oo arag saamiyada sharciga ah
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleCloseAll();
                      onOpenAssetsModal();
                    }}
                    className="w-full min-h-[48px] flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] text-left transition-colors cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
                      <Coins className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#F8FAFC] truncate">
                        Ku Dar Hanti, Deyn ama Dardaaran
                      </div>
                      <div className="text-[11px] text-[#94A3B8] truncate">
                        Cusbooneysii diiwaanka hantida kiiska {activeCaseReference}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleCloseAll();
                      onOpenBackupRestoreModal();
                    }}
                    className="w-full min-h-[48px] flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981] text-left transition-colors cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
                      <DatabaseBackup className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#F8FAFC] truncate">
                        Backup &amp; Soo-celinta Xogta Guud
                      </div>
                      <div className="text-[11px] text-[#94A3B8] truncate">
                        Kaydi ama soo celi dhammaan kiisaska kaydsan
                      </div>
                    </div>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitNewCase} className="space-y-3">
                  {formError && (
                    <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-[#F8FAFC] mb-1">
                      Magaca Kiiska *
                    </label>
                    <input
                      type="text"
                      value={caseName}
                      onChange={(e) => setCaseName(e.target.value)}
                      placeholder="Tusaale: Dhaxalka Qoyska Reer Axmed"
                      className="w-full min-h-[40px] rounded-xl bg-[#0F1B2D] border border-[#243449] px-3 py-2 text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none focus:border-[#10B981]"
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-[#F8FAFC] mb-1">
                        Lambarka Tixraaca *
                      </label>
                      <input
                        type="text"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                        className="w-full min-h-[40px] rounded-xl bg-[#0F1B2D] border border-[#243449] px-3 py-2 text-xs font-mono tabular-nums text-[#10B981] focus:outline-none focus:border-[#10B981]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#F8FAFC] mb-1">
                        Magaca Marxuumka (Ikhtiyaari)
                      </label>
                      <input
                        type="text"
                        value={deceasedName}
                        onChange={(e) => setDeceasedName(e.target.value)}
                        placeholder="Marxuum..."
                        className="w-full min-h-[40px] rounded-xl bg-[#0F1B2D] border border-[#243449] px-3 py-2 text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none focus:border-[#10B981]"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-[#94A3B8] leading-snug">
                    Kiiskan cusub wuxuu ku bilaabanayaa si madax-bannaan oo bilaa khariidad ah.
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCaseForm(false);
                        setFormError(null);
                      }}
                      className="flex-1 min-h-[40px] rounded-xl bg-[#0F1B2D] border border-[#243449] text-xs font-semibold text-[#F8FAFC] hover:border-[#94A3B8] cursor-pointer"
                    >
                      Dib u noqo
                    </button>
                    <button
                      type="submit"
                      className="flex-1 min-h-[40px] rounded-xl bg-[#10B981] hover:bg-[#059669] text-xs font-bold text-[#030712] cursor-pointer"
                    >
                      Xaqiiji &amp; Abuur
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
