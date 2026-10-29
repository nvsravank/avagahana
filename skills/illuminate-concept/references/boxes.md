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
- `direction TB` / `direction LR` inside a subgraph overrides it for that box. Leave
  direction lines out unless the default looks wrong.

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
  `gcp <name>` (`- fn : aws lambda`, `- bucket : aws s3`, `- vm : azure vm`). They draw
  above the node's name, or at the top right of an open box (a VPC, a resource
  group). Names come from `map-viewer/vendor-icons.json` (the plugin root); the checker
  rejects an unknown one and suggests the nearest. Use them in deployment and
  infrastructure diagrams, on the nodes that are those products.

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
