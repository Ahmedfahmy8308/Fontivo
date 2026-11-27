import React, { useState, useEffect } from "react";
import {
  Settings,
  Activity,
  ArrowUpCircle,
  CheckCircle2,
  AlertCircle,
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
  FileText,
  Package,
  Database,
  Archive,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../../i18n/locales";
import {
  CLOUD_MANIFEST_VERSION,
  CLOUD_TOTAL_FONTS,
} from "../../utils/cloudPackages";
import uiPkg from "../../../package.json";

const APP_VERSION = uiPkg.version;

export interface StorageCategoryStat {
  bytes: number;
  files: number;
}

export interface StorageBreakdownData {
  imported: StorageCategoryStat;
  custom: StorageCategoryStat;
  google: StorageCategoryStat;
  packs: StorageCategoryStat;
  workspaces: StorageCategoryStat;
  backups: StorageCategoryStat;
  cache: StorageCategoryStat;
  totalBytes: number;
}

function parseCategoryStat(raw: any): StorageCategoryStat {
  if (!raw || typeof raw !== "object") {
    return { bytes: 0, files: 0 };
  }
  const bytes = Number(raw.bytes ?? raw.sizeBytes ?? raw.size ?? 0);
  const files = Number(raw.files ?? raw.fileCount ?? raw.count ?? 0);
  return {
    bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : 0,
    files: Number.isFinite(files) && files > 0 ? files : 0,
  };
}

export function normalizeStorageBreakdown(raw: any): StorageBreakdownData {
  const imported = parseCategoryStat(raw?.imported);
  const custom = parseCategoryStat(raw?.custom);
  const google = parseCategoryStat(raw?.google);
  const packs = parseCategoryStat(raw?.packs);
  const workspaces = parseCategoryStat(raw?.workspaces);
  const backups = parseCategoryStat(raw?.backups);
  const cache = parseCategoryStat(raw?.cache);
  const sum =
    imported.bytes +
    custom.bytes +
    google.bytes +
    packs.bytes +
    workspaces.bytes +
    backups.bytes +
    cache.bytes;
  const totalBytesRaw = Number(raw?.totalBytes ?? sum);
  return {
    imported,
    custom,
    google,
    packs,
    workspaces,
    backups,
    cache,
    totalBytes:
      Number.isFinite(totalBytesRaw) && totalBytesRaw >= 0 ? totalBytesRaw : sum,
  };
}

export function formatStorageBytes(bytes: number): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (safe === 0) return "0.0 MB";
  if (safe < 1024 * 1024) {
    return `${(safe / 1024).toFixed(1)} KB`;
  }
  if (safe >= 1024 * 1024 * 1024) {
    return `${(safe / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${(safe / (1024 * 1024)).toFixed(2)} MB`;
}

export interface SettingsViewProps {
  onRefreshStats?: () => void;
  currentLanguage?: string;
  onSetLanguage?: (langCode: string) => void;
  theme?: string;
  toggleTheme?: () => void;
  onNavigateTab?: (tab: string) => void;
  t?: Record<string, string>;
  isRtl?: boolean;
  initialStorageBreakdown?: StorageBreakdownData | null;
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
  initialStorageBreakdown = null,
}: SettingsViewProps) {
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<any>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<any>(null);
  const [fontsUpdateStatus, setFontsUpdateStatus] = useState<any>({
    libraryVersion: CLOUD_MANIFEST_VERSION,
    embeddedVersion: CLOUD_MANIFEST_VERSION,
    hasUpdate: false,
    totalFonts: CLOUD_TOTAL_FONTS,
    packCount: 15,
  });
  const [checkingFontsUpdate, setCheckingFontsUpdate] = useState(false);
  const [storagePath, setStoragePath] = useState<string>(
    "%LOCALAPPDATA%\\Fontivo\\Fonts",
  );
  const [downloadsDir, setDownloadsDir] = useState<string>(
    "%LOCALAPPDATA%\\Fontivo\\Downloads",
  );
  const [systemPaths, setSystemPaths] = useState<{
    dataDir?: string;
    packsDir?: string;
    updatesDir?: string;
    backupsDir?: string;
    roamingDir?: string;
    programDataDir?: string;
  }>({});
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
  const [storageBreakdown, setStorageBreakdown] =
    useState<StorageBreakdownData | null>(initialStorageBreakdown);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const [cleaningCache, setCleaningCache] = useState(false);
  const [cacheCleanResult, setCacheCleanResult] = useState<{
    success: boolean;
    freedBytes: number;
    removedFiles: number;
    message?: string;
  } | null>(null);
  const [sliceFolderPath, setSliceFolderPath] = useState("");
  const [sliceNewName, setSliceNewName] = useState("");
  const [renamingSlice, setRenamingSlice] = useState(false);
  const [sliceFeedback, setSliceFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const fetchStorageBreakdown = async () => {
    setLoadingStorage(true);
    try {
      const res = await fetch("/api/system/storage-breakdown", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setStorageBreakdown(normalizeStorageBreakdown(data));
      }
    } catch {
      // ignore offline/test errors
    } finally {
      setLoadingStorage(false);
    }
  };

  useEffect(() => {
    const isTestDom =
      typeof window === "undefined" ||
      (typeof navigator !== "undefined" &&
        /jsdom|happy-dom/i.test(navigator.userAgent || ""));
    if (isTestDom) return;

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
        if (!data) return;
        const path = data?.fontsDir || data?.storagePath || data?.dataDir;
        if (typeof path === "string" && path.trim()) {
          setStoragePath(path);
        }
        if (typeof data?.downloadsDir === "string" && data.downloadsDir.trim()) {
          setDownloadsDir(data.downloadsDir);
        }
        setSystemPaths({
          dataDir: data.dataDir,
          packsDir: data.packsDir,
          updatesDir: data.updatesDir,
          backupsDir: data.backupsDir,
          roamingDir: data.roamingDir,
          programDataDir: data.programDataDir,
        });
      })
      .catch(() => {});

    fetch("/api/library/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const dl = res?.config?.downloadsDir ?? res?.downloadsDir;
        if (typeof dl === "string" && dl.trim()) {
          setDownloadsDir(dl);
        }
      })
      .catch(() => {});

    fetch("/api/updater", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setUpdateStatus(data);
      })
      .catch(() => {});

    fetch("/api/catalog/packages", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.libraryVersion) {
          setFontsUpdateStatus((prev: any) => ({
            ...prev,
            ...data,
          }));
        }
      })
      .catch(() => {});

    fetchStorageBreakdown();
  }, []);

  useEffect(() => {
    if (updateStatus?.status !== "downloading") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/updater", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setUpdateStatus(data);
        }
      } catch {
        // ignore network jitter while polling
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [updateStatus?.status]);

  const handlePickDownloadsDir = async () => {
    setPickingDir(true);
    try {
      const res = await fetch("/api/dialog/pick-directory", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const picked = data?.path || data?.selectedPath;
        if (picked) {
          setDownloadsDir(picked);
          await fetch("/api/library/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ downloadsDir: picked }),
          });
        }
      }
    } catch {
      // ignore
    } finally {
      setPickingDir(false);
    }
  };

  const handleOpenDownloadsDir = async (scope: string = "downloads") => {
    try {
      await fetch("/api/library/open-downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
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
    try {
      let res = await fetch("/api/updater/check", {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) {
        res = await fetch("/api/updater", { cache: "no-store" });
      }
      const data = await res.json();
      setUpdateStatus(data);
    } catch (e: any) {
      setUpdateStatus({ error: e?.message || "Failed" });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleCheckFontsUpdate = async () => {
    setCheckingFontsUpdate(true);
    try {
      const res = await fetch("/api/catalog/refresh-manifest", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setFontsUpdateStatus((prev: any) => ({
          ...prev,
          ...data,
          checkedNow: true,
        }));
      }
    } catch {
      // keep existing status cleanly
    } finally {
      setCheckingFontsUpdate(false);
    }
  };

  const handleCleanupCache = async () => {
    setCleaningCache(true);
    setCacheCleanResult(null);
    try {
      const res = await fetch("/api/system/cleanup-cache", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success !== false) {
        const freedBytes = Number(data?.freedBytes || 0);
        const removedFiles = Number(data?.removedFiles || 0);
        setCacheCleanResult({
          success: true,
          freedBytes,
          removedFiles,
          message: data?.message,
        });
        await fetchStorageBreakdown();
      } else {
        setCacheCleanResult({
          success: false,
          freedBytes: 0,
          removedFiles: 0,
          message:
            data?.error ||
            data?.message ||
            (isRtl ? "تعذر تنظيف الملفات المؤقتة" : "Failed to clean cache"),
        });
      }
    } catch (e: any) {
      setCacheCleanResult({
        success: false,
        freedBytes: 0,
        removedFiles: 0,
        message:
          e?.message ||
          (isRtl ? "تعذر الاتصال بالخادم" : "Could not reach backend"),
      });
    } finally {
      setCleaningCache(false);
    }
  };

  const handleRenameSlice = async () => {
    const folderPath = sliceFolderPath.trim();
    const newName = sliceNewName.trim();
    if (!folderPath || !newName) return;
    setRenamingSlice(true);
    setSliceFeedback(null);
    try {
      const res = await fetch("/api/fonts/rename-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath, newName }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success !== false) {
        setSliceFeedback({
          ok: true,
          message: isRtl
            ? `تمت إعادة تسمية الشريحة إلى "${newName}" بنجاح.`
            : `Slice renamed to "${newName}" successfully.`,
        });
        if (data?.newPath) setSliceFolderPath(data.newPath);
        setSliceNewName("");
        if (onRefreshStats) onRefreshStats();
      } else {
        setSliceFeedback({
          ok: false,
          message:
            data?.error ||
            data?.message ||
            (isRtl ? "تعذر إعادة تسمية الشريحة" : "Failed to rename slice"),
        });
      }
    } catch (e: any) {
      setSliceFeedback({
        ok: false,
        message: e?.message || (isRtl ? "خطأ في الاتصال" : "Network error"),
      });
    } finally {
      setRenamingSlice(false);
    }
  };

  const handleExportSliceZip = () => {
    const folderPath = sliceFolderPath.trim();
    if (!folderPath || typeof window === "undefined") return;
    const url = `/api/fonts/export-folder?folderPath=${encodeURIComponent(folderPath)}`;
    window.open(url, "_blank", "noopener,noreferrer");
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
          <span
            className="px-3.5 py-1.5 rounded-full bg-[var(--color-control)] border border-[var(--color-border)] text-xs font-mono font-medium text-[var(--color-text-muted)] self-start md:self-center whitespace-nowrap shrink-0"
            dir="ltr"
          >
            {`Fontivo v${updateStatus?.currentVersion || APP_VERSION}`}
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
                      ? "مسار تخزين الخطوط والبيانات (AppData Local)"
                      : "Font Library Storage Path (AppData Local)"}
                  </span>
                </div>
                <div
                  dir="ltr"
                  className="text-[var(--color-text-muted)] text-xs mt-0.5 font-mono truncate text-start"
                  title={storagePath}
                >
                  {storagePath}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                <button
                  onClick={handleCopyStoragePath}
                  className="h-8 px-3 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
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
                <button
                  onClick={() => handleOpenDownloadsDir("root")}
                  className="h-8 px-3 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#B7A1D9]" />
                  <span>{isRtl ? "فتح AppData" : "Open AppData"}</span>
                </button>
              </div>
            </div>

            {/* Dedicated Downloads Folder Row */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0" dir="auto">
                <div className="font-bold text-[var(--color-text-header)] text-sm flex items-center gap-2">
                  <Download className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                  <span>
                    {isRtl
                      ? "مجلد تنزيل وتصدير الخطوط"
                      : "Font Downloads & Exports Folder"}
                  </span>
                </div>
                <div
                  dir="ltr"
                  className="text-[var(--color-text-muted)] text-xs mt-0.5 font-mono truncate text-start"
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
                  onClick={() => handleOpenDownloadsDir("downloads")}
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

            {/* AppData Managed Directories Summary */}
            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-[var(--color-back-subtle)]/50">
              {[
                {
                  scope: "packs",
                  label: isRtl ? "الحزم السحابية" : "Cloud Packs",
                  path: systemPaths.packsDir || "%LOCALAPPDATA%\\Fontivo\\Fonts\\Packs",
                },
                {
                  scope: "updates",
                  label: isRtl ? "مجلد التحديثات (Updater)" : "App Updater Cache",
                  path: systemPaths.updatesDir || "%LOCALAPPDATA%\\Fontivo\\Updates",
                },
                {
                  scope: "backups",
                  label: isRtl ? "النسخ الاحتياطية" : "System Backups",
                  path: systemPaths.backupsDir || "%LOCALAPPDATA%\\Fontivo\\Backups",
                },
                {
                  scope: "roaming",
                  label: isRtl ? "إعدادات المستخدم (Roaming)" : "User Roaming Profile",
                  path: systemPaths.roamingDir || "%APPDATA%\\Fontivo",
                },
              ].map((dirItem) => (
                <button
                  key={dirItem.scope}
                  type="button"
                  onClick={() => handleOpenDownloadsDir(dirItem.scope)}
                  className="p-2.5 rounded-xl bg-[var(--color-back-card)] hover:bg-[var(--color-control)] border border-[var(--color-border)] text-start transition cursor-pointer min-w-0"
                  title={dirItem.path}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-[var(--color-text-header)]">
                    <span className="truncate">{dirItem.label}</span>
                    <FolderOpen className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
                  </div>
                  <div
                    className="text-[10px] font-mono text-[var(--color-text-muted)] truncate mt-1"
                    dir="ltr"
                  >
                    {dirItem.path}
                  </div>
                </button>
              ))}
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

        {/* 2b. Storage Usage Breakdown & Cache Cleanup */}
        <div className="space-y-3" data-testid="storage-breakdown-card">
          <h2
            className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2"
            dir="auto"
          >
            <Database className="w-4 h-4 text-[var(--color-action)]" />
            <span>
              {isRtl
                ? "تفصيل مساحة التخزين وتنظيف الملفات المؤقتة"
                : "Storage Usage Breakdown & Cache Cleanup"}
            </span>
          </h2>

          <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl p-5 space-y-4 text-xs shadow-xs">
            {/* Top summary bar + actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0" dir="auto">
                <div className="font-bold text-[var(--color-text-header)] text-sm flex flex-wrap items-center gap-2">
                  <span>
                    {isRtl
                      ? "إجمالي المساحة المستخدمة بواسطة Fontivo"
                      : "Total Managed Fontivo Storage"}
                  </span>
                  <span
                    dir="ltr"
                    className="px-2.5 py-0.5 rounded-full bg-[var(--color-control)] border border-[var(--color-border)] font-mono font-bold text-[11px] text-[var(--color-action)] tabular-nums"
                  >
                    {storageBreakdown
                      ? formatStorageBytes(storageBreakdown.totalBytes)
                      : loadingStorage
                        ? "..."
                        : "0.0 MB"}
                  </span>
                </div>
                <p className="text-[var(--color-text-muted)] text-xs mt-1 leading-relaxed">
                  {isRtl
                    ? "توزيع دقيق لحجم الخطوط المستوردة والخاصة وحزم السحابة ومساحات العمل والملفات المؤقتة."
                    : "Live disk breakdown across imported fonts, custom uploads, cloud packs, workspaces, backups, and temporary cache."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
                <button
                  type="button"
                  onClick={fetchStorageBreakdown}
                  disabled={loadingStorage}
                  className="h-9 px-3 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] font-sans font-semibold text-xs inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-[#B7A1D9] ${loadingStorage ? "animate-spin" : ""}`}
                  />
                  <span>{isRtl ? "تحديث" : "Refresh"}</span>
                </button>

                <button
                  type="button"
                  data-testid="cleanup-cache-btn"
                  onClick={handleCleanupCache}
                  disabled={cleaningCache}
                  className="h-9 px-4 rounded-xl bg-[var(--color-action)]/12 hover:bg-[var(--color-action)]/20 text-[var(--color-action)] border border-[var(--color-action)]/35 font-sans font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  {cleaningCache ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    {cleaningCache
                      ? isRtl
                        ? "جاري التنظيف..."
                        : "Cleaning..."
                      : isRtl
                        ? "تنظيف الملفات المؤقتة"
                        : "Clean Temporary Cache"}
                  </span>
                </button>
              </div>
            </div>

            {/* Segmented visual bar */}
            {(() => {
              const b = storageBreakdown || normalizeStorageBreakdown(null);
              const total = Math.max(1, b.totalBytes);
              const items = [
                {
                  key: "imported",
                  label: isRtl ? "المستوردة" : "Imported",
                  stat: b.imported,
                  dotClass: "bg-[var(--color-action)]",
                },
                {
                  key: "custom",
                  label: isRtl ? "الخاصة" : "Custom",
                  stat: b.custom,
                  dotClass: "bg-emerald-400",
                },
                {
                  key: "google",
                  label: "Google",
                  stat: b.google,
                  dotClass: "bg-sky-400",
                },
                {
                  key: "packs",
                  label: isRtl ? "الحزم السحابية" : "Packs",
                  stat: b.packs,
                  dotClass: "bg-[#B7A1D9]",
                },
                {
                  key: "workspaces",
                  label: isRtl ? "مساحات العمل" : "Workspaces",
                  stat: b.workspaces,
                  dotClass: "bg-amber-400",
                },
                {
                  key: "backups",
                  label: isRtl ? "النسخ الاحتياطية" : "Backups",
                  stat: b.backups,
                  dotClass: "bg-indigo-400",
                },
                {
                  key: "cache",
                  label: isRtl ? "الملفات المؤقتة" : "Cache",
                  stat: b.cache,
                  dotClass: "bg-rose-400",
                },
              ];

              return (
                <>
                  <div className="w-full h-2.5 rounded-full bg-[var(--color-control)] overflow-hidden flex gap-0.5 p-0.5">
                    {items.map((item) => {
                      const pct =
                        b.totalBytes > 0
                          ? Math.max(0, (item.stat.bytes / total) * 100)
                          : 0;
                      if (pct <= 0) return null;
                      return (
                        <div
                          key={item.key}
                          className={`h-full rounded-full ${item.dotClass} transition-all duration-300`}
                          style={{ width: `${Math.max(2, pct)}%` }}
                          title={`${item.label}: ${formatStorageBytes(item.stat.bytes)}`}
                        />
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                    {items.map((item) => (
                      <div
                        key={item.key}
                        className="p-3 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border-subtle)] space-y-1.5 min-w-0"
                      >
                        <div className="flex items-center gap-2 text-[11px] font-sans font-bold text-[var(--color-text-header)]">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${item.dotClass}`}
                          />
                          <span className="truncate">{item.label}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            dir="ltr"
                            className="text-xs font-mono font-bold tabular-nums text-[var(--color-text-header)]"
                          >
                            {formatStorageBytes(item.stat.bytes)}
                          </span>
                          <span className="text-[10px] font-sans text-[var(--color-text-muted)] whitespace-nowrap">
                            <bdi dir="ltr" className="font-mono tabular-nums">
                              {item.stat.files.toLocaleString()}
                            </bdi>{" "}
                            {isRtl ? "ملف" : "files"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {cacheCleanResult && (
              <div
                data-testid="cleanup-cache-feedback"
                className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-sans ${
                  cacheCleanResult.success
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                }`}
                dir="auto"
              >
                {cacheCleanResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {cacheCleanResult.success
                    ? isRtl
                      ? `تم تنظيف ${cacheCleanResult.removedFiles.toLocaleString()} ملف مؤقت وتحرير ${formatStorageBytes(cacheCleanResult.freedBytes)}.`
                      : `Cleaned ${cacheCleanResult.removedFiles.toLocaleString()} temporary files and freed ${formatStorageBytes(cacheCleanResult.freedBytes)}.`
                    : cacheCleanResult.message}
                </span>
              </div>
            )}

            {/* Folder Slice Helper: Rename & Export .ZIP */}
            <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-sans font-bold text-[var(--color-text-header)]">
                <Archive className="w-4 h-4 text-[#B7A1D9] shrink-0" />
                <span>
                  {isRtl
                    ? "أدوات شرائح الخطوط المحلية (تصدير .ZIP / إعادة التسمية)"
                    : "Local Font Slice Tools (Export .ZIP / Rename Slice)"}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_auto] gap-2 items-center">
                <input
                  type="text"
                  dir="ltr"
                  value={sliceFolderPath}
                  onChange={(e) => setSliceFolderPath(e.target.value)}
                  placeholder={
                    isRtl
                      ? "مسار مجلد الشريحة (مثلاً %LOCALAPPDATA%\\Fontivo\\Fonts\\Imported\\Brand)"
                      : "Slice folder path (e.g. %LOCALAPPDATA%\\Fontivo\\Fonts\\Imported\\Brand)"
                  }
                  className="h-9 px-3 rounded-xl bg-[var(--color-control)] border border-[var(--color-border)] focus:border-[var(--color-action)] focus:outline-none text-xs font-mono text-[var(--color-text-header)]"
                />
                <input
                  type="text"
                  dir="auto"
                  value={sliceNewName}
                  onChange={(e) => setSliceNewName(e.target.value)}
                  placeholder={
                    isRtl ? "الاسم الجديد للشريحة" : "New slice name"
                  }
                  className="h-9 px-3 rounded-xl bg-[var(--color-control)] border border-[var(--color-border)] focus:border-[var(--color-action)] focus:outline-none text-xs font-sans text-[var(--color-text-header)]"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRenameSlice}
                    disabled={
                      renamingSlice ||
                      !sliceFolderPath.trim() ||
                      !sliceNewName.trim()
                    }
                    className="h-9 px-3 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] font-sans font-semibold text-xs inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap disabled:opacity-45"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
                    <span>
                      {isRtl ? "إعادة تسمية الشريحة" : "Rename Slice"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportSliceZip}
                    disabled={!sliceFolderPath.trim()}
                    className="h-9 px-3 rounded-xl bg-[#B7A1D9]/15 hover:bg-[#B7A1D9]/25 border border-[#B7A1D9]/35 text-[#B7A1D9] font-sans font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap disabled:opacity-45"
                  >
                    <Archive className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isRtl
                        ? "تصدير شريحة خطوط (.ZIP)"
                        : "Export Font Slice (.ZIP)"}
                    </span>
                  </button>
                </div>
              </div>
              {sliceFeedback && (
                <div
                  className={`p-2.5 rounded-xl border text-xs font-sans ${
                    sliceFeedback.ok
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  }`}
                  dir="auto"
                >
                  {sliceFeedback.message}
                </div>
              )}
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
                  {updateStatus?.error ? (
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : updateStatus?.hasUpdate ? (
                    <ArrowUpCircle className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                  ) : (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  <span>
                    {updateStatus?.status === "ready_to_install"
                      ? isRtl
                        ? `تحديث جديد جاهز للتثبيت (v${updateStatus.latestVersion})`
                        : `Update Ready to Install (v${updateStatus.latestVersion})`
                      : updateStatus?.hasUpdate
                        ? isRtl
                          ? `يتوفر إصدار جديد من Fontivo (v${updateStatus.latestVersion})`
                          : `New Fontivo Update Available (v${updateStatus.latestVersion})`
                        : t.currentVersionInstalled ||
                          (isRtl
                            ? "الإصدار الحالي مثبت ومحدث"
                            : "Current Version Installed & Up to Date")}
                  </span>
                </div>
                <div className="text-[var(--color-text-muted)] text-xs mt-1">
                  <span dir="ltr" className="font-mono inline-block">
                    {`Fontivo v${updateStatus?.currentVersion || APP_VERSION}`}
                  </span>{" "}
                  —{" "}
                  {t.releaseChannel ||
                    (isRtl
                      ? "قناة الإصدارات المستقرة • التحقق المباشر عبر GitHub Releases"
                      : "Stable Release Channel • Live GitHub Releases Check")}{" "}
                  •{" "}
                  <a
                    href="https://fontivo-app.github.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="font-mono text-[var(--color-action)] hover:underline inline-flex items-center gap-1"
                  >
                    <span>fontivo-app.github.io</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
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
                        (isRtl ? "التحقق من التحديثات" : "Check Updates")}
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
                className={`p-3.5 rounded-xl border flex flex-col gap-2.5 ${
                  updateStatus.error
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    : updateStatus.status === "ready_to_install"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : updateStatus.hasUpdate
                        ? "bg-[var(--color-action)]/10 border-[var(--color-action)]/30 text-[var(--color-text-header)]"
                        : "bg-[var(--color-back-subtle)] border-[var(--color-border)] text-[var(--color-text-main)]"
                }`}
                dir="auto"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {updateStatus.error ? (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    ) : updateStatus.hasUpdate ? (
                      <RefreshCw
                        className={`w-4 h-4 text-[var(--color-action)] shrink-0 ${updateStatus.status === "downloading" ? "animate-spin" : ""}`}
                      />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    <span className="truncate">
                      {updateStatus.error
                        ? isRtl
                          ? `تعذر الاتصال بخادم التحديثات: ${updateStatus.error}`
                          : `Unable to reach update server: ${updateStatus.error}`
                        : updateStatus.status === "ready_to_install"
                          ? isRtl
                            ? `تم تنزيل تحديث Fontivo v${updateStatus.latestVersion} وتوثيقه عبر SHA-256 وهو جاهز للتثبيت.`
                            : `Fontivo v${updateStatus.latestVersion} is downloaded, SHA-256 verified, and ready to install.`
                          : updateStatus.status === "downloading"
                            ? isRtl
                              ? `جاري تنزيل الإصدار الجديد v${updateStatus.latestVersion} تلقائياً (${updateStatus.downloadProgress || 0}%)...`
                              : `Downloading new release v${updateStatus.latestVersion} automatically (${updateStatus.downloadProgress || 0}%)...`
                            : updateStatus.hasUpdate
                              ? isRtl
                                ? `يتوفر إصدار أحدث v${updateStatus.latestVersion} (المثبت: v${updateStatus.currentVersion}).`
                                : `Newer release v${updateStatus.latestVersion} is available (installed: v${updateStatus.currentVersion}).`
                              : isRtl
                                ? `برنامج Fontivo محدث لأحدث إصدار رسمي (v${updateStatus.currentVersion || APP_VERSION}).`
                                : `Fontivo is up to date on the latest official release (v${updateStatus.currentVersion || APP_VERSION}).`}
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

                {updateStatus.status === "downloading" && (
                  <div className="w-full h-1.5 rounded-full bg-[var(--color-control)] fontivo-progress-track">
                    <div
                      className="h-full rounded-full bg-[var(--color-action)] fontivo-progress-fill transition-all duration-300"
                      style={{
                        width: `${Math.max(4, updateStatus.downloadProgress || 0)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Fontivo-Fonts & Cloud Catalog Sync Row */}
            <div className="pt-4 border-t border-[var(--color-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0" dir="auto">
                <div className="font-bold text-[var(--color-text-header)] flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#B7A1D9] shrink-0" />
                  <span>
                    {isRtl
                      ? "مكتبة حزم الخطوط السحابية (Fontivo-Fonts)"
                      : "Cloud Font Packs Catalog (Fontivo-Fonts)"}
                  </span>
                  <span
                    dir="ltr"
                    className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#B7A1D9]/15 text-[#B7A1D9] border border-[#B7A1D9]/30"
                  >
                    v
                    {fontsUpdateStatus.libraryVersion || CLOUD_MANIFEST_VERSION}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
                  {fontsUpdateStatus.hasUpdate
                    ? isRtl
                      ? `يتوفر إصدار أحدث من حزم الخطوط (v${fontsUpdateStatus.libraryVersion}) — يمكنك الترقية من تبويب الحزم السحابية.`
                      : `Newer Fontivo-Fonts release available (v${fontsUpdateStatus.libraryVersion}) — view in Cloud Packs.`
                    : fontsUpdateStatus.checkedNow
                      ? isRtl
                        ? `مكتبة الخطوط محدثة بالكامل (${Number(fontsUpdateStatus.totalFonts || CLOUD_TOTAL_FONTS).toLocaleString()} خط عبر ${fontsUpdateStatus.packCount || 15} حزمة).`
                        : `Font library manifest is up to date (${Number(fontsUpdateStatus.totalFonts || CLOUD_TOTAL_FONTS).toLocaleString()} fonts across ${fontsUpdateStatus.packCount || 15} packs).`
                      : isRtl
                        ? "التحقق المباشر من تحديثات الحزم السحابية وكتالوج Google Fonts عبر GitHub."
                        : "Live verification for Fontivo-Fonts cloud packs and Google Fonts catalog via GitHub."}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                {fontsUpdateStatus.hasUpdate && onNavigateTab && (
                  <button
                    onClick={() => onNavigateTab("cloud-packs")}
                    className="px-3 py-2 rounded-xl bg-[#B7A1D9] text-[#130C16] font-bold text-xs cursor-pointer"
                  >
                    {isRtl ? "فتح الحزم المحدثة" : "Open Cloud Packs"}
                  </button>
                )}
                <button
                  onClick={handleCheckFontsUpdate}
                  disabled={checkingFontsUpdate}
                  className="px-3.5 py-2 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-[#B7A1D9] ${checkingFontsUpdate ? "animate-spin" : ""}`}
                  />
                  <span>
                    {checkingFontsUpdate
                      ? isRtl
                        ? "جاري الفحص..."
                        : "Checking..."
                      : isRtl
                        ? "فحص تحديثات الخطوط"
                        : "Check Fonts Updates"}
                  </span>
                </button>
              </div>
            </div>
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
