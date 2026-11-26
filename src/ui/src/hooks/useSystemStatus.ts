import React, { useState, useEffect } from "react";
import { NetworkStatus } from "../types/system";
import { safeFetchJson } from "../utils/safeFetch";

const API_BASE = "/api";

/**
 * Dispatches a native window control action once: prefers WebView2/WRY IPC when
 * available, and falls back to the local HTTP API only when IPC is absent or throws.
 */
export function dispatchWindowEvent(
  action: string,
  options?: {
    ipc?: { postMessage?: (msg: string) => void } | null;
    fetchImpl?: typeof fetch;
    apiBase?: string;
  },
): "ipc" | "http" {
  const ipcTarget =
    options && "ipc" in options
      ? options.ipc
      : typeof window !== "undefined"
        ? window.ipc
        : undefined;

  if (ipcTarget && typeof ipcTarget.postMessage === "function") {
    try {
      ipcTarget.postMessage(action);
      return "ipc";
    } catch (e) {
      console.warn("IPC postMessage failed, falling back to HTTP:", e);
    }
  }

  const fetchFn = options?.fetchImpl ?? fetch;
  const base = options?.apiBase ?? API_BASE;
  fetchFn(`${base}/window/${action}`, { method: "POST" }).catch(() => {});
  return "http";
}

export function useSystemStatus() {
  const [ramMb, setRamMb] = useState<number>(38.5);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    online: true,
    latencyMs: 0,
  });

  const fetchNetworkStatus = async () => {
    const data = await safeFetchJson<NetworkStatus>(
      `${API_BASE}/network/status`,
      { timeoutMs: 4000 },
    );
    if (data && typeof data.online === "boolean") {
      setNetworkStatus(data);
    }
  };

  const fetchRamStatus = async () => {
    const data = await safeFetchJson<any>(`${API_BASE}/system/ram-status`, {
      timeoutMs: 4000,
    });
    if (data && (data.ramMb || data.processRamMb)) {
      setRamMb(data.ramMb || data.processRamMb);
    }
  };

  useEffect(() => {
    fetchNetworkStatus();
    fetchRamStatus();
    const interval = setInterval(() => {
      fetchNetworkStatus();
      fetchRamStatus();
    }, 25000);
    return () => clearInterval(interval);
  }, []);

  const sendWindowEvent = (action: string) => {
    dispatchWindowEvent(action);
  };

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target?.closest("button") ||
      target?.closest("input") ||
      target?.closest("select")
    ) {
      return;
    }
    sendWindowEvent("drag");
  };

  const handleHeaderDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target?.closest("button") ||
      target?.closest("input") ||
      target?.closest("select")
    ) {
      return;
    }
    sendWindowEvent("maximize");
  };

  return {
    ramMb,
    setRamMb,
    networkStatus,
    fetchNetworkStatus,
    fetchRamStatus,
    sendWindowEvent,
    handleHeaderMouseDown,
    handleHeaderDoubleClick,
  };
}
