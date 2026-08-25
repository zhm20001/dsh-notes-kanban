/**
 * 看板 JSON 路由的契约测试（ADR 0007）。
 *
 * 缝 = HTTP：fake req/res 直接驱动 handler，core 用真实实现
 * （listRecent/readNote），只替换 ctx.webServer 注册与 NotesService 委托。
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { listRecent } from '../src/core/recent.ts'
import { readNote } from '../src/core/save.ts'
import type { NotesService } from '../src/service.ts'
import { dashboardList, NOTES_PAGE_ROUTE, NOTES_ROUTE, noteDetail, registerNotesRoutes } from '../src/web/routes.ts'
import { renderNotesPage } from '../src/web/page.ts'
import { makeNotesDir, writeNote, type NoteDir } from './helpers.ts'

interface Captured {
  status: number
  headers: Record<string, unknown>
  body: string
}

function fakeRes(): { res: ServerResponse; captured: Captured } {
  const captured: Captured = { status: 0, headers: {}, body: '' }
  const res = {
    writeHead(status: number, headers: Record<string, unknown>) {
      captured.status = status
      captured.headers = headers
    },
    end(chunk?: string) {
      if (chunk !== undefined) captured.body += chunk
    },
  } as unknown as ServerResponse
  return { res, captured }
}

function fakeReq(method: string, url: string): IncomingMessage {
  return { method, url } as unknown as IncomingMessage
}

/** 真实 core + 最小 ctx/service 替身；返回捕获的响应。 */
function drive(dir: NoteDir, method: string, url: string): Captured {
  const { res, captured } = fakeRes()
  const routes: { kind: 'exact' | 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }[] = []
  const ctx = {
    webServer: { register: (route: (typeof routes)[number]) => {
      routes.push(route)
      return () => {}
    } },
  } as unknown as Context
  const service = {
    listRecent: (opts: Parameters<NotesService['listRecent']>[0]) => listRecent(dir.dir, opts),
    read: (id: string) => readNote(dir.dir, id),
  } as unknown as NotesService
  registerNotesRoutes(ctx, service)
  // 复刻宿主调度：exact 命中优先，否则最长前缀（宿主 webServer 同语义）。
  const pathname = url.split('?')[0]
  const exact = routes.find((r) => r.kind === 'exact' && r.path === pathname)
  const match = exact ?? routes
    .filter((r) => r.kind === 'prefix' && (pathname === r.path || pathname.startsWith(`${r.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0]
  if (match === undefined) throw new Error(`test webserver: no route for ${pathname}`)
  match.handler(fakeReq(method, url), res)
  return captured
}

let dir: NoteDir | undefined
afterEach(() => { dir = undefined })

describe('dashboardList（纯整形）', () => {
  it('done 折叠到尾部段，非 done 保持 updated_at 倒序', () => {
    const d = makeNotesDir()
    writeNote(d, 'a-old-done', { title: 'A', status: 'done', updated_at: '2026-01-01T00:00:00Z' })
    writeNote(d, 'b-new', { title: 'B', updated_at: '2026-08-20T00:00:00Z' })
    writeNote(d, 'c-mid', { title: 'C', updated_at: '2026-05-01T00:00:00Z' })
    const payload = dashboardList(listRecent(d.dir, { limit: 1000 }))
    expect(payload.active.map((r) => r.id)).toEqual(['b-new', 'c-mid'])
    expect(payload.done.map((r) => r.id)).toEqual(['a-old-done'])
  })

  it('行不含磁盘绝对路径（path 剥离）', () => {
    const d = makeNotesDir()
    writeNote(d, 'x', { title: 'X' })
    const payload = dashboardList(listRecent(d.dir, { limit: 1000 }))
    expect(payload.active[0]).not.toHaveProperty('path')
  })

  it('generated_at 是 ISO-Z 时间戳', () => {
    const payload = dashboardList([])
    expect(payload.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  })
})

describe('noteDetail（纯整形）', () => {
  it('front-matter 字段 + 正文；可选字段缺席为 null', () => {
    const d = makeNotesDir()
    writeNote(d, 'n', { title: 'T', tags: ['a'], body: '正文' })
    const payload = noteDetail(readNote(d.dir, 'n'))
    expect(payload).toMatchObject({ id: 'n', title: 'T', tags: ['a'], body: '正文', source: null, summary: null })
  })
})

describe('GET 路由', () => {
  it(`GET ${NOTES_ROUTE} → 200 + JSON + no-store`, () => {
    dir = makeNotesDir()
    writeNote(dir, 'live', { title: 'Live', updated_at: '2026-08-20T00:00:00Z' })
    const captured = drive(dir, 'GET', NOTES_ROUTE)
    expect(captured.status).toBe(200)
    expect(captured.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(captured.headers['cache-control']).toBe('no-store')
    const parsed = JSON.parse(captured.body) as { active: { id: string }[] }
    expect(parsed.active.map((r) => r.id)).toEqual(['live'])
  })

  it('GET /mytool/notes/<id> → 200 详情', () => {
    dir = makeNotesDir()
    writeNote(dir, 'n1', { title: '一篇', body: '# 正文' })
    const captured = drive(dir, 'GET', `${NOTES_ROUTE}/n1`)
    expect(captured.status).toBe(200)
    expect(JSON.parse(captured.body)).toMatchObject({ id: 'n1', title: '一篇', body: '# 正文' })
  })

  it('未知 id → 404 JSON error', () => {
    dir = makeNotesDir()
    const captured = drive(dir, 'GET', `${NOTES_ROUTE}/nope`)
    expect(captured.status).toBe(404)
    expect(JSON.parse(captured.body).error).toContain('note not found')
  })

  it('含斜杠/穿越的 id → 400', () => {
    dir = makeNotesDir()
    expect(drive(dir, 'GET', `${NOTES_ROUTE}/a%2Fb`).status).toBe(400)
    expect(drive(dir, 'GET', `${NOTES_ROUTE}/..%2F..%2Fetc`).status).toBe(400)
  })

  it('POST → 405', () => {
    dir = makeNotesDir()
    expect(drive(dir, 'POST', NOTES_ROUTE).status).toBe(405)
  })
})

describe('GET 页面路由', () => {
  it(`GET ${NOTES_PAGE_ROUTE} → 200 + text/html + no-store，含看板骨架`, () => {
    const captured = drive(makeNotesDir(), 'GET', NOTES_PAGE_ROUTE)
    expect(captured.status).toBe(200)
    expect(captured.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(captured.headers['cache-control']).toBe('no-store')
    for (const marker of ['笔记看板', 'id="refresh"', 'id="v-card"', 'card-grid', '/mytool/notes']) {
      expect(captured.body).toContain(marker)
    }
  })

  it('HEAD 页面 → 200 空 body', () => {
    const captured = drive(makeNotesDir(), 'HEAD', NOTES_PAGE_ROUTE)
    expect(captured.status).toBe(200)
    expect(captured.body).toBe('')
  })

  it('POST 页面 → 405', () => {
    expect(drive(makeNotesDir(), 'POST', NOTES_PAGE_ROUTE).status).toBe(405)
  })

  it('renderNotesPage 输出自包含 HTML（无外部资源引用）', () => {
    const page = renderNotesPage()
    expect(page).toMatch(/^<!doctype html>/i)
    expect(page).not.toContain('<link')
    expect(page).not.toContain('src="http')
  })
})
