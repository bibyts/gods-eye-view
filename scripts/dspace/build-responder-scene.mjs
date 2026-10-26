/**
 * Build the Director Mode scene "Responder Arrives" from the D-Space demo
 * pins: orbit → street → each approved pin of the demo house in tour order.
 * Import the output in Scenes (Director Mode) → Import.
 *
 *   node scripts/dspace/build-responder-scene.mjs
 */

import { writeFileSync } from 'node:fs';
import { DEMO_CENTER, DEMO_PINS } from '../../src/dspace/demoPins.js';
import { tourPins } from '../../src/dspace/model.js';
import { parseSceneDocument, stringifySceneDocument } from '../../src/director/document.js';

const OUT = new URL('../../public/scene-assets/dspace/responder-arrives.json', import.meta.url);
const EARTH_M_PER_DEG = 111320;

/** Camera that looks at a point from `range` metres, along `heading`, down `pitch`. */
function cameraLookingAt({ lat, lon }, { range, pitch, heading }) {
  const p = (pitch * Math.PI) / 180;
  const h = (heading * Math.PI) / 180;
  const ground = range * Math.cos(-p);
  const dNorth = -ground * Math.cos(h);
  const dEast = -ground * Math.sin(h);
  return {
    lat: Number((lat + dNorth / EARTH_M_PER_DEG).toFixed(6)),
    lon: Number((lon + dEast / (EARTH_M_PER_DEG * Math.cos((lat * Math.PI) / 180))).toFixed(6)),
    alt: Math.round(range * Math.sin(-p)),
    heading,
    pitch,
    roll: 0,
  };
}

const stops = tourPins(DEMO_PINS, DEMO_CENTER.place);
const shots = [
  { id: 'orbit', title: 'Orbit', durationSec: 2, holdSec: 1, camera: { lat: DEMO_CENTER.lat, lon: DEMO_CENTER.lon, alt: 9000000, heading: 0, pitch: -90, roll: 0 } },
  { id: 'neighborhood', title: 'The street', durationSec: 5, holdSec: 1.5, camera: cameraLookingAt(DEMO_CENTER, { range: 900, pitch: -60, heading: 0 }) },
  { id: 'arrive', title: `Arrive: ${DEMO_CENTER.place}`, durationSec: 3, holdSec: 1.5, camera: cameraLookingAt(DEMO_CENTER, { range: 140, pitch: -50, heading: 10 }) },
  ...stops.map((pin, index) => ({
    id: `pin-${pin.id}`,
    title: `${pin.title} — ${pin.spokenText}`.slice(0, 140),
    durationSec: 2,
    holdSec: Math.min(8, 2 + pin.spokenText.split(' ').length * 0.3),
    camera: cameraLookingAt(pin, { range: 45, pitch: -38, heading: (index * 50) % 360 }),
  })),
];

const project = { version: 5, scenes: [{ id: 'dspace-responder-arrives', title: 'D-Space: Responder Arrives (fictional demo)', shots }] };
const text = stringifySceneDocument(parseSceneDocument(JSON.stringify(project)));
writeFileSync(OUT, `${text.trim()}\n`);
console.log(`Wrote ${shots.length} shots to ${OUT.pathname}`);
