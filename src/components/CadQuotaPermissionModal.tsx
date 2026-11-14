import React from 'react';
import { AlertTriangle, Check, ShieldAlert, X } from 'lucide-react';
import { IndividualHeirPlotAllocation } from '../types/landSubdivision';
import { HeirPlotQuotaStatus } from '../utils/landSubdivisionEngine';

interface CadQuotaPermissionModalProps {
  isOpen: boolean;
  targetDescription: string;
  heir: IndividualHeirPlotAllocation | null;
  quotaStatus: HeirPlotQuotaStatus | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const CadQuotaPermissionModal: React.FC<CadQuotaPermissionModalProps> = ({
  isOpen,
  targetDescription,
  heir,
  quotaStatus,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen || !heir || !quotaStatus) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cad-quota-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white text-amber-600">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3
                id="cad-quota-modal-title"
                className="text-sm font-bold text-slate-900 leading-snug"
              >
                Oggolaansho: Tirada Dhaxlaha Way Buuxdaa
              </h3>
              <p className="mt-0.5 text-xs text-amber-900/90">
                Dhaxalahan saamigiisii dhulka waa buuxsamay ama wuu dhaafayaa.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-slate-500 hover:bg-amber-100 hover:text-slate-800 transition-colors"
            aria-label="Xidh"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4 text-xs">
          {/* Selected Heir Row */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="h-4 w-4 shrink-0 rounded-sm border border-black/15"
                style={{ backgroundColor: heir.colorHex }}
              />
              <div className="min-w-0">
                <div className="truncate font-bold text-slate-900 text-[13px]">
                  {heir.personName}
                </div>
                <div className="truncate text-[11px] text-slate-500">
                  {heir.roleTitleSomali} · {heir.individualPercentage.toFixed(2)}%
                </div>
              </div>
            </div>
            <div className="text-right shrink-0 tabular-nums">
              <div className="text-[11px] text-slate-500">Bartilmaameedka</div>
              <div className="font-bold text-slate-900">
                {targetDescription}
              </div>
            </div>
          </div>

          {/* Numeric Quota Comparison Grid */}
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white p-3 tabular-nums">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Hadda Haysto
              </div>
              <div className="mt-0.5 text-sm font-bold text-slate-900">
                {quotaStatus.currentReceived}
                <span className="text-[11px] font-normal text-slate-500">
                  {' '}
                  / {quotaStatus.roundedTarget} plot
                </span>
              </div>
              <div className="text-[10px] text-slate-500">
                Saami: {quotaStatus.exactQuota.toFixed(2)}
              </div>
            </div>

            <div className="border-l border-slate-200 pl-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Lagu Darayo
              </div>
              <div className="mt-0.5 text-sm font-bold text-blue-700">
                +{quotaStatus.addingPlotUnits} plot
              </div>
              <div className="text-[10px] text-slate-500">Calaamad gacanta ah</div>
            </div>

            <div className="border-l border-slate-200 pl-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-amber-700">
                Wadarta Cusub
              </div>
              <div className="mt-0.5 text-sm font-bold text-amber-700">
                {quotaStatus.projectedTotal} plot
              </div>
              <div className="text-[10px] font-medium text-amber-700">
                +{quotaStatus.overagePlots} dheeraad ah
              </div>
            </div>
          </div>

          {/* Warning Note */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-[11px] leading-relaxed text-amber-950">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Haddii aad oggolaato, <strong>{heir.personName}</strong> waxa uu yeelan doonaa{' '}
              <strong className="tabular-nums">{quotaStatus.projectedTotal} plot</strong> halkii
              uu saamigiisu ahaa{' '}
              <strong className="tabular-nums">{quotaStatus.exactQuota.toFixed(2)} plot</strong>. Ma
              hubtaa inaad u sii socoto oo lagu daro?
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap transition-colors"
          >
            Jooji (Ha ku darin)
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 whitespace-nowrap transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
            Haa, Oggolow & Ku Dar
          </button>
        </div>
      </div>
    </div>
  );
};
