# Evidence and confidence marks

When a map needs evidence is in SKILL.md, "Evidence". This file says how to record it.
All of it is ordinary Markdown outside the Mermaid blocks, so every block stays valid
Mermaid. The checker proves the records are well formed, never that a citation supports
the claim: that is yours to get right.

## Record what you actually read

For each repository, record the full commit you read, the branch when there is one, and
a browsable repository URL when there is one. Find them with `git status --short`,
`git rev-parse HEAD` and `git symbolic-ref --quiet --short HEAD`. A branch name is
context, not a revision: the commit is what the evidence points at. Never copy a remote
URL that carries a user name, password or token; drop those, and any query or fragment.

If the working tree has staged changes, edits or untracked files, ask the user: commit
the work first, or map the last commit. Do not commit for them unless they say so. To read
only the committed tree, use `git show <commit>:<path>` and `git ls-tree`, or
`git archive` the commit into a temporary folder of your own. Never reset, stash,
overwrite or clean the user's files. A test that backs a claim runs in that committed tree,
not in a folder with uncommitted changes. Read submodules and dependencies at their own
recorded commits.

No remote: leave out the URL. Detached HEAD: leave out the branch. Not in Git: write
`Version control: none`, the date in Reviewed, and relative file paths; a SHA-256 per file
is optional. Never initialise Git, invent a revision or bundle private source code.

## Sources: one list for the whole map

```markdown
## Sources

### Repository: service

- Name: Shop service
- URL: https://github.com/example/shop

Checkout implementation.

#### Revision: service-reviewed

- Branch: main
- Commit: <full 40- or 64-character Git object ID>
- Reviewed: 2026-11-03

### Repository: handbook

- Name: Operations handbook
- Version control: none
- Reviewed: 2026-11-03

Local operational guidance.
```

- Aliases (`service`, `service-reviewed`) are lower case, start with a letter, use letters,
  digits and hyphens, and are unique across the map.
- One repository may have several revisions: two branches, or the two commits of a
  pull request (before and after).
- Name is optional (the alias stands in). Version control is Git unless stated. Every Git
  repository needs a revision, and every revision a full Commit. Reviewed is a date or a
  UTC time. A description under a heading is Markdown, as in notes.

## Evidence goes in the claim's own note

```markdown
## Node icons

- checkout : verified
- creates-order : verified

## Details

### <a id="checkout"></a>Checkout

Coordinates order creation and payment.

#### Evidence

- Source: [Shop service](#revision-service-reviewed)
  - File: src/checkout.py
  - Lines: 42-68
  - Supports: Creates an order before requesting payment.

- Source: [Shop service](#revision-service-reviewed)
  - File: src/payments.py
  - Lines: 105-128
  - Supports: Leaves a failed payment available for retry.
```

- Each Source may have File, Lines, Supports, URL and SHA-256 under it. Supports says how
  the cited lines back the claim. Repeat the Source for each file or line range; the reader
  sees them grouped by revision.
- Lines is one line or a range, and needs File. File is relative, with no `..`. SHA-256 is
  64 hexadecimal characters.
- For a source that is not in Git, link the repository (`#repository-handbook`).
- An arrow's evidence backs the connection, not just that both ends exist.
- Prefer file and lines; a repository alone is allowed but weak. A log, trace or test
  run is evidence too: say what it shows, without dressing it up as a code citation. A
  specification or document is cited by a stable HTTP(S) URL.
- Every confidence-marked box or arrow needs an Evidence section, and every Evidence section
  a confidence mark; the checker rejects either alone. For `inferred`, `hypothesis` or
  `unsourced`, the evidence says why: what it was deduced from, what would test it, or that
  there is no source. Never invent a citation.

## The four confidence marks

- `verified`: read in the source, seen in a log, or tested.
- `inferred`: follows from what was read.
- `hypothesis`: a guess to check. (A proposal's `added` parts are not claims about what
  exists: they carry no mark; link the plan in the note.)
- `unsourced`: heard or assumed, with nothing to cite.

## Links to the code

GitHub, GitLab.com and Bitbucket.org file links are built from the commit for you. For
another host, give an explicit URL pinned to the same commit: in a path segment, or in an
Azure Repos or TFS file link as `?path=/file&version=GC<full commit>`. A URL never carries
credentials or another query. With no URL, the reader still gets the repository, commit,
file and lines.

## What the reader can do

The Evidence button beside Info opens the confidence key and the list of sources, and
shows or hides the marks on the diagram; clicking a mark opens that claim's evidence. That
setting is never written in the map: `show.py <map> --trust-marks show|hide` sets it for the
open page (`render.py` and `pack.py` take the same flag). SVG and PNG pictures keep the
visible marks but no links: send the Markdown or a snapshot when the evidence must travel.
