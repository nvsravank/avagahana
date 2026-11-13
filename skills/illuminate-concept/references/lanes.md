# Lane diagrams (swim lanes)

A flowchart followed by `## Lanes`: each step in the lane of whoever does it. The full
rules are in `../../../docs/map-format.md`, "Lane diagrams".

## When

A suggestion, not a rule; what the user asks for wins.

- A process with hand-offs between people, teams or systems, where the question is who
  does each step: rows (horizontal swimlanes), one per actor.
- Decisions and loops that matter as much as who owns each step: a sequence diagram
  shows who but draws branches poorly; a lane diagram keeps the flowchart's diamonds.
- Who and when both matter (an approval that goes through stages): a grid, rows for who,
  columns for the stage.
- Not for the parts of a system and what calls what (a box diagram), nor for messages in
  time order between a few parties (a sequence).

## Writing one

```markdown
## Lanes

### Rows
- customer : Customer
- shop : Shop
- finance : Finance

### Columns
- ask : Request
- check : Approve

### Parent rows
- company : Our company : shop, finance

### Placement
- order : customer : ask
- stock : shop : check
- pay, refund : finance : check
```

- Every step goes in one Placement line: a step left out is an error (drawn in Other).
- Rows only: `flowchart LR`, steps placed by row alone (`- pay : finance`); the arrows
  give each step its stage. Columns only: `flowchart TB`.
- In a grid, steps that share a cell are drawn in the order written; write them in flow
  order. A grid step may name only its row; its neighbours give its column.
- Parents group lanes (`### Parent rows`, `### Parent columns`), to any depth; write a
  parent's lanes next to each other.
- No `subgraph` and no `## Deployment:` under a lane diagram. Classes, shapes, notes,
  icons, arrows and perspectives work as in any flowchart.
- The reader picks Flat or Zebra; `## Look:` is rarely needed.

Run the checker: every `lanes-*` problem is listed with its fix in the format doc.
