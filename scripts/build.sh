#!/usr/bin/env bash
#
# Build both release VSIX packages for Code Trace Tree.
#
#   main/code-trace-tree-vscode-<version>.vsix     VS Code Marketplace
#   main/code-trace-tree-open-vsx-<version>.vsix   Open VSX
#
# Usage (from anywhere):
#   bash scripts/build.sh                 # install deps if missing, then package
#   bash scripts/build.sh --skip-install  # reuse existing main/node_modules
#
# Requires Node.js (node / npx), Yarn 4.x, and network access the first time
# `npx @vscode/vsce` runs (it is downloaded on demand, not a dependency).
# On Windows run it from Git Bash (or WSL): bash scripts/build.sh
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
MAIN_DIR="$ROOT_DIR/main"
EXPECTED_NAME="code-trace-tree-vscode"

SKIP_INSTALL=0

usage() {
  cat <<'EOF'
Usage: bash scripts/build.sh [--skip-install]

Compiles the extension and packages both release VSIX files:
  main/code-trace-tree-vscode-<version>.vsix     (VS Code Marketplace)
  main/code-trace-tree-open-vsx-<version>.vsix   (Open VSX)

Options:
  --skip-install   Do not run `yarn install`, even if main/node_modules is missing
  -h, --help       Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --skip-install)
      SKIP_INSTALL=1
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

require_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: '$1' not found on PATH. $2" >&2
    exit 1
  fi
}

require_tool node "Install Node.js: https://nodejs.org/"
require_tool npx "npm ships npx; reinstall Node.js: https://nodejs.org/"
require_tool yarn "Install Yarn 4.x: https://yarnpkg.com/"

if [ ! -f "$MAIN_DIR/package.json" ]; then
  echo "error: $MAIN_DIR/package.json not found" >&2
  exit 1
fi

cd "$MAIN_DIR"

VERSION="$(node -e "process.stdout.write(require('./package.json').version)")"
MARKETPLACE_VSIX="$MAIN_DIR/$EXPECTED_NAME-$VERSION.vsix"
OPEN_VSX_VSIX="$MAIN_DIR/code-trace-tree-open-vsx-$VERSION.vsix"

echo "==> Code Trace Tree v$VERSION"

if [ "$SKIP_INSTALL" -eq 0 ]; then
  if [ ! -d "$MAIN_DIR/node_modules" ]; then
    echo "==> Installing dependencies (yarn install)"
    yarn install
  else
    echo "==> Dependencies already installed (main/node_modules)"
  fi
elif [ ! -d "$MAIN_DIR/node_modules" ]; then
  echo "error: main/node_modules is missing but --skip-install was given" >&2
  exit 1
fi

echo "==> Removing stale v$VERSION VSIX files"
rm -f "$MARKETPLACE_VSIX" "$OPEN_VSX_VSIX"

echo "==> Install Dependency (yarn install)"
yarn install
echo "==> Compiling TypeScript (yarn run compile)"
yarn run compile

echo "==> Packaging VS Code Marketplace VSIX (yarn run package)"
yarn run package

echo "==> Packaging Open VSX VSIX (yarn run package:open-vsx)"
yarn run package:open-vsx

# package-open-vsx.mjs rewrites main/package.json and restores it in a finally
# block; if it was interrupted the Marketplace identity can be left behind.
CURRENT_NAME="$(node -e "process.stdout.write(require('./package.json').name)")"
if [ "$CURRENT_NAME" != "$EXPECTED_NAME" ]; then
  echo "warning: main/package.json name is '$CURRENT_NAME' (expected '$EXPECTED_NAME')." >&2
  echo "         Restore it with: git checkout -- main/package.json" >&2
fi

file_size() {
  node -e "const s = require('node:fs').statSync(process.argv[1]).size; process.stdout.write((s / 1024 / 1024).toFixed(2) + ' MB')" "$1"
}

echo
MISSING=0
for vsix in "$MARKETPLACE_VSIX" "$OPEN_VSX_VSIX"; do
  if [ ! -f "$vsix" ]; then
    echo "error: expected artifact was not created: $vsix" >&2
    MISSING=1
    continue
  fi
  printf '  %-58s %s\n' "${vsix#"$ROOT_DIR"/}" "$(file_size "$vsix")"
done

if [ "$MISSING" -ne 0 ]; then
  exit 1
fi

echo
echo "Done. Install with: code --install-extension <vsix>"
