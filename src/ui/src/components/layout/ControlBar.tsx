import {
  Menu,
  Layers,
  Compass,
  ShieldCheck,
  Zap,
  MoreVertical,
  Briefcase,
} from "lucide-react";
import { SUPPORTED_LANGUAGES, TranslationDictionary } from "../../i18n/locales";

export interface ControlBarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentLanguage: string;
  setLanguage: (lang: string) => void;
  t?: TranslationDictionary | Record<string, string>;
}

export default function ControlBar({
  activeTab,
  setActiveTab,
  currentLanguage,
  setLanguage,
  t = {},
}: ControlBarProps) {
  const safeT = t || {};
  const tabs = [
    {
      id: "organize",
      icon: Menu,
      label: safeT.tabOrganize || safeT.organizers || "Organize",
    },
    {
      id: "workspaces",
      icon: Briefcase,
      label: safeT.tabWorkspaces || "Workspaces & Identity",
    },
    {
      id: "playground",
      icon: Layers,
      label: safeT.tabPlayground || "Playground",
    },
    { id: "discover", icon: Compass, label: safeT.tabDiscover || "Discover" },
    {
      id: "licenses",
      icon: ShieldCheck,
      label: safeT.tabLicenses || "Licenses",
    },
    {
      id: "adobe",
      icon: Zap,
      label: safeT.tabAdobe || "Adobe CC",
      hasDot: true,
    },
    {
      id: "settings",
      icon: MoreVertical,
      label: safeT.tabSettings || safeT.settings || "Settings",
    },
  ];

  const currentLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === currentLanguage) ||
    SUPPORTED_LANGUAGES[0];

  const cycleLanguage = () => {
    const nextLang = currentLanguage === "en" ? "ar" : "en";
    setLanguage(nextLang);
  };

  return (
    <nav className="w-[52px] h-full bg-[var(--color-back-header)] border-r rtl:border-r-0 rtl:border-l border-[var(--color-border)] flex flex-col justify-between items-center py-3 select-none shrink-0 z-30 transition-colors">
      {/* Top Main Navigation Tabs */}
      <div className="flex flex-col items-center gap-2 w-full">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer group ${
                isActive
                  ? "text-white bg-[var(--color-action)] shadow-md shadow-[var(--color-action)]/30"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)]"
              }`}
              title={tab.label}
            >
              <Icon className="w-4 h-4" />

              {/* Active green dot or Adobe indicator */}
              {tab.hasDot && (
                <span
                  className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[var(--color-green)] shadow-[0_0_6px_var(--color-green)]"
                  title="Adobe Bridge Active"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Language Switcher */}
      <div className="flex flex-col items-center gap-2 shrink-0">
        <button
          onClick={cycleLanguage}
          className="h-8 px-2 rounded-lg text-[11px] font-mono font-bold text-[var(--color-text-header)] bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] transition cursor-pointer border border-[var(--color-border)] shadow-xs whitespace-nowrap shrink-0"
          title={`Language: ${currentLangObj.name} (Click to toggle)`}
        >
          {currentLanguage.toUpperCase()}
        </button>
      </div>
    </nav>
  );
}
