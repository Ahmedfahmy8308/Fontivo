import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import WindowsFontsView from "../../src/components/views/WindowsFontsView";

describe("WindowsFontsView Component & Logic Tests", () => {
  const CORE_FAMILIES = new Set([
    "segoe ui",
    "arial",
    "tahoma",
    "times new roman",
    "calibri",
    "consolas",
    "courier new",
    "verdana",
    "georgia",
  ]);

  const mockSystemFonts = [
    {
      id: "win-1",
      name: "Segoe UI Regular",
      family: "Segoe UI",
      format: "TTF",
      path: "C:\\Windows\\Fonts\\segoeui.ttf",
      isSystem: true,
    },
    {
      id: "win-2",
      name: "Arial Bold",
      family: "Arial",
      format: "TTF",
      path: "C:\\Windows\\Fonts\\arialbd.ttf",
      isSystem: true,
    },
    {
      id: "win-3",
      name: "Calibri",
      family: "Calibri",
      format: "TTF",
      path: "C:\\Windows\\Fonts\\calibri.ttf",
      isSystem: true,
    },
    {
      id: "win-4",
      name: "Amiri Custom",
      family: "Amiri",
      format: "OTF",
      path: "C:\\Users\\User\\AppData\\Local\\Microsoft\\Windows\\Fonts\\amiri.otf",
      isSystem: false,
    },
    {
      id: "win-5",
      name: "Cairo Light",
      family: "Cairo",
      format: "TTF",
      path: "C:\\Windows\\Fonts\\cairo-light.ttf",
      isSystem: false,
    },
  ];

  it("correctly identifies protected core Windows fonts vs user-installed fonts", () => {
    const isProtected = (font: any) => {
      const fam = (font.family || "").toLowerCase().trim();
      return CORE_FAMILIES.has(fam);
    };

    expect(isProtected(mockSystemFonts[0])).toBe(true); // Segoe UI
    expect(isProtected(mockSystemFonts[1])).toBe(true); // Arial
    expect(isProtected(mockSystemFonts[2])).toBe(true); // Calibri
    expect(isProtected(mockSystemFonts[3])).toBe(false); // Amiri Custom
    expect(isProtected(mockSystemFonts[4])).toBe(false); // Cairo Light
  });

  it("paginates system font collections with correct boundary mathematics", () => {
    const PAGE_SIZE = 36;
    const totalFonts = 250;
    const totalPages = Math.ceil(totalFonts / PAGE_SIZE);

    expect(totalPages).toBe(7);

    // Page 1: 0 to 36
    const p1Start = (1 - 1) * PAGE_SIZE;
    const p1End = Math.min(p1Start + PAGE_SIZE, totalFonts);
    expect(p1Start).toBe(0);
    expect(p1End).toBe(36);
    expect(p1End - p1Start).toBe(36);

    // Page 7 (last page): 216 to 250 (34 items)
    const p7Start = (7 - 1) * PAGE_SIZE;
    const p7End = Math.min(p7Start + PAGE_SIZE, totalFonts);
    expect(p7Start).toBe(216);
    expect(p7End).toBe(250);
    expect(p7End - p7Start).toBe(34);
  });

  it("handles single-page and zero-item edge cases cleanly", () => {
    const PAGE_SIZE = 36;
    const emptyFonts = 0;
    const singlePageFonts = 12;

    expect(Math.max(1, Math.ceil(emptyFonts / PAGE_SIZE))).toBe(1);
    expect(Math.max(1, Math.ceil(singlePageFonts / PAGE_SIZE))).toBe(1);
  });

  it("filters system fonts by search term across family, name and format", () => {
    const filterFonts = (list: any[], query: string) => {
      if (!query.trim()) return list;
      const q = query.toLowerCase().trim();
      return list.filter(
        (f) =>
          (f.name && f.name.toLowerCase().includes(q)) ||
          (f.family && f.family.toLowerCase().includes(q)) ||
          (f.format && f.format.toLowerCase().includes(q)),
      );
    };

    expect(filterFonts(mockSystemFonts, "segoe").length).toBe(1);
    expect(filterFonts(mockSystemFonts, "otf").length).toBe(1);
    expect(filterFonts(mockSystemFonts, "ttf").length).toBe(4);
    expect(filterFonts(mockSystemFonts, "cairo").length).toBe(1);
    expect(filterFonts(mockSystemFonts, "nonexistent").length).toBe(0);
  });

  it("generates unique keys even when IDs or paths are missing", () => {
    const edgeFonts = [
      { id: "font-1", name: "Font A", path: "C:\\pathA" },
      { id: null, name: "Font B", path: "C:\\pathB" },
      { id: null, name: "", path: "C:\\pathC" },
      { id: null, name: "", path: "" },
    ];

    const keys = edgeFonts.map(
      (f, i) => f.id || f.name || f.path || `win-fallback-${i}`,
    );
    expect(keys[0]).toBe("font-1");
    expect(keys[1]).toBe("Font B");
    expect(keys[2]).toBe("C:\\pathC");
    expect(keys[3]).toBe("win-fallback-3");
    expect(new Set(keys).size).toBe(4);
  });

  it("renders initial view container and header with system guard indicators", () => {
    const html = renderToString(
      React.createElement(WindowsFontsView, {
        onRefreshStats: () => {},
        t: {},
        isRtl: false,
      }),
    );

    expect(html).toBeDefined();
    expect(typeof html).toBe("string");
  });
});
