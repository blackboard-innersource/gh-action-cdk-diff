#!/usr/bin/env bats

load "../install_yq.sh"
load "test_helper/bats-support/load"
load "test_helper/bats-assert/load"

function teardown {
  if [ -f "yq" ]; then
    rm "yq"
  fi
}

@test "install can download and verify yq amd64" {
  arch_yq() { echo "amd64"; }
  export -f arch_yq

  run download_yq
  assert_success
  assert [ -f yq ]

  run verify_yq
  assert_success
  assert_output -e ".* Verifying checksum of yq .*"
  assert_output -p "yq: OK"
}

@test "install can download and verify yq arm64" {
  arch_yq() { echo "arm64"; }
  export -f arch_yq

  run download_yq
  assert_success
  assert [ -f yq ]

  run verify_yq
  assert_success
  assert_output -e ".* Verifying checksum of yq .*"
  assert_output -p "yq: OK"
}

@test "verify fails when the checksum does not match" {
  arch_yq() { echo "amd64"; }
  export -f arch_yq

  echo "not really yq" > yq
  run verify_yq
  assert_failure
  assert_output -p "Failed to verify checksum"
}

@test "have_yq accepts the yq that install_yq.sh downloads" {
  if [ "$(uname -s)" != "Linux" ]; then
    skip "install_yq.sh downloads a Linux binary, which only runs on Linux"
  fi

  run download_yq
  assert_success
  chmod +x yq

  # Put the downloaded binary ahead of any yq already on the runner, so this
  # tests the version we pin rather than whatever happens to be installed
  PATH="$PWD:$PATH"
  run command -v yq
  assert_output "$PWD/yq"

  # have_yq greps the --version output, so if upstream reworded it we would
  # silently fail this check and re-download yq on every single run
  run yq --version
  assert_success
  assert_output -p "mikefarah/yq"

  run have_yq
  assert_success
}

@test "have_yq rejects a yq that is not mikefarah v4" {
  yq() { echo "yq 3.4.3"; }
  export -f yq

  run have_yq
  assert_failure
}
