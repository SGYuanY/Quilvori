/* Local estimates and deterministic world-info analysis. Never calls a provider. */
(function (root) {
  'use strict';
  const words = /[\p{L}\p{N}_]/u;
  const wide = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;
  function tokenWeight(ch) {
    if (wide.test(ch)) return 1.4;
    if (/\p{Extended_Pictographic}/u.test(ch)) return 2;
    if (words.test(ch)) return ch.charCodeAt(0) > 127 ? .55 : .25;
    return /\s/u.test(ch) ? .23 : .65;
  }
  function estimate(value) {
    let chars = 0, units = 0;
    for (const ch of String(value ?? '')) { chars++; units += tokenWeight(ch); }
    return { chars, tokens: Math.ceil(units) };
  }
  const sizes = new WeakMap();
  function entrySize(entry) {
    if (sizes.get(entry)?.content !== (entry.content ?? '')) {
      sizes.set(entry, {content:entry.content ?? '', size:estimate(entry.content)});
    }
    return sizes.get(entry).size;
  }
  function totals(book) {
    const stats = {tokens:0, chars:0, enabled:0, constants:0, constantTokens:0, constantChars:0};
    for (const entry of book.entries) {
      const size = entrySize(entry);
      stats.tokens += size.tokens; stats.chars += size.chars;
      if (entry.enabled === false) continue;
      stats.enabled++;
      if (entry.constant) {
        stats.constants++; stats.constantTokens += size.tokens; stats.constantChars += size.chars;
      }
    }
    return stats;
  }
  const keysOf = list => (Array.isArray(list) ? list : []).map(key=>String(key).trim()).filter(Boolean);
  const unsupportedKey = key => /^\/.+\/[dgimsuvy]*$/s.test(key) || key.includes('{{');
  function match(text, key, entry) {
    if (!key || unsupportedKey(key)) return false;
    const source = entry.caseSensitive ? text : text.toLowerCase();
    const needle = entry.caseSensitive ? key : key.toLowerCase();
    if (!entry.matchWholeWords || /\s/.test(needle)) return source.includes(needle);
    const literal = needle.replace(/[.*+?^\x24\x7b\x7d()|[\]\\]/g, '\\$&');
    return new RegExp('(?:^|\\W)(' + literal + ')(?:$|\\W)', 'u').test(source);
  }
  // A regex or macro can still match at runtime. Only make a definitive
  // decision if the known literal hits and misses settle this secondary rule.
  function secondaryPass(logic, hits, unknown, count) {
    const misses = count - hits - unknown;
    switch (logic) {
      case 1: return misses > 0 || (unknown ? null : false); // NOT ALL
      case 2: return hits ? false : unknown ? null : true;     // NOT ANY
      case 3: return misses ? false : unknown ? null : true;   // AND ALL
      default: return hits > 0 || (unknown ? null : false);   // AND ANY
    }
  }
  function trigger(entry, sources, round, delay) {
    const settings = entry.stSettings || {};
    if (entry.enabled === false) return {reason:'已停用'};
    if (!String(entry.content || '').trim()) return {reason:'空正文'};
    if (entry.position === 'outlet' && !entry.outletName) return {reason:'缺少出口名'};
    if (settings.useProbability !== false && Number(settings.probability ?? 100) === 0) return {reason:'概率为零'};
    if (round && settings.excludeRecursion) return {reason:'跳过递归'};
    const requiredDelay = Number(settings.delayUntilRecursion || 0);
    if (requiredDelay > 0 && (!round || requiredDelay > delay)) return {reason:'等待递归'};
    if (entry.constant) return {reason:'',hits:[],secondary:[],lines:[],parents:[]};
    const keys = keysOf(entry.keys), secondary = keysOf(entry.secondaryKeys);
    const hits = keys.filter(key=>sources.some(row=>match(row.text,key,entry)));
    if (!hits.length) return {reason:keys.some(unsupportedKey) ? '正则或宏需在酒馆验证' : '主关键词未命中'};
    const second = secondary.filter(key=>sources.some(row=>match(row.text,key,entry)));
    const matchedSources = sources.filter(row=>[...hits,...second].some(key=>match(row.text,key,entry)));
    const evidence = {hits, secondary:second, lines:matchedSources.filter(row=>row.line).map(row=>row.line), parents:matchedSources.filter(row=>row.id).map(row=>row.id)};
    if (entry.selective && secondary.length) {
      const pass = secondaryPass(Number(entry.selectiveLogic ?? 0),second.length,secondary.filter(unsupportedKey).length,secondary.length);
      if (pass !== true) return {...evidence,reason:pass === false ? '次关键词条件未满足' : '正则或宏需在酒馆验证'};
    }
    return {...evidence,reason:''};
  }
  function runtimeChecks(entry,reason) {
    if (entry.enabled === false || !String(entry.content || '').trim()) return [];
    const settings = entry.stSettings || {}, checks = [];
    if (reason === '正则或宏需在酒馆验证') checks.push('正则或宏关键词');
    if (String(entry.content).includes('{{')) checks.push('正文宏展开');
    const probability = Number(settings.probability ?? 100);
    if (settings.useProbability !== false && probability > 0 && probability < 100) checks.push('概率抽取');
    if (settings.group) checks.push('分组抽选');
    if ([settings.sticky,settings.cooldown,settings.delay].some(n=>Number(n)>0)) checks.push('跨轮计时');
    if (settings.vectorized) checks.push('向量检索');
    if (settings.automationId || settings.triggers?.length || settings.characterFilter?.names?.length ||
      settings.characterFilter?.tags?.length || ['matchPersonaDescription','matchCharacterDescription','matchCharacterPersonality',
        'matchCharacterDepthPrompt','matchScenario','matchCreatorNotes'].some(key=>settings[key]===true)) checks.push('运行环境与外部上下文');
    return checks;
  }
  function simulate(book, dialogue, options = {}) {
    const lines = String(dialogue || '').split(/\r?\n/).map((text,i)=>({text,line:i+1})).filter(row=>row.text.trim());
    const limit = Math.max(0, Math.floor(Number(options.budget ?? 2048) || 0));
    const selected = [], groups = new Map(), diagnostics = new Map(), processed = new Set();
    const candidates = book.entries.map((entry,index)=>({entry,index}));
    candidates.sort((a,b)=>(b.entry.order ?? 100) - (a.entry.order ?? 100) || a.index - b.index);
    const delayed = [...new Set(candidates.map(row=>Number(row.entry.stSettings?.delayUntilRecursion || 0)).filter(value=>value > 0))].sort((a,b)=>a-b);
    let budgetUsed = 0, overflow = false, round = 0, delay = delayed.shift() || 0;
    const recursionText = [];
    while (true) {
      const additions = [];
      for (const {entry,index} of candidates) {
        if (processed.has(index)) continue;
        const settings = entry.stSettings || {};
        const depth = Math.min(1000,Math.max(0, Math.floor(Number(settings.scanDepth ?? options.scanDepth ?? 2) || 0)));
        const sources = depth ? [...lines.slice(-depth),...recursionText] : [];
        const result = trigger(entry,sources,round,delay);
        const size = entrySize(entry);
        if (!result.reason) {
          // Count separators in the budget. An over-budget candidate stops later
          // ordinary allocations. Entries exempt from the cap still occupy space.
          const cost = estimate(entry.content + '\n').tokens;
          if (!settings.ignoreBudget && (overflow || budgetUsed + cost >= limit)) {
            overflow = true; result.reason = '超出预算';
          } else {
            const position = entry.position || 'before_char';
            const slot = position === 'at_depth' ? [position,entry.depth ?? 4,settings.role ?? 0].join(' · ') :
              position === 'outlet' ? [position,entry.outletName].join(' · ') : position;
            const row = {...result,entry,index,round,slot,cost:size.tokens,chars:size.chars};
            selected.push(row); budgetUsed += cost;
            if (!groups.has(slot)) groups.set(slot,[]);
            groups.get(slot).push(row);
            if (!settings.preventRecursion) additions.push({text:String(entry.content),id:entry.id});
          }
          processed.add(index);
        }
        diagnostics.set(index,result);
      }
      if (!options.recursion || overflow) break;
      // ST advances delayed recursion levels when an ordinary pass has no more additions.
      if (!additions.length) {
        if (!delayed.length) break;
        delay = delayed.shift();
      } else recursionText.push(...additions);
      round++;
    }
    let chars = 0, spent = 0, outletTokens = 0;
    for (const rows of groups.values()) {
      const outlet = rows[0].entry.position === 'outlet';
      // ST prepends all regular slots and appends outlets after sorting by order.
      const direction = outlet ? -1 : 1;
      rows.sort((a,b)=>direction*((a.entry.order ?? 100)-(b.entry.order ?? 100) || b.round-a.round || b.index-a.index));
      const size = estimate(rows.map(row=>row.entry.content).join('\n'));
      if (outlet) outletTokens += size.tokens;
      else { chars += size.chars; spent += size.tokens; }
    }
    const included = new Set(selected.map(row=>row.index));
    const skipped = candidates.filter(row=>!included.has(row.index)).map(({entry,index})=>({entry,...diagnostics.get(index),cost:entrySize(entry).tokens}));
    const verifyInST = [];
    for (const row of [...selected,...skipped]) {
      const reasons=runtimeChecks(row.entry,row.reason);
      if (reasons.length) verifyInST.push({entry:row.entry,reasons});
    }
    return {groups,skipped,selected,verifyInST,chars,spent,outletTokens,budgetUsed,limit};
  }
  function suggestions(entry) {
    const keys = keysOf(entry.keys).filter(key => !unsupportedKey(key) && [...key].length > 1);
    if (keys.length) return keys;
    const title = String(entry.comment || '').trim();
    if (!title || /核心|总纲|全局|基本规则|通则|常驻|未命名|untitled|global|general rules?|core rules?|always/i.test(title)) return [];
    const terms = title.split(/[,，。·、|:：()（）/—]+/).map(key=>key.trim()).filter(key=>[...key].length >= 2 && [...key].length <= 36);
    return [...new Set(terms)].slice(0,4);
  }
  function relations(book, source) {
    const rows = [], content = String(source?.content || '');
    if (!content || source.enabled === false) return rows;
    const names = new Set([...content.matchAll(/\{\{outlet::([^}]+)\}\}/gi)].map(m=>m[1].trim()));
    for (const target of book.entries) {
      if (target.enabled === false) continue;
      if (target.position === 'outlet' && names.has(target.outletName)) rows.push({from:source,to:target,key:target.outletName,explicit:true});
      if (source === target || source.stSettings?.preventRecursion || target.constant || target.stSettings?.excludeRecursion) continue;
      const keys = keysOf(target.keys).filter(key=>match(content,key,target));
      if (keys.length) rows.push({from:source,to:target,key:keys.join(', '),explicit:false});
    }
    return rows;
  }
  function analyze(book) {
    const findings = [], stats = totals(book), owners = new Map();
    const add = (entry, reason, field, detail = '') => findings.push({entry,reason,field,detail});
    for (const entry of book.entries) {
      if (entry.enabled === false) continue;
      const keys = keysOf(entry.keys);
      if (entrySize(entry).tokens > 500) add(entry,'正文较长，可拆分','content');
      if (entry.position === 'at_depth' && Number(entry.depth) > 8) add(entry,'注入深度超过 8','depth');
      if (entry.constant && suggestions(entry).length) add(entry,'考虑改为关键词触发','keys');
      if (!entry.constant && !keys.length) add(entry,'缺少主关键词','keys');
      if (entry.constant) continue;
      for (const key of new Set(keys.filter(key=>!unsupportedKey(key)))) {
        const folded = key.toLowerCase();
        if (!owners.has(folded)) owners.set(folded,[]);
        owners.get(folded).push({entry,key});
        if ([...key].length === 1 || /^(the|is|a|it|you|他|她|大家|这里|这个|一个)$/i.test(key)) add(entry,'关键词过宽','keys',key);
      }
    }
    const firstPair = new Map();
    for (const [folded,uses] of owners) {
      for (const use of uses) {
        if (uses.some(other=>other.entry !== use.entry && (!other.entry.caseSensitive || !use.entry.caseSensitive || other.key === use.key)))
          add(use.entry,'共用关键词，可细化或合并','keys',use.key);
      }
      if (folded.length < 2) continue;
      const prefix = folded.slice(0,2);
      if (!firstPair.has(prefix)) firstPair.set(prefix,[]);
      firstPair.get(prefix).push(folded);
    }
    for (const [longer,longUses] of owners) {
      const pairs = new Set();
      for (let i=0; i<longer.length-1; i++) pairs.add(longer.slice(i,i+2));
      for (const pair of pairs) for (const shorter of firstPair.get(pair) || []) {
        if (shorter.length >= longer.length || !longer.includes(shorter)) continue;
        for (const use of owners.get(shorter)) {
          const overlap = longUses.find(other=>other.entry !== use.entry && match(other.key,use.key,{
            matchWholeWords:use.entry.matchWholeWords,caseSensitive:use.entry.caseSensitive && other.entry.caseSensitive
          }));
          if (overlap) add(use.entry,'短关键词也会匹配较长的触发词','keys',use.key+' ⊂ '+overlap.key);
        }
      }
    }
    return {stats,findings};
  }
  function matchesEntry(entry,query) {
    const term = String(query || '').trim().toLowerCase();
    if (!term) return true;
    return [entry.comment,entry.content,entry.outletName,...(entry.keys || []),...(entry.secondaryKeys || [])]
      .some(value=>String(value || '').toLowerCase().includes(term));
  }
  function directoryPage(entries,definitions,options={}) {
    const buckets = new Map(definitions.map(def=>[def.id,[]]));
    const field = options.byCategory ? 'category' : 'position';
    const fallback = options.byCategory ? '' : 'before_char';
    for (const item of entries) {
      if (!matchesEntry(item,options.query) || !matchesEntry(item,options.outer)) continue;
      const bucket = buckets.get(item[field]) || buckets.get(fallback);
      if (bucket) bucket.push(item);
    }
    const size = 50;
    let count = 0, selectedIndex = -1;
    for (const items of buckets.values()) {
      if (options.reveal) {
        const i = items.findIndex(item=>item.id===options.reveal);
        if (i >= 0) selectedIndex = count+i;
      }
      count += items.length;
    }
    const pages = Math.max(1,Math.ceil(count/size));
    const page = selectedIndex >= 0 ? Math.floor(selectedIndex/size) : Math.min(pages-1,Math.max(0,options.page || 0));
    const start=page*size, end=Math.min(count,start+size), groups=[];
    let offset=0;
    for (const def of definitions) {
      const items = buckets.get(def.id);
      if (offset < end && offset+items.length > start) {
        groups.push({...def,count:items.length,entries:items.slice(Math.max(0,start-offset),end-offset)});
      }
      offset += items.length;
    }
    return {page,pages,start,end,count,groups};
  }
  const proseFields = ['description','personality','scenario'];
  function characterChecks(card) {
    const seen = new Map(), results = [];
    for (const field of proseFields) {
      const text = String(card[field] || '');
      if (estimate(text).tokens > 500) results.push({field, reason:'可移入世界书', excerpt:text.slice(0,85)});
      for (const match of text.matchAll(/[^.!?。！？\n]+(?:[.!?。！？]+|$|\n)/gu)) {
        const passage = match[0].trim(), normalized = passage.toLowerCase().replace(/[\p{P}\s]+/gu,'');
        if ([...normalized].length < 8) continue;
        if (seen.has(normalized) && seen.get(normalized) !== field) results.push({field, other:seen.get(normalized), reason:'跨栏重复，可合并', excerpt:passage});
        else seen.set(normalized,field);
      }
    }
    return results;
  }
  // Keep fenced code verbatim when cleaning prose. Its indentation, whitespace and
  // repeated lines can carry meaning even when the surrounding prose is compacted.
  function proseOnly(text, transform) {
    const output = []; let prose = '', fence = '';
    for (const line of String(text || '').match(/[^\n]*\n|[^\n]+$/g) || []) {
      const marker = line.match(/^\s{0,3}(\x60{3,}|~{3,})/);
      if (!fence && marker) { output.push(transform(prose)); prose = ''; fence = marker[1]; output.push(line); }
      else if (fence) {
        output.push(line);
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !line.slice(marker[0].length).trim()) fence = '';
      } else prose += line;
    }
    output.push(transform(prose));
    return output.join('');
  }
  function compact(text) {
    return proseOnly(text,part=>part.replace(/[ \t]+(?=\r?$)/gm,'').replace(/(\r?\n)(?:[ \t]*\r?\n){2,}/g,'$1$1'));
  }
  function cleanParagraphs(text) {
    return proseOnly(text,part=>{
      const seen = new Set(), pieces = part.split(/(\r?\n(?:[ \t]*\r?\n)+)/);
      let output = '';
      for (let i=0; i<pieces.length; i+=2) {
        const key = pieces[i].trim();
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        output += (i ? pieces[i-1] : '') + pieces[i];
      }
      return output;
    });
  }
  function splitContent(text, limit) {
    if (estimate(text).tokens <= limit) return [text];
    // Paired block macros and markup can depend on an enclosing scope across
    // multiple paragraphs. One entry lets ST evaluate them in that scope.
    if (/\{\{\s*(?:#|\/)[\w-]+|<\/[a-z][\w-]*\s*>/i.test(text)) return [text];
    const chunks = []; let value = '', used = 0;
    function flush() { if (value) chunks.push(value); value = ''; used = 0; }
    function append(token,atomic) {
      let cost = 0;
      for (const ch of token) cost += tokenWeight(ch);
      if (value && used+cost>limit) flush();
      if (atomic || cost<=limit) { value+=token; used+=cost; return; }
      for (const ch of token) {
        const weight=tokenWeight(ch);
        if (value && used+weight>limit) flush();
        value+=ch; used+=weight;
      }
    }
    function prose(part) {
      for (const sentence of part.match(/[^。！？.!?\n]+[。！？.!?\n]*|[。！？.!?\n]+/gu) || []) append(sentence,false);
    }
    // Fence delimiters and balanced {{macros}} are indivisible. Oversized
    // literals can exceed the target instead of producing invalid fragments.
    const markers = /^ {0,3}(\x60{3,}|~{3,})[^\n]*(?:\n|$)|\{\{|\}\}/gm;
    let start=0, nesting=0, fence='';
    for (const marker of text.matchAll(markers)) {
      const end=marker.index+marker[0].length;
      if (marker[1]) {
        if (nesting) continue;
        if (!fence) { prose(text.slice(start,marker.index)); start=marker.index; fence=marker[1]; }
        else if (marker[1][0]===fence[0] && marker[1].length>=fence.length && marker[0].trim()===marker[1]) {
          append(text.slice(start,end),true); fence=''; start=end;
        }
      } else if (!fence && marker[0]==='{{') {
        if (!nesting) { prose(text.slice(start,marker.index)); start=marker.index; }
        nesting++;
      } else if (!fence && nesting && --nesting===0) { append(text.slice(start,end),true); start=end; }
    }
    if (nesting || fence) append(text.slice(start),true); else prose(text.slice(start));
    flush();
    return chunks;
  }
  function buildEdition(book, options = {}) {
    const result = structuredClone(book), selected = new Set(options.core || []), changes = [];
    const reserved = new Set(book.entries.map(entry=>entry.stUid).filter(Number.isSafeInteger));
    let nextUid = book.entries.length;
    function freshUid() { while (reserved.has(nextUid)) nextUid++; reserved.add(nextUid); return nextUid++; }
    result.entries = result.entries.flatMap((entry,index) => {
      if ((options.skipDisabled && entry.enabled === false) || (options.core && !selected.has(entry.id))) {
        changes.push({before:book.entries[index],after:[]}); return [];
      }
      let text = entry.content || '';
      if (options.compact) text = compact(text);
      if (options.dedup) text = cleanParagraphs(text);
      const pieces = options.split ? splitContent(text,300) : [text];
      // Native world-info entries are enumerated by numeric uid. ST prepends
      // equal-order regular entries and appends outlets. Allocate the new IDs
      // accordingly so a split sentence is read in its original sequence.
      const ids = [];
      if (pieces.length > 1) {
        if (Number.isSafeInteger(entry.stUid) && entry.stUid >= 0) ids.push(entry.stUid);
        while (ids.length < pieces.length) ids.push(freshUid());
        ids.sort((a,b)=>entry.position === 'outlet' ? a-b : b-a);
      }
      const parts = pieces.map((content,i) => {
        const part = {...entry,content};
        if (pieces.length > 1) {
          part.comment = (entry.comment || '') + ' (' + (i+1) + '/' + pieces.length + ')';
          part.stUid = ids[i];
          if (i) part.id = root.TAStore.uid('lore');
        }
        return part;
      });
      if (parts.length !== 1 || text !== entry.content) changes.push({before:book.entries[index],after:parts});
      return parts;
    });
    return {book:result,changes};
  }
  root.TAContext = {estimate, entrySize, totals, simulate, suggestions, analyze, relations, matchesEntry, directoryPage, characterChecks, buildEdition, edition:(book,options)=>buildEdition(book,options).book};
})(globalThis);
