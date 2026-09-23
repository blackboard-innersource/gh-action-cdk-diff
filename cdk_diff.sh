#!/usr/bin/env bash

# Primary function - diff two CDK cloud assembly directories
cdk_diff() {
  # Script args, the two directories to diff and temp directory
  BASE_ARG=$1
  HEAD_ARG=$2
  TMPDIR=${3:-$(mktemp -d)}

  if [ ! -d "$BASE_ARG" ]; then
    echo "The 'base' input is not a directory"
    return 1
  fi
  if [ ! -d "$HEAD_ARG" ]; then
    echo "The 'head' input is not a directory"
    return 1
  fi

  if [ -n "$CDK_DIFF_RENAME" ]; then
    BASE="base.cdk.out"
    HEAD="head.cdk.out"
  else
    BASE=$(basename "$BASE_ARG")
    HEAD=$(basename "$HEAD_ARG")
  fi

  if [ "$BASE" = "$HEAD" ]; then
    echo "The 'base' and 'head' inputs point to the same base directory names"
    return 1
  fi

  copy_templates "$BASE_ARG" "$TMPDIR/$BASE" "$HEAD_ARG" || return 1
  copy_templates "$HEAD_ARG" "$TMPDIR/$HEAD" "$BASE_ARG" || return 1
  to_yaml "$TMPDIR/$BASE" "$TMPDIR/$HEAD" || return 1

  cd "$TMPDIR" || return 1

  # Save the comment to this file
  OUTFILE="$TMPDIR/diff_comment.md"
  DIFFFILE="$TMPDIR/synth.diff"
  echo "comment_file=$OUTFILE" >> $GITHUB_OUTPUT
  echo "diff_file=$DIFFFILE" >> $GITHUB_OUTPUT

  if has_diff "$BASE" "$HEAD"; then
    echo "diff=1" >> $GITHUB_OUTPUT
    SUMMARY=$(diff_summary "$BASE" "$HEAD")

    # Determine how much room we have for the DIFF output
    SUMMARY_SIZE=$(diff_comment "$SUMMARY" "empty" | wc -c)
    BUFFER=${CDK_DIFF_COMMENT_BUFFER:-0}
    MAX_TOTAL=$((65450 - BUFFER)) # GH max comment size is 65536.
    REMAINING_LEN=$((MAX_TOTAL - SUMMARY_SIZE))
    # Comment will probably be too large, but lets not use negative numbers
    REMAINING_LEN=$((REMAINING_LEN < 10 ? 10 : REMAINING_LEN))

    OUTPUT=$(diff_output "$BASE" "$HEAD" "$REMAINING_LEN")

    diff_comment "$SUMMARY" "$OUTPUT" > "$OUTFILE"
    diff -u "$BASE" "$HEAD" > "$DIFFFILE"
    return 0
  fi

  echo "diff=0" >> $GITHUB_OUTPUT
  echo "<!-- gh-action-cdk-diff -->" > "$OUTFILE"
  echo ":star: No CloudFormation template differences found :star:" >> "$OUTFILE"
  touch "$DIFFFILE"
  return 0
}

# If two files or directories are the same or not
has_diff() {
  if diff -u "$1" "$2" > /dev/null 2>&1; then
    return 1
  fi
  return 0
}

# Diff two things and truncate it if necessary
diff_output() {
  LEN=${3:-"60000"}
  DIFF=$(diff -u "$1" "$2")
  if [ "${#DIFF}" -gt "$LEN" ]; then
    DIFF=${DIFF:0:$LEN}
    TRUNCATED=$({ echo ""; echo ""; echo '!!! TRUNCATED !!!'; echo '!!! TRUNCATED !!!'; echo '!!! TRUNCATED !!!'; })
    DIFF="$DIFF$TRUNCATED"
  fi
  echo "$DIFF"
}

# Diff two things in summary mode
diff_summary() {
  diff -q "$1" "$2"
}

# Create a comment about the diff summary and output
diff_comment() {
  cat <<EOF
<!-- gh-action-cdk-diff -->
:ghost: This pull request introduces changes to CloudFormation templates :ghost:

<details>
<summary><b>CDK synth diff summary</b></summary>

\`\`\`
$1
\`\`\`

</details>

<details>
<summary><b>CDK synth diff details</b></summary>

\`\`\`diff
$2
\`\`\`

</details>
EOF
}

# Copy template files (with any ignore key edits) to a new directory - renaming them to .yaml
# Templates that are byte-identical to their counterpart in the optional third directory
# cannot appear in the diff, so they are neither normalized nor copied
copy_templates() {
  if [ -d "$2" ]; then
    echo "The '$2' directory already exists"
    return 1
  fi
  mkdir "$2"
  SRC=${1%/}
  ALL_TEMPLATES=$(find "$SRC" -type f -name '*.template.json' | LC_ALL=C sort)
  TOTAL=$(printf '%s' "$ALL_TEMPLATES" | grep -c '')
  if [ -n "${3:-}" ]; then
    # Temp files rather than process substitution, which needs /dev/fd
    ALL_FILE=$(mktemp)
    IDENTICAL_FILE=$(mktemp)
    printf '%s\n' "$ALL_TEMPLATES" > "$ALL_FILE"
    identical_templates "$SRC" "$3" | LC_ALL=C sort > "$IDENTICAL_FILE"
    TEMPLATES=$(LC_ALL=C comm -23 "$ALL_FILE" "$IDENTICAL_FILE")
    rm -f "$ALL_FILE" "$IDENTICAL_FILE"
  else
    TEMPLATES=$ALL_TEMPLATES
  fi
  COPIED=$(printf '%s' "$TEMPLATES" | grep -c '')

  for TEMPLATE in $TEMPLATES; do
    NAME=$(basename "$TEMPLATE" | sed 's/\.template\.json/\.template\.yaml/')
    YAML_FILE="$2/$NAME"

    if [[ ! -z "$CDK_DIFF_IGNORE_KEYS" ]]; then
      JSON_DATA=$(cat "$TEMPLATE")
      JSON_FILE="$(mktemp)"

      for IGNORE_KEY in $(tr ',' '\n' <<< "$CDK_DIFF_IGNORE_KEYS"); do
        JSON_DATA=$(echo "$JSON_DATA" | jq --arg KEY "$IGNORE_KEY" -r 'del(.. | select(type == "object") | getpath($KEY | split(".")))')
        if [ $? -ne 0 ]; then
          echo "jq command failed"
          exit 1
        fi
        echo "$JSON_DATA" > "$JSON_FILE"
        TEMPLATE="$JSON_FILE"
      done
    fi

    jq --sort-keys . "$TEMPLATE" > "$YAML_FILE"
  done

  echo "📋 copied $COPIED of $TOTAL template files from $1"
  return 0
}

# List the templates under the first directory that are byte-identical to the
# same relative path under the second, using a single diff for the whole tree
identical_templates() {
  local base=${1%/} head=${2%/} line len
  LC_ALL=C diff -rqs -x 'asset.*' -- "$base" "$head" 2>/dev/null | while IFS= read -r line; do
    case $line in
      "Files $base/"*".template.json are identical") ;;
      *) continue ;;
    esac
    # "Files <base>/<rel> and <head>/<rel> are identical" holds <rel> twice around 27 fixed characters
    len=$(( (${#line} - ${#base} - ${#head} - 27) / 2 ))
    printf '%s\n' "${line:6:$((${#base} + 1 + len))}"
  done
}

# Used to convert JSON to YAML for shorter diffs
to_yaml() {
  BASEDIR="$1"
  HEADDIR="$2"
  TEMPLATES=$(find "$BASEDIR" -type f -name '*.template.yaml')
  PROCESSED=0

  for TEMPLATE in $TEMPLATES; do
    NAME=$(basename "$TEMPLATE")

    # Skip if either file does not exist
    if [ ! -f "$BASEDIR/$NAME" ] || [ ! -f "$HEADDIR/$NAME" ]; then
      continue
    fi

    # The files hold sorted JSON at this point, which yq rewrites as YAML
    if ! cmp --silent -- "$BASEDIR/$NAME" "$HEADDIR/$NAME"; then
      yq -p=json -o=yaml -i "$BASEDIR/$NAME" || return 1
      yq -p=json -o=yaml -i "$HEADDIR/$NAME" || return 1
      ((PROCESSED++))
    fi
  done

  echo "🔄 yq processed $PROCESSED template files"
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  if cdk_diff "$@"; then
    exit 0
  fi
  exit 1
fi
