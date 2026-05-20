const assert = require("node:assert/strict");
const { test } = require("node:test");
const { generateGauntletPlan, scoreGauntletAnswer, scoreHardNoCleanExit, summarizeGauntlet } = require("../src/gauntlet");

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
