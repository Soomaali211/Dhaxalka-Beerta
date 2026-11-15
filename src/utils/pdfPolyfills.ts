// Runtime compatibility polyfills for pdfjs-dist v6+ on Android WebViews & older browsers
export function ensurePdfRuntimePolyfills(): void {
  const globalObj = globalThis as unknown as {
    Promise?: typeof Promise & {
      withResolvers?: <T>() => {
        promise: Promise<T>;
        resolve: (value: T | PromiseLike<T>) => void;
        reject: (reason?: unknown) => void;
      };
    };
    URL?: typeof URL & {
      parse?: (url: string | URL, base?: string | URL) => URL | null;
    };
    Map?: typeof Map & {
      groupBy?: <K, T>(items: Iterable<T>, keySelector: (item: T, index: number) => K) => Map<K, T[]>;
    };
    Object?: typeof Object & {
      groupBy?: <K extends PropertyKey, T>(
        items: Iterable<T>,
        keySelector: (item: T, index: number) => K
      ) => Partial<Record<K, T[]>>;
    };
  };

  if (globalObj.Promise && typeof globalObj.Promise.withResolvers !== 'function') {
    globalObj.Promise.withResolvers = function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  if (globalObj.URL && typeof globalObj.URL.parse !== 'function') {
    globalObj.URL.parse = function parseUrl(url: string | URL, base?: string | URL): URL | null {
      try {
        return base !== undefined ? new URL(String(url), String(base)) : new URL(String(url));
      } catch {
        return null;
      }
    };
  }

  if (globalObj.Map && typeof globalObj.Map.groupBy !== 'function') {
    globalObj.Map.groupBy = function groupBy<K, T>(
      items: Iterable<T>,
      keySelector: (item: T, index: number) => K
    ): Map<K, T[]> {
      const map = new Map<K, T[]>();
      let idx = 0;
      for (const item of items) {
        const key = keySelector(item, idx++);
        const bucket = map.get(key);
        if (bucket) {
          bucket.push(item);
        } else {
          map.set(key, [item]);
        }
      }
      return map;
    };
  }
}

ensurePdfRuntimePolyfills();
