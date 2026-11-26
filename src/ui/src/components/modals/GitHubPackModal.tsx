import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  X,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Database,
  Cloud,
  Search,
  FolderArchive,
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

export type { CloudPackage };
export { VERIFIED_CLOUD_PACKAGES };

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

export interface GitHubPackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
  onRefreshLibrary?: () => void;
  t?: Record<string, string>;
  isRtl?: boolean;
}

export default function GitHubPackModal({
  isOpen,
  onClose,
  onRefresh,
  onRefreshLibrary,
  isRtl = false,
  t = {},
}: GitHubPackModalProps) {
  const refreshLibraryCallback = onRefreshLibrary || onRefresh;

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
  const [globalBannerMsg, setGlobalBannerMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const activePollingRef = useRef<
    Record<string, ReturnType<typeof setInterval>>
  >({});

  // Sync downloadedPackIds to localStorage
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

  // Fetch live manifest from /api/library/manifest (fallback to /api/catalog/packages, then v1.0.3 offline fallback)
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const loadManifest = async () => {
      try {
        let data = await safeFetchJson<any>("/api/library/manifest", {
          timeoutMs: 6000,
        });
        if (!data) {
          data = await safeFetchJson<any>("/api/catalog/packages", {
            timeoutMs: 5000,
          });
        }
        if (!isMounted || !data) return;

        const normalized = normalizeManifestPackages(data);
        setPackages(normalized.packages);
        setLibraryVersion(normalized.libraryVersion);

        normalized.packages.forEach((pkg) => {
          if (pkg.isDownloaded) {
            markPackDownloaded(pkg.id);
          }
        });
      } catch {
        // gracefully keep verified v1.0.3 offline fallback
      }
    };

    loadManifest();

    // Check active jobs on the server
    fetch("/api/github/download-pack/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!isMounted || !data || !Array.isArray(data.jobs)) return;
        data.jobs.forEach((job: any) => {
          if (job.packId) {
            setDownloadStates((prev) => ({
              ...prev,
              [job.packId]: {
                jobId: job.jobId,
                progressPercent: job.progressPercent || 0,
                bytesDownloaded: job.bytesDownloaded || 0,
                totalBytes: job.totalBytes || 0,
                phase: job.phase || "Downloading",
                speedBps: job.speedBps || 0,
                extractedCount: job.extractedCount || 0,
                indexedCount: job.indexedCount || 0,
                error: job.error,
              },
            }));
            if (job.phase === "Completed") {
              markPackDownloaded(job.packId);
            } else if (job.phase !== "Failed" && job.phase !== "Cancelled") {
              startJobPolling(job.packId, job.jobId);
            }
          }
        });
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      Object.values(activePollingRef.current).forEach((timer) =>
        clearInterval(timer),
      );
      activePollingRef.current = {};
    };
  }, [isOpen]);

  // Polling logic for a specific download job
  const startJobPolling = (packId: string, jobId: string) => {
    if (activePollingRef.current[packId]) {
      clearInterval(activePollingRef.current[packId]);
    }

    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/github/download-pack/status?jobId=${encodeURIComponent(jobId)}`,
        );
        if (!res.ok) return;
        const progress: any = await res.json();
        if (!progress) return;

        setDownloadStates((prev) => ({
          ...prev,
          [packId]: {
            jobId: progress.jobId || jobId,
            progressPercent: progress.progressPercent || 0,
            bytesDownloaded: progress.bytesDownloaded || 0,
            totalBytes: progress.totalBytes || 0,
            phase: progress.phase || "Downloading",
            speedBps: progress.speedBps || 0,
            extractedCount: progress.extractedCount || 0,
            indexedCount: progress.indexedCount || 0,
            error: progress.error,
          },
        }));

        if (progress.phase === "Completed") {
          clearInterval(timer);
          delete activePollingRef.current[packId];
          markPackDownloaded(packId);

          if (refreshLibraryCallback) {
            refreshLibraryCallback();
          }

          setGlobalBannerMsg({
            type: "success",
            text: isRtl
              ? `تم اكتمال تحميل وفهرسة حزمة ${packages.find((p) => p.id === packId)?.nameAr || packId} بنجاح!`
              : `Package ${packages.find((p) => p.id === packId)?.name || packId} downloaded and indexed successfully!`,
          });
        } else if (
          progress.phase === "Failed" ||
          progress.phase === "Cancelled"
        ) {
          clearInterval(timer);
          delete activePollingRef.current[packId];
          setGlobalBannerMsg({
            type: "error",
            text:
              progress.error ||
              (isRtl
                ? "حدث خطأ أثناء تحميل الحزمة أو فك ضغطها."
                : "Error downloading or extracting font pack."),
          });
        }
      } catch {
        // network glitch, continue polling
      }
    }, 600);

    activePollingRef.current[packId] = timer;
  };

  // Start download for an individual pack
  const handleDownloadSinglePack = async (pkg: CloudPackage) => {
    setGlobalBannerMsg(null);
    setDownloadStates((prev) => ({
      ...prev,
      [pkg.id]: {
        progressPercent: 5,
        bytesDownloaded: 0,
        totalBytes: pkg.compressedBytes,
        phase: "Downloading",
        error: null,
      },
    }));

    const opId = `pack-${pkg.id}`;
    upsertLiveOperation({
      id: opId,
      title: `Downloading: ${pkg.name}`,
      titleAr: `تحميل الحزمة: ${pkg.nameAr}`,
      category: "download",
      status: "running",
      progressPercent: 10,
      bytesDone: Math.round(pkg.compressedBytes * 0.1),
      bytesTotal: pkg.compressedBytes,
      speedBps: 4.5 * 1024 * 1024,
      stepLabel: "Downloading font archive...",
      stepLabelAr: "جاري تحميل أرشيف الحزمة السحابية...",
    });

    try {
      const data = await safeFetchJson<any>("/api/github/download-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packId: pkg.id,
          downloadUrl: pkg.downloadUrl,
        }),
        timeoutMs: 12000,
      });

      if (data && data.success) {
        if (data.jobId) {
          startJobPolling(pkg.id, data.jobId);
        } else {
          setDownloadStates((prev) => ({
            ...prev,
            [pkg.id]: {
              progressPercent: 100,
              bytesDownloaded: pkg.compressedBytes,
              totalBytes: pkg.compressedBytes,
              phase: "Completed",
              error: null,
            },
          }));
          upsertLiveOperation({
            id: opId,
            status: "completed",
            progressPercent: 100,
            bytesDone: pkg.compressedBytes,
            bytesTotal: pkg.compressedBytes,
            stepLabel: `Indexed ${pkg.fontCount} fonts!`,
            stepLabelAr: `تم تحميل وفهرسة ${pkg.fontCount} خطاً بنجاح!`,
          });
          markPackDownloaded(pkg.id);
          if (refreshLibraryCallback) refreshLibraryCallback();
          setGlobalBannerMsg({
            type: "success",
            text: isRtl
              ? `تم تحميل وفهرسة حزمة ${pkg.nameAr} بنجاح!`
              : `Package ${pkg.name} downloaded successfully!`,
          });
        }
      } else {
        upsertLiveOperation({
          id: opId,
          status: "failed",
          progressPercent: 0,
          error: data?.error || "Download failed",
        });
        setDownloadStates((prev) => ({
          ...prev,
          [pkg.id]: {
            progressPercent: 0,
            bytesDownloaded: 0,
            totalBytes: pkg.compressedBytes,
            phase: "Failed",
            error:
              data?.error ||
              (isRtl
                ? "فشل بدء تحميل الحزمة"
                : "Failed to start pack download"),
          },
        }));
        setGlobalBannerMsg({
          type: "error",
          text:
            data?.error ||
            (isRtl ? "فشل تحميل الحزمة" : "Failed to download font pack"),
        });
      }
    } catch (e: any) {
      upsertLiveOperation({
        id: opId,
        status: "failed",
        progressPercent: 0,
        error: e?.message || "Failed to connect",
      });
      setDownloadStates((prev) => ({
        ...prev,
        [pkg.id]: {
          progressPercent: 0,
          bytesDownloaded: 0,
          totalBytes: pkg.compressedBytes,
          phase: "Failed",
          error:
            e.message ||
            (isRtl ? "فشل الاتصال بالخادم" : "Failed to connect to server"),
        },
      }));
      setGlobalBannerMsg({
        type: "error",
        text:
          e.message ||
          (isRtl ? "فشل الاتصال بالخادم" : "Failed to connect to server"),
      });
    }
  };

  // Master action: Download all un-downloaded packages sequentially
  const handleDownloadAllPacks = async () => {
    const unDownloaded = packages.filter((p) => !downloadedPackIds.has(p.id));
    if (unDownloaded.length === 0) {
      setGlobalBannerMsg({
        type: "success",
        text: isRtl
          ? `كافة الحزم الـ ${packages.length} محملة بالفعل وجاهزة للتفعيل!`
          : `All ${packages.length} packages are already downloaded!`,
      });
      return;
    }

    setIsDownloadingAll(true);
    setGlobalBannerMsg(null);

    for (const pkg of unDownloaded) {
      await handleDownloadSinglePack(pkg);
      await new Promise((r) => setTimeout(r, 400));
    }

    setIsDownloadingAll(false);
  };

  // Dynamic category counts across real v1.0.3 scripts
  const categoryCounts = useMemo(() => {
    let arabic = 0;
    let latin = 0;
    let persian = 0;
    let urdu = 0;
    let multilingual = 0;
    for (const pkg of packages) {
      if (pkg.category === "arabic") arabic++;
      else if (pkg.category === "persian") persian++;
      else if (pkg.category === "urdu") urdu++;
      else if (pkg.category === "multilingual") multilingual++;
      else latin++;
    }
    return { all: packages.length, arabic, latin, persian, urdu, multilingual };
  }, [packages]);

  // Filtering packages
  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      if (activeCategory !== "all" && pkg.category !== activeCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName =
          pkg.name.toLowerCase().includes(q) || pkg.nameAr.includes(q);
        const matchesDesc =
          pkg.description.toLowerCase().includes(q) ||
          pkg.descriptionAr.includes(q);
        const matchesCat =
          pkg.categoryLabel.toLowerCase().includes(q) ||
          pkg.categoryLabelAr.includes(q);
        const matchesId = pkg.id.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesCat && !matchesId)
          return false;
      }
      return true;
    });
  }, [packages, activeCategory, searchQuery]);

  // Overall stats
  const totalFontsCount = useMemo(
    () => packages.reduce((acc, p) => acc + p.fontCount, 0),
    [packages],
  );
  const downloadedPacksCount = useMemo(
    () => packages.filter((p) => downloadedPackIds.has(p.id)).length,
    [packages, downloadedPackIds],
  );
  const remainingPacksCount = Math.max(
    0,
    packages.length - downloadedPacksCount,
  );
  const remainingBytesCount = useMemo(() => {
    return packages
      .filter((p) => !downloadedPackIds.has(p.id))
      .reduce((acc, p) => acc + p.compressedBytes, 0);
  }, [packages, downloadedPackIds]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6 select-none"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-[var(--color-text-main)]">
        {/* Header */}
        <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between gap-3 bg-[var(--color-back-header)] shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[var(--color-action)] flex items-center justify-center text-white shadow-sm shrink-0">
              <Cloud className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-lg text-[var(--color-text-header)] flex flex-wrap items-center gap-2">
                  <span>
                    {isRtl ? "مركز حزم الخطوط السحابية" : "Cloud Packages Hub"}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 whitespace-nowrap">
                    {packages.length} Verified Packs • v{libraryVersion}
                  </span>
                </h3>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {isRtl
                  ? "تصفح وتحميل حزم الخطوط العربية واللاتينية والفارسية والأردية المعتمدة وتفعيلها في الرام بنقرة واحدة بدون تثبيت بالنظام"
                  : "Browse, download, and index verified Arabic, Latin, Persian & Urdu typography packs for instant RAM activation"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control)] transition cursor-pointer shrink-0"
            title={isRtl ? "إغلاق" : "Close"}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Banner Notice */}
        {globalBannerMsg && (
          <div
            className={`px-5 py-3 border-b flex items-center gap-2.5 text-xs font-medium animate-in fade-in ${
              globalBannerMsg.type === "success"
                ? "bg-[var(--color-green)]/15 border-[var(--color-green)]/30 text-[var(--color-green)]"
                : "bg-rose-500/15 border-rose-500/30 text-rose-400"
            }`}
          >
            {globalBannerMsg.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{globalBannerMsg.text}</span>
          </div>
        )}

        {/* Master Metrics & Master Download Banner */}
        <div className="p-5 border-b border-[var(--color-border)] bg-[var(--color-back-subtle)]/60 shrink-0 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[var(--color-control)] border border-[var(--color-border)]">
              <span className="text-[10px] text-[var(--color-text-muted)] block font-medium">
                {isRtl ? "إجمالي الخطوط المعتمدة" : "Total Verified Fonts"}
              </span>
              <span className="text-lg font-bold text-[var(--color-text-header)] font-mono tabular-nums">
                {totalFontsCount.toLocaleString()}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[var(--color-control)] border border-[var(--color-border)]">
              <span className="text-[10px] text-[var(--color-text-muted)] block font-medium">
                {isRtl ? "الحزم الجاهزة للتفعيل" : "Downloaded Packs"}
              </span>
              <span className="text-lg font-bold text-[var(--color-green)] font-mono tabular-nums">
                {downloadedPacksCount} / {packages.length}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[var(--color-control)] border border-[var(--color-border)]">
              <span className="text-[10px] text-[var(--color-text-muted)] block font-medium">
                {isRtl ? "الحزم المتبقية بالسحابة" : "Cloud-Only Packs"}
              </span>
              <span className="text-lg font-bold text-sky-400 font-mono tabular-nums">
                {remainingPacksCount}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[var(--color-control)] border border-[var(--color-border)]">
              <span className="text-[10px] text-[var(--color-text-muted)] block font-medium">
                {isRtl ? "الحجم المطلوب تحميله" : "Remaining Size"}
              </span>
              <span className="text-lg font-bold text-purple-400 font-mono tabular-nums">
                {formatCloudBytes(remainingBytesCount)}
              </span>
            </div>
          </div>

          {/* Master Action & Search Row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-0">
              <Search
                className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] ${isRtl ? "right-3" : "left-3"}`}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isRtl
                    ? `ابحث في الحزم الـ ${packages.length} (اسم الحزمة، التصنيف، الوصف)...`
                    : `Search ${packages.length} packs by title, script, or description...`
                }
                className={`w-full py-2.5 rounded-xl bg-[var(--color-control)] border border-[var(--color-border)] text-xs text-[var(--color-text-header)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-action)] transition ${
                  isRtl ? "pr-9 pl-3" : "pl-9 pr-3"
                }`}
              />
            </div>

            {/* Master 'Download All' Button */}
            <button
              onClick={handleDownloadAllPacks}
              disabled={isDownloadingAll || remainingPacksCount === 0}
              className={`py-2.5 px-5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shrink-0 ${
                remainingPacksCount === 0
                  ? "bg-[var(--color-control)] text-[var(--color-text-muted)] cursor-not-allowed border border-[var(--color-border)]"
                  : "bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white"
              }`}
            >
              {isDownloadingAll ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>
                    {isRtl ? "جاري تحميل الحزم..." : "Downloading Packs..."}
                  </span>
                </>
              ) : remainingPacksCount === 0 ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[var(--color-green)]" />
                  <span>
                    {isRtl ? "كافة الحزم مكتملة" : "All Packs Downloaded"}
                  </span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>
                    {isRtl
                      ? `تحميل كافة الحزم المتاحة (${remainingPacksCount} حزم - ${formatCloudBytes(remainingBytesCount)})`
                      : `Download All Packages (${remainingPacksCount} Packs - ${formatCloudBytes(remainingBytesCount)})`}
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Category Filter Chips — flex-wrap so no chip is ever clipped horizontally */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {[
              {
                id: "all",
                label: isRtl ? "كافة الحزم" : "All Packs",
                count: categoryCounts.all,
              },
              {
                id: "arabic",
                label: isRtl ? "عربي" : "Arabic",
                count: categoryCounts.arabic,
              },
              {
                id: "latin",
                label: isRtl ? "لاتيني" : "Latin",
                count: categoryCounts.latin,
              },
              {
                id: "persian",
                label: isRtl ? "فارسي" : "Persian",
                count: categoryCounts.persian,
              },
              {
                id: "urdu",
                label: isRtl ? "أردو" : "Urdu",
                count: categoryCounts.urdu,
              },
              {
                id: "multilingual",
                label: isRtl ? "متعدد اللغات" : "Multilingual",
                count: categoryCounts.multilingual,
              },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`py-1.5 px-3 rounded-lg font-medium transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeCategory === cat.id
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-[var(--color-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] hover:bg-[var(--color-control-hover)]"
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
                    activeCategory === cat.id
                      ? "bg-white/20 text-white"
                      : "bg-[var(--color-border)] text-[var(--color-text-muted)]"
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Package Cards List */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3.5">
          {filteredPackages.length === 0 ? (
            <div className="p-12 text-center text-[var(--color-text-muted)] space-y-2">
              <FolderArchive className="w-12 h-12 mx-auto text-[var(--color-border)]" />
              <p className="font-semibold text-sm text-[var(--color-text-header)]">
                {isRtl
                  ? "لم يتم العثور على حزم مطابقة"
                  : "No matching packages found"}
              </p>
              <p className="text-xs">
                {isRtl
                  ? "جرّب تغيير عبارة البحث أو اختيار تصنيف آخر"
                  : "Try adjusting your search terms or filter"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredPackages.map((pkg) => {
                const isDownloaded = downloadedPackIds.has(pkg.id);
                const dlState = downloadStates[pkg.id];
                const isDownloading =
                  dlState &&
                  dlState.phase !== "Completed" &&
                  dlState.phase !== "Failed" &&
                  dlState.phase !== "Cancelled";

                const progressPercent = dlState
                  ? Math.round(dlState.progressPercent)
                  : 0;

                return (
                  <div
                    key={pkg.id}
                    className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                      isDownloaded
                        ? "bg-[var(--color-back-subtle)]/40 border-[var(--color-green)]/25 hover:border-[var(--color-green)]/40"
                        : isDownloading
                          ? "bg-purple-500/5 border-purple-500/40 shadow-md shadow-purple-500/5"
                          : "bg-[var(--color-back-subtle)] border-[var(--color-border)] hover:border-[var(--color-action)]"
                    }`}
                  >
                    {/* Top Row: Category Pill & Status Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-500/15 text-purple-400 border border-purple-500/20">
                        {isRtl ? pkg.categoryLabelAr : pkg.categoryLabel}
                      </span>

                      {isDownloaded ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-green)]/15 text-[var(--color-green)] border border-[var(--color-green)]/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isRtl ? "جاهز للتفعيل" : "Downloaded"}</span>
                        </span>
                      ) : isDownloading ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1 animate-pulse">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>
                            {dlState.phase === "Extracting"
                              ? isRtl
                                ? "فك الضغط..."
                                : "Extracting..."
                              : dlState.phase === "Indexing"
                                ? isRtl
                                  ? "فهرسة الخطوط..."
                                  : "Indexing..."
                                : isRtl
                                  ? "جاري التحميل..."
                                  : "Downloading..."}
                          </span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30 flex items-center gap-1">
                          <Cloud className="w-3 h-3" />
                          <span>{isRtl ? "في السحابة" : "In Cloud"}</span>
                        </span>
                      )}
                    </div>

                    {/* Title & Description */}
                    <div className="space-y-1">
                      <h4 className="font-bold text-sm text-[var(--color-text-header)] leading-snug">
                        {isRtl ? pkg.nameAr : pkg.name}
                      </h4>
                      <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                        {isRtl ? pkg.descriptionAr : pkg.description}
                      </p>
                    </div>

                    {/* Metadata Chips: Font Count & Size */}
                    <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono py-1">
                      <div className="p-1.5 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)]">
                        <span className="block text-[var(--color-text-muted)] text-[9px]">
                          {isRtl ? "العدد" : "Fonts"}
                        </span>
                        <span className="font-bold text-[var(--color-text-header)] tabular-nums">
                          {pkg.fontCount.toLocaleString()}
                        </span>
                      </div>
                      <div className="p-1.5 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)]">
                        <span className="block text-[var(--color-text-muted)] text-[9px]">
                          {isRtl ? "مضغوط" : "ZIP Size"}
                        </span>
                        <span className="font-bold text-purple-400 tabular-nums">
                          {pkg.compressedSize}
                        </span>
                      </div>
                      <div className="p-1.5 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)]">
                        <span className="block text-[var(--color-text-muted)] text-[9px]">
                          {isRtl ? "المفروز" : "Unpacked"}
                        </span>
                        <span className="font-bold text-[var(--color-text-muted)] tabular-nums">
                          {pkg.uncompressedSize}
                        </span>
                      </div>
                    </div>

                    {/* Live Progress Bar (if downloading) */}
                    {isDownloading && (
                      <div className="space-y-1.5 pt-1 animate-in fade-in">
                        <div className="flex items-center justify-between text-[10px] font-mono text-[var(--color-text-muted)]">
                          <span>
                            {dlState?.bytesDownloaded
                              ? formatCloudBytes(dlState.bytesDownloaded)
                              : "0.00 MB"}{" "}
                            /{" "}
                            {formatCloudBytes(
                              dlState?.totalBytes || pkg.compressedBytes,
                            )}
                          </span>
                          <span className="font-bold text-purple-400">
                            {progressPercent}%
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[var(--color-control)] overflow-hidden">
                          <div
                            className="h-full bg-[var(--color-green)] transition-all duration-300"
                            style={{
                              width: `${Math.max(5, progressPercent)}%`,
                            }}
                          />
                        </div>
                        {dlState?.speedBps && dlState.speedBps > 0 ? (
                          <div className="text-[9px] text-[var(--color-text-muted)] font-mono text-right">
                            {formatCloudBytes(dlState.speedBps)}/s
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Action Button */}
                    <div className="pt-1">
                      {isDownloaded ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 py-2 px-3 rounded-lg bg-[var(--color-green)]/15 border border-[var(--color-green)]/30 text-[var(--color-green)] font-bold text-xs flex items-center justify-center gap-1.5 cursor-default select-none">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {isRtl
                                ? "جاهز للتفعيل الفوري"
                                : "Ready in Library"}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDownloadSinglePack(pkg)}
                            className="py-2 px-2.5 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] border border-[var(--color-border)] text-xs transition cursor-pointer"
                            title={
                              isRtl
                                ? "إعادة الفهرسة / التحميل"
                                : "Re-index / Download again"
                            }
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDownloadSinglePack(pkg)}
                          disabled={isDownloading}
                          className="w-full py-2.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-600/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                        >
                          {isDownloading ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>
                                {isRtl
                                  ? "جاري التحميل والتثبيت..."
                                  : "Downloading & Extracting..."}
                              </span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              <span>
                                {isRtl ? "تحميل الحزمة" : "Download Pack"}
                              </span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-back-subtle)]/40 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-muted)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Database className="w-4 h-4 text-purple-400 shrink-0" />
            <span>
              {isRtl
                ? "الحزم المكتملة تنضم تلقائياً إلى المكتبة المحلية وتدعم التفعيل الفوري في الرام."
                : "Downloaded packs are indexed automatically for instant RAM activation without system bloat."}
            </span>
          </div>
          <button
            onClick={onClose}
            className="py-1.5 px-4 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] border border-[var(--color-border)] font-medium transition cursor-pointer shrink-0"
          >
            {isRtl ? "إغلاق" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
