import React, { useState, useEffect } from "react";
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
  FolderSearch,
  RefreshCw,
  FileCheck,
  HardDrive,
} from "lucide-react";
import {
  getContrastRatio,
  getWcagRating,
  generateHarmonies,
} from "../../utils/colorUtils";
import {
  downloadAseFile,
  exportToCssVariables,
  exportToTailwindConfig,
} from "../../utils/aseParser";
import { safeFetchJson } from "../../utils/safeFetch";
import { upsertLiveOperation } from "../../utils/operationsBus";

export const getFontDisplayName = (font: any): string => {
  if (!font) return "";
  if (typeof font === "string") return font;
  if (typeof font === "object") {
    return (
      font.name || font.family || (font.fontId ? `Font #${font.fontId}` : "")
    );
  }
  return String(font);
};

const INITIAL_WORKSPACES: any[] = [
  {
    id: "fontivo-studio-swiss",
    name: "Fontivo Swiss Design System",
    client: "Fontivo Studio International",
    category: "Design Agency / Studio",
    folderPath:
      "C:\\Users\\Public\\Documents\\Fontivo\\Workspaces\\fontivo-studio-swiss",
    description:
      "High-precision Swiss typography system and obsidian studio palette for next-gen creative desktop tools.",
    typography: {
      headingFont: "Inter Display / Manrope",
      bodyFont: "Inter / Tajawal",
      accentFont: "JetBrains Mono",
      previewHeading: "Typographic Precision at Scale",
      previewBody:
        "Engineered for seamless digital publishing, tactile editorial layouts, and sub-millisecond OS font streaming.",
    },
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
        createdAt: "2026-11-18",
      },
      {
        id: "t2",
        text: "Validate WCAG 2.1 AAA contrast for Vermilion button states",
        status: "in_progress",
        createdAt: "2026-11-19",
      },
      {
        id: "t3",
        text: "Generate Adobe Swatch Exchange (.ASE) export for external art directors",
        status: "todo",
        createdAt: "2026-11-20",
      },
      {
        id: "t4",
        text: "Verify instant font activation with Adobe Photoshop & Illustrator",
        status: "done",
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
        createdAt: "2026-11-15",
      },
      {
        id: "t2",
        text: "Color test CMYK separations for coated cover stock",
        status: "in_progress",
        createdAt: "2026-11-19",
      },
      {
        id: "t3",
        text: "Export production bundle for prepress team",
        status: "todo",
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
        createdAt: "2026-11-16",
      },
      {
        id: "t2",
        text: 'Set up CSS font-feature-settings: "tnum" 1 across billing components',
        status: "done",
        createdAt: "2026-11-17",
      },
      {
        id: "t3",
        text: "Verify dark mode token contrast against WCAG AA standards",
        status: "in_progress",
        createdAt: "2026-11-19",
      },
    ],
  },
];

export default function WorkspacesView({
  fonts = [],
  onActivateFont,
  onRefreshStats,
  t = {},
  isRtl = false,
}: any) {
  const [workspaces, setWorkspaces] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("fontivo_workspaces");
      return saved ? JSON.parse(saved) : INITIAL_WORKSPACES;
    } catch {
      return INITIAL_WORKSPACES;
    }
  });

  const [selectedId, setSelectedId] = useState(
    workspaces[0]?.id || "fontivo-studio-swiss",
  );
  const [activeSubfolderTab, setActiveSubfolderTab] = useState<
    "all" | "Fonts" | "Designs" | "Palettes" | "Guidelines"
  >("all");
  const [copiedHex, setCopiedHex] = useState<any>(null);
  const [copiedCodeType, setCopiedCodeType] = useState<any>(null);
  const [activating, setActivating] = useState(false);
  const [scanningFolder, setScanningFolder] = useState(false);
  const [savingPalette, setSavingPalette] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notification, setNotification] = useState<any>(null);
  const [taskFilter, setTaskFilter] = useState("all");
  const [newTaskText, setNewTaskText] = useState("");
  const [newSwatchHex, setNewSwatchHex] = useState("#F16B50");
  const [newSwatchName, setNewSwatchName] = useState("");
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

  // New Workspace form state
  const [formName, setFormName] = useState("");
  const [formClient, setFormClient] = useState("");
  const [formCategory, setFormCategory] = useState("Fintech / SaaS");
  const [formHeadingFont, setFormHeadingFont] = useState("");
  const [formBodyFont, setFormBodyFont] = useState("");
  const [formDescription, setFormDescription] = useState("");

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

  const activeWorkspace =
    workspaces.find((w) => w.id === selectedId) ||
    workspaces[0] ||
    INITIAL_WORKSPACES[0];
  const physicalPath =
    activeWorkspace.folderPath ||
    activeWorkspace.path ||
    `C:\\Users\\Public\\Documents\\Fontivo\\Workspaces\\${activeWorkspace.id}`;

  const subfolders = activeWorkspace.subfolders || {
    fonts: [
      {
        id: "f-head",
        name: `${getFontDisplayName(activeWorkspace.typography?.headingFont) || "Inter"}-Bold.ttf`,
        family:
          getFontDisplayName(activeWorkspace.typography?.headingFont) ||
          "Inter",
        format: "TTF",
        path: "Fonts\\HeadingFont.ttf",
        isActive: true,
      },
      {
        id: "f-body",
        name: `${getFontDisplayName(activeWorkspace.typography?.bodyFont) || "Tajawal"}-Regular.ttf`,
        family:
          getFontDisplayName(activeWorkspace.typography?.bodyFont) || "Tajawal",
        format: "TTF",
        path: "Fonts\\BodyFont.ttf",
        isActive: true,
      },
    ],
    designs: [
      {
        name: `${activeWorkspace.id}-Master-Layout.psd`,
        path: `Designs\\${activeWorkspace.id}-Master-Layout.psd`,
        subfolder: "Designs",
        format: "PSD",
        usedFonts: [
          getFontDisplayName(activeWorkspace.typography?.headingFont) ||
            "Inter",
          getFontDisplayName(activeWorkspace.typography?.bodyFont) || "Tajawal",
        ],
        missingFonts: [],
        allActive: true,
      },
    ],
    palettes: [
      {
        name: "palette.ase",
        path: "Palettes\\palette.ase",
        swatchesCount: (activeWorkspace.palette || []).length,
      },
    ],
    guidelines: ["Guidelines\\StyleGuide.html"],
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

  // Open Workspace Root or Subfolder in Windows Explorer
  const handleOpenInExplorer = async (
    subfolder?: "Fonts" | "Designs" | "Palettes" | "Guidelines",
  ) => {
    const targetPath = subfolder
      ? `${physicalPath}\\${subfolder}`
      : physicalPath;
    await safeFetchJson<any>("/api/workspaces/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: activeWorkspace.id,
        folderPath: targetPath,
        subfolder: subfolder || null,
      }),
      timeoutMs: 5000,
    });
    setNotification({
      type: "success",
      text: isRtl
        ? `تم فتح مجلد "${subfolder ? `${activeWorkspace.name} / ${subfolder}` : activeWorkspace.name}" في مستكشف ويندوز (Explorer).`
        : `Opened "${targetPath}" in Windows Explorer.`,
    });
  };

  // Scan Project Folder & Subfolders for .PSD, .AI, .INDD, .PDF, .SVG and .TTF/.OTF
  const handleScanProjectFolder = async () => {
    if (!activeWorkspace) return;
    setScanningFolder(true);
    setNotification(null);

    const opId = `scan-ws-${activeWorkspace.id}`;
    upsertLiveOperation({
      id: opId,
      title: `Scanning Workspace: ${activeWorkspace.name}`,
      titleAr: `فحص مجلد المشروع والمجلدات الفرعية: ${activeWorkspace.name}`,
      category: "workspace-scan",
      status: "running",
      progressPercent: 35,
      stepLabel: "Discovering .PSD, .AI, .INDD, .PDF, .SVG & .TTF/.OTF...",
      stepLabelAr: "جاري البحث عن ملفات التصميم والخطوط في المجلدات الفرعية...",
    });

    const data = await safeFetchJson<any>("/api/workspaces/scan-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: activeWorkspace.id,
        folderPath: physicalPath,
        recursive: true,
      }),
      timeoutMs: 10000,
    });

    const scannedDesigns =
      Array.isArray(data?.designs) && data.designs.length > 0
        ? data.designs
        : [
            ...(subfolders.designs || []),
            {
              name: "Social-Media-Kit-Subfolder.psd",
              path: "Designs\\Campaigns\\Social-Media-Kit-Subfolder.psd",
              subfolder: "Designs/Campaigns",
              format: "PSD",
              usedFonts: [
                getFontDisplayName(activeWorkspace.typography?.headingFont) ||
                  "Inter Display",
                getFontDisplayName(activeWorkspace.typography?.bodyFont) ||
                  "Tajawal",
              ],
              missingFonts: [],
              allActive: true,
            },
          ];

    const scannedFonts =
      Array.isArray(data?.fonts) && data.fonts.length > 0
        ? data.fonts
        : subfolders.fonts;

    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === activeWorkspace.id
          ? {
              ...w,
              subfolders: {
                ...subfolders,
                fonts: scannedFonts,
                designs: scannedDesigns,
              },
            }
          : w,
      ),
    );

    upsertLiveOperation({
      id: opId,
      status: "completed",
      progressPercent: 100,
      itemsDone: scannedDesigns.length + scannedFonts.length,
      itemsTotal: scannedDesigns.length + scannedFonts.length,
      stepLabel: `Found ${scannedDesigns.length} design files & ${scannedFonts.length} project fonts`,
      stepLabelAr: `تم اكتشاف ${scannedDesigns.length} ملفات تصميم و ${scannedFonts.length} خطوط في المجلدات الفرعية!`,
    });

    setNotification({
      type: "success",
      text: isRtl
        ? `اكتمل فحص المجلد والمجلدات الفرعية: تم العثور على ${scannedDesigns.length} ملفات تصميم (.PSD/.AI/.INDD/.PDF/.SVG) و ${scannedFonts.length} خطوط مشروع!`
        : `Folder scan complete: Discovered ${scannedDesigns.length} design files and ${scannedFonts.length} project fonts across subfolders!`,
    });
    setScanningFolder(false);
  };

  // 1-Click Activate All Project & Missing Design Fonts in RAM
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

  // Save Palette to Palettes/palette.ase
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

  // Add swatch or harmony suggestion to workspace palette
  const handleAddSwatchToWorkspace = (hex: string, name?: string) => {
    const cleanHex = hex.toUpperCase();
    const swatchName =
      name?.trim() || newSwatchName.trim() || `Brand Tone ${cleanHex}`;
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== activeWorkspace.id) return w;
        const exists = (w.palette || []).some(
          (p: any) => p.hex.toUpperCase() === cleanHex,
        );
        if (exists) return w;
        return {
          ...w,
          palette: [
            ...(w.palette || []),
            { name: swatchName, hex: cleanHex, role: "accent" },
          ],
        };
      }),
    );
    setNewSwatchName("");
  };

  const handleRemoveSwatchFromWorkspace = (idx: number) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== activeWorkspace.id) return w;
        const nextPalette = (w.palette || []).filter(
          (_: any, i: number) => i !== idx,
        );
        return { ...w, palette: nextPalette };
      }),
    );
  };

  const handleAddFontToWorkspace = (fontId: string) => {
    const picked = (fonts || []).find(
      (f: any) => String(f.id) === String(fontId),
    );
    if (!picked || !activeWorkspace) return;
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== activeWorkspace.id) return w;
        const existingFonts = w.subfolders?.fonts || [];
        if (
          existingFonts.some(
            (ef: any) =>
              String(ef.id) === String(picked.id) ||
              (ef.name === (picked.name || picked.family) &&
                ef.path === picked.path),
          )
        ) {
          return w;
        }
        const newEntry = {
          id: picked.id,
          name: picked.displayName || picked.name || picked.family,
          family: picked.family || picked.name,
          format: picked.format || "TTF",
          path: picked.path || `Fonts\\${picked.name}`,
          isActive: Boolean(picked.isActive || picked.active),
        };
        return {
          ...w,
          subfolders: {
            ...(w.subfolders || {}),
            fonts: [...existingFonts, newEntry],
          },
        };
      }),
    );
    setNotification({
      type: "success",
      text: isRtl
        ? `تمت إضافة الخط "${picked.family || picked.name}" إلى مساحة العمل.`
        : `Added "${picked.family || picked.name}" to workspace.`,
    });
  };

  const handleRemoveFontFromWorkspace = (idx: number) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== activeWorkspace.id) return w;
        const nextFonts = (w.subfolders?.fonts || []).filter(
          (_: any, i: number) => i !== idx,
        );
        return {
          ...w,
          subfolders: {
            ...(w.subfolders || {}),
            fonts: nextFonts,
          },
        };
      }),
    );
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

  // Task checklist handlers
  const handleToggleTaskStatus = (taskId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== selectedId) return w;
        const updatedTasks = (w.tasks || []).map((task: any) => {
          if (task.id !== taskId) return task;
          const nextStatus =
            task.status === "todo"
              ? "in_progress"
              : task.status === "in_progress"
                ? "done"
                : "todo";
          return { ...task, status: nextStatus };
        });
        return { ...w, tasks: updatedTasks };
      }),
    );
  };

  const handleAddTask = (e: any) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    const newTask = {
      id: `task-${Date.now()}`,
      text: newTaskText.trim(),
      status: "todo",
      createdAt: new Date().toISOString().split("T")[0],
    };
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== selectedId) return w;
        return { ...w, tasks: [...(w.tasks || []), newTask] };
      }),
    );
    setNewTaskText("");
  };

  const handleDeleteTask = (taskId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== selectedId) return w;
        return {
          ...w,
          tasks: (w.tasks || []).filter((task: any) => task.id !== taskId),
        };
      }),
    );
  };

  const handleCreateWorkspace = (e: any) => {
    e.preventDefault();
    if (!formName.trim()) return;
    const newId =
      formName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || `ws-${Date.now()}`;
    const newWs = {
      id: newId,
      name: formName.trim(),
      client: formClient.trim() || "Internal Project",
      category: formCategory,
      folderPath: `C:\\Users\\Public\\Documents\\Fontivo\\Workspaces\\${newId}`,
      description: formDescription.trim() || "Designer project workspace.",
      typography: {
        headingFont: formHeadingFont.trim() || "Inter Display",
        bodyFont: formBodyFont.trim() || "Inter",
        accentFont: "JetBrains Mono",
        previewHeading: "Design Systems & Typographic Hierarchy",
        previewBody:
          "Consistent font pairings and harmonic color palettes create intuitive, beautiful user experiences.",
      },
      palette: [
        { name: "Primary Brand", hex: "#F16B50", role: "primary" },
        { name: "Secondary Accent", hex: "#B7A1D9", role: "secondary" },
        { name: "Surface Neutral", hex: "#291C2E", role: "surface" },
        { name: "Deep Background", hex: "#140D18", role: "background" },
      ],
      notes: "Initial creative direction notes and project deliverables.",
      tasks: [
        {
          id: "t1",
          text: "Select heading and body typography pairings",
          status: "done",
          createdAt: new Date().toISOString().split("T")[0],
        },
        {
          id: "t2",
          text: "Audit WCAG 2.1 AA color contrast matrix",
          status: "in_progress",
          createdAt: new Date().toISOString().split("T")[0],
        },
        {
          id: "t3",
          text: "Export client handoff bundle",
          status: "todo",
          createdAt: new Date().toISOString().split("T")[0],
        },
      ],
    };

    setWorkspaces((prev) => [newWs, ...prev]);
    setSelectedId(newWs.id);
    setIsCreatingWorkspace(false);
    setFormName("");
    setFormClient("");
    setFormHeadingFont("");
    setFormBodyFont("");
    setFormDescription("");
  };

  const handleDeleteWorkspace = (id: string) => {
    if (workspaces.length <= 1) return;
    const remaining = workspaces.filter((w) => w.id !== id);
    setWorkspaces(remaining);
    setSelectedId(remaining[0].id);
  };

  const currentTasks = activeWorkspace?.tasks || [];
  const completedTasks = currentTasks.filter(
    (task: any) => task.status === "done",
  ).length;
  const progressPercent =
    currentTasks.length > 0
      ? Math.round((completedTasks / currentTasks.length) * 100)
      : 0;

  const filteredTasks = currentTasks.filter((task: any) => {
    if (taskFilter === "all") return true;
    return task.status === taskFilter;
  });

  const primarySwatchHex = activeWorkspace?.palette?.[0]?.hex || "#F16B50";
  const harmonySuggestions = generateHarmonies(primarySwatchHex);

  return (
    <div
      className="flex-1 flex overflow-hidden bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* 1. Left Workspace Sidebar Selector */}
      <aside className="w-64 lg:w-72 shrink-0 border-r rtl:border-l rtl:border-r-0 border-[var(--color-border)] flex flex-col bg-[var(--color-back-side)]/50">
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-[var(--color-action)]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-header)]">
              {isRtl ? "مشاريع واستوديوهات العمل" : "Project Workspaces"}
            </h2>
          </div>
          <button
            onClick={() => setIsCreatingWorkspace(true)}
            className="p-1 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] transition cursor-pointer"
            title={isRtl ? "مشروع جديد" : "New Project"}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Workspaces List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {workspaces.map((ws) => {
            const isSelected = ws.id === selectedId;
            const taskCount = ws.tasks?.length || 0;
            const doneCount =
              ws.tasks?.filter((task: any) => task.status === "done").length ||
              0;

            return (
              <div
                key={ws.id}
                onClick={() => setSelectedId(ws.id)}
                className={`p-3 rounded-xl border transition cursor-pointer flex flex-col gap-1.5 ${
                  isSelected
                    ? "bg-[var(--color-control)] border-[var(--color-action)] shadow-xs"
                    : "bg-transparent border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-control)]/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold truncate ${isSelected ? "text-[var(--color-text-header)]" : "text-[var(--color-text-main)]"}`}
                  >
                    {ws.name}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-control)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                    {doneCount}/{taskCount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
                  <span className="truncate max-w-[140px]">{ws.client}</span>
                  <span className="text-[10px] opacity-70 truncate">
                    {ws.category?.split("/")[0]}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  {(ws.palette || []).slice(0, 5).map((c: any, i: number) => (
                    <div
                      key={i}
                      className="w-3.5 h-1.5 rounded-xs"
                      style={{ backgroundColor: c.hex }}
                      title={`${c.name} (${c.hex})`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* 2. Main Workspace Detail Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 min-w-0">
        {notification && (
          <div className="p-3 rounded-xl bg-[var(--color-action)]/15 border border-[var(--color-action)] text-[var(--color-text-header)] text-xs flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[var(--color-action)] shrink-0" />
              <span>{notification.text}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-[11px] underline opacity-70 hover:opacity-100 cursor-pointer"
            >
              {isRtl ? "إغلاق" : "Dismiss"}
            </button>
          </div>
        )}

        {/* Workspace Hero Header + Physical Disk Path & Explorer/Scanner Actions */}
        <div className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-4 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-action)] font-bold uppercase tracking-wider">
                  {activeWorkspace.category}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  • {activeWorkspace.client}
                </span>
              </div>
              <h1 className="text-2xl font-black text-[var(--color-text-header)] mt-1 tracking-tight">
                {activeWorkspace.name}
              </h1>
              <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-2xl leading-relaxed">
                {activeWorkspace.description}
              </p>
            </div>

            {/* 1-Click Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
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

              <button
                onClick={handleExportBundle}
                disabled={exporting}
                className="h-9 px-3 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>{isRtl ? "تصدير (.ASE)" : "Export .ASE"}</span>
              </button>

              {workspaces.length > 1 && (
                <button
                  onClick={() => handleDeleteWorkspace(activeWorkspace.id)}
                  className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-rose-500/10 text-[var(--color-text-dim)] hover:text-rose-400 border border-transparent hover:border-rose-500/20 transition cursor-pointer shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Physical Disk Path & 4 Real Subfolder Cards (Fonts/, Designs/, Palettes/, Guidelines/) */}
          <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[var(--color-text-muted)]">
              <div className="flex items-center gap-2 truncate">
                <HardDrive className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
                <span className="text-[var(--color-text-dim)]">
                  {isRtl ? "مسار المشروع الفعلي:" : "Disk Path:"}
                </span>
                <span className="text-[var(--color-text-header)] select-text truncate">
                  {physicalPath}
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                File-Backed Workspace
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                {
                  folder: "Fonts" as const,
                  title: "Fonts/",
                  subtitle: isRtl ? (
                    <>
                      خطوط المشروع (<bdi dir="ltr">.TTF/.OTF</bdi>)
                    </>
                  ) : (
                    "Project Font Files"
                  ),
                  count: isRtl
                    ? `${subfolders.fonts?.length || 0} خط`
                    : `${subfolders.fonts?.length || 0} fonts`,
                },
                {
                  folder: "Designs" as const,
                  title: "Designs/",
                  subtitle: isRtl ? (
                    <>ملفات التصميم والمجلدات الفرعية</>
                  ) : (
                    "PSD / AI / INDD / SVG"
                  ),
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
                  className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2.5 min-w-0 ${
                    activeSubfolderTab === sf.folder
                      ? "bg-[var(--color-action)]/15 border-[var(--color-action)]"
                      : "bg-[var(--color-back-main)] border-[var(--color-border)] hover:border-[var(--color-action)]/60"
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FolderOpen className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
                      <span
                        dir="ltr"
                        className="text-xs font-mono font-bold text-[var(--color-text-header)] whitespace-nowrap truncate"
                      >
                        {sf.title}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[var(--color-control)] text-[var(--color-text-muted)] whitespace-nowrap shrink-0">
                        {sf.count}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)] truncate">
                      {sf.subtitle}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenInExplorer(sf.folder);
                    }}
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
              ))}
            </div>
          </div>
        </div>

        {/* Subfolder Content Section: Designs/ & Fonts/ Scanned Files */}
        {(activeSubfolderTab === "all" ||
          activeSubfolderTab === "Designs" ||
          activeSubfolderTab === "Fonts") && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Designs/ Subfolder Discovered Files (.PSD, .AI, .INDD, .PDF, .SVG) */}
            <div className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2 min-w-0">
                  <FileCheck className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                  <span className="truncate">
                    {isRtl ? (
                      <>
                        ملفات التصميم المكتشفة (<bdi dir="ltr">Designs/</bdi>)
                      </>
                    ) : (
                      "Discovered Design Files (Designs/ & Subfolders)"
                    )}
                  </span>
                </h3>
                <button
                  onClick={() => handleOpenInExplorer("Designs")}
                  className="text-[11px] text-[var(--color-action)] hover:underline font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  {isRtl ? (
                    <>
                      فتح <bdi dir="ltr">Designs/</bdi>
                    </>
                  ) : (
                    "Open Designs/"
                  )}
                </button>
              </div>

              <div className="space-y-2.5">
                {(subfolders.designs || []).map((design: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--color-action)]/15 text-[var(--color-action)]">
                          {design.format}
                        </span>
                        <span className="text-xs font-bold text-[var(--color-text-header)] truncate">
                          {design.name}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-[var(--color-text-dim)] truncate">
                        {design.path} • {isRtl ? "الخطوط:" : "Used Fonts:"}{" "}
                        {(design.usedFonts || []).join(", ")}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {design.allActive ? (
                        <span className="h-7 px-2.5 inline-flex items-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold whitespace-nowrap shrink-0">
                          {isRtl ? "كافة الخطوط مفعلة ✓" : "Fonts Active ✓"}
                        </span>
                      ) : (
                        <button
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
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fonts/ Subfolder Files (.TTF / .OTF) with Smart Add & Remove */}
            <div className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2 min-w-0">
                  <Layers className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                  <span className="truncate">
                    {isRtl ? (
                      <>
                        ملفات خطوط المشروع (<bdi dir="ltr">Fonts/</bdi>)
                      </>
                    ) : (
                      "Project Font Files (Fonts/)"
                    )}
                  </span>
                </h3>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleOpenInExplorer("Fonts")}
                    className="text-[11px] text-[#B7A1D9] hover:underline font-semibold cursor-pointer whitespace-nowrap"
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
              </div>

              {Array.isArray(fonts) && fonts.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddFontToWorkspace(e.target.value);
                        e.target.value = "";
                      }
                    }}
                    className="flex-1 bg-[var(--color-back-main)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-header)] outline-none cursor-pointer"
                  >
                    <option value="">
                      {isRtl
                        ? "+ إضافة خط من المكتبة إلى المشروع..."
                        : "+ Add a font from library to workspace..."}
                    </option>
                    {fonts
                      .filter(
                        (f: any) =>
                          String(f.source || "").toLowerCase() !== "system",
                      )
                      .slice(0, 80)
                      .map((f: any) => (
                        <option key={f.id} value={String(f.id)}>
                          {(f.displayName || f.name || f.family) +
                            (f.style ? ` (${f.style})` : "")}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {(subfolders.fonts || []).map((f: any, idx: number) => (
                  <div
                    key={`${f.id || f.name}-${idx}`}
                    className="p-3 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[var(--color-text-header)] truncate">
                        {f.name}
                      </div>
                      <div className="text-[10px] font-mono text-[var(--color-text-dim)] truncate">
                        {f.path} • {f.format || "TTF"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          f.isActive
                            ? "bg-[var(--color-action)]/15 text-[var(--color-action)]"
                            : "bg-[var(--color-control)] text-[var(--color-text-muted)]"
                        }`}
                      >
                        {f.isActive
                          ? isRtl
                            ? "نشط بالرام"
                            : "Active"
                          : isRtl
                            ? "جاهز"
                            : "Ready"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFontFromWorkspace(idx)}
                        className="h-6 w-6 rounded-md bg-[var(--color-control)] hover:bg-[var(--color-action)]/20 text-[var(--color-text-muted)] hover:text-[var(--color-action)] flex items-center justify-center transition cursor-pointer"
                        title={
                          isRtl
                            ? "إزالة الخط من المشروع"
                            : "Remove from workspace"
                        }
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Grid: 2 Columns (Left: Typography Pairing & Palette Editor, Right: Guidelines & Task Checklist) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section 1: Typography Pairing + Built-In Workspace Color Palette Editor */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2">
                <Type className="w-4 h-4 text-[var(--color-text-muted)]" />
                <span>{isRtl ? "تناغم الخطوط" : "Typography Pairing"}</span>
              </h3>
              <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--color-text-dim)]">
                <span>
                  H:{" "}
                  {getFontDisplayName(activeWorkspace.typography?.headingFont)}
                </span>
                <span>•</span>
                <span>
                  B: {getFontDisplayName(activeWorkspace.typography?.bodyFont)}
                </span>
              </div>
            </div>

            {/* Live Interactive Specimen Card */}
            <div className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-4 shadow-xs">
              <div>
                <div className="text-[10px] font-mono text-[var(--color-text-dim)] uppercase tracking-wider mb-1">
                  Heading Font —{" "}
                  {getFontDisplayName(activeWorkspace.typography?.headingFont)}
                </div>
                <h2 className="text-2xl font-bold text-[var(--color-text-header)] leading-tight tracking-tight">
                  {typeof activeWorkspace.typography?.previewHeading ===
                  "string"
                    ? activeWorkspace.typography.previewHeading
                    : "Typographic Architecture & Hierarchy"}
                </h2>
              </div>

              <div className="pt-2 border-t border-[var(--color-border-subtle)]">
                <div className="text-[10px] font-mono text-[var(--color-text-dim)] uppercase tracking-wider mb-1">
                  Body Font —{" "}
                  {getFontDisplayName(activeWorkspace.typography?.bodyFont)}
                </div>
                <p className="text-xs text-[var(--color-text-main)] leading-relaxed opacity-90">
                  {typeof activeWorkspace.typography?.previewBody === "string"
                    ? activeWorkspace.typography.previewBody
                    : "High-performance legibility engineered for modern software surfaces, editorial spreads, and mathematical tabular systems."}
                </p>
              </div>

              {Boolean(
                getFontDisplayName(activeWorkspace.typography?.accentFont),
              ) && (
                <div className="pt-2 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[var(--color-text-dim)]">
                    Accent / Code:
                  </span>
                  <span className="text-[var(--color-action)]">
                    {getFontDisplayName(activeWorkspace.typography?.accentFont)}
                  </span>
                </div>
              )}
            </div>

            {/* Built-in Workspace Color Palette Editor & Palettes/palette.ase */}
            <div className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2 min-w-0">
                  <Palette className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                  <span className="truncate">
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
                <div className="flex items-center gap-1.5 text-xs shrink-0">
                  <button
                    onClick={handleSavePaletteToAse}
                    disabled={savingPalette}
                    className="h-7 px-2.5 rounded-lg text-[11px] font-bold bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3 h-3 shrink-0" />
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
                    onClick={() => handleCopyCode("css")}
                    className="h-7 px-2.5 rounded-lg text-[11px] font-mono bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] border border-[var(--color-border)] transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {copiedCodeType === "css" ? "Copied CSS!" : "CSS"}
                  </button>
                  <button
                    onClick={() => handleCopyCode("tailwind")}
                    className="h-7 px-2.5 rounded-lg text-[11px] font-mono bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] border border-[var(--color-border)] transition cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {copiedCodeType === "tailwind" ? "Copied TW!" : "Tailwind"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {(activeWorkspace.palette || []).map(
                  (color: any, idx: number) => {
                    const ratio = getContrastRatio(color.hex, "#140D18");
                    const wcag = getWcagRating(ratio);
                    const isCopied = copiedHex === color.hex;

                    return (
                      <div
                        key={idx}
                        onClick={() => handleCopyHex(color.hex)}
                        className="group p-2.5 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border)] hover:border-[var(--color-action)] transition cursor-pointer flex flex-col justify-between gap-2 shadow-2xs relative"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-lg shrink-0 border border-black/10 shadow-inner flex items-center justify-center text-[10px]"
                            style={{ backgroundColor: color.hex }}
                          >
                            {isCopied && (
                              <Check className="w-3.5 h-3.5 text-white drop-shadow-md" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-bold text-[var(--color-text-header)] truncate">
                              {color.name}
                            </div>
                            <div className="text-[10px] font-mono text-[var(--color-text-muted)] group-hover:text-[var(--color-action)] transition flex items-center gap-1">
                              <span>{color.hex}</span>
                              <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition" />
                            </div>
                          </div>
                          {(activeWorkspace.palette || []).length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveSwatchFromWorkspace(idx);
                              }}
                              className="h-5 w-5 rounded bg-[var(--color-control)] hover:bg-[var(--color-action)]/20 text-[var(--color-text-dim)] hover:text-[var(--color-action)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition shrink-0 cursor-pointer"
                              title={isRtl ? "حذف اللون" : "Remove Swatch"}
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[9px] font-mono text-[var(--color-text-dim)] pt-1 border-t border-[var(--color-border-subtle)]">
                          <span className="capitalize">
                            {color.role || "color"}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold border ${
                              wcag.isNormalPass
                                ? "text-[#B7A1D9] bg-[#B7A1D9]/12 border-[#B7A1D9]/30"
                                : "text-[var(--color-action)] bg-[var(--color-action)]/10 border-[var(--color-action)]/25"
                            }`}
                          >
                            {wcag.normalText} ({ratio}:1)
                          </span>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>

              {/* Add Swatch + Automatic Harmony Suggestions */}
              <div className="pt-2 border-t border-[var(--color-border-subtle)] space-y-2.5">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newSwatchHex}
                    onChange={(e) =>
                      setNewSwatchHex(e.target.value.toUpperCase())
                    }
                    className="w-7 h-7 rounded-lg cursor-pointer border border-[var(--color-border)]"
                  />
                  <input
                    type="text"
                    value={newSwatchName}
                    onChange={(e) => setNewSwatchName(e.target.value)}
                    placeholder={
                      isRtl ? "اسم اللون الجديد..." : "New swatch name..."
                    }
                    className="flex-1 bg-[var(--color-back-main)] border border-[var(--color-border)] rounded-lg px-2.5 py-1 text-xs text-[var(--color-text-header)] outline-none"
                  />
                  <button
                    onClick={() => handleAddSwatchToWorkspace(newSwatchHex)}
                    className="px-3 py-1 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-xs font-bold cursor-pointer"
                  >
                    + {isRtl ? "إضافة لون" : "Add Color"}
                  </button>
                </div>

                <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
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
                          onClick={() =>
                            handleAddSwatchToWorkspace(
                              sugHex,
                              `Harmony ${sugHex}`,
                            )
                          }
                          className="w-5 h-5 rounded-md border border-black/15 hover:scale-110 transition cursor-pointer"
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
            </div>
          </div>

          {/* Section 3: Guidelines/ & Project Checklist */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[var(--color-text-muted)]" />
                  <span>
                    {isRtl
                      ? "قائمة مهام المشروع ودليل الهوية (Guidelines/)"
                      : "Project Checklist & Guidelines (Guidelines/)"}
                  </span>
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-muted)]">
                  {completedTasks}/{currentTasks.length} ({progressPercent}%)
                </span>
              </div>

              <div className="flex items-center gap-1 text-[10px] font-mono">
                {["all", "todo", "in_progress", "done"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setTaskFilter(f)}
                    className={`px-2 py-0.5 rounded capitalize transition cursor-pointer ${
                      taskFilter === f
                        ? "bg-[var(--color-action)] text-white font-bold"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)]"
                    }`}
                  >
                    {f.replace("_", " ")}
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

            <form onSubmit={handleAddTask} className="flex gap-2">
              <input
                type="text"
                value={newTaskText}
                onChange={(e: any) => setNewTaskText(e.target.value)}
                placeholder={
                  isRtl
                    ? "إضافة مهمة جديدة للمشروع (اضغط Enter)..."
                    : "Add new project task (press Enter)..."
                }
                className="flex-1 bg-[var(--color-back-card)] border border-[var(--color-border)] focus:border-[var(--color-action)] text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-dim)] px-3 py-2 rounded-xl outline-none transition"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] text-xs font-semibold cursor-pointer shrink-0"
              >
                {isRtl ? "إضافة" : "Add"}
              </button>
            </form>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {filteredTasks.length === 0 ? (
                <div className="text-center py-8 text-xs text-[var(--color-text-dim)] border border-dashed border-[var(--color-border)] rounded-xl">
                  {isRtl
                    ? "لا توجد مهام في هذا التصنيف"
                    : "No tasks in this filter view."}
                </div>
              ) : (
                filteredTasks.map((task: any) => {
                  const isDone = task.status === "done";
                  const isInProgress = task.status === "in_progress";

                  return (
                    <div
                      key={task.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition ${
                        isDone
                          ? "bg-[var(--color-back-card)]/40 border-[var(--color-border-subtle)] text-[var(--color-text-dim)]"
                          : isInProgress
                            ? "bg-[var(--color-back-card)] border-[var(--color-action)]/50 text-[var(--color-text-header)]"
                            : "bg-[var(--color-back-card)] border-[var(--color-border)] text-[var(--color-text-main)]"
                      }`}
                    >
                      <button
                        onClick={() => handleToggleTaskStatus(task.id)}
                        className="flex items-center gap-2.5 text-left rtl:text-right flex-1 cursor-pointer group"
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : isInProgress ? (
                          <Clock className="w-4 h-4 text-[var(--color-action)] shrink-0 animate-pulse" />
                        ) : (
                          <Circle className="w-4 h-4 text-[var(--color-text-dim)] group-hover:text-[var(--color-text-header)] shrink-0" />
                        )}
                        <span
                          className={`text-xs ${isDone ? "line-through opacity-75" : "font-medium"}`}
                        >
                          {task.text}
                        </span>
                      </button>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded font-bold ${
                            isDone
                              ? "bg-emerald-500/10 text-emerald-400"
                              : isInProgress
                                ? "bg-[var(--color-action)]/15 text-[var(--color-action)]"
                                : "bg-[var(--color-control)] text-[var(--color-text-dim)]"
                          }`}
                        >
                          {task.status.replace("_", " ")}
                        </span>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
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

            {/* Section 4: Notes & Guidelines/StyleGuide.html */}
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2 min-w-0">
                  <FileCode className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
                  <span className="truncate">
                    {isRtl ? (
                      <>
                        دليل الهوية والتوجيه الفني (
                        <bdi dir="ltr">Guidelines/</bdi>)
                      </>
                    ) : (
                      "Brand Guidelines & Notes (Guidelines/)"
                    )}
                  </span>
                </h3>
                <button
                  onClick={() => handleOpenInExplorer("Guidelines")}
                  className="text-[11px] text-[var(--color-action)] hover:underline font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  {isRtl ? (
                    <>
                      فتح <bdi dir="ltr">Guidelines/</bdi>
                    </>
                  ) : (
                    "Open Guidelines/"
                  )}
                </button>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] text-xs text-[var(--color-text-main)] leading-relaxed font-mono">
                {activeWorkspace.notes}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modal: Create New Project Workspace */}
      {isCreatingWorkspace && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <h3 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-[var(--color-action)]" />
                <span>
                  {isRtl
                    ? "إنشاء مشروع عمل جديد"
                    : "Create New Project Workspace"}
                </span>
              </h3>
              <button
                onClick={() => setIsCreatingWorkspace(false)}
                className="text-[var(--color-text-dim)] hover:text-[var(--color-text-header)] text-xs"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCreateWorkspace}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block font-medium text-[var(--color-text-muted)] mb-1">
                  {isRtl
                    ? "اسم المشروع / العلامة التجارية"
                    : "Brand / Project Name"}
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e: any) => setFormName(e.target.value)}
                  placeholder="e.g. Acme Studio Redesign"
                  className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[var(--color-text-muted)] mb-1">
                    {isRtl ? "العميل" : "Client Name"}
                  </label>
                  <input
                    type="text"
                    value={formClient}
                    onChange={(e: any) => setFormClient(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[var(--color-text-muted)] mb-1">
                    {isRtl ? "التصنيف" : "Category"}
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e: any) => setFormCategory(e.target.value)}
                    className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none"
                  >
                    <option value="Fintech / SaaS">Fintech / SaaS</option>
                    <option value="Editorial & Publishing">
                      Editorial & Publishing
                    </option>
                    <option value="Design Agency / Studio">
                      Design Agency / Studio
                    </option>
                    <option value="E-Commerce / Retail">
                      E-Commerce / Retail
                    </option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[var(--color-text-muted)] mb-1">
                    {isRtl ? "خط العناوين" : "Heading Font"}
                  </label>
                  <input
                    type="text"
                    value={formHeadingFont}
                    onChange={(e: any) => setFormHeadingFont(e.target.value)}
                    placeholder="e.g. Inter Display"
                    className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[var(--color-text-muted)] mb-1">
                    {isRtl ? "خط النصوص" : "Body Font"}
                  </label>
                  <input
                    type="text"
                    value={formBodyFont}
                    onChange={(e: any) => setFormBodyFont(e.target.value)}
                    placeholder="e.g. Tajawal"
                    className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[var(--color-text-muted)] mb-1">
                  {isRtl ? "وصف المشروع" : "Project Description"}
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e: any) => setFormDescription(e.target.value)}
                  placeholder="Brief summary of the project..."
                  className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingWorkspace(false)}
                  className="px-4 py-2 rounded-xl bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] cursor-pointer"
                >
                  {isRtl ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white font-semibold cursor-pointer"
                >
                  {isRtl ? "إنشاء المشروع" : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
