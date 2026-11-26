import React, { useState, useEffect, useCallback } from "react";
import {
  Zap,
  FileSearch,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FolderOpen,
  Radio,
  Search,
  ChevronDown,
  ChevronUp,
  Download,
  Globe,
  Monitor,
  HardDrive,
} from "lucide-react";
import { safeFetchJson } from "../../utils/safeFetch";
import { upsertLiveOperation } from "../../utils/operationsBus";

export type AdobeFontTier = "system" | "local" | "google" | "missing";

export function isInternalAdobeNonFont(raw: string): boolean {
  const s = (raw || "").trim().toLowerCase();
  if (!s || s.length <= 1) return true;
  if (
    s.startsWith("uuid:") ||
    s.startsWith("xmp.") ||
    s.startsWith("http") ||
    s.includes("/") ||
    s.includes(":")
  ) {
    return true;
  }
  const denylist = [
    "kinsoku",
    "mojikumi",
    "adobeinvisfont",
    "burasagari",
    "singlelinecomposer",
    "everylinecomposer",
    "worldreadycomposer",
    "normal rgb",
    "normal cmyk",
    "normal lab",
    "photoshopdefault",
    "illustratordefault",
  ];
  return denylist.some((tok) => s.includes(tok));
}

export interface AdobeDocumentFont {
  name: string;
  postScriptName?: string;
  style?: string;
  status: AdobeFontTier;
  fontId?: string | number | null;
  googleFamily?: string | null;
  active: boolean;
}

export interface PendingAdobeDocument {
  id: string;
  documentName: string;
  filePath?: string;
  appName: string;
  totalFonts: number;
  systemCount: number;
  localCount: number;
  googleCount: number;
  matchedCount: number;
  missingCount: number;
  activeCount: number;
  matchedFontIds: Array<string | number>;
  fonts: AdobeDocumentFont[];
  activated?: boolean;
}

export function normalizeAdobeFontEntry(f: any): AdobeDocumentFont {
  const name = String(
    f?.name ?? f?.postScriptName ?? f?.family ?? "Unknown Font",
  );
  const rawStatus = String(f?.status ?? "").toLowerCase();
  const fontId = f?.fontId ?? f?.matchedId ?? f?.id ?? null;
  const googleFamily = f?.googleFamily ?? f?.google_family ?? null;
  const active = Boolean(f?.active || f?.isActive || rawStatus === "active");

  let status: AdobeFontTier = "missing";
  if (rawStatus === "system" || f?.source === "system") {
    status = "system";
  } else if (rawStatus === "google" || Boolean(googleFamily)) {
    status = "google";
  } else if (
    rawStatus === "local" ||
    rawStatus === "available" ||
    rawStatus === "active" ||
    Boolean(f?.available || f?.isMatched || fontId != null)
  ) {
    status = "local";
  }

  return {
    name,
    postScriptName: f?.postScriptName || name,
    style: f?.style || "",
    status,
    fontId,
    googleFamily,
    active,
  };
}

export function normalizePendingActivations(
  payload: any,
): PendingAdobeDocument[] {
  if (!payload) return [];
  const rawList: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.documents)
      ? payload.documents
      : Array.isArray(payload.pending)
        ? payload.pending
        : Array.isArray(payload.items)
          ? payload.items
          : [];

  return rawList
    .map((doc: any, idx: number) => {
      const filePath = doc.filePath || doc.file_path || doc.path || "";
      const documentName =
        doc.documentName ||
        doc.document_name ||
        doc.fileName ||
        doc.file_name ||
        doc.title ||
        (filePath ? String(filePath).split(/[\\/]/).pop() : "") ||
        `Document ${idx + 1}`;
      const appName =
        doc.appName || doc.app_name || doc.app || doc.hostApp || "Photoshop";

      const rawFonts: any[] = Array.isArray(doc.fonts)
        ? doc.fonts
        : [
            ...(Array.isArray(doc.matchedFonts)
              ? doc.matchedFonts
              : Array.isArray(doc.matched_fonts)
                ? doc.matched_fonts
                : []),
            ...(Array.isArray(doc.missingFonts)
              ? doc.missingFonts
              : Array.isArray(doc.missing_fonts)
                ? doc.missing_fonts
                : []),
          ];

      const fonts: AdobeDocumentFont[] = rawFonts
        .map(normalizeAdobeFontEntry)
        .filter(
          (f) =>
            !isInternalAdobeNonFont(f.name) &&
            !isInternalAdobeNonFont(f.postScriptName || ""),
        );

      const counts = doc.counts || {};
      const hasFontsList = fonts.length > 0;

      const systemCount = hasFontsList
        ? fonts.filter((f) => f.status === "system").length
        : Number(counts.system ?? doc.systemCount ?? 0);

      const localCount = hasFontsList
        ? fonts.filter((f) => f.status === "local").length
        : Number(counts.local ?? doc.localCount ?? 0);

      const googleCount = hasFontsList
        ? fonts.filter((f) => f.status === "google").length
        : Number(counts.google ?? doc.googleCount ?? 0);

      const missingCount = hasFontsList
        ? fonts.filter((f) => f.status === "missing").length
        : Number(counts.missing ?? doc.missingCount ?? doc.missing_count ?? 0);

      const activeCount = hasFontsList
        ? fonts.filter((f) => f.active).length
        : Number(counts.active ?? doc.activeCount ?? 0);

      const matchedFontIds: Array<string | number> = Array.isArray(
        doc.matchedFontIds || doc.matched_font_ids || doc.fontIds,
      )
        ? doc.matchedFontIds || doc.matched_font_ids || doc.fontIds
        : fonts
            .filter((f) => f.status === "local" && f.fontId != null)
            .map((f) => f.fontId as string | number);

      const matchedCount = hasFontsList
        ? localCount + googleCount
        : Number(
            doc.matchedCount ?? doc.matched_count ?? matchedFontIds.length,
          );

      const totalFonts = hasFontsList
        ? fonts.length
        : Number(
            counts.total ??
              doc.totalFonts ??
              doc.total_fonts ??
              systemCount + matchedCount + missingCount,
          );

      return {
        id: String(
          doc.id ??
            doc.documentId ??
            doc.document_id ??
            filePath ??
            documentName,
        ),
        documentName,
        filePath,
        appName,
        totalFonts,
        systemCount,
        localCount,
        googleCount,
        matchedCount,
        missingCount,
        activeCount,
        matchedFontIds,
        fonts,
        activated: Boolean(doc.activated || doc.isActivated),
      };
    })
    .filter((d) => Boolean(d.documentName));
}

export default function AdobeBridgeView({
  onRefreshStats,
  t = {},
  isRtl = false,
}: any) {
  const [analyzing, setAnalyzing] = useState(false);
  const [inspectResult, setInspectResult] = useState<any>(null);
  const [inspectSearch, setInspectSearch] = useState("");
  const [filePath, setFilePath] = useState("");
  const [activating, setActivating] = useState(false);
  const [activatedSuccessCount, setActivatedSuccessCount] = useState<
    number | null
  >(null);

  // Live Multi-Document Adobe Monitor State
  const [pendingDocs, setPendingDocs] = useState<PendingAdobeDocument[]>([]);
  const [pollingPending, setPollingPending] = useState(false);
  const [activatingDocId, setActivatingDocId] = useState<string | null>(null);
  const [activatingFontKey, setActivatingFontKey] = useState<string | null>(
    null,
  );
  const [collapsedDocIds, setCollapsedDocIds] = useState<
    Record<string, boolean>
  >({});
  const [docSearchQueries, setDocSearchQueries] = useState<
    Record<string, string>
  >({});
  const [liveBannerMsg, setLiveBannerMsg] = useState<string | null>(null);

  const fetchPendingActivations = useCallback(async () => {
    setPollingPending(true);
    try {
      const data = await safeFetchJson<any>("/api/adobe/pending-activations", {
        timeoutMs: 4000,
        cache: "no-store",
      });
      if (data) {
        setPendingDocs(normalizePendingActivations(data));
      }
    } catch {
      // ignore offline
    } finally {
      setPollingPending(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingActivations();
    const interval = setInterval(fetchPendingActivations, 4000);
    return () => clearInterval(interval);
  }, [fetchPendingActivations]);

  const handleActivateDetectedDoc = async (doc: PendingAdobeDocument) => {
    setActivatingDocId(doc.id);
    setLiveBannerMsg(null);
    try {
      const res = await safeFetchJson<any>("/api/adobe/activate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: doc.id,
          documentId: doc.id,
          documentName: doc.documentName,
          filePath: doc.filePath,
          fontIds: doc.matchedFontIds,
        }),
        timeoutMs: 30000,
      });

      const localAct = Number(
        res?.localActivatedCount ?? res?.localActivated ?? 0,
      );
      const googleAct = Number(
        res?.googleDownloadedCount ??
          res?.googleDownloaded ??
          res?.googleActivated ??
          0,
      );
      const totalDone = Number(
        res?.activatedCount ?? res?.activated ?? localAct + googleAct,
      );
      setLiveBannerMsg(
        isRtl
          ? `تم تفعيل وتحميل ${totalDone} خطاً لملف "${doc.documentName}" في الرام (محلي: ${localAct} • Google Fonts: ${googleAct})!`
          : `Activated & downloaded ${totalDone} design fonts for "${doc.documentName}" in RAM (Local: ${localAct} • Google: ${googleAct})!`,
      );
      await fetchPendingActivations();
      if (onRefreshStats) onRefreshStats();
    } catch {
      // ignore
    } finally {
      setActivatingDocId(null);
    }
  };

  const handleActivateSingleFont = async (
    doc: PendingAdobeDocument,
    font: AdobeDocumentFont,
  ) => {
    const key = `${doc.id}::${font.name}`;
    setActivatingFontKey(key);
    setLiveBannerMsg(null);
    try {
      const res = await safeFetchJson<any>("/api/adobe/activate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: doc.id,
          documentId: doc.id,
          documentName: doc.documentName,
          filePath: doc.filePath,
          fontName: font.name,
          fontId: font.fontId,
          googleFamily: font.googleFamily,
        }),
        timeoutMs: 25000,
      });

      if (res?.success !== false) {
        setLiveBannerMsg(
          isRtl
            ? `تم ${font.status === "google" ? "تحميل وتفعيل" : "تفعيل"} الخط "${font.name}" في الرام بنجاح!`
            : `${font.status === "google" ? "Downloaded & activated" : "Activated"} "${font.name}" in RAM!`,
        );
        await fetchPendingActivations();
        if (onRefreshStats) onRefreshStats();
      }
    } catch {
      // ignore
    } finally {
      setActivatingFontKey(null);
    }
  };

  const formatInspectData = (data: any, fallbackPath?: string) => {
    if (!data) return null;
    const fPath = data.filePath || fallbackPath || "";
    const fName = data.fileName || fPath.split(/[\\/]/).pop() || "";
    const rawList = (
      Array.isArray(data.resolvedFonts) && data.resolvedFonts.length > 0
        ? data.resolvedFonts
        : data.fonts || []
    ).filter(
      (f: any) =>
        !isInternalAdobeNonFont(
          f?.name || f?.postScriptName || f?.family || "",
        ),
    );
    const fontsList = rawList.map((f: any) => {
      const normalized = normalizeAdobeFontEntry(f);
      const isMatched =
        normalized.status === "local" || normalized.status === "google";
      return {
        ...normalized,
        matchedId: normalized.fontId,
        id: normalized.fontId,
        isMatched,
        available: isMatched,
        isActive: normalized.active,
      };
    });

    const total = data.totalDetected ?? data.totalFonts ?? fontsList.length;
    const matched =
      data.matchedCount ?? fontsList.filter((f: any) => f.isMatched).length;

    return {
      success: true,
      fileName: fName,
      filePath: fPath,
      totalDetected: total,
      matchedCount: matched,
      fonts: fontsList,
    };
  };

  const handleBrowseDesignFile = async () => {
    setAnalyzing(true);
    setInspectResult(null);
    setInspectSearch("");
    const opId = `adobe-browse-${Date.now()}`;
    upsertLiveOperation({
      id: opId,
      title: "Inspecting Design File (Adobe CC)",
      titleAr: "فحص ملف تصميم (Adobe CC Bridge)",
      category: "workspace-scan",
      status: "running",
      progressPercent: 40,
      stepLabel: "Parsing design file layers...",
      stepLabelAr: "جاري قراءة طبقات ملف التصميم والكشف عن الخطوط...",
    });
    try {
      const data = await safeFetchJson<any>("/api/dialog/pick-design-file", {
        method: "POST",
        timeoutMs: 25000,
      });
      if (data && (data.filePath || data.success || data.fonts)) {
        if (data.filePath) setFilePath(data.filePath);
        const formatted = formatInspectData(data, data.filePath);
        setInspectResult(formatted);
        upsertLiveOperation({
          id: opId,
          status: "completed",
          progressPercent: 100,
          itemsDone: formatted?.totalDetected || 0,
          itemsTotal: formatted?.totalDetected || 0,
          stepLabel: `Detected ${formatted?.totalDetected || 0} fonts`,
          stepLabelAr: `تم اكتشاف ${formatted?.totalDetected || 0} خطوط في التصميم!`,
        });
      } else if (data && data.cancelled) {
        upsertLiveOperation({
          id: opId,
          status: "completed",
          progressPercent: 100,
        });
      } else {
        upsertLiveOperation({
          id: opId,
          status: "failed",
          progressPercent: 0,
          error: data?.error,
        });
        setInspectResult({ success: false, error: data?.error });
      }
    } catch (e: any) {
      upsertLiveOperation({
        id: opId,
        status: "failed",
        progressPercent: 0,
        error: e?.message,
      });
      setInspectResult({ success: false, error: e?.message });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleInspect = async (pathToSend?: string) => {
    const rawTarget = pathToSend || filePath;
    const target = rawTarget.replace(/^["']|["']$/g, "").trim();
    if (!target) return;
    setAnalyzing(true);
    setInspectResult(null);
    setInspectSearch("");
    const opId = `adobe-inspect-${Date.now()}`;
    upsertLiveOperation({
      id: opId,
      title: `Inspecting: ${target.split(/[\\/]/).pop() || target}`,
      titleAr: `فحص ملف التصميم: ${target.split(/[\\/]/).pop() || target}`,
      category: "workspace-scan",
      status: "running",
      progressPercent: 45,
      stepLabel: "Scanning embedded font references...",
      stepLabelAr: "جاري فحص الخطوط المضمنة في الملف...",
    });

    try {
      const data = await safeFetchJson<any>("/api/inspect-design-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: target }),
        timeoutMs: 12000,
      });
      if (data && (data.success || data.filePath || data.fonts)) {
        const formatted = formatInspectData(data, target);
        setInspectResult(formatted);
        upsertLiveOperation({
          id: opId,
          status: "completed",
          progressPercent: 100,
          itemsDone: formatted?.totalDetected || 0,
          itemsTotal: formatted?.totalDetected || 0,
          stepLabel: `Detected ${formatted?.totalDetected || 0} fonts`,
          stepLabelAr: `تم اكتشاف ${formatted?.totalDetected || 0} خطوط في التصميم!`,
        });
      } else {
        upsertLiveOperation({
          id: opId,
          status: "failed",
          progressPercent: 0,
          error: data?.error,
        });
        setInspectResult({
          success: false,
          error:
            data?.error ||
            (isRtl
              ? "فشل فحص الملف. يرجى التأكد من صحة المسار وصيغة الملف."
              : "Inspection failed. Please verify file format."),
        });
      }
    } catch (e: any) {
      upsertLiveOperation({
        id: opId,
        status: "failed",
        progressPercent: 0,
        error: e?.message,
      });
      setInspectResult({ success: false, error: e?.message });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleActivateMissing = async (fonts: any[]) => {
    const ids = fonts
      .filter(
        (f) =>
          f.status === "local" && (f.matchedId ?? f.fontId ?? f.id) != null,
      )
      .map((f) => f.matchedId ?? f.fontId ?? f.id);
    if (ids.length === 0) return;

    setActivating(true);
    setActivatedSuccessCount(null);
    try {
      await safeFetchJson("/api/activate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        timeoutMs: 12000,
      });
      setActivatedSuccessCount(ids.length);
      if (onRefreshStats) onRefreshStats();
      if (filePath) handleInspect(filePath);
    } catch (e) {
      console.error(e);
    } finally {
      setActivating(false);
    }
  };

  const renderFontTierBadge = (font: AdobeDocumentFont) => {
    if (font.active) {
      return (
        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold whitespace-nowrap">
          {isRtl ? "مفعل بالرام ✓" : "Active in RAM ✓"}
        </span>
      );
    }
    if (font.status === "system") {
      return (
        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold whitespace-nowrap inline-flex items-center gap-1">
          <Monitor className="w-2.5 h-2.5 shrink-0" />
          <span>{isRtl ? "مثبت بالنظام" : "System Installed"}</span>
        </span>
      );
    }
    if (font.status === "local") {
      return (
        <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30 text-[10px] font-bold whitespace-nowrap inline-flex items-center gap-1">
          <HardDrive className="w-2.5 h-2.5 shrink-0" />
          <span>{isRtl ? "متاح محلياً" : "Available Locally"}</span>
        </span>
      );
    }
    if (font.status === "google") {
      return (
        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-bold whitespace-nowrap inline-flex items-center gap-1">
          <Globe className="w-2.5 h-2.5 shrink-0" />
          <span>{isRtl ? "متاح في Google Fonts" : "Google Fonts"}</span>
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full bg-[var(--color-control)] text-[var(--color-text-dim)] border border-[var(--color-border)] text-[10px] font-medium whitespace-nowrap">
        {isRtl ? "غير موجود" : "Missing"}
      </span>
    );
  };

  return (
    <div
      className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none w-full"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header & Status Card */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-[var(--color-border)] gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text-header)] truncate">
                {t.adobeBridgeTitle ||
                  (isRtl ? "جسر أدوبي الفوري" : "Adobe CC Real-Time Bridge")}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-green)]/15 text-[var(--color-green)] border border-[var(--color-green)]/30 flex items-center gap-1.5 whitespace-nowrap shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-green)] animate-ping" />
                {isRtl ? "متصل" : "CONNECTED"}
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1.5 leading-relaxed">
              {t.adobeBridgeDesc ||
                (isRtl
                  ? "مراقبة تلقائية لجميع مستندات فوتوشوب وإليستريتور وإن ديزاين المفتوحة مع عرض كامل للخطوط وتفعيل/تحميل فوري من المكتبة و Google Fonts."
                  : "Automatically monitors all open Photoshop, Illustrator, and InDesign documents with full font inspection and 1-click local + Google Fonts RAM activation.")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {["Photoshop", "Illustrator", "InDesign"].map((app) => (
              <span
                key={app}
                className="h-7 px-3 rounded-lg bg-[var(--color-control)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] inline-flex items-center whitespace-nowrap shrink-0"
              >
                {app}
              </span>
            ))}
          </div>
        </div>

        {/* Live Detected Adobe Documents (Multi-Document Full Inspector) */}
        <div className="space-y-3" data-testid="adobe-live-docs-section">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
              <Radio className="w-4 h-4 text-[var(--color-green)]" />
              <span>
                {isRtl
                  ? `المستندات المفتوحة حالياً في أدوبي (${pendingDocs.length})`
                  : `Live Open Adobe Documents (${pendingDocs.length})`}
              </span>
            </h2>
            <button
              onClick={fetchPendingActivations}
              disabled={pollingPending}
              className="h-7 px-2.5 rounded-lg bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw
                className={`w-3 h-3 ${pollingPending ? "animate-spin" : ""}`}
              />
              <span>{isRtl ? "تحديث" : "Refresh"}</span>
            </button>
          </div>

          {liveBannerMsg && (
            <div className="p-3 rounded-xl bg-[var(--color-green)]/15 border border-[var(--color-green)]/30 text-[var(--color-green)] text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{liveBannerMsg}</span>
            </div>
          )}

          {pendingDocs.length > 0 ? (
            <div className="space-y-4">
              {pendingDocs.map((doc) => {
                const isCollapsed = Boolean(collapsedDocIds[doc.id]);
                const query = (docSearchQueries[doc.id] || "")
                  .trim()
                  .toLowerCase();
                const filteredFonts = doc.fonts.filter(
                  (f) =>
                    !query ||
                    f.name.toLowerCase().includes(query) ||
                    (f.googleFamily &&
                      f.googleFamily.toLowerCase().includes(query)),
                );
                const actionableCount = doc.localCount + doc.googleCount;

                return (
                  <div
                    key={doc.id}
                    data-testid={`adobe-doc-card-${doc.id}`}
                    className="rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-action)]/40 overflow-hidden shadow-xs"
                  >
                    {/* Document Header */}
                    <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[var(--color-back-header)]/40 border-b border-[var(--color-border-subtle)]">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[var(--color-action)]/15 text-[var(--color-action)] text-[10px] font-bold uppercase shrink-0">
                            {doc.appName}
                          </span>
                          <span className="text-sm font-bold text-[var(--color-text-header)] truncate">
                            {doc.documentName}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-[var(--color-control)] text-[var(--color-text-muted)]">
                            {isRtl
                              ? `الكل: ${doc.totalFonts}`
                              : `Total: ${doc.totalFonts}`}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                            {isRtl
                              ? `بالنظام: ${doc.systemCount}`
                              : `System: ${doc.systemCount}`}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400">
                            {isRtl
                              ? `محلياً: ${doc.localCount}`
                              : `Local: ${doc.localCount}`}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">
                            {isRtl
                              ? `Google Fonts: ${doc.googleCount}`
                              : `Google: ${doc.googleCount}`}
                          </span>
                          {doc.missingCount > 0 && (
                            <span className="px-2 py-0.5 rounded bg-[var(--color-control)] text-[var(--color-text-dim)]">
                              {isRtl
                                ? `غير موجود: ${doc.missingCount}`
                                : `Missing: ${doc.missingCount}`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleActivateDetectedDoc(doc)}
                          disabled={
                            activatingDocId === doc.id || actionableCount === 0
                          }
                          className="h-9 px-3.5 rounded-xl bg-[var(--color-green)] hover:opacity-90 disabled:opacity-50 text-zinc-950 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
                        >
                          {activatingDocId === doc.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                          ) : (
                            <Zap className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>
                            {isRtl
                              ? `تفعيل وتحميل كل خطوط التصميم في الرام (${actionableCount})`
                              : `Activate & Download All Design Fonts (${actionableCount})`}
                          </span>
                        </button>

                        <button
                          onClick={() =>
                            setCollapsedDocIds((prev) => ({
                              ...prev,
                              [doc.id]: !prev[doc.id],
                            }))
                          }
                          className="h-9 px-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] flex items-center gap-1 text-xs font-semibold transition cursor-pointer"
                        >
                          {isCollapsed ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronUp className="w-4 h-4" />
                          )}
                          <span>
                            {isCollapsed
                              ? isRtl
                                ? "عرض الخطوط"
                                : "Show Fonts"
                              : isRtl
                                ? "إخفاء"
                                : "Hide"}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Expandable Full Font List with Live Search Box */}
                    {!isCollapsed && (
                      <div className="p-4 space-y-3">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                          <input
                            type="text"
                            value={docSearchQueries[doc.id] || ""}
                            onChange={(e) =>
                              setDocSearchQueries((prev) => ({
                                ...prev,
                                [doc.id]: e.target.value,
                              }))
                            }
                            placeholder={
                              isRtl
                                ? `بحث في خطوط "${doc.documentName}" (${doc.fonts.length} خط)...`
                                : `Search fonts in "${doc.documentName}" (${doc.fonts.length} fonts)...`
                            }
                            className="w-full h-8 ps-9 pe-3 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-muted)] outline-none"
                          />
                        </div>

                        {filteredFonts.length === 0 ? (
                          <div className="py-4 text-center text-xs text-[var(--color-text-muted)]">
                            {isRtl
                              ? "لا توجد خطوط مطابقة لبحثك في هذا المستند."
                              : "No fonts match your search in this document."}
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-72 overflow-y-auto pe-1">
                            {filteredFonts.map((font, fIdx) => {
                              const fontKey = `${doc.id}::${font.name}`;
                              const isFontBusy = activatingFontKey === fontKey;
                              const canActivateSingle =
                                !font.active &&
                                (font.status === "local" ||
                                  font.status === "google");

                              return (
                                <div
                                  key={`${font.name}-${fIdx}`}
                                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border-subtle)] text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className="font-mono font-bold text-[var(--color-text-header)] truncate">
                                      {font.name}
                                    </span>
                                    {font.googleFamily &&
                                      font.googleFamily !== font.name && (
                                        <span className="text-[10px] text-amber-400/90 font-mono truncate">
                                          ({font.googleFamily})
                                        </span>
                                      )}
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {renderFontTierBadge(font)}
                                    {canActivateSingle && (
                                      <button
                                        onClick={() =>
                                          handleActivateSingleFont(doc, font)
                                        }
                                        disabled={isFontBusy}
                                        className={`h-7 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                                          font.status === "google"
                                            ? "bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-zinc-950 border border-amber-500/30"
                                            : "bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-zinc-950 border border-sky-500/30"
                                        }`}
                                      >
                                        {isFontBusy ? (
                                          <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                                        ) : font.status === "google" ? (
                                          <Download className="w-3 h-3 shrink-0" />
                                        ) : (
                                          <Zap className="w-3 h-3 shrink-0" />
                                        )}
                                        <span>
                                          {font.status === "google"
                                            ? isRtl
                                              ? "تحميل وتفعيل"
                                              : "Download & Activate"
                                            : isRtl
                                              ? "تفعيل بالرام"
                                              : "Activate"}
                                        </span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-[var(--color-back-card)] border border-[var(--color-border)] flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
              <CheckCircle2 className="w-4 h-4 text-[var(--color-action)] shrink-0" />
              <span>
                {isRtl
                  ? "المراقب الذكي يعمل في الخلفية: افتح أي ملف .PSD أو .AI أو .INDD في برامج أدوبي وسيظهر هنا مع قائمة كاملة بخطوطه للتفعيل والتحميل بنقرة واحدة."
                  : "Live monitor active: open any .PSD, .AI, or .INDD document in Adobe CC and all open documents will appear here with full font resolution."}
              </span>
            </div>
          )}
        </div>

        {/* Manual Design File Scanner (PSD / AI / INDD) */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
            <FileSearch className="w-4 h-4 text-[var(--color-action)]" />
            <span>
              {t.scanDesignFile ||
                (isRtl
                  ? "فحص ملف تصميم"
                  : "Inspect Design File (PSD, AI, INDD, PDF)")}
            </span>
          </h2>

          {/* Path Input & Native Explorer Browse Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl p-2 shadow-xs">
            <div className="flex items-center flex-1 px-2">
              <FolderOpen className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
              <input
                type="text"
                placeholder={
                  isRtl
                    ? "مسار ملف التصميم أو اضغط تصفح بالماوس..."
                    : "File path or click browse..."
                }
                value={filePath}
                onChange={(e: any) => setFilePath(e.target.value)}
                className="flex-1 bg-transparent text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-muted)] focus:outline-none px-3"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleBrowseDesignFile}
                disabled={analyzing}
                className="h-9 px-3.5 bg-[var(--color-control)] hover:bg-[var(--color-control-hover)] text-[var(--color-text-header)] rounded-xl text-xs font-medium transition flex items-center gap-1.5 cursor-pointer border border-[var(--color-border)] whitespace-nowrap shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                <span>{isRtl ? "تصفح الملف..." : "Browse..."}</span>
              </button>
              <button
                onClick={() => handleInspect()}
                disabled={analyzing || !filePath.trim()}
                className="h-9 px-4 bg-[var(--color-action)] hover:opacity-90 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-[var(--color-action)]/20 whitespace-nowrap shrink-0"
              >
                {analyzing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Zap className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{isRtl ? "فحص الملف" : "Inspect"}</span>
              </button>
            </div>
          </div>

          {/* Results Box */}
          {inspectResult && (
            <div className="bg-[var(--color-back-card)] border border-[var(--color-border)] rounded-2xl p-6 space-y-4 animate-in fade-in duration-150 shadow-xs">
              {inspectResult.success ? (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--color-border)] pb-3 gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--color-text-header)]">
                        {inspectResult.fileName}
                      </h3>
                      <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
                        {isRtl
                          ? `تم اكتشاف ${inspectResult.totalDetected || 0} خطاً مستخدماً في التصميم`
                          : `Detected ${inspectResult.totalDetected || 0} fonts in document`}
                      </span>
                    </div>

                    {inspectResult.matchedCount > 0 && (
                      <button
                        onClick={() =>
                          handleActivateMissing(inspectResult.fonts || [])
                        }
                        disabled={activating}
                        className="h-9 px-4 bg-[var(--color-green)] hover:opacity-90 text-zinc-950 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm self-start sm:self-center whitespace-nowrap shrink-0"
                      >
                        {activating ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                        ) : (
                          <Zap className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>
                          {isRtl
                            ? `تفعيل وتحميل كل خطوط التصميم في الرام (${inspectResult.matchedCount})`
                            : `Activate & Download All Design Fonts (${inspectResult.matchedCount})`}
                        </span>
                      </button>
                    )}
                  </div>

                  {activatedSuccessCount !== null && (
                    <div className="p-3 rounded-xl bg-[var(--color-green)]/15 border border-[var(--color-green)]/30 text-[var(--color-green)] text-xs font-semibold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        {isRtl
                          ? `تم تفعيل ${activatedSuccessCount} خطاً في الرام دفعة واحدة بنجاح.`
                          : `Activated ${activatedSuccessCount} matched fonts in RAM.`}
                      </span>
                    </div>
                  )}

                  {/* Search inside inspected file */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                    <input
                      type="text"
                      value={inspectSearch}
                      onChange={(e) => setInspectSearch(e.target.value)}
                      placeholder={
                        isRtl
                          ? "ابحث في خطوط الملف..."
                          : "Search fonts in file..."
                      }
                      className="w-full h-8 ps-9 pe-3 rounded-xl bg-[var(--color-back-main)] border border-[var(--color-border)] focus:border-[var(--color-action)] text-xs text-[var(--color-text-header)] placeholder-[var(--color-text-muted)] outline-none"
                    />
                  </div>

                  {/* Fonts List in File */}
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {(inspectResult.fonts || [])
                      .filter(
                        (font: any) =>
                          !inspectSearch.trim() ||
                          String(font.postScriptName || font.name)
                            .toLowerCase()
                            .includes(inspectSearch.trim().toLowerCase()),
                      )
                      .map((font: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[var(--color-back-subtle)] border border-[var(--color-border-subtle)] text-xs min-w-0"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-mono font-bold text-[var(--color-text-header)] truncate">
                              {font.postScriptName || font.name}
                            </span>
                            {font.style && (
                              <span className="text-[10px] text-[var(--color-text-muted)] whitespace-nowrap shrink-0">
                                ({font.style})
                              </span>
                            )}
                          </div>

                          <div className="shrink-0">
                            {renderFontTierBadge(font)}
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              ) : (
                <div className="text-rose-500 text-xs flex items-center gap-2 p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {inspectResult.error ||
                      (isRtl
                        ? "فشل فحص الملف. يرجى التأكد من صحة المسار وصيغة الملف."
                        : "Inspection failed. Please verify file format.")}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
