/**
 * note_find_candidates 工具 —— 检索:给新材料找并入候选(确定性排名)。
 *
 * @module mytool-dsh-notes/tools/note-find-candidates
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { FIND_DEFAULT_LIMIT } from '../core/find.ts'
import type { NotesService } from '../service.ts'

/** 注册 note_find_candidates;返回 registry 的 disposer（caller 挂到 ctx.effect）。 */
export function registerNoteFindCandidatesTool(ctx: Context, notes: NotesService) {
  return ctx.tools.register(defineTool({
    name: 'note_find_candidates',
    description:
      `检索:对既有笔记做确定性关键词排名,找新材料的并入候选。模型只传材料,排名是代码。`
      + `空结果 = 无相关笔记 → 新建;候选取舍(并入 vs 新建)是模型的判断。`,
    parameters: {
      material: { type: 'string', required: true, description: '即将整合的新材料原文(非空)' },
      limit: { type: 'integer', description: `候选上限,缺省 ${FIND_DEFAULT_LIMIT}` },
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
            summary: { type: 'string' },
            score: { type: 'integer' },
            /** strong = score ≥ 阈值或 ≥2 个关键词命中标题;其余 weak。advisory,判定仍是模型 + 对话。 */
            grade: { type: 'string', enum: ['strong', 'weak'] },
            snippet: { type: 'string' },
          },
        },
      },
      render: (_args, value) => value.length === 0
        ? [{ type: 'text', text: '无相关候选 → 建议新建笔记' }]
        : [{
            type: 'text',
            text: value
              .map((c) => `${c.id} — ${c.title}(score ${c.score} ${c.grade},更新 ${c.updated_at})`)
              .join('\n'),
          }],
    },
    async execute(args) {
      return notes.findCandidates(args.material, args.limit)
    },
  }))
}
