import { safeFetchJson } from "./safeFetch";

/**
 * Opens an external URL in the user's default system browser.
 * In the desktop WebView, delegates to the Rust backend (`POST /api/system/open-url`).
 * Falls back to `window.open` when running outside the desktop shell or if the API fails.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;

  const res = await safeFetchJson<{ ok?: boolean; opened?: boolean; success?: boolean; status?: string }>(
    "/api/system/open-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      timeoutMs: 4000,
    },
  );

  const apiSucceeded =
    res !== null &&
    (res.ok === true ||
      res.opened === true ||
      res.success === true ||
      res.status === "ok");

  if (!apiSucceeded && typeof window !== "undefined" && typeof window.open === "function") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export default openExternalUrl;
