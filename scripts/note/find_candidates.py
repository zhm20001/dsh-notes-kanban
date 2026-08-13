#!/usr/bin/env python3
"""find_candidates — rank existing notes against new material (the retrieval half).

Deterministic hard-script (ADR-0003 / spec 0001). Given raw material the agent
is about to integrate, this extracts keywords and returns the existing notes
most likely to be the merge target — sorted, JSON, top-N. The model only
chooses this script's argument (the material); the ranking is always this code.

The agent uses the result to decide (its judgement, not this script): **merge
into an existing note** vs **create a new note** — so duplicate orphan notes are
never silently created. An empty result means "no relevant note → new note".

Usage::

    find_candidates.py --notes-dir DIR
                       (--material "..." | --material-file PATH | --material-stdin)
                       [--limit N]

Output: a single JSON array on stdout, each item::

    {"id", "path", "title", "tags", "status", "updated_at", "score", "snippet"}

sorted by score desc, then ``updated_at`` desc (most recently touched first),
then id asc — fully deterministic.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import notelib  # noqa: E402

DEFAULT_LIMIT = 5


def main() -> int:
    parser = argparse.ArgumentParser(description="Rank existing notes against new material (hard-script).")
    parser.add_argument("--notes-dir", required=True, help="path to the note folder")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help=f"max candidates (default: {DEFAULT_LIMIT})")

    mat_group = parser.add_mutually_exclusive_group()
    mat_group.add_argument("--material", default=None, help="the new material to find a home for")
    mat_group.add_argument("--material-file", default=None, help="read material from this file")
    mat_group.add_argument("--material-stdin", action="store_true", help="read material from stdin")

    args = parser.parse_args()

    notes_dir = Path(args.notes_dir)
    if not notes_dir.is_dir():
        raise SystemExit(f"error: notes-dir is not a directory: {notes_dir}")

    material = notelib.read_text_source(
        literal=args.material, file_path=args.material_file, from_stdin=args.material_stdin, what="material"
    )

    keywords = notelib.extract_keywords(material)

    candidates = []
    for path, front_matter, body in notelib.iter_notes(notes_dir):
        score = notelib.score_note(keywords, front_matter, body)
        if score <= 0:
            continue
        candidates.append(
            {
                "id": path.name,
                "path": str(path),
                "title": front_matter.get("title", ""),
                "tags": front_matter.get("tags", []) or [],
                "status": front_matter.get("status", ""),
                "updated_at": front_matter.get("updated_at", ""),
                "score": score,
                "snippet": notelib.snippet(body),
            }
        )

    # deterministic ordering: score desc, then most-recently-updated desc, then
    # id asc. Done as stable multi-pass sort (least-significant key first);
    # Python's reverse=True preserves stability, so equal keys keep prior order.
    candidates.sort(key=lambda c: c["id"])                          # id asc
    candidates.sort(key=lambda c: c["updated_at"], reverse=True)    # updated_at desc
    candidates.sort(key=lambda c: c["score"], reverse=True)         # score desc
    candidates = candidates[: max(0, args.limit)]

    json.dump(candidates, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
