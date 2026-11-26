import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Sidebar,
  Toolbar,
  BottomSampleBar,
  HeaderBar,
  SplashScreen,
} from "./components/layout";
import { FamilyCard, FontCard } from "./components/cards";
import {
  FamilyInspectorView,
  SpecimenView,
  GlyphsView,
  PlaygroundView,
  DiscoverView,
  LicensesView,
  AdobeBridgeView,
  SettingsView,
  GoogleFontsView,
  UiTypographyLabView,
  SystemHealthView,
  WorkspacesView,
  WindowsFontsView,
  RamInspectorView,
  ColorStudioView,
  CloudPacksView,
} from "./components/views";
import { ModalContainer } from "./components/modals";
import {
  ErrorBoundary,
  OperationsCenter,
  ConfirmDialog,
} from "./components/common";
import { useSystemStatus } from "./hooks/useSystemStatus";
import {
  useFontLibrary,
  DEFAULT_VIEW_MODE,
  isFamilyViewMode,
} from "./hooks/useFontLibrary";
import { useFontActivation } from "./hooks/useFontActivation";
import {
  normalizePendingActivations,
  PendingAdobeDocument,
  AdobeDocumentFont,
} from "./components/views/AdobeBridgeView";
import { safeFetchJson } from "./utils/safeFetch";
import {
  extractSupportedDesignFiles,
  inspectDroppedDesignFile,
} from "./utils/designDrop";
import { upsertLiveOperation } from "./utils/operationsBus";
import { SUPPORTED_LANGUAGES, translations } from "./i18n/locales";
import {
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  Bookmark,
  Zap,
  FolderOpen,
  Layers,
  Globe,
  FilePlus2,
  Package,
  Radio,
  RefreshCw,
  Monitor,
  ChevronDown,
  ChevronUp,
  Download,
  Sparkles,
  FolderPlus,
  Trash2,
  HardDrive,
} from "lucide-react";

export interface AppProps {
  initialTab?: string;
  initialShowSplash?: boolean;
}

export default function App({
  initialTab = "library",
  initialShowSplash = true,
}: AppProps) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [sidebarMode, setSidebarMode] = useState<"main" | "settings">("main");
  const [inspectedFamily, setInspectedFamily] = useState<any>(null);
  const [showSplash, setShowSplash] = useState(initialShowSplash);
  const [isOperationsCenterOpen, setIsOperationsCenterOpen] = useState(false);
  const [pendingDeleteFont, setPendingDeleteFont] = useState<any>(null);
  const customFontsInputRef = useRef<HTMLInputElement | null>(null);

  // Responsive Sidebar state (Auto-adapts on 1366x768 or smaller laptop screens)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 1100;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarCollapsed(true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Theme Management
  const [theme, setTheme] = useState(
    () => localStorage.getItem("fs_theme") || "dark",
  );
  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("fs_theme", nextTheme);
  };

  useEffect(() => {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
    document.body.classList.remove("dark", "light");
    document.body.classList.add(theme);
  }, [theme]);

  // Multilingual / i18n
  const [currentLanguage, setCurrentLanguage] = useState(
    () => localStorage.getItem("fs_lang") || "ar",
  );
  const [isRtl, setIsRtl] = useState(true);
  const t = translations[currentLanguage] || translations.ar;

  const handleSetLanguage = (langCode: string) => {
    setCurrentLanguage(langCode);
    localStorage.setItem("fs_lang", langCode);
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
    const dir = langObj?.dir || "rtl";
    document.documentElement.dir = dir;
    document.documentElement.lang = langCode;
    setIsRtl(dir === "rtl");
    if (langCode === "ar" && previewText.includes("The quick brown fox")) {
      setPreviewText("صِف خَلقَ خَودٍ كَمِثلِ الشَمسِ إِذ بَزَغَت");
    } else if (langCode === "en" && previewText.includes("صِف خَلقَ")) {
      setPreviewText("The quick brown fox jumps over the lazy dog.");
    }
  };

  useEffect(() => {
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === currentLanguage);
    const dir = langObj?.dir || "rtl";
    document.documentElement.dir = dir;
    document.documentElement.lang = currentLanguage;
    setIsRtl(dir === "rtl");
  }, [currentLanguage]);

  // Preview & Canvas State
  const [previewText, setPreviewText] = useState(
    "صِف خَلقَ خَودٍ كَمِثلِ الشَمسِ إِذ بَزَغَت",
  );
  const [fontSize, setFontSize] = useState(38);
  const [lineHeight] = useState(1.4);
  const [letterSpacing] = useState(0);
  const [textAlign, setTextAlign] = useState<
    "left" | "center" | "right" | "justify"
  >("right");
  const [hasTashkeel, setHasTashkeel] = useState(true);
  const [hasLigatures, setHasLigatures] = useState(true);
  const [viewMode, setViewMode] = useState<string>(DEFAULT_VIEW_MODE);
  const isFamilyMode = isFamilyViewMode(viewMode);
  const [isLightCanvas, setIsLightCanvas] = useState(false);
  const [textColor, setTextColor] = useState("");

  // Live Adobe Active Document Auto-Activation Banner State (Multi-Document)
  const [pendingAdobeDocs, setPendingAdobeDocs] = useState<
    PendingAdobeDocument[]
  >([]);
  const [dismissedAdobeIds, setDismissedAdobeIds] = useState<string[]>([]);
  const [expandedAdobeBannerIds, setExpandedAdobeBannerIds] = useState<
    Record<string, boolean>
  >({});
  const [adobeBannerSearch, setAdobeBannerSearch] = useState<
    Record<string, string>
  >({});
  const [activatingAdobeDocId, setActivatingAdobeDocId] = useState<
    string | null
  >(null);
  const [activatingAdobeFontKey, setActivatingAdobeFontKey] = useState<
    string | null
  >(null);
  const librarySearchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "f" || e.key === "F" || e.key === "k" || e.key === "K")
      ) {
        if (activeTab === "library" || activeTab === "organize") {
          e.preventDefault();
          librarySearchInputRef.current?.focus();
          librarySearchInputRef.current?.select();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [activeTab]);

  // Modals Visibility
  const [detailFont, setDetailFont] = useState<any>(null);
  const [compareFonts, setCompareFonts] = useState<any[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isBatchLibraryOpen, setIsBatchLibraryOpen] = useState(false);
  const [isFeaturesModalOpen, setIsFeaturesModalOpen] = useState(false);
  const [isSuperSearchOpen, setIsSuperSearchOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isAboutDevOpen, setIsAboutDevOpen] = useState(false);
  const [isUpdaterOpen, setIsUpdaterOpen] = useState(false);
  const [isRamCleanerOpen, setIsRamCleanerOpen] = useState(false);
  const [isWindowsResetOpen, setIsWindowsResetOpen] = useState(false);
  const [isGitHubPackOpen, setIsGitHubPackOpen] = useState(false);
  const [isColorPaletteOpen, setIsColorPaletteOpen] = useState(false);
  const [isUiLabOpen, setIsUiLabOpen] = useState(false);

  // Photoshop PSD Drag and Drop Notification Banner
  const [designOverlayNotice, setDesignOverlayNotice] = useState<any>(null);

  // Automated Background Self-Updater State
  const [updateBanner, setUpdateBanner] = useState<{
    status: string;
    currentVersion?: string;
    latestVersion?: string;
    hasUpdate?: boolean;
    releaseNotes?: string;
    downloadProgress?: number;
    installerPath?: string;
  } | null>(null);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [isUpdateBannerDismissed, setIsUpdateBannerDismissed] = useState(false);

  // System Status Hook
  const {
    ramMb,
    networkStatus,
    sendWindowEvent,
    handleHeaderMouseDown,
    handleHeaderDoubleClick,
  } = useSystemStatus();

  // Font Library Hook
  const {
    stats,
    fetchStats,
    fonts,
    setFonts,
    families,
    setFamilies,
    loading,
    collections,
    filter,
    setFilter,
    scriptFilter,
    setScriptFilter,
    sourceFilter,
    setSourceFilter,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    showSortMenu,
    setShowSortMenu,
    sortRef,
    fetchData,
    loadMoreTriggerRef,
    handlePickFolder,
    handleImportFontFiles,
    handleCreateCollection,
    handleAddFontToCollection,
    handleDeleteCollection,
  } = useFontLibrary({ activeTab, viewMode, inspectedFamily });

  // Font Activation Hook
  const {
    handleToggleActive,
    handleActivateFamily,
    handleDeactivateFamily,
    handleActivateFolder,
    handleDeactivateFolder,
    handleToggleFavorite,
    handleDeleteFont,
    handleDeactivateAll,
  } = useFontActivation({ setFonts, setFamilies, fetchStats });

  const [contextBatchBusy, setContextBatchBusy] = useState(false);

  const customFolders = useMemo(() => {
    const map = new Map<
      string,
      { path: string; name: string; total: number; active: number }
    >();
    for (const f of fonts || []) {
      const src = String(f.source || "").toLowerCase();
      const p = String(f.path || "");
      if (
        !p ||
        src === "system" ||
        src === "google" ||
        p.startsWith("cloud://") ||
        p.startsWith("http://") ||
        p.startsWith("https://")
      ) {
        continue;
      }
      const normPath = p.replace(/\//g, "\\");
      const lastSep = normPath.lastIndexOf("\\");
      if (lastSep <= 0) continue;
      const dirPath = normPath.slice(0, lastSep);
      const dirName = dirPath.slice(dirPath.lastIndexOf("\\") + 1) || dirPath;
      const existing = map.get(dirPath) || {
        path: dirPath,
        name: dirName,
        total: 0,
        active: 0,
      };
      existing.total += 1;
      if (f.isActive || f.active) {
        existing.active += 1;
      }
      map.set(dirPath, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [fonts]);

  const handleContextualBatch = async (
    action:
      | "activate-ids"
      | "deactivate-ids"
      | "activate-all-lib"
      | "install-all-lib"
      | "deactivate-all"
      | "activate-folder"
      | "deactivate-folder",
    folderPath?: string,
  ) => {
    if (contextBatchBusy) return;
    setContextBatchBusy(true);
    try {
      if (action === "activate-folder" && folderPath) {
        await handleActivateFolder(folderPath);
        await fetchData(true);
      } else if (action === "deactivate-folder" && folderPath) {
        await handleDeactivateFolder(folderPath);
        await fetchData(true);
      } else if (action === "deactivate-all") {
        await handleDeactivateAll();
        await fetchData(true);
      } else if (action === "activate-all-lib") {
        await fetch("/api/activate-all-library", { method: "POST" });
        await fetchStats();
        await fetchData(true);
      } else if (action === "install-all-lib") {
        await fetch("/api/install-all-library", { method: "POST" });
        await fetchStats();
        await fetchData(true);
      } else if (action === "activate-ids" || action === "deactivate-ids") {
        const eligibleIds = fonts
          .filter((f) => String(f.source || "").toLowerCase() !== "system")
          .map((f) => f.id);
        if (eligibleIds.length > 0) {
          const ep =
            action === "activate-ids"
              ? "/api/activate-batch"
              : "/api/deactivate-batch";
          await fetch(ep, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: eligibleIds }),
          });
          await fetchStats();
          await fetchData(true);
        }
      }
    } catch {
      // ignore
    } finally {
      setContextBatchBusy(false);
    }
  };

  // Poll GET /api/adobe/pending-activations every 4 seconds for live multi-document Photoshop/Illustrator/InDesign auto-activation
  useEffect(() => {
    let active = true;
    const pollAdobe = async () => {
      try {
        const data = await safeFetchJson<any>(
          "/api/adobe/pending-activations",
          {
            timeoutMs: 3500,
            cache: "no-store",
          },
        );
        if (!active || !data) return;
        const normalized = normalizePendingActivations(data).filter(
          (doc) =>
            !doc.activated && (doc.totalFonts > 0 || doc.fonts.length > 0),
        );
        setPendingAdobeDocs(normalized);
      } catch {
        // ignore when offline or backend starting
      }
    };

    pollAdobe();
    const intervalId = setInterval(pollAdobe, 4000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, []);

  // Poll GET /api/updater & check remote updates + font packs automatically on startup
  const [packUpdateTag, setPackUpdateTag] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const checkUpdaterStatus = async () => {
      try {
        const data = await safeFetchJson<any>("/api/updater", {
          timeoutMs: 3500,
          cache: "no-store",
        });
        if (active && data) {
          setUpdateBanner(data);
        }
      } catch {
        // ignore offline or initial backend boot
      }
    };

    const runStartupChecks = async () => {
      await checkUpdaterStatus();
      // Trigger active check for App updates + Fontivo-Fonts updates in background
      try {
        await fetch("/api/updater/check", { method: "POST" });
        await checkUpdaterStatus();
      } catch {
        // offline safe
      }
      try {
        const catalogRes = await safeFetchJson<any>(
          "/api/catalog/refresh-manifest",
          {
            timeoutMs: 6000,
            cache: "no-store",
          },
        );
        const remoteTag = String(
          catalogRes?.releaseTag ?? catalogRes?.version ?? "",
        ).trim();
        if (active && remoteTag && typeof window !== "undefined") {
          const seenTag = window.localStorage.getItem("fontivo_seen_fonts_tag");
          if (catalogRes?.hasUpdate || (seenTag && seenTag !== remoteTag)) {
            setPackUpdateTag(remoteTag);
          }
          window.localStorage.setItem("fontivo_seen_fonts_tag", remoteTag);
        }
      } catch {
        // offline safe
      }
    };

    runStartupChecks();
    const intervalId = setInterval(checkUpdaterStatus, 8000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, []);

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
      setTimeout(() => {
        setIsApplyingUpdate(false);
      }, 5000);
    }
  };

  const visibleAdobeBannerDocs = pendingAdobeDocs.filter(
    (doc) => !dismissedAdobeIds.includes(doc.id),
  );

  const handleActivatePendingAdobeDoc = async (doc: PendingAdobeDocument) => {
    setActivatingAdobeDocId(doc.id);
    try {
      const res = await safeFetchJson<any>("/api/adobe/activate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: doc.id,
          documentId: doc.id,
          documentName: doc.documentName,
          filePath: doc.filePath,
          fontIds: doc.matchedFontIds,
        }),
        timeoutMs: 30000,
      });

      const activatedCount =
        res?.activatedCount ??
        res?.activated ??
        (doc.localCount + doc.googleCount || doc.matchedCount);
      setPendingAdobeDocs((prev) => prev.filter((item) => item.id !== doc.id));
      setDesignOverlayNotice({
        fileName: doc.documentName,
        loading: false,
        error: false,
        totalFonts: doc.totalFonts,
        matchedIds: [],
        message: isRtl
          ? `تم تفعيل وتحميل ${activatedCount} خطاً لملف "${doc.documentName}" في الرام بنجاح!`
          : `Activated & downloaded ${activatedCount} design fonts for "${doc.documentName}" in RAM!`,
      });
      fetchStats();
      fetchData(true);
    } catch {
      // ignore
    } finally {
      setActivatingAdobeDocId(null);
    }
  };

  const handleActivateSingleBannerFont = async (
    doc: PendingAdobeDocument,
    font: AdobeDocumentFont,
  ) => {
    const key = `${doc.id}::${font.name}`;
    setActivatingAdobeFontKey(key);
    try {
      await safeFetchJson<any>("/api/adobe/activate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: doc.id,
          documentId: doc.id,
          documentName: doc.documentName,
          filePath: doc.filePath,
          fontName: font.name,
          fontId: font.fontId,
          googleFamily: font.googleFamily,
        }),
        timeoutMs: 25000,
      });
      setPendingAdobeDocs((prev) =>
        prev.map((d) =>
          d.id === doc.id
            ? {
                ...d,
                fonts: d.fonts.map((f) =>
                  f.name === font.name ? { ...f, active: true } : f,
                ),
              }
            : d,
        ),
      );
      fetchStats();
      fetchData(true);
    } catch {
      // ignore
    } finally {
      setActivatingAdobeFontKey(null);
    }
  };

  const handleToggleCompare = (font: any) => {
    setCompareFonts((prev) => {
      const exists = prev.some((f) => f.id === font.id);
      if (exists) return prev.filter((f) => f.id !== font.id);
      if (prev.length >= 4) return [...prev.slice(1), font];
      return [...prev, font];
    });
  };

  const handleApplyPaletteToCanvas = ({ background, text, textColor }: any) => {
    const targetText = textColor || text;
    if (targetText) setTextColor(targetText);
    if (background) {
      const hex = background.replace("#", "");
      const r = parseInt(hex.substr(0, 2), 16) || 0;
      const g = parseInt(hex.substr(2, 2), 16) || 0;
      const b = parseInt(hex.substr(4, 2), 16) || 0;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      setIsLightCanvas(lum > 0.5);
    }
  };

  // Drag & Drop for PSD / AI / INDD / PDF / EPS / SVG or Font files (.TTF / .OTF / .TTC)
  const handleDrop = async (e: any) => {
    e.preventDefault();
    e.stopPropagation();

    const rawFiles: File[] = e.dataTransfer?.files
      ? Array.from(e.dataTransfer.files)
      : [];
    const fontFiles = rawFiles.filter((f) => /\.(ttf|otf|ttc)$/i.test(f.name));
    if (fontFiles.length > 0) {
      await handleImportFontFiles(fontFiles);
      return;
    }

    const droppedFiles = extractSupportedDesignFiles(e.dataTransfer?.files);
    if (droppedFiles.length === 0) return;

    const displayName =
      droppedFiles.length === 1
        ? droppedFiles[0].name
        : `${droppedFiles[0].name} (+${droppedFiles.length - 1})`;

    const opId = `drop-inspect-${Date.now()}`;
    upsertLiveOperation({
      id: opId,
      title: `Scanning Design File: ${displayName}`,
      titleAr: `فحص ملف التصميم: ${displayName}`,
      category: "workspace-scan",
      status: "running",
      progressPercent: 40,
      itemsDone: 0,
      itemsTotal: droppedFiles.length,
      stepLabel: "Detecting & activating fonts in RAM...",
      stepLabelAr: "جاري الكشف عن الخطوط وتفعيلها بالرام...",
    });

    setDesignOverlayNotice({
      fileName: displayName,
      loading: true,
      error: false,
      message: isRtl
        ? "جاري فحص وتفعيل خطوط ملف التصميم..."
        : "Inspecting & activating design fonts...",
    });

    try {
      let totalDetectedFonts = 0;
      let matchedTotal = 0;
      const matchedIds: Array<string | number> = [];
      let lastError: string | null = null;

      for (let i = 0; i < droppedFiles.length; i++) {
        const file = droppedFiles[i];
        const data = await inspectDroppedDesignFile(file, {
          autoActivate: true,
        });
        if (data.success && Array.isArray(data.fonts)) {
          totalDetectedFonts += data.totalFonts ?? data.fonts.length;
          const matched = data.fonts.filter(
            (f: any) => f.available || f.isMatched,
          );
          matchedTotal += data.matchedCount ?? matched.length;
          matched.forEach((f: any) => {
            if (f.id !== undefined && f.id !== null) matchedIds.push(f.id);
          });
        } else {
          lastError =
            data.error ||
            (isRtl
              ? "تعذر فحص ملف التصميم."
              : "Failed to inspect design file.");
        }
      }

      if (totalDetectedFonts > 0 || !lastError) {
        upsertLiveOperation({
          id: opId,
          status: "completed",
          progressPercent: 100,
          itemsDone: droppedFiles.length,
          itemsTotal: droppedFiles.length,
          stepLabel: `Activated ${matchedTotal}/${totalDetectedFonts} design fonts in RAM`,
          stepLabelAr: `تم تفعيل ${matchedTotal} من أصل ${totalDetectedFonts} خطاً في الرام!`,
        });
        setDesignOverlayNotice({
          fileName: displayName,
          loading: false,
          error: false,
          totalFonts: totalDetectedFonts,
          matchedIds,
          message: isRtl
            ? `تم التعرف على ${totalDetectedFonts} خطاً في التصميم (${matchedTotal} متوفر)! تم تفعيل الخطوط المتاحة بالرام.`
            : `Detected ${totalDetectedFonts} fonts in file (${matchedTotal} matched)! Available fonts activated in RAM.`,
        });
        fetchStats();
        fetchData(true);
      } else {
        upsertLiveOperation({
          id: opId,
          status: "failed",
          progressPercent: 0,
          error: lastError,
        });
        setDesignOverlayNotice({
          fileName: displayName,
          loading: false,
          error: true,
          message: lastError,
        });
      }
    } catch (err: any) {
      upsertLiveOperation({
        id: opId,
        status: "failed",
        progressPercent: 0,
        error: err?.message,
      });
      setDesignOverlayNotice({
        fileName: displayName,
        loading: false,
        error: true,
        message:
          err?.message ||
          (isRtl
            ? "حدث خطأ أثناء فحص ملف التصميم."
            : "Error inspecting dropped design file."),
      });
    }
  };

  return (
    <div
      onDragOver={(e: any) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={handleDrop}
      className={`flex flex-col h-screen w-screen overflow-hidden select-none font-sans text-xs bg-[var(--color-bg)] text-[var(--color-text-main)] ${theme}`}
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Hidden Custom Font Input for Library Header Bar */}
      <input
        ref={customFontsInputRef}
        type="file"
        multiple
        accept=".ttf,.otf,.ttc"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleImportFontFiles(e.target.files);
            e.target.value = "";
          }
        }}
        className="hidden"
      />

      {/* 0. Fontivo Opening / Splash Screen */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}

      {/* 1. TOP HEADER & WINDOW CONTROLS BAR */}
      <HeaderBar
        onHeaderMouseDown={handleHeaderMouseDown}
        onHeaderDoubleClick={handleHeaderDoubleClick}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        sortBy={sortBy}
        setSortBy={setSortBy}
        showSortMenu={showSortMenu}
        setShowSortMenu={setShowSortMenu}
        sortRef={sortRef}
        onOpenGitHubPack={() => setIsGitHubPackOpen(true)}
        onOpenRamCleaner={() => setActiveTab("system-health")}
        onAddCustomFonts={handleImportFontFiles}
        onOpenOperations={() => setIsOperationsCenterOpen((prev) => !prev)}
        ramMb={ramMb}
        theme={theme}
        toggleTheme={toggleTheme}
        networkStatus={networkStatus}
        sendWindowEvent={sendWindowEvent}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentLanguage={currentLanguage}
        onSetLanguage={handleSetLanguage}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
        t={t}
        isRtl={isRtl}
      />

      {/* Automated Background Self-Updater Ready-To-Install Banner */}
      {updateBanner &&
        updateBanner.status === "ready_to_install" &&
        !isUpdateBannerDismissed && (
          <div
            data-testid="updater-ready-banner"
            className="bg-[#291C2E] text-[#FFF9F2] px-4 py-2.5 flex items-center justify-between gap-3 text-xs shadow-md shrink-0 border-b border-[#F16B50]/45 animate-in slide-in-from-top-2"
            dir={isRtl ? "rtl" : "ltr"}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-[#F16B50]/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-[#F16B50] shrink-0" />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
                <span className="font-bold truncate text-[13px]">
                  {isRtl
                    ? `تم تنزيل تحديث Fontivo v${updateBanner.latestVersion} تلقائيًا وهو جاهز للتثبيت!`
                    : `Fontivo v${updateBanner.latestVersion} is downloaded and ready to install!`}
                </span>
                {updateBanner.releaseNotes && (
                  <span className="text-[#D8CEDF] text-[11px] truncate hidden md:inline max-w-md">
                    — {updateBanner.releaseNotes}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleApplyUpdate}
                disabled={isApplyingUpdate}
                className="px-3 py-1.5 rounded-lg bg-[#F16B50] text-[#130C16] font-bold text-xs hover:opacity-90 active:scale-98 transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                data-testid="updater-apply-btn"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isApplyingUpdate ? "animate-spin" : ""}`}
                />
                <span>
                  {isApplyingUpdate
                    ? isRtl
                      ? "جاري إعادة التشغيل والتحديث..."
                      : "Restarting..."
                    : isRtl
                      ? "إعادة التشغيل والتحديث الآن"
                      : "Restart & Update Now"}
                </span>
              </button>
              <button
                onClick={() => setIsUpdateBannerDismissed(true)}
                className="p-1 rounded-lg hover:bg-white/10 text-[#D8CEDF] hover:text-white transition cursor-pointer"
                title={isRtl ? "إغلاق الإشعار" : "Dismiss"}
                aria-label="Dismiss banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      {/* Automatic Fontivo-Fonts Pack Update Notification */}
      {packUpdateTag && (
        <div
          className="bg-[#231829] text-[#FFF9F2] px-4 py-2 flex items-center justify-between gap-3 text-xs shrink-0 border-b border-[#B7A1D9]/35"
          dir={isRtl ? "rtl" : "ltr"}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Package className="w-4 h-4 text-[#B7A1D9] shrink-0" />
            <span className="truncate font-medium">
              {isRtl
                ? `تتوفر حزم خطوط محدثة (${packUpdateTag}) في مكتبة Fontivo-Fonts.`
                : `New Fontivo-Fonts packs (${packUpdateTag}) are available.`}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setActiveTab("cloud-packs");
                setPackUpdateTag(null);
              }}
              className="px-2.5 py-1 rounded-lg bg-[#B7A1D9] text-[#130C16] font-bold text-[11px] hover:opacity-90 cursor-pointer"
            >
              {isRtl ? "عرض الحزم" : "View Packs"}
            </button>
            <button
              onClick={() => setPackUpdateTag(null)}
              className="p-1 rounded hover:bg-white/10 text-[#D8CEDF] cursor-pointer"
              aria-label="Dismiss pack update"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Live Multi-Document Photoshop / Illustrator / InDesign Auto-Activation Banner */}
      {visibleAdobeBannerDocs.length > 0 && (
        <div
          data-testid="adobe-auto-activation-banner"
          className="bg-[var(--color-back-header)] border-b border-[var(--color-action)]/40 text-[var(--color-text-header)] divide-y divide-[var(--color-border-subtle)] text-xs shadow-sm animate-in slide-in-from-top-2 shrink-0 max-h-72 overflow-y-auto"
        >
          {visibleAdobeBannerDocs.map((doc) => {
            const isExpanded = Boolean(expandedAdobeBannerIds[doc.id]);
            const query = (adobeBannerSearch[doc.id] || "")
              .trim()
              .toLowerCase();
            const actionableCount = doc.localCount + doc.googleCount;
            const filteredFonts = doc.fonts.filter(
              (f) =>
                !query ||
                f.name.toLowerCase().includes(query) ||
                (f.googleFamily &&
                  f.googleFamily.toLowerCase().includes(query)),
            );

            return (
              <div key={doc.id} className="px-4 py-2 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                    <span className="px-2 py-0.5 rounded-md bg-[var(--color-action)]/15 text-[var(--color-action)] font-bold text-[10px] uppercase flex items-center gap-1 shrink-0">
                      <Radio className="w-3 h-3 animate-pulse shrink-0" />
                      <span>{doc.appName}</span>
                    </span>
                    <span className="font-bold truncate">
                      {doc.documentName}
                    </span>
                    <span className="text-[var(--color-text-muted)] font-mono text-[11px] whitespace-nowrap shrink-0">
                      {isRtl
                        ? `(${doc.totalFonts} خط • محلي: ${doc.localCount} • Google: ${doc.googleCount})`
                        : `(${doc.totalFonts} fonts • Local: ${doc.localCount} • Google: ${doc.googleCount})`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {doc.fonts.length > 0 && (
                      <button
                        onClick={() =>
                          setExpandedAdobeBannerIds((prev) => ({
                            ...prev,
                            [doc.id]: !prev[doc.id],
                          }))
                        }
                        className="h-7 px-2.5 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                        <span>
                          {isRtl
                            ? `الخطوط (${doc.fonts.length})`
                            : `Fonts (${doc.fonts.length})`}
                        </span>
                      </button>
                    )}
                    <button
                      onClick={() => handleActivatePendingAdobeDoc(doc)}
                      disabled={
                        activatingAdobeDocId === doc.id || actionableCount === 0
                      }
                      className="h-7 px-3 rounded-lg bg-[var(--color-green)] hover:opacity-90 disabled:opacity-50 text-zinc-950 font-bold text-[11px] transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      {activatingAdobeDocId === doc.id ? (
                        <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                      ) : (
                        <Zap className="w-3 h-3 shrink-0" />
                      )}
                      <span>
                        {isRtl
                          ? "تفعيل وتحميل كل خطوط التصميم في الرام"
                          : "Activate & Download All Design Fonts"}
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setDismissedAdobeIds((prev) => [...prev, doc.id]);
                        safeFetchJson("/api/adobe/activate-document", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            documentId: doc.id,
                            dismiss: true,
                          }),
                          timeoutMs: 4000,
                        }).catch(() => {});
                      }}
                      className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
                      title={isRtl ? "إغلاق الإشعار" : "Dismiss"}
                      aria-label={isRtl ? "إغلاق الإشعار" : "Dismiss"}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="pt-1 pb-1.5 space-y-2">
                    <div className="relative">
                      <Search className="w-3 h-3 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
                      <input
                        type="text"
                        value={adobeBannerSearch[doc.id] || ""}
                        onChange={(e) =>
                          setAdobeBannerSearch((prev) => ({
                            ...prev,
                            [doc.id]: e.target.value,
                          }))
                        }
                        placeholder={
                          isRtl
                            ? "ابحث في خطوط هذا التصميم..."
                            : "Search detected fonts..."
                        }
                        className="w-full h-7 ps-8 pe-3 rounded-lg bg-[var(--color-back-main)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-header)] outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto">
                      {filteredFonts.map((font, idx) => {
                        const fontKey = `${doc.id}::${font.name}`;
                        const busy = activatingAdobeFontKey === fontKey;
                        return (
                          <div
                            key={`${font.name}-${idx}`}
                            className="px-2.5 py-1.5 rounded-lg bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-2 min-w-0"
                          >
                            <span className="font-mono text-[11px] font-semibold truncate">
                              {font.name}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {font.active ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[9.5px] font-bold">
                                  {isRtl ? "مفعل" : "Active"}
                                </span>
                              ) : font.status === "system" ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[9.5px] font-bold">
                                  {isRtl ? "مثبت بالنظام" : "System"}
                                </span>
                              ) : font.status === "local" ? (
                                <button
                                  onClick={() =>
                                    handleActivateSingleBannerFont(doc, font)
                                  }
                                  disabled={busy}
                                  className="px-1.5 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-zinc-950 text-[9.5px] font-bold cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Zap className="w-2.5 h-2.5" />
                                  <span>{isRtl ? "متاح محلياً" : "Local"}</span>
                                </button>
                              ) : font.status === "google" ? (
                                <button
                                  onClick={() =>
                                    handleActivateSingleBannerFont(doc, font)
                                  }
                                  disabled={busy}
                                  className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-zinc-950 text-[9.5px] font-bold cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Download className="w-2.5 h-2.5" />
                                  <span>
                                    {isRtl ? "Google Fonts" : "Google"}
                                  </span>
                                </button>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-[var(--color-control)] text-[var(--color-text-dim)] text-[9.5px]">
                                  {isRtl ? "غير موجود" : "Missing"}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Photoshop Drag & Drop Notification Banner */}
      {designOverlayNotice && (
        <div
          className={`px-4 py-2.5 text-white flex items-center justify-between gap-3 text-xs shadow-md animate-in slide-in-from-top-2 ${
            designOverlayNotice.error
              ? "bg-rose-700"
              : "bg-[var(--color-action)]"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {designOverlayNotice.error ? (
              <AlertCircle className="w-4 h-4 text-rose-200 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
            )}
            <span className="font-bold truncate">
              {designOverlayNotice.message}
            </span>
            <span className="text-white/80 font-mono text-[11px] shrink-0">
              ({designOverlayNotice.fileName})
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!designOverlayNotice.loading &&
              !designOverlayNotice.error &&
              Array.isArray(designOverlayNotice.matchedIds) &&
              designOverlayNotice.matchedIds.length > 0 && (
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/activate-batch", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          ids: designOverlayNotice.matchedIds,
                        }),
                      });
                      const d = await res.json();
                      if (d.success) {
                        fetchStats();
                        fetchData(true);
                      }
                    } catch {
                      // ignore
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white text-zinc-950 font-bold text-[11px] hover:bg-white/90 transition cursor-pointer flex items-center gap-1"
                >
                  <Zap className="w-3 h-3" />
                  <span>
                    {isRtl
                      ? "تفعيل جميع خطوط التصميم في الرام"
                      : "Activate All Design Fonts in RAM"}
                  </span>
                </button>
              )}
            <button
              onClick={() => setDesignOverlayNotice(null)}
              className="p-1 hover:bg-white/20 rounded transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 2. MAIN APPLICATION BODY */}
      <div className="flex flex-1 overflow-hidden">
        {/* Unified Master Navigation Sidebar */}
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          sidebarMode={sidebarMode}
          setSidebarMode={setSidebarMode}
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            setInspectedFamily(null);
          }}
          currentFilter={filter}
          setFilter={(f) => {
            setFilter(f);
            setInspectedFamily(null);
          }}
          stats={stats}
          collections={collections}
          onCreateCollection={handleCreateCollection}
          onDeleteCollection={handleDeleteCollection}
          onPickFolder={handlePickFolder}
          onAddCustomFonts={handleImportFontFiles}
          onQuickRamBoost={async () => {
            try {
              await fetch("/api/system/optimize-ram", { method: "POST" });
              fetchStats();
            } catch {
              // ignore
            }
          }}
          onOpenRamCleaner={() => setActiveTab("system-health")}
          onOpenGitHubPack={() => setIsGitHubPackOpen(true)}
          t={t}
          isRtl={isRtl}
        />

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col h-[calc(100%-16px)] my-2 mr-2 ml-1.5 rounded-xl overflow-hidden bg-[var(--color-back-card)] border border-[var(--color-border)] relative shadow-xs transition-colors">
          <ErrorBoundary
            onReset={() => {
              setActiveTab("library");
              setInspectedFamily(null);
            }}
            isRtl={isRtl}
          >
            {activeTab === "library" || activeTab === "organize" ? (
              inspectedFamily ? (
                <FamilyInspectorView
                  family={inspectedFamily}
                  onBack={() => setInspectedFamily(null)}
                  previewText={previewText}
                  isRtl={isRtl}
                  onToggleActive={handleToggleActive}
                  onToggleFavorite={handleToggleFavorite}
                  onActivateFamily={handleActivateFamily}
                  onDeactivateFamily={handleDeactivateFamily}
                  onDeleteFont={(target: any) => setPendingDeleteFont(target)}
                  onAddToCollection={handleAddFontToCollection}
                  collections={collections}
                  t={t}
                />
              ) : (
                <>
                  {/* Google Fonts & Custom Fonts First Quick-Bar with Universal Search */}
                  <div className="px-4 py-2 bg-[var(--color-back-header)]/60 border-b border-[var(--color-border-subtle)] flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setFilter({ type: "all", value: null })}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                          filter.type === "all"
                            ? "bg-[var(--color-action)] text-[#130C16] shadow-2xs"
                            : "bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
                        }`}
                      >
                        <Layers className="w-3 h-3 shrink-0" />
                        <span>{isRtl ? "كافة الخطوط" : "All Fonts"}</span>
                      </button>

                      <button
                        onClick={() =>
                          setFilter({ type: "google", value: null })
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                          filter.type === "google"
                            ? "bg-[var(--color-action)] text-[#130C16] shadow-2xs"
                            : "bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
                        }`}
                      >
                        <Globe className="w-3 h-3 shrink-0" />
                        <span>
                          {isRtl ? "جوجل المحمّلة" : "Downloaded Google"}
                        </span>
                      </button>

                      <button
                        onClick={() =>
                          setFilter({ type: "system", value: null })
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                          filter.type === "system"
                            ? "bg-[var(--color-action)] text-[#130C16] shadow-2xs"
                            : "bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
                        }`}
                      >
                        <Monitor className="w-3 h-3 shrink-0" />
                        <span>{isRtl ? "خطوط النظام" : "System Fonts"}</span>
                      </button>

                      <button
                        onClick={() =>
                          setFilter({ type: "custom", value: null })
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                          filter.type === "custom"
                            ? "bg-[var(--color-action)] text-[#130C16] shadow-2xs"
                            : "bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
                        }`}
                      >
                        <FolderOpen className="w-3 h-3 shrink-0" />
                        <span>
                          {isRtl
                            ? "خطوطي الخاصة والمحلية"
                            : "My Custom & Local Fonts"}
                        </span>
                      </button>

                      <button
                        onClick={() =>
                          setFilter({ type: "favorites", value: null })
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                          filter.type === "favorites"
                            ? "bg-[var(--color-action)] text-[#130C16] shadow-2xs"
                            : "bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
                        }`}
                      >
                        <Bookmark className="w-3 h-3 shrink-0" />
                        <span>{isRtl ? "المفضلة" : "Favorites"}</span>
                      </button>

                      <button
                        onClick={() =>
                          setFilter({ type: "active", value: null })
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                          filter.type === "active"
                            ? "bg-[var(--color-action)] text-[#130C16] shadow-2xs"
                            : "bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
                        }`}
                      >
                        <Zap className="w-3 h-3 shrink-0" />
                        <span>
                          {isRtl ? "المفعلة بالرام" : "Active in RAM"}
                        </span>
                      </button>
                    </div>

                    {/* Contextual Smart Actions Strip per Active Filter */}
                    <div className="w-full flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--color-border-subtle)]/70">
                      {filter.type === "custom" ? (
                        <div className="flex flex-wrap items-center gap-2 w-full justify-between">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {customFolders.map((folder) => {
                              const allActive = folder.active >= folder.total;
                              return (
                                <div
                                  key={folder.path}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-back-card)] border border-[var(--color-border)] text-[11px]"
                                  title={folder.path}
                                >
                                  <FolderOpen className="w-3 h-3 text-[#B7A1D9] shrink-0" />
                                  <span className="font-semibold text-[var(--color-text-header)] truncate max-w-[140px]">
                                    {folder.name}
                                  </span>
                                  <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                                    {folder.active}/{folder.total}
                                  </span>
                                  {!allActive ? (
                                    <button
                                      onClick={() =>
                                        handleContextualBatch(
                                          "activate-folder",
                                          folder.path,
                                        )
                                      }
                                      disabled={contextBatchBusy}
                                      className="px-2 py-0.5 rounded bg-[var(--color-action)]/15 hover:bg-[var(--color-action)] text-[var(--color-action)] hover:text-[#130C16] font-bold transition cursor-pointer text-[10px]"
                                    >
                                      {isRtl ? "تفعيل بالرام" : "Activate"}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        handleContextualBatch(
                                          "deactivate-folder",
                                          folder.path,
                                        )
                                      }
                                      disabled={contextBatchBusy}
                                      className="px-2 py-0.5 rounded bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] font-semibold transition cursor-pointer text-[10px]"
                                    >
                                      {isRtl ? "إلغاء" : "Deactivate"}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={handlePickFolder}
                              className="px-2.5 py-1 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-header)] flex items-center gap-1 cursor-pointer"
                            >
                              <FolderPlus className="w-3 h-3 text-[var(--color-action)]" />
                              <span>
                                {isRtl ? "استيراد مجلد" : "Import Folder"}
                              </span>
                            </button>
                            <button
                              onClick={() =>
                                handleContextualBatch("activate-ids")
                              }
                              disabled={contextBatchBusy || fonts.length === 0}
                              className="px-2.5 py-1 rounded-lg bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-[#130C16] text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Zap className="w-3 h-3" />
                              <span>
                                {isRtl
                                  ? "تفعيل الكل بالرام"
                                  : "Activate All RAM"}
                              </span>
                            </button>
                            <button
                              onClick={() =>
                                handleContextualBatch("deactivate-ids")
                              }
                              disabled={contextBatchBusy || fonts.length === 0}
                              className="px-2.5 py-1 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                            >
                              {isRtl ? "إلغاء التفعيل" : "Deactivate All"}
                            </button>
                          </div>
                        </div>
                      ) : filter.type === "google" ||
                        filter.type === "favorites" ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            {filter.type === "google"
                              ? isRtl
                                ? "إدارة فورية لكافة خطوط جوجل المحملة:"
                                : "Quick session actions for downloaded Google Fonts:"
                              : isRtl
                                ? "إدارة سريعة لمفضلة الخطوط:"
                                : "Quick actions for your favorite fonts:"}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() =>
                                handleContextualBatch("activate-ids")
                              }
                              disabled={contextBatchBusy || fonts.length === 0}
                              className="px-2.5 py-1 rounded-lg bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-[#130C16] text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Zap className="w-3 h-3" />
                              <span>
                                {isRtl
                                  ? "تفعيل المعروض بالرام"
                                  : "Activate Shown in RAM"}
                              </span>
                            </button>
                            <button
                              onClick={() =>
                                handleContextualBatch("deactivate-ids")
                              }
                              disabled={contextBatchBusy || fonts.length === 0}
                              className="px-2.5 py-1 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                            >
                              {isRtl
                                ? "إلغاء تفعيل المعروض"
                                : "Deactivate Shown"}
                            </button>
                          </div>
                        </div>
                      ) : filter.type === "active" ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            {isRtl
                              ? `الخطوط المفعلة حالياً بالذاكرة (${stats?.active || 0}) — تتفرغ تلقائياً عند الإغلاق:`
                              : `Fonts currently active in RAM (${stats?.active || 0}) — auto-cleared on exit:`}
                          </span>
                          <button
                            onClick={() =>
                              handleContextualBatch("deactivate-all")
                            }
                            disabled={
                              contextBatchBusy || (stats?.active || 0) === 0
                            }
                            className="px-3 py-1 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-action)] border border-[var(--color-border)] text-[var(--color-text-header)] hover:text-[#130C16] text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 transition"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>
                              {isRtl
                                ? "إلغاء تفعيل الكل من الرام"
                                : "Deactivate All RAM"}
                            </span>
                          </button>
                        </div>
                      ) : filter.type === "system" ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            {isRtl
                              ? "خطوط ويندوز الأصلية مثبتة دائماً في النظام ولا تقبل التفعيل أو الإيقاف عبر الرام."
                              : "Windows OS fonts are permanently installed in the system and cannot be toggled in RAM."}
                          </span>
                          <button
                            onClick={() => setActiveTab("windows-fonts")}
                            className="px-2.5 py-1 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[11px] font-semibold text-[#B7A1D9] flex items-center gap-1.5 cursor-pointer"
                          >
                            <HardDrive className="w-3 h-3" />
                            <span>
                              {isRtl
                                ? "إدارة خطوط ويندوز"
                                : "Open Windows Manager"}
                            </span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            {isRtl
                              ? `تحكم سريع في المكتبة (${(stats?.total || 0).toLocaleString()} خطاً — يستثني خطوط النظام تلقائياً):`
                              : `Quick library batch control (${(stats?.total || 0).toLocaleString()} fonts — OS fonts excluded automatically):`}
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              onClick={() =>
                                handleContextualBatch("activate-all-lib")
                              }
                              disabled={contextBatchBusy}
                              className="px-2.5 py-1 rounded-lg bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-[#130C16] text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Zap className="w-3 h-3" />
                              <span>
                                {isRtl
                                  ? "تفعيل المكتبة بالرام"
                                  : "Activate Library (RAM)"}
                              </span>
                            </button>
                            <button
                              onClick={() =>
                                handleContextualBatch("install-all-lib")
                              }
                              disabled={contextBatchBusy}
                              className="px-2.5 py-1 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-header)] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Download className="w-3 h-3 text-[#B7A1D9]" />
                              <span>
                                {isRtl
                                  ? "تثبيت دائم لويندوز"
                                  : "Install to Windows"}
                              </span>
                            </button>
                            <button
                              onClick={() =>
                                handleContextualBatch("deactivate-all")
                              }
                              disabled={contextBatchBusy}
                              className="px-2.5 py-1 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] cursor-pointer disabled:opacity-50"
                            >
                              {isRtl ? "إلغاء تفعيل الكل" : "Deactivate All"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Real Universal Search Input (بحث شامل في كافة الخطوط) */}
                    <div className="relative flex items-center min-w-[240px] sm:min-w-[300px] md:min-w-[360px] max-w-md flex-1">
                      <Search className="w-3.5 h-3.5 text-[var(--color-text-muted)] absolute ltr:left-3 rtl:right-3 pointer-events-none" />
                      <input
                        ref={librarySearchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={
                          isRtl
                            ? "بحث شامل وفوري في كافة الخطوط (ويندوز، جوجل، الحزم، المحلية)..."
                            : "Search all fonts (Windows, Google, Packs, Local)..."
                        }
                        className="w-full h-8.5 ltr:pl-9 ltr:pr-8 rtl:pr-9 rtl:pl-8 rounded-xl bg-[var(--color-control)] border border-[var(--color-border)] focus:border-[var(--color-action)] focus:ring-1 focus:ring-[var(--color-action)] text-xs text-[var(--color-text-header)] placeholder:text-[var(--color-text-muted)] transition outline-hidden shadow-2xs"
                      />
                      {searchQuery ? (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute ltr:right-2 rtl:left-2 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] cursor-pointer"
                          title={isRtl ? "مسح البحث" : "Clear search"}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <kbd className="absolute ltr:right-2.5 rtl:left-2.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-back-main)] border border-[var(--color-border)] text-[var(--color-text-muted)] pointer-events-none hidden sm:inline-block">
                          Ctrl+F
                        </kbd>
                      )}
                    </div>
                  </div>

                  <Toolbar
                    fontSize={fontSize}
                    setFontSize={setFontSize}
                    textAlign={textAlign}
                    setTextAlign={setTextAlign}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    isLightCanvas={isLightCanvas}
                    setIsLightCanvas={setIsLightCanvas}
                    textColor={textColor}
                    setTextColor={setTextColor}
                    hasTashkeel={hasTashkeel}
                    setHasTashkeel={setHasTashkeel}
                    hasLigatures={hasLigatures}
                    setHasLigatures={setHasLigatures}
                    previewText={previewText}
                    setPreviewText={setPreviewText}
                    scriptFilter={scriptFilter}
                    setScriptFilter={(nextScript: string) => {
                      setScriptFilter(nextScript as any);
                      if (nextScript === "tashkeel") setHasTashkeel(true);
                    }}
                    filter={filter}
                    setFilter={setFilter}
                    onOpenColorPalette={() => {
                      setActiveTab("color-studio");
                    }}
                    onOpenUiLab={() => setActiveTab("ui-lab")}
                    isRtl={isRtl}
                    t={t}
                  />

                  <main
                    className={`flex-1 overflow-y-auto transition-colors high-dpi-text font-specimen-render ${isLightCanvas ? "bg-white text-zinc-950" : "bg-[var(--color-back-main)] text-[var(--color-text-main)]"}`}
                  >
                    {isFamilyMode ? (
                      <div
                        data-testid="family-grid"
                        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 p-4 w-full"
                      >
                        {families.map((fam) => (
                          <FamilyCard
                            key={fam.family}
                            family={fam}
                            previewText={previewText}
                            fontSize={fontSize}
                            lineHeight={lineHeight}
                            letterSpacing={letterSpacing}
                            textAlign={textAlign}
                            isRtl={isRtl}
                            textColor={isLightCanvas ? "#111111" : textColor}
                            hasTashkeelFilter={
                              scriptFilter === "tashkeel" ||
                              filter.type === "tashkeel"
                            }
                            onToggleActive={handleToggleActive}
                            onToggleFavorite={handleToggleFavorite}
                            onActivateFamily={handleActivateFamily}
                            onDeactivateFamily={handleDeactivateFamily}
                            onInspectFamily={(f) => setInspectedFamily(f)}
                            onOpenDetails={(font) => setDetailFont(font)}
                            onToggleCompare={handleToggleCompare}
                            onDeleteFont={(target) =>
                              setPendingDeleteFont(target)
                            }
                            onAddToCollection={handleAddFontToCollection}
                            collections={collections}
                            isCompared={fam.fonts.some((f) =>
                              compareFonts.some((cf) => cf.id === f.id),
                            )}
                            onOpenPack={() => setIsGitHubPackOpen(true)}
                          />
                        ))}
                      </div>
                    ) : viewMode === "compact" ? (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3.5 p-4">
                        {fonts.map((font) => (
                          <FontCard
                            key={font.id}
                            font={font}
                            previewText={previewText}
                            fontSize={fontSize}
                            lineHeight={lineHeight}
                            letterSpacing={letterSpacing}
                            textAlign={textAlign}
                            isRtl={isRtl}
                            textColor={isLightCanvas ? "#111111" : textColor}
                            viewMode="compact"
                            onToggleActive={handleToggleActive}
                            onToggleFavorite={handleToggleFavorite}
                            onOpenDetails={(f) => setDetailFont(f)}
                            onToggleCompare={handleToggleCompare}
                            onDeleteFont={(target) =>
                              setPendingDeleteFont(target)
                            }
                            onAddToCollection={handleAddFontToCollection}
                            collections={collections}
                            isCompared={compareFonts.some(
                              (cf) => cf.id === font.id,
                            )}
                          />
                        ))}
                      </div>
                    ) : viewMode === "grid" ? (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4 p-4">
                        {fonts.map((font) => (
                          <FontCard
                            key={font.id}
                            font={font}
                            previewText={previewText}
                            fontSize={fontSize}
                            lineHeight={lineHeight}
                            letterSpacing={letterSpacing}
                            textAlign={textAlign}
                            isRtl={isRtl}
                            textColor={isLightCanvas ? "#111111" : textColor}
                            viewMode="grid"
                            onToggleActive={handleToggleActive}
                            onToggleFavorite={handleToggleFavorite}
                            onOpenDetails={(f) => setDetailFont(f)}
                            onToggleCompare={handleToggleCompare}
                            onDeleteFont={(target) =>
                              setPendingDeleteFont(target)
                            }
                            onAddToCollection={handleAddFontToCollection}
                            collections={collections}
                            isCompared={compareFonts.some(
                              (cf) => cf.id === font.id,
                            )}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-4 p-4 max-w-7xl mx-auto w-full">
                        {fonts.map((font) => (
                          <FontCard
                            key={font.id}
                            font={font}
                            previewText={previewText}
                            fontSize={fontSize}
                            lineHeight={lineHeight}
                            letterSpacing={letterSpacing}
                            textAlign={textAlign}
                            isRtl={isRtl}
                            textColor={isLightCanvas ? "#111111" : textColor}
                            viewMode="editorial"
                            onToggleActive={handleToggleActive}
                            onToggleFavorite={handleToggleFavorite}
                            onOpenDetails={(f) => setDetailFont(f)}
                            onToggleCompare={handleToggleCompare}
                            onDeleteFont={(target) =>
                              setPendingDeleteFont(target)
                            }
                            onAddToCollection={handleAddFontToCollection}
                            collections={collections}
                            isCompared={compareFonts.some(
                              (cf) => cf.id === font.id,
                            )}
                          />
                        ))}
                      </div>
                    )}

                    {/* Empty State */}
                    {((isFamilyMode && families.length === 0) ||
                      (!isFamilyMode && fonts.length === 0)) &&
                      !loading && (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[380px] animate-in fade-in select-none">
                          <div className="w-16 h-16 rounded-2xl bg-[var(--color-control)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] mb-4 shadow-sm">
                            {searchQuery ? (
                              <Search className="w-8 h-8 text-[var(--color-action)]" />
                            ) : filter.type === "favorites" ? (
                              <Bookmark className="w-8 h-8 text-[var(--color-action)]" />
                            ) : filter.type === "active" ? (
                              <Zap className="w-8 h-8 text-[var(--color-action)]" />
                            ) : filter.type === "collection" ? (
                              <FolderOpen className="w-8 h-8 text-[#B7A1D9]" />
                            ) : (
                              <Layers className="w-8 h-8 text-[var(--color-text-muted)]" />
                            )}
                          </div>

                          <h3
                            className="text-base font-bold text-[var(--color-text-header)] mb-1.5"
                            dir="auto"
                          >
                            {searchQuery
                              ? isRtl
                                ? `لم يتم العثور على أي خط يطابق "${searchQuery}"`
                                : `No fonts found matching "${searchQuery}"`
                              : filter.type === "favorites"
                                ? isRtl
                                  ? "لا توجد خطوط في المفضلة بعد"
                                  : "No favorite fonts yet"
                                : filter.type === "active"
                                  ? isRtl
                                    ? "لا توجد خطوط مفعلة حالياً في الرام"
                                    : "No active fonts in memory"
                                  : filter.type === "collection"
                                    ? isRtl
                                      ? `المجموعة "${filter.value}" فارغة`
                                      : `Collection "${filter.value}" is empty`
                                    : isRtl
                                      ? "لا توجد خطوط لعرضها"
                                      : "No fonts to display"}
                          </h3>

                          <p
                            className="text-xs text-[var(--color-text-muted)] max-w-sm mb-5 leading-relaxed"
                            dir="auto"
                          >
                            {searchQuery
                              ? isRtl
                                ? "تأكد من كتابة الاسم بشكل صحيح أو جرب البحث بكلمة أقصر."
                                : "Check your spelling or try searching with a shorter term."
                              : filter.type === "favorites"
                                ? isRtl
                                  ? "اضغط على أيقونة النجمة عند أي خط لإضافته لقائمتك المفضلة."
                                  : "Click the star icon on any font to pin it here."
                                : filter.type === "active"
                                  ? isRtl
                                    ? "اضغط على الدائرة بجانب أي خط لتفعيله فوراً في الذاكرة."
                                    : "Click the green activation circle next to any font to inject it into RAM."
                                  : filter.type === "collection"
                                    ? isRtl
                                      ? "يمكنك إضافة الخطوط لهذه المجموعة بسهولة من خيارات الخط."
                                      : "You can organize fonts into this collection from font details."
                                    : isRtl
                                      ? "قم بإضافة خطوطك الخاصة (.TTF / .OTF) أو استعرض خطوط جوجل للبدء."
                                      : "Add custom fonts from your computer or browse Google Fonts to get started."}
                          </p>

                          <div className="flex flex-wrap items-center justify-center gap-2.5">
                            {searchQuery && (
                              <>
                                <button
                                  onClick={() => {
                                    setActiveTab("google-fonts");
                                  }}
                                  className="px-4 py-2 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-semibold shadow-xs transition cursor-pointer flex items-center gap-1.5"
                                >
                                  <Globe className="w-3.5 h-3.5" />
                                  <span>
                                    {isRtl
                                      ? `البحث عن "${searchQuery}" في Google Fonts`
                                      : `Search "${searchQuery}" on Google Fonts`}
                                  </span>
                                </button>
                                <button
                                  onClick={() => {
                                    setActiveTab("cloud-packs");
                                  }}
                                  className="px-4 py-2 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                                >
                                  <Package className="w-3.5 h-3.5 text-[var(--color-action)]" />
                                  <span>
                                    {isRtl
                                      ? "استعراض الحزم السحابية"
                                      : "Browse Cloud Packs"}
                                  </span>
                                </button>
                                <button
                                  onClick={() => setSearchQuery("")}
                                  className="px-4 py-2 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-muted)] text-xs font-medium transition cursor-pointer"
                                >
                                  {isRtl ? "مسح البحث" : "Clear search"}
                                </button>
                              </>
                            )}
                            {!searchQuery && (
                              <button
                                onClick={() =>
                                  customFontsInputRef.current?.click()
                                }
                                className="px-4 py-2 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                              >
                                <FilePlus2 className="w-3.5 h-3.5 text-[var(--color-action)]" />
                                <span>
                                  {isRtl
                                    ? "إضافة خطوط خاصة"
                                    : "Add Custom Fonts"}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                    <div
                      ref={loadMoreTriggerRef}
                      className="h-10 flex items-center justify-center text-xs text-[var(--color-text-muted)]"
                    >
                      {loading && (
                        <span>
                          {isRtl
                            ? "جاري تحميل المزيد من الخطوط..."
                            : "Loading more fonts..."}
                        </span>
                      )}
                    </div>
                  </main>

                  <BottomSampleBar
                    previewText={previewText}
                    setPreviewText={setPreviewText}
                    isRtl={isRtl}
                    setIsRtl={setIsRtl}
                  />
                </>
              )
            ) : activeTab === "inspector" ? (
              <FamilyInspectorView
                family={
                  inspectedFamily ||
                  families[0] ||
                  (fonts.length > 0
                    ? {
                        family: fonts[0].family || fonts[0].name,
                        count: 1,
                        fonts: [fonts[0]],
                      }
                    : null)
                }
                onBack={() => setActiveTab("library")}
                previewText={previewText}
                isRtl={isRtl}
                onToggleActive={handleToggleActive}
                onToggleFavorite={handleToggleFavorite}
                onActivateFamily={handleActivateFamily}
                onDeactivateFamily={handleDeactivateFamily}
                onDeleteFont={(target: any) => setPendingDeleteFont(target)}
                onAddToCollection={handleAddFontToCollection}
                collections={collections}
                t={t}
              />
            ) : activeTab === "specimen" ? (
              <SpecimenView
                font={fonts[0]}
                fonts={fonts}
                previewText={previewText}
                isRtl={isRtl}
                t={t}
              />
            ) : activeTab === "glyphs" ? (
              <GlyphsView font={fonts[0]} fonts={fonts} isRtl={isRtl} t={t} />
            ) : activeTab === "ui-lab" ? (
              <UiTypographyLabView
                fonts={fonts}
                activeFont={fonts[0]}
                t={t}
                isRtl={isRtl}
              />
            ) : activeTab === "google-fonts" ? (
              <GoogleFontsView
                onRefreshStats={fetchStats}
                t={t}
                isRtl={isRtl}
              />
            ) : activeTab === "cloud-packs" ? (
              <CloudPacksView onRefreshStats={fetchStats} t={t} isRtl={isRtl} />
            ) : activeTab === "workspaces" || activeTab === "brand-kits" ? (
              <WorkspacesView
                fonts={fonts}
                onActivateFont={handleToggleActive}
                onRefreshStats={fetchStats}
                t={t}
                isRtl={isRtl}
              />
            ) : activeTab === "color-studio" ? (
              <ColorStudioView
                onRefreshStats={fetchStats}
                t={t}
                isRtl={isRtl}
              />
            ) : activeTab === "windows-fonts" ? (
              <WindowsFontsView
                onRefreshStats={fetchStats}
                t={t}
                isRtl={isRtl}
              />
            ) : activeTab === "adobe" ? (
              <AdobeBridgeView
                onRefreshStats={fetchStats}
                t={t}
                isRtl={isRtl}
              />
            ) : activeTab === "system-health" ||
              activeTab === "ram-inspector" ? (
              <SystemHealthView
                onRefreshStats={() => {
                  fetchStats();
                  fetchData(true);
                }}
                t={t}
                isRtl={isRtl}
              />
            ) : activeTab === "settings" ? (
              <SettingsView
                onRefreshStats={fetchStats}
                currentLanguage={currentLanguage}
                onSetLanguage={handleSetLanguage}
                theme={theme}
                toggleTheme={toggleTheme}
                onNavigateTab={(tab) => {
                  setActiveTab(tab);
                  setInspectedFamily(null);
                }}
                t={t}
                isRtl={isRtl}
              />
            ) : activeTab === "playground" ? (
              <PlaygroundView
                fonts={fonts}
                families={families}
                t={t}
                isRtl={isRtl}
              />
            ) : activeTab === "discover" ? (
              <DiscoverView
                onActivateFamily={handleActivateFamily}
                t={t}
                isRtl={isRtl}
              />
            ) : activeTab === "licenses" ? (
              <LicensesView families={families} t={t} isRtl={isRtl} />
            ) : (
              <div
                className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[380px] bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none animate-in fade-in"
                dir={isRtl ? "rtl" : "ltr"}
              >
                <div className="w-16 h-16 rounded-2xl bg-[var(--color-control)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] mb-4 shadow-sm">
                  <Layers className="w-8 h-8 text-[var(--color-action)]" />
                </div>
                <h3 className="text-base font-bold text-[var(--color-text-header)] mb-2">
                  {isRtl ? "التبويب المطلوب غير متوفر" : "View Not Found"}
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] max-w-sm mb-6 leading-relaxed">
                  {isRtl
                    ? `لا يمكن العثور على الواجهة المطلوبة "${activeTab}". يمكنك العودة إلى مكتبة الخطوط الرئيسية.`
                    : `The requested view "${activeTab}" is not recognized. You can safely return to the font library.`}
                </p>
                <button
                  onClick={() => {
                    setActiveTab("library");
                    setInspectedFamily(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  {isRtl ? "العودة للمكتبة الرئيسية" : "Return to Font Library"}
                </button>
              </div>
            )}
          </ErrorBoundary>
        </div>
      </div>

      {/* 3. UNIVERSAL LIVE PROGRESS & OPERATIONS CENTER */}
      <OperationsCenter
        isOpen={isOperationsCenterOpen}
        onToggleOpen={setIsOperationsCenterOpen}
        isRtl={isRtl}
        t={t}
      />

      {/* 4. APPLICATION MODALS CONTAINER */}
      <ModalContainer
        isFeaturesModalOpen={isFeaturesModalOpen}
        setIsFeaturesModalOpen={setIsFeaturesModalOpen}
        isSuperSearchOpen={isSuperSearchOpen}
        setIsSuperSearchOpen={setIsSuperSearchOpen}
        onApplySuperSearch={(opts: any) => {
          if (opts.script === "arabic")
            setFilter({ type: "arabic", value: null });
          else if (opts.script === "latin")
            setFilter({ type: "english", value: null });
          if (opts.hasLigatures) setHasLigatures(true);
        }}
        isHelpOpen={isHelpOpen}
        setIsHelpOpen={setIsHelpOpen}
        isAboutDevOpen={isAboutDevOpen}
        setIsAboutDevOpen={setIsAboutDevOpen}
        isUpdaterOpen={isUpdaterOpen}
        setIsUpdaterOpen={setIsUpdaterOpen}
        isRamCleanerOpen={isRamCleanerOpen}
        setIsRamCleanerOpen={setIsRamCleanerOpen}
        isWindowsResetOpen={isWindowsResetOpen}
        setIsWindowsResetOpen={setIsWindowsResetOpen}
        isGitHubPackOpen={isGitHubPackOpen}
        setIsGitHubPackOpen={setIsGitHubPackOpen}
        onRefreshLibrary={() => {
          fetchStats();
          fetchData(true);
        }}
        isColorPaletteOpen={isColorPaletteOpen}
        setIsColorPaletteOpen={setIsColorPaletteOpen}
        onApplyPaletteToCanvas={handleApplyPaletteToCanvas}
        isUiLabOpen={isUiLabOpen}
        setIsUiLabOpen={setIsUiLabOpen}
        fonts={fonts}
        detailFont={detailFont}
        setDetailFont={setDetailFont}
        isCompareOpen={isCompareOpen}
        setIsCompareOpen={setIsCompareOpen}
        compareFonts={compareFonts}
        setCompareFonts={setCompareFonts}
        isBatchLibraryOpen={isBatchLibraryOpen}
        setIsBatchLibraryOpen={setIsBatchLibraryOpen}
        stats={stats}
        handleToggleActive={handleToggleActive}
        handleToggleFavorite={handleToggleFavorite}
        t={t}
        isRtl={isRtl}
      />

      {/* 5. THEMED CONFIRMATION DIALOG (replaces native WebView2 window.confirm) */}
      <ConfirmDialog
        open={Boolean(pendingDeleteFont)}
        title={isRtl ? "تأكيد حذف الخط" : "Confirm Font Removal"}
        message={(() => {
          if (!pendingDeleteFont) return "";
          const name =
            pendingDeleteFont.family ||
            pendingDeleteFont.displayName ||
            pendingDeleteFont.name ||
            String(pendingDeleteFont);
          return isRtl
            ? `هل أنت متأكد من حذف وإزالة الخط "${name}" من المكتبة؟`
            : `Are you sure you want to delete and remove "${name}" from the library?`;
        })()}
        confirmLabel={isRtl ? "حذف وإزالة" : "Delete Font"}
        cancelLabel={isRtl ? "إلغاء" : "Cancel"}
        variant="danger"
        isRtl={isRtl}
        onCancel={() => setPendingDeleteFont(null)}
        onConfirm={() => {
          const target = pendingDeleteFont;
          setPendingDeleteFont(null);
          if (target) {
            handleDeleteFont(target, { isRtl, skipConfirm: true });
          }
        }}
      />
    </div>
  );
}
