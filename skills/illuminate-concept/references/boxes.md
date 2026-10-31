# Box diagrams (`flowchart`)

A system: boxes inside boxes (`subgraph … end`) and arrows between them. Modes: Boxes,
Layers, List. Subgraphs are the only "inside" a flowchart has; an arrow never means
"belongs to". Full rules: `../../../docs/map-format.md`, "Box diagrams", "Classes", "Several diagrams
in one file", "Deployments".

## Direction

- The first line sets the top level: `flowchart LR` reads left to right (pipelines, C4
  context and container pictures), `flowchart TB` top to bottom (layer diagrams).
- The inside of top-level boxes runs left to right whatever the first line says; each
  level further in turns 90 degrees. Children with no arrows between them line up
  across the way their box's arrows travel.
- `direction TB` / `direction LR` inside a subgraph overrides it for that box, and its
  children follow it whether or not they have arrows between them. Leave direction
  lines out unless the default looks wrong.

## Crossing arrows: the order of lines

The layout cuts crossings itself wherever it can see the arrows: children of one
subgraph with arrows among them are reordered by those arrows, whatever the file says.
In two places it cannot see, and there it keeps the order the lines are written in:

- **Arrows that leave a node's subgraph** (to anything outside the box it sits in) take
  their places on the node's side in the order their lines are written. Arrows coming
  in from outside do the same on the receiving node.
- **Children of one subgraph with no arrows among them** sit in the order they are
  first named.

So reordering those lines moves things without changing what the map says.

The order is read elsewhere too: colour by category gives each top-level thing its
colour by its place, and List mode (the keyboard outline, screen readers) reads in file
order. Reorder inside boxes and the arrows freely; move a top-level line only when the
person agrees that its colours and List order may change.

**When.** Only when the person says the arrows tangle, or the crossings look
avoidable. Read the report (`render.md`, "Check it"): weigh `crossings.count` against
`lines`. Crossings that are a large share of the arrows in a small picture are worth
a try. A few among many arrows are usually the best the picture allows, and some
pictures cannot be drawn without any: leave those. In `crossings.pairs`, a pair is
worth trying when its two arrows share an end or join the same two subgraphs.

**What to try:**

1. In each subgraph, name the children in the order of what they connect to in the
   subgraphs around them, each one in line with what most of its arrows reach.
2. Write a node's arrows that leave its subgraph in the order their far ends sit along
   the line (left to right, or top to bottom); write the arrows into one node in the
   order their starts sit.
3. When adding a node or an arrow later, put its line in its place, not at the end.

The two work together: a node's place sets where its arrows should sit. Moving a node
without re-sorting the arrows to its new place often looks like no gain, so a search
that changes only one of them at a time can stop short.

**How.** Try orders on a draft, not on the map: the reader's page redraws on every
save. Write a short Python script that imports the renderer and asks for the layout
report of each attempt's text, drawn in the map's place out of sight. No process starts
per try and nothing is written, so a try takes about a tenth of a second:

```python
import sys
sys.path.insert(0, "<plugin root>/relay-server")
from render import draft_report, RenderError

MAP, MAPS = "<Topic>/<Name>.md", "<maps folder>"
VIEWS = [None, "Events"]          # None: the default view; then each `## Relations: <name>`

def score(text):
    """(crossings, problems) for each mode and view of the first diagram."""
    out = {}
    for mode in ("boxes", "layers"):
        for view in VIEWS:
            r = draft_report(MAP, text, maps_dir=MAPS, mode=mode, view=view)
            out[mode, view] = (r["crossings"]["count"], len(r["overlaps"]) + len(r["cutLabels"]))
    return out
```

Score every mode and view, not only the one the person reads. The reader can switch
between Boxes and Layers, and a view lays out the first block's nodes in the first
block's order, so a reorder that helps the default view can tangle a view. `view=`
takes the name after `## Relations: `; `part=` a further diagram's heading anchor. Keep
an attempt only when nothing gets worse anywhere; when the modes want opposite orders
and neither can gain without the other losing, the picture is at its best: leave it.
There is no need to look at pictures.

Start from the order the rules above give (children in line with what they reach,
then every arrow sorted by where its ends now sit). If crossings remain, let the script
try changes from there and keep the best: move one node's line and re-sort the arrows
to match; swap two arrow lines. Stop when a round brings nothing; a few hundred tries
are a minute or so, and the start from the rules saves most of them. Then write the
winner into the map once, and check that only the order changed: the same lines,
sorted, as before.

(From a shell, `render.py ... --draft <file> --report --out <file>.svg` does the same
for one file: use a temp folder of your own, `mktemp -d`, never a fixed name another
agent may be using.)

## C4 levels and drilling in

- Put every level in one file, one subgraph level per C4 level: people and outside
  systems at the top, the system as a box, containers inside it, components inside
  those. The expand button's "one level" is then the context picture, "two levels" the
  containers, and drilling into a container (double-click) its components, with the
  real other ends of its arrows faded round it. Keep one system box at the top.
- Built-in classes: `person` and `external` draw as figures (a large icon, the label
  under it), `database` as a database: `class psp external`.

## Views: what each picture shows

- The arrows inside the block are the default view ("Relations"); it is not "all".
  Each `## Relations: <name>` section is another view, and shows only the boxes its
  arrows use (and the boxes round them), laid out again.
- Use views to keep pictures small and to hide whole layers: synchronous calls in the
  block, events only in `## Relations: Events` (the messaging boxes then appear only
  there). There is no "All" view, by design.
- View lines: `- from --> to : label`, with Mermaid's arrow operators.

## Arrows and labels

- Operators carry meaning: `-->` a call, `-.->` asynchronous or an event, `==>` the main
  path, `--o` / `--x` other ends, `<-->` both ways. Labels: `-->|label|` in the block,
  `: label` in a view line. Keep labels short; they take room in the gaps.
- A note on an arrow: give it an id (`orders e1@-->|charges| payments`, or on a view
  line `- retry e3@-.-> notify : resend`) and key a `## Details` entry by it. One id per
  arrow, never the same as a node's.
- Several arrows between one pair of drawn boxes merge into "N links" and show no
  notes, so note the arrows that stay single.
- Colour a line only where colour means something: `class e1 money`, or `:::money` at
  the end of a view line, and give the class a meaning in `## Classes`
  (`- money : - : Money moves`) so the key lists it under "Lines".

## Classes and looks

- A class names a meaning (person, database, queue, service), never a colour; the theme
  colours it. `## Classes` lines: `- name : icon : Label` (`-` for no icon). A class flows
  down into a box until a node names its own.
- `class a,b,c name` gives one class to several ids (commas, no spaces). One class per
  line; two classes for a node are two lines.
- `classDef` styles that are used: `stroke-dasharray` (`6 4` dashed, `2 3` dotted),
  `stroke-width`, `opacity`. `stroke-width: 0` removes a box (no border, no fill): use it
  for a group that only arranges, like a row of people on top. Colours, fonts, `style`
  and `linkStyle` are ignored.
- Shapes: `{"…"}` decision (keep its text short), `[("…")]` database, `[["…"]]` queue or
  subroutine, `(["…"])` stadium. Icons for flowchart nodes go in `## Node icons`
  (`- db : ph database`; any `ph <name>` from the Phosphor set), sparingly.
- Cloud infrastructure: the vendors' own icons, `aws <name>`, `azure <name>`,
  `gcp <name>` (`- fn : aws lambda`, `- bucket : aws s3`, `- vm : azure vm`). Names come
  from `map-viewer/vendor-icons.json` (the plugin root); the checker rejects an unknown
  one and suggests the nearest. Use them in deployment and infrastructure diagrams, on
  the nodes that are those products.
- **Main icon**: a node's first cloud icon is its main icon (drawn above the name, or as
  the node in Poster); a class's cloud icon counts too (`- ec2 : aws ec2 : Virtual
  machines`). Put the product first; further cloud icons become small tags. A node with
  no cloud icon may mark one Phosphor icon main: `- sched : main ph clock` (`main` only
  in `## Node icons` and `## Classes`, never before a cloud icon or a trust mark, one per
  node, and not on a node whose class brings a cloud icon). Leave it off where no icon
  stands for the node.
- For a box (a VPC, a subnet, an account), use the vendor's group icon where there is
  one: `aws virtual-private-cloud-vpc`, `aws private-subnet`, `aws public-subnet`,
  `aws region`, `aws account`, `aws auto-scaling-group`; not a service's icon.
- **Poster look**: `## Look: poster` (a section line after the block) opens a flowchart
  with each node drawn as its main icon and its name under it, details on hover. Use it
  for architecture maps that are mostly cloud icons and for pictures in decks and docs
  (`render.py --look poster` for one picture). Give nodes that matter a main icon first;
  without one a node is a plain box. Default (no line): Outline, boxes with borders.

## Layer diagrams

- `flowchart TB` with one top-level subgraph per layer (People, Channels, Edge,
  Services, Data, Outside). Layers mode makes every row as wide as the widest; layers
  with no arrows between them share a row.
- People across the top: `subgraph people [People]`, `classDef plain stroke-width: 0`,
  `class people plain`, and the people themselves `class … person`.
- Layers mode stacks only the top level: a single top-level system box draws as one
  band. For a layer picture, make the layers themselves the top-level subgraphs.
- Name a layer for its responsibility in this system (what the parts in it do for the
  layer above), in the reader's words, not after folders, packages or frameworks.
  Every node in a layer shares that responsibility; a node that fits two layers is two
  parts, or the layers are drawn wrong.
- Give each node a role through a class (`person`, `external`, `database`, or a
  meaning of your own in `## Classes`, such as `service`, `queue`, `job`): the key then
  reads as the cast of the picture. Keep the class list short and the same across the
  map's diagrams.
- Arrows should mostly run down the layers. Many arrows going back up, or skipping
  layers, mean the layers are not the real ones: regroup before drawing.

## Several diagrams in one file

- Further Mermaid blocks, each under its own heading (`## Orders service components`).
  Link a node into one with `click orders "#orders-service-components"` (the heading's
  GitHub anchor). One node may open several: one `click` line each. Every further
  diagram must be reachable from the first by such links.
- The sections after a block belong to that diagram; `## Classes` of the first diagram
  hold for all.
- A node that opens diagrams deserves a note saying what it is and why to look inside.
  In a note, `[title](#heading-anchor)` links to another diagram of the file.

## Deployments: `## Deployment: <env>`

- After the diagram, a flowchart block per environment
  (`## Deployment: Staging, Test` when they are the same).
- Name the diagram's services by bare id, no label (a label makes a new box); what is
  inside them comes along. Infrastructure is subgraphs or labelled nodes with new ids.
  Leave people and outside systems out: what is not named stays put.
- Draw arrows only between infrastructure (`rds -.->|copy| snap`).
- Read the warnings: an unknown id is a renamed node, and a node placed in one
  environment but not another is drift.
- A load balancer between the customer and the cluster makes arrows detour round it:
  leave it out, or put it inside the cluster box.

## Pitfalls

- Everything in the default view makes a dense picture: split it into views.
- Long labels and many labelled arrows in one gap widen the picture.
- A whole big map at fit shows names as bars too small to read: give the reader a
  named view, or point at a box with `--focus`.
- A node's page already draws its arrows, views and environments: a note is for what
  the pictures cannot say.
