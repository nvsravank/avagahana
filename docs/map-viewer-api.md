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
  theme: 'default',     // id of the starting theme
  themes: [ … ],        // theme objects from the host, below
  defaultTheme: true,   // false hides the built-in theme
  prefs: { … },         // starting looks from a link: {theme, appearance, colourBy, look}; not saved
  storageKey: 'avagahana-viewer-prefs',   // where preferences are kept, and (as `<key>-seen`) what
                                       // the reader has seen of each map; null keeps none
  showProblems: 'map',  // 'map' | 'all' | 'none': which problems show on screen
  sequenceStepSeconds: 3,   // a sequence's step while playing: 2 to 5 s, by halves
});
```

`map-viewer/index.js` is the only public entry. Other files under `map-viewer/` are
internal and may change without notice.

The viewer adds one element, `<div class="mmv">`, inside `element` and fills it; give
`element` a size. `mount` throws only for a programming mistake (no element).

## The viewer object

| Member | What it does |
|---|---|
| `viewer.load(text, path, context?)` | Show a map; returns a promise. The same `path` again is a live reload: the viewer keeps the user's place (focus, selection, open branches). |
| `viewer.setState(partial)` | Change state from outside, e.g. to point at a node. With `seq: null` the sequence stops first and the other fields still apply (`{seq: null, view: 'Events'}` stops and switches view). With a sequence to play, the sequence chooses its diagram and view, so only `seq` and `step` are read. |
| `viewer.state` | The current state (a copy). |
| `viewer.on(type, fn)` | Subscribe to an event; returns an unsubscribe function. |
| `viewer.ready` | Resolves when themes, stylesheet and font are ready. |
| `viewer.title` | The current map's title, or `null`. |
| `viewer.views` | The names of the map's relation views, the default first (`[]` when it has none). |
| `viewer.problems` | The current problems, below. |
| `viewer.themes` | `[{id, label}]` of the registered themes. |
| `viewer.addTheme(theme)` | Register a theme object; returns `{ok, problems}`. |
| `viewer.setTheme(id)` | Switch to a registered theme. The reader keeps their place: the diagram, view, step and camera (pan and zoom) stay as they were. |
| `viewer.setPrefs({appearance, colourBy, look})` | Change looks from outside (a link, the agent's show), not kept; a colour-by the map does not offer is ignored. E.g. `{colourBy: 'changes'}` for a plan (added in WO-13). |
| `viewer.slot` | An empty element at the start of the toolbar for the host's own button (atlas puts its map picker there). While empty, it shows the map title. |
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
this and learns nothing back. (WO-13.)

- The first look at a map marks nothing.
- New nodes and arrows get a sparkle badge, changed ones (label, place, class, icons,
  note, links, a deployment's place) a pencil badge, at a box's top-left (an arrow's:
  before its label, else at its middle). What a load brought glows once; what it took
  away shrinks out in red. Live reloads glide.
- A removed node or arrow marks the node it was under (an arrow: its start) with a
  pencil; that node's page lists "Removed since you looked". The info panel's "Since
  you looked" section counts new, changed and removed and names what went; the info
  button has a ring while there are any.
- Marks roll up as an outlined sparkle: on a closed box or collapsed branch with a
  change inside, on a node whose linked diagram has changes, on crumbs (changes outside
  the drilled-in box, or in a diagram back along the trail), and as a ring on the view
  picker and each view (or deployment) with changes this one does not draw, and on the
  play button for a sequence whose steps changed (marked as a whole).
- A mark stays until the reader opens the thing: selects the node or opens its page
  (its removals and its deployment places too), opens the arrow's note, plays the
  sequence; closing the info panel clears removals at the top of a diagram. Marks build
  up over several rewrites until then; a change undone before the reader looks leaves
  none.
- `storageKey: null` keeps nothing: marks then last for the visit only. A map with more
  than 2,000 things to compare is compared for the visit only (a host problem says so).
  Thumbnails never mark.
- Marks are per reader: SVG/PNG export and print leave them out.

## Events

| Event | Payload |
|---|---|
| `state` | The full state, after any change. |
| `load` | `{path, title, warnings}` after a map is shown. |
| `warning` | A problem of level `warning`, when it first appears. |
| `error` | A problem of level `error`, when it first appears. |

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
  the `accent`, `reply` the orange icon swatch;
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
      roles: { good, warn, bad, info, highlight, link, idle?, idleLine?, call?, reply? },
      chrome: { bg, border, hover, active, activeInk, shadow },
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
- **Font `data`**: an `ArrayBuffer`, a typed array, a base64 string, or a function
  returning a promise of one of those (for loading on demand).
- **Incomplete fonts:** a missing weight borrows the nearest face of the same style
  (warning); no italic face means the browser slants the regular one (warning); bytes
  the browser rejects drop that face (error); missing characters come from the
  fallback font. The fallback is the system font, with the built-in theme's font in
  front only when that theme is already loaded.
- Choosing a theme waits up to about 2 s for its font before measuring text; a later
  font measures and lays out once more.
- **Appearance, colour-by and look switches restyle without a repaint.** A theme with
  another font re-measures and lays out.
- The theme panel: Theme (only with more than one registered), Appearance (the theme's
  own, plus Auto when it has both), Colour by (from the diagram type), Look (fade /
  outline). Choices are saved under `storageKey`.

**Built-in theme** (`id: 'default'`, label "Avagahana"): light and dark; a 13-colour
category palette; the blue family as the level ramp; font Atkinson Hyperlegible Next
(OFL). Its font files load only when it is used. `defaultTheme: false` hides it.

### `applyTheme(element, theme, {appearance})`

Gives a host's own element the same theme variables and font (`--mmv-bg`, `--mmv-ink`,
`--mmv-font`, the palettes as `--mmv-cat-<n>` / `--mmv-lvl-<n>`, …), so the host's
interface matches the viewer. `theme` is an object, or
the id of a theme a viewer has registered. Returns `{ok, problems, release()}`.

### Classes a theme's `css` can use

Root: `.mmv` with `data-theme`, `data-appearance`, `data-colour-by`, `data-look`, `data-diagram` (`mindmap`, `flowchart`, `sequence`, `state` or `er`), `data-boxes` (a box diagram: flowchart, state, er). Drawing: `mmv-node`, `mmv-shape` (`is-solid`, `is-mark`: a state diagram's dots, bar and choice), `mmv-divider` (a state's description rule), `mmv-warn` (a state's path warning), `mmv-table` with `mmv-table-head`, `mmv-table-row`, `mmv-table-more`, `mmv-key`, `mmv-grain` (an ER table), `mmv-er-line` (`is-lit`), `mmv-er-end` (crow's-foot marks), `mmv-label`, `mmv-icon`, `mmv-edge`, `mmv-frame` (an open box), `mmv-frame-title`, `mmv-flow` (a box diagram's arrow; `is-dotted`, `is-thick`), `mmv-flow-label`,
`mmv-rel`, `mmv-rel-label`, `mmv-dot`, `mmv-rel-dot`, `mmv-bar`,
`mmv-mark-hit`, `mmv-mark-sel`. Colour classes: `mmv-c<n>` (a node's class: its slot, `mmv-cm` external, `mmv-c0` none; box diagrams), `mmv-k<n>` (category, 0 = centre),
`mmv-l<n>` (level), `mmv-d0|1|2` (depth band), `mmv-pa|pc|pr|p0` (planned change: added,
changed, removed, none; WO-13). Changes since you looked: `mmv-change` (`is-new`,
`is-changed`, `is-inside`), `is-glow`, `is-gone`, `has-changes` on controls. States: `is-dim`, `is-closed`,
`is-on`, `is-selected`, `is-hit`. Per node, `--n` and `--n-ink` hold its colour and
the text colour on it.

## Size

The viewer needs at least 320 × 360 pixels (its mount element). Smaller, it shows a
message saying so and nothing else, until it is made larger.

## Assets and network

- The viewer's own files (stylesheet, icons, built-in theme and its font) load
  relative to `import.meta.url`, never from a fixed path, and only when needed.
  Nothing goes to the internet.
- ES modules do not run from `file://`, so a page using the viewer needs some local
  web server (the relay server or any static one).
- Map icons are the bundled Phosphor set; hosts never supply icons.

## Accessibility

The drawing is an SVG group named after the map (`<title>`), with a `<desc>` saying
what it shows ("Mind map of 23 nodes."). Each node is an image with a spoken name:
its label, its level, how many children it has, whether it is collapsed and whether
it has a note ("Site, level 1, 3 children"). Lines and related links are hidden from
screen readers. List mode is the plain-HTML outline of the same map.

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
