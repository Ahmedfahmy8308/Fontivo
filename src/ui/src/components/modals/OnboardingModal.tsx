import React, { useState } from "react";
import {
  X,
  Zap,
  HardDrive,
  CloudDownload,
  Palette,
  ArrowRight,
  ArrowLeft,
  Check,
  Activity,
} from "lucide-react";

export interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  isRtl?: boolean;
  t?: any;
  onNavigateToTab?: (tab: string) => void;
}

export default function OnboardingModal({
  isOpen,
  onClose,
  isRtl = false,
  t = {},
  onNavigateToTab,
}: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      id: "ram-activation",
      icon: Zap,
      badge: isRtl ? "الابتكار الأساسي" : "Core Innovation",
      title: isRtl ? "مرحباً بك في Fontivo" : "Welcome to Fontivo",
      subtitle: isRtl
        ? "تفعيل فوري في الذاكرة (RAM) بدون أي بطء للنظام"
        : "Instant temporary RAM activation, zero system slowdown",
      description: isRtl
        ? "يقوم Fontivo بتفعيل الخطوط مباشرة في ذاكرة الرام أثناء عملك على برامج التصميم، دون تثبيتها الدائم في ملفات النظام، مما يبقي حاسوبك سريعاً."
        : "Fontivo activates fonts temporarily in RAM while you design, without cluttering Windows system fonts or slowing down startup. Enjoy thousands of fonts with zero lag.",
      highlights: [
        {
          title: isRtl ? "سرعة فائقة < 2ms" : "Ultra-Fast < 2ms",
          desc: isRtl
            ? "تفعيل وإلغاء تفعيل الخطوط فوراً بنقرة واحدة"
            : "Instant toggle activation with zero latency",
        },
        {
          title: isRtl ? "حماية النظام 100%" : "100% Registry Safe",
          desc: isRtl
            ? "لا تراكم لآلاف الخطوط داخل مجلد ويندوز"
            : "No bloated C:\\Windows\\Fonts directory",
        },
        {
          title: isRtl ? "استهلاك ذاكرة ضئيل" : "Minimal Footprint",
          desc: isRtl
            ? "محرك Rust فائق الخفة يستهلك أقل من 25MB"
            : "Rust engine consumes less than 25MB RAM",
        },
      ],
      quickAction: {
        tab: "library",
        label: isRtl ? "استعراض المكتبة" : "Explore Library",
      },
    },
    {
      id: "windows-fonts",
      icon: HardDrive,
      badge: isRtl ? "إدارة النظام" : "System Guard",
      title: isRtl ? "مدير خطوط نظام ويندوز" : "Windows System Fonts",
      subtitle: isRtl
        ? "فحص وتمييز خطوط النظام المحمية مع استعادة ضبط المصنع"
        : "Manage installed fonts, safely distinguish protected core fonts",
      description: isRtl
        ? "يميز Fontivo بذكاء خطوط ويندوز الأساسية (Segoe UI, Arial, Calibri, Tahoma) لحمايتها من الحذف العرضي، ويسمح لك باكتشاف الخطوط الخارجية وإلغاء تثبيتها أو استعادة ضبط المصنع مع نسخ احتياطي فوري."
        : "Fontivo automatically identifies and protects core operating system fonts from accidental deletion, while enabling you to audit third-party user fonts and perform factory resets with safety backups.",
      highlights: [
        {
          title: isRtl ? "حماية أصول ويندوز" : "Core OS Protection",
          desc: isRtl
            ? "عزل خطوط واجهة النظام الأساسية لمنع تلفها"
            : "Prevents accidental removal of essential UI fonts",
        },
        {
          title: isRtl ? "استعادة ضبط المصنع" : "Factory Reset & Clean",
          desc: isRtl
            ? "تنظيف الخطوط الدخيلة والتالفة بنقرة زر واحدة"
            : "1-Click cleanup of rogue fonts causing crashes",
        },
        {
          title: isRtl ? "نسخ احتياطي تلقائي" : "Automatic Backup",
          desc: isRtl
            ? "حفظ نسخة آمنة من أي خط قبل نقله أو حذفه"
            : "Safety backup folder created prior to any removal",
        },
      ],
      quickAction: {
        tab: "windows-fonts",
        label: isRtl ? "فتح مدير خطوط ويندوز" : "Open Windows Manager",
      },
    },
    {
      id: "cloud-catalog",
      icon: CloudDownload,
      badge: isRtl ? "السحابة الرقمية" : "Cloud Ecosystem",
      title: isRtl
        ? "السحابة وحزم الخطوط الجاهزة"
        : "Cloud Catalog & 1-Click Packages",
      subtitle: isRtl
        ? "تنزيل حزم منسقة لأكثر من 11,200 خط حسب رغبتك"
        : "Browse & download curated Arabic and English font packs on-demand",
      description: isRtl
        ? "استمتع بمكتبة سحابية ضخمة تضم 15 حزمة مقسمة حسب التصنيف (الكوفي، الرقعة، النسخ، العناوين، اللاتينية، والرموز). يمكنك تنزيل ما تحتاجه فقط بضغطة زر دون الحاجة لتحميل غيغابايت دفعة واحدة."
        : "Access 15 curated cloud packages containing 11,200+ fonts categorized by calligraphy, modern sans, serif, display, and global scripts. Download only the collections you need on-demand via fast CDN.",
      highlights: [
        {
          title: isRtl ? "15 حزمة سحابية مجهزة" : "15 Curated Packages",
          desc: isRtl
            ? "حزم متخصصة للخطوط العربية والإنجليزية"
            : "Targeted packs for Arabic & Latin typography",
        },
        {
          title: isRtl ? "تنزيل سريع ومستقل" : "Self-Sufficient CDN",
          desc: isRtl
            ? "فك ضغط وفهرسة فورية داخل مكتبتك المحلية"
            : "Instant automatic extraction & local indexing",
        },
        {
          title: isRtl ? "استكشاف Google Fonts" : "Google Fonts Integration",
          desc: isRtl
            ? "تصفح وتثبيت خطوط Google Fonts المفتوحة"
            : "Browse and install open-source Google Fonts",
        },
      ],
      quickAction: {
        tab: "library",
        label: isRtl ? "عرض الحزم السحابية" : "View Cloud Packs",
      },
    },
    {
      id: "adobe-studio",
      icon: Palette,
      badge: isRtl ? "التكامل الإبداعي" : "Creative Workflow",
      title: isRtl
        ? "جسر أدوبي واستوديو الألوان"
        : "Adobe CC Bridge & Color Studio",
      subtitle: isRtl
        ? "مزامنة تلقائية مع فوتوشوب وتصدير لوحات ألوان .ASE"
        : ".ASE palettes & live auto-activation in Photoshop/Illustrator",
      description: isRtl
        ? "يعمل Fontivo في الخلفية ليكتشف ملفات الفوتوشوب والإليستريتور المفتوحة ويفعل أي خط مفقود فورياً. كما يتيح لك استوديو الألوان استخراج الألوان من التصاميم وتصدير ملفات .ASE."
        : "Fontivo automatically detects open Photoshop and Illustrator documents and activates missing fonts in one click. Extract color palettes and export standard Adobe .ASE swatches effortlessly.",
      highlights: [
        {
          title: isRtl ? "تفعيل أدوبي التلقائي" : "Live Adobe CC Sync",
          desc: isRtl
            ? "تفعيل تلقائي بدون الحاجة للبحث اليدوي عن الخط"
            : "Auto-activates missing fonts upon opening PSD/AI",
        },
        {
          title: isRtl ? "استوديو الألوان ومحدد ASE" : "Color Studio & .ASE",
          desc: isRtl
            ? "توليد لوحات متناسقة وتصديرها لبرامج أدوبي"
            : "Generate harmonized swatches for design apps",
        },
        {
          title: isRtl ? "فاحص ومقارنة الخطوط" : "Inspector & Comparison",
          desc: isRtl
            ? "شلال الأحجام وفاحص الحروف والمحارف الكاملة"
            : "Waterfall sizing, glyph grid, and side-by-side compare",
        },
      ],
      quickAction: {
        tab: "adobe",
        label: isRtl ? "فتح جسر أدوبي" : "Open Adobe Bridge",
      },
    },
  ];

  const step = steps[currentStep];
  const StepIcon = step.icon;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleComplete = (targetTab?: string) => {
    try {
      localStorage.setItem("fontivo_onboarded_v1", "true");
    } catch {
      // ignore storage quota issues
    }
    onClose();
    if (targetTab && onNavigateToTab) {
      onNavigateToTab(targetTab);
    }
  };

  const NextArrow = isRtl ? ArrowLeft : ArrowRight;
  const PrevArrow = isRtl ? ArrowRight : ArrowLeft;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="w-full max-w-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col text-[var(--color-text-main)] animate-in zoom-in-95 duration-150 relative">
        {/* Top Header & Step Progress Bar */}
        <div className="p-6 pb-4 border-b border-[var(--color-border)] bg-[var(--color-back-header)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-action)] flex items-center justify-center text-white shadow-md shadow-[var(--color-action)]/30 shrink-0">
              <StepIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-[var(--color-action)]/15 text-[var(--color-action)] border border-[var(--color-action)]/30">
                  {step.badge}
                </span>
                <span className="text-xs text-[var(--color-text-muted)] font-mono">
                  {isRtl
                    ? `الخطوة ${currentStep + 1} من ${steps.length}`
                    : `Step ${currentStep + 1} of ${steps.length}`}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-[var(--color-text-header)] tracking-tight mt-0.5">
                {step.title}
              </h2>
            </div>
          </div>

          <button
            onClick={() => handleComplete()}
            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
            title={isRtl ? "إغلاق الجولة" : "Close Tour"}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Dots Indicator */}
        <div className="px-6 pt-3 flex items-center gap-2">
          {steps.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => setCurrentStep(idx)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                idx === currentStep
                  ? "w-10 bg-[var(--color-action)]"
                  : idx < currentStep
                    ? "w-4 bg-[var(--color-green)] opacity-80"
                    : "w-4 bg-[var(--color-border)] hover:bg-[var(--color-text-muted)]"
              }`}
              title={s.title}
            />
          ))}
        </div>

        {/* Step Body Content */}
        <div className="p-6 space-y-5">
          {/* Subtitle & Description */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2">
              <Zap className="w-4 h-4 text-[var(--color-action)] shrink-0" />
              <span>{step.subtitle}</span>
            </h3>
            <p className="text-xs sm:text-[13px] text-[var(--color-text-muted)] leading-relaxed">
              {step.description}
            </p>
          </div>

          {/* 3 Key Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {step.highlights.map((h, i) => (
              <div
                key={i}
                className="p-3.5 rounded-2xl bg-[var(--color-control)]/70 border border-[var(--color-border)] hover:border-[var(--color-action)]/50 transition flex flex-col justify-between space-y-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-action)] shrink-0" />
                  <h4 className="text-xs font-bold text-[var(--color-text-header)] truncate">
                    {h.title}
                  </h4>
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)] leading-normal">
                  {h.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Feature interactive peek banner */}
          <div className="p-3.5 rounded-2xl bg-[var(--color-control)] border border-[var(--color-border)] flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[var(--color-action)]/20 text-[var(--color-action)] flex items-center justify-center shrink-0">
                <Activity className="w-3.5 h-3.5" />
              </div>
              <span className="text-[var(--color-text-header)] font-medium">
                {isRtl
                  ? "يمكنك دائماً إعادة فتح هذه الجولة من زر الدليل في الشريط العلوي."
                  : "You can revisit this onboarding tour at any time from Help & Guide."}
              </span>
            </div>

            {onNavigateToTab && (
              <button
                onClick={() => handleComplete(step.quickAction.tab)}
                className="px-3 py-1.5 rounded-xl bg-[var(--color-action)]/15 hover:bg-[var(--color-action)] text-[var(--color-action)] hover:text-white border border-[var(--color-action)]/30 text-[11px] font-semibold transition cursor-pointer shrink-0"
              >
                {step.quickAction.label}
              </button>
            )}
          </div>
        </div>

        {/* Footer Navigation Bar */}
        <div className="p-5 px-6 border-t border-[var(--color-border)] bg-[var(--color-back-header)]/40 flex items-center justify-between gap-3">
          {/* Skip Button */}
          <button
            type="button"
            onClick={() => handleComplete()}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] transition cursor-pointer underline px-2 py-1"
          >
            {isRtl ? "تخطي الجولة" : "Skip Tour"}
          </button>

          {/* Prev / Next / Finish Controls */}
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-4 py-2 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-border)] text-xs text-[var(--color-text-header)] font-semibold transition cursor-pointer flex items-center gap-1.5 border border-[var(--color-border)]"
              >
                <PrevArrow className="w-3.5 h-3.5" />
                <span>{isRtl ? "السابق" : "Previous"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2.5 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5"
            >
              <span>
                {isLastStep
                  ? isRtl
                    ? "ابدأ استخدام Fontivo"
                    : "Get Started with Fontivo"
                  : isRtl
                    ? "التالي"
                    : "Next"}
              </span>
              {isLastStep ? (
                <Check className="w-4 h-4" />
              ) : (
                <NextArrow className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
