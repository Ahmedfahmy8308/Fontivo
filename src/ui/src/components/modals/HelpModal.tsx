import { X, HelpCircle, Keyboard } from "lucide-react";

export default function HelpModal({
  isOpen,
  onClose,
  t = {},
  isRtl = false,
}: any) {
  if (!isOpen) return null;

  const shortcuts = [
    {
      key: "Ctrl + F",
      descAr: "البحث السريع في الخطوط",
      descEn: "Quick search fonts",
    },
    {
      key: "Ctrl + A",
      descAr: "تفعيل كافة خطوط الفلتر الحالي",
      descEn: "Activate all fonts in current filter",
    },
    {
      key: "Ctrl + D",
      descAr: "إلغاء تفعيل كافة خطوط الرام",
      descEn: "Deactivate all transient RAM fonts",
    },
    {
      key: "Space",
      descAr: "معاينة الخط في شلال الأحجام",
      descEn: "Preview selected font in specimen",
    },
    {
      key: "Esc",
      descAr: "إغلاق النوافذ المنبثقة والفاحص",
      descEn: "Close open modal or inspector view",
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-[var(--color-text-main)]">
        <div className="p-4 px-5 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-back-header)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-action)]/15 border border-[var(--color-action)]/30 flex items-center justify-center text-[var(--color-action)] shrink-0">
              <HelpCircle className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-[var(--color-text-header)]">
              {t.helpShortcuts || "Help & Keyboard Shortcuts"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            {isRtl
              ? "Fontivo مدير خطوط احترافي وخفيف لتفعيل الخطوط مؤقتاً في الرام دون استهلاك موارد الجهاز."
              : "Fontivo is a fast, lightweight desktop font manager with instant temporary RAM activation."}
          </p>

          <div className="bg-[var(--color-back-subtle)] border border-[var(--color-border-subtle)] rounded-xl divide-y divide-[var(--color-border-subtle)] text-xs">
            {shortcuts.map((sc, i) => (
              <div
                key={i}
                className="p-3 flex items-center justify-between gap-3"
              >
                <span className="text-[var(--color-text-main)] font-medium">
                  {isRtl ? sc.descAr : sc.descEn}
                </span>
                <span className="px-2.5 py-1 rounded-md bg-[var(--color-control)] border border-[var(--color-border)] font-mono text-[11px] text-[var(--color-text-header)] font-semibold shrink-0">
                  {sc.key}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 bg-[var(--color-back-side)] border-t border-[var(--color-border)] text-center text-[11px] text-[var(--color-text-muted)] font-mono">
          Fontivo v1.0.0 • Open Source Community
        </div>
      </div>
    </div>
  );
}
