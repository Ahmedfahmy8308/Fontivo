import React from "react";
import {
  Minus,
  Square,
  X,
  Globe,
  Sun,
  Moon,
  Zap,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
} from "lucide-react";
import { FontSortBy } from "../../types/font";
import { NetworkStatus } from "../../types/system";
import { TranslationDictionary } from "../../i18n/locales";
import { openOperationsCenter } from "../../utils/operationsBus";

export interface HeaderBarProps {
  onHeaderMouseDown?: (e: React.MouseEvent) => void;
  onHeaderDoubleClick?: (e: React.MouseEvent) => void;
  searchQuery?: string;
  setSearchQuery: (q: string) => void;
  sortBy?: FontSortBy;
  setSortBy: (sortBy: FontSortBy) => void;
  showSortMenu?: boolean;
  setShowSortMenu: (show: boolean) => void;
  sortRef?: React.RefObject<HTMLDivElement | null>;
  onOpenRamCleaner?: () => void;
  onOpenGitHubPack?: () => void;
  onAddCustomFonts?: (files?: FileList | null) => void;
  onOpenOperations?: () => void;
  ramMb?: number;
  theme?: string;
  toggleTheme?: () => void;
  networkStatus?: NetworkStatus;
  sendWindowEvent?: (action: string) => void;
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  currentLanguage?: string;
  onSetLanguage?: (lang: string) => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  t?: TranslationDictionary | Record<string, string>;
  isRtl?: boolean;
}

export default function HeaderBar({
  onHeaderMouseDown,
  onHeaderDoubleClick,
  searchQuery = "",
  setSearchQuery,
  sortBy = "name-asc",
  setSortBy,
  showSortMenu = false,
  setShowSortMenu,
  sortRef,
  onOpenRamCleaner,
  onOpenGitHubPack,
  onAddCustomFonts,
  onOpenOperations,
  ramMb = 24,
  theme = "dark",
  toggleTheme,
  networkStatus,
  sendWindowEvent,
  activeTab = "library",
  setActiveTab,
  currentLanguage = "ar",
  onSetLanguage,
  isSidebarCollapsed = false,
  onToggleSidebar,
  t = {},
  isRtl = false,
}: HeaderBarProps) {
  const getWorkspaceBreadcrumb = () => {
    switch (activeTab) {
      case "workspaces":
      case "brand-kits":
        return {
          workspace: isRtl ? "المشاريع" : "Projects",
          section: isRtl ? "مساحات العمل والهوية" : "Workspaces & Identity",
        };
      case "library":
        return {
          workspace: isRtl ? "استوديو الخطوط" : "Typography Studio",
          section: isRtl ? "مكتبة الخطوط" : "Font Library",
        };
      case "ui-lab":
        return {
          workspace: isRtl ? "أدوات متقدمة" : "Advanced Tools",
          section: isRtl ? "مختبر الواجهات" : "UI Typography Lab",
        };
      case "inspector":
      case "specimen":
      case "glyphs":
        return {
          workspace: isRtl ? "أدوات متقدمة" : "Advanced Tools",
          section: isRtl ? "فحص المحارف والعينات" : "Glyphs & Specimen",
        };
      case "google-fonts":
        return {
          workspace: isRtl ? "استوديو الخطوط" : "Typography Studio",
          section: isRtl ? "خطوط جوجل السحابية" : "Google Fonts Cloud",
        };
      case "color-studio":
        return {
          workspace: isRtl ? "استوديو الألوان" : "Color Studio",
          section: isRtl ? "استوديو الألوان والهوية" : "Color & Brand Studio",
        };
      case "windows-fonts":
        return {
          workspace: isRtl ? "الإعدادات والنظام" : "Settings & System",
          section: isRtl ? "مدير خطوط ويندوز" : "Windows System Fonts",
        };
      case "ram-inspector":
        return {
          workspace: isRtl ? "الإعدادات والنظام" : "Settings & System",
          section: isRtl ? "مراقب الرام والموارد" : "RAM & Resources",
        };
      case "adobe":
        return {
          workspace: isRtl ? "استوديو التصميم" : "Design Studio",
          section: isRtl
            ? "جسر أدوبي وفحص التصاميم"
            : "Adobe Bridge & Design Inspector",
        };
      case "system-health":
        return {
          workspace: isRtl ? "الإعدادات والنظام" : "Settings & System",
          section: isRtl ? "صحة النظام" : "System Health",
        };
      case "licenses":
        return {
          workspace: isRtl ? "الإعدادات والنظام" : "Settings & System",
          section: isRtl ? "التراخيص والتحديثات" : "Licenses & Updates",
        };
      case "settings":
        return {
          workspace: isRtl ? "الإعدادات والنظام" : "Settings & System",
          section: isRtl ? "الإعدادات العامة واللغة" : "General & Language",
        };
      default:
        return {
          workspace: isRtl ? "استوديو الخطوط" : "Typography Studio",
          section: isRtl ? "مكتبة الخطوط" : "Font Library",
        };
    }
  };

  const breadcrumb = getWorkspaceBreadcrumb();

  const toggleLang = () => {
    if (!onSetLanguage) return;
    onSetLanguage(currentLanguage === "ar" ? "en" : "ar");
  };

  return (
    <header
      onMouseDown={onHeaderMouseDown}
      onDoubleClick={onHeaderDoubleClick}
      className="h-14 flex items-center justify-between gap-2 px-3.5 select-none z-30 shrink-0 bg-[var(--color-back-header)] border-b border-[var(--color-border)] transition-colors cursor-default"
    >
      {/* 1. Left: Brand Logo, Sidebar Toggle & Workspace Breadcrumbs */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0">
        {/* Responsive Sidebar Collapse / Expand Toggle */}
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] border border-transparent hover:border-[var(--color-border)] transition cursor-pointer shrink-0"
            title={
              isSidebarCollapsed
                ? isRtl
                  ? "توسيع الشريط الجانبي"
                  : "Expand Sidebar"
                : isRtl
                  ? "طي الشريط الجانبي"
                  : "Collapse Sidebar"
            }
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4 text-[var(--color-action)]" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        )}

        {/* Fontivo Brand Identity Mark + Name */}
        <div
          onClick={() => setActiveTab && setActiveTab("library")}
          className="flex items-center gap-2 cursor-pointer group shrink-0"
          title="Fontivo — Type. Design. Deliver."
        >
          <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-[var(--color-back-card)] border border-[var(--color-border)] shadow-xs p-1 group-hover:border-[var(--color-action)] transition-colors">
            <img
              src="/fontivo-mark.svg"
              alt="Fontivo"
              className="w-full h-full object-contain"
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                e.currentTarget.src = "/fontivo-icon.svg";
              }}
            />
          </div>
          <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span className="text-sm font-extrabold tracking-tight text-[var(--color-text-header)] font-display whitespace-nowrap">
              {t.appTitle || "Fontivo"}
            </span>
          </div>
        </div>

        {/* Subtle Divider */}
        <span className="w-[1px] h-4 bg-[var(--color-border)] hidden xl:inline-block shrink-0" />

        {/* 3-Workspace Breadcrumb Bar */}
        <div className="hidden xl:flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] font-medium truncate max-w-[220px] whitespace-nowrap">
          <span className="opacity-70 truncate">{breadcrumb.workspace}</span>
          <span className="opacity-40 shrink-0">/</span>
          <span className="text-[var(--color-text-header)] font-semibold truncate">
            {breadcrumb.section}
          </span>
        </div>
      </div>

      {/* 3. Right: Operations Center, System Gauge, Language, Theme & Window Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Live Operations & Downloads Center Trigger */}
        <button
          onClick={() => {
            if (onOpenOperations) onOpenOperations();
            else openOperationsCenter();
          }}
          className="h-8 w-8 rounded-lg flex items-center justify-center bg-[var(--color-control)] border border-[var(--color-border)] hover:border-[var(--color-action)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] transition cursor-pointer shrink-0"
          title={
            isRtl
              ? "نافذة العمليات والتحميل الحية"
              : "Live Operations & Downloads Center"
          }
        >
          <Activity className="w-3.5 h-3.5 text-[var(--color-action)]" />
        </button>

        {/* Quick RAM Gauge Badge */}
        <button
          onClick={() => {
            if (setActiveTab) setActiveTab("system-health");
            else if (onOpenRamCleaner) onOpenRamCleaner();
          }}
          className="h-8 flex items-center gap-1.5 px-2.5 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] hover:border-[var(--color-action)] text-[11px] text-[var(--color-text-header)] font-mono transition cursor-pointer whitespace-nowrap shrink-0"
          title={
            t.ramOptimizer ||
            (isRtl ? "صحة النظام والذاكرة" : "System Health & RAM")
          }
        >
          <Zap className="w-3 h-3 text-[var(--color-action)] shrink-0" />
          <span className="font-bold whitespace-nowrap">{ramMb} MB</span>
        </button>

        {/* Language Switcher Pill */}
        <button
          onClick={toggleLang}
          className="h-8 px-2.5 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] hover:border-[var(--color-action)] text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
          title={isRtl ? "Switch to English" : "التبديل إلى العربية"}
        >
          <Globe className="w-3.5 h-3.5 shrink-0" />
          <span className="whitespace-nowrap">
            {currentLanguage === "ar" ? "عربي" : "EN"}
          </span>
        </button>

        {/* Theme Toggle (Sun / Moon) */}
        {toggleTheme && (
          <button
            onClick={toggleTheme}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer border border-transparent hover:border-[var(--color-border)] shrink-0"
            title={
              theme === "dark"
                ? t.lightMode || "Switch to Light Mode"
                : t.darkMode || "Switch to Dark Mode"
            }
          >
            {theme === "dark" ? (
              <Sun className="w-3.5 h-3.5 text-[#B7A1D9]" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-[var(--color-action)]" />
            )}
          </button>
        )}

        <span className="w-[1px] h-4 bg-[var(--color-border)] mx-0.5 shrink-0" />

        {/* Window Controls */}
        <div className="flex items-center gap-0.5 text-[var(--color-text-muted)] shrink-0">
          <button
            onClick={() => sendWindowEvent && sendWindowEvent("minimize")}
            className="h-8 w-8 flex items-center justify-center hover:bg-[var(--color-control)] hover:text-[var(--color-text-header)] rounded-md transition cursor-pointer shrink-0"
            title={t.minimize || "Minimize"}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => sendWindowEvent && sendWindowEvent("maximize")}
            className="h-8 w-8 flex items-center justify-center hover:bg-[var(--color-control)] hover:text-[var(--color-text-header)] rounded-md transition cursor-pointer shrink-0"
            title={t.maximize || "Maximize"}
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={() => sendWindowEvent && sendWindowEvent("close")}
            className="h-8 w-8 flex items-center justify-center hover:bg-[var(--color-action)] hover:text-[#130C16] rounded-md transition cursor-pointer shrink-0"
            title={t.close || "Close"}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
