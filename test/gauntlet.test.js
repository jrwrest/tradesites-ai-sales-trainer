const assert = require("node:assert/strict");
const { test } = require("node:test");
const { generateGauntletPlan, scoreGauntletAnswer, scoreHardNoCleanExit, scoreSituationAttempt, summarizeGauntlet } = require("../src/gauntlet");
const { COMMERCIAL_SOLAR_SITUATIONS } = require("../src/objectionPlaybook");

test("gauntlet generator avoids adjacent same objection type", () => {
  const plan = generateGauntletPlan({ rounds: 5 });
  assert.equal(plan.rounds.length, 5);
  for (let index = 1; index < plan.rounds.length; index += 1) {
    assert.notEqual(plan.rounds[index].type, plan.rounds[index - 1].type);
  }
});

test("gauntlet generator represents near-miss objection families", () => {
  const plan = generateGauntletPlan({ rounds: 5 });
  const families = new Set(plan.rounds.map((round) => round.nearMissFamily));
  assert.ok(families.has("dismissal"));
  assert.ok(families.has("authority-route"));
});

test("gauntlet generator can drill the manufacturer report playbook", () => {
  const plan = generateGauntletPlan({
    rounds: 5,
    playbookId: "manufacturer-power-payback-report",
  });

  assert.equal(plan.rounds.length, 5);
  assert.ok(plan.rounds.every((round) => round.objectionId.startsWith("power-payback-")));
});

test("gauntlet answer scoring rewards acknowledgement and next move", () => {
  const weak = scoreGauntletAnswer("Okay.");
  const strong = scoreGauntletAnswer("Fair point. Can I ask one quick question so I route this properly?");
  assert.ok(strong > weak);
});

test("gauntlet summary reports strongest and weakest families", () => {
  const summary = summarizeGauntlet([
    { nearMissFamily: "dismissal", score: 3 },
    { nearMissFamily: "dismissal", score: 5 },
    { nearMissFamily: "authority-route", score: 8 },
  ]);
  assert.equal(summary.weakestFamily, "dismissal");
  assert.equal(summary.strongestFamily, "authority-route");
});

test("gauntlet scores hard-no clean exit separately", () => {
  assert.ok(scoreHardNoCleanExit("Understood. I will close this off. Thanks.") >= 8);
  assert.ok(scoreHardNoCleanExit("But can I just explain the PPA?") <= 3);
  const summary = summarizeGauntlet([
    { nearMissFamily: "dismissal", score: 4, hardNoCleanExit: 9 },
  ]);
  assert.equal(summary.hardNoCleanExit, 9);
});

test("one generic keyword answer cannot pass every commercial-solar family", () => {
  const allFamilies = new Set(COMMERCIAL_SOLAR_SITUATIONS.map((item) => item.family));
  const passingFamilies = new Set(COMMERCIAL_SOLAR_SITUATIONS
    .filter((situation) => scoreSituationAttempt("Fair. Can I ask what site fit?", situation) >= 7)
    .map((situation) => situation.family));
  assert.ok(passingFamilies.size < allFamilies.size / 3, `${passingFamilies.size} generic family passes`);
});

test("an adversarial union of family and method keywords cannot manufacture coverage", () => {
  const stuffed = [
    "Fair, I understand. Might I ask what specifically applies?",
    "Company email existing solar previous review lease landlord cost catch guarantee",
    "long-term contract callback broker consultant renewal old roof roof space daytime demand",
    "disruption underperformance maintenance loan finance director operations stakeholder",
    "projected savings electricity spend unit rate roof data ESG net-zero approved suppliers.",
  ].join(" ");
  for (const methodId of ["hormozi-sales-2026", "jeremy-miner-nepq-ppa"]) {
    const passing = COMMERCIAL_SOLAR_SITUATIONS.filter(
      (situation) => scoreSituationAttempt(stuffed, situation, { manifest: { id: methodId } }) >= 7,
    );
    assert.deepEqual(passing.map((item) => item.id), [], `${methodId} accepted stuffed evidence`);
  }
});

test("a compact union using alternate situation phrases cannot manufacture coverage", () => {
  const compactStuffed = [
    "Fair. Might I ask what specifically applies? calling information expansion stopped roof rights funded route assumptions",
    "property plans specific time broker review point small site output landlord evidence green imagery estates rough band",
    "fifteen thousand replacing skylights overnight funding kwh relocate heritage production forecast failure security",
    "finance team inputs existing plan board meeting?",
  ].join(" ");
  assert.ok(compactStuffed.split(/\s+/).length <= 57);
  for (const methodId of ["hormozi-sales-2026", "jeremy-miner-nepq-ppa"]) {
    const passing = COMMERCIAL_SOLAR_SITUATIONS.filter(
      (situation) => scoreSituationAttempt(compactStuffed, situation, { manifest: { id: methodId } }) >= 7,
    );
    assert.deepEqual(passing.map((item) => item.id), [], `${methodId} accepted compact stuffed evidence`);
  }
});

test("focused situation handling can still pass under either selected method", () => {
  const situation = COMMERCIAL_SOLAR_SITUATIONS.find((item) => item.id === "existing-solar");
  assert.ok(scoreSituationAttempt(
    "Fair. Which gap is left by the current solar system: daytime demand, expansion, or another site?",
    situation,
    { manifest: { id: "hormozi-sales-2026" } },
  ) >= 7);
  assert.ok(scoreSituationAttempt(
    "That makes sense. When you say covered, might the current solar still leave daytime demand or another site?",
    situation,
    { manifest: { id: "jeremy-miner-nepq-ppa" } },
  ) >= 7);
});

test("any question after a hard opt-out fails the clean-exit score", () => {
  assert.ok(scoreHardNoCleanExit("Understood. I will remove you. Can I ask one last question?") <= 2);
  const optOut = COMMERCIAL_SOLAR_SITUATIONS.find((item) => item.family === "source_opt_out");
  assert.ok(scoreSituationAttempt("Understood. I will remove you. Can I ask one last question?", optOut) <= 2);
});
