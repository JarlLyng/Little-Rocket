# Little Rocket

[![Co-created with AI](https://madebyhuman.iamjarl.com/badges/co-created-white.svg)](https://madebyhuman.iamjarl.com)

A tiny browser game where you fly a rocket through an endless field of procedurally placed planets. Built with [Three.js](https://threejs.org/) — no build step, no dependencies to install.

![Little Rocket](og-image.png)

**Play it:** [littlerocket.iamjarl.com](https://littlerocket.iamjarl.com/) — desktop or laptop, keyboard required.

## Controls

| Key | Action |
|---|---|
| ↑ / ↓ | Pitch |
| ← / → or A / D | Yaw |
| Q / E | Roll |
| W / S | Throttle up / down |
| Mouse | Look around |

## Run locally

The project is plain static files, but ES module imports require a real `http://` origin — opening `index.html` straight from disk will not work.

```bash
npx serve .
# or
python3 -m http.server
```

Then open the URL the server prints.

## Project structure

```
index.html                  Entry point + Three.js import map
styles/main.css             UI styling, uses IAMJARL design tokens
vendor/iamjarl-tokens.css   Vendored copy of the design system tokens
src/
  main.js                   Game loop, input, camera
  scene.js                  Scene, lights, starfield, renderer
  rocket.js                 Rocket mesh and engine glow
  planets.js                Procedural planet spawning and recycling
  controls.js               Keyboard and mouse input
favicon.png
```

## Design system

The UI chrome (start screen, button, HUD) uses tokens from [iamjarl-design](https://github.com/JarlLyng/iamjarl-design). The 3D scene has its own visual language and does not reference design tokens.

The page is anchored to dark mode (`<html class="dark">`) so token values stay consistent regardless of the visitor's OS preference — the space scene is always dark, so light-mode tokens would clash.

### Updating tokens

The design system is vendored, not linked. To pull a new release:

```bash
cp ../iamjarl-design/dist/css/tokens.css vendor/iamjarl-tokens.css
./scripts/check-tokens.sh
```

The check script verifies that every `--ij-*` token referenced in our CSS still exists in the vendored file. If upstream renamed or removed a token we depend on, the script fails with a list of missing tokens — preventing silent fallback to hardcoded values.

## Deployment

Hosted on GitHub Pages with the custom domain `littlerocket.iamjarl.com`. There is no build step — everything in the repo root is served as-is.

## Tech notes

- Frame-rate independent movement via `THREE.Clock` delta-time, normalized to 60fps so existing tuning constants keep their feel
- Animation loop pauses when the tab is hidden (`document.hidden`) to save battery
- Input keys reset on `window.blur` so you don't keep accelerating after Cmd+Tab
- Vector instances are reused inside the hot loop instead of being allocated per frame

## License

[MIT](LICENSE)
