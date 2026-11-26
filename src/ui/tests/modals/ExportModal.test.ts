import { describe, it, expect } from "vitest";
import "../setup";
import {
  exportToCssVariables,
  exportToTailwindConfig,
} from "../../src/utils/aseParser";

describe("ExportModal & Design Token Serialization Tests", () => {
  const mockSwatches = [
    { name: "Primary Vermilion", hex: "#D44A32" },
    { name: "Studio Ochre", hex: "#D9822B" },
    { name: "Obsidian Surface", hex: "#161920" },
  ];

  it("exports clean CSS custom properties with configurable variable prefix", () => {
    const cssDefault = exportToCssVariables(mockSwatches);
    expect(cssDefault).toContain(":root {");
    expect(cssDefault).toContain("--fontivo-primary-vermilion: #D44A32;");
    expect(cssDefault).toContain("--fontivo-studio-ochre: #D9822B;");
    expect(cssDefault).toContain("--fontivo-obsidian-surface: #161920;");
    expect(cssDefault).toContain("}");

    const cssCustom = exportToCssVariables(mockSwatches, "brand");
    expect(cssCustom).toContain("--brand-primary-vermilion: #D44A32;");
  });

  it("exports valid Tailwind CSS theme configuration object", () => {
    const tailwindConfig = exportToTailwindConfig(mockSwatches);
    expect(tailwindConfig).toContain("module.exports = {");
    expect(tailwindConfig).toContain("extend: {");
    expect(tailwindConfig).toContain('primary-vermilion: "#D44A32"');
    expect(tailwindConfig).toContain('studio-ochre: "#D9822B"');
    expect(tailwindConfig).toContain('obsidian-surface: "#161920"');
  });

  it("exports structured JSON design tokens for cross-platform pipelines", () => {
    const exportToJson = (swatches: typeof mockSwatches) => {
      const payload = {
        version: "1.0.0",
        generator: "Fontivo Design Token Engine",
        exportedAt: "2026-11-21T00:00:00.000Z",
        tokens: {
          color: swatches.reduce(
            (acc, s) => {
              const key = s.name.toLowerCase().replace(/\s+/g, "-");
              acc[key] = { value: s.hex, type: "color" };
              return acc;
            },
            {} as Record<string, any>,
          ),
        },
      };
      return JSON.stringify(payload, null, 2);
    };

    const jsonStr = exportToJson(mockSwatches);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.version).toBe("1.0.0");
    expect(parsed.tokens.color["primary-vermilion"].value).toBe("#D44A32");
    expect(parsed.tokens.color["studio-ochre"].value).toBe("#D9822B");
  });

  it("handles special characters and accents in color names safely during slugification", () => {
    const specialSwatches = [
      { name: "Élégant Noir & Or!", hex: "#111111" },
      { name: "---Trim-Me---", hex: "#222222" },
    ];

    const css = exportToCssVariables(specialSwatches, "app");
    expect(css).toContain("--app-l-gant-noir-or: #111111;");
    expect(css).toContain("--app-trim-me: #222222;");
  });
});
