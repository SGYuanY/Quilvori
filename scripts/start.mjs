import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn as spawnProcess } from 'node:child_process';

export const appRoot = fileURLToPath(new URL('../', import.meta.url));

export function resolveElectron(root, files = fs) {
  const installation = path.join(root, 'node_modules', 'electron');
  const dist = path.join(installation, 'dist');
  try {
    const installed = JSON.parse(files.readFileSync(path.join(installation, 'package.json'), 'utf8'));
    const locked = JSON.parse(files.readFileSync(path.join(root, 'package-lock.json'), 'utf8')).packages?.['node_modules/electron']?.version;
    if (installed.name !== 'electron' || typeof locked !== 'string' || installed.version !== locked) throw new Error('Electron does not match the lockfile');
    const entry = files.readFileSync(path.join(installation, 'path.txt'), 'utf8').trim();
    const executable = path.resolve(dist, entry);
    const relative = path.relative(dist, executable);
    if (!entry || path.isAbsolute(entry) || !relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Invalid Electron executable path');
    if (!files.statSync(executable).isFile()) throw new Error('Electron executable is missing');
    return executable;
  } catch {
    throw new Error(`The local Electron installation is missing, incomplete, or out of date.\nRun "npm ci" in:\n  ${root}\nThen run "npm start" again.`);
  }
}

const signalCode = signal => ({ SIGINT: 130, SIGTERM: 143, SIGKILL: 137 }[signal] || 1);

export async function start({
  args = process.argv.slice(2), root = appRoot, nodeVersion = process.versions.node,
  env = process.env, files = fs, spawn = spawnProcess, signals = process,
  stderr = process.stderr,
} = {}) {
  const fail = message => { stderr.write(`Quilvori: ${message}\n`); return 1; };
  const version = /^(\d+)\.(\d+)\./.exec(String(nodeVersion));
  if (!version || Number(version[1]) < 22 || (Number(version[1]) === 22 && Number(version[2]) < 12)) {
    return fail(`Node.js 22.12 or newer is required (found ${nodeVersion}). Install a current Node.js LTS release and try again.`);
  }
  let executable;
  try { executable = resolveElectron(root, files); }
  catch (error) { return fail(error.message); }
  const forwarded = [...args];
  const detached = forwarded[0] === '--detached';
  if (detached) forwarded.shift();
  if (forwarded[0] === '--') forwarded.shift();
  const childEnv = { ...env };
  // An inherited Electron developer setting must not turn the desktop app into Node.
  delete childEnv.ELECTRON_RUN_AS_NODE;
  let child;
  try {
    child = spawn(executable, [root, ...forwarded], {
      cwd: root, shell: false, detached, stdio: detached ? 'ignore' : 'inherit', env: childEnv,
    });
  } catch (error) { return fail(`Could not start Electron: ${error.message}`); }

  return new Promise(resolve => {
    let finished = false, interrupted = '';
    const finish = code => {
      if (finished) return;
      finished = true;
      signals.removeListener('SIGINT', onInterrupt);
      signals.removeListener('SIGTERM', onTerminate);
      resolve(code);
    };
    const stop = signal => {
      interrupted ||= signal;
      try { child.kill(signal); }
      catch (error) { finish(fail(`Could not stop Electron: ${error.message}`)); }
    };
    const onInterrupt = () => stop('SIGINT');
    const onTerminate = () => stop('SIGTERM');
    child.once('error', error => finish(fail(`Could not start Electron: ${error.message}`)));
    child.once('exit', (code, signal) => finish(interrupted ? signalCode(interrupted) : Number.isInteger(code) ? code : signalCode(signal)));
    if (detached) {
      child.once('spawn', () => { child.unref(); finish(0); });
    } else {
      signals.on('SIGINT', onInterrupt);
      signals.on('SIGTERM', onTerminate);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await start();
}
