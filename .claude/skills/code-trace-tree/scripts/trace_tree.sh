#!/usr/bin/env bash
# Wrapper for trace_tree.py (search / add / move / delete).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if command -v python3 >/dev/null 2>&1; then
  exec python3 "$SCRIPT_DIR/trace_tree.py" "$@"
fi
exec python "$SCRIPT_DIR/trace_tree.py" "$@"
