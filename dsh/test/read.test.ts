/**
 * read 契约测试 —— `tests/test_read_note.py` 的移植（oracle 对齐）。
 */

import { mkdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readNote, readNoteRaw } from '../src/core/save.ts'
import { makeNote, makeNotesDir } from './helpers.ts'

describe('readNote（read_note.py 契约）', () => {
  it('read existing returns full markdown (front-matter + body)', () => {
    const dir = makeNotesDir()
    const id = makeNote(dir, { body: 'hello readback' })
    const raw = readNoteRaw(dir.dir, id)
    expect(raw.startsWith('---\n')).toBe(true)
    expect(raw).toContain('hello readback')
  })

  it('structured read emits exactly {id, frontMatter, body}', () => {
    const dir = makeNotesDir()
    const id = makeNote(dir, { title: 'Structured', body: '## section\nprogrammatic body' })
    const out = readNote(dir.dir, id)
    expect(Object.keys(out).sort()).toEqual(['body', 'frontMatter', 'id'])
    expect(out.id).toBe(id)
    expect(out.frontMatter['title']).toBe('Structured')
    expect(out.body).toContain('programmatic body')
  })

  it('read missing fails', () => {
    const dir = makeNotesDir()
    expect(() => readNote(dir.dir, 'absent')).toThrow('note not found')
  })

  it('read a dir without note.md fails', () => {
    const dir = makeNotesDir()
    mkdirSync(dir.join('empty-note'))
    expect(() => readNote(dir.dir, 'empty-note')).toThrow('note not found')
  })

  it('path traversal rejected', () => {
    const dir = makeNotesDir()
    expect(() => readNote(dir.dir, '../../../etc/passwd')).toThrow('escapes notes-dir')
  })
})
