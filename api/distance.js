/**
 * Collective distance counter, backed by Turso.
 *
 * GET  /api/distance        → { total_au, sessions }
 * POST /api/distance        → { total_au }   body: { au: number }
 *
 * Each ended flight inserts one row into `sessions` (the full history, kept
 * for future per-session analytics). A single-row `totals` table holds the
 * running SUM + COUNT so GET reads one indexed row instead of scanning the
 * whole history every time the start screen loads. POST updates both tables
 * atomically.
 *
 * Abuse is bounded three ways: per-session value cap (MAX_AU_PER_SESSION),
 * a CORS allowlist so only our own origins can call it from a browser, and a
 * per-IP rate limit so a script can't pump the counter unattended.
 *
 * Required env vars on Vercel:
 *   TURSO_DATABASE_URL   (libsql://...turso.io)
 *   TURSO_AUTH_TOKEN     (read+write token from the Turso dashboard)
 * Optional:
 *   RATE_LIMIT_SALT      (any string; salts the hashed-IP rate-limit keys)
 */

import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';

const MAX_AU_PER_SESSION = 1_000_000; // anti-garbage cap

// Per-IP rate limit. One real flight reports once (on pagehide), so this is
// generous for play and hostile to scripts. IPs are hashed and the window
// rows are pruned every request, so no durable IP storage.
const RATE_WINDOW_S = 60;
const RATE_MAX_POSTS = 10;
const RATE_SALT = process.env.RATE_LIMIT_SALT || 'little-rocket';

// Browsers may only call the endpoint from these origins. Same-origin
// production requests carry the production origin; `python3 -m http.server`
// and similar local dev run on localhost. Direct (non-browser) callers send
// no Origin header and are handled by the rate limit + value cap instead.
const ALLOWED_ORIGINS = new Set([
  'https://littlerocket.iamjarl.com',
]);

let client = null;
let initialized = false;

function getClient() {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

async function ensureSchema() {
  if (initialized) return;
  const c = getClient();
  await c.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      distance_au INTEGER NOT NULL CHECK (distance_au >= 0 AND distance_au <= ${MAX_AU_PER_SESSION}),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  await c.execute(`CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at)`);

  // Single-row aggregate so GET never scans the full history. Seeded once
  // from whatever is already in `sessions` (migration for existing data).
  await c.execute(`
    CREATE TABLE IF NOT EXISTS totals (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_au INTEGER NOT NULL DEFAULT 0,
      sessions INTEGER NOT NULL DEFAULT 0
    )
  `);
  await c.execute(`
    INSERT OR IGNORE INTO totals (id, total_au, sessions)
    SELECT 1, COALESCE(SUM(distance_au), 0), COUNT(*) FROM sessions
  `);

  // Ephemeral rate-limit keys: hashed IP + timestamp, pruned each request.
  await c.execute(`
    CREATE TABLE IF NOT EXISTS rate_limit (
      ip_hash TEXT NOT NULL,
      ts INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  await c.execute(`CREATE INDEX IF NOT EXISTS idx_rate_limit ON rate_limit(ip_hash, ts)`);

  initialized = true;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function hashIp(ip) {
  return createHash('sha256').update(`${RATE_SALT}:${ip}`).digest('hex');
}

/**
 * Returns true if this IP is over the limit. Prunes expired rows, counts the
 * caller's recent posts, and records this attempt when allowed.
 */
async function isRateLimited(c, req) {
  const ipHash = hashIp(clientIp(req));
  await c.execute({
    sql: 'DELETE FROM rate_limit WHERE ts < unixepoch() - ?',
    args: [RATE_WINDOW_S],
  });
  const count = await c.execute({
    sql: 'SELECT COUNT(*) AS n FROM rate_limit WHERE ip_hash = ?',
    args: [ipHash],
  });
  if (Number(count.rows[0].n) >= RATE_MAX_POSTS) return true;
  await c.execute({ sql: 'INSERT INTO rate_limit (ip_hash) VALUES (?)', args: [ipHash] });
  return false;
}

function isLocalhost(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  // Reflect only allowed origins. Unknown/absent origins get no ACAO header;
  // same-origin and non-browser callers don't need one.
  if (origin && (ALLOWED_ORIGINS.has(origin) || isLocalhost(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;            // Vercel parsed JSON for us
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    await ensureSchema();
    const c = getClient();

    if (req.method === 'GET') {
      const result = await c.execute('SELECT total_au, sessions FROM totals WHERE id = 1');
      const row = result.rows[0] || { total_au: 0, sessions: 0 };
      res.status(200).json({
        total_au: Number(row.total_au),
        sessions: Number(row.sessions),
      });
      return;
    }

    if (req.method === 'POST') {
      const body = parseBody(req.body);
      const au = Math.floor(Number(body.au));
      if (!Number.isFinite(au) || au < 0 || au > MAX_AU_PER_SESSION) {
        res.status(400).json({ error: 'invalid au' });
        return;
      }
      // Tiny sessions don't carry meaningful signal — discard.
      if (au < 1) {
        res.status(204).end();
        return;
      }
      if (await isRateLimited(c, req)) {
        res.status(429).json({ error: 'rate limited' });
        return;
      }
      // Insert the row and bump the aggregate atomically.
      await c.batch([
        { sql: 'INSERT INTO sessions (distance_au) VALUES (?)', args: [au] },
        { sql: 'UPDATE totals SET total_au = total_au + ?, sessions = sessions + 1 WHERE id = 1', args: [au] },
      ], 'write');
      const result = await c.execute('SELECT total_au FROM totals WHERE id = 1');
      res.status(200).json({ total_au: Number(result.rows[0].total_au) });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('distance api error:', err);
    res.status(500).json({ error: 'internal error' });
  }
}
