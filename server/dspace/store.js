/**
 * D-Space pin store: one JSON file, seeded with the fictional demo set.
 * Small by design (a neighbourhood of pins), so whole-file writes are fine.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEMO_PINS } from '../../src/dspace/demoPins.js';
import { normalizePin } from '../../src/dspace/model.js';

const MAX_PINS = 500;

/** Create a store backed by `file`. */
export function createPinStore({ file }) {
  let pins = null;
  let writing = Promise.resolve();

  async function load() {
    if (pins) return pins;
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'));
      pins = (Array.isArray(parsed?.pins) ? parsed.pins : [])
        .map((pin) => normalizePin(pin).pin)
        .filter(Boolean);
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn('[D-Space] Pin file unreadable, reseeding:', error.message);
      pins = DEMO_PINS.map((pin) => ({ ...pin }));
    }
    return pins;
  }

  function persist() {
    const snapshot = JSON.stringify({ version: 1, pins }, null, 2);
    writing = writing.then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      const temp = `${file}.tmp`;
      await writeFile(temp, snapshot);
      await rename(temp, file);
    });
    return writing;
  }

  return {
    async list() {
      return [...(await load())];
    },

    async get(id) {
      return (await load()).find((pin) => pin.id === id) || null;
    },

    /** Save a new draft. Drafts never speak until approved. */
    async createDraft(input) {
      const list = await load();
      if (list.length >= MAX_PINS) return { error: 'Pin limit reached' };
      const { pin, error } = normalizePin({ ...input, status: 'draft', demo: false });
      if (error) return { error };
      if (list.some((existing) => existing.id === pin.id)) return { error: 'Pin id already exists' };
      list.push(pin);
      await persist();
      return { pin };
    },

    /** Approve a pin with the reviewer's final text and name. */
    async approve(id, { spokenText, approvedBy }) {
      const list = await load();
      const index = list.findIndex((pin) => pin.id === id);
      if (index < 0) return { error: 'No such pin', status: 404 };
      const { pin, error } = normalizePin(
        {
          ...list[index],
          spokenText: spokenText ?? list[index].spokenText,
          approvedBy,
          status: 'approved',
          approvedAt: new Date().toISOString(),
        },
        { requireApproval: true },
      );
      if (error) return { error };
      list[index] = pin;
      await persist();
      return { pin };
    },

    async remove(id) {
      const list = await load();
      const index = list.findIndex((pin) => pin.id === id);
      if (index < 0) return { error: 'No such pin', status: 404 };
      list.splice(index, 1);
      await persist();
      return { ok: true };
    },

    /** Restore the fictional demo set. */
    async reset() {
      pins = DEMO_PINS.map((pin) => ({ ...pin }));
      await persist();
      return { ok: true };
    },
  };
}
