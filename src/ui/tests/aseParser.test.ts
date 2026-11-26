import { describe, it, expect } from "vitest";
import {
  parseAseBuffer,
  generateAseBuffer,
  exportToCssVariables,
  exportToTailwindConfig,
} from "../src/utils/aseParser";

describe("Adobe Swatch Exchange (.ASE) Utility", () => {
  const sampleColors = [
    { name: "Architectural Vermilion", hex: "#D44A32" },
    { name: "Warm Studio Ochre", hex: "#D9822B" },
    { name: "Obsidian Black", hex: "#0F1115" },
  ];

  it("generates a valid binary ASE ArrayBuffer and parses it back", () => {
    const buffer = generateAseBuffer(sampleColors);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);

    const parsed = parseAseBuffer(buffer);
    expect(parsed.version).toBe("1.0");
    expect(parsed.totalColors).toBe(3);
    expect(parsed.colors.length).toBe(3);

    expect(parsed.colors[0].name).toBe("Architectural Vermilion");
    expect(parsed.colors[0].hex.toUpperCase()).toBe("#D44A32");
    expect(parsed.colors[0].space).toBe("RGB");

    expect(parsed.colors[1].name).toBe("Warm Studio Ochre");
    expect(parsed.colors[1].hex.toUpperCase()).toBe("#D9822B");

    expect(parsed.colors[2].name).toBe("Obsidian Black");
    expect(parsed.colors[2].hex.toUpperCase()).toBe("#0F1115");
  });

  it("throws an error when parsing buffer with invalid signature", () => {
    const invalidBuffer = new ArrayBuffer(16);
    const view = new DataView(invalidBuffer);
    view.setUint8(0, "N".charCodeAt(0));
    view.setUint8(1, "O".charCodeAt(0));
    view.setUint8(2, "P".charCodeAt(0));
    view.setUint8(3, "E".charCodeAt(0));

    expect(() => parseAseBuffer(invalidBuffer)).toThrow(
      /Invalid ASE signature/,
    );
  });

  it("exports colors as clean CSS Variables", () => {
    const css = exportToCssVariables(sampleColors, "fontivo");
    expect(css).toContain(":root {");
    expect(css).toContain("  --fontivo-architectural-vermilion: #D44A32;");
    expect(css).toContain("  --fontivo-warm-studio-ochre: #D9822B;");
    expect(css).toContain("  --fontivo-obsidian-black: #0F1115;");
    expect(css).toContain("}");
  });

  it("exports colors as Tailwind CSS configuration extend object", () => {
    const tw = exportToTailwindConfig(sampleColors);
    expect(tw).toContain("module.exports = {");
    expect(tw).toContain('architectural-vermilion: "#D44A32"');
    expect(tw).toContain('warm-studio-ochre: "#D9822B"');
    expect(tw).toContain('obsidian-black: "#0F1115"');
  });
});
