#!/usr/bin/env bats

load "install_yq.sh"
load "test_helper/bats-support/load"
load "test_helper/bats-assert/load"

function teardown {
  if [ -f "yq" ]; then
    rm "yq"
  fi
}

@test "install can download and verify YQ" {
  run download_yq
  assert_success
  assert_output -e ".* mikefarah/yq/releases/download/3.4.1/yq_linux_amd64 to yq"
  assert [ -f yq ]

  run verify_yq
  assert_success
  assert_output -e ".* Verifying checksum of yq"
  assert_output -p "yq: OK"
}