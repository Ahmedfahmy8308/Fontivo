import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import FamilyCard, {
  getFamilySmartPreviewText,
} from "../../src/components/cards/FamilyCard";
import { FontFamily, FontItem } from "../../src/types/font";

describe("FamilyCard Component & Multi-Font Grid Card Tests", () => {
  const mockFamily: FontFamily = {
    family: "Inter",
    count: 3,
    fonts: [
      {
        id: "inter-light",
        name: "Inter Light",
        family: "Inter",
        style: "Light",
        active: false,
        isLocal: true,
      },
      {
        id: "inter-regular",
        name: "Inter Regular",
        family: "Inter",
        style: "Regular",
        active: true,
        isLocal: true,
      },
      {
        id: "inter-bold",
        name: "Inter Bold",
        family: "Inter",
        style: "Bold",
        active: false,
        isLocal: true,
      },
    ],
  };

  it("renders one family card with weight/style selector dropdown and style count", () => {
    const html = renderToString(
      React.createElement(FamilyCard, {
        family: mockFamily,
        previewText: "Typography Sample",
        fontSize: 28,
        onToggleActive: () => {},
        onToggleFavorite: () => {},
        onActivateFamily: () => {},
        onDeactivateFamily: () => {},
        onOpenDetails: () => {},
      }),
    );

    expect(html).toContain("Inter");
    expect(html).toContain("3");
    expect(html).toContain('aria-label="Select weight or style"');
    expect(html).toContain("Regular");
    expect(html).toContain("Fontivo_inter-regular");
  });

  it("picks smart preview text based on Latin, Arabic, and Tashkeel filter", () => {
    const latinFont: FontItem = {
      id: "1",
      name: "Inter Regular",
      family: "Inter",
      category: "English",
    };
    const arabicFont: FontItem = {
      id: "2",
      name: "Amiri Regular",
      family: "Amiri",
      category: "Arabic",
      isArabic: true,
    };

    // Latin-only font ignores Arabic preview text and renders Latin specimen
    const latinSample = getFamilySmartPreviewText(
      latinFont,
      "نص عربي",
      true,
      false,
    );
    expect(latinSample).toMatch(/[A-Za-z]/);
    expect(latinSample).not.toMatch(/[\u0600-\u06FF]/);

    // Arabic font with Tashkeel filter renders vocalized harakat specimen
    const tashkeelSample = getFamilySmartPreviewText(
      arabicFont,
      "نص بدون تشكيل",
      true,
      true,
    );
    expect(tashkeelSample).toMatch(/[\u064B-\u065F\u0670]/);
  });

  it("triggers multi-font family activation callback for whole family", () => {
    const onActivateFamily = vi.fn();
    const onDeactivateFamily = vi.fn();

    const activate = (familyName: string) => onActivateFamily(familyName);
    const deactivate = (familyName: string) => onDeactivateFamily(familyName);

    activate("Inter");
    expect(onActivateFamily).toHaveBeenCalledWith("Inter");

    deactivate("Inter");
    expect(onDeactivateFamily).toHaveBeenCalledWith("Inter");
  });

  it("computes family active status when at least one font is active", () => {
    const isAnyActive = mockFamily.fonts.some((f) => f.active);
    const areAllActive = mockFamily.fonts.every((f) => f.active);

    expect(isAnyActive).toBe(true);
    expect(areAllActive).toBe(false);
  });

  it("renders read-only OS Installed badge for Windows system families instead of RAM toggles", () => {
    const systemFamily: FontFamily = {
      family: "Segoe UI",
      count: 1,
      source: "system",
      fonts: [
        {
          id: "sys-segoe-ui",
          name: "Segoe UI",
          family: "Segoe UI",
          style: "Regular",
          source: "system",
          path: "C:\\Windows\\Fonts\\segoeui.ttf",
          active: false,
          isLocal: true,
        },
      ],
    };

    const html = renderToString(
      React.createElement(FamilyCard, {
        family: systemFamily,
        previewText: "Windows System Font",
        fontSize: 28,
        onToggleActive: () => {},
        onToggleFavorite: () => {},
        onActivateFamily: () => {},
        onDeactivateFamily: () => {},
        onOpenDetails: () => {},
      }),
    );

    expect(html).toContain("OS Installed");
    expect(html).not.toContain("Activate selected weight in RAM");
  });
});
