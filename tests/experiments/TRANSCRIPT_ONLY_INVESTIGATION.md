# Investigation: Transcript-Only Architecture for Horseman

## Context

Horseman is a native macOS GUI for Claude Code CLI. Currently it spawns Claude with `--output-format stream-json` and parses structured JSON from stdout for real-time UI updates.

## Proposed Change

Instead of parsing stdout, watch the Claude transcript file (`~/.claude/projects/{cwd}/{session}.jsonl`) for real-time events. Experiments show transcripts are written incrementally (turn-by-turn, ~50ms latency).

## Current Architecture

### Live Streaming (process.rs)
```rust
// Spawn with stream-json output
Command::new("claude")
    .args(["-p", "--output-format", "stream-json", "--verbose", ...])
    .stdin(Stdio::null())   // stdin is cursed (blocks forever)
    .stdout(Stdio::piped()) // parse this
    .spawn()

// Reader thread parses stdout
for line in reader.lines() {
    let event = serde_json::from_str(&line);
    match event.type {
        "system" => emit SessionStarted
        "assistant" => emit MessageAssistant, ToolStarted
        "user" => emit ToolCompleted (tool_result)
        "result" => emit UsageUpdated
    }
}
```

### Historical Loading (also process.rs)
```rust
pub fn parse_transcript_content(content: &str) -> TranscriptParseResult {
    // Parses JSONL from transcript file
    // Same event types: assistant, user, result, summary
    // Returns messages, todos, usage, subagent_tools
}
```

### Key Files
- `src-tauri/src/claude/process.rs` - ClaudeManager, spawn, process_event(), parse_transcript_content()
- `src-tauri/src/events.rs` - BackendEvent enum
- `src/hooks/useHorsemanEvents.ts` - Frontend event handler

## What I Need Analyzed

### 1. Scope Assessment
- How many lines of code would change?
- Which files are affected?
- Is this a 1-day, 1-week, or multi-week refactor?

### 2. Risk Analysis
- What could break?
- Are there edge cases with transcript timing?
- What happens if transcript doesn't exist yet?
- What about permissions (MCP flow)?

### 3. Benefits Quantification
- How much code duplication would be eliminated?
- Would this simplify the mental model?
- Any performance implications?

### 4. Architecture Recommendation
Propose the cleanest way to implement transcript-only:
- Should we keep `--output-format stream-json` (it still writes transcript)?
- How should file watching work (polling vs FSEvents)?
- How to handle the session ID (currently extracted from `system` event in stdout)?

### 5. Migration Path
- Can this be done incrementally?
- What's the smallest useful first step?
- How to maintain backward compatibility during transition?

## Constraints
- macOS only (can use FSEvents)
- Tauri v2 + Rust backend
- Must maintain all current features: permissions, todos, subagents, tool displays
- Must not regress on latency (current: instant, proposed: ~50ms acceptable)

## Experimental Evidence

From our tests, transcript watching captured events ~20-50ms after stdout:
```
+  805ms [STDOUT] system
+  805ms [TRANSCRIPT] queue-operation
+ 3669ms [STDOUT] assistant
+ 3691ms [TRANSCRIPT] user, assistant (tool_use)
+ 3959ms [TRANSCRIPT] user (tool_result)
+ 6228ms [TRANSCRIPT] assistant (text)
```

Transcripts ARE written incrementally per turn, not batched at end.

## Deliverable

Provide:
1. Estimated effort (hours/days)
2. Risk rating (low/medium/high)
3. Recommended approach
4. First step to take
5. Go/no-go recommendation with reasoning
