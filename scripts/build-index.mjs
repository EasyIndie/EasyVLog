#!/usr/bin/env node
/**
 * 由分集脚本的 YAML front matter + data/backlog.json 生成 00-分集索引.md
 * 用法: node scripts/build-index.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptsDir = join(root, '02-分集脚本');
const indexPath = join(scriptsDir, '00-分集索引.md');
const backlogPath = join(root, 'data', 'backlog.json');

/** 极简 front matter 解析：支持 `key: value` 与 `key: [a, b]` */
function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    data[key] = val;
  }
  return data;
}

const files = readdirSync(scriptsDir).filter((f) => /^第\d+集-.*\.md$/.test(f));
const episodes = [];
for (const f of files) {
  const fm = parseFrontMatter(readFileSync(join(scriptsDir, f), 'utf8'));
  if (!fm) {
    console.warn(`⚠️  ${f} 缺少 front matter，已跳过`);
    continue;
  }
  episodes.push({ ...fm, file: f });
}
episodes.sort((a, b) => Number(a.id) - Number(b.id));

let backlog = { items: [] };
try {
  backlog = JSON.parse(readFileSync(backlogPath, 'utf8'));
} catch {
  console.warn('⚠️  未找到 data/backlog.json，选题池为空');
}

const statusEmoji = {
  选题: '💡',
  脚本: '📝',
  待拍: '🎬',
  已拍: '🎬',
  已发: '🚀',
  归档: '🗄️',
};
const badge = (s) => `${statusEmoji[s] || '•'} ${s || '脚本'}`;
const pad = (n) => String(n).padStart(2, '0');
const today = new Date().toISOString().slice(0, 10);

let out = `# 00 · 分集索引\n\n`;
out += `> ⚠️ 本文件由 \`scripts/build-index.mjs\` 自动生成，**不要手改**。\n`;
out += `> 数据来源：各集 md 的 front matter + \`data/backlog.json\`\n`;
out += `> 重建命令：\`node scripts/build-index.mjs\`　｜　最后生成：${today}\n\n`;

out += `## 已建脚本\n\n`;
out += `| 集号 | 标题 | 栏目 | 状态 | 脚本 |\n|---|---|---|---|---|\n`;
if (episodes.length === 0) {
  out += `| — | （暂无） | | | |\n`;
}
for (const e of episodes) {
  out += `| ${pad(e.id)} | ${e.title} | ${e.series || ''} | ${badge(e.status)} | [打开](${e.file}) |\n`;
}

out += `\n## 选题池（未建脚本）\n\n`;
out += `| 集号 | 标题 | 栏目 |\n|---|---|---|\n`;
if (backlog.items.length === 0) {
  out += `| — | （空） | |\n`;
}
for (const it of backlog.items) {
  out += `| ${pad(it.id)} | ${it.title} | ${it.series || ''} |\n`;
}

out += `\n## 状态说明\n\n`;
out += `- 💡 选题：只在选题池里\n`;
out += `- 📝 脚本：已写分镜脚本\n`;
out += `- 🎬 待拍 / 已拍：进入拍摄流程\n`;
out += `- 🚀 已发：已发布\n\n`;

out += `## 新增一集\n\n`;
out += '```bash\nnode scripts/new-episode.mjs "标题" --series "栏目"\n```\n\n';
out += `该命令会从 \`_template.md\` 生成骨架并自动重建本索引。\n`;

writeFileSync(indexPath, out);
console.log(`✅ 已生成 ${indexPath}`);
console.log(`   脚本 ${episodes.length} 集，选题池 ${backlog.items.length} 条`);
