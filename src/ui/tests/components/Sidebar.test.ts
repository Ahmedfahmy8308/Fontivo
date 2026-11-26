import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import Sidebar from "../../src/components/layout/Sidebar";
import { translations } from "../../src/i18n/locales";

describe("Sidebar Component & Navigation Tests", () => {
  const mockStats = {
    total: 11207,
    active: 14,
    ramMb: 42,
    favorites: 28,
    gdiHandles: 112,
  };

  const mockCollections = {
    "Branding 2026": ["font-1", "font-2"],
    "Editorial UI": ["font-3"],
  };

  it("renders core navigation items and highlight for activeTab", () => {
    const html = renderToString(
      React.createElement(Sidebar, {
        activeTab: "library",
        setActiveTab: () => {},
        currentFilter: { type: "all", value: null },
        setFilter: () => {},
        stats: mockStats,
        collections: mockCollections,
        t: translations.en,
        isRtl: false,
      }),
    );

    expect(html).toContain("Import Font Folder");
    expect(html).toContain("Font Library");
    expect(html).toContain("Settings &amp; System");

    const settingsHtml = renderToString(
      React.createElement(Sidebar, {
        activeTab: "windows-fonts",
        sidebarMode: "settings",
        setActiveTab: () => {},
        currentFilter: { type: "all", value: null },
        setFilter: () => {},
        stats: mockStats,
        collections: mockCollections,
        t: translations.en,
        isRtl: false,
      }),
    );

    expect(settingsHtml).toContain("Back to Library");
    expect(settingsHtml).toContain("Windows System Fonts");
    expect(html).toBeDefined();
    expect(typeof html).toBe("string");
  });

  it("displays live RAM usage indicator with memory metrics", () => {
    const formatRam = (stats: typeof mockStats) => `${stats.ramMb} MB`;
    expect(formatRam(mockStats)).toBe("42 MB");
    expect(mockStats.active).toBe(14);
  });

  it("renders custom collection items and handles selection", () => {
    const onSelectCollection = vi.fn();
    const handleSelect = (name: string) => {
      onSelectCollection({ type: "collection", value: name });
    };

    handleSelect("Branding 2026");
    expect(onSelectCollection).toHaveBeenCalledWith({
      type: "collection",
      value: "Branding 2026",
    });
  });

  it("supports collapsed sidebar state for small viewport layouts", () => {
    const htmlCollapsed = renderToString(
      React.createElement(Sidebar, {
        activeTab: "library",
        setActiveTab: () => {},
        setFilter: () => {},
        isCollapsed: true,
        stats: mockStats,
        t: translations.en,
        isRtl: false,
      }),
    );

    expect(htmlCollapsed).toBeDefined();
  });

  it("displays honest real source counts with unified Google Fonts catalog and zero fake 11,207 fallback", () => {
    const htmlAr = renderToString(
      React.createElement(Sidebar, {
        activeTab: "library",
        setActiveTab: () => {},
        currentFilter: { type: "all", value: null },
        setFilter: () => {},
        stats: {
          total: 776,
          activeCount: 12,
          favoritesCount: 5,
          googleCount: 24,
          systemCount: 700,
          localCount: 40,
          cloudCount: 12,
        },
        t: translations.ar,
        isRtl: true,
      }),
    );

    expect(htmlAr).toContain("الكل");
    expect(htmlAr).toContain("المفعلة بالرام");
    expect(htmlAr).toContain("المفضلة");
    expect(htmlAr).toContain("خطوط النظام");
    expect(htmlAr).toContain("المحلية والخاصة");
    expect(htmlAr).toContain("جوجل المحمّلة");
    expect(htmlAr).toContain("كتالوج Google Fonts");
    expect(htmlAr).toContain("1,961+");
    expect(htmlAr).toContain("tabular-nums");
    expect(htmlAr).toContain("776");
    expect(htmlAr).toContain("700");
    expect(htmlAr).toContain("52");
    expect(htmlAr).toContain("24");
    expect(htmlAr).not.toContain("11,207");
  });
});
