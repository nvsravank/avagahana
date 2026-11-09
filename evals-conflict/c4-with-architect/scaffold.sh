#!/usr/bin/env bash
# The shared fixture, "repo" (evals/_fixtures/shop-repo.sh). The competing skill is not
# set up here: scripts/eval_conflict.sh adds it to a copy of the plugin, because eval runs
# do not load a workspace's .claude/skills.
exec bash "$(dirname "$0")/../../evals/_fixtures/shop-repo.sh" repo
