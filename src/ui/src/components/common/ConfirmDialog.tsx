import { AlertTriangle, Trash2, X } from "lucide-react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  isRtl?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "danger",
  isRtl = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const isDanger = variant === "danger";

  return (
    <div
      className="fixed inset-0 z-[9990] bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div
        className="w-full max-w-md bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                isDanger
                  ? "bg-rose-500/15 border-rose-500/30 text-rose-400"
                  : "bg-amber-500/15 border-amber-500/30 text-amber-400"
              }`}
            >
              {isDanger ? (
                <Trash2 className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <h3 className="text-sm font-bold text-[var(--color-text-header)] truncate">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer shrink-0"
            aria-label={isRtl ? "إغلاق" : "Close"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          {message}
        </p>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-4 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-header)] transition cursor-pointer whitespace-nowrap shrink-0"
          >
            {cancelLabel || (isRtl ? "إلغاء" : "Cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-9 px-4 rounded-xl text-xs font-semibold text-white transition cursor-pointer whitespace-nowrap shrink-0 ${
              isDanger
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-[var(--color-action)] hover:bg-[var(--color-action-hover)]"
            }`}
          >
            {confirmLabel || (isRtl ? "تأكيد الحذف" : "Delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
