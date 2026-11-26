import React, { useState, useEffect } from "react";
import {
  X,
  Activity,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Database,
  FileCheck,
} from "lucide-react";

export default function SystemHealthModal({
  isOpen,
  onClose,
  onRefreshStats,
  t = {},
  isRtl = false,
}: any) {
  if (!isOpen) return null;

  const [healthData, setHealthData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [message, setMessage] = useState<any>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/system-health");
      const data = await res.json();
      setHealthData(data);
    } catch (e) {
      console.error(e);
      setMessage({
        type: "error",
        text: isRtl
          ? "فشل جلب بيانات صحة النظام"
          : "Failed to fetch system health",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchHealth();
  }, [isOpen]);

  const handleCleanRegistry = async () => {
    setCleaning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/clean-registry-fonts", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setMessage({
          type: "success",
          text: isRtl
            ? `تم تنظيف ${data.cleaned || 0} مفتاحاً يتيماً من ريجستري ويندوز بنجاح!`
            : `Cleaned ${data.cleaned || 0} orphaned registry keys successfully!`,
        });
        fetchHealth();
        if (onRefreshStats) onRefreshStats();
      } else {
        setMessage({
          type: "error",
          text:
            data.error ||
            (isRtl ? "فشل تنظيف السجل" : "Failed to clean registry"),
        });
      }
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setCleaning(false);
    }
  };

  const deadList = healthData
    ? healthData.deadEntries || healthData.dead_entries || []
    : [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 select-none animate-in fade-in duration-150"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="w-full max-w-3xl max-h-[85vh] bg-[var(--color-back-card)] rounded-2xl border border-[var(--color-border)] shadow-2xl flex flex-col overflow-hidden text-[var(--color-text-main)]">
        {/* Header */}
        <div className="p-4 px-6 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-back-header)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-green)]/15 border border-[var(--color-green)]/30 flex items-center justify-center text-[var(--color-green)]">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--color-text-header)]">
                  {isRtl
                    ? "فحص وصحة النظام (System Health)"
                    : "System & Font Health"}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-muted)]">
                  Registry & Cache
                </span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {isRtl
                  ? "فحص وتنظيف مسارات الخطوط الميتة في ريجستري ويندوز وإصلاح الكاش"
                  : "Audit and clean orphaned font registry keys and optimize cache"}
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

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-[var(--color-back-main)]">
          {message && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
                message.type === "success"
                  ? "bg-[var(--color-green)]/10 border-[var(--color-green)]/20 text-[var(--color-green)]"
                  : "bg-rose-500/10 border-rose-500/20 text-rose-400"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-[var(--color-text-muted)] gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[var(--color-action)]" />
              <span className="text-xs">
                {isRtl
                  ? "جاري فحص سجل ويندوز وملفات الخطوط..."
                  : "Auditing Windows registry and font files..."}
              </span>
            </div>
          ) : (
            <>
              {/* Quick Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="p-4 bg-[var(--color-back-card)] rounded-xl border border-[var(--color-border)] flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">
                      {isRtl ? "خطوط النظام المثبتة" : "Installed Fonts"}
                    </div>
                    <div className="text-xl font-bold text-[var(--color-text-header)] mt-1">
                      {healthData?.registryFontsCount || 0}
                    </div>
                  </div>
                  <Database className="w-6 h-6 text-[var(--color-action)] opacity-60" />
                </div>

                <div className="p-4 bg-[var(--color-back-card)] rounded-xl border border-[var(--color-border)] flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">
                      {isRtl ? "مفاتيح ريجستري يتيمة" : "Orphaned Keys"}
                    </div>
                    <div
                      className={`text-xl font-bold mt-1 ${deadList.length > 0 ? "text-amber-400" : "text-[var(--color-green)]"}`}
                    >
                      {deadList.length}
                    </div>
                  </div>
                  <ShieldCheck className="w-6 h-6 text-[var(--color-green)] opacity-60" />
                </div>

                <div className="p-4 bg-[var(--color-back-card)] rounded-xl border border-[var(--color-border)] flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">
                      {isRtl ? "حالة سلامة النظام" : "System Health"}
                    </div>
                    <div className="text-sm font-bold text-[var(--color-green)] mt-1">
                      {deadList.length === 0
                        ? isRtl
                          ? "ممتازة 100%"
                          : "Optimal 100%"
                        : isRtl
                          ? "تحتاج صيانة"
                          : "Needs Clean"}
                    </div>
                  </div>
                  <FileCheck className="w-6 h-6 text-[var(--color-green)] opacity-60" />
                </div>
              </div>

              {/* Clean Action Button */}
              {deadList.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-bold text-amber-400">
                      {isRtl
                        ? "تم رصد قيود يتيمة في ريجستري ويندوز"
                        : "Orphaned font registry entries detected"}
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                      {isRtl
                        ? "ينصح بتنظيف هذه المفاتيح لتسريع إقلاع برامج التصميم والنظام."
                        : "Cleaning these entries speeds up Photoshop and system font loading."}
                    </p>
                  </div>
                  <button
                    onClick={handleCleanRegistry}
                    disabled={cleaning}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {cleaning ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isRtl
                        ? "تنظيف المفاتيح اليتيمة الآن"
                        : "Clean Orphaned Keys Now"}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
