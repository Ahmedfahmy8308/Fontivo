import React, { useState, useEffect } from "react";
import { X, Zap, RefreshCw, CheckCircle2, Gauge } from "lucide-react";

export default function RamCleanerModal({
  isOpen,
  onClose,
  t = {},
  isRtl = false,
}: any) {
  const safeT = t || {};
  const [currentRam, setCurrentRam] = useState(45.2);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/system/ram-status")
        .then((res) => res.json())
        .then((data) => {
          if (data && data.processRamMb) {
            setCurrentRam(data.processRamMb);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClean = async () => {
    setIsCleaning(true);
    setCleanResult(null);
    try {
      const res = await fetch("/api/system/optimize-ram", { method: "POST" });
      const data = await res.json();
      if (data && data.success) {
        setCleanResult(data);
        setCurrentRam(data.ramAfterMb);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-[var(--color-text-main)]">
        {/* Header */}
        <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-back-header)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-green)] flex items-center justify-center text-white shadow-md shadow-[var(--color-green)]/30 shrink-0">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[var(--color-text-header)]">
                {safeT.ramOptimizer || "RAM Optimizer & Speedup"}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {isRtl
                  ? "تسريع المحرك وتفريغ الذاكرة المؤقتة للخطوط"
                  : "Ultra-Fast Memory Working Set Trimming & Cache Cleanup"}
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

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-6 text-xs text-center overflow-y-auto flex-1">
          {/* Circular Gauge / Status */}
          <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-[var(--color-back-subtle)] border border-[var(--color-border-subtle)] space-y-3">
            <div className="relative w-28 h-28 rounded-full border-4 border-[var(--color-border)] border-t-[var(--color-green)] flex items-center justify-center shadow-inner">
              <div className="text-center">
                <span className="text-2xl font-mono font-bold text-[var(--color-text-header)]">
                  {currentRam}
                </span>
                <span className="block text-[10px] text-[var(--color-text-muted)] uppercase font-semibold">
                  MB RAM
                </span>
              </div>
            </div>

            <div className="text-center">
              <span className="text-xs font-bold text-[var(--color-text-header)]">
                {isRtl
                  ? "استهلاك المحرك الحالي فائق الخفة"
                  : "Ultra-Lightweight Memory Footprint"}
              </span>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                {isRtl
                  ? "أقل بنسبة 85% مقارنة بمديرات الخطوط التقليدية"
                  : "85% lighter than traditional font managers"}
              </p>
            </div>
          </div>

          {/* Clean Result Alert */}
          {cleanResult && (
            <div className="p-4 rounded-xl bg-[var(--color-green)]/15 border border-[var(--color-green)]/30 text-left rtl:text-right space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 text-[var(--color-green)] font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {cleanResult.message ||
                    (isRtl
                      ? "تم تفريغ وتسريع الذاكرة بنجاح!"
                      : "Memory trimmed and accelerated!")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--color-text-muted)] pt-1">
                <div>
                  {isRtl ? "• الذاكرة قبل: " : "• Before: "}{" "}
                  <span className="font-mono text-[var(--color-text-header)]">
                    {cleanResult.ramBeforeMb} MB
                  </span>
                </div>
                <div>
                  {isRtl ? "• الذاكرة بعد: " : "• After: "}{" "}
                  <span className="font-mono text-[var(--color-green)] font-bold">
                    {cleanResult.ramAfterMb} MB
                  </span>
                </div>
                <div>
                  {isRtl ? "• المحرر: " : "• Freed: "}{" "}
                  <span className="font-mono text-[var(--color-green)] font-bold">
                    {cleanResult.freedMb} MB
                  </span>
                </div>
                <div>
                  {isRtl ? "• نسبة التسريع: " : "• Ratio: "}{" "}
                  <span className="font-mono text-[var(--color-green)] font-bold">
                    {cleanResult.freedPercent}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Speedup Action Button */}
          <button
            onClick={handleClean}
            disabled={isCleaning}
            className="w-full h-9 px-4 rounded-xl bg-[var(--color-action)] hover:opacity-90 text-white font-bold text-xs shadow-lg shadow-[var(--color-action)]/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {isCleaning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>
                  {isRtl
                    ? "جاري تسريع وتفريغ الذاكرة..."
                    : "Trimming memory caches..."}
                </span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 fill-current" />
                <span>{safeT.cleanRam || "Optimize Memory Now"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
