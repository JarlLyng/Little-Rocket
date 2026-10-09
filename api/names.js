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
 * in length here, screened against a denylist, and stored with a timestamp so
 * they can be moderated by hand if needed (DELETE FROM planet_names WHERE ...).
 * This mirrors the abuse limits in distance.js: CORS allowlist + per-IP rate
 * limit + a strict value check.
 *
 * The denylist exists because a name you give drifts onto OTHER players' worlds.
 * That makes the pool a shared surface, and it was being used to push an insult
 * at the repo owner onto everyone else's sky. It is a first line of defence, not
 * a complete one — a determined person will always get something through, and
 * the real backstop is that the rows are timestamped and can be deleted by hand.
 *
 * Required env vars (same as distance.js):
 *   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
 * Optional: RATE_LIMIT_SALT
 */

import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';

const MAX_NAME_LEN = 24;
const SAMPLE_SIZE = 40;

// Long, distinctive terms, matched anywhere inside the name against a
// letters-only form — so spacing and punctuation tricks ("s u c k s", "f.u.c.k")
// don't slip past. Terms that appear inside innocent words live in
// BLOCKED_WORDS below instead; 'rape', 'loser' and 'moron' were moved there
// because they sit inside grape, closer and oxymoron.
//
// One known false positive remains, the classic one: 'cunt' rejects the English
// town Scunthorpe. Kept deliberately — letting a spaced-out slur onto everyone
// else's sky is the worse failure, and nobody is meaningfully hurt by not being
// able to name a planet after a town in Lincolnshire.
const BLOCKED_SUBSTRINGS = [
  'sucks', 'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'bastard', 'whore',
  'retard', 'faggot', 'nigger', 'nazi',
  'idiot', 'stupid',
  'fisse', 'luder', 'spasser', 'kneppe',   // Danish
];

// Short terms that DO appear inside innocent words — "pik" in "pike", "ass" in
// "grasslands", "svin" in "svinge". These only match as whole words.
const BLOCKED_WORDS = [
  'ass', 'cum', 'dick', 'cock', 'piss', 'slut', 'fag',
  'rape', 'loser', 'moron',                // substrings of grape/closer/oxymoron
  'pik', 'svin', 'mær', 'bøsse',           // Danish
];

// Names are not a place to put links or handles.
const SPAM_PATTERNS = [/https?:/i, /www\./i, /\.(com|net|org|io|xyz)\b/i, /@[a-z0-9_]/i];

// Digits and symbols commonly swapped in to dodge a filter.
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i' };

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

/**
 * Fold a name down to something a denylist can be matched against: lower case,
 * no diacritics, leet digits mapped back to letters.
 */
function normalize(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[01345378@$!]/g, (ch) => LEET[ch] ?? ch);
}

/**
 * True if the name should never enter the shared pool.
 *
 * Checked twice over, once as written and once with every run of repeated
 * characters collapsed, so both "fuck" and "fuuuck" are caught without
 * collapsing turning ordinary doubled letters into false matches.
 */
function isBlocked(name) {
  if (SPAM_PATTERNS.some((re) => re.test(name))) return true;

  const normalized = normalize(name);
  const variants = [normalized, normalized.replace(/(.)\1+/g, '$1')];

  for (const variant of variants) {
    const letters = variant.replace(/[^a-zæøå]/g, '');
    if (BLOCKED_SUBSTRINGS.some((term) => letters.includes(term))) return true;

    const words = variant.split(/[^a-zæøå]+/).filter(Boolean);
    if (words.some((word) => BLOCKED_WORDS.includes(word))) return true;
  }
  return false;
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
      // A blocked name gets the same answer as an empty one, so the filter
      // isn't advertised to anyone probing it. The client is fire-and-forget
      // and pins the name to the player's own world locally either way — so
      // they still name their world, it just never drifts to anyone else.
      if (!name || isBlocked(name)) {
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
