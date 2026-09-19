/**
 * Bloom, via a post-processing chain.
 *
 * Pipeline: RenderPass → UnrealBloomPass → OutputPass.
 *
 * Why the passes are ordered that way, and why tone mapping still lives on the
 * renderer: three only applies a material's tone mapping when drawing to the
 * default framebuffer. Because RenderPass draws into a composer render target
 * (HalfFloatType, so it holds real HDR values above 1.0), the scene buffer
 * stays linear, the bloom threshold sees true luminance, and OutputPass — which
 * reads renderer.toneMapping — applies ACES exactly once on the way to screen.
 * Setting renderer.toneMapping is therefore still correct, not a double-apply.
 *
 * The threshold sits just above 1.0 on purpose. Star points are pure white at
 * luminance ~1.0, and there are 15,000 of them; a threshold below 1.0 would
 * bloom every one and turn the sky to milk. Only things that actually exceed
 * 1.0 — the suns, where an emissive mesh and an additive halo overlap, the
 * engine glow, the comet head — get to bleed.
 *
 * Bloom is skipped on touch devices, which already need a capped pixel ratio
 * to hold framerate; there the caller gets a passthrough that renders direct
 * to screen, where material tone mapping applies instead. The look matches.
 */
import * as THREE from 'three';
import { EffectComposer } from '../vendor/three-addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three-addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three-addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three-addons/postprocessing/OutputPass.js';

const STRENGTH = 0.75;
const RADIUS = 0.5;
// Above 1.0, deliberately. A star point is pure white — luminance exactly 1.0
// — so a threshold at or below 1.0 blooms all 15,000 of them and the sky turns
// to chunky sparkle. Things that should glow are pushed past this threshold on
// purpose instead: the suns exceed it where an emissive mesh and an additive
// halo overlap, and the comet head carries a gain on its material colour.
const THRESHOLD = 1.15;
const MSAA_SAMPLES = 4;

// Rendering through a composer moves blending from sRGB-encoded space into
// linear space — materials no longer tonemap or encode before blending, they
// accumulate raw and get tonemapped once at the end. Linear is the physically
// correct behaviour, but this scene leans on additive sprites (sun halos,
// nebulae, planet limbs, streaks) whose opacities were all tuned against the
// old behaviour, so going linear brightens the whole game by around 65% and
// costs it the dim, melancholy look. Measured against the direct path's mean
// luminance, this exposure puts overall brightness back where it was and lets
// bloom add glow locally instead of lifting everything.
// Only the composer path needs it — see createRenderer for the direct path.
const COMPOSER_EXPOSURE = 0.62;

/**
 * @returns {{ render: () => void, setSize: (w: number, h: number) => void, enabled: boolean }}
 */
export function createPostFX(renderer, scene, camera) {
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
                 || ('ontouchstart' in window);

  if (isTouch) {
    return {
      render() { renderer.render(scene, camera); },
      setSize() { /* the renderer's own resize handling covers this */ },
      enabled: false,
    };
  }

  // EffectComposer's default target has no multisampling, and the renderer's
  // own `antialias: true` only covers the default framebuffer — so rendering
  // through a composer silently drops MSAA and every star point turns into a
  // hard square. Supplying the target explicitly with samples restores it.
  // renderTarget2 is cloned from this one, and clone() carries `samples` over.
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.width, size.height, {
    type: THREE.HalfFloatType,
    samples: MSAA_SAMPLES,
  });

  renderer.toneMappingExposure = COMPOSER_EXPOSURE;

  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    STRENGTH, RADIUS, THRESHOLD
  ));
  composer.addPass(new OutputPass());

  return {
    render() { composer.render(); },
    setSize(w, h) { composer.setSize(w, h); },
    enabled: true,
  };
}
