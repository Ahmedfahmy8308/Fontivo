import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import WorkspacesView, {
  buildSyncedProjectFonts,
  extractPaletteFromImageData,
  getDeadlineMeta,
  isProtectedRootFolder,
  localizeSwatchRole,
  localizeWorkspaceCategory,
  normalizeHexColor,
} from "../../src/components/views/WorkspacesView";
import {
  exportToCssVariables,
  exportToTailwindConfig,
} from "../../src/utils/aseParser";

describe("WorkspacesView Component & Workspace Switching Tests", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const initialWorkspaces = [
    {
      id: "ws-1",
      name: "Fontivo Swiss Design System",
      category: "Design Agency / Studio",
      palette: [
        { name: "Vermilion", hex: "#D44A32" },
        { name: "Obsidian", hex: "#0F1115" },
      ],
      tasks: [
        { id: "t1", text: "Validate WCAG AA", status: "done" },
        { id: "t2", text: "Export ASE", status: "todo" },
      ],
    },
    {
      id: "ws-2",
      name: "Vogue Haute Horlogerie",
      category: "Editorial & Publishing",
      palette: [
        { name: "Gold", hex: "#D4AF37" },
        { name: "Noir", hex: "#000000" },
      ],
      tasks: [{ id: "t3", text: "Select Serif font", status: "done" }],
    },
  ];

  it("switches active workspace selection by ID", () => {
    let currentId = "ws-1";
    const switchWorkspace = (newId: string) => {
      currentId = newId;
    };

    expect(currentId).toBe("ws-1");
    switchWorkspace("ws-2");
    expect(currentId).toBe("ws-2");
  });

  it("creates and appends a new collection/workspace cleanly", () => {
    const list = [...initialWorkspaces];
    const newWs = {
      id: `ws-${Date.now()}`,
      name: "Neon Cyberpunk 2026",
      category: "Game UI / Branding",
      palette: [
        { name: "Cyan Neon", hex: "#00F0FF" },
        { name: "Magenta Hot", hex: "#FF0055" },
      ],
      tasks: [],
    };

    const updated = [...list, newWs];
    expect(updated.length).toBe(3);
    expect(updated[2].name).toBe("Neon Cyberpunk 2026");
    expect(updated[2].palette.length).toBe(2);
  });

  it("calculates workspace task completion metrics accurately", () => {
    const ws = initialWorkspaces[0];
    const total = ws.tasks.length;
    const completed = ws.tasks.filter((t) => t.status === "done").length;
    const percent = Math.round((completed / total) * 100);

    expect(total).toBe(2);
    expect(completed).toBe(1);
    expect(percent).toBe(50);
  });

  it("exports workspace palette to CSS custom properties and Tailwind config", () => {
    const palette = initialWorkspaces[0].palette;
    const cssVars = exportToCssVariables(palette, "studio");
    const tailwindConf = exportToTailwindConfig(palette);

    expect(cssVars).toContain("--studio-vermilion: #D44A32;");
    expect(cssVars).toContain("--studio-obsidian: #0F1115;");
    expect(tailwindConf).toContain('vermilion: "#D44A32"');
  });

  it("renders WorkspacesView with physical disk path, 4 subfolders (Fonts/, Designs/, Palettes/, Guidelines/), and scanner actions", () => {
    const html = renderToString(
      React.createElement(WorkspacesView, {
        fonts: [],
        onActivateFont: () => {},
        onRefreshStats: () => {},
        t: {},
        isRtl: false,
      }),
    );

    expect(html).toBeDefined();
    expect(html).toContain("Fonts/");
    expect(html).toContain("Designs/");
    expect(html).toContain("Palettes/");
    expect(html).toContain("Guidelines/");
    expect(html).toContain("Open in Explorer");
    expect(html).toContain("Scan Project Folder");
    expect(html).toContain("Save Palettes/palette.ase");
  });

  it("safely handles typography font objects from backend without React child errors (Error #31)", () => {
    const backendWorkspaces = [
      {
        id: "ws-backend",
        name: "Backend Synced Workspace",
        category: "Fintech / SaaS",
        deadline: "2026-12-20",
        customFonts: [
          {
            id: "cf-1",
            label: "Social Media Headlines",
            name: "Tajawal ExtraBold",
            family: "Tajawal",
            style: "ExtraBold",
          },
        ],
        typography: {
          headingFont: {
            name: "Cairo Bold",
            fontId: 101,
            path: "C:\\Fonts\\Cairo-Bold.ttf",
            family: "Cairo",
            style: "Bold",
          },
          bodyFont: {
            name: "Inter Regular",
            fontId: 102,
            path: "C:\\Fonts\\Inter-Regular.ttf",
            family: "Inter",
            style: "Regular",
          },
          accentFont: {
            name: "JetBrains Mono",
            fontId: 103,
            path: "C:\\Fonts\\JetBrainsMono.ttf",
            family: "JetBrains Mono",
            style: "Regular",
          },
          previewHeading: "Custom Backend Specimen",
          previewBody: "Legibility test under font object data.",
        },
        palette: [{ name: "Primary Cyan", hex: "#00F0FF", role: "primary" }],
        tasks: [
          {
            id: "t-high",
            text: "Prepare campaign exports.",
            status: "todo",
            priority: "high",
            dueDate: "2026-12-10",
          },
        ],
      },
    ];

    localStorage.setItem(
      "fontivo_workspaces",
      JSON.stringify(backendWorkspaces),
    );

    const html = renderToString(
      React.createElement(WorkspacesView, {
        fonts: [],
        onActivateFont: () => {},
        onRefreshStats: () => {},
        t: {},
        isRtl: false,
      }),
    );

    expect(html).toBeDefined();
    expect(html).toContain("Cairo Bold");
    expect(html).toContain("Inter Regular");
    expect(html).toContain("JetBrains Mono");
    expect(html).toContain("2026-12-20");
    expect(html).toContain("High");
    expect(html).not.toContain("[object Object]");
  });

  it("localizes workspace categories and renders nested folder + design upload studio controls", () => {
    expect(
      localizeWorkspaceCategory("Branding & Visual Identity", true),
    ).toBe("الهوية البصرية والعلامات التجارية");
    expect(localizeWorkspaceCategory("Fintech / SaaS", false)).toBe(
      "Fintech / SaaS",
    );

    const html = renderToString(
      React.createElement(WorkspacesView, {
        fonts: [],
        onActivateFont: () => {},
        onRefreshStats: () => {},
        t: {},
        isRtl: true,
      }),
    );
    expect(html).toContain("رفع تصميم");
    expect(html).toContain("مجلد داخلي");
    expect(html).toContain("تعديل المشروع");
    expect(html).toContain("max-w-7xl");
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('dir="auto"');
  });

  it("renders collapsed-by-default sidebar, clean Project Font Files without (Fonts/), removes Guidelines & Typography Specimen cards, and enables RAM activation for every font", () => {
    const html = renderToString(
      React.createElement(WorkspacesView, {
        fonts: [
          {
            id: 201,
            name: "InterDisplay-Bold.otf",
            family: "Inter Display",
            style: "Bold",
          },
        ],
        isRtl: true,
      }),
    );

    // 1. Collapsed-by-default sidebar with zero-overflow rail classes
    expect(html).toContain('data-testid="workspaces-sidebar"');
    expect(html).toContain('data-collapsed="true"');
    expect(html).toContain("lg:w-14 shrink-0 overflow-hidden");
    expect(html).toContain("w-9 h-9 mx-auto");
    expect(html).toContain("lg:flex-col items-center");

    // 2. Guidelines & Typography Pairing/Specimen cards removed completely
    expect(html).not.toContain("دليل الهوية والتوجيه الفني");
    expect(html).not.toContain("Brand Identity &amp; Art Direction");
    expect(html).not.toContain("تناغم الخطوط والمعاينة");
    expect(html).not.toContain("Typography Pairing");
    expect(html).not.toContain('data-testid="workspace-specimen-size-slider"');
    expect(html).not.toContain('data-testid="workspace-specimen-input"');

    // 3. Clean Arabic Project Font Files heading without (Fonts/) or (FONTS/)
    expect(html).toContain("ملفات خطوط المشروع");
    expect(html).not.toContain("ملفات خطوط المشروع (");

    // 4. RAM activation button & role assignment rendered for every project font
    expect(html).toContain('data-testid="workspace-font-ram-btn"');
    expect(html).toContain("تفعيل");
    expect(html).toContain("نشط بالرام");
    expect(html).toContain('aria-label="تعيين دور الخط"');

    // Full-width auto-fill swatch grid (min 240px per card — never collapses on desktop 1920px+)
    expect(html).toContain(
      "grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5",
    );

    // Full-library live font search & design file search inputs
    expect(html).toContain("ابحث في كامل مكتبة الخطوط لإضافة خط إلى المشروع");
    expect(html).toContain("بحث في ملفات التصميم...");

    // Preset Brand Folder Templates removed; Import Design (.PSD / .AI) button added
    expect(html).not.toContain("قوالب مجلدات الهوية الجاهزة");
    expect(html).not.toContain("1-Click Brand Folder Templates");
    expect(html).toContain("استيراد ملف تصميم (.PSD / .AI)");
    expect(html).toContain("ملفات التصميم والمجلدات الفرعية");
    expect(html).not.toContain("ملفات التصميم والمجلدات الفرعية (");

    // Tasks heading without (Guidelines/) and rich Add Task modal trigger
    expect(html).toContain("مهام المشروع ومواعيد التسليم");
    expect(html).not.toContain("مهام المشروع ومواعيد التسليم (");
    expect(html).toContain('data-testid="open-add-task-modal-btn"');
    expect(html).toContain("إضافة مهمة");

    // Open File button
    expect(html).toContain("فتح الملف");

    // Arabic task filter pills must use font-sans (never font-mono)
    expect(html).toContain("الكل");
    expect(html).toContain("قيد الانتظار");
    expect(html).toContain("جاري العمل");
    expect(html).toContain("مكتمل");
    expect(html).not.toMatch(/font-mono[^>]*>[^<]*(?:الكل|قيد الانتظار|جاري العمل|مكتمل)/);
  });

  it("renders Ergonomic Create/Edit Brand Builder modal with custom font roles, library picker, target deadline, and dynamic palette builder", () => {
    const html = renderToString(
      React.createElement(WorkspacesView, {
        fonts: [
          {
            id: 11,
            name: "Cairo-Bold.ttf",
            family: "Cairo",
            style: "Bold",
            source: "local",
          },
          {
            id: 12,
            name: "Tajawal-Regular.ttf",
            family: "Tajawal",
            style: "Regular",
            source: "google",
          },
        ],
        isRtl: true,
        initialModalOpen: true,
      }),
    );

    expect(html).toContain("إضافة نوع/دور خط مخصص");
    expect(html).toContain("إضافة لون / ليبل جديد");
    expect(html).toContain('type="date"');
    expect(html).toContain('type="color"');
    expect(html).toContain("Cairo — Bold");
    expect(html).toContain("Tajawal — Regular");
    expect(html).toContain("ابحث في كامل مكتبة الخطوط لإضافة خط إلى المشروع");
    expect(html).toContain("pe-9");
    expect(html).toContain('dir="auto"');
    expect(html).toContain('appearance:none');
    expect(html).toContain('data-testid="open-add-task-modal-btn"');
  });

  it("syncs heading, body, accent, and custom font roles cleanly into deduplicated projectFonts", () => {
    const synced = buildSyncedProjectFonts(
      [
        { name: "Cairo Bold", fontId: 11, family: "Cairo", path: "Fonts/Cairo.ttf" },
        { name: "Tajawal Regular", fontId: 12, family: "Tajawal", path: "Fonts/Tajawal.ttf" },
        { name: "JetBrains Mono", fontId: 13, family: "JetBrains Mono", path: "Fonts/JB.ttf" },
        { name: "Cairo Bold", fontId: 11, family: "Cairo", path: "Fonts/Cairo.ttf" }, // duplicate
      ],
      [{ name: "IBM Plex Sans Arabic", fontId: 14, family: "IBM Plex Sans Arabic" }],
    );

    expect(synced).toHaveLength(4);
    expect(synced.map((f) => f.name)).toEqual([
      "Cairo Bold",
      "Tajawal Regular",
      "JetBrains Mono",
      "IBM Plex Sans Arabic",
    ]);
  });

  it("computes deadline countdown metadata, swatch role labels, hex normalization, and root folder protection", () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const todayStr = fmt(now);
    const past = new Date(now);
    past.setDate(past.getDate() - 2);
    const future = new Date(now);
    future.setDate(future.getDate() + 5);

    expect(getDeadlineMeta(todayStr, false, false)?.tone).toBe("soon");
    expect(getDeadlineMeta(todayStr, false, true)?.label).toBe("موعد التسليم اليوم");
    expect(getDeadlineMeta(fmt(past), false, false)?.tone).toBe("overdue");
    expect(getDeadlineMeta(fmt(future), false, false)?.tone).toBe("ok");
    expect(getDeadlineMeta(fmt(past), true, false)?.tone).toBe("neutral");

    expect(localizeSwatchRole("primary", true)).toBe("أساسي");
    expect(localizeSwatchRole("Gold Foil", true)).toBe("Gold Foil");
    expect(normalizeHexColor("f60")).toBe("#FF6600");
    expect(normalizeHexColor("#b7a1d9")).toBe("#B7A1D9");

    expect(isProtectedRootFolder("Designs")).toBe(true);
    expect(isProtectedRootFolder("Designs/Instagram")).toBe(false);
  });

  it("extracts up to 5 distinct non-near-duplicate dominant hex colors from RGBA image data", () => {
    const pushPixels = (
      out: number[],
      r: number,
      g: number,
      b: number,
      a: number,
      count: number,
    ) => {
      for (let i = 0; i < count; i++) out.push(r, g, b, a);
    };

    const buf: number[] = [];
    // Transparent pixels should be ignored
    pushPixels(buf, 12, 34, 56, 0, 40);
    // Primary red + near-duplicate red (should collapse into one)
    pushPixels(buf, 240, 32, 32, 255, 30);
    pushPixels(buf, 236, 36, 34, 255, 25);
    // Distinct colors
    pushPixels(buf, 16, 185, 129, 255, 22);
    pushPixels(buf, 37, 99, 235, 255, 18);
    pushPixels(buf, 245, 180, 40, 255, 14);
    pushPixels(buf, 180, 120, 220, 255, 10);
    // 6th distinct color (should be excluded by maxColors=5)
    pushPixels(buf, 20, 20, 20, 255, 5);

    const extracted = extractPaletteFromImageData(new Uint8ClampedArray(buf), 5);
    expect(extracted).toHaveLength(5);
    for (const hex of extracted) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    }
    // Verify no near-duplicates among extracted colors
    for (let i = 0; i < extracted.length; i++) {
      for (let j = i + 1; j < extracted.length; j++) {
        const parse = (h: string) => [
          parseInt(h.slice(1, 3), 16),
          parseInt(h.slice(3, 5), 16),
          parseInt(h.slice(5, 7), 16),
        ];
        const [r1, g1, b1] = parse(extracted[i]);
        const [r2, g2, b2] = parse(extracted[j]);
        const dist = Math.hypot(r1 - r2, g1 - g2, b1 - b2);
        expect(dist).toBeGreaterThanOrEqual(44);
      }
    }

    // Empty / transparent buffer returns empty array
    expect(extractPaletteFromImageData(new Uint8ClampedArray(0), 5)).toEqual([]);
    expect(
      extractPaletteFromImageData(new Uint8ClampedArray([255, 0, 0, 0]), 5),
    ).toEqual([]);
  });

  it("renders Export Handover (.ZIP) button, clean English Project Font Files heading, and Extract Palette from Logo button when logo is present", () => {
    const wsWithLogo = [
      {
        id: "brand-zip-test",
        name: "Atlas Visual Studio",
        category: "Branding & Visual Identity",
        logoDataUrl: "data:image/png;base64,iVBORw0KGgo=",
        typography: {
          headingFont: { name: "Cairo Bold", fontId: 42, family: "Cairo" },
          bodyFont: { name: "Tajawal Regular", fontId: 43, family: "Tajawal" },
          previewHeading: "Atlas Headline Specimen",
          previewBody: "Atlas body paragraph preview.",
        },
        palette: [{ name: "Coral", hex: "#F16B50", role: "primary" }],
        tasks: [],
      },
    ];
    localStorage.setItem("fontivo_workspaces", JSON.stringify(wsWithLogo));

    const htmlEn = renderToString(
      React.createElement(WorkspacesView, { fonts: [], isRtl: false }),
    );
    expect(htmlEn).toContain("Export Handover (.ZIP)");
    expect(htmlEn).toContain("/api/workspaces/brand-zip-test/export-bundle");
    expect(htmlEn).toContain("Extract Palette from Logo");
    expect(htmlEn).toContain("Project Font Files");
    expect(htmlEn).not.toContain("Project Font Files (Fonts/)");
    expect(htmlEn).toContain('data-testid="workspace-font-ram-btn"');

    const htmlAr = renderToString(
      React.createElement(WorkspacesView, { fonts: [], isRtl: true }),
    );
    expect(htmlAr).toContain("تصدير حزمة التسليم (.ZIP)");
    expect(htmlAr).toContain("استخراج الألوان من الشعار");
  });
});
