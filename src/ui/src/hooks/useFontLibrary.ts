import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  FontItem,
  FontFamily,
  FontStats,
  FontFilter,
  FontSortBy,
} from "../types/font";
import { safeFetch, safeFetchJson } from "../utils/safeFetch";
import { upsertLiveOperation } from "../utils/operationsBus";

const API_BASE = "/api";
export const LIBRARY_PAGE_SIZE = 50;
export const DEFAULT_VIEW_MODE = "families";

export type ScriptFilterType =
  | "all"
  | "arabic"
  | "latin"
  | "bilingual"
  | "tashkeel"
  | "variable"
  | "favorites"
  | "active";

export type SourceFilterType =
  | "all"
  | "system"
  | "local"
  | "local_all"
  | "google"
  | "cloud";

export type CustomBucketType =
  | "all"
  | "custom"
  | "imported"
  | "cloud"
  | "google";

export interface CustomFolderInfo {
  path: string;
  name: string;
  displayLabel: string;
  bucket: Exclude<CustomBucketType, "all">;
  total: number;
  active: number;
}

export interface CustomBucketCounts {
  all: number;
  custom: number;
  imported: number;
  cloud: number;
  google: number;
}

export interface UseFontLibraryProps {
  activeTab: string;
  viewMode?: string;
  inspectedFamily: FontFamily | null;
  isRtl?: boolean;
  initialFilter?: FontFilter;
}

export function normalizeFolderPath(p: string): string {
  return String(p || "")
    .replace(/\//g, "\\")
    .replace(/\\+$/, "")
    .trim()
    .toLowerCase();
}

export function isNonSystemOfflineFont(font: FontItem): boolean {
  const src = String((font as any).source || "").toLowerCase();
  const prov = String(font.provider || "").toLowerCase();
  const rawPath = String(font.path || "");
  const normPath = normalizeFolderPath(rawPath);

  if (
    src === "system" ||
    prov === "system" ||
    normPath.includes("\\windows\\fonts\\") ||
    normPath.endsWith("\\windows\\fonts") ||
    normPath.includes("\\microsoft\\windows\\fonts\\") ||
    normPath.endsWith("\\microsoft\\windows\\fonts")
  ) {
    return false;
  }

  if (
    rawPath.startsWith("cloud://") ||
    rawPath.startsWith("http://") ||
    rawPath.startsWith("https://")
  ) {
    return false;
  }

  if (
    src === "google" &&
    font.isLocal === false
  ) {
    return false;
  }

  if (
    !rawPath &&
    (font.isLocal === false ||
      font.isDownloaded === false ||
      font.isCloud === true)
  ) {
    return false;
  }

  return true;
}

export function classifyLocalBucket(
  font: FontItem,
): Exclude<CustomBucketType, "all"> | null {
  if (!isNonSystemOfflineFont(font)) return null;

  const src = String((font as any).source || "").toLowerCase();
  const prov = String(font.provider || "").toLowerCase();
  const subCat = String((font as any).subCategory || "").toLowerCase();
  const normPath = normalizeFolderPath(String(font.path || ""));

  // 1. Strict path-based bucket classification takes priority (matches Rust classify_font_bucket)
  if (
    normPath.includes("\\fonts\\imported\\") ||
    normPath.endsWith("\\fonts\\imported")
  ) {
    return "imported";
  }

  if (
    normPath.includes("\\fonts\\packs\\") ||
    normPath.endsWith("\\fonts\\packs") ||
    normPath.includes("\\extracted\\")
  ) {
    return "cloud";
  }

  if (
    normPath.includes("\\fonts\\google\\") ||
    normPath.endsWith("\\fonts\\google") ||
    normPath.includes("\\googlefonts\\") ||
    normPath.includes("\\google_fonts\\")
  ) {
    return "google";
  }

  if (
    normPath.includes("\\fonts\\custom\\") ||
    normPath.endsWith("\\fonts\\custom")
  ) {
    return "custom";
  }

  // 2. Source / subCategory fallback (imported checked before cloud & google)
  if (subCat.startsWith("imported")) {
    return "imported";
  }

  if (
    src === "cloud" ||
    subCat.includes("cloud pack") ||
    subCat.includes("fontivo essential")
  ) {
    return "cloud";
  }

  if (
    src === "google" ||
    prov === "google" ||
    subCat.includes("google")
  ) {
    return "google";
  }

  return "custom";
}

export function extractLocalFolderInfo(
  font: FontItem,
  isRtl: boolean = false,
): Omit<CustomFolderInfo, "total" | "active"> | null {
  const bucket = classifyLocalBucket(font);
  if (!bucket) return null;

  const rawPath = String(font.path || "").trim();
  if (!rawPath) return null;

  const normPath = rawPath.replace(/\//g, "\\");
  const lowPath = normPath.toLowerCase();

  const importedIdx = lowPath.indexOf("\\fonts\\imported\\");
  if (importedIdx >= 0) {
    const after = normPath.slice(importedIdx + "\\fonts\\imported\\".length);
    const seg = after.split("\\").find(Boolean) || "Imported";
    const dirPath =
      normPath.slice(0, importedIdx + "\\fonts\\imported\\".length) + seg;
    return {
      path: dirPath,
      name: seg,
      displayLabel: `Imported/${seg}`,
      bucket: "imported",
    };
  }

  const packsIdx = lowPath.indexOf("\\fonts\\packs\\");
  if (packsIdx >= 0) {
    const after = normPath.slice(packsIdx + "\\fonts\\packs\\".length);
    const seg = after.split("\\").find(Boolean) || "Packs";
    const dirPath =
      normPath.slice(0, packsIdx + "\\fonts\\packs\\".length) + seg;
    return {
      path: dirPath,
      name: seg,
      displayLabel: `Packs/${seg}`,
      bucket: "cloud",
    };
  }

  const extractedIdx = lowPath.indexOf("\\extracted\\");
  if (extractedIdx >= 0) {
    const after = normPath.slice(extractedIdx + "\\extracted\\".length);
    const seg = after.split("\\").find(Boolean) || "Packs";
    const dirPath =
      normPath.slice(0, extractedIdx + "\\extracted\\".length) + seg;
    return {
      path: dirPath,
      name: seg,
      displayLabel: `Packs/${seg}`,
      bucket: "cloud",
    };
  }

  const customIdx = lowPath.indexOf("\\fonts\\custom\\");
  if (customIdx >= 0) {
    const dirPath = normPath.slice(0, customIdx + "\\fonts\\custom".length);
    return {
      path: dirPath,
      name: isRtl ? "مرفوعة يدوياً" : "Custom",
      displayLabel: "Custom",
      bucket: "custom",
    };
  }

  const googleIdx = lowPath.indexOf("\\fonts\\google\\");
  if (googleIdx >= 0) {
    const dirPath = normPath.slice(0, googleIdx + "\\fonts\\google".length);
    return {
      path: dirPath,
      name: isRtl ? "Google محفوظة" : "Google Offline",
      displayLabel: "Google",
      bucket: "google",
    };
  }

  const lastSep = normPath.lastIndexOf("\\");
  if (lastSep <= 0) return null;
  const dirPath = normPath.slice(0, lastSep);
  const dirName = dirPath.slice(dirPath.lastIndexOf("\\") + 1) || dirPath;
  const displayPrefix =
    bucket === "imported"
      ? `Imported/${dirName}`
      : bucket === "cloud"
        ? `Packs/${dirName}`
        : bucket === "google"
          ? "Google"
          : dirName;
  return {
    path: dirPath,
    name: dirName,
    displayLabel: displayPrefix,
    bucket,
  };
}

export function matchesLocalFolder(
  font: FontItem,
  folderPath: string,
): boolean {
  const target = normalizeFolderPath(folderPath);
  if (!target) return true;
  const fp = normalizeFolderPath(String(font.path || ""));
  if (!fp) return false;
  return fp === target || fp.startsWith(`${target}\\`);
}

export function filterLocalFonts(
  fonts: FontItem[],
  options: {
    bucket?: CustomBucketType | string;
    folderPath?: string | null;
  } = {},
): FontItem[] {
  const bucket = (options.bucket || "all").toLowerCase();
  const folderPath = options.folderPath || null;

  return (fonts || []).filter((font) => {
    const detectedBucket = classifyLocalBucket(font);
    if (!detectedBucket) return false;
    if (bucket !== "all" && detectedBucket !== bucket) {
      return false;
    }
    if (folderPath && !matchesLocalFolder(font, folderPath)) {
      return false;
    }
    return true;
  });
}

export function filterLocalFamilies(
  families: FontFamily[],
  options: {
    bucket?: CustomBucketType | string;
    folderPath?: string | null;
  } = {},
): FontFamily[] {
  const bucket = (options.bucket || "all").toLowerCase();
  const folderPath = options.folderPath || null;

  return (families || [])
    .map((fam) => {
      if (Array.isArray(fam.fonts) && fam.fonts.length > 0) {
        const matched = filterLocalFonts(fam.fonts, { bucket, folderPath });
        if (matched.length === 0) return null;
        return {
          ...fam,
          count: matched.length,
          fonts: matched,
        };
      }
      const famAsFont: FontItem = {
        id: fam.family,
        name: fam.family,
        family: fam.family,
        source: fam.source,
        provider: fam.provider,
        category: fam.category,
        subCategory: (fam as any).subCategory,
        isLocal: fam.isLocal,
        isDownloaded: fam.isDownloaded,
        isCloud: fam.isCloud,
      };
      const detectedBucket = classifyLocalBucket(famAsFont);
      if (!detectedBucket) return null;
      if (bucket !== "all" && detectedBucket !== bucket) return null;
      if (folderPath) return null;
      return fam;
    })
    .filter((item): item is FontFamily => item !== null);
}

export function buildCustomFolderGroups(
  fonts: FontItem[],
  isRtl: boolean = false,
): CustomFolderInfo[] {
  const map = new Map<string, CustomFolderInfo>();
  for (const f of fonts || []) {
    const info = extractLocalFolderInfo(f, isRtl);
    if (!info) continue;
    const key = normalizeFolderPath(info.path);
    const existing = map.get(key) || {
      ...info,
      total: 0,
      active: 0,
    };
    existing.total += 1;
    if (f.isActive || (f as any).active) {
      existing.active += 1;
    }
    map.set(key, existing);
  }
  const bucketOrder: Record<Exclude<CustomBucketType, "all">, number> = {
    custom: 0,
    imported: 1,
    cloud: 2,
    google: 3,
  };
  return Array.from(map.values()).sort((a, b) => {
    const ordDiff = bucketOrder[a.bucket] - bucketOrder[b.bucket];
    if (ordDiff !== 0) return ordDiff;
    return b.total - a.total || a.displayLabel.localeCompare(b.displayLabel);
  });
}

export function computeLocalBucketCounts(
  fonts: FontItem[],
): CustomBucketCounts {
  const counts: CustomBucketCounts = {
    all: 0,
    custom: 0,
    imported: 0,
    cloud: 0,
    google: 0,
  };
  for (const f of fonts || []) {
    const bucket = classifyLocalBucket(f);
    if (!bucket) continue;
    counts.all += 1;
    counts[bucket] += 1;
  }
  return counts;
}

function extractBucketCount(val: any): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (val && typeof val === "object") {
    const n = Number(val.count ?? val.total ?? val.fontsCount ?? 0);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(val ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeCustomBucketsResponse(
  data: any,
  isRtl: boolean = false,
): { counts: CustomBucketCounts; folders: CustomFolderInfo[] } | null {
  if (!data || typeof data !== "object" || data.error || data.success === false) {
    return null;
  }

  const rawBuckets = data.buckets || data.counts || data;
  const custom = extractBucketCount(
    rawBuckets.custom ?? rawBuckets.customCount ?? rawBuckets.uploaded,
  );
  const imported = extractBucketCount(
    rawBuckets.imported ?? rawBuckets.importedCount,
  );
  const cloud = extractBucketCount(
    rawBuckets.cloud ??
      rawBuckets.cloudCount ??
      rawBuckets.packs ??
      rawBuckets.packsCount,
  );
  const google = extractBucketCount(
    rawBuckets.google ?? rawBuckets.googleCount ?? rawBuckets.googleOffline,
  );
  const rawAll = extractBucketCount(rawBuckets.all ?? rawBuckets.total);
  const all = rawAll > 0 ? rawAll : custom + imported + cloud + google;

  const rawFolders: any[] = Array.isArray(data.folders)
    ? data.folders
    : [
        ...(Array.isArray(rawBuckets.custom?.folders)
          ? rawBuckets.custom.folders.map((f: any) => ({ ...f, bucket: f.bucket || "custom" }))
          : []),
        ...(Array.isArray(rawBuckets.imported?.folders)
          ? rawBuckets.imported.folders.map((f: any) => ({ ...f, bucket: f.bucket || "imported" }))
          : []),
        ...(Array.isArray(rawBuckets.cloud?.folders)
          ? rawBuckets.cloud.folders.map((f: any) => ({ ...f, bucket: f.bucket || "cloud" }))
          : []),
        ...(Array.isArray(rawBuckets.google?.folders)
          ? rawBuckets.google.folders.map((f: any) => ({ ...f, bucket: f.bucket || "google" }))
          : []),
      ];
  const folders: CustomFolderInfo[] = rawFolders
    .map((item) => {
      const folderPath = String(item.path ?? item.folderPath ?? "").trim();
      if (!folderPath) return null;
      const rawBucket = String(item.bucket || "").toLowerCase();
      let bucket: Exclude<CustomBucketType, "all"> = "custom";
      if (
        rawBucket === "imported" ||
        rawBucket === "cloud" ||
        rawBucket === "google" ||
        rawBucket === "custom"
      ) {
        bucket = rawBucket;
      } else {
        const low = normalizeFolderPath(folderPath);
        if (low.includes("\\fonts\\imported")) bucket = "imported";
        else if (low.includes("\\fonts\\packs") || low.includes("\\extracted"))
          bucket = "cloud";
        else if (low.includes("\\fonts\\google")) bucket = "google";
      }

      const rawName = String(
        item.name ?? item.folderName ?? folderPath.split(/[/\\]/).pop() ?? "",
      ).trim();
      const displayLabel =
        String(item.displayLabel || item.relativePath || "").trim() ||
        (bucket === "imported"
          ? `Imported/${rawName}`
          : bucket === "cloud"
            ? `Packs/${rawName}`
            : bucket === "google"
              ? "Google"
              : rawName || (isRtl ? "مرفوعة يدوياً" : "Custom"));

      return {
        path: folderPath,
        name: rawName || displayLabel,
        displayLabel,
        bucket,
        total: Number(item.total ?? item.count ?? 0),
        active: Number(item.active ?? item.activeCount ?? 0),
      } satisfies CustomFolderInfo;
    })
    .filter((x): x is CustomFolderInfo => x !== null);

  if (all === 0 && folders.length === 0 && !data.buckets && !data.folders) {
    return null;
  }

  return {
    counts: { all, custom, imported, cloud, google },
    folders,
  };
}

/**
 * Returns true when the active tab displays the main font library grid/list.
 * Both `'library'` (default) and legacy `'organize'` tabs load & paginate fonts.
 */
export function isLibraryActiveTab(activeTab: string): boolean {
  return activeTab === "library" || activeTab === "organize";
}

/**
 * Returns true when the current view mode renders grouped font families.
 * Supports both `'families'` (primary default) and legacy `'family'`.
 */
export function isFamilyViewMode(viewMode?: string): boolean {
  return !viewMode || viewMode === "families" || viewMode === "family";
}

export function buildFontLibraryQueryParams({
  targetPage,
  pageSize = LIBRARY_PAGE_SIZE,
  searchQuery,
  filter,
  sortBy,
  scriptFilter,
  sourceFilter,
  customBucket,
  customFolderPath,
}: {
  targetPage: number;
  pageSize?: number;
  searchQuery: string;
  filter: FontFilter;
  sortBy?: FontSortBy;
  scriptFilter?: ScriptFilterType | string;
  sourceFilter?: SourceFilterType | string;
  customBucket?: CustomBucketType | string;
  customFolderPath?: string | null;
}): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(pageSize),
    offset: String(targetPage * pageSize),
  });

  if (sortBy) {
    params.append("sortBy", sortBy);
  }

  if (searchQuery.trim()) {
    params.append("search", searchQuery.trim());
  }

  // Primary filter (from Sidebar or unified filter state)
  if (filter.type === "active") {
    params.append("activeOnly", "true");
  } else if (filter.type === "inactive") {
    params.append("inactiveOnly", "true");
  } else if (filter.type === "recent") {
    params.append("recent", "true");
  } else if (filter.type === "favorites") {
    params.append("favoriteOnly", "true");
  } else if (filter.type === "google") {
    params.append("provider", "google");
    params.append("source", "google");
  } else if (filter.type === "custom" || filter.type === "local") {
    params.append("source", "local_all");
    if (customBucket && customBucket !== "all") {
      params.append("bucket", customBucket);
    }
    if (customFolderPath && customFolderPath.trim()) {
      params.append("folderPath", customFolderPath.trim());
    }
  } else if (filter.type === "system") {
    params.append("source", "system");
  } else if (filter.type === "cloud") {
    params.append("source", "cloud");
  } else if (filter.type === "arabic") {
    params.append("category", "Arabic");
    params.append("script", "arabic");
  } else if (filter.type === "english" || filter.type === "latin") {
    params.append("category", "English");
    params.append("script", "latin");
  } else if (filter.type === "bilingual") {
    params.append("script", "bilingual");
  } else if (filter.type === "tashkeel") {
    params.append("script", "tashkeel");
    params.append("hasTashkeel", "true");
  } else if (filter.type === "variable") {
    params.append("script", "variable");
    params.append("isVariable", "true");
  } else if (filter.type === "symbols") {
    params.append("category", "Symbols");
  } else if (filter.type === "collection" && filter.value) {
    params.append("collection", filter.value);
  }

  // Independent script filter (from Toolbar script pills)
  if (scriptFilter && scriptFilter !== "all") {
    if (scriptFilter === "favorites" && !params.has("favoriteOnly")) {
      params.append("favoriteOnly", "true");
    } else if (scriptFilter === "active" && !params.has("activeOnly")) {
      params.append("activeOnly", "true");
    } else if (
      scriptFilter !== "favorites" &&
      scriptFilter !== "active" &&
      !params.has("script")
    ) {
      params.append("script", scriptFilter);
      if (scriptFilter === "tashkeel" && !params.has("hasTashkeel")) {
        params.append("hasTashkeel", "true");
      }
      if (scriptFilter === "variable" && !params.has("isVariable")) {
        params.append("isVariable", "true");
      }
    }
  }

  // Independent source filter (system | local | local_all | google | cloud)
  if (sourceFilter && sourceFilter !== "all" && !params.has("source")) {
    params.append("source", sourceFilter);
    if (sourceFilter === "google" && !params.has("provider")) {
      params.append("provider", "google");
    } else if (sourceFilter === "local" && !params.has("customOnly")) {
      params.append("customOnly", "true");
    }
  }

  return params;
}

export function normalizeCollectionsResponse(
  data: any,
): Record<string, string[]> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  if (
    data.collections &&
    typeof data.collections === "object" &&
    !Array.isArray(data.collections)
  ) {
    return data.collections;
  }
  return data;
}

export function useFontLibrary({
  activeTab,
  viewMode = DEFAULT_VIEW_MODE,
  inspectedFamily,
  isRtl = false,
  initialFilter,
}: UseFontLibraryProps) {
  const [stats, setStats] = useState<FontStats>({
    total: 0,
    active: 0,
    favorites: 0,
    arabicCount: 0,
    englishCount: 0,
    symbolsCount: 0,
    familiesCount: 0,
    systemCount: 0,
    localCount: 0,
    googleCount: 0,
    cloudCount: 0,
  });

  const [fonts, setFonts] = useState<FontItem[]>([]);
  const [families, setFamilies] = useState<FontFamily[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [collections, setCollections] = useState<Record<string, string[]>>({});

  // Filter, Script, Source, Local Segmentation, Search & Sort
  const [filter, setFilterState] = useState<FontFilter>(
    initialFilter ?? {
      type: "all",
      value: null,
    },
  );
  const [customBucket, setCustomBucketState] =
    useState<CustomBucketType>("all");
  const [customFolderPath, setCustomFolderPath] = useState<string | null>(null);
  const [backendBuckets, setBackendBuckets] = useState<{
    counts: CustomBucketCounts;
    folders: CustomFolderInfo[];
  } | null>(null);

  const [scriptFilter, setScriptFilter] = useState<ScriptFilterType>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilterType>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<FontSortBy>("name-asc");
  const [showSortMenu, setShowSortMenu] = useState<boolean>(false);
  const sortRef = useRef<HTMLDivElement | null>(null);

  // Pagination & Infinite Scroll
  const [page, setPage] = useState<number>(0);
  const pageRef = useRef<number>(0);
  const requestIdRef = useRef<number>(0);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  const familyMode = isFamilyViewMode(viewMode);

  const setFilter = useCallback((nextFilter: FontFilter) => {
    setFilterState(nextFilter);
    if (nextFilter.type !== "custom" && nextFilter.type !== "local") {
      setCustomBucketState("all");
      setCustomFolderPath(null);
    }
  }, []);

  // Close sort menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    }
    if (showSortMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSortMenu]);

  // Fetch Stats & Collections with safe timeouts
  const fetchStats = useCallback(async () => {
    const data = await safeFetchJson<FontStats>(`${API_BASE}/stats`, {
      timeoutMs: 6000,
    });
    if (data && typeof data === "object") {
      setStats((prev) => ({ ...prev, ...data }));
    }
  }, []);

  const fetchCollections = useCallback(async () => {
    const data = await safeFetchJson<any>(`${API_BASE}/collections`, {
      timeoutMs: 6000,
    });
    if (data) {
      setCollections(normalizeCollectionsResponse(data));
    }
  }, []);

  const fetchCustomBuckets = useCallback(async () => {
    try {
      const bucketRes = await safeFetch(`${API_BASE}/fonts/custom-buckets`, {
        timeoutMs: 6000,
        cache: "no-store",
      });
      if (bucketRes && bucketRes.ok) {
        const json = await bucketRes.json().catch(() => null);
        const normalized = normalizeCustomBucketsResponse(json, isRtl);
        if (normalized && (normalized.folders.length > 0 || normalized.counts.all === 0)) {
          setBackendBuckets(normalized);
          return;
        }
      }

      const fallbackRes = await safeFetch(
        `${API_BASE}/fonts?source=local_all&limit=1000`,
        {
          timeoutMs: 7000,
          cache: "no-store",
        },
      );
      if (fallbackRes && fallbackRes.ok) {
        const json = await fallbackRes.json().catch(() => null);
        if (json && Array.isArray(json.fonts)) {
          const localOnly = filterLocalFonts(json.fonts);
          setBackendBuckets({
            counts: computeLocalBucketCounts(localOnly),
            folders: buildCustomFolderGroups(localOnly, isRtl),
          });
        }
      }
    } catch {
      // ignore offline or unmocked environments
    }
  }, [isRtl]);

  // Build Query Params for API (including server-side sortBy, script, source, custom bucket & folder)
  const buildQueryParams = useCallback(
    (targetPage: number) =>
      buildFontLibraryQueryParams({
        targetPage,
        pageSize: LIBRARY_PAGE_SIZE,
        searchQuery,
        filter,
        sortBy,
        scriptFilter,
        sourceFilter,
        customBucket,
        customFolderPath,
      }),
    [
      searchQuery,
      filter,
      sortBy,
      scriptFilter,
      sourceFilter,
      customBucket,
      customFolderPath,
    ],
  );

  // Fetch Items (server-side sorting & pagination with timeout protection)
  const fetchData = useCallback(
    async (resetPage: boolean = false, overridePage?: number) => {
      const reqId = ++requestIdRef.current;
      setLoading(true);
      const currentPage = resetPage ? 0 : (overridePage ?? pageRef.current);
      pageRef.current = currentPage;
      setPage(currentPage);

      const params = buildQueryParams(currentPage);
      const endpoint = familyMode
        ? `${API_BASE}/families`
        : `${API_BASE}/fonts`;

      try {
        const data = await safeFetchJson<any>(
          `${endpoint}?${params.toString()}`,
          { timeoutMs: 7000 },
        );
        if (reqId !== requestIdRef.current) return;

        if (data) {
          const rawList: any[] =
            (familyMode ? data.families : data.fonts) || [];
          const isLocalCustomView =
            filter.type === "custom" || filter.type === "local";

          const list: any[] = isLocalCustomView
            ? familyMode
              ? filterLocalFamilies(rawList, {
                  bucket: customBucket,
                  folderPath: customFolderPath,
                })
              : filterLocalFonts(rawList, {
                  bucket: customBucket,
                  folderPath: customFolderPath,
                })
            : rawList;

          if (familyMode) {
            setFamilies(resetPage ? list : (prev) => [...prev, ...list]);
          } else {
            setFonts(resetPage ? list : (prev) => [...prev, ...list]);
          }
          const fellBackClientSide =
            isLocalCustomView && list.length !== rawList.length;
          setTotalCount(
            fellBackClientSide && resetPage
              ? list.length
              : (data.total ?? list.length),
          );
        }
      } catch (e) {
        console.error("Failed to fetch data:", e);
      } finally {
        if (reqId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [
      buildQueryParams,
      familyMode,
      filter.type,
      customBucket,
      customFolderPath,
    ],
  );

  useEffect(() => {
    fetchStats();
    fetchCollections();
  }, [fetchStats, fetchCollections]);

  useEffect(() => {
    if (
      isLibraryActiveTab(activeTab) &&
      (filter.type === "custom" || filter.type === "local")
    ) {
      fetchCustomBuckets();
    }
  }, [activeTab, filter.type, fetchCustomBuckets]);

  useEffect(() => {
    if (isLibraryActiveTab(activeTab)) {
      fetchData(true);
    }
  }, [
    filter,
    customBucket,
    customFolderPath,
    scriptFilter,
    sourceFilter,
    searchQuery,
    familyMode,
    activeTab,
    sortBy,
    fetchData,
  ]);

  const loadMore = useCallback(() => {
    if (loading || !isLibraryActiveTab(activeTab) || inspectedFamily) return;
    const currentListLength = familyMode ? families.length : fonts.length;
    if (currentListLength >= totalCount) return;

    const nextPage = pageRef.current + 1;
    fetchData(false, nextPage);
  }, [
    loading,
    activeTab,
    inspectedFamily,
    familyMode,
    families.length,
    fonts.length,
    totalCount,
    fetchData,
  ]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 },
    );

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }

    return () => observer.disconnect();
  }, [loadMore]);

  const handlePickFolder = async () => {
    const opId = `import-folder-${Date.now()}`;
    upsertLiveOperation({
      id: opId,
      title: "Importing Custom Font Folder",
      titleAr: "استيراد مجلد خطوط خاصة",
      category: "custom-import",
      status: "running",
      progressPercent: 25,
      stepLabel: "Selecting & indexing font files...",
      stepLabelAr: "جاري اختيار وفهرسة ملفات الخطوط (.TTF / .OTF / .TTC)...",
    });

    try {
      const data = await safeFetchJson<any>(`${API_BASE}/dialog/pick-folder`, {
        method: "POST",
        timeoutMs: 30000,
      });
      if (data && data.success) {
        const dupCount = Number(data.skippedDuplicatesCount || 0);
        const dupSample =
          Array.isArray(data.duplicates) && data.duplicates[0]
            ? ` (${data.duplicates[0].fileName} -> ${data.duplicates[0].existingPath})`
            : "";
        upsertLiveOperation({
          id: opId,
          status: "completed",
          progressPercent: 100,
          itemsDone: data.importedCount || data.count || 0,
          itemsTotal: (data.importedCount || 0) + dupCount || 1,
          stepLabel:
            dupCount > 0
              ? `Imported ${data.importedCount || 0} fonts; skipped ${dupCount} duplicates${dupSample}`
              : `Imported ${data.importedCount || 0} fonts into library!`,
          stepLabelAr:
            dupCount > 0
              ? `تم استيراد ${data.importedCount || 0} خطاً وتجاهل ${dupCount} خطوط مكررة موجودة مسبقاً${dupSample}`
              : `تم استيراد وفهرسة ${data.importedCount || 0} خطاً بنجاح!`,
        });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("fontivo:import-result", {
              detail: {
                kind: "folder",
                folderName: data.folderName || "",
                managedPath: data.managedPath || "",
                importedCount: Number(data.importedCount || 0),
                skippedDuplicatesCount: dupCount,
                skippedInvalidCount: Number(data.skippedInvalidCount || 0),
                duplicates: Array.isArray(data.duplicates) ? data.duplicates : [],
              },
            }),
          );
        }
        fetchStats();
        fetchCollections();
        fetchCustomBuckets();
        fetchData(true);
      } else {
        upsertLiveOperation({
          id: opId,
          status: "completed",
          progressPercent: 100,
          stepLabel: "Folder picker closed",
          stepLabelAr: "تم إغلاق نافذة اختيار المجلد",
        });
      }
    } catch (e) {
      console.error("Pick folder failed:", e);
    }
  };

  const handleImportFontFiles = async (fileList?: FileList | File[] | null) => {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) {
      return handlePickFolder();
    }

    const opId = `import-files-${Date.now()}`;
    upsertLiveOperation({
      id: opId,
      title: `Importing ${files.length} Custom Fonts`,
      titleAr: `استيراد ${files.length} خطوط خاصة`,
      category: "custom-import",
      status: "running",
      progressPercent: 15,
      itemsDone: 0,
      itemsTotal: files.length,
      stepLabel: `Reading ${files[0].name}...`,
      stepLabelAr: `جاري قراءة وفهرسة ${files[0].name}...`,
    });

    const newlyImported: FontItem[] = [];
    const skippedDuplicates: Array<{
      fileName: string;
      existingPath: string;
      existingSource: string;
    }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      upsertLiveOperation({
        id: opId,
        progressPercent: Math.round(((i + 0.5) / files.length) * 100),
        itemsDone: i,
        itemsTotal: files.length,
        stepLabel: `Importing ${file.name}...`,
        stepLabelAr: `جاري استيراد ${file.name}...`,
      });

      const res = await safeFetch(
        `${API_BASE}/fonts/import-file?fileName=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          body: file,
          timeoutMs: 12000,
        },
      );

      if (res && res.ok) {
        try {
          const d = await res.json();
          if (d?.duplicate && d.duplicateInfo) {
            skippedDuplicates.push({
              fileName: d.duplicateInfo.fileName || file.name,
              existingPath: d.duplicateInfo.existingPath || "",
              existingSource: d.duplicateInfo.existingSource || "local",
            });
            continue;
          }
          if (d?.success && d.font) {
            newlyImported.push(d.font);
            continue;
          }
        } catch {
          // ignore parse error
        }
      }
    }

    if (newlyImported.length > 0) {
      setFonts((prev) => [...newlyImported, ...prev]);
      setFamilies((prev) => {
        const next = [...prev];
        for (const f of newlyImported) {
          const existingIdx = next.findIndex((fam) => fam.family === f.family);
          if (existingIdx >= 0) {
            next[existingIdx] = {
              ...next[existingIdx],
              count: next[existingIdx].count + 1,
              fonts: [f, ...next[existingIdx].fonts],
              isLocal: true,
            };
          } else {
            next.unshift({
              family: f.family,
              count: 1,
              fonts: [f],
              isActive: Boolean(f.isActive),
              isAllActive: Boolean(f.isActive),
              isFavorite: Boolean(f.isFavorite),
              isLocal: true,
              provider: "local",
            });
          }
        }
        return next;
      });
    }

    const firstDup = skippedDuplicates[0];
    upsertLiveOperation({
      id: opId,
      status: "completed",
      progressPercent: 100,
      itemsDone: newlyImported.length,
      itemsTotal: files.length,
      stepLabel:
        skippedDuplicates.length > 0
          ? `Imported ${newlyImported.length}; skipped ${skippedDuplicates.length} duplicates (${firstDup.fileName} already at ${firstDup.existingPath})`
          : `Imported ${newlyImported.length} custom fonts`,
      stepLabelAr:
        skippedDuplicates.length > 0
          ? `تم استيراد ${newlyImported.length} وتجاهل ${skippedDuplicates.length} مكرر (${firstDup.fileName} موجود مسبقاً في: ${firstDup.existingPath})`
          : `تم استيراد ${newlyImported.length} خطوط خاصة بنجاح!`,
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("fontivo:import-result", {
          detail: {
            kind: "files",
            importedCount: newlyImported.length,
            skippedDuplicatesCount: skippedDuplicates.length,
            skippedInvalidCount:
              files.length - newlyImported.length - skippedDuplicates.length,
            duplicates: skippedDuplicates,
          },
        }),
      );
    }

    fetchStats();
    fetchCustomBuckets();
    if (filter.type === "custom" || filter.type === "local") {
      fetchData(true);
    }
  };

  const handleCreateCollection = async (name: string) => {
    setCollections((prev) => ({ ...prev, [name]: prev[name] || [] }));
    const data = await safeFetchJson<any>(`${API_BASE}/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      timeoutMs: 5000,
    });
    if (data && data.success) {
      fetchCollections();
      fetchStats();
    }
  };

  const handleAddFontToCollection = async (
    collectionName: string,
    fontId: string | number,
  ) => {
    const idStr = String(fontId);
    setCollections((prev) => {
      const existing = prev[collectionName] || [];
      if (existing.includes(idStr)) return prev;
      return {
        ...prev,
        [collectionName]: [...existing, idStr],
      };
    });

    await safeFetchJson<any>(`${API_BASE}/collections/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: collectionName,
        collection: collectionName,
        fontId,
        id: fontId,
      }),
      timeoutMs: 5000,
    });
  };

  const handleDeleteCollection = async (name: string) => {
    const data = await safeFetchJson<any>(`${API_BASE}/collections`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      timeoutMs: 5000,
    });
    if (data && data.success) {
      fetchCollections();
      fetchStats();
      if (filter.type === "collection" && filter.value === name) {
        setFilter({ type: "all", value: null });
      }
    } else {
      setCollections((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const derivedLocalFonts = useMemo(() => {
    const seen = new Set<string>();
    const combined: FontItem[] = [];
    const pushFont = (f: FontItem) => {
      if (!isNonSystemOfflineFont(f)) return;
      const key = `${String(f.id ?? "")}::${normalizeFolderPath(String(f.path || ""))}`;
      if (seen.has(key)) return;
      seen.add(key);
      combined.push(f);
    };
    for (const f of fonts || []) pushFont(f);
    for (const fam of families || []) {
      for (const f of fam.fonts || []) pushFont(f);
    }
    return combined;
  }, [fonts, families]);

  const customFolders = useMemo<CustomFolderInfo[]>(() => {
    if (backendBuckets && backendBuckets.folders.length > 0) {
      return backendBuckets.folders;
    }
    return buildCustomFolderGroups(derivedLocalFonts, isRtl);
  }, [backendBuckets, derivedLocalFonts, isRtl]);

  const customBucketCounts = useMemo<CustomBucketCounts>(() => {
    if (backendBuckets) {
      const b = backendBuckets.counts;
      if (b.all > 0 || (stats.localCount === 0 && stats.cloudCount === 0 && stats.googleCount === 0)) {
        return b;
      }
    }
    const statsBuckets = (stats as any).customBuckets;
    if (statsBuckets && typeof statsBuckets === "object") {
      const c = extractBucketCount(statsBuckets.custom);
      const i = extractBucketCount(statsBuckets.imported);
      const cl = extractBucketCount(statsBuckets.cloud);
      const g = extractBucketCount(statsBuckets.google);
      const a = extractBucketCount(statsBuckets.all) || c + i + cl + g;
      if (a > 0) {
        return { all: a, custom: c, imported: i, cloud: cl, google: g };
      }
    }
    if (derivedLocalFonts.length > 0 && !customFolderPath && customBucket === "all") {
      const derived = computeLocalBucketCounts(derivedLocalFonts);
      if (derived.all > 0) return derived;
    }
    const localCount = Number((stats as any).localCount ?? 0);
    const cloudCount = Number((stats as any).cloudCount ?? 0);
    const googleCount = Number(
      (stats as any).downloadedGoogleCount ?? (stats as any).googleCount ?? 0,
    );
    return {
      all: localCount + cloudCount + googleCount,
      custom: localCount,
      imported: 0,
      cloud: cloudCount,
      google: googleCount,
    };
  }, [backendBuckets, derivedLocalFonts, customFolderPath, customBucket, stats]);

  const setCustomBucket = useCallback(
    (nextBucket: CustomBucketType) => {
      setCustomBucketState(nextBucket);
      if (nextBucket !== "all" && customFolderPath) {
        const selected = customFolders.find(
          (f) =>
            normalizeFolderPath(f.path) ===
            normalizeFolderPath(customFolderPath),
        );
        if (!selected || selected.bucket !== nextBucket) {
          setCustomFolderPath(null);
        }
      }
    },
    [customFolderPath, customFolders],
  );

  const handleDeleteFontFolder = useCallback(
    async (
      folderPath: string,
    ): Promise<{ success: boolean; removedCount: number; error?: string }> => {
      try {
        const res = await safeFetch(`${API_BASE}/fonts/delete-folder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderPath }),
          timeoutMs: 12000,
        });
        if (!res) {
          return {
            success: false,
            removedCount: 0,
            error: isRtl
              ? "تعذر الاتصال بالخادم لحذف المجلد."
              : "Could not reach server to delete folder.",
          };
        }
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.success === false) {
          return {
            success: false,
            removedCount: 0,
            error:
              data?.error ||
              (isRtl ? "تعذر حذف هذا المجلد." : "Failed to delete folder."),
          };
        }

        const removedCount = Number(
          data.removedCount ?? data.deletedCount ?? 0,
        );
        if (
          customFolderPath &&
          normalizeFolderPath(customFolderPath) ===
            normalizeFolderPath(folderPath)
        ) {
          setCustomFolderPath(null);
        }
        setFonts((prev) =>
          prev.filter((f) => !matchesLocalFolder(f, folderPath)),
        );
        setFamilies((prev) =>
          prev
            .map((fam) => {
              const remaining = (fam.fonts || []).filter(
                (f) => !matchesLocalFolder(f, folderPath),
              );
              if (remaining.length === 0 && (fam.fonts || []).length > 0) {
                return null;
              }
              return { ...fam, count: remaining.length, fonts: remaining };
            })
            .filter((x): x is FontFamily => x !== null),
        );

        await Promise.all([
          fetchStats(),
          fetchCollections(),
          fetchCustomBuckets(),
          fetchData(true),
        ]);

        return { success: true, removedCount };
      } catch (err: any) {
        return {
          success: false,
          removedCount: 0,
          error:
            err?.message ||
            (isRtl ? "حدث خطأ أثناء حذف المجلد." : "Error deleting folder."),
        };
      }
    },
    [
      customFolderPath,
      fetchCollections,
      fetchCustomBuckets,
      fetchData,
      fetchStats,
      isRtl,
    ],
  );

  return {
    stats,
    setStats,
    fetchStats,
    fonts,
    setFonts,
    families,
    setFamilies,
    totalCount,
    loading,
    page,
    collections,
    fetchCollections,
    filter,
    setFilter,
    customBucket,
    setCustomBucket,
    customFolderPath,
    setCustomFolderPath,
    customFolders,
    customBucketCounts,
    fetchCustomBuckets,
    handleDeleteFontFolder,
    scriptFilter,
    setScriptFilter,
    sourceFilter,
    setSourceFilter,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    showSortMenu,
    setShowSortMenu,
    sortRef,
    fetchData,
    loadMore,
    loadMoreTriggerRef,
    handlePickFolder,
    handleImportFontFiles,
    handleCreateCollection,
    handleAddFontToCollection,
    handleDeleteCollection,
  };
}
