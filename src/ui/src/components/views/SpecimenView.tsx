import React, { useEffect, useState } from "react";
import { translations } from "../../i18n/locales";
import FontPicker from "./FontPicker";
import {
  QUICK_GOOGLE_FONTS,
  getFontFamilyCss,
  getSmartAlphabet,
  getSmartDirection,
  getSmartParagraph,
  getSmartSpecimenText,
  loadFontForPreview,
} from "./viewUtils";

export default function SpecimenView({
  font,
  fonts = [],
  previewText,
  isRtl = false,
  t,
}: any) {
  const [selectedFont, setSelectedFont] = useState<any>(
    font || fonts[0] || QUICK_GOOGLE_FONTS[0],
  );
  const [loaded, setLoaded] = useState(false);
  const safeT = t || translations.en;

  useEffect(() => {
    if (font) {
      setSelectedFont(font);
    } else if (!selectedFont && fonts.length > 0) {
      setSelectedFont(fonts[0]);
    }
  }, [font?.id, fonts.length]);

  const activeFont = selectedFont || font || fonts[0] || QUICK_GOOGLE_FONTS[0];

  useEffect(() => {
    if (!activeFont) return;
    setLoaded(false);
    loadFontForPreview(activeFont).finally(() => setLoaded(true));
  }, [activeFont?.id]);

  const specimenDirection = getSmartDirection(activeFont, isRtl);
  const fontFamilyStyle: React.CSSProperties = {
    fontFamily: getFontFamilyCss(activeFont),
    direction: specimenDirection,
  };

  const displaySample = getSmartSpecimenText(activeFont, previewText, isRtl);
  const alphabetSample = getSmartAlphabet(activeFont, isRtl);
  const paragraphSample = getSmartParagraph(activeFont, isRtl);

  return (
    <div
      className="flex-1 overflow-y-auto p-8 space-y-10 bg-[var(--color-back-main)] text-[var(--color-text-main)] transition-colors"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Specimen Header */}
      <div className="border-b border-[var(--color-border)] pb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="text-[11px] uppercase tracking-widest text-[var(--color-green)] font-mono font-semibold">
            {safeT.specimenHeading ||
              (isRtl ? "ورقة العينات التيبوجرافية" : "Typographic Specimen")}
          </span>
          <h1
            className="text-3xl font-extrabold mt-1 tracking-tight text-[var(--color-text-header)]"
            style={fontFamilyStyle}
          >
            {activeFont.family || activeFont.name}
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 font-mono">
            {activeFont.style || "Regular"} •{" "}
            {activeFont.format || (activeFont.isGoogleFont ? "WOFF2" : "TTF")} •{" "}
            {activeFont.glyphCount || 340} {isRtl ? "محرف" : "Glyphs"} •{" "}
            {activeFont.category || "Sans-Serif"}
            {!loaded ? (isRtl ? " • جاري التحميل..." : " • Loading...") : ""}
          </p>
        </div>

        {!font && (
          <FontPicker
            fonts={fonts}
            selectedFont={activeFont}
            onSelectFont={setSelectedFont}
            isRtl={isRtl}
          />
        )}
      </div>

      {/* Large Display Title */}
      <div className="space-y-2">
        <span className="text-[11px] font-mono text-[var(--color-text-muted)] block">
          {isRtl ? "عنوان العرض 64pt" : "DISPLAY 64PT"}
        </span>
        <div
          className="text-5xl font-normal leading-tight break-words text-[var(--color-text-header)]"
          style={fontFamilyStyle}
        >
          {displaySample}
        </div>
      </div>

      {/* Alphabet Pangrams */}
      <div className="space-y-3 border-t border-[var(--color-border)] pt-6">
        <span className="text-[11px] font-mono text-[var(--color-text-muted)] block">
          {isRtl
            ? "مجموعة الحروف الأبجدية والأرقام"
            : "CHARACTER SET & ALPHABET"}
        </span>
        <div
          className="text-xl tracking-widest leading-relaxed break-words bg-[var(--color-back-card)] p-5 rounded-xl border border-[var(--color-border)] text-[var(--color-text-main)] shadow-xs"
          style={fontFamilyStyle}
        >
          {alphabetSample}
        </div>
        <div
          className="text-xl font-mono tracking-widest leading-relaxed bg-[var(--color-back-card)] p-4 rounded-xl border border-[var(--color-border)] text-[var(--color-text-main)] shadow-xs"
          style={fontFamilyStyle}
        >
          {safeT.specimenNumbers || "0 1 2 3 4 5 6 7 8 9 & ! ? @ # $ % *"}
        </div>
      </div>

      {/* Editorial Body Text */}
      <div className="space-y-3 border-t border-[var(--color-border)] pt-6">
        <span className="text-[11px] font-mono text-[var(--color-text-muted)] block">
          {isRtl ? "نص المقال التحريري 18pt" : "EDITORIAL BODY PARAGRAPH 18PT"}
        </span>
        <p
          className="text-base leading-relaxed text-[var(--color-text-main)]"
          style={fontFamilyStyle}
        >
          {paragraphSample}
        </p>
      </div>
    </div>
  );
}
