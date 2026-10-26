import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_CENTER, DEMO_PINS } from './demoPins.js';
import {
  answerFromPins,
  approvedPins,
  buildAskMessages,
  buildDraftMessages,
  groundAnswer,
  normalizePin,
  placeSpeech,
  tourPins,
} from './model.js';

const HOUSE = DEMO_CENTER.place;

test('demo pins are all approved, fictional and valid', () => {
  assert.ok(DEMO_PINS.length >= 10 && DEMO_PINS.length <= 12);
  for (const pin of DEMO_PINS) {
    assert.equal(pin.status, 'approved');
    assert.equal(pin.demo, true);
    assert.match(pin.place, /\(fictional\)$/);
    assert.ok(normalizePin(pin).pin, pin.id);
  }
  assert.equal(new Set(DEMO_PINS.map((pin) => pin.id)).size, DEMO_PINS.length);
});

test('normalizePin refuses approval without text or a reviewer', () => {
  const base = { lat: 30, lon: -97, title: 'Breaker panel' };
  assert.match(normalizePin({ ...base, status: 'approved', approvedBy: 'Dee' }).error, /spoken text/);
  assert.match(normalizePin({ ...base, status: 'approved', spokenText: 'Hi.' }).error, /checked it/);
  assert.match(normalizePin({ ...base, lat: 120 }).error, /lat/);
  const { pin } = normalizePin({ ...base, spokenText: 'In the laundry.' });
  assert.equal(pin.status, 'draft');
  assert.equal(pin.approvedBy, '');
});

test('drafts never speak or reach the agent', () => {
  const draft = normalizePin({ lat: 30.3061, lon: -97.7274, title: 'Secret', place: HOUSE, spokenText: 'Unchecked claim.' }).pin;
  const pins = [...DEMO_PINS, draft];
  assert.equal(approvedPins(pins).length, DEMO_PINS.length);
  assert.ok(!placeSpeech(pins, HOUSE).includes('Unchecked'));
  assert.ok(!buildAskMessages('anything', pins)[0].content.includes('Unchecked'));
  assert.ok(!answerFromPins('secret unchecked claim', pins).citations.includes(draft.id));
});

test('responder tour runs arrive, shutoffs, medical, hazards', () => {
  const order = tourPins(DEMO_PINS, HOUSE).map((pin) => pin.category);
  assert.equal(order[0], 'access');
  assert.ok(order.indexOf('shutoff') < order.indexOf('medical'));
  assert.ok(order.indexOf('medical') < order.indexOf('hazard'));
});

test('local answers cite the pins they came from', () => {
  const water = answerFromPins('Where is the water shutoff?', DEMO_PINS);
  assert.deepEqual(water.citations, ['larkspur-water']);
  const dog = answerFromPins('Any animals?', DEMO_PINS);
  assert.deepEqual(dog.citations, ['larkspur-dog']);
  const all = answerFromPins('What do I need to know about this house?', DEMO_PINS, { place: HOUSE });
  assert.equal(all.citations.length, tourPins(DEMO_PINS, HOUSE).length);
  const none = answerFromPins('What is the wifi password?', DEMO_PINS);
  assert.deepEqual(none.citations, []);
  assert.match(none.answer, /No approved pin covers that/);
});

test('groundAnswer drops sentences without a valid citation', () => {
  const reply =
    'Water shutoff is in the garage [larkspur-water]. The house was built in 1952. ' +
    'Watch the dog [larkspur-dog]. Treasure is buried out back [made-up-pin].';
  const result = groundAnswer(reply, DEMO_PINS);
  assert.deepEqual(result.citations, ['larkspur-water', 'larkspur-dog']);
  assert.ok(!result.answer.includes('1952'));
  assert.ok(!result.answer.includes('Treasure'));
  assert.equal(result.dropped, 2);
  assert.equal(groundAnswer('No approved pin covers that.', DEMO_PINS).citations.length, 0);
  assert.match(groundAnswer('Just a guess.', DEMO_PINS).answer, /No approved pin/);
});

test('groundAnswer respects the place scope', () => {
  const result = groundAnswer('The hydrant is at the corner [wren-hydrant].', DEMO_PINS, { place: HOUSE });
  assert.deepEqual(result.citations, []);
});

test('buildDraftMessages attaches the photo only when given', () => {
  const text = buildDraftMessages({ title: 'Breaker', notes: 'laundry' });
  assert.equal(typeof text[1].content, 'string');
  const photo = buildDraftMessages({ title: 'Breaker', imageDataUrl: 'data:image/jpeg;base64,AAAA' });
  assert.equal(photo[1].content[1].type, 'image_url');
});
