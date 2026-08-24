/**
 * recent 契约测试 —— `tests/test_list_recent.py` 的移植（oracle 对齐），已随
 * ADR-0006 目录化（一条笔记 = 一个目录，主文档 note.md）。
 * 排序与 stale 判定是代码不是模型;断言列表 JSON。status 无效值在工具形态下
 * 先被参数 enum 拦截,core 层仍显式校验(双保险),这里断言 core 层拒绝。
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { nowIso } from '../src/core/notelib.ts'
import { listRecent } from '../src/core/recent.ts'
import { makeNote, makeNotesDir, writeNote } from './helpers.ts'

/** conftest 的 _days_ago:真实 now 往前 `days` 整天的秒级 ISO-Z 时间戳。 */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

describe('listRecent（list_recent.py 契约 · 目录版）', () => {
  it('empty folder returns empty array', () => {
    const dir = makeNotesDir()
    expect(listRecent(dir.dir)).toEqual([])
  })

  it('sorted by updated_at desc', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'old', { title: 'Oldest', updated_at: '2026-01-01T00:00:00Z', body: 'a' })
    writeNote(dir, 'mid', { title: 'Middle', updated_at: '2026-04-01T00:00:00Z', body: 'b' })
    writeNote(dir, 'new', { title: 'Newest', updated_at: '2026-08-01T00:00:00Z', body: 'c' })
    expect(listRecent(dir.dir).map((n) => n.id)).toEqual(['new', 'mid', 'old'])
  })

  it('tiebreak by id asc', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'b', { title: 'B', updated_at: '2026-05-01T00:00:00Z' })
    writeNote(dir, 'a', { title: 'A', updated_at: '2026-05-01T00:00:00Z' })
    expect(listRecent(dir.dir).map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('stale note marked', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'ancient', { title: 'Old', updated_at: '2020-01-01T00:00:00Z', body: 'x' })
    expect(listRecent(dir.dir)[0]!.stale).toBe(true)
  })

  it('fresh note not stale', () => {
    const dir = makeNotesDir()
    makeNote(dir, { title: 'Fresh', body: 'just now', updated_at: nowIso() })
    expect(listRecent(dir.dir)[0]!.stale).toBe(false)
  })

  it('stale-days threshold controls marking', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'n', { title: 'N', updated_at: daysAgo(10) })
    expect(listRecent(dir.dir, { staleDays: 7 })[0]!.stale).toBe(true)
    expect(listRecent(dir.dir, { staleDays: 30 })[0]!.stale).toBe(false)
  })

  it('stale boundary is inclusive', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'n', { title: 'N', updated_at: daysAgo(14) })
    expect(listRecent(dir.dir, { staleDays: 14 })[0]!.stale).toBe(true)
  })

  it('age_days is non-negative int and monotonic', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'old', { title: 'Old', updated_at: daysAgo(100), body: 'x' })
    const newId = makeNote(dir, { title: 'New', body: 'fresh', updated_at: nowIso() })
    const byId = new Map(listRecent(dir.dir).map((n) => [n.id, n]))
    for (const n of byId.values()) {
      expect(Number.isInteger(n.age_days)).toBe(true)
      expect(n.age_days!).toBeGreaterThanOrEqual(0)
    }
    expect(byId.get('old')!.age_days!).toBeGreaterThan(byId.get(newId)!.age_days!)
  })

  it('limit caps results', () => {
    const dir = makeNotesDir()
    for (let i = 0; i < 5; i++) {
      writeNote(dir, `n${i}`, { title: `N${i}`, updated_at: `2026-0${i + 1}-01T00:00:00Z` })
    }
    expect(listRecent(dir.dir, { limit: 3 })).toHaveLength(3)
  })

  it('default limit is ten', () => {
    const dir = makeNotesDir()
    for (let i = 0; i < 12; i++) {
      writeNote(dir, `n${String(i).padStart(2, '0')}`, {
        title: `N${i}`, updated_at: `2026-${String((i % 12) + 1).padStart(2, '0')}-01T00:00:00Z`,
      })
    }
    expect(listRecent(dir.dir)).toHaveLength(10)
  })

  it('output json shape', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'a', {
      title: 'React', tags: ['frontend'], status: 'active',
      updated_at: '2026-03-01T00:00:00Z', body: 'hooks and fibers',
    })
    const ranked = listRecent(dir.dir)
    expect(ranked).toHaveLength(1)
    const item = ranked[0]!
    expect(Object.keys(item).sort()).toEqual(
      ['age_days', 'id', 'path', 'snippet', 'stale', 'status', 'summary', 'tags', 'title', 'updated_at'],
    )
    expect(item.id).toBe('a')
    expect(item.path).toBe(dir.doc('a'))
    expect(item.title).toBe('React')
    expect(item.tags).toEqual(['frontend'])
    expect(item.status).toBe('active')
    expect(item.updated_at).toBe('2026-03-01T00:00:00Z')
    expect(Number.isInteger(item.age_days)).toBe(true)
    expect(typeof item.stale).toBe('boolean')
    expect(item.snippet).toContain('hooks')
  })

  it('row carries front-matter summary, empty when absent', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'with', { title: 'S', updated_at: '2026-08-01T00:00:00Z', body: 'body text' })
    // writeNote 不支持 summary 字段,直写构造
    mkdirSync(dir.join('sum'))
    writeFileSync(
      dir.doc('sum'),
      '---\ntitle: With summary\nstatus: spark\nupdated_at: 2026-08-02T00:00:00Z\nsummary: 一句话摘要\n---\nbody\n',
      'utf8',
    )
    const byId = new Map(listRecent(dir.dir).map((n) => [n.id, n]))
    expect(byId.get('sum')!.summary).toBe('一句话摘要')
    expect(byId.get('with')!.summary).toBe('')
  })

  it('bak files and orphan backup dirs excluded', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'live', { title: 'Live', updated_at: '2026-08-01T00:00:00Z', body: 'x' })
    writeFileSync(
      dir.join('live', 'note.md.bak'),
      '---\ntitle: Old\nstatus: spark\nupdated_at: 2020-01-01T00:00:00Z\n---\nold\n',
      'utf8',
    )
    mkdirSync(dir.join('orphan_backup'))
    writeFileSync(
      dir.join('orphan_backup', 'note.md.bak'),
      '---\ntitle: Old\nstatus: spark\nupdated_at: 2020-01-01T00:00:00Z\n---\nold\n',
      'utf8',
    )
    expect(listRecent(dir.dir).map((n) => n.id)).toEqual(['live'])
  })

  it('malformed note.md is skipped, not fatal', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'good', { title: 'Good', updated_at: '2026-08-01T00:00:00Z', body: 'x' })
    mkdirSync(dir.join('broken'))
    writeFileSync(dir.doc('broken'), '---\ntitle: [unclosed\n  bad: : yaml\n---\nx\n', 'utf8')
    expect(listRecent(dir.dir).map((n) => n.id)).toEqual(['good'])
  })

  it('stray top-level files ignored', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'a', { title: 'A', updated_at: '2026-08-01T00:00:00Z' })
    writeFileSync(dir.join('notes.txt'), 'react react react', 'utf8')
    writeFileSync(dir.join('.gitkeep'), '', 'utf8')
    expect(listRecent(dir.dir).map((n) => n.id)).toEqual(['a'])
  })

  it('hidden dirs (e.g. .git) ignored', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'a', { title: 'A', updated_at: '2026-08-01T00:00:00Z' })
    mkdirSync(dir.join('.git'))
    writeFileSync(
      dir.join('.git', 'note.md'),
      '---\ntitle: B\nstatus: spark\nupdated_at: 2026-01-01T00:00:00Z\n---\nx\n',
      'utf8',
    )
    expect(listRecent(dir.dir).map((n) => n.id)).toEqual(['a'])
  })

  it('deterministic ordering', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'a', { title: 'A', updated_at: '2026-08-01T00:00:00Z', body: 'x' })
    writeNote(dir, 'b', { title: 'B', updated_at: '2026-07-01T00:00:00Z', body: 'y' })
    expect(listRecent(dir.dir).map((n) => n.id)).toEqual(listRecent(dir.dir).map((n) => n.id))
  })

  it('notes dir not a directory fails', () => {
    const dir = makeNotesDir()
    expect(() => listRecent(dir.join('nope'))).toThrow('notes-dir is not a directory')
  })

  it('undated note is included, not skipped', () => {
    // front-matter 可解析但无 updated_at = 违反 save 契约的笔记:沉底、标记风险、
    // 年龄未知;不跳过(区别于坏 YAML),同一切低近位置笔记一样受 limit 约束。
    const dir = makeNotesDir()
    writeNote(dir, 'dated', { title: 'Dated', updated_at: '2026-08-01T00:00:00Z', body: 'x' })
    mkdirSync(dir.join('undated'))
    writeFileSync(dir.doc('undated'), '---\ntitle: No Date\nstatus: spark\n---\nbody text\n', 'utf8')
    const ranked = listRecent(dir.dir)
    expect(ranked.map((n) => n.id)).toEqual(['dated', 'undated'])
    expect(ranked.at(-1)!.age_days).toBeNull()
    expect(ranked.at(-1)!.stale).toBe(true)
  })

  // --- status 过滤(ticket 04:最近视图区分进行中 vs 已完成) ---

  it('status filter shows only matching', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'a', { title: 'A', status: 'active', updated_at: '2026-08-01T00:00:00Z' })
    writeNote(dir, 'd', { title: 'D', status: 'done', updated_at: '2026-08-02T00:00:00Z' })
    expect(listRecent(dir.dir, { status: ['active'] }).map((n) => n.id)).toEqual(['a'])
  })

  it('status filter accepts multiple values', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'a', { title: 'A', status: 'spark', updated_at: '2026-08-01T00:00:00Z' })
    writeNote(dir, 'b', { title: 'B', status: 'active', updated_at: '2026-08-02T00:00:00Z' })
    writeNote(dir, 'd', { title: 'D', status: 'done', updated_at: '2026-08-03T00:00:00Z' })
    expect(listRecent(dir.dir, { status: ['spark', 'active'] }).map((n) => n.id)).toEqual(['b', 'a'])
  })

  it('status filter no matches returns empty', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'a', { title: 'A', status: 'active', updated_at: '2026-08-01T00:00:00Z' })
    expect(listRecent(dir.dir, { status: ['done'] })).toEqual([])
  })

  it('status filter invalid value fails', () => {
    const dir = makeNotesDir()
    expect(() => listRecent(dir.dir, { status: ['bogus'] })).toThrow('invalid status')
  })

  it('status filter combines with limit', () => {
    const dir = makeNotesDir()
    for (let i = 0; i < 5; i++) {
      writeNote(dir, `n${i}`, {
        title: `N${i}`, status: 'active', updated_at: `2026-0${i + 1}-01T00:00:00Z`,
      })
    }
    writeNote(dir, 'done', { title: 'Done', status: 'done', updated_at: '2026-12-01T00:00:00Z' })
    const ranked = listRecent(dir.dir, { status: ['active'], limit: 2 })
    expect(ranked).toHaveLength(2)
    expect(ranked.every((n) => n.status === 'active')).toBe(true) // done 笔记混不进来
  })

  it('no status filter returns all', () => {
    const dir = makeNotesDir()
    writeNote(dir, 'a', { title: 'A', status: 'active', updated_at: '2026-08-01T00:00:00Z' })
    writeNote(dir, 'd', { title: 'D', status: 'done', updated_at: '2026-08-02T00:00:00Z' })
    expect(listRecent(dir.dir)).toHaveLength(2)
  })
})
