export interface ColorRgb {
  r: number;
  g: number;
  b: number;
}

export interface ColorHsl {
  h: number;
  s: number;
  l: number;
}

export interface ColorCmyk {
  c: number;
  m: number;
  y: number;
  k: number;
}

export interface ColorOklch {
  l: number; // 0 to 1
  c: number; // 0 to ~0.4
  h: number; // 0 to 360
  css: string;
}

export interface ColorSwatch {
  name: string;
  hex: string;
  role?:
    | "primary"
    | "secondary"
    | "accent"
    | "surface"
    | "background"
    | "muted"
    | string;
  rgb?: ColorRgb;
  contrastWhite?: number;
  contrastBlack?: number;
  [key: string]: unknown;
}

export interface AseColor {
  name: string;
  hex: string;
  rgb: ColorRgb;
  space: string;
  group: string;
  type: "Global" | "Spot" | "Normal";
}

export interface AseParseResult {
  version: string;
  totalColors: number;
  colors: AseColor[];
}

export interface WcagRating {
  normalText: "AAA" | "AA" | "Fail";
  largeText: "AAA" | "AA" | "Fail";
  uiComponents: "AA" | "Fail";
  isNormalPass: boolean;
  isLargePass: boolean;
}

export interface ColorHarmonies {
  complementary: string[];
  analogous: string[];
  triadic: string[];
  splitComplementary: string[];
  tetradic: string[];
  monochromatic: string[];
}

export type TailwindScaleShade =
  | "50"
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900"
  | "950";

export type TailwindScale = Record<TailwindScaleShade, string>;

export interface Material3TonalPalettes {
  primary: { tone: number; hex: string }[];
  secondary: { tone: number; hex: string }[];
  tertiary: { tone: number; hex: string }[];
  neutral: { tone: number; hex: string }[];
}
