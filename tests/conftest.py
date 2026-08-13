"""Shared pytest fixtures and helpers for the note file-system seam.

Tests treat the scripts as black-box CLIs (subprocess) and assert on the
state of a temp note folder — per spec 0001's testing decision: "只测外部
行为（文件夹状态），不测实现细节".
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts" / "note"


def _run(script: Path, args: list[str], **kw) -> subprocess.CompletedProcess:
    """Run a note script with the same interpreter, capturing output."""
    return subprocess.run(
        [sys.executable, str(script), *args],
        capture_output=True,
        text=True,
        **kw,
    )


def _parse_note(path: Path) -> tuple[dict, str]:
    """Split a note into (front_matter dict, body text).

    The file-system contract is: a markdown file beginning with a YAML
    front-matter block delimited by `---` lines. Asserting on parsed
    front-matter *is* asserting on folder state.
    """
    text = Path(path).read_text(encoding="utf-8")
    lines = text.split("\n")
    assert lines and lines[0].strip() == "---", f"note must begin with '---': {text[:40]!r}"
    try:
        close = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration as exc:
        raise AssertionError("front-matter not closed with a second '---'") from exc
    fm = yaml.safe_load("\n".join(lines[1:close])) or {}
    body = "\n".join(lines[close + 1 :])
    return fm, body


@pytest.fixture
def notes_dir(tmp_path) -> Path:
    """An empty note folder under a temp dir."""
    d = tmp_path / "notes"
    d.mkdir()
    return d


@pytest.fixture
def parse_note():
    return _parse_note


@pytest.fixture
def save_note():
    def f(args: list[str], **kw) -> subprocess.CompletedProcess:
        return _run(SCRIPTS / "save_note.py", args, **kw)

    return f


@pytest.fixture
def read_note():
    def f(args: list[str], **kw) -> subprocess.CompletedProcess:
        return _run(SCRIPTS / "read_note.py", args, **kw)

    return f


@pytest.fixture
def find_candidates():
    def f(args: list[str], **kw) -> subprocess.CompletedProcess:
        return _run(SCRIPTS / "find_candidates.py", args, **kw)

    return f


@pytest.fixture
def list_recent():
    def f(args: list[str], **kw) -> subprocess.CompletedProcess:
        return _run(SCRIPTS / "list_recent.py", args, **kw)

    return f


@pytest.fixture
def restore_note():
    def f(args: list[str], **kw) -> subprocess.CompletedProcess:
        return _run(SCRIPTS / "restore_note.py", args, **kw)

    return f


@pytest.fixture
def make_note(save_note):
    """Create a note via the save_note script and return its id.

    Shared by tests that just need an existing note to work against, so the
    "save then parse id" shape isn't re-inlined in every file.
    """

    def f(notes_dir, *, title="Readable", body="the body text", tags=None, status=None):
        args = ["--notes-dir", str(notes_dir), "--title", title, "--body", body]
        if tags is not None:
            args += ["--tags", tags]
        if status is not None:
            args += ["--status", status]
        res = save_note(args)
        assert res.returncode == 0, res.stderr
        return json.loads(res.stdout)["id"]

    return f


def _write_note(
    folder: Path,
    name: str,
    *,
    title: str = "Untitled",
    tags: list[str] | None = None,
    status: str = "spark",
    updated_at: str = "2026-01-01T00:00:00Z",
    body: str = "",
) -> Path:
    """Write a raw note file with a controlled front-matter (folder-state helper).

    Used where a test needs deterministic ``updated_at`` ordering — save_note
    always stamps ``now``, so we set folder state directly instead. Asserting
    on crafted file content *is* asserting on folder state (the seam).
    """
    fm = {"title": title, "tags": tags or [], "status": status, "updated_at": updated_at}
    yaml_text = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, default_flow_style=False)
    path = folder / name
    path.write_text(f"---\n{yaml_text}---\n{body}", encoding="utf-8")
    return path


@pytest.fixture
def write_note():
    return _write_note
