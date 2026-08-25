/**
 * `/note` 人工命令 —— 主动呼出笔记技能的直达通道（混合呼出策略的主动半边）。
 *
 * 客户端在行首解析 `/note`（零模型猜测），本 handler 把后续文本经 agent.followup
 * 以 plugin 来源消息转交 agent，并点名 note-integration 技能（模型按目录指令加载
 * 全文后处理）。schedule 插件是 followup 透传的同款先例。被动半边（模型读技能
 * 目录自判）不受影响——两层入口互不冲突。
 *
 * @module mytool-dsh-notes/command
 */

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
// 侧效果类型导入：commands 对 Context 的声明合并。
import type {} from '@deepseek-ai/dsh-commands'

const USAGE = '用法：/note <内容或指令>。例如：/note 存个想法：想学做饭 ｜ /note 我最近在搞什么 ｜ /note 撤销上次整合'

/** 执行一次 /note 调用：非空文本 → followup 透传；空 → 用法错误。 */
function executeNoteCommand(invocation: CommandInvocation): CommandResult {
  const text = invocation.rawInput.trim()
  if (text === '') return { kind: 'error', text: USAGE }
  invocation.agent.followup(createUserMessage({
    content: [{ type: 'text', text: `【/note 命令】请用 note-integration 技能处理：\n\n${text}` }],
    source: { kind: 'plugin', plugin: 'mytool-notes' },
  }))
  return { kind: 'success', text: '已转交 agent（笔记技能）处理。' }
}

/** 注册 /note；返回 registry 的 disposer（caller 挂到 ctx.effect）。 */
export function registerNoteCommand(ctx: Context) {
  return ctx.commands.register({
    name: 'note',
    description: '把后续文本转交笔记技能（存档 / 读档 / 整合 / 回滚）',
    handler: executeNoteCommand,
  })
}
