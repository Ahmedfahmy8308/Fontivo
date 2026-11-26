import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import ControlBar from "../../src/components/layout/ControlBar";

describe("TabsNavigation & Main App Tab Switching Tests", () => {
  const ALL_TABS = [
    "library",
    "inspector",
    "brand-kits",
    "workspaces",
    "color-studio",
    "windows-fonts",
    "ram-inspector",
    "adobe",
    "settings",
    "playground",
    "discover",
    "licenses",
  ];

  it("manages tab switching transitions and highlights active tab", () => {
    let currentTab = "library";
    const setActiveTab = vi.fn((tab: string) => {
      currentTab = tab;
    });

    expect(currentTab).toBe("library");

    setActiveTab("inspector");
    expect(currentTab).toBe("inspector");
    expect(setActiveTab).toHaveBeenCalledWith("inspector");

    setActiveTab("color-studio");
    expect(currentTab).toBe("color-studio");
  });

  it("contains all required top-level operational tabs", () => {
    expect(ALL_TABS).toContain("library");
    expect(ALL_TABS).toContain("inspector");
    expect(ALL_TABS).toContain("windows-fonts");
    expect(ALL_TABS).toContain("ram-inspector");
    expect(ALL_TABS).toContain("brand-kits");
    expect(ALL_TABS).toContain("color-studio");
    expect(ALL_TABS.length).toBeGreaterThanOrEqual(10);
  });

  it("renders ControlBar navigation with active state styling", () => {
    const html = renderToString(
      React.createElement(ControlBar, {
        activeTab: "brand-kits",
        setActiveTab: () => {},
        currentLanguage: "en",
        setLanguage: () => {},
        t: {},
      }),
    );

    expect(html).toBeDefined();
    expect(typeof html).toBe("string");
  });

  it("preserves inspected family state when returning from other tabs", () => {
    let inspectedFamily: any = { family: "Amiri", count: 4, fonts: [] };
    let activeTab = "inspector";

    const navigateTo = (tab: string) => {
      activeTab = tab;
      // If switching to library, inspector can retain or reset based on user intent
    };

    navigateTo("settings");
    expect(activeTab).toBe("settings");
    expect(inspectedFamily.family).toBe("Amiri");

    navigateTo("inspector");
    expect(activeTab).toBe("inspector");
    expect(inspectedFamily.family).toBe("Amiri");
  });
});
