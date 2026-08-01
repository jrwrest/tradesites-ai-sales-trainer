const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadEvalFixtures, quadraticWeightedKappa, runFixtureEval } = require("../src/evalHarness");

test("training eval fixtures define score bands and planned drill checks", async () => {
  const fixtures = await loadEvalFixtures();
  assert.equal(fixtures.length, 12);
  for (const fixture of fixtures) {
    assert.equal(typeof fixture.id, "string");
    assert.equal(typeof fixture.scenarioId, "string");
    assert.ok(Array.isArray(fixture.turns));
    assert.ok(fixture.turns.length >= 2);
    assert.ok(fixture.expected.method?.overallScore);
    assert.ok(Object.keys(fixture.expected.method.behaviorLabels || {}).length >= 1);
  }
});

test("training eval harness passes current deterministic fixture checks", async () => {
  const summary = await runFixtureEval();
  assert.equal(summary.fixtureCount, 12);
  assert.equal(summary.failed, 0);
  assert.ok(summary.agreement >= 0.9);
  assert.ok(summary.methodLabelCount >= 50);
  assert.ok(summary.weightedKappa >= 0.7);
  assert.equal(summary.pending, 0);
});

test("quadratic weighted kappa distinguishes agreement from ordinal drift", () => {
  assert.equal(quadraticWeightedKappa([0, 1, 2, 3, 4], [0, 1, 2, 3, 4]), 1);
  assert.ok(quadraticWeightedKappa([0, 0, 4, 4], [1, 1, 3, 3]) > 0);
  assert.ok(quadraticWeightedKappa([0, 0, 4, 4], [4, 4, 0, 0]) < 0);
});
