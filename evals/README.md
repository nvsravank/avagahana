# Skill evals

Each folder is one request a user might type. The checks say whether an agent given only
this plugin loaded the right skill, made an Avagahana map with the right picture for the
right reason, and gave the right evidence. Run them with `scripts/eval_skills.sh` (Claude
Code's `claude plugin eval`, Haiku by default) before changing a skill's description, its
examples table or its routes.

Prompts are written the way a user types them: they never name a skill, a map or a maps
folder, and end with "Save what you create in output/." So a pass means the skill's
description made the agent pick it, not the prompt.

A case is `<name>/case.yaml` (JSON, which is valid YAML) and `<name>/scaffold.sh`, which
sets up the starting folder from `_fixtures/shop-repo.sh`:

- `empty`: nothing.
- `repo`: `shop/`, a tiny git repository with tags `v1.0` and `v1.1` (on `main`) and a
  branch `order-events` (Orders publishes events; Payments, order status and a new
  Notifications service consume them).
- `billing`: `billing/schema.sql` (CREATE TABLE scripts) and `billing/reports.sql`.
- `deploy`: `deploy/k8s/` (production on EKS: a load balancer ingress, Orders and Payments in two namespaces, a network policy, a nightly CronJob; RDS, Redis, SQS and Stripe outside) and `deploy/staging/` (docker compose on one VM: nginx, RabbitMQ and stripe-mock in their place).
- `jobs`: `jobs/worker.py`, a queue worker that backs off, alerts and requeues.
- `map`: `maps/Shop/Shop platform.md`, an existing architecture map.

Graders:

- `skill`: the Skill tool loaded `illuminate-concept` or `trace-architecture`.
- `no-html`: no `.html` file was created (every case): the answer is a map, not a page.
- `wrote-md`: a Markdown file was written under `output/`.
- `picture` and the like: patterns in what the agent wrote to `output/` (its Write and
  Edit calls in the trace), such as `sequenceDiagram`, `## Relations` or `#### Evidence`.
- `marker`: the written map starts with the `<!-- Avagahana map` marker line.
- `reason`: a judge model reads the run against the case's PASS and FAIL lines. Long
  repository runs use `reply` instead: the judge reads only the final reply (it sees just
  the first and last 12 messages of a run, so it misses a map written mid-run).
- Cases tagged `negative` fail only when a map is drawn: `no-map` looks for Mermaid in the
  agent's own Write, Edit or Bash calls, not in skill text the trace holds once a skill loads; `communicate` cases are explanations the
  agent makes of its own (a plan it proposes, a trade-off it weighs).

Not covered: a request competing with another plugin's skill (only this plugin is loaded),
and a working tree with uncommitted changes.

On macOS, `/usr/bin/git` is a stub that needs Xcode's folders, which the eval sandbox
blocks: the agent then cannot run git. Install a standalone git (`brew install git`) for
the repository cases to run as a user's would.
