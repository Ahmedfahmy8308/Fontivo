// Shared test environment polyfills for Node / Vitest
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  } as Storage;
}

if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    localStorage: globalThis.localStorage,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1920,
    innerHeight: 1080,
  };
}

if (typeof (globalThis as any).FontFace === "undefined") {
  (globalThis as any).FontFace = class {
    family: string;
    source: string;
    constructor(family: string, source: string) {
      this.family = family;
      this.source = source;
    }
    load() {
      return Promise.resolve(this);
    }
  };
}

if (typeof globalThis.document === "undefined") {
  (globalThis as any).document = {
    documentElement: {
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false,
      },
      dir: "ltr",
      lang: "en",
    },
    body: {
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false,
      },
      appendChild: () => {},
      removeChild: () => {},
    },
    createElement: (tag: string) => ({
      tagName: tag.toUpperCase(),
      href: "",
      download: "",
      click: () => {},
      getContext: () => ({
        drawImage: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(100) }),
      }),
    }),
    fonts: {
      add: () => {},
      delete: () => {},
      clear: () => {},
      has: () => false,
    },
  };
}
