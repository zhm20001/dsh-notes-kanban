/**
 * restore 契约测试 —— `tests/test_restore_note.py` 的移植（oracle 对齐），已随
 * ADR-0006 目录化：live = <id>/note.md，.bak = <id>/note.md.bak（目录内兄弟文件）。
 * 断言文件夹状态而非内部函数。核心语义:非破坏性互换 live ↔ .bak(被回滚掉的
 * 版本停进 .bak,回滚可逆),还原内容逐字回来(含 updated_at)。
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { restoreNote } from '../src/core/restore.ts'
import { saveNote } from '../src/core/save.ts'
import { makeNote, makeNotesDir, parseNote } from './helpers.ts'

/** 一次"坏整合":saveNote --id 更新(即待回滚的版本)。 */
function mergeTo(dir: string, noteId: string, body: string): void {
  saveNote(dir, { title: 'T', id: noteId, body })
}

describe('restoreNote（restore_note.py 契约 · 目录版）', () => {
  it('restore brings back previous version', () => {
    const dir = makeNotesDir()
    const noteId = makeNote(dir, { title: 'Note', body: 'original good body' })
    mergeTo(dir.dir, noteId, 'BAD integrated body')
    expect(parseNote(dir.doc(noteId)).body).toContain('BAD integrated body') // 坏整合已占住 live

    const out = restoreNote(dir.dir, noteId)
    expect(out.id).toBe(noteId)
    expect(out.restored_from).toBe('note.md.bak')

    const liveAfter = parseNote(dir.doc(noteId)).body
    expect(liveAfter).toContain('original good body')
    expect(liveAfter).not.toContain('BAD integrated body')
  })

  it('restore is non-destructive: bak holds rolled-back version', () => {
    const dir = makeNotesDir()
    const noteId = makeNote(dir, { title: 'Note', body: 'original good body' })
    mergeTo(dir.dir, noteId, 'BAD integrated body')

    restoreNote(dir.dir, noteId)

    // 被回滚掉的版本在 .bak 里可找回(数据从不丢失)
    expect(parseNote(dir.join(noteId, 'note.md.bak')).body).toContain('BAD integrated body')
  })

  it('restore is reversible: second restore swaps back', () => {
    const dir = makeNotesDir()
    const noteId = makeNote(dir, { title: 'Note', body: 'original good body' })
    mergeTo(dir.dir, noteId, 'BAD integrated body')

    restoreNote(dir.dir, noteId) // live → 好版本
    restoreNote(dir.dir, noteId) // live → 坏版本(互换)

    expect(parseNote(dir.doc(noteId)).body).toContain('BAD integrated body') // 第二次回滚撤销了第一次
  })

  it('restore preserves bak updated_at verbatim', () => {
    // 回滚是唯一一处 updated_at 刻意反映被还原版本而非"现在":逐字回来。
    const dir = makeNotesDir()
    const noteId = makeNote(dir, { title: 'Note', body: 'v1' })
    const createdUpdatedAt = parseNote(dir.doc(noteId)).fm['updated_at']

    mergeTo(dir.dir, noteId, 'v2 bad')
    expect(parseNote(dir.join(noteId, 'note.md.bak')).fm['updated_at']).toBe(createdUpdatedAt)

    restoreNote(dir.dir, noteId)
    expect(parseNote(dir.doc(noteId)).fm['updated_at']).toBe(createdUpdatedAt) // 逐字还原,不重盖 now
  })

  it('restore without bak fails', () => {
    const dir = makeNotesDir()
    const noteId = makeNote(dir, { title: 'Note', body: 'only version' })
    expect(() => restoreNote(dir.dir, noteId)).toThrow('no .bak to restore from')
  })

  it('restore missing note fails', () => {
    const dir = makeNotesDir()
    expect(() => restoreNote(dir.dir, 'absent')).toThrow('note not found')
  })

  it('restore id path traversal rejected', () => {
    const dir = makeNotesDir()
    expect(() => restoreNote(dir.dir, '../evil')).toThrow('escapes notes-dir')
    expect(existsSync(join(dir.dir, '..', 'evil'))).toBe(false)
  })

  it('restore leaves no tmp files', () => {
    const dir = makeNotesDir()
    const noteId = makeNote(dir, { title: 'Note', body: 'v1' })
    mergeTo(dir.dir, noteId, 'v2')
    restoreNote(dir.dir, noteId)
    expect(readdirSync(dir.dir).filter((n) => n.endsWith('.tmp'))).toEqual([]) // 顶层只有笔记目录
    expect(readdirSync(dir.join(noteId)).filter((n) => n.endsWith('.tmp'))).toEqual([]) // 目录内无残骸
  })
})
