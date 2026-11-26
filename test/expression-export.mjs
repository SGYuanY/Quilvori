import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const {exportExpressions,overwriteOptions}=createRequire(import.meta.url)('../electron/expression-export');
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'quilvori-expression-test-'));
const yes={confirm:async()=>true};
const image=(name,data='new')=>({name,dataUrl:'data:image/png;base64,'+Buffer.from(data).toString('base64')});
const adapter=overrides=>Object.assign(Object.create(fs),overrides);
const diskError=()=>Object.assign(new Error('Fixture disk failure'),{code:'EIO'});
const text=file=>fs.readFile(file,'utf8');
const names=async dir=>(await fs.readdir(dir)).sort();
async function fixture(existing={}) {
  const folder=await fs.mkdtemp(path.join(tmp,'cards-')),character='沈听雨 · Rain';
  const dest=path.join(folder,character,'expressions');
  if(Object.keys(existing).length){
    await fs.mkdir(dest,{recursive:true});
    for(const [name,value] of Object.entries(existing))await fs.writeFile(path.join(dest,name),value);
  }
  const payload=(...files)=>({folder,character,files});
  return {folder,character,dest,payload};
}
async function cleanFolder(dir) {
  return (await names(dir)).filter(name=>!name.startsWith('.quilvori-expressions-'));
}
try{
  await test('Unicode names are published only after the complete batch has been checked',async()=>{
    const {payload,dest}=await fixture();
    const files=[image('微笑.png','smile'),image('雨夜 01.webp'),image('.neutral.png')];
    const long=image('花'.repeat(90)+'.png');
    if(process.platform==='win32')files.push(long);
    else await assert.rejects(exportExpressions(payload(long)),{code:'invalid-expression-name'});
    assert.equal(await exportExpressions(payload(...files)),await fs.realpath(dest));
    assert.deepEqual(await names(dest),files.map(file=>file.name).sort());
    assert.equal(await text(path.join(dest,'微笑.png')),'smile');
  });

  await test('overwrites require a fresh decision for the exact folder and existing filenames; cancellation writes no destination files',async()=>{
    const {payload,dest}=await fixture({'old.png':'original'});
    const batch=payload(image('old.png'),image('new.png'));
    assert.deepEqual(await exportExpressions(batch),{canceled:true});
    let calls=0;
    const cancel=async preview=>{
      calls++;
      assert.deepEqual(preview,{directory:await fs.realpath(dest),names:['old.png'],count:2});
      assert.deepEqual(await cleanFolder(dest),['old.png']);
      assert.equal(await text(path.join(dest,'old.png')),'original');
      const dialog=overwriteOptions(preview,'zh-CN');
      assert.equal(dialog.defaultId,0);assert.equal(dialog.cancelId,0);
      assert.match(dialog.detail,/old\.png/);assert.match(dialog.buttons[1],/替换/);
      return false;
    };
    assert.deepEqual(await exportExpressions(batch,fs,{confirm:cancel}),{canceled:true});
    assert.equal(calls,1);assert.deepEqual(await names(dest),['old.png']);
    assert.equal(await exportExpressions(batch,fs,yes),await fs.realpath(dest));
    assert.deepEqual(await names(dest),['new.png','old.png']);assert.equal(await text(path.join(dest,'old.png')),'new');
  });

  await test('invalid names, duplicate names, invalid images and malformed late siblings leave no staging or output',async()=>{
    const {folder,character,payload}=await fixture();
    for(const value of ['../outside','..\\outside','/absolute','C:\\absolute','C:stream','.','..','CON','nul.png','LPT1.png','name.','name ','bad\0name','a/b.png','a\\b.png']){
      await assert.rejects(exportExpressions({folder,character:value,files:[image('first.png')]}));
      await assert.rejects(exportExpressions(payload(image('first.png'),image(value))));
    }
    for(const files of [null,{},[],[null],[image('first.png'),{name:'later.png',dataUrl:'not image data'}]])await assert.rejects(exportExpressions({folder,character,files}));
    for(const [a,b] of [['happy.png','HAPPY.PNG'],['café.png','cafe\u0301.png']]){
      await assert.rejects(exportExpressions(payload(image(a),image(b))),{code:'duplicate-expression-name'});
    }
    assert.deepEqual(await names(folder),[]);
  });

  await test('directories, redirected target files and directory aliases leaving the chosen folder are rejected during planning',async()=>{
    const {folder,character,payload,dest}=await fixture({'keep.png':'preserve'});
    await fs.mkdir(path.join(dest,'directory.png'));
    await assert.rejects(exportExpressions(payload(image('keep.png'),image('directory.png')),fs,yes),{code:'unsafe-expression-file'});
    const redirect=path.join(tmp,'different-location');
    for(const file of [path.join(dest,'keep.png'),path.join(folder,character)]){
      const io=adapter({realpath:async value=>value===file?redirect:fs.realpath(value)});
      await assert.rejects(exportExpressions(payload(image('keep.png')),io,yes));
    }
    assert.equal(await text(path.join(dest,'keep.png')),'preserve');
    assert.deepEqual(await names(dest),['directory.png','keep.png']);
  });

  await test('an existing directory alias within a chosen character folder keeps working',async()=>{
    const {folder}=await fixture(), inside=path.join(folder,'Real character');
    await fs.mkdir(inside);await fs.symlink(inside,path.join(folder,'Alias'),process.platform==='win32'?'junction':'dir');
    const actual=await exportExpressions({folder,character:'Alias',files:[image('微笑.png')]});
    assert.equal(actual,await fs.realpath(path.join(inside,'expressions')));
    assert.equal(await text(path.join(actual,'微笑.png')),'new');
  });

  await test('a staged-image write failure creates no visible files and can be retried',async()=>{
    const {folder,payload,dest}=await fixture(), batch=payload(image('one.png'),image('two.png'));
    const io=adapter({open:async(target,...args)=>{
      const handle=await fs.open(target,...args);
      if(path.basename(target)==='new-1')handle.writeFile=async()=>{throw diskError();};
      return handle;
    }});
    await assert.rejects(exportExpressions(batch,io),{code:'EIO'});
    assert.deepEqual(await names(folder),[]);
    await exportExpressions(batch);
    assert.deepEqual(await names(dest),['one.png','two.png']);
  });

  await test('a later publication failure restores original bytes and removes earlier new images and created directories',async()=>{
    for(const existing of [{},{'old.png':'the original bytes','other.png':'untouched'}]){
      const {folder,payload,dest}=await fixture(existing), batch=payload(image('old.png'),image('first.png'),image('last.png'));
      const io=adapter({link:async(source,to)=>{
        if(to===path.join(dest,'last.png'))throw diskError();
        return fs.link(source,to);
      }});
      await assert.rejects(exportExpressions(batch,io,yes),{code:'EIO'});
      if(Object.keys(existing).length){
        assert.deepEqual(await names(dest),['old.png','other.png']);
        assert.equal(await text(path.join(dest,'old.png')),existing['old.png']);
      } else assert.deepEqual(await names(folder),[]);
      await exportExpressions(batch,fs,yes);
      assert.equal(await text(path.join(dest,'last.png')),'new');
    }
  });

  await test('a link count greater than one is refused before approval and when the decision becomes stale',async()=>{
    const {payload,dest}=await fixture({'old.png':'normal original'}), target=path.join(dest,'old.png');
    let multi=true,calls=0;
    const io=adapter({lstat:async(file,options)=>{
      const observed=await fs.lstat(file,options);
      if(file===target && multi)observed.nlink=2n;
      return observed;
    }});
    const batch=payload(image('first.png'),image('old.png'));
    await assert.rejects(exportExpressions(batch,io,{confirm:()=>{calls++;return true;}}),{code:'unsafe-expression-file'});
    assert.equal(calls,0);
    multi=false;
    await assert.rejects(exportExpressions(batch,io,{confirm:()=>{multi=true;return true;}}),{code:'expression-changed'});
    assert.deepEqual(await names(dest),['old.png']);assert.equal(await text(target),'normal original');
  });

  await test('an external edit or a newly occupied name during confirmation is preserved and the batch is not committed',async()=>{
    for(const edited of ['old.png','later.png']){
      const {payload,dest}=await fixture({'old.png':'old'});
      const confirm=async()=>{await fs.writeFile(path.join(dest,edited),'concurrent');return true;};
      await assert.rejects(exportExpressions(payload(image('earlier.png'),image('old.png'),image('later.png')),fs,{confirm}),{code:'expression-changed'});
      assert.equal(await text(path.join(dest,edited)),'concurrent');
      assert.ok(!(await names(dest)).includes('earlier.png'));
    }
  });

  await test('simultaneous exports to the same directory cannot share an approval',async()=>{
    const {payload,dest}=await fixture({'old.png':'old'}), batch=payload(image('old.png'));
    let entered,unblock;
    const waiting=new Promise(resolve=>{entered=resolve;});
    const first=exportExpressions(batch,fs,{confirm:()=>{entered();return new Promise(resolve=>{unblock=resolve;});}});
    await waiting;
    try {await assert.rejects(exportExpressions(batch,fs,yes),{code:'expression-busy'});}
    finally {unblock(false);assert.deepEqual(await first,{canceled:true});}
    assert.deepEqual(await names(dest),['old.png']);assert.equal(await text(path.join(dest,'old.png')),'old');
  });

  await test('volumes without hard links can replace approved files using exclusive new handles and roll back an interrupted copy',async()=>{
    const {payload,dest}=await fixture({'old.png':'original'}),batch=payload(image('old.png'),image('first.png'),image('last.png'));
    const noLinks=()=>{throw Object.assign(new Error('fixture'),{code:'ENOTSUP'});};
    const failed=adapter({link:noLinks,open:async(target,flags,...args)=>{
      const h=await fs.open(target,flags,...args);
      if(target===path.join(dest,'last.png') && typeof flags==='number' && (flags&constants.O_EXCL)){
        assert.equal(flags&constants.O_TRUNC,0);
        const write=h.writeFile.bind(h);
        h.writeFile=async bytes=>{await write(bytes.subarray(0,1));throw diskError();};
      }
      return h;
    }});
    await assert.rejects(exportExpressions(batch,failed,yes),{code:'EIO'});
    assert.deepEqual(await names(dest),['old.png']);assert.equal(await text(path.join(dest,'old.png')),'original');
    assert.equal(await exportExpressions(batch,adapter({link:noLinks}),yes),await fs.realpath(dest));
    assert.deepEqual(await names(dest),['first.png','last.png','old.png']);assert.equal(await text(path.join(dest,'old.png')),'new');
  });

  await test('a volume lacking file identity or exclusive-create guarantees is refused before moving original files',async()=>{
    for(const risk of ['identity','exclusive']){
      const {payload,dest}=await fixture({'old.png':'original'});let moved=false;
      const io=adapter({lstat:async(file,options)=>{
        const result=await fs.lstat(file,options);
        if(risk==='identity' && file===path.join(dest,'old.png'))result.ino=0n;
        return result;
      },open:async(file,flags,...args)=>{
        if(risk==='exclusive' && path.basename(file)==='new-0' && typeof flags==='number' && (flags&constants.O_EXCL))return fs.open(file,'r');
        return fs.open(file,flags,...args);
      },rename:async(...args)=>{moved=true;return fs.rename(...args);}});
      await assert.rejects(exportExpressions(payload(image('old.png')),io,yes),{code:'expression-filesystem'});
      assert.equal(moved,false);assert.deepEqual(await names(dest),['old.png']);assert.equal(await text(path.join(dest,'old.png')),'original');
    }
  });

  await test('a newly occupied destination during exclusive publication keeps the independent file and the displaced original backup',async()=>{
    for(const viaLink of [true,false]){
      const {payload,dest}=await fixture({'old.png':'original'}),target=path.join(dest,'old.png');
      const io=adapter({link:async(source,to)=>{
        if(!viaLink)throw Object.assign(new Error('fixture'),{code:'ENOTSUP'});
        if(to===target)await fs.writeFile(target,'concurrent',{flag:'wx'});
        return fs.link(source,to);
      },open:async(file,flags,...args)=>{
        if(!viaLink && file===target && typeof flags==='number' && (flags&constants.O_EXCL))await fs.writeFile(target,'concurrent',{flag:'wx'});
        return fs.open(file,flags,...args);
      }});
      let recovery;
      await assert.rejects(exportExpressions(payload(image('old.png')),io,yes),err=>{recovery=err.recovery;return err.code==='expression-recovery';});
      assert.equal(await text(target),'concurrent');assert.equal(await text(path.join(recovery,'backup-0')),'original');
    }
  });

  await test('a file edited in place after publication stays in place when the rest of the batch fails',async()=>{
    for(const viaLink of [true,false]){
      const {payload,dest}=await fixture({'first.png':'original'});
      const first=path.join(dest,'first.png'),last=path.join(dest,'last.png');
      async function laterFailure(){
        await fs.writeFile(first,'concurrent edit');
        throw diskError();
      }
      const io=adapter({link:async(source,target)=>{
        if(!viaLink)throw Object.assign(new Error('fixture'),{code:'ENOTSUP'});
        if(target===last)return laterFailure();
        return fs.link(source,target);
      },open:async(file,flags,...args)=>{
        if(!viaLink && file===last && typeof flags==='number' && (flags&constants.O_EXCL))return laterFailure();
        return fs.open(file,flags,...args);
      }});
      let recovery;
      await assert.rejects(exportExpressions(payload(image('first.png'),image('last.png')),io,yes),err=>{
        recovery=err.recovery;return err.code==='expression-recovery';
      });
      assert.equal(await text(first),'concurrent edit');
      assert.equal(await text(path.join(recovery,'backup-0')),'original');
      assert.equal(JSON.parse(await text(path.join(recovery,'manifest.json'))).files[0].name,'first.png');
    }
  });

  await test('an interrupted restoration cleans up its verified partial file and preserves any independent edit',async()=>{
    for(const concurrent of [false,true]){
      const {payload,dest}=await fixture({'old.png':'original'});
      const old=path.join(dest,'old.png'),last=path.join(dest,'last.png');
      let opens=0,recovery;
      const io=adapter({link:async()=>{throw Object.assign(new Error('fixture'),{code:'ENOTSUP'});},
        open:async(file,flags,...args)=>{
          const exclusive=typeof flags==='number' && (flags&constants.O_EXCL);
          if(file===last && exclusive)throw diskError();
          const handle=await fs.open(file,flags,...args);
          if(file===old && exclusive && ++opens===2){
            const write=handle.writeFile.bind(handle);
            handle.writeFile=async bytes=>{
              await write(bytes.subarray(0,1));
              if(concurrent)await fs.writeFile(old,'X');
              throw diskError();
            };
          }
          return handle;
        }});
      await assert.rejects(exportExpressions(payload(image('old.png'),image('last.png')),io,yes),err=>{
        recovery=err.recovery;return err.code==='expression-recovery';
      });
      if(concurrent)assert.equal(await text(old),'X');
      else await assert.rejects(fs.stat(old),{code:'ENOENT'});
      assert.equal(await text(path.join(recovery,'backup-0')),'original');
      assert.equal(await text(path.join(recovery,'original-0')),'original');
    }
  });

  await test('incomplete rollback keeps a readable original backup and manifest and a retry preserves them',async()=>{
    const {payload,dest}=await fixture({'old.png':'irreplaceable'});
    const io=adapter({link:async(source,target)=>{
      if(target===path.join(dest,'last.png') || path.basename(source)==='original-0')throw diskError();
      return fs.link(source,target);
    }});
    const batch=payload(image('old.png'),image('last.png'));
    let recover;
    await assert.rejects(exportExpressions(batch,io,yes),exception=>{
      recover=exception.recovery;return exception.code==='expression-recovery' && Boolean(recover);
    });
    assert.equal(path.dirname(recover),await fs.realpath(dest));
    const manifest=JSON.parse(await text(path.join(recover,'manifest.json')));
    const old=manifest.files.find(row=>row.name==='old.png');
    assert.equal(await text(path.join(recover,old.backup)),'irreplaceable');
    assert.equal(await text(path.join(recover,old.displaced)),'irreplaceable');
    await assert.rejects(exportExpressions(batch,fs,yes),err=>err.code==='expression-recovery' && err.recovery===recover);
    assert.equal(await text(path.join(recover,old.backup)),'irreplaceable');
  });
} finally {
  const safe=path.resolve(tmp);
  if(path.dirname(safe)!==path.resolve(os.tmpdir()) || !path.basename(safe).startsWith('quilvori-expression-test-'))throw new Error('Unexpected expression test directory');
  await fs.rm(safe,{recursive:true,force:true,maxRetries:4,retryDelay:100});
}
