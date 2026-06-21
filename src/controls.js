/**
 * Keyboard, mouse, and touch input bridge.
 *
 * Returns four reactive surfaces that the frame loop reads each tick:
 *
 *   keys           sparse object keyed by KeyboardEvent.code (keys['KeyW'] etc)
 *   mouse          { x, y } in [-1, 1] viewport coords for mouse-look
 *   touchSteer     { x, y } virtual joystick output, range [-1, 1]; resets on
 *                  touch release. Driven by touches on the LEFT half of the screen
 *   touchThrottle  { value } a sticky 0..1 throttle position; null until first
 *                  right-half touch. Driven by vertical drag on the RIGHT half
 *
 * On a touch device a player gets two simultaneous gestures: left-thumb steers,
 * right-thumb sets throttle. Touches on UI buttons are ignored so the existing
 * click handlers still work.
 *
 * Resets all keys on window blur so the rocket doesn't keep accelerating after
 * Cmd+Tab away from the page.
 */

const STEER_MAX_PX = 70;       // drag distance that maps to a full-axis stick deflection
const THROTTLE_RANGE_PX = 220; // vertical distance for full-throttle traversal

export function createControls() {
  const keys = Object.create(null);
  const mouse = { x: 0, y: 0 };
  const touchSteer = { x: 0, y: 0, active: false };
  const touchThrottle = { value: null };

  const pointers = new Map();

  // Don't let steering keys fire while the player is typing (e.g. naming a
  // world) — otherwise WASD would both type and fly the rocket.
  const isTyping = (e) => e.target && e.target.tagName === 'INPUT';
  const onKeyDown = (e) => { if (!isTyping(e)) keys[e.code] = true; };
  const onKeyUp   = (e) => { if (!isTyping(e)) keys[e.code] = false; };
  const onMouseMove = (e) => {
    mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  const onBlur = () => { for (const k in keys) keys[k] = false; };

  const onPointerDown = (e) => {
    if (e.pointerType !== 'touch') return;
    // Let UI buttons (Start, ?, ♪) receive the tap normally.
    if (e.target.closest('button')) return;
    const isLeft = e.clientX < window.innerWidth / 2;
    pointers.set(e.pointerId, {
      side: isLeft ? 'left' : 'right',
      startX: e.clientX,
      startY: e.clientY,
      baseThrottle: touchThrottle.value ?? 0,
    });
    if (isLeft) touchSteer.active = true;
  };

  const onPointerMove = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (p.side === 'left') {
      touchSteer.x = clamp((e.clientX - p.startX) / STEER_MAX_PX, -1, 1);
      touchSteer.y = clamp((e.clientY - p.startY) / STEER_MAX_PX, -1, 1);
    } else {
      // Drag up → throttle up. Sticky: stays where you released.
      const dy = (p.startY - e.clientY) / THROTTLE_RANGE_PX;
      touchThrottle.value = clamp(p.baseThrottle + dy, 0, 1);
    }
  };

  const onPointerUp = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (p.side === 'left') {
      touchSteer.x = 0;
      touchSteer.y = 0;
      touchSteer.active = false;
    }
    // Right-side throttle keeps its last value so cruise control works.
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  return { keys, mouse, touchSteer, touchThrottle };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
