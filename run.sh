#!/usr/bin/env bash
# Run grove as a single debug stack: one Node server hosts the Hono API, PTY, SSE, and the Vite app.
#
# Open http://localhost:13000 (or http://<this-host-ip>:13000 when GROVE_HOST=0.0.0.0).
# Override env vars before this script to change ports, host, or spaces.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

export GROVE_SPACES_ROOTS="${GROVE_SPACES_ROOTS:-$PWD/spaces:$HOME/spaces}"
export GROVE_DEFAULT_SPACE="${GROVE_DEFAULT_SPACE:-demo}"
export GROVE_PORT="${GROVE_PORT:-13000}"
export GROVE_HOST="${GROVE_HOST:-0.0.0.0}"
export GROVE_DEBUG="${GROVE_DEBUG:-1}"

echo "grove debug -> http://${GROVE_HOST}:${GROVE_PORT}  ·  spaces ${GROVE_SPACES_ROOTS} (default ${GROVE_DEFAULT_SPACE})"
exec node --import tsx packages/server/src/index.ts
