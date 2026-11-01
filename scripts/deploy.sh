#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON:-python3}"
command -v "$PYTHON_BIN" >/dev/null || { echo "Instale Python 3.10+ o defina PYTHON." >&2; exit 2; }
exec "$PYTHON_BIN" "$SCRIPT_DIR/manage.py" deploy "$@"
