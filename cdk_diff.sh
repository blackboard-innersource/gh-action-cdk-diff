#!/usr/bin/env sh

set -e

# Workplace
TMPDIR=$(mktemp -d)

# Save the comment to this file
OUTFILE="$TMPDIR/diff_comment.md"
echo "::set-output name=comment_file::$OUTFILE"

# Script args, the two directories to diff
BASE_ARG=$1
HEAD_ARG=$2

BASE=$(basename "$1")
HEAD=$(basename "$2")

# Used to convert JSON to YAML for shorter diffs
to_yaml() {
  mkdir "$2"
  TEMPLATES=$(find "$1" -type f -name '*.template.json')
  for TEMPLATE in $TEMPLATES; do
    NAME=$(basename "$TEMPLATE" | sed 's/\.template\.json/\.template\.yaml/')
    YAML_FILE="$2/$NAME"
    echo "Converting $TEMPLATE to $YAML_FILE"
    yq r --prettyPrint "$TEMPLATE" > "$YAML_FILE"
  done
}

to_yaml "$BASE_ARG" "$TMPDIR/$BASE"
to_yaml "$HEAD_ARG" "$TMPDIR/$HEAD"

cd "$TMPDIR"

# See if there is a diff and pipe to file
if diff -u "$BASE" "$HEAD" > output.diff; then
  echo "::set-output name=diff::0"
  echo ":star: No CloudFormation template differences found :star:" > "$OUTFILE"
  exit 0
fi

# There is a diff - now generate summary and comment

echo "::set-output name=diff::1"
cat output.diff

# Generate a summary of the diff
if ! diff -q "$BASE" "$HEAD" > summary.txt; then
  cat summary.txt
fi

# Max comment size might be 65,536 bytes, so truncate it
cp output.diff final.diff
truncate -s '<60000' final.diff

if ! diff output.diff final.diff; then
  { echo ""; echo ""; echo '!!! TRUNCATED !!!'; echo '!!! TRUNCATED !!!'; echo '!!! TRUNCATED !!!'; } >> final.diff
fi

# Replace placeholders in our template and output to comment file
sed '/DIFF_SUMMARY/ r summary.txt' "$GITHUB_ACTION_PATH/diff_comment.md" | sed '/DIFF_SUMMARY/d' | \
  sed '/DIFF_OUTPUT/ r final.diff' | sed '/DIFF_OUTPUT/d' > "$OUTFILE"
