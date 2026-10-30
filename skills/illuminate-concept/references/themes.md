# Themes: a brand or house style

Full rules: `../../../docs/map-source.md`, "Themes of the maps folder", and every slot in
`../../../format/theme-slots.json`.

A theme supplies colours and a font; the diagram decides what they mean (branches,
classes, levels). Themes of a maps folder live in its `.themes/` folder:

```
<maps folder>/.themes/
  brand.json        a theme: its id is the file name
  Brand-Regular.woff2, Brand-Bold.woff2    its font files
  settings.json     {"builtIn": true, "default": "brand", "logo": true}
```

`settings.json`: `builtIn: false` hides the built-in theme (with one theme left, the
viewer shows no theme picker); `default` the theme maps open in; `logo: false` hides the
atlas's logo.

## Make one from brand colours

```bash
python3 "<plugin root>/relay-server/themes.py" derive --accent "#0f766e" [--accent2 "#b45309"] \
  [--font Brand-Regular.woff2 Brand-Bold.woff2 ...] [--font-family "Brand Sans"] \
  --id brand --name "Brand" --description "What it is for" --write --maps-dir "<maps folder>"
```

- One or two brand colours (#rrggbb). They stay as they are when they read on the
  background (3:1); else they are darkened (light) or lightened (dark).
- It makes light and dark, eight category colours that stay apart for every kind of
  colour vision, a level ramp, roles, the viewer's buttons and the atlas bar.
- The font: one file per weight and style (400, 600, 700, and italics if there are any;
  a missing weight borrows the nearest). `--write` copies them into `.themes/`.
- Write a description that says what the theme is for (`Reports for the finance team`):
  agents choose a theme by it.

## Or write it by hand

`<id>.json`: `{"name", "description", "font": {"family", "faces": [{"file", "weight",
"style"}]}, "appearances": {"light": {...}, "dark": {...}}}`. An appearance needs `bg`,
`ink` and a `category` list; everything else is filled in (a warning says what). The
slots and what each colours: `format/theme-slots.json`.

## Check it, then show it

```bash
python3 "<plugin root>/relay-server/themes.py" check "<maps folder>/.themes/brand.json"
python3 "<plugin root>/relay-server/themes.py" list --maps-dir "<maps folder>"
python3 "<plugin root>/relay-server/show.py" "<Topic>/<Name>.md" --maps-dir "<maps folder>" --theme brand
```

- `check`: `ok: false` means the viewer cannot use it (fix the errors). Warnings: text
  under 4.5:1, colours under 3:1 on the background, category colours that look alike
  side by side under colour blindness, a missing font file or description. Fix them, or
  tell the user what is weak and why.
- `list`: every theme, its contrast and problems.
- `show.py --theme` switches the reader's page to it, to look at together.

A theme the user names by id that is not there: maps open in the default theme, with
a warning.

Only when the font chosen is not a public font (one whose licence lets anyone use it,
such as the fonts on Google Fonts), say once: the user is responsible for the licence
of fonts they use.
