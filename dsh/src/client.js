/**
 * mytool-dsh-notes 的浏览器半边（client bundle，直接以产物形态维护，形态对齐
 * dsh-diary 的 src/client.js）。
 *
 * 格式约定：window.__ModuleLoader__.load handoff——factory 内的 require 只允许
 * 平台模块表词（react / @deepseek-ai/dsh-client-ui-primitives）。本插件 client
 * 面只有一个侧栏入口链接：真正的看板是 host 吐的独立页面
 * （/mytool/notes/page，见 src/web/page.ts），不在这里渲染内容——因此无需
 * JSX/构建链（旧 tsc→CJS 转换链已随之退役，含其 jsx 别名隐患）。
 *
 * 行为：向 `sidebar.footer.action` 插槽注册「笔记」入口（侧栏底部、设置按钮
 * 上方），新标签页打开看板页面。注意 href 与 src/web/page.ts 的
 * NOTES_PAGE_ROUTE 耦合；改路径时需同步改这里。
 */
window.__ModuleLoader__.load({
  id: 'mytool-dsh-notes',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require('react');
    const { IconListPenOutline16, Tooltip } = require('@deepseek-ai/dsh-client-ui-primitives');

    // 一次性注入按钮样式；data-plugin 双标记与官方 loader 的插件样式约定一致
    // （卸载时按 data-plugin 摘除）。节奏对齐 ui-settings 触发行与 dsh-diary 入口。
    const CSS = [
      '.mytool-notes-entry{display:flex;align-items:center;gap:8px;width:calc(100% + 8px);height:34px;',
      'margin:4px -4px 4px;padding:6px 2px 6px 10px;box-sizing:border-box;border-radius:12px;',
      'background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;',
      'font-size:14px;line-height:22px;text-decoration:none;cursor:pointer;overflow:hidden;}',
      '.mytool-notes-entry:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.mytool-notes-entry .mytool-notes-entry-label{overflow:hidden;white-space:nowrap;}',
      '.mytool-notes-entry.rail{width:36px;height:36px;margin:8px 0 10px;justify-content:center;gap:0;padding:0;border-radius:50%;}',
    ].join('');
    if (document.querySelector('style[data-plugin-css="mytool-dsh-notes/entry"]') === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'mytool-dsh-notes';
      tag.dataset.pluginCss = 'mytool-dsh-notes/entry';
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    /** 侧栏底部的看板入口：wide = 34px 行，rail = 36px 圆形图标。 */
    function NotesEntry({ wide }) {
      const link = React.createElement(
        'a',
        {
          href: '/mytool/notes/page',
          target: '_blank',
          rel: 'noopener',
          className: wide ? 'mytool-notes-entry' : 'mytool-notes-entry rail',
          'aria-label': '打开笔记看板',
        },
        React.createElement(IconListPenOutline16, { size: wide ? 14 : 18 }),
        wide ? React.createElement('span', { className: 'mytool-notes-entry-label' }, '笔记') : null,
      );
      // 展开态按钮自带文字，tooltip 只在 rail 上出现（同 SidebarRoot 的约定）。
      return wide ? link : React.createElement(Tooltip, { label: '笔记', delayMs: 500 }, link);
    }

    /** 只等 slots 服务；看板页面自取数据，client 面无状态。 */
    exports.inject = ['slots'];

    exports.apply = (ctx) => {
      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.footer.action', () =>
            ctx.slots.register(
              { name: 'sidebar.footer.action', id: 'mytool-notes-entry' },
              NotesEntry,
            ),
          ),
        'mytool-dsh-notes: sidebar footer entry',
      );
    };

    return module.exports;
  },
});
