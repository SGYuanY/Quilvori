'use strict';
const { constants, promises: fs } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const emptyPaths = () => ({ cards: '', worlds: '' });
const absolute = value => typeof value === 'string' && !value.includes('\0') && path.isAbsolute(value);
// Use the picker's spelling so differently cased collections on the same volume stay separate.
const sameFolder = (left, right) => absolute(left) && absolute(right) && path.resolve(left) === path.resolve(right);
const ordinaryName = name => !(process.platform === 'win32' && name.includes(':'));
const accepts = (name, cards) => ordinaryName(name) && (cards ? /\.(json|png)$/i : /\.json$/i).test(name);
const sameVersion = (left, right) => left.isFile() && left.dev === right.dev && left.ino === right.ino &&
  left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
const changed = () => new Error('文件或所选目录已更改，请重新扫描。');

function createFolderScan(settingsFile, io = fs) {
  let updates = Promise.resolve();

  async function load() {
    try {
      const saved = JSON.parse(await io.readFile(settingsFile, 'utf8'));
      return { ...emptyPaths(), ...saved };
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return emptyPaths();
      throw error;
    }
  }

  const getPaths = () => updates.then(load).catch(emptyPaths);

  function select(kind, folder) {
    if (!['cards', 'worlds'].includes(kind) || !absolute(folder)) throw new Error('请选择有效的文件夹。');
    const result = updates.then(async () => {
      const next = { ...await load(), [kind]: folder };
      const parent = path.dirname(settingsFile), temporary = path.join(parent, '.folders-' + randomUUID() + '.tmp');
      await io.mkdir(parent, { recursive: true });
      const handle = await io.open(temporary, 'wx', 0o600);
      try {
        try {
          await handle.writeFile(JSON.stringify(next, null, 2));
          await handle.sync();
        }
        finally { await handle.close(); }
        await io.rename(temporary, settingsFile);
      } catch (error) {
        await io.unlink(temporary).catch(() => {});
        throw error;
      }
      return next;
    });
    updates = result.catch(() => {});
    return result;
  }

  function selection(paths, requested) {
    const cards = sameFolder(paths.cards, requested);
    if (!cards && !sameFolder(paths.worlds, requested)) throw new Error('请先选择这个角色卡或世界书文件夹。');
    return { folder: cards ? paths.cards : paths.worlds, cards };
  }

  async function inFolder(requested, work) {
    const started = updates;
    const scope = selection(await started.then(load), requested);
    let directory;
    try { directory = await io.realpath(scope.folder); }
    catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw new Error('文件夹不存在，请重新选择。');
      throw error;
    }
    const result = await work(directory, scope);
    if (await io.realpath(scope.folder) !== directory) throw changed();
    // A picker may finish while a scan is in flight. Check that its result still belongs to the selected collection.
    if (updates !== started && selection(await getPaths(), requested).cards !== scope.cards) throw changed();
    return result;
  }

  async function list(folder) {
    if (!folder) return [];
    return inFolder(folder, async (directory, scope) => {
      const entries = await io.readdir(directory, { withFileTypes: true });
      return entries.filter(entry => entry.isFile() && accepts(entry.name, scope.cards))
        .map(entry => ({ name: entry.name, full: path.join(scope.folder, entry.name) }));
    });
  }

  async function read(file) {
    if (!absolute(file)) throw new Error('请选择要读取的角色卡或世界书文件。');
    return inFolder(path.dirname(file), async (directory, scope) => {
      const name = path.basename(file);
      if (!accepts(name, scope.cards)) throw new Error('此文件夹不支持该文件类型。');
      const target = path.join(directory, name);
      const named = await io.lstat(target, { bigint: true });
      if (!named.isFile() || path.dirname(await io.realpath(target)) !== directory) throw changed();
      const handle = await io.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
      try {
        if (!sameVersion(await handle.stat({ bigint: true }), named)) throw changed();
        const bytes = await handle.readFile();
        if (!sameVersion(await io.lstat(target, { bigint: true }), named)) throw changed();
        return bytes;
      } finally { await handle.close(); }
    });
  }

  return { getPaths, select, list, read };
}

module.exports = { createFolderScan, sameFolder };
