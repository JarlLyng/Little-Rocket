/**
 * Distance milestones — fire celebratory HUD toasts at round-number AU
 * thresholds. Each milestone fires at most once per session; reload to see
 * them again.
 *
 * Tuned to feel like genuine landmarks rather than every other minute:
 * the first one rewards a few minutes of flying, the rest space out
 * exponentially so a long flight always has a next thing to chase.
 */

// Exponential progression so a long flight always has a next thing to chase.
// AU values use real astronomical references where possible; 63,241 is the
// exact AU-per-light-year conversion. Outer planet distances are rounded
// to the nearest semi-major axis.
export const MILESTONES = [
  { au: 5,       label: 'Past Jupiter' },
  { au: 10,      label: 'Past Saturn' },
  { au: 19,      label: 'Past Uranus' },
  { au: 30,      label: 'Past Neptune' },
  { au: 100,     label: 'Past Pluto' },
  { au: 250,     label: 'Past the heliopause' },
  { au: 1000,    label: 'Inner Oort cloud' },
  { au: 10000,   label: 'Deep Oort cloud' },
  { au: 63241,   label: 'One light-year' },
  { au: 270000,  label: 'Approaching Proxima Centauri' },
];

const fired = new Set();

/**
 * Call once per frame. If the rocket has just crossed any unfired milestone
 * threshold, invokes onTrigger(milestone) — once per threshold per session.
 */
export function checkMilestone(distanceAU, onTrigger) {
  for (const m of MILESTONES) {
    if (distanceAU >= m.au && !fired.has(m.au)) {
      fired.add(m.au);
      onTrigger(m);
    }
  }
}
