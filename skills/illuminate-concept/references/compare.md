# Comparing two versions of a map

Read this only when asked to compare: a release or security review, "what changed since
v1.4", before and after a migration.

## What the reader gets

Given the map and its earlier version, the viewer offers **Before** and **After** (a
toggle beside the view picker). Switching keeps the view and selection; what moved slides
from its old place to its new one, what went fades out, what came fades in. Both are
marked with the ringed +, ~ and − signs. A changes button beside the info button lists
what changed in the view shown: Removed, Added, Moved (`Orders service: EKS on Fargate →
Orders hosts, EC2 (Production)`), Changed (`Payments service: note`). The reader goes
view by view, deployment by deployment.

## Your part: keep ids stable

The two files are matched by id. The same thing keeps the same id in both versions; a new
id reads as one thing removed and another added. So when you update a map for a new
version:

- Keep every id that still names the same thing, even when its label changes.
- Move a node by moving its line (a new parent box, or a new box in a deployment), not by
  giving it a new id.
- Give arrows that matter an id (`a e7@--> b`) so a changed label or end reads as a change
  of that arrow.
- Do not add `added` / `changed` / `removed` classes for a comparison: a map with its own
  planned changes shows those instead.

## Commands

The earlier version can be any file, often from git:

```bash
git show v1.4:"<Topic>/<Name>.md" > /tmp/name-v1.4.md
python3 "<plugin root>/relay-server/show.py" "<Topic>/<Name>.md" --maps-dir "<maps folder>" --before /tmp/name-v1.4.md [--env Production]
```

The server keeps it in memory for that map (a reload keeps it; a restart drops it);
`--before none` forgets it. `--perspective before` opens the earlier version.

For a document: `render.py ... --before /tmp/name-v1.4.md [--perspective before|after]`
draws a marked picture. Plain pictures of each version need nothing new: render each file.

## The changes as data

`render.py ... --before /tmp/name-v1.4.md --report --out /tmp/x.svg` writes
`/tmp/x.svg.report.json`; its `changes` holds what the reader's changes list shows:
`{perspective, diagram, view, groups, views, diagramsAdded, diagramsRemoved}`, where
`groups` is `[{state: removed|added|moved|changed, lines: [text]}]` for the view drawn and
`views` the same for each view and deployment of that diagram (`--part` for another
diagram). Base a written review on it, then check each finding in the source.
