function mailFrom() {
  return process.env.MAIL_FROM || "";
}

function validateEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = mailFrom();
  if (!apiKey) {
    const error = new Error("RESEND_API_KEY is required for email delivery");
    error.code = "EMAIL_DELIVERY_NOT_CONFIGURED";
    throw error;
  }
  if (!from) {
    const error = new Error("MAIL_FROM is required for email delivery");
    error.code = "EMAIL_FROM_REQUIRED";
    throw error;
  }
  return { apiKey, from };
}

async function sendEmail(message, { fetchImpl = fetch } = {}) {
  const { apiKey, from: configuredFrom } = validateEmailConfig();
  const from = message.from || configuredFrom;
  const payload = {
    from,
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

module.exports = {
  sendEmail,
  validateEmailConfig,
};
