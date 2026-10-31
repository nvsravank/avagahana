---
name: trace-architecture
description: Review a project, repository or codebase and explain it as an Avagahana map, one Markdown file holding the set of diagrams the project needs (structure, layers, key flows, lifecycles, data), read in an interactive viewer or rendered to SVG or PNG for a document. Use when the user asks to review, survey, document or map a project or repo, or to build diagrams or an architecture overview of a codebase. Builds on the illuminate-concept skill.
---

# Diagram a codebase

The output is **one map file** holding every diagram, linked from the first, unless
the user asks for separate files. Everything about the format, checking and showing
the map is in the illuminate-concept skill: read `../illuminate-concept/SKILL.md` and the references it names
before writing, and follow its loop (write, check, show, point).

## 1. Size the task first

Before reading deeply, take a quick inventory: the top-level folders, the entry points
(servers, CLIs, jobs, pages), the build and deployment files, the schemas and
migrations, the external services it calls. From that, judge:

- how many distinct parts there are and how they group into layers;
- which requests or jobs cross several parts and are worth playing step by step;
- which things have a lifecycle that the code enforces;
- whether there is stored data whose relationships need seeing;
- whether it runs in more than one environment.

Tell the user in a few lines what you found and which diagrams you plan, with one line
each on what each will show. The plan scales with the project: a small one gets few
diagrams, a large one more. Then build it.

## 2. Choose the diagrams by purpose

Use the illuminate-concept skill's table and its "How many diagrams, and which". For a codebase
this usually means some of:

- a context or container box diagram as the first diagram, the entry point;
- a layer diagram whose top-level subgraphs are the real layers, named for their
  responsibility, each node with a role class (see `../illuminate-concept/references/boxes.md`, "Layer
  diagrams");
- drill-in diagrams for the parts with enough inside them, linked by `click`;
- sequences for the flows that carry the system's behaviour, played over the box view
  they cross;
- state diagrams for lifecycles the code really enforces;
- an ER diagram where the data model's joins matter;
- deployments when environments differ.

Skip a kind the project does not have. Prefer several kinds, each for its purpose,
over many diagrams of one kind.

## 3. Work from the code

- Every node and arrow comes from something you read: name the file or symbol in its
  note, and mark it `verified` (read) or `inferred` (deduced) with the trust icons.
- Follow real call paths for sequences: read the handlers, not just the folder names.
- Use the project's own terms in labels, but layers and roles describe what parts do.
- Keep icons rare (the illuminate-concept skill's "Icons: sparingly").

## 4. Subagents: a last resort, with approval

Do the work yourself in one pass by default. Only when the inventory shows a project
too large to read well in one context, propose splitting it: say how many subagents,
what each covers (by diagram kind or by area, such as one for the data model, one for
the key flows), and why. **Ask the user and wait for a yes before starting any.** Each
subagent returns findings (parts, arrows, flows, tables, with file references), not map
files; you write the one map from them, so names, layers and roles stay consistent.

## 5. Finish

For a release or security review (what changed since a tag), keep every id of the map
from the earlier version, update it from the code, and compare the two with the
illuminate-concept skill's `references/compare.md` (Before and After, and the changes as
data from `render.py --before --report`).

Run the checker until it prints `OK`, show the map, and look at each diagram (a
screenshot if you have a browser). Redraw any that is dense, has arrows running back
up the layers, or shows nothing another diagram does not.
