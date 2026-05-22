const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const { generateCustomerReply } = require("../src/brain");
const { classifyRepTurn } = require("../src/dialogueManager");
const { getScenario } = require("../src/scenarios");

const enterpriseScenario = getScenario("enterprise-commercial-solar");

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
    turns: [{ role: "persona", text: enterpriseScenario.persona.openingLine }],
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
