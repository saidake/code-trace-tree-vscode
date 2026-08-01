#!/usr/bin/env bash
# Ask Code Trace Tree (JetBrains / VS Code) to select trace points by id.
# With exactly one valid id, the IDE also navigates to the source location.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <trace-point-id> [trace-point-id...]" >&2
  exit 1
fi

start="."
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

payload="$(mktemp)"
trap 'rm -f "$payload"' EXIT
{
  for id in "$@"; do
    trimmed="${id#"${id%%[![:space:]]*}"}"
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
    if [[ -n "$trimmed" ]]; then
      printf '%s\n' "$trimmed"
    fi
  done
} > "$payload"

for folder in .idea .vscode; do
  dir="$project_root/$folder"
  mkdir -p "$dir"
  request="$dir/code-trace-tree.select-request"
  cp "$payload" "$request"
  printf 'wrote=%s\n' "$request"
done

echo "IDE should select the listed trace points if the project is open with the plugin."
exit 0
