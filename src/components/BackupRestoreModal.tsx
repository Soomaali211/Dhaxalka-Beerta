import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudDownload,
  CloudUpload,
  DatabaseBackup,
  Download,
  FileJson,
  HardDrive,
  LogOut,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Currency, SavedInheritanceCase } from '../types/inheritance';
import {
  ValidatedBackupPreview,
  createApplicationBackupPayload,
  downloadApplicationBackupJSON,
  validateApplicationBackupJSON,
} from '../utils/backupRestoreEngine';
import { ANDROID_SAFE_JSON_BACKUP_ACCEPT } from '../utils/kmlAndGeoJsonParser';
import {
  DriveBackupFileMetadata,
  GoogleAccountProfile,
  createDriveBackupFile,
  deleteDriveBackupFile,
  downloadDriveBackupFileContent,
  googleSignIn,
  initAuth,
  listDriveBackupFiles,
  logout,
  overwriteDriveBackupFile,
} from '../utils/googleDriveSync';
import { GoogleSignInButton } from './GoogleSignInButton';

export type BackupRestoreMode = 'replace' | 'merge';

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
    mode?: BackupRestoreMode;
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

  const [activeTab, setActiveTab] = useState<'google_drive' | 'local_file'>('google_drive');

  // Google Auth & Drive State
  const [googleUser, setGoogleUser] = useState<GoogleAccountProfile | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [driveFiles, setDriveFiles] = useState<DriveBackupFileMetadata[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState<boolean>(false);
  const [isUploadingDrive, setIsUploadingDrive] = useState<boolean>(false);
  const [driveActionFileId, setDriveActionFileId] = useState<string | null>(null);
  const [cloudSaveScope, setCloudSaveScope] = useState<'all_cases' | 'active_case'>('all_cases');

  // Mandatory Confirmation Dialogs for Overwrite (PATCH) and Delete (DELETE) on Google Drive
  const [confirmOverwriteTarget, setConfirmOverwriteTarget] =
    useState<DriveBackupFileMetadata | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] =
    useState<DriveBackupFileMetadata | null>(null);

  // Feedback & Validated Restore Preview (shared by Drive & Local JSON)
  const [statusNotice, setStatusNotice] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  const [pendingRestore, setPendingRestore] = useState<{
    fileName: string;
    source: 'google_drive' | 'local_file';
    preview: ValidatedBackupPreview;
    hydratedCases: SavedInheritanceCase[];
    activeCaseId: string;
    currency: Currency;
  } | null>(null);

  useEffect(() => {
    const unsub = initAuth(
      (profile) => {
        setGoogleUser(profile);
      },
      () => {
        setGoogleUser(null);
      }
    );
    return () => unsub();
  }, []);

  const refreshDriveFiles = useCallback(async () => {
    setIsLoadingDrive(true);
    setStatusNotice(null);
    try {
      const files = await listDriveBackupFiles();
      setDriveFiles(files);
    } catch (err) {
      setStatusNotice({
        kind: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Liiska Google Drive lama soo akhrin karin. Fadlan mar kale gal akoonkaaga.',
      });
    } finally {
      setIsLoadingDrive(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && googleUser && activeTab === 'google_drive') {
      void refreshDriveFiles();
    }
  }, [isOpen, googleUser, activeTab, refreshDriveFiles]);

  if (!isOpen) return null;

  const activeCaseObj = savedCases.find((c) => c.id === activeCaseId) || savedCases[0] || null;
  const casesWithMapCount = savedCases.filter((c) => c.hasMapGeometry).length;

  const buildBackupJsonForSelectedScope = (): {
    fileName: string;
    jsonContent: string;
    casesCount: number;
  } | null => {
    const targetCases =
      cloudSaveScope === 'active_case' && activeCaseObj ? [activeCaseObj] : savedCases;
    if (targetCases.length === 0) return null;

    const payload = createApplicationBackupPayload({
      savedCases: targetCases,
      activeCaseId: activeCaseObj ? activeCaseObj.id : activeCaseId,
      currency,
    });
    const dateStamp = payload.exportedAt.slice(0, 10);
    const cleanRef = activeCaseObj
      ? activeCaseObj.referenceNumber.replace(/[^a-zA-Z0-9_-]/g, '_')
      : 'Kiis';
    const fileName =
      cloudSaveScope === 'active_case' && activeCaseObj
        ? `${cleanRef}_Dhaxalka_${dateStamp}.json`
        : `GIS_Dhaxalka_Backup_${dateStamp}.json`;

    return {
      fileName,
      jsonContent: JSON.stringify(payload, null, 2),
      casesCount: targetCases.length,
    };
  };

  const handleGoogleSignIn = async () => {
    setStatusNotice(null);
    setIsSigningIn(true);
    try {
      const authRes = await googleSignIn();
      if (!authRes) return;
      const { user } = authRes;
      setGoogleUser(user);
      const files = await listDriveBackupFiles();
      setDriveFiles(files);
      setStatusNotice({
        kind: 'success',
        message: `Si guul leh ayaad ugu xidhatay Google Drive (${user.email || user.displayName || 'Akoonkaaga'}).`,
      });
    } catch (err) {
      setStatusNotice({
        kind: 'error',
        message:
          err instanceof Error
            ? `Google Sign-In ma shaqayn: ${err.message}`
            : 'Google Sign-In waa la joojiyey ama khalad ayaa dhacay.',
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await logout();
    setGoogleUser(null);
    setDriveFiles([]);
    setConfirmOverwriteTarget(null);
    setConfirmDeleteTarget(null);
    setStatusNotice({
      kind: 'success',
      message: 'Akoonka Google Drive waa laga baxay.',
    });
  };

  const handleSaveNewToDrive = async () => {
    setStatusNotice(null);
    const built = buildBackupJsonForSelectedScope();
    if (!built) {
      setStatusNotice({
        kind: 'error',
        message: 'Ma jiro kiis diyaar u ah in lagu kaydiyo Google Drive.',
      });
      return;
    }

    setIsUploadingDrive(true);
    try {
      const backupKind = cloudSaveScope === 'active_case' ? 'single_case' : 'all_cases';
      const created = await createDriveBackupFile({
        fileName: built.fileName,
        jsonContent: built.jsonContent,
        casesCount: built.casesCount,
        backupKind,
        caseRef: cloudSaveScope === 'active_case' ? activeCaseObj?.referenceNumber : undefined,
      });
      setDriveFiles((prev) => [created, ...prev.filter((f) => f.id !== created.id)]);
      setStatusNotice({
        kind: 'success',
        message: `Waa lagu kaydiyey Google Drive: "${created.name}" (${built.casesCount} kiis).`,
      });
    } catch (err) {
      setStatusNotice({
        kind: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Kaydinta Google Drive way fashilantay.',
      });
    } finally {
      setIsUploadingDrive(false);
    }
  };

  const handleExecuteConfirmedOverwrite = async () => {
    if (!confirmOverwriteTarget) return;
    const target = confirmOverwriteTarget;
    const built = buildBackupJsonForSelectedScope();
    if (!built) return;

    setDriveActionFileId(target.id);
    setStatusNotice(null);
    try {
      const backupKind = cloudSaveScope === 'active_case' ? 'single_case' : 'all_cases';
      const updated = await overwriteDriveBackupFile({
        fileId: target.id,
        fileName: target.name,
        jsonContent: built.jsonContent,
        casesCount: built.casesCount,
        backupKind,
        caseRef: cloudSaveScope === 'active_case' ? activeCaseObj?.referenceNumber : undefined,
      });
      setDriveFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setConfirmOverwriteTarget(null);
      setStatusNotice({
        kind: 'success',
        message: `Faylka "${updated.name}" ee Google Drive si guul leh ayaa loo cusbooneysiiyey (${built.casesCount} kiis).`,
      });
    } catch (err) {
      setStatusNotice({
        kind: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Cusbooneysiinta faylka Google Drive way fashilantay.',
      });
    } finally {
      setDriveActionFileId(null);
    }
  };

  const handleExecuteConfirmedDelete = async () => {
    if (!confirmDeleteTarget) return;
    const target = confirmDeleteTarget;

    setDriveActionFileId(target.id);
    setStatusNotice(null);
    try {
      await deleteDriveBackupFile(target.id);
      setDriveFiles((prev) => prev.filter((f) => f.id !== target.id));
      setConfirmDeleteTarget(null);
      setStatusNotice({
        kind: 'success',
        message: `Faylka "${target.name}" waa laga tirtiray Google Drive.`,
      });
    } catch (err) {
      setStatusNotice({
        kind: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Tirtiridda faylka Google Drive way fashilantay.',
      });
    } finally {
      setDriveActionFileId(null);
    }
  };

  const handlePreviewRestoreFromDrive = async (file: DriveBackupFileMetadata) => {
    setDriveActionFileId(file.id);
    setStatusNotice(null);
    setPendingRestore(null);
    try {
      const rawText = await downloadDriveBackupFileContent(file.id);
      const check = validateApplicationBackupJSON(rawText);
      if (check.ok === false) {
        setStatusNotice({
          kind: 'error',
          message: check.errorSomali,
        });
        return;
      }
      setPendingRestore({
        fileName: file.name,
        source: 'google_drive',
        preview: check.preview,
        hydratedCases: check.hydratedCases,
        activeCaseId: check.activeCaseId,
        currency: check.currency,
      });
    } catch (err) {
      setStatusNotice({
        kind: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Soo dejinta faylka Google Drive way fashilantay.',
      });
    } finally {
      setDriveActionFileId(null);
    }
  };

  const handleDownloadLocalBackup = () => {
    setStatusNotice(null);
    const res = downloadApplicationBackupJSON({
      savedCases,
      activeCaseId,
      currency,
    });
    if (res.ok === false) {
      setStatusNotice({ kind: 'error', message: res.errorSomali });
      return;
    }
    setStatusNotice({
      kind: 'success',
      message: `Backup dhammaystiran waa la soo dejiyey (${res.fileName}) — wuxuu ka kooban yahay ${res.casesCount} kiis.`,
    });
  };

  const handleLocalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setStatusNotice(null);
    setPendingRestore(null);

    try {
      const rawText = await file.text();
      const check = validateApplicationBackupJSON(rawText);
      if (check.ok === false) {
        setStatusNotice({
          kind: 'error',
          message: check.errorSomali,
        });
        return;
      }

      setPendingRestore({
        fileName: file.name,
        source: 'local_file',
        preview: check.preview,
        hydratedCases: check.hydratedCases,
        activeCaseId: check.activeCaseId,
        currency: check.currency,
      });
    } catch {
      setStatusNotice({
        kind: 'error',
        message: 'Faylka lama akhrin karin. Fadlan hubi inuu yahay fayl JSON sax ah.',
      });
    }
  };

  const handleExecuteRestore = (mode: BackupRestoreMode) => {
    if (!pendingRestore) return;
    onConfirmRestore({
      hydratedCases: pendingRestore.hydratedCases,
      activeCaseId: pendingRestore.activeCaseId,
      currency: pendingRestore.currency,
      preview: pendingRestore.preview,
      mode,
    });
    setPendingRestore(null);
    onClose();
  };

  const formatFileSize = (sizeVal?: number | string) => {
    const bytes = Number(sizeVal || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto no-print">
      <div className="bg-[#0B1220] border border-[#243449] text-[#F8FAFC] rounded-t-3xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 bg-[#0F1B2D] border-b border-[#243449] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/35 flex items-center justify-center text-[#22C55E] shrink-0">
              <Cloud className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-[#F8FAFC] truncate">
                Google Drive &amp; Kaydka Kiisaska (Cloud Backup)
              </h2>
              <p className="text-[11px] text-[#94A3B8] truncate">
                Ku kaydi ama ka soo celi kiisaska iyo khariidadaha Google Drive ama fayl JSON
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setPendingRestore(null);
              setStatusNotice(null);
              setConfirmOverwriteTarget(null);
              setConfirmDeleteTarget(null);
              onClose();
            }}
            className="min-h-[40px] min-w-[40px] rounded-xl text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0B1220] flex items-center justify-center cursor-pointer"
            aria-label="Xidh"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher: Google Drive Cloud vs Local Device JSON */}
        <div className="px-5 pt-3.5 bg-[#0B1220]">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#0F1B2D] border border-[#243449]">
            <button
              type="button"
              onClick={() => {
                setActiveTab('google_drive');
                setStatusNotice(null);
              }}
              className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'google_drive'
                  ? 'bg-[#22C55E] text-[#030712]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <Cloud className="w-3.5 h-3.5 shrink-0" />
              <span>Google Drive (Cloud)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('local_file');
                setStatusNotice(null);
              }}
              className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'local_file'
                  ? 'bg-[#22C55E] text-[#030712]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5 shrink-0" />
              <span>Faylka Gudaha (.json)</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* Status / Error Banner */}
          {statusNotice && (
            <div
              className={`rounded-xl p-3 border flex items-start gap-2.5 ${
                statusNotice.kind === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/55 border-rose-500/45 text-rose-200'
              }`}
            >
              {statusNotice.kind === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <p className="leading-relaxed font-medium">{statusNotice.message}</p>
            </div>
          )}

          {/* VALIDATED RESTORE PREVIEW & MERGE / REPLACE CONFIRMATION */}
          {pendingRestore && (
            <div className="rounded-2xl border-2 border-[#22C55E] bg-[#0F1B2D] p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-[#22C55E] font-extrabold text-xs">
                  <FileJson className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    Xaqiiji Soo-celinta ({pendingRestore.fileName})
                  </span>
                </div>
                <span className="text-[10.5px] font-bold text-[#94A3B8] shrink-0">
                  {pendingRestore.source === 'google_drive' ? 'Google Drive' : 'Fayl Gudaha'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] tabular-nums">
                <div className="bg-[#0B1220] border border-[#243449] rounded-lg px-2.5 py-1.5">
                  <span className="text-[#94A3B8] block">Kiisas</span>
                  <strong className="text-[#F8FAFC]">{pendingRestore.preview.casesCount} Kiis</strong>
                </div>
                <div className="bg-[#0B1220] border border-[#243449] rounded-lg px-2.5 py-1.5">
                  <span className="text-[#94A3B8] block">Khariidad leh</span>
                  <strong className="text-[#22C55E]">
                    {pendingRestore.preview.casesWithMapCount} Kiis
                  </strong>
                </div>
                <div className="bg-[#0B1220] border border-[#243449] rounded-lg px-2.5 py-1.5">
                  <span className="text-[#94A3B8] block">Wadarta Plots</span>
                  <strong className="text-[#F8FAFC]">
                    {pendingRestore.preview.totalFullPlotsCount} Plot
                  </strong>
                </div>
                <div className="bg-[#0B1220] border border-[#243449] rounded-lg px-2.5 py-1.5">
                  <span className="text-[#94A3B8] block">Taariikhda</span>
                  <strong className="text-[#F8FAFC]">
                    {pendingRestore.preview.exportedAt.slice(0, 10)}
                  </strong>
                </div>
              </div>

              <div className="text-[11px] text-[#CBD5E1] bg-[#0B1220] border border-[#243449] rounded-lg p-2.5 max-h-24 overflow-y-auto">
                <span className="font-bold text-[#94A3B8] block mb-1">
                  Kiisaska ku jira faylkan:
                </span>
                {pendingRestore.preview.caseReferences.join(' · ')}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingRestore(null)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#243449] bg-[#0B1220] text-[#CBD5E1] font-bold hover:text-white cursor-pointer"
                >
                  Jooji
                </button>
                <button
                  type="button"
                  onClick={() => handleExecuteRestore('merge')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#22C55E] hover:bg-[#16A34A] text-[#030712] font-extrabold cursor-pointer"
                >
                  Ku Dar Kiisaska Hadda Jira (Merge)
                </button>
                <button
                  type="button"
                  onClick={() => handleExecuteRestore('replace')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 font-bold cursor-pointer"
                >
                  Ku Beddel Dhammaan ({savedCases.length} kiis)
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================== */}
          {/* TAB 1: GOOGLE DRIVE CLOUD SYNC                                             */}
          {/* ========================================================================== */}
          {activeTab === 'google_drive' && (
            <div className="space-y-4">
              {!googleUser ? (
                <div className="rounded-2xl bg-[#0F1B2D] border border-[#243449] p-5 flex flex-col items-center text-center space-y-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-[#22C55E]/15 border border-[#22C55E]/35 text-[#22C55E] flex items-center justify-center">
                    <Cloud className="w-6 h-6" />
                  </div>
                  <div className="space-y-1 max-w-md">
                    <h3 className="text-sm font-extrabold text-[#F8FAFC]">
                      Ku Xidh Akoonkaaga Google Drive
                    </h3>
                    <p className="text-xs text-[#94A3B8] leading-relaxed">
                      Si aad xogta dhaxalka, magacyada dhaxlayaasha, iyo khariidadaha GIS ugu
                      kaydisato Google Drive-kaaga gaarka ah oo aad uga furato telefoon ama
                      kombiyuutar kasta.
                    </p>
                  </div>
                  <div className="pt-1">
                    <GoogleSignInButton
                      onClick={handleGoogleSignIn}
                      isLoading={isSigningIn}
                      label="Sign in with Google"
                    />
                  </div>
                </div>
              ) : (
                <>
                  {/* Signed-in User Header */}
                  <div className="rounded-2xl bg-[#0F1B2D] border border-[#243449] p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {googleUser.photoURL ? (
                        <img
                          src={googleUser.photoURL}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-full border border-[#243449] shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#22C55E]/20 border border-[#22C55E]/40 text-[#22C55E] font-extrabold flex items-center justify-center shrink-0">
                          {(googleUser.displayName || googleUser.email || 'G')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-extrabold text-[#F8FAFC] truncate">
                          {googleUser.displayName || 'Akoonka Google'}
                        </div>
                        <div className="text-[11px] text-[#94A3B8] truncate">
                          {googleUser.email || 'Google Drive waa ku xidhan yahay'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogleSignOut}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#0B1220] border border-[#243449] hover:border-rose-500/50 text-[#CBD5E1] hover:text-rose-300 font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Ka Bax</span>
                    </button>
                  </div>

                  {/* Save to Google Drive Card */}
                  <div className="rounded-2xl bg-[#0F1B2D] border border-[#243449] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-[#F8FAFC]">
                        1. Ku Kaydi Google Drive
                      </span>
                      <span className="text-[11px] text-[#94A3B8] tabular-nums">
                        {savedCases.length} kiis ({casesWithMapCount} khariidad leh)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCloudSaveScope('all_cases')}
                        className={`text-left rounded-xl border p-2.5 transition-colors cursor-pointer ${
                          cloudSaveScope === 'all_cases'
                            ? 'border-[#22C55E] bg-[#22C55E]/10 text-[#F8FAFC]'
                            : 'border-[#243449] bg-[#0B1220] text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        <div className="font-bold text-xs">
                          Dhammaan Kiisaska ({savedCases.length} Kiis)
                        </div>
                        <div className="text-[10.5px] opacity-80 mt-0.5">
                          Kayd dhammaystiran oo wata dhammaan kiisaska &amp; khariidadaha
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCloudSaveScope('active_case')}
                        className={`text-left rounded-xl border p-2.5 transition-colors cursor-pointer ${
                          cloudSaveScope === 'active_case'
                            ? 'border-[#22C55E] bg-[#22C55E]/10 text-[#F8FAFC]'
                            : 'border-[#243449] bg-[#0B1220] text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        <div className="font-bold text-xs truncate">
                          Kiiska Furan Keliya ({activeCaseObj?.referenceNumber || 'Kiiska'})
                        </div>
                        <div className="text-[10.5px] opacity-80 mt-0.5 truncate">
                          {activeCaseObj?.caseName || 'Kiiska hadda furan oo keliya'}
                        </div>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={isUploadingDrive || savedCases.length === 0}
                      onClick={handleSaveNewToDrive}
                      className="w-full min-h-[44px] rounded-xl bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-50 text-[#030712] font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CloudUpload className="w-4 h-4" />
                      <span>
                        {isUploadingDrive
                          ? 'Waa lagu kaydinayaa Google Drive...'
                          : cloudSaveScope === 'active_case'
                          ? `Ku Kaydi Google Drive (${activeCaseObj?.referenceNumber || 'Kiiska'})`
                          : `Ku Kaydi Google Drive Dhammaan (${savedCases.length} Kiis)`}
                      </span>
                    </button>
                  </div>

                  {/* Mandatory Confirmation Dialog for OVERWRITE (PATCH) */}
                  {confirmOverwriteTarget && (
                    <div className="rounded-xl border border-amber-500/50 bg-amber-950/50 p-3.5 space-y-2.5">
                      <div className="flex items-start gap-2 text-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-extrabold">
                            Ma hubtaa inaad xog cusub ku dul-qorto faylkan Google Drive?
                          </div>
                          <p className="text-[11px] text-amber-200/85 mt-0.5">
                            Faylka <strong>&ldquo;{confirmOverwriteTarget.name}&rdquo;</strong> ee ku
                            jira Google Drive waxaa lagu beddelayaa xogta hadda furan.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmOverwriteTarget(null)}
                          className="min-h-[34px] px-3 py-1 rounded-lg bg-[#0B1220] border border-[#243449] text-[#F8FAFC] font-bold cursor-pointer"
                        >
                          Jooji
                        </button>
                        <button
                          type="button"
                          disabled={driveActionFileId === confirmOverwriteTarget.id}
                          onClick={handleExecuteConfirmedOverwrite}
                          className="min-h-[34px] px-3.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#030712] font-extrabold cursor-pointer disabled:opacity-50"
                        >
                          {driveActionFileId === confirmOverwriteTarget.id
                            ? 'Waa la cusbooneysiinayaa...'
                            : 'Haa, Ku Dul-Qor (Update)'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mandatory Confirmation Dialog for DELETE */}
                  {confirmDeleteTarget && (
                    <div className="rounded-xl border border-rose-500/50 bg-rose-950/55 p-3.5 space-y-2.5">
                      <div className="flex items-start gap-2 text-rose-200">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-extrabold">
                            Ma hubtaa inaad Google Drive ka tirtirto faylkan?
                          </div>
                          <p className="text-[11px] text-rose-200/85 mt-0.5">
                            Faylka <strong>&ldquo;{confirmDeleteTarget.name}&rdquo;</strong> si
                            joogto ah ayaa looga tirtirayaa Google Drive-kaaga.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTarget(null)}
                          className="min-h-[34px] px-3 py-1 rounded-lg bg-[#0B1220] border border-[#243449] text-[#F8FAFC] font-bold cursor-pointer"
                        >
                          Jooji
                        </button>
                        <button
                          type="button"
                          disabled={driveActionFileId === confirmDeleteTarget.id}
                          onClick={handleExecuteConfirmedDelete}
                          className="min-h-[34px] px-3.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold cursor-pointer disabled:opacity-50"
                        >
                          {driveActionFileId === confirmDeleteTarget.id
                            ? 'Waa la tirtirayaa...'
                            : 'Haa, Tirtir'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Saved Backups List in Google Drive */}
                  <div className="rounded-2xl bg-[#0F1B2D] border border-[#243449] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-[#F8FAFC]">
                        2. Kaydadka Ku Jira Google Drive ({driveFiles.length})
                      </span>
                      <button
                        type="button"
                        disabled={isLoadingDrive}
                        onClick={refreshDriveFiles}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#0B1220] border border-[#243449] hover:border-[#22C55E]/60 text-[11px] font-bold text-[#CBD5E1] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 text-[#22C55E] ${
                            isLoadingDrive ? 'animate-spin' : ''
                          }`}
                        />
                        <span>Cusbooneysii</span>
                      </button>
                    </div>

                    {isLoadingDrive ? (
                      <div className="py-6 text-center text-[#94A3B8]">
                        Waa laga soo akhrinayaa Google Drive...
                      </div>
                    ) : driveFiles.length === 0 ? (
                      <div className="py-6 text-center text-[#94A3B8] bg-[#0B1220]/70 rounded-xl border border-[#243449]">
                        Weli wax kayd ah kuma jiro Google Drive-kaaga. Riix badhanka sare ee{' '}
                        <strong className="text-[#F8FAFC]">Ku Kaydi Google Drive</strong>.
                      </div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                        {driveFiles.map((df) => {
                          const isBusy = driveActionFileId === df.id;
                          const modDate = df.modifiedTime ? df.modifiedTime.slice(0, 16).replace('T', ' ') : '';
                          const sizeTxt = formatFileSize(df.sizeBytes);
                          return (
                            <div
                              key={df.id}
                              className="rounded-xl bg-[#0B1220] border border-[#243449] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-[#F8FAFC] truncate">{df.name}</div>
                                <div className="text-[11px] text-[#94A3B8] tabular-nums mt-0.5">
                                  {modDate}
                                  {sizeTxt ? ` · ${sizeTxt}` : ''}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handlePreviewRestoreFromDrive(df)}
                                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#22C55E] hover:bg-[#16A34A] text-[#030712] font-extrabold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <CloudDownload className="w-3.5 h-3.5" />
                                  <span>{isBusy ? '...' : 'Soo Celi'}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setConfirmDeleteTarget(null);
                                    setConfirmOverwriteTarget(df);
                                  }}
                                  title="Ku dul-qor xogta hadda furan"
                                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#0F1B2D] border border-[#243449] hover:border-amber-400/60 text-[#CBD5E1] hover:text-amber-300 font-bold cursor-pointer disabled:opacity-50"
                                >
                                  Update
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setConfirmOverwriteTarget(null);
                                    setConfirmDeleteTarget(df);
                                  }}
                                  title="Ka tirtir Google Drive"
                                  className="min-h-[36px] min-w-[36px] rounded-lg bg-[#0F1B2D] border border-[#243449] hover:border-rose-500/60 text-[#94A3B8] hover:text-rose-400 flex items-center justify-center cursor-pointer disabled:opacity-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ========================================================================== */}
          {/* TAB 2: LOCAL DEVICE JSON BACKUP & RESTORE                                  */}
          {/* ========================================================================== */}
          {activeTab === 'local_file' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#243449] bg-[#0F1B2D] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-[#F8FAFC] flex items-center gap-2">
                    <DatabaseBackup className="w-4 h-4 text-[#22C55E]" />
                    <span>1. Soo Deji Kaydka Gudaha (.json)</span>
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-[#94A3B8]">
                    {savedCases.length} kiis · {casesWithMapCount} khariidad
                  </span>
                </div>
                <p className="text-[#94A3B8] leading-relaxed">
                  Waxay dhammaan kiisaskaaga dhaxalka iyo khariidadaha GIS ku kaydinaysaa hal fayl{' '}
                  <strong>.json</strong> oo ku dhacaya telefoonkaaga ama kombiyuutarkaaga.
                </p>
                <button
                  type="button"
                  onClick={handleDownloadLocalBackup}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#22C55E] hover:bg-[#16A34A] text-[#030712] font-extrabold transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Soo Deji Faylka Backup-ka (.json)</span>
                </button>
              </div>

              <div className="rounded-2xl border border-[#243449] bg-[#0F1B2D] p-4 space-y-3">
                <span className="font-extrabold text-[#F8FAFC] block">
                  2. Ka Soo Celi Fayl JSON oo Kaydsan
                </span>
                <p className="text-[#94A3B8] leading-relaxed">
                  Dooro fayl Backup <strong>.json</strong> ah. Marka hore waa la hubinayaa, kadibna
                  waxaad dooran kartaa in kiisaska lagu daro kuwa hadda jira (Merge) ama lagu
                  beddelo.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ANDROID_SAFE_JSON_BACKUP_ACCEPT}
                  onChange={handleLocalFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#243449] bg-[#0B1220] hover:border-[#22C55E]/70 text-[#F8FAFC] font-bold transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-[#22C55E]" />
                  <span>Dooro Faylka Backup-ka (.json)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
