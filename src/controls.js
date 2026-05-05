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
