#!/usr/bin/env python3
"""
Test 04: Permission Events

Purpose: Understand how permission requests appear in stream-json output.

Questions to answer:
- How do permission requests appear in stream-json? (event type, structure)
- Does `-p` mode block waiting for permission, or fail, or skip?
- Does pre-approval via settings work in headless mode?
- What would we need to implement custom permission UI?
"""

import json
import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path


def run_claude_with_settings(
    prompt: str,
    settings: dict | None = None,
    timeout: int = 30
) -> tuple[subprocess.CompletedProcess, list[dict]]:
    """Run claude with optional custom settings and return result + parsed events."""
    
    cmd = [
        "claude",
        "-p",
        "--output-format", "stream-json",
        "--verbose"
    ]
    
    env = os.environ.copy()
    settings_file = None
    
    if settings:
        # Create temporary settings file
        settings_file = tempfile.NamedTemporaryFile(
            mode='w', 
            suffix='.json', 
            delete=False
        )
        json.dump(settings, settings_file)
        settings_file.close()
        
        # Point Claude to use these settings
        # Note: This might need adjustment based on how Claude picks up settings
        env["CLAUDE_CONFIG_PATH"] = settings_file.name
    
    cmd.append(prompt)
    
    print(f"Running: {' '.join(cmd[:6])}...")
    if settings:
        print(f"With settings: {json.dumps(settings, indent=2)}")
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env
    )
    
    # Clean up temp file
    if settings_file:
        try:
            os.unlink(settings_file.name)
        except:
            pass
    
    # Parse events
    events = []
    for line in result.stdout.strip().split('\n'):
        if line.strip():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    
    return result, events


def analyze_permission_events(events: list[dict]) -> dict:
    """Look for permission-related events."""
    findings = {
        "permission_events": [],
        "error_events": [],
        "tool_events": [],
        "result_event": None
    }
    
    for event in events:
        event_type = event.get("type", "")
        
        # Look for explicit permission events
        if "permission" in event_type.lower():
            findings["permission_events"].append(event)
        
        # Look for errors (might indicate permission denial)
        if "error" in event_type.lower() or event.get("error"):
            findings["error_events"].append(event)
        
        # Look for tool-related events
        if "tool" in event_type.lower() or "tool" in str(event.get("content", "")).lower():
            findings["tool_events"].append(event)
        
        # Capture result
        if event_type == "result":
            findings["result_event"] = event
        
        # Check content blocks for tool use
        content = event.get("content", [])
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "tool_use":
                        findings["tool_events"].append({
                            "source": "content_block",
                            "tool": block
                        })
    
    return findings


def main():
    results_dir = Path(__file__).parent.parent / "results"
    results_dir.mkdir(exist_ok=True)
    
    all_findings = {}
    
    print("="*70)
    print("TEST 04: Permission Events")
    print("="*70)
    
    # Test 1: Run command that requires permission (Bash)
    print("\n" + "-"*50)
    print("TEST 1: Bash command without pre-approval")
    print("-"*50)
    print("Note: In -p mode, this may fail or skip if permission not granted")
    
    result1, events1 = run_claude_with_settings(
        "Run the command: echo 'hello from bash'",
        timeout=30
    )
    
    print(f"Exit code: {result1.returncode}")
    print(f"Events collected: {len(events1)}")
    
    findings1 = analyze_permission_events(events1)
    all_findings["no_preapproval"] = {
        "exit_code": result1.returncode,
        "event_count": len(events1),
        "findings": findings1,
        "stderr": result1.stderr[:500] if result1.stderr else ""
    }
    
    print(f"Permission events: {len(findings1['permission_events'])}")
    print(f"Error events: {len(findings1['error_events'])}")
    print(f"Tool events: {len(findings1['tool_events'])}")
    
    if findings1["permission_events"]:
        print("\nPermission event structure:")
        for pe in findings1["permission_events"]:
            print(json.dumps(pe, indent=2)[:500])
    
    if findings1["error_events"]:
        print("\nError events (may indicate permission denial):")
        for ee in findings1["error_events"]:
            print(json.dumps(ee, indent=2)[:500])
    
    if findings1["result_event"]:
        result_data = findings1["result_event"].get("result", "")
        result_text = result_data.get("text", "") if isinstance(result_data, dict) else str(result_data)
        print(f"\nResult text: {result_text[:300]}")
    
    if result1.stderr:
        print(f"\nStderr: {result1.stderr[:300]}")
    
    # Test 2: Create settings with Bash pre-approved
    print("\n" + "-"*50)
    print("TEST 2: With Bash pre-approved in settings")
    print("-"*50)
    
    # Try creating settings in the project directory
    test_dir = tempfile.mkdtemp(prefix="claude_perm_test_")
    settings_dir = Path(test_dir) / ".claude"
    settings_dir.mkdir()
    
    settings_content = {
        "permissions": {
            "allow": ["Bash", "Read", "Write"],
            "deny": []
        }
    }
    
    settings_path = settings_dir / "settings.json"
    settings_path.write_text(json.dumps(settings_content, indent=2))
    print(f"Created settings at: {settings_path}")
    
    # Run from that directory
    cmd = [
        "claude",
        "-p",
        "--verbose",
        "--output-format", "stream-json",
        "Run the command: echo 'hello from bash'"
    ]
    
    print(f"Running from: {test_dir}")
    result2 = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=30,
        cwd=test_dir
    )
    
    events2 = []
    for line in result2.stdout.strip().split('\n'):
        if line.strip():
            try:
                events2.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    
    print(f"Exit code: {result2.returncode}")
    print(f"Events collected: {len(events2)}")
    
    findings2 = analyze_permission_events(events2)
    all_findings["with_preapproval"] = {
        "exit_code": result2.returncode,
        "event_count": len(events2),
        "findings": findings2,
        "stderr": result2.stderr[:500] if result2.stderr else ""
    }
    
    if findings2["result_event"]:
        result_data = findings2["result_event"].get("result", "")
        result_text = result_data.get("text", "") if isinstance(result_data, dict) else str(result_data)
        print(f"\nResult text: {result_text[:300]}")

        # Check if bash actually ran
        if "hello from bash" in result_text:
            print("\nSUCCESS: Bash command executed with pre-approval!")
    
    # Clean up test directory
    import shutil
    try:
        shutil.rmtree(test_dir)
    except:
        pass
    
    # Test 3: With --dangerously-skip-permissions flag
    print("\n" + "-"*50)
    print("TEST 3: With --dangerously-skip-permissions flag")
    print("-"*50)

    cmd3 = [
        "claude",
        "-p",
        "--verbose",
        "--output-format", "stream-json",
        "--dangerously-skip-permissions",
        "Run the command: echo 'hello from bash'"
    ]

    print(f"Running: {' '.join(cmd3[:5])}...")
    result3 = subprocess.run(
        cmd3,
        capture_output=True,
        text=True,
        timeout=30
    )

    events3 = []
    for line in result3.stdout.strip().split('\n'):
        if line.strip():
            try:
                events3.append(json.loads(line))
            except json.JSONDecodeError:
                pass

    print(f"Exit code: {result3.returncode}")
    print(f"Events collected: {len(events3)}")

    findings3 = analyze_permission_events(events3)
    all_findings["dangerously_skip"] = {
        "exit_code": result3.returncode,
        "event_count": len(events3),
        "findings": findings3,
        "stderr": result3.stderr[:500] if result3.stderr else ""
    }

    if findings3["result_event"]:
        result_data = findings3["result_event"].get("result", "")
        result_text = result_data.get("text", "") if isinstance(result_data, dict) else str(result_data)
        print(f"\nResult text: {result_text[:300]}")

        if "hello from bash" in result_text:
            print("\nSUCCESS: Bash command executed with --dangerously-skip-permissions!")

    # Test 4: Analyze what permission prompt looks like
    print("\n" + "-"*50)
    print("TEST 4: Analyze stream for permission indicators")
    print("-"*50)

    all_events = events1 + events2 + events3
    unique_types = set(e.get("type") for e in all_events)
    print(f"\nAll event types observed: {sorted(unique_types)}")
    
    # Look for any events that might be permission-related
    print("\nSearching for permission-related patterns in all events...")
    permission_indicators = ["permission", "allow", "deny", "prompt", "approval", "consent"]
    
    for event in all_events:
        event_str = json.dumps(event).lower()
        for indicator in permission_indicators:
            if indicator in event_str:
                print(f"\nFound '{indicator}' in event:")
                print(json.dumps(event, indent=2)[:400])
                break
    
    # Summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    
    print("\nBehavior without pre-approval:")
    print(f"  Exit code: {all_findings['no_preapproval']['exit_code']}")
    print(f"  Errors: {len(all_findings['no_preapproval']['findings']['error_events'])}")

    print("\nBehavior with pre-approval:")
    print(f"  Exit code: {all_findings['with_preapproval']['exit_code']}")
    print(f"  Errors: {len(all_findings['with_preapproval']['findings']['error_events'])}")

    print("\nBehavior with --dangerously-skip-permissions:")
    print(f"  Exit code: {all_findings['dangerously_skip']['exit_code']}")
    print(f"  Errors: {len(all_findings['dangerously_skip']['findings']['error_events'])}")
    
    print("\n" + "="*70)
    print("KEY FINDINGS")
    print("="*70)
    
    print("""
In headless (-p) mode:
1. Permission prompts likely cause the process to fail/skip rather than block
2. Pre-approval via .claude/settings.json should allow tools to run
3. Custom permission UI would need to:
   - Detect permission errors in output
   - Update settings file with approval
   - Retry the command or use --resume

For full permission UI support, consider:
- Using hooks (PostToolUse, PreToolUse) for real-time tool notifications
- Or running in PTY mode for interactive permission prompts
""")
    
    # Save findings
    output_path = results_dir / "permission_events.json"
    with open(output_path, "w") as f:
        json.dump(all_findings, f, indent=2, default=str)
    print(f"\nFindings saved to: {output_path}")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
