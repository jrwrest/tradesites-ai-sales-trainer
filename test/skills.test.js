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
  assert.ok(SKILLS.includes("paid_report_close"));
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

test("manufacturer report call scores the script-specific gates", () => {
  const evaluation = scoreTranscript({
    scenario: getScenario("manufacturer-power-payback-report"),
    turns: [
      { role: "persona", text: "Stuart speaking. Who is this?" },
      {
        role: "user",
        text: "James from Solar Future Scotland. We build a Power Payback Report for manufacturers. Can I take 20 seconds?",
      },
      { role: "persona", text: "Make it quick." },
      {
        role: "user",
        text: "Roughly, are you above GBP 50,000 a year on electricity, and do you own or lease the site?",
      },
      { role: "persona", text: "We are above that and we own the building." },
      {
        role: "user",
        text: "Makes sense. Who would normally approve a GBP 500 diagnostic report: you, finance, or procurement?",
      },
      { role: "persona", text: "I would need finance to sign off." },
      {
        role: "user",
        text: "Fair. The GBP 500 Power Payback Report is credited back if you proceed. If the fee is the only concern, we can do GBP 0 down, card on file, and only invoice if it shows at least 10% savings.",
      },
    ],
  });

  assert.ok(evaluation.skillScores.electricity_spend_gate >= 7);
  assert.ok(evaluation.skillScores.site_control_gate >= 7);
  assert.ok(evaluation.skillScores.decision_process_map >= 7);
  assert.ok(evaluation.skillScores.paid_report_close >= 7);
  assert.ok(evaluation.skillScores.risk_reversal_fallback >= 7);
  assert.ok(
    evaluation.strengths.some((strength) =>
      strength.toLowerCase().includes("paid report"),
    ),
  );
});
