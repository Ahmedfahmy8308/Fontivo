import React, { useState, useMemo, useRef, useEffect } from "react";
import { ChevronDown, Search, Globe, Type } from "lucide-react";
import { QUICK_GOOGLE_FONTS } from "./viewUtils";

interface FontPickerProps {
  fonts?: any[];
  selectedFont?: any;
  onSelectFont: (font: any) => void;
  isRtl?: boolean;
  includeGoogleFonts?: boolean;
}

export default function FontPicker({
  fonts = [],
  selectedFont,
  onSelectFont,
  isRtl = false,
  includeGoogleFonts = true,
}: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const allOptions = useMemo(() => {
    const lib = Array.isArray(fonts) ? fonts : [];
    if (!includeGoogleFonts) return lib;
    const libNames = new Set(
      lib.map((f) => (f.family || f.name || "").toLowerCase()),
    );
    const gf = QUICK_GOOGLE_FONTS.filter(
      (g) => !libNames.has(g.family.toLowerCase()),
    );
    return [...lib, ...gf];
  }, [fonts, includeGoogleFonts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? allOptions.filter((f) => {
          const name = (
            f.displayName ||
            f.family ||
            f.name ||
            ""
          ).toLowerCase();
          const style = (f.style || "").toLowerCase();
          return name.includes(q) || style.includes(q);
        })
      : allOptions;
    return list.slice(0, 120);
  }, [allOptions, search]);

  const currentLabel = selectedFont
    ? `${selectedFont.displayName || selectedFont.family || selectedFont.name}${selectedFont.style ? ` (${selectedFont.style})` : ""}`
    : isRtl
      ? "اختر خطاً..."
      : "Select a font...";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="h-8 px-3 bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] rounded-xl text-xs font-semibold text-[var(--color-text-header)] flex items-center gap-2 transition cursor-pointer max-w-[240px]"
      >
        <Type className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
        <span className="truncate">{currentLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
      </button>

      {open && (
        <div
          className={`absolute top-full mt-1.5 ${isRtl ? "right-0" : "left-0"} w-72 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-xl shadow-xl z-50 overflow-hidden`}
        >
          <div className="p-2 border-b border-[var(--color-border)]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute ltr:left-2.5 rtl:right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isRtl ? "ابحث عن خط..." : "Search fonts..."}
                className="w-full h-8 bg-[var(--color-control)] border border-[var(--color-border)] rounded-lg ltr:pl-8 ltr:pr-2.5 rtl:pr-8 rtl:pl-2.5 text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-action)]"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-border-subtle)]">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
                {isRtl ? "لا توجد نتائج مطابقة" : "No matching fonts"}
              </div>
            ) : (
              filtered.map((f) => {
                const isSelected = String(f.id) === String(selectedFont?.id);
                const isGf = Boolean(
                  f.isGoogleFont || String(f.id || "").startsWith("gf:"),
                );
                return (
                  <button
                    key={String(f.id)}
                    type="button"
                    onClick={() => {
                      onSelectFont(f);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`w-full px-3 py-2 text-left rtl:text-right flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                      isSelected
                        ? "bg-[var(--color-action)]/15 text-[var(--color-action)] font-bold"
                        : "text-[var(--color-text-header)] hover:bg-[var(--color-control)]"
                    }`}
                  >
                    <span className="truncate">
                      {f.displayName || f.family || f.name}
                      {f.style ? ` — ${f.style}` : ""}
                    </span>
                    {isGf && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-muted)] shrink-0">
                        <Globe className="w-2.5 h-2.5" />
                        Google
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
