/**
 * note_integrate 真模型 soft-invariant 评测（ticket 09 / spec 0002 软判断的归宿）。
 *
 * - 断言不变量而非逐字比对：要点在（token 可检出）、无逐字复制（长句不原样
 *   照抄）、矛盾保留（blockquote 标记）、front-matter 合法、`.bak` 可回溯、
 *   id 稳定——质量画像一次跑全（expect.soft），不首错即停。
 * - 路由固定：provider deepseek-official / model（MYTOOL_EVAL_MODEL，默认
 *   deepseek-chat）/ temperature 0——评测结果可归因到 prompt 版本与模型。
 * - 无 DEEPSEEK_API_KEY 整体自跳过（仿 harness e2e 的 key 门）。
 * - retry 0（与 harness e2e 的 retry 2 相反）：质量评测里重跑会掩盖不稳定性
 *   信号；传输层偶发失败就让红着，人工判断后再跑。
 *
 * @module mytool-dsh-notes/test/integrate.e2e
 */

import { existsSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmDeepSeek from '@deepseek-ai/dsh-llm-deepseek'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { parseNoteText, SUMMARY_MAX_CHARS } from '../src/core/notelib.ts'
import { restoreNote } from '../src/core/restore.ts'
import { readNoteRaw, saveNote } from '../src/core/save.ts'
import { NotesService } from '../src/service.ts'
import { CORPUS } from './eval-corpus.ts'
import { contradictionMarked, keypointViolations, verbatimCopyViolations } from './eval-invariants.ts'
import { makeNotesDir } from './helpers.ts'

const EVAL_MODEL = process.env.MYTOOL_EVAL_MODEL ?? 'deepseek-chat'

/** key 门认两种来源：环境变量，或生产同款 credentials 文档（$DSH_HOME 默认 ~/.dsh）。 */
const CREDENTIALS_DOC = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), '.credentials.yaml')
const ENV_KEY = process.env.DEEPSEEK_API_KEY ?? ''
const HAS_KEY = ENV_KEY !== '' || existsSync(CREDENTIALS_DOC)

const contexts: Context[] = []
const notesDirs: string[] = []

afterAll(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(notesDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

/** 装配真实最小组合：LlmRuntime + DeepSeek provider + tools 依赖链 + 本插件。 */
async function evalContext(notesDir: string): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LlmRuntime)
  if (ENV_KEY === '') await ctx.plugin(LocalCredentialProvider, { path: CREDENTIALS_DOC, watch: false })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LlmDeepSeek)
  await ctx.plugin(NotesService, {
    notesDir,
    integrate: { provider: 'deepseek-official', model: EVAL_MODEL, temperature: 0, timeoutMs: 120000 },
    strongScoreThreshold: 15,
    maxTags: 6,
  })
  return ctx
}

describe.skipIf(!HAS_KEY)('note integrate soft-invariant eval（真模型）', () => {
  for (const fixture of CORPUS) {
    it(`整合不变量：${fixture.name}`, async () => {
      const { dir } = makeNotesDir()
      notesDirs.push(dir)

      const seeded = saveNote(dir, { ...fixture.seed }, { maxTags: 6 })
      const before = readNoteRaw(dir, seeded.id)
      const ctx = await evalContext(dir)

      const result = await ctx.notes.integrate({ id: seeded.id, material: fixture.material, source: fixture.source })

      // ---- 硬保证（确定性，expect 首错即停）----
      // id 稳定 + .bak 可回溯：前版逐字节在 <id>/note.md.bak 里（result.bak 是目录内 basename）。
      expect(result.id).toBe(seeded.id)
      if (result.bak === null) throw new Error('integrate result missing .bak path')
      const bakPath = join(dir, seeded.id, result.bak)
      expect(existsSync(bakPath)).toBe(true)
      expect(readFileSync(bakPath, 'utf8')).toBe(before)
      const after = readNoteRaw(dir, seeded.id)
      expect(result.diff[0]).toMatchObject({ path: seeded.id, oldText: before, newText: after })

      // front-matter 合法：可解析、title 非空、标签去重且 ≤ 上限、summary ≤ 上限、
      // updated_at 可解析且不早于整合前、status 透传未动（提案只在结果里）。
      const { frontMatter: fm, body } = parseNoteText(after)
      expect(typeof fm['title']).toBe('string')
      expect(fm['title']).not.toBe('')
      const tags = Array.isArray(fm['tags']) ? fm['tags'].map(t => String(t)) : []
      expect(tags.length).toBeLessThanOrEqual(6)
      expect(new Set(tags).size).toBe(tags.length)
      if (typeof fm['summary'] === 'string') {
        expect(fm['summary'].length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS)
        expect(fm['summary']).toBe(result.summary)
      }
      expect(Number.isNaN(Date.parse(String(fm['updated_at'])))).toBe(false)
      expect(Date.parse(String(fm['updated_at']))).toBeGreaterThanOrEqual(Date.parse(String(parseNoteText(before).frontMatter['updated_at'])))
      expect(fm['status']).toBe(fixture.seed.status)
      expect(result.prompt_version).toBeGreaterThan(0)

      // ---- 软不变量（expect.soft：一次跑全，给出完整质量画像）----
      expect.soft(keypointViolations(body, fixture.keypoints), `要点保留（缺失：${keypointViolations(body, fixture.keypoints).join('、')}）`).toEqual([])
      const copied = verbatimCopyViolations(body, fixture.material)
      expect.soft(copied.length, `无逐字复制（照抄句：${copied.length} 句）`).toBe(0)
      if (fixture.plantsContradiction) {
        expect.soft(contradictionMarked(body), '矛盾保留（正文须有 blockquote 矛盾标记）').toBe(true)
        expect.soft(result.contradictions_flagged, '矛盾保留（结果须置 contradictions_flagged）').toBe(true)
      }

      // ---- 回滚闭环（放最后：restore 会换 live/.bak）----
      restoreNote(dir, seeded.id)
      expect(readNoteRaw(dir, seeded.id)).toBe(before)
    })
  }
})
