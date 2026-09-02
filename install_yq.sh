#!/usr/bin/env bash

YQ_VERSION="v4.53.6"

download_yq() {
  arch=$(arch_yq)
  echo "⬇️ Downloading yq ${YQ_VERSION} for ${arch}"
  wget --no-verbose -O yq "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${arch}"
}

# Very wonky to find this checksum: the release ships a "checksums" file with 31
# hash columns whose order is listed in "checksums_hashes_order". SHA-256 is the
# 18th hash, so it is field 19 of each line:
#   awk '{print $19}' <<< "$(grep '^yq_linux_amd64 ' checksums)"
verify_yq() {
  arch=$(arch_yq)
  if [ "$arch" = "arm64" ]; then
    CHECKSUM="88a1016bc1d657375a35864e4f44b6f333df8ff97b559f51bba0adcb2169df09"
  else
    CHECKSUM="c5f056448f973ae7d39b5401949648a78f2dc1947d6a8eb65be60d5c504b9385"
  fi
  echo "🔒 Verifying checksum of yq ${arch}"
  verify_file "$CHECKSUM" "yq" || return 1
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

arch_yq() {
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

# "yq" is a common command name, so make sure any existing one is Mike Farah's
# Go version 4 and not, say, the Python jq wrapper that shares the name.
have_yq() {
  command -v yq >/dev/null 2>&1 && yq --version 2>&1 | grep -q "mikefarah/yq.*version v4"
}

main() {
  if have_yq; then
    echo "✅ yq is already installed: $(yq --version)"
    return 0
  fi
  download_yq && verify_yq && install_binary "yq" && yq --version
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  if main "$@"; then
    exit 0
  fi
  exit 1
fi
