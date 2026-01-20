# Feature Parity: Horseman vs Claude Code CLI

Tracking what Horseman can do vs the real Claude Code CLI.

**Legend:**
- ✅ = Implemented in Horseman
- 🟡 = Partial / different implementation
- ❌ = Not implemented
- 🔜 = Planned / in progress
- N/A = Not applicable to GUI

---

## Input Features

| Feature | Horseman | Claude Code | Notes |
|---------|----------|-------------|-------|
| Text input | ✅ | ✅ | |
| Multi-line input | ✅ | ✅ | |
| `@file` mentions | ✅ | ✅ | Fuzzy search autocomplete |
| `@directory` mentions | ✅ | ✅ | |
| Paste large text → attachment | ✅ | ✅ | >50 lines or >5000 chars |
| **Paste images** | ❌ | ✅ | Ctrl/Cmd+V in terminal |
| **Drag-drop images** | ❌ | ✅ | With source path metadata |
| **Screenshot paste** | ❌ | ✅ | macOS native |
| Binary file references | ❌ | ✅ | PDFs, images in @include |
| External editor (Ctrl+G) | ❌ | ✅ | Opens $EDITOR |
| Input history (Up/Down) | ❌ | ✅ | Cycle through previous prompts |
| Vim mode input | ❌ | ✅ | /vim command |
| Kill ring (Ctrl+Y) | ❌ | ✅ | Terminal emacs bindings |

---

## Slash Commands

| Command | Horseman | Claude Code | Notes |
|---------|----------|-------------|-------|
| `/clear` | ✅ | ✅ | |
| `/compact` | ✅ | ✅ | PTY-based with progress |
| `/help` | ❌ | ✅ | |
| `/exit` | N/A | ✅ | GUI has close button |
| `/status` | ❌ | ✅ | Version, model, account info |
| `/config` | ❌ | ✅ | Settings with search |
| `/context` | ❌ | ✅ | Context usage visualization |
| `/cost` | 🟡 | ✅ | We show cost in session, not historical |
| `/stats` | ❌ | ✅ | Daily usage, streaks, history |
| `/doctor` | ❌ | ✅ | Diagnostics, config issues |
| `/init` | ❌ | ✅ | Initialize CLAUDE.md |
| `/memory` | ❌ | ✅ | Edit CLAUDE.md files |
| `/login` | ❌ | ✅ | Switch accounts |
| `/logout` | ❌ | ✅ | |
| `/model` | 🟡 | ✅ | We have model selector, not command |
| `/plan` | ❌ | ✅ | Enter plan mode |
| `/permissions` | ❌ | ✅ | View/update permissions |
| `/review` | ❌ | ✅ | Code review |
| `/security-review` | ❌ | ✅ | Security review of changes |
| `/rewind` | ❌ | ✅ | Rewind conversation/code |
| `/resume` | 🟡 | ✅ | We have sidebar, not command |
| `/rename` | 🟡 | ✅ | We have inline rename |
| `/sandbox` | ❌ | ✅ | Isolated bash execution |
| `/terminal-setup` | N/A | ✅ | Terminal-specific |
| `/vim` | ❌ | ✅ | Vim mode toggle |
| `/theme` | 🟡 | ✅ | We have settings, not command |
| `/hooks` | ❌ | ✅ | Hook configuration |
| `/mcp` | ❌ | ✅ | MCP server management |
| `/plugin` | ❌ | ✅ | Plugin management |
| `/agents` | ❌ | ✅ | Manage custom agents |
| `/todos` | 🟡 | ✅ | We show in message footer |
| `/export` | ❌ | ✅ | Export conversation |
| `/bug` | ❌ | ✅ | Report bugs |
| `/add-dir` | ❌ | ✅ | Additional working directories |
| `/ide` | N/A | ✅ | IDE integrations |
| `/pr-comments` | ❌ | ✅ | View PR comments |
| `/install-github-app` | ❌ | ✅ | GitHub Actions setup |
| `/bashes` | ❌ | ✅ | Background task management |
| `/teleport` | ❌ | ✅ | Remote session resume |
| `/remote-env` | ❌ | ✅ | Remote session config |
| `/usage` | ❌ | ✅ | Plan usage/rate limits |
| `/release-notes` | ❌ | ✅ | |
| `/privacy-settings` | ❌ | ✅ | |
| `/output-style` | ❌ | ✅ | |
| `/statusline` | N/A | ✅ | Terminal status line |
| **Custom slash commands** | ❌ | ✅ | User-defined in .claude/commands/ |

---

## Session Management

| Feature | Horseman | Claude Code | Notes |
|---------|----------|-------------|-------|
| Create new session | ✅ | ✅ | |
| Resume session | ✅ | ✅ | --resume flag |
| Session tabs | ✅ | ❌ | GUI advantage |
| Session sidebar | ✅ | ❌ | GUI advantage |
| Discovered sessions | ✅ | ✅ | Load from ~/.claude/projects |
| Session renaming | ✅ | ✅ | |
| Session deletion | ✅ | ✅ | |
| Session forking | ❌ | ✅ | Fork with custom ID |
| Background tasks | ❌ | ✅ | Ctrl+B to background |
| Multiple working directories | ❌ | ✅ | /add-dir |
| Session teleport | ❌ | ✅ | Remote session to claude.ai |

---

## Tool Support

| Tool | Horseman | Claude Code | Notes |
|------|----------|-------------|-------|
| Read | ✅ | ✅ | |
| Write | ✅ | ✅ | |
| Edit | ✅ | ✅ | Diff display |
| Bash | ✅ | ✅ | |
| Glob | ✅ | ✅ | |
| Grep | ✅ | ✅ | |
| WebFetch | ✅ | ✅ | |
| WebSearch | ✅ | ✅ | |
| Task (subagents) | ✅ | ✅ | With child tool display |
| TodoWrite | ✅ | ✅ | Hidden, shown in footer |
| AskUserQuestion | ✅ | ✅ | |
| EnterPlanMode | ✅ | ✅ | |
| ExitPlanMode | ✅ | ✅ | |
| NotebookEdit | ❌ | ✅ | Jupyter support |
| Skill | ❌ | ✅ | Skills system |
| MCPSearch | ❌ | ✅ | Dynamic tool discovery |

---

## Permissions

| Feature | Horseman | Claude Code | Notes |
|---------|----------|-------------|-------|
| Per-tool permission prompts | ✅ | ✅ | Via MCP |
| Permission timeout | ✅ | ✅ | 170 seconds |
| Allow/Deny | ✅ | ✅ | |
| Deny with message | ✅ | ✅ | |
| Permission modes | ✅ | ✅ | default/plan/acceptEdits/bypass |
| **Wildcard permissions** | ❌ | ✅ | `Bash(npm *)`, `Bash(*-h*)` |
| **Agent-specific permissions** | ❌ | ✅ | `Task(AgentName)` |
| Persistent permission rules | ❌ | ✅ | Project/global rules |
| Session-only permissions | ❌ | ✅ | |
| Disallowed tools | ❌ | ✅ | --disallowedTools |

---

## Output & Display

| Feature | Horseman | Claude Code | Notes |
|---------|----------|-------------|-------|
| Markdown rendering | ✅ | ✅ | |
| Syntax highlighting | ✅ | ✅ | |
| Diff display | ✅ | ✅ | Split/unified |
| Tool status indicators | ✅ | ✅ | |
| Todo progress | ✅ | ✅ | |
| Context usage | ✅ | ✅ | Circular indicator |
| Cost tracking | ✅ | ✅ | Per-session |
| Streaming output | ✅ | ✅ | |
| **Image output display** | ❌ | ✅ | Clickable [Image #N] links |
| **Large output to disk** | ❌ | ✅ | >30K chars saved to file |
| **OSC 8 hyperlinks** | N/A | ✅ | Terminal file links |
| Compaction dividers | ✅ | ✅ | |
| **Thinking mode display** | ❌ | ✅ | Ctrl+O transcript mode |
| Turn duration | ❌ | ✅ | Optional toggle |

---

## MCP (Model Context Protocol)

| Feature | Horseman | Claude Code | Notes |
|---------|----------|-------------|-------|
| MCP permission server | ✅ | ✅ | horseman-mcp binary |
| MCP tool calls | ✅ | ✅ | Via Claude |
| **MCP server management** | ❌ | ✅ | /mcp command |
| **OAuth for MCP** | ❌ | ✅ | |
| **Multiple transports** | ❌ | ✅ | stdio, HTTP, SSE |
| **Auto-reconnection** | ❌ | ✅ | |
| **Tool filtering** | ❌ | ✅ | `mcp__server__*` wildcards |
| **Auto-enable threshold** | ❌ | ✅ | `auto:N` syntax |

---

## Skills & Plugins

| Feature | Horseman | Claude Code | Notes |
|---------|----------|-------------|-------|
| **Skills system** | ❌ | ✅ | ~/.claude/skills |
| **Hot-reload skills** | ❌ | ✅ | |
| **Skill frontmatter** | ❌ | ✅ | allowed-tools, context, etc. |
| **Plugin marketplace** | ❌ | ✅ | /plugin discovery |
| **Plugin auto-update** | ❌ | ✅ | |
| **Custom agents** | ❌ | ✅ | /agents |

---

## Hooks

| Feature | Horseman | Claude Code | Notes |
|---------|----------|-------------|-------|
| **PreToolUse hooks** | ❌ | ✅ | |
| **PostToolUse hooks** | ❌ | ✅ | |
| **Stop hooks** | ❌ | ✅ | |
| **SessionStart hooks** | ❌ | ✅ | |
| **Setup hooks** | ❌ | ✅ | --init, --maintenance |
| **Hook configuration UI** | ❌ | ✅ | /hooks |

---

## IDE Integration

| Feature | Horseman | Claude Code | Notes |
|---------|----------|-------------|-------|
| VSCode extension | ❌ | ✅ | |
| JetBrains extension | ❌ | ✅ | |
| Tab badges | ❌ | ✅ | Blue/orange indicators |
| Trust dialogs | ❌ | ✅ | |
| **Native macOS app** | ✅ | ❌ | GUI advantage |

---

## Keyboard Shortcuts

| Shortcut | Horseman | Claude Code | Notes |
|----------|----------|-------------|-------|
| Enter/Ctrl+Enter to send | ✅ | ✅ | |
| Shift+Enter newline | 🟡 | ✅ | Terminal needs setup |
| **Ctrl+G external editor** | ❌ | ✅ | |
| **Alt+P model switch** | ❌ | ✅ | |
| **Alt+T thinking toggle** | ❌ | ✅ | |
| **Ctrl+B background task** | ❌ | ✅ | |
| **Ctrl+O transcript mode** | ❌ | ✅ | |
| **Esc+Esc rewind** | ❌ | ✅ | |
| **Ctrl+R history search** | ❌ | ✅ | |
| Cmd+F search | ✅ | N/A | GUI feature |

---

## Configuration

| Feature | Horseman | Claude Code | Notes |
|---------|----------|-------------|-------|
| Theme (light/dark/system) | ✅ | ✅ | |
| Model selection | ✅ | ✅ | |
| Permission mode | ✅ | ✅ | |
| **Per-project settings** | ❌ | ✅ | settings.json |
| **Global settings** | 🟡 | ✅ | We have config file |
| **Release channel** | ❌ | ✅ | stable/latest |
| **Language setting** | ❌ | ✅ | |
| **Plans directory** | ❌ | ✅ | |
| **Prompt suggestions** | ❌ | ✅ | |
| **File suggestion config** | ❌ | ✅ | |
| **Managed settings** | ❌ | ✅ | Enterprise |

---

## Advanced Features

| Feature | Horseman | Claude Code | Notes |
|---------|----------|-------------|-------|
| Plan mode | 🟡 | ✅ | We support tools, not full workflow |
| **Checkpoints** | ❌ | ✅ | |
| **Parallel sub-agents** | ❌ | ✅ | |
| **Claude in Chrome** | ❌ | ✅ | Browser control |
| **Session teleport** | ❌ | ✅ | Local ↔ claude.ai |
| **Context forking** | ❌ | ✅ | context: fork |
| **Bedrock support** | ❌ | ✅ | AWS |
| **Vertex AI support** | ❌ | ✅ | Google Cloud |
| **Auto-continuation** | ❌ | ✅ | When output cut off |

---

## GUI-Only Features (Horseman Advantages)

| Feature | Notes |
|---------|-------|
| Tab-based session switching | Visual tabs at top |
| Session sidebar | Persistent list, search, sort |
| Visual permission cards | Timeout countdown, styled buttons |
| Collapsible tool displays | Expand/collapse per tool |
| Subagent tool badges | Shows child tool count |
| Inline session renaming | Click to edit |
| Hidden sessions | Archive discovered sessions |
| Context usage ring | Visual circular indicator |
| Copy message button | One-click copy |
| Search in conversation | Cmd+F with highlighting |

---

## Priority Gaps (Suggested Focus Areas)

### High Impact, Hard
1. **Image input** - Paste/drag images into chat
2. **Skills system** - ~/.claude/skills hot-reload
3. **Custom slash commands** - .claude/commands/ support
4. **Hooks system** - Pre/Post tool use hooks

### High Impact, Medium
5. **More slash commands** - /context, /doctor, /init, /memory
6. **Wildcard permissions** - `Bash(npm *)` patterns
7. **Input history** - Up/Down arrow cycling
8. **Plan mode workflow** - Full /plan experience

### Medium Impact
9. **Background tasks** - Ctrl+B to background
10. **Rewind** - /rewind conversation/code
11. **Export** - /export conversation
12. **External editor** - Ctrl+G support

### Nice to Have
13. Plugin/marketplace support
14. MCP server management UI
15. Stats/usage visualization
16. Session forking

---

## Notes

- Image input is hard because we're not a terminal - need file picker or drag-drop handling in Tauri
- Skills/hooks are large systems - consider if we want full parity or simplified versions
- Some slash commands can be GUI buttons/menus instead of typed commands
- Terminal-specific features (OSC 8, vim mode) may not make sense in GUI context

---

*Last updated: 2026-01-19*
