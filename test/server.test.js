const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { createApp, validateServerConfig } = require("../src/server");
const { updateSkillMemory } = require("../src/skillMemory");

let server;
let baseUrl;
let tempDataDir;
let previousDataDir;
let previousAllowRemoteUnsafe;

before(async () => {
  previousDataDir = process.env.DATA_DIR;
  previousAllowRemoteUnsafe = process.env.ALLOW_REMOTE_UNSAFE;
  tempDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tradesites-sales-trainer-test-"));
  process.env.DATA_DIR = tempDataDir;
  const app = createApp({ authRequired: false });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  if (previousDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = previousDataDir;
  }
  if (previousAllowRemoteUnsafe === undefined) {
    delete process.env.ALLOW_REMOTE_UNSAFE;
  } else {
    process.env.ALLOW_REMOTE_UNSAFE = previousAllowRemoteUnsafe;
  }
  await fs.rm(tempDataDir, { recursive: true, force: true });
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

test("serves scenarios and health", async () => {
  const health = await request("/api/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.auth.required, false);
  assert.equal(health.body.auth.signupEnabled, false);
  assert.equal(health.body.auth.signupMode, "disabled");
  assert.equal(health.body.auth.pocketBaseUrl, undefined);

  const scenarios = await request("/api/scenarios");
  assert.equal(scenarios.response.status, 200);
  assert.ok(scenarios.body.scenarios.length >= 1);
});

test("serves public home page", async () => {
  const response = await fetch(`${baseUrl}/`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /Commercial Contractor Sales Trainer/);
  assert.match(body, /free, open-source/i);

  const app = await fetch(`${baseUrl}/app`);
  const appBody = await app.text();
  assert.equal(app.status, 200);
  assert.match(appBody, /Tradesites AI Sales Trainer/);
  assert.match(appBody, /Create Account/);
});

test("typed call happy path persists turns and scores", async () => {
  const created = await request("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ scenarioId: "roofing-owner" }),
  });
  assert.equal(created.response.status, 201);
  const sessionId = created.body.session.id;
  assert.equal(created.body.session.repId, "local");
  assert.equal(created.body.session.turns.length, 1);
  assert.equal(created.body.session.turns[0].role, "persona");

  const message = await request(`/api/sessions/${sessionId}/message`, {
    method: "POST",
    body: JSON.stringify({
      text: "Quick question, how are you currently getting roofing leads from Google reviews?",
    }),
  });
  assert.equal(message.response.status, 200);
  assert.equal(message.body.session.turns.length, 3);
  assert.equal(message.body.session.turns[1].role, "user");
  assert.equal(message.body.session.turns[2].role, "persona");

  const ended = await request(`/api/sessions/${sessionId}/end`, { method: "POST" });
  assert.equal(ended.response.status, 200);
  assert.equal(ended.body.session.status, "ended");
  assert.equal(typeof ended.body.session.evaluation.overallScore, "number");
  assert.equal(typeof ended.body.session.assignedDrill.skill, "string");
  assert.ok("helpAccuracy" in ended.body.session.evaluation);

  const loaded = await request(`/api/sessions/${sessionId}`);
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.session.turns.length, 3);
  assert.equal(loaded.body.session.assignedDrill.skill, ended.body.session.assignedDrill.skill);

  const sessionFile = path.join(tempDataDir, "sessions", `${sessionId}.json`);
  await assert.doesNotReject(() => fs.access(sessionFile));
  await assert.doesNotReject(() => fs.access(path.join(tempDataDir, "skill-memory.json")));
});

test("enterprise call persists objection metadata and returns coaching", async () => {
  const created = await request("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ scenarioId: "enterprise-commercial-solar" }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.session.state.stage, "opener");

  const message = await request(`/api/sessions/${created.body.session.id}/message`, {
    method: "POST",
    body: JSON.stringify({
      text: "It is James from Solar Future Scotland. Can I take 20 seconds?",
    }),
  });
  assert.equal(message.response.status, 200);
  assert.equal(message.body.reply.role, "persona");
  assert.equal(typeof message.body.reply.objectionId, "string");
  assert.equal(message.body.session.state.objectionsUsed.length, 1);

  const hiddenCoaching = await request(`/api/sessions/${created.body.session.id}/coach`, {
    method: "POST",
  });
  assert.equal(hiddenCoaching.response.status, 200);
  assert.equal(hiddenCoaching.body.suggestion.suggestionHidden, true);
  assert.ok(Array.isArray(hiddenCoaching.body.suggestion.moves));
  assert.equal(hiddenCoaching.body.suggestion.tryThis, undefined);

  const coaching = await request(`/api/sessions/${created.body.session.id}/coach`, {
    method: "POST",
    body: JSON.stringify({ selectedMove: "clarify" }),
  });
  assert.equal(coaching.response.status, 200);
  assert.equal(coaching.body.suggestion.objectionId, message.body.reply.objectionId);
  assert.ok(Array.isArray(coaching.body.suggestion.suggestions));
  assert.match(coaching.body.suggestion.tryThis, /\w+/);
  assert.equal(typeof coaching.body.suggestion.approvedExample?.text, "string");
  assert.equal(coaching.body.session.helpAttempts.length, 1);
  assert.equal(coaching.body.session.turns.length, 3);
});

test("first-turn flow guard preserves normal conversation state", async () => {
  const created = await request("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ scenarioId: "commercial-solar-rejection" }),
  });
  assert.equal(created.response.status, 201);

  const message = await request(`/api/sessions/${created.body.session.id}/message`, {
    method: "POST",
    body: JSON.stringify({ text: "hey this is James" }),
  });

  assert.equal(message.response.status, 200);
  assert.equal(message.body.reply.provider, "flow_guard");
  assert.equal(message.body.reply.flowGuard, "missing_call_context");
  assert.match(message.body.reply.text, /James from where|what is this about/i);
  assert.doesNotMatch(message.body.reply.text, /tried something like that/i);
  assert.equal(message.body.session.turns[2].flowGuard, "missing_call_context");
});

test("empty message is rejected", async () => {
  const reply = await request("/api/reply", {
    method: "POST",
    body: JSON.stringify({ text: "" }),
  });
  assert.equal(reply.response.status, 400);
  assert.equal(reply.body.error, "Message text is required");
  assert.equal(reply.body.code, "message_required");
  assert.equal(typeof reply.body.requestId, "string");
});

test("stateless scoring handles empty transcript", async () => {
  const scored = await request("/api/score", {
    method: "POST",
    body: JSON.stringify({ scenarioId: "roofing-owner", turns: [] }),
  });
  assert.equal(scored.response.status, 200);
  assert.equal(typeof scored.body.evaluation.overallScore, "number");
});

test("due drill endpoint returns deterministic due drills", async () => {
  await updateSkillMemory({
    session: { id: "due-session" },
    evaluation: { skillScores: { schemaVersion: 1, hard_no_clean_exit: 4 } },
    now: new Date("2026-05-19T10:00:00.000Z"),
  });

  const due = await request("/api/drills/due?now=2026-05-20T10:00:00.000Z");
  assert.equal(due.response.status, 200);
  assert.equal(due.body.drills[0].skill, "hard_no_clean_exit");
  assert.match(due.body.drills[0].reason, /4\/10/);
});

test("gauntlet session persists round results and summary", async () => {
  const created = await request("/api/gauntlets", {
    method: "POST",
    body: JSON.stringify({ rounds: 3 }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.session.gauntlet.plan.rounds.length, 3);
  assert.equal(created.body.session.turns[0].role, "persona");

  let current = created.body.session;
  for (let index = 0; index < 3; index += 1) {
    const round = await request(`/api/gauntlets/${current.id}/round`, {
      method: "POST",
      body: JSON.stringify({
        text: "Fair point. Can I ask one quick question so I route this properly?",
      }),
    });
    assert.equal(round.response.status, 200);
    current = round.body.session;
  }

  assert.equal(current.status, "ended");
  assert.equal(current.gauntlet.results.length, 3);
  assert.equal(typeof current.gauntlet.summary.weakestFamily, "string");
});

test("review queue endpoint and coach notes preserve transcript", async () => {
  const created = await request("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ scenarioId: "commercial-solar-rejection" }),
  });
  const sessionId = created.body.session.id;
  await request(`/api/sessions/${sessionId}/message`, {
    method: "POST",
    body: JSON.stringify({ text: "Calling about solar." }),
  });
  await request(`/api/sessions/${sessionId}/end`, { method: "POST" });

  const note = await request(`/api/sessions/${sessionId}/coach-notes`, {
    method: "POST",
    body: JSON.stringify({ note: "Review hard-no exit." }),
  });
  assert.equal(note.response.status, 200);
  assert.equal(note.body.session.coachNotes.length, 1);
  assert.equal(note.body.session.turns.length, 3);

  const queue = await request("/api/review-queue");
  assert.equal(queue.response.status, 200);
  assert.ok(Array.isArray(queue.body.queue));
  assert.ok(Array.isArray(queue.body.skillTrends));
});

test("user-marked review requests appear in review queue", async () => {
  const created = await request("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ scenarioId: "enterprise-commercial-solar" }),
  });
  await request(`/api/sessions/${created.body.session.id}/review-request`, { method: "POST" });
  await request(`/api/sessions/${created.body.session.id}/end`, { method: "POST" });

  const queue = await request("/api/review-queue");
  const item = queue.body.queue.find((entry) => entry.sessionId === created.body.session.id);
  assert.ok(item);
  assert.ok(item.reasons.includes("user_marked_review"));
});

test("server errors are sanitized for the browser", async () => {
  const response = await request("/api/sessions/bad$id");
  assert.equal(response.response.status, 400);
  assert.deepEqual(Object.keys(response.body).sort(), ["code", "error", "requestId"]);
  assert.equal(response.body.error, "Bad request");
  assert.equal(response.body.code, "invalid_session_id");
  assert.equal(typeof response.body.requestId, "string");
});

test("provider stderr is not returned to the browser", async () => {
  const previousCommand = process.env.CODEX_BRAIN_COMMAND;
  const previousOpenClawUrl = process.env.OPENCLAW_GATEWAY_URL;
  process.env.CODEX_BRAIN_COMMAND = JSON.stringify([
    process.execPath,
    "-e",
    "console.error('SECRET_PROVIDER_DETAIL'); process.exit(2)",
  ]);
  delete process.env.OPENCLAW_GATEWAY_URL;
  try {
    const reply = await request("/api/reply", {
      method: "POST",
      body: JSON.stringify({
        scenarioId: "roofing-owner",
        text: "Can I ask about your reviews?",
      }),
    });
    assert.equal(reply.response.status, 200);
    assert.doesNotMatch(JSON.stringify(reply.body), /SECRET_PROVIDER_DETAIL/);
    assert.equal(reply.body.reply.warningCode, "command_unavailable");
  } finally {
    if (previousCommand === undefined) {
      delete process.env.CODEX_BRAIN_COMMAND;
    } else {
      process.env.CODEX_BRAIN_COMMAND = previousCommand;
    }
    if (previousOpenClawUrl === undefined) {
      delete process.env.OPENCLAW_GATEWAY_URL;
    } else {
      process.env.OPENCLAW_GATEWAY_URL = previousOpenClawUrl;
    }
  }
});

test("remote binding requires explicit unsafe opt-in", () => {
  delete process.env.ALLOW_REMOTE_UNSAFE;
  assert.doesNotThrow(() => validateServerConfig({ host: "127.0.0.1" }));
  assert.throws(
    () => validateServerConfig({ host: "0.0.0.0" }),
    /ALLOW_REMOTE_UNSAFE=1/,
  );
  process.env.ALLOW_REMOTE_UNSAFE = "1";
  assert.doesNotThrow(() => validateServerConfig({ host: "0.0.0.0" }));
});
