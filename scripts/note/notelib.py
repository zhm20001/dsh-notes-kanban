"""Shared helpers for the note hard-scripts (the deterministic skeleton).

Per ADR-0003 the note folder is a language-agnostic file-system contract:
markdown files with a YAML front-matter. Everything here is pure, deterministic
code — no LLM, no network. The model only picks a script's arguments;
execution is always this code (the guard against Hermes-style drift).
"""

from __future__ import annotations

import datetime as dt
import os
import secrets
import tempfile
from pathlib import Path

import yaml

# --- schema -----------------------------------------------------------------

#: A note's lifecycle status (spec 0001 front-matter schema).
VALID_STATUSES = ("spark", "active", "dormant", "done")
DEFAULT_STATUS = "spark"
#: Suffix for the pre-write backup of the previous version.
BAK_SUFFIX = ".bak"

# --- time -------------------------------------------------------------------


def now_iso() -> str:
    """UTC now as ISO8601 with a trailing ``Z`` (e.g. ``2026-08-13T19:45:00Z``)."""
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def now_stamp() -> str:
    """UTC now as a compact sortable stamp (e.g. ``20260813T194500Z``) for filenames."""
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


# --- text -------------------------------------------------------------------

_UNSAFE = set('/\\:*?"<>|')
_SEPARATORS = _UNSAFE | set(" \t\n\r,.;") | {"，", "。", "、", "；"}


def slugify(title: str) -> str:
    """Turn a title into a filesystem-safe slug.

    Keeps alphanumerics and CJK (fine on modern filesystems); replaces runs of
    whitespace/punctuation/path-unsafe chars with ``-``. Empty result → ``note``.
    """
    out: list[str] = []
    for ch in title.strip():
        if ch in _SEPARATORS:
            out.append("-")
        else:
            out.append(ch)
    slug = "".join(out)
    # collapse runs of '-' and trim edges
    while "--" in slug:
        slug = slug.replace("--", "-")
    slug = slug.strip("-")
    if len(slug) > 50:
        slug = slug[:50].rstrip("-")
    return slug or "note"


def make_filename(title: str) -> str:
    """Generate a unique, sortable filename for a new note.

    ``<UTC-stamp>-<slug>-<rand4>.md``: stamp for chronological sorting, slug for
    human readability, 4 random hex chars so two notes saved in the same second
    with the same title don't collide. The filename is the note's stable id —
    it does not change on later updates.
    """
    return f"{now_stamp()}-{slugify(title)}-{secrets.token_hex(2)}.md"


# --- front-matter -----------------------------------------------------------


def serialize_note(front_matter: dict, body: str) -> str:
    """Assemble a note document: YAML front-matter block + body.

    Front-matter fields are emitted in a stable, readable order.
    """
    yaml_text = yaml.safe_dump(
        front_matter,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )
    # yaml.safe_dump ends with a trailing newline; the closing '---' goes on its
    # own line right after it.
    return f"---\n{yaml_text}---\n{body}"


def parse_note_text(text: str) -> tuple[dict, str]:
    """Split a note document into (front_matter dict, body text)."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        raise ValueError("note does not begin with '---' front-matter")
    try:
        close = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration as exc:
        raise ValueError("front-matter not closed with a second '---'") from exc
    front_matter = yaml.safe_load("\n".join(lines[1:close])) or {}
    body = "\n".join(lines[close + 1 :])
    return front_matter, body


# --- io ---------------------------------------------------------------------


def atomic_write(path: Path, data: str) -> None:
    """Write ``data`` to ``path`` atomically: temp file → fsync → os.replace.

    os.replace is atomic on the same filesystem, so a reader never sees a
    half-written note and a crash never leaves the note corrupt.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_name, path)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def atomic_copy(src: Path, dst: Path) -> None:
    """Copy ``src`` to ``dst`` atomically (used for the pre-write ``.bak``)."""
    atomic_write(dst, src.read_text(encoding="utf-8"))


def safe_resolve(notes_dir: Path, note_id: str) -> Path:
    """Resolve ``notes_dir / note_id`` and refuse to escape ``notes_dir``.

    Guards read_note/save_note against path-traversal ids like ``../secret``.
    """
    candidate = (notes_dir.resolve() / note_id).resolve()
    if not candidate.is_relative_to(notes_dir.resolve()):
        raise ValueError(f"id escapes notes-dir: {note_id!r}")
    return candidate
