/**
 * Keyboard + mouse input bridge.
 *
 * Returns { keys, mouse } where keys is a sparse object keyed by KeyboardEvent.code
 * (e.g. keys['KeyW'], keys['ArrowUp']) and mouse is { x, y } in [-1, 1] viewport
 * coordinates. Read these from the frame loop in main.js — no event handlers needed
 * outside this module.
 *
 * Resets all keys on window blur so the rocket doesn't keep accelerating after
 * Cmd+Tab away from the page.
 */
export function createControls() {
  const keys = Object.create(null);
  const mouse = { x: 0, y: 0 };

  const onKeyDown = (e) => { keys[e.code] = true; };
  const onKeyUp   = (e) => { keys[e.code] = false; };
  const onMouseMove = (e) => {
    mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  const onBlur = () => { for (const k in keys) keys[k] = false; };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('blur', onBlur);

  return { keys, mouse };
}
