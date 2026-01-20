#!/bin/bash
set -e

# Horseman installer - downloads latest release from GitHub
REPO="Ryandonofrio3/horseman"
INSTALL_DIR="/Applications"

echo "Fetching latest Horseman release..."
LATEST=$(curl -sL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)

if [ -z "$LATEST" ]; then
  echo "Error: Could not find latest release. Trying prereleases..."
  LATEST=$(curl -sL "https://api.github.com/repos/$REPO/releases" | grep '"tag_name"' | head -1 | cut -d'"' -f4)
fi

if [ -z "$LATEST" ]; then
  echo "Error: No releases found"
  exit 1
fi

echo "Latest version: $LATEST"

# Download DMG
DMG_URL="https://github.com/$REPO/releases/download/$LATEST/Horseman_${LATEST#v}_universal.dmg"
TEMP_DMG="/tmp/Horseman.dmg"

echo "Downloading $DMG_URL..."
curl -L "$DMG_URL" -o "$TEMP_DMG"

# Mount and install
echo "Installing..."
MOUNT_POINT=$(hdiutil attach "$TEMP_DMG" -nobrowse | grep "/Volumes" | cut -f3)

# Remove old version if exists
if [ -d "$INSTALL_DIR/Horseman.app" ]; then
  echo "Removing old version..."
  rm -rf "$INSTALL_DIR/Horseman.app"
fi

# Copy new version
cp -R "$MOUNT_POINT/Horseman.app" "$INSTALL_DIR/"

# Cleanup
hdiutil detach "$MOUNT_POINT" -quiet
rm "$TEMP_DMG"

echo ""
echo "✓ Horseman $LATEST installed to /Applications"
echo ""
echo "First launch: Right-click Horseman.app → Open → Open"
echo "(Required for unsigned apps)"
