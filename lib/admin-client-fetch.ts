const DEFAULT_TIMEOUT_MS = 25_000;

/** Stable messages for UI checks after failed adminFetchJson calls. */
export const ADMIN_FETCH_TIMEOUT = "Tiempo de espera agotado";
export const ADMIN_FETCH_NETWORK = "Error de red";

export type AdminFetchJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

/**
 * GET/POST JSON for admin client pages: no-store cache, parse errors, and a
 * timeout so a hung server does not leave the UI stuck on “Loading…”.
 */
export async function adminFetchJson<T>(
  url: string,
  init: RequestInit = {},
  options?: { timeoutMs?: number },
): Promise<AdminFetchJsonResult<T>> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, cache: "no-store", signal: ac.signal });
    clearTimeout(t);
    let parsed: unknown;
    try {
      parsed = await r.json();
    } catch {
      parsed = null;
    }
    if (!r.ok) {
      const err =
        parsed &&
        typeof parsed === "object" &&
        "error" in parsed &&
        typeof (parsed as { error: string }).error === "string"
          ? (parsed as { error: string }).error
          : `HTTP ${r.status}`;
      return { ok: false, error: err, status: r.status };
    }
    return { ok: true, data: parsed as T };
  } catch (e) {
    clearTimeout(t);
    const aborted = e instanceof Error && e.name === "AbortError";
    if (aborted) return { ok: false, error: ADMIN_FETCH_TIMEOUT };
    return { ok: false, error: ADMIN_FETCH_NETWORK };
  }
}
