# relay-server

The optional, read-only local server: the bridge from an agent to the viewer. Python
3.9+ standard library only. Serves the maps, the atlas (at `/`) and the map viewer (at
`/map-viewer/`), tells open pages when maps change, lets the agent point the human
at a node, and lets the agent ask the open page for a picture of a map (SVG or PNG, for
a document). The maps folder's own themes live in its `.themes/`. Contract: [`docs/relay-server-api.md`](../docs/relay-server-api.md).

```bash
python3 relay-server/serve_maps.py --maps-dir <folder>         # start, or reuse a running one
python3 relay-server/show.py "Topic/Map.md" --node n12          # look here
python3 relay-server/render.py "Topic/Map.md" --out map.svg     # a picture, drawn by the open page
python3 relay-server/themes.py list                             # the folder's themes (check, derive)
python3 relay-server/pack.py "Topic/Map.md" --out map.html      # a snapshot: one file to send, no server
python3 relay-server/serve_maps.py --maps-dir <folder> --stop   # stop
python3 relay-server/test_server.py                             # tests
```

`pack.py` needs no running server: it writes one HTML file that opens from disk with no
network (the map as data, the viewer's modules, only the icons the map uses, the theme
and its font, a strict security policy). Options as `render.py` (`--part --view --env
--focus --node --page --mode --colour-by --seq --step --theme --appearance`), plus
`--since FILE [--since-label TEXT]` (every reader sees what changed since it) and
`--before FILE` (Before and After). Prints `STATUS=packed FILE=... SIZE=...` or
`STATUS=failed ERROR=...`.

Rule: no JavaScript here; it only serves the other components' files, and works without
them. A snapshot's start-up script is the viewer's (`map-viewer/snapshot.js`).
