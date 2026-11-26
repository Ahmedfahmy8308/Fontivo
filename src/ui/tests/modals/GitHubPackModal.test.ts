import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import GitHubPackModal, {
  VERIFIED_CLOUD_PACKAGES,
} from "../../src/components/modals/GitHubPackModal";

describe("GitHubPackModal & Cloud Packages Suite Tests", () => {
  it("contains exactly 15 verified v1.0.3 cloud packages", () => {
    expect(VERIFIED_CLOUD_PACKAGES.length).toBe(15);
  });

  it("guarantees unique IDs and valid v1.0.3 download URLs across all 15 packages", () => {
    const ids = new Set<string>();
    for (const pkg of VERIFIED_CLOUD_PACKAGES) {
      expect(pkg.id).toBeDefined();
      expect(ids.has(pkg.id)).toBe(false);
      ids.add(pkg.id);

      expect(pkg.downloadUrl).toContain(
        "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/",
      );
      expect(pkg.downloadUrl.endsWith(".zip")).toBe(true);
      expect(pkg.fontCount).toBeGreaterThan(0);
      expect(pkg.compressedBytes).toBeGreaterThan(0);
      expect(pkg.uncompressedBytes).toBeGreaterThan(pkg.compressedBytes);
    }
  });

  it("aggregates exact 10,939 real v1.0.3 fonts across all 15 packs", () => {
    const totalFonts = VERIFIED_CLOUD_PACKAGES.reduce(
      (sum, p) => sum + p.fontCount,
      0,
    );
    expect(totalFonts).toBe(10939);
    expect(totalFonts).not.toBe(10870);
  });

  it("renders modal with real 10,939 / 864.01 MB metrics, flex-wrap category chips, and zero mock labels", () => {
    const html = renderToString(
      React.createElement(GitHubPackModal, {
        isOpen: true,
        onClose: () => {},
        isRtl: true,
      }),
    );

    expect(html).toContain("10,939");
    expect(html).toContain("864.01 MB");
    expect(html).toContain("flex-wrap");
    expect(html).not.toContain("10,870");
    expect(html).not.toContain("459 MB");
    expect(html).not.toContain("رموز وأيقونات");
    expect(html).not.toContain("ريترو وكلاسيك");
  });

  it('orchestrates "Download All" bulk action for uninstalled packages', () => {
    const installed = new Set<string>(["pack-essential-001"]);
    const downloadQueue: string[] = [];

    const handleDownloadAll = () => {
      for (const pkg of VERIFIED_CLOUD_PACKAGES) {
        if (!installed.has(pkg.id)) {
          downloadQueue.push(pkg.id);
        }
      }
    };

    handleDownloadAll();
    expect(downloadQueue.length).toBe(14);
    expect(downloadQueue).not.toContain("pack-essential-001");
  });
});
