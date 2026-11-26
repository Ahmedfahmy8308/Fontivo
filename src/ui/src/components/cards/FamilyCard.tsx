import React, { useState, useEffect, useMemo } from "react";
import {
  Star,
  Eye,
  Cloud,
  Trash2,
  FolderPlus,
  Code,
  Check,
  Zap,
  Layers,
  Columns2,
  ChevronDown,
  Download,
  MoreVertical,
  FolderOpen,
  Globe,
  Monitor,
  Package,
} from "lucide-react";
import { FontFamily, FontItem } from "../../types/font";
import {
  getSmartSpecimenText,
  getSmartDirection,
  detectFontScript,
  ARABIC_SPECIMEN,
  LATIN_SPECIMEN,
} from "../views/viewUtils";

const TASHKEEL_REGEX = /[\u064B-\u065F\u0670]/;
const ARABIC_REGEX = /[\u0600-\u06FF]/;
const HARAKAT_SPECIMEN = "صِف خَلقَ خَودٍ كَمِثلِ الشَمسِ إِذ بَزَغَتْ";

export function formatFontStyleName(
  rawStyle: string,
  isRtl: boolean = false,
): string {
  const s = (rawStyle || "").trim();
  const lower = s.toLowerCase();

  // Normalize multi-lingual localized names (French, German, Italian, etc.)
  let normalized = s;
  if (
    lower === "italique" ||
    lower === "kursiv" ||
    lower === "oblique" ||
    lower === "corsivo"
  ) {
    normalized = "Italic";
  } else if (lower === "gras" || lower === "fett" || lower === "grassetto") {
    normalized = "Bold";
  } else if (
    lower === "gras italique" ||
    lower === "grasitalique" ||
    lower === "fett kursiv" ||
    lower === "bolditalic" ||
    lower === "bold italic"
  ) {
    normalized = "Bold Italic";
  } else if (lower === "normal" || lower === "standard" || lower === "buch") {
    normalized = "Regular";
  } else if (lower === "maigre" || lower === "leicht" || lower === "chiaro") {
    normalized = "Light";
  } else if (lower === "demi" || lower === "halbfett" || lower === "demibold") {
    normalized = "SemiBold";
  } else if (lower === "noir" || lower === "schwarz" || lower === "heavy") {
    normalized = "Black";
  } else if (lower === "mince" || lower === "mager") {
    normalized = "Thin";
  }

  if (!isRtl) return normalized;

  // Arabic localization for standard weights
  const nLow = normalized.toLowerCase();
  if (nLow === "regular" || nLow === "normal") return "عادي";
  if (nLow === "bold") return "عريض (Bold)";
  if (nLow === "italic") return "مائل (Italic)";
  if (nLow === "bold italic" || nLow === "bolditalic") return "عريض مائل";
  if (nLow === "light") return "خفيف (Light)";
  if (nLow === "light italic" || nLow === "lightitalic") return "خفيف مائل";
  if (nLow === "medium") return "متوسط (Medium)";
  if (nLow === "medium italic" || nLow === "mediumitalic") return "متوسط مائل";
  if (nLow === "semibold" || nLow === "semi bold") return "شبه عريض (SemiBold)";
  if (nLow === "extrabold" || nLow === "extra bold")
    return "عريض جداً (ExtraBold)";
  if (nLow === "black" || nLow === "heavy") return "أسود (Black)";
  if (nLow === "thin") return "نحيف (Thin)";

  return normalized;
}

function isFontLocal(font?: FontItem): boolean {
  if (!font) return true;
  if (font.isLocal !== undefined) return Boolean(font.isLocal);
  if (font.isDownloaded !== undefined) return Boolean(font.isDownloaded);
  if (font.isCloud !== undefined) return !Boolean(font.isCloud);
  if (font.path) {
    return (
      !font.path.startsWith("cloud://") &&
      !font.path.startsWith("http://") &&
      !font.path.startsWith("https://")
    );
  }
  return true;
}

function pickDefaultFont(fonts: FontItem[]): FontItem {
  if (!fonts || fonts.length === 0) return {} as FontItem;
  const regular = fonts.find((f) => {
    const s = String(f.style || f.subfamily || "")
      .toLowerCase()
      .trim();
    return s === "regular" || s === "normal" || s === "book" || s === "400";
  });
  return regular || fonts[0];
}

function injectFontFaceStyle(font: FontItem, fontFamilyName: string): void {
  if (typeof document === "undefined" || !font?.id) return;

  const isLocal = isFontLocal(font);
  const isGoogleCloud =
    !isLocal &&
    (font.provider === "google" || String(font.id).startsWith("gf:"));

  if (isGoogleCloud) {
    const fam = font.family || font.name;
    if (!fam) return;
    const linkId = `fontivo-gf-${fam.replace(/[^a-zA-Z0-9]/g, "-")}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam)}:wght@300;400;500;600;700;800;900&display=swap`;
      document.head.appendChild(link);
    }
    return;
  }

  const fontUrl = `/api/font-file/${encodeURIComponent(String(font.id))}`;
  const styleId = `fontivo-face-${String(font.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  // Inject @font-face stylesheet tag for reliable WebView2 rendering
  if (!document.getElementById(styleId) && document.head) {
    const styleEl = document.createElement("style");
    styleEl.id = styleId;
    styleEl.textContent = `@font-face { font-family: "${fontFamilyName}"; src: url("${fontUrl}"); font-display: swap; }`;
    document.head.appendChild(styleEl);
  }

  // Also load eagerly via FontFace API when available
  if (typeof FontFace !== "undefined" && document.fonts) {
    if (
      typeof document.fonts.check === "function" &&
      document.fonts.check(`12px "${fontFamilyName}"`)
    ) {
      return;
    }
    try {
      const fontFace = new FontFace(fontFamilyName, `url("${fontUrl}")`);
      fontFace
        .load()
        .then((loaded) => {
          document.fonts.add(loaded);
        })
        .catch(() => {});
    } catch {
      // ignore in SSR/test environments
    }
  }
}

export function getFamilySmartPreviewText(
  font: FontItem,
  previewText: string,
  isRtl: boolean,
  hasTashkeelFilter?: boolean,
): string {
  const script = detectFontScript(font);
  const trimmed = (previewText || "").trim();

  if (script === "latin") {
    const hasLat = /[A-Za-z]/.test(trimmed);
    const hasAr = ARABIC_REGEX.test(trimmed);
    return trimmed && hasLat && !hasAr ? trimmed : LATIN_SPECIMEN;
  }

  if (hasTashkeelFilter && (script === "arabic" || script === "bilingual")) {
    if (trimmed && ARABIC_REGEX.test(trimmed) && TASHKEEL_REGEX.test(trimmed)) {
      return trimmed;
    }
    return HARAKAT_SPECIMEN;
  }

  if (script === "arabic") {
    return trimmed && ARABIC_REGEX.test(trimmed) ? trimmed : ARABIC_SPECIMEN;
  }

  return getSmartSpecimenText(font, previewText, isRtl);
}

export interface FamilyCardProps {
  family: FontFamily;
  previewText: string;
  fontSize: number;
  lineHeight?: number | string;
  letterSpacing?: number | string;
  textAlign?: "left" | "center" | "right" | "justify";
  isRtl?: boolean;
  textColor?: string;
  hasTashkeelFilter?: boolean;
  onToggleActive: (id: string | number, currentStatus?: boolean) => void;
  onToggleFavorite: (fontOrId: FontItem | string | number) => void;
  onActivateFamily: (familyName: string) => void;
  onDeactivateFamily: (familyName: string) => void;
  onOpenDetails: (font: FontItem) => void;
  onInspectFamily?: (family: FontFamily) => void;
  onToggleCompare?: (font: FontItem) => void;
  onDeleteFont?: (target: FontItem | FontFamily) => void;
  onAddToCollection?: (collectionName: string, fontId: string | number) => void;
  collections?: Record<string, string[]>;
  isCompared?: boolean;
  onOpenPack?: (family?: FontFamily) => void;
}

export default function FamilyCard({
  family,
  previewText,
  fontSize,
  lineHeight,
  letterSpacing,
  textAlign,
  isRtl = false,
  textColor,
  hasTashkeelFilter = false,
  onToggleActive,
  onToggleFavorite,
  onActivateFamily,
  onDeactivateFamily,
  onOpenDetails,
  onInspectFamily,
  onToggleCompare,
  onDeleteFont,
  onAddToCollection,
  collections = {},
  isCompared = false,
  onOpenPack,
}: FamilyCardProps) {
  const defaultFont = useMemo(
    () => pickDefaultFont(family.fonts || []),
    [family.fonts],
  );
  const [selectedFontId, setSelectedFontId] = useState<string | number>(
    defaultFont.id,
  );
  const [copiedCss, setCopiedCss] = useState(false);
  const [showCollectionMenu, setShowCollectionMenu] = useState(false);
  const [addedCollectionToast, setAddedCollectionToast] = useState<
    string | null
  >(null);
  const [showWeightMenu, setShowWeightMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [downloadingDisk, setDownloadingDisk] = useState(false);
  const [diskSavedToast, setDiskSavedToast] = useState(false);

  const handleOpenFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedFont?.id) return;
    try {
      await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(selectedFont.id) }),
      });
    } catch {
      // ignore
    }
  };

  const handleDownloadToDisk = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingDisk(true);
    try {
      const res = await fetch("/api/fonts/download-to-disk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fontId: selectedFont.id,
          family: family.family,
          style: selectedFont.style,
        }),
      });
      if (res.ok) {
        setDiskSavedToast(true);
        setTimeout(() => setDiskSavedToast(false), 2500);
      }
    } catch {
      // offline fallback
    } finally {
      setDownloadingDisk(false);
    }
  };

  // Keep selectedFontId synced if family changes
  useEffect(() => {
    if (!family.fonts?.some((f) => f.id === selectedFontId)) {
      setSelectedFontId(defaultFont.id);
    }
  }, [family.fonts, defaultFont.id, selectedFontId]);

  const selectedFont: FontItem = useMemo(() => {
    return family.fonts?.find((f) => f.id === selectedFontId) || defaultFont;
  }, [family.fonts, selectedFontId, defaultFont]);

  const selectedFontFamily = `Fontivo_${selectedFont.id}`;
  const isSelectedSystem =
    String(selectedFont.source || "").toLowerCase() === "system" ||
    String(selectedFont.provider || "").toLowerCase() === "system" ||
    String(selectedFont.path || "")
      .toLowerCase()
      .includes("windows\\fonts") ||
    String(selectedFont.path || "")
      .toLowerCase()
      .includes("windows/fonts");
  const isSelectedLocal = isFontLocal(selectedFont);
  const isSelectedActive = Boolean(
    selectedFont.isActive || selectedFont.active,
  );

  const isFamilyActive = Boolean(
    family.isActive ||
    family.isAllActive ||
    family.fonts?.some((f) => f.isActive || f.active),
  );
  const isAllWeightsActive = Boolean(
    family.isAllActive ||
    (family.fonts &&
      family.fonts.length > 0 &&
      family.fonts.every((f) => f.isActive || f.active)),
  );
  const isFamilyFav = Boolean(
    family.isFavorite ||
    selectedFont.isFavorite ||
    selectedFont.favorite ||
    family.fonts?.some((f) => f.isFavorite || f.favorite),
  );

  const isFamilyLocal =
    family.isLocal !== undefined
      ? Boolean(family.isLocal)
      : family.isDownloaded !== undefined
        ? Boolean(family.isDownloaded)
        : family.isCloud !== undefined
          ? !Boolean(family.isCloud)
          : family.fonts && family.fonts.length > 0
            ? family.fonts.some((f) => isFontLocal(f))
            : true;

  const isVariable = Boolean(
    family.isVariable ||
    selectedFont.isVariable ||
    String(selectedFont.style || "")
      .toLowerCase()
      .includes("variable"),
  );

  const hasTashkeel = Boolean(family.hasTashkeel || selectedFont.hasTashkeel);
  const scriptSupport = detectFontScript(selectedFont);

  const sourceBadge = useMemo(() => {
    const pathLower = String(selectedFont?.path || "").toLowerCase();
    const sourceLower = String(
      family.source || selectedFont?.source || "",
    ).toLowerCase();
    const subCatLower = String(
      family.subCategory || selectedFont?.subCategory || "",
    ).toLowerCase();
    const catLower = String(
      family.category || selectedFont?.category || "",
    ).toLowerCase();

    // 1. Windows System Font (مثبت بنظام Windows)
    if (
      sourceLower === "system" ||
      pathLower.includes("windows\\fonts") ||
      pathLower.includes("windows/fonts") ||
      subCatLower.includes("system")
    ) {
      return (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[9px] bg-[#B7A1D9]/15 text-[#B7A1D9] border border-[#B7A1D9]/30 whitespace-nowrap shrink-0 shadow-2xs"
          title={
            isRtl ? "خط مثبت مسبقاً في نظام Windows" : "Pre-installed in Windows"
          }
        >
          <Monitor className="w-2.5 h-2.5 shrink-0" />
          <span>{isRtl ? "مثبت بويندوز" : "Windows"}</span>
        </span>
      );
    }

    // 2. Google Fonts (خطوط جوجل)
    if (
      sourceLower === "google" ||
      pathLower.includes("googlefonts") ||
      pathLower.includes("google_fonts") ||
      subCatLower.includes("google") ||
      catLower.includes("google")
    ) {
      const isDownloaded =
        !pathLower.startsWith("http") &&
        !pathLower.startsWith("cloud://") &&
        pathLower.length > 0;
      return (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[9px] bg-sky-500/15 text-sky-400 border border-sky-500/30 whitespace-nowrap shrink-0 shadow-2xs"
          title={
            isRtl
              ? "خط من مكتبة Google Fonts"
              : "Font from Google Fonts library"
          }
        >
          <Globe className="w-2.5 h-2.5 shrink-0" />
          <span>
            {isRtl
              ? isDownloaded
                ? "جوجل (محمّل)"
                : "جوجل (سحابي)"
              : isDownloaded
                ? "Google (Local)"
                : "Google (Cloud)"}
          </span>
        </span>
      );
    }

    // 3. Cloud Expansion Pack (حزمة التوسعة)
    if (
      sourceLower === "cloud" ||
      pathLower.includes("extracted") ||
      pathLower.includes("pack") ||
      subCatLower.includes("pack") ||
      subCatLower.includes("cloud")
    ) {
      return (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap shrink-0 shadow-2xs"
          title={
            isRtl
              ? "خط من حزم التوسعة السحابية"
              : "Font from Cloud Expansion Pack"
          }
        >
          <Package className="w-2.5 h-2.5 shrink-0" />
          <span>{isRtl ? "حزمة التوسعة" : "Cloud Pack"}</span>
        </span>
      );
    }

    // 4. Custom Local Font (خط محلي خاص)
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap shrink-0 shadow-2xs"
        title={isRtl ? "خط محلي خاص مستورد" : "Custom Imported Local Font"}
      >
        <FolderOpen className="w-2.5 h-2.5 shrink-0" />
        <span>{isRtl ? "خط محلي خاص" : "Custom Local"}</span>
      </span>
    );
  }, [
    family.source,
    family.subCategory,
    family.category,
    selectedFont?.path,
    selectedFont?.source,
    isRtl,
  ]);

  // Dynamically load @font-face for the currently selected weight
  useEffect(() => {
    if (!selectedFont?.id) return;
    injectFontFaceStyle(selectedFont, selectedFontFamily);
  }, [selectedFont, selectedFontFamily]);

  const effectivePreviewText = getFamilySmartPreviewText(
    selectedFont,
    previewText,
    isRtl,
    hasTashkeelFilter,
  );
  const effectiveDir = getSmartDirection(selectedFont, isRtl);

  const handleOpenCloudPack = () => {
    if (onOpenPack) {
      onOpenPack(family);
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("fontivo:open-github-pack", { detail: { family } }),
      );
    }
  };

  const handleCopyCss = (e: React.MouseEvent) => {
    e.stopPropagation();
    const cssSnippet = `font-family: '${family.family}', sans-serif;`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(cssSnippet).catch(() => {});
    }
    setCopiedCss(true);
    setTimeout(() => setCopiedCss(false), 1800);
  };

  const handleSelectCollection = (e: React.MouseEvent, cName: string) => {
    e.stopPropagation();
    if (onAddToCollection && selectedFont.id !== undefined) {
      onAddToCollection(cName, selectedFont.id);
    }
    setShowCollectionMenu(false);
    setAddedCollectionToast(cName);
    setTimeout(() => setAddedCollectionToast(null), 1600);
  };

  const collectionNames = Object.keys(collections || {});
  const availableCollections =
    collectionNames.length > 0
      ? collectionNames
      : ["Branding & Identity", "Web & UI Typography", "Headlines & Posters"];

  const handleToggleFamilyActive = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAllWeightsActive) {
      onDeactivateFamily(family.family);
    } else {
      onActivateFamily(family.family);
    }
  };

  const handleToggleSelectedWeight = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedFont.id !== undefined) {
      onToggleActive(selectedFont.id, isSelectedActive);
    }
  };

  const cardFontSize = Math.max(16, Math.min(fontSize || 32, 64));
  const stylesCount = family.count || family.fonts?.length || 1;

  return (
    <div
      onClick={() =>
        onInspectFamily ? onInspectFamily(family) : onOpenDetails(selectedFont)
      }
      className={`p-4 rounded-2xl border transition-all select-none cursor-pointer flex flex-col justify-between gap-3 h-full min-h-[214px] min-w-0 group relative ${
        isFamilyActive
          ? "bg-[var(--color-back-card)] border-[var(--color-green)]/45 shadow-sm hover:border-[var(--color-green)]/70"
          : "bg-[var(--color-back-card)] border-[var(--color-border)] hover:border-[var(--color-action)]/60 shadow-xs hover:shadow-md"
      }`}
    >
      {/* Card Header: Prominent Family Name, Metadata Badges & Clean Actions */}
      <div className="space-y-2 min-w-0 w-full">
        <div className="flex items-center justify-between gap-2 min-w-0 w-full">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isFamilyActive
                  ? "bg-[var(--color-green)] shadow-[0_0_8px_var(--color-green)]"
                  : isFamilyLocal
                    ? "bg-[var(--color-border)]"
                    : "bg-sky-400/70"
              }`}
            />
            <h3
              className="font-bold text-base text-[var(--color-text-header)] group-hover:text-[var(--color-action)] transition truncate min-w-0 flex-1"
              title={family.family}
              dir="auto"
            >
              {family.family}
            </h3>

            {isFamilyActive && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[9px] bg-[var(--color-green)]/15 text-[var(--color-green)] border border-[var(--color-green)]/30 whitespace-nowrap shrink-0 shadow-2xs"
                title={
                  isRtl
                    ? "الخط نشط ويعمل بالذاكرة فوراً دون تثبيت"
                    : "Active in RAM"
                }
              >
                <Zap className="w-2.5 h-2.5 fill-current shrink-0" />
                <span>{isRtl ? "نشط بالرام" : "In RAM"}</span>
              </span>
            )}
          </div>

          {/* Quick Action Buttons: Favorite, Inspect, and More Options */}
          <div
            className="flex items-center gap-0.5 text-[var(--color-text-muted)] relative shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => onToggleFavorite(selectedFont)}
              className={`h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--color-control)] hover:text-amber-400 transition cursor-pointer shrink-0 ${
                isFamilyFav ? "text-amber-400" : ""
              }`}
              title={isRtl ? "المفضلة" : "Favorite / Unfavorite"}
            >
              <Star
                className={`w-3.5 h-3.5 ${isFamilyFav ? "fill-current" : ""}`}
              />
            </button>

            <button
              onClick={() =>
                onInspectFamily
                  ? onInspectFamily(family)
                  : onOpenDetails(selectedFont)
              }
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--color-control)] hover:text-[var(--color-text-header)] transition cursor-pointer shrink-0"
              title={isRtl ? "فحص تفاصيل العائلة" : "Inspect Family"}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            {/* More Options Dropdown */}
            <div className="relative shrink-0">
              <button
                onClick={() => setShowMoreMenu((prev) => !prev)}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--color-control)] hover:text-[var(--color-action)] transition cursor-pointer shrink-0"
                title={isRtl ? "خيارات إضافية" : "More Options"}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {showMoreMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute top-full mt-1 ${isRtl ? "left-0" : "right-0"} w-48 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-xl shadow-2xl py-1 text-[11px] z-50`}
                >
                  {isSelectedLocal && (
                    <button
                      onClick={(e) => {
                        setShowMoreMenu(false);
                        handleOpenFolder(e);
                      }}
                      className="w-full px-2.5 py-1.5 text-left rtl:text-right hover:bg-[var(--color-control)] text-[var(--color-text-header)] flex items-center gap-2 cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        {isRtl ? "فتح مكان الخط في ويندوز" : "Open in Explorer"}
                      </span>
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      handleCopyCss(e);
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-2.5 py-1.5 text-left rtl:text-right hover:bg-[var(--color-control)] text-[var(--color-text-header)] flex items-center gap-2 cursor-pointer"
                  >
                    <Code className="w-3.5 h-3.5 shrink-0" />
                    <span>{isRtl ? "نسخ كود CSS" : "Copy CSS"}</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowCollectionMenu(true);
                    }}
                    className="w-full px-2.5 py-1.5 text-left rtl:text-right hover:bg-[var(--color-control)] text-[var(--color-text-header)] flex items-center gap-2 cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isRtl ? "إضافة إلى مجموعة" : "Add to Collection"}
                    </span>
                  </button>

                  <button
                    onClick={(e) => {
                      handleDownloadToDisk(e);
                      setShowMoreMenu(false);
                    }}
                    disabled={downloadingDisk}
                    className="w-full px-2.5 py-1.5 text-left rtl:text-right hover:bg-[var(--color-control)] text-[var(--color-text-header)] flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isRtl ? "حفظ ملف الخط بالقرص" : "Save Font File"}
                    </span>
                  </button>

                  {onToggleCompare && (
                    <button
                      onClick={() => {
                        onToggleCompare(selectedFont);
                        setShowMoreMenu(false);
                      }}
                      className="w-full px-2.5 py-1.5 text-left rtl:text-right hover:bg-[var(--color-control)] text-[var(--color-text-header)] flex items-center gap-2 cursor-pointer"
                    >
                      <Columns2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {isRtl
                          ? isCompared
                            ? "إزالة من المقارنة"
                            : "مقارنة الخط"
                          : "Compare Font"}
                      </span>
                    </button>
                  )}

                  {isFamilyLocal && onDeleteFont && (
                    <button
                      onClick={() => {
                        onDeleteFont(family);
                        setShowMoreMenu(false);
                      }}
                      className="w-full px-2.5 py-1.5 text-left rtl:text-right hover:bg-rose-500/15 text-rose-400 flex items-center gap-2 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{isRtl ? "حذف العائلة" : "Delete Family"}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Collections Sub-menu when triggered */}
              {showCollectionMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute top-full mt-1 ${isRtl ? "left-0" : "right-0"} w-44 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-xl shadow-xl py-1 text-[11px] z-50`}
                >
                  <div className="px-2.5 py-1 text-[10px] font-bold text-[var(--color-text-dim)] border-b border-[var(--color-border-subtle)] flex items-center justify-between">
                    <span>
                      {isRtl ? "إضافة للمجموعة:" : "Add to Collection:"}
                    </span>
                    <button
                      onClick={() => setShowCollectionMenu(false)}
                      className="text-[10px] opacity-70 hover:opacity-100 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  {availableCollections.map((cName) => (
                    <button
                      key={cName}
                      onClick={(e) => {
                        handleSelectCollection(e, cName);
                        setShowCollectionMenu(false);
                      }}
                      className="w-full px-2.5 py-1.5 text-left rtl:text-right hover:bg-[var(--color-control)] text-[var(--color-text-header)] truncate block cursor-pointer"
                    >
                      {cName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Compact Metadata Badges & Exact Font Location Row */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-[var(--color-text-muted)] min-w-0">
          {sourceBadge}
          <span className="px-1.5 py-0.5 rounded bg-[var(--color-control)] border border-[var(--color-border)] uppercase font-semibold whitespace-nowrap">
            {selectedFont.format || "TTF"}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-[var(--color-control)] border border-[var(--color-border)] whitespace-nowrap tabular-nums">
            {stylesCount}{" "}
            {stylesCount === 1
              ? isRtl
                ? "وزن"
                : "style"
              : isRtl
                ? "أوزان"
                : "styles"}
          </span>
          {hasTashkeel && (
            <span
              className="px-1.5 py-0.5 rounded font-bold bg-[var(--color-green)]/15 text-[var(--color-green)] border border-[var(--color-green)]/25 whitespace-nowrap"
              title={
                isRtl
                  ? "يدعم التشكيل والتنوين بدقة"
                  : "Full Arabic Tashkeel Support"
              }
            >
              تشكيل ✓
            </span>
          )}
          {isVariable && (
            <span className="px-1.5 py-0.5 rounded font-bold bg-purple-500/15 text-purple-400 border border-purple-500/25 whitespace-nowrap">
              VAR
            </span>
          )}
          {scriptSupport === "bilingual" && (
            <span className="px-1.5 py-0.5 rounded font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 whitespace-nowrap">
              {isRtl ? "عربي/لاتيني" : "AR/EN"}
            </span>
          )}

          {/* Exact Font Location (مكان الفونت بالظبط) */}
          {isSelectedLocal && selectedFont.path ? (
            <button
              type="button"
              onClick={handleOpenFolder}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--color-control)] hover:bg-[var(--color-action)]/15 text-[var(--color-text-muted)] hover:text-[var(--color-action)] border border-[var(--color-border)] hover:border-[var(--color-action)]/30 transition cursor-pointer max-w-[220px] truncate"
              title={
                isRtl
                  ? `مكان الفونت بالقرص: ${selectedFont.path}\n(اضغط لفتح المجلد وتحديد الملف في ويندوز)`
                  : `Font Location: ${selectedFont.path}\n(Click to open folder in Windows Explorer)`
              }
            >
              <FolderOpen className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="truncate font-mono text-[9px] dir-ltr text-left">
                {selectedFont.path.toLowerCase().includes("windows\\fonts")
                  ? "Windows\\Fonts"
                  : selectedFont.path.split(/[/\\]/).slice(-2).join("/")}
              </span>
            </button>
          ) : (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[9px] whitespace-nowrap"
              title={
                isRtl
                  ? "خط سحابي من Google Fonts"
                  : "Cloud Font from Google Fonts"
              }
            >
              <Globe className="w-3 h-3 shrink-0" />
              <span>{isRtl ? "سحابي (Google)" : "Cloud (Google)"}</span>
            </span>
          )}
        </div>
      </div>

      {/* Real @font-face Specimen Preview */}
      <div
        className="flex-1 flex items-center py-2 overflow-hidden min-w-0 leading-snug break-words"
        style={{
          fontFamily: `"${selectedFontFamily}", "${family.family}", sans-serif`,
          fontSize: `${cardFontSize}px`,
          color: textColor || "var(--color-text-header)",
          textAlign: textAlign || (effectiveDir === "rtl" ? "right" : "left"),
          direction: effectiveDir,
          lineHeight: lineHeight !== undefined ? lineHeight : 1.35,
          letterSpacing:
            letterSpacing !== undefined ? `${letterSpacing}px` : undefined,
        }}
      >
        <span className="w-full line-clamp-2">{effectivePreviewText}</span>
      </div>

      {/* Footer: Weight/Style Selector Dropdown + 1-Click Activation Controls */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[var(--color-border)]/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Weight / Style Selector Dropdown */}
        {family.fonts && family.fonts.length > 1 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowWeightMenu((prev) => !prev)}
              aria-label={
                isRtl ? "اختيار الوزن والنمط" : "Select weight or style"
              }
              className="h-7 max-w-[140px] px-2.5 rounded-lg bg-[var(--color-back-input)] border border-[var(--color-border)] hover:border-[var(--color-action)] text-[11px] font-medium text-[var(--color-text-header)] focus:outline-none focus:border-[var(--color-action)] transition cursor-pointer flex items-center justify-between gap-1.5 truncate"
            >
              <span className="truncate">
                {formatFontStyleName(
                  String(
                    selectedFont.style || selectedFont.subfamily || "Regular",
                  ),
                  isRtl,
                )}
              </span>
              <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)] shrink-0" />
            </button>
            {showWeightMenu && (
              <div
                className={`absolute bottom-full mb-1 ${isRtl ? "right-0" : "left-0"} w-44 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-xl shadow-2xl py-1 text-[11px] z-50 max-h-52 overflow-y-auto`}
              >
                {family.fonts.map((f) => (
                  <button
                    key={String(f.id)}
                    type="button"
                    onClick={() => {
                      setSelectedFontId(f.id);
                      setShowWeightMenu(false);
                    }}
                    className={`w-full px-2.5 py-1.5 text-left rtl:text-right flex items-center justify-between transition cursor-pointer ${
                      selectedFont.id === f.id
                        ? "bg-[var(--color-action)]/15 text-[var(--color-action)] font-bold"
                        : "text-[var(--color-text-header)] hover:bg-[var(--color-control)]"
                    }`}
                  >
                    <span className="truncate">
                      {formatFontStyleName(
                        String(f.style || f.subfamily || "Regular"),
                        isRtl,
                      )}
                    </span>
                    {Boolean(f.isActive || (f as any).active) && (
                      <span className="text-[var(--color-green)] text-[10px] font-mono shrink-0">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span className="h-7 px-2 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] text-[11px] font-mono text-[var(--color-text-muted)] inline-flex items-center truncate max-w-[130px]">
            {formatFontStyleName(selectedFont.style || "Regular", isRtl)}
          </span>
        )}

        {/* 1-Click Activation Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isSelectedSystem ? (
            <span
              className="h-7 px-2.5 rounded-lg bg-[var(--color-action)]/10 text-[var(--color-action)] border border-[var(--color-action)]/25 text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap"
              title={
                isRtl
                  ? "مثبت في ويندوز (مفعّل دائماً في النظام)"
                  : "Installed in Windows (Always Active in OS)"
              }
            >
              <span>{isRtl ? "مثبت في ويندوز" : "OS Installed"}</span>
            </span>
          ) : isSelectedLocal ? (
            <>
              <button
                onClick={handleToggleSelectedWeight}
                className={`h-7 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer whitespace-nowrap border ${
                  isSelectedActive
                    ? "bg-[var(--color-green)]/15 text-[var(--color-green)] border-[var(--color-green)]/35 hover:bg-[var(--color-green)]/25"
                    : "bg-[var(--color-control)] text-[var(--color-text-header)] border-[var(--color-border)] hover:border-[var(--color-action)] hover:text-[var(--color-action)]"
                }`}
                title={
                  isSelectedActive
                    ? isRtl
                      ? "إلغاء تفعيل هذا الوزن من الرام"
                      : "Deactivate selected weight"
                    : isRtl
                      ? "تفعيل هذا الوزن في الرام"
                      : "Activate selected weight in RAM"
                }
              >
                <Zap
                  className={`w-3 h-3 shrink-0 ${isSelectedActive ? "fill-current" : ""}`}
                />
                <span>
                  {isSelectedActive
                    ? isRtl
                      ? "مفعّل"
                      : "Active"
                    : isRtl
                      ? "تفعيل"
                      : "Activate"}
                </span>
              </button>

              {family.fonts && family.fonts.length > 1 && (
                <button
                  onClick={handleToggleFamilyActive}
                  className={`h-7 px-2 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap border ${
                    isAllWeightsActive
                      ? "bg-[var(--color-action)]/15 text-[var(--color-action)] border-[var(--color-action)]/35"
                      : "bg-[var(--color-control)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text-header)] hover:border-[var(--color-action)]"
                  }`}
                  title={
                    isAllWeightsActive
                      ? isRtl
                        ? "إلغاء تفعيل العائلة بالكامل"
                        : "Deactivate entire family"
                      : isRtl
                        ? "تفعيل كافة أوزان العائلة بنقرة واحدة"
                        : "Activate entire family in 1 click"
                  }
                >
                  <Layers className="w-3 h-3 shrink-0" />
                  <span>
                    {isAllWeightsActive
                      ? isRtl
                        ? "الكل ✓"
                        : "All ✓"
                      : isRtl
                        ? "الكل"
                        : "All"}
                  </span>
                </button>
              )}
            </>
          ) : (
            <button
              onClick={handleOpenCloudPack}
              className="h-7 px-2.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              title={
                isRtl
                  ? "متاح في السحابة - اضغط لتحميل الحزمة"
                  : "Available in Cloud - Download Pack"
              }
            >
              <Cloud className="w-3.5 h-3.5 shrink-0" />
              <span>{isRtl ? "تحميل الحزمة" : "Download"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
