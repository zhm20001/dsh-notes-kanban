/**
 * note_save 工具 —— 存档：原子写一条笔记（更新时写前 `.bak`）。
 *
 * @module mytool-dsh-notes/tools/note-save
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { VALID_STATUSES } from '../core/notelib.ts'
import type { NoteSaveInput } from '../core/save.ts'
import type { NotesService } from '../service.ts'

/** 注册 note_save；返回 registry 的 disposer（caller 挂到 ctx.effect）。 */
export function registerNoteSaveTool(ctx: Context, notes: NotesService) {
  return ctx.tools.register(defineTool({
    name: 'note_save',
    description:
      '存档:原子写一条笔记。新建(不给 id)生成稳定 id 并返回;更新(给 id)先把前版备份到 <id>/note.md.bak 再覆写 note.md。'
      + '正文由调用方结构化;front-matter(title/tags/status/updated_at)由本工具维护。',
    parameters: {
      title: { type: 'string', required: true, description: '点题标题(非空)' },
      tags: { type: 'array', items: { type: 'string' }, description: '检索关键词标签,可省;有上限,超限报错' },
      status: { type: 'string', enum: [...VALID_STATUSES], description: '生命周期,缺省 spark' },
      source: { type: 'string', description: '材料来源(如 "React docs · hooks"),可省' },
      summary: { type: 'string', description: '≤200 字符摘要(integrate 维护,新建时可自拟),可省' },
      id: { type: 'string', description: '既有笔记目录名;给 id = 更新该笔记(先写 .bak)' },
      body: { type: 'string', required: true, description: '结构化后的连贯 markdown 正文(非空)' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string' },
          id: { type: 'string' },
          bak: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.bak === null
          ? `已存新笔记 ${value.id}(path: ${value.path})`
          : `已更新笔记 ${value.id};前版备份在 ${value.bak}`,
      }],
    },
    async execute(args) {
      return notes.save(args)
    },
  }))
}
