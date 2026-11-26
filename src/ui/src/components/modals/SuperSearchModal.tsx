import React, { useState } from "react";
import { X, SlidersHorizontal, RotateCcw } from "lucide-react";

export default function SuperSearchModal({
  isOpen,
  onClose,
  onApplyFilter,
  t = {},
  isRtl = false,
}: any) {
  if (!isOpen) return null;

  const [weight, setWeight] = useState("all");
  const [script, setScript] = useState("all");
  const [hasLigatures, setHasLigatures] = useState(false);

  const handleApply = () => {
    onApplyFilter({ weight, script, hasLigatures });
    onClose();
  };

  const handleReset = () => {
    setWeight("all");
    setScript("all");
    setHasLigatures(false);
    onApplyFilter({ weight: "all", script: "all", hasLigatures: false });
    onClose();
  };

  const weightOptions = [
    { id: "all", label: t.weightAll || "All" },
    { id: "thin", label: t.weightThin || "Thin" },
    { id: "regular", label: t.weightRegular || "Regular" },
    { id: "bold", label: t.weightBold || "Bold" },
  ];

  const scriptOptions = [
    { id: "all", label: t.scriptAll || "All" },
    { id: "arabic", label: t.scriptArabic || "Arabic" },
    { id: "latin", label: t.scriptLatin || "Latin / English" },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-[var(--color-text-main)]">
        {/* Header */}
        <div className="p-4 px-5 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-back-header)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-action)]/15 border border-[var(--color-action)]/30 flex items-center justify-center text-[var(--color-action)] shrink-0">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[var(--color-text-header)]">
                {t.superSearchHeader || "SuperSearch & OpenType Filter"}
              </h3>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {t.superSearchSub ||
                  "Filter by weight, script, and typography features"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {/* Weight */}
          <div>
            <label className="text-[var(--color-text-header)] font-semibold block mb-2">
              {t.weightRange || "Weight Range"}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {weightOptions.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWeight(w.id)}
                  className={`h-9 px-2.5 rounded-xl border text-center transition cursor-pointer font-medium text-xs whitespace-nowrap shrink-0 ${
                    weight === w.id
                      ? "border-[var(--color-action)] bg-[var(--color-action)] text-white shadow-xs"
                      : "border-[var(--color-border)] bg-[var(--color-back-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* Script / Language */}
          <div>
            <label className="text-[var(--color-text-header)] font-semibold block mb-2">
              {t.scriptLanguage || "Script & Language"}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {scriptOptions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScript(s.id)}
                  className={`py-2 px-2.5 rounded-xl border text-center transition cursor-pointer font-medium text-xs ${
                    script === s.id
                      ? "border-[var(--color-action)] bg-[var(--color-action)] text-white shadow-xs"
                      : "border-[var(--color-border)] bg-[var(--color-back-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* OpenType Capabilities */}
          <div>
            <label className="text-[var(--color-text-header)] font-semibold block mb-2">
              {t.openTypeFeatures || "OpenType Features"}
            </label>
            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] cursor-pointer hover:border-[var(--color-action)]/40 transition">
              <input
                type="checkbox"
                checked={hasLigatures}
                onChange={(e: any) => setHasLigatures(e.target.checked)}
                className="w-4 h-4 rounded accent-[var(--color-action)] cursor-pointer"
              />
              <span className="text-[var(--color-text-main)] font-medium">
                {t.ligaturesOnly || "Fonts with Ligatures only"}
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[var(--color-back-side)] border-t border-[var(--color-border)] flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="h-9 px-4 rounded-xl text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.resetFilter || "Reset"}</span>
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 rounded-xl bg-[var(--color-action)] hover:opacity-90 text-white text-xs font-semibold shadow-md transition cursor-pointer"
          >
            {t.applyFilter || "Apply Filter"}
          </button>
        </div>
      </div>
    </div>
  );
}
