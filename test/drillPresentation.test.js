const assert = require("node:assert/strict");
const { test } = require("node:test");
const { describeAssignedDrill, humanizeSkill } = require("../src/drillPresentation");

test("humanizeSkill formats stable skill ids for the UI", () => {
  assert.equal(humanizeSkill("hard_no_clean_exit"), "Hard No Clean Exit");
});

test("describeAssignedDrill gives display text for the next drill panel", () => {
  const display = describeAssignedDrill({
    skill: "discovery_question_quality",
    reason: "Lowest priority weak skill scored 4/10.",
    nextDueAt: "2026-05-21T10:00:00.000Z",
  });

  assert.equal(display.title, "Next Drill");
  assert.equal(display.skillLabel, "Discovery Question Quality");
  assert.equal(display.reason, "Lowest priority weak skill scored 4/10.");
  assert.equal(display.nextDueAt, "2026-05-21T10:00:00.000Z");
});

test("describeAssignedDrill handles no assigned drill", () => {
  const display = describeAssignedDrill(null);
  assert.equal(display.title, "No Drill Assigned");
  assert.equal(display.skillLabel, "Keep practising");
});
