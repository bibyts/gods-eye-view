/**
 * D-Space pin model, shared by the browser layer and the local server.
 *
 * A pin is one spoken fact at one point on a place. Only `approved` pins
 * speak, render as live, or reach the agent: a `draft` exists for a person to
 * check and is never read aloud (the D-Space safety rule).
 *
 * Pure module: no DOM, no Cesium, no Node imports.
 */

export const PIN_STATUSES = Object.freeze(['draft', 'approved']);

export const PIN_CATEGORIES = Object.freeze([
  'access',
  'shutoff',
  'medical',
  'hazard',
  'animal',
  'info',
]);

/** Display order of a responder's walk-up: arrive, shutoffs, medical, hazards. */
export const TOUR_ORDER = Object.freeze([
  'access',
  'shutoff',
  'medical',
  'hazard',
  'animal',
  'info',
]);

export const LIMITS = Object.freeze({
  title: 80,
  place: 80,
  spokenText: 600,
  sourceNote: 300,
  approvedBy: 60,
  notes: 1200,
});

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function text(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function coordinate(value, bound) {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= bound ? number : null;
}

/** Whether `id` is a usable pin id. */
export function isPinId(id) {
  return typeof id === 'string' && ID.test(id);
}

/** Make a readable, unique-enough pin id from a title. */
export function makePinId(title, now = Date.now()) {
  const slug =
    String(title || 'pin')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'pin';
  return `${slug}-${now.toString(36)}`;
}

/**
 * Validate and normalize a pin. Returns `{ pin }` or `{ error }`.
 * @param {object} input
 * @param {{requireApproval?: boolean}} [options]
 */
export function normalizePin(input = {}, { requireApproval = false } = {}) {
  const lat = coordinate(input.lat, 90);
  const lon = coordinate(input.lon, 180);
  if (lat === null || lon === null) return { error: 'Pin needs a valid lat and lon' };
  const title = text(input.title, LIMITS.title);
  if (!title) return { error: 'Pin needs a title' };
  const status = PIN_STATUSES.includes(input.status) ? input.status : 'draft';
  const spokenText = text(input.spokenText, LIMITS.spokenText);
  const approvedBy = text(input.approvedBy, LIMITS.approvedBy);
  if ((status === 'approved' || requireApproval) && !spokenText)
    return { error: 'An approved pin needs spoken text' };
  if ((status === 'approved' || requireApproval) && !approvedBy)
    return { error: 'An approved pin needs the name of the person who checked it' };
  const id = isPinId(input.id) ? input.id : makePinId(title);
  const height = Number(input.height);
  return {
    pin: {
      id,
      lat,
      lon,
      height: Number.isFinite(height) ? Math.max(0, Math.min(height, 100)) : 2,
      place: text(input.place, LIMITS.place) || title,
      title,
      category: PIN_CATEGORIES.includes(input.category) ? input.category : 'info',
      spokenText,
      sourceNote: text(input.sourceNote, LIMITS.sourceNote),
      status,
      approvedBy: status === 'approved' ? approvedBy : '',
      approvedAt: status === 'approved' ? input.approvedAt || new Date().toISOString() : null,
      createdAt: input.createdAt || new Date().toISOString(),
      demo: input.demo === true,
    },
  };
}

/** Approved pins only: the set that may speak or answer questions. */
export function approvedPins(pins) {
  return (Array.isArray(pins) ? pins : []).filter((pin) => pin?.status === 'approved');
}

/** Pins of one place in responder-tour order. */
export function tourPins(pins, place) {
  return approvedPins(pins)
    .filter((pin) => !place || pin.place === place)
    .sort(
      (a, b) =>
        TOUR_ORDER.indexOf(a.category) - TOUR_ORDER.indexOf(b.category) ||
        // Curated demo pins keep their order ahead of pins added live.
        Number(b.demo === true) - Number(a.demo === true) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

/** Distinct place names, in first-seen order. */
export function placesOf(pins) {
  return [...new Set(approvedPins(pins).map((pin) => pin.place))];
}

/** What a place says when clicked: its pins, in tour order, as one passage. */
export function placeSpeech(pins, place) {
  const ordered = tourPins(pins, place);
  return ordered.map((pin) => pin.spokenText).join(' ');
}

// --- Agent question answering ------------------------------------------------

const STOP_WORDS = new Set(
  'a an and are at be do does for from how i in is it me my of on or the there this to what where which who why with you your about need know house home place any'.split(
    ' ',
  ),
);

function terms(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .map((word) => word.replace(/(ies|es|s)$/, ''));
}

const GENERAL = /\b(everything|need to know|tell me about|summar|overview|what should)\b/i;

/**
 * Answer a question from approved pins only, without a model. Used when no
 * Meta model key is configured and as the grounding check for model answers.
 * @returns {{answer: string, citations: string[], grounded: boolean}}
 */
export function answerFromPins(question, pins, { place } = {}) {
  const scope = tourPins(pins, place);
  if (!scope.length)
    return { answer: 'No approved pins here yet, so I have nothing to say.', citations: [], grounded: true };
  const wanted = new Set(terms(question));
  const matches = (value) => new Set(terms(value).filter((word) => wanted.has(word))).size;
  const scored = scope
    .map((pin) => ({
      pin,
      // A title hit is worth more than a passing mention in the text.
      score: 3 * matches(pin.title) + matches(pin.category) + matches(pin.spokenText),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  const best = scored[0]?.score || 0;
  let hits = scored.filter(({ score }) => score >= best * 0.6).map(({ pin }) => pin);
  if (!hits.length && (GENERAL.test(question) || place)) hits = scope;
  if (!hits.length)
    return {
      answer: 'No approved pin covers that. I only answer from pins a person has checked.',
      citations: [],
      grounded: true,
    };
  return {
    answer: hits.map((pin) => `${pin.spokenText} [${pin.id}]`).join(' '),
    citations: hits.map((pin) => pin.id),
    grounded: true,
  };
}

/** Messages asking a model to answer only from the given pins, with citations. */
export function buildAskMessages(question, pins, { place } = {}) {
  const scope = tourPins(pins, place);
  const context = scope
    .map((pin) => `[${pin.id}] (${pin.place} — ${pin.title}, ${pin.category}) ${pin.spokenText}`)
    .join('\n');
  return [
    {
      role: 'system',
      content:
        'You are D-Space, a voice for real places. Answer ONLY from the approved pins below. ' +
        'Every sentence that states a fact must end with the id of the pin it came from in square brackets, e.g. [water-shutoff]. ' +
        'If the pins do not cover the question, say "No approved pin covers that." and nothing else. ' +
        'Never guess, never add safety advice that is not in a pin. Keep it short and speakable: plain sentences, no lists, no markdown.\n\n' +
        `APPROVED PINS${place ? ` for ${place}` : ''}:\n${context || '(none)'}`,
    },
    { role: 'user', content: String(question || '').slice(0, 500) },
  ];
}

/**
 * Keep a model answer only where it cites pins that exist in scope.
 * Uncited or wrongly cited sentences are dropped, so nothing reaches the
 * listener that an approved pin does not back.
 */
export function groundAnswer(text, pins, { place } = {}) {
  const scope = new Map(tourPins(pins, place).map((pin) => [pin.id, pin]));
  const raw = String(text || '').trim();
  if (/no approved pin covers that/i.test(raw) && !/\[[a-z0-9-]+\]/.test(raw))
    return { answer: 'No approved pin covers that.', citations: [], grounded: true, dropped: 0 };
  const sentences = raw.match(/[^.!?]+[.!?]*(\s*\[[a-z0-9-]+\])*[.!?]*/gi) || [];
  const kept = [];
  const citations = new Set();
  let dropped = 0;
  for (const sentence of sentences) {
    const ids = [...sentence.matchAll(/\[([a-z0-9-]+)\]/gi)].map((m) => m[1]);
    const valid = ids.filter((id) => scope.has(id));
    if (!valid.length) {
      if (sentence.trim()) dropped++;
      continue;
    }
    valid.forEach((id) => citations.add(id));
    kept.push(sentence.trim());
  }
  if (!kept.length)
    return { answer: 'No approved pin covers that.', citations: [], grounded: true, dropped };
  return { answer: kept.join(' '), citations: [...citations], grounded: true, dropped };
}

/** Messages asking a model to draft one spoken note from a photo and notes. */
export function buildDraftMessages({ title, category, place, notes, imageDataUrl }) {
  const instruction =
    'You draft the spoken note for a D-Space pin: a short message a real place says out loud to a first responder or visitor. ' +
    'Write 1 to 3 plain sentences, under 60 words, in the present tense, as if the place is speaking ("The breaker panel is..."). ' +
    'Say exactly where the thing is and what matters about it. Use only what the photo and notes show; if something is unclear, leave it out rather than guess. ' +
    'No greetings, no lists, no markdown, no safety advice beyond what is given. Output only the note.';
  const facts =
    `Pin title: ${text(title, LIMITS.title) || '(none)'}\n` +
    `Category: ${PIN_CATEGORIES.includes(category) ? category : 'info'}\n` +
    `Place: ${text(place, LIMITS.place) || '(unnamed)'}\n` +
    `Author notes: ${text(notes, LIMITS.notes) || '(none)'}`;
  const content = imageDataUrl
    ? [
        { type: 'text', text: facts },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ]
    : facts;
  return [
    { role: 'system', content: instruction },
    { role: 'user', content },
  ];
}

/** A model-free draft from the author's notes, used when no key is set. */
export function offlineDraft({ title, notes }) {
  const body = text(notes, LIMITS.spokenText);
  if (body) return /[.!?]$/.test(body) ? body : `${body}.`;
  return text(title, LIMITS.title) ? `${text(title, LIMITS.title)}.` : '';
}
