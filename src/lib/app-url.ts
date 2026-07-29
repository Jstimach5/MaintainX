/**
 * Absolute base URL for links that leave the app (invitation and
 * password-reset emails). Comes from APP_URL so production links carry the
 * real domain — never a hard-coded host, never localhost in production.
 */
export function appUrl(path: string): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
