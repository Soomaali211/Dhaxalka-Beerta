import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import { installAndroidApkRuntimeBridge } from './utils/androidApkBridge';

// Activate native PDF print & file export bridge when running inside the Android APK
installAndroidApkRuntimeBridge();

// Register service worker for standalone offline APK/PWA functionality
registerSW({
  immediate: true,
  onRegisterError: () => {
    // Gracefully ignore SW registration restrictions in sandboxed preview iframes
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
