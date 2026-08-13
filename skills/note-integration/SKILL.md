---
name: note-integration
description: 笔记整合 / 沉淀引擎。用户把原始材料（灵感、学习片段）倒进来时触发——把材料结构化（抽取标题/标签）存成一条新笔记，并能读回。硬脚本负责确定性读写，模型只做结构化判断。触发词：存笔记、记下来、存档、读笔记、读档、note、笔记整合、沉淀。
---

# 笔记整合 skill（沉淀引擎 v1 · 骨架）

> 领域词汇见仓库 `CONTEXT.md`（笔记 / 存档 / 读档 / 整合）。架构见 `docs/adr/0003`（硬脚本骨架 + LLM 判断）、`docs/adr/0004`（Python）。本文件是 **ticket 01 的骨架**：只覆盖最薄循环——**捕获 → 新笔记 → 读回**。找候选 / 整合进既有笔记 / 列最近，见后续 ticket。

## 核心纪律（不能飘）

- **硬脚本 = 骨架（确定性代码）**：`save_note`（原子写 + 写前 `.bak`）、`read_note`（读回）。**你（模型）只选工具与参数，执行永远是这些脚本**。绝不自己拼文件名、绝不自己写文件——这是防 Hermes 式飘的保证。
- **你的判断职责**：把用户倾倒的原始材料**结构化**成 `title / tags / body`。标题简洁点题、标签是检索用的关键词（3–5 个）、正文是连贯的 markdown（不是把原文一股脑粘贴）。
- **笔记单位**：一条笔记 = 文件夹里一个 markdown 文件（+ front-matter）。灵感是"幼体笔记"，status 用 `spark`。

## 配置

- 笔记文件夹：默认仓库下的 `notes/`（可被 host 覆盖）。下文记作 `$NOTES_DIR`。
- 脚本：仓库下的 `scripts/note/save_note.py`、`scripts/note/read_note.py`，用 `python3` 跑。

## 流程 A —— 捕获新材料 → 存成新笔记

当用户倒进来一段原始材料（灵感 / 学习片段 / 粘贴文本 / 给文件路径）：

1. **读取材料**：若用户给的是文件路径，先读其内容。
2. **结构化（你的判断）**：产出 `title`（点题）、`tags`（逗号分隔关键词）、`body`（连贯 markdown 正文）。
3. **调用硬脚本写入**（body 较长时用 `--body-stdin` 或 `--body-file`，避免命令行转义出错）：

   ```sh
   python3 scripts/note/save_note.py \
     --notes-dir "$NOTES_DIR" \
     --title "点题的标题" \
     --tags "标签1,标签2" \
     --status spark \
     --body-stdin <<< "结构化后的正文……"
   ```

   脚本输出一行 JSON：`{ "path": ..., "id": <文件名>, "bak": null }`。`id` 是这条笔记的稳定标识，**记住它**（后续读档 / 整合要用）。
4. **读回确认 + 渲染**给用户：

   ```sh
   python3 scripts/note/read_note.py --notes-dir "$NOTES_DIR" --id "<id>"
   ```

   把返回的 markdown 渲染给用户看，并告知笔记已存下、`id` 是什么。

### front-matter schema（脚本自动维护，你只需给 title/tags/status/body）

```yaml
---
title: <字符串>
tags: [<字符串>]
status: spark | active | dormant | done   # 新灵感默认 spark
updated_at: <ISO8601，脚本自动填>
source: <可选，材料来源>
---
<正文：自由 markdown，由你结构化为连贯结构>
```

## 流程 B —— 读档（把某笔记呼出来）

用户想回忆/查看某主题时：

```sh
python3 scripts/note/read_note.py --notes-dir "$NOTES_DIR" --id "<id>"
```

把返回的 markdown 渲染给用户。（v1 骨架：还无法按关键词找 id——那是 `find_candidates` / `list_recent` 的活，见后续 ticket。此时若用户不知道 id，你可以直接 `ls "$NOTES_DIR"` 看现有笔记文件名。）

## 还没有的（后续 ticket，别现在做）

- **找候选**（`find_candidates`，关键词检索）→ ticket 02
- **整合进既有笔记**（去重 / 总结 / 体系化，重写而非追加；判定并入 vs 新建）→ ticket 02
- **列最近笔记**（`list_recent`，按 `updated_at`）→ ticket 03
- **从 `.bak` 回滚一次坏整合** → ticket 04
- **前端 / dashboard** → 用真实日常使用挣来再考虑（spec 0001）
