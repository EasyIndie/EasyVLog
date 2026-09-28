#!/usr/bin/env node
/**
 * 新建一集分集脚本骨架，并自动重建索引。
 * 用法:
 *   node scripts/new-episode.mjs "标题"
 *   node scripts/new-episode.mjs "标题" --series "翻车日记"
 *   node scripts/new-episode.mjs "标题" --id 7
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptsDir = join(root, '02-视频脚本');
const templatePath = join(scriptsDir, '_template.md');
const backlogPath = join(root, 'data', 'backlog.json');

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
  console.log('用法: node scripts/new-episode.mjs "标题" [--series 栏目] [--id 数字]');
  process.exit(argv.length === 0 ? 1 : 0);
}

let title = null;
let series = '';
let id = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--series') series = argv[++i] || '';
  else if (a === '--id') id = Number(argv[++i]);
  else if (!title) title = a;
}
if (!title) {
  console.error('❌ 缺少标题');
  process.exit(1);
}

// 已有分集 id
const existingIds = readdirSync(scriptsDir)
  .filter((f) => /^第\d+集-.*\.md$/.test(f))
  .map((f) => Number(f.match(/^第(\d+)集/)[1]));

// 选题池
let backlog = { items: [] };
try {
  backlog = JSON.parse(readFileSync(backlogPath, 'utf8'));
} catch {}

// 决定 id
let fromBacklog = false;
if (id == null) {
  const hit = backlog.items.find((it) => it.title === title);
  if (hit) {
    id = hit.id;
    fromBacklog = true;
  } else {
    const allIds = [...existingIds, ...backlog.items.map((it) => it.id)];
    id = allIds.length ? Math.max(...allIds) + 1 : 1;
  }
}

const padded = String(id).padStart(2, '0');
const slug = title.replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, '').slice(0, 24);
const fileName = `第${padded}集-${slug}.md`;
const filePath = join(scriptsDir, fileName);

if (existingIds.includes(id)) {
  console.error(`❌ 第 ${padded} 集已存在，换一个 --id 或去掉 --id`);
  process.exit(1);
}
if (existsSync(filePath)) {
  console.error(`❌ 文件已存在: ${fileName}`);
  process.exit(1);
}

// 套模板
if (!existsSync(templatePath)) {
  console.error('❌ 缺少 02-视频脚本/_template.md');
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);
const content = readFileSync(templatePath, 'utf8')
  .replaceAll('{{id}}', String(id))
  .replaceAll('{{idPadded}}', padded)
  .replaceAll('{{title}}', title)
  .replaceAll('{{headline}}', title)
  .replaceAll('{{series}}', series || '今天做______')
  .replaceAll('{{date}}', today);

writeFileSync(filePath, content);
console.log(`✅ 已创建 ${filePath}`);

// 从选题池移除
if (fromBacklog) {
  backlog.items = backlog.items.filter((it) => it.id !== id);
  writeFileSync(backlogPath, JSON.stringify(backlog, null, 2) + '\n');
  console.log(`✅ 已从选题池移除第 ${padded} 集`);
}

// 重建索引
execFileSync(process.execPath, [join(root, 'scripts', 'build-index.mjs')], { stdio: 'inherit' });
