# Horseman Development Diary

## 2026-01-15 - Project Setup

### What We Built
Native macOS GUI for Claude Code using Tauri v2 + React 19 + TypeScript.

### Key Technical Learnings

#### Tailwind CSS v4
- No more `tailwind.config.js` - uses CSS-first configuration
- Vite plugin: `@tailwindcss/vite` instead of PostCSS
- Import with `@import "tailwindcss";` in CSS file
- Theme customization via `@theme {}` blocks in CSS

#### Tauri v2 Capabilities
- Permissions are namespaced differently than v1:
  - `clipboard:allow-read` → `clipboard-manager:allow-read-text`
  - `fs:allow-read` → `fs:read-all` or scoped like `fs:allow-read-file`
- Must use exact permission names from schema
- Plugins registered in `lib.rs` with `.plugin(tauri_plugin_xxx::init())`

#### shadcn/ui + Tailwind v4
- Works with `bunx shadcn@latest init`
- Automatically detects Tailwind v4 and configures CSS variables
- All 54 components available via `--all` flag

#### AI Elements
- Registry: `@ai-elements/all`
- 36 components for AI chat UIs (conversation, message, code-block, tool, etc.)
- Some components have `@ts-expect-error` for SDK v6 compatibility - safe to remove

#### react-resizable-panels v3
- Exports changed: `Group`, `Panel`, `Separator` (not `PanelGroup`, `PanelResizeHandle`)
- Check actual exports when shadcn component has type errors

#### TypeScript Config
- Need `ES2022` for `.at()` array method
- Path alias `@/*` requires both `tsconfig.json` and `vite.config.ts` configuration

### Project Structure Decisions
- Types in `src/types/` - separate files for claude, session, message, tool
- Store uses Zustand with slice pattern for modularity
- IPC wrapper in `src/lib/ipc.ts` for typed Tauri commands
- Hooks for business logic (useClaudeStream, useSession, usePermission)

---

## Next Up: Claude Code Integration

### The Big Picture
```
┌─────────────────────────────────────────────────────────┐
│                    Horseman App                          │
├─────────────────────────────────────────────────────────┤
│  React Frontend                                          │
│  ├─ Session UI (create, list, switch)                   │
│  ├─ Chat UI (messages, streaming, tools)                │
│  └─ Permission UI (approve/deny tool calls)             │
├─────────────────────────────────────────────────────────┤
│  Tauri Backend (Rust)                                    │
│  ├─ Process Manager (spawn claude, manage stdin/stdout) │
│  ├─ Stream Parser (NDJSON → events)                     │
│  └─ Hook Server (HTTP server for permission requests)   │
└─────────────────────────────────────────────────────────┘
         │                              ▲
         ▼                              │
┌─────────────────────────────────────────────────────────┐
│  Claude Code CLI                                         │
│  └─ claude --output-format stream-json --print-session  │
└─────────────────────────────────────────────────────────┘
```

### Phase 1: Basic Claude Spawning (NEXT)
1. Rust command to spawn `claude` process with flags
2. Capture stdout stream (NDJSON events)
3. Send events to frontend via Tauri events
4. Basic chat UI showing messages

### Phase 2: Interactive Sessions
1. Send user messages via stdin
2. Handle streaming responses
3. Display tool calls with collapsible details
4. Session persistence (resume via `--session-id`)

### Phase 3: Permission System
1. HTTP hook server in Rust (axum)
2. Configure Claude's `PreToolUse` hook
3. Modal UI for permission requests
4. Approve/deny via hook response

### Phase 4: Polish
1. Multiple concurrent sessions
2. Session history sidebar
3. Cost tracking
4. Keyboard shortcuts
5. Dark mode

---

## 2026-01-15 - Claude CLI Learnings (from tests/)

### CLI Flags for Headless Mode
```bash
claude -p \                              # Print mode (non-interactive)
  --output-format stream-json \          # NDJSON output
  --input-format stream-json \           # JSON input via stdin
  --verbose \                            # More detailed events
  --session-id UUID \                    # Create/name session
  --resume UUID \                        # Resume existing session
  --include-partial-messages \           # Token-by-token streaming
  --dangerously-skip-permissions \       # Auto-approve tools (dev only)
  "prompt"
```

### Event Types (from test_01)
- `system` - Init event with session_id, cwd, tools, model
- `assistant` - Complete assistant message with content array
- `user` - User message (usually tool_result)
- `result` - Final result with cost, duration, num_turns
- `content_block_delta` - Streaming token (with `--include-partial-messages`)

### Interactive Stdin (from test_stdin_queue)
Send JSON messages to stdin:
```json
{"type": "user", "message": {"role": "user", "content": "Your message"}}
```
- Messages queue while Claude is streaming
- Second message processed after first completes

### Session Persistence (from test_02)
- Transcripts stored in `~/.claude/projects/**/*.jsonl`
- `--session-id` creates named session
- `--resume` recalls full conversation context
- Sessions survive process restarts

### Hooks (from test_06)
Configure in `.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "curl ..."}]}],
    "PostToolUse": [...],
    "Stop": [...]
  }
}
```
- Hooks fire in `-p` mode
- Receive JSON payload via stdin
- Use for permission prompts, progress tracking

### Interruption (from test_followup)
- Wait for `content_block_delta` before SIGINT
- SIGTERM may allow cleaner shutdown
- Transcript written even on interrupt if content started

---

## Open Questions
- [x] Best way to handle Claude process lifecycle → Use SIGTERM, track streaming state
- [ ] Store sessions in SQLite or just JSON files?
- [ ] How to handle very long tool outputs (truncation UI?)

---

## 2026-01-15 - Phase 1 Implementation

### What We Built

#### Rust Backend (`src-tauri/src/`)
- `claude/process.rs` - ClaudeManager for spawning and managing Claude processes
  - Spawn with configurable working directory, initial prompt, resume session
  - stdout/stderr/stdin capture via separate threads
  - NDJSON parsing and event emission to frontend
  - SIGTERM-based interruption
- `commands/claude.rs` - Tauri commands exposed to frontend:
  - `spawn_claude_session` - Start new or resume existing session
  - `send_claude_message` - Write JSON message to stdin
  - `interrupt_claude_session` - Send SIGTERM
  - `is_claude_running` - Check process state
  - `remove_claude_session` - Cleanup
- `debug.rs` - File-based debug logging system

#### Frontend (`src/`)
- `App.tsx` - Basic chat UI with:
  - Sidebar with session list
  - Folder picker for new sessions
  - Message display (user/assistant/system)
  - Tool call rendering (collapsible)
  - Input field with Send/Stop buttons
  - Loading indicator
- `hooks/useClaudeStream.ts` - Event listener for `claude-event` Tauri events
- `lib/ipc.ts` - Typed wrapper for Tauri commands

### Technical Decisions

#### Sync vs Async
- Initially used `tokio::spawn` but hit "no reactor running" error
- Switched to `std::thread` + `std::sync::mpsc` for simplicity
- Tauri commands are now sync (no async runtime needed)
- Still have Tokio dep for future axum hook server

#### Debug Logging
- Writes to `~/horseman-debug.log`
- Also prints to stderr for dev console
- Tagged with component: `[CMD]`, `[SPAWN]`, `[STDOUT]`, `[STDERR]`, `[STDIN]`, `[EMIT]`
- Cleared on app startup

### How to Debug

```bash
# Watch debug log in real-time
tail -f ~/horseman-debug.log

# View last 50 lines
tail -50 ~/horseman-debug.log

# Search for errors
grep ERROR ~/horseman-debug.log
```

### Current Status
- App launches successfully
- Session creation works (folder picker)
- Claude process spawns correctly
- **ISSUE**: No stdout events received from Claude after spawn

### Files Modified/Created
```
src-tauri/src/
├── lib.rs              # Added debug module, commands registration
├── debug.rs            # NEW - Debug logging system
├── claude/
│   ├── mod.rs          # Module declaration
│   └── process.rs      # ClaudeManager implementation
└── commands/
    ├── mod.rs          # Module declaration
    └── claude.rs       # Tauri commands

src/
├── App.tsx             # Complete rewrite with chat UI
├── hooks/
│   └── useClaudeStream.ts  # Event listener hook
├── lib/
│   └── ipc.ts          # Tauri command wrappers
└── store/              # Zustand slices (sessions, chat, settings)

legacy_useful/          # MOVED from src/ - reference components for later
```

### Cargo Dependencies Added
- `tokio = { version = "1", features = ["full"] }` - Async runtime (for future use)
- `uuid = { version = "1", features = ["v4"] }` - Session IDs
- `libc = "0.2"` - Unix signals
- `once_cell = "1"` - Lazy static for debug logger
- `chrono = "0.4"` - Timestamps in logs

---

## Current Debug Session

### Problem
Claude process spawns but produces no stdout output.

### Log Output
```
[10:16:20.533] [SPAWN] Command: claude -p --output-format stream-json --input-format stream-json --verbose --dangerously-skip-permissions --session-id UUID hi
[10:16:20.536] [SPAWN] Process spawned with PID: 78331
[10:16:20.536] [STDOUT] Reader thread started
... (nothing after this)
```

### Hypotheses
1. Claude waiting for something (TTY? environment?)
2. Buffering issue (stdout not flushed)
3. Initial prompt via CLI arg not working with `--input-format stream-json`
4. Process exited immediately with error

### Next Steps
- Check if Claude process is still running
- Try sending initial prompt via stdin instead of CLI arg
- Check stderr for errors
- Test Claude command manually with same flags

---

## 2026-01-15 - BREAKTHROUGH: Stdout Capture Fixed + Session Discovery

### The Problem
Claude process spawned but stdout reader blocked forever - no events received.

### Root Cause: Piped stdin blocks Claude
When spawning with `stdin(Stdio::piped())`, Claude blocks waiting for input even when a prompt is passed as CLI argument. This is true even WITHOUT `--input-format stream-json`.

**Test that proved it:**
```rust
// BLOCKS FOREVER:
Command::new("claude")
    .args(["-p", "--output-format", "stream-json", "hi"])
    .stdin(Stdio::piped())  // <-- THIS IS THE PROBLEM
    .stdout(Stdio::piped())
    .spawn()

// WORKS PERFECTLY:
Command::new("claude")
    .args(["-p", "--output-format", "stream-json", "hi"])
    .stdin(Stdio::null())   // <-- FIX: Don't pipe stdin
    .stdout(Stdio::piped())
    .spawn()
```

### The Fix
1. **Use `Stdio::null()` for stdin** when spawning with initial prompt
2. **For follow-up messages, use `--resume`** instead of stdin
   - Spawn new process: `claude -p --output-format stream-json --resume {session_id} "follow-up message"`
   - This avoids the complexity of keeping stdin open

### Session Discovery from ~/.claude/projects/
Added Rust commands to discover existing Claude sessions:
- `list_claude_sessions` - Scans `~/.claude/projects/` for all `.jsonl` transcripts
- `list_sessions_for_directory` - Filter by working directory
- `read_session_transcript` - Read transcript content

**Path decoding:** Claude escapes paths like `/Users/foo/bar` → `-Users-foo-bar`

### What Works Now
- ✅ App launches
- ✅ Session list shows ALL past Claude sessions from `~/.claude/projects/`
- ✅ Can select a session and see its working directory
- ✅ Send "hi" and get response displayed in UI
- ✅ Tool calls render (collapsible)
- ✅ Cost displayed in result

### What's Janky
- Session list is flat (no grouping by project)
- No message history loaded when selecting existing session
- Follow-up messages untested with --resume approach
- UI needs polish

### Files Changed
```
src-tauri/src/
├── debug.rs              # Log now writes to ./horseman-debug.log (local)
├── claude/process.rs     # stdin(Stdio::null()) fix
├── commands/claude.rs    # send_claude_message uses --resume
└── commands/sessions.rs  # NEW: Session discovery from ~/.claude/

src/
├── App.tsx               # Loads discovered sessions on startup
├── lib/ipc.ts            # Added sessions.listAll(), etc.
└── hooks/useClaudeStream.ts  # Added workingDirectory state
```

### Key Insight
**Don't fight stdin.** Claude's `-p` mode with piped stdin has complex buffering behavior. The simpler approach:
1. Pass prompt as CLI argument
2. Use `--resume` for follow-ups (spawn new process each time)
3. Let Claude manage session state via transcripts

This trades some overhead (process spawn per message) for simplicity and reliability.

---

## 2026-01-15 - UI Overhaul

### What We Built

Completely rewrote the UI using a proper component architecture based on the legacy UI patterns:

#### New Component Structure
```
src/components/
├── chat/
│   ├── ChatView.tsx       # Main chat container with header, messages, input
│   ├── ChatInput.tsx      # Uses ai-elements PromptInput component
│   ├── MessageList.tsx    # Renders messages with proper styling
│   ├── ToolDisplay.tsx    # Collapsible tool call display
│   ├── types.ts           # ParsedMessage, ToolCall types
│   └── index.ts           # Exports
├── layout/
│   ├── AppLayout.tsx      # Root layout with sidebar + main
│   ├── Sidebar.tsx        # Session list grouped by project
│   └── index.ts           # Exports
└── ai-elements/           # Pre-built UI components (shadcn-style)
```

#### Key Improvements
1. **Proper Layout Isolation** - Sidebar and main panel don't affect each other's scrolling
2. **Sessions Grouped by Project** - Sidebar groups sessions by working directory, sorted by date
3. **Clean Message Rendering** - Uses ai-elements Message, MessageContent, MessageResponse components
4. **Polished Input** - Uses ai-elements PromptInput with proper styling
5. **Tool Display** - Collapsible tool calls with status badges and output preview
6. **Typing Indicator** - Shows when Claude is thinking

#### Layout Fix
The key CSS pattern for isolated scrolling:
```tsx
// Parent container
<div className="flex h-screen w-screen overflow-hidden">
  <aside className="w-64 h-full shrink-0 overflow-hidden">...</aside>
  <main className="flex-1 h-full min-w-0 overflow-hidden">...</main>
</div>

// Chat view
<div className="flex flex-col h-full overflow-hidden">
  <header className="shrink-0">...</header>
  <div className="flex-1 min-h-0 overflow-hidden">
    <Conversation>...</Conversation>
  </div>
  <footer className="shrink-0">...</footer>
</div>
```

### What's NOT Wired Up Yet

From the legacy components, these features are NOT implemented:

#### Chat Features (from EnhancedChatInput)
- [ ] File attachments (images, code files)
- [ ] @mentions for file references
- [ ] /commands (slash commands like /model, /clear, /compact)
- [ ] Model switching
- [ ] Permission mode switching
- [ ] Extended thinking toggle
- [ ] Context usage indicator
- [ ] Message queue (sending while Claude is running)
- [ ] Double-Esc to stop

#### Message Features (from MessageList)
- [ ] File references display (CollapsibleFileBlock)
- [ ] File edit display (FileEditBlock with diffs)
- [ ] Search highlighting
- [ ] Copy button on messages
- [ ] Context cleared/compacted dividers
- [ ] Bash result display (terminal style)
- [ ] Plan approval UI
- [ ] Permission approval UI
- [ ] AskUserQuestion UI
- [ ] TodoList display

#### Tool Features (from ToolDisplay)
- [ ] Diff display for Edit tool
- [ ] Syntax highlighting for Read tool
- [ ] Terminal output for Bash tool
- [ ] Subagent display (Task tool with children)

#### Layout Features
- [ ] TabBar for multiple open sessions
- [ ] Sidebar collapse toggle
- [ ] Settings modal

#### Backend Features Needed
- [ ] Session resume (--resume flag)
- [ ] Session history loading from transcripts
- [ ] Hook server for permissions

### Files Changed
```
src/
├── App.tsx                      # Simplified, uses new components
├── components/
│   ├── chat/
│   │   ├── ChatView.tsx         # NEW - Main chat container
│   │   ├── ChatInput.tsx        # NEW - Uses PromptInput
│   │   ├── MessageList.tsx      # NEW - Clean message rendering
│   │   ├── ToolDisplay.tsx      # NEW - Tool call display
│   │   ├── types.ts             # NEW - UI types
│   │   └── index.ts             # NEW - Exports
│   ├── layout/
│   │   ├── AppLayout.tsx        # UPDATED - Proper flex isolation
│   │   ├── Sidebar.tsx          # UPDATED - Groups by project
│   │   └── index.ts             # NEW - Exports
│   └── ai-elements/
│       └── tool.tsx             # UPDATED - Added preview prop, awaiting-input state
├── lib/
│   └── parseClaudeEvents.ts     # NEW - Event parsing utility
```

---

## 2026-01-15 - Tab Bar & Layout Polish

### What We Built

#### Tab Bar for Multiple Sessions
- Created `TabBar.tsx` component with horizontal scrolling tabs
- Each tab shows session status indicator (colored dot) and name
- Close button on hover, new tab button at right
- When sidebar is collapsed, shows expand button in tab bar

#### Store Enhancements
- Added `openTabIds: string[]` to track which sessions are open as tabs
- Added `openTab(id)` / `closeTab(id)` actions
- When closing active tab, switches to adjacent tab automatically
- Added `sidebarCollapsed: boolean` with `toggleSidebar()` action

#### Layout Improvements
- Sidebar now has collapse button (PanelLeftClose icon)
- Smooth collapse animation with `transition-all duration-200`
- Tab bar appears above main content area
- New tab button creates session in same working directory (no folder picker)

#### Independent Scrolling Fix
- Added `min-h-0` to flex containers for proper scroll containment
- Added `overflow-hidden` to sidebar inner container
- Both sidebar session list and chat messages scroll independently

### Files Changed/Created
```
src/
├── constants.ts                    # NEW - STATUS_COLORS for session indicators
├── store/
│   ├── types.ts                    # UPDATED - Added openTabIds, sidebarCollapsed
│   └── slices/
│       ├── sessions.ts             # UPDATED - Tab management actions
│       └── settings.ts             # UPDATED - Sidebar collapse actions
├── components/
│   └── layout/
│       ├── AppLayout.tsx           # UPDATED - Sidebar collapse, tab bar slot
│       ├── TabBar.tsx              # NEW - Horizontal session tabs
│       ├── Sidebar.tsx             # UPDATED - Collapse button, min-h-0 fix
│       └── index.ts                # UPDATED - Export TabBar
└── App.tsx                         # UPDATED - handleNewTabInSameDirectory
```

---

## Current Feature Status

### ✅ WORKING
- Session creation with folder picker
- Session discovery from ~/.claude/projects/
- Session list grouped by project in sidebar
- Tab bar for multiple open sessions
- Sidebar collapse/expand
- Independent sidebar/chat scrolling
- Basic message rendering
- Tool call display with collapsible details
- Streaming indicator
- Stop button (SIGTERM)
- New tab in same directory

### 🚧 PARTIALLY WORKING
- Session resume (--resume flag implemented in backend, not fully wired in UI)
- Follow-up messages (works via --resume but state management needs work)

### ❌ NOT IMPLEMENTED

#### Chat Features
- [ ] File attachments (images, code files)
- [ ] @mentions for file references
- [ ] /commands (slash commands)
- [ ] Model switching
- [ ] Permission mode switching
- [ ] Extended thinking toggle
- [ ] Context usage indicator
- [ ] Message queue while streaming
- [ ] Double-Esc to stop

#### Message Features
- [ ] File edit display with diffs
- [ ] Search highlighting
- [ ] Copy button on messages
- [ ] Context cleared/compacted dividers
- [ ] Bash result display (terminal style)
- [ ] Plan approval UI
- [ ] Permission approval UI
- [ ] AskUserQuestion UI
- [ ] TodoList display

#### Tool Features
- [ ] Diff display for Edit tool
- [ ] Syntax highlighting for Read tool
- [ ] Terminal output for Bash tool
- [ ] Subagent display (Task tool with children)

#### Backend Features
- [ ] Hook server for permissions
- [ ] Session history loading from transcripts
- [ ] Proper session state management per tab

### Next Steps
1. Wire up session resume properly (per-session state)
2. Add file attachments support
3. Implement permission approval flow (hook server)
4. Add tool-specific displays (diffs, terminal output)

---

## 2026-01-15 - Transcript Loading & Critical Bug Fixes

### What We Built
- Transcript loading when selecting old sessions
- CLI badge for discovered sessions
- Session name truncation (20 chars max)
- Tool collapse behavior (collapsed by default for history)

### Critical Bugs Fixed

#### 1. Badge Disappearing When Clicking Session
**Problem**: CLI badge disappeared when clicking a discovered session.

**Root Cause**: The `isDiscovered` property was computed dynamically in Sidebar based on whether the session came from the discovered list vs store. When you click a discovered session, it gets added to the store, so on next render it's marked as `isDiscovered: false`.

**Fix**: Added `isDiscovered?: boolean` to the Session type. Set it explicitly when adding discovered sessions to the store. Sidebar now reads from this property instead of computing it.

#### 2. Messages Mixing Between Sessions
**Problem**: Clicking different sessions caused their messages to mix together.

**Root Cause**: The `loadMessagesForSession` function was calling `setMessages()` unconditionally, ignoring which session was currently active. Due to React's batched state updates, the check `sessionId === uiSessionId` used stale values from the closure.

**Fix**:
1. Added `uiSessionIdRef` that syncs **synchronously** on every render (not in an effect)
2. `loadMessagesForSession` checks `sessionId === uiSessionIdRef.current` before updating displayed messages
3. If session doesn't match, messages are stored in map but not displayed (the effect will pick them up when session switches)

#### 3. User Messages Not Appearing
**Problem**: After sending a message, neither the user's message nor Claude's response appeared.

**Root Cause**: In `parseClaudeEvents`, user messages were only added when paired with an assistant response:
```js
if (type === 'assistant') {
  // User message added here, INSIDE the assistant block
  if (userMessageIndex < userMessages.length) {
    messages.push(userMessages[userMessageIndex])
  }
}
```
If there's no assistant message (e.g., only a system event), user messages never appear.

**Fix**: Added loop at the end of `parseClaudeEvents` to add any remaining unpaired user messages:
```js
while (userMessageIndex < userMessages.length) {
  messages.push(userMessages[userMessageIndex])
  userMessageIndex++
}
```

#### 4. Duplicate Key Errors in React
**Problem**: Console flooded with "Encountered two children with the same key" errors.

**Root Cause**: We were using Claude's message IDs (`msg_01XyX...`) as React keys. In transcripts, the same message can appear multiple times (streaming updates), causing duplicate keys.

**Fix**: Use our generated UUID (`msg.id` from `crypto.randomUUID()`) instead of Claude's message ID for React keys.

### Key Technical Insight: Ref Timing in React

When dealing with async operations that span state updates:

```js
// BAD: Closure captures stale value
const loadMessages = useCallback((sessionId, msgs) => {
  if (sessionId === uiSessionId) {  // uiSessionId is stale!
    setMessages(msgs)
  }
}, [uiSessionId])

// GOOD: Ref updated synchronously each render
const uiSessionIdRef = useRef(uiSessionId)
uiSessionIdRef.current = uiSessionId  // Sync on EVERY render

const loadMessages = useCallback((sessionId, msgs) => {
  if (sessionId === uiSessionIdRef.current) {  // Always current
    setMessages(msgs)
  }
}, [])
```

The ref assignment in the component body runs synchronously during render, BEFORE any effects. This ensures the ref is always up-to-date when async callbacks execute.

### Files Changed
```
src/
├── types/session.ts              # Added isDiscovered?: boolean
├── hooks/useClaudeStream.ts      # Ref timing fix, loadMessagesForSession safety
├── lib/parseClaudeEvents.ts      # User message fix, unique keys
├── components/
│   ├── layout/Sidebar.tsx        # CLI badge, name truncation, use session.isDiscovered
│   └── chat/
│       ├── MessageList.tsx       # Pass isStreaming to ToolDisplay
│       └── ToolDisplay.tsx       # Accept isStreaming, control defaultOpen
└── App.tsx                       # Set isDiscovered on discovered sessions
```

---

## 2026-01-15 - Tool Display & Syntax Highlighting

### What We Built

Complete overhaul of tool display with proper syntax highlighting and todo integration.

#### Tool Display Improvements

**New `src/lib/tools.ts`** - Centralized tool icons and colors:
- Read: File icon (blue)
- Write: FileEdit (green)
- Edit: FileEdit (amber)
- Bash: Terminal (purple)
- Glob/Grep: Folder/Search (cyan)
- WebFetch/WebSearch: Globe/Search (indigo)
- Task: Bot (cyan)
- TodoWrite: ListTodo (emerald)
- AskUserQuestion: MessageCircleQuestion (pink)

**Updated `ai-elements/tool.tsx`**:
- Tool-specific icons instead of generic WrenchIcon
- Compact status indicators (icons only, no text badges):
  - Running: spinning Loader2 (blue)
  - Completed: Check icon (green)
  - Error: X icon (red)
  - Awaiting: pulsing Circle (amber)
- ChevronRight that rotates 90° when open (cleaner than 180° flip)
- Better styling with `border-border/40` and `bg-card/50`

**Fixed `ToolDisplay.tsx` doubling bug**:
- Edit and Write tools now always `return` early
- No more fall-through to secondary renderers
- Proper `hasContent` check that handles Edit/Write inputs

#### Syntax Highlighting with @pierre/diffs

**`src/components/chat/CodeDisplay.tsx`**:
- Uses `File` from `@pierre/diffs/react`
- Automatic language detection from filename
- Theme-aware (light/dark/system)

**`src/components/chat/DiffDisplay.tsx`**:
- Uses `MultiFileDiff` from `@pierre/diffs/react`
- Unified diff view with red/green indicators
- Handles empty/identical content gracefully

**`src/lib/diffs.ts`** - Theme utilities for @pierre/diffs integration

#### Todo List Feature

**`src/types/session.ts`**:
- Added `TodoItem` interface with content, status, activeForm
- Added `currentTodos?: TodoItem[]` to Session type

**`src/components/chat/TodoList.tsx`**:
- Collapsible list showing completed/total count
- Shows current in-progress task when collapsed
- Expandable to see all todos with status icons (Check, Loader2, Circle)
- Positioned above chat input (special treatment, not in messages)

**Updated `parseClaudeEvents.ts`**:
- Extracts todos from TodoWrite tool calls
- Returns `{ messages, currentTodos }` object

**Updated `App.tsx`**:
- Passes `currentTodos` to ChatView
- Updates session when todos change via useEffect

### Technical Notes

#### @pierre/diffs Integration
- Uses Shiki under the hood for syntax highlighting
- Theme detection via `getDiffsThemeType()` helper
- CSS fallback (`DIFFS_UNSAFE_CSS_FALLBACK`) for browser compatibility
- File language detection based on filename extension

#### Tool Rendering Order (in ToolOutputContent)
1. Edit → DiffDisplay (always returns)
2. Write → CodeDisplay (always returns)
3. Read → CodeDisplay
4. Bash → Terminal style pre
5. Glob/Grep → Muted pre
6. Default → Plain pre

### Known Issues

**Session Isolation Bug**: Multiple chats in the same folder seem to share memory/state. This suggests the session ID handling or message storage is broken somewhere. Needs investigation.

### Files Changed/Created
```
src/
├── lib/
│   ├── tools.ts               # NEW - Tool icons and colors
│   ├── diffs.ts               # NEW - @pierre/diffs theme utilities
│   └── parseClaudeEvents.ts   # UPDATED - Returns { messages, currentTodos }
├── types/session.ts           # UPDATED - TodoItem, currentTodos
├── components/
│   ├── ai-elements/tool.tsx   # UPDATED - Tool icons, compact status
│   └── chat/
│       ├── CodeDisplay.tsx    # NEW - Syntax highlighted code
│       ├── DiffDisplay.tsx    # NEW - Syntax highlighted diffs
│       ├── TodoList.tsx       # NEW - Collapsible todo list
│       ├── ToolDisplay.tsx    # UPDATED - Fixed doubling, uses new displays
│       └── ChatView.tsx       # UPDATED - Shows TodoList above input
└── App.tsx                    # UPDATED - Passes currentTodos to ChatView

package.json                   # Added @pierre/diffs dependency
```

---

## Current Feature Status

### ✅ WORKING
- Session creation with folder picker
- Session discovery from ~/.claude/projects/
- Session list grouped by project in sidebar
- Tab bar for multiple open sessions
- Sidebar collapse/expand
- Independent sidebar/chat scrolling
- Message rendering with markdown
- Tool call display with tool-specific icons
- Syntax highlighting for Read tool output
- Diff display for Edit tool
- Streaming indicator with compact status icons
- Stop button (SIGTERM)
- New tab in same directory
- Todo list display above chat input

### 🐛 KNOWN BUGS
- **Session isolation**: Multiple chats in same folder share state (memory leak across sessions?)

### ❌ NOT IMPLEMENTED
- File attachments
- @mentions
- /commands
- Model switching
- Permission mode switching
- Hook server for permissions
- Terminal emulation for Bash (using plain pre for now)
- Subagent display (Task tool with children)

---

## 2026-01-15 - Context Menu + Deferred Features

### What We Built
- Added right-click context menu to session items in Sidebar
- Uses shadcn ContextMenu component
- Menu items: Rename, Delete (with separator, delete styled destructive)
- Fixed TabBar horizontal scroll (added `w-max` to inner container)

### Deferred: Session Rename/Delete

**Problem**: Where does session name live?

Our metadata stores `session.name` locally, but Claude Code also has session naming via `/rename` command which uses hooks. If we rename locally only, our name diverges from Claude's.

**Decision**: Leave Rename and Delete as no-ops until hook server is implemented.

**Why**:
- Rename should sync with Claude's system (via hooks) to stay consistent
- Delete needs to decide: delete our metadata only, or also the transcript file?
- Both decisions depend on understanding the hook system better

**What works now**:
- Context menu appears on right-click
- Menu items are styled correctly
- Clicking does nothing (intentional)

### Files Changed
```
src/components/layout/
├── Sidebar.tsx   # Added ContextMenu with Rename/Delete items
└── TabBar.tsx    # Fixed horizontal scroll with w-max
```
