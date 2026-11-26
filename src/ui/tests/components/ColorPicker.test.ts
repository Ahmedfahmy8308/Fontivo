import { describe, it, expect } from "vitest";
import "../setup";
import {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  getContrastRatio,
} from "../../src/utils/colorUtils";

describe("ColorPicker Component & Color Engine Math Tests", () => {
  it("converts RGB channels to 6-character uppercase Hex string", () => {
    expect(rgbToHex(255, 0, 0)).toBe("#FF0000");
    expect(rgbToHex(0, 255, 0)).toBe("#00FF00");
    expect(rgbToHex(0, 0, 255)).toBe("#0000FF");
    expect(rgbToHex(212, 74, 50)).toBe("#D44A32");
  });

  it("clamps out-of-range RGB values safely", () => {
    expect(rgbToHex(300, -50, 128)).toBe("#FF0080");
  });

  it("parses Hex strings into numerical RGB objects", () => {
    expect(hexToRgb("#FF0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("#00FF00")).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb("#0000FF")).toEqual({ r: 0, g: 0, b: 255 });
    // Shorthand hex #F00
    expect(hexToRgb("#F00")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("converts RGB to HSL and back losslessly", () => {
    const original = { r: 180, g: 50, b: 90 };
    const hsl = rgbToHsl(original.r, original.g, original.b);
    const convertedRgb = hslToRgb(hsl.h, hsl.s, hsl.l);

    // Minor rounding within 2 units due to integer percentages
    expect(Math.abs(convertedRgb.r - original.r)).toBeLessThanOrEqual(2);
    expect(Math.abs(convertedRgb.g - original.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(convertedRgb.b - original.b)).toBeLessThanOrEqual(2);
  });

  it("calculates live contrast indicator against dark surface and white text", () => {
    const pickerColor = "#D44A32"; // Vermilion
    const darkSurface = "#0F1115";
    const whiteText = "#FFFFFF";

    const contrastDark = getContrastRatio(pickerColor, darkSurface);
    const contrastWhite = getContrastRatio(pickerColor, whiteText);

    expect(contrastDark).toBeGreaterThan(1);
    expect(contrastWhite).toBeGreaterThan(1);
    expect(contrastDark + contrastWhite).toBeGreaterThan(5);
  });

  it("simulates eyedropper canvas pixel sampling", () => {
    const samplePixel = (
      imageData: Uint8ClampedArray,
      x: number,
      y: number,
      width: number,
    ) => {
      const idx = (y * width + x) * 4;
      return {
        r: imageData[idx],
        g: imageData[idx + 1],
        b: imageData[idx + 2],
        a: imageData[idx + 3],
      };
    };

    const mockPixels = new Uint8ClampedArray([212, 74, 50, 255]);
    const sampled = samplePixel(mockPixels, 0, 0, 1);
    expect(sampled.r).toBe(212);
    expect(sampled.g).toBe(74);
    expect(sampled.b).toBe(50);
    expect(rgbToHex(sampled.r, sampled.g, sampled.b)).toBe("#D44A32");
  });
});
