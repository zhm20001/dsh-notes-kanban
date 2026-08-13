# 01 — 存档地基与最薄循环：倾倒材料 → 新笔记 → 读回

**What to build:** 端到端最薄循环——我把原始材料（灵感/学习片段）倒进 agent → LLM 自动结构化（抽取 title/tags）→ 作为一条**新笔记**原子写入（带写前 `.bak`）→ 我能把它读回来。这票同时打下地基：笔记文件夹约定、front-matter schema、`save_note` 脚本、**脚本语言**（python 或 node，本票内定）、`SKILL.md` 骨架、文件系统测试 seam。目标是证明骨架能端到端跑通。

**Blocked by:** 无 — 可立即开始

**Status:** done

- [x] 倾倒一段原始材料后，笔记文件夹出现一条新笔记，front-matter 含 `title / tags / status(spark) / updated_at`，正文由 LLM 结构化
- [x] 写入是原子的；写前生成 `.bak`（前版可回溯）—— 新建无前版故无 `.bak`，更新（`--id`）时生成
- [x] 能把刚建的笔记读回，并在 agent 里可读渲染
- [x] `save_note` 是确定性脚本；模型只选工具，执行永远是代码（防 Hermes 式飘）
- [x] 文件系统 seam 测试覆盖 save/read（紧断言）—— 16 个黑盒 subprocess 测试全绿
- [x] 本票内确定辅助脚本语言并记录 —— **Python 3**，见 `docs/adr/0004-script-language-python.md`
- [x] `SKILL.md` 骨架就位（捕获 → 新笔记 → 读回 的最小流程）—— `skills/note-integration/SKILL.md`

## 交付物

- `scripts/note/notelib.py`（共享：front-matter、原子写、slugify、schema）+ `save_note.py` + `read_note.py`
- `tests/conftest.py` + `test_save_note.py`（12）+ `test_read_note.py`（4），`python3 -m pytest` 全绿
- `notes/.gitkeep`（默认笔记文件夹，可被 `--notes-dir` 覆盖）
- 文件名约定：`{UTC时间戳}-{slug}-{4位随机}.md`，id 稳定（更新不变）
- 解耦边界：笔记文件夹的文件系统契约语言无关 → 将来 TS 前端不挡路（ADR-0004）

## 刻意延后（不属本票）

- `read_note` 的结构化输出（`{front_matter, body}`）→ ticket 02（整合需要程序化读笔记时再加）。本票只打印原始 markdown 供 agent 渲染，已满足"读回 + 可读渲染"。
- `--id` 更新 + `.bak` 是为满足"写前 `.bak`"验收而保留的最小能力（仅硬脚本级覆写，无 LLM 整合）；真正的"整合进既有笔记"（去重/总结/体系化）属 ticket 02。
