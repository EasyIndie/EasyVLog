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
  var titles = {}; // path -> title

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
    var cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
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
  function urlFor(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }
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

  function stripFrontMatter(md) {
    if (md.slice(0, 3) === '---') {
      var m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
      if (m) return md.slice(m[0].length);
    }
    return md;
  }

  function slug(s) {
    return s.trim().toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  /* ---------- 导航 ---------- */
  function buildNav() {
    nav.innerHTML = '';
    allLinks = [];
    titles = {};

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
      var h = document.createElement('div');
      h.className = 'sec' + (sec.highlight ? ' hl' : '');
      h.textContent = (sec.icon ? sec.icon + '  ' : '') + sec.title;
      nav.appendChild(h);
      sec.items.forEach(function (it) {
        var a = document.createElement('a');
        a.href = '#' + encodeURIComponent(it.path);
        a.dataset.path = it.path;
        a.dataset.search = (it.title + ' ' + it.path).toLowerCase();
        a.textContent = it.title;
        a.addEventListener('click', closeNav);
        nav.appendChild(a);
        allLinks.push(a);
        titles[it.path] = it.title;
      });
    });
  }

  /* ---------- 渲染 ---------- */
  function render(md, path) {
    md = stripFrontMatter(md);
    var html = (window.marked && typeof window.marked.parse === 'function')
      ? window.marked.parse(md)
      : '<pre>' + escapeHtml(md) + '</pre>';
    content.innerHTML = '<article class="md">' + html + '</article>';

    // 表格横向滚动
    content.querySelectorAll('table').forEach(function (t) {
      if (!t.parentElement.classList.contains('table-wrap')) {
        var w = document.createElement('div');
        w.className = 'table-wrap';
        t.parentNode.insertBefore(w, t);
        w.appendChild(t);
      }
    });

    // 标题锚点 id
    content.querySelectorAll('h1,h2,h3').forEach(function (h) {
      if (!h.id) h.id = slug(h.textContent);
    });

    // 拦截站内 .md 链接
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
  search.addEventListener('input', function () {
    var q = search.value.trim().toLowerCase();
    allLinks.forEach(function (a) {
      a.classList.toggle('hidden', !(!q || a.dataset.search.indexOf(q) !== -1));
    });
    var pinEl = nav.querySelector('.pin');
    if (pinEl) pinEl.style.display = pinEl.classList.contains('hidden') ? 'none' : '';
    nav.querySelectorAll('.sec').forEach(function (sec) {
      var next = sec.nextElementSibling, any = false;
      while (next && !next.classList.contains('sec')) {
        if (next.tagName === 'A' && !next.classList.contains('hidden')) any = true;
        next = next.nextElementSibling;
      }
      sec.style.display = any ? '' : 'none';
    });
  });

  /* ---------- 事件 ---------- */
  menuBtn.addEventListener('click', function () {
    document.body.classList.contains('nav-open') ? closeNav() : openNav();
  });
  backdrop.addEventListener('click', closeNav);
  printBtn.addEventListener('click', function () { window.print(); });
  window.addEventListener('hashchange', function () {
    var p = decodeHash();
    if (p && allLinks.some(function (a) { return a.dataset.path === p; })) navigate(p);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav();
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
