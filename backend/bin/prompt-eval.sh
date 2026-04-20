#!/usr/bin/env bash
# prompt-eval — wrapper around `promptfoo eval`
#
# Usage:
#   prompt-eval [--cache] [CONFIG_FILE]
#
# CONFIG_FILE may be an absolute path, a path relative to cwd, or a bare name
# like "Memory" (without the .config.yaml suffix).  The script must be run from
# the backend/ directory (matching the existing npm run dev convention).
#
# --cache   Pass through promptfoo's cache (default is --no-cache)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEST_DIR="${BACKEND_DIR}/test"
EVAL_DIR="${BACKEND_DIR}/evaluations"

# ── Arg parsing ───────────────────────────────────────────────────────────────

USE_CACHE=false
CONFIG_ARG=""

for arg in "$@"; do
  case "$arg" in
    --cache) USE_CACHE=true ;;
    *)       CONFIG_ARG="$arg" ;;
  esac
done

# ── Resolve config file ───────────────────────────────────────────────────────

resolve_config() {
  local input="$1"

  # Absolute path
  if [[ "$input" == /* ]]; then
    echo "$input"
    return
  fi

  # Relative path that already has the suffix and exists from cwd
  if [[ "$input" == *.config.yaml && -f "$input" ]]; then
    echo "$(cd "$(dirname "$input")" && pwd)/$(basename "$input")"
    return
  fi

  # Relative path without suffix — try appending it
  if [[ "$input" != *.config.yaml ]]; then
    local candidate="${TEST_DIR}/${input}.config.yaml"
    if [[ -f "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  fi

  # Relative path that exists under test/
  local candidate="${TEST_DIR}/$(basename "$input")"
  if [[ -f "$candidate" ]]; then
    echo "$candidate"
    return
  fi

  echo ""
}

CONFIG_FILE=""

if [[ -n "$CONFIG_ARG" ]]; then
  CONFIG_FILE="$(resolve_config "$CONFIG_ARG")"
  if [[ -z "$CONFIG_FILE" || ! -f "$CONFIG_FILE" ]]; then
    echo "⚠  Config file not found: $CONFIG_ARG" >&2
    CONFIG_FILE=""  # fall through to selector
  fi
fi

# ── Interactive selector ──────────────────────────────────────────────────────

if [[ -z "$CONFIG_FILE" ]]; then
  declare -a CONFIG_FILES=()
  while IFS= read -r line; do
    CONFIG_FILES+=("$line")
  done < <(find "${TEST_DIR}" -maxdepth 1 -name "*.config.yaml" | sort)

  if [[ ${#CONFIG_FILES[@]} -eq 0 ]]; then
    echo "No *.config.yaml files found in ${TEST_DIR}" >&2
    exit 1
  fi

  # Build display names (strip path and .config.yaml suffix)
  declare -a NAMES=()
  for f in "${CONFIG_FILES[@]}"; do
    NAMES+=("$(basename "$f" .config.yaml)")
  done

  while true; do
    echo ""
    echo "> Available Configs"
    echo ""
    for i in "${!NAMES[@]}"; do
      printf "%d. %s\n" "$((i + 1))" "${NAMES[$i]}"
    done
    echo "---"
    echo "q. Quit"
    echo ""
    read -r -p "Select a file [1-${#NAMES[@]}, q]: " SELECTION

    if [[ "$SELECTION" == "q" || "$SELECTION" == "Q" ]]; then
      echo "Exiting."
      exit 0
    fi

    if [[ "$SELECTION" =~ ^[0-9]+$ ]] && \
       [[ "$SELECTION" -ge 1 ]] && \
       [[ "$SELECTION" -le ${#CONFIG_FILES[@]} ]]; then
      CONFIG_FILE="${CONFIG_FILES[$((SELECTION - 1))]}"
      break
    fi

    echo "Invalid selection — please enter a number between 1 and ${#NAMES[@]}, or q to quit."
  done
fi

# ── Derive output path ────────────────────────────────────────────────────────

STEM="$(basename "$CONFIG_FILE" .config.yaml | tr '[:upper:]' '[:lower:]')"
OUTPUT_FILE="${EVAL_DIR}/${STEM}.results.json"

mkdir -p "${EVAL_DIR}"

# ── Run eval ──────────────────────────────────────────────────────────────────

CACHE_FLAG="--no-cache"
if [[ "$USE_CACHE" == true ]]; then
  CACHE_FLAG=""
fi

echo ""
echo "Running: promptfoo eval -c ${CONFIG_FILE} ${CACHE_FLAG} --output ${OUTPUT_FILE}"
echo ""

cd "${BACKEND_DIR}"

# shellcheck disable=SC2086
exec promptfoo eval -c "${CONFIG_FILE}" ${CACHE_FLAG} --output "${OUTPUT_FILE}"
