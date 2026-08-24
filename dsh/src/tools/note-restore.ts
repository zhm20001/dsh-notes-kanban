/**
 * note_restore 工具 —— 回滚:把笔记换回写前 `.bak`(撤销一次坏整合)。
 *
 * @module mytool-dsh-notes/tools/note-restore
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { NotesService } from '../service.ts'

/** 注册 note_restore;返回 registry 的 disposer（caller 挂到 ctx.effect）。 */
export function registerNoteRestoreTool(ctx: Context, notes: NotesService) {
  return ctx.tools.register(defineTool({
    name: 'note_restore',
    description:
      '回滚:把笔记换回它的写前 .bak(撤销一次坏整合)。非破坏性互换:被回滚掉的版本停进 .bak,'
      + '再跑一次即撤销本次回滚。还原内容逐字回来(含 updated_at)。',
    parameters: {
      id: { type: 'string', required: true, description: '笔记目录名(目录内需有 note.md.bak)' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          restored_from: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `已回滚 ${value.id}(来源 ${value.restored_from};再跑一次即撤销)`,
      }],
    },
    async execute(args) {
      return notes.restore(args.id)
    },
  }))
}
