/**
 * Collective planet names, backed by Turso.
 *
 * GET  /api/names           → { names: string[] }   a random sample
 * POST /api/names           → { ok: true }          body: { name: string }
 *
 * The melancholy conceit: names don't belong to any one planet. The field is
 * procedural and ephemeral, so a name you give a passing world is simply let
 * loose into the dark. Other drifters' clients pull a random sample and sprinkle
 * those names onto whatever worlds happen to pass them. "It will not remember."
 *
 * Names are rendered with textContent on the client (no HTML injection), capped
 * in length here, and stored with a timestamp so they can be moderated by hand
 * if needed (DELETE FROM planet_names WHERE ...). This mirrors the abuse limits
 * in distance.js: CORS allowlist + per-IP rate limit + a strict value check.
 *
 * Required env vars (same as distance.js):
 *   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
 * Optional: RATE_LIMIT_SALT
 */

import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';

const MAX_NAME_LEN = 24;
const SAMPLE_SIZE = 40;

const RATE_WINDOW_S = 60;
const RATE_MAX_POSTS = 20;
const RATE_SALT = process.env.RATE_LIMIT_SALT || 'little-rocket';

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
    CREATE TABLE IF NOT EXISTS planet_names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  // Shared with distance.js — both functions guard writes with the same table.
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

// Scope the hash to this endpoint so name posts and distance posts get separate
// rate-limit buckets even though they share the table.
function hashIp(ip) {
  return createHash('sha256').update(`${RATE_SALT}:names:${ip}`).digest('hex');
}

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
  if (origin && (ALLOWED_ORIGINS.has(origin) || isLocalhost(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

// Collapse whitespace, drop control characters (code point < 32 or DEL), and
// cap length. Built without control-character literals in the source. Returns
// the cleaned name, or '' if nothing usable is left.
function cleanName(raw) {
  const printable = Array.from(String(raw ?? ''))
    .filter((ch) => {
      const code = ch.codePointAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
  return printable.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN);
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
      const result = await c.execute({
        sql: 'SELECT name FROM planet_names ORDER BY RANDOM() LIMIT ?',
        args: [SAMPLE_SIZE],
      });
      res.status(200).json({ names: result.rows.map((r) => String(r.name)) });
      return;
    }

    if (req.method === 'POST') {
      const name = cleanName(parseBody(req.body).name);
      if (!name) {
        res.status(400).json({ error: 'invalid name' });
        return;
      }
      if (await isRateLimited(c, req)) {
        res.status(429).json({ error: 'rate limited' });
        return;
      }
      await c.execute({ sql: 'INSERT INTO planet_names (name) VALUES (?)', args: [name] });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('names api error:', err);
    res.status(500).json({ error: 'internal error' });
  }
}
