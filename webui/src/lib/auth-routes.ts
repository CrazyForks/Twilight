export const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/admin",
  "/announcements",
  "/invite",
  "/media",
  "/score",
  "/settings",
];

export const AUTH_ROUTE_PREFIXES = ["/login", "/register", "/forgot-password"];

export function pathMatches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function safeProtectedRedirectTarget(
  rawNext: string | null | undefined,
  fallback = "/dashboard",
): string {
  const next = rawNext?.trim();
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;

  try {
    const url = new URL(next, "https://twilight.local");
    if (url.origin !== "https://twilight.local") return fallback;
    if (!pathMatches(url.pathname, PROTECTED_ROUTE_PREFIXES)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
