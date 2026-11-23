import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const context = { console, JSON, Object, Array, String, Number, Error, RegExp };
context.globalThis = context;
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../js/studio.js'), 'utf8'), context, { filename: 'studio.js' });
const title = context.NIJANStudio.entryTitle;
const named = title({ 条目名: '听雨楼', 触发关键词: ['雨', '楼'], 正文: '楼还在。' });
const fromBody = title({ 触发关键词: ['眼睛'], 正文: '眼睛是很淡的茶色，看人时像在听。' });
const blank = title({ 触发关键词: ['雨'], 正文: '' });
if (named !== '听雨楼') {
  console.error('named', named);
  process.exit(1);
}
if (!fromBody.startsWith('眼睛是很淡的茶色') || fromBody === '未命名' || fromBody === '眼睛') {
  console.error('body', fromBody);
  process.exit(1);
}
if (blank !== '') {
  console.error('blank', blank);
  process.exit(1);
}
console.log('entry titles ok');
