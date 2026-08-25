/**
 * 看板独立页面（ADR 0007 修订：Modal → 独立页，形态对齐 dsh-diary 的自包含 web UI）。
 *
 * 一个 HTML 字符串，vanilla JS，零构建。视觉基调取自用户 course.css：纸面米白、
 * 衬线正文、砖红强调、墨青链接；内容宽 56rem（看板需要比 46rem 课文更宽的行）。
 * 页面只读：数据来自 web 路由的 JSON（/mytool/notes 列表、/mytool/notes/:id 详情），
 * 写路径永远走模型侧工具。
 *
 * @module mytool-dsh-notes/web/page
 */

/** 看板页路径（exact 路由；exact 优先于 /mytool/notes prefix，不会被详情吞掉）。 */
export const NOTES_PAGE_ROUTE = '/mytool/notes/page'

/** 渲染看板页 HTML。 */
export function renderNotesPage(): string {
  return PAGE
}

const PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>笔记看板</title>
<style>
  :root {
    --ink: #1a1a1a; --paper: #fffff8; --soft: #f4f2ea;
    --accent: #b0413e; --accent-soft: #fdf0ef;
    --link: #20536f; --muted: #6b6a63; --code-bg: #f0eee6;
    --ok: #2e7d43; --ok-bg: #eef7f0; --bad: #a03028; --bad-bg: #fbeeed;
    --rule: #d8d4c8; --card: #fffdf4;
    color-scheme: light;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; max-width: 56rem; padding: 2.5rem 1.5rem 4rem;
    font-family: "Iowan Old Style", "Palatino Linotype", "Songti SC", "STSong", Georgia, serif;
    font-size: 1.04rem; line-height: 1.65; color: var(--ink); background: var(--paper);
  }
  header.dash { border-bottom: 2px solid var(--ink); padding-bottom: 1rem; margin-bottom: 1.6rem; }
  .kicker { font-size: .8rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  h1 { font-size: 1.9rem; margin: .3rem 0 .4rem; line-height: 1.25; }
  .meta { font-size: .85rem; color: var(--muted); display: flex; align-items: center; gap: .8rem; flex-wrap: wrap; }
  #refresh {
    margin-left: auto; font: inherit; font-size: .85rem; padding: .35rem 1.1rem;
    border: none; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer;
  }
  #refresh:disabled { opacity: .55; cursor: default; }
  #q {
    font: inherit; font-size: .82rem; padding: .25rem .7rem; width: 13rem;
    border: 1px solid var(--rule); border-radius: 8px; background: #fff; color: var(--ink); outline: none;
  }
  #q:focus { border-color: var(--accent); }
  .views { display: inline-flex; gap: 0; border: 1px solid var(--rule); border-radius: 8px; overflow: hidden; }
  .vbtn {
    font: inherit; font-size: .78rem; padding: .18rem .8rem; border: none;
    background: #fff; color: var(--muted); cursor: pointer;
  }
  .vbtn + .vbtn { border-left: 1px solid var(--rule); }
  .vbtn.on { background: var(--ink); color: var(--paper); }
  .title-row { display: flex; align-items: center; gap: .55rem; }
  #help-btn {
    width: 1.55rem; height: 1.55rem; border-radius: 50%; border: 1px solid var(--rule);
    background: var(--soft); color: var(--muted); font: inherit; font-size: .95rem; line-height: 1;
    cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; flex: none;
  }
  #help-btn:hover { background: var(--accent); border-color: var(--accent); color: #fff; }
  dialog.guide {
    border: 1px solid var(--rule); border-radius: 12px; background: var(--paper); color: var(--ink);
    padding: 0; width: min(40rem, calc(100vw - 2rem)); max-height: calc(100vh - 4rem); font: inherit;
  }
  dialog.guide::backdrop { background: rgba(26, 26, 26, .35); }
  .g-body { padding: 1.5rem 1.8rem 1.8rem; overflow-y: auto; max-height: calc(100vh - 4rem); }
  .g-head { display: flex; align-items: baseline; gap: .6rem; border-bottom: 2px solid var(--ink); padding-bottom: .7rem; }
  .g-close {
    margin-left: auto; font: inherit; font-size: 1.15rem; line-height: 1; border: none; background: none;
    color: var(--muted); cursor: pointer; padding: .1rem .45rem; border-radius: 6px;
  }
  .g-close:hover { color: var(--accent); }
  .g-principle {
    background: var(--accent-soft); border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0;
    padding: .6rem .9rem; font-size: .92rem; margin: 1rem 0 .4rem;
  }
  .guide h2 { font-size: 1.35rem; margin: .2rem 0 0; border-bottom: none; padding-bottom: 0; }
  .guide h3 { font-size: 1.05rem; margin: 1.3rem 0 .4rem; }
  .guide p, .guide li { font-size: .93rem; margin: .35rem 0; }
  .guide ul { padding-left: 1.3rem; margin: .4rem 0; }
  .guide .act { font-weight: 600; margin-top: .8rem; }
  .say { background: var(--code-bg); border-radius: 8px; padding: .45rem .8rem .55rem; font-size: .9rem; margin: .3rem 0 .5rem; }
  .say::before { content: "对 dsh 说："; display: block; color: var(--muted); font-size: .76rem; margin-bottom: .1rem; }
  .guide code { font-family: "SF Mono", Menlo, Consolas, "PingFang SC", monospace; font-size: .86em; background: var(--code-bg); padding: .08em .3em; border-radius: 3px; }
  .guide details { border: 1px dashed var(--rule); border-radius: 8px; padding: .5rem .85rem .6rem; margin: .5rem 0; }
  .guide details > summary { cursor: pointer; font-weight: 600; font-size: .95rem; }
  .guide details[open] > summary { margin-bottom: .25rem; }
  h2 { font-size: 1.3rem; margin: 2.2rem 0 0; border-bottom: 1px solid var(--rule); padding-bottom: .25rem; }
  article.note { border: 1px solid var(--rule); border-radius: 10px; background: var(--card); padding: .9rem 1.2rem; margin: 1rem 0; }
  .note-head {
    display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; width: 100%;
    text-align: left; font: inherit; background: none; border: none; cursor: pointer; padding: 0; color: inherit;
  }
  .note-head:hover .note-title { color: var(--link); }
  .note-title { font-weight: 600; font-size: 1.06rem; }
  .caret { color: var(--muted); font-size: .8rem; }
  .chip { font-size: .72rem; letter-spacing: .05em; border-radius: 999px; padding: .12rem .6rem; background: var(--soft); color: var(--muted); white-space: nowrap; }
  .chip.s-spark { background: var(--accent-soft); color: var(--accent); }
  .chip.s-active { background: var(--ok-bg); color: var(--ok); }
  .chip.s-dormant { background: var(--soft); color: var(--muted); }
  .chip.s-done { background: var(--soft); color: var(--muted); }
  .chip.s-stale { background: var(--bad-bg); color: var(--bad); }
  .note-age { font-size: .8rem; color: var(--muted); margin-left: auto; white-space: nowrap; }
  .note-sum { margin: .5rem 0 0; font-size: .95rem; }
  .note-tags { margin-top: .45rem; display: flex; gap: .4rem; flex-wrap: wrap; }
  .kw { background: var(--code-bg); color: var(--muted); border-radius: 999px; padding: .05rem .55rem; font-size: .74rem; font-family: "SF Mono", Menlo, Consolas, "PingFang SC", monospace; }
  .detail { display: none; margin-top: .9rem; border-top: 1px dashed var(--rule); padding-top: .9rem; font-size: .95rem; }
  article.note.open .detail { display: block; }
  .detail-meta { font-size: .82rem; color: var(--muted); margin-bottom: .6rem; display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
  .detail .loading { color: var(--muted); }
  .detail h1, .detail h2, .detail h3 { border-bottom: 1px solid var(--rule); padding-bottom: .2rem; margin: 1.4rem 0 .6rem; }
  .detail h1 { font-size: 1.25rem; } .detail h2 { font-size: 1.12rem; } .detail h3 { font-size: 1rem; }
  .detail pre { background: var(--code-bg); padding: .8rem 1rem; border-radius: 6px; overflow-x: auto; line-height: 1.5; font-size: .84rem; }
  .detail code { font-family: "SF Mono", Menlo, Consolas, "PingFang SC", monospace; font-size: .86em; background: var(--code-bg); padding: .08em .3em; border-radius: 3px; }
  .detail pre code { background: none; padding: 0; }
  .detail blockquote { margin: 1rem 0; padding: .35rem 1rem; border-left: 3px solid var(--accent); background: var(--accent-soft); }
  .detail a { color: var(--link); }
  .detail ul, .detail ol { padding-left: 1.5rem; }
  .detail hr { border: none; border-top: 1px solid var(--rule); margin: 1.2rem 0; }
  details.done { margin-top: 2.2rem; }
  details.done > summary { font-size: 1.3rem; border-bottom: 1px solid var(--rule); padding-bottom: .25rem; cursor: pointer; list-style: none; }
  details.done > summary::before { content: "▸ "; color: var(--muted); }
  details.done[open] > summary::before { content: "▾ "; }
  /* 二维卡片排列：56rem 行宽下每行 4 张（minmax 180px）；展开的卡跨整行 */
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: .9rem; align-items: start; }
  .card-grid > article.note { margin: 0; }
  .card-grid .note-sum { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .card-grid .note-tags .kw:nth-child(n+4) { display: none; }
  .card-grid article.note.open { grid-column: 1 / -1; }
  .card-grid article.note.open .note-sum { display: block; -webkit-line-clamp: none; overflow: visible; }
  .card-grid article.note.open .note-tags .kw:nth-child(n+4) { display: inline-block; }
  .empty { color: var(--muted); margin-top: 1rem; }
  .err { display: none; margin-top: 1rem; padding: .8rem 1rem; border-radius: 8px; background: var(--bad-bg); color: var(--bad); white-space: pre-wrap; font-size: .9rem; }
</style>
</head>
<body>
<header class="dash">
  <div class="kicker">沉淀引擎 · 人类读档</div>
  <div class="title-row">
    <h1>笔记看板</h1>
    <button id="help-btn" type="button" aria-label="使用指南" title="使用指南">?</button>
  </div>
  <div class="meta">
    <span id="meta">加载中…</span>
    <input id="q" type="search" placeholder="搜索标题/标签/摘要…" autocomplete="off" aria-label="搜索笔记">
    <div class="views" role="group" aria-label="排列方式">
      <button class="vbtn" id="v-list" type="button">列表</button>
      <button class="vbtn" id="v-card" type="button">卡片</button>
    </div>
    <button id="refresh" type="button">刷新</button>
  </div>
</header>
<main>
  <h2 id="active-h"></h2>
  <div id="active"></div>
  <details class="done" id="done-wrap" style="display:none">
    <summary id="done-h"></summary>
    <div id="done"></div>
  </details>
  <div class="empty" id="empty" style="display:none">还没有在跟的笔记。</div>
  <div class="empty" id="nomatch" style="display:none">无匹配的笔记。</div>
  <div class="err" id="err"></div>
</main>
<dialog class="guide" id="guide" aria-labelledby="guide-title">
  <div class="g-body">
    <div class="g-head">
      <span class="kicker">沉淀引擎 · 使用指南</span>
      <button class="g-close" type="button" aria-label="关闭">×</button>
    </div>
    <h2 id="guide-title">怎么用这套笔记系统？</h2>
    <p class="g-principle">第一原则：这块看板<b>只读</b>——它只负责让你「看见」所有笔记；一切写入（新建、并入、完结、回滚）都发生在 <b>dsh 对话</b>里。你对 dsh 说话，它替你落盘，且永不无声丢失。</p>
    <p>懒人通道：在 dsh 输入框打 <code>/note + 内容</code>，客户端直接把文本转交笔记技能处理（不经模型猜测该不该用技能）。下面的话术则完全不用记命令，说了就能召回。</p>

    <h3>快速上手 · 对 dsh 说这些话</h3>

    <p class="act">存一条新想法（增）</p>
    <div class="say">存个笔记：想学做饭，先搞懂锅温、油温的底层原理。</div>
    <p>dsh 会拟好标题与标签落盘，读回给你看，并告诉你这条笔记的 id。灵感就从这个动作开始——它是「还没长大的笔记」。</p>

    <p class="act">看看我在跟什么（查）</p>
    <div class="say">我最近在搞什么？</div>
    <div class="say">帮我读读关于做饭的那条笔记。</div>
    <p>前者列出最近在跟的笔记（久未触碰的会标 ⚠ 遗忘风险）；后者按关键词召回并读回全文，不需要记 id。</p>

    <p class="act">喂新材料（改 · 整合）</p>
    <div class="say">把这段并进做饭笔记：今天学到肉下锅前要回温，避免外糊内冷……</div>
    <p>不是把文字贴到文末，而是<b>整合</b>：去重、总结、体系化地并进正文。如果 dsh 拿不准该并入哪条，它会先把候选摆给你看再动手。</p>

    <p class="act">完结与反悔</p>
    <div class="say">做饭这条先搁置。 ／ 这条完成归档吧。 ／ 撤销刚才那次整合。</div>
    <p>状态随口流转：灵感 spark → 在跟 active → 搁置 dormant → 完结 done（看板自动折叠）。整合错了就说「撤销」，自动从备份回滚上一版。</p>

    <h3>深入一点</h3>
    <details>
      <summary>笔记的一生：四种状态</summary>
      <p><b>spark</b>（灵感幼体）→ <b>active</b>（在跟）→ <b>dormant</b>（搁置）→ <b>done</b>（完结）。状态由你在对话里随口流转，看板按它分组与折叠。灵感长大后<b>仍是同一条笔记</b>，不会另建。</p>
    </details>
    <details>
      <summary>为什么说「永不丢失」？</summary>
      <p>每次整合前，旧版全文自动存进同目录的 <code>note.md.bak</code>；说「回滚 XX 笔记」即可恢复上一版，再回滚一次就撤销本次回滚。本引擎<b>没有删除</b>——完结（done）不是丢弃，历史永远在。</p>
    </details>
    <details>
      <summary>整合管线在背后做了什么</summary>
      <p>dsh 先用关键词找候选既有笔记（<code>note_find_candidates</code>），读全文判定「并入既有」还是「新建」，拿不准会先问你；然后重写正文（<code>note_integrate</code>）：新材料要点融入、无逐字重复、矛盾不静默覆盖（双观点保留并标记），最后刷新 updated_at、留 .bak。</p>
    </details>
    <details>
      <summary>⚠ 遗忘风险是什么？</summary>
      <p>一条在跟笔记超过设定天数没有新材料，看板就会标 ⚠，提醒你「要么喂它、要么完结它、要么先搁置」——护住长期主义，不让笔记变成坟场。</p>
    </details>

    <h3>看板操作</h3>
    <ul>
      <li><b>搜索</b>：页头搜索框按标题/标签/摘要/状态本地过滤（在跟与已完成都过滤，不发请求）；清空恢复全部。</li>
      <li><b>列表 / 卡片</b>：页头切换排列。卡片为二维网格（每行 4 张，信息密度更高），点开的卡跨整行；偏好会被记住。</li>
      <li><b>展开全文</b>：点笔记标题行，展开元信息与正文。</li>
      <li><b>刷新</b>：手动拉取最新数据（页面不自动轮询）。</li>
      <li>看板永远只读——想改什么，回 dsh 对话说。</li>
    </ul>
  </div>
</dialog>
<script>
(function () {
  'use strict';
  var meta = document.getElementById('meta');
  var refresh = document.getElementById('refresh');
  var activeH = document.getElementById('active-h');
  var activeBox = document.getElementById('active');
  var doneWrap = document.getElementById('done-wrap');
  var doneH = document.getElementById('done-h');
  var doneBox = document.getElementById('done');
  var emptyBox = document.getElementById('empty');
  var errBox = document.getElementById('err');
  var searchBox = document.getElementById('q');
  var nomatchBox = document.getElementById('nomatch');
  var vList = document.getElementById('v-list');
  var vCard = document.getElementById('v-card');
  var expanded = {};   // id -> true（刷新后保持展开）
  var details = {};    // id -> 已拉取的详情 payload
  var currentList = null;  // 最近一次渲染的列表（本地过滤用）
  var mode = 'card';   // 'list' | 'card'，localStorage 持久化
  try {
    var saved = localStorage.getItem('notes-dash-view');
    if (saved === 'list' || saved === 'card') mode = saved;
  } catch (e) { /* localStorage 不可用时用默认值 */ }

  function applyMode() {
    var grid = mode === 'card';
    activeBox.className = grid ? 'card-grid' : '';
    doneBox.className = grid ? 'card-grid' : '';
    vList.classList.toggle('on', !grid);
    vCard.classList.toggle('on', grid);
  }

  function setMode(m) {
    mode = m;
    try { localStorage.setItem('notes-dash-view', m); } catch (e) { /* 忽略 */ }
    applyMode();
  }
  vList.addEventListener('click', function () { setMode('list'); });
  vCard.addEventListener('click', function () { setMode('card'); });
  applyMode();

  var helpBtn = document.getElementById('help-btn');
  var guide = document.getElementById('guide');
  var guideOpenedAt = 0;  // 打开后 250ms 内忽略遮罩点击（防合成点击穿透即刻关窗）
  helpBtn.addEventListener('click', function () { guideOpenedAt = Date.now(); guide.showModal(); });
  guide.querySelector('.g-close').addEventListener('click', function () { guide.close(); });
  guide.addEventListener('click', function (ev) {
    if (ev.target === guide && Date.now() - guideOpenedAt > 250) guide.close();
  });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 迷你 Markdown：先整体转义，再做受控替换。覆盖笔记里实际出现的子集：
  // 标题/围栏代码/行内代码/粗斜体/引用/分隔线/列表/链接。
  function md(src) {
    var fence = String.fromCharCode(96);
    var lines = esc(src).split(/\\n/);
    var out = [];
    var i = 0;
    function inline(t) {
      t = t.replace(new RegExp(fence + '([^' + fence + ']+)' + fence, 'g'), '<code>$1</code>');
      t = t.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      t = t.replace(/(^|[^*])\\*([^*]+)\\*/g, '$1<em>$2</em>');
      t = t.replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g, function (m, text, url) {
        if (!/^(https?:|#|\\/)/.test(url)) return m;
        return '<a href="' + url + '" rel="noopener">' + text + '</a>';
      });
      return t;
    }
    while (i < lines.length) {
      var line = lines[i];
      if (line.indexOf(fence + fence + fence) === 0) {
        var buf = [];
        i++;
        while (i < lines.length && lines[i].indexOf(fence + fence + fence) !== 0) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre><code>' + buf.join('\\n') + '</code></pre>');
        continue;
      }
      var h = /^(#{1,3})\\s+(.*)$/.exec(line);
      if (h) { out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'); i++; continue; }
      if (/^(---+|\\*\\*\\*+)$/.test(line.trim())) { out.push('<hr>'); i++; continue; }
      if (line.indexOf('&gt;') === 0) {
        var q = [];
        while (i < lines.length && lines[i].indexOf('&gt;') === 0) { q.push(lines[i].replace(/^&gt;\\s?/, '')); i++; }
        out.push('<blockquote><p>' + q.map(inline).join('<br>') + '</p></blockquote>');
        continue;
      }
      var bullet = /^([-*])\\s+(.*)$/.exec(line);
      var num = /^\\d+\\.\\s+(.*)$/.exec(line);
      if (bullet || num) {
        var tag = bullet ? 'ul' : 'ol';
        var items = [];
        while (i < lines.length) {
          var m = (bullet ? /^([-*])\\s+(.*)$/ : /^\\d+\\.\\s+(.*)$/).exec(lines[i]);
          if (!m) break;
          var it = bullet ? m[2] : m[1];
          // 任务列表项：- [ ] / - [x] → ☐ / ☑
          it = it.replace(/^\\[ \\]\\s*/, '\\u2610 ').replace(/^\\[([xX])\\]\\s*/, '\\u2611 ');
          items.push('<li>' + inline(it) + '</li>');
          i++;
        }
        out.push('<' + tag + '>' + items.join('') + '</' + tag + '>');
        continue;
      }
      if (line.trim() === '') { i++; continue; }
      var para = [];
      while (i < lines.length && lines[i].trim() !== '' &&
             lines[i].indexOf(fence + fence + fence) !== 0 &&
             !/^(#{1,3})\\s/.test(lines[i]) && !/^([-*])\\s/.test(lines[i]) &&
             !/^\\d+\\.\\s/.test(lines[i]) && lines[i].indexOf('&gt;') !== 0) {
        para.push(lines[i]); i++;
      }
      out.push('<p>' + inline(para.join('\\n')).replace(/\\n/g, '<br>') + '</p>');
    }
    return out.join('\\n');
  }

  function chip(cls, text) { return '<span class="chip ' + cls + '">' + esc(text) + '</span>'; }

  function ageText(row) {
    if (row.age_days === null || row.age_days === undefined) return '年龄未知';
    if (row.age_days === 0) return '今天';
    return row.age_days + ' 天前';
  }

  function entryHtml(row) {
    var sum = row.summary !== '' ? row.summary : row.snippet;
    var staleChip = row.stale ? chip('s-stale', '⚠ 遗忘风险') : '';
    var tags = (row.tags || []).map(function (t) { return '<span class="kw">' + esc(t) + '</span>'; }).join('');
    return '<article class="note' + (expanded[row.id] ? ' open' : '') + '" id="note-' + esc(row.id) + '">' +
      '<button type="button" class="note-head" data-id="' + esc(row.id) + '">' +
        '<span class="caret">' + (expanded[row.id] ? '▾' : '▸') + '</span>' +
        '<span class="note-title">' + (row.title === '' ? esc(row.id) : esc(row.title)) + '</span>' +
        chip('s-' + esc(row.status), esc(row.status)) + staleChip +
        '<span class="note-age">' + ageText(row) + '</span>' +
      '</button>' +
      '<p class="note-sum">' + esc(sum) + '</p>' +
      (tags !== '' ? '<div class="note-tags">' + tags + '</div>' : '') +
      '<div class="detail" data-detail="' + esc(row.id) + '"></div>' +
    '</article>';
  }

  function fillDetail(box, d) {
    var tags = d.tags.map(function (t) { return '<span class="kw">' + esc(t) + '</span>'; }).join(' ');
    var source = d.source !== null ? ' · 来源 ' + esc(d.source) : '';
    box.innerHTML =
      '<div class="detail-meta">' + tags + ' · ' + esc(d.status) + ' · ' + esc(d.updated_at) + source + '</div>' +
      md(d.body);
  }

  function loadDetail(row) {
    var box = document.querySelector('[data-detail="' + CSS.escape(row.id) + '"]');
    if (box === null) return;
    if (details[row.id] !== undefined) { fillDetail(box, details[row.id]); return; }
    box.innerHTML = '<p class="loading">详情加载中…</p>';
    fetch('/mytool/notes/' + encodeURIComponent(row.id), { headers: { accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) { details[row.id] = d; fillDetail(box, d); })
      .catch(function (e) { box.innerHTML = '<p class="loading">读取失败：' + esc(String(e.message || e)) + '</p>'; });
  }

  // 本地搜索：只过滤列表数据里有的字段（标题/id/状态/标签/摘要/片段），零请求零落盘。
  function applyFilter() {
    if (currentList === null) return;
    var q = searchBox.value.trim().toLowerCase();
    function filterRows(box, rows) {
      var arts = box.querySelectorAll('article.note');
      var shown = 0;
      rows.forEach(function (row, i) {
        var hay = (row.title + ' ' + row.id + ' ' + row.status + ' ' + (row.tags || []).join(' ')
          + ' ' + (row.summary || '') + ' ' + (row.snippet || '')).toLowerCase();
        var hit = q === '' || hay.indexOf(q) !== -1;
        if (arts[i] !== undefined) arts[i].style.display = hit ? '' : 'none';
        if (hit) shown++;
      });
      return shown;
    }
    var totalA = currentList.active.length, totalD = currentList.done.length;
    var shownA = filterRows(activeBox, currentList.active);
    var shownD = doneWrap.style.display === 'none' ? 0 : filterRows(doneBox, currentList.done);
    activeH.textContent = q === '' ? '在跟（' + totalA + '）' : '在跟（' + shownA + '/' + totalA + '）';
    if (totalD > 0) doneH.textContent = q === '' ? '已完成（' + totalD + '）' : '已完成（' + shownD + '/' + totalD + '）';
    nomatchBox.style.display = q !== '' && shownA === 0 && shownD === 0 ? '' : 'none';
  }
  searchBox.addEventListener('input', applyFilter);
  searchBox.addEventListener('search', applyFilter);  // type=search 原生清除按钮（WebKit 只发 search）

  function render(j) {
    applyMode();
    currentList = j;
    meta.textContent = j.active.length + ' 篇在跟 · ' + j.done.length + ' 篇已完成 · 生成于 ' + j.generated_at;
    activeH.textContent = '在跟（' + j.active.length + '）';
    activeBox.innerHTML = j.active.map(entryHtml).join('');
    if (j.done.length > 0) {
      doneWrap.style.display = '';
      doneH.textContent = '已完成（' + j.done.length + '）';
      doneBox.innerHTML = j.done.map(entryHtml).join('');
    } else {
      doneWrap.style.display = 'none';
    }
    emptyBox.style.display = j.active.length === 0 ? '' : 'none';
    Array.prototype.forEach.call(document.querySelectorAll('.note-head'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var art = btn.closest('article');
        var caret = btn.querySelector('.caret');
        if (expanded[id]) {
          delete expanded[id];
          art.classList.remove('open');
          if (caret !== null) caret.textContent = '▸';
        } else {
          expanded[id] = true;
          art.classList.add('open');
          if (caret !== null) caret.textContent = '▾';
          loadDetail({ id: id });
        }
      });
    });
    Object.keys(expanded).forEach(function (id) { loadDetail({ id: id }); });
    applyFilter();
  }

  function fetchList() {
    errBox.style.display = 'none';
    refresh.disabled = true;
    meta.textContent = '加载中…';
    fetch('/mytool/notes', { headers: { accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(render)
      .catch(function (e) {
        meta.textContent = '';
        errBox.style.display = 'block';
        errBox.textContent = '加载失败：' + String(e.message || e);
      })
      .then(function () { refresh.disabled = false; });
  }

  refresh.addEventListener('click', fetchList);
  fetchList();
})();
</script>
</body>
</html>
`
