#!/usr/bin/env python3
"""
Test: Does stdin queue messages during streaming?

Simpler test - send a short task, inject a second message during streaming,
let it complete, and see if there's a second response.
"""

import json
import subprocess
import sys
import time
import uuid
import select
from datetime import datetime


def timestamp():
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def main():
    session_id = str(uuid.uuid4())

    print("="*70)
    print("TEST: Stdin Queue Behavior")
    print("="*70)
    print(f"Session ID: {session_id}")
    print()

    cmd = [
        "claude", "-p", "--verbose",
        "--session-id", session_id,
        "--input-format", "stream-json",
        "--output-format", "stream-json",
    ]

    process = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )

    # Send first message - short task
    msg1 = {
        "type": "user",
        "message": {
            "role": "user",
            "content": "Count from 1 to 5, one number per line."
        }
    }

    print(f"[{timestamp()}] Sending first message...")
    process.stdin.write(json.dumps(msg1) + "\n")
    process.stdin.flush()

    # Wait for first stream_event (Claude started responding)
    saw_streaming = False
    start_time = time.time()

    while time.time() - start_time < 10:
        if process.poll() is not None:
            break
        if process.stdout and select.select([process.stdout], [], [], 0.1)[0]:
            line = process.stdout.readline()
            if line:
                try:
                    event = json.loads(line)
                    etype = event.get("type")
                    print(f"[{timestamp()}] Event: {etype}")
                    # Look for assistant or system event (Claude is responding)
                    if etype == "assistant":
                        saw_streaming = True
                        print(f"[{timestamp()}] Claude started responding!")
                        break
                except:
                    pass

    if not saw_streaming:
        print("Never saw streaming start, aborting")
        process.terminate()
        return 1

    # NOW send second message while Claude is streaming
    msg2 = {
        "type": "user",
        "message": {
            "role": "user",
            "content": "Say 'SECOND MESSAGE RECEIVED'"
        }
    }

    print(f"[{timestamp()}] Injecting second message during streaming...")
    try:
        process.stdin.write(json.dumps(msg2) + "\n")
        process.stdin.flush()
        print(f"[{timestamp()}] Second message sent!")
    except Exception as e:
        print(f"[{timestamp()}] Failed to send: {e}")

    # Now collect ALL output until process ends or timeout
    results = []
    event_types = []

    print(f"[{timestamp()}] Collecting all output...")

    while time.time() - start_time < 60:
        if process.poll() is not None:
            print(f"[{timestamp()}] Process ended")
            break

        if process.stdout and select.select([process.stdout], [], [], 0.5)[0]:
            line = process.stdout.readline()
            if line:
                try:
                    event = json.loads(line)
                    event_type = event.get("type", "unknown")
                    event_types.append(event_type)

                    if event_type == "result":
                        result_text = event.get("result", "")
                        results.append(result_text)
                        print(f"[{timestamp()}] RESULT: {result_text[:100]}...")

                except:
                    pass

    # Clean up
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=5)

    print()
    print("="*70)
    print("ANALYSIS")
    print("="*70)

    print(f"Total result events: {len(results)}")
    print(f"Event types seen: {set(event_types)}")

    for i, r in enumerate(results):
        print(f"\nResult {i+1}:")
        print(f"  {r[:200]}")
        if "SECOND MESSAGE" in r:
            print("  *** SECOND MESSAGE WAS PROCESSED! ***")

    print()
    print("="*70)
    print("CONCLUSION")
    print("="*70)

    if len(results) >= 2:
        print("Multiple results received!")
        if any("SECOND MESSAGE" in r for r in results):
            print("QUEUED: Second message was queued and processed after first completed")
        else:
            print("QUEUED: Multiple responses but second message content unclear")
    elif len(results) == 1:
        if "SECOND MESSAGE" in results[0]:
            print("INTERRUPTED: Second message interrupted and replaced first response!")
        else:
            print("IGNORED: Only one response, second message was ignored")
    else:
        print("NO RESULTS: Something went wrong")

    return 0


if __name__ == "__main__":
    sys.exit(main())
