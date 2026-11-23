/* OpenAI-compatible client. The key stays in localStorage and is never written to the library. */
(function (root) {
  const KEY = 'nijan-model';

  function load() {
    try { return Object.assign({ baseUrl: '', model: '', key: '', profile: 'default', temperature: 0.7 }, JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch (error) { return { baseUrl: '', model: '', key: '', profile: 'default', temperature: 0.7 }; }
  }

  function save(next) {
    const current = load();
    const merged = Object.assign(current, next || {});
    if (!next || !Object.prototype.hasOwnProperty.call(next, 'key')) merged.key = current.key;
    const temperature = Number(merged.temperature);
    localStorage.setItem(KEY, JSON.stringify({
      baseUrl: merged.baseUrl || '',
      model: merged.model || '',
      key: merged.key || '',
      profile: merged.profile || 'default',
      temperature: Number.isFinite(temperature) ? temperature : 0.7,
    }));
    return merged;
  }

  let catalog = [];

  function apiRoot(baseUrl) {
    return String(baseUrl || '').trim().replace(/\/$/, '').replace(/\/chat\/completions$/, '').replace(/\/models$/, '');
  }

  function modelsFromPayload(data) {
    const list = Array.isArray(data) ? data : ((data && (data.data || data.models)) || []);
    return list.map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      return String(item.id || item.name || item.model || '').trim();
    }).filter(Boolean);
  }

  function configured() {
    const cfg = load();
    return !!(cfg.baseUrl && cfg.model && cfg.key);
  }

  function jsonMode() {
    return !!(root.TAI18n && root.TAI18n.prefs && root.TAI18n.prefs.jsonMode);
  }

  function allowsAdult() {
    return load().profile !== 'strict';
  }

  function writingGuide() {
    const prefs = (root.TAI18n && root.TAI18n.prefs) || {};
    const mode = prefs.replyLength || 'medium';
    const custom = Math.max(50, Math.min(8000, Number(prefs.replyChars) || 600));
    const count = mode === 'short' ? 200 : mode === 'long' ? 1500 : mode === 'custom' ? custom : 600;
    const sections = (root.TAUI && root.TAUI.state && root.TAUI.state.lib && root.TAUI.state.lib.sections) || {};
    const group = sections.style || {};
    const presets = {
      short: '句子短。少形容词。一句只做一件事。',
      long: '允许把环境、触觉和光线写长。句子可以慢慢收束。',
      talk: '多用对白推进。叙述只补动作和停顿。',
      spare: '不把情绪说满。留下没写完的半句，让空白自己工作。',
    };
    const style = String(group.custom || '').trim() || String(group.text || '').trim() || presets[group.preset] || presets.short;
    return { mode, count, style };
  }

  function systemPrompt(task) {
    const profile = load().profile || 'default';
    const english = profile === 'weak-zh';
    const sections = (root.TAUI && root.TAUI.state && root.TAUI.state.lib && root.TAUI.state.lib.sections) || {};
    const guide = writingGuide();
    const adultOk = allowsAdult() && !!(root.TAI18n && root.TAI18n.prefs && root.TAI18n.prefs.adult);
    const r18 = adultOk && sections.r18 && sections.r18.on;
    const nsfw = adultOk && sections.nsfw && sections.nsfw.on;
    if (english) {
      let text = 'You help write SillyTavern character cards and world books. Reply in JSON only. If you are unsure, reply {"unsure":true,"question":"..."} and do not invent the document. ' + task;
      if (profile === 'strict' || !adultOk) text += ' Do not write sexual, erotic, or 18+ content.';
      else {
        if (r18) text += ' The user enabled R18. You may include adult intimacy only with clear consent, aftercare, and hard limits.';
        if (nsfw) text += ' The user enabled NSFW. You may write the selected NSFW tone.';
      }
      text += ` Writing style: ${guide.style} Keep prose near ${guide.count} characters.`;
      return text;
    }
    let text = '你帮用户写酒馆角色卡和世界书。只回 JSON。没把握时只回 {"unsure":true,"question":"..."}，不要硬写。' + task;
    if (profile === 'strict' || !adultOk) text += '不要写任何成人、色情或 18+ 内容。';
    else {
      if (r18) text += '用户打开了 R18，可以写成人亲密，但必须有同意、事后照料和硬界限。';
      if (nsfw) text += '用户打开了 NSFW，可以按所选的 NSFW 预设来写。';
    }
    text += `文风：${guide.style} 正文篇幅大约 ${guide.count} 字，不要明显更短或更长。`;
    return text;
  }

  async function complete(messages) {
    const cfg = load();
    if (!cfg.baseUrl || !cfg.model || !cfg.key) {
      const error = new Error('先在总览连接，并选一个模型。密钥只留在这台浏览器。');
      error.code = 'no-model';
      throw error;
    }
    const url = cfg.baseUrl.replace(/\/$/, '').replace(/\/chat\/completions$/, '') + '/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, temperature: Number.isFinite(Number(cfg.temperature)) ? Number(cfg.temperature) : 0.7, messages }),
    });
    if (!response.ok) throw new Error(`接口返回 ${response.status}`);
    const data = await response.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  }

  function parseJson(text) {
    const trimmed = String(text || '').trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1] : trimmed;
    return JSON.parse(raw);
  }

  function localInspirations(kind, answers) {
    const seed = (answers || []).filter(Boolean).join('；') || '还没有补充';
    if (kind === 'card') {
      return [
        `把「${seed}」收成一个安静、话少的人。`,
        `把「${seed}」收成一个爱把话说一半的人。`,
        `把「${seed}」收成一个规矩很多、但会照顾人的人。`,
      ];
    }
    return [
      `用「${seed}」写成一条恒定规矩。`,
      `用「${seed}」写成靠关键词触发的条目。`,
      `用「${seed}」写成一条只在事后出现的条目。`,
    ];
  }

  async function askModel(kind, answers) {
    const task = kind === 'card'
      ? '根据用户的回答，写出角色卡 JSON：name, personality, scenario, first_mes, mes_example, system_prompt。'
      : '根据用户的回答，写出世界书 JSON：{"entries":[{"条目名":"","触发关键词":[],"正文":""}]}。';
    const content = await complete([
      { role: 'system', content: systemPrompt(task) },
      { role: 'user', content: JSON.stringify({ answers, json: jsonMode() }) },
    ]);
    return parseJson(content);
  }

  function diffLines(before, after) {
    const lines = [];
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    keys.forEach((key) => {
      const left = JSON.stringify(before[key] ?? '');
      const right = JSON.stringify(after[key] ?? '');
      if (left !== right) lines.push(`${key}：${left} → ${right}`);
    });
    return lines;
  }

  function mount(stage, kind) {
    const host = stage.querySelector('#writer');
    if (!host || host.dataset.ready) return;
    host.dataset.ready = '1';
    const ui = root.TAUI;
    host.className = 'paper stack writer';
    host.innerHTML = `<p class="eyebrow">模型</p><p class="help">先问清楚，再给几条灵感。接受或拒绝之后才写。没把握会停下来再问。</p><div class="row"><button type="button" class="btn" id="writer-ask">先问几个问题</button><button type="button" class="btn" id="writer-ideas">给我灵感</button><button type="button" class="btn btn-primary" id="writer-go">开始写</button></div><div id="writer-body"></div>`;
    const body = host.querySelector('#writer-body');
    let answers = [];
    let chosen = '';
    const paintQuestions = (extra) => {
      const questions = extra || [];
      body.innerHTML = questions.map((q, i) => `<label class="field"><span class="field-label">${ui.esc(q)}</span><input data-answer="${i}" type="text" value="${ui.esc(answers[i] || '')}"></label>`).join('');
      body.querySelectorAll('[data-answer]').forEach((input) => {
        input.oninput = () => { answers[Number(input.dataset.answer)] = input.value; };
      });
    };
    host.querySelector('#writer-ask').onclick = async () => {
      paintQuestions();
      if (!configured()) return;
      try {
        const more = await complete([
          { role: 'system', content: systemPrompt('再提两个必须先问清的问题，只回 JSON：{"questions":["...","..."]}') },
          { role: 'user', content: kind },
        ]);
        const parsed = parseJson(more);
        paintQuestions(parsed.questions || []);
      } catch (error) {
        ui.toast(error.message);
      }
    };
    host.querySelector('#writer-ideas').onclick = async () => {
      let ideas = localInspirations(kind, answers);
      if (configured()) {
        try {
          const raw = await complete([
            { role: 'system', content: systemPrompt('给三条不同的写法灵感，只回 JSON：{"ideas":["...","...","..."]}。先不要写完整文档。') },
            { role: 'user', content: JSON.stringify(answers) },
          ]);
          ideas = parseJson(raw).ideas || ideas;
        } catch (error) {
          ui.toast(error.message);
        }
      }
      body.innerHTML = ideas.map((idea, index) => `<div class="row"><span>${ui.esc(idea)}</span><button type="button" class="btn btn-small" data-yes="${index}">接受</button><button type="button" class="btn btn-small" data-no="${index}">拒绝</button></div>`).join('');
      body.querySelectorAll('[data-yes]').forEach((button) => {
        button.onclick = () => { chosen = ideas[Number(button.dataset.yes)]; ui.toast('已接受这条灵感'); };
      });
      body.querySelectorAll('[data-no]').forEach((button) => {
        button.onclick = () => { if (chosen === ideas[Number(button.dataset.no)]) chosen = ''; button.closest('.row').remove(); };
      });
    };
    host.querySelector('#writer-go').onclick = async () => {
      if (!chosen && !answers.filter(Boolean).length) { ui.toast('先回答问题，或接受一条灵感'); return; }
      if (!configured()) { ui.toast('还没有配置模型。设置里填写地址、模型名和密钥后再写。'); return; }
      try {
        let result = await askModel(kind, answers.concat(chosen ? [`采用灵感：${chosen}`] : []));
        if (result && result.unsure) {
          const answer = await ui.ask({ title: '先停一下', body: result.question || '这里我没把握。', actions: [{ id: 'yes', label: '按这个继续', kind: 'btn-primary' }, { id: 'no', label: '先不写' }] });
          if (answer !== 'yes') return;
          result = await askModel(kind, answers.concat([result.question, '用户确认可以继续']));
        }
        if (kind === 'card') applyCard(result);
        else applyBook(result);
      } catch (error) {
        ui.toast(error.message);
      }
    };
  }

  function applyCard(result) {
    const ui = root.TAUI;
    const character = ui.state.lib.characters.find((item) => item.id === ui.state.sel.character) || ui.state.lib.characters[0];
    if (!character) { ui.toast('先有一张角色卡'); return; }
    const before = { name: character.name, personality: character.personality, scenario: character.scenario, first_mes: character.first_mes, mes_example: character.mes_example, system_prompt: character.system_prompt };
    const next = {
      name: result.name || before.name,
      personality: result.personality || before.personality,
      scenario: result.scenario || before.scenario,
      first_mes: result.first_mes || before.first_mes,
      mes_example: result.mes_example || before.mes_example,
      system_prompt: result.system_prompt || before.system_prompt,
    };
    const lines = diffLines(before, next);
    ui.ask({ title: '模型改了这些', body: lines.join('\n') || '没有改动', actions: [{ id: 'no', label: '放弃' }], swipe: '滑开写入角色卡' }).then((answer) => {
      if (answer !== 'yes') return;
      Object.assign(character, next);
      ui.markDirty();
      ui.renderStage();
    });
  }

  function applyBook(result) {
    const ui = root.TAUI;
    const book = ui.state.lib.worldBooks.find((item) => item.id === ui.state.sel.book) || ui.state.lib.worldBooks[0];
    if (!book) { ui.toast('先有一本世界书'); return; }
    const entries = root.TAFormats.worldInfoToEntries(result.entries ? result : { entries: result.entries || result });
    const before = { count: book.entries.length };
    const after = { count: entries.length, names: entries.map((entry) => entry.comment).join('、') };
    ui.ask({ title: '模型准备写入的条目', body: diffLines(before, { count: after.count, names: after.names }).join('\n'), actions: [{ id: 'no', label: '放弃' }], swipe: '滑开写入世界书' }).then((answer) => {
      if (answer !== 'yes') return;
      book.entries = entries.map((entry) => Object.assign({ id: `lore_${Math.random().toString(16).slice(2)}`, secondaryKeys: [], constant: false, selective: true, order: 100, position: 'before_char', enabled: true, depth: 4, outletName: '' }, entry));
      ui.markDirty();
      ui.renderStage();
    });
  }

  async function listModels() {
    const cfg = load();
    if (!cfg.baseUrl || !cfg.key) {
      const error = new Error('先填写接口地址和密钥。密钥只留在这台浏览器。');
      error.code = 'no-model';
      throw error;
    }
    const response = await fetch(`${apiRoot(cfg.baseUrl)}/models`, {
      headers: { Authorization: `Bearer ${cfg.key}` },
    });
    if (!response.ok) throw new Error(`模型列表返回 ${response.status}`);
    catalog = modelsFromPayload(await response.json());
    return catalog.slice();
  }

  async function askJson(task, user) {
    const raw = await complete([
      { role: 'system', content: systemPrompt(task) },
      { role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user) },
    ]);
    return parseJson(raw);
  }

  async function testMessage(text) {
    return String(await complete([{ role: 'user', content: text || '请只回复：收到' }]) || '');
  }

  async function semanticFindings(character) {
    if (!configured()) return [];
    const raw = await complete([
      { role: 'system', content: systemPrompt('检查人设是否前后矛盾。只回 JSON：{"findings":[{"title":"","detail":""}]}。空字段和关键词重复不用你报。') },
      { role: 'user', content: JSON.stringify({ name: character.name, personality: character.personality, scenario: character.scenario, first_mes: character.first_mes, description: character.description }) },
    ]);
    const parsed = parseJson(raw);
    return parsed.findings || [];
  }

  root.NIJANModel = { load, save, configured, allowsAdult, jsonMode, systemPrompt, writingGuide, mount, semanticFindings, listModels, testMessage, askJson, modelsFromPayload, rememberedModels: () => catalog.slice() };
})(typeof globalThis !== 'undefined' ? globalThis : window);
