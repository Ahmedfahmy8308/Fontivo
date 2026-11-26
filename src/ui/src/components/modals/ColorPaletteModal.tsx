import React, { useState, useRef } from "react";
import {
  X,
  Palette,
  UploadCloud,
  Check,
  Copy,
  Sliders,
  CheckCircle2,
  Pipette,
  ExternalLink,
} from "lucide-react";

// Math Color Conversion Utilities
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const num = parseInt(
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean,
    16,
  );
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r, g, b) {
  const clamp = (val) => Math.max(0, Math.min(255, Math.round(val)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

function rgbToCmyk(r, g, b) {
  if (r === 0 && g === 0 && b === 0) return { c: 0, m: 0, y: 0, k: 100 };
  const r1 = r / 255,
    g1 = g / 255,
    b1 = b / 255;
  const k = 1 - Math.max(r1, g1, b1);
  const c = (1 - r1 - k) / (1 - k);
  const m = (1 - g1 - k) / (1 - k);
  const y = (1 - b1 - k) / (1 - k);
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  };
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    v = max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  };
}

function getLuminance(r, g, b) {
  const toLinear = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getContrastRatio(hex1, hex2) {
  try {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
  } catch (e) {
    return 1;
  }
}

export default function ColorPaletteModal({
  isOpen,
  onClose,
  onApplyToCanvas,
  t = {},
  isRtl = false,
}: any) {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState("harmonies"); // 'harmonies' | 'extractor' | 'matrix'
  const [baseHex, setBaseHex] = useState("#F16B50");
  const [copiedKey, setCopiedKey] = useState<any>(null);
  const [isEyedropperActive, setIsEyedropperActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState<any>(null);

  // Extracted Colors from Image
  const [imagePreview, setImagePreview] = useState<any>(null);
  const [extractedColors, setExtractedColors] = useState([
    { name: "Fontivo Coral (Primary)", hex: "#F16B50", role: "primary" },
    { name: "Fontivo Lavender (Secondary)", hex: "#B7A1D9", role: "secondary" },
    { name: "Fontivo Amber (Accent)", hex: "#F7B544", role: "accent" },
    { name: "Deep Plum (Canvas)", hex: "#140D18", role: "background" },
    { name: "Plum Ink (Surface)", hex: "#291C2E", role: "surface" },
  ]);
  const fileInputRef = useRef<any>(null);

  // Base Color calculations
  const rgb = hexToRgb(baseHex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

  // Generate Mathematical Harmonies
  const makeHexFromHsl = (h, s, l) => {
    const rgbVal = hslToRgb(h, s, l);
    return rgbToHex(rgbVal.r, rgbVal.g, rgbVal.b);
  };

  const harmonies = {
    complementary: [baseHex, makeHexFromHsl((hsl.h + 180) % 360, hsl.s, hsl.l)],
    analogous: [
      makeHexFromHsl((hsl.h - 30 + 360) % 360, hsl.s, hsl.l),
      baseHex,
      makeHexFromHsl((hsl.h + 30) % 360, hsl.s, hsl.l),
    ],
    triadic: [
      baseHex,
      makeHexFromHsl((hsl.h + 120) % 360, hsl.s, hsl.l),
      makeHexFromHsl((hsl.h + 240) % 360, hsl.s, hsl.l),
    ],
    splitComplementary: [
      baseHex,
      makeHexFromHsl((hsl.h + 150) % 360, hsl.s, hsl.l),
      makeHexFromHsl((hsl.h + 210) % 360, hsl.s, hsl.l),
    ],
    tetradic: [
      baseHex,
      makeHexFromHsl((hsl.h + 90) % 360, hsl.s, hsl.l),
      makeHexFromHsl((hsl.h + 180) % 360, hsl.s, hsl.l),
      makeHexFromHsl((hsl.h + 270) % 360, hsl.s, hsl.l),
    ],
    monochromatic: [
      makeHexFromHsl(hsl.h, Math.max(10, hsl.s - 20), Math.max(15, hsl.l - 25)),
      makeHexFromHsl(hsl.h, hsl.s, Math.max(25, hsl.l - 12)),
      baseHex,
      makeHexFromHsl(
        hsl.h,
        Math.min(100, hsl.s + 10),
        Math.min(85, hsl.l + 15),
      ),
      makeHexFromHsl(
        hsl.h,
        Math.min(100, hsl.s + 15),
        Math.min(95, hsl.l + 30),
      ),
    ],
  };

  // WCAG Contrast against Paper White and Deep Plum
  const contrastAgainstWhite = getContrastRatio(baseHex, "#FFF9F2");
  const contrastAgainstDark = getContrastRatio(baseHex, "#140D18");

  // Eyedropper function (Samples screen pixel color)
  const handleEyedropScreen = async () => {
    setIsEyedropperActive(true);
    try {
      if ((window as any).EyeDropper) {
        const eyeDropper = new (window as any).EyeDropper();
        const res = await eyeDropper.open();
        if (res && res.sRGBHex) {
          setBaseHex(res.sRGBHex.toUpperCase());
          setStatusMessage(
            isRtl
              ? `تم التقاط اللون: ${res.sRGBHex}`
              : `Color sampled: ${res.sRGBHex}`,
          );
        }
      } else {
        // Fallback to Native Win32 GDI endpoint
        const res = await fetch("/api/color/pick-screen", { method: "POST" });
        const data = await res.json();
        if (data.success && data.hex) {
          setBaseHex(data.hex);
          setStatusMessage(
            isRtl
              ? `تم التقاط اللون من الشاشة: ${data.hex}`
              : `Sampled from screen: ${data.hex}`,
          );
        }
      }
    } catch (e) {
      console.log("Eyedropper dismissed");
    } finally {
      setIsEyedropperActive(false);
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  // Launch Standalone Color Picker Tool
  const handleLaunchStandalone = async () => {
    try {
      await fetch("/api/color/launch-standalone", { method: "POST" });
      setStatusMessage(
        isRtl
          ? "تم فتح أداة Color Picker Tools PRO المستقلة"
          : "Color Picker Tools PRO launched",
      );
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Extract from Image Moodboard
  const handleImageFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const dataUrl = e.target.result;
      setImagePreview(dataUrl);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = 100;
        canvas.height = 100;
        ctx.drawImage(img, 0, 0, 100, 100);

        const imgData = ctx.getImageData(0, 0, 100, 100).data;
        const colorCounts: Record<string, number> = {};

        for (let i = 0; i < imgData.length; i += 16) {
          const r = Math.round(imgData[i] / 24) * 24;
          const g = Math.round(imgData[i + 1] / 24) * 24;
          const b = Math.round(imgData[i + 2] / 24) * 24;
          const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
          colorCounts[hex] = (colorCounts[hex] || 0) + 1;
        }

        const sorted = Object.keys(colorCounts).sort(
          (a, b) => colorCounts[b] - colorCounts[a],
        );
        const extracted = sorted.slice(0, 5).map((hex, idx) => {
          const names = [
            "Dominant Color",
            "Vibrant Accent",
            "Secondary Hue",
            "Deep Contrast",
            "Base Tint",
          ];
          return {
            name: names[idx] || `Color ${idx + 1}`,
            hex: hex.toUpperCase(),
            role: idx === 0 ? "primary" : idx === 1 ? "accent" : "secondary",
          };
        });

        if (extracted.length > 0) {
          setExtractedColors(extracted);
          setBaseHex(extracted[0].hex);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-[var(--color-text-main)] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-back-header)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-action)] flex items-center justify-center text-white shadow-sm shrink-0">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[var(--color-text-header)] flex items-center gap-2">
                <span>
                  {isRtl
                    ? "استوديو الألوان والتناغم اللوني"
                    : "Color Studio & Harmonies"}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-action)]/15 text-[var(--color-action)] border border-[var(--color-action)]/30 font-bold uppercase font-mono">
                  Fontivo PRO
                </span>
              </h3>

              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {isRtl
                  ? "قطارة الشاشة الحية، المولد الرياضي للتناغم اللوني، ومطابقة التباين لمعايير WCAG"
                  : "Live desktop eyedropper, mathematical color harmonies & WCAG 2.1 contrast"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Standalone Tool Launcher */}
            <button
              onClick={handleLaunchStandalone}
              className="hidden sm:flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-xs text-[var(--color-text-header)] border border-[var(--color-border)] transition cursor-pointer whitespace-nowrap shrink-0"
              title="Launch standalone WinUI 3 ColorPicker Tools PRO"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#B7A1D9]" />
              <span className="text-[11px] font-semibold">
                {isRtl ? "الأداة المستقلة" : "Standalone App"}
              </span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-[var(--color-border)] bg-[var(--color-back-header)]/40 shrink-0">
          <button
            onClick={() => setActiveTab("harmonies")}
            className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === "harmonies"
                ? "border-[var(--color-action)] text-[var(--color-action)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
            }`}
          >
            <Pipette className="w-3.5 h-3.5" />
            <span>
              {isRtl ? "القطارة والتناغم اللوني" : "Eyedropper & Harmonies"}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("extractor")}
            className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === "extractor"
                ? "border-[var(--color-action)] text-[var(--color-action)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>
              {isRtl ? "مستخرج الشعارات والصور" : "Image Palette Extractor"}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("matrix")}
            className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === "matrix"
                ? "border-[var(--color-action)] text-[var(--color-action)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>
              {isRtl ? "مصفوفة التحويل (CMYK/RGB/HSL)" : "Format Matrix"}
            </span>
          </button>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div className="bg-[#10B981]/15 text-[#10B981] px-5 py-2 text-xs border-b border-[#10B981]/30 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Active Color Preview & Eyedropper Bar */}
          <div className="p-4 rounded-2xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <div
                className="w-14 h-14 rounded-2xl border-2 border-white/20 shadow-lg shrink-0 transition-transform hover:scale-105"
                style={{ backgroundColor: baseHex }}
              />
              <div className="flex-1">
                <span className="text-[10px] uppercase font-bold text-[var(--color-text-muted)] tracking-wider">
                  {isRtl ? "اللون النشط الحالي" : "Active Base Color"}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={baseHex}
                    onChange={(e: any) =>
                      setBaseHex(e.target.value.toUpperCase())
                    }
                    className="w-28 px-2.5 py-1 rounded-lg bg-[var(--color-back-input)] border border-[var(--color-border)] font-mono font-bold text-sm text-[var(--color-text-header)] uppercase"
                  />
                  <input
                    type="color"
                    value={baseHex}
                    onChange={(e: any) =>
                      setBaseHex(e.target.value.toUpperCase())
                    }
                    className="w-8 h-8 rounded-lg border border-[var(--color-border)] cursor-pointer bg-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {/* Eyedropper Button */}
              <button
                onClick={handleEyedropScreen}
                disabled={isEyedropperActive}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white font-bold transition cursor-pointer shadow-sm"
                title="Sample any pixel on your screen"
              >
                <Pipette className="w-4 h-4" />
                <span>
                  {isEyedropperActive
                    ? isRtl
                      ? "جاري الالتقاط..."
                      : "Sampling..."
                    : isRtl
                      ? "التقاط من الشاشة"
                      : "Eyedropper"}
                </span>
              </button>

              {/* Apply as text color */}
              <button
                onClick={() =>
                  onApplyToCanvas && onApplyToCanvas({ textColor: baseHex })
                }
                className="px-3 py-2 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-header)] font-semibold transition cursor-pointer"
                title="Apply as Text Color on live font canvas"
              >
                {isRtl ? "تعيين كلون للخط" : "Set as Font Color"}
              </button>
            </div>
          </div>

          {/* TAB 1: MATHEMATICAL HARMONIES */}
          {activeTab === "harmonies" && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xs font-bold text-[var(--color-text-header)] uppercase tracking-wider mb-3">
                  {isRtl
                    ? "التناغمات اللونية المستخرجة رياضياً"
                    : "Mathematical Color Harmonies"}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Complementary */}
                  <div className="p-3.5 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--color-text-header)]">
                        {isRtl
                          ? "المتكامل (Complementary - 180°)"
                          : "Complementary (180°)"}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                        2 Colors
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 h-10">
                      {harmonies.complementary.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => setBaseHex(c)}
                          className="h-full rounded-lg transition hover:scale-102 flex items-center justify-center font-mono font-bold text-[10px] text-white shadow-xs cursor-pointer border border-black/20"
                          style={{ backgroundColor: c }}
                          title={`Click to set ${c} as active base`}
                        >
                          <span className="px-1.5 py-0.5 rounded bg-black/40">
                            {c}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Analogous */}
                  <div className="p-3.5 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--color-text-header)]">
                        {isRtl
                          ? "المتشابه / التناظري (Analogous - ±30°)"
                          : "Analogous (±30°)"}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                        3 Colors
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 h-10">
                      {harmonies.analogous.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => setBaseHex(c)}
                          className="h-full rounded-lg transition hover:scale-102 flex items-center justify-center font-mono font-bold text-[9px] text-white shadow-xs cursor-pointer border border-black/20"
                          style={{ backgroundColor: c }}
                          title={`Click to set ${c} as active base`}
                        >
                          <span className="px-1 py-0.5 rounded bg-black/40">
                            {c}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Triadic */}
                  <div className="p-3.5 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--color-text-header)]">
                        {isRtl
                          ? "الثلاثي المتوازن (Triadic - 120°)"
                          : "Triadic (120°)"}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                        3 Colors
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 h-10">
                      {harmonies.triadic.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => setBaseHex(c)}
                          className="h-full rounded-lg transition hover:scale-102 flex items-center justify-center font-mono font-bold text-[9px] text-white shadow-xs cursor-pointer border border-black/20"
                          style={{ backgroundColor: c }}
                          title={`Click to set ${c} as active base`}
                        >
                          <span className="px-1 py-0.5 rounded bg-black/40">
                            {c}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tetradic */}
                  <div className="p-3.5 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--color-text-header)]">
                        {isRtl
                          ? "الرباعي (Tetradic / Square)"
                          : "Tetradic / Square"}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                        4 Colors
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 h-10">
                      {harmonies.tetradic.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => setBaseHex(c)}
                          className="h-full rounded-lg transition hover:scale-102 flex items-center justify-center font-mono font-bold text-[8px] text-white shadow-xs cursor-pointer border border-black/20"
                          style={{ backgroundColor: c }}
                          title={`Click to set ${c} as active base`}
                        >
                          <span className="px-1 py-0.5 rounded bg-black/40">
                            {c}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Monochromatic Scale */}
                <div className="p-3.5 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] space-y-2 mt-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--color-text-header)]">
                      {isRtl
                        ? "التدرج الأحادي بالسطوع (Monochromatic Scale)"
                        : "Monochromatic Scale"}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                      5 Shades
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-2 h-12">
                    {harmonies.monochromatic.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => setBaseHex(c)}
                        className="h-full rounded-lg transition hover:scale-102 flex items-center justify-center font-mono font-bold text-[9px] text-white shadow-xs cursor-pointer border border-black/20"
                        style={{ backgroundColor: c }}
                        title={`Click to set ${c} as active base`}
                      >
                        <span className="px-1 py-0.5 rounded bg-black/40">
                          {c}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* WCAG Accessibility Audit */}
              <div className="p-4 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] space-y-3">
                <span className="font-bold text-[var(--color-text-header)] block">
                  {isRtl
                    ? "فحص تباين النص مع الخلفيات لمعايير سهولة الوصول (WCAG 2.1)"
                    : "WCAG 2.1 Typography Contrast Audit"}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* On White Background */}
                  <div className="p-3 rounded-lg bg-white border border-slate-200 text-slate-900 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">
                        On Crisp White (#FFFFFF)
                      </span>
                      <span
                        className="text-sm font-bold font-mono"
                        style={{ color: baseHex }}
                      >
                        Sample Headline Text
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold block">
                        {contrastAgainstWhite.toFixed(2)}:1
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${contrastAgainstWhite >= 4.5 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
                      >
                        {contrastAgainstWhite >= 7
                          ? "AAA PASS"
                          : contrastAgainstWhite >= 4.5
                            ? "AA PASS"
                            : "FAIL"}
                      </span>
                    </div>
                  </div>

                  {/* On Deep Plum Background */}
                  <div className="p-3 rounded-lg bg-[#140D18] border border-[var(--color-border)] text-white flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-[var(--color-text-muted)] block uppercase font-bold">
                        On Deep Plum (#140D18)
                      </span>
                      <span
                        className="text-sm font-bold font-mono"
                        style={{ color: baseHex }}
                      >
                        Sample Headline Text
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold block">
                        {contrastAgainstDark.toFixed(2)}:1
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${contrastAgainstDark >= 4.5 ? "bg-emerald-900/60 text-emerald-300" : "bg-rose-900/60 text-rose-300"}`}
                      >
                        {contrastAgainstDark >= 7
                          ? "AAA PASS"
                          : contrastAgainstDark >= 4.5
                            ? "AA PASS"
                            : "FAIL"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IMAGE PALETTE EXTRACTOR */}
          {activeTab === "extractor" && (
            <div className="space-y-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e: any) => handleImageFile(e.target.files[0])}
                accept="image/*"
                className="hidden"
              />
              <div
                onClick={() =>
                  fileInputRef.current && fileInputRef.current.click()
                }
                className="p-8 border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-action)] rounded-2xl flex flex-col items-center justify-center gap-3 transition cursor-pointer bg-[var(--color-back-subtle)] group"
              >
                <div className="w-12 h-12 rounded-2xl bg-[var(--color-action)]/15 text-[var(--color-action)] flex items-center justify-center group-hover:scale-110 transition">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="text-center">
                  <span className="font-bold text-sm text-[var(--color-text-header)] block">
                    {isRtl
                      ? "اضغط لاختيار صورة، أو اسحب وأفلت الشعار هنا"
                      : "Click to select image or drag & drop logo here"}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)] mt-1 block">
                    PNG, JPG, SVG, WebP (توليد فوري لـ 5 ألوان متناسقة)
                  </span>
                </div>
              </div>

              {imagePreview && (
                <div className="flex items-center gap-3 p-3 bg-[var(--color-back-subtle)] rounded-xl border border-[var(--color-border)]">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-16 h-16 rounded-lg object-cover shadow-xs"
                  />
                  <div>
                    <span className="text-xs font-bold text-[var(--color-text-header)] block">
                      {isRtl
                        ? "تم استخراج الألوان من الصورة المرفوعة بنجاح"
                        : "Colors extracted from uploaded asset successfully"}
                    </span>
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      {isRtl
                        ? "اضغط على أي لون لتعيينه كلون نشط أو تطبيقه على لوحة الخطوط"
                        : "Click any color below to apply it or view its harmonies"}
                    </span>
                  </div>
                </div>
              )}

              {/* Extracted Colors Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2">
                {extractedColors.map((c, idx) => (
                  <div
                    key={idx}
                    onClick={() => setBaseHex(c.hex)}
                    className="p-3 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] hover:border-[var(--color-action)] transition cursor-pointer group shadow-xs space-y-2"
                  >
                    <div
                      className="w-full h-12 rounded-lg shadow-inner group-hover:scale-102 transition border border-black/15"
                      style={{ backgroundColor: c.hex }}
                    />
                    <div>
                      <span className="text-[10px] text-[var(--color-text-muted)] block truncate">
                        {c.name}
                      </span>
                      <span className="font-mono font-bold text-xs text-[var(--color-text-header)]">
                        {c.hex}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: FORMAT MATRIX */}
          {activeTab === "matrix" && (
            <div className="space-y-4">
              <span className="font-bold text-xs text-[var(--color-text-header)] uppercase tracking-wider block">
                {isRtl
                  ? "تحويلات الصيغ الرياضية للون المحدد"
                  : "Mathematical Color Space Conversions"}
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono">
                {/* HEX */}
                <div className="p-3.5 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] block uppercase font-sans">
                      HEX Code
                    </span>
                    <span className="text-sm font-bold text-[var(--color-text-header)]">
                      {baseHex}
                    </span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(baseHex, "hex")}
                    className="p-2 rounded-lg hover:bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] transition cursor-pointer"
                  >
                    {copiedKey === "hex" ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* RGB */}
                <div className="p-3.5 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] block uppercase font-sans">
                      RGB (Red, Green, Blue)
                    </span>
                    <span className="text-sm font-bold text-[var(--color-text-header)]">
                      rgb({rgb.r}, {rgb.g}, {rgb.b})
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
                        "rgb",
                      )
                    }
                    className="p-2 rounded-lg hover:bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] transition cursor-pointer"
                  >
                    {copiedKey === "rgb" ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* CMYK */}
                <div className="p-3.5 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] block uppercase font-sans">
                      CMYK (Print Separation)
                    </span>
                    <span className="text-sm font-bold text-[var(--color-text-header)]">
                      cmyk({cmyk.c}%, {cmyk.m}%, {cmyk.y}%, {cmyk.k}%)
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`,
                        "cmyk",
                      )
                    }
                    className="p-2 rounded-lg hover:bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] transition cursor-pointer"
                  >
                    {copiedKey === "cmyk" ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* HSL */}
                <div className="p-3.5 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] block uppercase font-sans">
                      HSL (Hue, Saturation, Light)
                    </span>
                    <span className="text-sm font-bold text-[var(--color-text-header)]">
                      hsl({hsl.h}, {hsl.s}%, {hsl.l}%)
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
                        "hsl",
                      )
                    }
                    className="p-2 rounded-lg hover:bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] transition cursor-pointer"
                  >
                    {copiedKey === "hsl" ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* HSV */}
                <div className="p-3.5 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] block uppercase font-sans">
                      HSV / HSB (Brightness)
                    </span>
                    <span className="text-sm font-bold text-[var(--color-text-header)]">
                      hsv({hsv.h}, {hsv.s}%, {hsv.v}%)
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`,
                        "hsv",
                      )
                    }
                    className="p-2 rounded-lg hover:bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] transition cursor-pointer"
                  >
                    {copiedKey === "hsv" ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* CSS Variable */}
                <div className="p-3.5 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border)] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] block uppercase font-sans">
                      CSS Variable Token
                    </span>
                    <span className="text-sm font-bold text-[var(--color-text-header)]">
                      --brand-color: {baseHex};
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      copyToClipboard(`--brand-color: ${baseHex};`, "css")
                    }
                    className="p-2 rounded-lg hover:bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] transition cursor-pointer"
                  >
                    {copiedKey === "css" ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[var(--color-back-side)] border-t border-[var(--color-border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: baseHex }}
            />
            <span className="text-xs font-mono font-bold text-[var(--color-text-header)]">
              {baseHex}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (onApplyToCanvas) {
                  onApplyToCanvas({ textColor: baseHex });
                }
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-bold shadow-sm transition cursor-pointer"
            >
              {isRtl
                ? "تطبيق على خطوط المعاينة وإغلاق"
                : "Apply to Canvas & Close"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
