# 02 — 整合：新材料并入既有笔记（去重/总结/体系化），杜绝重复建档

**What to build:** 端到端核心差异点——我喂新材料 → `find_candidates`（关键词检索）找出候选笔记 → LLM 判定"并入既有 / 新建" → 并入时把笔记**重写为连贯结构**（去重 / 总结 / 体系化，非追加文末）→ 原子写 + `.bak`；**绝不悄悄造重复孤儿**。这是区别于 Obsidian 的核心（demos 当年桩掉的那个），建立在 01 的地基上。

**Blocked by:** 01（存档地基与最薄循环）

**Status:** done

- [x] 喂新材料时，`find_candidates`（关键词）返回排序候选笔记（确定性脚本）
- [x] LLM 判定"并入既有 / 新建"；并入时不新建孤儿（判定写在 `SKILL.md` 流程 C；硬脚本侧：候选可被找到、`save_note --id` 并入、孤儿测试断言只增一份）
- [x] 并入 = 重写为连贯结构（去重 / 总结 / 体系化），非追加文末；保留 `.bak`（重写是 LLM 的判断职责，已写入 SKILL；`.bak`+原子写由 `save_note --id` 保证并测试）
- [x] 整合的不变量：硬脚本保证的部分有自动测试（旧内容 `.bak` 可回溯 ✓、front-matter 合法 ✓、`updated_at` 不回退 ✓）；"新材料要点在 / 无逐字重复 / 连贯" 属 LLM 整合判断的运行时契约（架构刻意不把 LLM 放进脚本，故无 LLM-in-loop 的 soft-invariant 自动测试，靠真实使用验证——与 spec 0001"接受方差"一致）
- [x] 既有笔记整合后，读回是连贯的一份（非两段拼接）

## 交付物

- `scripts/note/find_candidates.py`（确定性硬脚本：关键词检索 + 加权打分 + 排序候选）
- `scripts/note/read_note.py` 加 `--json`（输出 `{id, front_matter, body}`——整合前程序化读候选，ticket 01 刻意延后到此票）
- `scripts/note/notelib.py` 增检索原语：`extract_keywords`（ASCII 词+CJK 双字组）/`score_note`（title 5 / tag 3 / body 1·封顶 3）/`snippet`/`iter_notes`
- `tests/test_find_candidates.py`（15）+ `test_integrate.py`（4）+ `test_read_note.py` 增 `--json`；`python3 -m pytest` 全绿（35）
- `skills/note-integration/SKILL.md` 新增**流程 C（整合进既有笔记）**+ 整合不变量清单；更新核心纪律（两件 LLM 判断：结构化、整合）

## 设计要点 / 边界（诚实记录）

- **硬/软分工落地（ADR-0003）**：`find_candidates`/`save_note`/`read_note` 是确定性骨架（紧断言、可飘的零）；"判定并入 vs 新建"与"重写为连贯结构"是 **LLM 的判断职责**，写在 `SKILL.md` 流程 C，靠真实使用验证（非自动测试）——这与 spec 0001"LLM 整合 = 不变量断言（soft），接受方差"一致。
- **CJK 检索**：CJK 无空格，整句当一词无意义；v1 取**双字组（bigrams）**作关键词（segmenter-free 的标准做法），ASCII 仍取 ≥3 字符词。embedding 语义检索为升级项（spec 明示不进 v1）。
- **排序确定性**：score 降序 → `updated_at` 降序（最近在动的优先）→ id 升序；用稳定多趟排序实现（Python `reverse=True` 仍稳定）。
- **不变量分两类**：`.bak` 留前版 / `updated_at` 刷新 / front-matter 合法 / id 不变 / 不增孤儿 = **硬脚本保证（有测试）**；"新材料要点在 / 无逐字重复 / 连贯" = **LLM 整合判断（运行时契约）**。
- **打分权重**：title 5 > tag 3 > body 1（每词 body 命中封顶 3 次），防一条啰嗦笔记靠堆词称霸。
