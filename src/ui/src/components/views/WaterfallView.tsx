import React, { useEffect, useState } from "react";
import { translations } from "../../i18n/locales";
import FontPicker from "./FontPicker";
import {
  QUICK_GOOGLE_FONTS,
  getFontFamilyCss,
  getSmartDirection,
  getSmartSpecimenText,
  loadFontForPreview,
} from "./viewUtils";

const SIZES = [72, 60, 48, 36, 28, 24, 20, 16, 14, 12];

export default function WaterfallView({
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

  const sample = getSmartSpecimenText(activeFont, previewText, isRtl);
  const fontFamilyCss = getFontFamilyCss(activeFont);
  const specimenDirection = getSmartDirection(activeFont, isRtl);

  return (
    <div
      className="flex-1 overflow-y-auto p-8 space-y-6 bg-[var(--color-back-main)] text-[var(--color-text-main)] transition-colors"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="border-b border-[var(--color-border)] pb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-[var(--color-text-header)] font-sans truncate">
            {activeFont.displayName || activeFont.family || activeFont.name}
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {activeFont.family || activeFont.name} •{" "}
            {activeFont.style || "Regular"} •{" "}
            {activeFont.format || (activeFont.isGoogleFont ? "WOFF2" : "TTF")} •{" "}
            {safeT.waterfallHeading ||
              (isRtl ? "معاينة شلال الأحجام" : "Waterfall Preview")}
            {!loaded ? (isRtl ? " • جاري التحميل..." : " • Loading...") : ""}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {!font && (
            <FontPicker
              fonts={fonts}
              selectedFont={activeFont}
              onSelectFont={setSelectedFont}
              isRtl={isRtl}
            />
          )}
          <span className="px-3 py-1 rounded-full bg-[var(--color-green)]/10 text-[var(--color-green)] text-xs font-mono font-semibold border border-[var(--color-green)]/20">
            {isRtl ? "نمط الشلال" : "Waterfall Mode"}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {SIZES.map((size) => (
          <div
            key={size}
            className="flex items-baseline gap-6 border-b border-[var(--color-border-subtle)] pb-3 group"
          >
            <span className="w-16 shrink-0 text-xs font-mono text-[var(--color-text-muted)] ltr:text-right rtl:text-left group-hover:text-[var(--color-text-header)] transition">
              {size} pt
            </span>
            <div
              className="flex-1 overflow-x-hidden text-ellipsis whitespace-nowrap leading-tight transition-all text-[var(--color-text-header)]"
              style={{
                fontFamily: fontFamilyCss,
                fontSize: `${size}px`,
                direction: specimenDirection,
              }}
            >
              {sample}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
