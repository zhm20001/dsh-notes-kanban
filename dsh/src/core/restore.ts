/**
 * 回滚的确定性行为 —— 移植自已退役的 Python 原版主体逻辑（US 14 / ADR-0005）。
 * save_note --id 写前备份 .bak;本模块是其逆运算:把 .bak 还原回 live。
 *
 * @module mytool-dsh-notes/core/restore
 */

import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { atomicWrite, BAK_SUFFIX, NOTE_DOC, safeResolve } from './notelib.ts'

export interface NoteRestoreResult {
  id: string
  restored_from: string
}

/**
 * 非破坏性互换 live ↔ `.bak`:
 *
 * 1. 两份内容先读入内存;
 * 2. 先把好版本写回 live —— 被恢复的数据在崩溃窗口内永不分险;
 * 3. 再把被回滚掉的版本停进 `.bak` —— 回滚本身可逆(再跑一次即撤销)。
 *
 * 还原内容逐字回来(含 updated_at):这是唯一一处时间戳故意"倒退"的地方
 * (updated_at 不倒退是*合并*不变量;显式回滚刻意重绕)。
 */
export function restoreNote(notesDir: string, id: string): NoteRestoreResult {
  const live = join(safeResolve(notesDir, id), NOTE_DOC)
  const bak = live + BAK_SUFFIX

  if (!existsSync(live)) throw new Error(`error: note not found: ${id}`)
  if (!existsSync(bak)) throw new Error(`error: no .bak to restore from: ${id}`)

  const liveContent = readFileSync(live, 'utf8')
  const bakContent = readFileSync(bak, 'utf8')

  atomicWrite(live, bakContent)
  atomicWrite(bak, liveContent)

  return { id: basename(dirname(live)), restored_from: basename(bak) }
}
