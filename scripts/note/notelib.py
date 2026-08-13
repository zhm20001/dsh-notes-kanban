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
import sys
import tempfile
from pathlib import Path
from typing import Iterator

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


def read_text_source(
    *,
    literal: str | None,
    file_path: str | None,
    from_stdin: bool,
    what: str,
) -> str:
    """Read a text blob from one of three mutually-exclusive sources.

    Several hard-scripts share this input shape (save_note's body, find_candidates'
    material): a literal string, a file path, or stdin. ``what`` names the thing
    being read for the error message (e.g. "body", "material"). Raises
    ``SystemExit`` if none of the sources is given or the text is empty.
    """
    if from_stdin:
        text = sys.stdin.read()
    elif file_path is not None:
        text = Path(file_path).read_text(encoding="utf-8")
    elif literal is not None:
        text = literal
    else:
        raise SystemExit(
            f"error: {what} is required (use --{what}, --{what}-file, or --{what}-stdin)"
        )
    if not text.strip():
        raise SystemExit(f"error: {what} is empty")
    return text


def safe_resolve(notes_dir: Path, note_id: str) -> Path:
    """Resolve ``notes_dir / note_id`` and refuse to escape ``notes_dir``.

    Guards read_note/save_note against path-traversal ids like ``../secret``.
    """
    candidate = (notes_dir.resolve() / note_id).resolve()
    if not candidate.is_relative_to(notes_dir.resolve()):
        raise ValueError(f"id escapes notes-dir: {note_id!r}")
    return candidate


# --- retrieval (keyword search, v1 — deterministic) --------------------------
#
# Per ADR-0003 / spec 0001: retrieval is a *hard-script*, not the LLM's job.
# find_candidates turns raw material into a deterministic ranked candidate list
# (title/tag/body keyword weighting). Semantic embedding search is a deferred
# upgrade; v1 is keyword recall so the skeleton never drifts.

#: Per-field keyword weights. Title is the strongest signal a note is "about" a
#: topic, then explicit tags, then body mentions.
SCORE_TITLE = 5
SCORE_TAG = 3
SCORE_BODY = 1
#: Body mentions are capped per keyword so one repetitive note can't dominate.
SCORE_BODY_CAP = 3

#: Words too common to discriminate notes. Kept tiny and ASCII-only on purpose
#: — CJK has no equivalent "stopword" problem at the run level.
_STOPWORDS = frozenset({
    "the", "a", "an", "and", "or", "but", "if", "then", "else", "for", "of",
    "to", "in", "on", "at", "by", "with", "from", "as", "is", "are", "was",
    "were", "be", "been", "being", "this", "that", "these", "those", "it",
    "its", "they", "them", "their", "we", "you", "your", "our", "his", "her",
    "not", "no", "can", "will", "would", "could", "should", "about", "into",
    "than", "too", "very", "just", "also", "have", "has", "had", "do", "does",
    "did", "what", "which", "who", "how", "when", "where", "why", "there",
    "here", "out", "up", "down", "over", "all", "any", "some", "more", "most",
})


def _is_cjk(ch: str) -> bool:
    """True for CJK ideographs (Unified + Extension A). Used for keyword runs."""
    cp = ord(ch)
    return 0x3400 <= cp <= 0x9FFF


def extract_keywords(text: str) -> list[str]:
    """Extract deterministic search keywords from ``text``.

    - ASCII: alphanumeric runs of length >= 3, lowercased, stopwords dropped.
    - CJK: all bigrams (consecutive 2-char substrings) of each ideograph run.
      CJK has no spaces, so a whole sentence is one run and useless as a single
      keyword; bigrams are the standard segmenter-free way to get useful recall
      (a dictionary/segmenter is a deferred upgrade). Single CJK chars are too
      noisy and are dropped.

    Returns distinct keywords sorted alphabetically — order never affects
    scoring, but a stable return keeps everything reproducible.
    """
    found: set[str] = set()
    ascii_run: list[str] = []
    cjk_run: list[str] = []

    def flush_ascii() -> None:
        if ascii_run:
            tok = "".join(ascii_run).lower()
            if len(tok) >= 3 and tok not in _STOPWORDS:
                found.add(tok)
            ascii_run.clear()

    def flush_cjk() -> None:
        if len(cjk_run) >= 2:
            for i in range(len(cjk_run) - 1):
                found.add("".join(cjk_run[i : i + 2]))
        cjk_run.clear()

    for ch in text:
        if ch.isascii() and ch.isalnum():
            if cjk_run:
                flush_cjk()
            ascii_run.append(ch)
        elif _is_cjk(ch):
            if ascii_run:
                flush_ascii()
            cjk_run.append(ch)
        else:
            flush_ascii()
            flush_cjk()
    flush_ascii()
    flush_cjk()
    return sorted(found)


def score_note(keywords: list[str], front_matter: dict, body: str) -> int:
    """Deterministic relevance score of a note for ``keywords``.

    Substring match (lowercased) per keyword: title hit → ``SCORE_TITLE``,
    any tag hit → ``SCORE_TAG``, body mentions → ``SCORE_BODY`` each, capped at
    ``SCORE_BODY_CAP`` per keyword. Substring (not word-boundary) matching is a
    deliberate v1 choice — it gives useful stem recall (``react`` matches
    ``reactivity``) without a stemmer; embedding search is the upgrade path.
    """
    if not keywords:
        return 0
    title_l = str(front_matter.get("title", "")).lower()
    tags_l = [str(t).lower() for t in front_matter.get("tags", []) or []]
    body_l = body.lower()
    score = 0
    for kw in keywords:
        if kw in title_l:
            score += SCORE_TITLE
        if any(kw in t for t in tags_l):
            score += SCORE_TAG
        hits = body_l.count(kw)
        if hits:
            score += min(hits, SCORE_BODY_CAP) * SCORE_BODY
    return score


def snippet(body: str, width: int = 160) -> str:
    """A one-line preview of ``body`` for candidate lists (whitespace-collapsed)."""
    s = " ".join(body.split())
    return s[:width]


def iter_notes(notes_dir: Path) -> Iterator[tuple[Path, dict, str]]:
    """Yield ``(path, front_matter, body)`` for each note file in ``notes_dir``.

    A note file is any ``*.md`` (``.bak`` and other suffixes are excluded by
    construction). Non-note or malformed ``.md`` files are skipped rather than
    aborting a search — retrieval must stay robust to a stray file. Malformed
    covers both a missing/closed front-matter fence (``ValueError``) and
    unparseable YAML (``yaml.YAMLError`` — not a ``ValueError`` subclass).
    """
    for path in sorted(notes_dir.iterdir()):
        if not path.is_file() or path.suffix != ".md" or path.name.endswith(BAK_SUFFIX):
            continue
        try:
            front_matter, body = parse_note_text(path.read_text(encoding="utf-8"))
        except (ValueError, OSError, yaml.YAMLError):
            continue
        yield path, front_matter, body
