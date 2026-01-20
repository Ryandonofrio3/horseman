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
| Input history (Up/Down) | ✅ | ✅ | Cycles through user messages from store |
| Vim mode input | ❌ | ✅ | /vim command |
| Kill ring (Ctrl+Y) | ❌ | ✅ | Terminal emacs bindings |

---

## Slash Commands

| Command | Horseman | Claude Code | Notes |
|---------|----------|-------------|-------|
| `/clear` | ✅ | ✅ | |
| `/compact` | ✅ | ✅ | PTY-based with progress |
| `/help` | ✅ | ✅ | Static modal with shortcuts |
| `/exit` | N/A | ✅ | GUI has close button |
| `/status` | ❌ | ✅ | Version, model, account info |
| `/config` | ❌ | ✅ | Settings with search |
| `/context` | ❌ | ✅ | Context usage visualization |
| `/cost` | 🟡 | ✅ | We show cost in session, not historical |
| `/stats` | ❌ | ✅ | Daily usage, streaks, history |
| `/doctor` | ❌ | ✅ | Diagnostics, config issues |
| `/init` | ❌ | ✅ | See PLUGIN_SYSTEM_DESIGN.md - transcript watching pattern |
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
| `/export` | ✅ | ✅ | Copies markdown to clipboard |
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
| **Custom slash commands** | ❌ | ✅ | See PLUGIN_SYSTEM_DESIGN.md - ~/.claude/commands/*.md |

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

See **PLUGIN_SYSTEM_DESIGN.md** for full plugin system documentation.

| Feature | Horseman | Claude Code | Notes |
|---------|----------|-------------|-------|
| **Skills system** | ❌ | ✅ | ~/.claude/skills - SKILL.md + rules/ + metadata.json |
| **Hot-reload skills** | ❌ | ✅ | |
| **Skill frontmatter** | ❌ | ✅ | name, description, triggers |
| **Plugin marketplace** | ❌ | ✅ | /plugin discovery |
| **Plugin auto-update** | ❌ | ✅ | |
| **Custom agents** | ❌ | ✅ | /agents |

---

## Hooks

See **PLUGIN_SYSTEM_DESIGN.md** for full hook system documentation.

| Feature | Horseman | Claude Code | Notes |
|---------|----------|-------------|-------|
| **PreToolUse hooks** | ❌ | ✅ | Run before tool execution, can block |
| **PostToolUse hooks** | ❌ | ✅ | Run after tool execution |
| **Stop hooks** | ❌ | ✅ | Can continue session (ralph-loop pattern) |
| **SessionStart hooks** | ❌ | ✅ | Run when session begins |
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

## Keyboard Shortcuts ⭐ PRIORITY FOR v1

| Shortcut | Horseman | Claude Code | Notes |
|----------|----------|-------------|-------|
| Enter/Ctrl+Enter to send | ✅ | ✅ | |
| Shift+Enter newline | ✅ | ✅ | |
| Up/Down input history | ✅ | ✅ | Cycles through user messages |
| Cmd+K clear input | ✅ | ✅ | Clears input and pending files |
| Cmd+N new session | ✅ | ✅ | New tab in same directory |
| Cmd+W close tab | ✅ | ✅ | |
| Cmd+1-9 switch tabs | ✅ | ✅ | |
| Cmd+[ / ] | ✅ | ✅ | Prev/next tab |
| Esc stop generation | ✅ | ✅ | Interrupts when streaming |
| Cmd+F search | ✅ | N/A | GUI feature |
| Ctrl+G external editor | ❌ | ✅ | Post-v1 |
| Alt+P model switch | ❌ | ✅ | We have dropdown |
| Alt+T thinking toggle | ❌ | ✅ | Post-v1 |
| Ctrl+B background task | ❌ | ✅ | Post-v1 |
| Ctrl+O transcript mode | ❌ | ✅ | Post-v1 |
| Esc+Esc rewind | ❌ | ✅ | Post-v1 |
| Ctrl+R history search | ❌ | ✅ | Post-v1 (Up/Down first) |

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

### 🚀 v1 SHIP TARGETS

| Feature | Difficulty | Approach |
|---------|------------|----------|
| ~~**Keyboard shortcuts**~~ | ✅ Done | Global listener in App.tsx |
| ~~**Input history (Up/Down)**~~ | ✅ Done | ChatInput with user message history |
| ~~**/export**~~ | ✅ Done | Copies markdown to clipboard |
| ~~**/help**~~ | ✅ Done | HelpModal with shortcuts |
| **Image via file picker** | Medium | Workaround until paste/drag works |

### Post-v1 High Impact

**See PLUGIN_SYSTEM_DESIGN.md** for implementation plan.

| Feature | Difficulty | Notes |
|---------|------------|-------|
| Image paste/drag | Hard | Tauri clipboard limitations |
| Custom slash commands | Medium | PLUGIN_SYSTEM_DESIGN.md Phase 1 |
| Transcript watcher | Medium | PLUGIN_SYSTEM_DESIGN.md Phase 2 - enables /init streaming |
| Plugin discovery | Low | PLUGIN_SYSTEM_DESIGN.md Phase 3 |
| Skills system | Medium | PLUGIN_SYSTEM_DESIGN.md Phase 4 |
| Hooks system | Hard | PLUGIN_SYSTEM_DESIGN.md Phase 5 |
| Wildcard permissions | Medium | Glob matching |

### Post-v1 Nice to Have

- Background tasks (Ctrl+B)
- /rewind
- External editor (Ctrl+G)
- Session forking
- MCP server management UI
- Stats/usage visualization
- Plugin marketplace

---

## Notes

- ~~**Input history**: No extra storage needed - user messages already in store~~ ✅ Done
- ~~**Keyboard shortcuts**: Power user expectation, quick wins~~ ✅ Done
- **Image input**: File picker is pragmatic v1 workaround
- Skills/hooks are large systems - consider simplified versions
- Some slash commands better as GUI buttons/menus
- Terminal-specific features (OSC 8, vim mode) may not make sense in GUI

---

*Last updated: 2026-01-19 (v1 ship targets defined)*
