/**
 * D-Space local API, mounted at /api/dspace on the dev and preview servers.
 *
 *   GET    /api/dspace/pins              all pins (drafts included, for review)
 *   POST   /api/dspace/draft             Meta model drafts a note from photo + notes
 *   POST   /api/dspace/pins              save a draft pin
 *   POST   /api/dspace/pins/:id/approve  a person approves it; only now it speaks
 *   DELETE /api/dspace/pins/:id
 *   POST   /api/dspace/ask               answer from approved pins, with citations
 *   POST   /api/dspace/reset             restore the fictional demo set
 *   GET    /api/dspace/status            whether a Meta model key is configured
 *   GET    /api/dspace/around?lat=&lon=  live public feeds near a place (not pins)
 *
 * Writes and model calls pass the same same-site gate as the app's other
 * cost-bearing endpoints.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { admitSameSiteRequest } from '../../src/localRequestGate.mjs';
import {
  answerFromPins,
  buildAskMessages,
  buildDraftMessages,
  groundAnswer,
  offlineDraft,
} from '../../src/dspace/model.js';
import { createAroundGatherer } from './around.js';
import { llamaChat, llamaConfig } from './llama.js';
import { createPinStore } from './store.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DEFAULT_PIN_FILE = path.join(ROOT, '.dspace', 'pins.json');
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/** Build the request handler; exported for tests. */
export function createDSpaceHandler({
  store = createPinStore({ file: DEFAULT_PIN_FILE }),
  env = process.env,
  fetchImpl = globalThis.fetch,
  around,
} = {}) {
  // The app's own tools, pointed back at this server over loopback on the
  // port the request arrived at (never at a client-supplied Host).
  const gatherers = new Map();
  const gathererFor = (port) => {
    if (around) return around;
    const apiBase = `http://127.0.0.1:${Number(port) || 4173}`;
    if (!gatherers.has(apiBase)) gatherers.set(apiBase, createAroundGatherer({ apiBase }));
    return gatherers.get(apiBase);
  };

  return async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://local');
    const route = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method || 'GET';
    const llama = llamaConfig(env);

    if (method !== 'GET') {
      const admission = admitSameSiteRequest({
        hostHeader: req.headers.host,
        origin: req.headers.origin,
        secFetchSite: req.headers['sec-fetch-site'],
        proxyHeaders: req.headers,
      });
      if (!admission.ok) return send(res, admission.status || 403, { error: 'Refused' });
    }

    try {
      if (method === 'GET' && route === '/status')
        return send(res, 200, { model: llama ? llama.model : null, modelConfigured: Boolean(llama) });

      if (method === 'GET' && route === '/around') {
        const lat = Number(url.searchParams.get('lat'));
        const lon = Number(url.searchParams.get('lon'));
        if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || url.searchParams.get('lat') === null)
          return send(res, 400, { error: 'Give lat and lon' });
        return send(res, 200, await gathererFor(req.socket?.localPort)({ lat, lon }));
      }

      if (method === 'GET' && route === '/pins') return send(res, 200, { pins: await store.list() });

      if (method === 'POST' && route === '/reset') return send(res, 200, await store.reset());

      if (method === 'POST' && route === '/pins') {
        const result = await store.createDraft(await readJson(req));
        return send(res, result.error ? 400 : 201, result);
      }

      const approve = route.match(/^\/pins\/([a-z0-9-]+)\/approve$/);
      if (method === 'POST' && approve) {
        const body = await readJson(req);
        const result = await store.approve(approve[1], body);
        return send(res, result.error ? result.status || 400 : 200, result);
      }

      const one = route.match(/^\/pins\/([a-z0-9-]+)$/);
      if (method === 'DELETE' && one) {
        const result = await store.remove(one[1]);
        return send(res, result.error ? result.status || 400 : 200, result);
      }

      if (method === 'POST' && route === '/draft') {
        const body = await readJson(req);
        const imageDataUrl =
          typeof body.imageDataUrl === 'string' && IMAGE_DATA_URL.test(body.imageDataUrl)
            ? body.imageDataUrl
            : null;
        if (!llama)
          return send(res, 200, {
            draft: offlineDraft(body),
            model: null,
            note: 'No Meta model key set: draft copied from your notes. Set LLAMA_API_KEY to draft from the photo.',
          });
        const draft = await llamaChat(
          llama,
          buildDraftMessages({ ...body, imageDataUrl }),
          { fetchImpl, maxTokens: 160 },
        );
        return send(res, 200, { draft, model: llama.model });
      }

      if (method === 'POST' && route === '/ask') {
        const body = await readJson(req);
        const question = String(body.question || '').slice(0, 500);
        if (!question.trim()) return send(res, 400, { error: 'Ask a question' });
        const pins = await store.list();
        const place = typeof body.place === 'string' && body.place ? body.place : undefined;
        if (!llama) return send(res, 200, { ...answerFromPins(question, pins, { place }), model: null });
        const reply = await llamaChat(llama, buildAskMessages(question, pins, { place }), {
          fetchImpl,
          maxTokens: 300,
        });
        return send(res, 200, { ...groundAnswer(reply, pins, { place }), model: llama.model });
      }

      return send(res, 404, { error: 'Unknown D-Space route' });
    } catch (error) {
      console.warn('[D-Space]', error?.message || error);
      return send(res, error?.status || 502, { error: error?.message || 'D-Space request failed' });
    }
  };
}

/** Vite plugin that mounts the D-Space API. Install before apiNotFoundPlugin. */
export function dspacePlugin(options = {}) {
  const handle = createDSpaceHandler(options);
  const install = (server) => {
    server.middlewares.use('/api/dspace', (req, res) => {
      handle(req, res);
    });
  };
  return {
    name: 'dspace-api',
    configureServer: install,
    configurePreviewServer: install,
  };
}
