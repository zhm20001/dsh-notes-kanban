# mytool-dsh-notes

mytool「沉淀引擎」的 dsh 插件（ADR-0005）：确定性笔记存储 + 整合管线，挂成 `ctx.notes` 服务与 6 个 `note_*` 工具；外加**笔记看板**——浏览器侧的人类读档界面（ADR-0007）。文件系统契约：**一条笔记 = 一个目录**（ADR-0006；目录名即稳定 id，`note.md` 主文档 + 自由资产，`note.md.bak` 回滚链）。

## 提供

| 面 | 内容 |
|---|---|
| 服务 | `ctx.notes`（save / read / findCandidates / listRecent / restore / integrate） |
| 工具 | `note_save` `note_read` `note_find_candidates`（strong/weak 分级） `note_integrate` `note_list_recent` `note_restore` |
| 整合 | `note_integrate` 管线：版本化模板 → `ctx.llm` 直调（temp 0）→ 严格 JSON 契约校验 → 原子落盘（spec 0002） |
| skill | `note-integration` runtime skill（组合里有 skills 服务时自动注册） |
| 看板 | host：`ctx.webServer` 只读 JSON（`GET /mytool/notes` 列表、`GET /mytool/notes/:id` 详情）+ 自包含看板页（`GET /mytool/notes/page`）；client：侧栏底部「笔记」链接 → 新标签页打开看板（在跟列表、summary 优先、stale 警示、done 折叠、展开按需拉详情、手动刷新） |

front-matter：`title` / `tags[]`（≤6） / `status`(spark·active·dormant·done) / `updated_at` / `source`? / `summary`?（≤200，integrate 维护）。

## 看板（笔记看板）

- **只读**：存档与整合仍走模型侧（`note_*` 工具）；看板不改任何笔记。
- **形态（v0.3，ADR 0007 修订）**：diary 式独立页面——host 吐自包含 HTML（`src/web/page.ts`，零构建 vanilla JS，视觉基调取自用户 course.css：纸面米白、衬线正文、砖红强调）；client 半边是预构建单文件 `src/client.js`（仅一个侧栏新标签页链接，无 JSX 无构建链）。
- **排列可选（v0.3.1）**：页头「列表 / 卡片」切换——卡片为二维网格（56rem 行宽下每行 4 张，展开的卡跨整行），偏好存 localStorage，默认卡片。
- **使用指南（v0.3.2）**：标题旁 `?` 徽钮弹出自包含指南（原生 `<dialog>`）——教用户「对 dsh 说这些话」完成增/查/改/回滚（明说无删除、done 即完结），深入层讲状态流转/.bak/整合管线，末尾附看板操作小节。
- **数据通道**：页面 fetch 同源 JSON（列表/详情）；展示整形（path 剥离、done 折叠、stale/age 计算）全在 host 路由。路线决策与 Typert Remote 否决理由见 `../docs/adr/0007`。
- **改代码后**：改 client.js / 页面外的 host 代码 → `pnpm build` + 重启 `dsh web`（页面本体是 host 渲染的 HTML 字符串，也走这里）；仅改 `src/client.js` → 刷新主页面即可（bundle 路由 no-store 按请求读盘）。
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
pnpm test          # 105 条 keyless：core 契约 + web 路由/页面契约 + prompt/parse + 评测检查器
pnpm test:e2e      # 3 案例真模型 soft-invariant 评测（无 key 自跳过）
pnpm run typecheck && pnpm run build
```

评测语料 `test/eval-corpus.ts` 取自真实使用材料，可持续生长；对比模型用 `MYTOOL_EVAL_MODEL=<model> pnpm test:e2e`。

## 布局

```
src/core/       确定性纯函数（save/read/find/recent/restore/notelib）——vitest 直接打这里
src/integrate/  整合管线（prompt 版本化模板 / parse 严格 JSON 校验 / pipeline ctx.llm 直调）
src/tools/      6 个 defineTool 薄壳
src/web/        看板 host 半边（page.ts 自包含页面 + routes.ts 只读 JSON，展示整形在此完成）
src/client.js   看板 client 半边（预构建 bundle：侧栏新标签页链接，无构建链）
src/service.ts  类即插件：inject/Config/工具注册/可选 skill/webServer 路由挂载
test/           keyless 契约测试（含 web-routes 页面+JSON）+ 评测器（corpus/invariants/e2e）
```

文档：`../docs/specs/0002`（整合契约）、`../docs/adr/0005`（运行形态决策与 Python 退役记录）、`../docs/adr/0007`（看板只读桥接决策）、`../docs/manual-testing-guide.md`（上手 + 手测）。

## 依赖说明

`@deepseek-ai/*` 以 `link:` 绝对路径依赖解析到本机 dsh 源码树（同一物理模块实例，无版本漂移）。若未来发布为独立 npm 包，应转为 `@deepseek-ai/cordis` 等 peerDependencies 并钉 dsh 的 rc 版本（预发布期约定）。
