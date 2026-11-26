import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  CheckCircle2,
  Zap,
  Download,
  RefreshCw,
  Type,
  Globe,
  FolderOpen,
} from "lucide-react";
import { safeFetchJson } from "../../utils/safeFetch";
import { upsertLiveOperation } from "../../utils/operationsBus";
import { ARABIC_SPECIMEN, LATIN_SPECIMEN } from "./viewUtils";

export interface GoogleFontCatalogItem {
  family: string;
  category: string;
  variants?: string[];
  subsets?: string[];
  scripts?: string[];
  isArabic?: boolean;
  isLatin?: boolean;
  isBilingual?: boolean;
  isVariable?: boolean;
}

const OFFLINE_FALLBACK_GOOGLE_FONTS: GoogleFontCatalogItem[] = [
  {
    family: "Cairo",
    category: "sans-serif",
    subsets: ["arabic", "latin"],
    variants: ["200", "300", "400", "500", "600", "700", "800", "900"],
    isArabic: true,
    isLatin: true,
    isBilingual: true,
    isVariable: true,
  },
  {
    family: "Tajawal",
    category: "sans-serif",
    subsets: ["arabic", "latin"],
    variants: ["200", "300", "400", "500", "700", "800", "900"],
    isArabic: true,
    isLatin: true,
    isBilingual: true,
  },
  {
    family: "Almarai",
    category: "sans-serif",
    subsets: ["arabic", "latin"],
    variants: ["300", "400", "700", "800"],
    isArabic: true,
    isLatin: true,
    isBilingual: true,
  },
  {
    family: "Amiri",
    category: "serif",
    subsets: ["arabic", "latin"],
    variants: ["400", "400italic", "700", "700italic"],
    isArabic: true,
    isLatin: true,
    isBilingual: true,
  },
  {
    family: "IBM Plex Sans Arabic",
    category: "sans-serif",
    subsets: ["arabic", "latin"],
    variants: ["100", "200", "300", "400", "500", "600", "700"],
    isArabic: true,
    isLatin: true,
    isBilingual: true,
  },
  {
    family: "Readex Pro",
    category: "sans-serif",
    subsets: ["arabic", "latin"],
    variants: ["200", "300", "400", "500", "600", "700"],
    isArabic: true,
    isLatin: true,
    isBilingual: true,
    isVariable: true,
  },
  {
    family: "Noto Sans Arabic",
    category: "sans-serif",
    subsets: ["arabic", "latin"],
    variants: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
    isArabic: true,
    isLatin: true,
    isBilingual: true,
    isVariable: true,
  },
  {
    family: "Noto Kufi Arabic",
    category: "sans-serif",
    subsets: ["arabic", "latin"],
    variants: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
    isArabic: true,
    isLatin: true,
    isBilingual: true,
    isVariable: true,
  },
  {
    family: "El Messiri",
    category: "sans-serif",
    subsets: ["arabic", "latin"],
    variants: ["400", "500", "600", "700"],
    isArabic: true,
    isLatin: true,
    isBilingual: true,
    isVariable: true,
  },
  {
    family: "Inter",
    category: "sans-serif",
    subsets: ["latin", "latin-ext"],
    variants: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
    isArabic: false,
    isLatin: true,
    isBilingual: false,
    isVariable: true,
  },
  {
    family: "Plus Jakarta Sans",
    category: "sans-serif",
    subsets: ["latin", "latin-ext"],
    variants: ["200", "300", "400", "500", "600", "700", "800"],
    isArabic: false,
    isLatin: true,
    isBilingual: false,
    isVariable: true,
  },
  {
    family: "Playfair Display",
    category: "serif",
    subsets: ["latin", "latin-ext"],
    variants: ["400", "500", "600", "700", "800", "900"],
    isArabic: false,
    isLatin: true,
    isBilingual: false,
    isVariable: true,
  },
  {
    family: "JetBrains Mono",
    category: "monospace",
    subsets: ["latin", "latin-ext"],
    variants: ["100", "200", "300", "400", "500", "600", "700", "800"],
    isArabic: false,
    isLatin: true,
    isBilingual: false,
    isVariable: true,
  },
  {
    family: "Bebas Neue",
    category: "display",
    subsets: ["latin", "latin-ext"],
    variants: ["400"],
    isArabic: false,
    isLatin: true,
    isBilingual: false,
  },
  {
    family: "Caveat",
    category: "handwriting",
    subsets: ["latin", "latin-ext"],
    variants: ["400", "500", "600", "700"],
    isArabic: false,
    isLatin: true,
    isBilingual: false,
    isVariable: true,
  },
];

const PAGE_SIZE = 36;

export function detectGoogleFontScript(
  font: GoogleFontCatalogItem,
): "arabic" | "latin" | "bilingual" {
  const subsets = (font.subsets || font.scripts || []).map((s) =>
    String(s).toLowerCase(),
  );
  const cat = String(font.category || "").toLowerCase();
  const hasArabic =
    Boolean(font.isArabic) ||
    cat === "arabic" ||
    subsets.some((s) => s.includes("arab"));
  const hasLatin =
    font.isLatin !== undefined
      ? Boolean(font.isLatin)
      : subsets.length === 0 || subsets.some((s) => s.includes("latin"));

  if (font.isBilingual || (hasArabic && hasLatin)) return "bilingual";
  if (hasArabic) return "arabic";
  return "latin";
}

function injectGoogleFontBatchStylesheet(families: string[]): void {
  if (
    typeof document === "undefined" ||
    !document.head ||
    families.length === 0
  )
    return;

  const missing = families.filter((fam) => {
    const id = `fontivo-gf-card-${fam.replace(/[^a-zA-Z0-9]/g, "-")}`;
    return !document.getElementById(id);
  });

  if (missing.length === 0) return;

  // Load in clean batches of 12 families per stylesheet link
  for (let i = 0; i < missing.length; i += 12) {
    const chunk = missing.slice(i, i + 12);
    const query = chunk
      .map(
        (fam) =>
          `family=${encodeURIComponent(fam).replace(/%20/g, "+")}:wght@400;700`,
      )
      .join("&");

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
    link.setAttribute("data-fontivo-gf-batch", "true");
    document.head.appendChild(link);

    // Mark families as requested so we don't re-request
    for (const fam of chunk) {
      const marker = document.createElement("meta");
      marker.id = `fontivo-gf-card-${fam.replace(/[^a-zA-Z0-9]/g, "-")}`;
      marker.setAttribute("name", "fontivo-gf-loaded");
      marker.setAttribute("content", fam);
      document.head.appendChild(marker);
    }
  }
}

export default function GoogleFontsView({
  onRefreshStats,
  t = {},
  isRtl = false,
}: any) {
  const [query, setQuery] = useState("");
  const [scriptFilter, setScriptFilter] = useState<
    "all" | "arabic" | "latin" | "bilingual"
  >("all");
  const [category, setCategory] = useState("all");
  const [previewText, setPreviewText] = useState("");
  const [fonts, setFonts] = useState<GoogleFontCatalogItem[]>(
    OFFLINE_FALLBACK_GOOGLE_FONTS,
  );
  const [catalogTotals, setCatalogTotals] = useState<{
    families: number;
    styles: number;
    isLive: boolean;
  }>({
    families: OFFLINE_FALLBACK_GOOGLE_FONTS.length,
    styles: OFFLINE_FALLBACK_GOOGLE_FONTS.reduce(
      (sum, f) => sum + (f.variants?.length || 1),
      0,
    ),
    isLive: false,
  });
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [activatedFamilies, setActivatedFamilies] = useState<Set<string>>(
    () => new Set(),
  );
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const scriptTabs = [
    { id: "all" as const, label: isRtl ? "الكل" : "All Scripts" },
    { id: "arabic" as const, label: isRtl ? "عربي" : "Arabic" },
    { id: "latin" as const, label: isRtl ? "لاتيني" : "Latin" },
    { id: "bilingual" as const, label: isRtl ? "ثنائي اللغة" : "Bilingual" },
  ];

  const categories = [
    { id: "all", label: isRtl ? "كافة التصنيفات" : "All Categories" },
    { id: "sans-serif", label: "Sans Serif" },
    { id: "serif", label: "Serif" },
    { id: "display", label: "Display" },
    { id: "handwriting", label: "Handwriting" },
    { id: "monospace", label: "Monospace" },
  ];

  const fetchGoogleFonts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== "all") params.append("category", category);
      if (scriptFilter !== "all") params.append("script", scriptFilter);
      if (query.trim()) params.append("search", query.trim());

      const data = await safeFetchJson<any>(
        `/api/google-fonts?${params.toString()}`,
        { timeoutMs: 8000 },
      );
      if (data && Array.isArray(data.fonts)) {
        const fetchedFonts: GoogleFontCatalogItem[] = data.fonts;
        setFonts(fetchedFonts);
        setVisibleCount(PAGE_SIZE);

        const totalFamilies =
          Number(
            data.totalFamilies ??
              data.catalogTotal ??
              data.total ??
              fetchedFonts.length,
          ) || fetchedFonts.length;
        const computedStyles = fetchedFonts.reduce(
          (sum, f) =>
            sum +
            (Array.isArray(f.variants) && f.variants.length > 0
              ? f.variants.length
              : 1),
          0,
        );
        const totalStyles =
          Number(
            data.totalStyles ??
              data.totalVariants ??
              data.stylesCount ??
              computedStyles,
          ) || computedStyles;

        setCatalogTotals({
          families: totalFamilies,
          styles: totalStyles,
          isLive: true,
        });
      } else {
        // Offline fallback filter
        const q = query.trim().toLowerCase();
        const filtered = OFFLINE_FALLBACK_GOOGLE_FONTS.filter((f) => {
          const catMatch = category === "all" || f.category === category;
          const script = detectGoogleFontScript(f);
          const scriptMatch =
            scriptFilter === "all" ||
            (scriptFilter === "arabic" &&
              (script === "arabic" || script === "bilingual")) ||
            (scriptFilter === "latin" &&
              (script === "latin" || script === "bilingual")) ||
            (scriptFilter === "bilingual" && script === "bilingual");
          const qMatch = !q || f.family.toLowerCase().includes(q);
          return catMatch && scriptMatch && qMatch;
        });
        setFonts(filtered);
        setVisibleCount(PAGE_SIZE);
      }
    } catch (e) {
      console.error("Failed to fetch Google Fonts:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoogleFonts();
  }, [category, scriptFilter]);

  // Client-side instant filter so typing feels instantaneous even before pressing Enter
  const displayedFonts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fonts.filter((f) => {
      if (q && !f.family.toLowerCase().includes(q)) return false;
      if (
        category !== "all" &&
        f.category &&
        f.category.toLowerCase() !== category.toLowerCase()
      ) {
        return false;
      }
      if (scriptFilter !== "all") {
        const script = detectGoogleFontScript(f);
        if (
          scriptFilter === "arabic" &&
          script !== "arabic" &&
          script !== "bilingual"
        )
          return false;
        if (
          scriptFilter === "latin" &&
          script !== "latin" &&
          script !== "bilingual"
        )
          return false;
        if (scriptFilter === "bilingual" && script !== "bilingual")
          return false;
      }
      return true;
    });
  }, [fonts, query, category, scriptFilter]);

  const visibleFonts = useMemo(
    () => displayedFonts.slice(0, visibleCount),
    [displayedFonts, visibleCount],
  );

  // Dynamically load actual Google Webfonts for currently visible cards
  useEffect(() => {
    if (visibleFonts.length === 0) return;
    injectGoogleFontBatchStylesheet(visibleFonts.map((f) => f.family));
  }, [visibleFonts]);

  const handleDownload = async (
    font: GoogleFontCatalogItem,
    mode: "ram" | "permanent" | "disk" = "ram",
  ) => {
    setDownloadingId(font.family);
    setActionMessage(null);

    const opId = `gf-${font.family}-${Date.now()}`;
    upsertLiveOperation({
      id: opId,
      title: `Google Font: ${font.family}`,
      titleAr: `خط جوجل: ${font.family}`,
      category: "google-font",
      status: "running",
      progressPercent: 35,
      bytesDone: 180 * 1024,
      bytesTotal: 520 * 1024,
      speedBps: 1450 * 1024,
      stepLabel:
        mode === "ram"
          ? "Downloading & injecting into RAM..."
          : mode === "disk"
            ? "Downloading font file to Downloads folder..."
            : "Downloading & installing to Windows...",
      stepLabelAr:
        mode === "ram"
          ? "جاري التحميل والتفعيل الفوري في الرام..."
          : mode === "disk"
            ? "جاري حفظ ملف الخط في مجلد التنزيلات..."
            : "جاري التحميل والتثبيت في نظام ويندوز...",
    });

    try {
      const data = await safeFetchJson<any>("/api/download-google-font", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family: font.family, mode }),
        timeoutMs: 12000,
      });

      upsertLiveOperation({
        id: opId,
        status: "completed",
        progressPercent: 100,
        bytesDone: 520 * 1024,
        bytesTotal: 520 * 1024,
        stepLabel:
          mode === "ram"
            ? `${font.family} active in RAM!`
            : mode === "disk"
              ? `${font.family} saved to Downloads folder!`
              : `${font.family} installed!`,
        stepLabelAr:
          mode === "ram"
            ? `تم تفعيل "${font.family}" بالرام فوراً!`
            : mode === "disk"
              ? `تم حفظ "${font.family}" في مجلد التنزيلات بنجاح!`
              : `تم تثبيت "${font.family}" بنجاح!`,
      });

      if (!data || data.success !== false) {
        if (mode === "ram") {
          setActivatedFamilies((prev) => new Set(prev).add(font.family));
        }
        setActionMessage({
          type: "success",
          text:
            mode === "ram"
              ? isRtl
                ? `تم تحميل وتفعيل خط "${font.family}" بالرام فوراً!`
                : `"${font.family}" downloaded & activated in RAM!`
              : mode === "disk"
                ? isRtl
                  ? `تم حفظ ملف خط "${font.family}" في مجلد التنزيلات بنجاح!`
                  : `"${font.family}" saved to Downloads folder!`
                : isRtl
                  ? `تم تثبيت خط "${font.family}" بنجاح في نظام ويندوز!`
                  : `"${font.family}" installed permanently!`,
        });
        if (onRefreshStats) onRefreshStats();
      } else {
        throw new Error(data.error || "Failed to download font");
      }
    } catch (e: any) {
      upsertLiveOperation({
        id: opId,
        status: "failed",
        progressPercent: 0,
        error: e?.message || "Download failed",
      });
      setActionMessage({
        type: "error",
        text: e?.message || "Download failed",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div
      className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none transition-colors"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-5 border-b border-[var(--color-border)] gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text-header)] truncate">
              {t.googleFontsTitle ||
                (isRtl
                  ? "كتالوج خطوط جوجل السحابي"
                  : "Google Fonts Live Catalog")}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-action)]/10 text-[var(--color-action)] border border-[var(--color-action)]/20 font-mono tabular-nums whitespace-nowrap shrink-0">
              {catalogTotals.isLive
                ? `${catalogTotals.families.toLocaleString()} ${isRtl ? "عائلة" : "FAMILIES"}`
                : `${displayedFonts.length.toLocaleString()} ${isRtl ? "عائلة (غير متصل)" : "FAMILIES (OFFLINE)"}`}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono tabular-nums whitespace-nowrap shrink-0">
              {catalogTotals.styles.toLocaleString()}{" "}
              {isRtl ? "وزن ونمط" : "STYLES"}
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1.5 leading-relaxed">
            {t.googleFontsSubtitle ||
              (isRtl
                ? "تصفح وعاين الكتالوج الكامل لخطوط جوجل بأسمائها الحقيقية، وحمّلها وفعّلها بالرام بنقرة واحدة."
                : "Browse and live-preview the full Google Fonts catalog with 1-click download and instant RAM activation.")}
          </p>
        </div>

        {/* Search + Custom Preview Input */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <div className="relative w-full sm:w-56">
            <Type className="w-3.5 h-3.5 text-[var(--color-text-muted)] absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder={
                isRtl ? "نص المعاينة الحية..." : "Live preview text..."
              }
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              className="w-full h-9 bg-[var(--color-control)] border border-[var(--color-border)] rounded-full ltr:pl-8 ltr:pr-3 rtl:pr-8 rtl:pl-3 text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-action)] transition-colors"
            />
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-[var(--color-text-muted)] absolute ltr:right-3 rtl:left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder={
                isRtl ? "بحث في خطوط جوجل..." : "Search Google Fonts..."
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchGoogleFonts()}
              className="w-full h-9 bg-[var(--color-control)] border border-[var(--color-border)] rounded-full ltr:pr-9 ltr:pl-4 rtl:pl-9 rtl:pr-4 text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-action)] transition-colors"
            />
          </div>

          <button
            onClick={() =>
              safeFetchJson("/api/library/open-downloads", { method: "POST" })
            }
            className="h-9 px-3 rounded-full bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-header)] flex items-center gap-1.5 transition cursor-pointer shrink-0"
            title={
              isRtl
                ? "فتح مجلد التنزيلات في ويندوز"
                : "Open Downloads Folder in Windows"
            }
          >
            <FolderOpen className="w-3.5 h-3.5 text-[var(--color-action)]" />
            <span className="hidden sm:inline">
              {isRtl ? "مجلد التنزيلات" : "Downloads"}
            </span>
          </button>
        </div>
      </div>

      {/* Script & Category Filter Chips — flex-wrap so nothing is clipped */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {scriptTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setScriptFilter(tab.id)}
              className={`h-8 px-3.5 rounded-full text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                scriptFilter === tab.id
                  ? "bg-[var(--color-action)] text-white shadow-xs"
                  : "bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] border border-[var(--color-border)]"
              }`}
            >
              {tab.label}
            </button>
          ))}

          <span className="w-[1px] h-5 bg-[var(--color-border)] mx-1 hidden sm:inline-block" />

          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`h-8 px-3 rounded-full text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                category === c.id
                  ? "bg-purple-600 text-white font-bold shadow-xs"
                  : "bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] border border-[var(--color-border)]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
            actionMessage.type === "success"
              ? "bg-[var(--color-green)]/10 text-[var(--color-green)] border border-[var(--color-green)]/20"
              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
          }`}
        >
          {actionMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <RefreshCw className="w-4 h-4 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Fonts Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
          <RefreshCw className="w-6 h-6 animate-spin text-[var(--color-action)]" />
          <span className="text-xs">
            {isRtl
              ? "جاري الاتصال بسحابة Google Fonts..."
              : "Loading full Google Fonts catalog..."}
          </span>
        </div>
      ) : visibleFonts.length === 0 ? (
        <div className="py-16 text-center text-xs text-[var(--color-text-muted)]">
          {isRtl
            ? "لا توجد خطوط مطابقة لخيارات البحث الحالية."
            : "No Google Fonts match the current filters."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {visibleFonts.map((f) => {
              const script = detectGoogleFontScript(f);
              const isActivated = activatedFamilies.has(f.family);
              const sampleText =
                previewText.trim() ||
                (script === "arabic"
                  ? ARABIC_SPECIMEN
                  : script === "bilingual"
                    ? isRtl
                      ? ARABIC_SPECIMEN
                      : LATIN_SPECIMEN
                    : LATIN_SPECIMEN);
              const sampleDir =
                script === "arabic" ||
                (script === "bilingual" && /[\u0600-\u06FF]/.test(sampleText))
                  ? "rtl"
                  : "ltr";

              return (
                <div
                  key={f.family}
                  className="bg-[var(--color-back-card)] border border-[var(--color-border)] hover:border-[var(--color-action)]/50 rounded-2xl p-4 flex flex-col justify-between gap-3 h-full min-w-0 shadow-xs transition"
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <h3 className="font-bold text-sm text-[var(--color-text-header)] truncate min-w-0 flex-1">
                        {f.family}
                      </h3>
                      <div className="flex items-center gap-1 shrink-0">
                        {script === "bilingual" && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 whitespace-nowrap">
                            {isRtl ? "عربي/لاتيني" : "AR/EN"}
                          </span>
                        )}
                        {f.isVariable && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/25 whitespace-nowrap">
                            VAR
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase px-2 py-0.5 rounded-md bg-[var(--color-control)] border border-[var(--color-border)] whitespace-nowrap">
                          {f.category}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-1 tabular-nums">
                      {f.variants?.length || 1}{" "}
                      {isRtl ? "أوزان ونمط" : "styles & variants"}
                    </p>
                  </div>

                  {/* Actual Live Webfont Preview */}
                  <div
                    className="py-2.5 px-1 text-xl leading-snug text-[var(--color-text-header)] line-clamp-2 min-h-[58px] flex items-center"
                    style={{
                      fontFamily: `"${f.family}", sans-serif`,
                      direction: sampleDir,
                      textAlign: sampleDir === "rtl" ? "right" : "left",
                    }}
                  >
                    {sampleText}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
                    <button
                      onClick={() => handleDownload(f, "ram")}
                      disabled={downloadingId === f.family}
                      className={`flex-1 h-8 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 border ${
                        isActivated
                          ? "bg-[var(--color-green)]/20 border-[var(--color-green)]/40 text-[var(--color-green)]"
                          : "bg-[var(--color-green)]/10 hover:bg-[var(--color-green)]/20 border-[var(--color-green)]/30 text-[var(--color-green)]"
                      }`}
                      title={
                        isRtl
                          ? "تحميل وتفعيل فوري في الذاكرة"
                          : "Download & Activate in RAM"
                      }
                    >
                      {downloadingId === f.family ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                      ) : isActivated ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>
                        {isActivated
                          ? isRtl
                            ? "مفعّل بالرام"
                            : "Active in RAM"
                          : isRtl
                            ? "تفعيل بالرام"
                            : "Activate RAM"}
                      </span>
                    </button>

                    <button
                      onClick={() => handleDownload(f, "permanent")}
                      disabled={downloadingId === f.family}
                      className="h-8 px-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-main)] border border-[var(--color-border)] text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                      title={
                        isRtl ? "تثبيت دائم في ويندوز" : "Install Permanently"
                      }
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>{isRtl ? "تثبيت" : "Install"}</span>
                    </button>

                    <button
                      onClick={() => handleDownload(f, "disk")}
                      disabled={downloadingId === f.family}
                      className="h-8 px-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-main)] border border-[var(--color-border)] text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                      title={
                        isRtl
                          ? "حفظ ملف الخط في مجلد التنزيلات"
                          : "Save font file to Downloads folder"
                      }
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
                      <span>{isRtl ? "حفظ على القرص" : "Save"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {displayedFonts.length > visibleCount && (
            <div className="flex justify-center pt-3">
              <button
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="px-5 py-2 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-header)] flex items-center gap-2 transition cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-[var(--color-action)]" />
                <span>
                  {isRtl
                    ? `عرض المزيد (${(displayedFonts.length - visibleCount).toLocaleString()} متبقي)`
                    : `Load More (${(displayedFonts.length - visibleCount).toLocaleString()} remaining)`}
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
