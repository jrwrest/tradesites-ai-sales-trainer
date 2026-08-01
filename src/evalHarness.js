const fs = require("node:fs/promises");
const path = require("node:path");
const { scoreTranscript } = require("./scoring");
const { getScenario } = require("./scenarios");

const defaultFixturesDir = path.join(__dirname, "..", "test", "fixtures", "training-evals");

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
  defaultFixturesDir,
  evaluateFixture,
  loadEvalFixtures,
  quadraticWeightedKappa,
  runFixtureEval,
};
