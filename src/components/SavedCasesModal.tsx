import { useState } from 'react';
import { CaseLifecycleStatus, SavedInheritanceCase, Currency } from '../types/inheritance';
import { CASE_STATUS_METADATA, doesCaseHoldImportantData } from '../utils/caseManagementEngine';
import {
  FolderClock,
  X,
  Trash2,
  ArrowUpRight,
  Coins,
  Users,
  Calendar,
  Search,
  MapPin,
  AlertTriangle,
  Plus,
} from 'lucide-react';

interface SavedCasesModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedCases: SavedInheritanceCase[];
  activeCaseId?: string | null;
  onSelectCase: (savedCase: SavedInheritanceCase) => void;
  onDeleteCase: (id: string) => void;
  onOpenCaseManager?: () => void;
  currency: Currency;
}

function getDarkStatusColor(status: CaseLifecycleStatus): string {
  switch (status) {
    case 'cusub':
      return 'text-sky-400';
    case 'socda':
      return 'text-[#10B981]';
    case 'la_xaqiijiyey':
      return 'text-emerald-300';
    case 'la_xidhay':
      return 'text-amber-400';
  }
}

export function SavedCasesModal({
  isOpen,
  onClose,
  savedCases,
  activeCaseId,
  onSelectCase,
  onDeleteCase,
  onOpenCaseManager,
  currency,
}: SavedCasesModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CaseLifecycleStatus | 'all'>('all');
  const [confirmDeleteCase, setConfirmDeleteCase] = useState<SavedInheritanceCase | null>(null);

  if (!isOpen) return null;

  const filtered = savedCases.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.caseName.toLowerCase().includes(q) ||
      c.referenceNumber.toLowerCase().includes(q) ||
      (c.deceasedName || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto no-print">
      <div className="bg-[#0B1220] border border-[#243449] text-[#F8FAFC] rounded-t-3xl sm:rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#243449] flex items-center justify-between bg-[#0F1B2D]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-[#10B981]/15 text-[#10B981] shrink-0">
              <FolderClock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#F8FAFC] truncate">
                Diiwaanka Kiisaska ({savedCases.length})
              </h2>
              <p className="text-xs text-[#94A3B8] truncate">
                Kiis kasta wuxuu leeyahay Reference Number iyo kayd u gaar ah
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenCaseManager && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCaseManager();
                }}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-[#030712] bg-[#10B981] hover:bg-[#059669] rounded-xl transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>List Data</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] rounded-xl hover:bg-[#0B1220] transition-colors cursor-pointer"
              aria-label="Xir"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="px-5 sm:px-6 py-3 border-b border-[#243449] flex flex-wrap items-center justify-between gap-2.5 bg-[#0B1220]">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0F1B2D] border border-[#243449] rounded-xl">
            {(
              [
                { id: 'all', label: 'Dhammaan' },
                { id: 'cusub', label: 'Cusub' },
                { id: 'socda', label: 'Socda' },
                { id: 'la_xaqiijiyey', label: 'La xaqiijiyey' },
                { id: 'la_xidhay', label: 'La xidhay' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStatusFilter(t.id)}
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  statusFilter === t.id
                    ? 'bg-[#10B981] text-[#030712]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Raadi magaca kiiska ama Ref No..."
              className="w-full min-h-[40px] bg-[#0F1B2D] border border-[#243449] focus:border-[#10B981] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none"
            />
          </div>
        </div>

        {/* Safe Delete Warning Banner */}
        {confirmDeleteCase && (
          <div className="px-5 sm:px-6 py-3.5 bg-red-950/60 border-b border-red-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5 text-red-200">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">
                  Ma hubtaa inaad tirtirto {confirmDeleteCase.caseName} (
                  {confirmDeleteCase.referenceNumber})?
                </span>
                {doesCaseHoldImportantData(confirmDeleteCase) && (
                  <p className="text-[11px] text-red-300 mt-0.5">
                    Kiiskani wuxuu leeyahay {confirmDeleteCase.heirCount} dhaxale
                    {confirmDeleteCase.hasMapGeometry
                      ? ` iyo khariidad (${confirmDeleteCase.blocksCount || 0} Blk / ${
                          confirmDeleteCase.fullPlotsCount || 0
                        } Plot)`
                      : ''}
                    . Tirtiriddu waxba kama beddelayso kiisaska kale.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmDeleteCase(null)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#243449] bg-[#0F1B2D] text-[#F8FAFC] font-bold cursor-pointer"
              >
                Jooji
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteCase(confirmDeleteCase.id);
                  setConfirmDeleteCase(null);
                }}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold cursor-pointer"
              >
                Xaqiiji Tirtiridda
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-2.5">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-[#94A3B8] text-xs">
              <FolderClock className="w-9 h-9 mx-auto mb-2 text-[#94A3B8]/50" />
              <p className="font-semibold text-[#F8FAFC]">Lama helin kiis diiwaangashan.</p>
            </div>
          ) : (
            filtered.map((c) => {
              const isCurrent = activeCaseId === c.id;
              const stMeta = CASE_STATUS_METADATA[c.status];
              return (
                <div
                  key={c.id}
                  className={`p-4 border rounded-xl transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCurrent
                      ? 'bg-[#0F1B2D] border-[#10B981]/60'
                      : 'bg-[#0F1B2D]/70 border-[#243449] hover:border-[#10B981]/40'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono-numbers font-bold text-[#10B981]">
                        {c.referenceNumber}
                      </span>
                      <span className="text-[#243449]">·</span>
                      <span className="text-sm font-bold text-[#F8FAFC] truncate">
                        {c.caseName}
                      </span>
                      <span className="text-[#243449]">·</span>
                      <span className={`font-semibold ${getDarkStatusColor(c.status)}`}>
                        {stMeta.labelSomali}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#94A3B8]">
                      <span className="inline-flex items-center gap-1 font-mono-numbers">
                        <Calendar className="w-3.5 h-3.5 text-[#94A3B8]" />
                        <span>{c.caseDate}</span>
                      </span>
                      <span className="text-[#243449]">·</span>
                      <span className="inline-flex items-center gap-1 font-mono-numbers font-semibold text-[#10B981]">
                        <Coins className="w-3.5 h-3.5" />
                        <span>
                          ${c.totalNetEstateUSD.toLocaleString()} {currency}
                        </span>
                      </span>
                      <span className="text-[#243449]">·</span>
                      <span className="inline-flex items-center gap-1 font-mono-numbers">
                        <Users className="w-3.5 h-3.5 text-[#94A3B8]" />
                        <span>{c.heirCount} Ehel</span>
                      </span>
                      <span className="text-[#243449]">·</span>
                      <span className="inline-flex items-center gap-1 font-mono-numbers">
                        <MapPin className="w-3.5 h-3.5 text-[#10B981]" />
                        <span>
                          {c.hasMapGeometry
                            ? `${c.blocksCount || 0} Blk · ${c.fullPlotsCount || 0} Plot · ${
                                c.validHalfPlotsCount || 0
                              } Half`
                            : 'Khariidad ma laha'}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectCase(c);
                        onClose();
                      }}
                      className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-[#0B1220] border border-[#10B981]/50 text-[#10B981]'
                          : 'bg-[#10B981] hover:bg-[#059669] text-[#030712]'
                      }`}
                    >
                      <span>{isCurrent ? 'Waa Furan Yahay' : 'Fur Kiiskan'}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteCase(c)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#94A3B8] hover:text-red-400 hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer"
                      title="Tirtir kiiskan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
