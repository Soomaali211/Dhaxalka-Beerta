interface BeertaAndroidBridgeInterface {
  printCurrentPage: (jobTitle: string, landscape: boolean, paperSize: string) => void;
  saveAndShareBase64File: (
    fileName: string,
    mimeType: string,
    base64Payload: string
  ) => void;
}

declare global {
  interface Window {
    BeertaAndroidBridge?: BeertaAndroidBridgeInterface;
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
 * Bridges `window.print()` -> Android `PrintManager` ("Save as PDF")
 * and `<a download>` Blob/Data exports -> Android `FileProvider` Save/Share sheet.
 */
export function installAndroidApkRuntimeBridge(): void {
  if (bridgeInstalled || typeof window === 'undefined') return;
  const nativeBridge = window.BeertaAndroidBridge;
  if (!nativeBridge) return;

  bridgeInstalled = true;

  // 1. Bridge window.print() to Android's native PrintManager (Save as PDF / Printers)
  window.print = () => {
    const { landscape, paperSize } = detectCurrentPrintPageConfig();
    const title = document.title || 'Beerta_iyo_Dhaxalka_PDF';
    nativeBridge.printCurrentPage(title, landscape, paperSize);
  };

  // 2. Track active object URLs so programmatic <a download href="blob:..."> exports work natively
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
    // Delay cleanup slightly so async FileReader finishes reading the Blob
    window.setTimeout(() => {
      blobRegistry.delete(url);
      origRevokeObjectURL(url);
    }, 4000);
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
          const meta = href.slice(5, commaIdx);
          const mime = meta.split(';')[0] || 'application/octet-stream';
          const isBase64 = meta.includes(';base64');
          const rawBody = href.slice(commaIdx + 1);
          const b64 = isBase64
            ? rawBody
            : btoa(unescape(encodeURIComponent(decodeURIComponent(rawBody))));
          nativeBridge.saveAndShareBase64File(fileName, mime, b64);
          return;
        }
      }
    }

    origAnchorClick.call(this);
  };
}
