/**
 * 确定性骨架核心 —— 移植自已退役的 Python 原版（ADR-0005 及 git 历史）。
 *
 * 笔记文件夹是语言无关的文件系统契约（ADR-0003/0004/0006）：一条笔记 = 一个目录，
 * 内含 note.md 主文档（YAML front-matter + 正文）与用户自由放置的资产文件。
 * 本模块保持纯函数、无 LLM、无网络；检索（find_candidates）与 recent 段属 ticket 06。
 * 移植语义曾与 pytest 契约逐条对齐（oracle 退役记录见 ADR-0005 追记），现由本包 vitest 契约测试承接。
 */

import { randomBytes } from 'node:crypto'
import { closeSync, fsyncSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

// --- schema ------------------------------------------------------------------

/** 笔记生命周期状态（spec 0001 front-matter schema）。 */
export const VALID_STATUSES = ['spark', 'active', 'dormant', 'done'] as const
export type NoteStatus = (typeof VALID_STATUSES)[number]
export const DEFAULT_STATUS: NoteStatus = 'spark'
/** 主文档名（ADR-0006：一条笔记 = 一个目录，note.md 是工具唯一读写的文件）。 */
export const NOTE_DOC = 'note.md'
/** 写前备份后缀（挂在 note.md 上：`note.md.bak`）。 */
export const BAK_SUFFIX = '.bak'

// --- time --------------------------------------------------------------------

/** UTC now as ISO8601 with a trailing `Z`（如 `2026-08-13T19:45:00Z`）。 */
export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** UTC now as a compact sortable stamp（如 `20260813T194500Z`）for filenames。 */
export function nowStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

// --- text --------------------------------------------------------------------

const UNSAFE = new Set('/\\:*?"<>|')
const SEPARATORS = new Set([...UNSAFE, ...' \t\n\r,.;', '，', '。', '、', '；'])

/**
 * 标题 → 文件系统安全的 slug。
 *
 * 保留字母数字与 CJK；空白/标点/路径危险字符的连续段替换为 `-`；
 * 空结果 → `note`。
 */
export function slugify(title: string): string {
  const out: string[] = []
  for (const ch of title.trim()) {
    out.push(SEPARATORS.has(ch) ? '-' : ch)
  }
  let slug = out.join('')
  slug = slug.replace(/-+/g, '-') // collapse runs of '-'
  slug = slug.replace(/^-+|-+$/g, '') // trim edges
  if (slug.length > 50) slug = slug.slice(0, 50).replace(/-+$/, '')
  return slug || 'note'
}

/**
 * 新笔记的唯一、可排序目录名：`<UTC时间戳>-<slug>-<rand4>`（ADR-0006：笔记单位是目录）。
 *
 * 同秒同标题不碰撞（4 位随机 hex）；目录名即稳定 id，更新不变。
 */
export function makeNoteDirName(title: string): string {
  return `${nowStamp()}-${slugify(title)}-${randomBytes(2).toString('hex')}`
}

// --- front-matter ------------------------------------------------------------

export interface FrontMatter {
  title: string
  tags: string[]
  status: NoteStatus
  updated_at: string
  source?: string
  /** ≤200 字符摘要（spec 0002 条目 3）：integrate 维护，recent-view 优先展示。 */
  summary?: string
}

/** 组装笔记文档：YAML front-matter 块 + 正文（字段按稳定可读顺序输出）。 */
export function serializeNote(frontMatter: FrontMatter, body: string): string {
  const yamlText = stringifyYaml(frontMatter, { lineWidth: 0 })
  return `---\n${yamlText}---\n${body}`
}

/** 拆分笔记文档为（front-matter, body）；非法文档抛错（与 Python 版同语义）。 */
export function parseNoteText(text: string): { frontMatter: Record<string, unknown>, body: string } {
  const lines = text.split('\n')
  if (lines.length === 0 || lines[0]!.trim() !== '---') {
    throw new Error("note does not begin with '---' front-matter")
  }
  const close = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
  if (close === -1) {
    throw new Error("front-matter not closed with a second '---'")
  }
  const frontMatter = parseYaml(lines.slice(1, close).join('\n')) ?? {}
  if (typeof frontMatter !== 'object' || Array.isArray(frontMatter)) {
    throw new Error('front-matter is not a mapping')
  }
  const body = lines.slice(close + 1).join('\n')
  return { frontMatter: frontMatter as Record<string, unknown>, body }
}

// --- io ----------------------------------------------------------------------

/** 原子写：同目录临时文件 → fsync → rename。读者永远看不到半个笔记，崩溃不留残骸。 */
export function atomicWrite(path: string, data: string): void {
  const dir = dirname(path)
  const tmp = join(dir, `.${Math.random().toString(16).slice(2)}.${randomBytes(4).toString('hex')}.tmp`)
  const fd = openSync(tmp, 'wx')
  try {
    writeSync(fd, data, null, 'utf8')
    fsyncSync(fd)
  } catch (err) {
    closeSync(fd)
    try { unlinkSync(tmp) } catch { /* tmp may not exist if openSync itself failed */ }
    throw err
  }
  closeSync(fd)
  try {
    renameSync(tmp, path)
  } catch (err) {
    try { unlinkSync(tmp) } catch { /* rename failure already unlinked or nothing to clean */ }
    throw err
  }
}

/** 原子拷贝（写前 `.bak` 用）。 */
export function atomicCopy(src: string, dst: string): void {
  atomicWrite(dst, readFileSync(src, 'utf8'))
}

/** 解析 `notesDir / noteId` 并拒绝逃逸出 notesDir（防 `../secret` 式路径穿越）。 */
export function safeResolve(notesDir: string, noteId: string): string {
  const base = resolve(notesDir)
  const candidate = resolve(base, noteId)
  if (candidate !== base && !candidate.startsWith(base + sep)) {
    throw new Error(`id escapes notes-dir: '${noteId}'`)
  }
  return candidate
}

/** 各列表入口的公共前置：notesDir 必须是已存在的目录（与 Python 版 SystemExit 同语义）。 */
export function assertNotesDir(notesDir: string): void {
  const st = statSync(notesDir, { throwIfNoEntry: false })
  if (!st?.isDirectory()) throw new Error(`error: notes-dir is not a directory: ${notesDir}`)
}

// --- retrieval（关键词检索 v1 —— 确定性；embedding 是延后升级） ---------------
//
// 检索是硬代码不是 LLM 的活（ADR-0003 / spec 0001）:find_candidates 把原始材料变成
// 确定性的候选排名(title/tag/body 加权),供模型判定"并入/新建"。

/** 字段权重:标题最强,其次显式标签,再是正文提及。 */
export const SCORE_TITLE = 5
export const SCORE_TAG = 3
export const SCORE_BODY = 1
/** 单关键词的正文提及上限:防一篇重复多的笔记刷分。 */
export const SCORE_BODY_CAP = 3

/** 常见到无区分度的词。刻意保持极小且仅 ASCII —— CJK 在 run 层面没有停用词问题。 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'of',
  'to', 'in', 'on', 'at', 'by', 'with', 'from', 'as', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'this', 'that', 'these', 'those', 'it',
  'its', 'they', 'them', 'their', 'we', 'you', 'your', 'our', 'his', 'her',
  'not', 'no', 'can', 'will', 'would', 'could', 'should', 'about', 'into',
  'than', 'too', 'very', 'just', 'also', 'have', 'has', 'had', 'do', 'does',
  'did', 'what', 'which', 'who', 'how', 'when', 'where', 'why', 'there',
  'here', 'out', 'up', 'down', 'over', 'all', 'any', 'some', 'more', 'most',
])

function isCjk(ch: string): boolean {
  const cp = ch.codePointAt(0)!
  return cp >= 0x3400 && cp <= 0x9fff
}

/**
 * 从文本提取确定性检索关键词。
 *
 * - ASCII:长度 ≥3 的字母数字 run,小写化,去停用词。
 * - CJK:每个表意 run 的全部 bigram(无分词器的标准召回法);单字太噪,丢弃。
 *
 * 返回按字母序去重排序 —— 顺序不影响打分,稳定返回只为可复现。
 */
export function extractKeywords(text: string): string[] {
  const found = new Set<string>()
  let asciiRun: string[] = []
  let cjkRun: string[] = []

  const flushAscii = () => {
    if (asciiRun.length > 0) {
      const tok = asciiRun.join('').toLowerCase()
      if (tok.length >= 3 && !STOPWORDS.has(tok)) found.add(tok)
      asciiRun = []
    }
  }
  const flushCjk = () => {
    if (cjkRun.length >= 2) {
      for (let i = 0; i < cjkRun.length - 1; i++) {
        found.add(cjkRun[i]! + cjkRun[i + 1]!)
      }
    }
    cjkRun = []
  }

  for (const ch of text) {
    if (/[\x20-\x7e]/.test(ch) && /[a-zA-Z0-9]/.test(ch)) {
      flushCjk()
      asciiRun.push(ch)
    } else if (isCjk(ch)) {
      flushAscii()
      cjkRun.push(ch)
    } else {
      flushAscii()
      flushCjk()
    }
  }
  flushAscii()
  flushCjk()
  return [...found].sort()
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') return 0
  let count = 0
  let pos = haystack.indexOf(needle)
  while (pos !== -1) {
    count++
    pos = haystack.indexOf(needle, pos + needle.length)
  }
  return count
}

/** 摘要长度上限（spec 0002 条目 3 的硬校验）。 */
export const SUMMARY_MAX_CHARS = 200

/** keywords 命中标题的个数——打分与 strong/weak 分级（spec 0002 条目 4）的公共判据。 */
export function titleKeywordHits(keywords: string[], frontMatter: Record<string, unknown>): number {
  const titleL = String(frontMatter['title'] ?? '').toLowerCase()
  return keywords.filter((kw) => titleL.includes(kw)).length
}

/**
 * 笔记对 keywords 的确定性相关度:小写子串匹配(给 stem 召回,如 react 命中
 * reactivity)—— title 命中 +5、任一 tag 命中 +3、正文每次 +1 封顶 3 次/关键词。
 */
export function scoreNote(keywords: string[], frontMatter: Record<string, unknown>, body: string): number {
  if (keywords.length === 0) return 0
  const tagsL = (Array.isArray(frontMatter['tags']) ? frontMatter['tags'] : []).map((t) => String(t).toLowerCase())
  const bodyL = body.toLowerCase()
  let score = titleKeywordHits(keywords, frontMatter) * SCORE_TITLE
  for (const kw of keywords) {
    if (tagsL.some((t) => t.includes(kw))) score += SCORE_TAG
    const hits = countOccurrences(bodyL, kw)
    if (hits > 0) score += Math.min(hits, SCORE_BODY_CAP) * SCORE_BODY
  }
  return score
}

/** body 的单行预览(空白折叠,截 160 字符)。 */
export function snippet(body: string, width = 160): string {
  const s = body.split(/\s+/).filter(Boolean).join(' ')
  return s.slice(0, width)
}

/** 所有列表脚本对一条笔记的公共摘要字段。 */
export interface NoteSummaryRow {
  id: string
  path: string
  title: string
  tags: string[]
  status: string
  updated_at: string
  /** front-matter 摘要（spec 0002 条目 3）；未提供为空串，展示侧退回 snippet。 */
  summary: string
  snippet: string
}

export function noteSummary(id: string, path: string, frontMatter: Record<string, unknown>, body: string): NoteSummaryRow {
  return {
    id,
    path,
    title: String(frontMatter['title'] ?? ''),
    tags: Array.isArray(frontMatter['tags']) ? frontMatter['tags'].map((t) => String(t)) : [],
    status: String(frontMatter['status'] ?? ''),
    updated_at: String(frontMatter['updated_at'] ?? ''),
    summary: String(frontMatter['summary'] ?? ''),
    snippet: snippet(body),
  }
}

/** id = 笔记目录名；path = 其中 note.md 的全路径（正文/front-matter 均来自主文档）。 */
export interface NoteFile {
  id: string
  path: string
  frontMatter: Record<string, unknown>
  body: string
}

/**
 * 遍历 notesDir 的所有笔记目录（ADR-0006：一条笔记 = 一个目录，读其中的 note.md）。
 *
 * 只认含合法 note.md 的顶层目录；隐藏目录（如 `.git`）、普通文件、无 note.md 或
 * front-matter 非法（缺失/未闭合、YAML 不可解析）的杂散目录跳过而非中止 —— 检索
 * 必须对杂散内容健壮。目录不存在返回空(与 Python 版 iterdir 抛错不同:由 caller 显式检查)。
 */
export function iterNotes(notesDir: string): NoteFile[] {
  let entries: string[]
  try {
    entries = readdirSync(notesDir)
  } catch {
    return []
  }
  const notes: NoteFile[] = []
  for (const name of entries.sort()) {
    if (name.startsWith('.')) continue // .git 等隐藏目录/文件不是笔记
    const path = join(notesDir, name)
    let stat
    try {
      stat = statSync(path)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue
    const doc = join(path, NOTE_DOC)
    try {
      const text = readFileSync(doc, 'utf8')
      const { frontMatter, body } = parseNoteText(text)
      notes.push({ id: name, path: doc, frontMatter, body })
    } catch {
      // 杂散/非法 markdown:跳过,检索不因它中止(与 Python 版的 ValueError/YAMLError/OSError 同语义)
      continue
    }
  }
  return notes
}

// --- recent(list_recent 的原语) ----------------------------------------------

/** 超过这么多天未触碰 → stale(遗忘风险);`list_recent --stale-days` 可调。 */
export const DEFAULT_STALE_DAYS = 30

/**
 * 解析 ISO8601 时间戳(允许尾缀 `Z`)为 UTC 毫秒;无时区偏移视为 UTC(与 Python 版
 * 一致;裸 `new Date()` 会当本地时区,这里显式归一)。非法值抛错。
 */
export function parseTimestampMs(value: string): number {
  const normalized = /[+-]\d{2}:?\d{2}$/.test(value) || value.endsWith('Z')
    ? value
    : value + 'Z'
  const ms = Date.parse(normalized)
  if (Number.isNaN(ms)) throw new Error(`invalid timestamp: ${value}`)
  return ms
}
