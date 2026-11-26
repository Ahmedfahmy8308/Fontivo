import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpCircle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  PackageCheck,
  Globe,
  Layers,
  Info,
  Check,
} from "lucide-react";
import uiPkg from "../../../package.json";
import {
  CLOUD_MANIFEST_VERSION,
  CLOUD_TOTAL_FONTS,
  CLOUD_TOTAL_FAMILIES,
} from "../../utils/cloudPackages";

const APP_VERSION = uiPkg.version;

function stripCliFooter(raw: string): string {
  let cleaned = (raw || "").replace(/\r\n/g, "\n");
  for (const marker of [
    "\n---\n### Platform Install Channels",
    "\n### Platform Install Channels",
    "--- ### Platform Install Channels",
    "### Platform Install Channels & Verification",
    "**Cryptographic Verification (Free SLSA",
  ]) {
    const idx = cleaned.indexOf(marker);
    if (idx !== -1) {
      cleaned = cleaned.slice(0, idx);
    }
  }
  return cleaned.replace(/---\s*$/, "").trim();
}

export function summarizeReleaseNotes(raw?: string | null): string {
  const cleaned = stripCliFooter(raw || "");
  if (!cleaned) return "";
  const plain = cleaned
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 140 ? `${plain.slice(0, 137)}...` : plain;
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong
          key={idx}
          className="font-semibold text-[var(--color-text-header)]"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          dir="ltr"
          className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-[var(--color-control)] border border-[var(--color-border-subtle)] text-[10px] font-mono text-[var(--color-text-header)] break-all"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function formatCheckTime(iso: string | null | undefined, isRtl: boolean): string {
  if (!iso) {
    return isRtl ? "لم يُفحص بعد" : "Not checked yet";
  }
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    return iso;
  }
  return dt.toLocaleTimeString(isRtl ? "ar-EG" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface AppUpdateInfoState {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  status: string;
  downloadProgress: number;
  installerPath?: string;
  error?: string | null;
  lastChecked: string | null;
  releaseNotes: string;
}

export interface UpdaterModalProps {
  isOpen: boolean;
  onClose: () => void;
  t?: Record<string, string>;
  isRtl?: boolean;
  initialTab?: "app" | "fonts";
  initialAppUpdateInfo?: Partial<AppUpdateInfoState>;
}

export default function UpdaterModal({
  isOpen,
  onClose,
  isRtl = false,
  initialTab = "app",
  initialAppUpdateInfo,
}: UpdaterModalProps) {
  const [activeTab, setActiveTab] = useState<"app" | "fonts">(initialTab);

  // App Update State (zero mock defaults)
  const [checkingApp, setCheckingApp] = useState(false);
  const [isApplyingAppUpdate, setIsApplyingAppUpdate] = useState(false);
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfoState>({
    currentVersion: APP_VERSION,
    latestVersion: APP_VERSION,
    hasUpdate: false,
    status: "idle",
    downloadProgress: 0,
    installerPath: undefined,
    error: undefined,
    lastChecked: null,
    releaseNotes: "",
    ...initialAppUpdateInfo,
  });
  const [appStatusMessage, setAppStatusMessage] = useState<string | null>(null);

  // Fonts Catalog Update State
  const [syncingFonts, setSyncingFonts] = useState(false);
  const [fontsCatalogInfo, setFontsCatalogInfo] = useState({
    libraryVersion: CLOUD_MANIFEST_VERSION,
    embeddedVersion: CLOUD_MANIFEST_VERSION,
    hasUpdate: false,
    totalGoogleFonts: CLOUD_TOTAL_FONTS.toLocaleString(),
    totalFamilies: CLOUD_TOTAL_FAMILIES.toLocaleString(),
    cloudPacksCount: "15",
    googleCatalogCount: "",
    lastSynced: null as string | null,
    catalogStatus: isRtl ? "متصل بالسحابة" : "Connected",
  });
  const [fontsStatusMessage, setFontsStatusMessage] = useState<string | null>(
    null,
  );

  const syncAppStatusSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/updater", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setAppUpdateInfo((prev) => ({
        ...prev,
        currentVersion: data.currentVersion || prev.currentVersion,
        latestVersion: data.latestVersion || prev.latestVersion,
        hasUpdate: Boolean(data.hasUpdate),
        status: data.status || prev.status,
        downloadProgress:
          typeof data.downloadProgress === "number"
            ? data.downloadProgress
            : prev.downloadProgress,
        installerPath: data.installerPath,
        error: data.error ?? null,
        lastChecked: data.lastChecked || prev.lastChecked,
        releaseNotes: data.releaseNotes || prev.releaseNotes,
      }));
    } catch {
      // ignore offline
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    syncAppStatusSnapshot();
    fetch("/api/catalog/packages", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.libraryVersion) {
          setFontsCatalogInfo((prev) => ({
            ...prev,
            libraryVersion: data.libraryVersion,
            embeddedVersion: data.embeddedVersion || prev.embeddedVersion,
            hasUpdate: Boolean(data.hasUpdate),
            cloudPacksCount: String(data.packCount || prev.cloudPacksCount),
            catalogStatus: data.hasUpdate
              ? isRtl
                ? `يتوفر إصدار v${data.libraryVersion}`
                : `v${data.libraryVersion} Available`
              : isRtl
                ? "محدث بالكامل"
                : "Up to Date",
          }));
        }
      })
      .catch(() => {});
  }, [isOpen, syncAppStatusSnapshot, isRtl]);

  useEffect(() => {
    if (!isOpen || appUpdateInfo.status !== "downloading") return;
    const timer = setInterval(syncAppStatusSnapshot, 1200);
    return () => clearInterval(timer);
  }, [isOpen, appUpdateInfo.status, syncAppStatusSnapshot]);

  if (!isOpen) return null;

  const handleCheckAppUpdate = async () => {
    setCheckingApp(true);
    setAppStatusMessage(null);
    try {
      let res = await fetch("/api/updater/check", {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) {
        res = await fetch("/api/updater", { cache: "no-store" });
      }
      if (res.ok) {
        const data = await res.json();
        const ver = data.currentVersion || appUpdateInfo.currentVersion;
        const latest = data.latestVersion || ver;
        setAppUpdateInfo((prev) => ({
          ...prev,
          currentVersion: ver,
          latestVersion: latest,
          hasUpdate: Boolean(data.hasUpdate),
          status: data.status || prev.status,
          downloadProgress:
            typeof data.downloadProgress === "number"
              ? data.downloadProgress
              : prev.downloadProgress,
          installerPath: data.installerPath,
          error: data.error ?? null,
          lastChecked: data.lastChecked || new Date().toISOString(),
          releaseNotes: data.releaseNotes || prev.releaseNotes,
        }));
        if (data.error) {
          setAppStatusMessage(
            isRtl
              ? `تعذر الاتصال بخادم التحديثات: ${data.error}`
              : `Could not reach update server: ${data.error}`,
          );
        } else if (data.status === "ready_to_install") {
          setAppStatusMessage(
            isRtl
              ? `تم تنزيل تحديث Fontivo v${latest} تلقائياً وهو جاهز للتثبيت!`
              : `Fontivo v${latest} is downloaded and ready to install!`,
          );
        } else if (data.hasUpdate) {
          setAppStatusMessage(
            isRtl
              ? `يوجد إصدار جديد (v${latest}) جاري تنزيله تلقائياً في الخلفية...`
              : `New release (v${latest}) found! Downloading in the background...`,
          );
        } else {
          setAppStatusMessage(
            isRtl
              ? `أنت تستخدم أحدث إصدار رسمي من تطبيق Fontivo (v${ver})!`
              : `You are running the latest official release of Fontivo (v${ver})!`,
          );
        }
      }
    } catch {
      setAppStatusMessage(
        isRtl
          ? "تعذر الاتصال بخادم التحديثات. تحقق من الاتصال بالإنترنت."
          : "Unable to reach GitHub releases. Check your internet connection.",
      );
    } finally {
      setCheckingApp(false);
    }
  };

  const handleApplyAppUpdate = async () => {
    setIsApplyingAppUpdate(true);
    try {
      await fetch("/api/updater/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ silent: true }),
      });
    } catch {
      // ignore
    } finally {
      setTimeout(() => setIsApplyingAppUpdate(false), 5000);
    }
  };

  const handleSyncFontsCatalog = async () => {
    setSyncingFonts(true);
    setFontsStatusMessage(null);
    try {
      const [manifestRes, googleRes] = await Promise.all([
        fetch("/api/catalog/refresh-manifest", { cache: "no-store" }),
        fetch("/api/google/catalog?refresh=true", { cache: "no-store" }),
      ]);

      let nextLibVer = fontsCatalogInfo.libraryVersion;
      let hasFontsUpdate = false;
      let nextTotalFonts = fontsCatalogInfo.totalGoogleFonts;
      let nextFamilies = fontsCatalogInfo.totalFamilies;
      let nextPacksCount = fontsCatalogInfo.cloudPacksCount;
      let googleCountStr = "";

      if (manifestRes.ok) {
        const mData = await manifestRes.json();
        nextLibVer = String(mData.libraryVersion || nextLibVer);
        hasFontsUpdate = Boolean(mData.hasUpdate);
        if (mData.totalFonts) {
          nextTotalFonts = Number(mData.totalFonts).toLocaleString();
        }
        if (mData.totalFamilies) {
          nextFamilies = Number(mData.totalFamilies).toLocaleString();
        }
        if (mData.packCount) {
          nextPacksCount = String(mData.packCount);
        }
      }

      if (googleRes.ok) {
        const gData = await googleRes.json();
        if (gData.totalFamilies || gData.totalFonts) {
          googleCountStr = String(
            Number(gData.totalFamilies || gData.totalFonts).toLocaleString(),
          );
        }
      }

      setFontsCatalogInfo((prev) => ({
        ...prev,
        libraryVersion: nextLibVer,
        hasUpdate: hasFontsUpdate,
        totalGoogleFonts: nextTotalFonts,
        totalFamilies: nextFamilies,
        cloudPacksCount: nextPacksCount,
        googleCatalogCount: googleCountStr || prev.googleCatalogCount,
        lastSynced: new Date().toISOString(),
        catalogStatus: hasFontsUpdate
          ? isRtl
            ? `يتوفر إصدار v${nextLibVer}`
            : `v${nextLibVer} Available`
          : isRtl
            ? `محدث (v${nextLibVer})`
            : `Up to Date (v${nextLibVer})`,
      }));

      setFontsStatusMessage(
        hasFontsUpdate
          ? isRtl
            ? `يتوفر تحديث جديد لمكتبة الخطوط (Fontivo-Fonts v${nextLibVer})! افتح تبويب الحزم السحابية لتنزيل الحزم المحدثة.`
            : `New Fontivo-Fonts update available (v${nextLibVer})! Open Cloud Packs to download updated bundles.`
          : isRtl
            ? `تمت المزامنة بنجاح! مكتبة Fontivo-Fonts v${nextLibVer} (${nextTotalFonts} خط عبر ${nextPacksCount} حزمة) محدثة بالكامل.`
            : `Synced! Fontivo-Fonts v${nextLibVer} (${nextTotalFonts} fonts across ${nextPacksCount} packs) is completely up to date.`,
      );
    } catch {
      setFontsStatusMessage(
        isRtl
          ? "تعذر الاتصال بـ GitHub لمزامنة كتالوج الخطوط الآن."
          : "Could not reach GitHub to sync font catalog updates.",
      );
    } finally {
      setSyncingFonts(false);
    }
  };

  const cleanedReleaseNotes = stripCliFooter(appUpdateInfo.releaseNotes);
  const parsedNoteLines = cleanedReleaseNotes
    ? cleanedReleaseNotes
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  const isReadyToInstall = appUpdateInfo.status === "ready_to_install";
  const clampedDownloadProgress = Math.max(
    0,
    Math.min(100, Number(appUpdateInfo.downloadProgress || 0)),
  );

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-xs select-none animate-in fade-in duration-150"
      dir={isRtl ? "rtl" : "ltr"}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[calc(100vw-1.5rem)] sm:max-w-2xl max-h-[88dvh] bg-[var(--color-back-card)] rounded-2xl sm:rounded-3xl border border-[var(--color-border)] shadow-2xl overflow-hidden flex flex-col text-[var(--color-text-main)] animate-in zoom-in-95 duration-150 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--color-border)] flex items-center justify-between gap-3 bg-[var(--color-back-header)] shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-action)]/15 border border-[var(--color-action)]/30 flex items-center justify-center text-[var(--color-action)] shadow-sm shrink-0">
              <ArrowUpCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2 leading-normal">
                <h2 className="text-sm sm:text-base font-sans font-bold text-[var(--color-text-header)] tracking-tight leading-normal">
                  {isRtl ? "مركز التحديثات الشامل" : "Fontivo Updates Center"}
                </h2>
                <span
                  dir="ltr"
                  className="inline-flex items-center text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-muted)] font-bold shrink-0"
                >
                  {`v${appUpdateInfo.currentVersion}`}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs font-sans text-[var(--color-text-muted)] leading-normal">
                {isRtl
                  ? "إدارة وتحديث إصدار التطبيق ومكتبات الخطوط السحابية"
                  : "Manage updates for the application and cloud font catalogs"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl inline-flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer shrink-0"
            title={isRtl ? "إغلاق" : "Close"}
            aria-label={isRtl ? "إغلاق" : "Close"}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-4 sm:px-5 pt-2.5 border-b border-[var(--color-border)] bg-[var(--color-back-subtle)] flex items-center gap-2 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab("app")}
            className={`h-10 px-3.5 text-xs font-sans font-bold transition border-b-2 cursor-pointer inline-flex items-center gap-2 -mb-px whitespace-nowrap shrink-0 ${
              activeTab === "app"
                ? "border-[var(--color-action)] text-[var(--color-action)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
            }`}
          >
            <ArrowUpCircle className="w-4 h-4 shrink-0" />
            <span>
              {isRtl ? "تحديثات التطبيق (Application)" : "App Updates"}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("fonts")}
            className={`h-10 px-3.5 text-xs font-sans font-bold transition border-b-2 cursor-pointer inline-flex items-center gap-2 -mb-px whitespace-nowrap shrink-0 ${
              activeTab === "fonts"
                ? "border-[var(--color-action)] text-[var(--color-action)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
            }`}
          >
            <Globe className="w-4 h-4 shrink-0" />
            <span>
              {isRtl ? "تحديثات الخطوط (Fonts Library)" : "Fonts Updates"}
            </span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 space-y-4 bg-[var(--color-back-main)] overflow-y-auto min-h-0 flex-1 text-xs">
          {activeTab === "app" ? (
            /* TAB 1: APPLICATION UPDATES */
            <div className="space-y-4">
              {/* App Status Card — 2 Clean Balanced Sections */}
              <div
                data-testid="updater-app-status-card"
                className="p-4 sm:p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] flex flex-col gap-4 shadow-xs"
              >
                {/* Section 1: Header row (Icon Box + Title + Status Pill + 1-line Subtitle) */}
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${
                      appUpdateInfo.error
                        ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                        : appUpdateInfo.hasUpdate
                          ? "bg-[var(--color-action)]/15 border-[var(--color-action)]/30 text-[var(--color-action)]"
                          : "bg-[var(--color-green)]/15 border-[var(--color-green)]/30 text-[var(--color-green)]"
                    }`}
                  >
                    {appUpdateInfo.error ? (
                      <AlertCircle className="w-5 h-5" />
                    ) : appUpdateInfo.hasUpdate ? (
                      <ArrowUpCircle className="w-5 h-5" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 leading-normal">
                      <h4 className="text-sm sm:text-[15px] font-sans font-bold text-[var(--color-text-header)] leading-normal">
                        {isReadyToInstall
                          ? isRtl
                            ? `تحديث جديد جاهز (v${appUpdateInfo.latestVersion})`
                            : `Update v${appUpdateInfo.latestVersion} Ready`
                          : appUpdateInfo.hasUpdate
                            ? isRtl
                              ? `يتوفر إصدار جديد (v${appUpdateInfo.latestVersion})`
                              : `Update v${appUpdateInfo.latestVersion} Available`
                            : appUpdateInfo.error
                              ? isRtl
                                ? "تعذر التحقق من التحديثات"
                                : "Update Check Failed"
                              : isRtl
                                ? "تطبيق Fontivo محدث بالكامل"
                                : "Fontivo is Up to Date"}
                      </h4>
                      <span
                        data-testid="updater-status-pill"
                        className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-sans font-bold whitespace-nowrap shrink-0 border ${
                          appUpdateInfo.error
                            ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                            : appUpdateInfo.hasUpdate
                              ? "bg-[var(--color-action)]/15 border-[var(--color-action)]/30 text-[var(--color-action)]"
                              : "bg-[var(--color-green)]/15 border-[var(--color-green)]/30 text-[var(--color-green)]"
                        }`}
                      >
                        {appUpdateInfo.error
                          ? isRtl
                            ? "غير متصل"
                            : "Offline"
                          : appUpdateInfo.hasUpdate
                            ? isRtl
                              ? "ترقية"
                              : "Update"
                            : isRtl
                              ? "مستقر"
                              : "Stable"}
                      </span>
                    </div>
                    <p
                      data-testid="updater-status-subtitle"
                      className="text-xs font-sans text-[var(--color-text-muted)] leading-normal flex flex-wrap items-center gap-x-2.5 gap-y-1"
                    >
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span>{isRtl ? "الإصدار المثبت:" : "Installed:"}</span>
                        <strong
                          dir="ltr"
                          className="font-mono font-bold text-[var(--color-text-header)]"
                        >
                          {`v${appUpdateInfo.currentVersion}`}
                        </strong>
                      </span>
                      <span aria-hidden="true" className="opacity-50">
                        •
                      </span>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span>{isRtl ? "آخر فحص:" : "Last check:"}</span>
                        <span className="font-medium text-[var(--color-text-main)]">
                          {formatCheckTime(appUpdateInfo.lastChecked, isRtl)}
                        </span>
                      </span>
                    </p>
                  </div>
                </div>

                {/* Section 2: Action Toolbar Cleanly Separated */}
                <div
                  data-testid="updater-action-toolbar"
                  className="pt-3.5 border-t border-[var(--color-border-subtle)] flex flex-wrap items-center gap-2.5"
                >
                  {isReadyToInstall && (
                    <button
                      onClick={handleApplyAppUpdate}
                      disabled={isApplyingAppUpdate}
                      className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-sans font-bold whitespace-nowrap shrink-0 transition cursor-pointer disabled:opacity-60 shadow-md shadow-emerald-600/20"
                      data-testid="modal-apply-btn"
                    >
                      <RefreshCw
                        className={`w-4 h-4 shrink-0 ${isApplyingAppUpdate ? "animate-spin" : ""}`}
                      />
                      <span>
                        {isApplyingAppUpdate
                          ? isRtl
                            ? "جاري التحديث..."
                            : "Restarting..."
                          : isRtl
                            ? "إعادة التشغيل والتحديث الآن"
                            : "Restart & Update Now"}
                      </span>
                    </button>
                  )}
                  <button
                    onClick={handleCheckAppUpdate}
                    disabled={checkingApp}
                    data-testid="modal-check-btn"
                    className={`inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs font-sans font-bold whitespace-nowrap shrink-0 transition cursor-pointer disabled:opacity-50 ${
                      isReadyToInstall
                        ? "bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)]"
                        : "bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white shadow-md shadow-[var(--color-action)]/20"
                    }`}
                  >
                    <RefreshCw
                      className={`w-4 h-4 shrink-0 ${checkingApp ? "animate-spin" : ""}`}
                    />
                    <span>
                      {checkingApp
                        ? isRtl
                          ? "جاري الفحص..."
                          : "Checking..."
                        : isRtl
                          ? "فحص التحديثات الآن"
                          : "Check for Updates"}
                    </span>
                  </button>
                </div>
              </div>

              {appUpdateInfo.status === "downloading" && (
                <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/25 text-sky-400 text-xs space-y-2 animate-in fade-in">
                  <div className="flex justify-between items-center gap-2 text-xs font-sans font-bold leading-normal">
                    <span>
                      {isRtl
                        ? "جاري تنزيل التحديث في الخلفية..."
                        : "Downloading update in background..."}
                    </span>
                    <span dir="ltr" className="font-mono tabular-nums shrink-0">
                      {clampedDownloadProgress}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-sky-500/20 overflow-hidden fontivo-progress-track">
                    <div
                      className="h-full bg-sky-400 rounded-full transition-all duration-300 fontivo-progress-fill"
                      style={{ width: `${clampedDownloadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {appStatusMessage && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs font-sans flex items-start gap-2.5 leading-relaxed animate-in fade-in ${
                    appUpdateInfo.error
                      ? "bg-amber-500/12 border-amber-500/30 text-amber-400"
                      : "bg-[var(--color-green)]/12 border-[var(--color-green)]/30 text-[var(--color-green)]"
                  }`}
                >
                  {appUpdateInfo.error ? (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <PackageCheck className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span className="min-w-0 flex-1 break-words">
                    {appStatusMessage}
                  </span>
                </div>
              )}

              {/* Release Notes */}
              <div className="space-y-2">
                <h4 className="text-xs font-sans font-bold text-[var(--color-text-header)] flex items-center gap-2 leading-normal">
                  <Info className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                  <span>
                    {isRtl
                      ? "ملاحظات الإصدار الحالي (Changelog):"
                      : "Release Notes & Engine Updates:"}
                  </span>
                </h4>
                <div
                  dir="auto"
                  className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] text-xs font-sans text-[var(--color-text-muted)] leading-relaxed space-y-2 break-words"
                >
                  {parsedNoteLines.length > 0 ? (
                    parsedNoteLines.map((line, idx) => {
                      if (/^#{1,4}\s+/.test(line)) {
                        return (
                          <div
                            key={idx}
                            className="font-bold text-[var(--color-text-header)] pt-1.5 first:pt-0 text-xs leading-normal"
                          >
                            {renderInlineMarkdown(line.replace(/^#{1,4}\s+/, ""))}
                          </div>
                        );
                      }
                      if (/^[-*•]\s+/.test(line)) {
                        return (
                          <div key={idx} className="flex items-start gap-2 ps-1">
                            <span className="text-[var(--color-action)] font-bold shrink-0">
                              •
                            </span>
                            <span className="min-w-0 flex-1 break-words leading-relaxed">
                              {renderInlineMarkdown(line.replace(/^[-*•]\s+/, ""))}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <p key={idx} className="break-words leading-relaxed">
                          {renderInlineMarkdown(line)}
                        </p>
                      );
                    })
                  ) : (
                    <p className="leading-relaxed">
                      {isRtl
                        ? "اضغط على فحص التحديثات الآن لجلب أحدث ملاحظات الإصدار من GitHub."
                        : "Click Check for Updates to fetch the latest release notes."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* TAB 2: FONTS CATALOG & CLOUD UPDATES */
            <div className="space-y-4">
              {/* Fonts Catalog Card — Matching 2-Section Layout */}
              <div
                data-testid="updater-fonts-status-card"
                className="p-4 sm:p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] flex flex-col gap-4 shadow-xs"
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 leading-normal">
                      <h4 className="text-sm sm:text-[15px] font-sans font-bold text-[var(--color-text-header)] leading-normal">
                        {isRtl
                          ? "كتالوج Google Fonts والحزم السحابية"
                          : "Cloud & Google Fonts Catalog"}
                      </h4>
                      <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-[11px] font-sans font-bold whitespace-nowrap shrink-0">
                        {fontsCatalogInfo.catalogStatus}
                      </span>
                    </div>
                    <p className="text-xs font-sans text-[var(--color-text-muted)] leading-normal flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span>
                          {isRtl
                            ? `إجمالي الخطوط: ${fontsCatalogInfo.totalGoogleFonts} خطاً (${fontsCatalogInfo.totalFamilies} عائلة)`
                            : `Total Fonts: ${fontsCatalogInfo.totalGoogleFonts} fonts (${fontsCatalogInfo.totalFamilies} families)`}
                        </span>
                      </span>
                      {fontsCatalogInfo.lastSynced && (
                        <>
                          <span aria-hidden="true" className="opacity-50">
                            •
                          </span>
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span>
                              {isRtl ? "آخر مزامنة:" : "Last sync:"}{" "}
                              {formatCheckTime(fontsCatalogInfo.lastSynced, isRtl)}
                            </span>
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="pt-3.5 border-t border-[var(--color-border-subtle)] flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={handleSyncFontsCatalog}
                    disabled={syncingFonts}
                    className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-sans font-bold whitespace-nowrap shrink-0 transition cursor-pointer disabled:opacity-50 shadow-md shadow-[var(--color-action)]/20"
                  >
                    <RefreshCw
                      className={`w-4 h-4 shrink-0 ${syncingFonts ? "animate-spin" : ""}`}
                    />
                    <span>
                      {syncingFonts
                        ? isRtl
                          ? "جاري المزامنة..."
                          : "Syncing..."
                        : isRtl
                          ? "مزامنة الكتالوج الآن"
                          : "Sync Catalog Now"}
                    </span>
                  </button>
                </div>
              </div>

              {fontsStatusMessage && (
                <div className="p-3.5 rounded-2xl bg-sky-500/12 border border-sky-500/30 text-sky-400 text-xs font-sans flex items-start gap-2.5 leading-relaxed animate-in fade-in">
                  <Check className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="min-w-0 flex-1 break-words">
                    {fontsStatusMessage}
                  </span>
                </div>
              )}

              {/* Fonts Breakdown Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-2 shadow-2xs">
                  <div className="flex items-center gap-2 text-sky-400 font-sans font-bold text-xs">
                    <Globe className="w-4 h-4 shrink-0" />
                    <span>
                      {isRtl ? "مكتبة Google Fonts" : "Google Fonts Library"}
                    </span>
                  </div>
                  <p className="text-[11px] font-sans text-[var(--color-text-muted)] leading-relaxed">
                    {isRtl
                      ? "كتالوج رسمي متكامل يضم كافة الخطوط العربية واللاتينية مع إمكانية التفعيل المباشر بالرام أو الحفظ بالقرص."
                      : "Official live catalog supporting all Arabic and Latin typography with 1-click RAM activation."}
                  </p>
                  <span className="text-[11px] font-sans text-[var(--color-text-dim)] inline-flex items-center gap-1 pt-0.5">
                    <strong className="font-mono tabular-nums text-[var(--color-text-header)]">
                      {fontsCatalogInfo.totalGoogleFonts}
                    </strong>
                    <span>{isRtl ? "خطاً موثقاً" : "verified fonts"}</span>
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-2 shadow-2xs">
                  <div className="flex items-center gap-2 text-emerald-400 font-sans font-bold text-xs">
                    <Layers className="w-4 h-4 shrink-0" />
                    <span>
                      {isRtl ? "حزم التوسعة (Cloud Packs)" : "Expansion Packs"}
                    </span>
                  </div>
                  <p className="text-[11px] font-sans text-[var(--color-text-muted)] leading-relaxed">
                    {isRtl
                      ? "حزم متخصصة تشمل الخطوط الكوفية، الثلث، والنسخ، وخطوط واجهات المستخدم الحديثة."
                      : "Curated packages including Kufi, Thuluth, Naskh, and modern UI/UX typefaces."}
                  </p>
                  <span className="text-[11px] font-sans text-[var(--color-text-dim)] inline-flex items-center gap-1 pt-0.5">
                    <strong className="font-mono tabular-nums text-[var(--color-text-header)]">
                      {fontsCatalogInfo.cloudPacksCount}
                    </strong>
                    <span>{isRtl ? "حزمة متكاملة" : "curated packs"}</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-5 border-t border-[var(--color-border)] bg-[var(--color-back-header)] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
            Fontivo Universal Updates Manager
          </span>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center h-9 px-5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] text-xs font-sans font-bold whitespace-nowrap transition cursor-pointer shrink-0"
          >
            {isRtl ? "إغلاق" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" && document.body?.nodeType === 1
    ? createPortal(modalContent, document.body)
    : modalContent;
}
