/**
 * Collective planet names — Turso-backed via the Vercel function in
 * /api/names.
 *
 * fetchStrangerNames() — pull a random sample of names other players have left,
 *   each with how many days ago it was left, so a passing world can say how
 *   long its name has been drifting.
 * submitName(name) — let a name you gave a world loose into the shared pool.
 *
 * Both fail silently. Naming is atmosphere, never a hard dependency — the game
 * is exactly as playable offline as online, just without strangers' worlds.
 */

const API_URL = '/api/names';

export const MAX_NAME_LEN = 24;

export async function fetchStrangerNames() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data.names)) return [];
    return data.names
      .map((n) => (typeof n === 'string' ? { name: n, ageDays: null } : n))
      .filter((n) => n && typeof n.name === 'string')
      .map((n) => ({ name: n.name, ageDays: Number.isFinite(n.age_days) ? n.age_days : null }));
  } catch {
    return [];
  }
}

export function submitName(name) {
  const value = String(name || '').trim().slice(0, MAX_NAME_LEN);
  if (!value) return;
  // keepalive so the write survives even if the player flies on / closes soon.
  fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: value }),
    keepalive: true,
  }).catch(() => { /* fire-and-forget — naming is a nicety */ });
}
