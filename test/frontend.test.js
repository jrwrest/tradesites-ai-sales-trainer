const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");

test("mic transcription does not auto-submit on speech result", async () => {
  const appJs = await fs.readFile(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const setupSpeech = appJs.slice(appJs.indexOf("function setupSpeech()"), appJs.indexOf("async function startCall()"));

  assert.match(setupSpeech, /recognition\.continuous = true/);
  assert.match(setupSpeech, /recognition\.interimResults = true/);
  assert.doesNotMatch(setupSpeech, /submitMessage\(\)/);
  assert.match(setupSpeech, /Press Send/);
});
