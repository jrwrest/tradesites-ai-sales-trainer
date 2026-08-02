const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const { generateCustomerReply } = require("../src/brain");
const { classifyRepTurn } = require("../src/dialogueManager");
const { getScenario } = require("../src/scenarios");

const enterpriseScenario = getScenario("enterprise-commercial-solar");
const manufacturerScenario = getScenario("manufacturer-power-payback-report");

function clearBrainEnv() {
  delete process.env.CODEX_BRAIN_COMMAND;
  delete process.env.BRAIN_TIMEOUT_MS;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_TIMEOUT_MS;
  delete process.env.DIALOGUE_MANAGER_ENABLED;
}

beforeEach(() => {
  clearBrainEnv();
  process.env.DIALOGUE_MANAGER_ENABLED = "1";
});

afterEach(clearBrainEnv);

test("dialogue manager answers a mid-call best-person question before scheduling objections", async () => {
  const repMessage =
    "say Coco is from Scotland and we help the commercial companies cut electricity cost through a funded solar install with no upfront cost to the business would you be the best best person to speak to about this";

  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "dialogue-manager-best-person-after-context-repair",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        {
          role: "user",
          text: "hey James hope you have front this is Coco we got 30 seconds and I'll explain why I called",
        },
        {
          role: "persona",
          text: "Coco from where, and what is this about?",
          flowGuard: "missing_call_context",
          objectionId: "gatekeeper-who-is-this",
          objectionType: "gatekeeper",
        },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
  });

  assert.equal(reply.provider, "dialogue_manager");
  assert.equal(reply.dialogue?.repAct, "routing_question");
  assert.equal(reply.dialogue?.customerAction, "answer_routing_question");
  assert.notEqual(reply.objectionId, "already-have-solar");
  assert.doesNotMatch(reply.text, /already have solar|multiple sites|different leases/i);
});

test("site ownership is discovery, not decision-maker routing", async () => {
  const session = {
    id: "dialogue-manager-site-ownership",
    scenarioId: enterpriseScenario.id,
    turns: [
      { role: "persona", text: enterpriseScenario.persona.openingLine },
      { role: "user", text: "James from Tradesites, calling about commercial solar suitability." },
      { role: "persona", text: "Okay. What do you need to know?" },
    ],
  };

  for (const repMessage of [
    "Do you own the site?",
    "Does the business own or lease this building?",
    "Do you control the premises, or is there a landlord?",
  ]) {
    const classification = classifyRepTurn({ scenario: enterpriseScenario, session, repMessage });
    assert.equal(classification.label, "discovery_question", repMessage);
    assert.equal(classification.discoveryTopic, "asset_ownership", repMessage);

    const reply = await generateCustomerReply({ scenario: enterpriseScenario, session, repMessage });
    assert.equal(reply.provider, "dialogue_manager", repMessage);
    assert.equal(reply.dialogue?.repAct, "asset_ownership_question", repMessage);
    assert.equal(reply.dialogue?.customerAction, "answer_asset_ownership", repMessage);
    assert.equal(reply.dialogue?.schedulerBlocked, true, repMessage);
    assert.doesNotMatch(reply.text, /not directly.*what is this about|point you anywhere|short version/i, repMessage);
    assert.match(reply.text, /own|lease|site|building|premises|landlord/i, repMessage);
  }
});

test("decision ownership remains routing while asset ownership does not", () => {
  const session = {
    id: "dialogue-manager-ownership-boundary",
    scenarioId: enterpriseScenario.id,
    turns: [{ role: "persona", text: "Okay, go ahead." }],
  };

  assert.equal(
    classifyRepTurn({
      scenario: enterpriseScenario,
      session,
      repMessage: "Who owns the energy decision and budget?",
    }).label,
    "routing_question",
  );
  assert.equal(
    classifyRepTurn({
      scenario: enterpriseScenario,
      session,
      repMessage: "Do you own the building?",
    }).label,
    "discovery_question",
  );
});

test("dialogue manager keeps existing-solar follow-up on the same objection", async () => {
  const repMessage =
    "if you've already got solar that's great we can also check that you're maximizing your solar to get the most of it is that something that would help you";

  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "dialogue-manager-existing-solar-follow-up",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        {
          role: "user",
          text: "say Coco is from Scotland and we help commercial companies cut electricity cost through funded solar",
        },
        {
          role: "persona",
          text: "We already have solar installed, so I do not see why this is relevant.",
          objectionId: "already-have-solar",
          objectionType: "existing_solution",
        },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
  });

  assert.equal(reply.provider, "dialogue_manager");
  assert.equal(reply.dialogue?.repAct, "objection_answer");
  assert.equal(reply.dialogue?.customerAction, "stay_on_existing_solar");
  assert.equal(reply.dialogue?.schedulerBlocked, true);
  assert.equal(reply.objectionId, "already-have-solar");
  assert.doesNotMatch(reply.text, /multiple sites|different leases|procurement|sustainability/i);
});

test("dialogue manager grants brief permission for manufacturer report context instead of generic send-info", async () => {
  const repMessage =
    "I am calling because the public site details suggest BSB may have a structural manufacturing site where energy use could be material. If I take 20 seconds, I can explain the report and you can tell me if it is irrelevant.";

  const reply = await generateCustomerReply({
    scenario: manufacturerScenario,
    session: {
      id: "dialogue-manager-manufacturer-report-permission",
      scenarioId: manufacturerScenario.id,
      turns: [
        { role: "persona", text: manufacturerScenario.persona.openingLine },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
  });

  assert.equal(reply.provider, "dialogue_manager");
  assert.equal(reply.dialogue?.customerAction, "grant_brief_permission");
  assert.doesNotMatch(reply.text, /send me the information first/i);
  assert.match(reply.text, /20 seconds|brief|checking|report|relevant/i);
});

test("dialogue manager keeps manufacturer existing-panel follow-up on report checks", async () => {
  const repMessage =
    "That may actually make the report more useful, because it checks whether the remaining roof, usage profile, and funded structure still stack up. Would you be against checking that before assuming it is covered?";

  const reply = await generateCustomerReply({
    scenario: manufacturerScenario,
    session: {
      id: "dialogue-manager-manufacturer-existing-panels",
      scenarioId: manufacturerScenario.id,
      turns: [
        { role: "persona", text: manufacturerScenario.persona.openingLine },
        {
          role: "persona",
          text: "We might already have panels on the roof.",
          objectionId: "power-payback-already-have-panels",
          objectionType: "existing_solution",
        },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
  });

  assert.equal(reply.provider, "dialogue_manager");
  assert.equal(reply.dialogue?.customerAction, "stay_on_existing_solar");
  assert.equal(reply.objectionId, "power-payback-already-have-panels");
  assert.doesNotMatch(reply.text, /send me the information first/i);
  assert.match(reply.text, /current|panels|roof|load|check|monitor/i);
});

test("dialogue manager keeps unresolved gatekeeper context in repair instead of scheduling objections", async () => {
  const repMessage = "what are you about what are you doing";

  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "dialogue-manager-unresolved-gatekeeper-repair",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        { role: "user", text: "this is James" },
        {
          role: "persona",
          text: "James from where, and what is this about?",
          flowGuard: "missing_call_context",
          objectionId: "gatekeeper-who-is-this",
          objectionType: "gatekeeper",
        },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
  });

  assert.equal(reply.provider, "dialogue_manager");
  assert.equal(reply.dialogue?.repAct, "context_repair_needed");
  assert.equal(reply.dialogue?.customerAction, "repeat_gatekeeper_context_request");
  assert.equal(reply.dialogue?.schedulerBlocked, true);
  assert.doesNotMatch(reply.text, /already have solar|multiple sites|different leases/i);
  assert.match(reply.text, /asking|who.*with|who.*calling from|what.*about|from where|site|sorry/i);
});

test("dialogue manager repairs odd question-back replies after who-is-this opener", async () => {
  const repMessage = "james where is your site";

  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "dialogue-manager-who-is-this-question-back",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
  });

  assert.equal(reply.provider, "dialogue_manager");
  assert.equal(reply.dialogue?.repAct, "context_repair_needed");
  assert.equal(reply.dialogue?.customerAction, "repeat_gatekeeper_context_request");
  assert.equal(reply.dialogue?.schedulerBlocked, true);
  assert.doesNotMatch(reply.text, /Keep it brief|relevance to us|already have solar|multiple sites/i);
  assert.match(reply.text, /site|sorry|who.*with|what.*about/i);
});

test("dialogue manager keeps weird opener non-answers in context repair", async () => {
  const cases = [
    "this is James",
    "James where is your site",
    "what do you do there",
    "can you answer me first",
    "what are you calling about",
    "who are you again",
    "James, are you there",
    "sorry what was your question",
  ];

  for (const repMessage of cases) {
    const reply = await generateCustomerReply({
      scenario: enterpriseScenario,
      session: {
        id: `dialogue-manager-weird-opener-${repMessage.length}`,
        scenarioId: enterpriseScenario.id,
        turns: [
          { role: "persona", text: enterpriseScenario.persona.openingLine },
          { role: "user", text: repMessage },
        ],
      },
      repMessage,
    });

    assert.equal(reply.provider, "dialogue_manager", repMessage);
    assert.equal(reply.dialogue?.repAct, "context_repair_needed", repMessage);
    assert.equal(reply.dialogue?.customerAction, "repeat_gatekeeper_context_request", repMessage);
    assert.equal(reply.dialogue?.schedulerBlocked, true, repMessage);
    assert.doesNotMatch(reply.text, /Keep it brief|relevance to us|already have solar|multiple sites/i, repMessage);
    assert.match(reply.text, /sorry|who|what company|what.*about|calling from/i, repMessage);
  }
});

test("dialogue manager can be disabled for rollback", async () => {
  delete process.env.DIALOGUE_MANAGER_ENABLED;
  const repMessage =
    "say Coco is from Scotland and we help the commercial companies cut electricity cost through a funded solar install with no upfront cost to the business would you be the best best person to speak to about this";

  const reply = await generateCustomerReply({
    scenario: enterpriseScenario,
    session: {
      id: "dialogue-manager-disabled",
      scenarioId: enterpriseScenario.id,
      turns: [
        { role: "persona", text: enterpriseScenario.persona.openingLine },
        {
          role: "user",
          text: "hey James hope you have front this is Coco we got 30 seconds and I'll explain why I called",
        },
        {
          role: "persona",
          text: "Coco from where, and what is this about?",
          flowGuard: "missing_call_context",
          objectionId: "gatekeeper-who-is-this",
          objectionType: "gatekeeper",
        },
        { role: "user", text: repMessage },
      ],
    },
    repMessage,
  });

  assert.notEqual(reply.provider, "dialogue_manager");
});

test("dialogue manager classifies the v1 rep act surface", () => {
  const baseSession = {
    id: "dialogue-manager-classifier",
    scenarioId: enterpriseScenario.id,
    turns: [{ role: "persona", text: "Okay, go ahead." }],
  };

  const cases = [
    {
      text: "can I take 20 seconds to explain why I called?",
      label: "permission_ask",
    },
    {
      text: "we help commercial companies cut electricity cost through funded solar with no upfront cost",
      label: "value_pitch",
    },
    {
      text: "roughly what do you pay per kWh at the moment?",
      label: "discovery_question",
    },
    {
      text: "what are you about what are you doing",
      label: "context_repair_needed",
      session: {
        ...baseSession,
        turns: [
          ...baseSession.turns,
          {
            role: "persona",
            text: "James from where, and what is this about?",
            flowGuard: "missing_call_context",
            objectionId: "gatekeeper-who-is-this",
          },
        ],
      },
    },
    {
      text: "thanks, I will close this off",
      label: "clean_exit",
      session: {
        ...baseSession,
        turns: [
          ...baseSession.turns,
          { role: "persona", text: "We have no requirement for this. Please take us off your list." },
        ],
      },
    },
  ];

  for (const testCase of cases) {
    const classification = classifyRepTurn({
      session: testCase.session || baseSession,
      repMessage: testCase.text,
    });
    assert.equal(classification.label, testCase.label, testCase.text);
    assert.equal(typeof classification.confidence, "number");
    assert.match(classification.reason, /\w+/);
  }
});
