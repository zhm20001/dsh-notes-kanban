/**
 * 检查器自身的契约测试（keyless，永远跑）：评测器先于被评测对象可信。
 */

import { describe, expect, it } from 'vitest'
import { contradictionMarked, keypointViolations, verbatimCopyViolations } from './eval-invariants.ts'

describe('keypointViolations', () => {
  it('全在场 → 无违规', () => {
    expect(keypointViolations('闭包与依赖数组决定 effect 行为', ['闭包', '依赖数组'])).toEqual([])
  })

  it('缺失项被列出；比较大小写不敏感', () => {
    expect(keypointViolations('useEffect 的清理', ['useEffect', '闭包'])).toEqual(['闭包'])
    expect(keypointViolations('useEffect 的清理', ['useeffect'])).toEqual([])
  })
})

describe('verbatimCopyViolations', () => {
  const material = [
    '依赖数组遗漏某个响应式值会让 effect 每次渲染都重跑。',
    '短句没事。',
    '闭包会捕获旧值,\n导致读到过期状态。',
  ].join('\n')

  it('整句原样照抄 → 违规（违规项为去句末标点的归一句）', () => {
    const body = `## 踩坑\n- 依赖数组遗漏某个响应式值会让 effect 每次渲染都重跑。\n`
    expect(verbatimCopyViolations(body, material)).toEqual(['依赖数组遗漏某个响应式值会让 effect 每次渲染都重跑'])
  })

  it('重述（换措辞）→ 无违规', () => {
    const body = '## 踩坑\n- 若依赖数组漏列响应式值,effect 将在每次渲染后重复执行。\n'
    expect(verbatimCopyViolations(body, material)).toEqual([])
  })

  it('低于阈值长度的原样片段不算；折行整句归一后命中算', () => {
    expect(verbatimCopyViolations('短句没事。', material)).toEqual([])
    expect(verbatimCopyViolations('注意:闭包会捕获旧值, 导致读到过期状态。', material))
      .toEqual(['闭包会捕获旧值, 导致读到过期状态'])
  })
})

describe('contradictionMarked', () => {
  it('blockquote 矛盾行 → true（含 ⚠️ 模板形态）', () => {
    expect(contradictionMarked('> ⚠️ 矛盾（存疑）：旧结论与新实测冲突。')).toBe(true)
    expect(contradictionMarked('正文。\n  > 矛盾:两说并存。')).toBe(true)
  })

  it('非引用行的普通提及 → false；无矛盾 → false', () => {
    expect(contradictionMarked('这里没有矛盾,只是并列。')).toBe(false)
    expect(contradictionMarked('普通正文。')).toBe(false)
  })
})
