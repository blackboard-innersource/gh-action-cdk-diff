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

  copy_templates "$BASE_ARG" "$TMPDIR/$BASE" || return 1
  copy_templates "$HEAD_ARG" "$TMPDIR/$HEAD" || return 1
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
    MAX_TOTAL=65450 # GH max comment size is 65536.
    REMAINING_LEN=$((MAX_TOTAL - SUMMARY_SIZE))
    # Comment will probably be too large, but lets not use negative numbers
    REMAINING_LEN=$((REMAINING_LEN < 10 ? 10 : REMAINING_LEN))

    OUTPUT=$(diff_output "$BASE" "$HEAD" "$REMAINING_LEN")

    diff_comment "$SUMMARY" "$OUTPUT" > "$OUTFILE"
    diff -u "$BASE" "$HEAD" > "$DIFFFILE"

    if [[ -n "$CDK_DIFF_ENABLE_COMMENTS" ]]; then
      create_or_update_pr_comment "$OUTFILE" "$DIFFFILE"
    fi
    return 0
  fi

  echo "diff=0" >> $GITHUB_OUTPUT
  echo ":star: No CloudFormation template differences found :star:" > "$OUTFILE"
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
copy_templates() {
  if [ -d "$2" ]; then
    echo "The '$2' directory already exists"
    return 1
  fi
  mkdir "$2"
  TEMPLATES=$(find "$1" -type f -name '*.template.json')
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

    cp "$TEMPLATE" "$YAML_FILE"
  done
  return 0
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

    if ! cmp --silent -- "$BASEDIR/$NAME" "$HEADDIR/$NAME"; then
      rain fmt -w "$BASEDIR/$NAME"
      rain fmt -w "$HEADDIR/$NAME"
      ((PROCESSED++))
    fi
  done

  echo "🌧️  Rain processed $PROCESSED template files"
}

create_or_update_pr_comment() {
  local comment_file=$1
  local diff_file=$2

  local pr_number
  pr_number=$(jq -r .pull_request.number "$GITHUB_EVENT_PATH")

  if [ -z "$pr_number" ]; then
    echo "No pull request number found in GITHUB_EVENT_PATH"
    return 1
  fi

  local repo_url
  repo_url=$(jq -r .repository.html_url "$GITHUB_EVENT_PATH")

  # Check if the comment already exists
  local existing_comment_id
  existing_comment_id=$(gh pr view "$pr_number" --json comments | jq --arg diff_file "$diff_file" -r '.comments[] | select(.body | contains("CDK synth diff") and .body | contains($diff_file)) | .id')

  if [ -n "$existing_comment_id" ]; then
    # Update the existing comment
    echo "Updating existing comment $repo_url/pull/$pr_number#issuecomment-$existing_comment_id"
    gh pr comment "$pr_number" --edit --comment-id "$existing_comment_id" --body-file "$comment_file"
  else
    # Create a new comment
    echo "Creating a new comment for pr number $repo_url/pull/$pr_number"
    gh pr comment "$pr_number" --body-file "$comment_file"
  fi
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  if cdk_diff "$@"; then
    exit 0
  fi
  exit 1
fi