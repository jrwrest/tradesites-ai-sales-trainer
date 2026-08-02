const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  REQUIRED_METHOD_READINESS_FAMILIES,
  assessMethodReadiness,
  buildReadinessCallResults,
  loadEvalFixtures,
  quadraticWeightedKappa,
  runFixtureEval,
} = require("../src/evalHarness");

const EXPECTED_READINESS_FAMILIES = [
  "gatekeeper",
  "send_info",
  "existing_solar",
  "prior_solar",
  "lease_landlord",
  "price_cost",
  "credibility_catch",
  "long_contract",
  "busy_callback",
  "source_opt_out",
  "broker_incumbent",
  "tied_contract_renewal",
  "roof_site_move_size",
  "disruption_performance_maintenance_loan",
  "stakeholder",
  "numbers",
  "esg",
];

function readinessCall(family, index, score = 75, gateStatus = "pass") {
  return {
    id: `${family}-${index}`,
    situationFamily: family,
    overallScore: score,
    criticalGates: [
      { id: "respect_hard_no", status: gateStatus },
      { id: "truthful_claims", status: gateStatus },
      { id: "fit_before_commitment", status: gateStatus },
    ],
  };
}

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

test("method readiness requires broad scenario, ethical, score-floor, and repeat-call evidence", () => {
  assert.equal(typeof assessMethodReadiness, "function");
  assert.deepEqual([...REQUIRED_METHOD_READINESS_FAMILIES].sort(), [...EXPECTED_READINESS_FAMILIES].sort());
  const callResults = EXPECTED_READINESS_FAMILIES.flatMap((family) => [
    readinessCall(family, 1, 72),
    readinessCall(family, 2, 78),
    readinessCall(family, 3, 81),
  ]);

  const assessment = assessMethodReadiness({
    methodPack: { id: "test-method", version: "1.0.0" },
    callResults,
    minimumRealisticCallScore: 60,
    minimumCallsPerFamily: 3,
    minimumPassingRate: 0.8,
  });

  assert.equal(assessment.ready, true);
  assert.deepEqual(
    Object.fromEntries(assessment.checks.map((check) => [check.id, check.status])),
    {
      scenario_family_coverage: "pass",
      ethical_gates: "pass",
      realistic_call_score_floor: "pass",
      multi_call_consistency: "pass",
    },
  );
});

test("method readiness rejects missing families, a failed ethical gate, and one lucky score", () => {
  assert.equal(typeof assessMethodReadiness, "function");
  const callResults = EXPECTED_READINESS_FAMILIES
    .filter((family) => family !== "esg")
    .flatMap((family) => [
      readinessCall(family, 1, family === "gatekeeper" ? 95 : 75),
      readinessCall(family, 2, family === "gatekeeper" ? 25 : 76),
      readinessCall(family, 3, family === "gatekeeper" ? 20 : 77),
    ]);
  callResults[0].criticalGates[0].status = "fail";

  const assessment = assessMethodReadiness({
    methodPack: { id: "test-method", version: "1.0.0" },
    callResults,
    minimumRealisticCallScore: 60,
    minimumCallsPerFamily: 3,
    minimumPassingRate: 0.8,
  });
  const checks = Object.fromEntries(assessment.checks.map((check) => [check.id, check]));

  assert.equal(assessment.ready, false);
  assert.equal(checks.scenario_family_coverage.status, "fail");
  assert.deepEqual(checks.scenario_family_coverage.missingFamilies, ["esg"]);
  assert.equal(checks.ethical_gates.status, "fail");
  assert.equal(checks.realistic_call_score_floor.status, "fail");
  assert.equal(checks.multi_call_consistency.status, "fail");
  assert.ok(checks.multi_call_consistency.passingRate < 0.8);
});

test("production readiness can additionally require three consistent complete-call simulations", () => {
  const callResults = EXPECTED_READINESS_FAMILIES.flatMap((family) => [
    readinessCall(family, 1, 75), readinessCall(family, 2, 76), readinessCall(family, 3, 77),
  ]);
  const incomplete = assessMethodReadiness({
    methodPack: { id: "test-method", version: "1.0.0" },
    callResults,
    fullCallResults: [readinessCall("full", 1, 82), readinessCall("full", 2, 84)],
  });
  assert.equal(incomplete.ready, false);
  assert.equal(incomplete.checks.find((check) => check.id === "full_call_simulation").status, "fail");

  const complete = assessMethodReadiness({
    methodPack: { id: "test-method", version: "1.0.0" },
    callResults,
    fullCallResults: [
      { ...readinessCall("full", 1, 82), overallConfidence: "medium" },
      { ...readinessCall("full", 2, 84), overallConfidence: "high" },
      { ...readinessCall("full", 3, 86), overallConfidence: "medium" },
    ],
  });
  assert.equal(complete.ready, true);
  assert.equal(complete.checks.find((check) => check.id === "full_call_simulation").status, "pass");
});

test("readiness credits a clean hard-no exit without rewarding another sales question", () => {
  const methodPack = { id: "test-method", version: "1.0.0" };
  const [result] = buildReadinessCallResults([{
    id: "dnc-gauntlet",
    status: "ended",
    endedAt: "2026-08-02T12:00:00.000Z",
    methodPack,
    evaluation: { methodEvaluation: { overallScore: 20, criticalGates: [] } },
    gauntlet: { results: [{ round: 1, situationFamily: "source_opt_out", score: 4, hardNoCleanExit: 9, responseFingerprint: "unique-dnc" }] },
  }], methodPack);

  assert.equal(result.overallScore, 90);
  assert.equal(result.criticalGates[0].status, "pass");
});

test("readiness rejects an answer fingerprint reused as evidence", () => {
  const methodPack = { id: "test-method", version: "1.0.0" };
  const sessions = ["gatekeeper", "numbers"].map((family, index) => ({
    id: `reused-${index}`,
    status: "ended",
    endedAt: `2026-08-02T12:0${index}:00.000Z`,
    methodPack,
    evaluation: { methodEvaluation: { overallScore: 90, criticalGates: [] } },
    gauntlet: { results: [{ round: 1, situationFamily: family, score: 9, responseFingerprint: "same-answer" }] },
  }));
  const results = buildReadinessCallResults(sessions, methodPack);
  assert.ok(results.every((result) => result.overallScore === 0));
  assert.ok(results.every((result) => result.evidenceIntegrity === "reused_response"));
});

test("readiness rejects near-identical answers with inert unique suffixes", () => {
  const methodPack = { id: "test-method", version: "1.0.0" };
  const baseTokens = ["current", "solar", "system", "daytime", "demand", "another", "site"];
  const sessions = ["x1", "x2", "x3"].map((suffix, index) => ({
    id: `near-duplicate-${index}`,
    status: "ended",
    endedAt: `2026-08-02T13:0${index}:00.000Z`,
    methodPack,
    evaluation: { methodEvaluation: { overallScore: 90, criticalGates: [] } },
    gauntlet: { results: [{
      round: 1,
      situationFamily: "existing_solar",
      score: 9,
      responseFingerprint: `unique-${suffix}`,
      responseTokenHashes: [...baseTokens, suffix],
    }] },
  }));
  const results = buildReadinessCallResults(sessions, methodPack);
  assert.ok(results.every((result) => result.overallScore === 0));
  assert.ok(results.every((result) => result.evidenceIntegrity === "reused_response"));
});

test("a gate needing human review cannot produce a ready label", () => {
  const callResults = EXPECTED_READINESS_FAMILIES.flatMap((family) => [
    readinessCall(family, 1, 75), readinessCall(family, 2, 76), readinessCall(family, 3, 77),
  ]);
  callResults.at(-1).criticalGates[1].status = "review";
  const assessment = assessMethodReadiness({
    methodPack: { id: "test-method", version: "1.0.0" },
    callResults,
  });
  assert.equal(assessment.ready, false);
  assert.equal(assessment.checks.find((check) => check.id === "ethical_gates").status, "review");

  const fullCallAssessment = assessMethodReadiness({
    methodPack: { id: "test-method", version: "1.0.0" },
    callResults: EXPECTED_READINESS_FAMILIES.flatMap((family) => [
      readinessCall(family, 1, 75), readinessCall(family, 2, 76), readinessCall(family, 3, 77),
    ]),
    fullCallResults: [
      { ...readinessCall("full", 1, 82), overallConfidence: "medium" },
      { ...readinessCall("full", 2, 84), overallConfidence: "high" },
      { ...readinessCall("full", 3, 86, "review"), overallConfidence: "medium" },
    ],
  });
  assert.equal(fullCallAssessment.ready, false);
  assert.equal(fullCallAssessment.checks.find((check) => check.id === "full_call_simulation").status, "fail");
});
