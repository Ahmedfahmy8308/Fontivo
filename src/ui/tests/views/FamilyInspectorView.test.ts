import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import FamilyInspectorView from "../../src/components/views/FamilyInspectorView";
import { FontFamily } from "../../src/types/font";

describe("FamilyInspectorView Component Tests", () => {
  const mockFamily: FontFamily = {
    family: "Amiri",
    count: 4,
    fonts: [
      {
        id: "amiri-reg",
        name: "Amiri Regular",
        family: "Amiri",
        style: "Regular",
        format: "TTF",
        active: true,
        path: "/fonts/amiri-reg.ttf",
      },
      {
        id: "amiri-bold",
        name: "Amiri Bold",
        family: "Amiri",
        style: "Bold",
        format: "TTF",
        active: false,
        path: "/fonts/amiri-bold.ttf",
      },
      {
        id: "amiri-slanted",
        name: "Amiri Slanted",
        family: "Amiri",
        style: "Slanted",
        format: "TTF",
        active: false,
        path: "/fonts/amiri-slanted.ttf",
      },
      {
        id: "amiri-bldsl",
        name: "Amiri Bold Slanted",
        family: "Amiri",
        style: "Bold Slanted",
        format: "TTF",
        active: false,
        path: "/fonts/amiri-bldsl.ttf",
      },
    ],
  };

  it("renders empty fallback state when family is null or undefined", () => {
    const htmlNull = renderToString(
      React.createElement(FamilyInspectorView, {
        family: null,
        onBack: () => {},
        isRtl: false,
      }),
    );

    expect(htmlNull).toContain("Select a Font Family to Inspect");
  });

  it("renders Arabic empty fallback message when isRtl is true", () => {
    const htmlRtl = renderToString(
      React.createElement(FamilyInspectorView, {
        family: null,
        onBack: () => {},
        isRtl: true,
      }),
    );

    expect(htmlRtl).toContain("اختر عائلة لعرض مواصفاتها");
  });

  it("renders empty state when family has empty fonts array", () => {
    const emptyFamily = { family: "Empty Family", count: 0, fonts: [] };
    const html = renderToString(
      React.createElement(FamilyInspectorView, {
        family: emptyFamily,
        onBack: () => {},
        isRtl: false,
      }),
    );

    expect(html).toContain("Select a Font Family to Inspect");
  });

  it("renders family inspector with family name, style tabs and active status", () => {
    const html = renderToString(
      React.createElement(FamilyInspectorView, {
        family: mockFamily,
        onBack: () => {},
        previewText: "Arabic Typography Sample",
        isRtl: false,
        onToggleActive: () => {},
        onActivateFamily: () => {},
        onDeactivateFamily: () => {},
      }),
    );

    expect(html).toContain("Amiri");
    expect(html).toContain("Regular");
    expect(html).toContain("Bold");
    expect(html).toContain("4");
  });

  it("safely handles missing individual font attributes without throwing", () => {
    const partialFamily: any = {
      family: "Partial Family",
      count: 1,
      fonts: [{ id: "part-1", name: "Incomplete" }],
    };

    const html = renderToString(
      React.createElement(FamilyInspectorView, {
        family: partialFamily,
        onBack: () => {},
        isRtl: false,
      }),
    );

    expect(html).toContain("Partial Family");
  });
});
