# Walkthroughs (`## Walkthrough: <name>`)

A story for one audience over the map's diagrams: a security review, a new joiner's
first hour, what a release changes. Use one when the reader needs help connecting
several pictures. Full rules: `../../../docs/map-format.md`, "Walkthrough".

## Choose the picture before writing the explanation

Prefer named perspectives that select the relationships needed for the takeaway.
Reuse a diagram through several purposeful perspectives rather than duplicating it.
For flowcharts, use `#### Perspective options` with Open container IDs and optional
Focus when the explanation needs particular subgraphs open. See `boxes.md`.
Filtering arrows alone does not guarantee a readable picture: inspect the result.

Each stop names one existing destination with `### Diagram: <heading>`,
`### Perspective: <name>`, `### Deployment: <env>`, `### Scenario: <name>` or
`### Sequence: <heading>`. Use the heading's exact name; the first
diagram uses its `# Title`. Start with the boundary, then the relevant behavior and
data or deployment. Let the explanation determine the number of stops. Walks stay
inside one map.

## Write one explanation for live and reading forms

An optional introduction states the audience and purpose. Each stop explains what
to notice and why it matters, using visible box/arrow labels. Write enough to stand
alone when read by scrolling. Add optional Stop options after the explanation:

````markdown
## Walkthrough: Payments for the security team

Follow the boundary, card exchange and retry behavior.

### Perspective: Payment boundary

Orders coordinates checkout. Payments sends the card-charge request to the external
Card provider. Start with this boundary before following the full exchange.

#### Stop options
- Title: Start with the payment boundary
- Label: Boundary
- Notes: orders, e1
- Diagram: Shop platform

### Sequence: Checkout

Read the calls and replies in order, including the retry branch.

#### Stop options
- Label: Exchange
- Notes: m-charge

### Scenario: Soft decline, then paid

The retry reuses the idempotency key, so a repeated request does not create another
charge. Follow both attempts through to confirmation.
````

These IDs/destinations are in `examples/maps/shop-layers.md`. Title defaults to the
destination name; Label defaults to Title/name. The reading eyebrow repeats Label
before the diagram kind, matching its navigation. Notes explicitly includes existing
note-bearing node, arrow or sequence-message IDs from the owning diagram, including
their evidence. Do not rely on the reader clicking a tiny note or trust icon. Diagram
qualifies a name reused across diagrams; prefer it when names are ambiguous.
All fields are optional; old walkthroughs still work. No JSON blocks or new delimiters.
Subsection/field names are case-insensitive. Blank lines do not end options: the next
same-level or shallower heading does. Put explanation before Stop options.

## Reader behavior

The walkthrough panel shows the stop, explanation, Previous and Next, and minimises
to a tab. Previous/Next/Return open the authored destination, applying its perspective
defaults. Exploring inside it (opening boxes, drilling, notes, another mode) stays on
track. Another stop's destination moves to that stop; unrelated destinations show
"You are off the path" and Return. No expansion mismatch tracker or extra reset button.

The panel's Export walkthrough icon makes a complete offline HTML reading document.
The current camera/expanded boxes do not affect it. The selected theme and effective
light/dark appearance are frozen; diagrams/fonts are embedded. A horizontal section
strip sticks after the intro scrolls away; the branded footer stays visible. Reading
requires only scrolling. Zoom/pan/Fit are optional, and wheel/touch scrolling normally
moves the document until Pan is explicitly enabled on an enlarged diagram.

A Sequence stop uses full native lifelines, even when live playback runs over a
perspective. Keep its native version readable too. A Scenario uses a static highlighted
path plus every derived step and ER fan-out warning. Keep branching semantics in
native sequences; do not invent one execution order for alternatives/parallelism.
Included notes and evidence are visible inline. Essential explanation belongs here,
not in a separate export narrative or in a link the reader must open.

## Check the authored story and output

Run the checker; fix walkthrough-empty/twice/stop-kind/stop-unknown and new
walkthrough-options/reference or perspective-options errors. Then inspect the real
walk: first entry, Previous/Next, and Return after another diagram should restore the
same authored picture. Exploration stays on track.

When browser capability is available, inspect the exported reading HTML too: every
stop, full sequences/scenarios, notes/evidence, theme, narrow layout, fixed footer and
sticky strip. Fix crowding with useful perspectives and source explanations. If you
cannot inspect output, say it is unverified; do not present a mockup as a tested export.
