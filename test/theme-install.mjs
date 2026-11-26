import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inspectTarget,readTheme,installTheme,activateTheme} from '../electron/theme-install.js';

const originalTheme = {name:'Velvet',main_text_color:'#faefde',custom_css:'body { color: linen; }'};
const incoming = {
  name:'Velvet',main_text_color:'rgb(230, 215, 255)',blur_strength:5,
  chat_tint_color:'rgba(38, 26, 54, .8)',timestamps_enabled:false,chat_display:1,
  custom_css:'body { color: lavender; }',fixtureNotes:{edition:'second'},unrelated_pref:'untrusted',
  border_color:'not a color',quilvori_source:{author:{name:'Fixture Artist'},postUrl:'https://example.org/author-post?utm_source=fixture'},
};
const originalSettings = {
  extensions:{fixture:{option:'keep'}},unrelated:'original',
  power_user:{theme:'Velvet',custom_css:originalTheme.custom_css,main_text_color:'#faefde',
    unrelated_pref:'keep',stscript:{parser:{flags:2}}},
};
const json = async file => JSON.parse(await fs.readFile(file,'utf8'));
const put = (file,data) => fs.writeFile(file,JSON.stringify(data,null,2));
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'quilvori-theme-install-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const data=path.join(root,'data'), profile=path.join(data,'reader'), themes=path.join(profile,'themes');
  await fs.mkdir(themes,{recursive:true});
  const settings=path.join(profile,'settings.json');
  await put(settings,originalSettings);
  await put(path.join(themes,'stock.json'),originalTheme);
  return {root,data,profile,themes,settings};
}

test('root, data and profile paths resolve only ST profiles and require a choice across users',async t=>{
  const f=await fixture(t);
  for (const target of [f.root,f.data,f.profile]) {
    const found=await inspectTarget(target);
    assert.equal(found.ok,true);assert.equal(found.user,'reader');assert.deepEqual(found.users,['reader']);
    assert.deepEqual(found.themes,['Velvet']);assert.equal(found.currentTheme,'Velvet');
    assert.deepEqual(Object.keys(found).sort(),['currentTheme','ok','revision','themes','user','users']);
  }
  const other=path.join(f.data,'guest');
  await fs.mkdir(path.join(other,'themes'),{recursive:true});await put(path.join(other,'settings.json'),{});
  await fs.mkdir(path.join(f.data,'not-a-profile'));
  assert.deepEqual(await inspectTarget(f.root),{ok:false,code:'choose-user',users:['guest','reader']});
  assert.equal((await installTheme(f.data,{theme:incoming})).code,'choose-user');
  assert.equal((await inspectTarget({path:f.root,user:'reader'})).user,'reader');
  assert.equal((await inspectTarget({path:f.root,user:'../reader'})).code,'unknown-user');
  assert.equal((await inspectTarget(path.join(f.data,'not-a-profile'))).code,'invalid-profile');
  assert.deepEqual(await json(f.settings),originalSettings);
});

test('a protected native copy uses only validated settings; the recovery file contains appearance alone',async t=>{
  const f=await fixture(t);
  const installed=await installTheme(f.root,{theme:incoming,allowCss:false});
  assert.equal(installed.ok,true);assert.equal(installed.user,'reader');assert.equal(installed.previousTheme,'Velvet');
  assert.equal(installed.themeName,'Velvet (Quilvori)');assert.equal(installed.reused,false);
  const native=await json(path.join(f.themes,installed.themeName+'.json'));
  assert.equal(native.custom_css,'');assert.equal(native.main_text_color,'rgba(230, 215, 255, 1)');
  assert.equal(native.timestamps_enabled,false);assert.equal(native.chat_display,1);
  const {name,fixtureNotes,unrelated_pref,quilvori_source,...values}=native;
  assert.deepEqual(fixtureNotes,incoming.fixtureNotes);
  assert.equal(unrelated_pref,'untrusted');assert.equal(quilvori_source.author.name,'Fixture Artist');
  assert.equal(quilvori_source.postUrl,'https://example.org/author-post');
  assert.ok(!('border_color' in native));
  assert.deepEqual(await json(f.settings),{...originalSettings,power_user:{...originalSettings.power_user,...values,theme:name}});
  assert.deepEqual(await json(path.join(f.themes,'stock.json')),originalTheme);
  const backup=await json(path.join(f.profile,installed.backup));
  assert.equal(backup.previous.theme,'Velvet');assert.equal(backup.previous.custom_css,originalTheme.custom_css);
  assert.ok(backup.absent.includes('blur_strength'));
  assert.ok(!JSON.stringify(backup).includes('unrelated'));
  assert.deepEqual(await fs.readdir(path.dirname(path.join(f.profile,installed.backup))),['previous-appearance.json']);
  const again=await installTheme(f.profile,{theme:incoming,allowCss:false});
  assert.equal(again.themeName,installed.themeName);assert.equal(again.backup,'');assert.equal(again.reused,true);
  const modified=await installTheme(f.profile,{theme:{...incoming,blur_strength:9},allowCss:false});
  assert.equal(modified.themeName,'Velvet (Quilvori) 2');
  assert.deepEqual(await json(path.join(f.themes,installed.themeName+'.json')),native);
  const reuse=await installTheme(f.profile,{theme:incoming,allowCss:false});
  assert.equal(reuse.themeName,installed.themeName);assert.equal(reuse.reused,true);
  const cssAllowed=await installTheme(f.profile,{theme:incoming,allowCss:true});
  assert.equal((await json(f.settings)).power_user.custom_css,incoming.custom_css);
  assert.equal((await json(path.join(f.themes,cssAllowed.themeName+'.json'))).custom_css,incoming.custom_css);
});

test('native themes are read by listed name and switch directly with optional custom CSS',async t=>{
  const f=await fixture(t);
  await put(path.join(f.themes,'other.json'),{random:'not a theme'});
  await put(path.join(f.themes,'caps.JSON'),{name:'Uppercase ignored by ST',custom_css:''});
  await fs.link(f.settings,path.join(f.themes,'linked.json'));
  const known=await readTheme(f.profile,'Velvet');
  assert.equal(known.ok,true);assert.deepEqual(known.theme,originalTheme);
  for (const name of ['../settings','stock.json','other','Uppercase ignored by ST','linked']) {
    assert.equal((await readTheme(f.profile,name)).code,'theme-not-found');
  }
  await fs.unlink(path.join(f.themes,'linked.json'));
  const without=await activateTheme(f.profile,'Velvet',{allowCss:false,themeRevision:known.themeRevision});
  assert.equal(without.themeName,'Velvet');assert.equal((await json(f.settings)).power_user.custom_css,'');
  const withCss=await activateTheme(f.profile,'Velvet',{allowCss:true});
  assert.equal(withCss.ok,true);assert.equal((await json(f.settings)).power_user.custom_css,originalTheme.custom_css);
  assert.deepEqual(await fs.readdir(f.themes),['caps.JSON','other.json','stock.json']);
  await put(path.join(f.themes,'stock.json'),{...originalTheme,custom_css:'body {color: plum;}'});
  assert.equal((await activateTheme(f.profile,'Velvet',{allowCss:true,themeRevision:known.themeRevision})).code,'profile-changed');
  assert.equal((await json(f.settings)).power_user.custom_css,originalTheme.custom_css);
});

test('settings changed since inspection or while being published are preserved, including external replacements',async t=>{
  const f=await fixture(t), examined=await inspectTarget(f.profile);
  const edits={...originalSettings,unrelated:'concurrent edit'};
  await put(f.settings,edits);
  assert.equal((await installTheme(f.profile,{theme:incoming,revision:examined.revision})).code,'profile-changed');
  const changed={...edits,unrelated:'edited during install'};
  const raced={...fs,rename:async(from,to)=>{
    if (from===f.settings) await put(f.settings,changed);
    return fs.rename(from,to);
  }};
  assert.equal((await installTheme(f.profile,{theme:incoming},raced)).code,'profile-changed');
  assert.deepEqual(await json(f.settings),changed);assert.deepEqual(await fs.readdir(f.themes),['stock.json']);
  const newWriter={...changed,unrelated:'published concurrently'};
  const interleaved={...fs,link:async(from,to)=>{
    if (to===f.settings && path.basename(from)==='settings.tmp') await put(f.settings,newWriter);
    return fs.link(from,to);
  }};
  const collided=await installTheme(f.profile,{theme:incoming},interleaved);
  assert.equal(collided.code,'profile-changed');
  assert.deepEqual(await json(f.settings),newWriter);assert.deepEqual(await fs.readdir(f.themes),['stock.json']);
});

test('storage failures and competing native filenames leave the existing settings and themes intact',async t=>{
  const f=await fixture(t);
  const full={...fs,link:async(from,to)=>{
    if (to===f.settings && path.basename(from)==='settings.tmp') throw Object.assign(new Error('fixture disk full'),{code:'ENOSPC'});
    return fs.link(from,to);
  }};
  assert.equal((await installTheme(f.profile,{theme:incoming},full)).code,'write-failed');
  assert.deepEqual(await json(f.settings),originalSettings);assert.deepEqual(await fs.readdir(f.themes),['stock.json']);
  const unsupported={...fs,link:async()=>{throw Object.assign(new Error('fixture link unavailable'),{code:'ENOTSUP'});}};
  assert.equal((await activateTheme(f.profile,'Velvet',{allowCss:false},unsupported)).code,'unsupported-filesystem');
  assert.deepEqual(await json(f.settings),originalSettings);
  const occupied={name:'Another writer',custom_css:''};
  const collision={...fs,link:async(from,to)=>{
    if (path.dirname(to)===f.themes) await put(to,occupied);
    return fs.link(from,to);
  }};
  assert.equal((await installTheme(f.profile,{theme:incoming},collision)).code,'profile-changed');
  assert.deepEqual(await json(path.join(f.themes,'Velvet (Quilvori).json')),occupied);
  assert.deepEqual(await json(f.settings),originalSettings);
  await put(f.settings,{power_user:[]});
  assert.equal((await inspectTarget(f.profile)).code,'invalid-settings');
});

test('an interrupted publication identifies the exact local recovery file without exposing its contents',async t=>{
  const f=await fixture(t), stage=await fs.mkdtemp(path.join(f.profile,'.quilvori-theme-'));
  const backup=path.join(stage,'previous-settings.json');
  await fs.rename(f.settings,backup);
  assert.deepEqual(await inspectTarget(f.profile),{ok:false,code:'recovery-needed',user:'reader',backup:path.relative(f.profile,backup)});
  assert.deepEqual(await json(backup),originalSettings);
});

test('redirected profile folders and unsafe theme names never escape the selected user',async t=>{
  const f=await fixture(t), outside=path.join(f.root,'outside');await fs.mkdir(outside);
  const alias=path.join(f.root,'alias');
  await fs.symlink(f.profile,alias,process.platform==='win32'?'junction':'dir');
  assert.equal((await inspectTarget(alias)).code,'unsafe-path');
  const safe=await installTheme(f.profile,{theme:{...incoming,name:'../../Amber / Mist'}});
  assert.equal(safe.ok,true);assert.equal(path.basename(safe.themeName),safe.themeName);
  assert.ok(await fs.stat(path.join(f.themes,safe.themeName+'.json')));
  await fs.rename(f.themes,path.join(f.profile,'original-themes'));
  await fs.symlink(outside,f.themes,process.platform==='win32'?'junction':'dir');
  assert.equal((await installTheme(f.profile,{theme:incoming})).code,'unsafe-path');
  assert.deepEqual(await fs.readdir(outside),[]);
});
