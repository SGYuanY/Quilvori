// Electron 45 downloads its binary on demand. Install it during npm ci so that
// an offline desktop launch can still use the project-pinned executable.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const installer = fileURLToPath(new URL('../node_modules/electron/install.js', import.meta.url));
if (existsSync(installer) && !process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
  const result = spawnSync(process.execPath, [installer], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
