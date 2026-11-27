'use strict';
const assert = require('node:assert/strict');
const suite = require('./desktop-fixture.cjs');

suite('world-directory-scroll', async ({open,run,wait,input,click,key,win}) => {
  await open('lore');
  const pager = '.ctx-directory-pager';
  const bounds = () => run(() => {
    const board = document.querySelector('.board'), rows = board.querySelector('.ctx-directory-rows');
    const box = board.getBoundingClientRect(), search = board.querySelector('.ws-directory-search').getBoundingClientRect();
    const header = board.querySelector('.ws-list-header').getBoundingClientRect(), nav = board.querySelector('nav');
    const bottom = nav.hidden ? search.bottom : nav.getBoundingClientRect().bottom;
    const top = document.elementFromPoint(box.left+box.width/2,box.top+6);
    return {
      header:header.top-box.top, search:search.top-box.top, pager:nav.hidden ? null : nav.getBoundingClientRect().top-box.top,
      first:rows.querySelector('.entry').getBoundingClientRect().top-box.top,
      textAboveControls:!!top?.closest('.entry,.column'), boardScroll:board.scrollTop, rowScroll:rows.scrollTop,
      x:Math.floor(box.left+box.width/2), y:Math.floor(Math.min(box.bottom-8,innerHeight-8,bottom+45)),
    };
  });
  const frames = () => run(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  win.webContents.debugger.attach('1.3');
  try {
    for (const [width,height,count,lang,scale] of [[1280,900,42,'zh',1],[900,660,123,'en',1.2],[390,844,123,'ru',1.2]]) {
      win.setContentSize(width,height);
      await run(async (count,lang,scale)=>{
        TAI18n.save({lang,scale}); TAI18n.apply();
        const lib=TAStore.emptyLibrary();
        lib.worldBooks=[{id:'harbor',name:'Harbor directory',entries:Array.from({length:count},(_,id)=>({
          id,comment:'Signal '+id,content:'Log entry '+id+' '+('灯塔与潮汐记录。'.repeat(16)),keys:['harbor'],
          position:'before_char',category:'location',enabled:true,
        }))}];
        await TAUI.commitLibrary(TAStore.verify(lib));
        TAUI.state.sel.book='harbor'; TAUI.state.sel.entry=0; TAUI.state.loreFilter=''; TAUI.state.loreGroupBy='position';
        TAUI.renderStage(); await document.fonts.ready;
        document.querySelector('.board').scrollIntoView({block:'start'});
      },count,lang,scale);
      await frames();
      const initial=await bounds();
      assert.equal(initial.pager===null,count<=50);
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{
        type:'mouseWheel',x:initial.x,y:initial.y,deltaX:0,deltaY:230,
      });
      await wait(()=>{
        const b=document.querySelector('.board');
        return b.scrollTop+b.querySelector('.ctx-directory-rows').scrollTop>75;
      },'wheel moves the directory');
      const scrolled=await bounds();
      for (const name of ['header','search',...(count>50?['pager']:[])]) {
        assert.ok(Math.abs(scrolled[name]-initial[name])<1,'scroll displaced '+name+' at '+width+'px: '+initial[name]+' → '+scrolled[name]);
      }
      assert.ok(!scrolled.textAboveControls && scrolled.boardScroll===0 && scrolled.rowScroll>75);
      assert.ok(initial.first-scrolled.first>75,'entry content moves under the wheel');

      if (count>50) {
        await click(pager+' [data-next]'); await click(pager+' [data-next]');
        assert.equal((await bounds()).rowScroll,0);
        assert.equal(await run(()=>document.querySelector('.ctx-directory-rows .entry').dataset.id),'100');
        assert.ok(await run(()=>document.activeElement===document.querySelector('.ctx-directory-pager [data-prev]')));
        await click(pager+' [data-prev]'); await click(pager+' [data-prev]');
        assert.ok(await run(()=>document.activeElement===document.querySelector('.ctx-directory-pager [data-next]')));
      }
      await input('#lore-filter','No such signal');
      assert.ok(await run(()=>!document.querySelector('.ws-filter-empty').hidden && document.querySelector('.ctx-directory-pager').hidden));
      await input('#lore-filter','Signal 17');
      await run(()=>document.querySelector('.ctx-directory-rows .entry').focus()); key('Return');
      await wait(()=>TAUI.state.sel.entry===17,'keyboard opens the filtered entry');
      assert.equal(await run(()=>document.querySelector('#lore-editor [data-field=comment]').value),'Signal 17');
      await input('#lore-filter','');
      await run(id=>TASearch.open({kind:'entry',parentId:'harbor',id,field:'content'}),count-1);
      await wait(id=>TAUI.state.sel.entry===id && !!document.querySelector('.ctx-directory-rows .entry.on'),'link opens the last entry',count-1);
      await run(()=>{
        const group=document.querySelector('#lore-group-by'); group.value='category';
        group.dispatchEvent(new Event('change',{bubbles:true}));
      });
      await frames();
      assert.ok(await run(()=>{
        const rows=document.querySelector('.ctx-directory-rows'), box=rows.getBoundingClientRect();
        const item=rows.querySelector('.entry.on').getBoundingClientRect();
        return item.top>=box.top-1 && (item.bottom<=box.bottom+1 || item.height>box.height);
      }),'linked entry is visible inside the directory at '+width+'px');
    }
  } finally {win.webContents.debugger.detach();}
  console.log('World directory: real wheel scrolling, stable controls, paging focus, search, keyboard selection and deep links passed on three layouts.');
});
