# Relay server HTTP API

The optional relay server is the bridge from an agent to the viewer: the agent writes
map files, the server serves them and tells open pages when they change, and the agent
can point the human at a node while it explains. It is read-only for maps.
Python 3.9+ standard library only; macOS, Linux and Windows.

**The API is stable.** Existing endpoints keep their shape; changes are additions.
Any change is a contract change: note it in `CHANGELOG.md`.

Another server (for example one at work) can implement this same API, or skip it and
embed the viewer directly.

## Starting it

```bash
python3 relay-server/serve_maps.py [--port N] [--maps-dir DIR] [--map <rel path>]
                                   [--atlas-dir DIR] [--viewer-dir DIR]
                                   [--no-open] [--no-shutdown]
                                   [--idle-minutes M] [--foreground] [--stop]
```

- Returns at once; serving happens in a detached child (unless `--foreground`).
- Prints **one line**, which the skill reads:
  `STATUS=started|reused|stopped|not_running|failed URL=…` (or `ERROR=…` in place of
  the URL). `--map` adds a deep link to that map in the URL.
- Reuses a server already serving the same maps folder with matching effective
  asset directories, capabilities and idle timeout. Different settings (or an older
  server without configuration metadata) fail with an instruction to stop and restart.
  Otherwise takes the first free
  port from `--port` (default 18300) up, trying ten.
- The maps folder is `--maps-dir`, else the `AVAGAHANA_MAP_DIR` environment variable. Set
  `AVAGAHANA_MAP_DIR` once as the standing default (for Claude Code, in the `env` section
  of `settings.json`); the agent passes `--maps-dir` only to override it. `show.py` and
  `--stop` find the folder the same way.
- Maps never live beside the code: with neither set, it prints
  `STATUS=failed ERROR="no maps folder: pass --maps-dir or set AVAGAHANA_MAP_DIR"`. A
  folder that does not exist is refused too, never created.
- `--atlas-dir` and `--viewer-dir` default to the sibling `atlas/` and `map-viewer/`
  folders. The server depends on nothing inside them: without them, the API still works
  and only the pages are missing.
- `--no-open` and `--no-shutdown` drop those capabilities: the calls are refused (403)
  and `/api/info` no longer lists them.
- Stops itself after `--idle-minutes` (default 240) with no requests and no open page.
- `--stop` stops the server serving that maps folder.

## Security

- Listens on `127.0.0.1` only.
- Every request must carry `Host: 127.0.0.1:<port>` or `localhost:<port>`; else `403`.
- `POST` requests with an `Origin` must come from that same host and port; else `403`.
  (Command-line clients such as `show.py` send no `Origin`.)
- Responses carry `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and a
  strict `Content-Security-Policy` (self only; no inline scripts), so pages served by it
  load their scripts from files.
- Paths are joined under their folder and refused if they leave it or name a hidden
  (dot) file or folder. A client that stops mid-request is dropped after 10 s.

## Endpoints

| Method and path | Response |
|---|---|
| `GET /` and `GET /<file>` | The atlas (`index.html` and its files). |
| `GET /map-viewer/<file>` | The map viewer's files. |
| `GET /api/info` | `{app, version, capabilities, sourceId}`. `capabilities` is a list of `tree`, `map`, `events`, `show`, `render`, `themes`, `before`, `open`, `shutdown` (`render` and `themes` added in WO-32, `before` in WO-34). |
| `GET /api/ping` | `{app, version, root, config}`: identity, so a second launch can reuse this server. Kept for older skills. |
| `GET /api/tree` | `{state, maps: [{path, title, mtime, size}]}` (see `map-source.md`). Hidden files and folders are left out. |
| `GET /api/map?p=<path>` | Raw text of one map, `text/plain; charset=utf-8`. `404` if not a map. |
| `GET /api/events` | Server-Sent Events, below. |
| `GET /api/before?p=<path>` | The map's earlier version that a show sent (`before`), as text; `404` when there is none. Added in WO-34. |
| `POST /api/show` | Body `{path, part?, node?, focus?, page?, mode?, view?, env?, seq?, step?, colourBy?}`. Tells every open page to show that map and node; `part` names one of the file's further diagrams by its heading's anchor (added in WO-07); `page` opens that node's page (added in WO-08); `seq` plays a sequence by its heading's anchor (`main` for the first diagram) over the view it is linked to, at `step` (a whole number from 1); `mode` may be `lifelines` (added in WO-12). `colourBy` (`category`, `level`, `class` or `changes`) opens the map in that colouring, e.g. `changes` for a plan (added in WO-13). `before`: the map's earlier version as text (2 MB at most), kept in the server's memory for that map until another, `null` (forget it) or a restart; `perspective` (`before` or `after`) which of the two to show (added in WO-34). `{delivered: <number of pages told>}`; `404` for no such map, `400` for a bad field. Stores nothing else. |
| `GET /api/themes` | `{themes, settings, problems}`: the maps folder's `.themes/` (below). `themes`: each `<id>.json` with `id` (its file name) and `label` (its `name`) set and its font faces as `{weight, style, url}`; `settings`: `{builtIn, default, logo}` with defaults filled in; `problems`: files it could not read. Empty lists when there is no `.themes/`. Added in WO-32. |
| `GET /api/theme-file?f=<file>` | A font file (`.woff2 .woff .ttf .otf`) in `.themes/`; `404` for anything else. Added in WO-32. |
| `POST /api/render` | Body `{path, state?, theme?, appearance?, format?, width? or scale?, background?, report?, before?}`: one open page draws the map and sends the file back (below). Added in WO-32. |
| `POST /api/render/<id>/claim` | A page takes a render: `200 {claimed: true}` for the first, `409` while another has it, `404` when it is over. |
| `POST /api/render/<id>` | A page's answer: `{format, encoding, data, width, height, scaledDown?, report?, steps?, problems?}` or `{error}`. `404` when the render is over. |
| `POST /api/open` | Body `{"url"}`. Opens an `http`, `https` or `mailto` link in the default browser. `{opened}`; `400` for any other link. |
| `POST /api/shutdown` | `{stopping: true}`, then the server stops and closes open event streams. |

Errors are JSON, `{"error": "…"}`, with a 4xx or 5xx status. Static files are served
only with known types (`.html .css .js .json .svg .png .woff2 .txt`).

`sourceId` is a stable opaque hash of the resolved maps directory. `config` holds
`atlas_dir`, `viewer_dir`, `can_open`, `can_shutdown`, and `idle_minutes` for reuse
comparison. Added fields do not change existing response fields.

Show `mode` accepts a lowercase letter followed by up to 23 lowercase letters or
hyphens. Unsupported modes are ignored by the viewer for the current diagram.

### `GET /api/events`

`text/event-stream`. On connect, one `tree` event with the current state. Then:

| Event | Data | When |
|---|---|---|
| `tree` | `{state}` | A map was added, removed or changed (the folder is scanned about once a second while a page listens). |
| `show` | `{path, part?, node?, focus?, page?, mode?, view?, env?, seq?, step?, colourBy?, theme?}` | Someone called `POST /api/show`. |
| `render` | `{id, path, state, format, theme?, appearance?, width? or scale?, background, report}` | Someone called `POST /api/render`: the page that claims it answers. |

A comment line (`: keep-alive`) every 15 s keeps the stream open. A page that cannot hold
the stream polls `GET /api/tree` instead.

### Look here: `POST /api/show` and `show.py`

The agent's one-way pointer while it explains. There is no channel back from the
viewer to the agent.

```bash
python3 relay-server/show.py "<folder>/<file>.md" [--part shop-containers] [--node n13] [--focus n8] [--page n13] [--mode org]
                             [--view NAME] [--env NAME] [--seq checkout] [--step 3] [--colour-by changes] [--theme ID]
                             [--before FILE | --before none] [--port N] [--maps-dir DIR]
```

`--before` sends an earlier version of the map, from any file (often
`git show v1.4:<map> > /tmp/old.md`): the page offers Before and After and lists what
changed in each view (`map-viewer-api.md`). The server keeps it in memory for that map, so
a reload or a new tab still has it; `--before none` forgets it, a restart drops it. The
atlas reads it with `GET /api/before` (added in WO-34).

`--theme` switches the page to a theme of `.themes/` by id (`themes.py list`), to
preview it (added in WO-32); the reader keeps it until they choose another.

`--seq` plays a sequence (its heading's anchor; `main` when it is the file's first
diagram) over the view it is linked to (`## Plays over`), paused at `--step` (from 1);
with `--mode lifelines` (or `list` and `--part` the sequence) as the sequence itself.

Prints one line:

- `STATUS=shown URL=…`: an open page was told; nothing else to do.
- `STATUS=none URL=…`: no page is open; open the URL (it carries `?node=…`).
- `STATUS=not_running ERROR=…`: no relay server for this maps folder; start it.
- `STATUS=failed ERROR=…`: no such map, or a bad field.

The atlas (WO-04) handles the `show` event: it loads the map if it is another one,
then sets the viewer's state.

### A picture for a document: `POST /api/render` and `render.py`

The agent's request for a picture of a map, answered by the reader's open atlas page
(added in WO-32). It is a request from the agent, answered by the page; it is not a
channel from the reader to the agent. No headless browser and no other dependency: the
viewer is JavaScript and draws in the browser, so the open page draws.

```bash
python3 relay-server/render.py "<folder>/<file>.md" --out picture.svg|picture.png
                               [--part ANCHOR] [--view NAME] [--env NAME] [--focus ID] [--mode MODE] [--colour-by NAME]
                               [--expand N|all] [--close a,b] [--highlight a,b] [--crop ID]
                               [--seq ANCHOR [--step N | --steps all|3-5]]
                               [--theme ID] [--appearance light|dark] [--width PX | --scale X] [--background theme|none]
                               [--report] [--port N] [--maps-dir DIR]
```

- The server sends the request to the open pages as a `render` event. Each page claims
  it: a focused page at once, others after 0.6 s, so the page the reader looked at last
  answers; the first claim wins (`409` for the rest). A page that claimed and went quiet
  for 5 s may be replaced. No claim within 3 s means no page is really open: `{status:
  "none"}` (a page closed a moment ago still counts as listening until the next
  heartbeat).
- The page mounts a second, hidden viewer with the state asked for (`marks: false`,
  nothing selected), exports it (`viewer.export`), posts the file to
  `POST /api/render/<id>` and destroys it. The reader's diagram, camera and marks never
  move.
- `POST /api/render` answers when the page does (30 s at most; `504` after):
  `{status: "rendered", format, encoding ("utf-8" for SVG text, "base64" for PNG),
  data, width, height, scaledDown, report?, steps?, problems?}`; `{status: "none"}`
  with no page; `422 {error}` when the page could not draw it; `400` for a bad field.
- `state` takes the show fields (`part`, `view`, `env`, `focus`, `node`, `page`, `mode`,
  `seq`, `step`, `colourBy`, `perspective`) and the picture's (`expand`: a whole number or `"all"`;
  `close`, `highlight`: node ids; `crop`: a node id). `format` `svg` (default) or `png`;
  `width` 16 to 16,000 px, or `scale` 0.1 to 8; `background` `theme` or `none`;
  `appearance` `light` or `dark`; `theme` a theme id (an unknown one: the default, and
  `problems` says so); `report` the layout report (`map-viewer-api.md`, Export).
- `steps` (with `seq`): the sequence's number of steps.
- `before`: the map's earlier version as text; the picture marks what differs (and `report` gets `changes`), on the map
  or (`state.perspective: "before"`) on the earlier file. `render.py --before FILE
  [--perspective before|after]` (added in WO-34). Plain pictures of two versions need
  nothing new: render each file.
- Open-folder mode (no relay) has no render; the viewer's export buttons still work.

`render.py` prints one line:

- `STATUS=rendered FILE=… [REPORT=…] [WARNING=…]`: written. With `--report`, the report
  is beside the file (`<file>.report.json`). With `--steps all` (or `3-5`), `--out` is a
  folder: `step-01.svg`, `step-02.svg`, … each with its step lit (`--format png` for PNG);
  `FILE=<folder>/step-01.svg..step-08.svg STEPS=8`.
- `STATUS=none URL=…`: no page is open; open the URL, then ask again.
- `STATUS=not_running ERROR=…`: no relay server for this maps folder; start it.
- `STATUS=failed ERROR=…`: no such map, a bad flag, or the page could not draw it.

### Themes: `.themes/` and `themes.py`

The maps folder's own themes (`map-source.md`, Themes). `GET /api/themes` serves them
to the atlas. For the agent:

```bash
python3 relay-server/themes.py list [--maps-dir DIR]        # JSON: settings, each theme's id, name, description,
                                                            # appearances, slot values, font, contrast, problems
python3 relay-server/themes.py check <theme.json>           # JSON {ok, problems}; exit 1 when unusable
python3 relay-server/themes.py derive --accent "#0f766e" [--accent2 "#b45309"] [--font F.woff2 ...]
                                      [--font-family NAME] [--id ID] [--name NAME] [--description TEXT]
                                      [--write] [--maps-dir DIR]
```

`check` mirrors the viewer's theme check (the same problem codes, held in step by
`format/theme-samples/`) and adds: category colours side by side that look alike under
protanopia, deuteranopia or tritanopia (`contrast-colour-blind`), a missing font file
(`theme-font-file`) and a missing description (`theme-description`). `derive` makes a
light and a dark appearance from one or two brand colours (kept when they read 3:1 on
the background, else darkened or lightened), eight category colours chosen to stay
apart for every kind of colour vision, a level ramp, roles, chrome and frame; `--write`
saves `.themes/<id>.json` and copies the fonts beside it.

## Tests

`python3 relay-server/test_server.py`: every endpoint, the guards, events, the
capability flags, running without atlas or viewer, render (checks, a stand-in page's
claim and answer, no page), themes, and the command line (start, reuse, show, render,
themes, stop).
