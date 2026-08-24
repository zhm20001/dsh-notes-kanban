# mytool-dsh-notes

mytool「沉淀引擎」的 dsh 插件（ADR-0005）：确定性笔记存储 + 整合管线，挂成 `ctx.notes` 服务与 6 个 `note_*` 工具。文件系统契约：**一条笔记 = 一个目录**（ADR-0006；目录名即稳定 id，`note.md` 主文档 + 自由资产，`note.md.bak` 回滚链）。

## 提供

| 面 | 内容 |
|---|---|
| 服务 | `ctx.notes`（save / read / findCandidates / listRecent / restore / integrate） |
| 工具 | `note_save` `note_read` `note_find_candidates`（strong/weak 分级） `note_integrate` `note_list_recent` `note_restore` |
| 整合 | `note_integrate` 管线：版本化模板 → `ctx.llm` 直调（temp 0）→ 严格 JSON 契约校验 → 原子落盘（spec 0002） |
| skill | `note-integration` runtime skill（组合里有 skills 服务时自动注册） |

front-matter：`title` / `tags[]`（≤6） / `status`(spark·active·dormant·done) / `updated_at` / `source`? / `summary`?（≤200，integrate 维护）。

## 安装（web profile 日常入口）

```sh
pnpm dsh plugin --profile web add /Users/zhm20001/projects/mytool/dsh
pnpm dsh --profile web --dump-config | grep -A4 mytool-notes   # 验证
```

安装后插件自带的 bundle patch（`cordis.patch.yml`）自动生效，`notesDir` 指向 `/Users/zhm20001/projects/mytool/notes`。源码改动：`pnpm build` 产出 `lib/`（web 加载它）；开发热循环用 `dev.patch.yml`（绝对路径直载 TS 源码，免构建）。

## 配置（cordis.patch.yml 覆写）

```yaml
- id: mytool-notes
  config:
    notesDir: /abs/path/to/notes
    integrate:            # LLM 路由，不随会话模型漂移（spec 0002 条目 1）
      provider: deepseek-official
      model: deepseek-chat
      temperature: 0
      timeoutMs: 120000
    strongScoreThreshold: 15   # strong 候选阈值（条目 4）
    maxTags: 6                 # 标签硬上限（条目 7）
```

## 测试

```sh
pnpm test          # 92 条 keyless：core 契约 + prompt/parse + 评测检查器
pnpm test:e2e      # 3 案例真模型 soft-invariant 评测（无 key 自跳过）
pnpm run typecheck && pnpm run build
```

评测语料 `test/eval-corpus.ts` 取自真实使用材料，可持续生长；对比模型用 `MYTOOL_EVAL_MODEL=<model> pnpm test:e2e`。

## 布局

```
src/core/       确定性纯函数（save/read/find/recent/restore/notelib）——vitest 直接打这里
src/integrate/  整合管线（prompt 版本化模板 / parse 严格 JSON 校验 / pipeline ctx.llm 直调）
src/tools/      6 个 defineTool 薄壳
src/service.ts  类即插件：inject/Config/工具注册/可选 skill
test/           keyless 契约测试 + 评测器（corpus/invariants/e2e）
```

文档：`../docs/specs/0002`（整合契约）、`../docs/adr/0005`（运行形态决策与 Python 退役记录）、`../docs/manual-testing-guide.md`（上手 + 手测）。

## 依赖说明

`@deepseek-ai/*` 以 `link:` 绝对路径依赖解析到本机 dsh 源码树（同一物理模块实例，无版本漂移）。若未来发布为独立 npm 包，应转为 `@deepseek-ai/cordis` 等 peerDependencies 并钉 dsh 的 rc 版本（预发布期约定）。
