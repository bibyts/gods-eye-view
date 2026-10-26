/**
 * Browser text-to-speech for D-Space, with captions always on.
 * Free, keyless and offline: uses the Web Speech API's speechSynthesis.
 */

const CITATION = /\s*\[[a-z0-9-]+\]/gi;

/** Text as it should be heard: citation tags removed. */
export function speakable(text) {
  return String(text || '')
    .replace(CITATION, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Create a speaker that shows every utterance in `captionEl` while it plays.
 * @param {{captionEl: HTMLElement}} options
 */
export function createSpeaker({ captionEl }) {
  const synth = globalThis.speechSynthesis || null;
  let token = 0;
  let voice = null;

  const pickVoice = () => {
    if (!synth) return;
    const voices = synth.getVoices();
    voice =
      voices.find((v) => /en[-_]US/i.test(v.lang) && /natural|neural|google|samantha|aria|jenny/i.test(v.name)) ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      null;
  };
  pickVoice();
  synth?.addEventListener?.('voiceschanged', pickVoice);

  function showCaption(text) {
    if (!captionEl) return;
    captionEl.textContent = text;
    captionEl.hidden = !text;
  }

  return {
    supported: Boolean(synth),

    /**
     * Speak `text`; resolves when finished, stopped or (without speech
     * support) after a reading-time pause so tours keep their pacing.
     */
    speak(text) {
      const line = speakable(text);
      const mine = ++token;
      synth?.cancel();
      showCaption(line);
      if (!line) return Promise.resolve();
      const readingMs = Math.min(12000, 1200 + line.split(' ').length * 330);
      return new Promise((resolve) => {
        const finish = () => {
          if (mine === token) showCaption('');
          resolve();
        };
        // No engine, or an engine with no voices installed (it "finishes"
        // instantly): fall back to a reading-time pause so captions stay up.
        if (!synth || !synth.getVoices().length) {
          setTimeout(finish, readingMs);
          return;
        }
        const utterance = new SpeechSynthesisUtterance(line);
        if (voice) utterance.voice = voice;
        utterance.rate = 0.98;
        utterance.onend = finish;
        utterance.onerror = finish;
        // Some engines never fire onend; never let a tour hang on one line.
        setTimeout(finish, readingMs + 6000);
        synth.speak(utterance);
      });
    },

    stop() {
      token++;
      synth?.cancel();
      showCaption('');
    },
  };
}
