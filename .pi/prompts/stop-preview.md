---
description: 停止本地预览（静态服务 + watch）
---
停止 `preview.sh` 起的本地预览：

```bash
./scripts/stop-preview.sh
```

它会先停 `watch.mjs`，再停 `python3 -m http.server` 与 `preview.sh` 本身。
汇报停掉了哪些进程；若本来没在跑，如实说明。
