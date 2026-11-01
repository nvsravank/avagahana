# Map viewer API

The map viewer is a library: give it map text and an element, get an interactive,
read-only view. It needs no server and knows nothing about where maps come from.
Everything outside the drawing (files, URLs, opening links, shutting down) belongs
to the host page, which offers it through callbacks. Themes are data the host hands
over; the viewer fetches nothing for them.

Changes to this file are contract changes: note them in `CHANGELOG.md`.

## Entry

```js
import { mount, applyTheme, checkTheme } from './map-viewer/index.js';

const viewer = mount(element, {
  text,                 // map text (optional; or call viewer.load later)
  path,                 // the map's path, for cross-map targets and live reload
  host: { … },          // optional callbacks, below
  state: { … },         // optional starting state, below
  theme: 'default',     // id of the starting theme (an unknown id: another, with a problem)
  themes: [ … ],        // theme objects from the host, below
  defaultTheme: true,   // false hides the built-in theme (unless no other can be used)
  prefs: { … },         // starting looks from a link: {theme, appearance, colourBy, look}; not saved
                        // (look: for each diagram that offers it, WO-38)
  storageKey: 'avagahana-viewer-prefs',   // where preferences are kept, and (as `<key>-seen`) what
                                       // the reader has seen of each map; null keeps none
  since: null,          // an older map text: mark what changed since it (below); nothing kept
  sinceLabel: 'the earlier version',   // with since: "Since <label>" in the sparkles panel
  before: null,         // the map's earlier version as text: Before and After (below); never fetched
  marks: true,          // false: no change marks and no sparkles button
  showProblems: 'map',  // 'map' | 'all' | 'none': which problems show on screen
  sequenceStepSeconds: 3,   // a sequence's step while playing: 2 to 5 s, by halves
  title: true,          // false: no map title in the toolbar (a host that names the map itself)
  viewPicker: true,     // false: no view picker (a host that lists the views itself);
                        // 'wide': not while the toolbar is narrow
  assets: null,         // (path) => Promise<text>: the viewer's own files from the host (below)
  crossMapNote: null,   // without host.openMap: said beside a link to another map
  asOf: null,           // when the first map was saved (Date, ISO text or ms): the export's footer
  version: null,        // the code's version, for the export's generator tag only
});
```

`map-viewer/index.js` is the only public entry. Other files under `map-viewer/` are
internal and may change without notice.

The viewer adds one element, `<div class="mmv">`, inside `element` and fills it; give
`element` a size. `mount` throws only for a programming mistake (no element).

## The viewer object

| Member | What it does |
|---|---|
| `viewer.load(text, path, context?)` | Show a map; returns a promise. The same `path` again is a live reload: the viewer keeps the user's place (focus, selection, open branches). `context.before`: the map's earlier version (text, or `null` for none); without it a reload of the same map keeps the earlier version and another map has none (added in WO-34). `context.asOf`: when that map was saved, as the `asOf` option, kept the same way (added in WO-35). |
| `viewer.setBefore(text)` | Set the shown map's earlier version (text), or clear it (`null`), and draw again; a promise (added in WO-34). |
| `viewer.setState(partial)` | Change state from outside, e.g. to point at a node. With `seq: null` the sequence stops first and the other fields still apply (`{seq: null, view: 'Events'}` stops and switches view). With a sequence to play, the sequence chooses its diagram and view, so only `seq` and `step` are read. |
| `viewer.state` | The current state (a copy). |
| `viewer.on(type, fn)` | Subscribe to an event; returns an unsubscribe function. |
| `viewer.ready` | Resolves when themes, stylesheet and font are ready. |
| `viewer.title` | The current map's title, or `null`. |
| `viewer.views` | The names of the map's relation views, the default first (`[]` when it has none). The default's name is `Relations`; readers see it as "Overview", and `setState({view})` takes either. |
| `viewer.contents()` | Everything a reader can open in the map, in file order (below). A new array each call. |
| `viewer.export(opts)` | The picture as a file instead of a download: a promise of `{format, type, data, width, height, scaledDown, report}`. Below (added in WO-32). The toolbar's SVG and PNG buttons use it. |
| `viewer.snapshot()` | The whole map as one HTML file that opens offline: a promise of its text, as the Export menu's "Interactive HTML" makes it. Below (added in WO-35). |
| `viewer.problems` | The current problems, below. |
| `viewer.themes` | `[{id, label}]` of the registered themes. |
| `viewer.addTheme(theme)` | Register a theme object; returns `{ok, problems}`. |
| `viewer.setTheme(id)` | Switch to a registered theme. The reader keeps their place: the diagram, view, step and camera (pan and zoom) stay as they were. |
| `viewer.setPrefs({appearance, colourBy, look})` | Change looks from outside (a link, the agent's show), not kept; a colour-by or look the shown diagram does not offer is ignored (a look applies to the shown diagram's type, WO-38). E.g. `{colourBy: 'changes'}` for a plan (added in WO-13). |
| `viewer.slot` | An empty element at the start of the toolbar for the host's own button. While empty, it shows the map title (unless `title: false`). |
| `viewer.destroy()` | Remove everything the viewer added to the element and the document: listeners, observers, styles no other viewer uses. |

## Host callbacks (`options.host`)

All optional. **A missing callback hides its feature.** A callback may return a
promise; a failure is reported as a `host` problem and the viewer carries on.

| Callback | Used for | When missing |
|---|---|---|
| `openExternal(url)` | Every `http`, `https` or `mailto` link in a note. The host decides whether the URL is one of its own maps (atlas then opens it in place). | The link is a plain new-tab link. |
| `openMap(path, {focus, node})` | Following a relation to another map (`<folder>/<file>.md#<id>`). | Cross-map relations are listed, not clickable. |
| `readMap(path) -> Promise<text>` | Naming another map's node in the popover, and finding targets that are not there. | The popover shows the target's path. |
| `shutdown()` | The power button. What to show afterwards is the host's business. | No power button. |

## State

```js
{ mode, part, focus, node, page, view, env, rels, seq, step }
```

| Field | Meaning |
|---|---|
| `mode` | The diagram type's modes: a mind map `mindmap`, `org` or `list`; a box diagram (`flowchart`) `boxes`, `layers` or `list`; a sequence `lifelines` or `list`. A mode the type does not have is ignored. |
| `part` | Which of the file's diagrams is shown: the anchor of its heading (`shop-system-containers`), or `null` for the first. Setting it opens that diagram by the way its links lead to it, so the crumbs lead back. |
| `focus` | Node id the view is drilled into, or `null` for the whole map. |
| `node` | Node id that is selected / pointed at, or `null`. |
| `page` | Node id whose page is open (its note, arrows and linked diagrams over the drawing), or `null`. |
| `view` | Name of the relation view shown; `null` for the default view (and while a deployment is shown). Setting it shows that view (relations on); in a box diagram it lays the diagram out again for the view, animated. A deployment's name is accepted too. |
| `env` | Environment of the deployment shown (`## Deployment: <env>`, map format), or `null`. Setting it shows that deployment (the diagram's arrows over its placement, animated); `null` returns to the default view. Both are views of one picker, so at most one of `view` and `env` is set. |
| `rels` | Whether all relations are drawn (`true` / `false`). |
| `seq` | The sequence being played: the anchor of its heading, `main` when it is the file's first diagram, or `null`. Setting it plays that sequence, paused, over the view it is linked to (`## Plays over`; the view is shown), or as the sequence itself when `mode` is `lifelines` (or `list` with `part` the sequence) or it is linked to no view. `null` stops it. |
| `step` | The step shown while a sequence plays, from 1, or `null`. Setting it alone moves the playing sequence to that step. |

**The picture** (added in WO-32, for an export; `setState` and `options.state` take
them, `state` does not report them; another diagram clears `highlight` and `crop`):

| Field | Meaning |
|---|---|
| `expand` | A whole number of levels shown below the top of the view (`0`: the top only; boxes deeper are closed), or `'all'`. A box diagram's top is not drawn, so there `0` is the same as `1`: the top-level boxes, closed (WO-39 follow-up; `0` drew nothing). |
| `close` | Node ids (an array, or a comma-separated string) of boxes shown closed, after `expand`. |
| `highlight` | Node ids kept in their colours, with what is inside them and the boxes round them; every other box, line and label takes the player's idle colours (`roles.idle`, `idleLine`, `muted`). `null` or `[]` ends it. Not while a sequence plays. |
| `crop` | A node id: an export shows that box and what it is connected to (its arrows' other ends; in a mind map its parent and children) instead of the whole diagram. `null` ends it. The screen is not cropped. |

- `options.state` sets the starting state on the first map; unknown or invalid values
  are ignored.
- `viewer.on('state', fn)` reports every change, with the full state.
- **The viewer never reads or writes `location` or `document.title`.** The host maps
  state to and from its URL (atlas uses `#/<path>?mode=…&part=…&focus=…&page=…&view=…&env=…&seq=…&step=…`).

`load` accepts optional context `{sourceId, signal}`. A stable `sourceId` separates
reader baselines for equal relative paths in different sources. Changing it starts
fresh navigation. Without it, paths keep their existing meaning. Only the latest
load may commit; aborting its `signal` before commit leaves the current map intact.

## Playing a sequence

A sequence (map format: a `sequenceDiagram` block) linked to a box diagram's view
(`## Plays over`) gets a play button beside the view picker while that view is shown;
a sequence shown as itself has one too. Playing:

- A step bar (bottom centre): a timeline with a tick per step (numbered as the arrows)
  and a bracket per block (loop, alt, opt, parallel for `par`, critical, break), then step back, play /
  pause, step forward, stop (closes the sequence), the count, and a switch between the
  view and the sequence's own lifelines (same step). A speed control (right is faster)
  sets how long each step shows: 5 to 2 seconds, in half seconds. It starts at the
  reader's last choice (kept with the preferences), else `options.sequenceStepSeconds`,
  else 3.
- Over the view: every box and arrow goes to the theme's idle colours; a step brings its
  boxes back, draws its messages over the view's arrows in the call or reply colour
  with a dot running from sender to receiver; steps played stay at 60%. The view's own
  arrow labels (and their icons and note marks) give way: while it plays, the view is
  laid out again with room for two label lines on each arrow the sequence uses (the
  boxes glide apart, and back when it stops). Each such arrow carries a card: the
  latest call along it, numbered (`3 check token`), and under it the latest return
  (`3↩ ok`, the reply that answers call 3, running back along the call's arrow), each
  shown once the play reaches it. A message to itself is a numbered circular arrow on
  its box. A loop ends in a "repeat"
  step. Closed boxes a step needs open and stay open.
- The camera frames each step's boxes. A pan or zoom by the reader pauses the play;
  play or a step moves on and the camera follows again. Reduced motion: no dot, no glide.
- A side panel (under the drawing on narrow screens) says what the step does: its
  blocks, each message (who calls or replies to whom, its details from `## Details`,
  the note and icons of the arrow it runs on) and its notes.
- Changing the view, or going to a diagram that is neither the sequence nor its view,
  stops it. A node's page lists the sequences it takes part in ("In sequences"), with
  their steps; a click plays from the first.
- List mode of a sequence: its numbered steps under their blocks; a click plays from there.

## Changes since you looked

The viewer remembers, per map path and per reader, what the reader has seen (in the
browser, under `<storageKey>-seen`, the 50 maps opened last), and marks what differs
when a map is rewritten (a live reload) or opened again. The agent writes nothing for
this and learns nothing back. (WO-13, WO-31, WO-36.)

- **Sparkles are hidden until the reader shows them** (WO-36). While a map has changes
  since you looked, a sparkle button sits at the bottom left beside the info button
  (no count); it is the only sign. Its panel has **Show sparkles** (kept with the
  reader's preferences, `sparkles`; for the visit when `storageKey` is null), what
  changed in this view and in the whole map, this view's removals one per line (each
  with the node it was under), **Clear this view** and **Clear whole map**. The button
  is lit while sparkles show and goes when nothing is left.
- Hidden, nothing is marked anywhere: no badges, no small sparkles on diagram icons or
  the expand button, `contents()` `changed` false, no "since you looked" lines on a
  page. A load still glows what it brought and shrinks out what it took away. Hidden,
  reading clears nothing: only the Clear buttons do. Every host starts hidden, `since`
  and snapshots included; there is no option to start shown.
- The first look at a map marks nothing.
- One mark: a sparkle badge at a box's top-left (an arrow's: before its label, else at
  its middle) for anything new or changed (label, place, class, icons, note, links, a
  deployment's place). What a load brought glows once; what it took away shrinks out in
  red. Live reloads glide.
- Only the topmost new thing is marked: inside a new node nothing is (its children, its
  arrows, its places are new with it). Changed things keep their own marks. An ER
  table's column is a thing of its own (WO-22 follow-up): new or changed in a table that
  is not, its sparkle is in its row between its name and its type (a closed table's: after
  `+ N columns`); a
  new table's columns are new with it. A removed column is listed in the panel under its
  table, which reads changed. A changed column connection marks its line. A reader's
  baseline from before columns were kept takes them as seen. Renames are not read here.
- A removed node or arrow marks the node it was under (an arrow: its start); that
  node's page lists "Removed since you looked"; the sparkles panel lists those in the
  view shown.
- Only what is drawn is marked: a closed box or collapsed branch with a change inside
  has no mark; the expand button has a small sparkle while one hides a change.
- A diagram with anything new or changed in it (closed boxes too) has a small sparkle on
  its icon: on the link icon of a node that opens it and that node's page thumbnail, and
  in `contents()` (`changed`). A whole new diagram has no marks inside; it is marked on
  its icon only, and opening it clears it in one go.
- A mark stays until the reader opens the thing while sparkles show: selects the node
  or opens its page (its removals and its deployment places too; a new node: everything
  inside it), opens the arrow's note, plays the sequence, opens a whole new diagram.
  Clear this view clears what the view shows (removals at the top of a diagram too);
  Clear whole map clears every mark in the file. Marks build up over several rewrites until then; a
  change undone before the reader looks leaves none. A diagram's small sparkle goes when
  the last mark in it clears.
- `since: <older map text>` compares with that text instead of what the reader saw: the
  marks are the same for every reader, nothing is kept (clearing lasts for the visit),
  and the wording reads "since <sinceLabel>" ("Since the earlier version" by default).
  Hidden by default like the reader's own.
- `marks: false` shows no marks and no sparkles button (`changed` is always false).
- `storageKey: null` keeps nothing: marks then last for the visit only. A map with more
  than 2,000 things to compare is compared for the visit only (a host problem says so).
  Thumbnails never mark.
- Marks are per reader: SVG/PNG export and print leave them out.

## Before and After: an earlier version (added in WO-34)

Given the map's earlier version (`before`, `load`'s `context.before` or `setBefore`), the
viewer compares the two by id, in each diagram, view and deployment:

- A toggle in the top row, next to the view picker (the first thing in the row when
  narrow), switches between **Before** (the earlier file) and **After** (the map). The
  diagram, view, deployment and selection stay; what stayed glides to its new place, what
  goes fades out, what comes fades in (reduced motion: no glide).
- Both are marked with the planned-change signs (map format, Planned changes): After
  shows added and changed, Before removed and changed; a move (a new parent, or a new place
  in a deployment) reads as changed. The legend says "Since the earlier version". No
  "since you looked" sparkle while comparing.
- A changes button beside the info button lists what changed in the diagram and view
  shown, grouped Removed, Added, Moved, Changed, each line saying what (`Moved: Orders
  service: EKS on Fargate → Orders hosts, EC2 (Production)`, `Changed: Payments service:
  note`). Read only. A view or diagram only one file has is named as a whole. The node
  page says the same for its node.
- Changed means a different label, icon, class (not a planned-change class), note or
  parent for a node; label, note, class, line kind, icons or an end for an arrow. A new
  id is a removal and an addition: keep ids stable across versions.
- An ER table's columns (WO-22 follow-up) are matched by name, a declared rename
  (`## Renames`) followed; a column is changed when its type, keys, comment or grain
  differ. Each changed row has the ringed sign after its type (its tooltip says what);
  the table is changed ("columns"); a closed table's `+ N columns` row carries the sign
  of the columns it hides (one kind, else changed). A column connection is changed when
  its set of column pairs differs (pair order apart), with the sign on its line; a
  relationship's ends read in ER words (`cardinality at Order: zero or more → one or
  more`, `identifying → not identifying`). Lines: `Order.amount: type int → decimal`,
  `Order.customer_id: renamed from cust_id, now grain`, `Arrow Order → Customer: placed
  by: columns cust_id = id → customer_id = id`. The node page lists each column and its
  sign; List mode names the table's changed columns. A stale rename is a warning
  (`map-rename-stale`) and reads as a removal and an addition.
- A map with planned-change classes of its own shows those only.
- `state` carries `perspective` (`'before'` or `'after'`) while comparing, and
  `setState({perspective})` and `options.state.perspective` switch it.

## Events

| Event | Payload |
|---|---|
| `state` | The full state, after any change. |
| `load` | `{path, title, warnings}` after a map is shown. |
| `contents` | `viewer.contents()`, after a load or live reload that changes it, and when change marks clear (`changed`). |
| `theme` | `{id, appearance}` (`light` / `dark`) when the theme or the appearance shown changes, so a host can style its own frame to match (`applyTheme(el, id, {appearance})`). |
| `warning` | A problem of level `warning`, when it first appears. |
| `error` | A problem of level `error`, when it first appears. |

## Contents

`viewer.contents()` lists what the loaded map holds, for a host's own contents row (the
atlas bar, the website gallery), built from the viewer's model, never from headings.
Each viewer has its own list. Entries, in file order:

| `kind` | One per | `state` (what `setState` takes to open it) |
|---|---|---|
| `diagram` | box, mind map, state or ER diagram | `{seq: null, part, view: null}` |
| `sequence` | sequence diagram | `{seq: part or 'main', step: 1}` (plays from step 1) |
| `view` | relation view of a diagram with more than one, the default first (label "Overview") | `{seq: null, part, view: name or null}` |
| `join` | ER join view (`## Joins: <name>`) | as `view` |
| `deployment` | environment | `{seq: null, part, env}` |
| `walk` | walk of a state or ER diagram | `{seq: anchor, step: 1}` |

Every entry has `kind`, `label`, `part` (the diagram's anchor, `null` for the first) and
`type` (the diagram's type); views, deployments and walks also `diagram` (its title).
A sequence or walk has `steps`, its number of steps (added in WO-32).
The first diagram has `first: true`; a diagram no link reaches ("Not linked") has
`unlinked: true`, and its `state` still opens it. Every entry has `changed`: something
in it is new or changed since the reader looked (a diagram, sequence or walk: anything in
it; a view or deployment: its own arrows or places). A host draws it with
`changeMarkSvg(size)` from `map-viewer/index.js` (an `<svg>` string, `currentColor`).
Entries may gain fields later; a host ignores those it does not know. The `contents`
event fires when the list changes, `changed` included.

## Export

`viewer.export(opts)` makes the picture shown as a file, with every label in full, and
returns it instead of downloading it. The reader's view (camera, selection) does not
move. Options:

| Option | Meaning |
|---|---|
| `format` | `'svg'` (default) or `'png'`. |
| `width` / `scale` | The output width in pixels, or a scale (default 1 for SVG, 2 for PNG). SVG keeps its drawing units (`viewBox`) and gets `width` / `height`. |
| `background` | `'theme'` (default: the theme's background) or `'none'` (transparent). |
| `crop` | A node id; defaults to the state's `crop`. |
| `report` | `true`: the layout report too (below). |

Result: `{format, type, data, width, height, scaledDown, report}`; `data` is the SVG
text or a PNG `Blob`. A PNG is scaled down to the browser's canvas limits (16,000 px a
side, 120 million pixels); `scaledDown` says so. In list mode the list is drawn (no
report, no crop).

**The file:** colours and the font resolved to their values (the font embedded), arrow
ends drawn as shapes, so editors read it. It names itself (`role="img"`, a root
`<title>` with the map's title and the diagram's), and every node, box and line has
`data-id` (the map's id; a tree's line `parent>child`, a lifeline `<id>~life`) and a
`<title>` (its label; an arrow `From → To: label`). The same titles are in the drawing
on screen. Nothing in it leads anywhere: no links, scripts or event attributes, and
references only to its own `#ids` or to `data:` images and fonts. Change marks,
selection, search hits and the controls are left out (a host rendering for a document
mounts with `marks: false` and selects nothing).

**The layout report** (`report`), read from what was drawn:

| Field | What it holds |
|---|---|
| `width`, `height`, `outputWidth` | The drawing's size and the output's width (px). |
| `nodes`, `lines` | How many boxes and lines were checked. |
| `cutLabels` | `[{id, label, over}]`: a label running out of its box, by how much. |
| `overlaps` | `[{a, b, area}]`: two boxes over each other, neither inside the other. |
| `crossings` | `{count, pairs: [{a, b, count, at}]}`: lines crossing, away from their ends. |
| `touching` | `[{a, b, gap, at}]`: two lines closer than `minGap` px at the output's scale. Lines that share an end meet there by design: the first 24 drawing units from that end do not count, and two lines running together into one end (two keys to one column) are one line until they part. |
| `minGap` | 2 (px). |
| `smallestText` | `{px, id}`: the smallest text at the output width. |
| `changes` | Only with an earlier version (WO-34): `{perspective, diagram, view, whole, groups, views, diagramsAdded, diagramsRemoved}`. `groups`: `[{state, lines}]` in the order removed, added, moved, changed, as the changes list says them, for the view drawn; `views`: `[{view, deployment, whole, groups}]` for each view and deployment of that diagram; `whole`: `added` or `removed` for a view or diagram only one file has. |
| `colours` | Per box `{id, label, fill, stroke, why}`: its fill and its outline as `#rrggbb` (a class or theme may colour either, so read both) and why, from the colour-by: `category 3`, `level 2`, `class database`, `change added`, `centre`. |

## Problems

```js
{ level: 'error' | 'warning', source: 'map' | 'theme' | 'host', code, message, where }
```

**On screen is what the person looking at the map can act on; console only is setup
trouble only the host's builder can fix.** Every problem is also an event and is
logged once to the console as `[avagahana] …` (again only after it has gone and come
back, so live reload never floods it).

| Problem | On screen (`showProblems: 'map'`) |
|---|---|
| Map cannot be read (`map-no-diagram`, `map-diagram-type`, `map-diagram-empty`) | Error bar; the previous map stays. |
| Map warnings: unknown icon, emoji in a label, a note or relation pointing at a missing node, a bad `## Icons` line, a misplaced `:::left/right`, a shortened label (`map-long-label`), a large map (`map-large-map`: over 5,000 nodes, drawn in full, "drawing may be slow") | Warning button and panel. |
| Cross-map link to a missing map or node (`map-cross-map-missing`, needs `readMap`) | "(not found)" in the popover, and the panel. |

A map problem's code is `map-` and a code from `format/problems.json`, the list the
viewer and the map checker (`format/check_map.py`) share; the list says what each means.
| Theme rejected, theme flaws (contrast, filled-in colours, borrowed font weights), font bytes rejected | No (`showProblems: 'all'` shows them). |
| Host callback failed, browser storage unavailable | No (`'all'` shows them). |

`showProblems: 'none'` shows nothing on screen; events and console still get everything.
The skill has the agent check a map before showing it, so map problems are a fallback.

## Themes

**A theme supplies colours; the diagram decides what they mean.** A theme has a
fixed shape that never grows with new diagram types:

- a **category** palette: colours told apart (repeats only after the last);
- a **level** ramp: colours by depth, centre first;
- **roles**: colours with a fixed meaning (good, warn, bad, info, highlight, and link: a
  link drawn over the diagram, such as a mind map's related links), and four optional
  ones for a playing sequence: `idle` (a box not reached yet), `idleLine` (its outline,
  and arrows not reached yet), `call` and `reply` (the messages). A theme that leaves
  them out gets them quietly: `idle` and `idleLine` mixed from `ink` into `bg`, `call`
  the `accent`, `reply` the orange icon swatch; and three optional ones for a plan's
  ringed signs, `planAdded`, `planChanged`, `planRemoved` (CSS `--mmv-plan-added`,
  `--mmv-plan-changed`, `--mmv-plan-removed`), which default to `good`, `warn` and `bad`
  (added in WO-34);
- the surface, chrome, icon swatches and font.

Lines between shapes have no colour of their own: a mind map's lines take the colour of
the node they lead to.

Each **diagram type** declares its "Colour by" choices and the palette each uses. A
mind map offers Branch (`category`) and Level (`level`); any diagram with planned changes
(`added` / `changed` / `removed`, map format) also offers Changes (`changes`: the roles
good, warn and bad, the rest muted), never where a map starts by itself and never kept; a later C4 view might offer
Kind, Owner and Depth. The theme never hears about them. (Like Vega-Lite's split of
colour encoding from colour scheme; unlike Mermaid's per-diagram theme variables.)

A theme is a plain object. Colours are values; the font is bytes. The viewer turns it
into CSS variables in one `<style>` per theme (shared by all viewers in the page) and
loads the font with the `FontFace` API.

```js
{
  id: 'work', label: 'Work',
  font: { family: 'Brand Sans',
          faces: [{ weight: 400, style: 'normal', data }, …] },   // optional
  appearances: {
    light: {
      bg, ink,                                   // required
      category: [fill | {fill, ink}, …],          // required
      level: [fill | {fill, ink}, …],             // centre first, then each level down
      muted, accent, center, centerInk, tint,
      roles: { good, warn, bad, info, highlight, link, idle?, idleLine?, call?, reply?, planAdded?, planChanged?, planRemoved? },
      chrome: { bg, border, hover, active, activeInk, shadow },
      frame: { bg, ink, muted, accent, chip, chipEdge, chipInk, chipActive, chipActiveInk },
      icons: { red, orange, yellow, green, blue, purple, grey },
    },
    dark: { … },
  },
  css: '',   // optional extra rules, using the class names below
}
```

- **Required:** `id`; at least one appearance with `bg`, `ink` and a `category`
  palette. Everything else is filled in from those (a warning lists what was filled;
  a missing `level` ramp fades the centre colour towards the background).
- A fill's text colour (`ink`) defaults to whichever of the appearance's `bg` / `ink`
  contrasts more with it.
- **Checks** (warnings): palette colours at least 3:1 on the background; text on a
  fill at least 3:1; body text at least 4.5:1.
- **`frame`** (optional): the colours of a host's bar round the viewer (the atlas
  contents bar), as `--mmv-frame-*` variables (`--mmv-frame-chip-edge`, …). Left out,
  it is filled in quietly from `bg`, `ink`, `muted`, `accent` and `chrome`. Warnings:
  text and chip text under 4.5:1, chip edges under 3:1 on the bar.
- **Font `data`**: an `ArrayBuffer`, a typed array, a base64 string, or a function
  returning a promise of one of those (for loading on demand).
- **Incomplete fonts:** a missing weight borrows the nearest face of the same style
  (warning); no italic face means the browser slants the regular one (warning); bytes
  the browser rejects drop that face (error); missing characters come from the
  fallback font. The fallback is the system font, with the built-in theme's font in
  front only when that theme is already loaded.
- Choosing a theme waits up to about 2 s for its font before measuring text; a later
  font measures and lays out once more.
- **Appearance and colour-by switches restyle without a repaint**, as do looks other
  than Poster. A theme with another font re-measures and lays out; so does going in or
  out of Poster (node sizes change), the camera kept.
- The theme panel: Theme (only with more than one registered), Appearance (the theme's
  own, plus Auto when it has both), Colour by (from the diagram type), Look. Choices are
  saved under `storageKey`.
- **Looks are per diagram type** (WO-38), each saved on its own (`looks: {type: look}`
  in the stored preferences; a single `look` saved before is taken as the mind map's
  and ER's). Changing one never changes another. Mind map: Fade / Outline. Flowchart:
  Outline (`outline`) / Poster (`poster`). ER: Flat (`outline`) / Zebra (`fade`). State
  diagrams and sequences have one look and no Look row.
- The look a diagram opens in: one set from outside (`setPrefs`) or by the reader for
  this file, a link's (`prefs.look`, when the diagram offers it), the map's
  `## Look:` line, the reader's saved choice, the type's default (flowchart Outline).
- **Poster** (flowcharts): each node is its main icon (a cloud icon in its own colours,
  else the Phosphor icon the map marks `main`, on a tile of the node's colour) with its
  name under it; a node with no main icon is a light box with its name. Tags, trust
  marks, warnings, the note icon, quick links, related links and arrows' icons and note
  marks leave the drawing for the **details pop-up**: hovering a node or a box's title
  strip shows its class, its icons named (the main one first), its change, its note, the
  diagrams it opens (a small sparkle on one with changes), its related links and Open
  page; a click, a tap or keyboard selection keeps it open. Sparkles and plan signs sit
  on the main icon's corner; a change inside a linked diagram shows as the small sparkle
  on the icon. Arrows end at the icon's centre (the middle of a side for a box). Boxes
  are thin, the main icon in the top-left corner; an AWS main icon gives the box its
  colour (border and tint, the title in ink), since those icons are one colour; Azure and
  Google icons are not, so their boxes keep the theme's colour. On screen Poster nodes
  carry no `<title>` tooltips (the pop-up names them); exports keep them.

**Built-in theme** (`id: 'default'`, label "Avagahana"): light and dark; a 13-colour
category palette; the blue family as the level ramp; a `frame` in the Avagahana
website's colours (its ground, ink and olive accent); font Atkinson Hyperlegible Next
(OFL). Its font files load only when it is used. `defaultTheme: false` hides it; when
none of the host's themes can be used it is used after all, with a `theme-built-in-used`
warning (added in WO-32; before, a plain grey theme). A theme asked for by an id no
registered theme has (`options.theme`, `prefs.theme`) gives a `theme-unknown` warning.

Every slot of an appearance, what it means and where the viewer uses it:
`format/theme-slots.json` (shared with `relay-server/themes.py` and the tests). The
viewer and `themes.py check` report the same problems for the sample themes in
`format/theme-samples/`.

### `applyTheme(element, theme, {appearance})`

Gives a host's own element the same theme variables and font (`--mmv-bg`, `--mmv-ink`,
`--mmv-font`, the palettes as `--mmv-cat-<n>` / `--mmv-lvl-<n>`, …), so the host's
interface matches the viewer. `theme` is an object, or
the id of a theme a viewer has registered. Returns `{ok, problems, release()}`.

### Classes a theme's `css` can use

Root: `.mmv` (`is-narrow` while the toolbar leaves out Export, Search and a `'wide'` view picker: under 480 px, or the top row does not fit; a host may style its own slot button by it) with `data-theme`, `data-appearance`, `data-colour-by`, `data-look` (how the look draws: `fade` or `outline` for a mind map and ER, `fade` for a flowchart's Outline and for state diagrams and sequences, `poster`), `data-diagram` (`mindmap`, `flowchart`, `sequence`, `state` or `er`), `data-boxes` (a box diagram: flowchart, state, er). Drawing: `mmv-node`, `mmv-shape` (`is-solid`, `is-mark`: a state diagram's dots, bar and choice), `mmv-divider` (a state's description rule), `mmv-warn` (a state's path warning), `mmv-table` with `mmv-table-head`, `mmv-table-row`, `mmv-table-more`, `mmv-key`, `mmv-grain` (an ER table), `mmv-er-line` (`is-lit`), `mmv-er-end` (crow's-foot marks), `mmv-label`, `mmv-icon`, `mmv-edge`, `mmv-frame` (an open box; `is-poster` in Poster, its `--n` set to an AWS main icon's colour), `mmv-frame-title`, `is-poster` on a Poster node (`data-hover`: the node whose details hovering shows), `mmv-icon is-tile` with `mmv-tile` (a Phosphor main icon on a tile), `mmv-inner-spot` (a Poster node's linked-diagram sparkle), `mmv-flow` (a box diagram's arrow; `is-dotted`, `is-thick`), `mmv-flow-label`,
`mmv-rel`, `mmv-rel-label`, `mmv-dot`, `mmv-rel-dot`, `mmv-bar`,
`mmv-mark-hit`, `mmv-mark-sel`. Colour classes: `mmv-c<n>` (a node's class: its slot, `mmv-cm` external, `mmv-c0` none; box diagrams), `mmv-k<n>` (category, 0 = centre),
`mmv-l<n>` (level), `mmv-d0|1|2` (depth band), `mmv-pa|pc|pr|p0` (planned change: added,
changed, removed, none; WO-13). Changes since you looked: `mmv-change` (`is-new`,
`is-changed`), `mmv-spark` (a diagram icon's small sparkle), `is-glow`, `is-gone`,
`has-marks` on the expand button; the sparkles button (`data-mmv="sparklesBtn"`, `is-on`
and `aria-pressed` while they show) and its panel (`sparklesPanel`: `showSparkles`,
`sparklesCounts`, `sparklesGone`, `clearView`, `clearMap`). States: `is-dim`, `is-closed`,
`is-on`, `is-selected`, `is-hit`. Per node, `--n` and `--n-ink` hold its colour and
the text colour on it.

## Size

The viewer needs at least 320 × 280 pixels (its mount element; a phone in landscape).
Smaller, it shows a message saying so and nothing else, until it is made larger. Below
480 pixels wide (a phone upright), or wider when the top row would not fit at its widest
(the longest view name, every layout mode, search open, the play button, a host's button
in the slot), the toolbar leaves out Export and Search (class `is-narrow`). Switching
views, hovering or playing never changes it.

## The whole map (added in WO-35)

The Export menu has two groups:

```
This view     SVG, PNG, Print            pictures of what is shown (above)
Whole map     Interactive HTML           explore offline: every diagram, one file
              Source file                edit with your agent: the map's Markdown
```

**Source file** saves the map's Markdown text as the viewer was given it, under the map
file's name (`<name>.md`, or its title when there is no path).

**Interactive HTML** (`viewer.snapshot()`) packs a snapshot, as `relay-server/pack.py`
does (below), with no server and no atlas: `map-viewer/pack.js`, loaded on first use,
reads the viewer's own files beside it. The file holds every diagram, view, deployment
and play, Before and After when the host gave an earlier version, and opens where the
reader is:

- Kept: the diagram, view or deployment, mode, relations shown, colouring, theme and
  appearance, Before or After. A sequence that was playing opens at step 1.
- Dropped: an open node page, a search, a selection, a drilled-in box, boxes opened by
  hand. The reader's own "since you looked" marks never go in; a host's `since` does
  (with `sinceLabel`), and then every reader of the file sees the same marks, hidden
  until they show them.

Its footer always reads "Built with Avagahana" with the mark, linking to the Avagahana
page (no option or theme hides it), and on the right the map's title and "as of
<time>" when the host gave `asOf` (the atlas gives each map's saved time), else
"exported <time>", shown in the reader's own time zone. `version` goes only in the
page's `<meta name="generator">` tag, never on screen.

Not offered with `assets` (inside a snapshot): an interactive file needs the viewer's
own files beside it, and `snapshot()` rejects. The source file and the pictures stay. The
file carries every note in full, as the Markdown does; there is no option to turn the
group off yet. Thumbnails have no menu.

## Assets and network

- The viewer's own files (stylesheet, icons, built-in theme and its font) load
  relative to `import.meta.url`, never from a fixed path, and only when needed.
  Nothing goes to the internet.
- ES modules do not run from `file://`, so a page using the viewer needs some local
  web server (the relay server or any static one), or is a snapshot (below).
- `assets: (path) => Promise<text>` (added in WO-33): the viewer asks the host for its
  stylesheet (`base.css`, put in a `<style data-mmv-base>`), icon indexes (`icons.json`,
  `vendor-icons.json`) and icon files (`vendor/…`) instead of fetching them beside
  itself; a rejected promise is a missing file. Icons are per document, so the last
  viewer given `assets` serves them for all. Without it nothing changes. The built-in
  theme's font is not asked for: a host that has no files beside the viewer passes its
  own theme objects (their faces' `data()`).
- A snapshot (`relay-server/pack.py`, or the viewer's own `map-viewer/pack.js`) is one
  HTML file holding the map, the viewer's modules and the files it needs, which opens
  from disk with no server and no network. Both packers fill `map-viewer/snapshot.html`
  (its comment lists what goes in) by the same rules. `map-viewer/snapshot.js` is its
  start-up script, not a module the viewer imports. No
  viewer module computes a URL from `import.meta.url` when it loads (a snapshot's
  `blob:` URL is no base for one), so a snapshot runs the viewer's modules unchanged.
- `crossMapNote` (added in WO-33): with no `host.openMap`, a link to another map is
  listed, not clickable, followed by `(<note>)`; a snapshot says "Not in this snapshot".
- Map icons are the bundled Phosphor set; hosts never supply icons.

## Screen readers and keyboard

What works and what does not; no claim of conformance to any standard.

- **List mode** reads the map as an outline, with a screen reader and with the keyboard
  only. It is one tree (`role="tree"`, one Tab stop): Up and Down move, Right opens a
  branch or goes into it, Left closes it or goes to its parent, Home and End go to the
  first and last row, Enter opens the node page, Space selects, a letter jumps to the next
  node starting with it. Each row is read in full: its label, what its icons mean, its
  class, its planned change, an ER table's role, "has a note", how many children and
  arrows. Under a node: its note (Right or Enter opens it in place) and its arrows ("to
  Payments: card charge"; Enter goes to the other end, Right opens the arrow's note).
  Coloured by class, each row also shows its class's name.
- **The node page** is a modal dialog: focus moves into it when it opens, Tab stays
  inside, Escape closes it and focus goes back where it was.
- **The toolbar**: every button has a name; every control shows a focus ring.
- **The drawing** needs a pointer or touch. It is an SVG group named after the map
  (`<title>`), with a `<desc>` saying what it shows and that List mode reads it as an
  outline ("Mind map of 23 nodes. List mode reads this map as an outline."). Each node is
  an image with a spoken name: its label, its level, how many children, whether it is
  collapsed, whether it has a note. Lines and related links are not read; there is no
  keyboard walking of the drawing.
- **Motion**: with reduced motion asked for, the camera, the node page and the
  transitions do not animate.

## Safety

- **No raw HTML from a map ever reaches the page.** Labels and notes are built from
  parsed text; the small allowed markup (`**bold**`, `<br>`, Markdown in notes) becomes
  elements.
- Only `http`, `https` and `mailto` links are clickable.
- The viewer never edits a map. It has no write path.

## Export and print

SVG and PNG export draw every label in full, resolve every colour to its value (the
SVG stays editable in other tools) and embed the theme's font from the bytes the
viewer already holds. Print goes through a hidden iframe holding only the export (or
the list), so the host page's print styles are untouched.

## Keyboard

`/` search, `0` centre the selection or fit, `Backspace` up one level, `Escape`
closes panels and the node's page, `Cmd/Ctrl+P` print. While a sequence plays: `←` / `→`
step, `Space` play or pause, `Escape` stops it. Keys go to the viewer last clicked or focused (a
lone viewer always), and never while focus is elsewhere in the host page.
