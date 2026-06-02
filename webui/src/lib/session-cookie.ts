const DEFAULT_SESSION_COOKIE_NAME = "twilight_session";
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled", "force"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", "disabled"]);

export function getSessionCookieName(): string {
  const raw =
    process.env.TWILIGHT_SESSION_COOKIE_NAME ||
    process.env.SESSION_COOKIE_NAME ||
    process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ||
    "";
  const name = raw.trim();
  if (!name) return DEFAULT_SESSION_COOKIE_NAME;
  return COOKIE_NAME_PATTERN.test(name) ? name : DEFAULT_SESSION_COOKIE_NAME;
}

function firstHeaderValue(value: string | null | undefined): string {
  return value?.split(",")[0]?.trim() || "";
}

export function requestOriginFromHeaders(headers: { get(name: string): string | null }): string {
  const host = firstHeaderValue(headers.get("x-forwarded-host")) || firstHeaderValue(headers.get("host"));
  if (!host) return "";
  const proto = firstHeaderValue(headers.get("x-forwarded-proto")) || "https";
  return `${proto}://${host}`;
}

export function shouldUseSessionCookieGuard(webOrigin: string): boolean {
  const mode = (process.env.TWILIGHT_WEBUI_SESSION_COOKIE_GUARD || "").trim().toLowerCase();
  if (TRUE_VALUES.has(mode)) return true;
  if (FALSE_VALUES.has(mode)) return false;

  const rawApiURL = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!rawApiURL) return true;
  if (!webOrigin) return false;

  try {
    const apiURL = new URL(rawApiURL, webOrigin);
    const webURL = new URL(webOrigin);
    return apiURL.origin === webURL.origin;
  } catch {
    return false;
  }
}
