#!/usr/bin/env bats

load "../cdk_diff.sh"
load "test_helper/bats-support/load"
load "test_helper/bats-assert/load"

TMPDIR=""
GITHUB_OUTPUT=""

function setup {
  TMPDIR=$(mktemp -d)
  GITHUB_OUTPUT="$TMPDIR/GITHUB_OUTPUT"
  touch "$TMPDIR/GITHUB_OUTPUT"
}

function teardown {
  if [ -d "$TMPDIR" ]; then
    rm -rf "$TMPDIR"
  fi
}

@test "diff_comment can generate a comment" {
  run diff_comment summary diff
  assert_success
  assert_output <<EOF
:ghost: This pull request introduces changes to CloudFormation templates :ghost:

<details>
<summary><b>CDK synth diff summary</b></summary>

\`\`\`
summary
\`\`\`

</details>

<details>
<summary><b>CDK synth diff details</b></summary>

\`\`\`diff
diff
\`\`\`

</details>
EOF
}

@test "diff_output can diff two files" {
  run diff_output test/fixtures/base.cdk.out/example.template.json test/fixtures/head.cdk.out/example.template.json
  assert_success
  assert_output -p "REGIONAL"
  assert_output -p "EDGE"
}

@test "diff_output can truncate" {
  run diff_output test/fixtures/base.cdk.out/example.template.json test/fixtures/head.cdk.out/example.template.json 3
  assert_success
  assert_output <<EOF
---

!!! TRUNCATED !!!
!!! TRUNCATED !!!
!!! TRUNCATED !!!
EOF
}

@test "has_diff is successful on diff" {
  run has_diff test/fixtures/base.cdk.out/example.template.json test/fixtures/head.cdk.out/example.template.json
  assert_success
  assert_output ""
}

@test "has_diff fails if no diff" {
  run has_diff test/fixtures/base.cdk.out/example.template.json test/fixtures/base.cdk.out/example.template.json
  assert_failure
  assert_output ""
}

@test "copy_templates fails if target directory already exists" {
  mkdir "$TMPDIR/test"
  run copy_templates test/fixtures/base.cdk.out "$TMPDIR/test"
  assert_failure
  assert_output "The '$TMPDIR/test' directory already exists"
}

@test "cdk_diff can diff two cdk.out directories" {
  run cdk_diff test/fixtures/base.cdk.out test/fixtures/head.cdk.out "$TMPDIR"
  assert_success
  assert_output -e ".*processed 1 template files.*"
  run cat $GITHUB_OUTPUT
  assert_output -p "comment_file=$TMPDIR/diff_comment.md"
  assert_output -p "diff_file=$TMPDIR/synth.diff"
  assert_output -p 'diff=1'
  assert [ -f "$TMPDIR/diff_comment.md" ]
  assert [ -f "$TMPDIR/synth.diff" ]

  run cat "$TMPDIR/diff_comment.md"
  assert_output -p "This pull request introduces changes to CloudFormation templates"
  assert_output -p "Files base.cdk.out/example.template.yaml and head.cdk.out/example.template.yaml differ"
  assert_output -p "diff -u base.cdk.out/example.template.yaml head.cdk.out/example.template.yaml"

  # Confirm the output contains S3Key as we'll test ignoring it later
  run cat $TMPDIR/base.cdk.out/example.template.yaml
  assert_output --partial "S3Key:"
}

@test "cdk_diff can diff two cdk.out directories that are the same" {
  run cdk_diff test/fixtures/base.cdk.out test/fixtures/base.copy.cdk.out "$TMPDIR"
  assert_success
  # This is zero because we only convert JSON to YAML if they are different
  assert_output -e ".*processed 0 template files.*"
  run cat $GITHUB_OUTPUT
  assert_output -p "comment_file=$TMPDIR/diff_comment.md"
  assert_output -p "diff_file=$TMPDIR/synth.diff"
  assert_output -p 'diff=0'
  assert [ -f "$TMPDIR/diff_comment.md" ]
  assert [ -f "$TMPDIR/synth.diff" ]

  run cat "$TMPDIR/diff_comment.md"
  assert_output ":star: No CloudFormation template differences found :star:"
}

@test "cdk_diff can rename on copy" {
  CDK_DIFF_RENAME="1"
  run cdk_diff test/fixtures/base.copy.cdk.out test/fixtures/head.cdk.out "$TMPDIR"
  assert_success
  assert [ -f "$TMPDIR/diff_comment.md" ]

  run cat "$TMPDIR/diff_comment.md"
  # We can see that base.copy.cdk.out is not used, rename occurs
  assert_output -p "Files base.cdk.out/example.template.yaml and head.cdk.out/example.template.yaml differ"
  assert_output -p "diff -u base.cdk.out/example.template.yaml head.cdk.out/example.template.yaml"
}

@test "cdk_diff errors when base is not a directory" {
  run cdk_diff test/fixtures/base.cdk.out/example.template.json test/fixtures/base.copy.cdk.out "$TMPDIR"
  assert_failure
  assert_output "The 'base' input is not a directory"
}

@test "cdk_diff errors when head is not a directory" {
  run cdk_diff test/fixtures/base.cdk.out not_a_real_thing "$TMPDIR"
  assert_failure
  assert_output "The 'head' input is not a directory"
}

@test "cdk_diff errors when head and base are the same directory" {
  run cdk_diff test/fixtures/base.cdk.out test/fixtures/base.cdk.out "$TMPDIR"
  assert_failure
  assert_output "The 'base' and 'head' inputs point to the same base directory names"
}

@test "cdk_diff skips keys" {
  CDK_DIFF_IGNORE_KEYS="S3Key"
  run cdk_diff test/fixtures/base.cdk.out test/fixtures/head.cdk.out "$TMPDIR"
  assert_success
  run cat $TMPDIR/base.cdk.out/example.template.yaml
  refute_output --partial "S3Key:"
}

@test "cdk_diff skips nested keys" {
  CDK_DIFF_IGNORE_KEYS="Code.S3Key"
  run cdk_diff test/fixtures/base.cdk.out test/fixtures/head.cdk.out "$TMPDIR"
  assert_success
  run cat $TMPDIR/base.cdk.out/example.template.yaml
  refute_output --partial "S3Key:"
}
