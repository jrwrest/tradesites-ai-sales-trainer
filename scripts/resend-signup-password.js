#!/usr/bin/env node

const { sendEmail } = require("../src/email");
const {
  STATUS,
  buildPasswordSetupUrl,
  loadSignupRequests,
  normalizeEmail,
  rotateSignupPasswordSetupToken,
} = require("../src/signupRequests");

function requestedEmail(argv) {
  const emailFlag = argv.indexOf("--email");
  return normalizeEmail(emailFlag >= 0 ? argv[emailFlag + 1] : argv[0]);
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const loadRequests = dependencies.loadSignupRequests || loadSignupRequests;
  const rotateToken = dependencies.rotateSignupPasswordSetupToken || rotateSignupPasswordSetupToken;
  const mailer = dependencies.mailer || sendEmail;
  const stdout = dependencies.stdout || process.stdout;
  const email = requestedEmail(argv);
  if (!email) throw new Error("Usage: npm run signup:resend-password -- --email applicant@example.com");

  const requests = await loadRequests();
  const matches = requests.filter((item) => item.email === email);
  if (matches.length !== 1 || matches[0].status !== STATUS.APPROVED) {
    throw new Error("Expected exactly one approved signup request awaiting password setup");
  }
  const [request] = matches;

  const rotated = await rotateToken(request.id);
  const setupUrl = buildPasswordSetupUrl(rotated.request, rotated.passwordSetupToken);
  await mailer({
    to: rotated.request.email,
    subject: "Set your Tradesites AI Sales Trainer password",
    text: [
      "Your Tradesites AI Sales Trainer account has been approved.",
      "",
      "Set your password here:",
      setupUrl,
      "",
      "After setting your password, you can log in with your email and password.",
    ].join("\n"),
    html: [
      "<p>Your Tradesites AI Sales Trainer account has been approved.</p>",
      `<p><a href="${setupUrl}">Set your password</a></p>`,
      "<p>After setting your password, you can log in with your email and password.</p>",
    ].join(""),
  });

  stdout.write(`${JSON.stringify({ sent: true, requestId: request.id })}\n`);
}

if (require.main === module) {
  main().catch(() => {
    process.stderr.write("Password setup email resend failed.\n");
    process.exitCode = 1;
  });
}

module.exports = { main, requestedEmail };
