const assert = require("node:assert/strict");
const { test } = require("node:test");
const { APPROVED_RESPONSES, findApprovedResponse } = require("../src/approvedResponses");

test("approved response bank maps examples to objection, move, and skill", () => {
  assert.ok(APPROVED_RESPONSES.length >= 5);
  for (const example of APPROVED_RESPONSES) {
    assert.equal(typeof example.objectionId, "string");
    assert.equal(typeof example.recommendedMove, "string");
    assert.equal(typeof example.skill, "string");
    assert.equal(typeof example.text, "string");
  }
});

test("findApprovedResponse returns a relevant example without hidden persona context", () => {
  const example = findApprovedResponse({ objectionId: "send-info", recommendedMove: "clarify" });
  assert.equal(example.objectionId, "send-info");
  assert.doesNotMatch(JSON.stringify(example).toLowerCase(), /hidden|secret|alex may engage/);
});
