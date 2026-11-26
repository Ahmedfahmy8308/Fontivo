import React, { useState, useEffect } from "react";
import { Check, Search, ZoomIn, ZoomOut } from "lucide-react";
import { translations } from "../../i18n/locales";
import FontPicker from "./FontPicker";
import {
  QUICK_GOOGLE_FONTS,
  detectFontScript,
  getFontFamilyCss,
  loadFontForPreview,
} from "./viewUtils";

function buildFallbackGlyphs(fontObj: any) {
  const fallback: any[] = [];
  for (let i = 33; i < 127; i++) {
    fallback.push({ index: i, char: String.fromCharCode(i) });
  }
  const script = detectFontScript(fontObj);
  if (script === "arabic" || script === "bilingual") {
    for (let i = 0x0621; i <= 0x064a; i++) {
      fallback.push({ index: i, char: String.fromCharCode(i) });
    }
    for (let i = 0x0660; i <= 0x0669; i++) {
      fallback.push({ index: i, char: String.fromCharCode(i) });
    }
  }
  return fallback;
}

export default function GlyphsView({
  font,
  fonts = [],
  t,
  isRtl = false,
}: any) {
  const [selectedFont, setSelectedFont] = useState<any>(
    font || fonts[0] || QUICK_GOOGLE_FONTS[0],
  );
  const [glyphs, setGlyphs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedChar, setCopiedChar] = useState<any>(null);
  const [glyphSize, setGlyphSize] = useState(36);
  const [search, setSearch] = useState("");
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
    loadFontForPreview(activeFont);

    if (
      activeFont.isGoogleFont ||
      String(activeFont.id || "").startsWith("gf:")
    ) {
      setGlyphs(buildFallbackGlyphs(activeFont));
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`/api/font-glyphs/${activeFont.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.glyphs && data.glyphs.length > 0) {
          setGlyphs(data.glyphs);
        } else {
          setGlyphs(buildFallbackGlyphs(activeFont));
        }
      })
      .catch(() => {
        setGlyphs(buildFallbackGlyphs(activeFont));
      })
      .finally(() => setLoading(false));
  }, [activeFont?.id]);

  const handleCopy = (char: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(char).catch(() => {});
    }
    setCopiedChar(char);
    setTimeout(() => setCopiedChar(null), 1500);
  };

  const filteredGlyphs = glyphs.filter((g) => {
    if (!search.trim()) return true;
    const hex = "U+" + g.index.toString(16).toUpperCase().padStart(4, "0");
    return g.char.includes(search) || hex.includes(search.toUpperCase());
  });

  const fontFam = getFontFamilyCss(activeFont);

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden bg-[var(--color-back-main)] text-[var(--color-text-main)] transition-colors"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header controls */}
      <div className="p-4 px-6 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-4 bg-[var(--color-back-header)]">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div>
            <h2 className="text-base font-bold text-[var(--color-text-header)] truncate">
              {activeFont.displayName || activeFont.family || activeFont.name}
            </h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {glyphs.length} {safeT.glyphs || (isRtl ? "محرف ورمز" : "glyphs")}{" "}
              • {activeFont.family || activeFont.name}
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

        <div className="flex items-center gap-3">
          {/* Search Glyph */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute ltr:left-2.5 rtl:right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder={
                isRtl
                  ? "بحث بالمحرف أو U+0041..."
                  : "Search by char or U+0041..."
              }
              value={search}
              onChange={(e: any) => setSearch(e.target.value)}
              className="bg-[var(--color-control)] border border-[var(--color-border)] rounded-lg ltr:pl-8 rtl:pr-8 px-3 py-1.5 text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-action)] w-48"
            />
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-[var(--color-control)] border border-[var(--color-border)] rounded-lg p-1">
            <button
              onClick={() => setGlyphSize(Math.max(20, glyphSize - 8))}
              className="p-1 hover:bg-[var(--color-control-hover)] rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] cursor-pointer"
              title={isRtl ? "تصغير" : "Zoom out"}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono px-1.5 text-[var(--color-text-muted)]">
              {glyphSize}px
            </span>
            <button
              onClick={() => setGlyphSize(Math.min(80, glyphSize + 8))}
              className="p-1 hover:bg-[var(--color-control-hover)] rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] cursor-pointer"
              title={isRtl ? "تكبير" : "Zoom in"}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Glyphs */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-[var(--color-text-muted)] text-xs">
            {isRtl ? "جاري استخراج الرموز والمحارف..." : "Loading glyphs..."}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(54px,1fr))] gap-2">
            {filteredGlyphs.map((glyph, index) => {
              const hex =
                "U+" + glyph.index.toString(16).toUpperCase().padStart(4, "0");
              const isCopied = copiedChar === glyph.char;
              return (
                <button
                  key={index}
                  onClick={() => handleCopy(glyph.char)}
                  className={`aspect-square flex flex-col items-center justify-center p-1 rounded-xl border transition-all cursor-pointer relative group ${
                    isCopied
                      ? "bg-[var(--color-green)]/20 border-[var(--color-green)] text-[var(--color-green)]"
                      : "bg-[var(--color-back-card)] border-[var(--color-border-subtle)] hover:border-[var(--color-action)]/50 hover:bg-[var(--color-back-subtle)] text-[var(--color-text-main)] shadow-2xs"
                  }`}
                  title={`${glyph.char} (${hex}) — ${isRtl ? "انقر للنسخ" : "Click to copy"}`}
                >
                  <span
                    className="leading-none select-none transition-transform group-hover:scale-110"
                    style={{ fontSize: `${glyphSize}px`, fontFamily: fontFam }}
                  >
                    {glyph.char}
                  </span>
                  <span className="text-[9px] font-mono text-[var(--color-text-muted)] mt-1 opacity-70 group-hover:opacity-100">
                    {hex}
                  </span>
                  {isCopied && (
                    <span className="absolute top-1 right-1 text-[var(--color-green)]">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
