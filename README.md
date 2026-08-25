# dsh-notes-kanban

一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的笔记插件：把「灵感 / 学习材料」沉淀为一条条可回滚的笔记，并由 LLM 完成去重、总结与体系化整合；同时提供一个浏览器侧**笔记看板**，用于人类快速读档。

## 功能

- `ctx.notes` 服务 + 6 个 `note_*` 工具：
  - `note_save` / `note_read` / `note_find_candidates` / `note_integrate` / `note_list_recent` / `note_restore`
- `note_integrate` 整合管线：
  - 版本化 prompt → `ctx.llm` 直调（temperature 0）→ 严格 JSON 契约校验 → 原子落盘
- `/note <文本>` 主动直达命令（可选）
- 笔记看板（只读）：
  - 最近更新列表 / summary 优先 / stale 警示 / done 折叠
  - 本地搜索、列表/卡片排列、使用指南弹窗
- 笔记存储契约：**一条笔记 = 一个目录**，`note.md` 主文档 + 自由资产 + `note.md.bak` 回滚链

## 布局

```text
src/core/       确定性纯函数（save/read/find/recent/restore/notelib）
src/integrate/  整合管线（prompt / parse / pipeline）
src/tools/      6 个 note_* 工具薄壳
src/web/        看板 host 半边（自包含页面 + 只读 JSON 路由）
src/client.js   看板 client 半边（预构建单文件 bundle）
src/service.ts  插件入口：inject / Config / 工具注册 / skill / webServer 挂载
test/           keyless 契约测试 + 真模型 e2e 评测
docs/           项目文档（ADR / specs / 手测指南）
```

## 安装

```sh
pnpm dsh plugin --profile web add /path/to/dsh-notes-kanban/dsh
pnpm dsh --profile web --dump-config | grep -A4 dsh-notes
```

插件自带的 `cordis.patch.yml` 会配置 `notesDir` 等默认值；具体配置项见 [`dsh/README.md`](dsh/README.md)。

## 开发

```sh
cd dsh
pnpm install
pnpm test          # keyless 契约测试
pnpm test:e2e      # 真模型 soft-invariant 评测（无 key 自动跳过）
pnpm run typecheck && pnpm run build
```

## 文档

- [dsh 插件 README](dsh/README.md)
- [ADR 0005：运行形态决策](docs/adr/0005-runtime-dsh-plugin-typescript.md)
- [ADR 0006：笔记即目录](docs/adr/0006-note-is-a-folder.md)
- [ADR 0007：看板只读 Web 桥](docs/adr/0007-notes-dashboard-readonly-web-bridge.md)
- [ADR 0008：混合呼出](docs/adr/0008-invocation-hybrid-model-and-note-command.md)
- [Spec 0002：整合契约](docs/specs/0002-integration-contract.md)
- [手测指南](docs/manual-testing-guide.md)

## License

[MIT](LICENSE)
