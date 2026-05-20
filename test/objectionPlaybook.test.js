const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  buildCoachingSuggestion,
  enterpriseObjectionPlaybook,
  hasHardNo,
  recommendedMoveForObjection,
  selectNextObjection,
} = require("../src/objectionPlaybook");
const { getScenario } = require("../src/scenarios");

const scenario = getScenario("enterprise-commercial-solar");

function session(turns = [], id = "enterprise-test") {
  return {
    id,
    scenarioId: scenario.id,
    turns,
  };
}

test("enterprise scenario has objection playbook metadata", () => {
  assert.equal(scenario.objectionPlaybookId, "enterprise-commercial-solar");
  assert.ok(scenario.persona.objections.length >= 8);
  assert.ok(scenario.persona.successConditions.length >= 4);
});

test("objection selector returns bounded non-repeating objections", () => {
  const first = selectNextObjection({
    scenario,
    session: session([
      { role: "persona", text: scenario.persona.openingLine },
      { role: "user", text: "Who am I speaking to?" },
    ]),
    repMessage: "Can I take 20 seconds?",
  });
  assert.ok(first);

  const second = selectNextObjection({
    scenario,
    session: session([
      { role: "persona", text: scenario.persona.openingLine },
      { role: "user", text: "Who am I speaking to?" },
      { role: "persona", text: first.text, objectionId: first.id },
      { role: "user", text: "Can I ask one quick question?" },
    ]),
    repMessage: "Is this site leased or owned?",
  });
  assert.ok(second);
  assert.notEqual(second.id, first.id);
});

test("identity-only first reply asks for call context instead of jumping to a later objection", () => {
  const objection = selectNextObjection({
    scenario,
    session: session([
      { role: "persona", text: scenario.persona.openingLine },
      { role: "user", text: "hey this is James" },
    ]),
    repMessage: "hey this is James",
  });

  assert.equal(objection.id, "gatekeeper-who-is-this");
});

test("hard no suppresses further objections", () => {
  const hardNoSession = session([
    { role: "persona", text: scenario.persona.openingLine },
    { role: "user", text: "Calling about solar." },
    { role: "persona", text: "Please take us off your list." },
  ]);
  assert.equal(hasHardNo(hardNoSession.turns), true);
  assert.equal(
    selectNextObjection({
      scenario,
      session: hardNoSession,
      repMessage: "Can I just explain?",
    }),
    null,
  );
});

test("coaching suggestion is stage and objection aware without hidden context", () => {
  const suggestion = buildCoachingSuggestion({
    scenario,
    session: session([
      { role: "persona", text: scenario.persona.openingLine },
      { role: "user", text: "Calling about solar." },
      {
        role: "persona",
        text: "Just send something over.",
        objectionId: "send-info",
      },
    ]),
  });

  assert.equal(suggestion.objectionId, "send-info");
  assert.match(suggestion.tryThis, /one quick question/i);
  assert.doesNotMatch(
    JSON.stringify(suggestion).toLowerCase(),
    /hidden|secret|alex may engage/,
  );
});

test("each enterprise objection has a recommended retrieval move", () => {
  for (const objection of enterpriseObjectionPlaybook.objections) {
    assert.match(recommendedMoveForObjection(objection), /^(acknowledge|clarify|ask_permission|qualify|route|commercial_explain|exit)$/);
  }
});
