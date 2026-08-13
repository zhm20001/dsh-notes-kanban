"""Black-box tests for save_note.py — the file-system seam (spec 0001).

These invoke the script as a subprocess and assert on the resulting state of
the note folder. save_note must be deterministic: the model only picks its
arguments, execution is always code (ADR-0003).
"""

import datetime as dt
import json
from pathlib import Path


def test_new_note_has_required_frontmatter(save_note, notes_dir, parse_note):
    res = save_note(
        [
            "--notes-dir", str(notes_dir),
            "--title", "Quick spark",
            "--tags", "idea,writing",
            "--body", "A half-formed thought about note tools.",
        ]
    )
    assert res.returncode == 0, res.stderr

    out = json.loads(res.stdout)
    assert out["id"].endswith(".md")
    assert out["bak"] is None  # brand-new note: no previous version
    assert out["path"] == str(notes_dir / out["id"])

    note_path = notes_dir / out["id"]
    assert note_path.exists()

    fm, body = parse_note(note_path)
    assert fm["title"] == "Quick spark"
    assert fm["tags"] == ["idea", "writing"]
    assert fm["status"] == "spark"
    # updated_at is a valid ISO8601 timestamp from just now
    parsed = dt.datetime.fromisoformat(fm["updated_at"].replace("Z", "+00:00"))
    now = dt.datetime.now(dt.timezone.utc)
    assert abs((now - parsed).total_seconds()) < 60
    # body carries the structured note text
    assert "A half-formed thought about note tools." in body


def test_new_note_leaves_no_tmp_and_no_bak(save_note, notes_dir):
    res = save_note(
        ["--notes-dir", str(notes_dir), "--title", "T", "--body", "body"]
    )
    assert res.returncode == 0, res.stderr
    # atomic write must not leave temp files behind
    assert list(notes_dir.glob("*.tmp")) == []
    assert list(notes_dir.glob(".*.tmp")) == []
    # a brand-new note has no previous version to back up
    assert list(notes_dir.glob("*.bak")) == []


def test_tags_default_empty_and_custom_status(save_note, notes_dir, parse_note):
    res = save_note(
        ["--notes-dir", str(notes_dir), "--title", "No tags", "--status", "active", "--body", "x"]
    )
    assert res.returncode == 0, res.stderr
    fm, _ = parse_note(notes_dir / json.loads(res.stdout)["id"])
    assert fm["tags"] == []
    assert fm["status"] == "active"


def test_body_from_file_and_stdin(save_note, notes_dir, tmp_path, parse_note):
    body_file = tmp_path / "raw.txt"
    body_file.write_text("Body from a file.", encoding="utf-8")

    res_file = save_note(
        ["--notes-dir", str(notes_dir), "--title", "From file", "--body-file", str(body_file)]
    )
    assert res_file.returncode == 0, res_file.stderr
    _, body = parse_note(notes_dir / json.loads(res_file.stdout)["id"])
    assert "Body from a file." in body

    res_stdin = save_note(
        ["--notes-dir", str(notes_dir), "--title", "From stdin", "--body-stdin"],
        input="Body from stdin.",
    )
    assert res_stdin.returncode == 0, res_stdin.stderr
    _, body = parse_note(notes_dir / json.loads(res_stdin.stdout)["id"])
    assert "Body from stdin." in body


def test_two_saves_same_second_produce_distinct_files(save_note, notes_dir):
    r1 = save_note(["--notes-dir", str(notes_dir), "--title", "Same", "--body", "one"])
    r2 = save_note(["--notes-dir", str(notes_dir), "--title", "Same", "--body", "two"])
    assert r1.returncode == 0 and r2.returncode == 0
    id1 = json.loads(r1.stdout)["id"]
    id2 = json.loads(r2.stdout)["id"]
    assert id1 != id2  # rand4 disambiguates within the same second


def test_update_creates_bak_holding_previous_content(save_note, notes_dir, parse_note):
    created = save_note(
        ["--notes-dir", str(notes_dir), "--title", "Growable", "--body", "original body"]
    )
    note_id = json.loads(created.stdout)["id"]
    note_path = notes_dir / note_id
    bak_path = notes_dir / (note_id + ".bak")
    assert not bak_path.exists()

    updated = save_note(
        [
            "--notes-dir", str(notes_dir),
            "--title", "Growable",
            "--id", note_id,
            "--body", "integrated and rewritten body",
        ]
    )
    assert updated.returncode == 0, updated.stderr
    out = json.loads(updated.stdout)
    assert out["id"] == note_id           # id is stable across updates
    assert out["bak"] == note_id + ".bak"

    # .bak holds the previous version exactly
    assert bak_path.exists()
    bak_fm, bak_body = parse_note(bak_path)
    assert "original body" in bak_body
    # the live note now carries the new, integrated content
    fm, body = parse_note(note_path)
    assert "integrated and rewritten body" in body
    assert "original body" not in body


def test_filename_slug_is_sanitized(save_note, notes_dir):
    res = save_note(
        ["--notes-dir", str(notes_dir), "--title", "Spaced / unsafe: title?", "--body", "x"]
    )
    assert res.returncode == 0, res.stderr
    note_id = json.loads(res.stdout)["id"]
    # no path-unsafe characters survive into the filename
    for bad in "/ \\ : * ? \" < > |".split():
        assert bad not in note_id
    assert "  " not in note_id


def test_missing_title_fails(save_note, notes_dir):
    res = save_note(["--notes-dir", str(notes_dir), "--body", "x"])
    assert res.returncode != 0
    assert res.stdout.strip() == ""


def test_missing_body_fails(save_note, notes_dir):
    res = save_note(["--notes-dir", str(notes_dir), "--title", "T"])
    assert res.returncode != 0
    assert res.stdout.strip() == ""


def test_invalid_status_fails(save_note, notes_dir):
    res = save_note(
        ["--notes-dir", str(notes_dir), "--title", "T", "--status", "bogus", "--body", "x"]
    )
    assert res.returncode != 0


def test_update_nonexistent_id_fails(save_note, notes_dir):
    res = save_note(
        ["--notes-dir", str(notes_dir), "--title", "T", "--id", "nope.md", "--body", "x"]
    )
    assert res.returncode != 0


def test_id_path_traversal_rejected(save_note, notes_dir):
    res = save_note(
        ["--notes-dir", str(notes_dir), "--title", "T", "--id", "../evil.md", "--body", "x"]
    )
    assert res.returncode != 0
    assert not (notes_dir.parent / "evil.md").exists()
