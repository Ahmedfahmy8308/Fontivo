import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import OperationsCenter from "../../src/components/common/OperationsCenter";
import {
  upsertLiveOperation,
  getLiveOperations,
  clearCompletedOperations,
  removeLiveOperation,
  isOperationDismissed,
  resetDismissedOperations,
  formatTransferMb,
  formatTransferSpeed,
} from "../../src/utils/operationsBus";
import { safeFetchJson } from "../../src/utils/safeFetch";

describe("OperationsCenter & Live Progress Bus Tests", () => {
  beforeEach(() => {
    resetDismissedOperations();
    for (const op of getLiveOperations()) {
      removeLiveOperation(op.id);
    }
    resetDismissedOperations();
  });

  it("tracks live operations with 0-100% progress, MB transfer, items count, and speed", () => {
    upsertLiveOperation({
      id: "dl-arabic-1",
      title: "Downloading Arabic Essential Pack 1",
      titleAr: "تحميل الحزمة الأساسية 1",
      category: "download",
      status: "running",
      progressPercent: 48,
      bytesDone: 18 * 1024 * 1024,
      bytesTotal: 37 * 1024 * 1024,
      speedBps: 5.2 * 1024 * 1024,
      stepLabel: "Downloading font archive...",
    });

    const ops = getLiveOperations();
    expect(ops.length).toBe(1);
    expect(ops[0].progressPercent).toBe(48);
    expect(formatTransferMb(ops[0].bytesDone)).toBe("18.0 MB");
    expect(formatTransferMb(ops[0].bytesTotal)).toBe("37.0 MB");
    expect(formatTransferSpeed(ops[0].speedBps)).toBe("5.2 MB/s");
  });

  it("renders OperationsCenter with active download and RAM optimization tasks", () => {
    upsertLiveOperation({
      id: "op-ram",
      title: "Deep RAM & Cache Purge",
      category: "ram-optimize",
      status: "running",
      progressPercent: 75,
      stepLabel: "Unregistering GDI32 handles...",
    });

    const html = renderToString(
      React.createElement(OperationsCenter, {
        isOpen: true,
        isRtl: false,
      }),
    );

    expect(html).toContain("Live Operations &amp; Downloads");
    expect(html).toContain("Deep RAM &amp; Cache Purge");
    expect(html).toContain("75%");
    expect(html).toContain("fontivo-progress-track");
  });

  it("renders RTL byte transfer stats cleanly with dir=ltr isolation", () => {
    upsertLiveOperation({
      id: "dl-pack-001",
      title: "Essential Pack 001 (v1.0.3)",
      titleAr: "الحزمة الأساسية 001 (v1.0.3)",
      category: "download",
      status: "running",
      progressPercent: 50,
      bytesDone: 20 * 1024 * 1024,
      bytesTotal: 40 * 1024 * 1024,
      speedBps: 4.5 * 1024 * 1024,
    });

    const html = renderToString(
      React.createElement(OperationsCenter, {
        isOpen: true,
        isRtl: true,
      }),
    );

    expect(html).toContain('dir="ltr"');
    expect(html).toContain("20.0 MB");
    expect(html).toContain("40.0 MB");
    expect(html).toContain("4.5 MB/s");
  });

  it("clears completed operations while preserving running operations", () => {
    upsertLiveOperation({
      id: "op-1",
      title: "Completed Scan",
      category: "workspace-scan",
      status: "completed",
      progressPercent: 100,
    });
    upsertLiveOperation({
      id: "op-2",
      title: "Running Import",
      category: "custom-import",
      status: "running",
      progressPercent: 50,
    });

    clearCompletedOperations();
    const remaining = getLiveOperations();
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe("op-2");
    expect(isOperationDismissed("op-1")).toBe(true);
    expect(isOperationDismissed("op-2")).toBe(false);
  });

  it("keeps cleared completed/failed operations dismissed unless restarted as running", () => {
    upsertLiveOperation({
      id: "dl-pack-003",
      title: "Pack 003",
      category: "download",
      status: "completed",
      progressPercent: 100,
    });
    upsertLiveOperation({
      id: "op-failed-1",
      title: "Failed Op",
      category: "system",
      status: "failed",
      progressPercent: 20,
    });

    clearCompletedOperations();
    expect(isOperationDismissed("dl-pack-003")).toBe(true);
    expect(isOperationDismissed("op-failed-1")).toBe(true);

    // Restarting an operation with the same ID as running un-dismisses it
    upsertLiveOperation({
      id: "dl-pack-003",
      title: "Pack 003",
      category: "download",
      status: "running",
      progressPercent: 10,
    });
    expect(isOperationDismissed("dl-pack-003")).toBe(false);
  });

  it("safeFetchJson returns fallback safely when network is offline or times out", async () => {
    const failingFetch = async () => {
      throw new Error("Network unreachable");
    };
    const res = await safeFetchJson(
      "/api/offline",
      { fetchImpl: failingFetch as any },
      { ok: false },
    );
    expect(res).toEqual({ ok: false });
  });
});
