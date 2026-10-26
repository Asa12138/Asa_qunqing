const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
let sharp;
for (const candidate of ['sharp', process.env.QUNQING_SHARP_PATH,
  path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')].filter(Boolean)) {
  try { sharp = require(candidate); break; } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
}
if (!sharp) throw new Error('缺少 sharp。请在项目根目录运行 npm install，再重试。');
sharp.concurrency(1);
sharp.cache({ memory: 64, files: 0, items: 50 });
const root = path.resolve(process.env.QUNQING_ROOT || path.join(__dirname, '..'));
const suffixes = new Set(['.webp', '.jpg', '.jpeg', '.png', '.avif', '.gif', '.tif', '.tiff']);
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const inside = (base, target) => target === base || target.startsWith(base + path.sep);
function local(relative) {
  const target = path.resolve(root, relative);
  if (!inside(root, target)) throw new Error(`路径越界：${relative}`);
  return target;
}
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function atomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, data);
  await fs.rename(temp, file);
}
async function walk(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`不处理符号链接：${file}`);
    if (entry.isDirectory()) files.push(...await walk(file));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}
function python(args) {
  const result = spawnSync(process.env.PYTHON || 'python3', [path.join(root, 'manage.py'), ...args], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Python 相册管理失败');
  return result.stdout;
}
function albums() { return JSON.parse(python(['manifest'])); }
function sources(data) { return [...new Set(data.flatMap(a => [a.cover, ...a.photos.map(p => p.src)]))].sort(); }
function thumbnail(relative) {
  const rel = path.relative(path.join(root, 'images'), local(relative));
  return path.join('images', 'atlas-thumbs', path.dirname(rel), path.basename(rel) + '.webp').split(path.sep).join('/');
}
function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} 需要一个值`);
  return value;
}
module.exports = { fs, path, sharp, root, suffixes, hash, inside, local, exists, atomic, walk, python, albums, sources, thumbnail, arg };
