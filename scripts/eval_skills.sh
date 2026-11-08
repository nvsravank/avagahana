#!/usr/bin/env bash
# eval_skills.sh — does an agent pick the right skill, picture and evidence for a request?
#
# Runs the cases in evals/ with Claude Code's `claude plugin eval`, on Haiku by default
# (a small model that still picks right is the bar). Not part of check.sh or CI: every run
# costs model time and needs `claude` logged in (`claude auth login`).
#
#   scripts/eval_skills.sh                   every case, once each
#   scripts/eval_skills.sh --case 'pr-*'     some cases
#   scripts/eval_skills.sh --runs 3          each case three times
#   EVAL_MODEL=sonnet scripts/eval_skills.sh
#
# Each case starts in an empty folder holding maps/ and a small git repository, shop/
# (evals/_fixtures/shop-repo.sh, run with --scaffold). The agent may write files and use the
# shell (git, the map checker) inside the run's OS sandbox.
#
# Results go to $EVAL_RESULTS (default evals/results/, ignored by git): keep dated runs
# outside the repository. Extra arguments go to `claude plugin eval`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${EVAL_RESULTS:-$ROOT/evals/results}/$(date +%Y%m%d-%H%M%S)"
exec claude plugin eval "$ROOT" \
  --model "${EVAL_MODEL:-haiku}" \
  --ablation none --runs 1 --threshold 1 \
  --no-publish --trust-plugin \
  --scaffold --allow-tools Write Edit Bash \
  --output-dir "$OUT" "$@"
