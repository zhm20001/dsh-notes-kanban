/**
 * 最近视图的确定性行为 —— 移植自已退役的 Python 原版主体逻辑（ADR-0005）。
 * "打开工具看见我在跟什么"的那一半:updated_at 倒序 + stale(遗忘风险)标记。
 * 排序与 stale 判定永远是这段代码;模型只负责把结果渲染成 markdown。
 *
 * @module mytool-dsh-notes/core/recent
 */

import { assertNotesDir, DEFAULT_STALE_DAYS, iterNotes, noteSummary, parseTimestampMs, VALID_STATUSES, type NoteSummaryRow } from './notelib.ts'

/** 浏览友好默认:比 find_candidates 的召回 5 多,这是"最近在干嘛"的浏览视图。 */
export const RECENT_DEFAULT_LIMIT = 10

/** 比一切可解析时间戳都早:updated_at 缺失/不可解析的笔记沉底并标记风险,不跳过。 */
const UNDATED_MS = -8640000000000000

export interface NoteRecentRow extends NoteSummaryRow {
  age_days: number | null
  stale: boolean
}

export interface ListRecentOptions {
  limit?: number
  staleDays?: number
  /** 只看这些生命周期状态;给定但为空数组时无笔记能通过(与 Python `--status ''` 同语义)。 */
  status?: string[]
}

/**
 * 最近视图:updated_at desc → id asc,确定性;超过 staleDays 未触碰 → stale。
 *
 * - status 过滤在排序/截断**之前**(limit 计数落在过滤后的集合内)。
 * - updated_at 不可解析的笔记不跳过:沉底、age_days=null、stale=true,让完整列表
 *   仍能暴露它;同一切低近位置笔记一样受 limit 约束。
 */
export function listRecent(notesDir: string, opts: ListRecentOptions = {}): NoteRecentRow[] {
  assertNotesDir(notesDir)

  let statusFilter: Set<string> | null = null
  if (opts.status !== undefined) {
    const wanted = opts.status.map((s) => s.trim()).filter((s) => s !== '')
    const bad = wanted.filter((s) => !VALID_STATUSES.includes(s as never))
    if (bad.length > 0) {
      throw new Error(`error: invalid status: ${bad.join(', ')} (valid: ${VALID_STATUSES.join(', ')})`)
    }
    statusFilter = new Set(wanted)
  }

  const now = Date.now()
  const thresholdMs = Math.max(0, opts.staleDays ?? DEFAULT_STALE_DAYS) * 86400000

  const rows: (NoteRecentRow & { _updated: number })[] = []
  for (const { id, path, frontMatter, body } of iterNotes(notesDir)) {
    const updatedRaw = String(frontMatter['updated_at'] ?? '')
    let updated: number
    let ageDays: number | null
    let stale: boolean
    try {
      updated = parseTimestampMs(updatedRaw)
      const deltaMs = now - updated
      ageDays = Math.max(0, Math.floor(deltaMs / 86400000))
      stale = deltaMs >= thresholdMs
    } catch {
      // front-matter 可解析但 updated_at 缺失/非法 = 违反 save_note 契约的笔记。
      // 不跳过(区别于 iterNotes 丢弃的坏 YAML):沉底、标记风险、年龄未知。
      updated = UNDATED_MS
      ageDays = null
      stale = true
    }
    rows.push({ ...noteSummary(id, path, frontMatter, body), age_days: ageDays, stale, _updated: updated })
  }

  const filtered = statusFilter === null ? rows : rows.filter((r) => statusFilter.has(r.status))

  filtered.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) // id asc
  filtered.sort((a, b) => b._updated - a._updated) // updated_at desc
  return filtered.slice(0, Math.max(0, opts.limit ?? RECENT_DEFAULT_LIMIT)).map(({ _updated, ...row }) => row)
}
