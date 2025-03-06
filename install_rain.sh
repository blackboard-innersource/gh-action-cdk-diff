#!/usr/bin/env bash

download_rain() {
  arch=$(arch_rain)
  echo "⬇️ Downloading rain for ${arch}"
  wget --no-verbose -O rain.zip https://github.com/aws-cloudformation/rain/releases/download/v1.21.0/rain-v1.21.0_linux-${arch}.zip
  unzip -j rain.zip '*/rain' -d .
  rm -f rain.zip
}

# Very wonky to find this checksum
verify_rain() {
  arch=$(arch_rain)
  if [ "$arch" = "arm64" ]; then
    CHECKSUM="d65dad1afe77a93f2a9ab930be7bd15636bc9da32c91182a8945f4b17ce466718b1f3ac656429a7eba9b6c4c18ddbbbd9714e7ff1a7c168f3ee6aa93d6c99018"
  else
    CHECKSUM="27a0673c2ee089328938ae27355349ee95e3156a351a543ef04e327279ee0e01"
  fi
  echo "🔒 Verifying checksum of rain ${arch}"
  if ! echo "${CHECKSUM}  rain" | shasum -a 512 -c; then
    echo "❌ Checksum verification failed!"
    echo "Expected: ${CHECKSUM}"
    echo "Actual:   $(shasum -a 512 rain | cut -d' ' -f1)"
    return 1
  fi
}

arch_rain() {
  if [ "$(uname -m)" = "aarch64" ]; then
    echo "arm64"
  else
    echo "amd64"
  fi
}

install_rain() {
  echo "📦 Installing rain to /usr/local/bin"
  sudo install -m +x rain "/usr/local/bin/rain"
  rm -f rain
}

main() {
  if command -v rain >/dev/null 2>&1; then
    echo "✅ Rain is already installed: $(rain --version)"
    return 0
  fi
  download_rain && verify_rain && install_rain && rain --version
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  if main "$@"; then
    exit 0
  fi
  exit 1
fi
