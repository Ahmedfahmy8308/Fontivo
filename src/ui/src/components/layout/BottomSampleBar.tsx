import React, { useState, useRef, useEffect } from "react";
import { Check } from "lucide-react";

export interface BottomSampleBarProps {
  previewText: string;
  setPreviewText: (text: string) => void;
  isRtl?: boolean;
  setIsRtl: (isRtl: boolean) => void;
}

const PRESET_PANGRAMS = [
  { label: "Arabic Pangram (المعروف)", text: "صِف خَلقَ خَودٍ كَمِثلِ الشَمسِ إِذ بَزَغَت" },
  {
    label: "English Pangram",
    text: "The quick brown fox jumps over the lazy dog.",
  },
  {
    label: "Arabic Abjad (أبجد هوز مشكول)",
    text: "أَبْجَدْ هَوَّزْ حُطِّي كَلَمُنْ سَعْفَصْ قَرَشَتْ ثَخَذْ ضَظَغْ",
  },
  {
    label: "English Alphabet (A-Z, a-z)",
    text: "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz",
  },
  { label: "Numerals (أرقام لاتينية وعربية)", text: "0123456789 — ٠١٢٣٤٥٦٧٨٩" },
  {
    label: "Brand & Title (عنوان هوية)",
    text: "استوديو التصميم والهوية البصرية الحديثة 2026",
  },
  {
    label: "Classic Latin (Lorem Ipsum)",
    text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
  {
    label: "Typography Quote",
    text: "Typography is the craft of endowing human language with a durable visual form.",
  },
];

export default function BottomSampleBar({
  previewText,
  setPreviewText,
  isRtl,
  setIsRtl,
}: BottomSampleBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const selectPangram = (text: string) => {
    setPreviewText(text);
    const hasArabicChars = /[\u0600-\u06FF]/.test(text);
    setIsRtl(hasArabicChars);
    setIsOpen(false);
  };

  return (
    <div className="relative h-[44px] border-t border-[var(--color-border)] flex items-center px-4 shrink-0 z-20 transition-colors bg-[var(--color-back-side)] text-[var(--color-text-main)]">
      {/* Sample Text Input */}
      <input
        type="text"
        value={previewText}
        onChange={(e: any) => {
          setPreviewText(e.target.value);
          const hasArabicChars = /[\u0600-\u06FF]/.test(e.target.value);
          setIsRtl(hasArabicChars);
        }}
        placeholder={
          isRtl
            ? "اكتب نصاً لمعاينة الخطوط فوراً..."
            : "Type custom text to preview fonts..."
        }
        className="w-full h-full bg-transparent border-0 outline-none text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-muted)] font-sans tracking-wide"
        style={{
          direction: isRtl ? "rtl" : "ltr",
          textAlign: isRtl ? "right" : "left",
        }}
      />

      {/* Pangram disclosure triangle ▲ */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-7 h-7 ml-2 rtl:ml-0 rtl:mr-2 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer shrink-0"
        title="Sample text presets / pangrams"
      >
        <span className="text-[10px] leading-none select-none">▲</span>
      </button>

      {/* Pangrams Dropdown Popup (Opens upward) */}
      {isOpen && (
        <div
          ref={popupRef}
          className="absolute right-3 rtl:right-auto rtl:left-3 bottom-[48px] w-96 max-h-80 overflow-y-auto bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl shadow-2xl z-50 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-100"
          dir={isRtl ? "rtl" : "ltr"}
        >
          <div className="px-3 py-1 text-[10px] uppercase font-bold text-[var(--color-text-muted)] tracking-wider">
            {isRtl ? "نصوص ونماذج المعاينة الجاهزة" : "Sample Text Presets"}
          </div>
          {PRESET_PANGRAMS.map((item, idx) => {
            const isSelected = previewText === item.text;
            return (
              <button
                key={idx}
                onClick={() => selectPangram(item.text)}
                className={`w-full text-left rtl:text-right px-3 py-2 rounded-xl text-xs transition cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? "bg-[var(--color-action)] text-white font-medium shadow-xs"
                    : "text-[var(--color-text-main)] hover:bg-[var(--color-control)]"
                }`}
              >
                <div className="truncate flex-1">
                  <div
                    className={`text-[10px] font-medium ${isSelected ? "text-white/80" : "text-[var(--color-text-muted)]"}`}
                  >
                    {item.label}
                  </div>
                  <div
                    className="truncate text-xs mt-0.5"
                    style={{
                      direction: /[\u0600-\u06FF]/.test(item.text)
                        ? "rtl"
                        : "ltr",
                    }}
                  >
                    {item.text}
                  </div>
                </div>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-white shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
