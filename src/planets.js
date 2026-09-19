/**
 * Procedural planet field.
 *
 * Maintains TARGET_COUNT planet groups at a time. Each planet group has:
 *   - a textured body (color, bump, roughness, ao all driven by shared noise)
 *   - optional ring (~25% chance)
 *   - 0–2 moons that orbit on tilted axes
 *
 * Planets spawn ahead of the rocket and recycle behind; recycled groups are
 * disposed (geometry + material) but the shared bump/colorMap textures live
 * forever in textures.js. update() also fires onNearMiss for HUD feedback
 * when the rocket enters within 2.2× a planet's radius.
 */
import * as THREE from 'three';
import { getPlanetBumpTexture, getPlanetColorMap, getAtmosphereTexture } from './textures.js';

// Scratch vectors reused inside the per-frame loop to avoid Vector3 churn.
const _scratch = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _proj = new THREE.Vector3();

const COLORS = [0xff6644, 0x44aaff, 0xffaa44, 0x88ff88, 0xaa66ff, 0xffdd66, 0xff88aa];
const TARGET_COUNT = 40;
const RING_CHANCE = 0.25;
const ONE_MOON_CHANCE = 0.30;
const TWO_MOON_CHANCE = 0.05; // additional chance on top of one-moon

// Naming: a world becomes nameable once it drifts within this multiple of its
// radius, and stays nameable until it recycles — so you get the whole pass to
// decide, not a split-second window. Labels fade out past LABEL_FADE_FAR.
const NAMEABLE_RANGE_MULT = 8;
const STRANGER_CHANCE = 0.12; // chance a freshly-spawned world already bears a stranger's name
const LABEL_FADE_NEAR = 40;   // full opacity within this distance
const LABEL_FADE_FAR = 700;   // fully faded beyond this

// Atmospheric limb glow. The sprite spans ATMOSPHERE_SCALE × radius, and the
// shared texture's bright ring sits at 0.79 of its half-width — so the glow
// peaks at ~1.15× the planet radius, just clear of the silhouette.
const ATMOSPHERE_SCALE = 2.9;

/**
 * @param scene       THREE.Scene
 * @param anchor      the rocket group (planets spawn relative to it)
 * @param camera      used to project name labels to screen space (optional)
 * @param labelLayer  a DOM element that holds the floating name labels (optional)
 */
export function createPlanetField(scene, anchor, camera = null, labelLayer = null) {
  const planets = [];
  const bumpMap = getPlanetBumpTexture();
  const colorMap = getPlanetColorMap();

  // Names other players have left, sprinkled onto passing worlds. Empty until
  // the API resolves (and stays empty offline) — naming still works locally.
  let strangerPool = [];
  let onStranger = null;       // fired once when a stranger-named world first appears
  let currentNameable = null;  // nearest world the player could name right now

  function makeMoon(planetRadius) {
    const moonRadius = planetRadius * (0.18 + Math.random() * 0.22);
    const moonGeo = new THREE.SphereGeometry(moonRadius, 16, 16);
    moonGeo.setAttribute('uv2', moonGeo.attributes.uv);
    const mesh = new THREE.Mesh(
      moonGeo,
      new THREE.MeshStandardMaterial({
        color: 0xbbbbbb,
        map: colorMap,
        roughness: 0.95,
        metalness: 0.05,
        bumpMap,
        bumpScale: 1.0,
        roughnessMap: bumpMap,
        aoMap: bumpMap,
        aoMapIntensity: 1.0,
      })
    );
    return {
      mesh,
      distance: planetRadius * (1.7 + Math.random() * 1.0),
      angle: Math.random() * Math.PI * 2,
      speed: (Math.random() < 0.5 ? -1 : 1) * (0.005 + Math.random() * 0.01),
      tilt: (Math.random() - 0.5) * 0.8, // radians, gives orbits non-equatorial planes
    };
  }

  function spawn(initial = false) {
    const r = 2 + Math.random() * 8;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    const group = new THREE.Group();

    const bodyGeo = new THREE.SphereGeometry(r, 32, 32);
    // aoMap requires uv2; for SphereGeometry we just reuse uv.
    bodyGeo.setAttribute('uv2', bodyGeo.attributes.uv);
    const body = new THREE.Mesh(
      bodyGeo,
      new THREE.MeshStandardMaterial({
        color,
        map: colorMap,
        roughness: 0.85,
        metalness: 0.1,
        emissive: color,
        emissiveIntensity: 0.06,
        bumpMap,
        bumpScale: 1.0 + Math.random() * 0.6,
        roughnessMap: bumpMap,
        aoMap: bumpMap,
        aoMapIntensity: 1.0,
      })
    );
    body.userData.spinSpeed = (Math.random() - 0.5) * 0.005;
    group.add(body);

    // Atmospheric haze on the limb. Only a touch of white — under ACES
    // tonemapping an additive glow desaturates as it brightens, so a tint
    // lifted much further toward white turns to grey fog on screen.
    const atmosphere = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getAtmosphereTexture(),
      color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.18),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    atmosphere.scale.setScalar(r * ATMOSPHERE_SCALE);
    group.add(atmosphere);

    if (Math.random() < RING_CHANCE) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * 1.4, r * 1.9, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffeecc, side: THREE.DoubleSide, transparent: true, opacity: 0.6,
        })
      );
      ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      group.add(ring);
    }

    const moons = [];
    if (Math.random() < ONE_MOON_CHANCE) {
      const m = makeMoon(r);
      group.add(m.mesh);
      moons.push(m);
      if (Math.random() < TWO_MOON_CHANCE) {
        const m2 = makeMoon(r);
        group.add(m2.mesh);
        moons.push(m2);
      }
    }

    group.userData.body = body;
    group.userData.moons = moons;
    group.userData.radius = r;
    group.userData.wasNear = false;
    group.userData.name = null;      // set when named (by you or a stranger)
    group.userData.stranger = false; // true if the name came from the shared pool
    group.userData.nameable = false; // true once you've drifted close enough to name it
    group.userData.labelEl = null;   // floating DOM label, created lazily when named

    // Worlds spawned ahead occasionally already carry a name a stranger let
    // loose. The initial field spawns before the pool loads, so the opening
    // never floods you with names — they appear as you fly on.
    if (!initial && strangerPool.length && Math.random() < STRANGER_CHANCE) {
      group.userData.name = strangerPool[Math.floor(Math.random() * strangerPool.length)];
      group.userData.stranger = true;
    }

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(anchor.quaternion);
    const right   = new THREE.Vector3(1, 0,  0).applyQuaternion(anchor.quaternion);
    const up      = new THREE.Vector3(0, 1,  0).applyQuaternion(anchor.quaternion);

    const dist = initial ? 400 + Math.random() * 1200 : 1200 + Math.random() * 600;
    const spread = 800;
    group.position.copy(anchor.position)
      .add(forward.multiplyScalar(dist))
      .add(right.multiplyScalar((Math.random() - 0.5) * spread))
      .add(up.multiplyScalar((Math.random() - 0.5) * spread));

    scene.add(group);
    planets.push(group);
  }

  for (let i = 0; i < TARGET_COUNT; i++) spawn(true);

  // Create the floating DOM label for a planet the first time it's named.
  function makeLabel(p) {
    if (!labelLayer || p.userData.labelEl) return;
    const el = document.createElement('div');
    el.className = `planet-label ${p.userData.stranger ? 'stranger' : 'mine'}`;
    el.textContent = p.userData.stranger ? `"${p.userData.name}"` : p.userData.name;
    el.style.opacity = '0';
    labelLayer.appendChild(el);
    p.userData.labelEl = el;
  }

  function removeLabel(p) {
    if (p.userData.labelEl) {
      p.userData.labelEl.remove();
      p.userData.labelEl = null;
    }
  }

  // Project a named planet to screen space and position/fade its label. Labels
  // behind the camera or off-screen are hidden; the rest fade with distance so
  // they read as faint, drifting things rather than UI.
  function positionLabel(p, planetDist) {
    const el = p.userData.labelEl;
    if (!el) return;
    if (_camDir.subVectors(p.position, camera.position).dot(_camFwd) <= 0) {
      el.style.opacity = '0';
      return;
    }
    _proj.copy(p.position).project(camera);
    if (_proj.x < -1.1 || _proj.x > 1.1 || _proj.y < -1.1 || _proj.y > 1.1) {
      el.style.opacity = '0';
      return;
    }
    const w = window.innerWidth, h = window.innerHeight;
    const x = (_proj.x * 0.5 + 0.5) * w;
    const y = (-_proj.y * 0.5 + 0.5) * h;
    const fade = 1 - Math.min(1, Math.max(0, (planetDist - LABEL_FADE_NEAR) / (LABEL_FADE_FAR - LABEL_FADE_NEAR)));
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -160%)`;
    el.style.opacity = String(fade * (p.userData.stranger ? 0.7 : 0.95));
  }

  function update(forward, dt, onNearMiss) {
    if (camera) _camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    currentNameable = null;
    let nearestNameableDist = Infinity;

    for (let i = planets.length - 1; i >= 0; i--) {
      const p = planets[i];
      p.userData.body.rotation.y += p.userData.body.userData.spinSpeed * dt;

      for (const moon of p.userData.moons) {
        moon.angle += moon.speed * dt;
        const sa = Math.sin(moon.angle);
        const ca = Math.cos(moon.angle);
        moon.mesh.position.set(
          ca * moon.distance,
          sa * Math.sin(moon.tilt) * moon.distance,
          sa * Math.cos(moon.tilt) * moon.distance
        );
      }

      const toPlanet = _scratch.subVectors(p.position, anchor.position);
      const planetDist = toPlanet.length();
      const nearThreshold = p.userData.radius * 2.2;
      const isNear = planetDist < nearThreshold;
      // Fire only on the rising edge — once per close encounter, not every frame.
      if (isNear && !p.userData.wasNear && onNearMiss) onNearMiss();
      p.userData.wasNear = isNear;

      // A stranger's world announces itself the first time it comes close.
      if (p.userData.stranger && !p.userData.seen && planetDist < LABEL_FADE_FAR) {
        p.userData.seen = true;
        makeLabel(p);
        if (onStranger) onStranger(p.userData.name);
      }

      // Track the nearest un-named world within reach as the naming target.
      if (planetDist < p.userData.radius * NAMEABLE_RANGE_MULT) p.userData.nameable = true;
      if (p.userData.nameable && !p.userData.name && planetDist < nearestNameableDist) {
        nearestNameableDist = planetDist;
        currentNameable = p;
      }

      if (p.userData.labelEl) positionLabel(p, planetDist);

      if (toPlanet.dot(forward) < -200 || planetDist > 2500) {
        removeLabel(p);
        scene.remove(p);
        p.traverse((obj) => {
          if (obj.isMesh) {
            obj.geometry.dispose();
            obj.material.dispose();
            // Note: bumpMap texture is shared and intentionally NOT disposed here.
          } else if (obj.isSprite) {
            // The atmosphere sprite: material is per-planet, its map is shared.
            obj.material.dispose();
          }
        });
        planets.splice(i, 1);
      }
    }
    while (planets.length < TARGET_COUNT) spawn();
  }

  return {
    update,
    setStrangerPool(names) { strangerPool = Array.isArray(names) ? names : []; },
    setOnStranger(cb) { onStranger = cb; },
    // True when there's a world close enough to name right now.
    hasNameable() { return currentNameable !== null; },
    // Name the nearest reachable world. Returns the name on success, else null.
    nameNearest(name) {
      const p = currentNameable;
      if (!p || p.userData.name) return null;
      p.userData.name = name;
      p.userData.stranger = false;
      makeLabel(p);
      currentNameable = null;
      return name;
    },
  };
}
