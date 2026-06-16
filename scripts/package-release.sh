#!/usr/bin/env bash
#
# Build Nib and package the .app into a release zip for the Homebrew cask.
#
# Usage:
#   ./scripts/package-release.sh          # build, zip, print version + sha256
#   ./scripts/package-release.sh --no-build   # reuse the existing build, just zip
#
# After this prints the sha256:
#   1. gh release create v<version> build/release/Nib-<version>.zip ...
#   2. update Casks/nib.rb in caezium/homebrew-tap with the new version + sha256
#
# The packaged app is ad-hoc signed (not notarized), so the cask clears the
# Gatekeeper quarantine flag on install. See Casks/nib.rb in the tap.
set -euo pipefail

cd "$(dirname "$0")/.."

# Version comes from mobrowser.conf.json (single source of truth).
version="$(node -e "const v=require('./mobrowser.conf.json').app.version; process.stdout.write(\`\${v.major}.\${v.minor}.\${v.patch}\`)")"

if [[ "${1:-}" != "--no-build" ]]; then
  echo "› Building Nib $version ..."
  npm run build
fi

app="build/dist/mac-arm64/bin/Nib.app"
if [[ ! -d "$app" ]]; then
  echo "✗ $app not found — run without --no-build first." >&2
  exit 1
fi

out="build/release/Nib-$version.zip"
mkdir -p build/release
rm -f "$out"

# ditto preserves the bundle layout, symlinks, and the ad-hoc code signature.
# A plain `zip -r` corrupts the signature and the app won't launch.
echo "› Zipping $app ..."
ditto -c -k --keepParent "$app" "$out"

sha="$(shasum -a 256 "$out" | cut -d' ' -f1)"

echo
echo "  version  $version"
echo "  zip      $out  ($(du -h "$out" | cut -f1))"
echo "  sha256   $sha"
echo
echo "  url      https://github.com/caezium/nib/releases/download/v$version/Nib-$version.zip"
echo
echo "Next:"
echo "  gh release create v$version \"$out\" -R caezium/nib -t \"Nib $version\" --notes \"...\""
echo "  # then set version \"$version\" + sha256 \"$sha\" in Casks/nib.rb"
