#!/bin/bash
set -e

# Horseman installer - downloads latest release from GitHub
REPO="Ryandonofrio3/horseman"
INSTALL_DIR="/Applications"

echo "Fetching latest Horseman release..."

# Get the DMG URL directly from the API (handles version mismatches)
DMG_URL=$(curl -sL "https://api.github.com/repos/$REPO/releases" | grep '"browser_download_url"' | grep '\.dmg"' | head -1 | cut -d'"' -f4)

if [ -z "$DMG_URL" ]; then
  echo "Error: No DMG found in releases"
  exit 1
fi

# Extract version from URL for display
LATEST=$(echo "$DMG_URL" | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+')
echo "Latest version: $LATEST"
echo "Downloading $DMG_URL..."

TEMP_DMG="/tmp/Horseman.dmg"
curl -L "$DMG_URL" -o "$TEMP_DMG"

# Verify we got a real file
if [ ! -s "$TEMP_DMG" ] || [ $(stat -f%z "$TEMP_DMG") -lt 1000 ]; then
  echo "Error: Download failed or file too small"
  rm -f "$TEMP_DMG"
  exit 1
fi

# Mount and install
echo "Installing..."
MOUNT_POINT=$(hdiutil attach "$TEMP_DMG" -nobrowse | grep "/Volumes" | cut -f3)

if [ -z "$MOUNT_POINT" ]; then
  echo "Error: Failed to mount DMG"
  rm -f "$TEMP_DMG"
  exit 1
fi

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
