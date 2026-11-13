# Changelog

What changed in each Avagahana version. The version is the plugin's (`version` in
`.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`); each one is a git tag
`vX.Y.Z`. Changes to a contract (viewer API, map source, server HTTP API, map format) are
marked **Contract**.

## Unreleased

## 0.2.0 (2026-11-13)

- **Contract** (map format, addition): lane diagrams (swim lanes). A flowchart followed by
  `## Lanes` (`### Rows`, `### Columns`, `### Parent rows`, `### Parent columns`,
  `### Placement`) is drawn as horizontal lanes, vertical lanes or a grid, with nested
  parent bands; no subgraphs. Fifteen `lanes-*` problem codes, checker and viewer.
- Lane diagrams read with Flat or Zebra lanes, lane names that stay at the edge while
  panning, a lane name that lights up its steps when clicked, and a List grouped by lane.
- Arrows in a lane diagram take the fewest turns that keep them clear of every step and
  of each other, leave by any side or a decision's corners, and keep the order the lines
  are written where nothing else decides.
- The skill suggests a lane diagram for a process with hand-offs between people, teams or
  systems.

## 0.1.5 (2026-11-12)

- **Contract** (map format, addition): the checker warns when a walkthrough has no
  introduction before its first stop (`walkthrough-introduction`). The introduction says
  what the subject is and what it is for, then who the walk is for.
- **Contract** (viewer API, change): the walkthrough reading page from `viewer.reading()`
  follows the reader's light or dark when the theme has both, pictures included. It
  opens in the exported appearance and is about twice as large.
- The skills: the agent writes the map and lets the viewer draw it, checks layout when
  an atlas page is open, and makes pictures, snapshots and reading pages when asked. One
  Commands table lists every command and what it needs.
- A map opens fitted, at the zoom where every label is drawn or closer; a larger map
  opens on its middle and the reader pans. Walkthrough stops do the same. Readers zoom
  out to 50%.
- Bold and links in notes and stop text run across a line break.
- Escape closes an open note or panel first, then a playing sequence.
- A sequence's step panel ends above the zoom controls.
- The diagram picker closes on a pick and on Escape.
- The reading page starts a large picture at a readable zoom, ready to pan, and Fit
  shows it whole. Long links wrap to the window.

## 0.1.4 (2026-11-10)

- The walkthrough panel scrolls a stop's words and its Notes together, so the notes
  follow the text and Previous and Next stay in view.
- The README starts with a quick install for Claude Code.

## 0.1.3 (2026-11-09)

- **Contract** (map format, addition): flowcharts support all of Mermaid's shapes,
  written as Mermaid 11.3+ node data, `id@{ shape: …, label: … }`, with every name and
  alias Mermaid accepts. An unknown shape name warns (`node-shape-unknown`); `icon:` and
  `img:` nodes are a checker error (`node-icon-image`).
- Each shape is drawn with its own outline, so arrows meet that outline in Outline and
  Poster. A diamond's arrows meet its corners, and a diamond takes its label's shape,
  from 1.5 times as tall as wide to 1.5 times as wide as tall.
- A new example, Flowchart shapes, shows every shape with its name.

## 0.1.2 (2026-11-08)

- illuminate-concept: when another skill conducts a review or analysis, Avagahana runs
  after it to present the result.
- Skill evals for C4 requests with and without a competing skill (`evals-conflict/`,
  `scripts/eval_conflict.sh`).

## 0.1.1 (2026-11-08)

- Walkthrough reading file: evidence starts folded behind its trust mark, with one
  show/hide-all switch; a stop's notes are numbered and its picture marked to match; a
  note already shown points back to it; one Sources list; wide pictures use the page
  width; the footer saves the map file itself.
- The walkthrough panel has buttons that open the stop's chosen notes.

## 0.1.0 (2026-11-07)

The first versioned release. Your coding agent writes a map in plain Markdown; you read
it as a diagram you can explore, share or put in a document.

### What you can do with it

- **Map a codebase with your coding agent.** The agent reads a repository, picks the
  views it needs, writes one linked map, checks it and shows you how the system works.
- **Explain and revise during a conversation.** Ask about a concept; the agent draws it,
  points you at the part that matters and redraws as the conversation moves.
- **Explore a maintained architecture.** Context, container and component levels with
  drill-down, kept up to date by the agent.
- **Follow a request across components.** A sequence plays over the structure it runs on.
- **Explain a lifecycle and walk its transitions.** State diagrams with nested states,
  concurrent regions and guided walks.
- **Explain database grain, cardinality and joins.** ER diagrams with column-level and
  composite links, grain, named joins and fan-out warnings; a SQL query drawn as how it
  is built.
- **Review a release or migration.** Before and After of the same map, with what was added,
  changed, renamed or removed, down to ER columns and joins.
- **Review a pull request or a planned change as a picture.** The affected parts marked as
  added, changed or removed, with evidence pinned to the commit.
- **Maintain a personal visual reference.** Your agent keeps the maps current; each
  reader sees what changed since they last looked.
- **Deliver a polished narrative explainer.** Walkthroughs with ordered stops and notes
  for an audience, with a reading export.
- **Send an explorable file to someone else.** One HTML file holds the map, its
  walkthroughs, the viewer, icons and fonts, and opens offline.
- **Put a branded figure in a document.** SVG or PNG in your own theme, ready for a
  document, slide or PDF.
- **Keep diagrams and reading on your own machine.** Maps are local files; the optional
  relay uses the Python standard library only.

### Capabilities

- **Agent workflow:** Claude Code and Codex plugin with two skills, illuminate-concept (a
  concept from a plain request) and trace-architecture (a whole repository); evidence from
  the sources the agent read, with file, line and pinned commit; a strict checker, a layout
  report and a redraw loop so the agent fixes its own drawing.
- **Map format:** Markdown with Mermaid and map extensions; automatic layout; one shared
  model reused across views, perspectives and deployment environments.
- **Diagram kinds:** boxes with nesting, relation views and layers; mind maps with mind
  map, org and list modes; sequence diagrams with lifelines and playback; state diagrams;
  ER diagrams with table classes and groups; SQL query overviews.
- **Reading:** drill into nested boxes without losing context; links between diagrams;
  node pages with connections, neighbours, views, deployments and plays; whole-map
  search; state and ER walks; authored walkthroughs; list and outline reading modes.
- **Changes and confidence:** added, changed and removed marks; Before and After
  comparison; per-reader "since you looked" marks; trust marks linking each claim to its
  source.
- **Delivery:** live refresh that keeps the reader's place; single-file interactive HTML;
  SVG with full labels and embedded fonts; PNG; print or save as PDF from the browser; an
  embeddable ES-module viewer; custom themes with palettes, roles, fonts and light and dark
  looks; official AWS, Azure and Google Cloud architecture icons.
- **Versioning:** the plugin carries its version, so a pull or plugin update notices a new
  release. **Contract** (viewer API): `VERSION` from `map-viewer/index.js`. **Contract**
  (server HTTP API): `/api/info` and `/api/ping` `version` is the plugin's version. Packed
  files say "Built with Avagahana 0.1.0"; the atlas shows the version on its mark.
- **Licence:** MIT; cloud icons under their vendors' terms.
