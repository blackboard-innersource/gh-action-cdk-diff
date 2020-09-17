#!/usr/bin/env bash

set -e

require_var() {
  if [ -z "$1" ]; then
    >&2 echo "$2"
    exit 1
  fi
}

function gh_asset() {
  echo "⬇️ mikefarah/yq/releases/download/3.2.1/yq_linux_amd64 to yq"
  wget -q -O yq https://github.com/mikefarah/yq/releases/download/3.3.4/yq_linux_amd64
}

gh_asset

echo "🔒 Verifying checksum of yq"
echo "fbc271365b86e4a0b7a2c5ef2aba0966aa9d25b73a06e68866638f66ae6b8408 yq" | sha256sum -c

echo "📦 Installing yq to /usr/local/bin"
install -m +x yq "/usr/local/bin/yq"

yq --version

#if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
#  if cdk_diff "$@"; then
#    exit 0
#  fi
#  exit 1
#fi