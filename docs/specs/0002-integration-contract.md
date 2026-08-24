---
status: accepted
feature: note-integration-contract
---

# Spec 0002 — 整合契约（note_integrate 的设计票）

> 把 `skills/note-integration/SKILL.md` 流程 C 的 prose 约定 drill 成可测契约。每条：现状出处 → 问题 → 提案 → 备选。四条 ⚖ 已于 2026-08-15 经用户裁决（见文末裁决记录）；其余条目为对既有决策（ADR-0005 / ticket 04 / plan）的重述与落实。实现票 = `.scratch/dsh-port/issues/08`；评测票 = `09`。

## 为什么需要这张契约

spec 0001 的整合从未被真正设计过：重写质量（US5）只存在于 SKILL.md 的 prose 里，从未真实发生；摘要（US2）没有落点；防重复（US7）没有阈值；矛盾（US19）/多来源（US20）/标签治理（US21）全是软约定；provider/model/temperature（spec 0001 L66，Q8）无任何记录。dsh 化（ADR-0005）把整合升级为 `note_integrate` 管线工具后，这些悬空约定必须先变成明确契约，工具才有可实现的规格、ticket 09 才有可断言的不变量。

## 契约总览（note_integrate 管线）

**签名**（工具面，模型可见）：`note_integrate(id, material, source?)`。

**分工边界**（混合型，ADR-0005）：**并入/新建的判定留在对话**（skill 指引 agent 用 `note_find_candidates` + 读档 + 与用户商量）；`note_integrate` 只执行已判定的并入——id 由 agent 给出，管线不做新建判定。空候选 → agent 走 `note_save` 新建（流程 A），不经 integrate。

**执行步**（确定性代码编排，每步可测）：

1. `readNote(id)` 读候选全文（core，front-matter + body）。
2. 组装 prompt（版本化模板，见条目 2）：输入 = 既有笔记全文 + 材料 + source? + 既有 front-matter。
3. **log-only session event `note/integrate-llm-request`**：完整请求输入（材料 + 当时笔记全文）+ promptVersion + provider/model/temperature，先于派发落日志——"模型可见 ⟺ 可从会话日志重建"，replay 必须能重建这次 LLM 调用。
4. `ctx.llm`（`prepareCall(LlmCallConfig{provider, model, temperature})` → `stream`，deadline 超时）产出重写稿；解析输出 JSON（模型输出 = 校验边界，见下节）。
5. `saveNote(id, 重写结果)`（core：`.bak` 前版 + 原子写 + `updated_at` 刷新，全部不变量沿用 ticket 05 契约测试）。
6. 返回 `{id, bak, summary, proposed_status, title, tags}`；呈现用 **diff render intent**（前后对比）。

**硬保证（代码 + 测试）**：id 不变；`.bak` 留前版；原子写；front-matter 合法；`updated_at` 刷新；tags/summary 上限（条目 3/7）；输出 JSON 契约校验失败即报错（isError，agent 可见后重试）；LLM 超时有 deadline；请求先落日志。

**软判断（模型，ticket 09 评测断言不变量）**：材料要点在；无逐字重复既有段落；正文连贯；矛盾保留不静默删；来源归属；status 提案合理。

## 逐条裁决

### 1. provider / model / temperature（spec 0001 L66〔Q8〕）

**现状**：Q8 写"本地 vs 云端等核心能跑后拿真实材料实测再定"——skill 形态下无从记录，实际从未定过。
**提案**：成为插件 Config 子对象 `integrate: { provider, model, temperature }`，经 cordis.yml 逐层可换。默认 `provider: 'deepseek-official'`、`model: 'deepseek-chat'`、`temperature: 0`（确定性优先，评测可复现的前提）。dsh 的 llm 接缝让"本地 vs 云端"降级为换一行配置，Q8 不再是架构决策。
**备选**：跟随会话模型（不独立配置）——拒绝：整合质量应稳定可评，不随对话模型漂移（ADR-0005 已裁决）。

### 2. 整合 prompt 模板（SKILL.md L100–116 纯 prose）

**现状**：整合指令散在 SKILL.md 流程 C 的四段 prose 里（重写纪律、来源、矛盾、状态），无版本、无输入输出契约。
**提案**：显式模板进插件源码 `src/integrate/prompt.ts`，导出 `PROMPT_VERSION` 与 builder 函数；规则内嵌（去重/总结/体系化、矛盾 blockquote、来源列表合并、标签治理、摘要产出、status 只提案）。版本号随 session event 落日志——模板改动可追溯，replay 可识别旧版行为。
**备选**：模板外置为可配置文件——拒绝：模板即产品逻辑，版本化进源码才可测；配置化会让"同一笔记被不同模板整合"无历史锚点。

### 3. 摘要落点（US2，spec 0001 L52–62 无 summary 字段）⚖ 已批准（2026-08-15）

**现状**：US2 承诺"LLM 自动抽取标题/标签/摘要"，schema 只有 title/tags/status/updated_at/source——摘要从未有落点。
**提案**：front-matter 增**可选** `summary: string`（≤200 字符，core 硬校验长度）：由 integrate 在重写时产出并维护；`note_save` 增可选参数；`list_recent` 优先展示 summary、退回 snippet。修订 spec 0001 的 schema 块与 ticket 04"守 schema"决策（仍是 ≤6 个字段，未破坏"少数字段"原则）。
**备选**：摘要只放正文首段（零 schema 变更）——拒绝：recent-view 用不上（US10/US11 的浏览场景拿不到），US2 的"永不手填元数据"半途而废。

### 4. 防重复阈值（US7，`find_candidates.py:66` score>0 即候选）⚖ 已批准（2026-08-15，阈值 15 + 复查纪律）

**现状**：score>0 全入围，"拿不准→倾向新建但告知"（SKILL.md L98）没有客观锚点；强弱候选无从区分。
**提案**：候选输出加确定性 `grade: 'strong' | 'weak'`：`strong` = score ≥ 阈值（Config `strongScoreThreshold`，默认 15 ≈ 至少两个关键词族命中）或 ≥2 个关键词 title 命中；其余入围者 `weak`。grade 是 advisory 元数据——判定仍是模型 + 对话，但"拿不准"有了锚：有 strong 候选却想新建时，skill 要求明说理由。**写入后复查**：整合完成后用同一材料再跑一次 find_candidates，目标笔记应升为首位（skill 纪律；ticket 09 断言）。
**备选**：不加分级只展示 score（现状）——拒绝：US7 是"绝不悄悄建重复孤儿"，阈值给"悄悄"一条可检验的线。

### 5. 矛盾表示（US19，ticket 04 L28 备选 flags 被搁置）

**现状**：正文 `> ⚠️ 矛盾（存疑）：…` blockquote 约定，由 LLM 重写时落。
**提案**：维持。模板把该约定升为明确指令；ticket 09 断言"旧观点未被静默删除"（soft）。
**备选**：front-matter `flags` 结构化——维持 ticket 04 的拒绝（真实使用证伪 prose 约定前不上 schema）。

### 6. 多来源（US20，ticket 04 L30 front-matter 单值）

**现状**：front-matter `source` 单值；多来源在正文列"来源：A / B"。
**提案**：维持。模板指令：重写时把既有正文的来源列表与新 source 合并进重写稿（不丢旧来源）。
**备选**：`source` 改 list——维持拒绝（YAGNI，待真实需要）。

### 7. 标签治理（US21，SKILL.md 无规则）⚖ 已批准（2026-08-15，maxTags 默认 6 + 超限硬报错）

**现状**：SKILL.md 只说"标签 3–5 个检索词"，无合并/去重/上限规则；重复整合下标签单调膨胀是可预期的腐烂路径。
**提案**：模板规则 + core 硬边界双层：模板指令"合并既有 + 新材料标签，大小写不敏感去重，既有在前新在后"；core 校验**上限 ≤6**（Config `maxTags`，默认 6），超限报错（isError，模型自纠重试）。US21"零手动归类"不被破坏——上限拦的是膨胀，不是自由。
**备选**：上限 8 / 不设硬上限只靠模板——数字可议；完全不设硬边界则 US21 无兜底。

### 8. 状态升格（SKILL.md L107"只在确信时升格，别乱动"）

**现状**：prose 纪律，无机制。
**提案**：integrate **只提案不落盘**：输出 `proposed_status`（可 null = 维持），落盘 status 恒为既有值；升格在对话确认后经 `note_save` 流转（现状能力，`updated_at` 刷新 + `.bak` 留痕）。判断留在对话里（ADR-0005 混合型分工）。
**备选**：专用 `note_set_status` 薄工具——v1.1 再议（若流转频繁再上，避免现在加工具面）。

### 9. 一份材料跨多条笔记（结构上单目标）

**现状**：save 单目标，integrate 同构——一份材料并入多条笔记 v1 不支持。
**提案**：正式出范围（spec 0001 已列批量摄入 out-of-scope，此处把"多目标"明确并进去）；需要时跑两次 integrate，每次一条。ADR-0005 已隐含，此处补记。

### 10. suggest_links 蒸发承诺（spec 0001 L94）⚖ 已裁决（2026-08-15，正式退役）

**现状**：Further Notes 承诺复用 MindArchive 的 `suggest_links(new, all)` 签名——从未实现；find_candidates + 并入/新建二分已覆盖其意图。
**提案**：**正式退役**——从"可复用资产"清单删除，ADR-0005 追记（跨笔记类型化关系已在 spec 0001 出范围，suggest_links 是它的残留）。
**备选**：列入远期作"整合时正文软引用（'相关：某笔记'）"——非结构化链接，模板可顺带产出；若用户预期会用到交叉引用则选此。

## 输出 JSON 契约（模型 → 代码的解析边界）

模型被要求返回**裸 JSON**（模板明示），代码侧严格校验（模型输出按 dsh 约定属校验边界）：

```json
{
  "title": "…",                    // 可微调的标题（非空）
  "tags": ["…"],                   // 治理后的标签（≤ maxTags）
  "summary": "…",                  // ≤200 字符摘要
  "body": "…",                     // 重写后的连贯 markdown（非空）
  "proposed_status": null,         // 'spark'|'active'|'dormant'|'done'|null（只提案）
  "contradictions_flagged": false  // 本次是否标了矛盾 blockquote
}
```

校验失败（缺字段/超长/非法枚举/多余顶层键）→ 工具报错，**v1 不自动重试**（agent 看到 isError 自行重调）；字段级规整（trim）不做——错就错得响亮。

## 模板 v1 的输入装配（终稿在 ticket 08）

`{promptVersion, 既有笔记全文（front-matter + body）, 材料, source?, 治理参数（maxTags, summary 上限）}`。模板文本本身随 ticket 08 落地并纳入版本化；本 spec 只锁输入输出契约与内嵌规则（条目 2/5/6/7/8）。

## 与既有文档的关系

- **spec 0001**：条目 3 获批则修订 schema 块（+可选 summary）；条目 10 获批则划掉 L94 的 suggest_links 承诺。
- **SKILL.md**：ticket 08 产出 dsh 版 runtime skill（流程 C 改为"找候选 → 商量 → `note_integrate(id)`"），Python 版随 ticket 10 退役。
- **ticket 04**：条目 3 修订其"守 schema"决策；条目 5/6 维持其裁决。
- **ADR-0005**：本 spec 是其"整合需要被设计、被测试"论断的兑现；条目 9/10 获批后追记。

## 裁决记录（2026-08-15，用户逐条确认）

1. **条目 3**：批准 schema 变更——front-matter 增可选 `summary`（≤200 字符，integrate 维护，recent-view 优先展示）。
2. **条目 4**：接受 strong 阈值 15（Config 可调）+ ≥2 关键词 title 命中规则 +「整合后用同材料复查、目标应升首位」纪律。
3. **条目 7**：maxTags 默认 6 + 超限 core 硬报错（模型自纠重试），模板规则在前。
4. **条目 10**：suggest_links 正式退役——spec 0001 划掉承诺，ADR-0005 追记。
5. 未标 ⚖ 条目（1/2/5/6/8/9）无异议，随本定稿生效。

## 实现追记（2026-08-17，ticket 08 落地时的机制修正）

- **评测票已落地（ticket 09，2026-08-17）**：`dsh/test/integrate.e2e.ts` + `eval-corpus.ts`（真实材料语料）+ `eval-invariants.ts`（要点在 / 无逐字照抄 / 矛盾标记三检查器，自身有 keyless 单测）。运行 `pnpm test:e2e`；无 key 自跳过，key 认 env 或 `$DSH_HOME/.credentials.yaml`。首轮全绿（temp 0、deepseek-chat、PROMPT_VERSION 1）。
- **可重建性改走标准事件，不引入自定义 session 事件**：本 harness 构建的持久化重载校验事件类型白名单（`KNOWN_SESSION_EVENT_TYPES` 只含仓内声明，仓外插件事件不在其中，且 `Session.append` 不暴露 `ignorable` 信封）——落盘含 `note/integrate-llm-request` 的会话日志**重载会被拒绝**。契约总览第 3 步的意图（「模型可见 ⟺ 可从会话日志重建」）改由标准 tool 事件承载：材料与 id 在 `note_integrate` 调用参数里、模板版本号（`prompt_version`）与 status 提案在工具结果里、前版全文在 `<id>/note.md.bak`（文件系统契约根，与日志同属持久面；ADR-0006 目录布局）及会话内此前的 `note_read` 结果里。待 harness 开放仓外事件注册面后可切回显式事件。
- **diff 呈现**：工具结果经 `presentationMeta` 持久化前后全文，`presentResult` 呈 diff 卡（`oldText` = 前版、`newText` = 落盘后重读）；render 只出摘要行——前后全文不进模型面。
