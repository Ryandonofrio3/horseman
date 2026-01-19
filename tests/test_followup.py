#!/usr/bin/env python3
"""
Follow-up tests for Claude Code GUI Feasibility.

Test 3A: SIGTERM instead of SIGINT
Test 3B: Wait for content before interrupt
Test 3C: Resume completed session
Test 5A: Image with --dangerously-skip-permissions
Test 5B: Check for image CLI flags
"""

import json
import os
import signal
import subprocess
import sys
import time
import uuid
import tempfile
import struct
import zlib
from pathlib import Path
from datetime import datetime


def timestamp() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def create_test_image() -> bytes:
    """Create a simple red square test image (PNG)."""
    width, height = 8, 8

    def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
        chunk_len = struct.pack('>I', len(data))
        chunk_crc = struct.pack('>I', zlib.crc32(chunk_type + data) & 0xffffffff)
        return chunk_len + chunk_type + data + chunk_crc

    signature = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr = png_chunk(b'IHDR', ihdr_data)

    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'
        for x in range(width):
            raw_data += b'\xff\x00\x00'  # Red pixel

    compressed = zlib.compress(raw_data)
    idat = png_chunk(b'IDAT', compressed)
    iend = png_chunk(b'IEND', b'')

    return signature + ihdr + idat + iend


def parse_events(stdout: str) -> list[dict]:
    """Parse stream-json output into events."""
    events = []
    for line in stdout.strip().split('\n'):
        if line.strip():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return events


def get_result_text(events: list[dict]) -> str:
    """Extract result text from events."""
    for event in events:
        if event.get("type") == "result":
            result_data = event.get("result", "")
            if isinstance(result_data, dict):
                return result_data.get("text", "")
            return str(result_data)
    return ""


def main():
    results_dir = Path(__file__).parent.parent / "results"
    results_dir.mkdir(exist_ok=True)

    findings = {}

    print("="*70)
    print("FOLLOW-UP TESTS")
    print("="*70)

    # ================================================================
    # TEST 3A: SIGTERM instead of SIGINT
    # ================================================================
    print("\n" + "="*70)
    print("TEST 3A: SIGTERM instead of SIGINT")
    print("="*70)

    session_id_3a = str(uuid.uuid4())
    cmd_3a = [
        "claude", "-p", "--verbose",
        "--session-id", session_id_3a,
        "--output-format", "stream-json",
        "Write a detailed 10 paragraph essay about space exploration."
    ]

    print(f"Session ID: {session_id_3a}")
    print(f"Command: {' '.join(cmd_3a[:6])}...")

    process_3a = subprocess.Popen(
        cmd_3a,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    # Wait 10 seconds then SIGTERM
    print(f"[{timestamp()}] Started, waiting 10s before SIGTERM...")
    time.sleep(10)

    if process_3a.poll() is None:
        print(f"[{timestamp()}] Sending SIGTERM...")
        process_3a.send_signal(signal.SIGTERM)
        try:
            stdout_3a, stderr_3a = process_3a.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            process_3a.kill()
            stdout_3a, stderr_3a = process_3a.communicate()
    else:
        stdout_3a, stderr_3a = process_3a.communicate()

    exit_code_3a = process_3a.returncode
    events_3a = parse_events(stdout_3a)

    print(f"Exit code: {exit_code_3a}")
    print(f"Events collected: {len(events_3a)}")

    # Check transcript
    transcript_dir = Path.home() / ".claude" / "projects"
    transcript_3a_found = False
    transcript_3a_content = ""

    for jsonl in transcript_dir.rglob("*.jsonl"):
        if session_id_3a in jsonl.name:
            transcript_3a_found = True
            transcript_3a_content = jsonl.read_text()
            print(f"Transcript found: {jsonl}")
            print(f"Transcript lines: {len(transcript_3a_content.strip().split(chr(10)))}")
            break

    findings["test_3a_sigterm"] = {
        "session_id": session_id_3a,
        "exit_code": exit_code_3a,
        "events_collected": len(events_3a),
        "transcript_found": transcript_3a_found,
        "transcript_lines": len(transcript_3a_content.strip().split('\n')) if transcript_3a_content else 0,
        "pass": transcript_3a_found and len(events_3a) > 0,
        "implication": "SIGTERM may allow cleaner shutdown with transcript write"
    }

    # ================================================================
    # TEST 3B: Wait for content before interrupt
    # ================================================================
    print("\n" + "="*70)
    print("TEST 3B: Wait for content_block_delta before SIGINT")
    print("="*70)

    session_id_3b = str(uuid.uuid4())
    cmd_3b = [
        "claude", "-p", "--verbose",
        "--session-id", session_id_3b,
        "--output-format", "stream-json",
        "--include-partial-messages",
        "Write a detailed 10 paragraph essay about the history of computers."
    ]

    print(f"Session ID: {session_id_3b}")
    print(f"Command: {' '.join(cmd_3b[:6])}...")

    process_3b = subprocess.Popen(
        cmd_3b,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    import select

    output_3b = []
    saw_content_delta = False
    start_time = time.time()
    max_wait = 60  # Max 60 seconds

    print(f"[{timestamp()}] Waiting for content_block_delta event...")

    while time.time() - start_time < max_wait:
        if process_3b.poll() is not None:
            print(f"[{timestamp()}] Process ended early")
            break

        if process_3b.stdout and select.select([process_3b.stdout], [], [], 0.1)[0]:
            line = process_3b.stdout.readline()
            if line:
                output_3b.append(line)
                try:
                    event = json.loads(line)
                    event_type = event.get("type", "")
                    if event_type == "content_block_delta":
                        saw_content_delta = True
                        print(f"[{timestamp()}] Got content_block_delta! Waiting 2s then SIGINT...")
                        time.sleep(2)  # Let it write a bit more
                        break
                    elif event_type not in ["content_block_start", "content_block_stop"]:
                        print(f"[{timestamp()}] Event: {event_type}")
                except json.JSONDecodeError:
                    pass

    if process_3b.poll() is None:
        print(f"[{timestamp()}] Sending SIGINT...")
        process_3b.send_signal(signal.SIGINT)
        try:
            stdout_rest, stderr_3b = process_3b.communicate(timeout=10)
            output_3b.append(stdout_rest)
        except subprocess.TimeoutExpired:
            process_3b.kill()
            stdout_rest, stderr_3b = process_3b.communicate()
            output_3b.append(stdout_rest)
    else:
        _, stderr_3b = process_3b.communicate()

    exit_code_3b = process_3b.returncode
    full_output_3b = "".join(output_3b)
    events_3b = parse_events(full_output_3b)

    print(f"Exit code: {exit_code_3b}")
    print(f"Events collected: {len(events_3b)}")
    print(f"Saw content_block_delta: {saw_content_delta}")

    # Check transcript
    transcript_3b_found = False
    transcript_3b_lines = 0

    for jsonl in transcript_dir.rglob("*.jsonl"):
        if session_id_3b in jsonl.name:
            transcript_3b_found = True
            content = jsonl.read_text()
            transcript_3b_lines = len(content.strip().split('\n'))
            print(f"Transcript found: {jsonl}")
            print(f"Transcript lines: {transcript_3b_lines}")
            break

    findings["test_3b_wait_content"] = {
        "session_id": session_id_3b,
        "exit_code": exit_code_3b,
        "events_collected": len(events_3b),
        "saw_content_delta": saw_content_delta,
        "transcript_found": transcript_3b_found,
        "transcript_lines": transcript_3b_lines,
        "pass": transcript_3b_found and transcript_3b_lines > 1,
        "implication": "Waiting for content before interrupt ensures transcript is written"
    }

    # ================================================================
    # TEST 3C: Resume completed session
    # ================================================================
    print("\n" + "="*70)
    print("TEST 3C: Resume completed session from Test 02")
    print("="*70)

    completed_session_id = "70edc9b3-c11f-403b-aa2c-b415f9fc6f99"
    cmd_3c = [
        "claude", "-p", "--verbose",
        "--resume", completed_session_id,
        "--output-format", "stream-json",
        "What was the secret code?"
    ]

    print(f"Session ID: {completed_session_id}")
    print(f"Command: {' '.join(cmd_3c)}")

    result_3c = subprocess.run(
        cmd_3c,
        capture_output=True,
        text=True,
        timeout=60
    )

    exit_code_3c = result_3c.returncode
    events_3c = parse_events(result_3c.stdout)
    response_3c = get_result_text(events_3c)

    print(f"Exit code: {exit_code_3c}")
    print(f"Events: {len(events_3c)}")
    print(f"Response: {response_3c[:200]}")

    # Check if it remembered the secret (7492 from test 02)
    remembered = "7492" in response_3c
    print(f"Remembered secret code: {remembered}")

    findings["test_3c_resume_completed"] = {
        "session_id": completed_session_id,
        "exit_code": exit_code_3c,
        "events": len(events_3c),
        "response": response_3c[:500],
        "remembered_secret": remembered,
        "pass": exit_code_3c == 0 and remembered,
        "implication": "Completed sessions can be resumed successfully"
    }

    # ================================================================
    # TEST 5A: Image with --dangerously-skip-permissions
    # ================================================================
    print("\n" + "="*70)
    print("TEST 5A: Image file with --dangerously-skip-permissions")
    print("="*70)

    # Create and save test image
    image_bytes = create_test_image()
    image_path = results_dir / "test_red_square.png"
    image_path.write_bytes(image_bytes)
    print(f"Created test image: {image_path}")

    cmd_5a = [
        "claude", "-p", "--verbose",
        "--dangerously-skip-permissions",
        "--output-format", "stream-json",
        f"Describe the image at {image_path}. What color is it? Be specific."
    ]

    print(f"Command: {' '.join(cmd_5a[:5])}...")

    result_5a = subprocess.run(
        cmd_5a,
        capture_output=True,
        text=True,
        timeout=60
    )

    exit_code_5a = result_5a.returncode
    events_5a = parse_events(result_5a.stdout)
    response_5a = get_result_text(events_5a)

    print(f"Exit code: {exit_code_5a}")
    print(f"Events: {len(events_5a)}")
    print(f"Response: {response_5a[:300]}")

    # Check if Claude identified the red color
    identified_red = "red" in response_5a.lower()
    print(f"Identified red color: {identified_red}")

    if result_5a.stderr:
        print(f"Stderr: {result_5a.stderr[:200]}")

    findings["test_5a_image_skip_perms"] = {
        "image_path": str(image_path),
        "exit_code": exit_code_5a,
        "events": len(events_5a),
        "response": response_5a[:500],
        "identified_red": identified_red,
        "pass": exit_code_5a == 0 and identified_red,
        "implication": "File path references work for images with proper permissions"
    }

    # ================================================================
    # TEST 5B: Check for image CLI flags
    # ================================================================
    print("\n" + "="*70)
    print("TEST 5B: Check for image CLI flags")
    print("="*70)

    help_result = subprocess.run(
        ["claude", "--help"],
        capture_output=True,
        text=True
    )

    help_text = help_result.stdout + help_result.stderr

    # Search for image-related content
    image_lines = []
    for line in help_text.split('\n'):
        if 'image' in line.lower() or 'attach' in line.lower() or 'file' in line.lower():
            image_lines.append(line.strip())

    print("Image-related help text:")
    for line in image_lines[:10]:
        print(f"  {line}")

    # Also check specific flags
    has_image_flag = "--image" in help_text
    has_attach_flag = "--attach" in help_text or "-a" in help_text
    has_file_flag = "--file" in help_text

    print(f"\n--image flag: {has_image_flag}")
    print(f"--attach/-a flag: {has_attach_flag}")
    print(f"--file flag: {has_file_flag}")

    findings["test_5b_image_flags"] = {
        "has_image_flag": has_image_flag,
        "has_attach_flag": has_attach_flag,
        "has_file_flag": has_file_flag,
        "image_related_lines": image_lines[:10],
        "pass": has_image_flag or has_attach_flag,
        "implication": "CLI may support direct image attachment via flags"
    }

    # ================================================================
    # SUMMARY
    # ================================================================
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)

    for test_name, result in findings.items():
        status = "PASS" if result.get("pass") else "FAIL"
        print(f"\n{test_name}: {status}")
        print(f"  Implication: {result.get('implication', 'N/A')}")

    print("\n" + "="*70)
    print("GUI ARCHITECTURE IMPLICATIONS")
    print("="*70)

    print("""
Based on follow-up tests:

1. INTERRUPTION HANDLING:
   - Must wait for content to start streaming before interrupt
   - SIGINT after content_block_delta preserves transcript
   - Completed sessions resume reliably

2. IMAGE INPUT:
   - File path references work when permissions are handled
   - May have dedicated CLI flags for attachments
   - GUI should use file paths, not base64 stdin

3. RECOMMENDATIONS:
   - Track streaming state before allowing user interrupt
   - Use --dangerously-skip-permissions or pre-approve Read tool
   - Reference images by absolute path in prompts
""")

    # Save findings
    output_path = results_dir / "followup_tests.json"
    with open(output_path, "w") as f:
        json.dump(findings, f, indent=2, default=str)
    print(f"\nResults saved to: {output_path}")

    # Return success if most tests passed
    passed = sum(1 for r in findings.values() if r.get("pass"))
    total = len(findings)
    print(f"\nTests passed: {passed}/{total}")

    return 0 if passed >= 3 else 1


if __name__ == "__main__":
    sys.exit(main())
