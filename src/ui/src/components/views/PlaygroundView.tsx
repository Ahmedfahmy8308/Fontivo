import React, { useState } from "react";
import { Plus, Trash2, AlignLeft, AlignCenter, AlignRight } from "lucide-react";

export default function PlaygroundView({
  families = [],
  t = {},
  isRtl = false,
}: any) {
  const [elements, setElements] = useState([
    {
      id: 1,
      text: isRtl
        ? "مختبر النصوص وتجربة التيبوجرافي التفاعلية"
        : "Visual Playground & Typography Lab",
      fontSize: 44,
      fontFamily: families[0]?.family || "sans-serif",
      fontWeight: "bold",
      color: "#10b981",
      textAlign: isRtl ? "right" : "left",
    },
    {
      id: 2,
      text: isRtl
        ? "صمم وجرّب واختبر التناغم بين الخطوط بحرية تامة على لوحة تفاعلية."
        : "Compose, test, and pair fonts freely on an interactive artboard canvas.",
      fontSize: 20,
      fontFamily: families[1]?.family || "sans-serif",
      fontWeight: "normal",
      color: "#94a3b8",
      textAlign: isRtl ? "right" : "left",
    },
    {
      id: 3,
      text: "صِف خَلقَ خَودٍ كَمِثلِ الشَمسِ إِذ بَزَغَت — The quick brown fox jumps over the lazy dog",
      fontSize: 28,
      fontFamily:
        families.find((f) => f.fonts?.some((font) => font.isArabic))?.family ||
        "sans-serif",
      fontWeight: "normal",
      color: "#B7A1D9",
      textAlign: "center",
    },
  ]);

  const [selectedId, setSelectedId] = useState(1);
  const activeElement =
    elements.find((el) => el.id === selectedId) || elements[0];

  const updateActive = (field, val) => {
    setElements((prev) =>
      prev.map((el) => (el.id === selectedId ? { ...el, [field]: val } : el)),
    );
  };

  const addElement = () => {
    const newId = Date.now();
    const newEl = {
      id: newId,
      text: isRtl ? "طبقة نصوص جديدة..." : "New Typographic Layer",
      fontSize: 28,
      fontFamily: families[0]?.family || "sans-serif",
      fontWeight: "normal",
      color: "#10b981",
      textAlign: isRtl ? "right" : "left",
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedId(newId);
  };

  const deleteElement = (id) => {
    if (elements.length <= 1) return;
    setElements((prev) => prev.filter((el) => el.id !== id));
    if (selectedId === id) {
      setSelectedId(elements[0].id);
    }
  };

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none w-full"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Playground Toolbar */}
      <div className="min-h-[50px] px-4 sm:px-6 py-2 bg-[var(--color-back-card)] border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs uppercase font-bold tracking-wider text-[var(--color-text-muted)] whitespace-nowrap">
            {isRtl ? "لوحة المختبر التيبوجرافي" : "Playground Canvas"}
          </span>
          <button
            onClick={addElement}
            className="h-8 px-3 rounded-xl bg-[var(--color-action)] hover:opacity-90 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>{isRtl ? "إضافة نص جديد" : "Add Text Layer"}</span>
          </button>
        </div>

        {/* Selected Layer Controls */}
        {activeElement && (
          <div className="flex items-center gap-3">
            {/* Font Family Selector */}
            <select
              value={activeElement.fontFamily}
              onChange={(e: any) => updateActive("fontFamily", e.target.value)}
              className="bg-[var(--color-back-subtle)] border border-[var(--color-border)] rounded-xl px-2.5 py-1 text-xs text-[var(--color-text-header)] focus:outline-none max-w-[180px]"
            >
              {families.map((f) => (
                <option key={f.family} value={f.family}>
                  {f.family}
                </option>
              ))}
            </select>

            {/* Font Size */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--color-text-muted)] font-mono">
                {activeElement.fontSize}px
              </span>
              <input
                type="range"
                min="12"
                max="96"
                value={activeElement.fontSize}
                onChange={(e: any) =>
                  updateActive("fontSize", parseInt(e.target.value))
                }
                className="w-20 accent-[var(--color-action)] cursor-pointer"
              />
            </div>

            {/* Alignments */}
            <div className="flex items-center bg-[var(--color-back-subtle)] border border-[var(--color-border)] rounded-xl p-0.5">
              <button
                onClick={() => updateActive("textAlign", "left")}
                className={`p-1.5 rounded-lg transition ${activeElement.textAlign === "left" ? "bg-[var(--color-action)] text-white" : "text-[var(--color-text-muted)]"}`}
              >
                <AlignLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => updateActive("textAlign", "center")}
                className={`p-1.5 rounded-lg transition ${activeElement.textAlign === "center" ? "bg-[var(--color-action)] text-white" : "text-[var(--color-text-muted)]"}`}
              >
                <AlignCenter className="w-3 h-3" />
              </button>
              <button
                onClick={() => updateActive("textAlign", "right")}
                className={`p-1.5 rounded-lg transition ${activeElement.textAlign === "right" ? "bg-[var(--color-action)] text-white" : "text-[var(--color-text-muted)]"}`}
              >
                <AlignRight className="w-3 h-3" />
              </button>
            </div>

            {/* Delete Layer */}
            {elements.length > 1 && (
              <button
                onClick={() => deleteElement(activeElement.id)}
                className="p-1.5 rounded-xl hover:bg-rose-500/15 text-rose-500 transition cursor-pointer"
                title={isRtl ? "حذف هذه الطبقة" : "Delete layer"}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Interactive Artboard Canvas */}
      <div className="flex-1 overflow-y-auto p-10 flex flex-col items-center justify-center">
        <div className="w-full max-w-4xl min-h-[500px] p-12 rounded-3xl bg-[var(--color-back-card)] border border-[var(--color-border)] shadow-xl flex flex-col justify-center space-y-8 relative">
          {elements.map((el) => {
            const isSelected = el.id === selectedId;
            return (
              <div
                key={el.id}
                onClick={() => setSelectedId(el.id)}
                className={`p-4 rounded-2xl cursor-pointer transition-all border ${
                  isSelected
                    ? "border-[var(--color-action)] bg-[var(--color-action)]/5 ring-2 ring-[var(--color-action)]/20"
                    : "border-transparent hover:border-[var(--color-border)]"
                }`}
              >
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e: any) => updateActive("text", e.target.innerText)}
                  style={{
                    fontFamily: `"${el.fontFamily}", sans-serif`,
                    fontSize: `${el.fontSize}px`,
                    fontWeight: el.fontWeight,
                    color: el.color,
                    textAlign: el.textAlign as any,
                  }}
                  className="outline-none leading-relaxed transition-all"
                >
                  {el.text}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
