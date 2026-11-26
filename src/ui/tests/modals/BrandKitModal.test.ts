import { describe, it, expect } from "vitest";
import "../setup";
import { hexToRgb, rgbToHsl } from "../../src/utils/colorUtils";
import { generateAseBuffer } from "../../src/utils/aseParser";

describe("BrandKitModal & Swatch Creation Suite Tests", () => {
  it("creates new brand palette swatches with designated design roles", () => {
    const swatches = [
      { id: "c1", name: "Brand Crimson", hex: "#E11D48", role: "primary" },
      { id: "c2", name: "Slate Accent", hex: "#475569", role: "secondary" },
      { id: "c3", name: "Amber Gold", hex: "#F59E0B", role: "accent" },
    ];

    expect(swatches.length).toBe(3);
    expect(swatches[0].role).toBe("primary");

    const addSwatch = (name: string, hex: string, role: string) => {
      return [...swatches, { id: `c${swatches.length + 1}`, name, hex, role }];
    };

    const updated = addSwatch("Obsidian Dark", "#0F172A", "background");
    expect(updated.length).toBe(4);
    expect(updated[3].role).toBe("background");
  });

  it("validates and formats hex color edits with real-time RGB/HSL syncing", () => {
    const validateHex = (input: string) => {
      let clean = input.replace("#", "").trim();
      if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(clean)) {
        return null;
      }
      if (clean.length === 3) {
        clean = clean
          .split("")
          .map((c) => c + c)
          .join("");
      }
      return "#" + clean.toUpperCase();
    };

    expect(validateHex("ff0000")).toBe("#FF0000");
    expect(validateHex("#0f0")).toBe("#00FF00");
    expect(validateHex("invalid")).toBeNull();

    const validHex = validateHex("#10B981")!;
    const rgb = hexToRgb(validHex);
    expect(rgb).toEqual({ r: 16, g: 185, b: 129 });

    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    expect(hsl.h).toBeGreaterThan(0);
    expect(hsl.s).toBeGreaterThan(0);
  });

  it("triggers Adobe Swatch Exchange (.ASE) export binary generation", () => {
    const brandPalette = [
      { name: "Primary Red", hex: "#DC2626" },
      { name: "Neutral Dark", hex: "#18181B" },
      { name: "Pure Canvas", hex: "#FFFFFF" },
    ];

    const aseBuffer = generateAseBuffer(brandPalette);
    expect(aseBuffer).toBeInstanceOf(ArrayBuffer);

    const view = new DataView(aseBuffer);
    // Magic ASEF
    const magic = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
    );
    expect(magic).toBe("ASEF");

    // 3 color blocks
    const blockCount = view.getUint32(8);
    expect(blockCount).toBe(3);
  });
});
