/* A work page belongs to the collection; opening it never changes the manuscript. */
(function(root) {
  'use strict';
  const ui=()=>root.TAUI, tr=(key,vars)=>ui().t(key,vars);
  const display=item=>root.TAIntegrityPanel.displayName(item);
  const routes={character:'characters',book:'lore'};
  function localId(item,duplicates) {
    return duplicates.has((item.name || '').trim())?tr('workPage.libraryId',{id:item.id}):'';
  }
  function itemLabel(item,duplicates){
    return [display(item),localId(item,duplicates)].filter(Boolean).join(' · ');
  }
  function el(tag,text,cls) {
    const node=document.createElement(tag);
    if(text!=null)node.textContent=text;
    if(cls)node.className=cls;
    return node;
  }
  function authored(tag,text,cls) {
    const node=el(tag,text,cls);node.dataset.noTranslate='';return node;
  }
  function link(text,href,cls='work-page-link') {
    const node=el('a',text,cls);node.href=href;return node;
  }
  function href(kind,id) {
    return 'index.html?work='+kind+'#'+encodeURIComponent(id);
  }
  function editor(kind,id,part='') {
    return routes[kind]+'.html'+(part?'?part='+part:'')+'#'+encodeURIComponent(id);
  }
  function readAddress(route,url) {
    if(route!=='home' || !url?.searchParams.has('work'))return null;
    const kind=url.searchParams.get('work');
    if(!Object.hasOwn(routes,kind))return null;
    try{return {kind,id:decodeURIComponent(url.hash.slice(1))};}
    catch{return {kind,id:''};}
  }
  function readerList(cards,showCount=true) {
    const box=el('div',null,'work-page-readers');
    if(!cards.length){box.append(el('p',tr('workPage.noReaders'),'help'));return box;}
    const labels=el('div',null,'work-page-chips');
    const duplicates=root.TAWorkRelations.duplicateNames(cards);
    for(const card of cards){
      const entry=link(null,href('character',card.id));entry.dataset.workReader=card.id;
      entry.append(authored('span',itemLabel(card,duplicates)));labels.append(entry);
    }
    if(cards.length>6){
      const details=el('details'),summary=el('summary',tr('workPage.readers',{count:cards.length}));
      details.append(summary,labels);box.append(details);
    }else{
      if(showCount)box.append(el('p',tr('workPage.readers',{count:cards.length}),'help'));
      box.append(labels);
    }
    return box;
  }
  function editorLinks(toolbar,kind,work) {
    const block=el('section',null,'work-editor-links');
    block.append(link(tr('workPage.open'),href(kind,work.id)));
    if(kind==='book'){
      const cards=root.TAWorkRelations.readers(ui().state.lib,work.id);
      if(cards.length>1)block.append(el('span',tr('workPage.sharedImpact'),'help'));
      block.append(readerList(cards));
    }
    else{
      const ref=work.embeddedBookId ?? work.source?.embeddedBookId;
      const book=root.TAStore.byId(ui().state.lib.worldBooks,ref);
      if(book){
        const attached=link(null,href('book',book.id));
        const duplicates=root.TAWorkRelations.duplicateNames(ui().state.lib.worldBooks);
        attached.append(el('span',tr('card.embedded')+' · '),authored('span',itemLabel(book,duplicates)));block.append(attached);
      }
    }
    toolbar.querySelector('.work-export-guide').before(block);
    return block;
  }
  function group(host,title) {
    const section=el('section',null,'work-page-group');section.append(el('h3',tr(title)));
    host.append(section);return section;
  }
  function itemLink(section,item,target,attr,duplicates,image) {
    const node=link(null,target,'work-page-item');node.dataset[attr]=item.id;
    if(image?.dataUrl){const img=el('img');img.alt='';img.loading='lazy';img.decoding='async';img.src=ui().imageUrl(image);node.append(img);}
    node.append(authored('span',itemLabel(item,duplicates)));section.append(node);
  }
  function packPreview(section,stickers) {
    if(!stickers?.length)return;
    const details=el('details',null,'work-pack-preview');
    details.append(el('summary',tr('workPage.packImages',{count:stickers.length})));
    details.ontoggle=()=>{
      if(!details.open || details.querySelector('ul'))return;
      const pager=el('nav'),list=el('ul');details.append(pager,list);
      const show=root.TACollectionControls.mountGalleryPager(pager,{},rows=>{
        list.replaceChildren(...rows.map(sticker=>{
          const row=el('li');
          if(sticker.dataUrl?.startsWith('data:image/')){
            const img=el('img');img.alt='';img.loading='lazy';img.decoding='async';img.src=ui().imageUrl(sticker);row.append(img);
          }
          row.append(authored('span',sticker.name || tr('未命名')));return row;
        }));
      });
      show(stickers);
    };
    section.append(details);
  }
  function drafts(block,kind,work) {
    const rows=root.TAWorkRelations.draftsFor(root.TAStudioDrafts.pending(),kind,work);
    const list=el('div',null,'work-page-list');
    if(!rows.length)list.append(el('p',tr('workPage.noDrafts'),'help'));
    for(const row of rows){
      const btn=el('button',null,'work-page-item');btn.type='button';btn.dataset.workDraft=row.id;
      btn.append(el('small',tr(row.kind==='character'?'角色卡':'世界书')),authored('span',row.name || tr('未命名')));
      btn.onclick=()=>root.NIJANStudio.openDraft(row.id);list.append(btn);
    }
    block.querySelector('.work-page-list')?.remove();block.append(list);
  }
  async function syncState(host,kind,work) {
    try{
      const key=kind==='character'?'characters':'worldBooks';
      const record=await root.TALibraryDB.workBinding(key,work.id);
      if(!host.isConnected)return;
      if(!record){host.textContent=tr('sync.unbound');return;}
      let label;
      if(record.pending)label='sync.pending';
      else if(record.needsVerify)label=kind==='character'?'card.exported':'sync.exported';
      else if(!record.base)label='sync.notChecked';
      else {
        const dirty=kind==='character' ? await root.TACardSyncSession.dirty(record,work) : root.TAWorldSync.hasLocalChanges(record.base,work,record.name);
        label=dirty?'sync.localChanged':'workPage.lastMatched';
      }
      if(!host.isConnected)return;
      host.replaceChildren(el('span',tr(label)),authored('span',record.name,'work-page-filename'));
      if(record.checkedAt){const when=new Date(record.checkedAt);
        if(Number.isFinite(when.getTime()))host.append(el('small',tr('sync.checkedAt',{time:when.toLocaleString(document.documentElement.lang)})));}
    }catch(error){if(host.isConnected)host.textContent=tr(error.code || error.message);}
  }
  function render(stage,{kind,id}) {
    const lib=ui().state.lib, data=root.TAWorkRelations.related(lib,kind,id);
    const host=el('article',null,'work-page');host.dataset.workPage=kind;
    const back=link(tr('workPage.back'),'index.html','work-page-back');back.dataset.workBack='';host.append(back);stage.append(host);
    if(!data){host.append(el('h2',tr('workPage.missing')));return;}
    const {work,book,pack,expressions,replies}=data, card=kind==='character';
    host.dataset.workId=work.id;
    const header=el('header',null,'work-page-heading'),cover=el('div',null,'work-page-cover');
    const art=root.TAStore.byId(lib.assets,card?work.avatarAssetId:work.coverAssetId);
    const img=el('img');img.src=art?.dataUrl ? ui().imageUrl(art) : 'img/emblem.svg';img.alt='';img.decoding='async';
    if(!art?.dataUrl)cover.classList.add('work-page-emblem');cover.append(img);
    const intro=el('div');intro.append(el('p',tr(card?'角色卡':'世界书'),'work-page-kind'),authored('h2',display(work)));
    const identity=localId(work,root.TAWorkRelations.duplicateNames(card?lib.characters:lib.worldBooks));
    if(identity)intro.append(authored('small',identity,'work-page-byline'));
    if(work.creator)intro.append(authored('p',work.creator,'work-page-byline'));
    if(work.description)intro.append(authored('p',work.description,'work-page-excerpt'));
    const edit=link(tr('打开编辑'),editor(kind,work.id),'btn btn-primary');edit.dataset.workEdit='';intro.append(edit);
    header.append(cover,intro);host.append(header);
    const sections=el('div',null,'work-page-grid');host.append(sections);
    const relation=group(sections,card?'card.embedded':'workPage.usedBy');
    if(card){
      if(book){
        itemLink(relation,book,href('book',book.id),'workBook',root.TAWorkRelations.duplicateNames(lib.worldBooks));
        relation.append(el('p',tr('workPage.embeddedCopy'),'help'));
        if(data.readers.length>1)relation.append(readerList(data.readers));
      }
      else relation.append(el('p',tr('不附带世界书'),'help'));
      const attach=link(tr('workPage.changeBook'),editor(kind,work.id,'book'));attach.dataset.workAttach='';relation.append(attach);
    }else relation.append(readerList(data.readers,false));
    const assets=group(sections,'workPage.expressions');
    if(pack){
      const line=link(null,editor(kind,work.id,'expressions'),'work-page-item');line.dataset.workPack=pack.id;
      line.append(authored('span',itemLabel(pack,root.TAWorkRelations.duplicateNames(lib.stickerPacks))));assets.append(line);
      packPreview(assets,pack.stickers);
    }
    const imageNames=root.TAWorkRelations.duplicateNames(expressions);
    for(const image of expressions)itemLink(assets,image,'assets.html#'+encodeURIComponent(image.id),'workExpression',imageNames,image);
    if(!pack && !expressions.length)assets.append(el('p',tr('workPage.noExpressions'),'help'));
    const sets=group(sections,'快捷回复');
    const replyNames=root.TAWorkRelations.duplicateNames(replies);
    for(const set of replies)itemLink(sets,set,'quick.html#'+encodeURIComponent(set.id),'workReply',replyNames);
    if(!replies.length)sets.append(el('p',tr('workPage.noReplies'),'help'));
    const pending=group(sections,'workPage.drafts');
    const redraw=()=>drafts(pending,kind,work);redraw();host.refreshDrafts=redraw;
    const files=group(sections,card?'workPage.cardFile':'workPage.bookFile');
    const sync=el('p',tr('sync.checking'),'work-page-status');sync.dataset.workFile='';sync.setAttribute('role','status');files.append(sync);
    const check=link(tr('sync.compare'),editor(kind,work.id,'sync'));check.dataset.workCompare='';files.append(check);syncState(sync,kind,work);
    root.TAHistoryPanel.mount(sections,card?'characters':'worldBooks',work);
  }
  function focusPart(stage,part) {
    const selectors={book:'#attach-book',expressions:'#pack-select',sync:'[data-sync-open]',style:'[data-sec=style]'};
    const field=stage.querySelector(selectors[part] || ':not(*)');if(!field)return;
    for(let detail=field.closest('details');detail;detail=detail.parentElement?.closest('details'))detail.open=true;
    const focus=field.closest('.dark-select')?.querySelector('.dark-select-value') || field;
    focus.focus({preventScroll:true});focus.scrollIntoView({block:'nearest'});
  }
  root.TAWorkPage={href,readAddress,editorLinks,render,focusPart,localId,itemLabel};
})(globalThis);
