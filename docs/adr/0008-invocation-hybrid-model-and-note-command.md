---
status: accepted
date: 2026-08-25
---

# 呼出策略：混合——模型自判（被动兜底）+ `/note` 命令（主动直达）

用户疑问（2026-08-25）：被动呼出是否不好？如果是脚本关键词匹配，用户要记忆固定关键词，生硬；如果是 LLM 从插件自配，用户不需要笔记时是否白花 token？主动呼出是否更好？

## 事实（dsh 源码查证）

- **技能是两段式，不是关键词匹配**：技能目录以一行 `name: description`（截断 500 字符、按内容摘要去重、非 system prompt）常驻 ≈140 tokens；SKILL.md 全文由模型调用 `skill` 工具**按需拉取**。模型侧没有硬编码关键词匹配——description 里的「触发词」只是给模型的语义提示，用户无需记忆固定词。
- **常驻开销的大头在工具不在技能**：6 个 `note_*` 工具的 schema 每轮请求全量发送 ≈1.1K tokens/步；dsh 没有工具按需加载机制（code 模式折叠除外），**装插件即不可避免**。技能目录（~140）与之相比可忽略。
- **主动通道已存在**：commands 注册表（客户端行首 `/name` 解析，零模型猜测）+ 用户技能手势；`modelInvocable: false` 可完全禁模型自呼。

## Decision

1. **混合**：保留模型自判（说「存个笔记」无需记任何命令——兜底），新增 `/note <文本>` 命令（客户端解析 → handler 经 `agent.followup` 以 plugin 来源消息点名 `note-integration` 技能转交处理——schedule 插件同款先例；主动加速）。两层入口互不冲突。
2. **接受工具 schema 常驻成本**（≈1.1K tokens ≈ 128K 上下文的 0.9%/步）：这是「硬工具 = 骨架」纪律（ADR 0003）的代价，不动。
3. **明确不做**：完全主动（`modelInvocable: false`——牺牲随手存档的流畅性，且省不了 schema 开销）；schema 压缩/激进合并工具（违背 spec 0002 工具契约，收益仅两三百 tokens）。

## 与 ADR 0007 的关系

0007 曾否决「slash command 人类入口」，否决的是**绕过 agent 的直连命令**（命令结果只有文本、绕过整合判断）。`/note` 恰恰相反：它把文本**透传回 agent**，整合判断完整保留。不冲突。

## Consequences

- `src/command.ts` + `commands` 可选依赖（组合里没有 commands 服务时插件照常工作，同 skills/webServer 模式）。
- `/note` 空参报用法；透传消息以 `plugin: mytool-notes` 来源透明记录在会话日志；浏览器命令面板自动发现（已验证）。
- 后续若出现「用户呼出频率远高于自然语言」的实测信号，可再评估收紧自判（那时才有数据）。
