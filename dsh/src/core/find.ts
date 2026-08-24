/**
 * 检索的确定性行为 —— 移植自已退役的 Python 原版主体逻辑（ADR-0005）。
 * 模型只选材料;候选排名永远是这段代码(硬脚本,ADR-0003)。空结果 = 无相关笔记 → 新建。
 *
 * @module mytool-dsh-notes/core/find
 */

import {
  assertNotesDir,
  extractKeywords,
  iterNotes,
  noteSummary,
  scoreNote,
  titleKeywordHits,
  type NoteSummaryRow,
} from './notelib.ts'

/** 召回用途的默认条数(不是浏览视图,list_recent 才是)。 */
export const FIND_DEFAULT_LIMIT = 5

/** strong 判定默认阈值(spec 0002 条目 4;Config 可调)≈ 至少两个关键词族命中。 */
export const STRONG_SCORE_THRESHOLD = 15

export type CandidateGrade = 'strong' | 'weak'

export interface NoteCandidate extends NoteSummaryRow {
  score: number
  /** strong = score ≥ 阈值或 ≥2 个关键词命中标题;其余入围者 weak。advisory——判定仍在模型+对话。 */
  grade: CandidateGrade
}

/**
 * 给材料找并入候选:关键词加权排名,score>0 才入围,并按 spec 0002 条目 4 分级。
 *
 * 排序确定性:score desc → updated_at desc(字符串比较,与 Python 版一致)→ id asc,
 * 以稳定多趟排序实现(最次关键字先排)。空/纯空白材料抛错(与 read_text_source 同语义)。
 */
export function findCandidates(
  notesDir: string,
  material: string,
  limit = FIND_DEFAULT_LIMIT,
  strongScoreThreshold = STRONG_SCORE_THRESHOLD,
): NoteCandidate[] {
  assertNotesDir(notesDir)
  if (!material.trim()) throw new Error('error: material is empty')

  const keywords = extractKeywords(material)

  const candidates: NoteCandidate[] = []
  for (const { id, path, frontMatter, body } of iterNotes(notesDir)) {
    const score = scoreNote(keywords, frontMatter, body)
    if (score <= 0) continue
    const strong = score >= strongScoreThreshold || titleKeywordHits(keywords, frontMatter) >= 2
    candidates.push({ ...noteSummary(id, path, frontMatter, body), score, grade: strong ? 'strong' : 'weak' })
  }

  candidates.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) // id asc
  candidates.sort((a, b) => (a.updated_at > b.updated_at ? -1 : a.updated_at < b.updated_at ? 1 : 0)) // updated_at desc
  candidates.sort((a, b) => b.score - a.score) // score desc
  return candidates.slice(0, Math.max(0, limit))
}
