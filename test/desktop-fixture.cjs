'use strict';
const {app, BrowserWindow, session} = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const profile = process.env.QUILVORI_TEST_PROFILE;
if (!profile || path.dirname(profile) !== os.tmpdir() || !path.basename(profile).startsWith('quilvori-ui-')) {
  throw Error('An isolated test profile is required.');
}
app.setPath('userData', profile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = function suite(name, exercise) {
  app.whenReady().then(async () => {
    const isolated = session.fromPartition('persist:qa-' + name);
    isolated.webRequest.onBeforeRequest((request, done) => done({cancel:/^https?:/.test(request.url)}));
    const win = new BrowserWindow({show:false, width:1280, height:900, webPreferences:{
      session:isolated, contextIsolation:true, nodeIntegration:false, backgroundThrottling:false,
    }});
    const run = (fn, ...args) => win.webContents.executeJavaScript('(' + fn.toString() + ')(...' + JSON.stringify(args) + ')', true);
    async function wait(fn, description, ...args) {
      for (let i = 0; i < 150; i++) {
        if (await run(fn, ...args)) return;
        await delay(35);
      }
      throw Error('Timed out waiting for ' + description);
    }
    async function open(page) {
      await win.loadFile(path.join(__dirname, '..', page + '.html'));
      await wait(() => !!window.TAUI?.state.lib && !!document.querySelector('#stage > *'), 'page ' + page);
    }
    const click = selector => run(s => {
      const el = document.querySelector(s);
      if (!el || el.disabled) throw Error('Unavailable control ' + s);
      el.click();
    }, selector);
    const input = (selector, value) => run((s, v) => {
      const el = document.querySelector(s);
      el.focus(); el.value = v; el.dispatchEvent(new Event('input', {bubbles:true}));
    }, selector, value);
    const file = (json, name='fixture.json') => run((value, filename) => {
      const picker = TAUI.pickFile;
      TAUI.pickFile = async () => {
        TAUI.pickFile = picker;
        return new File([JSON.stringify(value)], filename, {type:'application/json'});
      };
    }, json, name);
    function key(keyCode, modifiers=[]) {
      win.webContents.sendInputEvent({type:'keyDown', keyCode, modifiers});
      if (keyCode === 'Return') win.webContents.sendInputEvent({type:'char', keyCode:'\r', modifiers});
      win.webContents.sendInputEvent({type:'keyUp', keyCode, modifiers});
    }
    let seq = 0;
    async function download(selector) {
      const dest = path.join(profile, name + '-download-' + (++seq));
      let timer, receive;
      const downloaded = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(Error('No completed download from ' + selector)), 6500);
        receive = (_event, item) => {
          const filename = item.getFilename();
          item.setSavePath(dest);
          item.once('done', (_e, state) => state === 'completed' ? resolve(filename) : reject(Error('Download ' + state)));
        };
        isolated.once('will-download', receive);
      });
      try {
        const [filename] = await Promise.all([downloaded, click(selector)]);
        return {filename, bytes:await fs.readFile(dest)};
      } catch (error) {
        const status = await run(() => ({
          dialog:document.querySelector('#modal-root.show')?.innerText,
          message:document.querySelector('#toast')?.innerText,
          lastExport:document.querySelector('#export-slip')?.innerText,
          lang:document.documentElement.lang, save:TAUI.state.save,
        }));
        throw new Error(error.message+' '+JSON.stringify(status),{cause:error});
      } finally {
        clearTimeout(timer);
        isolated.removeListener('will-download', receive);
      }
    }
    try { await exercise({run, wait, open, click, input, file, key, download, win}); }
    finally { win.destroy(); }
  }).then(() => app.exit(0), err => {console.error(err.stack || err); app.exit(1);});
};
