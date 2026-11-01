# Walkthroughs (`## Walkthrough: <name>`)

A story for one audience told over the map's own items: a security review, a new
joiner's first hour, what a release changes. The map already holds the diagrams; a
walkthrough picks the ones that matter to that reader, puts them in the order the story
needs and says, at each stop, what to notice. Full rules: `../../../docs/map-format.md`,
"Walkthrough".

## When to write one

- The map has several diagrams and a reader would not know where to start or what
  connects them.
- One audience needs a path through it (security, operations, the team taking it over).
  Write one walkthrough per audience; do not try to serve everyone in one.
- Skip it for a map of one or two diagrams: their own notes are enough.

## Choosing and ordering the stops

- Each stop is one place in the map: `### Diagram: <heading>`, `### Perspective:
  <name>`, `### Deployment: <env>`, `### Scenario: <name>`, `### Join: <name>` or
  `### Sequence: <heading>`. The name is spelled as its heading gives it (the first
  diagram by its `# Title`).
- Start wide (the first diagram, the boundary), then narrow to what the audience cares
  about, then show it move (a scenario or a sequence), then where it runs or the data
  under it. End where the reader should act.
- Five to nine stops. Revisit a diagram through another perspective rather than adding a
  diagram the story does not need.
- Only items of this map. A walkthrough never crosses into another map.

## Writing the notes

- Two to four sentences, in Markdown: what to look at first, why it matters to this
  audience, and what to notice that the picture alone does not say.
- Name the boxes and arrows the reader sees on screen, as they are labelled.
- A link to a node's or diagram's anchor is fine (`[Payments](#payments)`); raw HTML is
  not shown.
- A stop with no note is allowed but wastes the stop.

````markdown
## Walkthrough: Payments for the security team

### Diagram: Shop platform

Start with the whole system. Card data leaves the shop only on its way to Payments.

### Perspective: Checkout (synchronous)

The calls on the way to payment, and which of them wait for an answer.

### Scenario: Soft decline, then paid

The retry a security reviewer will ask about first: the same token is charged twice.

### Deployment: Production

Where Payments runs, and the one route out to the card provider.
````

## What the reader sees

A panel on the right with the stop, its note, Previous and Next; it minimises to a tab.
The reader may explore inside a stop (open a box, a node's page, another mode) and stays
on it. Opening another stop's place moves the panel there; opening anything else shows
"You are off the path" with Return to the stop. Nothing plays by itself. The atlas and
the viewer's picker list walkthroughs first, under Walks.

## Checking

The checker reports `walkthrough-empty` (no stops), `walkthrough-twice` (a name used
twice), `walkthrough-stop-kind` (a stop that is not one of the six kinds) and
`walkthrough-stop-unknown` (a name this map does not have). Fix each before showing the
map.
