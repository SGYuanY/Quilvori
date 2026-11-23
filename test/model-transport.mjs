import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

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
for (const file of ["formats", "store", "ai-tasks", "model"])
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
console.log(`${count} model transport checks passed`);
