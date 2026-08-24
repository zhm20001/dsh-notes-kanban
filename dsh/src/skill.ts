/**
 * runtime skill 注册 —— SKILL.md 的 dsh 版（spec 0002 落地 ticket 08）。
 * 并入/新建的判定与「拿不准→告知用户」的纪律留在这里（对话里的判断），
 * 整合的执行在 note_integrate 管线里（代码）。
 *
 * @module mytool-dsh-notes/skill
 */

import type { Context } from '@deepseek-ai/cordis'

const SKILL_CONTENT = `# 笔记整合 skill（沉淀引擎 · dsh 版）

领域词汇见仓库 CONTEXT.md（笔记 / 存档 / 读档 / 整合）。工具契约见 docs/specs/0002。

## 核心纪律（不能飘）

- **硬工具 = 骨架（确定性代码）**：note_save（原子写 + 写前 .bak）、note_read（读回）、note_find_candidates（关键词找候选 + strong/weak 分级）、note_list_recent（列最近 + 标遗忘风险）、note_restore（从 .bak 回滚）、note_integrate（整合管线：读档→重写→落盘）。**你（模型）只选工具与参数，执行永远是这些工具**。绝不自己拼路径、绝不自己写文件、绝不自己 ls/grep 笔记目录。
- **你的判断职责（两件）**：
  1. **结构化**：把原始材料变成 title / tags / body（标题点题、标签是检索词、正文连贯 markdown）。
  2. **并入/新建判定**：拿到 find_candidates 的候选后，读全文、必要时与用户商量，判定「并入既有 / 新建」。
- **绝不悄悄造重复孤儿**：有 strong 候选（score ≥ 阈值或 ≥2 关键词命中标题）却想新建时，必须向用户明说看到的候选与理由。新建只在「无相关笔记」时发生。
- **笔记单位**：一条笔记 = notes/ 下一个文件夹（ADR-0006）。\`note.md\` 是主文档（front-matter + 正文，工具唯一读写的文件）；同目录可自由放 assets / 附加文档，工具永不触碰。灵感是「幼体笔记」（status spark）；火花长大仍是同一条（note_save 带 id 更新，不另建）。

## 流程 A —— 捕获新材料 → 新建

1. 材料给的是文件路径就先读内容。
2. 结构化：title（点题）、tags（检索词）、body（连贯 markdown）；可自拟 summary（≤200 字符）与 source。
3. note_save(title, tags, status, source?, summary?, body) 落盘；记住返回的 id（稳定标识）。
4. note_read(id) 读回渲染给用户，告知 id。

## 流程 B —— 读档

note_read(id[, structured: true 给程序化 front-matter + body])。用户不知道 id 时：先流程 D 看最近，或流程 C 按关键词召回。

## 流程 C —— 整合新材料进既有笔记（核心差异点）

每次都从第 1 步走起：

1. **找候选**：note_find_candidates(material)。空结果 = 无相关 → 流程 A 新建。
2. **判定（你的判断）**：读首位候选（必要时多读）全文 note_read(id, structured)。是 → 并入；确实是全新主题 → 流程 A；**拿不准 / 候选全 weak → 倾向新建，但把候选告知用户**，别静默决定。有 strong 候选却想新建 → 说明理由。
3. **并入 = 管线执行**：note_integrate(id, material[, source])。它读档→重写（去重/总结/体系化）→落盘，.bak 留前版，status 只提案不落盘。
4. **写入后复查（纪律）**：用同一材料再跑 note_find_candidates，目标笔记应升为首位；没升 → 向用户报告可能有问题。
5. 读回渲染；说明并入了哪条（而非新建）、.bak 已留、status 提案（用户确认升格才经 note_save 流转）。

## 流程 D —— 打开看最近（护长期主义）

note_list_recent([limit, staleDays, status])。渲染成 markdown 列表：summary 优先展示（无则 snippet）；stale 标「⚠️ 遗忘风险」；age_days 渲染成「N 天前更新」；status 可分组「进行中（spark/active/dormant）/ 已完成（done）」。

## 流程 E —— 回滚一次坏整合

note_restore(id)：非破坏性互换，再跑一次即撤销本次回滚。新建笔记无 .bak 不能回滚。

## 整合的不变量（每次并入都必须成立）

- 旧内容未丢：.bak 留前版全文（\`<id>/note.md.bak\`，note_restore 可恢复）。
- 新材料要点在整合后的正文里；无逐字重复既有段落。
- 来源归属：知道材料来源就传 source（front-matter 单值；多来源在正文列表）。
- 矛盾不静默覆盖：冲突材料保留两种观点 + 正文 \`> ⚠️ 矛盾（存疑）\` 标记。
- front-matter 合法、updated_at 刷新、id 不变。
- 标签 ≤ 上限（工具硬校验）；摘要 ≤200 字符（同）。

> .bak / updated_at / front-matter / id / 上限是**工具保证**的；「要点在 / 无重复 / 连贯 / 矛盾标记 / 来源标注」是**整合判断**，靠真实使用与评测验证。

## 还没有的（别现在做）

前端/dashboard、embedding 语义检索、批量摄入、URL 抓取、一份材料并入多条笔记（需要时跑两次 integrate）——均 out-of-scope（spec 0001/0002）。
`

/** 注册 note-integration runtime skill；返回 registry 的 disposer（caller 挂到 ctx.effect）。 */
export function registerNotesSkill(ctx: Context) {
  return ctx.skills.register({
    name: 'note-integration',
    description:
      '笔记整合 / 沉淀引擎。用户把原始材料（灵感、学习片段）倒进来时触发——找候选既有笔记、判定并入还是新建；'
      + '并入走 note_integrate 管线（去重/总结/体系化），不悄悄造重复孤儿。打开时看到最近在坚持的笔记、'
      + '标出久未触碰的（遗忘风险）。硬工具负责确定性检索/读写/列最近/整合/回滚，模型只做判断。'
      + '触发词：存笔记、记下来、存档、读笔记、读档、最近笔记、我有哪些笔记、最近在搞什么、笔记整合、沉淀、整合进笔记。',
    whenToUse: '用户倾倒灵感/学习材料想要沉淀、问「我有哪些笔记/最近在搞什么」、要求读档或回滚笔记时。',
    source: 'runtime',
    content: SKILL_CONTENT,
  })
}
