#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check for uncommitted changes
if [[ -z $(git status --porcelain) ]]; then
  echo -e "${YELLOW}No changes to commit${NC}"
  read -p "Continue with tag/release only? (y/n) " -n 1 -r
  echo
  [[ ! $REPLY =~ ^[Yy]$ ]] && exit 0
  SKIP_COMMIT=true
fi

# Get latest tag and increment patch
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
IFS='.' read -r MAJOR MINOR PATCH <<< "${LATEST_TAG#v}"
NEW_VERSION="v${MAJOR}.${MINOR}.$((PATCH + 1))"

echo -e "${GREEN}Latest tag:${NC} $LATEST_TAG"
echo -e "${GREEN}New version:${NC} $NEW_VERSION"
echo

# Commit if there are changes
if [[ -z $SKIP_COMMIT ]]; then
  git status --short
  echo
  read -p "Commit message: " COMMIT_MSG
  [[ -z "$COMMIT_MSG" ]] && echo -e "${RED}Commit message required${NC}" && exit 1

  git add -A
  git commit -m "$COMMIT_MSG"
fi

# Confirm release
read -p "Create release $NEW_VERSION? (y/n) " -n 1 -r
echo
[[ ! $REPLY =~ ^[Yy]$ ]] && exit 0

# Tag and push
git tag -a "$NEW_VERSION" -m "Release $NEW_VERSION"
git push origin main --tags

# Create GitHub release
echo -e "${GREEN}Creating GitHub release...${NC}"
gh release create "$NEW_VERSION" \
  --title "$NEW_VERSION" \
  --generate-notes

echo -e "${GREEN}Released $NEW_VERSION${NC}"
