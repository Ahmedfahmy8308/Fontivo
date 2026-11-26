import React from "react";
import { FontItem, FontFamily } from "../types/font";
import { safeFetchJson } from "../utils/safeFetch";

const API_BASE = "/api";

export interface UseFontActivationProps {
  setFonts: React.Dispatch<React.SetStateAction<FontItem[]>>;
  setFamilies: React.Dispatch<React.SetStateAction<FontFamily[]>>;
  fetchStats: () => Promise<void> | void;
  fetchCollections?: () => Promise<void> | void;
}

export function useFontActivation({
  setFonts,
  setFamilies,
  fetchStats,
  fetchCollections,
}: UseFontActivationProps) {
  const handleToggleActive = async (
    id: string | number,
    currentStatus?: boolean,
  ) => {
    const nextStatus = !currentStatus;

    // Instant optimistic update in RAM toggle
    setFonts((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, isActive: nextStatus, active: nextStatus } : f,
      ),
    );
    setFamilies((prev) =>
      prev.map((fam) => {
        const hasFont = fam.fonts.some((f) => f.id === id);
        if (!hasFont) return fam;
        const updated = fam.fonts.map((f) =>
          f.id === id ? { ...f, isActive: nextStatus, active: nextStatus } : f,
        );
        const activeCount = updated.filter(
          (f) => f.isActive || f.active,
        ).length;
        return {
          ...fam,
          fonts: updated,
          isActive: activeCount > 0,
          isAllActive: activeCount === updated.length,
        };
      }),
    );

    const endpoint = currentStatus
      ? `${API_BASE}/deactivate`
      : `${API_BASE}/activate`;
    const data = await safeFetchJson<any>(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      timeoutMs: 6000,
    });
    if (data && data.isSystem) {
      // Revert optimistic update if backend rejects toggling a Windows system font
      setFonts((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                isActive: Boolean(currentStatus),
                active: Boolean(currentStatus),
              }
            : f,
        ),
      );
      return;
    }
    if (data && data.success) {
      fetchStats();
    }
  };

  const handleActivateFolder = async (folderPath: string) => {
    const data = await safeFetchJson<any>(`${API_BASE}/activate-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: folderPath }),
      timeoutMs: 15000,
    });
    if (data && data.success) {
      fetchStats();
    }
    return data;
  };

  const handleDeactivateFolder = async (folderPath: string) => {
    const data = await safeFetchJson<any>(`${API_BASE}/deactivate-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: folderPath }),
      timeoutMs: 15000,
    });
    if (data) {
      fetchStats();
    }
    return data;
  };

  const handleActivateFamily = async (familyName: string) => {
    setFamilies((prev) =>
      prev.map((fam) => {
        if (fam.family === familyName) {
          const updated = fam.fonts.map((f) => ({
            ...f,
            isActive: true,
            active: true,
          }));
          return { ...fam, fonts: updated, isActive: true, isAllActive: true };
        }
        return fam;
      }),
    );
    setFonts((prev) =>
      prev.map((f) =>
        f.family === familyName ? { ...f, isActive: true, active: true } : f,
      ),
    );

    const data = await safeFetchJson<any>(`${API_BASE}/activate-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ family: familyName }),
      timeoutMs: 6000,
    });
    if (data && data.success) {
      fetchStats();
    }
  };

  const handleDeactivateFamily = async (familyName: string) => {
    setFamilies((prev) =>
      prev.map((fam) => {
        if (fam.family === familyName) {
          const updated = fam.fonts.map((f) => ({
            ...f,
            isActive: false,
            active: false,
          }));
          return {
            ...fam,
            fonts: updated,
            isActive: false,
            isAllActive: false,
          };
        }
        return fam;
      }),
    );
    setFonts((prev) =>
      prev.map((f) =>
        f.family === familyName ? { ...f, isActive: false, active: false } : f,
      ),
    );

    const data = await safeFetchJson<any>(`${API_BASE}/deactivate-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ family: familyName }),
      timeoutMs: 6000,
    });
    if (data && data.success) {
      fetchStats();
    }
  };

  const handleToggleFavorite = async (fontOrId: FontItem | string | number) => {
    const id =
      typeof fontOrId === "object" && fontOrId !== null
        ? fontOrId.id
        : fontOrId;
    const currentFav =
      typeof fontOrId === "object" && fontOrId !== null
        ? Boolean(fontOrId.isFavorite || fontOrId.favorite)
        : undefined;

    // Optimistic update
    setFonts((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const nextFav =
          currentFav !== undefined
            ? !currentFav
            : !Boolean(f.isFavorite || f.favorite);
        return { ...f, isFavorite: nextFav, favorite: nextFav };
      }),
    );
    setFamilies((prev) =>
      prev.map((fam) => {
        const hasFont = fam.fonts.some((f) => f.id === id);
        if (!hasFont) return fam;
        const updatedFonts = fam.fonts.map((f) => {
          if (f.id !== id) return f;
          const nextFav =
            currentFav !== undefined
              ? !currentFav
              : !Boolean(f.isFavorite || f.favorite);
          return { ...f, isFavorite: nextFav, favorite: nextFav };
        });
        const anyFav = updatedFonts.some((f) => f.isFavorite || f.favorite);
        return { ...fam, fonts: updatedFonts, isFavorite: anyFav };
      }),
    );

    // Call POST /api/favorite (with fallback to /api/toggle-favorite)
    let data = await safeFetchJson<any>(`${API_BASE}/favorite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      timeoutMs: 5000,
    });

    if (!data || data.error) {
      data = await safeFetchJson<any>(`${API_BASE}/toggle-favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
        timeoutMs: 5000,
      });
    }

    if (data && typeof data.isFavorite === "boolean") {
      const serverFav = data.isFavorite;
      setFonts((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, isFavorite: serverFav, favorite: serverFav }
            : f,
        ),
      );
      setFamilies((prev) =>
        prev.map((fam) => {
          const hasFont = fam.fonts.some((f) => f.id === id);
          if (!hasFont) return fam;
          const updatedFonts = fam.fonts.map((f) =>
            f.id === id
              ? { ...f, isFavorite: serverFav, favorite: serverFav }
              : f,
          );
          return { ...fam, fonts: updatedFonts, isFavorite: serverFav };
        }),
      );
      fetchStats();
    }
  };

  const handleDeleteFont = async (
    target: FontItem | FontFamily | string | number,
    options?: { skipConfirm?: boolean; isRtl?: boolean },
  ): Promise<boolean> => {
    const _isRtl = options?.isRtl ?? false;
    const isFamilyObj =
      typeof target === "object" &&
      target !== null &&
      "fonts" in target &&
      Array.isArray(target.fonts);
    const isFontObj =
      typeof target === "object" && target !== null && !isFamilyObj;

    const id = isFontObj
      ? (target as FontItem).id
      : isFamilyObj
        ? (target as FontFamily).fonts[0]?.id
        : target;
    const familyName = isFamilyObj
      ? (target as FontFamily).family
      : isFontObj
        ? (target as FontItem).family
        : undefined;
    const _displayName = isFamilyObj
      ? (target as FontFamily).family
      : isFontObj
        ? ((target as FontItem).displayName as string) ||
          (target as FontItem).name
        : String(target);

    if (isFamilyObj && familyName) {
      setFamilies((prev) => prev.filter((fam) => fam.family !== familyName));
      setFonts((prev) => prev.filter((f) => f.family !== familyName));
      await safeFetchJson<any>(`${API_BASE}/fonts/delete-family`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          family: familyName,
        }),
        timeoutMs: 8000,
      });
    } else {
      setFonts((prev) => prev.filter((f) => f.id !== id));
      setFamilies((prev) =>
        prev
          .map((fam) => {
            const hasFont = fam.fonts.some((f) => f.id === id);
            if (!hasFont) return fam;
            const remaining = fam.fonts.filter((f) => f.id !== id);
            return {
              ...fam,
              count: remaining.length,
              fonts: remaining,
            };
          })
          .filter((fam) => fam.fonts.length > 0),
      );

      await safeFetchJson<any>(`${API_BASE}/fonts/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          family: familyName,
          path: isFontObj ? (target as FontItem).path : undefined,
        }),
        timeoutMs: 8000,
      });
    }

    fetchStats();
    fetchCollections?.();
    return true;
  };

  const handleDeactivateAll = async () => {
    setFonts((prev) =>
      prev.map((f) => ({ ...f, isActive: false, active: false })),
    );
    setFamilies((prev) =>
      prev.map((fam) => ({
        ...fam,
        isActive: false,
        isAllActive: false,
        fonts: fam.fonts.map((f) => ({ ...f, isActive: false, active: false })),
      })),
    );

    const data = await safeFetchJson<any>(`${API_BASE}/deactivate-all`, {
      method: "POST",
      timeoutMs: 6000,
    });
    if (data && data.success) {
      fetchStats();
    }
  };

  return {
    handleToggleActive,
    handleActivateFamily,
    handleDeactivateFamily,
    handleActivateFolder,
    handleDeactivateFolder,
    handleToggleFavorite,
    handleDeleteFont,
    handleDeactivateAll,
  };
}
