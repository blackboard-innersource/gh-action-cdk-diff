#!/usr/bin/env bash

download_yq() {
  if uname -m = "aarch64"; then
    echo "🚧 Downloading yq for aarch64"
    wget --no-verbose -O yq https://github.com/mikefarah/yq/releases/download/4.45.1/yq_linux_arm64
  else
    echo "🚧 Downloading yq for amd64"
    wget --no-verbose -O yq https://github.com/mikefarah/yq/releases/download/4.45.1/yq_linux_amd64
  fi
}

# Very wonky to find this checksum
# Go to https://github.com/mikefarah/yq/releases
# Download checksums and checksums_hashes_order
# Run these commands:
# YQ_LINE=$(grep --line-number 'SHA-256' checksums_hashes_order | awk -F ':' '{print $1+1}')
# cat checksums | awk "/yq_linux_amd64/ {print \$1\" \"\$${YQ_LINE}}"
# cat checksums | awk "/yq_linux_arm64/ {print \$1\" \"\$${YQ_LINE}}"
verify_yq() {
  if uname -m = "aarch64"; then
    echo "🔒 Verifying checksum of yq arm64"
    CHECKSUM="ceea73d4c86f2e5c91926ee0639157121f5360da42beeb8357783d79c2cc6a1d"
  else
    echo "🔒 Verifying checksum of yq amd64"
    CHECKSUM="654d2943ca1d3be2024089eb4f270f4070f491a0610481d128509b2834870049"
  fi

  echo "${CHECKSUM} yq" | sha256sum -c
}

install_yq() {
  echo "📦 Installing yq to /usr/local/bin"
  sudo install -m +x yq "/usr/local/bin/yq"
  rm -f yq
}

main() {
  # only install if not already installed
  if ! command -v yq &> /dev/null; then
    echo "🚧 Installing yq"
    download_yq && verify_yq && install_yq
  else
    echo "🚧 yq already installed"
  fi
  yq --version
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  if main "$@"; then
    exit 0
  fi
  exit 1
fi
