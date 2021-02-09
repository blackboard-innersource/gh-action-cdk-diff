#!/usr/bin/env bash

download_yq() {
  echo "⬇️ mikefarah/yq/releases/download/v4.5.0/yq_linux_amd64 to yq"
  wget --no-verbose -O yq https://github.com/mikefarah/yq/releases/download/v4.5.0/yq_linux_amd64
}

# Very wonky to find this checksum
# Go to https://github.com/mikefarah/yq/releases
# Download checksums and checksums_hashes_order
# Run these commands:
# YQ_LINE=$(grep --line-number 'SHA-256' checksums_hashes_order | awk -F ':' '{print $1+1}')
# cat checksums | awk "/yq_linux_amd64/ {print \$1\" \"\$${YQ_LINE}}"
verify_yq() {
  echo "🔒 Verifying checksum of yq"
  echo "b08830201aed3b75a32aebf29139877158904fe9efb05af628f43c239fb95830 yq" | sha256sum -c
}

install_yq() {
  echo "📦 Installing yq to /usr/local/bin"
  sudo install -m +x yq "/usr/local/bin/yq"
}

main() {
  download_yq && verify_yq && install_yq && yq --version
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  if main "$@"; then
    exit 0
  fi
  exit 1
fi
