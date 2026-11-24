import assert from 'node:assert/strict';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { appRoot, resolveElectron, start } from '../scripts/start.mjs';

const root = path.resolve('launcher fixtures', 'Quilvori 叙翎集 app');
const executable = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
function installationFile(file) {
  if (file === path.join(root, 'node_modules', 'electron', 'package.json')) return JSON.stringify({ name: 'electron', version: '33.4.11' });
  if (file === path.join(root, 'package-lock.json')) return JSON.stringify({ packages: { 'node_modules/electron': { version: '33.4.11' } } });
  assert.equal(file, path.join(root, 'node_modules', 'electron', 'path.txt'));
  return 'electron.exe\n';
}
function harness(overrides = {}) {
  const child = new EventEmitter(), signals = new EventEmitter(), calls = [], errors = [];
  child.kill = signal => { calls.push({ kill: signal }); queueMicrotask(() => child.emit('exit', null, signal)); return true; };
  child.unref = () => calls.push({ unref: true });
  const options = {
    root, nodeVersion: '22.12.0', signals, stderr: { write: message => errors.push(message) },
    env: { PATH: 'unchanged', ELECTRON_RUN_AS_NODE: '1' },
    files: {
      readFileSync: installationFile,
      statSync(file) { assert.equal(file, executable); return { isFile: () => true }; },
    },
    spawn(command, args, config) { calls.push({ command, args, config }); return child; },
    ...overrides,
  };
  return { options, child, calls, errors, signals };
}
let count = 0;
async function test(name, run) { await run(); count++; console.log('ok', name); }

await test('the default app root comes from the launcher location, not the working directory', () => {
  assert.equal(path.resolve(appRoot), fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, ''));
});
await test('unsupported or malformed Node versions fail before any spawn with an actionable message', async () => {
  for (const nodeVersion of ['20.19.0', '18.20.0', 'unknown']) {
    const h = harness({ nodeVersion });
    assert.equal(await start(h.options), 1);
    assert.equal(h.calls.length, 0);
    assert.match(h.errors.join(''), /Node\.js 22 or newer is required/);
  }
});
await test('missing or incomplete local dependencies require npm ci and never fall back to a global Electron', async () => {
  for (const files of [
    { readFileSync() { throw new Error('missing'); } },
    { readFileSync: installationFile, statSync() { throw new Error('missing executable'); } },
  ]) {
    const h = harness({ files });
    assert.equal(await start(h.options), 1);
    assert.equal(h.calls.length, 0);
    assert.match(h.errors.join(''), /npm ci/);
    assert.ok(h.errors.join('').includes(root));
  }
});
await test('the local package must be Electron at the version recorded in this project lockfile', async () => {
  for (const metadata of [{ name: 'other', version: '33.4.11' }, { name: 'electron', version: '32.0.0' }]) {
    const h = harness();
    h.options.files.readFileSync = file => file === path.join(root, 'node_modules', 'electron', 'package.json') ? JSON.stringify(metadata) : installationFile(file);
    assert.equal(await start(h.options), 1);
    assert.equal(h.calls.length, 0);
    assert.match(h.errors.join(''), /npm ci/);
  }
});
await test('Electron executable metadata must remain inside the local package distribution', () => {
  for (const entry of ['', '..', '../global-electron', path.resolve('global-electron')]) {
    const files = { readFileSync: file => file.endsWith('path.txt') ? entry : installationFile(file), statSync: () => ({ isFile: () => true }) };
    assert.throws(() => resolveElectron(root, files), /local Electron installation/);
  }
});
await test('attached launch preserves argument boundaries and paths with spaces without a shell or environment mutation', async () => {
  const args = ['--user-data-dir', path.resolve('isolated profiles', '中文 QA session'), '--disable-gpu'];
  const h = harness({ args }), result = start(h.options);
  const call = h.calls[0];
  assert.equal(call.command, executable);
  assert.deepEqual(call.args, [root, ...args]);
  assert.equal(call.config.cwd, root);
  assert.equal(call.config.shell, false);
  assert.equal(call.config.detached, false);
  assert.equal(call.config.stdio, 'inherit');
  assert.equal(call.config.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(h.options.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(call.config.env.PATH, h.options.env.PATH);
  h.child.emit('spawn');
  h.child.emit('exit', 7, null);
  assert.equal(await result, 7);
  assert.equal(h.signals.listenerCount('SIGINT'), 0);
  assert.equal(h.signals.listenerCount('SIGTERM'), 0);
});
await test('detached launch succeeds only after the spawn event and disconnects the launcher', async () => {
  const h = harness({ args: ['--detached', '--', '--user-data-dir=QA profile'] });
  let completed = false;
  const result = start(h.options).then(code => { completed = true; return code; });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.deepEqual(h.calls[0].args, [root, '--user-data-dir=QA profile']);
  assert.equal(h.calls[0].config.detached, true);
  assert.equal(h.calls[0].config.stdio, 'ignore');
  h.child.emit('spawn');
  assert.equal(await result, 0);
  assert.deepEqual(h.calls[1], { unref: true });
  assert.equal(h.signals.listenerCount('SIGINT'), 0);
});
await test('synchronous and asynchronous launch failures return a nonzero status and readable error', async () => {
  const thrown = harness({ spawn() { throw new Error('access denied'); } });
  assert.equal(await start(thrown.options), 1);
  assert.match(thrown.errors.join(''), /Could not start Electron: access denied/);
  for (const args of [[], ['--detached']]) {
    const h = harness({ args }), result = start(h.options);
    h.child.emit('error', new Error('not executable'));
    assert.equal(await result, 1);
    assert.match(h.errors.join(''), /Could not start Electron: not executable/);
    assert.equal(h.signals.listenerCount('SIGINT'), 0);
    assert.equal(h.calls.filter(call => call.unref).length, 0);
  }
});
await test('Ctrl+C and termination reach the child and clean up launcher signal handlers', async () => {
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const h = harness(), result = start(h.options);
    h.child.emit('spawn');
    h.signals.emit(signal);
    assert.equal(await result, code);
    assert.deepEqual(h.calls[1], { kill: signal });
    assert.equal(h.signals.listenerCount('SIGINT'), 0);
    assert.equal(h.signals.listenerCount('SIGTERM'), 0);
  }
});
await test('a child terminated by an external signal reports the corresponding exit status', async () => {
  const h = harness(), result = start(h.options);
  h.child.emit('exit', null, 'SIGKILL');
  assert.equal(await result, 137);
});
console.log(`${count} startup checks passed`);
