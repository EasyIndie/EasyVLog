---
description: 按提交约定提交并推送（一次一件事）
argument-hint: "[提交信息]"
---
先看清改动，再提交推送：

1. `git status --short` 与 `git diff` 看改了什么。
2. 涉及 front matter / `data/backlog.json` 就先跑 `/build` 重建索引；涉及站点就跑 `/check`。
3. 提交信息用中文前缀：`脚本:` `规划:` `数据:` `结构:` `修复:` `工具:`；一次提交只做一件事。
   用户给了就用它，没给就按改动内容拟一个。用户提供：${1:-（无）}
4. 执行 `git add -A` → `git commit -m "<信息>"` → `git push origin main`。
5. 汇报 commit hash 与推送结果（推 `main` 会自动构建并部署 Pages）。

注意：护栏未被破坏、索引已重建，才能提交。
