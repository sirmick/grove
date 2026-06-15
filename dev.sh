#!/usr/bin/env bash
# Launch grove for local/LAN dev: the Vite app on 0.0.0.0:$VITE_PORT proxying to the grove server
# on :$GROVE_PORT, serving every space under ./spaces (default space: demo). Ctrl+C stops both.
#
# Open http://localhost:13000 (or http://<this-host-ip>:13000 from another machine).
# Override any of the env vars below to change ports / default space.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

export GROVE_SPACES_ROOT="$PWD/spaces"
export GROVE_DEFAULT_SPACE="${GROVE_DEFAULT_SPACE:-demo}"
export GROVE_PORT="${GROVE_PORT:-13001}"
export GROVE_SERVER="http://localhost:${GROVE_PORT}"
export VITE_HOST="${VITE_HOST:-0.0.0.0}"
export VITE_PORT="${VITE_PORT:-13000}"

echo "grove → app http://${VITE_HOST}:${VITE_PORT}  ·  server :${GROVE_PORT}  ·  spaces ${GROVE_SPACES_ROOT} (default ${GROVE_DEFAULT_SPACE})"
exec pnpm --parallel --filter @grove/server --filter @grove/app dev
