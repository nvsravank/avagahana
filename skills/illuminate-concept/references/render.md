# A picture for a document, slide or PDF

Full rules: `../../../docs/relay-server-api.md`, "A picture for a document".

The reader's open atlas page draws the picture: no headless browser. It draws it in a
hidden second viewer, so what the reader sees never moves. SVG or PNG only; a PDF is
yours to make from them.

```bash
python3 "<plugin root>/relay-server/render.py" "<Topic>/<Name>.md" --maps-dir "<maps folder>" --out "<file>.svg" [options]
```

It prints:

- `STATUS=rendered FILE=... [REPORT=...] [WARNING=...]`: the file is written.
- `STATUS=none URL=...`: no page is open. Open the URL (or give it to the user), then
  run it again.
- `STATUS=not_running`: start the server first (`serve_maps.py`, as for showing a map).
- `STATUS=failed ERROR=...`: a bad map path, node id or flag, or the page could not draw it.

## What is in the picture

The same flags as `show.py`, plus the picture's own:

- `--part <anchor>`, `--view <name>`, `--env <name>`, `--focus <id>`, `--mode <mode>`,
  `--colour-by changes` (a plan).
- `--expand N` levels below the top (`--expand all` everything); `--close a,b` boxes
  shown closed.
- `--highlight a,b` these nodes in colour, everything else grey: the part the text
  talks about.
- `--crop <id>` that box and what it connects to, instead of the whole diagram.
- `--seq <anchor> --step N` a sequence (or walk) at a step; `--seq <anchor> --steps all
  --out <folder>` one file per step (`step-01.svg`, ...), each with its step lit: a
  storyboard. `--steps 3-5` for some.
- `--before <file>` an earlier version of the map: the picture carries the ringed +, ~
  and − marks of what differs; `--perspective before` draws the earlier file instead
  (removed things marked), `after` (the default) the map (added things marked). With
  `--report` the report's `changes` lists what changed, in the view drawn and in each view
  and deployment: the findings of a review, as data. See `compare.md`.
- `--draft <file>` draws that file in the map's place, on the reader's page but out of
  sight: try a change on a temp file (outside the maps folder) before making it. The
  map path still names the map. For many tries, import `draft_report` from `render.py`
  instead (`boxes.md`, "Crossing arrows").
- `--theme <id>` (see `themes.md`), `--appearance light|dark`, `--look outline|poster`
  (a flowchart's look; default the map's `## Look:` line, else Outline).
- `--width <px>` or `--scale <x>`; `--background none` for a transparent background;
  `.png` (or `--format png` with `--steps`) for PNG. A PNG past the browser's limits
  (16,000 px a side) is scaled down.

The reader's "since you looked" marks and selection are never drawn; planned changes
and an earlier version's marks are.

## Check it: `--report`

A screenshot hides cut labels, overlaps and lines on top of each other. `--report`
writes `<file>.report.json` beside the picture:

- `cutLabels`, `overlaps`: fix the map (shorter labels, fewer boxes in a group, another
  view) and render again.
- `crossings.count`: weigh it against `lines`. Many crossings mean the picture needs
  splitting into views or a `--crop`; a few avoidable ones can often be untangled by
  the order of lines (`boxes.md`, "Crossing arrows").
- `touching`: lines closer than 2 px at the output size; a larger `--width` or a
  smaller picture (`--crop`, `--expand`) helps.
- `smallestText.px`: under about 9 px the text will not read in the document; give a
  larger `--width` or a smaller picture.
- `colours`: each box's fill and outline (`stroke`) and why (`category 3`, `class database`), to describe
  the picture in the text ("the databases in teal").

## For a document

- Choose a theme for the document: `themes.py list` gives each theme's name and
  description; pick the one the description says is for documents or the user's brand.
  None fits: the built-in `default`.
- Light appearance for print, unless the document is dark.
- SVG for documents and slides that take it (sharp, editable, every node has its label
  as a title and its id as `data-id`); PNG for anything else.
- Each picture gets a sentence in the text saying what it shows.

## Sending a map

- A person who should explore the map (open boxes, switch views, play a sequence) and
  has no atlas: a snapshot, one HTML file that opens from disk with no server.

  ```bash
  python3 "<plugin root>/relay-server/pack.py" "<Topic>/<Name>.md" --maps-dir "<maps folder>" --out "<file>.html" [options]
  ```

  It needs no open page. Options as above (`--part --view --env --focus --mode
  --colour-by --seq --step --theme --appearance`), plus `--since <older file>` to show
  every reader what changed since that version and `--before <older file>` for Before
  and After. It prints `STATUS=packed FILE=... SIZE=...` or `STATUS=failed ERROR=...`.
- A document or slide: SVG or PNG (above).
- Some email and chat services block HTML attachments: when unsure, send the SVG as
  well. A snapshot is a copy, not a signature: anyone can edit it.
