(function () {
  'use strict';

  var nav = document.getElementById('nav');
  var content = document.getElementById('content');
  var search = document.getElementById('search');
  var menuBtn = document.getElementById('menuBtn');
  var printBtn = document.getElementById('printBtn');
  var themeBtn = document.getElementById('themeBtn');
  var backdrop = document.getElementById('backdrop');
  var docTitle = document.getElementById('docTitle');
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
    if (meta) meta.setAttribute('content', t === 'dark' ? '#14171a' : '#2f6f4f');
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
  function urlFor(path) { return path.split('/').map(encodeURIComponent).join('/'); }
  function closeNav() {
    document.body.classList.remove('nav-open');
    menuBtn.setAttribute('aria-expanded', 'false');
  }
  function openNav() {
    document.body.classList.add('nav-open');
    menuBtn.setAttribute('aria-expanded', 'true');
  }
  function setActive(path) {
    allLinks.forEach(function (a) { a.classList.toggle('active', a.dataset.path === path); });
    if (docTitle) docTitle.textContent = titles[path] || '私人食谱库';
  }

  var toastEl = null, toastTimer = null;
  function showToast(msg, ms) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 3200);
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

  function makeLink(it) {
    var a = document.createElement('a');
    a.href = '#' + encodeURIComponent(it.path);
    a.dataset.path = it.path;
    a.dataset.search = (it.title + ' ' + it.path).toLowerCase();
    a.textContent = it.title;
    a.addEventListener('click', closeNav);
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
      pin.href = '#' + encodeURIComponent(SITE.today.path);
      pin.dataset.path = SITE.today.path;
      pin.dataset.search = ('今日要做 ' + SITE.today.title + ' ' + SITE.today.path).toLowerCase();
      pin.innerHTML =
        '<span class="pin-label">🔪 今日要做</span>' +
        '<span class="pin-title">' + escapeHtml(SITE.today.title) + '</span>' +
        (SITE.today.note ? '<span class="pin-note">' + escapeHtml(SITE.today.note) + '</span>' : '');
      pin.addEventListener('click', closeNav);
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
        '<span class="g-icon">' + escapeHtml(sec.icon || '') + '</span>' +
        '<span class="g-name">' + escapeHtml(sec.title) + '</span>' +
        '<span class="g-count">' + sec.items.length + '</span>' +
        '<span class="g-chev">▸</span>';
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
  }

  /* ---------- 渲染 ---------- */
  function render(md, path) {
    md = stripFrontMatter(md);
    var html = (window.marked && typeof window.marked.parse === 'function')
      ? window.marked.parse(md)
      : '<pre>' + escapeHtml(md) + '</pre>';
    content.innerHTML = '<article class="md">' + html + '</article>';

    content.querySelectorAll('table').forEach(function (t) {
      if (!t.parentElement.classList.contains('table-wrap')) {
        var w = document.createElement('div');
        w.className = 'table-wrap';
        t.parentNode.insertBefore(w, t);
        w.appendChild(t);
      }
    });
    content.querySelectorAll('h1,h2,h3').forEach(function (h) { if (!h.id) h.id = slug(h.textContent); });

    content.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || /^https?:|^mailto:|^#/.test(href)) return;
      if (!/\.md($|#)/.test(href)) return;
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        var target = resolve(href, path);
        if (target) location.hash = '#' + encodeURIComponent(target);
      });
    });

    if (SITE.today && SITE.today.path === path) {
      var b = document.createElement('div');
      b.className = 'today-banner';
      b.textContent = '🔪 今日要做' + (SITE.today.note ? ' · ' + SITE.today.note : '');
      content.insertBefore(b, content.firstChild);
    }

    window.scrollTo(0, 0);
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

  function navigate(path) {
    setActive(path);
    ensureGroupOpen(path);
    content.innerHTML =
      '<div class="skeleton"><div class="sk-line sk-60"></div>' +
      '<div class="sk-line sk-90"></div><div class="sk-line sk-80"></div></div>';
    fetch(urlFor(path), { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
        return r.text();
      })
      .then(function (md) {
        render(md, path);
        document.title = (titles[path] ? titles[path] + ' · ' : '') + '毕业生食谱';
        try { localStorage.setItem('lastDoc', path); } catch (e) {}
      })
      .catch(function (err) {
        content.innerHTML =
          '<div class="md"><h1>打不开这个文档</h1><p><code>' + escapeHtml(path) +
          '</code></p><p>' + escapeHtml(err.message) + '</p></div>';
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
    if (!article) { showToast('内容还没加载好，稍等一下'); return; }

    if (isiOS()) {
      showToast('iOS 无法直接弹出打印，请点浏览器「分享」→「打印」或「存储为 PDF」', 5000);
    }
    setTimeout(function () {
      try {
        if (typeof window.print === 'function') window.print();
        else showToast('当前环境不支持打印，请用浏览器菜单里的「打印」');
      } catch (e) {
        showToast('打印失败，请用浏览器菜单里的「打印」');
      }
    }, isiOS() ? 400 : 60);
  });

  /* ---------- 事件 ---------- */
  menuBtn.addEventListener('click', function () {
    document.body.classList.contains('nav-open') ? closeNav() : openNav();
  });
  backdrop.addEventListener('click', closeNav);
  window.addEventListener('hashchange', function () {
    var p = decodeHash();
    if (p && allLinks.some(function (a) { return a.dataset.path === p; })) navigate(p);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeNav(); }
    if (e.key === '/' && document.activeElement !== search) { e.preventDefault(); openNav(); search.focus(); }
  });

  /* ---------- 启动 ---------- */
  function boot(data) {
    SITE = data;
    buildNav();
    var lastDoc = null;
    try { lastDoc = localStorage.getItem('lastDoc'); } catch (e) {}
    var candidates = [decodeHash(), (SITE.today && SITE.today.path) || null, lastDoc];
    var start = null;
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] && allLinks.some(function (a) { return a.dataset.path === candidates[i]; })) {
        start = candidates[i];
        break;
      }
    }
    if (!start) {
      var r = allLinks.find(function (a) { return a.dataset.path.indexOf('05-食谱库/00') === 0; });
      start = r ? r.dataset.path : SITE.sections[0].items[0].path;
    }
    navigate(start);
  }

  fetch('site.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(boot)
    .catch(function (e) {
      content.innerHTML = '<div class="md"><h1>无法加载 site.json</h1><p>' + escapeHtml(e.message) + '</p></div>';
    });
})();
