/**
 * Browser client for the local D-Space API. When the API is unreachable
 * (a static build, a dropped dev server) it falls back to the bundled
 * fictional demo pins, read-only, so the demo still speaks.
 */

import { DEMO_PINS } from './demoPins.js';
import { answerFromPins } from './model.js';

const BASE = '/api/dspace';

async function call(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `D-Space API ${response.status}`);
  return data;
}

/** Create the API client. */
export function createDSpaceApi() {
  let offline = false;
  let cached = DEMO_PINS.map((pin) => ({ ...pin }));

  const requireOnline = () => {
    if (offline) throw new Error('D-Space server is offline: demo pins are read-only.');
  };

  return {
    get offline() {
      return offline;
    },
    async status() {
      try {
        const status = await call('/status');
        offline = false;
        return status;
      } catch {
        offline = true;
        return { modelConfigured: false, model: null, offline: true };
      }
    },
    async listPins() {
      if (offline) return cached;
      try {
        cached = (await call('/pins')).pins;
      } catch {
        offline = true;
      }
      return cached;
    },
    async draft(input) {
      requireOnline();
      return call('/draft', { method: 'POST', body: input });
    },
    async createDraft(input) {
      requireOnline();
      return (await call('/pins', { method: 'POST', body: input })).pin;
    },
    async approve(id, { spokenText, approvedBy }) {
      requireOnline();
      return (await call(`/pins/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        body: { spokenText, approvedBy },
      })).pin;
    },
    async remove(id) {
      requireOnline();
      return call(`/pins/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    async reset() {
      requireOnline();
      return call('/reset', { method: 'POST' });
    },
    async ask(question, { place } = {}) {
      if (offline) return { ...answerFromPins(question, cached, { place }), model: null };
      return call('/ask', { method: 'POST', body: { question, place } });
    },
  };
}
