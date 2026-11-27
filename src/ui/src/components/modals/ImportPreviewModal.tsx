import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  FolderInput,
  FolderPlus,
  CheckCircle2,
  Copy,
  HardDrive,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  FileWarning,
} from "lucide-react";

export interface FolderImportPreview {
  folderPath: string;
  suggestedName: string;
  totalScanned: number;
  newCount: number;
  duplicateCount: number;
  invalidCount: number;
  totalBytes: number;
  sampleFamilies: string[];
}

export interface ImportPreviewResult {
  success?: boolean;
  imported?: number;
  skipped?: number;
  targetFolder?: string;
  folderName?: string;
  message?: string;
  error?: string;
}

export interface ImportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  preview: FolderImportPreview | null;
  onConfirmImport?: (payload: {
    folderPath: string;
    customFolderName: string;
  }) => Promise<ImportPreviewResult | void> | void;
  onImported?: (result: ImportPreviewResult) => void;
  isImporting?: boolean;
  isRtl?: boolean;
  t?: Record<string, string>;
}

export function formatBytesToMb(bytes: number): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (safe === 0) return "0.00 MB";
  const mb = safe / (1024 * 1024);
  if (mb < 0.01) {
    const kb = safe / 1024;
    return `${kb.toFixed(1)} KB`;
  }
  return `${mb.toFixed(2)} MB`;
}

export function sanitizeFolderSliceName(raw: string): string {
  const trimmed = (raw || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return trimmed.slice(0, 64) || "Imported-Fonts";
}

export default function ImportPreviewModal({
  isOpen,
  onClose,
  preview,
  onConfirmImport,
  onImported,
  isImporting = false,
  isRtl = false,
  t = {},
}: ImportPreviewModalProps) {
  const [customFolderName, setCustomFolderName] = useState<string>(
    preview?.suggestedName || "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (preview) {
      setCustomFolderName(preview.suggestedName || "");
      setErrorMsg(null);
    }
  }, [preview?.folderPath, preview?.suggestedName]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting && !isImporting) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, submitting, isImporting]);

  const sanitizedPreviewName = useMemo(
    () => sanitizeFolderSliceName(customFolderName || preview?.suggestedName || ""),
    [customFolderName, preview?.suggestedName],
  );

  if (!isOpen || !preview) return null;

  const busy = submitting || isImporting;
  const totalSizeLabel = formatBytesToMb(preview.totalBytes);
  const sampleFamilies = Array.isArray(preview.sampleFamilies)
    ? preview.sampleFamilies.filter((name) => typeof name === "string" && name.trim())
    : [];
  const visibleSamples = sampleFamilies.slice(0, 12);
  const hiddenSamplesCount = Math.max(0, sampleFamilies.length - visibleSamples.length);
  const targetPathPreview = `%LOCALAPPDATA%\\Fontivo\\Fonts\\Imported\\${sanitizedPreviewName}\\`;
  const nothingNewToImport = (preview.newCount ?? 0) <= 0;

  const handleConfirm = async () => {
    if (busy || nothingNewToImport) return;
    const finalName = sanitizeFolderSliceName(
      customFolderName || preview.suggestedName || "",
    );
    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (onConfirmImport) {
        const res = await onConfirmImport({
          folderPath: preview.folderPath,
          customFolderName: finalName,
        });
        if (res && res.success === false) {
          setErrorMsg(
            res.error ||
              res.message ||
              (isRtl ? "تعذر استيراد المجلد" : "Failed to import folder"),
          );
          return;
        }
        if (res && onImported) {
          onImported(res);
        }
        onClose();
        return;
      }

      const response = await fetch("/api/import-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderPath: preview.folderPath,
          customFolderName: finalName,
        }),
      });
      const data: ImportPreviewResult = await response.json().catch(() => ({
        success: response.ok,
      }));
      if (!response.ok || data?.success === false) {
        setErrorMsg(
          data?.error ||
            data?.message ||
            (isRtl ? "تعذر استيراد مجلد الخطوط" : "Failed to import font folder"),
        );
        return;
      }
      if (onImported) {
        onImported(data);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (isRtl ? "حدث خطأ أثناء الاتصال بالخادم" : "Network error during import"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[110] p-3 sm:p-4 select-none animate-in fade-in duration-150"
      dir={isRtl ? "rtl" : "ltr"}
      onClick={() => {
        if (!busy) onClose();
      }}
      data-testid="import-preview-modal"
    >
      <div
        className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 text-[var(--color-text-main)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-preview-modal-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--color-border)] bg-[var(--color-back-header)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-action)]/15 border border-[var(--color-action)]/35 flex items-center justify-center text-[var(--color-action)] shrink-0">
              <FolderInput className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3
                id="import-preview-modal-title"
                className="text-sm sm:text-base font-bold font-sans text-[var(--color-text-header)] truncate"
                dir="auto"
              >
                {t.importPreviewTitle ||
                  (isRtl
                    ? "معاينة استيراد مجلد الخطوط"
                    : "Font Folder Import Preview")}
              </h3>
              <p className="text-[11px] font-sans text-[var(--color-text-muted)] truncate mt-0.5">
                {isRtl
                  ? "راجع الإحصائيات وخصّص اسم الشريحة قبل النسخ الآمن للمكتبة"
                  : "Review scanned fonts and customize the slice name before safe import"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer disabled:opacity-40 shrink-0"
            title={isRtl ? "إغلاق" : "Close"}
            aria-label={isRtl ? "إغلاق" : "Close"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Source folder path */}
          <div className="p-3 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border-subtle)] space-y-1">
            <div className="text-[11px] font-sans font-semibold text-[var(--color-text-muted)]">
              {isRtl ? "المجلد المصدر:" : "Source Folder:"}
            </div>
            <div
              dir="ltr"
              className="text-[11px] font-mono text-[var(--color-text-header)] truncate text-start"
              title={preview.folderPath}
            >
              {preview.folderPath}
            </div>
          </div>

          {/* Summary Badges */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
            data-testid="import-preview-stats"
          >
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-sans font-semibold text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {isRtl ? "خطوط جديدة" : "New Fonts"}
                </span>
              </div>
              <div
                dir="ltr"
                className="text-lg font-mono font-bold tabular-nums text-[var(--color-text-header)] text-start"
                data-testid="import-preview-new-count"
              >
                {Number(preview.newCount || 0).toLocaleString()}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-sans font-semibold text-amber-300">
                <Copy className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {isRtl ? "مكررات متجاهلة" : "Duplicates Skipped"}
                </span>
              </div>
              <div
                dir="ltr"
                className="text-lg font-mono font-bold tabular-nums text-[var(--color-text-header)] text-start"
                data-testid="import-preview-duplicate-count"
              >
                {Number(preview.duplicateCount || 0).toLocaleString()}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-[#B7A1D9]/12 border border-[#B7A1D9]/30 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-sans font-semibold text-[#B7A1D9]">
                <HardDrive className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {isRtl ? "الحجم الإجمالي" : "Total Size"}
                </span>
              </div>
              <div
                dir="ltr"
                className="text-base sm:text-lg font-mono font-bold tabular-nums text-[var(--color-text-header)] text-start"
                data-testid="import-preview-total-size"
              >
                {totalSizeLabel}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-sans font-semibold text-[var(--color-text-muted)]">
                <FileWarning className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {isRtl ? "إجمالي الفحص" : "Total Scanned"}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  dir="ltr"
                  className="text-lg font-mono font-bold tabular-nums text-[var(--color-text-header)]"
                >
                  {Number(preview.totalScanned || 0).toLocaleString()}
                </span>
                {preview.invalidCount > 0 && (
                  <span className="text-[10px] font-sans text-rose-400">
                    (<bdi dir="ltr">{preview.invalidCount}</bdi>{" "}
                    {isRtl ? "غير صالح" : "invalid"})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Editable Slice / Folder Name */}
          <div className="space-y-2">
            <label
              htmlFor="import-preview-folder-name-input"
              className="flex items-center gap-1.5 text-xs font-sans font-bold text-[var(--color-text-header)]"
            >
              <FolderPlus className="w-4 h-4 text-[var(--color-action)] shrink-0" />
              <span>
                {isRtl
                  ? "اسم الشريحة / المجلد داخل المكتبة المحلية"
                  : "Library Slice / Folder Name"}
              </span>
            </label>
            <input
              id="import-preview-folder-name-input"
              data-testid="import-preview-folder-name"
              type="text"
              dir="auto"
              value={customFolderName}
              onChange={(e) => setCustomFolderName(e.target.value)}
              disabled={busy}
              placeholder={
                preview.suggestedName ||
                (isRtl ? "مثال: خطوط عميل 2026" : "e.g. Client Fonts 2026")
              }
              className="w-full h-10 px-3.5 rounded-xl bg-[var(--color-control)] border border-[var(--color-border)] focus:border-[var(--color-action)] focus:outline-none text-xs font-sans text-[var(--color-text-header)] transition"
            />
          </div>

          {/* Safe Copy Guarantee Note */}
          <div
            data-testid="import-preview-safety-note"
            className="p-3.5 rounded-2xl bg-[var(--color-action)]/10 border border-[var(--color-action)]/30 space-y-1.5"
          >
            <div className="flex items-center gap-2 font-sans font-bold text-xs text-[var(--color-text-header)]">
              <ShieldCheck className="w-4 h-4 text-[var(--color-action)] shrink-0" />
              <span>
                {isRtl
                  ? "نسخ محلي آمن — ملفاتك محمية دائماً"
                  : "Safe Local Copy — Your Fonts Stay Protected"}
              </span>
            </div>
            <p className="text-[11px] font-sans text-[var(--color-text-main)] leading-relaxed">
              {isRtl ? (
                <>
                  يقوم Fontivo بنسخ الخطوط إلى{" "}
                  <bdi
                    dir="ltr"
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-back-card)] border border-[var(--color-border-subtle)] text-[var(--color-text-header)] break-all"
                  >
                    {targetPathPreview}
                  </bdi>{" "}
                  لذلك فإن حذف المجلد الأصلي من سطح المكتب لن يؤدي أبداً إلى فقدان خطوطك.
                </>
              ) : (
                <>
                  Fontivo copies fonts into{" "}
                  <bdi
                    dir="ltr"
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-back-card)] border border-[var(--color-border-subtle)] text-[var(--color-text-header)] break-all"
                  >
                    {targetPathPreview}
                  </bdi>{" "}
                  so deleting the original Desktop folder never loses your fonts.
                </>
              )}
            </p>
          </div>

          {/* Sample Families Preview */}
          {visibleSamples.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-sans font-bold text-[var(--color-text-muted)]">
                <Sparkles className="w-3.5 h-3.5 text-[#B7A1D9] shrink-0" />
                <span>
                  {isRtl
                    ? "عينة من عائلات الخطوط المكتشفة:"
                    : "Sample Detected Font Families:"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {visibleSamples.map((fam, idx) => (
                  <span
                    key={`${fam}-${idx}`}
                    dir="auto"
                    className="px-2.5 py-1 rounded-lg bg-[var(--color-back-subtle)] border border-[var(--color-border-subtle)] text-[11px] font-sans text-[var(--color-text-header)]"
                  >
                    {fam}
                  </span>
                ))}
                {hiddenSamplesCount > 0 && (
                  <span
                    dir="ltr"
                    className="px-2.5 py-1 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] text-[11px] font-mono text-[var(--color-text-muted)]"
                  >
                    +{hiddenSamplesCount}
                  </span>
                )}
              </div>
            </div>
          )}

          {nothingNewToImport && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-2 text-xs font-sans">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {isRtl
                  ? "جميع الخطوط في هذا المجلد موجودة بالفعل في مكتبتك أو لا توجد ملفات خطوط صالحة للاستيراد."
                  : "All fonts in this folder are already in your library, or no valid font files were found."}
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2 text-xs font-sans">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="break-words">{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-5 border-t border-[var(--color-border)] bg-[var(--color-back-header)] flex flex-wrap items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-9 px-4 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] text-xs font-sans font-semibold whitespace-nowrap transition cursor-pointer disabled:opacity-50"
          >
            {isRtl ? "إلغاء" : "Cancel"}
          </button>

          <button
            type="button"
            data-testid="import-preview-confirm"
            onClick={handleConfirm}
            disabled={busy || nothingNewToImport}
            className="h-9 px-5 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-[#130C16] text-xs font-sans font-bold inline-flex items-center gap-2 whitespace-nowrap transition cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <FolderInput className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>
              {busy
                ? isRtl
                  ? "جاري النسخ والاستيراد..."
                  : "Importing..."
                : isRtl
                  ? `تأكيد استيراد ${Number(preview.newCount || 0).toLocaleString()} خط`
                  : `Confirm Import (${Number(preview.newCount || 0).toLocaleString()})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" && document.body?.nodeType === 1
    ? createPortal(modalContent, document.body)
    : modalContent;
}
