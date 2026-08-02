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

test("score card prioritizes the source-grounded method drill and confidence", async () => {
  const appJs = await fs.readFile(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const renderScore = appJs.slice(appJs.indexOf("function renderScore("), appJs.indexOf("function renderCoaching("));

  assert.ok(renderScore.indexOf("state.session?.methodDrill") < renderScore.indexOf("evaluation.assignedDrill"));
  assert.match(renderScore, /methodEvaluation\?\.overallConfidence/);
  assert.match(renderScore, /criticalGates/);
  assert.match(renderScore, /drill\?\.behaviorId/);
});

test("Profile loads the method registry and submits a coaching method selector", async () => {
  const appJs = await fs.readFile(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const renderProfile = appJs.slice(
    appJs.indexOf("function renderProfile("),
    appJs.indexOf("function updateTimer()"),
  );

  assert.match(appJs, /api\("\/api\/methods"\)/);
  assert.match(renderProfile, /coachingMethodId/);
  assert.match(renderProfile, /Coaching method/);
  assert.match(renderProfile, /document\.createElement\("select"\)/);
});

test("Profile save is single-flight and keeps accessible inline feedback in the existing form", async () => {
  const appJs = await fs.readFile(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const renderProfile = appJs.slice(
    appJs.indexOf("function renderProfile("),
    appJs.indexOf("function updateTimer()"),
  );
  const submitHandler = renderProfile.slice(renderProfile.indexOf('form.addEventListener("submit"'));
  const dataIndex = submitHandler.indexOf("new FormData(form)");
  const disabledIndex = submitHandler.indexOf("button.disabled = true");
  const savingIndex = submitHandler.indexOf('button.textContent = "Saving..."');
  const apiIndex = submitHandler.indexOf('await api("/api/profile"');
  const savedIndex = submitHandler.indexOf('profileSaveStatus.textContent = "Profile saved."');

  assert.match(renderProfile, /className = "profile-save-status"/);
  assert.match(renderProfile, /setAttribute\("role", "status"\)/);
  assert.match(renderProfile, /setAttribute\("aria-live", "polite"\)/);
  assert.match(renderProfile, /setAttribute\("aria-atomic", "true"\)/);
  assert.match(submitHandler, /if \(button\.disabled\) return/);
  assert.ok(dataIndex !== -1 && dataIndex < disabledIndex);
  assert.ok(disabledIndex !== -1 && disabledIndex < apiIndex);
  assert.ok(savingIndex !== -1 && savingIndex < apiIndex);
  assert.ok(apiIndex !== -1 && apiIndex < savedIndex);
  assert.doesNotMatch(submitHandler, /renderProfile\(payload\.profile\)/);
  assert.match(submitHandler, /control\.disabled = true/);
  assert.match(submitHandler, /control\.disabled = false/);
  assert.match(submitHandler, /confirmation\.disabled = true/);
  assert.match(submitHandler, /deleteButton\.disabled = true/);
  assert.match(submitHandler, /form\.removeAttribute\("aria-busy"\)/);
  assert.match(renderProfile, /profileSaveStatus\.textContent = "Unsaved changes\."/);
  assert.match(submitHandler, /profileSaveStatus\.setAttribute\("role", "alert"\)/);
  assert.match(renderProfile, /if \(state\.waiting\) return;[\s\S]*state\.waiting = true;[\s\S]*api\("\/api\/account-data"/);
});

test("completed gauntlets render the pinned method evaluation and drill", async () => {
  const appJs = await fs.readFile(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const submitMessage = appJs.slice(
    appJs.indexOf("async function submitMessage()"),
    appJs.indexOf("async function endCall()"),
  );

  assert.match(submitMessage, /renderScore\(state\.session\.evaluation\)/);
  assert.doesNotMatch(submitMessage, /recommendedDrill: `Repeat the gauntlet/);
});

test("score card explains supervised-live-call readiness and remaining gates", async () => {
  const appJs = await fs.readFile(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const renderScore = appJs.slice(appJs.indexOf("function renderScore("), appJs.indexOf("function renderCoaching("));

  assert.match(renderScore, /evaluation\.readiness/);
  assert.match(renderScore, /Ready for a supervised live call/);
  assert.match(renderScore, /Practice required/);
  assert.match(renderScore, /scenario_family_coverage/);
  assert.match(renderScore, /ethical_gates/);
  assert.match(renderScore, /realistic_call_score_floor/);
  assert.match(renderScore, /multi_call_consistency/);
  assert.match(renderScore, /typed practice does not prove live vocal delivery/i);
});
