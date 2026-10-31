#!/usr/bin/env python3
"""show.py — point the human at a node while explaining: the agent's "look here".

  python3 relay-server/show.py "<folder>/<file>.md" [--part shop-containers] [--node n13] [--focus n8] [--page n13]
                               [--mode MODE] [--view NAME] [--env NAME]
                               [--seq checkout] [--step 3] [--colour-by changes] [--theme ID]
                               [--before FILE | --before none] [--port N] [--maps-dir DIR]

--theme previews a theme by id (relay-server/themes.py list): the reader's page switches to it.
--before sends an earlier version of the map (any file, e.g. from git show): the page offers
Before and After and lists what changed in each view. The server keeps it in memory for that
map until --before none or a restart.

Finds the relay server serving the maps folder and sends POST /api/show. Prints one line:
  STATUS=shown URL=...        an open page was told; nothing else to do
  STATUS=none URL=...         no page is open: open the URL (it carries ?node=)
  STATUS=not_running          no relay server for this folder: start serve_maps.py
  STATUS=failed ERROR=...     e.g. no maps folder, no such map, or a bad node id
"""
import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from serve_maps import COLOUR_BY, DEFAULT_PORT, MAP_DIR_ENV, find_running, map_url, resolve_maps_dir, status_line  # noqa: E402


def main(argv=None) -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("map", help="map path relative to the maps folder, with forward slashes")
    ap.add_argument("--part", help="which of the file's diagrams: its heading's anchor")
    ap.add_argument("--node", help="the node to point at")
    ap.add_argument("--focus", help="drill into this node first")
    ap.add_argument("--page", help="open this node's page (its note, arrows and linked diagrams)")
    ap.add_argument("--mode", help="diagram mode identifier (for example tables or boxes)")
    ap.add_argument("--view")
    ap.add_argument("--env")
    ap.add_argument("--seq", help="play this sequence over its view: its heading's anchor (main: the first diagram)")
    ap.add_argument("--step", type=int, help="the sequence's step, from 1")
    ap.add_argument("--colour-by", choices=list(COLOUR_BY), help="open in this colouring: changes shows a plan's added, changed and removed")
    ap.add_argument("--theme", help="switch the page to this theme (themes.py list)")
    ap.add_argument("--before", help="an earlier version of the map, from any file (for example git show v1.4:<map> > /tmp/old.md): "
                    "the page switches between Before and After and lists what changed; none forgets it")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--maps-dir", default=None, help=f"the maps folder (default: ${MAP_DIR_ENV})")
    args = ap.parse_args(argv)
    maps_dir, problem = resolve_maps_dir(args.maps_dir)
    if problem:
        print(status_line("failed", error=problem))
        return 1

    port = find_running(maps_dir, args.port)
    if port is None:
        print(status_line("not_running", error="start it with serve_maps.py"))
        return 1
    body = {k: v for k, v in {"path": args.map, "part": args.part, "node": args.node, "focus": args.focus, "page": args.page,
                              "mode": args.mode, "view": args.view, "env": args.env, "seq": args.seq,
                              "step": args.step if args.seq else None, "colourBy": args.colour_by, "theme": args.theme}.items() if v}
    if args.before is not None:
        if args.before == "none":
            body["before"] = None
        else:
            try:
                body["before"] = Path(args.before).expanduser().read_text(encoding="utf-8")
            except OSError as exc:
                print(status_line("failed", error=f"cannot read --before {args.before}: {exc.strerror or exc}"))
                return 1
    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/show", method="POST",
                                 data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=3) as res:
            delivered = json.loads(res.read().decode("utf-8")).get("delivered", 0)
    except urllib.error.HTTPError as exc:
        try:
            message = json.loads(exc.read().decode("utf-8")).get("error", str(exc))
        except ValueError:
            message = str(exc)
        print(status_line("failed", error=message))
        return 1
    except Exception as exc:  # noqa: BLE001
        print(status_line("failed", error=exc))
        return 1
    url = map_url(port, args.map, mode=args.mode, part=args.part, focus=args.focus, node=args.node, page=args.page, view=args.view, env=args.env,
                  seq=args.seq, step=args.step if args.seq else None, colourBy=args.colour_by, theme=args.theme)
    print(status_line("shown" if delivered else "none", url=url))
    return 0


if __name__ == "__main__":
    sys.exit(main())
