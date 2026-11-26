import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Database,
  Cloud,
  Search,
  FolderArchive,
  FolderOpen,
  Filter,
  Layers,
  Package,
} from "lucide-react";
import { safeFetchJson } from "../../utils/safeFetch";
import { upsertLiveOperation } from "../../utils/operationsBus";
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

export default function CloudPacksView({
  onRefreshLibrary,
  isRtl = false,
  t = {},
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
        // ignore
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

  const activePollingRef = useRef<
    Record<string, ReturnType<typeof setInterval>>
  >({});

  const markPackDownloaded = (packId: string) => {
    setDownloadedPackIds((prev) => {
      const next = new Set(prev);
      next.add(packId);
      try {
        localStorage.setItem(
          "fontivo_downloaded_pack_ids",
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // ignore
      }
      return next;
    });
  };

  const loadManifest = async () => {
    try {
      let data = await safeFetchJson<any>("/api/catalog/packages", {
        timeoutMs: 5000,
      });
      if (!data) {
        data = await safeFetchJson<any>("/api/library/manifest", {
          timeoutMs: 5000,
        });
      }
      if (data && Array.isArray(data.packages)) {
        const normalized = normalizeManifestPackages(data.packages);
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
              // ignore
            }
            return next;
          });
        }
      }
      if (data?.libraryVersion) {
        setLibraryVersion(data.libraryVersion);
      }
    } catch {
      // fallback to built-in VERIFIED_CLOUD_PACKAGES
    }
  };

  useEffect(() => {
    loadManifest();
    return () => {
      Object.values(activePollingRef.current).forEach((timer) =>
        clearInterval(timer),
      );
    };
  }, []);

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    setBannerMsg(null);
    try {
      const data = await safeFetchJson<any>("/api/catalog/refresh-manifest", {
        timeoutMs: 8000,
      });
      if (data && (data.success || data.packages)) {
        if (Array.isArray(data.packages)) {
          const normalized = normalizeManifestPackages(data.packages);
          setPackages(normalized.packages);
        }
        if (data.libraryVersion) setLibraryVersion(data.libraryVersion);
        setBannerMsg({
          type: "success",
          text: isRtl
            ? `تم التحقق من التحديثات السحابية بنجاح! الإصدار الحالي: ${data.libraryVersion || libraryVersion}`
            : `Cloud manifest checked successfully! Current version: ${data.libraryVersion || libraryVersion}`,
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
        timeoutMs: 4000,
      });
    } catch {
      // ignore
    }
  };

  const pollJobStatus = (packId: string, jobId: string) => {
    if (activePollingRef.current[packId]) {
      clearInterval(activePollingRef.current[packId]);
    }

    const interval = setInterval(async () => {
      try {
        const status = await safeFetchJson<any>(
          `/api/github/download-pack/status?jobId=${jobId}`,
          {
            timeoutMs: 4000,
            cache: "no-store",
          },
        );

        if (!status) return;

        const phase = status.phase || "Downloading";
        const progress = Math.min(
          100,
          Math.max(0, Number(status.progressPercent ?? 0)),
        );

        setDownloadStates((prev) => ({
          ...prev,
          [packId]: {
            jobId,
            progressPercent: progress,
            bytesDownloaded: Number(status.bytesDownloaded ?? 0),
            totalBytes: Number(status.totalBytes ?? 0),
            phase,
            speedBps: status.speedBps,
            extractedCount: status.extractedCount,
            indexedCount: status.indexedCount,
            error: status.error,
          },
        }));

        if (phase === "Completed") {
          clearInterval(interval);
          delete activePollingRef.current[packId];
          markPackDownloaded(packId);
          if (onRefreshLibrary) onRefreshLibrary();
        } else if (phase === "Failed" || phase === "Cancelled") {
          clearInterval(interval);
          delete activePollingRef.current[packId];
        }
      } catch {
        // ignore network jitter
      }
    }, 1200);

    activePollingRef.current[packId] = interval;
  };

  const handleDownloadPack = async (pack: CloudPackage) => {
    setDownloadStates((prev) => ({
      ...prev,
      [pack.id]: {
        progressPercent: 5,
        bytesDownloaded: 0,
        totalBytes: pack.compressedBytes,
        phase: "Queued",
      },
    }));

    try {
      const res = await safeFetchJson<any>("/api/catalog/download-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id }),
        timeoutMs: 15000,
      });

      if (res && res.jobId) {
        pollJobStatus(pack.id, res.jobId);
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
          error: e.message,
        },
      }));
    }
  };

  const handleDownloadAll = async () => {
    setIsDownloadingAll(true);
    setBannerMsg(null);
    try {
      const res = await safeFetchJson<any>("/api/catalog/download-all", {
        method: "POST",
        timeoutMs: 25000,
      });

      if (res && Array.isArray(res.queuedJobs)) {
        res.queuedJobs.forEach((job: any) => {
          if (job.packId && job.jobId) {
            pollJobStatus(job.packId, job.jobId);
          }
        });
      }
    } catch (e: any) {
      setBannerMsg({
        type: "error",
        text: e.message || "Failed to start bulk download",
      });
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    packages.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [packages]);

  const filteredPackages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return packages.filter((p) => {
      const matchesCat =
        activeCategory === "all" ||
        p.category.toLowerCase() === activeCategory.toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
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
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-action)]/15 text-[var(--color-action)] border border-[var(--color-action)]/30 shrink-0">
                v{libraryVersion}
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1.5 leading-relaxed max-w-2xl">
              {isRtl
                ? `15 حزمة معتمدة تضم أكثر من ${totalPackFonts.toLocaleString()} خطاً عربياً ولاتينياً عالي الجودة (${formatCloudBytes(totalCompressedBytes)}) بدون إعلانات أو روابط خارجية.`
                : `15 curated verified packs containing ${totalPackFonts.toLocaleString()} high-grade Arabic & Latin typography packages (${formatCloudBytes(totalCompressedBytes)}).`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleOpenDownloadsFolder}
              className="h-9 px-3 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-header)] flex items-center gap-1.5 transition cursor-pointer"
              title={
                isRtl ? "فتح مجلد التنزيلات على جهازك" : "Open Downloads Folder"
              }
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>{isRtl ? "مجلد التنزيلات" : "Downloads Folder"}</span>
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
              disabled={isDownloadingAll}
              className="h-9 px-4 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isRtl ? "تنزيل جميع الحزم" : "Download All Packs"}</span>
            </button>
          </div>
        </div>

        {/* Global Banner Notification */}
        {bannerMsg && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-2.5 transition animate-in fade-in-50 ${
              bannerMsg.type === "success"
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : bannerMsg.type === "error"
                  ? "bg-red-500/15 border-red-500/30 text-red-400"
                  : "bg-sky-500/15 border-sky-500/30 text-sky-400"
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
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  activeCategory.toLowerCase() === cat.toLowerCase()
                    ? "bg-[var(--color-action)] text-white"
                    : "bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)]"
                }`}
              >
                {cat}
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
          {filteredPackages.map((pack) => {
            const isDownloaded =
              downloadedPackIds.has(pack.id) || pack.isDownloaded;
            const state = downloadStates[pack.id];
            const isBusy =
              state &&
              (state.phase === "Downloading" ||
                state.phase === "Extracting" ||
                state.phase === "Indexing" ||
                state.phase === "Queued");

            return (
              <div
                key={pack.id}
                className="p-5 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] hover:border-[var(--color-action)]/50 transition flex flex-col justify-between space-y-4 shadow-xs"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-[var(--color-control)] text-[var(--color-text-dim)] font-mono text-[10px] uppercase font-bold shrink-0">
                      {pack.category || "General"}
                    </span>
                    {isDownloaded ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold text-[10px] flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{isRtl ? "محمل بالمكتبة" : "Installed"}</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-[var(--color-control)] text-[var(--color-text-muted)] text-[10px] font-semibold shrink-0">
                        {formatCloudBytes(pack.compressedBytes)}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-[var(--color-text-header)] line-clamp-1">
                    {pack.name}
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed line-clamp-2">
                    {pack.description}
                  </p>
                </div>

                <div className="space-y-3 pt-3 border-t border-[var(--color-border-subtle)]">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[var(--color-text-muted)]">
                    <span>
                      {pack.fontCount} {isRtl ? "خط" : "fonts"}
                    </span>
                    <span>
                      {formatCloudBytes(pack.uncompressedBytes)}{" "}
                      {isRtl ? "مستخرج" : "extracted"}
                    </span>
                  </div>

                  {/* Progress bar if busy */}
                  {isBusy && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-[var(--color-action)]">
                        <span>{state.phase}...</span>
                        <span>{state.progressPercent}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-[var(--color-control)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--color-action)] transition-all duration-300"
                          style={{ width: `${state.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Action Button */}
                  <button
                    onClick={() => handleDownloadPack(pack)}
                    disabled={isBusy}
                    className={`w-full h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                      isDownloaded
                        ? "bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)]"
                        : "bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white shadow-xs"
                    }`}
                  >
                    {isBusy ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : isDownloaded ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Download className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>
                      {isBusy
                        ? isRtl
                          ? "جاري التحميل والتثبيت..."
                          : "Downloading..."
                        : isDownloaded
                          ? isRtl
                            ? "إعادة التنزيل / تحديث"
                            : "Re-download / Update"
                          : isRtl
                            ? "تنزيل الحزمة للمكتبة"
                            : "Download Pack"}
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
