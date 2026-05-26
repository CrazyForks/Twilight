const DEFAULT_SESSION_COOKIE_NAME = "twilight_session";
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

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
