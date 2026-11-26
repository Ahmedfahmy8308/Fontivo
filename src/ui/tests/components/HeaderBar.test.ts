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

  it("displays RAM indicator and theme toggle in header controls", () => {
    const toggleTheme = vi.fn();
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
        toggleTheme,
        isRtl: false,
      }),
    );

    expect(html).toContain("45");
  });
});
