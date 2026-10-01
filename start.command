#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"

# Use a normal system runtime first; Codex's bundled runtimes are a local fallback.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
task_runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
if ! command -v node >/dev/null 2>&1 && [ -x "$task_runtime/node/bin/node" ]; then
  export PATH="$task_runtime/node/bin:$PATH"
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Install Node.js 22 LTS (including npm), then run this file again."
  read -r -p "Press Return to close. "
  exit 1
fi
task_python=""
for candidate in python3.12 python3.13 python3.14 python3 "$task_runtime/python/bin/python3"; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; sys.exit(sys.version_info < (3,12))' 2>/dev/null; then
    task_python="$candidate"
    break
  fi
done
if [ -z "$task_python" ]; then
  echo "Install Python 3.12 or later, then run this file again."
  read -r -p "Press Return to close. "
  exit 1
fi
if [ ! -x .venv/bin/python ]; then
  "$task_python" -m venv .venv
fi
if [ ! -d node_modules ]; then
  npm ci --cache "${TMPDIR:-/tmp}/milemark-npm-cache"
fi
.venv/bin/python -m pip install --quiet -r backend/requirements.lock.txt
npm run build
echo "Milemark is opening at http://127.0.0.1:8000"
echo "Keep this window open. Press Control-C to stop."
(sleep 2; open 'http://127.0.0.1:8000') &
PYTHONPATH=backend .venv/bin/python -m uvicorn milemark.app:app --host 127.0.0.1 --port 8000 --no-access-log
