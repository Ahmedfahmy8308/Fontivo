import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  Zap,
  FolderSearch,
  HardDrive,
  FilePlus2,
  Trash2,
  Cloud,
} from "lucide-react";
import {
  LiveOperationItem,
  getLiveOperations,
  upsertLiveOperation,
  clearCompletedOperations,
  removeLiveOperation,
  isOperationDismissed,
  formatTransferMb,
  formatTransferSpeed,
  OPERATIONS_EVENT,
  OPEN_CENTER_EVENT,
} from "../../utils/operationsBus";
import { safeFetchJson } from "../../utils/safeFetch";

export interface OperationsCenterProps {
  isOpen?: boolean;
  onToggleOpen?: (open: boolean) => void;
  isRtl?: boolean;
  t?: Record<string, string>;
}

export default function OperationsCenter({
  isOpen: externalIsOpen,
  onToggleOpen,
  isRtl = false,
  t = {},
}: OperationsCenterProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [operations, setOperations] = useState<LiveOperationItem[]>(() =>
    getLiveOperations(),
  );

  const isExpanded =
    externalIsOpen !== undefined ? externalIsOpen : internalOpen;

  const setExpanded = useCallback(
    (val: boolean) => {
      setInternalOpen(val);
      if (val) setIsMinimized(false);
      if (onToggleOpen) onToggleOpen(val);
    },
    [onToggleOpen],
  );

  // Sync with client-side operations bus
  useEffect(() => {
    const handleOpsUpdate = (e: Event) => {
      const custom = e as CustomEvent<LiveOperationItem[]>;
      const list = custom.detail || getLiveOperations();
      setOperations([...list]);
      const hasRunning = list.some(
        (op) => op.status === "running" || op.status === "queued",
      );
      if (hasRunning) {
        setInternalOpen(true);
      }
    };

    const handleOpenCenter = () => {
      setExpanded(true);
      setIsMinimized(false);
    };

    if (typeof window !== "undefined") {
      window.addEventListener(OPERATIONS_EVENT, handleOpsUpdate);
      window.addEventListener(OPEN_CENTER_EVENT, handleOpenCenter);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(OPERATIONS_EVENT, handleOpsUpdate);
        window.removeEventListener(OPEN_CENTER_EVENT, handleOpenCenter);
      }
    };
  }, [setExpanded]);

  // Poll backend /api/system/operations and /api/catalog/download-status safely
  const syncBackendOperations = useCallback(async () => {
    const [sysOps, dlStatus] = await Promise.all([
      safeFetchJson<any>("/api/system/operations", { timeoutMs: 3500 }),
      safeFetchJson<any>("/api/catalog/download-status", { timeoutMs: 3500 }),
    ]);

    if (sysOps) {
      const list = Array.isArray(sysOps)
        ? sysOps
        : sysOps.operations || sysOps.jobs || [];
      if (Array.isArray(list)) {
        list.forEach((op: any) => {
          if (!op || !op.id) return;
          const opId = String(op.id);
          const normStatus = String(op.status || "").toLowerCase();
          const normPhase = String(op.phase || "").toLowerCase();
          const mappedStatus =
            normStatus === "completed" || normPhase === "completed"
              ? "completed"
              : normStatus === "failed" ||
                  normStatus === "cancelled" ||
                  normPhase === "failed" ||
                  normPhase === "cancelled"
                ? "failed"
                : normStatus === "queued" || normPhase === "queued"
                  ? "queued"
                  : "running";

          if (
            (mappedStatus === "completed" || mappedStatus === "failed") &&
            isOperationDismissed(opId)
          ) {
            return;
          }

          upsertLiveOperation({
            id: opId,
            title: op.title || op.name || "System Operation",
            titleAr: op.titleAr || op.title || op.name || "عملية النظام",
            category: op.category || "system",
            status: mappedStatus,
            progressPercent: op.progressPercent ?? op.progress ?? 0,
            stepLabel: op.stepLabel || op.phase || op.message,
            stepLabelAr: op.stepLabelAr || op.stepLabel || op.phase,
            bytesDone: op.bytesDownloaded ?? op.bytesDone,
            bytesTotal: op.totalBytes ?? op.bytesTotal,
            itemsDone: op.itemsDone ?? op.extractedCount,
            itemsTotal: op.itemsTotal ?? op.totalItems,
            speedBps: op.speedBps,
            error: op.error,
          });
        });
      }
    }

    if (dlStatus) {
      const jobs = Array.isArray(dlStatus)
        ? dlStatus
        : dlStatus.jobs || dlStatus.downloads || [];
      if (Array.isArray(jobs)) {
        jobs.forEach((job: any) => {
          const id = job.jobId || job.packId || job.id;
          if (!id) return;
          const normPhase = String(job.phase || "").toLowerCase();
          const normStatus = String(job.status || "").toLowerCase();
          const mappedStatus =
            normPhase === "completed" || normStatus === "completed"
              ? "completed"
              : normPhase === "failed" ||
                  normPhase === "cancelled" ||
                  normStatus === "failed"
                ? "failed"
                : normPhase === "queued" || normStatus === "queued"
                  ? "queued"
                  : "running";
          const dlId = `dl-${id}`;
          if (
            (mappedStatus === "completed" || mappedStatus === "failed") &&
            isOperationDismissed(dlId)
          ) {
            return;
          }

          const stepAr =
            normPhase === "queued"
              ? "في قائمة الانتظار..."
              : normPhase === "verifying"
                ? "جاري التحقق من السلامة..."
                : normPhase === "extracting"
                  ? "جاري فك الضغط..."
                  : normPhase === "indexing"
                    ? "جاري الفهرسة..."
                    : normPhase === "completed"
                      ? "اكتمل التحميل"
                      : normPhase === "failed"
                        ? "فشل التحميل"
                        : normPhase === "cancelled"
                          ? "تم الإلغاء"
                          : "جاري التحميل...";

          const stepEn =
            normPhase === "queued"
              ? "Queued..."
              : normPhase === "verifying"
                ? "Verifying SHA-256..."
                : normPhase === "extracting"
                  ? "Extracting fonts..."
                  : normPhase === "indexing"
                    ? "Indexing library..."
                    : normPhase === "completed"
                      ? "Completed"
                      : normPhase === "failed"
                        ? "Download failed"
                        : normPhase === "cancelled"
                          ? "Cancelled"
                          : "Downloading...";

          upsertLiveOperation({
            id: `dl-${id}`,
            title:
              job.title || job.packName || `Font Pack (${job.packId || id})`,
            titleAr:
              job.titleAr ||
              (job.packName
                ? `${job.packName} (${job.packId || id})`
                : `تحميل حزمة خطوط (${job.packId || id})`),
            category: "download",
            status: mappedStatus,
            progressPercent: job.progressPercent ?? job.progress ?? 0,
            stepLabel: stepEn,
            stepLabelAr: stepAr,
            bytesDone: job.bytesDownloaded,
            bytesTotal: job.totalBytes,
            itemsDone: job.indexedCount || job.extractedCount,
            itemsTotal: job.totalFonts,
            speedBps: job.speedBps,
            error: job.error,
          });
        });
      }
    }
  }, []);

  const runningOps = operations.filter(
    (op) => op.status === "running" || op.status === "queued",
  );
  const completedOps = operations.filter(
    (op) => op.status === "completed" || op.status === "failed",
  );

  const handleClearCompleted = useCallback(() => {
    clearCompletedOperations();
    if (typeof fetch === "function") {
      fetch("/api/system/operations/clear", { method: "POST" }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!isExpanded && runningOps.length === 0) return;
    syncBackendOperations();
    const timer = setInterval(syncBackendOperations, 2500);
    return () => clearInterval(timer);
  }, [isExpanded, runningOps.length, syncBackendOperations]);

  const getCategoryIcon = (category: LiveOperationItem["category"]) => {
    switch (category) {
      case "download":
      case "google-font":
        return <Cloud className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
      case "ram-optimize":
        return <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case "windows-restore":
        return <HardDrive className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case "workspace-scan":
        return <FolderSearch className="w-3.5 h-3.5 text-[#B7A1D9] shrink-0" />;
      case "custom-import":
        return (
          <FilePlus2 className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
        );
      default:
        return (
          <Activity className="w-3.5 h-3.5 text-[var(--color-action)] shrink-0" />
        );
    }
  };

  // Overall progress across running items
  const overallProgress =
    runningOps.length > 0
      ? Math.round(
          runningOps.reduce(
            (acc, item) => acc + (item.progressPercent || 0),
            0,
          ) / runningOps.length,
        )
      : operations.length > 0
        ? 100
        : 0;

  if (!isExpanded && operations.length === 0) {
    return null;
  }

  // Minimized floating status pill in bottom corner
  if (isMinimized || (!isExpanded && operations.length > 0)) {
    return (
      <div
        className={`fixed bottom-4 ${isRtl ? "left-4" : "right-4"} z-40 select-none animate-in fade-in slide-in-from-bottom-2`}
        dir={isRtl ? "rtl" : "ltr"}
      >
        <button
          onClick={() => {
            setIsMinimized(false);
            setExpanded(true);
          }}
          className="flex items-center gap-2.5 h-9 px-3.5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] hover:border-[var(--color-action)] shadow-xl text-xs text-[var(--color-text-header)] transition cursor-pointer whitespace-nowrap shrink-0"
          title={
            isRtl
              ? "فتح نافذة العمليات والتحميل الحية"
              : "Open Live Operations & Downloads Center"
          }
        >
          {runningOps.length > 0 ? (
            <RefreshCw className="w-3.5 h-3.5 text-[var(--color-action)] animate-spin shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-green)] shrink-0" />
          )}
          <span className="font-bold">
            {runningOps.length > 0
              ? isRtl
                ? `جاري تنفيذ ${runningOps.length} عمليات (${overallProgress}%)`
                : `${runningOps.length} Active Operations (${overallProgress}%)`
              : isRtl
                ? `اكتملت العمليات (${completedOps.length})`
                : `Operations Completed (${completedOps.length})`}
          </span>
          <ChevronUp className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`fixed bottom-4 ${isRtl ? "left-4" : "right-4"} z-50 w-88 sm:w-96 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] shadow-2xl overflow-hidden select-none animate-in fade-in slide-in-from-bottom-3`}
      dir={isRtl ? "rtl" : "ltr"}
      data-testid="operations-center"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-[var(--color-back-header)] border-b border-[var(--color-border)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {runningOps.length > 0 ? (
            <RefreshCw className="w-4 h-4 text-[var(--color-action)] animate-spin shrink-0" />
          ) : (
            <Activity className="w-4 h-4 text-[var(--color-action)] shrink-0" />
          )}
          <div>
            <h4 className="text-xs font-bold text-[var(--color-text-header)]">
              {isRtl
                ? "نافذة العمليات والتحميل الحية"
                : "Live Operations & Downloads"}
            </h4>
            <p className="text-[10px] text-[var(--color-text-muted)] font-mono">
              {runningOps.length > 0
                ? isRtl
                  ? `${runningOps.length} قيد التنفيذ • ${overallProgress}%`
                  : `${runningOps.length} running • ${overallProgress}%`
                : isRtl
                  ? "جميع المهام جاهزة ومستقرة"
                  : "All background tasks idle"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {completedOps.length > 0 && (
            <button
              onClick={handleClearCompleted}
              data-testid="operations-clear-btn"
              className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
              title={isRtl ? "مسح العمليات المكتملة" : "Clear completed"}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
            title={isRtl ? "تصغير" : "Minimize"}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer"
            title={isRtl ? "إغلاق" : "Close"}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Operations List */}
      <div className="max-h-72 overflow-y-auto divide-y divide-[var(--color-border-subtle)] p-2.5 space-y-2">
        {operations.length === 0 ? (
          <div className="py-8 text-center space-y-1.5 text-xs text-[var(--color-text-muted)]">
            <Download className="w-6 h-6 mx-auto text-[var(--color-text-dim)] opacity-60" />
            <div className="font-semibold text-[var(--color-text-header)]">
              {isRtl ? "لا توجد عمليات نشطة حالياً" : "No Active Operations"}
            </div>
            <p className="text-[11px] text-[var(--color-text-dim)] max-w-xs mx-auto">
              {isRtl
                ? "ستظهر هنا حالة تحميل الخطوط، تحسين الرام، وفحص ملفات التصميم خطوة بخطوة."
                : "Font downloads, RAM optimizations, and folder scans appear here with real-time progress."}
            </p>
          </div>
        ) : (
          operations.map((op) => {
            const title = isRtl ? op.titleAr || op.title : op.title;
            const step = isRtl ? op.stepLabelAr || op.stepLabel : op.stepLabel;
            const speedText = formatTransferSpeed(op.speedBps);
            const hasBytes =
              typeof op.bytesTotal === "number" && op.bytesTotal > 0;
            const hasItems =
              typeof op.itemsTotal === "number" && op.itemsTotal > 0;

            return (
              <div
                key={op.id}
                className="p-2.5 rounded-xl bg-[var(--color-back-main)]/70 border border-[var(--color-border-subtle)] space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {getCategoryIcon(op.category)}
                    <span className="text-xs font-bold text-[var(--color-text-header)] truncate">
                      {title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono font-bold text-[var(--color-action)]">
                      {op.progressPercent}%
                    </span>
                    {op.status === "completed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-green)]" />
                    ) : op.status === "failed" ? (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <RefreshCw className="w-3 h-3 text-[var(--color-action)] animate-spin" />
                    )}
                    <button
                      onClick={() => removeLiveOperation(op.id)}
                      className="text-[var(--color-text-dim)] hover:text-[var(--color-text-header)] p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-[var(--color-control)] rounded-full overflow-hidden fontivo-progress-track">
                  <div
                    className={`h-full transition-all duration-300 ${
                      op.status === "failed"
                        ? "bg-rose-500"
                        : op.status === "completed"
                          ? "bg-[var(--color-green)]"
                          : "bg-[var(--color-action)] fontivo-progress-fill"
                    }`}
                    style={{ width: `${op.progressPercent}%` }}
                  />
                </div>

                {/* Meta Row: Step Status, MB / Total MB, Items / Total Items, Speed */}
                <div className="flex items-center justify-between text-[10px] font-mono text-[var(--color-text-muted)] gap-2">
                  <span
                    className="truncate max-w-[165px]"
                    title={op.error || step || ""}
                  >
                    {op.error
                      ? op.error
                      : step ||
                        (op.status === "completed"
                          ? isRtl
                            ? "مكتمل ✓"
                            : "Completed ✓"
                          : isRtl
                            ? "جاري المعالجة..."
                            : "Processing...")}
                  </span>
                  <div className="flex items-center gap-2 shrink-0" dir="ltr">
                    {hasBytes && (
                      <span>
                        {formatTransferMb(op.bytesDone)} /{" "}
                        {formatTransferMb(op.bytesTotal)}
                      </span>
                    )}
                    {!hasBytes && hasItems && (
                      <span>
                        {op.itemsDone || 0} / {op.itemsTotal}{" "}
                        {isRtl ? "عنصر" : "items"}
                      </span>
                    )}
                    {speedText && (
                      <span className="text-emerald-400">{speedText}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
