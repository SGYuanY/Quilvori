/* Character-specific review surfaces share the file and history controls with world books. */
(function(root) {
  'use strict';
  const t=(key,vars)=>root.TAUI.t(key,vars);
  const fields={name:'名称',description:'描述',personality:'性格',scenario:'情景',first_mes:'开场白',mes_example:'对话示例',
    alternate_greetings:'备用开场',creator_notes:'创作者备注',system_prompt:'系统提示',post_history_instructions:'历史后指令',
    tags:'标签',creator:'创作者',character_version:'版本',talkativeness:'话多程度',portrait:'头像',content:'内容',
    keys:'主关键词',secondary_keys:'次关键词',comment:'条目名',entry:'sync.wholeEntry',attribution:'card.credit'};
  function element(tag,text) {
    const node=document.createElement(tag);
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function textValue(tag,text) {
    const node=element(tag,text);node.dataset.noTranslate='';return node;
  }
  function title(row) {
    const book=row.field==='character_book' || row.field.startsWith('character_book.');
    const name=book?row.field.slice(15):row.field;
    let field=fields[name]?t(fields[name]):name;
    if(name.startsWith('attribution.'))field=t('card.credit')+' · '+name.slice(12);
    const prefix=book?t('card.embedded'):t('角色卡');
    return [prefix,row.uid==null?'':(row.label || '')+' (#'+row.uid+')',field].filter(Boolean).join(' · ');
  }
  function display(row,side) {
    if(!row[side+'Present'])return t('sync.absent');
    return typeof row[side]==='string' ? row[side] : JSON.stringify(row[side],null,2);
  }
  async function prepare(view) {
    let edition;
    if(view.decoded.needsVariant){
      const content=element('div');content.className='world-sync-review';content.dataset.cardVariants='';
      content.append(textValue('strong',view.file.name),element('p',t('card.variantHelp')));
      const list=element('div');list.className='card-variant-list';
      for(const row of view.decoded.variantRows){
        const detail=element('details');detail.append(textValue('summary',title(row)));
        detail.ontoggle=()=>{
          if(!detail.open || detail.childElementCount>1)return;
          const pair=element('div');pair.className='world-sync-versions card-sync-images';
          for(const [label,side] of [['V2 · chara','disk'],['V3 · ccv3','local']]){
            const item=element('div');item.append(element('strong',label),textValue('pre',display(row,side)));pair.append(item);
          }
          detail.append(pair);
        };
        list.append(detail);
      }
      content.append(list);
      edition=await root.TAUI.ask({title:t('card.variantTitle'),content,actions:[
        {id:'no',label:t('取消')},{id:'chara',label:'V2 · chara'},{id:'ccv3',label:'V3 · ccv3'}]});
      if(!['chara','ccv3'].includes(edition))return null;
    }
    return root.TACardSyncSession.prepare(view,edition);
  }
  function portrait(row,view) {
    if(row.field!=='portrait')return null;
    const grid=element('div');grid.className='world-sync-versions card-sync-images';
    const art=view.art;
    for(const [key,blob] of [['local',art.localBlob],['file',art.diskBlob]]){
      const cell=element('div');cell.append(element('strong',t('sync.'+key)));
      if(blob){
        const img=element('img');img.alt=t('头像')+' · '+t('sync.'+key);
        view.imageUrls ||= new Map();
        if(!view.imageUrls.has(blob))view.imageUrls.set(blob,URL.createObjectURL(blob));
        img.src=view.imageUrls.get(blob);cell.append(img);
      }else cell.append(element('p',t('sync.absent')));
      grid.append(cell);
    }
    return grid;
  }
  root.TACardSyncPanel={mount(toolbar,card,recoverPortrait){
    root.TAFileSyncPanel.mount(toolbar,card,{host:'data-card-sync',collection:'characters',selection:'character',
      session:root.TACardSyncSession,title:'card.syncTitle',choose:'card.chooseFile',reader:'cardSyncRead',recover:recoverPortrait,
      dirty:root.TACardSyncSession.dirty,prepare,rowTitle:title,rowView:portrait,webHelp:'card.webHelp',desktopHelp:'card.desktopHelp',
      unlinkHelp:'card.unlinkHelp',exported:'card.exported',cleanup:view=>view.imageUrls?.forEach(url=>URL.revokeObjectURL(url)),
      introduction(host,view){
        if(view.art?.thumbnail)host.append(element('p',t('card.thumbnail')));
        if(view.art?.unverifiedThumbnail)host.append(element('p',t('card.unverifiedThumbnail')));
        if(view.plan.rows.some(row=>row.field.startsWith('character_book')))host.append(element('p',t('card.bookHelp')));
      }});
  }};
})(globalThis);
