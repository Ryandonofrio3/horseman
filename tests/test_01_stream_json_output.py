#!/usr/bin/env python3
"""
Test 01: Stream JSON Output

Purpose: Validate that `--output-format stream-json` produces parseable,
structured events we can use to build UI.

Questions to answer:
- What event types exist?
- What fields are on each event type?
- How granular is `--include-partial-messages`?
- What does a tool_use event look like?
- What does a tool_result event look like?
"""

import json
import subprocess
import sys
from pathlib import Path
from collections import defaultdict


def run_claude_stream(prompt: str, extra_args: list[str] | None = None) -> list[dict]:
    """Run claude with stream-json output and return parsed events."""
    cmd = [
        "claude",
        "-p",
        "--output-format", "stream-json",
        "--verbose",
        prompt
    ]
    if extra_args:
        cmd = cmd[:1] + extra_args + cmd[1:]
    
    print(f"\n{'='*60}")
    print(f"Running: {' '.join(cmd)}")
    print(f"{'='*60}\n")
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120
    )
    
    events = []
    for line in result.stdout.strip().split('\n'):
        if line.strip():
            try:
                event = json.loads(line)
                events.append(event)
            except json.JSONDecodeError as e:
                print(f"Failed to parse line: {line[:100]}...")
                print(f"Error: {e}")
    
    if result.stderr:
        print(f"STDERR:\n{result.stderr[:500]}")
    
    return events


def analyze_events(events: list[dict], label: str) -> dict:
    """Analyze event types and their structures."""
    print(f"\n{'='*60}")
    print(f"ANALYSIS: {label}")
    print(f"{'='*60}")
    print(f"Total events: {len(events)}")
    
    # Group by type
    by_type = defaultdict(list)
    for event in events:
        event_type = event.get("type", "UNKNOWN")
        by_type[event_type].append(event)
    
    print(f"\nEvent types found: {list(by_type.keys())}")
    
    # Analyze each type
    type_schemas = {}
    for event_type, type_events in by_type.items():
        print(f"\n--- {event_type} ({len(type_events)} events) ---")
        
        # Get all keys from first event of this type
        sample = type_events[0]
        keys = list(sample.keys())
        print(f"Keys: {keys}")
        
        # Show sample (truncated)
        sample_str = json.dumps(sample, indent=2)
        if len(sample_str) > 500:
            sample_str = sample_str[:500] + "\n... (truncated)"
        print(f"Sample:\n{sample_str}")
        
        type_schemas[event_type] = {
            "count": len(type_events),
            "keys": keys,
            "sample": sample
        }
    
    return type_schemas


def main():
    results_dir = Path(__file__).parent.parent / "results"
    results_dir.mkdir(exist_ok=True)
    
    all_events = []
    all_schemas = {}
    
    # Test 1: Simple text response
    print("\n" + "="*70)
    print("TEST 1: Simple text response")
    print("="*70)
    
    events1 = run_claude_stream("Say hello world in exactly 5 words")
    all_events.extend(events1)
    schemas1 = analyze_events(events1, "Simple text response")
    all_schemas["simple_text"] = schemas1
    
    # Test 2: With partial messages
    print("\n" + "="*70)
    print("TEST 2: With --include-partial-messages")
    print("="*70)
    
    events2 = run_claude_stream(
        "Count from 1 to 5 slowly",
        extra_args=["--include-partial-messages"]
    )
    all_events.extend(events2)
    schemas2 = analyze_events(events2, "With partial messages")
    all_schemas["with_partial"] = schemas2
    
    # Test 3: Tool use (file creation)
    print("\n" + "="*70)
    print("TEST 3: Tool use (Read tool)")
    print("="*70)
    
    events3 = run_claude_stream(
        "Read the file /etc/hosts and tell me the first line",
        extra_args=["--include-partial-messages", "--dangerously-skip-permissions"]
    )
    all_events.extend(events3)
    schemas3 = analyze_events(events3, "Tool use")
    all_schemas["tool_use"] = schemas3
    
    # Save all events to file
    output_file = results_dir / "stream_events.json"
    with open(output_file, "w") as f:
        json.dump({
            "events": all_events,
            "schemas": all_schemas
        }, f, indent=2, default=str)
    
    print(f"\n{'='*70}")
    print(f"SUMMARY")
    print(f"{'='*70}")
    print(f"Total events collected: {len(all_events)}")
    print(f"Results saved to: {output_file}")
    
    # Print unique event types across all tests
    all_types = set()
    for event in all_events:
        all_types.add(event.get("type", "UNKNOWN"))
    
    print(f"\nAll unique event types discovered:")
    for t in sorted(all_types):
        print(f"  - {t}")
    
    print("\n" + "="*70)
    print("KEY FINDINGS")
    print("="*70)
    
    # Look for specific event types
    tool_use_events = [e for e in all_events if "tool" in e.get("type", "").lower() or "tool" in str(e.get("content", "")).lower()]
    if tool_use_events:
        print(f"\nTool-related events found: {len(tool_use_events)}")
        for te in tool_use_events[:3]:
            print(f"  Type: {te.get('type')}")
    else:
        print("\nNo explicit tool events found - tools may be embedded in message content")
    
    # Check for content_block events (streaming)
    content_blocks = [e for e in all_events if "content_block" in e.get("type", "")]
    if content_blocks:
        print(f"\nContent block events (streaming): {len(content_blocks)}")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
