#!/usr/bin/env python3
"""read_note — read a note back by id (the deterministic read half).

Hard-script (ADR-0003): resolves ``notes-dir / id`` (refusing to escape the
folder) and prints the note. By default it prints the raw markdown document so
the host agent can render it; ``--json`` emits structured
``{id, front_matter, body}`` for the cases where the agent must read a note
programmatically — chiefly integration (ticket 02), where the agent reads a
candidate note and rewrites it. A missing note exits non-zero with a message on
stderr and nothing on stdout.

Usage::

    read_note.py --notes-dir DIR --id FILE [--json]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import notelib  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Read a note back by id (hard-script).")
    parser.add_argument("--notes-dir", required=True, help="path to the note folder")
    parser.add_argument("--id", required=True, help="note filename to read")
    parser.add_argument("--json", action="store_true", help="emit {id, front_matter, body} as JSON")
    args = parser.parse_args()

    notes_dir = Path(args.notes_dir)
    try:
        target = notelib.safe_resolve(notes_dir, args.id)
    except ValueError as exc:
        raise SystemExit(f"error: {exc}")

    if not target.exists():
        raise SystemExit(f"error: note not found: {args.id}")

    text = target.read_text(encoding="utf-8")
    if args.json:
        front_matter, body = notelib.parse_note_text(text)
        json.dump(
            {"id": target.name, "front_matter": front_matter, "body": body},
            sys.stdout,
            ensure_ascii=False,
        )
        sys.stdout.write("\n")
    else:
        sys.stdout.write(text)
        if not text.endswith("\n"):
            sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
