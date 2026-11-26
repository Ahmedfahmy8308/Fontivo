// =============================================================================
// Fontivo Studio Color Utilities & Math Engine
// Professional color space transformations (HEX, RGB, HSL, CMYK, OKLCH),
// WCAG 2.1 Contrast ratios, Color Harmonies (including Split-Complementary),
// Tailwind CSS v4 Scale Generator (50-950), Material Design 3 Tonal Palettes,
// Apple HIG System Colors, Pantone & Editorial Palettes, and 5x5 Loupe Grid.
// =============================================================================

import {
  ColorRgb,
  ColorHsl,
  ColorCmyk,
  ColorOklch,
  WcagRating,
  ColorHarmonies,
  ColorSwatch,
  TailwindScale,
  TailwindScaleShade,
  Material3TonalPalettes,
} from "../types/palette";

export function hexToRgb(hex: string): ColorRgb {
  if (!hex) return { r: 0, g: 0, b: 0 };
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 0, g: 0, b: 0 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (val: number) =>
    Math.max(0, Math.min(255, Math.round(val || 0)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function rgbToHsl(r: number, g: number, b: number): ColorHsl {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

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
      default:
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

export function hslToRgb(h: number, s: number, l: number): ColorRgb {
  h = ((h % 360) + 360) % 360;
  h /= 360;
  s /= 100;
  l /= 100;
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
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

export function rgbToCmyk(r: number, g: number, b: number): ColorCmyk {
  if (r === 0 && g === 0 && b === 0) return { c: 0, m: 0, y: 0, k: 100 };
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
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

export function rgbToOklch(r: number, g: number, b: number): ColorOklch {
  const srgbToLinear = (val: number) => {
    const v = val / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l_ = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m_ = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s_ = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const okb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(a * a + okb * okb);
  let H = (Math.atan2(okb, a) * 180) / Math.PI;
  if (H < 0) H += 360;

  const lRound = Math.round(Math.max(0, Math.min(1, L)) * 1000) / 1000;
  const cRound = Math.round(Math.max(0, C) * 1000) / 1000;
  const hRound = C < 0.0001 ? 0 : Math.round(H * 10) / 10;

  return {
    l: lRound,
    c: cRound,
    h: hRound,
    css: `oklch(${Math.round(lRound * 100)}% ${cRound} ${hRound})`,
  };
}

export function hexToOklch(hex: string): ColorOklch {
  const { r, g, b } = hexToRgb(hex);
  return rgbToOklch(r, g, b);
}

export function getLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function getContrastRatio(hex1: string, hex2: string): number {
  try {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    const ratio = (brightest + 0.05) / (darkest + 0.05);
    return Math.round(ratio * 100) / 100;
  } catch {
    return 1;
  }
}

export function getWcagRating(ratio: number | string): WcagRating {
  const r = typeof ratio === "number" ? ratio : parseFloat(ratio) || 1;
  return {
    normalText: r >= 7 ? "AAA" : r >= 4.5 ? "AA" : "Fail",
    largeText: r >= 4.5 ? "AAA" : r >= 3.0 ? "AA" : "Fail",
    uiComponents: r >= 3.0 ? "AA" : "Fail",
    isNormalPass: r >= 4.5,
    isLargePass: r >= 3.0,
  };
}

export function generateHarmonies(baseHex: string): ColorHarmonies {
  const { r, g, b } = hexToRgb(baseHex);
  const { h, s, l } = rgbToHsl(r, g, b);

  const makeHex = (newH: number, newS: number, newL: number) => {
    const clampedH = ((newH % 360) + 360) % 360;
    const clampedS = Math.max(10, Math.min(95, newS));
    const clampedL = Math.max(12, Math.min(90, newL));
    const rgb = hslToRgb(clampedH, clampedS, clampedL);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  };

  return {
    complementary: [baseHex, makeHex(h + 180, s, l)],
    analogous: [makeHex(h - 30, s, l), baseHex, makeHex(h + 30, s, l)],
    triadic: [baseHex, makeHex(h + 120, s, l), makeHex(h + 240, s, l)],
    splitComplementary: [
      baseHex,
      makeHex(h + 150, s, l),
      makeHex(h + 210, s, l),
    ],
    tetradic: [
      makeHex(h + 90, s, l),
      makeHex(h + 180, s, l),
      makeHex(h + 270, s, l),
      baseHex,
    ],
    monochromatic: [
      makeHex(h, s, Math.max(15, l - 30)),
      makeHex(h, s, Math.max(25, l - 15)),
      baseHex,
      makeHex(h, s, Math.min(85, l + 15)),
      makeHex(h, s, Math.min(95, l + 30)),
    ],
  };
}

/**
 * Generates a full Tailwind CSS v4 color scale (50 through 950) from any base HEX color.
 */
export function generateTailwindScale(baseHex: string): TailwindScale {
  const { r, g, b } = hexToRgb(baseHex);
  const { h, s } = rgbToHsl(r, g, b);

  const shadeMap: { shade: TailwindScaleShade; l: number; sFactor: number }[] =
    [
      { shade: "50", l: 96, sFactor: 0.7 },
      { shade: "100", l: 91, sFactor: 0.8 },
      { shade: "200", l: 83, sFactor: 0.9 },
      { shade: "300", l: 72, sFactor: 0.95 },
      { shade: "400", l: 61, sFactor: 1.0 },
      { shade: "500", l: 50, sFactor: 1.0 },
      { shade: "600", l: 42, sFactor: 1.0 },
      { shade: "700", l: 34, sFactor: 0.95 },
      { shade: "800", l: 26, sFactor: 0.9 },
      { shade: "900", l: 18, sFactor: 0.85 },
      { shade: "950", l: 11, sFactor: 0.8 },
    ];

  const scale = {} as TailwindScale;
  for (const item of shadeMap) {
    const sat = Math.max(8, Math.min(98, Math.round(s * item.sFactor)));
    const rgb = hslToRgb(h, sat, item.l);
    scale[item.shade] = rgbToHex(rgb.r, rgb.g, rgb.b);
  }
  return scale;
}

/**
 * Generates Material Design 3 Tonal Palettes (Primary, Secondary, Tertiary, Neutral)
 */
export function generateMaterial3Palettes(
  baseHex: string,
): Material3TonalPalettes {
  const { r, g, b } = hexToRgb(baseHex);
  const { h, s } = rgbToHsl(r, g, b);
  const tones = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99];

  const buildTones = (hue: number, sat: number) =>
    tones.map((tone) => {
      const rgb = hslToRgb(hue, sat, tone);
      return { tone, hex: rgbToHex(rgb.r, rgb.g, rgb.b) };
    });

  return {
    primary: buildTones(h, Math.max(30, s)),
    secondary: buildTones(h, Math.max(16, Math.round(s * 0.35))),
    tertiary: buildTones((h + 60) % 360, Math.max(24, Math.round(s * 0.55))),
    neutral: buildTones(h, 6),
  };
}

/**
 * Official Apple Human Interface Guidelines (HIG) System Colors
 */
export const APPLE_HIG_COLORS: ColorSwatch[] = [
  { name: "System Red", hex: "#FF3B30", role: "primary" },
  { name: "System Orange", hex: "#FF9500", role: "secondary" },
  { name: "System Yellow", hex: "#FFCC00", role: "accent" },
  { name: "System Green", hex: "#34C759", role: "accent" },
  { name: "System Mint", hex: "#00C7BE", role: "accent" },
  { name: "System Teal", hex: "#30B0C7", role: "secondary" },
  { name: "System Cyan", hex: "#32ADE6", role: "secondary" },
  { name: "System Blue", hex: "#007AFF", role: "primary" },
  { name: "System Indigo", hex: "#5856D6", role: "primary" },
  { name: "System Purple", hex: "#AF52DE", role: "accent" },
  { name: "System Pink", hex: "#FF2D55", role: "accent" },
  { name: "System Gray", hex: "#8E8E93", role: "muted" },
];

/**
 * Curated Pantone & Editorial Design Palettes
 */
export const PANTONE_EDITORIAL_PALETTES: {
  id: string;
  name: string;
  nameAr: string;
  swatches: ColorSwatch[];
}[] = [
  {
    id: "pantone-mocha-2025",
    name: "Pantone Mocha Mousse & Warm Editorial",
    nameAr: "بانتون موكا موس والطباعة الدافئة",
    swatches: [
      { name: "Mocha Mousse 17-1230", hex: "#A47864", role: "primary" },
      { name: "Warm Sand", hex: "#D6C5B3", role: "secondary" },
      { name: "Terracotta Clay", hex: "#C2593F", role: "accent" },
      { name: "Espresso Ink", hex: "#231A16", role: "background" },
      { name: "Cream Vellum", hex: "#F7F3EE", role: "surface" },
    ],
  },
  {
    id: "swiss-bauhaus-studio",
    name: "Swiss Bauhaus & Architectural Grid",
    nameAr: "باوهاوس السويسرية والتصميم المعماري",
    swatches: [
      { name: "Fontivo Coral", hex: "#F16B50", role: "primary" },
      { name: "Cobalt Signal", hex: "#1D4ED8", role: "secondary" },
      { name: "Ochre Gold", hex: "#EAB308", role: "accent" },
      { name: "Obsidian Black", hex: "#111318", role: "background" },
      { name: "Archival Paper", hex: "#F4F1EA", role: "surface" },
    ],
  },
  {
    id: "arabian-calligraphy-luxury",
    name: "Royal Arabic Calligraphy & Gold Leaf",
    nameAr: "فخامة الخط العربي وورق الذهب",
    swatches: [
      { name: "Mushaf Gold Leaf", hex: "#C5A059", role: "primary" },
      { name: "Emerald Turquoise", hex: "#0F766E", role: "secondary" },
      { name: "Royal Crimson", hex: "#881337", role: "accent" },
      { name: "Midnight Kufic", hex: "#0B0F17", role: "background" },
      { name: "Silk Parchment", hex: "#FAF6EE", role: "surface" },
    ],
  },
];

/**
 * Builds a 5x5 (25 cells) pixel magnifier grid around a center color for the Screen Eyedropper Loupe
 */
export function build5x5LoupeGrid(
  centerHex: string,
  rawGrid?: string[][],
): string[][] {
  if (
    Array.isArray(rawGrid) &&
    rawGrid.length === 5 &&
    rawGrid.every((row) => Array.isArray(row) && row.length === 5)
  ) {
    return rawGrid;
  }

  const { r, g, b } = hexToRgb(centerHex);
  const grid: string[][] = [];
  for (let row = -2; row <= 2; row++) {
    const rowColors: string[] = [];
    for (let col = -2; col <= 2; col++) {
      if (row === 0 && col === 0) {
        rowColors.push(rgbToHex(r, g, b));
      } else {
        const delta = (row * 3 + col * 2) * 3;
        rowColors.push(rgbToHex(r + delta, g + delta, b + delta));
      }
    }
    grid.push(rowColors);
  }
  return grid;
}

/**
 * Generates an N x N WCAG 2.1 AA/AAA Contrast Matrix for a list of swatches
 */
export function generateWcagMatrix(swatches: ColorSwatch[]) {
  return swatches.map((fg) => ({
    foreground: fg,
    cells: swatches.map((bg) => {
      const ratio = getContrastRatio(fg.hex, bg.hex);
      const rating = getWcagRating(ratio);
      return {
        background: bg,
        ratio,
        rating,
      };
    }),
  }));
}

/**
 * Fast median-cut/k-means color extraction from HTML Canvas image data.
 */
export function extractDominantColorsFromCanvas(
  canvas: HTMLCanvasElement,
  maxColors: number = 6,
): ColorSwatch[] {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];

  const { width, height } = canvas;
  // Downsample to max 120x120 for instant performance
  const sampleW = Math.min(120, width);
  const sampleH = Math.min(120, height);

  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = sampleW;
  thumbCanvas.height = sampleH;
  const thumbCtx = thumbCanvas.getContext("2d");
  if (!thumbCtx) return [];
  thumbCtx.drawImage(canvas, 0, 0, sampleW, sampleH);

  const imgData = thumbCtx.getImageData(0, 0, sampleW, sampleH).data;
  const colorBuckets: Record<string, number> = {};

  for (let i = 0; i < imgData.length; i += 4) {
    const a = imgData[i + 3];
    if (a < 128) continue; // Skip transparency

    const r = Math.round(imgData[i] / 16) * 16;
    const g = Math.round(imgData[i + 1] / 16) * 16;
    const b = Math.round(imgData[i + 2] / 16) * 16;

    const key = `${r},${g},${b}`;
    colorBuckets[key] = (colorBuckets[key] || 0) + 1;
  }

  const sorted = Object.entries(colorBuckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24);

  const result: ColorSwatch[] = [];
  const minDistance = 45; // Euclidean RGB distance to avoid near-duplicates

  const rgbDistance = (c1: ColorRgb, c2: ColorRgb) => {
    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
        Math.pow(c1.g - c2.g, 2) +
        Math.pow(c1.b - c2.b, 2),
    );
  };

  const roleNames = [
    "primary",
    "secondary",
    "accent",
    "surface",
    "background",
    "muted",
  ];
  const labels = [
    "Primary Accent",
    "Secondary Hue",
    "Vibrant Accent",
    "Surface Shade",
    "Deep Neutral",
    "Subtle Tone",
  ];

  for (const [key] of sorted) {
    if (result.length >= maxColors) break;
    const [r, g, b] = key.split(",").map(Number);
    const candidateRgb: ColorRgb = { r, g, b };

    const tooClose = result.some(
      (item) => item.rgb && rgbDistance(item.rgb, candidateRgb) < minDistance,
    );
    if (!tooClose) {
      const hex = rgbToHex(r, g, b);
      const idx = result.length;
      result.push({
        name: labels[idx] || `Tone ${idx + 1}`,
        hex,
        rgb: candidateRgb,
        role: roleNames[idx] || "accent",
        contrastWhite: getContrastRatio(hex, "#FFFFFF"),
        contrastBlack: getContrastRatio(hex, "#000000"),
      });
    }
  }

  return result;
}
