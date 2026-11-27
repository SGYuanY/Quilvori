'use strict';
const assert = require('node:assert/strict');
const suite = require('./desktop-fixture.cjs');

suite('chat-passage', async ({open, file, click, wait, input, run}) => {
  const distance = 'A line from the log.\n'.repeat(60);
  const messages = ['<Iris> & Jane\n<b>Blue</b> [a+b]', distance + 'JANE\n' + distance + 'jane'];
  await open('chat');
  await file(messages.map(mes => ({name:'Reader', mes})), 'passage-test.json');
  await click('#import-chat');
  await wait(() => TAUI.state.lib.chats[0]?.name === 'passage-test' &&
    document.querySelector('#chat-log .body')?.innerText.includes('<Iris>'), 'imported chat');

  async function search(query, expected) {
    await input('#passage', query);
    const state = await run(() => ({
      messages: Array.from(document.querySelectorAll('#chat-log .body'), el => el.innerText),
      marks: Array.from(document.querySelectorAll('#chat-log mark'), el => el.textContent),
      parsedTag: !!document.querySelector('#chat-log .body :is(b, iris)'),
      count: parseInt(document.querySelector('#hit-count').textContent, 10),
    }));
    assert.deepEqual(state.marks, expected, 'literal matches for ' + query);
    assert.deepEqual(state.messages, messages, 'displayed text for ' + query);
    assert.equal(state.parsedTag, false, 'tag-like message text remains literal');
    assert.equal(state.count, query ? expected.length : messages.length);
  }

  await search('<Iris>', ['<Iris>']);
  await search('amp', []);
  await search('<b>', ['<b>']);
  await search('[a+b]', ['[a+b]']);
  await search('jane', ['Jane', 'JANE', 'jane']);
  const jumps = [];
  for (const button of ['#next-hit', '#next-hit', '#prev-hit']) {
    await click(button);
    jumps.push(await run(() => Array.from(document.querySelectorAll('#chat-log mark')).findIndex(mark => {
      const box = mark.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight;
    })));
  }
  assert.ok(jumps.every(index => index >= 0), 'each jump reveals its match in the viewport');
  assert.notEqual(jumps[0], jumps[1]);
  assert.equal(jumps[2], jumps[0]);

  await search('', []);
  await search('&', ['&']);
  const copied = await run(() => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('#chat-log .body'));
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    let captured;
    const original = TAUI.copyText;
    try {
      TAUI.copyText = text => { captured = text; };
      document.querySelector('#copy-sel').click();
      document.querySelector('#mark-sel').click();
    } finally {
      TAUI.copyText = original;
    }
    return captured;
  });
  assert.equal(copied, messages[0]);
  await run(() => TAUI.flush());
  await open('chat');
  const stored = await run(() => {
    const chat = TAUI.state.lib.chats.find(item => item.name === 'passage-test');
    return [chat.messages[0].mes, chat.bookmarks[0].index, chat.bookmarks[0].excerpt];
  });
  assert.deepEqual(stored, [messages[0], 0, messages[0]]);
  console.log('Chat passage search, literal markup, hit navigation, copy and persisted bookmarks passed.');
});
