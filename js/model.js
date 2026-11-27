/* Model transport. Task prompts and write permissions live in ai-tasks.js. */
(function (root) {
  "use strict";
  const KEY = "nijan-model";
  const REASONING_EFFORTS = ['auto', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  const records = [];
  let sequence = 0;
  const DEFAULT_IDLE_MINUTES = 5;
  const defaults = {baseUrl:'', model:'', key:'', profile:'default', temperature:.7, protocol:'auto', reasoningEffort:'auto', contextWindow:0, idleMinutes:DEFAULT_IDLE_MINUTES};
  function configOf(raw = {}) {
    const cfg = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key,raw[key] ?? value]));
    cfg.protocol = ['auto','responses','chat'].includes(cfg.protocol) ? cfg.protocol : 'auto';
    cfg.reasoningEffort = REASONING_EFFORTS.includes(cfg.reasoningEffort) ? cfg.reasoningEffort : 'auto';
    cfg.temperature = Number.isFinite(Number(cfg.temperature)) ? Number(cfg.temperature) : .7;
    cfg.contextWindow = Math.max(0,Math.floor(Number(cfg.contextWindow) || 0));
    const minutes = Number(cfg.idleMinutes);
    cfg.idleMinutes = Number.isFinite(minutes) && minutes >= 1 && minutes <= 60 ? Math.round(minutes) : DEFAULT_IDLE_MINUTES;
    return cfg;
  }
  function defaultRegistry(raw={}) {
    const active={id:'default',name:'Default',config:configOf(raw),models:[]};
    return {profiles:[active],active};
  }
  const codec = root.TAModelKeyCodec;
  const credentialError = '密钥存储不可用。请解锁系统凭据或检查浏览器存储后重试。';
  const credentialConflict = '另一窗口已修改模型配置。请重新打开工作台再编辑。';
  const damagedConfig = '模型连接配置已损坏。你可以保留本机原配置并重新建立连接。';
  const unknownFormat = '模型配置格式暂不受支持。请使用兼容版本打开。';
  const recoveryMarker = KEY+'.recovery.1';
  const object = value => value!==null && typeof value==='object' && !Array.isArray(value);
  function diskRegistry() {
    // Rebuilt registries live in IndexedDB. Only their first commit's witness (later
    // refreshed as a notification) is needed to distinguish loss from a fresh profile.
    const marker=localStorage.getItem(recoveryMarker);
    return marker===null ? {index:0,raw:localStorage.getItem(KEY)} : {index:1,raw:marker};
  }
  function assertCurrent(expected) {
    const current=diskRegistry();
    if(current.index!==expected.index || current.raw!==expected.raw)throw new Error(credentialConflict);
  }
  const readSource=()=>{
    if(!codec?.registryState || !codec.publishRegistry)throw new Error(credentialError);
    return codec.registryState(diskRegistry);
  };
  function checkConfig(raw) {
    if(!object(raw))throw new Error(damagedConfig);
    for(const [key,value] of Object.entries(defaults)){
      if(raw[key]==null)continue;
      if(typeof raw[key]!==typeof value && !(typeof value==='number' && typeof raw[key]==='string'))throw new Error(damagedConfig);
    }
  }
  function readConnections(original) {
    if(original===null)return {raw:{},reg:defaultRegistry()};
    let raw;
    try{raw=JSON.parse(original);}catch(_){throw new Error(damagedConfig);}
    if(!object(raw))throw new Error(damagedConfig);
    if(raw.format!=null && raw.format!==2){
      const version=raw.format;
      const recognizable=Number.isSafeInteger(version) && version>0 ||
        typeof version==='string' && /^v?[1-9]\d*(?:\.\d+)*$/i.test(version);
      throw new Error(recognizable?unknownFormat:damagedConfig);
    }
    checkConfig(raw);
    if(!Object.hasOwn(raw,'profiles')){
      if(raw.format===2 || (Object.keys(raw).some(k=>k!=='format') && !Object.keys(defaults).some(k=>Object.hasOwn(raw,k))))throw new Error(damagedConfig);
      return {raw,reg:defaultRegistry(raw)};
    }
    if(!Array.isArray(raw.profiles) || !raw.profiles.length)throw new Error(damagedConfig);
    const ids=new Set();
    const profiles=raw.profiles.map(row=>{
      if(!object(row) || typeof row.id!=='string' || !row.id.trim() || ids.has(row.id) || typeof row.name!=='string')throw new Error(damagedConfig);
      ids.add(row.id);
      checkConfig(row.config);
      if(row.key && row.key!==row.config.key)throw new Error(damagedConfig);
      if(Object.hasOwn(row,'sealedKey') && (typeof row.sealedKey!=='string' || !row.sealedKey || codec?.malformedEnvelope?.(row.sealedKey)))throw new Error(damagedConfig);
      if(row.models!=null && !Array.isArray(row.models))throw new Error(damagedConfig);
      const models=(row.models || []).map(value=>{
        if(typeof value==='string')return metadata(value);
        if(!object(value) || typeof value.id!=='string' ||
          (value.efforts!=null && (!Array.isArray(value.efforts) || !value.efforts.every(e=>typeof e==='string'))) ||
          (value.context!=null && !['number','string'].includes(typeof value.context)) ||
          (value.recommended!=null && typeof value.recommended!=='string'))throw new Error(damagedConfig);
        return {...value,efforts:value.efforts || []};
      });
      return {...row,config:configOf(row.config),models};
    });
    const active=profiles.find(row=>row.id===raw.active);
    if((raw.format===2 || raw.active!=null) && !active)throw new Error(damagedConfig);
    return {raw,reg:{profiles,active:active || profiles[0]}};
  }
  let secured=defaultRegistry(),persisted,transient,damage=null,generation=0;
  let unlocking = false, credentialDirty = false, credentialIssue = '', saveQueue = Promise.resolve();
  let envelopes = new Map();
  function registry() {
    if (codec) return secured;
    if (transient) return transient;
    try{
      const src=diskRegistry(),{raw,reg}=readConnections(src.raw);
      if(!src.index && raw.format!==2)return reg;
    }catch(_){}
    // A consumer loaded without the codec cannot safely update a protected or damaged registry.
    return {...defaultRegistry(),locked:true};
  }
  async function encodeRegistry(reg, expected, {cancel, newSlot=false, priorKeys=envelopes}={}) {
    const saved = [], next = new Map();
    for (const row of reg.profiles) {
      const {key,...config} = row.config;
      let sealed;
      if (key) {
        const prior = priorKeys.get(row.id);
        if (prior?.key === key) sealed = prior.sealed;
        else {
          sealed = await codec.seal(row.id,key);
          if (await codec.open(row.id,sealed) !== key) throw new Error(credentialError);
        }
        next.set(row.id,{key,sealed});
      }
      saved.push({id:row.id,name:row.name,config,models:row.models || [],...(sealed ? {sealedKey:sealed} : {})});
    }
    const index=expected.index+(newSlot ? 1 : 0);
    const revision=root.crypto.randomUUID();
    const {key:privateKey,...settings}=reg.active.config;
    const data = JSON.stringify({...settings,format:2,storageRevision:revision,active:reg.active.id,profiles:saved});
    const publish = async () => {
      if (cancel?.()) return;
      const validateLegacy=()=>{
        assertCurrent(expected);
        if(newSlot){
          // Reserve a secret-free witness before the first append. A full localStorage
          // therefore cannot make a recovered database indistinguishable from a fresh one.
          localStorage.setItem(recoveryMarker,revision);
        }
      };
      const rollbackLegacy=()=>{
        if(newSlot){
          if(localStorage.getItem(recoveryMarker)===revision)localStorage.removeItem(recoveryMarker);
        }else if(localStorage.getItem(KEY)===data){
          if(expected.raw===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,expected.raw);
        }
      };
      try{
        const saved=await codec.publishRegistry(expected,index,data,revision,validateLegacy,
          value=>localStorage.setItem(KEY,value),rollbackLegacy,cancel);
        if(!saved)return;
      }catch(error){
        if(error.message==='credential-stale')throw new Error(credentialConflict);
        throw error;
      }
      if(index){
        // This notification carries no connection settings. It also detects lost IndexedDB data.
        try{localStorage.setItem(recoveryMarker,revision);}catch(_){}
      }
      persisted = {index,raw:data,revision};
      envelopes = next;
    };
    if (root.navigator?.locks) await root.navigator.locks.request('quilvori-model-settings',publish);
    else await publish();
  }
  async function initializeCredentials() {
    if (!codec) return;
    unlocking = true;
    let source;
    generation++;damage=null;
    try {
      source=await readSource();
      let parsed;
      try{parsed=readConnections(source.raw);}
      catch(error){if(error.message===damagedConfig)damage={source,token:generation};throw error;}
      const {raw,reg}=parsed,opened=new Map();
      if(!source.index && raw.storageRevision && raw.storageRevision!==source.revision)throw new Error(credentialConflict);
      for (const row of reg.profiles) {
        if (!row.sealedKey) continue;
        const key = await codec.open(row.id,row.sealedKey);
        if(row.config.key && row.config.key!==key){damage={source,token:generation};throw new Error(damagedConfig);}
        opened.set(row.id,{key,sealed:row.sealedKey});
        row.config = {...row.config,key};
      }
      if(raw.key && !reg.profiles.some(row=>row.config.key===raw.key)){
        if(reg.active.config.key){damage={source,token:generation};throw new Error(damagedConfig);}
        reg.active.config.key=raw.key;
      }
      if (source.raw !== null && (raw.format !== 2 || Object.hasOwn(raw,'key') ||
          (raw.profiles || []).some(row=>row.config && Object.hasOwn(row.config,'key')))) {
        await encodeRegistry(reg,source,{priorKeys:opened});
      } else {
        const latest=await readSource();
        if(latest.index!==source.index || latest.raw!==source.raw || latest.revision!==source.revision)throw new Error(credentialConflict);
        persisted=source;envelopes=opened;
      }
      secured = reg;
      credentialDirty = false;
      credentialIssue = '';
    } catch (error) {
      credentialIssue = damage ? damagedConfig : [credentialConflict,unknownFormat].includes(error.message) ? error.message : credentialError;
      // A partly unlocked registry would expose a mix of old and unreadable profiles.
      secured = {...defaultRegistry(),locked:true};envelopes=new Map();
    } finally { unlocking=false;root.dispatchEvent?.(new Event('quilvori-credential-status')); }
  }
  let writeRevision = 0;
  function persist(reg) {
    if (codec) {
      if (unlocking || reg.locked) throw new Error(credentialIssue || credentialError);
      credentialDirty = true;
      const revision = ++writeRevision;
      saveQueue = saveQueue.then(async () => {
        if (revision !== writeRevision) return;
        // Freeze the settings before awaiting the OS. Edits made in the meantime
        // belong to the next queued write and do not inherit the previous key.
        try {
          const snapshot = structuredClone(reg);
          await encodeRegistry(snapshot,persisted,{cancel:() => revision !== writeRevision});
          if (revision === writeRevision) { credentialDirty = false; credentialIssue = ''; }
        } catch (error) {
          credentialIssue = error.message === credentialConflict ? credentialConflict : credentialError;
          if (credentialIssue===credentialConflict) reg.locked=true;
        }
        root.dispatchEvent?.(new Event('quilvori-credential-status'));
      });
      return;
    }
    // Standalone consumers may load this module without the desktop/web codec.
    // Keep their existing key material intact and store new keys in memory only.
    const src=diskRegistry(),{raw,reg:old}=readConnections(src.raw);
    if(src.index || raw.format===2)throw new Error(credentialError);
    const profiles=reg.profiles.map(row=>{
      const {key,...config}=row.config, prior=old.profiles.find(p=>p.id===row.id);
      if(prior?.config.key)config.key=prior.config.key;
      return {...row,config};
    });
    const {key,...settings}=reg.active.config;
    localStorage.setItem(KEY,JSON.stringify({...settings,active:reg.active.id,profiles}));
    transient=reg;
  }
  async function flushCredentials() {
    if (unlocking) await ready;
    let pending;
    do { pending=saveQueue; await pending; } while(pending!==saveQueue);
    if (credentialIssue) throw new Error(credentialIssue);
  }
  let ready=initializeCredentials();
  root.addEventListener?.('storage',event=>{
    if (codec && (event.key===KEY || event.key===null || event.key===recoveryMarker) && !credentialDirty && !unlocking) {
      ready=initializeCredentials();
      root.dispatchEvent?.(new Event('quilvori-credential-status'));
    }
  });
  async function retryCredentials() {
    if (!codec) throw new Error(credentialError);
    if (!unlocking) {
      if (secured?.locked) ready=initializeCredentials();
      else if (credentialDirty) persist(secured);
    }
    await ready;
    await flushCredentials();
  }
  function rebuildCredentials(token) {
    if(!codec || unlocking || !damage || damage.token!==token)return Promise.reject(new Error(credentialConflict));
    const source=damage.source,reg=defaultRegistry();
    unlocking=true;
    const job=(async()=>{
      try{
        await encodeRegistry(reg,source,{newSlot:true});
        secured=reg;damage=null;credentialIssue='';credentialDirty=false;generation++;
      }catch(error){
        credentialIssue=error.message===credentialConflict?credentialConflict:credentialError;
        if(credentialIssue===credentialConflict)damage=null;
        throw new Error(credentialIssue);
      }finally{
        unlocking=false;root.dispatchEvent?.(new Event('quilvori-credential-status'));
      }
    })();
    ready=job.catch(()=>{});
    return job;
  }
  function load() { return configOf(registry().active.config); }
  function save(next) {
    const reg = registry(), prev = reg.active.config;
    if (reg.locked || unlocking) throw new Error(credentialIssue || credentialError);
    reg.active.config = configOf({...prev,...next});
    if (prev.baseUrl !== reg.active.config.baseUrl || prev.key !== reg.active.config.key) reg.active.models = [];
    if ((prev.baseUrl !== reg.active.config.baseUrl || prev.model !== reg.active.config.model) && !Object.hasOwn(next || {},'contextWindow')) reg.active.config.contextWindow=0;
    persist(reg);
    return reg.active.config;
  }
  function profiles() {
    const reg = registry();
    return reg.profiles.map(({id,name}) => ({id,name,active:id===reg.active.id}));
  }
  function selectProfile(id) {
    const reg = registry(), row = reg.profiles.find(p=>p.id===id);
    if (reg.locked || unlocking) throw new Error(credentialIssue || credentialError);
    if (!row) throw new Error('请选择模型配置');
    reg.active = row; persist(reg);
  }
  function newProfile(name) {
    if (!name?.trim()) throw new Error('请输入配置名称');
    const reg = registry();
    if (reg.locked || unlocking) throw new Error(credentialIssue || credentialError);
    reg.active = {id:root.crypto.randomUUID(),name:name.trim(),config:configOf(),models:[]};
    reg.profiles.push(reg.active); persist(reg);
  }
  function metadata(item) {
    const id = typeof item === 'string' ? item : String(item?.id || item?.name || item?.model || '');
    const context = Number(item?.context_length ?? item?.context_window ?? item?.max_context_tokens ?? item?.top_provider?.context_length);
    const offered = item?.supported_reasoning_efforts ?? item?.reasoning?.supported_efforts;
    const recommended = item?.recommended_reasoning_effort ?? item?.default_reasoning_effort ?? item?.reasoning?.default_effort;
    return {id:id.trim(),context:Number.isSafeInteger(context) && context > 0 ? context : 0,
      efforts:Array.isArray(offered) ? offered.filter(value=>REASONING_EFFORTS.includes(value)) : [], recommended:REASONING_EFFORTS.includes(recommended) ? recommended : ''};
  }
  function capabilities() {
    const row = registry().active;
    const report = (row.models || []).find(m=>m.id===row.config.model) || metadata(row.config.model);
    return {...report,manual:row.config.contextWindow || 0};
  }
  function apiRoot(url) {
    return String(url || "")
      .trim()
      .replace(/\/+$/, "")
      .replace(/\/(?:chat\/completions|responses|models)$/, "");
  }
  function configured() {
    const config = load();
    return !!(apiRoot(config.baseUrl) && config.model && config.key);
  }
  function modelsFromPayload(value) {
    const list = Array.isArray(value)
      ? value
      : (value && (value.data || value.models)) || [];
    if (!Array.isArray(list)) return [];
    return [
      ...new Set(
        list
          .map((item) =>
            typeof item === "string"
              ? item.trim()
              : String(
                  (item && (item.id || item.name || item.model)) || "",
                ).trim(),
          )
          .filter(Boolean),
      ),
    ];
  }
  function allowsAdult() {
    return load().profile !== "strict";
  }
  function jsonMode() {
    return !!(root.TAI18n && root.TAI18n.prefs.jsonMode);
  }
  function writingGuide() {
    const prefs = (root.TAI18n && root.TAI18n.prefs) || {};
    const group = root.TAUI?.state?.lib?.sections?.style || {};
    const styles = {
      short: "句子短，叙述具体。",
      long: "允许展开环境、动作和细节。",
      talk: "用对白推进，叙述补动作。",
      spare: "保留余地，不把情绪说满。",
    };
    const count =
      prefs.replyLength === "short"
        ? 200
        : prefs.replyLength === "long"
          ? 1500
          : prefs.replyLength === "custom"
            ? Math.max(50, Math.min(8000, Number(prefs.replyChars) || 600))
            : 600;
    return {
      mode: prefs.replyLength || "medium",
      count,
      style: String(
        group.custom || group.text || styles[group.preset] || styles.short,
      ),
    };
  }
  function systemPrompt(task, mode) {
    let text = String(task || "");
    const language =
      {
        zh: "中文",
        en: "英语",
        ja: "日语",
        ru: "俄语",
        ko: "韩语",
        th: "泰语",
      }[root.TAI18n?.prefs?.lang || "zh"] || "中文";
    text += `\n默认用${language}填写新正文、沟通答复和检查报告；用户明确指定语言时以用户要求为准。引用原文保持原样，JSON 字段名保持任务规定的格式。`;
    if (mode && mode.startsWith("create:")) {
      const guide = writingGuide();
      if (!["create:regex", "create:backup", "create:graph"].includes(mode))
        text += `\n创作正文参考文风：${guide.style}。单段正文目标约 ${guide.count} 字，按该栏用途调整。可选栏位不必填满。`;
      const prefs = (root.TAI18n && root.TAI18n.prefs) || {};
      if (!allowsAdult() || !prefs.adult)
        text += "\n不生成色情或露骨的性内容。";
      else text += "\n亲密设定仅涉及成年人和明确同意，尊重用户指定的边界。";
    }
    return text;
  }
  function notify(record) {
    try {
      root.dispatchEvent(new CustomEvent("nijan-task", { detail: record }));
    } catch (_) {}
  }
  function piece(value) {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(piece).join("");
    if (value && typeof value === "object")
      return piece(value.text || value.content || "");
    return "";
  }
  function extract(data, protocol) {
    if (protocol === "responses") {
      const output = Array.isArray(data.output) ? data.output : [];
      const refusal = output.filter(item => item.type === 'message').flatMap(item => item.content || []).find(part => part.type === 'refusal');
      if (refusal?.refusal) throw new Error(refusal.refusal);
      return {
        text:
          piece(data.output_text) ||
          output
            .filter((item) => item.type === "message")
            .map((item) =>
              piece(
                (item.content || []).filter(
                  (part) => part.type === "output_text" || part.type === "text",
                ),
              ),
            )
            .join("\n"),
        reasoning: output
          .filter((item) => item.type === "reasoning")
          .map((item) => piece(item.summary) || piece(item.content))
          .filter(Boolean)
          .join("\n"),
      };
    }
    const message =
      (data.choices && data.choices[0] && data.choices[0].message) || {};
    const parts = chatPart(message);
    if (!parts.reasoning) parts.reasoning = piece(data.reasoning_content);
    return parts;
  }
  function chatPart(message) {
    const content = message.content;
    if (message.refusal) throw new Error(piece(message.refusal));
    const hidden = Array.isArray(content) ? content.filter(part => /^(reasoning|thinking)/.test(part?.type || '')) : [];
    const visible = hidden.length ? content.filter(part => !hidden.includes(part)) : content;
    return {
      text: piece(visible),
      reasoning: piece(message.reasoning_content) || piece(message.reasoning) || piece(hidden.map(part => part.text || part.thinking)),
    };
  }
  function cleanError(message, config) {
    let messageText = String(message || '请求失败');
    if (config.key) messageText = messageText.split(config.key).join('[redacted]');
    return messageText.replace(/\bBearer\s+\S+/gi,'Bearer [redacted]').slice(0,500);
  }
  function checkCompletion(data, protocol) {
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("接口返回了无效的响应。");
    if (data.error)
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : data.error.message || "接口未完成请求。",
      );
    if (protocol === "responses") {
      if (
        (data.status && data.status !== "completed") ||
        (data.output || []).some(
          (item) => item.status === "incomplete" || item.status === "failed",
        )
      )
        throw new Error("模型输出未完成，原稿已保留。");
    } else {
      const finish =
        data.choices && data.choices[0] && data.choices[0].finish_reason;
      if (finish && finish !== "stop")
        throw new Error(
          "模型输出被截断或未完成，原稿已保留。请缩小范围后重试。",
        );
    }
  }
  const tr = text => root.TAI18n ? root.TAI18n.t(text) : text;

  // Each attempt permits a full wait for its first bytes. Any nonempty body chunk
  // (including an SSE keep-alive) renews the idle window for that attempt.
  function watchActivity(record, idleMs, parentSignal) {
    const controller = new AbortController();
    let timer, bytesThisAttempt = 0, timeoutCode = '', notifiedAt = 0;
    function renew() {
      clearTimeout(timer);
      if (!controller.signal.aborted) timer = setTimeout(() => {
        timeoutCode = bytesThisAttempt ? 'idle-timeout' : 'first-byte-timeout';
        controller.abort();
      }, idleMs);
    }
    const cancel = () => controller.abort();
    if (parentSignal?.aborted) cancel();
    else parentSignal?.addEventListener('abort', cancel, {once:true});
    return {
      signal: controller.signal,
      get timeoutCode() { return timeoutCode; },
      begin() {
        controller.signal.throwIfAborted();
        bytesThisAttempt = 0;
        record.phase = 'waiting';
        record.httpStatus = null;
        renew();
        notify(record);
      },
      headers(status) { record.httpStatus = status; notify(record); },
      receive(size) {
        if (!bytesThisAttempt) notifiedAt = 0;
        bytesThisAttempt += size;
        record.bytesReceived += size;
        record.lastActivityAt = Date.now();
        renew();
        if (record.phase === 'waiting') record.phase = 'receiving';
      },
      progress() {
        if (Date.now() - notifiedAt >= 150) { notifiedAt = Date.now(); notify(record); }
      },
      close() {
        clearTimeout(timer);
        parentSignal?.removeEventListener('abort',cancel);
        controller.abort();
      },
    };
  }

  async function readBody(response, activity, consume) {
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    const cancel = () => { reader.cancel().catch(() => {}); };
    activity.signal.addEventListener('abort',cancel,{once:true});
    try {
      while (true) {
        activity.signal.throwIfAborted();
        const chunk = await reader.read();
        activity.signal.throwIfAborted();
        if (chunk.done) { consume(decoder.decode(),true); break; }
        if (!chunk.value.byteLength) continue;
        activity.receive(chunk.value.byteLength);
        const done = consume(decoder.decode(chunk.value,{stream:true}),false);
        activity.progress();
        if (done) { cancel(); break; }
      }
    } finally {
      activity.signal.removeEventListener('abort',cancel);
      reader.releaseLock();
    }
  }

  async function responseText(response, activity, limit = Infinity) {
    let text = '';
    await readBody(response,activity,part => {
      text += part.slice(0,limit - text.length);
      return text.length >= limit;
    });
    return text;
  }

  async function errorDetail(response, activity, config) {
    const text = await responseText(response,activity,8192);
    let message;
    try {
      const data = JSON.parse(text), error = data?.error;
      message = (typeof error === 'string' ? error : error?.message) || data?.message;
      if (error?.code) message = message ? message + ' (' + error.code + ')' : error.code;
    } catch (_) {}
    return cleanError(message || text.trim() || response.statusText,config);
  }

  async function streamResult(response, protocol, record, activity) {
    if (
      !String(response.headers.get("content-type") || "").toLowerCase().includes(
        "text/event-stream",
      )
    ) {
      const text = await responseText(response,activity);
      let data;
      try { data = JSON.parse(text); }
      catch (_) { throw new Error(tr('接口未返回完整的 JSON 响应。')); }
      checkCompletion(data, protocol);
      record.usage = data.usage;
      return extract(data, protocol);
    }
    let buffer = "",
      skipNextLF = false,
      scanned = 0,
      eventName = "",
      eventData = [],
      text = "",
      reasoning = "",
      final = null,
      finished = false;
    const event = () => {
      if (!eventData.length) return;
      const raw = eventData.join("\n"), type = eventName;
      eventData = [];
      eventName = "";
      if (raw.trim() === "[DONE]") {
        if (protocol === "chat") finished = true;
        return;
      }
      const value = JSON.parse(raw);
      if (type && !value.type) value.type = type;
      if (
        value.error ||
        value.type === "error" ||
        value.type === "response.failed" ||
        value.type === "response.incomplete"
      )
        throw new Error(
          (typeof value.error === 'string' ? value.error : value.error?.message) ||
          value.message || value.response?.error?.message || tr('模型输出未完成，原稿已保留。'),
        );
      if (protocol === "chat") {
        const delta =
          (value.choices && value.choices[0] && value.choices[0].delta) || {};
        const parts = chatPart(delta);
        text += parts.text;
        reasoning += parts.reasoning;
        const finish =
          value.choices && value.choices[0] && value.choices[0].finish_reason;
        if (finish && finish !== "stop")
          throw new Error(
            "模型输出被截断或未完成，原稿已保留。请缩小范围后重试。",
          );
        if (finish) finished = true;
        if (value.usage) record.usage = value.usage;
      } else {
        if (value.type === 'response.refusal.delta') throw new Error(value.delta || tr('模型没有返回正文，原稿已保留。'));
        if (value.type === "response.output_text.delta")
          text += value.delta || "";
        if (
          value.type === "response.reasoning_summary_text.delta" ||
          value.type === "response.reasoning_text.delta"
        )
          reasoning += value.delta || "";
        if (value.type === "response.completed") {
          final = value.response;
          checkCompletion(final, protocol);
          record.usage = final.usage;
          finished = true;
        }
      }
      record.reasoning = reasoning;
      record.output = text;
      if (text) record.phase = 'writing';
      else if (reasoning) record.phase = 'reasoning';
    };
    // A line may span reads, including the CR and LF of a single separator.
    function line(value) {
      if (value === '') { event(); eventName = ''; }
      else if (value.startsWith('data:')) eventData.push(value.slice(5).replace(/^ /,''));
      else if (value.startsWith('event:')) eventName = value.slice(6).trim();
    }
    await readBody(response,activity,(part,eof) => {
      if (skipNextLF && part) { if (part[0] === '\n') part = part.slice(1); skipNextLF = false; }
      buffer += part;
      let start = 0;
      for (let i = scanned; i < buffer.length; i++) {
        if (buffer[i] !== '\n' && buffer[i] !== '\r') continue;
        line(buffer.slice(start,i));
        if (buffer[i] === '\r') {
          if (buffer[i + 1] === '\n') i++;
          else if (i + 1 === buffer.length) skipNextLF = true;
        }
        start = i + 1;
      }
      buffer = buffer.slice(start);
      scanned = buffer.length;
      if (eof && !finished) { if (buffer) line(buffer); event(); }
      return finished;
    });
    if (!finished) throw new Error("连接在输出完成前中断，原稿已保留。");
    const extracted = final ? extract(final, protocol) : null;
    return {
      text: (extracted && extracted.text) || text,
      reasoning: (extracted && extracted.reasoning) || reasoning,
    };
  }
  async function complete(messages, options) {
    if (unlocking) await ready;
    const config = load(),
      opts = options || {};
    if (codec) await flushCredentials();
    if (!apiRoot(config.baseUrl) || !config.model || !config.key) throw new Error("先在设置里连接，并选一个模型。");
    const base = apiRoot(config.baseUrl);
    if (!/^https?:\/\//i.test(base))
      throw new Error("接口地址需要以 http:// 或 https:// 开头。");
    const record = {
      id: root.crypto?.randomUUID?.() || `task_${++sequence}_${Date.now()}`,
      epoch:root.TACreationRecords?.epoch(),
      ...(opts.workRecord || {}),
      task: opts.task || "test",
      label: opts.label || "接口测试",
      status: "running",
      phase: 'waiting',
      bytesReceived: 0,
      httpStatus: null,
      idleMs: Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : config.idleMinutes * 60000,
      model: config.model,
      reasoningEffort: REASONING_EFFORTS.includes(config.reasoningEffort) ? config.reasoningEffort : 'auto',
      reasoning: "",
      output: "",
      scope: opts.scopeSummary || tr("连接测试，没有发送角色卡或世界书。"),
      startedAt: new Date().toISOString(),
    };
    records.push(record);
    if (records.length > 24) records.shift();
    const activity = watchActivity(record,record.idleMs,opts.signal);
    try {
      const protocols =
        config.protocol === "chat"
          ? ["chat"]
          : config.protocol === "responses"
            ? ["responses"]
            : ["responses", "chat"];
      let result;
      for (let index = 0; index < protocols.length; index += 1) {
        const protocol = protocols[index];
        record.protocol = protocol;
        const body =
          protocol === "responses"
            ? {
                model: config.model,
                input: messages,
                stream: true,
                store: false,
              }
            : { model: config.model, messages, stream: true };
        if (protocol === "chat" && opts.creative)
          body.temperature = config.temperature;
        if (record.reasoningEffort !== 'auto') {
          if (protocol === 'responses') body.reasoning = { effort: record.reasoningEffort };
          else body.reasoning_effort = record.reasoningEffort;
        }
        const request = async () => {
          activity.begin();
          const response = await fetch(
            `${base}/${protocol === "responses" ? "responses" : "chat/completions"}`,
            {
              method: "POST",
              signal: activity.signal,
              headers: {
                Authorization: `Bearer ${config.key}`,
                "Content-Type": "application/json",
                Accept: "text/event-stream, application/json",
              },
              body: JSON.stringify(body),
            },
          );
          activity.headers(response.status);
          return response;
        };
        let response = await request();
        let detail = response.ok ? '' : await errorDetail(response,activity,config);
        if (response.status === 400 && Object.hasOwn(body,'temperature') &&
            /temperature/i.test(detail) && /unsupported|not supported|does not support|only.*default|不支持/i.test(detail)) {
          delete body.temperature;
          record.transportNote = "接口不支持温度参数，已使用模型默认值。";
          response = await request();
          detail = response.ok ? '' : await errorDetail(response,activity,config);
        }
        if (!response.ok) {
          if (response.status === 400 && record.reasoningEffort !== 'auto' && /reasoning|effort/i.test(detail)) {
            const message = '当前模型或接口不支持所选推理强度，请换一个档位或选择跟随模型。';
            throw new Error(`${root.TAI18n ? root.TAI18n.t(message) : message} ${detail}`);
          }
          if (
            index + 1 < protocols.length &&
            ([405,501].includes(response.status) ||
              (response.status === 404 && !/model[_\s-]?not[_\s-]?found|unknown model|model.*(not found|does not exist)|模型.*不存在/i.test(detail)))
          )
            continue;
          throw new Error(`接口返回 ${response.status}：${detail}`);
        }
        result = await streamResult(response, protocol, record, activity);
        break;
      }
      record.output = result.text;
      record.reasoning = result.reasoning;
      if (!result.text.trim()) throw Object.assign(new Error(tr(result.reasoning ? '接口只返回了推理，没有写作正文。' : '模型没有返回正文，原稿已保留。')),{code:'empty-output'});
      record.status = "received";
      record.finishedAt = new Date().toISOString();
      notify(record);
      return { text: result.text, record };
    } catch (error) {
      const timeout = activity.timeoutCode;
      record.status = activity.signal.aborted && !timeout ? 'cancelled' : 'error';
      if (timeout === 'first-byte-timeout') record.error = tr('等待接口首个数据包超时。可在模型设置延长空闲等待。');
      else if (timeout === 'idle-timeout') record.error = tr('接收中途超时。接口已停止传输，已收到的内容可在任务记录中查看。');
      else if (record.status === 'cancelled') record.error = tr('已停止，原稿已保留。');
      else record.error = tr(error.message);
      if (timeout && record.httpStatus >= 400) record.error = 'HTTP ' + record.httpStatus + ' · ' + record.error;
      record.error = cleanError(record.error,config);
      record.errorCode = timeout || (record.status === 'cancelled' ? 'cancelled' : error.code || 'request-failed');
      record.finishedAt = new Date().toISOString();
      await root.TACreationRecords?.save(record);
      notify(record);
      const wrapped = new Error(record.error);
      wrapped.code = record.errorCode;
      wrapped.name = timeout ? 'TimeoutError' : record.status === 'cancelled' ? 'AbortError' : 'Error';
      throw wrapped;
    } finally {
      activity.close();
    }
  }
  function parseJson(raw) {
    const trimmed = String(raw || "").trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    try {
      return JSON.parse(fenced ? fenced[1] : trimmed);
    } catch (_) {
      throw new Error(
        "模型返回的内容不是完整 JSON，原稿已保留。请重试或缩小范围。",
      );
    }
  }
  function taskOutput(task, raw) {
    if (["questions", "ideas", "discuss"].includes(task))
      return root.NIJANCreativeDialogue.decode(task, raw);
    return parseJson(raw);
  }
  function taskLabel(task,label){
    const title=typeof label==='string' && label.trim() ? label : '';
    const module=task?.startsWith('create:') && root.NIJANAI.MODULES[task.slice(7)];
    if(module && (!title || title==='创作'+module))return tr(module);
    const taskNames={
      edit:['定向改稿','样稿定向调整'], review:['逻辑与人设检查','人设与设定检查'],
      discuss:['创作沟通'], questions:['创作追问'], ideas:['创作灵感'], utility:['辅助任务'],
      'organize:character':['角色卡整理分栏'], 'organize:world':['世界书条目整理'], test:['连接测试','接口测试'],
    };
    const labels=Object.hasOwn(taskNames,task) ? taskNames[task] : [];
    return !title || labels.includes(title) ? tr(title || labels[0] || '模型请求') : title;
  }
  function describeScope(task,label,input){
    const ai=root.NIJANAI, lines=[taskLabel(task,label)];
    const add=(name,value)=>lines.push(tr(name)+' · '+value);
    if(task.startsWith('create:') && Array.isArray(input.modules) && input.modules.length)
      lines.push(input.modules.map(key=>ai.MODULES[key]).filter(Boolean).map(tr).join(' / '));
    if(input.ideas?.length)add('已采用灵感',input.ideas.map((idea,index)=>(index+1)+'. '+idea).join('\n'));
    if(input.instruction)add('本轮补充',input.instruction);
    for(const target of input.targets || []){
      const fields=target.fields.map(key=>tr(ai.CARD_FIELDS[key] || ai.ENTRY_FIELDS[key] || key));
      add('可修改栏位',(target.name ?? target.id)+' · '+fields.join(', '));
    }
    add('参考角色卡',(input.card || input.reference?.card)?.name || tr('未选用'));
    const book=input.book || input.reference?.book;
    if(book){
      const included=book.entries.length, total=book.scope?.totalEntries ?? included;
      const scope=book.scope?.mode==='reference' ? '参考条目（选中原文另外完整发送）' : book.scope?.mode==='selected_entries' ? '选中条目' : '条目';
      add('世界书',book.name+' · '+included+' / '+total+' · '+tr(scope));
      add('提供的条目',book.entries.map(entry=>entry.comment || entry.id).join(', ') || tr('无'));
    }else add('世界书',tr('未选用'));
    return lines.join('\n');
  }
  async function runTask(task, context, options) {
    const input = context || {};
    if (
      task === "edit" &&
      (!String(input.instruction || "").trim() || !(input.targets || []).length)
    )
      throw new Error("先选择要修改的对象、栏位，并写下要求。");
    if (task === "review" && !input.card && !input.book)
      throw new Error("先选择要检查的角色卡或世界书。");
    if (task === "discuss" && !String(input.instruction || "").trim())
      throw new Error("先写下要和 AI 沟通的内容。");
    if (
      task.startsWith("create:") &&
      !String(input.brief || input.instruction || "").trim()
    )
      throw new Error("先写下创作要求。");
    const serialized = JSON.stringify(input);
    if (serialized.length > 350000)
      throw new Error(
        "本次内容过多，请到 AI 创作台的“修改已有”减少勾选条目，再分批修改或检查。",
      );
    const instruction = systemPrompt(root.NIJANAI.prompt(task, input), task);
    const response = await complete(
      [
        { role: "system", content: instruction },
        { role: "user", content: serialized },
      ],
      Object.assign({}, options, {
        task,
        creative: task.startsWith("create:"),
        workRecord: ['create:character','create:world'].includes(task) ? {
          workKinds:options?.workKinds || [task.slice(7)],workBatch:options?.workBatch || '',workBrief:input.brief || '',
          ...(options?.workRun ? {workRun:options.workRun,workSelection:options.workSelection} : {}),
        } : null,
        scopeSummary:describeScope(task,options?.label,input),
      }),
    );
    try {
      let result;
      if (response.record.workKinds && root.NIJANCreationOutput) {
        const kind=task.slice(7);
        const report=root.NIJANCreationOutput.collect(response.text,response.record.workKinds,input);
        const results=Object.keys(report.results);
        const invalid=report.present.filter(item=>report.errors[item]);
        const terminal=report.code==='needs-input' || report.code==='model-error';
        if(terminal || (!options?.collectWorks && !report.results[kind])){
          throw Object.assign(new Error(report.errors[kind] || report.errors[invalid[0]] || '模型没有返回正文，原稿已保留。'),{code:report.code || 'invalid-work'});
        }
        const problems=new Set(invalid);
        if(!report.results[kind])problems.add(kind);
        response.record.status=!results.length ? 'error' : problems.size ? 'partial' : 'validated';
        response.record.error=[...problems].map(key=>report.errors[key]).filter(Boolean).join(' · ');
        response.record.result=report.results[kind];
        await root.TACreationRecords?.save(response.record);
        notify(response.record);
        if(options?.collectWorks)return {...report,sourceKey:response.record.sourceKey,recordId:response.record.id};
        return report.results[kind];
      }
      result = root.NIJANAI.validate(task, taskOutput(task,response.text), input);
      response.record.status = "validated";
      response.record.result = result;
      if (task === "review") response.record.reviewSource = serialized;
      notify(response.record);
      return result;
    } catch (error) {
      response.record.status =
        error.code === "needs-input" ? "needs_input" : "error";
      response.record.error = error.message;
      await root.TACreationRecords?.save(response.record);
      notify(response.record);
      throw error;
    }
  }
  async function listModels() {
    if (unlocking) await ready;
    const active=registry().active, profileId=active.id, config=configOf(active.config);
    if (codec) await flushCredentials();
    if (!config.baseUrl || !config.key)
      throw new Error("先填写接口地址和密钥。");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${apiRoot(config.baseUrl)}/models`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${config.key}` },
      });
      if (!response.ok) throw new Error(`模型列表返回 ${response.status}`);
      const payload = await response.json(), names = modelsFromPayload(payload);
      const current = registry();
      if (current.active.id !== profileId || current.active.config.baseUrl !== config.baseUrl || current.active.config.key !== config.key) throw new Error('配置已变化，请重新连接');
      const items = Array.isArray(payload) ? payload : (payload.data || payload.models || []);
      current.active.models = Array.isArray(items) ? items.map(metadata).filter(row=>row.id).slice(0,10000) : [];
      persist(current);
      return names;
    } finally {
      clearTimeout(timer);
    }
  }
  async function askJson(task, user, signal) {
    const response = await complete(
      [
        { role: "system", content: systemPrompt(task) },
        {
          role: "user",
          content: typeof user === "string" ? user : JSON.stringify(user),
        },
      ],
      { signal, task: "utility", label: "辅助任务" },
    );
    const result = parseJson(response.text);
    if (result && result.unsure) {
      const error = new Error(result.question || "模型需要补充信息。");
      error.code = "needs-input";
      throw error;
    }
    return result;
  }
  async function testMessage(message) {
    return (
      await complete([{ role: "user", content: message || "请只回复：收到" }], {
        label: "连接测试",
      })
    ).text;
  }
  async function semanticFindings(character, book) {
    const result = await runTask(
      "review",
      { card: character, book: book || null },
      { label: "人设与设定检查" },
    );
    return result.items;
  }
  root.NIJANModel = {
    get ready() { return ready; },
    credentialStatus: () => ({pending:credentialDirty,opening:unlocking,issue:credentialIssue,locked:!!secured?.locked,
      generation,recoverable:!!damage && !unlocking,recoveryToken:damage?.token ?? null}),
    flushCredentials, retryCredentials, rebuildCredentials,
    load,
    save,
    configured,
    allowsAdult,
    jsonMode,
    systemPrompt,
    writingGuide,
    modelsFromPayload,
    listModels,
    runTask, taskLabel,
    parseJson,
    askJson,
    testMessage,
    semanticFindings,
    profiles, selectProfile, newProfile, capabilities,
    rememberedModels: () => (registry().active.models || []).map(row=>row.id),
    history: () => root.TACreationRecords?.history(records) || records.slice(),
    clearHistory: () => {records.length=0;root.TACreationRecords?.reset(root.TALibraryDB?.clearEpoch());},
    lastReasoning: () =>
      records.length ? records[records.length - 1].reasoning : "",
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
