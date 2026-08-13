#!/usr/bin/env python3
"""restore_note — roll a note back to its pre-write ``.bak`` (undo a bad merge).

Deterministic hard-script (ADR-0003 / spec 0001 US 14). ``save_note --id`` writes
a ``.bak`` of the previous version before every update; this is the inverse — it
restores that ``.bak`` into the live note, recovering from a bad integration.

The rollback is a **non-destructive swap** of live <-> ``.bak``:

1. read both the live and ``.bak`` contents into memory;
2. ``atomic_write(live, bak_content)`` — write the good version back to live
   FIRST, so the version you are recovering is never at risk in the crash
   window;
3. ``atomic_write(bak, live_content)`` — the rolled-back-FROM version lands in
   ``.bak``, so the rollback is itself reversible (run it again to undo).

On success both files exist and the good version is safe in live. There is a
micro-window between the two writes: a crash there leaves live = good and
``.bak`` = good (unchanged), having lost only the version being discarded (the
one you are rolling back from) — writing live first is the deliberate priority,
since that is the data being recovered. (The "never lose data" guard, US 12, is
about a bad merge not destroying the previous *good* version, which this keeps;
the discarded bad version is recoverable via git, since notes are plain files.)

The restored content comes back **verbatim** (front-matter + body), so
``updated_at`` reflects the restored version — the one place a timestamp
intentionally goes "backwards". (The "updated_at must not go backwards"
invariant is a *merge* invariant; an explicit rollback deliberately rewinds.)

Usage::

    restore_note.py --notes-dir DIR --id FILE

Requires both ``<id>`` and ``<id>.bak`` to exist, else exits non-zero with a
message on stderr and nothing on stdout. Output on success is one JSON line::

    {"id", "restored_from"}
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow running standalone (python3 scripts/note/restore_note.py) by importing
# the sibling library without a package install.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import notelib  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Roll a note back to its .bak (hard-script).")
    parser.add_argument("--notes-dir", required=True, help="path to the note folder")
    parser.add_argument("--id", required=True, help="note filename to roll back")
    args = parser.parse_args()

    notes_dir = Path(args.notes_dir)
    try:
        live = notelib.safe_resolve(notes_dir, args.id)
    except ValueError as exc:
        raise SystemExit(f"error: {exc}")
    bak = live.with_name(live.name + notelib.BAK_SUFFIX)

    if not live.exists():
        raise SystemExit(f"error: note not found: {args.id}")
    if not bak.exists():
        raise SystemExit(f"error: no .bak to restore from: {args.id}")

    live_content = live.read_text(encoding="utf-8")
    bak_content = bak.read_text(encoding="utf-8")

    # Restore the good version to live FIRST (crash-safe for the important data),
    # then park the rolled-back-from version in .bak so the rollback is reversible.
    notelib.atomic_write(live, bak_content)
    notelib.atomic_write(bak, live_content)

    json.dump(
        {"id": live.name, "restored_from": bak.name},
        sys.stdout,
        ensure_ascii=False,
    )
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
