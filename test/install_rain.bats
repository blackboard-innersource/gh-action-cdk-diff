#!/usr/bin/env bats

load "../install_rain.sh"
load "test_helper/bats-support/load"
load "test_helper/bats-assert/load"

function teardown {
  if [ -f "rain" ]; then
    rm "rain"
  fi
  if [ -f "rain.zip" ]; then
    rm "rain.zip"
  fi
}

@test "install can download and verify rain amd64" {
  arch_rain() { echo "amd64"; }
  export -f arch_rain

  run download_rain
  assert_success
  assert [ -f rain ]

  run verify_rain
  assert_success
  assert_output -e ".* Verifying checksum of rain .*"
  assert_output -p "rain: OK"
}

@test "install can download and verify rain arm64" {
  arch_rain() { echo "arm64"; }
  export -f arch_rain

  run download_rain
  assert_success
  assert [ -f rain ]

  run verify_rain
  assert_success
  assert_output -e ".* Verifying checksum of rain .*"
  assert_output -p "rain: OK"
}