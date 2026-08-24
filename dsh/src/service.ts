/**
 * NotesService —— mytool 沉淀引擎的确定性存储 + 整合服务（ADR-0005、spec 0002）。
 *
 * 类即插件（AgentLoop 同款形态）：`static inject` 声明依赖、`static Config` 声明配置
 * schema（loader 校验）、constructor 里把工具注册为可撤销 effect。确定性行为全部委托
 * `core/` 纯函数；整合走 `integrate/` 管线（ctx.llm 直调，spec 0002 契约）。
 * skills 服务是可选依赖（headless 组合不含它）：经 `ctx.inject` 出现时才注册 skill。
 *
 * @module mytool-dsh-notes
 */

import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
// 侧效果类型导入:引入各包对 Context 的声明合并（tools / llm / skills）。
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { findCandidates, FIND_DEFAULT_LIMIT, type NoteCandidate } from './core/find.ts'
import { listRecent, RECENT_DEFAULT_LIMIT, type ListRecentOptions, type NoteRecentRow } from './core/recent.ts'
import { restoreNote, type NoteRestoreResult } from './core/restore.ts'
import { readNote, readNoteRaw, saveNote, type NoteReadResult, type NoteSaveInput, type NoteSaveResult } from './core/save.ts'
import { runIntegration, type IntegrationRequest, type IntegrationResult, type IntegrateLlmConfig } from './integrate/pipeline.ts'
import { registerNotesSkill } from './skill.ts'
import { registerNotesRoutes } from './web/routes.ts'
import { registerNoteFindCandidatesTool } from './tools/note-find-candidates.ts'
import { registerNoteIntegrateTool } from './tools/note-integrate.ts'
import { registerNoteListRecentTool } from './tools/note-list-recent.ts'
import { registerNoteReadTool } from './tools/note-read.ts'
import { registerNoteRestoreTool } from './tools/note-restore.ts'
import { registerNoteSaveTool } from './tools/note-save.ts'

export interface NotesPluginConfig {
  notesDir: string
  /** 整合管线 LLM 路由（spec 0002 条目 1）。 */
  integrate: IntegrateLlmConfig
  /** 候选 strong 判定阈值（spec 0002 条目 4）。 */
  strongScoreThreshold: number
  /** 标签上限（spec 0002 条目 7）。 */
  maxTags: number
}

export class NotesService extends Service {
  static inject = ['tools', 'llm']

  static Config = z.object({
    notesDir: z.string().required().description('笔记文件夹绝对路径（文件系统契约根）'),
    integrate: z.object({
      provider: z.string().default('deepseek-official').description('整合调用的 provider 路由'),
      model: z.string().default('deepseek-chat').description('整合调用的模型'),
      temperature: z.number().default(0).description('整合温度；0 = 确定性优先（评测可复现前提）'),
      maxTokens: z.number().description('整合输出 maxTokens，可省'),
      timeoutMs: z.number().default(120000).description('整合调用超时毫秒数'),
    }).description('整合管线 LLM 路由（spec 0002 条目 1：不随会话模型漂移）'),
    strongScoreThreshold: z.number().default(15).description('候选 strong 判定阈值（spec 0002 条目 4）'),
    maxTags: z.number().default(6).description('标签数量硬上限（spec 0002 条目 7）'),
  })

  readonly config: NotesPluginConfig

  constructor(ctx: Context, config: NotesPluginConfig) {
    super(ctx, 'notes')
    this.config = config
    ctx.effect(() => registerNoteSaveTool(ctx, this), 'notes.tool(note_save)')
    ctx.effect(() => registerNoteReadTool(ctx, this), 'notes.tool(note_read)')
    ctx.effect(() => registerNoteFindCandidatesTool(ctx, this), 'notes.tool(note_find_candidates)')
    ctx.effect(() => registerNoteListRecentTool(ctx, this), 'notes.tool(note_list_recent)')
    ctx.effect(() => registerNoteRestoreTool(ctx, this), 'notes.tool(note_restore)')
    ctx.effect(() => registerNoteIntegrateTool(ctx, this), 'notes.tool(note_integrate)')
    // skills 可选：组合里没有它（如 headless）时插件照常工作，出现时补注册 skill。
    ctx.inject(['skills'], (sctx) => {
      sctx.effect(() => registerNotesSkill(sctx), 'notes.skill(note-integration)')
    })
    // webServer 可选（ADR 0007）：web 组合里出现时挂看板 JSON 路由，headless 不受影响。
    ctx.inject(['webServer'], (wctx) => {
      wctx.effect(() => registerNotesRoutes(wctx, this), 'notes.web(/mytool/notes)')
    })
  }

  /** 存档（委托 core/save；语义见契约测试）。 */
  save(input: NoteSaveInput): NoteSaveResult {
    return saveNote(this.config.notesDir, input, { maxTags: this.config.maxTags })
  }

  /** 读档（原始 markdown）。 */
  readRaw(id: string): string {
    return readNoteRaw(this.config.notesDir, id)
  }

  /** 读档（结构化）。 */
  read(id: string): NoteReadResult {
    return readNote(this.config.notesDir, id)
  }

  /** 检索：给材料找并入候选（确定性排名 + strong/weak 分级）。 */
  findCandidates(material: string, limit: number = FIND_DEFAULT_LIMIT): NoteCandidate[] {
    return findCandidates(this.config.notesDir, material, limit, this.config.strongScoreThreshold)
  }

  /** 最近视图（updated_at 倒序 + stale 标记）。 */
  listRecent(opts: ListRecentOptions = {}): NoteRecentRow[] {
    return listRecent(this.config.notesDir, opts)
  }

  /** 回滚：换回写前 `.bak`（非破坏性互换）。 */
  restore(id: string): NoteRestoreResult {
    return restoreNote(this.config.notesDir, id)
  }

  /** 整合：材料并入既有笔记（ctx.llm 管线，spec 0002 契约总览）。 */
  integrate(req: IntegrationRequest): Promise<IntegrationResult> {
    return runIntegration(this.ctx, { ...this.config.integrate, maxTags: this.config.maxTags }, this.config.notesDir, req)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** mytool 沉淀引擎的确定性笔记存储 + 整合服务。 */
    notes: NotesService
  }
}
