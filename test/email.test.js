const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const { parseSender, sendEmail } = require("../src/email");

let previousBrevoApiKey;
let previousResendApiKey;
let previousMailFrom;

beforeEach(() => {
  previousBrevoApiKey = process.env.BREVO_API_KEY;
  previousResendApiKey = process.env.RESEND_API_KEY;
  previousMailFrom = process.env.MAIL_FROM;
  delete process.env.BREVO_API_KEY;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
});

afterEach(() => {
  if (previousBrevoApiKey === undefined) {
    delete process.env.BREVO_API_KEY;
  } else {
    process.env.BREVO_API_KEY = previousBrevoApiKey;
  }
  if (previousResendApiKey === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = previousResendApiKey;
  }
  if (previousMailFrom === undefined) {
    delete process.env.MAIL_FROM;
  } else {
    process.env.MAIL_FROM = previousMailFrom;
  }
});

test("sendEmail fails closed when no email provider is configured", async () => {
  await assert.rejects(
    () => sendEmail({
      to: "rep@example.com",
      subject: "Verify",
      text: "Verify link",
    }),
    (error) => error.code === "EMAIL_DELIVERY_NOT_CONFIGURED",
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
