import React from "react";
import { Minus, Square, X } from "lucide-react";
import { FontSortBy } from "../../types/font";
import { NetworkStatus } from "../../types/system";
import { TranslationDictionary } from "../../i18n/locales";

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
  sendWindowEvent,
  setActiveTab,
  t = {},
}: HeaderBarProps) {
  return (
    <header
      onMouseDown={onHeaderMouseDown}
      onDoubleClick={onHeaderDoubleClick}
      className="h-14 flex items-center justify-between gap-2 px-3.5 select-none z-30 shrink-0 bg-[var(--color-back-header)] border-b border-[var(--color-border)] transition-colors cursor-default"
    >
      {/* Left: Fontivo Brand Identity Mark + Title */}
      <div className="flex items-center gap-2 shrink-0 min-w-0">
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
      </div>

      {/* Right: Window Controls */}
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
    </header>
  );
}
