import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const templates = {};
const root = vm.createContext({
  TAI18n: {
    add(_labels, rows) { Object.assign(templates, rows); },
    t(key, vars = {}) {
      const template = templates[key]?.en || key;
      return template.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
    },
  },
});
for (const file of ["dialogue-phrases", "creative-dialogue", "ai-tasks", "creation"]) {
  const path = new URL("../js/" + file + ".js", import.meta.url);
  vm.runInContext(fs.readFileSync(path, "utf8"), root, { filename: file });
}
const dialogue = root.NIJANCreativeDialogue;
const plain = value => JSON.parse(JSON.stringify(value));
const actual = (task, input) => plain(root.NIJANAI.validate(task, dialogue.decode(task, input)));
const shapeError = err => err?.code === "dialogue-shape";
let checks = 0;
function test(name, fn) {
  fn(); checks++; console.log("ok", name);
}

test("human questions and inspiration lists handle headings, inline numbering and repeated entries", () => {
  assert.deepEqual(actual("questions", "Three choices:\n1、Who holds the map? 2、What is missing? 3、What is missing?"),
    { questions: ["Who holds the map?", "What is missing?"] });
  assert.deepEqual(actual("ideas", "Two possibilities:\n- Give the keeper a spare key.\n- Set the scene at low tide."),
    { ideas: ["Give the keeper a spare key.", "Set the scene at low tide."] });
  assert.deepEqual(actual("ideas", "Give the keeper a spare key."), { ideas: ["Give the keeper a spare key."] });
  assert.deepEqual(actual("questions", "用什么线索让玩家找到旧车站？"), { questions: ["用什么线索让玩家找到旧车站？"] });
});

test("common nested JSON, single question objects and labelled ideas keep their meaning", () => {
  const response = { data: { questions: [{ question: { text: "What must she give up?" } }, { prompt: "Who knows her name?" }] } };
  assert.deepEqual(actual("questions", "Result:\n" + JSON.stringify(response)), { questions: ["What must she give up?", "Who knows her name?"] });
  assert.deepEqual(actual("questions", { question: { content: "What does the keeper risk?" } }), { questions: ["What does the keeper risk?"] });
  assert.deepEqual(actual("ideas", [{ title: "The toll", description: "Only the keeper knows the real price." }, { idea: { text: "Move the opening to dusk." } }]),
    { ideas: ["The toll — Only the keeper knows the real price.", "Move the opening to dusk."] });
  assert.deepEqual(actual("questions", { questions: ["Who is watching?", { comment: "A lore entry", content: "Who is named in the entry?" }] }),
    { questions: ["Who is watching?"] });
});

test("creative modules and malformed data never become discussion, questions or inspiration", () => {
  for (const task of ["questions", "ideas", "discuss"]) {
    for (const payload of [
      { character: { name: "Keeper", first_mes: "Who is there?" } },
      { world: { name: "East", entries: [{ comment: "Bay", content: "Who lives here?" }] } },
      { type: "character", content: "Who remembers?" },
      { comment: "Standalone entry", content: "Who is there?" }, "[{\"character\":",
      "Name: Keeper\nPersonality: Who can be trusted?",
    ]) assert.throws(() => actual(task, payload), shapeError);
  }
  assert.throws(() => actual("discuss", { reply: "We can talk about it.", data: { changes: [] } }), shapeError);
  assert.throws(() => actual("ideas", null), shapeError);
  assert.throws(() => actual("ideas", "null"), shapeError);
  assert.throws(() => actual("questions", "Island keeper."), shapeError);
  assert.throws(() => actual("questions", "I have enough context to write."), shapeError);
  assert.deepEqual(actual("questions", { questions: [] }), { questions: [] });
});

test("plain conversation, nested message envelopes and text parts remain readable", () => {
  const content = "Let her find the key first.\n\nWhat would make her hesitate?";
  for (const response of [content, { reply: content }, { message: { role: "assistant", content } }, { data: { reply: { text: content } } }])
    assert.deepEqual(actual("discuss", response), { reply: content });
  assert.equal(actual("discuss", { message: { content: [{ type: "text", text: "First." }, { type: "output_text", text: "Second." }] } }).reply, "First.\nSecond.");
  assert.deepEqual(actual("discuss", { status: "needs_input", question: { text: "Where should it happen?" } }), { reply: "Where should it happen?" });
  assert.throws(() => actual("discuss", { reply: "", changes: [] }), shapeError);
});

test("only malformed or completed empty optional results use local prompts, with no extra request", () => {
  const context = { brief: "A keeper guards a rain gate", modules: ["world"] };
  const result = dialogue.options("questions", null, { code: "empty-output" }, context, "en");
  assert.ok(result.local);
  assert.match(result.items[0], /rain gate/);
  assert.match(result.items[0], /rule/);
  assert.equal(dialogue.options("questions", { questions: [] }, null, context, "en").local, true);
  assert.equal(dialogue.options("ideas", null, { code: "dialogue-shape" }, context, "en").local, true);
  for (const code of ["cancelled", "idle-timeout", "first-byte-timeout", "request-failed", "invalid-result"]) {
    const error = Object.assign(new Error(code), { code });
    assert.throws(() => dialogue.options("ideas", null, error, context, "en"), e => e === error);
  }
  const asked = Object.assign(new Error("Which entrance?"), { code: "needs-input" });
  assert.deepEqual(plain(dialogue.options("questions", null, asked, context, "en")), { local: false, items: ["Which entrance?"] });
});

test("local prompts use the brief language, explicit language requests, interface fallback and selected modules", () => {
  for (const [brief, ui, expected] of [
    ["河岸上的书屋", "en", /当地人/], ["灯台の町です", "en", /住人/], ["Город маяков", "en", /местные/],
    ["등대 마을", "en", /주민/], ["หมู่บ้านประภาคาร", "en", /ท้องถิ่น/],
    ["A keeper guards the rain gate", "zh", /locals/], ["河岸的书屋。请用英语。", "zh", /locals/],
    ["Atlas", "ja", /住人/],
  ]) {
    const { items } = dialogue.options("questions", null, null, { brief, modules: ["world"] }, ui);
    assert.match(items[0], expected);
  }
  const { items } = dialogue.options("ideas", null, null, { brief: "The forgotten map", modules: ["character"] }, "en");
  assert.match(items[0], /keepsake/);
});

test("answered questions and accepted inspirations survive another request and only selections enter the creative context", () => {
  const priorAnswers = [{ question: "Who?", answer: "The keeper.", local: true }, { question: "Where?", answer: "" }];
  const rows = dialogue.answeredQuestions(priorAnswers, ["When?"], false);
  const ideas = dialogue.availableIdeas([{ text: "Locked gate", accepted: true }], ["Locked gate", "Hidden stair"], true);
  assert.equal(rows.length, 2);
  assert.equal(ideas.length, 2);
  assert.equal(ideas[1].local, true);
  const ctx = root.NIJANCreation.context({ brief: "", answers: rows, ideas });
  assert.deepEqual(plain(ctx.answers).map(row => row.answer), ["The keeper."]);
  assert.deepEqual(plain(ctx.ideas), ["Locked gate"]);
});

test("one click can use the last real discussion even when the composer is empty and task receipts follow it", () => {
  const history = [
    { role: "user", text: "Make the keeper suspicious." },
    { role: "assistant", kind: "discussion", text: "Let the keeper hide the spare key." },
    { role: "assistant", text: "Saved the world draft." },
  ];
  assert.match(dialogue.revisionInstruction("", history), /hide the spare key/);
  assert.ok(!dialogue.revisionInstruction("", history).includes("Saved the world draft"));
  assert.equal(dialogue.revisionInstruction("  Keep the first line intact.  ", history), "Keep the first line intact.");
  assert.equal(dialogue.revisionInstruction(" ", [{ role: "assistant", text: "A draft was generated." }]), "");
  const old = [{ role: "user", text: "Discuss an old note." }, { role: "assistant", text: "Keep the key." }];
  assert.match(dialogue.revisionInstruction("", old, "AI 已回复。可以继续沟通，或点击“按沟通更新所选模块”。"), /Keep the key/);
});

console.log(checks + " creative dialogue checks passed");
