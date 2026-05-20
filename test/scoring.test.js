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
  assert.ok(evaluation.categories.discovery >= 1);
  assert.equal(evaluation.skillScores.schemaVersion, 1);
  assert.equal(typeof evaluation.skillScores.permission_ask, "number");
  assert.equal(typeof evaluation.assignedDrill.skill, "string");
  assert.equal(evaluation.helpAccuracy.attempts, 0);
  assert.ok(Array.isArray(evaluation.missedOpportunities));
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
  assert.equal(evaluation.assignedDrill.skill, "hard_no_clean_exit");
  assert.ok(
    evaluation.missedOpportunities.some((item) =>
      item.toLowerCase().includes("objection"),
    ),
  );
});
