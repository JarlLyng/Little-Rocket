# Codex-anbefalinger for Little Rocket

Review udført: 2026-05-06  
Repo: `JarlLyng/Little-Rocket`  
Scope: kode, performance, dokumentation, GitHub-opsætning og eksisterende issues.

## Kort konklusion

Little Rocket er et lille, velafgrænset statisk Three.js-spil med en stærk lokal arkitektur: modulerne har klare ansvarsområder, dokumentationen er bedre end normalt for et no-build projekt, og hot-loop-koden er tydeligt skrevet med lav allocation i tankerne.

De vigtigste mangler ligger ikke i grunddesignet, men i driftssikkerhed og vedligeholdelse:

1. Der er ingen repo-ejet CI eller quality gate. GitHub Actions viser kun den indbyggede `pages-build-deployment`.
2. `main` er ikke branch-protected.
3. Dependabot-alerts er slået fra, og code scanning har ingen analyse.
4. Runtime-performance er fornuftigt tænkt, men mangler en adaptiv kvalitetspolitik for svagere mobile GPU'er.
5. De åbne issues er gode produktideer, men bør samles i en tydelig progression/audio-roadmap, så de ikke bliver små løsrevne features.

## Hvad der blev tjekket

Lokalt:

- Filstruktur, `index.html`, `styles/main.css`, alle `src/*.js`, `README.md`, `CONTRIBUTING.md`, `audio/README.md`, `robots.txt`, `sitemap.xml`, `.gitignore`, `.editorconfig` og `.gitattributes`.
- Design token check: `./scripts/check-tokens.sh` bestod.
- JS syntax check: `node --check` på alle `src/*.js` bestod.
- Asset sanity: `favicon.png` er 1024x1024, `og-image.png` er 1200x630, fire M4A-filer fylder samlet ca. 2.3 MB.
- Repo-status: `main` matcher `origin/main`; ingen lokale untracked filer ifølge `git ls-files -o --exclude-standard`.

GitHub:

- Repoet er public, MIT-licenseret og bruger `main` som default branch.
- GitHub Pages er aktivt på `https://littlerocket.iamjarl.com/`, bygger fra `main` root, HTTPS er enforced.
- Kun en branch (`main`) blev fundet.
- Ingen åbne PRs.
- 3 åbne issues: #9, #11 og #12.
- 9 lukkede issues: #1-#8 og #10.
- Labels findes, inkl. `enhancement`, `documentation`, `accessibility` og standardlabels.
- Ingen milestones.

## Prioriterede anbefalinger

### P1: Tilføj en minimal CI-workflow

Der findes ingen `.github/`-mappe i repoet. GitHub Actions har kun den dynamiske Pages-workflow `pages-build-deployment`, så fejl i tokens, JS-syntaks, links eller metadata kan ramme `main` direkte.

Anbefaling:

- Opret `.github/workflows/quality.yml`.
- Kør mindst:
  - `./scripts/check-tokens.sh`
  - `node --check src/*.js`
  - en simpel HTML/link/asset-check, der sikrer at `favicon.png`, `og-image.png`, CSS, JS og audio paths findes.
- Brug workflowen som required status check, når branch protection er slået til.

Hvorfor: Projektet har bevidst ingen build step, så CI skal ikke gøre projektet tungere. Den skal bare automatisere de checks, der allerede passer til repoets filosofi.

### P1: Slå branch protection til på `main`

GitHub API returnerede `Branch not protected` for `main`. Da GitHub Pages deployer direkte fra `main`, er det den branch, der bør have mindst en basal guardrail.

Anbefaling:

- Require PR før merge til `main`, hvis projektet fremover modtager bidrag.
- Require den nye quality workflow.
- Disallow force pushes.
- Overvej "Require linear history", hvis du vil holde den nuværende simple commit-historik.

Hvis projektet fortsat er et solo-projekt, kan protection stadig være let: kræv bare passing checks før direkte push eller før merge.

### P1: Gør GitHub security-signaler synlige

Dependabot API svarede, at alerts er disabled. Code scanning API svarede `no analysis found`. Det er ikke akut, fordi projektet ikke har npm-afhængigheder, men repoet har stadig tredjeparts runtime-afhængigheder via CDN og eksternt analytics-script.

Anbefaling:

- Slå Dependabot alerts/security updates til på repoet.
- Tilføj Dependabot config for GitHub Actions, når `.github/workflows` findes.
- Overvej CodeQL for JavaScript, selv om der ikke er build step.
- Dokumenter eksplicit i README at Three.js hentes fra `cdn.jsdelivr.net` via import map i `index.html:24-26`, og at Umami hentes fra `umami-iamjarl.vercel.app` i `index.html:28-29`.

Hvis du vil holde "no npm install" helt rent, er det fint. Så bør supply-chain strategien være: pin CDN-versioner, overvåg dem manuelt, og lav en lille release-note når Three.js bumpes.

### P1: Indfør adaptiv render-kvalitet

Rendererens DPR er fast cap'et til 2 i `src/scene.js:268-272`, og antialias er altid slået til. Det ser godt ud på moderne hardware, men WebGL-spil på mobile enheder kan få høj GPU-belastning, især med 10.300 stjerner, streak geometry, nebula sprites, 40 planeter og audio decoding.

Anbefaling:

- Brug lavere DPR på touch/mobile, f.eks. `Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2)`.
- Tilføj en intern quality preset, evt. `?quality=low|auto|high`, der styrer stjernelag, planet-count og antialias.
- Mål faktisk FPS på en billig mobil og en laptop; skriv resultatet i README eller en kort `PERFORMANCE.md`.
- Overvej dynamisk quality fallback: hvis gennemsnitlig frame time ligger over 22-25 ms i flere sekunder, sænk DPR/streaks.

Dette er vigtigere end mikrooptimering af enkelte loops.

### P2: Pool eller genbrug planet-objekter ved recycle

`src/planets.js:58-127` opretter nye planetgrupper, geometrier og materialer ved spawn. Ved recycle fjernes gruppen og mesh-ressourcer disposes i `src/planets.js:155-167`. Det er rent og korrekt, men kan give små GPU-allocation spikes, når flere objekter recycler tæt på hinanden.

Anbefaling:

- Behold den nuværende kode, hvis spillet performer stabilt.
- Hvis der kommer flere objekter eller højere hastighed, så indfør planet-pool:
  - Genbrug `Group`/mesh-struktur.
  - Del materialer mere aggressivt efter farve/type.
  - Brug radius-buckets for sphere geometries i stedet for ny `SphereGeometry` pr. planet.

Det er ikke en fejl i dag; det er den første performance-arkitektur, jeg ville forbedre, hvis profiler viser spikes.

### P2: Gør music preload mere progressiv

`src/music.js:104-116` fetcher og decoder alle fire loops parallelt efter Start. Filerne fylder samlet ca. 2.3 MB. Det er rimeligt, men på langsomme forbindelser kan første musikstart blive forsinket eller fejle samlet, fordi `Promise.all` gør hele preloaden sårbar.

Anbefaling:

- Decode første loop først og start playback, når den er klar.
- Load/decode næste loops i baggrunden.
- Behold to-sources-ahead scheduling for gapless playback, men undgå at første musikoplevelse afhænger af alle filer.
- Overvej separat state i UI: music unavailable/loading, især hvis #9 udvides.

Det passer godt sammen med issue #9, hvis audio-arkitekturen alligevel skal udvides.

### P2: Ret små a11y/browser-kompatibilitetskanter

Projektet respekterer `prefers-reduced-motion`, hvilket er godt. Der er dog et par små robustehedspunkter:

- `src/motion.js:5-10` bruger `MediaQueryList.addEventListener`. Tilføj fallback til `addListener` for ældre Safari/iOS.
- `#music-button` starter med `aria-label="Toggle music"` i `index.html:66`, men `setupMusicButton()` sætter først state-specifik label efter klik i `src/main.js:106-110`. Sæt korrekt label allerede når knappen vises.
- Overvej `aria-live="polite"` for ikke-dekorative HUD-beskeder som near-miss og fremtidige milestone toasts, eller markér dem eksplicit dekorative. Lige nu er de rent visuelle.
- Touch-controls i `src/controls.js` er en god basis, men flere samtidige touches på samme halvdel kan give lidt uventet reset-adfærd. Det er lav prioritet, men værd at teste på fysisk iPhone/iPad.

### P2: Lav en tydelig roadmap for de åbne issues

Åbne issues:

- [#9 Procedural ambient music synced to flight events](https://github.com/JarlLyng/Little-Rocket/issues/9)
- [#11 Milestone toasts at distance thresholds](https://github.com/JarlLyng/Little-Rocket/issues/11)
- [#12 Persistent exploration stats in localStorage](https://github.com/JarlLyng/Little-Rocket/issues/12)

Anbefaling:

- Saml #11 og #12 i en lille `progression`-retning: samme modulejer kan håndtere session/lifetime stats, threshold detection og UI toasts.
- Opdatér #9, fordi projektet nu allerede har asset-baserede M4A-loops. Issue-beskrivelsen taler om procedural ambient oven på engine audio; det bør afklares som enten:
  - ambient SFX-layer oven på eksisterende musik, eller
  - erstatning/alternativ til M4A-loops, eller
  - event-synced one-shots, f.eks. near-miss chime.
- Tilføj labels som `audio`, `ux`, `performance` og `tech-debt`, så backloggen bliver lettere at scanne end kun `enhancement`.
- Overvej milestones som `Hardening`, `Progression`, `Audio`, selv hvis de kun bruges let.

Min anbefalede rækkefølge: først CI/branch protection, derefter #12, så #11, og til sidst #9. #12 giver datamodel, #11 kan bygge ovenpå den, og #9 er den mest designfølsomme.

### P2: Supplér README med performance og support-matrix

README er stærk: controls, arkitektur, moduler, tunable constants, design system, deployment og analytics er godt dækket. De mest værdifulde tilføjelser er små:

- Tilføj en "Browser support" sektion: moderne Chrome/Edge/Firefox/Safari med WebGL og Web Audio.
- Tilføj en "Performance budget" sektion: mål-DPR, target FPS, cirka payload-størrelse, og hvad der sænkes i low quality.
- Ret `README.md:98`, hvor `audio/` beskrives som "Music loop MP3s"; de nuværende filer er M4A/AAC.
- Nævn at `npx serve .` kræver netværk første gang, mens `python3 -m http.server` er den letteste no-install vej.

### P3: Ryd op i GitHub features, der ikke bruges

Repo metadata viser `hasWikiEnabled: true` og `hasProjectsEnabled: true`. Hvis de bruges, fint. Hvis ikke, skaber de ekstra steder at lede.

Anbefaling:

- Slå Wiki fra, medmindre du vil have separat bruger-/designnoter der.
- Behold Projects kun hvis de åbne issues faktisk planlægges der.
- Tilføj issue forms for bug/performance/a11y, hvis du forventer eksterne rapporter.
- Tilføj en kort PR template med checklist:
  - `./scripts/check-tokens.sh`
  - `node --check src/*.js`
  - testet i desktop browser
  - testet på touch eller vurderet ikke relevant

### P3: Overvej robusthed omkring CDN og analytics

`index.html` afhænger af:

- Three.js via `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`
- Umami via `https://umami-iamjarl.vercel.app/script.js`

Anbefaling:

- Three.js: overvej at vendor'e `three.module.js`, hvis du vil have maksimal stabilitet og GitHub Pages-only drift. Det øger repo-størrelsen, men fjerner CDN som single point of failure.
- Umami: behold no-op wrapperen i `src/analytics.js`; den er korrekt defensiv. Dokumenter gerne at spillet fungerer uden analytics-script.
- Overvej en meget restriktiv CSP som dokumenteret future task. GitHub Pages gør header-baseret CSP besværlig, så dette er ikke første prioritet.

## Kodefund i positiv retning

- `src/main.js` holder orchestration samlet uden at blande scene-, input-, audio- og story-logik for meget sammen.
- `src/planets.js` og `src/asteroids.js` bruger scratch vectors i update loops og undgår åbenlyse `.clone()`-mønstre.
- `src/exhaust.js` bruger en fast buffer/ring buffer, hvilket er den rigtige form til partikler.
- `src/analytics.js` er defensiv og no-op'er, hvis Umami ikke findes.
- `scripts/check-tokens.sh` er præcis den type lille quality gate, et no-build projekt bør have.
- README beskriver arkitektur og tunable constants så godt, at nye ændringer har en naturlig retning.

## Foreslået handlingsplan

1. Opret `.github/workflows/quality.yml` med token-check og JS syntax-check.
2. Slå branch protection til på `main` med den workflow som required check.
3. Slå Dependabot alerts til og tilføj CodeQL eller en bevidst note om, hvorfor det fravælges.
4. Tilføj adaptiv DPR/quality preset og mål FPS på mindst en mobil og en desktop.
5. Implementér #12 som et lille statsmodul med versioneret localStorage key.
6. Implementér #11 oven på stats/threshold-modulet.
7. Re-scope #9, så det matcher den nuværende musikarkitektur.
8. Lav små README-rettelser: audio-format, browser support og performance budget.

## Verifikation kørt under review

```bash
./scripts/check-tokens.sh
```

Resultat: bestod med 31 design tokens mod vendored design system `v0.5.0`.

```bash
for f in src/*.js; do node --check "$f"; done
```

Resultat: bestod uden syntax-fejl.

GitHub API-resultater brugt i vurderingen:

- Pages: status `built`, source `main` `/`, custom domain `littlerocket.iamjarl.com`, HTTPS enforced.
- Branch protection: `main` er ikke protected.
- Dependabot alerts: disabled for repoet.
- Code scanning: ingen analyse fundet.
- Actions workflows: kun `pages-build-deployment`.
- PRs: ingen åbne PRs.
- Issues: #9, #11 og #12 er åbne; #1-#8 og #10 er lukkede.
