const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
const {
  buildApprovalUrl,
  createAccessRequest,
  notifyAccessRequest,
} = require("../src/accessRequests");

let previousDataDir;
let previousPublicBaseUrl;
let previousApprovalToken;
let previousTelegramBotToken;
let previousTelegramChatId;
let tempDataDir;

beforeEach(async () => {
  previousDataDir = process.env.DATA_DIR;
  previousPublicBaseUrl = process.env.PUBLIC_BASE_URL;
  previousApprovalToken = process.env.ACCESS_APPROVAL_TOKEN;
  previousTelegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  previousTelegramChatId = process.env.TELEGRAM_CHAT_ID;
  tempDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tradesites-access-test-"));
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
  ]) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  await fs.rm(tempDataDir, { recursive: true, force: true });
});

test("access requests are deduplicated by email and approval links include the secret token", async () => {
  const first = await createAccessRequest({ email: "Rep@Example.com", name: "Rep" });
  const second = await createAccessRequest({ email: "rep@example.com" });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.request.id, second.request.id);
  assert.equal(first.request.email, "rep@example.com");
  assert.equal(
    buildApprovalUrl(first.request),
    `https://trainer.example.test/api/access-requests/${first.request.id}/approve?token=approval-secret`,
  );
});

test("telegram notification sends an approval button when configured", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "bot-token";
  process.env.TELEGRAM_CHAT_ID = "chat-id";
  const { request } = await createAccessRequest({
    email: "rep@example.com",
    name: "Rep",
    company: "BrightTrade Solar",
  });
  const calls = [];

  const result = await notifyAccessRequest(request, {
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true };
    },
  });

  assert.equal(result.sent, true);
  assert.equal(result.channel, "telegram");
  assert.equal(calls[0].url, "https://api.telegram.org/botbot-token/sendMessage");
  assert.equal(calls[0].body.chat_id, "chat-id");
  assert.match(calls[0].body.text, /rep@example\.com/);
  assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].text, "Approve access");
  assert.match(calls[0].body.reply_markup.inline_keyboard[0][0].url, /approval-secret/);
});
