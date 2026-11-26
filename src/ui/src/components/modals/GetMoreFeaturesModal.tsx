import {
  X,
  Check,
  Crown,
  Zap,
  Cloud,
  Search,
  ShieldCheck,
  Database,
  Briefcase,
  Palette,
  Sliders,
} from "lucide-react";

export default function GetMoreFeaturesModal({
  isOpen,
  onClose,
  t = {},
  isRtl = false,
}: any) {
  if (!isOpen) return null;

  const features = [
    {
      icon: Crown,
      title: isRtl
        ? "ترقية Fontivo Pro الاحترافية — مفعلة بالكامل"
        : "Fontivo Pro Tier — 100% Unlocked",
      desc: isRtl
        ? "كافة ميزات إدارة وفهرسة وتفعيل الخطوط والباليتات الاحترافية مفعلة ومتاحة مجاناً للأبد."
        : "All professional font indexing, color palette management, and activation features permanently active.",
    },
    {
      icon: Zap,
      title: isRtl
        ? "تفعيل تلقائي مباشر لبرامج أدوبي (Adobe CC)"
        : "Adobe CC Real-Time Auto-Activation",
      desc: isRtl
        ? "ربط مباشر وتلقائي يستجيب فوراً لملفات Photoshop وIllustrator وInDesign."
        : "Direct real-time bridge automatically responds to Photoshop, Illustrator, and InDesign requests.",
    },
    {
      icon: Cloud,
      title: isRtl
        ? "منظومة Google Fonts (أكثر من 1,600 عائلة)"
        : "Google Fonts Ecosystem (1,600+ Families)",
      desc: isRtl
        ? "مزامنة سحابية مباشرة وتخزين مؤقت وتفعيل فوري لكافة خطوط جوجل المفتوحة."
        : "Direct cloud sync, caching, and instant activation of Google Web Fonts.",
    },
    {
      icon: Search,
      title: isRtl
        ? "البحث الفائق وفحص خصائص OpenType"
        : "SuperSearch & OpenType Metrics",
      desc: isRtl
        ? "البحث بحسب السماكة، اللغات المدعومة، التباين، الميول، وخصائص التركيب البصري."
        : "Search by weight, script, contrast, slant, glyph count, and OpenType ligature capabilities.",
    },
    {
      icon: Briefcase,
      title: isRtl
        ? "أطقم الهوية وحزم تسليم العملاء (Brand Kits & ASE)"
        : "Brand Identity & Client Handoff Kits",
      desc: isRtl
        ? "إدارة خطوط وألوان المشاريع مع تفعيل فوري في الذاكرة وتصدير ملفات ASE لأدوبي ودليل الهوية التفاعلي."
        : "Manage project typography, palettes, 1-click RAM activation, Adobe ASE swatches, and HTML style guides.",
    },
    {
      icon: Palette,
      title: isRtl
        ? "المستخرج الذكي لباليتات الألوان (Color Palette Extractor)"
        : "Smart Color Palette Extractor",
      desc: isRtl
        ? "سحب وإفلات الشعارات والصور لاستخراج باليتات الألوان وحساب تباين WCAG وتطبيقها مباشرة."
        : "Extract dominant color palettes from logos, calculate WCAG contrast, and preview live on canvas.",
    },
    {
      icon: Sliders,
      title: isRtl
        ? "مختبر تايبوجرافي واجهات المستخدم (UI/UX Lab)"
        : "UI/UX Typography Laboratory",
      desc: isRtl
        ? "فحص الخطوط على أزرار تفاعلية، كروت، جداول أسعار محاسبية، ومولد المقاييس الرياضية للخطوط."
        : "Test fonts on real UI buttons, cards, tabular figures, and mathematical type scales with CSS export.",
    },
    {
      icon: Database,
      title: isRtl
        ? "كاش أوفلاين ضخم لـ 10,939 خطاً"
        : "Massive Offline Font Cache (10,939 Fonts)",
      desc: isRtl
        ? "محرك افتراضي فائق السرعة يعرض ~11,000 خط بدون أي استهلاك لذاكرة النظام وبدون تلويث ريجستري ويندوز."
        : "Instant zero-lag virtualization of 10,939 fonts with memory-only activation without Windows registry bloat.",
    },
    {
      icon: ShieldCheck,
      title: isRtl
        ? "صلاحيات المدير الكاملة لنظام ويندوز"
        : "Windows Administrator Elevation",
      desc: isRtl
        ? "تكامل محمي مع نظام ويندوز وصلاحيات المدير لتفعيل الخطوط عبر كافة تطبيقات النظام."
        : "Full administrator elevation ensuring seamless font activation in system apps and network bindings.",
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-[var(--color-text-main)]">
        {/* Header */}
        <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-back-header)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-action)] flex items-center justify-center text-white shadow-sm shrink-0">
              <Crown className="w-5 h-5" />
            </div>

            <div>
              <h3 className="font-bold text-base text-[var(--color-text-header)] font-sans">
                {isRtl
                  ? "ميزات Fontivo Pro الاحترافية"
                  : "Fontivo Pro Features"}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {isRtl
                  ? "كافة الميزات الاحترافية مفتوحة ومتاحة مجاناً للأبد"
                  : "All professional features included permanently and unlocked"}
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

        {/* Feature List */}
        <div className="p-5 sm:p-6 space-y-3 flex-1 overflow-y-auto">
          {features.map((feat, idx) => {
            const Icon = feat.icon;
            return (
              <div
                key={idx}
                className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border-subtle)] transition hover:border-[var(--color-action)]/40"
              >
                <div className="w-7 h-7 rounded-lg bg-[var(--color-green)]/15 border border-[var(--color-green)]/30 flex items-center justify-center text-[var(--color-green)] shrink-0 mt-0.5">
                  <Check className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div
                  className="flex-1 min-w-0"
                  style={{
                    direction: isRtl ? "rtl" : "ltr",
                    textAlign: isRtl ? "right" : "left",
                  }}
                >
                  <h4 className="text-xs font-bold text-[var(--color-text-header)]">
                    {feat.title}
                  </h4>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-relaxed">
                    {feat.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[var(--color-back-side)] border-t border-[var(--color-border)] flex items-center justify-between">
          <div className="text-[11px] font-medium text-[var(--color-text-muted)] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-green)] shadow-[0_0_8px_var(--color-green)]" />
            <span>
              {isRtl ? "ترخيص دائم مدى الحياة مفعّل" : "Lifetime License Active"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-semibold shadow-sm transition cursor-pointer"
          >
            {isRtl ? "حسناً، فهمت" : "Got It"}
          </button>
        </div>
      </div>
    </div>
  );
}
