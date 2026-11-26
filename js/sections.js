/* Field-level synchronization for the workshop's writing sections. */
(function(root) {
  'use strict';
  const UI=root.TAUI;
  const messages={
    "sections.review":["核对作品差异","Review changes to works","作品との差分を確認","Проверить различия с работами","작품 변경 사항 검토","ตรวจสอบความต่างกับผลงาน"],
    "sections.reviewHelp":["逐项比较已保存的内容和此段落将生成的内容，再选择要应用的字段。","Compare the saved and proposed values, then choose which fields to update.","保存済みの値と生成候補を比較し、更新する項目を選んでください。","Сравните сохранённые и предлагаемые значения и выберите поля для обновления.","저장된 값과 제안된 값을 비교한 뒤 적용할 항목을 선택하세요.","เปรียบเทียบค่าที่บันทึกไว้กับค่าที่เสนอ แล้วเลือกช่องที่ต้องการอัปเดต"],
    "sections.current":["作品当前内容","Current work","作品の現在の値","Сейчас в работе","현재 작품 내용","ค่าปัจจุบันในผลงาน"],
    "sections.proposed":["段落建议内容","Proposed by section","段落の提案","Предложено разделом","단락 제안 내용","ค่าที่ส่วนงานเสนอ"],
    "sections.use":["采用段落值","Use section value","段落の値を採用","Использовать значение раздела","단락의 값 적용","ใช้ค่าจากส่วนงาน"],
    "sections.record":["完整记录","Entire record","レコード全体","Вся запись","전체 항목","ทั้งรายการ"],
    "sections.absent":["无此项","No entry","項目なし","Запись отсутствует","항목 없음","ไม่มีรายการ"],
    "sections.apply":["应用选择","Apply selections","選択を適用","Применить выбранное","선택 사항 적용","ใช้รายการที่เลือก"],
    "sections.inSync":["此段落与作品已同步。","This section matches its works.","この段落は作品に反映されています。","Раздел уже соответствует работам.","이 단락은 작품에 반영되어 있습니다.","ส่วนงานนี้ตรงกับผลงานแล้ว"],
    "sections.lore":["世界书条目","World-book entry","ワールドブック項目","Запись книги мира","월드북 항목","รายการเวิลด์บุ๊ก"],
    "sections.enabled":["启用","Enabled","有効","Включено","활성화","เปิดใช้งาน"],
    "sections.disabled":["停用","Disabled","無効","Отключено","비활성화","ปิดใช้งาน"],
    "sections.content":["正文","Content","本文","Текст","본문","เนื้อหา"],
    "sections.message":["回复内容","Reply text","返信テキスト","Текст ответа","답장 내용","ข้อความตอบกลับ"],
    "sections.keys":["主关键词","Primary keywords","主キーワード","Основные ключи","주요 키워드","คีย์เวิร์ดหลัก"],
    "sections.pattern":["查找表达式","Find pattern","検索パターン","Шаблон поиска","검색 패턴","รูปแบบการค้นหา"],
    "sections.replacement":["替换文本","Replacement text","置換テキスト","Текст замены","바꿀 텍스트","ข้อความแทนที่"]
  };
  const languages=['zh','en','ja','ru','ko','th'];
  root.TAI18n.add(Object.fromEntries(Object.entries(messages).map(([key,row])=>[key,
    Object.fromEntries(languages.map((lang,i)=>[lang,row[i]]))])));
  const SECTION_PRESET = 'preset_sections';
  const SECTION_BOOK = 'book_sections';
  const R18_TEXT = {
    hint: '成人内容只可暗示。用停顿、光线、衣料和呼吸带过，不写具体性行为。双方都是成年人。谁迟疑，就停在暗示，并留出事后照料的位置。未成年、真实伤害、未经同意，这些硬界限不能越过。',
    explicit: '这是成年人之间的场面，可以写明确的成人亲密。每一步都要有清楚、而且可以撤回的同意。激烈之后写事后照料。硬界限一出现就停止，不劝，也不绕过。',
    consent: '同意比情节优先。拒绝、僵住，或说出停止，就立刻退出亲密场面。不用醉酒、胁迫或「停不下来」越过界限。结束后先照料，再决定要不要继续。硬界限始终有效。',
  };
  const NSFW_NOTE = {
    tease: '把张力留在将碰未碰：距离、呼吸、称呼的停顿。不进入明确的性行为。',
    explicit: '可以写明确的成人亲密，但同意必须清楚，而且随时能收回。不要把沉默当成答应。',
    after: '亲密已经过去。写体温退下去、水、毯子和确认对方还好。不再加新的性行为。',
  };
  const NSFW_LORE = {
    tease: { keys: ['靠近', '呼吸', '距离'], content: '两人之间是暧昧，还没有说破。可以写几乎碰到的手和变慢的呼吸。不要写明确的性行为。再往前就先停住。' },
    explicit: { keys: ['亲吻', '衣料', '床'], content: '这是成年人的亲密。可以明确，但每一步都要听得见同意。任何迟疑都先停。硬界限不能写成可以商量。' },
    after: { keys: ['事后', '毯子', '水'], content: '事情已经结束。这一段只写余韵和照料：水、毯子、安静，以及问对方还好不好。不要重新开始。' },
  };
  const STYLE_TEXT = {
    short: '句子短。少形容词。一句只做一件事。',
    long: '允许把环境、触觉和光线写长。句子可以慢慢收束。',
    talk: '多用对白推进。叙述只补动作和停顿。',
    spare: '不把情绪说满。留下没写完的半句，让空白自己工作。',
  };
  const BOND_TEXT = {
    stranger: '两人是陌生人。称呼用「你」或身份，不用爱称。没有默许的触碰。不能越过的线是身体距离和打探私事。',
    old: '两人是旧识。可以用名字和从前的称呼，默契可以有。新的越界仍要问。不能越过的线是把旧账当成现在的许可。',
    lover: '两人是恋人。可以用约定过的称呼。亲密是互相的，不是义务。不能越过的线是一方不想继续时仍往前。',
    foe: '两人敌对。称呼冷、短。敌意不是许可。不能越过的线是借冲突发生未经同意的亲密。',
  };

  function sectionText(group, fallback) {
    if (String(group.custom || '').trim()) return String(group.custom).trim();
    if (String(group.text || '').trim()) return String(group.text).trim();
    return fallback || '';
  }

  const definitions = {
    r18: {name:'R18', defaults:R18_TEXT}, nsfw:{name:'NSFW',defaults:NSFW_NOTE},
    style:{name:'文风',defaults:STYLE_TEXT}, pov:{name:'人称'}, bond:{name:'关系边界',defaults:BOND_TEXT},
    safe:{name:'安全词'}, format:{name:'输出格式'},
  };
  const containers={
    promptPresets:{id:SECTION_PRESET,children:'blocks',name:'叙翎集段落'},
    worldBooks:{id:SECTION_BOOK,children:'entries',name:'叙翎集段落',description:'段落预设写入的条目'},
    quickReplySets:{id:'sec_format_qr',children:'replies',name:'输出格式'},
  };
  const destinationNames={promptPresets:'提示词块',worldBooks:'sections.lore',regexScripts:'正则脚本',quickReplySets:'快捷回复'};
  const fieldNames={enabled:'sections.enabled',disabled:'sections.disabled',content:'sections.content',message:'sections.message',keys:'sections.keys',findRegex:'sections.pattern',replaceString:'sections.replacement'};
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const object=value=>value && typeof value==='object' && !Array.isArray(value);
  function safeText(word) {
    return '安全词是「'+(String(word || '').trim() || '停')+'」。角色或用户一说出这个词，立刻停止当前亲密或冲突，回到普通对话，先确认对方还要不要继续。不要把这个词当成玩笑带过。';
  }
  function template(key,s) {
    if(key==='safe')return safeText(s.word);
    if(key==='pov')return (s.preset==='first'?'用第一人称「我」来写。':'用第三人称，写角色名或「她/他」，不要滑进「我」。')+(s.thoughts?'可以写很短的内心一念，不要长篇独白。':'不写内心独白，只写看得到的动作和对白。');
    if(key==='format')return '动作用星号包起来，说出的话用引号。段末另起一行写状态：地点、时间、两人距离。';
    const options=definitions[key].defaults;return options[s.preset] || Object.values(options)[0];
  }
  // Creation defaults apply once. Subsequent synchronization owns only the fields
  // driven by the corresponding section's controls.
  function targets(key,s) {
    const content=sectionText(s,template(key,s)), enabled=!!(s.on && content);
    const results=[];
    if(['r18','nsfw','style','pov'].includes(key))results.push({
      bucket:'promptPresets',id:'sec_'+key,defaults:{name:definitions[key].name,kind:'author_note',role:'system'},fields:{content,enabled},
    });
    if(['nsfw','bond','safe'].includes(key)) {
      const native=NSFW_LORE[s.preset] || NSFW_LORE.tease;
      const defaults={comment:definitions[key].name,keys:['称呼','你'],secondaryKeys:[],constant:key==='safe',selective:key!=='safe',
        order:{nsfw:30,bond:20,safe:1}[key],position:key==='nsfw'?'after_char':'before_char',depth:4,outletName:''};
      const fields={content,enabled:!!s.on};
      if(key==='safe')fields.keys=[String(s.word||'').trim() || '停'];
      if(key==='nsfw'){fields.keys=native.keys;fields.content=String(s.custom||'').trim()?content:native.content;}
      results.push({bucket:'worldBooks',id:key==='nsfw'?'sec_nsfw_lore':'sec_'+key,defaults,fields});
    }
    if(key==='format') {
      results.push({bucket:'regexScripts',id:'sec_format_rx',defaults:{scriptName:'输出格式',trimStrings:[],placement:[2],markdownOnly:false,promptOnly:false,runOnEdit:false,substituteRegex:0,minDepth:null,maxDepth:null},
        fields:{findRegex:String(s.find || '').trim() || '/（([^）\\n]+)）/g',replaceString:s.replace || '*$1*',disabled:!s.on}});
      results.push({bucket:'quickReplySets',id:'sec_format_reply',defaults:{label:'输出格式',color:'#d6ff3f',title:'动作用星号，对白用引号'},
        fields:{message:content},removeWhenOff:true});
    }
    return results;
  }
  function rowsFor(lib,target,create=false) {
    const rows=lib[target.bucket], layout=containers[target.bucket];
    if(!layout)return rows;
    let parent=rows.find(row=>row.id===layout.id);
    if(!parent && create) {
      parent={id:layout.id,name:layout.name,[layout.children]:[]};
      if(layout.description)parent.description=layout.description;
      if(target.bucket==='worldBooks')rows.push(parent);else rows.unshift(parent);
    }
    return parent?.[layout.children];
  }
  const fullRow=(target,fields)=>({id:target.id,...target.defaults,...fields});
  function matchesGeneratedRow(row,target,baseline) {
    if(!object(baseline))return false;
    const generated=fullRow(target,baseline), keys=Object.keys(row);
    return keys.length===Object.keys(generated).length && keys.every(key=>
      Object.hasOwn(generated,key) && equal(row[key],generated[key]));
  }
  function differences(lib,key,previous) {
    const section=lib.sections[key],desired=targets(key,section);
    const old=previous && targets(key,previous);
    const ops=[];
    for(const [i,target] of desired.entries()) {
      const row=rowsFor(lib,target)?.find(r=>r.id===target.id);
      const previousFields=old?.[i].fields;
      const record=section.sync?.[target.id];
      const add=(field,before,after,automatic)=>ops.push({target,field,before,after,automatic});
      if(!row) {
        if(section.on && (!previous || previous.on!==section.on || !equal(previousFields,target.fields))) {
          // A previously known row that went missing may have been deliberately deleted.
          add('$row',null,fullRow(target,target.fields),!!record?.removed || (!record && previous?.on===false));
        }
      } else if(target.removeWhenOff && !section.on) {
        if(!previous || previous.on)add('$row',row,null,matchesGeneratedRow(row,target,record?.base));
      } else {
        for(const [field,after] of Object.entries(target.fields)) {
          if(equal(row[field],after) || (previousFields && equal(previousFields[field],after)))continue;
          add(field,row[field],after,!!record?.base && Object.hasOwn(record.base,field) && equal(row[field],record.base[field]));
        }
      }
    }
    return ops;
  }
  // Baselines contain only values actually applied to a work. Missing provenance
  // never grants permission to replace existing values in an older library.
  function syncRecord(section,id) {
    if(!object(section.sync))section.sync={};
    if(!object(section.sync[id]))section.sync[id]={};
    return section.sync[id];
  }
  function write(lib,key,op) {
    const {target,field,after}=op, record=syncRecord(lib.sections[key],target.id);
    const rows=rowsFor(lib,target,true), index=rows.findIndex(row=>row.id===target.id);
    if(field==='$row') {
      if(after===null){rows.splice(index,1);delete record.base;record.removed=true;}
      else {rows.push(structuredClone(after));record.base=structuredClone(target.fields);delete record.removed;}
    } else {
      rows[index][field]=structuredClone(after);
      if(!object(record.base))record.base={};
      record.base[field]=structuredClone(after);delete record.removed;
    }
  }
  function scopesFor(lib,ops) {
    const scopes=[['sections']],seen=new Set();
    for(const {target} of ops) {
      const {bucket,id}=target,ownerId=containers[bucket]?.id || id;
      if(!lib[bucket].some(row=>row.id===ownerId))return null;
      if(!seen.has(bucket)){scopes.push([bucket,ownerId]);seen.add(bucket);}
    }
    return scopes;
  }
  function change(lib,key,update) {
    const section=lib.sections[key], previous={...section};
    update(section);
    const changes=differences(lib,key,previous);
    const automatic=changes.filter(op=>op.automatic),scopes=scopesFor(lib,automatic);
    for(const op of automatic)write(lib,key,op);
    if(scopes)for(const scope of scopes)UI.markDirty(...scope);
    else UI.markDirty();
  }
  function reviewValue(value) {
    if(value==null)return UI.t('sections.absent');
    if(Array.isArray(value))return value.map(reviewValue).join(' · ') || '∅';
    if(object(value))return Object.entries(value).map(([key,item])=>
      UI.t(fieldNames[key] || key)+' · '+reviewValue(item)).join('\n');
    return String(value);
  }
  async function review(key) {
    try {
      const planned=differences(UI.state.lib,key);
      if(!planned.length){UI.toast(UI.t('sections.inSync'));return;}
      const signature=ops=>JSON.stringify(ops.map(({target,field,before,after})=>[target.id,field,before,after]));
      const revision=signature(planned);
      const content=document.createElement('div');content.className='integrity-content';
      const choices=planned.map(op=>{
        const row=document.createElement('article');row.className='paper stack';
        const heading=document.createElement('strong');
        const label=UI.t(destinationNames[op.target.bucket])+' · '+UI.t(op.field==='$row'?'sections.record':fieldNames[op.field]);
        heading.textContent=label;
        const columns=document.createElement('div');columns.className='integrity-diff';
        for(const [key,val] of [['sections.current',op.before],['sections.proposed',op.after]]) {
          const col=document.createElement('section'),title=document.createElement('b'),value=document.createElement('pre');
          title.textContent=UI.t(key);value.dataset.noTranslate='';value.textContent=reviewValue(val);
          col.append(title,value);columns.append(col);
        }
        const select=document.createElement('select');select.dataset.sectionChoice=op.field;select.setAttribute('aria-label',label);
        select.add(new Option(UI.t('保留当前'),'keep'));select.add(new Option(UI.t('sections.use'),'section'));
        row.append(heading,columns,select);content.append(row);return select;
      });
      const answer=await UI.ask({title:UI.t('sections.review'),body:UI.t('sections.reviewHelp'),content,
        actions:[{id:'cancel',label:UI.t('取消')},{id:'apply',label:UI.t('sections.apply'),kind:'btn-primary'}]});
      if(answer!=='apply')return;
      const live=UI.state.lib,now=differences(live,key);
      if(signature(now)!==revision)throw Error('资料库已变化，请重新打开。');
      const chosen=now.filter((_,i)=>choices[i].value==='section'),scopes=scopesFor(live,chosen);
      if(!chosen.length)return;
      const section=structuredClone(live.sections[key]), candidate={...live,sections:{...live.sections,[key]:section}};
      for(const {target} of chosen)if(candidate[target.bucket]===live[target.bucket]){
        const owner=containers[target.bucket]?.id || target.id;
        candidate[target.bucket]=live[target.bucket].map(row=>row.id===owner?structuredClone(row):row);
      }
      for(const op of chosen)write(candidate,key,op);
      await UI.commitLibrary(candidate,[],false,null,{scopes});UI.renderStage();
    } catch(error) {UI.toast(UI.t(error.message),{kind:'error'});}
  }
  function render(stage) {
    const lib=UI.state.lib,s=lib.sections;
    const displayText=key=>String(s[key].custom||'').trim()?s[key].custom:s[key].text||template(key,s[key]);
    const chips=(group,options)=>options.map(([id,label])=>'<button type="button" class="btn btn-small'+(group.preset===id?' btn-primary':'')+'" data-pick="'+id+'">'+label+'</button>').join('');
    stage.innerHTML = `<div class="stack">
      <section class="paper stack"><div class="row"><label class="check"><input type="checkbox" data-sec="r18" ${s.r18.on ? 'checked' : ''}>R18</label><span class="muted">默认关闭。只管尺度、同意、事后照料和硬界限。</span></div>
        <div class="row">${chips(s.r18, [['hint', '只暗示'], ['explicit', '明确成人'], ['consent', '强制同意边界']])}</div>
        ${UI.field('填入的作者注', `<textarea data-live="r18" rows="4">${UI.esc(displayText('r18'))}</textarea>`)}
        ${UI.field('自定义', `<textarea data-custom="r18" rows="3" placeholder="有字时盖过预设">${UI.esc(s.r18.custom || '')}</textarea>`)}
      </section>
      <section class="paper stack"><div class="row"><label class="check"><input type="checkbox" data-sec="nsfw" ${s.nsfw.on ? 'checked' : ''}>NSFW</label><span class="muted">和 R18 分开。关闭时不显示预设。</span></div>
        ${s.nsfw.on ? `<div class="row">${chips(s.nsfw, [['tease', '暧昧拉扯'], ['explicit', '明确成人'], ['after', '事后余韵']])}</div>
        ${UI.field('填入的作者注', `<textarea data-live="nsfw" rows="3">${UI.esc(displayText('nsfw'))}</textarea>`)}
        ${UI.field('自定义', `<textarea data-custom="nsfw" rows="2" placeholder="有字时盖过预设">${UI.esc(s.nsfw.custom || '')}</textarea>`)}
        <p class="help">开启后还会写一条世界书：关键词随预设变化。</p>` : ''}
      </section>
      <section class="paper stack"><div class="row"><label class="check"><input type="checkbox" data-sec="style" ${s.style.on ? 'checked' : ''}>文风</label></div>
        <div class="row">${chips(s.style, [['short', '短句干脆'], ['long', '长描写'], ['talk', '对话为主'], ['spare', '冷一点的留白']])}</div>
        ${UI.field('填入的作者注', `<textarea data-live="style" rows="3">${UI.esc(displayText('style'))}</textarea>`)}
        ${UI.field('自定义', `<textarea data-custom="style" rows="2" placeholder="有字时盖过预设">${UI.esc(s.style.custom || '')}</textarea>`)}
      </section>
      <section class="paper stack"><div class="row"><label class="check"><input type="checkbox" data-sec="pov" ${s.pov.on ? 'checked' : ''}>人称和视角</label>
        <button type="button" class="btn btn-small${s.pov.preset === 'first' ? ' btn-primary' : ''}" data-pov="first">第一人称</button>
        <button type="button" class="btn btn-small${s.pov.preset === 'third' ? ' btn-primary' : ''}" data-pov="third">第三人称</button>
        <label class="check"><input type="checkbox" id="pov-thoughts" ${s.pov.thoughts ? 'checked' : ''}>写内心</label></div>
        ${UI.field('填入的作者注', `<textarea data-live="pov" rows="3">${UI.esc(displayText('pov'))}</textarea>`)}
        ${UI.field('自定义', `<textarea data-custom="pov" rows="2" placeholder="有字时盖过预设">${UI.esc(s.pov.custom || '')}</textarea>`)}
      </section>
      <section class="paper stack"><div class="row"><label class="check"><input type="checkbox" data-sec="bond" ${s.bond.on ? 'checked' : ''}>关系边界</label></div>
        <div class="row">${chips(s.bond, [['stranger', '陌生人'], ['old', '旧识'], ['lover', '恋人'], ['foe', '敌对']])}</div>
        ${UI.field('填入的世界书', `<textarea data-live="bond" rows="3">${UI.esc(displayText('bond'))}</textarea>`)}
        ${UI.field('自定义', `<textarea data-custom="bond" rows="2" placeholder="有字时盖过预设">${UI.esc(s.bond.custom || '')}</textarea>`)}
        <p class="help">写成一条世界书：称呼，以及不能越过的那条线。</p>
      </section>
      <section class="paper stack"><div class="row"><label class="check"><input type="checkbox" data-sec="safe" ${s.safe.on ? 'checked' : ''}>安全词和停止条件</label></div>
        ${UI.field('安全词', `<input data-word type="text" value="${UI.esc(s.safe.word ?? '停')}">`)}
        ${UI.field('填入的恒定世界书', `<textarea data-live="safe" rows="3">${UI.esc(displayText('safe'))}</textarea>`)}
        ${UI.field('自定义', `<textarea data-custom="safe" rows="2" placeholder="有字时盖过预设">${UI.esc(s.safe.custom || '')}</textarea>`)}
        <p class="help">恒定条目。角色或用户说出这个词，就停止。</p>
      </section>
      <section class="paper stack"><div class="row"><label class="check"><input type="checkbox" data-sec="format" ${s.format.on ? 'checked' : ''}>输出格式</label></div>
        ${UI.field('快捷回复', `<textarea data-live="format" rows="3">${UI.esc(displayText('format'))}</textarea>`)}
        ${UI.field('自定义', `<textarea data-custom="format" rows="2" placeholder="有字时盖过这条快捷回复">${UI.esc(s.format.custom || '')}</textarea>`)}
        <p class="help">同时写入一条正则：把中文括号里的动作改成星号。可以在正则脚本里再改。</p>
      </section>
    </div>`;
    function refresh(key) {
      const reviewButton=stage.querySelector('[data-review-section="'+key+'"]');
      reviewButton.hidden=differences(lib,key).length===0;
      const value=s[key];
      for(const [selector,text] of [['live',displayText(key)],['custom',value.custom || '']]) {
        const area=stage.querySelector('[data-'+selector+'="'+key+'"]');
        if(area && area!==document.activeElement && area.value!==text)area.value=text;
      }
    }
    function update(key,mutate,redraw=false) {
      if(UI.state.lib!==lib){UI.renderStage();return;}
      change(lib,key,mutate);
      if(redraw)UI.renderStage();else refresh(key);
    }
    stage.querySelectorAll('[data-sec]').forEach(box=>{
      const key=box.dataset.sec,button=document.createElement('button');
      button.type='button';button.className='btn btn-small';button.dataset.reviewSection=key;button.textContent=UI.t('sections.review');
      button.onclick=()=>review(key);box.closest('section').append(button);refresh(key);
      box.onchange=()=>update(key,group=>{group.on=box.checked;},true);
    });
    stage.querySelectorAll('[data-pick]').forEach(button=>{
      const key=button.closest('section').querySelector('[data-sec]').dataset.sec;
      button.onclick=()=>update(key,group=>{
        group.preset=button.dataset.pick;
        if(!String(group.custom || '').trim())group.text=template(key,group);
      },true);
    });
    stage.querySelectorAll('[data-pov]').forEach(button=>{
      button.onclick=()=>update('pov',group=>{
        group.preset=button.dataset.pov;if(!String(group.custom||'').trim())group.text='';
      },true);
    });
    const thoughts=stage.querySelector('#pov-thoughts');
    thoughts.onchange=()=>update('pov',group=>{
      group.thoughts=thoughts.checked;if(!String(group.custom||'').trim())group.text='';
    },true);
    const word=stage.querySelector('[data-word]');
    let composing=false;
    function changeWord() {
      if(!word.isConnected || word.value===s.safe.word)return;
      update('safe',group=>{
        if(group.text===safeText(group.word))group.text='';
        group.word=word.value;
      });
    }
    word.addEventListener('compositionstart',()=>{composing=true;});
    word.addEventListener('compositionend',()=>{composing=false;queueMicrotask(changeWord);});
    word.oninput=event=>{if(!composing && !event.isComposing)changeWord();};
    stage.querySelectorAll('[data-live]').forEach(area=>{
      const key=area.dataset.live;
      area.oninput=()=>update(key,group=>{
        if(String(group.custom||'').trim())group.custom=area.value;else group.text=area.value;
      });
    });
    stage.querySelectorAll('[data-custom]').forEach(area=>{
      area.oninput=()=>update(area.dataset.custom,group=>{group.custom=area.value;});
    });
  }
  root.TASections={render};
})(globalThis);
