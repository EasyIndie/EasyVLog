/*
 * 主题预置：在 <head> 里同步执行（阻塞），保证深色用户首屏不会闪一下白。
 * 逻辑必须和 app.js 里的 initTheme() 一致，改了记得两边都改。
 */
(function () {
  var t = null;
  try { t = localStorage.getItem('theme'); } catch (e) {}
  if (t !== 'dark' && t !== 'light') {
    t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', t);
  var meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#14171a' : '#2f6f4f');
})();
