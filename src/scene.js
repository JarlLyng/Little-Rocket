import * as THREE from 'three';

export function createScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000010, 0.0002);

  // Lower ambient + brighter directional gives bump maps more pronounced shading.
  scene.add(new THREE.AmbientLight(0x303048, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(100, 50, 100);
  scene.add(sun);

  scene.add(makeStarLayer(8000, 0.8, 4000, 0xffffff));
  scene.add(makeStarLayer(2000, 1.5, 4000, 0xddeeff));
  scene.add(makeStarLayer(300,  2.5, 4000, 0xffeecc));

  return scene;
}

function makeStarLayer(count, size, spread, color) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = (Math.random() - 0.5) * spread;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: false }));
}

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  return renderer;
}

export function createCamera() {
  return new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 5000);
}
