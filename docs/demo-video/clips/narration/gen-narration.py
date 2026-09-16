#!/usr/bin/env python3
"""Generate per-scene AI narration (edge-tts, en-US-AndrewNeural) for the
InvoFi demo, rate-fitted to each recorded clip's duration.

Reads:  /tmp/demo-clips/clip-*.webm
Writes: /tmp/demo-clips/narration/narr-XX.mp3  (+ .txt with the line)

Run with the tts venv python:  ~/.venvs/tts/bin/python3 gen-narration.py
"""
import asyncio
import re
import subprocess
import sys
from pathlib import Path

from edge_tts import Communicate

CLIPS = Path("/tmp/demo-clips")
OUT = CLIPS / "narration"
OUT.mkdir(exist_ok=True)

VOICE = "en-US-AndrewNeural"
MARGIN = 1.2          # keep speech at least this far under clip length
FFMPEG = str(Path.home() / "work/invofi-check/invofi/apps/frontend/node_modules/ffmpeg-static/ffmpeg")

# Narration per clip. Scene 6 may be one clip (clip-06) or two (06a/06b).
SPLIT_SCENE6 = {
    "06a": "That position token is portable. First, one click adds the trustline.",
    "06b": "Now I can send my claim to any Stellar wallet — the new holder earns the yield when repayment lands.",
}
LINES = {
    "01": "InvoFi is open-source invoice financing on Stellar Soroban. Small businesses often wait thirty to ninety days to get paid. InvoFi lets them tokenise an invoice on-chain, and get funded by a global pool of lenders — no banks, no middlemen.",
    "02": "One click, and my Stellar wallet is connected. InvoFi supports Freighter and Lobstr — your wallet is your identity. No passwords, no email.",
    "03": "As a business, I register an invoice: the amount, the currency, and the due date. It's written to the on-chain registry in seconds. Anyone can verify it, and nobody can quietly change it.",
    "04": "On the marketplace, lenders compete to finance the invoice. I set my rate and my duration, and submit an offer. The business sees it instantly.",
    "05": "Here's the moment that matters. The business accepts — and the funds actually move from the lender to the business, on testnet, on-chain. The lender receives a position token: a claim on the repayment, held in their own wallet. Not an I-O-U in a database — an asset.",
    "06": "That position token is portable. One click adds the trustline, and I can send my claim to any Stellar wallet. The new holder earns the yield when repayment lands.",
    "07": "When the invoice comes due, the business repays principal plus interest. The balance updates live, the invoice flips to repaid, and the lender has earned yield on money that used to sit idle.",
    "08": "Everything you just saw is aggregated on the public stats dashboard: invoices financed, total volume, repayment rate, active lenders, and the insurance pool.",
    "09": "InvoFi is fully open source. The apps and docs live in the invofi repo, and the auditable Soroban contracts in invofi-contracts. Fork it, break it, build on it. Contributions welcome.",
}


def clip_duration(path: Path) -> float:
    """Duration from the container header via `ffmpeg -i` stderr parse
    (the playwright ffmpeg build lacks full decode-to-null support)."""
    p = subprocess.run(
        [FFMPEG, "-i", str(path)], capture_output=True, text=True,
    )
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.?\d*)", p.stderr)
    if not m:
        raise RuntimeError(f"no duration in ffmpeg output for {path}")
    h, mn, s = m.groups()
    return int(h) * 3600 + int(mn) * 60 + float(s)


def mp3_duration(path: Path) -> float:
    """MP3s have no container header — measure by decoding to null."""
    p = subprocess.run(
        [FFMPEG, "-i", str(path), "-f", "null", "-"],
        capture_output=True, text=True,
    )
    times = re.findall(r"time=(\d+):(\d+):(\d+\.?\d*)", p.stderr)
    if times:
        h, mn, s = times[-1]
        return int(h) * 3600 + int(mn) * 60 + float(s)
    return clip_duration(path)


async def render(key: str, text: str, target: float, rate: str) -> None:
    mp3 = OUT / f"narr-{key}.mp3"
    await Communicate(text, VOICE, rate=rate).save(str(mp3))


async def main() -> None:
    # Discover clips: prefer split scene 6 if present.
    found = sorted(p.name for p in CLIPS.glob("clip-*.webm"))
    print("clips found:", found)

    jobs = []  # (key, text, target_dur)
    for name in found:
        key = re.match(r"clip-([0-9]{2}[a-z]?)-", name).group(1)
        dur = clip_duration(CLIPS / name)
        if key in SPLIT_SCENE6 and LINES.get("06") and key not in LINES:
            text = SPLIT_SCENE6[key]
        elif key == "06" and any(n.startswith("clip-06a") for n in found):
            continue  # split version wins; skip the combined clip line
        else:
            text = LINES[key]
        jobs.append((key, text, dur))
        print(f"clip-{key}: {dur:.1f}s")

    for key, text, target in jobs:
        rate = "+0%"
        limit = target - MARGIN
        for attempt in range(3):
            await render(key, text, target, rate)
            d = mp3_duration(OUT / f"narr-{key}.mp3")
            print(f"narr-{key} try{attempt+1}: {d:.1f}s @ {rate} (limit {limit:.1f}s)")
            if d <= limit:
                break
            # speed up: overshoot percentage + small buffer, capped
            over_pct = (d / limit - 1) * 100
            delta = min(int(over_pct) + 4, 30)
            rate = f"+{delta}%"
        (OUT / f"narr-{key}.txt").write_text(text + "\n")
        print(f"OK narr-{key}: rate={rate}")

    print("ALL DONE")


if __name__ == "__main__":
    asyncio.run(main())
