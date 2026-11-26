import { describe, it, expect } from "vitest";
import "../setup";
import {
  getLuminance,
  getContrastRatio,
  getWcagRating,
} from "../../src/utils/colorUtils";

describe("WcagMatrix & WCAG 2.1 Accessibility Tests", () => {
  it("calculates relative luminance according to WCAG 2.1 specification", () => {
    // Pure White has luminance 1.0
    const lumWhite = getLuminance(255, 255, 255);
    expect(lumWhite).toBeCloseTo(1.0, 4);

    // Pure Black has luminance 0.0
    const lumBlack = getLuminance(0, 0, 0);
    expect(lumBlack).toBeCloseTo(0.0, 4);

    // Green contributes most heavily (0.7152), Blue least (0.0722)
    const lumGreen = getLuminance(0, 255, 0);
    const lumRed = getLuminance(255, 0, 0);
    const lumBlue = getLuminance(0, 0, 255);

    expect(lumGreen).toBeGreaterThan(lumRed);
    expect(lumRed).toBeGreaterThan(lumBlue);
  });

  it("calculates contrast ratio using the (L1 + 0.05) / (L2 + 0.05) formula", () => {
    // Max ratio is 21:1 (White vs Black)
    const maxRatio = getContrastRatio("#FFFFFF", "#000000");
    expect(maxRatio).toBe(21);

    // Min ratio is 1:1 (Identical colors)
    const minRatio = getContrastRatio("#777777", "#777777");
    expect(minRatio).toBe(1);

    // Symmetry: order does not affect ratio
    const ratioA = getContrastRatio("#3B82F6", "#1E293B");
    const ratioB = getContrastRatio("#1E293B", "#3B82F6");
    expect(ratioA).toBe(ratioB);
  });

  it("assigns correct compliance badges across AAA, AA, and Fail tiers", () => {
    // 7.5:1 -> AAA normal & large
    const highRating = getWcagRating(7.5);
    expect(highRating.normalText).toBe("AAA");
    expect(highRating.largeText).toBe("AAA");
    expect(highRating.uiComponents).toBe("AA");
    expect(highRating.isNormalPass).toBe(true);

    // 5.0:1 -> AA normal, AAA large
    const midRating = getWcagRating(5.0);
    expect(midRating.normalText).toBe("AA");
    expect(midRating.largeText).toBe("AAA");
    expect(midRating.uiComponents).toBe("AA");
    expect(midRating.isNormalPass).toBe(true);

    // 3.5:1 -> Fail normal, AA large & UI
    const lowPassRating = getWcagRating(3.5);
    expect(lowPassRating.normalText).toBe("Fail");
    expect(lowPassRating.largeText).toBe("AA");
    expect(lowPassRating.uiComponents).toBe("AA");
    expect(lowPassRating.isNormalPass).toBe(false);
    expect(lowPassRating.isLargePass).toBe(true);

    // 2.0:1 -> Fail all
    const failRating = getWcagRating(2.0);
    expect(failRating.normalText).toBe("Fail");
    expect(failRating.largeText).toBe("Fail");
    expect(failRating.uiComponents).toBe("Fail");
    expect(failRating.isNormalPass).toBe(false);
  });
});
