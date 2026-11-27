/// <reference types="node" />
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "./setup";
import App from "../src/App";
import {
  buildFontLibraryQueryParams,
  isNonSystemOfflineFont,
  classifyLocalBucket,
  extractLocalFolderInfo,
  filterLocalFonts,
  filterLocalFamilies,
  buildCustomFolderGroups,
  computeLocalBucketCounts,
  normalizeCustomBucketsResponse,
} from "../src/hooks/useFontLibrary";
import { FontItem, FontFamily } from "../src/types/font";

describe("Segmented Local & Custom Fonts Organization & Filtering", () => {
  const sampleFonts: FontItem[] = [
    {
      id: 1,
      name: "Cairo-Bold.ttf",
      family: "Cairo",
      source: "local",
      path: "C:\\Users\\Me\\AppData\\Local\\Fontivo\\Fonts\\Custom\\Cairo\\Cairo-Bold.ttf",
      isActive: true,
      isLocal: true,
    },
    {
      id: 2,
      name: "BrandDisplay.otf",
      family: "BrandDisplay",
      source: "local",
      subCategory: "Imported · ClientAlpha",
      path: "C:\\Users\\Me\\AppData\\Local\\Fontivo\\Fonts\\Imported\\ClientAlpha\\BrandDisplay\\BrandDisplay.otf",
      isActive: false,
      isLocal: true,
    },
    {
      id: 3,
      name: "AgencySans.ttf",
      family: "AgencySans",
      source: "local",
      subCategory: "Imported · ClientBeta",
      path: "C:/Users/Me/AppData/Local/Fontivo/Fonts/Imported/ClientBeta/AgencySans/AgencySans.ttf",
      isActive: true,
      isLocal: true,
    },
    {
      id: 4,
      name: "Amiri-Regular.ttf",
      family: "Amiri",
      source: "cloud",
      subCategory: "Fontivo Cloud Pack",
      path: "C:\\Users\\Me\\AppData\\Local\\Fontivo\\Fonts\\Packs\\Arabic-Classics\\Amiri\\Amiri-Regular.ttf",
      isActive: false,
      isLocal: true,
    },
    {
      id: 5,
      name: "Inter-Regular.ttf",
      family: "Inter",
      source: "google",
      subCategory: "Google Fonts",
      path: "C:\\Users\\Me\\AppData\\Local\\Fontivo\\Fonts\\Google\\Inter\\Inter-Regular.ttf",
      isActive: true,
      isLocal: true,
    },
    {
      id: 6,
      name: "arial.ttf",
      family: "Arial",
      source: "system",
      path: "C:\\Windows\\Fonts\\arial.ttf",
      isActive: false,
      isLocal: true,
    },
    {
      id: 7,
      name: "RemoteOnly.ttf",
      family: "RemoteOnly",
      source: "cloud",
      path: "cloud://packs/RemoteOnly.ttf",
      isActive: false,
      isLocal: false,
    },
  ];

  it("builds /api/fonts query params with source=local_all, optional bucket, and optional folderPath", () => {
    const baseParams = buildFontLibraryQueryParams({
      targetPage: 0,
      searchQuery: "",
      filter: { type: "custom", value: null },
      customBucket: "all",
      customFolderPath: null,
    });
    expect(baseParams.get("source")).toBe("local_all");
    expect(baseParams.has("bucket")).toBe(false);
    expect(baseParams.has("folderPath")).toBe(false);

    const bucketParams = buildFontLibraryQueryParams({
      targetPage: 0,
      searchQuery: "Brand",
      filter: { type: "custom", value: null },
      customBucket: "imported",
      customFolderPath:
        "C:\\Users\\Me\\AppData\\Local\\Fontivo\\Fonts\\Imported\\ClientAlpha",
    });
    expect(bucketParams.get("source")).toBe("local_all");
    expect(bucketParams.get("bucket")).toBe("imported");
    expect(bucketParams.get("folderPath")).toBe(
      "C:\\Users\\Me\\AppData\\Local\\Fontivo\\Fonts\\Imported\\ClientAlpha",
    );
    expect(bucketParams.get("search")).toBe("Brand");
  });

  it("classifies offline non-system fonts into custom, imported, cloud, and google buckets while excluding system and cloud://", () => {
    expect(isNonSystemOfflineFont(sampleFonts[0])).toBe(true);
    expect(isNonSystemOfflineFont(sampleFonts[5])).toBe(false);
    expect(isNonSystemOfflineFont(sampleFonts[6])).toBe(false);

    expect(classifyLocalBucket(sampleFonts[0])).toBe("custom");
    expect(classifyLocalBucket(sampleFonts[1])).toBe("imported");
    expect(classifyLocalBucket(sampleFonts[2])).toBe("imported");
    expect(classifyLocalBucket(sampleFonts[3])).toBe("cloud");
    expect(classifyLocalBucket(sampleFonts[4])).toBe("google");
    expect(classifyLocalBucket(sampleFonts[5])).toBeNull();
    expect(classifyLocalBucket(sampleFonts[6])).toBeNull();

    // Imported folders named after Google or Cloud Pack must classify as "imported" (matching Rust state.rs)
    const importedGoogleNamed: FontItem = {
      id: 99,
      name: "BackupDisplay.ttf",
      family: "BackupDisplay",
      source: "local",
      subCategory: "Imported · Google-Backup",
      path: "C:\\Users\\Me\\AppData\\Local\\Fontivo\\Fonts\\Imported\\Google-Backup\\BackupDisplay.ttf",
      isLocal: true,
    };
    const importedCloudNamed: FontItem = {
      id: 100,
      name: "PackSample.otf",
      family: "PackSample",
      source: "local",
      subCategory: "Imported · Cloud Pack Archive",
      path: "D:\\Custom\\PackSample.otf",
      isLocal: true,
    };
    expect(classifyLocalBucket(importedGoogleNamed)).toBe("imported");
    expect(classifyLocalBucket(importedCloudNamed)).toBe("imported");
  });

  it("computes bucket counts and grouped folder chips (Custom, Imported/<Name>, Packs/<Name>, Google)", () => {
    const counts = computeLocalBucketCounts(sampleFonts);
    expect(counts).toEqual({
      all: 5,
      custom: 1,
      imported: 2,
      cloud: 1,
      google: 1,
    });

    const folders = buildCustomFolderGroups(sampleFonts, false);
    expect(folders.map((f) => f.displayLabel)).toEqual([
      "Custom",
      "Imported/ClientAlpha",
      "Imported/ClientBeta",
      "Packs/Arabic-Classics",
      "Google",
    ]);

    const importedAlpha = extractLocalFolderInfo(sampleFonts[1], false);
    expect(importedAlpha?.path).toBe(
      "C:\\Users\\Me\\AppData\\Local\\Fontivo\\Fonts\\Imported\\ClientAlpha",
    );
    expect(importedAlpha?.bucket).toBe("imported");
  });

  it("filters fonts and families client-side by custom bucket and folderPath case-insensitively", () => {
    expect(filterLocalFonts(sampleFonts, { bucket: "all" }).map((f) => f.id)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(filterLocalFonts(sampleFonts, { bucket: "imported" }).map((f) => f.id)).toEqual([
      2, 3,
    ]);
    expect(filterLocalFonts(sampleFonts, { bucket: "cloud" }).map((f) => f.id)).toEqual([
      4,
    ]);
    expect(filterLocalFonts(sampleFonts, { bucket: "google" }).map((f) => f.id)).toEqual([
      5,
    ]);
    expect(
      filterLocalFonts(sampleFonts, {
        bucket: "all",
        folderPath:
          "c:/users/me/appdata/local/fontivo/fonts/imported/clientbeta/",
      }).map((f) => f.id),
    ).toEqual([3]);

    const families: FontFamily[] = [
      {
        family: "MixedFamily",
        count: 2,
        fonts: [sampleFonts[1], sampleFonts[5]],
      },
      {
        family: "SystemOnly",
        count: 1,
        fonts: [sampleFonts[5]],
      },
      {
        family: "GoogleOffline",
        count: 1,
        fonts: [sampleFonts[4]],
      },
    ];
    const filteredFamilies = filterLocalFamilies(families, { bucket: "all" });
    expect(filteredFamilies.map((f) => f.family)).toEqual([
      "MixedFamily",
      "GoogleOffline",
    ]);
    expect(filteredFamilies[0].count).toBe(1);
  });

  it("normalizes /api/fonts/custom-buckets payloads cleanly", () => {
    const normalized = normalizeCustomBucketsResponse({
      buckets: {
        all: 14,
        custom: 3,
        imported: 5,
        cloud: 4,
        google: 2,
      },
      folders: [
        {
          folderPath: "C:\\Fontivo\\Fonts\\Imported\\Studio2026",
          folderName: "Studio2026",
          bucket: "imported",
          count: 5,
          activeCount: 2,
        },
      ],
    });

    expect(normalized?.counts).toEqual({
      all: 14,
      custom: 3,
      imported: 5,
      cloud: 4,
      google: 2,
    });
    expect(normalized?.folders[0]).toMatchObject({
      path: "C:\\Fontivo\\Fonts\\Imported\\Studio2026",
      displayLabel: "Imported/Studio2026",
      bucket: "imported",
      total: 5,
      active: 2,
    });

    const nested = normalizeCustomBucketsResponse({
      total: 8,
      buckets: {
        custom: { count: 2, folders: [{ path: "C:\\Fontivo\\Fonts\\Custom", name: "Custom", total: 2, active: 1 }] },
        imported: { count: 4, folders: [{ path: "C:\\Fontivo\\Fonts\\Imported\\Agency", name: "Agency", total: 4, active: 2 }] },
        cloud: { count: 2 },
        google: { count: 0 },
      },
    });
    expect(nested?.counts).toEqual({
      all: 8,
      custom: 2,
      imported: 4,
      cloud: 2,
      google: 0,
    });
    expect(nested?.folders.map((f) => f.displayLabel)).toEqual([
      "Custom",
      "Imported/Agency",
    ]);
  });

  it("wires segmented bucket tabs, folder deletion endpoint, and zero emojis across edited files", () => {
    const appSource = fs.readFileSync(
      fileURLToPath(new URL("../src/App.tsx", import.meta.url)),
      "utf-8",
    );
    const hookSource = fs.readFileSync(
      fileURLToPath(new URL("../src/hooks/useFontLibrary.ts", import.meta.url)),
      "utf-8",
    );
    const updaterSource = fs.readFileSync(
      fileURLToPath(
        new URL("../src/components/modals/UpdaterModal.tsx", import.meta.url),
      ),
      "utf-8",
    );
    const sidebarSource = fs.readFileSync(
      fileURLToPath(
        new URL("../src/components/layout/Sidebar.tsx", import.meta.url),
      ),
      "utf-8",
    );

    expect(appSource).toContain("الكل (المحلية والسحابية)");
    expect(appSource).toContain("مرفوعة يدوياً (Custom)");
    expect(appSource).toContain("مجلدات مستوردة (Imported)");
    expect(appSource).toContain("حزم السحاب (Cloud Packs)");
    expect(appSource).toContain("Google محفوظة (Google Offline)");
    expect(hookSource).toContain("/fonts/delete-folder");

    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const src of [appSource, hookSource, updaterSource, sidebarSource]) {
      expect(emojiRegex.test(src)).toBe(false);
    }

    const customViewHtml = renderToString(
      React.createElement(App, {
        initialTab: "library",
        initialShowSplash: false,
        initialFilter: { type: "custom", value: null },
      }),
    );
    expect(customViewHtml).toContain('data-testid="local-segmented-panel"');
    expect(customViewHtml).toContain('data-testid="local-bucket-tab-all"');
    expect(customViewHtml).toContain('data-testid="local-bucket-tab-custom"');
    expect(customViewHtml).toContain('data-testid="local-bucket-tab-imported"');
    expect(customViewHtml).toContain('data-testid="local-bucket-tab-cloud"');
    expect(customViewHtml).toContain('data-testid="local-bucket-tab-google"');
    expect(customViewHtml).toContain("الكل (المحلية والسحابية)");
    expect(appSource).toContain('data-testid="local-folder-selector"');
    expect(appSource).not.toContain('data-testid="local-folder-chips"');
  });
});
