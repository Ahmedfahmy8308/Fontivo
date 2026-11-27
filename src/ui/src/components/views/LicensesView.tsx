import React, { useEffect, useState } from "react";
import {
  FileText,
  ShieldCheck,
  Code2,
  Globe,
  ExternalLink,
  Cpu,
  CheckCircle2,
  Lock,
  Heart,
  Terminal,
  Brush,
  Download,
  RefreshCw,
  ArrowUpCircle,
  Sparkles,
  Layers,
  Zap,
  AlertCircle,
} from "lucide-react";
import uiPkg from "../../../package.json";

const APP_VERSION = uiPkg.version;

export interface LicensesViewProps {
  families?: any[];
  t?: Record<string, string>;
  isRtl?: boolean;
}

export default function LicensesView({
  families = [],
  t = {},
  isRtl = false,
}: LicensesViewProps) {
  const [totalDownloads, setTotalDownloads] = useState<number | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [applyingUpdate, setApplyingUpdate] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchGithubDownloads = async () => {
      try {
        const [appRes, fontsRes] = await Promise.all([
          fetch("https://api.github.com/repos/Ahmedfahmy8308/Fontivo/releases"),
          fetch(
            "https://api.github.com/repos/Ahmedfahmy8308/Fontivo-Fonts/releases",
          ),
        ]);
        let sum = 0;
        if (appRes.ok) {
          const appReleases = await appRes.json();
          if (Array.isArray(appReleases)) {
            for (const rel of appReleases) {
              for (const asset of rel.assets || []) {
                sum += Number(asset.download_count || 0);
              }
            }
          }
        }
        if (fontsRes.ok) {
          const fontsReleases = await fontsRes.json();
          if (Array.isArray(fontsReleases)) {
            for (const rel of fontsReleases) {
              for (const asset of rel.assets || []) {
                sum += Number(asset.download_count || 0);
              }
            }
          }
        }
        if (active && sum > 0) {
          setTotalDownloads(sum);
        }
      } catch {
        // Offline or rate-limited: keep clean fallback
      }
    };
    fetchGithubDownloads();
    return () => {
      active = false;
    };
  }, []);

  const handleCheckUpdates = async () => {
    setCheckingUpdate(true);
    try {
      let res = await fetch("/api/updater/check", { method: "POST" });
      if (!res.ok) {
        res = await fetch("/api/updater");
      }
      const data = await res.json();
      setUpdateInfo(data);
    } catch (e: any) {
      setUpdateInfo({
        status: "error",
        message:
          e?.message ||
          (isRtl ? "تعذر الاتصال بخادم التحديثات" : "Could not check updates"),
      });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    setApplyingUpdate(true);
    try {
      await fetch("/api/updater/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ silent: true }),
      });
    } catch {
      // ignore
    } finally {
      setTimeout(() => setApplyingUpdate(false), 4000);
    }
  };

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none w-full"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-[var(--color-border)] bg-[var(--color-back-card)] flex flex-col lg:flex-row lg:items-center justify-between shrink-0 gap-4 w-full">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-action)]">
            <FileText className="w-4 h-4 shrink-0" />
            <span className="uppercase tracking-widest font-bold">
              {isRtl ? "التراخيص وحول التطبيق" : "License & About"}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text-header)] mt-1 tracking-tight">
            {isRtl
              ? "حول برنامج Fontivo والتراخيص والتحديثات"
              : "About Fontivo, License & Updates"}
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-2xl leading-relaxed">
            {isRtl
              ? "منصة متكاملة لإدارة وتفعيل الخطوط في الذاكرة دون إثقال ويندوز، مع أدوات استوديو الألوان وهوية العلامات التجارية وربط مباشر ببرامج التصميم."
              : "A local-first native typography & brand identity suite for zero-bloat RAM font activation, color studio precision, and direct design workflow sync."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {totalDownloads !== null && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-back-subtle)] border border-[var(--color-border)] text-[var(--color-text-header)] text-xs font-mono">
              <Download className="w-3.5 h-3.5 text-[var(--color-action)]" />
              <span>
                {totalDownloads.toLocaleString()}{" "}
                {isRtl ? "تحميل عبر GitHub" : "GitHub Downloads"}
              </span>
            </span>
          )}
          <span className="px-3.5 py-1.5 rounded-full bg-[#B7A1D9]/15 border border-[#B7A1D9]/35 text-[#B7A1D9] text-xs font-bold font-mono">
            {isRtl ? "مجاني ومفتوح المصدر 100%" : "100% Free & Open-Source"}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7 space-y-6 w-full">
        {/* Software Updates & Version Verification Section */}
        <div className="space-y-3 w-full">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-[var(--color-action)]" />
            <span>
              {isRtl
                ? "التحقق من التحديثات وحالة الإصدار"
                : "Updates & Version Verification"}
            </span>
          </div>

          <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl p-5 sm:p-6 space-y-4 w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                  <h3 className="text-sm sm:text-base font-bold text-[var(--color-text-header)]">
                    Fontivo Desktop v{APP_VERSION}
                  </h3>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[var(--color-back-subtle)] border border-[var(--color-border)] text-[#B7A1D9] font-semibold">
                    Fontivo-Fonts v1.0.3 (10,939 Fonts)
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  {isRtl
                    ? "يتم التحقق تلقائياً عند التشغيل من آخر إصدار للبرنامج وحزم الخطوط على GitHub مع إمكانية التحديث الفوري بنقرة واحدة."
                    : "Automatically checks GitHub on startup for new Desktop releases and Fontivo-Fonts pack updates with 1-click installation."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={handleCheckUpdates}
                  disabled={checkingUpdate}
                  className="h-9 px-4 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-[#130C16] font-bold text-xs flex items-center gap-2 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <ArrowUpCircle
                    className={`w-4 h-4 ${checkingUpdate ? "animate-spin" : ""}`}
                  />
                  <span>
                    {checkingUpdate
                      ? isRtl
                        ? "جاري التحقق..."
                        : "Checking..."
                      : isRtl
                        ? "التحقق من وجود تحديثات"
                        : "Check for Updates"}
                  </span>
                </button>

                <button
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(
                        new CustomEvent("fontivo:open-updater"),
                      );
                    }
                  }}
                  className="h-9 px-4 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-header)] flex items-center gap-2 transition cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#B7A1D9]" />
                  <span>
                    {isRtl ? "فتح مركز التحديثات" : "Open Updates Center"}
                  </span>
                </button>
              </div>
            </div>

            {updateInfo && (
              <div
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                  updateInfo.error || updateInfo.status === "error"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    : updateInfo.status === "ready_to_install"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-[var(--color-back-subtle)] border-[var(--color-border)] text-[var(--color-text-header)]"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {updateInfo.error || updateInfo.status === "error" ? (
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : updateInfo.status === "downloading" ||
                    updateInfo.hasUpdate ? (
                    <RefreshCw
                      className={`w-4 h-4 text-[var(--color-action)] shrink-0 ${
                        updateInfo.status === "downloading"
                          ? "animate-spin"
                          : ""
                      }`}
                    />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  <span className="min-w-0 break-words">
                    {updateInfo.error || updateInfo.status === "error"
                      ? isRtl
                        ? `تعذر التحقق من التحديثات حالياً: ${updateInfo.error || updateInfo.message || "يرجى المحاولة مجدداً"}`
                        : `Unable to check for updates: ${updateInfo.error || updateInfo.message || "Please try again"}`
                      : updateInfo.status === "ready_to_install"
                        ? isRtl
                          ? `التحديث Fontivo v${updateInfo.latestVersion || APP_VERSION} جاهز للتثبيت الآن.`
                          : `Update Fontivo v${updateInfo.latestVersion || APP_VERSION} is downloaded and ready.`
                        : updateInfo.status === "downloading"
                          ? isRtl
                            ? `جاري تنزيل الإصدار v${updateInfo.latestVersion || APP_VERSION} (${updateInfo.downloadProgress ?? 0}%)...`
                            : `Downloading Fontivo v${updateInfo.latestVersion || APP_VERSION} (${updateInfo.downloadProgress ?? 0}%)...`
                          : updateInfo.hasUpdate && updateInfo.latestVersion
                            ? isRtl
                              ? `يتوفر إصدار جديد v${updateInfo.latestVersion} (المثبت: v${updateInfo.currentVersion || APP_VERSION}).`
                              : `A newer version v${updateInfo.latestVersion} is available (installed: v${updateInfo.currentVersion || APP_VERSION}).`
                            : updateInfo.message ||
                              (isRtl
                                ? `أنت تستخدم أحدث إصدار مستقر حالياً (v${updateInfo.currentVersion || APP_VERSION}).`
                                : `You are running the latest stable version (v${updateInfo.currentVersion || APP_VERSION}).`)}
                  </span>
                </div>
                {updateInfo.status === "ready_to_install" && (
                  <button
                    onClick={handleApplyUpdate}
                    disabled={applyingUpdate}
                    className="px-3 py-1.5 rounded-lg bg-[var(--color-action)] text-[#130C16] font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${applyingUpdate ? "animate-spin" : ""}`}
                    />
                    <span>{isRtl ? "تثبيت الآن" : "Install Now"}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Developers Section */}
        <div className="space-y-3 w-full">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
            <Code2 className="w-4 h-4 text-[var(--color-action)]" />
            <span>{isRtl ? "فريق التطوير" : "Development Team"}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
            {/* المهندس أحمد فهمي */}
            <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] hover:border-[var(--color-action)]/50 rounded-2xl p-5 sm:p-6 space-y-4 transition flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--color-action)]/15 border border-[var(--color-action)]/35 flex items-center justify-center text-[var(--color-action)] font-bold text-base shrink-0">
                    AF
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-[var(--color-text-header)] text-base tracking-tight">
                      {isRtl ? "المهندس أحمد فهمي" : "Eng. Ahmed Fahmy"}
                    </h3>
                    {/* Permanent English role badge across both AR & EN */}
                    <div
                      dir="ltr"
                      className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full bg-[var(--color-action)]/12 border border-[var(--color-action)]/30 text-[var(--color-action)] text-[11px] font-semibold"
                    >
                      <Terminal className="w-3 h-3 shrink-0" />
                      <span>Software Engineer</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-main)] leading-relaxed space-y-2.5">
                  <p>
                    {isRtl
                      ? "تطوير البنية التحتية والتطبيق الأصلي لسطح المكتب بلغة Rust وواجهة React 19، وبناء محرك تفعيل الخطوط الفوري في الذاكرة (Win32 FR_PRIVATE) دون المساس بالريجستري، بالإضافة إلى جسر التكامل مع Adobe CC ومحرك مساحات العمل والأصول ومنظومة Fontivo على الويب."
                      : "Architected the native Rust desktop engine and modern React 19 interface, implementing instant Win32 FR_PRIVATE in-memory font activation with zero registry bloat, alongside the Adobe Creative Cloud bridge, workspace & asset engine, and Fontivo web ecosystem."}
                  </p>
                  <div
                    className="flex flex-wrap gap-1.5 pt-1 font-mono text-[10px]"
                    dir="ltr"
                  >
                    <span className="px-2 py-0.5 rounded-md bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-header)]">
                      Rust Core Engine
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-header)]">
                      Win32 FR_PRIVATE
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-header)]">
                      Adobe CC Bridge
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-header)]">
                      React 19 &amp; Next.js
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href="https://ahmed-fahmy.engineer/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-action)] hover:text-[#130C16] border border-[var(--color-border)] hover:border-[var(--color-action)] text-[var(--color-text-header)] font-semibold text-xs transition"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>ahmed-fahmy.engineer</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                </a>
                <a
                  href="https://github.com/Ahmedfahmy8308"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] font-semibold text-xs transition"
                >
                  <Code2 className="w-3.5 h-3.5 text-[#B7A1D9]" />
                  <span>GitHub</span>
                </a>
              </div>
            </div>

            {/* المهندس محمد الأشوح */}
            <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] hover:border-[#B7A1D9]/50 rounded-2xl p-5 sm:p-6 space-y-4 transition flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-[#B7A1D9]/15 border border-[#B7A1D9]/35 flex items-center justify-center text-[#B7A1D9] font-bold text-base shrink-0">
                    ME
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-[var(--color-text-header)] text-base tracking-tight">
                      {isRtl ? "المهندس محمد الأشوح" : "Eng. Mohamed Elashwah"}
                    </h3>
                    {/* Permanent English role badge across both AR & EN */}
                    <div
                      dir="ltr"
                      className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full bg-[#B7A1D9]/12 border border-[#B7A1D9]/30 text-[#B7A1D9] text-[11px] font-semibold"
                    >
                      <Brush className="w-3 h-3 shrink-0" />
                      <span>Graphic Designer</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-main)] leading-relaxed space-y-2.5">
                  <p>
                    {isRtl
                      ? "تصميم الهوية البصرية الكاملة لـ Fontivo والشعار وتوجيه تجربة وواجهات المستخدم (UI/UX) ونظام الألوان الموحد، إلى جانب انتقاء وتصنيف وتنظيم مكتبة الـ 10,939 خطاً (عربي ولاتيني ومتعدد اللغات) في حزم احترافية مهيأة للمصممين والاستوديوهات."
                      : "Led the complete Fontivo visual identity, UI/UX direction, and unified Plum/Coral/Lavender color system, while curating, deduplicating, and categorizing the 10,939-font multi-script library into studio-ready packs for designers."}
                  </p>
                  <div
                    className="flex flex-wrap gap-1.5 pt-1 font-mono text-[10px]"
                    dir="ltr"
                  >
                    <span className="px-2 py-0.5 rounded-md bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-header)]">
                      Brand Identity
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-header)]">
                      10,939 Curated Fonts
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-header)]">
                      Arabic &amp; Latin Type
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-header)]">
                      Design Direction
                    </span>
                  </div>
                </div>
              </div>

              <a
                href="https://mohamed-elashwah.me/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[#B7A1D9] hover:text-[#130C16] border border-[var(--color-border)] hover:border-[#B7A1D9] text-[var(--color-text-header)] font-semibold text-xs transition w-full"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>mohamed-elashwah.me</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>
            </div>
          </div>
        </div>

        {/* License Section — Unified Colors */}
        <div className="space-y-3 w-full">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4 text-[#B7A1D9]" />
            <span>{isRtl ? "ترخيص استخدام البرنامج" : "Software License"}</span>
          </div>

          <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl p-5 sm:p-6 space-y-4 text-xs w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-4">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[var(--color-text-header)]">
                  {isRtl
                    ? "ترخيص Fontivo المفتوح (MIT License)"
                    : "Official Fontivo License (MIT)"}
                </h3>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                  {isRtl
                    ? "مجاني بالكامل للاستخدام الشخصي والتجاري في استوديوهات التصميم والطباعة دون قيود."
                    : "Free for personal and commercial studio workflows without restrictions or subscriptions."}
                </p>
              </div>
              <span className="px-3.5 py-1 rounded-xl bg-[var(--color-control)] border border-[var(--color-border)] font-mono font-bold text-[11px] text-[var(--color-text-header)] self-start sm:self-center">
                MIT License
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-1 w-full">
              {[
                {
                  icon: CheckCircle2,
                  title: isRtl
                    ? "استخدام تجاري وشخصي"
                    : "Commercial & Personal",
                  desc: isRtl
                    ? "متاح للمصممين والشركات مجاناً بدون رسوم أو اشتراكات شهرية."
                    : "Free for designers, agencies, and teams with zero monthly fees.",
                  tag: "100% Free",
                },
                {
                  icon: Lock,
                  title: isRtl ? "خصوصية محلية تامة" : "Local-First Privacy",
                  desc: isRtl
                    ? "يعمل محلياً بالكامل دون تتبع أو إرسال بيانات أو ملفات للخارج."
                    : "Runs locally offline with zero telemetry or data uploads.",
                  tag: "Zero Telemetry",
                },
                {
                  icon: Layers,
                  title: isRtl ? "مفتوح المصدر" : "Open Source",
                  desc: isRtl
                    ? "الكود متاح للمراجعة والتطوير تحت رخصة MIT الرسمية على GitHub."
                    : "Transparent codebase open for inspection under MIT License.",
                  tag: "MIT Codebase",
                },
                {
                  icon: Zap,
                  title: isRtl ? "أداء فوري خفيف" : "Lightweight Engine",
                  desc: isRtl
                    ? "مبني بلغة Rust لتفعيل فوري بالذاكرة دون استهلاك موارد الجهاز."
                    : "Built with Native Rust for minimal RAM overhead and instant load.",
                  tag: "Native Rust",
                },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.tag}
                    className="p-4 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border-subtle)] space-y-2 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2 font-bold text-[var(--color-text-header)] text-xs mb-1">
                        <Icon className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                        <span>{card.title}</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                        {card.desc}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-[#B7A1D9] font-bold block pt-1">
                      {card.tag}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Strip */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
          <div className="space-y-0.5">
            <span className="font-bold text-[var(--color-text-header)] block text-xs">
              Fontivo Desktop • v{APP_VERSION}
            </span>
            <span>
              {isRtl
                ? `إجمالي العائلات المحملة: ${families.length.toLocaleString()}`
                : `Loaded font families: ${families.length.toLocaleString()}`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              href="https://fontivo-app.github.io"
              target="_blank"
              rel="noopener noreferrer"
              dir="ltr"
              className="text-[11px] font-mono text-[var(--color-action)] hover:underline inline-flex items-center gap-1"
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>fontivo-app.github.io</span>
            </a>
            <span className="text-[10px] font-mono text-[var(--color-text-dim)] flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-[var(--color-action)]" />
              <span>© 2026 Fontivo Project</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
