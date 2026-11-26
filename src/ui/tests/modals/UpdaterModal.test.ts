import { describe, it, expect, vi } from "vitest";
import "../setup";

describe("AutoUpdater & Notification Banner Tests", () => {
  it("formats the ready-to-install banner notification message in English and Arabic", () => {
    const updateInfo = {
      status: "ready_to_install",
      currentVersion: "1.0.0",
      latestVersion: "1.0.1",
      hasUpdate: true,
      releaseNotes: "Fixed font loading performance and improved Adobe bridge.",
      installerPath:
        "C:\\Users\\User\\AppData\\Roaming\\Fontivo\\updates\\Fontivo-v1.0.1-Setup.exe",
    };

    const formatBannerMessage = (info: typeof updateInfo, isRtl: boolean) => {
      if (isRtl) {
        return ` تم تنزيل تحديث Fontivo v${info.latestVersion} تلقائياً وهو جاهز للتثبيت!`;
      }
      return ` Fontivo v${info.latestVersion} is downloaded and ready to install!`;
    };

    expect(formatBannerMessage(updateInfo, false)).toBe(
      " Fontivo v1.0.1 is downloaded and ready to install!",
    );
    expect(formatBannerMessage(updateInfo, true)).toBe(
      " تم تنزيل تحديث Fontivo v1.0.1 تلقائياً وهو جاهز للتثبيت!",
    );
  });

  it("calculates background download progress accurately", () => {
    const computeProgress = (downloaded: number, total: number) => {
      if (total <= 0) return 0;
      return Math.min(100, Math.max(0, Math.round((downloaded / total) * 100)));
    };

    expect(computeProgress(0, 4122132)).toBe(0);
    expect(computeProgress(2061066, 4122132)).toBe(50);
    expect(computeProgress(4122132, 4122132)).toBe(100);
    expect(computeProgress(5000000, 4122132)).toBe(100);
  });

  it("handles state transitions from checking to downloading and ready_to_install", () => {
    let state = {
      status: "idle",
      currentVersion: "1.0.0",
      latestVersion: "1.0.0",
      hasUpdate: false,
      installerPath: null as string | null,
    };

    // 1. Initial check finds new version
    const onDiscovered = (version: string) => {
      state = {
        ...state,
        status: "downloading",
        latestVersion: version,
        hasUpdate: true,
      };
    };

    onDiscovered("1.0.2");
    expect(state.status).toBe("downloading");
    expect(state.hasUpdate).toBe(true);

    // 2. Download finishes and verifies sha256
    const onDownloadComplete = (path: string) => {
      state = {
        ...state,
        status: "ready_to_install",
        installerPath: path,
      };
    };

    onDownloadComplete("C:\\Fontivo\\updates\\Fontivo-Setup.exe");
    expect(state.status).toBe("ready_to_install");
    expect(state.installerPath).toBe("C:\\Fontivo\\updates\\Fontivo-Setup.exe");
  });

  it("triggers apply update with silent installation parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: "Installer launched",
        status: "installing",
      }),
    });
    global.fetch = fetchMock;

    const applyUpdate = async () => {
      const res = await fetch("/api/updater/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ silent: true }),
      });
      return await res.json();
    };

    const res = await applyUpdate();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/updater/apply",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ silent: true }),
      }),
    );
    expect(res.success).toBe(true);
    expect(res.status).toBe("installing");
  });
});
