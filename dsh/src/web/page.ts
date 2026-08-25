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
  .views { display: inline-flex; gap: 0; border: 1px solid var(--rule); border-radius: 8px; overflow: hidden; }
  .vbtn {
    font: inherit; font-size: .78rem; padding: .18rem .8rem; border: none;
    background: #fff; color: var(--muted); cursor: pointer;
  }
  .vbtn + .vbtn { border-left: 1px solid var(--rule); }
  .vbtn.on { background: var(--ink); color: var(--paper); }
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
  <h1>笔记看板</h1>
  <div class="meta">
    <span id="meta">加载中…</span>
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
  <div class="err" id="err"></div>
</main>
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
  var vList = document.getElementById('v-list');
  var vCard = document.getElementById('v-card');
  var expanded = {};   // id -> true（刷新后保持展开）
  var details = {};    // id -> 已拉取的详情 payload
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

  function render(j) {
    applyMode();
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
