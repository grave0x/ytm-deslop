#!/usr/bin/env python3
"""
YTM-DeSlop Blocklist Aggregator
==============================

Aggregates AI-music blocklist data from multiple sources into a unified,
deduplicated dataset consumed by the userscript and browser extensions.

Sources:
  1. Stevoisiak/Stevos-AI-Blocklist             - uBlock Origin filter list (YouTube AI section)
  2. muhdiboy gist (ytm_ai_blocklist.txt)       - YouTube Music AI channel URLs
  3. Override92/AiSList (blocklist + warnlist)  - Community AI channel lists (@handle + UC id)
  4. CevvalYoutubeAIBlocklist                   - uBlock Origin AI-music blocklist
  5. firemountainpeak-lang/YTM-AI-Artist-Song-Blocker - Soul Over AI artist database

Output (JSON):
  src/data/blocklist.json  - deduplicated, canonicalized AI music slop entries
"""

import datetime
import json
import os
import re
import urllib.request
import urllib.error
from dataclasses import dataclass, asdict
from typing import Iterable

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "src", "data")
OUTPUT_PATH = os.path.join(DATA_DIR, "blocklist.json")

SOURCES = {
    "stevoisiak": {
        "url": "https://raw.githubusercontent.com/Stevoisiak/Stevos-AI-Blocklist/main/GenAI-Blocklist.txt",
        "type": "ublock",
    },
    "muhdiboy_ytm": {
        "url": "https://gist.githubusercontent.com/muhdiboy/9c26ef76a0ce209f23bcc2fb8c3a6d5b/raw/19e97107a59034eed1dcd847e79cfcedf65fb1c7/ytm_ai_blocklist.txt",
        "type": "url_list",
    },
    "aislist_blocklist": {
        "url": "https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_blocklist.txt",
        "type": "aislist",
        "confidence": "high",
    },
    "aislist_warnlist": {
        "url": "https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_warnlist.txt",
        "type": "aislist",
        "confidence": "medium",
    },
    "cevval_ytm_ai": {
        "url": "https://raw.githubusercontent.com/cevvalkoala/CevvalYoutubeAIBlocklist/main/blocklist.txt",
        "type": "ublock",
    },
    "soul_over_ai": {
        "url": "https://raw.githubusercontent.com/xoundbyte/soul-over-ai/main/artists.json",
        "type": "json_array",
    },
}

# YouTube channel-id pattern: 24 chars starting with UC
CHANNEL_ID_RE = re.compile(r"^UC[A-Za-z0-9_-]{22}$")
# YouTube handle pattern: @name
HANDLE_RE = re.compile(r"^@[A-Za-z0-9_.-]{3,}$")
# music.youtube.com channel URL
MUSIC_URL_RE = re.compile(
    r"https?://music\.youtube\.com/channel/(UC[A-Za-z0-9_-]{22})"
)
# youtube.com channel URL
YT_URL_RE = re.compile(
    r"https?://(?:www\.)?youtube\.com/(?:channel|c)/([A-Za-z0-9_-]+)"
)


@dataclass
class BlockEntry:
    source: str
    kind: str            # "channel" | "artist" | "song" | "keyword" | "url"
    value: str           # canonical value (handle / UC-id / keyword / url)
    confidence: str      # high | medium | low
    raw: str             # original line from source


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------

def fetch_text(url: str, timeout: int = 30) -> str:
    """Fetch UTF-8 text from a URL, returning empty string on failure."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "YTM-DeSlop/1.0 (blocklist aggregator)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001
        print(f"[WARN] Failed to fetch {url}: {exc}")
        return ""


def fetch_json(url: str, timeout: int = 30) -> object:
    """Fetch JSON from a URL."""
    text = fetch_text(url, timeout)
    if not text:
        return []
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        print(f"[WARN] Failed to parse JSON from {url}: {exc}")
        return []


# ---------------------------------------------------------------------------
# Parsers per source type
# ---------------------------------------------------------------------------

def parse_ublock(text: str, source: str, confidence: str) -> list[BlockEntry]:
    """Parse an uBlock Origin / AdGuard filter list.

    Extracts YouTube channel references from lines like:
      youtube.com###channel-header
      ||youtube.com/channel/UCxxxx...
      www.youtube.com##.ytm-ai-...  (heuristic)
    """
    entries: list[BlockEntry] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("!"):
            continue

        # Direct channel URL inside a network filter
        m = MUSIC_URL_RE.search(line) or YT_URL_RE.search(line)
        if m:
            cid = m.group(1)
            entries.append(
                BlockEntry(
                    source=source,
                    kind="channel",
                    value=cid,
                    confidence=confidence,
                    raw=line,
                )
            )
            continue

        # Handle-style mentions inside comments or cosmetic filters
        for hm in HANDLE_RE.findall(line):
            entries.append(
                BlockEntry(
                    source=source,
                    kind="channel",
                    value=hm,
                    confidence=confidence,
                    raw=line,
                )
            )

        # UC-id mentions (standalone-ish)
        for cm in CHANNEL_ID_RE.findall(line):
            entries.append(
                BlockEntry(
                    source=source,
                    kind="channel",
                    value=cm,
                    confidence=confidence,
                    raw=line,
                )
            )
    return entries


def parse_url_list(text: str, source: str, confidence: str) -> list[BlockEntry]:
    """Parse the muhdiboy YTM channel-URL list."""
    entries: list[BlockEntry] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("!"):
            continue
        m = MUSIC_URL_RE.search(line)
        if m:
            entries.append(
                BlockEntry(
                    source=source,
                    kind="channel",
                    value=m.group(1),
                    confidence=confidence,
                    raw=line,
                )
            )
    return entries


def parse_aislist(text: str, source: str, confidence: str) -> list[BlockEntry]:
    """Parse AiSList-style blocklist / warnlist."""
    entries: list[BlockEntry] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("!"):
            continue
        if HANDLE_RE.match(line):
            entries.append(
                BlockEntry(
                    source=source,
                    kind="channel",
                    value=line,
                    confidence=confidence,
                    raw=line,
                )
            )
        elif CHANNEL_ID_RE.match(line):
            entries.append(
                BlockEntry(
                    source=source,
                    kind="channel",
                    value=line,
                    confidence=confidence,
                    raw=line,
                )
            )
    return entries


def parse_json_array(data: object, source: str, confidence: str) -> list[BlockEntry]:
    """Parse soul-over-ai artists.json (list of artist objects or strings)."""
    entries: list[BlockEntry] = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, str):
                val = item.strip()
                if val:
                    entries.append(
                        BlockEntry(
                            source=source,
                            kind="artist",
                            value=val,
                            confidence=confidence,
                            raw=val,
                        )
                    )
            elif isinstance(item, dict):
                name = item.get("name") or item.get("artist") or item.get("channel")
                if name:
                    entries.append(
                        BlockEntry(
                            source=source,
                            kind="artist",
                            value=str(name).strip(),
                            confidence=confidence,
                            raw=json.dumps(item),
                        )
                    )
    return entries


PARSERS = {
    "ublock": parse_ublock,
    "url_list": parse_url_list,
    "aislist": parse_aislist,
    "json_array": parse_json_array,
}


# ---------------------------------------------------------------------------
# Canonicalization & deduplication
# ---------------------------------------------------------------------------

def canonicalize(entry: BlockEntry) -> str:
    """Return a stable key for deduplication."""
    if entry.kind == "channel":
        v = entry.value
        if v.startswith("@"):
            return f"channel:{v.lower()}"
        if CHANNEL_ID_RE.match(v):
            return f"channel:{v}"
        return f"channel:{v.lower()}"
    return f"{entry.kind}:{entry.value.lower()}"


def dedupe(entries: Iterable[BlockEntry]) -> list[BlockEntry]:
    seen: dict[str, BlockEntry] = {}
    for entry in entries:
        key = canonicalize(entry)
        if key not in seen:
            seen[key] = entry
        else:
            # Keep higher confidence on collision
            prev = seen[key]
            rank = {"high": 3, "medium": 2, "low": 1}
            if rank.get(entry.confidence, 0) > rank.get(prev.confidence, 0):
                seen[key] = entry
    return sorted(seen.values(), key=lambda e: (e.source, e.kind, e.value))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def aggregate() -> list[BlockEntry]:
    all_entries: list[BlockEntry] = []
    for name, cfg in SOURCES.items():
        print(f"[*] Aggregating {name} ({cfg['type']}) ...")
        text = fetch_text(cfg["url"])
        if not text:
            continue
        parser = PARSERS[cfg["type"]]
        if cfg["type"] == "json_array":
            data = fetch_json(cfg["url"])
            entries = parser(data, name, cfg.get("confidence", "low"))
        else:
            entries = parser(text, name, cfg.get("confidence", "medium"))
        print(f"    -> {len(entries)} entries from {name}")
        all_entries.extend(entries)

    deduped = dedupe(all_entries)
    print(f"[*] Total raw: {len(all_entries)}, deduplicated: {len(deduped)}")
    return deduped


def write_output(entries: list[BlockEntry]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    payload = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "total": len(entries),
        "sources": list(SOURCES.keys()),
        "entries": [asdict(e) for e in entries],
    }
    with open(OUTPUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
    print(f"[*] Wrote {OUTPUT_PATH} ({len(entries)} entries)")


def main() -> None:
    entries = aggregate()
    write_output(entries)


if __name__ == "__main__":
    main()
