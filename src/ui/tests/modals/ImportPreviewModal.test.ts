import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import ImportPreviewModal, {
  formatBytesToMb,
  sanitizeFolderSliceName,
  type FolderImportPreview,
} from "../../src/components/modals/ImportPreviewModal";
import SettingsView, {
  formatStorageBytes,
  normalizeStorageBreakdown,
} from "../../src/components/views/SettingsView";
import AboutDeveloperModal from "../../src/components/modals/AboutDeveloperModal";
import HelpModal from "../../src/components/modals/HelpModal";
import LicensesView from "../../src/components/views/LicensesView";

const SAMPLE_PREVIEW: FolderImportPreview = {
  folderPath: "C:\\Users\\Designer\\Desktop\\Client-Brand-Fonts",
  suggestedName: "Client-Brand-Fonts",
  totalScanned: 24,
  newCount: 18,
  duplicateCount: 5,
  invalidCount: 1,
  totalBytes: 12 * 1024 * 1024 + 512 * 1024,
  sampleFamilies: ["Cairo", "IBM Plex Sans Arabic", "Tajawal", "Inter"],
};

describe("ImportPreviewModal & Local Storage v1.1.5 Tests", () => {
  it("formats byte sizes to MB/KB accurately", () => {
    expect(formatBytesToMb(0)).toBe("0.00 MB");
    expect(formatBytesToMb(5120)).toBe("5.0 KB");
    expect(formatBytesToMb(10 * 1024 * 1024)).toBe("10.00 MB");
    expect(formatStorageBytes(0)).toBe("0.0 MB");
    expect(formatStorageBytes(2 * 1024 * 1024)).toBe("2.00 MB");
    expect(formatStorageBytes(2 * 1024 * 1024 * 1024)).toBe("2.00 GB");
  });

  it("sanitizes folder slice names safely", () => {
    expect(sanitizeFolderSliceName("  Brand: 2026 / Arabic*  ")).toBe(
      "Brand 2026 Arabic",
    );
    expect(sanitizeFolderSliceName("///")).toBe("Imported-Fonts");
  });

  it("returns empty markup when closed or preview is null", () => {
    const closedHtml = renderToString(
      React.createElement(ImportPreviewModal, {
        isOpen: false,
        onClose: () => {},
        preview: SAMPLE_PREVIEW,
      }),
    );
    expect(closedHtml).toBe("");

    const nullPreviewHtml = renderToString(
      React.createElement(ImportPreviewModal, {
        isOpen: true,
        onClose: () => {},
        preview: null,
      }),
    );
    expect(nullPreviewHtml).toBe("");
  });

  it("renders RTL Arabic ImportPreviewModal with badges, editable name, safety note, and sample families", () => {
    const html = renderToString(
      React.createElement(ImportPreviewModal, {
        isOpen: true,
        onClose: () => {},
        preview: SAMPLE_PREVIEW,
        isRtl: true,
      }),
    );

    expect(html).toContain('data-testid="import-preview-modal"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("خطوط جديدة");
    expect(html).toContain("مكررات متجاهلة");
    expect(html).toContain("12.50 MB");
    expect(html).toContain('data-testid="import-preview-folder-name"');
    expect(html).toContain("Client-Brand-Fonts");
    expect(html).toContain('data-testid="import-preview-safety-note"');
    expect(html).toContain(
      "%LOCALAPPDATA%\\Fontivo\\Fonts\\Imported\\Client-Brand-Fonts\\",
    );
    expect(html).toContain("Cairo");
    expect(html).toContain("IBM Plex Sans Arabic");
    expect(html).toContain('data-testid="import-preview-confirm"');
  });

  it("renders LTR English ImportPreviewModal and disables confirm when newCount is 0", () => {
    const html = renderToString(
      React.createElement(ImportPreviewModal, {
        isOpen: true,
        onClose: () => {},
        preview: { ...SAMPLE_PREVIEW, newCount: 0, duplicateCount: 24 },
        isRtl: false,
      }),
    );

    expect(html).toContain('dir="ltr"');
    expect(html).toContain("New Fonts");
    expect(html).toContain("Duplicates Skipped");
    expect(html).toContain("deleting the original Desktop folder never loses");
    expect(html).toContain("disabled");
  });

  it("normalizes storage breakdown payloads across flexible field shapes", () => {
    const normalized = normalizeStorageBreakdown({
      imported: { bytes: 4_000_000, files: 12 },
      custom: { sizeBytes: 1_500_000, fileCount: 4 },
      google: { bytes: 8_000_000, count: 30 },
      packs: { bytes: 25_000_000, files: 120 },
      workspaces: { bytes: 2_000_000, files: 10 },
      backups: { bytes: 500_000, files: 2 },
      cache: { bytes: 3_000_000, files: 3 },
    });

    expect(normalized.imported).toEqual({ bytes: 4_000_000, files: 12 });
    expect(normalized.custom).toEqual({ bytes: 1_500_000, files: 4 });
    expect(normalized.google).toEqual({ bytes: 8_000_000, files: 30 });
    expect(normalized.cache).toEqual({ bytes: 3_000_000, files: 3 });
    expect(normalized.totalBytes).toBe(44_000_000);
  });

  it("renders SettingsView Storage Breakdown & Cache Cleanup card safely in SSR (AR & EN)", () => {
    const breakdown = normalizeStorageBreakdown({
      imported: { bytes: 5 * 1024 * 1024, files: 14 },
      custom: { bytes: 2 * 1024 * 1024, files: 6 },
      google: { bytes: 10 * 1024 * 1024, files: 40 },
      packs: { bytes: 50 * 1024 * 1024, files: 220 },
      workspaces: { bytes: 3 * 1024 * 1024, files: 11 },
      backups: { bytes: 1 * 1024 * 1024, files: 2 },
      cache: { bytes: 4 * 1024 * 1024, files: 3 },
      totalBytes: 75 * 1024 * 1024,
    });

    const arHtml = renderToString(
      React.createElement(SettingsView, {
        isRtl: true,
        initialStorageBreakdown: breakdown,
      }),
    );
    expect(arHtml).toContain('data-testid="storage-breakdown-card"');
    expect(arHtml).toContain('data-testid="cleanup-cache-btn"');
    expect(arHtml).toContain("تنظيف الملفات المؤقتة");
    expect(arHtml).toContain("75.00 MB");
    expect(arHtml).toContain("https://fontivo-app.github.io");

    const enHtml = renderToString(
      React.createElement(SettingsView, {
        isRtl: false,
        initialStorageBreakdown: breakdown,
      }),
    );
    expect(enHtml).toContain("Clean Temporary Cache");
    expect(enHtml).toContain("Imported");
    expect(enHtml).toContain("Workspaces");
  });

  it("uses canonical https://fontivo-app.github.io URL and preserves Ahmedfahmy8308 GitHub repos", () => {
    const aboutHtml = renderToString(
      React.createElement(AboutDeveloperModal, {
        isOpen: true,
        onClose: () => {},
        isRtl: false,
      }),
    );
    expect(aboutHtml).toContain("https://fontivo-app.github.io");
    expect(aboutHtml).not.toContain("ahmedfahmy8308.github.io/Fontivo-Site");
    expect(aboutHtml).toContain("https://github.com/Ahmedfahmy8308/Fontivo");
    expect(aboutHtml).toContain(
      "https://github.com/Ahmedfahmy8308/Fontivo-Fonts",
    );

    const helpHtml = renderToString(
      React.createElement(HelpModal, {
        isOpen: true,
        onClose: () => {},
        isRtl: false,
      }),
    );
    expect(helpHtml).toContain("https://fontivo-app.github.io");
    expect(helpHtml).not.toContain("ahmedfahmy8308.github.io/Fontivo-Site");

    const licensesHtml = renderToString(
      React.createElement(LicensesView, {
        families: [],
        isRtl: false,
      }),
    );
    expect(licensesHtml).toContain("https://fontivo-app.github.io");
    expect(licensesHtml).not.toContain("ahmedfahmy8308.github.io/Fontivo-Site");
  });

  it("posts customFolderName payload to /api/import-folder cleanly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        imported: 18,
        skipped: 5,
        folderName: "Client-Brand-Fonts",
      }),
    });
    global.fetch = fetchMock;

    const res = await fetch("/api/import-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folderPath: SAMPLE_PREVIEW.folderPath,
        customFolderName: sanitizeFolderSliceName("Client-Brand-Fonts"),
      }),
    });
    const data = await res.json();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import-folder",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          folderPath: SAMPLE_PREVIEW.folderPath,
          customFolderName: "Client-Brand-Fonts",
        }),
      }),
    );
    expect(data.success).toBe(true);
    expect(data.imported).toBe(18);
  });
});
