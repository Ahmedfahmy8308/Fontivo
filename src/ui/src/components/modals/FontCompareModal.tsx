import React, { useState, useEffect } from "react";
import { X, Columns2, Rows, Trash2, Copy, Check } from "lucide-react";

export default function FontCompareModal({
  compareFonts = [],
  onClose,
  onRemoveFont,
  onClearAll,
  onToggleActive,
  onToggleFavorite,
  t = {},
  isRtl = false,
}: any) {
  const [layout, setLayout] = useState("split");
  const [compareText, setCompareText] = useState(
    isRtl
      ? "صِف خَلقَ خَودٍ كَمِثلِ الشَمسِ إِذ بَزَغَت • Typography Specimen"
      : "The quick brown fox jumps over the lazy dog • Typography Specimen",
  );
  const [fontSize, setFontSize] = useState(36);
  const [copiedId, setCopiedId] = useState<any>(null);

  useEffect(() => {
    compareFonts.forEach((font) => {
      const familyName = `Fontivo_${font.id}`;
      const fontUrl = `/api/font-file/${font.id}`;
      const fontFace = new FontFace(familyName, `url("${fontUrl}")`);
      fontFace
        .load()
        .then((loaded) => {
          document.fonts.add(loaded);
        })
        .catch(() => {});
    });
  }, [compareFonts]);

  const handleCopyName = (font) => {
    navigator.clipboard.writeText(font.displayName || font.name);
    setCopiedId(font.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 select-none animate-in fade-in duration-150"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="w-full max-w-6xl h-[88vh] bg-[var(--color-back-card)] rounded-2xl border border-[var(--color-border)] shadow-2xl flex flex-col overflow-hidden text-[var(--color-text-main)]">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between gap-4 bg-[var(--color-back-side)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-action)]/15 border border-[var(--color-action)]/30 flex items-center justify-center text-[var(--color-action)] shrink-0">
              <Columns2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--color-text-header)]">
                  {isRtl
                    ? "مقارنة الخطوط المباشرة"
                    : "Side-by-Side Font Comparison"}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--color-control)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                  {compareFonts.length} {isRtl ? "خطوط" : "fonts"}
                </span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                {isRtl
                  ? "قارن تفاصيل الحروف وتوزيع الأوزان جنباً إلى جنب"
                  : "Compare letterforms, weights, and metrics side by side"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {compareFonts.length > 0 && (
              <button
                onClick={onClearAll}
                className="px-3 py-1.5 text-xs text-rose-500 hover:bg-rose-500/10 rounded-xl transition flex items-center gap-1.5 cursor-pointer font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isRtl ? "تفريغ الكل" : "Clear All"}</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-back-card)] flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 max-w-xl">
            <input
              type="text"
              value={compareText}
              onChange={(e: any) => setCompareText(e.target.value)}
              className="w-full bg-[var(--color-back-subtle)] border border-[var(--color-border)] rounded-xl px-3.5 py-1.5 text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-action)] shadow-xs"
              placeholder={
                isRtl
                  ? "اكتب نص المقارنة هنا..."
                  : "Type comparison text here..."
              }
            />
          </div>

          <div className="flex items-center gap-4">
            {/* Font Size */}
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="14"
                max="96"
                value={fontSize}
                onChange={(e: any) => setFontSize(Number(e.target.value))}
                className="fontivo-slider w-24"
              />
              <span className="text-xs font-mono text-[var(--color-text-muted)] w-8">
                {fontSize}px
              </span>
            </div>

            {/* Layout Switcher */}
            <div className="flex items-center bg-[var(--color-back-subtle)] rounded-xl p-0.5 border border-[var(--color-border)]">
              <button
                onClick={() => setLayout("split")}
                className={`p-1.5 rounded-lg transition cursor-pointer ${layout === "split" ? "bg-[var(--color-action)] text-white shadow-xs" : "text-[var(--color-text-muted)]"}`}
                title={isRtl ? "أعمدة متجاورة" : "Split Columns"}
              >
                <Columns2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setLayout("stack")}
                className={`p-1.5 rounded-lg transition cursor-pointer ${layout === "stack" ? "bg-[var(--color-action)] text-white shadow-xs" : "text-[var(--color-text-muted)]"}`}
                title={isRtl ? "صفوف أفقية" : "Stacked Rows"}
              >
                <Rows className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Comparison Board */}
        <div className="flex-1 p-6 overflow-y-auto bg-[var(--color-back-main)]">
          {compareFonts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-[var(--color-text-muted)]">
              <Columns2 className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-semibold">
                {isRtl
                  ? "لم يتم اختيار أي خط للمقارنة بعد."
                  : "No fonts selected for comparison yet."}
              </p>
              <p className="text-xs text-[var(--color-text-dim)] mt-1">
                {isRtl
                  ? "اضغط على أيقونة المقارنة في كارت أي خط لإضافته إلى هنا."
                  : "Click the compare icon on any font card to add it here."}
              </p>
            </div>
          ) : (
            <div
              className={
                layout === "split"
                  ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full"
                  : "space-y-4"
              }
            >
              {compareFonts.map((font) => {
                const fName = `Fontivo_${font.id}`;
                return (
                  <div
                    key={font.id}
                    className="p-5 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl flex flex-col justify-between overflow-hidden shadow-xs hover:border-[var(--color-action)]/40 transition"
                  >
                    <div>
                      {/* Font Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border-subtle)] mb-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[var(--color-text-header)]">
                            {font.displayName || font.name}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--color-control)] text-[var(--color-text-muted)]">
                            {font.format}
                          </span>
                        </div>
                        <button
                          onClick={() => handleCopyName(font)}
                          className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition"
                          title="Copy name"
                        >
                          {copiedId === font.id ? (
                            <Check className="w-3.5 h-3.5 text-[var(--color-green)]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Specimen Output */}
                      <div
                        style={{
                          fontFamily: `"${fName}", sans-serif`,
                          fontSize: `${fontSize}px`,
                          lineHeight: "1.4",
                        }}
                        className="py-4 text-[var(--color-text-header)] break-words"
                      >
                        {compareText}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                      <span>{font.style || "Regular"}</span>
                      {onRemoveFont && (
                        <button
                          onClick={() => onRemoveFont(font.id)}
                          className="text-rose-500 hover:underline text-[11px] font-medium"
                        >
                          {isRtl ? "إزالة" : "Remove"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
