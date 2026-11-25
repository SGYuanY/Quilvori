/* Install an already-previewed ST package under a user-selected profile. */
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {validateFiles,checkContent} = require('../js/st-bundle');
const fail = (code,file='') => Object.assign(new Error(code),{code,file});
const samePath = (a,b) => path.relative(a,b) === '';
const identity = stat => [stat.dev,stat.ino];
const sameObject = (stat,identity) => stat.dev === identity[0] && stat.ino === identity[1];

async function maybeStat(io,file) {
  try { return await io.lstat(file,{bigint:true}); }
  catch (err) { if (err.code === 'ENOENT') return null; throw err; }
}

async function installBundle(directory,files,io=fs) {
  validateFiles(files);
  files.forEach(checkContent);
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw fail('invalid-profile');
  const base = path.resolve(directory), directories = new Map();
  async function checkDirectory(relative) {
    const absolute = path.join(base,relative);
    const info = await maybeStat(io,absolute);
    if (!info) {
      if (directories.has(relative)) throw fail('unsafe-directory',relative);
      return false;
    }
    if (!info.isDirectory() || info.isSymbolicLink() || !samePath(await io.realpath(absolute),absolute)) throw fail('unsafe-directory',relative);
    const expected = directories.get(relative);
    if (expected && !sameObject(info,expected)) throw fail('unsafe-directory',relative);
    directories.set(relative,identity(info));
    return true;
  }
  if (!await checkDirectory('') || !await checkDirectory('characters') || !await checkDirectory('worlds')) throw fail('invalid-profile');
  const dirsFor = file => {
    const [top,child,name] = file.path.split('/');
    return name ? [top,path.join(top,child)] : [top];
  };
  // Preflight every filename before staging data. Publication also uses an exclusive primitive.
  const required = new Set();
  for (const file of files) {
    for (const dir of dirsFor(file)) {
      required.add(dir);
      await checkDirectory(dir);
    }
    if (await maybeStat(io,path.join(base,file.path))) throw fail('conflict',file.path);
  }

  const madeDirs = [], staged = [], published = [];
  let temporary, tempId;
  const sameDirectory = async (absolute,id) => {
    const current = await maybeStat(io,absolute);
    return current && current.isDirectory() && sameObject(current,id) && samePath(await io.realpath(absolute),absolute);
  };
  async function validParents(file) {
    if (!await checkDirectory('')) throw fail('unsafe-directory');
    for (const dir of dirsFor(file)) if (!await checkDirectory(dir)) throw fail('unsafe-directory',dir);
  }
  async function cleanStage() {
    if (!temporary) return;
    if (!await sameDirectory(temporary,tempId)) throw fail('cleanup-failed',temporary);
    for (const item of staged) {
      const current = await maybeStat(io,item.absolute);
      if (!current) continue;
      if (!sameObject(current,item.id)) throw fail('cleanup-failed',item.absolute);
      await io.unlink(item.absolute);
    }
    await io.rmdir(temporary);
  }
  try {
    temporary = await io.mkdtemp(path.join(base,'.quilvori-'));
    tempId = identity(await io.lstat(temporary,{bigint:true}));
    for (const [index,file] of files.entries()) {
      const absolute = path.join(temporary,String(index));
      const handle = await io.open(absolute,'wx',0o600);
      try {
        staged.push({file,absolute,id:identity(await handle.stat({bigint:true}))});
        await handle.writeFile(file.bytes);
        await handle.sync();
      } finally { await handle.close(); }
    }
    for (const dir of required) {
      const parent = path.dirname(dir);
      if (!await checkDirectory('') || parent !== '.' && !await checkDirectory(parent)) throw fail('unsafe-directory',dir);
      if (!await checkDirectory(dir)) {
        let created = true;
        try { await io.mkdir(path.join(base,dir)); }
        catch (err) { if (err.code !== 'EEXIST') throw err; created = false; }
        if (!await checkDirectory(dir)) throw fail('unsafe-directory',dir);
        if (created) madeDirs.push({dir,id:directories.get(dir)});
      }
    }
    // Last link publishes the card, after all of its companion files are present.
    const card = item => /^characters\/[^/]+\.png$/.test(item.file.path);
    const order = staged.slice().sort((a,b)=>Number(card(a))-Number(card(b)));
    for (const item of order) {
      await validParents(item.file);
      if (!await sameDirectory(temporary,tempId)) throw fail('unsafe-directory',temporary);
      const target = path.join(base,item.file.path);
      try { await io.link(item.absolute,target); }
      catch (err) {
        if (err.code === 'EEXIST') throw fail('conflict',item.file.path);
        if (['ENOTSUP','EOPNOTSUPP','ENOSYS','EXDEV'].includes(err.code)) throw fail('unsupported-filesystem');
        throw err;
      }
      published.push(item);
    }
  } catch (err) {
    const unfinished = [];
    for (const item of published.reverse()) {
      try {
        await validParents(item.file);
        const target = path.join(base,item.file.path), stat = await maybeStat(io,target);
        if (stat && sameObject(stat,item.id)) await io.unlink(target);
      } catch (_) { unfinished.push(item.file.path); }
    }
    for (const {dir,id} of madeDirs.reverse()) {
      const absolute = path.join(base,dir);
      try { if (await sameDirectory(absolute,id)) await io.rmdir(absolute); }
      catch (err) { if (!['ENOENT','ENOTEMPTY','EEXIST'].includes(err.code)) unfinished.push(dir); }
    }
    try { await cleanStage(); } catch (_) { unfinished.push(temporary); }
    if (unfinished.length) throw fail('cleanup-failed',unfinished.join(', '));
    throw err;
  }
  try { await cleanStage(); }
  catch (_) { return {directory:base,count:files.length,cleanup:temporary}; }
  return {directory:base,count:files.length};
}
module.exports = {installBundle};
