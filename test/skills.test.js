const assert = require("node:assert/strict");
const { test } = require("node:test");
const { scoreTranscript } = require("../src/scoring");
const { getScenario } = require("../src/scenarios");
const { SKILLS, assignNextDrill } = require("../src/skills");
const sampleFoodsCall = require("./fixtures/sample-foods-solar-call.json");

test("skill taxonomy has stable unique ids", () => {
  assert.equal(SKILLS.length, new Set(SKILLS).size);
  assert.ok(SKILLS.includes("permission_ask"));
  assert.ok(SKILLS.includes("hard_no_clean_exit"));
  assert.ok(SKILLS.includes("next_step_close"));
});

test("hard-no failure assigns hard_no_clean_exit drill", () => {
  const evaluation = scoreTranscript({
    scenario: getScenario("commercial-solar-rejection"),
    turns: sampleFoodsCall.turns,
  });

  assert.ok(evaluation.skillScores.hard_no_clean_exit <= 4);
  assert.equal(evaluation.assignedDrill.skill, "hard_no_clean_exit");
});

test("clean hard-no exit scores well without a booked meeting", () => {
  const evaluation = scoreTranscript({
    scenario: getScenario("commercial-solar-rejection"),
    turns: [
      { role: "persona", text: "Hello, who is this?" },
      { role: "user", text: "James from Solar Future Scotland. Can I take 20 seconds?" },
      { role: "persona", text: "We have no requirement. Take us off your call list." },
      { role: "user", text: "Understood, I will not push it. Thanks for taking the call. Bye." },
    ],
  });

  assert.ok(evaluation.skillScores.hard_no_clean_exit >= 8);
  assert.notEqual(evaluation.assignedDrill.skill, "hard_no_clean_exit");
});

test("assignNextDrill returns null when all skills are strong", () => {
  const evaluation = {
    skillScores: Object.fromEntries(SKILLS.map((skill) => [skill, 8])),
  };

  assert.equal(assignNextDrill(evaluation), null);
});
