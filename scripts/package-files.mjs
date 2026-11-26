import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import navigation from '../electron/navigation.js';

export async function publicFiles(project, { desktop }) {
  const legal = ['LICENSE','LICENSING.md','NOTICE','CONTRIBUTING.md'];
  const tracked = execFileSync('git',['ls-files','--cached','-z'],{cwd:project,encoding:'utf8'});
  const result = new Map();
  for (const name of tracked.split('\0').filter(Boolean).sort()) {
    const source = path.join(project,name);
    const appPage = /^[^/]+\.html$/.test(name) && navigation.isTrustedLocalUrl(pathToFileURL(source).href,project);
    if (!(appPage || legal.includes(name) || /^js\/[\w/-]+\.js$/.test(name) || /^css\/[\w/-]+\.css$/.test(name)
        || (desktop && /^electron\/[\w/-]+\.js$/.test(name)) || /^(?:img|fonts)\/[\w/.-]+\.(?:png|ico|svg|webp|woff2|txt|md)$/.test(name))) continue;
    if (!(await lstat(source)).isFile() || (await realpath(source)) !== source) {
      throw new Error('Packaging inputs must be ordinary project files: '+name);
    }
    result.set(name,await readFile(source));
  }
  const required = ['index.html',...legal,'img/resources/ATTRIBUTION.md'];
  if (desktop) required.push('electron/main.js','electron/preload.js');
  for (const name of required) if (!result.has(name)) throw new Error('Missing packaging input: '+name);
  for (const [page,bytes] of result) {
    if (!page.endsWith('.html')) continue;
    for (const match of bytes.toString('utf8').matchAll(/(?:src|href)="((?:js|css|fonts|img)\/[^"?#]+)[^"]*"/g)) {
      if (!result.has(match[1])) throw new Error(page+' references a missing packaging input: '+match[1]);
    }
  }
  return result;
}

export async function writeChecksum(artifact) {
  const hash=createHash('sha256');
  for await (const part of createReadStream(artifact)) hash.update(part);
  await writeFile(artifact+'.sha256',hash.digest('hex')+'  '+path.basename(artifact)+'\n');
}
