import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  SlidersHorizontal,
  Grid3X3,
  Info,
  Check,
  Type,
  Star,
  Trash2,
  FolderPlus,
  Code,
  Zap,
} from "lucide-react";
import SpecimenView from "./SpecimenView";
import WaterfallView from "./WaterfallView";
import GlyphsView from "./GlyphsView";

export default function FamilyInspectorView({
  family,
  onBack,
  previewText,
  isRtl,
  onToggleActive,
  onToggleFavorite,
  onActivateFamily,
  onDeactivateFamily,
  onDeleteFont,
  onAddToCollection,
  collections = {},
  t = {},
}: any) {
  const [subTab, setSubTab] = useState("specimen"); // 'specimen', 'waterfall', 'glyphs', 'info'
  const [selectedFontIndex, setSelectedFontIndex] = useState(0);
  const [copiedCss, setCopiedCss] = useState(false);
  const [showCollectionMenu, setShowCollectionMenu] = useState(false);
  const [addedCollectionToast, setAddedCollectionToast] = useState<
    string | null
  >(null);

  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  // Safely handle family == null or missing/empty fonts array
  if (!family || !Array.isArray(family.fonts) || family.fonts.length === 0) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full min-h-[380px] bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none animate-in fade-in"
        dir={isRtl ? "rtl" : "ltr"}
      >
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-control)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] mb-4 shadow-sm">
          <Type className="w-8 h-8 text-[var(--color-action)]" />
        </div>
        <h3 className="text-base font-bold text-[var(--color-text-header)] mb-2">
          {isRtl
            ? "اختر عائلة لعرض مواصفاتها"
            : "Select a Font Family to Inspect"}
        </h3>
        <p className="text-xs text-[var(--color-text-muted)] max-w-sm mb-6 leading-relaxed">
          {isRtl
            ? "لم يتم تحديد عائلة خطوط بعد أو أن العائلة المحددة لا تحتوي على أي أوزان. يرجى اختيار خط أو عائلة من المكتبة لعرض تفاصيلها."
            : "No font family is currently selected or the selected family contains no font styles. Please choose a font family from your library to inspect its metrics."}
        </p>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-semibold shadow-xs transition cursor-pointer"
        >
          <BackIcon className="w-4 h-4" />
          <span>
            {t.backToFonts ||
              (isRtl ? "العودة لقائمة الخطوط" : "Back to fonts")}
          </span>
        </button>
      </div>
    );
  }

  const activeFont = family.fonts[selectedFontIndex] || family.fonts[0] || {};
  const isFamilyActive = Boolean(
    family.isAllActive ||
    family.isActive ||
    family.fonts.some((f: any) => f.isActive || f.active),
  );
  const isActiveFontFav = Boolean(
    activeFont.isFavorite || activeFont.favorite || family.isFavorite,
  );

  const handleMasterToggle = (e: any) => {
    e.stopPropagation();
    if (isFamilyActive) {
      if (onDeactivateFamily) onDeactivateFamily(family.family);
      else if (onToggleActive && activeFont.id)
        onToggleActive(activeFont.id, true);
    } else {
      if (onActivateFamily) onActivateFamily(family.family);
      else if (onToggleActive && activeFont.id)
        onToggleActive(activeFont.id, false);
    }
  };

  const handleCopyCss = () => {
    const css = `@font-face {
  font-family: '${family.family}';
  src: url('/api/font-file/${activeFont.id}') format('${(activeFont.format || "ttf").toLowerCase()}');
}
/* Usage: font-family: '${family.family}', sans-serif; */`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(css).catch(() => {});
    }
    setCopiedCss(true);
    setTimeout(() => setCopiedCss(false), 1800);
  };

  const handleSelectCollection = (cName: string) => {
    if (onAddToCollection && activeFont.id !== undefined) {
      onAddToCollection(cName, activeFont.id);
    }
    setShowCollectionMenu(false);
    setAddedCollectionToast(cName);
    setTimeout(() => setAddedCollectionToast(null), 1600);
  };

  const handleDelete = async () => {
    if (onDeleteFont) {
      const deleted = await onDeleteFont(activeFont);
      if (deleted && onBack) onBack();
    }
  };

  const collectionNames = Object.keys(collections || {});
  const availableCollections =
    collectionNames.length > 0
      ? collectionNames
      : ["Branding & Identity", "Web & UI Typography", "Headlines & Posters"];

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Top Navigation & Family Info Bar */}
      <div className="p-4 sm:px-6 border-b border-[var(--color-border)] bg-[var(--color-back-header)] flex flex-col gap-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Back button */}
          <button
            onClick={onBack}
            className="h-8 flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] transition cursor-pointer px-2.5 rounded-lg hover:bg-[var(--color-control)] whitespace-nowrap shrink-0"
          >
            <BackIcon className="w-3.5 h-3.5 shrink-0" />
            <span>
              {t.backToFonts ||
                (isRtl ? "العودة لقائمة الخطوط" : "Back to fonts")}
            </span>
          </button>

          {/* Sub-tabs: Specimen | Waterfall | Glyphs | Info */}
          <div className="flex items-center gap-1 bg-[var(--color-control)] p-1 rounded-xl border border-[var(--color-border)] text-xs overflow-x-auto no-scrollbar">
            <button
              onClick={() => setSubTab("specimen")}
              className={`h-7 flex items-center gap-1.5 px-3 rounded-lg transition cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === "specimen"
                  ? "bg-[var(--color-back-card)] text-[var(--color-text-header)] font-semibold shadow-xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>{t.viewSpecimen || "Specimen"}</span>
            </button>
            <button
              onClick={() => setSubTab("waterfall")}
              className={`h-7 flex items-center gap-1.5 px-3 rounded-lg transition cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === "waterfall"
                  ? "bg-[var(--color-back-card)] text-[var(--color-text-header)] font-semibold shadow-xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span>{t.viewWaterfall || "Waterfall"}</span>
            </button>
            <button
              onClick={() => setSubTab("glyphs")}
              className={`h-7 flex items-center gap-1.5 px-3 rounded-lg transition cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === "glyphs"
                  ? "bg-[var(--color-back-card)] text-[var(--color-text-header)] font-semibold shadow-xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5 shrink-0" />
              <span>{t.viewGlyphs || "Glyphs"}</span>
            </button>
            <button
              onClick={() => setSubTab("info")}
              className={`h-7 flex items-center gap-1.5 px-3 rounded-lg transition cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === "info"
                  ? "bg-[var(--color-back-card)] text-[var(--color-text-header)] font-semibold shadow-xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
            >
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t.fontFamilyMetadata || (isRtl ? "المواصفات" : "Info")}
              </span>
            </button>
          </div>
        </div>

        {/* Family Name & Complete Actions Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={handleMasterToggle}
              className={`w-4 h-4 rounded-full border transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                isFamilyActive
                  ? "bg-[var(--color-green)] border-[var(--color-green)] shadow-[0_0_8px_var(--color-green)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-text-muted)] bg-transparent"
              }`}
              title={
                isFamilyActive
                  ? t.deactivateAll || "Deactivate"
                  : t.activateAll || "Activate"
              }
            />

            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-text-header)] flex items-center gap-2 min-w-0">
                <span className="truncate">{family.family}</span>
                <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-muted)] whitespace-nowrap shrink-0">
                  {activeFont.format || "TTF"}
                </span>
                <span className="text-xs font-mono text-[var(--color-text-muted)] font-normal whitespace-nowrap shrink-0">
                  {family.count}{" "}
                  {isRtl ? "أوزان" : family.count === 1 ? "style" : "styles"}
                </span>
              </h1>
            </div>
          </div>

          {/* Complete Action Bar + Weight Selector */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* 1. RAM Toggle Button */}
            <button
              onClick={handleMasterToggle}
              className={`h-8 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer whitespace-nowrap shrink-0 ${
                isFamilyActive
                  ? "bg-[var(--color-green)]/15 text-[var(--color-green)] border-[var(--color-green)]/30"
                  : "bg-[var(--color-control)] text-[var(--color-text-header)] border-[var(--color-border)] hover:border-[var(--color-action)]"
              }`}
            >
              <Zap className="w-3.5 h-3.5 fill-current shrink-0" />
              <span>
                {isFamilyActive
                  ? isRtl
                    ? "مفعل بالرام ✓"
                    : "Active in RAM ✓"
                  : isRtl
                    ? "تفعيل بالرام"
                    : "Activate RAM"}
              </span>
            </button>

            {/* 2. Favorite (Star) */}
            {onToggleFavorite && (
              <button
                onClick={() => onToggleFavorite(activeFont)}
                className={`h-8 w-8 flex items-center justify-center rounded-xl border transition cursor-pointer shrink-0 ${
                  isActiveFontFav
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    : "bg-[var(--color-control)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-amber-400"
                }`}
                title={
                  isRtl ? "إضافة أو إزالة من المفضلة" : "Favorite / Unfavorite"
                }
              >
                <Star
                  className={`w-3.5 h-3.5 ${isActiveFontFav ? "fill-current" : ""}`}
                />
              </button>
            )}

            {/* 3. Copy CSS Snippet */}
            <button
              onClick={handleCopyCss}
              className="h-8 px-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-header)] flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
              title={isRtl ? "نسخ كود CSS" : "Copy CSS Snippet"}
            >
              {copiedCss ? (
                <Check className="w-3.5 h-3.5 text-[var(--color-green)] shrink-0" />
              ) : (
                <Code className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
              )}
              <span>
                {copiedCss ? (isRtl ? "تم النسخ ✓" : "Copied CSS ✓") : "CSS"}
              </span>
            </button>

            {/* 4. Add to Collection */}
            <div className="relative shrink-0">
              <button
                onClick={() => setShowCollectionMenu((prev) => !prev)}
                className="h-8 px-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-header)] flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                title={isRtl ? "إضافة إلى مجموعة" : "Add to Collection"}
              >
                {addedCollectionToast ? (
                  <Check className="w-3.5 h-3.5 text-[var(--color-green)] shrink-0" />
                ) : (
                  <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {addedCollectionToast || (isRtl ? "للمجموعة" : "Collection")}
                </span>
              </button>
              {showCollectionMenu && (
                <div
                  className={`absolute top-full mt-1 ${isRtl ? "left-0" : "right-0"} w-44 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-xl shadow-xl py-1 text-xs z-40`}
                >
                  {availableCollections.map((cName) => (
                    <button
                      key={cName}
                      onClick={() => handleSelectCollection(cName)}
                      className="w-full px-3 py-1.5 text-left rtl:text-right hover:bg-[var(--color-control)] text-[var(--color-text-header)] truncate block cursor-pointer"
                    >
                      {cName}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 5. Delete / Remove Font */}
            {onDeleteFont && (
              <button
                onClick={handleDelete}
                className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/25 transition cursor-pointer"
                title={isRtl ? "حذف / إزالة الخط" : "Delete / Remove Font"}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Weight selector */}
            {family.fonts.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[var(--color-text-muted)]">
                  {isRtl ? "الوزن:" : "Weight:"}
                </span>
                <select
                  value={selectedFontIndex}
                  onChange={(e: any) =>
                    setSelectedFontIndex(Number(e.target.value))
                  }
                  className="bg-[var(--color-control)] border border-[var(--color-border)] rounded-xl px-2.5 py-1.5 text-xs text-[var(--color-text-header)] outline-none cursor-pointer"
                >
                  {family.fonts.map((f: any, i: number) => (
                    <option
                      key={f.id}
                      value={i}
                      className="bg-[var(--color-back-card)] text-[var(--color-text-main)]"
                    >
                      {f.style || "Regular"}{" "}
                      {f.isActive || f.active
                        ? isRtl
                          ? "● نشط"
                          : "● Active"
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Sub-Tab Content View */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {subTab === "specimen" ? (
          <SpecimenView
            font={activeFont}
            previewText={previewText}
            isRtl={isRtl}
            t={t}
          />
        ) : subTab === "waterfall" ? (
          <WaterfallView
            font={activeFont}
            previewText={previewText}
            isRtl={isRtl}
            t={t}
          />
        ) : subTab === "glyphs" ? (
          <GlyphsView font={activeFont} t={t} isRtl={isRtl} />
        ) : subTab === "info" ? (
          <div className="flex-1 overflow-y-auto p-8 space-y-6 max-w-3xl text-xs">
            <h2 className="text-base font-bold text-[var(--color-text-header)] mb-4">
              {t.fontFamilyMetadata ||
                (isRtl
                  ? "بيانات عائلة الخط والمواصفات الفنية"
                  : "Font Family Metadata & Metrics")}
            </h2>
            <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl divide-y divide-[var(--color-border-subtle)] shadow-xs">
              <div className="p-3.5 flex justify-between">
                <span className="text-[var(--color-text-muted)]">
                  {isRtl ? "اسم العائلة" : "Family Name"}
                </span>
                <span className="font-mono text-[var(--color-text-header)] font-semibold">
                  {family.family}
                </span>
              </div>
              <div className="p-3.5 flex justify-between">
                <span className="text-[var(--color-text-muted)]">
                  {isRtl ? "النمط والتنسيق" : "Style / Variant"}
                </span>
                <span className="font-mono text-[var(--color-text-header)]">
                  {activeFont.style || "Regular"}
                </span>
              </div>
              <div className="p-3.5 flex justify-between">
                <span className="text-[var(--color-text-muted)]">
                  {isRtl ? "صيغة الملف" : "Format"}
                </span>
                <span className="font-mono text-[var(--color-text-header)] uppercase">
                  {activeFont.format}
                </span>
              </div>
              <div className="p-3.5 flex justify-between">
                <span className="text-[var(--color-text-muted)]">
                  {isRtl ? "إجمالي المحارف والرموز" : "Total Glyphs"}
                </span>
                <span className="font-mono text-[var(--color-text-header)]">
                  {activeFont.glyphCount || 340}
                </span>
              </div>
              <div className="p-3.5 flex justify-between">
                <span className="text-[var(--color-text-muted)]">
                  {isRtl ? "التصنيف" : "Category"}
                </span>
                <span className="font-mono text-[var(--color-text-header)]">
                  {activeFont.category || "General"}
                </span>
              </div>
              <div className="p-3.5 flex justify-between">
                <span className="text-[var(--color-text-muted)]">
                  {isRtl ? "مسار الملف على القرص" : "File Path"}
                </span>
                <span
                  className="font-mono text-[var(--color-text-muted)] truncate max-w-md"
                  title={activeFont.path}
                >
                  {activeFont.path}
                </span>
              </div>
              <div className="p-3.5 flex justify-between">
                <span className="text-[var(--color-text-muted)]">
                  {isRtl ? "حالة الترخيص" : "License Status"}
                </span>
                <span className="text-[var(--color-green)] font-semibold">
                  {isRtl
                    ? "مجاني للاستخدام التجاري والشخصي"
                    : "Free for Personal & Commercial Use"}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
