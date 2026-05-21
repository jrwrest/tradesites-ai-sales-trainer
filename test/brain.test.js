const assert = require("node:assert/strict");
const { test, beforeEach, afterEach } = require("node:test");
const { generateCustomerReply, parseCommandLine } = require("../src/brain");
const { getScenario } = require("../src/scenarios");

function clearBrainEnv() {
  delete process.env.CODEX_BRAIN_COMMAND;
  delete process.env.BRAIN_TIMEOUT_MS;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_TIMEOUT_MS;
}

beforeEach(clearBrainEnv);
afterEach(clearBrainEnv);

const scenario = getScenario("roofing-owner");
const enterpriseScenario = getScenario("enterprise-commercial-solar");
const hardRejectionScenario = getScenario("commercial-solar-rejection");

function session(turns = []) {
  return {
    id: "test",
    scenarioId: scenario.id,
    turns,
  };
}

test("mock brain returns deterministic persona reply", async () => {
  const reply = await generateCustomerReply({
    scenario,
    session: session(),
    repMessage: "Hello",
  });
  assert.equal(reply.provider, "mock");
  assert.match(reply.text, /Sarah Mitchell/);
});

test("enterprise brain guards the first identity-only reply before objections", async () => {
  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "enterprise-identity-only",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        { role: "user", text: "hey this is James" },
      ],
    },
    repMessage: "hey this is James",
  });

  assert.equal(reply.provider, "flow_guard");
  assert.equal(reply.flowGuard, "missing_call_context");
  assert.equal(reply.objectionId, "gatekeeper-who-is-this");
  assert.match(reply.text, /from where|what is this about/i);
  assert.doesNotMatch(reply.text, /tried something like that/i);
});

test("hard rejection scenario asks for context after identity-only reply", async () => {
  const reply = await generateCustomerReply({
    scenario: hardRejectionScenario,
    session: {
      id: "sample-foods-identity-only",
      scenarioId: hardRejectionScenario.id,
      turns: [
        { role: "persona", text: hardRejectionScenario.persona.openingLine },
        { role: "user", text: "hey this is James" },
      ],
    },
    repMessage: "hey this is James",
  });

  assert.equal(reply.provider, "flow_guard");
  assert.equal(reply.flowGuard, "missing_call_context");
  assert.match(reply.text, /from where|what is this about/i);
  assert.doesNotMatch(reply.text, /tried something like that/i);
});

test("flow guard bypasses OpenClaw when first reply has no call context", async () => {
  process.env.OPENCLAW_GATEWAY_URL = "ws://127.0.0.1:1";
  process.env.OPENCLAW_GATEWAY_TOKEN = "test-token";

  const reply = await generateCustomerReply({
    scenario: hardRejectionScenario,
    session: {
      id: "sample-foods-openclaw-guard",
      scenarioId: hardRejectionScenario.id,
      turns: [
        { role: "persona", text: hardRejectionScenario.persona.openingLine },
        { role: "user", text: "hey this is James" },
      ],
    },
    repMessage: "hey this is James",
  });

  assert.equal(reply.provider, "flow_guard");
  assert.equal(reply.warning, undefined);
});

test("enterprise mock brain can move to permission objection after call context and permission are stated", async () => {
  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "enterprise-context",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        {
          role: "user",
          text: "Alex from BrightTrade Solar. I am calling about commercial solar. Can I take 20 seconds?",
        },
      ],
    },
    repMessage: "Alex from BrightTrade Solar. I am calling about commercial solar. Can I take 20 seconds?",
  });

  assert.notEqual(reply.objectionId, "gatekeeper-who-is-this");
});

test("energy bill qualifying question receives a relevant customer answer", async () => {
  const reply = await generateCustomerReply({
    scenario: hardRejectionScenario,
    session: {
      id: "sample-foods-electricity-question",
      scenarioId: hardRejectionScenario.id,
      turns: [
        { role: "persona", text: hardRejectionScenario.persona.openingLine },
        { role: "user", text: "Alex from BrightTrade Solar. Calling about commercial solar. Can I take 20 seconds?" },
        { role: "persona", text: "Okay, keep it brief." },
        { role: "user", text: "Okay, so how much is your yearly electrical bill?" },
      ],
    },
    repMessage: "Okay, so how much is your yearly electrical bill?",
  });

  assert.equal(reply.provider, "flow_guard");
  assert.equal(reply.flowGuard, "energy_bill_qualification");
  assert.match(reply.text, /check the exact figure|why do you need/i);
  assert.doesNotMatch(reply.text, /vague marketing pitch/i);
});

test("commercial model explanation does not trigger energy bill qualification answer", async () => {
  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "enterprise-commercial-model-explanation",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        {
          role: "user",
          text: "James from BrightTrade Solar. Calling about funded commercial solar. Can I take 20 seconds?",
        },
        {
          role: "persona",
          text: "No upfront cost usually means the catch shows up later. What is the actual commercial model?",
        },
        {
          role: "user",
          text: "There is no upfront cost if we can validate you have usage for it. You would pay cheaper electricity through the funded route.",
        },
      ],
    },
    repMessage:
      "There is no upfront cost if we can validate you have usage for it. You would pay cheaper electricity through the funded route.",
  });

  assert.notEqual(reply.flowGuard, "energy_bill_qualification");
  assert.doesNotMatch(reply.text, /exact figure|why do you need/i);
});

test("command brain parses valid JSON reply", async () => {
  process.env.CODEX_BRAIN_COMMAND = JSON.stringify([
    process.execPath,
    "-e",
    "process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({reply:'I can spare two minutes.',mood:'busy'})))",
  ]);
  const reply = await generateCustomerReply({
    scenario,
    session: session([{ role: "user", text: "Hi", at: new Date().toISOString() }]),
    repMessage: "Can I ask about your reviews?",
  });
  assert.equal(reply.provider, "command");
  assert.equal(reply.text, "I can spare two minutes.");
});

test("command brain falls back on invalid command", async () => {
  process.env.CODEX_BRAIN_COMMAND = JSON.stringify([process.execPath, "-e", "process.exit(2)"]);
  const reply = await generateCustomerReply({
    scenario,
    session: session([{ role: "persona", text: "Hi", at: new Date().toISOString() }]),
    repMessage: "Can I send you information?",
  });
  assert.equal(reply.provider, "mock");
  assert.equal(reply.warning, "AI provider unavailable; using mock customer.");
  assert.equal(reply.warningCode, "command_unavailable");
});

test("command brain falls back on timeout", async () => {
  process.env.CODEX_BRAIN_COMMAND = JSON.stringify([process.execPath, "-e", "setTimeout(()=>{}, 1000)"]);
  process.env.BRAIN_TIMEOUT_MS = "20";
  const reply = await generateCustomerReply({
    scenario,
    session: session([{ role: "persona", text: "Hi", at: new Date().toISOString() }]),
    repMessage: "What does this cost?",
  });
  assert.equal(reply.provider, "mock");
  assert.equal(reply.warning, "AI provider unavailable; using mock customer.");
  assert.equal(reply.warningCode, "command_unavailable");
});

test("command parser supports quoted command strings without shell execution", () => {
  assert.deepEqual(parseCommandLine('node -e "console.log(1)"'), {
    file: "node",
    args: ["-e", "console.log(1)"],
  });
});

test("command brain does not pass arbitrary server environment", async () => {
  process.env.SECRET_SHOULD_NOT_LEAK = "secret-value";
  process.env.CODEX_BRAIN_COMMAND = JSON.stringify([
    process.execPath,
    "-e",
    "process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({reply:process.env.SECRET_SHOULD_NOT_LEAK || 'not leaked'})))",
  ]);
  const reply = await generateCustomerReply({
    scenario,
    session: session([{ role: "user", text: "Hi", at: new Date().toISOString() }]),
    repMessage: "Can I ask about your reviews?",
  });
  assert.equal(reply.text, "not leaked");
  delete process.env.SECRET_SHOULD_NOT_LEAK;
});
