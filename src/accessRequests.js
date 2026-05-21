const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { getDataDir } = require("./store");

function requestsPath() {
  return path.join(getDataDir(), "access-requests.json");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function cleanText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

async function loadAccessRequests() {
  try {
    const raw = await fs.readFile(requestsPath(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.requests) ? parsed.requests : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    error.code = "ACCESS_REQUESTS_READ_FAILED";
    throw error;
  }
}

async function saveAccessRequests(requests) {
  await fs.mkdir(getDataDir(), { recursive: true });
  const target = requestsPath();
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify({ schemaVersion: 1, requests }, null, 2)}\n`);
  await fs.rename(temp, target);
}

async function createAccessRequest(input = {}, now = new Date()) {
  const email = normalizeEmail(input.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("A valid email is required");
    error.code = "ACCESS_REQUEST_EMAIL_REQUIRED";
    throw error;
  }

  const requests = await loadAccessRequests();
  const existing = requests.find((request) => request.email === email && request.status !== "used");
  if (existing) {
    return { request: existing, created: false };
  }

  const request = {
    id: crypto.randomUUID(),
    email,
    name: cleanText(input.name, 120),
    company: cleanText(input.company, 160),
    message: cleanText(input.message, 500),
    status: "pending",
    requestedAt: now.toISOString(),
    approvedAt: null,
    usedAt: null,
  };
  requests.push(request);
  await saveAccessRequests(requests);
  return { request, created: true };
}

async function approveAccessRequest(id, now = new Date()) {
  const requests = await loadAccessRequests();
  const request = requests.find((item) => item.id === id);
  if (!request) {
    const error = new Error("Access request not found");
    error.code = "ACCESS_REQUEST_NOT_FOUND";
    throw error;
  }
  if (request.status === "pending") {
    request.status = "approved";
    request.approvedAt = now.toISOString();
    await saveAccessRequests(requests);
  }
  return request;
}

async function consumeApprovedAccess(email, now = new Date()) {
  const normalizedEmail = normalizeEmail(email);
  const requests = await loadAccessRequests();
  const request = requests.find(
    (item) => item.email === normalizedEmail && item.status === "approved",
  );
  if (!request) return null;
  request.status = "used";
  request.usedAt = now.toISOString();
  await saveAccessRequests(requests);
  return request;
}

async function isEmailApproved(email) {
  const normalizedEmail = normalizeEmail(email);
  const requests = await loadAccessRequests();
  return requests.some((request) => request.email === normalizedEmail && request.status === "approved");
}

function approvalToken() {
  return process.env.ACCESS_APPROVAL_TOKEN || "";
}

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.TRAINER_URL || "http://127.0.0.1:3137").replace(/\/$/, "");
}

function buildApprovalUrl(request) {
  const token = approvalToken();
  const url = new URL(`${publicBaseUrl()}/api/access-requests/${request.id}/approve`);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

async function notifyAccessRequest(request, { fetchImpl = fetch, logger = console } = {}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const approvalUrl = buildApprovalUrl(request);
  const text = [
    "New Tradesites AI Sales Trainer access request",
    `Email: ${request.email}`,
    request.name ? `Name: ${request.name}` : null,
    request.company ? `Company: ${request.company}` : null,
    request.message ? `Message: ${request.message}` : null,
  ].filter(Boolean).join("\n");

  if (!botToken || !chatId) {
    logger.info?.(`${text}\nApprove: ${approvalUrl}`);
    return { sent: false, channel: "log", approvalUrl };
  }

  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [[{ text: "Approve access", url: approvalUrl }]],
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
  approveAccessRequest,
  buildApprovalUrl,
  consumeApprovedAccess,
  createAccessRequest,
  isEmailApproved,
  loadAccessRequests,
  notifyAccessRequest,
  normalizeEmail,
};
