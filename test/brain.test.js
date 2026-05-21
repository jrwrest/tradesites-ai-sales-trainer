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

test("right-person opener is answered before relevance challenge", async () => {
  const repMessage =
    "hey Alex this is James I just called about an email showed across and regarding a quick electricity cost check are you the right person to talk to about this";

  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "enterprise-right-person-check",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
  });

  assert.equal(reply.provider, "flow_guard");
  assert.equal(reply.flowGuard, "right_person_check");
  assert.match(reply.text, /involved|look after|depends|possibly|relevance|about|short version|point you/i);
  assert.doesNotMatch(reply.text, /^Okay\. Keep it brief\./i);
});

test("right-person opener can vary the routing answer", async () => {
  const repMessage =
    "this is James regarding a quick electricity cost check, are you the right person to talk to about this?";

  const replies = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      generateCustomerReply({
        scenario: enterpriseScenario,
        session: {
          id: `enterprise-right-person-variant-${index}`,
          scenarioId: enterpriseScenario.id,
          turns: [
            { role: "persona", text: enterpriseScenario.persona.openingLine },
            { role: "user", text: repMessage },
          ],
        },
        repMessage,
      }),
    ),
  );

  const texts = new Set(replies.map((reply) => reply.text));

  assert.ok(texts.size >= 3);
  assert.ok(Array.from(texts).some((text) => /No, I do not look after/i.test(text)));
  for (const reply of replies) {
    assert.equal(reply.flowGuard, "right_person_check");
    assert.doesNotMatch(reply.text, /^Okay\. Keep it brief\./i);
  }
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

test("qualification pitch using figure out does not trigger energy bill qualification answer", async () => {
  const repMessage =
    "so if we can imagine ask you a few questions over the next couple minutes we will be able to figure out whether you qualify for a solo install which is completely funded and you would then be charge electricity so at a cheaper rate than what you're paying now";

  const reply = await generateCustomerReply({
    scenario,
    session: {
      id: "sarah-figure-out-pitch",
      scenarioId: scenario.id,
      turns: [
        { role: "persona", text: "Hi, Sarah speaking. Who is this?" },
        {
          role: "user",
          text: "hi Sarah this is James I emailed about electricity cost a electricity cost check and I just wanted to check whether you're the right person for a site electricity facility or energy decisions does that make sense",
        },
        { role: "persona", text: "Okay. Keep it brief. What is the relevance to us?" },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
  });

  assert.notEqual(reply.flowGuard, "energy_bill_qualification");
  assert.doesNotMatch(reply.text, /exact figure|why do you need/i);
});

test("energy qualification guard only responds to direct figure questions", async () => {
  const cases = [
    {
      message: "roughly what do you spend on electricity each year?",
      shouldTrigger: true,
    },
    {
      message: "can you share your annual electricity usage?",
      shouldTrigger: true,
    },
    {
      message: "do you know your monthly energy cost?",
      shouldTrigger: true,
    },
    {
      message: "we can check whether your electricity cost could be reduced",
      shouldTrigger: false,
    },
    {
      message: "this would be at a cheaper rate than what you're paying now",
      shouldTrigger: false,
    },
    {
      message: "I emailed about an electricity cost check and wanted to see if you handle site energy decisions",
      shouldTrigger: false,
    },
    {
      message: "the first step is seeing whether the site qualifies for a funded solar install",
      shouldTrigger: false,
    },
  ];

  for (const { message, shouldTrigger } of cases) {
    const reply = await generateCustomerReply({
      scenario,
      session: {
        id: `energy-guard-${shouldTrigger ? "trigger" : "bypass"}-${message.length}`,
        scenarioId: scenario.id,
        turns: [
          { role: "persona", text: "Okay. Keep it brief. What is the relevance to us?" },
          { role: "user", text: message },
        ],
      },
      repMessage: message,
    });

    if (shouldTrigger) {
      assert.equal(reply.flowGuard, "energy_bill_qualification", message);
    } else {
      assert.notEqual(reply.flowGuard, "energy_bill_qualification", message);
      assert.doesNotMatch(reply.text, /exact figure|why do you need/i, message);
    }
  }
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
