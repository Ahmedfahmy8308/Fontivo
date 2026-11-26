import React, { useState, useEffect } from "react";
import {
  Settings,
  Activity,
  ArrowUpCircle,
  CheckCircle2,
  ShieldCheck,
  Trash2,
  RefreshCw,
  Check,
  Sliders,
  Keyboard,
  Globe,
  Sun,
  Moon,
  FolderOpen,
  HardDrive,
  Copy,
  Info,
  Download,
  Users,
  FileText,
} from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../../i18n/locales";

export interface SettingsViewProps {
  onRefreshStats?: () => void;
  currentLanguage?: string;
  onSetLanguage?: (langCode: string) => void;
  theme?: string;
  toggleTheme?: () => void;
  onNavigateTab?: (tab: string) => void;
  t?: Record<string, string>;
  isRtl?: boolean;
}

export default function SettingsView({
  onRefreshStats,
  currentLanguage = "ar",
  onSetLanguage,
  theme = "dark",
  toggleTheme,
  onNavigateTab,
  t = {},
  isRtl = false,
}: SettingsViewProps) {
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<any>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<any>(null);
  const [storagePath, setStoragePath] = useState<string>(
    "%APPDATA%\\Fontivo\\Fonts",
  );
  const [downloadsDir, setDownloadsDir] = useState<string>(
    "%APPDATA%\\Fontivo\\Library\\Downloads",
  );
  const [pickingDir, setPickingDir] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [autostartEnabled, setAutostartEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem("fontivo_autostart");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [autostartLoading, setAutostartLoading] = useState(false);

  useEffect(() => {
    fetch("/api/system/autostart")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.enabled === "boolean") {
          setAutostartEnabled(data.enabled);
        }
      })
      .catch(() => {});

    fetch("/api/system/info")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const path = data?.fontsDir || data?.storagePath || data?.dataDir;
        if (typeof path === "string" && path.trim()) {
          setStoragePath(path);
        }
      })
      .catch(() => {});

    fetch("/api/library/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cfg?.downloadsDir) {
          setDownloadsDir(cfg.downloadsDir);
        }
      })
      .catch(() => {});
  }, []);

  const handlePickDownloadsDir = async () => {
    setPickingDir(true);
    try {
      const res = await fetch("/api/dialog/pick-directory", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.selectedPath) {
          setDownloadsDir(data.selectedPath);
          await fetch("/api/library/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ downloadsDir: data.selectedPath }),
          });
        }
      }
    } catch {
      // ignore
    } finally {
      setPickingDir(false);
    }
  };

  const handleOpenDownloadsDir = async () => {
    try {
      await fetch("/api/library/open-downloads", { method: "POST" });
    } catch {
      // ignore
    }
  };

  const handleToggleAutostart = async () => {
    const nextVal = !autostartEnabled;
    setAutostartEnabled(nextVal);
    try {
      localStorage.setItem("fontivo_autostart", JSON.stringify(nextVal));
    } catch {
      // ignore
    }
    setAutostartLoading(true);
    try {
      await fetch("/api/system/autostart/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextVal }),
      });
    } catch {
      // Offline fallback
    } finally {
      setAutostartLoading(false);
    }
  };

  const handleCopyStoragePath = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(storagePath).catch(() => {});
    }
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1800);
  };

  const handleCleanRegistry = async () => {
    setCleaning(true);
    setCleanResult(null);
    try {
      const res = await fetch("/api/clean-registry-fonts", { method: "POST" });
      const data = await res.json();
      setCleanResult(data);
      if (onRefreshStats) onRefreshStats();
    } catch (e: any) {
      setCleanResult({ success: false, error: e?.message || "Failed" });
    } finally {
      setCleaning(false);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateStatus(null);
    try {
      let res = await fetch("/api/updater/check", { method: "POST" });
      if (!res.ok) {
        res = await fetch("/api/updater");
      }
      const data = await res.json();
      setUpdateStatus(data);
    } catch (e: any) {
      setUpdateStatus({ error: e?.message || "Failed" });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    setIsApplyingUpdate(true);
    try {
      await fetch("/api/updater/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ silent: true }),
      });
    } catch {
      // ignore
    } finally {
      setTimeout(() => setIsApplyingUpdate(false), 5000);
    }
  };

  return (
    <div
      className="flex-1 overflow-y-auto p-5 sm:p-6 md:p-8 space-y-7 bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none w-full"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="max-w-5xl mx-auto space-y-7">
        {/* Header */}
        <div className="border-b border-[var(--color-border)] pb-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1
              className="text-xl sm:text-2xl font-bold flex items-center gap-2.5 text-[var(--color-text-header)] min-w-0"
              dir="auto"
            >
              <Settings className="w-6 h-6 text-[var(--color-action)] shrink-0" />
              <span className="truncate">
                {t.settingsTitle ||
                  (isRtl
                    ? "إعدادات التطبيق والنظام"
                    : "Application & System Settings")}
              </span>
            </h1>
            <p
              className="text-xs text-[var(--color-text-muted)] mt-1.5 leading-relaxed"
              dir="auto"
            >
              {t.settingsSubtitle ||
                (isRtl
                  ? "إدارة اللغة، المظهر، مسار التخزين، التشغيل التلقائي، والنسخ الاحتياطي وصحة النظام."
                  : "Manage language, appearance, storage path, startup, backup & recovery, and system health.")}
            </p>
          </div>
          <span className="px-3.5 py-1.5 rounded-full bg-[var(--color-control)] border border-[var(--color-border)] text-xs font-mono font-medium text-[var(--color-text-muted)] self-start md:self-center whitespace-nowrap shrink-0">
            Fontivo v1.0.0
          </span>
        </div>

        {/* 1. Language & Appearance */}
        <div className="space-y-3">
          <h2
            className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2"
            dir="auto"
          >
            <Globe className="w-4 h-4 text-[var(--color-action)]" />
            <span>{isRtl ? "اللغة والمظهر" : "Language & Appearance"}</span>
          </h2>

          <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl divide-y divide-[var(--color-border-subtle)] text-xs shadow-xs overflow-hidden">
            {/* Language Selector */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0" dir="auto">
                <div className="font-bold text-[var(--color-text-header)] text-sm">
                  {isRtl ? "لغة الواجهة" : "Interface Language"}
                </div>
                <div className="text-[var(--color-text-muted)] text-xs mt-0.5">
                  {isRtl
                    ? "تغيير لغة البرنامج مع دعم كامل للاتجاه من اليمين لليسار (RTL) ومن اليسار لليمين (LTR)"
                    : "Switch application language with full RTL and LTR layout support"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => onSetLanguage && onSetLanguage(lang.code)}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold border transition cursor-pointer whitespace-nowrap ${
                      currentLanguage === lang.code
                        ? "bg-[var(--color-action)] text-white border-[var(--color-action)]"
                        : "bg-[var(--color-control)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text-header)]"
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme Selector */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0" dir="auto">
                <div className="font-bold text-[var(--color-text-header)] text-sm">
                  {isRtl ? "مظهر التطبيق" : "Application Theme"}
                </div>
                <div className="text-[var(--color-text-muted)] text-xs mt-0.5">
                  {isRtl
                    ? "اختر بين الوضع الداكن المريح للعين أو الوضع الفاتح النهاري"
                    : "Choose between eye-friendly dark studio mode or crisp light mode"}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() =>
                    theme !== "dark" && toggleTheme && toggleTheme()
                  }
                  className={`h-8 px-3.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                    theme === "dark"
                      ? "bg-[var(--color-action)] text-white border-[var(--color-action)]"
                      : "bg-[var(--color-control)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text-header)]"
                  }`}
                >
                  <Moon className="w-3.5 h-3.5 shrink-0" />
                  <span>{isRtl ? "داكن" : "Dark"}</span>
                </button>
                <button
                  onClick={() =>
                    theme !== "light" && toggleTheme && toggleTheme()
                  }
                  className={`h-8 px-3.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                    theme === "light"
                      ? "bg-[var(--color-action)] text-white border-[var(--color-action)]"
                      : "bg-[var(--color-control)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text-header)]"
                  }`}
                >
                  <Sun className="w-3.5 h-3.5 shrink-0" />
                  <span>{isRtl ? "فاتح" : "Light"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Storage Path & Startup Preferences */}
        <div className="space-y-3">
          <h2
            className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2"
            dir="auto"
          >
            <Sliders className="w-4 h-4 text-[var(--color-action)]" />
            <span>
              {t.prefStartupTitle ||
                (isRtl
                  ? "مسار التخزين وبدء التشغيل"
                  : "Storage Path & Startup Preferences")}
            </span>
          </h2>

          <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl divide-y divide-[var(--color-border-subtle)] text-xs shadow-xs overflow-hidden">
            {/* Storage Path */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0" dir="auto">
                <div className="font-bold text-[var(--color-text-header)] text-sm flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                  <span>
                    {isRtl
                      ? "مسار تخزين الخطوط والبيانات"
                      : "Font Library Storage Path"}
                  </span>
                </div>
                <div
                  className="text-[var(--color-text-muted)] text-xs mt-0.5 font-mono truncate"
                  title={storagePath}
                >
                  {storagePath}
                </div>
              </div>
              <button
                onClick={handleCopyStoragePath}
                className="h-8 px-3 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
              >
                {copiedPath ? (
                  <Check className="w-3.5 h-3.5 text-[var(--color-action)]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>
                  {copiedPath
                    ? isRtl
                      ? "تم النسخ"
                      : "Copied"
                    : isRtl
                      ? "نسخ المسار"
                      : "Copy Path"}
                </span>
              </button>
            </div>

            {/* Dedicated Downloads Folder Row */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0" dir="auto">
                <div className="font-bold text-[var(--color-text-header)] text-sm flex items-center gap-2">
                  <Download className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                  <span>
                    {isRtl
                      ? "مجلد تنزيل الخطوط وحزم السحاب"
                      : "Font Downloads Folder"}
                  </span>
                </div>
                <div
                  className="text-[var(--color-text-muted)] text-xs mt-0.5 font-mono truncate"
                  title={downloadsDir}
                >
                  {downloadsDir}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                <button
                  onClick={handlePickDownloadsDir}
                  disabled={pickingDir}
                  className="h-8 px-3 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                  title={
                    isRtl
                      ? "اختيار مجلد آخر على جهازك لحفظ الخطوط المنزلة"
                      : "Select a different folder on your PC"
                  }
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{isRtl ? "تغيير المجلد" : "Change Folder"}</span>
                </button>
                <button
                  onClick={handleOpenDownloadsDir}
                  className="h-8 px-3 rounded-lg bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-[#130C16] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shadow-xs"
                  title={
                    isRtl
                      ? "فتح مجلد التنزيلات مباشرة في مستكشف ويندوز"
                      : "Open Downloads folder in Windows Explorer"
                  }
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{isRtl ? "فتح المجلد" : "Open Folder"}</span>
                </button>
              </div>
            </div>

            {/* Autostart */}
            <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
              <div className="flex-1" dir="auto">
                <div className="font-bold text-[var(--color-text-header)] text-sm">
                  {t.autostartWithWindows ||
                    (isRtl
                      ? "بدء التشغيل التلقائي مع ويندوز"
                      : "Start Automatically with Windows")}
                </div>
                <div className="text-[var(--color-text-muted)] text-xs mt-0.5">
                  {t.autostartDesc ||
                    (isRtl
                      ? "تشغيل المحرك في الخلفية تلقائياً عند تسجيل الدخول"
                      : "Launch font engine in the background on user login")}
                </div>
              </div>
              <input
                type="checkbox"
                checked={autostartEnabled}
                onChange={handleToggleAutostart}
                disabled={autostartLoading}
                className="accent-[var(--color-action)] w-4 h-4 cursor-pointer shrink-0"
              />
            </div>
          </div>
        </div>

        {/* 3. Backup, Recovery & System Health */}
        <div className="space-y-3">
          <h2
            className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2"
            dir="auto"
          >
            <Activity className="w-4 h-4 text-[var(--color-action)]" />
            <span>
              {t.registryAuditTitle ||
                (isRtl
                  ? "النسخ الاحتياطي، صحة النظام وخطوط ويندوز"
                  : "Backup, Recovery & System Health")}
            </span>
          </h2>

          <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl p-5 space-y-4 text-xs shadow-xs">
            {/* Quick Access to System Health & Windows Fonts Reset */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4 border-b border-[var(--color-border-subtle)]">
              <button
                onClick={() => onNavigateTab && onNavigateTab("system-health")}
                className="p-3.5 rounded-xl bg-[var(--color-back-subtle)] hover:bg-[var(--color-control)] border border-[var(--color-border)] hover:border-[var(--color-action)] text-start transition cursor-pointer flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ShieldCheck className="w-5 h-5 text-[var(--color-action)] shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-[var(--color-text-header)] truncate">
                      {isRtl
                        ? "مركز صحة النظام والنسخ الاحتياطي"
                        : "System Health & Backup Center"}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)] truncate">
                      {isRtl
                        ? "الاستعادة، كاش الخطوط، وتنظيف الذاكرة"
                        : "Snapshots, font cache & memory health"}
                    </div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => onNavigateTab && onNavigateTab("windows-fonts")}
                className="p-3.5 rounded-xl bg-[var(--color-back-subtle)] hover:bg-[var(--color-control)] border border-[var(--color-border)] hover:border-[var(--color-action)] text-start transition cursor-pointer flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <HardDrive className="w-5 h-5 text-[#B7A1D9] shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-[var(--color-text-header)] truncate">
                      {isRtl
                        ? "مدير وإعادة ضبط خطوط ويندوز"
                        : "Windows Fonts & Safe Reset"}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)] truncate">
                      {isRtl
                        ? "فحص خطوط النظام وحمايتها بأمان"
                        : "Inspect & safely protect OS fonts"}
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* Orphaned Registry Cleanup */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex-1" dir="auto">
                <div className="font-bold text-[var(--color-text-header)] text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                  <span>
                    {t.registryCleanTitle ||
                      (isRtl
                        ? "فحص وتنظيف المفاتيح اليتيمة في ريجستري خطوط ويندوز"
                        : "Scan & Clean Orphaned Windows Font Registry Keys")}
                  </span>
                </div>
                <p className="text-[var(--color-text-muted)] text-xs mt-1.5 leading-relaxed">
                  {t.registryCleanDesc ||
                    (isRtl
                      ? "تقوم البرامج القديمة أحياناً بترك قيود في الريجستري لخطوط تم حذف ملفاتها من القرص، مما قد يبطئ إقلاع برامج التصميم. يقوم هذا الفحص بتنظيفها بأمان."
                      : "Legacy applications sometimes leave registry references to deleted font files, causing boot delays. This tool cleans them safely.")}
                </p>
              </div>

              <button
                onClick={handleCleanRegistry}
                disabled={cleaning}
                className="h-9 px-4 bg-[var(--color-action)]/12 hover:bg-[var(--color-action)]/20 text-[var(--color-action)] border border-[var(--color-action)]/30 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 self-start sm:self-center"
              >
                {cleaning ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {cleaning
                    ? t.cleaningRegistry ||
                      (isRtl ? "جاري الفحص..." : "Scanning...")
                    : t.cleanRegistryNow ||
                      (isRtl ? "تنظيف السجل الآن" : "Clean Registry Now")}
                </span>
              </button>
            </div>

            {cleanResult && (
              <div
                className={`p-3.5 rounded-xl flex items-center gap-2.5 ${
                  cleanResult.success !== false
                    ? "bg-[#B7A1D9]/12 text-[#B7A1D9] border border-[#B7A1D9]/30"
                    : "bg-[var(--color-action)]/12 text-[var(--color-action)] border border-[var(--color-action)]/30"
                }`}
                dir="auto"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {cleanResult.message ||
                    t.registryCleanSuccess ||
                    (isRtl
                      ? "تم تنظيف الريجستري بنجاح."
                      : "Registry cleaned successfully.")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 4. Official Updates & About */}
        <div className="space-y-3">
          <h2
            className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2"
            dir="auto"
          >
            <Info className="w-4 h-4 text-[var(--color-action)]" />
            <span>
              {t.updatesTitle ||
                (isRtl ? "التحديثات وحول التطبيق" : "Updates & About Fontivo")}
            </span>
          </h2>

          <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl p-5 space-y-4 text-xs shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div dir="auto">
                <div className="font-bold text-[var(--color-text-header)] text-sm flex items-center gap-2">
                  <Check className="w-4 h-4 text-[var(--color-action)]" />
                  <span>
                    {t.currentVersionInstalled ||
                      (isRtl
                        ? "الإصدار الحالي مثبت ومحدث"
                        : "Current Version Installed & Up to Date")}
                  </span>
                </div>
                <div className="text-[var(--color-text-muted)] text-xs mt-1">
                  Fontivo v1.0.0 —{" "}
                  {t.releaseChannel ||
                    (isRtl
                      ? "قناة الإصدارات المستقرة • محرك إدارة خطوط محلي سريع"
                      : "Stable Release Channel • Local-First Font Engine")}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap self-start sm:self-center">
                <button
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  className="px-4 py-2.5 bg-[var(--color-action)] hover:opacity-90 text-[#130C16] rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <ArrowUpCircle
                    className={`w-3.5 h-3.5 ${checkingUpdate ? "animate-spin" : ""}`}
                  />
                  <span>
                    {checkingUpdate
                      ? t.checkingUpdates ||
                        (isRtl ? "جاري التحقق..." : "Checking...")
                      : t.checkUpdatesNow ||
                        (isRtl ? "التحقق السريع" : "Quick Check")}
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
                  className="px-4 py-2.5 bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer shrink-0 shadow-2xs"
                  title={
                    isRtl
                      ? "فتح نافذة إدارة تحديثات البرنامج وكتالوج الخطوط"
                      : "Open app & font updates window"
                  }
                >
                  <Globe className="w-3.5 h-3.5 text-[#B7A1D9]" />
                  <span>
                    {isRtl ? "نافذة مركز التحديثات" : "Updates Window"}
                  </span>
                </button>

                {onNavigateTab && (
                  <button
                    onClick={() => onNavigateTab("licenses")}
                    className="px-4 py-2.5 bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer shrink-0 shadow-2xs"
                    title={
                      isRtl
                        ? "الانتقال لشاشة التراخيص وحول التطبيق وفريق العمل"
                        : "Go to Licenses & About screen"
                    }
                  >
                    <FileText className="w-3.5 h-3.5 text-[var(--color-action)]" />
                    <span>
                      {isRtl ? "التراخيص وحول التطبيق" : "Licenses & About"}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {updateStatus && (
              <div
                className="p-3.5 rounded-xl border bg-[var(--color-back-subtle)] border-[var(--color-border)] text-[var(--color-text-main)] flex items-center justify-between gap-3"
                dir="auto"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                  <span className="truncate">
                    {updateStatus.status === "ready_to_install"
                      ? isRtl
                        ? `تم تنزيل تحديث Fontivo v${updateStatus.latestVersion || "1.0.1"} تلقائياً وهو جاهز للتثبيت.`
                        : `Fontivo v${updateStatus.latestVersion || "1.0.1"} is downloaded and ready to install.`
                      : updateStatus.message ||
                        t.upToDate ||
                        (isRtl
                          ? "برنامج Fontivo محدث لأحدث إصدار."
                          : "Fontivo is up to date.")}
                  </span>
                </div>
                {updateStatus.status === "ready_to_install" && (
                  <button
                    onClick={handleApplyUpdate}
                    disabled={isApplyingUpdate}
                    className="px-3 py-1.5 rounded-lg bg-[var(--color-action)] text-[#130C16] font-bold text-xs flex items-center gap-1.5 shrink-0 transition cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isApplyingUpdate ? "animate-spin" : ""}`}
                    />
                    <span>
                      {isApplyingUpdate
                        ? isRtl
                          ? "جاري التحديث..."
                          : "Restarting..."
                        : isRtl
                          ? "إعادة التشغيل والتحديث الآن"
                          : "Restart & Update Now"}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 5. Keyboard Shortcuts */}
        <div className="space-y-3">
          <h2
            className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2"
            dir="auto"
          >
            <Keyboard className="w-4 h-4 text-[var(--color-action)]" />
            <span>
              {isRtl ? "اختصارات لوحة المفاتيح" : "Keyboard Shortcuts"}
            </span>
          </h2>

          <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs shadow-xs">
            {[
              {
                key: "Ctrl + F",
                ar: "البحث الفوري في أسماء وعائلات الخطوط",
                en: "Instant search fonts by name or family",
              },
              {
                key: "Space",
                ar: "تفعيل أو إلغاء تفعيل الخط المحدد",
                en: "Activate or deactivate selected font",
              },
              {
                key: "Tab",
                ar: "تبديل أوضاع العرض في المكتبة",
                en: "Toggle library layout view modes",
              },
              {
                key: "Ctrl + Shift + R",
                ar: "تسريع وتفريغ ذاكرة الرام فوراً",
                en: "Instant RAM optimization & cache trim",
              },
              {
                key: "Ctrl + P",
                ar: "فتح فاحص ملفات التصميم",
                en: "Open Adobe CC design inspector",
              },
              {
                key: "Esc",
                ar: "إغلاق النوافذ المنبثقة والعودة للرئيسية",
                en: "Close open modals or inspector",
              },
            ].map((sc) => (
              <div
                key={sc.key}
                className="p-3 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-3"
              >
                <span className="text-[var(--color-text-main)] font-medium">
                  {isRtl ? sc.ar : sc.en}
                </span>
                <kbd className="px-2 py-1 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] font-mono text-[11px] font-bold text-[var(--color-text-header)] shrink-0">
                  {sc.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
