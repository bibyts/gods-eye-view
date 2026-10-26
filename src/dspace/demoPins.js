/**
 * D-Space demo dataset.
 *
 * FICTIONAL. Every address, house name, resident detail and note here is
 * invented for the demo. The street names are made up and do not exist; only
 * the surrounding geography (a residential grid in north-central Austin, TX,
 * the upstream app's reference city) is real. No real person's data.
 */

const APPROVER = 'Demo reviewer';
const CREATED = '2026-10-30T15:00:00.000Z';

// The demo house sits at the centre; its pins are a few metres apart so the
// responder tour can step between them.
const HOUSE = { lat: 30.30612, lon: -97.72745 };
const at = (dLat, dLon) => ({
  lat: Number((HOUSE.lat + dLat).toFixed(6)),
  lon: Number((HOUSE.lon + dLon).toFixed(6)),
});

const DEMO_HOUSE = '14 Larkspur Court (fictional)';

export const DEMO_CENTER = Object.freeze({ ...HOUSE, place: DEMO_HOUSE });

export const DEMO_PINS = Object.freeze(
  [
    {
      id: 'larkspur-arrive',
      ...at(-0.00012, 0),
      place: DEMO_HOUSE,
      title: 'Arrival',
      category: 'access',
      spokenText:
        'This is 14 Larkspur Court. The front door sticks; push hard at the top. The side gate on the left opens from the inside, reach over the top to the latch.',
    },
    {
      id: 'larkspur-gas',
      ...at(-0.00002, 0.00009),
      place: DEMO_HOUSE,
      title: 'Gas shutoff',
      category: 'shutoff',
      spokenText:
        'The gas meter is on the right side of the house, behind the trash bins. A shutoff wrench hangs on the hook above it.',
    },
    {
      id: 'larkspur-water',
      ...at(-0.00004, -0.00008),
      place: DEMO_HOUSE,
      title: 'Water shutoff',
      category: 'shutoff',
      spokenText: 'Water shutoff is in the garage, low on the left wall, a red handle.',
    },
    {
      id: 'larkspur-breaker',
      ...at(0.00002, -0.00003),
      place: DEMO_HOUSE,
      title: 'Breaker panel',
      category: 'shutoff',
      spokenText:
        'The breaker panel is in the laundry room, behind the door. The main breaker is the big switch at the top.',
      sourceNote: 'Drafted from a photo of the panel; checked on site.',
    },
    {
      id: 'larkspur-file-of-life',
      ...at(0.00003, 0.00003),
      place: DEMO_HOUSE,
      title: 'File of Life',
      category: 'medical',
      spokenText:
        'The File of Life is on the refrigerator door, in a red magnetic pocket. It lists medications and an emergency contact.',
    },
    {
      id: 'larkspur-oxygen',
      ...at(0.00006, 0.00001),
      place: DEMO_HOUSE,
      title: 'Oxygen in use',
      category: 'hazard',
      spokenText:
        'Home oxygen is used here. Two spare tanks are in the back bedroom closet. No open flame.',
    },
    {
      id: 'larkspur-dog',
      ...at(0.0001, -0.00004),
      place: DEMO_HOUSE,
      title: 'Dog in the yard',
      category: 'animal',
      spokenText: 'There is a dog in the back yard. His name is Biscuit. He is friendly but he will try to get out the gate.',
    },
    {
      id: 'wren-hydrant',
      lat: 30.30598,
      lon: -97.72698,
      place: '22 Wren Street (fictional)',
      title: 'Hydrant',
      category: 'info',
      spokenText: 'The nearest fire hydrant is at the corner, in front of this house, behind the hedge.',
    },
    {
      id: 'wren-wheelchair',
      lat: 30.30603,
      lon: -97.72688,
      place: '22 Wren Street (fictional)',
      title: 'Step-free entry',
      category: 'access',
      spokenText: 'The step-free entrance is the ramp at the back door, reached through the driveway.',
    },
    {
      id: 'thistle-solar',
      lat: 30.30655,
      lon: -97.72752,
      place: '9 Thistle Way (fictional)',
      title: 'Solar disconnect',
      category: 'shutoff',
      spokenText:
        'This house has rooftop solar. The solar disconnect is the grey box beside the electric meter on the north wall.',
    },
    {
      id: 'thistle-ladder',
      lat: 30.3066,
      lon: -97.72744,
      place: '9 Thistle Way (fictional)',
      title: 'Attic access',
      category: 'info',
      spokenText: 'Attic access is the pull-down ladder in the hallway ceiling, outside the bathroom.',
    },
    {
      id: 'heron-chemicals',
      lat: 30.30569,
      lon: -97.72782,
      place: '31 Heron Lane (fictional)',
      title: 'Pool chemicals',
      category: 'hazard',
      spokenText:
        'Pool chemicals are stored in the shed at the back of the lot. Chlorine and acid are on separate shelves. Keep water away from them.',
    },
  ].map((pin) => ({
    height: 2,
    sourceNote: 'Fictional demo pin.',
    status: 'approved',
    approvedBy: APPROVER,
    approvedAt: CREATED,
    createdAt: CREATED,
    demo: true,
    ...pin,
  })),
);
