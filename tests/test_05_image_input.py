#!/usr/bin/env python3
"""
Test 05: Image Input

Purpose: Validate that we can send images to Claude programmatically.

Questions to answer:
- Does `--input-format stream-json` accept images?
- What's the exact input schema that works?
- Can Claude correctly describe the image?
- If stdin doesn't work, what alternatives exist?
"""

import base64
import json
import subprocess
import sys
import tempfile
from pathlib import Path


def create_test_image() -> tuple[bytes, str]:
    """Create a simple red square test image (PNG)."""
    # Minimal valid PNG: 8x8 red square
    # This is a hand-crafted minimal PNG
    
    # Actually, let's create it properly using basic PNG encoding
    import struct
    import zlib
    
    width, height = 8, 8
    
    def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
        chunk_len = struct.pack('>I', len(data))
        chunk_crc = struct.pack('>I', zlib.crc32(chunk_type + data) & 0xffffffff)
        return chunk_len + chunk_type + data + chunk_crc
    
    # PNG signature
    signature = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)  # 8-bit RGB
    ihdr = png_chunk(b'IHDR', ihdr_data)
    
    # IDAT chunk (image data)
    # Each row: filter byte (0) + RGB pixels
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # Filter: none
        for x in range(width):
            raw_data += b'\xff\x00\x00'  # Red pixel (RGB)
    
    compressed = zlib.compress(raw_data)
    idat = png_chunk(b'IDAT', compressed)
    
    # IEND chunk
    iend = png_chunk(b'IEND', b'')
    
    png_bytes = signature + ihdr + idat + iend
    return png_bytes, "image/png"


def run_with_stdin_json(input_data: dict, timeout: int = 30) -> tuple[subprocess.CompletedProcess, list[dict]]:
    """Run claude with JSON input on stdin."""
    cmd = [
        "claude",
        "-p",
        "--verbose",
        "--input-format", "stream-json",
        "--output-format", "stream-json"
    ]
    
    input_json = json.dumps(input_data)
    print(f"Input schema: {list(input_data.keys())}")
    
    result = subprocess.run(
        cmd,
        input=input_json,
        capture_output=True,
        text=True,
        timeout=timeout
    )
    
    events = []
    for line in result.stdout.strip().split('\n'):
        if line.strip():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    
    return result, events


def try_file_reference(image_path: str, timeout: int = 30) -> tuple[subprocess.CompletedProcess, list[dict]]:
    """Try using file path reference instead of base64."""
    # Claude Code supports file references in prompts
    cmd = [
        "claude",
        "-p",
        "--verbose",
        "--output-format", "stream-json",
        f"Look at this image: {image_path} - What color is it?"
    ]
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout
    )
    
    events = []
    for line in result.stdout.strip().split('\n'):
        if line.strip():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    
    return result, events


def main():
    results_dir = Path(__file__).parent.parent / "results"
    results_dir.mkdir(exist_ok=True)
    
    # Create test image
    print("="*70)
    print("TEST 05: Image Input")
    print("="*70)
    
    image_bytes, media_type = create_test_image()
    image_b64 = base64.b64encode(image_bytes).decode('utf-8')
    
    print(f"Test image: {len(image_bytes)} bytes, {media_type}")
    print(f"Base64 length: {len(image_b64)}")
    
    # Save test image for reference
    test_image_path = results_dir / "test_image.png"
    test_image_path.write_bytes(image_bytes)
    print(f"Saved test image to: {test_image_path}")
    
    findings = {}
    
    # Test 1: Try Anthropic API style input
    print("\n" + "-"*50)
    print("TEST 1: Anthropic API style (messages array)")
    print("-"*50)
    
    input1 = {
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": "What color is this image? Answer in one word."},
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_b64
                    }
                }
            ]
        }]
    }
    
    result1, events1 = run_with_stdin_json(input1)
    findings["anthropic_style"] = {
        "exit_code": result1.returncode,
        "events": len(events1),
        "stderr": result1.stderr[:500] if result1.stderr else ""
    }
    
    print(f"Exit code: {result1.returncode}")
    if result1.stderr:
        print(f"Stderr: {result1.stderr[:300]}")
    
    # Test 2: Try simple user message style
    print("\n" + "-"*50)
    print("TEST 2: Simple content array style")
    print("-"*50)
    
    input2 = {
        "role": "user",
        "content": [
            {"type": "text", "text": "What color is this image? Answer in one word."},
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": image_b64
                }
            }
        ]
    }
    
    result2, events2 = run_with_stdin_json(input2)
    findings["simple_content"] = {
        "exit_code": result2.returncode,
        "events": len(events2),
        "stderr": result2.stderr[:500] if result2.stderr else ""
    }
    
    print(f"Exit code: {result2.returncode}")
    if result2.stderr:
        print(f"Stderr: {result2.stderr[:300]}")
    
    # Test 3: Try text prompt with file path
    print("\n" + "-"*50)
    print("TEST 3: File path reference in prompt")
    print("-"*50)
    
    # Create temp file with image
    temp_image = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
    temp_image.write(image_bytes)
    temp_image.close()
    
    result3, events3 = try_file_reference(temp_image.name)
    findings["file_reference"] = {
        "exit_code": result3.returncode,
        "events": len(events3),
        "stderr": result3.stderr[:500] if result3.stderr else ""
    }
    
    print(f"Exit code: {result3.returncode}")
    if events3:
        for event in events3:
            if event.get("type") == "result":
                result_data = event.get("result", "")
                text = result_data.get("text", "") if isinstance(result_data, dict) else str(result_data)
                print(f"Response: {text[:200]}")
                if "red" in text.lower():
                    print("SUCCESS: Claude identified the red color!")
                    findings["file_reference"]["success"] = True
    
    # Test 4: Try as argument with file path
    print("\n" + "-"*50)
    print("TEST 4: Using --image flag (if available)")
    print("-"*50)
    
    # Check if --image flag exists
    help_result = subprocess.run(["claude", "--help"], capture_output=True, text=True)
    has_image_flag = "--image" in help_result.stdout
    
    if has_image_flag:
        cmd = [
            "claude",
            "-p",
            "--verbose",
            "--output-format", "stream-json",
            "--image", temp_image.name,
            "What color is this image? Answer in one word."
        ]
        result4 = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        findings["image_flag"] = {
            "exit_code": result4.returncode,
            "stderr": result4.stderr[:500] if result4.stderr else ""
        }
        print(f"Exit code: {result4.returncode}")
    else:
        print("--image flag not available")
        findings["image_flag"] = {"available": False}
    
    # Clean up temp file
    try:
        import os
        os.unlink(temp_image.name)
    except:
        pass
    
    # Summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    
    working_methods = []
    for method, data in findings.items():
        exit_code = data.get("exit_code", -1)
        success = data.get("success", exit_code == 0 and data.get("events", 0) > 0)
        status = "WORKS" if success else "FAILED"
        print(f"{method}: {status} (exit={exit_code})")
        if success:
            working_methods.append(method)
    
    print("\n" + "="*70)
    print("CONCLUSION")
    print("="*70)
    
    if working_methods:
        print(f"Working methods: {working_methods}")
        print("\nImage input IS supported via:")
        for m in working_methods:
            print(f"  - {m}")
    else:
        print("Image input via tested methods NOT working in headless mode")
        print("\nAlternatives to consider:")
        print("  1. PTY mode may support image input differently")
        print("  2. Check Claude Code docs for latest image input methods")
        print("  3. Use MCP server for image handling")
    
    # Save findings
    output_path = results_dir / "image_input_findings.json"
    with open(output_path, "w") as f:
        json.dump(findings, f, indent=2, default=str)
    print(f"\nFindings saved to: {output_path}")
    
    return 0 if working_methods else 1


if __name__ == "__main__":
    sys.exit(main())
