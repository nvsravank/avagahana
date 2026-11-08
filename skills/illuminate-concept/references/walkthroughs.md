# Walkthroughs (`## Walkthrough: <name>`)

A story for one audience over the map's diagrams: a security review, a new joiner's
first hour, what a release changes. Use one when the reader needs help connecting
several pictures. Full rules: `../../../docs/map-format.md`, "Walkthrough".

## Choose the picture before writing the explanation

Every stop on a box or ER diagram is its own perspective, made for that stop: only the
arrows its point needs. The exception is an opening stop that shows the whole picture;
sequence, scenario and deployment stops already show one thing. Make several perspectives
of one diagram rather than copying the diagram. When the point needs certain boxes open,
list them under the perspective's `#### Perspective options` (`- Open: services`;
`boxes.md`). Fewer arrows do not always make a readable picture: look at each stop.

Each stop names one destination of this map with `### Diagram: <heading>`,
`### Perspective: <name>`, `### Deployment: <env>`, `### Scenario: <name>` or
`### Sequence: <heading>`, using the heading's exact name (the first diagram's is its
`# Title`). Start with the boundary, then the behaviour and data or deployment that
matter. Let the explanation set the number of stops.

## Write the explanation

An optional introduction says who the walk is for and why. Each stop says what to notice
and why it matters, using the labels the reader sees on the boxes and arrows, and stands on
its own when read by scrolling. Optional Stop options go after the explanation:

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

(These ids are in `examples/maps/shop-layers.md`.)

- **Title** is the stop's heading in the panel; it defaults to the destination's name.
- **Label** is the short name in the stop list; it defaults to the Title.
- **Notes** lists the notes the stop relies on (node, arrow or sequence-message ids of that
  diagram). They and their evidence show with the stop, so the reader need not click a
  small note or confidence mark to find them.
- **Diagram** says which diagram a name belongs to when two diagrams use the same name.

All options are optional; field names are case-insensitive. Blank lines do not end the
options: the next heading at the same level or above does.

## What the reader gets

A panel with the stop, its explanation, and Previous and Next. Each stop opens its
destination as written, with its perspective's open boxes; the reader may explore from
there and Return. The panel's Export walkthrough button makes one offline reading page of
every stop. A sequence stop draws full lifelines there, and a scenario its highlighted path
with every step. So keep branching in sequences (`alt`, `par`) rather than inventing one
order, and put the essential explanation in the stop, not in a link.

## Verify the walk

Run the checker and fix every walkthrough error (an empty or repeated stop, an unknown kind
or destination, bad options). Then verify each stop's picture as SKILL.md says ("Verify the
picture"): `render.py --report` on each stop's perspective.
