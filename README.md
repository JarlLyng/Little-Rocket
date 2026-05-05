# Little Rocket

Et lille browserspil hvor man flyver gennem rummet i en raket. Bygget med [Three.js](https://threejs.org/).

## Spil det

Live: _kommer på GitHub Pages_

Eller lokalt:

```bash
# Kør en hvilken som helst statisk server fra projektroden, fx:
npx serve .
# eller
python3 -m http.server
```

Åbn så `http://localhost:8000` (eller den port serveren melder).

> Det går ikke at åbne `index.html` direkte fra disken — ES-modul-imports kræver `http://`.

## Controls

| Tast | Funktion |
|---|---|
| ↑ / ↓ | Pitch (næse op/ned) |
| ← / → eller A / D | Yaw (drej) |
| Q / E | Roll |
| W / S | Hastighed op/ned |
| Mus | Kig rundt |

## Struktur

```
index.html              Entry point + importmap til Three
styles/main.css         UI-styling, bruger IAMJARL design tokens
vendor/iamjarl-tokens.css  Kopi af tokens fra iamjarl-design
src/
  main.js               Game loop, input → bevægelse, kamera
  scene.js              Scene, lys, stjernelag, renderer, kamera
  rocket.js              Raket-mesh + glow
  planets.js            Procedural planet-spawn og recycling
  controls.js           Tastatur + mus
favicon.png
```

## Design system

UI'et bruger tokens fra [iamjarl-design](https://github.com/JarlLyng/iamjarl-design).
Selve 3D-scenen har sit eget rumvisuelle sprog og bruger ikke tokens.

For at opdatere tokens: kopiér `dist/css/tokens.css` fra design system-repoet
til `vendor/iamjarl-tokens.css`.

## Deploy

GitHub Pages: Settings → Pages → Source: `main` branch, root. Den live URL
bliver `https://jarllyng.github.io/Little-Rocket/`.

Ingen build-step — projektet er ren static.

## License

[MIT](LICENSE)
