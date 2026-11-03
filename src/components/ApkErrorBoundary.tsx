import React from 'react';
import { RotateCcw, ShieldAlert } from 'lucide-react';

interface ApkErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ApkErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ApkErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): ApkErrorBoundaryState {
    const msg =
      error instanceof Error
        ? error.message
        : 'Cilad lama filaan ah ayaa dhacday xilliga bandhigga.';
    return {
      hasError: true,
      errorMessage: msg,
    };
  }

  private handleReload = () => {
    this.setState({ hasError: false, errorMessage: '' });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleResetTransientCache = () => {
    try {
      sessionStorage.clear();
      localStorage.removeItem('faraid_gis_subdivision_state_v2');
    } catch {
      // ignore storage errors
    }
    this.handleReload();
  };

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-dvh bg-[#060D18] text-[#F8FAFC] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-[#0B1220] border border-[#243449] p-5 space-y-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-extrabold text-[#F8FAFC]">
                App-ku Wuu Ilaashan Yahay — Dib u Fur
              </h1>
              <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                Kiisaskaaga dhaxalka iyo xogta la kaydiyey waa badqabaan. Riix badhanka hoose si
                shaashadda dib loogu cusboonaysiiyo.
              </p>
            </div>
          </div>

          {this.state.errorMessage && (
            <div className="rounded-xl bg-[#060D18] border border-[#243449] px-3 py-2 text-[11px] font-mono text-[#94A3B8] break-words">
              {this.state.errorMessage}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 min-h-[44px] rounded-xl bg-[#22C55E] hover:bg-[#16A34A] text-[#05130B] px-4 py-2 text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>Dib u fur App-ka</span>
            </button>
            <button
              type="button"
              onClick={this.handleResetTransientCache}
              className="min-h-[44px] rounded-xl bg-[#0F1B2D] hover:bg-[#16263D] border border-[#243449] text-[#CBD5E1] px-3.5 py-2 text-xs font-bold cursor-pointer"
            >
              Nadiifi Khariidadda Ku-meel-gaadhka
            </button>
          </div>
        </div>
      </div>
    );
  }
}
