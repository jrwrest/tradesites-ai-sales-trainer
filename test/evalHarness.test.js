const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadEvalFixtures, runFixtureEval } = require("../src/evalHarness");

test("training eval fixtures define score bands and planned drill checks", async () => {
  const fixtures = await loadEvalFixtures();
  assert.equal(fixtures.length, 5);
  for (const fixture of fixtures) {
    assert.equal(typeof fixture.id, "string");
    assert.equal(typeof fixture.scenarioId, "string");
    assert.ok(Array.isArray(fixture.turns));
    assert.ok(fixture.turns.length >= 2);
    assert.ok(fixture.expected.overallScore);
    assert.ok(Object.keys(fixture.expected.categories).length >= 1);
    assert.equal(typeof fixture.expected.assignedDrillSkill, "string");
    assert.ok(Array.isArray(fixture.expected.forbiddenLeakage));
  }
});

test("training eval harness passes current deterministic fixture checks", async () => {
  const summary = await runFixtureEval();
  assert.equal(summary.fixtureCount, 5);
  assert.equal(summary.failed, 0);
  assert.ok(summary.agreement >= 0.9);
  assert.equal(summary.pending, 0);
});
