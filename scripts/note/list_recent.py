#!/usr/bin/env python3
"""list_recent — recency-ordered note list with stale (forgotten-risk) marking.

Deterministic hard-script (ADR-0003 / spec 0001). The "open the tool → see what
I've been keeping up with" half: notes sorted by ``updated_at`` desc, each
flagged stale when untouched past a threshold (forgotten-risk — guards
long-termism, keeps the folder from becoming a graveyard). The model only
renders this list as markdown in conversation; the ordering and the stale flag
are always this code (v1 has no frontend — spec 0001).

Usage::

    list_recent.py --notes-dir DIR [--limit N] [--stale-days D]

Output: a single JSON array on stdout, each item::

    {"id", "path", "title", "tags", "status", "updated_at",
     "age_days", "stale", "snippet"}

sorted by ``updated_at`` desc, then ``id`` asc — fully deterministic for a given
folder + clock. ``age_days`` is whole days since ``updated_at`` (>= 0, ``null``
only for a note whose ``updated_at`` is unparseable); ``stale`` is true when the
note has been untouched for at least ``--stale-days``.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

# Allow running standalone (python3 scripts/note/list_recent.py) by importing the
# sibling library without a package install.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import notelib  # noqa: E402

#: Browse-friendly default: more than find_candidates' recall-5, since this is a
#: glanceable "what's recent" view, not a ranked search.
DEFAULT_LIMIT = 10

#: Earliest possible time: a note whose ``updated_at`` can't be parsed sorts last
#: and is flagged at-risk. It is NOT skipped (malformed-YAML notes are dropped by
#: iter_notes) — but like any low-recency note it is subject to ``--limit``.
_UNDATED = dt.datetime.min.replace(tzinfo=dt.timezone.utc)


def main() -> int:
    parser = argparse.ArgumentParser(description="List recent notes with stale marking (hard-script).")
    parser.add_argument("--notes-dir", required=True, help="path to the note folder")
    parser.add_argument(
        "--limit", type=int, default=DEFAULT_LIMIT, help=f"max notes to return (default: {DEFAULT_LIMIT})"
    )
    parser.add_argument(
        "--stale-days",
        type=int,
        default=notelib.DEFAULT_STALE_DAYS,
        help=(
            "days untouched after which a note is flagged stale "
            f"(default: {notelib.DEFAULT_STALE_DAYS})"
        ),
    )
    args = parser.parse_args()

    notes_dir = Path(args.notes_dir)
    if not notes_dir.is_dir():
        raise SystemExit(f"error: notes-dir is not a directory: {notes_dir}")

    now = dt.datetime.now(dt.timezone.utc)
    threshold = dt.timedelta(days=max(0, args.stale_days))

    rows: list[dict] = []
    for path, front_matter, body in notelib.iter_notes(notes_dir):
        updated_raw = str(front_matter.get("updated_at", ""))
        try:
            updated = notelib.parse_timestamp(updated_raw)
        except (ValueError, TypeError):
            # A note whose updated_at is missing/unparseable breaks the save_note
            # contract. It is NOT skipped (unlike malformed-YAML notes, which
            # iter_notes drops): sort it last, flag it at-risk, age unknown — so a
            # full listing still surfaces it. Like any low-recency note, --limit
            # may cut it.
            updated, age_days, stale = _UNDATED, None, True
        else:
            delta = now - updated
            age_days = max(0, delta.days)
            stale = delta >= threshold

        row = notelib.note_summary(path, front_matter, body)
        row["_updated"] = updated
        row["age_days"] = age_days
        row["stale"] = stale
        rows.append(row)

    # deterministic ordering: updated_at desc, then id asc. Done as a stable
    # multi-pass sort (least-significant key first), matching find_candidates'
    # convention; Python's reverse=True preserves stability for equal keys.
    rows.sort(key=lambda r: r["id"])                 # id asc
    rows.sort(key=lambda r: r["_updated"], reverse=True)  # updated_at desc
    rows = [{k: v for k, v in r.items() if k != "_updated"} for r in rows[: max(0, args.limit)]]

    json.dump(rows, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
