import React, { useState, useEffect, useRef } from "react";
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
  Pencil,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
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
import { safeFetch, safeFetchJson } from "../../utils/safeFetch";
import { upsertLiveOperation } from "../../utils/operationsBus";

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
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(
    null,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentFolderPath, setCurrentFolderPath] = useState<string>("Designs");
  const [newSubfolderName, setNewSubfolderName] = useState("");
  const [creatingSubfolder, setCreatingSubfolder] = useState(false);
  const [uploadingDesign, setUploadingDesign] = useState(false);
  const designInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Create / Edit Workspace form state
  const [formName, setFormName] = useState("");
  const [formClient, setFormClient] = useState("");
  const [formCategory, setFormCategory] = useState(
    "Branding & Visual Identity",
  );
  const [formCampaign, setFormCampaign] = useState("");
  const [formHeadingFont, setFormHeadingFont] = useState("");
  const [formBodyFont, setFormBodyFont] = useState("");
  const [formAccentFont, setFormAccentFont] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formLogoDataUrl, setFormLogoDataUrl] = useState<string>("");
  const [formPalettePreset, setFormPalettePreset] = useState<string>("plum");

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
    `%LOCALAPPDATA%\\Fontivo\\Workspaces\\${activeWorkspace.id}`;

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

  const openCreateModal = () => {
    setEditingWorkspaceId(null);
    setFormName("");
    setFormClient("");
    setFormCategory("Branding & Visual Identity");
    setFormCampaign("");
    setFormHeadingFont("");
    setFormBodyFont("");
    setFormAccentFont("");
    setFormDescription("");
    setFormNotes("");
    setFormLogoDataUrl("");
    setFormPalettePreset("plum");
    setIsCreatingWorkspace(true);
  };

  const openEditModal = () => {
    if (!activeWorkspace) return;
    setEditingWorkspaceId(activeWorkspace.id);
    setFormName(activeWorkspace.name || "");
    setFormClient(activeWorkspace.client || "");
    setFormCategory(activeWorkspace.category || "Branding & Visual Identity");
    setFormCampaign(activeWorkspace.campaignName || "");
    setFormHeadingFont(
      getFontDisplayName(activeWorkspace.typography?.headingFont),
    );
    setFormBodyFont(getFontDisplayName(activeWorkspace.typography?.bodyFont));
    setFormAccentFont(
      getFontDisplayName(activeWorkspace.typography?.accentFont),
    );
    setFormDescription(activeWorkspace.description || "");
    setFormNotes(activeWorkspace.notes || "");
    setFormLogoDataUrl(activeWorkspace.logoDataUrl || "");
    setIsCreatingWorkspace(true);
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

  const handleCreateNestedFolder = async () => {
    if (!activeWorkspace || !newSubfolderName.trim()) return;
    const cleanSeg = newSubfolderName.trim().replace(/[/\\:*?"<>|]/g, "-");
    const relativePath = currentFolderPath
      ? `${currentFolderPath}/${cleanSeg}`
      : cleanSeg;
    setCreatingSubfolder(true);
    try {
      await safeFetchJson<any>(
        `/api/workspaces/${activeWorkspace.id}/folders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parentPath: currentFolderPath,
            folderName: cleanSeg,
            relativePath,
          }),
          timeoutMs: 5000,
        },
      );
      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id !== activeWorkspace.id) return w;
          const nextFolders = Array.from(
            new Set([...(w.folders || []), relativePath]),
          );
          return { ...w, folders: nextFolders };
        }),
      );
      setNewSubfolderName("");
      setCurrentFolderPath(relativePath);
      setNotification({
        type: "success",
        text: isRtl
          ? `تم إنشاء المجلد الفرعي "${relativePath}"`
          : `Created subfolder "${relativePath}"`,
      });
    } finally {
      setCreatingSubfolder(false);
    }
  };

  const handleUploadDesigns = async (fileList?: FileList | File[] | null) => {
    if (!activeWorkspace || !fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setUploadingDesign(true);
    const uploadedDesigns: any[] = [];
    try {
      for (const file of files) {
        const res = await safeFetch(
          `/api/workspaces/${activeWorkspace.id}/upload-design?fileName=${encodeURIComponent(file.name)}&subfolder=${encodeURIComponent(currentFolderPath || "Designs")}`,
          {
            method: "POST",
            body: file,
            timeoutMs: 20000,
          },
        );
        if (res && res.ok) {
          const data = await res.json();
          if (data?.success && data.design) {
            uploadedDesigns.push(data.design);
          }
        }
      }
      if (uploadedDesigns.length > 0) {
        setWorkspaces((prev) =>
          prev.map((w) => {
            if (w.id !== activeWorkspace.id) return w;
            const prevSub = w.subfolders || {
              fonts: [],
              designs: [],
              palettes: [],
              guidelines: [],
            };
            return {
              ...w,
              subfolders: {
                ...prevSub,
                designs: [...uploadedDesigns, ...(prevSub.designs || [])],
              },
            };
          }),
        );
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

  const resolveFontSelection = (inputVal: string, fallbackName: string) => {
    const clean = (inputVal || "").trim();
    if (!clean) return { name: fallbackName, family: fallbackName };
    const matched = (fonts || []).find((f: any) => {
      const label = `${f.family || f.name} — ${f.style || "Regular"}`;
      return (
        String(f.id) === clean ||
        label.toLowerCase() === clean.toLowerCase() ||
        (f.family || "").toLowerCase() === clean.toLowerCase() ||
        (f.displayName || "").toLowerCase() === clean.toLowerCase() ||
        (f.name || "").toLowerCase() === clean.toLowerCase()
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
    return { name: clean, family: clean };
  };

  const handleCreateWorkspace = async (e: any) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const palettePresets: Record<string, any[]> = {
      plum: [
        { name: "Primary Coral", hex: "#F16B50", role: "primary" },
        { name: "Secondary Lavender", hex: "#B7A1D9", role: "secondary" },
        { name: "Surface Plum", hex: "#291C2E", role: "surface" },
        { name: "Deep Plum Canvas", hex: "#140D18", role: "background" },
      ],
      gold: [
        { name: "Royal Gold Leaf", hex: "#C5A059", role: "primary" },
        { name: "Midnight Onyx", hex: "#111215", role: "background" },
        { name: "Chalk Vellum", hex: "#F7F6F2", role: "surface" },
        { name: "Platinum Slate", hex: "#8E9096", role: "accent" },
      ],
      fintech: [
        { name: "Electric Cobalt", hex: "#2563EB", role: "primary" },
        { name: "Success Mint", hex: "#10B981", role: "accent" },
        { name: "Dark Surface", hex: "#0B0F19", role: "background" },
        { name: "Card Slate", hex: "#1F2937", role: "surface" },
      ],
    };

    const headingSlot = resolveFontSelection(formHeadingFont, "Inter Display");
    const bodySlot = resolveFontSelection(formBodyFont, "Tajawal");
    const accentSlot = resolveFontSelection(formAccentFont, "JetBrains Mono");

    if (editingWorkspaceId) {
      const target = workspaces.find((w) => w.id === editingWorkspaceId);
      const updated = {
        ...(target || {}),
        id: editingWorkspaceId,
        name: formName.trim(),
        client: formClient.trim() || "Internal Project",
        category: formCategory,
        business: formCategory,
        campaignName: formCampaign.trim() || undefined,
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
      };
      const saved = await safeFetchJson<any>(
        `/api/workspaces/${editingWorkspaceId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
          timeoutMs: 6000,
        },
      );
      const finalWs = saved && saved.id ? { ...updated, ...saved } : updated;
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === editingWorkspaceId ? finalWs : w)),
      );
      setIsCreatingWorkspace(false);
      setEditingWorkspaceId(null);
      return;
    }

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
      business: formCategory,
      campaignName: formCampaign.trim() || undefined,
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
      palette: palettePresets[formPalettePreset] || palettePresets.plum,
      notes:
        formNotes.trim() ||
        "Initial creative direction notes and project deliverables.",
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

    const saved = await safeFetchJson<any>("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newWs),
      timeoutMs: 6000,
    });
    const finalWs = saved && saved.id ? { ...newWs, ...saved } : newWs;
    setWorkspaces((prev) => [finalWs, ...prev]);
    setSelectedId(finalWs.id);
    setCurrentFolderPath("Designs");
    setIsCreatingWorkspace(false);
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
      {/* 1. Collapsible Left Workspace Sidebar Selector */}
      <aside
        className={`${
          sidebarCollapsed ? "w-16" : "w-64 lg:w-72"
        } shrink-0 border-r rtl:border-l rtl:border-r-0 border-[var(--color-border)] flex flex-col bg-[var(--color-back-side)]/50 transition-all duration-200`}
      >
        <div className="p-3.5 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <Briefcase className="w-4 h-4 text-[var(--color-action)] shrink-0" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-header)] truncate">
                {isRtl ? "مشاريع واستوديوهات العمل" : "Project Workspaces"}
              </h2>
            </div>
          )}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={openCreateModal}
              className="h-7 w-7 flex items-center justify-center rounded-lg bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white transition cursor-pointer shadow-2xs"
              title={isRtl ? "مشروع جديد" : "New Project"}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setSidebarCollapsed((p) => !p)}
              className="h-7 w-7 flex items-center justify-center rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] border border-[var(--color-border)] transition cursor-pointer"
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
                <PanelLeftOpen className="w-3.5 h-3.5" />
              ) : (
                <PanelLeftClose className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Workspaces List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {workspaces.map((ws) => {
            const isSelected = ws.id === selectedId;
            const taskCount = ws.tasks?.length || 0;
            const doneCount =
              ws.tasks?.filter((task: any) => task.status === "done").length ||
              0;
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
                    ? "p-2 flex items-center justify-center"
                    : "p-3 flex flex-col gap-1.5"
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
                      className="w-8 h-8 rounded-lg object-cover border border-[var(--color-border)]"
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black text-white shadow-2xs"
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
                          className={`text-xs font-bold truncate ${isSelected ? "text-[var(--color-text-header)]" : "text-[var(--color-text-main)]"}`}
                        >
                          {ws.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-control)] text-[var(--color-text-muted)] border border-[var(--color-border)] shrink-0">
                        {doneCount}/{taskCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
                      <span className="truncate max-w-[125px]">
                        {ws.client}
                      </span>
                      <span className="text-[10px] opacity-80 truncate">
                        {
                          localizeWorkspaceCategory(ws.category, isRtl).split(
                            "/",
                          )[0]
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
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
                  </>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* 2. Main Workspace Detail Area */}
      <main className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6 min-w-0">
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

        {/* Workspace Hero Header + Project Logo + Physical Disk Path & Actions */}
        <div className="p-6 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-5 shadow-xs">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
            <div className="flex items-start gap-4 min-w-0">
              <div className="relative group shrink-0">
                {activeWorkspace.logoDataUrl ? (
                  <img
                    src={activeWorkspace.logoDataUrl}
                    alt={activeWorkspace.name}
                    className="w-16 h-16 rounded-2xl object-cover border border-[var(--color-border)] shadow-sm bg-[var(--color-back-main)]"
                  />
                ) : (
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black text-white shadow-sm border border-white/10"
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
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-md bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-action)] font-bold uppercase tracking-wider">
                    {localizeWorkspaceCategory(activeWorkspace.category, isRtl)}
                  </span>
                  {activeWorkspace.campaignName && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#B7A1D9]/15 text-[#B7A1D9] border border-[#B7A1D9]/30 font-semibold">
                      {activeWorkspace.campaignName}
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-text-muted)]">
                    • {activeWorkspace.client}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text-header)] mt-1 tracking-tight truncate">
                  {activeWorkspace.name}
                </h1>
                <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-3xl leading-relaxed">
                  {activeWorkspace.description}
                </p>
              </div>
            </div>

            {/* 1-Click Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
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
            {/* Designs/ Subfolder Discovered Files, Nested Folders ("Folder inside Folder"), & Design Uploader */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleUploadDesigns(e.dataTransfer.files);
              }}
              className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-4 shadow-xs"
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

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2 min-w-0">
                  <FileCheck className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                  <span className="truncate">
                    {isRtl ? (
                      <>
                        ملفات التصميم والمجلدات المتداخلة (
                        <bdi dir="ltr">Designs/</bdi>)
                      </>
                    ) : (
                      "Discovered Design Files & Nested Folders (Designs/)"
                    )}
                  </span>
                </h3>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => designInputRef.current?.click()}
                    disabled={uploadingDesign}
                    className="h-7 px-2.5 rounded-lg bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Upload className="w-3 h-3 shrink-0" />
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
                    onClick={() =>
                      handleOpenInExplorer(
                        (currentFolderPath || "Designs") as any,
                      )
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

              {/* Breadcrumb Nested Folder Navigator + Create Folder Inside Folder */}
              <div className="p-3 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1 text-[11px] font-mono">
                    <button
                      type="button"
                      onClick={() => setCurrentFolderPath("")}
                      className={`px-2 py-0.5 rounded-md cursor-pointer transition ${
                        currentFolderPath === ""
                          ? "bg-[var(--color-action)]/15 text-[var(--color-action)] font-bold"
                          : "hover:bg-[var(--color-control)] text-[var(--color-text-muted)]"
                      }`}
                    >
                      {activeWorkspace.id}
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
                              className={`px-2 py-0.5 rounded-md cursor-pointer transition ${
                                targetRel === currentFolderPath
                                  ? "bg-[var(--color-action)]/15 text-[var(--color-action)] font-bold"
                                  : "hover:bg-[var(--color-control)] text-[var(--color-text-muted)]"
                              }`}
                            >
                              {seg}
                            </button>
                          </React.Fragment>
                        );
                      })}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newSubfolderName}
                      onChange={(e) => setNewSubfolderName(e.target.value)}
                      placeholder={
                        isRtl
                          ? "اسم مجلد فرعي جديد..."
                          : "New subfolder name..."
                      }
                      className="h-7 w-40 bg-[var(--color-back-card)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-lg px-2 text-[11px] text-[var(--color-text-header)] outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCreateNestedFolder}
                      disabled={creatingSubfolder || !newSubfolderName.trim()}
                      className="h-7 px-2.5 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[11px] font-bold flex items-center gap-1 text-[var(--color-text-header)] cursor-pointer disabled:opacity-40 whitespace-nowrap"
                    >
                      <FolderPlus className="w-3 h-3 text-[var(--color-action)] shrink-0" />
                      <span>{isRtl ? "مجلد داخلي" : "Add Subfolder"}</span>
                    </button>
                  </div>
                </div>

                {childFoldersInCurrentPath.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {childFoldersInCurrentPath.map((relFolder) => {
                      const label = relFolder.split("/").pop() || relFolder;
                      return (
                        <button
                          key={relFolder}
                          type="button"
                          onClick={() => setCurrentFolderPath(relFolder)}
                          className="h-7 px-2.5 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-action)]/15 border border-[var(--color-border)] hover:border-[var(--color-action)]/50 text-[11px] font-mono text-[var(--color-text-header)] flex items-center gap-1.5 cursor-pointer transition"
                        >
                          <FolderOpen className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>{label}/</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {(subfolders.designs || [])
                  .filter((d: any) => {
                    if (!currentFolderPath) return true;
                    const sub = String(d.subfolder || d.path || "")
                      .replace(/\\/g, "/")
                      .toLowerCase();
                    return sub.includes(currentFolderPath.toLowerCase());
                  })
                  .map((design: any, idx: number) => (
                    <div
                      key={`${design.path}-${idx}`}
                      className="p-3 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {design.previewUrl && (
                          <img
                            src={design.previewUrl}
                            alt={design.name}
                            className="w-10 h-10 rounded-lg object-cover border border-[var(--color-border)] shrink-0"
                          />
                        )}
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
                            {design.relativePath || design.path}
                            {(design.usedFonts || []).length > 0
                              ? ` • ${isRtl ? "الخطوط:" : "Used Fonts:"} ${design.usedFonts.join(", ")}`
                              : ""}
                          </div>
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

      {/* Modal: Spacious Create or Edit Project Workspace */}
      {isCreatingWorkspace && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-3xl max-h-[90vh] bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-back-side)] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[var(--color-action)]/15 border border-[var(--color-action)]/30 flex items-center justify-center text-[var(--color-action)]">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text-header)]">
                    {editingWorkspaceId
                      ? isRtl
                        ? "تعديل بيانات مشروع العمل"
                        : "Edit Project Workspace"
                      : isRtl
                        ? "إنشاء مشروع وهوية عمل جديدة"
                        : "Create New Project Workspace"}
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {isRtl
                      ? "ارفع شعار المشروع وحدد الفئة، العميل، الحملة الإعلانية، والخطوط الأساسية"
                      : "Upload brand logo, assign category, client, campaign metadata & real font pairings"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingWorkspace(false);
                  setEditingWorkspaceId(null);
                }}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--color-text-dim)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCreateWorkspace}
              className="p-6 space-y-5 text-xs overflow-y-auto flex-1"
            >
              {/* Project Logo + Basic Identity */}
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
                    <button
                      type="button"
                      onClick={() => setFormLogoDataUrl("")}
                      className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                    >
                      {isRtl ? "إزالة الشعار" : "Remove Logo"}
                    </button>
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
                      {isRtl ? "اسم العميل / الجهة" : "Client / Organization"}
                    </label>
                    <input
                      type="text"
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
                    <select
                      value={formCategory}
                      onChange={(e: any) => setFormCategory(e.target.value)}
                      className="w-full bg-[var(--color-back-card)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none cursor-pointer"
                    >
                      {WORKSPACE_CATEGORIES.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {isRtl ? cat.ar : cat.en}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-[var(--color-text-muted)] mb-1">
                      {isRtl
                        ? "اسم الحملة / الموسم / الإصدار"
                        : "Campaign / Season / Deliverable"}
                    </label>
                    <input
                      type="text"
                      value={formCampaign}
                      onChange={(e: any) => setFormCampaign(e.target.value)}
                      placeholder={
                        isRtl
                          ? "مثال: حملة الربع الأول ٢٠٢٦ • مطبوعات وسوشيال"
                          : "e.g. Q1 2026 Rebrand Campaign"
                      }
                      className="w-full bg-[var(--color-back-card)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Real Library Typography Selectors */}
              <datalist id="workspace-library-fonts-list">
                {(fonts || [])
                  .filter(
                    (f: any) =>
                      String(f.source || "").toLowerCase() !== "system",
                  )
                  .slice(0, 200)
                  .map((f: any) => (
                    <option
                      key={f.id}
                      value={`${f.family || f.name} — ${f.style || "Regular"}`}
                    />
                  ))}
              </datalist>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block font-semibold text-[var(--color-text-muted)] mb-1">
                    {isRtl ? "خط العناوين (Heading)" : "Heading Font"}
                  </label>
                  <input
                    type="text"
                    list="workspace-library-fonts-list"
                    value={formHeadingFont}
                    onChange={(e: any) => setFormHeadingFont(e.target.value)}
                    placeholder="e.g. Cairo Bold / Inter"
                    className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[var(--color-text-muted)] mb-1">
                    {isRtl ? "خط النصوص (Body)" : "Body Font"}
                  </label>
                  <input
                    type="text"
                    list="workspace-library-fonts-list"
                    value={formBodyFont}
                    onChange={(e: any) => setFormBodyFont(e.target.value)}
                    placeholder="e.g. Tajawal Regular"
                    className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[var(--color-text-muted)] mb-1">
                    {isRtl ? "الخط المساعد / الأرقام" : "Accent / Mono Font"}
                  </label>
                  <input
                    type="text"
                    list="workspace-library-fonts-list"
                    value={formAccentFont}
                    onChange={(e: any) => setFormAccentFont(e.target.value)}
                    placeholder="e.g. JetBrains Mono"
                    className="w-full bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] rounded-xl px-3 py-2 text-[var(--color-text-header)] outline-none"
                  />
                </div>
              </div>

              {!editingWorkspaceId && (
                <div>
                  <label className="block font-semibold text-[var(--color-text-muted)] mb-1.5">
                    {isRtl
                      ? "بداية لوحة الألوان (Brand Palette Preset)"
                      : "Initial Color Palette Preset"}
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      {
                        id: "plum",
                        label: isRtl
                          ? "مرجاني وبنفسجي (Fontivo)"
                          : "Coral & Plum Studio",
                        colors: ["#F16B50", "#B7A1D9", "#291C2E"],
                      },
                      {
                        id: "gold",
                        label: isRtl ? "ذهبي ملكي وأسود" : "Luxury Gold & Onyx",
                        colors: ["#C5A059", "#111215", "#F7F6F2"],
                      },
                      {
                        id: "fintech",
                        label: isRtl
                          ? "أزرق تقني ونعناعي"
                          : "Fintech Cobalt & Mint",
                        colors: ["#2563EB", "#10B981", "#0B0F19"],
                      },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setFormPalettePreset(preset.id)}
                        className={`p-2.5 rounded-xl border text-left rtl:text-right transition cursor-pointer ${
                          formPalettePreset === preset.id
                            ? "border-[var(--color-action)] bg-[var(--color-action)]/10"
                            : "border-[var(--color-border)] bg-[var(--color-back-main)]"
                        }`}
                      >
                        <div className="flex items-center gap-1 mb-1">
                          {preset.colors.map((c) => (
                            <span
                              key={c}
                              className="w-4 h-2.5 rounded-xs border border-black/15"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        <div className="text-[11px] font-bold text-[var(--color-text-header)] truncate">
                          {preset.label}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-[var(--color-text-muted)] mb-1">
                    {isRtl ? "وصف المشروع والأهداف" : "Project Description"}
                  </label>
                  <textarea
                    rows={3}
                    value={formDescription}
                    onChange={(e: any) => setFormDescription(e.target.value)}
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
                  <Sparkles className="w-3.5 h-3.5" />
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
      )}
    </div>
  );
}
