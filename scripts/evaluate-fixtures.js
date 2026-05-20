#!/usr/bin/env node
const { runFixtureEval } = require("../src/evalHarness");

const PASS_THRESHOLD = 0.9;

runFixtureEval()
  .then((summary) => {
    console.log(
      `Fixture evals: ${summary.passed}/${summary.checked} checks passed across ${summary.fixtureCount} fixtures (${Math.round(
        summary.agreement * 100,
      )}% agreement, ${summary.pending} pending future checks).`,
    );

    for (const result of summary.results) {
      const failed = result.checks.filter((check) => check.status === "fail");
      const pending = result.checks.filter((check) => check.status === "pending");
      if (failed.length || pending.length) {
        console.log(`\n${result.id}`);
        for (const check of failed) {
          console.log(`  FAIL ${check.name}: expected ${JSON.stringify(check.expected)}, got ${JSON.stringify(check.actual)}`);
        }
        for (const check of pending) {
          console.log(`  PENDING ${check.name}: ${check.reason}`);
        }
      }
    }

    if (summary.agreement < PASS_THRESHOLD || summary.failed > 0) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
