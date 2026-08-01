const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  DEFAULT_METHOD_PACK_ID,
  loadMethodPack,
  validateMethodPack,
} = require("../src/methodPack");

test("default Hormozi method pack is versioned and source-grounded", () => {
  const pack = loadMethodPack();
  const validation = validateMethodPack(pack);

  assert.equal(DEFAULT_METHOD_PACK_ID, "hormozi-sales-2026");
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.match(pack.manifest.version, /^1\.0\.0-beta\.\d+$/);
  assert.equal(pack.manifest.primarySource.url, "https://www.youtube.com/watch?v=StVqS0jD7Ls");
  assert.ok(pack.manifest.sourceSections.every((section) => Number.isInteger(section.startSeconds)));
});

test("method pack maps the complete in-call framework and ethical gates", () => {
  const pack = loadMethodPack();
  const frameworks = new Set(pack.framework.frameworks.map((item) => item.id));
  const behaviorIds = new Set(pack.framework.behaviors.map((item) => item.id));
  const criticalGateIds = new Set(pack.rubric.criticalGates.map((item) => item.id));

  for (const expected of ["proof_promise_plan", "bant", "closer", "three_pillar_pitch", "aaa"]) {
    assert.ok(frameworks.has(expected), `missing framework ${expected}`);
  }
  for (const expected of [
    "ppp_proof",
    "ppp_promise",
    "ppp_plan",
    "closer_clarify",
    "closer_label",
    "closer_overview_pain",
    "closer_sell_vacation",
    "closer_explain_concerns",
    "closer_reinforce",
    "bant_budget",
    "bant_authority",
    "bant_need",
    "bant_timing",
    "aaa_acknowledge",
    "aaa_associate",
    "aaa_ask",
    "clean_ask",
  ]) {
    assert.ok(behaviorIds.has(expected), `missing behavior ${expected}`);
  }
  for (const expected of [
    "respect_hard_no",
    "truthful_claims",
    "respect_real_authority",
    "fit_before_commitment",
  ]) {
    assert.ok(criticalGateIds.has(expected), `missing critical gate ${expected}`);
  }
});

test("every behavior and drill resolves to source provenance and one constraint", () => {
  const pack = loadMethodPack();
  const sourceIds = new Set(pack.manifest.sourceSections.map((section) => section.id));
  const behaviorIds = new Set(pack.framework.behaviors.map((item) => item.id));

  for (const behavior of pack.framework.behaviors) {
    assert.ok(behavior.sourceRefs.length > 0, `${behavior.id} has no source`);
    assert.ok(behavior.sourceRefs.every((sourceRef) => sourceIds.has(sourceRef)));
    assert.ok(Array.isArray(behavior.positiveEvidence));
    assert.ok(Array.isArray(behavior.counterEvidence));
  }
  for (const drill of pack.drills.drills) {
    assert.equal(typeof drill.constraintId, "string");
    assert.ok(behaviorIds.has(drill.behaviorId), `${drill.id} points to unknown behavior`);
    assert.equal(drill.focusBehaviors.length, 1, `${drill.id} must train one constraint`);
    assert.equal(drill.focusBehaviors[0], drill.behaviorId);
  }
});

test("method pack loader rejects path traversal and unknown packs", () => {
  assert.throws(() => loadMethodPack("../data"), /Invalid method pack id/);
  assert.throws(() => loadMethodPack("missing-pack"), /Unknown method pack/);
});
