/**
 * save 契约测试 —— `tests/test_save_note.py` 的移植（oracle 对齐），已随 ADR-0006
 * 目录化：断言对象是文件系统状态（笔记目录 + note.md + note.md.bak）与返回 JSON。
 * CLI 的 file/stdin 输入源在工具形态下不存在,等价改为空值拒绝断言。直接打 core
 * 纯函数（NotesService.save 只是委托,经 headless 冒烟覆盖）。
 */

import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { makeNoteDirName } from '../src/core/notelib.ts'
import { saveNote } from '../src/core/save.ts'
import { makeNote, makeNotesDir, parseNote } from './helpers.ts'

describe('saveNote（save_note.py 契约 · 目录版）', () => {
  it('new note creates a note dir with note.md carrying required frontmatter', () => {
    const dir = makeNotesDir()
    const out = saveNote(dir.dir, { title: 'Quick spark', tags: ['idea', 'writing'], body: 'A half-formed thought about note tools.' })

    expect(statSync(dir.join(out.id)).isDirectory()).toBe(true)
    expect(out.bak).toBeNull()
    expect(out.path).toBe(dir.doc(out.id))

    const { fm, body } = parseNote(dir.doc(out.id))
    expect(fm['title']).toBe('Quick spark')
    expect(fm['tags']).toEqual(['idea', 'writing'])
    expect(fm['status']).toBe('spark')
    const updated = new Date(String(fm['updated_at']))
    expect(Math.abs(Date.now() - updated.getTime())).toBeLessThan(60_000)
    expect(body).toContain('A half-formed thought about note tools.')
  })

  it('new note leaves no tmp and no bak', () => {
    const dir = makeNotesDir()
    const out = saveNote(dir.dir, { title: 'T', body: 'body' })
    expect(readdirSync(dir.dir)).toEqual([out.id])
    expect(readdirSync(dir.join(out.id))).toEqual(['note.md'])
  })

  it('tags default empty and custom status', () => {
    const dir = makeNotesDir()
    const out = saveNote(dir.dir, { title: 'No tags', status: 'active', body: 'x' })
    const { fm } = parseNote(dir.doc(out.id))
    expect(fm['tags']).toEqual([])
    expect(fm['status']).toBe('active')
  })

  it('blank title or body fails', () => {
    const dir = makeNotesDir()
    expect(() => saveNote(dir.dir, { title: '   ', body: 'x' })).toThrow('title is empty')
    expect(() => saveNote(dir.dir, { title: 'T', body: ' \n ' })).toThrow('body is empty')
  })

  it('two saves same second produce distinct note dirs', () => {
    const dir = makeNotesDir()
    const a = saveNote(dir.dir, { title: 'Same', body: 'one' })
    const b = saveNote(dir.dir, { title: 'Same', body: 'two' })
    expect(a.id).not.toBe(b.id)
  })

  it('update creates in-dir bak holding previous content; id stable', () => {
    const dir = makeNotesDir()
    const created = saveNote(dir.dir, { title: 'Growable', body: 'original body' })
    const noteId = created.id
    expect(created.bak).toBeNull()

    const updated = saveNote(dir.dir, { title: 'Growable', id: noteId, body: 'integrated and rewritten body' })
    expect(updated.id).toBe(noteId)
    expect(updated.bak).toBe('note.md.bak')
    expect(updated.path).toBe(dir.doc(noteId))

    const bak = parseNote(dir.join(noteId, 'note.md.bak'))
    expect(bak.body).toContain('original body')
    const live = parseNote(dir.doc(noteId))
    expect(live.body).toContain('integrated and rewritten body')
    expect(live.body).not.toContain('original body')
  })

  it('update rewrites only note.md; sibling files in the note dir are untouched', () => {
    const dir = makeNotesDir()
    const created = saveNote(dir.dir, { title: 'Asset holder', body: 'v1' })
    const noteId = created.id
    mkdirSync(dir.join(noteId, 'assets'))
    writeFileSync(dir.join(noteId, 'assets', 'diagram.png'), 'binary-ish bytes')
    writeFileSync(dir.join(noteId, 'research.md'), 'extra doc')

    saveNote(dir.dir, { title: 'Asset holder', id: noteId, body: 'v2' })

    expect(existsSync(dir.join(noteId, 'assets', 'diagram.png'))).toBe(true)
    expect(existsSync(dir.join(noteId, 'research.md'))).toBe(true)
    expect(parseNote(dir.doc(noteId)).body).toContain('v2')
  })

  it('source lands in front-matter; absent when omitted', () => {
    const dir = makeNotesDir()
    const withSource = saveNote(dir.dir, { title: 'S', body: 'x', source: 'React docs · hooks' })
    expect(parseNote(dir.doc(withSource.id)).fm['source']).toBe('React docs · hooks')
    const without = saveNote(dir.dir, { title: 'S2', body: 'x' })
    expect(parseNote(dir.doc(without.id)).fm['source']).toBeUndefined()
  })

  it('dir-name slug is sanitized', () => {
    const dir = makeNotesDir()
    const out = saveNote(dir.dir, { title: 'Spaced / unsafe: title?', body: 'x' })
    for (const bad of ['/', '\\', ':', '*', '?', '"', '<', '>', '|']) {
      expect(out.id).not.toContain(bad)
    }
    expect(out.id).not.toContain('  ')
  })

  it('invalid status fails', () => {
    const dir = makeNotesDir()
    expect(() => saveNote(dir.dir, { title: 'T', body: 'x', status: 'bogus' as never })).toThrow('invalid status')
  })

  // --- spec 0002 裁决落地（2026-08-15）：summary 字段 + maxTags 硬上限 ---

  it('summary lands in front-matter; empty summary is treated as absent', () => {
    const dir = makeNotesDir()
    const withSummary = saveNote(dir.dir, { title: 'S', body: 'x', summary: '一句话摘要' })
    expect(parseNote(dir.doc(withSummary.id)).fm['summary']).toBe('一句话摘要')
    const empty = saveNote(dir.dir, { title: 'S2', body: 'x', summary: '' })
    expect(parseNote(dir.doc(empty.id)).fm['summary']).toBeUndefined()
  })

  it('summary over 200 chars fails', () => {
    const dir = makeNotesDir()
    expect(() => saveNote(dir.dir, { title: 'T', body: 'x', summary: '长'.repeat(201) })).toThrow('summary too long')
  })

  it('too many tags fails; custom maxTags honored', () => {
    const dir = makeNotesDir()
    expect(() => saveNote(dir.dir, { title: 'T', body: 'x', tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })).toThrow('too many tags')
    const out = saveNote(dir.dir, { title: 'T2', body: 'x', tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, { maxTags: 7 })
    expect(parseNote(dir.doc(out.id)).fm['tags']).toHaveLength(7)
  })

  it('update nonexistent id fails', () => {
    const dir = makeNotesDir()
    expect(() => saveNote(dir.dir, { title: 'T', id: 'nope', body: 'x' })).toThrow('does not exist')
  })

  it('id path traversal rejected', () => {
    const dir = makeNotesDir()
    expect(() => saveNote(dir.dir, { title: 'T', id: '../evil', body: 'x' })).toThrow('escapes notes-dir')
  })

  it('generated dir name matches the stamp-slug-rand contract', () => {
    const name = makeNoteDirName('Hooks 让函数组件持有状态')
    expect(name).toMatch(/^\d{8}T\d{6}Z-.+-[0-9a-f]{4}$/)
  })

  it('makeNote helper round-trips through the parser', () => {
    const dir = makeNotesDir()
    const id = makeNote(dir, { title: 'Structured', body: '## section\nprogrammatic body' })
    const { fm, body } = parseNote(dir.doc(id))
    expect(fm['title']).toBe('Structured')
    expect(body).toContain('programmatic body')
  })
})
