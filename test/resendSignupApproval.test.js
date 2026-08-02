const assert = require("node:assert/strict");
const { test } = require("node:test");
const { main, requestedEmail } = require("../scripts/resend-signup-approval");
const {
  main: resendPasswordSetup,
} = require("../scripts/resend-signup-password");

test("resend approval command accepts an explicit email flag", () => {
  assert.equal(requestedEmail(["--email", " Rep@Example.com "]), "rep@example.com");
});

test("password resend command rotates and sends without printing its secret", async () => {
  const output = [];
  const request = {
    id: "request-2",
    email: "rep@example.com",
    status: "approved_pending_password",
  };

  await resendPasswordSetup(["--email", request.email], {
    loadSignupRequests: async () => [request],
    rotateSignupPasswordSetupToken: async () => ({
      request,
      passwordSetupToken: "do-not-print-password-token",
    }),
    mailer: async (message) => {
      assert.equal(message.to, request.email);
      assert.match(message.text, /do-not-print-password-token/);
      return { sent: true, channel: "smtp" };
    },
    stdout: { write: (value) => output.push(value) },
  });

  const rendered = output.join("");
  assert.match(rendered, /"requestId":"request-2"/);
  assert.doesNotMatch(rendered, /do-not-print-password-token/);
  assert.doesNotMatch(rendered, /token=/);
});

test("password resend ignores a retained used request when one approved request is active", async () => {
  const output = [];
  const historical = {
    id: "request-used",
    email: "rep@example.com",
    status: "used",
  };
  const active = {
    id: "request-approved",
    email: "rep@example.com",
    status: "approved_pending_password",
  };
  let rotatedId;

  await resendPasswordSetup(["--email", active.email], {
    loadSignupRequests: async () => [historical, active],
    rotateSignupPasswordSetupToken: async (id) => {
      rotatedId = id;
      return { request: active, passwordSetupToken: "replacement-password-token" };
    },
    mailer: async () => ({ sent: true, channel: "smtp" }),
    stdout: { write: (value) => output.push(value) },
  });

  assert.equal(rotatedId, active.id);
  assert.match(output.join(""), /"requestId":"request-approved"/);
});

test("resend approval command rotates and sends without printing the approval secret", async () => {
  const output = [];
  const request = {
    id: "request-1",
    email: "rep@example.com",
    status: "verified_pending_approval",
  };

  await main(["--email", request.email], {
    env: { SIGNUP_APPROVAL_EMAIL: "owner@example.com" },
    loadSignupRequests: async () => [request],
    rotateSignupApprovalToken: async (id) => ({
      ...request,
      id,
      adminApprovalToken: "do-not-print-this-token",
    }),
    notifyVerifiedSignupRequest: async (rotated) => {
      assert.equal(rotated.adminApprovalToken, "do-not-print-this-token");
      return { sent: true, channel: "email" };
    },
    stdout: { write: (value) => output.push(value) },
  });

  const rendered = output.join("");
  assert.match(rendered, /"channel":"email"/);
  assert.match(rendered, /"requestId":"request-1"/);
  assert.doesNotMatch(rendered, /do-not-print-this-token/);
  assert.doesNotMatch(rendered, /token=/);
});

test("resend approval command fails closed for duplicate applicant records", async () => {
  const duplicate = {
    id: "request-duplicate",
    email: "rep@example.com",
    status: "verified_pending_approval",
  };

  await assert.rejects(() => main(["--email", duplicate.email], {
    env: { SIGNUP_APPROVAL_EMAIL: "owner@example.com" },
    loadSignupRequests: async () => [duplicate, { ...duplicate, id: "another-request" }],
  }), /exactly one verified signup request/);
});

test("approval resend ignores a retained used request when one verified request is active", async () => {
  const historical = {
    id: "request-used",
    email: "rep@example.com",
    status: "used",
  };
  const active = {
    id: "request-verified",
    email: "rep@example.com",
    status: "verified_pending_approval",
  };
  let rotatedId;

  await main(["--email", active.email], {
    env: { SIGNUP_APPROVAL_EMAIL: "owner@example.com" },
    loadSignupRequests: async () => [historical, active],
    rotateSignupApprovalToken: async (id) => {
      rotatedId = id;
      return { ...active, adminApprovalToken: "replacement-approval-token" };
    },
    notifyVerifiedSignupRequest: async () => ({ sent: true, channel: "email" }),
    stdout: { write: () => {} },
  });

  assert.equal(rotatedId, active.id);
});

test("resend approval command supports a Telegram-only notification configuration", async () => {
  const request = {
    id: "telegram-request",
    email: "rep@example.com",
    status: "verified_pending_approval",
  };
  const output = [];

  await main(["--email", request.email], {
    env: { TELEGRAM_BOT_TOKEN: "bot-token", TELEGRAM_CHAT_ID: "chat-id" },
    loadSignupRequests: async () => [request],
    rotateSignupApprovalToken: async () => ({ ...request, adminApprovalToken: "secret" }),
    notifyVerifiedSignupRequest: async () => ({ sent: true, channel: "telegram" }),
    stdout: { write: (value) => output.push(value) },
  });

  assert.match(output.join(""), /"channel":"telegram"/);
  assert.doesNotMatch(output.join(""), /secret/);
});
