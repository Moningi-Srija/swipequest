const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function fakeNode() {
  return {
    value: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    open: false,
    dataset: {},
    files: [],
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener() {},
    querySelector() { return fakeNode(); },
    querySelectorAll() { return []; },
    showModal() { this.open = true; },
    close() { this.open = false; },
    reset() {},
    focus() {},
    click() {},
  };
}

const nodes = new Map();
const windowListeners = new Map();
const storageWrites = [];
const document = {
  documentElement: fakeNode(),
  querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, fakeNode());
    return nodes.get(selector);
  },
  querySelectorAll() { return []; },
  addEventListener() {},
};

const context = {
  console,
  document,
  localStorage: {
    getItem() { return null; },
    setItem(key, value) { storageWrites.push([key, value]); },
  },
  crypto: webcrypto,
  TextEncoder,
  Blob,
  URL: { createObjectURL() { return "blob:test"; }, revokeObjectURL() {} },
  Intl,
  Date,
  Math,
  JSON,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
};

context.window = {
  TextEncoder,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  scrollTo() {},
  addEventListener(type, listener) { windowListeners.set(type, listener); },
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8"), context);

context.applyTheme("after-dark", false);
assert.equal(document.documentElement.dataset.theme, "after-dark");
assert.equal(nodes.get("#themeColor").content, "#141315");
assert.equal(nodes.get("#themeToggle").attributes["aria-pressed"], "true");
context.applyTheme("not-a-real-theme", false);
assert.equal(document.documentElement.dataset.theme, "cherry-editorial");
context.applyTheme("after-dark");
assert.deepEqual(storageWrites.at(-1), ["swipequest-theme-v1", "after-dark"]);
context.toggleTheme();
assert.deepEqual(storageWrites.at(-1), ["swipequest-theme-v1", "cherry-editorial"]);
context.applyTheme("after-dark", false);
windowListeners.get("storage")({ key: null, newValue: null });
assert.equal(document.documentElement.dataset.theme, "cherry-editorial");

const bootstrapDocument = {
  documentElement: { dataset: {} },
  querySelector() { return bootstrapThemeColor; },
};
const bootstrapThemeColor = { content: "" };
const bootstrapContext = {
  document: bootstrapDocument,
  localStorage: { getItem() { return "after-dark"; } },
  Set,
};
vm.createContext(bootstrapContext);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "theme-init.js"), "utf8"), bootstrapContext);
assert.equal(bootstrapDocument.documentElement.dataset.theme, "after-dark");
assert.equal(bootstrapThemeColor.content, "#141315");

const android = context.parseWhatsAppExport(
  "24/03/2026, 15:17 - Me: Finish the ticket\ncontinued note\n24/03/2026, 15:18 - You changed the subject\n24/03/2026, 15:19 - Me: Walk for 30 mins"
);
assert.equal(android.messages.length, 2);
assert.equal(android.systemMessages, 1);
assert.equal(android.messages[0].text, "Finish the ticket\ncontinued note");

const ios = context.parseWhatsAppExport("[24/03/2026, 3:17:02 PM] Me: Study DSA");
assert.equal(ios.messages.length, 1);
assert.equal(ios.messages[0].text, "Study DSA");

assert.equal(context.looksLikeSensitiveMessage("pass" + "word: example-value"), true);
assert.equal(context.looksLikeWhatsAppJunk("<Media omitted>"), true);
assert.equal(context.sanitizeWhatsAppMessage("Book tickets https://example.com/private?q=1"), "Book tickets");
assert.ok(context.scoreWhatsAppTask("I have to finish one CP question") >= 7);
assert.equal(context.inferImportedCategory("Finish the office ticket"), "🛸 Office Grind");
assert.deepEqual(
  Array.from(context.splitWhatsAppChecklist("Tasks\n- Book driving class\n- Finish CP question")),
  ["Book driving class", "Finish CP question"]
);

const normalizedBackup = context.normalizeStoredState({
  version: 1,
  tasks: [{
    id: '\"><img src=x onerror=alert(1)>',
    title: "<img src=x onerror=alert(1)>",
    estimateMinutes: '\"><script>alert(1)</script>',
    status: "unexpected",
  }],
  sessions: [],
});
assert.ok(normalizedBackup.tasks[0].id.startsWith("task-"));
assert.equal(normalizedBackup.tasks[0].estimateMinutes, 60);
assert.equal(normalizedBackup.tasks[0].status, "waiting");
assert.equal(context.escapeHtml(normalizedBackup.tasks[0].title).includes("<img"), false);

console.log("WhatsApp import parser: all checks passed");
