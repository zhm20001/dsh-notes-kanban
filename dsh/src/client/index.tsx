/**
 * 看板的浏览器半边（ADR 0007）—— 侧栏底部入口按钮 + Modal 弹窗，只读。
 *
 * 构建约束：本文件是 client bundle 的唯一入口，只允许 import 平台模块表内的
 * 外部件（react / ui-primitives / ui-slots / runtime-client 豁免）；wire 类型与
 * host 的 src/web/routes.ts 镜像声明（type-only 跨半边 import 会把 node 半边
 * 源码拖进浏览器编译程序）。展示整形（done 折叠/排序）全在 host 路由完成。
 *
 * @module mytool-dsh-notes/client
 */

import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Button, DisclosureRow, IconListPenOutline16, IconRefreshOutline14,
  MarkdownText, Modal, Pill, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientContext, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

// --- wire 类型（镜像 host: src/web/routes.ts，两处同步修改） -------------------

interface DashboardRow {
  id: string
  title: string
  tags: string[]
  status: string
  updated_at: string
  summary: string
  snippet: string
  age_days: number | null
  stale: boolean
}

interface NotesDashboardList {
  generated_at: string
  active: DashboardRow[]
  done: DashboardRow[]
}

interface NoteDetailPayload {
  id: string
  title: string
  tags: string[]
  status: string
  updated_at: string
  source: string | null
  summary: string | null
  body: string
}

type DetailState = { loading: true } | { ok: NoteDetailPayload } | { fail: string }

// --- controller（无 react，store 驱动 UI） --------------------------------------

interface NotesDashboardState {
  open: boolean
  status: 'idle' | 'loading' | 'ready' | 'error'
  list: NotesDashboardList | null
  error: string | null
  expanded: Record<string, true>
  detail: Record<string, DetailState>
}

const INITIAL: NotesDashboardState = { open: false, status: 'idle', list: null, error: null, expanded: {}, detail: {} }

/** 连接载体的 null-origin 兜底（与会话日志导出同款）。 */
function hostBase(): string {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin
  return origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal'
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, hostBase()))
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}${detail === '' ? '' : ` ${detail}`}`)
  }
  return await response.json() as T
}

class NotesDashboardController {
  readonly store: SnapshotStore<NotesDashboardState> = createSnapshotStore(INITIAL)
  private disposed = false

  open(): void {
    this.store.update((s) => { s.open = true })
    if (this.store.getSnapshot().list === null) void this.refresh()
  }

  close(): void {
    this.store.update((s) => { s.open = false })
  }

  async refresh(): Promise<void> {
    if (this.disposed) return
    this.store.update((s) => { s.status = 'loading' })
    try {
      const list = await fetchJson<NotesDashboardList>('/mytool/notes')
      if (this.disposed) return
      this.store.update((s) => { s.status = 'ready'; s.list = list; s.error = null })
    } catch (error: unknown) {
      if (this.disposed) return
      const message = error instanceof Error ? error.message : String(error)
      this.store.update((s) => { s.status = 'error'; s.error = message })
    }
  }

  toggle(id: string): void {
    this.store.update((s) => {
      if (s.expanded[id] === true) delete s.expanded[id]
      else s.expanded[id] = true
    })
    if (this.store.getSnapshot().expanded[id] === true && this.store.getSnapshot().detail[id] === undefined) {
      void this.loadDetail(id)
    }
  }

  private async loadDetail(id: string): Promise<void> {
    this.store.update((s) => { s.detail[id] = { loading: true } })
    try {
      const detail = await fetchJson<NoteDetailPayload>(`/mytool/notes/${encodeURIComponent(id)}`)
      if (this.disposed) return
      this.store.update((s) => { s.detail[id] = { ok: detail } })
    } catch (error: unknown) {
      if (this.disposed) return
      const message = error instanceof Error ? error.message : String(error)
      this.store.update((s) => { s.detail[id] = { fail: message } })
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
  }
}

// --- 组件 ------------------------------------------------------------------------

interface NotesDashboardFace {
  hooks: { notesDashboard: SnapshotStore<NotesDashboardState> }
  openDashboard: () => void
  closeDashboard: () => void
  refreshDashboard: () => void
  toggleNote: (id: string) => void
}

type NotesDashboardActionProps =
  PropsRuntime<'sidebar.footer.action'> & InjectFace<NotesDashboardFace>

const ENTRY_STYLE: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 13,
}

const BADGE_STYLE: CSSProperties = {
  minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
  background: 'var(--dsw-alias-status-warning, #d97706)', color: '#fff',
  fontSize: 11, lineHeight: '16px', textAlign: 'center',
}

const BODY_STYLE: CSSProperties = { minWidth: 520, maxHeight: '58vh', overflowY: 'auto', paddingRight: 4 }

const META_STYLE: CSSProperties = { color: 'var(--dsw-alias-text-secondary, #888)', fontSize: 12 }

const ERROR_STYLE: CSSProperties = { color: 'var(--dsw-alias-status-error, #dc2626)', fontSize: 13 }

const DONE_STYLE: CSSProperties = { marginTop: 8, opacity: 0.75 }

const DETAIL_STYLE: CSSProperties = { padding: '4px 0 8px' }

function dotStateOf(row: DashboardRow): 'done' | 'warning' | 'ongoing' {
  if (row.status === 'done') return 'done'
  if (row.stale) return 'warning'
  return 'ongoing'
}

function renderRow(row: DashboardRow, state: NotesDashboardState, toggleNote: (id: string) => void): ReactNode {
  const open = state.expanded[row.id] === true
  const detail = state.detail[row.id]
  return (
    <DisclosureRow
      key={row.id}
      icon={<StateDot state={dotStateOf(row)} size={10} />}
      title={row.title === '' ? row.id : row.title}
      open={open}
      expandable
      onToggle={() => { toggleNote(row.id) }}
      collapsedContent={(
        <span style={META_STYLE}>
          {row.stale ? '⚠ 遗忘风险 · ' : ''}{row.summary !== '' ? row.summary : row.snippet}
          {row.age_days !== null ? ` · ${row.age_days} 天前` : ' · 年龄未知'}
        </span>
      )}
    >
      {detail === undefined || 'loading' in detail
        ? <p style={META_STYLE}>加载中…</p>
        : 'fail' in detail
          ? <p style={ERROR_STYLE}>读取失败：{detail.fail}</p>
          : (
            <div style={DETAIL_STYLE}>
              <p style={META_STYLE}>
                {detail.ok.tags.map((tag) => <Pill key={tag}>{tag}</Pill>)}
                {` ${detail.ok.status} · ${detail.ok.updated_at}`}
                {detail.ok.source !== null ? ` · 来源：${detail.ok.source}` : ''}
              </p>
              <MarkdownText text={detail.ok.body} />
            </div>
          )}
    </DisclosureRow>
  )
}

/**
 * 侧栏底部入口：按钮 + 看板 Modal（打开时拉取 + 手动刷新；展开按需拉详情）。
 */
function NotesDashboardAction({
  useNotesDashboard, openDashboard, closeDashboard, refreshDashboard, toggleNote,
}: NotesDashboardActionProps): ReactNode {
  const state = useNotesDashboard((s) => s)
  const [doneOpen, setDoneOpen] = useState(false)
  const list = state.list
  const staleCount = list?.active.filter((row) => row.stale).length ?? 0

  return (
    <>
      <button type="button" style={ENTRY_STYLE} onClick={openDashboard} title="笔记看板（人类读档）">
        <IconListPenOutline16 size={14} />
        <span>笔记</span>
        {staleCount > 0 && <span style={BADGE_STYLE}>{staleCount}</span>}
      </button>
      <Modal
        open={state.open}
        onClose={closeDashboard}
        title="笔记看板"
        closeLabel="关闭"
        description={list !== null
          ? `${list.active.length} 篇在跟 · ${list.done.length} 篇已完成 · 生成于 ${list.generated_at}`
          : undefined}
        footer={(
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={<IconRefreshOutline14 size={14} />}
              disabled={state.status === 'loading'}
              onClick={refreshDashboard}
            >
              刷新
            </Button>
            <Button variant="primary" size="sm" onClick={closeDashboard}>关闭</Button>
          </>
        )}
      >
        <div style={BODY_STYLE}>
          {state.status === 'loading' && list === null && <p style={META_STYLE}>加载中…</p>}
          {state.status === 'error' && <p style={ERROR_STYLE}>加载失败：{state.error}</p>}
          {list !== null && list.active.length === 0 && <p style={META_STYLE}>还没有在跟的笔记。</p>}
          {list?.active.map((row) => renderRow(row, state, toggleNote))}
          {list !== null && list.done.length > 0 && (
            <div style={DONE_STYLE}>
              <DisclosureRow
                icon={<StateDot state="done" size={10} />}
                title={`已完成（${list.done.length}）`}
                open={doneOpen}
                expandable
                onToggle={() => { setDoneOpen((v) => !v) }}
              >
                {doneOpen ? list.done.map((row) => renderRow(row, state, toggleNote)) : null}
              </DisclosureRow>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}

// --- 插件入口 ----------------------------------------------------------------------

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  const controller = new NotesDashboardController()
  ctx.effect(() => async () => { await controller.dispose() }, 'notes-dashboard: browser lifecycle')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'notes-dashboard',
    inject: (): NotesDashboardFace => ({
      hooks: { notesDashboard: controller.store },
      openDashboard: () => { controller.open() },
      closeDashboard: () => { controller.close() },
      refreshDashboard: () => { void controller.refresh() },
      toggleNote: (id: string) => { controller.toggle(id) },
    }),
  }, NotesDashboardAction))
}
