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
| `GET /api/info` | `{app, version, capabilities, sourceId}`. `capabilities` is a list of `tree`, `map`, `events`, `show`, `open`, `shutdown`. |
| `GET /api/ping` | `{app, version, root, config}`: identity, so a second launch can reuse this server. Kept for older skills. |
| `GET /api/tree` | `{state, maps: [{path, title, mtime, size}]}` (see `map-source.md`). Hidden files and folders are left out. |
| `GET /api/map?p=<path>` | Raw text of one map, `text/plain; charset=utf-8`. `404` if not a map. |
| `GET /api/events` | Server-Sent Events, below. |
| `POST /api/show` | Body `{path, part?, node?, focus?, page?, mode?, view?, env?, seq?, step?, colourBy?}`. Tells every open page to show that map and node; `part` names one of the file's further diagrams by its heading's anchor (added in WO-07); `page` opens that node's page (added in WO-08); `seq` plays a sequence by its heading's anchor (`main` for the first diagram) over the view it is linked to, at `step` (a whole number from 1); `mode` may be `lifelines` (added in WO-12). `colourBy` (`category`, `level`, `class` or `changes`) opens the map in that colouring, e.g. `changes` for a plan (added in WO-13). `{delivered: <number of pages told>}`; `404` for no such map, `400` for a bad field. Stores nothing. |
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
| `show` | `{path, part?, node?, focus?, page?, mode?, view?, env?, seq?, step?, colourBy?}` | Someone called `POST /api/show`. |

A comment line (`: keep-alive`) every 15 s keeps the stream open. A page that cannot hold
the stream polls `GET /api/tree` instead.

### Look here: `POST /api/show` and `show.py`

The agent's one-way pointer while it explains. There is no channel back from the
viewer to the agent.

```bash
python3 relay-server/show.py "<folder>/<file>.md" [--part shop-containers] [--node n13] [--focus n8] [--page n13] [--mode org]
                             [--view NAME] [--env NAME] [--seq checkout] [--step 3] [--colour-by changes] [--port N] [--maps-dir DIR]
```

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

## Tests

`python3 relay-server/test_server.py`: every endpoint, the guards, events, the
capability flags, running without atlas or viewer, and the command line (start,
reuse, show, stop).
