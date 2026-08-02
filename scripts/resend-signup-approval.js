#!/usr/bin/env node

const {
  STATUS,
  loadSignupRequests,
  normalizeEmail,
  notifyVerifiedSignupRequest,
  rotateSignupApprovalToken,
} = require("../src/signupRequests");

function requestedEmail(argv) {
  const emailFlag = argv.indexOf("--email");
  return normalizeEmail(emailFlag >= 0 ? argv[emailFlag + 1] : argv[0]);
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const loadRequests = dependencies.loadSignupRequests || loadSignupRequests;
  const rotateToken = dependencies.rotateSignupApprovalToken || rotateSignupApprovalToken;
  const notify = dependencies.notifyVerifiedSignupRequest || notifyVerifiedSignupRequest;
  const env = dependencies.env || process.env;
  const stdout = dependencies.stdout || process.stdout;
  const email = requestedEmail(argv);
  if (!email) throw new Error("Usage: npm run signup:resend-approval -- --email applicant@example.com");
  const hasEmail = Boolean(env.SIGNUP_APPROVAL_EMAIL);
  const hasTelegram = Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
  if (!hasEmail && !hasTelegram) {
    throw new Error("An admin approval notification channel is required");
  }

  const requests = await loadRequests();
  const matches = requests.filter(
    (item) => item.email === email && item.status === STATUS.VERIFIED,
  );
  if (matches.length !== 1) {
    throw new Error("Expected exactly one verified signup request awaiting approval");
  }
  const [request] = matches;

  const rotated = await rotateToken(request.id);
  const result = await notify(rotated);
  if (!result.sent) throw new Error("Admin approval notification was not sent");

  stdout.write(`${JSON.stringify({
    sent: true,
    channel: result.channel,
    requestId: request.id,
  })}\n`);
}

if (require.main === module) {
  main().catch(() => {
    process.stderr.write("Approval email resend failed.\n");
    process.exitCode = 1;
  });
}

module.exports = { main, requestedEmail };
