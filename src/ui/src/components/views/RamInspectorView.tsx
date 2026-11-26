import React, { useState, useEffect, useCallback } from "react";
import {
  Zap,
  Trash2,
  RefreshCw,
  Cpu,
  Layers,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Activity,
  Monitor,
  Gauge,
  Clock,
} from "lucide-react";
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

export default function RamInspectorView({
  onRefreshStats,
  t = {},
  isRtl = false,
}: any) {
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
  const [purging, setPurging] = useState(false);
  const [optimizingRam, setOptimizingRam] = useState(false);
  const [trimmingPid, setTrimmingPid] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [unloadingId, setUnloadingId] = useState<any>(null);

  const fetchRamAndResources = useCallback(async () => {
    try {
      const [resData, ramStatus] = await Promise.all([
        safeFetchJson<any>("/api/system/resources", {
          timeoutMs: 4000,
          cache: "no-store",
        }),
        safeFetchJson<any>("/api/system/ram-status", {
          timeoutMs: 4000,
          cache: "no-store",
        }),
      ]);

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

        const normalizedProcs: ProcessResourceInfo[] = rawProcs.map(
          (p: any) => ({
            name: String(p.name ?? p.processName ?? "Unknown"),
            pid: Number(p.pid ?? 0),
            ramMb: Math.round(Number(p.ramMb ?? p.ram_mb ?? p.memoryMb ?? 0)),
            cpuPercent: Number(
              Number(p.cpuPercent ?? p.cpu_percent ?? 0).toFixed(1),
            ),
            status: p.status || "Running",
          }),
        );

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

      // Fetch live list of fonts explicitly activated in RAM by Fontivo (never Windows system fonts)
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
    }
  }, [isRtl]);

  useEffect(() => {
    fetchRamAndResources();
    if (!autoRefresh) return;
    const interval = setInterval(fetchRamAndResources, RAM_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchRamAndResources]);

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
      stepLabel: "Purging unreferenced memory pages...",
      stepLabelAr: "جاري تفريغ الذاكرة الخاملة وتسريع الأداء...",
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
        stepLabelAr: `تم تفريغ ذاكرة ${proc.name} (${freedMb} MB)!`,
      });

      setFeedback({
        type: "success",
        text: isRtl
          ? `تم تفريغ الذاكرة الخاملة لتطبيق "${proc.name}" بنجاح وتحرير ${freedMb} MB.`
          : `Trimmed working set for "${proc.name}", freeing ${freedMb} MB.`,
      });

      await fetchRamAndResources();
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
    if (optimizingRam) return;
    setOptimizingRam(true);
    setFeedback(null);

    const opId = `opt-ram-now-${Date.now()}`;
    upsertLiveOperation({
      id: opId,
      title: "Optimizing & Cleaning System RAM",
      titleAr: "تنظيف وتسريع الرام الآن",
      category: "ram-optimize",
      status: "running",
      progressPercent: 35,
      stepLabel: "Trimming idle memory pages...",
      stepLabelAr: "جاري تنظيف الذاكرة وتحسين الأداء...",
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
        stepLabel: `Freed ${stats.freedMb} MB (${stats.beforeMb} -> ${stats.afterMb} MB, ${stats.processesTrimmed} processes)`,
        stepLabelAr: `تم تحرير ${stats.freedMb} MB (${stats.beforeMb} → ${stats.afterMb} MB) عبر ${stats.processesTrimmed} عملية!`,
      });

      setFeedback({
        type: "success",
        text: isRtl
          ? `تم تنظيف وتسريع الرام بنجاح! تم تحرير ${stats.freedMb} MB (${stats.beforeMb} MB ← ${stats.afterMb} MB) عبر تحسين ${stats.processesTrimmed} عملية.`
          : `RAM optimized! Freed ${stats.freedMb} MB (${stats.beforeMb} MB → ${stats.afterMb} MB) across ${stats.processesTrimmed} processes.`,
      });

      await fetchRamAndResources();
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
    setPurging(true);
    setFeedback(null);

    const opId = `deep-ram-purge-${Date.now()}`;
    upsertLiveOperation({
      id: opId,
      title: "Deep RAM & Font Cache Purge",
      titleAr: "تنظيف الرام وإلغاء الخطوط المؤقتة",
      category: "ram-optimize",
      status: "running",
      progressPercent: 35,
      stepLabel: "Clearing temporary RAM fonts and freeing idle memory...",
      stepLabelAr: "جاري إلغاء الخطوط المؤقتة وتنظيف الذاكرة...",
    });

    try {
      const clearRes = await safeFetchJson<any>(
        "/api/system/ram-fonts/clear-all",
        {
          method: "POST",
          timeoutMs: 6000,
        },
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
        stepLabel: `Deep purge complete! Freed ${stats.freedMb} MB (${stats.processesTrimmed} processes)`,
        stepLabelAr: `اكتمل التنظيف الشامل! تم تحرير ${stats.freedMb} MB عبر ${stats.processesTrimmed} عملية.`,
      });

      setFeedback({
        type: "success",
        text: isRtl
          ? `تم تفريغ خطوط الرام وتنظيف الذاكرة الشامل! تم تحرير ${stats.freedMb} MB (${stats.beforeMb} MB ← ${stats.afterMb} MB) عبر ${stats.processesTrimmed} عملية.`
          : `Deep RAM & Cache Purge completed! Freed ${stats.freedMb} MB (${stats.beforeMb} MB → ${stats.afterMb} MB) across ${stats.processesTrimmed} processes.`,
      });

      await fetchRamAndResources();
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
          ? `تم تفريغ الخط "${font.name || font.family}" من الرام بنجاح.`
          : `Unloaded "${font.name || font.family}" from RAM.`,
      });
      if (onRefreshStats) onRefreshStats();
    } catch (e: any) {
      setFeedback({ type: "error", text: e?.message });
    } finally {
      setUnloadingId(null);
    }
  };

  const totalActiveCount = activeFonts.length;
  const estimatedFontRamKb = activeFonts.reduce(
    (acc, f) => acc + (f.sizeKb || f.memoryKb || 140),
    0,
  );
  const estimatedFontRamMb = (estimatedFontRamKb / 1024).toFixed(1);
  const topProcesses = Array.isArray(ramData.topProcesses)
    ? ramData.topProcesses
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
      {/* 1. Header & Live Streaming RAM Optimizer Controls */}
      <div className="p-4 sm:p-6 border-b border-[var(--color-border)] bg-[var(--color-back-header)]/50 shrink-0 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <Activity className="w-5 h-5 text-[var(--color-action)] shrink-0" />
              <h1 className="text-lg sm:text-xl font-black text-[var(--color-text-header)] tracking-tight truncate">
                {isRtl
                  ? "مراقب موارد النظام ومُسرّع الرام"
                  : "System Resource & RAM Optimizer"}
              </h1>
              {lastUpdated && (
                <span
                  data-testid="ram-last-updated"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                >
                  <Clock className="w-3 h-3 shrink-0" />
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
                ? "مراقبة حية فورية (كل ثانيتين) لذاكرة الرام الفعلية والمعالج وأعلى العمليات استهلاكاً، مع تنظيف حقيقي للرام وإدارة خطوط Fontivo النشطة."
                : "Live 2-second streaming monitor for physical RAM, CPU, top processes, memory optimizer, and active Fontivo RAM fonts."}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              data-testid="ram-live-toggle"
              className={`h-9 px-3 rounded-xl text-xs font-semibold border flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
                autoRefresh
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-[var(--color-control)] text-[var(--color-text-muted)] border-[var(--color-border)]"
              }`}
            >
              {autoRefresh ? (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
              ) : (
                <Pause className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="whitespace-nowrap">
                {autoRefresh
                  ? isRtl
                    ? "مراقبة حية (2ث)"
                    : "Live (2s)"
                  : isRtl
                    ? "متوقف مؤقتاً"
                    : "Paused"}
              </span>
              {autoRefresh ? (
                <Pause className="w-3 h-3 opacity-70 shrink-0" />
              ) : (
                <Play className="w-3 h-3 shrink-0" />
              )}
            </button>

            <button
              onClick={fetchRamAndResources}
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] transition cursor-pointer shrink-0"
              title={isRtl ? "تحديث الآن" : "Refresh Now"}
            >
              <RefreshCw className="w-4 h-4 text-[var(--color-text-muted)]" />
            </button>

            <button
              onClick={handleOptimizeRamNow}
              disabled={optimizingRam}
              data-testid="optimize-ram-now-btn"
              className="h-9 px-4 rounded-xl bg-[var(--color-green)] hover:opacity-90 text-zinc-950 text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Zap
                className={`w-3.5 h-3.5 fill-current shrink-0 ${optimizingRam ? "animate-spin" : ""}`}
              />
              <span className="whitespace-nowrap">
                {optimizingRam
                  ? isRtl
                    ? "جاري التنظيف..."
                    : "Cleaning RAM..."
                  : isRtl
                    ? "تنظيف وتسريع الرام الآن"
                    : "Clean & Boost RAM Now"}
              </span>
            </button>

            <button
              onClick={handleDeepRamAndCachePurge}
              disabled={purging}
              className="h-9 px-3.5 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">
                {purging
                  ? isRtl
                    ? "جاري التنظيف الشامل..."
                    : "Purging..."
                  : isRtl
                    ? "تفريغ الخطوط والرام"
                    : "Deep RAM & Cache Purge"}
              </span>
            </button>
          </div>
        </div>

        {/* 4 Live Telemetry Cards: System RAM (Real Physical GB), CPU Usage & Cores, GPU / VRAM Usage, Fontivo Process RAM */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {/* Card 1: System RAM (Real 64-bit Physical RAM) */}
          <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-1.5 h-full flex flex-col justify-between">
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

          {/* Card 2: CPU Usage % & Cores */}
          <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-1.5 h-full flex flex-col justify-between">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-dim)] flex items-center justify-between">
              <span>{isRtl ? "استهلاك المعالج" : "CPU Usage & Cores"}</span>
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-xl font-black font-mono tabular-nums text-[var(--color-text-header)]">
                {hasLoadedTelemetry ? `${ramData.cpuPercent ?? 0}%` : "—"}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-emerald-400 font-bold">
                {ramData.cpuCores
                  ? `${ramData.cpuCores} ${isRtl ? "أنوية" : "Cores"}`
                  : "—"}
              </div>
            </div>
            <div className="w-full h-1.5 bg-[var(--color-control)] rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-500"
                style={{ width: `${ramData.cpuPercent ?? 0}%` }}
              />
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)] truncate">
              {ramData.cpuModel ||
                (isRtl ? "قياس حي للمعالج" : "Live CPU Monitor")}
            </div>
          </div>

          {/* Card 3: GPU / VRAM Usage */}
          <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-1.5 h-full flex flex-col justify-between">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-dim)] flex items-center justify-between">
              <span>{isRtl ? "معالج الرسوميات" : "GPU / VRAM Usage"}</span>
              <Monitor className="w-3.5 h-3.5 text-sky-400" />
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
                className="h-full bg-sky-400 transition-all duration-500"
                style={{ width: `${ramData.gpuPercent ?? 0}%` }}
              />
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)] truncate">
              {ramData.gpuName || "Hardware Rasterizer"}
            </div>
          </div>

          {/* Card 4: Fontivo Process RAM */}
          <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] space-y-1.5 h-full flex flex-col justify-between">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-dim)] flex items-center justify-between gap-2">
              <span className="truncate">
                {isRtl ? "استهلاك محرك Fontivo" : "Fontivo Process RAM"}
              </span>
              <Gauge className="w-3.5 h-3.5 text-[var(--color-green)] shrink-0" />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-xl font-black font-mono tabular-nums text-[var(--color-green)] whitespace-nowrap">
                {hasLoadedTelemetry
                  ? Math.round(ramData.processRamMb || ramData.ramMb || 0)
                  : "—"}{" "}
                <span className="text-xs font-normal text-[var(--color-text-muted)]">
                  MB
                </span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-green)]/15 text-[var(--color-green)] font-bold whitespace-nowrap shrink-0">
                {isRtl ? "خفيف وسريع" : "Lightweight"}
              </span>
            </div>
            <div className="text-[10px] font-mono tabular-nums text-[var(--color-text-muted)] flex items-center justify-between pt-1">
              <span>
                {isRtl ? "مقابض الخطوط:" : "Font Handles:"}{" "}
                {ramData.gdiHandlesCount ?? 0}
              </span>
              <span>
                {totalActiveCount} {isRtl ? "خط بالرام" : "RAM Fonts"}
              </span>
            </div>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between animate-in fade-in ${
              feedback.type === "error"
                ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === "error" ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-[11px] underline opacity-70 hover:opacity-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 2. Main Content: Real Top Memory-Consuming Processes Table + RAM Cache & Handles Breakdown */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Real Top Resource-Consuming Applications Table */}
          <div className="lg:col-span-2 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-xs flex flex-col">
            <div className="p-4 border-b border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2 min-w-0">
                  <Cpu className="w-4 h-4 text-[var(--color-action)] shrink-0" />
                  <span className="truncate">
                    {isRtl
                      ? "أعلى العمليات استهلاكاً للرام (مباشر)"
                      : "Top Resource-Consuming Applications"}
                  </span>
                </h2>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                  {isRtl
                    ? "تفريغ الصفحات الخاملة من الذاكرة للعمليات الحقيقية دون إغلاق أي برنامج."
                    : "Trim idle working set pages from real running processes without closing your apps."}
                </p>
              </div>
              <button
                onClick={handleOptimizeRamNow}
                disabled={optimizingRam}
                className="h-8 px-3 rounded-xl bg-[var(--color-action)]/15 hover:bg-[var(--color-action)] text-[var(--color-action)] hover:text-white border border-[var(--color-action)]/30 text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
              >
                {isRtl ? "تنظيف وتسريع الرام الآن" : "Trim RAM (All)"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left rtl:text-right whitespace-nowrap">
                <thead className="bg-[var(--color-back-subtle)] text-[10px] font-mono uppercase text-[var(--color-text-dim)] border-b border-[var(--color-border-subtle)]">
                  <tr>
                    <th className="py-2.5 px-4">
                      {isRtl ? "التطبيق" : "Process Name"}
                    </th>
                    <th className="py-2.5 px-3">
                      {isRtl ? "الحالة" : "Status"}
                    </th>
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
                          ? "جاري قراءة العمليات الحقيقية من نظام ويندوز..."
                          : "Reading live running processes from Windows..."}
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
                          <td className="py-2.5 px-4 font-bold text-[var(--color-text-header)] flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                            <span>{proc.name}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                              {isRtl ? "نشط" : "Active"}
                            </span>
                          </td>
                          <td
                            className="py-2.5 px-3 font-mono tabular-nums font-bold text-[var(--color-text-header)]"
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
                              className="h-7 px-2.5 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-action)] text-[var(--color-text-header)] hover:text-white border border-[var(--color-border)] hover:border-[var(--color-action)] text-[11px] font-semibold transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                            >
                              {isTrimming
                                ? isRtl
                                  ? "جاري التفريغ..."
                                  : "Trimming..."
                                : isRtl
                                  ? "تفريغ الرام"
                                  : "Trim RAM"}
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

          {/* Right Column: RAM Cache & Handles Breakdown */}
          <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl p-5 space-y-4 shadow-xs flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-[var(--color-text-header)] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[var(--color-green)]" />
                  <span>
                    {isRtl
                      ? "تفصيل الرام ومقابض النظام"
                      : "RAM Cache & Handles Breakdown"}
                  </span>
                </h2>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                  {isRtl
                    ? "قراءة حية لذاكرة الجهاز الفعلية والخطوط المفعلة."
                    : "Live breakdown of physical system RAM and active Fontivo fonts."}
                </p>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">
                    {isRtl ? "إجمالي الرام الفعلي" : "Total Physical RAM"}
                  </span>
                  <span
                    className="font-mono tabular-nums font-bold text-[var(--color-text-header)]"
                    dir="ltr"
                  >
                    {hasLoadedTelemetry
                      ? `${totalRamGb} (${Math.round(ramData.systemTotalMb || 0).toLocaleString()} MB)`
                      : "—"}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">
                    {isRtl
                      ? "خطوط Fontivo المفعلة بالرام"
                      : "Active Fontivo RAM Fonts"}
                  </span>
                  <span
                    className="font-mono tabular-nums font-bold text-[var(--color-green)]"
                    dir="ltr"
                  >
                    {totalActiveCount} ({estimatedFontRamMb} MB)
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">
                    {isRtl ? "مقابض الخطوط النشطة" : "Active Font Handles"}
                  </span>
                  <span
                    className="font-mono tabular-nums font-bold text-[var(--color-text-header)]"
                    dir="ltr"
                  >
                    {ramData.gdiHandlesCount ?? 0} / 10,000
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border-subtle)] flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">
                    {isRtl ? "المستخدم حالياً" : "Used System RAM"}
                  </span>
                  <span
                    className="font-mono tabular-nums font-bold text-amber-400"
                    dir="ltr"
                  >
                    {hasLoadedTelemetry
                      ? `${usedRamGb} (${Math.round(ramData.systemUsedMb || 0).toLocaleString()} MB)`
                      : "—"}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleOptimizeRamNow}
              disabled={optimizingRam}
              className="w-full h-9 px-4 rounded-xl bg-[var(--color-green)] hover:opacity-90 text-zinc-950 text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>
                {optimizingRam
                  ? isRtl
                    ? "جاري تنظيف وتسريع الرام..."
                    : "Optimizing RAM..."
                  : isRtl
                    ? "تنظيف وتسريع الرام الآن"
                    : "Clean & Boost RAM Now"}
              </span>
            </button>
          </div>
        </div>

        {/* Active RAM Fonts List (STRICTLY Fontivo RAM-activated fonts, NEVER Windows system fonts) */}
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] px-1">
            <span className="font-bold text-[var(--color-text-header)]">
              {isRtl
                ? `خطوط Fontivo المفعلة حالياً في الرام (${totalActiveCount})`
                : `Active Fontivo Fonts Injected in RAM (${totalActiveCount})`}
            </span>
            <span className="text-[11px]">
              {isRtl
                ? "تفعيل مؤقت بالرام فقط"
                : "Temporary RAM-Only Activation"}
            </span>
          </div>

          {totalActiveCount === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center gap-2 text-center border border-dashed border-[var(--color-border)] rounded-2xl p-6 bg-[var(--color-back-card)]/40">
              <Zap className="w-6 h-6 text-[var(--color-green)]" />
              <h3 className="text-sm font-bold text-[var(--color-text-header)]">
                {isRtl
                  ? "لا توجد خطوط مفعلة بالرام عبر Fontivo حالياً"
                  : "No Fontivo Fonts Currently Active in RAM"}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] max-w-md">
                {isRtl
                  ? "خطوط ويندوز المثبتة بالنظام لا تُحسب هنا. عند تفعيل أي خط محلي أو من خطوط جوجل عبر Fontivo سيظهر هنا فوراً مع خيار إلغاء التفعيل بنقرة واحدة."
                  : "Windows system fonts are excluded here. Activate any local or Google font via Fontivo and it will appear here for 1-click deactivation."}
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
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-green)] shrink-0 animate-pulse" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-bold text-[var(--color-text-header)] truncate">
                            {font.family || font.name}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--color-control)] border border-[var(--color-border)] text-[var(--color-text-muted)] whitespace-nowrap shrink-0">
                            {font.format || "TTF"}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--color-green)] bg-[var(--color-green)]/10 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap shrink-0">
                            RAM Active
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[var(--color-text-dim)] truncate mt-0.5">
                          {font.path || "Virtual Memory Handle"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <span className="text-xs font-mono text-[var(--color-text-muted)] whitespace-nowrap shrink-0">
                        ~{font.sizeKb || font.memoryKb || 140} KB RAM
                      </span>
                      <button
                        onClick={() => handleUnloadFont(font)}
                        disabled={isUnloading}
                        className="h-8 px-3 rounded-xl text-xs font-semibold text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-action)] border border-[var(--color-border)] hover:border-[var(--color-action)] transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap shrink-0"
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
    </div>
  );
}
