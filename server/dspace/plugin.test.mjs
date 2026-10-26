import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { replyText } from './llama.js';
import { createDSpaceHandler } from './plugin.js';
import { createPinStore } from './store.js';

function request(handler, method, url, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: 'localhost:4173', ...headers } });
  return new Promise((resolve) => {
    const res = {
      writeHead(status) {
        this.status = status;
      },
      end(text) {
        resolve({ status: this.status, body: JSON.parse(text) });
      },
    };
    handler(req, res);
  });
}

async function withHandler(options, run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'dspace-'));
  try {
    const store = createPinStore({ file: path.join(dir, 'pins.json') });
    await run(createDSpaceHandler({ store, env: {}, ...options }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a draft is saved unspoken, then approved by a named person', async () => {
  await withHandler({}, async (handle) => {
    const created = await request(handle, 'POST', '/pins', {
      lat: 30.3061,
      lon: -97.7275,
      title: 'Breaker panel',
      place: 'Test house (fictional)',
      spokenText: 'In the laundry room.',
      status: 'approved',
      approvedBy: 'Sneaky',
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.pin.status, 'draft', 'creating can never skip review');

    const ask = await request(handle, 'POST', '/ask', { question: 'breaker panel laundry', place: 'Test house (fictional)' });
    assert.deepEqual(ask.body.citations, []);

    const refused = await request(handle, 'POST', `/pins/${created.body.pin.id}/approve`, { spokenText: 'x' });
    assert.equal(refused.status, 400);

    const approved = await request(handle, 'POST', `/pins/${created.body.pin.id}/approve`, {
      spokenText: 'The breaker panel is in the laundry room.',
      approvedBy: 'Dee',
    });
    assert.equal(approved.body.pin.status, 'approved');
    assert.equal(approved.body.pin.approvedBy, 'Dee');

    const after = await request(handle, 'POST', '/ask', { question: 'breaker panel laundry', place: 'Test house (fictional)' });
    assert.deepEqual(after.body.citations, [created.body.pin.id]);
  });
});

test('writes refuse cross-site and proxied requests', async () => {
  await withHandler({}, async (handle) => {
    const cross = await request(handle, 'POST', '/reset', {}, { 'sec-fetch-site': 'cross-site' });
    assert.equal(cross.status, 403);
    const proxied = await request(handle, 'POST', '/reset', {}, { 'x-forwarded-for': '1.2.3.4' });
    assert.equal(proxied.status, 403);
  });
});

test('with a key, drafting and asking go to the Meta model and answers stay grounded', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: init.headers.Authorization });
    const text = body.max_tokens === 160
      ? 'The breaker panel is in the laundry room.'
      : 'Water shutoff is in the garage [larkspur-water]. Also there is gold in the attic.';
    return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }));
  };
  await withHandler({ env: { LLAMA_API_KEY: 'test-key' }, fetchImpl }, async (handle) => {
    const draft = await request(handle, 'POST', '/draft', {
      title: 'Breaker',
      imageDataUrl: 'data:image/jpeg;base64,AAAA',
    });
    assert.equal(draft.body.draft, 'The breaker panel is in the laundry room.');
    assert.equal(calls[0].auth, 'Bearer test-key');
    assert.match(calls[0].url, /\/chat\/completions$/);
    assert.equal(calls[0].body.messages[1].content[1].type, 'image_url');

    const ask = await request(handle, 'POST', '/ask', { question: 'water?' });
    assert.deepEqual(ask.body.citations, ['larkspur-water']);
    assert.ok(!ask.body.answer.includes('gold'));
  });
});

test('replyText reads both compat and native Llama responses', () => {
  assert.equal(replyText({ choices: [{ message: { content: 'a' } }] }), 'a');
  assert.equal(replyText({ completion_message: { content: { type: 'text', text: 'b' } } }), 'b');
  assert.equal(replyText({}), '');
});
