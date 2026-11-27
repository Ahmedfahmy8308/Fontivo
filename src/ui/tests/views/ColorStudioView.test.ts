import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import ColorStudioView from "../../src/components/views/ColorStudioView";
import {
  hexToRgb,
  rgbToHex,
  rgbToOklch,
  getContrastRatio,
  getWcagRating,
  generateHarmonies,
  generateTailwindScale,
  build5x5LoupeGrid,
} from "../../src/utils/colorUtils";

describe("ColorStudioView Component & Color Engine Tests", () => {
  it("calculates WCAG 2.1 contrast ratios and rating tiers correctly", () => {
    const ratioBlackWhite = getContrastRatio("#000000", "#FFFFFF");
    expect(ratioBlackWhite).toBe(21);
    const ratingBlackWhite = getWcagRating(ratioBlackWhite);
    expect(ratingBlackWhite.normalText).toBe("AAA");
    expect(ratingBlackWhite.largeText).toBe("AAA");
    expect(ratingBlackWhite.uiComponents).toBe("AA");
    expect(ratingBlackWhite.isNormalPass).toBe(true);

    const ratioLow = getContrastRatio("#333333", "#222222");
    expect(ratioLow).toBeLessThan(3.0);
    const ratingLow = getWcagRating(ratioLow);
    expect(ratingLow.normalText).toBe("Fail");
    expect(ratingLow.largeText).toBe("Fail");
    expect(ratingLow.uiComponents).toBe("Fail");

    const ratingAA = getWcagRating(4.8);
    expect(ratingAA.normalText).toBe("AA");
    expect(ratingAA.largeText).toBe("AAA");
    expect(ratingAA.isNormalPass).toBe(true);
  });

  it("generates harmonic color palettes across all 6 color theory modes including split-complementary", () => {
    const baseColor = "#D44A32";
    const harmonies = generateHarmonies(baseColor);

    expect(harmonies.complementary.length).toBe(2);
    expect(harmonies.analogous.length).toBe(3);
    expect(harmonies.triadic.length).toBe(3);
    expect(harmonies.splitComplementary.length).toBe(3);
    expect(harmonies.tetradic.length).toBe(4);
    expect(harmonies.monochromatic.length).toBe(5);

    expect(harmonies.complementary[0]).toBe(baseColor);
    expect(harmonies.splitComplementary[0]).toBe(baseColor);
    expect(harmonies.monochromatic).toContain(baseColor);
  });

  it("performs lossless hex, RGB, OKLCH, Tailwind scale, and 5x5 loupe grid generation", () => {
    const originalHex = "#3B82F6";
    const rgb = hexToRgb(originalHex);
    const backToHex = rgbToHex(rgb.r, rgb.g, rgb.b);
    expect(backToHex).toBe(originalHex.toUpperCase());

    const oklch = rgbToOklch(rgb.r, rgb.g, rgb.b);
    expect(oklch.css).toContain("oklch(");

    const twScale = generateTailwindScale(originalHex);
    expect(twScale["50"]).toBeDefined();
    expect(twScale["950"]).toBeDefined();

    const loupe = build5x5LoupeGrid(originalHex);
    expect(loupe.length).toBe(5);
    expect(loupe[0].length).toBe(5);
  });

  it("renders ColorStudioView with 5x5 Pixel Loupe, multi-space values, and Taskbar Pin action", () => {
    const html = renderToString(
      React.createElement(ColorStudioView, {
        onRefreshStats: () => {},
        t: {},
        isRtl: false,
      }),
    );

    expect(html).toBeDefined();
    expect(html).toContain("5x5 Pixel Loupe");
    expect(html).toContain("Pin Color Picker to Taskbar");
    expect(html).toContain("OKLCH");
    expect(html).toContain("Pick Color From Screen");
    expect(html).toContain("WCAG 2.1 Contrast Checker");
    expect(html).toContain("Tailwind 50–950 Scale");
    expect(html).toContain("Saved Swatches History");
  });

  it("renders prominent Arabic 1-click Screen Eyedropper CTA when isRtl is true", () => {
    const htmlAr = renderToString(
      React.createElement(ColorStudioView, {
        onRefreshStats: () => {},
        t: {},
        isRtl: true,
      }),
    );

    expect(htmlAr).toContain("التقاط لون من أي مكان بالشاشة");
    expect(htmlAr).toContain('data-testid="pick-screen-color-btn"');
    expect(htmlAr).toContain("فاحص تباين WCAG 2.1");
    expect(htmlAr).toContain("مولد تناسقات الألوان");
  });

  it("wraps image canvas and loupe inside a tight relative inline-block container and supports extracted palette", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/components/views/ColorStudioView.tsx"),
      "utf8",
    );

    expect(src).toContain("canvasWrapperRef");
    expect(src).toContain("relative inline-block");
    expect(src).toContain("extractedImagePalette");
    expect(src).toContain('data-testid="extracted-image-palette"');
    expect(src).toContain("إضافة للاستوديو");
    expect(src).toContain("تصدير .ASE");
    expect(src).toContain('img.crossOrigin = "anonymous"');
  });
});
