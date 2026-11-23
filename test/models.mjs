import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const context = { console, JSON, Object, Array, String, Number, Error, RegExp, fetch: () => { throw new Error('no network'); } };
context.globalThis = context;
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../js/model.js'), 'utf8'), context, { filename: 'model.js' });
const names = context.NIJANModel.modelsFromPayload({ data: [{ id: 'alpha' }, { id: 'beta' }] });
const alt = context.NIJANModel.modelsFromPayload({ models: [{ name: 'local' }] });
if (names.join(',') !== 'alpha,beta' || alt.join(',') !== 'local') {
  console.error('FAILED', names, alt);
  process.exit(1);
}
console.log('models payload ok');
