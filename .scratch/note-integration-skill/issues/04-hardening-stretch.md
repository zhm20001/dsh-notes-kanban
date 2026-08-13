# 04 — 加固（stretch / v1.1）：.bak 回滚 / 来源归属 / 矛盾保留 / 状态生命周期

**What to build:** 端到端加固——从 `.bak` 回滚一次坏整合；整合保留材料来源（source）；矛盾材料被标记/保留而非静默覆盖；笔记状态（spark→active→dormant→done）可流转并喂给 recent-view 区分"进行中/已完成"。

**Blocked by:** 02（整合）、03（读档与展示）

**Status:** done

- [x] 能从 `.bak` 回滚一次整合（恢复前版）—— `restore_note.py` 硬脚本，非破坏式 swap（live↔.bak），可逆
- [x] 整合保留材料来源（`source` 字段或正文标注）—— `save_note --source` 已就位；SKILL.md 流程 C 要求并入时传 `--source`，多来源在正文列出；front-matter 单值（守 schema）
- [x] 矛盾材料被标记/保留，不静默覆盖—— SKILL.md 流程 C 纪律 + 不变量：正文 `> ⚠️ 矛盾（存疑）` 标记 + 保留两种观点（软契约，代表性测试守住形状）
- [x] 笔记状态 spark→active→dormant→done 可流转，recent-view 据此区分进行中 / 已完成—— `save_note --status` 流转已具备；`list_recent --status` 过滤（进行中 vs 已完成）；SKILL.md 写明生命周期与升格时机
- [x] 注：原标 stretch、建议拆细；用户决定现在整票实现，沿硬/软线落地（见设计要点）

## 交付物

- `scripts/note/restore_note.py`（确定性硬脚本：从 `.bak` 回滚，非破坏式 swap）
- `scripts/note/list_recent.py` 增 `--status <逗号分隔>` 过滤（token 校验，与 save_note `choices` 同严格度）
- `tests/test_restore_note.py`（8）+ `tests/test_list_recent.py` 增 6 个 status 过滤测试 + `tests/test_integrate.py` 增 1 个（来源归属的硬脚本侧：`--source` 落进 front-matter）；矛盾保留（US 19）属纯 LLM 重写契约、无硬脚本形状可断言，仅写 SKILL.md（与 spec"不测指令"一致）；`python3 -m pytest` 全绿（70）
- `tests/conftest.py` 增 `restore_note` fixture
- `skills/note-integration/SKILL.md`：新增**流程 E（回滚）**；流程 C 补 `--source` + 来源归属/矛盾保留两纪律 + 不变量；流程 D 补 `--status` 过滤与进行中/已完成分组 + 生命周期；核心纪律/配置纳入 `restore_note`；"还没有的"更新（核心循环就位，下一步用起来）

## 设计要点 / 边界（诚实记录）

- **硬/软分工落地（ADR-0003）**：`restore_note`、`list_recent --status` 是确定性骨架（紧断言、可飘的零）；"矛盾标记保留 / 来源标注 / 何时升格状态"是 **LLM 的整合判断**，写在 SKILL.md，靠真实使用验证（代表性测试只守"形状"，与 spec 0001"接受方差"一致）。
- **回滚 = 非破坏式 swap**：先 `atomic_write(live, bak)`（好版本先落 live——要恢复的数据永不在崩溃窗口冒险），再 `atomic_write(bak, old_live)`（坏版本进 `.bak`，可二次回滚反悔）。成功时两文件恒在、好版本安全。两写之间有微窗口：崩溃于此只会丢"被回滚掉的坏版本"（你本就要丢弃的；notes 是纯文件可 git 追历史）——先写 live 是刻意的优先级。US 12"永不丢数据"针对的是坏整合别毁掉前版**好**数据，回滚满足之。
- **回滚 updated_at 刻意"倒退"**：逐字恢复 `.bak`（含其旧时间戳）。这是全系统**唯一**时间戳倒退处——"updated_at 不回退"只约束**合并**（save_note --id），不约束显式回滚；在脚本 docstring 与流程 E 写明。
- **矛盾保留用正文标记，不加 front-matter 字段**：守 spec 0001"front-matter 只留真用得上的少数字段"；正文 `> ⚠️ 矛盾（存疑）` blockquote 约定，由 LLM 在重写时落。备选 front-matter `flags` 留待真实使用证明需要再考虑。
- **状态不加流转强制校验**：保持 save_note 自由枚举（"可流转"能力已具备）；强制会挡住"复活一条 done"等合法操作，属投机。`list_recent --status` 给"区分进行中/已完成"以真能力，而非仅渲染技巧。
- **来源 front-matter 单值**：守 schema；多来源在正文列出，不把 `source` 改成 list（YAGNI，待真实需要）。
