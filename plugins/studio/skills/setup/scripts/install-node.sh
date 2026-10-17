#!/usr/bin/env bash
# Animation Room Studio: installs a private copy of Node.js (latest LTS) into the studio's data folder.
# Nothing outside that folder changes, and no administrator password is needed.
# Usage: bash install-node.sh <data_dir>
set -euo pipefail

DATA_DIR="${1:?data folder required}"
DIST="https://nodejs.org/dist"

case "$(uname -s)" in
  Darwin) PLAT=darwin; FILEKEY=osx;;
  Linux)  PLAT=linux;  FILEKEY=linux;;
  *) echo "NODE_INSTALL=failed"; echo "REASON=unsupported system $(uname -s)"; exit 1;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64;;
  x86_64|amd64)  ARCH=x64;;
  *) echo "NODE_INSTALL=failed"; echo "REASON=unsupported chip $(uname -m)"; exit 1;;
esac
if [ "$PLAT" = darwin ] && [ "$ARCH" = x64 ] && [ "$(sysctl -in sysctl.proc_translated 2>/dev/null)" = "1" ]; then ARCH=arm64; fi

# Newest LTS release that has a build for this computer. The release list is saved to a file first: reading it through a
# pipe that closes early made curl stop with an error, and with "set -e" the whole script ended without a word.
WANT="${FILEKEY}-${ARCH}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
VERSION=""
if curl -fsSL -m 30 -o "$TMP/index.tab" "$DIST/index.tab"; then
  VERSION="$(awk -F'\t' -v want="$WANT" 'NR>1 && $10!="-" && index($3, want) {print $1; exit}' "$TMP/index.tab" || true)"
fi
# If the list cannot be read, use a known good LTS release instead of giving up.
if [ -z "$VERSION" ]; then VERSION="v22.14.0"; echo "Could not read the Node.js release list, using $VERSION." >&2; fi

NAME="node-${VERSION}-${PLAT}-${ARCH}"
TARBALL="${NAME}.tar.gz"

echo "Downloading Node.js ${VERSION} for ${PLAT} ${ARCH}..." >&2
curl -fsSL -m 600 -o "$TMP/$TARBALL" "$DIST/$VERSION/$TARBALL"
curl -fsSL -m 60 -o "$TMP/SHASUMS256.txt" "$DIST/$VERSION/SHASUMS256.txt"

EXPECTED="$(awk -v f="$TARBALL" '$2==f {print $1}' "$TMP/SHASUMS256.txt")"
if command -v shasum >/dev/null 2>&1; then ACTUAL="$(shasum -a 256 "$TMP/$TARBALL" | awk '{print $1}')"; else ACTUAL="$(sha256sum "$TMP/$TARBALL" | awk '{print $1}')"; fi
if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then echo "NODE_INSTALL=failed"; echo "REASON=download check failed, the file did not match its checksum"; exit 1; fi

mkdir -p "$DATA_DIR"
tar -xzf "$TMP/$TARBALL" -C "$TMP"
rm -rf "$DATA_DIR/node.new"
mv "$TMP/$NAME" "$DATA_DIR/node.new"
rm -rf "$DATA_DIR/node"
mv "$DATA_DIR/node.new" "$DATA_DIR/node"

echo "NODE_INSTALL=ok"
echo "NODE_PRIVATE=$DATA_DIR/node/bin/node"
echo "NODE_PRIVATE_VERSION=$("$DATA_DIR/node/bin/node" -v)"
