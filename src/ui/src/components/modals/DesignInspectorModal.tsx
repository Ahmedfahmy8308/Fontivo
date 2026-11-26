import React, { useState, useRef } from "react";
import {
  X,
  FileSearch,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Zap,
  FolderOpen,
} from "lucide-react";
import { inspectDroppedDesignFile } from "../../utils/designDrop";

export default function DesignInspectorModal({
  isOpen,
  onClose,
  onRefreshStats,
  t = {},
  isRtl = false,
}: any) {
  if (!isOpen) return null;

  const [filePath, setFilePath] = useState("");
  const [loading, setLoading] = useState(false);
  const [inspectResult, setInspectResult] = useState<any>(null);
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<any>(null);
  const lastUploadedFileRef = useRef<File | null>(null);

  const handleInspectUploadedFile = async (file: File) => {
    lastUploadedFileRef.current = file;
    setFilePath(file.name);
    setLoading(true);
    setMessage(null);
    try {
      const data = await inspectDroppedDesignFile(file, {
        autoActivate: false,
      });
      if (data.success) {
        setInspectResult(data);
        if (!data.fonts || data.fonts.length === 0) {
          setMessage({
            type: "info",
            text: isRtl
              ? "لم يتم العثور على خطوط مستخدمة في هذا الملف."
              : "No fonts detected in this file.",
          });
        }
      } else {
        setMessage({
          type: "error",
          text: data.error || (isRtl ? "فشل فحص الملف" : "Inspection failed"),
        });
      }
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "Inspection failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleInspect = async (pathToInspect = filePath) => {
    if (!pathToInspect || !pathToInspect.trim()) return;
    lastUploadedFileRef.current = null;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/inspect-design-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: pathToInspect.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setInspectResult(data);
        if (data.fonts.length === 0) {
          setMessage({
            type: "info",
            text: isRtl
              ? "لم يتم العثور على خطوط مستخدمة في هذا الملف."
              : "No fonts detected in this file.",
          });
        }
      } else {
        setMessage({
          type: "error",
          text: data.error || (isRtl ? "فشل فحص الملف" : "Inspection failed"),
        });
      }
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "Inspection failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      handleInspectUploadedFile(file);
    }
  };

  const handleDragOver = (e: any) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      handleInspectUploadedFile(file);
    }
  };

  const handleActivateAll = async () => {
    if (!inspectResult || !inspectResult.fonts) return;
    const available = inspectResult.fonts.filter(
      (f: any) => f.available && f.id !== undefined && f.id !== null,
    );
    if (available.length === 0) return;

    setActivating(true);
    try {
      const res = await fetch("/api/activate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: available.map((f: any) => f.id) }),
      });
      const data = await res.json();
      const count = data.activatedCount ?? available.length;
      if (data.success) {
        setMessage({
          type: "success",
          text: isRtl
            ? `تم تفعيل ${count} خطاً بنجاح في الذاكرة (RAM)!`
            : `Activated ${count} fonts successfully in RAM!`,
        });
        if (onRefreshStats) onRefreshStats();
        if (lastUploadedFileRef.current) {
          await handleInspectUploadedFile(lastUploadedFileRef.current);
        } else {
          await handleInspect(filePath);
        }
      } else {
        setMessage({
          type: "error",
          text:
            data.error || (isRtl ? "فشل تفعيل الخطوط" : "Activation failed"),
        });
      }
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "Activation failed" });
    } finally {
      setActivating(false);
    }
  };

  const totalCount = inspectResult?.fonts?.length || 0;
  const availableList = inspectResult?.fonts?.filter((f) => f.available) || [];
  const missingList = inspectResult?.fonts?.filter((f) => !f.available) || [];
  const activeCount =
    inspectResult?.fonts?.filter((f) => f.isActive)?.length || 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 select-none animate-in fade-in duration-150"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="w-full max-w-3xl max-h-[85vh] bg-[var(--color-back-card)] rounded-2xl border border-[var(--color-border)] shadow-2xl flex flex-col overflow-hidden text-[var(--color-text-main)]">
        {/* Header */}
        <div className="p-4 px-6 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-back-header)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-action)]/15 border border-[var(--color-action)]/30 flex items-center justify-center text-[var(--color-action)]">
              <FileSearch className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--color-text-header)]">
                {isRtl
                  ? "فاحص ملفات التصميم (Design Inspector)"
                  : "Design File Inspector"}
              </h2>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {isRtl
                  ? "استخرج جميع الخطوط المستخدمة في تصاميم PSD / AI / INDD وفعلها بضغطة زر"
                  : "Extract fonts used in PSD / AI / INDD / PDF and activate them in one click"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-[var(--color-back-main)]">
          {/* Drag & Drop Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
              isDragging
                ? "border-[var(--color-action)] bg-[var(--color-action)]/10 scale-[1.01]"
                : "border-[var(--color-border)] bg-[var(--color-back-card)] hover:border-[var(--color-action)]/50"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".psd,.ai,.indd,.pdf"
              className="hidden"
            />
            <UploadCloud className="w-8 h-8 mx-auto text-[var(--color-action)] mb-2" />
            <p className="text-xs font-semibold text-[var(--color-text-header)]">
              {isRtl
                ? "اسحب وأفلت ملف التصميم هنا، أو انقر للاستعراض من جهازك"
                : "Drag & drop design file here, or click to browse"}
            </p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
              Photoshop (.psd), Illustrator (.ai), InDesign (.indd), PDF
            </p>
          </div>

          {/* Manual Path Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--color-text-header)] block">
              {isRtl
                ? "أو أدخل مسار الملف يدوياً:"
                : "Or enter file path manually:"}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder={
                  isRtl
                    ? "أدخل المسار الكامل لملف التصميم..."
                    : "Enter full path to design file..."
                }
                value={filePath}
                onChange={(e: any) => setFilePath(e.target.value)}
                onKeyDown={(e: any) => e.key === "Enter" && handleInspect()}
                className="flex-1 bg-[var(--color-control)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-action)]"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-main)] text-xs transition flex items-center gap-1.5 shrink-0 border border-[var(--color-border)] cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>{isRtl ? "استعراض" : "Browse"}</span>
              </button>
              <button
                onClick={() => handleInspect()}
                disabled={loading || !filePath.trim()}
                className="px-4 py-2 rounded-xl bg-[var(--color-action)] hover:opacity-90 text-white font-bold text-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSearch className="w-3.5 h-3.5" />
                )}
                <span>{isRtl ? "فحص" : "Inspect"}</span>
              </button>
            </div>
          </div>

          {/* Feedback Message */}
          {message && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
                message.type === "success"
                  ? "bg-[var(--color-green)]/10 border-[var(--color-green)]/20 text-[var(--color-green)]"
                  : "bg-rose-500/10 border-rose-500/20 text-rose-400"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Inspection Results */}
          {inspectResult && (
            <div className="space-y-4">
              {/* Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-[var(--color-back-card)] rounded-xl border border-[var(--color-border)] text-center">
                  <div className="text-[10px] text-[var(--color-text-muted)]">
                    {isRtl ? "إجمالي الخطوط" : "Total Fonts"}
                  </div>
                  <div className="text-base font-bold text-[var(--color-text-header)] mt-0.5">
                    {totalCount}
                  </div>
                </div>
                <div className="p-3 bg-[var(--color-back-card)] rounded-xl border border-[var(--color-border)] text-center">
                  <div className="text-[10px] text-[var(--color-text-muted)]">
                    {isRtl ? "متوفر بالمكتبة" : "Available"}
                  </div>
                  <div className="text-base font-bold text-[var(--color-green)] mt-0.5">
                    {availableList.length}
                  </div>
                </div>
                <div className="p-3 bg-[var(--color-back-card)] rounded-xl border border-[var(--color-border)] text-center">
                  <div className="text-[10px] text-[var(--color-text-muted)]">
                    {isRtl ? "مفعل حالياً" : "Active"}
                  </div>
                  <div className="text-base font-bold text-[var(--color-text-header)] mt-0.5">
                    {activeCount}
                  </div>
                </div>
                <div className="p-3 bg-[var(--color-back-card)] rounded-xl border border-[var(--color-border)] text-center">
                  <div className="text-[10px] text-[var(--color-text-muted)]">
                    {isRtl ? "غير متوفر" : "Missing"}
                  </div>
                  <div className="text-base font-bold text-rose-400 mt-0.5">
                    {missingList.length}
                  </div>
                </div>
              </div>

              {/* Batch Actions */}
              {availableList.length > 0 && (
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleActivateAll}
                    disabled={activating}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-[var(--color-green)] hover:opacity-90 text-zinc-950 font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>
                      {isRtl
                        ? `تفعيل جميع خطوط التصميم في الرام (${availableList.length})`
                        : `Activate All Design Fonts in RAM (${availableList.length})`}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
