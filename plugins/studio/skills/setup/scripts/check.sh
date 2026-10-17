#!/usr/bin/env bash
# Animation Room Studio: computer check for macOS and Linux.
# Usage: bash check.sh <plugin_root> <data_dir> [studio_dir]
# Prints KEY=value lines. Never changes anything on the computer.

PLUGIN_ROOT="${1:-}"
DATA_DIR="${2:-}"
STUDIO_DIR="${3:-}"
MIN_NODE=20
MIN_FREE_GB=5

say() { printf '%s=%s\n' "$1" "$2"; }

say STUDIO_CHECK 1

# One studio per computer: if this chat's own data folder is still empty but a studio was set up before (the store and a
# file upload give two different folders), use that one. The scripts follow the same rule (scripts/home.mjs).
is_studio() { [ -n "$1" ] && { [ -f "$1/config.json" ] || [ -f "$1/runtime/.installed.json" ]; }; }
if ! is_studio "$DATA_DIR"; then
  PTR="${AR_HOME:-$HOME/.animationroom}/home.json"
  if [ -f "$PTR" ]; then
    KNOWN="$(sed -nE 's/.*"data": *"([^"]+)".*/\1/p' "$PTR" | head -1)"
    if is_studio "$KNOWN" && [ "$KNOWN" != "$DATA_DIR" ]; then say DATA_ADOPTED "$KNOWN"; DATA_DIR="$KNOWN"; fi
  fi
fi
say DATA_FOLDER "${DATA_DIR:-none}"

# Where we are running
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then say CLOUD_SESSION yes; else say CLOUD_SESSION no; fi

# Operating system and chip
case "$(uname -s)" in
  Darwin) OS=macos; OS_VERSION="$(sw_vers -productVersion 2>/dev/null)";;
  Linux)  OS=linux; OS_VERSION="$(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-unknown}")";;
  *)      OS=other; OS_VERSION="$(uname -sr)";;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64;;
  x86_64|amd64)  ARCH=x64;;
  *)             ARCH="$(uname -m)";;
esac
# Rosetta check: an Apple Silicon Mac running this shell under Intel emulation
if [ "$OS" = macos ] && [ "$ARCH" = x64 ] && [ "$(sysctl -in sysctl.proc_translated 2>/dev/null)" = "1" ]; then ARCH=arm64; say ROSETTA yes; fi
say OS "$OS"
say OS_VERSION "$OS_VERSION"
say ARCH "$ARCH"

# Free space in the home folder
FREE_GB="$(df -Pk "$HOME" 2>/dev/null | awk 'NR==2{printf "%d", $4/1024/1024}')"
say FREE_GB "${FREE_GB:-unknown}"
if [ -n "$FREE_GB" ] && [ "$FREE_GB" -ge "$MIN_FREE_GB" ] 2>/dev/null; then say DISK_OK yes; else say DISK_OK no; fi

# Node.js: the system one and the studio's own copy
node_major() { "$1" -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'; }
SYS_NODE="$(command -v node 2>/dev/null || true)"
if [ -n "$SYS_NODE" ]; then
  say NODE_SYSTEM "$SYS_NODE"; say NODE_SYSTEM_VERSION "$("$SYS_NODE" -v 2>/dev/null)"
else
  say NODE_SYSTEM none; say NODE_SYSTEM_VERSION none
fi
PRIV_NODE=""
if [ -n "$DATA_DIR" ] && [ -x "$DATA_DIR/node/bin/node" ]; then PRIV_NODE="$DATA_DIR/node/bin/node"; fi
if [ -n "$PRIV_NODE" ]; then
  say NODE_PRIVATE "$PRIV_NODE"; say NODE_PRIVATE_VERSION "$("$PRIV_NODE" -v 2>/dev/null)"
else
  say NODE_PRIVATE none; say NODE_PRIVATE_VERSION none
fi
USE_NODE=""
NODE_OK_VALUE=no
if [ -n "$PRIV_NODE" ] && [ "$(node_major "$PRIV_NODE")" -ge "$MIN_NODE" ] 2>/dev/null; then USE_NODE="$PRIV_NODE"; NODE_OK_VALUE=private
elif [ -n "$SYS_NODE" ] && [ "$(node_major "$SYS_NODE")" -ge "$MIN_NODE" ] 2>/dev/null; then USE_NODE="$SYS_NODE"; NODE_OK_VALUE=system
fi
say NODE_OK "$NODE_OK_VALUE"
say NODE_USE "${USE_NODE:-none}"

# The speech engine. A Mac downloads it ready made (scripts/prebuilt-whisper.json lists one for each chip), so Apple's
# Command Line Tools are not needed and their absence is never reported as a problem. Only a Mac with no ready made engine
# for its chip would have to build it, and only then do the tools matter (SPEECH_BUILD=needs_apple_tools).
if [ "$OS" = macos ]; then
  if grep -q "\"$ARCH\": *{" "$PLUGIN_ROOT/scripts/prebuilt-whisper.json" 2>/dev/null; then
    say SPEECH_BUILD prebuilt; say XCODE_TOOLS not_needed
  else
    # xcode-select -p fails on a Mac without the tools. It never opens the install dialog.
    if xcode-select -p >/dev/null 2>&1; then say XCODE_TOOLS yes; say SPEECH_BUILD compile; else say XCODE_TOOLS no; say SPEECH_BUILD needs_apple_tools; fi
  fi
else
  if command -v cc >/dev/null 2>&1 && command -v make >/dev/null 2>&1; then say BUILD_TOOLS yes; else say BUILD_TOOLS no; fi
fi

# Network: the package registry and the Node.js download site
net() { curl -fsSIL -m 8 -o /dev/null "$1" >/dev/null 2>&1 && echo yes || echo no; }
say NET_NPM "$(net https://registry.npmjs.org/)"
say NET_NODEJS "$(net https://nodejs.org/dist/index.tab)"

# Studio runtime (the render engine, installed into the data folder)
if [ -n "$DATA_DIR" ] && [ -f "$DATA_DIR/runtime/.installed.json" ]; then
  INST_V="$(sed -nE 's/.*"version": *"([^"]+)".*/\1/p' "$DATA_DIR/runtime/.installed.json" | head -1)"
  WANT_V="$(sed -nE 's/^ *"version": *"([^"]+)".*/\1/p' "$PLUGIN_ROOT/runtime/package.json" 2>/dev/null | head -1)"
  if [ -n "$WANT_V" ] && [ "$INST_V" != "$WANT_V" ]; then say RUNTIME outdated; else say RUNTIME installed; fi
  say RUNTIME_VERSION "$INST_V"
else
  say RUNTIME missing
fi
# The Edit engine is separate from the Animate engine.
if [ -n "$DATA_DIR" ] && [ -f "$DATA_DIR/runtime-edit/.installed.json" ]; then
  EINST_V="$(sed -nE 's/.*"version": *"([^"]+)".*/\1/p' "$DATA_DIR/runtime-edit/.installed.json" | head -1)"
  EWANT_V="$(sed -nE 's/^ *"version": *"([^"]+)".*/\1/p' "$PLUGIN_ROOT/edit-runtime/package.json" 2>/dev/null | head -1)"
  if [ -n "$EWANT_V" ] && [ "$EINST_V" != "$EWANT_V" ]; then say EDIT_RUNTIME outdated; else say EDIT_RUNTIME installed; fi
else
  say EDIT_RUNTIME missing
fi
# The install step writes .installed.json only after the video browser is in place.
if [ -n "$DATA_DIR" ] && grep -q '"browser"' "$DATA_DIR/runtime/.installed.json" 2>/dev/null; then say BROWSER ready; else say BROWSER missing; fi
if [ -n "$DATA_DIR" ] && [ -f "$DATA_DIR/whisper/.ready" ]; then say TRANSCRIBER ready; else say TRANSCRIBER missing; fi

# Saved settings and license
if [ -n "$DATA_DIR" ] && [ -f "$DATA_DIR/config.json" ]; then
  say CONFIG present
  if grep -q '"license"' "$DATA_DIR/config.json" 2>/dev/null; then say LICENSE present; else say LICENSE missing; fi
else
  say CONFIG missing; say LICENSE missing
fi

# The folder where videos will live: is it inside a cloud synced folder?
if [ -z "$STUDIO_DIR" ]; then
  if [ "$OS" = macos ]; then STUDIO_DIR="$HOME/Movies/Animation Room"; else STUDIO_DIR="$HOME/Videos/Animation Room"; fi
fi
say STUDIO_DIR "$STUDIO_DIR"
SYNC=no
case "$STUDIO_DIR" in
  *"/Library/Mobile Documents/"*|*"iCloud"*) SYNC=icloud;;
  *"/Library/CloudStorage/OneDrive"*|*"/OneDrive"*) SYNC=onedrive;;
  *"/Library/CloudStorage/Dropbox"*|*"/Dropbox"*) SYNC=dropbox;;
  *"/Library/CloudStorage/GoogleDrive"*|*"/Google Drive"*) SYNC=googledrive;;
esac
if [ "$SYNC" = no ] && [ "$OS" = macos ]; then
  case "$STUDIO_DIR" in
    "$HOME/Desktop"*|"$HOME/Documents"*)
      if [ -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Desktop" ] || [ -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Documents" ]; then SYNC=icloud; fi;;
  esac
fi
say STUDIO_DIR_SYNCED "$SYNC"
if [ -d "$STUDIO_DIR" ]; then say STUDIO_DIR_EXISTS yes; else say STUDIO_DIR_EXISTS no; fi

# One plain verdict, so nobody has to work it out from the lines above.
# Animate needs: Node, the animation engine, the video browser, the license. Edit needs the editing engine instead.
# An outdated engine is fine: the Animate and Edit scripts update it by themselves when they need it.
BASE=yes; MISSING=""
miss() { MISSING="${MISSING:+$MISSING,}$1"; }
[ "$NODE_OK_VALUE" = no ] && { BASE=no; miss node; }
[ -f "$DATA_DIR/config.json" ] && grep -q '"license"' "$DATA_DIR/config.json" 2>/dev/null || { BASE=no; miss license; }
grep -q '"browser"' "$DATA_DIR/runtime/.installed.json" 2>/dev/null || { BASE=no; miss browser; }
READY_ANIMATE=$BASE; READY_EDIT=$BASE
[ -f "$DATA_DIR/runtime/.installed.json" ] || { READY_ANIMATE=no; miss animation_engine; }
[ -f "$DATA_DIR/runtime-edit/.installed.json" ] || { READY_EDIT=no; miss editing_engine; }
say READY_ANIMATE "$READY_ANIMATE"
say READY_EDIT "$READY_EDIT"
if [ "$READY_ANIMATE" = yes ] && [ "$READY_EDIT" = yes ]; then say SETUP_NEEDED no; else say SETUP_NEEDED yes; fi
say MISSING "${MISSING:-none}"
# The speech engine is a big download that only the first video needs, so it never blocks the studio.
if [ -f "$DATA_DIR/whisper/.ready" ]; then say SPEECH_ENGINE ready; else say SPEECH_ENGINE not_yet; fi
