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
  check('saved', counts.save.includes('已保存'));

  const routes = await evaluate(`[...document.querySelectorAll('[data-nav]')].map((b) => b.dataset.nav)`);
  check('17 routes', routes.length === 17, String(routes.length));
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

  const theme = await evaluate(`new Promise((resolve) => {
    document.querySelector('[data-nav="theme"]').click();
    setTimeout(() => {
      const input = document.querySelector('[data-color="bg"]');
      input.value = '#102030';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      resolve(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
    }, 40);
  })`);
  check('theme live', theme === '#102030', theme);

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
    const model = document.querySelector('#set-model');
    const key = document.querySelector('#set-key');
    const profile = document.querySelector('#set-profile');
    const json = document.querySelector('#set-json');
    base.value = 'https://example.test/v1';
    base.dispatchEvent(new Event('input', { bubbles: true }));
    model.value = 'demo-model';
    model.dispatchEvent(new Event('input', { bubbles: true }));
    key.value = 'not-logged';
    key.dispatchEvent(new Event('input', { bubbles: true }));
    profile.value = 'strict';
    profile.dispatchEvent(new Event('change', { bubbles: true }));
    json.checked = true;
    json.dispatchEvent(new Event('change', { bubbles: true }));
    const whileOpen = {
      base: NIJANModel.load().baseUrl === 'https://example.test/v1',
      model: NIJANModel.load().model === 'demo-model',
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
      model: document.querySelector('#set-model').value === 'demo-model',
      key: document.querySelector('#set-key').value === 'still-not-logged',
      profile: document.querySelector('#set-profile').value === 'strict',
      json: document.querySelector('#set-json').checked === true,
    };
    document.querySelector('#set-key').value = '';
    document.querySelector('#set-json').checked = false;
    document.querySelector('#set-profile').value = 'default';
    document.querySelector('#set-base').value = '';
    document.querySelector('#set-model').value = '';
    document.querySelector('#set-close').click();
    return { whileOpen, afterClose, reopened };
  })()`);
  check('settings keep model fields', settings.whileOpen.base && settings.whileOpen.model && settings.whileOpen.key && settings.whileOpen.profile && settings.whileOpen.json && settings.afterClose && settings.reopened.base && settings.reopened.model && settings.reopened.key && settings.reopened.profile && settings.reopened.json, JSON.stringify(settings));
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
