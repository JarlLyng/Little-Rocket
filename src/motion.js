/**
 * Single source of truth for the user's reduced-motion preference.
 * Live-updates if the OS setting changes during play.
 */
const mq = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false, addEventListener() {} };

let reduced = mq.matches;
mq.addEventListener('change', (e) => { reduced = e.matches; });

export function prefersReducedMotion() {
  return reduced;
}
