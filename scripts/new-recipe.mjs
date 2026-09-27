#!/usr/bin/env node
/**
 * 新建一个食谱卡（私人食谱库），并自动重建索引。
 * 用法:
 *   node scripts/new-recipe.mjs "名称"
 *   node scripts/new-recipe.mjs "名称" --category "包子"
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseFrontMatter } from './lib/frontmatter.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, '05-食谱库');
const templatePath = join(dir, '_模板.md');

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
  console.log('用法: node scripts/new-recipe.mjs "名称" [--category 分类] [--id 数字]');
  process.exit(argv.length === 0 ? 1 : 0);
}

let name = null;
let category = '未分类';
let id = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--category') category = argv[++i] || '未分类';
  else if (a === '--id') id = Number(argv[++i]);
  else if (!name) name = a;
}
if (!name) {
  console.error('❌ 缺少名称');
  process.exit(1);
}

// 已有 id
const existing = readdirSync(dir)
  .filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== '00-食谱索引.md')
  .map((f) => parseFrontMatter(readFileSync(join(dir, f), 'utf8')))
  .filter(Boolean)
  .map((d) => Number(d.id))
  .filter((n) => Number.isFinite(n));

if (id == null) id = existing.length ? Math.max(...existing) + 1 : 1;

const slug = name.replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, '');
const filePath = join(dir, `${slug}.md`);
if (existsSync(filePath)) {
  console.error(`❌ 文件已存在: ${slug}.md`);
  process.exit(1);
}
if (!existsSync(templatePath)) {
  console.error('❌ 缺少 05-食谱库/_模板.md');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const content = readFileSync(templatePath, 'utf8')
  .replaceAll('{{id}}', String(id))
  .replaceAll('{{name}}', name)
  .replaceAll('{{category}}', category)
  .replaceAll('{{date}}', today);

writeFileSync(filePath, content);
console.log(`✅ 已创建 ${filePath}`);

execFileSync(process.execPath, [join(root, 'scripts', 'build-recipes.mjs')], { stdio: 'inherit' });
