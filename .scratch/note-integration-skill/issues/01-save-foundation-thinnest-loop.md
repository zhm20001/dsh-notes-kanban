# 01 — 存档地基与最薄循环：倾倒材料 → 新笔记 → 读回

**What to build:** 端到端最薄循环——我把原始材料（灵感/学习片段）倒进 agent → LLM 自动结构化（抽取 title/tags）→ 作为一条**新笔记**原子写入（带写前 `.bak`）→ 我能把它读回来。这票同时打下地基：笔记文件夹约定、front-matter schema、`save_note` 脚本、**脚本语言**（python 或 node，本票内定）、`SKILL.md` 骨架、文件系统测试 seam。目标是证明骨架能端到端跑通。

**Blocked by:** 无 — 可立即开始

**Status:** ready-for-agent

- [ ] 倾倒一段原始材料后，笔记文件夹出现一条新笔记，front-matter 含 `title / tags / status(spark) / updated_at`，正文由 LLM 结构化
- [ ] 写入是原子的；写前生成 `.bak`（前版可回溯）
- [ ] 能把刚建的笔记读回，并在 agent 里可读渲染
- [ ] `save_note` 是确定性脚本；模型只选工具，执行永远是代码（防 Hermes 式飘）
- [ ] 文件系统 seam 测试覆盖 save/read（紧断言）
- [ ] 本票内确定辅助脚本语言并记录（ADR 或 ticket 备注）
- [ ] `SKILL.md` 骨架就位（捕获 → 新笔记 → 读回 的最小流程）
