#!/bin/zsh
set -eu
album_root="${0:A:h}"
node "$album_root/scripts/image-sizes.cjs"
printf '\n统计结果在 reports/current。按回车关闭窗口。\n'
read
