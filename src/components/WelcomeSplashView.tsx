import React from 'react';
import { ArrowRight, Wifi, WifiOff, Globe, Calculator } from 'lucide-react';
import { BrandCubeLogo } from './BrandCubeLogo';
import { useOnlineStatus } from '../utils/usePWAInstall';
import { PWAInstallButton } from './PWAInstallButton';

interface WelcomeSplashViewProps {
  savedCasesCount: number;
  plotsCount: number;
  onStart: () => void;
  onOpenCalculatorDirectly: () => void;
}

export const WelcomeSplashView: React.FC<WelcomeSplashViewProps> = ({
  savedCasesCount,
  plotsCount,
  onStart,
  onOpenCalculatorDirectly,
}) => {
  const isOnline = useOnlineStatus();

  return (
    <div className="min-h-screen w-full bg-[#060D18] text-[#F8FAFC] relative overflow-hidden flex flex-col justify-between px-6 py-8 pt-safe pb-safe select-none">
      {/* Subtle Architectural GIS Coordinate Grid Backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-35 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(36, 52, 73, 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(36, 52, 73, 0.35) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-[#10B981]/10 blur-3xl pointer-events-none"
      />

      {/* Top Connectivity & Mode Strip */}
      <div className="relative z-10 max-w-md w-full mx-auto flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#94A3B8]">
          {isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-[#22C55E]" />
              <span>Khad Leh · OSM &amp; Dayax-gacmeed Bilaash ah</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
              <span>Bilaa Khad · Khariidad &amp; Xisaab</span>
            </>
          )}
        </div>
        <PWAInstallButton variant="header" />
      </div>

      {/* Center Hero Brand Identity (Exact Reference Screen 1 Match) */}
      <div className="relative z-10 max-w-md w-full mx-auto my-auto py-8 flex flex-col items-center text-center">
        <BrandCubeLogo size="lg" className="mb-6" />

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#F8FAFC]">
          Beerta &amp; Dhaxalka
        </h1>

        <p className="mt-2 text-base sm:text-lg font-semibold text-[#34D399] tracking-wide">
          Maaraynta Beerta &amp; GIS
        </p>

        <p className="mt-4 text-sm sm:text-base text-[#94A3B8] max-w-xs leading-relaxed">
          Maaree dhulka, xisaabi dhaxalka, si sax ah oo casri ah.
        </p>

        {/* Capabilities Summary */}
        <div className="mt-7 w-full grid grid-cols-2 gap-2.5 text-left">
          <div className="rounded-2xl bg-[#0F1B2D]/90 border border-[#243449] p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[#F8FAFC]">
              <Globe className="w-4 h-4 text-[#22C55E] shrink-0" />
              <span>OSM &amp; Dayax-gacmeed</span>
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-1 leading-snug">
              Khariidadaha bilaashka ah &amp; Khariidadda Bilaa Khadka
            </p>
          </div>

          <div className="rounded-2xl bg-[#0F1B2D]/90 border border-[#243449] p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[#F8FAFC]">
              <Calculator className="w-4 h-4 text-[#22C55E] shrink-0" />
              <span>Faraa&apos;idka Islaamka</span>
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-1 leading-snug tabular-nums">
              {savedCasesCount} Kiis · {plotsCount} Plot oo diyaarsan
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Primary CTA Zone */}
      <div className="relative z-10 max-w-md w-full mx-auto space-y-3">
        <button
          type="button"
          onClick={onStart}
          className="w-full min-h-[54px] rounded-full bg-[#22C55E] hover:bg-[#16A34A] active:scale-[0.98] text-[#05130B] font-extrabold text-base flex items-center justify-center gap-2.5 shadow-[0_10px_28px_rgba(34,197,94,0.32)] transition-all cursor-pointer"
        >
          <span>Bilow</span>
          <ArrowRight className="w-5 h-5 stroke-[2.5]" />
        </button>

        <button
          type="button"
          onClick={onOpenCalculatorDirectly}
          className="w-full min-h-[44px] rounded-full text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
        >
          Toos u fur Xisaabiyaha Dhaxalka
        </button>
      </div>
    </div>
  );
};
