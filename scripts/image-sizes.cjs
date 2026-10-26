#!/usr/bin/env node
// Read-only inventory. Output: JSON, CSV, and Markdown; images are never modified.
const { fs, path, sharp, root, suffixes, walk, atomic, arg } = require('./image-common.cjs');
const sum = values => values.reduce((a, b) => a + b, 0);
const quantile = (values, q) => {
  const v = [...values].sort((a, b) => a - b), i = (v.length - 1) * q;
  return v.length ? v[Math.floor(i)] + (v[Math.ceil(i)] - v[Math.floor(i)]) * (i % 1) : 0;
};
(async () => {
  const output = path.resolve(root, arg('--out', 'reports/current'));
  const rows = [];
  for (const file of await walk(path.join(root, 'images'))) {
    if (!suffixes.has(path.extname(file).toLowerCase())) continue;
    const relative = path.relative(root, file).split(path.sep).join('/');
    const stat = await fs.stat(file), meta = await sharp(file).metadata();
    rows.push({ file: relative, kind: relative.startsWith('images/atlas-thumbs/') ? 'thumbnail' : 'photo', bytes: stat.size,
      format: meta.format, width: meta.width, height: meta.height, longEdge: Math.max(meta.width, meta.height) });
  }
  const summary = {};
  for (const kind of ['photo', 'thumbnail']) {
    const set = rows.filter(r => r.kind === kind), sizes = set.map(r => r.bytes);
    const edges = [0, 100 * 1024, 300 * 1024, 500 * 1024, 1024 ** 2, 2 * 1024 ** 2, 5 * 1024 ** 2, Infinity];
    summary[kind] = { count: set.length, bytes: sum(sizes), min: sizes.length ? Math.min(...sizes) : 0,
      median: quantile(sizes, .5), p90: quantile(sizes, .9), max: sizes.length ? Math.max(...sizes) : 0,
      formats: Object.fromEntries([...new Set(set.map(r => r.format))].map(format => [format, set.filter(r => r.format === format).length])),
      over2560: set.filter(r => r.longEdge > 2560).length,
      bins: edges.slice(0, -1).map((low, i) => ({ minBytes: low, maxBytes: Number.isFinite(edges[i + 1]) ? edges[i + 1] : null,
        count: set.filter(r => r.bytes >= low && r.bytes < edges[i + 1]).length })) };
  }
  await atomic(path.join(output, 'sizes.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary, files: rows }, null, 2) + '\n');
  const columns = ['kind', 'file', 'bytes', 'format', 'width', 'height', 'longEdge'];
  await atomic(path.join(output, 'sizes.csv'), '\ufeff' + columns.join(',') + '\n' + rows.map(row => columns.map(k => '"' + String(row[k]).replaceAll('"', '""') + '"').join(',')).join('\n') + '\n');
  const lines = ['# 图片大小统计', '', '| 类型 | 数量 | 总大小 MiB | 最小 KiB | 中位数 KiB | 最大 MiB |', '|---|---:|---:|---:|---:|---:|'];
  for (const [kind, r] of Object.entries(summary)) lines.push(`| ${kind} | ${r.count} | ${(r.bytes / 1024 ** 2).toFixed(2)} | ${(r.min / 1024).toFixed(1)} | ${(r.median / 1024).toFixed(1)} | ${(r.max / 1024 ** 2).toFixed(2)} |`);
  lines.push('', '## 最大的 20 张大图', '', '| 文件 | 尺寸 | MiB |', '|---|---:|---:|');
  for (const r of rows.filter(r => r.kind === 'photo').sort((a, b) => b.bytes - a.bytes).slice(0, 20)) lines.push(`| ${r.file} | ${r.width}×${r.height} | ${(r.bytes / 1024 ** 2).toFixed(2)} |`);
  await atomic(path.join(output, 'sizes.md'), lines.join('\n') + '\n');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`报告：${path.relative(root, output)}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
