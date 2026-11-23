import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../js');
const context = { console, JSON, Object, Array, String, Number, Error, RegExp, Map, Set };
context.globalThis = context;
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dir, 'formats.js'), 'utf8'), context, { filename: 'formats.js' });
const F = context.TAFormats;
const failures = [];
const check = (name, ok, detail) => {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  else console.log('ok', name);
};

const st = F.worldInfoToEntries({
  entries: { 0: { comment: '听雨楼', key: ['雨', '楼'], content: '楼还在。', constant: true, position: 0 } },
});
check('sillytavern name', st[0].comment === '听雨楼', st[0].comment);
check('sillytavern keys', st[0].keys.join(',') === '雨,楼', st[0].keys.join(','));
check('sillytavern body', st[0].content === '楼还在。' && !st[0].content.includes('条目名'));

const user = F.worldInfoToEntries([
  { 条目名: '酒与茶', 触发关键词: ['酒', '茶'], 正文: '夜里不劝酒。' },
]);
check('user name', user[0].comment === '酒与茶');
check('user keys', user[0].keys.join(',') === '酒,茶');
check('user body', user[0].content === '夜里不劝酒。');

const blob = F.worldInfoToEntries({
  entries: [{
    comment: '',
    key: [],
    content: JSON.stringify({ 条目名: '江雾城', 触发关键词: ['江雾城', '西市'], 正文: '雨多过晴。' }),
  }],
});
check('blob name', blob[0].comment === '江雾城', blob[0].comment);
check('blob keys', blob[0].keys.join(',') === '江雾城,西市', blob[0].keys.join(','));
check('blob body', blob[0].content === '雨多过晴。' && !blob[0].content.includes('未命名') && !blob[0].content.includes('条目名'));

const bodyKey = F.worldInfoToEntries({ 条目名: '白衡', 触发关键词: ['白衡'], body: '剑寄在一楼。' });
check('body key', bodyKey[0].comment === '白衡' && bodyKey[0].content === '剑寄在一楼。' && bodyKey[0].keys[0] === '白衡');

if (failures.length) {
  console.error('FAILED\n' + failures.join('\n'));
  process.exit(1);
}
console.log('world import ok');
