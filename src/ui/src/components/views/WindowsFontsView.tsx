import React, { useState, useEffect } from "react";
import {
  HardDrive,
  ShieldCheck,
  ShieldAlert,
  Search,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Type,
  RefreshCw,
  Info,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Layers,
  Undo2,
  History,
  Shield,
} from "lucide-react";
import { safeFetch, safeFetchJson } from "../../utils/safeFetch";
import { upsertLiveOperation } from "../../utils/operationsBus";

const CORE_WINDOWS_FONT_FAMILIES = new Set([
  "segoe ui",
  "segoe ui variable",
  "segoe print",
  "segoe script",
  "arial",
  "arial black",
  "tahoma",
  "times new roman",
  "calibri",
  "calibri light",
  "consolas",
  "courier new",
  "verdana",
  "georgia",
  "trebuchet ms",
  "comic sans ms",
  "impact",
  "wingdings",
  "symbol",
  "marlett",
  "ms sans serif",
  "ms serif",
  "palatino linotype",
  "franklin gothic medium",
  "cambria",
  "candara",
  "constantia",
  "corbel",
  "ebrima",
  "gadugi",
  "leelawadee ui",
  "malgun gothic",
  "meiryo",
  "microsoft jhenghei",
  "microsoft yahei",
  "ms gothic",
  "ms gothic & ms ui gothic & ms pgothic",
  "ms mincho",
  "ms mincho & ms pmincho",
  "simsun",
  "simsun-extg",
  "yu gothic",
  "bahnschrift",
  "gabriola",
  "ink free",
  "sitka",
  "sylfaen",
  "aldhabi",
  "andalus",
  "arabic typesetting",
  "simplified arabic",
  "traditional arabic",
  "sakkal majalla",
  "urdu typesetting",
  "holomdl2 assets",
  "segoe mdl2 assets",
  "segoe fluent icons",
  "segoe ui emoji",
  "segoe ui historic",
  "segoe ui symbol",
  "microsoft sans serif",
  "sansserifcollection",
  "sans serif collection",
  "cascadia code",
  "cascadia mono",
  "leelauib",
  "courier 10,12,15",
  "courier 10,12,15 (120)",
  "ms serif 8,10,12,14,18,24",
  "ms serif 8,10,12,14,18,24 (120)",
  "ms sans serif 8,10,12,14,18,24",
  "small fonts",
  "terminal",
  "fixedsys",
  "modern",
  "roman",
  "script",
  "mv boli",
  "myanmar text",
  "mongolian baiti",
  "microsoft himalaya",
  "microsoft new tai lue",
  "microsoft phagspa",
  "microsoft tai le",
  "microsoft yi baiti",
  "microsoft uighur",
  "dengxian",
  "simhei",
  "kaiti",
  "fangsong",
]);

const ESSENTIAL_CREATIVE_FONT_FAMILIES = new Set([
  // Latin / Global
  "roboto",
  "open sans",
  "montserrat",
  "lato",
  "poppins",
  "inter",
  "oswald",
  "raleway",
  "playfair display",
  "bebas neue",
  "nunito",
  "ubuntu",
  "merriweather",
  "pt sans",
  "pt serif",
  "lora",
  "rubik",
  "work sans",
  "fira sans",
  "fira code",
  "barlow",
  "quicksand",
  "source sans pro",
  "source serif pro",
  "source code pro",
  "mulish",
  "inconsolata",
  "cinzel",
  "anton",
  "comfortaa",
  "lobster",
  "pacifico",
  "dancing script",
  "caveat",
  "abril fatface",
  "zilla slab",
  "helvetica",
  "futura",
  "din",
  "proxima nova",
  "gotham",
  "bodoni",
  "didot",
  "baskerville",
  "avenir",
  "univers",
  "optima",
  "gill sans",
  "clarendon",
  "rockwell",
  "frutiger",
  "akzidenz-grotesk",
  "eurostile",
  "trajan",
  "copperplate",
  "caslon",
  "avant garde",
  "myriad pro",
  "minion pro",
  "aller",
  "exo",
  "titillium web",
  "cabin",
  "karla",
  "dm sans",
  "dm serif display",
  "space grotesk",
  "syne",
  "clash display",
  "general sans",
  "satoshi",
  "cabinet grotesk",
  "plus jakarta sans",
  "manrope",
  "outfit",
  "lexend",
  // Arabic Essentials
  "cairo",
  "tajawal",
  "almarai",
  "el messiri",
  "amiri",
  "changa",
  "alexandria",
  "readex pro",
  "ibm plex sans arabic",
  "noto sans arabic",
  "noto kufi arabic",
  "noto naskh arabic",
  "lateef",
  "reem kufi",
  "mada",
  "katibeh",
  "lalezar",
  "harmattan",
  "aref ruqaa",
  "mirza",
  "scheherazade",
  "kufam",
  "alhurra",
  "ge ss",
  "din next lt arabic",
  "sakkal",
  "hacen",
  "sultan",
  "aljazeera",
  "alarabiya",
  "al-arabiya",
  "droid arabic kufi",
  "droid arabic naskh",
  "dubai",
  "boutros",
  "kacst",
  "neo sans arabic",
  "frutiger arabic",
  "helvetica arabic",
  "bukra",
  "thuluth",
  "waseem",
  "nadine",
]);

export default function WindowsFontsView({
  onRefreshStats,
  t = {},
  isRtl = false,
}: any) {
  const [fonts, setFonts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all"); // 'all' | 'core' | 'creative' | 'user'
  const [previewText, setPreviewText] = useState(
    isRtl
      ? "أبجد هوز حطي كلمن سعفص قرشت ثخذ ضظغ"
      : "The quick brown fox jumps over the lazy dog 12345",
  );
  const [fontSize, setFontSize] = useState(24);
  const [isRestoring, setIsRestoring] = useState(false);
  const [uninstallingId, setUninstallingId] = useState<any>(null);
  const [feedback, setFeedback] = useState<any>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showBackupsModal, setShowBackupsModal] = useState(false);
  const [backups, setBackups] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminStatusLoaded, setAdminStatusLoaded] = useState<boolean>(false);
  const [isElevating, setIsElevating] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 36;

  const isCreativeFont = (font: any) => {
    const fam = (font.family || font.name || "").toLowerCase().trim();
    for (const prefix of ESSENTIAL_CREATIVE_FONT_FAMILIES) {
      if (fam.includes(prefix)) return true;
    }
    return false;
  };

  const fetchInstalledFonts = async () => {
    setLoading(true);
    try {
      const data = await safeFetchJson<any>("/api/system/windows-fonts", {
        timeoutMs: 7000,
      });
      if (Array.isArray(data)) {
        const enriched = data.map((f: any) => {
          const famLower = (f.family || f.name || "").toLowerCase().trim();
          const isCore = Boolean(
            f.isSystemCore || CORE_WINDOWS_FONT_FAMILIES.has(famLower),
          );
          const isCreative = !isCore && isCreativeFont(f);
          return {
            ...f,
            isSystemCore: isCore,
            isCreative,
            isUninstallable: !isCore,
            format: f.format || (f.path?.endsWith(".otf") ? "OTF" : "TTF"),
          };
        });
        setFonts(enriched);
        setLoading(false);
        return;
      }

      // Fallback
      const fallbackData = await safeFetchJson<any>("/api/fonts?limit=250", {
        timeoutMs: 6000,
      });
      if (fallbackData) {
        const list = Array.isArray(fallbackData)
          ? fallbackData
          : fallbackData.fonts || [];
        const mapped = list.map((f: any) => {
          const famLower = (f.family || f.name || "").toLowerCase().trim();
          const isCore = Boolean(
            f.isSystemCore || CORE_WINDOWS_FONT_FAMILIES.has(famLower),
          );
          const isCreative = !isCore && isCreativeFont(f);
          return {
            ...f,
            isSystemCore: isCore,
            isCreative,
            isUninstallable: !isCore,
            format: f.format || (f.path?.endsWith(".otf") ? "OTF" : "TTF"),
          };
        });
        setFonts(mapped);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchBackups = async () => {
    try {
      const data = await safeFetchJson<any>(
        "/api/system/windows-fonts/backups",
        { timeoutMs: 5000 },
      );
      if (Array.isArray(data)) {
        setBackups(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAdminStatus = async () => {
    try {
      const data = await safeFetchJson<any>("/api/system/admin-status", {
        timeoutMs: 4000,
      });
      if (data && typeof data.isAdmin === "boolean") {
        setIsAdmin(data.isAdmin);
      }
    } catch {
      // Keep safe least-privilege default (false)
    } finally {
      setAdminStatusLoaded(true);
    }
  };

  useEffect(() => {
    fetchAdminStatus();
    fetchInstalledFonts();
    fetchBackups();
  }, []);

  const handleRestoreWithProfile = async (
    profile: "pure_windows" | "essential_creative",
  ) => {
    setIsRestoring(true);
    setFeedback(null);
    setShowRestoreModal(false);

    const opId = `win-restore-${Date.now()}`;
    upsertLiveOperation({
      id: opId,
      title: `Restoring Windows Fonts (${profile})`,
      titleAr: `استعادة وتنظيف خطوط نظام ويندوز (${profile === "pure_windows" ? "ضبط المصنع" : "خطوط التصميم الأساسية"})`,
      category: "windows-restore",
      status: "running",
      progressPercent: 40,
      stepLabel: "Backing up third-party fonts & cleaning registry...",
      stepLabelAr: "جاري حفظ نسخة احتياطية وتنظيف مجلد خطوط النظام...",
    });

    try {
      const res = await safeFetch("/api/system/windows-fonts/restore-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
        timeoutMs: 600000,
      });

      const data = res ? await res.json().catch(() => ({})) : {};
      if (typeof data.isAdmin === "boolean") {
        setIsAdmin(data.isAdmin);
      }

      if (data.cancelled) {
        upsertLiveOperation({
          id: opId,
          status: "completed",
          progressPercent: 100,
          stepLabel: "UAC cancelled by user",
          stepLabelAr: "تم إلغاء طلب صلاحيات المسؤول (UAC)",
        });
        setFeedback({
          type: "warning",
          text: isRtl
            ? "تم إلغاء طلب صلاحيات المسؤول (UAC) من قِبل المستخدم. لم يتم إجراء أي تعديل على خطوط النظام."
            : "Administrator elevation (UAC) was cancelled. No system font changes were made.",
        });
        return;
      }

      if (res && res.ok && data.success !== false) {
        upsertLiveOperation({
          id: opId,
          status: "completed",
          progressPercent: 100,
          stepLabel: "Windows font restoration completed!",
          stepLabelAr: "اكتملت عملية استعادة وتنظيف خطوط ويندوز بنجاح!",
        });
        const elevatedSuffix = data.elevated
          ? isRtl
            ? " (تمت الترقية المؤقتة عبر UAC بنجاح)"
            : " (completed via on-demand UAC elevation)"
          : "";
        const feedbackType =
          (data.removedCount ?? 0) === 0 && (data.skippedCount ?? 0) > 0
            ? "warning"
            : "success";
        setFeedback({
          type: feedbackType,
          text:
            (data.message ||
              (isRtl
                ? "تم تنفيذ استعادة الخطوط بنجاح."
                : "Fonts restoration completed successfully.")) +
            elevatedSuffix,
        });
        fetchInstalledFonts();
        fetchBackups();
        fetchAdminStatus();
        if (onRefreshStats) onRefreshStats();
      } else {
        throw new Error(
          data.error ||
            (isRtl
              ? "فشل تنفيذ استعادة الخطوط"
              : "Failed to execute restoration"),
        );
      }
    } catch (e: any) {
      upsertLiveOperation({
        id: opId,
        status: "failed",
        progressPercent: 0,
        error: e?.message || "Restore failed",
      });
      setFeedback({
        type: "error",
        text:
          e?.message ||
          (isRtl
            ? "فشل تنفيذ استعادة الخطوط"
            : "Failed to execute restoration"),
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleOpenBackupFolder = async (folderPath: string) => {
    try {
      await fetch("/api/system/windows-fonts/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: folderPath }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleUndoBackup = async (backupId: string) => {
    setFeedback(null);
    try {
      const res = await fetch("/api/system/windows-fonts/undo-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.cancelled) {
        setFeedback({
          type: "warning",
          text: isRtl
            ? "تم إلغاء طلب صلاحيات المسؤول (UAC). لم يتم استرجاع النسخة الاحتياطية."
            : "Administrator elevation (UAC) was cancelled. Backup rollback was not performed.",
        });
        return;
      }
      if (res.ok && data.success) {
        const restored = data.restoredCount ?? 0;
        const elevatedSuffix = data.elevated
          ? isRtl
            ? " عبر صلاحيات المسؤول (UAC)"
            : " via on-demand UAC elevation"
          : "";
        setFeedback({
          type: "success",
          text: isRtl
            ? `تم استرجاع ${restored} خطاً من النسخة الاحتياطية بنجاح${elevatedSuffix}!`
            : `Successfully restored ${restored} fonts from backup${elevatedSuffix}!`,
        });
        fetchInstalledFonts();
        fetchBackups();
        if (onRefreshStats) onRefreshStats();
      } else {
        throw new Error(
          data.error ||
            (isRtl
              ? "فشل استرجاع النسخة الاحتياطية"
              : "Failed to restore backup"),
        );
      }
    } catch (e: any) {
      setFeedback({
        type: "error",
        text:
          e?.message ||
          (isRtl
            ? "فشل استرجاع النسخة الاحتياطية"
            : "Failed to restore backup"),
      });
    }
  };

  const handleRelaunchAdmin = async () => {
    setIsElevating(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/system/relaunch-admin", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.cancelled) {
        setFeedback({
          type: "warning",
          text: isRtl
            ? "تم إلغاء طلب الترقية إلى صلاحيات المسؤول (UAC). يمكنك الاستمرار بالوضع القياسي وستُطلب الصلاحيات تلقائياً عند الحاجة."
            : "UAC elevation was cancelled. You can continue in standard mode — elevation will be requested automatically only when modifying system fonts.",
        });
      } else if (res.ok && data.success) {
        setFeedback({
          type: "success",
          text: isRtl
            ? "جاري إعادة تشغيل Fontivo بصلاحيات المسؤول..."
            : "Relaunching Fontivo with Administrator privileges...",
        });
      } else {
        throw new Error(
          data.error ||
            (isRtl
              ? "تعذر طلب صلاحيات المسؤول"
              : "Failed to request Administrator privileges"),
        );
      }
    } catch (e: any) {
      setFeedback({
        type: "error",
        text:
          e?.message ||
          (isRtl
            ? "تعذر طلب صلاحيات المسؤول"
            : "Failed to request Administrator privileges"),
      });
    } finally {
      setIsElevating(false);
    }
  };

  const handleUninstallUserFont = async (font: any) => {
    if (font.isSystemCore) return;
    setUninstallingId(font.id);
    setFeedback(null);
    try {
      const res = await fetch("/api/system/windows-fonts/uninstall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: font.name, path: font.path }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.cancelled) {
        setFeedback({
          type: "warning",
          text: isRtl
            ? "تم إلغاء طلب صلاحيات المسؤول (UAC). لم يتم حذف الخط من النظام."
            : "Administrator elevation (UAC) was cancelled. Font was not uninstalled.",
        });
        return;
      }
      if (res.ok && data.success) {
        const elevatedSuffix = data.elevated
          ? isRtl
            ? " (عبر UAC)"
            : " (via UAC elevation)"
          : "";
        const customMessage =
          typeof data.message === "string" &&
          (data.message.includes("جدولة") || data.message.includes("scheduled"))
            ? data.message
            : null;
        setFeedback({
          type: customMessage ? "warning" : "success",
          text:
            (customMessage ||
              (isRtl
                ? `تم إلغاء تثبيت الخط "${font.name || font.family}" من نظام ويندوز بنجاح`
                : `Successfully uninstalled "${font.name || font.family}" from Windows`)) +
            elevatedSuffix,
        });
        setFonts((prev) => prev.filter((f) => f.id !== font.id));
        if (onRefreshStats) onRefreshStats();
      } else {
        throw new Error(
          data.error ||
            (isRtl ? "فشل إلغاء تثبيت الخط" : "Failed to uninstall font"),
        );
      }
    } catch (e: any) {
      setFeedback({
        type: "error",
        text:
          e?.message ||
          (isRtl ? "فشل إلغاء تثبيت الخط" : "Failed to uninstall font"),
      });
    } finally {
      setUninstallingId(null);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter]);

  // Filtered fonts computation
  const filteredFonts = fonts.filter((f) => {
    const famLower = (f.family || f.name || "").toLowerCase();
    const matchesSearch =
      !searchQuery ||
      famLower.includes(searchQuery.toLowerCase()) ||
      (f.path || "").toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (categoryFilter === "core") return f.isSystemCore;
    if (categoryFilter === "creative") return f.isCreative;
    if (categoryFilter === "user") return !f.isSystemCore && !f.isCreative;
    return true;
  });

  const coreCount = fonts.filter((f) => f.isSystemCore).length;
  const creativeCount = fonts.filter((f) => f.isCreative).length;
  const userCount = fonts.filter(
    (f) => !f.isSystemCore && !f.isCreative,
  ).length;

  const totalFonts = filteredFonts.length;
  const totalPages = Math.max(1, Math.ceil(totalFonts / PAGE_SIZE));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validCurrentPage - 1) * PAGE_SIZE;
  const paginatedFonts = filteredFonts.slice(
    startIndex,
    startIndex + PAGE_SIZE,
  );
  const startItem = totalFonts === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(startIndex + PAGE_SIZE, totalFonts);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none">
      {/* 1. Header & Management Actions */}
      <div className="p-4 sm:p-6 border-b border-[var(--color-border)] bg-[var(--color-back-header)]/50 shrink-0 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
              <HardDrive className="w-5 h-5 text-[var(--color-action)] shrink-0" />
              <h1 className="text-lg sm:text-xl font-black text-[var(--color-text-header)] tracking-tight truncate">
                {isRtl
                  ? "مدير واستعادة خطوط نظام ويندوز"
                  : "Windows System Fonts Manager"}
              </h1>

              {/* Administrator Status Shield Badge */}
              {isAdmin ? (
                <span
                  className="flex items-center gap-1 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold whitespace-nowrap shrink-0"
                  title={
                    isRtl
                      ? "البرنامج يعمل بكامل صلاحيات المسؤول لإدارة ملفات ريجستري وويندوز"
                      : "Fontivo is running with Administrator Privileges"
                  }
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Admin Mode</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleRelaunchAdmin}
                  disabled={isElevating}
                  className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-semibold transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                  title={
                    isRtl
                      ? "الوضع القياسي الآمن (تُطلب صلاحيات UAC تلقائياً عند التعديل، أو اضغط هنا لإعادة التشغيل كمسؤول)"
                      : "Standard Mode (UAC is requested automatically on-demand when modifying system fonts, or click to relaunch as Admin)"
                  }
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>
                    {isElevating
                      ? isRtl
                        ? "جاري طلب UAC..."
                        : "Requesting UAC..."
                      : adminStatusLoaded
                        ? isRtl
                          ? "الوضع القياسي · UAC"
                          : "Standard Mode · UAC"
                        : isRtl
                          ? "صلاحيات UAC"
                          : "UAC On-Demand"}
                  </span>
                </button>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {isRtl
                ? "فحص وتمييز خطوط النظام الأصلية، حزمة خطوط التصميم الأساسية، وإدارة استعادة ضبط المصنع مع نسخ احتياطي آمن."
                : "Inspect and manage all fonts installed in Windows. Choose to restore factory defaults or keep essential design fonts."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Backups Button */}
            {backups.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBackupsModal(true)}
                className="h-9 px-3 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                title={
                  isRtl
                    ? "عرض النسخ الاحتياطية السابقة وإمكانية التراجع والاسترجاع"
                    : "View past backups & rollback"
                }
              >
                <History className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>
                  {isRtl
                    ? `النسخ الاحتياطية (${backups.length})`
                    : `Backups (${backups.length})`}
                </span>
              </button>
            )}

            {/* Restore Options Button */}
            <button
              onClick={() => setShowRestoreModal(true)}
              disabled={isRestoring}
              className="h-9 px-4 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-semibold shadow-xs flex items-center gap-2 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              title={
                isRtl
                  ? "خيارات استعادة وضبط خطوط ويندوز الأصلية أو خطوط التصميم الأساسية"
                  : "Restoration & cleanup management options"
              }
            >
              <RotateCcw
                className={`w-4 h-4 shrink-0 ${isRestoring ? "animate-spin" : ""}`}
              />
              <span>
                {isRestoring
                  ? isRtl
                    ? "جاري الاستعادة..."
                    : "Restoring..."
                  : isRtl
                    ? "استعادة وإدارة الخطوط"
                    : "Restore & Clean Options"}
              </span>
            </button>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between animate-in fade-in ${
              feedback.type === "error"
                ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                : feedback.type === "warning"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === "error" || feedback.type === "warning" ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-[11px] underline opacity-70 hover:opacity-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Filter Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
          {/* Category Tabs: All, Core, Essential Creative, User */}
          <div className="flex items-center gap-1.5 p-1 bg-[var(--color-control)] rounded-xl border border-[var(--color-border)] text-xs flex-wrap">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`h-8 px-3 rounded-lg font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                categoryFilter === "all"
                  ? "bg-[var(--color-action)] text-white shadow-2xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
            >
              {isRtl ? "كافة الخطوط" : "All Installed"} ({fonts.length})
            </button>
            <button
              onClick={() => setCategoryFilter("core")}
              className={`h-8 px-3 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                categoryFilter === "core"
                  ? "bg-[var(--color-action)] text-white shadow-2xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                {isRtl ? "خطوط ويندوز الأصلية" : "Windows Core"} ({coreCount})
              </span>
            </button>
            <button
              onClick={() => setCategoryFilter("creative")}
              className={`h-8 px-3 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                categoryFilter === "creative"
                  ? "bg-[var(--color-action)] text-white shadow-2xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                {isRtl ? "خطوط التصميم الأساسية" : "Essential Design"} (
                {creativeCount})
              </span>
            </button>
            <button
              onClick={() => setCategoryFilter("user")}
              className={`h-8 px-3 rounded-lg font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                categoryFilter === "user"
                  ? "bg-[var(--color-action)] text-white shadow-2xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
            >
              {isRtl ? "خطوط خارجية أخرى" : "Other User Fonts"} ({userCount})
            </button>
          </div>

          {/* Search Box & Font Size Slider */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search
                className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 ${isRtl ? "right-3" : "left-3"} text-[var(--color-text-dim)] pointer-events-none`}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e: any) => setSearchQuery(e.target.value)}
                placeholder={
                  isRtl ? "بحث في خطوط ويندوز..." : "Search Windows fonts..."
                }
                className={`w-full bg-[var(--color-back-card)] text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-dim)] ${isRtl ? "pr-8 pl-3" : "pl-8 pr-3"} py-1.5 rounded-xl border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-action)] transition`}
              />
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-text-muted)]">
              <span>{fontSize}px</span>
              <input
                type="range"
                min="16"
                max="48"
                value={fontSize}
                onChange={(e: any) => setFontSize(Number(e.target.value))}
                className="w-20 accent-[var(--color-action)] cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Fonts List */}
      <main className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]">
            <RefreshCw className="w-5 h-5 animate-spin text-[var(--color-action)]" />
            <span>
              {isRtl
                ? "جاري فحص خطوط نظام ويندوز..."
                : "Enumerating Windows system fonts..."}
            </span>
          </div>
        ) : filteredFonts.length === 0 ? (
          <div className="text-center py-16 text-xs text-[var(--color-text-dim)] border border-dashed border-[var(--color-border)] rounded-2xl max-w-xl mx-auto">
            {isRtl
              ? "لم يتم العثور على خطوط تطابق شروط البحث."
              : "No Windows fonts found matching the current search criteria."}
          </div>
        ) : (
          <div className="space-y-4 max-w-7xl mx-auto">
            <div className="space-y-3">
              {paginatedFonts.map((font, idx) => {
                const isCore = font.isSystemCore;
                const isCreative = font.isCreative;
                const isDeleting = uninstallingId === font.id;
                const fontKey =
                  font.id ||
                  font.name ||
                  font.path ||
                  `win-font-${startIndex + idx}`;

                return (
                  <div
                    key={fontKey}
                    className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] hover:border-[var(--color-action)]/60 transition shadow-2xs space-y-3"
                  >
                    {/* Top Metadata Row */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[var(--color-border-subtle)] min-w-0">
                      <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-[var(--color-text-header)] truncate">
                          {font.family || font.name}
                        </h3>

                        {isCore ? (
                          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold whitespace-nowrap shrink-0">
                            <ShieldCheck className="w-3 h-3 shrink-0" />
                            <span>Core Protected</span>
                          </span>
                        ) : isCreative ? (
                          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold whitespace-nowrap shrink-0">
                            <Layers className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>Essential Studio</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--color-control)] text-[var(--color-text-muted)] border border-[var(--color-border)] whitespace-nowrap shrink-0">
                            User Installed
                          </span>
                        )}

                        <span className="text-[10px] font-mono text-[var(--color-text-dim)] whitespace-nowrap shrink-0">
                          {font.format || "TTF"}
                        </span>
                      </div>

                      {/* Actions: Protected vs Uninstall */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isCore ? (
                          <span
                            className="text-[11px] text-[var(--color-text-dim)] font-mono flex items-center gap-1 whitespace-nowrap shrink-0"
                            title="Core Windows operating system font. Protected from deletion."
                          >
                            <span>Protected OS Asset</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleUninstallUserFont(font)}
                            disabled={isDeleting}
                            className="h-8 px-2.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500 border border-rose-500/20 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap shrink-0"
                            title={
                              isRtl
                                ? "إلغاء تثبيت هذا الخط وحذفه من نظام ويندوز"
                                : "Uninstall font permanently from Windows"
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {isDeleting
                                ? isRtl
                                  ? "جاري الحذف..."
                                  : "Uninstalling..."
                                : isRtl
                                  ? "إلغاء التثبيت"
                                  : "Uninstall"}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Font Specimen Preview String */}
                    <div
                      className="text-[var(--color-text-header)] py-1 truncate"
                      style={{
                        fontFamily: `"${font.family || font.name}", sans-serif`,
                        fontSize: `${fontSize}px`,
                        lineHeight: 1.3,
                      }}
                      dir="auto"
                    >
                      {previewText}
                    </div>

                    {/* Bottom File Path Info */}
                    {font.path && (
                      <div className="text-[10px] font-mono text-[var(--color-text-dim)] truncate pt-1 flex items-center gap-2">
                        <span className="opacity-60">Path:</span>
                        <span className="truncate">{font.path}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls Bar */}
            {totalFonts > 0 && (
              <div
                className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] select-none shadow-2xs mt-4"
                dir={isRtl ? "rtl" : "ltr"}
              >
                <div className="text-xs text-[var(--color-text-muted)] font-mono">
                  {isRtl
                    ? `عرض ${startItem} - ${endItem} من أصل ${totalFonts} خط مثبت`
                    : `Showing ${startItem} - ${endItem} of ${totalFonts} installed fonts`}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {validCurrentPage < totalPages && (
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                      }
                      className="h-8 px-3.5 rounded-xl bg-[var(--color-action)]/15 hover:bg-[var(--color-action)] text-[var(--color-action)] hover:text-white border border-[var(--color-action)]/30 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {isRtl ? "الصفحة التالية" : "Load Next Page"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={validCurrentPage === 1}
                    className="p-1.5 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    title={isRtl ? "الصفحة السابقة" : "Previous page"}
                  >
                    {isRtl ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <ChevronLeft className="w-4 h-4" />
                    )}
                  </button>

                  <span className="text-xs font-mono text-[var(--color-text-header)] px-2">
                    {validCurrentPage} / {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
                    disabled={validCurrentPage === totalPages}
                    className="p-1.5 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    title={isRtl ? "الصفحة التالية" : "Next page"}
                  >
                    {isRtl ? (
                      <ChevronLeft className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Professional Management Modal: 2 Restoration Profiles + Keep Current */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[var(--color-action)]/15 border border-[var(--color-action)]/30 flex items-center justify-center text-[var(--color-action)] shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--color-text-header)]">
                    {isRtl
                      ? "إدارة واستعادة خطوط نظام ويندوز"
                      : "Windows Font Management & Reset"}
                  </h3>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {isRtl
                      ? "اختر مستوى التنظيف المناسب لجهازك وطبيعة عملك"
                      : "Choose the restoration profile that fits your workflow"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowRestoreModal(false)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Profile Options Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 1: Pure Windows Defaults */}
              <div className="p-5 rounded-2xl bg-[var(--color-control)]/40 border border-[var(--color-border)] hover:border-[#B7A1D9]/60 transition space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-[#B7A1D9]" />
                      <h4 className="text-xs font-bold text-[var(--color-text-header)]">
                        {isRtl
                          ? "خطوط ويندوز الأصلية فقط"
                          : "Factory Windows Core Only"}
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#B7A1D9]/15 text-[#B7A1D9] border border-[#B7A1D9]/30">
                      {isRtl ? "افتراضي" : "Clean Slate"}
                    </span>
                  </div>

                  <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                    {isRtl
                      ? "استعادة خطوط ويندوز الرسمية فقط مع نقل الخطوط الإضافية بأمان إلى مجلد النسخ الاحتياطي."
                      : "Restores standard Windows OS core fonts only and backs up extra fonts safely."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleRestoreWithProfile("pure_windows")}
                  disabled={isRestoring}
                  className="w-full py-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[#B7A1D9] text-[var(--color-text-header)] hover:text-[#130C16] border border-[var(--color-border)] text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {isRtl ? "استعادة خطوط ويندوز فقط" : "Restore Windows Only"}
                  </span>
                </button>
              </div>

              {/* Option 2: Essential Design + Windows Defaults (Recommended) */}
              <div className="p-5 rounded-2xl bg-[var(--color-action)]/5 border border-[var(--color-action)]/45 hover:border-[var(--color-action)] transition space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-[var(--color-action)]" />
                      <h4 className="text-xs font-bold text-[var(--color-text-header)]">
                        {isRtl
                          ? "حزمة المصممين الأساسية"
                          : "Windows + Essential Studio"}
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--color-action)] text-[#130C16] font-semibold">
                      {isRtl ? "موصى به" : "Recommended"}
                    </span>
                  </div>

                  <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                    {isRtl
                      ? "يحتفظ بخطوط ويندوز مع أشهر الخطوط الأساسية لبرامج التصميم مثل Cairo وTajawal وInter وRoboto."
                      : "Retains Windows fonts plus essential studio typefaces for Adobe and Figma."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleRestoreWithProfile("essential_creative")}
                  disabled={isRestoring}
                  className="w-full py-2.5 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-[#130C16] text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>
                    {isRtl
                      ? "استعادة مع خطوط التصميم"
                      : "Restore + Keep Studio Fonts"}
                  </span>
                </button>
              </div>
            </div>

            {/* Note & Cancel / Keep Current */}
            <div className="p-3.5 rounded-xl bg-[var(--color-control)]/30 border border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)] flex items-start gap-2.5">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>
                {isRtl
                  ? "يتم أخذ نسخة احتياطية كاملة لكافة الخطوط المحذوفة في مجلد Fontivo، ويمكنك استرجاعها بضغطة زر في أي وقت."
                  : "A full backup of all uninstalled font files is automatically saved, and you can undo / restore at any time."}
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRestoreModal(false)}
                className="px-5 py-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-xs font-semibold text-[var(--color-text-header)] transition cursor-pointer"
              >
                {isRtl ? "إبقاء الوضع الحالي" : "Keep Current (Cancel)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backups History Modal */}
      {showBackupsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div
            className="w-full max-w-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 max-h-[85vh] flex flex-col overflow-hidden"
            dir={isRtl ? "rtl" : "ltr"}
          >
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--color-border)] min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <History className="w-5 h-5 text-[var(--color-action)] shrink-0" />
                <h3 className="text-sm sm:text-base font-bold text-[var(--color-text-header)] truncate">
                  {isRtl
                    ? "سجل النسخ الاحتياطية لخطوط ويندوز"
                    : "Windows Fonts Backup History"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBackupsModal(false)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] p-1.5 rounded-lg hover:bg-[var(--color-control)] transition cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pe-1 min-w-0">
              {backups.map((b) => (
                <div
                  key={b.id}
                  className="p-3.5 sm:p-4 rounded-2xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span
                        className="text-xs font-bold font-mono text-[var(--color-text-header)] break-all"
                        dir="ltr"
                      >
                        {b.id}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--color-action)]/12 text-[var(--color-action)] border border-[var(--color-action)]/30 whitespace-nowrap shrink-0">
                        {b.profile === "essential_creative"
                          ? isRtl
                            ? "حزمة التصميم"
                            : "Studio Pack"
                          : isRtl
                            ? "ضبط المصنع"
                            : "Pure Defaults"}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)] font-mono">
                      {isRtl
                        ? `تم حفظ ${b.totalFonts} خطاً`
                        : `${b.totalFonts} fonts backed up`}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleOpenBackupFolder(b.path)}
                      className="h-8 px-3 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-xs text-[var(--color-text-header)] flex items-center gap-1.5 border border-[var(--color-border)] transition cursor-pointer whitespace-nowrap shrink-0"
                      title={
                        isRtl
                          ? "فتح مجلد النسخة في File Explorer"
                          : "Open in File Explorer"
                      }
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-[#B7A1D9] shrink-0" />
                      <span>{isRtl ? "فتح المجلد" : "Open"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUndoBackup(b.id)}
                      className="h-8 px-3 rounded-lg bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-xs text-[#130C16] flex items-center gap-1.5 transition cursor-pointer font-bold shadow-2xs whitespace-nowrap shrink-0"
                      title={
                        isRtl
                          ? "استرجاع كافة الخطوط من هذه النسخة وتثبيتها مرة أخرى"
                          : "Undo and restore all fonts"
                      }
                    >
                      <Undo2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{isRtl ? "استرجاع" : "Restore"}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-[var(--color-border)] flex justify-end">
              <button
                type="button"
                onClick={() => setShowBackupsModal(false)}
                className="px-4 py-2 rounded-xl bg-[var(--color-control)] text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] transition cursor-pointer"
              >
                {isRtl ? "إغلاق" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
