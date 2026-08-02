const assert = require("node:assert/strict");
const { test, beforeEach, afterEach } = require("node:test");
const {
  buildBrainPayload,
  buildQualificationFlowGuard,
  generateCustomerReply,
  parseCommandLine,
} = require("../src/brain");
const { getScenario } = require("../src/scenarios");

function clearBrainEnv() {
  delete process.env.CODEX_BRAIN_COMMAND;
  delete process.env.BRAIN_TIMEOUT_MS;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_TIMEOUT_MS;
  delete process.env.DIALOGUE_MANAGER_ENABLED;
  delete process.env.DIALOGUE_LLM_RENDER_ENABLED;
  delete process.env.DIALOGUE_LLM_RENDER_TIMEOUT_MS;
  delete process.env.DIALOGUE_LLM_RENDER_RETRY_ON_VIOLATION;
  delete process.env.DIALOGUE_LLM_RENDER_MAX_CONCURRENT_PER_SESSION;
  delete process.env.DIALOGUE_LLM_RENDER_MAX_CONCURRENT_PER_USER;
  delete process.env.DIALOGUE_LLM_RENDER_MAX_CONCURRENT_GLOBAL;
}

beforeEach(clearBrainEnv);
afterEach(clearBrainEnv);

const scenario = getScenario("roofing-owner");
const enterpriseScenario = getScenario("enterprise-commercial-solar");
const hardRejectionScenario = getScenario("commercial-solar-rejection");
const manufacturerScenario = getScenario("manufacturer-power-payback-report");

const escapedSavingsRefundMessage =
  "it would tell us how your side is how much power you could potentially save and give we don't show you that you can save at least 10% on your bill then you will get a refund from us";

function session(turns = []) {
  return {
    id: "test",
    scenarioId: scenario.id,
    turns,
  };
}

test("savings and refund explanation does not trigger energy bill qualification", () => {
  const reply = buildQualificationFlowGuard({ repMessage: escapedSavingsRefundMessage });
  assert.equal(reply, null);
});

test("manufacturer brain offers unused contextual objections instead of forcing one", () => {
  const payload = buildBrainPayload({
    scenario: manufacturerScenario,
    session: {
      id: "a29ae25f-contextual-objections",
      scenarioId: manufacturerScenario.id,
      state: { objectionsUsed: ["power-payback-no-bill"] },
      turns: [
        { role: "persona", text: manufacturerScenario.persona.openingLine },
        { role: "user", text: "I am from solar and stove at least have you heard of us" },
        {
          role: "persona",
          text: "We might already have panels on the roof.",
          objectionId: "power-payback-already-have-panels",
          objectionType: "existing_solution",
        },
        { role: "user", text: escapedSavingsRefundMessage },
      ],
    },
    repMessage: escapedSavingsRefundMessage,
  });

  assert.equal(Object.hasOwn(payload, "forcedObjection"), false);
  assert.ok(Array.isArray(payload.contextualObjections));
  assert.equal(
    payload.contextualObjections.some((objection) => objection.id === "power-payback-already-have-panels"),
    false,
  );
  assert.equal(
    payload.contextualObjections.some((objection) => objection.id === "power-payback-no-bill"),
    false,
  );
  assert.ok(payload.contextualObjections.every((objection) => objection.type !== "hard_no"));
  assert.ok(payload.contextualObjections.length <= 8);
  assert.equal(Object.hasOwn(payload.responseSchema, "objectionId"), true);
});

test("unguarded turns use the injectable primary provider with the complete transcript", async () => {
  const transcript = [
    { role: "persona", text: "Stuart speaking. Who is this?" },
    { role: "user", text: "hey this is James" },
    { role: "persona", text: "James who? And what company are you with?" },
    { role: "user", text: "I am from solar and stove at least have you heard of us" },
    { role: "persona", text: "We might already have panels on the roof.", objectionId: "power-payback-already-have-panels" },
    { role: "user", text: "what's your position are you the best person to talk to about solo" },
    { role: "persona", text: "Probably not the best person for solar. What exactly are you calling about?" },
    { role: "user", text: "I'm going to see if there are any hidden gaps in your current power situation" },
    { role: "persona", text: "Why would we pay GBP 500 for a report?", objectionId: "power-payback-why-pay" },
    { role: "user", text: "because you will get it back and you decide to go ahead with us and it'll give you a clear action plan that you can take anywhere to anyone and they'll be able to help you out" },
    { role: "persona", text: "Alright, keep it brief. What would the report actually tell us?" },
    { role: "user", text: escapedSavingsRefundMessage },
  ];
  const calls = [];

  const reply = await generateCustomerReply({
    scenario: manufacturerScenario,
    session: { id: "a29ae25f", scenarioId: manufacturerScenario.id, turns: transcript },
    repMessage: escapedSavingsRefundMessage,
    primaryProvider: async (payload) => {
      calls.push(payload);
      return { text: "How is the 10% saving calculated?", mood: "skeptical", provider: "test-primary" };
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].transcript, transcript);
  assert.equal(Object.hasOwn(calls[0], "forcedObjection"), false);
  assert.equal(reply.text, "How is the 10% saving calculated?");
  assert.equal(reply.provider, "test-primary");
});

test("primary-provider objection metadata is scenario-bound and type is server-derived", async () => {
  const baseSession = {
    id: "provider-objection-validation",
    scenarioId: manufacturerScenario.id,
    turns: [
      { role: "persona", text: "Okay. What exactly are you proposing?" },
      { role: "user", text: "The report is a paid check before deciding what to do." },
    ],
  };
  const repMessage = baseSession.turns[1].text;

  const accepted = await generateCustomerReply({
    scenario: manufacturerScenario,
    session: baseSession,
    repMessage,
    primaryProvider: async () => ({
      text: "Why should we pay GBP 500 for that?",
      mood: "skeptical",
      provider: "test-primary",
      objectionId: "power-payback-why-pay",
      objectionType: "hard_no",
    }),
  });
  assert.equal(accepted.objectionId, "power-payback-why-pay");
  assert.equal(accepted.objectionType, "commercial_risk");

  for (const objectionId of ["landlord", "power-payback-already-have-panels"]) {
    const sessionWithUsed = {
      ...baseSession,
      turns: [
        { role: "persona", text: "We might already have panels.", objectionId: "power-payback-already-have-panels" },
        { role: "user", text: repMessage },
      ],
    };
    const dropped = await generateCustomerReply({
      scenario: manufacturerScenario,
      session: sessionWithUsed,
      repMessage,
      primaryProvider: async () => ({
        text: "Tell me more about that.",
        provider: "test-primary",
        objectionId,
        objectionType: "hard_no",
      }),
    });
    assert.equal(Object.hasOwn(dropped, "objectionId"), false, objectionId);
    assert.equal(Object.hasOwn(dropped, "objectionType"), false, objectionId);
  }
});

test("safety guards run before the injectable primary provider", async () => {
  process.env.DIALOGUE_MANAGER_ENABLED = "1";
  let calls = 0;
  const primaryProvider = async () => {
    calls += 1;
    return { text: "provider should not run", provider: "test-primary" };
  };
  const cases = [
    {
      session: { id: "guard-context", turns: [{ role: "persona", text: "Stuart speaking. Who is this?" }, { role: "user", text: "hey this is James" }] },
      repMessage: "hey this is James",
    },
    {
      session: { id: "guard-routing", turns: [{ role: "persona", text: "What is this about?" }, { role: "user", text: "are you the best person to talk to about solar" }] },
      repMessage: "are you the best person to talk to about solar",
    },
    {
      session: { id: "guard-hard-no", turns: [{ role: "persona", text: "Do not call again. Take us off your list." }, { role: "user", text: "Understood, goodbye." }] },
      repMessage: "Understood, goodbye.",
    },
    {
      session: { id: "guard-bill", turns: [{ role: "persona", text: "Okay, keep it brief." }, { role: "user", text: "roughly what do you spend on electricity each year?" }] },
      repMessage: "roughly what do you spend on electricity each year?",
    },
  ];

  for (const item of cases) {
    await generateCustomerReply({ scenario: manufacturerScenario, ...item, primaryProvider });
  }
  assert.equal(calls, 0);
});

test("normal discovery questions reach the primary provider instead of narrow intent guards", async () => {
  process.env.DIALOGUE_MANAGER_ENABLED = "1";
  const messages = [
    "Quick question: do you already have solar panels on the roof?",
    "Can you share how electricity cost affects your margins?",
  ];
  const calls = [];

  for (const repMessage of messages) {
    const reply = await generateCustomerReply({
      scenario: manufacturerScenario,
      session: {
        id: `discovery-boundary-${calls.length}`,
        scenarioId: manufacturerScenario.id,
        turns: [
          { role: "persona", text: "Okay, what would you like to know?" },
          { role: "user", text: repMessage },
        ],
      },
      repMessage,
      primaryProvider: async (payload) => {
        calls.push(payload.latestRepMessage);
        return { text: "That is a fair question. Let me answer it directly.", provider: "test-primary" };
      },
    });
    assert.equal(reply.provider, "test-primary", repMessage);
  }

  assert.deepEqual(calls, messages);

  const routingMessage = "Do you know who handles the electricity bill?";
  const routingReply = await generateCustomerReply({
    scenario: manufacturerScenario,
    session: {
      id: "discovery-boundary-routing",
      scenarioId: manufacturerScenario.id,
      turns: [
        { role: "persona", text: "Okay, what would you like to know?" },
        { role: "user", text: routingMessage },
      ],
    },
    repMessage: routingMessage,
    primaryProvider: async () => ({ text: "provider is not needed for deterministic routing" }),
  });
  assert.equal(routingReply.dialogue?.customerAction, "answer_routing_question");
  assert.notEqual(routingReply.flowGuard, "energy_bill_qualification");
  assert.doesNotMatch(routingReply.text, /exact figure|why do you need/i);
});

test("explicit quantitative questions outrank generic permission phrasing", async () => {
  process.env.DIALOGUE_MANAGER_ENABLED = "1";
  const messages = [
    "How much is the electricity bill?",
    "What's your annual electricity bill?",
    "Can I ask how much you spend on electricity each year?",
  ];

  for (const repMessage of messages) {
    let primaryCalls = 0;
    const reply = await generateCustomerReply({
      scenario: manufacturerScenario,
      session: {
        id: `quantitative-boundary-${repMessage.length}`,
        scenarioId: manufacturerScenario.id,
        turns: [
          { role: "persona", text: "Okay, what would you like to know?" },
          { role: "user", text: repMessage },
        ],
      },
      repMessage,
      primaryProvider: async () => {
        primaryCalls += 1;
        return { text: "primary provider should not run" };
      },
    });
    assert.equal(reply.flowGuard, "energy_bill_qualification", repMessage);
    assert.equal(primaryCalls, 0, repMessage);
  }
});

test("invalid injectable primary replies fall back with an explicit warning", async () => {
  const repMessage = "The report checks whether there is a worthwhile saving before you commit.";
  for (const primaryProvider of [
    async () => ({ text: "", provider: "test-primary" }),
    async () => {
      throw new Error("provider failed");
    },
  ]) {
    const reply = await generateCustomerReply({
      scenario: manufacturerScenario,
      session: { id: "invalid-primary", turns: [{ role: "persona", text: "What would it tell us?" }, { role: "user", text: repMessage }] },
      repMessage,
      primaryProvider,
    });
    assert.equal(reply.warningCode, "primary_provider_unavailable");
    assert.equal(typeof reply.text, "string");
    assert.ok(reply.text.length > 0);
  }
});

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

test("manufacturer opener treats Blue Swans report context as specific call context", async () => {
  const repMessage =
    "Hi Stuart, it is James from Blue Swans. We built a manufacturer power payback report for BSB Structural. Did I catch you at a bad time?";

  const reply = await generateCustomerReply({
    scenario: manufacturerScenario,
    session: {
      id: "manufacturer-blue-swans-context",
      scenarioId: manufacturerScenario.id,
      turns: [
        { role: "persona", text: manufacturerScenario.persona.openingLine },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
  });

  assert.notEqual(reply.flowGuard, "missing_call_context");
  assert.doesNotMatch(reply.text, /who are you with|what is this about|from where/i);
});

test("dialogue manager replies render through an injected provider when enabled", async () => {
  process.env.DIALOGUE_MANAGER_ENABLED = "1";
  process.env.DIALOGUE_LLM_RENDER_ENABLED = "1";

  const calls = [];
  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "enterprise-dialogue-render",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        {
          role: "user",
          text: "James from BrightTrade Solar. I emailed about a quick electricity cost check. Can I take 20 seconds?",
        },
        { role: "persona", text: "Okay. Keep it brief. What is the relevance to us?" },
        { role: "user", text: "Are you the right person for site energy decisions?" },
      ],
    },
    repMessage: "Are you the right person for site energy decisions?",
    renderProvider: async (payload) => {
      calls.push(payload);
      return { text: "Possibly, but give me the short version first.", mood: "busy", provider: "fake_llm" };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].forcedObjection, undefined);
  assert.equal(calls[0].dialogueContract.sourceProvider, "dialogue_manager");
  assert.equal(calls[0].dialogueContract.customerAction, "answer_routing_question");
  assert.equal(reply.provider, "fake_llm");
  assert.equal(reply.text, "Possibly, but give me the short version first.");
  assert.equal(reply.dialogue.renderedBy, "llm");
  assert.equal(reply.dialogue.rendererProvider, "fake_llm");
  assert.equal(reply.dialogue.fallbackReason, null);
});

test("flow guard replies render through an injected provider when enabled", async () => {
  process.env.DIALOGUE_LLM_RENDER_ENABLED = "1";

  const calls = [];
  const reply = await generateCustomerReply({
    scenario: hardRejectionScenario,
    session: {
      id: "sample-foods-flow-render",
      scenarioId: hardRejectionScenario.id,
      turns: [
        { role: "persona", text: hardRejectionScenario.persona.openingLine },
        { role: "user", text: "hey this is James" },
      ],
    },
    repMessage: "hey this is James",
    renderProvider: async (payload) => {
      calls.push(payload);
      return { text: "James from where, and what company is this?", mood: "busy", provider: "fake_llm" };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].forcedObjection, undefined);
  assert.equal(calls[0].dialogueContract.sourceProvider, "flow_guard");
  assert.equal(reply.provider, "fake_llm");
  assert.equal(reply.flowGuard, "missing_call_context");
  assert.equal(reply.dialogue.renderedBy, "llm");
});

test("dialogue render flag off keeps guard replies deterministic", async () => {
  let calls = 0;
  const reply = await generateCustomerReply({
    scenario: hardRejectionScenario,
    session: {
      id: "sample-foods-render-flag-off",
      scenarioId: hardRejectionScenario.id,
      turns: [
        { role: "persona", text: hardRejectionScenario.persona.openingLine },
        { role: "user", text: "hey this is James" },
      ],
    },
    repMessage: "hey this is James",
    renderProvider: async () => {
      calls += 1;
      return { text: "Rendered", provider: "fake_llm" };
    },
  });

  assert.equal(calls, 0);
  assert.equal(reply.provider, "flow_guard");
  assert.equal(reply.dialogue, undefined);
});

test("dialogue render does not shorten terminal hard-no exits", async () => {
  process.env.DIALOGUE_MANAGER_ENABLED = "1";
  process.env.DIALOGUE_LLM_RENDER_ENABLED = "1";

  let calls = 0;
  const repMessage = "No problem. I will leave it there. Thanks for your time.";
  const reply = await generateCustomerReply({
    scenario: manufacturerScenario,
    session: {
      id: "manufacturer-hard-no-render-skip",
      scenarioId: manufacturerScenario.id,
      turns: [
        { role: "persona", text: manufacturerScenario.persona.openingLine },
        { role: "persona", text: "No thanks, we are not interested. Take us off your list." },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
    renderProvider: async () => {
      calls += 1;
      return { text: "Okay. Bye.", provider: "fake_llm" };
    },
  });

  assert.equal(calls, 0);
  assert.equal(reply.provider, "dialogue_manager");
  assert.equal(reply.text, "Okay. Thanks. Bye.");
});

test("dialogue render falls back when provider returns an unrelated objection", async () => {
  process.env.DIALOGUE_MANAGER_ENABLED = "1";
  process.env.DIALOGUE_LLM_RENDER_ENABLED = "1";

  const reply = await generateCustomerReply({
    scenario: hardRejectionScenario,
    session: {
      id: "sample-foods-dialogue-invalid-render",
      scenarioId: hardRejectionScenario.id,
      turns: [
        { role: "persona", text: hardRejectionScenario.persona.openingLine },
        { role: "user", text: "this is James" },
      ],
    },
    repMessage: "this is James",
    renderProvider: async () => ({
      text: "We already have solar installed, so I do not see why this is relevant.",
      mood: "guarded",
      provider: "fake_llm",
    }),
  });

  assert.equal(reply.provider, "flow_guard");
  assert.match(reply.text, /from where|who are you with|what company|do not follow|my site/i);
  assert.equal(reply.dialogue.renderedBy, "fallback");
  assert.equal(reply.dialogue.rendererProvider, "fake_llm");
  assert.equal(reply.dialogue.fallbackReason, "constraint_violation");
  assert.equal(reply.dialogue.constraintViolation.code, "forbidden_topic");
});

test("dialogue render falls back when provider ignores a routing question", async () => {
  process.env.DIALOGUE_MANAGER_ENABLED = "1";
  process.env.DIALOGUE_LLM_RENDER_ENABLED = "1";

  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "enterprise-routing-ignored-render",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        {
          role: "user",
          text: "James from BrightTrade Solar. I emailed about a quick electricity cost check. Can I take 20 seconds?",
        },
        { role: "persona", text: "Okay. Keep it brief. What is the relevance to us?" },
        { role: "user", text: "Are you the right person for site energy decisions?" },
      ],
    },
    repMessage: "Are you the right person for site energy decisions?",
    renderProvider: async () => ({
      text: "Okay. Keep it brief. What is the relevance to us?",
      mood: "busy",
      provider: "fake_llm",
    }),
  });

  assert.equal(reply.provider, "dialogue_manager");
  assert.equal(reply.dialogue.renderedBy, "fallback");
  assert.equal(reply.dialogue.fallbackReason, "constraint_violation");
  assert.equal(reply.dialogue.constraintViolation.code, "ignored_latest_question");
});

test("dialogue render falls back when active objection jumps to a different objection", async () => {
  process.env.DIALOGUE_MANAGER_ENABLED = "1";
  process.env.DIALOGUE_LLM_RENDER_ENABLED = "1";

  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "enterprise-active-objection-jump",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        { role: "user", text: "James from BrightTrade Solar. Calling about funded commercial solar." },
        {
          role: "persona",
          text: "We already have solar installed, so I do not see why this is relevant.",
          objectionId: "already-have-solar",
          objectionType: "existing_solution",
        },
        { role: "user", text: "We can check whether the current system is being maximised." },
      ],
    },
    repMessage: "We can check whether the current system is being maximised.",
    renderProvider: async (payload) => ({
      text: "We do not own the building. The landlord would never go for it.",
      mood: "guarded",
      provider: "fake_llm",
      seenForcedObjection: payload.forcedObjection,
    }),
  });

  assert.equal(reply.provider, "dialogue_manager");
  assert.equal(reply.objectionId, "already-have-solar");
  assert.equal(reply.dialogue.renderedBy, "fallback");
  assert.equal(reply.dialogue.fallbackReason, "constraint_violation");
  assert.equal(reply.dialogue.constraintViolation.code, "forbidden_topic");
});

test("dialogue render passes the shorter render timeout to the provider", async () => {
  process.env.DIALOGUE_LLM_RENDER_ENABLED = "1";
  process.env.DIALOGUE_LLM_RENDER_TIMEOUT_MS = "1234";

  let providerOptions;
  const reply = await generateCustomerReply({
    scenario: hardRejectionScenario,
    session: {
      id: "sample-foods-render-timeout-options",
      scenarioId: hardRejectionScenario.id,
      turns: [
        { role: "persona", text: hardRejectionScenario.persona.openingLine },
        { role: "user", text: "hey this is James" },
      ],
    },
    repMessage: "hey this is James",
    renderProvider: async (_payload, options) => {
      providerOptions = options;
      return { text: "James from where, and what company is this?", provider: "fake_llm" };
    },
  });

  assert.equal(reply.provider, "fake_llm");
  assert.ok(providerOptions.timeoutMs > 0);
  assert.ok(providerOptions.timeoutMs <= 1234);
});

test("dialogue render uses the configured command provider without injection", async () => {
  process.env.DIALOGUE_LLM_RENDER_ENABLED = "1";
  process.env.DIALOGUE_LLM_RENDER_TIMEOUT_MS = "1000";
  process.env.CODEX_BRAIN_COMMAND = JSON.stringify([
    process.execPath,
    "-e",
    "process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({reply:'James from where, and what company is this?',mood:'busy'})))",
  ]);

  const reply = await generateCustomerReply({
    scenario: hardRejectionScenario,
    session: {
      id: "sample-foods-default-command-render",
      scenarioId: hardRejectionScenario.id,
      turns: [
        { role: "persona", text: hardRejectionScenario.persona.openingLine },
        { role: "user", text: "hey this is James" },
      ],
    },
    repMessage: "hey this is James",
  });

  assert.equal(reply.provider, "command");
  assert.equal(reply.dialogue.renderedBy, "llm");
  assert.equal(reply.dialogue.rendererProvider, "command");
  assert.equal(reply.dialogue.fallbackReason, null);
});

test("dialogue render retries once on constraint violation within the turn budget", async () => {
  process.env.DIALOGUE_LLM_RENDER_ENABLED = "1";
  process.env.DIALOGUE_LLM_RENDER_RETRY_ON_VIOLATION = "1";

  const outputs = [
    "We already have solar installed, so I do not see why this is relevant.",
    "James from where, and what company is this?",
  ];
  const reply = await generateCustomerReply({
    scenario: hardRejectionScenario,
    session: {
      id: "sample-foods-render-retry",
      scenarioId: hardRejectionScenario.id,
      turns: [
        { role: "persona", text: hardRejectionScenario.persona.openingLine },
        { role: "user", text: "hey this is James" },
      ],
    },
    repMessage: "hey this is James",
    renderProvider: async () => ({ text: outputs.shift(), mood: "busy", provider: "fake_llm" }),
  });

  assert.equal(outputs.length, 0);
  assert.equal(reply.provider, "fake_llm");
  assert.equal(reply.text, "James from where, and what company is this?");
  assert.equal(reply.dialogue.renderedBy, "llm");
  assert.equal(reply.dialogue.constraintViolation, null);
});

test("dialogue render falls back on provider timeout", async () => {
  process.env.DIALOGUE_LLM_RENDER_ENABLED = "1";
  process.env.DIALOGUE_LLM_RENDER_TIMEOUT_MS = "10";

  const reply = await generateCustomerReply({
    scenario: hardRejectionScenario,
    session: {
      id: "sample-foods-render-timeout",
      scenarioId: hardRejectionScenario.id,
      turns: [
        { role: "persona", text: hardRejectionScenario.persona.openingLine },
        { role: "user", text: "hey this is James" },
      ],
    },
    repMessage: "hey this is James",
    renderProvider: async () => new Promise(() => {}),
  });

  assert.equal(reply.provider, "flow_guard");
  assert.equal(reply.dialogue.renderedBy, "fallback");
  assert.equal(reply.dialogue.fallbackReason, "provider_timeout");
});

test("dialogue render blocks overlapping calls for the same session", async () => {
  process.env.DIALOGUE_LLM_RENDER_ENABLED = "1";

  let releaseFirst;
  let calls = 0;
  const sharedSession = {
    id: "sample-foods-render-concurrency",
    scenarioId: hardRejectionScenario.id,
    turns: [
      { role: "persona", text: hardRejectionScenario.persona.openingLine },
      { role: "user", text: "hey this is James" },
    ],
  };
  const first = generateCustomerReply({
    scenario: hardRejectionScenario,
    session: sharedSession,
    repMessage: "hey this is James",
    renderProvider: async () => {
      calls += 1;
      return new Promise((resolve) => {
        releaseFirst = () => resolve({ text: "James from where, and what company is this?", provider: "fake_llm" });
      });
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  const second = await generateCustomerReply({
    scenario: hardRejectionScenario,
    session: sharedSession,
    repMessage: "hey this is James",
    renderProvider: async () => {
      calls += 1;
      return { text: "Should not render", provider: "fake_llm" };
    },
  });

  releaseFirst();
  const firstReply = await first;

  assert.equal(calls, 1);
  assert.equal(second.provider, "flow_guard");
  assert.equal(second.dialogue.renderedBy, "fallback");
  assert.equal(second.dialogue.fallbackReason, "concurrency_limit");
  assert.equal(firstReply.provider, "fake_llm");
  assert.equal(firstReply.dialogue.renderedBy, "llm");
});

test("dialogue render blocks overlapping calls for the same user across sessions", async () => {
  process.env.DIALOGUE_LLM_RENDER_ENABLED = "1";
  process.env.DIALOGUE_LLM_RENDER_MAX_CONCURRENT_PER_USER = "1";

  let releaseFirst;
  let calls = 0;
  const makeSession = (id) => ({
    id,
    repId: "rep-1",
    scenarioId: hardRejectionScenario.id,
    turns: [
      { role: "persona", text: hardRejectionScenario.persona.openingLine },
      { role: "user", text: "hey this is James" },
    ],
  });
  const first = generateCustomerReply({
    scenario: hardRejectionScenario,
    session: makeSession("sample-foods-user-concurrency-1"),
    repMessage: "hey this is James",
    renderProvider: async () => {
      calls += 1;
      return new Promise((resolve) => {
        releaseFirst = () => resolve({ text: "James from where, and what company is this?", provider: "fake_llm" });
      });
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  const second = await generateCustomerReply({
    scenario: hardRejectionScenario,
    session: makeSession("sample-foods-user-concurrency-2"),
    repMessage: "hey this is James",
    renderProvider: async () => {
      calls += 1;
      return { text: "Should not render", provider: "fake_llm" };
    },
  });

  releaseFirst();
  await first;

  assert.equal(calls, 1);
  assert.equal(second.provider, "flow_guard");
  assert.equal(second.dialogue.renderedBy, "fallback");
  assert.equal(second.dialogue.fallbackReason, "user_concurrency_limit");
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

test("best-person opener is treated as a routing question", async () => {
  const repMessage =
    "hey this is James I sent an email about a solar quick electricity cost check and I wonder if you're the best person to talk to about this";

  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "enterprise-best-person-check",
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
  assert.match(reply.text, /maybe|possibly|not directly|depends|point you|what did you send|short version/i);
  assert.doesNotMatch(reply.text, /^Okay\. Keep it brief\./i);
});

test("messy routing openers are treated as right-person questions", async () => {
  const cases = [
    "hey Alex James here I emailed about a quick energy cost check, is there someone better I should speak to about electricity?",
    "hi this is James, would you be the person that deals with energy contracts for the site?",
    "I sent an email over, who would be best to talk with about site electricity costs?",
    "do you deal with energy or facility decisions there, or is that someone else?",
  ];

  for (const repMessage of cases) {
    const reply = await generateCustomerReply({
      scenario: enterpriseScenario,
      session: {
        id: `enterprise-messy-routing-${repMessage.length}`,
        scenarioId: enterpriseScenario.id,
        turns: [
          { role: "persona", text: enterpriseScenario.persona.openingLine },
          { role: "user", text: repMessage },
        ],
      },
      repMessage,
    });

    assert.equal(reply.flowGuard, "right_person_check", repMessage);
    assert.doesNotMatch(reply.text, /^Okay\. Keep it brief\./i, repMessage);
  }
});

test("asset ownership is not treated as a right-person check by the opening flow guard", () => {
  const repMessage =
    "James from Tradesites calling about solar suitability; do you own the site or lease the building?";
  const reply = require("../src/brain").buildConversationFlowGuard({
    scenario: enterpriseScenario,
    session: {
      id: "enterprise-asset-ownership-boundary",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
  });

  assert.notEqual(reply?.flowGuard, "right_person_check");
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
  assert.ok(Array.from(texts).some((text) => /No, not directly/i.test(text)));
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
      message: "Could you share roughly what the annual electricity spend is?",
      shouldTrigger: true,
    },
    {
      message: "Do you know the monthly kWh usage?",
      shouldTrigger: true,
    },
    {
      message: "How much is the electricity bill?",
      shouldTrigger: true,
    },
    {
      message: "What's your annual electricity bill?",
      shouldTrigger: true,
    },
    {
      message: "Can I ask how much you spend on electricity each year?",
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
    {
      message: "your energy number keeps climbing, which is exactly what the report investigates",
      shouldTrigger: false,
    },
    {
      message: "Can you share how electricity cost affects your margins?",
      shouldTrigger: false,
    },
    {
      message: "Do you know who handles the electricity bill?",
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

test("energy qualification guard handles unit-rate and daytime-usage questions", async () => {
  const cases = ["roughly what do you pay per kWh at the moment?", "how much daytime usage does the site usually have?"];

  for (const repMessage of cases) {
    const reply = await generateCustomerReply({
      scenario: enterpriseScenario,
      session: {
        id: `enterprise-energy-figure-${repMessage.length}`,
        scenarioId: enterpriseScenario.id,
        turns: [
          { role: "persona", text: enterpriseScenario.persona.openingLine },
          { role: "user", text: "James from BrightTrade Solar. Calling about commercial solar. Can I take 20 seconds?" },
          { role: "persona", text: "Okay. Keep it brief. What is the relevance to us?" },
          { role: "user", text: repMessage },
        ],
      },
      repMessage,
    });

    assert.equal(reply.flowGuard, "energy_bill_qualification", repMessage);
    assert.match(reply.text, /exact figure|why do you need/i, repMessage);
  }
});

test("commercial model answer stays on commercial model instead of jumping objections", async () => {
  const repMessage =
    "The funded route means the provider pays for the install and you buy the generated power under agreed terms; first we would only check demand and site fit.";

  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "enterprise-commercial-model-follow-up",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        { role: "user", text: "James from BrightTrade Solar. Calling about funded commercial solar. Can I take 20 seconds?" },
        {
          role: "persona",
          text: "No upfront cost usually means the catch shows up later. What is the actual commercial model?",
          objectionId: "budget-free-claim",
          objectionType: "commercial_risk",
        },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
  });

  assert.equal(reply.flowGuard, "commercial_model_follow_up");
  assert.match(reply.text, /need from us|check whether/i);
  assert.doesNotMatch(reply.text, /already have solar|energy consultant/i);
});

test("landlord answer stays on landlord route instead of jumping objections", async () => {
  const repMessage =
    "That makes sense. If the landlord route is not realistic, I can close it off; if it is, would a short landlord note be useful?";

  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "enterprise-landlord-follow-up",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        { role: "user", text: "James from BrightTrade Solar. Calling about funded commercial solar. Can I take 20 seconds?" },
        {
          role: "persona",
          text: "We do not own the building. The landlord would never go for it.",
          objectionId: "landlord",
          objectionType: "authority",
        },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
  });

  assert.equal(reply.flowGuard, "landlord_follow_up");
  assert.match(reply.text, /short note|landlord/i);
  assert.doesNotMatch(reply.text, /procurement|sustainability|already have solar|consultant/i);
});

test("clean exit after a hard no gets a natural goodbye", async () => {
  const reply = await generateCustomerReply({
    scenario: hardRejectionScenario,
    session: {
      id: "sample-foods-clean-hard-no-exit",
      scenarioId: hardRejectionScenario.id,
      turns: [
        { role: "persona", text: hardRejectionScenario.persona.openingLine },
        { role: "user", text: "James from BrightTrade Solar. Calling about commercial solar. Can I take 20 seconds?" },
        { role: "persona", text: "We have no requirement for this. Please take us off your list." },
        { role: "user", text: "I understand. Thanks for taking the call, I will close this off." },
      ],
    },
    repMessage: "I understand. Thanks for taking the call, I will close this off.",
  });

  assert.match(reply.text, /thanks|bye|okay/i);
  assert.doesNotMatch(reply.text, /meeting|spend time|why should I/i);
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

test("command brain accepts only scenario-bound objection metadata", async () => {
  process.env.CODEX_BRAIN_COMMAND = JSON.stringify([
    process.execPath,
    "-e",
    "process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({reply:'Why should we pay GBP 500 for that?',mood:'skeptical',objectionId:'power-payback-why-pay',objectionType:'hard_no'})))",
  ]);
  const repMessage = "The report is a paid check before deciding what to do.";
  const reply = await generateCustomerReply({
    scenario: manufacturerScenario,
    session: {
      id: "command-objection-validation",
      scenarioId: manufacturerScenario.id,
      turns: [
        { role: "persona", text: "What are you proposing?" },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
  });
  assert.equal(reply.provider, "command");
  assert.equal(reply.objectionId, "power-payback-why-pay");
  assert.equal(reply.objectionType, "commercial_risk");
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
