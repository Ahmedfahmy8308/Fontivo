/// <reference types="node" />
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "./setup";

import App from "../src/App";
import WindowsFontsView from "../src/components/views/WindowsFontsView";
import SettingsView from "../src/components/views/SettingsView";
import LicensesView from "../src/components/views/LicensesView";
import { ConfirmDialog } from "../src/components/common";
import {
  isLibraryActiveTab,
  buildFontLibraryQueryParams,
  normalizeCollectionsResponse,
  LIBRARY_PAGE_SIZE,
} from "../src/hooks/useFontLibrary";
import { dispatchWindowEvent } from "../src/hooks/useSystemStatus";
import {
  isSupportedDesignFile,
  extractSupportedDesignFiles,
  inspectDroppedDesignFile,
  MAX_DESIGN_UPLOAD_BYTES,
} from "../src/utils/designDrop";

describe("Fontivo App UI Audit Fixes Regression Suite", () => {
  describe("1. Main Library Loading, Pagination & Server-Side Sorting", () => {
    it('enables library loading and pagination for both "library" and "organize" tabs', () => {
      expect(isLibraryActiveTab("library")).toBe(true);
      expect(isLibraryActiveTab("organize")).toBe(true);
      expect(isLibraryActiveTab("workspaces")).toBe(false);
      expect(isLibraryActiveTab("brand-kits")).toBe(false);
      expect(isLibraryActiveTab("windows-fonts")).toBe(false);
    });

    it("includes server-side sortBy, pagination offset/limit, and active filter params", () => {
      const page0 = buildFontLibraryQueryParams({
        targetPage: 0,
        searchQuery: "Cairo",
        filter: { type: "arabic", value: null },
        sortBy: "name-desc",
      });

      expect(page0.get("limit")).toBe(String(LIBRARY_PAGE_SIZE));
      expect(page0.get("offset")).toBe("0");
      expect(page0.get("sortBy")).toBe("name-desc");
      expect(page0.get("search")).toBe("Cairo");
      expect(page0.get("category")).toBe("Arabic");

      const page2 = buildFontLibraryQueryParams({
        targetPage: 2,
        searchQuery: "",
        filter: { type: "collection", value: "Brand Identity" },
        sortBy: "styles-desc",
      });

      expect(page2.get("offset")).toBe(String(2 * LIBRARY_PAGE_SIZE));
      expect(page2.get("sortBy")).toBe("styles-desc");
      expect(page2.get("collection")).toBe("Brand Identity");
    });

    it("normalizes both wrapped and raw collection map responses", () => {
      expect(
        normalizeCollectionsResponse({
          collections: { Editorial: ["1", "2"] },
        }),
      ).toEqual({
        Editorial: ["1", "2"],
      });
      expect(normalizeCollectionsResponse({ Editorial: ["1", "2"] })).toEqual({
        Editorial: ["1", "2"],
      });
      expect(normalizeCollectionsResponse(null)).toEqual({});
      expect(normalizeCollectionsResponse([])).toEqual({});
    });
  });

  describe("2. Single-Dispatch Window Events (No Duplicate Maximize Toggle)", () => {
    it("dispatches ONLY via IPC when window.ipc.postMessage is available", () => {
      const postMessage = vi.fn();
      const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));

      const transport = dispatchWindowEvent("maximize", {
        ipc: { postMessage },
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(transport).toBe("ipc");
      expect(postMessage).toHaveBeenCalledTimes(1);
      expect(postMessage).toHaveBeenCalledWith("maximize");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("falls back to HTTP POST only when IPC is absent", () => {
      const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));

      const transport = dispatchWindowEvent("minimize", {
        ipc: null,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(transport).toBe("http");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("/api/window/minimize", {
        method: "POST",
      });
    });

    it("falls back to HTTP POST if IPC postMessage throws", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const postMessage = vi.fn(() => {
        throw new Error("IPC bridge unavailable");
      });
      const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));

      const transport = dispatchWindowEvent("close", {
        ipc: { postMessage },
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(transport).toBe("http");
      expect(postMessage).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("/api/window/close", {
        method: "POST",
      });
      warnSpy.mockRestore();
    });
  });

  describe("3. Unified Workspaces & Identity Routing (No Duplicate Views)", () => {
    it('routes both "workspaces" and legacy "brand-kits" to the unified WorkspacesView without duplicate tabs', () => {
      const htmlWs = renderToString(
        React.createElement(App, {
          initialTab: "workspaces",
          initialShowSplash: false,
        }),
      );
      const htmlLegacy = renderToString(
        React.createElement(App, {
          initialTab: "brand-kits",
          initialShowSplash: false,
        }),
      );

      expect(htmlWs).toContain("Fontivo");
      expect(htmlWs).not.toContain("PRO STUDIO");
      expect(htmlLegacy).toContain("Fontivo");
      expect(htmlLegacy).not.toContain("PRO STUDIO");
    });

    it("never exposes Sparkles icons or internal port 27715 jargon in UI views and sets select contrast in CSS", () => {
      const uiFiles = [
        "../src/components/layout/Sidebar.tsx",
        "../src/components/views/AdobeBridgeView.tsx",
        "../src/components/views/ColorStudioView.tsx",
        "../src/components/views/GoogleFontsView.tsx",
      ];
      for (const rel of uiFiles) {
        const content = fs.readFileSync(
          fileURLToPath(new URL(rel, import.meta.url)),
          "utf-8",
        );
        expect(content).not.toMatch(/\bSparkles\b/);
        expect(content).not.toContain("27715");
      }
      const css = fs.readFileSync(
        fileURLToPath(new URL("../src/index.css", import.meta.url)),
        "utf-8",
      );
      expect(css).toContain("color-scheme: dark");
      expect(css).toContain("color-scheme: light");
      expect(css).toContain("select option");
    });
  });

  describe("4. Drag & Drop Design File Inspection (Native Upload, Never Native Dialog)", () => {
    it("filters dropped files to supported design extensions", () => {
      expect(isSupportedDesignFile("poster.psd")).toBe(true);
      expect(isSupportedDesignFile("logo.AI")).toBe(true);
      expect(isSupportedDesignFile("book.indd")).toBe(true);
      expect(isSupportedDesignFile("brochure.pdf")).toBe(true);
      expect(isSupportedDesignFile("vector.eps")).toBe(true);
      expect(isSupportedDesignFile("icon.svg")).toBe(true);
      expect(isSupportedDesignFile("notes.txt")).toBe(false);
      expect(isSupportedDesignFile("archive.zip")).toBe(false);

      const files = [
        new File([new Uint8Array([0x38, 0x42, 0x50, 0x53])], "campaign.psd"),
        new File([new Uint8Array([0x50, 0x4b])], "ignore.zip"),
        new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "spec.pdf"),
      ];
      const supported = extractSupportedDesignFiles(files);
      expect(supported.map((f) => f.name)).toEqual([
        "campaign.psd",
        "spec.pdf",
      ]);
    });

    it("uploads actual dropped file bytes to /api/inspect-design-upload instead of /api/dialog/pick-design-file", async () => {
      const mockFile = new File(
        [new Uint8Array([0x38, 0x42, 0x50, 0x53, 0x00, 0x01])],
        "بوستر-العيد.psd",
        {
          type: "application/octet-stream",
        },
      );

      const fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              fileName: mockFile.name,
              totalFonts: 2,
              matchedCount: 2,
              fonts: [
                {
                  name: "Cairo-Bold",
                  available: true,
                  isMatched: true,
                  isActive: true,
                },
                {
                  name: "Amiri-Regular",
                  available: true,
                  isMatched: true,
                  isActive: true,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      );

      const result = await inspectDroppedDesignFile(mockFile, {
        autoActivate: true,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(result.success).toBe(true);
      expect(result.totalFonts).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toContain("/api/inspect-design-upload?");
      expect(url).not.toContain("pick-design-file");
      expect(url).toContain("autoActivate=true");
      expect(url).toContain(encodeURIComponent("بوستر-العيد.psd"));
      expect(init.method).toBe("POST");
      expect(init.body).toBe(mockFile);
    });

    it("rejects files exceeding 100 MB without issuing a network request", async () => {
      const fetchMock = vi.fn();
      const oversizedFile = {
        name: "huge.psd",
        size: MAX_DESIGN_UPLOAD_BYTES + 1,
      } as unknown as File;

      const result = await inspectDroppedDesignFile(oversizedFile, {
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("100 MB");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("5. Local-First Security & CSP in index.html", () => {
    it("defines a strict Content-Security-Policy meta tag and omits external Google Fonts CDN links", () => {
      const indexHtmlPath = fileURLToPath(
        new URL("../index.html", import.meta.url),
      );
      const html = fs.readFileSync(indexHtmlPath, "utf-8");

      expect(html).toContain('http-equiv="Content-Security-Policy"');
      expect(html).toContain("default-src 'self'");
      expect(html).toContain("script-src 'self'");
      expect(html).toContain("object-src 'none'");
      expect(html).not.toContain("fonts.googleapis.com");
      expect(html).not.toContain("fonts.gstatic.com");
    });
  });

  describe("6. WindowsFontsView Least-Privilege Admin/UAC UX", () => {
    it("defaults to non-admin UAC On-Demand state until backend confirms elevation", () => {
      const html = renderToString(
        React.createElement(WindowsFontsView, {
          onRefreshStats: () => {},
          t: {},
          isRtl: false,
        }),
      );

      expect(html).toContain("UAC On-Demand");
      expect(html).not.toContain("Admin Mode");
    });
  });

  describe("7. Themed ConfirmDialog & No Native Browser Popups", () => {
    it("renders themed ConfirmDialog when open and omits markup when closed", () => {
      const closedHtml = renderToString(
        React.createElement(ConfirmDialog, {
          open: false,
          title: "Confirm Removal",
          message: "Delete Cairo?",
          onConfirm: () => {},
          onCancel: () => {},
        }),
      );
      expect(closedHtml).toBe("");

      const openHtml = renderToString(
        React.createElement(ConfirmDialog, {
          open: true,
          title: "تأكيد حذف الخط",
          message: 'هل أنت متأكد من حذف الخط "Cairo"؟',
          confirmLabel: "حذف وإزالة",
          cancelLabel: "إلغاء",
          variant: "danger",
          isRtl: true,
          onConfirm: () => {},
          onCancel: () => {},
        }),
      );
      expect(openHtml).toContain('role="dialog"');
      expect(openHtml).toContain("تأكيد حذف الخط");
      expect(openHtml).toContain("Cairo");
      expect(openHtml).toContain("حذف وإزالة");
      expect(openHtml).toContain("إلغاء");
    });

    it("never calls native window.confirm, window.alert, or window.prompt in UI views/hooks", () => {
      const filesToCheck = [
        "../src/App.tsx",
        "../src/hooks/useFontActivation.ts",
        "../src/components/views/WorkspacesView.tsx",
        "../src/components/views/SystemHealthView.tsx",
      ];
      for (const rel of filesToCheck) {
        const content = fs.readFileSync(
          fileURLToPath(new URL(rel, import.meta.url)),
          "utf-8",
        );
        expect(content).not.toMatch(/\bwindow\.(confirm|alert|prompt)\s*\(/);
      }
    });
  });

  describe("8. Default Family Grid & Clean Settings Separation", () => {
    it("opens App directly in responsive multi-column Family Grid (not single-column rows)", () => {
      const html = renderToString(
        React.createElement(App, {
          initialTab: "library",
          initialShowSplash: false,
        }),
      );

      expect(html).toContain('data-testid="family-grid"');
      expect(html).toContain("md:grid-cols-2");
      expect(html).toContain("xl:grid-cols-3");
    });

    it("renders focused app settings in SettingsView (Language, Theme, Storage, Autostart, Recovery, About)", () => {
      const html = renderToString(
        React.createElement(SettingsView, {
          currentLanguage: "en",
          theme: "dark",
          isRtl: false,
        }),
      );

      expect(html).toContain("Language &amp; Appearance");
      expect(html).toContain("Font Library Storage Path");
      expect(html).toContain("Start Automatically with Windows");
      expect(html).toContain("System Health &amp; Backup Center");
      expect(html).toContain("Windows Fonts &amp; Safe Reset");
      expect(html).toContain("Fontivo v1.0.0");
    });

    it("renders dedicated Licenses & About screen with Team and Application Software License", () => {
      const html = renderToString(
        React.createElement(LicensesView, {
          isRtl: false,
        }),
      );

      expect(html).toContain("Ahmed Fahmy");
      expect(html).toContain("ahmed-fahmy.engineer");
      expect(html).toContain("Mohamed Elashwah");
      expect(html).toContain("mohamed-elashwah.me");
      expect(html).toContain("Software License");
      expect(html).toContain("MIT License");
      expect(html).toContain("Commercial &amp; Personal");
    });
  });
});
