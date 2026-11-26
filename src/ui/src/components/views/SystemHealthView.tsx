import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  ShieldCheck,
  Trash2,
  RefreshCw,
  Zap,
  HardDrive,
  RotateCcw,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Play,
  Pause,
  Monitor,
  Gauge,
  Clock,
} from "lucide-react";
import { ConfirmDialog } from "../common";
import { ProcessResourceInfo, RamData } from "../../types/system";
import { safeFetchJson } from "../../utils/safeFetch";
import { upsertLiveOperation } from "../../utils/operationsBus";

export const RAM_POLL_INTERVAL_MS = 2000;

export function formatMbToGb(mb?: number | null): string {
  if (mb == null || !Number.isFinite(mb) || mb <= 0) return "—";
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function filterFontivoRamFonts(fonts: any[]): any[] {
  if (!Array.isArray(fonts)) return [];
  return fonts.filter((f) => {
    if (!f) return false;
    const src = String(f.source ?? f.provider ?? "").toLowerCase();
    if (src === "system" || f.isSystem === true || f.is_system === true) {
      return false;
    }
    return true;
  });
}

export function normalizeRamOptimizeResult(data: any) {
  const beforeMb = Number(data?.beforeMb ?? data?.before_mb ?? 0);
  const afterMb = Number(data?.afterMb ?? data?.after_mb ?? 0);
  const freedMb = Number(
    data?.freedMb ?? data?.freed_mb ?? Math.max(0, beforeMb - afterMb),
  );
  const processesTrimmed = Number(
    data?.processesTrimmed ??
      data?.processes_trimmed ??
      data?.trimmedCount ??
      0,
  );
  const activeFontsCleared = Number(
    data?.activeFontsCleared ?? data?.active_fonts_cleared ?? 0,
  );
  return { beforeMb, afterMb, freedMb, processesTrimmed, activeFontsCleared };
}

export default function SystemHealthView({
  onRefreshStats,
  t = {},
  isRtl = false,
}: any) {
  const [healthData, setHealthData] = useState<any>(null);
  const [ramData, setRamData] = useState<RamData>({
    processRamMb: 0,
    ramMb: 0,
    systemUsedMb: 0,
    systemTotalMb: 0,
    systemCachedMb: 0,
    systemPercent: 0,
    cpuPercent: 0,
    cpuCores: 0,
    cpuModel: "",
    gpuName: "",
    gpuPercent: 0,
    vramUsedMb: 0,
    vramTotalMb: 0,
    gdiHandlesCount: 0,
    fontCacheMb: 0,
    topProcesses: [],
  });
  const [hasLoadedTelemetry, setHasLoadedTelemetry] = useState(false);
  const [activeFonts, setActiveFonts] = useState<any[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [cleaningRegistry, setCleaningRegistry] = useState(false);
  const [optimizingRam, setOptimizingRam] = useState(false);
  const [purging, setPurging] = useState(false);
  const [rebuildingCache, setRebuildingCache] = useState(false);
  const [restoringDefaults, setRestoringDefaults] = useState(false);
  const [trimmingPid, setTrimmingPid] = useState<number | null>(null);
  const [unloadingId, setUnloadingId] = useState<any>(null);

  const [showRamConfirm, setShowRamConfirm] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, ramStatus, resData] = await Promise.all([
        safeFetchJson<any>("/api/system/health", {
          timeoutMs: 4000,
          cache: "no-store",
        }),
        safeFetchJson<any>("/api/system/ram-status", {
          timeoutMs: 4000,
          cache: "no-store",
        }),
        safeFetchJson<any>("/api/system/resources", {
          timeoutMs: 4000,
          cache: "no-store",
        }),
      ]);

      if (healthRes) setHealthData(healthRes);

      const merged = { ...(ramStatus || {}), ...(resData || {}) };
      if (Object.keys(merged).length > 0) {
        const totalMb = Number(
          merged.systemTotalMb ??
            merged.system_total_mb ??
            merged.totalRamMb ??
            merged.total_ram_mb ??
            merged.totalMb ??
            0,
        );
        const usedMb = Number(
          merged.systemUsedMb ??
            merged.system_used_mb ??
            merged.usedRamMb ??
            merged.used_ram_mb ??
            merged.usedMb ??
            0,
        );
        const availMb = Number(
          merged.systemAvailableMb ??
            merged.systemAvailMb ??
            merged.system_avail_mb ??
            merged.availableMb ??
            merged.availRamMb ??
            merged.avail_ram_mb ??
            (totalMb > 0 ? Math.max(0, totalMb - usedMb) : 0),
        );
        const computedPercent =
          merged.systemPercent ??
          merged.system_percent ??
          merged.ramPercent ??
          merged.memoryLoad ??
          (totalMb > 0 ? Math.round((usedMb / totalMb) * 100) : 0);

        const rawProcs: any[] = Array.isArray(merged.topProcesses)
          ? merged.topProcesses
          : Array.isArray(merged.top_processes)
            ? merged.top_processes
            : [];

        const normalizedProcs: ProcessResourceInfo[] = rawProcs
          .slice(0, 5)
          .map((p: any) => ({
            name: String(p.name ?? p.processName ?? "Unknown"),
            pid: Number(p.pid ?? 0),
            ramMb: Math.round(Number(p.ramMb ?? p.ram_mb ?? p.memoryMb ?? 0)),
            cpuPercent: Number(
              Number(p.cpuPercent ?? p.cpu_percent ?? 0).toFixed(1),
            ),
            status: p.status || "Running",
          }));

        setRamData((prev) => ({
          ...prev,
          ...merged,
          processRamMb: Number(
            merged.processRamMb ??
              merged.process_ram_mb ??
              merged.ramMb ??
              merged.ram_mb ??
              prev.processRamMb ??
              0,
          ),
          ramMb: Number(
            merged.ramMb ??
              merged.ram_mb ??
              merged.processRamMb ??
              prev.ramMb ??
              0,
          ),
          systemUsedMb: usedMb || prev.systemUsedMb || 0,
          systemTotalMb: totalMb || prev.systemTotalMb || 0,
          systemAvailMb: availMb,
          systemCachedMb: Number(
            merged.systemCachedMb ??
              merged.system_cached_mb ??
              prev.systemCachedMb ??
              0,
          ),
          systemPercent: Math.min(
            100,
            Math.max(0, Math.round(Number(computedPercent))),
          ),
          cpuPercent: Math.min(
            100,
            Math.max(
              0,
              Math.round(
                Number(
                  merged.cpuPercent ??
                    merged.cpu_percent ??
                    prev.cpuPercent ??
                    0,
                ),
              ),
            ),
          ),
          cpuCores: Number(
            merged.cpuCores ?? merged.cpu_cores ?? prev.cpuCores ?? 0,
          ),
          cpuModel: String(
            merged.cpuModel ?? merged.cpu_model ?? prev.cpuModel ?? "",
          ),
          gpuName: String(
            merged.gpuName ?? merged.gpu_name ?? prev.gpuName ?? "",
          ),
          gpuPercent: Math.min(
            100,
            Math.max(
              0,
              Math.round(
                Number(
                  merged.gpuPercent ??
                    merged.gpu_percent ??
                    prev.gpuPercent ??
                    0,
                ),
              ),
            ),
          ),
          vramUsedMb: Number(
            merged.vramUsedMb ?? merged.vram_used_mb ?? prev.vramUsedMb ?? 0,
          ),
          vramTotalMb: Number(
            merged.vramTotalMb ?? merged.vram_total_mb ?? prev.vramTotalMb ?? 0,
          ),
          gdiHandlesCount: Number(
            merged.gdiHandlesCount ??
              merged.gdi_handles_count ??
              prev.gdiHandlesCount ??
              0,
          ),
          fontCacheMb: Number(
            merged.fontCacheMb ?? merged.font_cache_mb ?? prev.fontCacheMb ?? 0,
          ),
          topProcesses:
            normalizedProcs.length > 0 ? normalizedProcs : prev.topProcesses,
        }));
        setHasLoadedTelemetry(true);
        setLastUpdated(
          new Date().toLocaleTimeString(isRtl ? "ar-EG" : "en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        );

        if (Array.isArray(merged.activeFonts)) {
          setActiveFonts(filterFontivoRamFonts(merged.activeFonts));
          return;
        }
      }

      let fontsList = await safeFetchJson<any>("/api/system/ram-fonts", {
        timeoutMs: 4000,
        cache: "no-store",
      });
      if (!Array.isArray(fontsList)) {
        const fallbackData = await safeFetchJson<any>(
          "/api/fonts?activeOnly=true",
          { timeoutMs: 4000, cache: "no-store" },
        );
        if (fallbackData) {
          fontsList = Array.isArray(fallbackData)
            ? fallbackData
            : fallbackData.fonts || [];
        }
      }
      if (Array.isArray(fontsList)) {
        setActiveFonts(filterFontivoRamFonts(fontsList));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [isRtl]);

  useEffect(() => {
    fetchAll();
    if (!autoRefresh) return;
    const interval = setInterval(fetchAll, RAM_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAll]);

  const handleTrimSingleProcess = async (proc: ProcessResourceInfo) => {
    setTrimmingPid(proc.pid);
    setFeedback(null);
    const opId = `trim-proc-${proc.pid}`;
    upsertLiveOperation({
      id: opId,
      title: `Trimming RAM: ${proc.name}`,
      titleAr: `تفريغ ذاكرة: ${proc.name}`,
      category: "ram-optimize",
      status: "running",
      progressPercent: 45,
      stepLabel: "Trimming idle working set pages...",
      stepLabelAr: "جاري تفريغ الذاكرة الخاملة بحذر...",
    });

    try {
      const data = await safeFetchJson<any>("/api/system/trim-process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid: proc.pid, name: proc.name }),
        timeoutMs: 6000,
      });
      const freedMb = Number(data?.freedMb ?? data?.freed_mb ?? 0);
      upsertLiveOperation({
        id: opId,
        status: "completed",
        progressPercent: 100,
        stepLabel: `Trimmed ${proc.name} (${freedMb} MB freed)`,
        stepLabelAr: `تم تفريغ ذاكرة ${proc.name} (${freedMb} MB)`,
      });
      setFeedback({
        type: "success",
        text: isRtl
          ? `تم تقليص الذاكرة الخاملة لـ "${proc.name}" وتحرير ${freedMb} MB.`
          : `Trimmed idle memory for "${proc.name}" (${freedMb} MB freed).`,
      });
      await fetchAll();
    } catch (e: any) {
      setFeedback({
        type: "error",
        text: e?.message || "Error trimming process RAM",
      });
    } finally {
      setTrimmingPid(null);
    }
  };

  const handleOptimizeRamNow = async () => {
    setShowRamConfirm(false);
    if (optimizingRam) return;
    setOptimizingRam(true);
    setFeedback(null);

    const opId = `opt-ram-now-${Date.now()}`;
    upsertLiveOperation({
      id: opId,
      title: "Safe System RAM Trim",
      titleAr: "تفريغ الذاكرة بحذر",
      category: "ram-optimize",
      status: "running",
      progressPercent: 35,
      stepLabel: "Trimming idle memory pages...",
      stepLabelAr: "جاري تقليص الذاكرة الخاملة...",
    });

    try {
      const res = await safeFetchJson<any>("/api/system/optimize-ram", {
        method: "POST",
        timeoutMs: 12000,
      });
      const stats = normalizeRamOptimizeResult(res);
      upsertLiveOperation({
        id: opId,
        status: "completed",
        progressPercent: 100,
        stepLabel: `Freed ${stats.freedMb} MB (${stats.beforeMb} -> ${stats.afterMb} MB)`,
        stepLabelAr: `تم تحرير ${stats.freedMb} MB (${stats.beforeMb} → ${stats.afterMb} MB)`,
      });
      setFeedback({
        type: "success",
        text: isRtl
          ? `تم تفريغ الذاكرة الخاملة بحذر وتحرير ${stats.freedMb} MB (${stats.beforeMb} MB ← ${stats.afterMb} MB) عبر ${stats.processesTrimmed} عملية.`
          : `Safely trimmed RAM! Freed ${stats.freedMb} MB (${stats.beforeMb} MB → ${stats.afterMb} MB) across ${stats.processesTrimmed} processes.`,
      });
      await fetchAll();
      if (onRefreshStats) onRefreshStats();
    } catch (e: any) {
      upsertLiveOperation({
        id: opId,
        status: "failed",
        progressPercent: 0,
        error: e?.message,
      });
      setFeedback({
        type: "error",
        text: e?.message || "Failed to optimize RAM",
      });
    } finally {
      setOptimizingRam(false);
    }
  };

  const handleDeepRamAndCachePurge = async () => {
    setShowPurgeConfirm(false);
    setPurging(true);
    setFeedback(null);
    const opId = `deep-ram-purge-${Date.now()}`;
    upsertLiveOperation({
      id: opId,
      title: "Deep RAM & Font Cache Purge",
      titleAr: "تفريغ الخطوط المؤقتة والذاكرة",
      category: "ram-optimize",
      status: "running",
      progressPercent: 35,
      stepLabel: "Unloading RAM fonts and trimming idle memory...",
      stepLabelAr: "جاري إلغاء تفعيل الخطوط المؤقتة وتنظيف الذاكرة...",
    });

    try {
      const clearRes = await safeFetchJson<any>(
        "/api/system/ram-fonts/clear-all",
        { method: "POST", timeoutMs: 6000 },
      );
      if (!clearRes) {
        await safeFetchJson<any>("/api/deactivate-all", {
          method: "POST",
          timeoutMs: 6000,
        });
      }
      const optRes = await safeFetchJson<any>("/api/system/optimize-ram", {
        method: "POST",
        timeoutMs: 12000,
      });
      const stats = normalizeRamOptimizeResult(optRes);
      setActiveFonts([]);
      upsertLiveOperation({
        id: opId,
        status: "completed",
        progressPercent: 100,
        stepLabel: `Deep purge complete! Freed ${stats.freedMb} MB`,
        stepLabelAr: `تم تفريغ الخطوط المؤقتة وتحرير ${stats.freedMb} MB`,
      });
      setFeedback({
        type: "success",
        text: isRtl
          ? `تم إلغاء تفعيل خطوط الرام المؤقتة وتحرير ${stats.freedMb} MB من الذاكرة.`
          : `Unloaded all RAM fonts and freed ${stats.freedMb} MB of memory.`,
      });
      await fetchAll();
      if (onRefreshStats) onRefreshStats();
    } catch (e: any) {
      setFeedback({ type: "error", text: e?.message || "Error purging RAM" });
    } finally {
      setPurging(false);
    }
  };

  const handleUnloadFont = async (font: any) => {
    setUnloadingId(font.id);
    try {
      await safeFetchJson<any>("/api/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: font.id, path: font.path }),
        timeoutMs: 5000,
      });
      setActiveFonts((prev) => prev.filter((f) => f.id !== font.id));
      setFeedback({
        type: "success",
        text: isRtl
          ? `تم إلغاء تفعيل "${font.name || font.family}" من الرام.`
          : `Deactivated "${font.name || font.family}" from RAM.`,
      });
      if (onRefreshStats) onRefreshStats();
    } catch (e: any) {
      setFeedback({ type: "error", text: e?.message });
    } finally {
      setUnloadingId(null);
    }
  };

  const handleCleanRegistry = async () => {
    setCleaningRegistry(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/system/clean-registry", { method: "POST" });
      const data = await res.json();
      setFeedback({
        type: "success",
        text: isRtl
          ? `تم تنظيف ${data?.cleaned ?? 0} قيداً غير صالح من ريجستري ويندوز.`
          : `Cleaned ${data?.cleaned ?? 0} orphaned font entries from Windows Registry.`,
      });
      await fetchAll();
      if (onRefreshStats) onRefreshStats();
    } catch (e: any) {
      setFeedback({
        type: "error",
        text:
          e?.message || (isRtl ? "فشل تنظيف السجل" : "Registry cleanup failed"),
      });
    } finally {
      setCleaningRegistry(false);
    }
  };

  const handleRebuildCache = async () => {
    setRebuildingCache(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/system/rebuild-cache", { method: "POST" });
      const data = await res.json();
      setFeedback({
        type: data?.success === false ? "error" : "success",
        text:
          data?.message ||
          (isRtl ? "تمت إعادة بناء كاش الخطوط" : "Windows font cache rebuilt"),
      });
      await fetchAll();
    } catch (e: any) {
      setFeedback({
        type: "error",
        text:
          e?.message || (isRtl ? "فشل إعادة البناء" : "Cache rebuild failed"),
      });
    } finally {
      setRebuildingCache(false);
    }
  };

  const handleRestoreDefaults = async () => {
    setShowRestoreConfirm(false);
    setRestoringDefaults(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/system/restore-default-fonts", {
        method: "POST",
      });
      const data = await res.json();
      setFeedback({
        type: data?.success ? "success" : "error",
        text:
          data?.message ||
          (isRtl
            ? "تمت استعادة خطوط ويندوز الافتراضية مع حفظ نسخة احتياطية."
            : "Restored default Windows fonts with automatic backup."),
      });
      await fetchAll();
      if (onRefreshStats) onRefreshStats();
    } catch (e: any) {
      setFeedback({
        type: "error",
        text: e?.message || (isRtl ? "فشل الاستعادة" : "Restore failed"),
      });
    } finally {
      setRestoringDefaults(false);
    }
  };

  const deadList = Array.isArray(healthData?.deadEntries)
    ? healthData.deadEntries
    : [];
  const totalActiveCount = activeFonts.length;
  const estimatedFontRamKb = activeFonts.reduce(
    (acc, f) => acc + (f.sizeKb || f.memoryKb || 140),
    0,
  );
  const estimatedFontRamMb = (estimatedFontRamKb / 1024).toFixed(1);
  const topProcesses = Array.isArray(ramData.topProcesses)
    ? ramData.topProcesses.slice(0, 5)
    : [];
  const totalRamGb = formatMbToGb(ramData.systemTotalMb);
  const usedRamGb = formatMbToGb(ramData.systemUsedMb);
  const availRamMb = Number(
    (ramData as any).systemAvailMb ??
      Math.max(0, (ramData.systemTotalMb || 0) - (ramData.systemUsedMb || 0)),
  );

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* 1. Unified Header & Live Streaming Telemetry Cards */}
      <div className="p-4 sm:p-6 border-b border-[var(--color-border)] bg-[var(--color-back-header)]/50 shrink-0 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <Activity className="w-5 h-5 text-[var(--color-action)] shrink-0" />
              <h1 className="text-lg sm:text-xl font-black text-[var(--color-text-header)] tracking-tight truncate">
                {isRtl
                  ? "صحة النظام ومراقبة الموارد والرام"
                  : "System Health, CPU & RAM Monitor"}
              </h1>
              {lastUpdated && (
                <span
                  data-testid="ram-last-updated"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                >
                  <Clock className="w-3 h-3 shrink-0 text-[#B7A1D9]" />
                  <span>
                    {isRtl
                      ? `آخر تحديث: ${lastUpdated}`
                      : `Updated: ${lastUpdated}`}
                  </span>
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {isRtl
                ? "مراقبة حية فورية لذاكرة النظام الفعلية والمعالج وكرت الشاشة وأعلى 5 عمليات، مع إدارة خطوط الرام وصيانة ريجستري وكاش ويندوز."
                : "Live hardware telemetry for physical RAM, CPU, GPU, and Top 5 processes paired with Fontivo RAM fonts & Windows registry maintenance."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              data-testid="ram-live-toggle"
              className={`h-9 px-3 rounded-xl text-xs font-semibold border flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
                autoRefresh
                  ? "bg-[var(--color-action)]/12 text-[var(--color-action)] border-[var(--color-action)]/35"
                  : "bg-[var(--color-control)] text-[var(--color-text-muted)] border-[var(--color-border)]"
              }`}
            >
              {autoRefresh ? (
                <Pause className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Play className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {autoRefresh
                  ? isRtl
                    ? "مراقبة حية (2ث)"
                    : "Live (2s)"
                  : isRtl
                    ? "متوقف مؤقتاً"
                    : "Paused"}
              </span>
            </button>

            <button
              onClick={fetchAll}
              disabled={loading}
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] transition cursor-pointer shrink-0 disabled:opacity-50"
              title={isRtl ? "تحديث الآن" : "Refresh Now"}
            >
              <RefreshCw
                className={`w-4 h-4 text-[var(--color-text-muted)] ${loading ? "animate-spin" : ""}`}
              />
            </button>

            <button
              onClick={() => setShowRamConfirm(true)}
              disabled={optimizingRam}
              data-testid="optimize-ram-now-btn"
              className="h-9 px-3.5 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-[#130C16] text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Zap
                className={`w-3.5 h-3.5 shrink-0 ${optimizingRam ? "animate-spin" : ""}`}
              />
              <span>
                {optimizingRam
                  ? isRtl
                    ? "جاري التحرير..."
                    : "Trimming..."
                  : isRtl
                    ? "تفريغ الرام بحذر"
                    : "Safe RAM Trim"}
              </span>
            </button>

            <button
              onClick={() => setShowPurgeConfirm(true)}
              disabled={purging}
              className="h-9 px-3.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] hover:border-[var(--color-action)] text-[var(--color-text-header)] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5 text-[#B7A1D9] shrink-0" />
              <span>
                {purging
                  ? isRtl
                    ? "جاري التنظيف..."
                    : "Purging..."
                  : isRtl
                    ? "تفريغ الخطوط والرام"
                    : "Deep Purge"}
              </span>
            </button>
          </div>
        </div>

        {/* 4 Full Telemetry Cards: System RAM, CPU & Cores/Model, GPU/VRAM, Fontivo Process RAM */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {/* Card 1: System RAM */}
          <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-1.5 flex flex-col justify-between">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-dim)] flex items-center justify-between">
              <span>{isRtl ? "ذاكرة النظام الفعلية" : "System RAM"}</span>
              <HardDrive className="w-3.5 h-3.5 text-[var(--color-action)]" />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <div
                className="text-xl font-black font-mono tabular-nums text-[var(--color-text-header)]"
                dir="ltr"
              >
                {hasLoadedTelemetry ? `${ramData.systemPercent ?? 0}%` : "—"}
              </div>
              <div
                className="text-[11px] font-mono tabular-nums text-[var(--color-text-muted)]"
                data-testid="system-ram-gb"
                dir="ltr"
              >
                {hasLoadedTelemetry
                  ? `${usedRamGb} / ${totalRamGb}`
                  : isRtl
                    ? "جاري القراءة..."
                    : "Reading..."}
              </div>
            </div>
            <div className="w-full h-1.5 bg-[var(--color-control)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-action)] transition-all duration-500"
                style={{ width: `${ramData.systemPercent || 0}%` }}
              />
            </div>
            <div className="text-[10px] font-mono tabular-nums text-[var(--color-text-muted)] flex items-center justify-between">
              <span>{isRtl ? "المتاح:" : "Available:"}</span>
              <span dir="ltr">
                {hasLoadedTelemetry
                  ? `${formatMbToGb(availRamMb)} (${Math.round(availRamMb).toLocaleString()} MB)`
                  : "—"}
              </span>
            </div>
          </div>

          {/* Card 2: CPU Usage, Cores & Model */}
          <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-1.5 flex flex-col justify-between">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-dim)] flex items-center justify-between">
              <span>{isRtl ? "المعالج والأنوية" : "CPU Usage & Cores"}</span>
              <Cpu className="w-3.5 h-3.5 text-[#B7A1D9]" />
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-xl font-black font-mono tabular-nums text-[var(--color-text-header)]">
                {hasLoadedTelemetry ? `${ramData.cpuPercent ?? 0}%` : "—"}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[#B7A1D9] font-bold">
                {ramData.cpuCores
                  ? `${ramData.cpuCores} ${isRtl ? "أنوية" : "Cores"}`
                  : "—"}
              </div>
            </div>
            <div className="w-full h-1.5 bg-[var(--color-control)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#B7A1D9] transition-all duration-500"
                style={{ width: `${ramData.cpuPercent ?? 0}%` }}
              />
            </div>
            <div
              className="text-[10px] text-[var(--color-text-muted)] truncate"
              title={ramData.cpuModel}
            >
              {ramData.cpuModel ||
                (isRtl ? "قياس حي للمعالج" : "Live CPU Telemetry")}
            </div>
          </div>

          {/* Card 3: GPU / VRAM */}
          <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-1.5 flex flex-col justify-between">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-dim)] flex items-center justify-between">
              <span>{isRtl ? "معالج الرسوميات" : "GPU / VRAM Usage"}</span>
              <Monitor className="w-3.5 h-3.5 text-[var(--color-action)]" />
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-xl font-black font-mono tabular-nums text-[var(--color-text-header)]">
                {hasLoadedTelemetry ? `${ramData.gpuPercent ?? 0}%` : "—"}
              </div>
              <div
                className="text-[11px] font-mono tabular-nums text-[var(--color-text-muted)]"
                dir="ltr"
              >
                {ramData.vramTotalMb
                  ? `${ramData.vramUsedMb || 0} / ${ramData.vramTotalMb} MB`
                  : "DirectWrite"}
              </div>
            </div>
            <div className="w-full h-1.5 bg-[var(--color-control)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-action)] transition-all duration-500"
                style={{ width: `${ramData.gpuPercent ?? 0}%` }}
              />
            </div>
            <div
              className="text-[10px] text-[var(--color-text-muted)] truncate"
              title={ramData.gpuName}
            >
              {ramData.gpuName || "Hardware Rasterizer"}
            </div>
          </div>

          {/* Card 4: Fontivo Process RAM */}
          <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-1.5 flex flex-col justify-between">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-dim)] flex items-center justify-between gap-2">
              <span className="truncate">
                {isRtl ? "استهلاك محرك Fontivo" : "Fontivo Process RAM"}
              </span>
              <Gauge className="w-3.5 h-3.5 text-[#B7A1D9] shrink-0" />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-xl font-black font-mono tabular-nums text-[var(--color-action)] whitespace-nowrap">
                {hasLoadedTelemetry
                  ? Math.round(ramData.processRamMb || ramData.ramMb || 0)
                  : "—"}{" "}
                <span className="text-xs font-normal text-[var(--color-text-muted)]">
                  MB
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#B7A1D9]/15 text-[#B7A1D9] font-bold whitespace-nowrap shrink-0">
                {isRtl ? "خفيف وسريع" : "Lightweight"}
              </span>
            </div>
            <div className="text-[10px] font-mono tabular-nums text-[var(--color-text-muted)] flex items-center justify-between pt-1">
              <span>
                {isRtl ? "مقابض الخطوط:" : "Handles:"}{" "}
                {ramData.gdiHandlesCount ?? 0}
              </span>
              <span>
                {totalActiveCount} {isRtl ? "بالرام" : "RAM"}
              </span>
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              feedback.type === "error"
                ? "bg-[var(--color-action)]/10 border-[var(--color-action)]/40 text-[var(--color-action)]"
                : "bg-[#B7A1D9]/10 border-[#B7A1D9]/40 text-[#B7A1D9]"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {feedback.type === "error" ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-[11px] opacity-70 hover:opacity-100 cursor-pointer shrink-0"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 2. Scrollable Body: Top 5 Processes + RAM Breakdown + Registry/Cache Maintenance + Active RAM Fonts */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Top 5 Resource-Consuming Processes */}
          <div className="lg:col-span-2 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-xs flex flex-col">
            <div className="p-4 border-b border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2 min-w-0">
                  <Cpu className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                  <span className="truncate">
                    {isRtl
                      ? "أعلى 5 عمليات استهلاكاً للرام (مباشر)"
                      : "Top 5 Memory-Consuming Applications"}
                  </span>
                </h2>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                  {isRtl
                    ? "تقليص الذاكرة الخاملة بحذر دون إغلاق أي تطبيق مفتوح."
                    : "Trim idle working sets cautiously without closing running apps."}
                </p>
              </div>
              <button
                onClick={() => setShowRamConfirm(true)}
                disabled={optimizingRam}
                className="h-8 px-3 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-action)] text-[var(--color-text-header)] hover:text-[#130C16] border border-[var(--color-border)] hover:border-[var(--color-action)] text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
              >
                {isRtl ? "تفريغ الكل بحذر" : "Trim All Safely"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left rtl:text-right whitespace-nowrap">
                <thead className="bg-[var(--color-back-subtle)] text-[10px] font-mono uppercase text-[var(--color-text-dim)] border-b border-[var(--color-border-subtle)]">
                  <tr>
                    <th className="py-2.5 px-4">
                      {isRtl ? "التطبيق" : "Process Name"}
                    </th>
                    <th className="py-2.5 px-3">PID</th>
                    <th className="py-2.5 px-3">
                      {isRtl ? "الرام" : "RAM Usage"}
                    </th>
                    <th className="py-2.5 px-3">
                      {isRtl ? "المعالج" : "CPU %"}
                    </th>
                    <th className="py-2.5 px-4 text-right rtl:text-left">
                      {isRtl ? "إجراء" : "Action"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {topProcesses.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 px-4 text-center text-[var(--color-text-muted)]"
                      >
                        {isRtl
                          ? "جاري قراءة أعلى 5 عمليات من نظام ويندوز..."
                          : "Reading top 5 live processes from Windows..."}
                      </td>
                    </tr>
                  ) : (
                    topProcesses.map((proc) => {
                      const isTrimming = trimmingPid === proc.pid;
                      return (
                        <tr
                          key={`${proc.pid}-${proc.name}`}
                          className="hover:bg-[var(--color-control)]/30 transition"
                        >
                          <td className="py-2.5 px-4 font-bold text-[var(--color-text-header)]">
                            {proc.name}
                          </td>
                          <td
                            className="py-2.5 px-3 font-mono text-[var(--color-text-muted)]"
                            dir="ltr"
                          >
                            {proc.pid}
                          </td>
                          <td
                            className="py-2.5 px-3 font-mono tabular-nums font-bold text-[var(--color-action)]"
                            dir="ltr"
                          >
                            {proc.ramMb.toLocaleString()} MB
                          </td>
                          <td
                            className="py-2.5 px-3 font-mono tabular-nums text-[var(--color-text-muted)]"
                            dir="ltr"
                          >
                            {proc.cpuPercent}%
                          </td>
                          <td className="py-2.5 px-4 text-right rtl:text-left">
                            <button
                              onClick={() => handleTrimSingleProcess(proc)}
                              disabled={isTrimming}
                              className="h-7 px-2.5 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-action)] text-[var(--color-text-header)] hover:text-[#130C16] border border-[var(--color-border)] hover:border-[var(--color-action)] text-[11px] font-semibold transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              {isTrimming
                                ? isRtl
                                  ? "جاري..."
                                  : "Trimming..."
                                : isRtl
                                  ? "تخفيف"
                                  : "Trim"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column: RAM Cache, Handles & Registry Status Breakdown */}
          <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl p-5 space-y-4 shadow-xs flex flex-col justify-between">
            <div className="space-y-3.5">
              <div>
                <h2 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#B7A1D9]" />
                  <span>
                    {isRtl
                      ? "تفصيل الرام ومقابض النظام"
                      : "RAM Cache & Handles Breakdown"}
                  </span>
                </h2>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                  {isRtl
                    ? "قراءة حية لذاكرة الجهاز والخطوط النشطة وسجل ويندوز."
                    : "Live breakdown of system memory, handles & font registry."}
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-2">
                  <span className="text-[var(--color-text-muted)]">
                    {isRtl ? "إجمالي الرام الفعلي" : "Total Physical RAM"}
                  </span>
                  <span
                    className="font-mono tabular-nums font-bold text-[var(--color-text-header)]"
                    dir="ltr"
                  >
                    {hasLoadedTelemetry ? totalRamGb : "—"}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-2">
                  <span className="text-[var(--color-text-muted)]">
                    {isRtl ? "المستخدم حالياً" : "Used System RAM"}
                  </span>
                  <span
                    className="font-mono tabular-nums font-bold text-[#B7A1D9]"
                    dir="ltr"
                  >
                    {hasLoadedTelemetry ? usedRamGb : "—"}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-2">
                  <span className="text-[var(--color-text-muted)]">
                    {isRtl ? "خطوط Fontivo بالرام" : "Fontivo RAM Fonts"}
                  </span>
                  <span
                    className="font-mono tabular-nums font-bold text-[var(--color-action)]"
                    dir="ltr"
                  >
                    {totalActiveCount} ({estimatedFontRamMb} MB)
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-2">
                  <span className="text-[var(--color-text-muted)]">
                    {isRtl ? "مقابض الخطوط (GDI)" : "Active Font Handles"}
                  </span>
                  <span
                    className="font-mono tabular-nums font-bold text-[var(--color-text-header)]"
                    dir="ltr"
                  >
                    {ramData.gdiHandlesCount ?? 0} / 10,000
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-2">
                  <span className="text-[var(--color-text-muted)]">
                    {isRtl
                      ? "مفاتيح الريجستري اليتيمة"
                      : "Orphaned Registry Keys"}
                  </span>
                  <span className="font-mono tabular-nums font-bold text-[var(--color-text-header)]">
                    {deadList.length}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowRamConfirm(true)}
              disabled={optimizingRam}
              className="w-full h-9 px-4 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-[#130C16] text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>
                {optimizingRam
                  ? isRtl
                    ? "جاري التحرير..."
                    : "Optimizing..."
                  : isRtl
                    ? "تفريغ الذاكرة بحذر"
                    : "Safe RAM Trim"}
              </span>
            </button>
          </div>
        </div>

        {/* 3. System Maintenance, Registry Audit & Backup Actions */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] flex flex-col justify-between gap-4">
            <div className="space-y-1.5">
              <ShieldCheck className="w-5 h-5 text-[var(--color-action)]" />
              <h3 className="text-sm font-bold text-[var(--color-text-header)]">
                {isRtl ? "تنظيف سجل النظام" : "Clean Registry"}
              </h3>
              <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                {isRtl
                  ? "فحص وإزالة مسارات الخطوط المعطوبة واليتيمة من ريجستري ويندوز."
                  : "Remove orphaned or broken font entries from the Windows Registry."}
              </p>
            </div>
            <button
              onClick={handleCleanRegistry}
              disabled={cleaningRegistry}
              className="w-full py-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-action)] hover:text-[#130C16] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-header)] transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                {isRtl ? "تنظيف السجل" : "Clean Registry"} ({deadList.length})
              </span>
            </button>
          </div>

          <div className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] flex flex-col justify-between gap-4">
            <div className="space-y-1.5">
              <HardDrive className="w-5 h-5 text-[#B7A1D9]" />
              <h3 className="text-sm font-bold text-[var(--color-text-header)]">
                {isRtl ? "إعادة بناء كاش الخطوط" : "Rebuild Font Cache"}
              </h3>
              <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                {isRtl
                  ? "تحديث ملفات كاش DirectWrite في ويندوز لحل مشاكل عرض الحروف."
                  : "Refresh corrupt Windows DirectWrite font cache files cleanly."}
              </p>
            </div>
            <button
              onClick={handleRebuildCache}
              disabled={rebuildingCache}
              className="w-full py-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[#B7A1D9] hover:text-[#130C16] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-header)] transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isRtl ? "إعادة بناء الكاش" : "Rebuild Cache"}</span>
            </button>
          </div>

          <div className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] flex flex-col justify-between gap-4">
            <div className="space-y-1.5">
              <RotateCcw className="w-5 h-5 text-[var(--color-action)]" />
              <h3 className="text-sm font-bold text-[var(--color-text-header)]">
                {isRtl ? "استعادة مع نسخ احتياطي" : "Restore + Backup"}
              </h3>
              <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                {isRtl
                  ? "أخذ نسخة احتياطية للخطوط الإضافية واستعادة خطوط ويندوز الأصلية."
                  : "Back up extra fonts and restore factory Windows fonts."}
              </p>
            </div>
            <button
              onClick={() => setShowRestoreConfirm(true)}
              disabled={restoringDefaults}
              className="w-full py-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-action)] hover:text-[#130C16] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-header)] transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>
                {isRtl ? "استعادة مع نسخة احتياطية" : "Restore Defaults"}
              </span>
            </button>
          </div>
        </div>

        {/* 4. Active Fontivo RAM Fonts List (Excludes Windows OS System Fonts) */}
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] px-1">
            <span className="font-bold text-[var(--color-text-header)]">
              {isRtl
                ? `خطوط Fontivo المفعلة حالياً في الرام (${totalActiveCount})`
                : `Active Fontivo Fonts Injected in RAM (${totalActiveCount})`}
            </span>
            <span className="text-[11px]">
              {isRtl
                ? "تفعيل مؤقت بالرام فقط (مستثنى خطوط ويندوز)"
                : "Temporary RAM-Only (Excludes Windows System Fonts)"}
            </span>
          </div>

          {totalActiveCount === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center gap-2 text-center border border-dashed border-[var(--color-border)] rounded-2xl p-6 bg-[var(--color-back-card)]/40">
              <Zap className="w-5 h-5 text-[var(--color-action)]" />
              <h3 className="text-sm font-bold text-[var(--color-text-header)]">
                {isRtl
                  ? "لا توجد خطوط مفعلة بالرام عبر Fontivo حالياً"
                  : "No Fontivo Fonts Currently Active in RAM"}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] max-w-md">
                {isRtl
                  ? "خطوط ويندوز المثبتة بالنظام لا تُحسب هنا. عند تفعيل أي خط محلي أو من جوجل سيظهر هنا لإلغاء تفعيله بنقرة واحدة."
                  : "Windows OS fonts are excluded here. Activate any local or Google font and manage it here in 1 click."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border-subtle)] bg-[var(--color-back-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
              {activeFonts.map((font) => {
                const isUnloading = unloadingId === font.id;
                return (
                  <div
                    key={font.id || font.name}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--color-control)]/30 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-[var(--color-text-header)] truncate">
                          {font.family || font.name}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-muted)] whitespace-nowrap shrink-0">
                          {font.format || "TTF"}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--color-action)] bg-[var(--color-action)]/10 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap shrink-0">
                          RAM Active
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-[var(--color-text-dim)] truncate mt-0.5">
                        {font.path || "Virtual Memory Handle"}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <span className="text-xs font-mono text-[var(--color-text-muted)] whitespace-nowrap shrink-0">
                        ~{font.sizeKb || font.memoryKb || 140} KB RAM
                      </span>
                      <button
                        onClick={() => handleUnloadFont(font)}
                        disabled={isUnloading}
                        className="h-8 px-3 rounded-xl text-xs font-semibold text-[var(--color-text-muted)] hover:text-[#130C16] hover:bg-[var(--color-action)] border border-[var(--color-border)] hover:border-[var(--color-action)] transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>
                          {isUnloading
                            ? isRtl
                              ? "جاري التفريغ..."
                              : "Unloading..."
                            : isRtl
                              ? "إلغاء التفعيل"
                              : "Deactivate"}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <ConfirmDialog
        open={showRamConfirm}
        onCancel={() => setShowRamConfirm(false)}
        onConfirm={handleOptimizeRamNow}
        title={isRtl ? "تأكيد تفريغ الذاكرة بحذر" : "Confirm Safe RAM Trim"}
        message={
          isRtl
            ? "سيتم تقليص الذاكرة الخاملة للعمليات غير النشطة دون إغلاق أي برنامج مفتوح. هل تريد المتابعة؟"
            : "This trims idle working sets safely without closing open apps. Continue?"
        }
        confirmLabel={isRtl ? "نعم، نفّذ بحذر" : "Yes, Trim Safely"}
        cancelLabel={isRtl ? "إلغاء" : "Cancel"}
        isRtl={isRtl}
      />

      <ConfirmDialog
        open={showPurgeConfirm}
        onCancel={() => setShowPurgeConfirm(false)}
        onConfirm={handleDeepRamAndCachePurge}
        title={isRtl ? "تأكيد تفريغ الخطوط والرام" : "Confirm Deep RAM Purge"}
        message={
          isRtl
            ? "سيتم إلغاء تفعيل كافة خطوط Fontivo المؤقتة في الرام وتقليص الذاكرة الخاملة. خطوط ويندوز المثبتة لن تتأثر. هل تريد المتابعة؟"
            : "This unloads all temporary Fontivo RAM fonts and trims idle memory. Windows OS fonts are unaffected. Continue?"
        }
        confirmLabel={isRtl ? "نعم، تفريغ الكل" : "Yes, Purge RAM"}
        cancelLabel={isRtl ? "إلغاء" : "Cancel"}
        isRtl={isRtl}
      />

      <ConfirmDialog
        open={showRestoreConfirm}
        onCancel={() => setShowRestoreConfirm(false)}
        onConfirm={handleRestoreDefaults}
        title={isRtl ? "استعادة خطوط ويندوز" : "Restore Default Windows Fonts"}
        message={
          isRtl
            ? "سيتم أخذ نسخة احتياطية من الخطوط الإضافية قبل استعادة الوضع الافتراضي لويندوز. هل تريد المتابعة؟"
            : "Extra fonts will be backed up before restoring Windows defaults. Continue?"
        }
        confirmLabel={isRtl ? "استعادة" : "Restore"}
        cancelLabel={isRtl ? "إلغاء" : "Cancel"}
        isRtl={isRtl}
      />
    </div>
  );
}
