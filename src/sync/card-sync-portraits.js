/* Compare original image data separately from card text and gallery thumbnails. */
(function(root) {
  'use strict';
  const core=()=>root.TACardSync;
  const invalid=()=>Object.assign(new Error('card.image'),{code:'card.image'});
  const portraitKey='@portrait';

  async function bitmap(blob) {
    try {return await createImageBitmap(blob);} catch {throw invalid();}
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
    (await bitmap(result.diskBlob)).close();
    if(snapshot.card.avatarAssetId==null || snapshot.card.avatarAssetId===''){
      result.preferDisk=true;
      result.row=makeRow('disk',baseArt,null,disk,['disk']);
      return result;
    }
    const local=await root.TAPortraitImage.read(asset?.dataUrl || '');
    result.localBlob=new Blob([local.png],{type:'image/png'});
    let preview=asset.folderPortraitPreview===true;
    const oldScan=record?.localArtId==null && snapshot.card.folderPortraitHash && local.mime==='image/jpeg';
    if(!preview && oldScan && local.width<=192 && local.height<=256){
      if(snapshot.card.folderPortraitHash===disk){
        const generated=await root.TAFolderImport.makeAvatar(decoded.bytes);
        const payload=url=>url.slice(url.indexOf(',')+1).replace(/\s/g,'');
        preview=payload(generated.dataUrl)===payload(asset.dataUrl);
      }else result.unverifiedThumbnail=true;
    }
    if(preview){
      result.preferDisk=true;result.thumbnail=true;
      result.row=makeRow('disk',baseArt,null,disk,['disk']);
      return result;
    }
    result.localBytes=local.png;
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
