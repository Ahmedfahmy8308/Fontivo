import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import SpecimenView from "../../src/components/views/SpecimenView";
import { translations } from "../../src/i18n/locales";

describe("SpecimenView Component Tests", () => {
  const mockFont = {
    id: "font-amiri-01",
    name: "Amiri Regular",
    family: "Amiri",
    displayName: "Amiri",
    style: "Regular",
    format: "TTF",
    glyphCount: 450,
    category: "Serif",
    weights: ["Regular", "Bold", "Slanted", "Bold Slanted"],
  };

  it("renders fallback default font specimen when no font is provided", () => {
    const html = renderToString(
      React.createElement(SpecimenView, {
        font: null,
        previewText: "",
        isRtl: false,
        t: translations.en,
      }),
    );

    expect(html).toContain("Cairo");
    expect(html).toContain("Typographic Specimen");
  });

  it("renders Arabic default font specimen when isRtl is true", () => {
    const html = renderToString(
      React.createElement(SpecimenView, {
        font: null,
        previewText: "",
        isRtl: true,
        t: translations.ar,
      }),
    );

    expect(html).toContain("Cairo");
    expect(html).toContain("ورقة العينات التيبوجرافية");
  });

  it("renders specimen heading, family title and metadata correctly", () => {
    const html = renderToString(
      React.createElement(SpecimenView, {
        font: mockFont,
        previewText: "Custom Display Text 64PT",
        isRtl: false,
        t: translations.en,
      }),
    );

    expect(html).toContain("Typographic Specimen");
    expect(html).toContain("Amiri");
    expect(html).toContain("Regular");
    expect(html).toContain("TTF");
    expect(html).toContain("450");
    expect(html).toContain("Custom Display Text 64PT");
  });

  it("applies font-family CSS correctly with fallback names", () => {
    const html = renderToString(
      React.createElement(SpecimenView, {
        font: mockFont,
        previewText: "Typographic Harmony",
        isRtl: false,
        t: translations.en,
      }),
    );

    expect(html).toContain("Fontivo_font-amiri-01");
    expect(html).toContain("Amiri");
  });

  it("renders alphabet character sets and numerical glyph rows", () => {
    const html = renderToString(
      React.createElement(SpecimenView, {
        font: mockFont,
        previewText: "Pangram preview",
        isRtl: false,
        t: translations.en,
      }),
    );

    expect(html).toContain(
      "A B C D E F G H I J K L M N O P Q R S T U V W X Y Z",
    );
    expect(html).toContain("0 1 2 3 4 5 6 7 8 9 &amp; ! ? @ # $ % *");
  });

  it("renders editorial paragraph in RTL mode when isRtl is true", () => {
    const html = renderToString(
      React.createElement(SpecimenView, {
        font: mockFont,
        previewText: "صِف خَلقَ خَودٍ",
        isRtl: true,
        t: translations.ar,
      }),
    );

    expect(html).toContain('dir="rtl"');
    expect(html).toContain("تُعتبر الخطوط التيبوجرافية هي الركيزة الأساسية");
  });

  it("supports custom preview text variations and fallback defaults", () => {
    const htmlDefault = renderToString(
      React.createElement(SpecimenView, {
        font: mockFont,
        previewText: "",
        isRtl: false,
        t: translations.en,
      }),
    );

    expect(htmlDefault).toContain(
      "The quick brown fox jumps over the lazy dog",
    );
  });
});
