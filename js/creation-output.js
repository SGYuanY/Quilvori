/* Turn model-authored card/book JSON into independently validated draft inputs. */
(function (root) {
  'use strict';
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const own = (value,key) => object(value) && Object.hasOwn(value,key);
  const text = value => typeof value === 'string' && !!value.trim();
  const tr = name => root.TAI18n?.t(name) || name;
  function fail(message) { throw new Error(tr(message)); }

  const wrappers = {
    character: ['character','character_card','characterCard','char_card','角色卡','角色','人物卡','人物','card'],
    world: ['world','worldbook','worldBook','world_book','lorebook','loreBook','lore_book','world_info','worldInfo','world_info_book','世界书','世界書','世界觀書','世界观书','世界设定集','设定集'],
  };
  const embedded = ['character_book','characterBook','角色书','内嵌世界书'];
  const cardEnvelopes = ['data','character_data','角色资料','角色信息'];
  const names = ['name','character_name','characterName','姓名','名字','角色名','角色名称','名称'];
  const worldNames = ['name','title','book_name','world_name','worldTitle','worldName','书名','世界书名','世界书名称','名称','名字'];
  const entrySets = ['entries','worldEntries','world_entries','条目','条目列表','世界书条目','词条'];
  const cardFields = {
    name:names,
    description:['description','角色描述','人物描述','角色简介','人物简介','简介','描述'],
    personality:['personality','性格','个性','个性特征','性格特点','性格特征'],
    scenario:['scenario','场景','情景','开场情景','场景设定'],
    first_mes:['first_mes','first_message','firstMessage','firstMes','greeting','first_greeting','开场白','首条消息','主开场白','开场对白'],
    mes_example:['mes_example','example_dialogue','example_dialogues','example_messages','exampleDialogue','message_example','对话示例','示例对话'],
    alternate_greetings:['alternate_greetings','alternateGreetings','备选开场白','备用开场白','备用开场'],
    system_prompt:['system_prompt','systemPrompt','系统提示','系统提示词'],
    post_history_instructions:['post_history_instructions','postHistoryInstructions','历史后指令','聊天历史后指令'],
    creator_notes:['creator_notes','creatorcomment','creatorNotes','作者备注','创作者备注'],
    creator:['creator','author','作者','创作者'],
    character_version:['character_version','characterVersion','角色版本','角色卡版本'],
    tags:['tags','标签'],
  };
  const profile = new Set([
    'age','gender','sex','species','race','appearance','physical_appearance','physicalAppearance','looks','height','weight',
    'hair','eyes','skin','body','clothing','attire','outfit','build','voice','aliases','alias','nickname','occupation',
    'profession','role','identity','identity_details','background','backstory','history','traits','abilities','skills',
    'strengths','weaknesses','interests','likes','dislikes','hobbies','goals','motivation','relationships','speech','speech_style','mannerisms','habits',
    '年龄','性别','种族','外貌','样貌','外观','外貌描述','体貌','外形','身高','体重','发色','眼睛','发型','肤色','体型','服饰','衣着','穿着',
    '身份','职业','别名','昵称','背景','人物背景','背景故事','经历','来历','特征','能力','技能','优点','缺点','兴趣','爱好','喜好','厌恶','目标',
    '动机','人际关系','关系','说话方式','语气','口癖','习惯',
  ]);
  const entryFields = {
    comment:['comment','name','title','entry_name','entryName','条目名','条目名称','名称','标题'],
    content:['content','body','text','description','正文','条目正文','内容','条目内容','描述'],
    keys:['keys','key','keywords','primary_keys','primaryKeys','触发关键词','主关键词','关键词','关键字','触发词'],
    secondaryKeys:['secondaryKeys','secondary_keys','keysecondary','secondary_keywords','次关键词','次级关键词','次触发词'],
    constant:['constant','always_active','alwaysActive','常驻','恒定注入'],
    selective:['selective','选择性'],enabled:['enabled','启用'],order:['order','insertion_order','顺序','优先级'],
    depth:['depth','深度'],position:['position','insertion_position','注入位置','位置'],
  };
  const matches = (value,keys)=>keys.filter(key=>own(value,key));
  // Different aliases can legitimately repeat the same content in a card envelope.
  function read(value,keys) {
    const found=matches(value,keys);
    if(!found.length) return undefined;
    const first=value[found[0]];
    if(found.slice(1).some(key=>JSON.stringify(value[key])!==JSON.stringify(first))) fail('同一栏位有互相冲突的值。');
    return first;
  }
  function words(value) {
    if(typeof value==='string') return value.split(/[,，、;\n；]/u).map(word=>word.trim()).filter(Boolean);
    return Array.isArray(value)?value.slice():value;
  }
  function written(value) {
    if (typeof value==='string')return value;
    if(Array.isArray(value) && value.every(item=>typeof item==='string'))return value.join('\n');
    if(value!==undefined && value!==null)return JSON.stringify(value,null,2);
    return '';
  }
  function card(input) {
    if (!object(input)) fail('模型没有返回有效的角色卡。');
    const wrapper=matches(input,cardEnvelopes).find(key=>object(input[key]) && (own(input,'spec') || matches(input[key],names).length));
    const wrapped=!!wrapper, data=wrapper?input[wrapper]:input;
    const result={};
    for(const [field,aliases] of Object.entries(cardFields)){
      let value=read(data,aliases);
      if(value===undefined && wrapped) value=read(input,aliases);
      if(value===undefined)continue;
      if(field==='tags') value=words(value);
      else if(field==='alternate_greetings' && typeof value==='string') value=[value];
      else if(['description','personality','scenario','mes_example'].includes(field) && (object(value)||Array.isArray(value)))value=written(value);
      if(Array.isArray(value))value=value.slice();
      result[field]=value;
    }
    if(!text(result.name))fail('新角色卡缺少名字。');
    const facts=Object.entries(data).filter(([key])=>profile.has(key));
    if(facts.length){
      const parts=result.description===undefined || result.description===''?[]:[result.description];
      if(parts.some(value=>typeof value!=='string')) fail('角色描述字段格式无效。');
      for(const [key,value] of facts) {
        if(value!==null && value!==undefined && value!=='')parts.push(key+'：'+written(value));
      }
      if(parts.length)result.description=parts.join('\n\n');
    }
    return result;
  }
  function entry(input) {
    if(!object(input))fail('世界书条目缺少条目名或正文。');
    const result={};
    for(const [field,aliases] of Object.entries(entryFields)){
      let value=read(input,aliases);
      if(value===undefined)continue;
      if(field==='keys'||field==='secondaryKeys') value=words(value);
      if((field==='order'||field==='depth') && typeof value==='string' && /^\d+(?:\.\d+)?$/.test(value.trim()))value=Number(value);
      result[field]=value;
    }
    if(own(input,'disable')){
      if(typeof input.disable!=='boolean')fail('条目开关必须是布尔值。');
      if(result.enabled!==undefined && result.enabled===input.disable)fail('同一栏位有互相冲突的值。');
      result.enabled=!input.disable;
    }
    const ext=input.extensions;
    if(own(ext,'depth') && result.depth===undefined)result.depth=ext.depth;
    const position=own(ext,'position')?ext.position:result.position;
    if(position!==undefined){
      const known=root.TAFormats.POSITIONS.find(p=>position===p.id || position===p.label || position===p.st || String(p.st)===position);
      if(!known)fail('条目注入位置无效。');
      result.position=known.id;
    }
    return result;
  }
  const entryMap=value=>object(value) && Object.keys(value).length>0 && Object.keys(value).every(k=>/^(?:0|[1-9]\d*)$/.test(k));
  function isEntry(value) {
    return matches(value,entryFields.content).length>0 && matches(value,['comment','条目名','条目名称',...entryFields.keys]).length>0;
  }
  function hasCardContent(value) {
    return Object.keys(value).some(key=>profile.has(key)) || Object.entries(cardFields).some(([field,aliases])=>field!=='name' && matches(value,aliases).length);
  }
  function world(value,fallback) {
    if(!Array.isArray(value) && !object(value))fail('新世界书需要书名和有效条目。');
    const src=object(value.data)&&matches(value.data,entrySets).length?value.data:value;
    const singleEntry=!Array.isArray(src) && !matches(src,entrySets).length && matches(src,entryFields.comment).length && matches(src,entryFields.content).length;
    let name=singleEntry?undefined:read(src,worldNames);
    if(name===undefined && src!==value)name=read(value,worldNames);
    if (name!==undefined && typeof name!=='string')fail('新世界书需要书名和有效条目。');
    let supplied=Array.isArray(src) || entryMap(src)?src:read(src,entrySets);
    if(supplied===undefined && matches(src,entryFields.comment).length && matches(src,entryFields.content).length)supplied=[src];
    if(!Array.isArray(supplied) && !object(supplied))fail('新世界书需要书名和有效条目。');
    const list=Array.isArray(supplied)?supplied:Object.values(supplied);
    return {name:text(name)?name:fallback,entries:list.map(entry)};
  }
  function parse(raw) {
    if(typeof raw!=='string')return raw;
    const trimmed=raw.trim().replace(/^\uFEFF/,'');
    const parser=root.NIJANModel?.parseJson || JSON.parse;
    try{return parser(trimmed);}catch(_){}
    const fence=String.fromCharCode(96).repeat(3);
    const fenced = [...trimmed.matchAll(new RegExp('(?:^|\\n)[ \\t]*'+fence+'(?:json)?[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n[ \\t]*'+fence+'(?=[ \\t]*(?:\\n|$))','gi'))];
    if(fenced.length){
      try {
        const values=fenced.map(match=>JSON.parse(match[1]));
        return values.length===1?values[0]:values;
      } catch(_){}
    }
    fail('模型返回的内容不是完整 JSON，原稿已保留。请重试或缩小范围。');
  }
  function collect(rawOrObject,requestedKinds,context={}) {
    const kinds=typeof requestedKinds==='string'?[requestedKinds]:Array.from(requestedKinds || []);
    const requested=new Set(kinds.map(kind=>String(kind).replace(/^create:/,'')));
    const results={},errors={},ignored=new Set(),found={character:[],world:[]};
    const report = (code) => ({results,errors,present:Object.keys(found).filter(kind=>found[kind].length),ignored:[...ignored],...(code?{code}:{})});
    function mark(kind,value){found[kind].push(value);if(!requested.has(kind))ignored.add(kind);}
    function addCard(value, includeEmbedded=true){
      mark('character',value);
      if(includeEmbedded){
        const key=matches(value,cardEnvelopes).find(k=>object(value[k]));
        const data=key?value[key]:value;
        for(const book of matches(data,embedded))mark('world',data[book]);
      }
    }
    function locate(value,allowList=true) {
      if(Array.isArray(value)){
        const hasEntry=value.some(item=>isEntry(item) || (matches(item,['content','正文']).length && matches(item,entryFields.comment).length));
        const hasModules=value.some(item=>matches(item,[...wrappers.character,...wrappers.world,...entrySets]).length);
        if(hasEntry && !hasModules)mark('world',value);
        else if(allowList && value.length===1)locate(value[0],false);
        else if(allowList)for(const item of value)locate(item,false);
        return;
      }
      if(!object(value))return;
      const cards=matches(value,wrappers.character), books=matches(value,wrappers.world);
      if(cards.length || books.length){
        for(const key of cards)addCard(value[key]);
        for(const key of books)mark('world',value[key]);
        // Some services append a companion to a bare ST-compatible character instead of wrapping both.
        if(!cards.length && matches(value,names).length && hasCardContent(value))addCard(value,false);
        return;
      }
      if(typeof value.spec==='string' && /^chara_card_v[23]$/i.test(value.spec)) {addCard(value);return;}
      if(matches(value,entrySets).length || (object(value.data)&&matches(value.data,entrySets).length) || entryMap(value) ||
          isEntry(value)) {mark('world',value);return;}
      const dataKey=matches(value,cardEnvelopes).find(k=>object(value[k]) && matches(value[k],names).length);
      const data=dataKey?value[dataKey]:value;
      if(hasCardContent(data) || (matches(data,names).length && requested.size===1 && requested.has('character'))){addCard(value);return;}
      const envelope=matches(value,['result','output','data','结果']);
      if(envelope.length===1)locate(value[envelope[0]],allowList);
    }
    try{
      const parsed=parse(rawOrObject);
      if(parsed?.error||parsed?.unsure||['error','needs_input'].includes(parsed?.status)){
        if(parsed.status==='error'||parsed.error){
          const err=new Error(typeof parsed.error==='string'?parsed.error:parsed.error?.message||tr('模型未完成任务。'));err.code='model-error';throw err;
        }
        root.NIJANAI.validate('create:character',parsed,context);
      }
      locate(parsed);
    }catch(error){
      for(const kind of requested)if(own(found,kind))errors[kind]=error.message;
      return report(error.code || 'invalid-output');
    }
    let fallbackName=text(context.worldTitle)?context.worldTitle:tr('世界书');
    if(!text(context.worldTitle) && found.character.length===1){
      try{const companion=card(found.character[0]);if(text(companion.name))fallbackName=companion.name+' · '+tr('世界书');}catch(_){}
    }
    for (const kind of ['character','world']){
      if(!requested.has(kind))continue;
      try {
        const list=found[kind];
        if(!list.length)fail(kind==='character'?'模型回复中没有角色卡。':'模型回复中没有世界书。');
        if(list.length!==1)fail(kind==='character'?'回复包含多张角色卡，请指定一张。':'回复包含多本世界书，请指定一本。');
        const draft=kind==='character'?card(list[0]):world(list[0],fallbackName);
        results[kind]=root.NIJANAI.validate('create:'+kind,{[kind]:draft},context);
      }catch(error){errors[kind]=error.message;}
    }
    return report();
  }
  root.NIJANCreationOutput={collect};
})(globalThis);
