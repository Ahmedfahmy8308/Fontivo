import { FontItem, FontFamily } from "../types/font";

export interface FontFilterOptions {
  search?: string;
  filterType?: string;
  filterValue?: string | null;
  collectionIds?: (string | number)[];
}

/**
 * Filters a list of font items based on criteria (search query, category, status, collections).
 */
export function filterFonts(
  fonts: FontItem[],
  options: FontFilterOptions = {},
): FontItem[] {
  const {
    search = "",
    filterType = "all",
    filterValue = null,
    collectionIds = [],
  } = options;
  const normalizedSearch = search.trim().toLowerCase();

  return fonts.filter((font) => {
    // 1. Search Query
    if (normalizedSearch) {
      const matchName = (font.name || "")
        .toLowerCase()
        .includes(normalizedSearch);
      const matchFamily = (font.family || "")
        .toLowerCase()
        .includes(normalizedSearch);
      const matchCategory = (font.category || "")
        .toLowerCase()
        .includes(normalizedSearch);
      if (!matchName && !matchFamily && !matchCategory) {
        return false;
      }
    }

    // 2. Filter Type
    switch (filterType) {
      case "active":
        return !!font.isActive;
      case "inactive":
        return !font.isActive;
      case "favorites":
        return !!font.isFavorite;
      case "google":
        return (
          (font.provider || "").toLowerCase() === "google" ||
          (font.category || "").toLowerCase() === "google"
        );
      case "arabic":
        return (font.category || "").toLowerCase() === "arabic";
      case "english":
        return (font.category || "").toLowerCase() === "english";
      case "symbols":
        return (font.category || "").toLowerCase() === "symbols";
      case "collection":
        if (filterValue && collectionIds.length > 0) {
          return collectionIds.includes(font.id);
        }
        return true;
      case "all":
      default:
        return true;
    }
  });
}

/**
 * Sorts fonts by name or styles.
 */
export function sortFonts(
  fonts: FontItem[],
  sortBy: string = "name-asc",
): FontItem[] {
  const list = [...fonts];
  if (sortBy === "name-asc") {
    list.sort((a, b) =>
      (a.family || a.name || "").localeCompare(b.family || b.name || ""),
    );
  } else if (sortBy === "name-desc") {
    list.sort((a, b) =>
      (b.family || b.name || "").localeCompare(a.family || a.name || ""),
    );
  }
  return list;
}

/**
 * Sorts font families by name or style count.
 */
export function sortFamilies(
  families: FontFamily[],
  sortBy: string = "name-asc",
): FontFamily[] {
  const list = [...families];
  if (sortBy === "name-asc") {
    list.sort((a, b) => (a.family || "").localeCompare(b.family || ""));
  } else if (sortBy === "name-desc") {
    list.sort((a, b) => (b.family || "").localeCompare(a.family || ""));
  } else if (sortBy === "styles-desc") {
    list.sort(
      (a, b) =>
        (b.count || b.fonts?.length || 0) - (a.count || a.fonts?.length || 0),
    );
  }
  return list;
}
