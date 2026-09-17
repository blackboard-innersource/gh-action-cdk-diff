#!/usr/bin/env bats

load "../collect_templates.sh"
load "test_helper/bats-support/load"
load "test_helper/bats-assert/load"

TMPDIR=""

function setup {
  TMPDIR=$(mktemp -d)
}

function teardown {
  if [ -d "$TMPDIR" ]; then
    rm -rf "$TMPDIR"
  fi
}

@test "collect_templates copies templates from both sides" {
  run collect_templates test/fixtures/base.cdk.out test/fixtures/nested.cdk.out "$TMPDIR/out"
  assert_success
  assert_line "Copied 1 template files to $TMPDIR/out/base"
  assert_line "Copied 2 template files to $TMPDIR/out/head"

  assert [ -f "$TMPDIR/out/base/example.template.json" ]
  assert [ -f "$TMPDIR/out/head/example.template.json" ]
  assert [ -f "$TMPDIR/out/head/nested/example.nested.template.json" ]

  run cmp test/fixtures/nested.cdk.out/nested/example.nested.template.json "$TMPDIR/out/head/nested/example.nested.template.json"
  assert_success
}

@test "collect_templates copies nothing but templates" {
  run collect_templates test/fixtures/base.cdk.out test/fixtures/nested.cdk.out "$TMPDIR/out"
  assert_success

  run bash -c "find '$TMPDIR/out' -type f | sort"
  assert_output <<EOF2
$TMPDIR/out/base/example.template.json
$TMPDIR/out/head/example.template.json
$TMPDIR/out/head/nested/example.nested.template.json
EOF2

  assert [ ! -e "$TMPDIR/out/base/manifest.json" ]
  assert [ ! -e "$TMPDIR/out/head/manifest.json" ]
  assert [ ! -e "$TMPDIR/out/head/nested/manifest.json" ]
  assert [ ! -e "$TMPDIR/out/head/cdk.out" ]
  assert [ -z "$(find "$TMPDIR/out" -type d -name 'asset.*')" ]
}

@test "collect_templates accepts a trailing slash" {
  run collect_templates test/fixtures/base.cdk.out/ test/fixtures/nested.cdk.out/ "$TMPDIR/out"
  assert_success
  assert [ -f "$TMPDIR/out/head/nested/example.nested.template.json" ]
}

@test "collect_templates errors when base is not a directory" {
  run collect_templates test/fixtures/base.cdk.out/example.template.json test/fixtures/nested.cdk.out "$TMPDIR/out"
  assert_failure
  assert_output "The 'base' input is not a directory"
}

@test "collect_templates errors when head is not a directory" {
  run collect_templates test/fixtures/base.cdk.out not_a_real_thing "$TMPDIR/out"
  assert_failure
  assert_output "The 'head' input is not a directory"
}

@test "collect_templates errors when out is missing" {
  run collect_templates test/fixtures/base.cdk.out test/fixtures/nested.cdk.out
  assert_failure
  assert_output "The 'out' input is required"
}
