#!/usr/bin/env bash

set -euo pipefail

if [[ "$#" -ne 1 ]]; then
  printf 'Usage: %s <package-group-file>\n' "$0" >&2
  exit 1
fi

GROUP_FILE="$1"

if [[ ! -f "${GROUP_FILE}" ]]; then
  printf 'Package group not found: %s\n' "${GROUP_FILE}" >&2
  exit 1
fi

adb get-state >/dev/null

while IFS= read -r package || [[ -n "${package}" ]]; do
  [[ -z "${package}" || "${package}" == \#* ]] && continue
  adb shell su 0 pm enable "${package}" </dev/null
done <"${GROUP_FILE}"
