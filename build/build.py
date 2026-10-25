#!/usr/bin/env python3
"""
YTM-DeSlop Build Script
=======================

Automated build pipeline that:
  1. Aggregates blocklists from all sources
  2. Generates blocklist.json for all extensions
  3. Packages Firefox extension
  4. Packages Chrome extension
  5. Copies userscript.js / userscript.json for release

Usage:
    python3 build/build.py [--no-download] [--release]
"""

import os
import sys
import json
import shutil
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "src"
BUILD_DIR = ROOT / "build"
OUTPUT_DIR = ROOT / "output"
FIREFOX_DIR = BUILD_DIR / "firefox"
CHROME_DIR = BUILD_DIR / "chrome"


def step(msg: str):
    print(f"\n=== {msg} ===")


def run_aggregator():
    """Run the blocklist aggregator to fetch live data."""
    step("Aggregating blocklists")
    agg_script = SRC_DIR / "blocklist_aggregator.py"
    if not agg_script.exists():
        print("[!] blocklist_aggregator.py not found; skipping data fetch.")
        return
    subprocess.run([sys.executable, str(agg_script)], cwd=ROOT, check=True)


def copy_shared_resources():
    """Copy shared assets into both extension builds."""
    step("Copying shared resources")
    # Copy userscript into extension roots so it can be used if needed
    for dest in (FIREFOX_DIR, CHROME_DIR):
        dest.mkdir(parents=True, exist_ok=True)
        userscript = SRC_DIR / "userscript.js"
        if userscript.exists():
            shutil.copy2(userscript, dest / "userscript.js")
        userscript_json = SRC_DIR / "userscript.json"
        if userscript_json.exists():
            shutil.copy2(userscript_json, dest / "userscript.json")


def package_extension(src_dir: Path, output_name: str):
    """Zip extension directory into .zip for release."""
    step(f"Packaging extension: {output_name}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = OUTPUT_DIR / output_name

    if zip_path.exists():
        zip_path.unlink()

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in src_dir.rglob("*"):
            if file_path.is_file():
                arcname = file_path.relative_to(src_dir)
                zf.write(file_path, arcname)

    print(f"[*] Created {zip_path} ({zip_path.stat().st_size} bytes)")
    return zip_path


def verify_build():
    """Verify that all required extension files exist."""
    step("Verifying build")

    required_files = [
        FIREFOX_DIR / "manifest.json",
        FIREFOX_DIR / "background.js",
        FIREFOX_DIR / "content.js",
        FIREFOX_DIR / "content.css",
        FIREFOX_DIR / "popup.html",
        FIREFOX_DIR / "popup.js",
        FIREFOX_DIR / "options.html",
        FIREFOX_DIR / "options.js",
        CHROME_DIR / "manifest.json",
        CHROME_DIR / "background.js",
        CHROME_DIR / "content.js",
        CHROME_DIR / "content.css",
        CHROME_DIR / "popup.html",
        CHROME_DIR / "popup.js",
        CHROME_DIR / "options.html",
        CHROME_DIR / "options.js",
    ]

    missing = [str(f) for f in required_files if not f.exists()]
    if missing:
        print("[!] Missing files:")
        for m in missing:
            print(f"    - {m}")
        return False

    print(f"[*] All {len(required_files)} required files present.")
    return True


def main():
    print("YTM-DeSlop Build Pipeline v1.0.0")
    print(f"Root: {ROOT}")

    run_aggregator()

    copy_shared_resources()

    if not verify_build():
        print("[!] Build verification failed!")
        sys.exit(1)

    # Package extensions
    package_extension(FIREFOX_DIR, "ytm-deslop-firefox-v1.zip")
    package_extension(CHROME_DIR, "ytm-deslop-chrome-v1.zip")

    # Package userscript
    userscript_zip = OUTPUT_DIR / "ytm-deslop-userscript-v1.zip"
    if userscript_zip.exists():
        userscript_zip.unlink()
    with zipfile.ZipFile(userscript_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in [SRC_DIR / "userscript.js", SRC_DIR / "userscript.json"]:
            if f.exists():
                zf.write(f, f.name)
    print(f"[*] Created {userscript_zip}")

    print("\n=== BUILD COMPLETE ===")
    print(f"Outputs in: {OUTPUT_DIR}")
    print(f"  - ytm-deslop-firefox-v1.zip")
    print(f"  - ytm-deslop-chrome-v1.zip")
    print(f"  - ytm-deslop-userscript-v1.zip")


if __name__ == "__main__":
    main()
