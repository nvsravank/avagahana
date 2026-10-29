#!/usr/bin/env bash
# Full behavioral validation. A supported browser is required (locally and in CI).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/check.sh"
python3 "$ROOT/relay-server/test_server.py"
python3 "$ROOT/scripts/browser_tests.py" --require-browser
