import './utils/pdfPolyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ApkErrorBoundary } from './components/ApkErrorBoundary';
import './index.css';
import {
  installAndroidApkRuntimeBridge,
  isNativeAndroidApkRuntime,
  purgeStaleServiceWorkersInNativeApk,
  shouldForceApkMobileLayout,
  syncApkMobileModeDocumentClass,
} from './utils/androidApkBridge';

// Activate native PDF print, GPS permission & file export bridge inside Android APK
installAndroidApkRuntimeBridge();
syncApkMobileModeDocumentClass(shouldForceApkMobileLayout());

if (isNativeAndroidApkRuntime()) {
  // Native APK serves bundled assets locally; purge stale SW precaches so APK updates always apply immediately
  void purgeStaleServiceWorkersInNativeApk();
} else if (import.meta.env.PROD) {
  // Register PWA service worker for standalone offline browser functionality
  registerSW({
    immediate: true,
    onRegisterError: () => {
      // Gracefully ignore SW registration restrictions in sandboxed preview iframes
    },
  });
} else if (
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  navigator.serviceWorker?.getRegistrations
) {
  // Ensure dev preview never serves cached pre-edit .tsx modules from a previous dev service worker
  void navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister().catch(() => false))));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApkErrorBoundary>
      <App />
    </ApkErrorBoundary>
  </StrictMode>
);
