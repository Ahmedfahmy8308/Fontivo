// =============================================================================
// Safe Fetch Utility with Timeout & Graceful Offline Fallback
// Prevents any UI screen or modal from hanging indefinitely on slow/offline APIs
// =============================================================================

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
): Promise<Response | null> {
  const { timeoutMs = 8000, fetchImpl, ...fetchOpts } = options;
  const fn = fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!fn) return null;

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer =
    controller && timeoutMs > 0
      ? setTimeout(() => {
          try {
            controller.abort();
          } catch {
            // ignore abort error
          }
        }, timeoutMs)
      : null;

  try {
    const res = await fn(url, {
      ...fetchOpts,
      ...(controller ? { signal: controller.signal } : {}),
    });
    return res;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function safeFetchJson<T = any>(
  url: string,
  options: SafeFetchOptions = {},
  fallback: T | null = null,
): Promise<T | null> {
  const res = await safeFetch(url, options);
  if (!res) return fallback;
  try {
    const data = await res.json();
    return (data as T) ?? fallback;
  } catch {
    return fallback;
  }
}
