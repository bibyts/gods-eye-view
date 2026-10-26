/**
 * D-Space agent tools: list and ask about approved pins, with citations.
 * Served by the local MCP server; they read the running app's /api/dspace.
 */

import { defineTool, ToolError } from '../tools/catalog.js';

async function dspaceFetch(services, path, init) {
  const response = await services.app.fetch(`/api/dspace${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ToolError('unavailable', body.error || `D-Space returned ${response.status}`);
  return body;
}

export const dspaceListPins = defineTool({
  name: 'dspace_list_pins',
  title: 'D-Space pins',
  description:
    'Approved D-Space pins: short spoken notes attached to places (shutoffs, access, medical, hazards, animals), ' +
    'each checked by a person. Optionally limited to one place. Drafts are never returned.',
  inputSchema: {
    type: 'object',
    properties: { place: { type: 'string', maxLength: 80 } },
    additionalProperties: false,
  },
  requires: ['app'],
  async run(args, { services, signal }) {
    const { pins } = await dspaceFetch(services, '/pins', { signal });
    const approved = pins.filter(
      (pin) => pin.status === 'approved' && (!args.place || pin.place === args.place),
    );
    return {
      summary: `${approved.length} approved D-Space pin${approved.length === 1 ? '' : 's'}${args.place ? ` at ${args.place}` : ''}.`,
      data: {
        pins: approved.map(({ id, place, title, category, spokenText, lat, lon, approvedBy }) => ({
          id,
          place,
          title,
          category,
          spokenText,
          lat,
          lon,
          approvedBy,
        })),
      },
    };
  },
});

export const dspaceAsk = defineTool({
  name: 'dspace_ask',
  title: 'Ask D-Space',
  description:
    'Answer a question about a place using only approved D-Space pins. Every fact in the answer cites the pin id it came from; ' +
    'if no approved pin covers the question the answer says so. Quote the answer as given rather than adding to it.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', minLength: 1, maxLength: 500 },
      place: { type: 'string', maxLength: 80 },
    },
    required: ['question'],
    additionalProperties: false,
  },
  requires: ['app'],
  async run(args, { services, signal }) {
    const result = await dspaceFetch(services, '/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: args.question, place: args.place }),
      signal,
    });
    return {
      summary: result.answer,
      data: { citations: result.citations, model: result.model },
    };
  },
});

export const dspaceTools = Object.freeze([dspaceListPins, dspaceAsk]);
