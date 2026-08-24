/**
 * integrate 契约测试 —— spec 0002 的模板（条目 2）与输出 JSON 契约。
 * prompt/parse 是纯函数直接测;LLM 管线本体(ctx.llm 直调、deadline、diff 呈现)
 * 不做 mock 单测——真跑归 headless 冒烟与 ticket 09 评测(无 fake ctx 的纪律同 save/read)。
 */

import { describe, expect, it } from 'vitest'
import { buildIntegrationPrompt, PROMPT_VERSION } from '../src/integrate/prompt.ts'
import { parseIntegrationOutput } from '../src/integrate/parse.ts'

const VALID = JSON.stringify({
  title: '整合后的标题',
  tags: ['react', 'hooks'],
  summary: '一句话摘要',
  body: '重写后的正文',
  proposed_status: null,
  contradictions_flagged: false,
})

describe('buildIntegrationPrompt（spec 0002 条目 2）', () => {
  it('embeds note, material, source and governance params', () => {
    const { system, user } = buildIntegrationPrompt({
      noteMarkdown: '---\ntitle: 旧\n---\n旧正文',
      material: '新材料内容',
      source: 'React docs · hooks',
      maxTags: 6,
      summaryMaxChars: 200,
    })
    expect(system).toContain('去重 + 总结 + 体系化')
    expect(system).toContain('矛盾（存疑）')
    expect(system).toContain('总数 ≤ 6')
    expect(system).toContain('≤ 200 字符')
    expect(system).toContain('proposed_status')
    expect(user).toContain('<existing-note>')
    expect(user).toContain('旧正文')
    expect(user).toContain('<new-material>')
    expect(user).toContain('新材料内容')
    expect(user).toContain('本材料来源：React docs · hooks')
  })

  it('omits the source line when absent', () => {
    const { user } = buildIntegrationPrompt({ noteMarkdown: 'n', material: 'm', maxTags: 6, summaryMaxChars: 200 })
    expect(user).not.toContain('本材料来源')
  })

  it('prompt version is pinned', () => {
    expect(PROMPT_VERSION).toBe(1)
  })
})

describe('parseIntegrationOutput（输出 JSON 契约）', () => {
  it('accepts a valid payload', () => {
    const out = parseIntegrationOutput(VALID, { maxTags: 6 })
    expect(out.title).toBe('整合后的标题')
    expect(out.tags).toEqual(['react', 'hooks'])
    expect(out.proposed_status).toBeNull()
    expect(out.contradictions_flagged).toBe(false)
  })

  it('accepts a status proposal and contradiction flag', () => {
    const out = parseIntegrationOutput(JSON.stringify({
      title: 't', tags: [], summary: 's', body: 'b',
      proposed_status: 'active', contradictions_flagged: true,
    }), { maxTags: 6 })
    expect(out.proposed_status).toBe('active')
    expect(out.contradictions_flagged).toBe(true)
  })

  it('rejects non-JSON and fenced JSON (no field-level normalization)', () => {
    expect(() => parseIntegrationOutput('不是 JSON', { maxTags: 6 })).toThrow('not valid JSON')
    expect(() => parseIntegrationOutput('```json\n' + VALID + '\n```', { maxTags: 6 })).toThrow('not valid JSON')
  })

  it('rejects missing, extra, and non-object payloads', () => {
    const parsed = JSON.parse(VALID) as Record<string, unknown>
    const missing = JSON.stringify({ ...parsed, summary: undefined })
    expect(() => parseIntegrationOutput(missing, { maxTags: 6 })).toThrow('keys are')
    const extra = JSON.stringify({ ...parsed, surprise: 1 })
    expect(() => parseIntegrationOutput(extra, { maxTags: 6 })).toThrow('keys are')
    expect(() => parseIntegrationOutput('[1,2]', { maxTags: 6 })).toThrow('not an object')
    expect(() => parseIntegrationOutput('null', { maxTags: 6 })).toThrow('not an object')
  })

  it('rejects bad field types and values', () => {
    const base = JSON.parse(VALID) as Record<string, unknown>
    const bad = (mutate: (o: Record<string, unknown>) => void) => {
      const o = { ...base }
      mutate(o)
      return JSON.stringify(o)
    }
    expect(() => parseIntegrationOutput(bad((o) => { o['title'] = '' }), { maxTags: 6 })).toThrow('title')
    expect(() => parseIntegrationOutput(bad((o) => { o['body'] = '' }), { maxTags: 6 })).toThrow('body')
    expect(() => parseIntegrationOutput(bad((o) => { o['tags'] = 'react' }), { maxTags: 6 })).toThrow('tags')
    expect(() => parseIntegrationOutput(bad((o) => { o['tags'] = ['a', 2] }), { maxTags: 6 })).toThrow('tags')
    expect(() => parseIntegrationOutput(bad((o) => { o['summary'] = '长'.repeat(201) }), { maxTags: 6 })).toThrow('summary')
    expect(() => parseIntegrationOutput(bad((o) => { o['proposed_status'] = 'bogus' }), { maxTags: 6 })).toThrow('proposed_status')
    expect(() => parseIntegrationOutput(bad((o) => { o['contradictions_flagged'] = 'yes' }), { maxTags: 6 })).toThrow('contradictions_flagged')
  })

  it('enforces the tags cap from config', () => {
    const over = JSON.stringify({ ...JSON.parse(VALID) as Record<string, unknown>, tags: ['a', 'b', 'c', 'd'] })
    expect(() => parseIntegrationOutput(over, { maxTags: 3 })).toThrow('tags length 4 > max 3')
    expect(() => parseIntegrationOutput(over, { maxTags: 4 })).not.toThrow()
  })
})
