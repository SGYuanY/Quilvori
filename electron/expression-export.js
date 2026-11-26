/* Export expressions through private files on the destination volume. */
'use strict';
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { expressionFiles } = require('../js/st-bundle');

const busy = new Set();
const error = (code,file='') => Object.assign(new Error(code),{code,file});
const samePath = (a,b) => path.relative(a,b)==='';
const fileId = info => !!info && typeof info.ino==='bigint' && info.ino>0n && typeof info.dev==='bigint';
const sameObject = (a,b) => fileId(a) && fileId(b) && a.dev===b.dev && a.ino===b.ino;
const newFileFlags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0);
const within = (base,target) => {
  const relative=path.relative(base,target);
  return relative!=='' && relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);
};
async function stat(io,file) {
  try { return await io.lstat(file,{bigint:true}); }
  catch (err) { if(err.code==='ENOENT')return null; throw err; }
}
async function directory(io,logical,base) {
  const entry=await stat(io,logical);
  if(!entry)return {logical,path:logical,entry:null,info:null};
  let real;
  try { real=await io.realpath(logical); } catch { throw error('invalid-expression-path',logical); }
  const info=await stat(io,real);
  if(!info?.isDirectory() || (base && !within(base,real)))throw error('invalid-expression-path',logical);
  if(!fileId(entry) || !fileId(info))throw error('expression-filesystem',logical);
  return {logical,path:real,entry,info};
}
async function checkDirectory(io,row) {
  const current=await stat(io,row.logical);
  if(!current && !row.entry)return;
  if(!sameObject(current,row.entry) || !samePath(await io.realpath(row.logical),row.path) ||
      !sameObject(await stat(io,row.path),row.info))throw error('expression-changed',row.logical);
}
function regular(info,links,file) {
  if(!info?.isFile() || info.isSymbolicLink() || info.nlink!==BigInt(links))throw error('unsafe-expression-file',file);
  if(!fileId(info))throw error('expression-filesystem',file);
}
function unchanged(current,expected,checkCtime) {
  return sameObject(current,expected) && current.size===expected.size && current.mtimeNs===expected.mtimeNs &&
    (!checkCtime || current.ctimeNs===expected.ctimeNs);
}
async function fingerprint(io,file,expected,{links=1,checkCtime=true,copyTo,hashBytes=Infinity}={}) {
  const current=await stat(io,file);
  regular(current,links,file);
  if(!unchanged(current,expected,checkCtime) || !samePath(await io.realpath(file),file))throw error('expression-changed',file);
  const handle=await io.open(file,constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const before=await handle.stat({bigint:true});
    regular(before,links,file);
    if(!unchanged(before,current,true))throw error('expression-changed',file);
    const hash=createHash('sha256'), buffer=Buffer.allocUnsafe(64*1024);
    let bytes=0;
    while(true){
      const {bytesRead}=await handle.read(buffer,0,buffer.length,null);
      if(!bytesRead)break;
      const chunk=buffer.subarray(0,bytesRead);
      const remaining=hashBytes-bytes;
      if(remaining>0)hash.update(remaining>=bytesRead?chunk:chunk.subarray(0,remaining));
      bytes+=bytesRead;
      if(copyTo)await copyTo.writeFile(chunk);
    }
    const after=await handle.stat({bigint:true}), named=await stat(io,file);
    if(!unchanged(after,before,true) || !unchanged(named,after,true) || BigInt(bytes)!==after.size || named.nlink!==BigInt(links))throw error('expression-changed',file);
    return hash.digest('hex');
  } finally { await handle.close(); }
}
async function planExpressionExport(payload,io=fs) {
  if(!payload || typeof payload.folder!=='string' || !path.isAbsolute(payload.folder))throw error('invalid-expression-folder');
  const images=expressionFiles(payload.character,payload.files);
  const base=await directory(io,path.resolve(payload.folder));
  if(!base.info)throw error('invalid-expression-folder');
  const character=await directory(io,path.join(base.path,payload.character),base.path);
  const dest=await directory(io,path.join(character.path,'expressions'),base.path);
  const files=[];
  for(const [index,image] of images.entries()){
    const target=path.join(dest.path,image.name), original=await stat(io,target);
    if(original){
      regular(original,1,target);
      if(!samePath(await io.realpath(target),target))throw error('unsafe-expression-file',target);
    }
    files.push({name:image.name,target,original,index,data:Buffer.from(image.dataUrl.slice(image.dataUrl.indexOf(',')+1),'base64')});
  }
  return {base:base.path,directory:dest.path,dirs:[base,character,dest],files};
}
async function tryExclusiveLink(io,source,target) {
  try { await io.link(source,target); return true; }
  catch(err){
    if(err.code==='EEXIST')throw error('expression-changed',target);
    if(['ENOTSUP','EOPNOTSUPP','ENOSYS','EXDEV','EPERM'].includes(err.code))return false;
    throw err;
  }
}

async function exportExpressions(payload,io=fs,{confirm,allowed=()=>true}={}) {
  const plan=await planExpressionExport(payload,io);
  const key=process.platform==='win32'?plan.directory.toLowerCase():plan.directory;
  if(busy.has(key))throw error('expression-busy',plan.directory);
  busy.add(key);
  const made=[], stageFiles=new Map();
  const prefix='.quilvori-expressions-'+createHash('sha256').update(key).digest('hex').slice(0,16)+'-';
  let stage,stageInfo,linksSupported,committed=false;
  async function guardDirectories(){
    for(const row of plan.dirs)await checkDirectory(io,row);
  }
  async function guardStage(){
    if(!sameObject(await stat(io,stage),stageInfo) || !samePath(await io.realpath(stage),stage))throw error('expression-changed',stage);
  }
  async function privateFile(name,write,mode=0o600){
    await guardStage();
    const file=path.join(stage,name), handle=await io.open(file,'wx',0o600);
    try {
      stageFiles.set(file,await handle.stat({bigint:true}));
      await write(handle);
      await handle.chmod(mode);
      await handle.sync();
      return {path:file,info:await handle.stat({bigint:true})};
    } finally { await handle.close(); }
  }
  async function copyExclusive(source,sourceInfo,digest,target,mode,onOpen=()=>{}){
    let handle;
    try { handle=await io.open(target,newFileFlags,mode); }
    catch(err){if(err.code==='EEXIST')throw error('expression-changed',target);throw err;}
    try {
      const info=await handle.stat({bigint:true});
      onOpen(info);
      regular(info,1,target);
      if(!sameObject(await stat(io,target),info))throw error('expression-changed',target);
      const copied=await fingerprint(io,source,sourceInfo,{checkCtime:false,copyTo:handle});
      if(copied!==digest)throw error('expression-changed',source);
      await handle.chmod(mode);
      await handle.sync();
      return await handle.stat({bigint:true});
    } finally { await handle.close(); }
  }
  async function cleanStage(){
    if(!stage)return;
    await guardStage();
    // Keep the manifest until every owned data file has been removed.
    for(const [file,identity] of [...stageFiles].reverse()){
      await guardStage();
      const current=await stat(io,file);
      if(!current)continue;
      if(!sameObject(current,identity))throw error('expression-changed',file);
      await io.unlink(file);
    }
    await guardStage();
    await io.rmdir(stage);
  }
  async function live(file){
    const current=await stat(io,file.target);
    if(!file.original){
      if(current)throw error('expression-changed',file.target);
    } else if(!unchanged(current,file.original,true) || current.nlink!==1n ||
        await fingerprint(io,file.target,file.original)!==file.digest)throw error('expression-changed',file.target);
  }
  async function validateStored(file,pathToCheck,info,links,expectedDigest){
    if(await fingerprint(io,pathToCheck,info,{links,checkCtime:false})!==expectedDigest)throw error('expression-changed',file.name);
  }
  async function validatePublication(file){
    const published=file.published;
    if(published.complete){
      await validateStored(file,file.target,published.info,published.links,file.newDigest);
      return;
    }
    // A failed exclusive copy may have written a prefix. Never remove a different writer's bytes.
    const current=await stat(io,file.target);
    if(!sameObject(current,published.info) || current.size>BigInt(file.data.length))throw error('expression-changed',file.target);
    const prefix=createHash('sha256').update(file.data.subarray(0,Number(current.size))).digest('hex');
    await validateStored(file,file.target,current,1,prefix);
  }
  async function restoreCopy(file,source,sourceInfo){
    let created;
    try {
      const info=await copyExclusive(source,sourceInfo,file.digest,file.target,file.mode,opened=>{created=opened;});
      await validateStored(file,file.target,info,1,file.digest);
    } catch(err){
      // Keep the independent backup. A partial restore can be removed only if it still matches that backup.
      if(created){
        await guardDirectories();await guardStage();
        const partial=await stat(io,file.target);
        if(partial && sameObject(partial,created) && partial.size<=file.original.size){
          const prefix=await fingerprint(io,file.backup.path,file.backup.info,{hashBytes:Number(partial.size)});
          await validateStored(file,file.target,partial,1,prefix);
          await guardDirectories();
          await io.unlink(file.target);
        }
      }
      throw err;
    }
  }
  async function rollback(){
    let complete=true;
    for(const file of plan.files.slice().reverse()){
      if(!file.claimed && !file.published)continue;
      try {
        await guardDirectories();await guardStage();
        const current=await stat(io,file.target);
        if(file.published && current){
          await validatePublication(file);
          await guardDirectories();
          await io.unlink(file.target);
        }
        if(!file.claimed)continue;
        if(await stat(io,file.target))throw error('expression-changed',file.target);
        let original=file.moved, info=file.original;
        try { await validateStored(file,original,file.original,1,file.digest); }
        catch {
          // A changed or missing displaced object must never be followed. Keep both copies for recovery.
          complete=false;
          await validateStored(file,file.backup.path,file.backup.info,1,file.digest);
          original=file.backup.path;info=file.backup.info;
        }
        await guardDirectories();await guardStage();
        if(!linksSupported || !await tryExclusiveLink(io,original,file.target)){
          await restoreCopy(file,original,info);
        }
      } catch { complete=false; }
    }
    for(const row of made.reverse()){
      try {
        await checkDirectory(io,row);
        await io.rmdir(row.path);
        row.info=row.entry=null;
      } catch(err){if(!['ENOTEMPTY','EEXIST','ENOENT'].includes(err.code))complete=false;}
    }
    return complete;
  }
  try {
    await guardDirectories();
    for(const row of plan.dirs.filter(dir=>dir.info)){
      const prior=(await io.readdir(row.path,{withFileTypes:true})).find(entry=>entry.isDirectory() && entry.name.startsWith(prefix));
      if(prior)throw Object.assign(error('expression-recovery'),{recovery:path.join(row.path,prior.name)});
    }
    const parent=plan.dirs.filter(row=>row.info).at(-1);
    stage=await io.mkdtemp(path.join(parent.path,prefix));
    stageInfo=await stat(io,stage);
    const manifest={format:'quilvori-expression-recovery-v1',destination:plan.directory,files:plan.files.map(file=>({
      name:file.name,replacement:'new-'+file.index,...(file.original?{backup:'backup-'+file.index,displaced:'original-'+file.index}:{})
    }))};
    await privateFile('manifest.json',handle=>handle.writeFile(JSON.stringify(manifest,null,2)));
    for(const file of plan.files){
      await guardDirectories();
      file.mode=file.original?Number(file.original.mode & 0o777n):0o666 & ~process.umask();
      file.staged=await privateFile('new-'+file.index,handle=>handle.writeFile(file.data),file.mode);
      regular(file.staged.info,1,file.staged.path);
      file.newDigest=createHash('sha256').update(file.data).digest('hex');
      if(file.original){
        file.backup=await privateFile('backup-'+file.index,async handle=>{
          file.digest=await fingerprint(io,file.target,file.original,{copyTo:handle});
        },file.mode);
        file.moved=path.join(stage,'original-'+file.index);
      }
    }
    const names=plan.files.filter(file=>file.original).map(file=>file.name);
    if(names.length && (!confirm || await confirm({directory:plan.directory,names,count:plan.files.length})!==true)){
      await cleanStage();stage=null;
      return {canceled:true};
    }
    if(!allowed())throw error('expression-changed',plan.directory);
    await guardDirectories();await guardStage();
    for(const file of plan.files)await live(file);
    // Probe only private stage files. Volumes without hard links can still publish by creating a new, exclusive file.
    let collided=false;
    try { const unexpected=await io.open(plan.files[0].staged.path,newFileFlags);await unexpected.close(); }
    catch(err){if(err.code==='EEXIST')collided=true;else throw err;}
    if(!collided)throw error('expression-filesystem',plan.directory);
    const probe=path.join(stage,'link-test');
    linksSupported=await tryExclusiveLink(io,plan.files[0].staged.path,probe);
    if(linksSupported){
      stageFiles.set(probe,plan.files[0].staged.info);
      await io.unlink(probe);
    }
    for(const row of plan.dirs){
      if(row.info)continue;
      await guardDirectories();
      await io.mkdir(row.path);
      row.entry=row.info=await stat(io,row.path);
      made.push(row);
      if(!row.info?.isDirectory() || row.info.isSymbolicLink())throw error('expression-changed',row.path);
      await checkDirectory(io,row);
    }
    for(const file of plan.files){
      if(!allowed())throw error('expression-changed',plan.directory);
      await guardDirectories();await guardStage();await live(file);
      await validateStored(file,file.staged.path,file.staged.info,1,file.newDigest);
      if(file.original){
        await guardDirectories();await guardStage();
        const last=await stat(io,file.target);
        if(!unchanged(last,file.original,true) || last.nlink!==1n)throw error('expression-changed',file.target);
        if(await stat(io,file.moved))throw error('expression-changed',stage);
        await io.rename(file.target,file.moved);
        file.claimed=true;stageFiles.set(file.moved,file.original);
        await validateStored(file,file.moved,file.original,1,file.digest);
      }
      await guardDirectories();await guardStage();
      if(linksSupported && await tryExclusiveLink(io,file.staged.path,file.target)){
        file.published={links:2,info:file.staged.info,complete:true};
      } else {
        const written=await copyExclusive(file.staged.path,file.staged.info,file.newDigest,file.target,file.mode,
          info=>{file.published={links:1,info,complete:false};});
        file.published={links:1,info:written,complete:true};
      }
    }
    await guardDirectories();await guardStage();
    for(const file of plan.files){
      await validatePublication(file);
      if(file.claimed)await validateStored(file,file.moved,file.original,1,file.digest);
    }
    committed=true;
    try { await cleanStage(); }
    catch { return {directory:plan.directory,count:plan.files.length,cleanup:stage}; }
    return plan.directory;
  } catch(err) {
    if(!committed && stage){
      if(!await rollback())throw Object.assign(error('expression-recovery'),{recovery:stage});
      try { await cleanStage(); }
      catch { throw Object.assign(error('expression-recovery'),{recovery:stage}); }
    }
    throw err;
  } finally { busy.delete(key); }
}
function overwriteOptions({directory,names,count},language) {
  const prompts={
    en:['{old} existing files will be replaced in this batch of {count} expression images.','Cancel','Replace listed files'],
    zh:['本批共 {count} 张表情图片，将替换以下 {old} 个现有文件。','取消','替换列出的文件'],
    ja:['表情画像 {count} 枚のうち、以下の既存ファイル {old} 件を置き換えます。','キャンセル','表示したファイルを置換'],
    ru:['Из {count} изображений эмоций будут заменены существующие файлы ({old}).','Отмена','Заменить перечисленные файлы'],
    ko:['표정 이미지 {count}개 중 기존 파일 {old}개를 교체합니다.','취소','표시된 파일 교체'],
    th:['ไฟล์ภาพสีหน้าชุดนี้มี {count} ภาพ โดยจะแทนที่ไฟล์เดิม {old} ไฟล์ตามรายการ','ยกเลิก','แทนที่ไฟล์ในรายการ'],
  };
  const locale=String(language || '').toLowerCase().split('-')[0];
  const [template,cancel,replace]=Object.hasOwn(prompts,locale)?prompts[locale]:prompts.en;
  return {type:'warning',title:'Quilvori',message:template.replace('{old}',String(names.length)).replace('{count}',String(count)),
    detail:directory+'\n\n'+names.join('\n'),buttons:[cancel,replace],defaultId:0,cancelId:0,noLink:true};
}
module.exports={planExpressionExport,exportExpressions,overwriteOptions};
