import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

const PORT = 9222;
const APP = process.argv[2] || 'http://127.0.0.1:8765/';
const chrome = spawn('google-chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--remote-debugging-port=' + PORT,
  '--remote-allow-origins=*',
  '--user-data-dir=/tmp/tavern-chrome-profile',
  '--window-size=1280,800',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;
const pending = new Map();
const fails = [];
let sessionId = null;

function send(method, params = {}, sid = sessionId) {
  const id = pending.size + Math.floor(Math.random() * 1000) + Date.now() % 100000;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId: sid || undefined }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }
    }, 15000);
  });
}

async function waitJson(url) {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) { /* chrome still booting */ }
    await sleep(100);
  }
  throw new Error('chrome debugging port did not open');
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

function check(name, ok, detail = '') {
  if (!ok) fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
  else console.log('ok', name);
}

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const file = `/tmp/${name}.png`;
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log('shot', file);
}

try {
  const version = await waitJson(`http://127.0.0.1:${PORT}/json/version`);
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  };
  const { targetId } = await send('Target.createTarget', { url: APP }, null);
  const attached = await send('Target.attachToTarget', { targetId, flatten: true }, null);
  sessionId = attached.sessionId;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.reload', { ignoreCache: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < 40; i += 1) {
    const ready = await evaluate('!!document.querySelector("#title") && !!window.TAUI');
    if (ready) break;
    await sleep(100);
    if (i === 39) throw new Error('app did not mount');
  }
  const counts = await evaluate(`({
    characters: TAUI.state.lib.characters.length,
    lore: TAUI.state.lib.worldBooks[0].entries.length,
    messages: TAUI.state.lib.chats[0].messages.length,
    title: document.querySelector('#title').textContent,
    save: document.querySelector('#save-pill').textContent
  })`);
  check('demo loaded', counts.characters >= 4 && counts.lore >= 6 && counts.messages >= 6, JSON.stringify(counts));
  check('home title', counts.title === '总览');
  const connect = await evaluate(`({
    button: document.querySelector('#model-connect')?.textContent || '',
    pick: document.querySelector('#model-pick')?.tagName || '',
    typed: !!document.querySelector('#model-panel input:not(#model-base):not(#model-key):not(#model-ping)'),
    test: !!document.querySelector('#model-test'),
    reply: !!document.querySelector('#model-reply'),
  })`);
  check('home model connect', connect.button.includes('连接') && connect.pick === 'SELECT' && !connect.typed && connect.test && connect.reply, JSON.stringify(connect));
  const chromeLook = await evaluate(`(() => {
    const nav = document.querySelector('.nav-btn.on')?.innerText || '';
    const select = document.querySelector('#model-pick');
    const style = getComputedStyle(select);
    return { nav, bg: style.backgroundColor, scheme: style.colorScheme, numbered: /^\\s*\\d\\d/.test(nav) };
  })()`);
  check('nav and model menu', !chromeLook.numbered && chromeLook.scheme === 'dark' && chromeLook.bg !== 'rgb(255, 255, 255)', JSON.stringify(chromeLook));
  check('saved', counts.save.includes('已保存'));

  const routes = await evaluate(`[...document.querySelectorAll('[data-nav]')].map((b) => b.dataset.nav)`);
  check('18 routes', routes.length === 18, String(routes.length));
  for (const id of routes) {
    const broken = await evaluate(`new Promise((resolve) => {
      document.querySelector('[data-nav="${id}"]').click();
      setTimeout(() => resolve(document.querySelector('#stage h3')?.textContent === '这一页没有画出来' ? document.querySelector('#stage').innerText : ''), 40);
    })`);
    check(`route ${id}`, !broken, broken);
  }

  const preview = await evaluate(`new Promise((resolve) => {
    document.querySelector('[data-nav="characters"]').click();
    setTimeout(() => {
      const input = document.querySelector('[data-field="name"]');
      input.value = '沈听雨·夜';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      resolve({ preview: document.querySelector('#prev-name')?.textContent, field: input.value });
    }, 40);
  })`);
  check('preview follows edit', preview.preview === '沈听雨·夜', JSON.stringify(preview));

  const exported = await evaluate(`new Promise((resolve) => {
    document.addEventListener('tavern-export', async (event) => {
      const text = await event.detail.blob.text();
      resolve(text);
    }, { once: true });
    document.querySelector('[data-act="json"]').click();
  })`);
  const card = JSON.parse(exported);
  check('export json', card.spec === 'chara_card_v2' && card.data.name === '沈听雨·夜');

  const pngName = await evaluate(`new Promise((resolve, reject) => {
    document.addEventListener('tavern-export', async (event) => {
      try {
        const bytes = new Uint8Array(await event.detail.blob.arrayBuffer());
        const raw = TAPng.readChara(bytes);
        const data = JSON.parse(raw);
        resolve(JSON.stringify({ file: event.detail.filename, name: data.data.name, spec: data.spec }));
      } catch (error) { reject(error); }
    }, { once: true });
    document.querySelector('[data-act="png"]').click();
  })`);
  const png = JSON.parse(pngName);
  check('export png', png.spec === 'chara_card_v2' && png.name === '沈听雨·夜' && png.file.endsWith('.png'), pngName);
  const beside = await evaluate(`(() => {
    const form = document.querySelector('#char-form').getBoundingClientRect();
    const preview = document.querySelector('#char-preview').getBoundingClientRect();
    return { previewLeft: preview.left, formRight: form.right, previewTop: preview.top, formTop: form.top };
  })()`);
  check('preview beside editor', beside.previewLeft >= beside.formRight - 8 && Math.abs(beside.previewTop - beside.formTop) < 40, JSON.stringify(beside));

  const lore = await evaluate(`new Promise((resolve) => {
    document.querySelector('[data-nav="lore"]').click();
    setTimeout(() => resolve({ columns: document.querySelectorAll('.column').length, text: document.body.innerText.includes('听雨楼') }), 40);
  })`);
  check('lore board', lore.columns >= 6 && lore.text, JSON.stringify(lore));
  const formula = await evaluate(`new Promise((resolve) => {
    document.querySelector('[data-nav="characters"]').click();
    setTimeout(() => {
      const card = document.querySelector('#stage').innerText;
      document.querySelector('[data-nav="lore"]').click();
      setTimeout(() => {
        const book = document.querySelector('#stage').innerText;
        resolve({
          card: /这是谁|和用户是什么关系|最不该被写反/.test(card),
          book: /这本书主要约束|读者一进来就该知道|哪些词一出现/.test(book),
        });
      }, 40);
    }, 40);
  })`);
  check('no fixed questions', !formula.card && !formula.book, JSON.stringify(formula));
  const studioLayout = await evaluate(`new Promise((resolve) => {
    document.querySelector('[data-nav="studio"]').click();
    setTimeout(() => {
      const requestEl = document.querySelector('.studio-request');
      const boardEl = document.querySelector('.studio');
      const scanEl = document.querySelector('.studio-scan');
      const results = document.querySelector('.studio-results');
      if (!requestEl || !boardEl || !scanEl || !results) { resolve({ missing: true, text: (document.querySelector('#stage')?.innerText || '').slice(0, 180) }); return; }
      const request = requestEl.getBoundingClientRect();
      const board = boardEl.getBoundingClientRect();
      const scan = scanEl.getBoundingClientRect();
      resolve({
        request: Math.round(request.width),
        board: Math.round(board.width),
        scan: Math.round(scan.width),
        hidden: results.hidden,
        split: document.body.innerText.includes('触发的') && document.body.innerText.includes('未触发的'),
      });
    }, 40);
  })`);
  check('studio uses width', studioLayout.request > studioLayout.board * 0.4 && studioLayout.scan > 280 && studioLayout.board > 700 && studioLayout.hidden && studioLayout.split, JSON.stringify(studioLayout));

  const chat = await evaluate(`new Promise((resolve) => {
    document.querySelector('[data-nav="chat"]').click();
    setTimeout(() => {
      const input = document.querySelector('#passage');
      input.focus();
      input.value = '说一半';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      resolve({ marks: document.querySelectorAll('#chat-log mark').length, focused: document.activeElement === input });
    }, 40);
  })`);
  check('chat search keeps focus', chat.marks >= 1 && chat.focused, JSON.stringify(chat));

  const theme = await evaluate(`(() => {
    document.querySelector('[data-shell="settings"]').click();
    const bg = document.querySelector('#set-bg');
    bg.value = '#102030';
    bg.dispatchEvent(new Event('input', { bubbles: true }));
    const radius = document.querySelector('#set-radius');
    radius.value = '8';
    radius.dispatchEvent(new Event('input', { bubbles: true }));
    const out = {
      bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      radius: getComputedStyle(document.documentElement).getPropertyValue('--radius').trim(),
      nav: !!document.querySelector('[data-nav="theme"]'),
    };
    document.querySelector('#set-close').click();
    return out;
  })()`);
  check('theme live', theme.bg === '#102030' && theme.radius === '8px' && !theme.nav, JSON.stringify(theme));

  const findings = await evaluate(`new Promise((resolve) => {
    document.querySelector('[data-nav="check"]').click();
    setTimeout(() => resolve(document.querySelector('#findings')?.innerText || ''), 40);
  })`);
  check('consistency', findings.includes('缺少性格') && findings.includes('沈听语') && findings.includes('喝酒'), findings.slice(0, 180));

  const restored = await evaluate(`new Promise(async (resolve) => {
    document.querySelector('[data-nav="backup"]').click();
    setTimeout(async () => {
      const backup = JSON.stringify(TAFormats.backupOf(TAUI.state.lib));
      TAUI.state.lib.meta.name = '不该留下的名字';
      const file = new File([backup], 'backup.json', { type: 'application/json' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      document.getElementById('stage').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      setTimeout(() => {
        document.querySelector('[data-act="replace"]')?.click();
        setTimeout(() => resolve(TAUI.state.lib.meta.name), 80);
      }, 40);
    }, 40);
  })`);
  check('backup restore', restored === '听雨楼示例库', restored);

  await evaluate(`(() => {
    const theme = TAUI.state.lib.themes.find((item) => item.name === '夜漆') || TAUI.state.lib.themes[0];
    Object.assign(theme.vars, { bg: '#140e0a', lacquer: '#24180f', paper: '#f4e7d1', ink: '#1a120c', accent: '#c6a15a' });
    TAUI.state.lib.activeThemeId = theme.id;
    TAUI.applyTheme();
    document.querySelector('#toasts').replaceChildren();
  })()`);
  for (const [id, file] of [['home', 'tavern-desktop'], ['characters', 'tavern-character'], ['lore', 'tavern-lore'], ['chat', 'tavern-chat'], ['graph', 'tavern-graph']]) {
    await evaluate(`document.querySelector('[data-nav="${id}"]').click()`);
    await sleep(80);
    await evaluate(`document.querySelector('#toasts').replaceChildren()`);
    await shot(file);
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await evaluate(`document.querySelector('[data-nav="characters"]').click()`);
  await sleep(80);
  const narrow = await evaluate(`({
    overflow: document.documentElement.scrollWidth,
    nav: getComputedStyle(document.querySelector('.nav-list')).flexDirection,
    title: document.querySelector('#title').textContent
  })`);
  check('narrow fit', narrow.overflow <= 400 && narrow.nav === 'row' && narrow.title === '角色卡工坊', JSON.stringify(narrow));
  const stacked = await evaluate(`(() => {
    const form = document.querySelector('#char-form').getBoundingClientRect();
    const preview = document.querySelector('#char-preview').getBoundingClientRect();
    return { previewTop: preview.top, formBottom: form.bottom, width: preview.width };
  })()`);
  check('narrow preview stacks', stacked.previewTop >= stacked.formBottom - 8, JSON.stringify(stacked));
  await evaluate(`document.querySelector('#toasts').replaceChildren()`);
  await shot('tavern-narrow');

  await evaluate(`document.querySelector('[data-nav="home"]').click()`);
  await sleep(40);
  await shot('tavern-narrow-home');

  const settings = await evaluate(`(() => {
    document.querySelector('[data-shell="settings"]').click();
    const base = document.querySelector('#set-base');
    const key = document.querySelector('#set-key');
    const profile = document.querySelector('#set-profile');
    const json = document.querySelector('#set-json');
    base.value = 'https://example.test/v1';
    base.dispatchEvent(new Event('input', { bubbles: true }));
    key.value = 'not-logged';
    key.dispatchEvent(new Event('input', { bubbles: true }));
    profile.value = 'strict';
    profile.dispatchEvent(new Event('change', { bubbles: true }));
    json.checked = true;
    json.dispatchEvent(new Event('change', { bubbles: true }));
    const whileOpen = {
      base: NIJANModel.load().baseUrl === 'https://example.test/v1',
      noTypedModel: !document.querySelector('#set-model'),
      key: NIJANModel.load().key === 'not-logged',
      profile: NIJANModel.load().profile === 'strict',
      json: TAI18n.prefs.jsonMode === true,
    };
    key.value = 'still-not-logged';
    document.querySelector('#set-close').click();
    const afterClose = NIJANModel.load().key === 'still-not-logged' && !document.querySelector('#set-base');
    document.querySelector('[data-shell="settings"]').click();
    const reopened = {
      base: document.querySelector('#set-base').value === 'https://example.test/v1',
      noTypedModel: !document.querySelector('#set-model'),
      key: document.querySelector('#set-key').value === 'still-not-logged',
      profile: document.querySelector('#set-profile').value === 'strict',
      json: document.querySelector('#set-json').checked === true,
    };
    document.querySelector('#set-key').value = '';
    document.querySelector('#set-json').checked = false;
    document.querySelector('#set-profile').value = 'default';
    document.querySelector('#set-base').value = '';
    document.querySelector('#set-close').click();
    return { whileOpen, afterClose, reopened };
  })()`);
  check('settings keep model fields', settings.whileOpen.base && settings.whileOpen.noTypedModel && settings.whileOpen.key && settings.whileOpen.profile && settings.whileOpen.json && settings.afterClose && settings.reopened.base && settings.reopened.noTypedModel && settings.reopened.key && settings.reopened.profile && settings.reopened.json, JSON.stringify(settings));

  const studio = await evaluate(`new Promise((resolve) => {
    document.querySelector('[data-nav="studio"]').click();
    setTimeout(() => {
      const text = document.querySelector('#stage').innerText;
      const results = document.querySelector('.studio-results');
      const input = document.querySelector('[data-path="card.name"]');
      input.value = '测试角色';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const card = TAUI.state.lib.characters.find((item) => item.id === 'ai_card');
      resolve({
        cols: document.querySelectorAll('.studio-col').length,
        formula: /这是谁|和用户是什么关系|最不该被写反|这本书主要约束/.test(text),
        imported: !!(card && card.name === '测试角色'),
        hidden: results.hidden,
        kept: !!document.querySelector('.studio-request') && !!document.querySelector('#studio-more') && !!document.querySelector('#studio-progress'),
        workshops: ['段落预设', '角色卡', '世界书', '提示词拼装', '群聊卡司', '聊天阅览', '素材库', '正则', '快捷回复', '作者注与情景时间线', '角色关系图', '群聊剧本', '人设一致性检查'].every((name) => results.textContent.includes(name)),
      });
    }, 60);
  })`);
  check('studio columns import', studio.cols >= 13 && studio.workshops && studio.imported && studio.hidden && studio.kept && !studio.formula, JSON.stringify(studio));

  const writing = await evaluate(`new Promise((resolve) => {
    const seen = [];
    NIJANModel.configured = () => true;
    NIJANModel.askJson = (task, user) => new Promise((done) => {
      seen.push(user && user.supplement);
      setTimeout(() => done({ character: { name: '甲' }, world: { name: '书', entries: [] } }), 50);
    });
    const data = NIJANStudio.draft();
    data.brief = '写一个人';
    data.ideas = [{ text: '安静', status: 'yes' }];
    NIJANStudio.render(document.querySelector('#stage'));
    const more = document.querySelector('#studio-more');
    let revealed = false;
    document.querySelector('#studio-write').click();
    setTimeout(() => {
      revealed = document.querySelector('.studio-results').hidden === false;
      more.value = '女主外貌';
      more.dispatchEvent(new Event('input', { bubbles: true }));
    }, 30);
    setTimeout(() => {
      resolve({
        obvious: more.closest('.studio-live') != null,
        seen,
        revealed,
        progress: document.querySelector('#studio-progress')?.textContent || '',
      });
    }, 500);
  })`);
  check('supplement reaches model', writing.obvious && writing.revealed && writing.seen.includes('女主外貌') && writing.progress.includes('写完'), JSON.stringify(writing));

  const brought = await evaluate(`(async () => {
    const source = { name: '旧人', description: '茶色眼睛', personality: '嘴严', scenario: '雨夜', first_mes: '进来', mes_example: '例子', system_prompt: '系统', creator_notes: '注' };
    NIJANStudio.applyCardParts(source, ['appearance'], { fresh: true });
    const onlyLook = Object.assign({}, NIJANStudio.draft().card);
    NIJANStudio.applyCardParts(source, ['all'], { fresh: true });
    const whole = Object.assign({}, NIJANStudio.draft().card);
    NIJANModel.configured = () => true;
    NIJANModel.askJson = async () => ({ entries: [
      { 条目名: '听雨楼', 触发: true, 理由: '这句话里有楼' },
      { 条目名: '茶引', 触发: false, 理由: '没提到铜钱' },
    ] });
    await NIJANStudio.importWorldEntries([
      { comment: '听雨楼', keys: ['听雨楼'], content: '楼还在。', constant: true },
      { comment: '茶引', keys: ['茶引'], content: '铜钱不是通货。', constant: false },
    ], '导入书');
    NIJANStudio.render(document.querySelector('#stage'));
    const scan = document.querySelector('#studio-scan').innerText;
    return {
      look: onlyLook.description === '茶色眼睛' && onlyLook.personality === '' && onlyLook.name === '' && onlyLook.scenario === '',
      whole: whole.name === '旧人' && whole.personality === '嘴严' && whole.description === '茶色眼睛',
      parts: document.body.innerText.includes('整张卡') && document.body.innerText.includes('外貌') && document.body.innerText.includes('导入世界书'),
      scan: scan.includes('听雨楼') && scan.includes('茶引') && !scan.includes('未命名'),
    };
  })()`);
  check('import card parts and world book', brought.look && brought.whole && brought.parts && brought.scan, JSON.stringify(brought));

  const entryName = await evaluate(`(() => {
    const data = NIJANStudio.draft();
    data.bookName = '外貌书';
    data.bookText = '条目名：\\n关键词：眼睛\\n正文：眼睛是很淡的茶色。';
    NIJANStudio.importLive();
    const book = TAUI.state.lib.worldBooks.find((item) => item.id === 'ai_book');
    const entry = book.entries[0];
    return { comment: entry.comment, keys: entry.keys.join(','), content: entry.content };
  })()`);
  check('world entry has a name', entryName.comment.startsWith('眼睛是很淡的茶色') && entryName.comment !== '未命名' && entryName.keys === '眼睛' && entryName.content === '眼睛是很淡的茶色。', JSON.stringify(entryName));

  const writerSettings = await evaluate(`(() => {
    document.querySelector('[data-shell="settings"]').click();
    const adult = document.querySelector('#set-adult');
    const live = document.querySelector('#set-live');
    const temp = document.querySelector('#set-temp');
    const before = { adult: adult.checked, live: live.checked };
    temp.value = '1.2';
    temp.dispatchEvent(new Event('input', { bubbles: true }));
    adult.checked = true;
    adult.dispatchEvent(new Event('change', { bubbles: true }));
    const savedTemp = NIJANModel.load().temperature;
    const savedAdult = TAI18n.prefs.adult === true;
    adult.checked = false;
    adult.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#set-close').click();
    return { before, savedTemp, savedAdult, closedAdult: TAI18n.prefs.adult === false };
  })()`);
  check('writer settings', writerSettings.before.adult === false && writerSettings.before.live === true && Math.abs(writerSettings.savedTemp - 1.2) < 0.05 && writerSettings.savedAdult && writerSettings.closedAdult, JSON.stringify(writerSettings));

  const guide = await evaluate(`(() => {
    const style = TAUI.state.lib.sections.style;
    style.on = true;
    style.preset = 'short';
    style.custom = '';
    style.text = '句子短。少形容词。一句只做一件事。';
    TAI18n.save({ replyLength: 'custom', replyChars: 321 });
    const prompt = NIJANModel.systemPrompt('写');
    const payload = NIJANStudio.draft ? null : null;
    TAI18n.save({ lang: 'zh', replyLength: 'medium', replyChars: 600 });
    TAUI.show('memory');
    const zh = document.querySelector('#stage').innerText;
    TAI18n.save({ lang: 'en' });
    TAUI.renderStage();
    const en = document.querySelector('#stage').innerText;
    TAI18n.save({ lang: 'ja' });
    TAUI.renderStage();
    const ja = document.querySelector('#stage').innerText;
    TAI18n.save({ lang: 'zh' });
    TAUI.renderStage();
    return {
      style: prompt.includes('句子短'),
      count: prompt.includes('321'),
      zh: zh.includes('JS-Slash-Runner') && zh.includes('导出 HTML') && zh.includes('放进 SillyTavern'),
      en: en.includes('Import HTML') && en.includes('JS-Slash-Runner') && en.includes('Enable the panel'),
      ja: ja.includes('HTML を書き出す') && ja.includes('パネルを有効にする'),
    };
  })()`);
  check('length, style, and memory steps', guide.style && guide.count && guide.zh && guide.en && guide.ja, JSON.stringify(guide));
} catch (error) {
  console.error(error);
  fails.push(error.message);
} finally {
  chrome.kill();
  if (ws) ws.close();
}

if (fails.length) {
  console.error('FAILED\n' + fails.join('\n'));
  process.exit(1);
}
console.log('browser ok');
