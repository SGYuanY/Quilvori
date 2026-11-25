import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import http from "node:http";
import { once } from "node:events";

const storage = new Map([
  [
    "nijan-model",
    JSON.stringify({
      baseUrl: "https://example.invalid/v1",
      model: "test-model",
      key: "test-secret",
      protocol: "auto",
    }),
  ],
]);
const ctx = vm.createContext({
  console,
  JSON,
  RegExp,
  Error,
  AbortController,
  DOMException,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  Uint32Array,
  DataView,
  crypto: webcrypto,
  structuredClone,
  Date,
  Math,
  Map,
  Set,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, val) => storage.set(key, val),
  },
});
ctx.globalThis = ctx;
for (const file of ["formats", "store", "creative-dialogue", "ai-tasks", "creation-output", "model"])
  vm.runInContext(
    fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), "utf8"),
    ctx,
    { filename: file },
  );
const model = ctx.NIJANModel;
const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
function stream(events, chunkSize = 5) {
  const bytes = new TextEncoder().encode(
    events
      .map(
        (event) =>
          `data: ${typeof event === "string" ? event : JSON.stringify(event)}\r\n\r\n`,
      )
      .join(""),
  );
  let offset = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
        offset += chunkSize;
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log("ok", name);
}
await test("Responses SSE decodes split Unicode and keeps reasoning with its own task", async () => {
  ctx.fetch = async (url, options) => {
    assert.equal(url, "https://example.invalid/v1/responses");
    const request = JSON.parse(options.body);
    assert.equal(request.store, false);
    assert.equal(request.stream, true);
    assert.ok(!Object.hasOwn(request, "temperature"));
    return stream([
      {
        type: "response.reasoning_summary_text.delta",
        delta: "正在核对必要信息。",
      },
      {
        type: "response.output_text.delta",
        delta: '{"questions":["希望是什么世界？"]}',
      },
      {
        type: "response.completed",
        response: { status: "completed", output: [] },
      },
    ]);
  };
  const result = await model.runTask(
    "questions",
    { brief: "新角色" },
    { label: "追问" },
  );
  assert.equal(result.questions[0], "希望是什么世界？");
  assert.equal(model.history().at(-1).status, "validated");
  assert.equal(model.history().at(-1).reasoning, "正在核对必要信息。");
});
await test("automatic selection falls back only for an unsupported endpoint", async () => {
  const calls = [];
  ctx.fetch = async (url) => {
    calls.push(url);
    return url.endsWith("/responses")
      ? json({ error: { message: "Not found" } }, 404)
      : stream([
          { choices: [{ delta: { reasoning_content: "分类任务独立记录。" } }] },
          {
            choices: [
              { delta: { content: '{"ideas":["雨城","海港","山间"]}' } },
            ],
          },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
          "[DONE]",
        ]);
  };
  const result = await model.runTask("ideas", { brief: "背景" });
  assert.equal(result.ideas.length, 3);
  assert.equal(calls.length, 2);
  assert.equal(model.history().at(-1).protocol, "chat");
  assert.equal(model.history().at(-2).reasoning, "正在核对必要信息。");
});
await test("authentication failures do not retry another protocol or expose the key", async () => {
  let calls = 0;
  ctx.fetch = async () => {
    calls++;
    return json({ error: { message: "Denied: test-secret" } }, 401);
  };
  await assert.rejects(() => model.runTask("questions", { brief: "x" }), /401/);
  assert.equal(calls, 1);
  assert.ok(!model.history().at(-1).error.includes("test-secret"));
});
await test("manual Chat Completions selection and JSON responses work", async () => {
  model.save({
    protocol: "chat",
    baseUrl: "https://example.invalid/v1/chat/completions",
  });
  ctx.fetch = async (url) => {
    assert.equal(url, "https://example.invalid/v1/chat/completions");
    return json({
      choices: [{ message: { content: '```json\n{"questions":[]}\n```' } }],
    });
  };
  assert.equal(
    (await model.runTask("questions", { brief: "x" })).questions.length,
    0,
  );
});
await test('read-only brainstorms accept completed plain questions or numbered choices',async()=>{
  ctx.fetch=async()=>json({choices:[{message:{content:'Which shelf?'},finish_reason:'stop'}]});
  assert.equal((await model.runTask('questions',{brief:'A library'})).questions[0],'Which shelf?');
  ctx.fetch=async()=>json({choices:[{message:{content:'1. An atlas\n2. A map'},finish_reason:'stop'}]});
  assert.equal((await model.runTask('ideas',{brief:'A library'})).ideas.join('|'),'An atlas|A map');
  await assert.rejects(()=>model.runTask('create:character',{brief:'A library'}));
});
await test("a clarification is a needs-input task, never a validated edit", async () => {
  ctx.fetch = async () =>
    json({
      choices: [
        {
          message: {
            content: '{"status":"needs_input","question":"请指出要改的条目"}',
          },
        },
      ],
    });
  await assert.rejects(
    () => model.runTask("questions", { brief: "x" }),
    (error) => error.code === "needs-input",
  );
  assert.equal(model.history().at(-1).status, "needs_input");
});
await test("empty or invalid reports cannot be interpreted as a successful check", async () => {
  ctx.fetch = async () => json({ choices: [{ message: { content: "{}" } }] });
  await assert.rejects(() =>
    model.runTask("review", { card: { name: "test" } }),
  );
  assert.equal(model.history().at(-1).status, "error");
});
await test("stream truncation is an error even if a partial JSON object can be parsed", async () => {
  ctx.fetch = async () =>
    stream([
      {
        choices: [
          { delta: { content: '{"questions":[]}' }, finish_reason: "length" },
        ],
      },
      "[DONE]",
    ]);
  await assert.rejects(
    () => model.runTask("questions", { brief: "x" }),
    /截断/,
  );
});
await test("a disconnected stream cannot be marked complete", async () => {
  ctx.fetch = async () =>
    stream([{ choices: [{ delta: { content: '{"questions":[]}' } }] }]);
  await assert.rejects(
    () => model.runTask("questions", { brief: "x" }),
    /中断/,
  );
});
await test("cancellation and timeouts leave separate, accurate task statuses", async () => {
  ctx.fetch = async (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      if (signal.aborted) reject(new DOMException("aborted", "AbortError"));
      else
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
    });
  const controller = new AbortController();
  const pending = model.runTask(
    "questions",
    { brief: "x" },
    { signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(() => pending, /已停止/);
  assert.equal(model.history().at(-1).status, "cancelled");
  await assert.rejects(
    () => model.runTask("questions", { brief: "x" }, { timeoutMs: 5 }),
    /超时/,
  );
  assert.equal(model.history().at(-1).status, "error");
});
await test("oversized context is rejected before sending", async () => {
  ctx.fetch = async () => {
    throw new Error("must not send");
  };
  await assert.rejects(
    () => model.runTask("questions", { brief: "x".repeat(350001) }),
    /分批/,
  );
});
await test("nonstream Chat truncation cannot be accepted as a successful result", async () => {
  model.save({ protocol: "chat" });
  ctx.fetch = async () =>
    json({
      choices: [
        { message: { content: '{"questions":[]}' }, finish_reason: "length" },
      ],
    });
  await assert.rejects(
    () => model.runTask("questions", { brief: "x" }),
    /截断/,
  );
  assert.equal(model.history().at(-1).status, "error");
});
await test("Responses needs an actual completed state, even if a relay sends DONE", async () => {
  model.save({ protocol: "responses" });
  ctx.fetch = async () =>
    stream([
      { type: "response.output_text.delta", delta: '{"questions":[]}' },
      "[DONE]",
    ]);
  await assert.rejects(
    () => model.runTask("questions", { brief: "x" }),
    /中断/,
  );
  ctx.fetch = async () =>
    stream([
      { type: "response.output_text.delta", delta: '{"questions":[]}' },
      {
        type: "response.completed",
        response: { status: "incomplete", output: [] },
      },
    ]);
  await assert.rejects(
    () => model.runTask("questions", { brief: "x" }),
    /未完成/,
  );
});
await test("Chat can retry a specifically unsupported temperature without changing the task", async () => {
  model.save({ protocol: "chat" });
  let calls = 0;
  ctx.fetch = async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    if (calls === 1) {
      assert.equal(body.temperature, 0.7);
      return json({ error: { message: "temperature is not supported" } }, 400);
    }
    assert.ok(!Object.hasOwn(body, "temperature"));
    return json({
      choices: [
        {
          message: { content: '{"character":{"name":"测试角色"}}' },
          finish_reason: "stop",
        },
      ],
    });
  };
  assert.equal(
    (await model.runTask("create:character", { brief: "x" })).character.name,
    "测试角色",
  );
  assert.equal(calls, 2);
  assert.equal(model.history().at(-1).status, "validated");
});
await test('reasoning preferences persist and invalid values return to model defaults', async () => {
  assert.equal(model.load().reasoningEffort, 'auto');
  model.save({ reasoningEffort: 'max' });
  assert.equal(model.load().reasoningEffort, 'max');
  assert.equal(JSON.parse(storage.get('nijan-model')).reasoningEffort, 'max');
  model.save({ reasoningEffort: 'unknown' });
  assert.equal(model.load().reasoningEffort, 'auto');
});
await test('default reasoning sends no extra parameter in either protocol', async () => {
  for (const protocol of ['responses', 'chat']) {
    model.save({ protocol, reasoningEffort: 'auto' });
    ctx.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.ok(!Object.hasOwn(body, 'reasoning'));
      assert.ok(!Object.hasOwn(body, 'reasoning_effort'));
      return protocol === 'responses'
        ? json({ status: 'completed', output_text: '{"questions":[]}', output: [] })
        : json({ choices: [{ message: { content: '{"questions":[]}' }, finish_reason: 'stop' }] });
    };
    await model.runTask('questions', { brief: 'x' });
  }
});
await test('explicit reasoning uses each protocol format, including off and highest effort', async () => {
  for (const [protocol, effort] of [['responses', 'max'], ['chat', 'xhigh'], ['responses', 'none'], ['chat', 'minimal']]) {
    model.save({ protocol, reasoningEffort: effort });
    ctx.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      if (protocol === 'responses') {
        assert.equal(body.reasoning.effort, effort);
        assert.ok(!Object.hasOwn(body, 'reasoning_effort'));
        return json({ status: 'completed', output_text: '收到', output: [] });
      }
      assert.equal(body.reasoning_effort, effort);
      assert.ok(!Object.hasOwn(body, 'reasoning'));
      return json({ choices: [{ message: { content: '收到' }, finish_reason: 'stop' }] });
    };
    assert.equal(await model.testMessage('测试'), '收到');
    assert.equal(model.history().at(-1).reasoningEffort, effort);
  }
});
await test('endpoint fallback preserves explicit reasoning rather than silently dropping it', async () => {
  model.save({ protocol: 'auto', reasoningEffort: 'high' });
  const bodies = [];
  ctx.fetch = async (url, options) => {
    bodies.push(JSON.parse(options.body));
    return url.endsWith('/responses') ? json({ error: { message: 'Not found' } }, 404)
      : json({ choices: [{ message: { content: '{"questions":[]}' }, finish_reason: 'stop' }] });
  };
  await model.runTask('questions', { brief: 'x' });
  assert.equal(bodies[0].reasoning.effort, 'high');
  assert.equal(bodies[1].reasoning_effort, 'high');
});
await test('an unsupported reasoning setting reports an error without silently retrying defaults', async () => {
  model.save({ protocol: 'auto', reasoningEffort: 'max' });
  let calls = 0;
  ctx.fetch = async () => { calls++; return json({ error: { message: 'reasoning_effort max is not supported for this model test-secret' } }, 400); };
  await assert.rejects(() => model.runTask('questions', { brief: 'x' }), (error) => /推理强度/.test(error.message) && !error.message.includes('test-secret'));
  assert.equal(calls, 1);
  assert.equal(model.history().at(-1).status, 'error');
  model.save({ reasoningEffort: 'auto' });
});
// Drive virtual idle intervals while exercising real Web Response/ReadableStream readers.
async function withClock(run) {
  let now = 0, id = 0;
  const timers = new Map();
  ctx.setTimeout = (fn,delay) => { const key = ++id; timers.set(key,{at:now+delay,fn}); return key; };
  ctx.clearTimeout = key => timers.delete(key);
  ctx.Date = class extends Date { static now() { return 1780000000000+now; } };
  const settle = () => new Promise(resolve=>setImmediate(resolve));
  async function advance(ms) {
    await settle();
    const end = now+ms;
    for (;;) {
      const next = [...timers].sort((a,b)=>a[1].at-b[1].at)[0];
      if (!next || next[1].at>end) break;
      now=next[1].at;timers.delete(next[0]);next[1].fn();
      await settle();
    }
    now=end;await settle();
  }
  try { await run({advance,settle}); }
  finally {ctx.setTimeout=setTimeout;ctx.clearTimeout=clearTimeout;ctx.Date=Date;}
}
function heldResponse(type = 'text/event-stream', status = 200) {
  let writer, cancelled = false;
  const reader = new ReadableStream({start(controller) { writer = controller; },cancel() { cancelled=true; }});
  return {
    response:new Response(reader,{headers:{'content-type':type},status}),
    send:text=>writer.enqueue(new TextEncoder().encode(text)),
    close:()=>writer.close(),
    get cancelled() {return cancelled;},
  };
}
const chatData=(delta,finish=null) => 'data: '+JSON.stringify({choices:[{delta,finish_reason:finish}]})+'\n\n';
const last=()=>model.history().at(-1);
await test('long reasoning exceeds the old three-minute deadline and completes at the protocol boundary',async()=>{
  model.save({protocol:'responses'});
  await withClock(async({advance,settle})=>{
    const wire=heldResponse();let calls=0,phases=[];
    ctx.CustomEvent=class {constructor(name,init){this.type=name;this.detail=init.detail;}};
    ctx.dispatchEvent=event=>{phases.push(event.detail.phase);};
    ctx.fetch=async()=>{calls++;return wire.response;};
    try {
      const result=model.runTask('questions',{brief:'Draft'},{timeoutMs:90000});
      await settle();assert.equal(last().phase,'waiting');assert.equal(last().httpStatus,200);
      for(let n=0;n<3;n++){
        await advance(65000);
        wire.send('event: response.reasoning_summary_text.delta\r\ndata: {"delta":"想"}\r\n\r\n');
      }
      await advance(65000);
      assert.equal(last().phase,'reasoning');
      wire.send('data: '+JSON.stringify({type:'response.output_text.delta',delta:'{"questions":["Map?"]}'})+'\r\r');
      await settle();assert.equal(last().phase,'writing');
      wire.send('data: {"type":"response.completed","response":{"status":"completed","output":[]}}\r\r');
      assert.deepEqual(Array.from((await result).questions),['Map?']);
      assert.ok(wire.cancelled);assert.equal(calls,1);assert.ok(last().bytesReceived>0);
      assert.equal(last().reasoning,'想想想');assert.ok(phases.includes('reasoning'));
    } finally {delete ctx.CustomEvent;delete ctx.dispatchEvent;}
  });
});
await test('a silent first body packet times out distinctly even after successful headers',async()=>{
  model.save({protocol:'auto'});
  await withClock(async({advance,settle})=>{
    const wire=heldResponse();let calls=0;
    ctx.fetch=async()=>{calls++;return wire.response;};
    const rejected=assert.rejects(model.runTask('ideas',{brief:'x'},{timeoutMs:5000}),e=>e.name==='TimeoutError' && e.code==='first-byte-timeout' && /首个/.test(e.message));
    await settle();assert.equal(last().httpStatus,200);
    await advance(5001);await rejected;
    assert.equal(last().status,'error');assert.equal(last().bytesReceived,0);assert.equal(calls,1);assert.ok(wire.cancelled);
  });
});
await test('silent gaps after body data preserve the preview and differ from cancellation',async()=>{
  model.save({protocol:'chat'});
  await withClock(async({advance,settle})=>{
    for(const cancelManually of [false,true]){
      const source=heldResponse();const user=new AbortController();
      ctx.fetch=async()=>source.response;
      const rejected=assert.rejects(model.runTask('questions',{brief:'x'},{signal:user.signal,timeoutMs:6000}),e=>e.code===(cancelManually?'cancelled':'idle-timeout'));
      await settle();source.send(chatData({reasoning_content:'Part of a thought'}));source.send(chatData({content:'{"questions":'}));
      await settle();await advance(5500);
      source.send(': heartbeat\n\n');await settle();await advance(5500);assert.equal(last().status,'running');
      if(cancelManually) user.abort();else await advance(600);
      await rejected;
      assert.equal(last().output,'{"questions":');assert.equal(last().reasoning,'Part of a thought');
      assert.equal(last().status,cancelManually?'cancelled':'error');assert.ok(source.cancelled);
    }
  });
});
await test('chunked nonstream JSON also renews the idle window and parses only complete data',async()=>{
  await withClock(async({advance,settle})=>{
    const source=heldResponse('application/json');ctx.fetch=async()=>source.response;
    const pending=model.runTask('ideas',{brief:'x'},{timeoutMs:3000});
    await settle();source.send('{"choices":[');await advance(2300);
    source.send('{"message":{"content":"{\\"ideas\\":[\\"Atlas\\"]}"},');await advance(2300);
    source.send('"finish_reason":"stop"}]}');source.close();
    assert.deepEqual(Array.from((await pending).ideas),['Atlas']);
    const broken=heldResponse('application/json');ctx.fetch=async()=>broken.response;
    const rejected=assert.rejects(model.runTask('ideas',{brief:'x'}),/JSON/);
    await settle();broken.send('{"choices":[');broken.close();await rejected;
  });
});
await test('terminal Chat events resolve without EOF and explicit truncation still fails',async()=>{
  for(const mode of ['finish','done','truncated']){
    const stream=heldResponse();
    ctx.fetch=async()=>stream.response;
    const pending=model.runTask('questions',{brief:'x'});
    const checked=mode==='truncated'?assert.rejects(pending,/截断/):pending;
    stream.send(chatData({content:'{"questions":[]}'},mode==='truncated'?'length':mode==='finish'?'stop':null));
    if(mode==='done')stream.send('data: [DONE]\n\n');
    await checked;assert.ok(stream.cancelled || mode==='truncated');
  }
});
await test('provider errors and invalid models do not repeat generation or disclose the key',async()=>{
  model.save({protocol:'auto'});
  for(const [status,detail] of [[404,'unknown model'],[429,'quota exceeded'],[503,'upstream offline']]){
    let count=0;
    ctx.fetch=async()=>{count++;return json({error:{message:detail+' test-secret',code:'invalid'}},status);};
    await assert.rejects(model.runTask('questions',{brief:'x'}),e=>e.message.includes(detail) && e.message.includes(String(status)) && !e.message.includes('test-secret'));
    assert.equal(count,1);
  }
  const abort=new AbortController();abort.abort();
  let count=0;ctx.fetch=async()=>{count++;throw Error('should not be called');};
  await assert.rejects(model.runTask('questions',{brief:'x'},{signal:abort.signal}),e=>e.code==='cancelled');assert.equal(count,0);
});
await test('idle minutes are profile specific with defaults for existing or malformed settings',()=>{
  model.selectProfile('default');
  assert.equal(model.load().idleMinutes,5);
  model.save({idleMinutes:12});model.newProfile('Long writing');
  assert.equal(model.load().idleMinutes,5);
  model.save({idleMinutes:20});model.selectProfile('default');assert.equal(model.load().idleMinutes,12);
  for(const invalid of [0,-1,61,NaN,'']) assert.equal(model.save({idleMinutes:invalid}).idleMinutes,5);
});
await test('a provider returning only reasoning keeps the diagnostic output out of the draft',async()=>{
  model.save({protocol:'chat'});
  ctx.fetch=async()=>json({choices:[{message:{content:[{type:'thinking',thinking:'thinking only'}]},finish_reason:'stop'}]});
  await assert.rejects(model.runTask('ideas',{brief:'x'}),/只返回了推理/);
  assert.equal(last().output,'');assert.equal(last().reasoning,'thinking only');assert.equal(last().status,'error');
});

await test('real fetch releases persistent SSE connections, distinguishes silent peers, and preserves gateway errors',async()=>{
  const server=http.createServer();
  const queue=[],seen=new Map();
  server.on('request',(req,res)=>{
    const item=queue.shift();
    if (!item) {res.writeHead(500);res.end();return;}
    seen.set(item.name,(seen.get(item.name)||0)+1);
    req.resume();
    res.writeHead(item.name==='gateway'?504:200,{'Content-Type':item.name==='gateway'?'application/json':'text/event-stream'});
    res.flushHeaders();
    if (item.name==='complete') res.write(chatData({content:'{"questions":["Ready?"]}'},'stop'));
    if (item.name==='stall'||item.name==='cancel') res.write(chatData({reasoning_content:'Fixture thought'}));
    if (item.name==='gateway') res.end('{"error":{"message":"upstream timeout"}}');
    item.started();
  });
  const original=model.load();
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  try {
    model.save({baseUrl:'http://127.0.0.1:'+server.address().port+'/v1',model:'fixture',key:'local-test-only',protocol:'chat'});
    ctx.fetch=globalThis.fetch;
    for (const name of ['complete','silent','stall','cancel','gateway']) {
      let started;
      const called=new Promise(resolve=>{started=resolve;});
      queue.push({name,started});
      const user=new AbortController(), pending=model.runTask('questions',{brief:'Local test'},{signal:user.signal,timeoutMs:800});
      const expected={silent:'first-byte-timeout',stall:'idle-timeout',cancel:'cancelled',gateway:'request-failed'};
      const checked=name==='complete'?pending:assert.rejects(pending,e=>e.code===expected[name] && (name!=='gateway'||/504.*upstream timeout/.test(e.message)));
      await called;
      if (name==='cancel') user.abort();
      const value=await checked;
      if (name==='complete') assert.equal(value.questions[0],'Ready?');
      if (name==='stall') assert.equal(last().reasoning,'Fixture thought');
    }
    assert.deepEqual([...seen.values()],[1,1,1,1,1]);
  } finally {
    model.save(original);
    const closed=once(server,'close');
    server.close(); server.closeAllConnections(); await closed;
  }
});
console.log(`${count} model transport checks passed`);
