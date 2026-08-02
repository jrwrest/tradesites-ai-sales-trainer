#!/usr/bin/env node

const { sendEmail } = require("../src/email");
const {
  buildPasswordSetupUrl,
  reconcilePasswordSetup,
} = require("../src/signupRequests");

function parseArguments(argv) {
  const requestIdIndex = argv.indexOf("--request-id");
  const outcomeIndex = argv.indexOf("--outcome");
  const requestId = String(requestIdIndex >= 0 ? argv[requestIdIndex + 1] || "" : "").trim();
  const outcome = String(outcomeIndex >= 0 ? argv[outcomeIndex + 1] || "" : "").trim();
  if (!requestId || !["committed", "not-committed"].includes(outcome)) {
    throw new Error(
      "Usage: npm run signup:reconcile-password -- --request-id <id> --outcome committed|not-committed",
    );
  }
  return { requestId, outcome };
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const reconcile = dependencies.reconcilePasswordSetup || reconcilePasswordSetup;
  const mailer = dependencies.mailer || sendEmail;
  const stdout = dependencies.stdout || process.stdout;
  const { requestId, outcome } = parseArguments(argv);
  const result = await reconcile(requestId, outcome);

  if (outcome === "not-committed") {
    const setupUrl = buildPasswordSetupUrl(result.request, result.passwordSetupToken);
    await mailer({
      to: result.request.email,
      subject: "Set your Tradesites AI Sales Trainer password",
      text: [
        "The earlier password setup did not complete.",
        "",
        "Use this replacement link:",
        setupUrl,
        "",
        "After setting your password, you can log in with your email and password.",
      ].join("\n"),
      html: [
        "<p>The earlier password setup did not complete.</p>",
        `<p><a href="${setupUrl}">Set your password</a></p>`,
        "<p>After setting your password, you can log in with your email and password.</p>",
      ].join(""),
    });
  }

  stdout.write(`${JSON.stringify({ reconciled: true, requestId, outcome })}\n`);
}

if (require.main === module) {
  main().catch(() => {
    process.stderr.write("Password setup reconciliation failed.\n");
    process.exitCode = 1;
  });
}

module.exports = { main, parseArguments };
