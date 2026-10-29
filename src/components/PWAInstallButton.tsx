import React, { useState } from 'react';
import { Download, Smartphone, Share, PlusSquare, CheckCircle2, WifiOff, X } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../utils/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'sidebar' | 'banner';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Hide install button when already running in standalone installed APK/PWA mode
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  const buttonClasses =
    variant === 'sidebar'
      ? 'w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-[#0F1B2D] hover:bg-[#16263f] border border-[#243449] hover:border-[#10B981]/60 px-4 py-2.5 text-xs font-bold text-[#F8FAFC] transition-colors whitespace-nowrap cursor-pointer'
      : variant === 'banner'
      ? 'min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] text-[#030712] hover:bg-[#059669] px-4 py-2.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer'
      : 'min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0F1B2D] border border-[#243449] hover:border-[#10B981]/60 px-3 py-1.5 text-xs font-bold text-[#F8FAFC] transition-colors whitespace-nowrap cursor-pointer';

  return (
    <>
      <button onClick={handleClick} className={buttonClasses} type="button">
        <Download className="w-4 h-4 text-[#10B981] shrink-0" />
        <span>{isIOS ? 'Ku Dar iPhone' : 'Soo Deji App'}</span>
      </button>

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4 no-print">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[#0B1220] border border-[#243449] p-6 shadow-2xl text-[#F8FAFC]">
            <div className="w-10 h-1.5 bg-[#243449] rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#F8FAFC]">
                    Ku Shub App-ka (Android / Home Screen)
                  </h3>
                  <p className="text-xs text-[#94A3B8] mt-0.5">
                    Xisaabta Faraa&apos;idka iyo xogta GIS ee kaydsan Offline ayay ku shaqeeyaan
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] rounded-xl cursor-pointer"
                type="button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <div className="mt-5 space-y-3 text-sm text-[#F8FAFC] bg-[#0F1B2D] border border-[#243449] rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Share className="w-5 h-5 text-[#10B981] shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed">
                    <strong>1.</strong> Riix badhanka <strong>Share</strong> ee ku yaalla qaybta hoose ee Safari.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <PlusSquare className="w-5 h-5 text-[#10B981] shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed">
                    <strong>2.</strong> Dooro <strong>Add to Home Screen</strong> kadibna taabo <strong>Add</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3 text-xs text-[#F8FAFC] bg-[#0F1B2D] border border-[#243449] rounded-xl p-4 leading-relaxed">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                  <p>
                    <strong>Android (Chrome):</strong> Taabo saddexda dhibcood <strong>(⋮)</strong> kadibna dooro <strong>Install App</strong> ama <strong>Add to Home Screen</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                  <p>
                    <strong>Fiiro Gaar ah (Offline):</strong> Xisaabta dhaxalka, kiisaska kaydsan, iyo xogta GIS ee telefoonka ku jirta waxay u shaqeeyaan Offline; khariidadaha dayax-gacmeedka ee internetka waxay u baahan yihiin khadka.
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowGuideModal(false)}
              type="button"
              className="mt-5 w-full min-h-[46px] rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#030712] text-xs font-bold transition-colors cursor-pointer"
            >
              Waan Fahmay
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-5 left-4 right-22 sm:right-auto z-40 flex items-center gap-2 rounded-xl bg-[#0F1B2D] border border-amber-500/50 px-3.5 py-2.5 text-xs font-semibold text-amber-200 shadow-lg no-print">
      <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
      <span>
        Offline Mode: Vector GIS, Tiles-kii la kaydiyey &amp; Xisaabta Dhaxalku way shaqaynayaan
      </span>
    </div>
  );
};
