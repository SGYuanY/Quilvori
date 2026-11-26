/* Install native SillyTavern themes without giving the renderer access to settings.json. */
'use strict';
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { MAX_BYTES, normalizeSettings, edited, isNativeSetting } = require('../js/theme-format');
const { clean:cleanSource, sourceUrl } = require('../js/resource-source');

const fail = code => { throw Object.assign(new Error(code), { code }); };
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const samePath = (first, second) => path.relative(first, second) === '';
const sameFile = (first, second) => first.dev === second.dev && first.ino === second.ino;
const digest = data => createHash('sha256').update(data).digest('hex');
const knownErrors = new Set([
  'invalid-profile','unsafe-path','choose-user','unknown-user','invalid-settings','invalid-theme',
  'profile-changed','unsupported-filesystem','recovery-needed','theme-not-found','target-busy',
]);
const publicError = (error,fallback='write-failed') => ({ok:false,code:knownErrors.has(error.code) ? error.code : fallback});

async function inspectPath(io, absolute, type, expected) {
  let stat;
  try { stat = await io.lstat(absolute, { bigint:true }); }
  catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      if (expected) fail('profile-changed');
      return null;
    }
    throw error;
  }
  if (stat.isSymbolicLink() || !samePath(absolute, await io.realpath(absolute))) fail('unsafe-path');
  if (type === 'dir' ? !stat.isDirectory() : !stat.isFile()) {
    if (expected) fail('profile-changed');
    return null;
  }
  if (expected && !sameFile(stat,expected)) fail('profile-changed');
  return stat;
}

async function readRegular(io, absolute, expected, maxBytes=Infinity) {
  const before = await inspectPath(io,absolute,'file',expected);
  if (!before) fail('profile-changed');
  const handle = await io.open(absolute,constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat({bigint:true});
    if (!sameFile(opened,before)) fail('profile-changed');
    if (Number(opened.size) > maxBytes) return null;
    let raw;
    if (Number.isFinite(maxBytes)) {
      raw=Buffer.alloc(Number(opened.size));
      let offset=0;
      while (offset<raw.length) {
        const result=await handle.read(raw,offset,raw.length-offset,offset);
        if (!result.bytesRead) fail('profile-changed');
        offset+=result.bytesRead;
      }
    } else raw=await handle.readFile();
    const after = await handle.stat({bigint:true});
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs) fail('profile-changed');
    await inspectPath(io,absolute,'file',before);
    return raw;
  } finally { await handle.close(); }
}

async function profileAt(io, directory, strict) {
  const stat = await inspectPath(io,directory,'dir');
  if (!stat) return null;
  try {
    const themes = path.join(directory,'themes'), settings = path.join(directory,'settings.json');
    const settingsStat = await inspectPath(io,settings,'file');
    if (!settingsStat) {
      if (await inspectPath(io,themes,'dir')) {
        for (const entry of await io.readdir(directory,{withFileTypes:true})) {
          if (!entry.isDirectory() || !/^\.quilvori-theme-[A-Za-z0-9]+$/.test(entry.name)) continue;
          const backup=path.join(entry.name,'previous-settings.json');
          if (await inspectPath(io,path.join(directory,backup),'file')) {
            throw Object.assign(new Error('recovery-needed'),{code:'recovery-needed',user:path.basename(directory),backup});
          }
        }
      }
      return null;
    }
    const themesStat = await inspectPath(io,themes,'dir');
    if (!themesStat) return null;
    return {directory,stat,themes,themesStat,settings,settingsStat,user:path.basename(directory)};
  } catch (error) {
    if (!strict && error.code === 'unsafe-path') return null;
    throw error;
  }
}

async function resolveTarget(input, io) {
  let location = typeof input === 'string' ? input : input?.path;
  const user = typeof input === 'object' && input ? input.user : undefined;
  if (typeof location !== 'string') fail('invalid-profile');
  location = location.trim().replace(/^"([^"]+)"$/,'$1');
  if (!path.isAbsolute(location) || location.includes('\0')) fail('invalid-profile');
  const base = path.resolve(location);
  if (!await inspectPath(io,base,'dir')) fail('invalid-profile');
  const direct = await profileAt(io,base,true);
  let profiles;
  if (direct) profiles = [direct];
  else {
    const nested = path.join(base,'data');
    const directory = await inspectPath(io,nested,'dir') ? nested : base;
    const entries = await io.readdir(directory,{withFileTypes:true});
    profiles = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const profile = await profileAt(io,path.join(directory,entry.name),false);
      if (profile) profiles.push(profile);
    }
    profiles.sort((a,b)=>a.user.localeCompare(b.user));
  }
  if (!profiles.length) fail('invalid-profile');
  const users = profiles.map(profile=>profile.user);
  if (!user && profiles.length !== 1) return {ok:false,code:'choose-user',users};
  const profile = user ? profiles.find(profile=>profile.user===user) : profiles[0];
  if (!profile) return {ok:false,code:'unknown-user',users};
  return {ok:true,profile,users};
}

async function settingsAt(io, profile) {
  const bytes = await readRegular(io,profile.settings,profile.settingsStat);
  let data;
  try { data = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')); }
  catch (_) { fail('invalid-settings'); }
  if (!object(data) || (Object.hasOwn(data,'power_user') && !object(data.power_user))) fail('invalid-settings');
  return {bytes,data};
}

async function themeDirectory(io, profile) {
  await inspectPath(io,profile.themes,'dir',profile.themesStat);
  const entries = await io.readdir(profile.themes,{withFileTypes:true});
  const files = new Set(), themes = new Map();
  for (const entry of entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
    if (!/\.json$/i.test(entry.name)) continue;
    files.add(entry.name.slice(0,-5).toLowerCase());
    // ST reads lowercase .json files. Other casings still reserve their on-disk names.
    if (!entry.name.endsWith('.json') || !entry.isFile() || entry.isSymbolicLink()) continue;
    const file = path.join(profile.themes,entry.name);
    const stat = await inspectPath(io,file,'file');
    if (!stat || stat.nlink>1n) continue;
    const raw = await readRegular(io,file,stat,MAX_BYTES);
    if (!raw) continue;
    let theme;
    try { theme = JSON.parse(raw.toString('utf8')); } catch (_) { continue; }
    if (isNativeTheme(theme) && !themes.has(theme.name)) themes.set(theme.name,entry.name);
  }
  return {files,themes};
}

async function inspectTarget(input, io=fs) {
  try {
    const result = await resolveTarget(input,io);
    if (!result.ok) return result;
    const {profile,users} = result;
    const settings = await settingsAt(io,profile);
    const {themes} = await themeDirectory(io,profile);
    const currentTheme = settings.data.power_user?.theme;
    return {ok:true,user:profile.user,users,currentTheme:typeof currentTheme === 'string' ? currentTheme : '',
      themes:[...themes.keys()],revision:digest(settings.bytes)};
  } catch (error) {
    return error.code==='recovery-needed' && error.backup
      ? {ok:false,code:error.code,user:error.user,backup:error.backup} : publicError(error,'read-failed');
  }
}

async function readNamedTheme(io,profile,catalog,name) {
  if (typeof name !== 'string' || !catalog.themes.has(name)) fail('theme-not-found');
  const file = path.join(profile.themes,catalog.themes.get(name));
  await inspectPath(io,profile.themes,'dir',profile.themesStat);
  const stat = await inspectPath(io,file,'file');
  if (!stat || stat.nlink>1n) fail('unsafe-path');
  const bytes = await readRegular(io,file,stat,MAX_BYTES);
  if (!bytes) fail('invalid-theme');
  let theme;
  try { theme = JSON.parse(bytes.toString('utf8')); } catch (_) { fail('invalid-theme'); }
  if (!isNativeTheme(theme) || theme.name !== name) fail('profile-changed');
  return theme;
}

async function readTheme(input,name,io=fs) {
  try {
    const result = await resolveTarget(input,io);
    if (!result.ok) return result;
    const catalog = await themeDirectory(io,result.profile);
    const theme = await readNamedTheme(io,result.profile,catalog,name);
    return {ok:true,user:result.profile.user,theme,themeRevision:digest(JSON.stringify(theme))};
  } catch (error) { return publicError(error,'read-failed'); }
}

function isNativeTheme(theme) {
  return object(theme) && !Object.hasOwn(theme,'power_user') && typeof theme.name === 'string' && theme.name.trim() &&
    (Object.keys(normalizeSettings(theme)).length > 0 || typeof theme.custom_css === 'string');
}

function copyStem(name) {
  let stem = name.trim().normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').replace(/[ .]+$/,'');
  let short = '', bytes = 0;
  for (const character of stem) {
    bytes += Buffer.byteLength(character);
    if (bytes>168) break;
    short += character;
  }
  stem = short.replace(/^[ .]+|[ .]+$/g,'');
  if (!stem) fail('invalid-theme');
  if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(stem)) stem='Theme '+stem;
  return stem.replace(/ \(Quilvori\)(?: \d+)?$/i,'')+' (Quilvori)';
}

async function chooseCopy(io,profile,catalog,originalName,values,previousTheme) {
  const stem = copyStem(originalName);
  const occupied = new Set([...catalog.files,...[...catalog.themes.keys()].map(name=>name.toLowerCase()),previousTheme.toLowerCase()]);
  for (const [name,file] of catalog.themes) {
    if (file !== name+'.json' || (name!==stem && !(name.startsWith(stem+' ') && /^[1-9]\d*$/.test(name.slice(stem.length+1))))) continue;
    const current = await readNamedTheme(io,profile,catalog,name);
    if (isDeepStrictEqual(current,{name,...values})) {
      return {name,reused:true};
    }
  }
  let name=stem, number=1;
  while (occupied.has(name.toLowerCase())) name=stem+' '+(++number);
  return {name,reused:false};
}

function nativeSettings(payload) {
  const theme = payload?.theme;
  if (!object(theme) || typeof theme.name !== 'string' || !theme.name.trim()
      || Buffer.byteLength(JSON.stringify(theme)) > MAX_BYTES) fail('invalid-theme');
  const values = normalizeSettings(theme);
  const css = payload.allowCss === true && typeof theme.custom_css === 'string' ? theme.custom_css : '';
  if (!isNativeTheme(theme)) fail('invalid-theme');
  return {...values,custom_css:css};
}

function nativeFileValues(theme,values) {
  // Opaque author metadata and extension options stay in the preset file. Only
  // normalized standard properties are ever assigned to the user's settings.
  let result;
  try { result=edited(theme); } catch (_) { fail('invalid-theme'); }
  const source=result.quilvori_source;
  delete result.name; delete result.custom_css; delete result.quilvori_source;
  for (const key of Object.keys(result)) if (isNativeSetting(key)) delete result[key];
  if (object(source)) {
    const name=typeof source.author?.name==='string' ? source.author.name.trim().slice(0,160).replace(/[\u0000-\u001f\u007f]/g,'') : '';
    let postUrl=sourceUrl(source.postUrl);
    if (postUrl && /^(?:cdn\.discordapp\.com|media\.discordapp\.net)$/i.test(new URL(postUrl).hostname)) postUrl=null;
    const full=name && postUrl ? cleanSource({...source,author:{...source.author,name},postUrl}) : null;
    if (full) result.quilvori_source=full;
    else if (name || postUrl) result.quilvori_source={...(name?{author:{name}}:{}),...(postUrl?{postUrl}:{})};
  }
  return {...result,...values};
}

async function writePrivate(io,file,data,mode=0o600) {
  const handle = await io.open(file,'wx',mode);
  try { await handle.writeFile(data); await handle.sync(); return await handle.stat({bigint:true}); }
  finally { await handle.close(); }
}

async function exclusiveLink(io,source,target) {
  try { await io.link(source,target); }
  catch (error) {
    if (error.code === 'EEXIST') fail('profile-changed');
    if (['EXDEV','ENOTSUP','EOPNOTSUPP','ENOSYS'].includes(error.code)) fail('unsupported-filesystem');
    throw error;
  }
}

const busy = new Set();
async function applyNative(target,payload,existingName,io) {
  let profile, stage, stageStat, original, published, lockKey, claimed=false, committed=false, recovery=false;
  const assertProfile = async () => {
    await inspectPath(io,profile.directory,'dir',profile.stat);
    if (stage) await inspectPath(io,stage,'dir',stageStat);
  };
  const assertParents = async () => {
    await assertProfile();
    await inspectPath(io,profile.themes,'dir',profile.themesStat);
  };
  try {
    const input = typeof target === 'string' ? {path:target} : {...target};
    if (payload.user) input.user = payload.user;
    const resolved = await resolveTarget(input,io);
    if (!resolved.ok) return resolved;
    profile = resolved.profile;
    const key = process.platform==='win32' ? profile.directory.toLowerCase() : profile.directory;
    if (busy.has(key)) fail('target-busy');
    busy.add(key); lockKey=key;
    original = await settingsAt(io,profile);
    const revision = payload.revision || input.revision;
    if (revision && revision !== digest(original.bytes)) fail('profile-changed');
    const catalog = await themeDirectory(io,profile);
    const existing = typeof existingName === 'string';
    const theme = existing ? await readNamedTheme(io,profile,catalog,existingName) : payload.theme;
    if (existing && payload.themeRevision && payload.themeRevision !== digest(JSON.stringify(theme))) fail('profile-changed');
    const values = nativeSettings({theme,allowCss:payload.allowCss});
    const old = original.data.power_user || {};
    const previousTheme = typeof old.theme === 'string' ? old.theme : '';
    const fileValues = existing ? null : nativeFileValues(theme,values);
    const choice = existing ? {name:existingName,reused:true} : await chooseCopy(io,profile,catalog,theme.name,fileValues,previousTheme);
    const themeName = choice.name, change = {...values,theme:themeName};
    const result = {ok:true,user:profile.user,themeName,previousTheme,reused:choice.reused,backup:'',revision:digest(original.bytes)};
    if (choice.reused && Object.keys(change).every(key=>old[key]===change[key])) return result;
    const next = {...original.data,power_user:{...old,...change}};
    const nextBytes = Buffer.from(JSON.stringify(next,null,4));
    const previous = {}, absent = [];
    for (const key of Object.keys(change)) {
      if (Object.hasOwn(old,key)) previous[key]=old[key]; else absent.push(key);
    }
    const appearance = {format:'quilvori.st-theme-backup.v1',previous,absent,appliedTheme:themeName};
    await assertParents();
    stage = await io.mkdtemp(path.join(profile.directory,'.quilvori-theme-'));
    stageStat = await inspectPath(io,stage,'dir');
    const themeFile = path.join(stage,'theme.tmp'), settingsFile = path.join(stage,'settings.tmp');
    const priorFile = path.join(stage,'previous-settings.json');
    await writePrivate(io,path.join(stage,'previous-appearance.json'),JSON.stringify(appearance,null,2));
    await writePrivate(io,settingsFile,nextBytes,Number(profile.settingsStat.mode & 0o777n));
    // Probe the publication primitive before taking the old settings name, including when
    // selecting an existing theme which does not need a newly published theme file.
    const probe = path.join(stage,'link-probe');
    await exclusiveLink(io,settingsFile,probe);
    await io.unlink(probe);
    await assertParents();
    if (!(await readRegular(io,profile.settings,profile.settingsStat)).equals(original.bytes)) fail('profile-changed');
    if (choice.reused) {
      const currentTheme = await readNamedTheme(io,profile,catalog,themeName);
      if (!isDeepStrictEqual(currentTheme,existing ? theme : {name:themeName,...fileValues})) fail('profile-changed');
    } else {
      const native = {name:themeName,...fileValues};
      let themeBytes = Buffer.from(JSON.stringify(native,null,4));
      if (themeBytes.length>MAX_BYTES) themeBytes=Buffer.from(JSON.stringify(native));
      if (themeBytes.length>MAX_BYTES) fail('invalid-theme');
      const themeStat = await writePrivate(io,themeFile,themeBytes);
      const named = path.join(profile.themes,themeName+'.json');
      await exclusiveLink(io,themeFile,named);
      published = {file:named,stat:themeStat,bytes:themeBytes};
    }
    await assertParents();
    if (published) {
      const actual=await readRegular(io,published.file,published.stat,MAX_BYTES);
      if (!actual || !actual.equals(published.bytes)) fail('profile-changed');
    }
    // ST also publishes settings by renaming. Claim the actual old file, then publish only
    // into an empty name. A simultaneous ST save is never overwritten by our last step.
    await io.rename(profile.settings,priorFile);
    claimed = true;
    const displaced = await readRegular(io,priorFile,null);
    if (!displaced.equals(original.bytes)) fail('profile-changed');
    await assertParents();
    await exclusiveLink(io,settingsFile,profile.settings);
    committed=true;
    return {...result,backup:path.join(path.basename(stage),'previous-appearance.json'),revision:digest(nextBytes)};
  } catch (error) {
    if (stage && !committed) {
      try {
        await assertProfile();
        if (claimed) {
          const current = await inspectPath(io,profile.settings,'file');
          const prior = path.join(stage,'previous-settings.json');
          const priorBytes = await readRegular(io,prior,null);
          if (!current) await exclusiveLink(io,prior,profile.settings);
          else if (!priorBytes.equals(original.bytes)) recovery=true;
        }
        if (published) {
          await inspectPath(io,profile.themes,'dir',profile.themesStat);
          const current = await inspectPath(io,published.file,'file');
          if (current && sameFile(current,published.stat) &&
              (await readRegular(io,published.file,current)).equals(published.bytes)) await io.unlink(published.file);
        }
      } catch (_) { recovery=true; }
    }
    const result = recovery ? {ok:false,code:'recovery-needed'} : publicError(error);
    if (recovery && claimed) result.backup=path.join(path.basename(stage),'previous-settings.json');
    return result;
  } finally {
    if (stage && stageStat) {
      try {
        await assertProfile();
        const disposable = ['link-probe','theme.tmp','settings.tmp'];
        if (!recovery) disposable.push('previous-settings.json');
        if (!committed) disposable.push('previous-appearance.json');
        for (const file of disposable) {
          const candidate=path.join(stage,file);
          if (await inspectPath(io,candidate,'file')) await io.unlink(candidate);
        }
        if (!committed && !recovery) await io.rmdir(stage);
      } catch (_) { /* A replaced directory or someone else's file must be left untouched. */ }
    }
    if (lockKey) busy.delete(lockKey);
  }
}
const installTheme = (target,payload={},io=fs) => applyNative(target,payload,null,io);
const activateTheme = (target,name,options={},io=fs) => typeof name === 'string'
  ? applyNative(target,options,name,io) : Promise.resolve({ok:false,code:'theme-not-found'});
module.exports = {inspectTarget,readTheme,installTheme,activateTheme};
