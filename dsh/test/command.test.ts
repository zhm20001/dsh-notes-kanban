/**
 * /note 命令契约：注册形状 + 透传语义（followup 一条点名技能的 plugin 来源
 * user 消息）+ 空参用法错误。不启动真实 agent——followup 是纯记录桩。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition, CommandInvocation } from '@deepseek-ai/dsh-commands'
import { describe, expect, it } from 'vitest'
import { registerNoteCommand } from '../src/command.ts'

interface Captured { def?: CommandDefinition, followups: { content: { type: string, text: string }[], source: unknown }[] }

function setup(): Captured {
  const captured: Captured = { followups: [] }
  const ctx = {
    commands: {
      register(def: CommandDefinition) { captured.def = def; return () => {} },
    },
  } as unknown as Context
  registerNoteCommand(ctx)
  return captured
}

function invokeOf(captured: Captured, rawInput: string): CommandInvocation {
  return {
    commandId: 'cmd-test' as CommandInvocation['commandId'],
    agent: {
      followup(message: Captured['followups'][number]): void { captured.followups.push(message) },
    } as unknown as CommandInvocation['agent'],
    rawInput,
    signal: new AbortController().signal,
  }
}

describe('registerNoteCommand', () => {
  it('注册 /note：小写名 + 非空描述', () => {
    const { def } = setup()
    expect(def?.name).toBe('note')
    expect(def?.description ?? '').not.toBe('')
  })

  it('非空文本 → success + followup 一条 plugin 来源的 user 消息，点名技能并保留原文', () => {
    const captured = setup()
    const result = captured.def?.handler(invokeOf(captured, '  存个想法：想学做饭  '))
    expect(result).toMatchObject({ kind: 'success' })
    expect(captured.followups).toHaveLength(1)
    const message = captured.followups[0]!
    expect(message.content[0]?.type).toBe('text')
    expect(message.content[0]?.text).toContain('note-integration')
    expect(message.content[0]?.text).toContain('存个想法：想学做饭')
    expect(message.source).toEqual({ kind: 'plugin', plugin: 'mytool-notes' })
  })

  it('空文本（空串/纯空白）→ error 含用法，不 followup', () => {
    for (const rawInput of ['', '   ']) {
      const captured = setup()
      const result = captured.def?.handler(invokeOf(captured, rawInput))
      expect(result).toMatchObject({ kind: 'error' })
      expect((result as { text: string }).text).toContain('用法')
      expect(captured.followups).toHaveLength(0)
    }
  })
})
