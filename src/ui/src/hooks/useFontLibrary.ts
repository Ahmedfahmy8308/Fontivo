import { useState, useEffect, useRef, useCallback } from "react";
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

export type SourceFilterType = "all" | "system" | "local" | "google" | "cloud";

export interface UseFontLibraryProps {
  activeTab: string;
  viewMode?: string;
  inspectedFamily: FontFamily | null;
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
}: {
  targetPage: number;
  pageSize?: number;
  searchQuery: string;
  filter: FontFilter;
  sortBy?: FontSortBy;
  scriptFilter?: ScriptFilterType | string;
  sourceFilter?: SourceFilterType | string;
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
    params.append("customOnly", "true");
    params.append("source", "local");
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

  // Independent source filter (system | local | google | cloud)
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

  // Filter, Script, Source, Search & Sort
  const [filter, setFilter] = useState<FontFilter>({
    type: "all",
    value: null,
  });
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

  // Build Query Params for API (including server-side sortBy, script, source)
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
      }),
    [searchQuery, filter, sortBy, scriptFilter, sourceFilter],
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
          const list: any[] = (familyMode ? data.families : data.fonts) || [];

          if (familyMode) {
            setFamilies(resetPage ? list : (prev) => [...prev, ...list]);
          } else {
            setFonts(resetPage ? list : (prev) => [...prev, ...list]);
          }
          setTotalCount(data.total ?? list.length);
        }
      } catch (e) {
        console.error("Failed to fetch data:", e);
      } finally {
        if (reqId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [buildQueryParams, familyMode],
  );

  useEffect(() => {
    fetchStats();
    fetchCollections();
  }, [fetchStats, fetchCollections]);

  useEffect(() => {
    if (isLibraryActiveTab(activeTab)) {
      fetchData(true);
    }
  }, [
    filter,
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
        fetchStats();
        fetchCollections();
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
            importedCount: newlyImported.length,
            duplicates: skippedDuplicates,
          },
        }),
      );
    }

    fetchStats();
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
