#!/usr/bin/env bash
# Ask Code Trace Tree (JetBrains / VS Code) to reload global storage for this project.
set -euo pipefail

start="${1:-.}"
if [[ -f "$start" ]]; then
  start="$(dirname "$start")"
fi
start="$(cd "$start" && pwd)"

find_project_root() {
  local cur="$1"
  while [[ -n "$cur" && "$cur" != "/" ]]; do
    if [[ -d "$cur/.idea" || -d "$cur/.vscode" || -e "$cur/.git" ]]; then
      printf '%s\n' "$cur"
      return 0
    fi
    cur="$(dirname "$cur")"
  done
  return 1
}

project_root="$(find_project_root "$start" || true)"
if [[ -z "${project_root:-}" ]]; then
  echo "ERROR: could not locate project root from $start" >&2
  exit 1
fi

# Epoch milliseconds: GNU date supports %3N; otherwise use seconds * 1000.
if ms="$(date +%s%3N 2>/dev/null)" && [[ "$ms" != *N ]]; then
  :
else
  ms="$(date +%s)000"
fi

for folder in .idea .vscode; do
  dir="$project_root/$folder"
  mkdir -p "$dir"
  request="$dir/code-trace-tree.refresh-request"
  printf '%s\n' "$ms" > "$request"
  printf 'wrote=%s\n' "$request"
done

echo "IDE should reload Code Trace Tree data if the project is open with the plugin."
exit 0
