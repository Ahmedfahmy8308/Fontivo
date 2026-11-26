import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import WorkspacesView from "../../src/components/views/WorkspacesView";
import {
  exportToCssVariables,
  exportToTailwindConfig,
} from "../../src/utils/aseParser";

describe("WorkspacesView Component & Workspace Switching Tests", () => {
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
        palette: [{ name: "Primary Cyan", hex: "#00F0FF" }],
        tasks: [],
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
    expect(html).not.toContain("[object Object]");
  });

  it("localizes workspace categories and renders nested folder + design upload studio controls", async () => {
    const mod = await import("../../src/components/views/WorkspacesView");
    expect(
      mod.localizeWorkspaceCategory("Branding & Visual Identity", true),
    ).toBe("الهوية البصرية والعلامات التجارية");
    expect(mod.localizeWorkspaceCategory("Fintech / SaaS", false)).toBe(
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
  });
});
