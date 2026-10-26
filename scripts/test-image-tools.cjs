// Focused regression: format conversion, same-stem filenames, backups, and repeatability.
const { fs, path, sharp, hash } = require('./image-common.cjs');
const { spawnSync } = require('node:child_process');
const os = require('node:os'), assert = require('node:assert/strict');
(async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'qunqing-images-'));
  const fixture = path.join(sandbox, 'site');
  try {
    await fs.mkdir(path.join(fixture, 'images/trip'), { recursive: true });
    await fs.copyFile(path.join(__dirname, '../manage.py'), path.join(fixture, 'manage.py'));
    await fs.writeFile(path.join(fixture, 'qunqing-v3.html'), '<!doctype html><title>Fixture</title>');
    await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#123456' } }).jpeg({ quality: 95 }).toFile(path.join(fixture, 'images/trip/1.jpg'));
    await sharp({ create: { width: 100, height: 100, channels: 3, background: '#654321' } }).webp().toFile(path.join(fixture, 'images/trip/1.webp'));
    await fs.writeFile(path.join(fixture, 'images/trip/trip.json'), JSON.stringify({ title: 'Fixture', date: '2026-10-26', cover: '1.jpg', photos: ['1.jpg', '1.webp'] }));
    const original = await fs.readFile(path.join(fixture, 'images/trip/1.jpg'));
    const run = flags => {
      const result = spawnSync(process.execPath, [path.join(__dirname, 'compress-images.cjs'), ...flags, '--backup-dir', path.join(sandbox, 'originals')], { encoding: 'utf8', env: { ...process.env, QUNQING_ROOT: fixture } });
      assert.equal(result.status, 0, result.stderr);
    };
    run([]);
    assert.equal(hash(await fs.readFile(path.join(fixture, 'images/trip/1.jpg'))), hash(original), 'dry run changed original');
    run(['--apply']);
    const config = JSON.parse(await fs.readFile(path.join(fixture, 'images/trip/trip.json'), 'utf8'));
    assert.deepEqual(config.photos, ['1.jpg.webp', '1.webp']);
    assert.equal(config.cover, '1.jpg.webp');
    const data = JSON.parse((await fs.readFile(path.join(fixture, 'qunqing-v3-data.js'), 'utf8')).split('=')[1].trim().replace(/;$/, ''));
    assert.equal(new Set(data[0].photos.map(p => p.thumb)).size, 2);
    const report = JSON.parse(await fs.readFile(path.join(fixture, 'reports/compression-latest.json'), 'utf8'));
    const saved = report.files.find(r => r.changed).backup;
    assert.equal(hash(await fs.readFile(path.resolve(fixture, saved))), hash(original));
    const before = await fs.readFile(path.join(fixture, 'image-manifest.json'), 'utf8');
    run(['--apply']);
    assert.equal(await fs.readFile(path.join(fixture, 'image-manifest.json'), 'utf8'), before, 'second run changed image hashes');
    console.log('PASS: dry run, format conversion, collision-free thumbnails, cover references, verified backup, idempotence');
  } finally { await fs.rm(sandbox, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
