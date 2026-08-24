/**
 * 整合管线（spec 0002 契约总览的六步执行）：
 * 读档 → 组装版本化模板 → deadline → ctx.llm 流式直调 → JSON 契约校验 → saveNote 落盘。
 *
 * 可重建性（「模型可见 ⟺ 可从会话日志重建」）：材料与 id 在 tool 调用参数里、
 * 模板版本号在工具结果里、前版全文在 `<id>/note.md.bak` 与会话内此前的 note_read
 * 结果里——全部走标准事件，不引入仓外自定义 session 事件（见 spec 0002 追记）。
 *
 * @module mytool-dsh-notes/integrate/pipeline
 */

import type { Context } from '@deepseek-ai/cordis'
// 侧效果类型导入:引入 dsh-llm 对 Context.llm 的声明合并。
import type {} from '@deepseek-ai/dsh-llm'
import { BlockAssembler, createUserMessage, deepFreeze } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { parseNoteText, SUMMARY_MAX_CHARS, type NoteStatus } from '../core/notelib.ts'
import { readNoteRaw, saveNote } from '../core/save.ts'
import { buildIntegrationPrompt, PROMPT_VERSION } from './prompt.ts'
import { parseIntegrationOutput } from './parse.ts'

/** 整合调用的 LLM 路由（spec 0002 条目 1：Config，不随会话模型漂移）。 */
export interface IntegrateLlmConfig {
  provider: string
  model: string
  temperature: number
  maxTokens?: number
  timeoutMs: number
}

/** 管线运行配置：LLM 路由 + 标签上限（摘要上限是产品契约常量，不配置化）。 */
export interface IntegrationRunConfig extends IntegrateLlmConfig {
  maxTags: number
}

/** type alias(非 interface):对象字面量类型可获得隐式索引签名,方可赋给 JsonValue。 */
export type IntegrationDiffEntry = {
  path: string
  oldText: string
  newText: string
}

export type IntegrationResult = {
  id: string
  bak: string
  title: string
  tags: string[]
  summary: string
  proposed_status: NoteStatus | null
  contradictions_flagged: boolean
  prompt_version: number
  title_before: string
  tags_before: string[]
  /** 前后全文，diff 呈现专用；不进模型面（render 只出摘要行）。 */
  diff: IntegrationDiffEntry[]
}

export interface IntegrationRequest {
  id: string
  material: string
  source?: string
  sessionId?: GenerateOptions['sessionId']
  signal?: AbortSignal
}

const TIMEOUT_CODE = 'NOTE_INTEGRATE_TIMEOUT'

/** 把终态 finish 原因翻译成整合调用失败（语义同 session-title-llm 的 finishError）。 */
function finishError(finish: FinishReason): Error | undefined {
  switch (finish.kind) {
    case 'stop':
      return undefined
    case 'error':
    case 'aborted': {
      const error = new Error(finish.failure.message) as Error & { code?: string }
      error.code = finish.failure.code
      return error
    }
    case 'max-tokens':
      return new Error('note-integrate: rewrite output reached maxTokens')
    case 'tool-calls':
      return new Error('note-integrate: model unexpectedly requested a tool')
    default:
      return new Error(`note-integrate: unsupported finish reason "${String((finish as { kind?: unknown }).kind)}"`)
  }
}

function textBlocksContent(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

/**
 * 执行一次完整整合。任何一步失败（笔记不存在、LLM 超时/中断、输出契约不符、
 * 标签/摘要越界）都在落盘**之前**抛出——磁盘上永远只有上一版好笔记。
 */
export async function runIntegration(
  ctx: Context,
  config: IntegrationRunConfig,
  notesDir: string,
  req: IntegrationRequest,
): Promise<IntegrationResult> {
  req.signal?.throwIfAborted()

  const noteMarkdown = readNoteRaw(notesDir, req.id)
  const existing = parseNoteText(noteMarkdown)
  const existingSource = typeof existing.frontMatter['source'] === 'string' ? existing.frontMatter['source'] : undefined
  const existingStatus = existing.frontMatter['status'] as NoteStatus | undefined
  const titleBefore = String(existing.frontMatter['title'] ?? '')
  const tagsBefore = Array.isArray(existing.frontMatter['tags']) ? existing.frontMatter['tags'].map((t) => String(t)) : []

  const prompt = buildIntegrationPrompt({
    noteMarkdown,
    material: req.material,
    ...(req.source !== undefined ? { source: req.source } : {}),
    maxTags: config.maxTags,
    summaryMaxChars: SUMMARY_MAX_CHARS,
  })

  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: prompt.user }],
    source: { kind: 'plugin', plugin: 'mytool-dsh-notes' },
  })]
  using callDeadline = deadline(req.signal, config.timeoutMs, TIMEOUT_CODE)
  const options: GenerateOptions = deepFreeze({
    provider: config.provider,
    model: config.model,
    temperature: config.temperature,
    ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
    messages,
    system: prompt.system,
    ...(req.sessionId !== undefined ? { sessionId: req.sessionId } : {}),
    signal: callDeadline.signal,
  })

  callDeadline.signal.throwIfAborted()
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(options)) {
    callDeadline.signal.throwIfAborted()
    assembler.push(chunk)
  }
  callDeadline.signal.throwIfAborted()
  const terminalError = finishError(assembler.finish)
  if (terminalError !== undefined) throw terminalError

  const output = parseIntegrationOutput(textBlocksContent(assembler.blocks()), { maxTags: config.maxTags })

  // 状态透传（spec 0002 条目 8：integrate 不升格，提案在结果里）；source 取新材料
  // 优先、退回既有值（条目 6：front-matter 单值，多来源在正文列表）。
  const saved = saveNote(notesDir, {
    title: output.title,
    tags: output.tags,
    ...(existingStatus !== undefined ? { status: existingStatus } : {}),
    ...((req.source ?? existingSource) !== undefined ? { source: req.source ?? existingSource } : {}),
    summary: output.summary,
    id: req.id,
    body: output.body,
  }, { maxTags: config.maxTags })
  if (saved.bak === null) {
    // integrate 恒带 id 走更新路径,saveNote 必产 .bak;此分支只为类型收窄。
    throw new Error('note-integrate: update path did not produce a .bak')
  }

  return {
    id: saved.id,
    bak: saved.bak,
    title: output.title,
    tags: output.tags,
    summary: output.summary,
    proposed_status: output.proposed_status,
    contradictions_flagged: output.contradictions_flagged,
    prompt_version: PROMPT_VERSION,
    title_before: titleBefore,
    tags_before: tagsBefore,
    diff: [{ path: saved.id, oldText: noteMarkdown, newText: readNoteRaw(notesDir, req.id) }],
  }
}
