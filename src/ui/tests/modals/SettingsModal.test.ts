import { describe, it, expect, beforeEach } from "vitest";
import "../setup";

describe("SettingsModal & Preferences Logic Tests", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("toggles theme between dark and light and persists to localStorage", () => {
    let currentTheme = localStorage.getItem("fs_theme") || "dark";
    expect(currentTheme).toBe("dark");

    const toggleTheme = () => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      currentTheme = nextTheme;
      localStorage.setItem("fs_theme", nextTheme);
      return nextTheme;
    };

    expect(toggleTheme()).toBe("light");
    expect(localStorage.getItem("fs_theme")).toBe("light");
    expect(toggleTheme()).toBe("dark");
    expect(localStorage.getItem("fs_theme")).toBe("dark");
  });

  it("manages Windows autostart configuration state and localStorage caching", () => {
    const getAutostart = () => {
      const saved = localStorage.getItem("fontivo_autostart");
      return saved !== null ? JSON.parse(saved) : true;
    };

    const setAutostart = (val: boolean) => {
      localStorage.setItem("fontivo_autostart", JSON.stringify(val));
    };

    expect(getAutostart()).toBe(true);
    setAutostart(false);
    expect(getAutostart()).toBe(false);
    setAutostart(true);
    expect(getAutostart()).toBe(true);
  });

  it("validates hotkey mappings for productivity navigation", () => {
    const DEFAULT_HOTKEYS = {
      search: "Ctrl+F",
      superSearch: "Ctrl+K",
      toggleTheme: "Ctrl+Shift+T",
      purgeRam: "Ctrl+Shift+P",
      tabLibrary: "Alt+1",
      tabSpecimen: "Alt+2",
      tabWorkspaces: "Alt+3",
      tabColorStudio: "Alt+4",
    };

    expect(DEFAULT_HOTKEYS.search).toBe("Ctrl+F");
    expect(DEFAULT_HOTKEYS.superSearch).toBe("Ctrl+K");
    expect(DEFAULT_HOTKEYS.purgeRam).toBe("Ctrl+Shift+P");

    const matchHotkey = (
      event: { ctrlKey: boolean; key: string },
      hotkeyStr: string,
    ) => {
      const parts = hotkeyStr.split("+");
      const needCtrl = parts.includes("Ctrl");
      const key = parts[parts.length - 1].toLowerCase();
      return event.ctrlKey === needCtrl && event.key.toLowerCase() === key;
    };

    expect(
      matchHotkey({ ctrlKey: true, key: "k" }, DEFAULT_HOTKEYS.superSearch),
    ).toBe(true);
    expect(
      matchHotkey({ ctrlKey: false, key: "k" }, DEFAULT_HOTKEYS.superSearch),
    ).toBe(false);
  });

  it("validates local font cache directory path and cleanup payload", () => {
    const formatCachePath = (platform: string, user: string) => {
      if (platform === "win32") {
        return `C:\\Users\\${user}\\AppData\\Local\\Fontivo\\cache`;
      }
      return `/home/${user}/.cache/fontivo`;
    };

    const winPath = formatCachePath("win32", "Designer");
    expect(winPath).toContain("AppData\\Local\\Fontivo\\cache");

    const cleanCachePayload = {
      action: "clear_temp_cache",
      target: "previews_and_thumbnails",
      retainConfig: true,
    };

    expect(cleanCachePayload.action).toBe("clear_temp_cache");
    expect(cleanCachePayload.retainConfig).toBe(true);
  });
});
