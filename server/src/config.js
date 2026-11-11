/**
 * Startup configuration checks. Throws (so the server refuses to start) instead of
 * running with settings that would break CSRF protection or email links.
 */
export function startupConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const configured = env.APP_ORIGIN?.trim() || '';
  if (production && !configured) {
    throw new Error('APP_ORIGIN is required when NODE_ENV=production (the exact public HTTPS origin, e.g. https://shop.example.com).');
  }
  if (configured) {
    let parsed;
    try { parsed = new URL(configured); } catch { parsed = null; }
    if (!parsed || parsed.origin !== configured) throw new Error('APP_ORIGIN must be an exact origin such as https://shop.example.com, with no path or trailing slash.');
    if (production && parsed.protocol !== 'https:') throw new Error('APP_ORIGIN must use https:// in production.');
  }
  return {
    production,
    // Browser origin for CSRF/Origin checks and redirects; localhost is the dev default.
    appOrigin: configured || 'http://localhost:5173',
    // Email links use only an explicitly configured origin; in development without one, links are omitted.
    emailOrigin: configured || null,
  };
}
