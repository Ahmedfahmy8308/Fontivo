import React, { useState, useRef, useEffect } from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  RotateCcw,
  LayoutGrid,
  Grid3X3,
  Columns,
  Pipette,
  Type,
  Minus,
  Plus,
  ChevronDown,
  Layers,
} from "lucide-react";
import { TranslationDictionary } from "../../i18n/locales";
import { FontFilter } from "../../types/font";

export interface ToolbarProps {
  fontSize?: number;
  setFontSize: (size: number) => void;
  textAlign?: "left" | "center" | "right" | "justify";
  setTextAlign: (align: "left" | "center" | "right" | "justify") => void;
  viewMode?: string;
  setViewMode: (mode: string) => void;
  isLightCanvas?: boolean;
  setIsLightCanvas: (isLight: boolean) => void;
  textColor?: string;
  setTextColor: (color: string) => void;
  hasTashkeel?: boolean;
  setHasTashkeel?: (has: boolean) => void;
  hasLigatures?: boolean;
  setHasLigatures?: (has: boolean) => void;
  previewText?: string;
  setPreviewText: (text: string) => void;
  scriptFilter?: string;
  setScriptFilter?: (script: string) => void;
  filter?: FontFilter;
  setFilter?: (filter: FontFilter) => void;
  onOpenColorPalette?: () => void;
  onOpenUiLab?: () => void;
  isRtl?: boolean;
  t?: TranslationDictionary | Record<string, string>;
}

export const SCRIPT_FILTER_PILLS = [
  { id: "all", labelAr: "الكل", labelEn: "All" },
  { id: "arabic", labelAr: "عربي", labelEn: "Arabic" },
  { id: "latin", labelAr: "لاتيني", labelEn: "Latin" },
  { id: "bilingual", labelAr: "ثنائي اللغة", labelEn: "Bilingual" },
  { id: "tashkeel", labelAr: "بالتشكيل", labelEn: "Tashkeel" },
  { id: "variable", labelAr: "متغير", labelEn: "Variable" },
] as const;

export default function Toolbar({
  fontSize = 38,
  setFontSize,
  textAlign = "right",
  setTextAlign,
  viewMode = "families",
  setViewMode,
  isLightCanvas = false,
  setIsLightCanvas,
  textColor = "",
  setTextColor,
  hasTashkeel = true,
  setHasTashkeel,
  hasLigatures = true,
  setHasLigatures,
  previewText = "",
  setPreviewText,
  scriptFilter,
  setScriptFilter,
  filter,
  setFilter,
  onOpenColorPalette,
  onOpenUiLab,
  isRtl = false,
  t = {},
}: ToolbarProps) {
  const safeT = t || {};
  const [showColorModal, setShowColorModal] = useState(false);
  const [showPangramMenu, setShowPangramMenu] = useState(false);
  const [localScript, setLocalScript] = useState("all");
  const colorModalRef = useRef<HTMLDivElement | null>(null);
  const pangramMenuRef = useRef<HTMLDivElement | null>(null);

  const activeScript =
    scriptFilter !== undefined
      ? scriptFilter
      : filter &&
          [
            "all",
            "arabic",
            "latin",
            "bilingual",
            "tashkeel",
            "variable",
          ].includes(filter.type)
        ? filter.type
        : localScript;

  const handleSelectScript = (scriptId: string) => {
    setLocalScript(scriptId);
    if (setScriptFilter) {
      setScriptFilter(scriptId);
    } else if (setFilter) {
      setFilter({ type: scriptId, value: null });
    }
    if (scriptId === "tashkeel" && setHasTashkeel) {
      setHasTashkeel(true);
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        colorModalRef.current &&
        !colorModalRef.current.contains(e.target as Node)
      ) {
        setShowColorModal(false);
      }
      if (
        pangramMenuRef.current &&
        !pangramMenuRef.current.contains(e.target as Node)
      ) {
        setShowPangramMenu(false);
      }
    }
    if (showColorModal || showPangramMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showColorModal, showPangramMenu]);

  const isArabicActive = /[\u0600-\u06FF]/.test(previewText);
  const isFamilyGridActive =
    !viewMode || viewMode === "families" || viewMode === "family";

  const toggleTashkeel = () => {
    if (!setPreviewText) return;
    if (hasTashkeel) {
      const stripped = previewText.replace(/[\u064B-\u065F\u0670]/g, "");
      setPreviewText(stripped);
      if (setHasTashkeel) setHasTashkeel(false);
    } else {
      setPreviewText("صِف خَلقَ خَودٍ كَمِثلِ الشَمسِ إِذ بَزَغَت");
      if (setHasTashkeel) setHasTashkeel(true);
    }
  };

  const handleScreenEyedropper = async () => {
    try {
      const anyWindow = window as unknown as {
        EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
      };
      if (anyWindow.EyeDropper) {
        const eyeDropper = new anyWindow.EyeDropper();
        const res = await eyeDropper.open();
        if (res && res.sRGBHex) {
          setTextColor(res.sRGBHex.toUpperCase());
        }
      } else {
        const res = await fetch("/api/color/pick-screen", { method: "POST" });
        const data = await res.json();
        if (data.success && data.hex) {
          setTextColor(data.hex);
        }
      }
    } catch {
      console.log("Eyedropper dismissed");
    }
  };

  const PANGRAMS = {
    arabic: [
      {
        title: isRtl
          ? "الأبجدية الشاملة (كلاسيكي)"
          : "Classic Comprehensive Pangram",
        text: "صِف خَلقَ خَودٍ كَمِثلِ الشَمسِ إِذ بَزَغَت",
      },
      {
        title: isRtl ? "نص تيبوجرافي مشكول" : "Vocalized Modern Pangram",
        text: "أَبْجَدِيَّةٌ عَرَبِيَّةٌ أَصِيلَةٌ تَزْهُو بِجَمَالِ الخَطِّ العَرَبِيّ",
      },
      {
        title: isRtl ? "اختبار توازن الحروف" : "Typographic Balance Test",
        text: "نَصٌّ حَكِيمٌ قَاطِعٌ لَهُ سِرٌّ خَفِيٌّ ذُو حِكْمَةٍ",
      },
      {
        title: isRtl
          ? "الأرقام الشرقية والغربية"
          : "Eastern & Western Numerals",
        text: "٠١٢٣٤٥٦٧٨٩ — 0123456789",
      },
      {
        title: isRtl ? "الترتيب الأبجدي التاريخي" : "Historical Abjad Order",
        text: "أبجد هوز حطي كلمن سعفص قرشت ثخذ ضظغ",
      },
    ],
    english: [
      {
        title: "Classic Fox (Alphabet)",
        text: "The quick brown fox jumps over the lazy dog.",
      },
      {
        title: "Compact Liquor Jugs",
        text: "Pack my box with five dozen liquor jugs.",
      },
      {
        title: "Modern Zebras",
        text: "How vexingly quick daft zebras jump!",
      },
      {
        title: "Sphinx of Black Quartz",
        text: "Sphinx of black quartz, judge my vow.",
      },
      {
        title: "Numerals & Punctuation",
        text: "1234567890 & Symbols: !@#$%^&*()_+{}[]:;<>?",
      },
    ],
  };

  const handleSelectPangram = (text: string) => {
    setPreviewText(text);
    if (/[\u0600-\u06FF]/.test(text)) {
      if (setHasTashkeel) setHasTashkeel(/[\u064B-\u065F\u0670]/.test(text));
    }
    setShowPangramMenu(false);
  };

  const adjustFontSize = (delta: number) => {
    setFontSize(Math.max(12, Math.min(200, fontSize + delta)));
  };

  return (
    <div className="border-b border-[var(--color-border)] px-3.5 py-2 flex flex-col gap-2 select-none shrink-0 transition-colors bg-[var(--color-back-header)] text-[var(--color-text-main)]">
      {/* Row 1: Script Filter Pills + Preview Text Input + Pangrams */}
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        {/* Script Filter Pills (flex-wrap so zero horizontal clipping at 1024px-1920px) */}
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {SCRIPT_FILTER_PILLS.map((pill) => {
            const isSelected = activeScript === pill.id;
            return (
              <button
                key={pill.id}
                onClick={() => handleSelectScript(pill.id)}
                className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold transition cursor-pointer whitespace-nowrap border ${
                  isSelected
                    ? "bg-[var(--color-action)] text-white border-[var(--color-action)] shadow-2xs"
                    : "bg-[var(--color-control)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text-header)] hover:border-[var(--color-action)]/40"
                }`}
              >
                {isRtl ? pill.labelAr : pill.labelEn}
              </button>
            );
          })}
        </div>

        {/* Live Preview Text Input + Pangrams Popover */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-md justify-end">
          <div className="relative flex-1 min-w-0">
            <Type className="w-3.5 h-3.5 text-[var(--color-text-muted)] absolute ltr:left-2.5 rtl:right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder={
                isRtl
                  ? "اكتب نص المعاينة المباشرة هنا..."
                  : "Type custom specimen text..."
              }
              className="w-full h-8 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] focus:border-[var(--color-action)] focus:outline-none text-xs text-[var(--color-text-header)] placeholder:text-[var(--color-text-muted)] ltr:pl-8 ltr:pr-2.5 rtl:pr-8 rtl:pl-2.5 transition"
            />
          </div>

          <div className="relative shrink-0" ref={pangramMenuRef}>
            <button
              onClick={() => setShowPangramMenu(!showPangramMenu)}
              className="h-8 px-2.5 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] hover:border-[var(--color-action)] flex items-center gap-1 transition cursor-pointer text-xs text-[var(--color-text-header)] font-semibold whitespace-nowrap shrink-0"
              title={
                isRtl
                  ? "نصوص المعاينة وبانجرامات الخطوط"
                  : "Typographic Pangrams"
              }
            >
              <span className="text-[11px] hidden md:inline whitespace-nowrap">
                {isRtl ? "نصوص جاهزة" : "Pangrams"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
            </button>

            {showPangramMenu && (
              <div
                className={`absolute top-10 ${
                  isRtl ? "left-0" : "right-0"
                } w-80 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl shadow-2xl p-3 z-50 text-xs space-y-3 animate-in fade-in zoom-in-95`}
              >
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--color-text-muted)] px-2 block mb-1">
                    {isRtl
                      ? "بانجرامات الخط العربي (Arabic Pangrams)"
                      : "Arabic Pangrams"}
                  </span>
                  <div className="space-y-1">
                    {PANGRAMS.arabic.map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectPangram(p.text)}
                        className="w-full text-right p-2 rounded-xl hover:bg-[var(--color-control)] transition cursor-pointer flex flex-col gap-0.5 text-[var(--color-text-main)] group"
                      >
                        <span className="text-[10px] text-[var(--color-action)] font-semibold">
                          {p.title}
                        </span>
                        <span className="text-xs truncate text-[var(--color-text-header)] font-medium group-hover:text-[var(--color-action)]">
                          {p.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--color-border)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-text-muted)] px-2 block mb-1">
                    Latin Pangrams (English)
                  </span>
                  <div className="space-y-1">
                    {PANGRAMS.english.map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectPangram(p.text)}
                        className="w-full text-left p-2 rounded-xl hover:bg-[var(--color-control)] transition cursor-pointer flex flex-col gap-0.5 text-[var(--color-text-main)] group"
                      >
                        <span className="text-[10px] text-[var(--color-action)] font-semibold">
                          {p.title}
                        </span>
                        <span className="text-xs truncate text-[var(--color-text-header)] font-medium group-hover:text-[var(--color-action)]">
                          {p.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: View Mode Toggle (default Family Grid) + Typography Controls + Font Size Slider */}
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {/* Multi-Mode View Selector — Defaults to Family Grid */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] shrink-0">
            <button
              onClick={() => setViewMode("families")}
              className={`h-7 px-2.5 rounded-md text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                isFamilyGridActive
                  ? "bg-[var(--color-action)] text-white shadow-xs font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
              title={
                safeT.viewFamily ||
                (isRtl ? "شبكة العائلات (الافتراضي)" : "Family Grid (Default)")
              }
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] hidden sm:inline whitespace-nowrap">
                {safeT.viewFamily || (isRtl ? "شبكة العائلات" : "Family Grid")}
              </span>
            </button>

            <button
              onClick={() => setViewMode("grid")}
              className={`h-7 px-2.5 rounded-md text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === "grid"
                  ? "bg-[var(--color-action)] text-white shadow-xs font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
              title={
                safeT.viewComfortableGrid ||
                (isRtl ? "شبكة متوازنة" : "Balanced Grid")
              }
            >
              <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] hidden lg:inline whitespace-nowrap">
                {safeT.viewComfortableGrid || (isRtl ? "متوازن" : "Grid")}
              </span>
            </button>

            <button
              onClick={() => setViewMode("compact")}
              className={`h-7 px-2.5 rounded-md text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === "compact"
                  ? "bg-[var(--color-action)] text-white shadow-xs font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
              title={
                safeT.viewCompactGrid || (isRtl ? "شبكة مدمجة" : "Compact Grid")
              }
            >
              <Grid3X3 className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] hidden lg:inline whitespace-nowrap">
                {safeT.viewCompactGrid || (isRtl ? "مدمج" : "Compact")}
              </span>
            </button>

            <button
              onClick={() => setViewMode("editorial")}
              className={`h-7 px-2.5 rounded-md text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === "editorial"
                  ? "bg-[var(--color-action)] text-white shadow-xs font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
              title={
                safeT.viewEditorial || (isRtl ? "شريط عريض" : "Editorial Strip")
              }
            >
              <Columns className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] hidden lg:inline whitespace-nowrap">
                {safeT.viewEditorial || (isRtl ? "عريض" : "Editorial")}
              </span>
            </button>
          </div>

          {/* Dual Color Swatch [ Text Color | Canvas Color ] */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowColorModal(!showColorModal)}
              className="h-8 px-2 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] hover:border-[var(--color-action)] flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
              title={
                isRtl ? "ألوان النص وخلفية المعاينة" : "Canvas & Text Colors"
              }
            >
              <span
                className="w-3.5 h-3.5 rounded-sm border border-black/30 shadow-xs"
                style={{ backgroundColor: textColor || "#f1f5f9" }}
              />
              <span className="w-[1px] h-3 bg-[var(--color-border)]" />
              <span
                className="w-3.5 h-3.5 rounded-sm border border-black/30 shadow-xs"
                style={{
                  backgroundColor: isLightCanvas ? "#ffffff" : "#140D18",
                }}
              />
            </button>

            {showColorModal && (
              <div
                ref={colorModalRef}
                className="absolute top-10 left-0 rtl:left-auto rtl:right-0 w-64 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-xl shadow-2xl p-4 z-50 text-xs space-y-3 animate-in fade-in zoom-in-95"
              >
                <div>
                  <span className="text-[var(--color-text-muted)] font-semibold block mb-1.5">
                    {isRtl ? "مظهر لوحة المعاينة" : "Canvas Theme"}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setIsLightCanvas(false)}
                      className={`py-1.5 px-2 rounded-lg border text-center font-medium transition cursor-pointer ${
                        !isLightCanvas
                          ? "border-[var(--color-action)] bg-[var(--color-action)]/15 text-[var(--color-text-header)] font-semibold"
                          : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-control)]"
                      }`}
                    >
                      {isRtl ? "خلفية داكنة" : "Dark Canvas"}
                    </button>
                    <button
                      onClick={() => setIsLightCanvas(true)}
                      className={`py-1.5 px-2 rounded-lg border text-center font-medium transition cursor-pointer ${
                        isLightCanvas
                          ? "border-[var(--color-action)] bg-white text-zinc-950 font-semibold"
                          : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-control)]"
                      }`}
                    >
                      {isRtl ? "خلفية فاتحة" : "Light Canvas"}
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-[var(--color-text-muted)] font-semibold block mb-1.5">
                    {isRtl ? "لون خط المعاينة" : "Text Color"}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      "#FFF9F2",
                      "#F16B50",
                      "#B7A1D9",
                      "#F7B544",
                      "#C7D65A",
                      "#5A5366",
                      "#291C2E",
                      "#140D18",
                    ].map((c) => (
                      <button
                        key={c}
                        onClick={() => setTextColor(c)}
                        className="w-6 h-6 rounded-full border border-[var(--color-border)] hover:scale-110 transition cursor-pointer shadow-xs"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Screen Eyedropper Tool */}
          <button
            onClick={handleScreenEyedropper}
            className="h-8 w-8 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] hover:border-[var(--color-action)] flex items-center justify-center transition cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-action)] shrink-0"
            title={
              isRtl
                ? "قطارة الشاشة (التقاط أي لون من الشاشة)"
                : "Screen Eyedropper"
            }
          >
            <Pipette className="w-3.5 h-3.5 text-[var(--color-action)]" />
          </button>

          {/* Segmented Text Alignment Controls */}
          <div className="h-8 flex items-center p-0.5 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] shrink-0">
            <button
              onClick={() => setTextAlign("left")}
              className={`w-6 h-6 rounded flex items-center justify-center transition cursor-pointer ${
                textAlign === "left"
                  ? "bg-[var(--color-back-card)] text-[var(--color-action)] shadow-2xs font-bold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
              title={isRtl ? "محاذاة لليسار" : "Align Left"}
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTextAlign("center")}
              className={`w-6 h-6 rounded flex items-center justify-center transition cursor-pointer ${
                textAlign === "center"
                  ? "bg-[var(--color-back-card)] text-[var(--color-action)] shadow-2xs font-bold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
              title={isRtl ? "محاذاة للوسط" : "Align Center"}
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTextAlign("right")}
              className={`w-6 h-6 rounded flex items-center justify-center transition cursor-pointer ${
                textAlign === "right"
                  ? "bg-[var(--color-back-card)] text-[var(--color-action)] shadow-2xs font-bold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
              title={isRtl ? "محاذاة لليمين" : "Align Right"}
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTextAlign("justify")}
              className={`w-6 h-6 rounded flex items-center justify-center transition cursor-pointer ${
                textAlign === "justify"
                  ? "bg-[var(--color-back-card)] text-[var(--color-action)] shadow-2xs font-bold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
              title={isRtl ? "محاذاة متساوية" : "Justify"}
            >
              <AlignJustify className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* OpenType Ligatures (&) */}
          <button
            onClick={() => setHasLigatures && setHasLigatures(!hasLigatures)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center font-serif text-sm font-bold transition cursor-pointer border shrink-0 ${
              hasLigatures
                ? "bg-[var(--color-action)] text-white border-[var(--color-action)] shadow-xs"
                : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)]"
            }`}
            title="OpenType Ligatures (&)"
          >
            &amp;
          </button>

          {/* Arabic Diacritics Toggle (تشكيل) */}
          {isArabicActive && (
            <button
              onClick={toggleTashkeel}
              className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition cursor-pointer border whitespace-nowrap shrink-0 ${
                hasTashkeel
                  ? "border-[var(--color-green)] bg-[var(--color-green)]/15 text-[var(--color-green)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)]"
              }`}
              title={
                isRtl
                  ? "تبديل إظهار التشكيل والحركات"
                  : "Toggle Arabic Diacritics"
              }
            >
              {isRtl ? "تشكيل" : "Tashkeel"}
            </button>
          )}
        </div>

        {/* Font Size Slider & Step Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => adjustFontSize(-4)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
            title="Zoom out (-4px)"
          >
            <Minus className="w-3 h-3" />
          </button>

          <div className="w-24 sm:w-32 flex items-center">
            <input
              type="range"
              min="12"
              max="144"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full h-1.5 bg-[var(--color-control)] rounded-lg appearance-none cursor-pointer accent-[var(--color-action)] transition-all"
              title={`Font Size: ${fontSize}px`}
            />
          </div>

          <button
            onClick={() => adjustFontSize(4)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
            title="Zoom in (+4px)"
          >
            <Plus className="w-3 h-3" />
          </button>

          <div className="flex items-center gap-1 text-xs font-mono text-[var(--color-text-main)]">
            <input
              type="number"
              min="10"
              max="200"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value) || 12)}
              className="w-9 bg-[var(--color-control)] text-center outline-none text-[var(--color-text-header)] font-mono rounded py-0.5 border border-[var(--color-border)] focus:border-[var(--color-action)] tabular-nums"
            />
            <span className="text-[10px] text-[var(--color-text-dim)]">px</span>
          </div>

          <button
            onClick={() => setFontSize(38)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-text-dim)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
            title={
              isRtl ? "إعادة الحجم الافتراضي (38px)" : "Reset size to 38px"
            }
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
