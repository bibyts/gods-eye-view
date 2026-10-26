/**
 * D-Space: places that speak.
 *
 * A self-contained layer on the God's Eye View globe. Pins on real places
 * speak their need-to-know information out loud; a Meta model drafts each
 * note, and a person approves it before it goes live. Mounted once by
 * src/main.js after the application starts; touches nothing else in the app.
 */

import './dspace.css';
import { createDSpaceApi } from './api.js';
import { DEMO_CENTER } from './demoPins.js';
import { CATEGORY_STYLE, createDSpaceLayer, placeCenter } from './layer.js';
import { approvedPins, LIMITS, PIN_CATEGORIES, placeSpeech, placesOf, tourPins } from './model.js';
import { createSpeaker, speakable } from './speech.js';

const TABS = [
  ['places', 'Places'],
  ['ask', 'Ask'],
  ['author', 'Add pin'],
  ['review', 'Review'],
  ['about', 'About'],
];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Shrink a photo to at most `max` px and return a JPEG data URL. */
async function photoDataUrl(file, max = 1024) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Mount D-Space into a running viewer.
 * @param {{viewer: import('cesium').Viewer}} options
 * @returns {{destroy: Function, state: object}}
 */
export function mountDSpace({ viewer }) {
  const api = createDSpaceApi();
  const state = {
    pins: [],
    tab: 'places',
    open: true,
    place: DEMO_CENTER.place,
    pinId: null,
    touring: false,
    status: { modelConfigured: false, model: null },
    author: null,
  };

  const caption = el('div', { class: 'dspace-caption', role: 'status', 'aria-live': 'polite', hidden: true });
  const speaker = createSpeaker({ captionEl: caption });
  const body = el('div', { class: 'dspace-body' });
  const tabBar = el('div', { class: 'dspace-tabs', role: 'tablist' });
  const statusLine = el('div', { class: 'dspace-statusline' });
  const panel = el(
    'section',
    { class: 'dspace-panel', 'aria-label': 'D-Space' },
    el(
      'header',
      { class: 'dspace-header' },
      el('div', {}, el('div', { class: 'dspace-title', text: 'D-SPACE' }), el('div', { class: 'dspace-sub', text: 'Places that speak' })),
      el('button', { class: 'dspace-icon-btn', title: 'Hide D-Space', 'aria-label': 'Hide D-Space', onclick: () => setOpen(false) }, '×'),
    ),
    tabBar,
    body,
    statusLine,
  );
  const launcher = el('button', { class: 'dspace-launcher', hidden: true, onclick: () => setOpen(true) }, '◉ D-SPACE');
  const root = el('div', { class: 'dspace-root' }, panel, launcher, caption);
  document.body.append(root);

  const layer = createDSpaceLayer({
    viewer,
    onPick(target) {
      if (target.type === 'place') return selectPlace(target.place, { speak: true });
      selectPin(target.pin, { speak: true });
    },
  });

  function setOpen(open) {
    state.open = open;
    panel.hidden = !open;
    launcher.hidden = open;
  }

  function setTab(tab) {
    state.tab = tab;
    render();
  }

  const pinById = (id) => state.pins.find((pin) => pin.id === id);

  async function refresh() {
    state.pins = await api.listPins();
    layer.setPins(state.pins);
    if (!placesOf(state.pins).includes(state.place)) state.place = placesOf(state.pins)[0] || null;
    render();
  }

  function selectPin(pin, { speak = false, fly = false } = {}) {
    state.pinId = pin.id;
    state.place = pin.place;
    layer.setActive(pin.id);
    if (state.tab !== 'places' && state.tab !== 'review') state.tab = pin.status === 'approved' ? 'places' : 'review';
    setOpen(true);
    render();
    if (fly) layer.flyToPoint(pin);
    // Drafts never speak: nothing is read aloud that a person has not checked.
    if (speak && pin.status === 'approved') speaker.speak(pin.spokenText);
  }

  function selectPlace(place, { speak = false } = {}) {
    state.place = place;
    state.pinId = null;
    layer.setActive(null);
    state.tab = 'places';
    setOpen(true);
    render();
    if (speak) speaker.speak(placeSpeech(state.pins, place));
  }

  async function tour(place = state.place) {
    const stops = tourPins(state.pins, place);
    if (!stops.length) return;
    state.touring = true;
    render();
    try {
      const center = placeCenter(approvedPins(state.pins), place);
      await layer.flyToPoint(center, { range: 140, pitch: -50, heading: 10, duration: 2.5 });
      if (!state.touring) return;
      await speaker.speak(`Responder tour of ${place}. ${stops.length} approved notes.`);
      for (const [index, pin] of stops.entries()) {
        if (!state.touring) return;
        state.pinId = pin.id;
        layer.setActive(pin.id);
        render();
        await layer.flyToPoint(pin, { range: 45, pitch: -38, heading: (index * 50) % 360, duration: 2 });
        if (!state.touring) return;
        await speaker.speak(pin.spokenText);
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    } finally {
      state.touring = false;
      render();
    }
  }

  function stopAll() {
    state.touring = false;
    speaker.stop();
    render();
  }

  // --- Views -----------------------------------------------------------------

  function categoryChip(category) {
    const style = CATEGORY_STYLE[category] || CATEGORY_STYLE.info;
    return el('span', { class: 'dspace-chip', style: `--chip:${style.color}` }, style.label);
  }

  function pinCard(pin) {
    const live = pin.status === 'approved';
    return el(
      'article',
      { class: `dspace-card${live ? '' : ' is-draft'}` },
      el('div', { class: 'dspace-card-top' }, categoryChip(pin.category), live ? el('span', { class: 'dspace-live', text: 'LIVE' }) : el('span', { class: 'dspace-draft', text: 'DRAFT · not live' })),
      el('h3', { text: pin.title }),
      el('div', { class: 'dspace-place', text: pin.place }),
      el('p', { class: 'dspace-spoken', text: pin.spokenText || '(no text yet)' }),
      el(
        'div',
        { class: 'dspace-meta' },
        live ? `Approved by ${pin.approvedBy}${pin.approvedAt ? ` · ${pin.approvedAt.slice(0, 10)}` : ''}` : 'Waiting for a person to check it',
        pin.sourceNote ? el('div', { text: pin.sourceNote }) : null,
        el('div', { class: 'dspace-id', text: `pin: ${pin.id}` }),
      ),
      el(
        'div',
        { class: 'dspace-row' },
        live ? el('button', { class: 'dspace-btn primary', onclick: () => speaker.speak(pin.spokenText) }, '▶ Speak') : null,
        el('button', { class: 'dspace-btn', onclick: () => layer.flyToPoint(pin) }, 'Fly to'),
      ),
    );
  }

  function placesView() {
    const places = placesOf(state.pins);
    const selected = state.pinId ? pinById(state.pinId) : null;
    const placePins = tourPins(state.pins, state.place);
    return [
      el(
        'div',
        { class: 'dspace-row' },
        el('button', { class: 'dspace-btn', onclick: () => layer.flyFromOrbit(DEMO_CENTER) }, '✈ Fly to demo street'),
        state.touring || speaker.supported
          ? el('button', { class: 'dspace-btn', onclick: stopAll }, '■ Stop')
          : null,
      ),
      selected && selected.status === 'approved' ? pinCard(selected) : null,
      state.place
        ? el(
            'div',
            { class: 'dspace-section' },
            el('div', { class: 'dspace-section-title' }, state.place),
            el(
              'div',
              { class: 'dspace-row' },
              el('button', { class: 'dspace-btn primary', onclick: () => speaker.speak(placeSpeech(state.pins, state.place)) }, '▶ House speaks'),
              el('button', { class: 'dspace-btn', disabled: state.touring, onclick: () => tour() }, state.touring ? 'Touring…' : '🚒 Responder tour'),
              el('button', { class: 'dspace-btn', onclick: () => { state.tab = 'ask'; render(); } }, 'Ask'),
            ),
            el(
              'ol',
              { class: 'dspace-list' },
              placePins.map((pin) =>
                el(
                  'li',
                  { class: pin.id === state.pinId ? 'is-active' : '' },
                  el('button', { class: 'dspace-list-btn', onclick: () => selectPin(pin, { speak: true, fly: true }) }, categoryChip(pin.category), el('span', { text: pin.title })),
                ),
              ),
            ),
          )
        : el('p', { class: 'dspace-empty', text: 'No approved pins yet. Add one in “Add pin”.' }),
      el(
        'div',
        { class: 'dspace-section' },
        el('div', { class: 'dspace-section-title' }, `Places on this street (${places.length})`),
        el(
          'ul',
          { class: 'dspace-list' },
          places.map((place) =>
            el(
              'li',
              { class: place === state.place ? 'is-active' : '' },
              el(
                'button',
                {
                  class: 'dspace-list-btn',
                  onclick: () => {
                    selectPlace(place);
                    layer.flyToPoint(placeCenter(approvedPins(state.pins), place), { range: 120, pitch: -50 });
                  },
                },
                el('span', { text: place }),
                el('span', { class: 'dspace-count', text: String(tourPins(state.pins, place).length) }),
              ),
            ),
          ),
        ),
      ),
    ];
  }

  function askView() {
    const places = placesOf(state.pins);
    const scope = el('select', { class: 'dspace-input', 'aria-label': 'Ask about' }, el('option', { value: '' }, 'All approved pins'), places.map((place) => el('option', { value: place, selected: place === state.place }, place)));
    const input = el('input', { class: 'dspace-input', type: 'text', placeholder: 'What do I need to know about this house?', maxlength: 500, value: state.lastQuestion || '' });
    const out = el('div', { class: 'dspace-answer' }, state.lastAnswer ? answerBlock(state.lastAnswer) : null);
    async function ask(question) {
      if (!question.trim()) return;
      state.lastQuestion = question;
      out.replaceChildren(el('p', { class: 'dspace-empty', text: 'Thinking… (answers come only from approved pins)' }));
      try {
        const answer = await api.ask(question, { place: scope.value || undefined });
        state.lastAnswer = answer;
        out.replaceChildren(answerBlock(answer));
        speaker.speak(answer.answer);
      } catch (error) {
        out.replaceChildren(el('p', { class: 'dspace-error', text: error.message }));
      }
    }
    const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    const mic = Recognition
      ? el('button', {
          class: 'dspace-btn',
          title: 'Ask out loud',
          onclick: () => {
            const recognition = new Recognition();
            recognition.lang = 'en-US';
            recognition.onresult = (event) => {
              input.value = event.results[0][0].transcript;
              ask(input.value);
            };
            recognition.start();
          },
        }, '🎙')
      : null;
    return [
      el('p', { class: 'dspace-hint', text: 'The agent answers only from pins a person approved, and names the pin each fact came from.' }),
      scope,
      el(
        'form',
        { class: 'dspace-row', onsubmit: (event) => { event.preventDefault(); ask(input.value); } },
        input,
        mic,
        el('button', { class: 'dspace-btn primary', type: 'submit' }, 'Ask'),
      ),
      el(
        'div',
        { class: 'dspace-row dspace-suggest' },
        ['What do I need to know about this house?', 'Where is the water shutoff?', 'Any animals?', 'Is there a hydrant nearby?'].map((q) =>
          el('button', { class: 'dspace-chip-btn', onclick: () => { input.value = q; ask(q); } }, q),
        ),
      ),
      out,
    ];
  }

  function answerBlock(answer) {
    return el(
      'div',
      {},
      el('p', { class: 'dspace-spoken', text: speakable(answer.answer) }),
      answer.citations?.length
        ? el(
            'div',
            { class: 'dspace-cites' },
            el('span', { class: 'dspace-meta', text: 'From pins:' }),
            answer.citations.map((id) => {
              const pin = pinById(id);
              return el('button', { class: 'dspace-chip-btn', onclick: () => pin && selectPin(pin, { fly: true }) }, pin ? `${pin.title} · ${pin.place}` : id);
            }),
          )
        : null,
      el('div', { class: 'dspace-meta', text: answer.model ? `Meta model: ${answer.model}` : 'Answered locally from pin text (no model key set)' }),
    );
  }

  function authorView() {
    if (api.offline) return el('p', { class: 'dspace-error', text: 'D-Space server is offline: run the dev server to add pins.' });
    const a = (state.author ||= { title: '', category: 'shutoff', place: state.place || '', notes: '', photo: null, lat: null, lon: null, draft: null });
    const field = (label, control) => el('label', { class: 'dspace-field' }, el('span', { text: label }), control);
    const bind = (key) => (event) => { a[key] = event.target.value; };
    const where = el('div', { class: 'dspace-meta', text: a.lat == null ? 'No location yet.' : `Location: ${a.lat.toFixed(5)}, ${a.lon.toFixed(5)}` });
    const result = el('div', {});
    return [
      el('p', { class: 'dspace-hint', text: 'Photo or notes in → Meta model drafts the spoken note → you check it in Review → only then does it speak.' }),
      field('Place', el('input', { class: 'dspace-input', value: a.place, maxlength: LIMITS.place, placeholder: 'e.g. 14 Larkspur Court (fictional)', oninput: bind('place') })),
      field('Pin title', el('input', { class: 'dspace-input', value: a.title, maxlength: LIMITS.title, placeholder: 'e.g. Breaker panel', oninput: bind('title') })),
      field('Category', el('select', { class: 'dspace-input', onchange: bind('category') }, PIN_CATEGORIES.map((c) => el('option', { value: c, selected: c === a.category }, CATEGORY_STYLE[c].label)))),
      field('Notes', el('textarea', { class: 'dspace-input', rows: 3, maxlength: LIMITS.notes, placeholder: 'What should this spot say? e.g. laundry room, behind the door, main breaker at top', oninput: bind('notes') }, a.notes)),
      field(
        'Photo (optional)',
        el('input', {
          class: 'dspace-input',
          type: 'file',
          accept: 'image/*',
          capture: 'environment',
          onchange: async (event) => {
            const file = event.target.files?.[0];
            a.photo = file ? await photoDataUrl(file) : null;
            render();
          },
        }),
      ),
      a.photo ? el('img', { class: 'dspace-thumb', src: a.photo, alt: 'Photo to draft from' }) : null,
      el(
        'div',
        { class: 'dspace-row' },
        el('button', {
          class: 'dspace-btn',
          onclick: async () => {
            where.textContent = 'Click the globe where this pin belongs…';
            const point = await layer.pickLocation();
            if (point) Object.assign(a, point);
            render();
          },
        }, '📍 Place on globe'),
        state.pinId && pinById(state.pinId)
          ? el('button', { class: 'dspace-btn', onclick: () => { const p = pinById(state.pinId); Object.assign(a, { lat: p.lat + 0.00003, lon: p.lon + 0.00003, place: a.place || p.place }); render(); } }, 'Next to selected pin')
          : null,
      ),
      where,
      el('button', {
        class: 'dspace-btn primary wide',
        onclick: async (event) => {
          if (!a.title.trim()) return result.replaceChildren(el('p', { class: 'dspace-error', text: 'Give the pin a title.' }));
          if (a.lat == null) return result.replaceChildren(el('p', { class: 'dspace-error', text: 'Place the pin on the globe first.' }));
          event.target.disabled = true;
          result.replaceChildren(el('p', { class: 'dspace-empty', text: state.status.modelConfigured ? 'Meta model is drafting…' : 'Drafting from notes…' }));
          try {
            const drafted = await api.draft({ title: a.title, category: a.category, place: a.place, notes: a.notes, imageDataUrl: a.photo });
            const pin = await api.createDraft({
              title: a.title,
              category: a.category,
              place: a.place,
              lat: a.lat,
              lon: a.lon,
              spokenText: drafted.draft,
              sourceNote: `${a.photo ? 'Drafted from a photo' : 'Drafted from notes'}${drafted.model ? ` by ${drafted.model}` : ''}.`,
            });
            state.author = null;
            await refresh();
            selectPin(pin, { fly: true });
            state.tab = 'review';
            render();
          } catch (error) {
            event.target.disabled = false;
            result.replaceChildren(el('p', { class: 'dspace-error', text: error.message }));
          }
        },
      }, state.status.modelConfigured ? '✦ Draft with Meta model' : '✦ Draft (notes only — no model key)'),
      result,
    ];
  }

  function reviewView() {
    const drafts = state.pins.filter((pin) => pin.status !== 'approved');
    const selected = state.pinId ? pinById(state.pinId) : null;
    const target = selected && selected.status !== 'approved' ? selected : drafts[0];
    const parts = [el('p', { class: 'dspace-hint', text: 'Nothing speaks that a person didn’t check. Edit the draft against the real place, then approve.' })];
    if (!target) {
      parts.push(el('p', { class: 'dspace-empty', text: 'No drafts waiting.' }));
    } else {
      const text = el('textarea', { class: 'dspace-input', rows: 4, maxlength: LIMITS.spokenText }, target.spokenText);
      const who = el('input', { class: 'dspace-input', placeholder: 'Your name', maxlength: LIMITS.approvedBy, value: state.reviewer || '' });
      const checked = el('input', { type: 'checkbox' });
      const result = el('div', {});
      parts.push(
        el('div', { class: 'dspace-card is-draft' },
          el('div', { class: 'dspace-card-top' }, categoryChip(target.category), el('span', { class: 'dspace-draft', text: 'DRAFT · not live' })),
          el('h3', { text: target.title }),
          el('div', { class: 'dspace-place', text: target.place }),
          el('div', { class: 'dspace-meta', text: target.sourceNote }),
        ),
        el('label', { class: 'dspace-field' }, el('span', { text: 'Spoken text (edit freely)' }), text),
        el('div', { class: 'dspace-row' }, el('button', { class: 'dspace-btn', onclick: () => speaker.speak(text.value) }, '▶ Preview to me only')),
        el('label', { class: 'dspace-field' }, el('span', { text: 'Approved by' }), who),
        el('label', { class: 'dspace-check' }, checked, el('span', { text: 'I checked this against the real place.' })),
        el(
          'div',
          { class: 'dspace-row' },
          el('button', {
            class: 'dspace-btn primary',
            onclick: async () => {
              if (!checked.checked) return result.replaceChildren(el('p', { class: 'dspace-error', text: 'Confirm you checked it first.' }));
              try {
                state.reviewer = who.value;
                const pin = await api.approve(target.id, { spokenText: text.value, approvedBy: who.value });
                await refresh();
                state.tab = 'places';
                selectPin(pin, { speak: true, fly: true });
              } catch (error) {
                result.replaceChildren(el('p', { class: 'dspace-error', text: error.message }));
              }
            },
          }, '✓ Approve — make it live'),
          el('button', {
            class: 'dspace-btn danger',
            onclick: async () => {
              await api.remove(target.id);
              state.pinId = null;
              await refresh();
            },
          }, 'Discard'),
        ),
        result,
      );
    }
    if (drafts.length > 1)
      parts.push(
        el('div', { class: 'dspace-section' }, el('div', { class: 'dspace-section-title', text: `Waiting (${drafts.length})` }),
          el('ul', { class: 'dspace-list' }, drafts.map((pin) => el('li', { class: pin === target ? 'is-active' : '' }, el('button', { class: 'dspace-list-btn', onclick: () => selectPin(pin, { fly: true }) }, el('span', { text: `${pin.title} · ${pin.place}` }))))),
        ),
      );
    return parts;
  }

  function aboutView() {
    return [
      el('h3', { text: 'D-Space: places that speak' }),
      el('p', { text: 'Pins on real places that speak their need-to-know information out loud: where the water shutoff is, that there’s a dog in the yard, where the File of Life is kept.' }),
      el('p', { text: 'It is the spoken successor to the File of Life on the fridge: the place tells the responder, hands-free, the moment they arrive.' }),
      el('p', { text: 'A Meta model drafts each note from a photo or a few words. A person checks and approves it before it goes live. Nothing speaks that a person didn’t check, and the agent answers only from approved pins, citing each one.' }),
      el('p', { class: 'dspace-hint', text: 'Roadmap: the same layer, indoors (ReadAloud) — a camera that reads objects and small print aloud.' }),
      el('p', { class: 'dspace-meta', text: 'All demo addresses, residents and notes are fictional. Built on God’s Eye View by Bilawal Sidhu (MIT). Map data © OpenStreetMap contributors; imagery © Esri.' }),
      api.offline
        ? null
        : el('button', { class: 'dspace-btn', onclick: async () => { await api.reset(); state.pinId = null; await refresh(); } }, 'Reset demo pins'),
    ];
  }

  const VIEWS = { places: placesView, ask: askView, author: authorView, review: reviewView, about: aboutView };

  function render() {
    const drafts = state.pins.filter((pin) => pin.status !== 'approved').length;
    tabBar.replaceChildren(
      ...TABS.map(([id, label]) =>
        el('button', { class: `dspace-tab${state.tab === id ? ' is-active' : ''}`, role: 'tab', 'aria-selected': String(state.tab === id), onclick: () => setTab(id) }, label, id === 'review' && drafts ? el('span', { class: 'dspace-badge', text: String(drafts) }) : null),
      ),
    );
    body.replaceChildren(...[VIEWS[state.tab]()].flat().filter(Boolean));
    const live = approvedPins(state.pins).length;
    statusLine.textContent = `${live} live pin${live === 1 ? '' : 's'} · ${
      api.offline ? 'offline demo (read-only)' : state.status.modelConfigured ? `Meta model: ${state.status.model}` : 'no Meta model key (local fallback)'
    }`;
  }

  render();
  api.status().then((status) => {
    state.status = status;
    return refresh();
  });

  const handle = {
    state,
    viewer,
    refresh,
    tour,
    selectPlace,
    flyToDemo: () => layer.flyFromOrbit(DEMO_CENTER),
    destroy() {
      speaker.stop();
      layer.destroy();
      root.remove();
    },
  };
  window.__dspace = handle;
  return handle;
}
