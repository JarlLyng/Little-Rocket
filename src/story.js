/**
 * Slow-paced sci-fi narration. Sentences fade in, hold long enough to read,
 * fade out, then a brief gap before the next one. Loops indefinitely.
 *
 * Edit SENTENCES freely — the narrative is meant to feel atmospheric and
 * a little melancholic, not to drive plot. Keep lines short enough to read
 * at a glance.
 */

const SENTENCES = [
  "Day three thousand and twelve since the long dark began.",
  "The engines hum a song older than the constellations.",
  "Out here, the stars don't move. Only you do.",
  "Something passed nearby last week. You did not look back.",
  "The instruments insist there is no signal. You hear it anyway.",
  "On Earth, your name was given to a small green hill.",
  "Time is what light forgets to mention.",
  "The companion star burns blue. Sometimes it answers.",
  "A planet without a name. You give it one. It will not remember.",
  "Keep flying. The dark is patient, and so are you.",
];

const HOLD_MS = 11000;   // visible duration after fade-in completes
const FADE_MS = 1200;    // fade in/out duration (must match CSS transition)
const GAP_MS = 3500;     // dark pause between sentences

export function startStory() {
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

  function showNext() {
    if (cancelled) return;
    el.textContent = SENTENCES[index % SENTENCES.length];
    el.hidden = false;
    // Force reflow so opacity transition runs from 0
    void el.offsetWidth;
    el.classList.add('visible');

    later(() => {
      el.classList.remove('visible');
      later(() => {
        el.hidden = true;
        index++;
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
