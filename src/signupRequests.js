const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { getDataDir } = require("./store");

const STATUS = {
  PENDING_EMAIL: "pending_email_verification",
  VERIFIED: "verified_pending_approval",
  APPROVED: "approved_pending_password",
  USED: "used",
};

function requestsPath() {
  return path.join(getDataDir(), "signup-requests.json");
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
  await fs.mkdir(getDataDir(), { recursive: true });
  const target = requestsPath();
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify({ schemaVersion: 1, requests }, null, 2)}\n`);
  await fs.rename(temp, target);
}

function assertValidEmail(email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("A valid email is required");
    error.code = "SIGNUP_REQUEST_EMAIL_REQUIRED";
    throw error;
  }
}

async function createSignupRequest(input = {}, now = new Date()) {
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

async function verifySignupEmail(id, token, now = new Date()) {
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

async function approveSignupRequest(id, token, now = new Date()) {
  const requests = await loadSignupRequests();
  const request = requests.find((item) => item.id === id);
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

async function consumeSignupRequest(id, now = new Date()) {
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

async function notifyVerifiedSignupRequest(request, { fetchImpl = fetch, logger = console } = {}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const approvalUrl = buildApprovalUrl(request);
  const text = [
    "New Tradesites AI Sales Trainer signup verified their email",
    `Email: ${request.email}`,
    request.name ? `Name: ${request.name}` : null,
    request.company ? `Company: ${request.company}` : null,
  ].filter(Boolean).join("\n");

  if (!botToken || !chatId) {
    logger.info?.(`${text}\nTelegram approval notifications are not configured.`);
    return { sent: false, channel: "disabled" };
  }

  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [[{ text: "Approve account", url: approvalUrl }]],
      },
    }),
  });
  if (!response.ok) {
    const error = new Error("Telegram notification failed");
    error.code = "TELEGRAM_NOTIFY_FAILED";
    error.status = response.status;
    throw error;
  }
  return { sent: true, channel: "telegram", approvalUrl };
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
  normalizeEmail,
  validatePasswordSetupToken,
  verifySignupEmail,
};
