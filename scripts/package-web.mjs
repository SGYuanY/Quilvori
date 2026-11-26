import assert from 'node:assert/strict';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync } from 'fflate';
import { publicFiles, writeChecksum } from './package-files.mjs';

const project=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const {productName,version}=JSON.parse(await readFile(path.join(project,'package.json'),'utf8'));
const name=productName+'-'+version+'-web';
const sources=await publicFiles(project,{desktop:false});
const guide=[
  productName+' '+version+' for the browser','',
  'Extract the ZIP and open a terminal in the folder containing index.html.',
  'Serve the folder using Python 3.','',
  'macOS or Linux','  python3 -m http.server 8765 --bind 127.0.0.1','',
  'Windows','  py -m http.server 8765 --bind 127.0.0.1','',
  'Open http://127.0.0.1:8765/ in a modern browser and keep the server running.',
  'Use the same browser, address and port to return to this library. Use Backup',
  'to save a copy before clearing browser data or moving to another device.','',
  'Corresponding source','https://github.com/ShangguanQian/Quilvori/archive/refs/tags/v'+version+'.zip',
  'Project license and asset credits are in LICENSE, NOTICE and LICENSING.md.','',
].join('\n');
sources.set('START-HERE.txt',Buffer.from(guide,'utf8'));
const files=Object.fromEntries([...sources].map(([file,bytes])=>[name+'/'+file,bytes]));
const out=path.join(project,'dist');
await mkdir(out,{recursive:true});
const artifact=path.join(out,name+'.zip');
await writeFile(artifact,zipSync(files,{level:6,mtime:new Date(1980,0,1)}));
const check=unzipSync(new Uint8Array(await readFile(artifact)));
assert.deepEqual(Object.keys(check).sort(),Object.keys(files).sort());
for(const [file,bytes] of Object.entries(files))assert.ok(bytes.equals(check[file]),'ZIP entry differs: '+file);
await writeChecksum(artifact);
console.log('Verified '+sources.size+' web files in '+artifact);
