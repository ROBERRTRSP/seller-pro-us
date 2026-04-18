/**
 * Canonicaliza URLs de origen para comparar importaciones y deduplicar filas.
 * Sin query string ni hash; quita barra final del path cuando aplica.
 */
export function normalizeSourceUrl(url: string | null | undefined): string | null {
  if (url == null) return null;
  const s = String(url).trim();
  if (s === "") return null;
  try {
    const u = new URL(s);
    u.hash = "";
    u.search = "";
    let pathname = u.pathname;
    if (pathname.endsWith("/") && pathname.length > 1) pathname = pathname.slice(0, -1);
    u.pathname = pathname;
    return u.href;
  } catch {
    const t = s.replace(/\/$/, "");
    return t || null;
  }
}
