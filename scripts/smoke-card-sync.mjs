import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import nativeFiles from '../electron/card-sync.js';
import '../js/png.js';

function chunk(type,data) {
  const raw=Buffer.alloc(12+data.length);raw.writeUInt32BE(data.length);raw.write(type,4,4,'ascii');
  data.copy(raw,8);raw.writeUInt32BE(TAPng.crc32(raw.subarray(4,-4)),raw.length-4);return raw;
}
function portrait(width,height,colors) {
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);
  header[8]=8;header[9]=2; // RGB, eight bits per component.
  const stride=1+width*3,pixels=Buffer.alloc(stride*height);
  for(let y=0;y<height;y++){
    const rgb=colors[Math.floor(y/64)%colors.length];
    pixels.fill(rgb,y*stride+1,(y+1)*stride);
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
const originalCover=portrait(512,768,[Buffer.from([40,109,122]),Buffer.from([43,63,72])]);
const newCover=portrait(640,960,[Buffer.from([143,66,85]),Buffer.from([239,181,128])]);
const png=(card,image)=>Buffer.from(TAPng.embedChara(image,JSON.stringify(card)));
const readCard=bytes=>TAPng.cardVariants(bytes).chara;

export async function cardSyncFixture({scratch,profile,web,tavern}) {
  const filename='Quilvori acceptance guide.png',alternate='Quilvori acceptance guide alternate.png';
  const chats=['Beacon watch','Earlier crossing'],name='Quilvori harbor guide';
  const continuation='I am continuing the original beacon watch after updating the character.';
  const transcripts=chats.map((label,index)=>[
    {user_name:'Reader',character_name:name,create_date:'2025-01-01T10:00:00.000Z',
      chat_metadata:{integrity:'quilvori-fixture-'+index}},
    {name,is_user:false,is_system:false,send_date:'2025-01-01T10:01:00.000Z',mes:label+' was recorded before the card edit.',extra:{}},
  ]);
  const base={spec:'chara_card_v2',spec_version:'2.0',chat:chats[0],create_date:'2025-01-01T00:00:00.000Z',data:{
    name,description:'Charts the morning tide.',personality:'Attentive',scenario:'The beacon at dawn.',first_mes:'Welcome aboard.',
    mes_example:'',creator_notes:'',system_prompt:'',post_history_instructions:'',alternate_greetings:[],
    tags:['harbor'],creator:'Package fixture',character_version:'1',extensions:{fixturePublisher:{edition:3}},
    character_book:{name:'Beacon ledger',extensions:{fixtureVolume:1},entries:[{id:19,keys:['beacon'],secondary_keys:[],
      comment:'Lamp',content:'The lamp turns at dusk.',enabled:true,insertion_order:100,position:'before_char',
      extensions:{fixtureIndex:{shelf:4}}}]},
  }};
  const other=structuredClone(base);other.data.scenario='The beacon in winter.';
  other.data.character_book.entries.push({id:31,keys:['winter beacon'],secondary_keys:[],comment:'Winter signal',
    content:'A blue lamp marks the winter channel.',enabled:true,insertion_order:110,position:'before_char',extensions:{fixtureIndex:{shelf:9}}});
  const combined=structuredClone(other);combined.data.description='Charts the evening tide.';
  const neighbor=structuredClone(base);neighbor.data.description='A separate card with the same display name.';
  const cards=tavern?.cards || path.join(scratch,'characters'),chatRoot=tavern?.chats || path.join(scratch,'chats');
  const file=path.join(cards,filename),sibling=path.join(cards,alternate);
  const chatDir=path.join(chatRoot,path.parse(filename).name),chatFiles=chats.map(chat=>path.join(chatDir,chat+'.jsonl'));
  await mkdir(cards,{recursive:true});await mkdir(profile,{recursive:true});await mkdir(chatDir,{recursive:true});
  const original=png(base,originalCover),neighborBytes=png(neighbor,originalCover),outsideEdit=png(other,newCover);
  await writeFile(file,original);await writeFile(sibling,neighborBytes);
  for(const [index,chat] of chats.entries()){
    if(tavern)await tavern.writeChat(filename,chat,transcripts[index]);
    else await writeFile(chatFiles[index],transcripts[index].map(message=>JSON.stringify(message)).join('\n'));
  }
  const previousChats=await Promise.all(chatFiles.map(chat=>readFile(chat)));
  const grant=web?null:await nativeFiles.createCardSync(profile).bind(file);
  let localId;

  async function verify(expected) {
    const actual=await readFile(file);
    const document=readCard(actual);
    assert.deepEqual(document.data,expected.data);
    assert.equal(document.chat,chats[0]);assert.equal(document.create_date,base.create_date);
    assert.deepEqual(Buffer.from(TAPng.portraitBytes(actual)),expected===base?originalCover:newCover);
    assert.deepEqual(await readFile(sibling),neighborBytes);
    assert.deepEqual(await Promise.all(chatFiles.map(chat=>readFile(chat))),previousChats);
    if(tavern){
      const primary=await tavern.readCard(filename),second=await tavern.readCard(alternate);
      assert.equal(primary.avatar,filename);assert.equal(primary.data.description,expected.data.description);
      assert.equal(primary.data.scenario,expected.data.scenario);assert.equal(primary.chat,chats[0]);
      assert.deepEqual(primary.data.character_book,expected.data.character_book);
      assert.equal(second.avatar,alternate);assert.equal(second.name,primary.name);assert.equal(second.data.description,neighbor.data.description);
      const list=await tavern.listChats(filename);assert.deepEqual(list.map(row=>row.file_id).sort(),[...chats].sort());
      for(const [i,chat] of chats.entries())assert.deepEqual(await tavern.readChat(filename,chat),transcripts[i]);
    }
  }
  async function compare({read,click,waitFor},bytes) {
    if(web)await read((data,name)=>{
      const old=TAUI.pickFile;TAUI.pickFile=async()=>{
        TAUI.pickFile=old;return new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],name,{type:'image/png'});
      };
    },bytes.toString('base64'),filename);
    await click('[data-card-sync] [data-sync-open]');await waitFor('[data-sync-review]');
  }
  async function exercise(ctx) {
    const {read,click,edit,until}=ctx;
    await verify(base);
    localId=await read(async(data,name,grant)=>{
      const file=new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],name,{type:'image/png'});
      const {card}=await TAFolderImport.importDocument('character',file);
      // Seed only the OS picker grant. Reads, confirmed writes and restores traverse the shipped preload and main process.
      if(grant)await TAUI.commitLibrary(TAUI.state.lib,[],false,null,{scopes:[['meta']],fileBinding:{
        kind:'characters',id:card.id,expected:null,next:{stamp:'picked',target:grant.target,name:grant.name},
      }});
      TAUI.state.sel.character=card.id;TAUI.state.cardView='edit';TAUI.go('characters');
      return card.id;
    },original.toString('base64'),filename,grant && {target:grant.target,name:grant.name});
    await compare(ctx,original);await click('[data-act=sync-apply]');
    await until(()=>read(async id=>!!(await TALibraryDB.workBinding('characters',id))?.base,localId),'initial common character revision');
    await edit('[data-field="description"]',combined.data.description);
    assert.equal(await read(()=>TAUI.flush()),true);
    await writeFile(file,outsideEdit);await compare(ctx,outsideEdit);
    const kinds=await read(()=>[...document.querySelectorAll('[data-sync-kind]')].map(row=>row.dataset.syncKind));
    assert.ok(kinds.filter(kind=>kind==='disk').length>=3 && kinds.includes('local') && !kinds.includes('conflict'));
    await click('[data-act=sync-apply]');
    await until(()=>read((id,text)=>TAUI.state.lib.characters.find(card=>card.id===id)?.scenario===text,localId,other.data.scenario),'incoming character field in Quilvori');
    if(web){
      const outgoing=await ctx.download(filename);
      assert.equal(readCard(outgoing).data.description,combined.data.description);
      assert.equal(await read(async id=>(await TALibraryDB.workBinding('characters',id)).needsVerify,localId),true);
      assert.deepEqual(await readFile(file),outsideEdit);
      // Install the actual browser download into the selected, disposable ST slot and reselect it.
      await writeFile(file,outgoing);await compare(ctx,await readFile(file));await click('[data-act=sync-apply]');
      await until(()=>read(async id=>(await TALibraryDB.workBinding('characters',id)).needsVerify===false,localId),'installed PNG verified in browser');
    }
    await verify(combined);
    await read(()=>TAUI.go('home'));
  }
  async function reopen(ctx) {
    const {read,click,until}=ctx;
    await read(id=>{TAUI.state.sel.character=id;TAUI.state.cardView='edit';TAUI.go('characters');},localId);
    const loaded=await read(async id=>{
      const card=TAUI.state.lib.characters.find(row=>row.id===id);
      const book=TAUI.state.lib.worldBooks.find(row=>row.id===card.embeddedBookId);
      const asset=TAUI.state.lib.assets.find(row=>row.id===card.avatarAssetId);
      const source=Uint8Array.from(atob(asset.dataUrl.split(',')[1]),c=>c.charCodeAt(0));
      return {description:card.description,scenario:card.scenario,entries:book.entries.map(entry=>entry.content),
        cover:await TACardSync.portraitFingerprint(source)};
    },localId);
    assert.deepEqual(loaded,{description:combined.data.description,scenario:combined.data.scenario,
      entries:combined.data.character_book.entries.map(entry=>entry.content),cover:await TAPng.portraitFingerprint(newCover)});
    if(!web){
      await until(()=>read(()=>document.querySelector('[data-card-sync] [data-sync-undo]')?.hidden===false),'character-file backup after restart');
      await click('[data-card-sync] [data-sync-undo]');await click('[data-act=undo-file]');
      await until(()=>read(async id=>{const record=await TALibraryDB.workBinding('characters',id);return record && !record.pending && !record.lastWrite;},localId),'confirmed character-file restore');
      assert.deepEqual(await readFile(file),outsideEdit);await verify(other);
      assert.equal(await read(id=>TAUI.state.lib.characters.find(card=>card.id===id).description,localId),combined.data.description);
    }else await verify(combined);
    await read(()=>TAUI.go('home'));
  }
  async function continued() {
    const saved=await tavern.readChat(filename,chats[0]);
    assert.deepEqual(saved.slice(1).map(row=>[row.is_user,row.mes]),[[false,transcripts[0][1].mes],[true,continuation]]);
    assert.equal(saved[0].chat_metadata.integrity,transcripts[0][0].chat_metadata.integrity);
    assert.deepEqual(await readFile(chatFiles[1]),previousChats[1]);
    transcripts[0]=saved;previousChats[0]=await readFile(chatFiles[0]);
    await verify(combined);
  }
  function editor(doc,append=false) {
    return {filename,name,description:doc.data.description,scenario:doc.data.scenario,
      chat:chats[0],messages:transcripts[0].slice(1).map(row=>row.mes),append:append?continuation:null};
  }
  return {exercise,reopen,continued,afterWrite:()=>editor(combined,true),afterReopen:()=>editor(web?combined:other)};
}
