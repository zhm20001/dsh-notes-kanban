---
name: note-integration
description: 笔记整合 / 沉淀引擎。用户把原始材料（灵感、学习片段）倒进来时触发——找候选既有笔记、判定并入还是新建；并入时把笔记重写为连贯结构（去重/总结/体系化），不悄悄造重复孤儿。打开时看到最近在坚持的笔记、标出久未触碰的（遗忘风险）。硬脚本负责确定性检索/读写/列最近，模型只做整合判断。触发词：存笔记、记下来、存档、读笔记、读档、最近笔记、我有哪些笔记、最近在搞什么、note、笔记整合、沉淀、整合进笔记。
---

# 笔记整合 skill（沉淀引擎 v1 · 骨架）

> 领域词汇见仓库 `CONTEXT.md`（笔记 / 存档 / 读档 / 整合）。架构见 `docs/adr/0003`（硬脚本骨架 + LLM 判断）、`docs/adr/0004`（Python）。本文件覆盖 ticket 01–03 的循环：**打开看最近 → 捕获/整合 → 读档**——捕获新材料（新笔记 or 并入既有，去重/总结/体系化，杜绝重复建档），打开时看到最近在坚持的笔记并标出久未触碰的（遗忘风险）。

## 核心纪律（不能飘）

- **硬脚本 = 骨架（确定性代码）**：`find_candidates`（关键词找候选笔记）、`save_note`（原子写 + 写前 `.bak`）、`read_note`（读回）、`list_recent`（列最近 + 标遗忘风险）。**你（模型）只选工具与参数，执行永远是这些脚本**。绝不自己拼文件名、绝不自己写文件、绝不自己 grep / `ls` 文件夹——这是防 Hermes 式飘的保证。
- **你的判断职责（两件，都是 LLM 干的，不是脚本）**：
  1. **结构化**：把原始材料变成 `title / tags / body`（标题点题、标签 3–5 个检索词、正文连贯 markdown）。
  2. **整合**：拿到 `find_candidates` 的候选 + 新材料后，**判定"并入既有 / 新建"**；并入时把笔记**重写为连贯结构（去重 / 总结 / 体系化），不是追加文末**。
- **绝不悄悄造重复孤儿**：只要 `find_candidates` 返回了相关候选（尤其首位），优先并入它，而不是新建。新建只在"无相关笔记"时发生。
- **笔记单位**：一条笔记 = 文件夹里一个 markdown 文件（+ front-matter）。灵感是"幼体笔记"，status 用 `spark`；火花长成完整笔记仍是**同一条**（`--id` 更新，不另建）。

## 配置

- 笔记文件夹：默认仓库下的 `notes/`（可被 host 覆盖）。下文记作 `$NOTES_DIR`。
- 脚本（仓库下 `scripts/note/`，用 `python3` 跑）：`find_candidates.py`、`save_note.py`、`read_note.py`、`list_recent.py`。

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

把返回的 markdown 渲染给用户。需要程序化读笔记（如整合前读取候选全文）时加 `--json`，输出 `{id, front_matter, body}`。

若用户不知道 id：先跑流程 D 的 `list_recent` 看最近在动的笔记（拿到 id + 哪些久未触碰）；或用流程 C 的 `find_candidates` 按关键词召回某主题的笔记。**别自己 `ls` 文件夹**——列笔记永远是 `list_recent` 的事。

## 流程 C —— 整合新材料进既有笔记（核心差异点）

用户倒进新材料时，**先找候选，再判定并入/新建**——这是消灭"重复建档"的关键。每次都从第 1 步走起：

1. **找候选**（硬脚本，确定性）：

   ```sh
   python3 scripts/note/find_candidates.py \
     --notes-dir "$NOTES_DIR" \
     --material-stdin <<< "用户倒进来的原始材料……"
   ```

   输出一行 JSON 数组，按相关度排序，每项含 `id / title / tags / status / score / updated_at / snippet`。**空数组 = 无相关笔记 → 走流程 A 新建**。body 较长用 `--material-file` / `--material-stdin`。

2. **判定并入 / 新建（你的判断）**：读首位候选（必要时多读几位）的全文：

   ```sh
   python3 scripts/note/read_note.py --notes-dir "$NOTES_DIR" --id "<候选 id>" --json
   ```

   拿到 `front_matter` + `body` 后，**你判断**：这份新材料属于这条既有笔记吗？
   - **是 → 并入**（第 3 步）。
   - **否（确实是全新主题）→ 走流程 A 新建**。
   - **拿不准 / 候选很弱 → 倾向新建，但告知用户你看到的候选**，别静默决定。

3. **并入 = 重写为连贯结构（你的判断，硬脚本执行）**：把"既有笔记全文 + 新材料"**重写**成一份连贯的 markdown——**去重 / 总结 / 体系化**，绝不是把新材料粘贴到文末。然后 `--id` 覆写（脚本会先生成 `.bak` 保住前版，再原子写）：

   ```sh
   python3 scripts/note/save_note.py \
     --notes-dir "$NOTES_DIR" \
     --title "<可能微调的标题>" \
     --tags "<可能合并/扩充的标签>" \
     --status "<可随成长升格，如 spark→active>" \
     --id "<候选 id>" \
     --body-stdin <<< "重写后的连贯正文……"
   ```

   输出 JSON 的 `bak` 字段 = `<id>.bak`（前版全文，可回溯）。`id` 不变——同一笔记长大了，没裂成两条。

4. **读回确认 + 渲染**给用户：用流程 B 读回，让用户看到整合后的一份连贯笔记；并说明你**并入了哪条既有笔记**（而非新建），`.bak` 已留前版。

### 整合的不变量（每次并入都必须成立）

- 旧内容未丢：`.bak` 留有前版全文（可回溯；坏整合可从 `.bak` 恢复——见 ticket 04）。
- 新材料要点在整合后的正文里。
- 无逐字重复既有段落（去重，不是追加）。
- front-matter 合法、`updated_at` 由脚本刷新为新时间、`id` 不变。

> 这几条里，`.bak` 留前版 / `updated_at` 刷新 / front-matter 合法 / `id` 不变 是**硬脚本保证**的（有测试）；"要点在 / 无逐字重复 / 连贯" 是**你的整合判断**（靠真实使用验证，非自动测试）。

## 流程 D —— 打开看最近（护长期主义，防碎片化）

打开工具 / 用户问"最近在搞什么 / 我有哪些笔记 / 哪些该回去碰一下"时：

```sh
python3 scripts/note/list_recent.py --notes-dir "$NOTES_DIR"
```

输出一行 JSON 数组，按 `updated_at` 降序（最近在动的在前），每项含 `id / title / tags / status / updated_at / age_days / stale / snippet`。把它**渲染成 markdown 列表**给用户：

- `stale: true` = 久未触碰（默认超 30 天没更新）→ 标"⚠️ 遗忘风险"，提醒用户是否该回去碰一下（防笔记变成坟场、护长期主义）。
- `age_days` = 距今天数，渲染成"N 天前更新"。
- `status` 展示生命周期（spark 幼体 / active 进行中 / dormant 沉睡 / done 完成）。

`--limit`（默认 10）控制条数；`--stale-days`（默认 30）调遗忘阈值。v1 是"按更新时间简单排序 + 久未触碰标记"，不做更深的"该聚焦什么"策展（spec 0001 明示延后）。**这是确定性硬脚本**——列笔记永远是它的事，别自己 `ls` / `grep` 文件夹。

## 还没有的（后续 ticket，别现在做）

- **从 `.bak` 回滚一次坏整合** → ticket 04
- **矛盾材料标记/保留**（而非静默覆盖）、**来源归属 source**、**状态生命周期流转**（recent-view 据此区分进行中/已完成）→ ticket 04（stretch）
- **前端 / dashboard** → 用真实日常使用挣来再考虑（spec 0001）
