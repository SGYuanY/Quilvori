import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const values = new Map();
const context = vm.createContext({
  console,
  JSON,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  Uint32Array,
  DataView,
  btoa,
  atob,
  crypto: webcrypto,
  structuredClone,
  RegExp,
  Error,
  Date,
  Math,
  Map,
  Set,
  AbortController,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  },
  fetch: () => {
    throw new Error("No real network in workflow tests");
  },
});
context.globalThis = context;
for (const name of ["png", "formats", "store", "ai-tasks", "model"])
  vm.runInContext(
    fs.readFileSync(new URL(`../js/${name}.js`, import.meta.url), "utf8"),
    context,
    { filename: `${name}.js` },
  );
const A = context.NIJANAI,
  Store = context.TAStore;
const native = (value) => JSON.parse(JSON.stringify(value));
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("ok", name);
}
function setup() {
  const library = Store.demoLibrary();
  const book = library.worldBooks[0],
    card = library.characters[0];
  Object.assign(book.entries[0], {
    constant: true,
    enabled: false,
    position: "at_depth",
    depth: 12,
    order: 501,
    secondaryKeys: ["secondary"],
    extensions: { preserve: true },
  });
  const entry = book.entries[0];
  const ctx = {
    instruction: "只修改选中条目的正文",
    bookId: book.id,
    allowClear: false,
    targets: [
      {
        target: "entry",
        id: entry.id,
        fields: ["content"],
        value: A.copy(entry),
      },
    ],
    reference: { card, book },
  };
  return { library, book, card, entry, ctx };
}
test("a proposal never mutates the library; applying preserves entry identity and all configuration", () => {
  const { library, entry, ctx } = setup(),
    before = JSON.stringify(library),
    snapshot = A.copy(entry);
  const plan = A.proposal(
    library,
    "edit",
    {
      changes: [
        {
          target: "entry",
          id: entry.id,
          fields: { content: "调整后的正文。" },
        },
      ],
    },
    ctx,
  );
  assert.equal(JSON.stringify(library), before);
  const receipt = A.commit(library, plan);
  assert.deepEqual(native(entry), {
    ...native(snapshot),
    content: "调整后的正文。",
  });
  A.undo(library, receipt, plan);
  assert.equal(JSON.stringify(library), before);
});
test("an empty change list does not delete entries", () => {
  const { library, ctx } = setup(),
    before = JSON.stringify(library);
  const plan = A.proposal(library, "edit", { changes: [] }, ctx);
  assert.equal(plan.operations.length, 0);
  assert.equal(JSON.stringify(library), before);
});
test("clarification and missing result fields never become an empty world book", () => {
  const { library, ctx } = setup(),
    before = JSON.stringify(library);
  for (const result of [
    { unsure: true, question: "Which entry?" },
    { status: "needs_input", question: "Which field?" },
    { entries: [] },
    {},
  ])
    assert.throws(() => A.proposal(library, "edit", result, ctx));
  assert.equal(JSON.stringify(library), before);
});
test("unselected entries, fields and duplicate updates are rejected", () => {
  const { library, entry, ctx } = setup();
  for (const changes of [
    [{ target: "entry", id: "wrong", fields: { content: "x" } }],
    [{ target: "entry", id: entry.id, fields: { comment: "x" } }],
    [
      { target: "entry", id: entry.id, fields: { content: "x" } },
      { target: "entry", id: entry.id, fields: { content: "y" } },
    ],
  ])
    assert.throws(() => A.proposal(library, "edit", { changes }, ctx));
});
test("missing optional fields are retained and empty fields require explicit permission", () => {
  const { library, card } = setup();
  card.creator_notes = "原备注";
  const ctx = {
    targets: [
      {
        target: "character",
        id: card.id,
        fields: ["personality", "creator_notes"],
        value: A.copy(card),
      },
    ],
    allowClear: false,
  };
  const result = {
    changes: [
      { target: "character", id: card.id, fields: { personality: "新性格" } },
    ],
  };
  A.commit(library, A.proposal(library, "edit", result, ctx));
  assert.equal(card.creator_notes, "原备注");
  const clear = {
    changes: [
      { target: "character", id: card.id, fields: { creator_notes: "" } },
    ],
  };
  assert.throws(() => A.proposal(library, "edit", clear, ctx));
  ctx.allowClear = true;
  A.commit(library, A.proposal(library, "edit", clear, ctx));
  assert.equal(card.creator_notes, "");
});
test("stale previews fail atomically, without overwriting manual edits", () => {
  const { library, book, ctx } = setup();
  const second = book.entries[1];
  ctx.targets.push({
    target: "entry",
    id: second.id,
    fields: ["content"],
    value: A.copy(second),
  });
  const result = {
    changes: ctx.targets.map((target) => ({
      target: "entry",
      id: target.id,
      fields: { content: "新正文" },
    })),
  };
  const plan = A.proposal(library, "edit", result, ctx);
  second.content = "手工改动";
  const before = JSON.stringify(library);
  assert.throws(() => A.commit(library, plan), /变化/);
  assert.equal(JSON.stringify(library), before);
});
test("changes made while a request was in flight invalidate its proposal", () => {
  const { library, entry, ctx } = setup();
  entry.content = "请求期间的改动";
  assert.throws(
    () =>
      A.proposal(
        library,
        "edit",
        {
          changes: [
            { target: "entry", id: entry.id, fields: { content: "新正文" } },
          ],
        },
        ctx,
      ),
    /改变/,
  );
});
test("undo refuses to overwrite subsequent manual changes", () => {
  const { library, entry, ctx } = setup();
  const plan = A.proposal(
    library,
    "edit",
    {
      changes: [
        { target: "entry", id: entry.id, fields: { content: "新正文" } },
      ],
    },
    ctx,
  );
  const receipt = A.commit(library, plan);
  entry.content = "应用后的手改";
  assert.throws(() => A.undo(library, receipt, plan));
  assert.equal(entry.content, "应用后的手改");
});
test("a selection edit must preserve the exact prefix and suffix", () => {
  const { library, entry, ctx } = setup();
  entry.content = "前文。需要修改。后文。";
  ctx.targets[0].value = A.copy(entry);
  ctx.selection = {
    id: entry.id,
    field: "content",
    start: 3,
    end: 8,
    text: "需要修改。",
  };
  assert.doesNotThrow(() =>
    A.proposal(
      library,
      "edit",
      {
        changes: [
          {
            target: "entry",
            id: entry.id,
            fields: { content: "前文。已经修改。后文。" },
          },
        ],
      },
      ctx,
    ),
  );
  assert.throws(() =>
    A.proposal(
      library,
      "edit",
      {
        changes: [
          {
            target: "entry",
            id: entry.id,
            fields: { content: "前文。已经修改。另一个结尾。" },
          },
        ],
      },
      ctx,
    ),
  );
});
test("an explicit first greeting edit replaces that field and leaves alternate greetings alone", () => {
  const { library, card } = setup(),
    greetings = A.copy(card.alternate_greetings);
  const ctx = {
    targets: [
      {
        target: "character",
        id: card.id,
        fields: ["first_mes"],
        value: A.copy(card),
      },
    ],
  };
  A.commit(
    library,
    A.proposal(
      library,
      "edit",
      {
        changes: [
          {
            target: "character",
            id: card.id,
            fields: { first_mes: "新的主开场白" },
          },
        ],
      },
      ctx,
    ),
  );
  assert.equal(card.first_mes, "新的主开场白");
  assert.deepEqual(native(card.alternate_greetings), native(greetings));
});
test("changing appearance cannot silently replace a setting entry", () => {
  const { library, card, book } = setup(),
    before = A.copy(book);
  const ctx = {
    targets: [
      {
        target: "character",
        id: card.id,
        fields: ["description"],
        value: A.copy(card),
      },
    ],
    reference: { book },
  };
  A.commit(
    library,
    A.proposal(
      library,
      "edit",
      {
        changes: [
          {
            target: "character",
            id: card.id,
            fields: { description: "新的外貌" },
          },
        ],
      },
      ctx,
    ),
  );
  assert.deepEqual(native(book), native(before));
});
test("new cards allow optional blanks and never create unrelated module objects", () => {
  const { library } = setup(),
    before = A.copy(library);
  const plan = A.proposal(
    library,
    "create:character",
    { character: { name: "新角色", creator_notes: "" } },
    { brief: "新角色" },
  );
  A.commit(library, plan);
  assert.equal(library.characters.length, before.characters.length + 1);
  assert.equal(library.characters.at(-1).system_prompt, "");
  for (const key of Object.keys(before).filter((key) => key !== "characters"))
    assert.deepEqual(native(library[key]), native(before[key]));
  assert.throws(() =>
    A.proposal(
      library,
      "create:character",
      { character: { name: "x" }, world: { name: "wrong", entries: [] } },
      { brief: "x" },
    ),
  );
});
test("new constant world entries can have no primary or secondary keywords", () => {
  const { library } = setup();
  const plan = A.proposal(
    library,
    "create:world",
    {
      world: {
        name: "新书",
        entries: [
          {
            comment: "规则",
            content: "恒定规则",
            constant: true,
            keys: [],
            secondaryKeys: [],
          },
        ],
      },
    },
    { brief: "x" },
  );
  A.commit(library, plan);
  const entry = library.worldBooks.at(-1).entries[0];
  assert.equal(entry.constant, true);
  assert.equal(entry.secondaryKeys.length, 0);
});
test("review requires evidence present in the actual source; an empty valid report is allowed", () => {
  const { card, book } = setup(),
    ctx = { card, book };
  assert.doesNotThrow(() => A.validate("review", { items: [] }, ctx));
  const item = {
    severity: "warn",
    kind: "logic",
    title: "需要核对",
    entry: book.entries[0].comment,
    place: book.entries[0].id,
    detail: "两个条件需要确认",
    evidence: [book.entries[0].content],
  };
  assert.doesNotThrow(() => A.validate("review", { items: [item] }, ctx));
  assert.throws(() =>
    A.validate(
      "review",
      { items: [{ ...item, evidence: ["这段话根本不存在"] }] },
      ctx,
    ),
  );
  assert.throws(() => A.validate("review", {}, ctx));
});
test("review and organize prompts never inherit creative style or a 600-character requirement", () => {
  for (const task of ["review", "organize", "questions"]) {
    const prompt = context.NIJANModel.systemPrompt(A.prompt(task, {}), task);
    assert.ok(!prompt.includes("600"));
    assert.ok(!prompt.includes("创作正文参考文风"));
  }
  assert.ok(
    context.NIJANModel.systemPrompt(
      A.prompt("create:character", {}),
      "create:character",
    ).includes("创作正文参考文风"),
  );
});
test("organizing missing fields can only quote existing text and preserves optional blanks", () => {
  const { library, card } = setup();
  card.creator_notes = "";
  const ctx = { card: A.copy(card), fields: ["creator_notes"] };
  assert.throws(() =>
    A.proposal(
      library,
      "organize",
      { fields: { creator_notes: "凭空编的新经历" } },
      ctx,
    ),
  );
  assert.equal(
    A.proposal(library, "organize", { fields: {} }, ctx).operations.length,
    0,
  );
});

const samples = {
  sections: { sections: { style: "短句、具体。" } },
  prompt: {
    prompt: { name: "文风", blocks: [{ name: "叙述", content: "具体描写。" }] },
  },
  regex: {
    regex: { scriptName: "引号", findRegex: "/a/g", replaceString: "" },
  },
  quick: {
    quick: { name: "回应", replies: [{ label: "继续", message: "继续。" }] },
  },
  timeline: { timeline: { notes: [{ title: "注", body: "场景规则。" }] } },
  graph: {
    graph: {
      nodes: [{ label: "甲" }, { label: "乙" }],
      edges: [{ from: "甲", to: "乙", label: "朋友" }],
    },
  },
  memory: { memory: { html: "<section><h2>现在</h2><p>雨夜。</p></section>" } },
  backup: { backup: { note: "写作稿备份。" } },
  chat: {
    chat: {
      name: "示例阅读稿",
      messages: [{ name: "旁白", mes: "雨落下来。", is_user: false }],
    },
  },
};
for (const [module, result] of Object.entries(samples))
  test(`${module} output is routed only to its own module and can be undone`, () => {
    const { library } = setup(),
      before = JSON.stringify(library),
      plan = A.proposal(library, `create:${module}`, result, { brief: "x" });
    const receipt = A.commit(library, plan);
    assert.notEqual(JSON.stringify(library), before);
    A.undo(library, receipt, plan);
    assert.equal(JSON.stringify(library), before);
  });
test("groups cannot be applied before their referenced character card", () => {
  const { library } = setup(),
    virtual = A.copy(library);
  const cardPlan = A.proposal(
    virtual,
    "create:character",
    { character: { name: "新成员" } },
    { brief: "x" },
  );
  A.commit(virtual, A.copy(cardPlan));
  const added = virtual.characters.at(-1);
  const groupPlan = A.proposal(
    virtual,
    "create:group",
    { group: { name: "新群", members: [{ characterId: added.id }] } },
    { brief: "x", availableCharacters: virtual.characters },
  );
  assert.throws(() => A.commit(library, groupPlan), /先应用/);
  A.commit(library, cardPlan);
  A.commit(library, groupPlan);
  assert.equal(library.groups.at(-1).members[0].characterId, added.id);
});
test("whitespace-only outputs cannot bypass the clearing permission", () => {
  const { library, entry, ctx } = setup();
  assert.throws(
    () =>
      A.proposal(
        library,
        "edit",
        {
          changes: [
            { target: "entry", id: entry.id, fields: { content: "  \n " } },
          ],
        },
        ctx,
      ),
    /清空/,
  );
});
test("invalid nested graph, timeline, and group values are rejected before proposal creation", () => {
  const { library, card } = setup();
  const invalid = [
    ["graph", { graph: { nodes: [null], edges: [] } }],
    [
      "graph",
      {
        graph: { nodes: [{ label: "甲", characterId: "unknown" }], edges: [] },
      },
    ],
    [
      "graph",
      {
        graph: {
          nodes: ["甲", "乙"],
          edges: [
            { from: "甲", to: "乙", label: "朋友", note: { invalid: true } },
          ],
        },
      },
    ],
    [
      "timeline",
      { timeline: { notes: [{ title: "注", body: "内容", floor: "0" }] } },
    ],
    [
      "group",
      {
        group: {
          name: "群聊",
          members: [{ characterId: card.id, talkativeness: "0.5" }],
        },
      },
    ],
  ];
  const before = JSON.stringify(library);
  invalid.forEach(([module, result]) =>
    assert.throws(() =>
      A.proposal(library, `create:${module}`, result, {
        brief: "x",
        availableCharacters: library.characters,
      }),
    ),
  );
  assert.equal(JSON.stringify(library), before);
});
test("graph edges cannot be applied without their endpoints", () => {
  const { library } = setup();
  const plan = A.proposal(
    library,
    "create:graph",
    {
      graph: {
        nodes: ["甲", "乙"],
        edges: [{ from: "甲", to: "乙", label: "朋友" }],
      },
    },
    { brief: "x" },
  );
  const edge = plan.operations.find(
    (operation) => operation.path[1] === "edges",
  );
  const before = JSON.stringify(library);
  assert.throws(() => A.commit(library, plan, [edge.key]), /人物/);
  assert.equal(JSON.stringify(library), before);
});
test("local checks treat optional blanks as notes", () => {
  const library = Store.emptyLibrary();
  library.characters.push({ id: "optional", name: "只填名字", tags: [] });
  assert.equal(
    context.TAFormats.checkConsistency(library, "optional").filter(
      (item) => item.severity === "error",
    ).length,
    0,
  );
});
test("undoing a new character refuses to break subsequent references", () => {
  const { library } = setup();
  const plan = A.proposal(
    library,
    "create:character",
    { character: { name: "新增人物" } },
    { brief: "x" },
  );
  const receipt = A.commit(library, plan),
    added = library.characters.at(-1);
  library.groups.push({
    id: "later-group",
    members: [{ characterId: added.id }],
  });
  const before = JSON.stringify(library);
  assert.throws(() => A.undo(library, receipt, plan), /后续引用/);
  assert.equal(JSON.stringify(library), before);
});
test("large-book references preserve complete relevant entries and state the omitted scope", () => {
  const book = {
    id: "large",
    name: "大书",
    entries: Array.from({ length: 100 }, (_, i) => ({
      id: `entry-${i}`,
      comment: i === 90 ? "林舟" : "其他条目" + i,
      content: (i === 90 ? "林舟相关设定。" : "其他设定。").repeat(120),
      keys: i === 90 ? ["林舟"] : [],
      depth: 7,
      extensions: { keep: true },
    })),
  };
  const before = JSON.stringify(book);
  const selected = A.referenceBook(book, "请修改林舟", ["entry-0"], 5000);
  assert.equal(selected.scope.totalEntries, 100);
  assert.ok(selected.scope.omittedEntries > 0);
  assert.ok(!selected.entries.some((entry) => entry.id === "entry-0"));
  assert.deepEqual(
    native(selected.entries.find((entry) => entry.id === "entry-90")),
    native(book.entries[90]),
  );
  assert.equal(JSON.stringify(book), before);
  const review = A.reviewBook(book, ["entry-0", "entry-90"]);
  assert.deepEqual(native(review.entries.map((entry) => entry.id)), [
    "entry-0",
    "entry-90",
  ]);
  assert.equal(review.scope.mode, "selected_entries");
});
console.log(`${count} AI workflow checks passed`);
