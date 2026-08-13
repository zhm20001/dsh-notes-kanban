#!/usr/bin/env python3
"""save_note — write a note atomically, with a pre-write ``.bak`` on update.

Deterministic hard-script (ADR-0003). The agent (LLM) only chooses this
script's arguments — title / tags / status / body — and execution is always
this code. Output is a single JSON line on stdout so the agent can pick up the
created note's id.

Usage::

    save_note.py --notes-dir DIR --title "..." [--tags a,b] [--status spark]
                 (--body "..." | --body-file PATH | --body-stdin)
                 [--source "..."] [--id EXISTING_FILE]

A new note gets a generated filename and no ``.bak`` (there is no previous
version). Updating an existing note (``--id``) first copies the current file to
``<id>.bak``, then atomically writes the new version.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow running standalone (python3 scripts/note/save_note.py) by importing the
# sibling library without a package install.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import notelib  # noqa: E402


def _parse_tags(raw: str) -> list[str]:
    return [t.strip() for t in raw.split(",") if t.strip()]


def _read_body(args: argparse.Namespace) -> str:
    if args.body_stdin:
        return sys.stdin.read()
    if args.body_file is not None:
        return Path(args.body_file).read_text(encoding="utf-8")
    if args.body is not None:
        return args.body
    raise SystemExit("error: body is required (use --body, --body-file, or --body-stdin)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Atomically write a note (hard-script).")
    parser.add_argument("--notes-dir", required=True, help="path to the note folder")
    parser.add_argument("--title", required=True, help="note title")
    parser.add_argument("--tags", default="", help="comma-separated tags")
    parser.add_argument(
        "--status",
        default=notelib.DEFAULT_STATUS,
        choices=notelib.VALID_STATUSES,
        help=f"lifecycle status (default: {notelib.DEFAULT_STATUS})",
    )
    parser.add_argument("--source", default=None, help="optional material source")
    parser.add_argument("--id", default=None, help="existing filename to update (else create new)")

    body_group = parser.add_mutually_exclusive_group()
    body_group.add_argument("--body", default=None, help="note body text")
    body_group.add_argument("--body-file", default=None, help="read body from this file")
    body_group.add_argument("--body-stdin", action="store_true", help="read body from stdin")

    args = parser.parse_args()

    notes_dir = Path(args.notes_dir)
    notes_dir.mkdir(parents=True, exist_ok=True)

    body = _read_body(args)
    if not body.strip():
        raise SystemExit("error: body is empty")

    front_matter: dict = {
        "title": args.title,
        "tags": _parse_tags(args.tags),
        "status": args.status,
        "updated_at": notelib.now_iso(),
    }
    if args.source is not None:
        front_matter["source"] = args.source

    if args.id is not None:
        try:
            target = notelib.safe_resolve(notes_dir, args.id)
        except ValueError as exc:
            raise SystemExit(f"error: {exc}")
        if not target.exists():
            raise SystemExit(f"error: note id does not exist (cannot update): {args.id}")
        bak = target.with_name(target.name + notelib.BAK_SUFFIX)
        notelib.atomic_copy(target, bak)
        bak_name = bak.name
    else:
        target = notes_dir / notelib.make_filename(args.title)
        bak_name = None

    notelib.atomic_write(target, notelib.serialize_note(front_matter, body))

    json.dump(
        {"path": str(target), "id": target.name, "bak": bak_name},
        sys.stdout,
        ensure_ascii=False,
    )
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
