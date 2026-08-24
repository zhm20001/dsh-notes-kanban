/**
 * note_integrate 工具 —— 整合：新材料并入既有笔记（管线内嵌 ctx.llm，spec 0002）。
 *
 * @module mytool-dsh-notes/tools/note-integrate
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { DiffResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import { VALID_STATUSES } from '../core/notelib.ts'
import type { IntegrationDiffEntry } from '../integrate/pipeline.ts'
import type { NotesService } from '../service.ts'

/** 从持久化的 result.meta 软读回 diff（回放呈现用;形状不对退回 generic 卡）。 */
function diffsFromMeta(meta: JsonValue | undefined): IntegrationDiffEntry[] | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const diffs = (meta as Record<string, unknown>)['diffs']
  if (!Array.isArray(diffs) || diffs.length === 0) return undefined
  const wellFormed = diffs.every((d) =>
    typeof d === 'object' && d !== null && !Array.isArray(d)
    && typeof (d as Record<string, unknown>)['path'] === 'string'
    && typeof (d as Record<string, unknown>)['oldText'] === 'string'
    && typeof (d as Record<string, unknown>)['newText'] === 'string')
  return wellFormed ? diffs as IntegrationDiffEntry[] : undefined
}

/** 注册 note_integrate;返回 registry 的 disposer（caller 挂到 ctx.effect）。 */
export function registerNoteIntegrateTool(ctx: Context, notes: NotesService) {
  return ctx.tools.register(defineTool({
    name: 'note_integrate',
    description:
      '整合:把新材料并入一条既有笔记——读档→重写(去重/总结/体系化)→落盘,.bak 留前版。'
      + '并入/新建的判定在你:先 note_find_candidates 找候选、读档商量,确定并入才调本工具;'
      + '整合后用同材料复查 note_find_candidates,目标应升首位。status 只提案不落盘。',
    parameters: {
      id: { type: 'string', required: true, description: '目标笔记目录名(必须已存在)' },
      material: { type: 'string', required: true, description: '新材料原文(非空)' },
      source: { type: 'string', description: '新材料来源(如 "React docs · hooks"),可省' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          bak: { type: 'string' },
          title: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
          proposed_status: { oneOf: [{ type: 'string', enum: [...VALID_STATUSES] }, { type: 'null' }] },
          contradictions_flagged: { type: 'boolean' },
          prompt_version: { type: 'integer' },
          title_before: { type: 'string' },
          tags_before: { type: 'array', items: { type: 'string' } },
          // 前后全文(呈现专用,不进模型面):type 'json' 放行大字符串
          diff: { type: 'json' },
        },
      },
      presentationMeta: (_args, value) => ({ diffs: value.diff ?? [] }),
      render: (_args, value) => [{
        type: 'text',
        text: '已整合 '
          + `${value.id}(前版备份 ${value.bak}`
          + `${value.contradictions_flagged ? ';⚠ 已按约定标记矛盾' : ''}`
          + `${value.proposed_status === null ? '' : `;状态提案 ${value.proposed_status}(未落盘,确认后经 note_save 流转)`})`,
      }],
    },
    presentResult(args, result: ToolResult): DiffResultView | undefined {
      if (result.isError) return undefined
      const diffs = diffsFromMeta(result.meta)
      return diffs === undefined ? undefined : { card: 'diff', title: `note_integrate ${args.id}`, diffs }
    },
    async execute(args, exec) {
      return notes.integrate({
        id: args.id,
        material: args.material,
        ...(args.source !== undefined ? { source: args.source } : {}),
        sessionId: exec.agent?.session?.id,
        signal: exec.signal,
      })
    },
  }))
}
