# 04 — 加固（stretch / v1.1）：.bak 回滚 / 来源归属 / 矛盾保留 / 状态生命周期

**What to build:** 端到端加固——从 `.bak` 回滚一次坏整合；整合保留材料来源（source）；矛盾材料被标记/保留而非静默覆盖；笔记状态（spark→active→dormant→done）可流转并喂给 recent-view 区分"进行中/已完成"。

**Blocked by:** 02（整合）、03（读档与展示）

**Status:** ready-for-agent（但标为 stretch — 等 01–03 的循环真用起来再开工）

- [ ] 能从 `.bak` 回滚一次整合（恢复前版）
- [ ] 整合保留材料来源（`source` 字段或正文标注）
- [ ] 矛盾材料被标记/保留，不静默覆盖
- [ ] 笔记状态 spark→active→dormant→done 可流转，recent-view 据此区分进行中 / 已完成
- [ ] 注：本票先不做；待 01–03 循环被真实使用验证后，再视需要拆细开工
