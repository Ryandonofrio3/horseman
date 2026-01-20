#!/usr/bin/env python3
"""
Test: Slash Command Behavior

Purpose: Understand how slash commands work without PTY.

Questions to answer:
- Can we pass "/init" as a prompt directly?
- Does claude have a --command flag or similar?
- What's the output format for slash commands?
- Do slash commands need an existing session?
"""

import json
import subprocess
import sys
import tempfile
import os
from pathlib import Path


def run_claude(args: list[str], cwd: str | None = None, timeout: int = 60) -> tuple[str, str, int]:
    """Run claude with given args, return (stdout, stderr, returncode)."""
    cmd = ["claude"] + args

    print(f"\n{'='*60}")
    print(f"Running: {' '.join(cmd)}")
    if cwd:
        print(f"CWD: {cwd}")
    print(f"{'='*60}\n")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=cwd
        )
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        return "", "TIMEOUT", -1


def parse_stream_json(stdout: str) -> list[dict]:
    """Parse NDJSON output into list of events."""
    events = []
    for line in stdout.strip().split('\n'):
        if line.strip():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return events


def test_slash_as_prompt():
    """Test: Can we pass /init as a prompt?"""
    print("\n" + "="*70)
    print("TEST 1: Pass /init as prompt directly")
    print("="*70)

    with tempfile.TemporaryDirectory() as tmpdir:
        stdout, stderr, code = run_claude([
            "-p",
            "--output-format", "stream-json",
            "--verbose",
            "/init"
        ], cwd=tmpdir, timeout=120)

        print(f"Return code: {code}")
        print(f"Stdout length: {len(stdout)}")
        print(f"Stderr preview: {stderr[:500] if stderr else '(empty)'}")

        if stdout:
            events = parse_stream_json(stdout)
            print(f"Events parsed: {len(events)}")

            # Show event types
            types = [e.get("type") for e in events]
            print(f"Event types: {set(types)}")

            # Check if CLAUDE.md was created
            claude_md = Path(tmpdir) / "CLAUDE.md"
            if claude_md.exists():
                print(f"\nCLAUDE.md was created! Size: {claude_md.stat().st_size} bytes")
                print(f"Preview:\n{claude_md.read_text()[:500]}")
            else:
                print("\nCLAUDE.md was NOT created")

        return code == 0


def test_help_for_slash():
    """Test: What does --help say about slash commands?"""
    print("\n" + "="*70)
    print("TEST 2: Check --help for slash command options")
    print("="*70)

    stdout, stderr, code = run_claude(["--help"])

    # Search for relevant flags
    output = stdout + stderr
    relevant_lines = []
    for line in output.split('\n'):
        lower = line.lower()
        if any(term in lower for term in ['slash', 'command', 'init', 'compact', 'clear']):
            relevant_lines.append(line)

    if relevant_lines:
        print("Relevant help lines:")
        for line in relevant_lines:
            print(f"  {line}")
    else:
        print("No explicit slash command flags found in --help")

    return True


def test_init_variations():
    """Test: Different ways to invoke /init behavior"""
    print("\n" + "="*70)
    print("TEST 3: Variations of /init invocation")
    print("="*70)

    tests = [
        # (description, args)
        ("Literal /init", ["-p", "--output-format", "stream-json", "/init"]),
        ("Ask to run init", ["-p", "--output-format", "stream-json", "Run the /init command"]),
        ("Describe init behavior", ["-p", "--output-format", "stream-json",
            "Analyze this directory and create a CLAUDE.md file describing the project structure, key patterns, and how to work with it."]),
    ]

    results = {}

    for desc, args in tests:
        print(f"\n--- {desc} ---")

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a minimal project structure
            (Path(tmpdir) / "src").mkdir()
            (Path(tmpdir) / "src" / "main.py").write_text("print('hello')")
            (Path(tmpdir) / "README.md").write_text("# Test Project")

            stdout, stderr, code = run_claude(args, cwd=tmpdir, timeout=90)

            claude_md = Path(tmpdir) / "CLAUDE.md"
            created = claude_md.exists()

            results[desc] = {
                "code": code,
                "created_claude_md": created,
                "event_count": len(parse_stream_json(stdout)) if stdout else 0
            }

            print(f"  Return code: {code}")
            print(f"  CLAUDE.md created: {created}")
            print(f"  Events: {results[desc]['event_count']}")

    return results


def test_with_dangerously_skip():
    """Test: /init with --dangerously-skip-permissions"""
    print("\n" + "="*70)
    print("TEST 4: /init with --dangerously-skip-permissions")
    print("="*70)

    with tempfile.TemporaryDirectory() as tmpdir:
        # Create minimal structure
        (Path(tmpdir) / "src").mkdir()
        (Path(tmpdir) / "src" / "app.ts").write_text("export const hello = 'world';")

        stdout, stderr, code = run_claude([
            "-p",
            "--output-format", "stream-json",
            "--dangerously-skip-permissions",
            "/init"
        ], cwd=tmpdir, timeout=120)

        print(f"Return code: {code}")

        if stdout:
            events = parse_stream_json(stdout)
            print(f"Events: {len(events)}")

            # Look for tool usage
            for e in events:
                if e.get("type") == "assistant":
                    msg = e.get("message", {})
                    content = msg.get("content", [])
                    for block in content:
                        if block.get("type") == "tool_use":
                            print(f"  Tool used: {block.get('name')}")

        claude_md = Path(tmpdir) / "CLAUDE.md"
        if claude_md.exists():
            print(f"\nCLAUDE.md created! Preview:")
            print(claude_md.read_text()[:800])

        return code == 0


def main():
    print("="*70)
    print("SLASH COMMAND BEHAVIOR EXPLORATION")
    print("="*70)

    results = {
        "slash_as_prompt": test_slash_as_prompt(),
        "help_check": test_help_for_slash(),
        "variations": test_init_variations(),
        "with_skip_perms": test_with_dangerously_skip(),
    }

    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    print(json.dumps(results, indent=2, default=str))

    return 0


if __name__ == "__main__":
    sys.exit(main())
