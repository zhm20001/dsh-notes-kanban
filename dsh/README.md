# mytool-dsh-notes

mytool「沉淀引擎」的 dsh 插件（ADR-0005）：确定性笔记存储 + 整合管线，挂成 `ctx.notes` 服务与 6 个 `note_*` 工具；外加**笔记看板**——浏览器侧的人类读档界面（ADR-0007）。文件系统契约：**一条笔记 = 一个目录**（ADR-0006；目录名即稳定 id，`note.md` 主文档 + 自由资产，`note.md.bak` 回滚链）。

## 提供

| 面 | 内容 |
|---|---|
| 服务 | `ctx.notes`（save / read / findCandidates / listRecent / restore / integrate） |
| 工具 | `note_save` `note_read` `note_find_candidates`（strong/weak 分级） `note_integrate` `note_list_recent` `note_restore` |
| 整合 | `note_integrate` 管线：版本化模板 → `ctx.llm` 直调（temp 0）→ 严格 JSON 契约校验 → 原子落盘（spec 0002） |
| skill | `note-integration` runtime skill（组合里有 skills 服务时自动注册） |
| 看板 | host：`ctx.webServer` 只读 JSON（`GET /mytool/notes` 列表、`GET /mytool/notes/:id` 详情）；client：侧栏底部「笔记」按钮 → Modal 弹窗（最近更新排序、summary 优先、stale 警示徽标、done 折叠、展开按需拉详情、手动刷新） |

front-matter：`title` / `tags[]`（≤6） / `status`(spark·active·dormant·done) / `updated_at` / `source`? / `summary`?（≤200，integrate 维护）。

## 看板（笔记看板）

- **只读**：存档与整合仍走模型侧（`note_*` 工具）；看板不改任何笔记。
- **数据通道**：host 路由做展示整形（path 剥离、done 折叠、stale/age 计算），client 只渲染。路线决策与 Typert Remote 否决理由见 `../docs/adr/0007`。
- **构建**：client 是单文件（`src/client/index.tsx`），`pnpm build` 内含两步——tsc 产出 ESM，`scripts/build-client.mjs` 机械转 CJS 并包 loader 工厂壳；脚本带纯度校验（只允许平台模块表 require）与解构键防回归闸（别名方向反了会在构建期报错，而不是浏览器里静默崩）。
- **改完看板代码后**：`pnpm build` → 刷新浏览器页面即可（bundle 路由 no-store 按请求读盘；`dsh web` 无需重启）。
- 手测步骤见 `../docs/manual-testing-guide.md`。

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
pnpm test          # 101 条 keyless：core 契约 + web 路由契约 + prompt/parse + 评测检查器
pnpm test:e2e      # 3 案例真模型 soft-invariant 评测（无 key 自跳过）
pnpm run typecheck && pnpm run build
```

评测语料 `test/eval-corpus.ts` 取自真实使用材料，可持续生长；对比模型用 `MYTOOL_EVAL_MODEL=<model> pnpm test:e2e`。

## 布局

```
src/core/       确定性纯函数（save/read/find/recent/restore/notelib）——vitest 直接打这里
src/integrate/  整合管线（prompt 版本化模板 / parse 严格 JSON 校验 / pipeline ctx.llm 直调）
src/tools/      6 个 defineTool 薄壳
src/web/        看板 host 路由（/mytool/notes 只读 JSON，展示整形在此完成）
src/client/     看板 client 半边（单文件：controller + 侧栏按钮 + Modal）
src/service.ts  类即插件：inject/Config/工具注册/可选 skill/webServer 路由挂载
scripts/        build-client.mjs（tsc ESM → CJS 转换 + loader 壳 + 纯度/解构键校验）
test/           keyless 契约测试（含 web-routes）+ 评测器（corpus/invariants/e2e）
```

文档：`../docs/specs/0002`（整合契约）、`../docs/adr/0005`（运行形态决策与 Python 退役记录）、`../docs/adr/0007`（看板只读桥接决策）、`../docs/manual-testing-guide.md`（上手 + 手测）。

## 依赖说明

`@deepseek-ai/*` 以 `link:` 绝对路径依赖解析到本机 dsh 源码树（同一物理模块实例，无版本漂移）。若未来发布为独立 npm 包，应转为 `@deepseek-ai/cordis` 等 peerDependencies 并钉 dsh 的 rc 版本（预发布期约定）。
