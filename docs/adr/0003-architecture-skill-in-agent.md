# 架构：skill-in-agent——硬脚本为骨架，LLM 只做整合判断

工具以一个**可移植 skill**（`SKILL.md` + 独立辅助脚本）实现，跑在 agent host（Pi 或 ZCode，skill 两边通用）里。分工：

- **硬脚本（骨架，确定性代码）**：找候选笔记、原子写入、写前 `.bak`、列出最近笔记。不交给 LLM。
- **LLM（判断）**：拿到"候选笔记 + 新材料"，判定并入既有 / 新建，并做整合（去重 / 总结 / 体系化），产出新笔记文本。

模型只选工具与参数，执行永远是硬代码——这是 host（Pi）的出厂设定，正面防 Hermes 式飘。

存储：一个文件夹，一条笔记一个 markdown 文件（+ 可能的 assets），可 grep / git / 可移植。front-matter 只留整合与检索真用得上的少数字段。

v1 不建前端：展示由 agent 在对话里渲染 markdown；前端要靠"每天真在用"来挣。Pi 专有的 hook/widget ambient 展示作为升级，不进 v1。

## Status
accepted
