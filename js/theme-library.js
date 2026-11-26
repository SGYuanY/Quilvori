/* Imported presets live with the library. A preview never changes the active theme. */
(function(root){
  'use strict';
  const ui=()=>root.TAUI, tr=(key,vars)=>ui().t(key,vars);
  const messages={'theme-json':'主题 JSON 无法解析。','theme-format':'这个文件不是 SillyTavern 界面主题。','theme-css':'这个主题的样式需要在 SillyTavern 中预览。','theme-value':'主题内没有可用的外观设置。','theme-size':'主题 JSON 不能超过 2 MiB。','wallpaper-format':'请选择 PNG、JPEG 或 WebP 壁纸。','wallpaper-dimensions':'图片尺寸过大或无效。','wallpaper-save-size':'压缩后图片仍然过大。','wallpaper-decode':'图片无法解码。','too-large':'壁纸文件不能超过 12 MiB。','discord-message':'请从原帖下载 JSON 文件，或复制 JSON 附件的下载链接。'};
  function message(error){
    if(messages[error.code])return tr(messages[error.code]);
    return root.TALinkImportPanel?.message && error.code ? root.TALinkImportPanel.message(error) : tr(error.message || '主题导入失败');
  }
  function cleanSource(url){
    if(!String(url || '').trim())return '';
    const safe=root.TAResourceSource.sourceUrl(url);
    if(!safe || /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(safe))throw new Error('请填写原帖链接，附件下载地址另填。');
    return safe;
  }
  function fromText(text,filename,credit={}){
    const parsed=root.TAThemeFormat.parse(text,filename,{allowCssOnly:true});
    const raw=parsed.raw,meta=raw.quilvori_source || {};
    const url=credit.url || meta.postUrl || parsed.sourceUrl || '';
    let source='';try{source=cleanSource(url);}catch(_){}
    return {kind:'sillytavern',name:parsed.name,vars:parsed.vars,appearance:parsed.appearance,raw,
      skippedCSS:parsed.skippedCSS,cssOnly:!!parsed.cssOnly,useRoomPalette:false,backgroundAssetId:'',
      author:String(credit.author || meta.author?.name || parsed.author || '').slice(0,160),postUrl:source};
  }
  async function fromFile(file,credit){
    if(!file || file.size>root.TAThemeFormat.MAX_BYTES)throw Object.assign(new Error('theme-size'),{code:'theme-size'});
    return fromText(await file.text(),file.name,credit);
  }
  async function wallpaper(file){
    if(!file || file.size>root.TAWallpaperImport.MAX_BYTES)throw Object.assign(new Error('too-large'),{code:'too-large'});
    const prepared=await root.TAWallpaperImport.prepare(new Uint8Array(await file.arrayBuffer()));
    return {id:root.TAStore.uid('asset'),kind:'background',name:file.name,dataUrl:prepared.dataUrl,mime:prepared.mime,
      width:prepared.width,height:prepared.height,bytes:prepared.bytes,createdAt:new Date().toISOString()};
  }
  function external(theme){
    const raw=root.TAThemeFormat.edited(theme.raw,{name:theme.name});
    if(theme.author || theme.postUrl){
      raw.quilvori_source={...(typeof raw.quilvori_source==='object' && !Array.isArray(raw.quilvori_source)?raw.quilvori_source:{}),
        ...(theme.author?{author:{name:theme.author}}:{}),...(theme.postUrl?{postUrl:cleanSource(theme.postUrl)}:{})};
    }
    return raw;
  }
  async function save(theme,{activate=false,asset=null,original=null}={}){
    const lib=structuredClone(ui().state.lib);
    ui().ensureTheme(lib);
    const row=structuredClone(theme);
    const prior=original && lib.themes.find(item=>item.id===original.id);
    if(original && JSON.stringify(prior)!==JSON.stringify(original))throw new Error('主题已在其他位置更改，请重新打开。');
    row.id=prior?.id || root.TAStore.uid('theme');
    const names=new Set(lib.themes.filter(item=>item.id!==row.id).map(item=>item.name)),base=row.name.trim();
    if(!base)throw new Error('请输入主题名称。');
    row.name=base;
    for(let n=2;names.has(row.name);n++)row.name=base+' ('+n+')';
    row.postUrl=cleanSource(row.postUrl);
    row.raw=external(row);
    if(asset){
      const match=lib.assets.find(item=>item.kind==='background' && item.dataUrl===asset.dataUrl);
      if(!match)lib.assets.push(structuredClone(asset));
      row.backgroundAssetId=(match || asset).id;
    }
    if(row.backgroundAssetId && !lib.assets.some(item=>item.id===row.backgroundAssetId && root.TAThemeAppearance.wallpaperUrl(item)))row.backgroundAssetId='';
    if(prior)lib.themes[lib.themes.indexOf(prior)]=row;else lib.themes.push(row);
    if(activate)lib.activeThemeId=row.id;
    await ui().commitLibrary(lib);
    if(activate || prior?.id===lib.activeThemeId)ui().applyTheme();
    return row;
  }
  async function select(id){
    if(id===ui().state.lib.activeThemeId)return;
    const next=structuredClone(ui().state.lib);if(!next.themes.some(item=>item.id===id))throw new Error('主题已在其他位置更改，请重新打开。');
    next.activeThemeId=id;await ui().commitLibrary(next);ui().applyTheme();
  }
  function el(tag,label,cls){const n=document.createElement(tag);if(label!==undefined)n.textContent=label;if(cls)n.className=cls;return n;}
  function sample(host,theme,asset){
    const s=host.style,a=root.TAThemeFormat.sanitizeAppearance(theme.appearance),v=theme.vars;
    for(const [key,value] of Object.entries({bg:v.bg,paper:v.paper,ink:v.ink,accent:v.accent,line:a.borderColor||v.accent,
      user:a.userTint||v.lacquer,bot:a.botTint||v.paper,opacity:a.panelOpacity??1,chat:a.chatOpacity??1,blur:(a.blur||0)+'px',scale:v.fontScale||1}))s.setProperty('--sample-'+key,value);
    const url=root.TAThemeAppearance.wallpaperUrl(asset || ui().state.lib.assets.find(item=>item.id===theme.backgroundAssetId));
    host.style.backgroundImage=url?'url("'+url+'")':'';
    const board=el('div',undefined,'theme-sample-window'),head=el('div',undefined,'theme-sample-head');
    const title=el('strong',theme.name);title.dataset.noTranslate='';head.append(title);board.append(head);
    for(const [who,text,kind] of [['讲述者','暮色刚落，海岸上的第一盏灯亮了。','bot'],['你','沿着灯光走，到码头看看。','user']]){
      const line=el('div',undefined,'theme-sample-msg '+kind);line.append(el('b',tr(who)),el('span',tr(text)));board.append(line);
    }
    host.replaceChildren(board);
  }
  function backgroundOptions(select,selected,extra){
    select.replaceChildren(new Option(tr('无壁纸'),''));
    for(const a of ui().state.lib.assets)if(root.TAThemeAppearance.wallpaperUrl(a)){const op=new Option(a.name,a.id);op.dataset.noTranslate='';select.add(op);}
    if(extra && ![...select.options].some(op=>op.value===extra.id)){const op=new Option(extra.name,extra.id);op.dataset.noTranslate='';select.add(op);}
    select.value=selected || '';
  }
  function mountSettings(host,afterSelect){
    const esc=ui().esc;
    host.innerHTML='<label class="field"><span class="field-label">'+esc(tr('当前工作台主题'))+'</span><select data-theme-choice data-no-translate></select></label>'+
      '<div class="row"><label class="btn theme-file">'+esc(tr('导入酒馆主题 JSON'))+'<input type="file" accept=".json,application/json" data-theme-file></label><button type="button" class="btn" data-theme-workshop>'+esc(tr('打开主题工坊'))+'</button></div>'+
      '<div class="theme-import-preview" data-theme-preview hidden><div class="theme-sample"></div><p data-theme-detail class="help"></p><div class="row"><label class="field">'+esc(tr('预览壁纸'))+'<select data-theme-background data-no-translate></select></label><label class="btn theme-file">'+esc(tr('选择本机图片'))+'<input type="file" data-theme-wallpaper accept="image/png,image/jpeg,image/webp"></label></div><div class="row"><button type="button" class="btn btn-primary" data-theme-confirm>'+esc(tr('保存并在工作台使用'))+'</button><button type="button" class="btn" data-theme-cancel>'+esc(tr('取消'))+'</button></div></div><p class="help" role="alert" data-theme-error></p>';
    const get=s=>host.querySelector(s),pick=get('[data-theme-choice]'),box=get('[data-theme-preview]'),bg=get('[data-theme-background]'),err=get('[data-theme-error]'),saveButton=get('[data-theme-confirm]');
    let pending=null,asset=null,version=0,reading=false,saving=false;
    const sync=()=>{pick.replaceChildren();for(const v of ui().state.lib.themes)pick.add(new Option(v.kind==='sillytavern'?v.name:tr(v.name),v.id));pick.value=ui().state.lib.activeThemeId;afterSelect();};
    const reset=()=>{version++;pending=null;asset=null;reading=false;box.hidden=true;err.textContent='';saveButton.disabled=false;};
    const paint=()=>{
      if(!pending)return;
      box.hidden=false;backgroundOptions(bg,pending.backgroundAssetId,asset);
      get('[data-theme-detail]').textContent=pending.skippedCSS?tr('预览使用可识别的主题设置。原始 CSS 会随 JSON 保留。'):'';
      sample(get('.theme-sample'),pending,asset);
    };
    const say=e=>{err.textContent=message(e);};
    pick.onchange=async()=>{if(saving)return;const id=pick.value;reset();pick.disabled=true;try{await select(id);sync();}catch(e){say(e);sync();}finally{pick.disabled=false;}};
    get('[data-theme-workshop]').onclick=()=>{host.closest('#modal-root')?.querySelector('#set-close')?.click();ui().go('themes');};
    get('[data-theme-file]').onchange=async e=>{
      const file=e.target.files[0];if(!file || saving)return;e.target.value='';reset();const n=version;
      try{const theme=await fromFile(file);if(n!==version || !host.isConnected)return;pending=theme;paint();}catch(ex){if(n===version)say(ex);}
    };
    bg.onchange=()=>{if(pending){version++;reading=false;saveButton.disabled=false;if(asset?.id!==bg.value)asset=null;pending.backgroundAssetId=bg.value;paint();}};
    get('[data-theme-wallpaper]').onchange=async e=>{
      const file=e.target.files[0];if(!file || !pending || saving)return;e.target.value='';const n=++version;
      reading=true;saveButton.disabled=true;err.textContent='';
      try{const image=await wallpaper(file);if(n!==version || !host.isConnected)return;asset=image;pending.backgroundAssetId=image.id;paint();}
      catch(ex){if(n===version)say(ex);}finally{if(n===version){reading=false;saveButton.disabled=false;}}
    };
    get('[data-theme-cancel]').onclick=reset;
    saveButton.onclick=async()=>{if(!pending || reading || saving)return;saving=true;saveButton.disabled=true;
      try{await save(pending,{activate:true,asset});reset();sync();ui().toast(tr('已应用主题'),{kind:'success'});}
      catch(e){say(e);}finally{saving=false;saveButton.disabled=false;}
    };
    sync();
  }
  root.TAThemeLibrary={fromText,fromFile,wallpaper,external,save,select,cleanSource,sample,backgroundOptions,message,mountSettings};
})(globalThis);
