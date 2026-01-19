#!/usr/bin/env python3
"""
Test 06: Hooks

Purpose: Validate that hooks fire in headless mode and can notify an external server.

Questions to answer:
- Do hooks fire in `-p` mode?
- What's the payload schema sent to hooks?
- How much latency between tool completion and hook arrival?
- Can we rely on hooks for state sync?
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path


# Global storage for received hooks
received_hooks = []
hook_times = []


class HookHandler(BaseHTTPRequestHandler):
    """Simple HTTP handler to receive hook payloads."""
    
    def log_message(self, format, *args):
        # Suppress default logging
        pass
    
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        
        receive_time = datetime.now()
        hook_times.append(receive_time)
        
        try:
            payload = json.loads(body)
            received_hooks.append({
                "time": receive_time.isoformat(),
                "payload": payload
            })
            print(f"[HOOK] Received: {payload.get('type', 'unknown')} at {receive_time.strftime('%H:%M:%S.%f')[:-3]}")
        except json.JSONDecodeError:
            received_hooks.append({
                "time": receive_time.isoformat(),
                "raw": body
            })
            print(f"[HOOK] Received raw: {body[:100]}")
        
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'OK')


def start_hook_server(port: int) -> HTTPServer:
    """Start HTTP server for receiving hooks."""
    server = HTTPServer(('localhost', port), HookHandler)
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()
    return server


def main():
    results_dir = Path(__file__).parent.parent / "results"
    results_dir.mkdir(exist_ok=True)
    
    print("="*70)
    print("TEST 06: Hooks")
    print("="*70)
    
    # Start hook receiver server
    port = 9999
    print(f"\nStarting hook receiver on port {port}...")
    server = start_hook_server(port)
    print(f"Server running at http://localhost:{port}")
    
    # Create test directory with hook settings
    test_dir = tempfile.mkdtemp(prefix="claude_hook_test_")
    settings_dir = Path(test_dir) / ".claude"
    settings_dir.mkdir()
    
    # Settings with hooks configured
    settings = {
        "permissions": {
            "allow": ["Bash", "Read", "Write", "Glob"],
            "deny": []
        },
        "hooks": {
            "PreToolUse": [{
                "matcher": "*",
                "hooks": [{
                    "type": "command",
                    "command": f"curl -s -X POST http://localhost:{port}/pretool -H 'Content-Type: application/json' -d @-"
                }]
            }],
            "PostToolUse": [{
                "matcher": "*", 
                "hooks": [{
                    "type": "command",
                    "command": f"curl -s -X POST http://localhost:{port}/posttool -H 'Content-Type: application/json' -d @-"
                }]
            }],
            "Stop": [{
                "matcher": "",
                "hooks": [{
                    "type": "command",
                    "command": f"curl -s -X POST http://localhost:{port}/stop -H 'Content-Type: application/json' -d @-"
                }]
            }]
        }
    }
    
    settings_path = settings_dir / "settings.json"
    settings_path.write_text(json.dumps(settings, indent=2))
    print(f"\nCreated settings at: {settings_path}")
    print(f"Hook configuration: PreToolUse, PostToolUse, Stop")
    
    # Create a test file to read
    test_file = Path(test_dir) / "test.txt"
    test_file.write_text("Hello from test file!")
    
    # Run Claude with a task that uses tools
    print("\n" + "-"*50)
    print("Running Claude with tool-using task...")
    print("-"*50)
    
    start_time = datetime.now()
    
    cmd = [
        "claude",
        "-p",
        "--verbose",
        "--output-format", "stream-json",
        "--dangerously-skip-permissions",
        f"Read the file {test_file} and tell me what it says."
    ]
    
    print(f"Command: {' '.join(cmd[:4])}...")
    print(f"Working directory: {test_dir}")
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=60,
        cwd=test_dir
    )
    
    end_time = datetime.now()
    
    print(f"\nClaude exit code: {result.returncode}")
    print(f"Total duration: {(end_time - start_time).total_seconds():.2f}s")
    
    # Parse Claude output
    events = []
    for line in result.stdout.strip().split('\n'):
        if line.strip():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    
    print(f"Claude events: {len(events)}")
    
    # Wait a moment for any remaining hooks
    time.sleep(1)
    
    # Stop server
    server.shutdown()
    
    # Analyze hooks received
    print("\n" + "-"*50)
    print("HOOKS RECEIVED")
    print("-"*50)
    
    print(f"Total hooks received: {len(received_hooks)}")
    
    for i, hook in enumerate(received_hooks):
        print(f"\n--- Hook {i+1} ---")
        print(f"Time: {hook['time']}")
        if 'payload' in hook:
            payload = hook['payload']
            print(f"Type: {payload.get('type', 'unknown')}")
            print(f"Keys: {list(payload.keys())}")
            # Pretty print payload (truncated)
            payload_str = json.dumps(payload, indent=2)
            if len(payload_str) > 400:
                payload_str = payload_str[:400] + "\n..."
            print(f"Payload:\n{payload_str}")
        else:
            print(f"Raw: {hook.get('raw', '')[:200]}")
    
    # Calculate latency
    print("\n" + "-"*50)
    print("TIMING ANALYSIS")
    print("-"*50)
    
    if hook_times:
        first_hook = hook_times[0]
        last_hook = hook_times[-1]
        total_hook_time = (last_hook - first_hook).total_seconds()
        print(f"First hook: {first_hook.strftime('%H:%M:%S.%f')[:-3]}")
        print(f"Last hook: {last_hook.strftime('%H:%M:%S.%f')[:-3]}")
        print(f"Hook span: {total_hook_time:.3f}s")
        
        # Time from Claude start to first hook
        time_to_first = (first_hook - start_time).total_seconds()
        print(f"Time from Claude start to first hook: {time_to_first:.3f}s")
    else:
        print("No hooks received - timing analysis not available")
    
    # Clean up
    try:
        shutil.rmtree(test_dir)
    except:
        pass
    
    # Summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    
    hook_types = set()
    for hook in received_hooks:
        if 'payload' in hook:
            hook_types.add(hook['payload'].get('type', 'unknown'))
    
    print(f"Hooks received: {len(received_hooks)}")
    print(f"Hook types: {sorted(hook_types)}")
    print(f"Claude completed: {result.returncode == 0}")
    
    print("\n" + "="*70)
    print("CONCLUSION")
    print("="*70)
    
    if received_hooks:
        print("SUCCESS: Hooks fire in headless mode!")
        print("\nPayload schema (from first hook):")
        if received_hooks[0].get('payload'):
            sample = received_hooks[0]['payload']
            print(f"  Keys: {list(sample.keys())}")
        
        print("\nHooks can be used for:")
        print("  - Real-time tool execution notifications")
        print("  - State synchronization with GUI")
        print("  - Permission prompt detection")
        print("  - Progress tracking")
    else:
        print("FAILED: No hooks received")
        print("\nPossible causes:")
        print("  - Hooks may not fire in -p mode")
        print("  - Settings file may not be picked up")
        print("  - curl command may have failed silently")
        if result.stderr:
            print(f"\nClaude stderr: {result.stderr[:300]}")
    
    # Save findings
    findings = {
        "hooks_received": len(received_hooks),
        "hook_types": list(hook_types),
        "hooks": received_hooks,
        "claude_exit_code": result.returncode,
        "claude_events": len(events),
        "timing": {
            "total_duration": (end_time - start_time).total_seconds(),
            "time_to_first_hook": (hook_times[0] - start_time).total_seconds() if hook_times else None
        }
    }
    
    output_path = results_dir / "hooks_findings.json"
    with open(output_path, "w") as f:
        json.dump(findings, f, indent=2, default=str)
    print(f"\nFindings saved to: {output_path}")
    
    return 0 if received_hooks else 1


if __name__ == "__main__":
    sys.exit(main())
