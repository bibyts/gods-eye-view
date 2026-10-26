/**
 * "Live around this house": what God's Eye View's public feeds report near a
 * place right now, gathered with the app's own query tools.
 *
 * This is live public data, not checked by a person. It is shown beside the
 * approved pins, labelled with its source, and never spoken as if the place
 * said it.
 */

import { composeCatalog, coreTools } from '../../src/tools/index.js';
import { createLocalToolServices } from '../mcp/services.js';

const SECTION_TIMEOUT_MS = 15 * 1000;

/** Each section: the tool it calls, its arguments around a point, its credit. */
export const AROUND_SECTIONS = Object.freeze([
  {
    key: 'weather',
    label: 'Weather now',
    source: 'Open-Meteo',
    tool: 'get_weather',
    args: ({ lat, lon }) => ({ location: { lat, lon } }),
  },
  {
    key: 'fires',
    label: 'Active fires within 25 km',
    source: 'NASA FIRMS',
    tool: 'get_active_fires',
    args: ({ lat, lon }) => ({ area: { lat, lon, radius_km: 25 }, limit: 5 }),
  },
  {
    key: 'perimeters',
    label: 'Wildfire perimeters within 50 km',
    source: 'NIFC WFIGS',
    tool: 'get_fire_perimeters',
    args: ({ lat, lon }) => ({ area: { lat, lon, radius_km: 50 }, limit: 5 }),
  },
  {
    key: 'earthquakes',
    label: 'Earthquakes within 150 km (24 h)',
    source: 'USGS',
    tool: 'get_earthquakes',
    args: ({ lat, lon }) => ({ area: { lat, lon, radius_km: 150 }, limit: 5 }),
  },
  {
    key: 'cyclones',
    label: 'Tropical cyclones within 800 km',
    source: 'NOAA NHC / CPHC',
    tool: 'get_cyclones',
    args: ({ lat, lon }) => ({ area: { lat, lon, radius_km: 800 } }),
  },
  {
    key: 'traffic',
    label: 'Traffic on the approach (2 km)',
    source: 'TomTom',
    tool: 'get_traffic_flow',
    args: ({ lat, lon }) => ({ area: { lat, lon, radius_km: 2 } }),
  },
  {
    key: 'cameras',
    label: 'Public cameras within 3 km',
    source: 'Public traffic camera catalogs',
    tool: 'find_cctv_cameras',
    args: ({ lat, lon }) => ({ area: { lat, lon, radius_km: 3 }, limit: 5 }),
  },
]);

/**
 * Build a gatherer that answers from the app's tools.
 * @param {{catalog?: object, apiBase?: string}} options
 */
export function createAroundGatherer({ catalog, apiBase } = {}) {
  const tools =
    catalog ||
    composeCatalog({ tools: coreTools, services: createLocalToolServices({ apiBase }) });
  const available = new Set(tools.list().map((tool) => tool.name));

  return async function gather({ lat, lon }, { signal } = {}) {
    const sections = await Promise.all(
      AROUND_SECTIONS.map(async (section) => {
        const base = { key: section.key, label: section.label, source: section.source };
        if (!available.has(section.tool))
          return { ...base, unavailable: true, summary: 'Not available in this build.' };
        const timeout = AbortSignal.timeout(SECTION_TIMEOUT_MS);
        try {
          const result = await tools.call(section.tool, section.args({ lat, lon }), {
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          });
          return { ...base, summary: String(result?.summary || '').trim() || 'No report.' };
        } catch (error) {
          return {
            ...base,
            unavailable: true,
            summary: timeout.aborted ? 'Feed timed out.' : error?.message || 'Feed unavailable.',
          };
        }
      }),
    );
    return { lat, lon, retrievedAt: new Date().toISOString(), sections };
  };
}
