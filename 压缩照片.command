#!/bin/zsh
set -eu
album_root="${0:A:h}"
node "$album_root/scripts/compress-images.cjs" --apply
node "$album_root/scripts/image-sizes.cjs"
printf '\n照片与网页数据已更新。按回车关闭窗口。\n'
read
