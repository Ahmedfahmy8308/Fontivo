import React, { useState } from "react";
import { Compass, Cloud, Check } from "lucide-react";

const FEATURED_COLLECTIONS = [
  {
    titleAr: "الهوية البصرية العربية الحديثة",
    titleEn: "Modern Arabic Branding",
    subtitleAr: "مجموعة خطوط كوفية وهندسية لشعارات وهوية الشركات",
    subtitleEn: "Geometric Sans-Serif for Dashboards & Corporate Brands",
    count: 24,
    tags: ["Branding", "Kufi", "Modern"],
    sampleAr: "تصميم الهوية البصرية والعلامات التجارية الاحترافية",
    sampleEn: "Modern typographic branding system and visual identity",
  },
  {
    titleAr: "واجهات المستخدم العصرية (UI/UX)",
    titleEn: "Clean Minimalist UI",
    subtitleAr: "خطوط هندسية سلسة لتطبيقات الويب والموبايل والداشبورد",
    subtitleEn: "Geometric Sans-Serif for Dashboards and Modern Apps",
    count: 36,
    tags: ["UI/UX", "Geometric", "Clean"],
    sampleAr: "تجربة المستخدم المتكاملة تصنع قيمة المنتج الرقمي",
    sampleEn: "The user experience defines the product value",
  },
  {
    titleAr: "التايبوجرافي التحريري الفاخر (Serif)",
    titleEn: "Editorial Luxury Serifs",
    subtitleAr: "تباين عالي للمجلات، الكتب، والمطبوعات الفاخرة",
    subtitleEn:
      "High-contrast typography for magazines and editorial publishing",
    count: 18,
    tags: ["Luxury", "Serif", "Editorial"],
    sampleAr: "الأناقة الحقيقية لا تلفت الانتباه فقط بل تخلد في الذاكرة",
    sampleEn:
      "Elegance is not about being noticed, it is about being remembered",
  },
  {
    titleAr: "الخطوط المتغيرة والمانشيتات (Variable Display)",
    titleEn: "Variable Display Fonts",
    subtitleAr: "محاور متغيرة ديناميكية للعناوين والملصقات الإعلانية",
    subtitleEn: "Dynamic variable axes for headlines, posters, and banners",
    count: 15,
    tags: ["Variable", "Display", "Bold"],
    sampleAr: "مستقبل التايبوجرافي الرقمي بتجربة تفاعلية غير مسبوقة",
    sampleEn: "FUTURE TYPOGRAPHY REIMAGINED",
  },
];

export default function DiscoverView({
  onActivateFamily,
  t = {},
  isRtl = false,
}: any) {
  const [synced, setSynced] = useState({});

  const handleSync = (key) => {
    setSynced((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setSynced((prev) => ({ ...prev, [key]: false }));
    }, 2000);
  };

  return (
    <div
      className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none w-full"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="border-b border-[var(--color-border)] pb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-green)]">
              <Compass className="w-4 h-4" />
              <span className="uppercase tracking-widest font-bold">
                {isRtl
                  ? "استكشاف المجموعات التيبوجرافية العالمية"
                  : "Discover & Typography Curations"}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--color-text-header)] mt-1.5">
              {isRtl
                ? "استكشف المجموعات المختارة وخطوط جوجل السحابية"
                : "Explore Featured Collections & Google Fonts"}
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-1.5 leading-relaxed">
              {isRtl
                ? "مجموعات منتقاة بعناية لدمج الخطوط المتناسقة، مع أكثر من 1,600 عائلة من Google Fonts جاهزة للتفعيل والمزامنة."
                : "Hand-curated typography pairings, trending design collections, and over 1,600 Google Fonts ready to sync."}
            </p>
          </div>
        </div>

        {/* Featured Collections Grid */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            {isRtl ? "مجموعات مميزة جاهزة للاستخدام" : "Curated Collections"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FEATURED_COLLECTIONS.map((col, idx) => (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] hover:border-[var(--color-action)]/40 transition-all space-y-3.5 shadow-xs group h-full flex flex-col justify-between min-w-0"
              >
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm text-[var(--color-text-header)] group-hover:text-[var(--color-action)] transition truncate">
                      {isRtl ? col.titleAr : col.titleEn}
                    </h3>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {isRtl ? col.subtitleAr : col.subtitleEn}
                    </p>
                  </div>
                  <button
                    onClick={() => handleSync(idx)}
                    className={`h-8 px-3 rounded-xl text-xs font-medium flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                      synced[idx]
                        ? "bg-[var(--color-green)]/20 text-[var(--color-green)] border border-[var(--color-green)]/30"
                        : "bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)]"
                    }`}
                  >
                    {synced[idx] ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Cloud className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>
                      {synced[idx]
                        ? isRtl
                          ? "تم التفعيل!"
                          : "Synced!"
                        : isRtl
                          ? "تفعيل المجموعة"
                          : "Activate"}
                    </span>
                  </button>
                </div>

                {/* Sample typography */}
                <div className="p-3.5 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-header)] truncate">
                  {isRtl ? col.sampleAr : col.sampleEn}
                </div>

                {/* Tags & Count */}
                <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--color-text-muted)] font-mono flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {col.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md bg-[var(--color-control)] text-[var(--color-text-muted)] border border-[var(--color-border)] whitespace-nowrap shrink-0"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <span className="whitespace-nowrap shrink-0">
                    {col.count} {isRtl ? "خطاً" : "fonts"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
