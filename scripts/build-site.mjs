#!/usr/bin/env node
/**
 * 生成 GitHub Pages 用的导航清单 site.json
 * 用法: node scripts/build-site.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontMatter } from './lib/frontmatter.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fmOf(dir, file) {
  try {
    return parseFrontMatter(readFileSync(join(root, dir, file), 'utf8')) || {};
  } catch {
    return {};
  }
}

function titleOf(dir, file) {
  const raw = readFileSync(join(root, dir, file), 'utf8');
  const fm = parseFrontMatter(raw);
  if (fm && (fm.name || fm.title)) return String(fm.name || fm.title);
  const h1 = raw.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].replace(/^[^·]*·\s*/, '').trim();
  return file.replace(/\.md$/, '');
}

/*
 * 文件名（第01集、花卷、韭菜鸡蛋…）按中文/数字排序都不等于“创建顺序”，
 * 站点目录里就会出现「花卷」排在「韭菜鸡蛋胡萝卜包」前面这种错位。
 * 以 front matter 的 id 为准（同一目录内唯一、递增），没有 id 的再按名称排。
 */
function byIdThenName(dir) {
  return (a, b) => {
    const ia = Number(fmOf(dir, a).id);
    const ib = Number(fmOf(dir, b).id);
    const hasA = Number.isFinite(ia);
    const hasB = Number.isFinite(ib);
    if (hasA && hasB && ia !== ib) return ia - ib;
    if (hasA !== hasB) return hasA ? -1 : 1;
    return a.localeCompare(b, 'zh');
  };
}

function listDir(dir, { order = [], exclude = [] } = {}) {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  const files = readdirSync(full).filter(
    (f) => f.endsWith('.md') && !f.startsWith('_') && !exclude.includes(f)
  );
  const ordered = order.filter((f) => files.includes(f));
  const rest = files.filter((f) => !ordered.includes(f)).sort(byIdThenName(dir));
  return [...ordered, ...rest].map((f) => ({ title: titleOf(dir, f), path: `${dir}/${f}` }));
}

const sections = [
  {
    title: '总览',
    icon: 'info',
    items: [{ title: '项目总览', path: 'README.md' }],
  },
  {
    title: '创作',
    icon: 'clipboard-list',
    items: [
      { title: '创作指南', path: '创作指南.md' },
      ...listDir('01-创作', { order: ['01-定位与调性.md'] }),
    ],
  },
  {
    title: '食谱库',
    icon: 'book-open',
    highlight: true,
    items: listDir('03-食谱库', { order: ['00-食谱索引.md'] }),
  },
  {
    title: '分集脚本',
    icon: 'clapperboard',
    items: listDir('02-分集脚本', { order: ['00-分集索引.md'] }),
  },
  {
    title: '开发',
    icon: 'list',
    items: [{ title: '开发指南', path: '开发指南.md' }],
  },
].filter((s) => s.items.length > 0);

const data = {
  generated: new Date().toISOString().slice(0, 10),
  title: '毕业生食谱',
  sections,
};

// 今日要做（来源：data/today.json）
try {
  const t = JSON.parse(readFileSync(join(root, 'data', 'today.json'), 'utf8'));
  if (t && t.path) {
    const all = sections.flatMap((s) => s.items);
    const hit = all.find((i) => i.path === t.path);
    data.today = {
      path: t.path,
      title: (hit && hit.title) || t.title || t.path,
      note: t.note || '',
    };
  }
} catch {
  /* 没有 today.json 就跳过 */
}

writeFileSync(join(root, 'site.json'), JSON.stringify(data, null, 2) + '\n');
const count = sections.reduce((n, s) => n + s.items.length, 0);
console.log(`✅ 已生成 site.json：${sections.length} 个分区，${count} 篇文档`);
if (data.today) console.log(`   今日要做：${data.today.title}`);
