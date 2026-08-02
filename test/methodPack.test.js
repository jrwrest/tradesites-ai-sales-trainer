const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  DEFAULT_METHOD_PACK_ID,
  listMethodPacks,
  loadMethodPack,
  resolveMethodPack,
  validateMethodRegistry,
  validateMethodPack,
} = require("../src/methodPack");
const { applyMethodCoaching } = require("../src/methodCoaching");

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
  for (const [techniqueId, technique] of Object.entries(pack.coaching.techniques)) {
    assert.ok(technique.sourceRefs.length > 0, `${techniqueId} coaching has no source`);
    assert.ok(
      technique.sourceRefs.every((sourceRef) => sourceIds.has(sourceRef)),
      `${techniqueId} coaching has an unknown source`,
    );
  }
});

test("method pack loader rejects path traversal and unknown packs", () => {
  assert.throws(() => loadMethodPack("../data"), /Invalid method pack id/);
  assert.throws(() => loadMethodPack("missing-pack"), /Unknown method pack/);
});

test("closed method registry lists only allowlisted versioned coaching methods", () => {
  assert.equal(typeof listMethodPacks, "function");

  const methods = listMethodPacks();

  assert.deepEqual(methods, [
    {
      id: "hormozi-sales-2026",
      version: "1.0.0-beta.3",
      displayName: "Hormozi Sales Operating Method — 2026 Talk Adaptation",
      status: "source-grounded-beta",
    },
  ]);
  assert.equal("framework" in methods[0], false, "list endpoint metadata must stay bounded");
  assert.equal("rubric" in methods[0], false, "list endpoint metadata must stay bounded");
});

test("method registry resolves an exact id and version pin", () => {
  assert.equal(typeof resolveMethodPack, "function");

  const pack = resolveMethodPack({
    id: "hormozi-sales-2026",
    version: "1.0.0-beta.3",
  });

  assert.equal(pack.manifest.id, "hormozi-sales-2026");
  assert.equal(pack.manifest.version, "1.0.0-beta.3");
});

test("new method-owned coaching uses a new pin while beta.2 remains legacy-compatible", () => {
  const current = resolveMethodPack({
    id: "hormozi-sales-2026",
    version: "1.0.0-beta.3",
  });
  const legacy = resolveMethodPack({
    id: "hormozi-sales-2026",
    version: "1.0.0-beta.2",
  });
  const baseSuggestion = {
    stage: "discovery",
    objectionId: null,
    recommendedMove: "clarify",
    suggestions: ["Scenario-owned guidance"],
    tryThis: "What changed?",
  };

  const currentCoaching = applyMethodCoaching({ suggestion: baseSuggestion, methodPack: current });
  const legacyCoaching = applyMethodCoaching({ suggestion: baseSuggestion, methodPack: legacy });

  assert.equal(current.manifest.version, "1.0.0-beta.3");
  assert.equal(current.coaching.mode, "method_owned");
  assert.equal(currentCoaching.methodMetadata.version, "1.0.0-beta.3");
  assert.ok(currentCoaching.suggestions.length > baseSuggestion.suggestions.length);
  assert.equal(legacy.manifest.version, "1.0.0-beta.2");
  assert.equal(legacy.coaching.mode, "legacy_passthrough");
  assert.deepEqual(legacyCoaching, baseSuggestion);
});

test("method registry fails closed for traversal, unknown ids, and unavailable versions", () => {
  assert.equal(typeof resolveMethodPack, "function");

  for (const pin of [
    { id: "../data", version: "1.0.0" },
    { id: "missing-pack", version: "1.0.0" },
    { id: "hormozi-sales-2026", version: "0.0.0" },
  ]) {
    assert.throws(
      () => resolveMethodPack(pin),
      (error) => error && error.code === "METHOD_UNAVAILABLE",
      JSON.stringify(pin),
    );
  }
});

test("method registry validation rejects duplicate pins and malformed entries", () => {
  const duplicate = validateMethodRegistry([
    { id: "hormozi-sales-2026", version: "1.0.0-beta.2" },
    { id: "hormozi-sales-2026", version: "1.0.0-beta.2" },
  ]);
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.errors.some((error) => error.includes("duplicate method pin")));

  const malformed = validateMethodRegistry([
    { id: "../data", version: "not-a-version" },
  ]);
  assert.equal(malformed.valid, false);
  assert.ok(malformed.errors.some((error) => error.includes("invalid method id")));
  assert.ok(malformed.errors.some((error) => error.includes("invalid method version")));
});
