# map-viewer

Embeddable, read-only map viewer. Plain ES modules, no build step, no server needed.

```js
import { mount } from './map-viewer/index.js';
const viewer = mount(document.getElementById('map'), { text, path: 'garden.md' });
```

Public entry: `index.js`. Contract: [`docs/map-viewer-api.md`](../docs/map-viewer-api.md).
Examples: [`examples/embed.html`](../examples/embed.html),
[`examples/two-viewers.html`](../examples/two-viewers.html). Serve the repo with any
static server (ES modules do not run from `file://`).

Tests run in the browser, from any server that serves the whole repo:
`test/index.html` (contract checks), `test/scene.html` (scene snapshots of every example
map in every mode, compared with `test/snapshots/`) and `test/perf.html` (timings for
100 / 1,000 / 5,000 nodes). `python3 scripts/browser_tests.py` runs the first two and
the atlas tests in headless Chrome; `--update` writes new snapshots after a change to
the drawing that is meant (review them in the git diff).

| File | Job |
|---|---|
| `index.js` | `mount`, `applyTheme`, `checkTheme` |
| `viewer.js` | one viewer: state, wiring, the public object |
| `chrome.js` | toolbar, panels and popover markup, interface icons |
| `stage.js` | pan, zoom, fit, pointer input |
| `paint.js` | paints a scene into the SVG, layer by layer; colour only through theme classes |
| `measure.js` | text widths and wrapping, cached across viewers |
| `icons.js`, `icons.json` | map icons (Phosphor), shared `<symbol>`s |
| `notes.js` | note Markdown, links through the host |
| `export.js` | SVG / PNG export, print |
| `problems.js` | warnings and errors |
| `themes/theme.js` | theme objects to CSS variables and fonts |
| `themes/default/` | the built-in theme and its font |
| `diagrams/mindmap/` | the mind map: `parse.js` (text to model), `layout.js` (positions), `scene.js` (sizes and plain shapes, no DOM), `list.js` (list mode) |
| `base.css` | structure only, scoped under `.mmv`; no colours |

Rules: imports nothing outside `map-viewer/`, names no `/api/` URL, never touches
`location`, scopes its CSS under the mount element.

Bundled: Phosphor icons (MIT, `vendor/phosphor/LICENSE`), Atkinson Hyperlegible Next
(SIL Open Font License 1.1, `themes/default/fonts/OFL.txt`).
