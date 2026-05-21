const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
const {
  approveSignupRequest,
  buildApprovalUrl,
  buildPasswordSetupUrl,
  buildVerificationUrl,
  createSignupRequest,
  notifyVerifiedSignupRequest,
  validatePasswordSetupToken,
  verifySignupEmail,
} = require("../src/signupRequests");

let previousDataDir;
let previousPublicBaseUrl;
let previousApprovalToken;
let previousTelegramBotToken;
let previousTelegramChatId;
let previousSignupEmailTokenTtlHours;
let previousSignupPasswordTokenTtlHours;
let previousSignupApprovalTokenTtlHours;
let previousSignupEmailResendCooldownSeconds;
let tempDataDir;

beforeEach(async () => {
  previousDataDir = process.env.DATA_DIR;
  previousPublicBaseUrl = process.env.PUBLIC_BASE_URL;
  previousApprovalToken = process.env.ACCESS_APPROVAL_TOKEN;
  previousTelegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  previousTelegramChatId = process.env.TELEGRAM_CHAT_ID;
  previousSignupEmailTokenTtlHours = process.env.SIGNUP_EMAIL_TOKEN_TTL_HOURS;
  previousSignupPasswordTokenTtlHours = process.env.SIGNUP_PASSWORD_TOKEN_TTL_HOURS;
  previousSignupApprovalTokenTtlHours = process.env.SIGNUP_APPROVAL_TOKEN_TTL_HOURS;
  previousSignupEmailResendCooldownSeconds = process.env.SIGNUP_EMAIL_RESEND_COOLDOWN_SECONDS;
  tempDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tradesites-signup-test-"));
  process.env.DATA_DIR = tempDataDir;
  process.env.PUBLIC_BASE_URL = "https://trainer.example.test";
  process.env.ACCESS_APPROVAL_TOKEN = "approval-secret";
});

afterEach(async () => {
  for (const [name, value] of [
    ["DATA_DIR", previousDataDir],
    ["PUBLIC_BASE_URL", previousPublicBaseUrl],
    ["ACCESS_APPROVAL_TOKEN", previousApprovalToken],
    ["TELEGRAM_BOT_TOKEN", previousTelegramBotToken],
    ["TELEGRAM_CHAT_ID", previousTelegramChatId],
    ["SIGNUP_EMAIL_TOKEN_TTL_HOURS", previousSignupEmailTokenTtlHours],
    ["SIGNUP_PASSWORD_TOKEN_TTL_HOURS", previousSignupPasswordTokenTtlHours],
    ["SIGNUP_APPROVAL_TOKEN_TTL_HOURS", previousSignupApprovalTokenTtlHours],
    ["SIGNUP_EMAIL_RESEND_COOLDOWN_SECONDS", previousSignupEmailResendCooldownSeconds],
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

test("verified signup requests notify Telegram with an approval button", async () => {
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

test("verified signup notification does not log approval links when Telegram is missing", async () => {
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
  assert.match(logs[0], /Telegram approval notifications are not configured/);
  assert.doesNotMatch(logs[0], /token=/);
  assert.doesNotMatch(logs[0], new RegExp(verified.adminApprovalToken));
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
