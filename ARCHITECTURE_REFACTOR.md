# Horseman Architecture Refactor Plan

**Created:** 2026-01-17
**Purpose:** Guide for long-running coding agent to refactor Horseman's architecture

---

## Context

Horseman is a native macOS GUI for Claude Code (Tauri v2 + React 19 + TypeScript). The codebase has grown organically and now suffers from fragmented state, leaky abstractions, and unclear domain boundaries. React Scan shows consistent 30 FPS (should be 60). This refactor establishes foundations for future features (image upload, permission modes, hooks integration, etc.).

### Constraints (from product owner)
- **Session deletion** = UI state only, never delete transcript files
- **Multi-window** = Not a concern, single window only
- **Claude CLI versioning** = Must adapt to CLI changes, can't pin version
- **Transcript viewing** = Already works offline by clicking old sessions

---

## Status (Updated)

**Legend:** ✅ done · 🟡 in progress · ⬜ not started

### Step 1: Protocol Unification
✅ Completed.
- Backend emits typed `BackendEvent` payloads directly on `horseman-event` (no source wrapper).
- Frontend listener handles protocol events in `useHorsemanEvents`.
- Rust now emits session/message/tool/todo/usage/permission/question/slash events.

### Step 2: Domain Types
✅ Completed.
- Added `src/domain/*` canonical types and re-exported via legacy `src/types/*`.
- Migrated frontend imports to `@/domain`.

### Step 3: Store Restructure
✅ Completed (Record-based).
- Session-centric store state with per-session messages and tool indexes.
- Selectors (`src/store/selectors.ts`) and core consumers migrated (App, ChatView, TabBar, useSession).
- Persist stores session metadata only; messages/tool indexes are regenerated.

### Step 4: Move Parsing to Rust
✅ Completed.
- Live stream parsing and transcript parsing both live in Rust.
- Frontend now loads parsed transcripts via a Rust command.
- Rust parses `"type": "summary"` events from transcripts (for compaction history).
- `TranscriptParseResult` includes `summaries: Vec<TranscriptSummary>` for discovered sessions.

### Step 5: Performance Pass
⬜ Not started.

---

## Problem Areas

### 1. Identity Crisis: Two IDs Everywhere

| ID | Source | Usage |
|----|--------|-------|
| `id` (nanoid) | Horseman | Store keys, React keys, tabs |
| `claudeSessionId` | Claude CLI | `--resume`, transcripts |

**Current pain:**
- Functions inconsistently require one or both
- `discoveredSessions` use Claude's ID as both (conflating them)
- MCP permissions use `sessionId: "mcp"` (useless)
- Ref sync bugs when switching sessions (documented in RULES.md)

### 2. State Fragmentation

Current slices in `src/store/slices/`:
- `sessions.ts`: Session metadata
- `chat.ts`: Messages keyed by sessionId
- `permissions.ts`: Pending permissions (no session correlation)
- `questions.ts`: Pending questions (no session correlation)
- `settings.ts`: Global app settings

**Problems:**
- Messages separated from session they belong to
- Permissions/questions have no session context (MCP doesn't provide it)
- `updateToolOutput` searches ALL messages via `flatMap` - O(n) per tool result
- No indexing of tools by ID

### 3. Three Communication Channels, No Unification

| Channel | Used For | Direction |
|---------|----------|-----------|
| Tauri IPC commands | spawn, interrupt, respond | Frontend → Backend |
| Tauri events | claude-event, hook-event, slash-event | Backend → Frontend |
| HTTP (Axum) | MCP permission callbacks | External → Backend |

Each channel has its own event types, serialization, and handling code.

### 4. Parsing Split Between Rust and TypeScript

| Location | What it does |
|----------|--------------|
| `src/lib/parseClaudeEvents.ts` | Transcript parsing + event parsing |
| `src/hooks/useClaudeStream.ts` | Inline event type checking + state updates |
| `src-tauri/src/claude/process.rs` | Tool tracking, parent-child linking |

Business logic (tool linking, todo extraction) split with no clear boundary.

### 5. React Performance Issues (30 FPS)

Identified causes:
1. `MessageList` filters messages on every render
2. `allTools = messages.flatMap(m => m.toolCalls || [])` - O(n) per render
3. Inline object creation in JSX props
4. Store selectors not consistently memoized
5. No virtualization for long message lists

---

## Refactor Steps (In Order)

### Step 1: Protocol Unification

**Goal:** Single event type, single listener, unified handling.

**Create `src/domain/protocol.ts`:**
```ts
// All backend → frontend messages
export type BackendEvent =
  // Session lifecycle
  | { type: 'session.started'; uiSessionId: string; claudeSessionId: string }
  | { type: 'session.ended'; uiSessionId: string; exitCode: number | null; error?: string }

  // Messages
  | { type: 'message.user'; uiSessionId: string; message: Message }
  | { type: 'message.assistant'; uiSessionId: string; message: Message }
  | { type: 'message.streaming'; uiSessionId: string; messageId: string; delta: string }

  // Tools
  | { type: 'tool.started'; uiSessionId: string; tool: ToolCall }
  | { type: 'tool.updated'; uiSessionId: string; toolId: string; update: Partial<ToolCall> }
  | { type: 'tool.completed'; uiSessionId: string; toolId: string; output: string }
  | { type: 'tool.error'; uiSessionId: string; toolId: string; error: string }

  // Todos
  | { type: 'todos.updated'; uiSessionId: string; todos: TodoItem[] }

  // Usage
  | { type: 'usage.updated'; uiSessionId: string; usage: SessionUsage }

  // Permissions (global - MCP doesn't know session)
  | { type: 'permission.requested'; requestId: string; toolName: string; toolInput: Record<string, unknown> }
  | { type: 'permission.resolved'; requestId: string }

  // Questions
  | { type: 'question.requested'; requestId: string; question: PendingQuestion }
  | { type: 'question.resolved'; requestId: string }

  // Slash commands (PTY)
  | { type: 'slash.started'; commandId: string }
  | { type: 'slash.output'; commandId: string; data: string }
  | { type: 'slash.detected'; commandId: string; method: string }
  | { type: 'slash.completed'; commandId: string; exitCode: number | null }
  | { type: 'slash.error'; commandId: string; message: string }
```

**Update Rust (`src-tauri/src/`) to emit these events:**
- Modify `claude/process.rs` to emit typed events
- Single Tauri event channel: `horseman-event`
- All parsing happens in Rust before emission

**Update Frontend:**
- Single listener in `src/hooks/useHorsemanEvents.ts`
- Dispatch to store based on event type
- Remove `useClaudeStream.ts`, `usePermissions.ts` separate listeners

**Files to modify:**
- `src-tauri/src/claude/process.rs` - emit typed events
- `src-tauri/src/hooks/server.rs` - emit typed permission events
- `src-tauri/src/slash/mod.rs` - emit typed slash events
- `src/hooks/useClaudeStream.ts` → `src/hooks/useHorsemanEvents.ts`
- Delete `src/hooks/usePermissions.ts` (merged into above)

---

### Step 2: Domain Types

**Goal:** Canonical types in one place, shared understanding.

**Create `src/domain/` directory:**

```
src/domain/
├── index.ts           # Re-exports everything
├── protocol.ts        # BackendEvent (from step 1)
├── session.ts         # Session types
├── message.ts         # Message, tool types
├── permission.ts      # Permission types
├── question.ts        # Question types
└── todo.ts            # Todo types
```

**`src/domain/session.ts`:**
```ts
export interface SessionHandle {
  uiId: string           // Our nanoid, always present
  claudeId: string | null  // Claude's UUID, null until first system event
}

export type SessionStatus =
  | 'idle'
  | 'running'
  | 'waiting_permission'
  | 'waiting_question'
  | 'error'

export interface SessionMetadata {
  name: string
  workingDirectory: string
  createdAt: Date
  isDiscovered: boolean  // Loaded from CLI transcript vs created in app
}

export interface SessionUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number
}
```

**`src/domain/message.ts`:**
```ts
export interface Message {
  id: string              // Our UUID for React keys
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCall[]
  fileBlocks?: FileBlock[]
  timestamp: Date
  isStreaming?: boolean
}

export interface ToolCall {
  id: string              // Claude's tool_use_id
  name: string
  input: Record<string, unknown>
  status: ToolStatus
  output?: string
  error?: string
  parentToolId?: string   // For subagent children
  startedAt?: Date
  endedAt?: Date
  subagent?: SubagentInfo
}

export type ToolStatus = 'pending' | 'running' | 'completed' | 'error'

export interface SubagentInfo {
  type: string
  description: string
  model?: string
}

export interface FileBlock {
  id: string
  content: string
  name: string
  language?: string
  lineCount: number
}
```

**`src/domain/todo.ts`:**
```ts
export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string
}
```

**`src/domain/permission.ts`:**
```ts
export interface PendingPermission {
  requestId: string
  toolName: string
  toolInput: Record<string, unknown>
  toolUseId?: string
  timestamp: Date
}
```

**`src/domain/question.ts`:**
```ts
export interface PendingQuestion {
  requestId: string
  question: string
  options: QuestionOption[]
  timestamp: Date
}

export interface QuestionOption {
  label: string
  value: string
}
```

**Migration:**
- Update all imports to use `@/domain`
- Delete `src/types/session.ts`
- Delete `src/components/chat/types.ts`
- Update `src/store/types.ts` to import from domain

---

### Step 3: Store Restructure

**Goal:** Sessions as primary entity, tools indexed, cleaner selectors.

**New store structure (`src/store/index.ts`):**
```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SessionHandle, SessionMetadata, SessionStatus, SessionUsage, Message, ToolCall, TodoItem, PendingPermission, PendingQuestion } from '@/domain'

interface SessionState {
  handle: SessionHandle
  metadata: SessionMetadata
  status: SessionStatus
  messages: Message[]
  toolsById: Map<string, ToolCall>  // Indexed for O(1) lookup
  todos: TodoItem[]
  usage: SessionUsage | null
}

interface AppState {
  // Sessions
  sessions: Map<string, SessionState>  // Keyed by uiId
  activeSessionId: string | null
  openTabIds: string[]
  hiddenSessionIds: string[]

  // Global (MCP doesn't provide session context)
  pendingPermissions: PendingPermission[]
  pendingQuestions: PendingQuestion[]

  // Settings
  theme: 'light' | 'dark' | 'system'
  sidebarCollapsed: boolean
  model: string
}

interface AppActions {
  // Session management
  createSession: (workingDir: string) => string  // Returns uiId
  updateSession: (uiId: string, updates: Partial<SessionState>) => void
  deleteSession: (uiId: string) => void  // UI only, not transcript
  setActiveSession: (uiId: string | null) => void

  // Tab management
  openTab: (uiId: string) => void
  closeTab: (uiId: string) => void

  // Messages
  addMessage: (uiId: string, message: Message) => void
  updateMessageStreaming: (uiId: string, messageId: string, delta: string) => void

  // Tools (O(1) operations)
  setTool: (uiId: string, tool: ToolCall) => void
  updateTool: (uiId: string, toolId: string, updates: Partial<ToolCall>) => void

  // Todos
  setTodos: (uiId: string, todos: TodoItem[]) => void

  // Permissions/Questions (global)
  addPermission: (permission: PendingPermission) => void
  removePermission: (requestId: string) => void
  addQuestion: (question: PendingQuestion) => void
  removeQuestion: (requestId: string) => void

  // Settings
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  toggleSidebar: () => void
  setModel: (model: string) => void
}

export type Store = AppState & AppActions
```

**Key changes:**
- `toolsById: Map<string, ToolCall>` enables O(1) tool updates instead of O(n) search
- Sessions contain their own messages (no separate `messages[sessionId]`)
- Clearer action names
- Persistence only for: sessions (metadata only, not messages), openTabIds, hiddenSessionIds, settings

**Selectors (`src/store/selectors.ts`):**
```ts
import { useStore } from './index'
import { useMemo } from 'react'

// Stable empty arrays to prevent re-renders
const EMPTY_MESSAGES: Message[] = []
const EMPTY_TODOS: TodoItem[] = []

export function useActiveSession() {
  return useStore((s) => {
    if (!s.activeSessionId) return null
    return s.sessions.get(s.activeSessionId) ?? null
  })
}

export function useSessionMessages(uiId: string | null) {
  const session = useStore((s) => uiId ? s.sessions.get(uiId) : null)
  return session?.messages ?? EMPTY_MESSAGES
}

export function useSessionTodos(uiId: string | null) {
  const session = useStore((s) => uiId ? s.sessions.get(uiId) : null)
  return session?.todos ?? EMPTY_TODOS
}

export function useToolById(uiId: string | null, toolId: string) {
  const session = useStore((s) => uiId ? s.sessions.get(uiId) : null)
  return session?.toolsById.get(toolId) ?? null
}
```

**Migration:**
- Rewrite `src/store/index.ts`
- Delete individual slice files (consolidate)
- Update all components to use new selectors
- Update `useHorsemanEvents.ts` to dispatch to new actions

---

### Step 4: Move Parsing to Rust

**Goal:** Frontend is dumb renderer. Rust emits fully parsed events.

**Current flow:**
```
Claude stdout → Rust (raw JSON) → Tauri event → TS (parse) → Store
```

**New flow:**
```
Claude stdout → Rust (parse + emit typed) → Tauri event → Store
```

**Rust changes (`src-tauri/src/claude/process.rs`):**

1. Parse Claude's JSON in Rust
2. Extract tool calls, todos, usage from events
3. Generate our UUIDs for messages
4. Emit `BackendEvent` variants directly

```rust
// New types in src-tauri/src/types.rs
#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BackendEvent {
    SessionStarted { ui_session_id: String, claude_session_id: String },
    SessionEnded { ui_session_id: String, exit_code: i32, error: Option<String> },

    MessageUser { ui_session_id: String, message: Message },
    MessageAssistant { ui_session_id: String, message: Message },
    MessageStreaming { ui_session_id: String, message_id: String, delta: String },

    ToolStarted { ui_session_id: String, tool: ToolInfo },
    ToolUpdated { ui_session_id: String, tool_id: String, update: serde_json::Value },
    ToolCompleted { ui_session_id: String, tool_id: String, output: String },
    ToolError { ui_session_id: String, tool_id: String, error: String },

    TodosUpdated { ui_session_id: String, todos: Vec<TodoItem> },
    UsageUpdated { ui_session_id: String, usage: SessionUsage },

    PermissionRequested { request_id: String, tool_name: String, tool_input: serde_json::Value },
    PermissionResolved { request_id: String },

    QuestionRequested { request_id: String, question: QuestionInfo },
    QuestionResolved { request_id: String },

    SlashOutput { command_id: String, data: String },
    SlashCompleted { command_id: String, exit_code: i32 },
}

#[derive(Serialize, Clone)]
pub struct Message {
    pub id: String,  // Our UUID
    pub role: String,
    pub text: String,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub file_blocks: Option<Vec<FileBlock>>,
    pub timestamp: String,  // ISO 8601
    pub is_streaming: Option<bool>,
}

// etc. for other types
```

**Frontend simplification:**

`src/hooks/useHorsemanEvents.ts`:
```ts
import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useStore } from '@/store'
import type { BackendEvent } from '@/domain/protocol'

export function useHorsemanEvents() {
  const store = useStore()

  useEffect(() => {
    const unlisten = listen<BackendEvent>('horseman-event', ({ payload }) => {
      switch (payload.type) {
        case 'session.started':
          store.updateSession(payload.uiSessionId, {
            handle: { uiId: payload.uiSessionId, claudeId: payload.claudeSessionId }
          })
          break

        case 'message.assistant':
          store.addMessage(payload.uiSessionId, payload.message)
          break

        case 'tool.started':
          store.setTool(payload.uiSessionId, payload.tool)
          break

        case 'tool.completed':
          store.updateTool(payload.uiSessionId, payload.toolId, {
            status: 'completed',
            output: payload.output,
            endedAt: new Date()
          })
          break

        // etc.
      }
    })

    return () => { unlisten.then(fn => fn()) }
  }, [store])
}
```

**Delete these files:**
- `src/lib/parseClaudeEvents.ts`
- Complex parsing logic in `useClaudeStream.ts`

---

### Step 5: Performance Pass

**Goal:** 60 FPS, smooth scrolling with 1000+ messages.

**5a. Virtualization**

Install: `bun add @tanstack/react-virtual`

Update `MessageList.tsx`:
```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

export function MessageList({ messages }: { messages: Message[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,  // Estimate, will measure
    overscan: 5,
  })

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: virtualItem.start,
              width: '100%',
            }}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
          >
            <MessageItem message={messages[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

**5b. Memoization**

Wrap components:
```tsx
// MessageItem.tsx
export const MessageItem = memo(function MessageItem({ message }: { message: Message }) {
  // ...
})

// ToolDisplay.tsx
export const ToolDisplay = memo(function ToolDisplay({ tool }: { tool: ToolCall }) {
  // ...
})
```

Use `useMemo` for derived data:
```tsx
// In MessageList
const visibleMessages = useMemo(
  () => messages.filter(m => !m.isHidden),
  [messages]
)
```

**5c. Stable References**

Move constants outside components:
```tsx
// BAD - new object every render
<Component style={{ color: 'red' }} />

// GOOD - stable reference
const redStyle = { color: 'red' }
<Component style={redStyle} />
```

**5d. React Compiler (optional)**

If using React 19, enable the compiler in `vite.config.ts`:
```ts
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
})
```

---

## CLI Version Compatibility

**Problem:** Claude CLI evolves, event schemas change.

**Solution:** Version detection + graceful degradation.

```rust
// In process.rs, extract from system event
fn detect_cli_version(system_event: &serde_json::Value) -> Option<String> {
    system_event.get("version")?.as_str().map(String::from)
}

// Warn on unknown versions
if !KNOWN_VERSIONS.contains(&version) {
    warn!("Unknown Claude CLI version: {}. Some features may not work.", version);
}
```

```ts
// In store, track CLI version
interface SessionState {
  cliVersion?: string
  // ...
}

// In components, feature-flag based on version
function supportsFeature(version: string | undefined, feature: string): boolean {
  // ...
}
```

---

## File Structure After Refactor

```
src/
├── domain/                    # Canonical types
│   ├── index.ts
│   ├── protocol.ts           # BackendEvent
│   ├── session.ts
│   ├── message.ts
│   ├── permission.ts
│   ├── question.ts
│   └── todo.ts
├── store/
│   ├── index.ts              # Single store file
│   └── selectors.ts          # Memoized selectors
├── hooks/
│   └── useHorsemanEvents.ts  # Single event listener
├── components/
│   ├── chat/
│   │   ├── ChatView.tsx
│   │   ├── ChatInput.tsx
│   │   ├── MessageList.tsx   # Virtualized
│   │   ├── MessageItem.tsx   # Memoized
│   │   ├── ToolDisplay.tsx   # Memoized
│   │   └── ...
│   └── ...
└── lib/
    ├── ipc.ts                # Typed Tauri commands
    └── ...                   # Utilities only, no parsing

src-tauri/src/
├── lib.rs
├── types.rs                  # BackendEvent, Message, etc.
├── claude/
│   └── process.rs            # All parsing here
├── commands/
│   └── ...
├── hooks/
│   └── server.rs             # Emits typed events
└── slash/
    └── pty.rs                # Emits typed events
```

---

## Testing the Refactor

After each step, verify:

1. **Step 1 (Protocol):** Events still flow, no regressions
2. **Step 2 (Types):** TypeScript compiles, no type errors
3. **Step 3 (Store):** Sessions work, tabs work, messages display
4. **Step 4 (Rust parsing):** Same behavior, cleaner code
5. **Step 5 (Performance):** React Scan shows 60 FPS, smooth scroll

**Smoke tests:**
- Create new session, send message, get response
- Switch between sessions
- Load discovered session, view history
- Approve/deny permission
- Answer question
- Stop running session
- Close/reopen tabs

---

## Notes for Agent

- **Read RULES.md first** - contains critical patterns that must be preserved
- **Read DIARY.md** - contains history of bugs and fixes
- **Don't break stdin handling** - `Stdio::null()` is intentional (see RULES.md)
- **Two ID system is intentional** - don't try to unify into one ID
- **Refs must always sync** - including to null (see RULES.md section on refs)
- **Test after each step** - don't batch multiple steps

**When stuck:** The CLAUDE.md, RULES.md, and DIARY.md files contain extensive context on why things are the way they are. Check them before making changes that seem wrong.

**Note:** Onboarding content has been moved to CLAUDE.md for a single source of truth.
