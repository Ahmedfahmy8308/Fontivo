import React, { useState, useEffect, useCallback } from "react";
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

const APP_VERSION = uiPkg.version || "1.0.2";

export interface UpdaterModalProps {
  isOpen: boolean;
  onClose: () => void;
  t?: Record<string, string>;
  isRtl?: boolean;
}

export default function UpdaterModal({
  isOpen,
  onClose,
  isRtl = false,
}: UpdaterModalProps) {
  const [activeTab, setActiveTab] = useState<"app" | "fonts">("app");

  // App Update State
  const [checkingApp, setCheckingApp] = useState(false);
  const [isApplyingAppUpdate, setIsApplyingAppUpdate] = useState(false);
  const [appUpdateInfo, setAppUpdateInfo] = useState({
    currentVersion: APP_VERSION,
    latestVersion: APP_VERSION,
    hasUpdate: false,
    status: "idle",
    downloadProgress: 0,
    installerPath: undefined as string | undefined,
    error: undefined as string | undefined | null,
    lastChecked: isRtl ? "اليوم" : "Today",
    releaseNotes: isRtl
      ? "محرك Fontivo المحلي بالاعتماد على Rust لإدارة الخطوط وتفعيلها بالذاكرة وتكامل Adobe CC."
      : "Native Rust typography engine with zero-bloat RAM activation, cloud packs, and Adobe CC bridge.",
  });
  const [appStatusMessage, setAppStatusMessage] = useState<string | null>(null);

  // Fonts Catalog Update State
  const [syncingFonts, setSyncingFonts] = useState(false);
  const [fontsCatalogInfo, setFontsCatalogInfo] = useState({
    libraryVersion: "1.0.3",
    embeddedVersion: "1.0.3",
    hasUpdate: false,
    totalGoogleFonts: "10,939",
    totalFamilies: "4,430",
    cloudPacksCount: "15",
    googleCatalogCount: "",
    lastSynced: isRtl ? "اليوم" : "Today",
    catalogStatus: isRtl ? "محدث بالكامل" : "Up to Date",
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
        lastChecked: data.lastChecked
          ? isRtl
            ? "الآن"
            : "Just now"
          : prev.lastChecked,
        releaseNotes: data.releaseNotes || prev.releaseNotes,
      }));
    } catch {
      // ignore offline
    }
  }, [isRtl]);

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
          lastChecked: isRtl ? "الآن" : "Just now",
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
        lastSynced: isRtl ? "الآن" : "Just now",
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs select-none animate-in fade-in duration-150"
      dir={isRtl ? "rtl" : "ltr"}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[92vh] bg-[var(--color-back-card)] rounded-3xl border border-[var(--color-border)] shadow-2xl overflow-hidden flex flex-col text-[var(--color-text-main)] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-back-header)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--color-action)]/15 border border-[var(--color-action)]/30 flex items-center justify-center text-[var(--color-action)] shadow-sm shrink-0">
              <ArrowUpCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--color-text-header)] tracking-tight">
                  {isRtl ? "مركز التحديثات الشامل" : "Fontivo Updates Center"}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-muted)] font-bold">
                  v{appUpdateInfo.currentVersion}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {isRtl
                  ? "إدارة وتحديث إصدار التطبيق ومكتبات الخطوط السحابية"
                  : "Manage updates for the application and cloud font catalogs"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
            title={isRtl ? "إغلاق" : "Close"}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-5 pt-3 border-b border-[var(--color-border)] bg-[var(--color-back-subtle)] flex items-center gap-2">
          <button
            onClick={() => setActiveTab("app")}
            className={`px-4 py-2 text-xs font-bold transition border-b-2 cursor-pointer flex items-center gap-2 -mb-px ${
              activeTab === "app"
                ? "border-[var(--color-action)] text-[var(--color-action)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
            }`}
          >
            <ArrowUpCircle className="w-4 h-4" />
            <span>
              {isRtl ? "تحديثات التطبيق (Application)" : "App Updates"}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("fonts")}
            className={`px-4 py-2 text-xs font-bold transition border-b-2 cursor-pointer flex items-center gap-2 -mb-px ${
              activeTab === "fonts"
                ? "border-[var(--color-action)] text-[var(--color-action)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>
              {isRtl ? "تحديثات الخطوط (Fonts Library)" : "Fonts Updates"}
            </span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 sm:p-6 space-y-4 bg-[var(--color-back-main)] overflow-y-auto flex-1 text-xs">
          {activeTab === "app" ? (
            /* TAB 1: APPLICATION UPDATES */
            <div className="space-y-4">
              {/* App Status Card */}
              <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${
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
                  <div>
                    <h4 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2">
                      <span>
                        {appUpdateInfo.status === "ready_to_install"
                          ? isRtl
                            ? `تحديث جديد جاهز (v${appUpdateInfo.latestVersion})`
                            : `Update v${appUpdateInfo.latestVersion} Ready`
                          : appUpdateInfo.hasUpdate
                            ? isRtl
                              ? `يتوفر إصدار جديد (v${appUpdateInfo.latestVersion})`
                              : `Update v${appUpdateInfo.latestVersion} Available`
                            : isRtl
                              ? "تطبيق Fontivo محدث بالكامل"
                              : "Fontivo is Up to Date"}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          appUpdateInfo.hasUpdate
                            ? "bg-[var(--color-action)]/15 text-[var(--color-action)]"
                            : "bg-[var(--color-green)]/15 text-[var(--color-green)]"
                        }`}
                      >
                        {appUpdateInfo.hasUpdate
                          ? isRtl
                            ? "ترقية"
                            : "Update"
                          : isRtl
                            ? "مستقر"
                            : "Stable"}
                      </span>
                    </h4>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                      {isRtl
                        ? `الإصدار المثبت: v${appUpdateInfo.currentVersion} • آخر فحص: ${appUpdateInfo.lastChecked}`
                        : `Installed: v${appUpdateInfo.currentVersion} • Last check: ${appUpdateInfo.lastChecked}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {appUpdateInfo.status === "ready_to_install" && (
                    <button
                      onClick={handleApplyAppUpdate}
                      disabled={isApplyingAppUpdate}
                      className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-emerald-600/20"
                      data-testid="modal-apply-btn"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isApplyingAppUpdate ? "animate-spin" : ""}`}
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
                    className="h-9 px-4 rounded-xl bg-[var(--color-action)] hover:opacity-90 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 shadow-md shadow-[var(--color-action)]/20"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${checkingApp ? "animate-spin" : ""}`}
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
                <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs space-y-1.5 animate-in fade-in">
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span>
                      {isRtl
                        ? "جاري تنزيل التحديث في الخلفية..."
                        : "Downloading update in background..."}
                    </span>
                    <span>{appUpdateInfo.downloadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-sky-950 overflow-hidden">
                    <div
                      className="h-full bg-sky-400 transition-all duration-300"
                      style={{ width: `${appUpdateInfo.downloadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {appStatusMessage && (
                <div className="p-3.5 rounded-xl bg-[var(--color-green)]/10 border border-[var(--color-green)]/20 text-[var(--color-green)] text-xs flex items-center gap-2 animate-in fade-in">
                  <PackageCheck className="w-4 h-4 shrink-0" />
                  <span>{appStatusMessage}</span>
                </div>
              )}

              {/* Release Notes */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[var(--color-text-header)] flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-[var(--color-action)]" />
                  <span>
                    {isRtl
                      ? "ملاحظات الإصدار الحالي (Changelog):"
                      : "Release Notes & Engine Updates:"}
                  </span>
                </h4>
                <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)] leading-relaxed space-y-2">
                  <p>{appUpdateInfo.releaseNotes}</p>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-[var(--color-text-main)] pt-1">
                    <li>
                      {isRtl
                        ? "محرك Native Rust 2021 فائق الخفة والسرعة."
                        : "Ultra-fast Native Rust 2021 core engine."}
                    </li>
                    <li>
                      {isRtl
                        ? "تفعيل فوري لخطوط النظام وأدوبي في الرام بدون إعادة تشغيل."
                        : "Instant zero-reboot RAM activation for Adobe CC."}
                    </li>
                    <li>
                      {isRtl
                        ? "مكتبة فونتيفو وجوجل بأكثر من 10,939 خطاً سحابياً ومحلياً."
                        : "Unified catalog with over 10,939 fonts."}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            /* TAB 2: FONTS CATALOG & CLOUD UPDATES */
            <div className="space-y-4">
              {/* Fonts Catalog Card */}
              <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2">
                      <span>
                        {isRtl
                          ? "كتالوج Google Fonts والحزم السحابية"
                          : "Cloud & Google Fonts Catalog"}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-400 text-[10px] font-bold">
                        {fontsCatalogInfo.catalogStatus}
                      </span>
                    </h4>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                      {isRtl
                        ? `إجمالي الخطوط: ${fontsCatalogInfo.totalGoogleFonts} خطاً (${fontsCatalogInfo.totalFamilies} عائلة)`
                        : `Total Fonts: ${fontsCatalogInfo.totalGoogleFonts} fonts (${fontsCatalogInfo.totalFamilies} families)`}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleSyncFontsCatalog}
                  disabled={syncingFonts}
                  className="h-9 px-4 rounded-xl bg-[var(--color-action)] hover:opacity-90 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 shadow-md shadow-[var(--color-action)]/20"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${syncingFonts ? "animate-spin" : ""}`}
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

              {fontsStatusMessage && (
                <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs flex items-center gap-2 animate-in fade-in">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{fontsStatusMessage}</span>
                </div>
              )}

              {/* Fonts Breakdown Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 text-sky-400 font-bold text-xs">
                    <Globe className="w-4 h-4" />
                    <span>
                      {isRtl ? "مكتبة Google Fonts" : "Google Fonts Library"}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {isRtl
                      ? "كتالوج رسمي متكامل يضم كافة الخطوط العربية واللاتينية مع إمكانية التفعيل المباشر بالرام أو الحفظ بالقرص."
                      : "Official live catalog supporting all Arabic and Latin typography with 1-click RAM activation."}
                  </p>
                  <span className="text-[10px] font-mono text-[var(--color-text-dim)] block pt-1">
                    10,939 {isRtl ? "خطاً موثقاً" : "verified fonts"}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                    <Layers className="w-4 h-4" />
                    <span>
                      {isRtl ? "حزم التوسعة (Cloud Packs)" : "Expansion Packs"}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {isRtl
                      ? "15 حزمة متخصصة تشمل الخطوط الكوفية، الثلث، والنسخ، وخطوط واجهات المستخدم الحديثة."
                      : "15 specialized packages including Kufi, Thuluth, Naskh, and modern UI/UX typefaces."}
                  </p>
                  <span className="text-[10px] font-mono text-[var(--color-text-dim)] block pt-1">
                    15 {isRtl ? "حزمة متكاملة" : "curated packs"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-[var(--color-border)] bg-[var(--color-back-header)] flex items-center justify-between">
          <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
            Fontivo Universal Updates Manager
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] text-xs font-bold transition cursor-pointer"
          >
            {isRtl ? "إغلاق" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
