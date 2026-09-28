---
description: 往选题池加一条选题并同步索引
argument-hint: "<选题标题> [栏目]"
---
在 `data/backlog.json` 的 `items` 末尾新增一条：

```json
{ "id": <现有最大 id + 1>, "title": "$1", "series": "${2:-今天做______}" }
```

- 保持 2 空格缩进、中文不转义。
- 选题要符合调性（`AGENTS.md` 第 2 节、`创作指南.md`），别消费「毕业 / 失业」梗。
- 改完运行 `node scripts/build-index.mjs`，确认该选题出现在 `02-分集脚本/00-分集索引.md` 的选题池里。
