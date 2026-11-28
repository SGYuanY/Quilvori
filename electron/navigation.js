/* Keep untrusted web content outside Electron and privileged IPC inside the app. */
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const APP_PAGES = new Set([
  'index.html', 'studio.html', 'characters.html', 'lore.html', 'resources.html','themes.html',
  'sections.html', 'prompts.html', 'groups.html', 'chat.html', 'assets.html',
  'regex.html', 'quick.html', 'timeline.html', 'graph.html', 'check.html',
  'script.html', 'backup.html', 'memory.html', 'tutorial.html',
]);
const canonical = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);

function isTrustedLocalUrl(value, appRoot) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'file:' || url.hostname || url.username || url.password) return false;
    const file = fileURLToPath(url);
    return canonical(path.dirname(file)) === canonical(appRoot) && APP_PAGES.has(path.basename(file).toLowerCase());
  } catch (_) { return false; }
}

function isTrustedSender(event, appRoot) {
  try {
    const sender = event?.sender, frame = event?.senderFrame;
    return !!sender && !!frame && !sender.isDestroyed() && frame === sender.mainFrame
      && frame.parent === null && isTrustedLocalUrl(frame.url, appRoot);
  } catch (_) { return false; }
}

function safeExternalUrl(value) {
  if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const input = value.trim();
  if (!/^https?:\/\//i.test(input)) return null;
  try {
    const url = new URL(input);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch (_) { return null; }
}

function installNavigationPolicy(webContents, appRoot, openExternal) {
  const open = value => {
    const url = safeExternalUrl(value);
    if (!url) return;
    try { openExternal(url)?.catch?.(() => {}); } catch (_) { /* The OS may have no URL handler. */ }
  };
  webContents.setWindowOpenHandler(({ url }) => {
    open(url);
    return { action: 'deny' };
  });
  const navigate = (event, details) => {
    const url = typeof details === 'string' ? details : details?.url || event.url;
    if (isTrustedLocalUrl(url, appRoot)) return;
    event.preventDefault();
    open(url);
  };
  webContents.on('will-navigate', navigate);
  webContents.on('will-redirect', navigate);
  // Blob/data exports use the browser's download path. No will-download handler
  // is installed here, so the application's download attributes keep working.
}

module.exports = { appPages: Object.freeze([...APP_PAGES]), isTrustedLocalUrl, isTrustedSender, safeExternalUrl, installNavigationPolicy };
