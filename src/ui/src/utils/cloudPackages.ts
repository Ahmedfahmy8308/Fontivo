export type CloudPackageCategory =
  "arabic" | "latin" | "persian" | "urdu" | "multilingual";

export interface CloudPackage {
  id: string;
  name: string;
  nameAr: string;
  category: CloudPackageCategory;
  categoryLabel: string;
  categoryLabelAr: string;
  fontCount: number;
  familyCount: number;
  compressedSize: string;
  compressedBytes: number;
  uncompressedSize: string;
  uncompressedBytes: number;
  sha256: string;
  version: string;
  fileName: string;
  description: string;
  descriptionAr: string;
  downloadUrl: string;
  isDownloaded?: boolean;
}

export interface NormalizedCloudManifest {
  libraryVersion: string;
  totalFonts: number;
  totalFamilies: number;
  totalCompressedBytes: number;
  totalUncompressedBytes: number;
  packages: CloudPackage[];
  source: "live" | "fallback";
}

export const CLOUD_MANIFEST_VERSION = "1.0.3";
export const CLOUD_TOTAL_FONTS = 10939;
export const CLOUD_TOTAL_FAMILIES = 4430;
export const CLOUD_TOTAL_COMPRESSED_BYTES = 905982558;
export const CLOUD_TOTAL_UNCOMPRESSED_BYTES = 1762816362;

const RELEASE_BASE_URL =
  "https://github.com/Ahmedfahmy8308/Fontivo-Fonts/releases/download/v1.0.3";

export function formatCloudBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0.00 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(2)} MB`;
}

const CATEGORY_LABELS: Record<
  CloudPackageCategory,
  { en: string; ar: string }
> = {
  arabic: { en: "Arabic", ar: "عربي" },
  latin: { en: "Latin", ar: "لاتيني" },
  persian: { en: "Persian", ar: "فارسي" },
  urdu: { en: "Urdu", ar: "أردو" },
  multilingual: { en: "Multilingual", ar: "متعدد اللغات" },
};

/**
 * Exact offline manifest aligned 1:1 with Fontivo-Fonts v1.0.3 GitHub Release:
 * 15 deterministic packs, 10,939 fonts, 4,430 families, 864.01 MB compressed.
 */
export const VERIFIED_CLOUD_PACKAGES: CloudPackage[] = [
  {
    id: "pack-essential-001",
    name: "Essential Pack 001 — Arabic Typography",
    nameAr: "الحزمة الأساسية 001 — الخطوط العربية",
    category: "arabic",
    categoryLabel: "Arabic",
    categoryLabelAr: "عربي",
    fontCount: 970,
    familyCount: 582,
    compressedBytes: 42825441,
    compressedSize: formatCloudBytes(42825441),
    uncompressedBytes: 92383140,
    uncompressedSize: formatCloudBytes(92383140),
    sha256: "8c932847ee9c1c62fd84e202d5c02786b7c9f02174bd8e5edc7b236f77b1c83e",
    version: "1.0.5",
    fileName: "fontivo-essential-001.zip",
    description:
      "Complete Arabic collection (970 fonts across 582 families) featuring Naskh, Kufic, Thuluth, Ruqah, Diwani, and modern UI typefaces.",
    descriptionAr:
      "مجموعة الخطوط العربية الشاملة (970 خطاً عبر 582 عائلة) تضم النسخ والكوفي والثلث والرقعة والديواني وخطوط الواجهات الحديثة.",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-001.zip`,
  },
  {
    id: "pack-essential-002",
    name: "Essential Pack 002 — Latin Typography I",
    nameAr: "الحزمة الأساسية 002 — الخطوط اللاتينية I",
    category: "latin",
    categoryLabel: "Latin",
    categoryLabelAr: "لاتيني",
    fontCount: 848,
    familyCount: 253,
    compressedBytes: 88664017,
    compressedSize: formatCloudBytes(88664017),
    uncompressedBytes: 155484442,
    uncompressedSize: formatCloudBytes(155484442),
    sha256: "99560337d75e007dfbf0e4825b31c77c6e0f388310995a077f1b52f1e0658676",
    version: "1.0.5",
    fileName: "fontivo-essential-002.zip",
    description:
      "Curated Latin typography volume I (848 fonts across 253 families) with clean sans-serif, serif, and display families.",
    descriptionAr:
      "المجلد الأول للخطوط اللاتينية (848 خطاً عبر 253 عائلة) من عائلات السانس سيريف والسيريف وخطوط العناوين.",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-002.zip`,
  },
  {
    id: "pack-essential-003",
    name: "Essential Pack 003 — Latin Typography II",
    nameAr: "الحزمة الأساسية 003 — الخطوط اللاتينية II",
    category: "latin",
    categoryLabel: "Latin",
    categoryLabelAr: "لاتيني",
    fontCount: 842,
    familyCount: 301,
    compressedBytes: 72808361,
    compressedSize: formatCloudBytes(72808361),
    uncompressedBytes: 148868189,
    uncompressedSize: formatCloudBytes(148868189),
    sha256: "7b7843495e3ca673a44cc313207aacd841714ce159ed4d31c35c9c2477152ae5",
    version: "1.0.5",
    fileName: "fontivo-essential-003.zip",
    description:
      "Curated Latin typography volume II (842 fonts across 301 families) covering geometric sans-serifs and UI workhorses.",
    descriptionAr:
      "المجلد الثاني للخطوط اللاتينية (842 خطاً عبر 301 عائلة) يغطي الخطوط الهندسية وخطوط واجهات المستخدم.",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-003.zip`,
  },
  {
    id: "pack-essential-004",
    name: "Essential Pack 004 — Latin Typography III",
    nameAr: "الحزمة الأساسية 004 — الخطوط اللاتينية III",
    category: "latin",
    categoryLabel: "Latin",
    categoryLabelAr: "لاتيني",
    fontCount: 771,
    familyCount: 240,
    compressedBytes: 94451341,
    compressedSize: formatCloudBytes(94451341),
    uncompressedBytes: 192989044,
    uncompressedSize: formatCloudBytes(192989044),
    sha256: "aac04c88f50280190f81ae9b6a64d75498823a6ed69212073519d663b5eb0f09",
    version: "1.0.5",
    fileName: "fontivo-essential-004.zip",
    description:
      "Extensive Latin studio pack III (771 fonts across 240 families) with editorial serifs and multi-weight branding systems.",
    descriptionAr:
      "المجلد الثالث للخطوط اللاتينية (771 خطاً عبر 240 عائلة) للتحرير وأنظمة الهوية متعددة الأوزان.",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-004.zip`,
  },
  {
    id: "pack-essential-005",
    name: "Essential Pack 005 — Latin Typography IV",
    nameAr: "الحزمة الأساسية 005 — الخطوط اللاتينية IV",
    category: "latin",
    categoryLabel: "Latin",
    categoryLabelAr: "لاتيني",
    fontCount: 1022,
    familyCount: 328,
    compressedBytes: 76281781,
    compressedSize: formatCloudBytes(76281781),
    uncompressedBytes: 139621454,
    uncompressedSize: formatCloudBytes(139621454),
    sha256: "f7f3d0d560e0fb0b8e4e3a92dfa7d2de9247367362050fb6423a5214f4dadc17",
    version: "1.0.5",
    fileName: "fontivo-essential-005.zip",
    description:
      "Curated Latin display, condensed poster, and modern geometric sans families (1,022 fonts across 328 families).",
    descriptionAr:
      "المجلد الرابع للخطوط اللاتينية (1,022 خطاً عبر 328 عائلة) لعناوين العرض والملصقات والخطوط الهندسية الحديثة.",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-005.zip`,
  },
  {
    id: "pack-essential-006",
    name: "Essential Pack 006 — Latin Typography V",
    nameAr: "الحزمة الأساسية 006 — الخطوط اللاتينية V",
    category: "latin",
    categoryLabel: "Latin",
    categoryLabelAr: "لاتيني",
    fontCount: 722,
    familyCount: 262,
    compressedBytes: 78127064,
    compressedSize: formatCloudBytes(78127064),
    uncompressedBytes: 152568924,
    uncompressedSize: formatCloudBytes(152568924),
    sha256: "ca9b95bdcc2f2c0bfb3367171e2b67fd148d4182a57285fd320ae46f9d4c1851",
    version: "1.0.3",
    fileName: "fontivo-essential-006.zip",
    description:
      "Multi-weight Latin families (722 fonts across 262 families) with optical weights, italics, and extended glyphs.",
    descriptionAr:
      "المجلد الخامس للخطوط اللاتينية (722 خطاً عبر 262 عائلة) بأوزان بصرية متكاملة ومائلة ومحارف موسعة.",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-006.zip`,
  },
  {
    id: "pack-essential-007",
    name: "Essential Pack 007 — Latin Typography VI",
    nameAr: "الحزمة الأساسية 007 — الخطوط اللاتينية VI",
    category: "latin",
    categoryLabel: "Latin",
    categoryLabelAr: "لاتيني",
    fontCount: 1018,
    familyCount: 368,
    compressedBytes: 87580916,
    compressedSize: formatCloudBytes(87580916),
    uncompressedBytes: 139628454,
    uncompressedSize: formatCloudBytes(139628454),
    sha256: "81c2bd0589d21963f64a84d17999af2875392ff31e42e8284ce04f0eba7023a0",
    version: "1.0.3",
    fileName: "fontivo-essential-007.zip",
    description:
      "High-coverage Latin families (1,018 fonts across 368 families) with rich OpenType features and variable styles.",
    descriptionAr:
      "المجلد السادس للخطوط اللاتينية (1,018 خطاً عبر 368 عائلة) بمزايا OpenType غنية وتنويعات متغيرة.",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-007.zip`,
  },
  {
    id: "pack-essential-008",
    name: "Essential Pack 008 — Latin Typography VII",
    nameAr: "الحزمة الأساسية 008 — الخطوط اللاتينية VII",
    category: "latin",
    categoryLabel: "Latin",
    categoryLabelAr: "لاتيني",
    fontCount: 972,
    familyCount: 287,
    compressedBytes: 89669029,
    compressedSize: formatCloudBytes(89669029),
    uncompressedBytes: 149223010,
    uncompressedSize: formatCloudBytes(149223010),
    sha256: "5be18b9324dde6873327377036ed756c6314692a0eee8dfe6c269bfb5c7d094c",
    version: "1.0.5",
    fileName: "fontivo-essential-008.zip",
    description:
      "Grotesques, slab serifs, monospace coding fonts, and interface families (972 fonts across 287 families).",
    descriptionAr:
      "المجلد السابع للخطوط اللاتينية (972 خطاً عبر 287 عائلة) من خطوط الغروتسك والسلاب سيريف وخطوط البرمجة.",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-008.zip`,
  },
  {
    id: "pack-essential-009",
    name: "Essential Pack 009 — Latin Typography VIII",
    nameAr: "الحزمة الأساسية 009 — الخطوط اللاتينية VIII",
    category: "latin",
    categoryLabel: "Latin",
    categoryLabelAr: "لاتيني",
    fontCount: 936,
    familyCount: 370,
    compressedBytes: 83469783,
    compressedSize: formatCloudBytes(83469783),
    uncompressedBytes: 150361365,
    uncompressedSize: formatCloudBytes(150361365),
    sha256: "a5f2b8c0a60c424ad805865c8ed0d7ed3422e358fa36521f77aad787b77fc6e3",
    version: "1.0.5",
    fileName: "fontivo-essential-009.zip",
    description:
      "Editorial, branding, and contemporary Latin collection (936 fonts across 370 families).",
    descriptionAr:
      "المجلد الثامن للخطوط اللاتينية (936 خطاً عبر 370 عائلة) لخطوط النشر والهويات المعاصرة.",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-009.zip`,
  },
  {
    id: "pack-essential-010",
    name: "Essential Pack 010 — Persian Typography",
    nameAr: "الحزمة الأساسية 010 — الخطوط الفارسية",
    category: "persian",
    categoryLabel: "Persian",
    categoryLabelAr: "فارسي",
    fontCount: 1253,
    familyCount: 818,
    compressedBytes: 51623892,
    compressedSize: formatCloudBytes(51623892),
    uncompressedBytes: 112825887,
    uncompressedSize: formatCloudBytes(112825887),
    sha256: "368a3f5319e7a3f6d1dae1dec6e67b062b447ef4b50c1803c626c40f3f07dd1b",
    version: "1.0.5",
    fileName: "fontivo-essential-010.zip",
    description:
      "Comprehensive Persian typography archive (1,253 fonts across 818 families) covering editorial, headline, and calligraphic styles.",
    descriptionAr:
      "أرشيف الخطوط الفارسية الشامل (1,253 خطاً عبر 818 عائلة) يغطي خطوط التحرير والعناوين والأنماط الفنية.",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-010.zip`,
  },
  {
    id: "pack-essential-011",
    name: "Essential Pack 011 — Urdu Nastaliq & Display I",
    nameAr: "الحزمة الأساسية 011 — خطوط الأردو I",
    category: "urdu",
    categoryLabel: "Urdu",
    categoryLabelAr: "أردو",
    fontCount: 405,
    familyCount: 152,
    compressedBytes: 35014024,
    compressedSize: formatCloudBytes(35014024),
    uncompressedBytes: 81359319,
    uncompressedSize: formatCloudBytes(81359319),
    sha256: "24cb1d09bb04311c2255b9f41d9041544c1f98ea6fbad0c6ccaf4ca14e1e4639",
    version: "1.0.5",
    fileName: "fontivo-essential-011.zip",
    description:
      "Urdu Nastaliq, Naskh, and display collection I (405 fonts across 152 families).",
    descriptionAr:
      "المجموعة الأولى من خطوط الأردو والنستعليق والعرض (405 خطوط عبر 152 عائلة).",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-011.zip`,
  },
  {
    id: "pack-essential-012",
    name: "Essential Pack 012 — Urdu Nastaliq & Editorial II",
    nameAr: "الحزمة الأساسية 012 — خطوط الأردو II",
    category: "urdu",
    categoryLabel: "Urdu",
    categoryLabelAr: "أردو",
    fontCount: 393,
    familyCount: 144,
    compressedBytes: 33230124,
    compressedSize: formatCloudBytes(33230124),
    uncompressedBytes: 81464281,
    uncompressedSize: formatCloudBytes(81464281),
    sha256: "d5674cdc76b9eed060ef22def4680a19e21f299e3648cc18a4e660fe202b7549",
    version: "1.0.5",
    fileName: "fontivo-essential-012.zip",
    description:
      "Urdu Nastaliq ligature and publication collection II (393 fonts across 144 families).",
    descriptionAr:
      "المجموعة الثانية من خطوط الأردو والنستعليق وخطوط النشر (393 خطاً عبر 144 عائلة).",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-012.zip`,
  },
  {
    id: "pack-essential-013",
    name: "Essential Pack 013 — Urdu Headlines & Display III",
    nameAr: "الحزمة الأساسية 013 — خطوط الأردو III",
    category: "urdu",
    categoryLabel: "Urdu",
    categoryLabelAr: "أردو",
    fontCount: 372,
    familyCount: 167,
    compressedBytes: 34782399,
    compressedSize: formatCloudBytes(34782399),
    uncompressedBytes: 80608508,
    uncompressedSize: formatCloudBytes(80608508),
    sha256: "5e3055b1be89b9389e719fbf7ccb842735a80594088902a49184c004f69be5e9",
    version: "1.0.3",
    fileName: "fontivo-essential-013.zip",
    description:
      "Urdu headline and display typography collection III (372 fonts across 167 families).",
    descriptionAr:
      "المجموعة الثالثة لعناوين الأردو والخطوط الحديثة (372 خطاً عبر 167 عائلة).",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-013.zip`,
  },
  {
    id: "pack-essential-014",
    name: "Essential Pack 014 — Urdu Master Archive IV",
    nameAr: "الحزمة الأساسية 014 — خطوط الأردو IV",
    category: "urdu",
    categoryLabel: "Urdu",
    categoryLabelAr: "أردو",
    fontCount: 395,
    familyCount: 160,
    compressedBytes: 35407865,
    compressedSize: formatCloudBytes(35407865),
    uncompressedBytes: 81702741,
    uncompressedSize: formatCloudBytes(81702741),
    sha256: "15c3abb9bead00e121c554642b1806c7865d8496daf5eae6ff36ee58d3376869",
    version: "1.0.5",
    fileName: "fontivo-essential-014.zip",
    description:
      "Urdu calligraphy and classic print typography collection IV (395 fonts across 160 families).",
    descriptionAr:
      "المجموعة الرابعة من خطوط الأردو الكلاسيكية والمطبوعات (395 خطاً عبر 160 عائلة).",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-014.zip`,
  },
  {
    id: "pack-essential-015",
    name: "Essential Pack 015 — Multilingual Finale",
    nameAr: "الحزمة الأساسية 015 — المجموعة المتعددة اللغات",
    category: "multilingual",
    categoryLabel: "Multilingual",
    categoryLabelAr: "متعدد اللغات",
    fontCount: 20,
    familyCount: 17,
    compressedBytes: 2046521,
    compressedSize: formatCloudBytes(2046521),
    uncompressedBytes: 3727604,
    uncompressedSize: formatCloudBytes(3727604),
    sha256: "3df19618747eef5be3dd576fa962cc912db4c83155e730932b7d163a414a1a5c",
    version: "1.0.3",
    fileName: "fontivo-essential-015.zip",
    description:
      "Supplemental multilingual bundle (Arabic, Latin, Persian; 20 fonts across 17 families) completing the 10,939-font Fontivo Essential library.",
    descriptionAr:
      "الحزمة التكميلية متعددة اللغات (عربي، لاتيني، فارسي — 20 خطاً عبر 17 عائلة) لإتمام مكتبة فونتيفو المدققة من 10,939 خط.",
    downloadUrl: `${RELEASE_BASE_URL}/fontivo-essential-015.zip`,
  },
];

export function normalizeCloudCategory(
  rawCategory?: string,
  id?: string,
): CloudPackageCategory {
  if (id) {
    const fallback = VERIFIED_CLOUD_PACKAGES.find((p) => p.id === id);
    if (fallback && (!rawCategory || rawCategory.trim() === "")) {
      return fallback.category;
    }
  }
  const value = String(rawCategory || "").toLowerCase();
  const hasArabic =
    value.includes("arab") || value.includes("kuf") || value.includes("naskh");
  const hasLatin =
    value.includes("latin") ||
    value.includes("english") ||
    value.includes("sans") ||
    value.includes("serif");
  const hasPersian = value.includes("persian") || value.includes("farsi");
  const hasUrdu = value.includes("urdu") || value.includes("nastaliq");
  const count = [hasArabic, hasLatin, hasPersian, hasUrdu].filter(
    Boolean,
  ).length;
  if (count > 1 || value.includes("multi") || value.includes("biling"))
    return "multilingual";
  if (hasPersian) return "persian";
  if (hasUrdu) return "urdu";
  if (hasArabic) return "arabic";
  if (hasLatin) return "latin";
  if (id) {
    const fallback = VERIFIED_CLOUD_PACKAGES.find((p) => p.id === id);
    if (fallback) return fallback.category;
  }
  return "latin";
}

/**
 * Normalizes live backend responses from `/api/library/manifest` or `/api/catalog/packages`
 * into a strongly typed `NormalizedCloudManifest`, preserving Arabic/English labels and
 * accurate script categories across Arabic, Latin, Persian, Urdu, and Multilingual packs.
 */
export function normalizeManifestPackages(data: any): NormalizedCloudManifest {
  const fallbackTotalCompressed = VERIFIED_CLOUD_PACKAGES.reduce(
    (s, p) => s + p.compressedBytes,
    0,
  );
  const fallbackTotalUncompressed = VERIFIED_CLOUD_PACKAGES.reduce(
    (s, p) => s + p.uncompressedBytes,
    0,
  );
  const fallbackTotalFonts = VERIFIED_CLOUD_PACKAGES.reduce(
    (s, p) => s + p.fontCount,
    0,
  );

  if (!data || typeof data !== "object") {
    return {
      libraryVersion: CLOUD_MANIFEST_VERSION,
      totalFonts: fallbackTotalFonts,
      totalFamilies: CLOUD_TOTAL_FAMILIES,
      totalCompressedBytes: fallbackTotalCompressed,
      totalUncompressedBytes: fallbackTotalUncompressed,
      packages: VERIFIED_CLOUD_PACKAGES,
      source: "fallback",
    };
  }

  let rawList: any[] = [];
  if (Array.isArray(data)) {
    rawList = data;
  } else if (Array.isArray(data.packs)) {
    rawList = data.packs;
  } else if (Array.isArray(data.packages)) {
    rawList = data.packages;
  } else if (data.packages && typeof data.packages === "object") {
    rawList = Object.values(data.packages);
  } else if (data.manifest && Array.isArray(data.manifest.packs)) {
    rawList = data.manifest.packs;
  }

  if (rawList.length === 0) {
    return {
      libraryVersion: data.libraryVersion || CLOUD_MANIFEST_VERSION,
      totalFonts: data.summary?.totalUniqueFonts || fallbackTotalFonts,
      totalFamilies: data.summary?.totalFamilies || CLOUD_TOTAL_FAMILIES,
      totalCompressedBytes:
        data.summary?.totalCompressedSizeBytes || fallbackTotalCompressed,
      totalUncompressedBytes:
        data.summary?.totalUncompressedSizeBytes || fallbackTotalUncompressed,
      packages: VERIFIED_CLOUD_PACKAGES,
      source: "fallback",
    };
  }

  const normalized: CloudPackage[] = rawList
    .map((remote: any, idx: number): CloudPackage => {
      const id = String(
        remote.id || `pack-essential-${String(idx + 1).padStart(3, "0")}`,
      );
      const fallback = VERIFIED_CLOUD_PACKAGES.find((p) => p.id === id);

      const category = normalizeCloudCategory(
        remote.category || remote.script,
        id,
      );
      const catLabel = CATEGORY_LABELS[category];
      const compressedBytes = Number(
        remote.compressedSizeBytes ??
          remote.compressedSize ??
          remote.sizeBytes ??
          fallback?.compressedBytes ??
          0,
      );
      const uncompressedBytes = Number(
        remote.uncompressedSizeBytes ??
          remote.uncompressedSize ??
          fallback?.uncompressedBytes ??
          Math.round(compressedBytes * 2.1),
      );
      const fontCount = Number(
        remote.fontCount ?? remote.font_count ?? fallback?.fontCount ?? 0,
      );
      const familyCount = Number(
        remote.familyCount ?? fallback?.familyCount ?? 0,
      );

      return {
        id,
        name: fallback?.name || String(remote.name || id),
        nameAr: fallback?.nameAr || String(remote.nameAr || remote.name || id),
        category,
        categoryLabel: catLabel.en,
        categoryLabelAr: catLabel.ar,
        fontCount,
        familyCount,
        compressedBytes,
        compressedSize: formatCloudBytes(compressedBytes),
        uncompressedBytes,
        uncompressedSize: formatCloudBytes(uncompressedBytes),
        sha256: String(remote.sha256 || fallback?.sha256 || ""),
        version: String(
          remote.version || data.libraryVersion || CLOUD_MANIFEST_VERSION,
        ),
        fileName: String(
          remote.fileName ||
            remote.file_name ||
            fallback?.fileName ||
            `${id}.zip`,
        ),
        description: fallback?.description || String(remote.description || ""),
        descriptionAr:
          fallback?.descriptionAr ||
          String(remote.descriptionAr || remote.description || ""),
        downloadUrl: String(
          remote.downloadUrl ||
            remote.url ||
            remote.download_url ||
            fallback?.downloadUrl ||
            "",
        ),
        isDownloaded: Boolean(
          remote.isDownloaded || remote.downloaded || remote.installed,
        ),
      };
    })
    .filter((p) => Boolean(p.id && p.downloadUrl));

  if (normalized.length === 0) {
    return {
      libraryVersion: CLOUD_MANIFEST_VERSION,
      totalFonts: fallbackTotalFonts,
      totalFamilies: CLOUD_TOTAL_FAMILIES,
      totalCompressedBytes: fallbackTotalCompressed,
      totalUncompressedBytes: fallbackTotalUncompressed,
      packages: VERIFIED_CLOUD_PACKAGES,
      source: "fallback",
    };
  }

  const totalFonts =
    Number(data.summary?.totalUniqueFonts) ||
    normalized.reduce((acc, p) => acc + p.fontCount, 0);
  const totalFamilies =
    Number(data.summary?.totalFamilies) ||
    normalized.reduce((acc, p) => acc + p.familyCount, 0) ||
    CLOUD_TOTAL_FAMILIES;
  const totalCompressedBytes =
    Number(data.summary?.totalCompressedSizeBytes) ||
    normalized.reduce((acc, p) => acc + p.compressedBytes, 0);
  const totalUncompressedBytes =
    Number(data.summary?.totalUncompressedSizeBytes) ||
    normalized.reduce((acc, p) => acc + p.uncompressedBytes, 0);

  return {
    libraryVersion: String(
      data.libraryVersion ||
        data.manifest?.libraryVersion ||
        CLOUD_MANIFEST_VERSION,
    ),
    totalFonts,
    totalFamilies,
    totalCompressedBytes,
    totalUncompressedBytes,
    packages: normalized,
    source: "live",
  };
}
