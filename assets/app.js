(function () {
  'use strict';

  var nav = document.getElementById('nav');
  var content = document.getElementById('content');
  var search = document.getElementById('search');
  var menuBtn = document.getElementById('menuBtn');
  var sidebarEl = document.getElementById('sidebar');
  var tabbar = document.querySelector('.tabbar');
  var printBtn = document.getElementById('printBtn');
  var themeBtn = document.getElementById('themeBtn');
  var backdrop = document.getElementById('backdrop');
  var docTitle = document.getElementById('docTitle');
  var wakeBtn = document.getElementById('wakeBtn');
  var progressBar = document.querySelector('#progress span');
  var toTop = document.getElementById('toTop');

  var SITE = null;
  var allLinks = [];
  var titles = {};
  var groupState = {}; // 分组标题 -> 是否展开
  var sectionsByKey = {};

  /* ---------- 主题 ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#1c2024' : '#ffffff');
    try { localStorage.setItem('theme', t); } catch (e) {}
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('theme'); } catch (e) {}
    if (saved === 'dark' || saved === 'light') return applyTheme(saved);
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme('dark');
  }
  themeBtn.addEventListener('click', function () {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  initTheme();

  /* ---------- 滚动条占位宽度（Safari/Chrome 经典滚动条会挤占右侧） ---------- */
  function updateSbw() {
    if (scrollLocked) return; // 锁定时滚动条消失，不要把这时的值当基准
    var w = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.documentElement.style.setProperty('--sbw', w + 'px');
  }
  updateSbw();
  window.addEventListener('resize', updateSbw);
  window.addEventListener('orientationchange', function () { setTimeout(updateSbw, 120); });
  if (window.ResizeObserver) new ResizeObserver(updateSbw).observe(document.documentElement);

  /* ---------- 软键盘高度 ----------
   * iOS 弹出键盘时只改变 visual viewport，layout viewport 不动，
   * 所以 fixed 定位的底部面板会被键盘盖住。用 --kb 把它顶上去。
   */
  function updateKeyboardInset() {
    var vv = window.visualViewport;
    var kb = 0;
    if (vv) kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    // 小于 120px 基本是浏览器工具栏的误差，不算键盘
    document.documentElement.style.setProperty('--kb', kb > 120 ? kb + 'px' : '0px');
  }
  updateKeyboardInset();
  if (window.visualViewport) window.visualViewport.addEventListener('resize', updateKeyboardInset);
  window.addEventListener('orientationchange', function () { setTimeout(updateKeyboardInset, 120); });

  /* ---------- 屏幕常亮（Wake Lock） ---------- */
  var WAKE_SUPPORTED = ('wakeLock' in navigator);
  var wakeLock = null;
  var wakeWanted = false;

  function updateWakeBtn() {
    if (!wakeBtn) return;
    if (!WAKE_SUPPORTED) { wakeBtn.hidden = true; return; } // 不支持则隐藏，不占位
    wakeBtn.hidden = false;
    wakeBtn.classList.toggle('on', !!wakeLock);
    wakeBtn.setAttribute('aria-pressed', wakeLock ? 'true' : 'false');
    wakeBtn.title = wakeLock ? '屏幕常亮：已开' : '屏幕常亮：已关';
  }
  function acquireWake(report) {
    if (!WAKE_SUPPORTED) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; updateWakeBtn(); });
      updateWakeBtn();
      if (report) showToast({ icon: '💡', title: '屏幕常亮已开', text: '看食谱时不会熄屏' });
    }).catch(function (err) {
      wakeLock = null;
      updateWakeBtn();
      if (report) showToast({ icon: '⚠️', title: '无法开启常亮', text: (err && err.message) || '浏览器限制' });
    });
  }
  function releaseWake() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
    updateWakeBtn();
  }

  if (wakeBtn) {
    try { wakeWanted = localStorage.getItem('wake') === '1'; } catch (e) {}
    updateWakeBtn();

    wakeBtn.addEventListener('click', function () {
      if (!WAKE_SUPPORTED) return;
      wakeWanted = !wakeWanted;
      try { localStorage.setItem('wake', wakeWanted ? '1' : '0'); } catch (e) {}
      if (wakeWanted) acquireWake(true);
      else { releaseWake(); showToast({ icon: '🌙', title: '屏幕常亮已关' }); }
    });

    // 页面重新可见时，续上（系统在隐藏时会自动释放）
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && wakeWanted && !wakeLock) acquireWake(false);
    });
    // 首次交互时补一次（请求 Wake Lock 常需要用户手势）
    var retry = function () { if (wakeWanted && !wakeLock) acquireWake(false); else if (typeof syncWake === 'function') syncWake(); };
    document.addEventListener('pointerdown', retry, { passive: true });
    document.addEventListener('keydown', retry);

    if (wakeWanted) acquireWake(false);
  }

  /* ---------- 工具 ---------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function decodeHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return null;
    try { return decodeURIComponent(h); } catch (e) { return h; }
  }
  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }
  var currentPath = null;

  /* ---------- 站点根路径与 URL 映射 ---------- */
  var BASE = (function () {
    var b = document.documentElement.getAttribute('data-base') || '/';
    return b.replace(/\/?$/, '/');
  })();
  function encodePath(p) { return p.split('/').map(encodeURIComponent).join('/'); }
  /** 文档路径 -> 可分享的页面 URL（'05-食谱库/花卷.md' -> '/easyvlog/05-食谱库/花卷/'） */
  function docUrl(path) { return BASE + encodePath(path.replace(/\.md$/, '/')); }
  /** 文档路径 -> 原始 Markdown 的 URL */
  function mdUrl(path) { return BASE + encodePath(path); }
  /** 当前地址栏 -> 文档路径（不是文档页则返回 null） */
  function docFromLocation() {
    var p = location.pathname;
    if (p.indexOf(BASE) !== 0) return null;
    var rest = p.slice(BASE.length);
    try { rest = decodeURIComponent(rest); } catch (e) {}
    rest = rest.replace(/index\.html$/, '').replace(/\/+$/, '');
    return rest ? rest + '.md' : null;
  }
  function closeNav() {
    document.body.classList.remove('nav-open');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
    syncScrollLock();
    restoreFocus();
  }
  function openNav() {
    if (document.body.classList.contains('timer-open')) closeTimerPanel();
    rememberFocus();
    document.body.classList.add('nav-open');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
    syncScrollLock();
    focusPanel(sidebarEl);
  }

  /* ---------- 焦点管理（弹层打开时焦点移入，关闭后还原） ---------- */
  var lastFocus = null;
  function rememberFocus() { lastFocus = document.activeElement; }
  function restoreFocus() {
    var prev = lastFocus;
    lastFocus = null;
    if (!prev || typeof prev.focus !== 'function') return;
    var ae = document.activeElement;
    var insidePanel = ae && ((sidebarEl && sidebarEl.contains(ae)) || (timerPanel && timerPanel.contains(ae)));
    if (insidePanel || ae === document.body) {
      try { prev.focus({ preventScroll: true }); } catch (e) {}
    }
  }
  function focusPanel(el) {
    if (el && typeof el.focus === 'function') { try { el.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ---------- 滚动锁定（弹层打开时锁住背景） ---------- */
  var scrollLockY = 0, scrollLocked = false;
  function lockScroll() {
    if (scrollLocked) return;
    scrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = (-scrollLockY) + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    scrollLocked = true;
    // 锁定后页面滚动条消失，此时量到的宽度会变大，要冻结住避免顶栏按钮横移
    if (window.innerWidth - document.documentElement.clientWidth > 0) {
      document.body.style.paddingRight = (window.innerWidth - document.documentElement.clientWidth) + 'px';
    }
  }
  function unlockScroll() {
    if (!scrollLocked) return;
    var y = scrollLockY;
    var root = document.documentElement;
    // 关键：临时关掉全局平滑滚动，否则 scrollTo 会变成动画，
    // 用户看到的就是“页面刷新后又滚回原位置”。
    var prevBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';

    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.paddingRight = '';
    scrollLocked = false;

    window.scrollTo(0, y);
    void root.offsetHeight; // 强制同步生效，再恢复平滑滚动
    root.style.scrollBehavior = prevBehavior;
  }
  function syncScrollLock() {
    var open = document.body.classList.contains('nav-open') || document.body.classList.contains('timer-open');
    open ? lockScroll() : unlockScroll();
  }
  function setActive(path) {
    allLinks.forEach(function (a) {
      var on = a.dataset.path === path;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (docTitle) docTitle.textContent = titles[path] || '私人食谱库';
    updateTabs(path);
  }
  function updateTabs(path) {
    if (!tabbar) return;
    tabbar.querySelectorAll('.tab').forEach(function (b) {
      var a = b.dataset.action, on = false;
      if (a === 'today') on = !!(SITE && SITE.today && path === SITE.today.path);
      else if (a === 'recipes') on = path.indexOf('05-食谱库/') === 0;
      else if (a === 'scripts') on = path.indexOf('02-分集脚本/') === 0;
      b.classList.toggle('active', on);
    });
  }
  function go(path, opts) {
    if (!path) return;
    try {
      var url = docUrl(path) + (location.hash && location.hash.length > 1 ? location.hash : '');
      if (opts && opts.replace) history.replaceState({ doc: path }, '', url);
      else history.pushState({ doc: path }, '', docUrl(path));
    } catch (e) { /* file:// 下 history 不可用，降级为直接渲染 */ }
    navigate(path);
  }

  var TOAST_ICONS = { timer: '#ic-timer', printer: '#ic-printer', check: '#ic-check', info: '#ic-info', theme: '#ic-sun-moon', alert: '#ic-info' };
  var toastEl = null, toastTimer = null;
  function hideToast() { if (toastEl) toastEl.classList.remove('show'); }
  function showToast(opts) {
    if (typeof opts === 'string') opts = { text: opts };
    opts = opts || {};
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.innerHTML =
        '<svg class="ic t-icon" aria-hidden="true"><use href="#ic-info"/></svg>' +
        '<div class="t-body"><div class="t-title"></div><div class="t-text"></div></div>' +
        '<button class="t-close" aria-label="关闭"><svg class="ic" aria-hidden="true"><use href="#ic-x"/></svg></button>';
      toastEl.querySelector('.t-close').addEventListener('click', hideToast);
      document.body.appendChild(toastEl);
    }
    toastEl.querySelector('.t-icon use').setAttribute('href', TOAST_ICONS[opts.icon] || '#ic-info');
    var titleEl = toastEl.querySelector('.t-title');
    titleEl.textContent = opts.title || '';
    titleEl.style.display = opts.title ? '' : 'none';
    toastEl.querySelector('.t-text').textContent = opts.text || '';
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, opts.ms || 4200);
  }

  function stripFrontMatter(md) {
    if (md.slice(0, 3) === '---') {
      var m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
      if (m) return md.slice(m[0].length);
    }
    return md;
  }
  function slug(s) {
    return s.trim().toLowerCase().replace(/[^\w\u4e00-\u9fa5 -]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
  }

  /* ---------- 导航（可折叠分组） ---------- */
  function loadState() {
    try { groupState = JSON.parse(localStorage.getItem('navGroups') || '{}') || {}; }
    catch (e) { groupState = {}; }
  }
  function saveState() {
    try { localStorage.setItem('navGroups', JSON.stringify(groupState)); } catch (e) {}
  }
  function defaultOpen(sec) {
    if (sec.highlight) return true;
    if (SITE.today && sec.items.some(function (i) { return i.path === SITE.today.path; })) return true;
    return false;
  }
  function isOpen(sec) {
    return groupState.hasOwnProperty(sec.title) ? !!groupState[sec.title] : defaultOpen(sec);
  }

  /** 目录里的链接：拦截默认跳转，走前端路由（手机上手风更顺） */
  function navClick(ev, path) {
    if (ev.defaultPrevented || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    closeNav();
    go(path);
  }

  function makeLink(it) {
    var a = document.createElement('a');
    a.href = docUrl(it.path);
    a.dataset.path = it.path;
    a.dataset.search = (it.title + ' ' + it.path).toLowerCase();
    a.textContent = it.title;
    a.addEventListener('click', function (ev) { navClick(ev, it.path); });
    allLinks.push(a);
    titles[it.path] = it.title;
    return a;
  }

  function buildNav() {
    nav.innerHTML = '';
    allLinks = [];
    titles = {};
    loadState();

    if (SITE.today && SITE.today.path) {
      var pin = document.createElement('a');
      pin.className = 'pin';
      pin.href = docUrl(SITE.today.path);
      pin.dataset.path = SITE.today.path;
      pin.dataset.search = ('今日要做 ' + SITE.today.title + ' ' + SITE.today.path).toLowerCase();
      pin.innerHTML =
        '<span class="pin-label"><svg class="ic" aria-hidden="true"><use href="#ic-utensils"/></svg>今日要做</span>' +
        '<span class="pin-title">' + escapeHtml(SITE.today.title) + '</span>' +
        (SITE.today.note ? '<span class="pin-note">' + escapeHtml(SITE.today.note) + '</span>' : '');
      pin.addEventListener('click', function (ev) { navClick(ev, SITE.today.path); });
      nav.appendChild(pin);
      allLinks.push(pin);
      titles[SITE.today.path] = SITE.today.title;
    }

    SITE.sections.forEach(function (sec) {
      sectionsByKey[sec.title] = sec;
      var group = document.createElement('div');
      group.className = 'group' + (sec.highlight ? ' hl' : '') + (isOpen(sec) ? ' open' : '');
      group.dataset.key = sec.title;

      var head = document.createElement('button');
      head.type = 'button';
      head.className = 'group-head';
      head.setAttribute('aria-expanded', isOpen(sec) ? 'true' : 'false');
      head.innerHTML =
        '<svg class="ic" aria-hidden="true"><use href="#ic-' + escapeHtml(sec.icon || 'info') + '"/></svg>' +
        '<span class="g-name">' + escapeHtml(sec.title) + '</span>' +
        '<span class="g-count">' + sec.items.length + '</span>' +
        '<svg class="ic g-chev" aria-hidden="true"><use href="#ic-chevron-right"/></svg>';
      var bodyId = 'grp-' + slug(sec.title);
      head.setAttribute('aria-controls', bodyId);
      head.addEventListener('click', function () {
        var nowOpen = !group.classList.contains('open');
        group.classList.toggle('open', nowOpen);
        head.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
        groupState[sec.title] = nowOpen;
        saveState();
      });
      group.appendChild(head);

      var body = document.createElement('div');
      body.className = 'group-body';
      body.id = bodyId;
      sec.items.forEach(function (it) { body.appendChild(makeLink(it)); });
      group.appendChild(body);
      nav.appendChild(group);
    });
  }

  function ensureGroupOpen(path) {
    var group = null;
    allLinks.forEach(function (a) {
      if (a.dataset.path === path && a.parentElement && a.parentElement.classList.contains('group-body')) {
        group = a.parentElement.parentElement;
      }
    });
    if (group && !group.classList.contains('open')) {
      group.classList.add('open');
      var head = group.querySelector('.group-head');
      if (head) head.setAttribute('aria-expanded', 'true');
    }
  }

  function filterNav(q) {
    q = (q || '').trim().toLowerCase();
    var pinEl = nav.querySelector('.pin');
    if (!q) {
      nav.querySelectorAll('.group').forEach(function (g) {
        g.classList.remove('hidden');
        var sec = sectionsByKey[g.dataset.key];
        g.classList.toggle('open', sec ? isOpen(sec) : true);
      });
      nav.querySelectorAll('a').forEach(function (a) { a.classList.remove('hidden'); });
      if (pinEl) pinEl.style.display = '';
      var e0 = nav.querySelector('.nav-empty');
      if (e0) e0.hidden = true;
      return;
    }
    nav.querySelectorAll('.group').forEach(function (g) {
      var any = false;
      g.querySelectorAll('a').forEach(function (a) {
        var hit = a.dataset.search.indexOf(q) !== -1;
        a.classList.toggle('hidden', !hit);
        if (hit) any = true;
      });
      g.classList.toggle('hidden', !any);
      g.classList.toggle('open', any);
    });
    if (pinEl) pinEl.style.display = pinEl.dataset.search.indexOf(q) !== -1 ? '' : 'none';

    // 搜不到东西时不要只留一片空白
    var emptyEl = nav.querySelector('.nav-empty');
    if (!emptyEl) {
      emptyEl = document.createElement('p');
      emptyEl.className = 'nav-empty';
      emptyEl.textContent = '没有匹配的食谱或脚本';
      emptyEl.hidden = true;
      nav.appendChild(emptyEl);
    }
    var anyHit = !!nav.querySelector('.group:not(.hidden)') || !!(pinEl && pinEl.style.display !== 'none');
    emptyEl.hidden = anyHit;
  }

  /* ---------- 渲染 ---------- */
  function scrollInstant(y) {
    var root = document.documentElement;
    var prev = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, y);
    void root.offsetHeight;
    root.style.scrollBehavior = prev;
  }
  function scrollToHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return;
    var id = h;
    try { id = decodeURIComponent(h); } catch (e) {}
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: 'start' });
  }

  /** 接管站内链接：预渲染的静态页和前端渲染的内容走同一条路 */
  function wireLink(a, path) {
    if (a.dataset.wired) return;
    a.dataset.wired = '1';
    var href = a.getAttribute('href');
    if (!href || /^(https?:|mailto:|tel:|#)/.test(href)) return;
    var target = a.dataset.doc || null;
    if (!target) {
      if (!/\.md($|[?#])/.test(href)) return;
      // marked 会把中文链接百分号编码，先解码再解析
      target = resolve(safeDecode(href.split('#')[0].split('?')[0]), path);
      if (!titles[target]) return;
      a.dataset.doc = target;
      a.setAttribute('href', docUrl(target));
    }
    a.addEventListener('click', function (ev) {
      if (ev.defaultPrevented || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      go(target);
    });
  }

  /** 内容已就位后的接线（预渲染页与前端渲染共用） */
  function hydrate(path) {
    content.querySelectorAll('table').forEach(function (t) {
      if (!t.parentElement.classList.contains('table-wrap')) {
        var w = document.createElement('div');
        w.className = 'table-wrap';
        t.parentNode.insertBefore(w, t);
        w.appendChild(t);
      }
    });
    content.querySelectorAll('h1,h2,h3,h4').forEach(function (h) { if (!h.id) h.id = slug(h.textContent); });
    content.querySelectorAll('img').forEach(function (img) {
      if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
      if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
    });
    content.querySelectorAll('a[href]').forEach(function (a) { wireLink(a, path); });

    if (!content.querySelector('.today-banner') && SITE.today && SITE.today.path === path) {
      var b = document.createElement('div');
      b.className = 'today-banner';
      b.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#ic-utensils"/></svg>' +
        '<span>今日要做' + (SITE.today.note ? ' · ' + escapeHtml(SITE.today.note) : '') + '</span>';
      content.insertBefore(b, content.firstChild);
    }

    decorateSteps(content.querySelector('.md'));
  }

  function render(mdText, path) {
    var body = stripFrontMatter(mdText);
    var html = (window.marked && typeof window.marked.parse === 'function')
      ? window.marked.parse(body)
      : '<pre>' + escapeHtml(body) + '</pre>';
    content.innerHTML = '<article class="md">' + html + '</article>';
    hydrate(path);
    scrollInstant(0);
    scrollToHash();
    updateProgress();
  }

  function resolve(href, fromPath) {
    var clean = href.split('#')[0];
    var parts = fromPath.split('/');
    parts.pop();
    clean.split('/').forEach(function (seg) {
      if (seg === '.' || seg === '') return;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    });
    return parts.join('/');
  }

  var markedPromise = null;
  /** 按需加载 Markdown 渲染器：首屏是预渲染好的，根本不需要它 */
  function loadMarked() {
    if (window.marked && typeof window.marked.parse === 'function') return Promise.resolve();
    if (markedPromise) return markedPromise;
    markedPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = BASE + 'assets/marked.min.js';
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Markdown 渲染器加载失败，检查网络后重试')); };
      document.head.appendChild(s);
    });
    return markedPromise;
  }

  function skeletonHtml() {
    return '<div class="skeleton"><div class="sk-line sk-60"></div>' +
      '<div class="sk-line sk-90"></div><div class="sk-line sk-80"></div></div>';
  }

  function navigate(path) {
    currentPath = path;
    setActive(path);
    ensureGroupOpen(path);
    loadMarked()
      .then(function () {
        content.innerHTML = skeletonHtml();
        return fetch(mdUrl(path), { cache: 'no-cache' });
      })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
        return r.text();
      })
      .then(function (md) {
        render(md, path);
        var t = titles[path];
        document.title = (t ? t + ' · ' : '') + '毕业生食谱';
        var d = document.querySelector('meta[name=description]');
        if (d && t) d.setAttribute('content', t + ' · 毕业生食谱：食材、步骤、避坑与变体。');
        try { localStorage.setItem('lastDoc', path); } catch (e) {}
      })
      .catch(function (err) {
        content.innerHTML =
          '<article class="md"><h1>打不开这个文档</h1><p><code>' + escapeHtml(path) +
          '</code></p><p>' + escapeHtml(err.message) + '</p>' +
          '<p><button class="retry-btn" type="button">重试</button></p></article>';
        var btn = content.querySelector('.retry-btn');
        if (btn) btn.addEventListener('click', function () { navigate(path); });
      });
  }

  /* ---------- 进度 & 回到顶部 ---------- */
  function updateProgress() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    var pct = max > 0 ? Math.min(100, Math.max(0, (doc.scrollTop / max) * 100)) : 0;
    if (progressBar) progressBar.style.width = pct + '%';
    if (toTop) toTop.classList.toggle('show', doc.scrollTop > 500);
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  /* ---------- 搜索 ---------- */
  search.addEventListener('input', function () { filterNav(search.value); });

  /* ---------- 打印 ---------- */
  function isiOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (ua.indexOf('Mac') !== -1 && 'ontouchend' in document);
  }
  printBtn.addEventListener('click', function () {
    closeNav();
    var article = content.querySelector('.md');
    if (!article) { showToast({ icon: '⏳', title: '稍等', text: '内容还没加载好' }); return; }

    if (isiOS()) {
      showToast({
        icon: '🖨️',
        title: 'iOS 打印提示',
        text: '请点浏览器「分享」→「打印」或「存储为 PDF」',
        ms: 6500,
      });
    }
    setTimeout(function () {
      try {
        if (typeof window.print === 'function') window.print();
        else showToast({ icon: '🖨️', title: '无法打印', text: '请用浏览器菜单里的「打印」' });
      } catch (e) {
        showToast({ icon: '🖨️', title: '打印失败', text: '请用浏览器菜单里的「打印」' });
      }
    }, isiOS() ? 400 : 60);
  });

  /* ---------- 底部标签栏 ---------- */
  function firstPath(prefix) {
    var a = allLinks.find(function (l) { return l.dataset.path.indexOf(prefix) === 0; });
    return a ? a.dataset.path : null;
  }
  if (tabbar) {
    tabbar.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.tab') : null;
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'nav') {
        document.body.classList.contains('nav-open') ? closeNav() : openNav();
        return;
      }
      closeNav();
      if (action === 'today') go(SITE && SITE.today && SITE.today.path);
      else if (action === 'recipes') go(firstPath('05-食谱库/00'));
      else if (action === 'scripts') go(firstPath('02-分集脚本/00'));
    });
  }

  /* ---------- 底部抽屉：把手可点可拖，下滑关闭 ---------- */
  (function () {
    [
      {
        handle: document.querySelector('#sidebar .sheet-handle'),
        panel: sidebarEl,
        isOpen: function () { return document.body.classList.contains('nav-open'); },
        close: closeNav
      },
      {
        handle: document.querySelector('#timerPanel .sheet-handle'),
        panel: document.getElementById('timerPanel'),
        isOpen: function () { return document.body.classList.contains('timer-open'); },
        close: closeTimerPanel
      }
    ].forEach(function (item) {
      if (!item.handle || !item.panel) return;
      var sy = 0, dy = 0, drag = false, moved = false;

      item.handle.addEventListener('touchstart', function (e) {
        if (!item.isOpen()) return;
        drag = true; moved = false; dy = 0; sy = e.touches[0].clientY;
        item.panel.style.transition = 'none';
      }, { passive: true });

      item.handle.addEventListener('touchmove', function (e) {
        if (!drag) return;
        dy = e.touches[0].clientY - sy;
        if (dy < 0) dy = 0;
        if (dy > 4) moved = true;
        item.panel.style.transform = 'translateY(' + dy + 'px)';
        if (e.cancelable) e.preventDefault();
      }, { passive: false });

      var end = function () {
        if (!drag) return;
        drag = false;
        item.panel.style.transition = '';
        if (dy > 90) item.close();
        item.panel.style.transform = '';
      };
      item.handle.addEventListener('touchend', end);
      item.handle.addEventListener('touchcancel', end);

      /* 轻点把手也能关；刚拖动过就不要重复触发 */
      item.handle.addEventListener('click', function () {
        if (moved) { moved = false; return; }
        if (item.isOpen()) item.close();
      });
    });
  })();

  backdrop.addEventListener('click', closeNav);

  /* 桌面端目录区固定常驻，不再支持收起；清掉历史遗留的状态键 */
  try { localStorage.removeItem('sidebarCollapsed'); } catch (e) {}

  /* 目录滚动时才显示滚动条 */
  if (nav) {
    var navScrollTimer = null;
    nav.addEventListener('scroll', function () {
      nav.classList.add('scrolling');
      clearTimeout(navScrollTimer);
      navScrollTimer = setTimeout(function () { nav.classList.remove('scrolling'); }, 700);
    }, { passive: true });
  }
  /* 老式 hash 链接（#05-食谱库/xxx.md）兼容：进来就静默换成新地址 */
  window.addEventListener('hashchange', function () {
    var p = decodeHash();
    if (p && /\.md$/.test(p) && titles[p]) go(p);
  });

  /* ---------- 计时器 ---------- */
  var timers = [];
  var timerTick = null;
  var wakeByTimer = false;
  var audioCtx = null;
  var timerFab = document.getElementById('timerFab');
  var timerFabTime = document.getElementById('timerFabTime');
  var timerBtn = document.getElementById('timerBtn');
  var timerBtnTime = document.getElementById('timerBtnTime');
  var timerPanel = document.getElementById('timerPanel');
  var timerBackdrop = document.getElementById('timerBackdrop');
  var timerList = document.getElementById('timerList');
  var timerClose = document.getElementById('timerClose');
  var timerAddBtn = document.getElementById('timerAddBtn');
  var timerInput = document.getElementById('timerInput');

  function nowMs() { return Date.now(); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtClock(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h > 0 ? h + ':' + pad2(m) + ':' + pad2(ss) : pad2(m) + ':' + pad2(ss);
  }
  function fmtDur(sec) {
    if (sec >= 3600 && sec % 3600 === 0) return (sec / 3600) + ' 小时';
    if (sec >= 60 && sec % 60 === 0) return (sec / 60) + ' 分钟';
    if (sec >= 60) return Math.floor(sec / 60) + ' 分 ' + (sec % 60) + ' 秒';
    return sec + ' 秒';
  }
  function remainOf(t) {
    if (t.done) return 0;
    if (t.endAt) return Math.max(0, t.endAt - nowMs());
    return Math.max(0, t.remaining);
  }

  function saveTimers() {
    try {
      localStorage.setItem('timers', JSON.stringify(timers.map(function (t) {
        return { id: t.id, label: t.label, duration: t.duration, endAt: t.endAt, remaining: remainOf(t), done: t.done };
      })));
    } catch (e) {}
  }
  function loadTimers() {
    try {
      var arr = JSON.parse(localStorage.getItem('timers') || '[]');
      if (Array.isArray(arr)) {
        timers = arr.filter(Boolean).map(function (t) {
          return { id: t.id, label: t.label || '计时', duration: t.duration || 0,
            endAt: t.endAt || null, remaining: t.remaining || 0, done: !!t.done, alerted: true };
        });
      }
    } catch (e) { timers = []; }
  }

  function ensureAudio() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; } }
    if (audioCtx && audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) {} }
  }
  function beep(times) {
    ensureAudio();
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime;
    for (var i = 0; i < times; i++) {
      var osc = audioCtx.createOscillator(), g = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = 880;
      var s = t0 + i * 0.5;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.28, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.34);
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start(s); osc.stop(s + 0.38);
    }
  }
  function fireAlarm(t) {
    beep(3);
    if (navigator.vibrate) { try { navigator.vibrate([250, 120, 250, 120, 250]); } catch (e) {} }
    showToast({ icon: '⏰', title: '时间到', text: t.label, ms: 9000 });
    [timerFab, timerBtn].forEach(function (el) {
      if (!el) return;
      el.classList.add('ringing');
      setTimeout(function () { el.classList.remove('ringing'); }, 9000);
    });
  }

  function findTimer(id) { for (var i = 0; i < timers.length; i++) if (timers[i].id === id) return timers[i]; return null; }

  function addTimer(label, sec) {
    sec = Math.round(sec);
    if (!(sec > 0)) return;
    timers.push({ id: 't' + nowMs() + Math.random().toString(36).slice(2, 6),
      label: label || fmtDur(sec), duration: sec * 1000,
      endAt: nowMs() + sec * 1000, remaining: sec * 1000, done: false, alerted: false });
    ensureAudio();
    startTick(); renderTimers(); syncWake(); saveTimers();
    showToast({ icon: '⏱', title: '开始计时', text: (label ? label + ' · ' : '') + fmtDur(sec) });
  }
  function toggleTimer(id) {
    var t = findTimer(id); if (!t) return;
    if (t.done) { removeTimer(id); return; }
    if (t.endAt) { t.remaining = remainOf(t); t.endAt = null; }
    else { t.endAt = nowMs() + t.remaining; }
    startTick(); renderTimers(); syncWake(); saveTimers();
  }
  function bumpTimer(id, sec) {
    var t = findTimer(id); if (!t || t.done) return;
    if (t.endAt) t.endAt += sec * 1000; else t.remaining += sec * 1000;
    renderTimers(); saveTimers();
  }
  function resetTimer(id) {
    var t = findTimer(id); if (!t) return;
    t.done = false; t.alerted = false; t.remaining = t.duration;
    t.endAt = t.duration > 0 ? nowMs() + t.duration : null;
    startTick(); renderTimers(); syncWake(); saveTimers();
  }
  function removeTimer(id) {
    timers = timers.filter(function (t) { return t.id !== id; });
    renderTimers(); syncWake(); saveTimers();
    if (!timers.some(function (t) { return t.endAt && !t.done; })) stopTick();
  }
  function startTick() { if (!timerTick) timerTick = setInterval(tick, 250); }
  function stopTick() { if (timerTick) { clearInterval(timerTick); timerTick = null; } }

  function tick() {
    var structural = false;
    timers.forEach(function (t) {
      if (t.done || !t.endAt) return;
      if (t.endAt - nowMs() <= 0) {
        t.endAt = null; t.remaining = 0; t.done = true;
        if (!t.alerted) { t.alerted = true; fireAlarm(t); }
        structural = true;
      }
    });
    if (structural) {
      renderTimers(); saveTimers(); syncWake();
      if (!timers.some(function (t) { return t.endAt && !t.done; })) stopTick();
    } else {
      updateTimes();
    }
    updateFab();
  }
  function updateTimes() {
    if (!timerList) return;
    timers.forEach(function (t) {
      var el = timerList.querySelector('.tp-item[data-id="' + t.id + '"] .tp-time');
      if (el) el.textContent = t.done ? '完成' : fmtClock(remainOf(t));
    });
  }
  function updateFab() {
    var running = timers.filter(function (t) { return !t.done && t.endAt; });
    var paused = timers.filter(function (t) { return !t.done && !t.endAt; });
    var done = timers.filter(function (t) { return t.done; });
    var state, text = '';
    if (running.length) { state = 'run'; text = fmtClock(Math.min.apply(null, running.map(remainOf))); }
    else if (paused.length) { state = 'pause'; text = fmtClock(Math.min.apply(null, paused.map(remainOf))); }
    else if (done.length) { state = 'done'; }
    else { state = 'idle'; }

    var showTime = (state === 'run' || state === 'pause');
    if (timerFab) {
      timerFab.classList.toggle('has-timers', showTime);
      timerFab.classList.toggle('done', state === 'done');
      if (timerFabTime) timerFabTime.textContent = showTime ? text : (state === 'done' ? '完成' : '');
    }
    if (timerBtn) {
      timerBtn.classList.toggle('has-timers', showTime);
      timerBtn.classList.toggle('done', state === 'done');
      if (timerBtnTime) timerBtnTime.textContent = showTime ? text : '';
    }
  }
  function renderTimers() {
    if (!timerList) return;
    if (!timers.length) {
      timerList.innerHTML = '<div class="tp-empty">点食谱里的「⏱ 12 分钟」即可开始，<br>或用下面的快捷添加。</div>';
      updateFab(); return;
    }
    timerList.innerHTML = timers.map(function (t) {
      return '<div class="tp-item' + (t.done ? ' done' : '') + '" data-id="' + t.id + '">' +
        '<div class="tp-info">' +
          '<div class="tp-label">' + escapeHtml(t.label) + '</div>' +
          '<div class="tp-time">' + (t.done ? '完成' : fmtClock(remainOf(t))) + '</div>' +
        '</div>' +
        '<div class="tp-ctrl">' +
          (t.done
            ? '<button data-act="toggle" title="知道了"><svg class="ic" aria-hidden="true"><use href="#ic-check"/></svg></button>'
            : '<button data-act="toggle" title="暂停/继续"><svg class="ic" aria-hidden="true"><use href="#ic-' + (t.endAt ? 'pause' : 'play') + '"/></svg></button>' +
              '<button data-act="bump" title="加 1 分钟"><svg class="ic" aria-hidden="true"><use href="#ic-plus"/></svg></button>') +
          '<button data-act="reset" title="重置"><svg class="ic" aria-hidden="true"><use href="#ic-rotate-ccw"/></svg></button>' +
          '<button data-act="remove" title="删除"><svg class="ic" aria-hidden="true"><use href="#ic-trash-2"/></svg></button>' +
        '</div>' +
      '</div>';
    }).join('');
    updateFab();
  }

  function openTimerPanel() {
    if (!timerPanel) return;
    if (document.body.classList.contains('nav-open')) closeNav();
    rememberFocus();
    document.body.classList.add('timer-open');
    timerPanel.setAttribute('aria-hidden', 'false');
    renderTimers();
    syncScrollLock();
    focusPanel(timerPanel);
  }
  function closeTimerPanel() {
    document.body.classList.remove('timer-open');
    if (timerPanel) timerPanel.setAttribute('aria-hidden', 'true');
    syncScrollLock();
    restoreFocus();
  }
  function syncWake() {
    if (!WAKE_SUPPORTED) return;
    var need = timers.some(function (t) { return t.endAt && !t.done; });
    if (need && !wakeLock) { wakeByTimer = true; acquireWake(false); }
    else if (!need && wakeLock && wakeByTimer && !wakeWanted) { wakeByTimer = false; releaseWake(); }
  }

  /* 把正文里的时长变成可点的倒计时芯片 */
  var DUR_RE = /(半\s*小时)|(\d+(?:\.\d+)?)(?:\s*[-–—~～至到]\s*(\d+(?:\.\d+)?))?\s*(分钟|小时|秒)/g;
  function splitDurations(text) {
    var out = [], last = 0, m;
    DUR_RE.lastIndex = 0;
    while ((m = DUR_RE.exec(text)) !== null) {
      if (m.index > last) out.push({ text: text.slice(last, m.index) });
      var sec;
      if (m[1]) sec = 1800;
      else {
        var unit = m[4];
        sec = Math.round(parseFloat(m[2]) * (unit === '小时' ? 3600 : unit === '分钟' ? 60 : 1));
      }
      if (sec >= 5) out.push({ text: m[0], sec: sec });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    if (!out.some(function (p) { return p.sec; })) return null;
    return out;
  }
  /* 仅在「步骤 / 做法」段落里把时长变成可点倒计时 */
  function decorateSteps(root) {
    if (!root) return;
    var hs = root.querySelectorAll('h1,h2,h3,h4');
    Array.prototype.forEach.call(hs, function (h) {
      if (!/步骤|做法|操作|流程/.test(h.textContent)) return;
      var level = h.tagName;
      var node = h.nextElementSibling;
      while (node) {
        if (/^H[1-4]$/.test(node.tagName) && node.tagName <= level) break;
        decorateDurations(node);
        node = node.nextElementSibling;
      }
    });
  }
  function decorateDurations(root) {
    if (!root || !window.NodeFilter) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var v = node.nodeValue;
        if (!v || v.length > 80 || !/分钟|小时|秒/.test(v)) return NodeFilter.FILTER_REJECT;
        var p = node.parentElement;
        if (!p || /^(CODE|PRE|A|BUTTON|SCRIPT|STYLE|TD|TH)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var parts = splitDurations(node.nodeValue);
      if (!parts) return;
      var frag = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (part.sec) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'dur';
          btn.title = '开始 ' + fmtDur(part.sec) + ' 倒计时';
          btn.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#ic-timer"/></svg>' + escapeHtml(part.text.trim());
          (function (sec) {
            btn.addEventListener('click', function () { addTimer(fmtDur(sec), sec); });
          })(part.sec);
          frag.appendChild(btn);
        } else {
          frag.appendChild(document.createTextNode(part.text));
        }
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  /* 计时器事件 */
  if (timerFab) timerFab.addEventListener('click', function () {
    document.body.classList.contains('timer-open') ? closeTimerPanel() : openTimerPanel();
  });
  if (timerBtn) timerBtn.addEventListener('click', function () {
    document.body.classList.contains('timer-open') ? closeTimerPanel() : openTimerPanel();
  });
  if (timerClose) timerClose.addEventListener('click', closeTimerPanel);
  if (timerBackdrop) timerBackdrop.addEventListener('click', closeTimerPanel);
  if (timerList) timerList.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('button[data-act]') : null;
    if (!btn) return;
    var item = btn.closest('.tp-item'); if (!item) return;
    var id = item.dataset.id, act = btn.dataset.act;
    if (act === 'toggle') toggleTimer(id);
    else if (act === 'bump') bumpTimer(id, 60);
    else if (act === 'reset') resetTimer(id);
    else if (act === 'remove') removeTimer(id);
  });
  if (timerPanel) timerPanel.addEventListener('click', function (e) {
    var p = e.target && e.target.closest ? e.target.closest('.tp-presets button') : null;
    if (p) addTimer(fmtDur(+p.dataset.min * 60), +p.dataset.min * 60);
  });
  if (timerAddBtn) timerAddBtn.addEventListener('click', function () {
    var v = parseInt(timerInput && timerInput.value, 10);
    if (!(v > 0)) { showToast({ icon: '⏱', title: '请输入分钟数' }); return; }
    addTimer(v + ' 分钟', v * 60);
    if (timerInput) timerInput.value = '';
  });
  if (timerInput) timerInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); if (timerAddBtn) timerAddBtn.click(); }
  });

  loadTimers();
  if (timers.some(function (t) { return t.endAt && !t.done; })) startTick();
  renderTimers();

  /* ---------- 启动 ---------- */
  function homePath() {
    if (SITE.today && SITE.today.path && titles[SITE.today.path]) return SITE.today.path;
    var a = allLinks.find(function (l) { return l.dataset.path.indexOf('05-食谱库/00') === 0; });
    return (a || allLinks[0]).dataset.path;
  }

  /** 移动端目录是弹层，语义上当 dialog；桌面端是侧栏，保留 landmark */
  function syncPanelRoles() {
    if (!sidebarEl) return;
    var mobile = window.matchMedia && window.matchMedia('(max-width: 959px)').matches;
    if (mobile) {
      sidebarEl.setAttribute('role', 'dialog');
      sidebarEl.setAttribute('aria-modal', 'true');
    } else {
      sidebarEl.removeAttribute('role');
      sidebarEl.removeAttribute('aria-modal');
    }
  }

  function boot(data) {
    SITE = data;
    buildNav();
    syncPanelRoles();

    var prerendered = document.body.getAttribute('data-doc') || null;
    var target = null;

    // 1) 地址栏里的文档页优先
    var fromUrl = docFromLocation();
    if (fromUrl && titles[fromUrl]) target = fromUrl;

    // 2) 兼容老的 hash 链接（#05-食谱库/xxx.md），静默换成新地址
    if (!target) {
      var h = decodeHash();
      if (h && titles[h]) {
        target = h;
        try { history.replaceState({ doc: h }, '', docUrl(h)); } catch (e) {}
      }
    }

    // 3) 回访用户上次看的那篇
    if (!target) {
      var lastDoc = null;
      try { lastDoc = localStorage.getItem('lastDoc'); } catch (e) {}
      if (lastDoc && titles[lastDoc]) target = lastDoc;
    }

    // 首屏已是构建期渲染好的真 HTML，直接用，不再拉一次
    if (prerendered && titles[prerendered]) {
      currentPath = prerendered;
      setActive(prerendered);
      ensureGroupOpen(prerendered);
      hydrate(prerendered);
      if (target && target !== prerendered) go(target, { replace: true });
      else scrollToHash();
      updateProgress();
      return;
    }

    navigate(target || homePath());
  }

  /* 浏览器前进 / 后退 */
  window.addEventListener('popstate', function () {
    if (!SITE) return;
    var p = docFromLocation();
    navigate(p && titles[p] ? p : homePath());
  });
  window.addEventListener('resize', syncPanelRoles);

  /* ---------- 键盘快捷键 ---------- */
  function openSearch() {
    if (window.matchMedia && window.matchMedia('(max-width: 959px)').matches) openNav();
    if (search) { search.focus(); search.select(); }
  }
  function stepDoc(delta) {
    var list = allLinks.filter(function (a) { return !a.classList.contains('hidden'); });
    for (var i = 0; i < list.length; i++) {
      if (list[i].dataset.path === currentPath) {
        var next = list[i + delta];
        if (next) go(next.dataset.path);
        return;
      }
    }
  }
  document.addEventListener('keydown', function (e) {
    var t = e.target || {};
    var typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName || '') || t.isContentEditable;

    if (e.key === 'Escape') {
      if (document.body.classList.contains('nav-open')) { closeNav(); return; }
      if (document.body.classList.contains('timer-open')) { closeTimerPanel(); return; }
      if (search && document.activeElement === search && search.value) {
        search.value = ''; filterNav('');
        return;
      }
      if (typing && t.blur) t.blur();
      return;
    }
    if (typing) return;
    if (e.key === '/') { e.preventDefault(); openSearch(); return; }
    if (e.key === 'j') { e.preventDefault(); stepDoc(1); return; }
    if (e.key === 'k') { e.preventDefault(); stepDoc(-1); }
  });

  /* ---------- Service Worker（离线可看） ---------- */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(function () {});
    });
  }

  /* ---------- 数据来源：优先用内联的那份，省一次请求 ---------- */
  (function start() {
    var el = document.getElementById('site-data');
    if (el) {
      try {
        var data = JSON.parse(el.textContent);
        if (data && data.sections && data.sections.length) { boot(data); return; }
      } catch (e) { /* 开发模式下没注入，回落到 fetch */ }
    }
    fetch(BASE + 'site.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(boot)
      .catch(function (e) {
        content.innerHTML = '<article class="md"><h1>无法加载 site.json</h1><p>' +
          escapeHtml(e.message) + '</p></article>';
      });
  })();
})();
