# Compare two versions of a map

Read this to compare two versions of one map: what a release changes (a map file per
release, `<Topic>/<Name>-vX.Y.md`), what changed since an earlier version, or before and
after a migration. A map made for a pull request uses change marks instead
(`changes.md`).

## What the reader gets

Given the map and its earlier version, the viewer offers **Before** and **After**.
Switching keeps the view and selection; what moved slides to its new place, what went fades
out, what came fades in, and each is marked with a ringed +, ~ or −. The reader's changes
list names what was removed, added, moved and changed in the view shown, view by view and
deployment by deployment.

## Your part: keep ids stable

The two files are matched by id. The same thing keeps the same id in both versions; a new
id reads as one thing removed and another added. So when you update a map for a new
version:

- Keep every id that still names the same thing, even when its label changes.
- Move a node by moving its line (a new parent box, or a new box in a deployment), not by
  giving it a new id.
- Give arrows that matter an id (`a e7@--> b`) so a changed label or end reads as a change
  of that arrow.
- Do not add change marks (`added`, `changed`, `removed`) for a comparison: a map with its
  own change marks shows those instead.

### ER diagrams: columns and renames

Columns are matched by name in each table (type, keys, comment and grain compared); a
column connection by its id, its column pairs compared as a set. A schema migration is
just this: the current schema as the earlier version, the proposed one as the map.

- A renamed column reads as one removed and one added unless you say it in the later
  file, new name first (never guess one):

  ```markdown
  ## Renames
  - ORDER.customer_id was cust_id
  ```

- Remove the Renames lines once the change has landed: a line whose old name is not in
  the earlier version is ignored with a warning.
- Steps, backfills and order of a migration go in the table's or column's note, not in
  the diagram.

## Commands

The earlier version is any map file. For releases it is the previous release's file in the
maps folder:

```bash
python3 "<plugin root>/relay-server/show.py" "<Topic>/<Name>-vX.Y.md" --maps-dir "<maps folder>" --before "<maps folder>/<Topic>/<Name>-vX.W.md" [--env Production]
```

An earlier version that exists only in git: write it to a temporary folder of your own
(`mktemp -d`), never a fixed name another agent may be using:
`git show <tag>:"<Topic>/<Name>.md" > "$tmp/<Name>.md"`.

The server keeps it in memory for that map (a reload keeps it; a restart drops it);
`--before none` forgets it. `--edition before` opens the earlier version.

For a document: `render.py ... --before <file> [--edition before|after]` draws a marked
picture. Plain pictures of each version need nothing new: render each file.

## The changes as data

`render.py ... --before <file> --report --out <file>.svg` writes `<file>.svg.report.json`;
its `changes` holds what the reader's changes list shows:
`{edition, diagram, view, groups, views, diagramsAdded, diagramsRemoved}`, where
`groups` is `[{state: removed|added|moved|changed, lines: [text]}]` for the view drawn and
`views` the same for each perspective and deployment of that diagram (`--part` for another
diagram). Base a written review on it, then check each finding in the source.
