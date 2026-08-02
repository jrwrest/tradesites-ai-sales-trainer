const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { afterEach, beforeEach, test } = require("node:test");
const {
  approveSignupRequest,
  buildApprovalUrl,
  buildPasswordSetupUrl,
  buildVerificationUrl,
  createSignupRequest,
  loadSignupRequests,
  notifyVerifiedSignupRequest,
  rotateSignupApprovalToken,
  rotateSignupPasswordSetupToken,
  validatePasswordSetupToken,
  purgeExpiredSignupRequests,
  verifySignupEmail,
} = require("../src/signupRequests");

let previousDataDir;
let previousPublicBaseUrl;
let previousApprovalToken;
let previousTelegramBotToken;
let previousTelegramChatId;
let previousSignupApprovalEmail;
let previousSignupEmailTokenTtlHours;
let previousSignupPasswordTokenTtlHours;
let previousSignupApprovalTokenTtlHours;
let previousSignupEmailResendCooldownSeconds;
let previousSignupNotificationTimeoutMs;
let tempDataDir;
const execFileAsync = promisify(execFile);

beforeEach(async () => {
  previousDataDir = process.env.DATA_DIR;
  previousPublicBaseUrl = process.env.PUBLIC_BASE_URL;
  previousApprovalToken = process.env.ACCESS_APPROVAL_TOKEN;
  previousTelegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  previousTelegramChatId = process.env.TELEGRAM_CHAT_ID;
  previousSignupApprovalEmail = process.env.SIGNUP_APPROVAL_EMAIL;
  previousSignupEmailTokenTtlHours = process.env.SIGNUP_EMAIL_TOKEN_TTL_HOURS;
  previousSignupPasswordTokenTtlHours = process.env.SIGNUP_PASSWORD_TOKEN_TTL_HOURS;
  previousSignupApprovalTokenTtlHours = process.env.SIGNUP_APPROVAL_TOKEN_TTL_HOURS;
  previousSignupEmailResendCooldownSeconds = process.env.SIGNUP_EMAIL_RESEND_COOLDOWN_SECONDS;
  previousSignupNotificationTimeoutMs = process.env.SIGNUP_NOTIFICATION_TIMEOUT_MS;
  tempDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tradesites-signup-test-"));
  process.env.DATA_DIR = tempDataDir;
  process.env.PUBLIC_BASE_URL = "https://trainer.example.test";
  process.env.ACCESS_APPROVAL_TOKEN = "approval-secret";
});

test("signup retention purges expired requests after the configured window", async () => {
  await createSignupRequest(
    { email: "expired@example.com" },
    new Date("2026-01-01T00:00:00.000Z"),
  );
  await createSignupRequest(
    { email: "recent@example.com" },
    new Date("2026-07-25T00:00:00.000Z"),
  );

  const result = await purgeExpiredSignupRequests({
    retentionDays: 30,
    now: new Date("2026-08-01T00:00:00.000Z"),
  });

  assert.equal(result.deleted, 1);
  const requests = await loadSignupRequests();
  assert.deepEqual(requests.map((request) => request.email), ["recent@example.com"]);
});

afterEach(async () => {
  for (const [name, value] of [
    ["DATA_DIR", previousDataDir],
    ["PUBLIC_BASE_URL", previousPublicBaseUrl],
    ["ACCESS_APPROVAL_TOKEN", previousApprovalToken],
    ["TELEGRAM_BOT_TOKEN", previousTelegramBotToken],
    ["TELEGRAM_CHAT_ID", previousTelegramChatId],
    ["SIGNUP_APPROVAL_EMAIL", previousSignupApprovalEmail],
    ["SIGNUP_EMAIL_TOKEN_TTL_HOURS", previousSignupEmailTokenTtlHours],
    ["SIGNUP_PASSWORD_TOKEN_TTL_HOURS", previousSignupPasswordTokenTtlHours],
    ["SIGNUP_APPROVAL_TOKEN_TTL_HOURS", previousSignupApprovalTokenTtlHours],
    ["SIGNUP_EMAIL_RESEND_COOLDOWN_SECONDS", previousSignupEmailResendCooldownSeconds],
    ["SIGNUP_NOTIFICATION_TIMEOUT_MS", previousSignupNotificationTimeoutMs],
  ]) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  await fs.rm(tempDataDir, { recursive: true, force: true });
});

test("signup requests start with email verification and do not expose raw tokens", async () => {
  const first = await createSignupRequest({ email: "Rep@Example.com", name: "Rep" });
  const second = await createSignupRequest({ email: "rep@example.com" });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.request.id, second.request.id);
  assert.equal(first.request.email, "rep@example.com");
  assert.equal(first.request.status, "pending_email_verification");
  assert.ok(first.emailVerificationToken);
  assert.equal(second.emailVerificationToken, null);
  assert.equal(first.request.emailVerificationToken, undefined);
  assert.equal(typeof first.request.emailVerificationTokenHash, "string");
  assert.ok(first.request.emailVerificationExpiresAt);
  assert.equal(
    buildVerificationUrl(first.request, first.emailVerificationToken),
    `https://trainer.example.test/api/signup-requests/${first.request.id}/verify?token=${first.emailVerificationToken}`,
  );
});

test("pending signup requests resend verification only after cooldown", async () => {
  process.env.SIGNUP_EMAIL_RESEND_COOLDOWN_SECONDS = "60";
  const first = await createSignupRequest(
    { email: "rep@example.com" },
    new Date("2026-05-21T10:00:00.000Z"),
  );
  const throttled = await createSignupRequest(
    { email: "rep@example.com" },
    new Date("2026-05-21T10:00:30.000Z"),
  );
  const resent = await createSignupRequest(
    { email: "rep@example.com" },
    new Date("2026-05-21T10:01:01.000Z"),
  );

  assert.ok(first.emailVerificationToken);
  assert.equal(throttled.emailVerificationToken, null);
  assert.ok(resent.emailVerificationToken);
  assert.notEqual(resent.emailVerificationToken, first.emailVerificationToken);
});

test("signup request writes preserve concurrent updates from separate processes", async () => {
  const signupRequestsModule = path.join(__dirname, "..", "src", "signupRequests.js");
  const childScript = [
    `const { createSignupRequest } = require(${JSON.stringify(signupRequestsModule)});`,
    "createSignupRequest({ email: process.argv[1] }).catch((error) => {",
    "  process.stderr.write(error.message);",
    "  process.exitCode = 1;",
    "});",
  ].join("\n");

  await Promise.all(Array.from({ length: 8 }, (_, index) => execFileAsync(
    process.execPath,
    ["-e", childScript, `rep-${index}@example.com`],
    {
      env: {
        ...process.env,
        DATA_DIR: tempDataDir,
        PUBLIC_BASE_URL: "https://trainer.example.test",
        ACCESS_APPROVAL_TOKEN: "approval-secret",
      },
    },
  )));

  const requests = await loadSignupRequests();
  assert.equal(requests.length, 8);
  assert.deepEqual(
    requests.map((request) => request.email).sort(),
    Array.from({ length: 8 }, (_, index) => `rep-${index}@example.com`).sort(),
  );
});

test("verified signup requests email the configured admin approval address", async () => {
  process.env.SIGNUP_APPROVAL_EMAIL = "owner@example.com";
  process.env.TELEGRAM_BOT_TOKEN = "bot-token";
  process.env.TELEGRAM_CHAT_ID = "chat-id";
  const { request, emailVerificationToken } = await createSignupRequest({
    email: "rep@example.com",
    name: "Rep <script>",
    company: "BrightTrade Solar",
  });
  const verified = await verifySignupEmail(request.id, emailVerificationToken);
  const emails = [];
  let telegramCalled = false;

  const result = await notifyVerifiedSignupRequest(verified, {
    mailer: async (message) => {
      emails.push(message);
      return { sent: true, channel: "test" };
    },
    fetchImpl: async () => {
      telegramCalled = true;
      return { ok: true };
    },
  });

  assert.deepEqual(result, { sent: true, channel: "email" });
  assert.equal(telegramCalled, false);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, "owner@example.com");
  assert.match(emails[0].subject, /approval/i);
  assert.match(emails[0].text, /rep@example\.com/);
  assert.match(emails[0].text, /BrightTrade Solar/);
  assert.match(emails[0].text, /expires/i);
  assert.match(emails[0].html, /Rep &lt;script&gt;/);
  assert.doesNotMatch(emails[0].html, /Rep <script>/);
  assert.match(emails[0].text, new RegExp(buildApprovalUrl(verified).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.notEqual(emails[0].to, verified.email);
});

test("a timed-out admin email falls back to Telegram within a bounded interval", async () => {
  process.env.SIGNUP_APPROVAL_EMAIL = "owner@example.com";
  process.env.TELEGRAM_BOT_TOKEN = "bot-token";
  process.env.TELEGRAM_CHAT_ID = "chat-id";
  process.env.SIGNUP_NOTIFICATION_TIMEOUT_MS = "10";
  const { request, emailVerificationToken } = await createSignupRequest({ email: "rep@example.com" });
  const verified = await verifySignupEmail(request.id, emailVerificationToken);

  const result = await notifyVerifiedSignupRequest(verified, {
    mailer: async () => new Promise(() => {}),
    fetchImpl: async () => ({ ok: true }),
    logger: { warn() {} },
  });

  assert.deepEqual(result, { sent: true, channel: "telegram_fallback" });
});

test("verified signup requests fall back to Telegram when approval email is not configured", async () => {
  delete process.env.SIGNUP_APPROVAL_EMAIL;
  process.env.TELEGRAM_BOT_TOKEN = "bot-token";
  process.env.TELEGRAM_CHAT_ID = "chat-id";
  const { request, emailVerificationToken } = await createSignupRequest({
    email: "rep@example.com",
    name: "Rep",
    company: "BrightTrade Solar",
  });
  const verified = await verifySignupEmail(request.id, emailVerificationToken);
  const calls = [];

  const result = await notifyVerifiedSignupRequest(verified, {
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true };
    },
  });

  assert.equal(verified.status, "verified_pending_approval");
  assert.ok(verified.adminApprovalToken);
  assert.equal(result.sent, true);
  assert.equal(result.channel, "telegram");
  assert.equal(result.approvalUrl, undefined);
  assert.equal(calls[0].url, "https://api.telegram.org/botbot-token/sendMessage");
  assert.equal(calls[0].body.chat_id, "chat-id");
  assert.match(calls[0].body.text, /verified their email/);
  assert.match(calls[0].body.text, /rep@example\.com/);
  assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].text, "Approve account");
  assert.equal(
    calls[0].body.reply_markup.inline_keyboard[0][0].url,
    buildApprovalUrl(verified),
  );
});

test("verified signup requests use Telegram as a fallback when admin email delivery fails", async () => {
  process.env.SIGNUP_APPROVAL_EMAIL = "owner@example.com";
  process.env.TELEGRAM_BOT_TOKEN = "bot-token";
  process.env.TELEGRAM_CHAT_ID = "chat-id";
  const { request, emailVerificationToken } = await createSignupRequest({ email: "rep@example.com" });
  const verified = await verifySignupEmail(request.id, emailVerificationToken);
  const calls = [];

  const result = await notifyVerifiedSignupRequest(verified, {
    mailer: async () => {
      const error = new Error("SMTP unavailable");
      error.code = "EMAIL_DELIVERY_FAILED";
      throw error;
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true };
    },
    logger: { warn() {} },
  });

  assert.deepEqual(result, { sent: true, channel: "telegram_fallback" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].url, buildApprovalUrl(verified));
});

test("verified signup notification does not log approval links when all admin notifications are missing", async () => {
  delete process.env.SIGNUP_APPROVAL_EMAIL;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  const { request, emailVerificationToken } = await createSignupRequest({ email: "rep@example.com" });
  const verified = await verifySignupEmail(request.id, emailVerificationToken);
  const logs = [];

  const result = await notifyVerifiedSignupRequest(verified, {
    logger: {
      info: (message) => logs.push(message),
    },
  });

  assert.deepEqual(result, { sent: false, channel: "disabled" });
  assert.deepEqual(logs, [{
    event: "signup_approval_notification_disabled",
    requestId: verified.id,
  }]);
  assert.doesNotMatch(JSON.stringify(logs), /rep@example\.com/);
  assert.doesNotMatch(JSON.stringify(logs), /token=/);
  assert.doesNotMatch(JSON.stringify(logs), new RegExp(verified.adminApprovalToken));
});

test("verified signup approval tokens can be securely rotated for a resend", async () => {
  const { request, emailVerificationToken } = await createSignupRequest({ email: "rep@example.com" });
  const verified = await verifySignupEmail(request.id, emailVerificationToken);
  const originalToken = verified.adminApprovalToken;

  const rotated = await rotateSignupApprovalToken(
    request.id,
    new Date("2026-08-02T12:00:00.000Z"),
  );

  assert.notEqual(rotated.adminApprovalToken, originalToken);
  assert.equal(rotated.adminApprovalExpiresAt, "2026-08-05T12:00:00.000Z");
  await assert.rejects(
    () => approveSignupRequest(request.id, originalToken),
    (error) => error.code === "SIGNUP_APPROVAL_TOKEN_INVALID",
  );
  assert.equal((await loadSignupRequests())[0].adminApprovalToken, undefined);
  assert.equal((await loadSignupRequests())[0].adminApprovalTokenHash.length, 64);
});

test("approval token rotation rejects requests outside verified-pending-approval", async () => {
  const { request } = await createSignupRequest({ email: "rep@example.com" });

  await assert.rejects(
    () => rotateSignupApprovalToken(request.id),
    (error) => error.code === "SIGNUP_REQUEST_NOT_VERIFIED",
  );
});

test("approved signup password tokens can be rotated for a delivery recovery", async () => {
  const { request, emailVerificationToken } = await createSignupRequest({ email: "rep@example.com" });
  const verified = await verifySignupEmail(request.id, emailVerificationToken);
  const { passwordSetupToken: originalToken } = await approveSignupRequest(
    request.id,
    verified.adminApprovalToken,
  );

  const rotated = await rotateSignupPasswordSetupToken(
    request.id,
    new Date("2026-08-02T12:00:00.000Z"),
  );

  assert.notEqual(rotated.passwordSetupToken, originalToken);
  assert.equal(rotated.request.passwordSetupExpiresAt, "2026-08-03T12:00:00.000Z");
  await assert.rejects(
    () => validatePasswordSetupToken(request.id, originalToken),
    (error) => error.code === "SIGNUP_PASSWORD_TOKEN_INVALID",
  );
  assert.equal(
    (await validatePasswordSetupToken(request.id, rotated.passwordSetupToken)).status,
    "approved_pending_password",
  );
  assert.equal((await loadSignupRequests())[0].passwordSetupToken, undefined);
});

test("password token rotation rejects requests outside approved-pending-password", async () => {
  const { request } = await createSignupRequest({ email: "rep@example.com" });

  await assert.rejects(
    () => rotateSignupPasswordSetupToken(request.id),
    (error) => error.code === "SIGNUP_REQUEST_NOT_APPROVED",
  );
});

test("approval creates a password setup token after email verification", async () => {
  const { request, emailVerificationToken } = await createSignupRequest({ email: "rep@example.com" });

  await assert.rejects(() => approveSignupRequest(request.id, "bad-token"), /not verified/);

  const verified = await verifySignupEmail(request.id, emailVerificationToken);
  await assert.rejects(
    () => approveSignupRequest(request.id, "bad-token"),
    (error) => error.code === "SIGNUP_APPROVAL_TOKEN_INVALID",
  );
  const { request: approved, passwordSetupToken } = await approveSignupRequest(
    request.id,
    verified.adminApprovalToken,
  );

  assert.equal(approved.status, "approved_pending_password");
  assert.ok(passwordSetupToken);
  assert.equal(approved.passwordSetupToken, undefined);
  assert.equal(approved.adminApprovalTokenHash, null);
  assert.equal(typeof approved.passwordSetupTokenHash, "string");
  assert.equal(
    buildPasswordSetupUrl(approved, passwordSetupToken),
    `https://trainer.example.test/set-password?id=${approved.id}&token=${passwordSetupToken}`,
  );
});

test("verification and password setup tokens expire", async () => {
  process.env.SIGNUP_EMAIL_TOKEN_TTL_HOURS = "1";
  process.env.SIGNUP_PASSWORD_TOKEN_TTL_HOURS = "1";
  const { request, emailVerificationToken } = await createSignupRequest(
    { email: "rep@example.com" },
    new Date("2026-05-21T10:00:00.000Z"),
  );

  await assert.rejects(
    () => verifySignupEmail(request.id, emailVerificationToken, new Date("2026-05-21T11:00:01.000Z")),
    (error) => error.code === "SIGNUP_VERIFICATION_EXPIRED",
  );

  const fresh = await createSignupRequest(
    { email: "fresh@example.com" },
    new Date("2026-05-21T10:00:00.000Z"),
  );
  const verified = await verifySignupEmail(
    fresh.request.id,
    fresh.emailVerificationToken,
    new Date("2026-05-21T10:30:00.000Z"),
  );
  const { request: approved, passwordSetupToken } = await approveSignupRequest(
    fresh.request.id,
    verified.adminApprovalToken,
    new Date("2026-05-21T10:40:00.000Z"),
  );

  await assert.rejects(
    () => validatePasswordSetupToken(
      approved.id,
      passwordSetupToken,
      new Date("2026-05-21T11:40:01.000Z"),
    ),
    (error) => error.code === "SIGNUP_PASSWORD_TOKEN_EXPIRED",
  );
});

test("approval tokens expire and are per-request instead of the global secret", async () => {
  process.env.SIGNUP_APPROVAL_TOKEN_TTL_HOURS = "1";
  const { request, emailVerificationToken } = await createSignupRequest(
    { email: "rep@example.com" },
    new Date("2026-05-21T10:00:00.000Z"),
  );
  const verified = await verifySignupEmail(
    request.id,
    emailVerificationToken,
    new Date("2026-05-21T10:10:00.000Z"),
  );

  assert.notEqual(verified.adminApprovalToken, "approval-secret");
  assert.match(buildApprovalUrl(verified), new RegExp(`token=${verified.adminApprovalToken}`));
  await assert.rejects(
    () => approveSignupRequest(request.id, verified.adminApprovalToken, new Date("2026-05-21T11:10:01.000Z")),
    (error) => error.code === "SIGNUP_APPROVAL_TOKEN_EXPIRED",
  );
});
