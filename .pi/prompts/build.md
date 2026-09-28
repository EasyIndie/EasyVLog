---
description: 重建索引与静态站点（四步构建）
---
按顺序重建全部产物（顺序不能乱）：

```bash
node scripts/build-recipes.mjs
node scripts/build-index.mjs
node scripts/build-site.mjs
node scripts/build-static.mjs --base / --out _site
```

- 任一步失败就定位并修复后重跑；`build-static` 的断言（缺 front matter、导航指向不存在文件、页面重复样式表）必须先通过。
- 只改了内容（文档 / front matter）时，前两步就够；改了目录、导航或新增文档，再跑后两步。
- 完成后汇报：重建了哪些索引、生成 / 更新了哪些站点文件。
