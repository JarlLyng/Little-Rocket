/**
 * Collective distance stats — Turso-backed via the Vercel function in
 * /api/distance.
 *
 * fetchTotalDistance() — used on start screen render to show the running
 *   "Before you, X AU have been flown" line.
 * reportSessionDistance(au) — fire on pagehide so the rocket's distance is
 *   added to the global total. Uses sendBeacon so it survives even when
 *   the browser is tearing down.
 *
 * If the API is unreachable both calls fail silently. The game keeps
 * working — collective stats are a nice-to-have, not a hard dependency.
 */

// Same-origin path. Frontend and API are deployed together on Vercel, so
// no CORS preflight, no cross-origin auth complexity.
const API_URL = '/api/distance';

export async function fetchTotalDistance() {
  try {
    const response = await fetch(API_URL, { mode: 'cors' });
    if (!response.ok) return null;
    const data = await response.json();
    return {
      total: Number(data.total_au) || 0,
      sessions: Number(data.sessions) || 0,
    };
  } catch {
    return null;
  }
}

export function reportSessionDistance(au) {
  const value = Math.floor(Number(au));
  if (!Number.isFinite(value) || value < 1) return;

  // sendBeacon with text/plain avoids a CORS preflight on pagehide where
  // we have very little time before the browser tears the page down.
  // The server parses either JSON or text/plain bodies.
  const body = new Blob(
    [JSON.stringify({ au: value })],
    { type: 'text/plain' }
  );

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try { navigator.sendBeacon(API_URL, body); return; } catch { /* fall through */ }
  }

  // Fallback for browsers without sendBeacon — keepalive lets fetch survive
  // a small bit of teardown.
  fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
    keepalive: true,
  }).catch(() => { /* fire-and-forget */ });
}
