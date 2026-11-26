export const SUPPORTED_DESIGN_EXTENSIONS = [
  "psd",
  "ai",
  "indd",
  "pdf",
  "eps",
  "svg",
] as const;
export const MAX_DESIGN_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

export interface DesignFontEntry {
  name: string;
  status?: string;
  fontId?: number | null;
  id?: number | null;
  matchedId?: number | null;
  available?: boolean;
  isMatched?: boolean;
  isActive?: boolean;
  family?: string | null;
  path?: string | null;
  postScriptName?: string | null;
  style?: string | null;
  [key: string]: unknown;
}

export interface DesignInspectionResponse {
  success: boolean;
  fileName?: string;
  filePath?: string;
  totalFonts?: number;
  totalDetected?: number;
  matchedCount?: number;
  alreadyActiveCount?: number;
  availableFonts?: DesignFontEntry[];
  missingFonts?: DesignFontEntry[];
  fonts?: DesignFontEntry[];
  error?: string;
}

export function getFileExtension(fileName: string): string {
  const parts = fileName.trim().split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1].toLowerCase();
}

export function isSupportedDesignFile(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return (SUPPORTED_DESIGN_EXTENSIONS as readonly string[]).includes(ext);
}

export function extractSupportedDesignFiles(
  files: ArrayLike<File> | null | undefined,
): File[] {
  if (!files || files.length === 0) return [];
  const supported: File[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file && file.name && isSupportedDesignFile(file.name)) {
      supported.push(file);
    }
  }
  return supported;
}

export interface InspectUploadOptions {
  autoActivate?: boolean;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Uploads a dropped or selected design file (PSD/AI/INDD/PDF/EPS/SVG) as raw binary
 * to the local Fontivo engine (`POST /api/inspect-design-upload`) so it works
 * natively inside WebView2 without requiring a browser-restricted filesystem path.
 */
export async function inspectDroppedDesignFile(
  file: File,
  options: InspectUploadOptions = {},
): Promise<DesignInspectionResponse> {
  const { autoActivate = false, apiBase = "/api", fetchImpl = fetch } = options;

  if (!file || !file.name) {
    return { success: false, error: "No design file provided" };
  }

  if (!isSupportedDesignFile(file.name)) {
    return {
      success: false,
      fileName: file.name,
      error: `Unsupported design file format: ${file.name}`,
    };
  }

  if (typeof file.size === "number" && file.size > MAX_DESIGN_UPLOAD_BYTES) {
    return {
      success: false,
      fileName: file.name,
      error: "Design file exceeds the 100 MB inspection limit",
    };
  }

  const query = new URLSearchParams({
    fileName: file.name,
    autoActivate: autoActivate ? "true" : "false",
  });

  const res = await fetchImpl(
    `${apiBase}/inspect-design-upload?${query.toString()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    },
  );

  const data: DesignInspectionResponse = await res.json().catch(() => ({
    success: false,
    error: `Inspection failed (HTTP ${res.status})`,
  }));

  if (!res.ok && data.success !== true) {
    return {
      ...data,
      success: false,
      fileName: data.fileName || file.name,
      error: data.error || `Inspection failed (HTTP ${res.status})`,
    };
  }

  return data;
}
