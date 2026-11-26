import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const sandbox = await mkdtemp(path.join(os.tmpdir(),'quilvori-ui-'));
try {
  const env = {...process.env, QUILVORI_TEST_PROFILE:sandbox};
  delete env.ELECTRON_RUN_AS_NODE;
  const phases={
    'regex-and-credentials':'regex-preview-ui.cjs',
    storage:'storage-history-ui.cjs',
    exercise:'workbench-ui.cjs', restart:'workbench-ui.cjs', navigation:'ai-navigation-ui.cjs',
    compatibility:'creative-compat-ui.cjs', 'compatibility-restart':'creative-compat-ui.cjs',
    expressions:'expression-export-ui.cjs', themes:'theme-import-ui.cjs','theme-panel':'theme-st-panel-ui.cjs', 'theme-workshop':'theme-workshop-ui.cjs',
  };
  for (const [phase,test] of Object.entries(phases)) {
    const entry = fileURLToPath(new URL('../test/'+test,import.meta.url));
    const flags = ['--user-data-dir='+sandbox,'--disable-gpu',entry];
    const result = await new Promise((resolve,reject) => {
      const child = spawn(electron,flags,{env:{...env,QUILVORI_TEST_PHASE:phase},stdio:'inherit',windowsHide:true});
      child.on('error',reject); child.on('exit',code=>resolve(code ?? 1));
    });
    if (result) { process.exitCode=result; break; }
  }
} finally {
  const cleanup = path.resolve(sandbox);
  if (path.dirname(cleanup) !== path.resolve(os.tmpdir()) || !path.basename(cleanup).startsWith('quilvori-ui-')) throw new Error('Unexpected test profile path');
  await rm(cleanup,{recursive:true,force:true,maxRetries:8,retryDelay:200});
}
