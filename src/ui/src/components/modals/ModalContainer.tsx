import React from "react";
import {
  FontDetailModal,
  FontCompareModal,
  BatchLibraryModal,
  GetMoreFeaturesModal,
  SuperSearchModal,
  HelpModal,
  AboutDeveloperModal,
  UpdaterModal,
  RamCleanerModal,
  WindowsFontResetModal,
  GitHubPackModal,
  ColorPaletteModal,
  UiTypographyLabModal,
} from "./index";

export default function ModalContainer({
  isFeaturesModalOpen,
  setIsFeaturesModalOpen,
  isSuperSearchOpen,
  setIsSuperSearchOpen,
  onApplySuperSearch,
  isHelpOpen,
  setIsHelpOpen,
  isAboutDevOpen,
  setIsAboutDevOpen,
  isUpdaterOpen,
  setIsUpdaterOpen,
  isRamCleanerOpen,
  setIsRamCleanerOpen,
  isWindowsResetOpen,
  setIsWindowsResetOpen,
  isGitHubPackOpen,
  setIsGitHubPackOpen,
  onRefreshLibrary,
  isColorPaletteOpen,
  setIsColorPaletteOpen,
  onApplyPaletteToCanvas,
  isUiLabOpen,
  setIsUiLabOpen,
  fonts,
  detailFont,
  setDetailFont,
  isCompareOpen,
  setIsCompareOpen,
  compareFonts,
  setCompareFonts,
  isBatchLibraryOpen,
  setIsBatchLibraryOpen,
  stats,
  handleToggleActive,
  handleToggleFavorite,
  t,
  isRtl,
}: any) {
  React.useEffect(() => {
    const handleOpenPack = () => {
      if (setIsGitHubPackOpen) setIsGitHubPackOpen(true);
    };
    const handleOpenAboutDev = () => {
      if (setIsAboutDevOpen) setIsAboutDevOpen(true);
    };
    const handleOpenUpdater = () => {
      if (setIsUpdaterOpen) setIsUpdaterOpen(true);
    };

    window.addEventListener("fontivo:open-github-pack", handleOpenPack);
    window.addEventListener("fontivo:open-about-dev", handleOpenAboutDev);
    window.addEventListener("fontivo:open-updater", handleOpenUpdater);

    return () => {
      window.removeEventListener("fontivo:open-github-pack", handleOpenPack);
      window.removeEventListener("fontivo:open-about-dev", handleOpenAboutDev);
      window.removeEventListener("fontivo:open-updater", handleOpenUpdater);
    };
  }, [setIsGitHubPackOpen, setIsAboutDevOpen, setIsUpdaterOpen]);

  return (
    <>
      <GetMoreFeaturesModal
        isOpen={isFeaturesModalOpen}
        onClose={() => setIsFeaturesModalOpen(false)}
        t={t}
        isRtl={isRtl}
      />

      <SuperSearchModal
        isOpen={isSuperSearchOpen}
        onClose={() => setIsSuperSearchOpen(false)}
        onApplyFilter={onApplySuperSearch}
        t={t}
        isRtl={isRtl}
      />

      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        t={t}
        isRtl={isRtl}
      />

      <AboutDeveloperModal
        isOpen={isAboutDevOpen}
        onClose={() => setIsAboutDevOpen(false)}
        t={t}
        isRtl={isRtl}
      />

      <UpdaterModal
        isOpen={isUpdaterOpen}
        onClose={() => setIsUpdaterOpen(false)}
        t={t}
        isRtl={isRtl}
      />

      <RamCleanerModal
        isOpen={isRamCleanerOpen}
        onClose={() => setIsRamCleanerOpen(false)}
        t={t}
        isRtl={isRtl}
      />

      <WindowsFontResetModal
        isOpen={isWindowsResetOpen}
        onClose={() => setIsWindowsResetOpen(false)}
        t={t}
        isRtl={isRtl}
      />

      <GitHubPackModal
        isOpen={isGitHubPackOpen}
        onClose={() => setIsGitHubPackOpen(false)}
        onRefresh={onRefreshLibrary}
        t={t}
        isRtl={isRtl}
      />

      <ColorPaletteModal
        isOpen={isColorPaletteOpen}
        onClose={() => setIsColorPaletteOpen(false)}
        onApplyToCanvas={onApplyPaletteToCanvas}
        t={t}
        isRtl={isRtl}
      />

      <UiTypographyLabModal
        isOpen={isUiLabOpen}
        onClose={() => setIsUiLabOpen(false)}
        fonts={fonts}
        activeFont={fonts[0]}
        t={t}
        isRtl={isRtl}
      />

      {detailFont && (
        <FontDetailModal
          font={detailFont}
          onClose={() => setDetailFont(null)}
          onToggleActive={handleToggleActive}
          onToggleFavorite={handleToggleFavorite}
          t={t}
        />
      )}

      {isCompareOpen && (
        <FontCompareModal
          compareFonts={compareFonts}
          onClose={() => setIsCompareOpen(false)}
          onRemoveFont={(id) =>
            setCompareFonts((prev) => prev.filter((f) => f.id !== id))
          }
          onClearAll={() => setCompareFonts([])}
          onToggleActive={handleToggleActive}
          onToggleFavorite={handleToggleFavorite}
          t={t}
          isRtl={isRtl}
        />
      )}

      {isBatchLibraryOpen && (
        <BatchLibraryModal
          isOpen={isBatchLibraryOpen}
          onClose={() => setIsBatchLibraryOpen(false)}
          stats={stats}
          fonts={fonts}
          onRefresh={onRefreshLibrary}
          t={t}
          isRtl={isRtl}
        />
      )}
    </>
  );
}
