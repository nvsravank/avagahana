# Planned changes, and changes since the reader looked

Full rules: `../../../docs/map-format.md`, "Planned changes".

## Planned changes: yours to write

To show a proposal before it is made (a refactor, a migration), mark nodes and arrows
with the built-in classes `added`, `changed`, `removed`:

```
class charge,ledger added
class payh,e1 removed
class ord changed
```

- On arrows by their id (`api e1@--> psp`, then `class e1 removed`); in a mind map
  `n9("Compost"):::added`; on a view line `- a --> b :::added`.
- Mark each node: a class stays on the node that names it, so a whole new subsystem
  lists its box and every new thing in it (`class pay,charge,ledger added`). A box marked
  `removed` does not remove its children; if they move, say where in the box's note.
- Mark the arrows too: an arrow to a removed node is removed (or changed), and the
  checker warns about one left unmarked. A move goes in a note.
- What is removed stays in the text, so it can be drawn.
- They never replace a node's own class: `class ledger database` and
  `class ledger added` both hold.
- The viewer draws the marks in any colouring (a ringed +, ~ or − on each marked node
  and arrow). For colour too, open it in the Changes colouring yourself:
  `show.py "<map>" --colour-by changes` (added green, changed amber, removed red, the
  rest muted).
- Do not fake planned changes with `classDef` fills or colours.
- Sequence diagrams have no classes, so no planned changes.

## Changes since the reader looked: nothing to write

Rewrite the map as usual. The viewer compares, glows and dots what changed, and
remembers what this reader saw. You never learn what was seen. Do not add classes or
notes to say "this is new".

## Trust marks

Mark how sure the map is with the icons `verified` (read in the source, seen in a log,
tested), `inferred` (follows from what was read), `hypothesis` (a guess to check) and
`unsourced` (heard or assumed): on boxes and arrow ids in `## Node icons`
(`- e7 : hypothesis`), with `::icon(...)` in a mind map. Put the evidence in the note.
