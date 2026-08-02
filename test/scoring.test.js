const assert = require("node:assert/strict");
const { test } = require("node:test");
const { scoreTranscript } = require("../src/scoring");
const { getScenario, scenarios } = require("../src/scenarios");
const sampleFoodsCall = require("./fixtures/sample-foods-solar-call.json");

test("all bundled scenarios are valid", () => {
  assert.ok(scenarios.length >= 1);
});

test("scores normal transcript with expected fields", () => {
  const evaluation = scoreTranscript({
    scenario: getScenario("roofing-owner"),
    turns: [
      {
        role: "user",
        text: "Quick question, how are you currently getting roofing leads?",
        at: new Date().toISOString(),
      },
      {
        role: "persona",
        text: "Mostly referrals, random enquiries are hit and miss.",
        at: new Date().toISOString(),
      },
      {
        role: "user",
        text: "That makes sense. If we found one follow-up gap, would you book a short review?",
        at: new Date().toISOString(),
      },
    ],
  });

  assert.equal(evaluation.scenarioId, "roofing-owner");
  assert.equal(typeof evaluation.overallScore, "number");
  assert.ok(evaluation.categories.diagnose >= 1);
  assert.equal(evaluation.skillScores.schemaVersion, 1);
  assert.equal(typeof evaluation.skillScores.permission_ask, "number");
  assert.equal(typeof evaluation.assignedDrill.skill, "string");
  assert.equal(evaluation.helpAccuracy.attempts, 0);
  assert.ok(Array.isArray(evaluation.missedOpportunities));
  assert.equal(evaluation.methodEvaluation.methodPack.id, "hormozi-sales-2026");
  assert.equal(typeof evaluation.methodEvaluation.overallScore, "number");
  assert.equal(evaluation.methodScore, evaluation.methodEvaluation.overallScore);
  assert.equal(evaluation.overallScore, Math.round(evaluation.methodScore / 10));
  assert.equal(typeof evaluation.legacyOverallScore, "number");
  assert.equal(typeof evaluation.legacyCategories.discovery, "number");
  assert.equal(
    evaluation.methodEvaluation.behaviors.find((item) => item.id === "bant_budget").score,
    0,
  );
});

test("commercial solar coaching never leaks lead-generation discovery advice", () => {
  const solarScenario = getScenario("enterprise-commercial-solar");
  const evaluation = scoreTranscript({
    scenario: solarScenario,
    turns: [
      { role: "persona", text: solarScenario.persona.openingLine },
      { role: "user", text: "James from BrightTrade Solar. Can I take 20 seconds?" },
      { role: "persona", text: "What is this about?" },
    ],
  });

  assert.equal(evaluation.missedOpportunities.some((item) => /lead flow|follow-up process/i.test(item)), false);
  assert.equal(
    evaluation.missedOpportunities.some((item) => /energy|electricity|site|decision process/i.test(item)),
    true,
  );
});

test("site ownership question counts as commercial solar discovery", () => {
  const solarScenario = getScenario("enterprise-commercial-solar");
  const evaluation = scoreTranscript({
    scenario: solarScenario,
    turns: [
      { role: "persona", text: solarScenario.persona.openingLine },
      { role: "user", text: "Do you own the site or lease the building?" },
      { role: "persona", text: "Some sites are owned and some leased." },
    ],
  });

  assert.ok(evaluation.legacyCategories.discovery >= 7);
  assert.equal(
    evaluation.missedOpportunities.some((item) => /energy position|site control|decision process/i.test(item)),
    false,
  );
});

test("terminal hard-no coaching does not recommend unpacking or closing", () => {
  const solarScenario = getScenario("enterprise-commercial-solar");
  const evaluation = scoreTranscript({
    scenario: solarScenario,
    turns: [
      { role: "user", text: "James from BrightTrade Solar. Can I take 20 seconds?" },
      { role: "persona", text: "We have no requirement. Take us off your call list." },
    ],
  });

  assert.equal(
    evaluation.missedOpportunities.some((item) => /unpack objections|specific next step|energy position|site control/i.test(item)),
    false,
  );
  assert.equal(
    evaluation.missedOpportunities.some((item) => /hard no|end the call|exit cleanly/i.test(item)),
    true,
  );
});

test("post-call scoring includes help accuracy", () => {
  const evaluation = scoreTranscript({
    scenario: getScenario("enterprise-commercial-solar"),
    turns: [
      { role: "persona", text: "Just send something over." },
      { role: "user", text: "Fair. Can I ask one question first?" },
    ],
    helpAttempts: [
      { selectedMove: "clarify", recommendedMove: "clarify", correct: true },
      { selectedMove: "exit", recommendedMove: "clarify", correct: false },
    ],
  });

  assert.equal(evaluation.helpAccuracy.attempts, 2);
  assert.equal(evaluation.helpAccuracy.correct, 1);
  assert.equal(evaluation.helpAccuracy.accuracy, 0.5);
});

test("scores the food distributor rejection example as a weak call", () => {
  const evaluation = scoreTranscript({
    scenario: getScenario("commercial-solar-rejection"),
    turns: sampleFoodsCall.turns,
  });

  assert.equal(evaluation.scenarioId, "commercial-solar-rejection");
  assert.ok(evaluation.overallScore <= 5);
  assert.ok(evaluation.skillScores.hard_no_clean_exit <= 4);
  assert.equal(
    evaluation.methodEvaluation.criticalGates.find((item) => item.id === "respect_hard_no").status,
    "fail",
  );
  assert.equal(evaluation.assignedDrill.skill, "hard_no_clean_exit");
  assert.ok(
    evaluation.missedOpportunities.some((item) =>
      /hard no|exit cleanly|contact request/i.test(item),
    ),
  );
});
