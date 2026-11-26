import React, { useState, useEffect } from "react";
import {
  Star,
  Eye,
  Columns2,
  Cloud,
  Trash2,
  FolderPlus,
  Code,
  Check,
  Download,
  Monitor,
  Package,
  Globe,
  FolderOpen,
  Zap,
} from "lucide-react";
import { FontItem } from "../../types/font";
import { getSmartSpecimenText, getSmartDirection } from "../views/viewUtils";

export interface FontCardProps {
  font: FontItem;
  previewText: string;
  fontSize: number;
  lineHeight?: number | string;
  letterSpacing?: number | string;
  textAlign?: "left" | "center" | "right" | "justify";
  isRtl?: boolean;
  textColor?: string;
  viewMode?: "list" | "grid" | "compact" | "editorial" | "family" | string;
  onToggleActive: (id: string | number, currentStatus?: boolean) => void;
  onToggleFavorite: (id: string | number) => void;
  onOpenDetails: (font: FontItem) => void;
  onToggleCompare: (font: FontItem) => void;
  onDeleteFont?: (font: FontItem) => void;
  onAddToCollection?: (collectionName: string, fontId: string | number) => void;
  collections?: Record<string, string[]>;
  isCompared?: boolean;
  onOpenPack?: (font?: FontItem) => void;
}

const FontCard = React.memo(function FontCard({
  font,
  previewText,
  fontSize,
  lineHeight,
  letterSpacing,
  textAlign,
  isRtl,
  textColor,
  viewMode,
  onToggleActive,
  onToggleFavorite,
  onOpenDetails,
  onToggleCompare,
  onDeleteFont,
  onAddToCollection,
  collections = {},
  isCompared,
  onOpenPack,
}: FontCardProps) {
  const [, setIsLoaded] = useState(false);
  const [copiedCss, setCopiedCss] = useState(false);
  const [showCollectionMenu, setShowCollectionMenu] = useState(false);
  const [addedCollectionToast, setAddedCollectionToast] = useState<
    string | null
  >(null);
  const [downloadingDisk, setDownloadingDisk] = useState(false);
  const [diskSavedToast, setDiskSavedToast] = useState(false);

  const handleDownloadToDisk = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingDisk(true);
    try {
      const res = await fetch("/api/fonts/download-to-disk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fontId: font.id,
          family: font.family || font.name,
          style: font.style,
        }),
      });
      if (res.ok) {
        setDiskSavedToast(true);
        setTimeout(() => setDiskSavedToast(false), 2500);
      }
    } catch {
      // ignore
    } finally {
      setDownloadingDisk(false);
    }
  };

  const fontFamilyName = `Fontivo_${font.id}`;
  const isActive = Boolean(font.isActive || font.active);
  const isFav = Boolean(font.isFavorite || font.favorite);

  const isLocal =
    font.isLocal !== undefined
      ? Boolean(font.isLocal)
      : font.isDownloaded !== undefined
        ? Boolean(font.isDownloaded)
        : font.isCloud !== undefined
          ? !Boolean(font.isCloud)
          : font.path
            ? !font.path.startsWith("cloud://") &&
              !font.path.startsWith("http://") &&
              !font.path.startsWith("https://")
            : true;

  const pathLower = String(font.path || "").toLowerCase();
  const sourceLower = String(font.source || "").toLowerCase();
  const subCatLower = String(font.subCategory || "").toLowerCase();
  const catLower = String(font.category || "").toLowerCase();
  const isSystemFont =
    sourceLower === "system" ||
    String(font.provider || "").toLowerCase() === "system" ||
    pathLower.includes("windows\\fonts") ||
    pathLower.includes("windows/fonts");

  const sourceBadge = (() => {
    if (
      sourceLower === "system" ||
      pathLower.includes("windows\\fonts") ||
      pathLower.includes("windows/fonts") ||
      subCatLower.includes("system")
    ) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[9px] bg-[#B7A1D9]/15 text-[#B7A1D9] border border-[#B7A1D9]/30 whitespace-nowrap shrink-0 shadow-2xs">
          <Monitor className="w-2.5 h-2.5 shrink-0" />
          <span>{isRtl ? "مثبت بويندوز" : "Windows"}</span>
        </span>
      );
    }
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
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[9px] bg-sky-500/15 text-sky-400 border border-sky-500/30 whitespace-nowrap shrink-0 shadow-2xs">
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
    if (
      sourceLower === "cloud" ||
      pathLower.includes("extracted") ||
      pathLower.includes("pack") ||
      subCatLower.includes("pack") ||
      subCatLower.includes("cloud")
    ) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap shrink-0 shadow-2xs">
          <Package className="w-2.5 h-2.5 shrink-0" />
          <span>{isRtl ? "حزمة التوسعة" : "Cloud Pack"}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap shrink-0 shadow-2xs">
        <FolderOpen className="w-2.5 h-2.5 shrink-0" />
        <span>{isRtl ? "خط محلي خاص" : "Custom Local"}</span>
      </span>
    );
  })();

  const handleOpenCloudPack = () => {
    if (onOpenPack) {
      onOpenPack(font);
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("fontivo:open-github-pack", { detail: { font } }),
      );
    }
  };

  const handleCopyCss = (e: React.MouseEvent) => {
    e.stopPropagation();
    const fam = font.family || font.name || "sans-serif";
    const cssSnippet = `font-family: '${fam}', sans-serif;`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(cssSnippet).catch(() => {});
    }
    setCopiedCss(true);
    setTimeout(() => setCopiedCss(false), 1800);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDeleteFont) {
      onDeleteFont(font);
    }
  };

  const handleSelectCollection = (e: React.MouseEvent, cName: string) => {
    e.stopPropagation();
    if (onAddToCollection) {
      onAddToCollection(cName, font.id);
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

  useEffect(() => {
    if (!font.id || typeof document === "undefined") return;

    const isGoogleCloud =
      !isLocal &&
      (font.provider === "google" || String(font.id).startsWith("gf:"));
    if (isGoogleCloud) {
      const fam = font.family || font.name;
      if (fam) {
        const linkId = `fontivo-gf-${fam.replace(/[^a-zA-Z0-9]/g, "-")}`;
        if (!document.getElementById(linkId) && document.head) {
          const link = document.createElement("link");
          link.id = linkId;
          link.rel = "stylesheet";
          link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam)}:wght@300;400;500;600;700;800;900&display=swap`;
          document.head.appendChild(link);
        }
      }
      setIsLoaded(true);
      return;
    }

    const fontUrl = `/api/font-file/${encodeURIComponent(String(font.id))}`;
    const styleId = `fontivo-face-${String(font.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    if (!document.getElementById(styleId) && document.head) {
      const styleEl = document.createElement("style");
      styleEl.id = styleId;
      styleEl.textContent = `@font-face { font-family: "${fontFamilyName}"; src: url("${fontUrl}"); font-display: swap; }`;
      document.head.appendChild(styleEl);
    }

    if (!document.fonts || typeof FontFace === "undefined") {
      setIsLoaded(true);
      return;
    }
    if (
      typeof document.fonts.check === "function" &&
      document.fonts.check(`12px "${fontFamilyName}"`)
    ) {
      setIsLoaded(true);
      return;
    }

    const fontFace = new FontFace(fontFamilyName, `url("${fontUrl}")`);
    fontFace
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        setIsLoaded(true);
      })
      .catch(() => {
        setIsLoaded(true);
      });
  }, [font.id, font.family, font.name, font.provider, fontFamilyName, isLocal]);

  const effectivePreviewText = getSmartSpecimenText(font, previewText, isRtl);
  const effectiveDir = getSmartDirection(font, isRtl);

  const styleObj: React.CSSProperties = {
    fontFamily: `"${fontFamilyName}", "${font.family}", sans-serif`,
    fontSize:
      viewMode === "compact" ? `${Math.min(fontSize, 32)}px` : `${fontSize}px`,
    color: textColor || "var(--color-text-header)",
    textAlign: textAlign,
    direction: effectiveDir,
    lineHeight: lineHeight !== undefined ? lineHeight : undefined,
    letterSpacing:
      letterSpacing !== undefined ? `${letterSpacing}px` : undefined,
  };

  const renderActionButtons = (iconSizeClass = "w-3.5 h-3.5") => (
    <div className="flex items-center gap-1 text-[var(--color-text-muted)] relative shrink-0">
      {/* 1. Favorite / Unfavorite (Star icon) */}
      <button
        onClick={(e: any) => {
          e.stopPropagation();
          onToggleFavorite(font.id);
        }}
        className={`h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--color-control)] hover:text-amber-400 transition cursor-pointer shrink-0 ${
          isFav ? "text-amber-400" : ""
        }`}
        title={isRtl ? "المفضلة" : "Favorite / Unfavorite"}
      >
        <Star className={`${iconSizeClass} ${isFav ? "fill-current" : ""}`} />
      </button>

      {/* 2. Copy Font Family / CSS Snippet */}
      <button
        onClick={handleCopyCss}
        className={`h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--color-control)] hover:text-[var(--color-action)] transition cursor-pointer shrink-0 ${
          copiedCss ? "text-[var(--color-green)]" : ""
        }`}
        title={
          isRtl ? "نسخ اسم العائلة / كود CSS" : "Copy Font Family / CSS snippet"
        }
      >
        {copiedCss ? (
          <Check className={iconSizeClass} />
        ) : (
          <Code className={iconSizeClass} />
        )}
      </button>

      {/* 3. Add to Collection / Workspace */}
      <div className="relative shrink-0">
        <button
          onClick={(e: any) => {
            e.stopPropagation();
            setShowCollectionMenu((prev) => !prev);
          }}
          className={`h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--color-control)] hover:text-[var(--color-action)] transition cursor-pointer shrink-0 ${
            addedCollectionToast ? "text-[var(--color-green)]" : ""
          }`}
          title={
            isRtl
              ? "إضافة إلى مجموعة أو مساحة عمل"
              : "Add to Collection / Workspace"
          }
        >
          {addedCollectionToast ? (
            <Check className={iconSizeClass} />
          ) : (
            <FolderPlus className={iconSizeClass} />
          )}
        </button>
        {showCollectionMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`absolute top-full mt-1 ${isRtl ? "left-0" : "right-0"} w-44 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-xl shadow-xl py-1 text-[11px] z-40`}
          >
            <div className="px-2.5 py-1 text-[10px] font-bold text-[var(--color-text-dim)] border-b border-[var(--color-border-subtle)]">
              {isRtl ? "إضافة للمجموعة:" : "Add to Collection:"}
            </div>
            {availableCollections.map((cName) => (
              <button
                key={cName}
                onClick={(e) => handleSelectCollection(e, cName)}
                className="w-full px-2.5 py-1.5 text-left rtl:text-right hover:bg-[var(--color-control)] text-[var(--color-text-header)] truncate block cursor-pointer"
              >
                {cName}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 4. Download / Save Font File to Disk */}
      <button
        onClick={handleDownloadToDisk}
        disabled={downloadingDisk}
        className={`h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--color-control)] hover:text-[var(--color-action)] transition cursor-pointer shrink-0 ${
          diskSavedToast ? "text-[var(--color-green)]" : ""
        }`}
        title={
          isRtl
            ? "حفظ ملف الخط في مجلد التنزيلات"
            : "Save font file to Downloads folder"
        }
      >
        {diskSavedToast ? (
          <Check className={iconSizeClass} />
        ) : (
          <Download
            className={`${iconSizeClass} ${downloadingDisk ? "animate-bounce" : ""}`}
          />
        )}
      </button>

      {/* 5. Compare Font */}
      <button
        onClick={(e: any) => {
          e.stopPropagation();
          onToggleCompare(font);
        }}
        className={`h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--color-control)] hover:text-[var(--color-action)] transition cursor-pointer shrink-0 ${
          isCompared ? "text-[var(--color-action)]" : ""
        }`}
        title={isRtl ? "مقارنة الخط" : "Compare Font"}
      >
        <Columns2 className={iconSizeClass} />
      </button>

      {/* 5. Delete / Remove Font */}
      {isLocal && onDeleteFont && (
        <button
          onClick={handleDelete}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-rose-500/15 hover:text-rose-400 transition cursor-pointer shrink-0"
          title={isRtl ? "حذف / إزالة الخط" : "Delete / Remove Font"}
        >
          <Trash2 className={iconSizeClass} />
        </button>
      )}
    </div>
  );

  // Compact Grid Mode (3-4 columns)
  if (viewMode === "compact") {
    return (
      <div
        onClick={() => onOpenDetails(font)}
        className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-back-card)] hover:border-[var(--color-action)] shadow-xs hover:shadow-md transition-all select-none cursor-pointer flex flex-col justify-between h-full min-h-[168px] min-w-0 group relative"
      >
        <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isSystemFont ? (
              <span
                className="w-3.5 h-3.5 rounded-full bg-[var(--color-action)]/20 border border-[var(--color-action)]/45 inline-flex items-center justify-center shrink-0"
                title={
                  isRtl
                    ? "مثبت في ويندوز (مفعّل دائماً)"
                    : "Installed in Windows (Always Active)"
                }
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-action)]" />
              </span>
            ) : isLocal ? (
              <button
                onClick={(e: any) => {
                  e.stopPropagation();
                  onToggleActive(font.id, isActive);
                }}
                className={`w-3.5 h-3.5 rounded-full border transition cursor-pointer shrink-0 ${
                  isActive
                    ? "bg-[var(--color-green)] border-[var(--color-green)] shadow-[0_0_8px_var(--color-green)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-action)] bg-transparent"
                }`}
                title={
                  isActive
                    ? isRtl
                      ? "إلغاء التفعيل من الرام"
                      : "Deactivate from RAM"
                    : isRtl
                      ? "تفعيل فوري في الرام"
                      : "Activate in RAM"
                }
              />
            ) : (
              <button
                onClick={(e: any) => {
                  e.stopPropagation();
                  handleOpenCloudPack();
                }}
                className="h-7 w-7 flex items-center justify-center rounded-md text-sky-400 hover:text-sky-300 hover:bg-sky-500/15 transition cursor-pointer shrink-0"
                title={
                  isRtl
                    ? "متاح في السحابة - اضغط لتحميل الحزمة"
                    : "Available in Cloud - Download Pack"
                }
              >
                <Cloud className="w-3.5 h-3.5 text-sky-400" />
              </button>
            )}
            <span className="font-semibold text-xs text-[var(--color-text-header)] truncate">
              {(font.displayName as string) || font.name}
            </span>
          </div>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--color-control)] text-[var(--color-text-muted)] whitespace-nowrap shrink-0 font-bold">
            {font.format || "TTF"}
          </span>
        </div>

        <div
          className="flex-1 overflow-hidden flex items-center leading-tight break-words py-1 min-w-0"
          style={styleObj}
        >
          {effectivePreviewText}
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap text-[10px] text-[var(--color-text-muted)] pt-2 border-t border-[var(--color-border)]/50 min-w-0">
          <span className="truncate min-w-0 flex-1">
            {font.family} • {font.style || "Regular"}
          </span>
          {renderActionButtons("w-3.5 h-3.5")}
        </div>
      </div>
    );
  }

  // Balanced Grid Mode (2 columns)
  if (viewMode === "grid") {
    return (
      <div
        onClick={() => onOpenDetails(font)}
        className="p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-back-card)] hover:border-[var(--color-action)] shadow-xs hover:shadow-lg transition-all select-none cursor-pointer flex flex-col justify-between h-full min-h-[172px] min-w-0 group"
      >
        <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {isSystemFont ? (
              <span
                className="w-4 h-4 rounded-full bg-[var(--color-action)]/20 border border-[var(--color-action)]/45 inline-flex items-center justify-center shrink-0"
                title={
                  isRtl
                    ? "مثبت في ويندوز (مفعّل دائماً)"
                    : "Installed in Windows (Always Active)"
                }
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-action)]" />
              </span>
            ) : isLocal ? (
              <button
                onClick={(e: any) => {
                  e.stopPropagation();
                  onToggleActive(font.id, isActive);
                }}
                className={`w-4 h-4 rounded-full border transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? "bg-[var(--color-green)] border-[var(--color-green)] shadow-[0_0_10px_var(--color-green)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-action)] bg-transparent"
                }`}
                title={
                  isActive
                    ? isRtl
                      ? "إلغاء التفعيل من الرام"
                      : "Deactivate from RAM"
                    : isRtl
                      ? "تفعيل فوري في الرام"
                      : "Activate in RAM"
                }
              />
            ) : (
              <button
                onClick={(e: any) => {
                  e.stopPropagation();
                  handleOpenCloudPack();
                }}
                className="h-7 w-7 flex items-center justify-center rounded-md text-sky-400 hover:text-sky-300 hover:bg-sky-500/15 transition cursor-pointer shrink-0"
                title={
                  isRtl
                    ? "متاح في السحابة - اضغط لتحميل الحزمة"
                    : "Available in Cloud - Download Pack"
                }
              >
                <Cloud className="w-4 h-4 text-sky-400" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h4
                className="font-bold text-sm text-[var(--color-text-header)] hover:text-[var(--color-action)] transition truncate min-w-0"
                dir="auto"
              >
                {(font.displayName as string) || font.name}
              </h4>
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)] font-mono min-w-0 mt-0.5 flex-wrap">
                {sourceBadge}
                <span className="truncate">{font.family}</span>
                <span className="shrink-0">•</span>
                <span className="uppercase whitespace-nowrap shrink-0">
                  {font.format || "TTF"}
                </span>
                <span className="shrink-0">•</span>
                <span className="truncate">{font.style || "Regular"}</span>
              </div>
            </div>
          </div>

          {Boolean(font.hasTashkeel) && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[var(--color-green)]/15 text-[var(--color-green)] border border-[var(--color-green)]/25 whitespace-nowrap shrink-0">
              تشكيل ✓
            </span>
          )}
        </div>

        <div
          className="py-2 leading-tight break-words flex-1 min-w-0"
          style={styleObj}
        >
          {effectivePreviewText}
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap pt-2.5 mt-2 border-t border-[var(--color-border)]/50 min-w-0">
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[var(--color-control)] text-[var(--color-text-muted)] whitespace-nowrap shrink-0">
            {isLocal
              ? isActive
                ? isRtl
                  ? "مفعّل"
                  : "Active"
                : isRtl
                  ? "محلي"
                  : "Local"
              : isRtl
                ? "سحابي"
                : "Cloud"}
          </span>
          {renderActionButtons("w-3.5 h-3.5")}
        </div>
      </div>
    );
  }

  // Editorial Wide Strip Mode
  if (viewMode === "editorial") {
    return (
      <div
        onClick={() => onOpenDetails(font)}
        className="p-4 sm:p-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-back-card)] hover:border-[var(--color-action)] shadow-sm hover:shadow-xl transition-all select-none cursor-pointer space-y-4 group min-w-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)]/60 pb-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {isSystemFont ? (
              <span
                className="w-4 h-4 rounded-full bg-[var(--color-action)]/20 border border-[var(--color-action)]/45 inline-flex items-center justify-center shrink-0"
                title={
                  isRtl
                    ? "مثبت في ويندوز (مفعّل دائماً)"
                    : "Installed in Windows (Always Active)"
                }
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-action)]" />
              </span>
            ) : isLocal ? (
              <button
                onClick={(e: any) => {
                  e.stopPropagation();
                  onToggleActive(font.id, isActive);
                }}
                className={`w-4 h-4 rounded-full border transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? "bg-[var(--color-green)] border-[var(--color-green)] shadow-[0_0_10px_var(--color-green)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-action)] bg-transparent"
                }`}
                title={
                  isActive
                    ? isRtl
                      ? "إلغاء التفعيل من الرام"
                      : "Deactivate from RAM"
                    : isRtl
                      ? "تفعيل فوري في الرام"
                      : "Activate in RAM"
                }
              />
            ) : (
              <button
                onClick={(e: any) => {
                  e.stopPropagation();
                  handleOpenCloudPack();
                }}
                className="h-7 w-7 flex items-center justify-center rounded-md text-sky-400 hover:text-sky-300 hover:bg-sky-500/15 transition cursor-pointer shrink-0"
                title={
                  isRtl
                    ? "متاح في السحابة - اضغط لتحميل الحزمة"
                    : "Available in Cloud - Download Pack"
                }
              >
                <Cloud className="w-4 h-4 text-sky-400" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-base text-[var(--color-text-header)] truncate">
                {(font.displayName as string) || font.name}
              </h3>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--color-text-muted)] flex-wrap min-w-0">
                <span className="truncate">
                  {font.family} • {font.style || "Regular"} •{" "}
                  {font.glyphCount || 256} Glyphs
                </span>
                {Boolean(font.hasTashkeel) && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[var(--color-green)]/15 text-[var(--color-green)] border border-[var(--color-green)]/25 whitespace-nowrap shrink-0">
                    تشكيل ✓
                  </span>
                )}
              </div>
            </div>
          </div>

          {renderActionButtons("w-3.5 h-3.5")}
        </div>

        <div className="py-2 leading-snug break-words min-w-0" style={styleObj}>
          {effectivePreviewText}
        </div>
      </div>
    );
  }

  // Classic Horizontal Row
  return (
    <div className="py-3.5 px-4 sm:px-6 border-b border-[var(--color-border)] hover:bg-[var(--color-control)]/60 transition-colors select-none group min-w-0">
      {/* Top Meta Line */}
      <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Availability / Activation Indicator */}
          {isSystemFont ? (
            <span
              className="px-2 py-0.5 rounded-md bg-[var(--color-action)]/10 text-[var(--color-action)] border border-[var(--color-action)]/25 text-[10px] font-bold whitespace-nowrap shrink-0"
              title={
                isRtl
                  ? "مثبت في ويندوز (مفعّل دائماً)"
                  : "Installed in Windows (Always Active)"
              }
            >
              {isRtl ? "مثبت في ويندوز" : "OS Installed"}
            </span>
          ) : isLocal ? (
            <button
              onClick={(e: any) => {
                e.stopPropagation();
                onToggleActive(font.id, isActive);
              }}
              className={`w-3.5 h-3.5 rounded-full border transition-all cursor-pointer shrink-0 ${
                isActive
                  ? "bg-[var(--color-green)] border-[var(--color-green)] shadow-[0_0_8px_var(--color-green)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-action)] bg-transparent"
              }`}
              title={
                isActive
                  ? isRtl
                    ? "إلغاء التفعيل من الرام"
                    : "Deactivate from RAM"
                  : isRtl
                    ? "تفعيل فوري في الرام"
                    : "Activate in RAM"
              }
            />
          ) : (
            <button
              onClick={(e: any) => {
                e.stopPropagation();
                handleOpenCloudPack();
              }}
              className="h-7 w-7 flex items-center justify-center rounded-md text-sky-400 hover:text-sky-300 hover:bg-sky-500/15 transition cursor-pointer shrink-0"
              title={
                isRtl
                  ? "متاح في السحابة - اضغط لتحميل الحزمة"
                  : "Available in Cloud - Download Pack"
              }
            >
              <Cloud className="w-3.5 h-3.5 text-sky-400" />
            </button>
          )}

          <span
            onClick={() => onOpenDetails(font)}
            className="font-semibold text-[13px] text-[var(--color-text-header)] hover:text-[var(--color-action)] cursor-pointer tracking-wide truncate min-w-0"
          >
            {(font.displayName as string) || font.name}
          </span>

          {font.family && (
            <span className="text-[11px] text-[var(--color-text-muted)] hidden sm:inline truncate shrink-0 max-w-[160px]">
              ({font.family})
            </span>
          )}

          <span className="text-[10px] uppercase font-mono text-[var(--color-text-muted)] font-semibold tracking-wider whitespace-nowrap shrink-0">
            {font.format || "TTF"}
          </span>

          <span className="text-[10px] font-mono text-[var(--color-text-muted)] whitespace-nowrap shrink-0">
            {font.style || "Regular"}
          </span>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 text-[var(--color-text-muted)] shrink-0">
          {renderActionButtons("w-3.5 h-3.5")}
          <button
            onClick={() => onOpenDetails(font)}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--color-control)] hover:text-[var(--color-text-header)] transition cursor-pointer shrink-0"
            title={isRtl ? "فحص الخط" : "Inspect"}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Typography Preview */}
      <div
        onClick={() => onOpenDetails(font)}
        className="leading-tight break-words cursor-pointer transition-colors"
        style={styleObj}
      >
        {effectivePreviewText}
      </div>
    </div>
  );
});

export default FontCard;
