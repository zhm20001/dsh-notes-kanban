"""Shared pytest fixtures and helpers for the note file-system seam.

Tests treat the scripts as black-box CLIs (subprocess) and assert on the
state of a temp note folder — per spec 0001's testing decision: "只测外部
行为（文件夹状态），不测实现细节".
"""

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
