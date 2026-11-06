# examples

- `maps/`: neutral sample maps (`garden.md` uses every format feature; `tools.md` is
  the target of its cross-map links; `shapes.md`
  puts every shape, pins and long labels
  in one realistic map; `c4-shop.md` a box diagram with views and deployments;
  `slow-checkout.md` trust marks on boxes and arrows; `cache-miss.md` two sequences
  played over one small view, many readers missing at once and one rebuild with a lock; `shop-plan.md` a plan's added,
  changed and removed boxes and arrows, open it with `?colourBy=changes`; `avagahana-architecture.md` Avagahana itself, reviewed from
  this repo: keep it in step when a work order changes the viewer, atlas, relay, skills or
  checks). Every map here passes
  `format/check_map.py`.
- `embed.html`: the map viewer in a plain page, the map inlined, no host callbacks.
- `maps/shop-layers.md`: a six-stop payment walkthrough with a focused payment
  perspective, authored container defaults, native sequence, retry scenario, ER join
  and included notes. Open Walks, then use Export walkthrough to read it offline.
- `maps/query-revenue-report.md`: the gallery's query example, a monthly report whose
  SQL opens in place: CTEs, a UNION ALL, NOT EXISTS, parameters, a window function and a
  second query with a PIVOT, over one shared schema.
- `two-viewers.html`: two viewers side by side. Left: built-in theme and every host
  callback (logged). Right: built-in theme hidden, a host theme passed as an object
  with its font as bytes (only one face, so the viewer reports what it borrowed).

Serve the repo root with any static file server, e.g.
`python3 -m http.server --directory <repo>`, then open `/examples/…`.
