import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** 极简 YAML front matter 解析：支持 `key: value` 与 `key: [a, b]` */
export function parseFrontMatter(text) {
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

/** 读取目录下所有 .md（排除 `_` 前缀与 exclude 指定文件），返回 [{ file, data }] */
export function readMarkdownDir(dir, { exclude = [] } = {}) {
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    if (f.startsWith('_')) continue;
    if (exclude.includes(f)) continue;
    const raw = readFileSync(join(dir, f), 'utf8');
    out.push({ file: f, data: parseFrontMatter(raw) });
  }
  return out;
}
