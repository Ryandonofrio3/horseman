#!/usr/bin/env python3
"""
Experiment 05: PTY Stdin for Follow-up Messages

Key question: Can we keep one PTY alive per session and send multiple messages?

If YES → Simpler architecture (one PTY per session)
If NO → Still need "many PTYs" (one per message, like current headless approach)

Current headless approach (D001):
- stdin(Stdio::null()) because stdin is "cursed"
- New process per message with --resume
- Works but spawns many processes

PTY approach being tested:
- PTY stdin might work because PTY expects interactive input
- Could send message, wait for response, send another
- Would be more like actual terminal usage
"""

import json
import os
import pty
import sys
import time
import select
import signal
from datetime import datetime


def timestamp():
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def main():
    print("=" * 70)
    print("EXPERIMENT 05: PTY Stdin for Follow-up Messages")
    print("=" * 70)
    print()
    print("Testing if we can send multiple messages to one Claude PTY...")
    print()

    # Spawn Claude in PTY without -p flag (interactive mode)
    cmd = ["claude", "--verbose"]

    print(f"[{timestamp()}] Spawning PTY: {' '.join(cmd)}")

    pid, fd = pty.fork()

    if pid == 0:
        # Child process
        os.execvp(cmd[0], cmd)
    else:
        # Parent process
        output_buffer = []

        def read_available():
            """Read all available output from PTY."""
            chunks = []
            while True:
                ready, _, _ = select.select([fd], [], [], 0.1)
                if ready:
                    try:
                        data = os.read(fd, 4096)
                        if data:
                            decoded = data.decode('utf-8', errors='replace')
                            chunks.append(decoded)
                            print(decoded, end='', flush=True)
                        else:
                            break
                    except OSError:
                        break
                else:
                    break
            return ''.join(chunks)

        def write_message(msg: str):
            """Write message to PTY stdin."""
            print(f"\n[{timestamp()}] SENDING: {msg[:50]}...")
            os.write(fd, (msg + "\n").encode())

        def wait_for_prompt(timeout=60):
            """Wait for Claude to finish responding (look for prompt)."""
            start = time.time()
            output = []
            while time.time() - start < timeout:
                chunk = read_available()
                if chunk:
                    output.append(chunk)
                    # Look for indicators that Claude is done
                    # This is tricky - Claude might show a prompt or just stop
                    full = ''.join(output)
                    if '>' in full[-50:] or '❯' in full[-50:]:  # Common prompt chars
                        return ''.join(output)
                time.sleep(0.1)
            return ''.join(output)

        try:
            # Wait for initial startup
            print(f"[{timestamp()}] Waiting for Claude startup...")
            time.sleep(3)
            initial = read_available()

            # Send first message
            print(f"\n[{timestamp()}] === SENDING MESSAGE 1 ===")
            write_message("Say 'FIRST' and nothing else")

            # Wait for response
            print(f"[{timestamp()}] Waiting for response 1...")
            response1 = wait_for_prompt(timeout=30)

            print(f"\n[{timestamp()}] === SENDING MESSAGE 2 ===")
            write_message("Say 'SECOND' and nothing else")

            print(f"[{timestamp()}] Waiting for response 2...")
            response2 = wait_for_prompt(timeout=30)

            print(f"\n[{timestamp()}] === SENDING MESSAGE 3 ===")
            write_message("What was my first message to you?")

            print(f"[{timestamp()}] Waiting for response 3...")
            response3 = wait_for_prompt(timeout=30)

            # Analysis
            print()
            print("=" * 70)
            print("ANALYSIS")
            print("=" * 70)

            full_output = initial + response1 + response2 + response3

            has_first = "FIRST" in full_output.upper()
            has_second = "SECOND" in full_output.upper()
            remembers = "FIRST" in response3.upper() or "first" in response3.lower()

            print(f"Got 'FIRST' response: {has_first}")
            print(f"Got 'SECOND' response: {has_second}")
            print(f"Claude remembers first message: {remembers}")

            print()
            print("=" * 70)
            print("CONCLUSION")
            print("=" * 70)

            if has_first and has_second and remembers:
                print("✅ PTY STDIN WORKS!")
                print()
                print("We CAN keep one PTY per session and send multiple messages.")
                print("This is simpler than spawning per message.")
                print()
                print("Architecture option:")
                print("  1. Spawn one PTY per session")
                print("  2. Send messages via PTY stdin")
                print("  3. Watch transcript for events")
                print("  4. No --resume needed!")
            elif has_first and has_second:
                print("🟡 PARTIAL: Messages work but no context")
                print("Each message might start fresh (like separate sessions)")
            else:
                print("❌ PTY STDIN DOESN'T WORK")
                print("Still need many-process approach with --resume")

        except Exception as e:
            print(f"\n[{timestamp()}] ERROR: {e}")

        finally:
            # Cleanup
            print(f"\n[{timestamp()}] Cleaning up PTY...")
            try:
                os.kill(pid, signal.SIGTERM)
                os.waitpid(pid, 0)
            except:
                pass
            try:
                os.close(fd)
            except:
                pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
