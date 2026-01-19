# Horseman: Claude Code GUI

## Read Order (Mandatory)

1. **This file** - Architecture + onboarding
2. **RULES.md** - Critical patterns that will break things if ignored
3. **DECISIONS.md** - *Why* things are the way they are (read before "fixing" anything)
4. **ARCHITECTURE_REFACTOR.md** - Refactor status and remaining work
5. **DIARY.md** - Historical context (some may be outdated)

If something looks wrong or you want to change a core pattern, **ASK the user first**.

---

## Glossary

| Term | Definition |
|------|------------|
| **uiId** | Our nanoid, generated when session created. Used for store keys, React keys, tabs. Always present. |
| **claudeSessionId** | Claude CLI's UUID. Null until first `system` event. Used for `--resume` and transcript paths. |
| **SessionState** | Store object containing `session` (metadata) + `messages[]` + tool indexes. |
| **discovered session** | Session loaded from `~/.claude/projects/` transcript, not created in Horseman. Has `isDiscovered: true`. |
| **tool indexes** | `toolsById`, `toolMessageIds`, `messageIndexById` - enable O(1) lookups instead of O(n) searches. |
| **horseman-event** | Unified Tauri event channel. All backend→frontend events flow through this with `source` wrapper. |
| **MCP** | Model Context Protocol. Used for permission requests via `horseman-mcp` binary. |
| **selector** | Function in `src/store/selectors.ts` that reads store with stable references. Always use these. |
| **SessionEvent** | Horseman's event log - context around the conversation that Claude doesn't track (compaction, permissions, slash commands). Persisted in `session.events[]`. |
| **subagent tools** | Tools from Task/subagent transcripts (separate .jsonl files). Merged into `toolsById` on load, have `parentToolId` pointing to their Task. |

---

## Vision

Native macOS GUI for Claude Code. Not a terminal wrapper - treats the CLI as an engine.

**Stack:** Tauri v2 | React 19 | TypeScript | Zustand 5 | Tailwind v4 | Bun

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      React Frontend                          │
│  Components read from store. Minimal logic. No parsing.      │
├─────────────────────────────────────────────────────────────┤
│  Zustand Store (SESSION-CENTRIC)                            │
│  sessions: Record<uiId, SessionState>                       │
│    └─ session, messages[], toolsById{}, indexes             │
├─────────────────────────────────────────────────────────────┤
│  useHorsemanEvents (SINGLE LISTENER)                        │
│  Listens to 'horseman-event', routes by source:             │
│    claude → session/message/tool updates                    │
│    hook   → permissions/questions                           │
│    slash  → PTY output                                      │
└──────────────────────────┬──────────────────────────────────┘
                           │ Tauri Events + Commands
┌──────────────────────────┴──────────────────────────────────┐
│                       Rust Backend                           │
│  ClaudeManager: spawn, stdout parsing, emit events          │
│  HookServer: HTTP for MCP permission callbacks              │
│  SlashPTY: PTY for interactive slash commands               │
└──────────────────────────┬──────────────────────────────────┘
              ┌────────────┴────────────┐
       ┌──────▼──────┐          ┌───────▼───────┐
       │   claude    │          │  ~/.claude/   │
       │   process   │          │  projects/    │
       └─────────────┘          └───────────────┘
```

---

## Directory Structure

```
src/
├── domain/                    # CANONICAL TYPES (single source of truth)
│   ├── session.ts             # Session, SessionHandle, SessionUsage, SessionEvent
│   ├── message.ts             # Message, ToolCall, FileBlock
│   ├── permission.ts          # PendingPermission
│   ├── question.ts            # PendingQuestion
│   ├── todo.ts                # TodoItem
│   └── protocol.ts            # BackendEvent (typed event union)
├── store/
│   ├── index.ts               # Combined store with persistence
│   ├── types.ts               # Store slice interfaces
│   ├── helpers.ts             # createSessionState, buildMessageIndexes
│   ├── selectors.ts           # Memoized selectors (USE THESE)
│   └── slices/                # sessions, chat, settings, permissions, questions, slash
├── hooks/
│   └── useHorsemanEvents.ts   # Single event listener for all backend events
├── components/
│   ├── chat/                  # ChatView, ChatInput, MessageList, ToolDisplay
│   ├── layout/                # AppLayout, Sidebar, TabBar
│   └── ui/                    # shadcn components
├── lib/
│   ├── ipc.ts                 # Typed Tauri command wrappers
│   ├── parseClaudeEvents.ts   # Event parsing (TEMP - moving to Rust)
│   └── tools.ts               # Tool icons and colors
└── types/                     # Legacy re-exports → @/domain

src-tauri/src/
├── lib.rs                     # App setup, plugin init
├── claude/process.rs          # ClaudeManager, spawn, emit events
├── commands/                  # Tauri commands
├── hooks/server.rs            # Axum HTTP server for MCP
└── slash/pty.rs               # PTY for slash commands

horseman-mcp/                  # Separate MCP server binary
└── src/main.rs                # Permission requests from Claude
```

---

## Key Abstractions

| Abstraction | Location | Why You Must Use It |
|-------------|----------|---------------------|
| Domain types | `@/domain` | Single source of truth. Legacy `@/types` re-exports these. |
| Selectors | `@/store/selectors` | Stable references prevent infinite re-renders. |
| Store actions | `@/store` slices | Maintain indexes automatically. Never mutate directly. |
| `useHorsemanEvents` | `@/hooks/useHorsemanEvents` | Single event listener. Don't create parallel listeners. |
| `ipc` | `@/lib/ipc` | Typed Tauri commands. Don't use `invoke` directly. |

---

## Store Architecture (Session-Centric)

### Core Types
```ts
interface SessionState {
  session: Session             // Metadata
  messages: ParsedMessage[]    // Chat history
  toolsById: Record<string, ToolCall>      // O(1) tool lookup
  toolMessageIds: Record<string, string>   // toolId → messageId
  messageIndexById: Record<string, number> // messageId → index
}

interface AppStore {
  sessions: Record<string, SessionState>  // Keyed by uiId
  activeSessionId: string | null
  openTabIds: string[]
  hiddenSessionIds: string[]
  pendingPermissions: PendingPermission[]  // Global (MCP limitation)
  pendingQuestions: PendingQuestion[]
  slash: SlashState
  // Settings...
}
```

### Why Indexes?
Tool updates arrive constantly. Without indexes = O(n) search per update. With indexes:
- `toolsById[toolId]` → O(1)
- `toolMessageIds[toolId]` → which message has this tool
- `messageIndexById[messageId]` → array position

### Persistence
**Persisted:** session metadata (including `events[]`), tabs, settings
**NOT persisted:** messages (rebuilt from transcripts), tool indexes, permissions

### Session Events (Horseman's Metadata Layer)
Claude owns the conversation. Horseman owns the context around it.

```ts
type SessionEvent =
  | { type: 'compacted'; timestamp: string; summary: string }
  | { type: 'permission'; timestamp: string; tool: string; allowed: boolean; path?: string }
  | { type: 'slash'; timestamp: string; command: string; status: 'completed' | 'error' }
```

**When logged:**
- `compacted`: After /compact completes, shows where Claude's context was reset
- `permission`: User approves/denies a tool in PermissionCard
- `slash`: /clear or /compact command finishes

**UI rendering:** Compaction events render as dividers in MessageList (amber styling).

---

## Two ID System

| ID | Source | Used For |
|----|--------|----------|
| `id` (uiId) | Horseman (nanoid) | Store keys, React keys, tabs |
| `claudeSessionId` | Claude CLI | `--resume`, transcript paths |

**Critical flow:**
```
1. createSession() → uiId generated, claudeSessionId = null
2. First message → spawn Claude (no --resume)
3. system event → extract Claude's session_id
4. updateSession(uiId, { claudeSessionId })
5. Follow-ups → --resume {claudeSessionId}
```

---

## Event System (Typed Protocol)

Single channel: `horseman-event` with typed `BackendEvent` payloads.

```ts
type BackendEvent =
  // Session lifecycle
  | { type: 'session.started'; uiSessionId: string; claudeSessionId: string }
  | { type: 'session.ended'; uiSessionId: string; exitCode: number | null; error?: string }

  // Messages (parsed in Rust, timestamps are ISO strings)
  | { type: 'message.assistant'; uiSessionId: string; message: Message }

  // Tools
  | { type: 'tool.started'; uiSessionId: string; tool: ToolCall }
  | { type: 'tool.updated'; uiSessionId: string; toolId: string; update: Partial<ToolCall> }
  | { type: 'tool.completed'; uiSessionId: string; toolId: string; output: string }
  | { type: 'tool.error'; uiSessionId: string; toolId: string; error: string }

  // State updates
  | { type: 'todos.updated'; uiSessionId: string; todos: TodoItem[] }
  | { type: 'usage.updated'; uiSessionId: string; usage: SessionUsage }

  // Permissions/Questions
  | { type: 'permission.requested'; requestId: string; toolName: string; toolInput: Record<string, unknown> }
  | { type: 'permission.resolved'; requestId: string }
  | { type: 'question.requested'; requestId: string; question: PendingQuestion }
  | { type: 'question.resolved'; requestId: string }

  // Slash commands
  | { type: 'slash.started'; commandId: string }
  | { type: 'slash.output'; commandId: string; data: string }
  | { type: 'slash.detected'; commandId: string; method: string }
  | { type: 'slash.completed'; commandId: string; exitCode: number | null }
  | { type: 'slash.error'; commandId: string; message: string }
```

**Key:** All parsing happens in Rust. Frontend receives typed, pre-parsed events.

---

## Selectors (ALWAYS USE THESE)

```ts
// src/store/selectors.ts - memoized, stable references

const sessions = useSessions()
const messages = useSessionMessages(sessionId)
const todos = useSessionTodos(sessionId)
const tool = useToolById(sessionId, toolId)
const allTools = useAllTools(sessionId)  // Includes subagent tools
const permissions = usePendingPermissions()
const events = useSessionEvents(sessionId)  // SessionEvent[]
```

**Never do this in components:**
```ts
// BAD - creates new array every render → infinite loop
const messages = useStore(s => s.sessions[id]?.messages ?? [])
```

---

## Data Flows

### Sending a Message (Live Streaming)
```
User types → ChatInput.handleSubmit
→ addMessage(uiId, userMessage)           // Optimistic UI
→ ipc.claude.spawn({ ui_session_id, working_directory, initial_prompt, ... })
→ [Rust] spawn with stdin=Stdio::null()   // CRITICAL - never pipe stdin
  - emit { type: 'session.started', uiSessionId, claudeSessionId }
→ [Rust] stdout reader parses NDJSON, parses events in Rust
  - emit { type: 'message.assistant', uiSessionId, message: {...} }
  - emit { type: 'tool.started', uiSessionId, tool: {...} }
  - emit { type: 'tool.completed', uiSessionId, toolId, output }
  - emit { type: 'todos.updated', uiSessionId, todos: [...] }
  - emit { type: 'usage.updated', uiSessionId, usage: {...} }
→ [Frontend] useHorsemanEvents handles typed events via switch
  - addMessage(), updateToolFields(), updateSession()
→ React renders from store
```

### Loading Transcript (Discovered Sessions)
```
User clicks discovered session
→ ipc.sessions.parseTranscript(transcriptPath)
→ [Rust] parse_transcript_with_subagents()
  - parse_transcript_content() parses main JSONL
  - Two-pass: collect tool_results, then apply to tools (see D016)
  - For each Task tool with agentId in output:
    - Load {agentId}.jsonl from same directory
    - Extract child tools, set parentToolId
    - Update Task.subagent.toolCount
  - returns TranscriptParseResult { messages, todos, usage, ..., subagentTools }
→ [Frontend] normalizeTranscriptMessage() converts timestamps
→ [Frontend] setMessages() builds main tool indexes
→ [Frontend] mergeSubagentTools() adds subagent tools to toolsById
→ [Frontend] converts summaries → session.events[] (compaction markers)
→ React renders history with SubagentDisplay showing child tools
```

### Permission Flow
```
Claude calls mcp__horseman__request_permission
→ horseman-mcp POSTs to localhost:{port}/permission
→ [Rust] emit { type: 'permission.requested', requestId, toolName, toolInput }
→ [Frontend] addPendingPermission()
→ PermissionCard renders (DON'T filter by session - MCP uses "mcp")
→ User approves/denies
→ ipc.permissions.respond(requestId, allow, options?)
→ [Rust] resolves oneshot channel
→ MCP returns to Claude
→ [Rust] emit { type: 'permission.resolved', requestId }
```

### Tool Lifecycle
```
1. [Rust] parses assistant event, creates Message with ToolCalls
   → emit { type: 'message.assistant', message: { toolCalls: [...] } }
   → emit { type: 'tool.started', tool } for each tool

2. (if permission needed) MCP flow happens

3. Tool executes

4. [Rust] parses user event with tool_result
   → emit { type: 'tool.completed', toolId, output }
   → Frontend updateToolOutput uses O(1) index lookup
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---------|---------------|-----|
| Direct store access with `?? []` | Creates new array every render → infinite loop | Use selectors |
| Modifying `messages[]` directly | Indexes become stale | Use store actions |
| Using global `usePendingPermissions()` | Shows all sessions' permissions, causes cross-session bleed | Use `useSessionPermissions(uiSessionId)` |
| Using `stdin(Stdio::piped())` | Claude blocks forever waiting for input | Use `Stdio::null()` |
| Not syncing refs to null | Session bleed - old session's events handled | Always sync refs, even to null |
| Importing from `@/types/session` | Legacy path, may be removed | Import from `@/domain` |
| Creating parallel event listeners | Events handled multiple times | Use `useHorsemanEvents` only |
| Parsing Claude JSON in frontend | Duplicates Rust logic, prone to drift | Rust parses, frontend renders |
| Using `Date` in Rust-emitted events | Serialization issues across Tauri | Use ISO strings, normalize in frontend |
| FlatMapping messages for allTools | Misses subagent tools (not in any message) | Use `useAllTools()` or pass `allTools` prop |

---

## CLI Commands

### New Session
```bash
claude -p \
  --verbose \
  --output-format stream-json \
  --mcp-config {cwd}/.horseman-mcp.json \
  --permission-prompt-tool mcp__horseman__request_permission \
  --model {model} \
  "{prompt}"
```

### Resume Session
```bash
claude -p \
  --verbose \
  --output-format stream-json \
  --mcp-config {cwd}/.horseman-mcp.json \
  --permission-prompt-tool mcp__horseman__request_permission \
  --resume {claudeSessionId} \
  --model {model} \
  "{prompt}"
```

---

## File Locations

| What | Where |
|------|-------|
| Claude transcripts | `~/.claude/projects/{escaped-cwd}/{session-id}.jsonl` |
| MCP config | `{cwd}/.horseman-mcp.json` |
| Debug log | `./horseman-debug.log` |
| Persisted state | Tauri app data directory |

---

## Debug

```bash
tail -f horseman-debug.log              # Watch live
grep "Resume session" horseman-debug.log # Session handling
grep STDERR horseman-debug.log          # Claude errors
```

Verify session isolation:
```
[SPAWN] Resume session: None        # New session (correct)
[SPAWN] Resume session: Some("x")   # Follow-up (correct)
```

If new sessions show `Some(...)`, ref sync is broken.

---

## Testing Checklist

After any change, verify:
- [ ] New session: create, send message, get response
- [ ] Follow-up: send second message in same session
- [ ] Session switch: switch sessions, no message bleed
- [ ] Discovered: click old session, history loads
- [ ] Permissions: tool requires approval, card appears, approve works
- [ ] Stop: interrupt running session
- [ ] Tabs: close tab, reopen from sidebar
- [ ] Console: no errors, no infinite loops
- [ ] Compaction: run /compact, status shows fixed (not pushed down), divider appears
- [ ] Discovered with compaction: load session with prior compactions, dividers show
- [ ] Tool status: historical tools show checkmarks (completed), not spinners
- [ ] Subagent tools: Task tools show tool count badge, child tools appear on expand

---

## Adding Features

### Checklist
1. Read RULES.md first
2. Check ARCHITECTURE_REFACTOR.md for conflicts with pending work
3. Import types from `@/domain`
4. Use selectors from `src/store/selectors.ts`
5. Go through store actions (maintains indexes)
6. Run testing checklist above

### How To: Add New Event Type
1. Add type to `HorsemanEvent` union in `useHorsemanEvents.ts`
2. Add switch case handler
3. Add store action if needed
4. Emit from Rust with matching structure

### How To: Add New Tool Display
1. Add case to `ToolDisplay.tsx` switch
2. Create component in `src/components/chat/`
3. Remember: Edit/Write return early (see RULES.md)

### How To: Add New Setting
1. Add to `SettingsSlice` interface in `src/store/types.ts`
2. Add to `createSettingsSlice` in `src/store/slices/settings.ts`
3. Add to `partialize` in `src/store/index.ts` if persisted
4. Add UI in settings panel

---

## Refactor Status

**See ARCHITECTURE_REFACTOR.md** for details:

| Step | Status | What |
|------|--------|------|
| 1. Protocol unification | ✅ DONE | Typed `BackendEvent` payloads, single listener |
| 2. Domain types | ✅ DONE | `src/domain/*` canonical |
| 3. Store restructure | ✅ DONE | Session-centric with O(1) tool indexes |
| 4. Move parsing to Rust | 🟡 IN PROGRESS | Live stream parsing done, transcript parsing moving |
| 5. Performance pass | ⬜ NOT STARTED | Virtualization, memoization |

### Step 4 Details (Current Work)
- Live streaming: Rust parses `assistant`/`user` events, emits typed `BackendEvent`
- Transcript loading: `ipc.sessions.parseTranscript()` → Rust `parse_transcript_content()`
- Timestamps: Rust emits ISO strings, frontend normalizes to `Date`
- Tool results: Rust matches `tool_result` to `tool_use_id`, sets status/output

---

## Not in v1

- Windows/Linux
- Multiple windows
- Git integration
- File tree browser
- Built-in terminal
- Themes beyond light/dark
- Plugin system
