import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const localeSources = [
  "i18n",
  "ui-phrases",
  "ui-workflow-phrases",
  "locales-ru-ko-th",
  "workspace-phrases",
  "organize-phrases",
  "link-import-phrases",
  "resource-phrases",
  "workshop-phrases",
  "context-phrases",
  "search-phrases",
  "bundle-phrases",
  "collection-controls-phrases",
  "model-status-phrases",
  "authoring-phrases",
  "journal-phrases",
  "dialogue-phrases",
  "recovery-phrases",
  "theme-phrases",
  "theme-st-phrases",
  "integrity-phrases",
].map((file) => [file, fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), "utf8")]);
function startup(saved, unavailable = false) {
  const storage = new Map(), reads = [], writes = [];
  if (saved !== undefined) storage.set("nijan-ui", saved);
  const doc = {
    documentElement: { lang: "", style: { setProperty() {} }, dataset: {} },
    querySelectorAll: () => [],
  };
  const context = vm.createContext({
    console, JSON, WeakMap, document: doc,
    localStorage: {
      getItem(key) {
        reads.push(key);
        if (unavailable) throw new Error("Storage is unavailable");
        return storage.get(key) ?? null;
      },
      setItem(key, value) { writes.push([key, value]); storage.set(key, value); },
    },
  });
  for (const [file, source] of localeSources)
    vm.runInContext(source, context, { filename: file });
  return { context, storage, doc, reads, writes };
}
const { context, doc } = startup();
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

test("first launch and missing language use English without writing settings or reading library data", () => {
  for (const saved of [undefined, "", "{}", '{"teach":false,"scale":1.2}']) {
    const env = startup(saved), locale = env.context.TAI18n;
    assert.equal(locale.prefs.lang, "en");
    assert.equal(locale.t("设置"), "Settings");
    assert.equal(env.doc.documentElement.lang, "en");
    assert.equal(env.doc.title, "Quilvori");
    assert.deepEqual(env.writes, []);
    assert.deepEqual(env.reads, ["nijan-ui"]);
    assert.equal(env.storage.get("nijan-ui"), saved);
    if (saved?.includes("teach")) {
      assert.equal(locale.prefs.teach, false);
      assert.equal(locale.prefs.scale, 1.2);
    }
  }
});

test("malformed or unavailable stored preferences recover to English", () => {
  for (const saved of ["{", "null", "true", "42", '"zh"', '["zh"]']) {
    const env = startup(saved);
    assert.equal(env.context.TAI18n.prefs.lang, "en");
    assert.equal(env.context.TAI18n.prefs.teach, true);
    assert.equal(env.doc.documentElement.lang, "en");
    assert.ok(!Object.hasOwn(env.context.TAI18n.prefs, "0"));
    assert.deepEqual(env.writes, []);
    assert.equal(env.storage.get("nijan-ui"), saved);
  }
  const env = startup(undefined, true);
  assert.equal(env.context.TAI18n.prefs.lang, "en");
  assert.equal(env.doc.documentElement.lang, "en");
  assert.deepEqual(env.writes, []);
});

test("invalid or inherited language names cannot bypass the English fallback", () => {
  for (const lang of ["unknown", "", "__proto__", "constructor", "toString", null, 1, ["zh"], { code: "zh" }]) {
    const saved = JSON.stringify({ lang, teach: false, density: "compact" });
    const env = startup(saved), locale = env.context.TAI18n;
    assert.equal(locale.prefs.lang, "en");
    assert.equal(locale.t("设置"), "Settings");
    assert.equal(locale.prefs.teach, false);
    assert.equal(locale.prefs.density, "compact");
    assert.equal(env.doc.documentElement.lang, "en");
    assert.deepEqual(env.writes, []);
    assert.equal(env.storage.get("nijan-ui"), saved);
  }
  const env = startup('{"__proto__":{"lang":"zh","teach":false}}');
  assert.equal(env.context.TAI18n.prefs.lang, "en");
  assert.equal(env.context.TAI18n.prefs.teach, true);
  assert.ok(!Object.hasOwn(Object.getPrototypeOf(env.context.TAI18n.prefs), "lang"));
});

test("startup retains each explicit saved language and other preferences without migration", () => {
  const labels = { zh: "设置", en: "Settings", ja: "設定", ru: "Настройки", ko: "설정", th: "การตั้งค่า" };
  for (const [lang, label] of Object.entries(labels)) {
    const saved = JSON.stringify({ lang, teach: false, scale: 1.2, density: "compact", replyChars: 1200 });
    const env = startup(saved), locale = env.context.TAI18n;
    assert.equal(locale.prefs.lang, lang);
    assert.equal(locale.t("设置"), label);
    assert.equal(locale.prefs.teach, false);
    assert.equal(locale.prefs.scale, 1.2);
    assert.equal(locale.prefs.density, "compact");
    assert.equal(locale.prefs.replyChars, 1200);
    assert.equal(env.doc.documentElement.lang, lang === "zh" ? "zh-CN" : lang);
    assert.deepEqual(env.writes, []);
    assert.deepEqual(env.reads, ["nijan-ui"]);
    assert.equal(env.storage.get("nijan-ui"), saved);
  }
});

test("switching languages keeps both brand names without duplicating either name", () => {
  const env = startup(), primary = { textContent: "" }, secondary = { textContent: "" };
  env.doc.querySelectorAll = (selector) => selector === "[data-product]" ? [primary] : selector === "[data-product-secondary]" ? [secondary] : [];
  for (const lang of ["en", "zh", "ja", "ru", "ko", "th", "zh", "en"]) {
    env.context.TAI18n.save({ lang });
    const chinesePrimary = lang === "zh" || lang === "ja";
    assert.equal(primary.textContent, chinesePrimary ? "叙翎集" : "Quilvori");
    assert.equal(secondary.textContent, chinesePrimary ? "Quilvori" : "叙翎集");
    assert.notEqual(primary.textContent, secondary.textContent);
  }
});

test("entry pages start with an English language, title and JavaScript notice", () => {
  const root = new URL("../", import.meta.url);
  const pages = fs.readdirSync(root).filter((name) => name.endsWith(".html"));
  assert.ok(pages.length);
  for (const page of pages) {
    const html = fs.readFileSync(new URL(page, root), "utf8");
    assert.match(html, /<html lang="en">/, page);
    assert.match(html, /<title>Quilvori<\/title>/, page);
    assert.match(html, /<noscript><p>Quilvori requires JavaScript\./, page);
  }
});

test("English startup mounts the application shell and reaches the initial view", () => {
  const env = startup(), elements = new Map();
  const element = (key) => {
    if (!elements.has(key)) elements.set(key, {
      innerHTML: "", textContent: "", dataset: {}, parentElement: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener() {}, querySelectorAll: () => [],
      querySelector: (selector) => element(`${key} ${selector}`),
    });
    return elements.get(key);
  };
  env.doc.getElementById = (id) => element(`#${id}`);
  env.doc.querySelector = element;
  env.doc.body = element("body");
  env.context.window = { addEventListener() {} };
  env.context.location = { hash: "#home" };
  env.context.TAStore = {
    load: () => ({ library: { themes: [], characters: [], worldBooks: [], assets: [] }, persistent: true, fresh: false }),
    save: () => { throw new Error("Mounting an existing library must not save it"); },
  };
  for (const file of ["room-theme", "ui"])
    vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), "utf8"), env.context, { filename: file });
  let renders = 0;
  assert.doesNotThrow(() => env.context.TAUI.mount({ home(stage) { renders++; stage.innerHTML = "Ready"; } }));
  assert.equal(renders, 1);
  assert.equal(element("#stage").innerHTML, "Ready");
  assert.match(element("#app").innerHTML, /title="Search or jump to · Ctrl\+K"/);
  assert.match(element("#app").innerHTML, /aria-label="Search or jump to"/);
});
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
  assert.equal(I.prefs.lang, "en");
});

test("saving invalid languages uses English while malformed patches preserve a saved locale", () => {
  for (const lang of ["__proto__", "constructor", "toString", null, ["zh"]]) {
    I.save({ lang });
    assert.equal(I.prefs.lang, "en");
    assert.equal(I.load().lang, "en");
    assert.equal(doc.documentElement.lang, "en");
  }
  I.save({ lang: "ru" });
  for (const patch of [null, "zh", 1, ["zh"], Object.create({ lang: "zh" })]) {
    I.save(patch);
    assert.equal(I.prefs.lang, "ru");
    assert.equal(I.load().lang, "ru");
  }
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
  for (const lang of ["en", "ja", "ru", "ko", "th", "zh"])
    for (const tag of ["input", "textarea"]) {
      const element = new Input(tag, "设置");
      I.save({ lang });
      I.localize(element);
      assert.equal(element.value, "设置");
    }
});
test("English startup translates interface labels while leaving marked author text unchanged", () => {
  const locale = startup().context.TAI18n;
  const authored = new Input("div", "");
  const content = { nodeType: 3, nodeValue: "设置" };
  authored.closest = (selector) => selector === "[data-no-translate]" ? authored : null;
  authored.childNodes = [content];
  locale.localize(authored);
  assert.equal(content.nodeValue, "设置");
  const label = new Input("label", "");
  const labelText = { nodeType: 3, nodeValue: "设置" };
  label.childNodes = [labelText];
  locale.localize(label);
  assert.equal(labelText.nodeValue, "Settings");
});
console.log(
  `${total} locale checks passed; ${Object.keys(catalog.phrases).length} phrases and ${Object.keys(catalog.templates).length} templates`,
);
