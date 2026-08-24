/**
 * find 契约测试 —— `tests/test_find_candidates.py` 的移植（oracle 对齐），已随
 * ADR-0006 目录化（一条笔记 = 一个目录，主文档 note.md）。
 * 确定性关键词排名:断言排名 JSON,不打内部函数。CLI 的 material-file/stdin
 * 输入源在工具形态下不存在(材料就是 string 参数);material 缺失由工具参数
 * schema 的 required 兜底,这里等价断言空白材料在 core 层拒绝。
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findCandidates } from '../src/core/find.ts'
import { readNote } from '../src/core/save.ts'
import { makeNote, makeNotesDir, writeNote } from './helpers.ts'

describe('findCandidates（find_candidates.py 契约 · 目录版）', () => {
  it('empty folder returns empty array', () => {
    const dir = makeNotesDir()
    expect(findCandidates(dir.dir, 'anything')).toEqual([])
  })

  it('no keyword overlap returns empty', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'a', { title: 'Sourdough baking', body: 'flour water salt starter' })
    expect(findCandidates(dir.dir, 'react hooks and components')).toEqual([]) // 无相关 → 新建
  })

  it('title match outranks body match', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'body_only', { title: 'Misc', body: 'everything about react fibers' })
    writeNote(dir, 'title_hit', { title: 'React internals', body: 'general notes' })

    const ranked = findCandidates(dir.dir, 'react')
    expect(ranked.map((c) => c.id)).toEqual(['title_hit', 'body_only'])
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score)
  })

  it('tag match scores', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'tagged', { title: 'Notes', tags: ['typescript'], body: 'nothing relevant here' })
    const ranked = findCandidates(dir.dir, 'typescript')
    expect(ranked).toHaveLength(1)
    expect(ranked[0]!.id).toBe('tagged')
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(3) // SCORE_TAG 权重
  })

  it('body occurrence capped', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'spammy', { title: 'Other', body: 'react '.repeat(20).trim() })
    const ranked = findCandidates(dir.dir, 'react')
    expect(ranked[0]!.score).toBe(3) // 上限 3 次正文命中 × 1,不是 20
  })

  it('bak files and orphan backup dirs excluded', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'live', { title: 'React notes', body: 'react' })
    // 同样提到关键词的陈旧备份绝不能成为候选:iterNotes 只读 note.md
    writeFileSync(
      dir.join('live', 'note.md.bak'),
      '---\ntitle: React notes\nstatus: spark\nupdated_at: 2020-01-01T00:00:00Z\n---\nreact react\n',
      'utf8',
    )
    // 只有 note.md.bak、没有 note.md 的目录(主文档被手删)也不是笔记
    mkdirSync(dir.join('orphan_backup'))
    writeFileSync(
      dir.join('orphan_backup', 'note.md.bak'),
      '---\ntitle: React notes\nstatus: spark\nupdated_at: 2020-01-01T00:00:00Z\n---\nreact react\n',
      'utf8',
    )
    expect(findCandidates(dir.dir, 'react').map((c) => c.id)).toEqual(['live'])
  })

  it('tiebreak by updated_at desc', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'older', { title: 'x react', updated_at: '2026-01-01T00:00:00Z' })
    writeNote(dir, 'newer', { title: 'y react', updated_at: '2026-06-01T00:00:00Z' })
    expect(findCandidates(dir.dir, 'react').map((c) => c.id)).toEqual(['newer', 'older'])
  })

  it('limit caps results', () => {
    const dir = makeNotesDir()
    for (let i = 0; i < 5; i++) {
      writeNote(dir, `n${i}`, { title: `react ${i}`, updated_at: `2026-0${i + 1}-01T00:00:00Z` })
    }
    expect(findCandidates(dir.dir, 'react', 3)).toHaveLength(3)
  })

  it('default limit is five', () => {
    const dir = makeNotesDir()
    for (let i = 0; i < 7; i++) writeNote(dir, `n${i}`, { title: `react ${i}` })
    expect(findCandidates(dir.dir, 'react')).toHaveLength(5)
  })

  it('output json shape', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'a', {
      title: 'React', tags: ['frontend'], status: 'active',
      updated_at: '2026-03-01T00:00:00Z', body: 'hooks and fibers',
    })
    const ranked = findCandidates(dir.dir, 'react')
    expect(ranked).toHaveLength(1)
    const item = ranked[0]!
    expect(Object.keys(item).sort()).toEqual(
      ['grade', 'id', 'path', 'score', 'snippet', 'status', 'summary', 'tags', 'title', 'updated_at'],
    )
    expect(item.id).toBe('a')
    expect(item.path).toBe(dir.doc('a'))
    expect(item.title).toBe('React')
    expect(item.tags).toEqual(['frontend'])
    expect(item.status).toBe('active')
    expect(item.updated_at).toBe('2026-03-01T00:00:00Z')
    expect(Number.isInteger(item.score)).toBe(true)
    expect(item.score).toBeGreaterThan(0)
    expect(item.snippet).toContain('hooks')
    expect(['strong', 'weak']).toContain(item.grade)
  })

  it('cjk material matches cjk note', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'cn', { title: '笔记整合', body: '把新材料去重总结进既有笔记' })
    const ranked = findCandidates(dir.dir, '我想整理一下笔记整合的思路')
    expect(ranked).toHaveLength(1)
    expect(ranked[0]!.id).toBe('cn')
  })

  it('deterministic ordering', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'a', { title: 'react alpha', body: 'deep react' })
    writeNote(dir, 'b', { title: 'react beta', body: 'shallow' })
    expect(findCandidates(dir.dir, 'react')).toEqual(findCandidates(dir.dir, 'react'))
  })

  it('blank material fails', () => {
    const dir = makeNotesDir()
    expect(() => findCandidates(dir.dir, '   ')).toThrow('material is empty')
  })

  it('stopwords do not match', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'a', { title: 'The Theory', body: 'about something else entirely' })
    expect(findCandidates(dir.dir, 'the about and')).toEqual([])
  })

  it('malformed note.md is skipped, not fatal', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'good', { title: 'react notes', body: 'react hooks' })
    mkdirSync(dir.join('broken'))
    writeFileSync(dir.doc('broken'), '---\ntitle: [unclosed\n  bad: : yaml\n---\nreact react\n', 'utf8')
    expect(findCandidates(dir.dir, 'react').map((c) => c.id)).toEqual(['good'])
  })

  it('stray top-level files ignored', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'a', { title: 'react', body: 'x' })
    writeFileSync(dir.join('notes.txt'), 'react react react', 'utf8')
    writeFileSync(dir.join('loose.md.bak'), '---\ntitle: react\n---\nreact', 'utf8')
    expect(findCandidates(dir.dir, 'react').map((c) => c.id)).toEqual(['a'])
  })

  it('hidden dirs (e.g. .git) ignored', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'a', { title: 'react', body: 'x' })
    mkdirSync(dir.join('.git'))
    writeFileSync(
      dir.join('.git', 'note.md'),
      '---\ntitle: react\nstatus: spark\nupdated_at: 2026-01-01T00:00:00Z\n---\nreact\n',
      'utf8',
    )
    expect(findCandidates(dir.dir, 'react').map((c) => c.id)).toEqual(['a'])
  })

  it('keyword recall then load full note', () => {
    // ticket 03 的"关键词召回任意笔记 → 读档看全貌":find 是入口,read 载入全文。
    const dir = makeNotesDir()
    const noteId = makeNote(dir, { title: 'Rust ownership', body: 'borrow checker rules the lifetime' })
    const found = findCandidates(dir.dir, 'rust borrow')
    expect(found.length).toBeGreaterThan(0)
    expect(found[0]!.id).toBe(noteId)
    const loaded = readNote(dir.dir, noteId)
    expect(loaded.body).toContain('borrow checker')
  })

  // --- strong/weak 分级（spec 0002 条目 4,2026-08-15 裁决） ---

  it('grade: threshold crossing marks strong', () => {
    const dir = makeNotesDir()
    // 两个关键词都命中标题(2×5)+ 正文封顶贡献 → 分数过默认阈值 15
    writeNote(dir, 'hot', { title: 'react rust bridge', body: 'react rust react rust react' })
    // 单关键词弱命中:标题 5 + 正文 1
    writeNote(dir, 'cool', { title: 'react notes', body: 'react' })
    const byId = new Map(findCandidates(dir.dir, 'react rust').map((c) => [c.id, c]))
    expect(byId.get('hot')!.grade).toBe('strong')
    expect(byId.get('cool')!.grade).toBe('weak')
  })

  it('grade: two title keyword hits mark strong even below threshold', () => {
    const dir = makeNotesDir()
    // 2×5=10 < 15,但 ≥2 个关键词命中标题 → strong
    writeNote(dir, 'two', { title: 'react rust', body: '' })
    expect(findCandidates(dir.dir, 'react rust')[0]!.grade).toBe('strong')
  })

  it('grade: threshold is configurable', () => {
    const dir = makeNotesDir()
    // 分数 10;阈值调到 10 → strong,默认 15 → weak
    writeNote(dir, 'edge', { title: 'react rust', body: '' })
    expect(findCandidates(dir.dir, 'react rust', 5, 15)[0]!.grade).toBe('strong') // 阈值 15 下靠 title 双命中
    writeNote(dir, 'one', { title: 'react', body: 'rust' })
    // one: title 5 + body 1 = 6,无第二 title 命中
    const byId = new Map(findCandidates(dir.dir, 'react rust', 5, 10).map((c) => [c.id, c]))
    expect(byId.get('one')!.score).toBe(6)
    expect(byId.get('one')!.grade).toBe('weak')
    const byId2 = new Map(findCandidates(dir.dir, 'react rust', 5, 5).map((c) => [c.id, c]))
    expect(byId2.get('one')!.grade).toBe('strong')
  })
})
