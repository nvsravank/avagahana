# Changelog

What changed in each Avagahana version. The version is the plugin's (`version` in
`.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`); each one is a git tag
`vX.Y.Z`. Changes to a contract (viewer API, map source, server HTTP API, map format) are
marked **Contract**.

## Unreleased

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
