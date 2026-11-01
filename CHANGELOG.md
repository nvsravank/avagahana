# Changelog

All notable changes to Avagahana. Versions are git tags (`vMAJOR.MINOR.PATCH`).
Changes to a contract (viewer API, map source, server HTTP API, map format) are
marked **Contract**.

## Unreleased

- Atlas and viewer (WO-40): the atlas shows no viewer picker (`viewPicker: false`): its bar
  is the navigation; an exported snapshot keeps the picker. A minimised walkthrough is a
  small route icon, with no name or place; the walkthrough panel sits on the left (a
  sequence's panel keeps the right), with no Previous on the first stop and no Next on the
  last.

- Viewer and atlas (WO-40): every diagram is reachable from both. The viewer's picker
  lists the whole map: Walks (walkthroughs and their stops) first, then every diagram,
  linked from the first or not, with its perspectives, joins, deployments and scenarios
  nested under it; rows open and close (Open all, Close all), the diagram shown starts
  open, what is shown is marked. "Where it runs" and "Not linked" are gone. The atlas
  bar has no pills: plain items (Walks, then each diagram, the first called Overview),
  the one shown underlined; an item with more under it opens a popup of two columns
  (its groups; the picked group's entries) on hover, a tap or Enter, and every diagram's
  popup starts with its Overview. On a phone the viewer shows no picker in the atlas
  (`viewPicker: 'wide'`); the atlas is the way round. `contents()` walkthrough entries
  gain `stopList`.
- Viewer (WO-40): a walkthrough follows the reader. Exploring inside a stop stays on it;
  opening another stop's place moves to that stop; any other place is off the path, with
  Return to the stop (Previous and Next go on from it). Skill: `references/walkthroughs.md`
  (when to write one, choosing stops, writing notes); trace-architecture ends a large map
  with one.

- **Contract** (map format, addition): `## Walkthrough: <name>` tells a story over the map's
  own items: each `### <Kind>: <name>` stop (Diagram, Perspective, Deployment, Scenario,
  Join or Sequence) names an item and carries its Markdown note, in the order written. The
  viewer opens it as a panel on the right with Previous and Next, minimised to a tab; the
  atlas lists a map's walkthroughs first, under Walks, with their stop counts. Checker
  problems `walkthrough-empty`, `walkthrough-twice`, `walkthrough-stop-kind` and
  `walkthrough-stop-unknown` (WO-40). Viewer: `contents()` gains kind `walkthrough`, and
  state gains `walkthrough` and `stop`.

- **Contract** (map format, viewer API, server HTTP API, renamed before any release, not
  shared yet, so no old names are kept): `## Relations: <name>` is `## Perspective: <name>`
  and `## Walks: <name>` is `## Scenario: <name>`; the bare `## Relations` stays the default
  perspective. Before/After is `edition` everywhere (`state.edition`, `setState`, the
  options, `changes.edition`, `render.py --edition`, the `/api/show` body, the atlas link's
  `edition=`). A scenario's contents entry is kind `scenario`. Problem codes are
  `scenarios-not-here` and `scenario-*`; the old names are reported as unknown sections
  (`section-unknown`), not read (WO-40).

- Atlas (WO-43): pick another map of the same folder as Before. Each row of the map list has
  a stone, "Pick as Before", while nothing is being compared; picking a map by its name
  opens it with no Before (the open map's own name clears it). The link keeps the pick
  (`before=<path>`, an addition), so reload, Back and a shared link keep the comparison;
  a live reload of either file keeps it. No viewer, relay or format change.
- **Contract** (map format, viewer API): ER diagrams lose the Role colouring and its
  inference from relationship counts, which read an application's schema as a
  warehouse (Order and Payment as dimensions). An ER diagram is coloured by class, as a
  box diagram is; a link's `colourBy=category` opens Class. A table with no class takes
  one plain colour (the theme's `accent`), with no colour key (WO-44).
- **Contract** (map format, addition): six table classes are built in for ER diagrams,
  each with a fixed colour and key label, no `## Classes` line needed: `fact`,
  `dimension`, `bridge`, `master`, `transaction`, `lookup` (muted). One wins over a
  table's other classes; two on one table is a checker error, `er-table-class-twice`
  (WO-44).
- **Contract** (map format, addition): ER diagrams read Mermaid's `subgraph` ... `end`
  (Mermaid 11.17+) as groups of tables: boxes in the tree that frame their tables, close
  with their dot to one box (the tables' lines lifted to it) and can be drilled into.
  Checker problems `er-group-not-closed` (error), `er-group-relationship` and
  `er-group-direction` (warnings) (WO-44).
- Examples: the release review's Orders data groups Order and Order line, and Payment
  and Refund, with Customer outside, classed `master` and `transaction`; shop-layers'
  Orders data is classed; sales-warehouse is classed and gains a Return line fact
  (sharing Date, Product and Customer) and a Currency lookup (WO-44).
- ER layout: in each view (the whole diagram, a join view, a table opened on its own) a
  table draws its foreign-key rows in the order their lines leave it, top to bottom, so
  lines no longer cross at the table whatever the file's column order (one order could
  not suit every view). The node page and the grain sentence keep the file's order
  (WO-44).
- Skill: the ER reference says to class every table (the six table classes), to group
  tables with `subgraph`, and how to untangle ER lines (table order, the same draft
  script as box diagrams; column order no longer moves them) (WO-44).

- Fix: opening a table in Tables mode (the viewer's `focus` on an ER table, as a drill or
  a link does) left the canvas empty and logged `translate(NaN,NaN)`: the table has no
  children to lay out. It now shows the table and the tables its relationships in the
  view reach (WO-42, found while checking WO-44).
- Before and After: the toggle becomes a switch of two icon buttons, a rough stone
  (Before) and a cut diamond (After), with the version on screen pressed; the tooltips
  and labels name each ("Before: the earlier version", "After: this version"). The
  one-pill toggle with the swap arrows read as where a click goes, not what is shown
  (WO-42).
- Fix: a changed or planned arrow's ringed sign could cover the arrow's end marks (the
  crow's feet in ER). The label now takes room for the sign, so placing the label keeps
  both clear of the ends; the text moves right by the sign's width. A column's sparkle
  sits between its name and its type, clear of the lines at the table's sides
  (WO-22 follow-up).
- Example: the release review (`checkout-release-before.md` / `-after.md`) gains an Orders
  data ER diagram, opened from the Orders database: a renamed token column (`## Renames`),
  a nullable column, a type change, a dropped column, retries as a cardinality change and
  a new Refund table (WO-22 follow-up).
- **Contract** (map format, addition): `## Renames` after an ER diagram says a column was
  renamed since the earlier version (`- ORDER.customer_id was cust_id`); checker
  problems `rename-syntax`, `rename-unknown-column`; the viewer warns `rename-stale` when
  a line does not fit the earlier version. ER types may end in `?` (nullable, as Mermaid
  reads them); the table's label and column comments read `**bold**`, `_italic_` and
  `<br>`, and the title strip grows a line per `<br>` (WO-22 follow-up).
- **Contract** (viewer, Before and After): ER columns are compared by name (type, keys,
  comment, grain; declared renames followed) and column connections by their pairs;
  cardinality and identifying read in ER words, not `line`. A changed row has its sign
  after its type, a closed table's `+ N columns` carries the sign of what it hides, the
  table reads changed ("columns"), a changed connection signs its line; the changes
  list, node page, List mode and render report say what (old → new). Tables now draw
  their own sign (WO-22 follow-up).
- **Contract** (viewer, since you looked): an ER table's column is a thing of its own: a
  new or changed column in an existing table sparkles on its row (on `+ N columns` while
  hidden); a changed column connection marks its line; a removed column is listed under
  its table. A baseline kept before this takes columns as seen (WO-22 follow-up).

- Fix: a box's title broke no lines: a `<br>` drew as a space and a long title ran past
  the box. It now breaks at `<br>` and wraps as a node's label does; the title strip and
  the box grow to fit, and a box below the first level is sized for its semibold title
  (WO-41).
- **Contract** (map format, addition): an arrow label reads `**bold**`, `*italic*` and
  `<br>` as a node's label does (flowcharts, state diagrams, ER relationships, sequence
  messages, view lines), and a line over 40 characters wraps at a space. Two lines are
  drawn and the gap, the box's side or the message's row make room for them; past two
  the second ends in `…`, hovering the label shows it whole, and the checker warns
  (`arrow-label-lines`, new warning). A relation's or message's `label` is now its plain
  words on one line (lists, pop-ups, reports); a node label's `*italic*` is documented
  (WO-41).
- README: the hero opens the launch video on YouTube; links to the video and the article
  (WO-39 follow-up).
- README: See the whole shows one shop at three levels (the system, its parts, everything
  inside) (WO-39 follow-up).
- Fix: `expand: 0` (`render.py --expand 0`) drew nothing in a box diagram; its top is
  never closed now, so 0 shows the top-level boxes closed, as 1 does (WO-39 follow-up).

- README shows what Avagahana does: one section and one picture each, light and dark,
  the pictures on the website (made by its own script), install after (WO-39).
- Example `cache-miss.md`: two sequences over one small view, a stampede and a single
  rebuild with a lock; in the website gallery, which opens on a sequence from `?seq=`
  (WO-39).
- **Contract** Relay: `GET /api/before?p=…&empty=1` answers `204` (empty) when there is
  no earlier version, instead of `404`, so a browser's console shows no error; the atlas
  asks that way. Without `empty=1`, unchanged (WO-39).
- `render.py --seq` with a name the map does not have draws without it, as before, and
  now says so in `WARNING=`, listing the map's names (`check_map.seq_names`) (WO-39).
- Fix: a node page opened in light kept a light background after a switch to dark (and
  the other way); its grow-out animation held its end colours (WO-39).

- **Contract** Map format: a node's **main icon** (WO-38): its first cloud icon, else
  its class's first cloud icon, else the icon `## Node icons` or `## Classes` marks with
  the reserved word `main` (`- sched : main ph clock`). Further cloud icons are tags
  beside the name (they were all drawn above it). Seven problem codes (`main-icon-*`);
  `main` is no legend name. Cloud icons are now in the icon filter.
- **Contract** Map format: `## Look: poster` (or `outline`) says which look a flowchart
  opens in (`look-not-flowchart`, `look-twice`, `look-unknown`) (WO-38).
- **Contract** Viewer: looks are per diagram type, saved as `looks` (a saved `look` is
  read as the mind map's and ER's). Flowcharts: Outline (always drawn as Fade, the tint
  is gone) and **Poster**: each node its main icon with the name under it, boxes thin
  with the main icon in the corner and an AWS icon's colour, arrows to the icon's
  centre, tags, trust marks, notes and linked diagrams in a pop-up on hover (a click,
  tap or keyboard selection keeps it open), sparkles and plan signs on the icon. State
  diagrams and sequences have no Look row (it changed little or nothing). Going in or
  out of Poster lays the diagram out again. `setPrefs({look})` and a link's look apply to
  the shown diagram's type (WO-38).
- **Contract** Relay: `POST /api/render` takes `look`; `render.py --look outline|poster`
  (WO-38).

- **Contract** Map format: where the layout has nothing else to go on, the order of
  lines decides: children of a box with no arrows among them sit in the order they are
  first named, and arrows that leave or enter a node's box take their places on its
  side in the order they are written. The map skill uses it to untangle crossing
  arrows when they are many for the picture, trying orders on a draft first (WO-37).
- **Contract** Relay: `POST /api/render` takes `text`, a draft drawn in the map's place
  (the `render` event carries it, the page's answer says `draft: true`); `/api/info`
  capabilities gain `draft`. `render.py --draft FILE` sends a file the reader never
  sees, and refuses an answer from an older page or relay that drew the map's file
  instead. `render.py` is also a library: `draft_report(map, text, ...)` returns the
  layout report in-process, for trial scripts. The `render` event carries `pages`; the
  only page listening claims at once (a page in the background waited 0.6 s, slowed to
  about 1 s by the browser, on every render; a draft now takes under 0.1 s) (WO-37).
- A box's own `direction` now holds for its children with no arrows between them; they
  used to line up across the parent's flow, so `direction LR` inside a left-to-right box
  stacked them in a column (WO-37).
- Examples `shop-layers`, `slow-checkout` and `shop-plan` reordered by an agent with
  the skill, the same lines in a new order: crossings 14 to 4, 2 (Layers 4) to 0, and 1
  to 0 in Boxes. In `slow-checkout` and `shop-plan` the top level moved too, so their
  category colours and List order changed (the card provider now comes first) (WO-37).

- **Contract** Sparkles (changes since you looked) are hidden until the reader shows them.
  A sparkle button beside the info button appears while a map has changes; its panel
  has Show sparkles (kept with the preferences as `sparkles`), this view's and the whole
  map's counts, this view's removals one per line, Clear this view and Clear whole map.
  Hidden, nothing is marked (`contents()` `changed` false) and reading clears nothing; a
  load still glows. The info panel loses its "Since you looked" section and the info
  button its `has-changes` ring; closing the info panel clears nothing. A host's `since`
  and snapshots start hidden too (WO-36).
- **Contract** The whole map from the viewer: the Export menu has This view (SVG, PNG,
  Print) and Whole map: Interactive HTML (explore offline), a snapshot made in the browser
  with no server or atlas, and Source file (edit with your agent), the map's Markdown. `viewer.snapshot()`; options `asOf` (the
  footer's "as of" time) and `version` (the generator tag only), `load` context `asOf`.
  The file opens where the reader was (diagram, view or deployment, mode, colouring,
  theme, appearance, Before; a sequence at step 1), without a node page, search,
  selection or the reader's own marks. Inside a snapshot there is no HTML item; the
  source file stays (WO-35).
- The viewer's packer `map-viewer/pack.js` and `relay-server/pack.py` fill one page,
  `map-viewer/snapshot.html` (footer included), by the same rules; a browser test packs
  the same maps with both and compares them. The footer's mark is `map-viewer/mark.svg`,
  kept identical to `atlas/brand/mark.svg` by `check.sh` (WO-35).
- **Contract** Relay: `GET /api/info` has `build`, the code's commit (WO-35).

- Snapshots: `relay-server/pack.py` packs one map into one HTML file that opens from disk
  with no server and no network: the map as data, the viewer's modules (turned into
  `blob:` modules by `map-viewer/snapshot.js`, which puts each module's URL into the
  modules that import it), only the icons the map uses, the theme and its font. A
  security policy loads nothing from outside the file and lets it send nothing. No marks
  unless `--since`; `--before` packs Before and After; links to other maps say "Not in
  this snapshot". The footer always reads "Built with Avagahana" with the mark, linking to
  the Avagahana page, and on the right the map's title and when it was saved, in the
  reader's own time zone. The version is in the page's `generator` tag only (WO-33).
- **Contract** Viewer options `assets` (the viewer's own files from the host) and
  `crossMapNote`. No URL is computed from `import.meta.url` when a module loads (WO-33).

- **Contract** Map format: a planned-change class (`added`, `changed`, `removed`) stays on
  the node or arrow that names it; it no longer flows down to what is inside a box (a
  removed box's children may move elsewhere). `examples/maps/shop-plan.md` marks each
  node (WO-34).
- Planned changes are drawn without colour, in every colouring, print and export: a ringed
  +, ~ or − at a marked node's top-left corner (where the "since you looked" sparkle goes),
  on arrows and on List rows; hidden marks show on closed boxes; the legend says
  "Planned changes". Theme tokens `plan-added`, `plan-changed`, `plan-removed`. The
  "since you looked" sparkle is off on a diagram with a plan.
- **Contract** Before and After: viewer option `before` (an earlier version's text),
  `load` context `before`, `viewer.setBefore(text)`, `edition` in `state` and
  `setState`. A toggle beside the view picker switches versions with a glide; a changes
  button lists what changed in the view shown (Removed, Added, Moved, Changed); the node
  page says the same. Matching is by id (WO-34).
- **Contract** Relay: `POST /api/show` takes `before` (kept in memory per map, `null`
  forgets it) and `edition`; `GET /api/before?p=`; capability `before`;
  `POST /api/render` takes `before`; the layout report then has `changes` (per view). `show.py --before FILE|none`, `render.py --before FILE
  --edition before|after`. The atlas carries `edition=before` in its URL.
- Example pair `examples/maps/checkout-release-before.md` and `checkout-release-after.md`
  (a release review); skill reference `compare.md`.
- Checker: `plan-arrow-contradicts` (error), `plan-arrow-to-removed`, `plan-removed-keeps`,
  `plan-all-removed` (warnings).

- **Contract** Viewer options `title: false` and `viewPicker: false` leave out the map's
  title and the view picker, for a host that names the map and lists its views itself
  (the website gallery); `viewPicker: 'wide'` drops the picker only while the toolbar is narrow
  (the atlas, whose chips cover phones). Defaults keep both (WO-17).
- **Contract** The viewer's minimum size is 320 × 280 (was 320 × 360), so a phone in
  landscape draws the map. The toolbar leaves out Export and Search below 480 px wide, or
  wider when its top row would not fit at its widest (the longest view name, every mode,
  search open, play; root class `is-narrow`).
- The atlas when the viewer's toolbar is narrow (a phone, or names too long to fit): the map's name takes the word mark's place in the
  bar and opens the map list (the list's button leaves the viewer), "Quick links" is
  hidden. Wider, the bar and toolbar are as before. The logo is a picture only; it no
  longer opens the map list.
- List mode is a keyboard and screen-reader outline: one tree, arrow keys, each row read
  in full (icons in words, class, planned change, note, children, arrows), notes open in
  place, arrows as rows. Coloured by class, rows show their class's name.
- The node page is a modal dialog: focus moves in, Tab stays inside, focus goes back on
  close. Focus rings on every control; reduced motion stops the small transitions too.
- Docs: "Accessibility" is now "Screen readers and keyboard", stating plainly what works
  and what does not.

- **Contract** Map format: an underscore inside a word is just an underscore in a label
  (`ORDER_SUPERVISION_TRIGGER`, release ids, constants); before, a pair of them made the
  text between italic and the underscores vanished. `\_` and `\*` keep the mark, and
  text in backticks is taken as written (WO-32 follow-up).
- **Contract** The layout report's `colours` gives each box's `stroke` beside its `fill`:
  a class that colours only the outline showed as plain white before.
- The skill and plugin descriptions say a map can also be rendered to SVG or PNG for a
  document, slide or PDF in your brand's theme, so agents load the skill for that.
- **Contract** Viewer `viewer.export({format, width | scale, background, crop, report})`
  returns the picture (SVG text or a PNG Blob) instead of downloading it; the toolbar
  buttons use it (WO-32).
- **Contract** Viewer state takes `expand` (levels or `all`), `close` (boxes shown
  closed), `highlight` (these nodes lit, the rest in the idle colours) and `crop` (a box
  and what it connects to, for an export) in `setState` and `options.state`; `state`
  does not report them.
- **Contract** Exports name what they show: `role="img"` and a root `<title>`; every
  node, box and line has `data-id` and a `<title>` (also on screen). No links, scripts,
  event attributes or outside URLs in a file. Before, exports dropped every `data-*`.
- **Contract** The layout report (`export({report: true})`): labels cut short, boxes
  overlapping, lines crossing, lines closer than 2 px, the smallest text at the output
  width, each box's colour and why.
- **Contract** `viewer.contents()` sequence and scenario entries gain `steps`.
- **Contract** `defaultTheme: false` with no usable host theme uses the built-in theme
  with a `theme-built-in-used` warning (before: a plain grey theme); an unknown theme id
  gives a `theme-unknown` warning.
- **Contract** Relay: `POST /api/render` (the agent asks, one open atlas page draws the
  map in a hidden viewer and answers; `render` event, `POST /api/render/<id>/claim` and
  `POST /api/render/<id>`), `GET /api/themes` and `GET /api/theme-file` (the maps
  folder's `.themes/`), capabilities `render` and `themes`, `theme` on `POST /api/show`.
  `relay-server/render.py` (SVG or PNG, one file per sequence step, `--report`) and
  `relay-server/themes.py` (`list`, `check`, `derive`); `show.py --theme`.
- **Contract** Map source: optional `onRender`, `claimRender`, `answerRender`; the maps
  folder's `.themes/` (`<id>.json`, `settings.json` with `builtIn`, `default`, `logo`),
  read by the atlas from the relay or an opened folder.
- `format/theme-slots.json` (every theme slot, its meaning and use) and
  `format/theme-samples/` (sample themes the viewer and `themes.py` judge alike).
- Fixed: a deployment view of a diagram whose nodes link to other diagrams crashed
  (`Cannot read properties of undefined (reading 'map')`): node sizes are measured again
  when a view swaps in another tree. Exports during a glide no longer include the boxes
  shrinking away; a state's loop back to itself no longer writes `rotate(NaN)` into an
  exported arrowhead.
- `scripts/browser_tests.py` drives Chrome over its debugging pipe and waits in real
  time for each page to finish (macOS, Linux); `--dump-dom` with virtual time ended
  pages early while they waited for a font or a file.

- **Contract** Change marks (WO-31): one sparkle for new or changed (the pencil is
  gone); only the topmost new thing is marked; no outlined sparkle anywhere (closed
  boxes, crumbs, view picker and play button lose theirs). A diagram with changes has a
  small sparkle on its icon (a node's link icon, its page thumbnail); the expand button
  has one while closed boxes hide changes. A whole new diagram is marked on its icon only
  and clears when opened; selecting a new node clears everything inside it. The info
  panel counts new diagrams apart.
- **Contract** `viewer.contents()` entries gain `changed`; the `contents` event also
  fires when marks clear. `changeMarkSvg(size)` from `map-viewer/index.js` draws the
  small sparkle for a host; the atlas chips use it.
- **Contract** Viewer options `since` (an older map text to compare with, the same for
  every reader, nothing kept), `sinceLabel` ("Since <label>", default "the earlier
  version") and `marks: false` (no marks).
- **Contract** `viewer.contents()` lists every diagram, relation view, join view,
  deployment, sequence and scenario of the map with the state that opens it, from the
  viewer's model; the `contents` event fires when the list changes. A `theme` event
  (`{id, appearance}`) lets a host style its own frame to match.
- **Contract** Themes gain an optional `frame` colour group (`--mmv-frame-*`) for a
  host's bar; the built-in theme's takes the website's colours (ground, ink, olive accent). Themes without it get
  one derived from their other colours.
- **Contract** The default relation view is shown as "Overview" (view picker, node
  page, search, player). Its heading and state name stay `Relations`; `setState`
  takes either.
- Atlas: a contents bar above the viewer (44 px): the logo (opens the map list), the
  word mark, "Quick links" and a chip for each diagram, view, deployment and play, in
  a scroller with fades and arrows instead of a scroll bar. The first diagram's chip is
  "Overview"; a diagram's default view gets no chip of its own beside its diagram's,
  which opens it. The map title shows once, in the viewer's toolbar. `?logo=0` hides the logo.
  The bar uses the website's mark (rose and olive waves, `atlas/brand/mark.svg`, also the
  page icon) and word mark.
- The return mark of a reply is a drawn icon, not the character U+21A9, which iPhone
  Safari draws as an emoji. Two-way and opens-elsewhere arrows are drawn or swapped too.
  `scripts/check_emoji.py` (run by `check.sh`) fails on any character with an emoji form
  in `map-viewer/` or `atlas/`.
- A sequence step's camera glide no longer jumps past its start when the first frame's
  time comes before the glide began, and arrives even when the page gets few frames
  (a timer finishes it, as box glides already did). Box glides and the message dot are
  held at their start the same way. The headless browser test "setTheme keeps a view a
  sequence step moved to" failed on `master` from this.

- **Contract** `setState({seq: null, …})` stops the sequence and then applies the other
  fields of the same call (`part`, `view`, `env`, `focus`, `node`, `page`, `mode`, `rels`);
  before, it stopped the sequence and ignored the rest. Playing a sequence is unchanged.

- Examples: `sales-warehouse.md` draws its foreign keys column to column (`## Relations`)
  and adds a `Sales against stock` join view. `node-shapes.md`, a test of every node
  shape rather than an example, moves to `map-viewer/test/fixtures/node-shapes.txt`.

- The repository is public: installing from GitHub needs no git credentials.

- The cloud icon folders carry their NOTICE.md (source package, vendor page, the
  vendor's terms as checked), written by `scripts/import_vendor_icons.py`
  (`--notices` rewrites them alone); `vendor-icons.json` names each set's package.
  `scripts/check.sh` fails when a vendor folder has no notice.

- **Contract** Switching themes keeps the camera: `viewer.setTheme(id)` and the theme
  panel no longer re-fit the drawing, so a view a sequence step moved to (or any pan
  and zoom) stays put. Only the first theme, at mount, fits the drawing.

- **Contract** Cloud icons: `aws <name>`, `azure <name>`, `gcp <name>` draw the official
  AWS, Azure and Google Cloud architecture icons (SVG only, unchanged, vendor terms in
  `map-viewer/vendor/<set>/NOTICE.md`), named by product with familiar aliases
  (`map-viewer/vendor-icons.json`, written by `scripts/import_vendor_icons.py`). They sit
  centred above a node's name, or at the top right of an open box, titled with the
  product name. The checker rejects unknown names (`unknown-cloud-icon`) and suggests
  the nearest; the viewer leaves them out. The reserved `google` namespace is `gcp`.
- Unknown `ph` names get a nearest-name suggestion from the checker.

- The `map` skill is now `illuminate-concept` (also for a reader struggling with a
  concept, preferred over generic visualizers when its diagrams fit), with a
  `trace-architecture` skill for reviewing a project or repository: size the task first, one map file of linked diagrams by
  default, diagram kinds chosen by purpose and scaled to the scope, layers named for
  their responsibility with role classes, icons used sparingly, and subagents only as
  a last resort with the user's approval.
- The node page scrolls inside its rounded corners, so its scrollbar is never cut.

- The info panel's "Clear changes in this view" marks the current diagram and view
  as seen, leaving other views' changes. The diagram switcher follows the view picker.

- **Contract** Diagram quick links are grouped by type, preserving authored order
  within each type across the drawing, list and node page.

- **Contract** Diagram icons are direct quick links to their individual destinations;
  the note icon opens the node page. Boxed nodes put quick links on a second row,
  with content and note icons centered vertically on either side. Diagram types use
  distinct icons with the approved lighter strokes.

- Far zoom keeps flowchart and state boxes, outlines and routed connections fixed;
  only label text becomes bars. Mind-map branch enlargement no longer affects boxes.

- ER layout preserves its hub-and-spoke arrangement during refinement. Vertical
  clearance uses label height rather than horizontal channel and label width,
  preventing small join views from collapsing into widely spaced vertical chains.

- ER channel ordering reduces crossings between parallel relationships. Same-side
  endpoints share a vertical middle channel when it is free and does not add crossings.

- ER looks are Flat (uniform fill with subtle row dividers) and Zebra (alternating
  fills). Tables share the widest visible table's width; endpoint channels are allocated
  per table side across all neighbours, with space reserved by layout.

- **Contract** Phosphor icons use `ph name` in Mermaid icon lines and Markdown
  sections. The old `ph-name` spelling is rejected; semantic codes stay unchanged.

- **Contract** ER column relationships use stable IDs under `## Relations`; named
  `## Joins` views reuse connections or define column equalities, including composite
  pairs. Scenarios select connection IDs and named views; ambiguous selections fail checking.
- Fix ER column labels staying as bars after zooming back in.
- ER tables show all columns through 15, retain PK/grain/FK/connected columns above
  that threshold, and route connections horizontally into their exact column rows.
- Share flowchart label clearance and placement with ER; reserve space for parallel
  connections while keeping straight middle segments and same-side stacked-table ports.
- Shop platform demonstrates parallel address relationships and separate join views.

- Discard stale navigation and live reload work; enforce symlink containment when listing maps.
- **Contract** Viewer loads accept optional `{sourceId, signal}` context; source identity
  isolates reader baselines and an AbortSignal cancels pending loads. Latest load wins.
- **Contract** Map sources expose `identity()`; built-in folder identities persist per handle.
  Relay info adds `sourceId`; ping adds effective `config`. Launchers refuse incompatible reuse.
- **Contract** Show mode validation accepts short lowercase identifiers; the viewer decides
  which modes its diagram supports, including ER tables.
- Add full validation command and CI with required browser checks.

- **Contract** Rename the product and plugin to Avagahana. Repository and plugin identifiers
  use `avagahana`; relay identity is `avagahana-relay`, the maps variable is
  `AVAGAHANA_MAP_DIR`, browser tests use `AVAGAHANA_CHROME`, and default browser
  storage keys use `avagahana`. Clean rename before public release; reinstall the
  plugin and select the existing maps folder again.

- The repository is now the plugin root for Claude Code and Codex, with separate
  root manifests and catalogs and one shared `skills/map/` skill. Removed duplicated
  deployment bundles, the bundle generator, and target templates. The full format
  reference is read directly from `docs/map-format.md`.
- **Contract** Plugin maps-folder setup uses `AVAGAHANA_MAP_DIR` or a single absolute
  path in `~/.config/avagahana/maps-dir`, replacing Claude-only installation options.
  The skill asks and saves that path on first use. Standalone relay options are unchanged.

- **Contract** In a state diagram, a link in a state's note to another diagram of the
  file (`[t](#anchor)`) links the state to it as a flowchart `click` does (icon on the
  box, thumbnail on its page): how a state opens a sub-machine (WO-14).

- **Contract** State diagrams (WO-14): a `stateDiagram-v2` (or `stateDiagram`) block is
  a box diagram type (`state`). Start and end dots, choice, fork / join bar,
  descriptions as a compartment, composite states with concurrent regions (dashed),
  notes, classes, self transitions as a corner loop. Warnings for states no path from
  the start reaches (`state-unreachable`) and states with no way out
  (`state-dead-end`), marked on the drawing. Example `examples/maps/order-states.md`.
- **Contract** ER diagrams (WO-14): an `erDiagram` block is a diagram type (`er`, mode
  `tables`). Tables show their name, primary key and grain columns (the comment
  `"grain"`), the rest behind `+ N columns`; crow's-foot ends, cardinality in words;
  hub-and-spoke layout refined against crossings, shared widths, alignment. Colour by
  Role (fact, dimension, bridge: built-in classes, else inferred) or Class. Selecting a
  fact table states its grain. The node page lists the columns. Example
  `examples/maps/sales-warehouse.md`.
- **Contract** Scenarios (WO-14, then called walks): `## Scenario: <name>` after a state or ER diagram, steps
  `- A --> B : text`, played over the diagram by the sequence player; ER steps to a
  many side say "rows multiply here". New problem codes `scenarios-not-here`, `scenario-empty`,
  `scenario-syntax`, `scenario-not-step`, `scenario-gap`, `scenario-twice`.
- **Contract** Problem codes for state and ER blocks (`state-*`, `er-*`), all in
  `format/problems.json` with a sample each.
- **Contract** Atlas links keep any well-formed `mode` (the viewer checks it against the
  map's type), so new diagram types need no atlas change.
- The checker is split into modules beside `format/check_map.py`: `check_common.py`,
  `check_state.py`, `check_er.py`, `check_scenarios.py`.
- Diagram types may bring their own node geometry, node painting, page sections,
  colour categories and icons (hooks in `map-viewer/diagrams/index.js`); `boxes: true`
  replaces the viewer's checks for the flowchart type by name.
- Shop platform example: an order lifecycle (state, with a scenario) and the orders data
  (ER, with a join scenario), linked from the Orders service and the Orders database.

- Sequence player over a view: a message to itself loops round a top corner of its box
  (the one with less in the way), its number and label on a card like other messages.
- Sequences: a `par` block reads "parallel" on screen (timeline bracket, lifelines block
  title, step captions); the map keeps Mermaid's `par`.
- **Contract** Planned changes (WO-13): built-in classes `added`, `changed`, `removed` on
  nodes and arrows (by id), flowing down like a class but apart from a node's own class.
  A "Changes" colour-by (`changes`) colours them good / warn / bad, the rest muted;
  offered only when the diagram has planned changes, never where a map starts by itself
  and never kept. New problem codes `plan-class-twice`, `plan-class-reserved` (warnings).
  Example `examples/maps/shop-plan.md`.
- **Contract** `viewer.setPrefs({appearance, colourBy, look})`; `POST /api/show` and the
  `show` event take `colourBy`; `show.py --colour-by`; atlas links and shows apply it.
- **Contract** Changes since you looked (WO-13): the viewer keeps, per map and reader,
  what was seen (`<storageKey>-seen` in the browser) and marks what is new (sparkle) or
  changed (pencil) when a map is rewritten or opened again; what arrives glows, what
  goes shrinks out red, live reloads glide. Removals are listed on the parent's page and
  in the info panel's "Since you looked" section. Marks roll up to closed boxes, linked
  diagrams, crumbs, the view picker and the play button, and clear when the thing is
  opened. Not exported or printed. New CSS classes `mmv-p*`, `mmv-change`, `is-glow`,
  `is-gone`, `has-changes`.
- **Contract** Sequence diagrams (WO-12): a `sequenceDiagram` block is a diagram type.
  Participants (`participant`, `actor`, `box`), Mermaid's message arrows, `loop`, `alt`,
  `opt`, `par`, `critical`, `break`, `rect` blocks and notes. Calls are numbered in
  order; a reply takes the number of the call it answers (`3↩`). Shown as lifelines or
  a list of numbered steps. Example `examples/maps/job-race.md`.
- **Contract** The file opens to its first block, whatever its type: a file may be only
  a sequence.
- **Contract** `%% id: <id>` before a message names it; its details are a `## Details`
  entry keyed by the id.
- **Contract** `## Plays over` after a sequence links it to box diagram views
  (`- #<anchor> : <view>`). Every participant must be a node the view shows and every
  message must run along one of its arrows (either way). The viewer plays a linked
  sequence over the view: a play button by the view picker, a step bar (timeline with
  block brackets, back, play / pause, forward, stop, a switch to the lifelines), a side
  panel with each step's details, the view greyed until reached, numbered calls and
  replies in their own colours, a dot from sender to receiver, a camera that follows
  (a reader's pan pauses it). The node page lists "In sequences".
  `examples/maps/shop-layers.md` has a Checkout sequence over "Checkout (synchronous)".
- **Contract** Every further diagram must be reachable from the first by links (a
  `click`, a note link, a `## Plays over`). An unreachable one is a problem
  (`diagram-unreachable`); the viewer lists it in the view picker under "Not linked".
- **Contract** New problem codes: `diagram-unreachable`, `sequence-line-syntax`,
  `message-id-twice`, `message-id-no-message`, `plays-over-syntax`,
  `plays-over-unknown`, `plays-over-not-sequence`, `sequence-not-in-view`,
  `sequence-no-arrow`, each with a sample. `diagram-type` now names `sequenceDiagram`.
- **Contract** Viewer state gains `seq` (the sequence playing, by anchor, `main` for the
  first diagram) and `step` (from 1); mode `lifelines`. The atlas URL carries both.
- **Contract** `POST /api/show` (and `show.py --seq --step`) takes `seq` and `step`, and
  mode `lifelines`.
- **Contract** Themes: four optional roles for the player, `idle`, `idleLine`, `call`,
  `reply`, filled in quietly when a theme leaves them out.
- Sequence player over a view: the view's own arrow labels give way to the messages'.
  Each arrow the sequence uses gets room for two lines (the boxes glide apart while it
  plays): the latest call, numbered, and under it its return. The dot from sender to
  receiver now runs (it never started). The toolbars' menus and pop-ups (icon filter,
  theme) are no longer covered by the step panel.
- **Contract** A speed control on the sequence player's step bar: 5 to 2 seconds a
  step, in half seconds, kept with the reader's preferences (`stepSeconds`). Viewer
  option `sequenceStepSeconds` sets where it starts for a reader with no choice yet
  (same range, 3 by default).
- Keys while a sequence plays: left and right arrows step, space plays or pauses,
  Escape stops.
- **Contract** Trust marks: four named icon codes, `verified`, `inferred`, `hypothesis`,
  `unsourced` (Phosphor seals), with their meanings as key labels ("Checked in the
  source", "Reasoned from what was read", "A guess to test", "Source not found / not
  reviewed"). A node whose class
  brings an icon keeps it beside its marks.
- **Contract** Icons on arrows: `## Node icons` takes arrow ids (`- e7 : hypothesis`), in
  every view and diagram type. Drawn after the label; merged arrows show shared icons;
  the icon filter, the key, the arrow popover, list mode and the node page cover them.
  A `## Node icons` line naming no node and no arrow id is a warning.
- Example `examples/maps/slow-checkout.md`: an investigation marked with trust marks.
- **Contract** Map checker `format/check_map.py` (Python 3.9+, standard library), ported
  and brought up to the whole format. Strict: invalid Mermaid (brackets that are no
  Mermaid shape, duplicate ids; a shape of either diagram type is fine in both), invalid extension sections and any
  unresolved reference fail it. Valid Mermaid the viewer ignores (`style`, `linkStyle`,
  `click` callbacks, `id@{ ... }` arrow settings, a mind map node with no id) is a
  warning. Sample maps in
  `format/samples/` hold the checker and the viewer to the same answers;
  `scripts/check.sh` runs the checker over the examples and the samples.
- `garden.md` drops its link to a missing node.
- **Contract** Map problem codes: one list, `format/problems.json`, shared by the viewer
  (`map-<code>`) and the checker. Renamed viewer codes: `map-not-mindmap` is
  `map-diagram-type`, `map-empty` is `map-diagram-empty`, `map-large` is
  `map-large-map`, `map-cross-missing` is `map-cross-map-missing`; `map-note-anchor`,
  `map-relation`, `map-icon-legend` and the catch-all `map-warning` are split into
  finer codes. The parsed map has `problems` (`{code, message}`); `warnings` is unchanged.
  `format/samples/` holds a map per code; `scripts/check_samples.py` and the browser
  tests check both sides against them.
- Repo skeleton: `map-viewer/`, `atlas/`, `relay-server/`, `format/`, `examples/`, `docs/`.
- **Contract** First written: `docs/map-viewer-api.md`, `docs/map-source.md`,
  `docs/relay-server-api.md`, `docs/map-format.md`.
- `scripts/check.sh`: dependency rule between components and the clean check.
- MIT licence.
- **Map viewer** (`map-viewer/`), ported from the Simple Mind Maps viewer into an
  embeddable library: `mount(element, options)` from `map-viewer/index.js`. No server, no
  `location`, no ids; two viewers on one page work independently; `destroy()` cleans up.
  Every existing feature kept: mind map, org and list modes, semantic zoom and bars,
  drill-down with crumbs, search, icon filter, notes and pinning, related and cross-map
  links, expand states, looks, SVG/PNG export, print, keyboard shortcuts, live reload.
- **Contract** `docs/map-viewer-api.md` rewritten to what is built. Changes from the first
  draft: `options.theme` is a theme **id** (was: a name or a CSS URL); themes are objects
  (`options.themes`, `defaultTheme`, `addTheme`, `setTheme`, `applyTheme`); added
  `options.prefs` (`{theme, appearance, colourBy, look}`), `options.storageKey`, `options.showProblems`, `viewer.slot`,
  `viewer.ready`, `viewer.problems`, the `load` and `warning` events; the `error` event
  carries a problem object; note links always go to `host.openExternal`.
- Themes: data objects (colours as values, font as bytes) turned into CSS variables. A
  theme supplies palettes (category, level), roles and a font; each diagram type says
  what colour means ("Colour by": a mind map offers Branch and Level), so new diagram
  types need nothing new in themes. Theme, appearance, colour-by and look switches
  restyle without repainting. New built-in theme "Avagahana": light and dark, 13 category
  colours, six blues by level (each step lighter, so they read as an order), Atkinson Hyperlegible Next (OFL), loaded on demand.
  No work colours.
- **Contract** `docs/map-format.md`: named icon codes are coloured by theme swatches.
- Performance: shared text-width cache, single-line fast path, icons as shared
  `<symbol>`s, wheel and drag once per frame, colour by class. `map-viewer/test/perf.html`.
- **Relay server** (`relay-server/`), ported from the Simple Mind Maps server: same
  start-up line (`STATUS=… URL=…`), reuse of a running copy, background start, idle
  stop, `--maps-dir`, hidden-path filtering. New: `GET /api/info`,
  `GET /api/events` (Server-Sent Events: `tree`, `show`), `POST /api/show` and
  `relay-server/show.py` (the agent's "look here"), `--no-open` / `--no-shutdown`,
  `--atlas-dir` / `--viewer-dir` (served at `/` and `/map-viewer/`; the API works
  without them), the `AVAGAHANA_MAP_DIR` environment variable as the default maps folder
  (replaces `MINDMAPS_DIR`; no folder beside the code, none created: without one it
  refuses to start), a 10 s timeout for stalled requests. `relay-server/test_server.py`.
- **Contract** `docs/relay-server-api.md` rewritten to what is built. Changes from the
  first draft: capabilities are `tree, map, events, show, open, shutdown`; `POST
  /api/show` answers `{delivered}`; the atlas is served at `/` (not `/atlas/`).
- `map-viewer/test/index.html` (contract checks), `examples/embed.html`,
  `examples/two-viewers.html`, `examples/maps/`.
- **Atlas** (`atlas/`): the first page. Lists maps from a map source, hosts one viewer,
  owns the URL. Served by the relay server: maps from its API, live reload over
  Server-Sent Events (polling as a fallback), the agent's "look here" (`show` event),
  the power button, links opened in the default browser. Served by any static server:
  "Open folder" (File System Access API, Chromium), remembered between visits, polled
  for changes; no power button. The map picker (filter and folder tree) sits in the
  viewer's toolbar slot. Links keep the old `#/<path>?mode=&focus=&node=` shape, add
  `view=` and `env=`, and old `theme=` / `scheme=` / `look=` still set the looks.
  Same-host map links open in place. `atlas/test/index.html`.
- **Contract** `docs/map-source.md`: `detectServer(baseUrl)`; `serverSource(baseUrl, info)`
  takes the server's `/api/info`; `folderSource(handle)` takes the picked folder; new
  optional `onShow(fn)` for "look here".
- Map viewer: colouring by Level now colours each line with the level colour of the node
  it leads to (it was one line colour for the whole map, left over from the old
  three-blues scheme).
- **Contract** Themes: `lines` is gone. `lines.edge` was used only by the old one-colour
  level lines; `lines.relation` is now the role `roles.link` (CSS variable `--mmv-link`,
  was `--mmv-relation`): the colour of a link drawn over the diagram, such as a mind
  map's related links. A theme that still sets `lines` gets a warning.
- Map viewer: lines are solid (they were 80% opaque, which left seams and dark patches
  where lines overlap), one colour end to end (the colour of the node they lead to), and
  one path from box to box (the separate short joins at each end left a hairline seam).
  Mind map curves adapt to the drop: an even S for a short one (control points at 0.5
  of the gap, as before), blending smoothly to 0.7 for a drop of three child box heights
  or more, so long lines leave and reach their boxes level instead of at a slant.
- **Contract** The class `mmv-stub` is gone (no more joins); lines are `mmv-edge` only.
- **Map viewer, scene stage (WO-05).** Drawing is now parse > layout > scene > paint:
  `diagrams/mindmap/scene.js` turns the laid-out map and the view state into plain
  shapes (`{kind, id, x, y, w, h, cls, ...}`, no DOM), and `paint.js` only turns a scene
  into SVG, layer by layer (lines, nodes, related links) with the same partial repaints
  as before. The drawing is unchanged (checked against the old SVG for every example map
  and mode) and a little faster. Text measuring can be swapped, so tests use a fixed one.
- Accessibility: the drawing is named after the map and says what it shows; each node
  has a spoken name (label, level, children, collapsed, note); lines are hidden from
  screen readers.
- `map-viewer/test/scene.html`: scene snapshots of every example map in mind map (near
  and zoomed out), org and list mode, compared with `map-viewer/test/snapshots/`. The
  contract checks moved into `map-viewer/test/contract.js`.
- `scripts/browser_tests.py`: runs the viewer, scene and atlas test pages in headless
  Chrome (Python standard library only); `--update` writes new snapshots.
- New example maps: `examples/maps/shapes.md` (every node shape, left pins, long labels,
  icon legend, notes, related links) and `examples/maps/node-shapes.md` (one node per
  shape, each with a note showing how to write it).
- **Contract** `docs/map-format.md`: labels at most 150 characters a line and 1,000 in
  all (longer ones are shortened with "...", with a `map-long-label` warning); maps over
  5,000 nodes draw in full with a `map-large` warning that drawing may be slow.
- Map viewer: node shapes drawn as Mermaid draws them. A circle is a true circle (its
  diameter fits the label, which sits in the middle; selection and search marks are
  rings), a cloud a ring of outward round bumps, a bang a ring of inward curves meeting
  in sharp tips, its corners cut by one more curve. All three were pills before. Cloud
  and bang bumps sit at uneven gaps (seeded by the node's id, so a node keeps its
  shape), more of them for a longer label and bigger ones for a long node, with a
  minimum width so a short label still gets a full shape. Lines meet a bump or tip at
  the middle of each side.
- Map viewer: a node line with brackets that are not a mindmap shape (a flowchart
  rhombus `n5{"Decide"}`, `n6>"Flag"]`) keeps its id and label and is drawn as a plain
  node, with no viewer warning (it used to show the whole line as the label). The
  checker (WO-16) is to report it.
- **Contract** `docs/map-format.md`: the viewer draws Mermaid's flowchart shapes too
  (rhombus, stadium, subroutine, database cylinder, double circle, flag, parallelograms,
  trapezoids); not valid in a Mermaid mindmap, so the checker (WO-16) is to warn. Brackets
  that are no Mermaid shape draw a plain node. Node ids are strictly a letter, then
  letters, digits, `_` or `-` (as the format already said). `examples/maps/node-shapes.md`
  shows every shape.
- **Box diagrams (WO-06, with the graph layout).** A map whose Mermaid block is a `flowchart` is a
  box diagram: `subgraph`s are boxes inside boxes, nodes take any Mermaid shape, and the
  block's arrows (Mermaid's kinds: solid, dotted, thick, no head, both ends, circle,
  cross; labels either way; chains and `&`) are drawn as written. Modes: boxes and list.
  A layered layout per open box, inside out (ranks along the arrows, crossings cut by
  neighbour averages, loose boxes stacked), direction from the block or a box's own
  `direction`. `examples/maps/c4-shop.md`: a C4 container diagram with three views.
- **Relation views** in any map: `## Relations` is the default perspective, `## Perspective:
  <name>` adds one (a box diagram's own arrows are its default). A view picker shows
  when a map has more than one. In a box diagram each view is its own picture: only the
  boxes its arrows use and the boxes round them, laid out for it, animated between
  views. Arrows to hidden things go to the nearest box shown; several on one pair merge
  into one, labelled with a count, and clicking an arrow lists the relations behind it.
- Generic diagram types: `map-viewer/diagrams/index.js` lists them; each declares its
  parser, modes, colour-by, layout and scene. Shared parts moved to `map-viewer/model/`
  (labels, shapes, notes and sections, relations and views, the tree), `geometry.js`
  (node sizes and shapes) and `list.js` (list mode). Mind maps draw exactly as before.
- **Contract** `docs/map-format.md`: `flowchart` blocks (box diagrams), relation views,
  Mermaid's arrow kinds in relation lines, `## Node icons`. `docs/map-viewer-api.md`:
  modes per diagram type (`boxes` for flowcharts), `state.view` is live, `viewer.views`,
  `data-diagram` on the root, classes `mmv-frame`, `mmv-flow`.
- Scene snapshots cover every view of `c4-shop`, open and with its boxes closed; the
  contract tests cover flowchart parsing, views and the viewer following both.
- Map viewer: a double-click on an open / close dot or a related-links dot acts once
  (it used to open and close again). Atlas links keep a box diagram's `mode=boxes`.
- Box diagrams: a view's arrows no longer stack see-through fills in the outline look
  (fills mix with the background, so nested boxes stay readable in dark and light).
- List mode: a box diagram's outline starts at its top-level items (no row repeating
  the title), and each row's relations in the current view follow it, one per line,
  indented: an arrow for direction and kind (→ ← solid, ⇢ ⇠ dotted, ⇒ ⇐ thick,
  ↔ both), the node at the other end and the label; clicking one goes there. A
  collapsed branch says "N more" (was "+N"). The first crumb of a box diagram is
  "Whole map".
- SVG export for editors such as Illustrator: arrowheads use `orient="auto"` (with
  mirrored tail markers) instead of SVG 2's `auto-start-reverse`; text names one
  font, the theme font's real family (an editor reports every name of a CSS fallback
  list it lacks), and the embedded font carries that name; no `role`, `aria-*` or
  `data-*` attributes.
- SVG export: an arrow's wide invisible click line is left out (an editor drew it as a
  black line over the arrow), and colours are plain `rgb()` with any transparency as
  `fill-opacity` / `stroke-opacity`.
- SVG export: no markers. Every arrowhead, circle or cross end is drawn as plain shapes
  at the line's end, turned and scaled as the marker would be (editors such as
  Illustrator handle SVG markers poorly).
- **Classes** (`model/classes.js`): a class names what a node is; the theme colours it,
  the same colour by class name in every view, drill and map. Built in: `person`,
  `database`, `external` (muted, as C4 draws external systems), each with a default
  icon; a map adds or changes classes in a `## Classes` section (icon and label). Box
  diagrams colour by class to start with (Class, Group, Depth), with a colour key in the
  info panel; Group and Depth count from the map's top, so drilling in never recolours.
  Opening another diagram type starts on its own colour-by. `c4-shop` uses classes.
- **Contract** `docs/map-format.md`: classes and `## Classes`. `docs/map-viewer-api.md`:
  colour class `mmv-c<n>`; colour-by `class` for box diagrams.
- Classes: the classes of one map always get different colours (a class takes the slot
  its name gives, or the next free one, by name order); the built-in person and database
  slots stay theirs on every map. An open box shows its icons (its class's) in its title
  strip. `c4-shop`: web-app, api-gateway and business-service classes.
- Classes flow down: everything inside a box (or under a branch) has the box's class
  until a node names its own; the colour flows, the default icon stays on the nodes
  that name the class.
- Box diagrams have no "colour by" choice: the map decides (by class when it uses
  classes, else by its top-level boxes), with a colour key for either. Depth colouring is
  gone for box diagrams; mind maps keep Branch and Level. The info panel's markers leave
  out the mind map's related-links rows in a box diagram.
- **Contract** Box diagrams: the direction inside boxes alternates by depth (the top level
  and the inside of its boxes follow `flowchart LR` / `TB`, each level further in turns
  90 degrees); a box's own
  `direction` line still wins, and the boxes inside it turn from there.
- Box diagrams: arrows are routed by the layout and never cross a box or a box's title.
  An arrow is cut at each box border it crosses; each leg runs in the gaps between
  ranks on a track of its own (gaps grow to fit), passing ranks through lanes kept
  for it; arrows sharing a side of a box are spread along it. Straight runs with
  rounded corners.
- Box diagrams: arrow labels get room in their gap and sit on the arrow's own straight
  run, as near its start as fits, clear of boxes, box titles and borders, arrow heads
  and each other. Arrows turn near the far side of a gap, so no two runs share a line.
- Mind maps: related links lifted onto the same pair of drawn nodes merge into one,
  labelled with their count; click it to list them (as in box diagrams).
- SVG export leaves out screen-only controls: open / close dots, note icons and
  related-links dots.
- **Contract** Map format: `person` and `external` nodes are drawn as figures (no
  border, a large icon, the label under it); their icon can still be changed.
- **Contract** Map format: a `classDef`'s `stroke-dasharray`, `stroke-width` and
  `opacity` shape the outline of the nodes and boxes that name the class. Its colour
  and font styles stay ignored.
- **Contract** Map format: a file may hold several Mermaid blocks, each under its own
  heading; a flowchart node links into one with `click <id> "#<heading anchor>"`. The
  viewer marks such a node with the target's type icon and opens it on click; crumbs
  lead back.
- **Contract** Viewer API: state field `part` (which of the file's diagrams is shown);
  box diagrams gain the `layers` mode. Atlas URLs carry `part=`.
- **Contract** Relay HTTP API (addition): `POST /api/show` takes `part`; `show.py --part`.
  `mode` accepts `boxes` and `layers`.
- Box diagrams: `layers` mode, the top level as equal-width bands stacked top to bottom.
- **Contract** Map format: a `classDef` with `stroke-width: 0` removes the box (no
  border, no fill).
- Box diagrams: drilled into a box, its neighbours (the outside ends of the view's
  arrows, lifted to the outermost box outside it) are drawn faded round it, their arrows
  routed across its border.
- Box diagrams: plain boxes share one height (the tallest label, or the room their
  busiest side's arrows need); boxes in a rank are placed by their neighbours, so
  connected boxes line up and arrows run straight; ports slide into line with the
  other end; arrows with labels on one side sit a label's height apart, so labels stack
  and a gap needs only the widest label. Minimum gap between ranks 44 (was 64).
- Shapes: the rhombus is a square turned 45 degrees, as Mermaid draws it.
- Fix: the info and warnings panels close on a click outside them, like the other menus.
- Layers mode: bands are ranked by their arrows; bands with none between them share a row, every row as wide as the widest.
- **Contract** Map format: the inside of top-level boxes (the main system) runs left to right whatever the map's line (was: follows the map's line); `LR` maps unchanged.
- Box diagrams: children with no arrows between them line up across the way their box's arrows travel (its parent's flow), so each faces those arrows: a stack in an LR map, a row in a TB one.
- Box diagrams: in top-to-bottom gaps a labelled arrow's label sits on its sideways turn (those tracks a label's height apart), so labels no longer stack down the gap.
- Box diagrams: in a box running across, plain boxes in one column share the column's width.
- Box diagrams: open boxes side by side in a row share the row's height, their contents centred.
- **Contract** Map format: a class only a `classDef` names (not built in, not in `## Classes`) is a style: it shapes outlines but has no meaning, colour or key row.
- Info panel: sections fold open and closed (remembered per browser; Markers closed at first); a class's icon sits in its colour-key row, and "Icons on this map" lists only icons no class explains; "No class" counts plain boxes only.
- **Contract** Map format: coloured lines. Mermaid 11 arrow ids (`a e1@--> b`) with `class e1 <name>`, or `:::<name>` at the end of a view's relation line; a line class with a meaning takes a theme colour (line and ends) and a "Lines" row in the key; a `classDef` shapes it. Unclassed lines are unchanged.
- Search in a box diagram counts hits other views show ("5 found, 2 in other views"); going to one opens the first view that shows it, so views stay as written.
- **Contract** Map format: relation notes. A relation line may carry an arrow id (`- a e7@--> b : label`, Mermaid 11's form); a `## Details` note keyed by an arrow id is that relation's note (a note mark on the arrow; click to read). Merged arrows show no notes.
- **Contract** Map format: a node may link to several diagrams of the file (one `click <id> "#<anchor>"` line each); each gets its type icon.
- Node page: the note icon and a linked-diagram icon both open the node's page, grown from the node in its own outline over the faded drawing (note in full, arrows in and out with their notes, children, a thumbnail per linked diagram; no zoom or pan). A thumbnail grows into its diagram; going back runs the motion in reverse and returns to the view left. Hovering the note icon still shows the note. Retired: the click popover for notes, pinning and docking (the `pinned` preference is gone).
- **Contract** Viewer: below 320 × 360 pixels the viewer shows a "too small" message and nothing else.
- Notes: lines next to each other make one paragraph (or one list item, when indented under it), as in Markdown.
- Node page: thumbnails draw every label, like an export, fitted to the card; cards three across and two rows to the page's height; no "Opens" heading.
- Expand button: cycles one level, two levels, default, all (the map opens in default); a one-level state in every diagram type, with the same icons (a mind map's main branches, a box diagram's top-level boxes, closed); boxes or branches opened or closed by hand bring the button back, offering to open everything.
- Box diagrams, drilled in: the neighbours are the real ends of the arrows (Stock database, not Data), each inside faded frames of its outer boxes that hold only the linked ends; arrows between two neighbours are not drawn. Replaces lifting to the outermost box.
- Animation: drilling in or out, opening or closing a box or branch and the expand button and switching between drawn modes (mind map and org, boxes and layers) glide every box from where it was on screen to its new place (what leaves shrinks into the view's bottom left corner, what arrives grows out of it); then the lines, their ends and labels fade in together. Mind maps too. Double-clicking a drilled-in neighbour scenarios to it.
- Fix: a glide that changed the zoom level (labels to lines, or back) was cut short by a redraw; the drawing is now made at the zoom it will be seen at (fit first), so the first view of a map also has the right level of detail.
- Notes: a link to `#<heading anchor>` opens that diagram of the file (from the node's page with the thumbnail's motion); one to no diagram is plain text. Mind map related links with a note show a note mark.
- **Contract** Viewer state `page` (the node whose page is open), in the atlas URL (`&page=`) and the relay's `/api/show` and `show.py --page`. The node's page is a step of the crumbs: back from a diagram it opened stops at the page; the step into another diagram of the file is marked `#`.
- **Contract** Map format: deployments. `## Deployment: <env>[, <env>]` with a flowchart block of its own places the diagram's nodes (bare ids, with what is inside them) in infrastructure (new ids); unnamed nodes stay, emptied boxes go; arrows only between infrastructure. Warnings for unknown ids and for nodes placed in some environments but not others.
- **Contract** Viewer state `env`: the deployment shown (was always `null`). Deployments are views in the view picker, under "Where it runs"; `view` is `null` while one is shown. The node's page lists where the node runs in each environment.
- Node page: "In views" lists every relation view the node takes part in (the shown one marked); a click shows the node in that view. Search still opens the first view that shows a hit; the page reaches the rest.
- Node page as pictures: a connections strip (the node as on the map, what reaches it and what it reaches, labels, line styles and note marks; a box's parts drawn inside with the arrows landing on them; a mind map's parent, children and related links; top to bottom on a phone), then Opens, In views (real thumbnails, the node marked) and Runs on (nested frames side by side). Replaces the In / Out, Runs on and In views lists.
- Fix: the power button stays while a node page is open, on the info button's row (only zoom and expand hide).
