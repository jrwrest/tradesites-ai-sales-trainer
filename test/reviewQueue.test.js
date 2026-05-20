const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildReviewQueue } = require("../src/reviewQueue");

test("review queue flags low score and hard-no failures", () => {
  const queue = buildReviewQueue([
    {
      id: "s1",
      status: "ended",
      turns: [{ role: "persona", text: "Please take us off your call list." }],
      evaluation: {
        skillScores: { schemaVersion: 1, hard_no_clean_exit: 2, permission_ask: 8 },
      },
    },
  ]);

  assert.equal(queue[0].sessionId, "s1");
  assert.ok(queue[0].reasons.includes("low_score"));
  assert.ok(queue[0].reasons.includes("hard_no_failure"));
});

test("review queue flags repeated missed skills", () => {
  const sessions = [1, 2, 3].map((number) => ({
    id: `s${number}`,
    status: "ended",
    turns: [],
    evaluation: {
      skillScores: { schemaVersion: 1, discovery_question_quality: 5 },
    },
  }));

  const queue = buildReviewQueue(sessions);
  assert.ok(queue.some((item) => item.reasons.includes("repeated_missed_skill")));
});

test("review queue flags high improvement against prior average", () => {
  const queue = buildReviewQueue([
    {
      id: "early",
      status: "ended",
      endedAt: "2026-05-01T10:00:00.000Z",
      turns: [],
      evaluation: { skillScores: { schemaVersion: 1, permission_ask: 4 } },
    },
    {
      id: "later",
      status: "ended",
      endedAt: "2026-05-02T10:00:00.000Z",
      turns: [],
      evaluation: { skillScores: { schemaVersion: 1, permission_ask: 8 } },
    },
  ]);

  const item = queue.find((entry) => entry.sessionId === "later");
  assert.ok(item.reasons.includes("high_improvement"));
});
