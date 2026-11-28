'use strict';
const assert=require('node:assert/strict');
const suite=require('./desktop-fixture.cjs');

suite('card-sync',async({open,run,wait,click,input,file,download,win})=>{
  const on='[data-card-sync] [data-sync-open]', confirm='[data-act="sync-apply"]';
  const card=(description)=>({spec:'chara_card_v2',spec_version:'2.0',data:{name:'Beacon',description}});
  const jsonFile='Beacon.json',pngFile='Beacon.png';
  const record=id=>run(id=>TALibraryDB.workBinding('characters',id),id);
  const modal=()=>wait(()=>!!document.querySelector('[data-sync-review]'),'character comparison');
  const done=()=>wait(()=>{const button=document.querySelector('[data-card-sync] [data-sync-open]');
    return !!button && !button.disabled && !document.querySelector('#modal-root.show');
  },'character sync completion');
  async function seed(id,raw,shared=false){
    await open('characters');
    await run(async(id,raw,shared)=>{
      TAI18n.save({lang:'en'});
      const lib=TAStore.emptyLibrary(), {book,...fields}=TAFormats.cardToCharacter(raw);
      const work={...fields,id,expressionAssetIds:[]};lib.characters.push(work);
      if(shared){
        const companion=TAFolderImport.makeBook(book,'Shared guide',true);companion.id='shared-guide';
        work.embeddedBookId=companion.id;lib.worldBooks.push(companion);
        lib.characters.push({...work,id:'other-character',name:'Other reader'});
      }
      await TAUI.commitLibrary(TAStore.verify(lib),[],true);TAUI.state.sel.character=id;TAUI.go('characters');
    },id,raw,shared);
    await wait(()=>!!document.querySelector('[data-card-sync] [data-sync-open]'),'character sync toolbar');
  }
  async function edit(value){
    await run(()=>{if(!document.querySelector('#char-form [data-field=description]')?.getClientRects().length)document.querySelector('[data-act=view-edit]')?.click();});
    await input('#char-form [data-field=description]',value);
    assert.ok(await run(()=>TAUI.flush()));
  }
  async function pngFilePicker(bytes){
    await run((bytes,name)=>{
      const pick=TAUI.pickFile;TAUI.pickFile=async()=>{
        TAUI.pickFile=pick;return new File([Uint8Array.from(bytes)],name,{type:'image/png'});
      };
    },bytes,pngFile);
  }

  const basePng=card('Shared original');
  basePng.data.character_book={name:'Guide',entries:[{id:0,keys:['beacon'],content:'Shared entry'}]};
  await seed(0,basePng,true);
  const png=await run(async base=>{
    const canvas=document.createElement('canvas');canvas.width=400;canvas.height=360;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#283d95';ctx.fillRect(0,0,400,360);
    const pngBytes=async canvas=>new Uint8Array(await (await new Promise(ok=>canvas.toBlob(ok,'image/png'))).arrayBuffer());
    const raw=await pngBytes(canvas);
    // Reproduce v0.6.0's JPEG encoder independently of the current scanner.
    const bitmap=await createImageBitmap(new Blob([raw],{type:'image/png'}));
    const small=document.createElement('canvas'),scale=Math.min(1,192/bitmap.width,256/bitmap.height);
    small.width=Math.round(bitmap.width*scale);small.height=Math.round(bitmap.height*scale);
    const painter=small.getContext('2d');painter.fillStyle='#212420';painter.fillRect(0,0,small.width,small.height);
    painter.drawImage(bitmap,0,0,small.width,small.height);bitmap.close();
    const oldJpeg=small.toDataURL('image/jpeg',.8);
    small.width=13;small.height=9;painter.fillStyle='#d57328';painter.fillRect(0,0,13,9);
    const manualJpeg=small.toDataURL('image/jpeg',.8);
    ctx.fillStyle='#427637';ctx.fillRect(0,0,400,360);const changed=await pngBytes(canvas);
    const v2=structuredClone(base),v3=structuredClone(base);
    v2.data.description='Only in v2';v3.data.description='Preferred v3';
    v3.spec='chara_card_v3';v3.spec_version='3.0';
    for(const item of [v2,v3])item.data.character_book.entries[0].content='Embedded revision';
    return {bytes:Array.from(TAPng.writeCardVariants(raw,{chara:v2,ccv3:v3})),art:await TAPng.portraitFingerprint(raw),
      original:Array.from(TAPng.writeCardVariants(raw,{chara:base})),changed:Array.from(TAPng.writeCardVariants(changed,{chara:base})),oldJpeg,manualJpeg};
  },basePng);
  async function localJpeg(id,dataUrl,marker=false){
    await run(async(id,dataUrl,hash,marker)=>{
      const lib=TAUI.state.lib,card=TAStore.byId(lib.characters,0);
      const asset={id,name:'Synthetic JPEG',kind:'avatar',mime:'image/jpeg',bytes:Math.ceil(dataUrl.length*.75),dataUrl,
        ...(marker?{folderPortraitPreview:true}:{})};
      await TAUI.commitLibrary({...lib,assets:[...lib.assets.filter(item=>item.id!==id),asset],
        characters:lib.characters.map(item=>item===card?{...card,avatarAssetId:id,folderPortraitHash:hash}:item)});
      TAUI.renderStage();
    },id,dataUrl,png.art,marker);
  }
  const portraitChoices=()=>run(()=>{
    const field=document.querySelector('[data-sync-choice="@portrait"]');
    return {kind:field.closest('section').dataset.syncKind,options:Array.from(field.options,o=>o.value),
      current:field.value,blocked:document.querySelector('[data-act=sync-apply]').disabled};
  });
  await localJpeg('legacy-portrait',png.oldJpeg);
  await pngFilePicker(png.changed);await click(on);await modal();
  assert.deepEqual(await portraitChoices(),{kind:'conflict',options:['','local','disk'],current:'',blocked:true});
  assert.ok(await run(()=>document.querySelector('[data-sync-review]').textContent.includes(TAUI.t('card.unverifiedThumbnail'))));
  await click('[data-act=no]');await done();
  await localJpeg('marked-preview',png.oldJpeg,true);
  await pngFilePicker(png.changed);await click(on);await modal();
  assert.deepEqual((await portraitChoices()).options,['disk']);
  await click('[data-act=no]');await done();
  await localJpeg('chosen-by-user',png.manualJpeg);
  // Exercise the preallocated decoder used by browsers without Uint8Array.fromBase64.
  await run(()=>{window.qaBase64=Uint8Array.fromBase64;Uint8Array.fromBase64=undefined;});
  await pngFilePicker(png.original);await click(on);await modal();
  assert.deepEqual(await portraitChoices(),{kind:'conflict',options:['','local','disk'],current:'',blocked:true});
  assert.ok(await run(()=>!document.querySelector('[data-sync-review]').textContent.includes(TAUI.t('card.thumbnail'))));
  await click('[data-sync-all=local]');
  const custom=await download(confirm);await done();
  await run(()=>{if(window.qaBase64)Uint8Array.fromBase64=window.qaBase64;else delete Uint8Array.fromBase64;});
  assert.deepEqual(await run(async bytes=>{
    const png=await createImageBitmap(new Blob([Uint8Array.from(bytes)],{type:'image/png'}));
    const size=[png.width,png.height];png.close();return size;
  },Array.from(custom.bytes)),[13,9]);
  await click('[data-card-sync] [data-sync-unlink]');await click('[data-act=unlink]');await done();
  await localJpeg('legacy-portrait',png.oldJpeg);
  await pngFilePicker(png.bytes);await click(on);
  await wait(()=>!!document.querySelector('[data-card-variants]'),'PNG edition chooser');
  await click('[data-card-variants] details summary');
  await wait(()=>document.querySelector('[data-card-variants]')?.innerText.includes('Only in v2') && document.querySelector('[data-card-variants]')?.innerText.includes('Preferred v3'),'both authored variant values');
  await click('[data-act=no]');await done();assert.equal(await record(0),null);
  assert.equal(await run(()=>TAUI.state.lib.characters[0].description),'Shared original');
  await pngFilePicker(png.bytes);await click(on);
  await wait(()=>!!document.querySelector('[data-card-variants]'),'edition choice on second open');
  await click('[data-act=ccv3]');await modal();
  assert.ok(await run(()=>document.querySelector('[data-act=sync-apply]').disabled));
  assert.deepEqual(await run(()=>Array.from(document.querySelector('[data-sync-choice="@portrait"]').options,o=>o.value)),['disk']);
  await run(()=>document.querySelector('[data-sync-choice="@portrait"]').closest('section').querySelector('summary').click());
  await wait(()=>document.querySelectorAll('.card-sync-images img').length===2,'local and source portrait previews');
  await click('[data-sync-all=disk]');
  const mergedPng=await download(confirm);await done();assert.equal(mergedPng.filename,pngFile);
  const afterPng=await run(async(bytes)=>{
    const lib=TAUI.state.lib,work=TAStore.byId(lib.characters,0),other=TAStore.byId(lib.characters,'other-character');
    const image=Uint8Array.from(bytes),variants=TAPng.cardVariants(image);
    const bytesOf=asset=>Uint8Array.from(atob(asset.dataUrl.split(',')[1]),c=>c.charCodeAt(0));
    return {rewritten:[variants.chara.data.description,variants.ccv3.data.description],portrait:await TAPng.portraitFingerprint(image),
      local:work.description,art:await TAPng.portraitFingerprint(bytesOf(TAStore.byId(lib.assets,work.avatarAssetId))),
      old:other.embeddedBookId,fresh:work.embeddedBookId,shared:TAStore.byId(lib.worldBooks,other.embeddedBookId).entries[0].content,
      embedded:TAStore.byId(lib.worldBooks,work.embeddedBookId).entries[0].content};
  },Array.from(mergedPng.bytes));
  assert.deepEqual(afterPng.rewritten,['Preferred v3','Preferred v3']);assert.equal(afterPng.local,'Preferred v3');
  assert.equal(afterPng.portrait,png.art);assert.equal(afterPng.art,png.art);
  assert.notEqual(afterPng.fresh,afterPng.old);assert.equal(afterPng.shared,'Shared entry');assert.equal(afterPng.embedded,'Embedded revision');
  assert.equal((await record(0)).ownedBookId,afterPng.fresh);

  const id='json-browser',base=card('Original');await seed(id,base);
  await file(base,jsonFile);await click(on);await modal();await click(confirm);await done();
  await edit('Local manuscript');const external=card('First disk revision');
  await file(external,jsonFile);await click(on);await modal();await click('[data-sync-all=local]');
  const merged=await download(confirm);await done();
  assert.equal(merged.filename,jsonFile);assert.equal(JSON.parse(merged.bytes).data.description,'Local manuscript');
  assert.equal((await record(id)).needsVerify,true);
  await edit(external.data.description);
  const nextDisk=card('A later disk revision');
  for(const [width,lang] of [[1152,'en'],[1024,'zh'],[850,'ja'],[700,'ko'],[500,'th'],[390,'ru']]){
    win.setContentSize(width,760);
    await run(lang=>{TAI18n.save({lang});TAI18n.apply();TAUI.renderStage();},lang);
    await file(nextDisk,jsonFile);await click(on);await modal();
    assert.ok(await run(()=>!!document.querySelector('[data-sync-kind=conflict]') && document.querySelector('[data-act=sync-apply]').disabled),
      'the pending export cannot authorize overwriting a new local edit');
    const widths=await run(async()=>{
      await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
      const pane=document.querySelector('[data-sync-review]');
      return [pane.clientWidth,pane.scrollWidth,document.documentElement.scrollWidth,innerWidth];
    });
    assert.ok(widths[0]>0 && widths[1]<=widths[0]+1 && widths[2]<=widths[3]+1,lang+' @ '+width+': '+widths.join('/'));
    await click('[data-act=no]');await done();
  }
  win.setContentSize(1280,900);
  await run(()=>{TAI18n.save({lang:'en'});TAI18n.apply();TAUI.renderStage();});
  await file(JSON.parse(merged.bytes),jsonFile);await click(on);await modal();
  assert.ok(await run(()=>!!document.querySelector('[data-sync-kind=local]') && !document.querySelector('[data-sync-kind=conflict]')));
  await run(()=>{const choice=document.querySelector('[data-sync-choice]');choice.value='disk';choice.dispatchEvent(new Event('change'));});
  await click(confirm);await done();assert.equal((await record(id)).needsVerify,false);
  assert.equal(await run(()=>TAUI.state.lib.characters[0].description),'Local manuscript');

  const nativeId='desktop-card';await seed(nativeId,base);
  async function bridge(initial=false){
    await run(async(raw,name,initial)=>{
      const key='qa-card-disk',target='synthetic-device-grant';
      const put=value=>localStorage.setItem(key,JSON.stringify({...value,bytes:Array.from(value.bytes)}));
      const get=()=>{const value=JSON.parse(localStorage.getItem(key));return {...value,bytes:Uint8Array.from(value.bytes)};};
      if(initial){
        const bytes=new TextEncoder().encode(JSON.stringify(raw));put({target,name,bytes,hash:await TAFileSync.digest(bytes),receipt:null,canRestore:false});
      }
      window.qaCardDisk=get;
      window.nijanDesktop={cardSyncPick:async()=>get(),cardSyncRead:async()=>get(),cardSyncWrite:async(_target,expected,bytes,operationId)=>{
        const old=get();if(old.hash!==expected)throw {code:'card-sync-changed'};
        const hash=await TAFileSync.digest(bytes);
        put({...old,hash,bytes,receipt:{kind:'write',operationId,hash},canRestore:true});
        if(window.qaLoseAcknowledgment){window.qaLoseAcknowledgment=false;throw Error('Synthetic interruption after writing');}
        if(window.qaHoldAcknowledgment)await new Promise(ok=>{window.qaResumeCardWrite=ok;});
        return get();
      }};
      TAUI.go('characters');
    },base,jsonFile,initial);
  }
  await bridge(true);await click(on);await modal();await click(confirm);await done();
  await edit('Recovered after restart');await click(on);await modal();
  await run(()=>{window.qaLoseAcknowledgment=true;});await click(confirm);await done();
  assert.ok((await record(nativeId)).pending);
  await open('characters');await bridge();await click(on);await done();
  assert.equal((await record(nativeId)).pending,undefined);
  assert.ok((await record(nativeId)).lastWrite);
  assert.equal(await run(()=>JSON.parse(new TextDecoder().decode(qaCardDisk().bytes)).data.description),'Recovered after restart');
  const backup=await run(async()=>JSON.stringify(await TALibraryDB.workingState(true)));
  assert.ok(!backup.includes('synthetic-device-grant') && !backup.includes((await record(nativeId)).lastWrite));
  await edit('Reviewed edition');await click(on);await modal();
  await run(()=>{window.qaHoldAcknowledgment=true;});await click(confirm);
  await wait(()=>!!window.qaResumeCardWrite,'file written while the final acknowledgment is held');
  await edit('Edited while the receipt was in flight');
  await run(()=>window.qaResumeCardWrite());await done();
  assert.equal(await run(()=>TAUI.state.lib.characters[0].description),'Edited while the receipt was in flight');
  await click(on);await modal();assert.equal((await record(nativeId)).pending,undefined);
  assert.ok(await run(()=>!!document.querySelector('[data-sync-kind=conflict]') && document.querySelector('[data-act=sync-apply]').disabled));
  await click('[data-act=no]');await done();
  assert.equal(await run(()=>JSON.parse(new TextDecoder().decode(qaCardDisk().bytes)).data.description),'Reviewed edition');
  console.log('Character editor verified PNG edition choices, original portraits, shared embedded books, Web downloads, six responsive languages, private links, restart recovery and concurrent manuscript edits.');
});
