# Theme styling

Themes remain data. Colours, palettes, fonts and `tint` keep their existing fields.
Optional appearance controls and a restricted CSS language allow a theme to change
appearance without supplying arbitrary stylesheets. The same policy is checked by
Python and JavaScript. Invalid optional values warn and use defaults; unsupported
CSS declarations are omitted. No unchecked source object is kept in snapshots.

## Appearance controls

Each `appearances.light` / `appearances.dark` may have a `style` object:

```json
{
  "style": {
    "boxRadius": 8,
    "panelRadius": 10,
    "buttonRadius": 6,
    "lineWidth": 1.8,
    "emphasisWidth": 3.4,
    "dashLength": 5,
    "dashGap": 4,
    "panelAlpha": 0.88,
    "tableAlpha": 0.82,
    "zebraAlpha": 0.8,
    "tableHeaderAlpha": 0.85,
    "stripeAlpha": 0.16
  }
}
```

All fields are optional. Omitting them preserves the existing appearance, including
look-specific differences. Numbers must be finite: radii 0–40 pixels; normal line
width 0.25–12; emphasis width 0.25–20; dash length/gap 1–40; alpha 0–1. Alpha affects
the named background/fill, never the text or whole viewer. `panelAlpha` sets the
alpha of `chrome.bg`, replacing any alpha already in that colour. `tableAlpha` is
for Flat ER tables; `zebraAlpha` for Zebra backgrounds; `stripeAlpha` for Zebra rows.
`boxRadius` applies to rectangular diagram shapes, not special state marks or
nonrectangular Mermaid shapes. Selection and search outlines retain their geometry.
Normal line widths leave thick/current/planned-change distinctions alone; emphasis
width adjusts thick/current sequence lines. CSS overrides below take precedence.

The existing `tint` is a **0–100 percentage**, separate from transparency: box fills
mix colour with an opaque background so nesting does not accumulate transparency.
State fading and playback opacity keep their existing behaviour.

`chrome.shadow` accepts `none` or one shadow: x/y offset, nonnegative blur, optional
spread, and a supported colour. Lengths are pixels (unit optional), bounded to ±100;
blur is 0–100. No `inset`, lists of shadows, variables or external resources.

## Restricted `css`

A theme's optional top-level `css` string keeps the documented viewer class hooks.
It is parsed to structured rules, checked, then regenerated under the current theme
root. The original text is never appended to the document. These rules apply both
to the viewer and to elements intentionally given that theme by `applyTheme`.

```css
.mmv-node > .mmv-shape {
  rx: 8px;
  stroke-width: 2px;
  fill-opacity: 0.25;
}
.mmv[data-appearance="dark"] .mmv-flow.is-dotted {
  stroke: #93c5fd;
  stroke-dasharray: 5 4;
}
```

The class names are real viewer hooks. For theme creators, the main families are:

| Target | Hooks |
|---|---|
| Nodes and groups | `.mmv-node`, `.mmv-shape`, `.mmv-frame`, `.mmv-frame-title` |
| Labels | `.mmv-label`, `.mmv-flow-label`, `.mmv-rel-label` (paint only; renderer controls typography) |
| Connections | `.mmv-edge`, `.mmv-flow`, `.mmv-rel`, `.is-dotted`, `.is-thick` |
| ER diagrams | `.mmv-table`, `.mmv-table-body`, `.mmv-table-head`, `.mmv-table-row`, `.mmv-er-line`, `.mmv-er-group` |
| Icons and marks | `.mmv-icon`, `.mmv-tile`, `.mmv-key`, `.mmv-grain`, `.mmv-spark` |
| Selection and search | `.mmv-mark-sel`, `.mmv-mark-hit`, `.is-selected`, `.is-hit`, `.is-dim` |
| Controls and text | `.mmv-pill`, `.mmv-panel`, `.mmv-note`, `.mmv-menu-item`, `.mmv-llabel`, `.mmv-lrow` |

The explicit class catalog in `style-policy.js` is authoritative; the viewer API
also describes the purpose of its drawing/state classes. Theme-wide colour settings
remain the usual way to colour all diagrams consistently.

Selectors:

- Classes from the explicit list in `map-viewer/themes/style-policy.js`, including
  the documented node, table, line, icon, change, reader-state and control classes.
  Numeric colour classes `mmv-cN`, `mmv-kN`, `mmv-lN`, `mmv-lcN` allow 1–3 digits.
- Compounds, descendant and direct-child (`>`) combinators, and comma-separated lists.
  Every compound starts with a class. An initial `.mmv` means the theme root;
  otherwise the selector targets descendants of that root.
- Enumerated `data-appearance`, `data-look`, `data-diagram`, `data-colour-by` and
  `data-boxes` attributes. Presence tests or double-quoted supported values only.
- `:hover`, `:focus-visible` and `:focus-within`.

No element selectors, ids, universal selectors, arbitrary attributes, sibling
combinators, selector functions, pseudo-elements, escapes or at-rules are accepted.

Properties and values:

| Properties | Accepted values |
|---|---|
| `fill`, `stroke` | A supported colour or `none` |
| `color`, `background-color`, `border-color` | A supported colour |
| `opacity`, `fill-opacity`, `stroke-opacity` | Number 0–1 |
| `stroke-width` | Number/pixels 0–20 |
| `stroke-dasharray` | `none`, or 1–8 nonnegative numbers/pixels up to 80, not all zero |
| `stroke-linecap` | `butt`, `round`, `square` |
| `stroke-linejoin` | `miter`, `round`, `bevel` |
| `rx`, `ry`, `border-radius` | Pixels 0–40 |
| `font-size` | Pixels 8–48 |
| `font-weight` | `normal`, `bold`, or 100–900 in steps of 100 |
| `font-style` | `normal`, `italic` |
| `letter-spacing` | Pixels −2–8 |

Colours accept hex, standard CSS colour names, bounded numeric colour functions and
`color-mix(in srgb, colour [percentage], colour [percentage])`, with nesting bounded.
There are no URLs, variables, custom properties, arbitrary functions, `!important`,
layout/position/display properties, content, filters or animations. Theme CSS cannot
load resources. Appearance alone can still obscure meaning (for example transparent
text); importing a theme is not an assurance of visual truth or accessibility.

CSS is limited to 32768 characters. Comments are allowed. Malformed rule structure,
forbidden syntax or an unterminated comment discards the sheet. An unsupported
selector discards its rule; an unsupported declaration discards only that declaration.
`theme-css` diagnostics explain the rejection. `theme-shadow` / `theme-control`
report invalid shadow/numeric controls. Accepted CSS is canonicalized in snapshots.
Unknown theme fields are not transported as opaque data.

SVG corners use `rx`/`ry`; HTML `border-radius` does not change an SVG path's geometry.
Typography overrides are for HTML controls/notes/list text; diagram text geometry
remains controlled by its renderer so measured label wrapping and layout stay consistent.

The executable policy data is a JSON-compatible JS module read as data by Python,
without executing JavaScript. `format/style-samples.json` supplies shared acceptance
and rejection fixtures. Any extension to this subset is a deliberate contract change.
