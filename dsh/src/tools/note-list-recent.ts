/**
 * note_list_recent 工具 —— 最近视图:updated_at 倒序 + stale(遗忘风险)标记。
 *
 * @module mytool-dsh-notes/tools/note-list-recent
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { VALID_STATUSES } from '../core/notelib.ts'
import { RECENT_DEFAULT_LIMIT } from '../core/recent.ts'
import type { NotesService } from '../service.ts'

/** 注册 note_list_recent;返回 registry 的 disposer（caller 挂到 ctx.effect）。 */
export function registerNoteListRecentTool(ctx: Context, notes: NotesService) {
  return ctx.tools.register(defineTool({
    name: 'note_list_recent',
    description:
      `最近视图:笔记按 updated_at 倒序,超过阈值未触碰的标记 stale(遗忘风险)。`
      + `用于"我最近在跟什么/什么快被忘了";排序与标记是代码,模型只负责转述。`,
    parameters: {
      limit: { type: 'integer', description: `条数上限,缺省 ${RECENT_DEFAULT_LIMIT}` },
      staleDays: { type: 'integer', description: '超过这么多天未触碰 → stale,缺省 30' },
      status: {
        type: 'array',
        items: { type: 'string', enum: [...VALID_STATUSES] },
        description: "只看这些生命周期状态(如 ['active','spark'] = 进行中)",
      },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            path: { type: 'string' },
            title: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            status: { type: 'string' },
            updated_at: { type: 'string' },
            age_days: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
            stale: { type: 'boolean' },
            summary: { type: 'string' },
            snippet: { type: 'string' },
          },
        },
      },
      render: (_args, value) => value.length === 0
        ? [{ type: 'text', text: '(空)' }]
        : [{
            type: 'text',
            text: value
              .map((n) => {
                const age = n.age_days === null ? '年龄未知' : `${n.age_days} 天前`
                const preview = n.summary !== '' ? n.summary : n.snippet
                return `${n.id} — ${n.title}[${n.status}] ${age}${n.stale ? ' ⚠stale' : ''}\n  ${preview}`
              })
              .join('\n'),
          }],
    },
    async execute(args) {
      return notes.listRecent(args)
    },
  }))
}
