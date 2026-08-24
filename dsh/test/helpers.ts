/**
 * 测试助手 —— 对应 pytest `tests/conftest.py` 的角色：一次性笔记目录、
 * 解析落盘笔记、直接造笔记目录（ADR-0006：一条笔记 = 一个目录，主文档 note.md）。
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeNoteDirName, NOTE_DOC, parseNoteText, serializeNote, type FrontMatter } from '../src/core/notelib.ts'

export interface NoteDir {
  dir: string
  join(...names: string[]): string
  /** 笔记 id → 其主文档 note.md 的全路径。 */
  doc(id: string): string
}

export function makeNotesDir(): NoteDir {
  const dir = mkdtempSync(join(tmpdir(), 'mytool-notes-'))
  return { dir, join: (...names: string[]) => join(dir, ...names), doc: (id: string) => join(dir, id, NOTE_DOC) }
}

/** 解析落盘笔记；等价 conftest 的 parse_note。 */
export function parseNote(path: string): { fm: Record<string, unknown>, body: string } {
  const { frontMatter, body } = parseNoteText(readFileSync(path, 'utf8'))
  return { fm: frontMatter, body }
}

/** conftest 的 make_note：绕过 service 直接写一个最小合法笔记目录。 */
export function makeNote(
  dir: NoteDir,
  opts: { title?: string, body?: string, tags?: string[], status?: string, updated_at?: string } = {},
): string {
  const id = makeNoteDirName(opts.title ?? 'Made')
  const fm: FrontMatter = {
    title: opts.title ?? 'Made',
    tags: opts.tags ?? [],
    status: (opts.status ?? 'spark') as FrontMatter['status'],
    updated_at: opts.updated_at ?? '2026-08-01T00:00:00Z',
  }
  mkdirSync(dir.join(id), { recursive: true })
  writeFileSync(dir.doc(id), serializeNote(fm, opts.body ?? 'made body'), 'utf8')
  return id
}

/** conftest 的 write_note：指定目录名直写受控 front-matter（需要确定性 updated_at 排序时用）。 */
export function writeNote(
  dir: NoteDir,
  name: string,
  opts: { title?: string, tags?: string[], status?: string, updated_at?: string, body?: string } = {},
): string {
  const fm: FrontMatter = {
    title: opts.title ?? 'Untitled',
    tags: opts.tags ?? [],
    status: (opts.status ?? 'spark') as FrontMatter['status'],
    updated_at: opts.updated_at ?? '2026-01-01T00:00:00Z',
  }
  mkdirSync(dir.join(name), { recursive: true })
  const path = dir.doc(name)
  writeFileSync(path, serializeNote(fm, opts.body ?? ''), 'utf8')
  return path
}
