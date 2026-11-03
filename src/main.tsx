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
} from './utils/androidApkBridge';

// Activate native PDF print, GPS permission & file export bridge inside Android APK
installAndroidApkRuntimeBridge();

if (isNativeAndroidApkRuntime()) {
  // Native APK serves bundled assets locally; purge stale SW precaches so APK updates always apply immediately
  void purgeStaleServiceWorkersInNativeApk();
} else {
  // Register PWA service worker for standalone offline browser functionality
  registerSW({
    immediate: true,
    onRegisterError: () => {
      // Gracefully ignore SW registration restrictions in sandboxed preview iframes
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApkErrorBoundary>
      <App />
    </ApkErrorBoundary>
  </StrictMode>
);
