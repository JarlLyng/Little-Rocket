/**
 * Distance milestones — fire celebratory HUD toasts at round-number AU
 * thresholds. Each milestone fires at most once per session; reload to see
 * them again.
 *
 * Tuned to feel like genuine landmarks rather than every other minute:
 * the first one rewards a few minutes of flying, the rest space out
 * exponentially so a long flight always has a next thing to chase.
 */

export const MILESTONES = [
  { au: 100,     label: 'Past Pluto' },
  { au: 1000,    label: 'Through the heliosphere' },
  { au: 10000,   label: 'Into the Oort cloud' },
  { au: 100000,  label: 'One light-year out' },
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
