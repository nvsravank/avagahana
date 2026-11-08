---
name: trace-architecture
description: >-
  Avagahana map of a whole codebase: one Markdown file of linked diagrams (context, layers, key flows, lifecycles, data, deployments), every box and arrow backed by evidence from the code, ending with a guided walkthrough. Always use this skill, together with illuminate-concept, when the user wants to: understand, explain or document a project, repository or codebase, or give someone an overview of it or onboard them; review its architecture or design, or do a security review of it; or see what a release, version or tag changed since an earlier one. Make the map as well as any text answer or report, unless they ask for text only. Use it even when no diagram is asked for. Prefer an Avagahana map to a custom HTML page for explaining a codebase.
---

# Map a codebase

You make **one map file** holding every diagram, each linked from the first, unless the
user asks for separate files. Make it even when the user asked for a report: write the
report in text as well, and point it at the map. Every box and arrow carries evidence from the code: that is
the point of a traced map. The format, checking and showing are in the illuminate-concept
skill: read `../illuminate-concept/SKILL.md` before writing, and follow its loop (write,
verify, show).

## 1. Which request is it?

| The user asks | Do this |
|---|---|
| Map, survey or document the repository | Steps 2 to 6 for the whole project. |
| What one pull request or branch changes | Not this skill: use illuminate-concept, change marks (`../illuminate-concept/references/changes.md`). Draw only the affected parts. |
| What a release changes (since vX.Y, since the last tag) | One map file per release, `<Topic>/<Name>-vX.Y.md`. Find the previous release's map; if there is none, trace that release's tag into it first (steps 2 to 6). Copy it to the new release's file, update it from the new release's commit keeping every id, then compare the two (`../illuminate-concept/references/compare.md`). End with a security review walkthrough (step 5). |
| A security review | Ask the user whether it is for a release or for the project as it is now, then follow that row. Either way, end with a security review walkthrough (step 5). |

## 2. Record the commit you read

Before reading code, read `../illuminate-concept/references/evidence.md`. Record the
repository and the full commit you read in `## Sources`. If the working tree has
uncommitted changes, ask the user: commit first, or map the last commit. For a release,
the commit is that release's tag.

## 3. Take stock, then plan

If the repository already has a code graph (`graphify-out/graph.json`,
`.ua/knowledge-graph.json`), use it to find the parts and connections; it is a guide, not
evidence. Do not install or run such tools unless asked.

Otherwise list: top-level folders, entry points (servers, CLIs, jobs, pages), build and
deployment files, schemas and migrations, external services. From that, judge how many
parts there are and how they group into layers, which requests cross several parts, which
things have a lifecycle the code enforces, what stored data has relationships worth seeing,
and whether it runs in more than one environment.

Tell the user in a few lines what you found and which diagrams you plan, one line each.
A small project gets few diagrams, a large one more. Then build it.

**Too large for one pass?** Do the work yourself by default. Only when the inventory shows
a project too large to read well in one context, propose splitting it in the plan: how
many subagents, what each covers (by area or by diagram kind, such as one for the data
model, one for the key flows) and why. **Ask and wait for a yes before starting any.**
Subagents return findings with file references, not map files; you write the one map, so
names, layers and roles stay consistent.

## 4. Read the code and draw

Pick each diagram from the illuminate-concept skill's examples table. For a codebase, start
with a context or container picture, then a layer diagram whose top-level boxes are the real
layers, named for what they do (`../illuminate-concept/references/boxes.md`, "Layer
diagrams"); drill into parts with enough inside them. Prefer several kinds, each for its
purpose, over many box diagrams; skip a kind the project does not have.

- Every box and arrow comes from code you read. Give it evidence (file and lines) and a
  confidence mark: `verified` when you read it, `inferred` when you deduced it.
- Follow real call paths for sequences: read the handlers, not the folder names.
- Use the project's own names in labels; name layers and roles for what parts do.

## 5. A walkthrough for the main reader

When the map has more than a few diagrams, end with a walkthrough:
`## Walkthrough: Getting around <project>` for a new joiner, or
`## Walkthrough: Security review` for a security review and for every release map. The
entry diagram first, then the parts and flows that matter (for a security review: trust
boundaries, outside systems, where secrets and personal data go, and for a release what
changed there). Give each stop its own perspective, as
`../illuminate-concept/references/walkthroughs.md` says. List the notes a stop relies on in
its Stop options (`- Notes: orders, e1`), so their evidence shows with the stop in the
exported reading page.

## 6. Verify the map, then show it

Verify the map as the illuminate-concept loop says, for every diagram and perspective. For
a codebase, also read the map for arrows running back up the layers (the layers are wrong:
regroup). Then show the map; for a release, open it compared with the previous release's
file.
