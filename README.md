# Horseman

Native macOS GUI for Claude Code.

> **Early Alpha** - This is a work in progress. Expect bugs, crashes, and missing features.

## Requirements

- macOS 10.15+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

## Install

1. Download `Horseman.dmg` from [Releases](https://github.com/ryandonofrio3/horseman/releases)
2. Open the .dmg and drag Horseman to Applications
3. **First launch:** Right-click the app → Open → Open (bypasses Gatekeeper warning for unsigned apps)

## Build from Source

```bash
# Install dependencies
bun install

# Dev mode
bun tauri dev

# Release build
bun tauri build
```

Output: `src-tauri/target/release/bundle/macos/Horseman.app`

## License

Apache 2.0 - see [LICENSE](LICENSE)
