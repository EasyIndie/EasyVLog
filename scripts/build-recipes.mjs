#!/usr/bin/env node
/**
 * 由 03-食谱库 各食谱的 front matter 生成 00-食谱索引.md
 * 归属：私人食谱库（核心）
 * 用法: node scripts/build-recipes.mjs
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMarkdownDir, fmtDuration } from './lib/frontmatter.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, '03-食谱库');
const indexPath = join(dir, '00-食谱索引.md');

const entries = readMarkdownDir(dir, { exclude: ['00-食谱索引.md'] });
const recipes = [];
for (const e of entries) {
  if (!e.data) {
    console.warn(`⚠️  ${e.file} 缺少 front matter，已跳过`);
    continue;
  }
  recipes.push(e);
}

recipes.sort(
  (a, b) =>
    String(a.data.category || '').localeCompare(String(b.data.category || ''), 'zh') ||
    String(a.data.name || '').localeCompare(String(b.data.name || ''), 'zh')
);

const byCat = new Map();
for (const r of recipes) {
  const c = r.data.category || '未分类';
  if (!byCat.has(c)) byCat.set(c, []);
  byCat.get(c).push(r);
}

const today = new Date().toISOString().slice(0, 10);
let out = `# 00 · 食谱索引\n\n`;
out += `> **私人食谱库（核心）**｜⚠️ 本文件由 \`scripts/build-recipes.mjs\` 自动生成，**不要手改**。\n`;
out += `> 数据来源：各食谱 md 的 front matter　｜　重建：\`node scripts/build-recipes.mjs\`　｜　最后生成：${today}\n\n`;
out += `共 **${recipes.length}** 个食谱。\n\n`;

if (recipes.length === 0) {
  out += `（还没有食谱，运行 \`node scripts/new-recipe.mjs "名称" --category "分类"\` 新建）\n`;
}

for (const [cat, list] of byCat) {
  out += `## ${cat}\n\n`;
  out += `| 名称 | 难度 | 耗时 | 份量 | 关联 |\n|---|---|---|---|---|\n`;
  for (const r of list) {
    const d = r.data;
    out += `| [${d.name}](${r.file}) | ${d.difficulty || ''} | ${fmtDuration(d.time)} | ${d.servings || ''} | ${d.source || ''} |\n`;
  }
  out += `\n`;
}

out += `## 新增一个食谱\n\n`;
out += '```bash\nnode scripts/new-recipe.mjs "韭菜鸡蛋胡萝卜包" --category "包子"\n```\n\n';
out += `分类建议：包子 / 馒头花卷 / 饺子馄饨 / 面条 / 饼 / 馅料 / 基础面团 / 汤菜\n`;

writeFileSync(indexPath, out);
console.log(`✅ 已生成 ${indexPath}`);
console.log(`   食谱 ${recipes.length} 个，分类 ${byCat.size} 个`);
