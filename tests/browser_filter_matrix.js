"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function loadScript(file) {
  const sandbox = {
    console,
    setInterval() {
      return 0;
    },
    clearInterval() {},
    setTimeout() {
      return 0;
    },
    MutationObserver: function MutationObserver() {},
    Notification: function Notification() {},
    GM_getValue() {
      return null;
    },
    GM_setValue() {},
    GM_xmlhttpRequest() {},
    chrome: {
      runtime: {
        sendMessage: async () => null,
        getURL: (resource) => resource,
        onMessage: { addListener() {} },
      },
    },
    document: {
      title: "",
      body: {},
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, parentNode: null }),
      createTextNode: () => ({}),
    },
    window: {
      location: { href: "https://example.test/page", hostname: "example.test" },
      getSelection: () => ({ toString: () => "" }),
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  return sandbox;
}

function assertMatrix(api, label) {
  const entries = [
    { kind: "channel", value: "@SlopChannel" },
    { kind: "channel", value: "UCabcdefghijklmnopqrstuv" },
    { kind: "artist", value: "AI Music Bot" },
    { kind: "artist", value: "ai" },
    { kind: "keyword", value: "slop" },
    { kind: "keyword", value: "ai" },
  ];
  if (typeof api.buildLookupIndexes === "function") {
    api.buildLookupIndexes(entries);
  }

  const channel = (value) => api.isChannelBlocked(value, entries);
  const artist = (value) => api.isArtistBlocked(value, entries);
  const title = (value) => api.isTitleBlocked(value, entries);

  assert.strictEqual(channel("@slopchannel"), true, `${label} handle casefold`);
  assert.strictEqual(channel("@SlopChannel-extra"), false, `${label} handle is not a prefix`);
  assert.strictEqual(channel("@name"), false, `${label} different handle`);
  assert.strictEqual(channel("UCabcdefghijklmnopqrstuv"), true, `${label} channel id`);
  assert.strictEqual(channel("UCabcdefghijklmnopqrstuV"), true, `${label} channel id casefold`);
  assert.strictEqual(channel("AI Music Bot - Topic"), true, `${label} topic channel uses artist entry`);
  assert.strictEqual(channel(""), false, `${label} empty channel`);
  assert.strictEqual(channel(null), false, `${label} null channel`);

  assert.strictEqual(artist("AI Music Bot"), true, `${label} artist exact`);
  assert.strictEqual(artist("ai"), true, `${label} short artist exact`);
  assert.strictEqual(artist("rain"), false, `${label} artist substring rain/ai`);
  assert.strictEqual(artist("wait"), false, `${label} artist substring wait/ai`);
  assert.strictEqual(artist("the AI Music Bot orchestra"), false, `${label} artist is not contained`);
  assert.strictEqual(artist("AI Music Bot - Topic"), true, `${label} topic variant`);
  assert.strictEqual(artist("AI Music Bot VEVO"), true, `${label} vevo variant`);
  assert.strictEqual(artist("AI Music Bot - Topic VEVO"), true, `${label} topic vevo variant`);
  assert.strictEqual(artist("@SlopChannel"), true, `${label} handle checked as artist text`);
  assert.strictEqual(artist(""), false, `${label} empty artist`);
  assert.strictEqual(artist(null), false, `${label} null artist`);

  assert.strictEqual(title("midnight slop session"), true, `${label} keyword`);
  assert.strictEqual(title("nightslop radio"), true, `${label} keyword substring`);
  assert.strictEqual(title("daily ai mixes"), false, `${label} short keyword ignored`);
  assert.strictEqual(title("slow jam"), false, `${label} non-matching keyword`);
  assert.strictEqual(title(""), false, `${label} empty title`);
  assert.strictEqual(title(null), false, `${label} null title`);
}

const surfaces = [
  "src/userscript.js",
  "build/chrome/content.js",
  "build/firefox/content.js",
];

for (const rel of surfaces) {
  assertMatrix(loadScript(path.join(root, rel)), rel);
}

console.log(`browser filter matrix ok (${surfaces.length} surfaces)`);
