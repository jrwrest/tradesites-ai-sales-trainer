const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const { sendEmail } = require("../src/email");

let previousResendApiKey;
let previousMailFrom;

beforeEach(() => {
  previousResendApiKey = process.env.RESEND_API_KEY;
  previousMailFrom = process.env.MAIL_FROM;
});

afterEach(() => {
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

test("sendEmail fails closed when Resend is not configured", async () => {
  delete process.env.RESEND_API_KEY;

  await assert.rejects(
    () => sendEmail({
      to: "rep@example.com",
      subject: "Verify",
      text: "Verify link",
    }),
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
