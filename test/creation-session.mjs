import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const root = vm.createContext({
  console,
  JSON,
  RegExp,
  Error,
  Date,
  Math,
  Set,
  Map,
  Uint8Array,
  Uint32Array,
  DataView,
  TextEncoder,
  TextDecoder,
  crypto: webcrypto,
});
for (const name of ["formats", "store", "ai-tasks", "creation"])
  vm.runInContext(
    fs.readFileSync(new URL(`../js/${name}.js`, import.meta.url), "utf8"),
    root,
    { filename: name },
  );
const A = root.NIJANAI,
  C = root.NIJANCreation,
  S = root.TAStore;
const plain = (value) => JSON.parse(JSON.stringify(value));
let total = 0;
function test(name, fn) {
  fn();
  total++;
  console.log("ok", name);
}
test("only explicitly adopted full ideas enter the creative request", () => {
  const state = {
    brief: "写一位学院角色",
    ideas: [
      { text: "群像方向，学院各系分工。", accepted: true },
      { text: "封闭生态悬疑。", accepted: false },
      { text: "", accepted: true },
    ],
    creationHistory: [{ role: "user", text: "女主不要认识主角。" }],
  };
  const ctx = C.context(state, {
    instruction: "从借书相识。",
    previousDrafts: { character: { name: "知夏" } },
  });
  assert.deepEqual(plain(ctx.ideas), ["群像方向，学院各系分工。"]);
  assert.equal(ctx.instruction, "从借书相识。");
  assert.equal(ctx.history[0].text, "女主不要认识主角。");
  assert.equal(ctx.previousDrafts.character.name, "知夏");
  state.ideas[0].text = "改过的想法";
  state.creationHistory[0].text = "另一要求";
  assert.equal(ctx.ideas[0], "群像方向，学院各系分工。");
  assert.equal(ctx.history[0].text, "女主不要认识主角。");
});
test("creative prompts explicitly use selected ideas, feedback and current drafts", () => {
  const prompt = A.prompt("create:character", {});
  for (const marker of [
    "ideas",
    "用户已经勾选",
    "落实到正文",
    "history",
    "最新用户要求优先",
    "currentDraft",
    "不重新从零",
  ])
    assert.ok(prompt.includes(marker));
});
test("a discussion produces a response without a write proposal", () => {
  assert.equal(
    A.validate("discuss", { reply: "可以从借书相识展开。" }, {}).reply,
    "可以从借书相识展开。",
  );
  assert.throws(() =>
    A.validate("discuss", { reply: "", character: { name: "不应写入" } }, {}),
  );
  assert.throws(() =>
    A.validate("discuss", { reply: "已经修改", changes: [] }, {}),
  );
  assert.ok(
    A.prompt("discuss", {}).includes("不直接") ||
      A.prompt("discuss", {}).includes("不返回创作模块"),
  );
});
test("omitted optional draft fields remain intact during continued creation", () => {
  const previous = {
    character: {
      name: "知夏",
      description: "旧描述",
      personality: "耐心",
      scenario: "",
      creator_notes: "保留备注",
    },
  };
  const updated = C.mergeResult(previous, {
    character: { name: "知夏", description: "新描述" },
  });
  assert.equal(updated.character.personality, "耐心");
  assert.equal(updated.character.creator_notes, "保留备注");
  assert.equal(previous.character.description, "旧描述");
});
test("continuing a pending card reuses its identity and does not create a duplicate", () => {
  const actual = S.emptyLibrary(),
    virtual = A.copy(actual);
  const first = A.proposal(
    virtual,
    "create:character",
    { character: { name: "知夏", description: "安静。" } },
    { brief: "x" },
  );
  A.commit(virtual, A.copy(first));
  const id = first.operations[0].value.id;
  const next = A.proposal(
    virtual,
    "create:character",
    { character: { name: "知夏", description: "认真，起初不认识主角。" } },
    { brief: "x" },
  );
  C.preserveIds(next, first);
  C.withdraw(virtual, first);
  A.commit(virtual, A.copy(next));
  assert.equal(virtual.characters.length, 1);
  assert.equal(virtual.characters[0].id, id);
  assert.ok(virtual.characters[0].description.includes("不认识"));
  assert.equal(actual.characters.length, 0);
});
test("world revision preserves entry identities and omitted trigger settings", () => {
  const actual = S.emptyLibrary(),
    virtual = A.copy(actual);
  const raw = {
    world: {
      name: "学院",
      entries: [
        {
          comment: "规矩",
          content: "九点关门。",
          constant: true,
          depth: 7,
          keys: [],
        },
      ],
    },
  };
  const first = A.proposal(virtual, "create:world", raw, { brief: "x" });
  A.commit(virtual, A.copy(first));
  const merged = C.mergeResult(raw, {
    world: {
      name: "学院",
      entries: [{ comment: "规矩", content: "十点关门。" }],
    },
  });
  C.withdraw(virtual, first);
  const next = C.preserveIds(
    A.proposal(virtual, "create:world", merged, { brief: "x" }),
    first,
  );
  A.commit(virtual, A.copy(next));
  assert.equal(virtual.worldBooks.length, 1);
  assert.equal(virtual.worldBooks[0].id, first.operations[0].value.id);
  const entry = virtual.worldBooks[0].entries[0];
  assert.equal(entry.id, first.operations[0].value.entries[0].id);
  assert.equal(entry.constant, true);
  assert.equal(entry.depth, 7);
});
test("references from another pending module keep pointing to the revised character", () => {
  const virtual = S.emptyLibrary();
  const first = A.proposal(
    virtual,
    "create:character",
    { character: { name: "知夏" } },
    { brief: "x" },
  );
  A.commit(virtual, A.copy(first));
  const id = first.operations[0].value.id;
  const group = A.proposal(
    virtual,
    "create:group",
    { group: { name: "群像", members: [{ characterId: id }] } },
    { brief: "x", availableCharacters: virtual.characters },
  );
  A.commit(virtual, A.copy(group));
  C.withdraw(virtual, first);
  const next = C.preserveIds(
    A.proposal(
      virtual,
      "create:character",
      { character: { name: "知夏", personality: "认真。" } },
      { brief: "x" },
    ),
    first,
  );
  A.commit(virtual, A.copy(next));
  assert.ok(
    virtual.characters.some(
      (card) => card.id === virtual.groups[0].members[0].characterId,
    ),
  );
});
test("graph revision remaps its edges to the preserved node IDs", () => {
  const virtual = S.emptyLibrary();
  const raw = {
    graph: {
      nodes: [{ label: "甲" }, { label: "乙" }],
      edges: [{ from: "甲", to: "乙", label: "朋友" }],
    },
  };
  const first = A.proposal(virtual, "create:graph", raw, { brief: "x" });
  A.commit(virtual, A.copy(first));
  C.withdraw(virtual, first);
  const next = C.preserveIds(
    A.proposal(virtual, "create:graph", raw, { brief: "x" }),
    first,
  );
  A.commit(virtual, A.copy(next));
  assert.equal(virtual.graph.nodes.length, 2);
  assert.equal(virtual.graph.edges.length, 1);
  assert.ok(
    virtual.graph.nodes.some((node) => node.id === virtual.graph.edges[0].from),
  );
});
test("a targeted pending-world edit changes one field and preserves the rest of the draft", () => {
  const actual = S.emptyLibrary(),
    virtual = A.copy(actual);
  const raw = {
    world: {
      name: "学院",
      entries: [
        { comment: "图书馆", content: "九点关门。", constant: true },
        { comment: "操场", content: "白天开放。", keys: ["操场"] },
      ],
    },
  };
  const plan = A.proposal(virtual, "create:world", raw, { brief: "x" });
  plan.result = raw;
  A.commit(virtual, A.copy(plan));
  const value = plan.operations[0].value,
    entry = value.entries[0];
  const context = {
    instruction: "只改图书馆关门时间",
    bookId: value.id,
    targets: [
      {
        target: "entry",
        id: entry.id,
        fields: ["content"],
        value: A.copy(entry),
      },
    ],
  };
  const original = JSON.stringify(plan),
    second = JSON.stringify(value.entries[1]);
  const revised = C.refinePlan(
    virtual,
    plan,
    {
      changes: [
        { target: "entry", id: entry.id, fields: { content: "十点关门。" } },
      ],
    },
    context,
  );
  assert.equal(revised.count, 1);
  assert.equal(
    revised.plan.operations[0].value.entries[0].content,
    "十点关门。",
  );
  assert.equal(
    JSON.stringify(revised.plan.operations[0].value.entries[1]),
    second,
  );
  assert.equal(revised.plan.operations[0].value.entries[0].constant, true);
  assert.equal(JSON.stringify(plan), original);
  assert.equal(actual.worldBooks.length, 0);
});
console.log(`${total} creation session checks passed`);
