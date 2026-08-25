---
status: accepted
date: 2026-08-24
updated: 2026-08-25
---

# 看板：只读人类读档界面 + webServer JSON 桥

看板（CONTEXT.md：沉淀引擎的人类读档界面）作为 `mytool-dsh-notes` 的浏览器半边落地：`sidebar.footer.action` 入口链接 + **独立页面**（新标签页打开 `/mytool/notes/page`，自包含 HTML，形态对齐 dsh-diary），数据经 host 侧 `ctx.webServer` 的同源 JSON 路由（`GET /mytool/notes` 列表、`GET /mytool/notes/:id` 详情）获取。看板**只读**——存档与整合仍走模型侧工具（ADR 0003 分工的延伸），列表语义完全复用 `listRecent`（流程D）。

## 修订记录

- **2026-08-25（v0.3）：入口形态 Modal → 独立页面**。初版（v0.2）是 React Modal 弹窗；用户反馈弹窗太小、笔记显示不全、排版局促。改为 diary 式独立页：host 直接吐自包含 HTML（零构建 vanilla JS），client 半边只剩一个新标签页链接。连带退役了 tsc→CJS 转换构建链（含其 jsx 别名隐患——v0.2 集成期踩过：别名方向反导致渲染期静默崩溃，被 slot error boundary 吞掉）。JSON API 不变；只读边界不变。

## Considered Options

- **Typert Remote（`TypertRemoteService` + `@Remote`，2026-08-18 spark 笔记中的"正规"路线）——否决**：浏览器端不在运行时发现 host 侧新 Service；Remote 装配在 `dsh-api-remotes` 里，那是 dsh 上游仓库**编译期固定**的集合，树外插件（本项目）无法挂入，除非 fork 上游。同源 JSON 路由是树外插件取得浏览器可见数据的正规通道。
- **slash command 人类入口——否决**：命令结果只有文本，核心循环本来就要"材料丢给 agent、由模型判断整合"，人类直连会绕过整合判断。
- **看板内写操作（编辑/存档/恢复按钮）——否决**：同上，写路径必须留在模型侧。
- **独立插件包——否决**：看板只消费 `ctx.notes`，同包双半（`exports["./client"]` + `dsh.client` 声明）少一个安装单元。

## Consequences

- 浏览器 bundle 只 require 平台模块表词（react、ui-primitives——client 半边 v0.3 起是**预构建单文件** `src/client.js`，无 JSX、无构建链，产物形态对齐 dsh-diary）。
- 看板**页面**本体由 host 渲染（`src/web/page.ts` 的自包含 HTML 字符串，视觉基调取自用户 course.css：纸面米白/衬线/砖红强调）——页面逻辑随 host 走 vitest 契约测试，改页面需重启 `dsh web`。
- 列表的展示整形（done 折叠、排序）在 host 路由完成，页面保持哑渲染——整形逻辑因此可被 vitest 契约测试覆盖。
- 看板与 dsh 自身的 harness 总览是两个项目、互不相交（用户裁决，2026-08-24）。
