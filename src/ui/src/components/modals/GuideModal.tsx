import React, { useState } from "react";
import {
  X,
  Zap,
  Cpu,
  FolderPlus,
  Keyboard,
  Flame,
  BookOpen,
  Cloud,
  Briefcase,
  Palette,
  Sliders,
} from "lucide-react";

export default function GuideModal({
  isOpen,
  onClose,
  onOpenOnboarding,
  t = {},
  isRtl = false,
}: any) {
  const safeT = t || {};
  const [activeTab, setActiveTab] = useState("ram");

  if (!isOpen) return null;

  const tabs = [
    {
      id: "ram",
      icon: Zap,
      label: isRtl ? "تفعيل الرام" : "RAM Activation",
    },
    {
      id: "brandkits",
      icon: Briefcase,
      label: isRtl ? "أطقم الهوية (Brand Kits)" : "Brand Kits & ASE",
    },
    {
      id: "uilab",
      icon: Sliders,
      label: isRtl ? "مختبر UI ومستخرج الألوان" : "UI Lab & Palette",
    },
    {
      id: "photoshop",
      icon: Flame,
      label: isRtl ? "فوتوشوب وتصميم" : "Photoshop & Design",
    },
    {
      id: "cleaner",
      icon: Cpu,
      label: isRtl ? "تنظيف وتسريع" : "System Cleaner",
    },
    {
      id: "cloud",
      icon: Cloud,
      label: isRtl ? "سحابة Google" : "Google Fonts",
    },
    {
      id: "folders",
      icon: FolderPlus,
      label: isRtl ? "المجلدات والمجموعات" : "Folders & Tags",
    },
    {
      id: "shortcuts",
      icon: Keyboard,
      label: isRtl ? "الاختصارات" : "Shortcuts",
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-[var(--color-text-main)]">
        {/* Header */}
        <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-back-header)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-action)] flex items-center justify-center text-white shadow-md shadow-[var(--color-action)]/30 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--color-text-header)]">
                {safeT.userGuide || "User Guidelines & Typography Architecture"}
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Fontivo —{" "}
                {isRtl
                  ? "دليل الميزات المتقدمة وتجربة الاستخدام المثالية"
                  : "Complete feature walkthrough and performance tips"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenOnboarding && (
              <button
                onClick={() => {
                  onClose();
                  onOpenOnboarding();
                }}
                className="h-9 px-3 rounded-xl bg-[var(--color-action)]/15 hover:bg-[var(--color-action)] text-[var(--color-action)] hover:text-white border border-[var(--color-action)]/30 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                title={
                  isRtl
                    ? "فتح الجولة التعريفية التفاعلية"
                    : "Open Onboarding Tour"
                }
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{isRtl ? "الجولة التعريفية" : "Onboarding Tour"}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 px-5 pt-3 border-b border-[var(--color-border)] bg-[var(--color-back-side)] overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-t-xl text-xs font-semibold border-b-2 transition cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "border-[var(--color-action)] text-[var(--color-action)] bg-[var(--color-back-card)]"
                    : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs leading-relaxed flex-1 bg-[var(--color-back-main)]">
          {activeTab === "ram" && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-2 shadow-xs">
                <h3 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[var(--color-green)]" />
                  <span>
                    {isRtl
                      ? "كيف تعمل ميزة تفعيل الخطوط بالرام دون تثبيت؟"
                      : "How does RAM font activation work without installation?"}
                  </span>
                </h3>
                <p className="text-[var(--color-text-muted)]">
                  {safeT.guideRamDesc ||
                    "RAM Activation allows you to use thousands of fonts in Photoshop, Illustrator, and Office without installing them into Windows or slowing down boot time."}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] shadow-xs">
                  <span className="font-bold text-[var(--color-green)] block mb-1">
                    {isRtl
                      ? "1. تفعيل فوري بالذاكرة"
                      : "1. Instant RAM Activation"}
                  </span>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {isRtl
                      ? "يتم تحميل ملف الخط مباشرة في ذاكرة الرام ليصبح متاحاً فوراً في برامج التصميم دون تثبيت دائم."
                      : "Loads the font directly into RAM so design apps see it immediately without permanent installation."}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] shadow-xs">
                  <span className="font-bold text-[var(--color-action)] block mb-1">
                    {isRtl ? "2. تنظيف تلقائي عند الإغلاق" : "2. Zero OS Bloat"}
                  </span>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {isRtl
                      ? "بمجرد إلغاء التفعيل أو غلق البرنامج، تختفي الخطوط فوراً دون أي أثر في الريجستري."
                      : "Deactivation immediately drops font handles, leaving your Windows registry clean."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "brandkits" && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-2 shadow-xs">
                <h3 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-[var(--color-action)]" />
                  <span>
                    {isRtl
                      ? "أطقم الهوية والمشاريع وتصدير حزم التسليم للعملاء"
                      : "Brand Identity Kits & Client Handoff Bundles"}
                  </span>
                </h3>
                <p className="text-[var(--color-text-muted)] leading-relaxed">
                  {isRtl
                    ? "يتيح لك قسم أطقم الهوية ربط خطوط العناوين والمتون وألوان العلامة التجارية مع كل عميل أو مشروع. بضغطة زر واحدة، يمكنك تفعيل كافة خطوط المشروع في الرام لبرامج التصميم، وتصدير حزمة تسليم كاملة تتضمن ملفات الخطوط وباليتة أدوبي الثنائية (.ase) ودليل هوية HTML تفاعلي مستقلاً."
                    : "Manage typography and 5-color palettes per brand or client project. With 1 click, activate all project fonts into RAM for Adobe CC, export CSS/Tailwind tokens, and generate a client handoff package including .ase Adobe swatches and standalone offline HTML style guide."}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] shadow-xs">
                  <span className="font-bold text-[var(--color-action)] block mb-1">
                    {isRtl
                      ? "تصدير باليتة أدوبي (Adobe .ASE)"
                      : "Native Adobe .ASE Binary"}
                  </span>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {isRtl
                      ? "يتم توليد ملف Swatches أصيل متوافق مع Photoshop وIllustrator وInDesign لفتح الألوان فورياً في لوحة Swatches."
                      : "Generates standard Adobe Swatch Exchange binary file opening directly inside Photoshop & Illustrator swatch panels."}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] shadow-xs">
                  <span className="font-bold text-[var(--color-green)] block mb-1">
                    {isRtl
                      ? "دليل الهوية التفاعلي (Style Guide)"
                      : "Offline Interactive Style Guide"}
                  </span>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {isRtl
                      ? "توليد صفحة HTML احترافية متجاوبة تسلم للعميل تعرض الخطوط والأوزان والألوان ورموز CSS بنقرة نسخ."
                      : "Generates a sleek offline HTML guide for the client showcasing typography specimens, color chips, and 1-click CSS code."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "uilab" && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-2 shadow-xs">
                <h3 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#B7A1D9]" />
                  <span>
                    {isRtl
                      ? "مختبر تايبوجرافي واجهات المستخدم والمستخرج الذكي"
                      : "UI/UX Typography Laboratory & Color Extractor"}
                  </span>
                </h3>
                <p className="text-[var(--color-text-muted)] leading-relaxed">
                  {isRtl
                    ? "أدوات هندسية مصممة خصيصاً لمصممي UI/UX ومطوري الواجهات: اختبر أي خط على أزرار تفاعلية وكروت حقيقية، وتحقق من ثبات الأرقام المحاسبية (Tabular Figures) في جداول الأسعار، وولد مقياس خطوط هندسي رياضي متكامل."
                    : "Specialized tools for UI/UX designers: test fonts on real interactive buttons and card mockups, verify Tabular Figures alignment in pricing tables without digit drift, and calculate mathematical type scales (Major Third, Golden Ratio)."}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] shadow-xs">
                  <span className="font-bold text-pink-400 block mb-1">
                    {isRtl
                      ? "مستخرج ألوان الشعارات والصور"
                      : "Smart Image Palette Extractor"}
                  </span>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {isRtl
                      ? "اسحب أي لوجو أو بوستر واستخرج أهم 5 ألوان مع فحص تباين النص WCAG وزر للتطبيق المباشر على شاشة المعاينة."
                      : "Sample 5 dominant colors from logos or moodboards with WCAG text contrast check and 1-click live canvas application."}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] shadow-xs">
                  <span className="font-bold text-[#B7A1D9] block mb-1">
                    {isRtl
                      ? "فاحص الأرقام المحاسبية (Tabular Figures)"
                      : "Tabular Figures Alignment"}
                  </span>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {isRtl
                      ? "مقارنة أعمدة الأرقام والأسعار للتأكد من ثبات العرض (Monospaced Digits) وعدم تمايل الفواصل العشرية."
                      : "Column comparison of numbers and decimal alignment, verifying whether digits drift in financial dashboards."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "photoshop" && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-2 shadow-xs">
                <h3 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2">
                  <Flame className="w-4 h-4 text-[var(--color-action)]" />
                  <span>
                    {isRtl
                      ? "التكامل المباشر مع Photoshop وملفات PSD / AI"
                      : "Photoshop & Creative Cloud Integration"}
                  </span>
                </h3>
                <p className="text-[var(--color-text-muted)]">
                  {safeT.guidePhotoshopDesc ||
                    "Opening or dragging any PSD file automatically detects all text layer fonts and activates them in RAM with zero missing-font dialogs."}
                </p>
              </div>
            </div>
          )}

          {activeTab === "cleaner" && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-2 shadow-xs">
                <h3 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-500" />
                  <span>
                    {isRtl
                      ? "تنظيف خطوط ويندوز وتسريع إقلاع الجهاز"
                      : "Windows Font Cleaner & System Acceleration"}
                  </span>
                </h3>
                <p className="text-[var(--color-text-muted)]">
                  {safeT.guideWindowsCleanDesc ||
                    "Factory font reset cleans corrupted or bloated registry font entries and speeds up your operating system."}
                </p>
              </div>
            </div>
          )}

          {activeTab === "cloud" && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-2 shadow-xs">
                <h3 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-[var(--color-action)]" />
                  <span>
                    {isRtl
                      ? "مزامنة وتنزيل خطوط Google Fonts السحابية"
                      : "Google Fonts Cloud Synchronization"}
                  </span>
                </h3>
                <p className="text-[var(--color-text-muted)]">
                  {isRtl
                    ? "يتصل Fontivo تلقائياً بخوادم Google Fonts لتحميل أكثر من 1,600 عائلة خطوط مجانية ومفتوحة المصدر بكافة أوزانها وتفعيلها بضغطة زر واحدة."
                    : "Fontivo automatically synchronizes with Google Fonts API, allowing 1-click cloud caching and instant RAM activation of over 1,600 families."}
                </p>
              </div>
            </div>
          )}

          {activeTab === "folders" && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-2 shadow-xs">
                <h3 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2">
                  <FolderPlus className="w-4 h-4 text-[var(--color-green)]" />
                  <span>
                    {isRtl
                      ? "مراقبة المجلدات الحية والمجموعات الذكية"
                      : "Live Folder Watching & Smart Collections"}
                  </span>
                </h3>
                <p className="text-[var(--color-text-muted)]">
                  {isRtl
                    ? "يمكنك إضافة أي مجلد محلي على الهارد ليقوم التطبيق بمراقبته في الخلفية تلقائياً، فأي خط جديد تضيفه يظهر في المكتبة فوراً."
                    : "Watch any local directory on disk. Fontivo’s native background watcher detects new font files instantly and updates your library in real time."}
                </p>
              </div>
            </div>
          )}

          {activeTab === "shortcuts" && (
            <div className="space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    key: "Ctrl + F",
                    descAr: "البحث الفوري في أسماء وعائلات الخطوط",
                    descEn: "Instant search fonts by name or family",
                  },
                  {
                    key: "Space",
                    descAr: "تفعيل أو إلغاء تفعيل الخط المحدد",
                    descEn: "Activate or deactivate selected font",
                  },
                  {
                    key: "Tab",
                    descAr: "تبديل أوضاع العرض (عائلات / شبكة / شريط)",
                    descEn: "Toggle layout view modes",
                  },
                  {
                    key: "Ctrl + Shift + R",
                    descAr: "تسريع وتفريغ ذاكرة الرام فوراً",
                    descEn: "Instant RAM optimization & cache trim",
                  },
                  {
                    key: "Esc",
                    descAr: "إغلاق النوافذ المنبثقة والعودة للرئيسية",
                    descEn: "Close open modals or inspector",
                  },
                  {
                    key: "Ctrl + P",
                    descAr: "فتح فاحص ملفات التصميم الفوتوشوب",
                    descEn: "Open Adobe CC PSD inspector",
                  },
                ].map((sc, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] flex items-center justify-between gap-3 shadow-xs"
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
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[var(--color-back-side)] border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <span>
            {isRtl
              ? "Fontivo — التيبوجرافي الرقمي بأعلى معايير الأداء"
              : "Fontivo — High Performance Digital Typography"}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[var(--color-action)] hover:opacity-90 text-white font-semibold transition cursor-pointer shadow-xs"
          >
            {safeT.gotIt || "Got It"}
          </button>
        </div>
      </div>
    </div>
  );
}
