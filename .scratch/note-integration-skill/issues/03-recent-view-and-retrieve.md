# 03 — 读档与长期主义：最近笔记展示 + 关键词呼出

**What to build:** 端到端——我打开 agent → `list_recent` 看到"最近在坚持的笔记"（按 `updated_at`）并标出久未触碰的（遗忘风险），护长期主义、防碎片化；用关键词呼出任一笔记、看到全貌（读档）。v1 由 agent 渲染 markdown，不建前端。与 02 平行，只依赖 01。

**Blocked by:** 01（存档地基与最薄循环）

**Status:** done

- [x] 打开时 `list_recent` 返回最近在动的笔记（按 `updated_at`），并标出久未触碰的（遗忘风险）
- [x] 用关键词能呼出任一笔记、看到全貌（读档）——复用既有 `find_candidates`（关键词召回）+ `read_note`（读全文），非新脚本；有召回→读档的黑盒测试守住
- [x] recent-view 与读档由 agent 在对话里渲染 markdown（v1 无前端）——写入 `SKILL.md` 流程 B（读档）/ 流程 D（打开看最近）
- [x] `list_recent` 是确定性脚本，文件系统 seam 紧断言覆盖——16 个黑盒 subprocess 测试全绿

## 交付物

- `scripts/note/list_recent.py`（确定性硬脚本：按 `updated_at` 降序 + 久未触碰标记 `stale`，输出 JSON 数组）
- `scripts/note/notelib.py` 增 recent 原语：`parse_timestamp`（ISO8601→aware UTC，与 `now_iso` 配对）、`DEFAULT_STALE_DAYS = 30`
- `tests/conftest.py` 增 `list_recent` fixture；`tests/test_list_recent.py`（16）——含排序/平局/`stale` 阈值/`age_days`/输出形状/`.bak`·非-md·坏 YAML 跳过/确定性/召回读档；`python3 -m pytest` 全绿（53）
- `skills/note-integration/SKILL.md` 新增**流程 D（打开看最近）**；流程 B 的"不知 id 怎么办"改为指向 `list_recent`/`find_candidates` 并禁止自 `ls`；核心纪律/配置加入 `list_recent`；去掉"还没有的"里的 list_recent 项

## 设计要点 / 边界（诚实记录）

- **硬/软分工延续（ADR-0003）**：`list_recent` 是确定性骨架（排序 + 标记由代码定，可飘的零）；"渲染成 markdown 给用户、提醒哪些该回去碰"是 agent 的渲染职责（写在流程 D，靠真实使用验证，非自动测试）。与 spec 0001"v1 = 按更新时间简单排序 + 久未触碰标记，不做更深思策展"一致。
- **遗忘阈值**：默认 30 天未碰即 `stale`（`--stale-days` 可调）；`stale = (now − updated_at) ≥ stale_days`，边界含等号。`age_days` 为整天数（向下取整，clamp ≥0），供 agent 渲染"N 天前"。
- **确定性**：`updated_at` 降序 → id 升序（与 `find_candidates` 同款稳定多趟排序）。时间戳走 `parse_timestamp`（解析为 aware UTC 比较），而非裸字符串字典序——避免手写笔记时间格式不一导致错序。
- **鲁棒性**：`.bak` / 非 `.md` / 坏 YAML 由 `iter_notes` 跳过（不致命）；缺/坏 `updated_at` 的笔记**不被跳过**（区别于坏 YAML 的整篇跳过）——排末尾、`stale=true`、`age_days=null`，全量列表里仍看得到；与任何低近度笔记一样受 `--limit` 约束（不额外保送）。
- **读档复用既有脚本**：ticket 03 的"关键词呼出 + 看全貌"= `find_candidates` + `read_note`，已就位，不另起脚本（YAGNI）。流程 B/D 写清这条路径。
- **`--limit` 默认 10**：比 `find_candidates` 的召回-5 大——这是"扫一眼最近"的浏览视图，不是排序检索。
