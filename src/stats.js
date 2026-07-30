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
    const response = await fetch(API_URL);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      total: Number(data.total_au) || 0,
      sessions: Number(data.sessions) || 0,
      farthest: Number(data.farthest_au) || 0,
    };
  } catch {
    return null;
  }
}

// `pagehide` can fire more than once (bfcache navigations, tab restore), and
// some browsers also fire it alongside `visibilitychange`. Track how much has
// already been reported and send only the delta each time — a flight that
// resumes from bfcache still contributes what it flew after restoring, but
// bouncing in and out of the tab can't inflate the counter.
let reportedAU = 0;

export function reportSessionDistance(au) {
  const total = Math.floor(Number(au));
  if (!Number.isFinite(total)) return;
  const value = total - reportedAU;
  if (value < 1) return;
  reportedAU = total;

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
