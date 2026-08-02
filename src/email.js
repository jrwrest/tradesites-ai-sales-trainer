const nodemailer = require("nodemailer");

function mailFrom() {
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  if (process.env.SMTP_FROM_NAME && process.env.SMTP_FROM) {
    return `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM}>`;
  }
  return process.env.SMTP_FROM || "";
}

function emailDeliveryTimeoutMs() {
  const value = Number(process.env.EMAIL_DELIVERY_TIMEOUT_MS || 10000);
  return Number.isFinite(value) && value > 0 ? value : 10000;
}

function validateEmailConfig() {
  const smtpHost = process.env.SMTP_HOST;
  const brevoApiKey = process.env.BREVO_API_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = mailFrom();
  if (!from) {
    const error = new Error("MAIL_FROM is required for email delivery");
    error.code = "EMAIL_FROM_REQUIRED";
    throw error;
  }
  if (smtpHost) {
    const missing = [];
    if (!process.env.SMTP_USER) missing.push("SMTP_USER");
    if (!process.env.SMTP_PASS) missing.push("SMTP_PASS");
    if (missing.length) {
      const error = new Error(`${missing.join(", ")} required for SMTP email delivery`);
      error.code = "EMAIL_DELIVERY_NOT_CONFIGURED";
      throw error;
    }
    return { provider: "smtp", from };
  }
  if (!brevoApiKey && !resendApiKey) {
    const error = new Error("SMTP_HOST, BREVO_API_KEY, or RESEND_API_KEY is required for email delivery");
    error.code = "EMAIL_DELIVERY_NOT_CONFIGURED";
    throw error;
  }
  return brevoApiKey
    ? { provider: "brevo", apiKey: brevoApiKey, from }
    : { provider: "resend", apiKey: resendApiKey, from };
}

async function sendEmail(message, { fetchImpl = fetch } = {}) {
  const { provider, apiKey, from: configuredFrom } = validateEmailConfig();
  const from = message.from || configuredFrom;
  try {
    if (provider === "smtp") return await sendSmtpEmail({ ...message, from });
    if (provider === "brevo") {
      return await sendBrevoEmail({ ...message, from }, { apiKey, fetchImpl });
    }
    return await sendResendEmail({ ...message, from }, { apiKey, fetchImpl });
  } catch (error) {
    if (error.code === "EMAIL_DELIVERY_FAILED") throw error;
    const deliveryError = new Error("Email delivery failed");
    deliveryError.code = "EMAIL_DELIVERY_FAILED";
    throw deliveryError;
  }
}

async function sendSmtpEmail(message) {
  const timeoutMs = emailDeliveryTimeoutMs();
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  });
  try {
    const info = await transporter.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { sent: true, channel: "smtp", id: info.messageId };
  } catch (error) {
    error.code = "EMAIL_DELIVERY_FAILED";
    throw error;
  }
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
    signal: AbortSignal.timeout(emailDeliveryTimeoutMs()),
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
    signal: AbortSignal.timeout(emailDeliveryTimeoutMs()),
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
  sendSmtpEmail,
  validateEmailConfig,
};
