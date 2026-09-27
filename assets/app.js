(function () {
  'use strict';

  var nav = document.getElementById('nav');
  var content = document.getElementById('content');
  var search = document.getElementById('search');
  var menuBtn = document.getElementById('menuBtn');
  var sidebarEl = document.getElementById('sidebar');
  var tabbar = document.querySelector('.tabbar');
  var navClose = document.getElementById('navClose');
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
  function urlFor(path) { return path.split('/').map(encodeURIComponent).join('/'); }
  function closeNav() {
    document.body.classList.remove('nav-open');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
  }
  function openNav() {
    document.body.classList.add('nav-open');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
  }
  function setActive(path) {
    allLinks.forEach(function (a) { a.classList.toggle('active', a.dataset.path === path); });
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
  function go(path) {
    if (!path) return;
    if (decodeHash() === path) navigate(path);
    else location.hash = '#' + encodeURIComponent(path);
  }

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
        '<span class="t-icon"></span>' +
        '<div class="t-body"><div class="t-title"></div><div class="t-text"></div></div>' +
        '<button class="t-close" aria-label="关闭">×</button>';
      toastEl.querySelector('.t-close').addEventListener('click', hideToast);
      document.body.appendChild(toastEl);
    }
    toastEl.querySelector('.t-icon').textContent = opts.icon || '💡';
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
      if (!href || /^(https?:|mailto:|tel:)/.test(href)) return;
      if (href.charAt(0) === '#') return; // 同页锚点，交给浏览器
      if (!/\.md($|[?#])/.test(href)) return; // 只接管站内 md 链接
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        // marked 会把中文链接百分号编码，先解码再解析
        var decoded = safeDecode(href.split('#')[0].split('?')[0]);
        var target = resolve(decoded, path);
        if (target) location.hash = '#' + encodeURIComponent(target);
      });
    });

    if (SITE.today && SITE.today.path === path) {
      var b = document.createElement('div');
      b.className = 'today-banner';
      b.textContent = '🔪 今日要做' + (SITE.today.note ? ' · ' + SITE.today.note : '');
      content.insertBefore(b, content.firstChild);
    }

    decorateSteps(content.querySelector('.md'));

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

  /* ---------- 底部抽屉：下拉关闭 ---------- */
  (function () {
    var handle = document.querySelector('.sheet-handle');
    if (!handle || !sidebarEl) return;
    var sy = 0, dy = 0, drag = false;
    handle.addEventListener('touchstart', function (e) {
      if (!document.body.classList.contains('nav-open')) return;
      drag = true; dy = 0; sy = e.touches[0].clientY;
      sidebarEl.style.transition = 'none';
    }, { passive: true });
    handle.addEventListener('touchmove', function (e) {
      if (!drag) return;
      dy = e.touches[0].clientY - sy;
      if (dy < 0) dy = 0;
      sidebarEl.style.transform = 'translateY(' + dy + 'px)';
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    var end = function () {
      if (!drag) return;
      drag = false;
      sidebarEl.style.transition = '';
      if (dy > 90) closeNav();
      sidebarEl.style.transform = '';
    };
    handle.addEventListener('touchend', end);
    handle.addEventListener('touchcancel', end);
  })();

  backdrop.addEventListener('click', closeNav);
  if (navClose) navClose.addEventListener('click', closeNav);

  /* 目录滚动时才显示滚动条 */
  if (nav) {
    var navScrollTimer = null;
    nav.addEventListener('scroll', function () {
      nav.classList.add('scrolling');
      clearTimeout(navScrollTimer);
      navScrollTimer = setTimeout(function () { nav.classList.remove('scrolling'); }, 700);
    }, { passive: true });
  }
  window.addEventListener('hashchange', function () {
    var p = decodeHash();
    if (p && /\.md$/.test(p)) navigate(p);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeNav(); }
    if (e.key === '/' && document.activeElement !== search) { e.preventDefault(); openNav(); search.focus(); }
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
            ? '<button data-act="toggle" title="知道了">✓</button>'
            : '<button data-act="toggle" title="暂停/继续">' + (t.endAt ? '⏸' : '▶') + '</button>' +
              '<button data-act="bump" title="加 1 分钟">+1</button>') +
          '<button data-act="reset" title="重置">↺</button>' +
          '<button data-act="remove" title="删除">×</button>' +
        '</div>' +
      '</div>';
    }).join('');
    updateFab();
  }

  function openTimerPanel() {
    if (!timerPanel) return;
    document.body.classList.add('timer-open');
    timerPanel.setAttribute('aria-hidden', 'false');
    renderTimers();
  }
  function closeTimerPanel() {
    document.body.classList.remove('timer-open');
    if (timerPanel) timerPanel.setAttribute('aria-hidden', 'true');
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
          btn.innerHTML = '<span class="dur-ico">⏱</span>' + escapeHtml(part.text.trim());
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
