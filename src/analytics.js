/**
 * Thin wrapper over the Umami analytics tag in index.html.
 *
 * trackEvent fires every time. trackOnce fires the first time per session
 * for a given event name — used for "engagement milestone" events where
 * we don't want one player's flight to dominate the chart.
 *
 * If the Umami script hasn't loaded (blocked by an extension, network
 * error, fork that removed it), every call no-ops silently.
 */

const sent = new Set();

function send(event, props) {
  if (typeof window === 'undefined') return;
  const fn = window.umami && window.umami.track;
  if (typeof fn !== 'function') return;
  try { fn(event, props); } catch { /* analytics must never throw */ }
}

export function trackEvent(event, props) {
  send(event, props);
}

export function trackOnce(event, props) {
  if (sent.has(event)) return;
  sent.add(event);
  send(event, props);
}
