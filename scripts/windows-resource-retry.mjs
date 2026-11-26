import { createRequire } from 'node:module';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const temporaryOpenErrors = new Set(['EACCES','EBUSY','EPERM','UNKNOWN']);

// The pinned electron-builder rewrites one PE resource just after copying Electron.
// A Windows file scanner can still hold that executable when the writer opens it.
export async function withWindowsResourceRetry(executable, build,
  writer = require('app-builder-lib/out/electron/electronWin'), wait = pause) {
  const original = writer.addWinAsarIntegrity;
  writer.addWinAsarIntegrity = async function (file,...args) {
    if (path.relative(executable,file) !== '') return original.call(this,file,...args);
    const delays = [300,600,1200];
    for (let attempt = 0; ; attempt++) {
      try { return await original.call(this,file,...args); }
      catch (error) {
        // An open that failed has not written any bytes. Never retry a partial write.
        if (attempt >= delays.length || !temporaryOpenErrors.has(error.code) || error.syscall !== 'open' ||
            typeof error.path !== 'string' || path.relative(executable,error.path) !== '') throw error;
        await wait(delays[attempt]);
      }
    }
  };
  try { return await build(); }
  finally { writer.addWinAsarIntegrity = original; }
}
