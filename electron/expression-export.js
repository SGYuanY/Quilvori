/* Preflight expression exports before creating directories or writing images. */
const fs = require('node:fs');
const path = require('node:path');

const fail = (code, message) => Object.assign(new Error(message), { code });
const canonical = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
function inside(base, target) {
  const relative = path.relative(base, target);
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function segment(value) {
  if (typeof value !== 'string' || !value || value.length > 255
    || process.platform !== 'win32' && Buffer.byteLength(value, 'utf8') > 255
    || value === '.' || value === '..' || /[<>:"/\\|?*\u0000-\u001f\u007f]/.test(value) || /[.\s]$/.test(value)
    || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(value)) {
    throw fail('invalid-expression-name', 'Expression names must be single, valid filenames.');
  }
  return value;
}
function futurePath(target, io) {
  let current = path.resolve(target);
  const missing = [];
  while (true) {
    try { io.lstatSync(current); }
    catch (error) {
      if (error.code !== 'ENOENT') throw fail('invalid-expression-path', 'The expression destination cannot be used.');
      const parent = path.dirname(current);
      if (parent === current) throw fail('invalid-expression-path', 'The expression destination does not exist.');
      missing.unshift(path.basename(current)); current = parent; continue;
    }
    let real, stat;
    try { real = io.realpathSync(current); stat = io.statSync(current); }
    catch (_) { throw fail('invalid-expression-path', 'The expression destination contains an invalid link.'); }
    if (missing.length && !stat.isDirectory()) throw fail('invalid-expression-path', 'The expression destination is not a directory.');
    return { path: path.resolve(real, ...missing), stat: missing.length ? null : stat };
  }
}
function imageBytes(value) {
  const match = typeof value === 'string' && value.match(/^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/]+={0,2})$/i);
  if (!match || match[1].length % 4) throw fail('invalid-expression-image', 'An expression image is missing or invalid.');
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length) throw fail('invalid-expression-image', 'An expression image is empty.');
  return bytes;
}
function planExpressionExport(payload, io = fs) {
  if (!payload || typeof payload.folder !== 'string' || !path.isAbsolute(payload.folder) || !Array.isArray(payload.files)) {
    throw fail('invalid-expression-export', 'Select a valid character folder and expression files.');
  }
  const character = segment(payload.character), names = new Set();
  // Validate the complete batch before even planning filesystem operations.
  const images = payload.files.map(file => {
    const name = segment(file?.name), key = name.toLowerCase();
    if (names.has(key)) throw fail('duplicate-expression-name', 'Expression filenames must be unique.');
    names.add(key); return { name, data: imageBytes(file.dataUrl) };
  });
  let base;
  try {
    if (!io.statSync(payload.folder).isDirectory()) throw new Error('not a directory');
    base = io.realpathSync(payload.folder);
  } catch (_) { throw fail('invalid-expression-folder', 'The selected character folder does not exist.'); }
  const directory = futurePath(path.join(base, character, 'expressions'), io);
  if (!inside(base, directory.path) || canonical(base) === canonical(directory.path) || directory.stat && !directory.stat.isDirectory()) {
    throw fail('invalid-expression-path', 'The expression destination must stay inside the selected character folder.');
  }
  const targets = new Set();
  const files = images.map(image => {
    const target = futurePath(path.join(directory.path, image.name), io), key = canonical(target.path);
    if (!inside(directory.path, target.path) || target.stat && !target.stat.isFile()) {
      throw fail('invalid-expression-path', 'An expression file points outside its destination or is not a regular file.');
    }
    if (targets.has(key)) throw fail('duplicate-expression-target', 'Two expression names resolve to the same file.');
    targets.add(key); return { path: target.path, data: image.data };
  });
  return { base, directory: directory.path, files };
}
function exportExpressions(payload, io = fs) {
  const plan = planExpressionExport(payload, io);
  io.mkdirSync(plan.directory, { recursive: true });
  const directory = io.realpathSync(plan.directory);
  if (!inside(plan.base, directory) || canonical(directory) !== canonical(plan.directory)) {
    throw fail('invalid-expression-path', 'The expression destination changed before export.');
  }
  // Recheck the entire batch after directory creation and before the first image.
  for (const file of plan.files) {
    const target = futurePath(file.path, io);
    if (!inside(directory, target.path) || canonical(target.path) !== canonical(file.path) || target.stat && !target.stat.isFile()) {
      throw fail('invalid-expression-path', 'An expression destination changed before export.');
    }
  }
  for (const file of plan.files) io.writeFileSync(file.path, file.data);
  return directory;
}

module.exports = { planExpressionExport, exportExpressions };
