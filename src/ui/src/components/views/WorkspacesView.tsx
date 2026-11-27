import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Briefcase,
  Plus,
  Zap,
  Download,
  Copy,
  Check,
  Trash2,
  Layers,
  Palette,
  CheckCircle2,
  Clock,
  Circle,
  FileCode,
  Type,
  FolderOpen,
  FolderPlus,
  FolderSearch,
  RefreshCw,
  FileCheck,
  HardDrive,
  Upload,
  Image as ImageIcon,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Pencil,
  PanelLeftClose,
  PanelLeftOpen,
  Calendar,
  Flag,
  Pin,
  ExternalLink,
  Maximize2,
  Search,
  X,
  Package,
  Archive,
  Wand2,
} from "lucide-react";
import {
  getContrastRatio,
  getWcagRating,
  generateHarmonies,
} from "../../utils/colorUtils";
import { extractPaletteFromImageDataUrl } from "../../utils/logoPaletteExtractor";
import {
  downloadAseFile,
  exportToCssVariables,
  exportToTailwindConfig,
} from "../../utils/aseParser";
import { safeFetch, safeFetchJson } from "../../utils/safeFetch";
import { upsertLiveOperation } from "../../utils/operationsBus";
import type { ColorSwatch } from "../../types/palette";
import type {
  TypographyFontObject,
  Workspace,
  WorkspaceCustomFont,
  WorkspaceDesignFile,
  WorkspaceTask,
  WorkspaceTaskPriority,
} from "../../types/workspace";

export const WORKSPACE_CATEGORIES = [
  {
    id: "Branding & Visual Identity",
    en: "Branding & Visual Identity",
    ar: "الهوية البصرية والعلامات التجارية",
  },
  {
    id: "Design Agency / Studio",
    en: "Design Agency / Studio",
    ar: "استوديو تصميم / وكالة إبداعية",
  },
  {
    id: "Fintech / SaaS",
    en: "Fintech / SaaS",
    ar: "التقنية المالية والبرمجيات (SaaS)",
  },
  {
    id: "Social Media Campaigns",
    en: "Social Media Campaigns",
    ar: "حملات التسويق والسوشيال ميديا",
  },
  {
    id: "Editorial & Publishing",
    en: "Editorial & Publishing",
    ar: "النشر والمجلات والمحتوى التحريري",
  },
  {
    id: "E-Commerce / Retail",
    en: "E-Commerce / Retail",
    ar: "التجارة الإلكترونية والتجزئة",
  },
  {
    id: "Packaging & Print",
    en: "Packaging & Print",
    ar: "التغليف والمطبوعات التجارية",
  },
  {
    id: "Architecture & Real Estate",
    en: "Architecture & Real Estate",
    ar: "العمارة والتطوير العقاري",
  },
  {
    id: "Education & Media",
    en: "Education & Media",
    ar: "التعليم والإعلام الرقمي",
  },
];

export const SWATCH_ROLE_OPTIONS = [
  { id: "primary", en: "Primary", ar: "أساسي" },
  { id: "secondary", en: "Secondary", ar: "مساعد" },
  { id: "accent", en: "Accent", ar: "تمييز" },
  { id: "surface", en: "Surface", ar: "سطح" },
  { id: "background", en: "Background", ar: "خلفية" },
  { id: "text", en: "Text", ar: "نص" },
  { id: "muted", en: "Muted", ar: "محايد" },
] as const;

export const PALETTE_STARTER_PRESETS: Record<
  string,
  { id: string; en: string; ar: string; swatches: ColorSwatch[] }
> = {
  plum: {
    id: "plum",
    en: "Coral & Plum Studio",
    ar: "مرجاني وبنفسجي (Fontivo)",
    swatches: [
      { name: "Primary Coral", hex: "#F16B50", role: "primary" },
      { name: "Secondary Lavender", hex: "#B7A1D9", role: "secondary" },
      { name: "Warm Amber", hex: "#F7B544", role: "accent" },
      { name: "Surface Plum", hex: "#291C2E", role: "surface" },
      { name: "Deep Plum Canvas", hex: "#140D18", role: "background" },
    ],
  },
  gold: {
    id: "gold",
    en: "Luxury Gold & Onyx",
    ar: "ذهبي ملكي وأسود",
    swatches: [
      { name: "Royal Gold Leaf", hex: "#C5A059", role: "primary" },
      { name: "Platinum Slate", hex: "#8E9096", role: "secondary" },
      { name: "Midnight Onyx", hex: "#111215", role: "background" },
      { name: "Chalk Vellum", hex: "#F7F6F2", role: "surface" },
    ],
  },
  fintech: {
    id: "fintech",
    en: "Fintech Cobalt & Mint",
    ar: "أزرق تقني ونعناعي",
    swatches: [
      { name: "Electric Cobalt", hex: "#2563EB", role: "primary" },
      { name: "Success Mint", hex: "#10B981", role: "accent" },
      { name: "Dark Surface", hex: "#0B0F19", role: "background" },
      { name: "Card Slate", hex: "#1F2937", role: "surface" },
    ],
  },
};

const PROTECTED_ROOT_FOLDERS = new Set([
  "fonts",
  "designs",
  "palettes",
  "guidelines",
]);

export function isProtectedRootFolder(folderPath: string): boolean {
  const clean = folderPath.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return PROTECTED_ROOT_FOLDERS.has(clean.toLowerCase());
}

export function localizeWorkspaceCategory(
  raw: string | undefined,
  isRtl: boolean,
): string {
  if (!raw) return isRtl ? "الهوية البصرية" : "Brand System";
  const found = WORKSPACE_CATEGORIES.find(
    (c) =>
      c.id.toLowerCase() === raw.trim().toLowerCase() ||
      c.en.toLowerCase() === raw.trim().toLowerCase(),
  );
  if (found) return isRtl ? found.ar : found.en;
  return raw;
}

export function localizeSwatchRole(
  role: string | undefined,
  isRtl: boolean,
): string {
  const clean = (role || "").trim();
  if (!clean) return isRtl ? "مخصص" : "Custom";
  const found = SWATCH_ROLE_OPTIONS.find(
    (opt) => opt.id.toLowerCase() === clean.toLowerCase(),
  );
  if (found) return isRtl ? found.ar : found.en;
  return clean;
}

export function isStandardSwatchRole(role: string | undefined): boolean {
  const clean = (role || "").trim().toLowerCase();
  return SWATCH_ROLE_OPTIONS.some((opt) => opt.id === clean);
}

export function normalizeHexColor(raw: string, fallback = "#F16B50"): string {
  const trimmed = (raw || "").trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    return withHash.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const [, a, b, c] = withHash;
    return `#${a}${a}${b}${b}${c}${c}`.toUpperCase();
  }
  return fallback.toUpperCase();
}

/**
 * Pure, unit-testable dominant color extractor for HTML5 Canvas RGBA pixel buffers.
 * Quantizes opaque pixels into 4-bit-per-channel buckets, computes centroids,
 * and filters near-duplicates via Euclidean RGB distance.
 */
export function extractPaletteFromImageData(
  data: Uint8ClampedArray,
  maxColors = 5,
): string[] {
  if (!data || data.length < 4 || maxColors <= 0) return [];

  const buckets = new Map<
    number,
    { rSum: number; gSum: number; bSum: number; count: number }
  >();
  const totalPixels = Math.floor(data.length / 4);
  const step = totalPixels > 10000 ? Math.floor(totalPixels / 10000) : 1;

  for (let px = 0; px < totalPixels; px += step) {
    const i = px * 4;
    const a = data[i + 3];
    if (a < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const existing = buckets.get(key);
    if (existing) {
      existing.rSum += r;
      existing.gSum += g;
      existing.bSum += b;
      existing.count += 1;
    } else {
      buckets.set(key, { rSum: r, gSum: g, bSum: b, count: 1 });
    }
  }

  const sorted = Array.from(buckets.values())
    .map((b) => ({
      r: Math.round(b.rSum / b.count),
      g: Math.round(b.gSum / b.count),
      b: Math.round(b.bSum / b.count),
      count: b.count,
    }))
    .sort((a, b) => b.count - a.count);

  const MIN_DIST_SQ = 44 * 44;
  const chosen: Array<{ r: number; g: number; b: number }> = [];

  for (const candidate of sorted) {
    if (chosen.length >= maxColors) break;
    const isNearDuplicate = chosen.some((c) => {
      const dr = c.r - candidate.r;
      const dg = c.g - candidate.g;
      const db = c.b - candidate.b;
      return dr * dr + dg * dg + db * db < MIN_DIST_SQ;
    });
    if (!isNearDuplicate) {
      chosen.push(candidate);
    }
  }

  const toHex = (n: number) =>
    Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0").toUpperCase();
  return chosen.map((c) => `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`);
}

async function extractPaletteFromLogoUrl(
  logoDataUrl: string,
  maxColors = 5,
): Promise<string[]> {
  if (
    !logoDataUrl ||
    typeof document === "undefined" ||
    typeof Image === "undefined"
  ) {
    return [];
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const maxDim = 96;
        const scale = Math.min(
          1,
          maxDim / Math.max(img.width || 1, img.height || 1),
        );
        const w = Math.max(1, Math.round((img.width || maxDim) * scale));
        const h = Math.max(1, Math.round((img.height || maxDim) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve([]);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        resolve(extractPaletteFromImageData(imageData.data, maxColors));
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = logoDataUrl;
  });
}

export function getDeadlineMeta(
  dateStr?: string,
  isDone = false,
  isRtl = false,
): {
  label: string;
  tone: "neutral" | "ok" | "soon" | "overdue";
  formattedDate: string;
} | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return null;
  const trimmed = dateStr.trim();
  const [y, m, d] = trimmed.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (isDone) {
    return { label: trimmed, tone: "neutral", formattedDate: trimmed };
  }
  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      label: isRtl
        ? overdueDays === 1
          ? "متأخر يوم واحد"
          : overdueDays <= 10
            ? `متأخر ${overdueDays} أيام`
            : `متأخر ${overdueDays} يوم`
        : `Overdue ${overdueDays}d`,
      tone: "overdue",
      formattedDate: trimmed,
    };
  }
  if (diffDays === 0) {
    return {
      label: isRtl ? "موعد التسليم اليوم" : "Due Today",
      tone: "soon",
      formattedDate: trimmed,
    };
  }
  if (diffDays <= 3) {
    return {
      label: isRtl
        ? diffDays === 1
          ? "غداً"
          : `متبقي ${diffDays} أيام`
        : diffDays === 1
          ? "Tomorrow"
          : `${diffDays}d left`,
      tone: "soon",
      formattedDate: trimmed,
    };
  }
  return {
    label: isRtl
      ? diffDays <= 10
        ? `متبقي ${diffDays} أيام`
        : `متبقي ${diffDays} يوم`
      : `${diffDays}d left`,
    tone: "ok",
    formattedDate: trimmed,
  };
}

export function buildSyncedProjectFonts(
  roleFonts: TypographyFontObject[],
  existingProjectFonts: TypographyFontObject[] = [],
): TypographyFontObject[] {
  const seen = new Set<string>();
  const result: TypographyFontObject[] = [];

  const pushUnique = (item: TypographyFontObject | undefined | null) => {
    if (!item) return;
    const label = (item.name || item.family || "").trim();
    if (!label && !item.fontId && !item.path) return;
    const key = item.fontId
      ? `id:${item.fontId}`
      : item.path
        ? `path:${item.path.toLowerCase()}`
        : `name:${label.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({
      name: item.name || item.family,
      fontId: item.fontId,
      family: item.family || item.name,
      style: item.style,
      path: item.path,
    });
  };

  for (const f of roleFonts) pushUnique(f);
  for (const f of existingProjectFonts) pushUnique(f);
  return result;
}

export const getFontDisplayName = (font: any): string => {
  if (!font) return "";
  if (typeof font === "string") return font;
  if (typeof font === "object") {
    const base =
      font.name || font.family || (font.fontId ? `Font #${font.fontId}` : "");
    if (
      base &&
      font.style &&
      !base.toLowerCase().includes(String(font.style).toLowerCase())
    ) {
      return `${base} — ${font.style}`;
    }
    return base;
  }
  return String(font);
};

interface ModalFontRoleDraft {
  id: string;
  label: string;
  value: string;
}

interface ModalSwatchDraft {
  id: string;
  name: string;
  hex: string;
  role: string;
}

const getFriendlyFolderLabel = (relFolder: string): string => {
  return relFolder.split("/").pop() || relFolder;
};

const getDesignAssetKey = (design: WorkspaceDesignFile): string =>
  design.relativePath ||
  (design.subfolder ? `${design.subfolder}/${design.name}` : "") ||
  design.path ||
  design.name;

function escapeHtmlAttr(raw: string): string {
  return (raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildClientStyleGuideHtml(ws: Workspace, isRtl: boolean): string {
  const dir = isRtl ? "rtl" : "ltr";
  const swatchesHtml = (ws.palette || [])
    .map(
      (sw) =>
        `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #33293a;border-radius:10px;background:#1e1624;"><span style="width:28px;height:28px;border-radius:8px;background:${escapeHtmlAttr(sw.hex)};border:1px solid rgba(255,255,255,0.15);display:inline-block;"></span><div><div style="font-weight:700;font-size:13px;">${escapeHtmlAttr(sw.name)}</div><div style="font-family:monospace;font-size:12px;color:#b8adc4;" dir="ltr">${escapeHtmlAttr(sw.hex)}</div></div></div>`,
    )
    .join("");
  const heading = getFontDisplayName(ws.typography?.headingFont) || "—";
  const body = getFontDisplayName(ws.typography?.bodyFont) || "—";
  const accent = getFontDisplayName(ws.typography?.accentFont) || "";
  return `<!doctype html><html lang="${isRtl ? "ar" : "en"}" dir="${dir}"><head><meta charset="utf-8"/><title>${escapeHtmlAttr(ws.name)} — StyleGuide</title></head><body style="margin:0;padding:32px;background:#140d18;color:#f4eef8;font-family:system-ui,-apple-system,sans-serif;line-height:1.6;"><div style="max-width:860px;margin:0 auto;"><h1 style="margin:0 0 6px;font-size:26px;">${escapeHtmlAttr(ws.name)}</h1><p style="margin:0 0 24px;color:#b8adc4;font-size:14px;">${escapeHtmlAttr(ws.client || "")} ${ws.category ? `• ${escapeHtmlAttr(ws.category)}` : ""}</p><h2 style="font-size:15px;margin:24px 0 10px;">${isRtl ? "لوحة الألوان" : "Brand Colors"}</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;">${swatchesHtml || `<p style="color:#8b7f99;">${isRtl ? "لا توجد ألوان" : "No swatches"}</p>`}</div><h2 style="font-size:15px;margin:24px 0 10px;">${isRtl ? "الخطوط المعتمدة" : "Brand Typography"}</h2><div style="padding:14px;border:1px solid #33293a;border-radius:12px;background:#1e1624;font-size:13px;"><div><strong>${isRtl ? "العناوين" : "Heading"}:</strong> ${escapeHtmlAttr(heading)}</div><div><strong>${isRtl ? "النصوص" : "Body"}:</strong> ${escapeHtmlAttr(body)}</div>${accent ? `<div><strong>${isRtl ? "التمييز" : "Accent"}:</strong> ${escapeHtmlAttr(accent)}</div>` : ""}</div><h2 style="font-size:15px;margin:24px 0 10px;">${isRtl ? "التوجيه الفني والملاحظات" : "Art Direction & Notes"}</h2><div style="padding:14px;border:1px solid #33293a;border-radius:12px;background:#1e1624;white-space:pre-wrap;font-size:13px;">${escapeHtmlAttr(ws.notes || (isRtl ? "لا توجد ملاحظات" : "No notes yet."))}</div></div></body></html>`;
}

const INITIAL_WORKSPACES: Workspace[] = [
  {
    id: "fontivo-studio-swiss",
    name: "Fontivo Swiss Design System",
    client: "Fontivo Studio International",
    category: "Design Agency / Studio",
    deadline: "2026-12-15",
    folderPath:
      "C:\\Users\\Public\\Documents\\Fontivo\\Workspaces\\fontivo-studio-swiss",
    description:
      "High-precision Swiss typography system and plum ink studio palette for next-gen creative desktop tools.",
    typography: {
      headingFont: "Inter Display / Manrope",
      bodyFont: "Inter / Tajawal",
      accentFont: "JetBrains Mono",
      previewHeading: "Typographic Precision at Scale",
      previewBody:
        "Engineered for seamless digital publishing, tactile editorial layouts, and sub-millisecond OS font streaming.",
    },
    customFonts: [
      {
        id: "cf-social",
        label: "Social Media / Campaigns",
        name: "Tajawal Bold",
        family: "Tajawal",
        style: "Bold",
      },
    ],
    palette: [
      { name: "Fontivo Coral", hex: "#F16B50", role: "primary" },
      { name: "Fontivo Lavender", hex: "#B7A1D9", role: "secondary" },
      { name: "Fontivo Amber", hex: "#F7B544", role: "accent" },
      { name: "Plum Ink Surface", hex: "#291C2E", role: "surface" },
      { name: "Deep Plum Canvas", hex: "#140D18", role: "background" },
    ],
    subfolders: {
      fonts: [
        {
          id: "ws-f1",
          name: "InterDisplay-Bold.otf",
          family: "Inter Display",
          format: "OTF",
          path: "Fonts\\InterDisplay-Bold.otf",
          isActive: true,
        },
        {
          id: "ws-f2",
          name: "Tajawal-Medium.ttf",
          family: "Tajawal",
          format: "TTF",
          path: "Fonts\\Tajawal-Medium.ttf",
          isActive: true,
        },
        {
          id: "ws-f3",
          name: "JetBrainsMono-Regular.ttf",
          family: "JetBrains Mono",
          format: "TTF",
          path: "Fonts\\JetBrainsMono-Regular.ttf",
          isActive: false,
        },
      ],
      designs: [
        {
          name: "Hero-Campaign-2026.psd",
          path: "Designs\\Social\\Hero-Campaign-2026.psd",
          subfolder: "Designs/Social",
          format: "PSD",
          usedFonts: ["Inter Display", "Tajawal"],
          missingFonts: [],
          allActive: true,
        },
        {
          name: "Brand-Identity-System.ai",
          path: "Designs\\Print\\Brand-Identity-System.ai",
          subfolder: "Designs/Print",
          format: "AI",
          usedFonts: ["Inter Display", "JetBrains Mono"],
          missingFonts: ["JetBrains Mono"],
          allActive: false,
        },
        {
          name: "Annual-Report-Layout.indd",
          path: "Designs\\Editorial\\Annual-Report-Layout.indd",
          subfolder: "Designs/Editorial",
          format: "INDD",
          usedFonts: ["Tajawal", "Inter"],
          missingFonts: [],
          allActive: true,
        },
      ],
      palettes: [
        {
          name: "palette.ase",
          path: "Palettes\\palette.ase",
          swatchesCount: 5,
          updatedAt: "2026-11-20",
        },
        {
          name: "tokens.css",
          path: "Palettes\\tokens.css",
          swatchesCount: 5,
          updatedAt: "2026-11-20",
        },
      ],
      guidelines: [
        "Guidelines\\StyleGuide.html",
        "Guidelines\\Brand-Manifesto.pdf",
      ],
    },
    notes:
      "Primary brand guidelines: Keep contrast strictly above WCAG AA (4.5:1). Pair geometric sans-serif headings with high-x-height body typography.",
    tasks: [
      {
        id: "t1",
        text: "Finalize OpenType glyph sets for Latin and Arabic diacritics",
        status: "done",
        priority: "high",
        createdAt: "2026-11-18",
      },
      {
        id: "t2",
        text: "Validate WCAG 2.1 AAA contrast for Coral button states",
        status: "in_progress",
        priority: "high",
        dueDate: "2026-12-01",
        createdAt: "2026-11-19",
      },
      {
        id: "t3",
        text: "Generate Adobe Swatch Exchange (.ASE) export for external art directors",
        status: "todo",
        priority: "medium",
        dueDate: "2026-12-05",
        createdAt: "2026-11-20",
      },
      {
        id: "t4",
        text: "Verify instant font activation with Adobe Photoshop & Illustrator",
        status: "done",
        priority: "low",
        createdAt: "2026-11-20",
      },
    ],
  },
  {
    id: "vogue-editorial-2026",
    name: "Vogue Haute Horlogerie",
    client: "Condé Nast Luxury",
    category: "Editorial & Publishing",
    folderPath:
      "C:\\Users\\Public\\Documents\\Fontivo\\Workspaces\\vogue-editorial-2026",
    description:
      "Bespoke editorial specimen and luxury watch editorial layout with high-contrast display serif typography.",
    typography: {
      headingFont: "Playfair Display / Bodoni MT",
      bodyFont: "Cormorant Garamond",
      accentFont: "Cinzel Decorative",
      previewHeading: "The Architecture of Timeless Precision",
      previewBody:
        "Curated horological perspectives celebrating mechanical craftsmanship and aesthetic discipline.",
    },
    palette: [
      { name: "Royal Gold Leaf", hex: "#C5A059", role: "primary" },
      { name: "Midnight Onyx", hex: "#111215", role: "background" },
      { name: "Platinum Slate", hex: "#8E9096", role: "muted" },
      { name: "Chalk Vellum", hex: "#F7F6F2", role: "surface" },
    ],
    subfolders: {
      fonts: [
        {
          id: "vg-f1",
          name: "PlayfairDisplay-Black.ttf",
          family: "Playfair Display",
          format: "TTF",
          path: "Fonts\\PlayfairDisplay-Black.ttf",
          isActive: true,
        },
        {
          id: "vg-f2",
          name: "CormorantGaramond-Regular.ttf",
          family: "Cormorant Garamond",
          format: "TTF",
          path: "Fonts\\CormorantGaramond-Regular.ttf",
          isActive: false,
        },
      ],
      designs: [
        {
          name: "Cover-Spread-Issue44.indd",
          path: "Designs\\Issue44\\Cover-Spread-Issue44.indd",
          subfolder: "Designs/Issue44",
          format: "INDD",
          usedFonts: ["Playfair Display", "Cormorant Garamond"],
          missingFonts: ["Cormorant Garamond"],
          allActive: false,
        },
      ],
      palettes: [
        {
          name: "palette.ase",
          path: "Palettes\\palette.ase",
          swatchesCount: 4,
          updatedAt: "2026-11-19",
        },
      ],
      guidelines: ["Guidelines\\StyleGuide.html"],
    },
    notes:
      "Editorial issue #44: Use generous line-heights (1.6+) and elegant tabular figures for technical horology specifications.",
    tasks: [
      {
        id: "t1",
        text: "Review ligature sets for Italian and French brand names",
        status: "done",
        priority: "medium",
        createdAt: "2026-11-15",
      },
      {
        id: "t2",
        text: "Color test CMYK separations for coated cover stock",
        status: "in_progress",
        priority: "high",
        createdAt: "2026-11-19",
      },
      {
        id: "t3",
        text: "Export production bundle for prepress team",
        status: "todo",
        priority: "medium",
        createdAt: "2026-11-20",
      },
    ],
  },
  {
    id: "stripe-checkout-fintech",
    name: "Nova Payments Protocol",
    client: "Nova Financial Technologies",
    category: "Fintech / SaaS",
    folderPath:
      "C:\\Users\\Public\\Documents\\Fontivo\\Workspaces\\stripe-checkout-fintech",
    description:
      "Ultra-crisp data-dense dashboard with tabular figures, micro-copy clarity, and strict accessibility standards.",
    typography: {
      headingFont: "SF Pro Display / Geometria",
      bodyFont: "Inter Tight",
      accentFont: "SF Mono / Roboto Mono",
      previewHeading: "Real-Time Global Settlement at Zero Latency",
      previewBody:
        "Process multi-currency transactions across 140 countries with continuous automated compliance checks.",
    },
    palette: [
      { name: "Electric Cobalt", hex: "#2563EB", role: "primary" },
      { name: "Fontivo Lavender", hex: "#B7A1D9", role: "accent" },
      { name: "Dark Surface", hex: "#0B0F19", role: "background" },
      { name: "Card Slate", hex: "#1F2937", role: "surface" },
      { name: "Success Mint", hex: "#10B981", role: "accent" },
    ],
    subfolders: {
      fonts: [
        {
          id: "nv-f1",
          name: "InterTight-SemiBold.ttf",
          family: "Inter Tight",
          format: "TTF",
          path: "Fonts\\InterTight-SemiBold.ttf",
          isActive: true,
        },
      ],
      designs: [
        {
          name: "Checkout-Dashboard.svg",
          path: "Designs\\UI\\Checkout-Dashboard.svg",
          subfolder: "Designs/UI",
          format: "SVG",
          usedFonts: ["Inter Tight", "Roboto Mono"],
          missingFonts: [],
          allActive: true,
        },
      ],
      palettes: [
        {
          name: "palette.ase",
          path: "Palettes\\palette.ase",
          swatchesCount: 5,
          updatedAt: "2026-11-18",
        },
      ],
      guidelines: ["Guidelines\\StyleGuide.html"],
    },
    notes:
      "Strict rule: Tabular numbers (tnum) must be enabled on all financial balance cards and payment input fields.",
    tasks: [
      {
        id: "t1",
        text: "Audit tabular figure spacing in high-frequency trading view",
        status: "done",
        priority: "medium",
        createdAt: "2026-11-16",
      },
      {
        id: "t2",
        text: 'Set up CSS font-feature-settings: "tnum" 1 across billing components',
        status: "done",
        priority: "high",
        createdAt: "2026-11-17",
      },
      {
        id: "t3",
        text: "Verify dark mode token contrast against WCAG AA standards",
        status: "in_progress",
        priority: "high",
        createdAt: "2026-11-19",
      },
    ],
  },
];

export default function WorkspacesView({
  fonts = [],
  onActivateFont,
  onRefreshStats,
  isRtl = false,
  initialModalOpen = false,
}: any) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    try {
      const saved = localStorage.getItem("fontivo_workspaces");
      return saved ? JSON.parse(saved) : INITIAL_WORKSPACES;
    } catch {
      return INITIAL_WORKSPACES;
    }
  });

  const [selectedId, setSelectedId] = useState<string>(
    workspaces[0]?.id || "fontivo-studio-swiss",
  );
  const [activeSubfolderTab, setActiveSubfolderTab] = useState<
    "all" | "Fonts" | "Designs" | "Palettes" | "Guidelines"
  >("all");
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [copiedCodeType, setCopiedCodeType] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [scanningFolder, setScanningFolder] = useState(false);
  const [savingPalette, setSavingPalette] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [extractingLogoPalette, setExtractingLogoPalette] = useState(false);
  const [specimenText, setSpecimenText] = useState("");
  const [specimenSize, setSpecimenSize] = useState(24);
  const [loadedHeadingFamily, setLoadedHeadingFamily] = useState<string | null>(
    null,
  );
  const [loadedBodyFamily, setLoadedBodyFamily] = useState<string | null>(null);
  const [loadedAccentFamily, setLoadedAccentFamily] = useState<string | null>(
    null,
  );
  const [notification, setNotification] = useState<{
    type: string;
    text: string;
  } | null>(null);

  // Tasks & Task Details Modal state
  const [taskFilter, setTaskFilter] = useState("all");
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTaskModalId, setEditingTaskModalId] = useState<string | null>(
    null,
  );
  const [taskModalTitle, setTaskModalTitle] = useState("");
  const [taskModalNotes, setTaskModalNotes] = useState("");
  const [taskModalCategory, setTaskModalCategory] = useState("typography");
  const [taskModalPriority, setTaskModalPriority] =
    useState<WorkspaceTaskPriority>("medium");
  const [taskModalStatus, setTaskModalStatus] = useState<
    "todo" | "in_progress" | "done"
  >("todo");
  const [taskModalDueDate, setTaskModalDueDate] = useState("");
  const [taskModalChecklistText, setTaskModalChecklistText] = useState("");

  // Swatch editor & quick add state
  const [newSwatchHex, setNewSwatchHex] = useState("#F16B50");
  const [newSwatchName, setNewSwatchName] = useState("");
  const [newSwatchRole, setNewSwatchRole] = useState("accent");
  const [newSwatchCustomRole, setNewSwatchCustomRole] = useState("");
  const [editingSwatchIdx, setEditingSwatchIdx] = useState<number | null>(null);
  const [editSwatchName, setEditSwatchName] = useState("");
  const [editSwatchHex, setEditSwatchHex] = useState("#F16B50");
  const [editSwatchRole, setEditSwatchRole] = useState("accent");
  const [editSwatchCustomRole, setEditSwatchCustomRole] = useState("");

  // Modal & layout state
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(
    Boolean(initialModalOpen),
  );
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(
    null,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [ramActiveMap, setRamActiveMap] = useState<Record<string, boolean>>({});
  const [currentFolderPath, setCurrentFolderPath] = useState<string>("Designs");
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [newSubfolderName, setNewSubfolderName] = useState("");
  const [creatingSubfolder, setCreatingSubfolder] = useState(false);
  const [uploadingDesign, setUploadingDesign] = useState(false);
  const [importingDesign, setImportingDesign] = useState(false);
  const [openingStyleGuide, setOpeningStyleGuide] = useState(false);
  const [styleGuidePreviewHtml, setStyleGuidePreviewHtml] = useState<
    string | null
  >(null);
  const [confirmDeleteWsId, setConfirmDeleteWsId] = useState<string | null>(
    null,
  );
  const [lightboxDesign, setLightboxDesign] =
    useState<WorkspaceDesignFile | null>(null);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [fetchedLibraryFonts, setFetchedLibraryFonts] = useState<any[]>([]);
  const [libraryFontSearch, setLibraryFontSearch] = useState("");
  const [librarySearchResults, setLibrarySearchResults] = useState<any[]>([]);
  const [searchingLibraryFonts, setSearchingLibraryFonts] = useState(false);
  const [projectFontQuery, setProjectFontQuery] = useState("");
  const [designSearchQuery, setDesignSearchQuery] = useState("");

  const designInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const scannedIdsRef = useRef<Set<string>>(new Set());

  // Create / Edit Workspace form state
  const [formName, setFormName] = useState("");
  const [formClient, setFormClient] = useState("");
  const [formCategory, setFormCategory] = useState(
    "Branding & Visual Identity",
  );
  const [formCampaign, setFormCampaign] = useState("");
  const [formDeadline, setFormDeadline] = useState("");
  const [formHeadingFont, setFormHeadingFont] = useState("");
  const [formBodyFont, setFormBodyFont] = useState("");
  const [formAccentFont, setFormAccentFont] = useState("");
  const [formCustomFonts, setFormCustomFonts] = useState<ModalFontRoleDraft[]>(
    [],
  );
  const [formPalette, setFormPalette] = useState<ModalSwatchDraft[]>(() =>
    initialModalOpen
      ? PALETTE_STARTER_PRESETS.plum.swatches.map((s, idx) => ({
          id: `init-sw-${idx}`,
          name: s.name,
          hex: s.hex,
          role: s.role || "accent",
        }))
      : [],
  );
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formLogoDataUrl, setFormLogoDataUrl] = useState<string>("");
  const [formPalettePreset, setFormPalettePreset] = useState<string>("plum");

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function"
    ) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (lightboxDesign) {
        setLightboxDesign(null);
      } else if (isCreatingWorkspace) {
        setIsCreatingWorkspace(false);
        setEditingWorkspaceId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxDesign, isCreatingWorkspace]);

  useEffect(() => {
    try {
      localStorage.setItem("fontivo_workspaces", JSON.stringify(workspaces));
    } catch {}
  }, [workspaces]);

  useEffect(() => {
    safeFetchJson<any>("/api/workspaces", { timeoutMs: 5000 }).then((data) => {
      if (Array.isArray(data) && data.length > 0) {
        setWorkspaces(data);
        if (!selectedId && data[0]) setSelectedId(data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      (Array.isArray(fonts) && fonts.length > 0)
    ) {
      return;
    }
    if (
      typeof navigator !== "undefined" &&
      /jsdom|happy-dom/i.test(navigator.userAgent || "")
    ) {
      return;
    }
    let cancelled = false;
    Promise.all([
      safeFetchJson<any>("/api/fonts?source=local_all&limit=180", {
        timeoutMs: 5000,
      }),
      safeFetchJson<any>("/api/fonts?limit=180", { timeoutMs: 5000 }),
    ]).then(([localRes, allRes]) => {
      if (cancelled) return;
      const extract = (d: any): any[] =>
        Array.isArray(d) ? d : Array.isArray(d?.fonts) ? d.fonts : [];
      const merged = new Map<string, any>();
      for (const f of [...extract(localRes), ...extract(allRes)]) {
        if (!f) continue;
        const key = String(f.id ?? f.path ?? f.name ?? "");
        if (key && !merged.has(key)) merged.set(key, f);
      }
      const list = Array.from(merged.values());
      if (list.length > 0) setFetchedLibraryFonts(list);
    });
    return () => {
      cancelled = true;
    };
  }, [Array.isArray(fonts) ? fonts.length : 0]);

  const activeWorkspace: Workspace =
    workspaces.find((w) => w.id === selectedId) ||
    workspaces[0] ||
    INITIAL_WORKSPACES[0];
  const physicalPath =
    activeWorkspace.folderPath ||
    (activeWorkspace.path as string | undefined) ||
    `%LOCALAPPDATA%\\Fontivo\\Workspaces\\${activeWorkspace.id}`;

  // Dynamically load actual font files via FontFace API for live Typography Specimen Preview
  useEffect(() => {
    setLoadedHeadingFamily(null);
    setLoadedBodyFamily(null);
    setLoadedAccentFamily(null);

    if (
      typeof window === "undefined" ||
      typeof FontFace === "undefined" ||
      typeof document === "undefined" ||
      !document.fonts
    ) {
      return;
    }

    let cancelled = false;
    const extractFontId = (slot: any): string | number | null => {
      if (slot && typeof slot === "object" && slot.fontId != null && slot.fontId !== "") {
        return slot.fontId;
      }
      return null;
    };

    const loadSlot = async (
      slotName: "heading" | "body" | "accent",
      slotValue: any,
      setter: (family: string | null) => void,
    ) => {
      const fontId = extractFontId(slotValue);
      if (fontId == null) return;
      const safeId = String(activeWorkspace.id).replace(/[^a-zA-Z0-9_-]/g, "");
      const familyName = `FontivoWs_${safeId}_${slotName}_${fontId}`;
      try {
        const face = new FontFace(
          familyName,
          `url('/api/fonts/${encodeURIComponent(String(fontId))}/file')`,
        );
        const loaded = await face.load();
        if (!cancelled && document.fonts) {
          document.fonts.add(loaded);
          setter(familyName);
        }
      } catch {
        // Offline / missing font file — safely fall back to system/CSS stack
      }
    };

    loadSlot("heading", activeWorkspace.typography?.headingFont, setLoadedHeadingFamily);
    loadSlot("body", activeWorkspace.typography?.bodyFont, setLoadedBodyFamily);
    loadSlot("accent", activeWorkspace.typography?.accentFont, setLoadedAccentFamily);

    return () => {
      cancelled = true;
    };
  }, [
    activeWorkspace.id,
    activeWorkspace.typography?.headingFont,
    activeWorkspace.typography?.bodyFont,
    activeWorkspace.typography?.accentFont,
  ]);

  const effectiveFonts = React.useMemo(() => {
    const propList = Array.isArray(fonts) ? fonts : [];
    if (propList.length === 0) return fetchedLibraryFonts;
    if (fetchedLibraryFonts.length === 0) return propList;
    const merged = new Map<string, any>();
    for (const f of [...propList, ...fetchedLibraryFonts]) {
      if (!f) continue;
      const key = String(f.id ?? f.path ?? f.name ?? "");
      if (key && !merged.has(key)) merged.set(key, f);
    }
    return Array.from(merged.values());
  }, [fonts, fetchedLibraryFonts]);

  const sortedLibraryFonts = React.useMemo(() => {
    const list = effectiveFonts;
    const nonSystem = list.filter(
      (f: any) => String(f.source || "").toLowerCase() !== "system",
    );
    const system = list.filter(
      (f: any) => String(f.source || "").toLowerCase() === "system",
    );
    return {
      nonSystem: nonSystem.slice(0, 180),
      system: system.slice(0, 120),
      all: [...nonSystem, ...system].slice(0, 260),
    };
  }, [effectiveFonts]);

  const formatLibraryFontOptionLabel = (f: any) =>
    `${f.family || f.name} — ${f.style || "Regular"}`;

  const persistWorkspace = async (
    nextWs: Workspace,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!nextWs?.id) return { ok: false, error: "Missing workspace id" };
    setWorkspaces((prev) =>
      prev.some((w) => w.id === nextWs.id)
        ? prev.map((w) => (w.id === nextWs.id ? nextWs : w))
        : [...prev, nextWs],
    );
    try {
      const payload: any = { ...nextWs };
      delete payload.subfolders;
      const res = await safeFetch(`/api/workspaces/${nextWs.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        timeoutMs: 5000,
      });
      if (!res) {
        return {
          ok: false,
          error: isRtl
            ? "تعذر الاتصال بالخادم — تم الحفظ محلياً."
            : "Server unreachable — saved locally.",
        };
      }
      let saved: any = null;
      try {
        saved = await res.json();
      } catch {
        saved = null;
      }
      if (!res.ok) {
        return {
          ok: false,
          error:
            saved?.error ||
            (isRtl
              ? `تعذر مزامنة المشروع (${res.status}) — تم الحفظ محلياً.`
              : `Failed to sync workspace (${res.status}) — saved locally.`),
        };
      }
      if (saved && saved.id) {
        setWorkspaces((prev) =>
          prev.map((w) =>
            w.id === nextWs.id
              ? {
                  ...w,
                  ...saved,
                  tasks: Array.isArray(saved.tasks)
                    ? saved.tasks
                    : nextWs.tasks,
                  subfolders: w.subfolders || nextWs.subfolders,
                }
              : w,
          ),
        );
      }
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: isRtl
          ? "حدث خطأ أثناء المزامنة — تم الحفظ محلياً."
          : "Sync error — saved locally.",
      };
    }
  };

  const persistWorkspaceWithPalette = async (nextWs: Workspace) => {
    const withUpdatedCount: Workspace = {
      ...nextWs,
      subfolders: nextWs.subfolders
        ? {
            ...nextWs.subfolders,
            palettes: (
              nextWs.subfolders.palettes || [
                {
                  name: "palette.ase",
                  path: "Palettes\\palette.ase",
                  swatchesCount: (nextWs.palette || []).length,
                },
              ]
            ).map((p, i) =>
              i === 0 ? { ...p, swatchesCount: (nextWs.palette || []).length } : p,
            ),
          }
        : undefined,
    };
    await persistWorkspace(withUpdatedCount);
    await safeFetchJson<any>("/api/workspaces/save-palette", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: withUpdatedCount.id,
        filePath: `${physicalPath}\\Palettes\\palette.ase`,
        palette: withUpdatedCount.palette || [],
      }),
      timeoutMs: 5000,
    });
  };

  useEffect(() => {
    setConfirmDeleteWsId(null);
    setEditingSwatchIdx(null);
    setIsTaskModalOpen(false);
    setEditingTaskModalId(null);
    setLightboxDesign(null);
    setIsEditingNotes(false);
    setNotesDraft(activeWorkspace?.notes || "");
    setLibraryFontSearch("");
    setLibrarySearchResults([]);
    setProjectFontQuery("");
    setDesignSearchQuery("");
  }, [activeWorkspace?.id]);

  // Resolve numeric font IDs for Heading & Body slots and dynamically load @font-face
  const resolveSlotFontId = React.useCallback(
    (slot: TypographyFontObject | string | undefined): number | null => {
      if (!slot) return null;
      if (
        typeof slot === "object" &&
        typeof slot.fontId === "number" &&
        slot.fontId > 0
      ) {
        return slot.fontId;
      }
      const rawName =
        typeof slot === "string"
          ? slot
          : slot.family || slot.name || "";
      const candidates = rawName
        .split(/[\/—,]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (candidates.length === 0) return null;
      const match = effectiveFonts.find((f: any) => {
        const fam = String(f.family || "").trim().toLowerCase();
        const nm = String(f.name || "").trim().toLowerCase();
        const disp = String(f.displayName || "").trim().toLowerCase();
        return candidates.some(
          (c) => c === fam || c === nm || c === disp,
        );
      });
      const idNum = match ? Number(match.id) : NaN;
      return Number.isFinite(idNum) && idNum > 0 ? idNum : null;
    },
    [effectiveFonts],
  );

  const headingFontId = resolveSlotFontId(
    activeWorkspace?.typography?.headingFont,
  );
  const bodyFontId = resolveSlotFontId(activeWorkspace?.typography?.bodyFont);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      typeof FontFace === "undefined" ||
      !document.fonts ||
      (typeof navigator !== "undefined" &&
        /jsdom|happy-dom/i.test(navigator.userAgent || ""))
    ) {
      return;
    }

    let cancelled = false;
    const loadSlotFace = async (
      id: number | null,
      prefix: string,
      setter: (fam: string | null) => void,
    ) => {
      if (!id) {
        setter(null);
        return;
      }
      const familyName = `${prefix}-${id}`;
      try {
        const face = new FontFace(familyName, `url("/api/fonts/${id}/file")`);
        const loaded = await face.load();
        if (cancelled) return;
        document.fonts.add(loaded);
        setter(familyName);
      } catch {
        if (!cancelled) setter(null);
      }
    };

    loadSlotFace(headingFontId, "FontivoWsHeading", setLoadedHeadingFamily);
    loadSlotFace(bodyFontId, "FontivoWsBody", setLoadedBodyFamily);

    return () => {
      cancelled = true;
    };
  }, [headingFontId, bodyFontId]);

  const workspaceFoldersList: string[] = React.useMemo(() => {
    const base = ["Fonts", "Designs", "Palettes", "Guidelines"];
    const custom = Array.isArray(activeWorkspace.folders)
      ? activeWorkspace.folders
      : [];
    const merged = new Set<string>(base);
    for (const f of custom) {
      const clean = String(f || "")
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "");
      if (clean) merged.add(clean);
    }
    return Array.from(merged);
  }, [activeWorkspace.folders]);

  const childFoldersInCurrentPath = React.useMemo(() => {
    const prefix = currentFolderPath ? `${currentFolderPath}/` : "";
    const direct = new Set<string>();
    for (const full of workspaceFoldersList) {
      if (!currentFolderPath) {
        direct.add(full.split("/")[0]);
      } else if (full.toLowerCase().startsWith(prefix.toLowerCase())) {
        const rest = full.slice(prefix.length);
        const seg = rest.split("/")[0];
        if (seg) direct.add(`${currentFolderPath}/${seg}`);
      }
    }
    return Array.from(direct);
  }, [workspaceFoldersList, currentFolderPath]);

  const resolvedProjectFonts = React.useMemo(() => {
    const diskFonts = Array.isArray(activeWorkspace.subfolders?.fonts)
      ? activeWorkspace.subfolders.fonts
      : [];
    const savedFonts = Array.isArray(activeWorkspace.projectFonts)
      ? activeWorkspace.projectFonts
      : [];

    const merged: Array<{
      id: string | number;
      name: string;
      family: string;
      format: string;
      path: string;
      isActive: boolean;
      roleLabel?: string;
      sourceKind?: "disk" | "linked" | "typography" | "custom";
    }> = [];
    const seen = new Set<string>();

    const makeKey = (name?: string, path?: string, id?: string | number) => {
      const n = String(name || "").trim().toLowerCase();
      const p = String(path || "").replace(/\\/g, "/").trim().toLowerCase();
      if (id !== undefined && id !== null && !String(id).startsWith("pf-") && !String(id).startsWith("slot-")) {
        return `id:${id}`;
      }
      return p && !p.startsWith("fonts/") ? `p:${p}` : `n:${n}`;
    };

    const pushUnique = (item: (typeof merged)[number]) => {
      const cleanName = String(item.name || "").trim();
      if (!cleanName || cleanName === "Unassigned") return;
      const keyById = makeKey(cleanName, item.path, item.id);
      const keyByName = `n:${cleanName.toLowerCase()}`;
      if (seen.has(keyById) || seen.has(keyByName)) {
        // Enrich existing entry with roleLabel if missing
        const existing = merged.find(
          (m) =>
            m.name.toLowerCase() === cleanName.toLowerCase() ||
            (m.id !== undefined && String(m.id) === String(item.id)),
        );
        if (existing && !existing.roleLabel && item.roleLabel) {
          existing.roleLabel = item.roleLabel;
        }
        return;
      }
      seen.add(keyById);
      seen.add(keyByName);
      merged.push(item);
    };

    for (const df of diskFonts) {
      pushUnique({
        id: df.id ?? `disk-${df.name}`,
        name: df.name || df.family || "Font",
        family: df.family || df.name || "Font",
        format: df.format || "TTF",
        path: df.path || `Fonts\\${df.name || "Font"}`,
        isActive: Boolean(df.isActive),
        sourceKind: "disk",
      });
    }

    for (let i = 0; i < savedFonts.length; i++) {
      const pf: any = savedFonts[i];
      pushUnique({
        id: pf.fontId ?? `pf-${i}`,
        name: pf.name || pf.family || "Font",
        family: pf.family || pf.name || "Font",
        format: pf.style || "TTF",
        path: pf.path || `Fonts\\${pf.name || "Font"}`,
        isActive: Boolean(pf.isActive),
        sourceKind: "linked",
      });
    }

    const typoSlots: Array<{
      slot: TypographyFontObject | string | undefined;
      ar: string;
      en: string;
      key: string;
    }> = [
      {
        slot: activeWorkspace.typography?.headingFont,
        ar: "العناوين",
        en: "Heading",
        key: "heading",
      },
      {
        slot: activeWorkspace.typography?.bodyFont,
        ar: "النصوص",
        en: "Body",
        key: "body",
      },
      {
        slot: activeWorkspace.typography?.accentFont,
        ar: "مساعد",
        en: "Accent",
        key: "accent",
      },
      {
        slot: activeWorkspace.typography?.codeFont,
        ar: "الكود",
        en: "Code",
        key: "code",
      },
    ];

    for (const ts of typoSlots) {
      const disp = getFontDisplayName(ts.slot);
      if (!disp || disp === "Unassigned") continue;
      const obj = typeof ts.slot === "object" && ts.slot ? ts.slot : null;
      pushUnique({
        id: obj?.fontId ?? `slot-${ts.key}-${disp}`,
        name: disp,
        family: obj?.family || disp,
        format: obj?.style || "TTF",
        path: obj?.path || `Fonts\\${disp}`,
        isActive: false,
        roleLabel: isRtl ? ts.ar : ts.en,
        sourceKind: "typography",
      });
    }

    if (Array.isArray(activeWorkspace.customFonts)) {
      activeWorkspace.customFonts.forEach((cf, idx) => {
        const disp = getFontDisplayName(cf);
        if (!disp || disp === "Unassigned") return;
        pushUnique({
          id: cf.fontId ?? `slot-custom-${idx}-${disp}`,
          name: disp,
          family: cf.family || disp,
          format: cf.style || "TTF",
          path: cf.path || `Fonts\\${disp}`,
          isActive: false,
          roleLabel: cf.label || (isRtl ? "مخصص" : "Custom"),
          sourceKind: "custom",
        });
      });
    }

    return merged;
  }, [
    activeWorkspace.subfolders?.fonts,
    activeWorkspace.projectFonts,
    activeWorkspace.typography,
    activeWorkspace.customFonts,
    isRtl,
  ]);

  // Live debounced full-library font search (searches all 10,939+ fonts in Rust backend)
  useEffect(() => {
    const q = libraryFontSearch.trim();
    if (!q) {
      setLibrarySearchResults([]);
      setSearchingLibraryFonts(false);
      return;
    }
    const localMatches = effectiveFonts
      .filter((f: any) => {
        const hay = `${f.displayName || ""} ${f.name || ""} ${f.family || ""} ${f.style || ""}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
      .slice(0, 40);
    setLibrarySearchResults(localMatches);

    if (
      typeof window === "undefined" ||
      (typeof navigator !== "undefined" &&
        /jsdom|happy-dom/i.test(navigator.userAgent || ""))
    ) {
      return;
    }

    let cancelled = false;
    setSearchingLibraryFonts(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await safeFetchJson<any>(
          `/api/fonts?search=${encodeURIComponent(q)}&limit=60`,
          { timeoutMs: 4500 },
        );
        if (cancelled) return;
        const remoteList: any[] = Array.isArray(res)
          ? res
          : Array.isArray(res?.fonts)
            ? res.fonts
            : [];
        const merged = new Map<string, any>();
        for (const f of [...remoteList, ...localMatches]) {
          if (!f) continue;
          const key = String(f.id ?? f.path ?? f.name ?? "");
          if (key && !merged.has(key)) merged.set(key, f);
        }
        setLibrarySearchResults(Array.from(merged.values()).slice(0, 60));
      } finally {
        if (!cancelled) setSearchingLibraryFonts(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [libraryFontSearch, effectiveFonts]);

  const subfolders = {
    fonts: resolvedProjectFonts,
    designs: Array.isArray(activeWorkspace.subfolders?.designs)
      ? activeWorkspace.subfolders.designs
      : [],
    palettes: activeWorkspace.subfolders?.palettes || [
      {
        name: "palette.ase",
        path: "Palettes\\palette.ase",
        swatchesCount: (activeWorkspace.palette || []).length,
      },
    ],
    guidelines: activeWorkspace.subfolders?.guidelines || [
      "Guidelines\\styleguide.html",
    ],
  };

  const pinnedAssetSet = React.useMemo(
    () =>
      new Set(
        (activeWorkspace.pinnedAssets || []).map((p) =>
          String(p || "").replace(/\\/g, "/").toLowerCase(),
        ),
      ),
    [activeWorkspace.pinnedAssets],
  );

  const isDesignPinned = (design: WorkspaceDesignFile): boolean => {
    const key = getDesignAssetKey(design).replace(/\\/g, "/").toLowerCase();
    return (
      pinnedAssetSet.has(key) ||
      pinnedAssetSet.has(String(design.path || "").replace(/\\/g, "/").toLowerCase()) ||
      pinnedAssetSet.has(design.name.toLowerCase())
    );
  };

  const handleCopyHex = (hex: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(hex).catch(() => {});
    }
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 1800);
  };

  const handleCopyCode = (type: string) => {
    if (!activeWorkspace) return;
    let code = "";
    if (type === "css") {
      code = exportToCssVariables(
        activeWorkspace.palette || [],
        activeWorkspace.id,
      );
    } else if (type === "tailwind") {
      code = exportToTailwindConfig(activeWorkspace.palette || []);
    } else if (type === "json") {
      code = JSON.stringify(activeWorkspace, null, 2);
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopiedCodeType(type);
    setTimeout(() => setCopiedCodeType(null), 1800);
  };

  const handleOpenInExplorer = async (
    subfolder?: "Fonts" | "Designs" | "Palettes" | "Guidelines" | string,
  ) => {
    const displayTarget = subfolder
      ? `${physicalPath}\\${subfolder.replace(/\//g, "\\")}`
      : physicalPath;
    await safeFetchJson<any>("/api/workspaces/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: activeWorkspace.id,
        id: activeWorkspace.id,
        folderPath: physicalPath,
        subfolder: subfolder || null,
      }),
      timeoutMs: 5000,
    });
    setNotification({
      type: "success",
      text: isRtl
        ? `تم فتح مجلد "${subfolder ? `${activeWorkspace.name} / ${subfolder}` : activeWorkspace.name}" في مستكشف ويندوز (Explorer).`
        : `Opened "${displayTarget}" in Windows Explorer.`,
    });
  };

  const handleScanProjectFolder = async (
    targetWsParam?: any,
    quiet = false,
  ) => {
    const wsObj =
      targetWsParam && targetWsParam.id ? targetWsParam : activeWorkspace;
    if (!wsObj?.id) return;
    if (!quiet) {
      setScanningFolder(true);
      setNotification(null);
    }

    const opId = `scan-ws-${wsObj.id}`;
    if (!quiet) {
      upsertLiveOperation({
        id: opId,
        title: `Scanning Workspace: ${wsObj.name}`,
        titleAr: `فحص مجلد المشروع والمجلدات الفرعية: ${wsObj.name}`,
        category: "workspace-scan",
        status: "running",
        progressPercent: 35,
        stepLabel:
          "Discovering .PSD, .AI, .INDD, .PDF, .SVG & .TTF/.OTF...",
        stepLabelAr:
          "جاري البحث عن ملفات التصميم والخطوط في المجلدات الفرعية...",
      });
    }

    try {
      const scanTargetPath = wsObj.folderPath || wsObj.path || undefined;
      const data = await safeFetchJson<any>("/api/workspaces/scan-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: wsObj.id,
          workspaceId: wsObj.id,
          folderPath: scanTargetPath,
          recursive: true,
        }),
        timeoutMs: 10000,
      });

      if (!data) {
        if (!quiet) {
          setNotification({
            type: "error",
            text: isRtl
              ? "تعذر الاتصال بمحرك الفحص المحلي."
              : "Could not reach local folder scanner.",
          });
        }
        return;
      }

      const scannedDesigns = Array.isArray(data.designFiles)
        ? data.designFiles
        : Array.isArray(data.designs)
          ? data.designs
          : [];

      const scannedFonts = Array.isArray(data.fontFiles)
        ? data.fontFiles
        : Array.isArray(data.fonts)
          ? data.fonts
          : [];

      const discoveredFolders = Array.isArray(data.discoveredFolders)
        ? data.discoveredFolders
        : [];

      scannedIdsRef.current.add(wsObj.id);
      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id !== wsObj.id) return w;
          const mergedFolders = Array.from(
            new Set([
              "Fonts",
              "Designs",
              "Palettes",
              "Guidelines",
              ...(w.folders || []),
              ...discoveredFolders,
            ]),
          );
          const mergedFonts =
            scannedFonts.length > 0
              ? scannedFonts
              : Array.isArray(w.projectFonts)
                ? w.projectFonts.map((pf: any, i: number) => ({
                    id: pf.fontId ?? `pf-${i}`,
                    name: pf.name || pf.family || "Font",
                    family: pf.family || pf.name || "Font",
                    format: pf.style || "TTF",
                    path: pf.path || `Fonts\\${pf.name || "Font"}`,
                    isActive: Boolean(pf.isActive),
                  }))
                : [];
          return {
            ...w,
            folderPath: data.folderPath || w.folderPath,
            folders: mergedFolders,
            subfolders: {
              ...(w.subfolders || {}),
              fonts: mergedFonts,
              designs: scannedDesigns,
              palettes: [
                {
                  name: "palette.ase",
                  path: "Palettes\\palette.ase",
                  swatchesCount: (w.palette || []).length,
                },
              ],
              guidelines: ["Guidelines\\styleguide.html"],
            },
          };
        }),
      );

      if (!quiet) {
        upsertLiveOperation({
          id: opId,
          status: "completed",
          progressPercent: 100,
          itemsDone: scannedDesigns.length + scannedFonts.length,
          itemsTotal: scannedDesigns.length + scannedFonts.length,
          stepLabel: `Found ${scannedDesigns.length} design files & ${scannedFonts.length} project fonts`,
          stepLabelAr: `تم اكتشاف ${scannedDesigns.length} ملف تصميم و ${scannedFonts.length} خطوط في المجلدات الفرعية!`,
        });

        setNotification({
          type: "success",
          text: isRtl
            ? `اكتمل الفحص الفعلي للمجلد: ${scannedDesigns.length} ملف تصميم و ${scannedFonts.length} خط مشروع!`
            : `Folder scan complete: Discovered ${scannedDesigns.length} real design file(s) and ${scannedFonts.length} project font(s)!`,
        });
      }
    } finally {
      if (!quiet) {
        setScanningFolder(false);
      }
    }
  };

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !activeWorkspace?.id ||
      scannedIdsRef.current.has(activeWorkspace.id)
    ) {
      return;
    }
    if (
      typeof navigator !== "undefined" &&
      /jsdom|happy-dom/i.test(navigator.userAgent || "")
    ) {
      return;
    }
    scannedIdsRef.current.add(activeWorkspace.id);
    handleScanProjectFolder(activeWorkspace, true);
  }, [activeWorkspace?.id]);

  const handleActivateRam = async () => {
    if (!activeWorkspace) return;
    setActivating(true);
    setNotification(null);
    try {
      await safeFetchJson<any>(
        `/api/workspaces/${activeWorkspace.id}/activate-ram`,
        {
          method: "POST",
          timeoutMs: 6000,
        },
      );

      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id !== activeWorkspace.id) return w;
          return {
            ...w,
            subfolders: {
              ...subfolders,
              fonts: (subfolders.fonts || []).map((f: any) => ({
                ...f,
                isActive: true,
              })),
              designs: (subfolders.designs || []).map((d: any) => ({
                ...d,
                missingFonts: [],
                allActive: true,
              })),
            },
          };
        }),
      );

      setNotification({
        type: "success",
        text: isRtl
          ? `تم تفعيل كافة خطوط مشروع "${activeWorkspace.name}" والخطوط المطلوبة لملفات التصميم في الذاكرة (RAM)!`
          : `All project & design fonts for "${activeWorkspace.name}" activated in RAM!`,
      });
      if (onRefreshStats) onRefreshStats();
    } catch (e: any) {
      setNotification({ type: "error", text: e?.message });
    } finally {
      setActivating(false);
    }
  };

  const handleSavePaletteToAse = async () => {
    if (!activeWorkspace) return;
    setSavingPalette(true);
    await safeFetchJson<any>("/api/workspaces/save-palette", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: activeWorkspace.id,
        filePath: `${physicalPath}\\Palettes\\palette.ase`,
        palette: activeWorkspace.palette || [],
      }),
      timeoutMs: 5000,
    });
    downloadAseFile(activeWorkspace.palette || [], "palette.ase");
    setNotification({
      type: "success",
      text: isRtl
        ? `تم حفظ لوحة الألوان في المجلد الفرعي Palettes/palette.ase بنجاح!`
        : `Saved workspace color palette to Palettes/palette.ase!`,
    });
    setSavingPalette(false);
  };

  const handleAddSwatchToWorkspace = async (
    hex: string,
    name?: string,
    role?: string,
  ) => {
    const cleanHex = normalizeHexColor(hex);
    const swatchName =
      name?.trim() || newSwatchName.trim() || `Brand Tone ${cleanHex}`;
    const resolvedRole =
      role ||
      (newSwatchRole === "custom"
        ? newSwatchCustomRole.trim() || "custom"
        : newSwatchRole) ||
      "accent";
    const exists = (activeWorkspace.palette || []).some(
      (p: any) => String(p.hex || "").toUpperCase() === cleanHex,
    );
    if (exists) {
      setNotification({
        type: "info",
        text: isRtl
          ? `اللون ${cleanHex} موجود بالفعل في اللوحة.`
          : `Color ${cleanHex} already exists in this palette.`,
      });
      return;
    }
    const nextWs: Workspace = {
      ...activeWorkspace,
      palette: [
        ...(activeWorkspace.palette || []),
        { name: swatchName, hex: cleanHex, role: resolvedRole },
      ],
    };
    setNewSwatchName("");
    setNewSwatchCustomRole("");
    await persistWorkspaceWithPalette(nextWs);
    setNotification({
      type: "success",
      text: isRtl
        ? `تمت إضافة اللون "${swatchName}" وحفظه في ملف المشروع و palette.ase.`
        : `Added & saved color "${swatchName}" to workspace & palette.ase.`,
    });
  };

  const startEditSwatch = (idx: number, color: ColorSwatch) => {
    setEditingSwatchIdx(idx);
    setEditSwatchName(color.name || "");
    setEditSwatchHex(normalizeHexColor(color.hex || "#F16B50"));
    if (isStandardSwatchRole(color.role)) {
      setEditSwatchRole(String(color.role).toLowerCase());
      setEditSwatchCustomRole("");
    } else {
      setEditSwatchRole("custom");
      setEditSwatchCustomRole(color.role || "");
    }
  };

  const handleSaveEditedSwatch = async () => {
    if (editingSwatchIdx === null || !activeWorkspace) return;
    const cleanHex = normalizeHexColor(editSwatchHex || "#000000");
    const cleanName = editSwatchName.trim() || `Color ${cleanHex}`;
    const resolvedRole =
      editSwatchRole === "custom"
        ? editSwatchCustomRole.trim() || "custom"
        : editSwatchRole || "accent";
    const nextPalette = (activeWorkspace.palette || []).map((c, idx) =>
      idx === editingSwatchIdx
        ? {
            ...c,
            name: cleanName,
            hex: cleanHex,
            role: resolvedRole,
          }
        : c,
    );
    setEditingSwatchIdx(null);
    await persistWorkspaceWithPalette({
      ...activeWorkspace,
      palette: nextPalette,
    });
    setNotification({
      type: "success",
      text: isRtl
        ? `تم تحديث اللون "${cleanName}" وحفظه على القرص.`
        : `Updated & saved color "${cleanName}" to disk.`,
    });
  };

  const handleRemoveSwatchFromWorkspace = async (idx: number) => {
    if (!activeWorkspace) return;
    const nextPalette = (activeWorkspace.palette || []).filter(
      (_, i) => i !== idx,
    );
    if (editingSwatchIdx === idx) setEditingSwatchIdx(null);
    await persistWorkspaceWithPalette({
      ...activeWorkspace,
      palette: nextPalette,
    });
  };

  const handleAddFontToWorkspace = async (fontId: string, directFont?: any) => {
    const picked =
      directFont ||
      librarySearchResults.find((f: any) => String(f.id) === String(fontId)) ||
      effectiveFonts.find((f: any) => String(f.id) === String(fontId));
    if (!picked || !activeWorkspace) return;
    const existingFonts = subfolders.fonts || [];
    if (
      existingFonts.some(
        (ef: any) =>
          String(ef.id) === String(picked.id) ||
          (ef.name === (picked.displayName || picked.name || picked.family) &&
            ef.path === picked.path),
      )
    ) {
      return;
    }
    const newFontSlot: TypographyFontObject = {
      name: picked.displayName || picked.name || picked.family,
      fontId: Number(picked.id) || undefined,
      family: picked.family || picked.name,
      style: picked.style || "Regular",
      path: picked.path || `Fonts\\${picked.name}`,
    };
    const newEntry = {
      id: picked.id,
      name: newFontSlot.name || "Font",
      family: newFontSlot.family,
      format: picked.format || "TTF",
      path: newFontSlot.path || `Fonts\\${picked.name}`,
      isActive: Boolean(picked.isActive || picked.active),
    };
    const nextProjectFonts = buildSyncedProjectFonts(
      [newFontSlot],
      activeWorkspace.projectFonts || [],
    );
    const nextWs: Workspace = {
      ...activeWorkspace,
      projectFonts: nextProjectFonts,
      subfolders: {
        ...subfolders,
        fonts: [...existingFonts, newEntry],
      },
    };
    await persistWorkspace(nextWs);
    setNotification({
      type: "success",
      text: isRtl
        ? `تمت إضافة الخط "${picked.family || picked.name}" ونسخه إلى مجلد المشروع Fonts/.`
        : `Added & synced "${picked.family || picked.name}" into workspace Fonts/.`,
    });
  };

  const handleRemoveFontFromWorkspace = async (idx: number) => {
    if (!activeWorkspace) return;
    const nextFonts = (subfolders.fonts || []).filter((_, i) => i !== idx);
    const nextProjectFonts = (activeWorkspace.projectFonts || []).filter(
      (_, i) => i !== idx,
    );
    const nextWs: Workspace = {
      ...activeWorkspace,
      projectFonts: nextProjectFonts,
      subfolders: {
        ...subfolders,
        fonts: nextFonts,
      },
    };
    await persistWorkspace(nextWs);
  };

  const resolveProjectFontNumericId = (f: any): number | null => {
    if (typeof f?.id === "number" && Number.isFinite(f.id) && f.id > 0) {
      return f.id;
    }
    if (typeof f?.id === "string" && /^\d+$/.test(f.id.trim())) {
      const parsed = Number(f.id.trim());
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    const targetName = String(f?.name || "").trim().toLowerCase();
    const targetFamily = String(f?.family || "").trim().toLowerCase();
    const matched = effectiveFonts.find((ef: any) => {
      const efId = Number(ef?.id);
      if (!Number.isFinite(efId) || efId <= 0) return false;
      const efFamily = String(ef.family || "").trim().toLowerCase();
      const efName = String(ef.name || "").trim().toLowerCase();
      const efDisp = String(ef.displayName || "").trim().toLowerCase();
      return (
        (targetName &&
          (efName === targetName ||
            efDisp === targetName ||
            efFamily === targetName)) ||
        (targetFamily &&
          (efFamily === targetFamily ||
            efName === targetFamily ||
            efDisp === targetFamily))
      );
    });
    return matched ? Number(matched.id) : null;
  };

  const getProjectFontRamKey = (f: any, resolvedId: number | null): string =>
    String(resolvedId ?? f?.id ?? f?.name ?? "");

  const handleToggleProjectFontRam = async (f: any) => {
    if (!activeWorkspace) return;
    const resolvedId = resolveProjectFontNumericId(f);
    const key = getProjectFontRamKey(f, resolvedId);
    const currentlyActive = ramActiveMap[key] ?? Boolean(f.isActive);
    const nextActive = !currentlyActive;

    setRamActiveMap((prev) => ({ ...prev, [key]: nextActive }));

    try {
      if (resolvedId) {
        if (typeof onActivateFont === "function") {
          await Promise.resolve(onActivateFont(resolvedId));
        } else {
          await safeFetchJson<any>(`/api/fonts/${resolvedId}/activate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: nextActive }),
            timeoutMs: 5000,
          });
        }
      } else {
        await safeFetchJson<any>(
          `/api/workspaces/${activeWorkspace.id}/activate-ram`,
          {
            method: "POST",
            timeoutMs: 5000,
          },
        );
      }

      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id !== activeWorkspace.id) return w;
          const prevSub = w.subfolders || subfolders;
          return {
            ...w,
            subfolders: {
              ...prevSub,
              fonts: (prevSub.fonts || []).map((item: any) =>
                String(item.id) === String(f.id) || item.name === f.name
                  ? { ...item, isActive: nextActive }
                  : item,
              ),
            },
          };
        }),
      );

      setNotification({
        type: "success",
        text: isRtl
          ? nextActive
            ? `تم تفعيل الخط "${f.name}" في الذاكرة (RAM) بنجاح.`
            : `تم إلغاء تفعيل الخط "${f.name}" من الذاكرة.`
          : nextActive
            ? `Activated "${f.name}" in RAM!`
            : `Deactivated "${f.name}" from RAM.`,
      });
      if (onRefreshStats) onRefreshStats();
    } catch (e: any) {
      setRamActiveMap((prev) => ({ ...prev, [key]: currentlyActive }));
      setNotification({
        type: "error",
        text:
          e?.message ||
          (isRtl ? "تعذر تحديث حالة الخط في الرام." : "Failed to toggle RAM activation."),
      });
    }
  };

  const handleAssignProjectFontRole = async (
    f: any,
    roleKey: "none" | "heading" | "body" | "accent" | "code",
  ) => {
    if (!activeWorkspace) return;
    const resolvedId = resolveProjectFontNumericId(f);
    const fontSlot: TypographyFontObject = {
      name: f.name || f.family || "Font",
      fontId: resolvedId ?? undefined,
      family: f.family || f.name,
      style: f.format || "Regular",
      path: f.path,
    };

    const nextTypography = { ...(activeWorkspace.typography || {}) };
    const slotKeys: Array<"headingFont" | "bodyFont" | "accentFont" | "codeFont"> = [
      "headingFont",
      "bodyFont",
      "accentFont",
      "codeFont",
    ];
    for (const k of slotKeys) {
      const cur = nextTypography[k];
      if (!cur) continue;
      const curName = getFontDisplayName(cur).toLowerCase();
      if (curName === String(f.name || "").toLowerCase()) {
        delete nextTypography[k];
      }
    }

    if (roleKey === "heading") nextTypography.headingFont = fontSlot;
    if (roleKey === "body") nextTypography.bodyFont = fontSlot;
    if (roleKey === "accent") nextTypography.accentFont = fontSlot;
    if (roleKey === "code") nextTypography.codeFont = fontSlot;

    const nextWs: Workspace = {
      ...activeWorkspace,
      typography: nextTypography,
    };
    await persistWorkspace(nextWs);
  };

  const handleDeleteDesignFile = async (design: WorkspaceDesignFile) => {
    if (!activeWorkspace) return;
    const relPath =
      design.relativePath ||
      (design.subfolder
        ? `${design.subfolder}/${design.name}`
        : `Designs/${design.name}`);
    const res = await safeFetchJson<any>(
      `/api/workspaces/${activeWorkspace.id}/design-file?path=${encodeURIComponent(relPath)}`,
      {
        method: "DELETE",
        timeoutMs: 5000,
      },
    );
    if (res && res.success) {
      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id !== activeWorkspace.id) return w;
          const prevSub = w.subfolders || subfolders;
          return {
            ...w,
            subfolders: {
              ...prevSub,
              designs: (prevSub.designs || []).filter(
                (d) => d.path !== design.path && d.relativePath !== relPath,
              ),
            },
          };
        }),
      );
      if (lightboxDesign?.path === design.path) setLightboxDesign(null);
      setNotification({
        type: "success",
        text: isRtl
          ? `تم حذف ملف التصميم "${design.name}" من مجلد المشروع.`
          : `Removed design file "${design.name}" from workspace.`,
      });
    }
  };

  const handleTogglePinDesign = async (design: WorkspaceDesignFile) => {
    if (!activeWorkspace) return;
    const key = getDesignAssetKey(design);
    const existing = activeWorkspace.pinnedAssets || [];
    const normKey = key.replace(/\\/g, "/").toLowerCase();
    const currentlyPinned = isDesignPinned(design);
    const nextPinned = currentlyPinned
      ? existing.filter(
          (p) =>
            p.replace(/\\/g, "/").toLowerCase() !== normKey &&
            p.toLowerCase() !== design.name.toLowerCase(),
        )
      : Array.from(new Set([...existing, key]));

    await persistWorkspace({
      ...activeWorkspace,
      pinnedAssets: nextPinned,
    });
    setNotification({
      type: "success",
      text: currentlyPinned
        ? isRtl
          ? `تمت إزالة التثبيت عن "${design.name}".`
          : `Unpinned "${design.name}".`
        : isRtl
          ? `تم تثبيت "${design.name}" في أعلى قائمة الملفات.`
          : `Pinned "${design.name}" to top of assets.`,
    });
  };

  const handleOpenDesignFile = async (design: WorkspaceDesignFile) => {
    if (!activeWorkspace) return;
    const relPath = getDesignAssetKey(design);
    const res = await safeFetchJson<any>(
      `/api/workspaces/${activeWorkspace.id}/open-file`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: relPath }),
        timeoutMs: 5000,
      },
    );
    if (res && res.success === false) {
      setNotification({
        type: "error",
        text:
          res.error ||
          (isRtl ? "تعذر فتح الملف على النظام." : "Could not open file."),
      });
      return;
    }
    setNotification({
      type: "success",
      text: isRtl
        ? `تم فتح ملف "${design.name}" في البرنامج الافتراضي.`
        : `Opened "${design.name}" with system default viewer.`,
    });
  };

  const handleExportBundle = async () => {
    if (!activeWorkspace) return;
    setExporting(true);
    try {
      const data = await safeFetchJson<any>(
        `/api/workspaces/${activeWorkspace.id}/export-bundle`,
        {
          method: "POST",
          timeoutMs: 6000,
        },
      );

      if (data && data.bundlePath) {
        setNotification({
          type: "success",
          text: isRtl
            ? `تم تصدير حزمة المشروع إلى: ${data.bundlePath}`
            : `Client handoff bundle exported to: ${data.bundlePath}`,
        });
      } else {
        downloadAseFile(
          activeWorkspace.palette || [],
          `${activeWorkspace.id}-swatches.ase`,
        );
        setNotification({
          type: "success",
          text: isRtl
            ? `تم تنزيل حزمة المشروع (.ASE Swatches + CSS Variables) بنجاح!`
            : `Client handoff bundle (.ASE Swatches & CSS Variables) downloaded successfully!`,
        });
      }
    } catch (e: any) {
      setNotification({ type: "error", text: e?.message });
    } finally {
      setExporting(false);
    }
  };

  const handleExportHandoverZip = async () => {
    if (!activeWorkspace || exportingZip) return;
    setExportingZip(true);
    const url = `/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/export-zip`;
    const filename = `${activeWorkspace.id}-handover.zip`;
    try {
      const res = await safeFetch(url, { timeoutMs: 25000 });
      if (res && res.ok) {
        const blob = await res.blob();
        if (
          typeof URL !== "undefined" &&
          typeof URL.createObjectURL === "function" &&
          typeof document !== "undefined"
        ) {
          const objUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = objUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(objUrl), 2500);
        }
        setNotification({
          type: "success",
          text: isRtl
            ? `تم تصدير حزمة تسليم المشروع (${filename}) بنجاح!`
            : `Project handover bundle (${filename}) exported successfully!`,
        });
      } else {
        // Fallback direct browser download navigation
        if (typeof document !== "undefined") {
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        setNotification({
          type: "info",
          text: isRtl
            ? `تم إرسال طلب تنزيل حزمة المشروع (${filename}).`
            : `Triggered handover archive download (${filename}).`,
        });
      }
    } catch (e: any) {
      setNotification({
        type: "error",
        text:
          e?.message ||
          (isRtl ? "تعذر تصدير حزمة المشروع (.ZIP)" : "Failed to export project ZIP bundle"),
      });
    } finally {
      setExportingZip(false);
    }
  };

  const handleExtractLogoPaletteForModal = async (overrideUrl?: string) => {
    const src = overrideUrl || formLogoDataUrl;
    if (!src || extractingLogoPalette) return;
    setExtractingLogoPalette(true);
    try {
      const extracted = await extractPaletteFromImageDataUrl(src, 5);
      if (extracted.length > 0) {
        setFormPalette(
          extracted.map((c, idx) => ({
            id: `logo-sw-${Date.now()}-${idx}`,
            name: c.name,
            hex: c.hex,
            role: c.role,
          })),
        );
        setNotification({
          type: "success",
          text: isRtl
            ? `تم استخراج ${extracted.length} ألوان مميزة من الشعار بنجاح!`
            : `Extracted ${extracted.length} brand colors from logo!`,
        });
      } else {
        setNotification({
          type: "error",
          text: isRtl
            ? "تعذر استخراج ألوان واضحة من هذا الشعار."
            : "Could not extract distinct colors from this logo.",
        });
      }
    } finally {
      setExtractingLogoPalette(false);
    }
  };

  const handleExtractLogoPaletteForActiveWorkspace = async () => {
    if (!activeWorkspace?.logoDataUrl || extractingLogoPalette) return;
    setExtractingLogoPalette(true);
    try {
      const extracted = await extractPaletteFromImageDataUrl(
        activeWorkspace.logoDataUrl,
        5,
      );
      if (extracted.length > 0) {
        const existing = activeWorkspace.palette || [];
        const existingHexes = new Set(
          existing.map((s) => normalizeHexColor(s.hex)),
        );
        const toAppend: ColorSwatch[] = extracted
          .filter((c) => !existingHexes.has(normalizeHexColor(c.hex)))
          .map((c) => ({
            name: c.name,
            hex: c.hex,
            role: c.role,
          }));
        const nextPalette =
          toAppend.length > 0 ? [...existing, ...toAppend] : existing;
        await persistWorkspaceWithPalette({
          ...activeWorkspace,
          palette: nextPalette,
        });
        setNotification({
          type: "success",
          text: isRtl
            ? toAppend.length > 0
              ? `تمت إضافة ${toAppend.length} ألوان مستخرجة من الشعار إلى اللوحة!`
              : "جميع ألوان الشعار موجودة مسبقاً في اللوحة."
            : toAppend.length > 0
              ? `Added ${toAppend.length} colors extracted from logo to palette!`
              : "All extracted logo colors are already in this palette.",
        });
      } else {
        setNotification({
          type: "error",
          text: isRtl
            ? "تعذر استخراج ألوان واضحة من شعار المشروع."
            : "Could not extract distinct colors from the workspace logo.",
        });
      }
    } finally {
      setExtractingLogoPalette(false);
    }
  };

  // Task checklist handlers (persisted to disk)
  const handleToggleTaskStatus = async (taskId: string) => {
    if (!activeWorkspace) return;
    const updatedTasks = (activeWorkspace.tasks || []).map((task) => {
      if (task.id !== taskId) return task;
      const nextStatus: WorkspaceTask["status"] =
        task.status === "todo"
          ? "in_progress"
          : task.status === "in_progress"
            ? "done"
            : "todo";
      return { ...task, status: nextStatus };
    });
    await persistWorkspace({ ...activeWorkspace, tasks: updatedTasks });
  };

  const TASK_CATEGORIES = [
    { id: "typography", ar: "الخطوط والتايبوغرافي", en: "Typography" },
    { id: "palette", ar: "الألوان والهوية", en: "Colors & Brand" },
    { id: "designs", ar: "التصاميم والملفات", en: "Design Assets" },
    { id: "review", ar: "مراجعة العميل", en: "Client Review" },
    { id: "delivery", ar: "التسليم النهائي", en: "Final Delivery" },
  ];

  const getTaskCategoryLabel = (catId?: string) => {
    const found = TASK_CATEGORIES.find((c) => c.id === catId);
    if (found) return isRtl ? found.ar : found.en;
    return catId || (isRtl ? "عام" : "General");
  };

  const openAddTaskModal = () => {
    setEditingTaskModalId(null);
    setTaskModalTitle("");
    setTaskModalNotes("");
    setTaskModalCategory("typography");
    setTaskModalPriority("medium");
    setTaskModalStatus("todo");
    setTaskModalDueDate("");
    setTaskModalChecklistText("");
    setIsTaskModalOpen(true);
  };

  const openEditTaskModal = (task: WorkspaceTask) => {
    setEditingTaskModalId(task.id);
    setTaskModalTitle(task.text || "");
    setTaskModalNotes(task.notes || "");
    setTaskModalCategory(task.category || "typography");
    setTaskModalPriority(
      (task.priority as WorkspaceTaskPriority) || "medium",
    );
    setTaskModalStatus(task.status || "todo");
    setTaskModalDueDate(task.dueDate || "");
    setTaskModalChecklistText(
      Array.isArray(task.checklist) ? task.checklist.join("\n") : "",
    );
    setIsTaskModalOpen(true);
  };

  const handleSaveTaskModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !taskModalTitle.trim()) return;
    const checklistItems = taskModalChecklistText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    let updatedTasks: WorkspaceTask[];
    if (editingTaskModalId) {
      updatedTasks = (activeWorkspace.tasks || []).map((t) =>
        t.id === editingTaskModalId
          ? {
              ...t,
              text: taskModalTitle.trim(),
              notes: taskModalNotes.trim() || undefined,
              category: taskModalCategory || undefined,
              priority: taskModalPriority,
              status: taskModalStatus,
              dueDate: taskModalDueDate.trim() || undefined,
              checklist: checklistItems.length > 0 ? checklistItems : undefined,
            }
          : t,
      );
    } else {
      const newTask: WorkspaceTask = {
        id: `task-${Date.now()}`,
        text: taskModalTitle.trim(),
        notes: taskModalNotes.trim() || undefined,
        category: taskModalCategory || undefined,
        status: taskModalStatus,
        priority: taskModalPriority,
        dueDate: taskModalDueDate.trim() || undefined,
        checklist: checklistItems.length > 0 ? checklistItems : undefined,
        createdAt: Math.floor(Date.now() / 1000),
      };
      updatedTasks = [...(activeWorkspace.tasks || []), newTask];
    }

    setIsTaskModalOpen(false);
    setEditingTaskModalId(null);
    const result = await persistWorkspace({
      ...activeWorkspace,
      tasks: updatedTasks,
    });
    if (result.ok) {
      setNotification({
        type: "success",
        text: editingTaskModalId
          ? isRtl
            ? "تم تحديث المهمة وحفظها بنجاح."
            : "Task updated and saved."
          : isRtl
            ? "تمت إضافة المهمة وحفظها بنجاح."
            : "Task added and saved.",
      });
    } else {
      setNotification({
        type: "error",
        text:
          result.error ||
          (isRtl
            ? "تم حفظ المهمة محلياً، لكن تعذر المزامنة مع الخادم."
            : "Task saved locally, but failed to sync to backend."),
      });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!activeWorkspace) return;
    if (editingTaskModalId === taskId) {
      setIsTaskModalOpen(false);
      setEditingTaskModalId(null);
    }
    const updatedTasks = (activeWorkspace.tasks || []).filter(
      (task) => task.id !== taskId,
    );
    await persistWorkspace({ ...activeWorkspace, tasks: updatedTasks });
  };

  const handleSaveNotesInline = async () => {
    if (!activeWorkspace) return;
    setSavingNotes(true);
    try {
      await persistWorkspace({
        ...activeWorkspace,
        notes: notesDraft,
      });
      setIsEditingNotes(false);
      setNotification({
        type: "success",
        text: isRtl
          ? "تم حفظ ملاحظات المشروع وتحديث دليل الهوية styleguide.html بنجاح!"
          : "Saved brand guidelines notes and regenerated styleguide.html!",
      });
    } finally {
      setSavingNotes(false);
    }
  };

  const swatchesToDrafts = (swatches: ColorSwatch[]): ModalSwatchDraft[] =>
    (swatches.length > 0 ? swatches : PALETTE_STARTER_PRESETS.plum.swatches).map(
      (s, idx) => ({
        id: `sw-${idx}-${Date.now()}`,
        name: s.name || `Color ${idx + 1}`,
        hex: normalizeHexColor(s.hex || "#F16B50"),
        role: s.role || "accent",
      }),
    );

  const openCreateModal = () => {
    setEditingWorkspaceId(null);
    setFormName("");
    setFormClient("");
    setFormCategory("Branding & Visual Identity");
    setFormCampaign("");
    setFormDeadline("");
    setFormHeadingFont("");
    setFormBodyFont("");
    setFormAccentFont("");
    setFormCustomFonts([]);
    setFormPalettePreset("plum");
    setFormPalette(swatchesToDrafts(PALETTE_STARTER_PRESETS.plum.swatches));
    setFormDescription("");
    setFormNotes("");
    setFormLogoDataUrl("");
    setIsCreatingWorkspace(true);
  };

  const openEditModal = () => {
    if (!activeWorkspace) return;
    setEditingWorkspaceId(activeWorkspace.id);
    setFormName(activeWorkspace.name || "");
    setFormClient(activeWorkspace.client || "");
    setFormCategory(activeWorkspace.category || "Branding & Visual Identity");
    setFormCampaign(activeWorkspace.campaignName || "");
    setFormDeadline(activeWorkspace.deadline || "");
    setFormHeadingFont(
      getFontDisplayName(activeWorkspace.typography?.headingFont),
    );
    setFormBodyFont(getFontDisplayName(activeWorkspace.typography?.bodyFont));
    setFormAccentFont(
      getFontDisplayName(activeWorkspace.typography?.accentFont),
    );
    setFormCustomFonts(
      (activeWorkspace.customFonts || []).map((cf, idx) => ({
        id: cf.id || `cf-${idx}-${Date.now()}`,
        label: cf.label || "",
        value: getFontDisplayName(cf),
      })),
    );
    setFormPalette(swatchesToDrafts(activeWorkspace.palette || []));
    setFormPalettePreset("");
    setFormDescription(activeWorkspace.description || "");
    setFormNotes(activeWorkspace.notes || "");
    setFormLogoDataUrl(activeWorkspace.logoDataUrl || "");
    setIsCreatingWorkspace(true);
  };

  const handleApplyModalPreset = (presetId: string) => {
    const preset = PALETTE_STARTER_PRESETS[presetId];
    if (!preset) return;
    setFormPalettePreset(presetId);
    setFormPalette(swatchesToDrafts(preset.swatches));
  };

  const handleAddModalFontRole = () => {
    setFormCustomFonts((prev) => [
      ...prev,
      {
        id: `cf-${Date.now()}-${prev.length}`,
        label: "",
        value: "",
      },
    ]);
  };

  const handleAddModalSwatch = () => {
    setFormPalette((prev) => [
      ...prev,
      {
        id: `sw-${Date.now()}-${prev.length}`,
        name: "",
        hex: "#B7A1D9",
        role: "accent",
      },
    ]);
  };

  const handleLogoFileSelected = (file?: File | null) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setNotification({
        type: "error",
        text: isRtl
          ? "حجم الشعار يجب أن لا يتجاوز 2 ميجابايت"
          : "Logo file must be under 2 MB",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setFormLogoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const LOGO_EXTRACTED_ROLES = [
    "primary",
    "secondary",
    "accent",
    "surface",
    "background",
  ] as const;

  const handleExtractPaletteInModal = async () => {
    if (!formLogoDataUrl || extractingLogoPalette) return;
    setExtractingLogoPalette(true);
    try {
      const hexes = await extractPaletteFromLogoUrl(formLogoDataUrl, 5);
      if (hexes.length === 0) {
        setNotification({
          type: "info",
          text: isRtl
            ? "تعذر استخراج ألوان واضحة من الشعار."
            : "Could not extract distinct colors from this logo.",
        });
        return;
      }
      setFormPalettePreset("");
      setFormPalette(
        hexes.map((hex, idx) => ({
          id: `logo-sw-${Date.now()}-${idx}`,
          name: isRtl ? `لون الشعار ${idx + 1}` : `Logo Tone ${idx + 1}`,
          hex,
          role: LOGO_EXTRACTED_ROLES[idx] || "accent",
        })),
      );
      setNotification({
        type: "success",
        text: isRtl
          ? `تم استخراج ${hexes.length} ألوان مميزة من الشعار بنجاح!`
          : `Extracted ${hexes.length} distinct brand colors from logo!`,
      });
    } finally {
      setExtractingLogoPalette(false);
    }
  };

  const handleExtractPaletteFromActiveLogo = async () => {
    if (!activeWorkspace?.logoDataUrl || extractingLogoPalette) return;
    setExtractingLogoPalette(true);
    try {
      const hexes = await extractPaletteFromLogoUrl(
        activeWorkspace.logoDataUrl,
        5,
      );
      if (hexes.length === 0) {
        setNotification({
          type: "info",
          text: isRtl
            ? "تعذر استخراج ألوان واضحة من شعار المشروع."
            : "Could not extract distinct colors from workspace logo.",
        });
        return;
      }
      const existing = activeWorkspace.palette || [];
      const existingHexSet = new Set(
        existing.map((c) => normalizeHexColor(c.hex)),
      );
      const additions: ColorSwatch[] = hexes
        .filter((h) => !existingHexSet.has(h))
        .map((hex, idx) => ({
          name: isRtl ? `لون الشعار ${idx + 1}` : `Logo Tone ${idx + 1}`,
          hex,
          role: LOGO_EXTRACTED_ROLES[idx] || "accent",
        }));

      if (additions.length === 0) {
        setNotification({
          type: "info",
          text: isRtl
            ? "جميع ألوان الشعار المستخرجة موجودة بالفعل في لوحة الألوان."
            : "All extracted logo colors are already in this palette.",
        });
        return;
      }
      await persistWorkspaceWithPalette({
        ...activeWorkspace,
        palette: [...existing, ...additions],
      });
      setNotification({
        type: "success",
        text: isRtl
          ? `تم استخراج وإضافة ${additions.length} ألوان جديدة من شعار المشروع وحفظها في palette.ase!`
          : `Extracted & added ${additions.length} brand colors from logo to palette.ase!`,
      });
    } finally {
      setExtractingLogoPalette(false);
    }
  };

  const createFolderAtPath = async (
    relativePath: string,
    friendlyName?: string,
  ) => {
    if (!activeWorkspace || !relativePath.trim()) return;
    const cleanRel = relativePath
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "");
    const parts = cleanRel.split("/");
    const folderName = parts.pop() || cleanRel;
    const parentPath = parts.join("/");

    setCreatingSubfolder(true);
    try {
      const res = await safeFetchJson<any>(
        `/api/workspaces/${activeWorkspace.id}/folders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parentPath,
            folderName,
            relativePath: cleanRel,
          }),
          timeoutMs: 5000,
        },
      );
      if (res && res.success === false) {
        setNotification({
          type: "error",
          text:
            res.error ||
            (isRtl ? "تعذر إنشاء المجلد الفرعي." : "Failed to create folder."),
        });
        return;
      }
      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id !== activeWorkspace.id) return w;
          const nextFolders = Array.from(
            new Set([...(w.folders || []), cleanRel]),
          );
          return { ...w, folders: nextFolders };
        }),
      );
      setCurrentFolderPath(cleanRel);
      setNotification({
        type: "success",
        text: isRtl
          ? `تم إنشاء وفتح مجلد "${friendlyName || cleanRel}"`
          : `Created & opened folder "${friendlyName || cleanRel}"`,
      });
    } finally {
      setCreatingSubfolder(false);
    }
  };

  const handleCreateNestedFolder = async () => {
    if (!activeWorkspace || !newSubfolderName.trim()) return;
    const cleanSeg = newSubfolderName.trim().replace(/[/\\:*?"<>|&]/g, "-");
    const relativePath = currentFolderPath
      ? `${currentFolderPath}/${cleanSeg}`
      : `Designs/${cleanSeg}`;
    setNewSubfolderName("");
    await createFolderAtPath(relativePath);
  };

  const handleDeleteSubfolder = async (relFolder: string) => {
    if (!activeWorkspace || isProtectedRootFolder(relFolder)) return;
    const res = await safeFetchJson<any>(
      `/api/workspaces/${activeWorkspace.id}/folders?path=${encodeURIComponent(relFolder)}`,
      {
        method: "DELETE",
        timeoutMs: 5000,
      },
    );
    if (res && res.success === false) {
      setNotification({
        type: "error",
        text:
          res.error ||
          (isRtl ? "تعذر حذف المجلد الفرعي." : "Could not delete subfolder."),
      });
      return;
    }
    const lowerTarget = relFolder.toLowerCase();
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== activeWorkspace.id) return w;
        const nextFolders = (w.folders || []).filter((f) => {
          const fl = f.replace(/\\/g, "/").toLowerCase();
          return fl !== lowerTarget && !fl.startsWith(`${lowerTarget}/`);
        });
        const prevSub = w.subfolders || subfolders;
        const nextDesigns = (prevSub.designs || []).filter((d) => {
          const dSub = String(d.subfolder || d.relativePath || "")
            .replace(/\\/g, "/")
            .toLowerCase();
          return dSub !== lowerTarget && !dSub.startsWith(`${lowerTarget}/`);
        });
        return {
          ...w,
          folders: nextFolders,
          subfolders: { ...prevSub, designs: nextDesigns },
        };
      }),
    );
    if (
      currentFolderPath.toLowerCase() === lowerTarget ||
      currentFolderPath.toLowerCase().startsWith(`${lowerTarget}/`)
    ) {
      const parent = relFolder.split("/").slice(0, -1).join("/");
      setCurrentFolderPath(parent || "Designs");
    }
    setNotification({
      type: "success",
      text: isRtl
        ? `تم حذف المجلد "${getFriendlyFolderLabel(relFolder)}" بنجاح.`
        : `Deleted folder "${getFriendlyFolderLabel(relFolder)}".`,
    });
  };

  const appendUploadedDesigns = (newDesigns: WorkspaceDesignFile[]) => {
    if (!activeWorkspace || newDesigns.length === 0) return;
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== activeWorkspace.id) return w;
        const prevSub = w.subfolders || {
          fonts: [],
          designs: [],
          palettes: [],
          guidelines: [],
        };
        const existingKeys = new Set(
          (prevSub.designs || []).map((d) => getDesignAssetKey(d)),
        );
        const dedupedNew = newDesigns.filter(
          (d) => !existingKeys.has(getDesignAssetKey(d)),
        );
        return {
          ...w,
          subfolders: {
            ...prevSub,
            designs: [...dedupedNew, ...(prevSub.designs || [])],
          },
        };
      }),
    );
  };

  const handleUploadDesigns = async (fileList?: FileList | File[] | null) => {
    if (!activeWorkspace || !fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setUploadingDesign(true);
    const uploadedDesigns: WorkspaceDesignFile[] = [];
    const failedFiles: string[] = [];
    let lastError = "";
    try {
      for (const file of files) {
        const res = await safeFetch(
          `/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/upload-design?fileName=${encodeURIComponent(file.name)}&subfolder=${encodeURIComponent(currentFolderPath || "Designs")}`,
          {
            method: "POST",
            body: file,
            timeoutMs: 30000,
          },
        );
        if (!res) {
          failedFiles.push(file.name);
          lastError = isRtl
            ? "تعذر الاتصال بالخادم أو انتهت المهلة"
            : "Server unreachable or request timed out";
          continue;
        }
        let data: any = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        if (!res.ok) {
          failedFiles.push(file.name);
          lastError =
            data?.error || res.statusText || `HTTP ${res.status}`;
          continue;
        }
        if (data?.success && data.design) {
          uploadedDesigns.push(data.design);
        } else {
          failedFiles.push(file.name);
          lastError =
            data?.error ||
            (isRtl ? "استجابة غير متوقعة من الخادم" : "Unexpected server response");
        }
      }
      if (uploadedDesigns.length > 0) {
        appendUploadedDesigns(uploadedDesigns);
      }
      if (failedFiles.length > 0 && uploadedDesigns.length === 0) {
        setNotification({
          type: "error",
          text: isRtl
            ? `فشل رفع ملف التصميم (${failedFiles.join(", ")}): ${lastError}`
            : `Failed to upload design file(s) (${failedFiles.join(", ")}): ${lastError}`,
        });
      } else if (failedFiles.length > 0 && uploadedDesigns.length > 0) {
        setNotification({
          type: "error",
          text: isRtl
            ? `تم رفع ${uploadedDesigns.length} ملف، وفشل رفع: ${failedFiles.join(", ")} (${lastError})`
            : `Uploaded ${uploadedDesigns.length} file(s), failed: ${failedFiles.join(", ")} (${lastError})`,
        });
      } else if (uploadedDesigns.length > 0) {
        setNotification({
          type: "success",
          text: isRtl
            ? `تم رفع ${uploadedDesigns.length} ملف تصميم إلى مجلد "${currentFolderPath || "Designs"}" بنجاح!`
            : `Uploaded ${uploadedDesigns.length} design file(s) to "${currentFolderPath || "Designs"}"!`,
        });
      }
    } finally {
      setUploadingDesign(false);
    }
  };

  const handleImportDesignDialog = async () => {
    if (!activeWorkspace || importingDesign) return;
    setImportingDesign(true);
    try {
      const res = await safeFetch(
        `/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/import-design-dialog`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subfolder: currentFolderPath || "Designs",
          }),
          timeoutMs: 60000,
        },
      );
      if (!res || res.status === 404 || res.status === 501) {
        // Web preview / non-desktop fallback
        designInputRef.current?.click();
        return;
      }
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        setNotification({
          type: "error",
          text:
            data?.error ||
            (isRtl
              ? `فشل استيراد ملف التصميم (${res.status}).`
              : `Failed to import design file (${res.status}).`),
        });
        return;
      }
      if (data?.cancelled) return;
      if (data?.fallback) {
        designInputRef.current?.click();
        return;
      }
      const imported: WorkspaceDesignFile[] = Array.isArray(data?.designs)
        ? data.designs
        : data?.design
          ? [data.design]
          : [];
      if (data?.success && imported.length > 0) {
        appendUploadedDesigns(imported);
        setNotification({
          type: "success",
          text: isRtl
            ? `تم استيراد ${imported.length} ملف تصميم إلى مجلد "${currentFolderPath || "Designs"}" بنجاح!`
            : `Imported ${imported.length} design file(s) into "${currentFolderPath || "Designs"}"!`,
        });
      } else {
        setNotification({
          type: "error",
          text:
            data?.error ||
            (isRtl
              ? "تعذر استيراد ملف التصميم المحدد."
              : "Could not import selected design file."),
        });
      }
    } finally {
      setImportingDesign(false);
    }
  };

  const handleOpenStyleGuide = async () => {
    if (!activeWorkspace || openingStyleGuide) return;
    setOpeningStyleGuide(true);
    try {
      let res = await safeFetch(styleGuideAssetUrl, { timeoutMs: 5000 });
      if (res && res.status === 404) {
        await persistWorkspace(activeWorkspace);
        res = await safeFetch(styleGuideAssetUrl, { timeoutMs: 5000 });
      }
      if (res && res.ok) {
        const htmlText = await res.text();
        const win =
          typeof window !== "undefined"
            ? window.open(styleGuideAssetUrl, "_blank", "noopener,noreferrer")
            : null;
        if (!win) {
          setStyleGuidePreviewHtml(htmlText);
        }
        return;
      }
      setStyleGuidePreviewHtml(
        buildClientStyleGuideHtml(activeWorkspace, isRtl),
      );
    } finally {
      setOpeningStyleGuide(false);
    }
  };

  const resolveFontSelection = (
    inputVal: string,
    fallbackName?: string,
  ): TypographyFontObject | undefined => {
    const clean = (inputVal || "").trim();
    if (!clean && !fallbackName) return undefined;
    const query = clean || fallbackName || "";
    const matched = effectiveFonts.find((f: any) => {
      const label = formatLibraryFontOptionLabel(f);
      return (
        String(f.id) === query ||
        label.toLowerCase() === query.toLowerCase() ||
        (f.family || "").toLowerCase() === query.toLowerCase() ||
        (f.displayName || "").toLowerCase() === query.toLowerCase() ||
        (f.name || "").toLowerCase() === query.toLowerCase()
      );
    });
    if (matched) {
      return {
        name: matched.displayName || matched.name || matched.family,
        fontId: Number(matched.id) || undefined,
        family: matched.family || matched.name,
        style: matched.style || "Regular",
        path: matched.path,
      };
    }
    return { name: query, family: query };
  };

  const handleCreateWorkspace = async (e: any) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const headingSlot = resolveFontSelection(formHeadingFont, "Inter Display")!;
    const bodySlot = resolveFontSelection(formBodyFont, "Tajawal")!;
    const accentSlot = resolveFontSelection(formAccentFont, "JetBrains Mono")!;

    const resolvedCustomFonts: WorkspaceCustomFont[] = formCustomFonts
      .map((cf, idx) => {
        const resolved = resolveFontSelection(cf.value);
        if (!resolved && !cf.label.trim()) return null;
        return {
          id: cf.id || `cf-${idx}`,
          label:
            cf.label.trim() ||
            (isRtl ? `خط مخصص ${idx + 1}` : `Custom Role ${idx + 1}`),
          ...(resolved || { name: cf.value.trim(), family: cf.value.trim() }),
        } as WorkspaceCustomFont;
      })
      .filter((x): x is WorkspaceCustomFont => Boolean(x));

    const cleanPalette: ColorSwatch[] = formPalette
      .map((sw, idx) => {
        const hex = normalizeHexColor(sw.hex);
        const name = sw.name.trim() || `Brand Color ${idx + 1}`;
        const role = sw.role.trim() || "accent";
        return { name, hex, role };
      })
      .filter((sw) => Boolean(sw.hex));

    const finalPalette =
      cleanPalette.length > 0
        ? cleanPalette
        : PALETTE_STARTER_PRESETS.plum.swatches;

    const allRoleSlots: TypographyFontObject[] = [
      headingSlot,
      bodySlot,
      accentSlot,
      ...resolvedCustomFonts,
    ];

    if (editingWorkspaceId) {
      const target = workspaces.find((w) => w.id === editingWorkspaceId);
      const syncedProjectFonts = buildSyncedProjectFonts(
        allRoleSlots,
        target?.projectFonts || [],
      );
      const syncedSubfolderFonts = syncedProjectFonts.map((pf, i) => {
        const existingMatch = target?.subfolders?.fonts?.find(
          (ef) =>
            (pf.fontId && String(ef.id) === String(pf.fontId)) ||
            (pf.path && ef.path === pf.path) ||
            (pf.name && ef.name === pf.name),
        );
        return {
          id: existingMatch?.id ?? pf.fontId ?? `pf-${i}`,
          name: pf.name || pf.family || "Font",
          family: pf.family || pf.name || "Font",
          format: pf.style || existingMatch?.format || "TTF",
          path: pf.path || `Fonts\\${pf.name || "Font"}`,
          isActive: Boolean(existingMatch?.isActive),
        };
      });

      const updated: Workspace = {
        ...(target || ({} as Workspace)),
        id: editingWorkspaceId,
        name: formName.trim(),
        client: formClient.trim() || "Internal Project",
        category: formCategory,
        business: formCategory,
        campaignName: formCampaign.trim() || undefined,
        deadline: formDeadline.trim() || undefined,
        logoDataUrl: formLogoDataUrl || undefined,
        description:
          formDescription.trim() ||
          target?.description ||
          "Designer project workspace.",
        notes: formNotes.trim() || target?.notes || "",
        typography: {
          ...(target?.typography || {}),
          headingFont: headingSlot,
          bodyFont: bodySlot,
          accentFont: accentSlot,
        },
        customFonts: resolvedCustomFonts,
        projectFonts: syncedProjectFonts,
        palette: finalPalette,
        subfolders: target?.subfolders
          ? {
              ...target.subfolders,
              fonts: syncedSubfolderFonts,
              palettes: (target.subfolders.palettes || []).map((p, i) =>
                i === 0 ? { ...p, swatchesCount: finalPalette.length } : p,
              ),
            }
          : undefined,
      };
      const payloadForApi: any = { ...updated };
      delete payloadForApi.subfolders;

      const saved = await safeFetchJson<any>(
        `/api/workspaces/${editingWorkspaceId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadForApi),
          timeoutMs: 6000,
        },
      );
      await safeFetchJson<any>("/api/workspaces/save-palette", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: editingWorkspaceId,
          palette: finalPalette,
        }),
        timeoutMs: 5000,
      });

      const finalWs: Workspace =
        saved && saved.id
          ? {
              ...updated,
              ...saved,
              subfolders: updated.subfolders || saved.subfolders,
            }
          : updated;
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === editingWorkspaceId ? finalWs : w)),
      );
      setIsCreatingWorkspace(false);
      setEditingWorkspaceId(null);
      setNotification({
        type: "success",
        text: isRtl
          ? `تم تحديث المشروع "${finalWs.name}" ومزامنة الخطوط والألوان في مجلد المشروع.`
          : `Updated "${finalWs.name}" and synced fonts & palette to disk.`,
      });
      return;
    }

    const baseSlug =
      formName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || `ws-${Date.now()}`;
    const newId = workspaces.some((w) => w.id === baseSlug)
      ? `${baseSlug}-${Date.now().toString().slice(-4)}`
      : baseSlug;
    const syncedProjectFonts = buildSyncedProjectFonts(allRoleSlots, []);

    const newWs: Workspace = {
      id: newId,
      name: formName.trim(),
      client: formClient.trim() || "Internal Project",
      category: formCategory,
      business: formCategory,
      campaignName: formCampaign.trim() || undefined,
      deadline: formDeadline.trim() || undefined,
      logoDataUrl: formLogoDataUrl || undefined,
      description: formDescription.trim() || "Designer project workspace.",
      folders: ["Fonts", "Designs", "Palettes", "Guidelines"],
      typography: {
        headingFont: headingSlot,
        bodyFont: bodySlot,
        accentFont: accentSlot,
        previewHeading: "Design Systems & Typographic Hierarchy",
        previewBody:
          "Consistent font pairings and harmonic color palettes create intuitive, beautiful user experiences.",
      },
      customFonts: resolvedCustomFonts,
      projectFonts: syncedProjectFonts,
      palette: finalPalette,
      notes:
        formNotes.trim() ||
        "Initial creative direction notes and project deliverables.",
      tasks: [
        {
          id: "t1",
          text: "Select heading and body typography pairings",
          status: "done",
          priority: "high",
          createdAt: Math.floor(Date.now() / 1000),
        },
        {
          id: "t2",
          text: "Audit WCAG 2.1 AA color contrast matrix",
          status: "in_progress",
          priority: "medium",
          createdAt: Math.floor(Date.now() / 1000),
        },
        {
          id: "t3",
          text: "Export client handoff bundle",
          status: "todo",
          priority: "medium",
          createdAt: Math.floor(Date.now() / 1000),
        },
      ],
    };

    const saved = await safeFetchJson<any>("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newWs),
      timeoutMs: 6000,
    });
    const finalWs: Workspace =
      saved && saved.id ? { ...newWs, ...saved } : newWs;
    setWorkspaces((prev) => [finalWs, ...prev]);
    setSelectedId(finalWs.id);
    setCurrentFolderPath("Designs");
    setIsCreatingWorkspace(false);
    setNotification({
      type: "success",
      text: isRtl
        ? `تم إنشاء مساحة العمل "${finalWs.name}" ومزامنة الخطوط والألوان على القرص.`
        : `Created workspace "${finalWs.name}" and synced fonts & palette to disk.`,
    });
  };

  const handleDeleteWorkspace = async (id: string) => {
    if (workspaces.length <= 1) return;
    const deletedName = workspaces.find((w) => w.id === id)?.name || id;
    const remaining = workspaces.filter((w) => w.id !== id);
    setConfirmDeleteWsId(null);
    setWorkspaces(remaining);
    setSelectedId(remaining[0].id);
    await safeFetchJson<any>(`/api/workspaces/${encodeURIComponent(id)}`, {
      method: "DELETE",
      timeoutMs: 5000,
    });
    setNotification({
      type: "success",
      text: isRtl
        ? `تم حذف مشروع "${deletedName}" من القائمة والقرص بنجاح.`
        : `Deleted workspace "${deletedName}" from disk.`,
    });
  };

  const currentTasks = activeWorkspace?.tasks || [];
  const completedTasks = currentTasks.filter(
    (task) => task.status === "done",
  ).length;
  const progressPercent =
    currentTasks.length > 0
      ? Math.round((completedTasks / currentTasks.length) * 100)
      : 0;

  const filteredTasks = currentTasks.filter((task) => {
    if (taskFilter === "all") return true;
    return task.status === taskFilter;
  });

  const primarySwatchHex = activeWorkspace?.palette?.[0]?.hex || "#F16B50";
  const harmonySuggestions = generateHarmonies(primarySwatchHex);
  const projectDeadlineMeta = getDeadlineMeta(
    activeWorkspace.deadline,
    false,
    isRtl,
  );
  const styleGuideAssetUrl = `/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/asset?path=Guidelines/styleguide.html`;

  const SELECT_APPEARANCE_STYLE: React.CSSProperties = {
    WebkitAppearance: "none",
    MozAppearance: "none",
    appearance: "none",
    backgroundImage: "none",
  };

  const renderFontRoleSelect = (
    onSelectValue: (val: string) => void,
    ariaLabel: string,
  ) => (
    <div className="relative">
      <select
        value=""
        aria-label={ariaLabel}
        style={SELECT_APPEARANCE_STYLE}
        onChange={(e) => {
          if (e.target.value) onSelectValue(e.target.value);
        }}
        className="w-full appearance-none !appearance-none bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl ps-3 pe-8 py-1.5 text-[11px] text-[var(--color-text-muted)] outline-none cursor-pointer"
      >
        <option value="">
          {sortedLibraryFonts.all.length > 0
            ? isRtl
              ? "اختر من مكتبة الخطوط..."
              : "Pick from library fonts..."
            : isRtl
              ? "اكتب اسم الخط يدوياً أدناه"
              : "Type font name below"}
        </option>
        {sortedLibraryFonts.nonSystem.length > 0 && (
          <optgroup
            label={isRtl ? "خطوط المستخدم والمشاريع" : "Library & Custom Fonts"}
          >
            {sortedLibraryFonts.nonSystem.map((f: any) => {
              const label = formatLibraryFontOptionLabel(f);
              return (
                <option key={`ns-${f.id}`} value={label}>
                  {label}
                </option>
              );
            })}
          </optgroup>
        )}
        {sortedLibraryFonts.system.length > 0 && (
          <optgroup label={isRtl ? "خطوط النظام" : "System Fonts"}>
            {sortedLibraryFonts.system.map((f: any) => {
              const label = formatLibraryFontOptionLabel(f);
              return (
                <option key={`sys-${f.id}`} value={label}>
                  {label}
                </option>
              );
            })}
          </optgroup>
        )}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)] pointer-events-none absolute top-1/2 -translate-y-1/2 end-2.5" />
    </div>
  );

  const renderPriorityBadge = (priority?: string) => {
    const p = (priority || "medium").toLowerCase();
    const styles =
      p === "high"
        ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
        : p === "low"
          ? "bg-[#B7A1D9]/15 text-[#B7A1D9] border-[#B7A1D9]/30"
          : "bg-amber-500/15 text-amber-400 border-amber-500/30";
    const label = isRtl
      ? p === "high"
        ? "أولوية عالية"
        : p === "low"
          ? "منخفضة"
          : "متوسطة"
      : p === "high"
        ? "High"
        : p === "low"
          ? "Low"
          : "Medium";

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-sans font-semibold whitespace-nowrap ${styles}`}
      >
        <Flag className="w-2.5 h-2.5 shrink-0" />
        <span>{label}</span>
      </span>
    );
  };

  return (
    <div
      className="flex-1 flex flex-col lg:flex-row overflow-hidden min-w-0 bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* 1. Responsive Workspace Selector */}
      <aside
        data-testid="workspaces-sidebar"
        data-collapsed={sidebarCollapsed ? "true" : "false"}
        className={`${
          sidebarCollapsed ? "lg:w-14 shrink-0 overflow-hidden" : "lg:w-56 xl:w-64 shrink-0"
        } w-full border-b lg:border-b-0 lg:border-r rtl:lg:border-l rtl:lg:border-r-0 border-[var(--color-border)] flex flex-col bg-[var(--color-back-side)]/50 transition-all duration-200 max-h-48 lg:max-h-none`}
      >
        <div
          className={`${
            sidebarCollapsed
              ? "p-2 flex flex-row lg:flex-col items-center justify-between lg:justify-center gap-1.5"
              : "p-3 sm:p-3.5 flex items-center justify-between gap-2"
          } border-b border-[var(--color-border)] shrink-0`}
        >
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <Briefcase className="w-4 h-4 text-[var(--color-action)] shrink-0" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-header)] truncate">
                {isRtl ? "مشاريع واستوديوهات العمل" : "Project Workspaces"}
              </h2>
            </div>
          )}
          <div
            className={`${
              sidebarCollapsed
                ? "flex flex-row lg:flex-col items-center gap-1.5 mx-auto"
                : "flex items-center gap-1 shrink-0"
            }`}
          >
            <button
              onClick={() => setSidebarCollapsed((p) => !p)}
              data-testid="workspaces-sidebar-toggle"
              className={`hidden lg:flex ${
                sidebarCollapsed ? "w-9 h-9 mx-auto" : "h-7 w-7"
              } items-center justify-center rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] border border-[var(--color-border)] transition cursor-pointer shrink-0`}
              title={
                sidebarCollapsed
                  ? isRtl
                    ? "توسيع القائمة"
                    : "Expand sidebar"
                  : isRtl
                    ? "تصغير القائمة لمساحة أكبر"
                    : "Collapse sidebar"
              }
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={openCreateModal}
              data-testid="workspaces-new-btn"
              className={`${
                sidebarCollapsed ? "w-9 h-9 mx-auto" : "h-7 w-7"
              } flex items-center justify-center rounded-lg bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white transition cursor-pointer shadow-2xs shrink-0`}
              title={isRtl ? "مشروع جديد" : "New Project"}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Workspaces List */}
        <div
          className={`flex lg:flex-col overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto flex-1 ${
            sidebarCollapsed ? "p-1.5 gap-1.5 lg:items-center" : "p-2 gap-1.5"
          }`}
        >
          {workspaces.map((ws) => {
            const isSelected = ws.id === selectedId;
            const taskCount = ws.tasks?.length || 0;
            const doneCount =
              ws.tasks?.filter((task) => task.status === "done").length || 0;
            const primaryHex = ws.palette?.[0]?.hex || "#F16B50";
            const initials = (ws.name || "WS")
              .split(/\s+/)
              .slice(0, 2)
              .map((s: string) => s[0])
              .join("")
              .toUpperCase();

            return (
              <div
                key={ws.id}
                onClick={() => {
                  setSelectedId(ws.id);
                  setCurrentFolderPath("Designs");
                }}
                className={`${
                  sidebarCollapsed
                    ? "p-1 flex items-center justify-center mx-auto shrink-0"
                    : "p-2.5 sm:p-3 flex flex-col gap-1.5 min-w-[200px] lg:min-w-0 shrink-0 lg:shrink"
                } rounded-xl border transition cursor-pointer ${
                  isSelected
                    ? "bg-[var(--color-control)] border-[var(--color-action)] shadow-xs"
                    : "bg-transparent border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-control)]/40"
                }`}
                title={ws.name}
              >
                {sidebarCollapsed ? (
                  ws.logoDataUrl ? (
                    <img
                      src={ws.logoDataUrl}
                      alt={ws.name}
                      className="w-9 h-9 mx-auto rounded-lg object-cover border border-[var(--color-border)] shrink-0"
                    />
                  ) : (
                    <div
                      className="w-9 h-9 mx-auto rounded-lg flex items-center justify-center text-[11px] font-black text-white shadow-2xs shrink-0"
                      style={{ backgroundColor: primaryHex }}
                    >
                      {initials}
                    </div>
                  )
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {ws.logoDataUrl ? (
                          <img
                            src={ws.logoDataUrl}
                            alt={ws.name}
                            className="w-6 h-6 rounded-md object-cover border border-[var(--color-border)] shrink-0"
                          />
                        ) : (
                          <div
                            className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black text-white shrink-0"
                            style={{ backgroundColor: primaryHex }}
                          >
                            {initials}
                          </div>
                        )}
                        <span
                          dir="auto"
                          className={`text-xs font-bold truncate ${isSelected ? "text-[var(--color-text-header)]" : "text-[var(--color-text-main)]"}`}
                        >
                          {ws.name}
                        </span>
                      </div>
                      <span
                        dir="ltr"
                        className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-[var(--color-control)] text-[var(--color-text-muted)] border border-[var(--color-border)] shrink-0"
                      >
                        {doneCount}/{taskCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                      <span dir="auto" className="truncate max-w-[125px]">
                        {ws.client}
                      </span>
                      <span className="text-[10px] opacity-80 truncate font-sans">
                        {
                          localizeWorkspaceCategory(ws.category, isRtl).split(
                            "/",
                          )[0]
                        }
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <div className="flex items-center gap-1">
                        {(ws.palette || [])
                          .slice(0, 5)
                          .map((c: any, i: number) => (
                            <div
                              key={i}
                              className="w-3.5 h-1.5 rounded-xs"
                              style={{ backgroundColor: c.hex }}
                              title={`${c.name} (${c.hex})`}
                            />
                          ))}
                      </div>
                      {ws.deadline && (
                        <span
                          dir="ltr"
                          className="text-[9px] font-mono text-[var(--color-text-dim)] flex items-center gap-0.5 shrink-0"
                        >
                          <Calendar className="w-2.5 h-2.5 text-[var(--color-action)]" />
                          {ws.deadline}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* 2. Main Workspace Detail Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7 min-w-0">
        <div className="max-w-7xl mx-auto w-full space-y-6">
          {notification && (
            <div
              aria-live="polite"
              className="p-3 rounded-xl bg-[var(--color-action)]/15 border border-[var(--color-action)] text-[var(--color-text-header)] text-xs flex items-center justify-between gap-3 animate-in fade-in"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                <span dir="auto" className="min-w-0 break-words">
                  {notification.text}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setNotification(null)}
                className="text-[11px] underline opacity-75 hover:opacity-100 cursor-pointer shrink-0"
              >
                {isRtl ? "إغلاق" : "Dismiss"}
              </button>
            </div>
          )}

          {/* Workspace Hero Header */}
          <div className="p-4 sm:p-6 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-4 shadow-xs min-w-0">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row items-start gap-4 w-full min-w-0">
                <div className="relative group shrink-0">
                  {activeWorkspace.logoDataUrl ? (
                    <img
                      src={activeWorkspace.logoDataUrl}
                      alt={activeWorkspace.name}
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border border-[var(--color-border)] shadow-sm bg-[var(--color-back-main)]"
                    />
                  ) : (
                    <div
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-lg sm:text-xl font-black text-white shadow-sm border border-white/10"
                      style={{ backgroundColor: primarySwatchHex }}
                    >
                      {(activeWorkspace.name || "WS")
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((s: string) => s[0])
                        .join("")
                        .toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 w-full">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-md bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-action)] font-bold ${
                        isRtl ? "font-sans" : "font-mono uppercase tracking-wider"
                      }`}
                    >
                      {localizeWorkspaceCategory(activeWorkspace.category, isRtl)}
                    </span>
                    {activeWorkspace.campaignName && (
                      <span
                        dir="auto"
                        className="text-[11px] px-2 py-0.5 rounded-md bg-[#B7A1D9]/15 text-[#B7A1D9] border border-[#B7A1D9]/30 font-semibold"
                      >
                        {activeWorkspace.campaignName}
                      </span>
                    )}
                    {projectDeadlineMeta && (
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-md border font-sans font-semibold ${
                          projectDeadlineMeta.tone === "overdue"
                            ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                            : projectDeadlineMeta.tone === "soon"
                              ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                              : "bg-emerald-500/12 text-emerald-400 border-emerald-500/30"
                        }`}
                      >
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span>
                          {isRtl ? "التسليم:" : "Deadline:"}{" "}
                          <bdi dir="ltr">{projectDeadlineMeta.formattedDate}</bdi>
                        </span>
                        <span className="opacity-85">
                          ({projectDeadlineMeta.label})
                        </span>
                      </span>
                    )}
                    {activeWorkspace.client && (
                      <span
                        dir="auto"
                        className="text-xs text-[var(--color-text-muted)]"
                      >
                        • {activeWorkspace.client}
                      </span>
                    )}
                  </div>
                  <h1
                    dir="auto"
                    className="text-xl sm:text-2xl lg:text-3xl font-black text-[var(--color-text-header)] mt-1.5 tracking-tight break-words"
                  >
                    {activeWorkspace.name}
                  </h1>
                  <p
                    dir="auto"
                    className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-1 max-w-4xl leading-relaxed break-words"
                  >
                    {activeWorkspace.description}
                  </p>
                </div>
              </div>

              {/* 1-Click Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--color-border-subtle)]/70">
                <button
                  onClick={openEditModal}
                  className="h-9 px-3.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] text-xs font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0"
                  title={
                    isRtl
                      ? "تعديل بيانات وشعار المشروع"
                      : "Edit Project Details & Logo"
                  }
                >
                  <Pencil className="w-3.5 h-3.5 text-[#B7A1D9] shrink-0" />
                  <span>{isRtl ? "تعديل المشروع" : "Edit Project"}</span>
                </button>
                <button
                  onClick={handleScanProjectFolder}
                  disabled={scanningFolder}
                  className="h-9 px-3.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] hover:border-[var(--color-action)] text-xs font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                  title={
                    isRtl
                      ? "فحص مجلد المشروع والمجلدات الفرعية لاكتشاف ملفات التصميم والخطوط"
                      : "Scan Project Folder & Subfolders for design files and fonts"
                  }
                >
                  {scanningFolder ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--color-action)] shrink-0" />
                  ) : (
                    <FolderSearch className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
                  )}
                  <span>
                    {scanningFolder
                      ? isRtl
                        ? "جاري الفحص..."
                        : "Scanning..."
                      : isRtl
                        ? "فحص المجلدات"
                        : "Scan Folders"}
                  </span>
                </button>

                <button
                  onClick={() => handleOpenInExplorer()}
                  className="h-9 px-3.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] text-xs font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0"
                  title={
                    isRtl
                      ? "فتح المجلد في الويندوز (Open in Explorer)"
                      : "Open Workspace Root Folder in Windows Explorer"
                  }
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{isRtl ? "فتح في Explorer" : "Open in Explorer"}</span>
                </button>

                <button
                  onClick={handleActivateRam}
                  disabled={activating}
                  className="h-9 px-3.5 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-bold shadow-xs flex items-center gap-2 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Zap className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span>
                    {activating
                      ? isRtl
                        ? "جاري التفعيل..."
                        : "Activating..."
                      : isRtl
                        ? "تفعيل الخطوط بالرام"
                        : "Activate in RAM"}
                  </span>
                </button>

                <a
                  href={`/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/export-bundle`}
                  download={`${activeWorkspace.id}-handover.zip`}
                  data-testid="export-handover-zip-btn"
                  className="h-9 px-3.5 rounded-xl bg-[#B7A1D9]/15 hover:bg-[#B7A1D9]/25 text-[#B7A1D9] border border-[#B7A1D9]/35 text-xs font-sans font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                  title={
                    isRtl
                      ? "تصدير حزمة التسليم الكاملة (الخطوط + الألوان + دليل الهوية + التصاميم) بصيغة ZIP"
                      : "Download full client handover archive (Fonts, Palette, StyleGuide, Designs) as .ZIP"
                  }
                >
                  <Package className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isRtl
                      ? "تصدير حزمة التسليم (.ZIP)"
                      : "Export Handover (.ZIP)"}
                  </span>
                </a>

                <button
                  onClick={handleExportBundle}
                  disabled={exporting}
                  className="h-9 px-3 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>{isRtl ? "تصدير (.ASE)" : "Export .ASE"}</span>
                </button>

                {workspaces.length > 1 &&
                  (confirmDeleteWsId === activeWorkspace.id ? (
                    <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 rounded-xl px-2.5 h-9 shrink-0">
                      <span className="text-[11px] font-bold text-rose-300 whitespace-nowrap">
                        {isRtl ? "تأكيد الحذف؟" : "Delete project?"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteWorkspace(activeWorkspace.id)}
                        className="px-2 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer"
                      >
                        {isRtl ? "نعم" : "Yes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteWsId(null)}
                        className="px-2 py-0.5 rounded-lg bg-[var(--color-control)] text-[var(--color-text-muted)] text-[11px] font-semibold cursor-pointer"
                      >
                        {isRtl ? "إلغاء" : "No"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteWsId(activeWorkspace.id)}
                      aria-label={isRtl ? "حذف المشروع" : "Delete project"}
                      title={
                        isRtl ? "حذف المشروع نهائياً" : "Delete Workspace"
                      }
                      className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-rose-500/10 text-[var(--color-text-dim)] hover:text-rose-400 border border-transparent hover:border-rose-500/20 transition cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ))}
              </div>
            </div>

            {/* Physical Disk Path & 4 Subfolder Cards */}
            <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-sans text-[var(--color-text-muted)] min-w-0">
                <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                  <HardDrive className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
                  <span className="text-[var(--color-text-dim)] font-semibold shrink-0">
                    {isRtl ? "مسار المشروع الفعلي:" : "Disk Path:"}
                  </span>
                  <span
                    dir="ltr"
                    className="font-mono text-[var(--color-text-header)] select-text break-all min-w-0"
                  >
                    {physicalPath}
                  </span>
                </div>
                <span
                  dir="ltr"
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold shrink-0"
                >
                  File-Backed Workspace
                </span>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
                {[
                  {
                    folder: "Fonts" as const,
                    title: "Fonts/",
                    subtitle: isRtl
                      ? "خطوط المشروع والخطوط المرفقة"
                      : "Project Font Files",
                    count: isRtl
                      ? `${subfolders.fonts?.length || 0} خط`
                      : `${subfolders.fonts?.length || 0} fonts`,
                  },
                  {
                    folder: "Designs" as const,
                    title: "Designs/",
                    subtitle: isRtl
                      ? "ملفات التصميم والمجلدات الفرعية"
                      : "PSD / AI / INDD / SVG",
                    count: isRtl
                      ? `${subfolders.designs?.length || 0} ملف`
                      : `${subfolders.designs?.length || 0} files`,
                  },
                  {
                    folder: "Palettes" as const,
                    title: "Palettes/",
                    subtitle: isRtl ? (
                      <>
                        لوحات الألوان وملفات <bdi dir="ltr">.ASE</bdi>
                      </>
                    ) : (
                      "palette.ase & Tokens"
                    ),
                    count: isRtl
                      ? `${activeWorkspace.palette?.length || 0} لون`
                      : `${activeWorkspace.palette?.length || 0} swatches`,
                  },
                  {
                    folder: "Guidelines" as const,
                    title: "Guidelines/",
                    subtitle: isRtl ? "دليل الهوية والمهام" : "Brand Guidelines",
                    count: isRtl
                      ? `${currentTasks.length} مهام`
                      : `${currentTasks.length} tasks`,
                  },
                ].map((sf) => (
                  <div
                    key={sf.folder}
                    onClick={() =>
                      setActiveSubfolderTab(
                        activeSubfolderTab === sf.folder ? "all" : sf.folder,
                      )
                    }
                    className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between gap-2.5 min-w-0 ${
                      activeSubfolderTab === sf.folder
                        ? "bg-[var(--color-action)]/15 border-[var(--color-action)]"
                        : "bg-[var(--color-back-main)] border-[var(--color-border)] hover:border-[var(--color-action)]/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <FolderOpen className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                        <span
                          dir="ltr"
                          className="text-xs font-mono font-bold text-[var(--color-text-header)] whitespace-nowrap"
                        >
                          {sf.title}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenInExplorer(sf.folder);
                        }}
                        aria-label={
                          isRtl
                            ? `فتح مجلد ${sf.title} في الويندوز`
                            : `Open ${sf.title} in Explorer`
                        }
                        className="h-7 w-7 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-action)] text-[var(--color-text-muted)] hover:text-white transition cursor-pointer flex items-center justify-center shrink-0"
                        title={
                          isRtl
                            ? `فتح مجلد ${sf.title} في الويندوز`
                            : `Open ${sf.title} in Explorer`
                        }
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                      <span className="text-[11px] font-sans text-[var(--color-text-muted)] leading-snug break-words">
                        {sf.subtitle}
                      </span>
                      <span
                        className={`text-[10px] tabular-nums px-2 py-0.5 rounded-full bg-[var(--color-control)] text-[var(--color-text-muted)] whitespace-nowrap shrink-0 ${
                          isRtl ? "font-sans font-semibold" : "font-mono"
                        }`}
                      >
                        {sf.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 1: Dedicated FULL-WIDTH Color Palette Studio (Palettes/palette.ase) */}
          {(activeSubfolderTab === "all" ||
            activeSubfolderTab === "Palettes") && (
            <section className="w-full p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-4 shadow-xs min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2 min-w-0">
                    <Palette className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                    <span>
                      {isRtl ? (
                        <>
                          لوحة ألوان المشروع (
                          <bdi dir="ltr">Palettes/palette.ase</bdi>)
                        </>
                      ) : (
                        "Workspace Color Palette (Palettes/palette.ase)"
                      )}
                    </span>
                  </h3>
                  <p className="text-[11px] font-sans text-[var(--color-text-dim)] mt-0.5 leading-snug">
                    {isRtl
                      ? "انقر على أي بطاقة لون لنسخ كود HEX فوراً، أو عدّل الأدوار وصدّرها لـ Adobe ASE و CSS و Tailwind"
                      : "Click any swatch card to copy HEX instantly, edit brand roles, or export to Adobe ASE, CSS, and Tailwind"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs shrink-0">
                  {activeWorkspace.logoDataUrl && (
                    <button
                      type="button"
                      data-testid="workspace-extract-logo-palette-btn"
                      onClick={handleExtractPaletteFromActiveLogo}
                      disabled={extractingLogoPalette}
                      className="h-8 px-3 rounded-lg text-[11px] font-sans font-bold bg-[#B7A1D9]/15 hover:bg-[#B7A1D9]/25 text-[#B7A1D9] border border-[#B7A1D9]/35 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <Wand2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {extractingLogoPalette
                          ? isRtl
                            ? "جاري الاستخراج..."
                            : "Extracting..."
                          : isRtl
                            ? "استخراج الألوان من الشعار"
                            : "Extract Palette from Logo"}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSavePaletteToAse}
                    disabled={savingPalette}
                    className="h-8 px-3 rounded-lg text-[11px] font-bold bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isRtl ? (
                        <>
                          حفظ <bdi dir="ltr">palette.ase</bdi>
                        </>
                      ) : (
                        "Save Palettes/palette.ase"
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyCode("css")}
                    className="h-8 px-3 rounded-lg text-[11px] font-mono bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] border border-[var(--color-border)] transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {copiedCodeType === "css" ? "Copied CSS!" : "CSS"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyCode("tailwind")}
                    className="h-8 px-3 rounded-lg text-[11px] font-mono bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] border border-[var(--color-border)] transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {copiedCodeType === "tailwind" ? "Copied TW!" : "Tailwind"}
                  </button>
                </div>
              </div>

              {/* Full-Width Auto-Fill Swatch Grid — Min 240px per card so cards NEVER collide on any desktop monitor */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5">
                {(activeWorkspace.palette || []).map((color, idx) => {
                  const ratio = getContrastRatio(color.hex, "#140D18");
                  const wcag = getWcagRating(ratio);
                  const isCopied = copiedHex === color.hex;
                  const isEditing = editingSwatchIdx === idx;

                  return (
                    <div
                      key={`${color.hex}-${idx}`}
                      onClick={() => handleCopyHex(color.hex)}
                      className={`p-3.5 rounded-xl bg-[var(--color-back-main)] border transition cursor-pointer flex flex-col justify-between gap-3 shadow-2xs relative min-w-0 ${
                        isEditing
                          ? "border-[var(--color-action)] ring-1 ring-[var(--color-action)]/40"
                          : "border-[var(--color-border)] hover:border-[var(--color-action)]"
                      }`}
                    >
                      {/* Top Color Banner + Role + Actions */}
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-11 h-8 rounded-lg shrink-0 border border-black/15 ring-1 ring-inset ring-white/10 shadow-inner flex items-center justify-center"
                            style={{ backgroundColor: color.hex }}
                          >
                            {isCopied && (
                              <Check className="w-3.5 h-3.5 text-white drop-shadow-md" />
                            )}
                          </div>
                          <span
                            dir="auto"
                            title={localizeSwatchRole(color.role, isRtl)}
                            className="px-2 py-0.5 rounded-md text-[10px] font-sans font-semibold bg-[var(--color-control)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] truncate max-w-[115px]"
                          >
                            {localizeSwatchRole(color.role, isRtl)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditSwatch(idx, color);
                            }}
                            aria-label={isRtl ? "تعديل اللون" : "Edit Swatch"}
                            title={isRtl ? "تعديل اللون" : "Edit Swatch"}
                            className="h-7 w-7 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-action)]/20 text-[var(--color-text-muted)] hover:text-[var(--color-action)] flex items-center justify-center transition cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          {(activeWorkspace.palette || []).length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveSwatchFromWorkspace(idx);
                              }}
                              aria-label={
                                isRtl ? "حذف اللون" : "Remove Swatch"
                              }
                              title={isRtl ? "حذف اللون" : "Remove Swatch"}
                              className="h-7 w-7 rounded-lg bg-[var(--color-control)] hover:bg-rose-500/20 text-[var(--color-text-muted)] hover:text-rose-400 flex items-center justify-center transition cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Swatch Name & #HEX */}
                      <div className="min-w-0 space-y-1">
                        <div
                          dir="auto"
                          title={color.name}
                          className="text-xs font-bold text-[var(--color-text-header)] truncate"
                        >
                          {color.name}
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--color-text-muted)]">
                          <span
                            dir="ltr"
                            className="font-mono flex items-center gap-1.5"
                          >
                            <span>{color.hex}</span>
                            <Copy className="w-2.5 h-2.5 opacity-60" />
                          </span>
                          <span className="text-[10px] font-sans text-[var(--color-text-dim)]">
                            {isCopied
                              ? isRtl
                                ? "تم النسخ"
                                : "Copied"
                              : isRtl
                                ? "نسخ"
                                : "Copy"}
                          </span>
                        </div>
                      </div>

                      {/* Footer: WCAG Contrast */}
                      <div className="flex items-center justify-between gap-2 text-[10px] pt-2 border-t border-[var(--color-border-subtle)]">
                        <span className="font-sans text-[var(--color-text-dim)] truncate">
                          {isRtl ? "تباين القراءة" : "WCAG Contrast"}
                        </span>
                        <span
                          dir="ltr"
                          className={`font-mono tabular-nums px-2 py-0.5 rounded font-bold border whitespace-nowrap shrink-0 ${
                            wcag.isNormalPass
                              ? "text-[#B7A1D9] bg-[#B7A1D9]/12 border-[#B7A1D9]/30"
                              : "text-[var(--color-action)] bg-[var(--color-action)]/10 border-[var(--color-action)]/25"
                          }`}
                        >
                          {wcag.normalText} {ratio}:1
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {editingSwatchIdx !== null && (
                <div className="p-3.5 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-action)]/50 space-y-2.5 animate-in fade-in">
                  <div className="text-[11px] font-bold text-[var(--color-text-header)] flex items-center justify-between">
                    <span>
                      {isRtl
                        ? "تعديل بيانات اللون المحدد"
                        : "Edit Selected Color Swatch"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingSwatchIdx(null)}
                      className="text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] cursor-pointer text-[11px]"
                    >
                      {isRtl ? "إغلاق" : "Cancel"}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="color"
                      value={normalizeHexColor(editSwatchHex)}
                      onChange={(e) =>
                        setEditSwatchHex(e.target.value.toUpperCase())
                      }
                      className="w-8 h-8 rounded-lg cursor-pointer border border-[var(--color-border)] shrink-0"
                    />
                    <input
                      type="text"
                      dir="ltr"
                      value={editSwatchHex}
                      onChange={(e) => setEditSwatchHex(e.target.value)}
                      placeholder="#F16B50"
                      className="w-24 h-8 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-lg px-2 text-xs font-mono text-[var(--color-text-header)] outline-none"
                    />
                    <input
                      type="text"
                      dir="auto"
                      value={editSwatchName}
                      onChange={(e) => setEditSwatchName(e.target.value)}
                      placeholder={isRtl ? "اسم اللون..." : "Swatch name..."}
                      className="flex-1 min-w-[140px] h-8 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-lg px-2.5 text-xs text-[var(--color-text-header)] outline-none"
                    />
                    <div className="relative">
                      <select
                        value={editSwatchRole}
                        style={SELECT_APPEARANCE_STYLE}
                        onChange={(e) => setEditSwatchRole(e.target.value)}
                        className="h-8 appearance-none !appearance-none bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-lg ps-2.5 pe-7 text-xs font-sans text-[var(--color-text-header)] outline-none cursor-pointer"
                      >
                        {SWATCH_ROLE_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {isRtl ? opt.ar : opt.en}
                          </option>
                        ))}
                        <option value="custom">
                          {isRtl ? "ليبل مخصص" : "Custom Label"}
                        </option>
                      </select>
                      <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)] pointer-events-none absolute top-1/2 -translate-y-1/2 end-2" />
                    </div>
                    {editSwatchRole === "custom" && (
                      <input
                        type="text"
                        dir="auto"
                        value={editSwatchCustomRole}
                        onChange={(e) =>
                          setEditSwatchCustomRole(e.target.value)
                        }
                        placeholder={isRtl ? "اسم الدور..." : "Custom role..."}
                        className="w-28 h-8 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-lg px-2.5 text-xs text-[var(--color-text-header)] outline-none"
                      />
                    )}
                    <button
                      type="button"
                      onClick={handleSaveEditedSwatch}
                      className="h-8 px-3 rounded-lg bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-bold cursor-pointer shrink-0"
                    >
                      {isRtl ? "حفظ التعديل" : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {/* Add Swatch Bar + Instant Harmony Suggestions */}
              <div className="pt-3 border-t border-[var(--color-border-subtle)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                  <input
                    type="color"
                    value={newSwatchHex}
                    onChange={(e) =>
                      setNewSwatchHex(e.target.value.toUpperCase())
                    }
                    className="w-8 h-8 rounded-lg cursor-pointer border border-[var(--color-border)] shrink-0"
                  />
                  <input
                    type="text"
                    dir="auto"
                    value={newSwatchName}
                    onChange={(e) => setNewSwatchName(e.target.value)}
                    placeholder={
                      isRtl ? "اسم اللون الجديد..." : "New swatch name..."
                    }
                    className="flex-1 min-w-[160px] h-8 bg-[var(--color-back-main)] border border-[var(--color-border)] rounded-lg px-2.5 text-xs text-[var(--color-text-header)] outline-none"
                  />
                  <div className="relative">
                    <select
                      value={newSwatchRole}
                      style={SELECT_APPEARANCE_STYLE}
                      onChange={(e) => setNewSwatchRole(e.target.value)}
                      aria-label={isRtl ? "دور اللون" : "Color Role"}
                      className="h-8 appearance-none !appearance-none bg-[var(--color-back-main)] border border-[var(--color-border)] rounded-lg ps-2.5 pe-7 text-xs font-sans text-[var(--color-text-header)] outline-none cursor-pointer"
                    >
                      {SWATCH_ROLE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {isRtl ? opt.ar : opt.en}
                        </option>
                      ))}
                      <option value="custom">
                        {isRtl ? "ليبل مخصص" : "Custom"}
                      </option>
                    </select>
                    <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)] pointer-events-none absolute top-1/2 -translate-y-1/2 end-2" />
                  </div>
                  {newSwatchRole === "custom" && (
                    <input
                      type="text"
                      dir="auto"
                      value={newSwatchCustomRole}
                      onChange={(e) => setNewSwatchCustomRole(e.target.value)}
                      placeholder={isRtl ? "ليبل..." : "Role label..."}
                      className="w-28 h-8 bg-[var(--color-back-main)] border border-[var(--color-border)] rounded-lg px-2.5 text-xs text-[var(--color-text-header)] outline-none"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => handleAddSwatchToWorkspace(newSwatchHex)}
                    className="h-8 px-3.5 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    + {isRtl ? "إضافة لون" : "Add Color"}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-text-muted)] shrink-0">
                  <span className="flex items-center gap-1 font-semibold">
                    <Palette className="w-3 h-3 text-[var(--color-action)]" />
                    <span>
                      {isRtl
                        ? "اقتراحات تناغم لوني فورية:"
                        : "Harmony Suggestions:"}
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {[
                      ...harmonySuggestions.complementary,
                      ...harmonySuggestions.splitComplementary,
                      ...harmonySuggestions.triadic,
                    ]
                      .slice(1, 6)
                      .map((sugHex, i) => (
                        <button
                          key={`${sugHex}-${i}`}
                          type="button"
                          onClick={() =>
                            handleAddSwatchToWorkspace(
                              sugHex,
                              `Harmony ${sugHex}`,
                              "accent",
                            )
                          }
                          className="w-6 h-6 rounded-md border border-black/15 hover:scale-110 transition cursor-pointer"
                          style={{ backgroundColor: sugHex }}
                          title={
                            isRtl
                              ? `إضافة ${sugHex} للوحة المشروع`
                              : `Add ${sugHex} to palette`
                          }
                        />
                      ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Section 2: Full-Width Project Font Files Studio */}
          {(activeSubfolderTab === "all" || activeSubfolderTab === "Fonts") && (
            <section className="w-full min-w-0">
              <div className="w-full p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-3.5 shadow-xs min-w-0">
                <div className="flex items-start sm:items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2 leading-snug">
                      <Layers className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                      <span>
                        {isRtl ? "ملفات خطوط المشروع" : "Project Font Files"}
                      </span>
                      <span
                        dir="ltr"
                        className="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                      >
                        {subfolders.fonts?.length || 0}
                      </span>
                    </h3>
                    <p className="text-[11px] font-sans text-[var(--color-text-dim)] mt-0.5 leading-snug">
                      {isRtl
                        ? "ابحث في كامل مكتبة الخطوط لإضافة أي خط للمشروع، أو أدر خطوط الهوية المرتبطة وفعلها في الرام"
                        : "Search the entire font library to link any font, manage role assignments, and activate in RAM"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenInExplorer("Fonts")}
                    className="text-[11px] text-[#B7A1D9] hover:underline font-semibold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isRtl ? (
                      <>
                        فتح <bdi dir="ltr">Fonts/</bdi>
                      </>
                    ) : (
                      "Open Fonts/"
                    )}
                  </button>
                </div>

                {/* Live Full-Library Font Search Bar */}
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[var(--color-text-dim)] pointer-events-none absolute top-1/2 -translate-y-1/2 start-3" />
                    <input
                      type="text"
                      dir="auto"
                      value={libraryFontSearch}
                      onChange={(e) => setLibraryFontSearch(e.target.value)}
                      placeholder={
                        isRtl
                          ? "ابحث في كامل مكتبة الخطوط لإضافة خط إلى المشروع (مثال: Cairo, Inter, Tajawal)..."
                          : "Search entire font library to add a font to this workspace..."
                      }
                      aria-label={
                        isRtl
                          ? "البحث في كامل مكتبة الخطوط"
                          : "Search full font library"
                      }
                      className="w-full h-9 bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl ps-9 pe-8 text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-dim)] outline-none transition"
                    />
                    {libraryFontSearch && (
                      <button
                        type="button"
                        onClick={() => setLibraryFontSearch("")}
                        aria-label={isRtl ? "مسح البحث" : "Clear search"}
                        className="absolute top-1/2 -translate-y-1/2 end-2.5 text-[var(--color-text-dim)] hover:text-[var(--color-text-header)] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Live Search Results Dropdown */}
                  {libraryFontSearch.trim().length > 0 && (
                    <div className="rounded-xl bg-[var(--color-back-main)] border border-[var(--color-action)]/45 max-h-52 overflow-y-auto divide-y divide-[var(--color-border-subtle)] shadow-lg">
                      {searchingLibraryFonts &&
                        librarySearchResults.length === 0 && (
                          <div className="px-3 py-3 text-[11px] text-[var(--color-text-muted)] text-center">
                            {isRtl
                              ? "جاري البحث في كامل المكتبة..."
                              : "Searching full font library..."}
                          </div>
                        )}
                      {!searchingLibraryFonts &&
                        librarySearchResults.length === 0 && (
                          <div className="px-3 py-3 text-[11px] text-[var(--color-text-dim)] text-center">
                            {isRtl
                              ? `لا توجد نتائج مطابقة لـ "${libraryFontSearch}"`
                              : `No fonts found matching "${libraryFontSearch}"`}
                          </div>
                        )}
                      {librarySearchResults.map((f: any) => {
                        const alreadyAdded = (subfolders.fonts || []).some(
                          (ef: any) =>
                            String(ef.id) === String(f.id) ||
                            ef.name.toLowerCase() ===
                              String(
                                f.displayName || f.name || f.family || "",
                              ).toLowerCase(),
                        );
                        return (
                          <div
                            key={`lib-res-${f.id || f.path || f.name}`}
                            className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-[var(--color-control)]/50 transition"
                          >
                            <div className="min-w-0 flex-1">
                              <div
                                dir="auto"
                                className="text-xs font-bold text-[var(--color-text-header)] truncate"
                              >
                                {f.displayName || f.family || f.name}
                              </div>
                              <div
                                dir="ltr"
                                className="text-[10px] font-mono text-[var(--color-text-dim)] truncate"
                              >
                                {f.style || "Regular"} •{" "}
                                {f.source || "library"}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={alreadyAdded}
                              onClick={() => {
                                handleAddFontToWorkspace(String(f.id), f);
                                setLibraryFontSearch("");
                              }}
                              className={`h-7 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition shrink-0 whitespace-nowrap ${
                                alreadyAdded
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default"
                                  : "bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white cursor-pointer"
                              }`}
                            >
                              {alreadyAdded ? (
                                <>
                                  <Check className="w-3 h-3" />
                                  <span>{isRtl ? "مضاف" : "Added"}</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3 h-3" />
                                  <span>{isRtl ? "إضافة" : "Add"}</span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Quick Filter for Linked Project Fonts */}
                {(subfolders.fonts || []).length > 3 && (
                  <div className="relative">
                    <Search className="w-3 h-3 text-[var(--color-text-dim)] pointer-events-none absolute top-1/2 -translate-y-1/2 start-2.5" />
                    <input
                      type="text"
                      dir="auto"
                      value={projectFontQuery}
                      onChange={(e) => setProjectFontQuery(e.target.value)}
                      placeholder={
                        isRtl
                          ? "تصفية خطوط المشروع المرتبطة..."
                          : "Filter linked project fonts..."
                      }
                      className="w-full h-7 bg-[var(--color-back-main)]/70 border border-[var(--color-border-subtle)] focus:border-[var(--color-action)] rounded-lg ps-7 pe-3 text-[11px] text-[var(--color-text-header)] placeholder-[var(--color-text-dim)] outline-none"
                    />
                  </div>
                )}

                {/* Linked & Discovered Project Fonts List */}
                <div className="space-y-2 max-h-72 overflow-y-auto pe-1">
                  {(() => {
                    const q = projectFontQuery.trim().toLowerCase();
                    const visibleFonts = (subfolders.fonts || []).filter(
                      (f: any) =>
                        !q ||
                        `${f.name || ""} ${f.family || ""} ${f.roleLabel || ""} ${f.path || ""}`
                          .toLowerCase()
                          .includes(q),
                    );

                    if (visibleFonts.length === 0) {
                      return (
                        <div className="text-center py-6 px-4 text-xs text-[var(--color-text-dim)] border border-dashed border-[var(--color-border)] rounded-xl space-y-1">
                          <p className="font-semibold text-[var(--color-text-muted)]">
                            {q
                              ? isRtl
                                ? "لا توجد خطوط مطابقة للتصفية"
                                : "No linked fonts match your filter"
                              : isRtl
                                ? "لم يتم ربط خطوط بالمشروع بعد"
                                : "No project fonts linked yet"}
                          </p>
                          <p className="text-[11px]">
                            {isRtl
                              ? "استخدم شريط البحث أعلاه للبحث في كامل المكتبة وإضافة خطوط المشروع."
                              : "Use the full-library search bar above to find and link workspace fonts."}
                          </p>
                        </div>
                      );
                    }

                    return visibleFonts.map((f: any, idx: number) => {
                      const resolvedId = resolveProjectFontNumericId(f);
                      const ramKey = getProjectFontRamKey(f, resolvedId);
                      const isFontActive =
                        ramActiveMap[ramKey] ?? Boolean(f.isActive);
                      const currentRoleValue =
                        f.roleLabel === (isRtl ? "العناوين" : "Heading")
                          ? "heading"
                          : f.roleLabel === (isRtl ? "النصوص" : "Body")
                            ? "body"
                            : f.roleLabel === (isRtl ? "مساعد" : "Accent")
                              ? "accent"
                              : f.roleLabel === (isRtl ? "الكود" : "Code")
                                ? "code"
                                : "none";

                      return (
                        <div
                          key={`${f.id || f.name}-${idx}`}
                          className="p-3 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span
                                dir="auto"
                                className="text-xs font-bold text-[var(--color-text-header)] truncate"
                              >
                                {f.name}
                              </span>
                              {f.roleLabel && (
                                <span className="px-2 py-0.5 rounded-md bg-[var(--color-action)]/12 border border-[var(--color-action)]/25 text-[10px] font-sans font-semibold text-[var(--color-action)] whitespace-nowrap shrink-0">
                                  {f.roleLabel}
                                </span>
                              )}
                            </div>
                            <div
                              dir="ltr"
                              className="text-[10px] font-mono text-[var(--color-text-dim)] truncate"
                            >
                              {f.path} • {f.format || "TTF"}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <div className="relative">
                              <select
                                value={currentRoleValue}
                                style={SELECT_APPEARANCE_STYLE}
                                onChange={(e) =>
                                  handleAssignProjectFontRole(
                                    f,
                                    e.target.value as
                                      | "none"
                                      | "heading"
                                      | "body"
                                      | "accent"
                                      | "code",
                                  )
                                }
                                aria-label={
                                  isRtl ? "تعيين دور الخط" : "Assign font role"
                                }
                                className="h-7 appearance-none !appearance-none bg-[var(--color-control)] border border-[var(--color-border)] rounded-lg ps-2 pe-6 text-[10px] font-sans font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] outline-none cursor-pointer"
                              >
                                <option value="none">
                                  {isRtl ? "بدون دور" : "No role"}
                                </option>
                                <option value="heading">
                                  {isRtl ? "العناوين" : "Heading"}
                                </option>
                                <option value="body">
                                  {isRtl ? "النصوص" : "Body"}
                                </option>
                                <option value="accent">
                                  {isRtl ? "مساعد" : "Accent"}
                                </option>
                                <option value="code">
                                  {isRtl ? "الكود" : "Code"}
                                </option>
                              </select>
                              <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)] pointer-events-none absolute top-1/2 -translate-y-1/2 end-1.5" />
                            </div>
                            <button
                              type="button"
                              data-testid="workspace-font-ram-btn"
                              onClick={() => handleToggleProjectFontRam(f)}
                              className={`h-7 px-2.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition whitespace-nowrap ${
                                isRtl ? "font-sans" : "font-mono font-bold"
                              } ${
                                isFontActive
                                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                                  : "bg-[var(--color-control)] hover:bg-[var(--color-action)] hover:text-white text-[var(--color-text-muted)]"
                              }`}
                              title={
                                isRtl
                                  ? "تفعيل/إلغاء تفعيل الخط بالرام"
                                  : "Toggle RAM activation"
                              }
                            >
                              <Zap className="w-3 h-3 shrink-0" />
                              <span>
                                {isFontActive
                                  ? isRtl
                                    ? "نشط بالرام"
                                    : "Active"
                                  : isRtl
                                    ? "تفعيل"
                                    : "Activate"}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFontFromWorkspace(idx)}
                              aria-label={
                                isRtl ? `إزالة ${f.name}` : `Remove ${f.name}`
                              }
                              className="h-7 w-7 rounded-lg bg-[var(--color-control)] hover:bg-rose-500/15 text-[var(--color-text-muted)] hover:text-rose-400 flex items-center justify-center transition cursor-pointer"
                              title={
                                isRtl
                                  ? "إزالة الخط من المشروع"
                                  : "Remove from workspace"
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </section>
          )}

          {/* Section 3: Dedicated FULL-WIDTH Design Assets & Brand Folders Studio (Designs/) */}
          {(activeSubfolderTab === "all" ||
            activeSubfolderTab === "Designs") && (
            <section
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleUploadDesigns(e.dataTransfer.files);
              }}
              className="w-full p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-4 shadow-xs min-w-0"
            >
              <input
                ref={designInputRef}
                type="file"
                multiple
                accept=".psd,.ai,.indd,.pdf,.svg,.png,.jpg,.jpeg,.webp,.fig,.xd"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleUploadDesigns(e.target.files);
                    e.target.value = "";
                  }
                }}
                className="hidden"
              />

              <div className="flex items-start sm:items-center justify-between gap-2.5 flex-wrap">
                <div className="min-w-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2 leading-snug">
                    <FileCheck className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                    <span>
                      {isRtl
                        ? "ملفات التصميم والمجلدات الفرعية"
                        : "Design Files & Subfolders"}
                    </span>
                  </h3>
                  <p className="text-[11px] font-sans text-[var(--color-text-dim)] mt-0.5 leading-snug">
                    {isRtl
                      ? "نظم ملفات العميل في مجلدات فرعية مخصصة مع بحث ومعاينة وتثبيت الملفات"
                      : "Organize client deliverables in custom subfolders, search assets, pin key files, and open directly"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleImportDesignDialog}
                    disabled={uploadingDesign || importingDesign}
                    className="h-8 px-3 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <FolderSearch className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
                    <span>
                      {importingDesign
                        ? isRtl
                          ? "جاري الاستيراد..."
                          : "Importing..."
                        : isRtl
                          ? "استيراد ملف تصميم (.PSD / .AI)"
                          : "Import Design (.PSD / .AI)"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => designInputRef.current?.click()}
                    disabled={uploadingDesign || importingDesign}
                    className="h-8 px-3 rounded-lg bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {uploadingDesign
                        ? isRtl
                          ? "جاري الرفع..."
                          : "Uploading..."
                        : isRtl
                          ? "رفع تصميم"
                          : "Upload Design"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleOpenInExplorer(currentFolderPath || "Designs")
                    }
                    className="text-[11px] text-[var(--color-action)] hover:underline font-semibold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isRtl ? (
                      <>
                        فتح{" "}
                        <bdi dir="ltr">{currentFolderPath || "Designs"}/</bdi>
                      </>
                    ) : (
                      `Open ${currentFolderPath || "Designs"}/`
                    )}
                  </button>
                </div>
              </div>

              {/* Folders Navigator: Breadcrumbs + Search + Pinned + Add Subfolder + Templates */}
              <div className="p-3.5 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-1 text-[11px] font-sans font-semibold">
                    <button
                      type="button"
                      onClick={() => setCurrentFolderPath("")}
                      className={`px-2 py-1 rounded-md cursor-pointer transition ${
                        currentFolderPath === ""
                          ? "bg-[var(--color-action)]/15 text-[var(--color-action)] font-bold"
                          : "hover:bg-[var(--color-control)] text-[var(--color-text-muted)]"
                      }`}
                    >
                      {isRtl ? "كل المجلدات" : "All Folders"}
                    </button>
                    {currentFolderPath
                      .split("/")
                      .filter(Boolean)
                      .map((seg, idx, arr) => {
                        const targetRel = arr.slice(0, idx + 1).join("/");
                        return (
                          <React.Fragment key={targetRel}>
                            {isRtl ? (
                              <ChevronLeft className="w-3 h-3 text-[var(--color-text-dim)]" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-[var(--color-text-dim)]" />
                            )}
                            <button
                              type="button"
                              onClick={() => setCurrentFolderPath(targetRel)}
                              className={`px-2 py-1 rounded-md cursor-pointer transition ${
                                targetRel === currentFolderPath
                                  ? "bg-[var(--color-action)]/15 text-[var(--color-action)] font-bold"
                                  : "hover:bg-[var(--color-control)] text-[var(--color-text-muted)]"
                              }`}
                            >
                              {getFriendlyFolderLabel(targetRel) || seg}
                            </button>
                          </React.Fragment>
                        );
                      })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                    <div className="relative flex-1 sm:flex-none sm:w-48 min-w-[140px]">
                      <Search className="w-3 h-3 text-[var(--color-text-dim)] pointer-events-none absolute top-1/2 -translate-y-1/2 start-2.5" />
                      <input
                        type="text"
                        dir="auto"
                        value={designSearchQuery}
                        onChange={(e) => setDesignSearchQuery(e.target.value)}
                        placeholder={
                          isRtl
                            ? "بحث في ملفات التصميم..."
                            : "Search design files..."
                        }
                        className="h-7 w-full bg-[var(--color-back-card)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-lg ps-7 pe-2.5 text-[11px] text-[var(--color-text-header)] outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPinnedOnly((p) => !p)}
                      className={`h-7 px-2.5 rounded-lg border text-[11px] font-sans font-semibold flex items-center gap-1 cursor-pointer transition whitespace-nowrap ${
                        showPinnedOnly
                          ? "bg-[var(--color-action)]/15 border-[var(--color-action)] text-[var(--color-action)]"
                          : "bg-[var(--color-back-card)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
                      }`}
                    >
                      <Pin className="w-3 h-3 shrink-0" />
                      <span>{isRtl ? "المثبتة" : "Pinned"}</span>
                      {pinnedAssetSet.size > 0 && (
                        <span dir="ltr" className="font-mono text-[10px]">
                          ({pinnedAssetSet.size})
                        </span>
                      )}
                    </button>
                    <input
                      type="text"
                      dir="auto"
                      value={newSubfolderName}
                      onChange={(e) => setNewSubfolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCreateNestedFolder();
                        }
                      }}
                      placeholder={
                        isRtl
                          ? "اسم مجلد فرعي جديد..."
                          : "New subfolder name..."
                      }
                      className="h-7 flex-1 sm:flex-none sm:w-40 min-w-0 bg-[var(--color-back-card)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-lg px-2.5 text-[11px] text-[var(--color-text-header)] outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCreateNestedFolder}
                      disabled={creatingSubfolder || !newSubfolderName.trim()}
                      className="h-7 px-2.5 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[11px] font-bold flex items-center gap-1 text-[var(--color-text-header)] cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                    >
                      <FolderPlus className="w-3 h-3 text-[var(--color-action)] shrink-0" />
                      <span>{isRtl ? "مجلد داخلي" : "Add Subfolder"}</span>
                    </button>
                  </div>
                </div>

                {/* Child Subfolders with Delete Subfolder Button */}
                {childFoldersInCurrentPath.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-[var(--color-border-subtle)]">
                    {childFoldersInCurrentPath.map((relFolder) => {
                      const label = getFriendlyFolderLabel(relFolder);
                      const canDelete =
                        !isProtectedRootFolder(relFolder) &&
                        relFolder.split("/").filter(Boolean).length >= 2;
                      return (
                        <div
                          key={relFolder}
                          className="h-7 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] hover:border-[var(--color-action)]/50 flex items-center overflow-hidden transition"
                        >
                          <button
                            type="button"
                            onClick={() => setCurrentFolderPath(relFolder)}
                            className="h-full px-2.5 text-[11px] font-sans font-semibold text-[var(--color-text-header)] flex items-center gap-1.5 cursor-pointer hover:bg-[var(--color-action)]/15 transition"
                          >
                            <FolderOpen className="w-3 h-3 text-amber-400 shrink-0" />
                            <span dir="auto">{label}</span>
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSubfolder(relFolder);
                              }}
                              aria-label={
                                isRtl
                                  ? `حذف المجلد ${label}`
                                  : `Delete folder ${label}`
                              }
                              title={
                                isRtl
                                  ? `حذف المجلد "${label}"`
                                  : `Delete subfolder "${label}"`
                              }
                              className="h-full px-1.5 border-s border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-rose-400 hover:bg-rose-500/15 flex items-center justify-center cursor-pointer transition"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Design Files Grid (2-column spacious cards on full width) */}
              <div className="max-h-96 overflow-y-auto pe-1">
                {(() => {
                  const dq = designSearchQuery.trim().toLowerCase();
                  const visibleDesigns = (subfolders.designs || [])
                    .filter((d) => {
                      if (showPinnedOnly && !isDesignPinned(d)) {
                        return false;
                      }
                      if (dq) {
                        const hay = `${d.name || ""} ${d.relativePath || ""} ${d.format || ""} ${(d.usedFonts || []).join(" ")}`.toLowerCase();
                        if (!hay.includes(dq)) return false;
                      }
                      if (!currentFolderPath) return true;
                      const sub = String(
                        d.subfolder || d.relativePath || d.path || "",
                      )
                        .replace(/\\/g, "/")
                        .toLowerCase();
                      const target = currentFolderPath.toLowerCase();
                      return (
                        sub === target ||
                        sub.startsWith(`${target}/`) ||
                        sub.includes(`/${target}`)
                      );
                    })
                    .sort((a, b) => {
                      const ap = isDesignPinned(a) ? 1 : 0;
                      const bp = isDesignPinned(b) ? 1 : 0;
                      return bp - ap;
                    });

                  if (visibleDesigns.length === 0) {
                    return (
                      <div className="text-center py-7 px-4 text-xs text-[var(--color-text-dim)] border border-dashed border-[var(--color-border)] rounded-xl space-y-1.5">
                        <p className="font-semibold text-[var(--color-text-muted)]">
                          {dq
                            ? isRtl
                              ? `لا توجد ملفات تصميم مطابقة لـ "${designSearchQuery}"`
                              : `No design files matching "${designSearchQuery}"`
                            : showPinnedOnly
                              ? isRtl
                                ? "لا توجد ملفات مثبتة في هذا المجلد"
                                : "No pinned assets in this folder"
                              : isRtl
                                ? "لا توجد ملفات تصميم في هذا المجلد بعد"
                                : "No design files in this folder yet"}
                        </p>
                        <p className="text-[11px]">
                          {isRtl
                            ? "اسحب ملفات PSD / AI / PDF / PNG / SVG هنا أو اضغط على زر رفع تصميم."
                            : "Drag PSD, AI, PDF, PNG, or SVG files here or click Upload Design."}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {visibleDesigns.map((design, idx) => {
                        const pinned = isDesignPinned(design);
                        return (
                          <div
                            key={`${design.path}-${idx}`}
                            className={`p-3.5 rounded-xl bg-[var(--color-back-main)] border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0 transition ${
                              pinned
                                ? "border-[var(--color-action)]/60 bg-[var(--color-action)]/5"
                                : "border-[var(--color-border-subtle)]"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {design.previewUrl && (
                                <button
                                  type="button"
                                  onClick={() => setLightboxDesign(design)}
                                  className="relative group w-11 h-11 rounded-lg overflow-hidden border border-[var(--color-border)] shrink-0 cursor-pointer"
                                  title={
                                    isRtl ? "معاينة الصورة" : "Preview image"
                                  }
                                >
                                  <img
                                    src={design.previewUrl}
                                    alt={design.name}
                                    className="w-full h-full object-cover"
                                  />
                                  <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                    <Maximize2 className="w-3.5 h-3.5 text-white" />
                                  </span>
                                </button>
                              )}
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    dir="ltr"
                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--color-action)]/15 text-[var(--color-action)] shrink-0"
                                  >
                                    {design.format || (design as any).extension}
                                  </span>
                                  <span
                                    dir="auto"
                                    title={design.name}
                                    className="text-xs font-bold text-[var(--color-text-header)] truncate"
                                  >
                                    {design.name}
                                  </span>
                                  {pinned && (
                                    <span className="text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 shrink-0">
                                      {isRtl ? "مثبت" : "Pinned"}
                                    </span>
                                  )}
                                </div>
                                <div
                                  dir="ltr"
                                  className="text-[10px] font-mono text-[var(--color-text-dim)] truncate"
                                >
                                  {design.relativePath || design.path}
                                  {(design.usedFonts || []).length > 0
                                    ? ` • ${design.usedFonts.join(", ")}`
                                    : ""}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              {design.allActive !== false ? (
                                <span
                                  className={`h-7 px-2.5 inline-flex items-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold whitespace-nowrap shrink-0 ${
                                    isRtl ? "font-sans" : ""
                                  }`}
                                >
                                  {isRtl
                                    ? "كافة الخطوط مفعلة ✓"
                                    : "Fonts Active ✓"}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={handleActivateRam}
                                  className="h-7 px-2.5 rounded-lg bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  <Zap className="w-3 h-3 fill-current shrink-0" />
                                  <span>
                                    {isRtl
                                      ? "تفعيل الخطوط المفقودة"
                                      : "Activate Missing Fonts"}
                                  </span>
                                </button>
                              )}

                              {design.previewUrl && (
                                <button
                                  type="button"
                                  onClick={() => setLightboxDesign(design)}
                                  aria-label={
                                    isRtl
                                      ? `معاينة ${design.name}`
                                      : `Preview ${design.name}`
                                  }
                                  title={
                                    isRtl ? "تكبير ومعاينة" : "Image Preview"
                                  }
                                  className="h-7 w-7 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-action)]/20 text-[var(--color-text-muted)] hover:text-[var(--color-action)] flex items-center justify-center transition cursor-pointer shrink-0"
                                >
                                  <Maximize2 className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleTogglePinDesign(design)}
                                aria-pressed={pinned}
                                aria-label={
                                  isRtl
                                    ? `تثبيت ${design.name}`
                                    : `Pin ${design.name}`
                                }
                                title={
                                  pinned
                                    ? isRtl
                                      ? "إلغاء تثبيت الملف"
                                      : "Unpin Asset"
                                    : isRtl
                                      ? "تثبيت / حفظ في المفضلة"
                                      : "Pin / Bookmark Asset"
                                }
                                className={`h-7 w-7 rounded-lg flex items-center justify-center transition cursor-pointer shrink-0 ${
                                  pinned
                                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/35"
                                    : "bg-[var(--color-control)] hover:bg-amber-500/15 text-[var(--color-text-dim)] hover:text-amber-400"
                                }`}
                              >
                                <Pin className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenDesignFile(design)}
                                title={
                                  isRtl
                                    ? "فتح الملف في البرنامج الافتراضي"
                                    : "Open File in Default App"
                                }
                                className="h-7 px-2 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] text-[10px] font-sans font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0"
                              >
                                <ExternalLink className="w-3 h-3 text-[var(--color-action)] shrink-0" />
                                <span>
                                  {isRtl ? "فتح الملف" : "Open File"}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteDesignFile(design)}
                                aria-label={
                                  isRtl
                                    ? `حذف ${design.name}`
                                    : `Delete ${design.name}`
                                }
                                title={
                                  isRtl
                                    ? "حذف ملف التصميم"
                                    : "Delete design file"
                                }
                                className="h-7 w-7 rounded-lg bg-[var(--color-control)] hover:bg-rose-500/15 text-[var(--color-text-dim)] hover:text-rose-400 flex items-center justify-center transition cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </section>
          )}

          {/* Section 4: Full-Width Project Tasks & Deadlines */}
          {(activeSubfolderTab === "all" ||
            activeSubfolderTab === "Guidelines") && (
            <section className="w-full min-w-0">
              <div className="w-full p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-4 shadow-xs min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                      <span>
                        {isRtl
                          ? "مهام المشروع ومواعيد التسليم"
                          : "Project Checklist & Deadlines"}
                      </span>
                    </h3>
                    <span
                      dir="ltr"
                      className="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-muted)] shrink-0"
                    >
                      {completedTasks}/{currentTasks.length} ({progressPercent}
                      %)
                    </span>
                  </div>

                  {/* Filter Pills: Clean font-sans font-semibold (NEVER font-mono on Arabic) */}
                  <div className="flex flex-wrap items-center gap-1 text-[11px] font-sans font-semibold shrink-0">
                    {[
                      { id: "all", ar: "الكل", en: "All" },
                      { id: "todo", ar: "قيد الانتظار", en: "Todo" },
                      { id: "in_progress", ar: "جاري العمل", en: "In Progress" },
                      { id: "done", ar: "مكتمل", en: "Done" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setTaskFilter(f.id)}
                        className={`px-2.5 py-1 rounded-lg transition cursor-pointer whitespace-nowrap font-sans font-semibold ${
                          taskFilter === f.id
                            ? "bg-[var(--color-action)] text-white font-bold"
                            : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)]"
                        }`}
                      >
                        {isRtl ? f.ar : f.en}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-full h-1.5 bg-[var(--color-control)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-action)] transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* Open Rich Task Modal Button */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)]">
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {isRtl
                      ? "أضف مهام المشروع مع التعليمات، التصنيف، الأولوية، وقائمة التحقق"
                      : "Create structured tasks with instructions, category, priority, and checklist"}
                  </span>
                  <button
                    type="button"
                    data-testid="open-add-task-modal-btn"
                    onClick={openAddTaskModal}
                    className="h-9 px-4 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>{isRtl ? "إضافة مهمة" : "Add Task"}</span>
                  </button>
                </div>

                <div className="space-y-2.5 max-h-96 overflow-y-auto pe-1">
                  {filteredTasks.length === 0 ? (
                    <div className="text-center py-8 text-xs text-[var(--color-text-dim)] border border-dashed border-[var(--color-border)] rounded-xl">
                      {isRtl
                        ? "لا توجد مهام في هذا التصنيف"
                        : "No tasks in this filter view."}
                    </div>
                  ) : (
                    filteredTasks.map((task) => {
                      const isDone = task.status === "done";
                      const isInProgress = task.status === "in_progress";
                      const dueMeta = getDeadlineMeta(
                        task.dueDate,
                        isDone,
                        isRtl,
                      );

                      return (
                        <div
                          key={task.id}
                          className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-start justify-between gap-3 transition ${
                            isDone
                              ? "bg-[var(--color-back-main)]/50 border-[var(--color-border-subtle)] text-[var(--color-text-dim)]"
                              : isInProgress
                                ? "bg-[var(--color-back-main)] border-[var(--color-action)]/50 text-[var(--color-text-header)]"
                                : "bg-[var(--color-back-main)] border-[var(--color-border-subtle)] text-[var(--color-text-main)]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleTaskStatus(task.id)}
                            className="flex items-start gap-2.5 flex-1 cursor-pointer group min-w-0 text-start"
                          >
                            {isDone ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            ) : isInProgress ? (
                              <Clock className="w-4 h-4 text-[var(--color-action)] shrink-0 animate-pulse mt-0.5" />
                            ) : (
                              <Circle className="w-4 h-4 text-[var(--color-text-dim)] group-hover:text-[var(--color-text-header)] shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0 space-y-1">
                              <div
                                dir="auto"
                                className={`text-xs break-words ${isDone ? "line-through opacity-75" : "font-semibold"}`}
                              >
                                {task.text}
                              </div>
                              {task.notes && (
                                <p
                                  dir="auto"
                                  className="text-[11px] text-[var(--color-text-muted)] leading-relaxed break-words whitespace-pre-line"
                                >
                                  {task.notes}
                                </p>
                              )}
                              {Array.isArray(task.checklist) &&
                                task.checklist.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                                    {task.checklist.map((step, sIdx) => (
                                      <span
                                        key={`${task.id}-chk-${sIdx}`}
                                        dir="auto"
                                        className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--color-control)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)]"
                                      >
                                        • {step}
                                      </span>
                                    ))}
                                  </div>
                                )}
                            </div>
                          </button>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {task.category && (
                              <span className="px-2 py-0.5 rounded-md bg-[#B7A1D9]/12 border border-[#B7A1D9]/30 text-[#B7A1D9] text-[10px] font-sans font-semibold whitespace-nowrap">
                                {getTaskCategoryLabel(task.category)}
                              </span>
                            )}
                            {renderPriorityBadge(task.priority)}
                            {dueMeta && (
                              <span
                                title={dueMeta.formattedDate}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-sans font-semibold whitespace-nowrap ${
                                  dueMeta.tone === "overdue"
                                    ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                                    : dueMeta.tone === "soon"
                                      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                      : dueMeta.tone === "ok"
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                        : "bg-[var(--color-control)] text-[var(--color-text-dim)] border-[var(--color-border-subtle)]"
                                }`}
                              >
                                <Calendar className="w-2.5 h-2.5 shrink-0" />
                                <span>{dueMeta.label}</span>
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleToggleTaskStatus(task.id)}
                              className={`text-[10px] px-2 py-0.5 rounded font-sans font-semibold whitespace-nowrap cursor-pointer transition ${
                                isDone
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : isInProgress
                                    ? "bg-[var(--color-action)]/15 text-[var(--color-action)]"
                                    : "bg-[var(--color-control)] text-[var(--color-text-dim)] hover:text-[var(--color-text-header)]"
                              }`}
                              title={isRtl ? "تغيير الحالة" : "Cycle status"}
                            >
                              {isRtl
                                ? isDone
                                  ? "مكتمل"
                                  : isInProgress
                                    ? "جاري العمل"
                                    : "قيد الانتظار"
                                : task.status === "in_progress"
                                  ? "In Progress"
                                  : task.status === "done"
                                    ? "Done"
                                    : "Todo"}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditTaskModal(task)}
                              aria-label={isRtl ? "تعديل المهمة" : "Edit task"}
                              title={isRtl ? "تعديل المهمة" : "Edit task"}
                              className="text-[var(--color-text-dim)] hover:text-[var(--color-action)] p-1 transition cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTask(task.id)}
                              aria-label={isRtl ? "حذف المهمة" : "Delete task"}
                              className="text-[var(--color-text-dim)] hover:text-rose-400 p-1 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Image Lightbox Preview Modal */}
      {lightboxDesign &&
        lightboxDesign.previewUrl &&
        (() => {
          const pinned = isDesignPinned(lightboxDesign);
          const lightboxNode = (
            <div
              onClick={() => setLightboxDesign(null)}
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 sm:p-8"
              dir={isRtl ? "rtl" : "ltr"}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-4xl bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]"
              >
                <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-back-side)] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      dir="ltr"
                      className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[var(--color-action)]/15 text-[var(--color-action)] shrink-0"
                    >
                      {lightboxDesign.format}
                    </span>
                    <span
                      dir="auto"
                      className="text-sm font-bold text-[var(--color-text-header)] truncate"
                    >
                      {lightboxDesign.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleTogglePinDesign(lightboxDesign)}
                      className={`h-8 px-2.5 rounded-lg border text-xs font-sans font-semibold flex items-center gap-1.5 cursor-pointer ${
                        pinned
                          ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                          : "bg-[var(--color-control)] border-[var(--color-border)] text-[var(--color-text-header)]"
                      }`}
                    >
                      <Pin className="w-3.5 h-3.5" />
                      <span>
                        {pinned
                          ? isRtl
                            ? "مثبت"
                            : "Pinned"
                          : isRtl
                            ? "تثبيت"
                            : "Pin"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenDesignFile(lightboxDesign)}
                      className="h-8 px-2.5 rounded-lg bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-sans font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>{isRtl ? "فتح الملف" : "Open File"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLightboxDesign(null)}
                      aria-label={isRtl ? "إغلاق المعاينة" : "Close preview"}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-4 bg-[var(--color-back-main)] flex-1 flex items-center justify-center overflow-auto">
                  <img
                    src={lightboxDesign.previewUrl}
                    alt={lightboxDesign.name}
                    className="max-w-full max-h-[68vh] object-contain rounded-xl border border-[var(--color-border)]"
                  />
                </div>
                <div className="px-4 py-2.5 border-t border-[var(--color-border)] text-[11px] flex flex-wrap items-center justify-between gap-2 text-[var(--color-text-muted)]">
                  <span dir="ltr" className="font-mono truncate">
                    {lightboxDesign.relativePath || lightboxDesign.path}
                  </span>
                  {(lightboxDesign.usedFonts || []).length > 0 && (
                    <span dir="ltr" className="font-mono">
                      Fonts: {lightboxDesign.usedFonts.join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
          const canPortal =
            typeof window !== "undefined" &&
            typeof document !== "undefined" &&
            typeof document.querySelector === "function";
          return canPortal
            ? createPortal(lightboxNode, document.body)
            : lightboxNode;
        })()}

      {/* Modal: Ergonomic Create or Edit Project Workspace (Brand Builder) */}
      {isCreatingWorkspace &&
        (() => {
          const modalNode = (
            <div
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
              dir={isRtl ? "rtl" : "ltr"}
            >
              <div className="w-full max-w-[calc(100vw-1.5rem)] sm:max-w-4xl max-h-[90dvh] bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
                <div className="px-4 sm:px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between gap-3 bg-[var(--color-back-side)] shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[var(--color-action)]/15 border border-[var(--color-action)]/30 flex items-center justify-center text-[var(--color-action)] shrink-0">
                      <Briefcase className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[var(--color-text-header)] truncate">
                        {editingWorkspaceId
                          ? isRtl
                            ? "تعديل بيانات ومكونات الهوية"
                            : "Edit Project Workspace & Brand Builder"
                          : isRtl
                            ? "إنشاء مشروع وهوية عمل جديدة"
                            : "Create New Project Workspace"}
                      </h3>
                      <p className="text-[11px] text-[var(--color-text-muted)] truncate">
                        {isRtl
                          ? "حدد الشعار، الموعد النهائي، أدوار الخطوط المخصصة، ولوحة الألوان التفاعلية"
                          : "Configure logo, target deadline, dynamic font roles, and editable brand palette"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingWorkspace(false);
                      setEditingWorkspaceId(null);
                    }}
                    aria-label={isRtl ? "إغلاق" : "Close"}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--color-text-dim)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form
                  onSubmit={handleCreateWorkspace}
                  className="p-5 sm:p-6 space-y-5 text-xs overflow-y-auto flex-1"
                >
                  {/* 1. Project Logo + Basic Identity + Target Deadline */}
                  <div className="flex flex-col sm:flex-row gap-5 items-start p-4 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border)]">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={(e) => {
                        handleLogoFileSelected(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="w-24 h-24 rounded-2xl border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-action)] bg-[var(--color-back-card)] flex flex-col items-center justify-center overflow-hidden cursor-pointer transition group"
                      >
                        {formLogoDataUrl ? (
                          <img
                            src={formLogoDataUrl}
                            alt="Project Logo"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-[var(--color-text-muted)] group-hover:text-[var(--color-action)] p-2 text-center">
                            <ImageIcon className="w-6 h-6" />
                            <span className="text-[10px] font-semibold">
                              {isRtl ? "رفع شعار" : "Upload Logo"}
                            </span>
                          </div>
                        )}
                      </button>
                      {formLogoDataUrl && (
                        <div className="flex flex-col items-center gap-1.5">
                          <button
                            type="button"
                            data-testid="modal-extract-logo-palette-btn"
                            onClick={() => handleExtractLogoPaletteForModal()}
                            disabled={extractingLogoPalette}
                            className="px-2.5 py-1 rounded-lg bg-[#B7A1D9]/15 hover:bg-[#B7A1D9]/25 text-[#B7A1D9] border border-[#B7A1D9]/35 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                          >
                            <Wand2 className="w-3 h-3 shrink-0" />
                            <span>
                              {extractingLogoPalette
                                ? isRtl
                                  ? "جاري الاستخراج..."
                                  : "Extracting..."
                                : isRtl
                                  ? "استخراج ألوان من الشعار"
                                  : "Extract Palette from Logo"}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormLogoDataUrl("")}
                            className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                          >
                            {isRtl ? "إزالة الشعار" : "Remove Logo"}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
                      <div className="sm:col-span-2">
                        <label className="block font-semibold text-[var(--color-text-muted)] mb-1">
                          {isRtl
                            ? "اسم المشروع / العلامة التجارية *"
                            : "Brand / Project Name *"}
                        </label>
                        <input
                          type="text"
                          required
                          dir="auto"
                          value={formName}
                          onChange={(e: any) => setFormName(e.target.value)}
                          placeholder={
                            isRtl
                              ? "مثال: حملة إطلاق الهوية الجديدة"
                              : "e.g. Acme Studio Redesign"
                          }
                          className="w-full bg-[var(--color-back-card)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-[var(--color-text-muted)] mb-1">
                          {isRtl
                            ? "اسم العميل / الجهة"
                            : "Client / Organization"}
                        </label>
                        <input
                          type="text"
                          dir="auto"
                          value={formClient}
                          onChange={(e: any) => setFormClient(e.target.value)}
                          placeholder={
                            isRtl ? "مثال: شركة أفق للتقنية" : "e.g. Horizon Tech"
                          }
                          className="w-full bg-[var(--color-back-card)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-[var(--color-text-muted)] mb-1">
                          {isRtl ? "التصنيف / المجال" : "Category"}
                        </label>
                        <div className="relative">
                          <select
                            value={formCategory}
                            style={SELECT_APPEARANCE_STYLE}
                            onChange={(e: any) =>
                              setFormCategory(e.target.value)
                            }
                            className="w-full appearance-none !appearance-none bg-[var(--color-back-card)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl ps-3.5 pe-9 py-2 text-[var(--color-text-header)] outline-none cursor-pointer"
                          >
                            {WORKSPACE_CATEGORIES.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {isRtl ? cat.ar : cat.en}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] pointer-events-none absolute top-1/2 -translate-y-1/2 end-3" />
                        </div>
                      </div>

                      <div>
                        <label className="block font-semibold text-[var(--color-text-muted)] mb-1">
                          {isRtl
                            ? "اسم الحملة / الموسم / الإصدار"
                            : "Campaign / Season / Deliverable"}
                        </label>
                        <input
                          type="text"
                          dir="auto"
                          value={formCampaign}
                          onChange={(e: any) => setFormCampaign(e.target.value)}
                          placeholder={
                            isRtl
                              ? "مثال: حملة الربع الأول ٢٠٢٦"
                              : "e.g. Q1 2026 Rebrand Campaign"
                          }
                          className="w-full bg-[var(--color-back-card)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-[var(--color-text-muted)] mb-1">
                          {isRtl
                            ? "الموعد النهائي للتسليم (Deadline)"
                            : "Project Target Deadline"}
                        </label>
                        <input
                          type="date"
                          dir="ltr"
                          value={formDeadline}
                          onChange={(e) => setFormDeadline(e.target.value)}
                          className="w-full bg-[var(--color-back-card)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 font-mono text-[var(--color-text-header)] outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. Dynamic Typography / Font Roles Builder */}
                  <datalist id="workspace-library-fonts-list">
                    {sortedLibraryFonts.all.map((f: any) => (
                      <option
                        key={f.id}
                        value={formatLibraryFontOptionLabel(f)}
                      />
                    ))}
                  </datalist>

                  <div className="p-4 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border)] space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-[var(--color-text-header)] flex items-center gap-1.5">
                          <Type className="w-4 h-4 text-[var(--color-action)]" />
                          <span>
                            {isRtl
                              ? "نظام الخطوط والأدوار الطباعية (تُحفظ تلقائياً في Fonts/)"
                              : "Dynamic Typography & Font Roles (Auto-Synced to Fonts/)"}
                          </span>
                        </h4>
                        <p className="text-[11px] text-[var(--color-text-dim)]">
                          {isRtl
                            ? "اختر خطاً من المكتبة المثبتة أو اكتب اسم الخط يدوياً، وأضف أدوار خطوط مخصصة بلا حدود"
                            : "Pick from installed library fonts or type any fallback name, plus add unlimited custom font roles"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddModalFontRole}
                        className="h-8 px-3 rounded-lg bg-[var(--color-action)]/15 hover:bg-[var(--color-action)]/25 border border-[var(--color-action)]/40 text-[var(--color-action)] font-sans font-bold text-[11px] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>
                          {isRtl
                            ? "إضافة نوع/دور خط مخصص"
                            : "Add Custom Font Role"}
                        </span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        {
                          label: isRtl
                            ? "خط العناوين (Heading)"
                            : "Heading Font",
                          val: formHeadingFont,
                          setter: setFormHeadingFont,
                          placeholder: "e.g. Cairo Bold / Inter",
                        },
                        {
                          label: isRtl ? "خط النصوص (Body)" : "Body Font",
                          val: formBodyFont,
                          setter: setFormBodyFont,
                          placeholder: "e.g. Tajawal Regular",
                        },
                        {
                          label: isRtl
                            ? "الخط المساعد / الأرقام (Accent)"
                            : "Accent / Mono Font",
                          val: formAccentFont,
                          setter: setFormAccentFont,
                          placeholder: "e.g. JetBrains Mono",
                        },
                      ].map((slot) => (
                        <div
                          key={slot.label}
                          className="p-3 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border-subtle)] space-y-2"
                        >
                          <label className="block font-semibold text-[var(--color-text-muted)]">
                            {slot.label}
                          </label>
                          {renderFontRoleSelect(slot.setter, slot.label)}
                          <input
                            type="text"
                            dir="auto"
                            list="workspace-library-fonts-list"
                            value={slot.val}
                            onChange={(e) => slot.setter(e.target.value)}
                            placeholder={slot.placeholder}
                            className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-1.5 text-[var(--color-text-header)] outline-none"
                          />
                        </div>
                      ))}
                    </div>

                    {formCustomFonts.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-[var(--color-border-subtle)]">
                        <div className="text-[11px] font-sans font-semibold text-[var(--color-text-muted)]">
                          {isRtl
                            ? "أدوار الخطوط المخصصة:"
                            : "Custom Font Roles:"}
                        </div>
                        {formCustomFonts.map((cf, idx) => (
                          <div
                            key={cf.id}
                            className="p-2.5 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border-subtle)] grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                          >
                            <div className="sm:col-span-4">
                              <input
                                type="text"
                                dir="auto"
                                value={cf.label}
                                onChange={(e) =>
                                  setFormCustomFonts((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? { ...item, label: e.target.value }
                                        : item,
                                    ),
                                  )
                                }
                                placeholder={
                                  isRtl
                                    ? "اسم الدور (مثال: خط السوشيال ميديا)"
                                    : "Role label (e.g. Social Heading)"
                                }
                                className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-header)] outline-none"
                              />
                            </div>
                            <div className="sm:col-span-4">
                              {renderFontRoleSelect(
                                (val) =>
                                  setFormCustomFonts((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, value: val } : item,
                                    ),
                                  ),
                                cf.label || `Custom font ${idx + 1}`,
                              )}
                            </div>
                            <div className="sm:col-span-3">
                              <input
                                type="text"
                                dir="auto"
                                list="workspace-library-fonts-list"
                                value={cf.value}
                                onChange={(e) =>
                                  setFormCustomFonts((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? { ...item, value: e.target.value }
                                        : item,
                                    ),
                                  )
                                }
                                placeholder={
                                  isRtl ? "أو اكتب اسم الخط..." : "Font name..."
                                }
                                className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-header)] outline-none"
                              />
                            </div>
                            <div className="sm:col-span-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  setFormCustomFonts((prev) =>
                                    prev.filter((_, i) => i !== idx),
                                  )
                                }
                                aria-label={
                                  isRtl
                                    ? "حذف دور الخط"
                                    : "Remove custom font role"
                                }
                                className="h-8 w-8 rounded-lg bg-[var(--color-control)] hover:bg-rose-500/15 text-[var(--color-text-dim)] hover:text-rose-400 flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. Dynamic Color Palette Builder (Inside BOTH Create AND Edit Modal) */}
                  <div className="p-4 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border)] space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-[var(--color-text-header)] flex items-center gap-1.5">
                          <Palette className="w-4 h-4 text-[var(--color-action)]" />
                          <span>
                            {isRtl
                              ? "مُنشئ لوحة الألوان التفاعلي (Palettes/palette.ase)"
                              : "Dynamic Brand Palette Builder"}
                          </span>
                        </h4>
                        <p className="text-[11px] text-[var(--color-text-dim)]">
                          {isRtl
                            ? "اختر قالباً مبدئياً أو عدّل كل لون وليبل مباشرة وأضف ألواناً مخصصة"
                            : "Apply a quick starter preset or customize each color role, hex, and name"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {formLogoDataUrl && (
                          <button
                            type="button"
                            data-testid="modal-extract-logo-palette-btn"
                            onClick={handleExtractPaletteInModal}
                            disabled={extractingLogoPalette}
                            className="h-8 px-3 rounded-lg bg-[#B7A1D9]/15 hover:bg-[#B7A1D9]/25 border border-[#B7A1D9]/40 text-[#B7A1D9] font-sans font-bold text-[11px] flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                          >
                            <Palette className="w-3.5 h-3.5" />
                            <span>
                              {isRtl
                                ? "استخراج الألوان من الشعار"
                                : "Extract Palette from Logo"}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleAddModalSwatch}
                          className="h-8 px-3 rounded-lg bg-[var(--color-action)]/15 hover:bg-[var(--color-action)]/25 border border-[var(--color-action)]/40 text-[var(--color-action)] font-sans font-bold text-[11px] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>
                            {isRtl
                              ? "إضافة لون / ليبل جديد"
                              : "Add Color / Label"}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Starter Presets */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {Object.values(PALETTE_STARTER_PRESETS).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleApplyModalPreset(preset.id)}
                          className={`p-2.5 rounded-xl border text-start transition cursor-pointer ${
                            formPalettePreset === preset.id
                              ? "border-[var(--color-action)] bg-[var(--color-action)]/10"
                              : "border-[var(--color-border)] bg-[var(--color-back-card)] hover:border-[var(--color-action)]/50"
                          }`}
                        >
                          <div className="flex items-center gap-1 mb-1">
                            {preset.swatches.slice(0, 4).map((c) => (
                              <span
                                key={c.hex}
                                className="w-4 h-2.5 rounded-xs border border-black/15"
                                style={{ backgroundColor: c.hex }}
                              />
                            ))}
                          </div>
                          <div className="text-[11px] font-bold text-[var(--color-text-header)] truncate">
                            {isRtl ? preset.ar : preset.en}
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Editable Color Rows */}
                    <div className="space-y-2">
                      {formPalette.map((sw, idx) => {
                        const isStdRole = isStandardSwatchRole(sw.role);
                        const selectRoleVal = isStdRole
                          ? sw.role.toLowerCase()
                          : "custom";

                        return (
                          <div
                            key={sw.id}
                            className="p-2.5 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border-subtle)] flex flex-wrap items-center gap-2"
                          >
                            <input
                              type="color"
                              value={normalizeHexColor(sw.hex)}
                              onChange={(e) => {
                                const val = e.target.value.toUpperCase();
                                setFormPalette((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, hex: val } : item,
                                  ),
                                );
                              }}
                              className="w-8 h-8 rounded-lg cursor-pointer border border-[var(--color-border)] shrink-0"
                            />
                            <input
                              type="text"
                              dir="ltr"
                              value={sw.hex}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormPalette((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, hex: val } : item,
                                  ),
                                );
                              }}
                              placeholder="#F16B50"
                              className="w-24 h-8 bg-[var(--color-back-main)] border border-[var(--color-border)] rounded-lg px-2 text-xs font-mono text-[var(--color-text-header)] outline-none"
                            />
                            <input
                              type="text"
                              dir="auto"
                              value={sw.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormPalette((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, name: val } : item,
                                  ),
                                );
                              }}
                              placeholder={
                                isRtl ? "اسم اللون..." : "Color name..."
                              }
                              className="flex-1 min-w-[130px] h-8 bg-[var(--color-back-main)] border border-[var(--color-border)] rounded-lg px-2.5 text-xs text-[var(--color-text-header)] outline-none"
                            />
                            <div className="relative">
                              <select
                                value={selectRoleVal}
                                style={SELECT_APPEARANCE_STYLE}
                                onChange={(e) => {
                                  const nextRole = e.target.value;
                                  setFormPalette((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? {
                                            ...item,
                                            role:
                                              nextRole === "custom"
                                                ? isStdRole
                                                  ? "custom"
                                                  : item.role
                                                : nextRole,
                                          }
                                        : item,
                                    ),
                                  );
                                }}
                                className="h-8 appearance-none !appearance-none bg-[var(--color-back-main)] border border-[var(--color-border)] rounded-lg ps-2.5 pe-7 text-xs font-sans text-[var(--color-text-header)] outline-none cursor-pointer"
                              >
                                {SWATCH_ROLE_OPTIONS.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {isRtl ? opt.ar : opt.en}
                                  </option>
                                ))}
                                <option value="custom">
                                  {isRtl ? "ليبل مخصص" : "Custom Label"}
                                </option>
                              </select>
                              <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)] pointer-events-none absolute top-1/2 -translate-y-1/2 end-2" />
                            </div>
                            {!isStdRole && (
                              <input
                                type="text"
                                dir="auto"
                                value={sw.role === "custom" ? "" : sw.role}
                                onChange={(e) => {
                                  const val = e.target.value || "custom";
                                  setFormPalette((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, role: val } : item,
                                    ),
                                  );
                                }}
                                placeholder={
                                  isRtl ? "اكتب الليبل..." : "Custom label..."
                                }
                                className="w-28 h-8 bg-[var(--color-back-main)] border border-[var(--color-border)] rounded-lg px-2.5 text-xs text-[var(--color-text-header)] outline-none"
                              />
                            )}
                            {formPalette.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setFormPalette((prev) =>
                                    prev.filter((_, i) => i !== idx),
                                  )
                                }
                                aria-label={
                                  isRtl ? "حذف اللون" : "Delete color row"
                                }
                                className="h-8 w-8 rounded-lg bg-[var(--color-control)] hover:bg-rose-500/15 text-[var(--color-text-dim)] hover:text-rose-400 flex items-center justify-center cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 4. Description & Guidelines Notes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block font-semibold text-[var(--color-text-muted)] mb-1">
                        {isRtl
                          ? "وصف المشروع والأهداف"
                          : "Project Description"}
                      </label>
                      <textarea
                        rows={3}
                        dir="auto"
                        value={formDescription}
                        onChange={(e: any) =>
                          setFormDescription(e.target.value)
                        }
                        placeholder={
                          isRtl
                            ? "ملخص المشروع، القنوات المستهدفة..."
                            : "Brief summary of the brand project..."
                        }
                        className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none resize-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[var(--color-text-muted)] mb-1">
                        {isRtl
                          ? "ملاحظات التوجيه الفني (Guidelines)"
                          : "Art Direction & Brand Notes"}
                      </label>
                      <textarea
                        rows={3}
                        dir="auto"
                        value={formNotes}
                        onChange={(e: any) => setFormNotes(e.target.value)}
                        placeholder={
                          isRtl
                            ? "قواعد الاستخدام والتباين والأحجام..."
                            : "Typography hierarchy & spacing guidelines..."
                        }
                        className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none resize-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingWorkspace(false);
                        setEditingWorkspaceId(null);
                      }}
                      className="px-4 py-2 rounded-xl bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] cursor-pointer font-semibold"
                    >
                      {isRtl ? "إلغاء" : "Cancel"}
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white font-bold cursor-pointer flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {editingWorkspaceId
                          ? isRtl
                            ? "حفظ التعديلات"
                            : "Save Changes"
                          : isRtl
                            ? "إنشاء المشروع"
                            : "Create Project"}
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
          const canPortal =
            typeof window !== "undefined" &&
            typeof document !== "undefined" &&
            typeof document.querySelector === "function";
          return canPortal
            ? createPortal(modalNode, document.body)
            : modalNode;
        })()}

      {/* StyleGuide.html Inline Preview Modal (WebView / Offline Safe Fallback) */}
      {styleGuidePreviewHtml &&
        (() => {
          const previewNode = (
            <div
              onClick={() => setStyleGuidePreviewHtml(null)}
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 sm:p-8"
              dir={isRtl ? "rtl" : "ltr"}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-5xl h-[85dvh] bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-back-side)] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                    <span className="text-xs font-bold text-[var(--color-text-header)] truncate">
                      {isRtl
                        ? `دليل الهوية — ${activeWorkspace.name}`
                        : `Brand StyleGuide — ${activeWorkspace.name}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={styleGuideAssetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-7 px-2.5 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-header)] inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>{isRtl ? "فتح في نافذة" : "New Tab"}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setStyleGuidePreviewHtml(null)}
                      aria-label={isRtl ? "إغلاق" : "Close"}
                      className="h-7 w-7 rounded-lg bg-[var(--color-control)] hover:bg-rose-500/20 text-[var(--color-text-muted)] hover:text-rose-400 flex items-center justify-center cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <iframe
                  title={`${activeWorkspace.name} StyleGuide`}
                  srcDoc={styleGuidePreviewHtml}
                  className="w-full flex-1 border-0 bg-[#140d18]"
                />
              </div>
            </div>
          );
          const canPortal =
            typeof window !== "undefined" &&
            typeof document !== "undefined" &&
            typeof document.querySelector === "function";
          return canPortal
            ? createPortal(previewNode, document.body)
            : previewNode;
        })()}
      {/* Rich Task Add / Edit Details Modal */}
      {isTaskModalOpen &&
        (() => {
          const taskModalNode = (
            <div
              data-testid="task-details-modal"
              onClick={() => setIsTaskModalOpen(false)}
              className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
              dir={isRtl ? "rtl" : "ltr"}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-xl bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]"
              >
                <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-back-side)] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-[var(--color-action)]/15 border border-[var(--color-action)]/35 flex items-center justify-center text-[var(--color-action)] shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[var(--color-text-header)] truncate">
                        {editingTaskModalId
                          ? isRtl
                            ? "تعديل تفاصيل المهمة"
                            : "Edit Task Details"
                          : isRtl
                            ? "إضافة مهمة جديدة للمشروع"
                            : "Add New Project Task"}
                      </h3>
                      <p className="text-[11px] text-[var(--color-text-muted)] truncate">
                        {activeWorkspace.name}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTaskModalOpen(false)}
                    aria-label={isRtl ? "إغلاق" : "Close"}
                    className="h-8 w-8 rounded-lg bg-[var(--color-control)] hover:bg-rose-500/20 text-[var(--color-text-muted)] hover:text-rose-400 flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form
                  onSubmit={handleSaveTaskModal}
                  className="p-5 space-y-4 overflow-y-auto text-xs"
                >
                  <div>
                    <label className="block font-semibold text-[var(--color-text-muted)] mb-1.5">
                      {isRtl ? "عنوان المهمة *" : "Task Title *"}
                    </label>
                    <input
                      type="text"
                      required
                      dir="auto"
                      value={taskModalTitle}
                      onChange={(e) => setTaskModalTitle(e.target.value)}
                      placeholder={
                        isRtl
                          ? "مثال: مراجعة تباين الألوان وتصدير ملفات الطباعة..."
                          : "e.g., Audit color contrast & prepare print deliverables..."
                      }
                      className="w-full h-10 bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 text-xs text-[var(--color-text-header)] outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-[var(--color-text-muted)] mb-1.5">
                        {isRtl ? "القسم / التصنيف" : "Category"}
                      </label>
                      <div className="relative">
                        <select
                          value={taskModalCategory}
                          style={SELECT_APPEARANCE_STYLE}
                          onChange={(e) => setTaskModalCategory(e.target.value)}
                          className="w-full h-9 appearance-none !appearance-none bg-[var(--color-back-main)] border border-[var(--color-border)] rounded-xl ps-3 pe-8 text-xs text-[var(--color-text-header)] outline-none cursor-pointer"
                        >
                          {TASK_CATEGORIES.map((c) => (
                            <option key={c.id} value={c.id}>
                              {isRtl ? c.ar : c.en}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)] pointer-events-none absolute top-1/2 -translate-y-1/2 end-2.5" />
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-[var(--color-text-muted)] mb-1.5">
                        {isRtl ? "الأولوية" : "Priority"}
                      </label>
                      <div className="relative">
                        <select
                          value={taskModalPriority}
                          style={SELECT_APPEARANCE_STYLE}
                          onChange={(e) =>
                            setTaskModalPriority(
                              e.target.value as WorkspaceTaskPriority,
                            )
                          }
                          className="w-full h-9 appearance-none !appearance-none bg-[var(--color-back-main)] border border-[var(--color-border)] rounded-xl ps-3 pe-8 text-xs text-[var(--color-text-header)] outline-none cursor-pointer"
                        >
                          <option value="high">
                            {isRtl ? "أولوية عالية" : "High"}
                          </option>
                          <option value="medium">
                            {isRtl ? "متوسطة" : "Medium"}
                          </option>
                          <option value="low">
                            {isRtl ? "منخفضة" : "Low"}
                          </option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)] pointer-events-none absolute top-1/2 -translate-y-1/2 end-2.5" />
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-[var(--color-text-muted)] mb-1.5">
                        {isRtl ? "الحالة" : "Status"}
                      </label>
                      <div className="relative">
                        <select
                          value={taskModalStatus}
                          style={SELECT_APPEARANCE_STYLE}
                          onChange={(e) =>
                            setTaskModalStatus(
                              e.target.value as WorkspaceTask["status"],
                            )
                          }
                          className="w-full h-9 appearance-none !appearance-none bg-[var(--color-back-main)] border border-[var(--color-border)] rounded-xl ps-3 pe-8 text-xs text-[var(--color-text-header)] outline-none cursor-pointer"
                        >
                          <option value="todo">
                            {isRtl ? "قيد الانتظار" : "Todo"}
                          </option>
                          <option value="in_progress">
                            {isRtl ? "جاري العمل" : "In Progress"}
                          </option>
                          <option value="done">
                            {isRtl ? "مكتمل" : "Done"}
                          </option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)] pointer-events-none absolute top-1/2 -translate-y-1/2 end-2.5" />
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-[var(--color-text-muted)] mb-1.5">
                        {isRtl ? "تاريخ الاستحقاق" : "Due Date"}
                      </label>
                      <input
                        type="date"
                        dir="ltr"
                        value={taskModalDueDate}
                        onChange={(e) => setTaskModalDueDate(e.target.value)}
                        className="w-full h-9 bg-[var(--color-back-main)] border border-[var(--color-border)] rounded-xl px-3 text-xs font-mono text-[var(--color-text-header)] outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-[var(--color-text-muted)] mb-1.5">
                      {isRtl
                        ? "التعليمات والتفاصيل"
                        : "Instructions & Notes"}
                    </label>
                    <textarea
                      rows={3}
                      dir="auto"
                      value={taskModalNotes}
                      onChange={(e) => setTaskModalNotes(e.target.value)}
                      placeholder={
                        isRtl
                          ? "اكتب أي تعليمات فنية، ملاحظات العميل، أو مواصفات التنفيذ..."
                          : "Write art direction instructions, client notes, or specs..."
                      }
                      className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-header)] outline-none resize-y"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[var(--color-text-muted)] mb-1.5">
                      {isRtl
                        ? "نقاط التحقق / الخطوات الفرعية (سطر لكل خطوة)"
                        : "Sub-steps / Checklist (one per line)"}
                    </label>
                    <textarea
                      rows={3}
                      dir="auto"
                      value={taskModalChecklistText}
                      onChange={(e) =>
                        setTaskModalChecklistText(e.target.value)
                      }
                      placeholder={
                        isRtl
                          ? "مثال:\nتفعيل خطوط المشروع\nفحص الألوان في Illustrator\nتصدير PDF للطباعة"
                          : "e.g.,\nActivate project fonts\nCheck swatches in Illustrator\nExport print-ready PDF"
                      }
                      className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-header)] outline-none resize-y"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                    <button
                      type="button"
                      onClick={() => setIsTaskModalOpen(false)}
                      className="h-9 px-4 rounded-xl bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] font-semibold cursor-pointer"
                    >
                      {isRtl ? "إلغاء" : "Cancel"}
                    </button>
                    <button
                      type="submit"
                      className="h-9 px-5 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        {editingTaskModalId
                          ? isRtl
                            ? "حفظ التعديلات"
                            : "Save Task"
                          : isRtl
                            ? "حفظ وإضافة المهمة"
                            : "Create Task"}
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
          const canPortal =
            typeof window !== "undefined" &&
            typeof document !== "undefined" &&
            typeof document.querySelector === "function";
          return canPortal
            ? createPortal(taskModalNode, document.body)
            : taskModalNode;
        })()}
    </div>
  );
}
