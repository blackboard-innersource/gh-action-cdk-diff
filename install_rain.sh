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
    CHECKSUM="7fe35e499510630a13f6fc39845a571c2a9fe99e8242ce0e3cfd4dbcc42fa647"
  else
    CHECKSUM="27a0673c2ee089328938ae27355349ee95e3156a351a543ef04e327279ee0e01"
  fi
  echo "🔒 Verifying checksum of rain ${arch}"
  verify_file "$CHECKSUM" "rain" || return 1
}

verify_file() {
    local expected_hash="$1"
    local file="$2"
    local computed_hash

    report_error() {
        local tool="$1"
        local computed="$2"
        if [ "$computed" = "$expected_hash" ]; then
            >&2 echo "✅ ${file}: OK"
            return 0
        fi
        >&2 echo "Failed to verify checksum using $tool:"
        >&2 echo "Expected: $expected_hash"
        >&2 echo "Got:      $computed"
        return 1
    }

    if command -v openssl >/dev/null 2>&1; then
      computed_hash=$(openssl dgst -sha256 "$file" | cut -d' ' -f2)
      report_error "openssl" "$computed_hash" && return 0
      return 1
    fi

    if command -v shasum >/dev/null 2>&1; then
        computed_hash=$(shasum -a 256 "$file" | cut -d' ' -f1)
        report_error "shasum" "$computed_hash" && return 0
        return 1
    fi

    if command -v sha256sum >/dev/null 2>&1; then
        computed_hash=$(sha256sum "$file" | cut -d' ' -f1)
        report_error "sha256sum" "$computed_hash" && return 0
        return 1
    fi

    >&2 echo "No suitable hash verification tool found (tried openssl, shasum, and sha256sum)"
    return 1
}

arch_rain() {
  if [ "$(uname -m)" = "aarch64" ]; then
    echo "arm64"
  else
    echo "amd64"
  fi
}

install_binary() {
  local dest dests

  dests=("$HOME/bin" "/usr/local/bin" "/usr/bin" "/opt/bin")

  for dest in "${dests[@]}"; do
    # This if is testing if our destination is in the $PATH (start, middle, end)
    if [[ "$PATH" == "${dest}:"*  ]] || [[ "$PATH" == *":${dest}:"*  ]] || [[ "$PATH" == *":${dest}"  ]]; then
      if ! install --mode +x "$1" "$dest"; then
        >&2 echo "Failed to install ${1} to ${dest}"
        return 1
      fi
      rm -f "$1" # Install copies, not move
      echo "📦 Installed ${1} to ${dest}"
      return 0
    fi
  done

  >&2 echo "Failed to install ${1}; None of these paths appear in \$PATH:" "${dests[@]}" "and \$PATH=${PATH}"
  return 1
}

main() {
  if command -v rain >/dev/null 2>&1; then
    echo "✅ Rain is already installed: $(rain --version)"
    return 0
  fi
  download_rain && verify_rain && install_binary "rain" && rain --version
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  if main "$@"; then
    exit 0
  fi
  exit 1
fi
