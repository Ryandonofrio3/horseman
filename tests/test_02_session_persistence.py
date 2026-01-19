#!/usr/bin/env python3
"""
Test 02: Session Persistence

Purpose: Validate that sessions persist across process spawns using
`--session-id` and `--resume`.

Questions to answer:
- Does `--session-id` work with `-p` mode?
- Does `--resume` successfully recall prior context?
- Where are session files stored exactly?
- What format is the transcript file? (JSON, JSONL, other?)
- Can we parse it to rebuild conversation history?
"""

import json
import os
import subprocess
import sys
import uuid
from pathlib import Path
import glob as glob_module


def run_claude(args: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
    """Run claude command and return result."""
    cmd = ["claude"] + args
    print(f"Running: {' '.join(cmd)}")
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def find_session_files(session_id: str) -> list[Path]:
    """Search for session files in Claude's data directories."""
    search_paths = [
        Path.home() / ".claude",
        Path.home() / ".config" / "claude",
        Path("/tmp"),
    ]
    
    found = []
    for base in search_paths:
        if base.exists():
            # Search recursively for files containing session ID
            for pattern in ["**/*.json", "**/*.jsonl", f"**/*{session_id}*"]:
                found.extend(base.glob(pattern))
    
    # Filter to only files containing session ID in name or path
    session_files = [f for f in found if session_id in str(f)]
    return session_files


def main():
    results_dir = Path(__file__).parent.parent / "results"
    results_dir.mkdir(exist_ok=True)
    
    # Generate unique session ID
    session_id = str(uuid.uuid4())
    secret_code = "7492"
    
    print("="*70)
    print("TEST 02: Session Persistence")
    print("="*70)
    print(f"Session ID: {session_id}")
    print(f"Secret code: {secret_code}")
    
    # Step 1: Create session with secret
    print("\n" + "-"*50)
    print("STEP 1: Create session with secret code")
    print("-"*50)
    
    result1 = run_claude([
        "-p",
        "--verbose",
        "--session-id", session_id,
        "--output-format", "stream-json",
        f"Remember this secret code: {secret_code}. Just acknowledge you've remembered it."
    ])
    
    print(f"Exit code: {result1.returncode}")
    print(f"Stdout lines: {len(result1.stdout.splitlines())}")
    if result1.stderr:
        print(f"Stderr: {result1.stderr[:200]}")
    
    # Parse response
    for line in result1.stdout.strip().split('\n'):
        if line.strip():
            try:
                event = json.loads(line)
                if event.get("type") == "result":
                    result_data = event.get("result", "")
                    text = result_data.get("text", "") if isinstance(result_data, dict) else str(result_data)
                    print(f"Response: {text[:200]}")
            except json.JSONDecodeError:
                pass
    
    # Step 2: Resume and recall
    print("\n" + "-"*50)
    print("STEP 2: Resume session and recall secret")
    print("-"*50)
    
    result2 = run_claude([
        "-p",
        "--verbose",
        "--resume", session_id,
        "--output-format", "stream-json",
        "What was the secret code I asked you to remember?"
    ])
    
    print(f"Exit code: {result2.returncode}")
    
    # Check if secret is in response
    found_secret = False
    response_text = ""
    for line in result2.stdout.strip().split('\n'):
        if line.strip():
            try:
                event = json.loads(line)
                if event.get("type") == "result":
                    result_data = event.get("result", "")
                    response_text = result_data.get("text", "") if isinstance(result_data, dict) else str(result_data)
                    if secret_code in response_text:
                        found_secret = True
            except json.JSONDecodeError:
                pass
    
    print(f"Response text: {response_text[:300]}")
    print(f"Secret code found in response: {found_secret}")
    
    # Step 3: Find session files
    print("\n" + "-"*50)
    print("STEP 3: Locate session files")
    print("-"*50)
    
    session_files = find_session_files(session_id)
    print(f"Files found containing session ID: {len(session_files)}")
    for f in session_files:
        print(f"  - {f}")
    
    # Also check the standard Claude projects directory
    claude_projects = Path.home() / ".claude" / "projects"
    if claude_projects.exists():
        print(f"\nSearching in {claude_projects}")
        for jsonl_file in claude_projects.rglob("*.jsonl"):
            # Check if file was recently modified (within last minute)
            if jsonl_file.stat().st_mtime > (os.time() if hasattr(os, 'time') else 0) - 120:
                print(f"  Recently modified: {jsonl_file}")
                session_files.append(jsonl_file)
    
    # Try to find by listing recent files
    print("\nListing recent .jsonl files in ~/.claude/:")
    recent_cmd = subprocess.run(
        ["find", str(Path.home() / ".claude"), "-name", "*.jsonl", "-mmin", "-5"],
        capture_output=True, text=True
    )
    if recent_cmd.stdout:
        print(recent_cmd.stdout)
        for f in recent_cmd.stdout.strip().split('\n'):
            if f:
                session_files.append(Path(f))
    
    # Step 4: Analyze transcript format
    print("\n" + "-"*50)
    print("STEP 4: Analyze transcript format")
    print("-"*50)
    
    transcript_content = None
    transcript_path = None
    
    for sf in session_files:
        if sf.suffix == ".jsonl" and sf.exists():
            try:
                content = sf.read_text()
                if session_id in content or secret_code in content:
                    transcript_path = sf
                    transcript_content = content
                    print(f"Found transcript at: {sf}")
                    break
            except Exception as e:
                print(f"Error reading {sf}: {e}")
    
    if transcript_content:
        print(f"\nTranscript format: JSONL (one JSON object per line)")
        lines = transcript_content.strip().split('\n')
        print(f"Total lines: {len(lines)}")
        
        # Parse and analyze structure
        parsed_lines = []
        for i, line in enumerate(lines[:10]):  # First 10 lines
            try:
                obj = json.loads(line)
                parsed_lines.append(obj)
                print(f"\nLine {i+1} type: {obj.get('type', 'UNKNOWN')}")
                print(f"  Keys: {list(obj.keys())}")
            except json.JSONDecodeError as e:
                print(f"Line {i+1}: Parse error - {e}")
        
        # Save sample transcript
        sample_path = results_dir / "sample_transcript.jsonl"
        sample_path.write_text(transcript_content)
        print(f"\nSaved transcript to: {sample_path}")
    else:
        print("Could not locate transcript file")
    
    # Summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    print(f"Session ID works with -p mode: {result1.returncode == 0}")
    print(f"Resume successfully recalled context: {found_secret}")
    print(f"Transcript file located: {transcript_path is not None}")
    if transcript_path:
        print(f"Transcript location: {transcript_path}")
        print(f"Transcript format: JSONL")
    
    print("\n" + "="*70)
    print("CONCLUSION")
    print("="*70)
    if found_secret:
        print("SUCCESS: Session persistence works correctly!")
        print("- Sessions persist across process spawns")
        print("- --resume flag successfully recalls prior context")
    else:
        print("PARTIAL/FAILED: Check output for details")
    
    return 0 if found_secret else 1


if __name__ == "__main__":
    sys.exit(main())
