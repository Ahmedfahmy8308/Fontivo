import React from "react";
import {
  X,
  Code2,
  Palette,
  Globe,
  ExternalLink,
  Cpu,
  ShieldCheck,
  Zap,
  Github,
  Users,
} from "lucide-react";

export interface AboutDeveloperModalProps {
  isOpen: boolean;
  onClose: () => void;
  t?: Record<string, string>;
  isRtl?: boolean;
}

export default function AboutDeveloperModal({
  isOpen,
  onClose,
  t = {},
  isRtl = false,
}: AboutDeveloperModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150"
      dir={isRtl ? "rtl" : "ltr"}
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 text-[var(--color-text-main)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with App Branding & Window Controls */}
        <div className="relative p-5 sm:p-6 border-b border-[var(--color-border)] bg-[var(--color-back-header)] flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F16B50] to-[#B7A1D9] p-0.5 shadow-md shrink-0 flex items-center justify-center">
              <div className="w-full h-full rounded-[14px] bg-[var(--color-back-card)] flex items-center justify-center p-2">
                <img
                  src="/fontivo-mark.svg"
                  alt="Fontivo"
                  className="w-full h-full object-contain"
                  onError={(e: any) => {
                    e.target.src = "/fontivo-icon.svg";
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-[var(--color-text-header)] tracking-tight font-display">
                  {isRtl
                    ? "فريق عمل وتطوير فونتيفو"
                    : "Fontivo Team & Creators"}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-[var(--color-action)]/15 border border-[var(--color-action)]/30 text-[var(--color-action)] text-[10px] font-mono font-bold">
                  v1.0.0
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {isRtl
                  ? "محرك إدارة وتفعيل الخطوط فائق السرعة والمبني للمصممين"
                  : "Next-gen ultra-fast typography engine built for creatives"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
            title={isRtl ? "إغلاق النافذة" : "Close window"}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-5 sm:p-6 space-y-6 text-xs overflow-y-auto flex-1">
          {/* Section Title */}
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
            <Users className="w-4 h-4 text-[var(--color-action)]" />
            <span>
              {isRtl ? "المطورون والمصممون" : "Core Team & Specialists"}
            </span>
          </div>

          {/* Team Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. المهندس أحمد فهمي */}
            <div className="bg-[var(--color-back-subtle)] border border-[var(--color-border)] hover:border-[#B7A1D9]/50 rounded-2xl p-5 space-y-4 transition flex flex-col justify-between shadow-xs">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-[#B7A1D9]/25 to-[#291C2E]/60 border border-[#B7A1D9]/35 flex items-center justify-center text-[#B7A1D9] font-black text-base shadow-inner shrink-0">
                    AF
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-[var(--color-text-header)] text-sm tracking-tight truncate">
                      {isRtl ? "المهندس أحمد فهمي" : "Eng. Ahmed Fahmy"}
                    </h4>
                    <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full bg-[#B7A1D9]/15 border border-[#B7A1D9]/30 text-[#B7A1D9] text-[10px] font-bold">
                      <Code2 className="w-3 h-3" />
                      <span>
                        {isRtl
                          ? "مسؤول التكنولوجيا والبرمجة"
                          : "Technology & Programming"}
                      </span>
                    </span>
                  </div>
                </div>

                <div
                  className="p-3 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border-subtle)] space-y-1.5"
                  dir="auto"
                >
                  <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                    {isRtl
                      ? "تطوير محرك التطبيق بلغة Rust، وتفعيل الخطوط بالذاكرة، وجسر ربط Adobe CC، ومنصة Fontivo."
                      : "Built the native Rust desktop engine, in-memory font activation, Adobe CC bridge, and web platform."}
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <a
                  href="https://ahmed-fahmy.engineer/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-action)] hover:text-[#130C16] border border-[var(--color-border)] hover:border-[var(--color-action)] text-[var(--color-text-header)] font-semibold text-xs transition duration-200 cursor-pointer w-full group shadow-2xs"
                >
                  <Globe className="w-3.5 h-3.5 text-[#B7A1D9] group-hover:text-[#130C16] transition-colors" />
                  <span className="truncate">ahmed-fahmy.engineer</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </a>
              </div>
            </div>

            {/* 2. المهندس محمد الأشوح */}
            <div className="bg-[var(--color-back-subtle)] border border-[var(--color-border)] hover:border-[#F16B50]/50 rounded-2xl p-5 space-y-4 transition flex flex-col justify-between shadow-xs">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-13 h-13 rounded-2xl bg-[#F16B50]/15 border border-[#F16B50]/35 flex items-center justify-center text-[#F16B50] font-black text-base shadow-inner shrink-0">
                    ME
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-[var(--color-text-header)] text-sm tracking-tight truncate">
                      {isRtl ? "المهندس محمد الأشوح" : "Eng. Mohamed Elashwah"}
                    </h4>
                    <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full bg-[#F16B50]/15 border border-[#F16B50]/30 text-[#F16B50] text-[10px] font-bold">
                      <Palette className="w-3 h-3" />
                      <span>
                        {isRtl
                          ? "مسؤول الهوية والخطوط"
                          : "Brand Identity & Fonts"}
                      </span>
                    </span>
                  </div>
                </div>

                <div
                  className="p-3 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border-subtle)] space-y-1.5"
                  dir="auto"
                >
                  <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                    {isRtl
                      ? "تصميم الهوية البصرية والشعار وأنظمة الألوان وتنسيق وتنظيم حزم الخطوط العربية والعالمية."
                      : "Designed the visual identity, brand mark, color system, and curated multi-script font packs."}
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <a
                  href="https://mohamed-elashwah.me/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-action)] hover:text-white border border-[var(--color-border)] hover:border-[var(--color-action)] text-[var(--color-text-header)] font-semibold text-xs transition duration-200 cursor-pointer w-full group shadow-2xs"
                >
                  <Globe className="w-3.5 h-3.5 text-[#F16B50] group-hover:text-white transition-colors" />
                  <span className="truncate">mohamed-elashwah.me</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </a>
              </div>
            </div>
          </div>

          {/* Architecture Highlights */}
          <div className="p-4 rounded-2xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] space-y-3">
            <div className="flex items-center gap-2 font-bold text-xs text-[var(--color-text-header)]">
              <Cpu className="w-4 h-4 text-[var(--color-action)]" />
              <span>
                {isRtl
                  ? "المواصفات التقنية لمحرك Fontivo:"
                  : "Fontivo Engine Architecture:"}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              {[
                {
                  icon: Zap,
                  title: isRtl ? "تفعيل بالرام فوراً" : "0ms RAM Activation",
                  desc: isRtl
                    ? "بدون إعادة تشغيل الويندوز"
                    : "No reboot required",
                  color: "text-amber-400",
                },
                {
                  icon: ShieldCheck,
                  title: isRtl ? "محلي وآمن 100%" : "Local-First & Private",
                  desc: isRtl ? "لا تتبع أو جمع بيانات" : "Zero telemetry",
                  color: "text-[var(--color-green)]",
                },
                {
                  icon: Code2,
                  title: isRtl ? "محرك Native Rust" : "Native Rust Engine",
                  desc: isRtl ? "استهلاك رام منخفض جداً" : "Ultra-low memory",
                  color: "text-[#B7A1D9]",
                },
                {
                  icon: Palette,
                  title: isRtl ? "دعم Adobe CC" : "Adobe CC Ready",
                  desc: isRtl
                    ? "فوتوشوب وإليستريتور"
                    : "Auto-activation bridge",
                  color: "text-[#F16B50]",
                },
              ].map((item, idx) => {
                const IconComp = item.icon;
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border-subtle)] space-y-1 shadow-2xs"
                  >
                    <IconComp className={`w-4 h-4 ${item.color}`} />
                    <div className="font-bold text-[11px] text-[var(--color-text-header)]">
                      {item.title}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      {item.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 bg-[var(--color-back-header)] border-t border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://github.com/Ahmedfahmy8308/Fontivo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[var(--color-text-muted)] hover:text-white font-mono inline-flex items-center gap-1 transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              <span>Fontivo Repo</span>
            </a>
            <span className="text-zinc-600">•</span>
            <a
              href="https://github.com/Ahmedfahmy8308/Fontivo-Fonts"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[var(--color-text-muted)] hover:text-white font-mono inline-flex items-center gap-1 transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              <span>Fonts Repo</span>
            </a>
            <span className="text-zinc-600">•</span>
            <a
              href="https://ahmedfahmy8308.github.io/Fontivo-Site/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-amber-400 hover:text-amber-300 font-mono inline-flex items-center gap-1 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>ahmedfahmy8308.github.io/Fontivo-Site</span>
            </a>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-[var(--color-action)] hover:opacity-90 text-white font-bold text-xs transition cursor-pointer shadow-sm"
            >
              {isRtl ? "تم / إغلاق" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
