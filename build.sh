#!/usr/bin/env bash
# Build grove: install deps, then build the app (regenerates the bundled corpus/help via prebuild).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

pnpm install
pnpm build   # → packages/app/dist
echo "✓ built — packages/app/dist"
