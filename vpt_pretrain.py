"""Prepare a compact VPT human-action prior for EVOLVE.

Downloads only VPT JSONL action traces (not large MP4/video or checkpoint files),
then maps their Minecraft controls into EVOLVE's coarse action vocabulary.
This is a lightweight action-prior extraction, NOT the original VPT neural model.
"""
import argparse
import json
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

DEFAULT_INDEX = "https://openaipublic.blob.core.windows.net/minecraft-rl/snapshots/all_6xx_Jun_29.json"
GAME_ACTIONS = ("gather", "build", "hunt", "trade", "explore")
MOVE_KEYS = {
    "key.keyboard.w", "key.keyboard.a", "key.keyboard.s", "key.keyboard.d",
    "key.keyboard.space", "key.keyboard.left", "key.keyboard.right",
    "key.keyboard.up", "key.keyboard.down", "key.keyboard.shift",
}


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "EVOLVE-VPT-Adapter/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))



def download_action_files(index_url, output_dir, max_files):
    index = fetch_json(index_url)
    relpaths = index.get("relpaths", [])
    output_dir.mkdir(parents=True, exist_ok=True)

    bases = [
        "https://openaipublic.blob.core.windows.net/data/",
        "https://openaipublic.blob.core.windows.net/minecraft-rl/data/",
    ]

    downloaded = []
    checked = 0

    for original in relpaths:
        if len(downloaded) >= max_files:
            break

        # Normalize index entries:
        # data/6.10/name.mp4 -> 6.10/name
        rel = str(original).replace("\\", "/").strip("/")

        if rel.startswith("data/"):
            rel = rel[5:]

        if rel.endswith(".mp4"):
            rel = rel[:-4]
        elif rel.endswith(".jsonl"):
            rel = rel[:-6]

        filename = rel.replace("/", "__") + ".jsonl"
        destination = output_dir / filename

        if destination.exists() and destination.stat().st_size:
            try:
                with destination.open("r", encoding="utf-8") as f:
                    json.loads(next(line for line in f if line.strip()))
                downloaded.append(destination)
                print(f"Cached: {filename}")
                continue
            except Exception:
                destination.unlink(missing_ok=True)

        checked += 1
        success = False

        for base in bases:
            url = base + rel + ".jsonl"
            temp = destination.with_suffix(".part")

            try:
                request = urllib.request.Request(
                    url,
                    headers={"User-Agent": "EVOLVE-VPT-Adapter/1.3"}
                )

                with urllib.request.urlopen(request, timeout=45) as response:
                    with temp.open("wb") as out:
                        while True:
                            chunk = response.read(1024 * 1024)
                            if not chunk:
                                break
                            out.write(chunk)

                # Validate the JSONL file.
                valid = 0
                with temp.open("r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip():
                            json.loads(line)
                            valid += 1
                            if valid >= 3:
                                break

                if valid == 0:
                    raise ValueError("No valid JSONL records")

                temp.replace(destination)
                downloaded.append(destination)
                success = True

                print(
                    f"[{len(downloaded)}/{max_files}] "
                    f"Downloaded {filename} "
                    f"({destination.stat().st_size:,} bytes)"
                )
                break

            except Exception:
                temp.unlink(missing_ok=True)

        if not success and checked <= 5:
            print(f"Unavailable: {rel}")

    # Official README demonstration fallback.
    if not downloaded:
        fallback = (
            "https://openaipublic.blob.core.windows.net/"
            "minecraft-rl/data/10.0/"
            "cheeky-cornflower-setter-02e496ce4abb-20220421-092639.jsonl"
        )

        destination = output_dir / "official_readme_example.jsonl"
        temp = destination.with_suffix(".part")

        try:
            request = urllib.request.Request(
                fallback,
                headers={"User-Agent": "EVOLVE-VPT-Adapter/1.3"}
            )

            with urllib.request.urlopen(request, timeout=60) as response:
                with temp.open("wb") as out:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        out.write(chunk)

            valid = 0
            with temp.open("r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        json.loads(line)
                        valid += 1
                        if valid >= 3:
                            break

            if valid:
                temp.replace(destination)
                downloaded.append(destination)
                print("Downloaded official README demonstration.")
            else:
                raise ValueError("Fallback contains no valid records")

        except Exception as exc:
            temp.unlink(missing_ok=True)
            print(f"Fallback failed: {exc}")

    print(
        f"\nResult: {len(downloaded)} valid action file(s), "
        f"{checked} index entries checked."
    )

    return downloaded



def normalize_button(value):
    s = str(value).lower()
    if "right" in s or s in ("1", "button2"):
        return "right"
    if "left" in s or s in ("0", "button1"):
        return "left"
    return ""


def classify_action(record):
    mouse = record.get("mouse") or {}
    keyboard = record.get("keyboard") or {}
    buttons = set(filter(None, (normalize_button(x) for x in
                  list(mouse.get("buttons") or []) + list(mouse.get("newButtons") or []))))
    keys = {str(k).lower() for k in (keyboard.get("keys") or [])}
    # Minecraft right-click is usually use/place; left-click is attack/mine.
    if "right" in buttons:
        return "build"
    if "left" in buttons:
        return "gather"
    if any(k.endswith(".e") for k in keys):
        return "trade"
    if keys & MOVE_KEYS or abs(float((mouse or {}).get("dx") or 0)) + abs(float((mouse or {}).get("dy") or 0)) > 0:
        return "explore"
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index-url", default=DEFAULT_INDEX, help="Official VPT contractor-data index JSON")
    parser.add_argument("--data-dir", default="data/vpt", help="Folder containing downloaded VPT .jsonl action files")
    parser.add_argument("--output", default="data/vpt_policy.json")
    parser.add_argument("--download", action="store_true", help="Download a small number of action JSONL files from the index")
    parser.add_argument("--max-files", type=int, default=3, help="Maximum JSONL segments to download (default: 3)")
    args = parser.parse_args()
    root = Path(args.data_dir)
    if args.download:
        download_action_files(args.index_url, root, max(1, args.max_files))
    files = sorted(root.rglob("*.jsonl")) if root.exists() else []
    if not files:
        raise SystemExit(f"No VPT .jsonl action files found under {root.resolve()}")

    counts = Counter()
    transitions = defaultdict(Counter)
    samples = skipped = 0
    for file in files:
        previous = None  # never join unrelated recording segments
        with file.open("r", encoding="utf-8") as stream:
            for line in stream:
                try:
                    label = classify_action(json.loads(line))
                except (json.JSONDecodeError, TypeError, ValueError):
                    label = None
                if label is None:
                    skipped += 1
                    continue
                counts[label] += 1
                samples += 1
                if previous is not None:
                    transitions[previous][label] += 1
                previous = label

    alpha = 1.0
    denominator = sum(counts.values()) + alpha * len(GAME_ACTIONS)
    priors = {a: (counts[a] + alpha) / denominator for a in GAME_ACTIONS}
    transition_probs = {}
    for source, row in transitions.items():
        total = sum(row.values()) + alpha * len(GAME_ACTIONS)
        transition_probs[source] = {a: (row[a] + alpha) / total for a in GAME_ACTIONS}
    result = {
        "source": "OpenAI VPT contractor action demonstrations",
        "method": "heuristic control-to-action mapping with smoothed first-order action prior",
        "samples": samples, "skipped_or_unmapped": skipped, "files": len(files),
        "class_counts": {a: counts[a] for a in GAME_ACTIONS},
        "priors": priors, "transitions": transition_probs,
        "limitations": [
            "This is not OpenAI's original VPT neural network or pretrained weights.",
            "Minecraft actions are coarsely mapped to EVOLVE actions; target context is absent from action-only JSONL.",
            "Left-click is ambiguous between mining and attacking; it is mapped to gather.",
            "Hunt is learned from EVOLVE's own online interaction because the action trace cannot identify the target.",
            "The prior biases action selection; EVOLVE's online Q-learning updates from its own state and rewards."
        ]
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"Processed {samples:,} mapped action steps from {len(files)} VPT action files.")
    print(f"Saved prior: {output.resolve()}")
    print("Mapped classes:", result["class_counts"])
    print("Restart server.py to load the prior.")

if __name__ == "__main__":
    main()
