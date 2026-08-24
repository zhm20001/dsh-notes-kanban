/**
 * 存/读的确定性行为 —— 移植自已退役的 Python 原版主体逻辑（ADR-0005）。
 * 笔记单位是目录（ADR-0006）：saveNote 只创建/覆写其中的 note.md，
 * 目录内其余文件（assets 等）永不触碰。
 * 纯函数(入参 notesDir),NotesService 只做委托;契约测试直接打这里。
 *
 * @module mytool-dsh-notes/core/save
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import {
  atomicCopy,
  atomicWrite,
  BAK_SUFFIX,
  DEFAULT_STATUS,
  makeNoteDirName,
  NOTE_DOC,
  nowIso,
  parseNoteText,
  safeResolve,
  serializeNote,
  SUMMARY_MAX_CHARS,
  VALID_STATUSES,
  type FrontMatter,
  type NoteStatus,
} from './notelib.ts'

/** 标签上限默认（spec 0002 条目 7；Config 可调）。 */
export const MAX_TAGS = 6

export interface NoteSaveInput {
  title: string
  tags?: string[]
  status?: NoteStatus
  source?: string
  /** ≤200 字符摘要（spec 0002 条目 3）；空串等同未提供。 */
  summary?: string
  /** 给定 = 更新既有笔记（id 即目录名，稳定不变）；缺省 = 新建。 */
  id?: string
  body: string
}

export interface NoteSaveOptions {
  /** 标签数量硬上限，超限报错（spec 0002 条目 7）。 */
  maxTags?: number
}

export interface NoteSaveResult {
  path: string
  id: string
  bak: string | null
}

/** 存档：原子写一条笔记；更新时先写前 `.bak`。语义与 pytest 契约逐条对齐。 */
export function saveNote(notesDir: string, input: NoteSaveInput, opts: NoteSaveOptions = {}): NoteSaveResult {
  if (!input.title.trim()) throw new Error('error: title is empty')
  if (!input.body.trim()) throw new Error('error: body is empty')
  const status: NoteStatus = input.status ?? DEFAULT_STATUS
  if (!VALID_STATUSES.includes(status)) throw new Error(`error: invalid status: ${status}`)
  const maxTags = opts.maxTags ?? MAX_TAGS
  const tags = input.tags ?? []
  if (tags.length > maxTags) throw new Error(`error: too many tags: ${tags.length} > ${maxTags}`)
  if (input.summary !== undefined && input.summary.length > SUMMARY_MAX_CHARS) {
    throw new Error(`error: summary too long: ${input.summary.length} > ${SUMMARY_MAX_CHARS}`)
  }

  mkdirSync(notesDir, { recursive: true })

  const summary = input.summary ?? ''
  const frontMatter: FrontMatter = {
    title: input.title,
    tags,
    status,
    updated_at: nowIso(),
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(summary !== '' ? { summary } : {}),
  }

  let noteDir: string
  let target: string
  let bakName: string | null
  if (input.id !== undefined) {
    noteDir = safeResolve(notesDir, input.id)
    target = join(noteDir, NOTE_DOC)
    if (!existsSync(target)) throw new Error(`error: note id does not exist (cannot update): ${input.id}`)
    const bak = target + BAK_SUFFIX
    atomicCopy(target, bak)
    bakName = basename(bak)
  } else {
    noteDir = join(notesDir, makeNoteDirName(input.title))
    mkdirSync(noteDir, { recursive: true })
    target = join(noteDir, NOTE_DOC)
    bakName = null
  }

  atomicWrite(target, serializeNote(frontMatter, input.body))
  return { path: target, id: basename(noteDir), bak: bakName }
}

export interface NoteReadResult {
  id: string
  frontMatter: Record<string, JsonValue>
  body: string
}

/** 读档（原始 markdown 文档，即笔记目录内的 note.md）。 */
export function readNoteRaw(notesDir: string, id: string): string {
  const target = join(safeResolve(notesDir, id), NOTE_DOC)
  if (!existsSync(target)) throw new Error(`error: note not found: ${id}`)
  return readFileSync(target, 'utf8')
}

/** 读档（结构化）：整合前读候选全文用。 */
export function readNote(notesDir: string, id: string): NoteReadResult {
  const { frontMatter, body } = parseNoteText(readNoteRaw(notesDir, id))
  // parser 边界:YAML 解析结果收口为 JSON 记录(文件契约保证 front-matter 是标量/列表)。
  return { id, frontMatter: frontMatter as Record<string, JsonValue>, body }
}
