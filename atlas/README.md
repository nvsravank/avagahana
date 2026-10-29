# atlas

The first page: lists maps from a map source, hosts the viewer, owns the URL.
Contract: [`docs/map-source.md`](../docs/map-source.md).

Rule: imports the viewer only through `map-viewer/index.js`.

| File | What it holds |
|---|---|
| `index.html` | The page. No inline scripts (the relay server's CSP blocks them). |
| `app.js` | Picks the source, mounts the viewer, keeps the URL and the viewer in step, live reload, "look here", host callbacks. |
| `sources.js` | `detectServer`, `serverSource`, `folderSource`, and remembering the picked folder. |
| `hash.js` | The URL: `parseHash`, `buildHash`, `ownMapLink`. Pure functions. |
| `tree.js` | The map picker in the viewer's toolbar slot: filter and folder tree. |
| `atlas.css` | Its look, from the viewer's theme variables (`--mmv-*`). |
| `test/` | Browser-run checks: open `test/index.html` through any static server or the relay. |

## Where maps come from

- **Relay server** (`relay-server/serve_maps.py`): serves this folder at `/`. The atlas
  finds it by asking `api/info` beside the page. Live reload, the agent's "look here",
  the power button (unless `--no-shutdown`), links in the default browser (unless
  `--no-open`).
- **Any other static server** (serving the repo, the atlas at `/atlas/`): no API
  answers, so the page offers **Open folder** (Chrome or Edge). Nothing is uploaded or
  changed; the folder is checked for changes every 2.5 s. The folder is remembered;
  a browser asks once more, with one click, in a new visit. ES modules do not run from
  `file://`, so some local server is always needed.

## The URL

`#/<folder>/<file>.md?mode=mindmap&focus=n8&node=n13&view=…&env=…&rels=1`

- Same shape as the old Simple Mind Maps viewer, so old links open. Old looks in a link
  (`theme=light|dark`, `scheme=colorful|blues`, `look=`) still set the looks; they are
  not kept in the URL afterwards.
- Opening another map adds a history entry (Back returns); moving around in a map
  replaces the URL.
- A link with no `focus` shows the whole map; no `node` selects nothing.
- A note link to this atlas (same host and port; `localhost` and `127.0.0.1` count as
  one) opens in place, drilled in.
