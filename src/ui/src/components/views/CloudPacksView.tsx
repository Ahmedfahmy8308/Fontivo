import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Search,
  FolderOpen,
  RotateCcw,
  Clock,
  ShieldCheck,
  Layers,
} from "lucide-react";
import { safeFetchJson } from "../../utils/safeFetch";
import {
  upsertLiveOperation,
  formatTransferSpeed,
} from "../../utils/operationsBus";
import {
  CloudPackage,
  VERIFIED_CLOUD_PACKAGES,
  CLOUD_MANIFEST_VERSION,
  formatCloudBytes,
  normalizeManifestPackages,
} from "../../utils/cloudPackages";

export interface PackDownloadState {
  jobId?: string;
  progressPercent: number;
  bytesDownloaded: number;
  totalBytes: number;
  phase:
    | "Queued"
    | "Downloading"
    | "Verifying"
    | "Extracting"
    | "Indexing"
    | "Completed"
    | "Failed"
    | "Cancelled";
  speedBps?: number;
  etaSeconds?: number;
  extractedCount?: number;
  indexedCount?: number;
  error?: string | null;
}

export interface CloudPacksViewProps {
  onRefreshLibrary?: () => void;
  onRefreshStats?: () => void;
  isRtl?: boolean;
  t?: Record<string, string>;
}

const ACTIVE_PHASES = new Set<PackDownloadState["phase"]>([
  "Queued",
  "Downloading",
  "Verifying",
  "Extracting",
  "Indexing",
]);

export function normalizeJobPhase(
  rawPhase?: string,
): PackDownloadState["phase"] {
  switch (
    String(rawPhase || "")
      .trim()
      .toLowerCase()
  ) {
    case "queued":
      return "Queued";
    case "verifying":
      return "Verifying";
    case "extracting":
      return "Extracting";
    case "indexing":
      return "Indexing";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "downloading":
    default:
      return "Downloading";
  }
}

export function formatPhaseLabel(
  phase: PackDownloadState["phase"],
  isRtl: boolean,
): string {
  switch (phase) {
    case "Queued":
      return isRtl ? "في قائمة الانتظار..." : "Queued...";
    case "Downloading":
      return isRtl ? "جاري التنزيل..." : "Downloading...";
    case "Verifying":
      return isRtl ? "التحقق من SHA-256..." : "Verifying SHA-256...";
    case "Extracting":
      return isRtl ? "جاري فك الضغط..." : "Extracting archive...";
    case "Indexing":
      return isRtl ? "جاري الفهرسة بالمكتبة..." : "Indexing fonts...";
    case "Completed":
      return isRtl ? "اكتمل التثبيت ✓" : "Installed ✓";
    case "Failed":
      return isRtl ? "فشل التنزيل" : "Download failed";
    case "Cancelled":
      return isRtl ? "تم الإلغاء" : "Cancelled";
  }
}

function getPackIndexLabel(pack: CloudPackage, fallbackIndex: number): string {
  const match = pack.id.match(/(\d+)$/);
  return match
    ? match[1].padStart(3, "0")
    : String(fallbackIndex + 1).padStart(3, "0");
}

export default function CloudPacksView({
  onRefreshLibrary,
  isRtl = false,
}: CloudPacksViewProps) {
  const [packages, setPackages] = useState<CloudPackage[]>(
    VERIFIED_CLOUD_PACKAGES,
  );
  const [libraryVersion, setLibraryVersion] = useState<string>(
    CLOUD_MANIFEST_VERSION,
  );
  const [downloadedPackIds, setDownloadedPackIds] = useState<Set<string>>(
    () => {
      try {
        const saved = localStorage.getItem("fontivo_downloaded_pack_ids");
        if (saved) return new Set(JSON.parse(saved));
      } catch {
        // ignore storage errors
      }
      return new Set<string>();
    },
  );

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [downloadStates, setDownloadStates] = useState<
    Record<string, PackDownloadState>
  >({});
  const [isDownloadingAll, setIsDownloadingAll] = useState<boolean>(false);
  const [checkingUpdates, setCheckingUpdates] = useState<boolean>(false);
  const [bannerMsg, setBannerMsg] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const completedNotifiedRef = useRef<Set<string>>(new Set());
  const packagesRef = useRef<CloudPackage[]>(packages);
  packagesRef.current = packages;
  const libraryVersionRef = useRef<string>(libraryVersion);
  libraryVersionRef.current = libraryVersion;

  const markPackDownloaded = useCallback((packId: string) => {
    setDownloadedPackIds((prev) => {
      if (prev.has(packId)) return prev;
      const next = new Set(prev);
      next.add(packId);
      try {
        localStorage.setItem(
          "fontivo_downloaded_pack_ids",
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const syncDownloadJobs = useCallback(async () => {
    try {
      const res = await safeFetchJson<any>("/api/download/status", {
        timeoutMs: 4000,
        cache: "no-store",
      });

      const jobs: any[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.jobs)
          ? res.jobs
          : [];
      if (jobs.length === 0) return;

      let newlyCompleted = false;
      let anyActive = false;

      setDownloadStates((prev) => {
        const next = { ...prev };
        for (const job of jobs) {
          const packId = String(job.packId || "");
          if (!packId) continue;

          const matchedPack = packagesRef.current.find((p) => p.id === packId);
          const phase = normalizeJobPhase(job.phase);
          if (ACTIVE_PHASES.has(phase)) anyActive = true;

          const totalBytes = Math.max(
            Number(job.totalBytes ?? 0),
            matchedPack?.compressedBytes ?? 0,
          );
          const bytesDownloaded = Number(job.bytesDownloaded ?? 0);
          const rawPct = Number(job.progressPercent ?? 0);
          const progressPercent =
            phase === "Completed"
              ? 100
              : Math.min(
                  100,
                  Math.max(
                    0,
                    rawPct > 0
                      ? rawPct
                      : totalBytes > 0
                        ? (bytesDownloaded / totalBytes) * 100
                        : 0,
                  ),
                );

          next[packId] = {
            jobId: job.jobId,
            progressPercent,
            bytesDownloaded,
            totalBytes,
            phase,
            speedBps: Number(job.speedBps ?? 0),
            etaSeconds: Number(job.etaSeconds ?? 0),
            extractedCount: Number(job.extractedCount ?? 0),
            indexedCount: Number(job.indexedCount ?? 0),
            error: job.error ?? null,
          };

          const packVer = matchedPack?.version || libraryVersionRef.current;
          const packTitleEn = matchedPack?.name || job.packName || packId;
          const packTitleAr = matchedPack?.nameAr || job.packName || packId;
          upsertLiveOperation({
            id: `dl-${job.jobId || packId}`,
            title: `${packTitleEn} (v${packVer})`,
            titleAr: `${packTitleAr} (v${packVer})`,
            category: "download",
            status:
              phase === "Completed"
                ? "completed"
                : phase === "Failed" || phase === "Cancelled"
                  ? "failed"
                  : phase === "Queued"
                    ? "queued"
                    : "running",
            progressPercent: Math.round(progressPercent),
            stepLabel: formatPhaseLabel(phase, false),
            stepLabelAr: formatPhaseLabel(phase, true),
            bytesDone: bytesDownloaded,
            bytesTotal: totalBytes,
            speedBps: Number(job.speedBps ?? 0),
            error: job.error ?? null,
          });

          if (
            phase === "Completed" &&
            !completedNotifiedRef.current.has(packId)
          ) {
            completedNotifiedRef.current.add(packId);
            newlyCompleted = true;
            markPackDownloaded(packId);
          }
        }
        return next;
      });

      if (!anyActive) {
        setIsDownloadingAll(false);
      }
      if (newlyCompleted && onRefreshLibrary) {
        onRefreshLibrary();
      }
    } catch {
      // ignore polling jitter when server is busy
    }
  }, [markPackDownloaded, onRefreshLibrary]);

  const loadManifest = useCallback(async () => {
    try {
      let data = await safeFetchJson<any>("/api/catalog/packages", {
        timeoutMs: 5000,
      });
      if (!data) {
        data = await safeFetchJson<any>("/api/library/manifest", {
          timeoutMs: 5000,
        });
      }
      if (data) {
        const normalized = normalizeManifestPackages(data);
        if (normalized.packages.length > 0) {
          setPackages(normalized.packages);
          const downloaded = normalized.packages
            .filter((p) => p.isDownloaded)
            .map((p) => p.id);
          if (downloaded.length > 0) {
            setDownloadedPackIds((prev) => {
              const next = new Set(prev);
              downloaded.forEach((id) => next.add(id));
              try {
                localStorage.setItem(
                  "fontivo_downloaded_pack_ids",
                  JSON.stringify(Array.from(next)),
                );
              } catch {
                // ignore storage errors
              }
              return next;
            });
          }
        }
        if (normalized.libraryVersion) {
          setLibraryVersion(normalized.libraryVersion);
        }
      }
    } catch {
      // fallback to built-in VERIFIED_CLOUD_PACKAGES
    }
  }, []);

  useEffect(() => {
    loadManifest();
    syncDownloadJobs();
  }, [loadManifest, syncDownloadJobs]);

  const hasActiveDownloads = useMemo(() => {
    return Object.values(downloadStates).some((st) =>
      ACTIVE_PHASES.has(st.phase),
    );
  }, [downloadStates]);

  useEffect(() => {
    if (!hasActiveDownloads && !isDownloadingAll) return;
    const timer = setInterval(syncDownloadJobs, 850);
    return () => clearInterval(timer);
  }, [hasActiveDownloads, isDownloadingAll, syncDownloadJobs]);

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    setBannerMsg(null);
    try {
      const data = await safeFetchJson<any>("/api/catalog/refresh-manifest", {
        timeoutMs: 8000,
      });
      if (data && (data.success || data.packages)) {
        const normalized = normalizeManifestPackages(data);
        if (normalized.packages.length > 0) {
          setPackages(normalized.packages);
        }
        if (normalized.libraryVersion) {
          setLibraryVersion(normalized.libraryVersion);
        }
        setBannerMsg({
          type: "success",
          text: isRtl
            ? `تم التحقق من التحديثات السحابية بنجاح! الإصدار الحالي: v${normalized.libraryVersion}`
            : `Cloud manifest checked successfully! Current version: v${normalized.libraryVersion}`,
        });
      } else {
        setBannerMsg({
          type: "info",
          text: isRtl
            ? "المكتبة السحابية محدثة إلى آخر إصدار رسمي."
            : "Cloud library is already at the latest official revision.",
        });
      }
    } catch {
      setBannerMsg({
        type: "error",
        text: isRtl
          ? "تعذر الاتصال بـ GitHub للتحقق من التحديثات. يرجى مراجعة اتصال الإنترنت."
          : "Could not reach GitHub releases for update verification.",
      });
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleOpenDownloadsFolder = async () => {
    try {
      await safeFetchJson("/api/library/open-downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "packs" }),
        timeoutMs: 4000,
      });
    } catch {
      // ignore
    }
  };

  const handleDownloadPack = async (pack: CloudPackage) => {
    completedNotifiedRef.current.delete(pack.id);
    setDownloadStates((prev) => ({
      ...prev,
      [pack.id]: {
        progressPercent: 2,
        bytesDownloaded: 0,
        totalBytes: pack.compressedBytes,
        phase: "Queued",
        error: null,
      },
    }));

    const packVer = pack.version || libraryVersion;
    upsertLiveOperation({
      id: `dl-job-${pack.id}`,
      title: `${pack.name} (v${packVer})`,
      titleAr: `${pack.nameAr} (v${packVer})`,
      category: "download",
      status: "queued",
      progressPercent: 2,
      stepLabel: "Queued...",
      stepLabelAr: "في قائمة الانتظار...",
      bytesDone: 0,
      bytesTotal: pack.compressedBytes,
    });

    try {
      const res = await safeFetchJson<any>("/api/catalog/download-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id }),
        timeoutMs: 15000,
      });

      if (res && res.jobId) {
        setDownloadStates((prev) => ({
          ...prev,
          [pack.id]: {
            ...prev[pack.id],
            jobId: res.jobId,
            phase: "Downloading",
          },
        }));
        await syncDownloadJobs();
      } else if (res && res.alreadyDownloaded) {
        markPackDownloaded(pack.id);
        setDownloadStates((prev) => ({
          ...prev,
          [pack.id]: {
            progressPercent: 100,
            bytesDownloaded: pack.compressedBytes,
            totalBytes: pack.compressedBytes,
            phase: "Completed",
          },
        }));
      } else {
        throw new Error(res?.error || "Failed to start pack download");
      }
    } catch (e: any) {
      setDownloadStates((prev) => ({
        ...prev,
        [pack.id]: {
          progressPercent: 0,
          bytesDownloaded: 0,
          totalBytes: pack.compressedBytes,
          phase: "Failed",
          error: e?.message || "Download failed",
        },
      }));
    }
  };

  const handleRetryPack = async (pack: CloudPackage) => {
    const existingJobId = downloadStates[pack.id]?.jobId;
    if (existingJobId) {
      completedNotifiedRef.current.delete(pack.id);
      setDownloadStates((prev) => ({
        ...prev,
        [pack.id]: {
          ...prev[pack.id],
          phase: "Queued",
          progressPercent: 2,
          error: null,
        },
      }));
      try {
        const retryRes = await safeFetchJson<any>("/api/download/retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: existingJobId }),
          timeoutMs: 10000,
        });
        if (retryRes?.success) {
          await syncDownloadJobs();
          return;
        }
      } catch {
        // fallback to fresh start_pack_download below
      }
    }
    await handleDownloadPack(pack);
  };

  const handleDownloadAll = async () => {
    setIsDownloadingAll(true);
    setBannerMsg(null);

    try {
      const res = await safeFetchJson<any>("/api/catalog/download-all", {
        method: "POST",
        timeoutMs: 25000,
      });

      const queuedList: any[] = Array.isArray(res?.queued)
        ? res.queued
        : Array.isArray(res?.queuedJobs)
          ? res.queuedJobs
          : [];
      const alreadyDoneIds: string[] = Array.isArray(res?.alreadyDownloaded)
        ? res.alreadyDownloaded
        : [];

      alreadyDoneIds.forEach((id) => markPackDownloaded(id));

      if (queuedList.length > 0) {
        setDownloadStates((prev) => {
          const next = { ...prev };
          for (const item of queuedList) {
            const packId = String(item.packId || "");
            if (!packId) continue;
            const packMeta = packagesRef.current.find((p) => p.id === packId);
            const totalBytes = Number(
              item.totalBytes ?? packMeta?.compressedBytes ?? 0,
            );
            const isFailed =
              String(item.status || "").toLowerCase() === "failed";
            const packVer =
              item.version || packMeta?.version || libraryVersionRef.current;

            next[packId] = {
              jobId: item.jobId,
              progressPercent: isFailed ? 0 : 2,
              bytesDownloaded: 0,
              totalBytes,
              phase: isFailed ? "Failed" : "Queued",
              error: item.error ?? null,
            };

            upsertLiveOperation({
              id: `dl-${item.jobId || packId}`,
              title: `${packMeta?.name || item.packName || packId} (v${packVer})`,
              titleAr: `${packMeta?.nameAr || item.packName || packId} (v${packVer})`,
              category: "download",
              status: isFailed ? "failed" : "queued",
              progressPercent: isFailed ? 0 : 2,
              stepLabel: isFailed ? "Failed to queue" : "Queued...",
              stepLabelAr: isFailed
                ? "فشل بدء التحميل"
                : "في قائمة الانتظار...",
              bytesDone: 0,
              bytesTotal: totalBytes,
              error: item.error ?? null,
            });
          }
          return next;
        });

        await syncDownloadJobs();
      } else if (alreadyDoneIds.length > 0) {
        setIsDownloadingAll(false);
        setBannerMsg({
          type: "success",
          text: isRtl
            ? `جميع الحزم المعتمدة (${alreadyDoneIds.length}) محملة ومثبتة بالفعل بالمكتبة!`
            : `All ${alreadyDoneIds.length} verified cloud packs are already downloaded!`,
        });
      } else {
        setIsDownloadingAll(false);
      }
    } catch (e: any) {
      setIsDownloadingAll(false);
      setBannerMsg({
        type: "error",
        text:
          e?.message ||
          (isRtl
            ? "تعذر بدء تنزيل جميع الحزم."
            : "Failed to start batch pack download."),
      });
    }
  };

  const categories = useMemo(() => {
    const seen = new Map<string, { en: string; ar: string }>();
    packages.forEach((p) => {
      if (p.category && !seen.has(p.category)) {
        seen.set(p.category, {
          en: p.categoryLabel || p.category,
          ar: p.categoryLabelAr || p.categoryLabel || p.category,
        });
      }
    });
    return Array.from(seen.entries()).map(([key, labels]) => ({
      key,
      label: isRtl ? labels.ar : labels.en,
    }));
  }, [packages, isRtl]);

  const filteredPackages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return packages.filter((p) => {
      const matchesCat =
        activeCategory === "all" ||
        p.category.toLowerCase() === activeCategory.toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.nameAr.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.descriptionAr.toLowerCase().includes(q) ||
        p.fileName.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [packages, activeCategory, searchQuery]);

  const totalPackFonts = useMemo(() => {
    return packages.reduce((acc, p) => acc + (p.fontCount || 0), 0);
  }, [packages]);

  const totalCompressedBytes = useMemo(() => {
    return packages.reduce((acc, p) => acc + (p.compressedBytes || 0), 0);
  }, [packages]);

  const queueTelemetry = useMemo(() => {
    const entries = Object.entries(downloadStates);
    if (entries.length === 0) return null;

    let activeCount = 0;
    let queuedCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    let bytesDone = 0;
    let bytesTotal = 0;
    let totalSpeedBps = 0;
    let currentPack: CloudPackage | null = null;
    let currentState: PackDownloadState | null = null;

    for (const [packId, st] of entries) {
      bytesDone += st.bytesDownloaded || 0;
      bytesTotal += st.totalBytes || 0;
      if (st.phase === "Queued") {
        queuedCount += 1;
      } else if (ACTIVE_PHASES.has(st.phase)) {
        activeCount += 1;
        totalSpeedBps += st.speedBps || 0;
        if (!currentPack) {
          currentPack = packages.find((p) => p.id === packId) || null;
          currentState = st;
        }
      } else if (st.phase === "Completed") {
        completedCount += 1;
      } else if (st.phase === "Failed") {
        failedCount += 1;
      }
    }

    if (activeCount === 0 && queuedCount === 0 && failedCount === 0) {
      return null;
    }

    const overallPercent =
      bytesTotal > 0
        ? Math.min(100, Math.round((bytesDone / bytesTotal) * 100))
        : entries.length > 0
          ? Math.round(
              entries.reduce((s, [, st]) => s + st.progressPercent, 0) /
                entries.length,
            )
          : 0;

    return {
      totalTracked: entries.length,
      activeCount,
      queuedCount,
      completedCount,
      failedCount,
      bytesDone,
      bytesTotal,
      overallPercent,
      totalSpeedBps,
      currentPack,
      currentState,
    };
  }, [downloadStates, packages]);

  return (
    <div
      className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none w-full"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-[var(--color-border)] gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text-header)] truncate">
                {isRtl ? "المكتبة السحابية وحزم الخطوط" : "Cloud Font Packs"}
              </h1>
              <span
                dir="ltr"
                className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[var(--color-action)]/15 text-[var(--color-action)] border border-[var(--color-action)]/30 shrink-0"
              >
                v{libraryVersion}
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1.5 leading-relaxed max-w-2xl">
              {isRtl ? (
                <>
                  {packages.length} حزمة معتمدة تضم أكثر من{" "}
                  <span dir="ltr" className="inline-block font-semibold">
                    {totalPackFonts.toLocaleString()}
                  </span>{" "}
                  خطاً عربياً ولاتينياً عالي الجودة (
                  <span dir="ltr" className="inline-block font-mono">
                    {formatCloudBytes(totalCompressedBytes)}
                  </span>
                  ) موثقة بـ SHA-256 بدون روابط خارجية.
                </>
              ) : (
                <>
                  {packages.length} curated verified packs containing{" "}
                  {totalPackFonts.toLocaleString()} high-grade typography fonts
                  ({formatCloudBytes(totalCompressedBytes)}) with SHA-256
                  verification.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleOpenDownloadsFolder}
              className="h-9 px-3 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-header)] flex items-center gap-1.5 transition cursor-pointer"
              title={
                isRtl
                  ? "فتح مجلد حزم الخطوط المنزلة داخل AppData"
                  : "Open Downloaded Cloud Packs Folder"
              }
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>{isRtl ? "مجلد الحزم المنزلة" : "Packs Folder"}</span>
            </button>

            <button
              onClick={handleCheckUpdates}
              disabled={checkingUpdates}
              className="h-9 px-3 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-header)] flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              title={
                isRtl
                  ? "التحقق من التحديثات السحابية عبر GitHub"
                  : "Check for Remote Updates"
              }
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${checkingUpdates ? "animate-spin text-[var(--color-action)]" : ""}`}
              />
              <span>{isRtl ? "التحقق من التحديثات" : "Check Updates"}</span>
            </button>

            <button
              onClick={handleDownloadAll}
              disabled={isDownloadingAll || hasActiveDownloads}
              className="h-9 px-4 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-60"
            >
              {isDownloadingAll || hasActiveDownloads ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>
                {isDownloadingAll || hasActiveDownloads
                  ? isRtl
                    ? "جاري تنزيل الحزم..."
                    : "Downloading Packs..."
                  : isRtl
                    ? "تنزيل جميع الحزم"
                    : "Download All Packs"}
              </span>
            </button>
          </div>
        </div>

        {/* Live Aggregate Download Strip (Visible during active / queued / batch runs) */}
        {queueTelemetry && (
          <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-action)]/45 shadow-[0_8px_28px_rgba(241,107,80,0.12)] space-y-3 animate-in fade-in-50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-action)] animate-pulse shrink-0" />
                <span className="text-xs font-bold text-[var(--color-text-header)] truncate">
                  {queueTelemetry.currentPack
                    ? isRtl
                      ? `جاري العمل الآن: ${queueTelemetry.currentPack.nameAr}`
                      : `Active Now: ${queueTelemetry.currentPack.name}`
                    : isRtl
                      ? "متابعة طابور تنزيل الحزم السحابية"
                      : "Cloud Font Packs Download Queue"}
                </span>
                <span
                  dir="ltr"
                  className="px-2 py-0.5 rounded-md bg-[var(--color-action)]/15 text-[var(--color-action)] border border-[var(--color-action)]/30 font-mono text-[10px] font-bold shrink-0"
                >
                  v{queueTelemetry.currentPack?.version || libraryVersion}
                </span>
                {queueTelemetry.currentPack && (
                  <span
                    dir="ltr"
                    className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-[var(--color-control)] text-[var(--color-text-muted)] font-mono text-[10px]"
                  >
                    {queueTelemetry.currentPack.fileName}
                  </span>
                )}
              </div>

              <div
                className="flex flex-wrap items-center gap-2 text-[11px] font-mono shrink-0"
                dir="ltr"
              >
                <span className="px-2 py-0.5 rounded-md bg-[var(--color-control)] text-[var(--color-text-muted)]">
                  {queueTelemetry.completedCount}/{queueTelemetry.totalTracked}{" "}
                  {isRtl ? "حزمة" : "packs"}
                </span>
                {queueTelemetry.totalSpeedBps > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-bold">
                    {formatTransferSpeed(queueTelemetry.totalSpeedBps)}
                  </span>
                )}
                <span className="text-[var(--color-action)] font-bold">
                  {queueTelemetry.overallPercent}%
                </span>
              </div>
            </div>

            <div className="w-full h-2.5 rounded-full bg-[var(--color-control)] fontivo-progress-track">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--color-action)] via-[#f7b544] to-[var(--color-action)] transition-all duration-300 fontivo-progress-fill"
                style={{
                  width: `${Math.max(4, queueTelemetry.overallPercent)}%`,
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--color-text-muted)]">
              <div className="flex items-center gap-3">
                <span>
                  {isRtl
                    ? `نشط: ${queueTelemetry.activeCount} • في الانتظار: ${queueTelemetry.queuedCount} • مكتمل: ${queueTelemetry.completedCount}`
                    : `Active: ${queueTelemetry.activeCount} • Queued: ${queueTelemetry.queuedCount} • Completed: ${queueTelemetry.completedCount}`}
                </span>
                {queueTelemetry.failedCount > 0 && (
                  <span className="text-rose-400 font-semibold">
                    {isRtl
                      ? `• تعذر تنزيل ${queueTelemetry.failedCount}`
                      : `• Failed: ${queueTelemetry.failedCount}`}
                  </span>
                )}
              </div>
              <span
                dir="ltr"
                className="font-mono font-semibold text-[var(--color-text-header)]"
              >
                {formatCloudBytes(queueTelemetry.bytesDone)} /{" "}
                {formatCloudBytes(queueTelemetry.bytesTotal)}
              </span>
            </div>
          </div>
        )}

        {/* Global Banner Notification */}
        {bannerMsg && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-2.5 transition animate-in fade-in-50 ${
              bannerMsg.type === "success"
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : bannerMsg.type === "error"
                  ? "bg-rose-500/15 border-rose-500/30 text-rose-400"
                  : "bg-[var(--color-secondary)]/15 border-[var(--color-secondary)]/30 text-[var(--color-secondary)]"
            }`}
          >
            {bannerMsg.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{bannerMsg.text}</span>
          </div>
        )}

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Categories Tab Strip */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveCategory("all")}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                activeCategory === "all"
                  ? "bg-[var(--color-action)] text-white"
                  : "bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
              }`}
            >
              {isRtl ? "جميع الحزم" : "All Packs"} ({packages.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  activeCategory.toLowerCase() === cat.key.toLowerCase()
                    ? "bg-[var(--color-action)] text-white"
                    : "bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isRtl ? "بحث في الحزم السحابية..." : "Search cloud packs..."
              }
              className="w-full h-8 ps-9 pe-3 rounded-xl bg-[var(--color-back-card)] border border-[var(--color-border)] focus:border-[var(--color-action)] text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-muted)] outline-none"
            />
          </div>
        </div>

        {/* Packs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPackages.map((pack, idx) => {
            const state = downloadStates[pack.id];
            const isDownloaded =
              downloadedPackIds.has(pack.id) ||
              pack.isDownloaded ||
              state?.phase === "Completed";
            const isBusy = Boolean(state && ACTIVE_PHASES.has(state.phase));
            const isQueued = state?.phase === "Queued";
            const isFailed = state?.phase === "Failed";
            const packVer = pack.version || libraryVersion;
            const packNum = getPackIndexLabel(pack, idx);
            const displayPct = Math.round(state?.progressPercent ?? 0);
            const totalTransferBytes =
              state?.totalBytes || pack.compressedBytes || 0;
            const doneTransferBytes = state?.bytesDownloaded ?? 0;
            const speedText = formatTransferSpeed(state?.speedBps);

            return (
              <div
                key={pack.id}
                data-pack-id={pack.id}
                data-pack-phase={
                  state?.phase || (isDownloaded ? "Installed" : "Idle")
                }
                className={`p-5 rounded-2xl bg-[var(--color-back-card)] border transition-all duration-300 flex flex-col justify-between space-y-4 shadow-xs ${
                  isBusy && !isQueued
                    ? "border-[var(--color-action)]/80 ring-1 ring-[var(--color-action)]/35 shadow-[0_0_24px_rgba(241,107,80,0.16)]"
                    : isQueued
                      ? "border-[var(--color-secondary)]/55 ring-1 ring-[var(--color-secondary)]/20"
                      : isFailed
                        ? "border-rose-500/55"
                        : isDownloaded
                          ? "border-emerald-500/35 hover:border-emerald-500/60"
                          : "border-[var(--color-border)] hover:border-[var(--color-action)]/50"
                }`}
              >
                <div className="space-y-2.5">
                  {/* Top Badges: Category + Pack Index & Version + Installed/Size/Live % */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-[var(--color-control)] text-[var(--color-text-dim)] text-[10px] uppercase font-bold shrink-0">
                        {isRtl
                          ? pack.categoryLabelAr || pack.category
                          : pack.categoryLabel || pack.category || "General"}
                      </span>
                      <span
                        dir="ltr"
                        className="px-2 py-0.5 rounded-md bg-[var(--color-secondary)]/12 text-[var(--color-secondary)] border border-[var(--color-secondary)]/25 font-mono text-[10px] font-bold shrink-0"
                      >
                        {`#${packNum} • v${packVer}`}
                      </span>
                    </div>

                    {isBusy ? (
                      <span
                        dir="ltr"
                        className="px-2.5 py-0.5 rounded-full bg-[var(--color-action)]/15 text-[var(--color-action)] border border-[var(--color-action)]/35 font-mono font-bold text-[10px] flex items-center gap-1.5 shrink-0"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-action)] animate-ping" />
                        <span>{displayPct}%</span>
                      </span>
                    ) : isDownloaded ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold text-[10px] flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{isRtl ? "محمل بالمكتبة" : "Installed"}</span>
                      </span>
                    ) : (
                      <span
                        dir="ltr"
                        className="px-2 py-0.5 rounded-full bg-[var(--color-control)] text-[var(--color-text-muted)] font-mono text-[10px] font-semibold shrink-0"
                      >
                        {formatCloudBytes(pack.compressedBytes)}
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-[var(--color-text-header)] line-clamp-1">
                      {isRtl ? pack.nameAr || pack.name : pack.name}
                    </h3>
                    <div
                      dir="ltr"
                      className="text-[10px] font-mono text-[var(--color-text-dim)] truncate mt-0.5"
                    >
                      {pack.fileName}
                    </div>
                  </div>

                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed line-clamp-2">
                    {isRtl
                      ? pack.descriptionAr || pack.description
                      : pack.description}
                  </p>
                </div>

                <div className="space-y-3 pt-3 border-t border-[var(--color-border-subtle)]">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[var(--color-text-muted)] gap-2">
                    <span>
                      {pack.fontCount.toLocaleString()} {isRtl ? "خط" : "fonts"}
                    </span>
                    <span className="flex items-center gap-1">
                      <span dir="ltr" className="inline-block">
                        {formatCloudBytes(pack.uncompressedBytes)}
                      </span>
                      <span>{isRtl ? "مستخرج" : "extracted"}</span>
                    </span>
                  </div>

                  {/* Animated Progress Panel inside Card */}
                  {isBusy && state && (
                    <div className="p-2.5 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-action)]/25 space-y-2 animate-in fade-in-50">
                      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold">
                        <span className="flex items-center gap-1.5 text-[var(--color-action)]">
                          {isQueued ? (
                            <Clock className="w-3 h-3 animate-pulse shrink-0" />
                          ) : state.phase === "Verifying" ? (
                            <ShieldCheck className="w-3 h-3 animate-pulse shrink-0" />
                          ) : state.phase === "Indexing" ? (
                            <Layers className="w-3 h-3 animate-pulse shrink-0" />
                          ) : (
                            <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                          )}
                          <span>{formatPhaseLabel(state.phase, isRtl)}</span>
                        </span>
                        <div
                          className="flex items-center gap-2 font-mono shrink-0"
                          dir="ltr"
                        >
                          {speedText && (
                            <span className="text-emerald-400 font-bold">
                              {speedText}
                            </span>
                          )}
                          <span className="text-[var(--color-text-header)] font-bold">
                            {displayPct}%
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-2.5 rounded-full bg-[var(--color-control)] fontivo-progress-track">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isQueued
                              ? "bg-[var(--color-secondary)]/70 animate-pulse"
                              : state.phase === "Verifying"
                                ? "bg-amber-400 fontivo-progress-fill"
                                : state.phase === "Extracting" ||
                                    state.phase === "Indexing"
                                  ? "bg-emerald-400 fontivo-progress-fill"
                                  : "bg-[var(--color-action)] fontivo-progress-fill"
                          }`}
                          style={{
                            width: `${isQueued ? 10 : Math.max(4, displayPct)}%`,
                          }}
                        />
                      </div>

                      <div
                        className="flex items-center justify-between text-[10px] font-mono text-[var(--color-text-muted)]"
                        dir="ltr"
                      >
                        <span>
                          {formatCloudBytes(doneTransferBytes)} /{" "}
                          {formatCloudBytes(totalTransferBytes)}
                        </span>
                        {state.extractedCount && state.extractedCount > 0 ? (
                          <span className="text-emerald-400">
                            {state.indexedCount && state.indexedCount > 0
                              ? `${state.indexedCount} indexed`
                              : `${state.extractedCount} extracted`}
                          </span>
                        ) : (
                          <span>v{packVer}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Failed Card Callout */}
                  {isFailed && state && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{formatPhaseLabel("Failed", isRtl)}</span>
                      </div>
                      {state.error && (
                        <p
                          dir="ltr"
                          className="text-[10px] font-mono text-rose-200/85 line-clamp-2 break-words"
                        >
                          {state.error}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Action Button */}
                  <button
                    onClick={() =>
                      isFailed
                        ? handleRetryPack(pack)
                        : handleDownloadPack(pack)
                    }
                    disabled={isBusy}
                    className={`w-full h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-60 ${
                      isFailed
                        ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40"
                        : isDownloaded && !isBusy
                          ? "bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)]"
                          : "bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white shadow-xs"
                    }`}
                  >
                    {isBusy ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : isFailed ? (
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    ) : isDownloaded ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Download className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>
                      {isBusy ? (
                        <>
                          {formatPhaseLabel(state!.phase, isRtl)}{" "}
                          <span dir="ltr" className="font-mono">
                            ({displayPct}%)
                          </span>
                        </>
                      ) : isFailed ? (
                        isRtl ? (
                          "إعادة محاولة التنزيل"
                        ) : (
                          "Retry Download"
                        )
                      ) : isDownloaded ? (
                        isRtl ? (
                          "إعادة التنزيل / تحديث"
                        ) : (
                          "Re-download / Update"
                        )
                      ) : isRtl ? (
                        "تنزيل الحزمة للمكتبة"
                      ) : (
                        "Download Pack"
                      )}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
