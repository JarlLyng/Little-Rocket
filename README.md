# Little Rocket

[![Co-created with AI](https://madebyhuman.iamjarl.com/badges/co-created-white.svg)](https://madebyhuman.iamjarl.com)

> *A small ship in the long dark.*
> *The engines hum, and somewhere ahead, a star you have not named is waiting.*

![Little Rocket](og-image.png)

A tiny browser game about flying nowhere in particular. Pull the throttle and drift past procedurally placed planets — some with rings, some with moons. Engines spool up. Stars streak past at speed. A slow, melancholy story unfolds one sentence at a time across the bottom of your screen. There is no score, no fail state, no destination. Just the long dark, and you in it.

Built with [Three.js](https://threejs.org/). No build step, no client dependencies to install — every file in the repo is served as-is. The only npm dependency is `@libsql/client`, used by the small Turso-backed counter API.

**Play it:** [littlerocket.iamjarl.com](https://littlerocket.iamjarl.com/) · keyboard on desktop, drag-to-fly on phone and tablet.

---

## Contents

1. [Controls](#controls)
2. [Run locally](#run-locally)
3. [Project structure](#project-structure)
4. [Architecture at a glance](#architecture-at-a-glance)
5. [Module responsibilities](#module-responsibilities)
6. [Tunable constants](#tunable-constants)
7. [Adding music](#adding-music)
8. [Editing the story](#editing-the-story)
9. [Design system](#design-system)
10. [Deployment](#deployment)
11. [Contributing](#contributing)

---

## Controls

**Desktop:**

| Key | Action |
|---|---|
| ↑ / ↓ | Pitch |
| ← / → or A / D | Yaw |
| Q / E | Roll |
| W / S | Throttle up / down |
| Mouse | Look around |
| N | Name a world that has drifted close |
| ? button | Show controls hint |
| ♪ button | Toggle music *(visible only if loops are configured)* |

**Touch (phone, tablet):** drag the **left half** of the screen to steer (virtual joystick that re-centers on release), drag the **right half** vertically to set throttle (sticky — keeps the position when you let go). A vertical bar on the right edge mirrors your current speed. When a world drifts close, a **Name this world** button appears at the bottom.

The HUD shows speed and distance traveled (in AU). A subtle **NEAR MISS** flash fires when you pass within 2.2× a planet's radius.

### Naming worlds

When a planet drifts close, a cue invites you to name it. The name you give pins to that world and is let loose into a shared pool (`/api/names`). Because the planet field is procedural and ephemeral, names don't belong to any one world — other drifters' clients pull a random sample and occasionally pin one to a world passing *them*. So you'll sometimes drift past a world already bearing a stranger's name. Your own names glow in the accent colour; strangers' are quiet and white. *"It will not remember."* Naming is pure atmosphere — it degrades silently when the API is unreachable, and the game plays identically offline.

---

## Run locally

The project is plain static files, but ES module imports require a real `http://` origin — opening `index.html` straight from disk will not work.

```bash
python3 -m http.server   # zero install on macOS / most Linux
# or
npx serve .              # needs network on first run to fetch the package
```

Then open the URL the server prints.

The static frontend has **no build step** — everything in the repo root is served as-is, locally and in production. Three.js comes from `cdn.jsdelivr.net` via an import map in `index.html`, so the browser never needs `npm install`. The Vercel function in `api/` does pull `@libsql/client` at deploy time; that's automatic.

## Browser support

Tested on the current versions of Chrome, Edge, Firefox, and Safari (desktop and iOS). Requirements:

- **WebGL** (Three.js)
- **ES modules + import maps** — Chrome 89+, Firefox 108+, Safari 16.4+, iOS Safari 16.4+
- **Web Audio API** for engine + music
- **Pointer events** for the touch joystick / throttle (every modern browser)

There is no transpilation — older browsers will silently fail to load the import map and the page will stay on the Start screen without a working button. That's acceptable for a hobby project; if it bothers you, transpile and bundle.

## Performance budget

Targets:

| Surface | Target |
|---|---|
| Modern desktop / laptop | 60 FPS at native resolution, DPR cap 2 |
| Modern phone / tablet | 60 FPS at DPR cap 1.5 |
| Low-end mobile | 30+ FPS (no automatic fallback yet — see #future) |

Initial payload:

- HTML + CSS + JS modules: ~30 KB gzipped
- Three.js (CDN, cached after first visit): ~600 KB gzipped
- Four AAC music loops: ~2.3 MB total, lazy-loaded sequentially during the cinematic intro
- Engine sound: synthesized at runtime — no audio file

The renderer caps `devicePixelRatio` at 1.5 on touch devices (`scene.js:createRenderer`). Adaptive quality (auto-downgrading streaks/star count if frame time drifts) is on the roadmap but not implemented yet.

---

## Project structure

```
index.html                   Entry point + Three.js import map
favicon.png                  Browser tab icon
og-image.png                 Social preview (1200×630)
vercel.json                  Cache-Control overrides for audio + images

styles/
  main.css                   UI chrome — references IAMJARL design tokens

vendor/
  iamjarl-tokens.css         Vendored copy of the design system tokens (v0.5.0)

src/
  main.js                    Game loop, intro, input wiring, scene orchestration
  scene.js                   Scene, lights, suns, starfields, nebulae, sky gradient
  rocket.js                  Rocket mesh + engine glow; reads --ij-color-primary
  planets.js                 Procedural planets, rings, moons, near-miss + naming/labels
  asteroids.js               Pool-shared low-poly asteroid clusters
  textures.js                Multi-octave value-noise bump + color textures
  exhaust.js                 Particle trail behind the rocket
  audio.js                   Procedural engine sound (Web Audio API)
  music.js                   Background music player — speed-driven lowpass + fly-by swell
  story.js                   Slow sci-fi narrative cycle
  controls.js                Keyboard + mouse input bridge
  motion.js                  prefers-reduced-motion gate
  analytics.js               Umami event wrapper
  stats.js                   Collective-distance API client
  names.js                   Collective planet-names API client
  milestones.js              Distance-threshold milestone toasts

api/
  distance.js                Vercel serverless function — collective distance (Turso)
  names.js                   Vercel serverless function — collective planet names (Turso)
package.json                 Dependencies for the API only

sw.js                        Service worker — offline cache + installable PWA

audio/                       Music loops (AAC/M4A) — see audio/README.md

scripts/
  check-tokens.sh            Verifies all --ij-* tokens exist in vendor file
```

---

## Architecture at a glance

```
                  ┌─────────────────────────────────────────┐
                  │            index.html                   │
                  │  importmap → three  /  loads main.js    │
                  └────────────────────┬────────────────────┘
                                       ▼
              ┌────────────────────────────────────────────────┐
              │                main.js                         │
              │  start() ─ click handler ─ initAudio()         │
              │  run()   ─ requestAnimationFrame loop          │
              │                                                │
              │   per frame:                                   │
              │    1. dt from THREE.Clock                      │
              │    2. intro phase override (1.6s) OR keys      │
              │    3. integrate position, FOV, glow, audio     │
              │    4. update camera (lerp + shake)             │
              │    5. update planets/asteroids/exhaust/etc.    │
              │    6. renderer.render(scene, camera)           │
              └─┬──────────┬──────────┬─────────┬──────────┬───┘
                ▼          ▼          ▼         ▼          ▼
            scene.js   rocket.js   planets.js  asteroids.js  exhaust.js
            (visuals)  (mesh)      (with near-miss)          (particles)

                        ▲           ▲
                        │           │
                  textures.js (shared bump/color noise)

           audio.js  music.js  story.js  motion.js  controls.js
           (engine)  (loops)   (text)    (a11y)     (input)
```

Two important conventions:

- **Followers**: anything that should feel infinitely far away (suns, nebulae, star layers, streak layer) re-pins to the rocket's position every frame. The player can fly forever without flying out of the surrounding sky. See `updateSuns`, `updateNebulae`, `updateStarAnchors` in `scene.js`.
- **Hot loop scratch**: per-frame Vector3 work uses scratch instances declared once in the closure (e.g. `forward`, `camTarget`, `enginePos` in `main.js`; `_scratch` in `planets.js` and `asteroids.js`). `.clone()` is avoided in the frame loop.

---

## Module responsibilities

| Module | What it owns | Key exports |
|---|---|---|
| `main.js` | Frame loop, intro state, input → speed/rotation, camera transform, HUD updates | _none — entrypoint_ |
| `scene.js` | Scene tree, lights, sky gradient, suns, star layers, streak layer, nebulae | `createScene`, `updateSuns`, `updateStreaks`, `updateNebulae`, `updateStarAnchors` |
| `rocket.js` | Rocket mesh group, engine glow material, runtime read of `--ij-color-primary` | `createRocket`, `updateGlow` |
| `planets.js` | Spawn/recycle planet groups with rings & moons, near-miss detection | `createPlanetField` |
| `asteroids.js` | Spawn/recycle asteroid clusters from a shared geometry pool | `createAsteroidField` |
| `textures.js` | Multi-octave noise → bump texture + color map, both shared | `getPlanetBumpTexture`, `getPlanetColorMap` |
| `exhaust.js` | Ring-buffer particle trail with additive fade | `createExhaust` |
| `audio.js` | Filtered noise + sub-osc engine drone, Web Audio API | `initAudio`, `setEngineLevel`, `suspendAudio` |
| `music.js` | Random loop selection over a list of MP3 paths, mute persistence | `startMusic`, `toggleMusic`, `isMuted`, `hasMusic` |
| `story.js` | Sentence-by-sentence narrative with fade in/out and looping | `startStory` |
| `controls.js` | Keyboard + mouse listeners, blur-resets all keys | `createControls` |
| `motion.js` | `prefers-reduced-motion` matchMedia gate, live-updates | `prefersReducedMotion` |
| `analytics.js` | Thin wrapper over Umami, with once-per-session helper | `trackEvent`, `trackOnce` |
| `stats.js` | Collective-distance API client (Turso-backed via /api/distance) | `fetchTotalDistance`, `reportSessionDistance` |
| `milestones.js` | Distance threshold table + once-per-session edge detection | `MILESTONES`, `checkMilestone` |

---

## Tunable constants

The most useful knobs, organized by where they live. All are plain `const` declarations at the top of each module — no config file.

**Flight feel** (`main.js`)
- `ROT_SPEED` — radians per 60fps frame for pitch/yaw/roll
- `ACCEL`, `MAX_SPEED` — throttle curve
- `FOV_IDLE`, `FOV_MAX` — speed-based FOV punch range
- `INTRO_DURATION`, `INTRO_FOV_START`, `INTRO_CAM_DISTANCE` — opening cinematic

**World** (`planets.js`, `asteroids.js`)
- `TARGET_COUNT` (planets) — how many in flight at once
- `RING_CHANCE`, `ONE_MOON_CHANCE`, `TWO_MOON_CHANCE` — per-planet probabilities
- `FIELD_COUNT`, `ASTEROIDS_PER_FIELD`, `FIELD_RADIUS` — asteroid density

**Visuals** (`scene.js`, `textures.js`, `exhaust.js`)
- `SUNS` — array of sun specs (direction, color, intensity, halo size)
- `NEBULA_COLORS`, plus opacity range in `makeNebulae`
- `OCTAVES` — noise frequency bands for planet textures
- `POOL_SIZE`, `LIFETIME_S`, `SPAWN_RATE`, `SPAWN_THRESHOLD` — exhaust trail tuning

**Audio** (`audio.js`, `music.js`)
- `VOLUME` (in `music.js`) — music loop volume, defaults to 0.4
- `setEngineLevel` ramp constants in `audio.js` — engine timbre and gain

---

## Adding music

Four AAC loops ship in `audio/`. The first cycle plays them in the order they appear in the `LOOPS` array (so a curated opening sequence works); after that, the player picks at random with no immediate repeat.

To add or replace loops:

1. Drop AAC/M4A files (or MP3) into `audio/`
2. Add or update their paths in the `LOOPS` array in `src/music.js`:
   ```js
   const LOOPS = [
     'audio/00.m4a',
     'audio/01.m4a',
   ];
   ```

The ♪ button auto-appears in the top-right HUD. Mute state persists in localStorage. See [`audio/README.md`](audio/README.md) for format conversion commands and loudness recommendations.

---

## Editing the story

Edit `SENTENCES` in `src/story.js`. Each sentence fades in over `FADE_MS`, holds for `HOLD_MS`, fades out, and waits `GAP_MS` before the next. The narrative loops indefinitely once it starts (after the cinematic intro completes).

Keep lines short — they should be readable at a glance from the bottom of the screen while the player is steering.

---

## Design system

The UI chrome (start screen, button, HUD, story copy) uses tokens from [iamjarl-design](https://github.com/JarlLyng/iamjarl-design). The 3D scene has its own visual language and does not reference design tokens.

The page is anchored to dark mode (`<html class="dark">`) so token values stay consistent regardless of the visitor's OS preference — the space scene is always dark, so light-mode tokens would clash.

The rocket's fin color is a special case: `rocket.js` reads `--ij-color-primary` at runtime via `getComputedStyle()`, so brand color changes flow through to the 3D scene without code changes.

### Updating tokens

The design system is vendored, not linked. To pull a new release, copy the latest `dist/css/tokens.css` from the design-system repo into `vendor/iamjarl-tokens.css`, then run the validator:

```bash
./scripts/check-tokens.sh
```

The script verifies that every `--ij-*` token referenced in our CSS still exists in the vendored file. If upstream renamed or removed a token we depend on, the script fails with a list of missing tokens — preventing silent fallback to hardcoded values.

---

## Deployment

Hosted entirely on [Vercel](https://vercel.com) at the custom domain `littlerocket.iamjarl.com`. Static files in the repo root are served as-is (no build step); `api/distance.js` is picked up automatically as a serverless function. Frontend and API share the same origin, so there is no CORS dance for the start-screen counter.

### One-time setup

1. **Turso** — create a project and database for `little-rocket`. Capture the database URL and an auth token.
2. **Vercel** — create a project pointed at this repo. In **Settings → Environment Variables**, add:
   - `TURSO_DATABASE_URL` (e.g. `libsql://little-rocket-yourorg.turso.io`)
   - `TURSO_AUTH_TOKEN`
   - `RATE_LIMIT_SALT` *(optional)* — any string; salts the hashed-IP keys the rate limiter stores. A default is used if unset.
3. **Domain** — add `littlerocket.iamjarl.com` in Vercel → Domains, then point the Namecheap CNAME at the value Vercel shows (typically `cname.vercel-dns.com`). Vercel provisions the Let's Encrypt cert automatically.
4. Push to `main`. The first call to `/api/distance` lazily creates the schema.

### Schema

`api/distance.js` lazily creates three tables on first call:

```sql
-- Full flight history (kept for future per-session analytics).
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  distance_au INTEGER NOT NULL CHECK (distance_au >= 0 AND distance_au <= 1000000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Single-row running aggregate, so GET reads one indexed row instead of
-- scanning all of `sessions` on every start-screen load. Seeded once from
-- whatever history already exists.
CREATE TABLE totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_au INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0
);

-- Ephemeral per-IP rate-limit keys (hashed IP + timestamp), pruned each
-- request — no durable IP storage. Shared by both API functions.
CREATE TABLE rate_limit (
  ip_hash TEXT NOT NULL,
  ts INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Collective planet names (created lazily by api/names.js). Names drift free
-- of any one planet; clients pull a random sample to sprinkle onto passing
-- worlds. created_at lets names be hand-moderated if ever needed.
CREATE TABLE planet_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

A distance POST inserts into `sessions` and bumps `totals` atomically. A name
POST inserts into `planet_names`. To extend with new per-session columns:
`ALTER TABLE sessions ADD COLUMN max_speed REAL` and similar — SQLite handles it
without a migration tool.

### Abuse limits

The counter is a public, unauthenticated endpoint, so it's bounded rather than
locked down: a per-session value cap (`MAX_AU_PER_SESSION`), a CORS allowlist so
only the production origin and localhost can call it from a browser, and a
per-IP rate limit (`RATE_MAX_POSTS` per `RATE_WINDOW_S`) so a script can't pump
the total unattended. The client also reports each flight at most once per
session, so `pagehide`/bfcache can't double-count.

### Cache headers

`vercel.json` overrides defaults only where it pays off:

- `/audio/*.m4a` — `max-age=31536000, immutable` (loops never change for a given filename)
- `favicon.png`, `og-image.png` — `max-age=86400`
- `sw.js` — `max-age=0, must-revalidate` so service-worker updates always propagate
- Everything else uses Vercel's defaults (revalidate per request via ETag)

### Offline / installable

`sw.js` is a service worker that precaches the app shell (HTML, CSS, every JS
module, the icon) and runtime-caches the Three.js CDN module and audio loops on
first fetch, so a cold offline load works and the `manifest.json` install
prompt has something to install. `/api/*` is never intercepted — the collective
counter always hits the network. Bump the `CACHE` constant in `sw.js` whenever a
shipped asset changes so old caches are purged on activate.

Hard-refresh with Cmd/Ctrl+Shift+R if you're not seeing a code change locally.

### Analytics

Pageview counts and a small set of engagement events go to a self-hosted [Umami](https://umami.is) instance at `umami-iamjarl.vercel.app`. No cookies, no IP storage, no cross-site tracking. The script tag lives in `index.html`; the events are sent from `src/analytics.js`.

Tracked events:

| Event | When | Properties |
|---|---|---|
| `game-started` | First click of Start, once per session | – |
| `max-speed` | First time speed reaches MAX_SPEED, once per session | `{ distance }` |
| `first-near-miss` | First NEAR MISS trigger, once per session | `{ distance }` |
| `music-mute` / `music-unmute` | Each click on the ♪ button | – |
| `milestone-reached` | Each time the rocket crosses a new distance threshold | `{ au }` |
| `planet-named` | Each time you name a world | – |
| `stranger-world-seen` | First time you encounter a world bearing a stranger's name, once per session | – |

Distances are integer AU. Nothing user-identifying is sent. Remove the Umami script tag (or fork without it) if you'd rather not be counted.

---

## Contributing

This is a personal project, but issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the short version: keep it modular, tune via the constants table above, run `./scripts/check-tokens.sh` after touching tokens, and prefer additive changes over rewrites.

---

## License

[MIT](LICENSE)
