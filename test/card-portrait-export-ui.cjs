'use strict';
const assert = require('node:assert/strict');
const {unzipSync} = require('fflate');
const suite = require('./desktop-fixture.cjs');
require('../js/png.js');

suite('portrait-export',async ({open,run,click,wait,download}) => {
  await open('characters');
  const pictures = await run(() => {
    const canvas = document.createElement('canvas');
    canvas.width=2061; canvas.height=17;
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#1865c6'; ctx.fillRect(500,0,1561,17);
    const png=canvas.toDataURL(), webp=canvas.toDataURL('image/webp'), jpeg=canvas.toDataURL('image/jpeg');
    if(!webp.startsWith('data:image/webp;'))throw Error('WebP encoder unavailable');
    canvas.width=36; canvas.height=24; ctx.fillStyle='#c97632'; ctx.fillRect(0,0,36,24);
    return {png,webp,jpeg,disk:canvas.toDataURL()};
  });
  const bytes = url => Buffer.from(url.split(',')[1],'base64');
  const fixtureCard = {spec:'chara_card_v2',spec_version:'2.0',data:{
    name:'Painter',description:'A synthetic painter.',creator:'Fixture artist',system_prompt:'Paint the station.',
    post_history_instructions:'Keep the scene quiet.',extensions:{quilvori_source:{
      author:{name:'Fixture artist'},postUrl:'https://example.org/art',license:{status:'personal'}}},
    character_book:{name:'Station',entries:[{id:0,keys:['platform'],content:'The east platform.',enabled:true}]},
  }};
  const remote=structuredClone(fixtureCard);remote.data.post_history_instructions='Earlier draft';
  const original=Buffer.from(TAPng.embedChara(bytes(pictures.disk),JSON.stringify(remote)));
  const pngButton='[data-act=png]', zipButton='[data-zip]', syncButton='[data-card-sync] [data-sync-open]';
  const replace='[data-portrait-replace]', saveText='[data-portrait-json]';

  async function seed(portrait) {
    await run(async (raw,url) => {
      TAI18n.save({lang:'en'});
      const lib=TAStore.emptyLibrary(),{book,...character}=TAFormats.cardToCharacter(raw);
      const companion=TAFolderImport.makeBook(book,'Station',true);
      const work={...character,id:0,embeddedBookId:companion.id,avatarAssetId:url===null?null:0,expressionAssetIds:[]};
      lib.characters=[work,{...work,id:'sibling',name:'Sibling'}];lib.worldBooks=[companion];
      if(url!==null)lib.assets=[{id:0,name:'Fixture portrait',kind:'avatar',mime:'image/png',dataUrl:url}];
      await TAUI.commitLibrary(TAStore.verify(lib),[],true);
      TAUI.state.sel.character=0;TAUI.state.cardView='edit';TAUI.go('characters');
      window.portraitDownloads=[];
      if(!window.hasPortraitListener){
        window.hasPortraitListener=true;
        document.addEventListener('tavern-export',e=>window.portraitDownloads.push(e.detail.filename));
      }
      document.querySelector('#st-bundle').open=true;
    },fixtureCard,portrait);
  }
  async function pickSync() {
    await run(payload=>{
      const pick=TAUI.pickFile;
      TAUI.pickFile=async()=>{TAUI.pickFile=pick;return new File([Uint8Array.from(atob(payload),c=>c.charCodeAt(0))],'Painter.png',{type:'image/png'});};
    },original.toString('base64'));
    await click(syncButton);
  }
  function manuscript(raw) {
    assert.equal(raw.data.name,fixtureCard.data.name);assert.equal(raw.data.creator,fixtureCard.data.creator);
    assert.equal(raw.data.system_prompt,fixtureCard.data.system_prompt);
    assert.equal(raw.data.post_history_instructions,fixtureCard.data.post_history_instructions);
    assert.equal(raw.data.character_book.entries[0].content,fixtureCard.data.character_book.entries[0].content);
    assert.equal(raw.data.extensions.quilvori_source.postUrl,fixtureCard.data.extensions.quilvori_source.postUrl);
  }
  const art=png=>Buffer.from(TAPng.portraitBytes(png));
  async function pixels(png) {
    return run(async data=>{
      const image=await createImageBitmap(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'}));
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);image.close();
      return {width:canvas.width,height:canvas.height,alpha:ctx.getImageData(0,0,1,1).data[3],
        blue:ctx.getImageData(canvas.width-1,0,1,1).data[2]};
    },Buffer.from(png).toString('base64'));
  }
  for(const [kind,url] of [
    ['native',pictures.png], ['png-labelled-jpeg',pictures.png.replace('image/png','image/jpeg')],
    ['card-as-portrait','data:image/png;base64,'+Buffer.from(TAPng.embedChara(bytes(pictures.png),JSON.stringify(remote))).toString('base64')],
    ['webp-labelled-png',pictures.webp.replace('image/webp','image/png')],
    ['jpeg-labelled-png',pictures.jpeg.replace('image/jpeg','image/png')], ['no-avatar',null],
  ]){
    await seed(url);
    const exported=(await download(pngButton)).bytes; manuscript(JSON.parse(TAPng.readChara(exported)));
    const archive=unzipSync((await download(zipButton)).bytes), bundled=archive['characters/Painter.png'];
    manuscript(JSON.parse(TAPng.readChara(bundled)));assert.deepEqual(art(bundled),art(exported),kind+' ZIP portrait');
    assert.ok(archive['worlds/Station.json']);
    assert.equal(await run(()=>TAUI.state.lib.assets[0]?.dataUrl ?? null),url,'export leaves the selected asset intact');
    const image=await pixels(exported);
    if(url!==null){
      assert.deepEqual([image.width,image.height],[2061,17],kind+' original dimensions');
      assert.equal(image.alpha,kind==='jpeg-labelled-png'?255:0,kind+' alpha');
      assert.ok(image.blue>175,kind+' opaque pixels survived');
      if(['native','png-labelled-jpeg','card-as-portrait'].includes(kind))assert.deepEqual(art(exported),bytes(pictures.png));
    }else assert.deepEqual([image.width,image.height],[512,512],'no selected avatar uses the existing seal');
    await pickSync();await wait(()=>!!document.querySelector('[data-sync-review]'),'portrait review');
    await click('[data-act=no]');assert.equal(await run(()=>TALibraryDB.workBinding('characters',0)),null);
    await pickSync();await wait(()=>!!document.querySelector('[data-sync-review]'),'confirmed review');
    await click('[data-sync-all=local]');
    const merged=(await download('[data-act=sync-apply]')).bytes;manuscript(JSON.parse(TAPng.readChara(merged)));
    assert.deepEqual(art(merged),url===null?bytes(pictures.disk):art(exported),kind+' sync portrait');
  }

  const broken='data:image/png;base64,AAEC';
  await seed(broken);await click(pngButton);
  await wait(()=>!!document.querySelector('[data-portrait-json]'),'broken image recovery');
  await click(zipButton);
  await wait(()=>document.querySelector('[data-bundle-status]').textContent.includes('portrait'),'bundle recovery');
  await pickSync();
  await wait(()=>document.querySelector('[data-sync-status]').textContent.includes('portrait'),'sync recovery');
  assert.equal(await run(()=>TALibraryDB.workBinding('characters',0)),null);
  assert.deepEqual(await run(()=>portraitDownloads),[]);
  manuscript(JSON.parse((await download(saveText)).bytes.toString()));
  await run(()=>{const pick=TAUI.pickFile;TAUI.pickFile=async()=>{TAUI.pickFile=pick;return null;};});
  await click(replace);assert.equal(await run(()=>TAUI.state.lib.characters[0].avatarAssetId),0);
  await run(data=>{const pick=TAUI.pickFile;TAUI.pickFile=async()=>{TAUI.pickFile=pick;
    return new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],'Fixed portrait.png',{type:'image/png'});};
  },bytes(pictures.webp).toString('base64'));
  await click(replace);
  await wait(()=>TAUI.state.lib.characters[0].avatarAssetId!==0 && !document.querySelector('[data-portrait-replace]'),'replacement saved');
  assert.deepEqual(await run(()=>[TAUI.state.lib.assets[0].dataUrl,TAUI.state.lib.characters[1].avatarAssetId]),[broken,0]);
  assert.equal(await run(async()=>(await TAHistory.list('characters',0))[0].value.avatarAssetId),0);
  manuscript(JSON.parse(TAPng.readChara((await download(pngButton)).bytes)));

  // A PNG signature and readable dimensions do not make a truncated PNG a valid export.
  await seed('data:image/jpeg;base64,'+bytes(pictures.png).subarray(0,-12).toString('base64'));
  await click(pngButton);await wait(()=>!!document.querySelector('[data-portrait-json]'),'truncated native PNG');
  assert.deepEqual(await run(()=>portraitDownloads),[]);
  const svg='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="70" height="30"><rect width="70" height="30" fill="blue"/></svg>');
  await seed(svg);
  assert.equal((await pixels((await download(pngButton)).bytes)).width,70,'legacy library SVG remains readable');
  assert.equal(await run(async b64=>(await TAPortraitImage.read('data:application/octet-stream;base64,'+encodeURIComponent(b64))).width,
    pictures.png.split(',')[1]),2061,'escaped base64 keeps the native PNG dimensions');
  await seed(broken);await click('[data-act=view-gallery]');await click(pngButton);
  await wait(()=>!!document.querySelector('[data-portrait-json]'),'gallery recovery');
  await run(()=>{const search=document.querySelector('[data-gallery-search]');search.value='Sibling';search.dispatchEvent(new Event('input'));});
  assert.ok(await run(()=>document.querySelector('[data-act=png]').disabled && !document.querySelector('[data-portrait-json]')),
    'recovery controls follow the visible gallery selection');
  console.log('Exact PNG chunks, full-size JPEG/WebP, transparent pixels, ZIP, confirmed sync, original manuscripts and damaged-portrait recovery passed.');
});
