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

Start with an introduction (the checker warns without one). Its first sentence says what
the subject is and what it is for, in words a newcomer follows ("Caddy is a web server
whose headline feature is automatic HTTPS"); the reader may have seen nothing else. Then
say who the walk is for and why. Never number stops or their titles ("4. Startup"): the
panel and the reading page number every stop, and a second numbering disagrees. Each stop says what to notice
and why it matters, using the labels the reader sees on the boxes and arrows, and stands on
its own when read by scrolling. Optional Stop options go after the explanation:

````markdown
## Walkthrough: Payments for the security team

Payments takes a shop's card payments to an outside card provider. For the security
team: follow the boundary, card exchange and retry behavior.

### Perspective: Payment boundary

Orders coordinates checkout. Payments sends the card-charge request to the external
Card provider. Start with this boundary before following the full exchange.

#### Stop options
- Title: Start with the payment boundary
- Label: Boundary
- Notes: orders, e1
- Spotlight: payments, e1
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
- **Spotlight** lights the boxes and lines the stop is about (node ids, arrow ids like
  `e1`): they and the lines touching a box stay, the rest of the picture fades. Use it
  when a stop's words are about a few parts of a busy picture, on Diagram, Perspective
  and Deployment stops of flowcharts, architecture, lanes, ER and state diagrams; not
  with Point to, not on Sequence or Scenario stops.
- **Diagram** says which diagram a name belongs to when two diagrams use the same name.
- **Layout** shows the stop's place in another of its diagram's layouts (`org`,
  `layers`, `flow`, `balanced`, ...; `render.md`, the report's `layouts`). A stop without
  it shows the diagram's `## Layout:`. Use it rarely: every table moving between two
  stops costs the reader their bearings. Not on Sequence stops.

All options are optional; field names are case-insensitive. Blank lines do not end the
options: the next heading at the same level or above does.

## What the reader gets

A panel with the stop, its explanation, and Previous and Next. Each stop opens its
destination as written, with its perspective's open boxes; the reader may explore from
there and Return. The panel's Export walkthrough button makes one offline reading page of
every stop; the reader makes it, not you (there is no command). To send a walk, send a
snapshot (`render.md`, "Sending a map"): it holds the walk and its button. A sequence stop draws full lifelines there, and a scenario its highlighted path
with every step. So keep branching in sequences (`alt`, `par`) rather than inventing one
order, and put the essential explanation in the stop, not in a link.

## Verify the walk

Run the checker and fix every walkthrough error (an empty or repeated stop, an unknown kind
or destination, bad options). Then verify each stop's picture as SKILL.md says ("Verify the
picture"): `render.py --report` on each stop's perspective.
