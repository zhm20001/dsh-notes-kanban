# 运行形态：dsh 插件（确定性骨架移植 TypeScript）

沉淀引擎从「宿主 agent（ZCode/Pi）里的 skill」升级为 **DeepSeek Harness（dsh）插件**：

- 确定性骨架（notelib + 5 个脚本）移植为插件内的 TypeScript 核心，挂成 `ctx.notes` 服务 + `note_*` 工具；agent 只选工具与参数，执行永远是代码（ADR-0003 的纪律不变）。
- **整合**（去重/总结/体系化）从 SKILL.md 的 prose 升级为 `note_integrate` 管线工具：候选检索 → 读档 → 内嵌 `ctx.llm` 调用重写 → 落盘（`.bak` 回滚链不变）。provider/model/temperature 是插件配置，不随会话模型漂移。
- 混合型分工：捕获/读档/列最近由 agent 对话编排（skill 指引），整合的**判断**（并入/新建、与用户商量）留在对话里，整合的**执行**进管线。

理由（按重要性）：

- **不过于依赖单一宿主 agent**（原始诉求）：dsh 是可自组合的 harness，LLM 能力经 `ctx.llm` 接缝取得，换 provider 是换配置行；skill 形态下"整合质量"完全押注宿主模型。
- **整合需要被设计、被测试**：spec 0001 承诺的 soft-invariant 评测（固定 model + temperature 0，断言不变量）在 skill 形态下结构性无法落地（ticket 02 已降 scope）；管线工具形态让它成为可能。
- **文件系统契约零变化**：笔记仍是「文件夹里的 markdown + front-matter」，文件名即稳定 id、`.bak` 回滚链不变。70 个 pytest 契约测试作为移植 oracle，vitest 逐条对齐后 Python 版退役——本 ADR 修订 ADR-0004 的 Python 选择（其"语言无关解耦边界"论断恰是本次移植的依据）。
- 学习目标：以真实项目练通用 dsh 插件写法（tool / Service / Config schema / ctx.llm 直调 / session event / bundle 装载）。

## Status

accepted（2026-08-17 与用户共同裁决：混合型架构 + TypeScript 移植两项均为用户选定）

## 追记（2026-08-15，随 spec 0002 定稿）

- **一份材料并入多条笔记正式出范围**（spec 0002 条目 9）：save/integrate 单目标；需要时跑两次 integrate。
- **suggest_links 正式退役**（spec 0002 条目 10）：spec 0001 的复用承诺划掉——find_candidates + 并入/新建二分已覆盖其意图，跨笔记类型化关系本就 out-of-scope。
- **front-matter 增可选 `summary`**（spec 0002 条目 3）：修订 spec 0001 schema 与 ticket 04"守 schema"决策；仍是 ≤6 字段。

## 追记（2026-08-18，ticket 10：Python 退役）

- **Python 版正式退役**：`scripts/note/`（notelib + 5 脚本）、`tests/`（pytest 70 条）、`skills/note-integration/`（Python 时代 SKILL.md）已删（git 历史可回溯）。退役前置：pytest 终跑 70/70 绿；vitest 侧 88 条 keyless + 3 案例真模型评测全绿，行为逐条对齐记录在 ticket 06/08/09 归档。
- **日常入口**：`dsh plugin --profile web add <本插件路径>` 安装后，插件自带 bundle patch 自动生效（`dsh/` 的 `ctx.notes` 服务 + 6 个 `note_*` 工具 + runtime skill）；对话触发词不变。
- **本 ADR 对 ADR-0004 的修订至此闭环**：Python 版完成了它的历史任务（契约 oracle），语言无关的文件系统契约 + pytest 对齐记录让移植可验收，随后功成身退。
