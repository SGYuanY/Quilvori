/* Edit native ST presets while previewing them in an isolated, local conversation. */
(function(root){
  'use strict';
  const ui=()=>root.TAUI, st=()=>root.TAThemeFormat, lib=()=>root.TAThemeLibrary, tr=key=>ui().t(key);
  const palette=[
    ['main_text_color','正文颜色','ink'],['quote_text_color','引用颜色','accent'],['italics_text_color','斜体颜色','ink'],
    ['underline_text_color','下划线颜色','accent'],['blur_tint_color','面板色','paper'],['chat_tint_color','聊天底色','bg'],
    ['user_mes_blur_tint_color','用户气泡','paper'],['bot_mes_blur_tint_color','角色气泡','lacquer'],
    ['border_color','边框颜色','accent'],['shadow_color','阴影颜色','lacquer'],
  ];
  const amounts=[['blur_strength','模糊强度',0,30,1],['shadow_width','阴影宽度',0,5,1],['font_scale','字号倍率',0.5,1.5,0.05]];
  const element=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function field(name,input){const lbl=element('label',undefined,'field');lbl.append(element('span',tr(name),'field-label'),input);return lbl;}
  function button(label,run,primary=false){const b=element('button',tr(label),'btn'+(primary?' btn-primary':''));b.type='button';b.onclick=run;return b;}
  function link(label,url){const a=element('a',tr(label));a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function anchored(input,label){input.setAttribute('aria-label',tr(label));return input;}
  function rgb(value){
    const match=st().toSTColor(value)?.match(/[\d.]+/g);
    return match ? {hex:'#'+match.slice(0,3).map(v=>Number(v).toString(16).padStart(2,'0')).join(''),alpha:Math.round(Number(match[3])*100)} : {hex:'#000000',alpha:100};
  }
  let opened=null,dirty=false,selection='',original=null,asset=null,source=null,generation=0,needsSourceFile=false;
  let firstDraft=null;
  function forget(){opened=null;firstDraft=null;dirty=false;selection='';original=null;asset=null;source=null;needsSourceFile=false;generation++;}
  function render(stage){
    const pane=element('section',undefined,'theme-workshop');
    stage.replaceChildren(pane);
    const desktop=root.nijanDesktop;
    const shell=element('div',undefined,'theme-desk'),sidebar=element('aside',undefined,'paper stack theme-sidebar');
    const detail=element('section',undefined,'paper stack theme-detail'),local=element('div',undefined,'stack theme-settings');
    const connection=element('details',undefined,'paper theme-connection');
    const connectLabel=element('summary',tr(desktop?.themeInstall?'连接本机 SillyTavern':'在酒馆中使用…'));connection.append(connectLabel,local);
    connection.open=ui().state.themeConnectionOpen===true;
    connection.ontoggle=()=>{ui().state.themeConnectionOpen=connection.open;};
    const sourceList=element('div',undefined,'theme-sources'),savedList=element('div',undefined,'theme-sources'),headActions=element('div',undefined,'row theme-actions');
    const status=element('p',undefined,'help');status.setAttribute('role','status');
    function say(text,isError=false){status.textContent=text;status.setAttribute('role',isError?'alert':'status');}
    const fail=err=>say(lib().message(err),true);
    function fileControl(label,data,onFile,accept='.json,application/json'){
      const lab=element('label',tr(label),'btn theme-file'),input=document.createElement('input');input.type='file';input.accept=accept;input.dataset[data]='';
      input.onchange=()=>{const f=input.files[0];input.value='';if(f)onFile(f);};lab.append(input);return lab;
    }
    function catalogCredit(entry){return entry ? {author:entry.author,url:entry.fileUrl || entry.postUrl} : {};}
    function selectDraft(row,{saved=null,entry=null,id=''}={}){
      opened=structuredClone(row);firstDraft=structuredClone(row);original=saved?structuredClone(saved):null;
      source=entry || root.TAThemeCatalog.find(item=>item.fileUrl===row.postUrl || item.postUrl===row.postUrl) || null;asset=null;dirty=false;
      selection=id;needsSourceFile=false;root.TAThemeSTPanel.draftChanged?.();say('');paintList();paintDetail();
    }
    function allowed(){return !dirty || window.confirm(tr('离开这份主题的未保存修改？'));}
    async function importFile(file,entry=null){
      if(!allowed())return;
      const epoch=++generation;
      try{
        const row=await lib().fromFile(file,catalogCredit(entry));if(epoch!==generation || !pane.isConnected)return;
        selectDraft(row,{entry,id:entry?.id || ''});
      }catch(error){if(epoch===generation && pane.isConnected)fail(error);}
    }
    async function catalog(entry,initial=false){
      if(!initial && !allowed())return;
      const epoch=++generation;
      source=entry;original=null;opened=null;asset=null;dirty=false;needsSourceFile=false;selection=entry.id;root.TAThemeSTPanel.draftChanged?.();say('');paintList();paintDetail();
      if(!entry.localFile){needsSourceFile=true;paintDetail();return;}
      try{
        let text='';
        if(desktop?.themeSample){const result=await desktop.themeSample(entry.id);if(result?.ok)text=result.text;}
        else if(/^https?:$/.test(location.protocol)){
          const reply=await fetch(new URL('.runtime/theme-sources/'+entry.localFile,location.href),{credentials:'same-origin',referrerPolicy:'no-referrer'});
          if(reply.ok && !reply.headers.get('content-type')?.includes('text/html')){
            const bytes=await root.TALinkImport.readResponse(reply);
            if(bytes.length<=st().MAX_BYTES){
              const sha=await crypto.subtle.digest('SHA-256',bytes);
              const fingerprint=Array.from(new Uint8Array(sha),b=>b.toString(16).padStart(2,'0')).join('');
              if(fingerprint===entry.sha256)text=new TextDecoder().decode(bytes);
            }
          }
        }
        if(epoch!==generation || !pane.isConnected)return;
        if(text){selectDraft(lib().fromText(text,entry.localFile,catalogCredit(entry)),{entry,id:entry.id});return;}
        needsSourceFile=true;paintDetail();
      }catch(error){if(epoch===generation && pane.isConnected){needsSourceFile=true;paintDetail();fail(error);}}
    }
    async function fromLink(url,entry){
      if(!allowed())return;
      const epoch=++generation;
      try{
        const stable=root.TAResourceSource.sourceUrl(url.trim().replace(/^<|>$/g,''));
        if(stable){
          const address=new URL(stable),post=address.pathname.match(/^\/channels\/(\d{17,20})\/(\d{17,20})(?:\/(\d{17,20}))?\/?$/);
          if(post && /^(?:(?:canary|ptb|www)\.)?discord(?:app)?\.com$/i.test(address.hostname)){
            const thread='https://discord.com/channels/'+post[1]+'/'+post[2];
            const known=root.TAThemeCatalog.find(item=>item.postUrl===thread);
            await catalog(known || {id:thread,name:tr('Discord 主题'),author:'',postUrl:thread+(post[3]?'/'+post[3]:'')},true);
            return;
          }
        }
        const file=await root.TALinkImport.download(url);
        if(epoch!==generation || !pane.isConnected)return;
        if(file.bytes.byteLength>st().MAX_BYTES)throw Object.assign(new Error('theme-size'),{code:'theme-size'});
        selectDraft(lib().fromText(new TextDecoder().decode(file.bytes),file.filename,catalogCredit(entry)),{entry,id:entry?.id || ''});
      }catch(error){if(epoch===generation && pane.isConnected)fail(error);}
    }
    function urlInput(entry){
      const group=element('details',undefined,'theme-link-import'),body=element('div',undefined,'row');
      const input=anchored(document.createElement('input'),'Discord 原帖或 JSON 附件链接');input.type='url';input.placeholder='https://…';
      const go=button('读取附件',()=>fromLink(input.value,entry));body.append(input,go);group.append(element('summary',tr('从 Discord 原帖或附件链接导入')),body);
      return group;
    }
    headActions.append(fileControl('导入酒馆主题 JSON','workshopFile',file=>importFile(file)),urlInput(null));
    sidebar.append(element('h3',tr('主题库')),headActions,element('h4',tr('我的主题')),savedList,element('h4',tr('Discord 主题')),sourceList);
    shell.append(sidebar,detail);pane.append(connection,shell,status);
    function listButton(name,author,id,fn,saved=false){
      const b=element('button',undefined,'theme-card');b.type='button';b.setAttribute('aria-pressed',String(id===selection));
      b.dataset[saved?'savedTheme':'sourceTheme']=id;b.value=id;const title=element('strong',name);title.dataset.noTranslate='';b.append(title);
      if(author){const by=element('small',author);by.dataset.noTranslate='';b.append(by);}b.onclick=fn;return b;
    }
    function paintList(){
      const saved=ui().state.lib.themes.filter(row=>row.kind==='sillytavern' && row.raw);
      savedList.replaceChildren(...saved.map(row=>listButton(row.name,row.author,row.id,()=>{
        if(!allowed())return;generation++;selectDraft(row,{id:row.id,saved:row});
      },true)));
      if(!saved.length)savedList.append(element('small',tr('保存后的主题会出现在这里。'),'help'));
      sourceList.replaceChildren(...root.TAThemeCatalog.map(entry=>listButton(entry.name,entry.author,entry.id,()=>catalog(entry))));
    }
    function authorNote(box,entry){
      if(!entry)return;
      if(entry.author){const by=element('span',entry.author);by.dataset.noTranslate='';box.append(by,document.createTextNode(' · '));}
      box.append(link('原帖',entry.fileUrl || entry.postUrl));
    }
    function paintDetail(){
      detail.replaceChildren();
      if(!opened){
        if(!source)return;
        const title=element('h3',source.name);title.dataset.noTranslate='';const note=element('p',undefined,'help');authorNote(note,source);
        detail.append(title,note);
        if(needsSourceFile)detail.append(element('p',tr('从作者原帖下载 JSON，再选择该文件即可预览。')),
          fileControl('选择这个原帖的 JSON','sourceFile',f=>importFile(f,source)),urlInput(source));
        return;
      }
      const draft=opened;
      const head=element('div',undefined,'theme-preview-heading'),title=element('h3',tr('主题预览'));head.append(title);
      const credit=element('small',undefined,'help');
      if(draft.author){const by=element('span',draft.author);by.dataset.noTranslate='';credit.append(by);}
      if(draft.postUrl){if(draft.author)credit.append(' · ');credit.append(link('原帖',draft.postUrl));}
      head.append(credit);const sample=element('div',undefined,'theme-sample');sample.dataset.workshopPreview='';
      const preview=()=>lib().sample(sample,draft,asset);
      const options=element('div',undefined,'row theme-actions');
      const saveButton=button('保存到主题库',()=>save(false),true);saveButton.dataset.workshopSave='';
      const revert=button('放弃本次主题修改',()=>{if(allowed()){generation++;selectDraft(firstDraft,{saved:original,entry:source,id:selection});}});
      revert.hidden=!dirty;
      const changed=()=>{dirty=true;revert.hidden=false;};
      const apply=button('在叙翎集中使用',()=>save(true));apply.dataset.workshopApply='';
      const exp=button('导出酒馆主题 JSON',()=>{
        try{ui().downloadJson(ui().safeName(draft.name)+'.json',lib().external(draft));say(tr('已发起主题 JSON 下载'));}
        catch(e){fail(e);}
      });exp.dataset.workshopExport='';
      options.append(saveButton,exp,apply);
      if(desktop?.themeInstall)options.append(button('在酒馆中使用…',()=>{
        connection.open=true;connection.scrollIntoView({block:'start'});
        const submit=local.querySelector('[data-theme-st="install"]');
        const focus=submit && !submit.disabled && !submit.closest('[hidden]')?submit:local.querySelector('[data-theme-st="path"]');
        focus?.focus({preventScroll:true});
      }));
      options.append(revert);detail.append(head,sample,options);
      if(draft.skippedCSS)detail.append(element('p',tr('预览使用可识别的主题设置。原始 CSS 会随 JSON 保留。'),'help'));
      if(source?.id==='lavender-blossoms')detail.append(element('p',tr('Info Board 是作者另附的正则与提示词，可从原帖查看。'),'help'));
      if(draft.postUrl)detail.append(element('p',tr('请尽量支持原作者。喜欢这份作品的话，请到原帖评论区，毫不吝啬地留下您的赞赏。您的赞赏，才是他们最大的动力。'),'help'));
      preview();
      const edit=element('section',undefined,'theme-editor stack'),metadata=element('div',undefined,'theme-metadata');
      edit.append(element('h3',tr('编辑主题')),metadata);detail.append(edit);
      function textBox(label,key,id){
        const input=document.createElement('input');input.type=key==='postUrl'?'url':'text';input.value=draft[key] || '';
        input.maxLength=key==='postUrl'?2048:160;input.dataset[id]='';input.oninput=()=>{
          draft[key]=input.value;changed();
          if(key==='name'){preview();saveButton.disabled=exp.disabled=apply.disabled=!input.value.trim();}
        };metadata.append(field(label,input));
      }
      textBox('主题名称','name','workshopName');textBox('原作者','author','workshopAuthor');textBox('原帖链接','postUrl','workshopSource');
      const setNative=(key,value)=>{
        try{
          const raw=key==='custom_css'?{...draft.raw,custom_css:value}:st().edited(draft.raw,{[key]:value});
          const parsed=lib().fromText(JSON.stringify(raw),draft.name);
          Object.assign(draft,{vars:parsed.vars,appearance:parsed.appearance,raw:parsed.raw,skippedCSS:parsed.skippedCSS,cssOnly:parsed.cssOnly});
          if(key==='custom_css')root.TAThemeSTPanel.draftChanged?.();
          changed();preview();say('');
        }catch(err){fail(err);}
      };
      const colors=element('div',undefined,'theme-native-grid');
      palette.forEach(([key,label,fallback])=>{
        const group=element('div',undefined,'theme-color-row'),colour=anchored(document.createElement('input'),label),alpha=anchored(document.createElement('input'),'不透明度');
        const value=rgb(draft.raw[key] || draft.vars[fallback]);
        colour.type='color';colour.value=value.hex;colour.dataset.stColor=key;alpha.type='number';alpha.min=0;alpha.max=100;alpha.step=1;alpha.value=value.alpha;alpha.dataset.stAlpha=key;
        const update=()=>{if(!alpha.validity.valid || alpha.value==='')return;setNative(key,colour.value+Math.round(Number(alpha.value)*2.55+1e-8).toString(16).padStart(2,'0'));};
        colour.oninput=update;alpha.oninput=update;
        group.append(field(label,colour),alpha,element('span','%','help'));colors.append(group);
      });
      const controls=element('div',undefined,'theme-controls');
      amounts.forEach(([key,label,min,max,step])=>{
        const input=document.createElement('input');input.type='number';input.min=min;input.max=max;input.step=step;
        input.value=draft.raw[key] ?? (key==='font_scale'?draft.vars.fontScale:key==='blur_strength'?draft.appearance.blur:draft.appearance.shadowWidth) ?? 0;
        input.onchange=()=>{if(input.value!=='' && input.validity.valid)setNative(key,Number(input.value));};controls.append(field(label,input));
      });
      for(const [key,label] of [['fast_ui_mode','关闭界面模糊'],['noShadows','关闭文字阴影']]){
        const option=element('label',undefined,'check'),flag=document.createElement('input');flag.type='checkbox';flag.checked=draft.raw[key]===true;
        flag.onchange=()=>setNative(key,flag.checked);option.append(flag,document.createTextNode(tr(label)));controls.append(option);
      }
      edit.append(colors,controls);
      const wall=element('div',undefined,'row theme-controls'),bg=document.createElement('select');
      lib().backgroundOptions(bg,draft.backgroundAssetId,asset);
      bg.onchange=()=>{generation++;saveButton.disabled=apply.disabled=!draft.name.trim();if(bg.value!==asset?.id)asset=null;draft.backgroundAssetId=bg.value;changed();preview();};
      wall.append(field('预览壁纸',bg),fileControl('选择本机图片','workshopWallpaper',async file=>{
        const epoch=++generation;saveButton.disabled=apply.disabled=true;
        try{const image=await lib().wallpaper(file);if(epoch!==generation || !pane.isConnected || opened!==draft)return;
          asset=image;draft.backgroundAssetId=asset.id;changed();lib().backgroundOptions(bg,asset.id,asset);preview();}
        catch(e){if(epoch===generation)fail(e);}finally{if(epoch===generation)saveButton.disabled=apply.disabled=!draft.name.trim();}
      },'image/png,image/jpeg,image/webp'));edit.append(wall);
      const custom=element('details'),area=document.createElement('textarea');area.value=draft.raw.custom_css || '';area.rows=7;area.spellcheck=false;area.dataset.workshopCss='';area.onchange=()=>setNative('custom_css',area.value);
      custom.append(element('summary',tr('原生自定义 CSS')),field('酒馆 CSS',area));edit.append(custom);
      async function save(activate){
        if(saveButton.disabled || !draft.name.trim())return;
        saveButton.disabled=true;apply.disabled=true;
        try{
          const stored=await lib().save(draft,{activate,asset,original});
          if(opened!==draft || !pane.isConnected)return;
          selectDraft(stored,{id:stored.id,saved:stored});say(tr(activate?'已应用主题':'主题已保存'));
        }catch(error){fail(error);}finally{saveButton.disabled=apply.disabled=false;}
      }
    }
    root.TAThemeSTPanel.mount(local,{
      getTheme:()=>opened?.name.trim()?lib().external(opened):null,
      openTheme:raw=>{if(!allowed())return false;generation++;selectDraft(lib().fromText(JSON.stringify(raw),raw.name || 'SillyTavern'));},
    });
    const saved=ui().state.lib.themes.filter(row=>row.kind==='sillytavern' && row.raw);
    paintList();
    if(opened)paintDetail();else if(saved.length)selectDraft(saved[0],{id:saved[0].id,saved:saved[0]});
    else if(root.TAThemeCatalog.length)catalog(source||root.TAThemeCatalog[0],true);
  }
  root.TAThemeWorkshop={render,reset:forget,unsaved:()=>dirty};
})(globalThis);
