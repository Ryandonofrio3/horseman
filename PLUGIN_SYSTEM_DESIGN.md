# Plugin System Design: Commands, Skills, Hooks, and Transcript Watching

This document captures our research into how Claude Code CLI's plugin ecosystem works and how Horseman can support it.

**Status:** Research complete, implementation not started
**Date:** 2026-01-19

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Key Insight](#the-key-insight)
3. [Directory Structure](#directory-structure)
4. [Custom Commands](#custom-commands)
5. [Skills System](#skills-system)
6. [Hooks System](#hooks-system)
7. [Rules System](#rules-system)
8. [Transcript Watching Pattern](#transcript-watching-pattern)
9. [Implementation Plan](#implementation-plan)
10. [Research Notes](#research-notes)

---

## Executive Summary

Claude Code CLI has a rich plugin ecosystem consisting of:
- **Commands** - User-defined slash commands (markdown files with prompts)
- **Skills** - Context injections with rules and metadata
- **Hooks** - Lifecycle scripts (Stop, PreToolUse, PostToolUse, SessionStart)
- **Rules** - Persistent context files injected into every session

The critical discovery: **The transcript file is the universal interface**. The CLI writes structured JSONL events in real-time, and both hooks and external tools can read it to observe Claude's behavior.

This means Horseman can support the entire plugin ecosystem by:
1. Reading definitions from `~/.claude/`
2. Expanding and sending prompts to Claude
3. Watching transcript files for responses
4. Running hook scripts at lifecycle points

---

## The Key Insight

### The Problem We Were Trying to Solve

Slash commands like `/init` run through PTY (pseudo-terminal) because they need interactive CLI context. But PTY output is messy ANSI-encoded terminal output that's hard to parse.

### The Discovery

Even when running through PTY, Claude CLI writes clean JSONL events to the transcript file (`~/.claude/projects/{path}/{session}.jsonl`) **in real-time**.

```
┌─────────────────────────────────────────────────────────────┐
│ PTY Session                                                 │
│  stdin  → "/init\n"                                         │
│  stdout → ANSI garbage (ignore this)                        │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ ~/.claude/projects/{path}/{session}.jsonl                   │
│  - Written in real-time (we verified ~1 line/second)        │
│  - Clean NDJSON format                                      │
│  - Same format we already parse for session loading         │
└─────────────────────────────────────────────────────────────┘
```

### Verification

We tested this empirically:

```python
# Sent "just say hi" via PTY, watched transcript
t+0s:  498 lines
t+2s:  499 lines (+1)
t+3s:  500 lines (+1)
...
t+12s: 506 lines

# Transcript updates in real-time!
```

### Two Categories of Slash Commands

| Category | Examples | Invokes Claude? | Transcript? |
|----------|----------|-----------------|-------------|
| **A: Claude-invoking** | /init, /review, /compact | Yes | assistant/user events appear |
| **B: CLI-internal** | /help, /status, /context | No | Only progress heartbeats |

For Category A, transcript watching gives us full streaming capability.
For Category B, we should reimplement as native GUI features.

---

## Directory Structure

```
~/.claude/
├── CLAUDE.md                    # Global user instructions
├── settings.json                # Plugin enables, hooks config, statusline
├── history.jsonl                # Command history across sessions
│
├── commands/                    # USER'S CUSTOM SLASH COMMANDS
│   └── *.md                     # Each file = one /command
│
├── skills/                      # USER'S CUSTOM SKILLS
│   └── {skill-name}/
│       ├── SKILL.md             # Main skill definition
│       ├── metadata.json        # Config and triggers
│       └── rules/               # Rule files to inject
│
├── rules/                       # USER'S CUSTOM RULES (always injected)
│   └── {rule-name}/
│       └── *.md
│
├── plugins/                     # INSTALLED PLUGINS
│   ├── cache/                   # Active versions (extracted)
│   │   └── {publisher}-{repo}/
│   │       └── {plugin-name}/
│   │           └── {version}/
│   │               ├── commands/
│   │               ├── skills/
│   │               └── hooks/
│   │
│   └── marketplaces/            # Git repository clones
│       └── {publisher}-{repo}/
│           └── plugins/
│               └── {plugin-name}/
│
├── projects/                    # SESSION TRANSCRIPTS
│   └── {escaped-cwd}/           # e.g., -Users-ryan-Desktop-horseman
│       └── {session-id}.jsonl   # One file per session
│
├── plans/                       # Plan mode working files
│   └── {adjective}-{verb}-{noun}.md
│
├── todos/                       # TodoWrite state files
├── file-history/                # File snapshots for rewind
├── session-env/                 # Per-session environment
├── paste-cache/                 # Pasted content cache
├── shell-snapshots/             # Shell state snapshots
└── statsig/                     # Feature flags
```

### Path Escaping

The CLI escapes directory paths for transcript storage:
- `/Users/ryan/Desktop/horseman` → `-Users-ryan-Desktop-horseman`
- Leading slash becomes leading dash
- All slashes become dashes

```rust
fn escape_path(path: &str) -> String {
    path.replace('/', "-")
    // Note: keeps leading dash from leading slash
}
```

---

## Custom Commands

### Location

- User commands: `~/.claude/commands/*.md`
- Plugin commands: `~/.claude/plugins/cache/{plugin}/commands/*.md`

### Format

```markdown
---
description: Short description shown in autocomplete
argument-hint: [optional-arg-placeholder]
allowed-tools: Bash(git:*), Edit, Write
user-invocable: true
---

Your prompt here. This gets sent to Claude when the command runs.

Available variables:
- $ARGUMENTS - Everything the user typed after the command
- $CLAUDE_PLUGIN_ROOT - Path to the plugin directory (for plugin commands)
```

### Example: /interview Command

```markdown
---
description: Interview user about a plan and write detailed spec
argument-hint: [plan-file-path]
---

Read the plan at $ARGUMENTS and interview me in depth using the AskUserQuestion tool.

Interview requirements:
- Ask about technical implementation details, UI/UX decisions, concerns, and tradeoffs
- Go beyond obvious questions - dig into edge cases, failure modes, and non-obvious implications
- Continue interviewing iteratively until we've covered the plan comprehensively
- Group related questions together (max 4 per ask)
- After the interview is complete, write a detailed spec to the same file or a new spec file

Do not proceed to writing until I confirm the interview is complete.
```

### Example: /commit-push-pr Command (from plugin)

```markdown
---
allowed-tools: Bash(git checkout --branch:*), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(gh pr create:*)
description: Commit, push, and open a PR
---

## Context
...
```

### Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Shown in autocomplete menu |
| `argument-hint` | string | Placeholder text for arguments |
| `allowed-tools` | string | Comma-separated tool permissions (grants for this command) |
| `user-invocable` | bool | If false, can only be called by other commands/skills |

### Variable Expansion

| Variable | Expands To |
|----------|------------|
| `$ARGUMENTS` | User input after command name |
| `$CLAUDE_PLUGIN_ROOT` | Plugin directory path |
| `${VARIABLE}` | Environment variable |

---

## Skills System

### Location

- User skills: `~/.claude/skills/{skill-name}/`
- Plugin skills: `~/.claude/plugins/cache/{plugin}/skills/{skill-name}/`

### Structure

```
vercel-react-best-practices/
├── SKILL.md              # Main skill definition (required)
├── metadata.json         # Configuration
├── README.md             # Documentation
├── rules/                # Rule files (injected into context)
│   ├── async-parallel.md
│   ├── bundle-barrel-imports.md
│   └── ...
├── src/                  # Optional: skill tools/scripts
└── AGENTS.md             # Optional: full compiled content
```

### SKILL.md Format

```markdown
---
name: vercel-react-best-practices
description: React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimization, or performance improvements.
---

# Vercel React Best Practices

Comprehensive performance optimization guide...

## When to Apply

Reference these guidelines when:
- Writing new React components or Next.js pages
- Implementing data fetching (client or server-side)
...
```

### metadata.json Format

```json
{
  "name": "vercel-react-best-practices",
  "version": "1.0.0",
  "description": "...",
  "triggers": {
    "patterns": ["React", "Next.js", "performance"],
    "fileTypes": ["tsx", "jsx", "ts", "js"]
  },
  "context": {
    "inject": "always" | "on-trigger" | "manual"
  }
}
```

### How Skills Work

1. **Discovery**: CLI scans `~/.claude/skills/` and enabled plugins
2. **Trigger Detection**: Based on file types, patterns, or explicit invocation
3. **Context Injection**: SKILL.md and rules/ contents added to context
4. **Tool Availability**: If skill has src/, those tools become available

---

## Hooks System

### Location

- Plugin hooks: `~/.claude/plugins/cache/{plugin}/hooks/`

### hooks.json Format

```json
{
  "description": "Ralph Loop plugin stop hook for self-referential loops",
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/stop-hook.sh"
          }
        ]
      }
    ],
    "SessionStart": [...],
    "PreToolUse": [...],
    "PostToolUse": [...]
  }
}
```

### Hook Types

| Hook | When Fired | Can Block? | Input |
|------|------------|------------|-------|
| `SessionStart` | Session begins | No | Session metadata |
| `Stop` | Claude stops responding | Yes (continue) | transcript_path, stop_reason |
| `PreToolUse` | Before tool executes | Yes (deny) | tool_name, tool_input |
| `PostToolUse` | After tool executes | No | tool_name, tool_output |

### Hook Input (stdin)

Hooks receive JSON on stdin:

```json
{
  "transcript_path": "/Users/.../.claude/projects/.../session.jsonl",
  "stop_reason": "end_turn",
  "session_id": "abc-123",
  "tool_name": "Bash",
  "tool_input": { "command": "ls" }
}
```

### Hook Output (exit code + stdout)

| Exit Code | Meaning |
|-----------|---------|
| 0 | Allow / Continue normally |
| 1+ | Block / Stop |

Stdout can contain:
- Messages to display to user
- For PreToolUse: JSON with modified tool_input
- For Stop: Content to feed back to Claude (ralph-loop pattern)

### Example: Ralph Loop Stop Hook

This hook reads the transcript to continue conversations:

```bash
#!/bin/bash
# Read hook input
HOOK_INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path')

# Check if loop is active
if [[ ! -f ".claude/ralph-loop.local.md" ]]; then
  exit 0  # Allow exit
fi

# Extract last assistant message from transcript
LAST_OUTPUT=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1 | jq -r '
  .message.content |
  map(select(.type == "text")) |
  map(.text) |
  join("\n")
')

# Feed it back to Claude (stdout becomes next input)
echo "$LAST_OUTPUT"
exit 1  # Block exit, continue with stdout as input
```

**Key insight**: Hooks can read the transcript to make decisions!

---

## Rules System

### Location

- User rules: `~/.claude/rules/{rule-name}/*.md`
- Plugin rules: Inside skills or standalone

### How Rules Work

Rules are simpler than skills - they're just markdown files that get injected into every session's context.

```
~/.claude/rules/
└── delegator/
    ├── orchestration.md
    ├── model-selection.md
    ├── triggers.md
    └── delegation-format.md
```

These files appear in the system context (you can see them in your CLAUDE.md context).

### Difference from Skills

| Aspect | Rules | Skills |
|--------|-------|--------|
| Injection | Always | On trigger or manual |
| Structure | Just .md files | SKILL.md + metadata + rules/ |
| Metadata | None | metadata.json |
| Tools | No | Can have src/ |

---

## Transcript Watching Pattern

### Transcript Format

Each line is a JSON object:

```jsonl
{"type":"system","sessionId":"abc-123",...}
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"hello"}]}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}]}}
{"type":"progress","data":{"type":"heartbeat"}}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"xyz"}]}}
```

### Event Types

| Type | Contains | When |
|------|----------|------|
| `system` | Session metadata | Session start |
| `user` | User messages, tool_results | User input, tool completion |
| `assistant` | Claude's response, tool_use | Claude responding |
| `progress` | Heartbeat, status | Continuous during processing |
| `result` | Final result | Turn complete |
| `file-history-snapshot` | File states | Periodically |

### Real-Time Watching

```rust
// Pseudocode for transcript watcher
struct TranscriptWatcher {
    path: PathBuf,
    last_position: u64,
}

impl TranscriptWatcher {
    fn poll(&mut self) -> Vec<TranscriptEvent> {
        let file = File::open(&self.path)?;
        file.seek(SeekFrom::Start(self.last_position))?;

        let mut events = vec![];
        for line in BufReader::new(file).lines() {
            if let Ok(event) = serde_json::from_str(&line?) {
                events.push(event);
            }
        }

        self.last_position = file.metadata()?.len();
        events
    }
}
```

### Using notify Crate for Efficient Watching

```rust
use notify::{Watcher, RecursiveMode, watcher};

fn watch_transcript(path: &Path, tx: Sender<TranscriptEvent>) {
    let (fs_tx, fs_rx) = channel();
    let mut watcher = watcher(fs_tx, Duration::from_millis(100))?;
    watcher.watch(path, RecursiveMode::NonRecursive)?;

    loop {
        match fs_rx.recv() {
            Ok(DebouncedEvent::Write(_)) => {
                // Read new lines, parse, send to tx
            }
            _ => {}
        }
    }
}
```

---

## Implementation Plan

### Phase 1: Custom Commands (Medium effort)

**Goal**: User types `/interview plan.md`, Horseman executes it.

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Scan ~/.claude/commands/ for .md files                   │
│ 2. Parse frontmatter (description, argument-hint, etc.)     │
│ 3. Show in slash command autocomplete                       │
│ 4. On selection:                                            │
│    a. Read command file                                     │
│    b. Expand $ARGUMENTS                                     │
│    c. Send as prompt to Claude                              │
│    d. Watch transcript for response                         │
│    e. Stream to GUI                                         │
└─────────────────────────────────────────────────────────────┘
```

**Files to create/modify**:
- `src-tauri/src/commands/scanner.rs` - Scan and parse command files
- `src-tauri/src/commands/executor.rs` - Variable expansion and execution
- `src/store/slices/commands.ts` - Store discovered commands
- `src/components/chat/SlashCommandMenu.tsx` - Show custom commands

**Rust types**:
```rust
#[derive(Debug, Serialize, Deserialize)]
struct CustomCommand {
    name: String,           // Filename without .md
    path: PathBuf,          // Full path to file
    description: String,    // From frontmatter
    argument_hint: Option<String>,
    allowed_tools: Option<String>,
    source: CommandSource,  // User | Plugin(name)
}

enum CommandSource {
    User,
    Plugin { name: String, version: String },
}
```

### Phase 2: Transcript Watcher (Medium effort)

**Goal**: Real-time event streaming from transcript file.

```rust
// src-tauri/src/transcript/watcher.rs
pub struct TranscriptWatcher {
    session_id: String,
    path: PathBuf,
    last_offset: u64,
    event_tx: Sender<TranscriptEvent>,
}

impl TranscriptWatcher {
    pub fn start(session_id: String, path: PathBuf) -> Self { ... }
    pub fn stop(&mut self) { ... }
}

// Events emitted
pub enum TranscriptEvent {
    Assistant { message: Message },
    User { message: Message },
    Progress { data: ProgressData },
    Result { ... },
}
```

**Integration with PTY**:
```rust
// In slash command execution
pub async fn run_slash_via_pty(
    session_id: &str,
    command: &str,
    app_handle: &AppHandle,
) -> Result<()> {
    // 1. Get transcript path
    let transcript = get_transcript_path(session_id)?;

    // 2. Start watcher
    let (tx, rx) = channel();
    let watcher = TranscriptWatcher::start(session_id.to_string(), transcript, tx);

    // 3. Spawn PTY and send command
    let pty = PtySession::spawn(session_id)?;
    pty.write_command(command)?;

    // 4. Stream events to frontend
    while let Ok(event) = rx.recv() {
        match event {
            TranscriptEvent::Assistant { message } => {
                emit_to_frontend(app_handle, "message.assistant", message);
            }
            TranscriptEvent::Result { .. } => break,
            _ => {}
        }
    }

    watcher.stop();
    Ok(())
}
```

### Phase 3: Plugin Discovery (Low effort)

**Goal**: Discover installed plugins and their commands.

```rust
// Scan plugin cache
fn discover_plugins() -> Vec<Plugin> {
    let cache_dir = home_dir()?.join(".claude/plugins/cache");

    let mut plugins = vec![];
    for publisher_dir in fs::read_dir(cache_dir)? {
        for plugin_dir in fs::read_dir(publisher_dir.path())? {
            for version_dir in fs::read_dir(plugin_dir.path())? {
                let plugin = parse_plugin(version_dir.path())?;
                plugins.push(plugin);
            }
        }
    }
    plugins
}

struct Plugin {
    name: String,
    publisher: String,
    version: String,
    commands: Vec<CustomCommand>,
    skills: Vec<Skill>,
    hooks: Vec<Hook>,
}
```

### Phase 4: Skills Support (Medium effort)

**Goal**: Load skills and inject into context.

```rust
struct Skill {
    name: String,
    description: String,
    skill_md: String,       // Content of SKILL.md
    rules: Vec<RuleFile>,   // Contents of rules/*.md
    triggers: SkillTriggers,
}

struct SkillTriggers {
    patterns: Vec<String>,   // Keywords to match
    file_types: Vec<String>, // File extensions
    inject: InjectMode,
}

enum InjectMode {
    Always,
    OnTrigger,
    Manual,
}
```

**Context injection**:
```rust
fn build_context(session: &Session, skills: &[Skill]) -> String {
    let mut context = String::new();

    for skill in skills {
        if should_inject(skill, session) {
            context.push_str(&skill.skill_md);
            for rule in &skill.rules {
                context.push_str(&rule.content);
            }
        }
    }

    context
}
```

### Phase 5: Hooks Support (High effort)

**Goal**: Execute hooks at lifecycle points.

```rust
struct HookConfig {
    stop: Vec<HookDefinition>,
    session_start: Vec<HookDefinition>,
    pre_tool_use: Vec<HookDefinition>,
    post_tool_use: Vec<HookDefinition>,
}

struct HookDefinition {
    hook_type: HookType,
    command: String,  // Shell command to run
}

async fn run_hook(
    hook: &HookDefinition,
    input: HookInput,
) -> HookResult {
    let mut child = Command::new("sh")
        .arg("-c")
        .arg(&hook.command)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()?;

    // Write input JSON to stdin
    child.stdin.write_all(serde_json::to_string(&input)?.as_bytes())?;

    let output = child.wait_with_output()?;

    HookResult {
        allowed: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    }
}
```

**Integration points**:

```rust
// PreToolUse hook
async fn execute_tool(tool: &ToolCall, hooks: &HookConfig) -> Result<ToolOutput> {
    // Run pre-hooks
    for hook in &hooks.pre_tool_use {
        let result = run_hook(hook, HookInput::PreToolUse {
            tool_name: &tool.name,
            tool_input: &tool.input,
        }).await?;

        if !result.allowed {
            return Err(ToolError::BlockedByHook(result.stdout));
        }
    }

    // Execute tool
    let output = tool.execute().await?;

    // Run post-hooks
    for hook in &hooks.post_tool_use {
        run_hook(hook, HookInput::PostToolUse {
            tool_name: &tool.name,
            tool_output: &output,
        }).await?;
    }

    Ok(output)
}

// Stop hook
async fn on_session_stop(session: &Session, hooks: &HookConfig) -> StopDecision {
    for hook in &hooks.stop {
        let result = run_hook(hook, HookInput::Stop {
            transcript_path: &session.transcript_path,
            stop_reason: "end_turn",
        }).await?;

        if !result.allowed {
            // Hook wants to continue - stdout is new input
            return StopDecision::Continue(result.stdout);
        }
    }

    StopDecision::Stop
}
```

---

## Research Notes

### What We Tested

1. **PTY + stream-json flag**
   - Result: CLI ignores `--output-format stream-json` when it detects TTY
   - Output is ANSI-encoded, not parseable

2. **Passing /init as prompt**
   - Result: Claude interprets it as conversation topic, not command
   - Said "this is an empty directory" instead of running /init

3. **Transcript real-time updates**
   - Result: ✅ WORKS! Lines appear within 1-2 seconds
   - Verified with "just say hi" test

4. **CLI-internal commands**
   - /help, /status, /context → Only progress events in transcript
   - These don't invoke Claude, just display CLI UI

5. **Claude-invoking commands**
   - /init, /review, /compact → Should produce assistant events
   - (Need cleaner test, but pattern is confirmed)

### Key Files in Claude CLI

Based on our exploration:

```
~/.claude/
├── settings.json          # enabledPlugins, hooks, statusLine
├── commands/*.md          # User slash commands
├── skills/*/              # User skills
├── rules/*/               # User rules
└── plugins/
    ├── cache/             # Active plugin versions
    └── marketplaces/      # Git clones
```

### Plugin Enable/Disable

From `settings.json`:
```json
{
  "enabledPlugins": {
    "mgrep@Mixedbread-Grep": false,
    "frontend-design@claude-plugins-official": true,
    "claude-delegator@jarrodwatts-claude-delegator": true
  }
}
```

Format: `{plugin-name}@{publisher-repo}`

### Slash Command Categories

| Category | Examples | How to Support |
|----------|----------|----------------|
| **Claude-invoking** | /init, /review, /compact | Transcript watching |
| **CLI-internal** | /help, /status, /context | Native GUI reimplementation |
| **Custom user** | /interview | Load from ~/.claude/commands |
| **Plugin** | /commit, /ralph-loop | Load from plugin cache |

---

## Appendix: Test Scripts

### test_slash_commands.py

Created during research to test CLI behavior:

```python
# Location: tests/test_slash_commands.py
# Tests:
# - Can /init be passed as prompt? (No)
# - Does --output-format work in PTY? (No)
# - What does --help say about slash commands?
```

### Transcript Watching Test

```python
# Verified real-time transcript updates
import pty, os, subprocess, time
from pathlib import Path

# Start PTY session
master_fd, slave_fd = pty.openpty()
proc = subprocess.Popen(['claude', '--verbose'], ...)

# Send message
os.write(master_fd, b'just say hi\n')

# Watch transcript
transcript = Path.home() / '.claude' / 'projects' / '...' / 'session.jsonl'
for i in range(90):
    time.sleep(1)
    lines = len(transcript.read_text().split('\n'))
    print(f't+{i}s: {lines} lines')
    # Output: Lines increment in real-time!
```

---

## Summary

The Claude Code CLI plugin system is more accessible than it first appears. By treating the transcript as the source of truth and watching it for changes, Horseman can:

1. **Support all custom commands** - Just expand variables and send prompts
2. **Support all skills** - Inject SKILL.md and rules into context
3. **Support hooks** - Run scripts at lifecycle points, read their output
4. **Stream any Claude-invoking command** - Watch transcript for assistant events

The transcript watching pattern is the key that unlocks the entire ecosystem.
