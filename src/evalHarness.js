const fs = require("node:fs/promises");
const path = require("node:path");
const { scoreTranscript } = require("./scoring");
const { getScenario } = require("./scenarios");
const { COMMERCIAL_SOLAR_SITUATIONS } = require("./objectionPlaybook");

const defaultFixturesDir = path.join(__dirname, "..", "test", "fixtures", "training-evals");
const REQUIRED_METHOD_READINESS_FAMILIES = Object.freeze([
  "gatekeeper", "send_info", "existing_solar", "prior_solar", "lease_landlord",
  "price_cost", "credibility_catch", "long_contract", "busy_callback",
  "source_opt_out", "broker_incumbent", "tied_contract_renewal",
  "roof_site_move_size", "disruption_performance_maintenance_loan",
  "stakeholder", "numbers", "esg",
]);

function assessMethodReadiness({
  methodPack,
  callResults = [],
  fullCallResults,
  minimumRealisticCallScore = 60,
  minimumCallsPerFamily = 3,
  minimumPassingRate = 0.8,
} = {}) {
  const results = Array.isArray(callResults) ? callResults : [];
  const byFamily = new Map(REQUIRED_METHOD_READINESS_FAMILIES.map((family) => [family, []]));
  for (const result of results) {
    if (byFamily.has(result.situationFamily)) byFamily.get(result.situationFamily).push(result);
  }
  const missingFamilies = [...byFamily]
    .filter(([, familyResults]) => familyResults.length < minimumCallsPerFamily)
    .map(([family]) => family);
  const readinessWindow = [...byFamily.values()].flatMap(
    (familyResults) => familyResults.slice(-minimumCallsPerFamily),
  );
  const failedGates = readinessWindow.flatMap((result) => (result.criticalGates || [])
    .filter((gate) => gate.status === "fail")
    .map((gate) => ({ callId: result.id, gateId: gate.id })));
  const reviewGates = readinessWindow.flatMap((result) => (result.criticalGates || [])
    .filter((gate) => gate.status === "review")
    .map((gate) => ({ callId: result.id, gateId: gate.id })));
  const belowFloor = readinessWindow.filter((result) => Number(result.overallScore) < minimumRealisticCallScore);
  const familyPassingRates = Object.fromEntries([...byFamily].map(([family, familyResults]) => {
    const recentResults = familyResults.slice(-minimumCallsPerFamily);
    const passing = recentResults.filter(
      (result) => Number(result.overallScore) >= minimumRealisticCallScore,
    ).length;
    return [family, recentResults.length ? passing / recentResults.length : 0];
  }));
  const passingRate = Object.values(familyPassingRates).length
    ? Math.min(...Object.values(familyPassingRates))
    : 0;
  const checks = [
    { id: "scenario_family_coverage", status: missingFamilies.length ? "fail" : "pass", missingFamilies },
    {
      id: "ethical_gates",
      status: failedGates.length ? "fail" : reviewGates.length ? "review" : "pass",
      failedGates,
      reviewGates,
    },
    { id: "realistic_call_score_floor", status: belowFloor.length ? "fail" : "pass", minimumScore: minimumRealisticCallScore, belowFloorCallIds: belowFloor.map((item) => item.id) },
    { id: "multi_call_consistency", status: passingRate >= minimumPassingRate ? "pass" : "fail", passingRate, minimumPassingRate, familyPassingRates },
  ];
  if (Array.isArray(fullCallResults)) {
    const recentFullCalls = fullCallResults.slice(-3);
    const fullCallGateIssues = recentFullCalls.flatMap((result) => (result.criticalGates || [])
      .filter((gate) => gate.status === "fail" || gate.status === "review")
      .map((gate) => ({ callId: result.id, gateId: gate.id, status: gate.status })));
    const fullCallsPass = recentFullCalls.length >= 3
      && recentFullCalls.every((result) => Number(result.overallScore) >= minimumRealisticCallScore
        && ["medium", "high"].includes(result.overallConfidence))
      && fullCallGateIssues.length === 0;
    checks.push({
      id: "full_call_simulation",
      status: fullCallsPass ? "pass" : "fail",
      requiredCalls: 3,
      observedCalls: recentFullCalls.length,
      fullCallGateIssues,
    });
  }
  return {
    schemaVersion: 1,
    methodPack,
    level: checks.every((check) => check.status === "pass") ? "ready_for_supervised_live_call" : "practice_required",
    ready: checks.every((check) => check.status === "pass"),
    evidenceCallCount: results.length,
    checks,
    limitation: "Transcript simulation readiness does not prove live vocal delivery; final readiness requires a coach-reviewed or supervised live call.",
  };
}

function buildReadinessCallResults(sessions = [], methodPack) {
  const pin = methodPack?.manifest
    ? { id: methodPack.manifest.id, version: methodPack.manifest.version }
    : methodPack;
  const familyByObjectionId = new Map(
    COMMERCIAL_SOLAR_SITUATIONS.map((situation) => [situation.id, situation.family]),
  );
  const candidates = [...sessions]
    .sort((left, right) => String(left.endedAt || "").localeCompare(String(right.endedAt || "")))
    .filter((session) => session.status === "ended"
      && session.methodPack?.id === pin?.id
      && session.methodPack?.version === pin?.version
      && session.evaluation?.methodEvaluation)
    .flatMap((session) => {
      if (session.gauntlet?.results?.length) {
        return session.gauntlet.results
          .filter((result) => result.situationFamily)
          .map((result) => ({
            id: `${session.id}:round-${result.round}`,
            sessionId: session.id,
            fromGauntlet: true,
            situationFamily: result.situationFamily,
            responseFingerprint: result.responseFingerprint || null,
            responseTokenHashes: Array.isArray(result.responseTokenHashes) ? result.responseTokenHashes : [],
            overallScore: Number(result.hardNoCleanExit ?? result.score ?? 0) * 10,
            criticalGates: result.hardNoCleanExit == null
              ? []
              : [{ id: "respect_hard_no", status: result.hardNoCleanExit >= 8 ? "pass" : "fail" }],
          }));
      }
      const families = new Set([
        ...(session.turns || []).map((turn) => familyByObjectionId.get(turn.objectionId)),
      ].filter(Boolean));
      return [...families].map((situationFamily) => ({
        id: `${session.id}:${situationFamily}`,
        sessionId: session.id,
        situationFamily,
        overallScore: Number(session.evaluation.methodEvaluation.overallScore || 0),
        criticalGates: session.evaluation.methodEvaluation.criticalGates || [],
      }));
    });
  const fingerprintCounts = candidates.reduce((counts, result) => {
    if (result.responseFingerprint) {
      counts.set(result.responseFingerprint, (counts.get(result.responseFingerprint) || 0) + 1);
    }
    return counts;
  }, new Map());
  const gauntletCandidates = candidates.filter((result) => result.fromGauntlet);
  const nearDuplicateIds = new Set();
  for (let leftIndex = 0; leftIndex < gauntletCandidates.length; leftIndex += 1) {
    const left = gauntletCandidates[leftIndex];
    const leftTokens = new Set(left.responseTokenHashes || []);
    if (leftTokens.size < 3) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < gauntletCandidates.length; rightIndex += 1) {
      const right = gauntletCandidates[rightIndex];
      const rightTokens = new Set(right.responseTokenHashes || []);
      if (rightTokens.size < 3) continue;
      const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
      const union = new Set([...leftTokens, ...rightTokens]).size;
      if (union > 0 && intersection / union >= 0.75) {
        nearDuplicateIds.add(left.id);
        nearDuplicateIds.add(right.id);
      }
    }
  }
  return candidates.map((result) => {
    if (!result.fromGauntlet) return result;
    const evidenceIntegrity = !result.responseFingerprint
      ? "missing_fingerprint"
      : fingerprintCounts.get(result.responseFingerprint) > 1 || nearDuplicateIds.has(result.id)
        ? "reused_response"
        : "unique_response";
    return {
      ...result,
      overallScore: evidenceIntegrity === "unique_response" ? result.overallScore : 0,
      evidenceIntegrity,
    };
  });
}

function buildFullCallResults(sessions = [], methodPack) {
  const pin = methodPack?.manifest
    ? { id: methodPack.manifest.id, version: methodPack.manifest.version }
    : methodPack;
  return sessions
    .filter((session) => session.status === "ended"
      && !session.gauntlet
      && session.methodPack?.id === pin?.id
      && session.methodPack?.version === pin?.version
      && session.evaluation?.methodEvaluation)
    .sort((left, right) => String(left.endedAt || "").localeCompare(String(right.endedAt || "")))
    .map((session) => ({
      id: session.id,
      overallScore: Number(session.evaluation.methodEvaluation.overallScore || 0),
      overallConfidence: session.evaluation.methodEvaluation.overallConfidence,
      criticalGates: session.evaluation.methodEvaluation.criticalGates || [],
    }));
}

async function loadEvalFixtures(fixturesDir = defaultFixturesDir) {
  const entries = await fs.readdir(fixturesDir, { withFileTypes: true });
  const fixtures = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const fixturePath = path.join(fixturesDir, entry.name);
    const raw = await fs.readFile(fixturePath, "utf8");
    fixtures.push(JSON.parse(raw));
  }
  return fixtures.sort((a, b) => a.id.localeCompare(b.id));
}

function isInRange(value, range) {
  if (typeof value !== "number") return false;
  if (typeof range.min === "number" && value < range.min) return false;
  if (typeof range.max === "number" && value > range.max) return false;
  return true;
}

function addCheck(checks, name, passed, details = {}) {
  checks.push({
    name,
    status: passed ? "pass" : "fail",
    ...details,
  });
}

function addPending(checks, name, reason) {
  checks.push({
    name,
    status: "pending",
    reason,
  });
}

function quadraticWeightedKappa(expectedLabels, actualLabels, maxScore = 4) {
  if (expectedLabels.length !== actualLabels.length || expectedLabels.length === 0) return null;
  const size = maxScore + 1;
  const expectedCounts = Array(size).fill(0);
  const actualCounts = Array(size).fill(0);
  let observedDisagreement = 0;
  for (let index = 0; index < expectedLabels.length; index += 1) {
    const expected = expectedLabels[index];
    const actual = actualLabels[index];
    if (!Number.isInteger(expected) || !Number.isInteger(actual)
      || expected < 0 || expected > maxScore || actual < 0 || actual > maxScore) {
      throw new Error("Kappa labels must be integer rubric scores");
    }
    const weight = ((expected - actual) ** 2) / (maxScore ** 2);
    observedDisagreement += weight;
    expectedCounts[expected] += 1;
    actualCounts[actual] += 1;
  }
  observedDisagreement /= expectedLabels.length;

  let chanceDisagreement = 0;
  for (let expected = 0; expected < size; expected += 1) {
    for (let actual = 0; actual < size; actual += 1) {
      const weight = ((expected - actual) ** 2) / (maxScore ** 2);
      chanceDisagreement += weight
        * (expectedCounts[expected] / expectedLabels.length)
        * (actualCounts[actual] / actualLabels.length);
    }
  }
  if (chanceDisagreement === 0) return observedDisagreement === 0 ? 1 : 0;
  return 1 - observedDisagreement / chanceDisagreement;
}

function evaluateFixture(fixture) {
  const scenario = getScenario(fixture.scenarioId);
  const evaluation = scoreTranscript({ scenario, turns: fixture.turns });
  const checks = [];
  const expected = fixture.expected || {};
  const expectedMethodLabels = [];
  const actualMethodLabels = [];

  if (expected.overallScore) {
    addCheck(checks, "overallScore", isInRange(evaluation.overallScore, expected.overallScore), {
      actual: evaluation.overallScore,
      expected: expected.overallScore,
    });
  }

  for (const [category, range] of Object.entries(expected.categories || {})) {
    addCheck(checks, `categories.${category}`, isInRange(evaluation.categories?.[category], range), {
      actual: evaluation.categories?.[category],
      expected: range,
    });
  }

  if (expected.assignedDrillSkill) {
    if (evaluation.assignedDrill?.skill) {
      addCheck(checks, "assignedDrill.skill", evaluation.assignedDrill.skill === expected.assignedDrillSkill, {
        actual: evaluation.assignedDrill.skill,
        expected: expected.assignedDrillSkill,
      });
    } else {
      addPending(checks, "assignedDrill.skill", "Drill assignment is planned for issue 003.");
    }
  }

  const methodExpected = expected.method || {};
  if (methodExpected.overallScore) {
    addCheck(
      checks,
      "method.overallScore",
      isInRange(evaluation.methodEvaluation?.overallScore, methodExpected.overallScore),
      { actual: evaluation.methodEvaluation?.overallScore, expected: methodExpected.overallScore },
    );
  }
  for (const [behaviorId, expectedScore] of Object.entries(methodExpected.behaviorLabels || {})) {
    const actualScore = evaluation.methodEvaluation?.behaviors.find((behavior) => behavior.id === behaviorId)?.score;
    expectedMethodLabels.push(expectedScore);
    actualMethodLabels.push(actualScore);
    addCheck(checks, `method.behaviors.${behaviorId}`, actualScore === expectedScore, {
      actual: actualScore,
      expected: expectedScore,
    });
  }
  for (const [gateId, expectedStatus] of Object.entries(methodExpected.gateStatuses || {})) {
    const actualStatus = evaluation.methodEvaluation?.criticalGates.find((gate) => gate.id === gateId)?.status;
    addCheck(checks, `method.gates.${gateId}`, actualStatus === expectedStatus, {
      actual: actualStatus,
      expected: expectedStatus,
    });
  }
  if (Object.hasOwn(methodExpected, "assignedDrillBehaviorId")) {
    const actualBehaviorId = evaluation.methodEvaluation?.assignedDrill?.behaviorId || null;
    addCheck(checks, "method.assignedDrill.behaviorId", actualBehaviorId === methodExpected.assignedDrillBehaviorId, {
      actual: actualBehaviorId,
      expected: methodExpected.assignedDrillBehaviorId,
    });
  }

  const visibleOutput = JSON.stringify(evaluation).toLowerCase();
  for (const forbidden of expected.forbiddenLeakage || []) {
    addCheck(checks, `forbiddenLeakage.${forbidden}`, !visibleOutput.includes(String(forbidden).toLowerCase()));
  }

  const activeChecks = checks.filter((check) => check.status !== "pending");
  const passedChecks = activeChecks.filter((check) => check.status === "pass");
  const failedChecks = activeChecks.filter((check) => check.status === "fail");
  const pendingChecks = checks.filter((check) => check.status === "pending");

  return {
    id: fixture.id,
    scenarioId: fixture.scenarioId,
    evaluation,
    checks,
    checked: activeChecks.length,
    passed: passedChecks.length,
    failed: failedChecks.length,
    pending: pendingChecks.length,
    agreement: activeChecks.length ? passedChecks.length / activeChecks.length : 1,
    methodLabels: {
      expected: expectedMethodLabels,
      actual: actualMethodLabels,
    },
  };
}

async function runFixtureEval(options = {}) {
  const fixtures = await loadEvalFixtures(options.fixturesDir);
  const results = fixtures.map(evaluateFixture);
  const checked = results.reduce((total, result) => total + result.checked, 0);
  const passed = results.reduce((total, result) => total + result.passed, 0);
  const failed = results.reduce((total, result) => total + result.failed, 0);
  const pending = results.reduce((total, result) => total + result.pending, 0);
  const expectedMethodLabels = results.flatMap((result) => result.methodLabels.expected);
  const actualMethodLabels = results.flatMap((result) => result.methodLabels.actual);
  return {
    fixtureCount: fixtures.length,
    checked,
    passed,
    failed,
    pending,
    agreement: checked ? passed / checked : 1,
    methodLabelCount: expectedMethodLabels.length,
    weightedKappa: quadraticWeightedKappa(expectedMethodLabels, actualMethodLabels),
    results,
  };
}

module.exports = {
  REQUIRED_METHOD_READINESS_FAMILIES,
  assessMethodReadiness,
  buildReadinessCallResults,
  buildFullCallResults,
  defaultFixturesDir,
  evaluateFixture,
  loadEvalFixtures,
  quadraticWeightedKappa,
  runFixtureEval,
};
