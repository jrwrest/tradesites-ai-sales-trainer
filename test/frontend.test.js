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

test("sending stops the mic, clears composer, and refocuses input", async () => {
  const appJs = await fs.readFile(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const submitMessage = appJs.slice(appJs.indexOf("async function submitMessage()"), appJs.indexOf("async function endCall()"));

  assert.match(appJs, /function stopMic/);
  assert.match(submitMessage, /stopMic\(\{ updateButtons: false \}\)/);
  assert.match(submitMessage, /elements\.messageInput\.value = ""/);
  assert.match(submitMessage, /elements\.messageInput\.focus\(\)/);
});

test("sending shows the rep turn and customer typing bubble before the API returns", async () => {
  const appJs = await fs.readFile(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const submitMessage = appJs.slice(appJs.indexOf("async function submitMessage()"), appJs.indexOf("async function endCall()"));
  const pendingIndex = submitMessage.indexOf("showPendingCustomerReply(text)");
  const apiIndex = submitMessage.indexOf("await api(`/api/sessions/${state.session.id}/message`");

  assert.match(appJs, /pendingTranscriptTurns/);
  assert.match(appJs, /function showPendingCustomerReply/);
  assert.match(appJs, /function clearPendingTranscriptTurns/);
  assert.ok(pendingIndex !== -1);
  assert.ok(apiIndex !== -1);
  assert.ok(pendingIndex < apiIndex);
  const styles = await fs.readFile(path.join(__dirname, "..", "public", "styles.css"), "utf8");
  assert.match(styles, /\.turn\.typing/);
});

test("mic button lives beside send as an icon control", async () => {
  const indexHtml = await fs.readFile(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const composer = indexHtml.slice(indexHtml.indexOf('<form class="composer"'), indexHtml.indexOf("</form>", indexHtml.indexOf('<form class="composer"')));
  const controls = indexHtml.slice(indexHtml.indexOf('<div class="controls"'), indexHtml.indexOf("</div>", indexHtml.indexOf('<div class="controls"')));

  assert.match(composer, /id="micBtn"/);
  assert.match(composer, /class="icon-button"/);
  assert.match(composer, /aria-label="Start microphone"/);
  assert.match(composer, /id="sendBtn"/);
  assert.ok(composer.indexOf('id="micBtn"') < composer.indexOf('id="sendBtn"'));
  assert.doesNotMatch(controls, /id="micBtn"/);
});
