import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import FontCard from "../../src/components/cards/FontCard";
import { FontItem } from "../../src/types/font";

describe("FontCard Component Tests", () => {
  const mockFont: FontItem = {
    id: "font-tajawal-bold",
    name: "Tajawal Bold",
    displayName: "Tajawal Bold",
    family: "Tajawal",
    style: "Bold",
    format: "OTF",
    active: true,
    favorite: false,
    path: "C:\\Fonts\\Tajawal-Bold.otf",
    isLocal: true,
  };

  it("renders font title, family name, and format metadata", () => {
    const html = renderToString(
      React.createElement(FontCard, {
        font: mockFont,
        previewText: "Sample Preview",
        fontSize: 32,
        onToggleActive: () => {},
        onToggleFavorite: () => {},
        onOpenDetails: () => {},
        onToggleCompare: () => {},
      }),
    );

    expect(html).toContain("Tajawal Bold");
    expect(html).toContain("Tajawal");
  });

  it("displays active RAM badge when font.active is true", () => {
    const htmlActive = renderToString(
      React.createElement(FontCard, {
        font: mockFont,
        previewText: "Preview",
        fontSize: 32,
        onToggleActive: () => {},
        onToggleFavorite: () => {},
        onOpenDetails: () => {},
        onToggleCompare: () => {},
      }),
    );

    expect(htmlActive).toBeDefined();
    expect(mockFont.active).toBe(true);
  });

  it("invokes click activation callback with font ID and status", () => {
    const onToggleActive = vi.fn();
    const handleActivate = (f: FontItem) => {
      onToggleActive(f.id, f.active);
    };

    handleActivate(mockFont);
    expect(onToggleActive).toHaveBeenCalledWith("font-tajawal-bold", true);
  });

  it("supports compact and editorial viewMode variants", () => {
    const htmlCompact = renderToString(
      React.createElement(FontCard, {
        font: mockFont,
        previewText: "Compact test",
        fontSize: 24,
        viewMode: "compact",
        onToggleActive: () => {},
        onToggleFavorite: () => {},
        onOpenDetails: () => {},
        onToggleCompare: () => {},
      }),
    );

    expect(htmlCompact).toBeDefined();
    expect(htmlCompact).toContain("Tajawal Bold");
  });

  it("renders read-only OS Installed status for Windows system fonts instead of a RAM toggle button", () => {
    const systemFont: FontItem = {
      id: "sys-arial",
      name: "Arial",
      displayName: "Arial",
      family: "Arial",
      style: "Regular",
      format: "TTF",
      source: "system",
      active: true,
      favorite: false,
      path: "C:\\Windows\\Fonts\\arial.ttf",
      isLocal: true,
    };

    const htmlClassic = renderToString(
      React.createElement(FontCard, {
        font: systemFont,
        previewText: "System Test",
        fontSize: 28,
        viewMode: "classic",
        onToggleActive: () => {},
        onToggleFavorite: () => {},
        onOpenDetails: () => {},
        onToggleCompare: () => {},
      }),
    );

    expect(htmlClassic).toContain("OS Installed");
    expect(htmlClassic).not.toContain("Deactivate from RAM");
    expect(htmlClassic).not.toContain("Activate in RAM");
  });
});
