import React, { useState } from "react";
import {
  X,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";

export default function WindowsFontResetModal({
  isOpen,
  onClose,
  t = {},
  isRtl = false,
}: any) {
  const safeT = t || {};
  const [isResetting, setIsResetting] = useState(false);
  const [resetResult, setResetResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<any>(null);

  if (!isOpen) return null;

  const handleReset = async () => {
    setIsResetting(true);
    setErrorMsg(null);
    setResetResult(null);

    try {
      const res = await fetch("/api/system/restore-default-fonts", {
        method: "POST",
      });
      const data = await res.json();
      if (data && data.success) {
        setResetResult(data);
      } else {
        setErrorMsg(
          data.error ||
            (isRtl
              ? "حدث خطأ أثناء استعادة الإعدادات"
              : "Error restoring settings"),
        );
      }
    } catch (e) {
      setErrorMsg(
        e.message ||
          (isRtl ? "فشل الاتصال بالمحرك" : "Failed to connect to engine"),
      );
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 select-none"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl max-w-[calc(100vw-1.5rem)] sm:max-w-lg w-full max-h-[88dvh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-[var(--color-text-main)]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--color-border)] flex items-center justify-between gap-3 bg-[var(--color-back-header)] shrink-0 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-action)]/15 border border-[var(--color-action)]/35 flex items-center justify-center text-[var(--color-action)] shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-[var(--color-text-header)] truncate">
                {safeT.windowsFontReset ||
                  "Windows Font Cleanup & Factory Reset"}
              </h3>
              <p className="text-[11px] sm:text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
                {isRtl
                  ? "تنظيف مفاتيح الريجستري وإرجاع الخطوط الأصلية"
                  : "Windows Default Fonts Factory Restore & Registry Purge"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs leading-relaxed overflow-y-auto flex-1 min-h-0">
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-[var(--color-text-header)] mb-1">
                {isRtl
                  ? "لماذا تحتاج هذه العملية إذا كان جهازك بطيئاً؟"
                  : "Why perform a factory font restore?"}
              </h4>
              <p className="text-[var(--color-text-muted)] text-[11px] leading-relaxed">
                {isRtl
                  ? "تثبيت مئات الخطوط يدوياً في نظام ويندوز يثقل خدمة DirectWrite ويبطئ إقلاع الويندوز وتطبيقات أدوبي وأوفيس. هذه الميزة تزيل كل الخطوط الدخيلة من الريجستري لتعود لوضع ويندوز الأصلي السريع."
                  : "Manually installing hundreds of fonts permanently bloats the Windows DirectWrite cache and slows down OS startup and Creative Cloud apps. This feature purges orphaned font registry entries and restores Windows factory speed."}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border-subtle)] space-y-2">
            <div className="flex items-center gap-2 font-bold text-[var(--color-text-header)]">
              <ShieldCheck className="w-4 h-4 text-[var(--color-green)]" />
              <span>
                {isRtl
                  ? "حماية وأمان كامل بنسخة احتياطية تلقائية:"
                  : "Full Safety & Automated Registry Backup:"}
              </span>
            </div>
            <p className="text-[var(--color-text-muted)] text-[11px] leading-relaxed">
              {isRtl
                ? "يتم أخذ نسخة احتياطية رسمية (.reg) لجميع مفاتيح خطوط الريجستري الحالية في مجلد البيانات قبل حذف أي مفتاح، ويمكن استرجاعها بضغطة زر في أي وقت."
                : "A full .reg backup is automatically generated in your local AppData folder before any cleanup, allowing instantaneous 1-click restore at any time."}
            </p>
          </div>

          {/* Result Banner */}
          {resetResult && (
            <div className="p-4 rounded-xl bg-[var(--color-green)]/15 border border-[var(--color-green)]/30 space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 text-[var(--color-green)] font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {resetResult.message ||
                    (isRtl
                      ? "تمت استعادة إعدادات خطوط ويندوز بنجاح!"
                      : "Windows default fonts restored successfully!")}
                </span>
              </div>
              <div className="text-[11px] text-[var(--color-text-muted)] space-y-1 pt-1">
                <div>
                  • {isRtl ? "عدد الخطوط المنظفة: " : "Cleaned keys count: "}{" "}
                  <span className="font-mono text-[var(--color-green)] font-bold">
                    {resetResult.cleanedCount}
                  </span>
                </div>
                <div className="truncate font-mono text-[10px] bg-[var(--color-back-card)] p-2 rounded-lg border border-[var(--color-border)]">
                  {resetResult.backupPath}
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handleReset}
            disabled={isResetting}
            className="w-full min-h-9 py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 text-center"
          >
            {isResetting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>
                  {isRtl
                    ? "جاري أخذ النسخة الاحتياطية وإعادة الضبط..."
                    : "Creating backup & restoring..."}
                </span>
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                <span>
                  {safeT.restoreDefaultFonts ||
                    "Restore Default Windows Fonts Now"}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
