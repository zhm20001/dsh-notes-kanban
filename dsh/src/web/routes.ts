/**
 * 看板的 host 半边 —— 同源 JSON 路由（ADR 0007）。
 *
 * 浏览器端不在运行时发现 host 侧新 Service（Remote 装配是 dsh 上游编译期固定的
 * 集合），树外插件取得浏览器可见数据的正规通道就是 webServer 路由。本模块只做
 * 读：列表（listRecent 语义，done 折叠）与详情（note.md 解析结果）。写路径
 * （存档/整合/恢复）永远走模型侧工具，看板不暴露。
 *
 * @module mytool-dsh-notes/web/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { NoteRecentRow } from '../core/recent.ts'
import type { NoteReadResult } from '../core/save.ts'
import type { NotesService } from '../service.ts'

/** 路由命名空间：`/mytool/notes`（列表）与 `/mytool/notes/<id>`（详情）。 */
export const NOTES_ROUTE = '/mytool/notes'

/** 看板列表上限：单用户笔记量级远小于此，防御性封顶。 */
export const DASHBOARD_LIST_LIMIT = 1000

/** 看板列表行：NoteRecentRow 去掉磁盘绝对路径（浏览器无需也不应看到）。 */
export type DashboardRow = Omit<NoteRecentRow, 'path'>

export interface NotesDashboardList {
  generated_at: string
  /** 非 done（spark/active/dormant），updated_at 倒序 —— “最近在跟什么”。 */
  active: DashboardRow[]
  /** done 折叠段（同序）。 */
  done: DashboardRow[]
}

export interface NoteDetailPayload {
  id: string
  title: string
  tags: string[]
  status: string
  updated_at: string
  source: string | null
  summary: string | null
  body: string
}

/** 列表 payload 组装（纯函数，契约测试直接打这里）。 */
export function dashboardList(rows: NoteRecentRow[]): NotesDashboardList {
  const strip = ({ path: _path, ...row }: NoteRecentRow): DashboardRow => row
  return {
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    active: rows.filter((r) => r.status !== 'done').map(strip),
    done: rows.filter((r) => r.status === 'done').map(strip),
  }
}

/** 详情 payload 组装（纯函数）。 */
export function noteDetail(r: NoteReadResult): NoteDetailPayload {
  const fm = r.frontMatter as Record<string, unknown>
  return {
    id: r.id,
    title: String(fm['title'] ?? ''),
    tags: Array.isArray(fm['tags']) ? fm['tags'].map((t) => String(t)) : [],
    status: String(fm['status'] ?? ''),
    updated_at: String(fm['updated_at'] ?? ''),
    source: fm['source'] === undefined ? null : String(fm['source']),
    summary: fm['summary'] === undefined ? null : String(fm['summary']),
    body: r.body,
  }
}

/**
 * 注册看板路由（prefix 一条：裸路径 = 列表，子路径 = 详情）。
 * @returns 注销器（ctx.effect 用）。
 */
export function registerNotesRoutes(ctx: Context, service: NotesService): () => void {
  return ctx.webServer.register({
    kind: 'prefix',
    path: NOTES_ROUTE,
    handler: (req, res) => { handleNotesRequest(service, req, res) },
  })
}

function handleNotesRequest(service: NotesService, req: IncomingMessage, res: ServerResponse): void {
  const method = req.method ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    sendJson(res, method, 405, { error: 'method not allowed' })
    return
  }
  try {
    const url = new URL(req.url ?? '/', 'http://mytool.internal')
    if (url.pathname === NOTES_ROUTE || url.pathname === `${NOTES_ROUTE}/`) {
      sendJson(res, method, 200, dashboardList(service.listRecent({ limit: DASHBOARD_LIST_LIMIT })))
      return
    }
    const id = decodeURIComponent(url.pathname.slice(NOTES_ROUTE.length + 1))
    if (id === '' || id.includes('/')) {
      sendJson(res, method, 400, { error: 'bad note id' })
      return
    }
    sendJson(res, method, 200, noteDetail(service.read(id)))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('note not found')) sendJson(res, method, 404, { error: message })
    else if (message.includes('escapes notes-dir')) sendJson(res, method, 400, { error: message })
    else sendJson(res, method, 500, { error: message })
  }
}

function sendJson(res: ServerResponse, method: string, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store',
  })
  res.end(method === 'HEAD' ? undefined : body)
}
