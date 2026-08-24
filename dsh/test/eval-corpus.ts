/**
 * 整合评测语料（ticket 09）。三条案例均取自 mytool dsh 移植期间的真实
 * 材料/踩坑（React hooks 冒烟材料、pnpm 工作区配置矛盾、TS 类型边界），
 * 不是编造的玩具文本。日常使用中遇到新的真实整合场景，就往这里加案例：
 * 语料越长，软不变量评测的分辨力越强。
 *
 * @module mytool-dsh-notes/test/eval-corpus
 */

import type { NoteStatus } from '../src/core/notelib.ts'

export interface EvalFixture {
  /** 案例名（测试标题用）。 */
  name: string
  /** 既有笔记种子（经 core saveNote 落盘，不经过模型）。 */
  seed: {
    title: string
    tags: string[]
    status: NoteStatus
    body: string
  }
  /** 并入的新材料。 */
  material: string
  /** 材料来源（front-matter source 单值 + 正文列表的来源标注）。 */
  source: string
  /** 要点 token：整合后正文必须可检出（小写比较，检「在」不检措辞）。 */
  keypoints: string[]
  /** 夹具是否蓄意携带与既有笔记矛盾的断言。 */
  plantsContradiction: boolean
}

export const CORPUS: readonly EvalFixture[] = [
  {
    name: 'hooks 踩坑并入学习笔记',
    seed: {
      title: 'React hooks 学习笔记',
      tags: ['react', 'hooks'],
      status: 'active',
      body: [
        '# React hooks 学习笔记',
        '',
        '## useEffect 基础',
        '副作用写在 effect 里，返回的函数在卸载与下次执行前做清理。',
        '',
        '## useState 基础',
        '状态更新触发重渲染；函数式更新 setX(x => x + 1) 避免读到过期值。',
      ].join('\n'),
    },
    material: [
      '今天调试一个死循环，踩了两个坑：',
      '一是 useEffect 的回调里读了 state，但依赖数组没写全，effect 每次渲染都重跑，页面卡死。',
      '二是 cleanup 忘了写，定时器越积越多。',
      '结论：依赖数组要如实列出全部响应式引用；有订阅/定时器必须返回清理函数。',
    ].join('\n'),
    source: '个人踩坑',
    keypoints: ['依赖数组', '清理函数', 'useeffect', '定时器'],
    plantsContradiction: false,
  },
  {
    name: 'pnpm 配置矛盾须显式保留',
    seed: {
      title: 'pnpm 工作区实践',
      tags: ['pnpm', '工程化'],
      status: 'active',
      body: [
        '# pnpm 工作区实践',
        '',
        '## 允许构建脚本',
        '只信官方二进制镜像后，esbuild 这类依赖需要在根 package.json 的 pnpm 字段里写 allowedBuilds 放行。',
      ].join('\n'),
    },
    material: [
      '今天在新机器装依赖，esbuild 的 postinstall 一直被拦截，按笔记改 package.json 的 pnpm.allowedBuilds 还是没用。',
      '翻 issue 才发现：pnpm v11 起这个配置搬家了，要写在 pnpm-workspace.yaml 的 allowBuilds 字段里；旧位置不再生效。',
      '这跟笔记里的说法直接冲突，实测以 pnpm-workspace.yaml 为准。',
    ].join('\n'),
    source: '个人踩坑',
    keypoints: ['pnpm-workspace.yaml', 'allowbuilds', 'esbuild'],
    plantsContradiction: true,
  },
  {
    name: 'TS 类型边界并入踩坑笔记（标签治理）',
    seed: {
      title: 'TypeScript 踩坑',
      tags: ['typescript', '类型'],
      status: 'spark',
      body: [
        '# TypeScript 踩坑',
        '',
        '- strict 下 noImplicitAny 报错时，先看是不是缺了泛型约束。',
        '- 字面量 union 的收窄用 switch + assertNever，别用 if 链。',
      ].join('\n'),
    },
    material: [
      '给工具返回值标类型时撞了个奇怪的 TS2322：明明字段都对，就是不能赋给 JsonValue。',
      '查了才知道：interface 没有隐式 index signature，type alias 的对象字面量类型才有。',
      '把 interface 改成 type alias 立刻就过了——「类型上不该错的类型错误」先想结构性差异，别急着 as。',
    ].join('\n'),
    source: '个人踩坑',
    keypoints: ['interface', 'type alias', 'index signature'],
    plantsContradiction: false,
  },
]
