#!/usr/bin/env python3
"""
Test 03: Interruption

Purpose: Validate that we can interrupt Claude mid-task and resume cleanly.

Questions to answer:
- Does SIGINT stop the process cleanly?
- What exit code do we get?
- Is the session state consistent after interrupt?
- Does resume work after interrupt?
- Does Claude acknowledge the context change?
"""

import json
import os
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path
from datetime import datetime


def timestamp() -> str:
    """Return current timestamp."""
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def main():
    results_dir = Path(__file__).parent.parent / "results"
    results_dir.mkdir(exist_ok=True)
    
    session_id = str(uuid.uuid4())
    events_log = []
    
    def log_event(event: str, details: str = ""):
        ts = timestamp()
        entry = f"[{ts}] {event}"
        if details:
            entry += f": {details}"
        print(entry)
        events_log.append({"time": ts, "event": event, "details": details})
    
    print("="*70)
    print("TEST 03: Interruption and Resume")
    print("="*70)
    print(f"Session ID: {session_id}")
    
    # Step 1: Start a long-running task
    log_event("START", "Beginning long-running task")
    
    cmd = [
        "claude",
        "-p",
        "--verbose",
        "--session-id", session_id,
        "--output-format", "stream-json",
        "Write a 20 paragraph essay about the history of computing, from the abacus to modern AI. Be very detailed and thorough."
    ]
    
    log_event("SPAWN", f"Command: {' '.join(cmd[:5])}...")
    
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    log_event("RUNNING", f"PID: {process.pid}")
    
    # Collect output for a few seconds
    output_lines = []
    start_time = time.time()
    interrupt_delay = 15  # seconds - give Claude time to actually start writing
    
    log_event("COLLECTING", f"Will interrupt after {interrupt_delay} seconds")
    
    # Non-blocking read with timeout
    import select
    
    while time.time() - start_time < interrupt_delay:
        # Check if there's data to read
        if process.stdout and select.select([process.stdout], [], [], 0.1)[0]:
            line = process.stdout.readline()
            if line:
                output_lines.append(line)
                # Parse to show progress
                try:
                    event = json.loads(line)
                    event_type = event.get("type", "unknown")
                    if event_type == "content_block_delta":
                        # Show we're receiving streaming content
                        pass
                    elif event_type not in ["content_block_start", "content_block_stop"]:
                        log_event("EVENT", f"type={event_type}")
                except json.JSONDecodeError:
                    pass
        
        # Check if process ended early
        if process.poll() is not None:
            log_event("EARLY_EXIT", f"Process ended with code {process.returncode}")
            break
    
    # Step 2: Send SIGINT
    if process.poll() is None:
        log_event("SIGINT", "Sending interrupt signal")
        process.send_signal(signal.SIGINT)
        
        # Wait for process to end
        try:
            stdout, stderr = process.communicate(timeout=10)
            output_lines.append(stdout)
        except subprocess.TimeoutExpired:
            log_event("TIMEOUT", "Process didn't respond to SIGINT, killing")
            process.kill()
            stdout, stderr = process.communicate()
    else:
        stdout, stderr = "", ""
    
    exit_code = process.returncode
    log_event("INTERRUPTED", f"Exit code: {exit_code}")
    
    # Analyze what we got
    total_output = "".join(output_lines)
    event_count = len([l for l in total_output.split('\n') if l.strip()])
    log_event("OUTPUT", f"Collected {event_count} events before interrupt")
    
    # Step 3: Wait before resume
    pause_duration = 5  # seconds - let session state settle
    log_event("PAUSE", f"Waiting {pause_duration} seconds before resume")
    time.sleep(pause_duration)
    
    # Step 4: Resume with different topic
    log_event("RESUME", "Resuming with new direction")
    
    resume_cmd = [
        "claude",
        "-p",
        "--verbose",
        "--resume", session_id,
        "--output-format", "stream-json",
        "Actually, forget the computing essay. Instead, just tell me in one sentence: what were you writing about when I interrupted you?"
    ]
    
    log_event("SPAWN", f"Resume command started")
    
    result = subprocess.run(
        resume_cmd,
        capture_output=True,
        text=True,
        timeout=60
    )
    
    log_event("COMPLETE", f"Resume exit code: {result.returncode}")
    
    # Parse resume response
    response_text = ""
    for line in result.stdout.strip().split('\n'):
        if line.strip():
            try:
                event = json.loads(line)
                if event.get("type") == "result":
                    result_data = event.get("result", "")
                    response_text = result_data.get("text", "") if isinstance(result_data, dict) else str(result_data)
            except json.JSONDecodeError:
                pass
    
    log_event("RESPONSE", response_text[:200] if response_text else "No response")
    
    # Check if Claude acknowledges the context
    context_keywords = ["computing", "essay", "history", "interrupted", "writing"]
    context_acknowledged = any(kw.lower() in response_text.lower() for kw in context_keywords)
    
    log_event("CONTEXT_CHECK", f"Claude acknowledged prior context: {context_acknowledged}")
    
    # Summary
    print("\n" + "="*70)
    print("TIMELINE")
    print("="*70)
    for entry in events_log:
        print(f"[{entry['time']}] {entry['event']}: {entry['details']}")
    
    print("\n" + "="*70)
    print("FINDINGS")
    print("="*70)
    print(f"SIGINT exit code: {exit_code}")
    print(f"  - 0 = clean exit")
    print(f"  - 130 = SIGINT received (128 + 2)")
    print(f"  - Other = unexpected")
    print(f"\nEvents collected before interrupt: {event_count}")
    print(f"Resume successful: {result.returncode == 0}")
    print(f"Context preserved after interrupt: {context_acknowledged}")
    print(f"\nResume response:\n{response_text[:500]}")
    
    print("\n" + "="*70)
    print("CONCLUSION")
    print("="*70)
    
    success = result.returncode == 0 and context_acknowledged
    if success:
        print("SUCCESS: Interruption and resume work correctly!")
        print("- SIGINT stops the process")
        print("- Session state is preserved after interrupt")
        print("- Resume successfully recalls context")
    else:
        print("PARTIAL/FAILED:")
        if result.returncode != 0:
            print("- Resume command failed")
        if not context_acknowledged:
            print("- Context was not preserved/acknowledged")
    
    # Save timeline
    timeline_path = results_dir / "interruption_timeline.json"
    with open(timeline_path, "w") as f:
        json.dump({
            "session_id": session_id,
            "events": events_log,
            "findings": {
                "sigint_exit_code": exit_code,
                "events_before_interrupt": event_count,
                "resume_successful": result.returncode == 0,
                "context_preserved": context_acknowledged
            }
        }, f, indent=2)
    print(f"\nTimeline saved to: {timeline_path}")
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
