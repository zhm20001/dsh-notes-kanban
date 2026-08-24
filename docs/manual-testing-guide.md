# 笔记整合工具（dsh 插件） — 手动测试与上手引导

> 一句话定位：你把原始材料（灵感 / 学习片段）倒进来 → 插件找候选既有笔记 → 判定并入还是新建 → 并入时管线把笔记重写成连贯结构（去重/总结/体系化），打开时看到最近在坚持的笔记。**硬工具**（note_* 插件工具）负责确定性检索/读写/列/回滚，**整合执行**在 `note_integrate` 管线里（provider/model/temperature 是插件配置），**整合判断**（并入/新建、status 升格）留在对话里。
>
> 架构与领域词汇见 `CONTEXT.md` / `docs/adr/0005` / `docs/specs/0001`·`0002`。本文是**上手 + 手动测试**引导（dsh 版；Python 版已随 ADR-0005 追记退役）。

## 0. 两种测法（覆盖面不同）

| | 终端跑测试 | agent 对话 |
|---|---|---|
| 测什么 | 确定性**硬保证**（92 条 vitest）+ **软不变量**（3 案例真模型评测） | 完整循环，含对话里的**整合判断**（结构化、并入/新建商量、复查） |
| 怎么触发 | `cd dsh && pnpm test` / `pnpm test:e2e` | 对 dsh agent 说自然语言（见下） |
| 适合 | 回归、验收 AI 改动、看质量画像 | 真实记笔记、体验整合质量 |

> 推荐：**改动后先 `pnpm test` 确认硬保证，再在 agent 里走真实流程**。两者下面都给。

---

## 1. 准备（2 分钟）

```sh
# 1) 安装进 web profile（一次性；已装可跳过）
pnpm dsh plugin --profile web add /Users/zhm20001/projects/mytool/dsh
#    插件自带 bundle patch 自动生效：notesDir = /Users/zhm20001/projects/mytool/notes

# 2) 验证装上了：组合清单里应出现一行 id: mytool-notes
pnpm dsh --profile web --dump-config | grep -A4 mytool-notes

# 3) （整合/评测需要）DEEPSEEK key：环境变量或 ~/.dsh/.credentials.yaml 二选一
```

> 源码改动后要生效：`cd dsh && pnpm build`（web 加载 lib/）；开发期热循环可改用 `dsh/cordis.patch.yml` 同目录的 `dev.patch.yml`（绝对路径直载 TS 源码，免构建）。

> **agent 用法**：`dsh web` 起界面，或 `pnpm dsh --profile headless "任务"` 一次性跑。对话触发 `note-integration` skill（触发词：记一下 / 存笔记 / 读笔记 / 最近笔记 / 笔记整合 / 沉淀…）。不确定触发时明确说"用 note-integration skill …"。

---

## 2. 功能全景（6 个工具）

| 工具 | 干什么 | 对应流程 |
|---|---|---|
| `note_save` | 原子写一条笔记；更新时先生成 `.bak`；可选 `summary`（≤200） | 流程 A 捕获 |
| `note_read` | 按 id 读回（markdown + 结构化） | 流程 B 读档 |
| `note_find_candidates` | 关键词检索候选，带 `grade: strong/weak` 分级 | 流程 C 找候选 |
| `note_integrate` | 管线整合：模板 → LLM 重写 → JSON 校验 → 落盘（`.bak` + diff） | 流程 C 整合 |
| `note_list_recent` | 按 `updated_at` 列最近 + 遗忘风险 + 状态过滤（summary 优先展示） | 流程 D 列最近 |
| `note_restore` | 从 `.bak` 回滚一次坏整合（swap，可逆） | 流程 E 回滚 |

front-matter 字段：`title` / `tags[]`（≤6，超限硬报错） / `status`(spark·active·dormant·done) / `updated_at` / `source`(可选) / `summary`(可选，≤200，integrate 维护)。
一条笔记 = 一个目录（ADR-0006）：目录名 = `{UTC时间戳}-{slug}-{4位随机}`（**id 稳定**，更新不变），内含 `note.md` 主文档（工具唯一读写）与自由资产文件（工具不碰）；更新前版备份为目录内 `note.md.bak`。

---

## 3. 逐个流程走一遍（agent 触发语 + 看什么）

### 流程 A — 捕获新材料 → 新笔记

**触发语**："记一下：useState 让函数组件在不写 class 的情况下持有状态、复用逻辑。"（agent 自动结构化 title/tags/body 调 note_save。）

**看什么**：`notes/` 出现一个新笔记目录（内含 `note.md`）；front-matter 含 title/tags/status/updated_at；无 `note.md.bak`（新建无前版）。

### 流程 B — 读档

**触发语**："读一下 Hooks 那条笔记。" / "我之前写过关于 react hooks 的吗？"（agent 先 find/list 拿 id 再 note_read 渲染给你。）

**看什么**：整篇 markdown 回来；front-matter 里若整合过应看到 `summary`。

### 流程 C — 整合新材料进既有笔记（核心差异点）

**触发语**："补一下：今天踩坑，useEffect 依赖数组没写全导致死循环，cleanup 也忘了写。"

agent 的正确走法（skill 纪律）：`note_find_candidates` → **看到 strong 候选（score ≥15 或 title 关键词命中 ≥2）却想新建时，必须明说理由** → 商定目标 id → `note_integrate(id, material, source)` → **写入后复查**（同材料再 find，目标应升首位）→ `note_read` 读回给你看。

**看什么**：
- `note_integrate` 结果：`.bak` 生成、id 不变、`proposed_status` 只是提案（front-matter 的 status **不该**变）、diff 卡显示前后对比。
- 读回应是**一份连贯笔记**（新旧要点合流），不是两段拼接；矛盾材料应出现 `> ⚠️ 矛盾（存疑）：…` 块。
- 整合的不变量（每次并入都该成立）：旧内容在 `.bak` 可回溯 · 新要点在正文 · 无逐字重复段落 · front-matter 合法（tags ≤6、summary ≤200） · `updated_at` 刷新 · id 不变。→ 这些就是 `pnpm test:e2e` 在断言的东西。

### 流程 D — 打开看最近

**触发语**："最近在搞什么？" / "哪些该回去碰一下？"

**看什么**：按 `updated_at` 降序；整合过的笔记优先显示 `summary`（没有则显示正文片段）；`stale:true` 标"⚠️ 遗忘风险"；可按 status 过滤。

### 流程 E — 回滚一次坏整合

**触发语**："刚才那条整合改坏了，回滚到上一版。"（agent 调 note_restore，并告诉你坏版本进了 `.bak`、可再 restore 反悔。）

**看什么**：live 回到前一版；`.bak` 换装刚被回滚的版本；**再跑一次 restore 会换回坏版本**（swap，可逆）。新建笔记没有 `.bak` 不能回滚；回滚逐字恢复，`updated_at` 会"倒退"（全系统唯一时间戳倒退处，正常）。

---

## 4. 测试命令速查

| 命令 | 跑什么 | key |
|---|---|---|
| `cd dsh && pnpm test` | 92 条 keyless：core 契约 + prompt/parse + 检查器单测 | 不需要 |
| `cd dsh && pnpm test:e2e` | 3 案例真模型整合评测（软不变量画像） | 需要（缺失则自动跳过） |
| `cd dsh && pnpm run typecheck` / `pnpm run build` | 类型门 / 产出 lib/ | 不需要 |

评测语料在 `dsh/test/eval-corpus.ts`（三条真实材料案例）；换模型跑对比：`MYTOOL_EVAL_MODEL=<model> pnpm test:e2e`。

---

## 5. 手动测试清单（逐项打勾）

- [ ] **装上**：dump-config 里能看到 `mytool-notes` 行；`dsh web` 起得来
- [ ] **新建**：对话存一条新笔记，`notes/` 出现笔记目录（内含 `note.md`），front-matter 合法，无 `note.md.bak`
- [ ] **读回**：能按 id / 按话题呼出整篇
- [ ] **候选分级**：相关材料 find 出 strong 候选；不相关材料空数组
- [ ] **CJK 检索**：中文材料命中中文笔记
- [ ] **整合**：note_integrate 后 `.bak` 在、id 不变、tags ≤6、summary ≤200、status 未动、diff 卡正常
- [ ] **整合质量**：新要点在、无逐字照抄、矛盾材料出现 ⚠️ 块（= `pnpm test:e2e` 三案例）
- [ ] **复查纪律**：同材料再 find，目标笔记升首位
- [ ] **列最近**：降序、summary 优先、stale/age_days 在、状态过滤可用
- [ ] **回滚**：restore 换回前版、坏版本进 `.bak`、可逆；无 `.bak` 时报错
- [ ] **越界报错**：tags 超 6 / summary 超 200 → 硬报错（模型自纠重试），不静默截断

---

## 6. 排错

| 现象 | 原因 / 处理 |
|---|---|
| dump-config 里没有 mytool-notes | 没装：重跑 `dsh plugin --profile web add /Users/zhm20001/projects/mytool/dsh` |
| 改了源码没生效 | web 加载 `lib/`：`cd dsh && pnpm build`；或开发期用 `dev.patch.yml` 直载源码 |
| `error: note not found` / `note id does not exist` | id 写错；先让 agent list_recent 拿正确目录名 |
| `error: no .bak to restore from` | 该笔记没被更新过；先有过一次更新/整合 |
| `error: too many tags: 7 > 6` | 标签超上限（硬保证）；让 agent 去重后重试 |
| `note-integrate: rewrite output reached maxTokens` | 输出过长；调大 Config `integrate.maxTokens` 或材料拆小 |
| 评测 3 条全 skipped | 无 key：设 `DEEPSEEK_API_KEY` 或配置 `~/.dsh/.credentials.yaml` |
| agent 没触发 skill | 明确说"用 note-integration skill 记一下…" |

---

## 7. 真实使用建议

- **笔记目录**：默认 `notes/`（在仓库里，git 兜底）；`dsh/cordis.patch.yml` 里改 `notesDir` 可挪。
- **整合质量不满意**：先跑 `pnpm test:e2e` 看是硬保证破还是软质量弱——前者是 bug（修代码），后者调 `dsh/src/integrate/prompt.ts`（改一个词就 `PROMPT_VERSION +1`）或换 `MYTOOL_EVAL_MODEL` 对比。
- **语料生长**：日常遇到典型的整合场景（好例/坏例都算），沉淀成 `eval-corpus.ts` 新案例——评测器越用越准。
- **`.bak` 单层**：每次更新覆盖前版；要长历史就 git commit 笔记目录。
- **状态流转**：integrate 只**提案** status，升格要你在对话里确认——火花长大说一声转 active、结案转 done。
