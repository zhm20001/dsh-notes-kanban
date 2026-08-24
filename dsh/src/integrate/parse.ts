/**
 * 整合输出的 JSON 契约校验（spec 0002「输出 JSON 契约」）。
 * 模型输出是校验边界：字段不齐、类型不符、越界一律报错（错得响亮），不做字段级
 * 规整（trim/剥围栏）——失败交给 agent 看到 isError 后重调。
 *
 * @module mytool-dsh-notes/integrate/parse
 */

import { SUMMARY_MAX_CHARS, VALID_STATUSES, type NoteStatus } from '../core/notelib.ts'

export interface IntegrationOutput {
  title: string
  tags: string[]
  summary: string
  body: string
  proposed_status: NoteStatus | null
  contradictions_flagged: boolean
}

export interface ParseOptions {
  /** 标签数量硬上限（spec 0002 条目 7）。 */
  maxTags: number
}

const OUTPUT_KEYS = ['body', 'contradictions_flagged', 'proposed_status', 'summary', 'tags', 'title'] as const

/**
 * 解析并校验模型返回的整合 JSON。严格契约：恰好六个顶层键、字符串非空、
 * tags 全 string 且 ≤ maxTags、summary ≤ 200 字符、proposed_status 是合法枚举或 null。
 * @throws Error 契约不满足时，消息以 `error: invalid integration output:` 开头。
 */
export function parseIntegrationOutput(text: string, opts: ParseOptions): IntegrationOutput {
  const fail = (why: string): never => {
    throw new Error(`error: invalid integration output: ${why}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    fail('not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) fail('not an object')
  const obj = parsed as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  if (keys.length !== OUTPUT_KEYS.length || keys.some((k, i) => k !== OUTPUT_KEYS[i])) {
    fail(`keys are [${keys.join(', ')}], expected exactly [${OUTPUT_KEYS.join(', ')}]`)
  }
  if (typeof obj['title'] !== 'string' || obj['title'] === '') fail('title must be a non-empty string')
  if (!Array.isArray(obj['tags']) || obj['tags'].some((t) => typeof t !== 'string')) fail('tags must be an array of strings')
  if ((obj['tags'] as string[]).length > opts.maxTags) {
    fail(`tags length ${(obj['tags'] as string[]).length} > max ${opts.maxTags}`)
  }
  if (typeof obj['summary'] !== 'string' || obj['summary'].length > SUMMARY_MAX_CHARS) {
    fail(`summary must be a string of ≤ ${SUMMARY_MAX_CHARS} chars`)
  }
  if (typeof obj['body'] !== 'string' || obj['body'] === '') fail('body must be a non-empty string')
  const status = obj['proposed_status']
  if (status !== null && !(typeof status === 'string' && (VALID_STATUSES as readonly string[]).includes(status))) {
    fail('proposed_status must be one of spark|active|dormant|done or null')
  }
  if (typeof obj['contradictions_flagged'] !== 'boolean') fail('contradictions_flagged must be a boolean')
  return {
    title: obj['title'] as string,
    tags: obj['tags'] as string[],
    summary: obj['summary'] as string,
    body: obj['body'] as string,
    proposed_status: status as NoteStatus | null,
    contradictions_flagged: obj['contradictions_flagged'] as boolean,
  }
}
