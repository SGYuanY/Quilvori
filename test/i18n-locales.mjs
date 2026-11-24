import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const storage = new Map();
const doc = {
  documentElement: { lang: "", style: { setProperty() {} }, dataset: {} },
  querySelectorAll: () => [],
};
const context = vm.createContext({
  console,
  JSON,
  WeakMap,
  document: doc,
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  },
});
for (const file of [
  "i18n",
  "ui-phrases",
  "ui-workflow-phrases",
  "locales-ru-ko-th",
  "workspace-phrases",
  "organize-phrases",
])
  vm.runInContext(
    fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), "utf8"),
    context,
    { filename: file },
  );
const I = context.TAI18n,
  catalog = I.catalog();
const tokens = (value) =>
  [...value.matchAll(/\{\{[^{}]+\}\}|\{[A-Za-z_][A-Za-z0-9_]*\}/g)]
    .map((match) => match[0])
    .sort();
let total = 0;
const test = (name, fn) => {
  fn();
  total++;
  console.log("ok", name);
};
test("all interface catalog entries have Russian, Korean and Thai translations", () => {
  for (const lang of ["ru", "ko", "th"])
    for (const [kind, items] of Object.entries(catalog))
      for (const [key, row] of Object.entries(items)) {
        assert.ok(
          typeof row[lang] === "string" && row[lang].trim(),
          `${lang}: ${kind}/${key}`,
        );
        assert.deepEqual(
          tokens(row[lang]),
          tokens(kind === "templates" ? row.en || row.zh : key),
          `${lang}: placeholder mismatch in ${key}`,
        );
      }
});
test("all six locale choices update the document language and persist", () => {
  for (const lang of ["zh", "en", "ja", "ru", "ko", "th"]) {
    I.save({ lang });
    assert.equal(doc.documentElement.lang, lang === "zh" ? "zh-CN" : lang);
    assert.equal(I.load().lang, lang);
  }
  I.save({ lang: "unknown" });
  assert.equal(I.prefs.lang, "zh");
});
test("adding languages retains the existing English and Japanese translations", () => {
  I.save({ lang: "en" });
  assert.equal(I.t("设置"), "Settings");
  I.save({ lang: "ja" });
  assert.equal(I.t("设置"), "設定");
  I.save({ lang: "ru" });
  assert.equal(I.t("设置"), "Настройки");
  I.save({ lang: "ko" });
  assert.equal(I.t("设置"), "설정");
  I.save({ lang: "th" });
  assert.equal(I.t("设置"), "การตั้งค่า");
});
test("parameterized messages are filled correctly in each new language", () => {
  for (const lang of ["ru", "ko", "th"]) {
    I.save({ lang });
    const text = I.t("creation.adopted", { count: 3 });
    assert.ok(text.includes("3"));
    assert.ok(!text.includes("{count}"));
  }
});
test("folder read results show translated counts in every language", () => {
  for (const lang of ["zh", "en", "ja", "ru", "ko", "th"]) {
    I.save({ lang });
    const text = I.t("folder.readResult", { cards: 30, books: 17, unchanged: 1 });
    assert.ok(text.includes("30") && text.includes("17") && text.includes("1"));
    assert.ok(!text.includes("folder.readResult") && !text.includes("{cards}"));
  }
});
class Input {
  constructor(tag, value) {
    this.nodeType = 1;
    this.tag = tag;
    this.value = value;
    this.childNodes = [];
    this.attributes = {};
    this.dataset = { live: "true" };
  }
  closest() {
    return null;
  }
  getAttribute(name) {
    return this.attributes[name] || null;
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  matches(selector) {
    return selector.split(",").some((part) => part.trim() === this.tag);
  }
}
test("switching languages never rewrites authored input or textarea values", () => {
  for (const lang of ["ru", "ko", "th", "zh"])
    for (const tag of ["input", "textarea"]) {
      const element = new Input(tag, "设置");
      I.save({ lang });
      I.localize(element);
      assert.equal(element.value, "设置");
    }
});
console.log(
  `${total} locale checks passed; ${Object.keys(catalog.phrases).length} phrases and ${Object.keys(catalog.templates).length} templates`,
);
