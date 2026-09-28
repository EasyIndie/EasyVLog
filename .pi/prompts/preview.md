---
description: 本地构建并预览站点（可 --watch 自动重建）
argument-hint: "[--watch] [端口]"
---
本地预览站点。`preview.sh` 会先构建再起静态服务，前台会一直占用，所以放后台跑：

```bash
nohup ./scripts/preview.sh $@ >/tmp/easyvlog-preview.log 2>&1 &
sleep 8
tail -n 25 /tmp/easyvlog-preview.log
```

- 参数原样传给脚本：加 `--watch` 会在文件改动后自动重建；不传端口默认 8000。
- 把访问地址（如 http://127.0.0.1:8000）告诉用户，并附停止方法：`/stop-preview`（或 `./scripts/stop-preview.sh`）。
- 若日志里构建失败，先按报错修复再重试。

注意：`index.html` 是模板，不能直接双击打开；产物在 `_site/`（已 gitignore）。
