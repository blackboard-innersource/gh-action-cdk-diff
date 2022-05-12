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

  BASE=$(basename "$BASE_ARG")
  HEAD=$(basename "$HEAD_ARG")

  if [ "$BASE" = "$HEAD" ]; then
    echo "The 'base' and 'head' inputs point to the same base directory names"
    return 1
  fi

  to_yaml "$BASE_ARG" "$TMPDIR/$BASE" || return 1
  to_yaml "$HEAD_ARG" "$TMPDIR/$HEAD" || return 1

  cd "$TMPDIR" || return 1

  # Save the comment to this file
  OUTFILE="$TMPDIR/diff_comment.md"
  DIFFFILE="$TMPDIR/synth.diff"
  echo "::set-output name=comment_file::$OUTFILE"
  echo "::set-output name=diff_file::$DIFFFILE"

  if has_diff "$BASE" "$HEAD"; then
    echo "::set-output name=diff::1"
    OUTPUT=$(diff_output "$BASE" "$HEAD")
    SUMMARY=$(diff_summary "$BASE" "$HEAD")
    diff_comment "$SUMMARY" "$OUTPUT" > "$OUTFILE"
    diff -u "$BASE" "$HEAD" > "$DIFFFILE"
    return 0
  fi

  echo "::set-output name=diff::0"
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

# Used to convert JSON to YAML for shorter diffs
to_yaml() {
  if [ -d "$2" ]; then
    echo "The '$2' directory already exists"
    return 1
  fi
  mkdir "$2"
  TEMPLATES=$(find "$1" -type f -name '*.template.json')
  for TEMPLATE in $TEMPLATES; do
    NAME=$(basename "$TEMPLATE" | sed 's/\.template\.json/\.template\.yaml/')
    YAML_FILE="$2/$NAME"
    echo "Converting $TEMPLATE to $YAML_FILE"
    yq r --prettyPrint "$TEMPLATE" > "$YAML_FILE"
  done
  return 0
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  if cdk_diff "$@"; then
    exit 0
  fi
  exit 1
fi