"""Black-box tests for restore_note.py — the .bak rollback half of the seam.

Per spec 0001 US 14 / ADR-0003, restore_note is a *hard-script*: it rolls a note
back to its pre-write ``.bak`` (the version save_note --id snapshotted before the
last update), recovering from a bad integration. Deterministic — the model only
picks the id; the swap is always this code. Tests assert on folder state, not
internals.

Rollback semantics under test: it is a non-destructive swap of live <-> .bak —
the rolled-back-from version lands in .bak (so a rollback is itself reversible),
and the restored content comes back verbatim, including its updated_at.
"""

import json


def _merge_to(save_note, notes_dir, note_id, body):
    """Run a save_note --id update (the 'bad merge' to roll back from)."""
    res = save_note(
        ["--notes-dir", str(notes_dir), "--title", "T", "--id", note_id, "--body", body]
    )
    assert res.returncode == 0, res.stderr


def test_restore_brings_back_previous_version(save_note, restore_note, make_note, notes_dir, parse_note):
    note_id = make_note(notes_dir, title="Note", body="original good body")
    _merge_to(save_note, notes_dir, note_id, "BAD integrated body")
    # sanity: the bad merge took over the live note
    _, live_before = parse_note(notes_dir / note_id)
    assert "BAD integrated body" in live_before

    res = restore_note(["--notes-dir", str(notes_dir), "--id", note_id])
    assert res.returncode == 0, res.stderr
    out = json.loads(res.stdout)
    assert out["id"] == note_id
    assert out["restored_from"] == note_id + ".bak"

    # the good previous version is back in the live note
    _, live_after = parse_note(notes_dir / note_id)
    assert "original good body" in live_after
    assert "BAD integrated body" not in live_after


def test_restore_is_nondestructive_bak_holds_rolled_back_version(save_note, restore_note, make_note, notes_dir, parse_note):
    note_id = make_note(notes_dir, title="Note", body="original good body")
    _merge_to(save_note, notes_dir, note_id, "BAD integrated body")

    restore_note(["--notes-dir", str(notes_dir), "--id", note_id])

    # the version we rolled back FROM is recoverable in .bak (data never lost)
    _, bak_body = parse_note(notes_dir / (note_id + ".bak"))
    assert "BAD integrated body" in bak_body


def test_restore_is_reversible_second_restore_swaps_back(save_note, restore_note, make_note, notes_dir, parse_note):
    note_id = make_note(notes_dir, title="Note", body="original good body")
    _merge_to(save_note, notes_dir, note_id, "BAD integrated body")

    restore_note(["--notes-dir", str(notes_dir), "--id", note_id])   # live -> good
    restore_note(["--notes-dir", str(notes_dir), "--id", note_id])   # live -> bad again (swap)

    _, live = parse_note(notes_dir / note_id)
    assert "BAD integrated body" in live  # second restore undid the first


def test_restore_preserves_bak_updated_at_verbatim(save_note, restore_note, make_note, notes_dir, parse_note):
    # rollback is the ONE place updated_at intentionally reflects the restored
    # version, not 'now': the live note takes the .bak's timestamp verbatim.
    note_id = make_note(notes_dir, title="Note", body="v1")
    created_fm, _ = parse_note(notes_dir / note_id)
    created_updated_at = created_fm["updated_at"]

    _merge_to(save_note, notes_dir, note_id, "v2 bad")
    # .bak now holds v1 with its create-time updated_at
    bak_fm, _ = parse_note(notes_dir / (note_id + ".bak"))
    assert bak_fm["updated_at"] == created_updated_at

    restore_note(["--notes-dir", str(notes_dir), "--id", note_id])

    live_fm, _ = parse_note(notes_dir / note_id)
    assert live_fm["updated_at"] == created_updated_at  # restored verbatim, not bumped to now


def test_restore_without_bak_fails(save_note, restore_note, make_note, notes_dir):
    # a brand-new note has no previous version to restore from
    note_id = make_note(notes_dir, title="Note", body="only version")
    res = restore_note(["--notes-dir", str(notes_dir), "--id", note_id])
    assert res.returncode != 0
    assert res.stdout.strip() == ""


def test_restore_missing_note_fails(restore_note, notes_dir):
    res = restore_note(["--notes-dir", str(notes_dir), "--id", "absent.md"])
    assert res.returncode != 0
    assert res.stdout.strip() == ""


def test_restore_id_path_traversal_rejected(restore_note, notes_dir):
    res = restore_note(["--notes-dir", str(notes_dir), "--id", "../evil.md"])
    assert res.returncode != 0
    assert not (notes_dir.parent / "evil.md").exists()


def test_restore_leaves_no_tmp_files(save_note, restore_note, make_note, notes_dir):
    note_id = make_note(notes_dir, title="Note", body="v1")
    _merge_to(save_note, notes_dir, note_id, "v2")
    restore_note(["--notes-dir", str(notes_dir), "--id", note_id])
    assert list(notes_dir.glob("*.tmp")) == []
    assert list(notes_dir.glob(".*.tmp")) == []
