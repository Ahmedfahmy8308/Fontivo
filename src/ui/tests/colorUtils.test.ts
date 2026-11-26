import { describe, it, expect } from "vitest";
import {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  rgbToCmyk,
  rgbToOklch,
  hexToOklch,
  getLuminance,
  getContrastRatio,
  getWcagRating,
  generateHarmonies,
  generateTailwindScale,
  generateMaterial3Palettes,
  APPLE_HIG_COLORS,
  PANTONE_EDITORIAL_PALETTES,
  build5x5LoupeGrid,
  generateWcagMatrix,
} from "../src/utils/colorUtils";

describe("Color Utilities & Math Engine", () => {
  it("converts hex to rgb correctly", () => {
    expect(hexToRgb("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb("#D44A32")).toEqual({ r: 212, g: 74, b: 50 });
    expect(hexToRgb("fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("converts rgb to hex correctly", () => {
    expect(rgbToHex(255, 255, 255)).toBe("#FFFFFF");
    expect(rgbToHex(0, 0, 0)).toBe("#000000");
    expect(rgbToHex(212, 74, 50)).toBe("#D44A32");
  });

  it("converts rgb to hsl and back to rgb", () => {
    const { h, s, l } = rgbToHsl(212, 74, 50);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(l).toBeGreaterThanOrEqual(0);

    const backRgb = hslToRgb(h, s, l);
    expect(Math.abs(backRgb.r - 212)).toBeLessThanOrEqual(2);
    expect(Math.abs(backRgb.g - 74)).toBeLessThanOrEqual(2);
    expect(Math.abs(backRgb.b - 50)).toBeLessThanOrEqual(2);
  });

  it("converts rgb to cmyk correctly", () => {
    const cmykBlack = rgbToCmyk(0, 0, 0);
    expect(cmykBlack).toEqual({ c: 0, m: 0, y: 0, k: 100 });

    const cmykWhite = rgbToCmyk(255, 255, 255);
    expect(cmykWhite).toEqual({ c: 0, m: 0, y: 0, k: 0 });

    const cmykRed = rgbToCmyk(255, 0, 0);
    expect(cmykRed.c).toBe(0);
    expect(cmykRed.m).toBe(100);
    expect(cmykRed.y).toBe(100);
    expect(cmykRed.k).toBe(0);
  });

  it("converts rgb and hex to OKLCH color space accurately", () => {
    const whiteOklch = rgbToOklch(255, 255, 255);
    expect(whiteOklch.l).toBeCloseTo(1, 2);
    expect(whiteOklch.c).toBeCloseTo(0, 2);
    expect(whiteOklch.css).toContain("oklch(");

    const vermilionOklch = hexToOklch("#D44A32");
    expect(vermilionOklch.l).toBeGreaterThan(0.4);
    expect(vermilionOklch.c).toBeGreaterThan(0.1);
    expect(vermilionOklch.h).toBeGreaterThan(0);
  });

  it("calculates relative luminance", () => {
    const whiteLum = getLuminance(255, 255, 255);
    const blackLum = getLuminance(0, 0, 0);
    expect(whiteLum).toBeCloseTo(1.0, 2);
    expect(blackLum).toBeCloseTo(0.0, 2);
  });

  it("calculates WCAG contrast ratio accurately", () => {
    const blackWhiteContrast = getContrastRatio("#000000", "#FFFFFF");
    expect(blackWhiteContrast).toBeCloseTo(21, 0);

    const sameContrast = getContrastRatio("#FFFFFF", "#FFFFFF");
    expect(sameContrast).toBeCloseTo(1, 0);
  });

  it("computes WCAG 2.1 compliance ratings", () => {
    const rating21 = getWcagRating(21);
    expect(rating21.normalText).toBe("AAA");
    expect(rating21.largeText).toBe("AAA");
    expect(rating21.isNormalPass).toBe(true);

    const rating4_8 = getWcagRating(4.8);
    expect(rating4_8.normalText).toBe("AA");
    expect(rating4_8.largeText).toBe("AAA");
    expect(rating4_8.isNormalPass).toBe(true);

    const rating2 = getWcagRating(2.1);
    expect(rating2.normalText).toBe("Fail");
    expect(rating2.isNormalPass).toBe(false);
  });

  it("generates all 6 harmonic palettes including splitComplementary", () => {
    const harmonies = generateHarmonies("#D44A32");
    expect(harmonies.complementary.length).toBe(2);
    expect(harmonies.analogous.length).toBe(3);
    expect(harmonies.triadic.length).toBe(3);
    expect(harmonies.splitComplementary.length).toBe(3);
    expect(harmonies.tetradic.length).toBe(4);
    expect(harmonies.monochromatic.length).toBe(5);
  });

  it("generates Tailwind CSS v4 Scale (50-950), Material 3 Tonal Palettes, Apple HIG, Pantone & 5x5 Loupe Grid", () => {
    const scale = generateTailwindScale("#2563EB");
    expect(Object.keys(scale)).toEqual([
      "50",
      "100",
      "200",
      "300",
      "400",
      "500",
      "600",
      "700",
      "800",
      "900",
      "950",
    ]);
    expect(scale["500"]).toMatch(/^#[0-9A-F]{6}$/);

    const m3 = generateMaterial3Palettes("#D44A32");
    expect(m3.primary.length).toBe(11);
    expect(m3.secondary.length).toBe(11);
    expect(m3.tertiary.length).toBe(11);
    expect(m3.neutral.length).toBe(11);

    expect(APPLE_HIG_COLORS.length).toBeGreaterThanOrEqual(10);
    expect(PANTONE_EDITORIAL_PALETTES.length).toBeGreaterThanOrEqual(3);

    const loupe = build5x5LoupeGrid("#D44A32");
    expect(loupe.length).toBe(5);
    expect(loupe[2][2]).toBe("#D44A32");

    const matrix = generateWcagMatrix([
      { name: "Black", hex: "#000000" },
      { name: "White", hex: "#FFFFFF" },
    ]);
    expect(matrix.length).toBe(2);
    expect(matrix[0].cells[1].ratio).toBe(21);
  });
});
