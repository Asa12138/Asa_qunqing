#!/usr/bin/env node
// Default: dry run. --apply writes optimized files after preserving recoverable originals.
const { fs, path, sharp, root, hash, inside, local, exists, atomic, walk, python, albums, sources, thumbnail, arg } = require('./image-common.cjs');
const apply = process.argv.includes('--apply');
const thumbnailsOnly = process.argv.includes('--thumbnails-only');
const profile = { edge: 2560, quality: 82, thumbnailEdge: 720, thumbnailQuality: 78, effort: 4 };
const originals = arg('--originals-dir', null);
const originalRoot = originals ? path.resolve(root, originals) : null;
const backupRoot = path.resolve(root, arg('--backup-dir', path.join('..', path.basename(root) + '-originals')));
if (inside(root, backupRoot)) throw new Error('原图备份目录必须在网站目录之外。');
const stateFile = local('image-manifest.json');
const reportFile = path.resolve(root, arg('--report', apply ? 'reports/compression-latest.json' : 'reports/compression-preview.json'));
if (process.argv.includes('--help')) {
  console.log('用法：node scripts/compress-images.cjs [--apply] [--thumbnails-only] [--originals-dir DIR] [--backup-dir DIR] [--report FILE]\n默认仅试算。原图备份必须位于网站之外。');
  process.exit(0);
}
async function preserve(source, buffer) {
  if (originalRoot) {
    const candidate = path.join(originalRoot, source);
    if (!inside(root, candidate) && await exists(candidate) && hash(await fs.readFile(candidate)) === hash(buffer)) return path.relative(root, candidate);
  }
  const target = path.join(backupRoot, path.dirname(source), hash(buffer).slice(0, 16) + '-' + path.basename(source));
  if (await exists(target)) {
    if (hash(await fs.readFile(target)) !== hash(buffer)) throw new Error('备份文件校验失败：' + target);
  } else await atomic(target, buffer);
  return path.relative(root, target);
}
(async () => {
  const data = albums(), files = sources(data);
  const stemCounts = new Map();
  for (const file of files) {
    const key = path.join(path.dirname(file), path.parse(file).name);
    stemCounts.set(key, (stemCounts.get(key) || 0) + 1);
  }
  const state = await exists(stateFile) ? JSON.parse(await fs.readFile(stateFile, 'utf8')) : { version: 1, files: {} };
  const replacements = new Map(), obsolete = new Set(), records = [];
  let oldData = [];
  if (await exists(local('qunqing-v3-data.js'))) {
    const text = await fs.readFile(local('qunqing-v3-data.js'), 'utf8');
    oldData = JSON.parse(text.slice(text.indexOf('=') + 1).trim().replace(/;$/, ''));
  }
  const oldThumbs = new Map(oldData.flatMap(a => a.photos.map(p => [p.src, p.thumb])));
  for (const source of files) {
    const input = await fs.readFile(local(source)), beforeHash = hash(input), meta = await sharp(input).metadata();
    if ((meta.pages || 1) > 1) throw new Error(`动画图片不能作为静态照片处理：${source}`);
    let output = input, target = source;
    const large = Math.max(meta.width, meta.height) > profile.edge;
    if (!thumbnailsOnly && (large || meta.format !== 'webp')) {
      const encoded = await sharp(input).rotate().resize({ width: profile.edge, height: profile.edge, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: profile.quality, effort: profile.effort }).toBuffer();
      if (encoded.length < input.length) {
        output = encoded;
        if (path.extname(source).toLowerCase() !== '.webp') target = source + '.webp';
        if (target !== source && await exists(local(target))) throw new Error(`目标文件已存在，未覆盖：${target}`);
      }
    }
    const sourceHash = hash(output), thumb = thumbnail(target), previous = state.files[target];
    let thumbBuffer;
    const canReuse = previous && previous.sourceHash === sourceHash && previous.thumbnail === thumb
      && JSON.stringify(previous.profile) === JSON.stringify(profile) && await exists(local(thumb));
    if (canReuse) {
      const existing = await fs.readFile(local(thumb));
      if (hash(existing) === previous.thumbnailHash) thumbBuffer = existing;
    }
    if (!thumbBuffer) {
      // Generate from the input before resizing the large photo: one resampling step.
      thumbBuffer = await sharp(input).rotate().resize({ width: profile.thumbnailEdge, height: profile.thumbnailEdge, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: profile.thumbnailQuality, effort: profile.effort }).toBuffer();
    }
    let backup = null;
    if (apply) {
      if (sourceHash !== beforeHash) backup = await preserve(source, input);
      if (!canReuse || !await exists(local(thumb))) await atomic(local(thumb), thumbBuffer);
      // The reference and hash are verified again below even when reusing a thumbnail.
      if (hash(await fs.readFile(local(thumb))) !== hash(thumbBuffer)) await atomic(local(thumb), thumbBuffer);
      if (sourceHash !== beforeHash) await atomic(local(target), output);
      state.files[target] = { sourceHash, thumbnail: thumb, thumbnailHash: hash(thumbBuffer), profile };
      if (target !== source) { delete state.files[source]; replacements.set(source, target); obsolete.add(source); }
    }
    const rel = path.relative('images', source);
    const uniqueStem = stemCounts.get(path.join(path.dirname(source), path.parse(source).name)) === 1;
    const oldCandidates = [oldThumbs.get(source), path.join('images/atlas-thumbs', path.dirname(rel), path.basename(rel) + '.jpg'),
      uniqueStem ? path.join('images/atlas-thumbs', path.dirname(rel), path.parse(rel).name + '.jpg') : null];
    for (const old of oldCandidates.filter(Boolean)) if (old !== thumb && old.startsWith('images/atlas-thumbs/')) {
      // Do not collect another photo's new thumbnail through a legacy stem collision.
      if (await exists(local(old)) && /\.jpe?g$/i.test(old)) { replacements.set(old, thumb); obsolete.add(old); }
    }
    records.push({ source, target, beforeBytes: input.length, afterBytes: output.length, beforeHash, sourceHash,
      thumbnail: thumb, thumbnailBytes: thumbBuffer.length, changed: sourceHash !== beforeHash, backup });
    if (records.length % 50 === 0) console.log(`已处理 ${records.length}/${files.length}`);
  }
  if (apply) {
    // Update explicit photo/cover filenames; automatically discovered albums need no edits.
    for (const config of (await walk(local('images'))).filter(p => /^trip.*\.json$/.test(path.basename(p)))) {
      const meta = JSON.parse(await fs.readFile(config, 'utf8'));
      const folder = path.relative(root, path.dirname(config));
      const mapped = name => replacements.has(path.join(folder, name)) ? path.basename(replacements.get(path.join(folder, name))) : name;
      const before = JSON.stringify(meta);
      if (Array.isArray(meta.photos)) meta.photos = meta.photos.map(p => typeof p === 'string' ? mapped(p) : { ...p, file: mapped(p.file) });
      if (meta.cover) meta.cover = mapped(meta.cover);
      if (JSON.stringify(meta) !== before) await atomic(config, JSON.stringify(meta, null, 2) + '\n');
    }
    for (const name of ['index.html', 'qunqing-v3.html']) if (await exists(local(name))) {
      let text = await fs.readFile(local(name), 'utf8');
      for (const [old, next] of replacements) text = text.replaceAll('"' + old + '"', '"' + next + '"');
      await atomic(local(name), text);
    }
    await atomic(stateFile, JSON.stringify(state, null, 2) + '\n');
    // Remove only superseded images that have a verified replacement and preserved source.
    for (const old of obsolete) {
      const next = replacements.get(old);
      if (!next || !await exists(local(next))) throw new Error('替代图片缺失，未删除：' + old);
      await fs.unlink(local(old));
    }
    if (!process.argv.includes('--no-build')) console.log(python(['build', '--skip-thumbnails']).trim());
  }
  const sum = key => records.reduce((total, r) => total + r[key], 0);
  const summary = { applied: apply, profile, photos: records.length, changedPhotos: records.filter(r => r.changed).length,
    beforePhotoBytes: sum('beforeBytes'), afterPhotoBytes: sum('afterBytes'), thumbnailBytes: sum('thumbnailBytes'),
    supersededFiles: [...obsolete].length };
  await atomic(reportFile, JSON.stringify({ generatedAt: new Date().toISOString(), summary, files: records }, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
