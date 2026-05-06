/**
 * Collective distance counter, backed by Turso.
 *
 * GET  /api/distance        → { total_au, sessions }
 * POST /api/distance        → { total_au }   body: { au: number }
 *
 * Schema lives in `sessions`. Each ended flight inserts one row. The total
 * is a running SUM. Adding more columns later (max_speed, near_misses,
 * duration) is one ALTER TABLE — no client changes needed.
 *
 * Required env vars on Vercel:
 *   TURSO_DATABASE_URL   (libsql://...turso.io)
 *   TURSO_AUTH_TOKEN     (read+write token from the Turso dashboard)
 */

import { createClient } from '@libsql/client';

const MAX_AU_PER_SESSION = 1_000_000; // anti-garbage cap

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
  initialized = true;
}

function applyCors(res) {
  // Same-origin in production (Vercel serves both static and API). Wildcard
  // here is mainly to keep `python3 -m http.server` cross-origin local dev
  // working — the only write-side risk is fake distance values, which are
  // bounded by the MAX_AU_PER_SESSION check below.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;            // Vercel parsed JSON for us
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    await ensureSchema();
    const c = getClient();

    if (req.method === 'GET') {
      const result = await c.execute(
        'SELECT COALESCE(SUM(distance_au), 0) AS total, COUNT(*) AS sessions FROM sessions'
      );
      const row = result.rows[0];
      res.status(200).json({
        total_au: Number(row.total),
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
      await c.execute({ sql: 'INSERT INTO sessions (distance_au) VALUES (?)', args: [au] });
      const result = await c.execute('SELECT COALESCE(SUM(distance_au), 0) AS total FROM sessions');
      res.status(200).json({ total_au: Number(result.rows[0].total) });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('distance api error:', err);
    res.status(500).json({ error: 'internal error' });
  }
}
