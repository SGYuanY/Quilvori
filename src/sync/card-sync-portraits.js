/* Compare original image data separately from card text and gallery thumbnails. */
(function(root) {
  'use strict';
  const core=()=>root.TACardSync;
  const invalid=()=>Object.assign(new Error('card.image'),{code:'card.image'});
  const portraitKey='@portrait';

  function assetBlob(asset) {
    const match=/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]*)$/i.exec(asset?.dataUrl || '');
    if(!match)throw invalid();
    let bytes;
    try {
      if(typeof Uint8Array.fromBase64==='function')bytes=Uint8Array.fromBase64(match[2]);
      else {
        const raw=atob(match[2]);bytes=new Uint8Array(raw.length);
        for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      }
    }catch {throw invalid();}
    return new Blob([bytes],{type:match[1].toLowerCase()});
  }
  async function bitmap(blob) {
    try {return await createImageBitmap(blob);} catch {throw invalid();}
  }
  async function asPng(image) {
    const canvas=document.createElement('canvas');
    canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext('2d');
    if(!context)throw invalid();
    context.drawImage(image,0,0);
    const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!png)throw invalid();
    return new Uint8Array(await png.arrayBuffer());
  }
  function makeRow(kind,base,local,disk,allowedSides) {
    return {key:portraitKey,field:'portrait',kind,uid:null,label:'',
      base,local,disk,basePresent:!!base,localPresent:!!local,diskPresent:true,allowedSides};
  }
  async function inspect(snapshot,decoded,record,baseArt,baseLocalArt) {
    if(decoded.format!=='png')return null;
    const disk=await core().portraitFingerprint(decoded.bytes), asset=snapshot.asset;
    const result={disk,diskBlob:new Blob([core().portraitBytes(decoded.bytes)],{type:'image/png'}),
      local:null,localBlob:null,localBytes:null,preferDisk:false,row:null};
    if(!asset?.dataUrl){
      result.preferDisk=true;
      result.row=makeRow('disk',baseArt,null,disk,['disk']);
      return result;
    }
    const blob=assetBlob(asset);
    result.localBlob=blob;
    let preview=asset.folderPortraitPreview===true;
    const oldScan=record?.localArtId==null && snapshot.card.folderPortraitHash && blob.type==='image/jpeg';
    if(!preview && blob.type!=='image/png') {
      const image=await bitmap(blob);
      try {
        if(oldScan && image.width<=192 && image.height<=256){
          if(snapshot.card.folderPortraitHash===disk){
            const generated=await root.TAFolderImport.makeAvatar(decoded.bytes);
            const payload=url=>url.slice(url.indexOf(',')+1).replace(/\s/g,'');
            preview=payload(generated.dataUrl)===payload(asset.dataUrl);
          }else result.unverifiedThumbnail=true;
        }
        if(!preview)result.localBytes=await asPng(image);
      } finally {image.close();}
    }else if(!preview)result.localBytes=core().portraitBytes(new Uint8Array(await blob.arrayBuffer()));
    if(preview){
      result.preferDisk=true;result.thumbnail=true;
      result.row=makeRow('disk',baseArt,null,disk,['disk']);
      return result;
    }
    result.local=await core().portraitFingerprint(result.localBytes);
    if(result.unverifiedThumbnail){
      result.row=makeRow('conflict',baseArt,result.local,disk,['local','disk']);
      return result;
    }
    // A replaced PNG can retain safe vendor chunks from its destination. Keep both
    // verified fingerprints, since the local source and the installed image can then differ.
    const unchanged=baseArt===disk && baseLocalArt===result.local;
    if(result.local!==disk && !unchanged){
      const kind=baseArt===disk?'local':baseLocalArt===result.local?'disk':'conflict';
      result.row=makeRow(kind,baseArt,result.local,disk,['local','disk']);
    }
    return result;
  }
  async function makeAsset(id,name,bytes) {
    const png=core().portraitBytes(bytes), blob=new Blob([png],{type:'image/png'});
    const image=await bitmap(blob);image.close();
    return {id,name,kind:'avatar',dataUrl:await root.TAUI.readDataUrl(blob),
      mime:blob.type,bytes:png.length,createdAt:new Date().toISOString()};
  }
  root.TACardPortraits={inspect,makeAsset,portraitKey};
})(globalThis);
