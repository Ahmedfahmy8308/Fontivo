/**
 * Pure HTML5 Canvas RGB/HSL Color Quantizer for Brand Logo Palette Extraction.
 * Extracts distinct, vibrant brand colors from uploaded workspace logos without
 * any external dependencies, and exposes a unit-testable pixel-array helper.
 */

export interface ExtractedLogoColor {
  hex: string;
  name: string;
  role: "primary" | "secondary" | "accent" | "surface" | "background";
  population: number;
}

interface RgbBucket {
  rSum: number;
  gSum: number;
  bSum: number;
  count: number;
}

interface CandidateColor {
  r: number;
  g: number;
  b: number;
  h: number;
  s: number;
  l: number;
  hex: string;
  count: number;
  score: number;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function rgbToHex(r: number, g: number, b: number): string {
  const hr = clampByte(r).toString(16).padStart(2, "0");
  const hg = clampByte(g).toString(16).padStart(2, "0");
  const hb = clampByte(b).toString(16).padStart(2, "0");
  return `#${hr}${hg}${hb}`.toUpperCase();
}

export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
      break;
  }
  return { h: (h / 6) * 360, s, l };
}

function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  // Perceptually weighted Euclidean distance in RGB space
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(
    (2 + rMean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rMean) / 256) * db * db,
  );
}

function describeColorName(h: number, s: number, l: number): string {
  if (s < 0.12) {
    if (l < 0.18) return "Deep Onyx";
    if (l < 0.38) return "Charcoal Slate";
    if (l < 0.65) return "Neutral Steel";
    if (l < 0.85) return "Soft Silver";
    return "Pure Ivory";
  }

  const tone = l < 0.32 ? "Deep " : l > 0.72 ? "Soft " : "";
  if (h < 15 || h >= 345) return `${tone}Crimson`;
  if (h < 35) return `${tone}Coral`;
  if (h < 55) return `${tone}Amber`;
  if (h < 75) return `${tone}Gold`;
  if (h < 155) return `${tone}Emerald`;
  if (h < 195) return `${tone}Teal`;
  if (h < 245) return `${tone}Cobalt`;
  if (h < 285) return `${tone}Indigo`;
  if (h < 325) return `${tone}Violet`;
  return `${tone}Magenta`;
}

const DEFAULT_ROLES: ExtractedLogoColor["role"][] = [
  "primary",
  "secondary",
  "accent",
  "surface",
  "background",
];

/**
 * Extracts up to `count` distinct brand colors from a flat RGBA pixel array
 * (as returned by `CanvasRenderingContext2D.getImageData().data`).
 */
export function extractPaletteFromPixels(
  pixels: Uint8ClampedArray | number[],
  count = 5,
): ExtractedLogoColor[] {
  const targetCount = Math.max(1, Math.min(8, Math.floor(count)));
  if (!pixels || pixels.length < 4) return [];

  const buckets = new Map<number, RgbBucket>();
  const allBuckets = new Map<number, RgbBucket>();

  // 5-bit per channel quantization (32x32x32 grid)
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 128) continue; // skip transparent / semi-transparent pixels

    const r = clampByte(pixels[i]);
    const g = clampByte(pixels[i + 1]);
    const b = clampByte(pixels[i + 2]);

    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

    const existingAll = allBuckets.get(key);
    if (existingAll) {
      existingAll.rSum += r;
      existingAll.gSum += g;
      existingAll.bSum += b;
      existingAll.count += 1;
    } else {
      allBuckets.set(key, { rSum: r, gSum: g, bSum: b, count: 1 });
    }

    // Skip near-pure white/black background noise in primary pass
    const isNearWhite = r > 246 && g > 246 && b > 246;
    const isNearBlack = r < 10 && g < 10 && b < 10;
    if (isNearWhite || isNearBlack) continue;

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

  const activeMap = buckets.size > 0 ? buckets : allBuckets;
  if (activeMap.size === 0) return [];

  const candidates: CandidateColor[] = [];
  for (const bucket of activeMap.values()) {
    const r = Math.round(bucket.rSum / bucket.count);
    const g = Math.round(bucket.gSum / bucket.count);
    const b = Math.round(bucket.bSum / bucket.count);
    const { h, s, l } = rgbToHsl(r, g, b);
    // Favor both population and brand-relevant saturation/mid-tone clarity
    const midToneWeight = 1 - Math.abs(l - 0.5) * 0.65;
    const chromaBoost = 0.55 + s * 1.45;
    const score = Math.pow(bucket.count, 0.72) * chromaBoost * midToneWeight;

    candidates.push({
      r,
      g,
      b,
      h,
      s,
      l,
      hex: rgbToHex(r, g, b),
      count: bucket.count,
      score,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const selected: CandidateColor[] = [];
  const thresholds = [85, 55, 32, 16, 0];

  for (const minDist of thresholds) {
    for (const cand of candidates) {
      if (selected.length >= targetCount) break;
      if (selected.some((s) => s.hex === cand.hex)) continue;
      if (selected.every((s) => colorDistance(s, cand) >= minDist)) {
        selected.push(cand);
      }
    }
    if (selected.length >= targetCount) break;
  }

  // Ensure unique human-readable names
  const usedNames = new Map<string, number>();
  return selected.map((c, idx) => {
    const baseName = describeColorName(c.h, c.s, c.l);
    const seen = usedNames.get(baseName) || 0;
    usedNames.set(baseName, seen + 1);
    const name = seen > 0 ? `${baseName} ${seen + 1}` : baseName;
    return {
      hex: c.hex,
      name,
      role: DEFAULT_ROLES[idx] || "accent",
      population: c.count,
    };
  });
}

/**
 * Loads a logo data URL or image URL onto an offscreen HTML5 Canvas, downscales
 * it for fast sampling, and extracts up to `count` distinct brand colors.
 */
export async function extractPaletteFromImageDataUrl(
  dataUrl: string,
  count = 5,
): Promise<ExtractedLogoColor[]> {
  if (!dataUrl || typeof document === "undefined" || typeof Image === "undefined") {
    return [];
  }

  return new Promise<ExtractedLogoColor[]>((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const maxDim = 96;
          const naturalW = img.naturalWidth || img.width || maxDim;
          const naturalH = img.naturalHeight || img.height || maxDim;
          const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH, 1));
          const width = Math.max(1, Math.round(naturalW * scale));
          const height = Math.max(1, Math.round(naturalH * scale));

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve([]);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          resolve(extractPaletteFromPixels(imageData.data, count));
        } catch {
          resolve([]);
        }
      };
      img.onerror = () => resolve([]);
      img.src = dataUrl;
    } catch {
      resolve([]);
    }
  });
}
