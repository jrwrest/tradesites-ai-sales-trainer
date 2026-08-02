const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { getDataDir } = require("./store");
const { withKeyLock } = require("./keyLock");

const STATUS = {
  PENDING_EMAIL: "pending_email_verification",
  VERIFIED: "verified_pending_approval",
  APPROVED: "approved_pending_password",
  USED: "used",
};

function requestsPath() {
  return path.join(getDataDir(), "signup-requests.json");
}

function requestsLockPath() {
  return path.join(getDataDir(), ".signup-requests.lock");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withCrossProcessSignupLock(operation) {
  await fs.mkdir(getDataDir(), { recursive: true, mode: 0o700 });
  await fs.chmod(getDataDir(), 0o700);
  const lockPath = requestsLockPath();
  const deadline = Date.now() + 5000;
  let handle;

  while (!handle) {
    try {
      const candidate = await fs.open(lockPath, "wx", 0o600);
      try {
        await candidate.writeFile(
          `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
        );
        handle = candidate;
      } catch (error) {
        await candidate.close();
        await fs.unlink(lockPath).catch(() => {});
        throw error;
      }
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const lockAgeMs = await fs.stat(lockPath)
        .then((stat) => Date.now() - stat.mtimeMs)
        .catch((statError) => (statError.code === "ENOENT" ? 0 : Promise.reject(statError)));
      if (lockAgeMs > 30000) {
        await fs.unlink(lockPath).catch((unlinkError) => {
          if (unlinkError.code !== "ENOENT") throw unlinkError;
        });
        continue;
      }
      if (Date.now() >= deadline) {
        const lockError = new Error("Signup request store is busy");
        lockError.code = "SIGNUP_REQUESTS_LOCK_TIMEOUT";
        throw lockError;
      }
      await delay(25);
    }
  }

  try {
    return await operation();
  } finally {
    await handle.close();
    await fs.unlink(lockPath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

function withSignupRequestsLock(operation) {
  return withKeyLock("signup-requests", () => withCrossProcessSignupLock(operation));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function cleanText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function createPlainToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hoursFromEnv(name, fallback) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function secondsFromEnv(name, fallback) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function isExpired(expiresAt, now = new Date()) {
  return !expiresAt || new Date(expiresAt).getTime() <= now.getTime();
}

function emailVerificationTtlHours() {
  return hoursFromEnv("SIGNUP_EMAIL_TOKEN_TTL_HOURS", 24);
}

function passwordSetupTtlHours() {
  return hoursFromEnv("SIGNUP_PASSWORD_TOKEN_TTL_HOURS", 24);
}

function adminApprovalTtlHours() {
  return hoursFromEnv("SIGNUP_APPROVAL_TOKEN_TTL_HOURS", 72);
}

function verificationResendCooldownSeconds() {
  return secondsFromEnv("SIGNUP_EMAIL_RESEND_COOLDOWN_SECONDS", 300);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

function approvalTokenSecret() {
  return process.env.ACCESS_APPROVAL_TOKEN || "";
}

function hashApprovalToken(token) {
  return hashToken(`${approvalTokenSecret()}:${token}`);
}

function approvalTokenMatches(token, hash) {
  if (!approvalTokenSecret()) return false;
  if (!token || !hash) return false;
  const actual = Buffer.from(hashApprovalToken(token), "hex");
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function tokenMatches(token, hash) {
  if (!token || !hash) return false;
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function loadSignupRequests() {
  try {
    const raw = await fs.readFile(requestsPath(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.requests) ? parsed.requests : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    error.code = "SIGNUP_REQUESTS_READ_FAILED";
    throw error;
  }
}

async function saveSignupRequests(requests) {
  await fs.mkdir(getDataDir(), { recursive: true, mode: 0o700 });
  await fs.chmod(getDataDir(), 0o700);
  const target = requestsPath();
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify({ schemaVersion: 1, requests }, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, target);
  await fs.chmod(target, 0o600);
}

function assertValidEmail(email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("A valid email is required");
    error.code = "SIGNUP_REQUEST_EMAIL_REQUIRED";
    throw error;
  }
}

async function createSignupRequestUnlocked(input = {}, now = new Date()) {
  const email = normalizeEmail(input.email);
  assertValidEmail(email);

  const requests = await loadSignupRequests();
  const existing = requests.find((request) => request.email === email && request.status !== STATUS.USED);
  if (existing) {
    if (existing.status === STATUS.PENDING_EMAIL) {
      const lastSentAt = existing.verificationEmailSentAt
        ? new Date(existing.verificationEmailSentAt).getTime()
        : 0;
      const cooldownMs = verificationResendCooldownSeconds() * 1000;
      if (!isExpired(existing.emailVerificationExpiresAt, now) && now.getTime() - lastSentAt < cooldownMs) {
        return { request: existing, created: false, emailVerificationToken: null };
      }
      const emailVerificationToken = createPlainToken();
      existing.emailVerificationTokenHash = hashToken(emailVerificationToken);
      existing.verificationEmailSentAt = now.toISOString();
      existing.emailVerificationExpiresAt = addHours(now, emailVerificationTtlHours()).toISOString();
      await saveSignupRequests(requests);
      return { request: existing, created: false, emailVerificationToken };
    }
    return { request: existing, created: false, emailVerificationToken: null };
  }

  const emailVerificationToken = createPlainToken();
  const request = {
    id: crypto.randomUUID(),
    email,
    name: cleanText(input.name, 120),
    company: cleanText(input.company, 160),
    status: STATUS.PENDING_EMAIL,
    requestedAt: now.toISOString(),
    verificationEmailSentAt: now.toISOString(),
    emailVerificationExpiresAt: addHours(now, emailVerificationTtlHours()).toISOString(),
    emailVerifiedAt: null,
    approvedAt: null,
    adminApprovalExpiresAt: null,
    passwordSetupEmailSentAt: null,
    passwordSetupExpiresAt: null,
    usedAt: null,
    emailVerificationTokenHash: hashToken(emailVerificationToken),
    adminApprovalTokenHash: null,
    passwordSetupTokenHash: null,
  };
  requests.push(request);
  await saveSignupRequests(requests);
  return { request, created: true, emailVerificationToken };
}

async function createSignupRequest(input = {}, now = new Date()) {
  return withSignupRequestsLock(() => createSignupRequestUnlocked(input, now));
}

async function verifySignupEmailUnlocked(id, token, now = new Date()) {
  const requests = await loadSignupRequests();
  const request = requests.find((item) => item.id === id);
  if (!request) {
    const error = new Error("Signup request not found");
    error.code = "SIGNUP_REQUEST_NOT_FOUND";
    throw error;
  }
  if (request.status !== STATUS.PENDING_EMAIL || !tokenMatches(token, request.emailVerificationTokenHash)) {
    const error = new Error("Invalid verification token");
    error.code = "SIGNUP_VERIFICATION_INVALID";
    throw error;
  }
  if (isExpired(request.emailVerificationExpiresAt, now)) {
    const error = new Error("Verification token expired");
    error.code = "SIGNUP_VERIFICATION_EXPIRED";
    throw error;
  }
  const adminApprovalToken = createPlainToken();
  request.status = STATUS.VERIFIED;
  request.emailVerifiedAt = now.toISOString();
  request.emailVerificationTokenHash = null;
  request.adminApprovalTokenHash = hashApprovalToken(adminApprovalToken);
  request.adminApprovalExpiresAt = addHours(now, adminApprovalTtlHours()).toISOString();
  await saveSignupRequests(requests);
  return { ...request, adminApprovalToken };
}

async function verifySignupEmail(id, token, now = new Date()) {
  return withSignupRequestsLock(() => verifySignupEmailUnlocked(id, token, now));
}

async function rotateSignupApprovalTokenUnlocked(id, now = new Date()) {
  const requests = await loadSignupRequests();
  const request = requests.find((item) => item.id === id);
  if (!request) {
    const error = new Error("Signup request not found");
    error.code = "SIGNUP_REQUEST_NOT_FOUND";
    throw error;
  }
  if (request.status !== STATUS.VERIFIED) {
    const error = new Error("Signup request is not awaiting approval");
    error.code = "SIGNUP_REQUEST_NOT_VERIFIED";
    throw error;
  }

  const adminApprovalToken = createPlainToken();
  request.adminApprovalTokenHash = hashApprovalToken(adminApprovalToken);
  request.adminApprovalExpiresAt = addHours(now, adminApprovalTtlHours()).toISOString();
  await saveSignupRequests(requests);
  return { ...request, adminApprovalToken };
}

async function rotateSignupApprovalToken(id, now = new Date()) {
  return withSignupRequestsLock(() => rotateSignupApprovalTokenUnlocked(id, now));
}

function assertApprovalRequest(request, token, now = new Date()) {
  if (!request) {
    const error = new Error("Signup request not found");
    error.code = "SIGNUP_REQUEST_NOT_FOUND";
    throw error;
  }
  if (request.status === STATUS.PENDING_EMAIL) {
    const error = new Error("Signup request is not verified");
    error.code = "SIGNUP_REQUEST_NOT_VERIFIED";
    throw error;
  }
  if (request.status === STATUS.USED) {
    const error = new Error("Signup request has already been used");
    error.code = "SIGNUP_REQUEST_ALREADY_USED";
    throw error;
  }
  if (!approvalTokenMatches(token, request.adminApprovalTokenHash)) {
    const error = new Error("Invalid approval token");
    error.code = "SIGNUP_APPROVAL_TOKEN_INVALID";
    throw error;
  }
  if (isExpired(request.adminApprovalExpiresAt, now)) {
    const error = new Error("Approval token expired");
    error.code = "SIGNUP_APPROVAL_TOKEN_EXPIRED";
    throw error;
  }
  return request;
}

async function validateSignupApprovalToken(id, token, now = new Date()) {
  const requests = await loadSignupRequests();
  return assertApprovalRequest(requests.find((item) => item.id === id), token, now);
}

async function approveSignupRequestUnlocked(id, token, now = new Date()) {
  const requests = await loadSignupRequests();
  const request = assertApprovalRequest(requests.find((item) => item.id === id), token, now);

  const passwordSetupToken = createPlainToken();
  request.status = STATUS.APPROVED;
  request.approvedAt = request.approvedAt || now.toISOString();
  request.adminApprovalTokenHash = null;
  request.passwordSetupEmailSentAt = now.toISOString();
  request.passwordSetupExpiresAt = addHours(now, passwordSetupTtlHours()).toISOString();
  request.passwordSetupTokenHash = hashToken(passwordSetupToken);
  await saveSignupRequests(requests);
  return { request, passwordSetupToken };
}

async function approveSignupRequest(id, token, now = new Date()) {
  return withSignupRequestsLock(() => approveSignupRequestUnlocked(id, token, now));
}

async function rotateSignupPasswordSetupTokenUnlocked(id, now = new Date()) {
  const requests = await loadSignupRequests();
  const request = requests.find((item) => item.id === id);
  if (!request || request.status !== STATUS.APPROVED) {
    const error = new Error("Signup request is not approved for password setup");
    error.code = "SIGNUP_REQUEST_NOT_APPROVED";
    throw error;
  }

  const passwordSetupToken = createPlainToken();
  request.passwordSetupEmailSentAt = now.toISOString();
  request.passwordSetupExpiresAt = addHours(now, passwordSetupTtlHours()).toISOString();
  request.passwordSetupTokenHash = hashToken(passwordSetupToken);
  await saveSignupRequests(requests);
  return { request, passwordSetupToken };
}

async function rotateSignupPasswordSetupToken(id, now = new Date()) {
  return withSignupRequestsLock(() => rotateSignupPasswordSetupTokenUnlocked(id, now));
}

async function validatePasswordSetupToken(id, token, now = new Date()) {
  const requests = await loadSignupRequests();
  const request = requests.find((item) => item.id === id);
  if (!request || request.status !== STATUS.APPROVED) {
    const error = new Error("Signup request is not approved for password setup");
    error.code = "SIGNUP_REQUEST_NOT_APPROVED";
    throw error;
  }
  if (isExpired(request.passwordSetupExpiresAt, now)) {
    const error = new Error("Password setup token expired");
    error.code = "SIGNUP_PASSWORD_TOKEN_EXPIRED";
    throw error;
  }
  if (!tokenMatches(token, request.passwordSetupTokenHash)) {
    const error = new Error("Invalid password setup token");
    error.code = "SIGNUP_PASSWORD_TOKEN_INVALID";
    throw error;
  }
  return request;
}

async function consumeSignupRequestUnlocked(id, now = new Date()) {
  const requests = await loadSignupRequests();
  const request = requests.find((item) => item.id === id);
  if (!request || request.status !== STATUS.APPROVED) {
    const error = new Error("Signup request is not approved for password setup");
    error.code = "SIGNUP_REQUEST_NOT_APPROVED";
    throw error;
  }
  request.status = STATUS.USED;
  request.usedAt = now.toISOString();
  request.passwordSetupTokenHash = null;
  await saveSignupRequests(requests);
  return request;
}

async function consumeSignupRequest(id, now = new Date()) {
  return withSignupRequestsLock(() => consumeSignupRequestUnlocked(id, now));
}

async function purgeExpiredSignupRequests({ retentionDays = 30, now = new Date() } = {}) {
  const days = Number(retentionDays);
  if (!Number.isFinite(days) || days <= 0) throw new Error("retentionDays must be positive");
  return withSignupRequestsLock(async () => {
    const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
    const requests = await loadSignupRequests();
    const retained = requests.filter((request) => {
      const lifecycleDate = request.usedAt
        || request.passwordSetupExpiresAt
        || request.adminApprovalExpiresAt
        || request.emailVerificationExpiresAt
        || request.requestedAt;
      return !lifecycleDate || new Date(lifecycleDate).getTime() >= cutoff;
    });
    if (retained.length !== requests.length) await saveSignupRequests(retained);
    return { deleted: requests.length - retained.length, retained: retained.length };
  });
}

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.TRAINER_URL || "http://127.0.0.1:3137").replace(/\/$/, "");
}

function buildVerificationUrl(request, token) {
  const url = new URL(`${publicBaseUrl()}/api/signup-requests/${request.id}/verify`);
  url.searchParams.set("token", token);
  return url.toString();
}

function buildApprovalUrl(request, token = request.adminApprovalToken) {
  const url = new URL(`${publicBaseUrl()}/api/signup-requests/${request.id}/approve`);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

function buildPasswordSetupUrl(request, token) {
  const url = new URL(`${publicBaseUrl()}/set-password`);
  url.searchParams.set("id", request.id);
  url.searchParams.set("token", token);
  return url.toString();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function notificationTimeoutMs() {
  const value = Number(process.env.SIGNUP_NOTIFICATION_TIMEOUT_MS || 10000);
  return Number.isFinite(value) && value > 0 ? value : 10000;
}

async function withinNotificationTimeout(promise, code) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error("Signup notification delivery timed out");
      error.code = code;
      reject(error);
    }, notificationTimeoutMs());
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function notifyVerifiedSignupRequest(
  request,
  { fetchImpl = fetch, logger = console, mailer } = {},
) {
  const approvalEmail = String(process.env.SIGNUP_APPROVAL_EMAIL || "").trim();
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const approvalUrl = buildApprovalUrl(request);
  const text = [
    "New Tradesites AI Sales Trainer signup verified their email",
    `Email: ${request.email}`,
    request.name ? `Name: ${request.name}` : null,
    request.company ? `Company: ${request.company}` : null,
  ].filter(Boolean).join("\n");

  let emailFailed = false;
  if (approvalEmail) {
    const deliverEmail = mailer || require("./email").sendEmail;
    try {
      await withinNotificationTimeout(deliverEmail({
        to: approvalEmail,
        subject: "Sales Trainer signup awaiting approval",
        text: [
          text,
          `Approval link expires: ${request.adminApprovalExpiresAt}`,
          "",
          "Approve this account:",
          approvalUrl,
        ].join("\n"),
        html: [
          "<p>New Tradesites AI Sales Trainer signup verified their email.</p>",
          `<p><strong>Email:</strong> ${escapeHtml(request.email)}<br>`,
          request.name ? `<strong>Name:</strong> ${escapeHtml(request.name)}<br>` : "",
          request.company ? `<strong>Company:</strong> ${escapeHtml(request.company)}` : "",
          "</p>",
          `<p>Approval link expires: ${escapeHtml(request.adminApprovalExpiresAt)}</p>`,
          `<p><a href="${escapeHtml(approvalUrl)}">Approve account</a></p>`,
        ].join(""),
      }), "SIGNUP_APPROVAL_EMAIL_TIMEOUT");
      return { sent: true, channel: "email" };
    } catch (error) {
      emailFailed = true;
      const reportFailure = logger.warn || logger.error;
      reportFailure?.call(logger, {
        event: "signup_approval_email_failed",
        requestId: request.id,
        code: error.code || "EMAIL_DELIVERY_FAILED",
        fallbackConfigured: Boolean(botToken && chatId),
      });
      if (!botToken || !chatId) throw error;
    }
  }

  if (!botToken || !chatId) {
    logger.info?.({
      event: "signup_approval_notification_disabled",
      requestId: request.id,
    });
    return { sent: false, channel: "disabled" };
  }

  const response = await withinNotificationTimeout(fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [[{ text: "Approve account", url: approvalUrl }]],
      },
    }),
  }), "TELEGRAM_NOTIFY_TIMEOUT");
  if (!response.ok) {
    const error = new Error("Telegram notification failed");
    error.code = "TELEGRAM_NOTIFY_FAILED";
    error.status = response.status;
    throw error;
  }
  return { sent: true, channel: emailFailed ? "telegram_fallback" : "telegram" };
}

module.exports = {
  STATUS,
  approveSignupRequest,
  buildApprovalUrl,
  buildPasswordSetupUrl,
  buildVerificationUrl,
  consumeSignupRequest,
  createSignupRequest,
  loadSignupRequests,
  notifyVerifiedSignupRequest,
  purgeExpiredSignupRequests,
  rotateSignupApprovalToken,
  rotateSignupPasswordSetupToken,
  normalizeEmail,
  validatePasswordSetupToken,
  validateSignupApprovalToken,
  verifySignupEmail,
};
