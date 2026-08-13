# 辅助脚本语言：Python（硬脚本骨架）

硬脚本骨架（`save_note` / `read_note` / 将来的 `find_candidates` / `list_recent`）用 **Python 3** 实现。

理由（按重要性）：

- **任务契合 + 零摩擦**：本工具核心是文件 / markdown / front-matter 操作，Python 标准库（`pathlib` / `os` / `shutil` / `tempfile`）+ 已装的 PyYAML 正是为此而生，`python3 x.py` 直接跑，无构建步骤、无 `node_modules`。
- **全程 AI 实现的小白友好**：越少活动部件越少神秘崩坏；测试（pytest，已装）即 spec 定的"黑盒文件系统契约"安全网。
- **不阻挡将来的 TS 前端**：笔记文件夹的文件系统契约（markdown + front-matter）是**语言无关的解耦边界**。将来若挣到 dashboard，前端可用 TS，后端要么 shell 调这些 Python 脚本、要么把那点存储逻辑移植成 TS——脚本小、且被测试完全规定，移植成本低。因此"最终要前端"不构成现在选 TS 的理由。

这正面落实 spec 0001 的纪律：先证明核心整合循环（被过往 demo 桩掉的那个），前端"靠每天真在用来挣"，不为远期前端过早优化（YAGNI）。也修订/细化了 ADR-0003 的"独立辅助脚本"措辞——明确为 Python 独立脚本。

## Status

accepted（在 ticket 01 内敲定，经用户确认）
