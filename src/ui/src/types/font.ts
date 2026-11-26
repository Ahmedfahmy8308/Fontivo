export interface FontItem {
  id: string | number;
  name: string;
  family: string;
  subfamily?: string;
  style?: string;
  format?: string;
  category?: string;
  provider?: string;
  path?: string;
  isActive?: boolean;
  isFavorite?: boolean;
  isLocal?: boolean;
  isDownloaded?: boolean;
  isCloud?: boolean;
  weight?: number | string;
  size?: number | string;
  designer?: string;
  license?: string;
  version?: string;
  glyphCount?: number;
  postscriptName?: string;
  metrics?: {
    unitsPerEm?: number;
    ascender?: number;
    descender?: number;
    lineGap?: number;
    capHeight?: number;
    xHeight?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface FontFamily {
  family: string;
  count: number;
  fonts: FontItem[];
  isActive?: boolean;
  isAllActive?: boolean;
  isFavorite?: boolean;
  isLocal?: boolean;
  isDownloaded?: boolean;
  isCloud?: boolean;
  category?: string;
  provider?: string;
  [key: string]: unknown;
}

export interface FontStats {
  total: number;
  active: number;
  favorites: number;
  arabicCount: number;
  englishCount: number;
  symbolsCount: number;
  familiesCount: number;
  [key: string]: unknown;
}

export interface FontFilter {
  type: string;
  value?: string | null;
}

export type FontSortBy = "name-asc" | "name-desc" | "styles-desc" | string;

export type FontViewMode = "list" | "grid" | "compact" | "family";
