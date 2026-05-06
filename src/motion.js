/**
 * Single source of truth for the user's reduced-motion preference.
 * Live-updates if the OS setting changes during play.
 *
 * Uses MediaQueryList.addEventListener with a fallback to the legacy
 * addListener API for Safari < 14 / older iOS.
 */
const mq = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;

let reduced = mq ? mq.matches : false;

if (mq) {
  const onChange = (e) => { reduced = e.matches; };
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onChange);
  } else if (typeof mq.addListener === 'function') {
    mq.addListener(onChange);
  }
}

export function prefersReducedMotion() {
  return reduced;
}
