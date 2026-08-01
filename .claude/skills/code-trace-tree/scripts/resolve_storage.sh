#!/usr/bin/env bash
# Resolve Code Trace Tree project id + bound global XML for the current project.
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

xml_tag_value() {
  # Extract first occurrence of <tag>value</tag> from a file (single-line tags).
  local file="$1"
  local tag="$2"
  sed -n "s/.*<${tag}>\\(.*\\)<\\/${tag}>.*/\\1/p" "$file" 2>/dev/null | head -n 1
}

normalize_path() {
  local p="$1"
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      # Case-insensitive compare on Windows.
      printf '%s\n' "$(printf '%s' "$p" | tr '[:upper:]' '[:lower:]')"
      ;;
    *)
      printf '%s\n' "$p"
      ;;
  esac
}

project_root="$(find_project_root "$start" || true)"
if [[ -z "${project_root:-}" ]]; then
  echo "ERROR: could not locate project root from $start" >&2
  exit 1
fi

app_dir="$(global_app_dir)"
project_id=""
if [[ -f "$project_root/.idea/code-trace-tree.project.id" ]]; then
  project_id="$(tr -d '[:space:]' < "$project_root/.idea/code-trace-tree.project.id")"
elif [[ -f "$project_root/.vscode/code-trace-tree.project.id" ]]; then
  project_id="$(tr -d '[:space:]' < "$project_root/.vscode/code-trace-tree.project.id")"
fi

storage_xml=""
if [[ -d "$app_dir" ]]; then
  if [[ -n "$project_id" ]]; then
    while IFS= read -r -d '' xml; do
      pid="$(xml_tag_value "$xml" "projectId")"
      if [[ "$pid" == "$project_id" ]]; then
        storage_xml="$xml"
        break
      fi
    done < <(find "$app_dir" -maxdepth 1 -type f -name '*.xml' -print0 | sort -z)
  fi

  if [[ -z "$storage_xml" ]]; then
    target="$(normalize_path "$project_root")"
    while IFS= read -r -d '' xml; do
      stored="$(xml_tag_value "$xml" "path")"
      stored="$(normalize_path "$stored")"
      if [[ -n "$stored" && "$stored" == "$target" ]]; then
        storage_xml="$xml"
        break
      fi
    done < <(find "$app_dir" -maxdepth 1 -type f -name '*.xml' -print0 | sort -z)
  fi
fi

printf 'project_root=%s\n' "$project_root"
printf 'global_dir=%s\n' "$app_dir"
printf 'project_id=%s\n' "$project_id"
printf 'storage_xml=%s\n' "$storage_xml"

if [[ -z "$storage_xml" ]]; then
  echo "ERROR: no Code Trace Tree storage XML found. Open the project once in the IDE with the plugin installed." >&2
  exit 2
fi
exit 0
