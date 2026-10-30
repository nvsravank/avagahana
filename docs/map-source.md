# Map source

How `atlas/` gets maps. A source hides where maps live (a server, a local folder,
anything else), so atlas works with or without the server.

Changes to this file are contract changes: note them in `CHANGELOG.md`.

## Interface

```js
import { detectServer, serverSource, folderSource } from './atlas/sources.js';

const info = await detectServer(base);  // the server's /api/info beside the page, or null
const source = info ? serverSource(base, info) : folderSource(directoryHandle);

await source.identity()      // stable opaque identity for reader baselines
source.capabilities          // { shutdown: bool, openExternal: bool }
await source.list()          // -> tree
await source.read(path)      // -> map text
source.watch?.(fn)           // optional; fn(change) on every change; returns stop()
source.onShow?.(fn)          // optional; fn({path, node?, focus?, mode?, view?, env?}) on "look here"; returns stop()
await source.shutdown?.()    // present only when capabilities.shutdown
await source.openExternal?.(url) // present only when capabilities.openExternal
```

### `identity() -> string`

A stable opaque identity of the source, independent of relative map paths. Atlas
passes it as the viewer load context's `sourceId`. Folder sources remember an ID
per directory handle in IndexedDB, using `isSameEntry`; if storage is unavailable,
they isolate the visit with a fresh ID. Server sources use `/api/info.sourceId`,
falling back to the base URL for older servers.

### `list() -> tree`

```js
{
  state: '3f9a…',     // changes whenever any map is added, removed or changed
  maps: [
    { path: 'Topic/Map name.md', title: 'Map name', mtime: 1729850000.0, size: 1234 },
  ],
}
```

- `path` is relative to the source's root, with `/` separators. It is the only id a
  map has; atlas puts it in the URL and passes it to `read`.
- `title` is the map's first `# ` heading, else the file name without extension.
- Maps are files ending `.md` or `.mmd`. Files and folders whose name starts with `.`
  are left out.
- Folders are the `path` prefixes; atlas builds the folder tree from them.

### `read(path) -> text`

The raw text of one map. Rejects (throws) for a path that is not a map in the source.

### `watch(fn)` (optional)

Calls `fn({state})` when the tree's `state` changes, and `fn({state, path})` when one
map is known to have changed. Atlas re-lists and re-reads as needed. A source without
`watch` is polled by atlas.

### `onShow(fn)` (optional)

The agent's "look here" (`POST /api/show` on the relay server). Atlas opens that map
if it is another one (with a history entry), then points the viewer at the node.
Only a source with a channel from the agent has it.

### `onRender(fn)`, `claimRender(id)`, `answerRender(id, body)` (optional)

The agent's render (`POST /api/render` on the relay server, added in WO-32): `fn`
gets the request; the page claims it (`true`: it is this page's to answer), draws it
in a hidden second viewer and posts the file back (`atlas/render.js`). Only the relay's
source has them.

### `capabilities`

What the host may offer the viewer. Atlas passes the viewer a `shutdown` callback only
when `capabilities.shutdown` is true, and an `openExternal` callback only when
`capabilities.openExternal` is true.

## Sources

| Source | Where maps come from | Capabilities | Watch |
|---|---|---|---|
| `serverSource(baseUrl, info)` | The server's HTTP API (`relay-server-api.md`). `info` is its `/api/info`, from `detectServer(baseUrl)`. | From `info`: `shutdown` when it lists `shutdown`, `openExternal` when it lists `open`. | Server-Sent Events (`/api/events`), falling back to polling `/api/tree`; `onShow` from the `show` event. |
| `folderSource(handle)` | A folder the user picks (File System Access API, Chromium; `handle` is a `FileSystemDirectoryHandle`). Read-only. | none | Polls the folder every 2.5 s. |

`detectServer(baseUrl)` asks `baseUrl + 'api/info'`; anything but the server's JSON
(a 404, an HTML page, no answer) means no server, and atlas offers "Open folder".
The picked folder is remembered in IndexedDB; a browser asks the person again before
reading it in a new visit, which needs one click.

Other hosts may write their own source; anything that meets this interface works.

## Themes of the maps folder (`.themes/`)

A maps folder may hold its own themes in `.themes/` (hidden from the map list, as
every dot folder is; added in WO-32): `<id>.json` per theme (the viewer's theme object,
plus `name` and `description`; the font as files beside it, `{family, faces: [{weight,
style, file}]}` or `{family, file}`) and `settings.json` (`builtIn`: show the built-in
theme, default `true`; `default`: a theme id; `logo`: the atlas's logo, default `true`).
The atlas reads them from the relay (`GET /api/themes`, font files from
`/api/theme-file`) or from an opened folder (`atlas/themes.js`) and mounts the viewer
with them. One theme and `builtIn: false` hides the theme picker; `builtIn: false`
with no usable theme uses the built-in after all, with a warning (from the viewer and
`themes.py check`). Slots: `format/theme-slots.json`; tool: `relay-server/themes.py`.
