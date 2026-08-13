"""Black-box tests for list_recent.py — the recency-view half of the seam.

Per spec 0001 / ADR-0003, list_recent is a *hard-script*: a deterministic,
recency-ordered view of the note folder with stale (forgotten-risk) marking.
The model only renders the result as markdown; the ordering and the stale flag
are always this code. v1 is "sort by updated_at + mark stale"; smarter curation
("what to focus on") is a deferred upgrade (spec 0001 out-of-scope).

Like find_candidates, these invoke the script as a subprocess and assert on the
JSON output (external behaviour), not on internals.
"""

import datetime as dt
import json


def _days_ago(days: int) -> str:
    """An ISO8601-Z timestamp `days` whole days before real now (robust to clock)."""
    return (
        (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days))
        .replace(microsecond=0)
        .strftime("%Y-%m-%dT%H:%M:%SZ")
    )


def test_empty_folder_returns_empty_array(list_recent, notes_dir):
    res = list_recent(["--notes-dir", str(notes_dir)])
    assert res.returncode == 0, res.stderr
    assert json.loads(res.stdout) == []


def test_sorted_by_updated_at_desc(list_recent, notes_dir, write_note):
    write_note(notes_dir, "old.md", title="Oldest", updated_at="2026-01-01T00:00:00Z", body="a")
    write_note(notes_dir, "mid.md", title="Middle", updated_at="2026-04-01T00:00:00Z", body="b")
    write_note(notes_dir, "new.md", title="Newest", updated_at="2026-08-01T00:00:00Z", body="c")
    res = list_recent(["--notes-dir", str(notes_dir)])
    assert res.returncode == 0, res.stderr
    assert [n["id"] for n in json.loads(res.stdout)] == ["new.md", "mid.md", "old.md"]


def test_tiebreak_by_id_asc(list_recent, notes_dir, write_note):
    # same updated_at → id asc wins (deterministic), matching find_candidates
    write_note(notes_dir, "b.md", title="B", updated_at="2026-05-01T00:00:00Z")
    write_note(notes_dir, "a.md", title="A", updated_at="2026-05-01T00:00:00Z")
    res = list_recent(["--notes-dir", str(notes_dir)])
    assert res.returncode == 0, res.stderr
    assert [n["id"] for n in json.loads(res.stdout)] == ["a.md", "b.md"]


def test_stale_note_marked(list_recent, notes_dir, write_note):
    # a note untouched for years is forgotten-risk (stale)
    write_note(notes_dir, "ancient.md", title="Old", updated_at="2020-01-01T00:00:00Z", body="x")
    res = list_recent(["--notes-dir", str(notes_dir)])
    assert res.returncode == 0, res.stderr
    assert json.loads(res.stdout)[0]["stale"] is True


def test_fresh_note_not_stale(list_recent, notes_dir, make_note):
    # a note just saved (real now) is not stale
    make_note(notes_dir, title="Fresh", body="just now")
    res = list_recent(["--notes-dir", str(notes_dir)])
    assert res.returncode == 0, res.stderr
    assert json.loads(res.stdout)[0]["stale"] is False


def test_stale_days_threshold_controls_marking(list_recent, notes_dir, write_note):
    # a note 10 days old: stale at --stale-days 7, not stale at --stale-days 30
    write_note(notes_dir, "n.md", title="N", updated_at=_days_ago(10))
    res_7 = list_recent(["--notes-dir", str(notes_dir), "--stale-days", "7"])
    res_30 = list_recent(["--notes-dir", str(notes_dir), "--stale-days", "30"])
    assert res_7.returncode == 0, res_7.stderr
    assert res_30.returncode == 0, res_30.stderr
    assert json.loads(res_7.stdout)[0]["stale"] is True
    assert json.loads(res_30.stdout)[0]["stale"] is False


def test_age_days_is_nonneg_int_and_monotonic(list_recent, notes_dir, write_note, make_note):
    # the older note has the larger age; both are non-negative ints
    write_note(notes_dir, "old.md", title="Old", updated_at=_days_ago(100), body="x")
    new_id = make_note(notes_dir, title="New", body="fresh")  # real now → age ~0
    res = list_recent(["--notes-dir", str(notes_dir)])
    assert res.returncode == 0, res.stderr
    by_id = {n["id"]: n for n in json.loads(res.stdout)}
    # every age_days is a non-negative int for these well-formed notes
    for n in by_id.values():
        assert isinstance(n["age_days"], int) and n["age_days"] >= 0
    assert by_id["old.md"]["age_days"] > by_id[new_id]["age_days"]


def test_limit_caps_results(list_recent, notes_dir, write_note):
    for i in range(5):
        write_note(notes_dir, f"n{i}.md", title=f"N{i}", updated_at=f"2026-0{i+1}-01T00:00:00Z")
    res = list_recent(["--notes-dir", str(notes_dir), "--limit", "3"])
    assert res.returncode == 0, res.stderr
    assert len(json.loads(res.stdout)) == 3


def test_default_limit_is_ten(list_recent, notes_dir, write_note):
    # default is a browse-friendly 10 (more than find_candidates' recall-5)
    for i in range(12):
        write_note(
            notes_dir, f"n{i:02d}.md", title=f"N{i}", updated_at=f"2026-{(i % 12) + 1:02d}-01T00:00:00Z"
        )
    res = list_recent(["--notes-dir", str(notes_dir)])
    assert res.returncode == 0, res.stderr
    assert len(json.loads(res.stdout)) == 10


def test_output_json_shape(list_recent, notes_dir, write_note):
    write_note(
        notes_dir, "a.md", title="React", tags=["frontend"], status="active",
        updated_at="2026-03-01T00:00:00Z", body="hooks and fibers",
    )
    res = list_recent(["--notes-dir", str(notes_dir)])
    assert res.returncode == 0, res.stderr
    ranked = json.loads(res.stdout)
    assert len(ranked) == 1
    item = ranked[0]
    assert set(item) == {
        "id", "path", "title", "tags", "status", "updated_at", "age_days", "stale", "snippet"
    }
    assert item["id"] == "a.md"
    assert item["path"] == str(notes_dir / "a.md")
    assert item["title"] == "React"
    assert item["tags"] == ["frontend"]
    assert item["status"] == "active"
    assert item["updated_at"] == "2026-03-01T00:00:00Z"
    assert isinstance(item["age_days"], int)
    assert isinstance(item["stale"], bool)
    assert "hooks" in item["snippet"]


def test_bak_files_excluded(list_recent, notes_dir, write_note):
    write_note(notes_dir, "live.md", title="Live", updated_at="2026-08-01T00:00:00Z", body="x")
    # a stale backup must not appear in the recent view
    (notes_dir / "live.md.bak").write_text(
        "---\ntitle: Old\nstatus: spark\nupdated_at: 2020-01-01T00:00:00Z\n---\nold\n", encoding="utf-8"
    )
    res = list_recent(["--notes-dir", str(notes_dir)])
    assert res.returncode == 0, res.stderr
    assert [n["id"] for n in json.loads(res.stdout)] == ["live.md"]


def test_malformed_md_is_skipped_not_fatal(list_recent, notes_dir, write_note):
    # a stray .md with broken YAML must not poison the recent view
    write_note(notes_dir, "good.md", title="Good", updated_at="2026-08-01T00:00:00Z", body="x")
    (notes_dir / "broken.md").write_text(
        "---\ntitle: [unclosed\n  bad: : yaml\n---\nx\n", encoding="utf-8"
    )
    res = list_recent(["--notes-dir", str(notes_dir)])
    assert res.returncode == 0, res.stderr
    assert [n["id"] for n in json.loads(res.stdout)] == ["good.md"]


def test_non_md_files_ignored(list_recent, notes_dir, write_note):
    write_note(notes_dir, "a.md", title="A", updated_at="2026-08-01T00:00:00Z")
    (notes_dir / "notes.txt").write_text("react react react", encoding="utf-8")
    (notes_dir / ".gitkeep").write_text("", encoding="utf-8")
    res = list_recent(["--notes-dir", str(notes_dir)])
    assert res.returncode == 0, res.stderr
    assert [n["id"] for n in json.loads(res.stdout)] == ["a.md"]


def test_deterministic_ordering(list_recent, notes_dir, write_note):
    write_note(notes_dir, "a.md", title="A", updated_at="2026-08-01T00:00:00Z", body="x")
    write_note(notes_dir, "b.md", title="B", updated_at="2026-07-01T00:00:00Z", body="y")
    args = ["--notes-dir", str(notes_dir)]
    r1 = json.loads(list_recent(args).stdout)
    r2 = json.loads(list_recent(args).stdout)
    # ordering is stable across runs for the same folder
    assert [n["id"] for n in r1] == [n["id"] for n in r2]


def test_notes_dir_not_a_directory_fails(list_recent, tmp_path):
    nope = tmp_path / "nope"
    res = list_recent(["--notes-dir", str(nope)])
    assert res.returncode != 0
    assert res.stdout.strip() == ""


def test_stale_boundary_is_inclusive(list_recent, notes_dir, write_note):
    # a note exactly --stale-days old is stale (the comparison is >=)
    write_note(notes_dir, "n.md", title="N", updated_at=_days_ago(14))
    res = list_recent(["--notes-dir", str(notes_dir), "--stale-days", "14"])
    assert res.returncode == 0, res.stderr
    assert json.loads(res.stdout)[0]["stale"] is True


def test_undated_note_is_included_not_skipped(list_recent, notes_dir, write_note):
    # a note whose front-matter parses but has no updated_at breaks the save_note
    # contract. It must NOT be skipped (unlike malformed-YAML notes): it sorts
    # last, is flagged at-risk, with unknown age. Like any low-recency note it is
    # subject to --limit (so this uses a short list where it stays visible).
    write_note(notes_dir, "dated.md", title="Dated", updated_at="2026-08-01T00:00:00Z", body="x")
    (notes_dir / "undated.md").write_text(
        "---\ntitle: No Date\nstatus: spark\n---\nbody text\n", encoding="utf-8"
    )
    res = list_recent(["--notes-dir", str(notes_dir)])
    assert res.returncode == 0, res.stderr
    ranked = json.loads(res.stdout)
    assert [n["id"] for n in ranked] == ["dated.md", "undated.md"]  # undated sorts last
    undated = ranked[-1]
    assert undated["age_days"] is None
    assert undated["stale"] is True
