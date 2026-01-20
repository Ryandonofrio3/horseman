#!/usr/bin/env python3
"""
Experiment 02: PTY Mode vs Headless Mode

Core question: If we use PTY (interactive mode) and watch the transcript,
do we get the same data as headless stream-json?

What we're testing:
1. Run same prompt in PTY mode (no --output-format)
2. Run same prompt in headless mode (--output-format stream-json)
3. Compare transcript contents - are they identical?
4. Compare what data we can extract from each

The hypothesis: Transcripts are the same regardless of mode.
If true, we could use PTY for everything and just parse transcripts.
"""

import json
import os
import pty
import subprocess
import sys
import time
import uuid
from pathlib import Path
from datetime import datetime


def timestamp():
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def get_transcript_path(cwd: str, session_id: str) -> Path:
    escaped = cwd.replace("/", "-")
    if escaped.startswith("-"):
        escaped = escaped[1:]
    return Path.home() / ".claude" / "projects" / escaped / f"{session_id}.jsonl"


def run_headless(prompt: str, session_id: str) -> tuple[str, float]:
    """Run Claude in headless mode, return stdout and elapsed time."""
    cmd = [
        "claude", "-p",
        "--verbose",
        "--session-id", session_id,
        "--output-format", "stream-json",
        prompt
    ]

    start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    elapsed = time.time() - start

    return result.stdout, elapsed


def run_pty(prompt: str, session_id: str) -> tuple[str, float]:
    """Run Claude in PTY mode (interactive), return output and elapsed time."""
    cmd = [
        "claude", "-p",
        "--verbose",
        "--session-id", session_id,
        prompt
    ]

    output = []
    start = time.time()

    def read_output(fd):
        try:
            while True:
                data = os.read(fd, 1024)
                if not data:
                    break
                output.append(data.decode('utf-8', errors='replace'))
        except OSError:
            pass

    # Fork PTY
    pid, fd = pty.fork()
    if pid == 0:
        # Child
        os.execvp(cmd[0], cmd)
    else:
        # Parent
        import select
        while True:
            ready, _, _ = select.select([fd], [], [], 0.1)
            if ready:
                try:
                    data = os.read(fd, 4096)
                    if data:
                        output.append(data.decode('utf-8', errors='replace'))
                    else:
                        break
                except OSError:
                    break

            # Check if child exited
            result = os.waitpid(pid, os.WNOHANG)
            if result[0] != 0:
                # Drain remaining
                try:
                    while True:
                        data = os.read(fd, 4096)
                        if not data:
                            break
                        output.append(data.decode('utf-8', errors='replace'))
                except:
                    pass
                break

        os.close(fd)

    elapsed = time.time() - start
    return ''.join(output), elapsed


def parse_transcript(path: Path) -> list[dict]:
    """Parse transcript JSONL file."""
    events = []
    if path.exists():
        with open(path) as f:
            for line in f:
                if line.strip():
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    return events


def analyze_transcript(events: list[dict]) -> dict:
    """Analyze transcript events."""
    analysis = {
        "total_events": len(events),
        "event_types": {},
        "has_tool_use": False,
        "has_tool_result": False,
        "message_count": 0,
    }

    for e in events:
        etype = e.get("type", "unknown")
        analysis["event_types"][etype] = analysis["event_types"].get(etype, 0) + 1

        if etype in ("user", "assistant"):
            analysis["message_count"] += 1
            content = e.get("message", {}).get("content", [])
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict):
                        if block.get("type") == "tool_use":
                            analysis["has_tool_use"] = True
                        if block.get("type") == "tool_result":
                            analysis["has_tool_result"] = True

    return analysis


def main():
    cwd = os.getcwd()

    print("=" * 70)
    print("EXPERIMENT 02: PTY vs Headless Mode")
    print("=" * 70)
    print(f"CWD: {cwd}")
    print()

    prompt = "Say 'Hello from test' and nothing else."

    # Test 1: Headless mode
    print("-" * 50)
    print("TEST 1: Headless mode (--output-format stream-json)")
    print("-" * 50)

    session_headless = str(uuid.uuid4())
    print(f"Session ID: {session_headless}")

    stdout_headless, time_headless = run_headless(prompt, session_headless)
    transcript_headless_path = get_transcript_path(cwd, session_headless)

    print(f"Elapsed: {time_headless:.2f}s")
    print(f"Stdout lines: {len(stdout_headless.strip().split(chr(10)))}")
    print(f"Transcript exists: {transcript_headless_path.exists()}")

    time.sleep(1)  # Let transcript finalize

    events_headless = parse_transcript(transcript_headless_path)
    analysis_headless = analyze_transcript(events_headless)
    print(f"Transcript events: {analysis_headless['total_events']}")
    print(f"Event types: {analysis_headless['event_types']}")

    # Test 2: PTY mode
    print()
    print("-" * 50)
    print("TEST 2: PTY mode (interactive, no --output-format)")
    print("-" * 50)

    session_pty = str(uuid.uuid4())
    print(f"Session ID: {session_pty}")

    output_pty, time_pty = run_pty(prompt, session_pty)
    transcript_pty_path = get_transcript_path(cwd, session_pty)

    print(f"Elapsed: {time_pty:.2f}s")
    print(f"PTY output length: {len(output_pty)} chars")
    print(f"Transcript exists: {transcript_pty_path.exists()}")

    time.sleep(1)  # Let transcript finalize

    events_pty = parse_transcript(transcript_pty_path)
    analysis_pty = analyze_transcript(events_pty)
    print(f"Transcript events: {analysis_pty['total_events']}")
    print(f"Event types: {analysis_pty['event_types']}")

    # Compare
    print()
    print("=" * 70)
    print("COMPARISON")
    print("=" * 70)

    print("\nHeadless transcript:")
    for etype, count in sorted(analysis_headless["event_types"].items()):
        print(f"  {etype}: {count}")

    print("\nPTY transcript:")
    for etype, count in sorted(analysis_pty["event_types"].items()):
        print(f"  {etype}: {count}")

    # Are they structurally the same?
    print()
    print("-" * 50)
    print("STRUCTURE COMPARISON")
    print("-" * 50)

    headless_types = set(analysis_headless["event_types"].keys())
    pty_types = set(analysis_pty["event_types"].keys())

    if headless_types == pty_types:
        print("SAME: Both transcripts have identical event types")
    else:
        only_headless = headless_types - pty_types
        only_pty = pty_types - headless_types
        if only_headless:
            print(f"Only in headless: {only_headless}")
        if only_pty:
            print(f"Only in PTY: {only_pty}")

    # Sample content comparison
    print()
    print("-" * 50)
    print("SAMPLE CONTENT")
    print("-" * 50)

    if events_headless:
        print("\nFirst headless event:")
        print(json.dumps(events_headless[0], indent=2)[:300])

    if events_pty:
        print("\nFirst PTY event:")
        print(json.dumps(events_pty[0], indent=2)[:300])

    # Conclusion
    print()
    print("=" * 70)
    print("CONCLUSION")
    print("=" * 70)

    if headless_types == pty_types and analysis_headless["total_events"] == analysis_pty["total_events"]:
        print("IDENTICAL: Transcripts are the same regardless of mode!")
        print()
        print("This means we COULD:")
        print("  1. Use PTY for all Claude interactions")
        print("  2. Parse transcripts for structured data")
        print("  3. Never use --output-format stream-json")
        print()
        print("Benefits:")
        print("  - Simpler code path")
        print("  - Same as what users see in terminal")
        print("  - Transcripts are stable API (vs stream-json which could change)")
    elif abs(analysis_headless["total_events"] - analysis_pty["total_events"]) <= 2:
        print("SIMILAR: Minor differences but largely equivalent")
        print("PTY transcript approach is viable with small caveats")
    else:
        print("DIFFERENT: Significant differences between modes")
        print(f"  Headless: {analysis_headless['total_events']} events")
        print(f"  PTY: {analysis_pty['total_events']} events")
        print("May need to stick with stream-json for full data")

    return 0


if __name__ == "__main__":
    sys.exit(main())
