---
description: 提交前自检：站点构建断言 + JS 语法
---
提交前跑一遍校验，全部通过才算好：

```bash
node scripts/build-recipes.mjs
node scripts/build-index.mjs
node scripts/build-site.mjs
node scripts/build-static.mjs --base /EasyVLog/ --out _site
node --check assets/app.js
node --check sw.js
```

- `build-static` 用的是**部署 base**，本地预览是 `--base /`，别混。
- 有失败就定位修复并重跑。
- 汇报：通过了哪些、修了什么。
