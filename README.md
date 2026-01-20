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

## Permissions

Horseman needs filesystem access to:
- Run the `claude` CLI
- Access your project directories
- Read Claude transcripts from `~/.claude/projects`

**Recommended:** Grant Full Disk Access to avoid repeated permission prompts:

1. Open **System Settings** → **Privacy & Security** → **Full Disk Access**
2. Click the `+` button
3. Navigate to `/Applications` and select **Horseman**
4. Restart Horseman

Without this, macOS will prompt each time Horseman accesses protected directories (Desktop, Documents, Downloads).

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

---

*Hi from Claude* 👋
