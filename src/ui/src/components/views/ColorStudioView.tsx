import React, { useState, useRef, useEffect } from "react";
import {
  Pipette,
  Palette,
  UploadCloud,
  FileCode,
  Download,
  Copy,
  Check,
  CheckCircle2,
  FolderOpen,
  Crosshair,
  Pin,
  ShieldCheck,
  BookmarkPlus,
  Trash2,
  Image as ImageIcon,
} from "lucide-react";
import {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  rgbToCmyk,
  rgbToOklch,
  getContrastRatio,
  getWcagRating,
  generateHarmonies,
  generateTailwindScale,
  build5x5LoupeGrid,
  extractDominantColorsFromCanvas,
} from "../../utils/colorUtils";
import {
  parseAseBuffer,
  downloadAseFile,
  exportToCssVariables,
  exportToTailwindConfig,
} from "../../utils/aseParser";
import { safeFetch, safeFetchJson } from "../../utils/safeFetch";

interface SavedSwatch {
  id: string;
  name: string;
  hex: string;
  role?: string;
}

const DEFAULT_SWATCHES: SavedSwatch[] = [
  { id: "sw-1", name: "Fontivo Coral", hex: "#F16B50", role: "primary" },
  { id: "sw-2", name: "Fontivo Lavender", hex: "#B7A1D9", role: "secondary" },
  { id: "sw-3", name: "Fontivo Lime", hex: "#C7D65A", role: "accent" },
  { id: "sw-4", name: "Plum Ink Surface", hex: "#291C2E", role: "surface" },
  { id: "sw-5", name: "Deep Plum Canvas", hex: "#140D18", role: "background" },
];

const SAVED_SWATCHES_KEY = "fontivo_saved_swatches_v1";

export default function ColorStudioView({
  onRefreshStats,
  t = {},
  isRtl = false,
}: any) {
  const [activeSubTab, setActiveSubTab] = useState<"studio" | "image" | "ase">(
    "studio",
  );
  const [baseHex, setBaseHex] = useState("#F16B50");
  const [hexInput, setHexInput] = useState("#F16B50");
  const [contrastBgHex, setContrastBgHex] = useState("#140D18");
  const [activeHarmonyMode, setActiveHarmonyMode] = useState<
    | "complementary"
    | "analogous"
    | "triadic"
    | "splitComplementary"
    | "tetradic"
    | "monochromatic"
  >("complementary");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [copiedExport, setCopiedExport] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isTaskbarPinned, setIsTaskbarPinned] = useState(false);
  const [pinningTaskbar, setPinningTaskbar] = useState(false);
  const [isPickingScreen, setIsPickingScreen] = useState(false);

  // Live Screen Sampler & 5x5 Loupe State
  const [isLiveSampling, setIsLiveSampling] = useState(false);
  const [cursorCoords, setCursorCoords] = useState({ x: 640, y: 360 });
  const [loupeGrid, setLoupeGrid] = useState<string[][]>(() =>
    build5x5LoupeGrid("#F16B50"),
  );

  // Saved Swatches History (persisted)
  const [savedSwatches, setSavedSwatches] = useState<SavedSwatch[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_SWATCHES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return DEFAULT_SWATCHES;
  });

  // Image Extractor State
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isHoveringCanvas, setIsHoveringCanvas] = useState(false);
  const [loupeColor, setLoupeColor] = useState("#F16B50");
  const [loupePos, setLoupePos] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const aseInputRef = useRef<HTMLInputElement | null>(null);

  // ASE Inspector State
  const [aseData, setAseData] = useState<any>(null);
  const [aseLoading, setAseLoading] = useState(false);

  // Computed Color Spaces, WCAG & Harmonies
  const rgb = hexToRgb(baseHex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);
  const oklch = rgbToOklch(rgb.r, rgb.g, rgb.b);
  const harmonies = generateHarmonies(baseHex);
  const tailwindScale = generateTailwindScale(baseHex);

  const contrastWhite = getContrastRatio(baseHex, "#FFFFFF");
  const ratingWhite = getWcagRating(contrastWhite);
  const contrastBlack = getContrastRatio(baseHex, "#000000");
  const ratingBlack = getWcagRating(contrastBlack);
  const contrastCustom = getContrastRatio(baseHex, contrastBgHex);
  const ratingCustom = getWcagRating(contrastCustom);

  useEffect(() => {
    setHexInput(baseHex);
    setLoupeGrid(build5x5LoupeGrid(baseHex));
  }, [baseHex]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_SWATCHES_KEY, JSON.stringify(savedSwatches));
    } catch {
      // ignore storage quota
    }
  }, [savedSwatches]);

  // Live cursor polling when live sampler is active
  useEffect(() => {
    if (!isLiveSampling) return;
    const timer = setInterval(async () => {
      let data = await safeFetchJson<any>("/api/color/cursor-pixel", {
        timeoutMs: 1000,
      });
      if (!data || !data.hex) {
        data = await safeFetchJson<any>("/api/color/cursor-live", {
          timeoutMs: 1000,
        });
      }
      if (data && data.hex) {
        const hex = String(data.hex).toUpperCase();
        setBaseHex(hex);
        setLoupeColor(hex);
        if (typeof data.x === "number" && typeof data.y === "number") {
          setCursorCoords({ x: data.x, y: data.y });
        }
        setLoupeGrid(build5x5LoupeGrid(hex, data.grid));
      }
    }, 250);
    return () => clearInterval(timer);
  }, [isLiveSampling]);

  const applyHex = (raw: string) => {
    const cleaned = raw.trim().toUpperCase();
    const normalized = cleaned.startsWith("#") ? cleaned : `#${cleaned}`;
    if (/^#[0-9A-F]{6}$/.test(normalized)) {
      setBaseHex(normalized);
    }
  };

  const addSwatchToHistory = (hex: string, name?: string) => {
    const upper = hex.toUpperCase();
    setSavedSwatches((prev) => {
      const filtered = prev.filter((s) => s.hex.toUpperCase() !== upper);
      return [
        {
          id: `sw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: name || upper,
          hex: upper,
          role: "swatch",
        },
        ...filtered,
      ].slice(0, 24);
    });
  };

  const handleCopyValue = (value: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => {});
    }
    setCopiedText(value);
    setTimeout(() => setCopiedText(null), 1600);
  };

  const handleExportCode = (type: "css" | "tailwind" | "ase") => {
    const paletteList =
      activeSubTab === "ase" && aseData?.colors?.length
        ? aseData.colors
        : savedSwatches;
    if (type === "ase") {
      downloadAseFile(paletteList, "Fontivo-Color-Palette.ase");
      setCopiedExport("ase");
      setTimeout(() => setCopiedExport(null), 1800);
      return;
    }

    const code =
      type === "css"
        ? exportToCssVariables(paletteList, "fontivo")
        : exportToTailwindConfig(paletteList);

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopiedExport(type);
    setTimeout(() => setCopiedExport(null), 1800);
  };

  const handlePinToTaskbar = async () => {
    setPinningTaskbar(true);
    setNotification(null);
    const data = await safeFetchJson<any>("/api/system/pin-taskbar-picker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcutName: "Fontivo Color Picker" }),
      timeoutMs: 6000,
    });
    setIsTaskbarPinned(true);
    setPinningTaskbar(false);
    setNotification({
      type: "success",
      text:
        data?.message ||
        (isRtl
          ? "تم تثبيت قطارة الألوان السريعة في شريط المهام بنجاح."
          : "Color Picker pinned to Windows Taskbar successfully."),
    });
  };

  // Prominent 1-Click Native Win32 Crosshair Eyedropper (POST /api/color/pick-screen + EyeDropper API fallback)
  const handleScreenEyedropper = async () => {
    if (isPickingScreen) return;
    setIsPickingScreen(true);
    setNotification(null);
    try {
      const serverPick = await safeFetchJson<any>("/api/color/pick-screen", {
        method: "POST",
        timeoutMs: 65000,
      });

      const pickedHexRaw =
        serverPick?.hex || serverPick?.color || serverPick?.pickedHex;
      if (pickedHexRaw) {
        const cleaned = String(pickedHexRaw).trim().toUpperCase();
        const hex = cleaned.startsWith("#") ? cleaned : `#${cleaned}`;
        setBaseHex(hex);
        setHexInput(hex);
        setLoupeColor(hex);
        if (
          typeof serverPick.x === "number" &&
          typeof serverPick.y === "number"
        ) {
          setCursorCoords({ x: serverPick.x, y: serverPick.y });
        }
        setLoupeGrid(
          build5x5LoupeGrid(
            hex,
            serverPick.grid5x5 || serverPick.grid || serverPick.loupeGrid,
          ),
        );
        addSwatchToHistory(
          hex,
          typeof serverPick.x === "number"
            ? `Screen (${serverPick.x}, ${serverPick.y})`
            : `Screen ${hex}`,
        );
        handleCopyValue(hex);
        setNotification({
          type: "success",
          text: isRtl
            ? `تم التقاط اللون ${hex} ونسخه للحافظة تلقائياً!`
            : `Picked ${hex} from screen and copied to clipboard automatically!`,
        });
        return;
      }

      if (serverPick && serverPick.cancelled) {
        setNotification({
          type: "error",
          text: isRtl
            ? "تم إلغاء التقاط اللون (ESC)."
            : "Screen color pick cancelled (ESC).",
        });
        return;
      }

      if (typeof window !== "undefined" && "EyeDropper" in window) {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        if (result && result.sRGBHex) {
          const hex = result.sRGBHex.toUpperCase();
          setBaseHex(hex);
          setHexInput(hex);
          setLoupeColor(hex);
          setLoupeGrid(build5x5LoupeGrid(hex));
          addSwatchToHistory(hex, `Screen ${hex}`);
          handleCopyValue(hex);
          setNotification({
            type: "success",
            text: isRtl
              ? `تم التقاط اللون ${hex} ونسخه للحافظة تلقائياً!`
              : `Picked ${hex} from screen and copied to clipboard automatically!`,
          });
        }
      }
    } catch {
      // user canceled
    } finally {
      setIsPickingScreen(false);
    }
  };

  // Image upload & extraction
  const handleImageUpload = (file: any) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const dataUrl = e.target.result;
      setImageSrc(dataUrl);
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const colors = extractDominantColorsFromCanvas(canvas, 6);
        if (colors.length > 0) {
          setBaseHex(colors[0].hex);
          setSavedSwatches((prev) =>
            [
              ...colors.map((c: any, idx: number) => ({
                id: `img-${Date.now()}-${idx}`,
                name: c.name || c.hex,
                hex: c.hex.toUpperCase(),
                role: c.role,
              })),
              ...prev,
            ].slice(0, 24),
          );
          setNotification({
            type: "success",
            text: isRtl
              ? `تم استخراج ${colors.length} ألوان أساسية من الصورة بنجاح.`
              : `Extracted ${colors.length} dominant colors from image.`,
          });
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleCanvasMouseMove = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.max(0, Math.floor((e.clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.floor((e.clientY - rect.top) * scaleY));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);

    const grid5x5: string[][] = [];
    for (let dy = -2; dy <= 2; dy++) {
      const row: string[] = [];
      for (let dx = -2; dx <= 2; dx++) {
        const sx = Math.max(0, Math.min(canvas.width - 1, x + dx));
        const sy = Math.max(0, Math.min(canvas.height - 1, y + dy));
        const p = ctx.getImageData(sx, sy, 1, 1).data;
        row.push(rgbToHex(p[0], p[1], p[2]));
      }
      grid5x5.push(row);
    }

    setLoupeColor(hex);
    setCursorCoords({ x, y });
    setLoupeGrid(grid5x5);
    setLoupePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setIsHoveringCanvas(true);
  };

  const handleCanvasClick = () => {
    if (loupeColor) {
      setBaseHex(loupeColor);
      addSwatchToHistory(
        loupeColor,
        `Pixel (${cursorCoords.x}, ${cursorCoords.y})`,
      );
      handleCopyValue(loupeColor);
    }
  };

  // ASE File Parsing
  const handleAseUpload = async (file: any) => {
    if (!file) return;
    setAseLoading(true);
    setNotification(null);
    try {
      const res = await safeFetch("/api/ase/inspect", {
        method: "POST",
        body: file,
        timeoutMs: 6000,
      });

      if (res && res.ok) {
        const data = await res.json();
        setAseData(data);
        if (data.colors && data.colors.length > 0)
          setBaseHex(data.colors[0].hex);
      } else {
        const buffer = await file.arrayBuffer();
        const parsed = parseAseBuffer(buffer);
        setAseData(parsed);
        if (parsed.colors && parsed.colors.length > 0)
          setBaseHex(parsed.colors[0].hex);
      }
      setNotification({
        type: "success",
        text: isRtl
          ? "تم فحص ملف .ASE بنجاح!"
          : "Adobe .ASE palette inspected successfully!",
      });
      setActiveSubTab("ase");
    } catch (e: any) {
      setNotification({
        type: "error",
        text: `Failed to inspect .ASE: ${e?.message}`,
      });
    } finally {
      setAseLoading(false);
    }
  };

  const harmonyModesList: {
    id:
      | "complementary"
      | "analogous"
      | "triadic"
      | "splitComplementary"
      | "tetradic"
      | "monochromatic";
    label: string;
    labelAr: string;
  }[] = [
    { id: "complementary", label: "Complementary", labelAr: "متكامل" },
    { id: "analogous", label: "Analogous", labelAr: "متجاور" },
    { id: "triadic", label: "Triadic", labelAr: "ثلاثي" },
    { id: "splitComplementary", label: "Split-Comp", labelAr: "متكامل منقسم" },
    { id: "tetradic", label: "Tetradic", labelAr: "رباعي" },
    { id: "monochromatic", label: "Monochromatic", labelAr: "أحادي" },
  ];

  const colorSpacePills = [
    { label: "HEX", value: baseHex },
    { label: "RGB", value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
    { label: "HSL", value: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` },
    { label: "OKLCH", value: oklch.css },
    { label: "CMYK", value: `C${cmyk.c} M${cmyk.m} Y${cmyk.y} K${cmyk.k}` },
  ];

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Top Studio Header */}
      <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-back-header)]/60 shrink-0 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Palette className="w-5 h-5 text-[var(--color-action)] shrink-0" />
              <h1 className="text-lg sm:text-xl font-black text-[var(--color-text-header)] tracking-tight truncate">
                {isRtl
                  ? "استوديو الألوان وقطارة الشاشة"
                  : "Pro Color Studio & Screen Eyedropper"}
              </h1>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {isRtl
                ? "التقاط فوري لأي لون على الشاشة، فحص تباين WCAG 2.1، تناسقات الألوان، وتدرجات Tailwind 50–950."
                : "1-click screen eyedropper, HEX/RGB/HSL/OKLCH/CMYK, WCAG 2.1 contrast, harmonies, Tailwind 50–950, and .ASE export."}
            </p>
          </div>

          {/* Primary Actions: Prominent 1-Click Eyedropper + Pin + Exports */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleScreenEyedropper}
              disabled={isPickingScreen}
              data-testid="pick-screen-color-btn"
              className="h-9 px-4 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] disabled:opacity-75 text-white text-xs font-bold shadow-sm flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0"
              title={
                isRtl
                  ? "حرّك المؤشر واضغط كليك شمال على أي لون في الشاشة — ESC للإلغاء"
                  : "Move cursor & Left-Click any color on screen — ESC to cancel"
              }
            >
              <Pipette
                className={`w-4 h-4 shrink-0 ${isPickingScreen ? "animate-pulse" : ""}`}
              />
              <span>
                {isPickingScreen
                  ? isRtl
                    ? "حرّك المؤشر واضغط كليك شمال... (ESC للإلغاء)"
                    : "Move cursor & Left-Click... (ESC)"
                  : isRtl
                    ? "التقاط لون من أي مكان بالشاشة"
                    : "Pick Color From Screen"}
              </span>
            </button>

            <button
              onClick={handlePinToTaskbar}
              disabled={pinningTaskbar}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                isTaskbarPinned
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : "bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border-[var(--color-border)]"
              }`}
            >
              <Pin className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
              <span>
                {isTaskbarPinned
                  ? isRtl
                    ? "مثبتة بشريط المهام ✓"
                    : "Pinned ✓"
                  : isRtl
                    ? "تثبيت بشريط المهام"
                    : "Pin Color Picker to Taskbar"}
              </span>
            </button>
          </div>
        </div>

        {/* Sub-Tabs & 1-Click Export Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-1 bg-[var(--color-control)] rounded-xl border border-[var(--color-border)] text-xs flex-wrap">
            <button
              onClick={() => setActiveSubTab("studio")}
              className={`h-8 px-3 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === "studio"
                  ? "bg-[var(--color-action)] text-white shadow-2xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
            >
              <Palette className="w-3.5 h-3.5 shrink-0" />
              <span>{isRtl ? "الاستوديو والتناسقات" : "Color Studio"}</span>
            </button>
            <button
              onClick={() => setActiveSubTab("image")}
              className={`h-8 px-3 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === "image"
                  ? "bg-[var(--color-action)] text-white shadow-2xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5 shrink-0" />
              <span>{isRtl ? "استخراج من صورة" : "Image Extractor"}</span>
            </button>
            <button
              onClick={() => setActiveSubTab("ase")}
              className={`h-8 px-3 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === "ase"
                  ? "bg-[var(--color-action)] text-white shadow-2xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
            >
              <FileCode className="w-3.5 h-3.5 shrink-0" />
              <span>{isRtl ? "فاحص ملفات .ASE" : ".ASE Inspector"}</span>
            </button>
          </div>

          {/* 1-Click Export Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => handleExportCode("ase")}
              className="h-8 px-3 rounded-lg text-[11px] font-bold bg-[var(--color-control)] hover:bg-[var(--color-action)] text-[var(--color-text-header)] hover:text-white border border-[var(--color-border)] transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>
                {copiedExport === "ase"
                  ? isRtl
                    ? "تم التصدير ✓"
                    : "Exported ✓"
                  : ".ASE"}
              </span>
            </button>
            <button
              onClick={() => handleExportCode("css")}
              className="h-8 px-3 rounded-lg text-[11px] font-mono bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] border border-[var(--color-border)] transition cursor-pointer whitespace-nowrap"
            >
              {copiedExport === "css"
                ? isRtl
                  ? "تم نسخ CSS ✓"
                  : "Copied CSS ✓"
                : "CSS Vars"}
            </button>
            <button
              onClick={() => handleExportCode("tailwind")}
              className="h-8 px-3 rounded-lg text-[11px] font-mono bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] border border-[var(--color-border)] transition cursor-pointer whitespace-nowrap"
            >
              {copiedExport === "tailwind"
                ? isRtl
                  ? "تم نسخ Tailwind ✓"
                  : "Copied Tailwind ✓"
                : "Tailwind"}
            </button>
          </div>
        </div>

        {isPickingScreen && (
          <div
            data-testid="eyedropper-active-status"
            className="px-3.5 py-2.5 rounded-xl border border-[var(--color-action)]/40 bg-[var(--color-action)]/12 text-[var(--color-text-header)] text-xs font-semibold flex items-center justify-between gap-2 animate-pulse"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Crosshair className="w-4 h-4 text-[var(--color-action)] shrink-0" />
              <span>
                {isRtl
                  ? "حرّك المؤشر واضغط كليك شمال على أي لون في الشاشة — ESC للإلغاء"
                  : "Move cursor and Left-Click on any color on screen — Press ESC to cancel"}
              </span>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--color-action)] text-white shrink-0">
              {isRtl ? "مباشر" : "LIVE"}
            </span>
          </div>
        )}

        {notification && (
          <div
            className={`px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              notification.type === "error"
                ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="truncate">{notification.text}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-[11px] opacity-70 hover:opacity-100 cursor-pointer shrink-0"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-5 sm:p-6">
        {activeSubTab === "studio" && (
          <div className="max-w-7xl mx-auto space-y-5">
            {/* 1. Active Swatch + 5x5 Pixel Loupe + Color Space Copy Pills */}
            <div className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-5 shadow-xs">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
                {/* Active Swatch & Input */}
                <div className="flex flex-wrap items-center gap-4">
                  <div
                    className="w-20 h-20 rounded-2xl border border-black/15 shadow-inner shrink-0 flex items-end justify-end p-1.5"
                    style={{ backgroundColor: baseHex }}
                  >
                    <input
                      type="color"
                      value={baseHex}
                      onChange={(e) => setBaseHex(e.target.value.toUpperCase())}
                      aria-label="Pick color"
                      className="w-6 h-6 rounded-md cursor-pointer border border-white/60 bg-transparent"
                    />
                  </div>

                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={hexInput}
                        onChange={(e) => {
                          setHexInput(e.target.value);
                          applyHex(e.target.value);
                        }}
                        className="w-28 px-2.5 py-1 rounded-lg bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] font-mono font-black text-base text-[var(--color-text-header)] outline-none uppercase"
                      />
                      <button
                        onClick={() => addSwatchToHistory(baseHex)}
                        className="h-8 px-2.5 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-header)] flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
                        <span>{isRtl ? "حفظ اللون" : "Save Swatch"}</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setIsLiveSampling((prev) => !prev)}
                        className={`h-7 px-2.5 rounded-lg text-[11px] font-bold border transition cursor-pointer whitespace-nowrap ${
                          isLiveSampling
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-[var(--color-control)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text-header)]"
                        }`}
                      >
                        {isLiveSampling
                          ? isRtl
                            ? "إيقاف تتبع المؤشر الحي"
                            : "Stop Live Cursor"
                          : isRtl
                            ? "تتبع لون المؤشر الحي"
                            : "Live Cursor Preview"}
                      </button>
                      <span className="text-[11px] font-mono tabular-nums text-[var(--color-text-dim)]">
                        (X: {cursorCoords.x}, Y: {cursorCoords.y})
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5x5 Pixel Loupe */}
                <div className="flex items-center gap-3 self-start xl:self-center">
                  <div
                    className="grid grid-cols-5 gap-0.5 p-1.5 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border)] shrink-0 shadow-inner"
                    data-testid="pixel-loupe-5x5"
                  >
                    {loupeGrid.map((row, rIdx) =>
                      row.map((cellHex, cIdx) => {
                        const isCenter = rIdx === 2 && cIdx === 2;
                        return (
                          <div
                            key={`${rIdx}-${cIdx}`}
                            onClick={() => setBaseHex(cellHex)}
                            className={`w-5 h-5 rounded-xs cursor-pointer transition ${
                              isCenter
                                ? "ring-2 ring-white z-10 scale-105"
                                : "opacity-90 hover:opacity-100"
                            }`}
                            style={{ backgroundColor: cellHex }}
                            title={cellHex}
                          />
                        );
                      }),
                    )}
                  </div>
                  <div className="text-[10.5px] font-mono text-[var(--color-text-muted)]">
                    <div className="font-bold text-[var(--color-action)] uppercase">
                      5x5 Pixel Loupe
                    </div>
                    <div>
                      {isRtl ? "انقر أي بكسل لاختياره" : "Click any pixel"}
                    </div>
                  </div>
                </div>
              </div>

              {/* 5 Color Space Copy Pills: HEX / RGB / HSL / OKLCH / CMYK */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {colorSpacePills.map((spec) => (
                  <button
                    key={spec.label}
                    onClick={() => handleCopyValue(spec.value)}
                    className="p-3 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border)] hover:border-[var(--color-action)] transition cursor-pointer text-start flex flex-col justify-between gap-1 group min-w-0"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-[var(--color-text-dim)]">
                      <span className="font-bold">{spec.label}</span>
                      {copiedText === spec.value ? (
                        <Check className="w-3 h-3 text-[var(--color-green)]" />
                      ) : (
                        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
                      )}
                    </div>
                    <div
                      className="text-xs font-mono tabular-nums font-bold text-[var(--color-text-header)] truncate"
                      title={spec.value}
                    >
                      {spec.value}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. WCAG 2.1 Contrast Checker + Saved Swatches History */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* WCAG 2.1 Contrast Checker */}
              <div className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      {isRtl
                        ? "فاحص تباين WCAG 2.1"
                        : "WCAG 2.1 Contrast Checker"}
                    </span>
                  </h2>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono">
                    <span className="text-[var(--color-text-dim)]">
                      {isRtl ? "خلفية مخصصة:" : "Custom BG:"}
                    </span>
                    <input
                      type="color"
                      value={contrastBgHex}
                      onChange={(e) =>
                        setContrastBgHex(e.target.value.toUpperCase())
                      }
                      className="w-5 h-5 rounded cursor-pointer border border-[var(--color-border)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    {
                      label: isRtl ? "على أبيض" : "On White",
                      bg: "#FFFFFF",
                      ratio: contrastWhite,
                      rating: ratingWhite,
                    },
                    {
                      label: isRtl ? "على أسود" : "On Black",
                      bg: "#000000",
                      ratio: contrastBlack,
                      rating: ratingBlack,
                    },
                    {
                      label: isRtl ? "خلفية مخصصة" : "Custom BG",
                      bg: contrastBgHex,
                      ratio: contrastCustom,
                      rating: ratingCustom,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="p-3 rounded-xl border border-[var(--color-border)] flex flex-col justify-between gap-2.5"
                      style={{ backgroundColor: item.bg }}
                    >
                      <div
                        className="text-sm font-black truncate"
                        style={{ color: baseHex }}
                      >
                        {isRtl ? "أبجد Aa 123" : "Aa Bb 123"}
                      </div>
                      <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
                        <span className="px-1.5 py-0.5 rounded bg-black/75 text-white font-bold tabular-nums">
                          {item.ratio}:1
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            item.rating.normalText === "AAA"
                              ? "bg-emerald-600 text-white"
                              : item.rating.normalText === "AA"
                                ? "bg-sky-600 text-white"
                                : "bg-rose-600 text-white"
                          }`}
                        >
                          {item.rating.normalText}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Saved Swatches History */}
              <div className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-3 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                    {isRtl
                      ? `سجل الألوان المحفوظة (${savedSwatches.length})`
                      : `Saved Swatches History (${savedSwatches.length})`}
                  </h2>
                  {savedSwatches.length > 0 && (
                    <button
                      onClick={() => setSavedSwatches([])}
                      className="text-[11px] text-[var(--color-text-dim)] hover:text-rose-400 transition cursor-pointer"
                    >
                      {isRtl ? "مسح الكل" : "Clear"}
                    </button>
                  )}
                </div>

                {savedSwatches.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--color-text-muted)]">
                    {isRtl
                      ? 'التقط لوناً أو اضغط "حفظ اللون" لإضافته هنا.'
                      : 'Pick a color or click "Save Swatch" to store it here.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-0.5">
                    {savedSwatches.map((sw) => (
                      <div
                        key={sw.id}
                        onClick={() => {
                          setBaseHex(sw.hex);
                          handleCopyValue(sw.hex);
                        }}
                        className="group p-2 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border)] hover:border-[var(--color-action)] flex items-center justify-between gap-2 cursor-pointer transition min-w-0"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-6 h-6 rounded-lg border border-black/15 shrink-0"
                            style={{ backgroundColor: sw.hex }}
                          />
                          <span className="text-[11px] font-mono tabular-nums font-bold text-[var(--color-text-header)] truncate">
                            {sw.hex}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSavedSwatches((prev) =>
                              prev.filter((item) => item.id !== sw.id),
                            );
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-dim)] hover:text-rose-400 transition shrink-0"
                          title={isRtl ? "حذف" : "Remove"}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 3. Harmony Generator */}
            <div className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-4 shadow-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {isRtl ? "مولد تناسقات الألوان" : "Color Harmony Generator"}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  {harmonyModesList.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setActiveHarmonyMode(mode.id)}
                      className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                        activeHarmonyMode === mode.id
                          ? "bg-[var(--color-action)] text-white shadow-2xs"
                          : "bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] border border-[var(--color-border)]"
                      }`}
                    >
                      {isRtl ? mode.labelAr : mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                {(harmonies[activeHarmonyMode] || []).map((hex, i) => (
                  <button
                    key={`${activeHarmonyMode}-${i}`}
                    onClick={() => {
                      setBaseHex(hex);
                      handleCopyValue(hex);
                    }}
                    className="h-20 rounded-xl p-2.5 flex flex-col justify-between text-start cursor-pointer transition hover:scale-[1.01] border border-black/10 shadow-xs"
                    style={{ backgroundColor: hex }}
                  >
                    <span className="text-[10px] font-mono text-white/85 drop-shadow">
                      #{i + 1}
                    </span>
                    <span className="text-xs font-mono font-bold text-white drop-shadow">
                      {hex}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Tailwind 50–950 Scale */}
            <div className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {isRtl
                    ? `تدرجات Tailwind (50–950) للون ${baseHex}`
                    : `Tailwind 50–950 Scale for ${baseHex}`}
                </h2>
                <button
                  onClick={() => handleExportCode("tailwind")}
                  className="text-[11px] font-mono font-bold text-[var(--color-action)] hover:underline cursor-pointer"
                >
                  {copiedExport === "tailwind"
                    ? isRtl
                      ? "تم النسخ ✓"
                      : "Copied ✓"
                    : isRtl
                      ? "نسخ إعداد Tailwind"
                      : "Copy Tailwind Config"}
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-11 gap-2">
                {(Object.entries(tailwindScale) as [string, string][]).map(
                  ([shade, hex]) => (
                    <button
                      key={shade}
                      onClick={() => handleCopyValue(hex)}
                      className="p-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-back-main)] hover:border-[var(--color-action)] cursor-pointer transition text-start space-y-1.5"
                    >
                      <div
                        className="w-full h-10 rounded-lg border border-black/10 shadow-inner"
                        style={{ backgroundColor: hex }}
                      />
                      <div className="text-[10px] font-mono tabular-nums">
                        <div className="font-bold text-[var(--color-text-header)]">
                          {shade}
                        </div>
                        <div className="text-[var(--color-text-muted)] truncate">
                          {hex}
                        </div>
                      </div>
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: IMAGE PALETTE EXTRACTOR */}
        {activeSubTab === "image" && (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-[var(--color-action)]" />
                <span>
                  {isRtl
                    ? "استخراج الألوان وقطارة الصور"
                    : "Image Palette Extractor & Pixel Sampler"}
                </span>
              </h2>
              <button
                onClick={() => imageInputRef.current?.click()}
                className="text-xs text-[var(--color-action)] hover:underline cursor-pointer flex items-center gap-1 font-semibold"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>{isRtl ? "اختيار صورة" : "Browse Image"}</span>
              </button>
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e: any) => handleImageUpload(e.target.files?.[0])}
              className="hidden"
            />

            <div
              onDragOver={(e: any) => e.preventDefault()}
              onDrop={(e: any) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0])
                  handleImageUpload(e.dataTransfer.files[0]);
              }}
              className={`min-h-[320px] max-h-[440px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-4 relative overflow-hidden transition ${
                imageSrc
                  ? "border-[var(--color-border)] bg-[var(--color-back-card)] cursor-crosshair"
                  : "border-[var(--color-border)] hover:border-[var(--color-action)] bg-[var(--color-back-card)]/40 cursor-pointer"
              }`}
              onClick={() => !imageSrc && imageInputRef.current?.click()}
            >
              <canvas
                ref={canvasRef}
                onMouseMove={handleCanvasMouseMove}
                onMouseLeave={() => setIsHoveringCanvas(false)}
                onClick={handleCanvasClick}
                className={`max-w-full max-h-[380px] object-contain rounded-lg ${!imageSrc ? "hidden" : "block"}`}
              />

              {!imageSrc && (
                <div className="text-center space-y-2 p-6">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--color-control)] flex items-center justify-center mx-auto text-[var(--color-action)]">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-[var(--color-text-header)]">
                    {isRtl
                      ? "اسحب وأفلت أي صورة أو شعار هنا"
                      : "Drag & drop any image or logo here"}
                  </h4>
                  <p className="text-xs text-[var(--color-text-muted)] max-w-xs mx-auto">
                    {isRtl
                      ? "يدعم PNG و JPG و SVG و WebP لاستخراج الألوان السائدة والتقاط أي بكسل."
                      : "Supports PNG, JPG, SVG, and WebP for dominant palette extraction and pixel sampling."}
                  </p>
                </div>
              )}

              {imageSrc && isHoveringCanvas && (
                <div
                  className="absolute pointer-events-none w-16 h-16 rounded-full border-2 border-white shadow-xl flex flex-col items-center justify-center text-[9px] font-mono font-bold text-white z-20 transform -translate-x-1/2 -translate-y-1/2"
                  style={{
                    backgroundColor: loupeColor,
                    top: `${loupePos.y}px`,
                    left: `${loupePos.x}px`,
                  }}
                >
                  <Crosshair className="w-4 h-4 opacity-75" />
                  <span className="drop-shadow-md text-[8px]">
                    {loupeColor}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ADOBE .ASE INSPECTOR */}
        {activeSubTab === "ase" && (
          <div className="max-w-5xl mx-auto">
            <div className="p-6 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border-subtle)]">
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-[var(--color-action)]" />
                    <span>
                      {isRtl
                        ? "فاحص ملفات Adobe Swatch Exchange (.ASE)"
                        : "Adobe Swatch Exchange (.ASE) Inspector"}
                    </span>
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {isRtl
                      ? "قراءة ملفات .ASE الثنائية واستعراض العينات وإعادة تصديرها."
                      : "Inspect binary Adobe .ASE color swatches and export to CSS, Tailwind, or .ASE."}
                  </p>
                </div>

                <div>
                  <input
                    ref={aseInputRef}
                    type="file"
                    accept=".ase"
                    onChange={(e: any) => handleAseUpload(e.target.files?.[0])}
                    className="hidden"
                  />
                  <button
                    onClick={() => aseInputRef.current?.click()}
                    disabled={aseLoading}
                    className="h-9 px-4 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-semibold shadow-xs flex items-center gap-2 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <UploadCloud className="w-4 h-4 shrink-0" />
                    <span>
                      {aseLoading
                        ? isRtl
                          ? "جاري الفحص..."
                          : "Inspecting..."
                        : isRtl
                          ? "رفع ملف .ASE"
                          : "Upload .ASE File"}
                    </span>
                  </button>
                </div>
              </div>

              {aseData && aseData.colors?.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {aseData.colors.map((swatch: any, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setBaseHex(swatch.hex);
                        handleCopyValue(swatch.hex);
                      }}
                      className="p-3 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border)] hover:border-[var(--color-action)] transition cursor-pointer flex items-center gap-2.5 text-start"
                    >
                      <span
                        className="w-8 h-8 rounded-lg shrink-0 border border-black/10"
                        style={{ backgroundColor: swatch.hex }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-[var(--color-text-header)] truncate">
                          {swatch.name}
                        </div>
                        <div className="text-[10px] font-mono text-[var(--color-text-muted)]">
                          {swatch.hex}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div
                  onDragOver={(e: any) => e.preventDefault()}
                  onDrop={(e: any) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.[0])
                      handleAseUpload(e.dataTransfer.files[0]);
                  }}
                  onClick={() => aseInputRef.current?.click()}
                  className="py-12 border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-action)] rounded-xl text-center space-y-2 cursor-pointer transition"
                >
                  <FileCode className="w-8 h-8 text-[var(--color-text-dim)] mx-auto" />
                  <div className="text-xs font-bold text-[var(--color-text-header)]">
                    {isRtl
                      ? "اسحب ملف .ASE هنا أو انقر للرفع"
                      : "Drop any Adobe .ASE swatch file here"}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
