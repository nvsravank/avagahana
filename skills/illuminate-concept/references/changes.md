# Change marks: a pull request, a branch or a proposal

Full rules: `../../../docs/map-format.md`, "Planned changes" (the format's name for change marks).

Mark what is added, changed or removed with the built-in classes `added`, `changed`,
`removed`. They serve two requests:

- **A pull request or branch**: what it changes, from its diff.
- **A proposal**: a refactor, a migration, or how you would build something, before it is
  made. A plan you propose is a proposal: mark what it adds, changes and removes.

```
class charge,ledger added
class payh,e1 removed
class ord changed
```

## A pull request or branch

1. Find its two commits: the base (`git merge-base <base branch> <branch>`) and the head.
   Read the diff (`git diff <base>...<head> --stat`, then the files).
2. Draw **only the affected parts**, and the parts they connect to so the reader sees where
   they sit, not the whole system. A box diagram suits most; add a sequence when the change
   is to a flow.
3. Mark each part and arrow the diff adds, changes or removes.
4. Record both commits as revisions of one repository in `## Sources`
   (`references/evidence.md`), and give every marked part and arrow its evidence and a
   confidence mark (below).

For a whole release across a codebase, use the trace-architecture skill instead (one map per
release, compared as two versions).

## Evidence for each change mark

Every marked box and arrow that exists needs evidence; that is what lets the reader trust
the change. What a proposal adds does not exist yet: a plan or ticket is not evidence.

| Mark | A pull request or branch cites | A proposal cites |
|---|---|---|
| `removed`, `changed` | the base commit's lines | the current code's lines |
| `added` | the head commit's lines | no evidence: link the plan, ticket or design document in its note, with no confidence mark |

A `changed` mark in a pull request may cite both commits: the lines before and after.

## How to mark

- On arrows by their id (`api e1@--> psp`, then `class e1 removed`); in a mind map
  `n9("Compost"):::added`; on a perspective line `- a --> b :::added`.
- Mark each node: a class stays on the node that names it, so a whole new subsystem
  lists its box and every new thing in it (`class pay,charge,ledger added`). A box marked
  `removed` does not remove its children; if they move, say where in the box's note.
- Mark the arrows too: an arrow to a removed node is removed (or changed), and the
  checker warns about one left unmarked. A move goes in a note.
- What is removed stays in the text, so it can be drawn.
- A change mark never replaces a node's own class: `class ledger database` and
  `class ledger added` both hold.
- The viewer draws the marks in any colouring (a ringed +, ~ or − on each marked node
  and arrow). For colour too, open it in the Changes colouring:
  `show.py "<map>" --colour-by changes` (added green, changed amber, removed red, the
  rest muted).
- Do not fake change marks with `classDef` fills or colours.
- Sequence diagrams have no classes, so no change marks: say what changed in the
  message's note.

## What the reader has not seen yet: nothing to write

Rewrite the map as usual. The viewer compares, glows and dots what changed since this
reader last looked. Do not add classes or notes to say "this is new".
