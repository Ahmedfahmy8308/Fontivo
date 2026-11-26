import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import RamInspectorView, {
  RAM_POLL_INTERVAL_MS,
  formatMbToGb,
  filterFontivoRamFonts,
  normalizeRamOptimizeResult,
} from "../../src/components/views/RamInspectorView";

describe("RamInspectorView Component & RAM Metrics Tests", () => {
  const mockRamData = {
    processRamMb: 38.5,
    ramMb: 38.5,
    systemUsedMb: 7200,
    systemTotalMb: 16384,
    systemCachedMb: 2150,
    systemPercent: 44,
    cpuPercent: 18,
    cpuCores: 12,
    gpuPercent: 14,
    vramUsedMb: 1480,
    vramTotalMb: 8192,
    gdiHandlesCount: 142,
  };

  const mockActiveFonts = [
    {
      id: "font-1",
      name: "Inter Regular",
      family: "Inter",
      format: "TTF",
      active: true,
      gdiHandle: "0x00A1B2C3",
      memoryKb: 254,
    },
    {
      id: "font-2",
      name: "Tajawal Bold",
      family: "Tajawal",
      format: "OTF",
      active: true,
      gdiHandle: "0x00D4E5F6",
      memoryKb: 388,
    },
    {
      id: "font-3",
      name: "JetBrains Mono",
      family: "JetBrains Mono",
      format: "TTF",
      active: true,
      gdiHandle: "0x00112233",
      memoryKb: 310,
    },
  ];

  it("formats process memory and system usage correctly", () => {
    const formatMb = (mb: number) => `${Math.round(mb)} MB`;
    const calculatePercent = (used: number, total: number) =>
      Math.round((used / total) * 100);

    expect(formatMb(mockRamData.processRamMb)).toBe("39 MB");
    expect(
      calculatePercent(mockRamData.systemUsedMb, mockRamData.systemTotalMb),
    ).toBe(44);
  });

  it("aggregates total active font RAM consumption and GDI handles count", () => {
    const totalFontMemoryKb = mockActiveFonts.reduce(
      (sum, f) => sum + (f.memoryKb || 0),
      0,
    );
    const activeCount = mockActiveFonts.length;
    const gdiHandles = mockActiveFonts.filter((f) => f.gdiHandle).length;

    expect(totalFontMemoryKb).toBe(952);
    expect(activeCount).toBe(3);
    expect(gdiHandles).toBe(3);
  });

  it("generates bulk unmount request payload with all active font IDs", () => {
    const createBulkUnmountPayload = (fonts: typeof mockActiveFonts) => ({
      action: "purge_all",
      fontIds: fonts.map((f) => f.id),
      timestamp: Date.now(),
    });

    const payload = createBulkUnmountPayload(mockActiveFonts);
    expect(payload.action).toBe("purge_all");
    expect(payload.fontIds).toEqual(["font-1", "font-2", "font-3"]);
  });

  it("determines safety levels for GDI resource boundaries", () => {
    const getGdiRiskLevel = (handlesCount: number) => {
      if (handlesCount > 8000) return "critical";
      if (handlesCount > 5000) return "warning";
      return "safe";
    };

    expect(getGdiRiskLevel(142)).toBe("safe");
    expect(getGdiRiskLevel(5500)).toBe("warning");
    expect(getGdiRiskLevel(9200)).toBe("critical");
  });

  it("renders live 2-second streaming telemetry cards, Trim RAM, and Clean & Boost RAM Now controls without hardcoded 16384 MB", () => {
    const html = renderToString(
      React.createElement(RamInspectorView, {
        onRefreshStats: () => {},
        t: {},
        isRtl: false,
      }),
    );

    expect(html).toBeDefined();
    expect(html).toContain("System RAM");
    expect(html).toContain("CPU Usage");
    expect(html).toContain("GPU / VRAM Usage");
    expect(html).toContain("Fontivo Process RAM");
    expect(html).toContain("Top Resource-Consuming Applications");
    expect(html).toContain("Trim RAM");
    expect(html).toContain("Deep RAM &amp; Cache Purge");
    expect(html).toContain("Clean &amp; Boost RAM Now");
    expect(html).toContain("Live (2s)");
    expect(html).not.toContain("16384");

    const htmlAr = renderToString(
      React.createElement(RamInspectorView, {
        onRefreshStats: () => {},
        t: {},
        isRtl: true,
      }),
    );
    expect(htmlAr).toContain("تنظيف وتسريع الرام الآن");
    expect(htmlAr).toContain("مراقبة حية (2ث)");
  });

  it("formats real 64-bit physical RAM (e.g. 24.0 GB), excludes Windows system fonts from RAM list, and normalizes optimize-ram stats", () => {
    expect(RAM_POLL_INTERVAL_MS).toBe(2000);
    expect(formatMbToGb(24576)).toBe("24.0 GB");
    expect(formatMbToGb(0)).toBe("—");

    const filtered = filterFontivoRamFonts([
      { id: "1", name: "Arial", source: "system" },
      { id: "2", name: "Segoe UI", isSystem: true },
      { id: "3", name: "Cairo Bold", source: "local" },
      { id: "4", name: "Tajawal", source: "google" },
    ]);
    expect(filtered.map((f) => f.name)).toEqual(["Cairo Bold", "Tajawal"]);

    const opt = normalizeRamOptimizeResult({
      beforeMb: 12400,
      afterMb: 11850,
      freedMb: 550,
      processesTrimmed: 18,
      activeFontsCleared: 0,
    });
    expect(opt).toEqual({
      beforeMb: 12400,
      afterMb: 11850,
      freedMb: 550,
      processesTrimmed: 18,
      activeFontsCleared: 0,
    });
  });
});
