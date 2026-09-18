#!/usr/bin/env bash

# Primary function - collect the templates of two CDK cloud assembly directories into one output directory
collect_templates() {
  # Script args, the two directories to collect from and the output directory
  BASE_ARG=$1
  HEAD_ARG=$2
  OUT_ARG=$3

  if [ ! -d "$BASE_ARG" ]; then
    echo "The 'base' input is not a directory"
    return 1
  fi
  if [ ! -d "$HEAD_ARG" ]; then
    echo "The 'head' input is not a directory"
    return 1
  fi
  if [ -z "$OUT_ARG" ]; then
    echo "The 'out' input is required"
    return 1
  fi

  copy_template_tree "$BASE_ARG" "$OUT_ARG/base" || return 1
  copy_template_tree "$HEAD_ARG" "$OUT_ARG/head" || return 1
  return 0
}

# Copy every *.template.json under a directory to a new directory - preserving relative paths
copy_template_tree() {
  SRC=${1%/}
  DEST=$2
  COUNT=0

  mkdir -p "$DEST" || return 1

  # The file list goes through a temp file rather than process substitution.
  # Lambda-based CodeBuild images have no /dev/fd, which bash needs for <(...),
  # and the loop would silently copy nothing.
  LIST=$(mktemp) || return 1
  if ! find "$SRC" -type f -name '*.template.json' -print0 > "$LIST"; then
    rm -f "$LIST"
    return 1
  fi
  while IFS= read -r -d '' TEMPLATE; do
    REL=${TEMPLATE#"$SRC"/}
    if ! mkdir -p "$DEST/$(dirname "$REL")" || ! cp "$TEMPLATE" "$DEST/$REL"; then
      rm -f "$LIST"
      return 1
    fi
    COUNT=$((COUNT + 1))
  done < "$LIST"
  rm -f "$LIST"

  echo "Copied $COUNT template files to $DEST"
  return 0
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  if collect_templates "$@"; then
    exit 0
  fi
  exit 1
fi
