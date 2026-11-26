import React, { useState } from "react";
import {
  Zap,
  Download,
  FolderPlus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Layers,
  Flame,
  Database,
} from "lucide-react";

export default function BatchLibraryModal({
  isOpen,
  onClose,
  stats,
  fonts = [],
  onRefresh,
  t = {},
  isRtl = false,
}: any) {
  const [loadingAction, setLoadingAction] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState<any>(null);
  const [customFolderPath, setCustomFolderPath] = useState("");

  const customFolders = React.useMemo(() => {
    const map = new Map<
      string,
      { path: string; name: string; total: number; active: number }
    >();
    for (const f of fonts || []) {
      const src = String(f.source || "").toLowerCase();
      const p = String(f.path || "");
      if (
        !p ||
        src === "system" ||
        p.startsWith("cloud://") ||
        p.startsWith("http://") ||
        p.startsWith("https://")
      ) {
        continue;
      }
      const normPath = p.replace(/\//g, "\\");
      const lastSep = normPath.lastIndexOf("\\");
      if (lastSep <= 0) continue;
      const dirPath = normPath.slice(0, lastSep);
      const dirName = dirPath.slice(dirPath.lastIndexOf("\\") + 1) || dirPath;
      const existing = map.get(dirPath) || {
        path: dirPath,
        name: dirName,
        total: 0,
        active: 0,
      };
      existing.total += 1;
      if (f.isActive || f.active) {
        existing.active += 1;
      }
      map.set(dirPath, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [fonts]);

  if (!isOpen) return null;

  const handleBatchOperation = async (actionType, endpoint, payload = {}) => {
    setLoadingAction(actionType);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success !== false) {
        setStatusMessage({
          type: "success",
          text:
            data.message ||
            (isRtl
              ? `تمت العملية بنجاح! (${data.count || ""})`
              : `Operation succeeded! (${data.count || ""})`),
        });
        if (onRefresh) onRefresh();
      } else {
        setStatusMessage({
          type: "error",
          text:
            data.error ||
            (isRtl
              ? "حدث خطأ أثناء تنفيذ العملية"
              : "Error executing operation"),
        });
      }
    } catch (e) {
      setStatusMessage({ type: "error", text: e.message });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleBrowseFolder = async () => {
    setLoadingAction("browse");
    setStatusMessage(null);
    try {
      const res = await fetch("/api/dialog/pick-folder", { method: "POST" });
      const data = await res.json();
      if (data && data.path) {
        setCustomFolderPath(data.path);
        const dupCount = Number(data.skippedDuplicatesCount || 0);
        const firstDupPath = data.duplicates?.[0]?.existingPath
          ? ` (${data.duplicates[0].fileName} -> ${data.duplicates[0].existingPath})`
          : "";
        setStatusMessage({
          type:
            dupCount > 0 && (data.importedCount || 0) === 0
              ? "info"
              : "success",
          text: isRtl
            ? dupCount > 0
              ? `تم استيراد ${data.importedCount || 0} خطاً من ${data.folderName} وتجاهل ${dupCount} مكرراً${firstDupPath}`
              : `تم تصفح واستيراد ${data.importedCount || 0} خطاً بنجاح من مجلد: ${data.folderName}`
            : dupCount > 0
              ? `Imported ${data.importedCount || 0} fonts from ${data.folderName}; skipped ${dupCount} duplicates${firstDupPath}`
              : `Successfully imported ${data.importedCount || 0} fonts from: ${data.folderName}`,
        });
        if (onRefresh) onRefresh();
      }
    } catch (e) {
      setStatusMessage({ type: "error", text: e.message });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleImportFolder = async () => {
    if (!customFolderPath.trim()) return;
    setLoadingAction("import");
    setStatusMessage(null);
    try {
      const res = await fetch("/api/import-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath: customFolderPath.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        const dupCount = Number(data.skippedDuplicatesCount || 0);
        const firstDupPath = data.duplicates?.[0]?.existingPath
          ? ` (${data.duplicates[0].fileName} -> ${data.duplicates[0].existingPath})`
          : "";
        setStatusMessage({
          type:
            dupCount > 0 && (data.importedCount || 0) === 0
              ? "info"
              : "success",
          text: isRtl
            ? dupCount > 0
              ? `تم استيراد ${data.importedCount || 0} خطاً وتجاهل ${dupCount} خطوط مكررة موجودة مسبقاً${firstDupPath}`
              : `تم استيراد ${data.importedCount || 0} خطاً جديداً بنجاح!`
            : dupCount > 0
              ? `Imported ${data.importedCount || 0} fonts and skipped ${dupCount} duplicates${firstDupPath}`
              : `Successfully imported ${data.importedCount || 0} new fonts and watching folder!`,
        });
        setCustomFolderPath("");
        if (onRefresh) onRefresh();
      } else {
        setStatusMessage({
          type: "error",
          text:
            data.error ||
            (isRtl ? "فشل استيراد المجلد" : "Failed to import folder"),
        });
      }
    } catch (e) {
      setStatusMessage({ type: "error", text: e.message });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 select-none animate-in fade-in duration-150"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="w-full max-w-2xl max-h-[90vh] bg-[var(--color-back-card)] rounded-2xl border border-[var(--color-border)] shadow-2xl flex flex-col overflow-hidden text-[var(--color-text-main)]">
        {/* Header */}
        <div className="p-4 px-6 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-back-side)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-action)]/15 border border-[var(--color-action)]/30 flex items-center justify-center text-[var(--color-action)] shadow-sm shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--color-text-header)]">
                {isRtl
                  ? "إدارة وتفعيل مكتبة الـ 10,939 خطاً الشاملة"
                  : "10,939 Fonts Master Library Manager"}
              </h2>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {isRtl
                  ? "التحكم اللحظي الكامل في تفعيل وتثبيت واستيراد الخطوط بضغطة زر واحدة"
                  : "Real-time master control for font activation, system installation, and custom folders"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-[var(--color-back-main)]">
          {/* Quick Stats overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-[var(--color-back-card)] rounded-xl border border-[var(--color-border)] text-center shadow-xs">
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium">
                {isRtl ? "إجمالي المكتبة" : "Total Library"}
              </span>
              <div className="text-lg font-extrabold text-[var(--color-text-header)] mt-0.5">
                {(stats?.total ?? 10939).toLocaleString()}
              </div>
            </div>
            <div className="p-3 bg-[var(--color-back-card)] rounded-xl border border-[var(--color-border)] text-center shadow-xs">
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium">
                {isRtl ? "خطوط عربية وشرقية" : "Arabic-Script Fonts"}
              </span>
              <div className="text-lg font-extrabold text-[var(--color-action)] mt-0.5">
                {(stats?.arabicCount ?? 3853).toLocaleString()}
              </div>
            </div>
            <div className="p-3 bg-[var(--color-back-card)] rounded-xl border border-[var(--color-border)] text-center shadow-xs">
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium">
                {isRtl ? "خطوط لاتينية" : "Latin Fonts"}
              </span>
              <div className="text-lg font-extrabold text-[var(--color-text-header)] mt-0.5">
                {(stats?.latinCount ?? 7086).toLocaleString()}
              </div>
            </div>
            <div className="p-3 bg-[var(--color-back-card)] rounded-xl border border-[var(--color-border)] text-center shadow-xs">
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium">
                {isRtl ? "مفعل حالياً" : "Active Fonts"}
              </span>
              <div className="text-lg font-extrabold text-[var(--color-text-header)] mt-0.5">
                {stats?.active || 0}
              </div>
            </div>
          </div>

          {/* Master 1-Click Operations */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-[var(--color-action)]" />
              <span>
                {isRtl
                  ? "عمليات التفعيل والتثبيت الكلية:"
                  : "Master Batch Operations:"}
              </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Activate All in RAM */}
              <button
                onClick={() =>
                  handleBatchOperation("activateAll", "/activate-all-library")
                }
                disabled={loadingAction}
                className="p-4 rounded-2xl bg-[var(--color-back-card)] hover:bg-[var(--color-back-card-hover)] border border-[var(--color-border)] hover:border-[var(--color-action)] text-left rtl:text-right transition flex items-start gap-3.5 group cursor-pointer shadow-xs"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--color-action)]/15 border border-[var(--color-action)]/30 flex items-center justify-center text-[var(--color-action)] font-bold shrink-0 shadow-xs group-hover:scale-105 transition">
                  {loadingAction === "activateAll" ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-5 h-5 fill-current" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-[var(--color-text-header)] group-hover:text-[var(--color-action)] transition">
                    {isRtl
                      ? "تفعيل كافة الخطوط في الرام"
                      : "Activate All Fonts in RAM"}
                  </h4>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-relaxed">
                    {isRtl
                      ? "تفعيل فوري في الذاكرة دون تعديل النظام (يستثني خطوط ويندوز المثبتة)، وتفريغ تلقائي عند الإغلاق"
                      : "Instant session activation in memory (skips OS-installed fonts), auto-cleans on exit"}
                  </p>
                </div>
              </button>

              {/* Install All Permanent */}
              <button
                onClick={() =>
                  handleBatchOperation("installAll", "/install-all-library")
                }
                disabled={loadingAction}
                className="p-4 rounded-2xl bg-[var(--color-back-card)] hover:bg-[var(--color-back-card-hover)] border border-[var(--color-border)] hover:border-[var(--color-action)] text-left rtl:text-right transition flex items-start gap-3.5 group cursor-pointer shadow-xs"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--color-control)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-header)] font-bold shrink-0 shadow-xs group-hover:scale-105 transition">
                  {loadingAction === "installAll" ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-[var(--color-text-header)] group-hover:text-[var(--color-action)] transition">
                    {isRtl ? "تثبيت دائم في ويندوز" : "Install All to Windows"}
                  </h4>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-relaxed">
                    {isRtl
                      ? "نسخ وتثبيت دائم في مجلد خطوط ويندوز ليعمل مع كل البرامج حتى بعد إعادة التشغيل"
                      : "Permanent installation into Windows fonts for availability even after reboot"}
                  </p>
                </div>
              </button>
            </div>

            {/* Category Quick Activations */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
              <button
                onClick={() =>
                  handleBatchOperation("activateArabic", "/activate-category", {
                    category: "Arabic",
                  })
                }
                disabled={loadingAction}
                className="h-9 px-3 rounded-xl bg-[var(--color-back-card)] hover:bg-[var(--color-back-card-hover)] border border-[var(--color-border)] text-xs text-[var(--color-text-header)] font-semibold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                <Layers className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
                <span>
                  {isRtl
                    ? `تفعيل العربية (${(stats?.arabicCount ?? 3853).toLocaleString()})`
                    : `Activate Arabic (${(stats?.arabicCount ?? 3853).toLocaleString()})`}
                </span>
              </button>

              <button
                onClick={() =>
                  handleBatchOperation(
                    "activateEnglish",
                    "/activate-category",
                    { category: "English" },
                  )
                }
                disabled={loadingAction}
                className="h-9 px-3 rounded-xl bg-[var(--color-back-card)] hover:bg-[var(--color-back-card-hover)] border border-[var(--color-border)] text-xs text-[var(--color-text-header)] font-semibold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                <Layers className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
                <span>
                  {isRtl
                    ? `تفعيل اللاتينية (${(stats?.latinCount ?? 7086).toLocaleString()})`
                    : `Activate Latin (${(stats?.latinCount ?? 7086).toLocaleString()})`}
                </span>
              </button>

              <button
                onClick={() =>
                  handleBatchOperation("deactivateAll", "/deactivate-all")
                }
                disabled={loadingAction}
                className="h-9 px-3 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-xs text-[var(--color-text-header)] font-semibold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
                <span>{isRtl ? "إلغاء تفعيل الكل" : "Deactivate All"}</span>
              </button>
            </div>
          </div>

          {/* Imported Local Folders 1-Click Control */}
          {customFolders.length > 0 && (
            <div className="space-y-3 border-t border-[var(--color-border)] pt-5">
              <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[var(--color-action)]" />
                <span>
                  {isRtl
                    ? `المجلدات المحلية المضافة (${customFolders.length}):`
                    : `Imported Local Folders (${customFolders.length}):`}
                </span>
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {customFolders.map((folder) => {
                  const isFolderAllActive = folder.active >= folder.total;
                  return (
                    <div
                      key={folder.path}
                      className="p-3 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--color-text-header)] truncate">
                            {folder.name}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-control)] text-[var(--color-text-muted)] shrink-0">
                            {folder.active}/{folder.total}
                          </span>
                        </div>
                        <p
                          className="text-[10px] text-[var(--color-text-muted)] font-mono truncate mt-0.5"
                          title={folder.path}
                        >
                          {folder.path}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() =>
                            handleBatchOperation(
                              `activate-folder-${folder.path}`,
                              "/activate-batch",
                              { folder: folder.path },
                            )
                          }
                          disabled={Boolean(loadingAction) || isFolderAllActive}
                          className="h-7 px-2.5 rounded-lg bg-[var(--color-action)]/15 hover:bg-[var(--color-action)]/25 disabled:opacity-45 text-[var(--color-action)] border border-[var(--color-action)]/30 text-[11px] font-bold transition cursor-pointer whitespace-nowrap"
                        >
                          {isRtl ? "تفعيل المجلد في الرام" : "Activate Folder"}
                        </button>
                        <button
                          onClick={() =>
                            handleBatchOperation(
                              `deactivate-folder-${folder.path}`,
                              "/deactivate-batch",
                              { folder: folder.path },
                            )
                          }
                          disabled={
                            Boolean(loadingAction) || folder.active === 0
                          }
                          className="h-7 px-2.5 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] disabled:opacity-45 text-[var(--color-text-header)] border border-[var(--color-border)] text-[11px] font-semibold transition cursor-pointer whitespace-nowrap"
                        >
                          {isRtl ? "إلغاء التفعيل" : "Deactivate"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Import Custom External Folder */}
          <div className="space-y-3 border-t border-[var(--color-border)] pt-5">
            <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
              <FolderPlus className="w-3.5 h-3.5 text-[var(--color-action)]" />
              <span>
                {isRtl
                  ? "استيراد مجلد خطوط خارجي:"
                  : "Import Custom Font Folder:"}
              </span>
            </h3>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              {isRtl
                ? "أدخل مسار أي مجلد خطوط على جهازك لدمجه فوراً مع مكتبة Fontivo ومراقبته تلقائياً:"
                : "Choose any font folder on your drive to instantly index and watch automatically:"}
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                placeholder={
                  isRtl
                    ? "أدخل المسار أو اضغط زر التصفح..."
                    : "Enter folder path or click browse..."
                }
                value={customFolderPath}
                onChange={(e: any) => setCustomFolderPath(e.target.value)}
                className="flex-1 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-xl px-3.5 py-2 text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-action)] shadow-xs"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleBrowseFolder}
                  disabled={loadingAction === "browse"}
                  className="px-3.5 py-2 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {loadingAction === "browse" ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FolderPlus className="w-3.5 h-3.5" />
                  )}
                  <span>{isRtl ? "تصفح المجلد..." : "Browse..."}</span>
                </button>
                <button
                  onClick={handleImportFolder}
                  disabled={loadingAction || !customFolderPath.trim()}
                  className="px-4 py-2 rounded-xl bg-[var(--color-action)] hover:opacity-90 disabled:opacity-50 text-white font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-[var(--color-action)]/20"
                >
                  {loadingAction === "import" ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FolderPlus className="w-3.5 h-3.5" />
                  )}
                  <span>{isRtl ? "استيراد" : "Import"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Status Feedback */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                statusMessage.type === "success"
                  ? "bg-[var(--color-green)]/15 border-[var(--color-green)]/30 text-[var(--color-green)]"
                  : "bg-rose-500/15 border-rose-500/30 text-rose-500"
              }`}
            >
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
