#!/usr/bin/env bash
# Ask IntelliJ (Code Trace Tree plugin) to select trace points by id.
# With exactly one valid id, the IDE also navigates to the source location.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <trace-point-id> [trace-point-id...]" >&2
  exit 1
fi

start="."
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

global_app_dir() {
  case "$(uname -s)" in
    Darwin)
      printf '%s\n' "$HOME/Library/Application Support/code-trace-tree"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      local base="${LOCALAPPDATA:-}"
      if [[ -z "$base" ]]; then
        base="$HOME/AppData/Local"
      fi
      printf '%s\n' "$base/code-trace-tree"
      ;;
    *)
      local base="${XDG_CONFIG_HOME:-$HOME/.config}"
      printf '%s\n' "$base/code-trace-tree"
      ;;
  esac
}

project_root="$(find_project_root "$start" || true)"
if [[ -z "${project_root:-}" ]]; then
  echo "ERROR: could not locate project root from $start" >&2
  exit 1
fi

project_id=""
if [[ -f "$project_root/.idea/code-trace-tree.project.id" ]]; then
  project_id="$(tr -d '[:space:]' < "$project_root/.idea/code-trace-tree.project.id")"
elif [[ -f "$project_root/.vscode/code-trace-tree.project.id" ]]; then
  project_id="$(tr -d '[:space:]' < "$project_root/.vscode/code-trace-tree.project.id")"
fi
if [[ -z "$project_id" ]]; then
  echo "ERROR: no project id file. Open the project once in the IDE with the plugin installed." >&2
  exit 2
fi

signals_dir="$(global_app_dir)/signals"
mkdir -p "$signals_dir"
request="$signals_dir/${project_id}.select_trace_points"

{
  for id in "$@"; do
    trimmed="${id#"${id%%[![:space:]]*}"}"
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
    if [[ -n "$trimmed" ]]; then
      printf '%s\n' "$trimmed"
    fi
  done
} > "$request"

printf 'wrote=%s\n' "$request"
echo "IDE should select the listed trace points if the project is open with the plugin (signal TTL 60s)."
exit 0
