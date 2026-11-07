#!/bin/bash
# ************************************************************************************
# Copyright (C) 2022-2026 rhctl Contributors
#
# SPDX-License-Identifier: Apache-2.0
# ************************************************************************************
# Upgrade the extension version in main/package.json.
#
# Sets the `version` field to the specified semantic version.
#
# If exists, overwrite — safe to re-run.
#
# Usage:
#   ./scripts/upgrade.sh <version>
#
# Required Parameters:
#   <version>
#       The new semantic version to set (e.g. `1.3.8`).
#         Example version values: `1.3.8`, `1.4.0`, `2.0.0`
#
# Optional Parameters:
#   -h, --help
#       Show this help (default: off).
#         Example values: (none)
#
# Override Parameters:
#   (none)
#
# Since : 1.3.7
# Date  : Mon Nov 9, 2026
# ************************************************************************************

# ========================================================================= Parameter
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
MAIN_DIR="$ROOT_DIR/main"
PACKAGE_JSON="$MAIN_DIR/package.json"

NEW_VERSION=""

# ========================================================================= Methods
usage() {
  cat <<'EOF'
Usage: bash scripts/upgrade.sh <version>

Sets the `version` field in main/package.json to the specified semantic version
and commits the change to the main branch.

Arguments:
  <version>   The new semantic version to set (e.g. `1.3.8`).

Options:
  -h, --help  Show this help
EOF
}

require_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: '$1' not found on PATH. $2" >&2
    exit 1
  fi
}

is_semver() {
  # Accepts versions like 1.3.8, 1.4.0, 2.0.0 (major.minor.patch)
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# ========================================================================= Argument parsing
if [ "$#" -eq 0 ]; then
  echo "error: missing required argument <version>" >&2
  usage >&2
  exit 1
fi

for arg in "$@"; do
  case "$arg" in
    -h | --help)
      usage
      exit 0
      ;;
    *)
      if [ -z "$NEW_VERSION" ]; then
        NEW_VERSION="$arg"
      else
        echo "error: unexpected argument: $arg" >&2
        usage >&2
        exit 1
      fi
      ;;
  esac
done

if [ -z "$NEW_VERSION" ]; then
  echo "error: missing required argument <version>" >&2
  usage >&2
  exit 1
fi

if ! is_semver "$NEW_VERSION"; then
  echo "error: '$NEW_VERSION' is not a valid semantic version (expected major.minor.patch, e.g. 1.3.8)" >&2
  exit 1
fi

# ========================================================================= Environment checks
require_tool node "Install Node.js: https://nodejs.org/"
require_tool git "Install Git: https://git-scm.com/"

if [ ! -f "$PACKAGE_JSON" ]; then
  echo "error: $PACKAGE_JSON not found" >&2
  exit 1
fi

cd "$ROOT_DIR"

# ========================================================================= Ensure main branch
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Switching to main branch..."
  git checkout main
fi

# ========================================================================= Read current version
cd "$MAIN_DIR"

CURRENT_VERSION="$(node -e "process.stdout.write(require('./package.json').version)")"

if [ "$CURRENT_VERSION" = "$NEW_VERSION" ]; then
  echo "Version is already $NEW_VERSION — nothing to change."
  exit 0
fi

# ========================================================================= Update version
node -e "
const fs = require('node:fs');
const path = './package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.version = process.argv[1];
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
" "$NEW_VERSION"

# ========================================================================= Commit
cd "$ROOT_DIR"

git add main/package.json
git commit -m "chore: upgrade version to $NEW_VERSION"
git push origin main

# ========================================================================= Final output
echo "Upgraded main/package.json version: $CURRENT_VERSION -> $NEW_VERSION"
echo "Committed and pushed to main branch."