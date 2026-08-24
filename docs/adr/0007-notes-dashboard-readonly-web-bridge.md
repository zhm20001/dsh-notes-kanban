---
status: accepted
date: 2026-08-24
---

# 看板：只读人类读档界面 + webServer JSON 桥

看板（CONTEXT.md：沉淀引擎的人类读档界面）作为 `mytool-dsh-notes` 的浏览器半边落地：`sidebar.footer.action` 入口按钮 + Modal 弹窗，数据经 host 侧 `ctx.webServer` 的同源 JSON 路由（`GET /mytool/notes` 列表、`GET /mytool/notes/:id` 详情）获取。看板**只读**——存档与整合仍走模型侧工具（ADR 0003 分工的延伸），列表语义完全复用 `listRecent`（流程D）。

## Considered Options

- **Typert Remote（`TypertRemoteService` + `@Remote`，2026-08-18 spark 笔记中的"正规"路线）——否决**：浏览器端不在运行时发现 host 侧新 Service；Remote 装配在 `dsh-api-remotes` 里，那是 dsh 上游仓库**编译期固定**的集合，树外插件（本项目）无法挂入，除非 fork 上游。同源 JSON 路由是树外插件取得浏览器可见数据的正规通道。
- **slash command 人类入口——否决**：命令结果只有文本，核心循环本来就要"材料丢给 agent、由模型判断整合"，人类直连会绕过整合判断。
- **看板内写操作（编辑/存档/恢复按钮）——否决**：同上，写路径必须留在模型侧。
- **独立插件包——否决**：看板只消费 `ctx.notes`，同包双半（`exports["./client"]` + `dsh.client` 声明）少一个安装单元。

## Consequences

- 浏览器 bundle 只允许 require 平台模块表内的外部件（react、cordis、ui-primitives、ui-slots、runtime/client 豁免）；因此 client 半边是**单文件 tsc 构建**（CJS + 手工包 loader 工厂壳），不引入 tsdown/bundler 依赖。
- 列表的展示整形（done 折叠、排序）在 host 路由完成，浏览器半边保持哑渲染——整形逻辑因此可被 vitest 契约测试覆盖。
- 看板与 dsh 自身的 harness 总览是两个项目、互不相交（用户裁决，2026-08-24）。
