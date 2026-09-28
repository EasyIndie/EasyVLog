#!/usr/bin/env node
/**
 * 监听源文件，改动后自动重建站点。
 * 配合 `./scripts/preview.sh --watch` 使用，也可以单独跑。
 * 用法: node scripts/watch.mjs
 */
import { watch } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* 构建输入。注意不要把产物 _site/ 放进来，否则构建会触发下一轮构建 */
const WATCH_DIRS = ['02-分集脚本', '03-食谱库', '01-创作', 'assets', 'data'];
const WATCH_FILES = ['index.html', 'sw.js', 'README.md', 'AGENTS.md', '创作指南.md', '开发指南.md'];

/* 一次重建 = preview.sh 里的四步，顺序不能乱 */
const BUILD = [
  { file: 'scripts/build-recipes.mjs', args: [] },
  { file: 'scripts/build-index.mjs', args: [] },
  { file: 'scripts/build-site.mjs', args: [] },
  { file: 'scripts/build-static.mjs', args: ['--base', '/', '--out', '_site'] },
];

/** 忽略编辑器临时文件与构建产物 */
const IGNORE = /(^|[\\/])(_site|\.#|#.*#|\.git)|~$|\.swp$|\.tmp$/;

const clock = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });

function rebuild() {
  for (const step of BUILD) {
    const r = spawnSync(process.execPath, [join(root, step.file), ...step.args], { stdio: 'inherit' });
    if (r.status !== 0) return false;
  }
  return true;
}

/* 编辑器保存常常连发多次事件：防抖 + 串行，避免几轮构建互相踩 */
let timer = null;
let running = false;
let queued = false;

function schedule(filename) {
  if (filename && IGNORE.test(String(filename))) return;
  clearTimeout(timer);
  timer = setTimeout(run, 150);
}

function run() {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  process.stdout.write(`\n↻ [${clock()}] 重新构建…\n`);
  const ok = rebuild();
  process.stdout.write(ok ? `✅ [${clock()}] 构建完成，刷新浏览器\n` : '❌ 构建失败（改好会再触发）\n');
  running = false;
  if (queued) {
    queued = false;
    run();
  }
}

let count = 0;
for (const dir of WATCH_DIRS) {
  try {
    watch(join(root, dir), (event, filename) => schedule(filename));
    count++;
  } catch (e) {
    console.warn(`⚠️  监听 ${dir} 失败：${e.message}`);
  }
}
for (const file of WATCH_FILES) {
  try {
    watch(join(root, file), () => schedule(file));
    count++;
  } catch {
    /* 文件不存在就跳过 */
  }
}

if (!count) {
  console.error('✗ 没有可监听的路径');
  process.exit(1);
}
console.log(`👀 正在监听 ${count} 个路径，改动自动重建（Ctrl+C 结束）`);
