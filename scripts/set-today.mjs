#!/usr/bin/env node
/**
 * 设置「今日要做」——站点置顶高亮并默认打开。
 * 用法:
 *   node scripts/set-today.mjs "韭菜鸡蛋胡萝卜包"
 *   node scripts/set-today.mjs "韭菜" --note "第 01 集 · 没有粉丝版"
 *   node scripts/set-today.mjs "05-食谱库/花卷.md"
 *   node scripts/set-today.mjs --clear
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseFrontMatter } from './lib/frontmatter.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const todayPath = join(root, 'data', 'today.json');

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
  console.log('用法: node scripts/set-today.mjs "关键词或路径" [--note "备注"]');
  console.log('     node scripts/set-today.mjs --clear');
  process.exit(0);
}

if (argv.includes('--clear')) {
  if (existsSync(todayPath)) writeFileSync(todayPath, JSON.stringify({ path: '' }, null, 2) + '\n');
  execFileSync(process.execPath, [join(root, 'scripts', 'build-site.mjs')], { stdio: 'inherit' });
  console.log('已清除「今日要做」');
  process.exit(0);
}

let query = null;
let note = '';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--note') note = argv[++i] || '';
  else if (!query) query = argv[i];
}
if (!query) {
  console.error('❌ 缺少关键词或路径');
  process.exit(1);
}

// 收集所有可选的 md（食谱库优先）
const searchDirs = ['05-食谱库', '02-分集脚本', '01-账号规划', '04-运营记录'];
const candidates = [];
for (const dir of searchDirs) {
  const full = join(root, dir);
  if (!existsSync(full)) continue;
  for (const f of readdirSync(full)) {
    if (!f.endsWith('.md') || f.startsWith('_')) continue;
    const rel = `${dir}/${f}`;
    const raw = readFileSync(join(root, dir, f), 'utf8');
    const fm = parseFrontMatter(raw) || {};
    const h1 = (raw.match(/^#\s+(.+)$/m) || [])[1] || '';
    candidates.push({
      path: rel,
      names: [f.replace(/\.md$/, ''), fm.name, fm.title, h1.replace(/^[^·]*·\s*/, '')].filter(Boolean),
    });
  }
}

let hit = null;
// 1) 直接是路径
if (query.endsWith('.md') && existsSync(join(root, query))) {
  hit = candidates.find((c) => c.path === query) || { path: query, names: [query] };
} else {
  // 2) 名称精确匹配
  hit = candidates.find((c) => c.names.some((n) => n === query));
  // 3) 名称包含
  if (!hit) hit = candidates.find((c) => c.names.some((n) => n.includes(query)));
}

if (!hit) {
  console.error(`❌ 没找到匹配「${query}」的文档`);
  console.error('   可选：' + candidates.slice(0, 12).map((c) => c.names[0]).join('、'));
  process.exit(1);
}

const data = { path: hit.path, note, set: new Date().toISOString().slice(0, 10) };
writeFileSync(todayPath, JSON.stringify(data, null, 2) + '\n');
console.log(`✅ 今日要做：${hit.path}${note ? '（' + note + '）' : ''}`);

execFileSync(process.execPath, [join(root, 'scripts', 'build-site.mjs')], { stdio: 'inherit' });
