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

function evaluateFixture(fixture) {
  const scenario = getScenario(fixture.scenarioId);
  const evaluation = scoreTranscript({ scenario, turns: fixture.turns });
  const checks = [];
  const expected = fixture.expected || {};

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
  };
}

async function runFixtureEval(options = {}) {
  const fixtures = await loadEvalFixtures(options.fixturesDir);
  const results = fixtures.map(evaluateFixture);
  const checked = results.reduce((total, result) => total + result.checked, 0);
  const passed = results.reduce((total, result) => total + result.passed, 0);
  const failed = results.reduce((total, result) => total + result.failed, 0);
  const pending = results.reduce((total, result) => total + result.pending, 0);
  return {
    fixtureCount: fixtures.length,
    checked,
    passed,
    failed,
    pending,
    agreement: checked ? passed / checked : 1,
    results,
  };
}

module.exports = {
  defaultFixturesDir,
  evaluateFixture,
  loadEvalFixtures,
  runFixtureEval,
};
