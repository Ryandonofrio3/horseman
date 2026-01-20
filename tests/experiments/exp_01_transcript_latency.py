#!/usr/bin/env python3
"""
Experiment 01: Transcript Write Latency

Core question: Can we watch the transcript file for real-time events
instead of parsing stream-json stdout?

What we're testing:
1. Does transcript get written incrementally or only at end?
2. What's the latency between Claude's action and transcript write?
3. Is FSEvents/inotify fast enough for UI updates?

Approach:
- Spawn Claude via PTY (no --output-format)
- Simultaneously watch the transcript file
- Compare timing of events appearing in both
"""

import json
import os
import subprocess
import sys
import time
import threading
import uuid
from pathlib import Path
from datetime import datetime
from collections import defaultdict


def timestamp():
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def get_transcript_path(cwd: str, session_id: str) -> Path:
    """Get expected transcript path for a session."""
    # Claude escapes the path: /Users/foo/bar -> -Users-foo-bar
    escaped = cwd.replace("/", "-")
    if escaped.startswith("-"):
        escaped = escaped[1:]
    return Path.home() / ".claude" / "projects" / escaped / f"{session_id}.jsonl"


def watch_transcript(path: Path, events: list, stop_event: threading.Event):
    """Watch transcript file and log when new lines appear."""
    last_size = 0
    last_lines = 0

    while not stop_event.is_set():
        try:
            if path.exists():
                current_size = path.stat().st_size
                if current_size > last_size:
                    with open(path) as f:
                        lines = f.readlines()
                        new_count = len(lines)
                        if new_count > last_lines:
                            for i in range(last_lines, new_count):
                                try:
                                    event = json.loads(lines[i])
                                    events.append({
                                        "time": timestamp(),
                                        "source": "transcript",
                                        "line": i + 1,
                                        "type": event.get("type", "unknown"),
                                        "event": event
                                    })
                                except json.JSONDecodeError:
                                    pass
                            last_lines = new_count
                    last_size = current_size
        except Exception as e:
            pass
        time.sleep(0.05)  # 50ms polling


def main():
    cwd = os.getcwd()
    session_id = str(uuid.uuid4())
    transcript_path = get_transcript_path(cwd, session_id)

    print("=" * 70)
    print("EXPERIMENT 01: Transcript Write Latency")
    print("=" * 70)
    print(f"CWD: {cwd}")
    print(f"Session ID: {session_id}")
    print(f"Expected transcript: {transcript_path}")
    print()

    # Storage for events
    transcript_events = []
    stdout_events = []

    # Start transcript watcher
    stop_watcher = threading.Event()
    watcher = threading.Thread(
        target=watch_transcript,
        args=(transcript_path, transcript_events, stop_watcher)
    )
    watcher.start()

    # Run Claude - try with stream-json first to compare
    print(f"[{timestamp()}] Starting Claude with stream-json...")

    cmd = [
        "claude", "-p",
        "--verbose",
        "--session-id", session_id,
        "--output-format", "stream-json",
        "Count from 1 to 10 slowly, one number per line. After each number, pause briefly."
    ]

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )

    # Read stdout events
    start_time = time.time()
    for line in process.stdout:
        if line.strip():
            try:
                event = json.loads(line)
                stdout_events.append({
                    "time": timestamp(),
                    "source": "stdout",
                    "type": event.get("type", "unknown"),
                    "event": event
                })
            except json.JSONDecodeError:
                pass

    process.wait()
    elapsed = time.time() - start_time

    # Give transcript watcher a moment to catch up
    time.sleep(0.5)
    stop_watcher.set()
    watcher.join()

    # Analysis
    print()
    print("=" * 70)
    print("RESULTS")
    print("=" * 70)

    print(f"\nTotal time: {elapsed:.2f}s")
    print(f"stdout events: {len(stdout_events)}")
    print(f"transcript events: {len(transcript_events)}")
    print(f"Transcript exists: {transcript_path.exists()}")

    if transcript_path.exists():
        with open(transcript_path) as f:
            final_lines = len(f.readlines())
        print(f"Final transcript lines: {final_lines}")

    # Compare timing for same event types
    print("\n" + "-" * 50)
    print("EVENT TIMING COMPARISON")
    print("-" * 50)

    stdout_by_type = defaultdict(list)
    transcript_by_type = defaultdict(list)

    for e in stdout_events:
        stdout_by_type[e["type"]].append(e["time"])
    for e in transcript_events:
        transcript_by_type[e["type"]].append(e["time"])

    all_types = set(stdout_by_type.keys()) | set(transcript_by_type.keys())
    for t in sorted(all_types):
        stdout_count = len(stdout_by_type.get(t, []))
        transcript_count = len(transcript_by_type.get(t, []))
        print(f"{t}: stdout={stdout_count}, transcript={transcript_count}")

    # Key finding: when did we first see events?
    print("\n" + "-" * 50)
    print("FIRST EVENT TIMES")
    print("-" * 50)

    if stdout_events:
        print(f"First stdout event: {stdout_events[0]['time']} ({stdout_events[0]['type']})")
    if transcript_events:
        print(f"First transcript event: {transcript_events[0]['time']} ({transcript_events[0]['type']})")

    # Timeline of all events
    print("\n" + "-" * 50)
    print("FULL TIMELINE (first 30 events)")
    print("-" * 50)

    all_events = sorted(
        stdout_events + transcript_events,
        key=lambda x: x["time"]
    )

    for e in all_events[:30]:
        source = "STDOUT" if e["source"] == "stdout" else "TRANSCRIPT"
        print(f"[{e['time']}] {source:10} {e['type']}")

    # Key question: was transcript written incrementally?
    print("\n" + "=" * 70)
    print("KEY FINDINGS")
    print("=" * 70)

    if len(transcript_events) > 1:
        first = transcript_events[0]["time"]
        last = transcript_events[-1]["time"]
        print(f"Transcript WAS written incrementally!")
        print(f"  First event at: {first}")
        print(f"  Last event at: {last}")
        print(f"  Total events captured: {len(transcript_events)}")
    elif len(transcript_events) == 1:
        print("Only one transcript event - may have been batched at end")
    else:
        print("NO transcript events captured during run!")
        print("This means transcript is written at session end, not incrementally")

    # Latency comparison
    if stdout_events and transcript_events:
        # Find matching event types and compare times
        print("\nComparing same-type event arrival times...")
        # This is rough - would need more sophisticated matching

    print("\n" + "=" * 70)
    print("CONCLUSION")
    print("=" * 70)

    if len(transcript_events) >= len(stdout_events) * 0.8:
        print("VIABLE: Transcript watching captured most events")
        print("Could potentially replace stream-json parsing")
    elif len(transcript_events) > 0:
        print("PARTIAL: Some events captured but not all")
        print("May need hybrid approach or faster polling")
    else:
        print("NOT VIABLE: Transcript not written incrementally")
        print("Stream-json stdout is necessary for real-time updates")

    return 0


if __name__ == "__main__":
    sys.exit(main())
