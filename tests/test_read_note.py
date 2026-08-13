"""Black-box tests for read_note.py — the read half of the file-system seam."""

import json
from pathlib import Path


def _make_note(save_note, notes_dir, title="Readable", body="the body text"):
    res = save_note(["--notes-dir", str(notes_dir), "--title", title, "--body", body])
    assert res.returncode == 0, res.stderr
    return json.loads(res.stdout)["id"]


def test_read_existing_prints_full_markdown(read_note, save_note, notes_dir):
    note_id = _make_note(save_note, notes_dir, body="hello readback")
    res = read_note(["--notes-dir", str(notes_dir), "--id", note_id])
    assert res.returncode == 0, res.stderr
    # stdout is the raw note document: front-matter + body, renderable as markdown
    assert res.stdout.startswith("---\n")
    assert "hello readback" in res.stdout


def test_read_missing_fails(read_note, notes_dir):
    res = read_note(["--notes-dir", str(notes_dir), "--id", "absent.md"])
    assert res.returncode != 0
    assert res.stdout.strip() == ""


def test_read_path_traversal_rejected(read_note, notes_dir):
    res = read_note(["--notes-dir", str(notes_dir), "--id", "../../../etc/passwd"])
    assert res.returncode != 0
