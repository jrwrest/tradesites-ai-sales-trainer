const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const { parseSender, sendEmail } = require("../src/email");

let previousBrevoApiKey;
let previousResendApiKey;
let previousMailFrom;
let previousSmtpHost;
let previousSmtpPort;
let previousSmtpUser;
let previousSmtpPass;
let previousSmtpFrom;
let previousSmtpFromName;

beforeEach(() => {
  previousBrevoApiKey = process.env.BREVO_API_KEY;
  previousResendApiKey = process.env.RESEND_API_KEY;
  previousMailFrom = process.env.MAIL_FROM;
  previousSmtpHost = process.env.SMTP_HOST;
  previousSmtpPort = process.env.SMTP_PORT;
  previousSmtpUser = process.env.SMTP_USER;
  previousSmtpPass = process.env.SMTP_PASS;
  previousSmtpFrom = process.env.SMTP_FROM;
  previousSmtpFromName = process.env.SMTP_FROM_NAME;
  delete process.env.BREVO_API_KEY;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;
  delete process.env.SMTP_FROM_NAME;
});

afterEach(() => {
  for (const [name, value] of [
    ["BREVO_API_KEY", previousBrevoApiKey],
    ["RESEND_API_KEY", previousResendApiKey],
    ["MAIL_FROM", previousMailFrom],
    ["SMTP_HOST", previousSmtpHost],
    ["SMTP_PORT", previousSmtpPort],
    ["SMTP_USER", previousSmtpUser],
    ["SMTP_PASS", previousSmtpPass],
    ["SMTP_FROM", previousSmtpFrom],
    ["SMTP_FROM_NAME", previousSmtpFromName],
  ]) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

test("sendEmail fails closed when no email provider is configured", async () => {
  await assert.rejects(
    () => sendEmail({
      to: "rep@example.com",
      subject: "Verify",
      text: "Verify link",
    }),
    (error) => ["EMAIL_DELIVERY_NOT_CONFIGURED", "EMAIL_FROM_REQUIRED"].includes(error.code),
  );
});

test("sendEmail posts to Brevo when configured", async () => {
  process.env.BREVO_API_KEY = "brevo-secret";
  process.env.MAIL_FROM = "Tradesites AI Sales Trainer <trainer@example.com>";
  const calls = [];

  const result = await sendEmail(
    {
      to: "rep@example.com",
      subject: "Verify",
      text: "Verify link",
      html: "<p>Verify link</p>",
    },
    {
      fetchImpl: async (url, options) => {
        calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
        return { ok: true, json: async () => ({ messageId: "brevo-message-id" }) };
      },
    },
  );

  assert.deepEqual(result, { sent: true, channel: "brevo", id: "brevo-message-id" });
  assert.equal(calls[0].url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(calls[0].headers["api-key"], "brevo-secret");
  assert.deepEqual(calls[0].body, {
    sender: { email: "trainer@example.com", name: "Tradesites AI Sales Trainer" },
    to: [{ email: "rep@example.com" }],
    subject: "Verify",
    textContent: "Verify link",
    htmlContent: "<p>Verify link</p>",
  });
});

test("SMTP config is valid with Brevo relay env", async () => {
  process.env.SMTP_HOST = "smtp-relay.example.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "smtp-user";
  process.env.SMTP_PASS = "smtp-pass";
  process.env.SMTP_FROM = "noreply@example.com";
  process.env.SMTP_FROM_NAME = "Tradesites AI Sales Trainer";

  const { validateEmailConfig } = require("../src/email");
  assert.deepEqual(validateEmailConfig(), {
    provider: "smtp",
    from: "Tradesites AI Sales Trainer <noreply@example.com>",
  });
});

test("SMTP config fails closed without SMTP credentials", async () => {
  process.env.SMTP_HOST = "smtp-relay.example.com";
  process.env.SMTP_FROM = "noreply@example.com";

  const { validateEmailConfig } = require("../src/email");
  assert.throws(
    () => validateEmailConfig(),
    (error) => error.code === "EMAIL_DELIVERY_NOT_CONFIGURED",
  );
});

test("sendEmail posts to Resend when configured", async () => {
  process.env.RESEND_API_KEY = "resend-secret";
  process.env.MAIL_FROM = "Trainer <trainer@example.com>";
  const calls = [];

  const result = await sendEmail(
    {
      to: "rep@example.com",
      subject: "Verify",
      text: "Verify link",
    },
    {
      fetchImpl: async (url, options) => {
        calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
        return { ok: true, json: async () => ({ id: "email-id" }) };
      },
    },
  );

  assert.deepEqual(result, { sent: true, channel: "resend", id: "email-id" });
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].headers.Authorization, "Bearer resend-secret");
  assert.deepEqual(calls[0].body, {
    from: "Trainer <trainer@example.com>",
    to: "rep@example.com",
    subject: "Verify",
    text: "Verify link",
  });
});

test("parseSender supports bare and named sender addresses", () => {
  assert.deepEqual(parseSender("trainer@example.com"), {
    email: "trainer@example.com",
  });
  assert.deepEqual(parseSender("Tradesites AI Sales Trainer <trainer@example.com>"), {
    email: "trainer@example.com",
    name: "Tradesites AI Sales Trainer",
  });
});
