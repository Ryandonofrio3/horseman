#!/usr/bin/env python3
"""
Test: Mid-Stream Steering

Can we inject input via stdin while Claude is actively streaming a response?

This tests whether headless mode supports the equivalent of double-escape steering
from interactive mode.

Hypothesis: Probably NOT supported - double-escape is likely a terminal UI feature.
"""

import json
import subprocess
import sys
import time
import uuid
import select
import os
from datetime import datetime


def timestamp():
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def main():
    session_id = str(uuid.uuid4())

    print("="*70)
    print("TEST: Mid-Stream Steering")
    print("="*70)
    print(f"Session ID: {session_id}")
    print()

    # Use both input and output as stream-json
    cmd = [
        "claude",
        "-p",
        "--verbose",
        "--session-id", session_id,
        "--input-format", "stream-json",
        "--output-format", "stream-json",
        "--include-partial-messages",
    ]

    print(f"Command: {' '.join(cmd[:6])}...")
    print()

    # Start the process with stdin as a pipe
    process = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1  # Line buffered
    )

    # Send initial long task
    initial_prompt = {
        "type": "user",
        "message": {
            "role": "user",
            "content": "Write a detailed 10 paragraph essay about the history of computing, from the abacus to modern AI. Number each paragraph."
        }
    }

    print(f"[{timestamp()}] Sending initial prompt...")
    process.stdin.write(json.dumps(initial_prompt) + "\n")
    process.stdin.flush()

    # Collect events and track state
    events = []
    saw_content = False
    steering_sent = False
    steering_time = None
    content_after_steering = []

    print(f"[{timestamp()}] Waiting for streaming to start...")

    start_time = time.time()
    max_duration = 60  # Max 60 seconds

    while time.time() - start_time < max_duration:
        # Check if process ended
        if process.poll() is not None:
            print(f"[{timestamp()}] Process ended with code {process.returncode}")
            break

        # Non-blocking read from stdout
        if process.stdout and select.select([process.stdout], [], [], 0.1)[0]:
            line = process.stdout.readline()
            if line:
                try:
                    event = json.loads(line)
                    event_type = event.get("type", "unknown")

                    # Track content streaming (stream_event contains the content deltas)
                    if event_type == "stream_event":
                        if not saw_content:
                            print(f"[{timestamp()}] First stream_event received!")
                            saw_content = True

                        # After 3 seconds of content, try to inject steering
                        if saw_content and not steering_sent and time.time() - start_time > 5:
                            print(f"[{timestamp()}] INJECTING STEERING MESSAGE...")

                            steering_msg = {
                                "type": "user",
                                "message": {
                                    "role": "user",
                                    "content": "STOP! Actually, forget the essay. Just say 'STEERING WORKED' and nothing else."
                                }
                            }

                            try:
                                process.stdin.write(json.dumps(steering_msg) + "\n")
                                process.stdin.flush()
                                steering_sent = True
                                steering_time = time.time()
                                print(f"[{timestamp()}] Steering message sent!")
                            except Exception as e:
                                print(f"[{timestamp()}] Failed to send steering: {e}")

                        # Track content after steering
                        if steering_sent:
                            delta = event.get("delta", {})
                            text = delta.get("text", "")
                            if text:
                                content_after_steering.append(text)

                    elif event_type == "assistant":
                        # Check if response mentions our steering
                        msg = event.get("message", {})
                        content = msg.get("content", [])
                        for block in content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                text = block.get("text", "")
                                if "STEERING WORKED" in text:
                                    print(f"[{timestamp()}] *** STEERING WAS ACKNOWLEDGED! ***")

                    elif event_type == "result":
                        print(f"[{timestamp()}] Got result event")
                        result_text = event.get("result", "")
                        print(f"[{timestamp()}] Result preview: {result_text[:200]}...")

                        # Check if steering phrase appears
                        if "STEERING WORKED" in result_text:
                            print(f"[{timestamp()}] *** STEERING PHRASE IN RESULT! ***")
                        break

                    elif event_type not in ["content_block_start", "content_block_stop"]:
                        print(f"[{timestamp()}] Event: {event_type}")

                    events.append(event)

                except json.JSONDecodeError:
                    pass

        # If we've been collecting content after steering for 10s, stop
        if steering_sent and steering_time and time.time() - steering_time > 15:
            print(f"[{timestamp()}] 15s after steering, checking results...")
            break

    # Clean up
    if process.poll() is None:
        print(f"[{timestamp()}] Terminating process...")
        process.terminate()
        try:
            process.wait(timeout=5)
        except:
            process.kill()

    # Analyze results
    print()
    print("="*70)
    print("ANALYSIS")
    print("="*70)

    print(f"Events collected: {len(events)}")
    print(f"Saw content streaming: {saw_content}")
    print(f"Steering message sent: {steering_sent}")

    if content_after_steering:
        combined = "".join(content_after_steering)
        print(f"\nContent received AFTER steering ({len(combined)} chars):")
        print(f"  Preview: {combined[:300]}...")

        if "STEERING WORKED" in combined:
            print("\n*** SUCCESS: Steering phrase appeared! ***")
        elif "paragraph" in combined.lower() or "computing" in combined.lower():
            print("\n*** STEERING IGNORED: Claude continued the essay ***")
        else:
            print("\n*** UNCLEAR: Check content manually ***")

    print()
    print("="*70)
    print("CONCLUSION")
    print("="*70)

    steering_worked = steering_sent and "STEERING WORKED" in "".join(content_after_steering)

    if steering_worked:
        print("SUCCESS: Mid-stream steering IS supported in headless mode!")
        print("- stdin accepts input while streaming")
        print("- Claude can be redirected mid-response")
        print("- GUI can implement steering like interactive mode")
    else:
        print("FAILED: Mid-stream steering does NOT work in headless mode")
        print("- stdin input during streaming is either:")
        print("  a) Ignored until current response completes")
        print("  b) Queued for next turn")
        print("  c) Causes an error")
        print("")
        print("GUI options:")
        print("  1. Hard stop (SIGINT) + resume with new context")
        print("  2. Accept sequential turns only")
        print("  3. PTY mode might support it differently")

    return 0 if steering_worked else 1


if __name__ == "__main__":
    sys.exit(main())
