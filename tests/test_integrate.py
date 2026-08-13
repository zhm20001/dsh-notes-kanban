"""Integration-flow tests — the ticket-02 core: merge new material into a note.

These exercise the full hard-script integration loop the agent drives:

    find_candidates -> read_note --json -> (LLM rewrites) -> save_note --id

The *rewrite itself* (dedup / summarise / structure) is the LLM's judgement, not
a script — per ADR-0003 the model produces the new note text; execution is always
code. So these tests cannot assert "the rewrite is coherent" (that is validated
by real use, spec 0001 "接受方差"). They DO assert the deterministic invariants
the hard scripts guarantee on every merge, which is the part that must never
drift:

  ① old content is recoverable (``.bak`` holds the previous version verbatim)
  ② ``updated_at`` does not go backwards vs the backed-up version
  ③ front-matter stays schema-valid; the id is stable across the merge
  ④ a representative integrated body lands verbatim in the live note
  ⑤ the merge target is found by ``find_candidates`` and not duplicated

We use a representative integrated body in place of the LLM output to stand up
the invariants the scripts own (the "key points present / no verbatim dup /
coherent" invariants are the LLM's runtime contract, not asserted here). The
``--json`` read lets the agent read a candidate before rewriting it; we use it
the same way here.
"""

import datetime as dt
import json


def _parse_updated_at(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_merge_preserves_old_version_in_bak(save_note, read_note, find_candidates, make_note, notes_dir, parse_note):
    # an existing note the agent already owns
    note_id = make_note(notes_dir, title="React notes", body="Hooks let functions hold state.")
    live_path = notes_dir / note_id
    bak_path = notes_dir / (note_id + ".bak")
    assert not bak_path.exists()

    # 1) the merge target is discoverable from the new material
    found = json.loads(
        find_candidates(["--notes-dir", str(notes_dir), "--material", "react hooks"]).stdout
    )
    assert found and found[0]["id"] == note_id

    # 2) the agent reads the candidate programmatically before rewriting
    read = json.loads(read_note(["--notes-dir", str(notes_dir), "--id", note_id, "--json"]).stdout)
    assert "Hooks" in read["body"]

    # 3) the LLM-produced integrated body (representative) is written via --id
    integrated = (
        "# React notes\n\n"
        "Hooks let functions hold state. With hooks, components reuse stateful logic "
        "without classes or deep hierarchies."
    )
    merged = save_note(
        [
            "--notes-dir", str(notes_dir),
            "--title", "React notes",
            "--id", note_id,
            "--body", integrated,
        ]
    )
    assert merged.returncode == 0, merged.stderr
    out = json.loads(merged.stdout)
    assert out["id"] == note_id          # id is stable — same note, grown
    assert out["bak"] == note_id + ".bak"

    # invariant ①: the previous version is recoverable verbatim
    assert bak_path.exists()
    _, bak_body = parse_note(bak_path)
    assert "Hooks let functions hold state." in bak_body
    # invariant ④: the integrated body lands in the live note
    _, live_body = parse_note(live_path)
    assert "without classes or deep hierarchies" in live_body


def test_merge_does_not_go_backwards_in_updated_at(save_note, make_note, notes_dir, parse_note):
    note_id = make_note(notes_dir, title="T", body="v1 body")
    # sanity: the freshly-created note is well-formed (parse_note asserts the fence)
    parse_note(notes_dir / note_id)
    bak_path = notes_dir / (note_id + ".bak")

    save_note(
        ["--notes-dir", str(notes_dir), "--title", "T", "--id", note_id, "--body", "integrated v2"]
    )

    live_fm, _ = parse_note(notes_dir / note_id)
    bak_fm, _ = parse_note(bak_path)
    # invariant ②: updated_at never goes backwards (>=, since stamps share second
    # resolution and two writes can land in the same second)
    assert _parse_updated_at(live_fm["updated_at"]) >= _parse_updated_at(bak_fm["updated_at"])
    # invariant ③: schema stays valid, status enum respected
    assert live_fm["status"] in ("spark", "active", "dormant", "done")


def test_merge_does_not_create_duplicate_orphan(find_candidates, make_note, notes_dir):
    # the existing note is the obvious merge target for this material
    make_note(notes_dir, title="Rust ownership", body="borrow checker rules")
    # the agent's job (documented in SKILL.md): merge into the hit, do NOT save_note a new one.
    # the hard-script half we can assert: the hit is found, so a merge target exists.
    found = json.loads(
        find_candidates(["--notes-dir", str(notes_dir), "--material", "rust borrow checker"]).stdout
    )
    assert len(found) == 1
    assert found[0]["title"] == "Rust ownership"
    # and only one note file exists in the folder (no orphan created by the scripts)
    notes = [p for p in notes_dir.iterdir() if p.suffix == ".md" and not p.name.endswith(".bak")]
    assert len(notes) == 1


def test_merged_note_reads_back_as_single_coherent_document(save_note, read_note, make_note, notes_dir, parse_note):
    note_id = make_note(notes_dir, title="Note-taking", body="Capturing sparks fast matters.")

    # a coherent rewrite (not an append) — the LLM's contract, represented here
    integrated = "# Note-taking\n\nCapturing sparks fast matters, so the capture step must stay zero-friction."
    save_note(
        ["--notes-dir", str(notes_dir), "--title", "Note-taking", "--id", note_id, "--body", integrated]
    )

    res = read_note(["--notes-dir", str(notes_dir), "--id", note_id])
    assert res.returncode == 0, res.stderr
    fm, body = parse_note(notes_dir / note_id)
    # reads back as ONE coherent note (single heading, no duplicate front-matter block)
    assert body.count("# Note-taking") == 1
    assert res.stdout.count("---") == 2  # exactly one front-matter block
    assert fm["title"] == "Note-taking"


# --- ticket 04: source attribution (the hard-script half) ---
#
# US 20 ("整合保留来源归属") is mostly an LLM contract — the agent passes --source
# on a merge — and that half lives in SKILL.md, validated by real use, not
# auto-tested (spec 0001 "不测：SKILL.md 本身是指令"). The one deterministic part
# the scripts own — `--source` landing in front-matter on an update — had no test
# before, so we pin it here. (Conflict preservation, US 19, is purely a rewrite
# contract with no hard-script shape to assert, so it stays SKILL.md-only.)


def test_merge_carries_source_into_frontmatter(save_note, make_note, notes_dir, parse_note):
    # the hard-script half of US 20: on a merge, --source lands in front-matter
    # (the provenance the schema reserves `source` for). The agent's judgement of
    # *whether/what* to pass is the untestable soft half.
    note_id = make_note(notes_dir, title="React notes", body="Hooks hold state.")
    save_note(
        [
            "--notes-dir", str(notes_dir),
            "--title", "React notes",
            "--id", note_id,
            "--source", "React docs · hooks intro",
            "--body", "# React notes\n\nHooks hold state for function components.",
        ]
    )
    fm, _ = parse_note(notes_dir / note_id)
    assert fm["source"] == "React docs · hooks intro"  # provenance preserved through the merge
