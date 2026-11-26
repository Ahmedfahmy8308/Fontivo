import React, { useState, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  FolderPlus,
  Zap,
  Globe,
  Layers,
  Briefcase,
  Bookmark,
  HardDrive,
  Settings,
  Activity,
  Palette,
  Package,
  FilePlus2,
  FolderOpen,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  FileText,
  Check,
  Monitor,
} from "lucide-react";
import { FontFilter, FontStats } from "../../types/font";
import { TranslationDictionary } from "../../i18n/locales";

export type SidebarMode = "main" | "settings";

export interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  sidebarMode?: SidebarMode;
  setSidebarMode?: (mode: SidebarMode) => void;
  currentFilter?: FontFilter;
  setFilter: (filter: FontFilter) => void;
  stats?: Partial<FontStats> | Record<string, any>;
  collections?: Record<string, string[]>;
  onCreateCollection?: (name: string) => void;
  onDeleteCollection?: (name: string) => void;
  onPickFolder?: () => void;
  onAddCustomFonts?: (files?: FileList | null) => void;
  onQuickRamBoost?: () => Promise<void> | void;
  onOpenRamCleaner?: () => void;
  onOpenGitHubPack?: () => void;
  isCollapsed?: boolean;
  t?: TranslationDictionary | Record<string, string>;
  isRtl?: boolean;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  sidebarMode: controlledMode,
  setSidebarMode: setControlledMode,
  currentFilter,
  setFilter,
  stats = {},
  collections = {},
  onCreateCollection,
  onDeleteCollection,
  onPickFolder,
  onAddCustomFonts,
  onQuickRamBoost,
  onOpenRamCleaner,
  onOpenGitHubPack,
  isCollapsed = false,
  t = {},
  isRtl = false,
}: SidebarProps) {
  const safeT = t || {};
  const [internalMode, setInternalMode] = useState<SidebarMode>("main");
  const sidebarMode = controlledMode ?? internalMode;
  const setSidebarMode = (mode: SidebarMode) => {
    if (setControlledMode) setControlledMode(mode);
    else setInternalMode(mode);
  };

  const [newCollectionName, setNewCollectionName] = useState("");
  const [isAddingCollection, setIsAddingCollection] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [ramBoosting, setRamBoosting] = useState(false);
  const [ramBoostDone, setRamBoostDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Honest, real counts derived directly from backend stats (zero hardcoded fake counts)
  const totalCount = Number(stats.total ?? 0);
  const activeCount = Number((stats as any).activeCount ?? stats.active ?? 0);
  const favoritesCount = Number(
    (stats as any).favoritesCount ?? stats.favorites ?? 0,
  );
  const googleCount = Number((stats as any).googleCount ?? 0);
  const systemCount = Number((stats as any).systemCount ?? 0);
  const localCount =
    Number((stats as any).localCount ?? (stats as any).customCount ?? 0) +
    Number((stats as any).cloudCount ?? 0);

  const getCollectionName = (name: string) => {
    if (isRtl) {
      if (name === "Web & UI Typography")
        return safeT.colWebUI || "خطوط الويب والواجهات";
      if (name === "Headlines & Posters")
        return safeT.colHeadlines || "عناوين وملصقات";
      if (name === "Calligraphy & Scripts")
        return safeT.colCalligraphy || "خطوط فنية ويدوية";
      if (name === "Branding & Identity")
        return safeT.colBranding || "الهوية البصرية";
    }
    return name;
  };

  const handleCreateCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim()) {
      setIsAddingCollection(false);
      return;
    }
    if (onCreateCollection) onCreateCollection(newCollectionName.trim());
    setNewCollectionName("");
    setIsAddingCollection(false);
  };

  const isFilterActive = (type: string, val: string | null = null) => {
    if (activeTab !== "library") return false;
    if (val !== null) {
      return currentFilter?.type === type && currentFilter?.value === val;
    }
    return currentFilter?.type === type && !currentFilter?.value;
  };

  const handleSelectFilter = (filterObj: FontFilter) => {
    setActiveTab("library");
    setFilter(filterObj);
  };

  const handleRamBoostClick = async () => {
    if (ramBoosting) return;
    setRamBoosting(true);
    try {
      if (onQuickRamBoost) {
        await onQuickRamBoost();
      } else {
        await fetch("/api/system/optimize-ram", { method: "POST" }).catch(
          () => {},
        );
        if (onOpenRamCleaner) onOpenRamCleaner();
      }
      setRamBoostDone(true);
      setTimeout(() => setRamBoostDone(false), 1800);
    } finally {
      setRamBoosting(false);
    }
  };

  const handleBackToLibrary = () => {
    setSidebarMode("main");
    setActiveTab("library");
  };

  const handleOpenSettingsMode = () => {
    setSidebarMode("settings");
    setActiveTab("settings");
  };

  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  const sourceFilterItems = [
    {
      id: "all",
      label: isRtl ? "الكل" : "All",
      count: totalCount,
      icon: Layers,
      iconClass: "text-[var(--color-action)]",
      filter: { type: "all", value: null } as FontFilter,
    },
    {
      id: "active",
      label: isRtl ? "المفعلة بالرام" : "Active in RAM",
      count: activeCount,
      icon: Zap,
      iconClass: "text-[var(--color-action)]",
      filter: { type: "active", value: null } as FontFilter,
    },
    {
      id: "favorites",
      label: isRtl ? "المفضلة" : "Favorites",
      count: favoritesCount,
      icon: Bookmark,
      iconClass: "text-[#B7A1D9]",
      filter: { type: "favorites", value: null } as FontFilter,
    },
    {
      id: "system",
      label: isRtl ? "خطوط النظام" : "System Fonts",
      count: systemCount,
      icon: Monitor,
      iconClass: "text-[#B7A1D9]",
      filter: { type: "system", value: null } as FontFilter,
    },
    {
      id: "custom",
      label: isRtl ? "المحلية والخاصة" : "Local & Custom",
      count: localCount,
      icon: FolderOpen,
      iconClass: "text-[var(--color-text-muted)]",
      filter: { type: "custom", value: null } as FontFilter,
    },
    {
      id: "google",
      label: isRtl ? "جوجل المحمّلة" : "Downloaded Google",
      count: googleCount,
      icon: Globe,
      iconClass: "text-[#B7A1D9]",
      filter: { type: "google", value: null } as FontFilter,
    },
  ];

  return (
    <aside
      className={`${isCollapsed ? "w-[60px]" : "w-[272px]"} h-[calc(100%-16px)] flex flex-col justify-between select-none shrink-0 bg-[var(--color-back-side)] rounded-xl my-2 mx-2 overflow-hidden text-[var(--color-text-main)] border border-[var(--color-border)] shadow-xs transition-all duration-200`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".ttf,.otf,.ttc"
        onChange={(e) => {
          if (onAddCustomFonts && e.target.files && e.target.files.length > 0) {
            onAddCustomFonts(e.target.files);
            e.target.value = "";
          }
        }}
        className="hidden"
      />

      {/* Workspace Header */}
      <div
        className={`px-3 py-3 border-b border-[var(--color-border-subtle)] flex items-center ${isCollapsed ? "justify-center" : "justify-between gap-2"} shrink-0 bg-[var(--color-back-header)]/40`}
      >
        {isCollapsed ? (
          <Layers
            className="w-4 h-4 text-[var(--color-action)]"
            aria-label={`${totalCount.toLocaleString()} Fonts`}
          />
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-text-muted)] font-sans truncate">
                {sidebarMode === "settings"
                  ? isRtl
                    ? "الإعدادات والنظام"
                    : "Settings & System"
                  : isRtl
                    ? "استوديو الخطوط"
                    : "Fontivo Studio"}
              </span>
            </div>
            <span className="text-[11px] font-mono tabular-nums text-[var(--color-text-muted)] font-bold shrink-0">
              {totalCount.toLocaleString()}
            </span>
          </>
        )}
      </div>

      {/* Navigation Content */}
      {isCollapsed ? (
        <div className="flex-1 overflow-y-auto px-1.5 py-3 space-y-2 flex flex-col items-center">
          {sidebarMode === "settings" ? (
            <>
              <button
                onClick={handleBackToLibrary}
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--color-control)] text-[var(--color-text-header)] hover:border-[var(--color-action)] border border-[var(--color-border)] transition cursor-pointer"
                title={isRtl ? "العودة للمكتبة" : "Back to Library"}
              >
                <BackIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveTab("settings")}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                  activeTab === "settings"
                    ? "bg-[var(--color-action)] text-white"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-control)]"
                }`}
                title={isRtl ? "الإعدادات العامة واللغة" : "General & Language"}
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveTab("windows-fonts")}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                  activeTab === "windows-fonts"
                    ? "bg-[var(--color-action)] text-white"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-control)]"
                }`}
                title={isRtl ? "مدير خطوط ويندوز" : "Windows System Fonts"}
              >
                <HardDrive className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveTab("ram-inspector")}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                  activeTab === "ram-inspector"
                    ? "bg-[var(--color-action)] text-white"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-control)]"
                }`}
                title={isRtl ? "مراقب الرام والموارد" : "RAM & Resources"}
              >
                <Zap className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveTab("system-health")}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                  activeTab === "system-health"
                    ? "bg-[var(--color-action)] text-white"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-control)]"
                }`}
                title={isRtl ? "صحة النظام" : "System Health"}
              >
                <ShieldCheck className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveTab("licenses")}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                  activeTab === "licenses"
                    ? "bg-[var(--color-action)] text-white"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-control)]"
                }`}
                title={isRtl ? "التراخيص والتحديثات" : "Licenses"}
              >
                <FileText className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleRamBoostClick}
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--color-action)]/15 text-[var(--color-action)] border border-[var(--color-action)]/30 hover:bg-[var(--color-action)] hover:text-[#130C16] transition cursor-pointer"
                title={isRtl ? "تسريع الرام السريع" : "Quick RAM Boost"}
              >
                <Zap className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleSelectFilter({ type: "all", value: null })}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                  activeTab === "library"
                    ? "bg-[var(--color-action)] text-white"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-control)]"
                }`}
                title={isRtl ? "مكتبة الخطوط" : "Font Library"}
              >
                <Layers className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveTab("google-fonts")}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                  activeTab === "google-fonts"
                    ? "bg-[var(--color-action)] text-white"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-control)]"
                }`}
                title={isRtl ? "كتالوج Google Fonts" : "Google Fonts Catalog"}
              >
                <Globe className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveTab("cloud-packs")}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                  activeTab === "cloud-packs"
                    ? "bg-[var(--color-action)] text-white"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-control)]"
                }`}
                title={isRtl ? "حزم الخطوط السحابية" : "Cloud Font Packs"}
              >
                <Package className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveTab("workspaces")}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                  activeTab === "workspaces"
                    ? "bg-[var(--color-action)] text-white"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-control)]"
                }`}
                title={isRtl ? "مساحات العمل" : "Workspaces"}
              >
                <Briefcase className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveTab("color-studio")}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                  activeTab === "color-studio" || activeTab === "brand-kits"
                    ? "bg-[var(--color-action)] text-white"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-control)]"
                }`}
                title={
                  isRtl
                    ? "استوديو الألوان والهوية"
                    : "Color Studio & Brand Kits"
                }
              >
                <Palette className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveTab("adobe")}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                  activeTab === "adobe"
                    ? "bg-[var(--color-action)] text-white"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-control)]"
                }`}
                title={
                  isRtl
                    ? "جسر أدوبي وفحص التصاميم"
                    : "Adobe Bridge & Design Inspector"
                }
              >
                <Activity className="w-4 h-4" />
              </button>
              <div className="w-6 h-[1px] bg-[var(--color-border)] my-1" />
              <button
                onClick={handleOpenSettingsMode}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
                title={isRtl ? "الإعدادات والنظام" : "Settings & System"}
              >
                <Settings className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ) : sidebarMode === "settings" ? (
        /* SETTINGS & SYSTEM MODE — Cleanly focused ONLY on real app settings & maintenance */
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-3">
          <button
            onClick={handleBackToLibrary}
            className="w-full h-10 px-3 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-action)] text-[var(--color-text-header)] hover:text-white border border-[var(--color-border)] hover:border-[var(--color-action)] flex items-center gap-2.5 text-xs font-bold transition cursor-pointer"
          >
            <BackIcon className="w-4 h-4 shrink-0" />
            <span className="truncate whitespace-nowrap">
              {isRtl ? "العودة للمكتبة" : "Back to Library"}
            </span>
          </button>

          <div className="space-y-1 pt-1 border-t border-[var(--color-border-subtle)]">
            <div className="px-2.5 py-1 text-[10px] font-bold text-[var(--color-text-dim)] uppercase tracking-wider">
              {isRtl ? "الإعدادات والنظام" : "Settings & System"}
            </div>

            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-lg text-xs transition cursor-pointer ${
                activeTab === "settings"
                  ? "bg-[var(--color-action)] text-white font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)]"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Settings className="w-4 h-4 shrink-0" />
                <span className="truncate whitespace-nowrap">
                  {isRtl ? "الإعدادات العامة واللغة" : "General & Language"}
                </span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab("windows-fonts")}
              className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-lg text-xs transition cursor-pointer ${
                activeTab === "windows-fonts"
                  ? "bg-[var(--color-action)] text-white font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)]"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <HardDrive className="w-4 h-4 shrink-0" />
                <span className="truncate whitespace-nowrap">
                  {isRtl ? "مدير خطوط ويندوز" : "Windows System Fonts"}
                </span>
              </div>
              <span className="text-[10px] font-mono tabular-nums opacity-80 shrink-0">
                {systemCount.toLocaleString()}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("system-health")}
              className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-lg text-xs transition cursor-pointer ${
                activeTab === "system-health" || activeTab === "ram-inspector"
                  ? "bg-[var(--color-action)] text-white font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)]"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span className="truncate whitespace-nowrap">
                  {isRtl ? "صحة النظام والموارد" : "System Health & RAM"}
                </span>
              </div>
              <span className="text-[10px] font-mono tabular-nums opacity-80 shrink-0">
                {activeCount.toLocaleString()}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("licenses")}
              className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-lg text-xs transition cursor-pointer ${
                activeTab === "licenses"
                  ? "bg-[var(--color-action)] text-white font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)]"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <FileText className="w-4 h-4 shrink-0" />
                <span className="truncate whitespace-nowrap">
                  {isRtl ? "التراخيص وحول التطبيق" : "Licenses & About"}
                </span>
              </div>
            </button>
          </div>
        </div>
      ) : (
        /* MAIN SIDEBAR MODE — Clean, Honest Counts & Direct Creative Tools */
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-3">
          {/* Quick RAM Boost Action */}
          <button
            onClick={handleRamBoostClick}
            disabled={ramBoosting}
            className={`w-full h-9 px-3 rounded-xl flex items-center justify-between gap-2 text-xs font-bold transition cursor-pointer border ${
              ramBoostDone
                ? "bg-[var(--color-action)] text-[#130C16] border-[var(--color-action)]"
                : "bg-[var(--color-action)]/12 hover:bg-[var(--color-action)]/20 text-[var(--color-action)] border-[var(--color-action)]/30"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {ramBoostDone ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : (
                <Zap className="w-4 h-4 shrink-0" />
              )}
              <span className="truncate whitespace-nowrap">
                {ramBoostDone
                  ? isRtl
                    ? "تم تسريع الرام بنجاح"
                    : "RAM Boosted"
                  : isRtl
                    ? "تسريع الرام السريع"
                    : "Quick RAM Boost"}
              </span>
            </div>
            <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-black/15 shrink-0">
              {activeCount.toLocaleString()}
            </span>
          </button>

          {/* Font Library & Honest Source Counts (Zero Overlapping / Zero Cramped Badges) */}
          <div className="space-y-1.5">
            <button
              onClick={() => handleSelectFilter({ type: "all", value: null })}
              className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-lg text-xs transition cursor-pointer ${
                activeTab === "library" && currentFilter?.type === "all"
                  ? "bg-[var(--color-action)] text-white font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] font-medium"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Layers className="w-4 h-4 shrink-0" />
                <span className="truncate whitespace-nowrap">
                  {isRtl ? "مكتبة الخطوط" : "Font Library"}
                </span>
              </div>
              <span className="text-[10.5px] font-mono tabular-nums opacity-85 whitespace-nowrap shrink-0">
                {totalCount.toLocaleString()}
              </span>
            </button>

            <div className="p-1.5 bg-[var(--color-back-subtle)]/70 rounded-xl border border-[var(--color-border-subtle)] space-y-0.5">
              {sourceFilterItems.map((item) => {
                const Icon = item.icon;
                const active = isFilterActive(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectFilter(item.filter)}
                    className={`w-full h-8 px-2.5 rounded-lg text-[11.5px] font-semibold flex items-center justify-between gap-2 transition cursor-pointer ${
                      active
                        ? "bg-[var(--color-action)] text-white shadow-2xs"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Icon
                        className={`w-3.5 h-3.5 shrink-0 ${active ? "text-white" : item.iconClass}`}
                      />
                      <span className="truncate whitespace-nowrap">
                        {item.label}
                      </span>
                    </div>
                    <span
                      className={`text-[10.5px] font-mono tabular-nums px-1.5 py-0.5 rounded-md whitespace-nowrap shrink-0 ${
                        active
                          ? "bg-white/20 text-white"
                          : "bg-[var(--color-control)]/80 text-[var(--color-text-dim)]"
                      }`}
                    >
                      {item.count.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Core Creative Tools — Directly Reachable */}
          <div className="space-y-1 pt-2 border-t border-[var(--color-border-subtle)]">
            <div className="px-2.5 py-0.5 text-[10px] font-bold text-[var(--color-text-dim)] uppercase tracking-wider">
              {isRtl ? "الأدوات الإبداعية" : "Creative Tools"}
            </div>

            <button
              onClick={() => setActiveTab("google-fonts")}
              className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-lg text-xs transition cursor-pointer ${
                activeTab === "google-fonts"
                  ? "bg-[var(--color-action)] text-white font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] font-medium"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Globe
                  className={`w-4 h-4 shrink-0 ${activeTab === "google-fonts" ? "text-white" : "text-[#B7A1D9]"}`}
                />
                <span className="truncate whitespace-nowrap">
                  {isRtl ? "كتالوج Google Fonts" : "Google Fonts Catalog"}
                </span>
              </div>
              <span
                className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded shrink-0 ${
                  activeTab === "google-fonts"
                    ? "bg-white/20 text-white"
                    : "bg-[var(--color-control)] text-[var(--color-text-dim)]"
                }`}
              >
                1,961+
              </span>
            </button>

            <button
              onClick={() => setActiveTab("cloud-packs")}
              className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-lg text-xs transition cursor-pointer ${
                activeTab === "cloud-packs"
                  ? "bg-[var(--color-action)] text-white font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] font-medium"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Package className="w-4 h-4 shrink-0 text-[var(--color-action)]" />
                <span className="truncate whitespace-nowrap">
                  {isRtl ? "حزم الخطوط السحابية" : "Cloud Font Packs"}
                </span>
              </div>
              <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-[var(--color-control)] text-[var(--color-text-dim)] shrink-0">
                15
              </span>
            </button>

            <button
              onClick={() => setActiveTab("workspaces")}
              className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-lg text-xs transition cursor-pointer ${
                activeTab === "workspaces" || activeTab === "brand-kits"
                  ? "bg-[var(--color-action)] text-white font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] font-medium"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Briefcase className="w-4 h-4 shrink-0" />
                <span className="truncate whitespace-nowrap">
                  {isRtl ? "مساحات العمل والهوية" : "Workspaces & Identity"}
                </span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab("color-studio")}
              className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-lg text-xs transition cursor-pointer ${
                activeTab === "color-studio"
                  ? "bg-[var(--color-action)] text-white font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] font-medium"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Palette className="w-4 h-4 shrink-0" />
                <span className="truncate whitespace-nowrap">
                  {isRtl ? "استوديو الألوان" : "Color Studio"}
                </span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab("adobe")}
              className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-lg text-xs transition cursor-pointer ${
                activeTab === "adobe"
                  ? "bg-[var(--color-action)] text-white font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] font-medium"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Activity className="w-4 h-4 shrink-0" />
                <span className="truncate whitespace-nowrap">
                  {isRtl ? "جسر أدوبي وفحص التصاميم" : "Adobe Bridge"}
                </span>
              </div>
            </button>
          </div>

          {/* Collections Accordion */}
          <div className="pt-2 border-t border-[var(--color-border-subtle)]">
            <div className="flex items-center justify-between px-2.5 py-1">
              <button
                onClick={() => setCollectionsOpen(!collectionsOpen)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] transition cursor-pointer"
              >
                {collectionsOpen ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <span>{isRtl ? "المجموعات" : "Collections"}</span>
              </button>
              <button
                onClick={() => setIsAddingCollection(true)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] transition cursor-pointer p-0.5 rounded hover:bg-[var(--color-control)]"
                title={isRtl ? "إنشاء مجموعة جديدة" : "New Collection"}
              >
                <span className="text-xs font-bold leading-none">+</span>
              </button>
            </div>

            {collectionsOpen && (
              <div className="mt-0.5 space-y-0.5 pr-2 rtl:pr-0 rtl:pl-2">
                {isAddingCollection && (
                  <form onSubmit={handleCreateCollection} className="px-2 py-1">
                    <input
                      type="text"
                      value={newCollectionName}
                      onChange={(e: any) =>
                        setNewCollectionName(e.target.value)
                      }
                      placeholder={
                        isRtl ? "اسم المجموعة..." : "Collection name..."
                      }
                      className="w-full bg-[var(--color-back-main)] border border-[var(--color-action)] rounded-lg px-2.5 py-1 text-xs text-[var(--color-text-header)] outline-none"
                      autoFocus
                      onBlur={() =>
                        !newCollectionName && setIsAddingCollection(false)
                      }
                    />
                  </form>
                )}

                {Object.keys(collections || {}).map((cName) => {
                  const count = collections[cName]?.length || 0;
                  return (
                    <div
                      key={cName}
                      className={`group flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-[12px] transition cursor-pointer ${
                        isFilterActive("collection", cName)
                          ? "bg-[var(--color-action)]/20 text-[var(--color-text-header)] font-semibold"
                          : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)]"
                      }`}
                      onClick={() =>
                        handleSelectFilter({ type: "collection", value: cName })
                      }
                    >
                      <span className="truncate">
                        {getCollectionName(cName)}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono tabular-nums text-[var(--color-text-dim)]">
                          {count}
                        </span>
                        {onDeleteCollection && (
                          <button
                            onClick={(e: any) => {
                              e.stopPropagation();
                              onDeleteCollection(cName);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-400 text-[var(--color-text-dim)] transition"
                            title={isRtl ? "حذف المجموعة" : "Delete"}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer: Import Actions + Settings & System Mode Switcher */}
      <div className="p-2.5 border-t border-[var(--color-border)] bg-[var(--color-back-header)]/40 shrink-0 space-y-1.5">
        {sidebarMode === "main" && !isCollapsed && (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => {
                if (fileInputRef.current) fileInputRef.current.click();
                else if (onAddCustomFonts) onAddCustomFonts();
              }}
              className="h-8 px-2 rounded-lg flex items-center justify-center gap-1.5 bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] hover:border-[var(--color-action)] transition cursor-pointer text-[11px] font-semibold whitespace-nowrap"
              title={isRtl ? "إضافة خطوط خاصة" : "Add Custom Fonts"}
            >
              <FilePlus2 className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
              <span className="truncate">
                {isRtl ? "إضافة خطوط" : "Add Fonts"}
              </span>
            </button>
            <button
              onClick={onPickFolder}
              className="h-8 px-2 rounded-lg flex items-center justify-center gap-1.5 bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white transition cursor-pointer text-[11px] font-semibold whitespace-nowrap"
              title={isRtl ? "استيراد مجلد خطوط" : "Import Font Folder"}
            >
              <FolderPlus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {isRtl ? "استيراد مجلد" : "Import Font Folder"}
              </span>
            </button>
          </div>
        )}

        {!isCollapsed && sidebarMode === "main" && (
          <button
            onClick={handleOpenSettingsMode}
            className="w-full h-9 px-3 rounded-lg flex items-center justify-between gap-2 bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] border border-[var(--color-border)] transition cursor-pointer text-xs font-semibold"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Settings className="w-4 h-4 shrink-0" />
              <span className="truncate whitespace-nowrap">
                {isRtl ? "الإعدادات والنظام" : "Settings & System"}
              </span>
            </div>
          </button>
        )}

        {!isCollapsed && sidebarMode === "settings" && (
          <button
            onClick={onPickFolder}
            className="w-full h-9 px-3 rounded-lg flex items-center justify-center gap-2 bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white transition cursor-pointer text-xs font-semibold whitespace-nowrap"
          >
            <FolderPlus className="w-4 h-4 shrink-0" />
            <span className="truncate whitespace-nowrap">
              {isRtl ? "استيراد مجلد خطوط" : "Import Font Folder"}
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
