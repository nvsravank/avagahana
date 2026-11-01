# format

The map format and its checker. Spec: [`docs/map-format.md`](../docs/map-format.md).
Stands alone (Python 3.9+, standard library; reads `map-viewer/icons.json` and the
bundled Phosphor names).

```
python3 format/check_map.py <map.md> [<map.md> ...]
```

`check_map.py` is the command; the readers it uses sit beside it: `check_common.py`
(problems and labels), `check_state.py` (state diagrams, their paths), `check_er.py`
(ER diagrams) and `check_scenarios.py` (`## Scenarios:` sections).

Prints `OK`, or one line per problem (`file:line: problem`), and exits 1 on any. Strict:
every Mermaid block must be valid Mermaid for its type, every extension section valid,
and every reference must resolve (node and arrow ids, icon codes, diagram anchors, maps
that relations link to). Valid Mermaid that the viewer ignores is a warning
(`file:line: warning: ...`): `style`, `linkStyle`, `click` callbacks and other links,
an arrow's `id@{ ... }` settings, a mind map node with no id. The map still passes.
Run it on a map before showing it.

Every problem has a code in `problems.json`, with its level (an error fails, a warning
passes) and who reports it: `both`, `checker` (Mermaid validity the viewer draws anyway,
or another file) or `viewer`. The viewer reports the same codes as `map-<code>`.

`samples/` holds one small map per code (and a few clean ones, `good-*.md`). Its first
line names the codes it expects: `<!-- expect: note-unknown-id -->`.
`scripts/check_samples.py` (run by `scripts/check.sh`) holds the checker to them and the
browser tests hold the viewer: each reports exactly the expected codes on its side,
nothing outside the list, and every code has a sample. A new rule on either side needs a
code here and a sample, or the checks fail.

## Themes

`theme-slots.json`: every slot of a theme appearance, what it means and where the
viewer uses it, and which theme checks the viewer and `relay-server/themes.py check`
share (`checks.both`) or only the tool makes (`checks.checker`). `theme-samples/` holds
one sample theme per shared problem (and clean ones); each names the codes it expects.
`scripts/check_samples.py` holds `themes.py` to them and the browser tests hold the
viewer.
