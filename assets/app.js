(function () {
  'use strict';

  var nav = document.getElementById('nav');
  var content = document.getElementById('content');
  var search = document.getElementById('search');
  var menuBtn = document.getElementById('menuBtn');
  var printBtn = document.getElementById('printBtn');
  var backdrop = document.getElementById('backdrop');

  var SITE = null;
  var allLinks = [];

  function qs(sel, el) { return (el || document).querySelector(sel); }

  function decodeHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return null;
    try { return decodeURIComponent(h); } catch (e) { return h; }
  }

  function setActive(path) {
    allLinks.forEach(function (a) {
      a.classList.toggle('active', a.dataset.path === path);
    });
  }

  function closeNav() { document.body.classList.remove('nav-open'); }

  function openNav() { document.body.classList.add('nav-open'); }

  // 把仓库相对路径解析成 fetch 用的 URL（相对站点根）
  function urlFor(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  function buildNav() {
    nav.innerHTML = '';
    allLinks = [];
    SITE.sections.forEach(function (sec) {
      var h = document.createElement('div');
      h.className = 'sec' + (sec.highlight ? ' hl' : '');
      h.textContent = (sec.icon ? sec.icon + ' ' : '') + sec.title;
      nav.appendChild(h);
      sec.items.forEach(function (it) {
        var a = document.createElement('a');
        a.href = '#' + encodeURIComponent(it.path);
        a.dataset.path = it.path;
        a.dataset.title = (it.title + ' ' + it.path).toLowerCase();
        a.textContent = it.title;
        a.addEventListener('click', function () { closeNav(); });
        nav.appendChild(a);
        allLinks.push(a);
      });
    });
  }

  function render(md, path) {
    md = stripFrontMatter(md);
    if (window.marked && typeof window.marked.parse === 'function') {
      content.innerHTML = '<article class="md">' + window.marked.parse(md) + '</article>';
    } else {
      // marked 未加载时的降级：纯文本
      var pre = document.createElement('pre');
      pre.textContent = md;
      content.innerHTML = '';
      content.appendChild(pre);
    }
    // 表格包一层，方便横向滚动
    content.querySelectorAll('table').forEach(function (t) {
      if (!t.parentElement.classList.contains('table-wrap')) {
        var w = document.createElement('div');
        w.className = 'table-wrap';
        t.parentNode.insertBefore(w, t);
        w.appendChild(t);
      }
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
    content.scrollTop = 0;
    window.scrollTo(0, 0);
    document.title = '毕业生食谱';
  }

  // 去掉 YAML front matter，避免渲染成正文
  function stripFrontMatter(md) {
    if (md.slice(0, 3) === '---') {
      var m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
      if (m) return md.slice(m[0].length);
    }
    return md;
  }

  // 解析相对链接（相对当前文档所在目录）
  function resolve(href, fromPath) {
    var clean = href.split('#')[0];
    var baseParts = fromPath.split('/');
    baseParts.pop();
    clean.split('/').forEach(function (seg) {
      if (seg === '.' || seg === '') return;
      if (seg === '..') baseParts.pop();
      else baseParts.push(seg);
    });
    return baseParts.join('/');
  }

  function navigate(path) {
    setActive(path);
    content.innerHTML = '<div class="placeholder">加载中…</div>';
    fetch(urlFor(path), { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
        return r.text();
      })
      .then(function (md) {
        render(md, path);
        try { localStorage.setItem('lastDoc', path); } catch (e) {}
      })
      .catch(function (err) {
        content.innerHTML =
          '<div class="placeholder">⚠️ 打不开这个文档<br>' +
          '<code>' + path + '</code><br><small>' + err.message + '</small></div>';
      });
  }

  function boot(data) {
    SITE = data;
    buildNav();
    var start = decodeHash() || (function () {
      try { return localStorage.getItem('lastDoc'); } catch (e) { return null; }
    })() || null;
    var exists = allLinks.some(function (a) { return a.dataset.path === start; });
    if (!start || !exists) {
      start = SITE.sections[0].items[0].path;
      // 优先打开食谱索引
      var recipes = allLinks.find(function (a) { return a.dataset.path.indexOf('05-食谱库/00') === 0; });
      if (recipes) start = recipes.dataset.path;
    }
    navigate(start);
  }

  // 搜索
  search.addEventListener('input', function () {
    var q = search.value.trim().toLowerCase();
    var visible = 0;
    allLinks.forEach(function (a) {
      var hit = !q || a.dataset.title.indexOf(q) !== -1;
      a.classList.toggle('hidden', !hit);
      if (hit) visible++;
    });
    nav.querySelectorAll('.sec').forEach(function (sec) {
      var next = sec.nextElementSibling, any = false;
      while (next && !next.classList.contains('sec')) {
        if (next.tagName === 'A' && !next.classList.contains('hidden')) any = true;
        next = next.nextElementSibling;
      }
      sec.style.display = any ? '' : 'none';
    });
  });

  menuBtn.addEventListener('click', function () {
    document.body.classList.toggle('nav-open');
  });
  backdrop.addEventListener('click', closeNav);
  printBtn.addEventListener('click', function () { window.print(); });

  window.addEventListener('hashchange', function () {
    var p = decodeHash();
    if (p && (!allLinks.length || allLinks.some(function (a) { return a.dataset.path === p; }))) {
      navigate(p);
    }
  });

  fetch('site.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(boot)
    .catch(function (e) {
      content.innerHTML = '<div class="placeholder">⚠️ 无法加载 site.json<br><small>' + e.message + '</small></div>';
    });
})();
