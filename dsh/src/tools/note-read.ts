/**
 * note_read 工具 —— 读档：按稳定 id 读回一条笔记。
 *
 * @module mytool-dsh-notes/tools/note-read
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { serializeNote, type FrontMatter } from '../core/notelib.ts'
import type { NoteReadResult } from '../core/save.ts'
import type { NotesService } from '../service.ts'

/** 注册 note_read；返回 registry 的 disposer（caller 挂到 ctx.effect）。 */
export function registerNoteReadTool(ctx: Context, notes: NotesService) {
  return ctx.tools.register(defineTool({
    name: 'note_read',
    description:
      '读档:按 id 读回一条笔记。默认渲染原始 markdown;给 structured=true 时模型值含'
      + ' front_matter 结构(整合前读候选全文用)。id 未知时先用 note_list_recent / note_find_candidates 找。',
    parameters: {
      id: { type: 'string', required: true, description: '笔记目录名(稳定 id)' },
      structured: { type: 'boolean', description: 'true 时返回 {id, frontMatter, body} 结构' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          frontMatter: { type: 'json' },
          body: { type: 'string' },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: args.structured === true
          ? `front-matter: ${JSON.stringify(value.frontMatter)}\n\n${value.body}`
          : serializeNote(value.frontMatter as unknown as FrontMatter, value.body ?? ''),
      }],
    },
    async execute(args) {
      return notes.read(args.id)
    },
  }))
}
