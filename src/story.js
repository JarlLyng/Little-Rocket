/**
 * Slow-paced sci-fi narration. Sentences fade in, hold long enough to read,
 * fade out, then a brief gap before the next one. Loops indefinitely.
 *
 * Lines can be gated so the narration knows roughly where you are:
 *
 *   minAU       — only once you've flown that far. The thresholds are set
 *                 against what people actually fly, not against the milestone
 *                 ladder: the farthest anyone has drifted is 491 AU, so the
 *                 deepest line sits at 450 and the rest well below. Gating one
 *                 at a light-year would be writing something nobody reads.
 *   afterNaming — only once you've actually named a world, so the line about
 *                 naming one lands the moment it's true rather than before.
 *
 * Ungated lines carry the opening on their own; the gated ones arrive later
 * and make the dark feel like it noticed.
 *
 * Edit SENTENCES freely — the narrative is meant to feel atmospheric and
 * a little melancholic, not to drive plot. Keep lines short enough to read
 * at a glance.
 */

const SENTENCES = [
  { text: "Day three thousand and twelve since the long dark began." },
  { text: "The engines hum a song older than the constellations." },
  { text: "Out here, the stars don't move. Only you do." },
  { text: "Something passed nearby last week. You did not look back.", minAU: 60 },
  { text: "The instruments insist there is no signal. You hear it anyway." },
  { text: "On Earth, your name was given to a small green hill.", minAU: 150 },
  { text: "Time is what light forgets to mention." },
  { text: "You have been out here longer than the mission was meant to last.", minAU: 320 },
  { text: "The companion star burns blue. Sometimes it answers." },
  { text: "A planet without a name. You give it one. It will not remember.", afterNaming: true },
  { text: "The sun you left is a star like any other now.", minAU: 450 },
  { text: "Keep flying. The dark is patient, and so are you." },
];

const HOLD_MS = 11000;   // visible duration after fade-in completes
const FADE_MS = 1200;    // fade in/out duration (must match CSS transition)
const GAP_MS = 3500;     // dark pause between sentences

/**
 * @param getDistanceAU  () => number, the rocket's distance so far
 * @param hasNamed       () => boolean, whether a world has been named yet
 */
export function startStory({ getDistanceAU = () => 0, hasNamed = () => false } = {}) {
  const el = document.getElementById('story');
  if (!el || SENTENCES.length === 0) return;

  let index = 0;
  let cancelled = false;
  let activeTimers = [];

  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    activeTimers.push(id);
    return id;
  }

  function eligible(s) {
    if (s.minAU && getDistanceAU() < s.minAU) return false;
    if (s.afterNaming && !hasNamed()) return false;
    return true;
  }

  /**
   * Next eligible line from the current position, wrapping once. Gates are
   * re-checked every time, so a line becomes available mid-flight the moment
   * you cross its threshold. Returns null if nothing qualifies yet.
   */
  function takeNext() {
    for (let i = 0; i < SENTENCES.length; i++) {
      const s = SENTENCES[(index + i) % SENTENCES.length];
      if (eligible(s)) {
        index = (index + i + 1) % SENTENCES.length;
        return s;
      }
    }
    return null;
  }

  function showNext() {
    if (cancelled) return;
    const sentence = takeNext();
    if (!sentence) { later(showNext, GAP_MS); return; }

    el.textContent = sentence.text;
    el.hidden = false;
    // Force reflow so opacity transition runs from 0
    void el.offsetWidth;
    el.classList.add('visible');

    later(() => {
      el.classList.remove('visible');
      later(() => {
        el.hidden = true;
        later(showNext, GAP_MS);
      }, FADE_MS);
    }, HOLD_MS + FADE_MS);
  }

  showNext();

  return () => {
    cancelled = true;
    for (const id of activeTimers) clearTimeout(id);
    el.hidden = true;
    el.classList.remove('visible');
  };
}
