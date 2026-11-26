/// <reference types="vite/client" />

declare global {
  interface Window {
    ipc?: {
      postMessage: (message: string) => void;
    };
    EyeDropper?: any;
  }
}

export {};
