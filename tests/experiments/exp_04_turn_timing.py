#!/usr/bin/env python3
"""
Experiment 04: Turn-by-Turn Transcript Timing

Key insight from user: Claude works in TURNS, not character streams.
- User message
- Assistant with tool_use
- User with tool_result
- Assistant with next tool_use or final response

Question: Are transcript lines written after each turn completes,
or all buffered to the end?

If turns are written incrementally, we can build real-time UI from transcripts!
"""

import json
import os
import subprocess
import sys
import time
import threading
from pathlib import Path
from datetime import datetime


def timestamp():
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def time_ms():
    return int(time.time() * 1000)


def get_transcript_path(cwd: str, session_id: str) -> Path:
    # Fixed: include leading dash
    escaped = "-" + cwd.replace("/", "-")
    if escaped.startswith("--"):
        escaped = escaped[1:]
    return Path.home() / ".claude" / "projects" / escaped / f"{session_id}.jsonl"


class TranscriptWatcher:
    def __init__(self, path: Path):
        self.path = path
        self.events = []
        self.stop = threading.Event()
        self.last_lines = 0

    def watch(self):
        while not self.stop.is_set():
            try:
                if self.path.exists():
                    with open(self.path) as f:
                        lines = f.readlines()

                    if len(lines) > self.last_lines:
                        capture_time = time_ms()
                        for i in range(self.last_lines, len(lines)):
                            try:
                                event = json.loads(lines[i])
                                etype = event.get("type", "unknown")

                                # Extract content info
                                content_info = ""
                                msg = event.get("message", {})
                                content = msg.get("content", [])
                                if isinstance(content, list) and content:
                                    block_types = [b.get("type", "?") for b in content if isinstance(b, dict)]
                                    content_info = f" [{', '.join(block_types)}]"
                                elif isinstance(content, str):
                                    content_info = f" [{len(content)} chars]"

                                self.events.append({
                                    "ms": capture_time,
                                    "time": timestamp(),
                                    "line": i + 1,
                                    "type": etype,
                                    "content_info": content_info
                                })
                                print(f"[{timestamp()}] TRANSCRIPT line {i+1}: {etype}{content_info}")
                            except json.JSONDecodeError:
                                pass
                        self.last_lines = len(lines)
            except Exception as e:
                pass
            time.sleep(0.05)  # 50ms polling


def main():
    cwd = os.getcwd()

    import uuid
    session_id = str(uuid.uuid4())
    transcript_path = get_transcript_path(cwd, session_id)

    print("=" * 70)
    print("EXPERIMENT 04: Turn-by-Turn Transcript Timing")
    print("=" * 70)
    print(f"Session ID: {session_id}")
    print(f"Transcript: {transcript_path}")
    print()

    # Task that requires multiple tool calls
    prompt = """Do these steps in order:
1. Read the file /etc/hosts
2. Read the file /etc/shells
3. Tell me how many lines are in each file

Use the Read tool for each file."""

    # Start transcript watcher
    watcher = TranscriptWatcher(transcript_path)
    watcher_thread = threading.Thread(target=watcher.watch)
    watcher_thread.start()

    print(f"[{timestamp()}] Starting Claude with multi-tool task...")
    start_time = time_ms()

    cmd = [
        "claude", "-p",
        "--verbose",
        "--session-id", session_id,
        "--output-format", "stream-json",
        "--dangerously-skip-permissions",
        prompt
    ]

    # Run and capture stdout events too
    stdout_events = []
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )

    for line in process.stdout:
        if line.strip():
            capture_time = time_ms()
            try:
                event = json.loads(line)
                etype = event.get("type", "unknown")
                stdout_events.append({
                    "ms": capture_time,
                    "time": timestamp(),
                    "type": etype
                })
                print(f"[{timestamp()}] STDOUT: {etype}")
            except:
                pass

    process.wait()
    end_time = time_ms()

    # Let watcher catch up
    time.sleep(0.3)
    watcher.stop.set()
    watcher_thread.join()

    # Analysis
    print()
    print("=" * 70)
    print("TIMELINE")
    print("=" * 70)

    all_events = []
    for e in stdout_events:
        all_events.append({**e, "source": "stdout"})
    for e in watcher.events:
        all_events.append({**e, "source": "transcript"})

    all_events.sort(key=lambda x: x["ms"])

    for e in all_events:
        rel_ms = e["ms"] - start_time
        src = "STDOUT" if e["source"] == "stdout" else "TRNSCPT"
        extra = e.get("content_info", "")
        print(f"+{rel_ms:5}ms [{src}] {e['type']}{extra}")

    # Key analysis: when did transcript lines appear?
    print()
    print("=" * 70)
    print("KEY FINDINGS")
    print("=" * 70)

    if watcher.events:
        print(f"\nTranscript events captured: {len(watcher.events)}")
        print(f"Stdout events: {len(stdout_events)}")

        # Check if transcript was written incrementally
        if len(watcher.events) > 1:
            first_ms = watcher.events[0]["ms"] - start_time
            last_ms = watcher.events[-1]["ms"] - start_time
            spread = last_ms - first_ms

            print(f"\nFirst transcript event: +{first_ms}ms")
            print(f"Last transcript event: +{last_ms}ms")
            print(f"Time spread: {spread}ms")

            if spread > 500:
                print("\n✅ INCREMENTAL: Transcript lines written as turns complete!")
                print("   We CAN build real-time UI from transcript watching.")
            else:
                print("\n❌ BATCHED: All lines written at once at the end")
                print("   Need stream-json for real-time updates.")
        else:
            print("\nOnly one transcript event - need more turns to test")
    else:
        print("\n❌ No transcript events captured!")
        print("   Check path escaping or permissions")

    # Final verdict
    print()
    print("=" * 70)
    print("CONCLUSION")
    print("=" * 70)

    transcript_count = len(watcher.events)
    stdout_count = len(stdout_events)

    if transcript_count >= 3:  # At least user + assistant + something
        times = [e["ms"] for e in watcher.events]
        if len(times) > 1 and (max(times) - min(times)) > 500:
            print("VIABLE: Transcript-only approach works!")
            print()
            print("Architecture option:")
            print("  1. Spawn Claude process (PTY or headless)")
            print("  2. Watch transcript file with FSEvents")
            print("  3. Parse JSONL lines as they appear")
            print("  4. No need to parse stream-json stdout")
            print()
            print("Benefits:")
            print("  - Simpler parsing (JSONL is cleaner than stream-json)")
            print("  - Same data regardless of PTY vs headless")
            print("  - Transcript is stable API")
        else:
            print("NOT VIABLE: Transcript written in batch")
    else:
        print("INCONCLUSIVE: Not enough data")

    return 0


if __name__ == "__main__":
    sys.exit(main())
