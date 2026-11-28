import {readFileSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import navigation from '../electron/navigation.js';

const startMarker = '<!-- Shared scripts (source: index.html) -->';
const endMarker = '<!-- End shared scripts -->';
const scriptTag = /^<script\s+src\s*=\s*(["'])(js\/(?:[\w-]+\/)*[\w-]+\.js)\1\s*>\s*<\/script>$/;

function readEntry(root, name) {
  const file = path.join(root, name);
  const html = readFileSync(file, 'utf8');
  const start = html.indexOf(startMarker), end = html.indexOf(endMarker);
  if (start < 0 || end < start || start !== html.lastIndexOf(startMarker) || end !== html.lastIndexOf(endMarker)) {
    throw new Error(name+' must contain exactly one pair of shared script markers.');
  }
  const before = html.slice(0, start + startMarker.length), after = html.slice(end);
  const block = html.slice(before.length, end);
  const scripts = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const tag = scriptTag.exec(line);
    if (!tag) throw new Error(name+' has unexpected content inside its shared scripts block: '+line);
    return tag[2];
  });
  return {name, file, before, block, after, scripts};
}

export function syncEntryScripts(root, {check = false} = {}) {
  const entries = navigation.appPages.map(name => readEntry(root, name));
  const canonical = entries.find(entry => entry.name === 'index.html');
  if (!canonical.scripts.length) throw new Error('index.html has an empty shared scripts block.');
  const checked = new Set();
  function verifyFile(script, page) {
    if (checked.has(script)) return;
    if (!statSync(path.join(root, script), {throwIfNoEntry:false})?.isFile()) {
      throw new Error(page+' references a missing script: '+script);
    }
    checked.add(script);
  }
  const shared = new Set();
  for (const script of canonical.scripts) {
    if (shared.has(script)) throw new Error('Duplicate shared script in index.html: '+script);
    verifyFile(script, canonical.name);
    shared.add(script);
  }

  const expected = canonical.block.replace(/\r\n/g, '\n'), changed = [];
  for (const entry of entries) {
    const outside = (entry.before + entry.after).replace(/<!--[\s\S]*?-->/g, '');
    for (const tag of outside.matchAll(/<script\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      const src = tag[1] ?? tag[2] ?? tag[3];
      const script = path.posix.normalize(src.split(/[?#]/, 1)[0]);
      if (!/^js\/[\w/-]+\.js$/.test(script)) throw new Error(entry.name+' has a script outside the packaged js/ directory.');
      if (shared.has(script)) throw new Error(entry.name+' also loads a shared script outside its block: '+script);
      verifyFile(script, entry.name);
    }
    if (entry.block.replace(/\r\n/g, '\n') !== expected) changed.push(entry);
  }
  if (check && changed.length) {
    throw new Error('Shared scripts are stale in '+changed.map(entry => entry.name).join(', ')+'. Run npm run build:formats.');
  }
  for (const entry of changed) {
    const eol = (entry.block.match(/\r?\n/) || entry.before.match(/\r?\n/))?.[0] ?? '\n';
    writeFileSync(entry.file, entry.before + expected.replace(/\n/g, eol) + entry.after);
  }
}
