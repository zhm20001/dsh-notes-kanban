"""Black-box tests for find_candidates.py — the deterministic retrieval seam.

Per spec 0001, find_candidates is a *hard-script*: deterministic keyword ranking
of existing notes given new material. The model only passes the material; the
ranking is always this code. Tests assert on the JSON ranking (external
behaviour), not on internals. Keyword search is the v1 retrieval; embedding
search is a deferred upgrade.
"""

import json


def test_empty_folder_returns_empty_array(find_candidates, notes_dir):
    res = find_candidates(["--notes-dir", str(notes_dir), "--material", "anything"])
    assert res.returncode == 0, res.stderr
    assert json.loads(res.stdout) == []


def test_no_keyword_overlap_returns_empty(find_candidates, notes_dir, write_note):
    # a note about cooking; material about programming — no shared keywords
    write_note(notes_dir, "a.md", title="Sourdough baking", body="flour water salt starter")
    res = find_candidates(["--notes-dir", str(notes_dir), "--material", "react hooks and components"])
    assert res.returncode == 0, res.stderr
    assert json.loads(res.stdout) == []  # nothing relevant → agent would create a new note


def test_title_match_outranks_body_match(find_candidates, notes_dir, write_note):
    write_note(notes_dir, "body_only.md", title="Misc", body="everything about react fibers")
    write_note(notes_dir, "title_hit.md", title="React internals", body="general notes")

    res = find_candidates(["--notes-dir", str(notes_dir), "--material", "react"])
    assert res.returncode == 0, res.stderr
    ranked = json.loads(res.stdout)
    assert [c["id"] for c in ranked] == ["title_hit.md", "body_only.md"]
    assert ranked[0]["score"] > ranked[1]["score"]


def test_tag_match_scores(find_candidates, notes_dir, write_note):
    write_note(notes_dir, "tagged.md", title="Notes", tags=["typescript"], body="nothing relevant here")
    res = find_candidates(["--notes-dir", str(notes_dir), "--material", "typescript"])
    assert res.returncode == 0, res.stderr
    ranked = json.loads(res.stdout)
    assert len(ranked) == 1
    assert ranked[0]["id"] == "tagged.md"
    assert ranked[0]["score"] >= 3  # SCORE_TAG weight


def test_body_occurrence_capped(find_candidates, notes_dir, write_note):
    # keyword repeated many times should not dominate — body contribution is capped
    write_note(notes_dir, "spammy.md", title="Other", body=("react " * 20).strip())
    res = find_candidates(["--notes-dir", str(notes_dir), "--material", "react"])
    assert res.returncode == 0, res.stderr
    ranked = json.loads(res.stdout)
    # cap = 3 body hits × 1 = 3; not 20
    assert ranked[0]["score"] == 3


def test_bak_files_excluded(find_candidates, notes_dir, write_note):
    write_note(notes_dir, "live.md", title="React notes", body="react")
    # a stale backup that also mentions the keyword must NOT be a candidate
    (notes_dir / "live.md.bak").write_text(
        "---\ntitle: React notes\nstatus: spark\nupdated_at: 2020-01-01T00:00:00Z\n---\nreact react\n",
        encoding="utf-8",
    )
    res = find_candidates(["--notes-dir", str(notes_dir), "--material", "react"])
    assert res.returncode == 0, res.stderr
    ranked = json.loads(res.stdout)
    assert [c["id"] for c in ranked] == ["live.md"]


def test_tiebreak_by_updated_at_desc(find_candidates, notes_dir, write_note):
    # same score, different recency → most recently touched wins
    write_note(
        notes_dir, "older.md", title="x react", updated_at="2026-01-01T00:00:00Z", body=""
    )
    write_note(
        notes_dir, "newer.md", title="y react", updated_at="2026-06-01T00:00:00Z", body=""
    )
    res = find_candidates(["--notes-dir", str(notes_dir), "--material", "react"])
    assert res.returncode == 0, res.stderr
    ranked = json.loads(res.stdout)
    assert [c["id"] for c in ranked] == ["newer.md", "older.md"]


def test_limit_caps_results(find_candidates, notes_dir, write_note):
    for i in range(5):
        write_note(notes_dir, f"n{i}.md", title=f"react {i}", updated_at=f"2026-0{i+1}-01T00:00:00Z")
    res = find_candidates(["--notes-dir", str(notes_dir), "--material", "react", "--limit", "3"])
    assert res.returncode == 0, res.stderr
    ranked = json.loads(res.stdout)
    assert len(ranked) == 3


def test_default_limit_is_five(find_candidates, notes_dir, write_note):
    for i in range(7):
        write_note(notes_dir, f"n{i}.md", title=f"react {i}")
    res = find_candidates(["--notes-dir", str(notes_dir), "--material", "react"])
    assert res.returncode == 0, res.stderr
    assert len(json.loads(res.stdout)) == 5


def test_output_json_shape(find_candidates, notes_dir, write_note):
    write_note(
        notes_dir, "a.md", title="React", tags=["frontend"], status="active",
        updated_at="2026-03-01T00:00:00Z", body="hooks and fibers",
    )
    res = find_candidates(["--notes-dir", str(notes_dir), "--material", "react"])
    assert res.returncode == 0, res.stderr
    ranked = json.loads(res.stdout)
    assert len(ranked) == 1
    item = ranked[0]
    assert set(item) == {"id", "path", "title", "tags", "status", "score", "updated_at", "snippet"}
    assert item["id"] == "a.md"
    assert item["path"] == str(notes_dir / "a.md")
    assert item["title"] == "React"
    assert item["tags"] == ["frontend"]
    assert item["status"] == "active"
    assert item["updated_at"] == "2026-03-01T00:00:00Z"
    assert isinstance(item["score"], int) and item["score"] > 0
    assert "hooks" in item["snippet"]


def test_cjk_material_matches_cjk_note(find_candidates, notes_dir, write_note):
    write_note(notes_dir, "cn.md", title="笔记整合", body="把新材料去重总结进既有笔记")
    res = find_candidates(["--notes-dir", str(notes_dir), "--material", "我想整理一下笔记整合的思路"])
    assert res.returncode == 0, res.stderr
    ranked = json.loads(res.stdout)
    assert len(ranked) == 1
    assert ranked[0]["id"] == "cn.md"


def test_deterministic_ordering(find_candidates, notes_dir, write_note):
    write_note(notes_dir, "a.md", title="react alpha", body="deep react")
    write_note(notes_dir, "b.md", title="react beta", body="shallow")
    args = ["--notes-dir", str(notes_dir), "--material", "react"]
    r1 = json.loads(find_candidates(args).stdout)
    r2 = json.loads(find_candidates(args).stdout)
    assert r1 == r2


def test_material_from_file_and_stdin(find_candidates, notes_dir, write_note, tmp_path):
    write_note(notes_dir, "a.md", title="react", body="x")

    f = tmp_path / "raw.txt"
    f.write_text("react deep dive", encoding="utf-8")
    res_file = find_candidates(["--notes-dir", str(notes_dir), "--material-file", str(f)])
    assert res_file.returncode == 0, res_file.stderr
    assert json.loads(res_file.stdout)[0]["id"] == "a.md"

    res_stdin = find_candidates(
        ["--notes-dir", str(notes_dir), "--material-stdin"], input="react deep dive"
    )
    assert res_stdin.returncode == 0, res_stdin.stderr
    assert json.loads(res_stdin.stdout)[0]["id"] == "a.md"


def test_missing_material_fails(find_candidates, notes_dir):
    res = find_candidates(["--notes-dir", str(notes_dir)])
    assert res.returncode != 0
    assert res.stdout.strip() == ""


def test_stopwords_do_not_match(find_candidates, notes_dir, write_note):
    # "the"/"about" are stopwords; a note whose only overlap is a stopword is not a hit
    write_note(notes_dir, "a.md", title="The Theory", body="about something else entirely")
    res = find_candidates(["--notes-dir", str(notes_dir), "--material", "the about and"])
    assert res.returncode == 0, res.stderr
    assert json.loads(res.stdout) == []


def test_malformed_md_is_skipped_not_fatal(find_candidates, notes_dir, write_note):
    # a stray .md with broken YAML must not poison retrieval of good notes alongside it
    write_note(notes_dir, "good.md", title="react notes", body="react hooks")
    (notes_dir / "broken.md").write_text(
        "---\ntitle: [unclosed\n  bad: : yaml\n---\nreact react\n", encoding="utf-8"
    )
    res = find_candidates(["--notes-dir", str(notes_dir), "--material", "react"])
    assert res.returncode == 0, res.stderr
    ranked = json.loads(res.stdout)
    assert [c["id"] for c in ranked] == ["good.md"]  # broken file skipped, good one still found


def test_non_md_files_ignored(find_candidates, notes_dir, write_note):
    write_note(notes_dir, "a.md", title="react", body="x")
    (notes_dir / "notes.txt").write_text("react react react", encoding="utf-8")
    (notes_dir / ".gitkeep").write_text("", encoding="utf-8")
    res = find_candidates(["--notes-dir", str(notes_dir), "--material", "react"])
    assert res.returncode == 0, res.stderr
    ranked = json.loads(res.stdout)
    assert [c["id"] for c in ranked] == ["a.md"]


def test_keyword_recall_then_load_full_note(find_candidates, read_note, make_note, notes_dir):
    # ticket 03's "recall any note by keyword → see the full picture (读档)":
    # find_candidates is the keyword entry point; read_note loads the full body.
    # This is the read/load half — no new script, just the two hard-scripts in
    # sequence — kept green as part of the recall path.
    note_id = make_note(notes_dir, title="Rust ownership", body="borrow checker rules the lifetime")
    found = json.loads(
        find_candidates(["--notes-dir", str(notes_dir), "--material", "rust borrow"]).stdout
    )
    assert found and found[0]["id"] == note_id
    loaded = read_note(["--notes-dir", str(notes_dir), "--id", note_id])
    assert loaded.returncode == 0, loaded.stderr
    assert "borrow checker" in loaded.stdout
