# Contributing

Thanks for taking a look. The project is small and tries to stay that way — there's no build step, no test runner, no framework. Everything is plain ES modules served as static files.

## Ground rules

- **Keep it modular.** Each visible system (planets, exhaust, audio, story, …) is a single file in `src/` with a narrow public surface. New visual or audio features should follow the same pattern: one module, one factory function returning either a Three.js object plus an `update()` method, or a small set of `start/stop/toggle` functions.
- **Tune via constants, not magic numbers.** All the meaningful knobs are named `const`s at the top of each module. If you find yourself touching a value mid-function, hoist it.
- **Stay allocation-light in the hot loop.** The frame loop in `main.js` and the per-planet/asteroid loops in `planets.js`/`asteroids.js` should not allocate. Reuse scratch `Vector3` instances declared in the closure or at module level.
- **Don't break the no-build constraint.** No bundler, no transpilation, no `npm install`-required dependencies. Three.js is loaded from `cdn.jsdelivr.net` via the import map in `index.html`.

## Adding a new module

1. Create `src/yourthing.js` with a top-level JSDoc explaining purpose and key exports.
2. Expose a small API — usually a factory like `createYourThing(scene, anchor)` returning `{ update }`, or `start/stop` functions for HUD-side things.
3. Wire it from `main.js`:
   - Construct in `run()` near the other systems.
   - Call its `update()` from inside the frame loop, alongside the existing `planets.update()` etc.
4. Update the README's *Module responsibilities* and (if relevant) *Tunable constants* tables.

## Touching the design system

If you reference a new `--ij-*` token in CSS, run:

```bash
./scripts/check-tokens.sh
```

This verifies the token actually exists in `vendor/iamjarl-tokens.css`. The script also runs as a sanity step before every commit you make involving CSS.

If you need a token that doesn't exist upstream, raise an issue against [iamjarl-design](https://github.com/JarlLyng/iamjarl-design) rather than inventing a one-off value. The 3D scene is exempt — it has its own visual language.

## Accessibility

Any motion/visual effect added to the frame loop must respect `prefers-reduced-motion`. Use `prefersReducedMotion()` from `src/motion.js` — it's a live getter, no need to subscribe to changes.

## Commit messages

Conventional but loose. The first line should describe the **outcome**, not the diff. Body paragraphs explain the why and any non-obvious choices. Multiple `Closes #N` lines (one per issue) close issues automatically when the commit lands on `main`.

## Issues

Feature ideas, bug reports, and design feedback all go in [GitHub Issues](https://github.com/JarlLyng/Little-Rocket/issues). Use the `enhancement` label for feature work and `accessibility` for a11y-specific items. Don't open an issue for typo fixes — just send the patch.
