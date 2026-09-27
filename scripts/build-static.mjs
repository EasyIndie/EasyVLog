#!/usr/bin/env node
/**
 * 把站点「静态化」并组装出可部署目录。
 *
 * 为什么要它：
 *   之前 index.html 的正文是空的，内容全靠浏览器 fetch Markdown 再渲染，
 *   搜索引擎/社交爬虫抓到的是一张骨架屏，等于没有 SEO。
 *   这里在构建期把每篇文档渲染成真正的 HTML，写到
 *     <out>/05-食谱库/韭菜鸡蛋胡萝卜包/index.html
 *   前端 app.js 再渐进增强（接管跳转、加计时芯片），不再负责首次渲染。
 *
 * 用法:
 *   node scripts/build-static.mjs                  # 部署用，base 由 --base 决定
 *   node scripts/build-static.mjs --base /easyvlog/ --out _site
 *   node scripts/build-static.mjs --base / --out _site   # 本地预览
 *
 * 前置：先跑 build-recipes / build-index / build-site（生成 site.json）。
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseFrontMatter, fmtDuration } from './lib/frontmatter.mjs';

const require = createRequire(import.meta.url);
const marked = require('../assets/marked.min.js');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------- 参数 ---------------- */
function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const BASE = arg('base', '/easyvlog/').replace(/\/?$/, '/');
/* 用 resolve 而不是 join：join 会把 '/tmp/x' 拼成 '<root>/tmp/x' */
const OUT = resolve(root, arg('out', '_site'));
const VERSION = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'dev';
const SITE_ORIGIN = 'https://easyindie.github.io';

/* ---------------- 小工具 ---------------- */
const errors = [];
function check(cond, msg) {
  if (!cond) errors.push(msg);
  return cond;
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/* 必须和 assets/app.js 里的 slug() 完全一致，否则锚点会对不上 */
function slug(s) {
  return String(s).trim().toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5 -]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}
function stripFrontMatter(md) {
  if (md.slice(0, 3) === '---') {
    const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    if (m) return md.slice(m[0].length);
  }
  return md;
}
function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}
/** 文档路径 -> 页面目录名（'05-食谱库/花卷.md' -> '05-食谱库/花卷/'） */
function pagePath(docPath) {
  return docPath.replace(/\.md$/, '/');
}
/** 文档路径 -> 绝对页面 URL */
function pageUrl(docPath) {
  return BASE + encodePath(pagePath(docPath));
}
/** 文档路径 -> 部署目录里的文件路径 */
function outFile(docPath) {
  return join(OUT, pagePath(docPath), 'index.html');
}
/** 相对链接按 fromPath 解析成文档路径 */
function resolveDoc(href, fromPath) {
  const clean = href.split('#')[0].split('?')[0];
  const parts = fromPath.split('/');
  parts.pop();
  clean.split('/').forEach((seg) => {
    if (seg === '.' || seg === '') return;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  });
  return parts.join('/');
}
function readText(p) {
  return readFileSync(join(root, p), 'utf8');
}

/* ---------------- 1. 读 site.json ---------------- */
const siteJsonPath = join(root, 'site.json');
if (!existsSync(siteJsonPath)) {
  console.error('✗ 找不到 site.json，请先运行 node scripts/build-site.mjs');
  process.exit(1);
}
const SITE = JSON.parse(readFileSync(siteJsonPath, 'utf8'));
const docs = [];
for (const sec of SITE.sections) {
  for (const item of sec.items) {
    docs.push({ ...item, section: sec.title, highlight: !!sec.highlight });
  }
}

/* ---------------- 2. 构建断言（P3-6） ---------------- */
const seen = new Set();
for (const d of docs) {
  if (!check(/\.md$/.test(d.path), `导航项不是 Markdown：${d.path}`)) continue;
  if (!check(existsSync(join(root, d.path)), `导航项指向的文件不存在：${d.path}`)) continue;
  if (!check(!seen.has(d.path), `导航项重复：${d.path}`)) continue;
  seen.add(d.path);
}
if (docs.length === 0) errors.push('site.json 里没有任何文档');
if (errors.length) {
  console.error('✗ 构建校验未通过：');
  errors.forEach((e) => console.error('  · ' + e));
  process.exit(1);
}

/* ---------------- 3. 渲染 Markdown ---------------- */
function renderMarkdown(mdText, docPath) {
  const html = marked.parse(stripFrontMatter(mdText));
  let out = html;

  // 表格包一层，移动端才敢横向滚
  /*
   * 表格外面套两层：.table-wrap 负责定位 + 右缘渐隐，.table-x 负责横向滚动。
   * 顺手给「材料/用量」表打 t-ing 标——窄屏要把它改成「一行一块」的堆叠布局，
   * 在构建期打标才不会在 JS 接管前闪一下。判据和 assets/app.js 的 decorateTables() 一致。
   */
  out = out.replace(/<table>([\s\S]*?)<\/table>/g, (m, inner) => {
    const th = [...inner.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((x) => x[1].replace(/<[^>]*>/g, '').trim());
    const ing = th.length >= 2 && /^(材料|食材|原料)$/.test(th[0]) && /^(用量|数量|分量|克数)$/.test(th[1]);
    return `<div class="table-wrap"><div class="table-x"><table${ing ? ' class="t-ing"' : ''}>${inner}</table></div></div>`;
  });

  // 标题加 id，和 app.js 的 slug() 保持一致
  out = out.replace(/<(h[1-4])>([\s\S]*?)<\/\1>/g, (m, tag, inner) => {
    const text = inner.replace(/<[^>]+>/g, '');
    const id = slug(text);
    return id ? `<${tag} id="${esc(id)}">${inner}</${tag}>` : `<${tag}>${inner}</${tag}>`;
  });

  // 站内 .md 链接 -> 真 URL + data-doc（爬虫能顺着爬，前端能接管点击）
  out = out.replace(/<a href="([^"]*)"([^>]*)>/g, (m, href, rest) => {
    if (!href || /^(https?:|mailto:|tel:|#)/.test(href)) return m;
    const decoded = (() => { try { return decodeURIComponent(href); } catch { return href; } })();
    const target = resolveDoc(decoded, docPath);
    if (!seen.has(target)) return m;
    return `<a href="${esc(pageUrl(target))}" data-doc="${esc(target)}"${rest}>`;
  });

  // 图片：懒加载 + 预留尺寸位置，防 CLS
  out = out.replace(/<img\s([^>]*?)\/?>/g, (m, attrs) => {
    let a = attrs;
    if (!/\bloading=/.test(a)) a += ' loading="lazy"';
    if (!/\bdecoding=/.test(a)) a += ' decoding="async"';
    return `<img ${a}>`;
  });

  return out;
}

/* ---------------- 4. 从 Markdown 里抠出配方结构化数据 ---------------- */
function sectionText(md, names) {
  const re = new RegExp(`^##\\s*(?:${names.join('|')})\\s*$`, 'm');
  const m = re.exec(md);
  if (!m) return '';
  const rest = md.slice(m.index + m[0].length);
  const next = /^##\s/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}
function parseIngredients(md) {
  const body = sectionText(md, ['食材', '用料', '材料']);
  if (!body) return [];
  const out = [];
  body.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (!m) return;
    const a = m[1].trim(), b = m[2].trim();
    if (/^-+$/.test(a) || a === '材料' || a === '名称') return;
    out.push(b && b !== '—' ? `${a} ${b}` : a);
  });
  return out;
}
function parseSteps(md) {
  const body = sectionText(md, ['步骤', '做法', '操作', '流程']);
  if (!body) return [];
  const out = [];
  body.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*(?:\d+[.、)]|[-*])\s+(.+)$/);
    if (!m) return;
    const text = m[1].replace(/[*_`]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
    if (text) out.push(text);
  });
  return out;
}
function isoDuration(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*(分钟|小时)/);
  if (!m) return null;
  const mins = Math.round(parseFloat(m[1]) * (m[2] === '小时' ? 60 : 1));
  const h = Math.floor(mins / 60), mm = mins % 60;
  return 'PT' + (h ? h + 'H' : '') + (mm ? mm + 'M' : h ? '' : '0M');
}
/*
 * 食谱信息条：份量 / 耗时 / 难度 / 分类 / 关联视频。
 * 数据全部取自 front matter——正文里不再重复写这几行，避免两处不一致。
 * 少于 3 项就不插（说明不是食谱页，比如账号规划文档）。
 * assets/app.js 里有一份同样的实现给前端渲染用，改了要对齐。
 */
const META_FIELDS = [
  { key: 'servings', icon: 'ic-utensils' },
  { key: 'time', icon: 'ic-timer', fmt: fmtDuration },
  { key: 'difficulty', icon: 'ic-bar-chart-3' },
  { key: 'category', icon: 'ic-chef-hat' },
  { key: 'source', icon: 'ic-video' },
];
function buildMetaBar(fm) {
  if (!fm) return '';
  const chips = [];
  for (const f of META_FIELDS) {
    const v = fm[f.key];
    if (v == null || v === '') continue;
    const txt = f.fmt ? f.fmt(v) : String(v);
    if (!txt) continue;
    chips.push(
      `<span class="meta-chip"><svg class="ic" aria-hidden="true"><use href="#${f.icon}"/></svg>${esc(txt)}</span>`
    );
  }
  if (chips.length < 3) return '';
  return `<div class="meta-bar">${chips.join('')}</div>`;
}
function insertMetaBar(html, fm) {
  const bar = buildMetaBar(fm);
  if (!bar) return html;
  const i = html.indexOf('</h1>');
  if (i === -1) return bar + html;
  return html.slice(0, i + 5) + bar + html.slice(i + 5);
}

function buildJsonLd({ fm, docPath, title, ingredients, steps }) {
  const isRecipe = docPath.startsWith('05-食谱库/');
  const url = SITE_ORIGIN + pageUrl(docPath);
  if (isRecipe && ingredients.length && steps.length) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: fm.name || title,
      description: fm.description || `${fm.name || title}的做法，分步记录，含避坑。`,
      url,
      inLanguage: 'zh-CN',
      author: { '@type': 'Organization', name: '毕业生食谱' },
      recipeCategory: fm.category || undefined,
      keywords: Array.isArray(fm.tags) ? fm.tags.join(',') : undefined,
      recipeYield: fm.servings || undefined,
      totalTime: isoDuration(fm.time) || undefined,
      datePublished: fm.created || undefined,
      dateModified: fm.updated || fm.created || undefined,
      recipeIngredient: ingredients,
      recipeInstructions: steps.map((t) => ({ '@type': 'HowToStep', text: t })),
    };
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    url,
    inLanguage: 'zh-CN',
    isPartOf: { '@type': 'WebSite', name: '毕业生食谱', url: SITE_ORIGIN + BASE },
  };
}

/* ---------------- 5. 渲染每个页面 ---------------- */
const shell = readText('index.html');
const SITE_JSON_INLINE = JSON.stringify(SITE).replace(/</g, '\\u003c');

function makePage(docPath) {
  const raw = readText(docPath);
  const fm = parseFrontMatter(raw) || {};
  const meta = docs.find((d) => d.path === docPath);
  const title = meta ? meta.title : docPath;
  const body = renderMarkdown(raw, docPath);
  const mdBody = stripFrontMatter(raw);

  const plain = mdBody
    .replace(/^#{1,6}\s.*$/gm, '')
    .replace(/^\s*[-*]\s*/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([：，。、；！？）])/g, '$1')
    .trim();
  const desc = String(fm.description || plain.slice(0, 108) || '私人食谱库与面食脚本。').trim();

  const jsonLd = buildJsonLd({
    fm, docPath, title,
    ingredients: parseIngredients(mdBody),
    steps: parseSteps(mdBody),
  });

  let html = shell
    .replace(/__BASE__/g, BASE)
    .replace(/__V__/g, VERSION)
    .replace(/__DOC__/g, esc(docPath))
    .replace(/__TITLE__/g, esc(title))
    .replace(/__DESC__/g, esc(desc))
    .replace(/__CANONICAL__/g, esc(SITE_ORIGIN + pageUrl(docPath)))
    .replace(/__OG_URL__/g, esc(SITE_ORIGIN + pageUrl(docPath)))
    .replace(/__SITE_JSON__/g, SITE_JSON_INLINE)
    .replace(/__JSONLD__/g, JSON.stringify(jsonLd, null, 2).replace(/<\//g, '<\\/'));

  html = html.replace(/(<main id="content">)[\s\S]*?(<\/main>)/,
    (m, a, b) => a + '<article class="md">' + insertMetaBar(body, fm) + '</article>' + b);
  return html;
}

/* ---------------- 6. 组装 ---------------- */
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 6.1 手写的站点文件
for (const f of ['site.json', 'manifest.webmanifest', 'robots.txt', '404.html', '.nojekyll']) {
  if (existsSync(join(root, f))) cpSync(join(root, f), join(OUT, f));
}
// 6.2 静态资源
cpSync(join(root, 'assets'), join(OUT, 'assets'), { recursive: true });
// 6.3 原始 Markdown（前端切换文档时还要 fetch 它们）
if (existsSync(join(root, 'README.md'))) cpSync(join(root, 'README.md'), join(OUT, 'README.md'));
for (const entry of readdirSync(root)) {
  if (!/^(0[1-5])-/.test(entry)) continue;
  if (!statSync(join(root, entry)).isDirectory()) continue;
  cpSync(join(root, entry), join(OUT, entry), { recursive: true });
}
// 6.4 清掉模板
function rmTemplates(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) rmTemplates(p);
    else if (/^_(模板|template)\.md$/.test(f)) rmSync(p);
  }
}
rmTemplates(OUT);

// 6.5 每篇文档一个真页面
let pageCount = 0;
const pageErrors = [];
/*
 * 页面结构断言：head 里只应当有一份样式表，且资源路径必须已换过 __BASE__。
 * 起因：index.html 里曾残留一段多余的 </head> + 重复的 `<link href="assets/...">`，
 * 根页看不出来（相对路径恰好等于绝对路径），但每个深层页都会多发一个 404 请求。
 */
function validatePage(html, label) {
  const links = html.match(/<link[^>]+rel="stylesheet"[^>]*>/g) || [];
  if (links.length !== 1) {
    pageErrors.push(`${label}：样式表 link 有 ${links.length} 个，应为 1 个`);
    links.forEach((l) => pageErrors.push('      ' + l.trim()));
  }
  if (/<link[^>]+href="assets\//.test(html) || /<script[^>]+src="assets\//.test(html)) {
    pageErrors.push(`${label}：有未替换 __BASE__ 的相对资源路径，深层页会 404`);
  }
  const heads = (html.match(/<\/head>/g) || []).length;
  if (heads !== 1) pageErrors.push(`${label}：</head> 出现 ${heads} 次，应为 1 次`);
}
for (const docPath of seen) {
  const file = outFile(docPath);
  const html = makePage(docPath);
  validatePage(html, docPath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  pageCount++;
}

// 6.6 首页：默认展示「今日要做」，没有就展示食谱索引
const homeDoc = (SITE.today && SITE.today.path && seen.has(SITE.today.path))
  ? SITE.today.path
  : (docs.find((d) => d.path.indexOf('05-食谱库/00') === 0) || docs[0]).path;
const homeHtml = makePage(homeDoc);
validatePage(homeHtml, 'index.html');
writeFileSync(join(OUT, 'index.html'), homeHtml);

if (pageErrors.length) {
  console.error('✗ 页面结构校验未通过（会多发无效请求）：');
  pageErrors.forEach((e) => console.error('  · ' + e));
  process.exit(1);
}

// 6.7 sitemap（P3-2：覆盖全部文档）
const today = new Date().toISOString().slice(0, 10);
const urls = [BASE, ...[...seen].map((p) => pageUrl(p))];
writeFileSync(join(OUT, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => `  <url>\n    <loc>${SITE_ORIGIN}${u}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${u === BASE ? '1.0' : '0.7'}</priority>\n  </url>`).join('\n') +
  '\n</urlset>\n');

// 6.8 Service Worker（P0-3），带版本号
if (existsSync(join(root, 'sw.js'))) {
  const sw = readText('sw.js').replace(/__V__/g, VERSION).replace(/__BASE__/g, BASE);
  writeFileSync(join(OUT, 'sw.js'), sw);
}

/* ---------------- 7. 报告 ---------------- */
const total = (function walk(d) {
  let n = 0;
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    n += statSync(p).isDirectory() ? walk(p) : 1;
  }
  return n;
})(OUT);

console.log(`✅ 站点已生成：${relative(root, OUT) || '.'}`);
console.log(`   base=${BASE}  版本=${VERSION}`);
console.log(`   文档页面 ${pageCount} 个，首页 -> ${homeDoc}`);
console.log(`   sitemap ${urls.length} 条 URL，共 ${total} 个文件`);
