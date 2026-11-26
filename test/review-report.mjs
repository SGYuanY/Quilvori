import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const root = vm.createContext({ console, JSON, Date, Set, Map, RegExp, Error });
for (const file of ["ai-tasks", "review"])
  vm.runInContext(
    fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), "utf8"),
    root,
    { filename: file },
  );
const A = root.NIJANAI,
  R = root.NIJANReview;
const card = {
  id: "card-one",
  name: "上官怨",
  description: "玩家扮演上官怨。\n上官怨是普通学生。",
};
const book = {
  id: "book-one",
  name: "身份设定",
  entries: [
    { id: "lore_one", comment: "主角归属", content: "怨怨是月桂王国的公主。" },
    {
      id: "lore_one_long",
      comment: "主角",
      content: "姓名：怨怨\n身份：月桂王国公主",
    },
    {
      id: "lore_duplicate",
      comment: "主角归属",
      content: "另一位角色的设定。",
    },
  ],
};
const library = { characters: [card], worldBooks: [book] };
const oldItem = {
  severity: "error",
  kind: "persona",
  title: "主角身份冲突",
  entry: "主角",
  place:
    "card.description；book.lore_one [主角归属]；book.lore_one_long [主角]",
  detail: "card明确把玩家扮演者写为普通学生；book写成公主。",
  evidence: [
    "上官怨是普通学生。",
    "怨怨是月桂王国的公主。",
    "身份：月桂王国公主",
  ],
};
const report = {
  cardId: card.id,
  bookId: book.id,
  source: JSON.stringify({ card, book }),
  items: [oldItem],
};
let total = 0;
const test = (name, fn) => {
  fn();
  total++;
  console.log("ok", name);
};
test("old reports resolve exact fields, names and line numbers from quotations", () => {
  const view = R.readable(oldItem, report, library);
  assert.equal(view.locations.length, 3);
  assert.equal(
    view.locations[0].label,
    "角色卡《上官怨》 → 描述与外貌 · 第 2 行",
  );
  assert.equal(
    view.locations[1].label,
    "世界书《身份设定》 → 条目《主角归属》 → 正文 · 第 1 行",
  );
  assert.equal(view.locations[2].id, "lore_one_long");
  assert.ok(!view.conclusion.includes("card"));
  assert.ok(!view.conclusion.includes("book"));
});
test("explicit sources distinguish duplicate entry names", () => {
  const item = {
    ...oldItem,
    evidence: [book.entries[0].content],
    sources: [
      {
        target: "entry",
        id: "lore_one",
        field: "content",
        quote: book.entries[0].content,
      },
    ],
  };
  A.validate("review", { items: [item] }, { card, book });
  assert.equal(R.readable(item, report, library).locations[0].id, "lore_one");
});
test("source addresses cannot name an unselected object or an unrelated field", () => {
  const item = {
    ...oldItem,
    evidence: [book.entries[0].content],
    sources: [
      {
        target: "entry",
        id: "not-provided",
        field: "content",
        quote: book.entries[0].content,
      },
    ],
  };
  assert.throws(
    () => A.validate("review", { items: [item] }, { card, book }),
    /地址|条目|栏位/,
  );
  item.sources[0].id = "lore_one";
  item.sources[0].field = "comment";
  assert.throws(
    () => A.validate("review", { items: [item] }, { card, book }),
    /地址|原文/,
  );
});
test("saved reports keep their original quote addresses after the live text changes", () => {
  const live = JSON.parse(JSON.stringify(library));
  live.worldBooks[0].entries[0].content = "现在已修改。";
  const resolved = R.readable(oldItem, report, live);
  assert.equal(resolved.locations[1].exists, true);
  assert.equal(resolved.locations[1].quote, "怨怨是月桂王国的公主。");
  live.worldBooks[0].entries = [];
  assert.equal(R.readable(oldItem, report, live).locations[1].exists, false);
});
test("unresolved sources never fabricate a destination", () => {
  const view = R.readable(
    { ...oldItem, evidence: ["不存在的引用"] },
    report,
    library,
  );
  assert.equal(view.locations.length, 0);
});
test("readable cards escape model markup and keep raw paths out of addresses", () => {
  const item = {
    ...oldItem,
    title: "<img src=x onerror=alert(1)>",
    conclusion: "这两处身份不同，需确认是不是同一人。",
    suggestion: "先确认玩家和角色的关系。",
  };
  const html = R.html({ ...report, items: [item] }, library);
  assert.ok(!html.includes("<img"));
  for (const label of [
    "简单说",
    "为什么",
    "建议怎么处理",
    "涉及条目与地址",
    "定位原文",
    "对照原文",
  ])
    assert.ok(html.includes(label));
  assert.ok(!html.includes("book.lore_one"));
  assert.ok(html.includes("模型判为冲突"));
});
test("structured source snippets are readable without losing the stored quotation", () => {
  const raw = '"姓名":"怨怨","身份":"公主","年龄":18';
  assert.equal(R.quoteText(raw), "姓名：怨怨\n身份：公主\n年龄：18");
  assert.equal(oldItem.evidence[0], "上官怨是普通学生。");
});
test("the review prompt separates players, roles and time before declaring conflict", () => {
  const prompt = A.prompt("review", {});
  for (const text of [
    "普通读者",
    "玩家",
    "穿越前后",
    "同一个人",
    "conclusion",
    "suggestion",
    "sources",
  ])
    assert.ok(prompt.includes(text));
});
test("one statement, repeated or overlapping quotes, and ambiguous matches need confirmation", () => {
  const statement = card.description.split("\n")[1];
  const weak = [
    [statement], [statement, statement], [statement, "是普通学生"],
    ["上官怨是", "普通学生。"], [card.id, book.id],
  ];
  for (const evidence of weak) {
    const item = {...oldItem, evidence};
    const result = A.validate("review", {items:[item]}, {card, book});
    assert.equal(result.items[0].severity, "warn");
    assert.equal(item.severity, "error", "keep the supplied model result intact");
    const historical = {...report, items:[item]};
    assert.equal(R.readable(item, historical, library).severity, "warn");
    assert.equal(R.gradedReport(historical, library).items[0].severity, "warn");
    const html = R.html(historical, library);
    assert.match(html, /class="tag">需要确认</);
    assert.match(html, /0 项模型判为冲突，1 项需要确认/);
  }
  const one = {...oldItem, evidence:[statement], sources:[{target:"character", id:card.id, field:"description", quote:statement}]};
  assert.equal(A.validate("review",{items:[one]}, {card, book}).items[0].severity, "warn");
  const ambiguous = {...card, scenario:card.description};
  const item = {...oldItem, place:"未指明栏位", evidence:card.description.split("\n")};
  assert.equal(A.validate("review", {items:[item]}, {card:ambiguous}).items[0].severity,"warn");
});
test("two independently located passages can be in separate fields or in one field", () => {
  for (const evidence of [[card.description.split("\n")[1], book.entries[0].content], card.description.split("\n")]) {
    const item={...oldItem, evidence};
    assert.equal(A.validate("review",{items:[item]}, {card,book}).items[0].severity,"error");
    assert.equal(R.gradedReport({...report, items:[item]}, {characters:[],worldBooks:[]}).items[0].severity,"error");
    assert.match(R.html({...report, items:[item]}, library),/class="tag">模型判为冲突</);
  }
  const item={...oldItem,evidence:[card.description.split("\n")[0],book.entries[0].content]};
  assert.equal(R.gradedReport({cardId:card.id,bookId:book.id,entryIds:[],items:[item]},library).items[0].severity,"warn");
});
console.log(`${total} readable report checks passed`);
