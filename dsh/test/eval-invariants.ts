/**
 * soft-invariant 检查器（ticket 09 / spec 0002 软判断的机器可断言化）。
 *
 * 全部是纯函数、返回违规列表（而非首个违规）：软评测一次跑完给出完整画像，
 * 断言侧只需 `expect(violations).toEqual([])`。检查器自身有无 key 的单测
 * （eval-invariants.test.ts）——评测器必须先于被评测对象可信。
 *
 * @module mytool-dsh-notes/test/eval-invariants
 */

/** 整合后正文中必须可检出的要点 token（小写比较）。 */
export function keypointViolations(body: string, keypoints: readonly string[]): string[] {
  const bodyL = body.toLowerCase()
  return keypoints.filter(k => !bodyL.includes(k.toLowerCase()))
}

/** 断句：句末标点收尾（换行不算句界——折行的长句要按整句检），忽略空串。 */
function sentences(text: string): string[] {
  return text
    .split(/[。！？!?]+/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 0)
}

/** 空白归一后的全文（材料里的折行/多空格不影响逐字判定）。 */
function normalized(text: string): string {
  return text.replace(/\s+/g, ' ')
}

/**
 * 无逐字复制：材料中长度 ≥ minChars 的句子不得原样出现在整合后正文里
 * （要点要在，但要重述——spec 0002 软判断「无逐字重复」）。
 */
export function verbatimCopyViolations(body: string, material: string, minChars = 12): string[] {
  const bodyN = normalized(body)
  return sentences(material)
    .filter(s => s.length >= minChars && bodyN.includes(normalized(s)))
}

/** 矛盾标记：正文里有引用行显式标「矛盾」（模板约定的 `> ⚠️ 矛盾` 块）。 */
export function contradictionMarked(body: string): boolean {
  return body
    .split('\n')
    .some(line => line.trimStart().startsWith('>') && line.includes('矛盾'))
}
