"""Black-box tests for read_note.py — the read half of the file-system seam."""

import json


def test_read_existing_prints_full_markdown(read_note, make_note, notes_dir):
    note_id = make_note(notes_dir, body="hello readback")
    res = read_note(["--notes-dir", str(notes_dir), "--id", note_id])
    assert res.returncode == 0, res.stderr
    # stdout is the raw note document: front-matter + body, renderable as markdown
    assert res.stdout.startswith("---\n")
    assert "hello readback" in res.stdout


def test_read_json_emits_structured_note(read_note, make_note, notes_dir):
    note_id = make_note(notes_dir, title="Structured", body="## section\nprogrammatic body")
    res = read_note(["--notes-dir", str(notes_dir), "--id", note_id, "--json"])
    assert res.returncode == 0, res.stderr
    out = json.loads(res.stdout)
    # structured read is what integration uses to read a candidate before rewriting it
    assert out["id"] == note_id
    assert set(out) == {"id", "front_matter", "body"}
    assert out["front_matter"]["title"] == "Structured"
    assert "programmatic body" in out["body"]


def test_read_missing_fails(read_note, notes_dir):
    res = read_note(["--notes-dir", str(notes_dir), "--id", "absent.md"])
    assert res.returncode != 0
    assert res.stdout.strip() == ""


def test_read_path_traversal_rejected(read_note, notes_dir):
    res = read_note(["--notes-dir", str(notes_dir), "--id", "../../../etc/passwd"])
    assert res.returncode != 0
