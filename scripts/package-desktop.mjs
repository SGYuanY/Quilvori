import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, open, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import builder from 'electron-builder';
import { resolveElectron } from './start.mjs';

const { build, Platform } = builder;
const project = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const metadata = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
const output = path.join(project, 'dist');
const platform = process.platform;
const arch = process.arch;
const runtimeDist = path.join(project, 'node_modules', 'electron', 'dist');

if (!(platform === 'darwin' && ['arm64', 'x64'].includes(arch)) && !(platform === 'win32' && arch === 'x64')) {
  throw new Error('Build the Windows x64 edition on Windows x64, or the macOS edition on the matching Apple Silicon or Intel Mac.');
}
const runtimeExecutable = resolveElectron(project);
if (platform === 'darwin') {
  const slices = execFileSync('/usr/bin/lipo',['-archs',runtimeExecutable],{encoding:'utf8'}).trim().split(/\s+/);
  if (!slices.includes(arch === 'x64' ? 'x86_64' : 'arm64')) throw new Error('The installed Electron binary must match the requested Mac architecture.');
} else {
  const handle = await open(runtimeExecutable, 'r');
  try {
    const dos = Buffer.alloc(64), pe = Buffer.alloc(6);
    await handle.read(dos,0,dos.length,0);
    await handle.read(pe,0,pe.length,dos.readUInt32LE(0x3c));
    if (pe.readUInt32LE() !== 0x4550 || pe.readUInt16LE(4) !== 0x8664) throw new Error('Install the x64 Windows Electron runtime before packaging.');
  } finally { await handle.close(); }
}

const legal = ['LICENSE', 'LICENSING.md', 'NOTICE', 'CONTRIBUTING.md'];
function runtimeFile(name) {
  return legal.includes(name) || /^[^/]+\.html$/.test(name) ||
    /^(?:js|electron)\/[\w/-]+\.js$/.test(name) || /^css\/[\w/-]+\.css$/.test(name) ||
    /^(?:img|fonts)\/[\w/.-]+\.(?:png|ico|svg|webp|woff2|txt|md)$/.test(name);
}

// Packaging runs from a fresh directory without user settings, development tools or local libraries.
const tracked = execFileSync('git', ['ls-files', '--cached', '-z'], { cwd: project, encoding: 'utf8' });
const sources = tracked.split('\0').filter(runtimeFile);
for (const required of ['index.html', 'electron/main.js', 'electron/preload.js', ...legal, 'img/resources/ATTRIBUTION.md']) {
  if (!sources.includes(required)) throw new Error('Missing version-controlled packaging input: '+required);
}
const scratch = await mkdtemp(path.join(os.tmpdir(), 'quilvori-package-'));
const staging = path.join(scratch, 'app');
const mac = platform === 'darwin';
const stageFile = name => path.join(staging, name);
try {
  await mkdir(staging);
  for (const name of sources) {
    const source = path.join(project, name);
    if (!(await lstat(source)).isFile() || (await realpath(source)) !== source) {
      throw new Error('Packaging inputs must be ordinary project files: '+name);
    }
    await mkdir(path.dirname(stageFile(name)), { recursive: true });
    await copyFile(source, stageFile(name));
  }
  // A new script wired into an HTML page must be explicitly included in Git before a build.
  const included = new Set(sources);
  for (const page of sources.filter(name => name.endsWith('.html'))) {
    const html = await readFile(stageFile(page), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="((?:js|css|fonts|img)\/[^"?#]+)[^"]*"/g)) {
      if (!included.has(match[1])) throw new Error(page+' references a missing packaging input: '+match[1]);
    }
  }
  const { name, productName, version, description, main, license, repository, homepage } = metadata;
  const manifest = { name, productName, version, description, main, license, repository, homepage, author: 'Quilvori contributors' };
  await writeFile(stageFile('package.json'), JSON.stringify(manifest, null, 2)+'\n');

  const artifact = productName+'-'+version+'-'+(mac ? 'macOS-'+arch+'.dmg' : 'Windows-x64.exe');
  await build({
    projectDir: staging, publish: 'never',
    targets: (mac ? Platform.MAC : Platform.WINDOWS).createTarget(mac ? 'dmg' : 'portable', builder.Arch[arch]),
    config: {
      appId: 'io.github.shangguanqian.quilvori', productName, artifactName: artifact,
      electronVersion: metadata.devDependencies.electron,
      electronDist: runtimeDist,
      directories: { output, buildResources: path.join(scratch, 'build-resources') },
      asar: true, npmRebuild: false, publish: null,
      electronFuses: {
        runAsNode: false, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false,
        enableEmbeddedAsarIntegrityValidation: true, onlyLoadAppFromAsar: true,
      },
      win: { icon: stageFile('img/quilvori.ico') },
      portable: { requestExecutionLevel: 'user', unpackDirName: false },
      mac: {
        icon: stageFile('img/quilvori.png'), category: 'public.app-category.productivity',
        identity: process.env.CSC_LINK || process.env.CSC_NAME ? undefined : '-',
        minimumSystemVersion: '13.0',
      },
      dmg: { writeUpdateInfo: false },
      afterPack: async ({appOutDir}) => {
        const resources = mac ? path.join(appOutDir, productName+'.app', 'Contents', 'Resources') : path.join(appOutDir,'resources');
        await rm(path.join(resources,'default_app.asar'),{force:true});
        // Copying an unpacked .app omits the licenses shipped alongside it in Electron's ZIP.
        if (mac) {
          await copyFile(path.join(runtimeDist,'LICENSE'),path.join(resources,'LICENSE.electron.txt'));
          await copyFile(path.join(runtimeDist,'LICENSES.chromium.html'),path.join(resources,'LICENSES.chromium.html'));
        }
      },
    },
  });

  const hash = createHash('sha256');
  for await (const part of createReadStream(path.join(output, artifact))) hash.update(part);
  await writeFile(path.join(output, artifact+'.sha256'), hash.digest('hex')+'  '+artifact+'\n');
  console.log('Built '+path.join(output, artifact)+' from '+sources.length+' project files.');
} finally {
  if (path.dirname(scratch) !== os.tmpdir() || !path.basename(scratch).startsWith('quilvori-package-')) {
    throw new Error('Unexpected packaging directory');
  }
  await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
