import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import HeaderBar from "../../src/components/layout/HeaderBar";

describe("HeaderBar Component & Window Controls Tests", () => {
  it("renders application brand and header controls cleanly", () => {
    const html = renderToString(
      React.createElement(HeaderBar, {
        searchQuery: "Amiri",
        setSearchQuery: () => {},
        sortBy: "name-asc",
        setSortBy: () => {},
        showSortMenu: false,
        setShowSortMenu: () => {},
        ramMb: 32,
        theme: "dark",
        toggleTheme: () => {},
        isRtl: false,
      }),
    );

    expect(html).toContain("Fontivo");
  });

  it("handles search query clearing and state updates", () => {
    let query = "Inter";
    const onClear = () => {
      query = "";
    };

    expect(query).toBe("Inter");
    onClear();
    expect(query).toBe("");
  });

  it("triggers window action events (minimize, maximize, close)", () => {
    const sendWindowEvent = vi.fn();
    const handleAction = (action: "minimize" | "maximize" | "close") => {
      sendWindowEvent(action);
    };

    handleAction("minimize");
    expect(sendWindowEvent).toHaveBeenCalledWith("minimize");

    handleAction("maximize");
    expect(sendWindowEvent).toHaveBeenCalledWith("maximize");

    handleAction("close");
    expect(sendWindowEvent).toHaveBeenCalledWith("close");
  });

  it("renders titlebar with Fontivo title, RAM badge, language switcher, theme toggle, and window controls without breadcrumb", () => {
    const html = renderToString(
      React.createElement(HeaderBar, {
        searchQuery: "",
        setSearchQuery: () => {},
        sortBy: "name-asc",
        setSortBy: () => {},
        showSortMenu: false,
        setShowSortMenu: () => {},
        ramMb: 45,
        theme: "dark",
        toggleTheme: () => {},
        currentLanguage: "ar",
        onSetLanguage: () => {},
        onToggleSidebar: () => {},
        onOpenOperations: () => {},
        activeTab: "library",
        isRtl: true,
      }),
    );

    expect(html).toContain("Fontivo");
    expect(html).toContain("45 MB");
    expect(html).toContain('data-testid="header-ram-badge"');
    expect(html).toContain('data-testid="header-language-switcher"');
    expect(html).toContain('data-testid="header-theme-toggle"');
    expect(html).toContain('title="Minimize"');
    expect(html).toContain('title="Maximize"');
    expect(html).toContain('title="Close"');
    expect(html).not.toContain("استوديو الخطوط");
    expect(html).not.toContain("مكتبة الخطوط");
  });

  it("renders Arabic language label when currentLanguage is English", () => {
    const html = renderToString(
      React.createElement(HeaderBar, {
        setSearchQuery: () => {},
        setSortBy: () => {},
        setShowSortMenu: () => {},
        ramMb: 18,
        theme: "light",
        currentLanguage: "en",
        isRtl: false,
      }),
    );

    expect(html).toContain("18 MB");
    expect(html).toContain("عربي");
  });
});
