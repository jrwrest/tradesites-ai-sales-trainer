function mailFrom() {
  return process.env.MAIL_FROM || "";
}

function validateEmailConfig() {
  const brevoApiKey = process.env.BREVO_API_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = mailFrom();
  if (!brevoApiKey && !resendApiKey) {
    const error = new Error("BREVO_API_KEY or RESEND_API_KEY is required for email delivery");
    error.code = "EMAIL_DELIVERY_NOT_CONFIGURED";
    throw error;
  }
  if (!from) {
    const error = new Error("MAIL_FROM is required for email delivery");
    error.code = "EMAIL_FROM_REQUIRED";
    throw error;
  }
  return brevoApiKey
    ? { provider: "brevo", apiKey: brevoApiKey, from }
    : { provider: "resend", apiKey: resendApiKey, from };
}

async function sendEmail(message, { fetchImpl = fetch } = {}) {
  const { provider, apiKey, from: configuredFrom } = validateEmailConfig();
  const from = message.from || configuredFrom;
  if (provider === "brevo") return sendBrevoEmail({ ...message, from }, { apiKey, fetchImpl });
  return sendResendEmail({ ...message, from }, { apiKey, fetchImpl });
}

async function sendBrevoEmail(message, { apiKey, fetchImpl }) {
  const payload = {
    sender: parseSender(message.from),
    to: [{ email: message.to }],
    subject: message.subject,
    textContent: message.text,
    ...(message.html ? { htmlContent: message.html } : {}),
  };

  const response = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Email delivery failed");
    error.code = "EMAIL_DELIVERY_FAILED";
    error.status = response.status;
    error.payload = body;
    throw error;
  }
  return { sent: true, channel: "brevo", id: body.messageId };
}

async function sendResendEmail(message, { apiKey, fetchImpl }) {
  const payload = {
    from: message.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
  };

  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Email delivery failed");
    error.code = "EMAIL_DELIVERY_FAILED";
    error.status = response.status;
    error.payload = body;
    throw error;
  }
  return { sent: true, channel: "resend", id: body.id };
}

function parseSender(value) {
  const trimmed = String(value || "").trim();
  const match = /^(.*)<([^<>]+)>$/.exec(trimmed);
  if (!match) return { email: trimmed };
  const name = match[1].trim().replace(/^"|"$/g, "");
  return {
    email: match[2].trim(),
    ...(name ? { name } : {}),
  };
}

module.exports = {
  parseSender,
  sendEmail,
  validateEmailConfig,
};
