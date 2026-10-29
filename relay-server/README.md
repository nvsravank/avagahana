# relay-server

The optional, read-only local server: the bridge from an agent to the viewer. Python
3.9+ standard library only. Serves the maps, the atlas (at `/`) and the map viewer (at
`/map-viewer/`), tells open pages when maps change, and lets the agent point the human
at a node. Contract: [`docs/relay-server-api.md`](../docs/relay-server-api.md).

```bash
python3 relay-server/serve_maps.py --maps-dir <folder>         # start, or reuse a running one
python3 relay-server/show.py "Topic/Map.md" --node n12          # look here
python3 relay-server/serve_maps.py --maps-dir <folder> --stop   # stop
python3 relay-server/test_server.py                             # tests
```

Rule: no JavaScript here; it only serves the other components' files, and works without
them.
