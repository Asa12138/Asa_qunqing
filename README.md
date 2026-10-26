# 群青旅行地图册

独立 HTML/CSS/JavaScript 网站，发布地址：<https://asa12138.github.io/Asa_qunqing/>。
页面在浏览器直接运行，无后台服务；Python 和 Node.js 仅用于本地维护相册与照片。

## 日常维护

1. 将照片、`trip*.json` 和 `story*.md` 放在 `images/<旅程>/`。保留摄影原件在网站目录之外。
2. 双击 `压缩照片.command`，或运行 `node scripts/compress-images.cjs --apply`。它会压缩大图、生成缩略图、更新相册数据，并保留可恢复的原图。
3. 只修改游记或相册顺序时，运行 `python3 manage.py build`，或双击 `更新相册.command`。该命令不会压缩大图，会复用校验一致的缩略图。
4. 用 `python3 -m http.server 8772 --bind 127.0.0.1` 预览，核对后提交并推送 `main`。

修改 HTML 模板时编辑 `qunqing-v3.html`，管理脚本会同步到 `index.html`。
新增旅程可用 `python3 manage.py new <目录名> --title <标题> --date YYYY-MM-DD --location <地点>`；详情见 `python3 manage.py new --help`。

## 图片工具

复用开源 [sharp](https://github.com/lovell/sharp) / libvips，依赖版本写在 `package.json`。一般环境使用 Node.js 和 `npm install`；本机也可复用已有 Codex bundled sharp，不重复安装。Python 管理器仅使用标准库。

```sh
# 只试算，不覆盖照片
node scripts/compress-images.cjs

# 执行：大图长边最多 2560 px、WebP quality=82；缩略图 720 px、quality=78
node scripts/compress-images.cjs --apply

# 统计所有图片，输出 JSON / CSV / Markdown
node scripts/image-sizes.cjs
node scripts/image-sizes.cjs --out reports/my-snapshot

# 只更新页面，复用已有缩略图，不运行图片编码
python3 manage.py build --skip-thumbnails
```

压缩规则：

- 已是 WebP 且长边不超过 2560 px 的照片不重复压缩；只有输出更小时才替换。
- JPG、PNG、静态 GIF、AVIF 在转换更小时变为 `<原文件名>.webp`，相册配置和封面引用一同更新。动画图片拒绝处理。常规格式保留原比例，不放大。
- 缩略图从大图输入生成，命名包含原扩展名以避免同名碰撞；`image-manifest.json` 通过 SHA-256 复用已有结果。旧 JPEG 缩略图仅在替代文件就绪后移除。
- 替换前的原图默认存入相邻的 `Asa_qunqing-originals/`，文件名带校验值，避免覆盖备份。也可传 `--originals-dir <已有原图仓库>`，校验一致时直接复用已有原件；或用 `--backup-dir <网站之外的目录>` 改变备份位置。
- 本轮原件已核对并复用相邻 `Asa12138.github.io/images/`，未额外复制一整套原图。以后清理旧主站前，应先将这些原件移到独立照片归档处。
- 统计脚本只读图片，不修改文件。`reports/before-2026-10-26/` 和 `reports/after-2026-10-26/` 保存本轮前后统计，`reports/compression-2026-10-26.json` 保存逐文件压缩与原件位置记录。

## GitHub Pages

GitHub Actions 从 `main` 发布。`scripts/prepare-pages.py` 仅复制网页、照片、音频、地图和第三方前端资源到 `_site/`；维护脚本、统计报告、原图备份和 Git 历史不进入公开站点。线上部署不运行 npm 或照片压缩。

资源使用相对路径，兼容项目子路径 `/Asa_qunqing/`。更换仓库名称或域名时，需要修改 HTML 模板中的 canonical。

照片、网页和音频在 Pages 上公开可访问；仓库私有只保护仓库及维护文件。现有口令是个人玩法入口。保持既有浏览器存储键；在 `asa12138.github.io` 同域发布时可继续读到原来的记录，不主动清空。

高德地图使用既有浏览器端配置；遇到域名限制需在高德控制台核对。地点索引、本地地球与相册可独立使用。旧主站 `/qunqing/` 的切换和资源清理另行完成。
