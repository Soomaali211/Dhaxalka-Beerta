interface BeertaAndroidBridgeInterface {
  printCurrentPage: (jobTitle: string, landscape: boolean, paperSize: string) => void;
  saveAndShareBase64File: (
    fileName: string,
    mimeType: string,
    base64Payload: string
  ) => void;
  requestLocationPermission?: () => boolean;
}

interface CapacitorGlobalLike {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

declare global {
  interface Window {
    BeertaAndroidBridge?: BeertaAndroidBridgeInterface;
    Capacitor?: CapacitorGlobalLike;
  }
}

/**
 * Reliably detects whether the app is executing inside the native Android APK WebView
 * (including Capacitor's `https://localhost` androidScheme, `BeertaAndroidBridge`,
 * `Capacitor.isNativePlatform()`, `capacitor:`/`file:`, and `BeertaAPK/` User-Agent).
 */
export function isNativeAndroidApkRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.BeertaAndroidBridge) return true;
  if (typeof window.Capacitor?.isNativePlatform === 'function') {
    try {
      if (window.Capacitor.isNativePlatform()) return true;
    } catch {
      // ignore
    }
  }
  const proto = window.location?.protocol || '';
  if (proto === 'capacitor:' || proto === 'file:') return true;

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (ua.includes('BeertaAPK/')) return true;

  const host = window.location?.hostname || '';
  const port = window.location?.port || '';
  if (host === 'localhost' && port === '' && /Android/i.test(ua)) {
    return true;
  }
  return false;
}

/**
 * Unregisters any stale Workbox Service Workers and clears precache buckets inside the
 * native Android APK WebView so APK upgrades (`adb install -r` / new APK versions) always
 * load fresh packaged assets from `android/app/src/main/assets/public` instead of old JS chunks.
 */
export async function purgeStaleServiceWorkersInNativeApk(): Promise<void> {
  if (!isNativeAndroidApkRuntime() || typeof navigator === 'undefined') return;
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker?.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    // ignore SW cleanup errors
  }

  try {
    if (typeof caches !== 'undefined' && caches?.keys) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => /workbox|precache|vite-pwa/i.test(k))
          .map((k) => caches.delete(k).catch(() => false))
      );
    }
  } catch {
    // ignore CacheStorage errors
  }
}

export interface StorageLike {
  setItem(key: string, value: string): void;
  getItem?(key: string): string | null;
  removeItem?(key: string): void;
}

function trimValueHistoryForQuotaRecovery(value: unknown, maxHistoryItems: number): unknown {
  if (!value || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const rec = item as Record<string, unknown>;
      const trimmedSnapshot =
        rec.landSubdivisionSnapshot && typeof rec.landSubdivisionSnapshot === 'object'
          ? trimValueHistoryForQuotaRecovery(rec.landSubdivisionSnapshot, maxHistoryItems)
          : rec.landSubdivisionSnapshot;
      return {
        ...rec,
        ...(Array.isArray(rec.changeHistory)
          ? { changeHistory: rec.changeHistory.slice(0, maxHistoryItems) }
          : {}),
        ...(trimmedSnapshot !== undefined ? { landSubdivisionSnapshot: trimmedSnapshot } : {}),
      };
    });
  }

  const obj = value as Record<string, unknown>;
  return {
    ...obj,
    ...(Array.isArray(obj.auditHistory)
      ? { auditHistory: obj.auditHistory.slice(0, maxHistoryItems) }
      : {}),
    ...(Array.isArray(obj.halfPlotValidationHistory)
      ? { halfPlotValidationHistory: obj.halfPlotValidationHistory.slice(0, maxHistoryItems) }
      : {}),
  };
}

/**
 * Safely persists JSON payloads to `localStorage` with automatic `QuotaExceededError` recovery.
 * If Android WebView's 5MB `localStorage` quota fills up over years of field surveys, trims
 * old `changeHistory` / `auditHistory` logs while preserving 100% of cases, heirs, assets,
 * blocks, and plots.
 */
export function safePersistJsonToLocalStorage(
  key: string,
  value: unknown,
  storage?: StorageLike
): { saved: boolean; trimmedHistory: boolean } {
  const targetStorage: StorageLike | null =
    storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!targetStorage) return { saved: false, trimmedHistory: false };

  try {
    targetStorage.setItem(key, JSON.stringify(value));
    return { saved: true, trimmedHistory: false };
  } catch {
    try {
      const compact = trimValueHistoryForQuotaRecovery(value, 12);
      targetStorage.setItem(key, JSON.stringify(compact));
      return { saved: true, trimmedHistory: true };
    } catch {
      try {
        const ultraCompact = trimValueHistoryForQuotaRecovery(value, 2);
        targetStorage.setItem(key, JSON.stringify(ultraCompact));
        return { saved: true, trimmedHistory: true };
      } catch {
        return { saved: false, trimmedHistory: false };
      }
    }
  }
}

function detectCurrentPrintPageConfig(): { landscape: boolean; paperSize: 'A4' | 'A3' } {
  const styles = Array.from(document.querySelectorAll('style'));
  for (let i = styles.length - 1; i >= 0; i--) {
    const css = styles[i].textContent || '';
    if (css.includes('@page')) {
      const isA3 = /\bsize:\s*A3\b/i.test(css);
      const isLandscape = /\blandscape\b/i.test(css);
      return {
        landscape: isLandscape,
        paperSize: isA3 ? 'A3' : 'A4',
      };
    }
  }
  return { landscape: false, paperSize: 'A4' };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = res.indexOf(',');
      resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let bridgeInstalled = false;

/**
 * Activates ONLY inside the native Android APK WebView (`window.BeertaAndroidBridge`).
 * Bridges:
 * 1) `window.print()` -> Android `PrintManager` ("Save as PDF")
 * 2) `<a download>` Blob/Data exports -> Android `FileProvider` Save/Share sheet
 * 3) `navigator.geolocation` -> Android OS runtime permission request (`ACCESS_FINE_LOCATION`)
 */
export function installAndroidApkRuntimeBridge(): void {
  if (bridgeInstalled || typeof window === 'undefined') return;
  const nativeBridge = window.BeertaAndroidBridge;
  if (!nativeBridge) return;

  bridgeInstalled = true;

  // 1. Bridge window.print() to Android's native PrintManager (Save as PDF / Printers)
  const fallbackPrint = window.print ? window.print.bind(window) : () => {};
  window.print = () => {
    try {
      const { landscape, paperSize } = detectCurrentPrintPageConfig();
      const title = document.title || 'Beerta_iyo_Dhaxalka_PDF';
      nativeBridge.printCurrentPage(title, landscape, paperSize);
    } catch {
      fallbackPrint();
    }
  };

  // 2. Request Android 7–16 OS runtime GPS permission automatically before HTML5 Geolocation runs
  if (
    typeof navigator !== 'undefined' &&
    navigator.geolocation &&
    typeof nativeBridge.requestLocationPermission === 'function'
  ) {
    const origGetCurrent = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    const origWatch = navigator.geolocation.watchPosition.bind(navigator.geolocation);

    navigator.geolocation.getCurrentPosition = (success, error, options) => {
      try {
        const alreadyGranted = nativeBridge.requestLocationPermission?.();
        if (alreadyGranted === false) {
          window.setTimeout(() => origGetCurrent(success, error, options), 900);
          return;
        }
      } catch {
        // fall through to standard WebView geolocation
      }
      origGetCurrent(success, error, options);
    };

    navigator.geolocation.watchPosition = (success, error, options) => {
      try {
        nativeBridge.requestLocationPermission?.();
      } catch {
        // ignore
      }
      return origWatch(success, error, options);
    };
  }

  // 3. Track active object URLs so programmatic <a download href="blob:..."> exports work natively
  const blobRegistry = new Map<string, Blob>();
  const origCreateObjectURL = URL.createObjectURL.bind(URL);
  const origRevokeObjectURL = URL.revokeObjectURL.bind(URL);

  URL.createObjectURL = (obj: Blob | MediaSource): string => {
    const url = origCreateObjectURL(obj);
    if (obj instanceof Blob) {
      blobRegistry.set(url, obj);
    }
    return url;
  };

  URL.revokeObjectURL = (url: string): void => {
    // Allow 12s grace window so large Shapefile ZIP FileReader finishes on low-RAM phones
    window.setTimeout(() => {
      blobRegistry.delete(url);
      origRevokeObjectURL(url);
    }, 12000);
  };

  const origAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const downloadAttr = this.getAttribute('download');
    const href = this.href || '';

    if (downloadAttr !== null && (href.startsWith('blob:') || href.startsWith('data:'))) {
      const fileName = downloadAttr || 'Beerta_Export';
      if (href.startsWith('blob:')) {
        const trackedBlob = blobRegistry.get(href);
        const blobPromise = trackedBlob
          ? Promise.resolve(trackedBlob)
          : fetch(href).then((r) => r.blob());

        void blobPromise
          .then(async (blob) => {
            const b64 = await blobToBase64(blob);
            nativeBridge.saveAndShareBase64File(
              fileName,
              blob.type || 'application/octet-stream',
              b64
            );
          })
          .catch(() => {
            origAnchorClick.call(this);
          });
        return;
      }

      if (href.startsWith('data:')) {
        const commaIdx = href.indexOf(',');
        if (commaIdx > 0) {
          try {
            const meta = href.slice(5, commaIdx);
            const mime = meta.split(';')[0] || 'application/octet-stream';
            const isBase64 = meta.includes(';base64');
            const rawBody = href.slice(commaIdx + 1);
            const b64 = isBase64
              ? rawBody
              : btoa(unescape(encodeURIComponent(decodeURIComponent(rawBody))));
            nativeBridge.saveAndShareBase64File(fileName, mime, b64);
            return;
          } catch {
            origAnchorClick.call(this);
            return;
          }
        }
      }
    }

    origAnchorClick.call(this);
  };
}
