import { spawn } from 'node:child_process';
import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const sandbox = await mkdtemp(path.join(os.tmpdir(),'quilvori-ui-'));
try {
  const env = {...process.env, QUILVORI_TEST_PROFILE:sandbox};
  delete env.ELECTRON_RUN_AS_NODE;
  const phases={
    'card-portrait-export':'card-portrait-export-ui.cjs',
    'card-sync':'card-sync-ui.cjs',
    'world-sync':'world-sync-ui.cjs',
    'local-consistency':'local-consistency-ui.cjs',
    'editor-guidance':'editor-guidance-ui.cjs',
    'authoring-destinations':'authoring-destinations-ui.cjs',
    'work-restore':'work-restore-ui.cjs',
    'work-restore-restart':'work-restore-ui.cjs',
    'selective-history':'selective-history-ui.cjs',
    'work-outcomes':'work-outcomes-ui.cjs',
    'work-outcomes-restart':'work-outcomes-ui.cjs',
    'chat-passage':'chat-passage-ui.cjs',
    'journal-links':'journal-links-ui.cjs',
    'journal-links-restart':'journal-links-ui.cjs',
    'model-recovery':'model-recovery-ui.cjs',
    'model-recovery-restart':'model-recovery-ui.cjs',
    'model-recovery-concurrency':'model-recovery-concurrency-ui.cjs',
    'studio-model-prepare':'studio-model-ready-ui.cjs',
    'studio-model-restart':'studio-model-ready-ui.cjs',
    'world-directory-scroll':'world-directory-scroll-ui.cjs',
    'card-world-editors':'card-world-editors-ui.cjs',
    'editor-selection':'editor-selection-ui.cjs', 'shelf-pins':'shelf-pins-ui.cjs',
    'sections-sync':'sections-sync-ui.cjs', 'graph-sync':'graph-sync-ui.cjs',
    'world-export':'world-export-ui.cjs', 'prompt-order':'prompt-order-ui.cjs', 'backup-controls':'backup-controls-ui.cjs',
    'working-backup':'working-backup-ui.cjs',
    'regex-and-credentials':'regex-preview-ui.cjs',
    storage:'storage-history-ui.cjs',
    exercise:'workbench-ui.cjs', restart:'workbench-ui.cjs', navigation:'ai-navigation-ui.cjs',
    compatibility:'creative-compat-ui.cjs', 'compatibility-restart':'creative-compat-ui.cjs',
    expressions:'expression-export-ui.cjs', themes:'theme-import-ui.cjs','theme-panel':'theme-st-panel-ui.cjs', 'theme-workshop':'theme-workshop-ui.cjs',
  };
  for (const [phase,test] of Object.entries(phases)) {
    const entry = fileURLToPath(new URL('../test/'+test,import.meta.url));
    const flags = ['--user-data-dir='+sandbox,'--disable-gpu',entry];
    // Native children can outlive a terminal pipe on Windows. Keep a real file
    // open until Electron exits, then report the output through the Node parent.
    const logPath = path.join(sandbox,phase+'.log'), log = await open(logPath,'w');
    let result;
    try {
      result = await new Promise((resolve,reject) => {
        const child = spawn(electron,flags,{env:{...env,QUILVORI_TEST_PHASE:phase},stdio:['ignore',log.fd,log.fd],windowsHide:true});
        child.on('error',reject); child.on('close',code=>resolve(code ?? 1));
      });
    } finally {
      await log.close();
      process.stdout.write(await readFile(logPath,'utf8'));
    }
    if (result) { process.exitCode=result; break; }
  }
} finally {
  const cleanup = path.resolve(sandbox);
  if (path.dirname(cleanup) !== path.resolve(os.tmpdir()) || !path.basename(cleanup).startsWith('quilvori-ui-')) throw new Error('Unexpected test profile path');
  await rm(cleanup,{recursive:true,force:true,maxRetries:8,retryDelay:200});
}
