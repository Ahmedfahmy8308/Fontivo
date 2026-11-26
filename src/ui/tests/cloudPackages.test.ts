import { describe, it, expect } from "vitest";
import { VERIFIED_CLOUD_PACKAGES } from "../src/components/modals/GitHubPackModal";
import {
  CLOUD_MANIFEST_VERSION,
  CLOUD_TOTAL_FONTS,
  CLOUD_TOTAL_COMPRESSED_BYTES,
  formatCloudBytes,
  normalizeManifestPackages,
} from "../src/utils/cloudPackages";
import { FontItem, FontFamily } from "../src/types/font";

describe("Cloud Packages Hub & Real v1.0.3 Manifest Verification", () => {
  it("contains exactly 15 verified v1.0.3 cloud packages", () => {
    expect(VERIFIED_CLOUD_PACKAGES).toBeDefined();
    expect(VERIFIED_CLOUD_PACKAGES.length).toBe(15);
    expect(CLOUD_MANIFEST_VERSION).toBe("1.0.3");
  });

  it("aggregates to exact 10,939 fonts and 864.01 MB compressed (zero mock 10,870 / 459 MB)", () => {
    const totalFonts = VERIFIED_CLOUD_PACKAGES.reduce(
      (sum, pkg) => sum + pkg.fontCount,
      0,
    );
    const totalBytes = VERIFIED_CLOUD_PACKAGES.reduce(
      (sum, pkg) => sum + pkg.compressedBytes,
      0,
    );

    expect(totalFonts).toBe(10939);
    expect(totalFonts).toBe(CLOUD_TOTAL_FONTS);
    expect(totalBytes).toBe(CLOUD_TOTAL_COMPRESSED_BYTES);
    expect(formatCloudBytes(totalBytes)).toBe("864.01 MB");
  });

  it("validates each cloud package schema, v1.0.3 download URL, SHA-256, and compressed sizes", () => {
    for (const pkg of VERIFIED_CLOUD_PACKAGES) {
      expect(pkg.id).toMatch(/^pack-essential-\d{3}$/);
      expect(pkg.name).toBeTruthy();
      expect(pkg.nameAr).toBeTruthy();
      expect(["arabic", "latin", "persian", "urdu", "multilingual"]).toContain(
        pkg.category,
      );
      expect(pkg.fontCount).toBeGreaterThan(0);
      expect(pkg.compressedBytes).toBeGreaterThan(0);
      expect(pkg.compressedSize).toMatch(/\d+(\.\d+)?\s*MB/i);
      expect(pkg.downloadUrl).toMatch(
        /^https:\/\/github\.com\/Ahmedfahmy8308\/Fontivo-Fonts\/releases\/download\/v1\.0\.3\/fontivo-essential-\d{3}\.zip$/,
      );
      expect(pkg.sha256).toMatch(/^[a-f0-9]{64}$/i);
      expect(pkg.description).toBeTruthy();
      expect(pkg.descriptionAr).toBeTruthy();
    }
  });

  it("keeps categories aligned with verified v1.0.3 scripts (Arabic, Latin, Persian, Urdu, Multilingual)", () => {
    const categories = new Set(VERIFIED_CLOUD_PACKAGES.map((p) => p.category));
    expect(Array.from(categories).sort()).toEqual([
      "arabic",
      "latin",
      "multilingual",
      "persian",
      "urdu",
    ]);

    const arabicPacks = VERIFIED_CLOUD_PACKAGES.filter(
      (p) => p.category === "arabic",
    );
    const latinPacks = VERIFIED_CLOUD_PACKAGES.filter(
      (p) => p.category === "latin",
    );
    const persianPacks = VERIFIED_CLOUD_PACKAGES.filter(
      (p) => p.category === "persian",
    );
    const urduPacks = VERIFIED_CLOUD_PACKAGES.filter(
      (p) => p.category === "urdu",
    );
    const multiPacks = VERIFIED_CLOUD_PACKAGES.filter(
      (p) => p.category === "multilingual",
    );
    expect(arabicPacks.length).toBe(1);
    expect(latinPacks.length).toBe(8);
    expect(persianPacks.length).toBe(1);
    expect(urduPacks.length).toBe(4);
    expect(multiPacks.length).toBe(1);
  });

  it("normalizes live /api/library/manifest object-map and array payloads accurately", () => {
    const manifestMapPayload = {
      libraryVersion: "1.0.3",
      summary: {
        totalUniqueFonts: 10939,
        totalFamilies: 4430,
        totalCompressedSizeBytes: 905982558,
      },
      packages: {
        "pack-essential-001": {
          id: "pack-essential-001",
          fileName: "fontivo-essential-001.zip",
          version: "1.0.5",
          url: "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3/fontivo-essential-001.zip",
          fontCount: 970,
          compressedSizeBytes: 42825441,
          uncompressedSizeBytes: 92383140,
          sha256:
            "8c932847ee9c1c62fd84e202d5c02786b7c9f02174bd8e5edc7b236f77b1c83e",
        },
      },
    };

    const normalized = normalizeManifestPackages(manifestMapPayload);
    expect(normalized.source).toBe("live");
    expect(normalized.libraryVersion).toBe("1.0.3");
    expect(normalized.packages.length).toBe(1);
    expect(normalized.packages[0].category).toBe("arabic");
    expect(normalized.packages[0].fontCount).toBe(970);
    expect(normalized.packages[0].compressedSize).toBe("40.84 MB");
  });

  it("accurately evaluates font local vs cloud availability state", () => {
    const localFont: FontItem = {
      id: "local-1",
      name: "Amiri Regular",
      family: "Amiri",
      isLocal: true,
      isDownloaded: true,
    };

    const cloudFont: FontItem = {
      id: "cloud-1",
      name: "DecoType Thuluth",
      family: "DecoType",
      isLocal: false,
      isDownloaded: false,
      path: "cloud://packs/pack-essential-001/thuluth.ttf",
    };

    const checkLocal = (f: FontItem): boolean => {
      if (f.isLocal !== undefined) return Boolean(f.isLocal);
      if (f.isDownloaded !== undefined) return Boolean(f.isDownloaded);
      if (f.isCloud !== undefined) return !Boolean(f.isCloud);
      if (f.path)
        return !f.path.startsWith("cloud://") && !f.path.startsWith("http");
      return true;
    };

    expect(checkLocal(localFont)).toBe(true);
    expect(checkLocal(cloudFont)).toBe(false);
  });

  it("accurately evaluates font family local vs cloud availability state", () => {
    const localFamily: FontFamily = {
      family: "Amiri",
      count: 2,
      isLocal: true,
      fonts: [
        { id: "1", name: "Amiri Regular", family: "Amiri", isLocal: true },
        { id: "2", name: "Amiri Bold", family: "Amiri", isLocal: true },
      ],
    };

    const cloudFamily: FontFamily = {
      family: "Sultan Kufi",
      count: 1,
      isLocal: false,
      isDownloaded: false,
      fonts: [
        {
          id: "3",
          name: "Sultan Kufi Bold",
          family: "Sultan Kufi",
          isLocal: false,
          path: "cloud://kufi.ttf",
        },
      ],
    };

    const checkFamilyLocal = (fam: FontFamily): boolean => {
      if (fam.isLocal !== undefined) return Boolean(fam.isLocal);
      if (fam.isDownloaded !== undefined) return Boolean(fam.isDownloaded);
      if (fam.isCloud !== undefined) return !Boolean(fam.isCloud);
      if (fam.fonts && fam.fonts.length > 0) {
        return fam.fonts.some((f) =>
          f.isLocal !== undefined
            ? f.isLocal
            : f.isDownloaded !== undefined
              ? f.isDownloaded
              : !f.isCloud,
        );
      }
      return true;
    };

    expect(checkFamilyLocal(localFamily)).toBe(true);
    expect(checkFamilyLocal(cloudFamily)).toBe(false);
  });
});
