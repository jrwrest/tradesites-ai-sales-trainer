const assert = require("node:assert/strict");
const { test } = require("node:test");
const { evaluateMethod } = require("../src/methodEvaluator");

test("unobserved behaviors score zero with low confidence instead of a neutral default", () => {
  const evaluation = evaluateMethod({
    turns: [
      { role: "persona", text: "Hello, who is this?" },
      { role: "user", text: "James from Tradesites." },
    ],
  });

  const clarify = evaluation.behaviors.find((item) => item.id === "closer_clarify");
  assert.equal(clarify.score, 0);
  assert.equal(clarify.confidence, "low");
  assert.equal(clarify.evidence.length, 0);
  assert.equal(clarify.counterEvidence.length, 0);
  assert.equal(evaluation.methodPack.id, "hormozi-sales-2026");
  assert.equal(evaluation.methodPack.version, "1.0.0-beta.2");
});

test("strong sales conversation produces turn-level evidence across the core frameworks", () => {
  const evaluation = evaluateMethod({
    turns: [
      { role: "persona", text: "Alex speaking. What is this about?" },
      { role: "user", text: "We have helped 14 manufacturers find avoidable energy costs. By the end of this call, we can determine whether there is a useful savings case. First I will ask a few questions, then I will outline the three requirements, and we can decide if it is a fit or not. Fair?" },
      { role: "persona", text: "Okay, go ahead." },
      { role: "user", text: "What prompted you to look at this now, and what outcome are you trying to reach?" },
      { role: "persona", text: "Our bill rose 30% and our last audit produced no action. We need a board plan this quarter." },
      { role: "user", text: "So it sounds like costs are rising, you need an approved plan this quarter, and the gap is turning audit data into action. Have I got that right? What have you tried since that audit, and what is another quarter of delay costing?" },
      { role: "persona", text: "Yes. We tried supplier quotes. Delay is about £20,000. Finance and the board approve anything above £10,000." },
      { role: "user", text: "What budget range can finance support, who besides the board influences approval, which requirement matters most, and when could implementation begin?" },
      { role: "persona", text: "Budget is available if the payback is under three years. Procurement and estates review it. We can start in October." },
      { role: "user", text: "The outcome is an investable plan. The bridge has exactly three pillars: verified interval data, site engineering, and a finance case. Your supplier quotes covered price but lacked the other two legs, like a three-legged stool with one leg missing." },
      { role: "persona", text: "That makes sense. What happens next?" },
      { role: "user", text: "Shall we book the paid diagnostic with estates and finance for Tuesday at 10?" },
    ],
  });

  for (const id of [
    "ppp_proof", "ppp_promise", "ppp_plan", "closer_clarify", "closer_label",
    "closer_overview_pain", "bant_budget", "bant_authority", "bant_need", "bant_timing",
    "closer_sell_vacation", "pitch_three_pillars", "pitch_past_attempt_link", "pitch_analogy", "clean_ask",
  ]) {
    const behavior = evaluation.behaviors.find((item) => item.id === id);
    assert.ok(behavior.score >= 3, `${id} scored ${behavior.score}`);
    assert.ok(behavior.evidence.length >= 1, `${id} has no evidence`);
    assert.equal(typeof behavior.evidence[0].turnIndex, "number");
    assert.equal(typeof behavior.evidence[0].excerpt, "string");
  }
  assert.ok(evaluation.overallScore >= 70);
  assert.equal(evaluation.assignedDrill, null);
});

test("pushing after an explicit hard no fails the gate and caps the score", () => {
  const evaluation = evaluateMethod({
    turns: [
      { role: "persona", text: "We have no requirement. Take us off your call list." },
      { role: "user", text: "Before you go, do you have solar? A PPA has no upfront cost, so let me explain it." },
    ],
  });

  const gate = evaluation.criticalGates.find((item) => item.id === "respect_hard_no");
  assert.equal(gate.status, "fail");
  assert.ok(gate.evidence.length >= 2);
  assert.ok(evaluation.overallScore <= 39);
  assert.equal(evaluation.assignedDrill.behaviorId, "hard_no_clean_exit");
});

test("a clean terminal exit passes the observed hard-no gate", () => {
  const evaluation = evaluateMethod({
    turns: [
      { role: "persona", text: "We have no requirement. Please do not call again." },
      { role: "user", text: "Understood. I will take you off the list and will not push. Thanks, bye." },
    ],
  });

  const gate = evaluation.criticalGates.find((item) => item.id === "respect_hard_no");
  const behavior = evaluation.behaviors.find((item) => item.id === "hard_no_clean_exit");
  assert.equal(gate.status, "pass");
  assert.ok(behavior.score >= 3);
  assert.notEqual(evaluation.assignedDrill?.behaviorId, "hard_no_clean_exit");
});

test("unverifiable truth and fit gates remain reviewable rather than auto-passing", () => {
  const evaluation = evaluateMethod({
    turns: [
      { role: "persona", text: "What do you do?" },
      { role: "user", text: "We have helped hundreds of companies. Can I ask what prompted this?" },
    ],
  });

  assert.equal(evaluation.criticalGates.find((item) => item.id === "truthful_claims").status, "review");
  assert.equal(evaluation.criticalGates.find((item) => item.id === "fit_before_commitment").status, "not_observed");
});
