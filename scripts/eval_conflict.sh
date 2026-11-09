#!/usr/bin/env bash
# eval_conflict.sh — the competing-skill evals (evals-conflict/), against a copy of this
# plugin with the stand-in competing skill added. Same options as eval_skills.sh.
# Costs model time; not part of check.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
rsync -a --exclude .git --exclude 'evals/results' --exclude 'evals-conflict/results' "$ROOT/" "$TMP/avagahana/"
cp -R "$ROOT/evals-conflict/solution-architect" "$TMP/avagahana/skills/solution-architect"
OUT="${EVAL_RESULTS:-$ROOT/evals-conflict/results}/$(date +%Y%m%d-%H%M%S)"
claude plugin eval "$TMP/avagahana" --eval-dir evals-conflict \
  --model "${EVAL_MODEL:-haiku}" \
  --ablation none --runs 3 --threshold 1 \
  --no-publish --trust-plugin \
  --scaffold --allow-tools Write Edit Bash \
  --output-dir "$OUT" "$@"
