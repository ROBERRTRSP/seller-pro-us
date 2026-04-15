/**
 * Restricts navigation to same-origin relative paths.
 * Strips straight/curly quotes often pasted by mistake around URLs.
 */
export function safeInternalPath(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  let s = input.trim();
  s = s.replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "");
  if (!s.startsWith("/") || s.startsWith("//")) return fallback;
  if (s.includes("://") || s.includes("\\")) return fallback;
  if (s.length > 2048) return fallback;
  return s;
}
