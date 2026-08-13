# 03 — 读档与长期主义：最近笔记展示 + 关键词呼出

**What to build:** 端到端——我打开 agent → `list_recent` 看到"最近在坚持的笔记"（按 `updated_at`）并标出久未触碰的（遗忘风险），护长期主义、防碎片化；用关键词呼出任一笔记、看到全貌（读档）。v1 由 agent 渲染 markdown，不建前端。与 02 平行，只依赖 01。

**Blocked by:** 01（存档地基与最薄循环）

**Status:** ready-for-agent

- [ ] 打开时 `list_recent` 返回最近在动的笔记（按 `updated_at`），并标出久未触碰的（遗忘风险）
- [ ] 用关键词能呼出任一笔记、看到全貌（读档）
- [ ] recent-view 与读档由 agent 在对话里渲染 markdown（v1 无前端）
- [ ] `list_recent` 是确定性脚本，文件系统 seam 紧断言覆盖
