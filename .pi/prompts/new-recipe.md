---
description: 新建一个食谱卡（私人食谱库）并重建索引
argument-hint: "<名称> [分类]"
---
使用 `recipe-writer` 技能，为 `05-食谱库/` 新增一个食谱卡。

- 名称：$1
- 分类：${2:-未分类}

步骤：
1. 运行：`node scripts/new-recipe.mjs "$1" --category "${2:-未分类}"`
2. 按 `05-食谱库/_模板.md` 的格式填写：食材表（**含克数/个数量**）、步骤、关键点/避坑、变体。
3. 若对应某集视频，`source` 填「第 XX 集」。
4. 完成后运行 `node scripts/build-recipes.mjs`，并汇报。
