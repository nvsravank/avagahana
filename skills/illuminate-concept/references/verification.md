# Source provenance and verification

Verification is the default when using trace-architecture. For general diagrams it
is optional: use it when it adds useful provenance, at the agent’s discretion. Keep every Mermaid
block valid Mermaid: all provenance is ordinary Markdown outside the fences. Trust
marks remain in `## Node icons` (or existing mindmap icons). Never claim the checker
proves a citation supports the explanation.

## Capture what you actually inspect

For each repository, record its inspected full Git object ID, branch when attached,
and a credential-free browsable repository URL when available. Inspect `git status
--short`, `git rev-parse HEAD`, and `git symbolic-ref --quiet --short HEAD`. A branch
name is context, not a permanent revision. Inspect remote URLs without printing
credentials into reports, maps or logs; omit user information, queries and fragments
from a browsable URL. Never copy a credential-bearing remote verbatim.

If there are staged changes, tracked edits or untracked files, offer the user a choice:
commit the intended work first, or review the last committed revision. Do not commit
on their behalf unless authorized. For committed-only review, read files with
`git show <full-commit>:<path>`, list them with `git ls-tree`, or materialize that
commit into a separate temporary directory with `git archive`. Do not reset, stash,
overwrite or clean the user's working files. Run tests in that separate committed
tree if their result will support the recorded commit. Read dependencies/submodules
at their own captured revisions too; a test in a dirty folder is not verification
of a clean captured revision.

No remote: omit URL and retain Git identity. Detached HEAD: omit Branch. Not Git-backed:
explicitly say `Version control: none`, record Reviewed and the relative files;
optionally record a SHA-256 per file. A digest identifies bytes, but does not preserve
them. Do not initialize Git, invent a revision or bundle private source code.

## Sources (one registry for the whole map)

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

Lower-case aliases start with a letter, contain letters/digits/hyphens, and are
unique across repository and revision headings. One repository can have several
Revision headings, including different branches or Before/After investigations.
Name is optional (alias is the fallback). Version control defaults to git. Every
Git repository needs at least one revision and every revision a full Commit.
Reviewed is an ISO date or UTC timestamp. Descriptions are Markdown.

## Evidence belongs to its claim's existing note

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

Each Source bullet has optional indented File, Lines, Supports, URL and SHA-256
fields. Supports explains the relationship between the evidence and the claim.
Repeat a Source for several files or line ranges; the UI groups them under the same
revision. Lines is a positive line number or ordered range and requires File.
For non-Git evidence link `#repository-handbook` instead. File is relative with no
`..` segments. SHA-256, when present, is 64 hexadecimal characters.

Nodes and named arrows use the same note form. An arrow's Evidence must support that
relationship, not merely an endpoint's existence. A repository-only citation is
permitted but is less precise; prefer file/line evidence. Logs, traces and test
outputs are artifacts too: describe what they establish without pretending they
are source-code citations. Use an explicit stable HTTP(S) URL if appropriate.

GitHub, GitLab.com and Bitbucket.org file links are built from the full inspected
commit. Other hosts may use an explicit pinned URL. URLs cannot carry credentials or
queries. For Git evidence, any explicit URL must identify the same recorded commit.
No URL: the reader still gets the source identity, file and line range offline.
Every trust-marked node or arrow needs a nonempty Evidence section; every Evidence
section needs a trust mark. The checker treats either missing half as an error. The
viewer warns but still draws the map. Evidence may include ordinary Markdown explaining
inference, a hypothesis to test or the lack of a source; do not fabricate citations.
For verified source claims, include precise structured references whenever possible.

## Reader controls

The neutral Verification seal beside Info opens the trust legend and source list.
Show / Hide controls diagram marks. Clicking a mark opens only that claim's evidence;
there is no hover opening. Notes and node-page evidence retain the information and
node-page icons even when diagram marks are hidden. Several files in one source are
normal; do not duplicate repository records for them.

Visibility is never written to the map. Use `show.py <map> --trust-marks show|hide`
for an explicit initial setting. `render.py` and `pack.py` accept the same flag.
Interactive HTML exported by the reader keeps the current selection in separate
startup preferences; the map text remains unchanged. SVG, PNG and print preserve the visible marks as static pictures, without
clickable evidence links, popups or extra reference lists. Share the Markdown or HTML when the evidence must travel.
