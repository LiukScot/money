export const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

// Only set over HTTPS — sending HSTS on a plain-HTTP response causes the browser
// to cache the upgrade policy and refuse HTTP entirely, breaking LAN deployments.
const HSTS_VALUE = "max-age=63072000; includeSubDomains";

export function applySecurityHeaders(headers: Headers, httpsEnabled = false): void {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, v);
  }
  if (httpsEnabled) {
    headers.set("strict-transport-security", HSTS_VALUE);
  }
}
