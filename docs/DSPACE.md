# D-Space: places that speak

A hackathon layer on God's Eye View. Pins on real places speak their
need-to-know information out loud. A Meta model drafts each note, and a person
approves it before it goes live. Nothing speaks that a person didn't check.

All demo addresses, residents and notes are **fictional**.

## Run

```bash
npm ci
LLAMA_API_KEY=... npm run dev   # key optional; without it drafting/Q&A use a local fallback
```

Open http://localhost:4173 → the D-Space panel sits top right. **Fly to demo
street** → click a house or pin to hear it → **Responder tour** → **Ask**.

Optional env: `LLAMA_API_BASE` (default `https://api.llama.com/compat/v1`),
`LLAMA_MODEL` (default `Llama-4-Maverick-17B-128E-Instruct-FP8`). The key is
read from the environment only, never written to a file.

## What was added (all new code written during the event)

| Path | What |
| --- | --- |
| `src/dspace/model.js` | Pin model, approval rules, tour order, grounded Q&A helpers |
| `src/dspace/demoPins.js` | 12 fictional demo pins |
| `src/dspace/layer.js` | Cesium rendering and click picking |
| `src/dspace/speech.js` | Browser text-to-speech, captions always on |
| `src/dspace/index.js`, `api.js`, `dspace.css` | Panel: Places, Ask, Add pin, Review, About |
| `src/dspace/tools.js` | MCP tools `dspace_list_pins`, `dspace_ask` |
| `server/dspace/` | `/api/dspace` API, JSON pin store (`.dspace/pins.json`), Meta Llama client |
| `server/dspace/around.js` | "Live around this house": upstream's own query tools (weather, fires, perimeters, quakes, cyclones, traffic, cameras) run for a radius around a place |
| `scripts/dspace/build-responder-scene.mjs` | Builds the Director scene `public/scene-assets/dspace/responder-arrives.json` |

Upstream files touched: `src/main.js` (mount), `server/standalone/vite.config.js`
(API plugin), `server/mcp/server.js` (register tools), `.gitignore`.

## Safety rules enforced in code

- New pins are always saved as drafts; the API ignores any `status` sent on create.
- Approval needs spoken text and the approver's name; the UI also requires a
  "checked against the real place" tick.
- Drafts never speak, never render as live, and never reach the agent.
- Model answers are filtered: any sentence without a valid citation to an
  approved, in-scope pin is dropped.

## Live around this house

On the Places tab, **Check live feeds** shows what God's Eye View's public feeds
report near the selected house. Each line names its source, and feeds that fail
or need a key are listed as unavailable rather than hidden. Live data is kept
apart from pins: a person hasn't checked it, it isn't read aloud, and the agent
doesn't use it to answer questions about the house. Active fires need a NASA
FIRMS key and traffic needs a TomTom key (see `.env.example`); weather,
perimeters, earthquakes, cyclones and cameras are keyless.

## Known gaps

- `npm run i18n` flags the D-Space panel strings (English-only).
- The live Meta model path is tested against a mocked response only.

## Credits

Built on [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) by
Bilawal Sidhu (MIT). Map data © OpenStreetMap contributors; imagery © Esri.
