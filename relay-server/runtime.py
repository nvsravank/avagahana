"""Shared CLI compatibility guard; no environment or dependency setup."""
import json
import sys


def require_python(shape='status', version=None):
    if (version or sys.version_info) >= (3, 9):
        return
    message = 'Python 3.9 or later is required; run with a newer python3.'
    print(json.dumps({'error': message}) if shape == 'json' else 'STATUS=failed ERROR=' + message)
    raise SystemExit(1)
