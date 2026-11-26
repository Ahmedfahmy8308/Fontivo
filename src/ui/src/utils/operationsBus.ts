// =============================================================================
// Fontivo Universal Live Operations & Downloads Event Bus
// Tracks live progress for Font Packs, Google Fonts, Windows Font Restoration,
// RAM & Process Optimization, Design File / Workspace Scanning, and Custom Imports.
// =============================================================================

export type OperationCategory =
  | "download"
  | "google-font"
  | "windows-restore"
  | "ram-optimize"
  | "workspace-scan"
  | "custom-import"
  | "system";

export type OperationStatus = "running" | "completed" | "failed" | "queued";

export interface LiveOperationItem {
  id: string;
  title: string;
  titleAr?: string;
  category: OperationCategory;
  status: OperationStatus;
  progressPercent: number; // 0 to 100
  stepLabel?: string;
  stepLabelAr?: string;
  bytesDone?: number;
  bytesTotal?: number;
  itemsDone?: number;
  itemsTotal?: number;
  speedBps?: number;
  startedAt: number;
  updatedAt: number;
  error?: string | null;
}

const OPERATIONS_EVENT = "fontivo:operations-update";
const OPEN_CENTER_EVENT = "fontivo:operations-open";

let operationsStore: Record<string, LiveOperationItem> = {};

export function getLiveOperations(): LiveOperationItem[] {
  return Object.values(operationsStore).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
}

export function upsertLiveOperation(
  partial: Partial<LiveOperationItem> & { id: string; title?: string },
): LiveOperationItem {
  const now = Date.now();
  const existing = operationsStore[partial.id];
  const updated: LiveOperationItem = {
    id: partial.id,
    title: partial.title ?? existing?.title ?? "Background Operation",
    titleAr:
      partial.titleAr ?? existing?.titleAr ?? partial.title ?? "عملية نشطة",
    category: partial.category ?? existing?.category ?? "system",
    status: partial.status ?? existing?.status ?? "running",
    progressPercent: Math.max(
      0,
      Math.min(
        100,
        Math.round(partial.progressPercent ?? existing?.progressPercent ?? 0),
      ),
    ),
    stepLabel: partial.stepLabel ?? existing?.stepLabel,
    stepLabelAr: partial.stepLabelAr ?? existing?.stepLabelAr,
    bytesDone: partial.bytesDone ?? existing?.bytesDone,
    bytesTotal: partial.bytesTotal ?? existing?.bytesTotal,
    itemsDone: partial.itemsDone ?? existing?.itemsDone,
    itemsTotal: partial.itemsTotal ?? existing?.itemsTotal,
    speedBps: partial.speedBps ?? existing?.speedBps,
    startedAt: existing?.startedAt ?? partial.startedAt ?? now,
    updatedAt: now,
    error: partial.error !== undefined ? partial.error : existing?.error,
  };

  operationsStore = {
    ...operationsStore,
    [partial.id]: updated,
  };

  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(OPERATIONS_EVENT, { detail: getLiveOperations() }),
      );
    } catch {
      // ignore in SSR/test
    }
  }

  return updated;
}

export function clearCompletedOperations(): void {
  const next: Record<string, LiveOperationItem> = {};
  for (const [k, v] of Object.entries(operationsStore)) {
    if (v.status === "running" || v.status === "queued") {
      next[k] = v;
    }
  }
  operationsStore = next;
  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(OPERATIONS_EVENT, { detail: getLiveOperations() }),
      );
    } catch {
      // ignore
    }
  }
}

export function removeLiveOperation(id: string): void {
  const { [id]: _, ...rest } = operationsStore;
  operationsStore = rest;
  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(OPERATIONS_EVENT, { detail: getLiveOperations() }),
      );
    } catch {
      // ignore
    }
  }
}

export function openOperationsCenter(): void {
  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  ) {
    try {
      window.dispatchEvent(new CustomEvent(OPEN_CENTER_EVENT));
    } catch {
      // ignore
    }
  }
}

export function formatTransferMb(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0.0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}

export function formatTransferSpeed(speedBps?: number): string {
  if (!speedBps || speedBps <= 0) return "";
  const mbps = speedBps / (1024 * 1024);
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`;
  const kbps = speedBps / 1024;
  return `${Math.round(kbps)} KB/s`;
}

export { OPERATIONS_EVENT, OPEN_CENTER_EVENT };
