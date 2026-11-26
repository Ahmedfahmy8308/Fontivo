export type FontScriptSupport = "arabic" | "latin" | "bilingual";

export const LATIN_SPECIMEN = "The quick brown fox jumps over the lazy dog";
export const ARABIC_SPECIMEN = "صِف خَلقَ خَودٍ كَمِثلِ الشَمسِ إِذ بَزَغَت";

export const LATIN_ALPHABET =
  "A B C D E F G H I J K L M N O P Q R S T U V W X Y Z  a b c d e f g h i j k l m n o p q r s t u v w x y z";
export const ARABIC_ALPHABET =
  "أ ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن هـ و ي ة ى ئ ء";

export const LATIN_PARAGRAPH =
  "Typography is the art and technique of arranging type to make written language legible, readable and appealing when displayed. Good typographic hierarchy guides the eye effortlessly across interfaces and editorial layouts.";
export const ARABIC_PARAGRAPH =
  "تُعتبر الخطوط التيبوجرافية هي الركيزة الأساسية في بناء الهوية البصرية وتصميم واجهات المستخدم الحديثة، حيث تمنح التباين والوضوح وتُسهّل القراءة على مختلف الشاشات والأحجام.";

export const QUICK_GOOGLE_FONTS = [
  {
    id: "gf:Cairo",
    family: "Cairo",
    name: "Cairo",
    category: "arabic",
    isArabic: true,
    supportedScripts: ["arabic", "latin"],
    isGoogleFont: true,
  },
  {
    id: "gf:Tajawal",
    family: "Tajawal",
    name: "Tajawal",
    category: "arabic",
    isArabic: true,
    supportedScripts: ["arabic", "latin"],
    isGoogleFont: true,
  },
  {
    id: "gf:IBM Plex Sans Arabic",
    family: "IBM Plex Sans Arabic",
    name: "IBM Plex Sans Arabic",
    category: "arabic",
    isArabic: true,
    supportedScripts: ["arabic", "latin"],
    isGoogleFont: true,
  },
  {
    id: "gf:Readex Pro",
    family: "Readex Pro",
    name: "Readex Pro",
    category: "arabic",
    isArabic: true,
    supportedScripts: ["arabic", "latin"],
    isGoogleFont: true,
  },
  {
    id: "gf:Amiri",
    family: "Amiri",
    name: "Amiri",
    category: "arabic",
    isArabic: true,
    supportedScripts: ["arabic", "latin"],
    isGoogleFont: true,
  },
  {
    id: "gf:Inter",
    family: "Inter",
    name: "Inter",
    category: "sans-serif",
    isArabic: false,
    supportedScripts: ["latin"],
    isGoogleFont: true,
  },
  {
    id: "gf:Plus Jakarta Sans",
    family: "Plus Jakarta Sans",
    name: "Plus Jakarta Sans",
    category: "sans-serif",
    isArabic: false,
    supportedScripts: ["latin"],
    isGoogleFont: true,
  },
  {
    id: "gf:Playfair Display",
    family: "Playfair Display",
    name: "Playfair Display",
    category: "serif",
    isArabic: false,
    supportedScripts: ["latin"],
    isGoogleFont: true,
  },
  {
    id: "gf:JetBrains Mono",
    family: "JetBrains Mono",
    name: "JetBrains Mono",
    category: "monospace",
    isArabic: false,
    supportedScripts: ["latin"],
    isGoogleFont: true,
  },
];

export function detectFontScript(font: any): FontScriptSupport {
  if (!font) return "latin";

  if (
    Array.isArray(font.supportedScripts) &&
    font.supportedScripts.length > 0
  ) {
    const scripts = font.supportedScripts.map((s: string) =>
      String(s).toLowerCase(),
    );
    const hasAr = scripts.some((s: string) => s.includes("arab"));
    const hasLat = scripts.some(
      (s: string) => s.includes("latin") || s.includes("eng"),
    );
    if (hasAr && hasLat) return "bilingual";
    if (hasAr) return "arabic";
    if (hasLat) return "latin";
  }

  const cat = String(font.category || "").toLowerCase();
  const label = `${font.family || ""} ${font.name || ""} ${font.displayName || ""}`;
  const lowerLabel = label.toLowerCase();
  const hasArabicChars = /[\u0600-\u06FF]/.test(label);
  const knownBilingualArabic = [
    "cairo",
    "tajawal",
    "almarai",
    "amiri",
    "ibm plex sans arabic",
    "readex",
    "noto sans arabic",
    "noto kufi",
    "noto naskh",
    "scheherazade",
    "lateef",
    "aref ruqaa",
    "el messiri",
    "changa",
    "harmattan",
    "markazi",
    "mada",
    "mirza",
    "reem kufi",
    "vazirmatn",
  ].some((kw) => lowerLabel.includes(kw));

  if (cat.includes("bilingual") || knownBilingualArabic) return "bilingual";
  if (
    font.isArabic === true ||
    cat === "arabic" ||
    cat.includes("arab") ||
    hasArabicChars
  ) {
    return "arabic";
  }

  return "latin";
}

export function getSmartSpecimenText(
  font: any,
  previewText?: string,
  isRtl = false,
): string {
  const script = detectFontScript(font);
  const trimmed = (previewText || "").trim();
  const hasAr = /[\u0600-\u06FF]/.test(trimmed);
  const hasLat = /[A-Za-z]/.test(trimmed);

  if (script === "latin") {
    return trimmed && hasLat && !hasAr ? trimmed : LATIN_SPECIMEN;
  }
  if (script === "arabic") {
    return trimmed && hasAr ? trimmed : ARABIC_SPECIMEN;
  }
  if (trimmed) return trimmed;
  return isRtl ? ARABIC_SPECIMEN : LATIN_SPECIMEN;
}

export function getSmartAlphabet(font: any, isRtl = false): string {
  const script = detectFontScript(font);
  if (script === "latin") return LATIN_ALPHABET;
  if (script === "arabic") return ARABIC_ALPHABET;
  return isRtl ? ARABIC_ALPHABET : LATIN_ALPHABET;
}

export function getSmartParagraph(font: any, isRtl = false): string {
  const script = detectFontScript(font);
  if (script === "latin") return LATIN_PARAGRAPH;
  if (script === "arabic") return ARABIC_PARAGRAPH;
  return isRtl ? ARABIC_PARAGRAPH : LATIN_PARAGRAPH;
}

export function getSmartDirection(font: any, isRtl = false): "rtl" | "ltr" {
  const script = detectFontScript(font);
  if (script === "latin") return "ltr";
  if (script === "arabic") return "rtl";
  return isRtl ? "rtl" : "ltr";
}

export function getFontFamilyCss(font: any): string {
  if (!font) return "sans-serif";
  if (font.isGoogleFont || String(font.id || "").startsWith("gf:")) {
    const fam = font.family || font.name || "Inter";
    return `"${fam}", sans-serif`;
  }
  if (font.id !== undefined && font.id !== null && font.id !== "") {
    const fam = font.family || font.name || "";
    const disp = font.displayName || fam;
    return `"Fontivo_${font.id}", "${fam}", "${disp}", sans-serif`;
  }
  return `"${font.family || font.name || "sans-serif"}", sans-serif`;
}

export async function loadFontForPreview(font: any): Promise<void> {
  if (!font) return;
  if (font.isGoogleFont || String(font.id || "").startsWith("gf:")) {
    const fam = font.family || font.name;
    if (!fam || typeof document === "undefined") return;
    const linkId = `fontivo-gf-${fam.replace(/[^a-zA-Z0-9]/g, "-")}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam)}:wght@300;400;500;600;700;800;900&display=swap`;
      document.head.appendChild(link);
    }
    try {
      await document.fonts.load(`400 16px "${fam}"`);
    } catch {
      // Ignore font load errors in offline/test environments
    }
    return;
  }

  if (font.id === undefined || font.id === null || font.id === "") return;
  if (typeof FontFace === "undefined" || typeof document === "undefined")
    return;

  const fontFamilyName = `Fontivo_${font.id}`;
  const fontUrl = `/api/font-file/${font.id}`;
  try {
    const fontFace = new FontFace(fontFamilyName, `url("${fontUrl}")`);
    const loaded = await fontFace.load();
    document.fonts.add(loaded);
  } catch {
    // Ignore if already loaded or offline
  }
}
