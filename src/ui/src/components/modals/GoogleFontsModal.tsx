import React, { useState, useEffect } from "react";
import {
  X,
  Cloud,
  Search,
  CheckCircle2,
  Zap,
  Download,
  RefreshCw,
} from "lucide-react";

export default function GoogleFontsModal({
  isOpen,
  onClose,
  onRefreshStats,
  t = {},
  isRtl = false,
}: any) {
  if (!isOpen) return null;

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [fonts, setFonts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState<any>(null);

  const categories = [
    { id: "all", label: isRtl ? "كافة التصنيفات" : "All Categories" },
    { id: "sans-serif", label: "Sans Serif" },
    { id: "serif", label: "Serif" },
    { id: "display", label: "Display" },
    { id: "handwriting", label: "Handwriting" },
    { id: "monospace", label: "Monospace" },
    { id: "arabic", label: isRtl ? "الخطوط العربية" : "Arabic" },
  ];

  const fetchGoogleFonts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== "all") params.append("category", category);
      if (query.trim()) params.append("search", query.trim());

      const res = await fetch(`/api/google-fonts?${params.toString()}`);
      const data = await res.json();
      setFonts(data.fonts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchGoogleFonts();
  }, [category, isOpen]);

  const handleDownload = async (font, mode = "ram") => {
    setDownloadingId(font.family);
    setActionMessage(null);
    try {
      const res = await fetch("/api/download-google-font", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family: font.family, mode }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({
          type: "success",
          text:
            mode === "ram"
              ? isRtl
                ? `تم تفعيل خط "${font.family}" بالرام فوراً!`
                : `"${font.family}" activated in RAM!`
              : isRtl
                ? `تم تثبيت خط "${font.family}" بنجاح في ويندوز!`
                : `"${font.family}" installed permanently!`,
        });
        if (onRefreshStats) onRefreshStats();
      }
    } catch (e) {
      setActionMessage({ type: "error", text: e.message });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 select-none animate-in fade-in duration-150"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="w-full max-w-4xl h-[85vh] bg-[var(--color-back-card)] rounded-2xl border border-[var(--color-border)] shadow-2xl flex flex-col overflow-hidden text-[var(--color-text-main)]">
        {/* Header */}
        <div className="p-4 px-6 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-back-header)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-action)]/15 border border-[var(--color-action)]/30 flex items-center justify-center text-[var(--color-action)]">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--color-text-header)]">
                  {isRtl ? "سحابة Google Fonts الرسمية" : "Google Fonts Cloud"}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-action)]/10 text-[var(--color-action)] border border-[var(--color-action)]/20 font-mono">
                  1,600+
                </span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {isRtl
                  ? "تصفح وتنزيل الخطوط المجانية المفتوحة المصدر مباشرة"
                  : "Browse and download open-source fonts directly"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-3 px-6 border-b border-[var(--color-border)] bg-[var(--color-back-main)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition shrink-0 cursor-pointer ${
                  category === c.id
                    ? "bg-[var(--color-action)] text-white font-bold shadow-xs"
                    : "bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="relative w-60 shrink-0">
            <Search className="w-3.5 h-3.5 text-[var(--color-text-muted)] absolute ltr:right-3 rtl:left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder={isRtl ? "بحث في الخطوط..." : "Search fonts..."}
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              onKeyDown={(e: any) => e.key === "Enter" && fetchGoogleFonts()}
              className="w-full bg-[var(--color-control)] border border-[var(--color-border)] rounded-full ltr:pr-8 ltr:pl-3 rtl:pl-8 rtl:pr-3 py-1.5 text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-action)]"
            />
          </div>
        </div>

        {actionMessage && (
          <div
            className={`p-3 px-6 text-xs flex items-center gap-2 ${
              actionMessage.type === "success"
                ? "bg-[var(--color-green)]/10 text-[var(--color-green)] border-b border-[var(--color-green)]/20"
                : "bg-rose-500/10 text-rose-400 border-b border-rose-500/20"
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionMessage.text}</span>
          </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-[var(--color-back-main)]">
          {loading ? (
            <div className="col-span-2 flex flex-col items-center justify-center py-20 text-[var(--color-text-muted)] gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-[var(--color-action)]" />
              <span className="text-xs">
                {isRtl
                  ? "جاري التحميل من سحابة Google..."
                  : "Loading Google Fonts..."}
              </span>
            </div>
          ) : (
            fonts.map((f) => (
              <div
                key={f.family}
                className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-xl p-4 flex flex-col justify-between gap-3 shadow-2xs hover:border-[var(--color-action)]/40 transition"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-[var(--color-text-header)]">
                      {f.family}
                    </h3>
                    <span className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase px-2 py-0.5 rounded-md bg-[var(--color-control)] border border-[var(--color-border)]">
                      {f.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                    {f.variants?.length || 1} {isRtl ? "أوزان" : "styles"}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
                  <button
                    onClick={() => handleDownload(f, "ram")}
                    disabled={downloadingId === f.family}
                    className="flex-1 py-1.5 px-2.5 rounded-xl bg-[var(--color-green)]/10 hover:bg-[var(--color-green)]/20 border border-[var(--color-green)]/30 text-[var(--color-green)] text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    {downloadingId === f.family ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Zap className="w-3 h-3" />
                    )}
                    <span>{isRtl ? "تفعيل بالرام" : "Activate RAM"}</span>
                  </button>

                  <button
                    onClick={() => handleDownload(f, "permanent")}
                    disabled={downloadingId === f.family}
                    className="py-1.5 px-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-main)] border border-[var(--color-border)] text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3 h-3" />
                    <span>{isRtl ? "تثبيت" : "Install"}</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
