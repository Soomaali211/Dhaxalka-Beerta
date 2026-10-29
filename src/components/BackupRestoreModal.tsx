import React, { useRef, useState } from 'react';
import {
  DatabaseBackup,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  ShieldCheck,
} from 'lucide-react';
import { Currency, SavedInheritanceCase } from '../types/inheritance';
import {
  ValidatedBackupPreview,
  downloadApplicationBackupJSON,
  validateApplicationBackupJSON,
} from '../utils/backupRestoreEngine';

interface BackupRestoreModalProps {
  isOpen: boolean;
  savedCases: SavedInheritanceCase[];
  activeCaseId: string;
  currency: Currency;
  onClose: () => void;
  onConfirmRestore: (payload: {
    hydratedCases: SavedInheritanceCase[];
    activeCaseId: string;
    currency: Currency;
    preview: ValidatedBackupPreview;
  }) => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  savedCases,
  activeCaseId,
  currency,
  onClose,
  onConfirmRestore,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [pendingRestore, setPendingRestore] = useState<{
    fileName: string;
    hydratedCases: SavedInheritanceCase[];
    activeCaseId: string;
    currency: Currency;
    preview: ValidatedBackupPreview;
  } | null>(null);

  if (!isOpen) return null;

  const casesWithMapCount = savedCases.filter((c) => c.hasMapGeometry).length;
  const totalBlocksCount = savedCases.reduce((sum, c) => sum + (c.blocksCount || 0), 0);
  const totalPlotsCount = savedCases.reduce((sum, c) => sum + (c.fullPlotsCount || 0), 0);

  const handleExportBackup = () => {
    setStatusMessage(null);
    const result = downloadApplicationBackupJSON({
      savedCases,
      activeCaseId,
      currency,
    });

    if (result.ok === false) {
      setStatusMessage({
        type: 'error',
        text: result.errorSomali,
      });
      return;
    }

    setStatusMessage({
      type: 'success',
      text: `Backup-ka guud si guul leh ayaa loo soo dejiyey (${result.fileName} · ${result.casesCount} kiis).`,
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setStatusMessage(null);
    setPendingRestore(null);

    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const rawText = await file.text();
      const validation = validateApplicationBackupJSON(rawText);

      if (validation.ok === false) {
        setStatusMessage({
          type: 'error',
          text: validation.errorSomali,
        });
        e.target.value = '';
        return;
      }

      setPendingRestore({
        fileName: file.name,
        hydratedCases: validation.hydratedCases,
        activeCaseId: validation.activeCaseId,
        currency: validation.currency,
        preview: validation.preview,
      });
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Ma suurtagelin in la akhriyo faylka aad dooratay. Fadlan isku day mar kale.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleApplyValidatedRestore = () => {
    if (!pendingRestore) return;
    onConfirmRestore({
      hydratedCases: pendingRestore.hydratedCases,
      activeCaseId: pendingRestore.activeCaseId,
      currency: pendingRestore.currency,
      preview: pendingRestore.preview,
    });
    setPendingRestore(null);
    setStatusMessage(null);
    onClose();
  };

  const handleClose = () => {
    setPendingRestore(null);
    setStatusMessage(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Backup iyo Soo-celinta Xogta App-ka"
    >
      <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[#0B1220] border border-[#243449] text-[#F8FAFC] p-5 sm:p-6 pb-safe shadow-2xl">
        <div className="w-10 h-1.5 bg-[#243449] rounded-full mx-auto mb-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#243449]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
              <DatabaseBackup className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#F8FAFC]">
                Backup &amp; Soo-celinta Guud ee App-ka
              </h2>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Waa ka gaar dhoofinta khariidadaha GIS (GeoJSON / CSV / Shapefile)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-1 rounded-xl flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0F1B2D] cursor-pointer"
            aria-label="Xir"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Banner */}
        {statusMessage && (
          <div
            className={`mt-4 p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
              statusMessage.type === 'success'
                ? 'bg-[#10B981]/10 border-[#10B981]/40 text-emerald-200'
                : 'bg-red-950/60 border-red-500/40 text-red-200'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{statusMessage.text}</span>
          </div>
        )}

        {/* Section 1: Create Full Backup */}
        <div className="mt-4 p-4 rounded-2xl bg-[#0F1B2D] border border-[#243449] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#F8FAFC]">
              1. Kaydi Backup Buuxa (.json)
            </h3>
            <span className="text-xs font-mono tabular-nums text-[#10B981]">
              {savedCases.length} Kiis
            </span>
          </div>

          <p className="text-xs text-[#94A3B8] leading-relaxed">
            Waxaa hal fayl lagu kaydinayaa dhammaan kiisaska dhaxalka, saamiyada, hantida, iyo khariidadaha u gaarka ah kiis kasta.
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#94A3B8] font-mono tabular-nums">
            <span>{casesWithMapCount} khariidad leh</span>
            <span aria-hidden="true">·</span>
            <span>{totalBlocksCount} Block</span>
            <span aria-hidden="true">·</span>
            <span>{totalPlotsCount} Plot</span>
          </div>

          <button
            type="button"
            onClick={handleExportBackup}
            className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] hover:bg-[#059669] px-4 py-2.5 text-xs font-bold text-[#030712] transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Soo Deji Backup-ka App-ka (.json)</span>
          </button>
        </div>

        {/* Section 2: Validated Restore */}
        <div className="mt-4 p-4 rounded-2xl bg-[#0F1B2D] border border-[#243449] space-y-3">
          <h3 className="text-sm font-bold text-[#F8FAFC]">
            2. Soo Celi Backup La Xaqiijiyey (Restore)
          </h3>

          <p className="text-xs text-[#94A3B8] leading-relaxed">
            Faylka marka hore waa la baarayaa ka hor inta aan xogta hadda jirta la taaban. Faylasha khaldan ama GeoJSON si toos ah ayaa loo diidayaa.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />

          {!pendingRestore ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-[#10B981] px-4 py-2.5 text-xs font-semibold text-[#F8FAFC] transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#10B981]" />
              <span>Dooro Faylka Backup-ka (.json)</span>
            </button>
          ) : (
            <div className="p-3.5 rounded-xl bg-[#0B1220] border border-[#10B981]/50 space-y-3">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#10B981] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#F8FAFC] truncate">
                    Fayl Sax ah: {pendingRestore.fileName}
                  </div>
                  <div className="text-[11px] text-[#94A3B8] font-mono tabular-nums mt-0.5">
                    La kaydiyey: {pendingRestore.preview.exportedAt.slice(0, 10)} · Lacagta:{' '}
                    {pendingRestore.preview.currency}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="p-2 rounded-lg bg-[#0F1B2D] border border-[#243449]">
                  <div className="text-sm font-bold font-mono tabular-nums text-[#F8FAFC]">
                    {pendingRestore.preview.casesCount}
                  </div>
                  <div className="text-[11px] text-[#94A3B8]">Kiisas</div>
                </div>
                <div className="p-2 rounded-lg bg-[#0F1B2D] border border-[#243449]">
                  <div className="text-sm font-bold font-mono tabular-nums text-[#F8FAFC]">
                    {pendingRestore.preview.totalBlocksCount}
                  </div>
                  <div className="text-[11px] text-[#94A3B8]">Blocks</div>
                </div>
                <div className="p-2 rounded-lg bg-[#0F1B2D] border border-[#243449]">
                  <div className="text-sm font-bold font-mono tabular-nums text-[#F8FAFC]">
                    {pendingRestore.preview.totalFullPlotsCount}
                  </div>
                  <div className="text-[11px] text-[#94A3B8]">Plots</div>
                </div>
              </div>

              <div className="text-[11px] text-amber-300 leading-relaxed">
                Xaqiijin: Haddii aad aqbasho, xogta {savedCases.length} kiis ee hadda furan waxaa lagu beddelayaa {pendingRestore.preview.casesCount} kiis oo ku jira Backup-kan.
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPendingRestore(null)}
                  className="flex-1 min-h-[44px] rounded-xl bg-[#0F1B2D] border border-[#243449] text-xs font-semibold text-[#F8FAFC] cursor-pointer"
                >
                  Jooji
                </button>
                <button
                  type="button"
                  onClick={handleApplyValidatedRestore}
                  className="flex-1 min-h-[44px] rounded-xl bg-[#10B981] hover:bg-[#059669] text-xs font-bold text-[#030712] cursor-pointer"
                >
                  Xaqiiji &amp; Soo Celi
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
