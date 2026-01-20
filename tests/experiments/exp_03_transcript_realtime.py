#!/usr/bin/env python3
"""
Experiment 03: Real-time Transcript Watching

Core question: Can we get UI-quality real-time updates by watching transcripts?

This is the KEY experiment. If transcripts are written incrementally
with low latency, we can build UI entirely from transcript watching.

What we're testing:
1. Start a long-running Claude task (tool use, multi-step)
2. Watch transcript with FSEvents-like speed (50ms polling)
3. Log exactly when each event appears in transcript
4. Compare to when we'd see it in stream-json

Success criteria:
- Events appear in transcript within ~200ms of happening
- All event types are captured (including tool_use, tool_result)
- No events are "batched" at end
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
import select


def timestamp():
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def time_ms():
    return int(time.time() * 1000)


def get_transcript_path(cwd: str, session_id: str) -> Path:
    escaped = cwd.replace("/", "-")
    if escaped.startswith("-"):
        escaped = escaped[1:]
    return Path.home() / ".claude" / "projects" / escaped / f"{session_id}.jsonl"


class TranscriptWatcher:
    """Watch transcript file with fine-grained timing."""

    def __init__(self, path: Path):
        self.path = path
        self.events = []
        self.stop = threading.Event()
        self.last_size = 0
        self.last_lines = 0
        self.poll_interval = 0.05  # 50ms

    def watch(self):
        while not self.stop.is_set():
            try:
                if self.path.exists():
                    current_size = self.path.stat().st_size
                    if current_size > self.last_size:
                        capture_time = time_ms()
                        with open(self.path) as f:
                            lines = f.readlines()

                        for i in range(self.last_lines, len(lines)):
                            try:
                                event = json.loads(lines[i])
                                self.events.append({
                                    "capture_ms": capture_time,
                                    "capture_time": timestamp(),
                                    "line": i + 1,
                                    "type": event.get("type", "unknown"),
                                    "event": event
                                })
                            except json.JSONDecodeError:
                                pass

                        self.last_lines = len(lines)
                        self.last_size = current_size
            except Exception as e:
                pass

            time.sleep(self.poll_interval)


class StdoutWatcher:
    """Capture stdout events with timing."""

    def __init__(self):
        self.events = []

    def capture(self, process):
        for line in process.stdout:
            if line.strip():
                capture_time = time_ms()
                try:
                    event = json.loads(line)
                    self.events.append({
                        "capture_ms": capture_time,
                        "capture_time": timestamp(),
                        "type": event.get("type", "unknown"),
                        "event": event
                    })
                except json.JSONDecodeError:
                    pass


def main():
    cwd = os.getcwd()
    session_id = str(uuid.uuid4())
    transcript_path = get_transcript_path(cwd, session_id)

    print("=" * 70)
    print("EXPERIMENT 03: Real-time Transcript Watching")
    print("=" * 70)
    print(f"Session ID: {session_id}")
    print(f"Transcript: {transcript_path}")
    print()

    # Task that uses tools and takes time
    prompt = """Do these things in order:
1. Read the file /etc/hosts
2. Tell me the first line you see
3. Count to 5 out loud

Be thorough."""

    # Set up watchers
    transcript_watcher = TranscriptWatcher(transcript_path)
    stdout_watcher = StdoutWatcher()

    # Start transcript watcher thread
    watcher_thread = threading.Thread(target=transcript_watcher.watch)
    watcher_thread.start()

    # Run Claude with stream-json so we can compare
    print(f"[{timestamp()}] Starting Claude...")

    cmd = [
        "claude", "-p",
        "--verbose",
        "--session-id", session_id,
        "--output-format", "stream-json",
        "--dangerously-skip-permissions",
        prompt
    ]

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )

    # Capture stdout in main thread
    start_time = time_ms()
    stdout_watcher.capture(process)
    process.wait()
    end_time = time_ms()

    # Stop transcript watcher
    time.sleep(0.2)  # Let it catch final events
    transcript_watcher.stop.set()
    watcher_thread.join()

    # Analysis
    print()
    print("=" * 70)
    print("TIMING ANALYSIS")
    print("=" * 70)

    print(f"\nTotal runtime: {end_time - start_time}ms")
    print(f"stdout events: {len(stdout_watcher.events)}")
    print(f"transcript events: {len(transcript_watcher.events)}")

    # Build event timeline
    all_events = []

    for e in stdout_watcher.events:
        all_events.append({
            "ms": e["capture_ms"] - start_time,
            "time": e["capture_time"],
            "source": "stdout",
            "type": e["type"]
        })

    for e in transcript_watcher.events:
        all_events.append({
            "ms": e["capture_ms"] - start_time,
            "time": e["capture_time"],
            "source": "transcript",
            "type": e["type"]
        })

    all_events.sort(key=lambda x: x["ms"])

    print("\n" + "-" * 50)
    print("EVENT TIMELINE (relative to start)")
    print("-" * 50)

    for e in all_events[:40]:
        source = "STDOUT" if e["source"] == "stdout" else "TRNSCRPT"
        print(f"+{e['ms']:5}ms [{source}] {e['type']}")

    # Calculate latency between matching events
    print("\n" + "-" * 50)
    print("LATENCY ANALYSIS")
    print("-" * 50)

    stdout_by_type = defaultdict(list)
    transcript_by_type = defaultdict(list)

    for e in stdout_watcher.events:
        stdout_by_type[e["type"]].append(e["capture_ms"])
    for e in transcript_watcher.events:
        transcript_by_type[e["type"]].append(e["capture_ms"])

    latencies = []
    for etype in stdout_by_type:
        if etype in transcript_by_type:
            for i, stdout_ms in enumerate(stdout_by_type[etype]):
                if i < len(transcript_by_type[etype]):
                    transcript_ms = transcript_by_type[etype][i]
                    latency = transcript_ms - stdout_ms
                    latencies.append({
                        "type": etype,
                        "latency_ms": latency
                    })

    if latencies:
        avg_latency = sum(l["latency_ms"] for l in latencies) / len(latencies)
        max_latency = max(l["latency_ms"] for l in latencies)
        min_latency = min(l["latency_ms"] for l in latencies)

        print(f"Average latency (transcript behind stdout): {avg_latency:.0f}ms")
        print(f"Max latency: {max_latency}ms")
        print(f"Min latency: {min_latency}ms")

        print("\nLatency by event type:")
        type_latencies = defaultdict(list)
        for l in latencies:
            type_latencies[l["type"]].append(l["latency_ms"])

        for etype, lats in sorted(type_latencies.items()):
            avg = sum(lats) / len(lats)
            print(f"  {etype}: avg={avg:.0f}ms, count={len(lats)}")

    # Key findings
    print("\n" + "=" * 70)
    print("KEY FINDINGS")
    print("=" * 70)

    missing_types = set(stdout_by_type.keys()) - set(transcript_by_type.keys())
    extra_types = set(transcript_by_type.keys()) - set(stdout_by_type.keys())

    if missing_types:
        print(f"\nEvent types in stdout but NOT in transcript: {missing_types}")
    if extra_types:
        print(f"\nEvent types in transcript but NOT in stdout: {extra_types}")

    stdout_count = len(stdout_watcher.events)
    transcript_count = len(transcript_watcher.events)
    capture_rate = (transcript_count / stdout_count * 100) if stdout_count > 0 else 0

    print(f"\nCapture rate: {capture_rate:.1f}% ({transcript_count}/{stdout_count})")

    # Conclusion
    print("\n" + "=" * 70)
    print("CONCLUSION")
    print("=" * 70)

    if latencies and avg_latency < 200 and capture_rate >= 90:
        print("VIABLE: Transcript watching is fast enough for UI!")
        print(f"  - Average latency: {avg_latency:.0f}ms (target: <200ms)")
        print(f"  - Capture rate: {capture_rate:.1f}% (target: >90%)")
        print()
        print("Recommendation: We CAN use transcript-only approach")
    elif latencies and avg_latency < 500:
        print("MARGINAL: Transcript watching has noticeable lag")
        print(f"  - Average latency: {avg_latency:.0f}ms")
        print("  - Might feel sluggish for real-time UI")
        print()
        print("Recommendation: Hybrid approach or accept lag")
    else:
        print("NOT VIABLE: Transcript watching is too slow or incomplete")
        if latencies:
            print(f"  - Average latency: {avg_latency:.0f}ms")
        print(f"  - Capture rate: {capture_rate:.1f}%")
        print()
        print("Recommendation: Keep stream-json for real-time updates")

    return 0


if __name__ == "__main__":
    sys.exit(main())
