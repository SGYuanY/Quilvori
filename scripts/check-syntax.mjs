import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
function scripts(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? scripts(filename) : /\.(?:c?js|mjs)$/.test(entry.name) ? [filename] : [];
  });
}
const files = ['js', 'electron', 'test', 'scripts'].flatMap(directory => scripts(path.join(root, directory))).sort();
let failed = false;
for (const filename of files) {
  const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    failed = true;
    console.error(path.relative(root, filename));
    console.error(result.error?.message || result.stderr || result.stdout);
  }
}
if (failed) process.exitCode = 1;
else console.log(`Syntax checked ${files.length} JavaScript files.`);
